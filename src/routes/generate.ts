/**
 * src/routes/generate.ts
 *
 * POST /api/generate — generate Meta Ads copy variations.
 *
 * Gate 2 deliverable. Wired into src/index.ts.
 *
 * Flow:
 *   1. Validate request body (4 required fields, variations_count in 1-10).
 *   2. Compute SHA-256 of canonical (sorted-key) JSON → cache key.
 *   3. Cache hit → return cached response immediately.
 *   4. Cache miss → call llm.generateCopy, cache the result, return JSON.
 *   5. LLM error → log server-side, return 502 with a safe message.
 *
 * The cache TTL comes from CACHE_TTL_SECONDS env (default 3600) read at
 * router construction time, not per-request, to avoid env reads in the hot
 * path.
 */

import { Router, Request, Response } from 'express'
import { createHash } from 'crypto'
import { GenerateRequest, GenerateResponse, LLMClient } from '../orchestrator/llm'
import { ResponseCache } from '../cache'

export interface CreateGenerateRouterDeps {
  llm: LLMClient
  cache: ResponseCache
  cacheTtlSeconds: number
}

/**
 * Factory: builds the router with its dependencies injected. Keeps the
 * router testable in isolation (Gate 4 will likely add tests).
 */
export function createGenerateRouter(deps: CreateGenerateRouterDeps): Router {
  const router = Router()
  const { llm, cache, cacheTtlSeconds } = deps

  router.post('/generate', async (req: Request, res: Response) => {
    // --- Validate input -----------------------------------------------
    const body = req.body as Record<string, unknown> | undefined
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Request body must be a JSON object.' })
    }

    const { product_name, product_description, audience, variations_count } = body

    if (typeof product_name !== 'string' || product_name.trim().length === 0) {
      return res.status(400).json({ error: 'product_name is required (non-empty string).' })
    }
    if (typeof product_description !== 'string' || product_description.trim().length === 0) {
      return res
        .status(400)
        .json({ error: 'product_description is required (non-empty string).' })
    }
    if (typeof audience !== 'string' || audience.trim().length === 0) {
      return res.status(400).json({ error: 'audience is required (non-empty string).' })
    }
    if (
      typeof variations_count !== 'number' ||
      !Number.isInteger(variations_count) ||
      variations_count < 1 ||
      variations_count > 10
    ) {
      return res
        .status(400)
        .json({ error: 'variations_count is required (integer between 1 and 10 inclusive).' })
    }

    const validated: GenerateRequest = {
      product_name: product_name.trim(),
      product_description: product_description.trim(),
      audience: audience.trim(),
      variations_count,
    }

    // --- Cache lookup -------------------------------------------------
    const cacheKey = canonicalHash(validated)
    const cached = cache.get(cacheKey)
    if (cached !== null) {
      // Mark cache hit so the client/curl can see it without extra plumbing.
      res.set('X-Cache', 'HIT')
      return res.status(200).json(cached as GenerateResponse)
    }

    // --- LLM call -----------------------------------------------------
    try {
      const result = await llm.generateCopy(validated)
      cache.set(cacheKey, result, cacheTtlSeconds)
      res.set('X-Cache', 'MISS')
      return res.status(200).json(result)
    } catch (err) {
      // Log full detail server-side (developer needs it), but DO NOT leak
      // the API key, the raw LLM response, or stack traces to the client.
      console.error('[generate] LLM provider error:', err)
      const safeMessage = err instanceof Error ? err.message.split('\n')[0] : 'unknown error'
      return res.status(502).json({ error: `LLM provider error: ${safeMessage}` })
    }
  })

  return router
}

/**
 * Compute a stable SHA-256 hash of the canonical (key-sorted) JSON of the
 * request. Sorting keys ensures semantically identical requests produce the
 * same hash regardless of field order in the incoming JSON.
 */
function canonicalHash(req: GenerateRequest): string {
  const canonical = JSON.stringify(req, Object.keys(req).sort())
  return createHash('sha256').update(canonical).digest('hex')
}
