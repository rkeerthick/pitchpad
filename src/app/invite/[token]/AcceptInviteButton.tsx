'use client'

// AcceptInviteButton.tsx
//
// Client component: handles the accept-invite flow.
//
//   • Not signed in → navigate to /sign-in?redirect_url=/invite/:token
//   • Signed in     → POST /api/invite/:token → navigate to workspace
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { colors, fonts, fontSize, space, radius, motion } from '@/lib/tokens'

interface Props {
  token: string
  isSignedIn: boolean
  currentUrl: string
}

export function AcceptInviteButton({ token, isSignedIn, currentUrl }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAccept() {
    if (!isSignedIn) {
      // Clerk picks up redirect_url and returns the user here after sign-in
      router.push(`/sign-in?redirect_url=${encodeURIComponent(currentUrl)}`)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/invite/${token}`, { method: 'POST' })
      const data = await res.json() as { workspaceSlug?: string; error?: string }

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.')
        return
      }

      router.push(`/workspace/${data.workspaceSlug}`)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleAccept}
        disabled={loading}
        style={{
          width: '100%',
          padding: `${space[3]}px 0`,
          fontFamily: fonts.mono,
          fontSize: fontSize.base,
          fontWeight: 700,
          letterSpacing: '0.04em',
          background: loading ? colors.bgElevated : colors.fg1,
          color: loading ? colors.fg3 : '#fff',
          border: 'none',
          borderRadius: radius.lg,
          cursor: loading ? 'default' : 'pointer',
          transition: `opacity ${motion.fast}`,
        }}
        onMouseEnter={(e) => {
          if (!loading) e.currentTarget.style.opacity = '0.85'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '1'
        }}
      >
        {loading ? 'Accepting…' : isSignedIn ? 'Accept invitation' : 'Sign in to accept'}
      </button>

      {error && (
        <p
          style={{
            fontFamily: fonts.mono,
            fontSize: fontSize.caption,
            color: colors.danger,
            marginTop: space[3],
            textAlign: 'center',
          }}
        >
          {error}
        </p>
      )}
    </div>
  )
}
