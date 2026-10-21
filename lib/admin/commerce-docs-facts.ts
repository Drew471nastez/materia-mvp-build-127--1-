/**
 * ===========================================================================
 *  THE LISTS ON /admin/physical-commerce THAT ARE READ FROM THE CODE
 * ===========================================================================
 * A section of lib/admin/commerce-docs.ts asks for one of these by its key
 * and the page prints it as it is in the code today: the customer emails and
 * when each goes, the carriers with a tracking link, the integrations and
 * whether each works yet, the checkout defaults, the order and shipment
 * statuses. When another part of Storelib changes one of these, the page
 * follows without anyone editing it.
 *
 * Three lists are labels that live inside a client component
 * (components/physical/shipping-settings.tsx) and are not exported. They are
 * written out here against the code's own types, so a new rate kind or
 * location kind is a type error until it is described, and
 * tests/admindocs23.test.ts checks every label still appears in that file.
 *
 * Server side only (the page renders it and hands the result over as data).
 */

import { CUSTOMER_EMAILS } from "@/lib/emails/customer-catalog"
import { CATEGORY_NAMES, INTEGRATIONS } from "@/lib/integrations/catalog"
import { REGISTRY } from "@/lib/notify/registry"
import { CARRIER_LIST } from "@/lib/physical/carriers"
import { PICKUP_READY_LABEL } from "@/lib/physical/pickup"
import { FULFILLMENT_LABEL, PAYMENT_LABEL, RETURN_LABEL, SHIPMENT_LABEL } from "@/lib/physical/status"
import { FULFILLMENT_MODELS, LOCATION_KINDS, type FulfillmentModel, type LocationKind, type RateKind } from "@/lib/physical/types"
import { BUILT_IN, BUILT_IN_KINDS } from "@/lib/store/channels"
import { DEFAULT_CHECKOUT, type CheckoutConfig } from "@/lib/store/checkout-config"

import type { FactKey } from "./commerce-docs"

export interface FactRow {
  name: string
  value?: string
  note?: string
}

export interface Fact {
  key: FactKey
  title: string
  source: string
  rows: FactRow[]
}

/** components/physical/shipping-settings.tsx RATE_KIND_LABEL, with what each does (lib/physical/rates.ts). */
export const RATE_KINDS: Record<RateKind, { label: string; does: string }> = {
  flat: { label: "Flat rate", does: "Always offered, at its price." },
  free: { label: "Free shipping", does: "Always free, or only from an order value." },
  price: { label: "Based on order price", does: "The tier the order's value falls in." },
  weight: { label: "Based on order weight", does: "The tier the order's total weight falls in, with the default package." },
  item_weight: { label: "Based on item weight", does: "Each item priced by its own weight's tier, added up." },
  quantity: { label: "By number of items", does: "Older rates only: between a smallest and largest number of items." },
  carrier: { label: "Carrier calculated", does: "Only offered when a connected carrier quotes it; never guessed." },
}

/** components/physical/shipping-settings.tsx MODELS. */
export const FULFILMENT_MODEL_LABELS: Record<FulfillmentModel, string> = {
  self: "I ship orders myself",
  warehouse: "From my own warehouse",
  print_on_demand: "Print on demand",
  dropshipping: "Dropshipping",
  supplier: "A supplier or manufacturer",
  third_party_logistics: "A fulfillment center",
  hybrid: "A mix of these",
}

/** components/physical/shipping-settings.tsx KIND_LABEL. */
export const LOCATION_KIND_LABELS: Record<LocationKind, string> = {
  home: "Home or studio",
  warehouse: "Warehouse",
  print_on_demand: "Print on demand",
  dropshipper: "Dropshipping supplier",
  supplier: "Supplier",
  third_party_logistics: "Fulfillment center",
  retail: "Store",
  custom: "Other",
}

/**
 * The Stripe events an order depends on, each handled in
 * app/api/stripe/webhook/route.ts (the test reads that file for every one).
 * The platform endpoint in Stripe has to send them.
 */
export const STRIPE_COMMERCE_EVENTS: { type: string; why: string }[] = [
  { type: "payment_intent.succeeded", why: "A payment in Storelib's own form (a website's checkout, a single product): the order is written, if the buyer's return has not already" },
  { type: "checkout.session.completed", why: "A payment on Stripe's own page (a physical checkout): the order is written, if the buyer's return has not already" },
  { type: "checkout.session.expired", why: "Stripe's page closed unpaid: the stock held for it goes back" },
  { type: "payment_intent.canceled", why: "A payment given up: limited copies it held go back" },
  { type: "payment_intent.payment_failed", why: "A card refused: nothing is written; for an order that ships, the buyer's Payment failed email goes half an hour later if they still have not paid, once per checkout" },
  { type: "charge.refunded", why: "A refund, also one made in Stripe: the order and the seller's balance follow" },
  { type: "charge.dispute.created", why: "A dispute: saved and the creator told" },
]

const CHECKOUT_LABELS: Record<keyof CheckoutConfig, string> = {
  abandonedRecovery: "Send a checkout reminder",
  requireAccount: "Require customers to sign in",
  requireConfirmedEmail: "Require a confirmed email address",
  marketingOptIn: "Show the email news box",
  nameFields: "Full name",
  company: "Company name",
  phone: "Phone number",
  address2: "Address line 2",
  buyerCancel: "Let buyers cancel",
  cashOnDelivery: "Cash on delivery",
  /* Cash on delivery's options, by the names its card gives them (they follow its row). */
  codCountries: "Where",
  codFeeCents: "Fee",
  codInstructions: "Note for the buyer",
}

const word = (v: unknown): string => {
  if (v === true) return "On"
  if (v === false) return "Off"
  if (v === "off") return "Don't include"
  if (v === "optional") return "Optional"
  if (v === "required") return "Required"
  if (v === "last_only") return "One field"
  if (v === "first_and_last") return "First and last apart"
  /* Cash on delivery's countries (empty: everywhere it ships) and a note left empty. */
  if (Array.isArray(v)) return v.length ? v.join(", ") : "Everywhere the store ships"
  if (v === "") return "None"
  return String(v)
}

/** NEW_SALE → New sale. */
const humanType = (t: string) => t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, " ")

function integrationState(i: (typeof INTEGRATIONS)[number]): string {
  if (i.builtIn) return "Built in"
  if (i.comingSoon) return "Listed, not connected yet"
  if (i.kind === "tracker") return "Works today, by ID"
  if (i.kind === "app") return "Storelib app"
  return "Works today"
}

export function factFor(key: FactKey): Fact {
  switch (key) {
    case "checkoutDefaults":
      return {
        key,
        title: "What a store starts with",
        source: "lib/store/checkout-config.ts DEFAULT_CHECKOUT",
        rows: (Object.keys(DEFAULT_CHECKOUT) as (keyof CheckoutConfig)[]).map((k) => ({ name: CHECKOUT_LABELS[k] ?? k, value: word(DEFAULT_CHECKOUT[k]) })),
      }
    case "channels":
      return {
        key,
        title: "Storelib's own channels",
        source: "lib/store/channels.ts BUILT_IN",
        rows: BUILT_IN_KINDS.map((k) => ({ name: BUILT_IN[k].name, note: BUILT_IN[k].description })),
      }
    case "customerEmails":
      return {
        key,
        title: "Every customer email, and when it goes",
        source: "lib/emails/customer-catalog.ts CUSTOMER_EMAILS",
        rows: CUSTOMER_EMAILS.map((e) => ({ name: e.name, value: e.physical ? "Physical commerce" : "Every store", note: e.sentWhen })),
      }
    case "sellerEmails":
      return {
        key,
        title: "Emails and notices to the creator about sales",
        source: "lib/notify/registry.ts (category sales, to the creator), lib/physical/jobs-server.ts",
        rows: [
          ...Object.values(REGISTRY)
            .filter((e) => e.category === "sales" && e.recipient === "creator")
            .map((e) => ({ name: humanType(e.type), value: e.channels.join(", ").replace("in_app", "bell"), note: e.requirement === "required_service" ? "Always sent" : "Can be turned off in Settings › Notifications" })),
          { name: "Low stock", value: "email", note: "Physical commerce: one a day at most, when Locations › Low stock › Email me is on" },
          { name: "New order for a partner location", value: "email", note: "To the location's orders email, with Add tracking" },
          { name: "Cancel request", value: "email", note: "A buyer pressed Cancel order on their order page; answered from the order" },
        ],
      }
    case "rateKinds":
      return { key, title: "Kinds of shipping rate", source: "lib/physical/rates.ts", rows: (Object.keys(RATE_KINDS) as RateKind[]).map((k) => ({ name: RATE_KINDS[k].label, note: RATE_KINDS[k].does })) }
    case "fulfilmentModels":
      return { key, title: "How a store can fulfil", source: "lib/physical/types.ts FULFILLMENT_MODELS", rows: FULFILLMENT_MODELS.map((m) => ({ name: FULFILMENT_MODEL_LABELS[m] })) }
    case "locationKinds":
      return { key, title: "Kinds of location", source: "lib/physical/types.ts LOCATION_KINDS", rows: LOCATION_KINDS.map((k) => ({ name: LOCATION_KIND_LABELS[k] })) }
    case "pickupReady":
      return { key, title: "Pickup ready times buyers see", source: "lib/physical/pickup.ts PICKUP_READY_LABEL", rows: Object.values(PICKUP_READY_LABEL).map((l) => ({ name: l })) }
    case "carriers":
      return {
        key,
        title: `Carriers with a tracking link (${CARRIER_LIST.length})`,
        source: "lib/physical/carriers.ts CARRIER_LIST",
        rows: [{ name: CARRIER_LIST.map((c) => c.name).join(", "), note: "A carrier typed under Other is still matched by name." }],
      }
    case "orderStatuses":
      return {
        key,
        title: "Order statuses, as Orders and the order page say them",
        source: "lib/physical/status.ts",
        rows: [
          { name: "Payment", note: Object.values(PAYMENT_LABEL).map((l) => l.label).join(", ") },
          { name: "Fulfilment", note: Object.values(FULFILLMENT_LABEL).map((l) => l.label).join(", ") },
          { name: "Returns", note: Object.values(RETURN_LABEL).map((l) => l.label).join(", ") },
        ],
      }
    case "shipmentStatuses":
      return { key, title: "Shipment statuses", source: "lib/physical/status.ts SHIPMENT_LABEL", rows: [{ name: Object.values(SHIPMENT_LABEL).map((l) => l.label).join(", "), note: "A shipment only moves forward, except to a delivery problem or cancelled." }] }
    case "integrations":
      return {
        key,
        title: `Every integration listed (${INTEGRATIONS.length})`,
        source: "lib/integrations/catalog.ts INTEGRATIONS",
        rows: INTEGRATIONS.map((i) => ({ name: i.name, value: integrationState(i), note: `${CATEGORY_NAMES[i.category]}${i.physical ? ", physical commerce" : ""}` })),
      }
    case "stripeEvents":
      return { key, title: "Stripe events an order needs", source: "app/api/stripe/webhook/route.ts", rows: STRIPE_COMMERCE_EVENTS.map((e) => ({ name: e.type, note: e.why })) }
  }
}

/** Every fact the sections ask for, keyed, for the page. */
export function factsFor(keys: FactKey[]): Partial<Record<FactKey, Fact>> {
  const out: Partial<Record<FactKey, Fact>> = {}
  for (const k of keys) out[k] = factFor(k)
  return out
}
