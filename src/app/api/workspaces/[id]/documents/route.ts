// api/workspaces/[id]/documents/route.ts
//
// GET  /api/workspaces/:id/documents  — list all documents in a workspace
// POST /api/workspaces/:id/documents  — create a new document
//
// Both routes require workspace membership (Layer 2 check).
// All queries are scoped to workspaceId (Layer 3).
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

    const docs = await db.document.findMany({
      where: { workspaceId: id },             // Layer 3: scoped to this workspace
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    })

    return Response.json(docs)
  } catch (err) {
    return handleAuthError(err)
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    await requireWorkspaceAccess(id)

    const body = await req.json().catch(() => ({})) as { title?: string }

    const doc = await db.document.create({
      data: {
        workspaceId: id,                      // Layer 3: explicitly scoped
        title: body.title?.trim() || 'Untitled Proposal',
      },
    })

    return Response.json(doc, { status: 201 })
  } catch (err) {
    return handleAuthError(err)
  }
}
