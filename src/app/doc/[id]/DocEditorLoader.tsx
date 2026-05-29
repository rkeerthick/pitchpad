'use client'

import dynamic from 'next/dynamic'

const DocEditorClient = dynamic(
  () => import('./DocEditorClient'),
  { ssr: false, loading: () => null }
)

export default function DocEditorLoader({ docId }: { docId: string }) {
  return <DocEditorClient docId={docId} />
}
