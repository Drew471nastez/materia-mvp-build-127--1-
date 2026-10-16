/**
 * One order row per line of a payment (run-now part 190,
 * orders_stripe_session_line_key on (stripe_session_id, receipt_token)).
 * A second webhook delivery that races the first gets 23505 on its insert;
 * these read the first one's row back so that delivery answers "already
 * processed" instead of an error Stripe would retry.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** Postgres unique_violation, as PostgREST reports it. */
export function isUniqueViolation(error: { code?: string | null } | null | undefined): boolean {
  return !!error && error.code === "23505"
}

/** The order already written for this payment line, or null when there is none to read. */
export async function existingSessionOrder(db: Db, sessionId: string, receiptToken: string | null): Promise<{ id: string } | null> {
  let q = db.from("orders").select("id").eq("stripe_session_id", sessionId)
  if (receiptToken) q = q.eq("receipt_token", receiptToken)
  const { data, error } = await q.limit(1)
  if (error || !Array.isArray(data) || data.length === 0) return null
  return typeof data[0]?.id === "string" ? { id: data[0].id } : null
}
