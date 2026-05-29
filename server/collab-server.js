'use strict'

/**
 * Minimal Yjs WebSocket relay server using y-websocket's built-in utilities.
 *
 * What this server does (and why it's more than a dumb relay):
 *
 *   1. RELAY — Any binary message from one client in a room is forwarded to
 *      all other clients in the same room.  This is what keeps concurrent
 *      edits propagating in real time.
 *
 *   2. STATE PERSISTENCE (in memory) — setupWSConnection stores the current
 *      document state server-side.  When a *new* client joins a room that
 *      already has content, the server sends that client the complete
 *      document state (the "sync step 2" reply described in y-websocket's
 *      protocol).  Without this, a fresh tab would start with an empty doc
 *      even if others have been typing for minutes.
 *
 *   3. AWARENESS — y-websocket also carries "awareness" messages: lightweight
 *      per-user metadata like cursor positions, user name, colour.  The server
 *      relays these between clients too.  (We're not using awareness yet but
 *      the protocol support is there for free.)
 *
 * In production you'd swap the in-memory store for a database so state
 * survives server restarts — e.g. y-leveldb, y-redis, or a custom adapter.
 */

const { WebSocketServer } = require('ws')
const { setupWSConnection } = require('y-websocket/bin/utils')

const PORT = 1234
const HOST = 'localhost'

// Create a plain WebSocket server.  y-websocket's setupWSConnection handles
// the Yjs sync protocol on top of the raw WebSocket frames.
const wss = new WebSocketServer({ host: HOST, port: PORT })

wss.on('connection', (ws, req) => {
  // setupWSConnection does all the heavy lifting:
  //   • Parses the room name from the URL path (e.g. /pitchpad-room)
  //   • Looks up or creates an in-memory Y.Doc for that room
  //   • Runs the two-way sync handshake with the connecting client
  //   • Registers the client for future update broadcasts
  //   • Handles client disconnection and awareness cleanup
  setupWSConnection(ws, req)
})

wss.on('listening', () => {
  console.log(`\nYjs WebSocket relay server`)
  console.log(`  listening on  ws://${HOST}:${PORT}`)
  console.log(`  room sync:    in-memory (resets on server restart)`)
  console.log(`\nOpen http://localhost:3000 in two tabs to test.\n`)
})

wss.on('error', (err) => {
  console.error('WebSocket server error:', err.message)
  process.exit(1)
})
