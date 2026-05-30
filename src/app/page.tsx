// app/page.tsx — Root page
//
// Redirects authenticated users to their personal workspace.
// Also handles the edge case where the Clerk webhook hasn't fired yet
// (on-demand provisioning via currentUser()).
// ─────────────────────────────────────────────────────────────────────────────

import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

export default async function RootPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  // Find the user's first workspace (personal workspace is created on sign-up)
  const membership = await db.workspaceMember.findFirst({
    where:   { userId },
    include: { workspace: { select: { slug: true } } },
    orderBy: { joinedAt: 'asc' },
  })

  if (membership) {
    redirect(`/workspace/${membership.workspace.slug}`)
  }

  // ── On-demand provisioning ──────────────────────────────────────────────────
  // The Clerk webhook (user.created) is async and may not have fired yet.
  // Fall back to provisioning the user record + workspace here.
  const clerkUser = await currentUser()
  if (!clerkUser) redirect('/sign-in')

  const email =
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
      ?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress ?? ''

  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') ||
    email.split('@')[0]

  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24)
  const slug = `${baseSlug}-${userId.slice(-6)}`

  // Track whether provisioning happened — redirect() must be called OUTSIDE
  // the transaction because Next.js redirect() throws a special error that
  // causes Prisma to roll back the transaction before the data is committed.
  let provisionedSlug: string | null = null

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.user.upsert({
      where:  { id: userId },
      create: { id: userId, email, name, avatarUrl: clerkUser.imageUrl },
      update: { email, name, avatarUrl: clerkUser.imageUrl },
    })

    // Check again inside the transaction to avoid race
    const existing = await tx.workspaceMember.findFirst({ where: { userId } })
    if (!existing) {
      const workspace = await tx.workspace.create({
        data: { name: `${name}'s workspace`, slug },
      })
      await tx.workspaceMember.create({
        data: { workspaceId: workspace.id, userId, role: 'OWNER' },
      })
      provisionedSlug = slug
    }
  })

  // Redirect only after the transaction has fully committed
  redirect(`/workspace/${provisionedSlug ?? slug}`)
}
