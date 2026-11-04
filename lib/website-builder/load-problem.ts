import { tt } from "@/lib/i18n/text"

/**
 * ===========================================================================
 *  WHY THE EDITOR DID NOT OPEN, SAID TRUTHFULLY (round 50)
 * ===========================================================================
 * The owner, with a working connection: "Your website didn't load. Check
 * your connection and try again." The editor said that for every way its
 * first read could fail: a 500, a 503 while Supabase Auth was slow, a read
 * that ran out of time while the database was busy. Only one of those is
 * the connection.
 *
 *   offline   the browser says it has no connection: it opens again once
 *             the connection is back
 *   network   the request got no answer at all, the device online (a
 *             reset, a dropped mobile line): the one case where checking
 *             the connection is worth saying
 *   slow      an answer that took too long, a 502, 503 or 504, or a 429:
 *             Storelib is slow, and the editor tries again by itself
 *   server    a 500: something went wrong on our side
 *   signin, access, missing: 401, 403, 404, which a retry will not change
 *
 * `autoRetry` says whether the editor tries again on its own (with waits
 * from LOAD_AUTO_RETRY_MS) before the person has to press anything.
 */

export type LoadProblemKind = "offline" | "network" | "slow" | "server" | "signin" | "access" | "missing"

export interface LoadProblem {
  kind: LoadProblemKind
  title: string
  body: string
  autoRetry: boolean
}

/** Waits before each automatic try once the first read has failed: about a minute in all, with jitter added by the caller. */
export const LOAD_AUTO_RETRY_MS = [3_000, 8_000, 15_000, 30_000] as const

/** What the failed read was: the status it answered with, or the error it threw. */
export interface LoadFailure {
  status?: number | null
  error?: unknown
  /** navigator.onLine, read when the read failed. */
  online: boolean
}

function isTimeout(error: unknown): boolean {
  const e = error as { name?: unknown; message?: unknown } | null
  const name = String(e?.name ?? "")
  return name === "LoadTimeout" || name === "TimeoutError" || /took longer than/i.test(String(e?.message ?? ""))
}

/** fetch rejects with a TypeError when no answer came back at all. */
function noAnswer(error: unknown): boolean {
  return error instanceof TypeError || String((error as { name?: unknown } | null)?.name ?? "") === "TypeError"
}

/** "the website answered 503" (the editor's own thrown words): the status in it. */
function statusIn(error: unknown): number | null {
  const m = /answered (\d{3})/.exec(String((error as { message?: unknown } | null)?.message ?? ""))
  return m ? Number(m[1]) : null
}

export function loadProblemKind(f: LoadFailure): LoadProblemKind {
  if (!f.online) return "offline"
  const status = typeof f.status === "number" ? f.status : statusIn(f.error)
  if (status === 401) return "signin"
  if (status === 403) return "access"
  if (status === 404) return "missing"
  if (status === 429 || status === 502 || status === 503 || status === 504) return "slow"
  if (status !== null && status >= 500) return "server"
  if (isTimeout(f.error)) return "slow"
  if (noAnswer(f.error)) return "network"
  /* A body that could not be read, a parse: the server's answer was wrong, not the connection. */
  return "server"
}

/** The words over the canvas, and whether the editor keeps trying by itself. `retrying`: another automatic try is on its way. */
export function explainLoadProblem(f: LoadFailure, retrying: boolean): LoadProblem {
  const kind = loadProblemKind(f)
  switch (kind) {
    case "offline":
      return { kind, autoRetry: true, title: tt("You're offline"), body: tt("Your website opens again when you're back online.") }
    case "network":
      return {
        kind,
        autoRetry: true,
        title: tt("Couldn't reach Storelib"),
        body: retrying ? tt("Trying again on its own. If this keeps happening, check your connection.") : tt("Check your connection and try again."),
      }
    case "slow":
      return {
        kind,
        autoRetry: true,
        title: tt("Storelib is slow to answer"),
        body: retrying ? tt("Your website is safe. Trying again on its own.") : tt("Your website is safe. Try again in a moment."),
      }
    case "signin":
      return { kind, autoRetry: false, title: tt("You're signed out"), body: tt("Sign in again to open this website.") }
    case "access":
      return { kind, autoRetry: false, title: tt("No access to this website"), body: tt("Switch to the account that owns it.") }
    case "missing":
      return { kind, autoRetry: false, title: tt("This website wasn't found"), body: tt("It may have been deleted. Go back to your websites.") }
    default:
      return {
        kind,
        autoRetry: true,
        title: tt("Your website didn't load"),
        body: retrying ? tt("Something went wrong on our side. Trying again on its own.") : tt("Something went wrong on our side. Try again in a moment."),
      }
  }
}
