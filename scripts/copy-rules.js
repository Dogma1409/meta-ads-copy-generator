#!/usr/bin/env node
/**
 * scripts/copy-rules.js
 *
 * Build helper. `tsc` only emits .ts → .js; it does NOT copy the YAML rule
 * files that src/services/scorer.ts reads at runtime via fs.readFileSync.
 * Without this step, `npm start` (which runs node dist/index.js) hits
 * `ENOENT: ... scoring/rules/_index.yaml` on every /api/score call.
 *
 * Wired as `prebuild` in package.json so it runs automatically before
 * `tsc`. Idempotent — safe to run repeatedly; cp -r overwrites the
 * destination tree.
 *
 * Source:      src/scoring/rules/
 * Destination: dist/scoring/rules/
 *
 * Exit codes:
 *   0 = rules copied (or source dir empty — that's fine, scorer will 500
 *       with a clearer error than ENOENT-missing-dir, but that's a separate
 *       problem; we just want the directory to exist).
 *   1 = source directory missing (refuse to silently succeed — operator
 *       should see this).
 */
'use strict'

const fs = require('fs')
const path = require('path')

const SRC = path.resolve(__dirname, '..', 'src', 'scoring', 'rules')
const DEST = path.resolve(__dirname, '..', 'dist', 'scoring', 'rules')

if (!fs.existsSync(SRC)) {
  console.error(`[copy-rules] source directory does not exist: ${SRC}`)
  console.error('[copy-rules] refusing to silently succeed. Check the repo layout.')
  process.exit(1)
}

fs.mkdirSync(path.dirname(DEST), { recursive: true })
// rm -rf dist/scoring/rules first so deleted/stale rules don't linger
// between rebuilds (e.g. you remove a rule YAML and don't want the old
// copy to haunt the deployed bundle).
fs.rmSync(DEST, { recursive: true, force: true })

// Node 16.7+ supports fs.cpSync with recursive: true. Engines: node >=20.
fs.cpSync(SRC, DEST, { recursive: true })

const copied = fs.readdirSync(DEST).length
console.log(`[copy-rules] copied ${copied} file(s) from ${SRC} → ${DEST}`)
process.exit(0)
