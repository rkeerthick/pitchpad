'use client'

import Link from 'next/link'
import { colors, fonts, fontSize, space, radius, shadow } from '@/lib/tokens'

export function DocCard({
  doc,
}: {
  doc: { id: string; title: string; updatedAt: Date; createdAt: Date }
}) {
  const label = new Date(doc.updatedAt).toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
    year:  'numeric',
  })

  return (
    <Link href={`/doc/${doc.id}`} style={{ textDecoration: 'none' }}>
      <div
        style={{
          background:   colors.bgSurface,
          border:       `1px solid ${colors.border}`,
          borderRadius: radius.xl,
          padding:      `${space[5]}px`,
          cursor:       'pointer',
          transition:   'box-shadow 80ms ease, border-color 80ms ease',
          boxShadow:    shadow.sm,
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLDivElement
          el.style.boxShadow   = shadow.md
          el.style.borderColor = colors.borderStrong
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLDivElement
          el.style.boxShadow   = shadow.sm
          el.style.borderColor = colors.border
        }}
      >
        {/* Document icon */}
        <div
          style={{
            width:        32,
            height:       40,
            background:   colors.bgPanel,
            border:       `1px solid ${colors.border}`,
            borderRadius: radius.md,
            marginBottom: space[3],
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            fontSize:     16,
          }}
        >
          📄
        </div>

        <div
          style={{
            fontFamily:   fonts.sans,
            fontSize:     fontSize.base,
            fontWeight:   600,
            color:        colors.fg1,
            marginBottom: space[1],
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
          }}
        >
          {doc.title}
        </div>

        <div style={{ fontFamily: fonts.mono, fontSize: fontSize.label, color: colors.fg3 }}>
          {label}
        </div>
      </div>
    </Link>
  )
}
