// commentDecorationPlugin.ts
//
// A ProseMirror plugin that renders comment anchor highlights as inline
// decorations.  It bridges two event sources:
//
//   1. Yjs commentsMap changes (new comment, resolved, reply added) →
//      triggers a full decoration rebuild via a dispatched PM transaction.
//
//   2. ProseMirror document changes (local typing, remote Yjs ops arriving) →
//      existing decorations are mapped through the transaction's PositionMapping,
//      which is cheaper than re-resolving all relative positions from Yjs.
//
// ── Why the plugin needs ProsemirrorMapping ───────────────────────────────────
//
// relativePositionToAbsolutePosition() from y-prosemirror doesn't just count
// character offsets — for non-text block elements (paragraphs, headings, lists)
// it looks up each block's PM nodeSize via  mapping.get(yXmlElement).nodeSize.
// Without the live mapping, it throws on block-level nodes.
//
// The mapping is the Map<Y.AbstractType, PmNode | PmNode[]> maintained by the
// y-prosemirror ySyncPlugin binding.  We read it from the editor state at
// decoration-rebuild time using  ySyncPluginKey.getState(state)?.binding?.mapping.
//
// ── Decoration rebuild strategy ───────────────────────────────────────────────
//
//   COMMENT_REFRESH meta set   → full rebuild (re-resolve all relative positions)
//   tr.docChanged              → map existing decos through tr.mapping (cheap)
//   otherwise                  → return unchanged DecorationSet
//
// The mapping approach handles all local and remote edits correctly because
// each Yjs-originated PM transaction carries an accurate PositionMapping.
// DecorationSet.map() drops any decoration whose range was entirely deleted.

import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorState } from '@tiptap/pm/state'
import * as Y from 'yjs'
import {
  relativePositionToAbsolutePosition,
  ySyncPluginKey,
} from 'y-prosemirror'
import type { Node as PmNode } from '@tiptap/pm/model'

export const COMMENT_DECO_KEY = new PluginKey<DecorationSet>('commentDecorations')
export const COMMENT_REFRESH = 'commentRefresh'

// Pull the current ProsemirrorMapping from the ySyncPlugin binding.
// Returns an empty Map as fallback (safe for the try/catch in buildDecos).
function getPmMapping(state: EditorState) {
  const syncState = ySyncPluginKey.getState(state)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (syncState as any)?.binding?.mapping ?? new Map()
}

export function buildCommentDecorationPlugin(
  ydoc: Y.Doc,
  fragment: Y.XmlFragment,
  commentsMap: Y.Map<Y.Map<any>>,
) {
  function buildDecos(doc: PmNode, mapping: ReturnType<typeof getPmMapping>): DecorationSet {
    const decos: Decoration[] = []

    commentsMap.forEach((entry, commentId) => {
      if (entry.get('resolved') as boolean) return

      const rawFrom = entry.get('anchorFrom') as Uint8Array | undefined
      const rawTo = entry.get('anchorTo') as Uint8Array | undefined
      if (!rawFrom || !rawTo) return

      try {
        const relFrom = Y.decodeRelativePosition(rawFrom)
        const relTo = Y.decodeRelativePosition(rawTo)

        // ── The resolution step ────────────────────────────────────────────
        // relativePositionToAbsolutePosition walks the Yjs CRDT tree.
        // For Y.XmlText nodes it uses the text index directly.
        // For Y.XmlElement (block) nodes it calls mapping.get(elem).nodeSize
        // to count how many PM positions each block occupies.
        // With the live mapping this always returns the correct current index,
        // accounting for all concurrent insertions and deletions.
        const absFrom = relativePositionToAbsolutePosition(ydoc, fragment, relFrom, mapping)
        const absTo = relativePositionToAbsolutePosition(ydoc, fragment, relTo, mapping)

        if (
          absFrom !== null &&
          absTo !== null &&
          absFrom < absTo &&
          absTo <= doc.content.size
        ) {
          const color = entry.get('color') as string
          decos.push(
            Decoration.inline(absFrom, absTo, {
              class: 'comment-highlight',
              'data-comment-id': commentId,
              style: `background:${color}28; border-bottom:2px solid ${color};`,
            })
          )
        }
      } catch {
        // Silently skip: can happen if the mapping is stale or an item is
        // tombstoned during a large concurrent operation.
      }
    })

    return DecorationSet.create(doc, decos)
  }

  return new Plugin({
    key: COMMENT_DECO_KEY,

    // ── view() lifecycle ─────────────────────────────────────────────────────
    // Called once when the plugin is attached to an EditorView.
    // This is the correct place to wire external subscriptions (Yjs observers)
    // because the returned destroy() guarantees cleanup.
    //
    // By the time view() runs, the ySyncPlugin's view() has already executed
    // and its binding (including the ProsemirrorMapping) is fully initialised.
    // We fire an initial COMMENT_REFRESH so existing comments get highlights
    // with the correct mapping rather than the empty-Map fallback from init().
    view(editorView) {
      let alive = true

      function refresh() {
        if (!alive) return
        editorView.dispatch(
          editorView.state.tr.setMeta(COMMENT_REFRESH, true)
        )
      }

      // observeDeep catches changes to nested structures (reply Y.Arrays, etc.)
      commentsMap.observeDeep(refresh)

      // Defer so we're past the sync plugin's initial sync transaction.
      // At rAF time the binding.mapping is guaranteed to be populated.
      requestAnimationFrame(refresh)

      return {
        destroy() {
          alive = false
          commentsMap.unobserveDeep(refresh)
        },
      }
    },

    state: {
      // init runs before view(), so binding may be null → mapping is empty Map.
      // The rAF in view() will trigger a COMMENT_REFRESH immediately after mount
      // to rebuild with the correct mapping.
      init(_, state) {
        return buildDecos(state.doc, getPmMapping(state))
      },

      // The full apply signature exposes oldState and newState.
      // By the time our apply runs, ySyncPlugin (registered earlier) has
      // already updated its state in the new EditorState, so getPmMapping(newState)
      // returns the freshest mapping.
      apply(tr, old, _oldState, newState) {
        if (tr.getMeta(COMMENT_REFRESH)) {
          return buildDecos(tr.doc, getPmMapping(newState))
        }
        // Map existing decoration positions through the transaction cheaply.
        // DecorationSet.map() drops decorations whose range was deleted —
        // correct behaviour when commented text is entirely removed.
        if (tr.docChanged) {
          return old.map(tr.mapping, tr.doc)
        }
        return old
      },
    },

    props: {
      decorations(state) {
        return COMMENT_DECO_KEY.getState(state)
      },
    },
  })
}
