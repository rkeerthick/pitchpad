'use client'

// ── useAISuggestions.ts ───────────────────────────────────────────────────────
//
// Manages AI suggestion state in Yjs + streaming document mutations.
//
// ── Data model ────────────────────────────────────────────────────────────────
//
//   ydoc.getMap('suggestions'): Y.Map<Y.Map<any>>
//     └── id → Y.Map {
//           id:           string
//           originalText: string          ← restored on reject
//           proposedText: string          ← accumulated stream output
//           status:       'streaming' | 'pending' | 'accepted' | 'rejected'
//           createdAt:    number
//         }
//
// ── Streaming document strategy ───────────────────────────────────────────────
//
//   We never delete the original text until the FIRST chunk arrives, so the
//   document is never in a "gap" state.
//
//   First chunk:  one PM transaction — delete(original) + insertText(chunk) +
//                 addMark(from, from+len, aiSuggestion{id})
//
//   Each subsequent chunk:  findSuggestionRange() → current {from, to} →
//                           insertText(chunk, to) + addMark(from, to+len, ...)
//
//   Each PM transaction is converted to a Yjs op by y-prosemirror, so all
//   connected peers see chunks materialise in real time.
//
// ── Concurrent edit safety ────────────────────────────────────────────────────
//
//   findSuggestionRange() scans the LIVE document (editor.state) on every chunk,
//   so if a collaborator inserts text within the suggestion range between chunks,
//   the next chunk is appended after their text — the suggestion expands to
//   include their edit.  All operations compose correctly in the CRDT.
//
// ── Cancel / reject mid-stream ────────────────────────────────────────────────
//
//   abortRef.current.abort() → fetch rejects → streaming loop checks
//   signal.aborted and exits WITHOUT touching the document.
//   rejectSuggestion() then atomically:
//     delete(partial-range) + insertText(originalText) in one PM transaction
//     + ydoc.transact(() => entry.set('status','rejected'))
//   One Yjs op. Peers see the restore immediately.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react'
import * as Y from 'yjs'
import type { Editor } from '@tiptap/react'

export interface AISuggestion {
  id: string
  originalText: string
  proposedText: string
  status: 'streaming' | 'pending' | 'accepted' | 'rejected'
  createdAt: number
}

export function useAISuggestions(ydoc: Y.Doc, _fragment: Y.XmlFragment, docId: string) {
  const suggestionsMap = useMemo(
    () => ydoc.getMap<Y.Map<any>>('suggestions'),
    [ydoc]
  )

  // ── Abort controller for the in-flight stream ────────────────────────────
  // Only one suggestion stream can be active at a time.
  const abortRef = useRef<AbortController | null>(null)

  // ── React state mirror of suggestionsMap ──────────────────────────────────
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([])

  useEffect(() => {
    function rebuild() {
      const list: AISuggestion[] = []
      suggestionsMap.forEach((entry) => {
        list.push({
          id:           entry.get('id')           as string,
          originalText: entry.get('originalText') as string,
          proposedText: entry.get('proposedText') as string,
          status:       entry.get('status')       as AISuggestion['status'],
          createdAt:    entry.get('createdAt')    as number,
        })
      })
      list.sort((a, b) => a.createdAt - b.createdAt)
      setSuggestions(list)
    }
    suggestionsMap.observeDeep(rebuild)
    rebuild()
    return () => suggestionsMap.unobserveDeep(rebuild)
  }, [suggestionsMap])

  // ── streamSuggestion ───────────────────────────────────────────────────────
  //
  // Initiates a streaming AI suggestion.
  // Returns a cleanup thunk (call it to cancel) and a promise that resolves
  // when streaming completes or rejects with an error message.

  async function streamSuggestion(
    editor: Editor,
    id: string,
    originalText: string,
    from: number,
    to: number,
  ): Promise<void> {
    // Cancel any existing stream before starting a new one
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    // ── Initialise Y.Map entry ───────────────────────────────────────────────
    const entry = new Y.Map<any>()
    entry.set('id',           id)
    entry.set('originalText', originalText)
    entry.set('proposedText', '')
    entry.set('status',       'streaming')
    entry.set('createdAt',    Date.now())
    ydoc.transact(() => { suggestionsMap.set(id, entry) })

    // ── Helpers: PM transaction dispatchers ──────────────────────────────────
    // All run synchronously (no await), each becomes one Yjs op.

    function applyFirstChunk(chunk: string) {
      // Atomic: delete original text + insert first chunk + apply mark.
      const markType = editor.state.schema.marks['aiSuggestion']
      if (!markType) return
      editor.view.dispatch(
        editor.state.tr
          .delete(from, to)
          .insertText(chunk, from)
          .addMark(from, from + chunk.length, markType.create({ id }))
      )
    }

    function applyNextChunk(chunk: string): boolean {
      const range = findSuggestionRange(editor, id)
      if (!range) return false  // removed by a concurrent reject — stop streaming
      const markType = editor.state.schema.marks['aiSuggestion']
      if (!markType) return false
      // insertText at range.to, then reapply mark over the extended range.
      // addMark uses positions in the post-insertText document, so:
      //   range.to        = unchanged (insertion is after it in the transaction)
      //   range.to + len  = end of newly inserted text
      editor.view.dispatch(
        editor.state.tr
          .insertText(chunk, range.to)
          .addMark(range.from, range.to + chunk.length, markType.create({ id }))
      )
      return true
    }

    // ── Fetch + SSE parse ────────────────────────────────────────────────────

    let accumulated = ''
    let isFirst = true

    try {
      const res = await fetch('/api/ai/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: originalText, docId }),
        signal,
      })

      if (!res.ok || !res.body) {
        // Non-streaming error response (e.g. 400 validation failure)
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let sseBuffer = ''

      outer: while (true) {
        if (signal.aborted) break

        const { done, value } = await reader.read()
        if (done || signal.aborted) break

        sseBuffer += decoder.decode(value, { stream: true })

        // Split on double-newline (SSE event boundary)
        const events = sseBuffer.split('\n\n')
        sseBuffer = events.pop() ?? ''  // keep any incomplete event

        for (const event of events) {
          if (signal.aborted) break outer

          const line = event.trim()
          if (!line.startsWith('data: ')) continue

          const raw = line.slice(6).trim()
          if (raw === '[DONE]') break outer

          let parsed: { t?: string; error?: string }
          try { parsed = JSON.parse(raw) } catch { continue }

          if (parsed.error) throw new Error(parsed.error)
          if (!parsed.t) continue

          const chunk = parsed.t
          accumulated += chunk

          if (isFirst) {
            applyFirstChunk(chunk)
            isFirst = false
          } else {
            if (!applyNextChunk(chunk)) break outer  // range removed — stop
          }

          // Update sidebar card text on each chunk
          ydoc.transact(() => { entry.set('proposedText', accumulated) })
        }
      }

      // ── Stream complete ────────────────────────────────────────────────────
      if (!signal.aborted) {
        ydoc.transact(() => { entry.set('status', 'pending') })
      }
      // If signal.aborted: rejectSuggestion has already handled cleanup — do nothing.

    } catch (err) {
      if (signal.aborted) return  // Cancelled — rejectSuggestion owns cleanup

      // Unexpected error — undo any partial document mutations
      if (!isFirst) {
        // First chunk was applied; partial text is in the document with mark
        const range = findSuggestionRange(editor, id)
        if (range) {
          const tr = editor.state.tr.delete(range.from, range.to)
          if (originalText) tr.insertText(originalText, range.from)
          editor.view.dispatch(tr)
        }
      }
      // Remove the Y.Map entry so the sidebar card disappears
      ydoc.transact(() => { suggestionsMap.delete(id) })

      throw err  // re-throw so DocEditorClient can show the error toast
    }
  }

  // ── acceptSuggestion ──────────────────────────────────────────────────────

  function acceptSuggestion(editor: Editor, id: string) {
    editor.chain().focus().acceptAISuggestion(id).run()
    const entry = suggestionsMap.get(id)
    if (entry) ydoc.transact(() => { entry.set('status', 'accepted') })
  }

  // ── rejectSuggestion ──────────────────────────────────────────────────────
  //
  // Works for both 'pending' (complete) and 'streaming' (partial) states.
  //
  // For streaming:
  //   1. Abort the fetch (signal → aborted = true, streaming loop exits)
  //   2. Find whatever partial text is in the document (via the mark)
  //   3. Atomically delete it and restore the original
  //
  // For pending:
  //   Same steps 2-3, no abort needed.
  //
  // Edge case — reject before first chunk arrives (mark not yet in document):
  //   findSuggestionRange returns null; originalText is still in the document
  //   (we don't delete it until first chunk), so no restore needed.

  function rejectSuggestion(editor: Editor, id: string) {
    // 1. Cancel any ongoing stream
    abortRef.current?.abort()
    abortRef.current = null

    const entry = suggestionsMap.get(id)
    const originalText = (entry?.get('originalText') as string) ?? ''

    // 2. Find the marked range in the live document
    const range = findSuggestionRange(editor, id)

    if (range) {
      // 3. Atomic restore: delete proposed text, insert original
      const tr = editor.state.tr.delete(range.from, range.to)
      if (originalText) tr.insertText(originalText, range.from)
      editor.view.dispatch(tr)
    }
    // If range is null: original text is still in the document (reject before
    // first chunk) or it was already removed — nothing to restore.

    // 4. Update Y.Map status
    ydoc.transact(() => { entry?.set('status', 'rejected') })
  }

  return {
    suggestions,
    suggestionsMap,
    streamSuggestion,
    acceptSuggestion,
    rejectSuggestion,
  }
}

// ── findSuggestionRange ────────────────────────────────────────────────────────
//
// Scans the ProseMirror document for the contiguous range carrying the
// aiSuggestion mark with the given id.
// Called before each chunk insert (non-first) and during reject cleanup.

export function findSuggestionRange(
  editor: Editor,
  id: string,
): { from: number; to: number } | null {
  const { state } = editor
  const markType = state.schema.marks['aiSuggestion']
  if (!markType) return null

  let from: number | null = null
  let to: number | null = null

  state.doc.descendants((node, pos) => {
    const mark = node.marks.find(
      (m) => m.type === markType && m.attrs.id === id
    )
    if (mark) {
      const nodeEnd = pos + node.nodeSize
      if (from === null) from = pos
      to = nodeEnd
    }
  })

  if (from === null || to === null) return null
  return { from, to }
}
