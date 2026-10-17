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

import { classifyComplexity } from "./complexity"
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
  /**
   * Anthropic. Priced here for the same reason the others are: `rateFor`
   * returns null for a model nobody has priced, `costOf` then reports
   * `priced: false`, and a run whose cost is unknown is recorded as zero. A
   * provider switch that silently made every run look free would be a
   * reporting hole, not a saving.
   *
   * Cache multipliers match Anthropic's published ratios — a read is 0.1x the
   * input rate and a write 1.25x — which happen to be the same shape as the
   * OpenAI ones.
   */
  /*
    The four Ask Storelib offers (lib/website-builder/ask-engines.ts). Opus 5.5
    reads its cache at $0.20, a twentieth of its input rate, where the others
    read at a tenth. Haiku 5.5 is $0.10 / $0.50 up to 100K input tokens and
    $0.50 / $2.50 above; the lower rate is kept here because an Ask Storelib
    turn sits well under that.
  */
  "claude-opus-5-5": {
    id: "claude-opus-5-5",
    inputPerMTok: 4,
    outputPerMTok: 20,
    cachedInputMultiplier: 0.05,
    cacheWriteMultiplier: 1.25,
    maxOutputTokens: 128_000,
  },
  "claude-sonnet-5-5": {
    id: "claude-sonnet-5-5",
    inputPerMTok: 2,
    outputPerMTok: 10,
    cachedInputMultiplier: 0.1,
    cacheWriteMultiplier: 1.25,
    maxOutputTokens: 128_000,
  },
  "claude-haiku-5-5": {
    id: "claude-haiku-5-5",
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
    cachedInputMultiplier: 0.1,
    cacheWriteMultiplier: 1.25,
    maxOutputTokens: 128_000,
  },
  "claude-sonnet-5": {
    id: "claude-sonnet-5",
    inputPerMTok: 2,
    outputPerMTok: 10,
    cachedInputMultiplier: 0.1,
    cacheWriteMultiplier: 1.25,
    maxOutputTokens: 128_000,
  },
  "claude-opus-5": {
    id: "claude-opus-5",
    inputPerMTok: 5,
    outputPerMTok: 25,
    cachedInputMultiplier: 0.1,
    cacheWriteMultiplier: 1.25,
    maxOutputTokens: 128_000,
  },
  "claude-opus-4-8": {
    id: "claude-opus-4-8",
    inputPerMTok: 5,
    outputPerMTok: 25,
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
 * ---------------------------------------------------------------------------
 *  THE SIGNAL USED TO BE BACKWARDS
 * ---------------------------------------------------------------------------
 * This was `prompt.length > 600 || fileCount > 25`, which routes on how much
 * somebody TYPED rather than how much they asked for. So:
 *
 *   "Make this website much more complex, premium and complete"  →  fast model
 *   "Improve everything"                                         →  fast model
 *   "Make it feel like Linear"                                   →  fast model
 *
 * Every one of those is the hardest kind of request there is, and every one of
 * them got the cheapest model because the sentence was short. That is a direct
 * cause of the shallow, one-edit-and-done behaviour: the broad asks that most
 * need planning and multi-file reasoning were the ones systematically denied
 * the model that can do it.
 *
 * The complexity classifier already answers this question properly — it reads
 * what is being asked rather than how many characters it took — so routing
 * uses it instead of a second, worse heuristic living here.
 *
 * A big project still promotes a small request: a change in a thirty-file
 * codebase is unlikely to stay in one file whatever the sentence says.
 */
export function chooseTier(prompt: string, fileCount: number): "fast" | "strong" {
  const budget = classifyComplexity(prompt)
  if (budget.complexity !== "small") return "strong"
  return fileCount > 25 ? "strong" : "fast"
}

/**
 * The same question, answered with an OpenAI id.
 *
 * Kept because it is what this file has always exported and what the tests
 * pin, but `chooseTier` is the one to reach for now: a model id is a VENDOR's
 * name for a difficulty, and there are two vendors.
 */
export function chooseModel(prompt: string, fileCount: number): string {
  const budget = classifyComplexity(prompt)
  if (budget.complexity !== "small") return STRONG_MODEL
  return fileCount > 25 ? STRONG_MODEL : DEFAULT_MODEL
}
