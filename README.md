# PitchPad

AI-native collaborative proposal-writing SaaS. Built with Next.js 15 (App Router), Tiptap + Yjs multiplayer editing, Gemini AI streaming suggestions, Clerk auth, Prisma + PostgreSQL, and an Axiom design system.

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 15 (App Router, TypeScript) |
| Editor | Tiptap + y-prosemirror |
| Real-time collab | Yjs + y-websocket |
| Auth | Clerk |
| Database | Prisma + PostgreSQL |
| AI | Google Gemini 2.0 Flash (streaming SSE) |
| Email | Resend (optional) |
| Design system | Axiom (custom — `src/lib/tokens.ts`) |

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

```bash
cp .env.local.example .env.local
```

Fill in:
- `DATABASE_URL` — PostgreSQL connection string ([Neon](https://neon.tech) free tier recommended)
- `CLERK_SECRET_KEY` + `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — from [dashboard.clerk.com](https://dashboard.clerk.com)
- `CLERK_WEBHOOK_SECRET` — Clerk Dashboard → Webhooks → `https://your-domain/api/webhooks/clerk`, events: `user.created`, `user.updated`
- `GEMINI_API_KEY` — from [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
- `NEXT_PUBLIC_APP_URL` — your app's base URL (e.g. `http://localhost:4000`)

### 3. Push database schema

```bash
npm run db:push        # dev: push schema directly
npm run db:migrate     # prod: create migration files
npm run db:generate    # regenerate Prisma client after schema changes
npm run db:studio      # open Prisma Studio GUI
```

### 4. Start the collab WebSocket server

```bash
npm run collab-server  # runs on ws://localhost:1234
```

### 5. Start the Next.js dev server

```bash
npm run dev:clean      # clears .next cache and starts on :4000
```

## Route protection model

Three independent enforcement layers — all three must pass for any request to succeed:

1. **Edge Middleware** (`src/middleware.ts`) — Clerk JWT validation. No valid session → redirect to `/sign-in`. Runs before any server code.
2. **Server helper** (`src/lib/auth/workspace.ts`) — `requireWorkspaceAccess(workspaceId)` checks DB membership. Called at the top of every route handler. Returns 403 if not a member.
3. **Scoped DB queries** — every query includes `WHERE workspace_id = :id`. Defense in depth.

Client-side checks are UI-only and never relied upon for security.

## Project structure

```
src/
  middleware.ts              # Layer 1: Clerk edge middleware
  lib/
    db.ts                    # Prisma singleton
    auth/workspace.ts        # Layer 2: access control helpers
    ai/provider.ts           # Server-only Gemini module
    tokens.ts                # Axiom design tokens
  app/
    (auth)/                  # Sign-in / sign-up pages
    workspace/[slug]/        # Workspace dashboard + settings
    invite/[token]/          # Invite acceptance flow
    doc/[id]/                # Collaborative editor
    api/
      webhooks/clerk/        # User provisioning
      workspaces/            # Workspace + document CRUD
      invite/                # Invite acceptance
      ai/improve/            # Gemini streaming endpoint
  components/
    editor/                  # Tiptap + AI sidebar
    workspace/               # Switcher, invite form, members table
```

## License

MIT
