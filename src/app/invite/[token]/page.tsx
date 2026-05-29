// invite/[token]/page.tsx
//
// Public invite landing page.
//
// Accessible without auth so the user can preview what they're joining before
// signing in. Once signed in, the "Accept" button calls POST /api/invite/:token.
//
// If the user is not signed in → "Sign in to accept" → redirect to /sign-in
// with the current URL as the afterSignInUrl so Clerk brings them back here.
// ─────────────────────────────────────────────────────────────────────────────

import { auth } from '@clerk/nextjs/server'
import { colors, fonts, fontSize, space, radius, shadow } from '@/lib/tokens'
import { AcceptInviteButton } from './AcceptInviteButton'

interface InviteData {
  workspaceName: string
  workspaceSlug: string
  invitedByName: string | null
  email: string
  role: string
  expiresAt: string
}

async function fetchInviteData(token: string): Promise<InviteData | null> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:4000'
  const res = await fetch(`${appUrl}/api/invite/${token}`, {
    cache: 'no-store',
  })
  if (!res.ok) return null
  return res.json() as Promise<InviteData>
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const { userId } = await auth()

  const invite = await fetchInviteData(token)

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.bgBase,
        padding: space[6],
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: colors.bgSurface,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.xl,
          padding: `${space[8]}px`,
          boxShadow: shadow.lg,
        }}
      >
        {/* Logo */}
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: fontSize.label,
            fontWeight: 700,
            letterSpacing: '0.10em',
            color: colors.fg3,
            marginBottom: space[6],
          }}
        >
          PITCHPAD
        </div>

        {invite === null ? (
          <>
            <h1
              style={{
                fontFamily: fonts.sans,
                fontSize: fontSize.lg,
                fontWeight: 700,
                color: colors.fg1,
                margin: `0 0 ${space[2]}px`,
              }}
            >
              Invite not found
            </h1>
            <p
              style={{
                fontFamily: fonts.mono,
                fontSize: fontSize.caption,
                color: colors.fg3,
              }}
            >
              This invite link has expired or already been used.
            </p>
          </>
        ) : (
          <>
            <h1
              style={{
                fontFamily: fonts.sans,
                fontSize: fontSize.lg,
                fontWeight: 700,
                color: colors.fg1,
                margin: `0 0 ${space[2]}px`,
              }}
            >
              You're invited to join
            </h1>
            <p
              style={{
                fontFamily: fonts.sans,
                fontSize: fontSize.xl,
                fontWeight: 700,
                color: colors.fg1,
                margin: `0 0 ${space[4]}px`,
              }}
            >
              {invite.workspaceName}
            </p>

            {invite.invitedByName && (
              <p
                style={{
                  fontFamily: fonts.mono,
                  fontSize: fontSize.caption,
                  color: colors.fg3,
                  marginBottom: space[6],
                }}
              >
                Invited by {invite.invitedByName} · Role:{' '}
                <span style={{ color: colors.fg2 }}>{invite.role}</span>
              </p>
            )}

            {/* Invite email notice */}
            <div
              style={{
                background: colors.accentBg,
                border: `1px solid rgba(37,99,235,0.20)`,
                borderRadius: radius.lg,
                padding: `${space[3]}px ${space[4]}px`,
                marginBottom: space[6],
                fontFamily: fonts.mono,
                fontSize: fontSize.caption,
                color: colors.accent,
              }}
            >
              This invite was sent to <strong>{invite.email}</strong>.
              Sign in with that address to accept.
            </div>

            {/* CTA */}
            <AcceptInviteButton
              token={token}
              isSignedIn={!!userId}
              currentUrl={`/invite/${token}`}
            />
          </>
        )}
      </div>
    </div>
  )
}
