/**
 * ===========================================================================
 *  PRINTFUL (https://developers.printful.com/docs/)
 * ===========================================================================
 * A private token, Bearer auth, on one Printful store (X-PF-Store-Id, which
 * an account level token needs and a store token accepts).
 *
 *   connect      GET  /stores: the store orders go to
 *   submit       each item is a product the seller made in that Printful
 *                store: its variant is found by the SKU it carries on both
 *                sides (GET /store/products, /store/products/{id}, the
 *                sync variants and their sku). Then POST /orders with
 *                external_id the Storelib order and update_existing, so a
 *                retry updates the same order instead of making a second.
 *                confirm=true only when the seller chose Send to production;
 *                otherwise it waits in Printful as a draft, uncharged.
 *   fetchOrder   GET  /orders/{id}: status and shipments
 *   cancel       DELETE /orders/{id}: a draft or pending order only; one
 *                Printful has started is refused, and the timeline says so.
 *   webhooks     Printful keeps ONE webhook address per store and does not
 *                sign deliveries. So: only set when the store has none or
 *                already has Storelib's (never replacing a seller's own),
 *                with a secret token in the address, and a delivery is
 *                never believed: Storelib reads the order back from Printful
 *                with the seller's key before anything moves.
 *
 * Rate limit: 120 a minute. A 429 is retried by the job queue.
 */

import { call, cancelling, ProviderError } from "./http"
import { cleanCurrency, toMinor } from "@/lib/integrations/shipping/money"
import type { ConnectorCredential, FulfilmentConnector, ProviderOrderStage, ProviderOrderState } from "./types"

const API = "https://api.printful.com"
const NAME = "Printful"
export const PRINTFUL_TYPES = ["package_shipped", "order_failed", "order_canceled", "order_put_hold"] as const
/** At most this many products are read looking for SKUs, so one order can't spend the minute's allowance. */
const MAX_PRODUCT_READS = 40

function headers(cred: { key: string; config?: Record<string, unknown> }): Record<string, string> {
  const store = cred.config?.store_id
  return { Authorization: `Bearer ${cred.key}`, ...(typeof store === "string" && /^[0-9]{1,15}$/.test(store) ? { "X-PF-Store-Id": store } : {}) }
}

const STAGE: Record<string, ProviderOrderStage> = {
  draft: "draft",
  inreview: "pending",
  pending: "pending",
  inprocess: "in_production",
  partial: "partially_shipped",
  fulfilled: "shipped",
  canceled: "cancelled",
  failed: "problem",
  onhold: "problem",
  archived: "cancelled",
}

export function readPrintfulOrder(o: any): ProviderOrderState {
  const status = String(o?.status ?? "pending")
  const stage = STAGE[status] ?? "pending"
  const shipments = (Array.isArray(o?.shipments) ? o.shipments : []).map((s: any) => ({
    carrier: typeof s?.carrier === "string" ? s.carrier : null,
    trackingNumber: s?.tracking_number != null && String(s.tracking_number) !== "0" ? String(s.tracking_number) : null,
    trackingUrl: typeof s?.tracking_url === "string" ? s.tracking_url.trim() : null,
    delivered: false,
  }))
  return {
    providerOrderId: o?.id != null ? String(o.id) : "",
    externalId: typeof o?.external_id === "string" ? o.external_id : null,
    stage,
    problem: stage === "problem" ? (status === "onhold" ? "Printful put this order on hold. Open it in Printful to see why." : "Printful could not process this order. Open it in Printful to fix it.") : null,
    shipments,
  }
}

/** The SKUs asked for, each to its Printful sync variant id, reading the store's products until all are found. */
export async function findSyncVariants(cred: ConnectorCredential, skus: string[]): Promise<Map<string, number>> {
  const want = new Set(skus.map((s) => s.trim()).filter(Boolean))
  const found = new Map<string, number>()
  const cached = (cred.config.sku_map ?? {}) as Record<string, unknown>
  for (const s of want) if (typeof cached[s] === "number") found.set(s, cached[s] as number)
  let reads = 0
  for (let offset = 0; found.size < want.size && reads < MAX_PRODUCT_READS; offset += 100) {
    const page = await call<{ result?: { id: number }[]; paging?: { total?: number } }>(NAME, `${API}/store/products?offset=${offset}&limit=100`, { headers: headers(cred) })
    const products = Array.isArray(page?.result) ? page.result : []
    reads++
    for (const p of products) {
      if (found.size >= want.size || reads >= MAX_PRODUCT_READS) break
      const one = await call<{ result?: { sync_variants?: { id: number; sku?: string | null }[] } }>(NAME, `${API}/store/products/${encodeURIComponent(String(p.id))}`, { headers: headers(cred) })
      reads++
      for (const v of one?.result?.sync_variants ?? []) {
        const sku = typeof v.sku === "string" ? v.sku.trim() : ""
        if (sku && want.has(sku) && typeof v.id === "number") found.set(sku, v.id)
      }
    }
    const total = Number(page?.paging?.total ?? 0)
    if (products.length < 100 || offset + 100 >= total) break
  }
  return found
}

/** Printful's costs block ({ currency, total: "13.25" }) as what the seller pays, or null when it has none yet. */
export function printfulCost(costs: { currency?: string; total?: string | number } | null | undefined): { cents: number; currency: string } | null {
  const cents = toMinor(costs?.total, costs?.currency)
  return cents != null && cents > 0 ? { cents, currency: cleanCurrency(costs?.currency) } : null
}

export const printful: FulfilmentConnector = {
  id: "printful",
  name: NAME,

  async connect(key) {
    const stores = await call<{ result?: { id: number; name?: string; type?: string }[] }>(NAME, `${API}/stores`, { headers: { Authorization: `Bearer ${key}` } })
    const list = Array.isArray(stores?.result) ? stores.result : []
    if (list.length === 0) throw new ProviderError("Printful: this token has no store. Make a Manual order / API store in Printful first.", 400, false)
    const own = list.find((s) => s.type === "native" || s.type === "api") ?? list[0]
    return { config: { store_id: String(own.id), store_count: list.length }, account: typeof own.name === "string" ? own.name : null }
  },

  async submit(cred, order) {
    const map = await findSyncVariants(cred, order.lines.map((l) => l.sku))
    const missing = order.lines.filter((l) => !map.has(l.sku.trim()))
    if (missing.length > 0) throw new ProviderError(`Printful has no product with SKU ${missing.map((l) => l.sku).join(", ")}. Give the Printful variant the same SKU as in Storelib.`, 422, false)
    const a = order.address
    const made = await call<{ result?: { id?: number; status?: string; costs?: { currency?: string; total?: string | number } } }>(NAME, `${API}/orders?confirm=${order.autoConfirm ? "true" : "false"}&update_existing=true`, {
      method: "POST",
      headers: headers(cred),
      body: {
        external_id: order.externalId,
        shipping: "STANDARD",
        recipient: {
          name: a.name,
          company: a.company ?? undefined,
          address1: a.line1,
          address2: a.line2 ?? undefined,
          city: a.city,
          state_code: a.region ?? undefined,
          country_code: a.country,
          zip: a.postalCode ?? undefined,
          phone: a.phone ?? undefined,
          email: a.email ?? undefined,
        },
        items: order.lines.map((l) => ({ sync_variant_id: map.get(l.sku.trim()), quantity: l.quantity, external_id: l.lineId.slice(0, 32), name: l.title.slice(0, 120) })),
        packing_slip: { custom_order_id: order.label.slice(0, 32) },
      },
    })
    const id = made?.result?.id
    if (id == null) throw new ProviderError("Printful took the order but did not say its number.", 502, true)
    return { providerOrderId: String(id), stage: STAGE[String(made?.result?.status ?? "draft")] ?? "draft", cost: printfulCost(made?.result?.costs) }
  },

  async fetchOrder(cred, providerOrderId) {
    if (!/^[0-9]{1,15}$/.test(providerOrderId)) throw new ProviderError("Printful: that is not a Printful order.", 400, false)
    const body = await call<{ result?: unknown }>(NAME, `${API}/orders/${providerOrderId}`, { headers: headers(cred) })
    return readPrintfulOrder(body?.result)
  },

  async registerWebhooks(cred, url) {
    const now = await call<{ result?: { url?: string | null } }>(NAME, `${API}/webhooks`, { headers: headers(cred) }).catch(() => null)
    const there = now?.result?.url ?? null
    if (there && there !== url) return { ok: false, note: "Your Printful store already sends its updates to another address, so Storelib checks Printful for tracking every few hours instead." }
    await call(NAME, `${API}/webhooks`, { method: "POST", headers: headers(cred), body: { url, types: PRINTFUL_TYPES } })
    return { ok: true, note: null }
  },

  async removeWebhooks(cred, url) {
    const now = await call<{ result?: { url?: string | null } }>(NAME, `${API}/webhooks`, { headers: headers(cred) })
    if (now?.result?.url === url) await call(NAME, `${API}/webhooks`, { method: "DELETE", headers: headers(cred) })
  },

  async cancel(cred, providerOrderId) {
    if (!/^[0-9]{1,15}$/.test(providerOrderId)) return { cancelled: false, note: "Printful: that is not a Printful order." }
    return cancelling(() => call(NAME, `${API}/orders/${providerOrderId}`, { method: "DELETE", headers: headers(cred) }))
  },
}
