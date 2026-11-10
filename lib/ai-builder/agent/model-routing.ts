/**
 * ===========================================================================
 *  WHICH MODEL ANSWERS WHICH TURN, AND WHAT A SITE COSTS (round P, P5)
 * ===========================================================================
 * Before round P: plan on claude-opus-5-5 (effort medium), every other turn on
 * claude-sonnet-5-5 (effort medium). The components (the quality-critical
 * output: layout, type, motion, filled items) were written by the loop model.
 *
 * Now, by PHASE (not turn by turn):
 *
 *   plan     claude-opus-5-5, medium   the concept and the site plan
 *   build    claude-opus-5-5, high     writing and placing the components
 *   verify / repair / finish
 *            claude-sonnet-5-5, medium the targeted fixes finish lists
 *
 * Why by phase: prompt caches are per model, so a model switch makes the next
 * call pay its whole conversation uncached. Alternating per turn (opus for a
 * write, sonnet for a read) would re-pay the transcript on almost every call;
 * switching twice per job (plan → build → repair) pays it twice. And an effort
 * change on the same model also resets the conversation cache, so the build
 * keeps one effort for its whole run.
 *
 * MONEY: estimateSiteUsd prices a typical whole-site job (the call counts and
 * token sizes in TYPICAL_SITE are measured from the scripted journeys' shape
 * and the round N/O job logs' orders of magnitude, not from a live run) with
 * the same price table the job's spend is counted with (lib/sites/agent/models
 * costOf). The job's own cap (JobBudget.maxUsd) still stops a job whose real
 * spend runs past it: this is the planning number, the cap is the guarantee.
 */
import { costOf, rateFor } from "@/lib/sites/agent/models"
import { ZERO_USAGE } from "@/lib/sites/agent/types"
import type { AgentPhase } from "../types"
import type { AgentModels, ModelRole } from "./ports"

export type CallRole = "plan" | "write" | "loop"

/** The role a turn in this phase is answered by. */
export function roleKind(phase: AgentPhase): CallRole {
  if (phase === "plan" || phase === "brief") return "plan"
  if (phase === "build") return "write"
  return "loop"
}

/** The model role for a turn in this phase; `write` falls back to `loop` when the models have none (a scripted run). */
export function roleFor(phase: AgentPhase, models: AgentModels): ModelRole {
  const kind = roleKind(phase)
  if (kind === "plan") return models.plan
  if (kind === "write") return models.write ?? models.loop
  return models.loop
}

/** One phase's calls in a typical job: how many, their average input (tokens, the share read from cache), their average output. */
export interface PhaseProfile {
  role: CallRole
  calls: number
  inputTokens: number
  cachedShare: number
  outputTokens: number
}

/**
 * A whole new website (10+ home sections, every page and template: 25 to 40 components), at effort medium.
 * Output tokens include adaptive thinking; effort high writes more of it (EFFORT_OUTPUT).
 */
export const TYPICAL_SITE: Record<"plan" | "build" | "repair", PhaseProfile> = {
  plan: { role: "plan", calls: 3, inputTokens: 24_000, cachedShare: 0.4, outputTokens: 6_000 },
  build: { role: "write", calls: 80, inputTokens: 55_000, cachedShare: 0.85, outputTokens: 3_200 },
  repair: { role: "loop", calls: 25, inputTokens: 70_000, cachedShare: 0.85, outputTokens: 1_500 },
}

/** Output (thinking included) relative to effort medium: an assumption for planning, not a measurement. */
export const EFFORT_OUTPUT: Record<"low" | "medium" | "high", number> = { low: 0.7, medium: 1, high: 1.4 }

/** The design review (round O4): two reviews, each 4 pictures a page for 3 pages, on the review model. */
export const TYPICAL_REVIEW = { calls: 2, inputTokens: 8_000 / 3 + 12 * 1_700, outputTokens: 4_000 }

export interface SiteCostEstimate {
  byPhase: Record<string, number>
  review: number
  total: number
}

const OPUS = "claude-opus-5-5"

/** One phase priced: the cached share at the cache read rate, the rest written to the cache (the next call reads it). */
export function phaseUsd(model: string, p: Pick<PhaseProfile, "calls" | "inputTokens" | "cachedShare" | "outputTokens">): number {
  const priced = rateFor(model) ? model : OPUS
  const cached = Math.round(p.inputTokens * p.cachedShare)
  const one = costOf(priced, { ...ZERO_USAGE, inputTokens: p.inputTokens, cachedInputTokens: cached, cacheWriteTokens: p.inputTokens - cached, outputTokens: p.outputTokens }).usd
  return Math.round(one * p.calls * 100) / 100
}

/** What a typical new website costs on these models, USD. */
export function estimateSiteUsd(
  models: { plan: string; write: string; loop: string; review?: string },
  effort: Partial<Record<CallRole, "low" | "medium" | "high">> = {},
  profile = TYPICAL_SITE,
): SiteCostEstimate {
  const byPhase: Record<string, number> = {}
  for (const [phase, p] of Object.entries(profile)) byPhase[phase] = phaseUsd(models[p.role], { ...p, outputTokens: Math.round(p.outputTokens * EFFORT_OUTPUT[effort[p.role] ?? "medium"]) })
  const review = models.review ? phaseUsd(models.review, { calls: TYPICAL_REVIEW.calls, inputTokens: Math.round(TYPICAL_REVIEW.inputTokens), cachedShare: 0, outputTokens: TYPICAL_REVIEW.outputTokens }) : 0
  const total = Math.round((Object.values(byPhase).reduce((a, b) => a + b, 0) + review) * 100) / 100
  return { byPhase, review, total }
}
