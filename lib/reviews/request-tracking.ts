/**
 * ===========================================================================
 *  STORELIB REVIEWS: WAS THE REQUEST DELIVERED, OPENED, PRESSED?
 * ===========================================================================
 * Each review request email carries its request's id as a provider variable
 * (requests-server sendAsk: `review_request_id`). The provider's webhook
 * (app/api/webhooks/mailgun, signature checked, each event once) hands it
 * back with "delivered", "opened" and "clicked", and the first of each is
 * written on the request (part 215), for the Requests tab and the funnel in
 * Analytics. Nothing else is read from the event, and a request id that is
 * not a uuid is ignored. Before part 215 the update finds no column and
 * nothing happens.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COLUMN: Record<string, "delivered_at" | "opened_at" | "clicked_at"> = { delivered: "delivered_at", opened: "opened_at", clicked: "clicked_at" }

export function reviewRequestEvent(eventData: unknown): { id: string; column: "delivered_at" | "opened_at" | "clicked_at"; at: string } | null {
  if (!eventData || typeof eventData !== "object") return null
  const e = eventData as Record<string, unknown>
  const column = COLUMN[String(e.event ?? "")]
  const vars = (e["user-variables"] ?? {}) as Record<string, unknown>
  const id = typeof vars.review_request_id === "string" ? vars.review_request_id : ""
  if (!column || !UUID.test(id)) return null
  const ts = typeof e.timestamp === "number" ? e.timestamp : Number(e.timestamp)
  const at = Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : new Date().toISOString()
  return { id: id.toLowerCase(), column, at }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recordReviewRequestEvent(db: { from: (t: string) => any }, eventData: unknown): Promise<boolean> {
  const ev = reviewRequestEvent(eventData)
  if (!ev) return false
  try {
    const { error } = await db.from("review_requests").update({ [ev.column]: ev.at }).eq("id", ev.id).is(ev.column, null)
    return !error
  } catch {
    return false
  }
}
