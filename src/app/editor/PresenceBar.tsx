'use client'

import type { LocalUser, PeerUser } from './usePresence'

interface Props {
  localUser: LocalUser
  peers: PeerUser[]
}

function Avatar({ name, color, isLocal }: { name: string; color: string; isLocal?: boolean }) {
  return (
    <span
      title={isLocal ? `${name} (you)` : name}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 9px',
        borderRadius: 12,
        background: `${color}18`,
        border: `1.5px solid ${color}`,
        fontFamily: 'monospace',
        fontSize: 12,
        color,
        fontWeight: 600,
        userSelect: 'none',
      }}
    >
      {/* Filled dot = you, outlined = remote */}
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: isLocal ? color : 'transparent',
          border: `1.5px solid ${color}`,
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      {name}
    </span>
  )
}

export function PresenceBar({ localUser, peers }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#aaa' }}>In doc:</span>
      <Avatar name={localUser.name} color={localUser.color} isLocal />
      {peers.map((peer) => (
        <Avatar key={peer.clientId} name={peer.name} color={peer.color} />
      ))}
      {peers.length === 0 && (
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#ccc' }}>
          — open another tab to see cursors
        </span>
      )}
    </div>
  )
}
