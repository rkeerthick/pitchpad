// lib/auth/workspace.ts
//
// THE single source of server-side access-control logic for PitchPad.
// Import only from server code (route handlers, server components, server actions).
//
// ── Protection layers ────────────────────────────────────────────────────────
//
//  This module is Layer 2. It sits behind Clerk middleware (Layer 1) which
//  already guarantees a valid session exists before any handler runs.
//
//  Layer 2 answers the authorization question:
//    "Does this authenticated user have the required role in this workspace?"
//
// ── Usage in route handlers ───────────────────────────────────────────────────
//
//   export async function GET(req, { params }) {
//     const { id } = await params
//     try {
//       await requireWorkspaceAccess(id)           // throws ForbiddenError if not a member
//       const docs = await db.document.findMany({ where: { workspaceId: id } })
//       return Response.json(docs)
//     } catch (err) {
//       return handleAuthError(err)               // converts ForbiddenError → 403 JSON
//     }
//   }
//
// ── Usage in Server Components ────────────────────────────────────────────────
//
//   try {
//     await requireDocumentAccess(docId)
//   } catch (err) {
//     if (err instanceof ForbiddenError) notFound()
//     throw err
//   }
//
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'
import { auth } from '@clerk/nextjs/server'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import type { Role } from '@prisma/client'

// ── Role hierarchy ────────────────────────────────────────────────────────────

const ROLE_RANK: Record<Role, number> = { OWNER: 3, ADMIN: 2, MEMBER: 1 }

function satisfiesRole(actual: Role, minimum: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[minimum]
}

// ── ForbiddenError ────────────────────────────────────────────────────────────
// Thrown when the user is authenticated but lacks access.
// Route handlers catch this and return 403 JSON via handleAuthError().
// Server components catch this and call notFound() (don't leak existence).

export class ForbiddenError extends Error {
  readonly status = 403
  constructor(msg = 'Forbidden') {
    super(msg)
    this.name = 'ForbiddenError'
  }
}

// ── requireWorkspaceAccess ────────────────────────────────────────────────────
//
// Verifies the current user is a member of the given workspace with at least
// `minRole` (default: MEMBER).
//
// Returns { userId, member } so callers can use the role in business logic.
// Throws ForbiddenError if not a member or role is insufficient.

export async function requireWorkspaceAccess(
  workspaceId: string,
  minRole: Role = 'MEMBER',
): Promise<{ userId: string; member: { role: Role } }> {
  const { userId } = await auth()
  if (!userId) throw new ForbiddenError()

  const member = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  })

  if (!member || !satisfiesRole(member.role, minRole)) {
    throw new ForbiddenError()
  }

  return { userId, member }
}

// ── requireWorkspaceSlugAccess ────────────────────────────────────────────────
//
// Like requireWorkspaceAccess but takes a slug instead of an ID.
// Used in workspace layout / page server components where only the slug
// is available from the URL params.
//
// Returns the full Workspace row (id, name, slug) plus member info.

export async function requireWorkspaceSlugAccess(
  slug: string,
  minRole: Role = 'MEMBER',
) {
  const { userId } = await auth()
  if (!userId) throw new ForbiddenError()

  const workspace = await db.workspace.findUnique({
    where: { slug },
    include: {
      members: {
        where: { userId },
        select: { role: true },
      },
    },
  })

  // notFound() for missing slugs — don't leak whether a workspace exists
  if (!workspace) notFound()

  const member = workspace.members[0]
  if (!member || !satisfiesRole(member.role, minRole)) {
    // Also notFound() — don't reveal "this workspace exists but you can't see it"
    notFound()
  }

  return { userId, workspace, member }
}

// ── requireDocumentAccess ─────────────────────────────────────────────────────
//
// For routes where only a docId is known (e.g. /doc/[id]).
//
// Steps:
//   1. Fetch the document to get its workspaceId (SELECT workspace_id WHERE id=$1)
//   2. Check workspace membership
//
// notFound() for missing documents (prevents leaking their existence).
// ForbiddenError for membership failure.

export async function requireDocumentAccess(
  docId: string,
  minRole: Role = 'MEMBER',
): Promise<{ userId: string; workspaceId: string; member: { role: Role } }> {
  const { userId } = await auth()
  if (!userId) throw new ForbiddenError()

  const doc = await db.document.findUnique({
    where: { id: docId },
    select: { workspaceId: true },
  })

  if (!doc) notFound()

  const member = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: doc.workspaceId, userId } },
    select: { role: true },
  })

  if (!member || !satisfiesRole(member.role, minRole)) {
    throw new ForbiddenError()
  }

  return { userId, workspaceId: doc.workspaceId, member }
}

// ── getCurrentUserId ──────────────────────────────────────────────────────────
// Convenience helper for routes that need the user ID but no membership check
// (e.g. creating a new workspace — there's no existing workspace to check).

export async function getCurrentUserId(): Promise<string> {
  const { userId } = await auth()
  if (!userId) throw new ForbiddenError()
  return userId
}

// ── handleAuthError ───────────────────────────────────────────────────────────
// Converts a ForbiddenError into a JSON 403 Response for use in route handlers.
// Re-throws any other error so the runtime can handle it.

export function handleAuthError(err: unknown): Response {
  if (err instanceof ForbiddenError) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  // If next/navigation notFound() was somehow thrown (shouldn't reach route handlers
  // but handle defensively)
  if (
    err !== null &&
    typeof err === 'object' &&
    'digest' in err &&
    typeof (err as { digest: unknown }).digest === 'string' &&
    (err as { digest: string }).digest.startsWith('NEXT_NOT_FOUND')
  ) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  throw err
}
