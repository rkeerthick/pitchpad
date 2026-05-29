'use client'

// NewDocumentButton.tsx
//
// Creates a new document in the given workspace, then navigates to the editor.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { colors, fonts, fontSize, space, radius, motion } from '@/lib/tokens'

interface Props {
  workspaceId: string
}

export function NewDocumentButton({ workspaceId }: Props) {
  const router  = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/documents`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title: 'Untitled Proposal' }),
      })
      const doc = await res.json() as { id: string }
      router.push(`/doc/${doc.id}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleCreate}
      disabled={loading}
      style={{
        display:    'flex',
        alignItems: 'center',
        gap:        space[1.5],
        padding:    `${space[2]}px ${space[4]}px`,
        fontFamily: fonts.mono,
        fontSize:   fontSize.caption,
        fontWeight: 700,
        letterSpacing: '0.04em',
        background: loading ? colors.bgElevated : colors.fg1,
        color:      loading ? colors.fg3 : '#fff',
        border:     'none',
        borderRadius: radius.lg,
        cursor:     loading ? 'default' : 'pointer',
        transition: `opacity ${motion.fast}`,
      }}
      onMouseEnter={(e) => { if (!loading) e.currentTarget.style.opacity = '0.85' }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
    >
      {loading ? '…' : '+ New document'}
    </button>
  )
}
