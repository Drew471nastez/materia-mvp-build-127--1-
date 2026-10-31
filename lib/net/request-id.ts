/**
 * ===========================================================================
 *  ONE ID PER REQUEST, IN EVERY LOG LINE ABOUT IT
 * ===========================================================================
 * The proxy gives every request an id (`x-request-id`), forwards it to the
 * page or route it runs, and sends it back on the response, so a log line
 * from proxy.ts, a timeout in a layout and the response a person's browser
 * got can be put side by side. On Vercel it is the platform's own
 * `x-vercel-id`, which is already on every line of Vercel's request log.
 *
 * An id a client sent is kept only when it looks like one (letters, digits,
 * `-`, `_`, `:` and `.`, 8 to 100 of them): a header is typed by anybody,
 * and a log line must not be.
 *
 * Pure, no imports: safe in the proxy, a route and a test.
 */
export const REQUEST_ID_HEADER = "x-request-id"

const SHAPE = /^[A-Za-z0-9._:-]{8,100}$/

export function cleanRequestId(v: string | null | undefined): string | null {
  return v && SHAPE.test(v) ? v : null
}

/**
 * The id the proxy gave this request, or Vercel's own, or null: never a new
 * one. For a log line or an error row about a request already in flight,
 * where a made-up id would match nothing. Takes a Headers or the plain object
 * Next hands to onRequestError.
 */
export function requestIdFrom(headers: { get(name: string): string | null } | Record<string, string | string[] | undefined> | null | undefined): string | null {
  if (!headers) return null
  const read = (name: string): string | null => {
    if (typeof (headers as { get?: unknown }).get === "function") return (headers as { get(name: string): string | null }).get(name)
    const v = (headers as Record<string, string | string[] | undefined>)[name]
    return Array.isArray(v) ? v[0] ?? null : v ?? null
  }
  return cleanRequestId(read(REQUEST_ID_HEADER)) ?? cleanRequestId(read("x-vercel-id"))
}

export function requestIdOf(headers: { get(name: string): string | null }): string {
  return (
    cleanRequestId(headers.get(REQUEST_ID_HEADER)) ??
    cleanRequestId(headers.get("x-vercel-id")) ??
    (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)
  )
}
