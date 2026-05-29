import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

// ── Font loading ──────────────────────────────────────────────────────────────
// Inter: UI sans-serif.  Subsets to latin; weights we use (400/500/600/700).
// next/font/google inlines the @font-face with preload — zero layout shift.
//
// Geist Mono: loaded via Google Fonts CDN (not distributed via next/font).
// Falls back through JetBrains Mono → Fira Code → system monospace.
// ─────────────────────────────────────────────────────────────────────────────

const inter = Inter({
  subsets:  ['latin'],
  weight:   ['400', '500', '600', '700'],
  variable: '--font-inter',
  display:  'swap',
})

export const metadata: Metadata = {
  title:       'PitchPad',
  description: 'AI-native collaborative proposal writing',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // ClerkProvider must wrap the entire app so auth state is available
    // in every Server Component, Route Handler, and Client Component.
    //
    // Redirect URLs are configured via env vars in .env.local:
    //   NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL="/"
    //   NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL="/"
    //   NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL="/sign-in"
    // After sign-in, / redirects to the user's personal workspace.
    <ClerkProvider>
      {/* suppressHydrationWarning on <html>: browser extensions (e.g. Google Tag
          Assistant, Grammarly) inject attributes after SSR, causing React
          hydration mismatch warnings.  suppressHydrationWarning silences it
          on this element only — child node mismatches are still reported. */}
      <html lang="en" className={inter.variable} suppressHydrationWarning>
        {/* Geist Mono via Google Fonts CDN */}
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link
            href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600&display=swap"
            rel="stylesheet"
          />
        </head>
        <body style={{ fontFamily: 'var(--font-sans)' }}>{children}</body>
      </html>
    </ClerkProvider>
  )
}
