// doc/[id]/page.tsx — Server Component
//
// ── Auth check ────────────────────────────────────────────────────────────────
//
//   requireDocumentAccess(id) is Layer 2 of route protection:
//     1. auth() → gets userId from the verified Clerk JWT (server-side)
//     2. SELECT workspace_id FROM documents WHERE id = :id
//        → notFound() if no row (don't leak existence)
//     3. SELECT FROM workspace_members WHERE workspace_id = :wsId AND user_id = :userId
//        → ForbiddenError if not a member
//
//   Middleware (Layer 1) already guaranteed a valid session exists before
//   this server component runs. We catch ForbiddenError and call notFound()
//   to avoid leaking whether a document exists in a workspace you can't see.
//
// ── Collab ────────────────────────────────────────────────────────────────────
//
//   DocEditorLoader uses dynamic(ssr:false) to load DocEditorClient, which
//   initialises a Yjs Y.Doc and WebsocketProvider for the live collab session.
//   The Y.Doc room name is "pitchpad-doc-{id}" — unchanged from before auth.
// ─────────────────────────────────────────────────────────────────────────────

import { requireDocumentAccess, ForbiddenError } from '@/lib/auth/workspace'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import DocEditorLoader from './DocEditorLoader'

export default async function DocPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  try {
    await requireDocumentAccess(id)
  } catch (err) {
    if (err instanceof ForbiddenError) notFound()
    throw err
  }

  const doc = await db.document.findUnique({
    where:  { id },
    select: { title: true },
  })

  return <DocEditorLoader docId={id} initialTitle={doc?.title ?? 'Untitled Proposal'} />
}
