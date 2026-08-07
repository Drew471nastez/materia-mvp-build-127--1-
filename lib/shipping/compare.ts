import {
  getPrices,
  listFixedLocations,
  type EawbLocker,
  type EawbPriceOption,
  type EawbShipmentInput,
} from "@/lib/eawb"

/**
 * ===========================================================================
 *  WHICH COURIER IS ACTUALLY CHEAPEST FOR THIS ROUTE
 * ===========================================================================
 *
 * Storelib was hardcoded to Sameday locker→locker at 19.89 RON. Measured
 * against the live API, FAN Courier does the same Bucharest→Cluj parcel for
 * 16.17 RON. Hardcoding a carrier means overpaying on every route where it is
 * not the best one, and nothing in the code would ever say so.
 *
 * ---------------------------------------------------------------------------
 * THE TRAP THIS FILE EXISTS TO AVOID
 * ---------------------------------------------------------------------------
 * `/orders/prices` accepts `carrier_id: 0` as a wildcard and returns every
 * carrier at once. That looks like the obvious way to do this, and it is wrong.
 *
 * Verified: a wildcard quote sent with SAMEDAY locker ids (66725 → 2210235)
 * cheerfully returned a FAN Courier option. The price engine resolves the
 * addresses to localities and prices from those — it does not check that the
 * locker belongs to the carrier it is quoting. Book that FAN option with a
 * Sameday locker id and creation either fails or, worse, routes the parcel
 * somewhere nobody chose.
 *
 * So every carrier is quoted with ITS OWN lockers, one request each. Each
 * returned option therefore carries the exact locker pair it was priced with,
 * and selecting an option means selecting those lockers too. A quote you cannot
 * book is not a quote.
 *
 * Nothing here creates anything. `/orders/prices` has no side effects.
 */

/** One bookable option: a price, and the exact lockers it was priced with. */
export interface CompareOption {
  carrierId: number
  carrier: string
  serviceId: number
  serviceName: string
  amount: number
  vat: number
  total: number
  currency: string
  estimatedPickup: string | null
  estimatedDelivery: string | null
  /** Sameday requires a printed label; FAN did not, on the same route. */
  labelPrintRequired: boolean
  /** The lockers this price is valid for. Selecting the option selects these. */
  from: ComparedLocker
  to: ComparedLocker
}

export interface ComparedLocker {
  id: number
  name: string
  address: string
  street: string
  streetNumber: string
  locality: string
  county: string
}

/** A carrier that could not be quoted, and why. Surfaced rather than dropped:
 *  "FAN has no drop-off locker in that town" is useful, and silence is not. */
export interface CompareSkip {
  carrierId: number
  carrier: string
  reason: string
}

/** Diacritic- and case-insensitive contains, so "Bucuresti" finds "București". */
function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

/**
 * The provider gives one "address" string; the API wants a street AND a number,
 * and it rejects an empty number:
 *   "The street_number field is required when address ID is not provided"
 *
 * 975 of the 12,079 Romanian lockers have no trailing number. Their addresses
 * look like "str. BANAT Nr. FN", "str. Unirii nr." or "str. 1 DECEMBRIE" —
 * where the digit is part of the street NAME, not a house number.
 *
 * So the fallback is "FN" — *fără număr*, the standard Romanian notation for a
 * building with no street number, and what the couriers' own data already uses.
 * It is a real value with a real meaning, not a fabricated "1" pointing at a
 * building that exists. The `fixed_location_id` is what actually determines
 * where the parcel goes; these fields accompany it.
 */
export const NO_STREET_NUMBER = "FN"

export function splitStreet(address: string, fallbackName = "Easybox"): { street: string; streetNumber: string } {
  const a = String(address ?? "").trim()
  // Anchored at the END: a leading digit belongs to the street name
  // ("1 Decembrie 1918" is a street, not number 1).
  //
  // The character class after \d+ MUST include digits. Without them "3-7"
  // split as street "…Ion 3-" / number "7", and "Calea Vitan 55-59" as
  // "Calea Vitan 55-" / "59" — the house number torn in half and its first
  // digits glued to the street name. Requiring whitespace before the number
  // ([\s,]+ not *) stops the match starting mid-word.
  const m = a.match(/^(.*?)[\s,]+(\d+[A-Za-z0-9\-/]*)\s*$/)
  if (m) return { street: m[1].trim() || fallbackName, streetNumber: m[2] }

  // No trailing number. Strip a dangling "nr." / "Nr. FN" so the street does not
  // end in a stray abbreviation, then say FN explicitly.
  const street = a.replace(/[\s,]*nr\.?\s*(fn)?\s*$/i, "").trim()
  return { street: street || fallbackName, streetNumber: NO_STREET_NUMBER }
}

/**
 * Does this locker sit in the place the caller named?
 *
 * Matches the COUNTY as well as the locality, and Bucharest is the reason.
 * Only 47 lockers are filed under locality "Bucuresti"; the other ~2,600 are
 * under "Sector 1" through "Sector 6", with county "Bucuresti". Matching on
 * locality alone finds 47 of them and silently reports that DPD, GLS and Cargus
 * have no presence in the capital — which is how this was discovered.
 */
function matchesPlace(l: EawbLocker, folded: string): boolean {
  if (!folded) return false
  return fold(l.locality_name || "").includes(folded) || fold(l.county_name || "").includes(folded)
}

function toCompared(l: EawbLocker): ComparedLocker {
  const { street, streetNumber } = splitStreet(l.address, (l.name || "").trim())
  return {
    id: Number(l.id),
    name: (l.name || "").trim(),
    address: String(l.address ?? ""),
    street,
    streetNumber,
    locality: l.locality_name || "",
    county: l.county_name || "",
  }
}

/** Locker→locker only. Storelib does not ship door-to-door. */
const SERVICE_LOCKER_TO_LOCKER = 4

export interface CompareInput {
  fromLocality: string
  toLocality: string
  weightKg?: number
  width?: number
  height?: number
  length?: number
  contents?: string
  billingAddressId: number
  contact?: string
  phone?: string
  email?: string
  /** Pin the sender to one locker (the seller's usual drop-off point) instead of
   *  letting each carrier choose. Only carriers owning this locker can then be
   *  compared, which is the correct restriction — a seller with one locker
   *  nearby cannot use a carrier that does not serve it. */
  fromLockerId?: number
}

export interface CompareResult {
  options: CompareOption[]
  skipped: CompareSkip[]
  /** Cheapest first. The caller should not have to sort to find the answer. */
  cheapest: CompareOption | null
}

/**
 * Price this route with every carrier that has lockers at both ends.
 *
 * One request per carrier, run concurrently — five carriers is five parallel
 * quotes, not a serial walk. A carrier that errors is recorded in `skipped` and
 * never takes the whole comparison down with it: a courier being briefly
 * unreachable should cost you that option, not the page.
 */
export async function compareLockerRoutes(input: CompareInput): Promise<CompareResult> {
  const all = await listFixedLocations("RO")
  const fFrom = fold(input.fromLocality.trim())
  const fTo = fold(input.toLocality.trim())

  const carriers = new Map<number, string>()
  for (const l of all) if (l.carrier_id) carriers.set(Number(l.carrier_id), l.carrier_name || `#${l.carrier_id}`)

  const usable = (l: EawbLocker) => l.is_active !== false

  const jobs = [...carriers].map(async ([carrierId, carrier]): Promise<
    { option: CompareOption } | { skip: CompareSkip }
  > => {
    const mine = all.filter((l) => Number(l.carrier_id) === carrierId && usable(l))

    // The seller drops the parcel off, so the SENDER locker must accept
    // drop-offs. A recipient locker has no such constraint.
    const from = input.fromLockerId
      ? mine.find((l) => Number(l.id) === input.fromLockerId)
      : mine.find((l) => l.allows_drop_off !== false && matchesPlace(l, fFrom))
    if (!from) {
      return {
        skip: {
          carrierId,
          carrier,
          reason: input.fromLockerId
            ? "locker-ul expeditorului nu aparține acestui curier"
            : `fără easybox de predare în „${input.fromLocality}”`,
        },
      }
    }

    const to = mine.find((l) => matchesPlace(l, fTo))
    if (!to) return { skip: { carrierId, carrier, reason: `fără easybox de livrare în „${input.toLocality}”` } }

    const weight = input.weightKg && input.weightKg > 0 ? input.weightKg : 1
    const cFrom = toCompared(from)
    const cTo = toCompared(to)

    const shipment: EawbShipmentInput = {
      carrier_id: carrierId,
      service_id: SERVICE_LOCKER_TO_LOCKER,
      billing_address_id: input.billingAddressId,
      address_from: {
        contact: input.contact || "Storelib",
        phone: input.phone || "",
        email: input.email || "",
        country_code: "RO",
        county_name: cFrom.county,
        locality_name: cFrom.locality,
        street_name: cFrom.street,
        street_number: cFrom.streetNumber,
        fixed_location_id: cFrom.id,
      },
      address_to: {
        contact: input.contact || "Storelib",
        phone: input.phone || "",
        email: input.email || "",
        country_code: "RO",
        county_name: cTo.county,
        locality_name: cTo.locality,
        street_name: cTo.street,
        street_number: cTo.streetNumber,
        fixed_location_id: cTo.id,
      },
      total_weight: weight,
      parcels: [
        {
          sequence_no: 1,
          size: {
            weight,
            width: input.width && input.width > 0 ? input.width : 25,
            height: input.height && input.height > 0 ? input.height : 10,
            length: input.length && input.length > 0 ? input.length : 35,
          },
        },
      ],
      parcel_content: input.contents || "Articol Storelib",
    }

    try {
      const { options } = await getPrices(shipment)
      // The wildcard problem in miniature: even a carrier-specific quote can
      // echo back other carriers. Only the one whose lockers were actually used
      // is bookable, so anything else is discarded rather than shown.
      const own = options.find((o: EawbPriceOption) => Number(o.carrier_id) === carrierId)
      if (!own) return { skip: { carrierId, carrier, reason: "niciun tarif locker→locker pentru această rută" } }

      return {
        option: {
          carrierId,
          carrier: own.carrier || carrier,
          serviceId: Number(own.service_id) || SERVICE_LOCKER_TO_LOCKER,
          serviceName: own.service_name || "De la locker la locker",
          amount: Number(own.price?.amount ?? 0),
          vat: Number(own.price?.vat ?? 0),
          total: Number(own.price?.total ?? 0),
          currency: own.price?.currency || "RON",
          estimatedPickup: own.estimated_pickup_date ?? null,
          estimatedDelivery: own.estimated_delivery_date ?? null,
          labelPrintRequired: own.label_print_required === true,
          from: cFrom,
          to: cTo,
        },
      }
    } catch (err) {
      // One courier's outage is not the comparison's problem. The message is
      // authored in lib/eawb.ts and carries no credential.
      return { skip: { carrierId, carrier, reason: (err as Error)?.message?.slice(0, 160) || "eroare furnizor" } }
    }
  })

  const settled = await Promise.all(jobs)
  const options = settled.flatMap((r) => ("option" in r ? [r.option] : []))
  const skipped = settled.flatMap((r) => ("skip" in r ? [r.skip] : []))

  options.sort((a, b) => a.total - b.total)
  return { options, skipped, cheapest: options[0] ?? null }
}
