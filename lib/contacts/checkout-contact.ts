/**
 * ===========================================================================
 *  EVERY CHECKOUT RECORDS ITS BUYER, AND ONLY A YES IS A YES
 * ===========================================================================
 * A creator's contacts are the `subscribers` table: one row per creator and
 * address, the Emails page's list. Checkouts wrote it five different ways
 * (the paid checkout, a basket, a free claim, a OnePage free download, the
 * older Stripe session) and two of them subscribed every buyer to marketing
 * whether they asked or not, and put back on the list somebody who had
 * unsubscribed. Every checkout now goes through here.
 *
 * WHAT IS RECORDED. The buyer's address (lower case), their name, the order
 * (`source_id`), `source` "checkout", and where it happened in
 * `source_detail`: the door, the website's address when it was one, where
 * the visit came from, and which product (lib/contacts/contact-source).
 *
 * WHAT THEY AGREED TO, which decides the status, from the evidence the
 * checkout actually has. Nothing new is assumed:
 *
 *   ticked   the unticked "Email me news and offers from <creator>" box on
 *            the checkout (app/checkout/checkout-client.tsx), sent as
 *            emailOptIn / the PaymentIntent's email_opt_in. A yes.
 *   notice   the OnePage free download, whose button carries "<creator> may
 *            send you updates. Unsubscribe any time." under it
 *            (components/onepage/public-onepage.tsx). The basis that page
 *            has always used; kept, not widened.
 *   none     anything else: a basket (Stripe's hosted page asks nothing), a
 *            box left unticked.
 *
 *   status         who they are                 who emails them
 *   subscribed     asked for news               campaigns and every automation
 *   customer       bought, did not ask          automations about their order
 *                                                (flow-model audienceOf "buyers"),
 *                                                never campaigns (those send
 *                                                to status "subscribed" only),
 *                                                never a flow that sells
 *   unsubscribed,  left, bounced, complained    nothing, and a checkout never
 *   bounced, ...                                 changes that, except an
 *                                                explicit tick after
 *                                                unsubscribing, which is a
 *                                                new yes
 *
 * A started checkout that reached Pay with the box ticked is a yes before
 * any payment, and is recorded as subscribed. One without the tick is not a
 * buyer and did not ask, so it is not a contact at all; the start itself is
 * kept for its reminder (lib/automations/abandoned.ts), which only goes to
 * people who ticked.
 *
 * ONCE, WHATEVER RETRIES. Stripe delivers a webhook more than once and the
 * browser reports the same payment too. The row is keyed by (creator_id,
 * email) with the address lower cased, which the table holds unique; two
 * writers racing both read no row, one insert wins, the other gets 23505 and
 * applies its change to the winner's row. Every change here is idempotent:
 * the same call twice leaves the same row.
 *
 * NEVER LOGGED. No address, no name: a code and the step, nothing else.
 */

import { v4 as uuidv4 } from "uuid"
import { recordContactSource, type ContactSource } from "./contact-source"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export type ConsentBasis = "ticked" | "notice" | "none"

export interface CheckoutContactInput {
  creatorId: string
  email: string
  name?: string | null
  orderId?: string | null
  basis: ConsentBasis
  /** False for a checkout that reached Pay and has no order (yet). */
  bought: boolean
  source?: ContactSource | null
}

export interface ExistingContact {
  id: string
  status: string | null
  is_active: boolean | null
}

/** Statuses a checkout never overrides. */
const SUPPRESSED = new Set(["unsubscribed", "bounced", "complained", "cleaned"])
const HARD = new Set(["bounced", "complained", "cleaned"])

export const CONSENT_TEXT: Record<ConsentBasis, string> = {
  ticked: "Ticked \"Email me news and offers\" at checkout",
  notice: "Took a free download under the notice that the seller may send updates",
  none: "Bought at checkout. Did not ask for news and offers",
}

export type ContactPlan =
  | { kind: "insert"; row: Record<string, unknown> }
  | { kind: "update"; patch: Record<string, unknown> }
  | { kind: "none"; why: string }

/**
 * What to do with the row, from what is there and what this checkout says.
 * Pure: the decision table above, and nothing else.
 */
export function planContact(existing: ExistingContact | null, input: CheckoutContactInput, nowIso: string): ContactPlan {
  const asks = input.basis !== "none"
  if (!existing) {
    if (!input.bought && !asks) return { kind: "none", why: "not a buyer and did not ask" }
    const name = (input.name ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || null
    return {
      kind: "insert",
      row: {
        email: input.email,
        name,
        source: "checkout",
        source_id: input.orderId ?? null,
        creator_id: input.creatorId,
        status: asks ? "subscribed" : "customer",
        /* A customer is an active contact (their order's emails reach them);
           campaigns read status, never this. */
        is_active: true,
        subscribed_at: nowIso,
        consent_text: CONSENT_TEXT[input.basis],
        consent_timestamp: asks ? nowIso : null,
        unsubscribe_token: uuidv4(),
      },
    }
  }
  const status = existing.status ?? "subscribed"
  if (HARD.has(status)) return { kind: "none", why: "address is suppressed" }
  if (status === "subscribed" && existing.is_active !== false) return { kind: "none", why: "already subscribed" }
  if (SUPPRESSED.has(status) || existing.is_active === false) {
    /* Only a new, explicit tick puts somebody back on the list. */
    if (input.basis !== "ticked") return { kind: "none", why: "unsubscribed" }
    return { kind: "update", patch: { status: "subscribed", is_active: true, subscribed_at: nowIso, unsubscribed_at: null, consent_text: CONSENT_TEXT.ticked, consent_timestamp: nowIso } }
  }
  /* A customer (or any other status a checkout does not know) who now asks. */
  if (asks && status !== "subscribed") {
    return { kind: "update", patch: { status: "subscribed", is_active: true, subscribed_at: nowIso, consent_text: CONSENT_TEXT[input.basis], consent_timestamp: nowIso } }
  }
  /* Somebody who only wrote through a contact form (lib/site-contact) and has
     now bought is a customer: their order's emails are theirs to get. */
  if (status === "wrote" && input.bought) {
    return { kind: "update", patch: { status: "customer", is_active: true, consent_text: CONSENT_TEXT.none } }
  }
  return { kind: "none", why: "nothing new" }
}

export type ContactOutcome = "subscribed" | "customer" | "resubscribed" | "unchanged" | "skipped" | "unavailable" | "failed"

async function readContact(db: Db, creatorId: string, email: string): Promise<{ row: ExistingContact | null; error: { code?: string } | null }> {
  const { data, error } = await db.from("subscribers").select("id, status, is_active").eq("creator_id", creatorId).eq("email", email).maybeSingle()
  return { row: (data as ExistingContact | null) ?? null, error: error ?? null }
}

function note(what: string, code: string | undefined) {
  console.warn(`[contacts] checkout contact: ${what} (${code || "error"})`)
}

/**
 * Records the checkout's buyer as a contact of the creator, as planContact
 * says. Never throws; the order is already safe and this is not a reason to
 * fail it. `unavailable` means the database refused the "customer" status
 * because supabase/sql/RUN_CHECKOUT_CONTACTS.sql has not run: such a buyer
 * is recorded as a customer (supabase customers table) and as an order, as
 * before, and joins the contacts once it has.
 */
export async function recordCheckoutContact(db: Db, input: CheckoutContactInput): Promise<ContactOutcome> {
  const outcome = await recordContactOnce(db, input)
  /* A new or changed contact reaches the store's connected email platforms within the minute (lib/integrations/marketing): a checkout, a community join, a free claim. */
  if (outcome === "subscribed" || outcome === "resubscribed" || outcome === "customer") await syncPlatformsSoon(db, input.creatorId)
  return outcome
}

/** Looked up when called: the marketing sync imports the order engine, which imports this file. */
export async function syncPlatformsSoon(db: Db, creatorId: string | null | undefined): Promise<void> {
  if (!creatorId) return
  try {
    const { marketingSubscriberChanged } = await import("@/lib/integrations/marketing/sync-server")
    await marketingSubscriberChanged(db, creatorId)
  } catch {
    /* The quarter hour sync carries it. */
  }
}

async function recordContactOnce(db: Db, input: CheckoutContactInput): Promise<ContactOutcome> {
  const email = (input.email ?? "").trim().toLowerCase()
  if (!input.creatorId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "skipped"
  const clean = { ...input, email }
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const now = new Date().toISOString()
      const { row, error: readError } = await readContact(db, input.creatorId, email)
      if (readError) {
        note("could not read", readError.code)
        return "failed"
      }
      const plan = planContact(row, clean, now)
      if (plan.kind === "none") {
        if (row && input.source) await recordContactSource(db, input.creatorId, email, input.source)
        return "unchanged"
      }
      if (plan.kind === "insert") {
        const { error } = await db.from("subscribers").insert(plan.row)
        if (error?.code === "23505") continue /* Another writer made it a moment ago: plan again against theirs. */
        if (error?.code === "23514") {
          note("the customer status is not allowed yet; run RUN_CHECKOUT_CONTACTS.sql", error.code)
          return "unavailable"
        }
        if (error) {
          note("could not insert", error.code)
          return "failed"
        }
        if (input.source) await recordContactSource(db, input.creatorId, email, input.source)
        return plan.row.status === "subscribed" ? "subscribed" : "customer"
      }
      const { error } = await db.from("subscribers").update(plan.patch).eq("id", row!.id)
      if (error) {
        note("could not update", error.code)
        return "failed"
      }
      if (input.source) await recordContactSource(db, input.creatorId, email, input.source)
      if (plan.patch.status === "customer") return "customer"
      return row!.status === "unsubscribed" || row!.is_active === false ? "resubscribed" : "subscribed"
    }
    return "unchanged"
  } catch (error) {
    note("threw", (error as Error)?.name)
    return "failed"
  }
}
