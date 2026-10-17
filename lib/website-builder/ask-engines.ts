/**
 * ===========================================================================
 *  THE MODELS ASK STORELIB OFFERS
 * ===========================================================================
 * The owner's list, and nothing else: "for the Storelib AI coding agent I
 * just want Opus 5.5, Sonnet 5.5, Haiku 5.5, Opus 4.8 and that's all, and
 * the strength should be medium without the switcher".
 *
 * So the picker is these four, in this order, each with one line on what it
 * is best for. Opus 5.5 is the default for page work and code alike: the
 * owner puts quality first. The ids are Anthropic's own, exactly, and the
 * server accepts no other (lib/sites/agent/provider.ts, resolveForCreator).
 *
 * HOW HARD IT THINKS is not a choice any more. Every run asks for effort
 * "medium", and only from a model that takes the parameter (`effortSupported`
 * below, which lib/sites/agent/anthropic-provider.ts reads). All four of
 * these do; an older id that a deployment sets through the environment, or a
 * Haiku before 5.5, does not and is sent without it.
 *
 * Remembered per browser. A choice saved before this list changed ("claude",
 * "openai", "claude:claude-sonnet-5"...) reads as the default.
 */

export interface Engine {
  /** The engine id is the model id: one name for one thing. */
  id: string
  label: string
  short: string
  /** One line: what it is best for. */
  detail: string
  provider: "anthropic"
  tier: "fast" | "strong"
  model: string
}
export type EngineId = string

export const ENGINES: readonly Engine[] = [
  {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    short: "Opus 5.5",
    detail: "Best for new sections, whole pages and code",
    provider: "anthropic",
    tier: "strong",
    model: "claude-opus-5-5",
  },
  {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    short: "Sonnet 5.5",
    detail: "Best for everyday edits, a little faster",
    provider: "anthropic",
    tier: "fast",
    model: "claude-sonnet-5-5",
  },
  {
    id: "claude-haiku-5-5",
    label: "Claude Haiku 5.5",
    short: "Haiku 5.5",
    detail: "Best for quick copy and colour changes",
    provider: "anthropic",
    tier: "fast",
    model: "claude-haiku-5-5",
  },
  {
    id: "claude-opus-4-8",
    label: "Claude Opus 4.8",
    short: "Opus 4.8",
    detail: "Best for a second try at a hard change",
    provider: "anthropic",
    tier: "strong",
    model: "claude-opus-4-8",
  },
]

export const DEFAULT_ENGINE: EngineId = "claude-opus-5-5"
export const ENGINE_KEY = "storelib.theme-chat.engine"

/** The model ids a browser may name. Anything else is refused by the server. */
export const ENGINE_MODELS: readonly string[] = ENGINES.map((e) => e.model)

export function isEngineModel(value: unknown): value is string {
  return typeof value === "string" && ENGINE_MODELS.includes(value)
}

/** A saved choice that is still on the list, or the default. */
export function engineFromSaved(saved: unknown): EngineId {
  return typeof saved === "string" && ENGINES.some((e) => e.id === saved) ? saved : DEFAULT_ENGINE
}

export function engineOf(id: unknown): Engine {
  return ENGINES.find((e) => e.id === id) ?? ENGINES[0]
}

/** Every run thinks at this. Not shown, not stored, not chosen. */
export const EFFORT = "medium" as const
export type Effort = typeof EFFORT

/**
 * Whether a model takes `output_config.effort`. Opus 5.5, Sonnet 5.5, Haiku
 * 5.5 and Opus 4.8 do, as does the rest of the 4.6+ and 5 family. Haiku 4.5,
 * Sonnet 4.5 and anything older answer a 400 for it, so it is left out.
 * Used only when the account's Models API did not say (the provider prefers
 * the model's own capabilities when it has them).
 */
export function effortSupported(model: string): boolean {
  if (ENGINE_MODELS.includes(model)) return true
  if (/^claude-(?:3|haiku-4|sonnet-4-5|sonnet-4-0|opus-4-0|opus-4-1)/.test(model)) return false
  return /^claude-(?:opus-(?:4-[5-9]|[5-9])|sonnet-(?:4-6|[5-9])|haiku-(?:[5-9])|fable|mythos)/.test(model)
}
