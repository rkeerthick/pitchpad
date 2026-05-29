'use client'

// AISidebar.tsx
//
// Collapsible right sidebar showing AI suggestion cards backed by the shared
// Yjs suggestionsMap.  Each card shows the diff (original → proposed) and
// Accept / Reject controls.
//
// The sidebar receives suggestions as plain objects (from useAISuggestions
// which mirrors the Y.Map into React state) and fires onAccept/onReject
// callbacks back up to the editor client, which calls the hook methods and
// updates the Y.Map + document in one go.
//
// isOpen controls the width transition — the sidebar is never unmounted so
// local UI state (scroll position, any draft state) survives collapse.
// ─────────────────────────────────────────────────────────────────────────────

import { colors, fonts, fontSize, radius, space, motion } from '@/lib/tokens'
import type { AISuggestion } from '@/app/editor/useAISuggestions'

export type { AISuggestion }

interface AISidebarProps {
  suggestions: AISuggestion[]
  activeSuggestionId: string | null
  onSetActive: (id: string | null) => void
  onAccept: (id: string) => void
  onReject: (id: string) => void   // also used as "cancel" for streaming cards
  isOpen: boolean
  isLoading?: boolean  // legacy: now streaming state comes from suggestion.status
}

export function AISidebar({
  suggestions,
  activeSuggestionId,
  onSetActive,
  onAccept,
  onReject,
  isOpen,
  isLoading = false,
}: AISidebarProps) {
  const pending = suggestions.filter((s) => s.status === 'pending')

  return (
    <aside
      aria-label="AI suggestions"
      style={{
        width: isOpen ? 280 : 0,
        minWidth: isOpen ? 280 : 0,
        overflow: 'hidden',
        transition: `width ${motion.standard}, min-width ${motion.standard}`,
        borderLeft: isOpen ? `1px solid ${colors.border}` : 'none',
        background: colors.bgPanel,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: `${space[3]}px ${space[4]}px`,
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: space[2],
          flexShrink: 0,
        }}
      >
        <AiBadge />
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: fontSize.caption,
            fontWeight: 600,
            color: colors.fg1,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          Suggestions
        </span>
        {pending.length > 0 && (
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: fonts.mono,
              fontSize: fontSize.label,
              color: colors.fg3,
            }}
          >
            {pending.length}
          </span>
        )}
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div style={{ overflowY: 'auto', flex: 1, padding: `${space[2]}px` }}>
        {/* Loading skeleton while Gemini call is in flight */}
        {isLoading && (
          <LoadingCard />
        )}

        {!isLoading && pending.length === 0 && (
          <div
            style={{
              padding: `${space[8]}px ${space[4]}px`,
              textAlign: 'center',
              fontFamily: fonts.mono,
              fontSize: fontSize.caption,
              color: colors.fg3,
            }}
          >
            No pending suggestions
          </div>
        )}

        {pending.map((s) =>
          s.status === 'streaming' ? (
            <StreamingCard
              key={s.id}
              suggestion={s}
              isActive={s.id === activeSuggestionId}
              onActivate={() => onSetActive(s.id === activeSuggestionId ? null : s.id)}
              onCancel={() => { onReject(s.id); onSetActive(null) }}
            />
          ) : (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              isActive={s.id === activeSuggestionId}
              onActivate={() =>
                onSetActive(s.id === activeSuggestionId ? null : s.id)
              }
              onAccept={() => { onAccept(s.id); onSetActive(null) }}
              onReject={() => { onReject(s.id); onSetActive(null) }}
            />
          )
        )}
      </div>
    </aside>
  )
}

// ── SuggestionCard ────────────────────────────────────────────────────────────

interface SuggestionCardProps {
  suggestion: AISuggestion
  isActive: boolean
  onActivate: () => void
  onAccept: () => void
  onReject: () => void
}

function SuggestionCard({
  suggestion,
  isActive,
  onActivate,
  onAccept,
  onReject,
}: SuggestionCardProps) {
  return (
    <div
      onClick={onActivate}
      style={{
        borderRadius: radius.lg,
        border: `1px solid ${isActive ? colors.ai : colors.border}`,
        background: isActive ? 'rgba(124,58,237,0.04)' : colors.bgSurface,
        padding: `${space[3]}px`,
        marginBottom: space[2],
        cursor: 'pointer',
        transition: `border-color ${motion.fast}, background ${motion.fast}`,
      }}
    >
      {/* Card header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: space[2],
          marginBottom: space[2],
        }}
      >
        <AiBadge />
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: fontSize.label,
            color: colors.fg3,
            letterSpacing: '0.04em',
          }}
        >
          rewrite
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: fonts.mono,
            fontSize: 10,
            color: colors.fg3,
          }}
        >
          {new Date(suggestion.createdAt).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          })}
        </span>
      </div>

      {/* Diff preview */}
      <div
        style={{
          borderRadius: radius.md,
          overflow: 'hidden',
          border: `1px solid ${colors.border}`,
          marginBottom: space[3],
          fontSize: fontSize.caption,
          fontFamily: fonts.sans,
          lineHeight: 1.5,
        }}
      >
        {/* Original — deletion */}
        <div
          style={{
            padding: `${space[1.5]}px ${space[2]}px`,
            color: colors.danger,
            background: 'rgba(220,38,38,0.05)',
            borderBottom: `1px solid ${colors.border}`,
            textDecoration: 'line-through',
            textDecorationColor: colors.danger,
            textDecorationThickness: '1px',
          }}
        >
          {suggestion.originalText.length > 120
            ? suggestion.originalText.slice(0, 120) + '…'
            : suggestion.originalText}
        </div>
        {/* Proposed — addition */}
        <div
          style={{
            padding: `${space[1.5]}px ${space[2]}px`,
            color: colors.success,
            background: 'rgba(5,150,105,0.05)',
          }}
        >
          {suggestion.proposedText.length > 120
            ? suggestion.proposedText.slice(0, 120) + '…'
            : suggestion.proposedText}
        </div>
      </div>

      {/* Accept / Reject */}
      <div style={{ display: 'flex', gap: space[2] }}>
        <ActionBtn variant="accept" onClick={(e) => { e.stopPropagation(); onAccept() }}>
          Accept
        </ActionBtn>
        <ActionBtn variant="reject" onClick={(e) => { e.stopPropagation(); onReject() }}>
          Reject
        </ActionBtn>
      </div>
    </div>
  )
}

// ── ActionBtn ─────────────────────────────────────────────────────────────────

function ActionBtn({
  variant,
  children,
  onClick,
}: {
  variant: 'accept' | 'reject'
  children: React.ReactNode
  onClick: React.MouseEventHandler<HTMLButtonElement>
}) {
  const isAccept = variant === 'accept'
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: `${space[1.5]}px 0`,
        fontFamily: fonts.mono,
        fontSize: fontSize.label,
        fontWeight: 600,
        letterSpacing: '0.04em',
        border: isAccept ? 'none' : `1px solid ${colors.border}`,
        borderRadius: radius.md,
        background: isAccept ? colors.accent : 'transparent',
        color: isAccept ? '#fff' : colors.fg2,
        cursor: 'pointer',
        transition: `opacity ${motion.fast}, background ${motion.fast}, color ${motion.fast}`,
      }}
      onMouseEnter={(e) => {
        const b = e.currentTarget
        if (isAccept) { b.style.opacity = '0.85' }
        else { b.style.background = colors.bgElevated; b.style.color = colors.fg1 }
      }}
      onMouseLeave={(e) => {
        const b = e.currentTarget
        if (isAccept) { b.style.opacity = '1' }
        else { b.style.background = 'transparent'; b.style.color = colors.fg2 }
      }}
    >
      {children}
    </button>
  )
}

// ── StreamingCard ─────────────────────────────────────────────────────────────
// Shown while Gemini is actively streaming tokens into the document.
// Displays the accumulated text so far with a blinking cursor, and a "Cancel"
// button that aborts the fetch and restores the original text atomically.

interface StreamingCardProps {
  suggestion: AISuggestion
  isActive: boolean
  onActivate: () => void
  onCancel: () => void
}

function StreamingCard({ suggestion, isActive, onActivate, onCancel }: StreamingCardProps) {
  return (
    <div
      onClick={onActivate}
      style={{
        borderRadius: radius.lg,
        border: `1px solid ${isActive ? colors.ai : colors.border}`,
        background: isActive ? 'rgba(124,58,237,0.04)' : colors.bgSurface,
        padding: `${space[3]}px`,
        marginBottom: space[2],
        cursor: 'pointer',
        transition: `border-color ${motion.fast}, background ${motion.fast}`,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[2] }}>
        <AiBadge />
        <span style={{ fontFamily: fonts.mono, fontSize: fontSize.label, color: colors.ai, letterSpacing: '0.04em' }}>
          writing…
        </span>
      </div>

      {/* Live text preview with blinking cursor */}
      <div
        style={{
          fontFamily: fonts.sans,
          fontSize: fontSize.caption,
          color: colors.fg2,
          lineHeight: 1.5,
          minHeight: 32,
          marginBottom: space[3],
          wordBreak: 'break-word',
        }}
      >
        {suggestion.proposedText || <span style={{ color: colors.fg3 }}>…</span>}
        <span
          style={{
            display: 'inline-block',
            width: 2,
            height: '0.9em',
            background: colors.ai,
            marginLeft: 2,
            verticalAlign: 'text-bottom',
            animation: 'blink 1s step-end infinite',
          }}
        />
        <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
      </div>

      {/* Cancel button */}
      <button
        onClick={(e) => { e.stopPropagation(); onCancel() }}
        style={{
          width: '100%',
          padding: `${space[1.5]}px 0`,
          fontFamily: fonts.mono,
          fontSize: fontSize.label,
          fontWeight: 600,
          letterSpacing: '0.04em',
          border: `1px solid ${colors.border}`,
          borderRadius: radius.md,
          background: 'transparent',
          color: colors.fg2,
          cursor: 'pointer',
          transition: `background ${motion.fast}, color ${motion.fast}`,
        }}
        onMouseEnter={(e) => {
          const b = e.currentTarget
          b.style.background = 'rgba(220,38,38,0.08)'
          b.style.color = colors.danger
          b.style.borderColor = colors.danger
        }}
        onMouseLeave={(e) => {
          const b = e.currentTarget
          b.style.background = 'transparent'
          b.style.color = colors.fg2
          b.style.borderColor = colors.border
        }}
      >
        Cancel
      </button>
    </div>
  )
}

// ── LoadingCard ───────────────────────────────────────────────────────────────
// Shown while the Gemini call is in flight.  Pulse animation signals work.

function LoadingCard() {
  return (
    <div
      style={{
        borderRadius: radius.lg,
        border: `1px solid ${colors.border}`,
        background: colors.bgSurface,
        padding: `${space[3]}px`,
        marginBottom: space[2],
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: space[2],
          marginBottom: space[3],
        }}
      >
        <AiBadge />
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: fontSize.label,
            color: colors.fg3,
          }}
        >
          generating…
        </span>
      </div>
      {/* Skeleton lines */}
      {[70, 90, 50].map((w, i) => (
        <div
          key={i}
          style={{
            height: 10,
            width: `${w}%`,
            borderRadius: radius.sm,
            background: colors.bgElevated,
            marginBottom: i < 2 ? space[1.5] : 0,
            animation: 'pulse 1.4s ease-in-out infinite',
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}

// ── AiBadge ───────────────────────────────────────────────────────────────────

export function AiBadge() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontFamily: fonts.mono,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        color: colors.ai,
        background: 'rgba(124,58,237,0.10)',
        border: `1px solid rgba(124,58,237,0.25)`,
        borderRadius: radius.sm,
        padding: '1px 5px',
        lineHeight: 1.5,
        userSelect: 'none',
      }}
    >
      AI
    </span>
  )
}
