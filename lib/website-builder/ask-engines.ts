/**
 * ===========================================================================
 *  THE MODELS ASK STORELIB OFFERS, AND HOW HARD EACH THINKS
 * ===========================================================================
 * Storelib AI runs on ChatGPT (lib/sites/agent/provider.ts, CHATGPT ONLY,
 * FOR NOW), so the switch lists OpenAI's two models and says in a line what
 * each is for. `provider` and `tier` are what the endpoint takes; the model
 * ids themselves are the server's (lib/sites/agent/models.ts), so a price
 * change or a new model is a change there and a label here.
 *
 * STRENGTH is the reasoning effort the model is asked for: Light, Standard
 * and Deep are OpenAI's low, medium and high. It is a separate choice from
 * the model because they answer different questions: Luna on Deep is a
 * careful small change, Terra on Light is a quick big one.
 *
 * Both are remembered per browser. An id saved before this list changed
 * (Claude Sonnet was "claude", Claude Opus "claude-opus") reads as the
 * default rather than as nothing.
 */

export const ENGINES = [
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

export type Engine = (typeof ENGINES)[number]
export type EngineId = Engine["id"]

export const DEFAULT_ENGINE: EngineId = "openai"
export const ENGINE_KEY = "storelib.theme-chat.engine"

/** A saved or sent engine id, as one this list has: anything else, old Claude ids included, is the default. */
export function engineFromSaved(saved: unknown): EngineId {
  return ENGINES.some((e) => e.id === saved) ? (saved as EngineId) : DEFAULT_ENGINE
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

export function strengthFromSaved(saved: unknown): StrengthId {
  return STRENGTHS.some((s) => s.id === saved) ? (saved as StrengthId) : DEFAULT_STRENGTH
}

export function effortOf(id: StrengthId): Effort {
  return (STRENGTHS.find((s) => s.id === id) ?? STRENGTHS[1]).effort
}

/** The efforts the agent route accepts from a browser. */
export const EFFORTS: readonly Effort[] = STRENGTHS.map((s) => s.effort)
