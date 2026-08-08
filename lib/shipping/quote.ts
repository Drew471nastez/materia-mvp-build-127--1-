import { EAWB_SERVICE, getPrices, listFixedLocations, type EawbShipmentInput } from "@/lib/eawb"
import { PLATFORM_CURRENCY } from "@/lib/checkout/currency"
import { USD_RATES } from "@/lib/i18n/currency"
import { NO_STREET_NUMBER, splitStreet } from "@/lib/shipping/compare"
import { senderAddress, senderCarrierId } from "@/lib/shipping/create-awb"

/**
 * ===========================================================================
 *  WHAT THE COURIER COSTS — asked once, answered the same way twice
 * ===========================================================================
 *
 * The checkout shows a shipping line, and the card is charged a total that
 * includes it. Those two numbers come from THIS function, called from two
 * places: the endpoint the page reads at load, and the endpoint that creates
 * the PaymentIntent. That is the only structural defence against a checkout
 * that displays one price and takes another.
 *
 * ---------------------------------------------------------------------------
 * THE CLIENT SENDS AN ID, NEVER A PRICE AND NEVER AN ADDRESS
 * ---------------------------------------------------------------------------
 * A locker is identified by its provider id, and the street, town and county
 * behind it are looked up here from the courier's own list. Nothing the browser
 * says about where a locker is can change what is quoted or where a parcel
 * ends up. The browser DOES send back the price it was shown, but only so the
 * server can refuse to charge a different one — see `quoteMatches`.
 *
 * ---------------------------------------------------------------------------
 * DEGRADING IS FREE SHIPPING, NEVER A GUESS
 * ---------------------------------------------------------------------------
 * If the courier account is not configured yet, or the provider is unreachable,
 * this returns `ok: false` and the checkout charges no postage at all. The
 * alternative — inventing a plausible number — would mean charging a buyer for
 * a service nobody has priced. A sale that costs the platform the postage is a
 * bad day; a sale that overcharges someone is a refund and a complaint.
 */

export type QuoteMode = "locker" | "home"

export interface QuoteInput {
  mode: QuoteMode
  /** Required for `locker`. The provider's fixed_location_id, nothing else. */
  lockerId?: number | null
  /** Required for `home`. Free text; the provider resolves it to a locality. */
  county?: string | null
  locality?: string | null
  weightKg?: number
}

export type QuoteFailure =
  | "not_configured"
  | "unknown_locker"
  | "wrong_carrier"
  | "no_destination"
  | "provider_unavailable"
  | "no_options"

export type QuoteResult =
  | {
      ok: true
      /** In the minor unit of the currency the card is charged in. */
      cents: number
      carrier: string
      carrierId: number
      serviceId: number
      /** What the provider actually said, for the log and nothing else. */
      providerTotal: number
      providerCurrency: string
      estimatedDelivery: string | null
    }
  | { ok: false; code: QuoteFailure; message: string }

/** A parcel of clothes. The same defaults the AWB is booked with, so the
 *  quote is for the shipment that actually gets created. */
const DEFAULT_WEIGHT_KG = Number(process.env.EAWB_DEFAULT_WEIGHT_KG || 1)
const PARCEL = { width: 25, height: 10, length: 35 }

/**
 * The provider bills in lei. The card may not be charged in lei yet.
 *
 * Converted at the same static rate the catalogue has always used, so postage
 * is the same size in real terms either way. Once the currency migration has
 * been run this branch is the identity function and the rate stops mattering.
 */
function toChargeMinorUnits(providerTotal: number, providerCurrency: string): number {
  const bani = Math.round(providerTotal * 100)
  if (PLATFORM_CURRENCY === "ron") return bani
  // Only RON is ever returned by this provider; anything else is unexpected and
  // is passed through rather than converted by a rate that does not apply.
  if (String(providerCurrency || "RON").toUpperCase() !== "RON") return bani
  return Math.round(bani / USD_RATES.RON)
}

/** Is the courier account set up enough to quote anything at all? */
export function shippingQuoteConfigured(): boolean {
  return (
    Boolean(process.env.EAWB_API_KEY) &&
    Number(process.env.EAWB_BILLING_ADDRESS_ID || 0) > 0 &&
    Number(process.env.EAWB_SENDER_LOCKER_ID || 0) > 0
  )
}

/**
 * Price one delivery choice.
 *
 * Never throws. Every way this can fail is a code the caller renders, because
 * "the courier is unreachable" and "that locker is on the wrong network" need
 * very different things said to the person waiting.
 */
export async function quoteDelivery(input: QuoteInput): Promise<QuoteResult> {
  if (!shippingQuoteConfigured()) {
    return { ok: false, code: "not_configured", message: "Livrarea nu este configurată încă." }
  }

  const carrierId = senderCarrierId()
  const weight = input.weightKg && input.weightKg > 0 ? input.weightKg : DEFAULT_WEIGHT_KG

  // ── Where is it going? ────────────────────────────────────────────────────
  let addressTo: EawbShipmentInput["address_to"]
  let serviceId: number

  if (input.mode === "locker") {
    const lockerId = Number(input.lockerId)
    if (!Number.isInteger(lockerId) || lockerId <= 0) {
      return { ok: false, code: "no_destination", message: "Alege un easybox." }
    }

    let locker
    try {
      const all = await listFixedLocations("RO")
      locker = all.find((l) => Number(l.id) === lockerId)
    } catch {
      return { ok: false, code: "provider_unavailable", message: "Curierul nu răspunde. Încearcă din nou." }
    }
    if (!locker) return { ok: false, code: "unknown_locker", message: "Easybox-ul nu mai există." }

    // Both ends of a locker→locker shipment must be on one network: the seller
    // drops off at a fixed locker, and that locker decides the carrier.
    if (Number(locker.carrier_id) !== carrierId) {
      return { ok: false, code: "wrong_carrier", message: "Alege un easybox de la același curier." }
    }

    const { street, streetNumber } = splitStreet(String(locker.address ?? ""), locker.name || "Easybox")
    serviceId = EAWB_SERVICE.lockerToLocker
    addressTo = {
      country_code: locker.country_code || "RO",
      county_name: locker.county_name || undefined,
      locality_name: locker.locality_name || undefined,
      street_name: street,
      street_number: streetNumber || NO_STREET_NUMBER,
      fixed_location_id: lockerId,
    }
  } else {
    const county = String(input.county ?? "").trim()
    const locality = String(input.locality ?? "").trim()
    if (county.length < 2 || locality.length < 2) {
      return { ok: false, code: "no_destination", message: "Completează localitatea." }
    }
    serviceId = EAWB_SERVICE.lockerToDoor
    addressTo = {
      country_code: "RO",
      county_name: county,
      locality_name: locality,
      // A quote is priced on the LOCALITY — couriers band by town, not by house
      // number — so a placeholder street keeps the payload valid without asking
      // for detail the buyer has not typed yet. The AWB is built later from the
      // real address they saved.
      street_name: "Strada",
      street_number: NO_STREET_NUMBER,
    }
  }

  const shipment: EawbShipmentInput = {
    carrier_id: carrierId,
    service_id: serviceId,
    billing_address_id: Number(process.env.EAWB_BILLING_ADDRESS_ID || 0),
    address_from: senderAddress(),
    address_to: addressTo,
    total_weight: weight,
    parcels: [{ sequence_no: 1, size: { weight, ...PARCEL } }],
    parcel_content: "Articol Storelib",
  }

  let options
  try {
    const res = await getPrices(shipment)
    options = res.options
  } catch {
    // Deliberately no payload in the log line: it carries the seller's phone
    // and email, and a price failure is not worth printing those for.
    console.error("[shipping] quote failed", { mode: input.mode, serviceId, carrierId })
    return { ok: false, code: "provider_unavailable", message: "Nu am putut calcula livrarea." }
  }

  // The carrier is pinned, but the provider can answer with several services on
  // it. Cheapest wins — the buyer is not choosing between them.
  const priced = options
    .filter((o) => Number(o.price?.total) > 0)
    .sort((a, b) => Number(a.price.total) - Number(b.price.total))
  const best = priced[0]
  if (!best) return { ok: false, code: "no_options", message: "Nicio opțiune de livrare disponibilă." }

  const currency = best.price.currency || "RON"
  return {
    ok: true,
    cents: toChargeMinorUnits(Number(best.price.total), currency),
    carrier: best.carrier || "",
    carrierId: Number(best.carrier_id) || carrierId,
    serviceId: Number(best.service_id) || serviceId,
    providerTotal: Number(best.price.total),
    providerCurrency: currency,
    estimatedDelivery: best.estimated_delivery_date ?? null,
  }
}

/**
 * Does the price the buyer was shown still hold?
 *
 * Exact, not approximate. A courier tariff does not drift by a few bani between
 * two requests a minute apart, so any difference means the buyer read a stale
 * page — and the honest response to that is to show them the new number, not to
 * quietly charge it.
 */
export function quoteMatches(shown: unknown, quoted: number): boolean {
  const n = Number(shown)
  if (!Number.isFinite(n) || n < 0) return false
  return Math.round(n) === Math.round(quoted)
}
