import type { SupabaseClient } from "@supabase/supabase-js"

import { listFixedLocations } from "@/lib/eawb"
import { splitStreet } from "@/lib/shipping/compare"
import { senderCarrierId } from "@/lib/shipping/create-awb"

/**
 * ===========================================================================
 *  WHERE THIS BUYER WANTS PARCELS DELIVERED
 * ===========================================================================
 *
 * Vinted asks before taking the money, and so does Storelib. But at that moment
 * the order does not exist yet — the payment flow creates it — so the choice is
 * stored against the BUYER and attached to the order afterwards.
 *
 * That indirection is not incidental: it is what lets this feature exist
 * without a single edit to how an order is created. The checkout files insert
 * orders through a full-then-minimal fallback, and adding columns to that
 * insert would mean a failed full insert silently degrades to the minimal one —
 * an order that quietly loses its delivery address. Attaching afterwards cannot
 * do that.
 *
 * Keyed by user_id when signed in and by email when not, because checkout
 * allows guests. Both columns already exist on `orders`, so the attachment is a
 * lookup.
 */

/**
 * Where the parcel goes, and therefore which courier service is used.
 *
 * The seller always drops off at a locker, so the buyer's choice decides the
 * second half: locker→locker (service 4) or locker→door (service 3). Verified
 * live, Bucharest→Cluj: DPD 13.23 RON to a locker, 15.23 RON to a door.
 */
export type DeliveryMode = "locker" | "home"

export interface ShippingPreference {
  mode: DeliveryMode
  /** Null for home delivery. */
  lockerId: number | null
  carrierId: number | null
  contact: string
  phone: string
  countryCode: string
  county: string | null
  locality: string | null
  street: string | null
  streetNo: string | null
  /** Flat, block, floor — free text the courier prints. Locker name for lockers. */
  details: string | null
  postalCode: string | null
}

/** The buyer, however we can identify them. */
export interface BuyerIdentity {
  userId?: string | null
  email?: string | null
}

/**
 * The one form an email is compared in.
 *
 * Rows are written lowercased, so lookups must lowercase too — and both sides
 * must go through THIS function, because a guest identified by a
 * differently-cased address silently gets a second row and loses the first.
 */
function normaliseEmail(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase()
}

/** Missing table = the migration has not been run. Not an error; the feature
 *  is simply not switched on yet, and checkout must not break because of it. */
export function isMissingPrefsTable(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  // 42P01 undefined_table; PostgREST answers from its schema cache first.
  if (err.code === "42P01" || err.code === "PGRST205") return true
  return /relation .* does not exist|could not find the table/i.test(err.message ?? "")
}

/**
 * Romanian mobile numbers, the shape couriers accept.
 * Shared so the pre-payment step and the order page cannot disagree about what
 * counts as a valid number.
 */
export function normalisePhone(raw: string): string | null {
  const digits = String(raw ?? "").replace(/[\s.\-()]/g, "")
  if (/^07\d{8}$/.test(digits)) return digits
  if (/^\+407\d{8}$/.test(digits)) return `0${digits.slice(3)}`
  if (/^407\d{8}$/.test(digits)) return `0${digits.slice(2)}`
  return null
}

/**
 * Turn a locker id into a full, trusted address.
 *
 * THE CLIENT SENDS AN ID AND NOTHING ELSE. The street, locality and county are
 * looked up here from the provider's own list, so a request cannot pair a
 * locker in one city with the street of another and have a courier deliver
 * somewhere nobody chose.
 *
 * Also enforces the one-network rule: a locker→locker shipment needs both ends
 * on the same carrier, and the seller's drop-off point fixes which.
 */
export async function resolveLocker(
  lockerId: number,
): Promise<
  | { ok: true; pref: Omit<ShippingPreference, "contact" | "phone">; name: string; address: string; carrier: string }
  | { ok: false; code: "unknown_locker" | "wrong_carrier" | "provider_unavailable" }
> {
  let locker
  try {
    const all = await listFixedLocations("RO")
    locker = all.find((l) => Number(l.id) === lockerId)
  } catch {
    return { ok: false, code: "provider_unavailable" }
  }
  if (!locker) return { ok: false, code: "unknown_locker" }
  if (Number(locker.carrier_id) !== senderCarrierId()) return { ok: false, code: "wrong_carrier" }

  const address = String(locker.address ?? "").trim()
  const name = (locker.name || "").trim()
  const { street, streetNumber } = splitStreet(address, name || "Easybox")

  return {
    ok: true,
    name,
    address,
    carrier: locker.carrier_name || "",
    pref: {
      mode: "locker",
      lockerId,
      carrierId: Number(locker.carrier_id) || null,
      countryCode: locker.country_code || "RO",
      county: locker.county_name || null,
      locality: locker.locality_name || null,
      street,
      streetNo: streetNumber || null,
      details: name || null,
      postalCode: null,
    },
  }
}

/** What a home delivery needs before a courier will accept it. */
export interface HomeAddressInput {
  county?: string
  locality?: string
  street?: string
  streetNo?: string
  details?: string
  postalCode?: string
}

/**
 * Validate a typed street address.
 *
 * Verified against the live API: the provider resolves a free-text
 * `locality_name` to its own locality id ("Cluj-Napoca" → 4571), so a typed
 * town is acceptable and does not need to be chosen from a list. What it will
 * NOT accept is an empty street number — the same rule the lockers hit — so an
 * address with no number says FN, *fără număr*, rather than an empty string.
 *
 * Deliberately permissive about everything else. A courier that cannot find a
 * flat number phones the recipient; a checkout that rejects a legitimate
 * address loses the sale outright, and the two failures are not comparable.
 */
export function validateHomeAddress(
  input: HomeAddressInput,
): { ok: true; pref: Omit<ShippingPreference, "contact" | "phone"> } | { ok: false; field: string; message: string } {
  const county = String(input.county ?? "").trim().slice(0, 80)
  const locality = String(input.locality ?? "").trim().slice(0, 120)
  const street = String(input.street ?? "").trim().slice(0, 160)
  const streetNo = String(input.streetNo ?? "").trim().slice(0, 24)
  const details = String(input.details ?? "").trim().slice(0, 200)
  const postalCode = String(input.postalCode ?? "").trim().slice(0, 12)

  if (county.length < 2) return { ok: false, field: "county", message: "Alege județul." }
  if (locality.length < 2) return { ok: false, field: "locality", message: "Completează localitatea." }
  if (street.length < 3) return { ok: false, field: "street", message: "Completează strada." }

  return {
    ok: true,
    pref: {
      mode: "home",
      lockerId: null,
      // Home delivery is not tied to one network — every carrier delivers to a
      // door — so the carrier is left for the booking step to decide.
      carrierId: null,
      countryCode: "RO",
      county,
      locality,
      street,
      streetNo: streetNo || NO_STREET_NUMBER_FALLBACK,
      details: details || null,
      postalCode: postalCode || null,
    },
  }
}

/** Same notation the lockers use, for the same reason: the API rejects an
 *  empty street_number outright. */
const NO_STREET_NUMBER_FALLBACK = "FN"

/** Save (or replace) this buyer's delivery point. Upsert, not append — a buyer
 *  has one current address, not a history. */
export async function savePreference(
  admin: SupabaseClient,
  who: BuyerIdentity,
  pref: ShippingPreference,
): Promise<{ ok: boolean; notInstalled?: boolean; message?: string }> {
  const row = {
    user_id: who.userId ?? null,
    // Email is only the identity for guests; storing it for signed-in buyers
    // too would make the two unique indexes fight over the same person.
    email: who.userId ? null : normaliseEmail(who.email) || null,
    mode: pref.mode,
    locker_id: pref.lockerId,
    carrier_id: pref.carrierId,
    contact: pref.contact,
    phone: pref.phone,
    country_code: pref.countryCode,
    county: pref.county,
    locality: pref.locality,
    street: pref.street,
    street_no: pref.streetNo,
    details: pref.details,
    postal_code: pref.postalCode,
    updated_at: new Date().toISOString(),
  }

  // Delete-then-insert rather than onConflict: the conflict target differs by
  // identity (user_id for members, lower(email) for guests) and both are
  // partial indexes, which upsert cannot express in one call.
  //
  // `.eq` on a normalised value, NEVER `.ilike`. ilike treats `_` and `%` as
  // wildcards, and underscores are ordinary in email addresses — so
  // "john_doe@x.com" would have matched "johnXdoe@x.com" and this DELETE would
  // have removed a different person's saved address.
  const existing = admin.from("buyer_shipping_prefs").delete()
  const scoped = who.userId
    ? existing.eq("user_id", who.userId)
    : existing.is("user_id", null).eq("email", normaliseEmail(who.email))
  const del = await scoped
  if (del.error && isMissingPrefsTable(del.error)) return { ok: false, notInstalled: true }

  const { error } = await admin.from("buyer_shipping_prefs").insert(row)
  if (error) {
    if (isMissingPrefsTable(error)) return { ok: false, notInstalled: true }
    return { ok: false, message: error.message }
  }
  return { ok: true }
}

/** This buyer's stored delivery point, or null. Never throws — a missing table
 *  or a bad read must not take checkout down. */
export async function readPreference(
  admin: SupabaseClient,
  who: BuyerIdentity,
): Promise<ShippingPreference | null> {
  if (!who.userId && !who.email) return null
  try {
    const q = admin
      .from("buyer_shipping_prefs")
      .select(
        "mode, locker_id, carrier_id, contact, phone, country_code, county, locality, street, street_no, details, postal_code",
      )
      .limit(1)
    // `.eq` on a normalised value, never `.ilike` — see savePreference. A
    // wildcard match here would return a DIFFERENT guest's name and phone
    // number, and then attach their address to this order.
    const { data, error } = await (who.userId
      ? q.eq("user_id", who.userId)
      : q.is("user_id", null).eq("email", normaliseEmail(who.email)))
    if (error || !data?.length) return null
    const r = data[0] as Record<string, unknown>
    return {
      mode: r.mode === "home" ? "home" : "locker",
      lockerId: r.locker_id === null || r.locker_id === undefined ? null : Number(r.locker_id),
      postalCode: (r.postal_code as string) ?? null,
      carrierId: r.carrier_id === null ? null : Number(r.carrier_id),
      contact: String(r.contact ?? ""),
      phone: String(r.phone ?? ""),
      countryCode: String(r.country_code ?? "RO"),
      county: (r.county as string) ?? null,
      locality: (r.locality as string) ?? null,
      street: (r.street as string) ?? null,
      streetNo: (r.street_no as string) ?? null,
      details: (r.details as string) ?? null,
    }
  } catch {
    return null
  }
}

/**
 * Copy a stored preference onto an order that has no delivery point yet.
 *
 * Idempotent and conditional: it only ever writes when `ship_fixed_location_id`
 * is null AND no AWB exists, so running it twice, or after the buyer has
 * already chosen on the order page, changes nothing. That matters because it is
 * called opportunistically — whenever anyone looks at the order — rather than
 * from one guaranteed hook.
 */
export async function applyPreferenceToOrder(
  admin: SupabaseClient,
  orderId: string,
  pref: ShippingPreference,
): Promise<boolean> {
  const { data, error } = await admin
    .from("orders")
    .update({
      ship_contact: pref.contact,
      ship_phone: pref.phone,
      ship_country_code: pref.countryCode,
      ship_county: pref.county,
      ship_locality: pref.locality,
      ship_street: pref.street,
      ship_street_no: pref.streetNo,
      ship_details: pref.details,
      ship_postal_code: pref.postalCode,
      // Null for home delivery, which is what makes the booking step choose
      // locker→door (3) instead of locker→locker (4).
      ship_fixed_location_id: pref.lockerId,
      ship_mode: pref.mode,
      shipping_carrier_id: pref.carrierId,
      shipping_status: "awaiting_shipment",
    })
    .eq("id", orderId)
    // Guarded on ship_mode, NOT on the locker id: a home delivery has no
    // locker, so testing that column would make this re-apply on every poll
    // and would report every home order as still needing an address.
    .is("ship_mode", null)
    .is("awb_number", null)
    .select("id")

  return !error && Array.isArray(data) && data.length > 0
}
