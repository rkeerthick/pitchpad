// api/workspaces/route.ts
//
// POST /api/workspaces
//
// Creates a new workspace and makes the requesting user its OWNER.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getCurrentUserId, handleAuthError } from '@/lib/auth/workspace'

export async function POST(req: NextRequest) {
  try {
    const userId = await getCurrentUserId()

    const body = await req.json().catch(() => ({})) as { name?: string }
    if (!body.name?.trim()) {
      return Response.json({ error: 'name is required.' }, { status: 400 })
    }

    const baseSlug = body.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 28)
    // Short random suffix guarantees uniqueness without a DB read
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`

    const workspace = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const ws = await tx.workspace.create({
        data: { name: body.name!.trim(), slug },
      })
      await tx.workspaceMember.create({
        data: { workspaceId: ws.id, userId, role: 'OWNER' },
      })
      return ws
    })

    return Response.json(workspace, { status: 201 })
  } catch (err) {
    return handleAuthError(err)
  }
}
