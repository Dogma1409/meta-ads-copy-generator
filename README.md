# meta-ads-copy-generator

> AI-powered ad copy generator for Meta Ads (Facebook/Instagram).
> Generates multiple variations of ad copy with different psychological angles, scores them with a CTR heuristic, and exports to Meta Marketing API v20 format.

Built as a portfolio project for an AI Automation Engineer application (WideStep).

## Stack

- **Backend**: Node 20 + Express + TypeScript + Groq SDK (`llama-3.1-8b-instant` by default).
- **Frontend**: Vanilla HTML/CSS/JS. Zero JS dependencies. Inter font via Google Fonts.
- **Deploy**: Railway.

## Endpoints

### `GET /health`
Liveness probe. Returns `{"status":"ok"}`.

### `POST /api/generate`
Generate N variations of Meta Ads copy (`primary_text` + `headline` + `description`).

**Request** (JSON): `product_name`, `product_description`, `audience`, `variations_count` (1-10).
**Response** (200): `{ variations: [...], model_used, tokens_in, tokens_out, duration_ms }`.

- Responses are cached in-process by SHA-256 of the canonical request for `CACHE_TTL_SECONDS` (default 3600).
- On LLM error: returns 502 with `{ "error": "LLM provider error: ..." }`.

## Local development

```bash
npm install
cp .env.example .env             # edit .env: paste your GROQ_API_KEY
npm run dev                      # server on http://localhost:3001
npm run typecheck                # TypeScript strict check
npm run test:fixtures            # Gate 3 regression gate (scorer asserts)
npm run test:generate            # smoke test for /api/generate (skips if no key)
```

## Example curl

```bash
curl -X POST http://localhost:3001/api/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "product_name": "WideStep BareFlex Pro",
    "product_description": "Zapatilla barefoot de caña baja, suela de 4 mm de goma flexible, upper de piel sintética transpirable.",
    "audience": "Mujeres y hombres de 30-55 años con dolor crónico de espalda o rodillas.",
    "variations_count": 3
  }'
```

## Files of interest

- `src/index.ts` — Express entrypoint, env validation, route mounting.
- `src/orchestrator/llm.ts` — LLM factory + Groq client wrapper.
- `src/orchestrator/prompts.ts` — System + user prompt templates.
- `src/routes/generate.ts` — `POST /api/generate` handler.
- `src/cache.ts` — In-memory response cache with lazy TTL.
- `src/services/scorer.ts` — CTR heuristic scorer (Gate 3, standalone).
- `src/scoring/` — YAML rules + test fixtures (Gate 3, regression-gated).
- `public/` — Frontend (Gate 4, not yet present).

See `hermes` for the full project context, plan, and pending items.

## License

MIT — see `LICENSE`.
