/**
 * src/routes/score.ts
 *
 * POST /api/score — score Meta Ads copy variations with the deterministic
 * heuristic scorer from Gate 3 (src/services/scorer.ts).
 *
 * Gate 4 Phase B deliverable. Wired into src/index.ts.
 *
 * The scorer is stateless and synchronous (pure code + YAML config, no LLM),
 * so this router has zero external dependencies. Just validates the request
 * body, calls `score()`, and returns the structured result.
 *
 * Flow:
 *   1. Validate request body (primary_text + headline required non-empty,
 *      description optional).
 *   2. Call score({primary_text, headline, description}) from scorer.
 *   3. Return {total, max_possible, min_possible, rules} directly.
 *   4. Unexpected scorer error → log server-side, return 500 with safe
 *      message (no stack trace, no internal detail).
 */

import { Router, Request, Response } from 'express'
import { score, AdCopy } from '../services/scorer'

/**
 * Factory: builds the router with no dependencies. Kept as a factory (instead
 * of a module-level Router) for consistency with createGenerateRouter and to
 * leave room for future injected deps (e.g. async scorer backend) without
 * breaking the mount call in src/index.ts.
 */
export function createScoreRouter(): Router {
  const router = Router()

  router.post('/score', (req: Request, res: Response) => {
    // --- Validate input -----------------------------------------------
    const body = req.body as Record<string, unknown> | undefined
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Request body must be a JSON object.' })
    }

    const { primary_text, headline, description } = body

    if (typeof primary_text !== 'string' || primary_text.trim().length === 0) {
      return res
        .status(400)
        .json({ error: 'primary_text is required (non-empty string).' })
    }
    if (typeof headline !== 'string' || headline.trim().length === 0) {
      return res.status(400).json({ error: 'headline is required (non-empty string).' })
    }
    if (description !== undefined && typeof description !== 'string') {
      return res
        .status(400)
        .json({ error: 'description must be a string if provided.' })
    }

    const validated: AdCopy = {
      primary_text: primary_text.trim(),
      headline: headline.trim(),
      ...(description !== undefined ? { description: description.trim() } : {}),
    }

    // --- Score (pure, synchronous) ------------------------------------
    try {
      const result = score(validated)
      return res.status(200).json(result)
    } catch (err) {
      // Log full detail server-side (developer needs it), but DO NOT leak
      // stack traces or internal state to the client.
      console.error('[score] scorer failed:', err)
      const safeMessage = err instanceof Error ? err.message.split('\n')[0] : 'unknown error'
      return res.status(500).json({ error: `Scorer failed: ${safeMessage}` })
    }
  })

  return router
}