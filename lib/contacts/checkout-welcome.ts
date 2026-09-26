/**
 * ===========================================================================
 *  "EMAIL ME NEWS" AT CHECKOUT IS JOINING THE LIST, SO THE WELCOME STARTS
 * ===========================================================================
 * Ticking "Email me news and offers from <creator>" at checkout put the
 * buyer on the creator's list (lib/contacts/checkout-contact) and stopped
 * there: the creator's "Someone joins your email list" automation, the
 * welcome, never started for them, while the same person joining through a
 * sign up box on a site or a OnePage got it. Shopify Email's welcome starts
 * when a customer subscribes to marketing, the checkout's box included, and
 * Kit's does the same. So does this, now.
 *
 * WHEN. Only when this checkout is what put them on the list: a new
 * contact who ticked the box, a customer who ticks it on a later order, or
 * somebody who unsubscribed and ticks it again (an explicit new yes). That
 * is recordCheckoutContact's "subscribed" and "resubscribed". Somebody
 * already on the list who ticks it again is "unchanged" and gets nothing:
 * they joined before, and had their welcome then. A buyer who did not tick
 * is a "customer" and never gets it (the welcome is a flow for subscribers,
 * lib/automations/flow-model audienceOf).
 *
 * The OnePage free download joins the list under its notice (the "notice"
 * basis in checkout-contact); that is a join too, and starts the same
 * welcome the OnePage's own sign up box does.
 *
 * ONCE, WHATEVER RETRIES. Stripe delivers a webhook more than once and the
 * buyer's browser reports the same payment as well; a checkout that reached
 * Pay records the tick before the payment, and the payment records it
 * again. Only the first of those writes changes the row, so only it comes
 * back as a join: every later one reads a subscriber and is "unchanged". Two
 * writers racing both read no row, one insert wins and the other plans again
 * against it (checkout-contact, 23505), so that is one join as well. And
 * past that, the engine enters a flow once per person in its window in any
 * case (lib/automations/flow-model dedupeKey, enforced by the database's
 * unique index in enroll_email_flow), which is the same guard every other
 * way into the welcome has.
 *
 * NEVER A REASON TO FAIL THE CHECKOUT. The order is already safe; a welcome
 * that cannot be started is logged as a code and the checkout carries on.
 */

import { recordCheckoutContact, type CheckoutContactInput, type ContactOutcome } from "./checkout-contact"
import type { ContactSource } from "./contact-source"

type Db = Parameters<typeof recordCheckoutContact>[0]

/** Did this checkout's write put them on the list just now? */
export function joinedTheList(outcome: ContactOutcome): boolean {
  return outcome === "subscribed" || outcome === "resubscribed"
}

export interface WelcomeInput {
  creatorId: string
  email: string
  name: string | null
  source: ContactSource | null
}

/** Starts the "Someone joins your email list" automations for one person. */
export type StartWelcome = (db: Db, who: WelcomeInput) => Promise<unknown>

/**
 * The app's way in to the welcome: the same trigger every sign up box fires
 * (lib/email triggerEmailFlows, which enters the engine's flows). Imported
 * when it is needed, not at the top: lib/email reaches the automations,
 * whose store records a checkout's tick through checkout-contact, and this
 * file is imported by the checkout routes beside both.
 */
export const startWelcome: StartWelcome = async (db, who) => {
  const { triggerEmailFlows } = await import("@/lib/email")
  return triggerEmailFlows(db, {
    triggerType: "new_subscriber",
    creatorId: who.creatorId,
    recipientEmail: who.email,
    recipientName: who.name || undefined,
    source: who.source,
  })
}

/**
 * recordCheckoutContact, and the welcome when that write is what put the
 * buyer on the list. Returns what the write did, as recordCheckoutContact
 * does. Never throws.
 */
export async function recordCheckoutContactAndWelcome(db: Db, input: CheckoutContactInput, start: StartWelcome = startWelcome): Promise<ContactOutcome> {
  const outcome = await recordCheckoutContact(db, input)
  if (!joinedTheList(outcome)) return outcome
  try {
    await start(db, {
      creatorId: input.creatorId,
      email: input.email.trim().toLowerCase(),
      name: (input.name ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || null,
      source: input.source ?? null,
    })
  } catch (error) {
    /* A code, never the address. */
    console.warn(`[contacts] checkout welcome could not start (${(error as Error)?.name || "error"})`)
  }
  return outcome
}
