// ── Axiom Design Tokens ───────────────────────────────────────────────────────
//
// Single source of truth for the Axiom design system.
// Consumed three ways:
//   1. As typed TS constants (imported directly into components)
//   2. As CSS custom properties (see globals.css — variables map 1:1)
//   3. As inline style values where Tailwind/CSS classes aren't available
//
// Axiom personality: cool gray palette, system blue accent, monospace metadata.
// Everything is a precise engineered instrument — not soft, not harsh.
// ─────────────────────────────────────────────────────────────────────────────

export const colors = {
  // ── Backgrounds ─────────────────────────────────────────────────────────────
  bgBase:     '#F3F4F6',   // app shell, page canvas
  bgSurface:  '#FFFFFF',   // editor surface, cards, modals
  bgPanel:    '#EAECF0',   // sidebars, toolbars, nav
  bgElevated: '#DDE0E7',   // hover states, active rows, selected items

  // ── Borders ─────────────────────────────────────────────────────────────────
  border:      '#CDD0D8',  // default dividers, input outlines
  borderStrong:'#9EA5B5',  // focused inputs, active tab indicators

  // ── Foreground ──────────────────────────────────────────────────────────────
  fg1: '#111827',  // primary text, headings
  fg2: '#6B7280',  // secondary text, labels, captions
  fg3: '#9CA3AF',  // disabled, placeholder, decorative

  // ── Semantic accents ────────────────────────────────────────────────────────
  accent:  '#2563EB',  // interactive: links, buttons, focus rings, selection
  ai:      '#7C3AED',  // AI suggestion marks, AI badge — distinct from accent
  danger:  '#DC2626',  // destructive actions, error states
  success: '#059669',  // success states, "won" status badge

  // ── Derived / alpha variants (used inline where CSS vars can't reach) ────────
  accentBg:  'rgba(37,99,235,0.08)',   // subtle accent fill (selected range bg)
  aiBg:      'rgba(124,58,237,0.08)',  // AI suggestion highlight fill
  aiUnder:   '#7C3AED',               // AI suggestion underline color
  dangerBg:  'rgba(220,38,38,0.08)',
  successBg: 'rgba(5,150,105,0.08)',
} as const

export type Color = keyof typeof colors

// ── Typography ─────────────────────────────────────────────────────────────────
// Inter for all UI chrome, labels, and body copy.
// Geist Mono for metadata: dates, statuses, IDs, word counts, version numbers.
// The contrast between the two typefaces creates visual hierarchy without
// weight/color alone — mono anchors information density, sans reads fluidly.
export const fonts = {
  sans: "'Inter', system-ui, -apple-system, sans-serif",
  mono: "'Geist Mono', 'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
} as const

// Type scale (px).  11-32px covering label → editorial heading.
// Not a pure modular scale — each step chosen for optical rhythm.
export const fontSize = {
  label:    11,
  caption:  12,
  body:     13,
  base:     14,
  md:       16,
  lg:       19,
  xl:       24,
  display:  32,
} as const

export type FontSize = keyof typeof fontSize

export const fontWeight = {
  regular: 400,
  medium:  500,
  semibold:600,
  bold:    700,
} as const

export const lineHeight = {
  tight:  1.25,
  snug:   1.375,
  normal: 1.5,
  relaxed:1.625,
} as const

// ── Spacing (4px grid, 2px at micro end) ─────────────────────────────────────
// Named semantically so call sites read as intent, not magic numbers.
export const space = {
  px:  1,
  0.5: 2,
  1:   4,
  1.5: 6,
  2:   8,
  2.5: 10,
  3:   12,
  4:   16,
  5:   20,
  6:   24,
  7:   28,
  8:   32,
  10:  40,
  12:  48,
  16:  64,
  20:  80,
  24:  96,
} as const

export type SpaceKey = keyof typeof space

// ── Border radii ─────────────────────────────────────────────────────────────
// Small, tight radii signal precision.  Round things look approachable/soft;
// square things look locked in.  Axiom is between: structure, not softness.
export const radius = {
  none: 0,
  sm:   2,
  md:   4,
  lg:   6,
  xl:   8,
} as const

// ── Motion ────────────────────────────────────────────────────────────────────
// Fast and subtle.  Interactive elements respond at 80ms (barely perceptible
// delay — feels instant but not jarring).  Panels/overlays at 130ms (enough
// to feel intentional, not enough to feel sluggish).
// Easing: standard ease — accelerates out of resting state, decelerates into place.
export const motion = {
  fast:     '80ms ease',
  standard: '130ms ease',
  slow:     '200ms ease',
} as const

// ── Shadows ───────────────────────────────────────────────────────────────────
// Axiom avoids decorative shadows.  These are strictly for layer separation
// (floating panels, dropdowns) and are intentionally subtle.
export const shadow = {
  none:   'none',
  sm:     '0 1px 2px rgba(17,24,39,0.06)',
  md:     '0 4px 12px rgba(17,24,39,0.08)',
  lg:     '0 8px 24px rgba(17,24,39,0.10)',
  overlay:'0 16px 48px rgba(17,24,39,0.14)',
} as const

// ── Layout constants ──────────────────────────────────────────────────────────
export const layout = {
  // The writing surface is constrained to 720px so line lengths stay
  // comfortable for long-form reading/writing (≈ 75-80 chars at 14px).
  editorMaxWidth: 720,

  // Chrome heights
  topBarHeight: 48,
  toolbarHeight: 40,

  // Sidebar widths
  aiSidebarWidth: 280,
  commentSidebarWidth: 264,

  // Sidebar collapse animation
  sidebarTransition: '130ms ease',
} as const

// ── Status badge config ────────────────────────────────────────────────────────
// Each proposal status maps to a color triple (text, bg, border).
// Used by ProposalDashboard and document header status chips.
export const statusConfig = {
  draft:  { label: 'draft',   color: colors.fg2,    bg: colors.bgPanel,    border: colors.border      },
  review: { label: 'review',  color: '#B45309',     bg: 'rgba(217,119,6,0.08)', border: '#D97706'    },
  sent:   { label: 'sent',    color: colors.accent, bg: colors.accentBg,   border: colors.accent      },
  won:    { label: 'won',     color: colors.success,bg: colors.successBg,  border: colors.success     },
  lost:   { label: 'lost',    color: colors.danger, bg: colors.dangerBg,   border: colors.danger      },
} as const

export type ProposalStatus = keyof typeof statusConfig
