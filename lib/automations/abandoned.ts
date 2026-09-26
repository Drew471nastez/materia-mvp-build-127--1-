/**
 * ===========================================================================
 *  A CHECKOUT THAT REACHED PAY AND NEVER BECAME AN ORDER
 * ===========================================================================
 * The single product checkout makes its PaymentIntent when the buyer presses
 * Pay, with their name, address and whether they ticked "Email me news and
 * offers" (app/api/checkout/stripe-session). That moment is written down
 * here, in `checkout_starts`, one row per PaymentIntent. A card declined, a
 * bank's check abandoned, a tab closed: the row stays with no order.
 *
 * THE SWEEP, from the hourly cron. A start older than an hour and younger
 * than three days, not yet handled, is decided once:
 *
 *   bought         an order from this address with this creator since it
 *                  started (a second try with a new card is a new start and
 *                  a real order): nothing to remind
 *   unsubscribed   the address is off the creator's list: nothing
 *   no_consent     they did not tick the box and are not on the list: a
 *                  reminder is marketing, so nothing
 *   entered        the creator's checkout reminders are entered, once per
 *                  start, and at most once a week per person (the flow's
 *                  entry rule)
 *
 * ONCE. The decision is written with UPDATE ... WHERE handled_at IS NULL, so
 * two sweeps at once settle each start once, and only the one that settled
 * it enters the flows. A start whose entry then fails is put back.
 *
 * The reminder itself ends the moment they buy (engine.ts processJob and
 * enroll), whichever step it is on.
 *
 * Before supabase/sql/RUN_CHECKOUT_CONTACTS.sql runs there is no table:
 * nothing is recorded, the sweep reports itself unavailable, and a checkout
 * reminder flow never starts. The builder says so.
 */

import { enroll, type Store } from "./engine"
import type { ContactOutcome } from "@/lib/contacts/checkout-contact"
import { joinedTheList } from "@/lib/contacts/checkout-welcome"

export interface CheckoutStart {
  id: string
  creator_id: string
  product_id: string | null
  variant_id: string | null
  product_title: string | null
  email: string
  first_name: string | null
  email_opt_in: boolean
  source_detail: unknown
  created_at: string
}

export type StartOutcome = "bought" | "unsubscribed" | "no_consent" | "entered"

export interface StartsStore {
  /** Unhandled starts in the window, oldest first. Null when the table is not there yet. */
  due(olderThanIso: string, newerThanIso: string, limit: number): Promise<CheckoutStart[] | null>
  /** Marks it handled, only if nobody has. True when this call did. */
  settle(id: string, outcome: StartOutcome): Promise<boolean>
  /** Puts it back, for a sweep that could not finish it. */
  release(id: string): Promise<void>
  /**
   * The tick, as a subscribed contact with an unsubscribe token
   * (lib/contacts/checkout-contact). The checkout route writes it when Pay is
   * pressed; this makes sure, because a reminder is never sent without its
   * way out. Says what the write did (checkout-contact's outcome), so a
   * tick that only this puts on the list starts the welcome too.
   */
  recordConsent(start: CheckoutStart): Promise<ContactOutcome>
}

/** How long a checkout is left alone before it counts as left. */
export const ABANDONED_AFTER_MS = 60 * 60_000
/** Older than this is not reminded of at all. */
export const ABANDONED_LOOK_BACK_MS = 3 * 86_400_000

export interface SweepResult {
  available: boolean
  looked: number
  outcomes: Record<StartOutcome | "raced" | "failed", number>
  entered: number
}

export async function decideStart(store: Store, s: CheckoutStart): Promise<StartOutcome> {
  if (await store.purchasedSince(s.creator_id, s.email, s.created_at)) return "bought"
  const standing = await store.standing(s.creator_id, s.email)
  if (standing.suppressed) return "unsubscribed"
  if (!s.email_opt_in && standing.subscribed !== true) return "no_consent"
  return "entered"
}

export async function sweepAbandoned(input: { store: Store; starts: StartsStore; now: number; limit?: number }): Promise<SweepResult> {
  const { store, starts, now } = input
  const out: SweepResult = { available: true, looked: 0, entered: 0, outcomes: { bought: 0, unsubscribed: 0, no_consent: 0, entered: 0, raced: 0, failed: 0 } }
  const due = await starts.due(new Date(now - ABANDONED_AFTER_MS).toISOString(), new Date(now - ABANDONED_LOOK_BACK_MS).toISOString(), input.limit ?? 50)
  if (due === null) return { ...out, available: false }
  out.looked = due.length
  for (const s of due) {
    try {
      const outcome = await decideStart(store, s)
      if (!(await starts.settle(s.id, outcome))) {
        out.outcomes.raced++
        continue
      }
      out.outcomes[outcome]++
      if (outcome !== "entered") continue
      if (s.email_opt_in) {
        /*
          Normally the checkout route wrote the tick when Pay was pressed, and
          started the welcome then (lib/contacts/checkout-welcome), so this
          finds them subscribed and starts nothing. If that write never
          happened, this one is what puts them on the list, and the welcome
          starts here instead: the same flows, entered once per person by the
          engine's own key whichever way in came first.
        */
        const joined = await starts.recordConsent(s)
        if (joinedTheList(joined)) {
          await enroll(store, { triggerType: "new_subscriber", creatorId: s.creator_id, email: s.email, name: s.first_name, optedIn: true, source: s.source_detail ?? null }, now)
        }
      }
      const r = await enroll(
        store,
        {
          triggerType: "abandoned_checkout",
          creatorId: s.creator_id,
          email: s.email,
          name: s.first_name,
          productId: s.product_id,
          productTitle: s.product_title,
          variantId: s.variant_id,
          eventId: `checkout:${s.id}`,
          startedAt: s.created_at,
          optedIn: s.email_opt_in === true,
          source: s.source_detail ?? null,
        },
        now,
      )
      if (!r.available) {
        /* The engine's own tables are missing: keep it for when they are. */
        await starts.release(s.id)
        return { ...out, available: false }
      }
      out.entered += r.enrolled
    } catch {
      out.outcomes.failed++
      await starts.release(s.id).catch(() => undefined)
    }
  }
  return out
}

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface StartInput {
  creatorId: string
  productId: string
  variantId?: string | null
  productTitle?: string | null
  email: string
  firstName?: string | null
  paymentIntentId: string
  optedIn: boolean
  source?: unknown
}

/**
 * Writes one start, once per PaymentIntent. Best effort and quiet: a missing
 * table (before the SQL) and a second write of the same PaymentIntent are
 * both expected. Never logs the address.
 */
export async function recordCheckoutStart(db: Db, s: StartInput): Promise<boolean> {
  const email = s.email.trim().toLowerCase()
  if (!s.creatorId || !s.productId || !/^pi_[A-Za-z0-9]+$/.test(s.paymentIntentId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false
  try {
    const { error } = await db.from("checkout_starts").insert({
      creator_id: s.creatorId,
      product_id: s.productId,
      variant_id: s.variantId || null,
      product_title: (s.productTitle ?? "").slice(0, 200) || null,
      email,
      first_name: (s.firstName ?? "").trim().slice(0, 60) || null,
      payment_intent_id: s.paymentIntentId,
      email_opt_in: s.optedIn === true,
      source_detail: s.source ?? null,
    })
    if (!error || error.code === "23505") return !error
    if (!/42P01|PGRST205|42703/.test(String(error.code ?? ""))) console.warn("[checkout] could not record the started checkout:", error.code)
    return false
  } catch {
    return false
  }
}
