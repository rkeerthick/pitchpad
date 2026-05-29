'use client'

// ── How comment anchors survive concurrent edits ──────────────────────────────
//
// PROBLEM — character-offset anchors break under concurrency:
//
//   Initial text:  "Hello world"
//   Comment on:    positions 6–11  ("world")
//   Stored as:     { from: 6, to: 11 }
//
//   Remote user inserts "beautiful " before "world":
//   Text becomes:  "Hello beautiful world"
//
//   Stored anchor still says { from: 6, to: 11 } → points at "beauti" ✗
//
// SOLUTION — Yjs relative positions:
//
//   A Y.RelativePosition is NOT an integer offset.  It is a pointer to a
//   specific *item* in the Yjs CRDT tree, identified by the (clientId, clock)
//   tuple of the operation that created that character.  Every character
//   inserted into a Yjs document becomes a unique, immutable CRDT item.
//
//   When you call  absolutePositionToRelativePosition(6, fragment, mapping):
//     → y-prosemirror walks the Y.XmlFragment tree
//     → finds the CRDT item currently at PM index 6
//     → records its (clientId, clock) identity — NOT its index
//
//   When you later call  relativePositionToAbsolutePosition(ydoc, fragment, relPos, mapping):
//     → Yjs finds the item by (clientId, clock) in the CRDT tree
//     → counts its current position, accounting for all concurrent ops
//     → returns the correct current integer index — updated automatically
//
//   Concurrency scenarios:
//
//   ┌─ Insert BEFORE the anchor range ──────────────────────────────────────┐
//   │  Absolute indices shift forward.  Relative positions don't change —   │
//   │  they still point to the same CRDT items.  Resolution returns the      │
//   │  new, correct absolute indices.                                        │
//   └───────────────────────────────────────────────────────────────────────┘
//
//   ┌─ Insert WITHIN the anchor range ──────────────────────────────────────┐
//   │  The "from" item and "to" item still exist.  New items between them   │
//   │  expand the range — the comment now covers the new text too.          │
//   │  Usually desirable: a comment on "foo" covers "fXoo" if "X" inserted. │
//   └───────────────────────────────────────────────────────────────────────┘
//
//   ┌─ Delete ALL the anchored text ─────────────────────────────────────────┐
//   │  CRDT items are never truly erased — they're tombstoned.  The item    │
//   │  still exists in the tree but contributes 0 to the character count.   │
//   │  relativePositionToAbsolutePosition returns adjacent positions that    │
//   │  may be equal (from === to).  We guard against this in the decoration │
//   │  plugin and skip rendering.  The comment data is preserved in Y.Map;  │
//   │  it just stops showing a highlight.                                    │
//   └───────────────────────────────────────────────────────────────────────┘
//
// ── Why the ProsemirrorMapping is needed ─────────────────────────────────────
//
//   absolutePositionToRelativePosition and relativePositionToAbsolutePosition
//   both need to count PM positions of block-level Yjs elements (paragraphs,
//   headings, etc.).  For each such element they call mapping.get(elem).nodeSize.
//   Without the live mapping they would mis-count block boundaries.
//
//   The mapping is the Map<Y.AbstractType → PmNode> maintained by the
//   y-prosemirror ySyncPlugin binding.  We read it at call time from
//   ySyncPluginKey.getState(editor.state)?.binding?.mapping.
//
// Serialisation: Y.encodeRelativePosition → Uint8Array (stored in Y.Map)
//                Y.decodeRelativePosition ← Uint8Array
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import * as Y from 'yjs'
import {
  absolutePositionToRelativePosition,
  ySyncPluginKey,
} from 'y-prosemirror'
import type { LocalUser } from './usePresence'
import type { Editor } from '@tiptap/react'

export interface Reply {
  id: string
  author: string
  color: string
  text: string
  createdAt: number
}

export interface Comment {
  id: string
  // Serialized Y.RelativePosition (Uint8Array) — decoded and resolved to
  // absolute coords in commentDecorationPlugin.ts at render time.
  anchorFrom: Uint8Array
  anchorTo: Uint8Array
  author: string
  color: string
  text: string       // first message in the thread
  createdAt: number
  resolved: boolean
  replies: Reply[]
}

export function useComments(ydoc: Y.Doc) {
  // ── Shared Yjs state ────────────────────────────────────────────────────────
  // commentsMap lives inside the ydoc, so all comment CRUD operations are
  // automatically synced to every connected client — the same CRDT machinery
  // that syncs the document text handles comments too.
  //
  // Structure:  Y.Map<commentId → Y.Map<field → value>>
  //   Each inner Y.Map holds scalar fields (id, author, text…) and one
  //   nested Y.Array for replies.  We use Y.Array for replies so concurrent
  //   reply additions from different clients merge correctly (append semantics).
  const commentsMap = useMemo(
    () => ydoc.getMap<Y.Map<any>>('comments'),
    [ydoc]
  )

  // Must match the `field` key used by Tiptap's Collaboration extension.
  // Tiptap defaults to 'default' when no explicit `field` option is given.
  const fragment = useMemo(() => ydoc.getXmlFragment('default'), [ydoc])

  // ── React state mirror ─────────────────────────────────────────────────────
  const [comments, setComments] = useState<Comment[]>([])

  useEffect(() => {
    function rebuild() {
      const list: Comment[] = []
      commentsMap.forEach((entry) => {
        const replies = entry.get('replies') as Y.Array<Reply>
        list.push({
          id: entry.get('id') as string,
          anchorFrom: entry.get('anchorFrom') as Uint8Array,
          anchorTo: entry.get('anchorTo') as Uint8Array,
          author: entry.get('author') as string,
          color: entry.get('color') as string,
          text: entry.get('text') as string,
          createdAt: entry.get('createdAt') as number,
          resolved: Boolean(entry.get('resolved')),
          replies: replies?.toArray() ?? [],
        })
      })
      list.sort((a, b) => a.createdAt - b.createdAt)
      setComments(list)
    }

    // observeDeep fires on changes to the map AND any nested Y type
    // (e.g., when a reply is pushed into a comment's Y.Array of replies).
    commentsMap.observeDeep(rebuild)
    rebuild()
    return () => commentsMap.unobserveDeep(rebuild)
  }, [commentsMap])

  // ── addComment ──────────────────────────────────────────────────────────────
  // Receives explicit from/to captured before the textarea stole focus,
  // so we don't depend on editor.state.selection still being intact.
  function addComment(
    editor: Editor,
    text: string,
    localUser: LocalUser,
    from: number,
    to: number,
  ): string | null {
    if (from === to || !text.trim()) return null

    // ── Read the live ProsemirrorMapping ──────────────────────────────────
    // absolutePositionToRelativePosition needs this to count block-level PM
    // node sizes (via mapping.get(yXmlElement).nodeSize) when walking up
    // through block boundaries.  At call time the editor is fully mounted so
    // the ySyncPlugin binding is guaranteed to be non-null.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const syncState = ySyncPluginKey.getState(editor.state) as any
    const mapping = syncState?.binding?.mapping ?? new Map()

    // Convert ProseMirror absolute positions → Yjs relative positions.
    // The result is tied to specific CRDT item IDs, not integer offsets,
    // so it remains correct through all future concurrent edits.
    const relFrom = absolutePositionToRelativePosition(from, fragment, mapping)
    const relTo   = absolutePositionToRelativePosition(to,   fragment, mapping)

    // Encode to Uint8Array for storage in Y.Map (must be serialisable).
    const anchorFrom = Y.encodeRelativePosition(relFrom)
    const anchorTo   = Y.encodeRelativePosition(relTo)

    const id = `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const entry = new Y.Map<any>()
    entry.set('id', id)
    entry.set('anchorFrom', anchorFrom)
    entry.set('anchorTo', anchorTo)
    entry.set('author', localUser.name)
    entry.set('color', localUser.color)
    entry.set('text', text.trim())
    entry.set('createdAt', Date.now())
    entry.set('resolved', false)
    // Y.Array for replies enables concurrent append-only threading:
    // two users replying simultaneously each push to the same Y.Array
    // and both replies survive the merge (no last-write-wins collision).
    entry.set('replies', new Y.Array<Reply>())

    // Wrap in a Yjs transaction so the entire new comment is broadcast as a
    // single atomic update — one WebSocket message, not many.
    ydoc.transact(() => {
      commentsMap.set(id, entry)
    })

    return id
  }

  // ── addReply ────────────────────────────────────────────────────────────────
  function addReply(commentId: string, text: string, localUser: LocalUser) {
    const entry = commentsMap.get(commentId)
    if (!entry || !text.trim()) return
    const replies = entry.get('replies') as Y.Array<Reply>
    replies.push([{
      id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      author: localUser.name,
      color: localUser.color,
      text: text.trim(),
      createdAt: Date.now(),
    }])
  }

  // ── resolveComment ──────────────────────────────────────────────────────────
  function resolveComment(commentId: string) {
    const entry = commentsMap.get(commentId)
    if (entry) entry.set('resolved', true)
  }

  return { comments, commentsMap, fragment, addComment, addReply, resolveComment }
}
