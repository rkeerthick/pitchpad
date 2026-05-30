// workspace/[slug]/page.tsx
//
// Document list for a workspace. Server-rendered.
//
// The layout already verified workspace membership — this page calls
// requireWorkspaceSlugAccess() again as belt-and-suspenders (the hard rule:
// every DB query must verify access). The second call is a no-op if the
// layout already ran, but protects against direct page access without layout.
// ─────────────────────────────────────────────────────────────────────────────

// Never serve a cached version — document titles must always be fresh
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireWorkspaceSlugAccess } from '@/lib/auth/workspace'
import { db } from '@/lib/db'
import { ForbiddenError } from '@/lib/auth/workspace'
import { notFound } from 'next/navigation'
import { NewDocumentButton } from '@/components/workspace/NewDocumentButton'
import { DocCard } from './DocCard'
import { Refresher } from './Refresher'
import { colors, fonts, fontSize, space } from '@/lib/tokens'

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  let workspaceId: string
  try {
    const { workspace } = await requireWorkspaceSlugAccess(slug)
    workspaceId = workspace.id
  } catch (err) {
    if (err instanceof ForbiddenError) notFound()
    throw err
  }

  // Layer 3: query scoped to this workspace
  const documents = await db.document.findMany({
    where:   { workspaceId },
    orderBy: { updatedAt: 'desc' },
    select:  { id: true, title: true, updatedAt: true, createdAt: true },
  })

  return (
    <div
      style={{
        maxWidth: 860,
        margin: '0 auto',
        padding: `${space[10]}px ${space[6]}px`,
      }}
    >
      <Refresher />
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: space[8],
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: fonts.sans,
              fontSize: fontSize.xl,
              fontWeight: 700,
              color: colors.fg1,
              margin: 0,
            }}
          >
            Proposals
          </h1>
          <p
            style={{
              fontFamily: fonts.mono,
              fontSize: fontSize.caption,
              color: colors.fg3,
              marginTop: space[1],
            }}
          >
            {documents.length} document{documents.length !== 1 ? 's' : ''}
          </p>
        </div>
        <NewDocumentButton workspaceId={workspaceId} />
      </div>

      {/* ── Document grid ──────────────────────────────────────────────────── */}
      {documents.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: `${space[20]}px ${space[6]}px`,
            fontFamily: fonts.mono,
            fontSize: fontSize.caption,
            color: colors.fg3,
          }}
        >
          No documents yet.{' '}
          <span style={{ color: colors.accent }}>Create your first proposal.</span>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: space[4],
          }}
        >
          {documents.map((doc) => (
            <DocCard key={doc.id} doc={doc} />
          ))}
        </div>
      )}

      {/* Settings link */}
      <div
        style={{
          marginTop: space[16],
          paddingTop: space[6],
          borderTop: `1px solid ${colors.border}`,
        }}
      >
        <Link
          href={`/workspace/${slug}/settings`}
          style={{
            fontFamily: fonts.mono,
            fontSize: fontSize.label,
            color: colors.fg3,
            textDecoration: 'none',
          }}
        >
          ⚙ Workspace settings & members
        </Link>
      </div>
    </div>
  )
}

