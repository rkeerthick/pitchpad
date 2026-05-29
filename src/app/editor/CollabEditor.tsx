'use client'

// This module is only ever loaded in the browser (imported with ssr:false in
// EditorLoader.tsx), so it's safe to create WebSocket connections and
// reference browser APIs at module scope.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import { Extension } from '@tiptap/core'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

import { usePresence } from './usePresence'
import { PresenceBar } from './PresenceBar'
import { useComments } from './useComments'
import { CommentsPanel } from './CommentsPanel'
import { buildCommentDecorationPlugin, COMMENT_DECO_KEY } from './commentDecorationPlugin'

// ═══════════════════════════════════════════════════════════════════════════════
// Module-level singletons — created once per browser tab
// ═══════════════════════════════════════════════════════════════════════════════

// The root CRDT container.  All shared state (document text AND comments)
// lives inside this one Y.Doc and is synced via the WebsocketProvider.
const ydoc = new Y.Doc()

// Transport layer: keeps ydoc in sync with the relay server.
// Also carries Awareness messages (cursors, presence) on the same socket.
const provider = new WebsocketProvider('ws://localhost:1234', 'pitchpad-room', ydoc)

// The Y.XmlFragment that Tiptap's Collaboration extension uses.
// Key MUST match Collaboration.configure({ field: '...' }) — 'default' is the default.
// We pre-fetch it here so the comment plugin can reference it at module load time.
const fragment = ydoc.getXmlFragment('default')

// Y.Map for all comment threads — synced across clients like the document text.
const commentsMap: Y.Map<Y.Map<any>> = ydoc.getMap('comments')

// ── Comment decoration Tiptap extension ────────────────────────────────────────
// We build this once at module scope (not inside the component) so the
// Extension object is stable and doesn't cause useEditor to re-create the editor.
//
// The extension wraps a ProseMirror Plugin that:
//   1. Subscribes to commentsMap via observeDeep (inside plugin.view())
//   2. Rebuilds Decoration.inline() objects when commentsMap changes
//   3. Maps existing decorations through PM transactions when the doc changes
const CommentDecoExtension = Extension.create({
  name: 'commentDecorations',
  addProseMirrorPlugins() {
    return [buildCommentDecorationPlugin(ydoc, fragment, commentsMap)]
  },
})

// ═══════════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════════

export default function CollabEditor() {
  // ── Presence (Awareness) ────────────────────────────────────────────────────
  // localUser  = our random name + color, broadcast via awareness
  // peers      = all currently connected remote users (reactive)
  const { localUser, peers } = usePresence(provider)

  // ── Comments ─────────────────────────────────────────────────────────────────
  // comments        = React mirror of commentsMap (reactive)
  // addComment etc. = CRDT mutations that sync to all peers
  const { comments, addComment, addReply, resolveComment } = useComments(ydoc)

  // ── Comment UI state ─────────────────────────────────────────────────────────
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null)
  const [showCommentInput, setShowCommentInput] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  // Viewport coords for positioning the floating button / input popup
  const [floatPos, setFloatPos] = useState<{ top: number; left: number } | null>(null)
  // Capture selection before the textarea grabs focus and clears it
  const pendingRange = useRef<{ from: number; to: number } | null>(null)

  // ── Tiptap editor ────────────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      // Bundles bold, italic, headings, lists, code, etc.
      // history: false — ProseMirror's undo stack conflicts with Yjs's CRDT
      // operations; remote edits would be mis-undone.  Yjs provides its own
      // UndoManager that understands CRDT semantics (add it separately if needed).
      StarterKit.configure({ history: false }),

      // ── Collaboration ──────────────────────────────────────────────────────
      // Binds ProseMirror to  ydoc.getXmlFragment('default').
      //   Local edit  → PM transaction → Yjs op on XmlFragment → WS send
      //   Remote op   → applied to ydoc → PM transaction → editor re-render
      Collaboration.configure({ document: ydoc }),

      // ── CollaborationCursor ────────────────────────────────────────────────
      // Uses the Awareness protocol to broadcast cursor + selection positions.
      //
      // On every local selectionUpdate it writes into awareness:
      //   { cursor: { anchor: Y.RelativePosition, head: Y.RelativePosition } }
      //
      // For each remote peer that has a cursor field in their awareness state,
      // the extension renders two things:
      //   1. A blinking caret element at their insertion point
      //   2. An inline decoration with their color over their selected text
      //
      // The `render` option controls the caret DOM element.
      // The `selectionRender` option (not used here) controls selection highlight style.
      CollaborationCursor.configure({
        provider,
        // Merge localUser into the awareness 'user' field so the cursor label
        // matches the name in the PresenceBar.  (CollaborationCursor reads
        // awareness.getStates()[id].user.{name,color} to style remote cursors.)
        user: localUser,

        render(user: { name: string; color: string }) {
          // DOM element rendered at each remote user's cursor position.
          const wrap = document.createElement('span')
          wrap.style.cssText = [
            `border-left: 2px solid ${user.color}`,
            'margin-left: -1px',
            'position: relative',
            'display: inline-block',
            'height: 1em',
            'vertical-align: text-top',
          ].join(';')

          // Name badge floating above the cursor line
          const label = document.createElement('span')
          label.textContent = user.name
          label.style.cssText = [
            'position: absolute',
            'bottom: 100%',
            'left: -1px',
            'font-size: 11px',
            'font-family: monospace',
            'font-weight: 700',
            `color: #fff`,
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

      // ── Comment highlight decorations ──────────────────────────────────────
      // Resolves Yjs relative positions → absolute PM positions → inline
      // Decoration.inline() objects with per-comment color highlights.
      // See commentDecorationPlugin.ts for the full architecture comment.
      CommentDecoExtension,
    ],

    autofocus: true,

    // Track selection changes to show the floating "💬 Comment" button
    onSelectionUpdate({ editor }) {
      const { from, to } = editor.state.selection
      if (from !== to) {
        // Use coordsAtPos to get the *viewport* position of the selection start.
        // We'll position the button with `position: fixed` so no scroll offset needed.
        const coords = editor.view.coordsAtPos(from)
        setFloatPos({ top: coords.top - 38, left: coords.left })
      } else {
        setFloatPos(null)
      }
    },
  })

  // ── Sync CollaborationCursor user when localUser is resolved ────────────────
  // useEditor runs before usePresence has set the awareness state, so we
  // update the cursor user once we have localUser.
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      editor.chain()
        .updateUser(localUser) // CollaborationCursor command
        .run()
    }
  }, [editor, localUser])

  // ── "Add Comment" button handler ─────────────────────────────────────────────
  const handleAddCommentClick = useCallback(() => {
    if (!editor) return
    const { from, to } = editor.state.selection
    if (from === to) return
    // Capture the selection BEFORE the textarea steals focus and clears it
    pendingRange.current = { from, to }
    setCommentDraft('')
    setShowCommentInput(true)
  }, [editor])

  // ── Submit comment handler ────────────────────────────────────────────────────
  const handleSubmitComment = useCallback(() => {
    if (!editor || !commentDraft.trim() || !pendingRange.current) return
    const { from, to } = pendingRange.current

    // addComment receives explicit from/to so it doesn't depend on editor.state.selection
    // (which may have been cleared when the textarea gained focus).
    const newId = addComment(editor, commentDraft, localUser, from, to)

    setCommentDraft('')
    setShowCommentInput(false)
    setFloatPos(null)
    pendingRange.current = null

    if (newId) {
      setActiveCommentId(newId)
      // Scroll the new comment card into view in the sidebar
      requestAnimationFrame(() => {
        document.getElementById(`comment-${newId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
    }
  }, [editor, commentDraft, addComment, localUser])

  if (!editor) return null

  return (
    <div style={{ position: 'relative' }}>
      {/* ── Top bar: connection status + presence avatars ─────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <ConnStatus provider={provider} />
        <PresenceBar localUser={localUser} peers={peers} />
      </div>

      {/* ── Editor + comment sidebar ──────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* Editor */}
        <div
          style={{
            flex: 1,
            border: '1px solid #ddd',
            borderRadius: 8,
            padding: '16px 20px',
            background: '#fff',
            minHeight: 300,
          }}
        >
          <EditorContent editor={editor} />
        </div>

        {/* Comment sidebar */}
        <div style={{ width: 264, flexShrink: 0 }}>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 10,
              color: '#bbb',
              letterSpacing: '0.08em',
              marginBottom: 10,
              textTransform: 'uppercase',
            }}
          >
            Comments
          </div>
          <CommentsPanel
            comments={comments}
            activeCommentId={activeCommentId}
            localUser={localUser}
            onAddReply={(id, text) => addReply(id, text, localUser)}
            onResolve={resolveComment}
            onSelect={setActiveCommentId}
          />
        </div>
      </div>

      {/* ── Floating "💬 Comment" button ────────────────────────────────────
           Appears above the text selection.  onMouseDown with preventDefault
           prevents the click from clearing the editor selection before the
           handler runs — a standard trick for floating toolbars.            */}
      {floatPos && !showCommentInput && (
        <button
          onMouseDown={(e) => {
            e.preventDefault() // keep editor selection alive
            handleAddCommentClick()
          }}
          style={{
            position: 'fixed',
            top: floatPos.top,
            left: floatPos.left,
            zIndex: 100,
            padding: '4px 12px',
            fontSize: 12,
            fontFamily: 'monospace',
            fontWeight: 600,
            background: '#111',
            color: '#fff',
            border: 'none',
            borderRadius: 5,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          💬 Comment
        </button>
      )}

      {/* ── Comment draft popup ─────────────────────────────────────────────
           Floats at the same position as the button.  Escape cancels.      */}
      {showCommentInput && floatPos && (
        <div
          style={{
            position: 'fixed',
            top: floatPos.top,
            left: floatPos.left,
            zIndex: 100,
            background: '#fff',
            border: '1.5px solid #ddd',
            borderRadius: 10,
            padding: 14,
            width: 252,
            boxShadow: '0 6px 24px rgba(0,0,0,0.14)',
          }}
        >
          <textarea
            autoFocus
            placeholder="Add a comment… (Enter to save, Esc to cancel)"
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitComment() }
              if (e.key === 'Escape') { setShowCommentInput(false); setCommentDraft('') }
            }}
            style={{
              width: '100%',
              height: 80,
              resize: 'none',
              border: '1px solid #e0e0e0',
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
                background: commentDraft.trim() ? '#111' : '#e8e8e8',
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
                border: '1px solid #ddd',
                borderRadius: 5,
                background: '#fff',
                cursor: 'pointer',
                color: '#555',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Connection status badge ───────────────────────────────────────────────────

function ConnStatus({ provider }: { provider: WebsocketProvider }) {
  const [connected, setConnected] = useState(provider.wsconnected)
  useEffect(() => {
    const h = ({ status }: { status: string }) => setConnected(status === 'connected')
    provider.on('status', h)
    return () => provider.off('status', h)
  }, [provider])
  return (
    <span style={{ fontFamily: 'monospace', fontSize: 11, color: connected ? '#22863a' : '#b31d28' }}>
      {connected ? '● connected' : '○ connecting…'}
    </span>
  )
}
