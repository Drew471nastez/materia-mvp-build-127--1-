/**
 * ===========================================================================
 *  THE MODELS ASK STORELIB OFFERS
 * ===========================================================================
 * The owner's list, and nothing else: "for the Storelib AI coding agent I
 * just want Opus 5.5, Sonnet 5.5, Haiku 5.5, Opus 4.8 and that's all, and
 * the strength should be medium without the switcher".
 *
 * So the picker is these four, in this order, each with one line on what it
 * is best for, after Auto (below), the default, which runs Opus 5.5 for page
 * work and code and Sonnet 5.5 for a small edit. The ids are Anthropic's own, exactly, and the
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

/*
  ===========================================================================
   AUTO: THE RIGHT MODEL FOR EACH REQUEST, UNLESS THE CREATOR CHOOSES ONE
  ===========================================================================
  The picker always sent its model, so "change the heading" ran on Opus 5.5
  with a 25k-token prefix like a whole-site build. Auto is the default now:
  a small local, content or style edit runs on Sonnet 5.5, and a plan, a
  redesign, new section code, a picture to match or a new page runs on Opus
  5.5 (autoModel below, decided on the server from the classified request).
  Picking a model in the menu is still the creator's choice and is honoured
  exactly; Auto sends no model.
*/
export const AUTO_ENGINE_ID = "auto"
export const AUTO_ENGINE: Engine = {
  id: AUTO_ENGINE_ID,
  label: "Auto",
  short: "Auto",
  detail: "Sonnet 5.5 for quick edits, Opus 5.5 for redesigns and code",
  provider: "anthropic",
  tier: "fast",
  model: "",
}
/** What the menu lists: Auto first, then the four models. */
export const PICKER_ENGINES: readonly Engine[] = [AUTO_ENGINE, ...ENGINES]

/** The model Auto uses for a small edit, and for everything bigger. */
export const AUTO_FAST_MODEL = "claude-sonnet-5-5"
export const AUTO_STRONG_MODEL = "claude-opus-5-5"

/** What the server knows about a request when Auto chooses (lib/website-builder/agent/intent.ts, ambition.ts). */
export interface AutoSignals {
  kind: string
  plan?: boolean
  rebuild?: boolean
  newPage?: boolean
  recreate?: boolean
  wantsMotion?: boolean
  codeFocus?: boolean
  images?: number
  ambitious?: boolean
  wholePage?: boolean
  /** The router or the target says the change goes into a section's code, or adds a section. */
  code?: boolean
}

const SMALL_KINDS = new Set(["LOCAL_EDIT", "CONTENT_CHANGE", "STYLE_CHANGE", "QUESTION"])

/**
 * Which model Auto runs a request on. Opus 5.5 for anything that plans,
 * redesigns, writes section code, builds a page or matches a picture;
 * Sonnet 5.5 for a local, content or style edit and a question.
 */
export function autoModel(s: AutoSignals): string {
  if (s.plan || s.rebuild || s.newPage || s.recreate || s.codeFocus || s.code || s.wholePage) return AUTO_STRONG_MODEL
  if ((s.images ?? 0) > 0) return AUTO_STRONG_MODEL
  if (!SMALL_KINDS.has(s.kind)) return AUTO_STRONG_MODEL
  /* "Build me a proper pricing section" reads as a local edit that adds a section: a build is worth the stronger model. */
  if (s.ambitious && s.kind === "LOCAL_EDIT") return AUTO_STRONG_MODEL
  return AUTO_FAST_MODEL
}

export const DEFAULT_ENGINE: EngineId = AUTO_ENGINE_ID
export const ENGINE_KEY = "storelib.theme-chat.engine"

/** The model ids a browser may name. Anything else is refused by the server. */
export const ENGINE_MODELS: readonly string[] = ENGINES.map((e) => e.model)

export function isEngineModel(value: unknown): value is string {
  return typeof value === "string" && ENGINE_MODELS.includes(value)
}

/** A saved choice that is still on the list (Auto included), or the default, Auto. */
export function engineFromSaved(saved: unknown): EngineId {
  return typeof saved === "string" && PICKER_ENGINES.some((e) => e.id === saved) ? saved : DEFAULT_ENGINE
}

export function engineOf(id: unknown): Engine {
  return PICKER_ENGINES.find((e) => e.id === id) ?? AUTO_ENGINE
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
