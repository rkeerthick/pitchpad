'use client'

// InviteForm.tsx
//
// Invite-by-email form for the workspace settings page.
// POSTs to /api/workspaces/:id/invite.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { colors, fonts, fontSize, space, radius, motion } from '@/lib/tokens'
import type { Role } from '@prisma/client'

const ROLES: { value: Role; label: string }[] = [
  { value: 'MEMBER', label: 'Member' },
  { value: 'ADMIN',  label: 'Admin'  },
]

interface Props {
  workspaceId: string
}

export function InviteForm({ workspaceId }: Props) {
  const router = useRouter()
  const [email, setEmail]   = useState('')
  const [role, setRole]     = useState<Role>('MEMBER')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError]   = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || loading) return

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/invite`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim(), role }),
      })

      const data = await res.json() as { ok?: boolean; inviteUrl?: string; error?: string }

      if (!res.ok) {
        setError(data.error ?? 'Failed to send invite.')
        return
      }

      setSuccess(`Invite sent to ${email.trim()}`)
      setEmail('')
      router.refresh()   // refresh pending invites list

    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}
    >
      <div style={{ display: 'flex', gap: space[2] }}>
        {/* Email input */}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="colleague@company.com"
          required
          style={{
            flex:       1,
            padding:    `${space[2]}px ${space[3]}px`,
            fontFamily: fonts.mono,
            fontSize:   fontSize.caption,
            border:     `1px solid ${colors.border}`,
            borderRadius: radius.lg,
            background: colors.bgSurface,
            color:      colors.fg1,
            outline:    'none',
          }}
          onFocus={(e)  => { e.currentTarget.style.borderColor = colors.borderStrong }}
          onBlur={(e)   => { e.currentTarget.style.borderColor = colors.border }}
        />

        {/* Role selector */}
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          style={{
            padding:    `${space[2]}px ${space[3]}px`,
            fontFamily: fonts.mono,
            fontSize:   fontSize.caption,
            border:     `1px solid ${colors.border}`,
            borderRadius: radius.lg,
            background: colors.bgSurface,
            color:      colors.fg1,
            cursor:     'pointer',
            outline:    'none',
          }}
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>

        {/* Submit button */}
        <button
          type="submit"
          disabled={!email.trim() || loading}
          style={{
            padding:    `${space[2]}px ${space[4]}px`,
            fontFamily: fonts.mono,
            fontSize:   fontSize.caption,
            fontWeight: 700,
            letterSpacing: '0.04em',
            background: email.trim() && !loading ? colors.fg1 : colors.bgElevated,
            color:      email.trim() && !loading ? '#fff' : colors.fg3,
            border:     'none',
            borderRadius: radius.lg,
            cursor:     email.trim() && !loading ? 'pointer' : 'default',
            transition: `opacity ${motion.fast}`,
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => { if (email.trim() && !loading) e.currentTarget.style.opacity = '0.85' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
        >
          {loading ? '…' : 'Send invite'}
        </button>
      </div>

      {/* Feedback */}
      {success && (
        <p
          style={{
            fontFamily: fonts.mono,
            fontSize:   fontSize.caption,
            color:      colors.success,
          }}
        >
          ✓ {success}
        </p>
      )}
      {error && (
        <p
          style={{
            fontFamily: fonts.mono,
            fontSize:   fontSize.caption,
            color:      colors.danger,
          }}
        >
          {error}
        </p>
      )}
    </form>
  )
}
