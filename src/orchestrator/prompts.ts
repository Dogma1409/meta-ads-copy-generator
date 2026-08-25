/**
 * src/orchestrator/prompts.ts
 *
 * Prompt templates for the LLM ad-copy generator.
 *
 * Gate 2 deliverable.
 *
 * The system prompt establishes the role and the strict JSON output contract.
 * The user prompt fills in the product / audience / count inputs from the
 * GenerateRequest. The contract is intentionally strict: only valid JSON,
 * no markdown fences, no commentary. This makes the LLM response parseable
 * by src/orchestrator/llm.ts without expensive regex stripping.
 */

import { GenerateRequest } from './llm'

/**
 * Build the {system, user} prompt pair for the Groq chat completion call.
 *
 * Hard limits enforced in the system prompt (Meta Ads guidelines):
 *   - primary_text: 80-125 chars recommended (Meta truncates after ~125 chars on mobile)
 *   - headline: <= 40 chars (otherwise truncated in feed)
 *   - description: <= 30 chars (otherwise truncated in feed)
 */
export function buildGenerationPrompt(req: GenerateRequest): { system: string; user: string } {
  const system = `You are a direct-response copywriter specialized in Meta Ads (Facebook + Instagram feed).

Your job: generate ad copy variations for the product described by the user.

OUTPUT CONTRACT — STRICT, NON-NEGOTIABLE:
- Return ONLY valid JSON. No markdown fences (no \`\`\`json or \`\`\`). No commentary before or after.
- The JSON must match this exact shape:
  {
    "variations": [
      {
        "primary_text": "<string>",
        "headline": "<string>",
        "description": "<string>"
      },
      ...
    ]
  }
- Each variation must be self-contained and target the given audience from a DIFFERENT psychological angle (e.g. benefit, pain point, social proof, urgency, question, objection-handling, curiosity).

HARD LIMITS (Meta Ads will truncate otherwise):
- primary_text: 80-125 characters recommended. Stay in this range.
- headline: <= 40 characters. Hard limit.
- description: <= 30 characters. Hard limit.

TONE: punchy, specific, benefit-led. No corporate fluff. No emojis unless the audience explicitly calls for them. Write in the same language as the user's input (Spanish input → Spanish output, English input → English output).

Do NOT include hashtags, URLs, emoji spam, or "Learn more" / "Shop now" CTAs in primary_text — those belong in the headline/description or are auto-added by Meta.`

  const user = `PRODUCT_NAME: ${req.product_name}

PRODUCT_DESCRIPTION: ${req.product_description}

TARGET_AUDIENCE: ${req.audience}

VARIATIONS_REQUESTED: ${req.variations_count}

Generate exactly ${req.variations_count} variations, each targeting the audience, each with primary_text + headline + description. Return ONLY valid JSON, no markdown fences, no commentary.`

  return { system, user }
}
