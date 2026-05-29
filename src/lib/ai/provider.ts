// ── lib/ai/provider.ts ────────────────────────────────────────────────────────
//
// THE ONLY module that talks to Gemini.  Import only from route handlers or
// Server Components — never from client code.
//
// `import 'server-only'` enforces this at build time.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'
import { GoogleGenerativeAI } from '@google/generative-ai'

// Lazily initialised so missing-key errors surface at request time, not cold start.
let _client: GoogleGenerativeAI | null = null

function getClient(): GoogleGenerativeAI {
  if (!_client) {
    const key = process.env.GEMINI_API_KEY
    if (!key) {
      throw new Error(
        'GEMINI_API_KEY is not set. Add it to .env.local.'
      )
    }
    _client = new GoogleGenerativeAI(key)
  }
  return _client
}

const MODEL = 'gemini-2.0-flash'

// ── Shared prompt builder ─────────────────────────────────────────────────────

function buildPrompt(selectedText: string, instruction: string): string {
  return [
    'You are a precise writing assistant embedded in a collaborative proposal editor.',
    'The user has selected text and wants you to improve it.',
    '',
    `Instruction: ${instruction}`,
    '',
    'Rules (follow strictly):',
    '- Return ONLY the improved text. No explanation, no preamble, no quotes.',
    '- Preserve the voice and approximate length unless instructed otherwise.',
    '- Do not add markdown formatting.',
    '- Do not add a trailing newline.',
    '',
    '--- SELECTED TEXT ---',
    selectedText,
    '--- END ---',
  ].join('\n')
}

// ── streamImproveText ─────────────────────────────────────────────────────────
//
// Async generator that yields text chunks from Gemini as they arrive.
// Used by the SSE route handler — each yielded string is one partial token run.
//
// The `signal` parameter is checked between chunks so the route handler can
// stop enqueuing as soon as the client disconnects.

export async function* streamImproveText(
  selectedText: string,
  instruction: string = 'Improve this text for clarity and impact.',
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const model = getClient().getGenerativeModel({ model: MODEL })
  const result = await model.generateContentStream(buildPrompt(selectedText, instruction))

  for await (const chunk of result.stream) {
    if (signal?.aborted) return
    const text = chunk.text()
    if (text) yield text
  }
}
