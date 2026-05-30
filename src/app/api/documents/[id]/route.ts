// api/documents/[id]/route.ts
//
// PATCH /api/documents/:id  — update document title
//
// Requires workspace membership (via requireDocumentAccess).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireDocumentAccess, handleAuthError } from '@/lib/auth/workspace'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    await requireDocumentAccess(id)

    const body = await req.json().catch(() => ({})) as { title?: string }
    if (!body.title || typeof body.title !== 'string') {
      return Response.json({ error: 'title is required.' }, { status: 400 })
    }

    const doc = await db.document.update({
      where: { id },
      data:  { title: body.title.trim() || 'Untitled Proposal' },
      select: { id: true, title: true },
    })

    return Response.json(doc)
  } catch (err) {
    return handleAuthError(err)
  }
}
