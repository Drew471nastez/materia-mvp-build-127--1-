/**
 * ===========================================================================
 *  EASYPOST (https://docs.easypost.com)
 * ===========================================================================
 * One API key as HTTP Basic (the key, an empty password). A test key
 * starts EZTK and its labels are free samples that never ship; a live key
 * starts EZAK.
 *
 *   checkAddress  POST /v2/addresses {address, verify: ["delivery"]}:
 *                 verifications.delivery.success, with errors
 *   rates         POST /v2/shipments: to and from address, one parcel in
 *                 inches and ounces, reference "storelib:<order>", options
 *                 label_format PDF; the answer carries every rate
 *   readRate      GET  /v2/shipments/{id}: the rate and the reference, read
 *                 back from EasyPost before anything is bought
 *   buy           POST /v2/shipments/{id}/buy {rate: {id}}: tracking_code,
 *                 postage_label (label_pdf_url or label_url), tracker
 *   voidLabel     POST /v2/shipments/{id}/refund: refund_status submitted
 *                 while the carrier decides, refunded, or rejected
 */

import { call, ProviderError } from "../fulfilment/http"
import { cleanCurrency, toMinor } from "./money"
import type { LabelAddress, LabelApi, LabelRate } from "./types"

const API = "https://api.easypost.com/v2"
const NAME = "EasyPost"
const auth = (key: string) => ({ Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` })

const IN_PER_CM = 1 / 2.54
const OZ_PER_G = 1 / 28.349523125
const round1 = (n: number) => Math.max(0.1, Math.round(n * 10) / 10)

function address(a: LabelAddress) {
  return {
    name: a.name.slice(0, 100),
    company: a.company ?? undefined,
    street1: a.line1,
    street2: a.line2 ?? undefined,
    city: a.city,
    state: a.region ?? undefined,
    zip: a.postalCode ?? undefined,
    country: a.country,
    phone: a.phone ?? undefined,
    email: a.email ?? undefined,
  }
}

function readRate(r: any, shipmentId: string): LabelRate | null {
  const cents = toMinor(r?.rate, r?.currency)
  if (!r?.id || cents === null) return null
  return {
    id: String(r.id),
    shipmentId: String(r.shipment_id ?? shipmentId),
    carrier: String(r.carrier ?? "Carrier").slice(0, 60),
    service: String(r.service ?? "Shipping").slice(0, 120),
    serviceCode: typeof r.service === "string" ? r.service.slice(0, 60) : null,
    cents,
    currency: cleanCurrency(r.currency),
    days: Number.isFinite(Number(r.delivery_days)) && r.delivery_days !== null ? Number(r.delivery_days) : null,
  }
}

const words = (list: unknown): string[] =>
  (Array.isArray(list) ? list : [])
    .map((m: any) => (typeof m?.message === "string" ? m.message : typeof m === "string" ? m : ""))
    .map((t: string) => t.trim())
    .filter(Boolean)
    .slice(0, 4)

const ID = /^[A-Za-z0-9_]{6,64}$/

export const easypost: LabelApi = {
  id: "easypost",
  name: NAME,
  isTestKey: (key) => key.startsWith("EZTK"),

  async checkAddress(key, a) {
    const body = await call<any>(NAME, `${API}/addresses`, { method: "POST", headers: auth(key), body: { address: address(a), verify: ["delivery"] } })
    const v = body?.verifications?.delivery
    return { ok: v ? v.success !== false : true, messages: words(v?.errors) }
  },

  async rates(key, input) {
    const p = input.parcel
    const body = await call<any>(NAME, `${API}/shipments`, {
      method: "POST",
      headers: auth(key),
      body: {
        shipment: {
          to_address: address(input.to),
          from_address: address(input.from),
          parcel: { length: round1(p.lengthCm * IN_PER_CM), width: round1(p.widthCm * IN_PER_CM), height: round1(p.heightCm * IN_PER_CM), weight: round1(p.grams * OZ_PER_G) },
          reference: input.reference,
          options: { label_format: "PDF" },
        },
      },
    })
    const shipmentId = String(body?.id ?? "")
    if (!shipmentId) throw new ProviderError("EasyPost did not return a shipment.", 502, true)
    const rates = (Array.isArray(body?.rates) ? body.rates : []).map((r: any) => readRate(r, shipmentId)).filter((r: LabelRate | null): r is LabelRate => !!r)
    return { shipmentId, rates, messages: words(body?.messages) }
  },

  async readRate(key, shipmentId, rateId) {
    if (!ID.test(shipmentId) || !ID.test(rateId)) return null
    const body = await call<any>(NAME, `${API}/shipments/${encodeURIComponent(shipmentId)}`, { headers: auth(key) })
    const r = (Array.isArray(body?.rates) ? body.rates : []).find((x: any) => String(x?.id) === rateId)
    const rate = r ? readRate(r, shipmentId) : null
    return rate ? { ...rate, shipmentId, reference: typeof body?.reference === "string" ? body.reference : null } : null
  },

  async buy(key, rate) {
    const s = await call<any>(NAME, `${API}/shipments/${encodeURIComponent(rate.shipmentId)}/buy`, { method: "POST", headers: auth(key), body: { rate: { id: rate.id } } })
    const label = s?.postage_label?.label_pdf_url ?? s?.postage_label?.label_url
    if (typeof label !== "string" || !/^https:\/\//.test(label)) throw new ProviderError("EasyPost: the label could not be made.", 422, false)
    const picked = readRate(s?.selected_rate, rate.shipmentId)
    return {
      labelId: String(s.id ?? rate.shipmentId),
      shipmentId: rate.shipmentId,
      carrier: picked?.carrier ?? rate.carrier,
      service: picked?.service ?? rate.service,
      trackingNumber: typeof s?.tracking_code === "string" && s.tracking_code.trim() ? s.tracking_code.trim() : null,
      trackingUrl: typeof s?.tracker?.public_url === "string" && /^https:\/\//.test(s.tracker.public_url) ? s.tracker.public_url : null,
      labelUrl: label,
      /* What EasyPost charged, when it says; the rate read back before buying otherwise. */
      cents: picked?.cents ?? rate.cents,
      currency: picked?.currency ?? rate.currency,
    }
  },

  async voidLabel(key, purchase) {
    const s = await call<any>(NAME, `${API}/shipments/${encodeURIComponent(purchase.shipmentId)}/refund`, { method: "POST", headers: auth(key), body: {} })
    const st = String(s?.refund_status ?? "")
    return st === "refunded" ? "voided" : st === "rejected" || st === "not_applicable" ? "rejected" : "pending"
  },
}
