'use client'

// Refresher.tsx
//
// Calls router.refresh() on every mount so that when the user navigates back
// to this page (browser back button / bfcache restore), Next.js re-fetches
// the server component data — ensuring document titles are always up to date.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function Refresher() {
  const router = useRouter()

  useEffect(() => {
    router.refresh()
  }, [router])

  return null
}
