'use client'

import { useState } from 'react'
import type { Comment } from './useComments'
import type { LocalUser } from './usePresence'

interface PanelProps {
  comments: Comment[]
  activeCommentId: string | null
  localUser: LocalUser
  onAddReply: (commentId: string, text: string) => void
  onResolve: (commentId: string) => void
  onSelect: (commentId: string | null) => void
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function CommentsPanel({
  comments,
  activeCommentId,
  localUser,
  onAddReply,
  onResolve,
  onSelect,
}: PanelProps) {
  const active = comments.filter((c) => !c.resolved)
  const resolved = comments.filter((c) => c.resolved)

  if (active.length === 0 && resolved.length === 0) {
    return (
      <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#bbb', padding: '8px 0', lineHeight: 1.6 }}>
        No comments yet.
        <br />
        Select text in the editor, then click 💬.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {active.map((c) => (
        <CommentCard
          key={c.id}
          comment={c}
          isActive={activeCommentId === c.id}
          localUser={localUser}
          onAddReply={onAddReply}
          onResolve={onResolve}
          onSelect={onSelect}
        />
      ))}

      {resolved.length > 0 && (
        <details style={{ marginTop: 4 }}>
          <summary
            style={{ fontFamily: 'monospace', fontSize: 11, color: '#aaa', cursor: 'pointer', userSelect: 'none' }}
          >
            {resolved.length} resolved
          </summary>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8, opacity: 0.55 }}>
            {resolved.map((c) => (
              <CommentCard
                key={c.id}
                comment={c}
                isActive={false}
                localUser={localUser}
                onAddReply={onAddReply}
                onResolve={onResolve}
                onSelect={onSelect}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

interface CardProps {
  comment: Comment
  isActive: boolean
  localUser: LocalUser
  onAddReply: (id: string, text: string) => void
  onResolve: (id: string) => void
  onSelect: (id: string | null) => void
}

function CommentCard({ comment, isActive, localUser, onAddReply, onResolve, onSelect }: CardProps) {
  const [replyText, setReplyText] = useState('')

  return (
    <div
      onClick={() => onSelect(isActive ? null : comment.id)}
      style={{
        border: `1.5px solid ${isActive ? comment.color : '#e8e8e8'}`,
        borderRadius: 8,
        padding: '10px 12px',
        cursor: 'pointer',
        background: isActive ? `${comment.color}0d` : '#fff',
        transition: 'border-color 0.12s, background 0.12s',
      }}
    >
      {/* ── Thread opener ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <span
          style={{
            width: 8, height: 8, borderRadius: '50%',
            background: comment.color, flexShrink: 0,
          }}
        />
        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: comment.color }}>
          {comment.author}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#bbb', marginLeft: 'auto' }}>
          {timeAgo(comment.createdAt)}
        </span>
      </div>
      <p style={{ margin: '0 0 6px 14px', fontFamily: 'sans-serif', fontSize: 13, lineHeight: 1.5, color: '#222' }}>
        {comment.text}
      </p>

      {/* ── Replies ────────────────────────────────────────────────────── */}
      {/* Each reply is stored in a Y.Array inside the comment's Y.Map.
          Multiple users can push replies concurrently; Yjs merges them in
          insertion order without conflict. */}
      {comment.replies.map((reply) => (
        <div
          key={reply.id}
          style={{
            marginTop: 8,
            paddingLeft: 14,
            borderLeft: `2px solid ${reply.color}55`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: reply.color }}>
              {reply.author}
            </span>
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#bbb', marginLeft: 'auto' }}>
              {timeAgo(reply.createdAt)}
            </span>
          </div>
          <p style={{ margin: 0, fontFamily: 'sans-serif', fontSize: 12, lineHeight: 1.5, color: '#333' }}>
            {reply.text}
          </p>
        </div>
      ))}

      {/* ── Reply input + controls ─────────────────────────────────────── */}
      {!comment.resolved && (
        <div
          style={{ marginTop: 10, display: 'flex', gap: 5 }}
          onClick={(e) => e.stopPropagation()} // don't toggle active state when clicking here
        >
          <input
            placeholder="Reply… (Enter to send)"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && replyText.trim()) {
                e.preventDefault()
                onAddReply(comment.id, replyText)
                setReplyText('')
              }
            }}
            style={{
              flex: 1, padding: '4px 7px', fontSize: 12,
              border: '1px solid #ddd', borderRadius: 4,
              fontFamily: 'sans-serif', outline: 'none',
            }}
          />
          <button
            disabled={!replyText.trim()}
            onClick={() => { onAddReply(comment.id, replyText); setReplyText('') }}
            style={{
              padding: '4px 8px', fontSize: 11, border: 'none', borderRadius: 4,
              background: replyText.trim() ? comment.color : '#e5e5e5',
              color: replyText.trim() ? '#fff' : '#aaa',
              cursor: replyText.trim() ? 'pointer' : 'default',
              fontFamily: 'monospace',
              flexShrink: 0,
            }}
          >
            Send
          </button>
          {/* Resolve button — marks comment as done, collapses highlight */}
          <button
            onClick={() => onResolve(comment.id)}
            title="Resolve"
            style={{
              padding: '4px 7px', fontSize: 12, border: '1px solid #ddd',
              borderRadius: 4, background: '#fff', cursor: 'pointer', color: '#666',
              flexShrink: 0,
            }}
          >
            ✓
          </button>
        </div>
      )}
    </div>
  )
}
