/**
 * ===========================================================================
 *  EACH WEBHOOK DELIVERY ONCE
 * ===========================================================================
 * GitHub names every delivery (X-GitHub-Delivery). A delivery that arrives a
 * second time, a redelivery or an old one replayed with its valid signature,
 * is answered and ignored: replaying an old push must not put that commit's
 * files back into the site as drafts. The ids are kept a day, in the server
 * only table github_webhook_deliveries (SQL part 132), which is enough: the
 * other half of the guard is applyPush refusing a head older than the one
 * already applied (lib/github-sync/sync.ts), which holds for any age.
 *
 * Fails open when the table is not there yet: the push is still held to the
 * older-head check and to "nothing changes when the bytes are the same".
 */

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** How long a delivery id is remembered. */
export const DELIVERY_TTL_MS = 24 * 60 * 60 * 1000

/** A delivery id as GitHub writes one (a GUID), and nothing else, before it touches the database. */
export function validDeliveryId(id: string | null): id is string {
  return typeof id === "string" && /^[A-Za-z0-9-]{8,80}$/.test(id)
}

/**
 * True when this delivery was seen in the last day, so it must be ignored.
 * Records it otherwise, and clears ids older than a day.
 */
export async function seenDelivery(db: Db, id: string, now = Date.now()): Promise<boolean> {
  try {
    const cutoff = new Date(now - DELIVERY_TTL_MS).toISOString()
    const { data: prior, error: readError } = await db
      .from("github_webhook_deliveries")
      .select("delivery_id, received_at")
      .eq("delivery_id", id)
      .maybeSingle()
    if (readError) return false
    if (prior && String(prior.received_at) >= cutoff) return true
    const row = { delivery_id: id, received_at: new Date(now).toISOString() }
    const ins = prior
      ? await db.from("github_webhook_deliveries").update({ received_at: row.received_at }).eq("delivery_id", id)
      : await db.from("github_webhook_deliveries").insert(row)
    /* Two copies at once: the second one's insert meets the first's row. */
    if (ins?.error && (ins.error.code === "23505" || /duplicate key/i.test(ins.error.message ?? ""))) return true
    await db.from("github_webhook_deliveries").delete().lt("received_at", cutoff)
    return false
  } catch {
    return false
  }
}
