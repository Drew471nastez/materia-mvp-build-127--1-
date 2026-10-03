import "server-only"

/**
 * ===========================================================================
 *  WHEN THE CREATOR'S OWN AI SAYS NO
 * ===========================================================================
 * A run on a creator's own key that fails is told in their terms: whose
 * account refused it, why, and where to fix it. Not "Storelib AI could not
 * be reached", which reads as our outage, and never a quiet retry on
 * Storelib's account, which would spend the credits the key was there to
 * save.
 *
 * Both SDKs' errors carry the HTTP status (`status`), which is all this
 * needs; nothing here matches on wording.
 */

import type { KeySource } from "./store"

export function ownKeyName(source: KeySource): string {
  return source === "anthropic" ? "Claude key" : "OpenAI key"
}

const FIX = "Update it in Website settings, Connections, or remove it to use Storelib AI."

/** A sentence for the creator, or null when the failure is not about their key (a timeout, our own bug). */
export function describeOwnKeyError(thrown: unknown, source: KeySource): string | null {
  const status = typeof thrown === "object" && thrown && "status" in thrown ? Number((thrown as { status?: unknown }).status) : NaN
  if (!Number.isFinite(status)) return null
  const name = `Your ${ownKeyName(source)}`
  if (status === 401 || status === 403) return `${name} was refused, so nothing was changed. ${FIX}`
  if (status === 402) return `${name} is out of credit, so nothing was changed. Add credit there and send it again, or remove it to use Storelib AI.`
  if (status === 429) return `${name} is being rate limited by its provider. Wait a moment and send it again.`
  if (status === 404) return `${name} cannot use this model. Pick another in the chat, or ${FIX.charAt(0).toLowerCase()}${FIX.slice(1)}`
  if (status === 400) return null
  if (status >= 500) return `${name}'s provider is having trouble right now. Try again in a moment.`
  return null
}
