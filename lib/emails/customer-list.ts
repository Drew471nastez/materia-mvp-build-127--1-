/**
 * The list of every email a buyer or a member gets, without the templates
 * that draw them (./customer-catalog.ts has those, and re-exports this). The
 * Emails page and Settings list the emails from here, so the list ships
 * without the order, receipt and notice templates; those load with the
 * editor, when an email is opened (components/app/settings/customer-email-sheet.tsx).
 */
import { isCustomizable } from "./customer-custom"
import type { EmailFamily } from "./buyer-channel"
import { tt } from "@/lib/i18n/text"
import type { CommunityWordKind } from "./community-words"

export type { EmailFamily }
export type CustomerEmailGroup = "digital" | "memberships" | "orders" | "payments" | "shipping" | "pickup" | "returns" | "checkout" | "members" | "tickets" | "plans"

/** A community email's kind, as lib/communities/server/email.ts sends it (and lib/memberships/sync.ts for a paid plan). */
export type CommunityEmailKind = CommunityWordKind | "broadcast"

export interface CustomerEmail {
  id: string
  name: string
  group: CustomerEmailGroup
  family: EmailFamily
  sentWhen: string
  physical: boolean
  /** Its words can be changed: the store's (DEFAULT_COPY) or, for a community email, the community's. */
  editable: boolean
  /** A community email: the kind its sender and its preview route know it by. */
  community?: CommunityEmailKind
}

export const FAMILY_ORDER: EmailFamily[] = ["digital", "physical", "communities"]

export const FAMILY_NAMES: Record<EmailFamily, string> = {
  get digital() { return tt("Digital products") },
  get physical() { return tt("Physical products") },
  get communities() { return tt("Communities") },
}

export const GROUP_NAMES: Record<CustomerEmailGroup, string> = {
  /* Under the Digital products family: what was bought, and given back. */
  get digital() { return tt("Purchases") },
  get memberships() { return tt("Memberships") },
  get orders() { return tt("Orders") },
  get payments() { return tt("Payments") },
  get shipping() { return tt("Shipping") },
  get pickup() { return tt("Local pickup") },
  get returns() { return tt("Returns") },
  get checkout() { return tt("Checkout") },
  get members() { return tt("Members") },
  get tickets() { return tt("Event tickets") },
  get plans() { return tt("Paid membership") },
}

/**
 * THE ORDER THEY ARE LISTED IN, and the families kept apart: a download's
 * emails are Digital products; everything about an order that ships or is
 * picked up is Physical products, in Shopify's groups; a community's are
 * Communities.
 *
 * ONE EMAIL PER THING THAT HAPPENED. A paid order that ships gets its order
 * confirmation and nothing else for the same payment (no separate "payment
 * received"); a declined payment gets Payment failed, and then no checkout
 * reminder for the same cart. There is no Order invoice email: every order
 * is paid at checkout, and its invoice is a download on the order page.
 */
export const GROUP_ORDER: CustomerEmailGroup[] = ["digital", "memberships", "checkout", "orders", "payments", "shipping", "pickup", "returns", "members", "tickets", "plans"]

/** An entry, `editable` filled in from DEFAULT_COPY when it does not say. The object is kept, so `sentWhen` stays a getter in the person's language. */
function E(e: Omit<CustomerEmail, "editable"> & { editable?: boolean }): CustomerEmail {
  if (e.editable === undefined) e.editable = isCustomizable(e.id)
  return e as CustomerEmail
}

/** The store's own emails: drawn in the browser by their sending templates. */
export const CUSTOMER_EMAILS: CustomerEmail[] = [
  E({ id: "receipt", name: "Receipt", group: "digital", family: "digital", get sentWhen() { return tt("Right after a buyer pays for a download, course or membership, with the link to it.") }, physical: false }),
  E({ id: "digital_refund", name: "Refund", group: "digital", family: "digital", get sentWhen() { return tt("When you refund a download, course or membership, here or in Stripe. Its download stops working.") }, physical: false }),
  E({ id: "membership_started", name: "Membership started", group: "memberships", family: "digital", get sentWhen() { return tt("When someone joins a membership you sell on its own, with what they pay and when.") }, physical: false }),
  E({ id: "membership_renewed", name: "Membership renewed", group: "memberships", family: "digital", get sentWhen() { return tt("Each time a membership renews and is paid.") }, physical: false }),
  E({ id: "membership_renewal_reminder", name: "Renewal reminder", group: "memberships", family: "digital", get sentWhen() { return tt("Three days before a monthly membership renews, seven before a yearly one.") }, physical: false }),
  E({ id: "membership_payment_failed", name: "Membership payment failed", group: "memberships", family: "digital", get sentWhen() { return tt("When the bank declines a renewal. It asks the member to update their card.") }, physical: false }),
  E({ id: "membership_canceled", name: "Membership cancelled", group: "memberships", family: "digital", get sentWhen() { return tt("When a member cancels. It says until when they keep access.") }, physical: false }),
  E({ id: "membership_plan_changed", name: "Plan changed", group: "memberships", family: "digital", get sentWhen() { return tt("When a member moves to another plan or billing period.") }, physical: false }),
  E({ id: "membership_ended", name: "Membership ended", group: "memberships", family: "digital", get sentWhen() { return tt("When a membership ends and access stops.") }, physical: false }),
  E({ id: "checkout_reminder", name: "Checkout reminder", group: "checkout", family: "digital", get sentWhen() { return tt("An hour after a buyer leaves checkout without paying, if they asked for news.") }, physical: false }),
  E({ id: "order_confirmation", name: "Order confirmation", group: "orders", family: "physical", get sentWhen() { return tt("Right after a buyer pays for something you ship or they pick up.") }, physical: true }),
  E({ id: "order_updated", name: "Order updated", group: "orders", family: "physical", get sentWhen() { return tt("When you change the shipping address on an order before it ships.") }, physical: true }),
  E({ id: "order_cancelled", name: "Order cancelled", group: "orders", family: "physical", get sentWhen() { return tt("When you cancel an order before it ships.") }, physical: true }),
  E({ id: "refund", name: "Refund", group: "orders", family: "physical", get sentWhen() { return tt("When you refund all or part of an order, here or in Stripe.") }, physical: true }),
  E({ id: "payment_failed", name: "Payment failed", group: "payments", family: "physical", get sentWhen() { return tt("Half an hour after a buyer's bank declines their payment, if they still haven't paid. Nothing was charged; it links back to their cart.") }, physical: true }),
  E({ id: "shipping_confirmation", name: "Shipping confirmation", group: "shipping", family: "physical", get sentWhen() { return tt("When you mark items shipped, with the tracking.") }, physical: true }),
  E({ id: "tracking_changed", name: "Tracking number changed", group: "shipping", family: "physical", get sentWhen() { return tt("When you change the tracking number on a shipment that already went out.") }, physical: true }),
  E({ id: "out_for_delivery", name: "Out for delivery", group: "shipping", family: "physical", get sentWhen() { return tt("When the carrier says it's out for delivery.") }, physical: true }),
  E({ id: "delivered", name: "Delivered", group: "shipping", family: "physical", get sentWhen() { return tt("When it's marked delivered.") }, physical: true }),
  E({ id: "delivery_issue", name: "Delivery issue", group: "shipping", family: "physical", get sentWhen() { return tt("When a shipment is marked as failed: the carrier, or your own delivery, couldn't deliver it.") }, physical: true }),
  E({ id: "ready_for_pickup", name: "Ready for pickup", group: "pickup", family: "physical", get sentWhen() { return tt("When you mark a pickup order ready.") }, physical: true }),
  E({ id: "picked_up", name: "Picked up", group: "pickup", family: "physical", get sentWhen() { return tt("When you mark it collected.") }, physical: true }),
  E({ id: "return_requested", name: "Return requested", group: "returns", family: "physical", get sentWhen() { return tt("When a buyer asks to return items, so they know it arrived.") }, physical: true }),
  E({ id: "return_approved", name: "Return approved", group: "returns", family: "physical", get sentWhen() { return tt("When you approve a return, with your instructions.") }, physical: true }),
  E({ id: "return_declined", name: "Return declined", group: "returns", family: "physical", get sentWhen() { return tt("When you decline a return, with your note.") }, physical: true }),
  E({ id: "return_received", name: "Return received", group: "returns", family: "physical", get sentWhen() { return tt("When the items reach you.") }, physical: true }),
  E({ id: "return_completed", name: "Return complete", group: "returns", family: "physical", get sentWhen() { return tt("When the return is closed, with any refund.") }, physical: true }),
]

/**
 * A community's emails to its members, every one in the community's own name
 * and picture, and every one but Email your members (written each time)
 * taking the community's own words (lib/emails/community-words.ts): the
 * welcome, an approved request, an invite, the four ticket emails and its
 * paid plan's seven. The facts about a ticket or a payment stay Storelib's.
 */
export const COMMUNITY_EMAILS: CustomerEmail[] = [
  E({ id: "community_welcome", community: "welcome", name: "Welcome", group: "members", family: "communities", get sentWhen() { return tt("When someone joins, or is let back in.") }, physical: false, editable: true }),
  E({ id: "community_join_approved", community: "join_approved", name: "Request approved", group: "members", family: "communities", get sentWhen() { return tt("When you approve a request to join. In a paid community it says how to finish joining.") }, physical: false, editable: true }),
  E({ id: "community_invite", community: "invite", name: "Invite", group: "members", family: "communities", get sentWhen() { return tt("When you invite someone by email.") }, physical: false, editable: true }),
  E({ id: "community_broadcast", community: "broadcast", name: "Email your members", group: "members", family: "communities", get sentWhen() { return tt("When you write one. It goes to members who keep community emails on, one a day at most.") }, physical: false, editable: false }),
  E({ id: "community_event_ticket", community: "event_ticket", name: "Event ticket", group: "tickets", family: "communities", get sentWhen() { return tt("When someone buys a ticket to a paid event, with the calendar file.") }, physical: false, editable: true }),
  E({ id: "community_event_ticket_invite", community: "event_ticket_invite", name: "Free ticket", group: "tickets", family: "communities", get sentWhen() { return tt("When you give someone a ticket.") }, physical: false, editable: true }),
  E({ id: "community_event_refund", community: "event_refund", name: "Ticket refunded", group: "tickets", family: "communities", get sentWhen() { return tt("When a ticket is refunded.") }, physical: false, editable: true }),
  E({ id: "community_event_cancelled", community: "event_cancelled", name: "Event cancelled", group: "tickets", family: "communities", get sentWhen() { return tt("When you cancel a paid event. It says the money is on its way.") }, physical: false, editable: true }),
  E({ id: "community_membership_started", community: "membership_started", name: "Membership started", group: "plans", family: "communities", get sentWhen() { return tt("When someone joins a paid plan, with what they pay and when.") }, physical: false, editable: true }),
  E({ id: "community_membership_renewed", community: "membership_renewed", name: "Membership renewed", group: "plans", family: "communities", get sentWhen() { return tt("Each time a plan renews and is paid.") }, physical: false, editable: true }),
  E({ id: "community_membership_renewal_reminder", community: "membership_renewal_reminder", name: "Renewal reminder", group: "plans", family: "communities", get sentWhen() { return tt("Three days before a monthly plan renews, seven before a yearly one.") }, physical: false, editable: true }),
  E({ id: "community_membership_payment_failed", community: "membership_payment_failed", name: "Payment failed", group: "plans", family: "communities", get sentWhen() { return tt("When the bank declines a renewal. It asks the member to update their card.") }, physical: false, editable: true }),
  E({ id: "community_membership_canceled", community: "membership_canceled", name: "Membership cancelled", group: "plans", family: "communities", get sentWhen() { return tt("When a member cancels. It says until when they keep access.") }, physical: false, editable: true }),
  E({ id: "community_membership_plan_changed", community: "membership_plan_changed", name: "Plan changed", group: "plans", family: "communities", get sentWhen() { return tt("When a member moves to another plan or billing period.") }, physical: false, editable: true }),
  E({ id: "community_membership_ended", community: "membership_ended", name: "Membership ended", group: "plans", family: "communities", get sentWhen() { return tt("When a paid membership ends and access stops.") }, physical: false, editable: true }),
]

export const ALL_EMAILS: CustomerEmail[] = [...CUSTOMER_EMAILS, ...COMMUNITY_EMAILS]

/**
 * NOT IN THE LIST, AND WHY. Each was listed somewhere, or is registered as
 * a buyer's or member's notification; none of them is an email of its own
 * that a buyer or member gets, so listing them showed things that never go
 * out, or the same email twice. Sending is unchanged.
 */
/* For the code and the tests, not a screen: i18n-ignore-start */
export const LEFT_OUT: Array<{ id: string; family: EmailFamily; notification: string; why: string }> = [
  { id: "community_announcement", family: "communities", notification: "COMMUNITY_ANNOUNCEMENT", why: "Never an email: an announcement reaches members in the bell and on their phone (lib/notify/email-budget.ts). The members' email is Email your members." },
  { id: "community_event_reminder", family: "communities", notification: "COMMUNITY_EVENT_REMINDER", why: "Never an email: the reminder before an event goes to the bell and the phone only." },
  { id: "community_course_available", family: "communities", notification: "COMMUNITY_COURSE_AVAILABLE", why: "Never an email: a new course in the classroom goes to the bell and the phone only." },
  { id: "purchase_confirmation", family: "digital", notification: "PURCHASE_CONFIRMATION", why: "The receipt under another name: the engine records it and sends nothing (emailSentElsewhere); the receipt is the one email." },
  { id: "digital_product_access", family: "digital", notification: "DIGITAL_PRODUCT_ACCESS", why: "Never planned by any workflow: the receipt carries the download." },
  { id: "customer_refund_processed", family: "digital", notification: "CUSTOMER_REFUND_PROCESSED", why: "The refund under another name for a download: lib/email.tsx sendRefundEmails sends the Refund listed here, the engine sends nothing." },
]
/* i18n-ignore-end */

/** The store's emails a store with or without physical commerce sends. */
export function visibleCustomerEmails(physical: boolean): CustomerEmail[] {
  return CUSTOMER_EMAILS.filter((e) => physical || !e.physical)
}

/** One family's emails, or every family's ("all"), in list order; the physical ones only while physical commerce is on. */
export function emailsOf(family: EmailFamily | "all", physical: boolean): CustomerEmail[] {
  return ALL_EMAILS.filter((e) => (family === "all" || e.family === family) && (physical || !e.physical))
}

export function findEmail(id: string): CustomerEmail | null {
  return ALL_EMAILS.find((e) => e.id === id) ?? null
}

