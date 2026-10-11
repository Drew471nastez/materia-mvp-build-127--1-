/**
 * ===========================================================================
 *  LOCAL DELIVERY: THE SELLER BRINGS IT TO NEARBY BUYERS
 * ===========================================================================
 * A location with local delivery on (Settings > Locations, under the
 * location) is offered at checkout next to the shipping rates when:
 *
 *   - the address is in the location's country and its postal code starts
 *     with one of the location's codes ("400" covers 400001 to 400999,
 *     "SW1A 1AA" is that one code; spaces and dashes never count),
 *   - the order reaches the location's minimum, if it has one,
 *   - the location can hand over everything that would be shipped: the
 *     seller's own items, in stock there (the same rule as pickup).
 *
 * Its price is the location's, free from its "free over" value. Pure: the
 * checkout server passes the stock it read and quotes it again at Pay, so a
 * price the browser sends is never read.
 */

import { canPickUp, type PickupLine } from "./pickup"
import type { DeliveryOption, LocalDelivery, Location } from "./types"

/** A postal code as it is compared: upper case, letters and digits only. */
export function postalKey(value: unknown): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12)
}

/** The codes the seller typed, one per line or comma, cleaned and unique. At most 500. */
export function readPostalCodes(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.map(String) : String(value ?? "").split(/[\n,;]+/)
  const out: string[] = []
  for (const part of raw) {
    const k = postalKey(part)
    if (k && !out.includes(k)) out.push(k)
    if (out.length >= 500) break
  }
  return out
}

/** Whether a postal code is one the location delivers to. */
export function deliversTo(codes: readonly string[], postalCode: unknown): boolean {
  const k = postalKey(postalCode)
  if (!k) return false
  return codes.some((c) => c && k.startsWith(c))
}

export function isLocalOptionId(id: unknown): id is string {
  return typeof id === "string" && /^local:[0-9a-f-]{36}$/i.test(id)
}

/** The location's local delivery, read from its row (part 154); null when it has none. */
export function localDeliveryFromRow(r: Record<string, any>): LocalDelivery | null {
  if (!("local_delivery_enabled" in r)) return null
  const cents = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : null)
  return {
    enabled: r.local_delivery_enabled === true,
    codes: readPostalCodes(r.local_delivery_codes ?? []),
    priceCents: cents(r.local_delivery_price_cents) ?? 0,
    minOrderCents: cents(r.local_delivery_min_cents),
    freeOverCents: cents(r.local_delivery_free_over_cents),
    note: typeof r.local_delivery_note === "string" && r.local_delivery_note.trim() ? r.local_delivery_note.trim() : null,
  }
}

/** What the seller sent for a location's local delivery, checked, as the columns it is kept in. */
export function readLocalDelivery(input: unknown): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  const d = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const enabled = d.enabled === true
  const codes = readPostalCodes(d.codes)
  const cents = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null
    const n = Math.round(Number(v))
    return Number.isFinite(n) && n >= 0 && n <= 10_000_000 ? n : NaN
  }
  const price = cents(d.priceCents)
  const min = cents(d.minOrderCents)
  const freeOver = cents(d.freeOverCents)
  if ([price, min, freeOver].some((n) => Number.isNaN(n))) return { ok: false, error: "Check the local delivery prices." }
  if (enabled && codes.length === 0) return { ok: false, error: "Add the postal codes you deliver to, or turn local delivery off." }
  const note = typeof d.note === "string" ? d.note.replace(/[\u0000-\u0008\u000b-\u001f\u007f<>]/g, "").trim().slice(0, 500) || null : null
  return {
    ok: true,
    row: {
      local_delivery_enabled: enabled,
      local_delivery_codes: codes,
      local_delivery_price_cents: price ?? 0,
      local_delivery_min_cents: min,
      local_delivery_free_over_cents: freeOver,
      local_delivery_note: note,
    },
  }
}

/** The price of local delivery from this location for an order of `orderCents`, or null when it is not offered. */
export function localDeliveryPrice(d: LocalDelivery, orderCents: number): number | null {
  if (!d.enabled || d.codes.length === 0) return null
  if (d.minOrderCents !== null && orderCents < d.minOrderCents) return null
  if (d.freeOverCents !== null && d.freeOverCents > 0 && orderCents >= d.freeOverCents) return 0
  return Math.max(0, d.priceCents)
}

/**
 * Every location that can bring this cart to this address. `orderCents` is
 * what the buyer pays for the items that ship, after their discounts.
 */
export function localDeliveryOptions(
  locations: Location[],
  lines: PickupLine[],
  available: (variantId: string, locationId: string) => number,
  address: { country: string | null | undefined; postalCode: string | null | undefined } | null,
  orderCents: number,
): DeliveryOption[] {
  if (!address?.country || !postalKey(address.postalCode)) return []
  const country = address.country.trim().toUpperCase()
  const out: DeliveryOption[] = []
  for (const l of locations) {
    const d = l.localDelivery
    if (!d || !l.active || !l.fulfillsOrders) continue
    if ((l.country ?? "").toUpperCase() !== country || !deliversTo(d.codes, address.postalCode)) continue
    const price = localDeliveryPrice(d, orderCents)
    if (price === null) continue
    /* The same hand over rule as pickup: the seller's own items, in stock there. */
    if (!canPickUp({ ...l, pickupEnabled: true }, lines, available)) continue
    out.push({ id: `local:${l.id}`, kind: "local", name: "Local delivery", priceCents: price, minDays: null, maxDays: null, rateIds: [], local: { locationId: l.id, note: d.note } })
  }
  /* Two places near enough to deliver from: each says which. */
  if (out.length > 1) for (const o of out) o.name = `Local delivery from ${locations.find((l) => l.id === o.local?.locationId)?.name ?? "the shop"}`
  return out.sort((a, b) => a.priceCents - b.priceCents)
}
