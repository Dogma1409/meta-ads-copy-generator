/**
 * meta-ads-copy-generator — entrypoint.
 *
 * Stack: Node 20 + Express 4 + TypeScript + Groq SDK.
 * Frontend: vanilla HTML/CSS/JS servido desde /public (zero-dep JS, solo Google Fonts para tipografia).
 *
 * Gate 1: skeleton Express + /health.
 * Gate 2: LLM factory + POST /api/generate (current).
 * Gate 3: Scorer standalone (lib + CLI via `npm run test:fixtures`). HTTP wiring lands in Gate 4.
 * Gate 4: Frontend completo + POST /api/score (wired to scorer from Gate 3).
 * Gate 5: Deploy Railway + README final.
 */

import 'dotenv/config'
import path from 'path'
import express from 'express'
import { createLLMClient } from './orchestrator/llm'
import { ResponseCache } from './cache'
import { createGenerateRouter } from './routes/generate'
import { createScoreRouter } from './routes/score'

// --- Env validation ------------------------------------------------------

const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_MODEL = process.env.GROQ_MODEL

if (!GROQ_API_KEY || GROQ_API_KEY.trim().length === 0) {
  console.error(
    '[startup] GROQ_API_KEY is missing or empty. Set it in .env (see .env.example). Refusing to start — no silent defaults (project rule).'
  )
  process.exit(1)
}
if (!GROQ_MODEL || GROQ_MODEL.trim().length === 0) {
  console.error(
    '[startup] GROQ_MODEL is missing or empty. Suggested: llama-3.1-8b-instant (see .env.example). Refusing to start — no silent defaults (project rule).'
  )
  process.exit(1)
}

const PORT = Number(process.env.PORT ?? 3001)
const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS ?? 3600)

// --- App wiring ----------------------------------------------------------

const app = express()

app.use(express.json())

// Static files (frontend vanilla) — kept from Gate 1, untouched.
app.use(express.static(path.resolve(process.cwd(), 'public')))

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' })
})

// Gate 2: POST /api/generate.
const llm = createLLMClient({ provider: 'groq', model: GROQ_MODEL, apiKey: GROQ_API_KEY })
const cache = new ResponseCache()
app.use('/api', createGenerateRouter({ llm, cache, cacheTtlSeconds: CACHE_TTL_SECONDS }))

// Gate 4 Phase B: POST /api/score (deterministic heuristic scorer, no LLM).
app.use('/api', createScoreRouter())

app.listen(PORT, () => {
  console.log(`meta-ads-copy-generator listening on http://localhost:${PORT}`)
})

export default app
