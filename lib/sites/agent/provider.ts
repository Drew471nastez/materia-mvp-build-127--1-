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
 *  CHATGPT ONLY, FOR NOW
 * ---------------------------------------------------------------------------
 * Storelib AI runs on OpenAI. Anthropic is not offered anywhere in the
 * product at the moment: the chat's switch lists ChatGPT models only, and a
 * request that still names "anthropic" (an open tab from before, a saved
 * choice, an old client) is answered by OpenAI here, so nothing a browser
 * sends can reach Claude. `AGENT_PROVIDER` is read only when it names a
 * provider in OFFERED.
 *
 * The Anthropic provider (./anthropic-provider.ts) is kept as it is, priced
 * in ./models and tested, and nothing in a product path imports it. Turning
 * it back on is adding "anthropic" to OFFERED and its models to the chat's
 * list (lib/website-builder/ask-engines.ts), not rewriting a provider.
 *
 * ---------------------------------------------------------------------------
 *  A PROVIDER THAT IS NOT CONFIGURED IS NOT A PROVIDER
 * ---------------------------------------------------------------------------
 * A key can be missing on a preview deployment, revoked, or simply not set up
 * yet, and the failure that produces (a run that starts, streams nothing and
 * dies on the first call) is expensive and confusing. Availability is checked
 * BEFORE the run starts. With one vendor there is nothing to fall back to, so
 * a deployment without OPENAI_API_KEY answers only creators who connected
 * their own.
 *
 * Every provider handed out is wrapped in `plainFailures` (./plain-errors),
 * so a vendor's error body never reaches a creator's screen.
 */

import { noteUse, readKeys, type KeySource } from "@/lib/ai-keys/store"
import { describeOwnKeyError } from "@/lib/ai-keys/errors"
import { DEFAULT_MODEL, STRONG_MODEL } from "./models"
import { createOpenAIProvider, openAIClientFor, openAIProvider } from "./openai-provider"
import { plainFailures } from "./plain-errors"
import type { AgentProvider, ProviderRequest, ProviderTurn } from "./types"

export type ProviderId = "anthropic" | "openai"

/** The providers Storelib AI offers today. See CHATGPT ONLY, FOR NOW above. */
export const OFFERED: readonly ProviderId[] = ["openai"]

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

/** OpenAI, unless this deployment names another provider that is offered. */
export const DEFAULT_PROVIDER: ProviderId = isOffered(process.env.AGENT_PROVIDER) ? process.env.AGENT_PROVIDER : "openai"

/**
 * What a request may have. `requested` is UNTRUSTED: anything that is not an
 * offered provider, "anthropic" included, is the default.
 */
export function offeredProvider(requested: unknown): ProviderId {
  return isOffered(requested) ? requested : DEFAULT_PROVIDER
}

/**
 * Model ids, overridable without a deploy (./models for OpenAI's).
 *
 * The Anthropic row is unreachable while OFFERED leaves it out, and stays so
 * the day it comes back is a one line change.
 */
const MODELS: Record<ProviderId, Record<ModelTier, string>> = {
  openai: {
    fast: DEFAULT_MODEL,
    strong: STRONG_MODEL,
  },
  anthropic: {
    fast: process.env.ANTHROPIC_AGENT_MODEL || "claude-sonnet-5",
    strong: process.env.ANTHROPIC_AGENT_STRONG_MODEL || "claude-opus-5",
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
    super("OPENAI_API_KEY is not set")
    this.name = "NoProviderConfiguredError"
  }
}

export interface Resolved {
  id: ProviderId
  provider: AgentProvider
  model: string
  /**
   * Set when the creator's choice was not available and this is another
   * one. Always null while one provider is offered: a request for Claude is
   * answered by ChatGPT without a notice, because Claude is not a choice the
   * creator can see any more.
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
  if (!isConfigured(chosen)) throw new NoProviderConfiguredError()

  return {
    id: chosen,
    provider: plainFailures(openAIProvider),
    model: MODELS[chosen][tier],
    substitutedFor: null,
    own: null,
  }
}

/**
 * ===========================================================================
 *  THE CREATOR'S OWN AI, WHEN THEY HAVE CONNECTED ONE
 * ===========================================================================
 * "Let people connect their own ChatGPT so it does not use Storelib AI
 * credits." The same choice the creator made in the chat (which model, and
 * how hard it thinks), answered on their account when it can be:
 *
 *   1. their own OpenAI key, straight to OpenAI;
 *   2. otherwise Storelib's, exactly as before.
 *
 * A Claude key a creator connected before is kept, and not used while
 * Claude is not offered: Connections no longer shows it, and removing it is
 * still theirs to do.
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
  const wanted = offeredProvider(input.requested)
  const tier: ModelTier = isModelTier(input.tier) ? input.tier : "fast"
  const keys = await readKeys(creatorId).catch(() => ({}) as Awaited<ReturnType<typeof readKeys>>)
  const model = MODELS[wanted][tier]

  const direct = keys.openai
  if (direct) {
    return {
      id: wanted,
      provider: plainFailures(ownAccount(createOpenAIProvider(once(() => openAIClientFor(direct))), "openai", creatorId)),
      model,
      substitutedFor: null,
      own: "openai",
    }
  }
  return resolveProvider(input)
}

/** The start of a run's provider when it ran on the creator's own account. */
export const OWN_PREFIX = "own:"

/** The creator's own connections that can answer today: a Claude key alone cannot. */
export const ANSWERING_SOURCES: readonly KeySource[] = ["openai"]

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
