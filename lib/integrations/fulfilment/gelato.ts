/**
 * ===========================================================================
 *  GELATO (https://dashboard.gelato.com/docs/)
 * ===========================================================================
 * An API key from Gelato's dashboard (Developer › API keys), sent as
 * X-API-KEY on every call.
 *
 *   connect      GET  product.gelatoapis.com/v3/catalogs: a read that only a
 *                key Gelato accepts can make. Refused key, refused connect.
 *   submit       each item by the Gelato product UID and print file the
 *                seller matched the Storelib variant to (links-server.ts),
 *                never a guess from its name or SKU. A Storelib SKU that is
 *                itself a product UID is sent only with a matched print file.
 *                First POST /v4/orders:search for an order with this
 *                orderReferenceId, so a retry after a timeout finds the one
 *                already made instead of making a second. Then POST
 *                /v4/orders with orderType "draft" (waits in Gelato,
 *                uncharged, for the seller to approve) or "order" (Send to
 *                production), the seller's shipment method, the buyer's
 *                address.
 *   fetchOrder   GET  /v4/orders/{id}: fulfillmentStatus, and each item's
 *                fulfillments (trackingCode, trackingUrl, the shipment
 *                method) plus shipment.packages, as Gelato reports them.
 *   cancel       POST /v4/orders/{id}:cancel, which Gelato allows until
 *                the order is in production; after that it refuses.
 *   shipment     GET  shipment.gelatoapis.com/v1/shipment-methods?country=
 *     methods    the methods the seller can choose from (normal, express,
 *                a carrier's own), with whether each has tracking.
 *   webhooks     Gelato's webhooks (order_status_updated,
 *                order_item_tracking_code_updated) are added in the Gelato
 *                dashboard, not by API. So the card shows the seller the
 *                address to paste (with its secret token), and until one
 *                arrives tracking is read on a timer. A delivery is never
 *                believed: the order is read back with the seller's key.
 *
 * Rate limits are Gelato's per key; a 429 is retried by the job queue with
 * its Retry-After.
 */

import { call, cancelling, ProviderError, splitName } from "./http"
import { cleanCurrency, toMinor } from "@/lib/integrations/shipping/money"
import type { ConnectorCredential, FulfilmentConnector, ProviderOrderInput, ProviderOrderStage, ProviderOrderState, ProviderShipment } from "./types"

export const GELATO_ORDER_API = "https://order.gelatoapis.com/v4"
const PRODUCT_API = "https://product.gelatoapis.com/v3"
const SHIPMENT_API = "https://shipment.gelatoapis.com/v1"
const NAME = "Gelato"
/** The events to add in Gelato › Developer › Webhooks, as the card lists them. */
export const GELATO_EVENTS = ["order_status_updated", "order_item_tracking_code_updated"] as const

const auth = (key: string) => ({ "X-API-KEY": key })

/** A Gelato product UID: lower case words joined by underscores, e.g. apparel_product_gca_t-shirt_gsc_crewneck_..._gsi_m_gco_white. */
export const PRODUCT_UID = /^[a-z0-9][a-z0-9_.\-]{5,250}$/
const ORDER_ID = /^[A-Za-z0-9-]{6,64}$/

const STAGE: Record<string, ProviderOrderStage> = {
  draft: "draft",
  created: "pending",
  uploading: "pending",
  passed: "pending",
  pending_approval: "pending",
  digitizing: "in_production",
  printed: "in_production",
  in_production: "in_production",
  shipped: "shipped",
  in_transit: "shipped",
  delivered: "delivered",
  canceled: "cancelled",
  cancelled: "cancelled",
  failed: "problem",
  on_hold: "problem",
  not_connected: "problem",
  returned: "problem",
}

const PROBLEM: Record<string, string> = {
  failed: "Gelato could not produce this order. Open it in Gelato to see why.",
  on_hold: "Gelato put this order on hold. Open it in Gelato to see why.",
  not_connected: "Gelato says this order's products are not connected to a print file. Open it in Gelato to fix it.",
  returned: "Gelato says this parcel was returned to them. Open it in Gelato.",
}

/** One Gelato order (GET /v4/orders/{id}) as Storelib reads it: its stage and each parcel with a tracking code, once. */
export function readGelatoOrder(o: any): ProviderOrderState {
  const status = String(o?.fulfillmentStatus ?? "created").toLowerCase()
  let stage: ProviderOrderStage = STAGE[status] ?? (o?.orderType === "draft" ? "draft" : "pending")
  const seen = new Map<string, ProviderShipment>()
  /* Parcels whose items are all lines Storelib sent (itemReferenceId); one reached by a package only ships what is open, as before. */
  const unknownItems = new Set<string>()
  const add = (code: unknown, url: unknown, carrier: unknown, delivered: boolean, item?: { lineId: string; quantity: number } | null) => {
    const number = typeof code === "string" ? code.trim() : typeof code === "number" ? String(code) : ""
    if (!number) return
    let had = seen.get(number)
    if (had) had.delivered = had.delivered || delivered
    else {
      had = { carrier: typeof carrier === "string" && carrier.trim() ? carrier.trim() : null, trackingNumber: number, trackingUrl: typeof url === "string" && url.trim() ? url.trim() : null, delivered, items: [] }
      seen.set(number, had)
    }
    if (item === undefined) return
    if (!item) unknownItems.add(number)
    else if (!had.items!.some((i) => i.lineId === item.lineId)) had.items!.push(item)
  }
  for (const item of Array.isArray(o?.items) ? o.items : []) {
    const itemDelivered = String(item?.fulfillmentStatus ?? "").toLowerCase() === "delivered" || status === "delivered"
    const ref = typeof item?.itemReferenceId === "string" ? item.itemReferenceId.trim().toLowerCase() : ""
    const quantity = Math.max(0, Math.floor(Number(item?.quantity) || 0))
    const mine = /^[0-9a-f]{32}$/.test(ref) && quantity > 0 ? { lineId: ref, quantity } : null
    for (const f of Array.isArray(item?.fulfillments) ? item.fulfillments : []) add(f?.trackingCode, f?.trackingUrl, f?.shipmentMethodName ?? o?.shipment?.shipmentMethodName, itemDelivered, mine)
  }
  for (const p of Array.isArray(o?.shipment?.packages) ? o.shipment.packages : []) add(p?.trackingCode, p?.trackingUrl, o?.shipment?.shipmentMethodName, status === "delivered")
  const shipments = [...seen.values()].map((s) => (s.items?.length && !unknownItems.has(s.trackingNumber ?? "") ? s : { ...s, items: null }))
  if (stage === "shipped" && shipments.length > 0 && shipments.every((s) => s.delivered)) stage = "delivered"
  return {
    providerOrderId: o?.id != null ? String(o.id) : "",
    externalId: typeof o?.orderReferenceId === "string" ? o.orderReferenceId : null,
    stage,
    problem: stage === "problem" ? (PROBLEM[status] ?? "Gelato says this order has a problem. Open it in Gelato.") : null,
    shipments,
  }
}

/** The body POST /v4/orders takes for one Storelib order. Every item must carry its matched product UID and file. */
/**
 * The order's metadata: its Storelib number, then what each buyer wrote by
 * item ("1 Name": "Ana"). Gelato keeps at most 20 pairs of up to 100
 * characters; the rest, and a picture that is not the item's print file (its
 * link is longer than a value may be), is on the Storelib order page.
 */
export function gelatoMetadata(order: ProviderOrderInput): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [{ key: "storelib_order", value: order.label.slice(0, 100) }]
  order.lines.forEach((l, i) => {
    for (const p of l.personalization ?? []) out.push({ key: `${i + 1} ${p.name}`.slice(0, 100), value: p.value.slice(0, 100) })
  })
  return out.slice(0, 20)
}

export function gelatoOrderBody(cred: ConnectorCredential, order: ProviderOrderInput): Record<string, unknown> {
  /* The print file: the seller's own, else the buyer's picture (a "your photo on canvas" product matched without a file). */
  const fileOf = (l: ProviderOrderInput["lines"][number]) => l.link?.fileUrl || l.printFiles?.[0]?.url || null
  const unmatched = order.lines.filter((l) => !l.link?.providerVariantId || !PRODUCT_UID.test(l.link.providerVariantId) || !fileOf(l))
  if (unmatched.length > 0) {
    throw new ProviderError(
      `Gelato: ${unmatched.map((l) => l.title).join(", ")} ${unmatched.length === 1 ? "is" : "are"} not matched to a Gelato product with a print file. Match ${unmatched.length === 1 ? "it" : "them"} in Settings › Integrations › Gelato.`,
      422,
      false,
    )
  }
  const a = order.address
  const name = splitName(a.name)
  const method = typeof cred.config.shipment_method === "string" && /^[a-z0-9_\-]{2,80}$/i.test(cred.config.shipment_method) ? cred.config.shipment_method : "normal"
  const currency = typeof cred.config.currency === "string" && /^[A-Z]{3}$/.test(cred.config.currency) ? cred.config.currency : "USD"
  return {
    orderType: order.autoConfirm ? "order" : "draft",
    orderReferenceId: order.externalId,
    customerReferenceId: order.externalId,
    currency,
    shipmentMethodUid: method,
    items: order.lines.map((l) => ({
      itemReferenceId: l.lineId,
      productUid: l.link!.providerVariantId,
      files: [{ type: "default", url: fileOf(l) }],
      quantity: l.quantity,
    })),
    metadata: gelatoMetadata(order),
    shippingAddress: {
      firstName: name.first,
      lastName: name.last || name.first,
      companyName: a.company ?? undefined,
      addressLine1: a.line1,
      addressLine2: a.line2 ?? undefined,
      city: a.city,
      postCode: a.postalCode ?? "",
      state: a.region ?? undefined,
      country: a.country,
      email: a.email ?? undefined,
      phone: a.phone ?? undefined,
    },
  }
}

/** The shipment methods Gelato offers to a country, for the seller to choose one. */
export async function gelatoShipmentMethods(key: string, country: string | null): Promise<{ uid: string; name: string; type: string; hasTracking: boolean }[]> {
  const q = country && /^[A-Z]{2}$/.test(country) ? `?country=${country}` : ""
  const body = await call<{ shipmentMethods?: { shipmentMethodUid?: string; name?: string; type?: string; hasTracking?: boolean }[] }>(NAME, `${SHIPMENT_API}/shipment-methods${q}`, { headers: auth(key) })
  return (Array.isArray(body?.shipmentMethods) ? body.shipmentMethods : [])
    .filter((m) => typeof m.shipmentMethodUid === "string" && m.shipmentMethodUid)
    .map((m) => ({ uid: String(m.shipmentMethodUid), name: typeof m.name === "string" ? m.name : String(m.shipmentMethodUid), type: typeof m.type === "string" ? m.type : "normal", hasTracking: m.hasTracking !== false }))
}

/** Is this a product UID Gelato knows? Used when the seller matches a variant, so a typo is caught there and not on a paid order. */
export async function gelatoProductExists(key: string, productUid: string): Promise<{ ok: true; title: string | null } | { ok: false; error: string }> {
  if (!PRODUCT_UID.test(productUid)) return { ok: false, error: "That doesn't look like a Gelato product UID." }
  try {
    const p = await call<{ productUid?: string; attributes?: Record<string, string> }>(NAME, `${PRODUCT_API}/products/${encodeURIComponent(productUid)}`, { headers: auth(key) })
    if (!p || (p.productUid && p.productUid !== productUid)) return { ok: false, error: "Gelato has no product with that UID." }
    return { ok: true, title: null }
  } catch (e) {
    if (e instanceof ProviderError && e.status === 404) return { ok: false, error: "Gelato has no product with that UID." }
    if (e instanceof ProviderError) return { ok: false, error: e.message }
    return { ok: false, error: "Gelato could not be reached. Try again in a moment." }
  }
}

/** What Gelato charges for an order: its receipt's total with VAT (receipts[].totalInclVat, currency), or null before it has one. */
export function gelatoCost(receipts: unknown): { cents: number; currency: string } | null {
  const list = Array.isArray(receipts) ? (receipts as { totalInclVat?: unknown; currency?: unknown; transactionType?: unknown }[]) : []
  const r = list.find((x) => String(x?.transactionType ?? "purchase_order").toLowerCase() !== "refund") ?? null
  const cents = r ? toMinor(r.totalInclVat, r.currency) : null
  return r && cents != null && cents > 0 ? { cents, currency: cleanCurrency(r.currency) } : null
}

export const gelato: FulfilmentConnector = {
  id: "gelato",
  name: NAME,
  matching: "link",
  locationKind: "print_on_demand",

  async connect(key) {
    await call(NAME, `${PRODUCT_API}/catalogs`, { headers: auth(key) })
    return { config: { shipment_method: "normal", currency: "USD" }, account: null }
  },

  async submit(cred, order) {
    const body = gelatoOrderBody(cred, order)
    /* Made already (a retry after a timeout): that order, not a second. */
    const found = await call<{ orders?: { id?: string; orderReferenceId?: string; fulfillmentStatus?: string; orderType?: string }[] }>(NAME, `${GELATO_ORDER_API}/orders:search`, {
      method: "POST",
      headers: auth(cred.key),
      body: { orderReferenceIds: [order.externalId], limit: 1 },
    }).catch((e) => {
      if (e instanceof ProviderError && e.retry) throw e
      return null
    })
    const had = (found?.orders ?? []).find((o) => o.orderReferenceId === order.externalId && o.id)
    if (had?.id) return { providerOrderId: String(had.id), stage: STAGE[String(had.fulfillmentStatus ?? "").toLowerCase()] ?? (had.orderType === "draft" ? "draft" : "pending") }
    const made = await call<{ id?: string; orderType?: string; fulfillmentStatus?: string; receipts?: unknown }>(NAME, `${GELATO_ORDER_API}/orders`, { method: "POST", headers: auth(cred.key), body })
    const id = typeof made?.id === "string" && made.id ? made.id : null
    if (!id) throw new ProviderError("Gelato took the order but did not say its number.", 502, true)
    return { providerOrderId: id, stage: order.autoConfirm ? (STAGE[String(made?.fulfillmentStatus ?? "").toLowerCase()] ?? "pending") : "draft", cost: gelatoCost(made?.receipts) }
  },

  async cancel(cred, providerOrderId) {
    if (!ORDER_ID.test(providerOrderId)) return { cancelled: false, note: "Gelato: that is not a Gelato order." }
    return cancelling(() => call(NAME, `${GELATO_ORDER_API}/orders/${providerOrderId}:cancel`, { method: "POST", headers: auth(cred.key) }))
  },

  async fetchOrder(cred, providerOrderId) {
    if (!ORDER_ID.test(providerOrderId)) throw new ProviderError("Gelato: that is not a Gelato order.", 400, false)
    const body = await call(NAME, `${GELATO_ORDER_API}/orders/${providerOrderId}`, { headers: auth(cred.key) })
    return readGelatoOrder(body)
  },

  async registerWebhooks() {
    return {
      ok: false,
      note: "Gelato's webhooks are added in Gelato, under Developer › Webhooks: paste the address below and tick order status and tracking code updates. Until the first one arrives, Storelib checks Gelato for tracking every few hours.",
    }
  },

  async removeWebhooks() {
    /* Added by the seller in Gelato's dashboard; once disconnected, the address answers 410 and Gelato stops. */
  },
}
