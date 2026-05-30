'use client'

import dynamic from 'next/dynamic'

const DocEditorClient = dynamic(
  () => import('./DocEditorClient'),
  { ssr: false, loading: () => null }
)

export default function DocEditorLoader({ docId, initialTitle }: { docId: string; initialTitle?: string }) {
  return <DocEditorClient docId={docId} initialTitle={initialTitle} />
}
