'use client'

import { useEffect, useState } from 'react'
import type { WebsocketProvider } from 'y-websocket'

// ── Local identity ────────────────────────────────────────────────────────────
// No auth in this demo, so we generate a random name + color once per browser
// session and keep it in module scope so it survives React re-renders and
// hot-reloads.

const NAMES = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Hank']
const COLORS = ['#e03131', '#2f9e44', '#1971c2', '#ae3ec9', '#e8590c', '#0c8599', '#5c7cfa', '#f76707']

function pick<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)]
}

let _cached: LocalUser | null = null
function getOrCreateLocalUser(): LocalUser {
  if (!_cached) _cached = { name: pick(NAMES), color: pick(COLORS) }
  return _cached
}

export interface LocalUser {
  name: string
  color: string
}

export interface PeerUser extends LocalUser {
  clientId: number
}

// ── usePresence hook ──────────────────────────────────────────────────────────
//
// Yjs Awareness is a lightweight ephemeral broadcast channel layered on top
// of the same WebSocket connection used for document sync.  It has no
// persistence — states are cleared automatically when a client disconnects
// (the server broadcasts a tombstone).
//
// Awareness messages are separate from CRDT update messages: they're NOT
// merged into the document and they don't affect the history.  The protocol
// just keeps a Map<clientId, stateObject> in sync across all peers.
//
// Each client owns one slot in that map — its "local state".  When you call
//   provider.awareness.setLocalStateField('user', { name, color })
// the updated state is encoded and broadcast to every other client in the room.
//
// CollaborationCursor writes an additional field into the same slot:
//   awareness.localState.cursor = { anchor: Y.RelativePosition, head: Y.RelativePosition }
// Remote clients read that field and render cursor/selection decorations.
//
// This hook exposes:
//   localUser  — the identity we broadcast (stable per session)
//   peers      — all currently connected remote clients (updates reactively)

export function usePresence(provider: WebsocketProvider) {
  const localUser = getOrCreateLocalUser()
  const [peers, setPeers] = useState<PeerUser[]>([])

  useEffect(() => {
    // Broadcast our identity.  CollaborationCursor will also write 'cursor'
    // into our local awareness state as the editor selection changes.
    provider.awareness.setLocalStateField('user', localUser)

    function syncPeers() {
      const list: PeerUser[] = []
      // getStates() returns a Map<clientId, stateObject> for ALL clients in
      // the room, including ourselves.  We exclude our own clientID.
      provider.awareness.getStates().forEach((state, clientId) => {
        if (clientId !== provider.awareness.clientID && state.user) {
          list.push({ clientId, ...(state.user as LocalUser) })
        }
      })
      setPeers(list)
    }

    // 'change' fires when any client's state is added, updated, or removed
    provider.awareness.on('change', syncPeers)
    syncPeers() // populate immediately on mount

    return () => provider.awareness.off('change', syncPeers)
  }, [provider, localUser])

  return { localUser, peers }
}
