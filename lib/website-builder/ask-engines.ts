/**
 * ===========================================================================
 *  THE MODELS ASK STORELIB OFFERS, AND HOW HARD EACH THINKS
 * ===========================================================================
 * Claude and OpenAI share the same coding agent. The server lists the Claude
 * models available to the account; tier defaults remain available when that
 * list cannot be fetched. Exact IDs are checked again before generation.
 *
 * STRENGTH is the reasoning effort the model is asked for: Light, Standard
 * and Deep are OpenAI's low, medium and high. It is a separate choice from
 * the model because they answer different questions: Luna on Deep is a
 * careful small change, Terra on Light is a quick big one.
 *
 * Both are remembered per browser. An id saved before this list changed
 * is checked before use, so removed or malformed choices have a default.
 */

export const ENGINES = [
  {
    id: "claude",
    label: "Claude Sonnet",
    short: "Sonnet",
    detail: "For building sections, pages and everyday edits",
    provider: "anthropic",
    tier: "fast",
  },
  {
    id: "claude-opus",
    label: "Claude Opus",
    short: "Opus",
    detail: "For complex code and larger changes",
    provider: "anthropic",
    tier: "strong",
  },
  {
    id: "openai",
    label: "GPT-5.6 Luna",
    short: "Luna",
    detail: "Best for quick edits, copy and colours",
    provider: "openai",
    tier: "fast",
  },
  {
    id: "openai-strong",
    label: "GPT-5.6 Terra",
    short: "Terra",
    detail: "Best for new sections, pages and code",
    provider: "openai",
    tier: "strong",
  },
] as const

export interface Engine {
  id: string
  label: string
  short: string
  detail: string
  provider: "anthropic" | "openai"
  tier: "fast" | "strong"
  model?: string
}
export type EngineId = string

export const DEFAULT_ENGINE: EngineId = "claude"
export const ENGINE_KEY = "storelib.theme-chat.engine"

/** Saved exact choices are revalidated by the account-scoped server catalog. */
export function engineFromSaved(saved: unknown): EngineId {
  return typeof saved === "string" && (ENGINES.some((e) => e.id === saved) || /^claude:claude-[a-z0-9-]{1,100}$/.test(saved)) ? saved : DEFAULT_ENGINE
}

/** Names and IDs come from the account's Models API, not browser guesses. */
export function enginesWithClaudeModels(models: { id: string; display_name: string }[]): Engine[] {
  const choices: Engine[] = models.filter((model) => /^claude-[a-z0-9-]{1,100}$/.test(model.id)).map((model) => ({
    id: `claude:${model.id}`, label: model.display_name, short: model.display_name.replace(/^Claude\s+/i, ""),
    detail: /haiku/i.test(model.id) ? "Fast edits and shorter requests" : /opus|fable|mythos/i.test(model.id) ? "Complex code and larger changes" : "Sections, pages and everyday edits",
    provider: "anthropic", tier: /opus|fable|mythos/i.test(model.id) ? "strong" : "fast", model: model.id,
  }))
  if (!choices.length) return [...ENGINES]
  const sonnet = choices.find((engine) => /sonnet/.test(engine.model!))
  const opus = choices.find((engine) => /opus/.test(engine.model!))
  return [
    ...(sonnet ? [{ ...sonnet, id: "claude" }] : []),
    ...(opus ? [{ ...opus, id: "claude-opus" }] : []),
    ...choices.filter((engine) => engine !== sonnet && engine !== opus),
    ...ENGINES.filter((engine) => engine.provider === "openai"),
  ]
}

export const STRENGTHS = [
  { id: "light", label: "Light", detail: "Answers fastest. For a word, a colour, a setting", effort: "low" },
  { id: "standard", label: "Standard", detail: "Right for most requests", effort: "medium" },
  { id: "deep", label: "Deep", detail: "Thinks longer. For hard changes and code", effort: "high" },
] as const

export type Strength = (typeof STRENGTHS)[number]
export type StrengthId = Strength["id"]
export type Effort = Strength["effort"]

export const DEFAULT_STRENGTH: StrengthId = "standard"
export const STRENGTH_KEY = "storelib.theme-chat.strength"

/**
 * CODE A SECTION THINKS LONGER BY DEFAULT. A section is planned, written,
 * drawn, read back against the request and refined, and every one of those
 * is better for the time: a page change is a few settings and stays on
 * Standard. Each mode remembers its own choice, so picking Light for a quick
 * colour change does not make the next section a rushed one.
 */
export const DEFAULT_CODE_STRENGTH: StrengthId = "deep"
export const CODE_STRENGTH_KEY = "storelib.theme-chat.strength.code"

/** The Strength a mode starts on when this browser has not chosen one for it. */
export function defaultStrengthFor(mode: "change" | "code"): StrengthId {
  return mode === "code" ? DEFAULT_CODE_STRENGTH : DEFAULT_STRENGTH
}

/** Where a mode's Strength is remembered. */
export function strengthKeyFor(mode: "change" | "code"): string {
  return mode === "code" ? CODE_STRENGTH_KEY : STRENGTH_KEY
}

export function strengthFromSaved(saved: unknown, fallback: StrengthId = DEFAULT_STRENGTH): StrengthId {
  return STRENGTHS.some((s) => s.id === saved) ? (saved as StrengthId) : fallback
}

export function effortOf(id: StrengthId): Effort {
  return (STRENGTHS.find((s) => s.id === id) ?? STRENGTHS[1]).effort
}

/** The efforts the agent route accepts from a browser. */
export const EFFORTS: readonly Effort[] = STRENGTHS.map((s) => s.effort)
