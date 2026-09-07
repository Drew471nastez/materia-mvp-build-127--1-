/**
 * Which model runs, and what a run cost.
 *
 * ---------------------------------------------------------------------------
 *  TWO MODELS, AND THE REASON THE CHEAP ONE IS THE DEFAULT
 * ---------------------------------------------------------------------------
 * `gpt-5.6-luna` at $0.20/$1.20 per MTok does ordinary work — rewrite this
 * headline, add a section, change the palette — for roughly a cent a run. That
 * is what makes 20 free edits a month cost about twenty cents rather than a
 * dollar, and it is the whole reason the free tier can exist.
 *
 * `gpt-5.6-terra` at $2/$12 is ten times the price and is reached for only when
 * a job is genuinely multi-file. Escalation is a decision this file makes from
 * the request, not something a prompt can ask for — a model that can promote
 * itself to the expensive tier will.
 *
 * ---------------------------------------------------------------------------
 *  PRICES ARE HISTORY, NOT CONFIGURATION
 * ---------------------------------------------------------------------------
 * `site_agent_runs.cost_usd` is computed at write time from the rate below and
 * stored. It is never recomputed from this table afterwards: the day a price
 * changes, a report that multiplies old token counts by the new rate silently
 * rewrites what last quarter cost.
 */

import type { TokenUsage } from "./types"

export interface ModelRate {
  id: string
  /** USD per million input tokens, uncached. */
  inputPerMTok: number
  /** USD per million output tokens. */
  outputPerMTok: number
  /**
   * Multipliers on the input rate. GPT-5.6 and later: a cache read is 0.1x and
   * a cache write 1.25x, and caching is implicit — it happens whether or not
   * this code asks for it, so ignoring it here would overstate every bill.
   */
  cachedInputMultiplier: number
  cacheWriteMultiplier: number
  maxOutputTokens: number
}

export const MODEL_RATES: Record<string, ModelRate> = {
  "gpt-5.6-luna": {
    id: "gpt-5.6-luna",
    inputPerMTok: 0.2,
    outputPerMTok: 1.2,
    cachedInputMultiplier: 0.1,
    cacheWriteMultiplier: 1.25,
    maxOutputTokens: 128_000,
  },
  "gpt-5.6-terra": {
    id: "gpt-5.6-terra",
    inputPerMTok: 2,
    outputPerMTok: 12,
    cachedInputMultiplier: 0.1,
    cacheWriteMultiplier: 1.25,
    maxOutputTokens: 128_000,
  },
}

/**
 * Overridable without a deploy.
 *
 * The model is the single most likely thing to change here — a price move, a
 * better cheap model, a bad week — and requiring a code change to try one is
 * how a team ends up never trying one.
 */
export const DEFAULT_MODEL = process.env.SITES_AGENT_MODEL || "gpt-5.6-luna"
export const STRONG_MODEL = process.env.SITES_AGENT_STRONG_MODEL || "gpt-5.6-terra"

/**
 * An unknown model id is priced at ZERO and must be treated as unpriced, not
 * as free. Returning a guessed rate for a model nobody has priced is how a
 * bill arrives that no report predicted.
 */
export function rateFor(model: string): ModelRate | null {
  return MODEL_RATES[model] ?? null
}

export interface CostBreakdown {
  usd: number
  /** False when the model has no rate here — cost is 0 and MEANS "unknown". */
  priced: boolean
}

/**
 * What a run cost, from tokens the provider reported.
 *
 * `inputTokens` is the total and the two cache figures are subsets of it, so
 * the uncached remainder is what pays full price. Clamped at zero because a
 * provider that ever reports subsets larger than the total should produce a
 * suspiciously cheap run, not a negative one.
 */
export function costOf(model: string, usage: TokenUsage): CostBreakdown {
  const rate = rateFor(model)
  if (!rate) return { usd: 0, priced: false }

  const uncachedInput = Math.max(
    0,
    usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteTokens,
  )

  const usd =
    (uncachedInput * rate.inputPerMTok +
      usage.cachedInputTokens * rate.inputPerMTok * rate.cachedInputMultiplier +
      usage.cacheWriteTokens * rate.inputPerMTok * rate.cacheWriteMultiplier +
      usage.outputTokens * rate.outputPerMTok) /
    1_000_000

  // Six decimals, matching NUMERIC(12,6). A one-cent floor would round the
  // entire free tier to zero and make the cheap model look free.
  return { usd: Math.round(usd * 1e6) / 1e6, priced: true }
}

/**
 * Which model this request gets.
 *
 * Decided from the REQUEST, never from the model's own opinion: a model that
 * can ask to be promoted to the ten-times-dearer tier eventually will, and the
 * bill is the user's.
 *
 * The signals are deliberately dull — a long instruction, or a project big
 * enough that a change is unlikely to stay in one file. Both are properties of
 * the input, both are checkable, and neither can be talked into.
 */
export function chooseModel(prompt: string, fileCount: number): string {
  const longInstruction = prompt.length > 600
  const bigProject = fileCount > 25
  return longInstruction || bigProject ? STRONG_MODEL : DEFAULT_MODEL
}
