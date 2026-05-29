// lib/db.ts
//
// Prisma client singleton.
//
// In development, Next.js HMR destroys and recreates modules on each save.
// Without the globalThis trick, every save would open a new connection pool
// and you'd hit Postgres connection limits almost immediately.
//
// In production, each serverless function invocation shares a module instance
// within the same process lifetime, so the globalThis guard is a no-op there.
// ─────────────────────────────────────────────────────────────────────────────

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}
