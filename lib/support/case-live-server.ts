import "server-only"

/**
 * ===========================================================================
 *  A CASE, LIVE: EVERY SIDE SEES A NEW MESSAGE WITHOUT A RELOAD (round 27)
 * ===========================================================================
 * The buyer's page (app/order-help), the store's thread (Support and the
 * order page) and Storelib's (Resolution center) each read a case once and
 * never again, so a store's answer reached the buyer only by email or after
 * a reload. Now every write to a case (a message, Ask Storelib, resolved)
 * is told to whoever has that case open, the way the community tells a new
 * comment (lib/communities/server/realtime.ts):
 *
 *   a Supabase Realtime BROADCAST, sent by the server through Realtime's
 *   REST endpoint with the service role, carrying no words at all: only
 *   that the case changed. Each open page then reads what is new through
 *   its own gated route (the buyer's private link, the store's session,
 *   the admin cookie), so a broadcast can never show anybody anything.
 *
 * THE CHANNEL NAME IS A SECRET PER CASE: an HMAC of the case id under the
 * service role key, handed only to someone who already opened the case
 * through its gate. No SQL, no table published.
 *
 * Without realtime (no key, Realtime down, a network that blocks sockets)
 * the pages still poll with backoff (lib/support/use-case-live.ts). Never
 * throws; a broadcast is a courtesy capped at a short timeout.
 */
import { createHmac } from "node:crypto"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SEND_TIMEOUT_MS = 2000

/** The case's channel name, or null when the server has no key to make one with (the pages then poll). */
export function caseTopic(caseId: string): string | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key || !UUID.test(caseId)) return null
  const mac = createHmac("sha256", key).update(`storelib:order-case-live:v1:${caseId.toLowerCase()}`).digest("hex").slice(0, 32)
  return `order-case:${mac}`
}

/** Tells the pages with this case open that it changed. True when Realtime took it. */
export async function announceCase(caseId: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const topic = caseTopic(caseId)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!topic || !url || !key) return false
  try {
    const res = await fetcher(`${url.replace(/\/+$/, "")}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ topic, event: "case", payload: { at: Date.now() }, private: false }] }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    })
    if (!res.ok) console.error(`[cases] live broadcast refused: ${res.status}`)
    return res.ok
  } catch (e) {
    console.error(`[cases] live broadcast failed: ${e instanceof Error ? e.message : String(e)}`)
    return false
  }
}
