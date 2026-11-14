import "server-only"

/**
 * ===========================================================================
 *  BUY A LABEL FROM THE ORDER PAGE (SHIPPO, EASYPOST)
 * ===========================================================================
 * In Orders › an order › Fulfill items › Buy a label, as Shopify has it:
 *
 *   options   the label apps connected (Settings › Integrations), the
 *             packages from Settings › Shipping › Packages with the default
 *             one first, the parcel's weight (the items' own weights, as
 *             sold, plus the empty box), where it ships from (the location's
 *             address) and to (the order's address)
 *   quote     the provider is asked for a shipment and every rate it has,
 *             and the delivery address is checked at the same time: what
 *             the provider says is wrong with it is shown above the rates
 *   buy       the chosen rate is READ BACK from the provider (its price, and
 *             that its shipment is this order's: the reference written on it
 *             when it was quoted), bought, and the items ship with its
 *             carrier and tracking number (orders-server fulfilItems: stock,
 *             status, timeline, the buyer's shipping email). Carrier
 *             tracking then follows the number like any other shipment. The
 *             label's cost is kept on the order (shipping_labels) as the
 *             seller's cost: nothing is charged to the buyer.
 *   void      a label not used yet is refunded by the provider and its
 *             shipment cancelled, so the items are to ship again
 *   ship      a bought label left without a live shipment (its shipment was
 *             cancelled, or marking the items shipped failed after the
 *             purchase) ships them with its tracking: the order page shows
 *             such a label with Print, Ship with this label and Void, so money
 *             spent on a label is never out of the seller's reach
 *
 * Not for a pickup order, nor one the seller delivers themselves (local
 * delivery): neither goes with a carrier. The weight quoted is the items
 * chosen in the dialog, so a partial shipment is priced for its own parcel.
 *
 * One label per quoted shipment: the row is claimed before the provider is
 * asked to buy, so two presses of Buy never buy two labels.
 *
 * A PURCHASE WITH NO ANSWER IS NOT A NO. The provider may time out, drop the
 * connection or say "still making it" after it has charged for the label.
 * The claim used to be thrown away on any failure, so that label was paid
 * for and nowhere on the order, and the next press bought a second one. Now
 * the provider is asked what became of the shipment (findLabel) before
 * anything is decided: a label that exists is taken onto the order, a
 * purchase still in flight keeps its claim, and only a shipment the
 * provider says has no label is released to be bought again.
 *
 * A PARCEL FOR ANOTHER COUNTRY carries a customs declaration made from the
 * order (./customs.ts), and its commercial invoice prints from the order.
 *
 * PRINTING ASKS THE PROVIDER. Shippo's label address expires; its reference
 * says to read the transaction again for a fresh one. So Print label goes
 * through labelDocument, which does, and the address kept on the row is
 * only what is used when the provider can't be reached.
 */

import type { Db } from "@/lib/physical/auth"
import { loadPackages, type ShippingPackage } from "@/lib/physical/config-server"
import { carrierOf } from "@/lib/physical/carriers"
import { regionCode } from "@/lib/physical/regions"
import { addressLines } from "@/lib/physical/address"
import { trackingUrl } from "@/lib/physical/status"
import { providerInfo } from "@/lib/physical/providers"
import { holdOf } from "@/lib/physical/fulfilment-state"
import { ProviderError } from "../fulfilment/http"
import { connectedKey, noteSync } from "./connect-server"
import { customsFor, type CustomsSource } from "./customs"
import { easypost } from "./easypost"
import { formatMinor } from "./money"
import { shippo } from "./shippo"
import type { BuyerPaid, CustomsForm, FoundLabel, LabelAddress, LabelApi, LabelProviderId, LabelPurchase, LabelRate, Parcel, VoidOutcome } from "./types"

export const LABEL_APIS: Record<LabelProviderId, LabelApi> = { shippo, easypost }

export function labelApiFor(provider: unknown): LabelApi | null {
  return provider === "shippo" || provider === "easypost" ? LABEL_APIS[provider] : null
}

/* ── what this file needs from the order engine, handed in (./labels-deps-server.ts), so a test can watch it ── */

export interface LabelOrderLine {
  orderId: string
  title: string
  quantity: number
  fulfilled: number
  requiresShipping: boolean
  locationId: string | null
  /* What a customs declaration reads (./customs.ts). The order engine's lines carry all of them. */
  productId?: string | null
  variantName?: string | null
  sku?: string | null
  /** One unit's price and the whole line's discount, in the order's minor units. */
  unitCents?: number
  discountCents?: number
}
export interface LabelOrder {
  id: string
  status: string
  /** The currency the order was paid in: what a customs declaration states values in. */
  currency?: string | null
  cancelledAt: string | null
  deliveryMethod: string
  buyerName: string | null
  buyerEmail: string | null
  buyerPhone: string | null
  address: Record<string, any> | null
  /** `kind` local: the seller brings it themselves, so no carrier label. */
  delivery?: { kind?: string | null } | null
  lines: LabelOrderLine[]
  shipments: { id: string; status: string; trackingNumber: string | null }[]
  /** The timeline, for a hold (lib/physical/fulfilment-state.ts). Absent where a caller has none. */
  events?: { id?: number; kind: string; createdAt: string; detail?: Record<string, unknown> | null }[]
}
type Outcome = { ok: true; order: any } | { ok: false; error: string; status?: number }
export interface LabelDeps {
  loadOrder: (db: Db, where: { creatorId: string; checkoutId: string }) => Promise<LabelOrder | null>
  fulfilItems: (db: Db, creatorId: string, checkoutId: string, input: { items: { orderId: string; quantity: number }[]; carrier?: unknown; trackingNumber?: unknown; trackingUrl?: unknown; notifyBuyer?: boolean; key?: unknown; locationId?: unknown }) => Promise<Outcome>
  updateShipment: (db: Db, creatorId: string, fulfillmentId: string, input: { status?: unknown; notifyBuyer?: boolean }) => Promise<Outcome>
  addOrderEvent: (db: Db, e: { checkoutId: string; creatorId: string | null; kind: string; message: string; detail?: Record<string, unknown> | null; actor?: "creator" | "system"; key?: string | null }) => Promise<void>
}

/* ── the view the order page draws ─────────────────────────────────────── */

export interface LabelView {
  id: string
  provider: LabelProviderId
  providerName: string
  carrier: string | null
  service: string | null
  trackingNumber: string | null
  labelUrl: string | null
  cents: number
  currency: string
  cost: string
  status: "buying" | "purchased" | "void_pending" | "voided" | "void_rejected"
  testMode: boolean
  fulfillmentId: string | null
  createdAt: string
  /**
   * Where Print label goes: the order's own label route, which asks the provider for the label as it is now
   * (labelDocument). `labelUrl` is the address the provider gave at purchase, which stops working after a while.
   */
  printUrl: string | null
  /** The commercial invoice of a parcel that crossed customs, when the provider made one: the same route. */
  invoiceUrl: string | null
}

/** The order's label route with one label named: app/api/physical/orders/[id]/label. */
const documentPath = (checkoutId: string, labelId: string, doc: "label" | "invoice") => `/api/physical/orders/${encodeURIComponent(checkoutId)}/label?print=${encodeURIComponent(labelId)}${doc === "invoice" ? "&doc=invoice" : ""}`

export function labelView(r: Record<string, any>): LabelView {
  const printable = r.status === "purchased" && typeof r.label_url === "string" && /^https:\/\//.test(r.label_url) && !!r.id && !!r.checkout_id
  return {
    id: r.id,
    provider: r.provider,
    providerName: providerInfo(r.provider)?.name ?? r.provider,
    carrier: r.carrier ?? null,
    service: r.service ?? null,
    trackingNumber: r.tracking_number ?? null,
    labelUrl: typeof r.label_url === "string" && /^https:\/\//.test(r.label_url) ? r.label_url : null,
    cents: Number(r.cost_cents ?? 0),
    currency: r.currency ?? "USD",
    cost: formatMinor(Number(r.cost_cents ?? 0), r.currency ?? "USD"),
    status: r.status,
    testMode: r.test_mode === true,
    fulfillmentId: r.fulfillment_id ?? null,
    createdAt: r.created_at,
    printUrl: printable ? documentPath(r.checkout_id, r.id, "label") : null,
    invoiceUrl: printable && planOf(r.package).invoice ? documentPath(r.checkout_id, r.id, "invoice") : null,
  }
}

export async function listLabels(db: Db, creatorId: string, checkoutId: string): Promise<{ labels: LabelView[]; ready: boolean }> {
  const { data, error } = await db.from("shipping_labels").select("*").eq("creator_id", creatorId).eq("checkout_id", checkoutId).order("created_at", { ascending: true })
  /* Before part 163: no table, so no labels, and the dialog says why it can't buy one. */
  if (error) return { labels: [], ready: false }
  return { labels: ((data ?? []) as Record<string, any>[]).filter((r) => r.status !== "buying").map(labelView), ready: true }
}

/* ── addresses and the parcel ───────────────────────────────────────────── */

export function toAddress(order: LabelOrder): LabelAddress | null {
  const a = order.address
  if (!a?.line1 || !a?.city || !a?.country) return null
  const country = String(a.country).toUpperCase()
  return {
    name: String(a.name ?? order.buyerName ?? "").trim() || "Customer",
    company: a.company ? String(a.company) : null,
    line1: String(a.line1),
    line2: a.line2 ? String(a.line2) : null,
    city: String(a.city),
    region: regionCode(country, a.region) ?? (a.region ? String(a.region) : null),
    postalCode: a.postalCode ? String(a.postalCode) : null,
    country,
    phone: a.phone ? String(a.phone) : order.buyerPhone,
    email: order.buyerEmail,
  }
}

export interface FromPlace {
  locationId: string
  name: string
  address: LabelAddress | null
  /** The location's address as one line, or what is missing from it. */
  line: string
}

/** Where the parcel leaves from: the chosen location, by its own address. A location with no full address is said, not guessed. */
export async function fromPlace(db: Db, creatorId: string, locationId: string | null, storeName: string): Promise<FromPlace | null> {
  let q = db.from("inventory_locations").select("id, name, address_line1, address_line2, city, region, postal_code, country, phone, email").eq("creator_id", creatorId)
  q = locationId ? q.eq("id", locationId) : q.eq("active", true).eq("fulfills_orders", true).order("priority", { ascending: true })
  const { data } = await q.limit(1).maybeSingle()
  if (!data) return null
  const country = data.country ? String(data.country).toUpperCase() : ""
  const complete = !!(data.address_line1 && data.city && country)
  const address: LabelAddress | null = complete
    ? {
        name: storeName.slice(0, 100),
        company: storeName.slice(0, 100),
        line1: data.address_line1,
        line2: data.address_line2 ?? null,
        city: data.city,
        region: regionCode(country, data.region) ?? data.region ?? null,
        postalCode: data.postal_code ?? null,
        country,
        phone: data.phone ?? null,
        email: data.email ?? null,
      }
    : null
  return {
    locationId: data.id,
    name: data.name,
    address,
    line: complete ? addressLines({ name: "", line1: data.address_line1, line2: data.address_line2, city: data.city, region: data.region, postalCode: data.postal_code, country } as never).filter(Boolean).join(", ") : `${data.name} has no full address yet. Add it in Settings › Locations.`,
  }
}

/** One unit of each line, in grams: its weight as sold (the order line's snapshot), else the variant's weight now, else 0. */
export async function gramsEach(db: Db, orderIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (orderIds.length === 0) return out
  const { data } = await db.from("orders").select("id, variant_id, product_snapshot").in("id", orderIds)
  const rows = (data ?? []) as { id: string; variant_id: string | null; product_snapshot: Record<string, any> | null }[]
  const missing = rows.filter((r) => !(Number(r.product_snapshot?.weight_grams) > 0) && r.variant_id).map((r) => r.variant_id as string)
  const variantGrams = new Map<string, number>()
  if (missing.length) {
    const { data: vs } = await db.from("product_variants").select("id, weight_grams").in("id", missing)
    for (const v of (vs ?? []) as { id: string; weight_grams: number | null }[]) variantGrams.set(v.id, Number(v.weight_grams) || 0)
  }
  for (const r of rows) {
    const each = Number(r.product_snapshot?.weight_grams) > 0 ? Number(r.product_snapshot!.weight_grams) : r.variant_id ? (variantGrams.get(r.variant_id) ?? 0) : 0
    out.set(r.id, Math.max(0, each))
  }
  return out
}

/** The items' weight as they were sold. Grams. */
export async function itemsGrams(db: Db, items: { orderId: string; quantity: number }[]): Promise<number> {
  const each = await gramsEach(db, items.map((i) => i.orderId))
  return Math.round(items.reduce((g, i) => g + (each.get(i.orderId) ?? 0) * i.quantity, 0))
}

/**
 * The customs declaration of this parcel, when it leaves for another customs territory (./customs.ts): each chosen
 * line with its value from the order and its origin and HS code from the product, read with the store's own id so
 * another store's product is never read. `needed: false` inside one country or inside the EU.
 */
export async function customsOf(
  db: Db,
  creatorId: string,
  order: LabelOrder,
  items: { orderId: string; quantity: number }[],
  input: { fromCountry: string; toCountry: string; signer: string; providerName: string },
): Promise<{ needed: false } | { needed: true; form: CustomsForm } | { needed: true; error: string }> {
  /* Asked first with no lines: inside one country nothing below is read. */
  if (customsFor({ from: input.fromCountry, to: input.toCountry, currency: "USD", signer: input.signer, providerName: input.providerName, lines: [] }).needed === false) return { needed: false }
  const chosen = items.filter((i) => i.quantity > 0)
  const lineOf = new Map(order.lines.map((l) => [l.orderId, l]))
  const productIds = [...new Set(chosen.map((i) => lineOf.get(i.orderId)?.productId).filter((id): id is string => typeof id === "string" && !!id))]
  type Made = { id: string; origin_country: string | null; hs_code: string | null }
  const readProducts = async (): Promise<Made[]> => {
    if (productIds.length === 0) return []
    const { data } = await db.from("products").select("id, origin_country, hs_code").eq("creator_id", creatorId).in("id", productIds)
    return (data ?? []) as Made[]
  }
  const [each, products] = await Promise.all([gramsEach(db, chosen.map((i) => i.orderId)), readProducts().catch(() => [] as Made[])])
  const productOf = new Map(products.map((p) => [p.id, p]))
  const lines: CustomsSource[] = chosen.flatMap((i) => {
    const l = lineOf.get(i.orderId)
    if (!l) return []
    const product = l.productId ? productOf.get(l.productId) : undefined
    return [{
      title: l.title,
      variantName: l.variantName ?? null,
      sku: l.sku ?? null,
      quantity: i.quantity,
      unitCents: Number(l.unitCents ?? 0),
      lineDiscountCents: Number(l.discountCents ?? 0),
      lineQuantity: l.quantity,
      gramsEach: each.get(i.orderId) ?? 0,
      originCountry: product?.origin_country ?? null,
      hsCode: product?.hs_code ?? null,
    }]
  })
  return customsFor({ from: input.fromCountry, to: input.toCountry, currency: String(order.currency ?? "USD"), signer: input.signer, providerName: input.providerName, lines })
}

/** A package and a weight into the parcel the carrier prices. Null when the size is missing. */
export function parcelOf(pkg: Pick<ShippingPackage, "lengthMm" | "widthMm" | "heightMm"> | null, custom: { lengthCm?: unknown; widthCm?: unknown; heightCm?: unknown } | null, grams: number): Parcel | null {
  const cm = (v: unknown) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 && n <= 1000 ? Math.round(n * 10) / 10 : null
  }
  const l = pkg ? cm(pkg.lengthMm / 10) : cm(custom?.lengthCm)
  const w = pkg ? cm(pkg.widthMm / 10) : cm(custom?.widthCm)
  /* An envelope is kept with no height; carriers want one, so it is a few millimetres. */
  const h = pkg ? (cm(pkg.heightMm / 10) ?? 0.5) : cm(custom?.heightCm)
  if (!l || !w || !h || !(grams > 0) || grams > 1_000_000) return null
  return { lengthCm: l, widthCm: w, heightCm: h, grams: Math.round(grams) }
}

export const referenceFor = (checkoutId: string) => `storelib:${checkoutId}`

/** The items still to ship from one location (all of them when none is named). */
function openItems(order: LabelOrder, locationId: string | null): { orderId: string; quantity: number }[] {
  return order.lines
    .filter((l) => l.requiresShipping && (!locationId || l.locationId === locationId))
    .map((l) => ({ orderId: l.orderId, quantity: Math.max(0, l.quantity - l.fulfilled) }))
    .filter((i) => i.quantity > 0)
}

export function canShip(order: LabelOrder | null): string | null {
  if (!order) return "Order not found."
  if (order.cancelledAt) return "This order was cancelled."
  if (order.status !== "paid" && order.status !== "partially_refunded") return "Only a paid order can be shipped."
  if (order.deliveryMethod === "pickup") return "This order is picked up, so it needs no label."
  if (order.deliveryMethod === "none") return "Nothing on this order is shipped."
  if (order.delivery?.kind === "local") return "You deliver this order yourself, so it needs no label."
  /* Held: no label is bought for it, so none is paid for and then can't be used. */
  const hold = holdOf(order.events ?? [])
  if (hold) return `This order is on hold (${hold.label}). Release the hold to ship it.`
  return null
}

/** The chosen items, each cut to what is still to ship on its line: a stale dialog can't ship more than is left. */
function boundedItems(order: LabelOrder, items: { orderId: string; quantity: number }[]): { orderId: string; quantity: number }[] {
  const left = new Map(order.lines.filter((l) => l.requiresShipping).map((l) => [l.orderId, Math.max(0, l.quantity - l.fulfilled)]))
  const merged = new Map<string, number>()
  for (const i of items) merged.set(i.orderId, (merged.get(i.orderId) ?? 0) + i.quantity)
  return [...merged].map(([orderId, quantity]) => ({ orderId, quantity: Math.min(quantity, left.get(orderId) ?? 0) })).filter((i) => i.quantity > 0)
}

/**
 * What a label was bought for, kept on its row (shipping_labels.package): the box's name, the location and the
 * items; the rate it was quoted at, which is how the provider is asked what became of a purchase that never
 * answered; and whether the provider made a commercial invoice for it.
 */
interface LabelPlan {
  name: string | null
  locationId: string | null
  items: { orderId: string; quantity: number }[]
  rateId?: string | null
  invoice?: boolean
}
function planOf(pkg: unknown): LabelPlan {
  const p = pkg && typeof pkg === "object" ? (pkg as Record<string, unknown>) : {}
  const items = (Array.isArray(p.items) ? p.items : [])
    .map((i: any) => ({ orderId: String(i?.orderId ?? ""), quantity: Math.floor(Number(i?.quantity)) }))
    .filter((i) => /^[0-9a-f-]{36}$/i.test(i.orderId) && i.quantity > 0)
  return {
    name: typeof p.name === "string" ? p.name : null,
    locationId: typeof p.locationId === "string" ? p.locationId : null,
    items,
    rateId: typeof p.rateId === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(p.rateId) ? p.rateId : null,
    invoice: p.invoice === true,
  }
}
/** Kept under the column's 1 KB check: a long order keeps the box, the place and the rate, and ships what is left. */
function planRow(plan: LabelPlan): Record<string, unknown> | null {
  const row: Record<string, unknown> = { name: plan.name ? plan.name.slice(0, 80) : null, locationId: plan.locationId, items: plan.items.slice(0, 10), ...(plan.rateId ? { rateId: plan.rateId.slice(0, 64) } : {}), ...(plan.invoice ? { invoice: true } : {}) }
  if (JSON.stringify(row).length > 900) delete row.items
  return row
}

function providerWords(e: unknown, name: string): string {
  if (e instanceof ProviderError) return e.message
  return `${name} could not be reached. Try again in a moment.`
}

/* ── the dialog's first read ────────────────────────────────────────────── */

export interface LabelOptions {
  ready: boolean
  apps: { id: LabelProviderId; name: string; test: boolean }[]
  packages: ShippingPackage[]
  defaultPackageId: string | null
  unitSystem: "metric" | "imperial"
  itemsGrams: number
  /** One unit of each line still to ship, in grams, so the dialog's weight follows the items chosen in it. */
  lineGrams: Record<string, number>
  from: FromPlace | null
  to: { line: string; complete: boolean }
  labels: LabelView[]
  /**
   * What the buyer chose and paid for at checkout: the rate's name and price, and for a Carrier calculated rate the
   * app and service it was priced by, so the dialog picks that service first. Null for an order with none.
   */
  paid: BuyerPaid | null
}

/** The buyer's chosen rate on the order (commerce_checkouts.shipping_rate), and the zone rate it came from when it was carrier calculated. */
export async function buyerPaidRate(db: Db, creatorId: string, checkoutId: string): Promise<BuyerPaid | null> {
  const { data: co } = await db.from("commerce_checkouts").select("shipping_rate, currency, shipping_cents").eq("id", checkoutId).eq("creator_id", creatorId).maybeSingle()
  const rate = co?.shipping_rate as { name?: unknown; price_cents?: unknown; rate_ids?: unknown; kind?: unknown } | null | undefined
  if (!rate || typeof rate.name !== "string" || !rate.name.trim() || rate.kind === "local") return null
  const cents = Number(rate.price_cents ?? co?.shipping_cents ?? 0)
  const ids = Array.isArray(rate.rate_ids) ? rate.rate_ids.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 10) : []
  let provider: LabelProviderId | null = null
  let serviceCode: string | null = null
  if (ids.length) {
    const { data: rows } = await db.from("shipping_rates").select("id, kind, carrier, service_code").eq("creator_id", creatorId).in("id", ids)
    const carrierRate = ((rows ?? []) as { kind: string; carrier: string | null; service_code: string | null }[]).find((r) => r.kind === "carrier" && (r.carrier === "shippo" || r.carrier === "easypost"))
    if (carrierRate) {
      provider = carrierRate.carrier as LabelProviderId
      serviceCode = carrierRate.service_code?.trim() || null
    }
  }
  return { name: rate.name.trim().slice(0, 120), cents: Number.isFinite(cents) ? cents : 0, price: formatMinor(Number.isFinite(cents) ? cents : 0, String(co?.currency ?? "USD")), provider, serviceCode }
}

export async function labelOptions(db: Db, creatorId: string, checkoutId: string, input: { locationId: string | null; items?: { orderId: string; quantity: number }[]; storeName: string }, deps: LabelDeps): Promise<LabelOptions | { error: string; status?: number }> {
  const order = await deps.loadOrder(db, { creatorId, checkoutId })
  if (!order) return { error: "Order not found.", status: 404 }
  const [apps, packages, from, listed, settings, paid] = await Promise.all([
    Promise.all((["shippo", "easypost"] as const).map(async (id) => {
      const c = await connectedKey(db, creatorId, id)
      return c ? { id, name: LABEL_APIS[id].name, test: LABEL_APIS[id].isTestKey(c.key) } : null
    })).then((l) => l.filter((x): x is { id: LabelProviderId; name: string; test: boolean } => !!x)),
    loadPackages(db, creatorId).catch(() => [] as ShippingPackage[]),
    fromPlace(db, creatorId, input.locationId, input.storeName),
    listLabels(db, creatorId, checkoutId),
    db.from("commerce_settings").select("default_package_id, unit_system").eq("creator_id", creatorId).maybeSingle().then((r: { data: any }) => r.data, () => null),
    buyerPaidRate(db, creatorId, checkoutId).catch(() => null),
  ])
  const items = input.items?.length ? input.items : openItems(order, input.locationId)
  const each = await gramsEach(db, order.lines.filter((l) => l.requiresShipping && l.quantity > l.fulfilled).map((l) => l.orderId))
  const to = toAddress(order)
  const def = packages.find((p) => p.isDefault)?.id ?? (packages.some((p) => p.id === settings?.default_package_id) ? settings.default_package_id : null)
  return {
    ready: listed.ready,
    apps,
    packages: [...packages].sort((a, b) => Number(b.id === def) - Number(a.id === def)),
    defaultPackageId: def,
    unitSystem: settings?.unit_system === "imperial" ? "imperial" : "metric",
    itemsGrams: Math.round(items.reduce((g, i) => g + (each.get(i.orderId) ?? 0) * i.quantity, 0)),
    lineGrams: Object.fromEntries(each),
    from,
    to: { line: to ? addressLines(order.address as never).filter(Boolean).join(", ") : "The order has no complete delivery address.", complete: !!to },
    labels: listed.labels,
    paid,
  }
}

/* ── rates, with the address checked ────────────────────────────────────── */

export interface QuoteResult {
  provider: LabelProviderId
  shipmentId: string
  rates: (LabelRate & { price: string })[]
  /** What the provider says about the delivery address, before anything is bought. */
  addressOk: boolean
  warnings: string[]
  parcel: Parcel
  /** True when the parcel crosses a customs border and was quoted with its declaration. */
  customs?: boolean
}

export async function quoteLabel(
  db: Db,
  creatorId: string,
  checkoutId: string,
  input: { provider: unknown; locationId: string | null; packageId?: unknown; custom?: { lengthCm?: unknown; widthCm?: unknown; heightCm?: unknown } | null; grams?: unknown; storeName: string; items?: { orderId: string; quantity: number }[] },
  deps: LabelDeps,
): Promise<QuoteResult | { error: string; status?: number }> {
  const api = labelApiFor(input.provider)
  if (!api) return { error: "Choose Shippo or EasyPost." }
  const cred = await connectedKey(db, creatorId, api.id)
  if (!cred) return { error: `Connect ${api.name} in Settings › Integrations first.` }
  /* A purchase for this order that never answered is settled first: no new shipment is quoted while a label may already exist. */
  const pending = await settleOpenClaims(db, creatorId, checkoutId, deps)
  if (pending) return { error: pending, status: 409 }
  const order = await deps.loadOrder(db, { creatorId, checkoutId })
  const no = canShip(order)
  if (no) return { error: no }
  const to = toAddress(order!)
  if (!to) return { error: "The order has no complete delivery address. Edit it on the order first." }
  const from = await fromPlace(db, creatorId, input.locationId, input.storeName)
  if (!from?.address) return { error: from ? from.line : "Add a location with its address in Settings › Locations." }
  const packages = await loadPackages(db, creatorId).catch(() => [] as ShippingPackage[])
  const pkg = typeof input.packageId === "string" && input.packageId ? (packages.find((p) => p.id === input.packageId) ?? null) : null
  if (typeof input.packageId === "string" && input.packageId && !pkg) return { error: "That package is not in Settings › Shipping › Packages any more." }
  const typed = Number(input.grams)
  /* No weight typed: the items chosen in the dialog (part of the order, for a partial shipment), plus the box. */
  const chosen = input.items?.length ? boundedItems(order!, input.items) : openItems(order!, input.locationId)
  const grams = Number.isFinite(typed) && typed > 0 ? typed : (await itemsGrams(db, chosen)) + (pkg?.weightGrams ?? 0)
  const parcel = parcelOf(pkg, pkg ? null : (input.custom ?? null), grams)
  if (!parcel) return { error: grams > 0 ? "Choose a package, or enter its size." : "Enter the parcel's weight: these products have none saved." }
  /* Another country: the declaration, from the order. What it lacks is said here, before any rate is shown. */
  const customs = await customsOf(db, creatorId, order!, chosen, { fromCountry: from.address.country, toCountry: to.country, signer: input.storeName, providerName: api.name })
  let declaration: CustomsForm | null = null
  if ("error" in customs) return { error: customs.error }
  if ("form" in customs) declaration = customs.form

  try {
    const [check, quoted] = await Promise.all([
      api.checkAddress(cred.key, to).catch(() => ({ ok: true, messages: [] as string[] })),
      api.rates(cred.key, { from: from.address, to, parcel, reference: referenceFor(checkoutId), customs: declaration }),
    ])
    const rates = quoted.rates.sort((a, b) => a.cents - b.cents).map((r) => ({ ...r, price: formatMinor(r.cents, r.currency) }))
    await noteSync(db, cred.id, { ok: true })
    const warnings = [...(check.ok ? [] : ["The delivery address may not be deliverable as written."]), ...check.messages, ...(rates.length === 0 ? quoted.messages : [])].slice(0, 6)
    return { provider: api.id, shipmentId: quoted.shipmentId, rates, addressOk: check.ok, warnings, parcel, customs: !!declaration }
  } catch (e) {
    const error = providerWords(e, api.name)
    await noteSync(db, cred.id, { ok: false, error })
    return { error }
  }
}

/* ── buying it ──────────────────────────────────────────────────────────── */

/** A claim older than this never finished: the request that made it is gone. */
const STALE_CLAIM_MS = 10 * 60_000
/** A claim younger than this may still be a purchase in flight: its own request has not given up yet. */
const IN_FLIGHT_MS = 2 * 60_000

type ShipOutcome = { ok: true; order: any; label: LabelView } | { ok: false; error: string; status?: number; label?: LabelView }

export async function buyLabel(
  db: Db,
  creatorId: string,
  checkoutId: string,
  input: { provider: unknown; shipmentId: unknown; rateId: unknown; locationId: string | null; items?: { orderId: string; quantity: number }[]; notifyBuyer?: boolean; packageName?: string | null },
  deps: LabelDeps,
): Promise<ShipOutcome> {
  const api = labelApiFor(input.provider)
  if (!api) return { ok: false, error: "Choose Shippo or EasyPost." }
  const shipmentId = String(input.shipmentId ?? "")
  const rateId = String(input.rateId ?? "")
  if (!shipmentId || !rateId) return { ok: false, error: "Choose a rate." }
  const cred = await connectedKey(db, creatorId, api.id)
  if (!cred) return { ok: false, error: `Connect ${api.name} in Settings › Integrations first.` }
  /*
    Bought already (a second press, a retried request): that label, and nothing asked of the provider.
    Its items are shipped now if the first try bought it but could not mark them shipped. A label of
    another order of this store is never handed back for this one.
  */
  const { data: was } = await db.from("shipping_labels").select("*").eq("creator_id", creatorId).eq("provider", api.id).eq("provider_shipment_id", shipmentId).maybeSingle()
  if (was && was.checkout_id !== checkoutId) return { ok: false, error: "That label belongs to another order.", status: 409 }
  if (was && was.status === "purchased") return finishShipping(db, creatorId, checkoutId, was, { notifyBuyer: input.notifyBuyer !== false }, deps)
  if (was && was.status !== "buying") return { ok: true, order: await deps.loadOrder(db, { creatorId, checkoutId }), label: labelView(was) }
  if (was) {
    /* A claim with no label after it: the provider is asked what became of it before anything is said or bought. */
    const settled = await settleClaim(db, creatorId, checkoutId, was, api, cred, deps)
    if (settled.kind === "bought") return finishShipping(db, creatorId, checkoutId, settled.row, { notifyBuyer: input.notifyBuyer !== false }, deps)
    if (settled.kind === "wait") return settled.outcome
    /* Released: the provider has no label for this shipment and the claim is gone, so this press buys it. */
  }
  /* Another purchase for this order that never answered (a different quoted shipment): settled before a second label is bought. */
  const pending = await settleOpenClaims(db, creatorId, checkoutId, deps, shipmentId)
  if (pending) return { ok: false, error: pending, status: 409 }
  const order = await deps.loadOrder(db, { creatorId, checkoutId })
  const no = canShip(order)
  if (no) return { ok: false, error: no }
  const items = boundedItems(order!, input.items?.length ? input.items : openItems(order!, input.locationId))
  if (items.length === 0) return { ok: false, error: "Nothing is left to ship from here." }

  /* The price and the order, from the provider: a rate quoted for another order, or a price the browser made up, is never bought. */
  let rate: (LabelRate & { reference: string | null }) | null
  try {
    rate = await api.readRate(cred.key, shipmentId, rateId)
  } catch (e) {
    return { ok: false, error: providerWords(e, api.name) }
  }
  if (!rate) return { ok: false, error: "That rate has expired. Get rates again." }
  if (rate.reference !== referenceFor(checkoutId)) return { ok: false, error: "That rate was quoted for another order. Get rates again.", status: 409 }

  /* Claimed first: one label per quoted shipment, whoever presses Buy twice. */
  const now = new Date().toISOString()
  const plan: LabelPlan = { name: input.packageName ? String(input.packageName) : null, locationId: input.locationId, items, rateId }
  const { data: claim, error: claimError } = await db
    .from("shipping_labels")
    .insert({ creator_id: creatorId, checkout_id: checkoutId, provider: api.id, provider_shipment_id: shipmentId, provider_label_id: `pending:${shipmentId}`.slice(0, 120), carrier: rate.carrier, service: rate.service, cost_cents: rate.cents, currency: rate.currency, test_mode: api.isTestKey(cred.key), status: "buying", package: planRow(plan), created_at: now, updated_at: now })
    .select("*")
    .maybeSingle()
  if (claimError?.code === "23505") {
    const { data: again } = await db.from("shipping_labels").select("*").eq("provider", api.id).eq("provider_shipment_id", shipmentId).maybeSingle()
    if (again && again.creator_id === creatorId && again.checkout_id === checkoutId && again.status !== "buying") return { ok: true, order: await deps.loadOrder(db, { creatorId, checkoutId }), label: labelView(again) }
    return { ok: false, error: "This label is already being bought. Wait a moment.", status: 409 }
  }
  if (claimError || !claim) return { ok: false, error: claimError?.code === "42P01" || claimError?.code === "PGRST205" ? "Labels turn on after the database update (SQL part 163)." : "The label could not be saved. Nothing was bought." }

  let bought: LabelPurchase
  try {
    bought = await api.buy(cred.key, rate)
  } catch (e) {
    /*
      NOT AN ANSWER YET. A timeout, a dropped connection, a 5xx or "still making it" may all follow a label that
      was bought and charged. So the provider is asked for this shipment's label before the claim is touched.
    */
    const refused = e instanceof ProviderError && !e.retry
    let found: FoundLabel | null = null
    try {
      found = await api.findLabel(cred.key, { shipmentId, rateId, labelId: null })
    } catch {
      found = null
    }
    if (found?.state === "bought") {
      bought = purchaseFrom(rate, found)
    } else {
      const error = providerWords(e, api.name)
      await noteSync(db, cred.id, { ok: false, error })
      /* The provider read the request and said no: nothing was bought, the claim goes, the shipment can be bought again. */
      if (refused) {
        await db.from("shipping_labels").delete().eq("id", claim.id).eq("status", "buying")
        return { ok: false, error }
      }
      /*
        No answer, and no label to be seen yet. That is not "nothing was bought": the request may still be running
        at the provider. The claim stays, so no second label is bought while the first may exist; the next press
        asks the provider again (settleClaim) and only buys once it says, after a pause, that there is none.
      */
      return { ok: false, error: `${api.name} did not answer, so Storelib can't tell yet whether this label was bought. Press Buy label again in a minute or two: if it was bought it comes onto the order, and nothing is bought twice.`, status: 503 }
    }
  }
  const row = await recordPurchase(db, creatorId, checkoutId, claim, bought, api, cred.id, deps)
  return finishShipping(db, creatorId, checkoutId, row, { items, locationId: input.locationId, notifyBuyer: input.notifyBuyer !== false, providerTrackingUrl: bought.trackingUrl }, deps)
}

/** A label the provider has for a quoted rate, as the purchase it is: the rate's carrier, service and price unless the provider says them itself. */
function purchaseFrom(rate: Pick<LabelRate, "shipmentId" | "carrier" | "service" | "cents" | "currency">, found: Extract<FoundLabel, { state: "bought" }>): LabelPurchase {
  return {
    labelId: found.labelId,
    shipmentId: rate.shipmentId,
    carrier: found.carrier ?? rate.carrier,
    service: found.service ?? rate.service,
    trackingNumber: found.trackingNumber,
    trackingUrl: found.trackingUrl,
    labelUrl: found.labelUrl,
    invoiceUrl: found.invoiceUrl,
    cents: found.cents ?? rate.cents,
    currency: found.currency ?? rate.currency,
  }
}

/**
 * A BOUGHT LABEL, WRITTEN ONTO ITS CLAIM: the provider's ids, the carrier as
 * the buyer reads it, the tracking number, the label's address and its cost,
 * then the card's count and the timeline. Run after a purchase that answered
 * and after one that did not but turned out to be bought (settleClaim), so
 * both leave exactly the same order behind. The timeline entry is keyed on
 * the provider's own label id: written once however many times this runs.
 */
async function recordPurchase(db: Db, creatorId: string, checkoutId: string, claim: Record<string, any>, bought: LabelPurchase, api: LabelApi, integrationId: string, deps: LabelDeps): Promise<Record<string, any>> {
  /* The carrier as the buyer reads it ("USPS"), so their link and the tracking that follows it know it. */
  const carrier = carrierOf(bought.carrier)?.name ?? bought.carrier
  const plan = planOf(claim.package)
  const pkg = bought.invoiceUrl ? planRow({ ...plan, invoice: true }) : claim.package
  const { data: saved } = await db
    .from("shipping_labels")
    .update({ provider_label_id: bought.labelId.slice(0, 120), carrier: carrier.slice(0, 60), service: bought.service.slice(0, 120), tracking_number: bought.trackingNumber, label_url: bought.labelUrl, cost_cents: bought.cents, currency: bought.currency, status: "purchased", ...(bought.invoiceUrl ? { package: pkg } : {}), updated_at: new Date().toISOString() })
    .eq("id", claim.id)
    .select("*")
    .maybeSingle()
  const row = saved ?? { ...claim, provider_label_id: bought.labelId, status: "purchased", label_url: bought.labelUrl, tracking_number: bought.trackingNumber, carrier, service: bought.service, cost_cents: bought.cents, currency: bought.currency, package: pkg }
  const testMode = row.test_mode === true
  await noteSync(db, integrationId, { ok: true, bump: "labels_bought" })
  await deps.addOrderEvent(db, {
    checkoutId,
    creatorId,
    kind: "label.purchased",
    message: `${api.name} label bought: ${carrier} ${bought.service}, ${formatMinor(bought.cents, bought.currency)}. Your cost, not charged to the buyer.${testMode ? " Test label." : ""}`,
    detail: { provider: api.id, label_id: row.id, cost_cents: bought.cents, currency: bought.currency, tracking_number: bought.trackingNumber, test: testMode },
    actor: "creator",
    key: `label:${api.id}:${bought.labelId}`.slice(0, 200),
  })
  return row
}

/**
 * A CLAIM WITH NO LABEL AFTER IT, SETTLED WITH THE PROVIDER. The request that
 * made it never wrote an answer: it timed out, the function was stopped, or
 * the provider was still making the label.
 *
 *   bought     the provider has a label for this shipment: it is written
 *              onto the claim, exactly as a purchase that answered
 *   wait       the provider is still making it, or the claim is young enough
 *              that its own request may still be running; or the provider
 *              can't be asked (it is down, or the claim is from before the
 *              rate was kept on it), and the seller is told where to look
 *   released   the provider says no label exists and the claim is old: it
 *              is removed, and the caller goes on to buy
 */
async function settleClaim(
  db: Db,
  creatorId: string,
  checkoutId: string,
  claim: Record<string, any>,
  api: LabelApi,
  cred: { id: string; key: string },
  deps: LabelDeps,
): Promise<{ kind: "bought"; row: Record<string, any> } | { kind: "wait"; outcome: ShipOutcome; /** True while the label may still turn up: no other label is to be bought for the order meanwhile. */ open: boolean } | { kind: "released" }> {
  const age = Date.now() - Date.parse(String(claim.updated_at ?? claim.created_at ?? ""))
  const old = Number.isFinite(age) && age > STALE_CLAIM_MS
  const busy: ShipOutcome = { ok: false, error: "This label is already being bought. Wait a moment.", status: 409 }
  const unknown: ShipOutcome = old ? { ok: false, error: `This label purchase did not finish. Check your ${api.name} account for a label on this order before you buy again, then get rates again.`, status: 409 } : busy
  const plan = planOf(claim.package)
  /* Shippo is asked by the rate; a claim from before the rate was kept can't be, and says where to look as it always did. */
  if (api.id === "shippo" && !plan.rateId) return { kind: "wait", outcome: unknown, open: !old }
  let found: FoundLabel
  try {
    found = await api.findLabel(cred.key, { shipmentId: String(claim.provider_shipment_id), rateId: plan.rateId ?? null, labelId: null })
  } catch {
    return { kind: "wait", outcome: unknown, open: !old }
  }
  if (found.state === "bought") {
    const rate = { shipmentId: String(claim.provider_shipment_id), carrier: String(claim.carrier ?? "Carrier"), service: String(claim.service ?? "Shipping"), cents: Number(claim.cost_cents ?? 0), currency: String(claim.currency ?? "USD") }
    return { kind: "bought", row: await recordPurchase(db, creatorId, checkoutId, claim, purchaseFrom(rate, found), api, cred.id, deps) }
  }
  if (found.state === "pending" || !(Number.isFinite(age) && age > IN_FLIGHT_MS)) return { kind: "wait", outcome: busy, open: true }
  await db.from("shipping_labels").delete().eq("id", claim.id).eq("status", "buying")
  return { kind: "released" }
}

/**
 * BEFORE ANOTHER LABEL IS QUOTED OR BOUGHT FOR AN ORDER, every purchase of
 * its that never answered is settled. Without this a seller who closed the
 * dialog after "did not answer" and got rates again (a new shipment at the
 * provider, so a new claim) could buy a second label while the first was
 * bought all along. A label that turns out to be bought ships its items and
 * the seller is told to look at the order; one still in flight holds the
 * next purchase back; a claim nothing can be learned about any more (the
 * provider disconnected, or ten minutes of no answer) is left where it is
 * and stops nothing. Null when there is nothing to say and the caller goes on.
 */
async function settleOpenClaims(db: Db, creatorId: string, checkoutId: string, deps: LabelDeps, except: string | null = null): Promise<string | null> {
  const { data, error } = await db.from("shipping_labels").select("*").eq("creator_id", creatorId).eq("checkout_id", checkoutId).eq("status", "buying")
  if (error) return null
  for (const claim of (data ?? []) as Record<string, any>[]) {
    if (except && claim.provider_shipment_id === except) continue
    const api = labelApiFor(claim.provider)
    const cred = api ? await connectedKey(db, creatorId, api.id) : null
    if (!api || !cred) continue
    const settled = await settleClaim(db, creatorId, checkoutId, claim, api, cred, deps)
    if (settled.kind === "bought") {
      await finishShipping(db, creatorId, checkoutId, settled.row, { notifyBuyer: true }, deps)
      const label = labelView(settled.row)
      return `A ${api.name} label bought earlier for this order has come through${label.trackingNumber ? ` (${[label.carrier, label.trackingNumber].filter(Boolean).join(" ")})` : ""} and is on the order now. Close this and check the order before you buy another.`
    }
    if (settled.kind === "wait" && settled.open) return `A label for this order is still being bought at ${api.name}. Wait a minute or two, then get rates again.`
  }
  return null
}

/**
 * THE ITEMS SHIP WITH A BOUGHT LABEL: its carrier and tracking number on a
 * new shipment (orders-server fulfilItems: stock, status, timeline, the
 * buyer's shipping email), and the label tied to that shipment. Run right
 * after a purchase, again when a retried Buy finds the label bought but its
 * items never marked shipped, and from Ship with this label on a label the order
 * shows without a shipment (its shipment was cancelled, or saving it
 * failed). Keyed on the label, so a repeat never ships twice.
 */
async function finishShipping(
  db: Db,
  creatorId: string,
  checkoutId: string,
  row: Record<string, any>,
  input: { items?: { orderId: string; quantity: number }[]; locationId?: string | null; notifyBuyer: boolean; providerTrackingUrl?: string | null },
  deps: LabelDeps,
): Promise<ShipOutcome> {
  const label = labelView(row)
  const order = await deps.loadOrder(db, { creatorId, checkoutId })
  if (!order) return { ok: false, error: "Order not found.", status: 404, label }
  const tn = String(row.tracking_number ?? "").toUpperCase()
  const live = (o: LabelOrder | null) => (o?.shipments ?? []).filter((s) => s.status !== "cancelled")
  /* Already on a live shipment: nothing to do. */
  if (row.fulfillment_id && live(order).some((s) => s.id === row.fulfillment_id)) return { ok: true, order, label }
  const no = canShip(order)
  if (no) return { ok: false, error: no, label }
  const plan = planOf(row.package)
  const locationId = input.locationId ?? plan.locationId
  const items = boundedItems(order, input.items?.length ? input.items : plan.items.length ? plan.items : openItems(order, locationId))
  if (items.length === 0) return { ok: false, error: "Nothing is left to ship on this order. Void the label if you don't need it.", label }
  const before = new Set(order.shipments.map((s) => s.id))
  const previous = row.fulfillment_id ? String(row.fulfillment_id) : null
  const shipped = await deps.fulfilItems(db, creatorId, checkoutId, {
    items,
    carrier: row.carrier,
    trackingNumber: row.tracking_number,
    /* The carrier's own page when Storelib knows the carrier; the provider's tracking page otherwise. */
    trackingUrl: trackingUrl(row.carrier, row.tracking_number) ? null : (input.providerTrackingUrl ?? null),
    notifyBuyer: input.notifyBuyer,
    /* A label whose first shipment was cancelled ships again under a key of its own. */
    key: previous ? `label:${row.id}:after:${previous}` : `label:${row.id}`,
    locationId,
  })
  if (shipped.ok === false) {
    /* The label is bought and kept: the order shows it, to print, mark as shipped or void. */
    return { ok: false, error: `The label was bought but the items could not be marked shipped: ${(shipped as { error: string }).error} It's kept on the order: print it, mark the items shipped, or void it there.`, label }
  }
  /* The shipment this made: the new one (with the label's number when it has one), else one already carrying that number. */
  const after = live(shipped.order)
  const made = after.find((s) => !before.has(s.id) && (!tn || (s.trackingNumber ?? "").toUpperCase() === tn)) ?? (tn ? after.find((s) => (s.trackingNumber ?? "").toUpperCase() === tn) : undefined)
  if (made?.id) {
    await db.from("shipping_labels").update({ fulfillment_id: made.id, updated_at: new Date().toISOString() }).eq("id", row.id)
    label.fulfillmentId = made.id
  }
  return { ok: true, order: shipped.order, label }
}

/** Ship with this label, on a bought label the order shows without a shipment. */
export async function shipLabel(db: Db, creatorId: string, checkoutId: string, labelId: string, input: { notifyBuyer?: boolean }, deps: LabelDeps): Promise<ShipOutcome> {
  const { data: row } = await db.from("shipping_labels").select("*").eq("id", labelId).eq("creator_id", creatorId).eq("checkout_id", checkoutId).maybeSingle()
  if (!row) return { ok: false, error: "Label not found.", status: 404 }
  if (row.status !== "purchased") return { ok: false, error: row.status === "buying" ? "This label is still being bought." : "A voided label can't ship anything." }
  return finishShipping(db, creatorId, checkoutId, row, { notifyBuyer: input.notifyBuyer === true }, deps)
}

/* ── printing it ────────────────────────────────────────────────────────── */

/**
 * WHERE A BOUGHT LABEL (OR ITS COMMERCIAL INVOICE) IS, RIGHT NOW. The
 * provider is asked each time: Shippo's label address expires, and a label
 * printed a week after it was bought used to open an error page. The address
 * kept at purchase is what is used when the provider can't be reached, so a
 * label that still opens is never held back by an outage. Only a label of
 * this store, on this order, that is bought and not voided.
 */
export async function labelDocument(db: Db, creatorId: string, checkoutId: string, labelId: string, doc: "label" | "invoice"): Promise<{ ok: true; url: string } | { ok: false; error: string; status: number }> {
  const { data: row } = await db.from("shipping_labels").select("*").eq("id", labelId).eq("creator_id", creatorId).eq("checkout_id", checkoutId).maybeSingle()
  if (!row) return { ok: false, error: "Label not found.", status: 404 }
  if (row.status !== "purchased") return { ok: false, error: row.status === "buying" ? "This label is still being bought." : "This label was voided, so it can't be printed.", status: 409 }
  const kept = doc === "label" && typeof row.label_url === "string" && /^https:\/\//.test(row.label_url) ? (row.label_url as string) : null
  const api = labelApiFor(row.provider)
  const cred = api ? await connectedKey(db, creatorId, api.id) : null
  if (!api || !cred) return kept ? { ok: true, url: kept } : { ok: false, error: `Connect ${providerInfo(row.provider)?.name ?? "the label app"} again to open this.`, status: 409 }
  let found: FoundLabel | null = null
  try {
    const labelIdAtProvider = typeof row.provider_label_id === "string" && !row.provider_label_id.startsWith("pending:") ? row.provider_label_id : null
    found = await api.findLabel(cred.key, { shipmentId: String(row.provider_shipment_id), rateId: planOf(row.package).rateId ?? null, labelId: labelIdAtProvider })
  } catch {
    found = null
  }
  if (found?.state === "bought") {
    const url = doc === "invoice" ? found.invoiceUrl : found.labelUrl
    /* The fresh address is kept, so the next outage still has one that works. */
    if (doc === "label" && url && url !== row.label_url && url.length <= 2000) await db.from("shipping_labels").update({ label_url: url, updated_at: new Date().toISOString() }).eq("id", row.id)
    if (url) return { ok: true, url }
    return { ok: false, error: `${api.name} made no commercial invoice for this label. Some carriers print the customs form on the label itself.`, status: 404 }
  }
  if (kept) return { ok: true, url: kept }
  return { ok: false, error: `${api.name} could not be reached. Try again in a moment.`, status: 503 }
}

/* ── voiding it ─────────────────────────────────────────────────────────── */

/** Statuses a parcel can still be in without having moved: a label for one is unused. */
const UNUSED = new Set(["pending", "submitted", "shipped"])

/** `where.checkoutId`: the order the request came from; another order's label is not found from it. */
export async function voidLabel(db: Db, creatorId: string, labelId: string, deps: LabelDeps, where: { checkoutId?: string } = {}): Promise<{ ok: true; order: any; label: LabelView } | { ok: false; error: string; status?: number }> {
  let q = db.from("shipping_labels").select("*").eq("id", labelId).eq("creator_id", creatorId)
  if (where.checkoutId) q = q.eq("checkout_id", where.checkoutId)
  const { data: row } = await q.maybeSingle()
  if (!row) return { ok: false, error: "Label not found.", status: 404 }
  if (row.status === "voided" || row.status === "void_pending") return { ok: true, order: await deps.loadOrder(db, { creatorId, checkoutId: row.checkout_id }), label: labelView(row) }
  if (row.status !== "purchased" && row.status !== "void_rejected") return { ok: false, error: "This label can't be voided." }
  const api = labelApiFor(row.provider)
  const cred = api ? await connectedKey(db, creatorId, api.id) : null
  if (!api || !cred) return { ok: false, error: `Connect ${providerInfo(row.provider)?.name ?? "the label app"} again to void this label.` }
  const order = await deps.loadOrder(db, { creatorId, checkoutId: row.checkout_id })
  const shipment = row.fulfillment_id ? order?.shipments.find((s) => s.id === row.fulfillment_id) : null
  if (shipment && !UNUSED.has(shipment.status) && shipment.status !== "cancelled") return { ok: false, error: "This parcel is already with the carrier, so its label can't be voided." }

  let outcome: VoidOutcome
  try {
    outcome = await api.voidLabel(cred.key, { labelId: row.provider_label_id, shipmentId: row.provider_shipment_id })
  } catch (e) {
    return { ok: false, error: providerWords(e, api.name) }
  }
  const now = new Date().toISOString()
  if (outcome === "rejected") {
    await db.from("shipping_labels").update({ status: "void_rejected", updated_at: now }).eq("id", row.id)
    return { ok: false, error: `${api.name} or the carrier refused to void this label. Labels can usually be voided only before they are scanned, within the carrier's window.` }
  }
  const { data: saved } = await db.from("shipping_labels").update({ status: outcome === "voided" ? "voided" : "void_pending", voided_at: now, updated_at: now }).eq("id", row.id).select("*").maybeSingle()
  await deps.addOrderEvent(db, {
    checkoutId: row.checkout_id,
    creatorId,
    kind: "label.voided",
    message: outcome === "voided" ? `${api.name} label voided and refunded (${formatMinor(Number(row.cost_cents), row.currency)}).` : `${api.name} label void requested. The carrier refunds ${formatMinor(Number(row.cost_cents), row.currency)} once it confirms the label was not used.`,
    detail: { provider: api.id, label_id: row.id, outcome },
    actor: "creator",
    key: `label_void:${row.id}`,
  })
  /* Its shipment is cancelled: the items are to ship again, back in stock for this order. The buyer is not emailed. */
  let current = order
  if (shipment && shipment.status !== "cancelled") {
    const moved = await deps.updateShipment(db, creatorId, shipment.id, { status: "cancelled", notifyBuyer: false })
    if (moved.ok) current = moved.order
  }
  return { ok: true, order: current ?? (await deps.loadOrder(db, { creatorId, checkoutId: row.checkout_id })), label: labelView(saved ?? { ...row, status: outcome === "voided" ? "voided" : "void_pending" }) }
}
