import "server-only"

/**
 * ===========================================================================
 *  WHICH MODEL ANSWERS, AND WHOSE
 * ===========================================================================
 * The one place that turns "the creator picked Claude" into a provider object
 * and a model id. Both agents' routes call this; neither knows a vendor name.
 *
 * CLAUDE IS THE DEFAULT. Set `AGENT_PROVIDER=openai` to flip the deployment
 * back without a code change.
 *
 * ---------------------------------------------------------------------------
 *  A PROVIDER THAT IS NOT CONFIGURED IS NOT A PROVIDER
 * ---------------------------------------------------------------------------
 * A key can be missing on a preview deployment, revoked, or simply not set up
 * yet, and the failure that produces — a run that starts, streams nothing and
 * dies on the first call — is expensive and confusing. Availability is checked
 * BEFORE the run starts, and a request for a provider this deployment cannot
 * reach falls back to the other one and SAYS SO. Falling back silently would
 * bill somebody for a model they did not choose and quietly contradict the
 * switch they can see on screen.
 */

import { describeOwnKeyError } from "@/lib/ai-keys/errors"
import { noteUse, readKeys, type KeySource } from "@/lib/ai-keys/store"
import { anthropicClientFor, anthropicProvider, createAnthropicProvider, MissingAnthropicKeyError } from "./anthropic-provider"
import { DEFAULT_MODEL, STRONG_MODEL } from "./models"
import { createOpenAIProvider, openAIClientFor, openAIProvider } from "./openai-provider"
import type { AgentProvider, ProviderRequest, ProviderTurn } from "./types"

export type ProviderId = "anthropic" | "openai"

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

/** Claude unless this deployment says otherwise. */
export const DEFAULT_PROVIDER: ProviderId = isProviderId(process.env.AGENT_PROVIDER)
  ? process.env.AGENT_PROVIDER
  : "anthropic"

/**
 * Model ids, overridable without a deploy.
 *
 * Sonnet 5 for everyday work and Opus 5 for the hard change is the split the
 * models are actually priced and tuned for; putting Opus on every heading edit
 * would cost five times as much to answer a question Sonnet answers as well.
 */
const MODELS: Record<ProviderId, Record<ModelTier, string>> = {
  anthropic: {
    fast: process.env.ANTHROPIC_AGENT_MODEL || "claude-sonnet-5",
    strong: process.env.ANTHROPIC_AGENT_STRONG_MODEL || "claude-opus-5",
  },
  openai: {
    fast: DEFAULT_MODEL,
    strong: STRONG_MODEL,
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
  /** Set when the creator's choice was not available and this is the other one. */
  substitutedFor: ProviderId | null
  /**
   * Whose account pays: null for Storelib's, otherwise the creator's own
   * connection that answers (see resolveForCreator). A run on their own
   * account does not count against the plan's AI edits.
   */
  own: KeySource | null
}

/**
 * The provider and model for one request.
 *
 * `requested` comes from the creator's switch and is UNTRUSTED — anything that
 * is not a provider id falls back to the deployment default rather than being
 * passed to a client constructor.
 */
export function resolveProvider(input: {
  requested?: unknown
  tier?: unknown
}): Resolved {
  const wanted: ProviderId = isProviderId(input.requested) ? input.requested : DEFAULT_PROVIDER
  const tier: ModelTier = isModelTier(input.tier) ? input.tier : "fast"

  const chosen: ProviderId = isConfigured(wanted)
    ? wanted
    : isConfigured(wanted === "anthropic" ? "openai" : "anthropic")
      ? wanted === "anthropic"
        ? "openai"
        : "anthropic"
      : (() => {
          throw new NoProviderConfiguredError()
        })()

  return {
    id: chosen,
    provider: chosen === "anthropic" ? anthropicProvider : openAIProvider,
    model: MODELS[chosen][tier],
    substitutedFor: chosen === wanted ? null : wanted,
    own: null,
  }
}

/**
 * ===========================================================================
 *  THE CREATOR'S OWN AI, WHEN THEY HAVE CONNECTED ONE
 * ===========================================================================
 * "Let people connect their own Claude or ChatGPT so it does not use
 * Storelib AI credits." The same choice the creator made in the chat
 * (Claude or ChatGPT, everyday or hard), answered on their account when it
 * can be:
 *
 *   1. their own key for that vendor (a Claude key for Claude, an OpenAI key
 *      for ChatGPT), straight to the vendor;
 *   2. otherwise their OpenRouter account, which answers for both, on the
 *      same models by OpenRouter's names;
 *   3. otherwise Storelib's, exactly as before.
 *
 * Their key is never swapped for Storelib's when it fails: a run on it that
 * is refused says so (lib/ai-keys/errors), because quietly answering on
 * Storelib's account would spend the credits they connected a key to save.
 */
export async function resolveForCreator(
  creatorId: string | null | undefined,
  input: { requested?: unknown; tier?: unknown },
): Promise<Resolved> {
  if (!creatorId) return resolveProvider(input)
  const wanted: ProviderId = isProviderId(input.requested) ? input.requested : DEFAULT_PROVIDER
  const tier: ModelTier = isModelTier(input.tier) ? input.tier : "fast"
  const keys = await readKeys(creatorId).catch(() => ({}) as Awaited<ReturnType<typeof readKeys>>)
  const model = MODELS[wanted][tier]

  const direct = wanted === "anthropic" ? keys.anthropic : keys.openai
  if (direct) {
    return {
      id: wanted,
      provider:
        wanted === "anthropic"
          ? ownAccount(createAnthropicProvider(once(() => anthropicClientFor(direct, "anthropic"))), wanted, creatorId)
          : ownAccount(createOpenAIProvider(once(() => openAIClientFor(direct, "openai"))), wanted, creatorId),
      model,
      substitutedFor: null,
      own: wanted,
    }
  }
  const router = keys.openrouter
  if (router) {
    return {
      id: wanted,
      provider:
        wanted === "anthropic"
          ? ownAccount(createAnthropicProvider(once(() => anthropicClientFor(router, "openrouter")), { modelPrefix: "anthropic/" }), "openrouter", creatorId)
          : ownAccount(createOpenAIProvider(once(() => openAIClientFor(router, "openrouter")), { modelPrefix: "openai/" }), "openrouter", creatorId),
      model,
      substitutedFor: null,
      own: "openrouter",
    }
  }
  return resolveProvider(input)
}

/** The start of a run's provider when it ran on the creator's own account. */
export const OWN_PREFIX = "own:"

/** Whether a creator could be answered at all: Storelib's keys, or one of their own. */
export async function canAnswer(creatorId: string | null | undefined): Promise<boolean> {
  if (isConfigured("anthropic") || isConfigured("openai")) return true
  if (!creatorId) return false
  const keys = await readKeys(creatorId).catch(() => ({}))
  return Object.keys(keys).length > 0
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
    /* Recorded on the run as "own:anthropic" and so on: how the monthly AI edits count leaves it out (run.ts). */
    id: `${OWN_PREFIX}${source}`,
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

export { MissingAnthropicKeyError }
