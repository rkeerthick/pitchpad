// api/webhooks/clerk/route.ts
//
// Receives signed webhook events from Clerk and syncs user records to our DB.
//
// ── Events handled ────────────────────────────────────────────────────────────
//
//   user.created  → upsert User row + create personal workspace (OWNER)
//   user.updated  → update email / name / avatarUrl
//
// ── Security ─────────────────────────────────────────────────────────────────
//
//   Every request is verified against CLERK_WEBHOOK_SECRET using the svix
//   library. An invalid signature returns 400 immediately — no DB writes.
//   This endpoint is public (no Clerk session required) because Clerk itself
//   calls it from its own servers with no browser session.
//
// ── Provisioning race condition ───────────────────────────────────────────────
//
//   The user.created webhook fires asynchronously. If the user navigates to
//   the app before it arrives, src/app/page.tsx handles on-demand provisioning
//   via currentUser() as a fallback.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { Webhook } from 'svix'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

// ── Clerk event types (minimal — only what we need) ───────────────────────────

interface ClerkEmailAddress {
  email_address: string
  id: string
}

interface ClerkUserPayload {
  id: string
  email_addresses: ClerkEmailAddress[]
  primary_email_address_id: string | null
  first_name: string | null
  last_name: string | null
  image_url: string | null
}

type ClerkEvent =
  | { type: 'user.created'; data: ClerkUserPayload }
  | { type: 'user.updated'; data: ClerkUserPayload }

function getPrimaryEmail(payload: ClerkUserPayload): string {
  const primary = payload.email_addresses.find(
    (e) => e.id === payload.primary_email_address_id,
  )
  return (primary ?? payload.email_addresses[0])?.email_address ?? ''
}

function getDisplayName(payload: ClerkUserPayload, email: string): string {
  return (
    [payload.first_name, payload.last_name].filter(Boolean).join(' ') ||
    email.split('@')[0]
  )
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SECRET
  if (!secret) {
    console.error('[webhook/clerk] CLERK_WEBHOOK_SECRET not set')
    return new Response('Webhook secret not configured', { status: 500 })
  }

  // ── Verify svix signature ────────────────────────────────────────────────
  const svixId        = req.headers.get('svix-id')
  const svixTimestamp = req.headers.get('svix-timestamp')
  const svixSignature = req.headers.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Missing svix headers', { status: 400 })
  }

  const body = await req.text()
  const wh = new Webhook(secret)

  let event: ClerkEvent
  try {
    event = wh.verify(body, {
      'svix-id':        svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkEvent
  } catch (err) {
    console.error('[webhook/clerk] Invalid signature', err)
    return new Response('Invalid webhook signature', { status: 400 })
  }

  // ── Handle user.created ───────────────────────────────────────────────────
  if (event.type === 'user.created') {
    const { id, image_url } = event.data
    const email = getPrimaryEmail(event.data)
    const name  = getDisplayName(event.data, email)

    // slug: "john-doe-abc123" — safe, unique across all workspaces
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24)
    const slug = `${baseSlug}-${id.slice(-6)}`

    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.user.upsert({
        where:  { id },
        create: { id, email, name, avatarUrl: image_url },
        update: { email, name, avatarUrl: image_url },
      })

      // Only create workspace if one doesn't already exist
      // (idempotent — safe to call twice)
      const existingMember = await tx.workspaceMember.findFirst({ where: { userId: id } })
      if (!existingMember) {
        const workspace = await tx.workspace.create({
          data: { name: `${name}'s workspace`, slug },
        })
        await tx.workspaceMember.create({
          data: { workspaceId: workspace.id, userId: id, role: 'OWNER' },
        })
      }
    })
  }

  // ── Handle user.updated ───────────────────────────────────────────────────
  if (event.type === 'user.updated') {
    const { id, image_url } = event.data
    const email = getPrimaryEmail(event.data)
    const name  = getDisplayName(event.data, email)

    await db.user.upsert({
      where:  { id },
      create: { id, email, name, avatarUrl: image_url },
      update: { email, name, avatarUrl: image_url },
    })
  }

  return Response.json({ ok: true })
}
