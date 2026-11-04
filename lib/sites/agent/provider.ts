import "server-only"

/**
 * ===========================================================================
 *  WHICH MODEL ANSWERS, AND WHOSE
 * ===========================================================================
 * The one place that turns "the creator picked the stronger model" into a
 * provider object and a model id. Every agent route calls this; none of them
 * knows a vendor name.
 *
 * ---------------------------------------------------------------------------
 *  CLAUDE AND OPENAI
 * ---------------------------------------------------------------------------
 * Both providers are offered. Claude is the default, configurable through
 * AGENT_PROVIDER. Exact Claude model IDs are validated against the account's
 * Models API before a generation starts.
 *
 * Both adapters use the same tools, transcript, draft validation and quota
 * accounting. Choosing a provider does not change the agent's permissions.
 *
 * ---------------------------------------------------------------------------
 *  A PROVIDER THAT IS NOT CONFIGURED IS NOT A PROVIDER
 * ---------------------------------------------------------------------------
 * A key can be missing on a preview deployment, revoked, or simply not set up
 * yet, and the failure that produces (a run that starts, streams nothing and
 * dies on the first call) is expensive and confusing. Availability is checked
 * BEFORE the run starts. A missing key can use another configured provider,
 * with a notice. A refused personal key never silently spends platform credit.
 *
 * Every provider handed out is wrapped in `plainFailures` (./plain-errors),
 * so a vendor's error body never reaches a creator's screen.
 */

import { noteUse, readKeys, type KeySource } from "@/lib/ai-keys/store"
import { describeOwnKeyError } from "@/lib/ai-keys/errors"
import { DEFAULT_MODEL, STRONG_MODEL } from "./models"
import { createOpenAIProvider, openAIClientFor, openAIProvider } from "./openai-provider"
import { anthropicProvider, anthropicClientFor, createAnthropicProvider } from "./anthropic-provider"
import { claudeModels } from "./claude-models"
import type Anthropic from "@anthropic-ai/sdk"
import { plainFailures } from "./plain-errors"
import { isEngineModel } from "@/lib/website-builder/ask-engines"
import type { AgentProvider, ProviderRequest, ProviderTurn } from "./types"

export type ProviderId = "anthropic" | "openai"

/** The providers offered in Ask Storelib. */
export const OFFERED: readonly ProviderId[] = ["anthropic", "openai"]

/**
 * `fast` is the everyday model and `strong` is the one somebody reaches for
 * on a hard change. Tiers rather than model ids, because the ids are a
 * deployment decision and the callers are asking a question about difficulty.
 */
export type ModelTier = "fast" | "strong"

export function isProviderId(value: unknown): value is ProviderId {
  return value === "anthropic" || value === "openai"
}

export function isModelTier(value: unknown): value is ModelTier {
  return value === "fast" || value === "strong"
}

function isOffered(value: unknown): value is ProviderId {
  return isProviderId(value) && OFFERED.includes(value)
}

/** Deployment default; a missing credential is resolved before starting. */
export const DEFAULT_PROVIDER: ProviderId = isOffered(process.env.AGENT_PROVIDER) ? process.env.AGENT_PROVIDER : "anthropic"

/**
 * What a request may have. `requested` is UNTRUSTED: anything that is not an
 * offered provider is the default.
 */
export function offeredProvider(requested: unknown): ProviderId {
  return isOffered(requested) ? requested : DEFAULT_PROVIDER
}

/**
 * Model ids, overridable without a deploy (./models for OpenAI's).
 *
 * Exact account-listed model choices override these tier defaults.
 */
const MODELS: Record<ProviderId, Record<ModelTier, string>> = {
  openai: {
    fast: DEFAULT_MODEL,
    strong: STRONG_MODEL,
  },
  anthropic: {
    fast: process.env.ANTHROPIC_AGENT_MODEL || "claude-sonnet-5-5",
    strong: process.env.ANTHROPIC_AGENT_STRONG_MODEL || "claude-opus-5-5",
  },
}

/** A tier, in one vendor's names. */
export function modelFor(id: ProviderId, tier: ModelTier): string {
  return MODELS[id][tier]
}

/** Whether this deployment can actually reach a provider. */
export function isConfigured(id: ProviderId): boolean {
  return id === "anthropic" ? !!process.env.ANTHROPIC_API_KEY : !!process.env.OPENAI_API_KEY
}

export class NoProviderConfiguredError extends Error {
  constructor() {
    super("Neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is set")
    this.name = "NoProviderConfiguredError"
  }
}

export interface Resolved {
  id: ProviderId
  provider: AgentProvider
  model: string
  /**
   * Set when the creator's choice was not available and this is another
   * one. The stream tells the creator which provider answered instead.
   */
  substitutedFor: ProviderId | null
  /**
   * Whose account pays: null for Storelib's, otherwise the creator's own
   * connection that answers (see resolveForCreator). A run on their own
   * account does not count against the plan's AI edits.
   */
  own: KeySource | null
}

/** The provider and model for one request, on Storelib's account. */
export function resolveProvider(input: { requested?: unknown; tier?: unknown }): Resolved {
  const chosen = offeredProvider(input.requested)
  const tier: ModelTier = isModelTier(input.tier) ? input.tier : "fast"
  const available = isConfigured(chosen) ? chosen : OFFERED.find(isConfigured)
  if (!available) throw new NoProviderConfiguredError()

  return {
    id: available,
    provider: plainFailures(available === "anthropic" ? anthropicProvider : openAIProvider),
    model: MODELS[available][tier],
    substitutedFor: available === chosen ? null : chosen,
    own: null,
  }
}

/**
 * ===========================================================================
 *  THE CREATOR'S OWN AI, WHEN THEY HAVE CONNECTED ONE
 * ===========================================================================
 * "Let people connect their own Claude or OpenAI so it does not use Storelib AI
 * credits." The same choice the creator made in the chat (which model, and
 * how hard it thinks), answered on their account when it can be:
 *
 *   1. their own key for the requested provider;
 *   2. otherwise Storelib's, exactly as before.
 *
 * Personal Claude and OpenAI connections remain independently scoped.
 *
 * Their key is never swapped for Storelib's when it fails: a run on it that
 * is refused says so (lib/ai-keys/errors), because quietly answering on
 * Storelib's account would spend the credits they connected a key to save.
 */
export async function resolveForCreator(
  creatorId: string | null | undefined,
  input: { requested?: unknown; tier?: unknown; model?: unknown },
): Promise<Resolved> {
  if (!creatorId) return resolveProvider(input)
  const wanted = offeredProvider(input.requested)
  const tier: ModelTier = isModelTier(input.tier) ? input.tier : "fast"
  const keys = await readKeys(creatorId).catch(() => ({}) as Awaited<ReturnType<typeof readKeys>>)
  let model = MODELS[wanted][tier]

  const direct = keys[wanted]
  const claudeKey = wanted === "anthropic" ? direct || process.env.ANTHROPIC_API_KEY : undefined
  let modelInfo: Anthropic.ModelInfo | undefined
  /*
    ONLY THE FOUR IN THE MENU (lib/website-builder/ask-engines.ts). The id is
    the creator's choice and is checked against that list, never passed on as
    sent. The account's Models API then says what the model can do (its output
    limit, whether it takes effort); a listing that cannot be read is not a
    reason to refuse a model that is on the list, and one that reads without it
    means this account cannot use it.
  */
  if (input.model !== undefined && wanted === "anthropic") {
    if (!isEngineModel(input.model)) throw new Error("Choose a Claude model from the menu.")
    if (!claudeKey) throw new NoProviderConfiguredError()
    const available = await claudeModels(claudeKey).catch(() => null)
    if (available) {
      modelInfo = available.find((item) => item.id === input.model)
      if (!modelInfo) throw new Error("That Claude model is not available on this account. Choose another model.")
    }
    model = input.model
  }
  if (direct) {
    return {
      id: wanted,
      provider: plainFailures(ownAccount(wanted === "anthropic" ? createAnthropicProvider(once(() => anthropicClientFor(direct)), { modelInfo }) : createOpenAIProvider(once(() => openAIClientFor(direct))), wanted, creatorId)),
      model,
      substitutedFor: null,
      own: wanted,
    }
  }
  if (!isConfigured(wanted)) {
    const alternate = OFFERED.find((id) => id !== wanted && (keys[id] || isConfigured(id)))
    if (alternate) return { ...await resolveForCreator(creatorId, { requested: alternate, tier }), substitutedFor: wanted }
  }
  const resolved = resolveProvider(input)
  if (wanted === "anthropic" && resolved.id === "anthropic" && modelInfo) return { ...resolved, model, provider: plainFailures(createAnthropicProvider(once(() => anthropicClientFor(claudeKey!)), { modelInfo })) }
  if (wanted === "anthropic" && resolved.id === "anthropic") return { ...resolved, model }
  return resolved
}

/** The start of a run's provider when it ran on the creator's own account. */
export const OWN_PREFIX = "own:"

/** A connection for either provider can answer without a platform key. */
export const ANSWERING_SOURCES: readonly KeySource[] = ["anthropic", "openai"]

/** Whether a creator could be answered at all: Storelib's key, or one of their own. */
export async function canAnswer(creatorId: string | null | undefined): Promise<boolean> {
  if (OFFERED.some(isConfigured)) return true
  if (!creatorId) return false
  const keys = await readKeys(creatorId).catch(() => ({}) as Awaited<ReturnType<typeof readKeys>>)
  return ANSWERING_SOURCES.some((source) => !!keys[source])
}

/**
 * A provider on the creator's own account, which says in their terms when
 * that account refuses (every agent loop shows a thrown error's message as
 * it is) and notes on the connection when it was last used and whether it
 * worked, so Connections can show "used 2 minutes ago" or the refusal.
 */
export function ownAccount(provider: AgentProvider, source: KeySource, creatorId: string): AgentProvider {
  let noted = false
  return {
    /* Recorded on the run as "own:openai" and so on: how the monthly AI edits count leaves it out (run.ts). */
    id: `${OWN_PREFIX}${source}`,
    streams: provider.streams,
    async complete(request: ProviderRequest): Promise<ProviderTurn> {
      try {
        const turn = await provider.complete(request)
        if (!noted) {
          noted = true
          void noteUse(creatorId, source, null)
        }
        return turn
      } catch (thrown) {
        const said = describeOwnKeyError(thrown, source)
        if (!said) throw thrown
        void noteUse(creatorId, source, said)
        throw Object.assign(new Error(said), { name: "OwnKeyError", status: (thrown as { status?: number }).status })
      }
    },
  }
}

function once<T>(make: () => T): () => T {
  let made: T | undefined
  return () => (made ??= make())
}

/** What to tell somebody whose choice could not be honoured. */
export function substitutionNotice(resolved: Resolved): string | null {
  if (!resolved.substitutedFor) return null
  const missing = resolved.substitutedFor === "anthropic" ? "Claude" : "ChatGPT"
  const used = resolved.id === "anthropic" ? "Claude" : "ChatGPT"
  return `${missing} is not configured on this deployment, so ${used} answered instead.`
}
