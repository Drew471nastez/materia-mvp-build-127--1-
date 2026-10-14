/**
 * ===========================================================================
 *  CASH ON DELIVERY
 * ===========================================================================
 * A physical order the buyer pays in cash when it is delivered or picked
 * up. The seller turns it on in Settings › Checkout (checkout config
 * `cashOnDelivery`); the buyer then chooses it beside card at checkout.
 *
 * It is the same order as any other (lib/physical/checkout-server.ts): the
 * stock is held and taken, the order emails go, it waits to be fulfilled.
 * What differs is the money:
 *
 *   provider "cod"       on the checkout and its order lines
 *   no fee               nothing passes through Storelib, so nothing is taken
 *   no ledger entry      the payout balance never holds money it never had
 *   cod_collected_at     null until the seller marks the cash received
 *                        (Orders, Mark as paid); the order reads "Payment
 *                        pending" until then, "Paid" after
 *   refunds              before the cash is in, the order is cancelled, never
 *                        refunded; after, a refund is recorded as cash given
 *                        back by the seller, with no card to send it to
 *
 * Only for a cart where everything is physical: a download is the buyer's the
 * moment the order is written, before any cash is paid.
 *
 * Pure, so the tests run the rules.
 */

export const COD_PROVIDER = "cod"

/** What a card payment and a cash one leave on the order (orders.payment_method). */
export const COD_PAYMENT_METHOD = "cash_on_delivery"

export interface CodLine {
  type: string
}

/**
 * Why this cart cannot be paid on delivery, in the buyer's words, or null
 * when it can. Read on the server before anything is held or written.
 */
export function codRefusal(input: {
  enabled: boolean
  lines: CodLine[]
  requiresShipping: boolean
  totalCents: number
  /** The countries the shop takes cash in (Settings › Checkout); empty for everywhere it ships. */
  countries?: string[]
  /** Where it is delivered, or null for a pickup, which is paid where it is picked up. */
  country?: string | null
}): string | null {
  if (!input.enabled) return "This shop doesn't take cash on delivery. Pay by card instead."
  if (input.lines.length === 0) return "Your cart is empty."
  if (!input.requiresShipping || input.lines.some((l) => l.type !== "physical")) return "Cash on delivery is only for things that are delivered or picked up. Pay by card for the rest."
  if (!(input.totalCents > 0)) return "There is nothing to pay."
  if (!codCountryAllowed(input.countries, input.country)) return "Cash on delivery isn't available for this address. Pay by card instead."
  return null
}

/** Whether cash on delivery is offered for this delivery country: every country when the list is empty, and every pickup. */
export function codCountryAllowed(countries: string[] | null | undefined, country: string | null | undefined): boolean {
  if (!countries || countries.length === 0 || !country) return true
  return countries.includes(country.trim().toUpperCase())
}

/**
 * The checkout's key when it is paid on delivery: the cart's own key with a
 * mark, so a card checkout the buyer started for the same cart and the cash
 * one are two rows (client_key is unique per store, at most 120 characters).
 */
export function codClientKey(clientKey: string): string {
  return `${clientKey.slice(0, 116)}:cod`
}

export type PaymentState = "card" | "free" | "cod_due" | "cod_collected"

/** How an order was paid, or is to be paid, from its checkout's provider and collected time. */
export function paymentStateOf(provider: string | null | undefined, codCollectedAt: string | null | undefined): PaymentState {
  if (provider === COD_PROVIDER) return codCollectedAt ? "cod_collected" : "cod_due"
  if (provider === "free") return "free"
  return "card"
}

/** Whether the seller is still to collect the money for this order. */
export const cashDue = (provider: string | null | undefined, codCollectedAt: string | null | undefined) => paymentStateOf(provider, codCollectedAt) === "cod_due"
