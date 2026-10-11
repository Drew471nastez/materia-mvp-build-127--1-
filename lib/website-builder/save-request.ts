import { fetchWithin } from "./load-guard"

/**
 * An editor save, tried again when the server could not be reached.
 *
 * A save that meets a gateway that is momentarily down (502, 503, 504) or a
 * connection that drops is tried twice more, a little later each time,
 * before anybody is told. Every other answer is the answer: a 400 or a 413
 * says what is wrong with the save itself, and sending it again changes
 * nothing.
 */
const AGAIN = new Set([502, 503, 504])
/** How long one try may take before it counts as a dropped connection. A save is the same body each time, so a second try changes nothing the first one did. */
const ATTEMPT_MS = 20_000

export async function putJsonWithRetry(url: string, body: unknown, tries = 3): Promise<Response> {
  const text = JSON.stringify(body)
  for (let attempt = 1; ; attempt++) {
    try {
      /* Each try ends: a request that hangs is a dropped connection, tried again like one (./load-guard). */
      const res = await fetchWithin(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: text }, ATTEMPT_MS)
      if (!AGAIN.has(res.status) || attempt >= tries) return res
    } catch (e) {
      if (attempt >= tries) throw e
    }
    await new Promise((r) => setTimeout(r, 600 * attempt))
  }
}
