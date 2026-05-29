// AISuggestionExtension.ts
//
// A Tiptap Mark extension that renders AI-proposed text inline.
//
// The mark stores ONLY the suggestion id.  All other metadata
// (originalText, proposedText, status) lives in the shared Y.Map 'suggestions'
// managed by useAISuggestions.ts.  Keeping the mark lightweight means:
//   - No large strings duplicated across every character in the marked range
//   - No stale data in the document if the Y.Map entry is updated
//   - Accept/reject logic can live in one place (the hook)
//
// Commands provided by this extension:
//   addAISuggestion(id)          — apply mark with this id to current selection
//   acceptAISuggestion(id)       — remove the mark, keep text
//   (reject is handled in useAISuggestions — it needs originalText from Y.Map)
//
// CSS:  .ai-suggestion { ... } defined in globals.css (purple highlight + underline)
// ─────────────────────────────────────────────────────────────────────────────

import { Mark, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    aiSuggestion: {
      /**
       * Apply the aiSuggestion mark to the current selection.
       * Call this after inserting the proposed text and selecting it.
       */
      addAISuggestion: (id: string) => ReturnType

      /**
       * Remove the aiSuggestion mark for the given id, keeping the text.
       * The proposed text becomes permanent document content.
       */
      acceptAISuggestion: (id: string) => ReturnType
    }
  }
}

export const AISuggestionExtension = Mark.create({
  name: 'aiSuggestion',

  // Outer wrapper (rendered before bold/italic marks on the same range)
  priority: 900,

  // inclusive: false — typing at the edges of the suggestion doesn't inherit the mark.
  // The suggestion has a defined start and end; adjacent new text is not part of it.
  inclusive: false,

  // spanning: false — don't let the mark cross block boundaries.
  spanning: false,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-suggestion-id'),
        renderHTML: (attrs) =>
          attrs.id ? { 'data-suggestion-id': String(attrs.id) } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-suggestion-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { class: 'ai-suggestion' }),
      0,
    ]
  },

  addCommands() {
    return {
      // ── addAISuggestion ────────────────────────────────────────────────────
      addAISuggestion:
        (id: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { id }),

      // ── acceptAISuggestion ─────────────────────────────────────────────────
      // Find all text nodes carrying this mark and remove it.
      // We scan the full document (not just the selection) because the
      // selection may have moved since the suggestion was applied.
      acceptAISuggestion:
        (id: string) =>
        ({ tr, state, dispatch }) => {
          const markType = state.schema.marks[this.name]
          if (!markType) return false

          let found = false
          state.doc.descendants((node, pos) => {
            const mark = node.marks.find(
              (m) => m.type === markType && m.attrs.id === id
            )
            if (mark) {
              found = true
              tr.removeMark(pos, pos + node.nodeSize, markType)
            }
          })

          if (found && dispatch) dispatch(tr)
          return found
        },
    }
  },
})
