import "server-only"

/**
 * ===========================================================================
 *  CARRIER CALCULATED RATES AT CHECKOUT (SHIPPO, EASYPOST)
 * ===========================================================================
 * A shipping zone can hold a rate of the kind "Carrier calculated"
 * (Settings › Shipping › a zone › Add rate): its price is asked of the
 * seller's Shippo or EasyPost account for the buyer's address, the parcel
 * (the default package, the cart's weight) and the address of the location
 * it ships from. lib/physical/rates.ts quoteDelivery already prices such a
 * rate from the map this returns, and leaves it out when the map has none.
 *
 *   in time      the providers are asked at once, each given TIMEOUT_MS; one
 *                that is slow, down, not connected or in another currency
 *                adds nothing, and the zone's other rates are offered as
 *                always. The buyer never waits on a carrier for long and
 *                never sees a price that was guessed.
 *   kept         an answer is kept for ten minutes for the same store,
 *                provider, place and weight, so the checkout's quote, its
 *                re-quote when the buyer pays, and a page reload agree on the
 *                price and ask the provider once.
 *   which rate   the service the seller named on the rate ("usps_priority",
 *                "Priority"), or the cheapest when none was named
 */

import type { Db } from "@/lib/physical/auth"
import { loadPackages, type ShippingPackage } from "@/lib/physical/config-server"
import { zoneFor } from "@/lib/physical/rates"
import type { ShippingProfile, ShippingRate } from "@/lib/physical/types"
import { connectedKey } from "./connect-server"
import { fromPlace, parcelOf } from "./labels-server"
import { easypost } from "./easypost"
import { shippo } from "./shippo"
import type { LabelApi, LabelRate } from "./types"

export const CARRIER_TIMEOUT_MS = 3500
const KEEP_MS = 10 * 60_000
const APIS: Record<string, LabelApi> = { shippo, easypost }
/** The apps a "Carrier calculated" rate can be priced by: Settings offers that kind only while one of them is connected. */
export const CARRIER_RATE_APPS: readonly string[] = Object.keys(APIS)

const kept = new Map<string, { at: number; rates: LabelRate[] }>()

/** The carrier calculated rates in the zones this address falls in. */
export function carrierRatesFor(profiles: ShippingProfile[], destination: { country: string; region?: string | null }): ShippingRate[] {
  const out: ShippingRate[] = []
  for (const p of profiles) {
    const zone = zoneFor(p, destination)
    for (const r of zone?.rates ?? []) if (r.active && r.kind === "carrier" && r.carrier && APIS[r.carrier]) out.push(r)
  }
  return out
}

/** The provider's rate a carrier calculated rate stands for: the service named, else the cheapest. Pure. */
export function pickCarrierRate(rate: Pick<ShippingRate, "serviceCode">, offered: LabelRate[], currency: string): LabelRate | null {
  const same = offered.filter((r) => r.currency.toUpperCase() === currency.toUpperCase())
  const want = (rate.serviceCode ?? "").trim().toLowerCase()
  const list = want ? same.filter((r) => (r.serviceCode ?? "").toLowerCase() === want || r.service.toLowerCase() === want) : same
  return list.sort((a, b) => a.cents - b.cents)[0] ?? null
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      () => {
        clearTimeout(t)
        resolve(null)
      },
    )
  })
}

/**
 * Prices for the zone's carrier calculated rates, by rate id, in cents of
 * the checkout's currency. Empty (no call made) when the address falls in
 * no zone that has one.
 */
export async function liveCarrierQuotes(
  db: Db,
  input: {
    creatorId: string
    profiles: ShippingProfile[]
    destination: { country: string; region?: string | null; postalCode?: string | null; city?: string | null; line1?: string | null }
    grams: number
    currency: string
    storeName?: string
  },
): Promise<Map<string, number>> {
  const quotes = new Map<string, number>()
  const rates = carrierRatesFor(input.profiles, input.destination)
  if (rates.length === 0 || !input.destination.postalCode) return quotes
  const providers = [...new Set(rates.map((r) => r.carrier as string))]
  const [from, packages] = await Promise.all([fromPlace(db, input.creatorId, null, input.storeName ?? "Store"), loadPackages(db, input.creatorId).catch(() => [] as ShippingPackage[])])
  if (!from?.address) return quotes
  const pkg = packages.find((p) => p.isDefault) ?? packages[0] ?? null
  /* No package saved: a small box, as carriers price most parcels of this weight. */
  const parcel = parcelOf(pkg ?? { lengthMm: 250, widthMm: 200, heightMm: 100 }, null, Math.max(100, input.grams + (pkg?.weightGrams ?? 0)))
  if (!parcel) return quotes
  const to = {
    name: "Buyer",
    line1: input.destination.line1 || "Address to follow",
    city: input.destination.city || "",
    region: input.destination.region ?? null,
    postalCode: input.destination.postalCode ?? null,
    country: input.destination.country.toUpperCase(),
  }
  const answered = await Promise.all(
    providers.map(async (id) => {
      /* The city is part of the key: an answer asked without one (often nothing, in Europe) is never kept for the address once it has one. */
      const key = `${input.creatorId}|${id}|${to.country}|${to.region ?? ""}|${String(to.postalCode).toUpperCase()}|${to.city.trim().toLowerCase()}|${Math.ceil(parcel.grams / 50)}|${pkg?.id ?? ""}`
      const hit = kept.get(key)
      if (hit && Date.now() - hit.at < KEEP_MS) return [id, hit.rates] as const
      const cred = await connectedKey(db, input.creatorId, id)
      if (!cred) return [id, [] as LabelRate[]] as const
      const got = await withTimeout(APIS[id].rates(cred.key, { from: from.address!, to, parcel, reference: `storelib:checkout:${input.creatorId}` }), CARRIER_TIMEOUT_MS)
      if (!got) return [id, [] as LabelRate[]] as const
      kept.set(key, { at: Date.now(), rates: got.rates })
      if (kept.size > 500) kept.delete(kept.keys().next().value as string)
      return [id, got.rates] as const
    }),
  )
  const byProvider = new Map<string, LabelRate[]>(answered.map(([id, r]) => [id, [...r]]))
  for (const r of rates) {
    const picked = pickCarrierRate(r, byProvider.get(r.carrier as string) ?? [], input.currency)
    if (picked) quotes.set(r.id, picked.cents)
  }
  return quotes
}

/** For a test: forget what was kept. */
export function forgetCarrierQuotes(): void {
  kept.clear()
}
