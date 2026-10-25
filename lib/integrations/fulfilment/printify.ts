/**
 * ===========================================================================
 *  PRINTIFY (https://developers.printify.com)
 * ===========================================================================
 * A personal access token, Bearer auth, on one Printify shop.
 *
 *   connect      GET  /v1/shops.json, the shop orders go to: one with no
 *                sales channel of its own ("disconnected", an API shop)
 *                before one that is tied to Etsy or Shopify
 *   submit       POST /v1/shops/{shop}/orders.json, each item by its SKU
 *                (Printify's "order an existing product using only an SKU"),
 *                external_id the Storelib order, Printify's own buyer email
 *                off (Storelib emails the buyer). Printify keeps it on hold
 *                for the seller to approve, unless they chose Send to
 *                production: then POST .../send_to_production.json.
 *   fetchOrder   GET  /v1/shops/{shop}/orders/{id}.json: status and shipments
 *   cancel       POST /v1/shops/{shop}/orders/{id}/cancel.json: Printify
 *                cancels an order on hold or unpaid only, else refuses.
 *   webhooks     POST /v1/shops/{shop}/webhooks.json, one per topic
 *                (order:shipment:created, order:shipment:delivered,
 *                order:updated), each with Storelib's secret: Printify signs
 *                every delivery X-Pfy-Signature: sha256=HMAC(secret, body).
 *
 * Rate limit: 600 a minute overall. A 429 is retried by the job queue.
 */

import { call, cancelling, ProviderError, splitName } from "./http"
import type { ConnectorCredential, FulfilmentConnector, ProviderOrderStage, ProviderOrderState } from "./types"

const API = "https://api.printify.com/v1"
const NAME = "Printify"
export const PRINTIFY_TOPICS = ["order:shipment:created", "order:shipment:delivered", "order:updated"] as const

const auth = (key: string) => ({ Authorization: `Bearer ${key}` })

function shopOf(cred: ConnectorCredential): string {
  const id = cred.config.shop_id
  if (typeof id !== "string" && typeof id !== "number") throw new ProviderError("Printify: no shop is chosen. Connect Printify again.", 400, false)
  const s = String(id)
  if (!/^[0-9]{1,15}$/.test(s)) throw new ProviderError("Printify: the saved shop is not valid. Connect Printify again.", 400, false)
  return s
}

const STAGE: Record<string, ProviderOrderStage> = {
  pending: "pending",
  "on-hold": "draft",
  "sending-to-production": "in_production",
  "in-production": "in_production",
  "partially-fulfilled": "partially_shipped",
  fulfilled: "shipped",
  canceled: "cancelled",
  cancelled: "cancelled",
  "payment-not-received": "problem",
  "has-issues": "problem",
}

export function readPrintifyOrder(body: any): ProviderOrderState {
  const shipments = Array.isArray(body?.shipments) ? body.shipments : []
  const status = String(body?.status ?? "pending")
  let stage = STAGE[status] ?? "pending"
  const list = shipments.map((s: any) => ({
    carrier: typeof s?.carrier === "string" ? s.carrier : null,
    trackingNumber: s?.number != null ? String(s.number) : null,
    trackingUrl: typeof s?.url === "string" ? s.url : null,
    delivered: !!s?.delivered_at,
  }))
  if (list.length > 0 && list.every((s: { delivered: boolean }) => s.delivered) && stage === "shipped") stage = "delivered"
  return {
    providerOrderId: String(body?.id ?? ""),
    externalId: typeof body?.external_id === "string" ? body.external_id : null,
    stage,
    problem: stage === "problem" ? (status === "payment-not-received" ? "Printify could not charge your Printify account for this order." : "Printify says this order has an issue. Open it in Printify.") : null,
    shipments: list,
  }
}

export const printify: FulfilmentConnector = {
  id: "printify",
  name: NAME,

  async connect(key) {
    const shops = await call<{ id: number; title?: string; sales_channel?: string }[]>(NAME, `${API}/shops.json`, { headers: auth(key) })
    if (!Array.isArray(shops) || shops.length === 0) throw new ProviderError("Printify: this account has no shop yet. Make one in Printify first.", 400, false)
    const own = shops.find((s) => s.sales_channel === "disconnected" || s.sales_channel === "custom_integration") ?? shops[0]
    return { config: { shop_id: String(own.id), shop_count: shops.length }, account: typeof own.title === "string" ? own.title : null }
  },

  async submit(cred, order) {
    const shop = shopOf(cred)
    const name = splitName(order.address.name)
    const made = await call<{ id?: string }>(NAME, `${API}/shops/${shop}/orders.json`, {
      method: "POST",
      headers: auth(cred.key),
      body: {
        external_id: order.externalId,
        label: order.label,
        line_items: order.lines.map((l) => ({ sku: l.sku, quantity: l.quantity, external_id: l.lineId })),
        shipping_method: 1,
        is_printify_express: false,
        is_economy_shipping: false,
        send_shipping_notification: false,
        address_to: {
          first_name: name.first,
          last_name: name.last,
          email: order.address.email ?? undefined,
          phone: order.address.phone ?? undefined,
          country: order.address.country,
          region: order.address.region ?? "",
          address1: order.address.line1,
          address2: order.address.line2 ?? "",
          city: order.address.city,
          zip: order.address.postalCode ?? "",
          company: order.address.company ?? undefined,
        },
      },
    })
    const id = typeof made?.id === "string" && made.id ? made.id : null
    if (!id) throw new ProviderError("Printify took the order but did not say its number.", 502, true)
    if (order.autoConfirm) {
      await call(NAME, `${API}/shops/${shop}/orders/${encodeURIComponent(id)}/send_to_production.json`, { method: "POST", headers: auth(cred.key), body: {} })
      return { providerOrderId: id, stage: "in_production" }
    }
    return { providerOrderId: id, stage: "draft" }
  },

  async fetchOrder(cred, providerOrderId) {
    if (!/^[A-Za-z0-9]{6,40}$/.test(providerOrderId)) throw new ProviderError("Printify: that is not a Printify order.", 400, false)
    const body = await call(NAME, `${API}/shops/${shopOf(cred)}/orders/${providerOrderId}.json`, { headers: auth(cred.key) })
    return readPrintifyOrder(body)
  },

  async registerWebhooks(cred, url, secret) {
    const shop = shopOf(cred)
    const existing = await call<{ id: string; topic: string; url: string }[]>(NAME, `${API}/shops/${shop}/webhooks.json`, { headers: auth(cred.key) }).catch(() => [])
    const ids: string[] = []
    for (const topic of PRINTIFY_TOPICS) {
      const mine = Array.isArray(existing) ? existing.find((w) => w.topic === topic && w.url === url) : null
      /* Ours already, from an earlier connect: replaced, so it carries the secret saved now. */
      if (mine) await call(NAME, `${API}/shops/${shop}/webhooks/${encodeURIComponent(mine.id)}.json`, { method: "DELETE", headers: auth(cred.key) }).catch(() => undefined)
      const made = await call<{ id?: string }>(NAME, `${API}/shops/${shop}/webhooks.json`, { method: "POST", headers: auth(cred.key), body: { topic, url, secret } })
      if (made?.id) ids.push(made.id)
    }
    return { ok: true, note: null, ids }
  },

  async removeWebhooks(cred, url) {
    const shop = shopOf(cred)
    const existing = await call<{ id: string; url: string }[]>(NAME, `${API}/shops/${shop}/webhooks.json`, { headers: auth(cred.key) })
    for (const w of Array.isArray(existing) ? existing : []) {
      if (w.url === url) await call(NAME, `${API}/shops/${shop}/webhooks/${encodeURIComponent(w.id)}.json`, { method: "DELETE", headers: auth(cred.key) }).catch(() => undefined)
    }
  },

  async cancel(cred, providerOrderId) {
    if (!/^[A-Za-z0-9]{6,40}$/.test(providerOrderId)) return { cancelled: false, note: "Printify: that is not a Printify order." }
    const shop = shopOf(cred)
    return cancelling(() => call(NAME, `${API}/shops/${shop}/orders/${providerOrderId}/cancel.json`, { method: "POST", headers: auth(cred.key), body: {} }))
  },
}
