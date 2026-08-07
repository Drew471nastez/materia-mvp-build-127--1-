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
 * Pull the most recent human-readable status out of a tracking response.
 *
 * DELIBERATELY STRUCTURE-AGNOSTIC. The provider's tracking payload is the one
 * part of this integration whose shape has not been verified against a real
 * response — there is no shipment to track yet — so this walks the JSON
 * looking for status-ish keys instead of indexing into a path that is a guess.
 * A guessed path silently yields undefined forever when it is wrong, and the
 * failure looks exactly like "the parcel has not moved".
 *
 * Events usually arrive oldest-first, so the LAST match wins. When a date is
 * present next to the text it is preferred over position, because a provider
 * that returns newest-first would otherwise be read backwards.
 */
export function extractLatestStatus(raw: unknown): { text: string; at: string | null } | null {
  const KEYS = /^(status|status_name|state|event|event_name|description|message|status_description)$/i
  const DATE_KEYS = /^(date|datetime|timestamp|event_date|status_date|created_at|updated_at)$/i

  let best: { text: string; at: string | null; order: number } | null = null
  let counter = 0
  const seen = new Set<unknown>()

  const walk = (node: unknown, nearbyDate: string | null) => {
    if (node === null || typeof node !== "object") return
    // Cyclic structures are not expected from JSON, but a shared reference
    // would still be walked twice and waste the traversal budget.
    if (seen.has(node)) return
    seen.add(node)

    if (Array.isArray(node)) {
      for (const item of node) walk(item, nearbyDate)
      return
    }

    const obj = node as Record<string, unknown>
    let dateHere = nearbyDate
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string" && DATE_KEYS.test(k) && v.trim()) dateHere = v.trim()
    }

    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string" && KEYS.test(k) && v.trim()) {
        const order = counter++
        // `>=` so later events replace earlier ones of equal standing.
        if (!best || order >= best.order) best = { text: v.trim().slice(0, 300), at: dateHere, order }
      }
    }
    for (const v of Object.values(obj)) walk(v, dateHere)
  }

  walk(raw, null)
  if (!best) return null
  const found = best as { text: string; at: string | null; order: number }
  return { text: found.text, at: found.at }
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
