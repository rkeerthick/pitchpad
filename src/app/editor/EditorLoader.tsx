'use client'

// `ssr: false` with next/dynamic is only allowed inside a Client Component
// (Next.js App Router rule).  This thin wrapper provides that boundary so
// page.tsx can remain a Server Component while still deferring the editor
// to the browser.
//
// Why do we need ssr: false at all?
//   CollabEditor creates a WebsocketProvider at module scope.  WebSocket is
//   a browser API that doesn't exist in the Node.js SSR environment.  Trying
//   to import CollabEditor on the server would throw immediately.  The
//   { ssr: false } flag tells Next.js: "skip this module during SSR; render
//   the loading fallback in the initial HTML and hydrate the real component
//   once the browser bundle loads."

import dynamic from 'next/dynamic'

const CollabEditor = dynamic(() => import('./CollabEditor'), {
  ssr: false,
  loading: () => (
    <p style={{ fontFamily: 'monospace', color: '#888' }}>Loading editor…</p>
  ),
})

export default function EditorLoader() {
  return <CollabEditor />
}
