// api/invite/[token]/route.ts
//
// GET  /api/invite/:token  — fetch invite metadata (public — for the landing page)
// POST /api/invite/:token  — accept the invite (requires auth)
//
// ── Acceptance security checks ────────────────────────────────────────────────
//
//   1. Token must exist, not be accepted, and not be expired
//   2. The signed-in user's email must match the invite email
//      (prevents someone else from stealing another user's invite)
//   3. Membership is upserted (idempotent accept)
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUserId, handleAuthError } from '@/lib/auth/workspace'

// ── GET — invite preview (public) ────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  const invite = await db.workspaceInvite.findUnique({
    where:   { token },
    include: {
      workspace: { select: { name: true, slug: true } },
      invitedBy: { select: { name: true } },
    },
  })

  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return Response.json({ error: 'Invite not found or expired.' }, { status: 404 })
  }

  return Response.json({
    workspaceName:  invite.workspace.name,
    workspaceSlug:  invite.workspace.slug,
    invitedByName:  invite.invitedBy.name,
    email:          invite.email,
    role:           invite.role,
    expiresAt:      invite.expiresAt,
  })
}

// ── POST — accept invite (requires auth) ─────────────────────────────────────

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  try {
    const userId = await getCurrentUserId()

    const invite = await db.workspaceInvite.findUnique({
      where:   { token },
      include: { workspace: { select: { slug: true } } },
    })

    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      return Response.json({ error: 'Invite not found or expired.' }, { status: 404 })
    }

    // Email match check: prevents invite-token hijacking
    const user = await db.user.findUnique({
      where:  { id: userId },
      select: { email: true },
    })

    if (!user || user.email.toLowerCase() !== invite.email.toLowerCase()) {
      return Response.json(
        {
          error:
            'This invite was sent to a different email address. ' +
            'Please sign in with the invited email to accept.',
        },
        { status: 403 },
      )
    }

    await db.$transaction(async (tx) => {
      // upsert membership — idempotent, safe to call twice
      await tx.workspaceMember.upsert({
        where:  { workspaceId_userId: { workspaceId: invite.workspaceId, userId } },
        create: { workspaceId: invite.workspaceId, userId, role: invite.role },
        update: { role: invite.role },
      })
      // Mark invite as used
      await tx.workspaceInvite.update({
        where: { token },
        data:  { acceptedAt: new Date() },
      })
    })

    return Response.json({ workspaceSlug: invite.workspace.slug })
  } catch (err) {
    return handleAuthError(err)
  }
}
