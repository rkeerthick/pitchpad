// middleware.ts
//
// Layer 1 of route protection: Clerk edge middleware.
//
// Runs at the Next.js Edge Runtime BEFORE any Route Handler, Server Component,
// or Server Action. Verifies the Clerk session JWT on every request.
//
// ── What it does ──────────────────────────────────────────────────────────────
//
//   Protected routes (everything not in isPublicRoute):
//     • Valid session → request proceeds to the application
//     • No session / expired → redirect to /sign-in
//
//   Public routes (sign-in, sign-up, webhook, invite preview):
//     • Always allowed through — no session required
//
// ── What it does NOT do ───────────────────────────────────────────────────────
//
//   Middleware only checks authentication (is there a logged-in user?).
//   Workspace membership (authorization) is handled by Layer 2:
//   requireWorkspaceAccess() in lib/auth/workspace.ts.
//   Never skip Layer 2 just because middleware passed.
// ─────────────────────────────────────────────────────────────────────────────

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',   // Clerk webhook — no session cookie
  '/invite(.*)',         // Invite landing page — unauthenticated preview is fine
])

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    // protect() redirects unauthenticated requests to /sign-in and returns.
    // Authenticated requests fall through to the handler.
    await auth.protect()
  }
})

export const config = {
  matcher: [
    // Run on all routes except Next.js internals (_next/*) and static files.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
