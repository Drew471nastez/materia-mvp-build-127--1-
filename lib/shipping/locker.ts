import { splitStreet } from "@/lib/shipping/compare"
import type { EawbLocker } from "@/lib/eawb"

/**
 * ===========================================================================
 *  ONE LOCKER SHAPE, WHATEVER THE CARRIER CALLS IT
 * ===========================================================================
 *
 * Five carriers come through eAWB — Sameday, DPD, FAN, GLS, Cargus — and the
 * aggregator already flattens them into one payload. This narrows that payload
 * to the fields the app actually uses, and is the ONLY place a provider field
 * name appears. When a second aggregator is added, it gets its own normaliser
 * and nothing downstream changes.
 *
 * ---------------------------------------------------------------------------
 * WHAT SURVIVES NORMALISATION, AND WHY IT MATTERS
 * ---------------------------------------------------------------------------
 * `providerLockerId` is the provider's own id and is carried through untouched
 * all the way to the AWB request. This is the field whose absence produced
 *
 *     "Service 4 requires fixed location for pickup address"
 *
 * and the reason that class of error cannot recur is that the id is captured at
 * selection time and never re-derived from an address later. An address can be
 * edited, transliterated, or match two lockers; an id cannot.
 *
 * `carrierId` travels with it, because a locker is meaningless without the
 * network it belongs to — DPD cannot collect from a Sameday easybox.
 */

export type LockerAvailability = "available" | "unavailable" | "unknown"

/** One opening interval. `day` is ISO-8601: 1 = Monday … 7 = Sunday. */
export interface LockerHours {
  day: number
  opens: string
  closes: string
}

export interface Locker {
  /** Stable app-side id. Same value as `providerLockerId` today, kept separate
   *  so a second provider can be prefixed without breaking stored selections. */
  id: string
  /** THE FIELD THE AWB NEEDS. Never re-derived from an address. */
  providerLockerId: number
  provider: string
  carrierId: number
  carrier: string
  name: string
  addressLine1: string
  city: string
  county: string | null
  country: string
  latitude: number | null
  longitude: number | null
  /** Filled in per-request when the buyer's position is known. */
  distanceMeters?: number
  /** Street and number, split for the provider's address fields. Kept here so
   *  the split happens once, server-side, rather than in three call sites. */
  street: string
  streetNumber: string
  localityId: number | null
  /** Only lockers that accept drop-offs can be a SENDER's locker. */
  allowsDropOff: boolean
  availability: LockerAvailability
  /** Empty when the provider sent none — never invented. */
  hours: LockerHours[]
  /** "locker" | "office" | … as the provider labels it. */
  kind: string | null
}

/** Round-the-clock, which most easyboxes are — worth saying in one word rather
 *  than seven identical rows. */
export function isAlwaysOpen(hours: LockerHours[]): boolean {
  if (hours.length < 7) return false
  return hours.every((h) => h.opens.startsWith("00:00") && (h.closes.startsWith("23:5") || h.closes === "24:00"))
}

function normaliseHours(raw: unknown): LockerHours[] {
  if (!Array.isArray(raw)) return []
  const out: LockerHours[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const e = entry as Record<string, unknown>
    const day = Number(e.day)
    const opens = String(e.openingHour ?? e.opening_hour ?? "").trim()
    const closes = String(e.closingHour ?? e.closing_hour ?? "").trim()
    // A row missing either end is not an opening time; dropping it is better
    // than rendering "09:00 – " next to a real one.
    if (!Number.isInteger(day) || day < 1 || day > 7 || !opens || !closes) continue
    out.push({ day, opens, closes })
  }
  return out.sort((a, b) => a.day - b.day)
}

/**
 * Turn one eAWB fixed location into our shape.
 *
 * Returns null for anything that cannot be delivered to — an inactive locker is
 * not a choice, and offering it would produce a booking the carrier rejects.
 */
export function normalizeLocker(raw: EawbLocker): Locker | null {
  const providerLockerId = Number(raw.id)
  if (!Number.isInteger(providerLockerId) || providerLockerId <= 0) return null
  if (raw.is_active === false) return null

  const name = String(raw.name ?? "").trim()
  const addressLine1 = String(raw.address ?? "").trim()
  const { street, streetNumber } = splitStreet(addressLine1, name || "Easybox")

  const c = raw.coordinates
  const lat = c ? Number(c.lat) : NaN
  const lng = c ? Number(c.long) : NaN
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)

  return {
    id: String(providerLockerId),
    providerLockerId,
    provider: "eawb",
    carrierId: Number(raw.carrier_id) || 0,
    carrier: String(raw.carrier_name ?? "").trim(),
    name: name || "Easybox",
    addressLine1,
    city: String(raw.locality_name ?? "").trim(),
    county: String(raw.county_name ?? "").trim() || null,
    country: String(raw.country_code ?? "RO").trim().toUpperCase(),
    latitude: hasCoords ? lat : null,
    longitude: hasCoords ? lng : null,
    street,
    streetNumber,
    localityId: Number(raw.locality_id) || null,
    allowsDropOff: raw.allows_drop_off !== false,
    // Always "unknown" for anything this function returns, because an inactive
    // locker was already rejected above — the compiler pointed out that the
    // "unavailable" branch was unreachable.
    //
    // And unknown is the honest answer regardless: the provider exposes
    // `is_active` and nothing finer, so reporting "available" for a locker that
    // may well be full would be a promise we cannot keep.
    availability: "unknown",
    hours: normaliseHours(raw.schedule),
    kind: raw.fixed_location_type ?? null,
  }
}

/** Normalise a list, dropping the ones that are not usable. */
export function normalizeLockers(raw: EawbLocker[]): Locker[] {
  const out: Locker[] = []
  for (const r of raw) {
    const l = normalizeLocker(r)
    if (l) out.push(l)
  }
  return out
}

/**
 * The subset stored on an order or a buyer's saved preference.
 *
 * Deliberately NOT the whole Locker: opening hours and coordinates change, and
 * a snapshot of them taken at checkout would slowly become a lie. What is kept
 * is what the AWB needs plus enough to render the choice back to a human.
 */
export interface StoredLocker {
  providerLockerId: number
  carrierId: number
  name: string
  street: string
  streetNumber: string
  city: string
  county: string | null
  country: string
}

export function toStoredLocker(l: Locker): StoredLocker {
  return {
    providerLockerId: l.providerLockerId,
    carrierId: l.carrierId,
    name: l.name,
    street: l.street,
    streetNumber: l.streetNumber,
    city: l.city,
    county: l.county,
    country: l.country,
  }
}

/**
 * Which end of the journey a locker is for.
 *
 * Modelled separately and named, because reusing one for both is a silent,
 * expensive bug: the parcel is collected from wherever `pickup` says and
 * delivered to wherever `delivery` says, and if they are the same object it
 * goes nowhere at all.
 */
export type LockerRole = "pickup" | "delivery"

/** Where a parcel goes, in full. The order and the checkout agree on this. */
export interface ShippingSelection {
  method: "home" | "locker"
  carrierId?: number
  serviceId?: number
  pickupLocker?: StoredLocker
  deliveryLocker?: StoredLocker
}
