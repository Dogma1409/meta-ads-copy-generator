/**
 * src/scoring/test-fixtures/v1/run-fixtures.ts
 *
 * One-shot script (not a test framework): loads good.json and bad.json,
 * runs each through the scorer, prints a per-fixture summary, and reports
 * aggregate stats: mean score for good set vs bad set, separation, and any
 * outliers where a "good" copy underperforms a "bad" one.
 */

import * as fs from 'fs'
import * as path from 'path'
import { score, AdCopy } from '../../../services/scorer'

const FIXTURE_DIR = path.resolve(__dirname)

interface Fixture {
  id: string
  primary_text: string
  headline: string
  description?: string
  violations_expected?: string[]
  expect_outlier?: boolean
}

function loadFixtures(filename: string): Fixture[] {
  const raw = fs.readFileSync(path.join(FIXTURE_DIR, filename), 'utf8')
  return JSON.parse(raw) as Fixture[]
}

function summarize(label: string, fixtures: Fixture[]) {
  const results = fixtures.map(f => {
    const copy: AdCopy = {
      primary_text: f.primary_text,
      headline: f.headline,
      description: f.description,
    }
    const r = score(copy)
    return { id: f.id, total: r.total, rules: r.rules }
  })
  const scores = results.map(r => r.total)
  const mean = scores.reduce((s, n) => s + n, 0) / scores.length
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  console.log(`\n=== ${label} (n=${fixtures.length}) ===`)
  console.log(`mean=${mean.toFixed(1)} min=${min} max=${max}`)
  console.log('per-fixture:')
  for (const r of results) {
    console.log(`  ${r.id.padEnd(10)} total=${String(r.total).padStart(4)}`)
  }
  return { results, mean, min, max }
}

function main() {
  const good = loadFixtures('good.json')
  const bad = loadFixtures('bad.json')
  const g = summarize('GOOD set', good)
  const b = summarize('BAD set', bad)
  const separation = g.mean - b.mean
  console.log(`\n=== SEPARATION (good_mean - bad_mean) = ${separation.toFixed(1)} ===`)
  if (separation < 15) {
    console.log('WARNING: separation < 15. Scorer is not distinguishing good vs bad well.')
  } else {
    console.log('OK: separation >= 15. Scorer distinguishes good vs bad.')
  }
  // Outliers: a "good" copy that scores lower than the mean of "bad"
  const outliers = g.results.filter(gr => gr.total < b.mean)
  if (outliers.length > 0) {
    console.log(`\n=== OUTLIERS (good copies scoring below bad_mean=${b.mean.toFixed(1)}) ===`)
    for (const o of outliers) console.log(`  ${o.id}: total=${o.total}`)
  } else {
    console.log('\nNo outliers: all good copies score >= bad_mean.')
  }

  // --- Assertions --------------------------------------------------------
  // For every fixture carrying violations_expected, every RULE_ID prefix in
  // that list must appear among the rule_ids that did NOT match (i.e. the
  // rule actually fired as a violation). Expected outliers (per review) are
  // reported but do not fail the gate.
  const assertionFailures: { id: string; missing: string[]; expected: string[]; actual: string[] }[] = []
  const expectedOutliers: { id: string; missing: string[] }[] = []
  let fixturesChecked = 0
  let fixturesPassed = 0

  for (const set of [
    { fixtures: good, results: g.results },
    { fixtures: bad, results: b.results },
  ]) {
    for (let i = 0; i < set.fixtures.length; i++) {
      const f = set.fixtures[i]
      const r = set.results[i]
      if (!f.violations_expected || f.violations_expected.length === 0) continue
      fixturesChecked++
      // Fixture uses a short RULE_ID prefix (e.g. "R1") before a human label.
      // The scorer emits fully-qualified ids like "R1_primary_text_length",
      // so a prefix match is required. We still use a Set for the unmatched
      // rule_ids to keep the inner loop O(1).
      const expectedPrefixes = f.violations_expected.map(v => v.split(':')[0])
      const unmatchedIds = new Set(
        r.rules.filter(rule => !rule.matched).map(rule => rule.rule_id)
      )
      const missing: string[] = []
      for (const prefix of expectedPrefixes) {
        let found = false
        for (const id of unmatchedIds) {
          if (id.startsWith(prefix)) { found = true; break }
        }
        if (!found) missing.push(prefix)
      }
      if (missing.length === 0) {
        fixturesPassed++
      } else if (f.expect_outlier === true) {
        expectedOutliers.push({ id: f.id, missing })
      } else {
        assertionFailures.push({
          id: f.id,
          missing,
          expected: expectedPrefixes,
          actual: Array.from(unmatchedIds),
        })
      }
    }
  }

  const fixturesFailed = assertionFailures.length
  console.log('\n=== ASSERTIONS ===')
  console.log(`fixtures_checked: ${fixturesChecked}`)
  console.log(`fixtures_passed: ${fixturesPassed}`)
  console.log(`fixtures_failed: ${fixturesFailed} (must be 0 to pass gate)`)
  console.log(`expected_outliers (accepted): ${expectedOutliers.length}`)

  if (expectedOutliers.length > 0) {
    console.log('\n--- expected outliers (informational, not failures) ---')
    for (const e of expectedOutliers) {
      console.log(`  ${e.id}: missing=${JSON.stringify(e.missing)} (accepted per review)`)
    }
  }
  if (assertionFailures.length > 0) {
    console.log('\n--- assertion failures (block gate) ---')
    for (const f of assertionFailures) {
      console.log(`  ${f.id}:`)
      console.log(`    missing_violations: ${JSON.stringify(f.missing)}`)
      console.log(`    expected_violations: ${JSON.stringify(f.expected)}`)
      console.log(`    actual_unmatched:    ${JSON.stringify(f.actual)}`)
    }
    process.exit(1)
  }
}

main()