// ── app/api/ai/improve/route.ts ────────────────────────────────────────────────
//
// POST /api/ai/improve
//
// ── Auth + authorization ──────────────────────────────────────────────────────
//
//   Middleware (Layer 1) guarantees a valid Clerk session exists.
//   This route enforces Layer 2: the user must be a member of the workspace
//   that owns the document being improved.
//
//   Request must include `docId`. requireDocumentAccess(docId) verifies:
//     1. Document exists
//     2. Requesting user is a workspace member
//
// ── Streaming ─────────────────────────────────────────────────────────────────
//
//   Returns a Server-Sent Events stream. Each event carries one chunk:
//     data: {"t":"The "}\n\n
//     data: {"t":"proposal "}\n\n
//     data: [DONE]\n\n
//   Error event (before [DONE]):
//     data: {"error":"..."}\n\n
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { streamImproveText } from '@/lib/ai/provider'
import { requireDocumentAccess, ForbiddenError, handleAuthError } from '@/lib/auth/workspace'

const enc = new TextEncoder()

function sseChunk(payload: object | '[DONE]'): Uint8Array {
  const data = payload === '[DONE]' ? '[DONE]' : JSON.stringify(payload)
  return enc.encode(`data: ${data}\n\n`)
}

export async function POST(req: NextRequest) {
  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: unknown
  try { body = await req.json() } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const { text, instruction, docId } = body as {
    text?:        string
    instruction?: string
    docId?:       string
  }

  // ── Layer 2: workspace membership check ────────────────────────────────────
  if (!docId) {
    return new Response(
      JSON.stringify({ error: 'docId is required.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  try {
    await requireDocumentAccess(docId)
  } catch (err) {
    if (err instanceof ForbiddenError) {
      // Return JSON 403 — the SSE stream hasn't started yet
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return handleAuthError(err)
  }

  // ── Validate text ───────────────────────────────────────────────────────────
  if (!text || typeof text !== 'string' || !text.trim()) {
    return new Response(
      JSON.stringify({ error: 'text is required.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }
  if (text.length > 4_000) {
    return new Response(
      JSON.stringify({ error: 'text exceeds 4 000 character limit.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // ── SSE stream ──────────────────────────────────────────────────────────────
  const reqSignal = req.signal

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamImproveText(
          text.trim(),
          instruction?.trim(),
          reqSignal,
        )) {
          if (reqSignal.aborted) break
          controller.enqueue(sseChunk({ t: chunk }))
        }

        if (!reqSignal.aborted) {
          controller.enqueue(sseChunk('[DONE]'))
        }
      } catch (err) {
        if (!reqSignal.aborted) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error('[/api/ai/improve]', msg)

          let userMsg = msg
          if (msg.includes('429') || msg.includes('quota'))
            userMsg = 'Gemini quota exceeded — check your plan at aistudio.google.com.'
          else if (msg.includes('403') || msg.includes('API_KEY'))
            userMsg = 'Invalid Gemini API key. Set GEMINI_API_KEY in .env.local.'

          controller.enqueue(sseChunk({ error: userMsg }))
          controller.enqueue(sseChunk('[DONE]'))
        }
      } finally {
        controller.close()
      }
    },
    cancel() {
      // Client disconnected — signal is already aborted
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
