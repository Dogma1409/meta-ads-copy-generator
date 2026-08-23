/**
 * meta-ads-copy-generator — entrypoint.
 *
 * Stack: Node 20 + Express 4 + TypeScript + Groq SDK.
 * Frontend: vanilla HTML/CSS/JS servido desde /public (zero-dep JS, solo Google Fonts para tipografia).
 *
 * Fase 0 (Gate 1): solo Express + /health. El resto se construye en gates siguientes.
 *   Gate 2: LLM factory + POST /api/generate
 *   Gate 3: Scorer + POST /api/score
 *   Gate 4: Frontend completo
 *   Gate 5: Deploy Railway + README final
 */

import 'dotenv/config'
import path from 'path'
import express from 'express'

const PORT = Number(process.env.PORT ?? 3001)

const app = express()

app.use(express.json())

// Static files (frontend vanilla)
app.use(express.static(path.resolve(process.cwd(), 'public')))

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' })
})

app.listen(PORT, () => {
  console.log(`meta-ads-copy-generator listening on http://localhost:${PORT}`)
})

export default app
