// api/workspaces/[id]/members/route.ts
//
// GET    /api/workspaces/:id/members  — list all members with user info
// DELETE /api/workspaces/:id/members  — remove a member (body: { targetUserId })
//
// DELETE requires ADMIN role. Owners can't be removed by admins.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireWorkspaceAccess, handleAuthError } from '@/lib/auth/workspace'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    await requireWorkspaceAccess(id)

    const members = await db.workspaceMember.findMany({
      where:   { workspaceId: id },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      orderBy: { joinedAt: 'asc' },
    })

    return Response.json(members)
  } catch (err) {
    return handleAuthError(err)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const { userId: requestingUserId, member: requestingMember } =
      await requireWorkspaceAccess(id, 'ADMIN')

    const body = await req.json().catch(() => ({})) as { targetUserId?: string }
    if (!body.targetUserId) {
      return Response.json({ error: 'targetUserId is required.' }, { status: 400 })
    }

    if (body.targetUserId === requestingUserId) {
      return Response.json(
        { error: 'You cannot remove yourself. Transfer ownership first.' },
        { status: 400 },
      )
    }

    const target = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId: body.targetUserId } },
    })

    if (!target) {
      return Response.json({ error: 'Member not found.' }, { status: 404 })
    }

    // Admins cannot remove owners — prevents privilege escalation
    if (target.role === 'OWNER' && requestingMember.role !== 'OWNER') {
      return Response.json(
        { error: 'Only owners can remove other owners.' },
        { status: 403 },
      )
    }

    await db.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId: id, userId: body.targetUserId } },
    })

    return Response.json({ ok: true })
  } catch (err) {
    return handleAuthError(err)
  }
}
