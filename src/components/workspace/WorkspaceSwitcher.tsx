'use client'

// WorkspaceSwitcher.tsx
//
// Dropdown that shows the current workspace, lists all the user's workspaces,
// and lets them create a new one.
//
// Data flows server → client:
//   workspace/[slug]/layout.tsx fetches all memberships and passes them here.
//   After creating a new workspace, router.refresh() re-runs the layout's
//   server code and updates the list.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { colors, fonts, fontSize, space, radius, shadow, motion } from '@/lib/tokens'
import type { Role } from '@prisma/client'

interface Workspace {
  id: string
  name: string
  slug: string
  role: Role
}

interface Props {
  workspaces: Workspace[]
  currentSlug: string
}

export function WorkspaceSwitcher({ workspaces, currentSlug }: Props) {
  const router = useRouter()
  const [open, setOpen]       = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef    = useRef<HTMLInputElement>(null)

  const current = workspaces.find((w) => w.slug === currentSlug)

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
        setNewName('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Focus input when create form opens
  useEffect(() => {
    if (creating) inputRef.current?.focus()
  }, [creating])

  async function handleCreate() {
    if (!newName.trim() || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/workspaces', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: newName.trim() }),
      })
      const data = await res.json() as { slug?: string; error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Failed to create workspace.')
        return
      }
      setOpen(false)
      setCreating(false)
      setNewName('')
      router.push(`/workspace/${data.slug}`)
      router.refresh()
    } catch {
      setError('Network error.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        onClick={() => { setOpen((o) => !o); setCreating(false) }}
        style={{
          display:    'flex',
          alignItems: 'center',
          gap:        space[1],
          padding:    `${space[1]}px ${space[2]}px`,
          fontFamily: fonts.mono,
          fontSize:   fontSize.label,
          fontWeight: 600,
          color:      colors.fg1,
          background: 'transparent',
          border:     `1px solid ${colors.border}`,
          borderRadius: radius.md,
          cursor:     'pointer',
          transition: `background ${motion.fast}`,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = colors.bgElevated }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        {current?.name ?? 'Select workspace'}
        <svg
          width="8" height="5" viewBox="0 0 8 5"
          style={{ marginLeft: 2, opacity: 0.4 }}
        >
          <path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.5"
                fill="none" strokeLinecap="round"/>
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position:   'absolute',
            top:        'calc(100% + 6px)',
            left:       0,
            minWidth:   240,
            background: colors.bgPanel,
            border:     `1px solid ${colors.border}`,
            borderRadius: radius.lg,
            boxShadow:  shadow.lg,
            overflow:   'hidden',
            zIndex:     300,
          }}
        >
          {/* Workspace list */}
          <div style={{ padding: `${space[1]}px 0` }}>
            {workspaces.map((ws) => {
              const isCurrent = ws.slug === currentSlug
              return (
                <button
                  key={ws.id}
                  onClick={() => {
                    router.push(`/workspace/${ws.slug}`)
                    setOpen(false)
                  }}
                  style={{
                    width:      '100%',
                    textAlign:  'left',
                    padding:    `${space[2]}px ${space[4]}px`,
                    fontFamily: fonts.mono,
                    fontSize:   fontSize.caption,
                    color:      isCurrent ? colors.accent : colors.fg1,
                    background: isCurrent ? colors.accentBg : 'transparent',
                    border:     'none',
                    cursor:     'pointer',
                    display:    'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap:        space[3],
                    transition: `background ${motion.fast}`,
                  }}
                  onMouseEnter={(e) => {
                    if (!isCurrent) e.currentTarget.style.background = colors.bgElevated
                  }}
                  onMouseLeave={(e) => {
                    if (!isCurrent) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <span style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}>
                    {isCurrent && (
                      <span style={{ marginRight: 4, fontSize: 9 }}>✓</span>
                    )}
                    {ws.name}
                  </span>
                  <RoleBadge role={ws.role} />
                </button>
              )
            })}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: colors.border }} />

          {/* Create workspace */}
          <div style={{ padding: `${space[1]}px 0` }}>
            {creating ? (
              <div style={{ padding: `${space[2]}px ${space[3]}px` }}>
                <input
                  ref={inputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter')  { e.preventDefault(); handleCreate() }
                    if (e.key === 'Escape') { setCreating(false); setNewName('') }
                  }}
                  placeholder="Workspace name"
                  style={{
                    width:      '100%',
                    padding:    `${space[1.5]}px ${space[2]}px`,
                    fontFamily: fonts.mono,
                    fontSize:   fontSize.caption,
                    border:     `1px solid ${colors.borderStrong}`,
                    borderRadius: radius.md,
                    background: colors.bgBase,
                    color:      colors.fg1,
                    outline:    'none',
                    boxSizing:  'border-box',
                  }}
                />
                {error && (
                  <p style={{
                    fontFamily: fonts.mono,
                    fontSize: fontSize.label,
                    color: colors.danger,
                    margin: `${space[1]}px 0 0`,
                  }}>
                    {error}
                  </p>
                )}
                <div style={{ display: 'flex', gap: space[1.5], marginTop: space[2] }}>
                  <button
                    onClick={handleCreate}
                    disabled={!newName.trim() || loading}
                    style={{
                      flex:       1,
                      padding:    `${space[1]}px 0`,
                      fontFamily: fonts.mono,
                      fontSize:   fontSize.label,
                      fontWeight: 600,
                      border:     'none',
                      borderRadius: radius.sm,
                      background: newName.trim() && !loading ? colors.accent : colors.bgElevated,
                      color:      newName.trim() && !loading ? '#fff' : colors.fg3,
                      cursor:     newName.trim() && !loading ? 'pointer' : 'default',
                    }}
                  >
                    {loading ? '…' : 'Create'}
                  </button>
                  <button
                    onClick={() => { setCreating(false); setNewName(''); setError(null) }}
                    style={{
                      padding:    `${space[1]}px ${space[2]}px`,
                      fontFamily: fonts.mono,
                      fontSize:   fontSize.label,
                      border:     `1px solid ${colors.border}`,
                      borderRadius: radius.sm,
                      background: 'transparent',
                      color:      colors.fg2,
                      cursor:     'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                style={{
                  width:      '100%',
                  textAlign:  'left',
                  padding:    `${space[2]}px ${space[4]}px`,
                  fontFamily: fonts.mono,
                  fontSize:   fontSize.caption,
                  color:      colors.fg3,
                  background: 'transparent',
                  border:     'none',
                  cursor:     'pointer',
                  transition: `background ${motion.fast}, color ${motion.fast}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = colors.bgElevated
                  e.currentTarget.style.color = colors.fg1
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = colors.fg3
                }}
              >
                + New workspace
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── RoleBadge ────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: Role }) {
  const map: Record<Role, { label: string; color: string; bg: string }> = {
    OWNER: { label: 'owner', color: '#92400E', bg: 'rgba(217,119,6,0.10)' },
    ADMIN: { label: 'admin', color: colors.accent, bg: colors.accentBg },
    MEMBER: { label: 'member', color: colors.fg3, bg: 'transparent' },
  }
  const style = map[role]
  return (
    <span
      style={{
        fontFamily:    fonts.mono,
        fontSize:      9,
        fontWeight:    700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color:         style.color,
        background:    style.bg,
        padding:       '1px 4px',
        borderRadius:  radius.sm,
        flexShrink:    0,
      }}
    >
      {style.label}
    </span>
  )
}
