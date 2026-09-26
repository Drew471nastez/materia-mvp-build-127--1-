import "server-only"

/**
 * ===========================================================================
 *  IS THIS KEY ANY GOOD, BEFORE IT IS KEPT
 * ===========================================================================
 * One free request to the provider's own "who am I" or model list, so a key
 * that was mistyped, revoked or pasted into the wrong box is refused when it
 * is added, in a sentence, and not at the first message somebody sends.
 * Nothing is generated, so nothing is billed.
 *
 * A provider that does not answer (down, slow) is not the key's fault: the
 * key is kept and `unchecked` says so.
 */

import type { KeySource } from "./store"

export type KeyCheck = { ok: true; unchecked?: boolean } | { ok: false; message: string }

const TIMEOUT_MS = 8000

/** The shape each provider's keys have, checked before any request: "sk-ant-" for Claude, "sk-" for OpenAI, "sk-or-" for OpenRouter. */
export function looksLike(source: KeySource, key: string): string | null {
  const k = key.trim()
  if (k.length < 20 || /\s/.test(k)) return "That does not look like a whole key. Copy it again and paste it in one piece."
  if (source === "anthropic" && !k.startsWith("sk-ant-")) return "A Claude key starts with sk-ant-. Create one at console.anthropic.com."
  if (source === "openrouter" && !k.startsWith("sk-or-")) return "An OpenRouter key starts with sk-or-."
  if (source === "openai") {
    if (k.startsWith("sk-ant-")) return "That is a Claude key. Add it under Claude instead."
    if (k.startsWith("sk-or-")) return "That is an OpenRouter key. Connect OpenRouter instead."
    if (!k.startsWith("sk-")) return "An OpenAI key starts with sk-. Create one at platform.openai.com."
  }
  return null
}

export async function checkKey(source: KeySource, key: string): Promise<KeyCheck> {
  const shape = looksLike(source, key)
  if (shape) return { ok: false, message: shape }
  const k = key.trim()
  const request: { url: string; headers: Record<string, string> } =
    source === "anthropic"
      ? { url: "https://api.anthropic.com/v1/models?limit=1", headers: { "x-api-key": k, "anthropic-version": "2023-06-01" } }
      : source === "openai"
        ? { url: "https://api.openai.com/v1/models", headers: { authorization: `Bearer ${k}` } }
        : { url: "https://openrouter.ai/api/v1/key", headers: { authorization: `Bearer ${k}` } }
  let res: Response
  try {
    res = await fetch(request.url, { headers: request.headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" })
  } catch {
    return { ok: true, unchecked: true }
  }
  if (res.ok) return { ok: true }
  const name = source === "anthropic" ? "Anthropic" : source === "openai" ? "OpenAI" : "OpenRouter"
  if (res.status === 401 || res.status === 403) return { ok: false, message: `${name} did not accept that key. Check it is copied whole and has not been revoked.` }
  if (res.status === 402) return { ok: false, message: `${name} says the account has no credit left. Add some, then try again.` }
  if (res.status === 429 || res.status >= 500) return { ok: true, unchecked: true }
  return { ok: false, message: `${name} refused the key (${res.status}).` }
}
