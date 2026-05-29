'use client'

// DocEditorClient.tsx
//
// Full document editing experience: Yjs + Tiptap + Axiom UI + Gemini AI.
//
// ── AI suggestion flow (streaming) ───────────────────────────────────────────
//
//   1. User selects text → floating toolbar shows "✦ Improve" button.
//   2. Click captures { from, to, selectedText } synchronously before awaiting.
//   3. streamSuggestion() opens an SSE fetch to POST /api/ai/improve.
//        • Gemini API key lives only on the server (lib/ai/provider.ts).
//        • First chunk:  delete(original) + insert(chunk) + addMark — one PM tx.
//        • Each chunk:   findSuggestionRange → insertText + addMark — one PM tx.
//        • Each PM tx → one Yjs op → all peers see tokens materialize in real time.
//   4. AISidebar shows a StreamingCard (blinking cursor) while status='streaming'.
//      On completion it becomes a SuggestionCard (diff view) with status='pending'.
//   5a. Accept: remove mark, keep text, set status 'accepted' in Y.Map.
//   5b. Reject (any time, even mid-stream): abort fetch, restore original atomically.
//
// ── Yjs data structures ───────────────────────────────────────────────────────
//
//   XmlFragment 'default'    — document text (marks auto-synced by y-prosemirror)
//   Map        'comments'    — comment threads (useComments)
//   Map        'suggestions' — AI suggestion metadata (useAISuggestions)
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import { Extension } from '@tiptap/core'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

import { usePresence } from '@/app/editor/usePresence'
import { PresenceBar } from '@/app/editor/PresenceBar'
import { useComments } from '@/app/editor/useComments'
import { CommentsPanel } from '@/app/editor/CommentsPanel'
import { buildCommentDecorationPlugin } from '@/app/editor/commentDecorationPlugin'
import { useAISuggestions } from '@/app/editor/useAISuggestions'
import { AISuggestionExtension } from '@/components/editor/AISuggestionExtension'
import { AISidebar } from '@/components/editor/AISidebar'
import { DocumentEditor } from '@/components/editor/DocumentEditor'
import { FormatToolbar } from '@/components/editor/FormatToolbar'
import type { ProposalStatus } from '@/lib/tokens'
import { colors } from '@/lib/tokens'

// ── Per-document Yjs singletons ────────────────────────────────────────────────

const _instances = new Map<string, { ydoc: Y.Doc; provider: WebsocketProvider }>()

function getInstance(docId: string) {
  if (!_instances.has(docId)) {
    const ydoc = new Y.Doc()
    const provider = new WebsocketProvider(
      'ws://localhost:1234',
      `pitchpad-doc-${docId}`,
      ydoc
    )
    _instances.set(docId, { ydoc, provider })
  }
  return _instances.get(docId)!
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DocEditorClient({ docId }: { docId: string }) {
  const { ydoc, provider } = getInstance(docId)

  const fragment  = useMemo(() => ydoc.getXmlFragment('default'), [ydoc])
  const commentsMap = useMemo((): Y.Map<Y.Map<any>> => ydoc.getMap('comments'), [ydoc])

  const CommentDecoExtension = useMemo(
    () =>
      Extension.create({
        name: 'commentDecorations',
        addProseMirrorPlugins() {
          return [buildCommentDecorationPlugin(ydoc, fragment, commentsMap)]
        },
      }),
    [ydoc, fragment, commentsMap]
  )

  // ── Hooks ──────────────────────────────────────────────────────────────────
  const { localUser, peers } = usePresence(provider)
  const { comments, addComment, addReply, resolveComment } = useComments(ydoc)
  const { suggestions, streamSuggestion, acceptSuggestion, rejectSuggestion } =
    useAISuggestions(ydoc, fragment, docId)

  // ── Local UI state ─────────────────────────────────────────────────────────
  const [activeCommentId, setActiveCommentId]     = useState<string | null>(null)
  const [showCommentInput, setShowCommentInput]   = useState(false)
  const [commentDraft, setCommentDraft]           = useState('')
  const [floatPos, setFloatPos]                   = useState<{ top: number; left: number } | null>(null)
  const pendingRange = useRef<{ from: number; to: number } | null>(null)

  const [aiSidebarOpen, setAiSidebarOpen]           = useState(false)
  const [activeSuggestionId, setActiveSuggestionId] = useState<string | null>(null)
  const [aiError, setAiError]                       = useState<string | null>(null)

  const [docTitle, setDocTitle]   = useState('Untitled Proposal')
  const [docStatus]               = useState<ProposalStatus>('draft')

  // ── Tiptap editor ──────────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: false }),
      Collaboration.configure({ document: ydoc }),
      CollaborationCursor.configure({
        provider,
        user: localUser,
        render(user: { name: string; color: string }) {
          const wrap = document.createElement('span')
          wrap.style.cssText = [
            `border-left: 2px solid ${user.color}`,
            'margin-left: -1px',
            'position: relative',
            'display: inline-block',
            'height: 1em',
            'vertical-align: text-top',
          ].join(';')
          const label = document.createElement('span')
          label.textContent = user.name
          label.style.cssText = [
            'position: absolute',
            'bottom: 100%',
            'left: -1px',
            'font-size: 11px',
            'font-family: monospace',
            'font-weight: 700',
            'color: #fff',
            `background: ${user.color}`,
            'padding: 1px 5px',
            'border-radius: 3px 3px 3px 0',
            'white-space: nowrap',
            'pointer-events: none',
            'user-select: none',
            'line-height: 1.4',
          ].join(';')
          wrap.appendChild(label)
          return wrap
        },
      }),
      AISuggestionExtension,
      CommentDecoExtension,
    ],

    autofocus: true,

    onSelectionUpdate({ editor }) {
      const { from, to } = editor.state.selection
      if (from !== to) {
        const coords = editor.view.coordsAtPos(from)
        setFloatPos({ top: coords.top - 42, left: coords.left })
      } else {
        setFloatPos(null)
      }
    },
  })

  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      editor.chain().updateUser(localUser).run()
    }
  }, [editor, localUser])

  // ── Comment handlers ───────────────────────────────────────────────────────

  const handleAddCommentClick = useCallback(() => {
    if (!editor) return
    const { from, to } = editor.state.selection
    if (from === to) return
    pendingRange.current = { from, to }
    setCommentDraft('')
    setShowCommentInput(true)
  }, [editor])

  const handleSubmitComment = useCallback(() => {
    if (!editor || !commentDraft.trim() || !pendingRange.current) return
    const { from, to } = pendingRange.current
    const newId = addComment(editor, commentDraft, localUser, from, to)
    setCommentDraft('')
    setShowCommentInput(false)
    setFloatPos(null)
    pendingRange.current = null
    if (newId) {
      setActiveCommentId(newId)
      requestAnimationFrame(() => {
        document.getElementById(`comment-${newId}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        })
      })
    }
  }, [editor, commentDraft, addComment, localUser])

  // ── AI Improve handler ─────────────────────────────────────────────────────
  //
  // Captures selection BEFORE streaming starts — the editor selection may
  // change while Gemini is generating. The stream itself mutates the document
  // chunk-by-chunk via PM transactions → y-prosemirror → Yjs, so every peer
  // sees tokens materialise in real time.

  const handleImprove = useCallback(async () => {
    if (!editor) return
    const { from, to } = editor.state.selection
    if (from === to) return

    const selectedText = editor.state.doc.textBetween(from, to, ' ')
    if (!selectedText.trim()) return

    const id = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    setAiError(null)
    setAiSidebarOpen(true)   // open sidebar so streaming card is visible
    setActiveSuggestionId(id)

    try {
      await streamSuggestion(editor, id, selectedText, from, to)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setAiError(msg)
      console.error('[AI improve]', msg)
    }
  }, [editor, streamSuggestion])

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!editor) return null

  const hasSelection = editor.state.selection.from !== editor.state.selection.to

  return (
    <>
      <DocumentEditor
        title={docTitle}
        status={docStatus}
        breadcrumb={['Proposals', docTitle]}
        presence={<PresenceBar localUser={localUser} peers={peers} />}
        aiSidebarOpen={aiSidebarOpen}
        onToggleAiSidebar={() => setAiSidebarOpen((o) => !o)}
        aiSidebar={
          <AISidebar
            suggestions={suggestions}
            activeSuggestionId={activeSuggestionId}
            onSetActive={setActiveSuggestionId}
            onAccept={(id) => acceptSuggestion(editor, id)}
            onReject={(id) => rejectSuggestion(editor, id)}
            isOpen={aiSidebarOpen}
          />
        }
        toolbar={<FormatToolbar editor={editor} />}
        onTitleChange={setDocTitle}
      >
        <EditorContent editor={editor} />
      </DocumentEditor>

      {/* ── Floating action bar ──────────────────────────────────────────────── */}
      {floatPos && !showCommentInput && hasSelection && (
        <div
          style={{
            position: 'fixed',
            top: floatPos.top,
            left: floatPos.left,
            zIndex: 200,
            display: 'flex',
            gap: 6,
            alignItems: 'center',
          }}
        >
          {/* Comment */}
          <FloatBtn
            onClick={(e) => { e.preventDefault(); handleAddCommentClick() }}
            onMouseDown={(e) => e.preventDefault()}
            bg="#111827"
          >
            💬 Comment
          </FloatBtn>

          {/* AI Improve */}
          <FloatBtn
            onClick={(e) => { e.preventDefault(); handleImprove() }}
            onMouseDown={(e) => e.preventDefault()}
            bg={colors.ai}
          >
            ✦ Improve
          </FloatBtn>
        </div>
      )}

      {/* AI error toast */}
      {aiError && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 300,
            background: '#111827',
            color: '#fff',
            fontFamily: 'monospace',
            fontSize: 12,
            padding: '8px 16px',
            borderRadius: 6,
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ color: colors.danger }}>✕</span>
          {aiError}
          <button
            onClick={() => setAiError(null)}
            style={{
              marginLeft: 8,
              background: 'none',
              border: 'none',
              color: '#9CA3AF',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: 12,
              padding: 0,
            }}
          >
            dismiss
          </button>
        </div>
      )}

      {/* ── Comment draft popup ─────────────────────────────────────────────── */}
      {showCommentInput && floatPos && (
        <div
          style={{
            position: 'fixed',
            top: floatPos.top,
            left: floatPos.left,
            zIndex: 200,
            background: '#fff',
            border: `1.5px solid ${colors.border}`,
            borderRadius: 10,
            padding: 14,
            width: 252,
            boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
          }}
        >
          <textarea
            autoFocus
            placeholder="Add a comment… (Enter to save, Esc to cancel)"
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmitComment()
              }
              if (e.key === 'Escape') {
                setShowCommentInput(false)
                setCommentDraft('')
              }
            }}
            style={{
              width: '100%',
              height: 80,
              resize: 'none',
              border: `1px solid ${colors.border}`,
              borderRadius: 6,
              padding: '7px 9px',
              fontFamily: 'sans-serif',
              fontSize: 13,
              lineHeight: 1.5,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              onClick={handleSubmitComment}
              disabled={!commentDraft.trim()}
              style={{
                flex: 1,
                padding: '5px 0',
                fontSize: 12,
                fontFamily: 'monospace',
                fontWeight: 600,
                border: 'none',
                borderRadius: 5,
                background: commentDraft.trim() ? '#111827' : '#e8e8e8',
                color: commentDraft.trim() ? '#fff' : '#aaa',
                cursor: commentDraft.trim() ? 'pointer' : 'default',
              }}
            >
              Save
            </button>
            <button
              onClick={() => { setShowCommentInput(false); setCommentDraft('') }}
              style={{
                padding: '5px 12px',
                fontSize: 12,
                fontFamily: 'monospace',
                border: `1px solid ${colors.border}`,
                borderRadius: 5,
                background: '#fff',
                cursor: 'pointer',
                color: colors.fg2,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Comment threads sidebar ─────────────────────────────────────────── */}
      {comments.length > 0 && (
        <div
          style={{
            position: 'fixed',
            right: aiSidebarOpen ? 296 : 16,
            top: 'calc(48px + 40px + 16px)',
            width: 264,
            maxHeight: 'calc(100dvh - 48px - 40px - 32px)',
            overflowY: 'auto',
            transition: 'right 130ms ease',
            zIndex: 50,
          }}
        >
          <CommentsPanel
            comments={comments}
            activeCommentId={activeCommentId}
            localUser={localUser}
            onAddReply={(id, text) => addReply(id, text, localUser)}
            onResolve={resolveComment}
            onSelect={setActiveCommentId}
          />
        </div>
      )}
    </>
  )
}

// ── FloatBtn ──────────────────────────────────────────────────────────────────

function FloatBtn({
  children,
  bg,
  disabled,
  onClick,
  onMouseDown,
}: {
  children: React.ReactNode
  bg: string
  disabled?: boolean
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  onMouseDown?: React.MouseEventHandler<HTMLButtonElement>
}) {
  return (
    <button
      onClick={onClick}
      onMouseDown={onMouseDown}
      disabled={disabled}
      style={{
        padding: '5px 13px',
        fontSize: 12,
        fontFamily: 'monospace',
        fontWeight: 600,
        background: disabled ? '#6B7280' : bg,
        color: '#fff',
        border: 'none',
        borderRadius: 5,
        cursor: disabled ? 'default' : 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
        transition: 'opacity 80ms ease',
        letterSpacing: '0.02em',
      }}
    >
      {children}
    </button>
  )
}
