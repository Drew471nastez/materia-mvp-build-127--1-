/**
 * ===========================================================================
 *  "SUPABASE DID NOT ANSWER" IS NOT "THERE IS NO ROW"
 * ===========================================================================
 * supabase-js never throws: a read that timed out, a dropped connection and a
 * 503 all come back as `{ data: null, error }`, and code that reads only
 * `data` sees null, which is also what "this person has no creator row"
 * looks like. The /app layout did exactly that: a creator read that failed
 * sent a seller to /sell, a profile read that failed sent them to
 * /signup/verify, and Settings sent them to /onboarding. With deadlines on
 * every request (lib/net/deadline.ts) a hung read now fails in seconds
 * instead of holding the function, which makes telling these apart matter
 * more, not less.
 *
 * `ServiceUnavailable` is the thrown form of "we could not tell", with the
 * kind kept apart so a log and a screen can say something true:
 *
 *   timeout   asked, and no answer within the deadline
 *   network   the request never completed (reset, DNS, TLS)
 *   upstream  Supabase answered 5xx (or 429)
 *   query     Supabase answered with an error about the query itself (a
 *             column that does not exist, a policy): a bug, not a blip
 *
 * Browser safe, no imports. Nothing here holds a token, a row or an address
 * with a query string: `where` is a label chosen by the caller.
 */

export type ServiceFailure = "timeout" | "network" | "upstream" | "query"

export class ServiceUnavailable extends Error {
  readonly kind: ServiceFailure
  readonly where: string
  readonly status: number | null
  readonly code: string | null
  constructor(where: string, kind: ServiceFailure, { status = null, code = null }: { status?: number | null; code?: string | null } = {}) {
    super(`${where}: ${kind}${status ? ` ${status}` : ""}${code ? ` ${code}` : ""}`)
    this.name = "ServiceUnavailable"
    this.kind = kind
    this.where = where
    this.status = status
    this.code = code
  }
  /** A blip that a retry may fix, as against a query that will fail again. */
  get transient(): boolean {
    return this.kind !== "query"
  }
}

export function isServiceUnavailable(e: unknown): e is ServiceUnavailable {
  return !!e && typeof e === "object" && (e as { name?: unknown }).name === "ServiceUnavailable"
}

/**
 * What a PostgREST or auth error was. postgrest-js turns a fetch that threw
 * into `{ message: "<name>: <message>", code: "" }` with status 0.
 */
export function classifyServiceError(error: unknown, status?: number | null): ServiceFailure {
  const e = (error ?? {}) as { message?: unknown; name?: unknown; code?: unknown; status?: unknown }
  const text = `${String(e.name ?? "")} ${String(e.message ?? "")}`.toLowerCase()
  const s = typeof status === "number" ? status : typeof e.status === "number" ? e.status : null
  if (/deadlineexceeded|timeouterror|aborterror|timed out|took longer|headerstimeout|timeout/.test(text)) return "timeout"
  if (/fetch failed|network|econnreset|enotfound|eai_again|socket|load failed|failed to fetch/.test(text)) return "network"
  if (s !== null && (s >= 500 || s === 429)) return "upstream"
  if (s === 0) return "network"
  return "query"
}

/**
 * A supabase-js result's error, thrown as ServiceUnavailable; the data
 * otherwise. `maybeSingle()` with no row is `{ data: null, error: null }`
 * and comes back as null, as before.
 */
export function dataOrThrow<T>(where: string, result: { data: T; error: unknown; status?: number }): T {
  if (!result.error) return result.data
  const err = result.error as { code?: unknown }
  throw new ServiceUnavailable(where, classifyServiceError(result.error, result.status), {
    status: typeof result.status === "number" ? result.status : null,
    code: typeof err?.code === "string" && err.code ? err.code : null,
  })
}
