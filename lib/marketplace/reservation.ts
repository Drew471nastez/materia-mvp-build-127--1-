import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * ===========================================================================
 *  ONE BUYER AT A TIME
 * ===========================================================================
 *
 * The guard that stops a listing being sold twice reads the orders table: is
 * there already a completed order for this item? That closes the ordinary
 * case completely — once one sale lands, the listing is marked sold and
 * disappears from every surface.
 *
 * It cannot close the narrow one. Two people pressing pay in the same second
 * both read "no completed order", because neither order exists yet. Both cards
 * are charged, one of them gets a refund and an apology, and somebody's
 * afternoon is ruined over a jumper.
 *
 * A read-then-write can never fix that. Something has to make Postgres pick,
 * and a primary key is the cheapest thing that does: `product_reservations`
 * holds at most one row per listing, and claiming it is a single
 * INSERT … ON CONFLICT. Of two requests arriving together, exactly one comes
 * back holding it.
 *
 * ---------------------------------------------------------------------------
 * IT EXPIRES ON ITS OWN
 * ---------------------------------------------------------------------------
 * Fifteen minutes, checked by the claim itself rather than by a sweeper — an
 * expired reservation is simply taken by the next person who asks. So an
 * abandoned checkout costs the next buyer a quarter of an hour at worst, and
 * costs the platform no cron job at all.
 *
 * ---------------------------------------------------------------------------
 * A MISSING MIGRATION MUST NOT STOP SALES
 * ---------------------------------------------------------------------------
 * Deploys are live the moment they build and the SQL is run by hand afterwards,
 * so there is always a window where this code is ahead of the schema. In that
 * window `claim` answers TRUE — carry on — and the race stays exactly as open
 * as it is today. The alternative, failing closed, would mean a deploy that
 * silently stops the platform from selling anything until somebody notices.
 */

/** Long enough to enter a card and clear 3-D Secure; short enough that an
 *  abandoned checkout does not hold a listing hostage for the afternoon. */
export const RESERVATION_MINUTES = 15

function isMissingFunction(message?: string | null): boolean {
  const m = (message ?? "").toLowerCase()
  return (
    m.includes("could not find the function") ||
    m.includes("does not exist") ||
    m.includes("schema cache")
  )
}

let warned = false
function warnOnce(what: string) {
  if (warned) return
  warned = true
  console.error(
    `[reservation] ${what} — two buyers reaching pay together can still both be charged. ` +
      "Run supabase/sql/RUN_RESERVATIONS.sql",
  )
}

/**
 * Take this listing for this buyer, or find out somebody else has it.
 *
 * @returns true when the caller holds it — including when the mechanism is not
 *          installed, because a missing migration must not stop sales.
 */
export async function claimReservation(
  admin: SupabaseClient,
  opts: { productId: string; buyerKey: string; paymentIntentId?: string | null },
): Promise<boolean> {
  if (!opts.productId || !opts.buyerKey) return true
  try {
    const { data, error } = await admin.rpc("claim_product_reservation", {
      p_product_id: opts.productId,
      p_buyer_key: opts.buyerKey,
      p_intent: opts.paymentIntentId ?? null,
      p_minutes: RESERVATION_MINUTES,
    })
    if (error) {
      if (isMissingFunction(error.message)) warnOnce("claim_product_reservation is missing")
      else console.error("[reservation] claim failed:", error.code ?? error.message)
      // An unknown database fault is not evidence that somebody else holds it.
      return true
    }
    // The function returns true on success and NOTHING when the ON CONFLICT
    // guard refuses — so an empty answer is somebody else's claim, not an error.
    return data === true
  } catch {
    return true
  }
}

/**
 * Give it back.
 *
 * Called when the sale completes — the listing is marked sold, so the row is
 * only clutter — and when a payment fails, so the next person does not wait out
 * the full fifteen minutes for an attempt that is already over.
 *
 * Never throws and never reports: releasing is tidying, and failing to tidy
 * costs a quarter of an hour, not a sale.
 */
export async function releaseReservation(
  admin: SupabaseClient,
  opts: { productId: string; buyerKey: string },
): Promise<void> {
  if (!opts.productId || !opts.buyerKey) return
  try {
    await admin.rpc("release_product_reservation", {
      p_product_id: opts.productId,
      p_buyer_key: opts.buyerKey,
    })
  } catch {
    /* expires on its own */
  }
}

/**
 * Who is holding this, from the platform's point of view.
 *
 * A signed-in buyer is their user id. A guest has no durable identity, so the
 * email they typed is used — which is stable across a refresh of the same
 * checkout, and is the same thing the rest of the guest flow keys on.
 */
export function buyerKeyFor(userId: string | null | undefined, email: string | null | undefined): string {
  return userId || `guest:${String(email ?? "").trim().toLowerCase()}`
}
