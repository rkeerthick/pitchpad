// workspace/[slug]/settings/page.tsx
//
// Workspace settings: member list + invite-by-email form.
// Server-rendered data; client components for interactive actions.
// ─────────────────────────────────────────────────────────────────────────────

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requireWorkspaceSlugAccess, ForbiddenError } from '@/lib/auth/workspace'
import { MembersTable } from '@/components/workspace/MembersTable'
import { InviteForm } from '@/components/workspace/InviteForm'
import { colors, fonts, fontSize, space } from '@/lib/tokens'
import Link from 'next/link'

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  let workspace: { id: string; name: string; slug: string }
  let currentMemberRole: string

  try {
    const result = await requireWorkspaceSlugAccess(slug)
    workspace = { id: result.workspace.id, name: result.workspace.name, slug: result.workspace.slug }
    currentMemberRole = result.member.role
  } catch (err) {
    if (err instanceof ForbiddenError) notFound()
    throw err
  }

  // Fetch members with user details — scoped to this workspace (Layer 3)
  const members = await db.workspaceMember.findMany({
    where:   { workspaceId: workspace.id },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    orderBy: { joinedAt: 'asc' },
  })

  // Fetch pending invites — scoped to this workspace (Layer 3)
  const pendingInvites = await db.workspaceInvite.findMany({
    where:   { workspaceId: workspace.id, acceptedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select:  { id: true, email: true, role: true, createdAt: true, expiresAt: true },
  })

  const canManage = currentMemberRole === 'OWNER' || currentMemberRole === 'ADMIN'

  return (
    <div
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: `${space[10]}px ${space[6]}px`,
      }}
    >
      {/* ── Breadcrumb ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: space[2],
          marginBottom: space[8],
          fontFamily: fonts.mono,
          fontSize: fontSize.label,
          color: colors.fg3,
        }}
      >
        <Link
          href={`/workspace/${slug}`}
          style={{ color: colors.fg3, textDecoration: 'none' }}
        >
          {workspace.name}
        </Link>
        <span>/</span>
        <span style={{ color: colors.fg1 }}>Settings</span>
      </div>

      {/* ── Members ────────────────────────────────────────────────────────── */}
      <section style={{ marginBottom: space[12] }}>
        <h2
          style={{
            fontFamily: fonts.sans,
            fontSize: fontSize.md,
            fontWeight: 600,
            color: colors.fg1,
            margin: `0 0 ${space[1]}px`,
          }}
        >
          Members
        </h2>
        <p
          style={{
            fontFamily: fonts.mono,
            fontSize: fontSize.caption,
            color: colors.fg3,
            marginBottom: space[5],
          }}
        >
          {members.length} member{members.length !== 1 ? 's' : ''}
        </p>

        <MembersTable
          members={members}
          currentUserId={userId}
          currentRole={currentMemberRole}
          workspaceId={workspace.id}
        />
      </section>

      {/* ── Invite ─────────────────────────────────────────────────────────── */}
      {canManage && (
        <section style={{ marginBottom: space[12] }}>
          <h2
            style={{
              fontFamily: fonts.sans,
              fontSize: fontSize.md,
              fontWeight: 600,
              color: colors.fg1,
              margin: `0 0 ${space[1]}px`,
            }}
          >
            Invite people
          </h2>
          <p
            style={{
              fontFamily: fonts.mono,
              fontSize: fontSize.caption,
              color: colors.fg3,
              marginBottom: space[5],
            }}
          >
            Invites are valid for 7 days.
          </p>

          <InviteForm workspaceId={workspace.id} />

          {/* Pending invites */}
          {pendingInvites.length > 0 && (
            <div style={{ marginTop: space[6] }}>
              <p
                style={{
                  fontFamily: fonts.mono,
                  fontSize: fontSize.label,
                  color: colors.fg3,
                  marginBottom: space[3],
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Pending invites
              </p>
              {pendingInvites.map((inv) => (
                <div
                  key={inv.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: `${space[2]}px ${space[3]}px`,
                    borderBottom: `1px solid ${colors.border}`,
                    fontFamily: fonts.mono,
                    fontSize: fontSize.caption,
                  }}
                >
                  <span style={{ color: colors.fg1 }}>{inv.email}</span>
                  <div style={{ display: 'flex', gap: space[4], alignItems: 'center' }}>
                    <span
                      style={{
                        color: colors.fg3,
                        fontSize: fontSize.label,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {inv.role}
                    </span>
                    <span style={{ color: colors.fg3, fontSize: fontSize.label }}>
                      expires{' '}
                      {new Date(inv.expiresAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
