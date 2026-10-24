/**
 * ===========================================================================
 *  A CORRECTED ADDRESS REACHES THE ORDER THAT SHIPS
 * ===========================================================================
 * An order that ships has its buyer's address twice: on each order row, and
 * on its checkout (commerce_checkouts.buyer_email), which is where every one
 * of its emails is sent from: the confirmation, shipped, delivered, a refund
 * and a return (lib/physical/jobs-server). Changing the address, from the
 * Orders page (app/api/app/orders/[id]/email) or the buyer's receipt
 * (app/api/receipt/update-email), wrote the rows only, so the buyer who had
 * mistyped it never heard that their parcel had left. The checkouts of the
 * rows moved follow now, each only when it is this creator's.
 *
 * Pure apart from the one write, so tests/orders-ad2.test.ts runs it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/** The checkouts of these rows take the address. Answers how many were asked to; never throws. */
export async function moveCheckoutEmail(db: Db, rows: Array<{ checkout_id?: string | null }>, creatorId: string, email: string): Promise<number> {
  const ids = [...new Set(rows.map((r) => r.checkout_id).filter((id): id is string => typeof id === "string" && id.length > 0))]
  if (ids.length === 0 || !creatorId || !email) return 0
  try {
    const { error } = await db.from("commerce_checkouts").update({ buyer_email: email, updated_at: new Date().toISOString() }).in("id", ids).eq("creator_id", creatorId)
    if (error) {
      console.error("[orders] checkout email not moved:", error.code ?? error.message)
      return 0
    }
    return ids.length
  } catch (e) {
    console.error("[orders] checkout email not moved:", e instanceof Error ? e.message : e)
    return 0
  }
}
