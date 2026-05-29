'use client'

// DocumentEditor.tsx
//
// Full-page editor layout shell.  Deliberately decoupled from Yjs/Tiptap
// so it can be composed around any editor surface.
//
// Layout (top-to-bottom, left-to-right):
//
//   ┌──────────────────────────────────────────────────────────────┐
//   │  TopBar: breadcrumb · title · status badge · presence · ⋮   │ 48px
//   ├──────────────────────────────────────────────────────────────┤
//   │  Toolbar: B I U H1 H2 … · AI toggle                         │ 40px
//   ├─────────────────────────────────┬────────────────────────────┤
//   │                                 │                            │
//   │  Writing surface (720px max)    │  AI sidebar (280px)        │
//   │  Passed as `children`           │  collapsible               │
//   │                                 │                            │
//   └─────────────────────────────────┴────────────────────────────┘
//
// The sidebar collapses/expands with a width transition; it is never
// unmounted (keeps React state like scroll position and input drafts).
//
// Props:
//   title         — document title shown in topbar; editable inline
//   status        — proposal status (draft / review / sent / won / lost)
//   breadcrumb    — e.g. ["Proposals", "ACME Corp"]
//   presence      — rendered presence bar (pass <PresenceBar /> from parent)
//   aiSidebar     — rendered sidebar panel (pass <AISidebar /> from parent)
//   toolbar       — rendered toolbar (pass <FormatToolbar /> from parent)
//   children      — the <EditorContent editor={editor} /> surface
//   onTitleChange — called when the user edits the title inline
//   onStatusChange— called when the status chip is toggled
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { colors, fonts, fontSize, radius, space, layout, statusConfig } from '@/lib/tokens'
import type { ProposalStatus } from '@/lib/tokens'

interface DocumentEditorProps {
  title: string
  status: ProposalStatus
  breadcrumb?: string[]
  presence?: React.ReactNode
  aiSidebar?: React.ReactNode
  aiSidebarOpen?: boolean
  onToggleAiSidebar?: () => void
  toolbar?: React.ReactNode
  children: React.ReactNode
  onTitleChange?: (title: string) => void
}

export function DocumentEditor({
  title,
  status,
  breadcrumb = [],
  presence,
  aiSidebar,
  aiSidebarOpen = false,
  onToggleAiSidebar,
  toolbar,
  children,
  onTitleChange,
}: DocumentEditorProps) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(title)

  function commitTitle() {
    setEditingTitle(false)
    const trimmed = titleDraft.trim() || 'Untitled'
    setTitleDraft(trimmed)
    onTitleChange?.(trimmed)
  }

  const cfg = statusConfig[status]

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        background: colors.bgBase,
        overflow: 'hidden',
      }}
    >
      {/* ── TopBar ──────────────────────────────────────────────────────────── */}
      <header
        style={{
          height: layout.topBarHeight,
          minHeight: layout.topBarHeight,
          display: 'flex',
          alignItems: 'center',
          padding: `0 ${space[5]}px`,
          borderBottom: `1px solid ${colors.border}`,
          background: colors.bgSurface,
          gap: space[3],
          flexShrink: 0,
        }}
      >
        {/* Breadcrumb */}
        {breadcrumb.length > 0 && (
          <nav
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: space[1.5],
              flexShrink: 0,
            }}
          >
            {breadcrumb.map((crumb, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: space[1.5] }}>
                {i > 0 && (
                  <span
                    style={{
                      color: colors.fg3,
                      fontFamily: fonts.mono,
                      fontSize: fontSize.label,
                    }}
                  >
                    /
                  </span>
                )}
                <span
                  style={{
                    fontFamily: fonts.sans,
                    fontSize: fontSize.caption,
                    color: i === breadcrumb.length - 1 ? colors.fg2 : colors.fg3,
                    fontWeight: i === breadcrumb.length - 1 ? 500 : 400,
                  }}
                >
                  {crumb}
                </span>
              </span>
            ))}
          </nav>
        )}

        {/* Separator */}
        {breadcrumb.length > 0 && (
          <div
            style={{
              width: 1,
              height: 16,
              background: colors.border,
              flexShrink: 0,
            }}
          />
        )}

        {/* Document title — inline editable */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTitle()
                if (e.key === 'Escape') {
                  setTitleDraft(title)
                  setEditingTitle(false)
                }
              }}
              style={{
                fontFamily: fonts.sans,
                fontSize: fontSize.base,
                fontWeight: 600,
                color: colors.fg1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                width: '100%',
                padding: 0,
              }}
            />
          ) : (
            <button
              onClick={() => { setTitleDraft(title); setEditingTitle(true) }}
              style={{
                fontFamily: fonts.sans,
                fontSize: fontSize.base,
                fontWeight: 600,
                color: colors.fg1,
                border: 'none',
                background: 'transparent',
                padding: 0,
                cursor: 'text',
                textAlign: 'left',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                display: 'block',
              }}
            >
              {title || 'Untitled'}
            </button>
          )}
        </div>

        {/* Status badge */}
        <span
          className="status-badge"
          style={{
            color: cfg.color,
            background: cfg.bg,
            borderColor: cfg.border,
            flexShrink: 0,
          }}
        >
          {cfg.label}
        </span>

        {/* Presence avatars */}
        {presence && (
          <div style={{ flexShrink: 0 }}>{presence}</div>
        )}

        {/* AI sidebar toggle */}
        {onToggleAiSidebar && (
          <button
            onClick={onToggleAiSidebar}
            title={aiSidebarOpen ? 'Close AI sidebar' : 'Open AI sidebar'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: space[1.5],
              fontFamily: fonts.mono,
              fontSize: fontSize.label,
              fontWeight: 600,
              letterSpacing: '0.04em',
              padding: `${space[1]}px ${space[2]}px`,
              borderRadius: radius.md,
              border: `1px solid ${aiSidebarOpen ? colors.ai : colors.border}`,
              background: aiSidebarOpen ? 'rgba(124,58,237,0.08)' : 'transparent',
              color: aiSidebarOpen ? colors.ai : colors.fg2,
              cursor: 'pointer',
              transition: `all 80ms ease`,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: aiSidebarOpen ? colors.ai : colors.fg3,
                display: 'inline-block',
                transition: `background 80ms ease`,
              }}
            />
            AI
          </button>
        )}
      </header>

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      {toolbar && (
        <div
          style={{
            height: layout.toolbarHeight,
            minHeight: layout.toolbarHeight,
            display: 'flex',
            alignItems: 'center',
            padding: `0 ${space[5]}px`,
            borderBottom: `1px solid ${colors.border}`,
            background: colors.bgSurface,
            gap: space[1],
            flexShrink: 0,
            overflowX: 'auto',
          }}
        >
          {toolbar}
        </div>
      )}

      {/* ── Body: writing surface + sidebar ──────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {/* Writing surface — scrolls independently */}
        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            background: colors.bgBase,
            padding: `${space[10]}px ${space[8]}px`,
          }}
        >
          {/* Inner constrained column — the calm writing surface */}
          <div
            style={{
              maxWidth: layout.editorMaxWidth,
              margin: '0 auto',
              background: colors.bgSurface,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.xl,
              padding: `${space[10]}px ${space[12]}px`,
              minHeight: 480,
            }}
          >
            {children}
          </div>
        </main>

        {/* AI Sidebar — width transitions, never unmounts */}
        {aiSidebar}
      </div>
    </div>
  )
}
