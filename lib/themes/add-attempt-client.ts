/**
 * ===========================================================================
 *  THE BROWSER'S HALF OF ONE PRESS, ONE WEBSITE (round 27)
 * ===========================================================================
 * Each theme's press carries a key (./add-attempt.ts), kept for that theme
 * until an answer says yes or no: a retry after a lost answer (no answer at
 * all, or the server's 5xx) sends the SAME key, so the server answers with
 * the website the first press made instead of making a second one. A press
 * that got no answer at all is sent again once by itself, a moment later.
 */
const keys = new Map<string, string>()

function newKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
}

/** The key for this theme's press: the one still waiting for an answer, or a new one. */
export function addAttemptKey(slug: string): string {
  let k = keys.get(slug)
  if (!k) keys.set(slug, (k = newKey()))
  return k
}

/** The answer said yes or no: the next press is a new press. */
export function settleAddAttempt(slug: string): void {
  keys.delete(slug)
}

/** How long before a press with no answer at all is sent again, once. */
export const ADD_RESEND_MS = 1500

type Fetch = (url: string, init: RequestInit) => Promise<Response>

/**
 * POST /api/themes/marketplace/add with the theme's key. No answer at all
 * (the connection dropped): sent again once with the same key. A yes or a
 * refusal (any answer under 500) settles the key; a 5xx keeps it for the
 * next press.
 */
export async function postAddTheme(slug: string, fetchImpl: Fetch = (u, i) => fetch(u, i), wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))): Promise<Response> {
  const key = addAttemptKey(slug)
  const send = () => fetchImpl("/api/themes/marketplace/add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, key }) })
  let res: Response
  try {
    res = await send()
  } catch {
    await wait(ADD_RESEND_MS)
    res = await send()
  }
  if (res.status < 500) settleAddAttempt(slug)
  return res
}
