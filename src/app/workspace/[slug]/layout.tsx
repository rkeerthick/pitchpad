// workspace/[slug]/layout.tsx
//
// Protected layout for all workspace pages.
//
// ── What this does ────────────────────────────────────────────────────────────
//
//   1. Verifies the current user is a member of this workspace (Layer 2).
//      Uses requireWorkspaceSlugAccess() which calls notFound() for both
//      "workspace doesn't exist" and "user isn't a member" — preventing
//      existence disclosure.
//
//   2. Fetches all the user's workspaces for the WorkspaceSwitcher.
//
//   3. Renders the top nav with WorkspaceSwitcher + Clerk UserButton.
//
// ── Layout structure ──────────────────────────────────────────────────────────
//
//   <root layout (ClerkProvider)>
//     <workspace layout (nav)>
//       <workspace page content>
// ─────────────────────────────────────────────────────────────────────────────

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { requireWorkspaceSlugAccess } from '@/lib/auth/workspace'
import { WorkspaceSwitcher } from '@/components/workspace/WorkspaceSwitcher'
import { UserButton } from '@clerk/nextjs'
import { colors, fonts, fontSize, space } from '@/lib/tokens'

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  // Layer 2: verify membership. notFound() if not a member or workspace missing.
  await requireWorkspaceSlugAccess(slug)

  // Fetch all workspaces for the switcher
  const memberships = await db.workspaceMember.findMany({
    where:   { userId },
    include: { workspace: { select: { id: true, name: true, slug: true } } },
    orderBy: { joinedAt: 'asc' },
  })

  const workspaceList = memberships.map((m) => ({
    ...m.workspace,
    role: m.role,
  }))

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: colors.bgBase,
      }}
    >
      {/* ── Top nav ────────────────────────────────────────────────────────── */}
      <nav
        style={{
          height: 48,
          flexShrink: 0,
          borderBottom: `1px solid ${colors.border}`,
          background: colors.bgBase,
          display: 'flex',
          alignItems: 'center',
          padding: `0 ${space[4]}px`,
          gap: space[3],
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        {/* Logo */}
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: fontSize.caption,
            fontWeight: 700,
            letterSpacing: '0.10em',
            color: colors.fg1,
          }}
        >
          PITCHPAD
        </span>

        {/* Separator */}
        <span
          style={{
            width: 1,
            height: 16,
            background: colors.border,
            flexShrink: 0,
          }}
        />

        {/* Workspace switcher */}
        <WorkspaceSwitcher workspaces={workspaceList} currentSlug={slug} />

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Clerk user button */}
        <UserButton />
      </nav>

      {/* ── Page content ─────────────────────────────────────────────────── */}
      <main style={{ flex: 1 }}>
        {children}
      </main>
    </div>
  )
}
