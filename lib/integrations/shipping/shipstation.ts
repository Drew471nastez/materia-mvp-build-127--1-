/**
 * ===========================================================================
 *  SHIPSTATION (https://www.shipstation.com/docs/api/)
 * ===========================================================================
 * An API key and an API secret, as HTTP Basic (key:secret), from
 * ShipStation › Settings › Account › API Settings. Storelib is a custom
 * store there: each paid order that ships is created in ShipStation, the
 * seller prints its label in ShipStation, and the shipment comes back.
 *
 *   verify          GET  /stores: the key pair is good when it answers
 *   upsertOrder     POST /orders/createorder: creates the order, or updates
 *                   the one with the same orderKey (the Storelib order's 32
 *                   hex digits), so a cancellation (orderStatus cancelled)
 *                   and a new address are the same call again
 *   subscribe       POST /webhooks/subscribe {event SHIP_NOTIFY}: ShipStation
 *                   posts { resource_url, resource_type } when a label ships
 *   unsubscribe     DELETE /webhooks/{id}
 *   readResource    GET  <resource_url>, only on ssapi.shipstation.com, with
 *                   the seller's own key: the shipments themselves
 *   shipmentsFor    GET  /shipments?orderId=: the same, asked on a timer when
 *                   the webhook could not be set up or one was missed
 *
 * ShipStation allows 40 calls a minute per key; a 429 is tried again later
 * by the job queue (../fulfilment/http call).
 */

import { carrierOf } from "@/lib/physical/carriers"
import { call, ProviderError } from "../fulfilment/http"

export const SHIPSTATION_API = "https://ssapi.shipstation.com"
const NAME = "ShipStation"

/** "key:secret" as saved (sealed) on the integration. */
export function splitPair(pair: string): { key: string; secret: string } | null {
  const i = pair.indexOf(":")
  if (i <= 0 || i === pair.length - 1) return null
  return { key: pair.slice(0, i), secret: pair.slice(i + 1) }
}

const auth = (pair: string) => {
  const p = splitPair(pair)
  if (!p) throw new ProviderError("ShipStation: the saved key pair is not complete. Connect ShipStation again.", 401, false)
  return { Authorization: `Basic ${Buffer.from(`${p.key}:${p.secret}`).toString("base64")}` }
}

export interface ShipStationAddress {
  name: string
  company: string | null
  street1: string
  street2: string | null
  city: string
  state: string | null
  postalCode: string | null
  country: string
  phone: string | null
  residential: boolean | null
}

export interface ShipStationOrder {
  orderNumber: string
  orderKey: string
  orderDate: string
  paymentDate: string | null
  orderStatus: "awaiting_shipment" | "cancelled" | "on_hold"
  customerEmail: string | null
  customerUsername: string | null
  billTo: ShipStationAddress
  shipTo: ShipStationAddress
  items: { lineItemKey: string; sku: string | null; name: string; imageUrl: string | null; quantity: number; unitPrice: number; weight: { value: number; units: "grams" } | null; options: { name: string; value: string }[] }[]
  amountPaid: number
  taxAmount: number
  shippingAmount: number
  customerNotes: string | null
  requestedShippingService: string | null
  weight: { value: number; units: "grams" } | null
  advancedOptions: { customField1: string; source: string }
}

export interface ShipStationShipment {
  shipmentId: string
  orderId: string | null
  orderKey: string | null
  trackingNumber: string | null
  carrier: string | null
  service: string | null
  voided: boolean
  costCents: number | null
  /** What is in this box, by the lineItemKey Storelib gave each line, when ShipStation lists it. */
  items: { lineItemKey: string; quantity: number }[]
}

/** ShipStation's carrier codes, as the buyer reads the carrier. Unknown codes are left as written for the seller to see. */
export function carrierFromCode(code: unknown): string | null {
  const c = String(code ?? "").toLowerCase()
  if (!c) return null
  if (/stamps|usps|endicia|globalpost/.test(c)) return "USPS"
  if (/^ups/.test(c)) return "UPS"
  if (/fedex/.test(c)) return "FedEx"
  if (/dhl_express/.test(c)) return "DHL Express"
  if (/canada_post/.test(c)) return "Canada Post"
  if (/royal_mail/.test(c)) return "Royal Mail"
  if (/australia_post/.test(c)) return "Australia Post"
  if (/purolator/.test(c)) return "Purolator"
  return carrierOf(c.replace(/_/g, " "))?.name ?? c.slice(0, 40)
}

export function readShipment(s: any): ShipStationShipment | null {
  if (!s || s.shipmentId == null) return null
  const cost = Number(s.shipmentCost)
  return {
    shipmentId: String(s.shipmentId),
    orderId: s.orderId != null ? String(s.orderId) : null,
    orderKey: typeof s.orderKey === "string" ? s.orderKey : null,
    trackingNumber: typeof s.trackingNumber === "string" && s.trackingNumber.trim() ? s.trackingNumber.trim() : null,
    carrier: carrierFromCode(s.carrierCode),
    service: typeof s.serviceCode === "string" ? s.serviceCode : null,
    voided: s.voided === true,
    costCents: Number.isFinite(cost) && cost >= 0 ? Math.round(cost * 100) : null,
    items: (Array.isArray(s.shipmentItems) ? s.shipmentItems : [])
      .filter((i: any) => typeof i?.lineItemKey === "string" && Number(i?.quantity) > 0)
      .map((i: any) => ({ lineItemKey: String(i.lineItemKey), quantity: Math.floor(Number(i.quantity)) })),
  }
}

/** Only ShipStation's own API is read with the seller's key: a webhook body naming another host is ignored. */
export function isShipStationResource(url: unknown): url is string {
  try {
    const u = new URL(String(url ?? ""))
    /* ShipStation's own API hosts: ssapi, and the numbered ones its notifications name (ssapi6, ssapi11). A notification naming a numbered host used to be dropped as "another host", so the shipment never reached the order. */
    return u.protocol === "https:" && /^ssapi\d{0,3}\.shipstation\.com$/.test(u.hostname) && !u.username && !u.password && (u.port === "" || u.port === "443")
  } catch {
    return false
  }
}

export const shipstation = {
  id: "shipstation" as const,
  name: NAME,

  async verify(pair: string): Promise<{ account: string | null }> {
    const stores = await call<any[]>(NAME, `${SHIPSTATION_API}/stores?showInactive=false`, { headers: auth(pair) })
    const n = Array.isArray(stores) ? stores.length : 0
    return { account: n > 0 ? `${n} ${n === 1 ? "store" : "stores"} in ShipStation` : null }
  },

  async upsertOrder(pair: string, order: ShipStationOrder): Promise<{ orderId: string }> {
    const r = await call<any>(NAME, `${SHIPSTATION_API}/orders/createorder`, { method: "POST", headers: auth(pair), body: order })
    if (r?.orderId == null) throw new ProviderError("ShipStation did not return the order.", 502, true)
    return { orderId: String(r.orderId) }
  },

  async subscribe(pair: string, targetUrl: string): Promise<{ id: string }> {
    const r = await call<any>(NAME, `${SHIPSTATION_API}/webhooks/subscribe`, { method: "POST", headers: auth(pair), body: { target_url: targetUrl, event: "SHIP_NOTIFY", store_id: null, friendly_name: "Storelib shipments" } })
    if (r?.id == null) throw new ProviderError("ShipStation did not return the webhook.", 502, true)
    return { id: String(r.id) }
  },

  async unsubscribe(pair: string, id: string): Promise<void> {
    if (!/^[0-9]{1,15}$/.test(id)) return
    await call(NAME, `${SHIPSTATION_API}/webhooks/${id}`, { method: "DELETE", headers: auth(pair) })
  },

  async readResource(pair: string, url: string): Promise<ShipStationShipment[]> {
    if (!isShipStationResource(url)) return []
    const r = await call<any>(NAME, url, { headers: auth(pair) })
    return (Array.isArray(r?.shipments) ? r.shipments : []).map(readShipment).filter((s: ShipStationShipment | null): s is ShipStationShipment => !!s)
  },

  async shipmentsFor(pair: string, orderId: string): Promise<ShipStationShipment[]> {
    if (!/^[0-9]{1,15}$/.test(orderId)) return []
    const r = await call<any>(NAME, `${SHIPSTATION_API}/shipments?orderId=${orderId}&includeShipmentItems=true`, { headers: auth(pair) })
    return (Array.isArray(r?.shipments) ? r.shipments : []).map(readShipment).filter((s: ShipStationShipment | null): s is ShipStationShipment => !!s)
  },
}
