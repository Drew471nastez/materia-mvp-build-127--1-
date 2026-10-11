/**
 * ===========================================================================
 *  A LOCATION THAT PRINTFUL OR PRINTIFY SHIPS FROM
 * ===========================================================================
 * Connecting Printful or Printify in Settings › Integrations makes a location
 * of the same name that forwards each order to it
 * (lib/integrations/fulfilment/forward-server.ts). What Locations and the
 * product editor say about such a location, and the stock rule for what is
 * printed there, live here so every screen and the checkout agree. Pure:
 * the tests run it as it is.
 */

import type { FulfillmentMethod, Location } from "./types"

type Where = Pick<Location, "forwarding" | "partner">

/** The pill on a location in Settings › Locations, for one that forwards to a print partner. Null for any other. */
export function partnerPill(l: Where): { label: string; tone: "green" | "amber" } | null {
  if (l.forwarding !== "provider") return null
  if (l.partner?.connected) return { label: `Connected to ${l.partner.name}`, tone: "green" }
  return { label: l.partner ? `${l.partner.name} not connected` : "Provider not connected", tone: "amber" }
}

/** What happens to an order for something fulfilled from this location, in a sentence. */
export function partnerSentence(l: Where & Pick<Location, "email">): string {
  if (l.forwarding === "provider") {
    if (l.partner?.connected) return `Orders go to ${l.partner.name} automatically, and its tracking comes back to your buyer.`
    const name = l.partner?.name ?? "The provider"
    return `${name} isn't connected, so orders aren't sent there. Connect it in Settings › Integrations, or pass them on yourself.`
  }
  if (l.forwarding === "email" && l.email) return `Orders are emailed to ${l.email}.`
  if (l.forwarding === "webhook") return "Orders are sent to your webhook."
  return "Orders aren't sent automatically. You pass them on."
}

/**
 * MADE WHEN IT SELLS: a print on demand product whose location holds no stock
 * (the location Printful or Printify made, or a print partner added without
 * stock) is not counted there. Its stock tracking is off, and nothing about
 * that location's empty shelves can make it sold out.
 */
export function madeToOrder(method: FulfillmentMethod | null | undefined, location: Pick<Location, "holdsInventory" | "forwarding"> | null | undefined): boolean {
  return method === "print_on_demand" && !!location && (location.holdsInventory === false || location.forwarding === "provider")
}
