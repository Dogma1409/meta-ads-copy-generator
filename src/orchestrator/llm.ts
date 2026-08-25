/**
 * src/orchestrator/llm.ts
 *
 * LLM factory + provider client.
 *
 * Gate 2 deliverable. Only the Groq provider is implemented in v1; the
 * factory pattern lets us add more providers (OpenAI, Anthropic, etc.) in
 * later gates without touching the route layer.
 *
 * Design notes:
 *   - Factory rejects missing config loudly (no silent defaults — project rule).
 *   - Groq client uses JSON mode (response_format: { type: 'json_object' }) on
 *     the retry to maximize the chance of parseable output. The first call
 *     is plain (no JSON mode) — empirically the 8B-instant model is more
 *     creative without the constraint, and we still validate + retry.
 *   - On malformed JSON, we retry once with a nudge message. If still
 *     malformed, we throw with the raw response (truncated to 500 chars).
 *   - Duration is measured in-process around the network call.
 *   - Token usage is taken from the successful call's response.usage; if the
 *     SDK didn't report usage we estimate from char length (~4 chars/token).
 */

import Groq from 'groq-sdk'
import { buildGenerationPrompt } from './prompts'

// --- Public types -------------------------------------------------------

export interface GenerateRequest {
  product_name: string
  product_description: string
  audience: string
  variations_count: number // 1-10
}

export interface GenerateVariation {
  primary_text: string
  headline: string
  description: string
}

export interface GenerateResponse {
  variations: GenerateVariation[]
  model_used: string
  tokens_in: number
  tokens_out: number
  duration_ms: number
}

export interface LLMClient {
  generateCopy(request: GenerateRequest): Promise<GenerateResponse>
}

export interface LLMFactoryConfig {
  provider: string
  model: string
  apiKey: string
}

// --- Factory ------------------------------------------------------------

/**
 * Create an LLMClient for the given provider.
 *
 * Throws loudly if config is missing — caller must never end up with silent
 * defaults (project rule, see hermes).
 */
export function createLLMClient(config: LLMFactoryConfig): LLMClient {
  if (!config || !config.provider || !config.model || !config.apiKey) {
    throw new Error(
      'LLM factory: provider, model, and apiKey are required (no silent defaults — project rule)'
    )
  }

  if (config.provider !== 'groq') {
    throw new Error(
      `LLM factory: provider "${config.provider}" not supported in v1 (groq only)`
    )
  }

  return createGroqClient({ apiKey: config.apiKey, model: config.model })
}

// --- Groq implementation ------------------------------------------------

interface GroqClientConfig {
  apiKey: string
  model: string
}

function createGroqClient(cfg: GroqClientConfig): LLMClient {
  const groq = new Groq({ apiKey: cfg.apiKey })
  const model = cfg.model

  return {
    async generateCopy(request: GenerateRequest): Promise<GenerateResponse> {
      const { system, user } = buildGenerationPrompt(request)
      const start = Date.now()

      // First attempt: plain mode (more creative), no nudge.
      const first = await callGroq(groq, model, system, user, false)
      let parsed = tryParseVariations(first.raw)

      let successfulCall: CallResult = first

      if (!parsed.ok) {
        // Retry once with a nudge + JSON mode forced.
        const nudgedUser =
          user +
          '\n\nIMPORTANT: Your previous response was malformed (not valid JSON matching the contract). Return ONLY valid JSON, no markdown fences, no commentary.'
        const retry = await callGroq(groq, model, system, nudgedUser, true)
        successfulCall = retry
        parsed = tryParseVariations(retry.raw)
        if (!parsed.ok) {
          const truncated =
            retry.raw.length > 500 ? retry.raw.slice(0, 500) + '...[truncated]' : retry.raw
          throw new Error(
            `LLM returned malformed JSON after retry. Raw response (truncated to 500 chars): ${truncated}`
          )
        }
      }

      const duration_ms = Date.now() - start
      const tokens_in = successfulCall.usage?.prompt_tokens ?? estimateTokens(system + '\n' + user)
      const tokens_out = successfulCall.usage?.completion_tokens ?? estimateTokens(successfulCall.raw)

      return {
        variations: parsed.value,
        model_used: model,
        tokens_in,
        tokens_out,
        duration_ms,
      }
    },
  }
}

// --- Internals ----------------------------------------------------------

interface CallResult {
  raw: string
  usage: { prompt_tokens: number; completion_tokens: number } | null
}

/**
 * Rough token estimator for the rare case where the SDK didn't return usage.
 * ~4 chars per token is a standard heuristic for English/Spanish text.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

async function callGroq(
  groq: Groq,
  model: string,
  system: string,
  user: string,
  jsonMode: boolean
): Promise<CallResult> {
  const params: {
    model: string
    messages: Array<{ role: 'system' | 'user'; content: string }>
    temperature: number
    response_format?: { type: 'json_object' }
  } = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.7,
  }
  if (jsonMode) {
    params.response_format = { type: 'json_object' }
  }

  const completion = await groq.chat.completions.create(params)
  const content = completion.choices[0]?.message?.content
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error('LLM returned an empty completion (no message content).')
  }
  return {
    raw: content,
    usage: completion.usage
      ? {
          prompt_tokens: completion.usage.prompt_tokens,
          completion_tokens: completion.usage.completion_tokens,
        }
      : null,
  }
}

interface ParseResult {
  ok: boolean
  value: GenerateVariation[]
}

/**
 * Try to parse the raw LLM string into a validated GenerateVariation[].
 *
 * Accepts either:
 *   - top-level { "variations": [ ... ] }
 *   - top-level [ ... ]   (some models drop the wrapper)
 *
 * Validates each entry's field types. Any malformed entry fails the whole
 * batch — strict by design (we want the LLM to retry, not silently drop).
 */
function tryParseVariations(raw: string): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, value: [] }
  }

  let arr: unknown
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'variations' in parsed) {
    arr = (parsed as { variations: unknown }).variations
  } else if (Array.isArray(parsed)) {
    arr = parsed
  } else {
    return { ok: false, value: [] }
  }

  if (!Array.isArray(arr) || arr.length === 0) {
    return { ok: false, value: [] }
  }

  const validated: GenerateVariation[] = []
  for (const item of arr) {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as GenerateVariation).primary_text === 'string' &&
      typeof (item as GenerateVariation).headline === 'string' &&
      typeof (item as GenerateVariation).description === 'string'
    ) {
      validated.push({
        primary_text: (item as GenerateVariation).primary_text,
        headline: (item as GenerateVariation).headline,
        description: (item as GenerateVariation).description,
      })
    } else {
      return { ok: false, value: [] }
    }
  }

  return { ok: true, value: validated }
}
