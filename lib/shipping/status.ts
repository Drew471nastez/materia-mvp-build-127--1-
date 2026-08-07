/**
 * The carrier's vocabulary, and ours.
 *
 * Couriers each have their own status strings, in their own language, and they
 * change them. A marketplace cannot show those to a buyer — "AWB preluat de
 * curier" is not an answer to "where is my jacket" — so there is a mapping, and
 * the mapping lives in exactly one place.
 *
 * The raw string is ALWAYS stored alongside the mapped one
 * (`orders.shipping_raw_status`). A mapping is a guess about somebody else's
 * system and it will be wrong occasionally; without the original there is
 * nothing to check it against when a shipment behaves oddly, and no way to fix
 * the mapping retroactively.
 */

/** What the marketplace shows. Ordered by progress, which the comparison below relies on. */
export const SHIPPING_STATES = [
  /** Paid, nothing booked yet. */
  "awaiting_shipment",
  /** The courier accepted the shipment and gave us an AWB. */
  "awb_created",
  /** The seller has handed it over / it has been collected. */
  "shipped",
  "in_transit",
  "delivered",
  /** Terminal, and not a progression — see `isTerminal`. */
  "returned",
  "cancelled",
  /** Booking failed. The order stays paid; a retry is safe. */
  "shipping_creation_failed",
] as const

export type ShippingState = (typeof SHIPPING_STATES)[number]

/**
 * Substrings matched case-insensitively against the carrier's own text, most
 * specific first — order matters, because "livrat" appears inside "nelivrat"
 * and a naive pass would report a failed delivery as a completed one.
 */
const RULES: Array<[RegExp, ShippingState]> = [
  [/\b(nelivrat|undeliverable|refuz|refused|failed delivery)\b/i, "returned"],
  [/\b(retur|returned|returning)\b/i, "returned"],
  [/\b(anulat|cancel|canceled|cancelled)\b/i, "cancelled"],
  [/\b(livrat|delivered|delivery confirmed)\b/i, "delivered"],
  [/\b(in curs de livrare|out for delivery|in livrare|in tranzit|in transit|sortare|hub|depot)\b/i, "in_transit"],
  [/\b(preluat|picked up|collected|ridicat|expediat|shipped|in curier)\b/i, "shipped"],
  [/\b(awb|generat|created|registered|inregistrat)\b/i, "awb_created"],
]

/**
 * Map a carrier status string onto ours.
 *
 * Returns null rather than guessing when nothing matches. A null is honest —
 * the caller keeps the state it already had and stores the raw string, so an
 * unrecognised status is visible in the data instead of silently collapsing
 * every unknown into "in_transit" and making a stuck parcel look moving.
 */
export function mapCarrierStatus(raw: string | null | undefined): ShippingState | null {
  if (!raw || !raw.trim()) return null
  for (const [re, state] of RULES) if (re.test(raw)) return state
  return null
}

/** Nothing happens to a shipment after these. */
export function isTerminal(state: ShippingState | null | undefined): boolean {
  return state === "delivered" || state === "returned" || state === "cancelled"
}

/**
 * Should `next` replace `current`?
 *
 * Carrier feeds are not ordered. A late scan can arrive after a delivery
 * confirmation, and applying it would walk a delivered parcel back to "in
 * transit" — which reads to a buyer as their delivered order having gone
 * missing. Progress only, and never out of a terminal state.
 */
export function shouldAdvance(current: ShippingState | null | undefined, next: ShippingState): boolean {
  if (!current) return true
  if (current === next) return false
  if (isTerminal(current)) return false
  // A failure can always be superseded: it describes our booking attempt, not
  // the parcel, so any real carrier status is better information.
  if (current === "shipping_creation_failed") return true
  if (isTerminal(next)) return true
  return SHIPPING_STATES.indexOf(next) > SHIPPING_STATES.indexOf(current)
}
