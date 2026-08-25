/**
 * src/services/scorer.ts
 *
 * Deterministic CTR heuristic scorer for Meta Ads copy.
 * Reads active rules from src/scoring/rules/_index.yaml, loads each rule's
 * definition from the corresponding YAML file, and applies them to the input
 * copy. Returns a numeric score plus per-rule explanation.
 *
 * NO LLM involvement. Pure code + heuristics from YAML config.
 *
 * Gate 3 deliverable.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'

// --- Types ---------------------------------------------------------------

export interface AdCopy {
  primary_text: string
  headline: string
  description?: string
}

export interface RuleDefinition {
  id: string
  applies_to: string[]
  weight: number
  check: Record<string, unknown>
  scoring: Record<string, number>
  violation_message: string
  rationale?: string
}

export interface RuleResult {
  rule_id: string
  field: string
  applied: boolean
  score_delta: number
  matched: boolean
  message: string
  details: Record<string, unknown>
}

export interface ScoreResult {
  total: number
  max_possible: number
  min_possible: number
  rules: RuleResult[]
}

// --- YAML loading --------------------------------------------------------

const RULES_DIR = path.resolve(__dirname, '..', 'scoring', 'rules')

interface IndexEntry {
  id: string
  file: string
  enabled: boolean
}

interface IndexFile {
  active_rules: IndexEntry[]
  score_range: { min_theoretical: number; max_theoretical: number }
}

interface GroupFile {
  rules: RuleDefinition[]
}

function loadIndex(): IndexFile {
  const raw = fs.readFileSync(path.join(RULES_DIR, '_index.yaml'), 'utf8')
  return yaml.load(raw) as IndexFile
}

function loadRuleGroup(filename: string): GroupFile {
  const raw = fs.readFileSync(path.join(RULES_DIR, filename), 'utf8')
  return yaml.load(raw) as GroupFile
}

function loadAllRules(): { rule: RuleDefinition; file: string }[] {
  const index = loadIndex()
  const active = index.active_rules.filter(r => r.enabled)
  const byFile = new Map<string, IndexEntry[]>()
  for (const e of active) {
    if (!byFile.has(e.file)) byFile.set(e.file, [])
    byFile.get(e.file)!.push(e)
  }
  const out: { rule: RuleDefinition; file: string }[] = []
  for (const [file, entries] of byFile) {
    const group = loadRuleGroup(file)
    for (const entry of entries) {
      const rule = group.rules.find(r => r.id === entry.id)
      if (!rule) {
        throw new Error(`Rule ${entry.id} not found in ${file}`)
      }
      out.push({ rule, file })
    }
  }
  return out
}

// --- Field extractors -----------------------------------------------------

function firstSentence(text: string): string {
  // First sentence: up to first . ? ! followed by space/end, or whole text.
  const m = text.match(/^[^.!?]+[.!?]?/)
  return (m ? m[0] : text).trim()
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function uppercaseRatio(text: string): { ratio: number; pct: number } {
  const letters = text.replace(/[^a-zA-Z]/g, '')
  if (letters.length === 0) return { ratio: 0, pct: 0 }
  const uppers = letters.replace(/[^A-Z]/g, '').length
  const ratio = uppers / letters.length
  return { ratio, pct: Math.round(ratio * 100) }
}

function hasEmoji(text: string): boolean {
  // Match emoji ranges used in R5 pattern.
  return /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text)
}

// --- Rule appliers -------------------------------------------------------
// Return: { matched: boolean, score_delta: number, details: Record }

type Applier = (rule: RuleDefinition, copy: AdCopy) => {
  matched: boolean
  score_delta: number
  details: Record<string, unknown>
}

function fieldOf(rule: RuleDefinition, copy: AdCopy): string {
  const f = rule.applies_to[0]
  return ((copy as unknown) as Record<string, string | undefined>)[f] ?? ''
}

function renderMessage(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
}

const appliers: Record<string, Applier> = {
  // R1
  range: (rule, copy) => {
    const value = fieldOf(rule, copy)
    const len = value.length
    const cfg = rule.check as {
      optimal_min: number
      optimal_max: number
    }
    let bucket = 'under_min'
    if (len >= cfg.optimal_min && len <= cfg.optimal_max) bucket = 'in_optimal'
    else if (len > cfg.optimal_max) bucket = 'over_max'
    const score_delta = rule.scoring[bucket] ?? 0
    const matched = bucket === 'in_optimal'
    return {
      matched,
      score_delta,
      details: { actual_chars: len, bucket, optimal_range: [cfg.optimal_min, cfg.optimal_max] },
    }
  },

  // R2
  tiered: (rule, copy) => {
    const value = fieldOf(rule, copy)
    const len = value.length
    const cfg = rule.check as {
      optimal_max: number
      acceptable_max: number
      hard_limit: number
    }
    let bucket = 'optimal'
    if (len > cfg.acceptable_max) bucket = 'over_hard'
    else if (len > cfg.optimal_max) bucket = 'acceptable'
    const score_delta = rule.scoring[bucket] ?? 0
    const matched = bucket === 'optimal'
    return {
      matched,
      score_delta,
      details: { actual_chars: len, bucket, optimal_max: cfg.optimal_max, hard_limit: cfg.hard_limit },
    }
  },

  // R3
  regex_match_any: (rule, copy) => {
    const value = fieldOf(rule, copy)
    const cfg = rule.check as { patterns: string[] }
    let matchedPattern: string | null = null
    for (const p of cfg.patterns) {
      const re = new RegExp(p, 'i')
      if (re.test(value)) {
        matchedPattern = p
        break
      }
    }
    const matched = matchedPattern !== null
    const score_delta = matched ? (rule.scoring.match ?? 0) : (rule.scoring.no_match ?? 0)
    return {
      matched,
      score_delta,
      details: { matched_pattern: matchedPattern, patterns_tried: cfg.patterns.length },
    }
  },

  // R4 (composite)
  composite: (rule, copy) => {
    const value = fieldOf(rule, copy)
    const sentence = firstSentence(value)
    const wc = wordCount(sentence)
    const wcOk = wc <= 15
    const cfg = rule.check as {
      steps: Array<Record<string, unknown>>
    }
    const patternStep = cfg.steps.find(s => s.assert_pattern_match_any) as
      | { assert_pattern_match_any: { patterns: string[] } }
      | undefined
    let matchedPattern: string | null = null
    if (patternStep && wcOk) {
      for (const p of patternStep.assert_pattern_match_any.patterns) {
        const re = new RegExp(p, 'i')
        if (re.test(sentence)) {
          matchedPattern = p
          break
        }
      }
    }
    const patternMatched = matchedPattern !== null
    const bothMet = wcOk && patternMatched
    const score_delta = bothMet
      ? (rule.scoring.both_met ?? 0)
      : rule.scoring.only_word_count && rule.scoring.nothing
        ? (rule.scoring.only_word_count ?? 0)
        : (rule.scoring.nothing ?? 0)
    return {
      matched: bothMet,
      score_delta,
      details: {
        first_sentence: sentence,
        word_count: wc,
        word_count_ok: wcOk,
        matched_pattern: matchedPattern,
      },
    }
  },

  // R5 (emoji)
  regex_match: (rule, copy) => {
    const value = fieldOf(rule, copy)
    const matched = hasEmoji(value)
    const score_delta = matched ? (rule.scoring.match ?? 0) : (rule.scoring.no_match ?? 0)
    return {
      matched,
      score_delta,
      details: { emoji_detected: matched, emoji_status: matched ? 'yes' : 'no' },
    }
  },

  // R6 (caps ratio)
  ratio: (rule, copy) => {
    const value = fieldOf(rule, copy)
    const { ratio, pct } = uppercaseRatio(value)
    const cfg = rule.check as { threshold: number }
    const overThreshold = ratio > cfg.threshold
    const score_delta = overThreshold
      ? (rule.scoring.over_threshold ?? 0)
      : (rule.scoring.under_threshold ?? 0)
    return {
      matched: !overThreshold,
      score_delta,
      details: { pct, ratio, threshold: cfg.threshold },
    }
  },
}

function applyRule(rule: RuleDefinition, copy: AdCopy): RuleResult {
  const checkType = rule.check.type as string
  const applier = appliers[checkType]
  if (!applier) {
    throw new Error(`No applier for check.type=${checkType} (rule ${rule.id})`)
  }
  const { matched, score_delta, details } = applier(rule, copy)
  return {
    rule_id: rule.id,
    field: rule.applies_to[0],
    applied: true,
    score_delta,
    matched,
    message: renderMessage(rule.violation_message, { ...details, weight: rule.weight }),
    details,
  }
}

// --- Public API ----------------------------------------------------------

export function score(copy: AdCopy): ScoreResult {
  const all = loadAllRules()
  const index = loadIndex()
  const results: RuleResult[] = all.map(({ rule }) => applyRule(rule, copy))
  const total = results.reduce((sum, r) => sum + r.score_delta, 0)
  return {
    total,
    max_possible: index.score_range.max_theoretical,
    min_possible: index.score_range.min_theoretical,
    rules: results,
  }
}

// --- CLI entrypoint for manual validation --------------------------------

if (require.main === module) {
  const sample: AdCopy = {
    primary_text: process.argv[2] ?? 'Stop letting bunion pain ruin your shifts.',
    headline: process.argv[3] ?? 'All-Day Comfort',
    description: process.argv[4] ?? '',
  }
  const result = score(sample)
  console.log(JSON.stringify(result, null, 2))
}