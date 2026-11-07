/**
 * ===========================================================================
 *  EVERY FORMS AND LEADS REQUEST FROM THE BROWSER
 * ===========================================================================
 * Emails › Leads, the Forms list, the form builder, a block's form picker
 * and a chat button's pre-chat questions all ask the forms routes through
 * this one function, so they behave the same when something is wrong:
 *
 *   NOT SET UP  the forms tables are not there yet (SQL parts 372 and 375
 *               not run): the route says so (`missing: true` on a list,
 *               code "forms_missing" on anything else) and the caller gets
 *               `missing`, never an error to retry. Asking again can not
 *               help until the SQL runs.
 *   A BLIP      no answer, a timeout, or a 500, 502, 503 or 504: a read is
 *               asked once more after a short wait, and only once, so a
 *               spinner never waits on a loop.
 *   A TIMEOUT   every request gives up after TIMEOUT_MS, so nothing hangs.
 *
 * The answer is one flat object (data, error, missing), not a union, so it
 * reads the same in the push test runner, which compiles with strict off.
 */

export const TIMEOUT_MS = 12_000
export const RETRY_AFTER_MS = 700

export interface FormsAnswer<T> {
  /** The body, when the request worked. */
  data: T | null
  /** What went wrong, in words for the creator; null when it worked or the tables are missing. */
  error: string | null
  /** The forms tables are not there yet (parts 372 and 375). */
  missing: boolean
  /** The HTTP status, 0 when nothing answered. */
  status: number
}

const RETRYABLE = new Set([0, 500, 502, 503, 504])

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

/** A pause, for the one retry. Separate so a test can make it instant. */
export const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))

async function once<T>(url: string, init: RequestInit | undefined, fetcher: Fetcher, timeoutMs: number): Promise<FormsAnswer<T>> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null
  const outer = init?.signal
  const relay = () => controller?.abort()
  outer?.addEventListener("abort", relay)
  const timer = setTimeout(() => controller?.abort(), timeoutMs)
  try {
    const res = await fetcher(url, { cache: "no-store", ...init, signal: controller?.signal ?? outer ?? undefined })
    const body = (await res.json().catch(() => null)) as (T & { error?: string; code?: string; missing?: boolean }) | null
    if (body && (body.code === "forms_missing" || body.missing === true)) return { data: res.ok ? body : null, error: null, missing: true, status: res.status }
    if (!res.ok) return { data: null, error: (body && typeof body.error === "string" && body.error) || "", missing: false, status: res.status }
    return { data: body as T, error: null, missing: false, status: res.status }
  } catch {
    return { data: null, error: "", missing: false, status: 0 }
  } finally {
    clearTimeout(timer)
    outer?.removeEventListener("abort", relay)
  }
}

/**
 * Ask a forms or leads route. A GET (or `retry: true`) is asked a second
 * time after RETRY_AFTER_MS when the first answer was a blip; a write is
 * asked once, so it is never sent twice. `fallback` is the words when the
 * route gave none.
 */
export async function formsRequest<T>(
  url: string,
  init: RequestInit & { retry?: boolean; fallback?: string } = {},
  fetcher: Fetcher = (u, i) => fetch(u, i),
  timeoutMs = TIMEOUT_MS,
): Promise<FormsAnswer<T>> {
  const { retry, fallback, ...rest } = init
  const method = (rest.method || "GET").toUpperCase()
  const body = rest.body
  const req: RequestInit = { ...rest, headers: body && typeof body === "string" ? { "Content-Type": "application/json", ...(rest.headers as Record<string, string> | undefined) } : rest.headers }
  let answer = await once<T>(url, req, fetcher, timeoutMs)
  const again = retry ?? method === "GET"
  if (again && !answer.missing && answer.error !== null && RETRYABLE.has(answer.status) && !rest.signal?.aborted) {
    await wait(RETRY_AFTER_MS)
    if (!rest.signal?.aborted) answer = await once<T>(url, req, fetcher, timeoutMs)
  }
  if (answer.error === "") answer = { ...answer, error: answer.status === 0 ? "No answer from Storelib. Check your connection and try again." : fallback || "That did not work. Try again." }
  return answer
}
