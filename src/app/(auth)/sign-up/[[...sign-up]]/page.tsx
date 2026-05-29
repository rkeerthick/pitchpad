// (auth)/sign-up/[[...sign-up]]/page.tsx
// ─────────────────────────────────────────────────────────────────────────────

import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
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
      <SignUp />
    </div>
  )
}
