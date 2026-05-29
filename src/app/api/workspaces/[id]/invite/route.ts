// api/workspaces/[id]/invite/route.ts
//
// POST /api/workspaces/:id/invite
//
// Creates (or refreshes) an invite for the given email address and sends
// them the invite link via email.
//
// Requires ADMIN role. Re-inviting refreshes the token expiry.
//
// Email delivery:
//   • If RESEND_API_KEY is set → sends via Resend
//   • Otherwise → logs the invite URL to the console (dev mode)
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireWorkspaceAccess, handleAuthError } from '@/lib/auth/workspace'
import type { Role } from '@prisma/client'

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000  // 7 days

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const { userId } = await requireWorkspaceAccess(id, 'ADMIN')

    const body = await req.json().catch(() => ({})) as {
      email?: string
      role?: Role
    }

    if (!body.email?.trim()) {
      return Response.json({ error: 'email is required.' }, { status: 400 })
    }

    const email = body.email.trim().toLowerCase()
    const role: Role = body.role ?? 'MEMBER'

    // Check if the email belongs to an existing member
    const existingUser = await db.user.findUnique({
      where: { email },
      select: { id: true },
    })
    if (existingUser) {
      const alreadyMember = await db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: id, userId: existingUser.id } },
      })
      if (alreadyMember) {
        return Response.json(
          { error: `${email} is already a member of this workspace.` },
          { status: 409 },
        )
      }
    }

    const expiresAt = new Date(Date.now() + INVITE_TTL_MS)

    // Upsert: re-invite refreshes expiry and role
    const invite = await db.workspaceInvite.upsert({
      where:  { workspaceId_email: { workspaceId: id, email } },
      create: { workspaceId: id, email, role, invitedById: userId, expiresAt },
      update: { role, invitedById: userId, expiresAt, acceptedAt: null },
      include: { workspace: { select: { name: true } } },
    })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:4000'
    const inviteUrl = `${appUrl}/invite/${invite.token}`

    await deliverInviteEmail({
      to:            email,
      workspaceName: invite.workspace.name,
      inviteUrl,
    })

    return Response.json({ ok: true, inviteUrl })
  } catch (err) {
    return handleAuthError(err)
  }
}

// ── Email delivery ────────────────────────────────────────────────────────────

async function deliverInviteEmail({
  to,
  workspaceName,
  inviteUrl,
}: {
  to: string
  workspaceName: string
  inviteUrl: string
}) {
  if (process.env.RESEND_API_KEY) {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from:    `PitchPad <invites@${process.env.RESEND_FROM_DOMAIN ?? 'pitchpad.app'}>`,
      to,
      subject: `You've been invited to ${workspaceName} on PitchPad`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="font-size:18px;font-weight:600;color:#111827">
            You've been invited to join ${workspaceName}
          </h2>
          <p style="color:#6B7280;font-size:14px">
            Accept the invitation to start collaborating on proposals.
          </p>
          <a href="${inviteUrl}"
             style="display:inline-block;background:#111827;color:#fff;
                    padding:10px 22px;border-radius:6px;text-decoration:none;
                    font-family:monospace;font-size:13px;font-weight:600;
                    margin:16px 0">
            Accept invitation
          </a>
          <p style="color:#9CA3AF;font-size:12px">
            Link expires in 7 days. If you didn't expect this, you can safely ignore it.
          </p>
        </div>
      `,
    })
  } else {
    // Development fallback — log to console so you can test the flow without Resend
    console.log(`\n[invite] ${to} → workspace invite\n${inviteUrl}\n`)
  }
}
