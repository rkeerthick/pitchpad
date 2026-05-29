'use client'

// ProposalDashboard.tsx
//
// Dense, scannable proposal list.  Visual design priorities:
//
//   1. Information density — every row is a complete information unit.
//      The user reads across one row to assess a proposal without expanding.
//
//   2. Mono metadata — dates, values, and status codes render in Geist Mono.
//      The typeface switch signals "data" vs "label" at a glance.
//
//   3. Color only for status — the only color in the list is the status badge.
//      Everything else is fg-1/fg-2 to keep the eye moving linearly.
//
//   4. Hover state — bg-elevated tint on row hover; no heavy selection states.
//
// Columns:
//   Title        — sans, 14px, fg-1
//   Client       — sans, 13px, fg-2
//   Value        — mono, right-aligned, fg-1
//   Status       — mono badge (draft/review/sent/won/lost)
//   Updated      — mono, relative time, fg-3
//   Collaborators— avatar stack (max 3, then +N overflow)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { colors, fonts, fontSize, radius, space, statusConfig } from '@/lib/tokens'
import type { ProposalStatus } from '@/lib/tokens'

// ── Data model ───────────────────────────────────────────────────────────────

export interface Collaborator {
  name: string
  color: string
}

export interface Proposal {
  id: string
  title: string
  client: string
  value: number          // USD
  currency?: string      // default 'USD'
  status: ProposalStatus
  updatedAt: number      // unix ms
  collaborators: Collaborator[]
}

// ── Mock data ────────────────────────────────────────────────────────────────

// Fixed reference point so the mock timestamps are stable across renders.
// Using a literal epoch avoids Date.now() being called at module load time on
// the server, which would produce a different value from the client hydration.
const REF = new Date('2026-05-29T12:00:00Z').getTime()
const DAY = 86_400_000

export const MOCK_PROPOSALS: Proposal[] = [
  {
    id: 'p-001',
    title: 'Brand Identity & Design System',
    client: 'Meridian Capital',
    value: 28_500,
    status: 'review',
    updatedAt: REF - 2 * 60 * 60 * 1000,
    collaborators: [
      { name: 'Aiko', color: '#2563EB' },
      { name: 'Sam', color: '#059669' },
    ],
  },
  {
    id: 'p-002',
    title: 'Q3 Content Strategy & Editorial',
    client: 'Northlight Media',
    value: 12_000,
    status: 'sent',
    updatedAt: REF - 1 * DAY,
    collaborators: [
      { name: 'Raj', color: '#7C3AED' },
    ],
  },
  {
    id: 'p-003',
    title: 'Data Infrastructure Audit',
    client: 'Stackwise Technologies',
    value: 64_000,
    status: 'draft',
    updatedAt: REF - 3 * 60 * 60 * 1000,
    collaborators: [
      { name: 'Aiko', color: '#2563EB' },
      { name: 'Jordan', color: '#B45309' },
      { name: 'Sam', color: '#059669' },
      { name: 'Maya', color: '#DC2626' },
    ],
  },
  {
    id: 'p-004',
    title: 'Mobile App Redesign',
    client: 'Velo Health',
    value: 38_000,
    status: 'won',
    updatedAt: REF - 5 * DAY,
    collaborators: [
      { name: 'Jordan', color: '#B45309' },
      { name: 'Sam', color: '#059669' },
    ],
  },
  {
    id: 'p-005',
    title: 'Marketing Automation Setup',
    client: 'Bloom Commerce',
    value: 9_800,
    status: 'lost',
    updatedAt: REF - 12 * DAY,
    collaborators: [
      { name: 'Maya', color: '#DC2626' },
    ],
  },
  {
    id: 'p-006',
    title: 'Technical Documentation Sprint',
    client: 'Ferro Systems',
    value: 7_200,
    status: 'draft',
    updatedAt: REF - 45 * 60 * 1000,
    collaborators: [
      { name: 'Raj', color: '#7C3AED' },
      { name: 'Aiko', color: '#2563EB' },
    ],
  },
  {
    id: 'p-007',
    title: 'Annual Report Design',
    client: 'Crescent Partners',
    value: 15_500,
    status: 'review',
    updatedAt: REF - 2 * DAY,
    collaborators: [
      { name: 'Sam', color: '#059669' },
    ],
  },
  {
    id: 'p-008',
    title: 'SEO & Performance Optimization',
    client: 'Lunar Goods',
    value: 5_400,
    status: 'sent',
    updatedAt: REF - 6 * DAY,
    collaborators: [
      { name: 'Maya', color: '#DC2626' },
      { name: 'Jordan', color: '#B45309' },
    ],
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

type SortKey = 'updatedAt' | 'value' | 'status' | 'client'
type SortDir = 'asc' | 'desc'

export function ProposalDashboard() {
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filterStatus, setFilterStatus] = useState<ProposalStatus | 'all'>('all')

  // ── Hydration-safe "now" ─────────────────────────────────────────────────
  // relativeTime() calls Date.now() which produces a different number on the
  // server than on the client (milliseconds apart at minimum, potentially
  // much more if a build artifact is served stale).  Using null as the
  // initial value lets us render a static date string on both server and
  // the first client render, then switch to relative time after mount.
  // The interval keeps the display live while the tab is open.
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  function handleSortClick(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const rows = useMemo(() => {
    let list = MOCK_PROPOSALS.filter(
      (p) => filterStatus === 'all' || p.status === filterStatus
    )
    list = [...list].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'updatedAt') cmp = a.updatedAt - b.updatedAt
      if (sortKey === 'value')     cmp = a.value - b.value
      if (sortKey === 'status')    cmp = a.status.localeCompare(b.status)
      if (sortKey === 'client')    cmp = a.client.localeCompare(b.client)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [sortKey, sortDir, filterStatus])

  // ── Aggregate metrics ────────────────────────────────────────────────────────
  const total = MOCK_PROPOSALS.reduce((s, p) => s + p.value, 0)
  const wonValue = MOCK_PROPOSALS
    .filter((p) => p.status === 'won')
    .reduce((s, p) => s + p.value, 0)
  const sentCount = MOCK_PROPOSALS.filter((p) => p.status === 'sent').length

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: colors.bgBase,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <header
        style={{
          borderBottom: `1px solid ${colors.border}`,
          background: colors.bgSurface,
          padding: `${space[6]}px ${space[8]}px ${space[5]}px`,
        }}
      >
        <div
          style={{
            maxWidth: 1120,
            margin: '0 auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: space[5] }}>
            <div>
              <div
                style={{
                  fontFamily: fonts.mono,
                  fontSize: fontSize.label,
                  color: colors.fg3,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: space[1],
                }}
              >
                PitchPad
              </div>
              <h1
                style={{
                  fontFamily: fonts.sans,
                  fontSize: fontSize.xl,
                  fontWeight: 700,
                  color: colors.fg1,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.1,
                }}
              >
                Proposals
              </h1>
            </div>
            <button
              style={{
                fontFamily: fonts.mono,
                fontSize: fontSize.caption,
                fontWeight: 600,
                letterSpacing: '0.04em',
                padding: `${space[2]}px ${space[4]}px`,
                borderRadius: radius.md,
                border: 'none',
                background: colors.accent,
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              + New proposal
            </button>
          </div>

          {/* ── Metric row ──────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: space[8] }}>
            <Metric label="pipeline" value={formatCurrency(total)} />
            <Metric label="won" value={formatCurrency(wonValue)} />
            <Metric label="awaiting" value={`${sentCount} sent`} />
            <Metric label="total" value={`${MOCK_PROPOSALS.length} proposals`} />
          </div>
        </div>
      </header>

      {/* ── Filter bar ───────────────────────────────────────────────────────── */}
      <div
        style={{
          borderBottom: `1px solid ${colors.border}`,
          background: colors.bgSurface,
          padding: `0 ${space[8]}px`,
        }}
      >
        <div
          style={{
            maxWidth: 1120,
            margin: '0 auto',
            display: 'flex',
            gap: space[1],
            alignItems: 'center',
            height: 40,
          }}
        >
          {(['all', 'draft', 'review', 'sent', 'won', 'lost'] as const).map((s) => (
            <FilterTab
              key={s}
              label={s}
              active={filterStatus === s}
              count={s === 'all' ? MOCK_PROPOSALS.length : MOCK_PROPOSALS.filter((p) => p.status === s).length}
              onClick={() => setFilterStatus(s)}
            />
          ))}
        </div>
      </div>

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          padding: `${space[4]}px ${space[8]}px ${space[8]}px`,
        }}
      >
        <div
          style={{
            maxWidth: 1120,
            margin: '0 auto',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              tableLayout: 'fixed',
            }}
          >
            {/* Column widths */}
            <colgroup>
              <col style={{ width: '28%' }} />  {/* Title */}
              <col style={{ width: '18%' }} />  {/* Client */}
              <col style={{ width: '12%' }} />  {/* Value */}
              <col style={{ width: '11%' }} />  {/* Status */}
              <col style={{ width: '14%' }} />  {/* Updated */}
              <col style={{ width: '17%' }} />  {/* Collaborators */}
            </colgroup>

            {/* ── Column headers ─────────────────────────────────────────────── */}
            <thead>
              <tr>
                <Th>Title</Th>
                <Th sortable active={sortKey === 'client'} dir={sortDir} onClick={() => handleSortClick('client')}>
                  Client
                </Th>
                <Th sortable active={sortKey === 'value'} dir={sortDir} align="right" onClick={() => handleSortClick('value')}>
                  Value
                </Th>
                <Th sortable active={sortKey === 'status'} dir={sortDir} onClick={() => handleSortClick('status')}>
                  Status
                </Th>
                <Th sortable active={sortKey === 'updatedAt'} dir={sortDir} onClick={() => handleSortClick('updatedAt')}>
                  Updated
                </Th>
                <Th>Team</Th>
              </tr>
            </thead>

            {/* ── Rows ──────────────────────────────────────────────────────── */}
            <tbody>
              {rows.map((proposal, i) => (
                <ProposalRow key={proposal.id} proposal={proposal} index={i} now={now} />
              ))}
            </tbody>
          </table>

          {rows.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: `${space[12]}px`,
                fontFamily: fonts.mono,
                fontSize: fontSize.caption,
                color: colors.fg3,
              }}
            >
              No proposals match this filter.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── ProposalRow ────────────────────────────────────────────────────────────────

function ProposalRow({ proposal, index, now }: { proposal: Proposal; index: number; now: number | null }) {
  const [hovered, setHovered] = useState(false)
  const cfg = statusConfig[proposal.status]

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? colors.bgElevated : index % 2 === 0 ? colors.bgSurface : 'rgba(234,236,240,0.4)',
        transition: `background 80ms ease`,
        cursor: 'pointer',
        borderBottom: `1px solid ${colors.border}`,
      }}
    >
      {/* Title */}
      <td
        style={{
          padding: `${space[3]}px ${space[4]}px`,
          overflow: 'hidden',
        }}
      >
        <Link
          href={`/doc/${proposal.id}`}
          style={{
            fontFamily: fonts.sans,
            fontSize: fontSize.base,
            fontWeight: 500,
            color: colors.fg1,
            textDecoration: 'none',
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {proposal.title}
        </Link>
      </td>

      {/* Client */}
      <td
        style={{
          padding: `${space[3]}px ${space[4]}px`,
          fontFamily: fonts.sans,
          fontSize: fontSize.caption,
          color: colors.fg2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {proposal.client}
      </td>

      {/* Value */}
      <td
        style={{
          padding: `${space[3]}px ${space[4]}px`,
          fontFamily: fonts.mono,
          fontSize: fontSize.caption,
          color: colors.fg1,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {formatCurrency(proposal.value, proposal.currency)}
      </td>

      {/* Status */}
      <td style={{ padding: `${space[3]}px ${space[4]}px` }}>
        <span
          className="status-badge"
          style={{
            color: cfg.color,
            background: cfg.bg,
            borderColor: cfg.border,
          }}
        >
          {cfg.label}
        </span>
      </td>

      {/* Updated */}
      <td
        style={{
          padding: `${space[3]}px ${space[4]}px`,
          fontFamily: fonts.mono,
          fontSize: fontSize.caption,
          color: colors.fg3,
          whiteSpace: 'nowrap',
        }}
      >
        {relativeTime(proposal.updatedAt, now)}
      </td>

      {/* Collaborators */}
      <td style={{ padding: `${space[3]}px ${space[4]}px` }}>
        <AvatarStack collaborators={proposal.collaborators} />
      </td>
    </tr>
  )
}

// ── Th ────────────────────────────────────────────────────────────────────────

interface ThProps {
  children: React.ReactNode
  sortable?: boolean
  active?: boolean
  dir?: SortDir
  align?: 'left' | 'right'
  onClick?: () => void
}

function Th({ children, sortable, active, dir, align = 'left', onClick }: ThProps) {
  return (
    <th
      onClick={sortable ? onClick : undefined}
      style={{
        padding: `${space[2]}px ${space[4]}px`,
        textAlign: align,
        fontFamily: fonts.mono,
        fontSize: fontSize.label,
        fontWeight: 500,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: active ? colors.fg1 : colors.fg3,
        cursor: sortable ? 'pointer' : 'default',
        userSelect: 'none',
        borderBottom: `1px solid ${colors.border}`,
        whiteSpace: 'nowrap',
        transition: `color 80ms ease`,
      }}
    >
      {children}
      {sortable && active && (
        <span style={{ marginLeft: 4, opacity: 0.7 }}>{dir === 'asc' ? '↑' : '↓'}</span>
      )}
      {sortable && !active && (
        <span style={{ marginLeft: 4, opacity: 0.25 }}>↕</span>
      )}
    </th>
  )
}

// ── FilterTab ─────────────────────────────────────────────────────────────────

function FilterTab({
  label,
  active,
  count,
  onClick,
}: {
  label: string
  active: boolean
  count: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: space[1.5],
        fontFamily: fonts.mono,
        fontSize: fontSize.label,
        fontWeight: active ? 600 : 400,
        letterSpacing: '0.04em',
        color: active ? colors.fg1 : colors.fg3,
        background: 'transparent',
        border: 'none',
        borderBottom: `2px solid ${active ? colors.fg1 : 'transparent'}`,
        padding: `${space[2]}px ${space[2]}px`,
        marginBottom: -1,
        cursor: 'pointer',
        transition: `color 80ms ease, border-color 80ms ease`,
        height: '100%',
      }}
    >
      {label}
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: 10,
          color: active ? colors.fg2 : colors.fg3,
          background: active ? colors.bgElevated : 'transparent',
          borderRadius: radius.sm,
          padding: '0 4px',
          lineHeight: '16px',
        }}
      >
        {count}
      </span>
    </button>
  )
}

// ── AvatarStack ───────────────────────────────────────────────────────────────

const MAX_VISIBLE = 3

function AvatarStack({ collaborators }: { collaborators: Collaborator[] }) {
  const visible = collaborators.slice(0, MAX_VISIBLE)
  const overflow = collaborators.length - MAX_VISIBLE

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: -4 }}>
      {visible.map((c, i) => (
        <div
          key={c.name}
          title={c.name}
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: c.color,
            border: `2px solid ${colors.bgSurface}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: fonts.mono,
            fontSize: 9,
            fontWeight: 700,
            color: '#fff',
            marginLeft: i === 0 ? 0 : -6,
            position: 'relative',
            zIndex: visible.length - i,
            userSelect: 'none',
            flexShrink: 0,
          }}
        >
          {c.name[0].toUpperCase()}
        </div>
      ))}
      {overflow > 0 && (
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: colors.bgElevated,
            border: `2px solid ${colors.bgSurface}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: fonts.mono,
            fontSize: 9,
            fontWeight: 600,
            color: colors.fg2,
            marginLeft: -6,
            userSelect: 'none',
            flexShrink: 0,
          }}
        >
          +{overflow}
        </div>
      )}
    </div>
  )
}

// ── Metric ────────────────────────────────────────────────────────────────────

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: fontSize.label,
          color: colors.fg3,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: fontSize.md,
          fontWeight: 600,
          color: colors.fg1,
          letterSpacing: '-0.01em',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

// `now` is null during SSR and the first client render (before useEffect fires).
// While null we return a static locale-formatted date so server and client
// agree on the initial HTML — no hydration mismatch.
// After mount, `now` is set and we switch to relative strings that update live.
function relativeTime(ts: number, now: number | null): string {
  if (now === null) {
    // Same output on server and client first paint — no mismatch.
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const diff = now - ts
  const min  = Math.floor(diff / 60_000)
  const hr   = Math.floor(diff / 3_600_000)
  const day  = Math.floor(diff / 86_400_000)

  if (min < 1)   return 'just now'
  if (min < 60)  return `${min}m ago`
  if (hr < 24)   return `${hr}h ago`
  if (day < 7)   return `${day}d ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
