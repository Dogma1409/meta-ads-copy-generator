# meta-ads-copy-generator

> AI-powered ad copy generator for Meta Ads (Facebook/Instagram).
> Generates multiple variations of ad copy with different psychological angles, scores them with a CTR heuristic, and exports to Meta Marketing API v20 format.

Built as a portfolio project for an AI Automation Engineer application (WideStep).

## Stack

- **Backend**: Node 20 + Express + TypeScript + Groq SDK (`llama-3.1-8b-instant` by default).
- **Frontend**: Vanilla HTML/CSS/JS. Zero JS dependencies. Inter font via Google Fonts.
- **Deploy**: Railway.
- **Repo**: public.

## How it works

1. User enters product name, description, target audience, and number of variations (1-10) in the frontend.
2. Frontend POSTs to `/api/generate`. Backend calls Groq LLM with structured prompt asking for `N` variations across different psychological angles (benefit, pain point, social proof, urgency, question).
3. Backend caches the LLM response by `hash(input)` with TTL 1h. Subsequent identical requests skip the LLM call.
4. Frontend receives variations. POSTs to `/api/score` to get a CTR heuristic score (0-100) for each.
5. Frontend renders variations + scores + a Meta Ad preview (image placeholder + copy).
6. User clicks "Download JSON" to get a file in Meta Marketing API v20 format, ready to upload via `POST /act_{ad-account-id}/adcreatives`.

## Local development

```bash
# Install deps
npm install

# Copy env template and fill in your Groq API key
cp .env.example .env
# Edit .env: paste your GROQ_API_KEY

# Run dev server
npm run dev

# Type check
npm run typecheck

# Smoke test
curl http://localhost:3001/health
# {"status":"ok"}
```

## Deploy

Push to `main` triggers Railway auto-deploy.

Required env vars in Railway:
- `GROQ_API_KEY` (get yours at https://console.groq.com/keys)
- `GROQ_MODEL` (default: `llama-3.1-8b-instant`)
- `PORT` (Railway sets this automatically)

## Files of interest

- `src/index.ts` — Express entrypoint.
- `src/services/llm.ts` — LLM factory (planned, Gate 2).
- `src/services/generator.ts` — Variations generator (planned, Gate 2).
- `src/services/scorer.ts` — CTR heuristic scorer (planned, Gate 3).
- `src/services/exporter.ts` — Meta Ads API v20 JSON exporter (planned, Gate 4).
- `src/prompts/variations.ts` — System + user prompts for Groq (planned, Gate 2).
- `public/` — Frontend (planned, Gate 4).

## Status

**Gate 1 (skeleton) closed.** `/health` endpoint live. Frontend and LLM integration coming in subsequent gates.

See `hermes` for the full project context, plan, and pending items.

## License

MIT — see `LICENSE`.
