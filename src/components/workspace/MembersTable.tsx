'use client'

// MembersTable.tsx
//
// Renders the workspace member list with role badges and a remove button.
// Only OWNERs and ADMINs see the remove button (owners can't be removed by admins).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { colors, fonts, fontSize, space, radius, motion } from '@/lib/tokens'
import type { Role } from '@prisma/client'

interface Member {
  id: string
  role: Role
  user: {
    id: string
    name: string | null
    email: string
    avatarUrl: string | null
  }
}

interface Props {
  members: Member[]
  currentUserId: string
  currentRole: string
  workspaceId: string
}

export function MembersTable({ members, currentUserId, currentRole, workspaceId }: Props) {
  const router = useRouter()
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)

  const canManage = currentRole === 'OWNER' || currentRole === 'ADMIN'

  async function handleRemove(targetUserId: string) {
    if (removing) return
    setRemoving(targetUserId)
    setError(null)

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ targetUserId }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }

      if (!res.ok) {
        setError(data.error ?? 'Failed to remove member.')
        return
      }

      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div>
      {error && (
        <p
          style={{
            fontFamily: fonts.mono,
            fontSize:   fontSize.caption,
            color:      colors.danger,
            marginBottom: space[3],
          }}
        >
          {error}
        </p>
      )}

      <div
        style={{
          border:       `1px solid ${colors.border}`,
          borderRadius: radius.xl,
          overflow:     'hidden',
        }}
      >
        {members.map((m, i) => {
          const isMe    = m.user.id === currentUserId
          const isOwner = m.role === 'OWNER'
          const canRemove =
            canManage && !isMe && !(isOwner && currentRole !== 'OWNER')

          return (
            <div
              key={m.id}
              style={{
                display:        'flex',
                alignItems:     'center',
                gap:            space[3],
                padding:        `${space[3]}px ${space[4]}px`,
                borderBottom:   i < members.length - 1 ? `1px solid ${colors.border}` : 'none',
                background:     isMe ? colors.accentBg : 'transparent',
              }}
            >
              {/* Avatar */}
              <Avatar name={m.user.name} avatarUrl={m.user.avatarUrl} />

              {/* Name + email */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily:  fonts.sans,
                    fontSize:    fontSize.base,
                    fontWeight:  isMe ? 600 : 400,
                    color:       colors.fg1,
                    overflow:    'hidden',
                    textOverflow:'ellipsis',
                    whiteSpace:  'nowrap',
                  }}
                >
                  {m.user.name ?? m.user.email}
                  {isMe && (
                    <span
                      style={{
                        marginLeft:  space[2],
                        fontFamily:  fonts.mono,
                        fontSize:    9,
                        color:       colors.fg3,
                        fontWeight:  400,
                      }}
                    >
                      you
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontFamily:  fonts.mono,
                    fontSize:    fontSize.label,
                    color:       colors.fg3,
                    overflow:    'hidden',
                    textOverflow:'ellipsis',
                    whiteSpace:  'nowrap',
                  }}
                >
                  {m.user.email}
                </div>
              </div>

              {/* Role badge */}
              <RoleBadge role={m.role} />

              {/* Remove button */}
              {canRemove && (
                <button
                  onClick={() => handleRemove(m.user.id)}
                  disabled={removing === m.user.id}
                  style={{
                    padding:      `${space[1]}px ${space[2]}px`,
                    fontFamily:   fonts.mono,
                    fontSize:     fontSize.label,
                    border:       `1px solid ${colors.border}`,
                    borderRadius: radius.md,
                    background:   'transparent',
                    color:        removing === m.user.id ? colors.fg3 : colors.fg2,
                    cursor:       removing === m.user.id ? 'default' : 'pointer',
                    transition:   `background ${motion.fast}, color ${motion.fast}, border-color ${motion.fast}`,
                  }}
                  onMouseEnter={(e) => {
                    if (removing !== m.user.id) {
                      e.currentTarget.style.background    = colors.dangerBg
                      e.currentTarget.style.color         = colors.danger
                      e.currentTarget.style.borderColor   = colors.danger
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background    = 'transparent'
                    e.currentTarget.style.color         = colors.fg2
                    e.currentTarget.style.borderColor   = colors.border
                  }}
                >
                  {removing === m.user.id ? '…' : 'Remove'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ name, avatarUrl }: { name: string | null; avatarUrl: string | null }) {
  const initials = name
    ? name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name ?? 'User'}
        style={{
          width:        32,
          height:       32,
          borderRadius: '50%',
          objectFit:    'cover',
          flexShrink:   0,
        }}
      />
    )
  }

  return (
    <div
      style={{
        width:        32,
        height:       32,
        borderRadius: '50%',
        background:   colors.bgElevated,
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        fontFamily:   fonts.mono,
        fontSize:     fontSize.label,
        fontWeight:   700,
        color:        colors.fg2,
        flexShrink:   0,
      }}
    >
      {initials}
    </div>
  )
}

// ── RoleBadge ────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: Role }) {
  const map: Record<Role, { label: string; color: string; bg: string }> = {
    OWNER:  { label: 'owner',  color: '#92400E', bg: 'rgba(217,119,6,0.10)' },
    ADMIN:  { label: 'admin',  color: colors.accent, bg: colors.accentBg },
    MEMBER: { label: 'member', color: colors.fg3, bg: colors.bgElevated },
  }
  const s = map[role]
  return (
    <span
      style={{
        fontFamily:    fonts.mono,
        fontSize:      9,
        fontWeight:    700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color:         s.color,
        background:    s.bg,
        padding:       '2px 6px',
        borderRadius:  radius.sm,
        flexShrink:    0,
      }}
    >
      {s.label}
    </span>
  )
}
