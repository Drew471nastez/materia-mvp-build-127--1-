/**
 * ===========================================================================
 *  A PROVIDER'S ERROR IS NEVER WHAT THE CREATOR READS
 * ===========================================================================
 * The chat once showed this, word for word, with a Try again button under it:
 *
 *   400 {"type":"error","error":{"type":"invalid_request_error","message":
 *   "Your credit balance is too low to access the Anthropic API..."},
 *   "request_id":"req_..."}
 *
 * That is a sentence about Storelib's account with a vendor, in JSON, shown
 * to somebody who can do nothing about it. Every failure of a model call is
 * turned into one of a few plain sentences here, and the raw detail goes to
 * the server log and nowhere else.
 *
 * Read by status, by the SDK's error class NAME and by a few words in the
 * body, so neither SDK has to be imported: this module is also read by the
 * chat in the browser (`plainChatError`), to catch a raw message kept in an
 * old conversation's history.
 *
 * A message already written for a person passes through: the creator's own
 * key refusing (OwnKeyError, lib/ai-keys/errors.ts), and anything thrown as
 * a PlainError below.
 */

import type { AgentProvider, ProviderRequest, ProviderTurn } from "./types"

export type FailureKind = "unavailable" | "busy" | "timeout" | "network" | "failed"

export const PLAIN_MESSAGES: Record<FailureKind, string> = {
  /* Billing, quota, a key that stopped working, a model this account cannot use: all ours to fix, none theirs. */
  unavailable: "Storelib AI is unavailable right now. Try again in a few minutes.",
  busy: "Storelib AI is busy right now. Wait a moment and send it again.",
  timeout: "Storelib AI took too long to answer. Try again, or ask for one part of it.",
  network: "Storelib AI could not be reached. Anything already changed is still here, so try again.",
  failed: "That did not go through. Try again.",
}

/** An error whose message is already a sentence for the creator. */
export class PlainError extends Error {
  readonly kind: FailureKind
  readonly status?: number
  /** The conversation no longer fits the model: a run can shorten it and ask again (lib/website-builder/agent/run-repair.ts). */
  readonly overflow: boolean
  constructor(kind: FailureKind, status?: number, overflow = false) {
    super(PLAIN_MESSAGES[kind])
    this.name = "PlainError"
    this.kind = kind
    this.status = status
    this.overflow = overflow
  }
}

const OVERFLOW = /prompt is too long|context.?length|context window|maximum context|too many (?:input )?tokens|input is too long|request too large|exceeds? the (?:model'?s? )?(?:maximum|context)/

/**
 * Whether a failure is the conversation being longer than the model takes,
 * which is the one "failed" a run can repair itself: by shortening what it
 * sends. Read before or after plainFailures has made it plain.
 */
export function isContextOverflow(thrown: unknown): boolean {
  if (!thrown || typeof thrown !== "object") return false
  if (thrown instanceof PlainError) return thrown.overflow
  const e = thrown as Shaped
  return e.status === 413 || OVERFLOW.test(wordsOf(e))
}

/** Names whose message was written for the creator and is shown as it is. */
const ALREADY_PLAIN = new Set(["PlainError", "OwnKeyError"])

interface Shaped {
  name?: unknown
  status?: unknown
  code?: unknown
  type?: unknown
  message?: unknown
  error?: unknown
  cause?: unknown
}

/** Everything an error says about itself, as one lowercase string to read words from. */
function wordsOf(thrown: Shaped): string {
  const parts: string[] = [String(thrown.message ?? ""), String(thrown.code ?? ""), String(thrown.type ?? "")]
  try {
    if (thrown.error !== undefined) parts.push(JSON.stringify(thrown.error))
  } catch {
    /* a circular body says nothing useful */
  }
  const cause = thrown.cause as Shaped | undefined
  if (cause && typeof cause === "object") parts.push(String(cause.message ?? ""), String(cause.code ?? ""))
  return parts.join(" ").toLowerCase()
}

const BILLING = /credit balance|insufficient_quota|exceeded your current quota|billing|payment required|quota exceeded|out of credit/

/**
 * Which kind of failure this is, or null when it is not a model call failing
 * at all (a bug of ours, a cancel). Most specific first.
 */
export function failureKind(thrown: unknown): FailureKind | null {
  if (!thrown || typeof thrown !== "object") return null
  const e = thrown as Shaped
  const name = String(e.name ?? "")
  if (name === "AbortError") return null
  if (e instanceof PlainError) return e.kind
  /* No key on this deployment: nothing the creator can do, and the variable's name is not for them. */
  if (/^Missing(Anthropic)?KeyError$|^NoProviderConfiguredError$/.test(name)) return "unavailable"
  const words = wordsOf(e)
  /* Both SDKs start a message with the status ("400 {...}"), which is all a rethrown copy of one still carries. */
  const status = typeof e.status === "number" ? e.status : Number(String(e.message ?? "").match(/^(\d{3})\s/)?.[1] ?? Number.NaN)

  if (status === 402 || BILLING.test(words)) return "unavailable"
  if (/Timeout/.test(name) || status === 408 || /timed out|timeout/.test(words)) return "timeout"
  if (status === 429 || /rate.?limit/.test(words)) return "busy"
  if (status === 529 || /overloaded/.test(words) || (status >= 500 && status < 600)) return "busy"
  if (status === 401 || status === 403 || status === 404) return "unavailable"
  if (name === "APIConnectionError" || /connection error|econnreset|enotfound|econnrefused|eai_again|socket hang up|fetch failed|network/.test(words)) {
    return "network"
  }
  if (Number.isFinite(status) || (/Error$/.test(name) && /"type"\s*:\s*"error"|invalid_request_error|request_id/.test(words))) {
    return "failed"
  }
  return null
}

/**
 * The sentence for the creator, from anything a run can throw.
 *
 * `where` names the caller in the log line. The raw detail is logged once,
 * here, so a caller that shows the result never has to decide whether it is
 * safe to show.
 */
export function plainRunError(thrown: unknown, where: string, fallback: string = PLAIN_MESSAGES.failed): string {
  if (thrown && typeof thrown === "object" && ALREADY_PLAIN.has(String((thrown as Shaped).name))) {
    return String((thrown as Shaped).message) || fallback
  }
  const kind = failureKind(thrown)
  const e = (thrown ?? {}) as Shaped
  console.error(`[storelib ai] ${where}: ${kind ?? "error"}`, typeof e.status === "number" ? e.status : "", String(e.message ?? thrown).slice(0, 600))
  return kind ? PLAIN_MESSAGES[kind] : fallback
}

/**
 * A provider whose failures are already plain when they leave it.
 *
 * Every caller of a model (the page assistant, the code agent, the section
 * writer, Solve with AI) shows a thrown error's message somewhere, and each
 * of them used to show the SDK's. Wrapped once where the provider is chosen
 * (./provider.ts), none of them has to remember. A cancel, the creator's own
 * key refusing, and anything that is not a model call failing pass through
 * untouched, so each caller's own handling of those still runs.
 */
export function plainFailures(provider: AgentProvider): AgentProvider {
  return {
    id: provider.id,
    streams: provider.streams,
    async complete(request: ProviderRequest): Promise<ProviderTurn> {
      try {
        return await provider.complete(request)
      } catch (thrown) {
        const name = thrown && typeof thrown === "object" ? String((thrown as Shaped).name) : ""
        if (ALREADY_PLAIN.has(name)) throw thrown
        const kind = failureKind(thrown)
        if (!kind) throw thrown
        plainRunError(thrown, `provider ${provider.id} ${request.model}`)
        const status = (thrown as Shaped).status
        throw new PlainError(kind, typeof status === "number" ? status : undefined, isContextOverflow(thrown))
      }
    },
  }
}

/**
 * Whether a string reads like a provider's own words rather than ours: an
 * HTTP status in front of JSON, an error envelope, a request id, or a
 * vendor's billing sentence.
 */
export function looksRaw(message: string): boolean {
  return (
    /^\s*\d{3}\s*[{[]/.test(message) ||
    /"type"\s*:\s*"error"|invalid_request_error|request_id|req_[a-z0-9]{8,}/i.test(message) ||
    /credit balance|anthropic|api key|api\.openai|insufficient_quota/i.test(message)
  )
}

/**
 * The chat's last line of defence. A message the server sent is shown as it
 * is unless it reads raw, which can still happen for a failure kept in a
 * conversation's history from before this module existed.
 */
export function plainChatError(message: string | null | undefined): string {
  const text = (message ?? "").trim()
  if (!text) return PLAIN_MESSAGES.failed
  if (!looksRaw(text)) return text
  return BILLING.test(text.toLowerCase()) || /\b40[1-4]\b/.test(text.slice(0, 4)) ? PLAIN_MESSAGES.unavailable : PLAIN_MESSAGES.failed
}
