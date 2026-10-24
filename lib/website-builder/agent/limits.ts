/**
 * ===========================================================================
 *  HOW FAR ONE STORELIB AI RUN MAY GO, IN ONE PLACE
 * ===========================================================================
 * "This edit reached its token budget." came from a ceiling of 300,000 tokens,
 * input plus output, counted at face value. Every turn of a tool loop sends
 * the whole conversation again, so a run that read a 40,000 token page twelve
 * times passed it while doing ordinary work, and almost all of those tokens
 * were cache reads that cost a twentieth of an input token on Opus 5.5. The
 * ceiling was measuring the weight of the context, not the cost of the run.
 *
 * Now a run is held to what it COSTS (./models.ts `costOf`, the same figure
 * the run is billed and recorded at), with a token count only for a model
 * nobody has priced. These are safety ceilings against a runaway, not a
 * budget for ordinary work: an edit that is doing what it was asked should
 * never meet one. Reaching one is not a failure either. The run is told it is
 * close (WRAP_UP_NOTE), finishes the step it is on, keeps what it did and
 * offers Continue, which picks up from the saved page and the conversation.
 *
 * Each is read from the environment so a deployment, and later a plan, can
 * set its own without a code change. A future per-plan limit is a different
 * `RunLimits` passed to the loop (ThemeAgentInput.limits), nothing more.
 *
 * Pure: no network, no database.
 */

import { costOf } from "@/lib/sites/agent/models"
import type { TokenUsage } from "@/lib/sites/agent/types"

export interface RunLimits {
  /** The most one run (one part of a long task) may cost, in US dollars, at the model's own price. */
  runUsd: number
  /** For a model with no price here: input plus output tokens, cache reads counted at a tenth. */
  runTokens: number
  /** Turns, as a guard against a loop that never ends. Cost and time end a real run long before this. */
  maxTurns: number
  /** Output a single turn may write, thinking included. Billed only for what is written. */
  turnOutputTokens: number
  /** The most a turn that was cut off is retried with. 128,000 is what every model the editor offers can write. */
  retryOutputTokens: number
  /** How long one part may run before it stops and hands over to the next. */
  wallClockMs: number
  /** How much of a ceiling is spent before the run is told to wrap up. */
  wrapUpAt: number
}

function envNumber(name: string, fallback: number): number {
  const raw = typeof process !== "undefined" ? process.env?.[name] : undefined
  const value = raw === undefined || raw === "" ? NaN : Number(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export const AGENT_LIMITS: RunLimits = {
  runUsd: envNumber("STORELIB_AI_RUN_USD", 12),
  runTokens: envNumber("STORELIB_AI_RUN_TOKENS", 6_000_000),
  maxTurns: envNumber("STORELIB_AI_MAX_TURNS", 120),
  turnOutputTokens: envNumber("STORELIB_AI_TURN_OUTPUT", 64_000),
  retryOutputTokens: 128_000,
  /* The route lives 300 seconds (its maxDuration) and stops 15 early so the answer always arrives. */
  wallClockMs: envNumber("STORELIB_AI_WALL_MS", 285_000),
  wrapUpAt: 0.8,
}

export interface Spend {
  /** Dollars at the model's price; 0 for a model with no price. */
  usd: number
  /** Tokens weighted the way they are billed, for a model with no price. */
  tokens: number
  priced?: boolean
}

/** What a run has spent so far. */
export function runSpend(model: string, usage: TokenUsage): Spend {
  const cost = costOf(model, usage)
  const uncached = Math.max(0, usage.inputTokens - usage.cachedInputTokens)
  return { usd: cost.usd, tokens: uncached + usage.cachedInputTokens * 0.1 + usage.outputTokens, priced: cost.priced }
}

function fraction(spend: Spend, limits: RunLimits): number {
  return Math.max(spend.usd / limits.runUsd, spend.priced ? 0 : spend.tokens / limits.runTokens)
}

/** Close enough to a ceiling that the run should finish the step it is on and stop. */
export function nearCeiling(spend: Spend, limits: RunLimits = AGENT_LIMITS): boolean {
  return fraction(spend, limits) >= limits.wrapUpAt
}

/** Past it: no more turns in this part. */
export function overCeiling(spend: Spend, limits: RunLimits = AGENT_LIMITS): boolean {
  return fraction(spend, limits) >= 1
}

/**
 * WHAT THE MODEL IS TOLD WHEN A CEILING IS CLOSE. Appended to the tool
 * results it is about to read, never written into an earlier turn: the
 * conversation is only ever added to, which keeps the prompt cache and the
 * model's earlier reasoning valid.
 */
export const WRAP_UP_NOTE =
  "NOTE FROM STORELIB: this run is close to this run's limit. Finish the change you are making now so nothing is left half done, then reply with your one closing sentence: what you changed, and what is still to do. The creator can press Continue and you will carry on from here."

/** The closing words when the ceiling ended a part, said by the chat beside its Continue button. */
export function stoppedSentence(workDone: boolean, reason: "budget" | "turns" | "interrupted" = "budget"): string {
  if (reason === "turns") return "Carrying on with the rest."
  /* The provider dropped out part way: what is done stays, and the chat sends the next part by itself. */
  if (reason === "interrupted") return "Storelib AI stopped answering for a moment, so I am picking up the rest now."
  return workDone
    ? "I stopped here to keep this run's cost in check. Press Continue and I will carry on from this point."
    : "I read through the page but stopped before changing anything, to keep this run's cost in check. Press Continue and I will pick up from here."
}
