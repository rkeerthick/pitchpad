'use client'

// FormatToolbar.tsx
//
// Formatting toolbar for the document editor.
// Renders as a flat row of icon/text buttons — no dropdowns.
// Uses the .toolbar-btn class from globals.css for base hover/active styles.
//
// The toolbar receives the Tiptap `editor` instance and reads `editor.isActive()`
// to synchronize button active state with the current selection.
//
// Groups (separated by hairline dividers):
//   1. Text format: Bold · Italic · Underline · Strike · Code
//   2. Block type:  H1 · H2 · H3 · Quote · Code block · Bullet · Ordered list
//   3. (Right side) Word count — monospace metadata label
// ─────────────────────────────────────────────────────────────────────────────

import type { Editor } from '@tiptap/react'
import { colors, fonts, fontSize, space } from '@/lib/tokens'

interface FormatToolbarProps {
  editor: Editor | null
}

export function FormatToolbar({ editor }: FormatToolbarProps) {
  if (!editor) return null

  return (
    <>
      {/* ── Text format group ────────────────────────────────────────────────── */}
      <ToolbarBtn
        label="B"
        title="Bold (⌘B)"
        active={editor.isActive('bold')}
        style={{ fontWeight: 700 }}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarBtn
        label="I"
        title="Italic (⌘I)"
        active={editor.isActive('italic')}
        style={{ fontStyle: 'italic' }}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarBtn
        label="S̶"
        title="Strikethrough"
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />
      <ToolbarBtn
        label="`"
        title="Inline code"
        active={editor.isActive('code')}
        onClick={() => editor.chain().focus().toggleCode().run()}
      />

      <Divider />

      {/* ── Block type group ─────────────────────────────────────────────────── */}
      <ToolbarBtn
        label="H1"
        title="Heading 1"
        active={editor.isActive('heading', { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      />
      <ToolbarBtn
        label="H2"
        title="Heading 2"
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarBtn
        label="H3"
        title="Heading 3"
        active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      />

      <Divider />

      <ToolbarBtn
        label="❝"
        title="Blockquote"
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
      <ToolbarBtn
        label="</>"
        title="Code block"
        active={editor.isActive('codeBlock')}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      />

      <Divider />

      <ToolbarBtn
        label="• —"
        title="Bullet list"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarBtn
        label="1."
        title="Ordered list"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />

      {/* ── Spacer + word count ───────────────────────────────────────────────── */}
      <div style={{ flex: 1 }} />
      <WordCount editor={editor} />
    </>
  )
}

// ── ToolbarBtn ───────────────────────────────────────────────────────────────

interface ToolbarBtnProps {
  label: string
  title: string
  active?: boolean
  style?: React.CSSProperties
  onClick: () => void
}

function ToolbarBtn({ label, title, active, style, onClick }: ToolbarBtnProps) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`toolbar-btn${active ? ' is-active' : ''}`}
      style={style}
    >
      {label}
    </button>
  )
}

// ── Divider ──────────────────────────────────────────────────────────────────

function Divider() {
  return (
    <div
      style={{
        width: 1,
        height: 20,
        background: colors.border,
        margin: `0 ${space[1]}px`,
        flexShrink: 0,
      }}
    />
  )
}

// ── WordCount ─────────────────────────────────────────────────────────────────
// Reads character count from Tiptap's `storage.characterCount` if the
// CharacterCount extension is installed; otherwise counts words from text.
// Displayed in monospace as subtle metadata — it's information, not UI chrome.

function WordCount({ editor }: { editor: Editor }) {
  // Try CharacterCount extension first
  const charCount = editor.storage?.characterCount?.words?.()
  const wordCount = charCount != null
    ? charCount
    : editor.getText().split(/\s+/).filter(Boolean).length

  return (
    <span
      style={{
        fontFamily: fonts.mono,
        fontSize: fontSize.label,
        color: colors.fg3,
        letterSpacing: '0.04em',
        paddingRight: space[1],
        userSelect: 'none',
      }}
    >
      {wordCount} {wordCount === 1 ? 'word' : 'words'}
    </span>
  )
}
