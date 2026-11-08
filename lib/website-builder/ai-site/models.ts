/**
 * ===========================================================================
 *  START WITH AI: THE THREE MODELS, AND WHAT EVERY CALL COST
 * ===========================================================================
 * One strong call plans the site; many small ones write it.
 *
 *   plan    claude-opus-5-5     one call, the whole art direction
 *   write   claude-sonnet-5-5   one call per section, in parallel
 *   small   claude-haiku-5-5    one call per tiny section (a band, a CTA)
 *
 * Every call is ONE user turn, never a replayed conversation: a repair is a
 * new single turn that quotes the previous answer as text. Nothing here ever
 * sends a thinking block back, so a run cannot meet the "thinking block is
 * bound to a different conversation" 400 the chat agent met in production.
 *
 * Calls go through the provider layer the chat agent uses
 * (lib/sites/agent/provider.ts), so the creator's own Claude key answers
 * when they connected one, and a test hands in a fake.
 */
import { addUsage, ZERO_USAGE, type AgentProvider, type TokenUsage, type ToolSpec, type ToolCall } from "@/lib/sites/agent/types"
import { costOf } from "@/lib/sites/agent/models"

export const PLAN_MODEL = "claude-opus-5-5"
export const WRITE_MODEL = "claude-sonnet-5-5"
export const SMALL_MODEL = "claude-haiku-5-5"

export interface ModelRef {
  provider: AgentProvider
  model: string
  effort?: "low" | "medium" | "high"
}

export interface Models {
  plan: ModelRef
  write: ModelRef
  small: ModelRef
}

/** What a job spent, by model: calls and tokens as the provider reported them. */
export interface Spend {
  calls: number
  usd: number
  byModel: Record<string, { calls: number; usage: TokenUsage }>
}

export const NO_SPEND: Spend = { calls: 0, usd: 0, byModel: {} }

export function addSpend(spend: Spend, model: string, usage: TokenUsage): Spend {
  const was = spend.byModel[model] ?? { calls: 0, usage: ZERO_USAGE }
  return {
    calls: spend.calls + 1,
    usd: Math.round((spend.usd + costOf(model, usage).usd) * 1e6) / 1e6,
    byModel: { ...spend.byModel, [model]: { calls: was.calls + 1, usage: addUsage(was.usage, usage) } },
  }
}

export function mergeSpend(a: Spend, b: Spend): Spend {
  const byModel = { ...a.byModel }
  for (const [m, v] of Object.entries(b.byModel)) {
    const was = byModel[m] ?? { calls: 0, usage: ZERO_USAGE }
    byModel[m] = { calls: was.calls + v.calls, usage: addUsage(was.usage, v.usage) }
  }
  return { calls: a.calls + b.calls, usd: Math.round((a.usd + b.usd) * 1e6) / 1e6, byModel }
}

export interface CallResult {
  text: string
  toolCalls: ToolCall[]
  usage: TokenUsage
  stop: string
}

/** One call, one turn, with a deadline. Throws on a provider error; the caller decides what a failure means. */
export async function callOnce(
  ref: ModelRef,
  input: { system: string; user: string; maxOutputTokens: number; tools?: ToolSpec<string>[]; timeoutMs: number; signal?: AbortSignal },
): Promise<CallResult> {
  const timeout = AbortSignal.timeout(input.timeoutMs)
  const signal = input.signal ? either(input.signal, timeout) : timeout
  const turn = await ref.provider.complete({
    model: ref.model,
    system: input.system,
    turns: [{ role: "user", content: input.user }],
    tools: input.tools ?? [],
    maxOutputTokens: input.maxOutputTokens,
    effort: ref.effort,
    signal,
  })
  return { text: turn.text, toolCalls: turn.toolCalls, usage: turn.usage, stop: turn.stop }
}

/** Runs `work` over `items` with at most `limit` at once, in order of start; results in the items' order. */
export async function pool<T, R>(items: T[], limit: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await work(items[i], i)
    }
  })
  await Promise.all(runners)
  return out
}

/** Aborts when either does. */
function either(a: AbortSignal, b: AbortSignal): AbortSignal {
  const c = new AbortController()
  const stop = (s: AbortSignal) => () => c.abort(s.reason)
  if (a.aborted) c.abort(a.reason)
  else if (b.aborted) c.abort(b.reason)
  else {
    a.addEventListener("abort", stop(a), { once: true })
    b.addEventListener("abort", stop(b), { once: true })
  }
  return c.signal
}
