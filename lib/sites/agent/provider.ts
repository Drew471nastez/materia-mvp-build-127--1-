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

import { anthropicProvider, MissingAnthropicKeyError } from "./anthropic-provider"
import { DEFAULT_MODEL, STRONG_MODEL } from "./models"
import { openAIProvider } from "./openai-provider"
import type { AgentProvider } from "./types"

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
  }
}

/** What to tell somebody whose choice could not be honoured. */
export function substitutionNotice(resolved: Resolved): string | null {
  if (!resolved.substitutedFor) return null
  const missing = resolved.substitutedFor === "anthropic" ? "Claude" : "ChatGPT"
  const used = resolved.id === "anthropic" ? "Claude" : "ChatGPT"
  return `${missing} is not configured on this deployment, so ${used} answered instead.`
}

export { MissingAnthropicKeyError }
