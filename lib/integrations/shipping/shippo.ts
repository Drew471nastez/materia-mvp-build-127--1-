/**
 * ===========================================================================
 *  SHIPPO (https://docs.goshippo.com)
 * ===========================================================================
 * One API key, "Authorization: ShippoToken <key>". A test key starts
 * shippo_test_ and its labels are free samples that never ship.
 *
 *   checkAddress  POST /addresses/ with validate: true; validation_results
 *                 says is_valid, with messages
 *   rates         POST /shipments/ (async false): the from and to address,
 *                 one parcel in cm and g, metadata "storelib:<order>"; the
 *                 answer carries every rate the account's carriers offer
 *   readRate      GET  /shipments/{id}: the rate is read back from Shippo,
 *                 with the shipment's metadata, before anything is bought
 *   buy           POST /transactions/ {rate, label_file_type PDF_4x6, async
 *                 false}: tracking_number, tracking_url_provider, label_url
 *   voidLabel     POST /refunds/ {transaction}: QUEUED or PENDING while the
 *                 carrier decides, SUCCESS when refunded, ERROR when not
 *
 * Every call goes through ../fulfilment/http call: a timeout, and a busy or
 * down Shippo said as one to try again.
 */

import { call, ProviderError } from "../fulfilment/http"
import { cleanCurrency, toMinor } from "./money"
import type { LabelAddress, LabelApi, LabelRate } from "./types"

const API = "https://api.goshippo.com"
const NAME = "Shippo"
const auth = (key: string) => ({ Authorization: `ShippoToken ${key}` })

function address(a: LabelAddress, validate = false) {
  return {
    name: a.name.slice(0, 100),
    company: a.company ?? "",
    street1: a.line1,
    street2: a.line2 ?? "",
    city: a.city,
    state: a.region ?? "",
    zip: a.postalCode ?? "",
    country: a.country,
    phone: a.phone ?? "",
    email: a.email ?? "",
    ...(validate ? { validate: true } : {}),
  }
}

function readRate(r: any, shipmentId: string): LabelRate | null {
  const cents = toMinor(r?.amount, r?.currency)
  if (!r?.object_id || cents === null) return null
  return {
    id: String(r.object_id),
    shipmentId: String(r.shipment ?? shipmentId),
    carrier: String(r.provider ?? "Carrier").slice(0, 60),
    service: String(r.servicelevel?.name ?? r.servicelevel?.token ?? "Shipping").slice(0, 120),
    serviceCode: typeof r.servicelevel?.token === "string" ? r.servicelevel.token.slice(0, 60) : null,
    cents,
    currency: cleanCurrency(r.currency),
    days: Number.isFinite(Number(r.estimated_days)) && r.estimated_days !== null ? Number(r.estimated_days) : null,
  }
}

const words = (list: unknown): string[] =>
  (Array.isArray(list) ? list : [])
    .map((m: any) => (typeof m?.text === "string" ? m.text : typeof m === "string" ? m : ""))
    .map((t: string) => t.trim())
    .filter(Boolean)
    .slice(0, 4)

export const shippo: LabelApi = {
  id: "shippo",
  name: NAME,
  isTestKey: (key) => key.startsWith("shippo_test_"),

  async checkAddress(key, a) {
    const body = await call<any>(NAME, `${API}/addresses/`, { method: "POST", headers: auth(key), body: address(a, true) })
    const v = body?.validation_results
    return { ok: v?.is_valid !== false, messages: words(v?.messages) }
  },

  async rates(key, input) {
    const body = await call<any>(NAME, `${API}/shipments/`, {
      method: "POST",
      headers: auth(key),
      body: {
        address_from: address(input.from),
        address_to: address(input.to),
        parcels: [{ length: String(input.parcel.lengthCm), width: String(input.parcel.widthCm), height: String(input.parcel.heightCm), distance_unit: "cm", weight: String(input.parcel.grams), mass_unit: "g" }],
        metadata: input.reference,
        async: false,
      },
    })
    const shipmentId = String(body?.object_id ?? "")
    if (!shipmentId) throw new ProviderError("Shippo did not return a shipment.", 502, true)
    const rates = (Array.isArray(body?.rates) ? body.rates : []).map((r: any) => readRate(r, shipmentId)).filter((r: LabelRate | null): r is LabelRate => !!r)
    return { shipmentId, rates, messages: words(body?.messages) }
  },

  async readRate(key, shipmentId, rateId) {
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(shipmentId) || !/^[A-Za-z0-9_-]{6,64}$/.test(rateId)) return null
    const body = await call<any>(NAME, `${API}/shipments/${encodeURIComponent(shipmentId)}`, { headers: auth(key) })
    const r = (Array.isArray(body?.rates) ? body.rates : []).find((x: any) => String(x?.object_id) === rateId)
    const rate = r ? readRate(r, shipmentId) : null
    return rate ? { ...rate, shipmentId, reference: typeof body?.metadata === "string" ? body.metadata : null } : null
  },

  async buy(key, rate) {
    const t = await call<any>(NAME, `${API}/transactions/`, { method: "POST", headers: auth(key), body: { rate: rate.id, label_file_type: "PDF_4x6", async: false } })
    if (t?.status !== "SUCCESS" || typeof t?.label_url !== "string" || !/^https:\/\//.test(t.label_url)) {
      const said = words(t?.messages)[0]
      throw new ProviderError(`Shippo: ${said ?? "the label could not be made."}`, 422, false)
    }
    return {
      labelId: String(t.object_id),
      shipmentId: rate.shipmentId,
      carrier: rate.carrier,
      service: rate.service,
      trackingNumber: typeof t.tracking_number === "string" && t.tracking_number.trim() ? t.tracking_number.trim() : null,
      trackingUrl: typeof t.tracking_url_provider === "string" && /^https:\/\//.test(t.tracking_url_provider) ? t.tracking_url_provider : null,
      labelUrl: t.label_url,
      cents: rate.cents,
      currency: rate.currency,
    }
  },

  async voidLabel(key, purchase) {
    const r = await call<any>(NAME, `${API}/refunds/`, { method: "POST", headers: auth(key), body: { transaction: purchase.labelId, async: false } })
    const s = String(r?.status ?? "").toUpperCase()
    return s === "SUCCESS" ? "voided" : s === "ERROR" ? "rejected" : "pending"
  },
}
