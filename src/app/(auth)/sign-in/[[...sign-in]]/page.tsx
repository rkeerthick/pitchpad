// (auth)/sign-in/[[...sign-in]]/page.tsx
//
// Clerk-hosted sign-in page, rendered inside Next.js.
// [[...sign-in]] catches Clerk's sub-routes (e.g. /sign-in/sso-callback).
// ─────────────────────────────────────────────────────────────────────────────

import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F3F4F6',
      }}
    >
      <SignIn />
    </div>
  )
}
