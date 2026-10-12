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
 *
 * One label per quoted shipment: the row is claimed before the provider is
 * asked to buy, so two presses of Buy never buy two labels.
 */

import type { Db } from "@/lib/physical/auth"
import { loadPackages, type ShippingPackage } from "@/lib/physical/config-server"
import { carrierOf } from "@/lib/physical/carriers"
import { regionCode } from "@/lib/physical/regions"
import { addressLines } from "@/lib/physical/address"
import { trackingUrl } from "@/lib/physical/status"
import { providerInfo } from "@/lib/physical/providers"
import { ProviderError } from "../fulfilment/http"
import { connectedKey, noteSync } from "./connect-server"
import { easypost } from "./easypost"
import { formatMinor } from "./money"
import { shippo } from "./shippo"
import type { LabelAddress, LabelApi, LabelProviderId, LabelPurchase, LabelRate, Parcel, VoidOutcome } from "./types"

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
}
export interface LabelOrder {
  id: string
  status: string
  cancelledAt: string | null
  deliveryMethod: string
  buyerName: string | null
  buyerEmail: string | null
  buyerPhone: string | null
  address: Record<string, any> | null
  lines: LabelOrderLine[]
  shipments: { id: string; status: string; trackingNumber: string | null }[]
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
}

export function labelView(r: Record<string, any>): LabelView {
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

/** The items' weight as they were sold (the order line's snapshot), else the variant's weight now. Grams, for the units given. */
export async function itemsGrams(db: Db, items: { orderId: string; quantity: number }[]): Promise<number> {
  if (items.length === 0) return 0
  const { data } = await db.from("orders").select("id, variant_id, product_snapshot").in("id", items.map((i) => i.orderId))
  const rows = (data ?? []) as { id: string; variant_id: string | null; product_snapshot: Record<string, any> | null }[]
  const missing = rows.filter((r) => !(Number(r.product_snapshot?.weight_grams) > 0) && r.variant_id).map((r) => r.variant_id as string)
  const variantGrams = new Map<string, number>()
  if (missing.length) {
    const { data: vs } = await db.from("product_variants").select("id, weight_grams").in("id", missing)
    for (const v of (vs ?? []) as { id: string; weight_grams: number | null }[]) variantGrams.set(v.id, Number(v.weight_grams) || 0)
  }
  let grams = 0
  for (const i of items) {
    const r = rows.find((x) => x.id === i.orderId)
    const each = Number(r?.product_snapshot?.weight_grams) > 0 ? Number(r!.product_snapshot!.weight_grams) : r?.variant_id ? (variantGrams.get(r.variant_id) ?? 0) : 0
    grams += Math.max(0, each) * i.quantity
  }
  return Math.round(grams)
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

function canShip(order: LabelOrder | null): string | null {
  if (!order) return "Order not found."
  if (order.cancelledAt) return "This order was cancelled."
  if (order.status !== "paid" && order.status !== "partially_refunded") return "Only a paid order can be shipped."
  if (order.deliveryMethod === "pickup") return "This order is picked up, so it needs no label."
  return null
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
  from: FromPlace | null
  to: { line: string; complete: boolean }
  labels: LabelView[]
}

export async function labelOptions(db: Db, creatorId: string, checkoutId: string, input: { locationId: string | null; items?: { orderId: string; quantity: number }[]; storeName: string }, deps: LabelDeps): Promise<LabelOptions | { error: string; status?: number }> {
  const order = await deps.loadOrder(db, { creatorId, checkoutId })
  if (!order) return { error: "Order not found.", status: 404 }
  const [apps, packages, from, listed, settings] = await Promise.all([
    Promise.all((["shippo", "easypost"] as const).map(async (id) => {
      const c = await connectedKey(db, creatorId, id)
      return c ? { id, name: LABEL_APIS[id].name, test: LABEL_APIS[id].isTestKey(c.key) } : null
    })).then((l) => l.filter((x): x is { id: LabelProviderId; name: string; test: boolean } => !!x)),
    loadPackages(db, creatorId).catch(() => [] as ShippingPackage[]),
    fromPlace(db, creatorId, input.locationId, input.storeName),
    listLabels(db, creatorId, checkoutId),
    db.from("commerce_settings").select("default_package_id, unit_system").eq("creator_id", creatorId).maybeSingle().then((r: { data: any }) => r.data, () => null),
  ])
  const items = input.items?.length ? input.items : openItems(order, input.locationId)
  const to = toAddress(order)
  const def = packages.find((p) => p.isDefault)?.id ?? (packages.some((p) => p.id === settings?.default_package_id) ? settings.default_package_id : null)
  return {
    ready: listed.ready,
    apps,
    packages: [...packages].sort((a, b) => Number(b.id === def) - Number(a.id === def)),
    defaultPackageId: def,
    unitSystem: settings?.unit_system === "imperial" ? "imperial" : "metric",
    itemsGrams: await itemsGrams(db, items),
    from,
    to: { line: to ? addressLines(order.address as never).filter(Boolean).join(", ") : "The order has no complete delivery address.", complete: !!to },
    labels: listed.labels,
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
}

export async function quoteLabel(
  db: Db,
  creatorId: string,
  checkoutId: string,
  input: { provider: unknown; locationId: string | null; packageId?: unknown; custom?: { lengthCm?: unknown; widthCm?: unknown; heightCm?: unknown } | null; grams?: unknown; storeName: string },
  deps: LabelDeps,
): Promise<QuoteResult | { error: string; status?: number }> {
  const api = labelApiFor(input.provider)
  if (!api) return { error: "Choose Shippo or EasyPost." }
  const cred = await connectedKey(db, creatorId, api.id)
  if (!cred) return { error: `Connect ${api.name} in Settings › Integrations first.` }
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
  const grams = Number.isFinite(typed) && typed > 0 ? typed : (await itemsGrams(db, openItems(order!, input.locationId))) + (pkg?.weightGrams ?? 0)
  const parcel = parcelOf(pkg, pkg ? null : (input.custom ?? null), grams)
  if (!parcel) return { error: grams > 0 ? "Choose a package, or enter its size." : "Enter the parcel's weight: these products have none saved." }

  try {
    const [check, quoted] = await Promise.all([
      api.checkAddress(cred.key, to).catch(() => ({ ok: true, messages: [] as string[] })),
      api.rates(cred.key, { from: from.address, to, parcel, reference: referenceFor(checkoutId) }),
    ])
    const rates = quoted.rates.sort((a, b) => a.cents - b.cents).map((r) => ({ ...r, price: formatMinor(r.cents, r.currency) }))
    await noteSync(db, cred.id, { ok: true })
    const warnings = [...(check.ok ? [] : ["The delivery address may not be deliverable as written."]), ...check.messages, ...(rates.length === 0 ? quoted.messages : [])].slice(0, 6)
    return { provider: api.id, shipmentId: quoted.shipmentId, rates, addressOk: check.ok, warnings, parcel }
  } catch (e) {
    const error = providerWords(e, api.name)
    await noteSync(db, cred.id, { ok: false, error })
    return { error }
  }
}

/* ── buying it ──────────────────────────────────────────────────────────── */

export async function buyLabel(
  db: Db,
  creatorId: string,
  checkoutId: string,
  input: { provider: unknown; shipmentId: unknown; rateId: unknown; locationId: string | null; items?: { orderId: string; quantity: number }[]; notifyBuyer?: boolean; packageName?: string | null },
  deps: LabelDeps,
): Promise<{ ok: true; order: any; label: LabelView } | { ok: false; error: string; status?: number; label?: LabelView }> {
  const api = labelApiFor(input.provider)
  if (!api) return { ok: false, error: "Choose Shippo or EasyPost." }
  const shipmentId = String(input.shipmentId ?? "")
  const rateId = String(input.rateId ?? "")
  if (!shipmentId || !rateId) return { ok: false, error: "Choose a rate." }
  const cred = await connectedKey(db, creatorId, api.id)
  if (!cred) return { ok: false, error: `Connect ${api.name} in Settings › Integrations first.` }
  /* Bought already (a second press, a retried request): that label, and nothing asked of the provider. */
  const { data: was } = await db.from("shipping_labels").select("*").eq("creator_id", creatorId).eq("provider", api.id).eq("provider_shipment_id", shipmentId).maybeSingle()
  if (was && was.status !== "buying") return { ok: true, order: await deps.loadOrder(db, { creatorId, checkoutId }), label: labelView(was) }
  const order = await deps.loadOrder(db, { creatorId, checkoutId })
  const no = canShip(order)
  if (no) return { ok: false, error: no }
  const items = (input.items?.length ? input.items : openItems(order!, input.locationId)).filter((i) => i.quantity > 0)
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
  const { data: claim, error: claimError } = await db
    .from("shipping_labels")
    .insert({ creator_id: creatorId, checkout_id: checkoutId, provider: api.id, provider_shipment_id: shipmentId, provider_label_id: `pending:${shipmentId}`.slice(0, 120), carrier: rate.carrier, service: rate.service, cost_cents: rate.cents, currency: rate.currency, test_mode: api.isTestKey(cred.key), status: "buying", package: input.packageName ? { name: String(input.packageName).slice(0, 80) } : null, created_at: now, updated_at: now })
    .select("*")
    .maybeSingle()
  if (claimError?.code === "23505") {
    const { data: was } = await db.from("shipping_labels").select("*").eq("provider", api.id).eq("provider_shipment_id", shipmentId).maybeSingle()
    if (was && was.status !== "buying" && was.creator_id === creatorId) {
      const fresh = await deps.loadOrder(db, { creatorId, checkoutId })
      return { ok: true, order: fresh, label: labelView(was) }
    }
    return { ok: false, error: "This label is already being bought. Wait a moment.", status: 409 }
  }
  if (claimError || !claim) return { ok: false, error: claimError?.code === "42P01" || claimError?.code === "PGRST205" ? "Labels turn on after the database update (SQL part 163)." : "The label could not be saved. Nothing was bought." }

  let bought: LabelPurchase
  try {
    bought = await api.buy(cred.key, rate)
  } catch (e) {
    await db.from("shipping_labels").delete().eq("id", claim.id).eq("status", "buying")
    const error = providerWords(e, api.name)
    await noteSync(db, cred.id, { ok: false, error })
    return { ok: false, error }
  }

  /* The carrier as the buyer reads it ("USPS"), so their link and the tracking that follows it know it. */
  const carrier = carrierOf(bought.carrier)?.name ?? bought.carrier
  const { data: saved } = await db
    .from("shipping_labels")
    .update({ provider_label_id: bought.labelId.slice(0, 120), carrier: carrier.slice(0, 60), service: bought.service.slice(0, 120), tracking_number: bought.trackingNumber, label_url: bought.labelUrl, cost_cents: bought.cents, currency: bought.currency, status: "purchased", updated_at: new Date().toISOString() })
    .eq("id", claim.id)
    .select("*")
    .maybeSingle()
  const label = labelView(saved ?? { ...claim, status: "purchased", label_url: bought.labelUrl, tracking_number: bought.trackingNumber, carrier })
  await noteSync(db, cred.id, { ok: true, bump: "labels_bought" })
  await deps.addOrderEvent(db, {
    checkoutId,
    creatorId,
    kind: "label.purchased",
    message: `${api.name} label bought: ${carrier} ${bought.service}, ${formatMinor(bought.cents, bought.currency)}. Your cost, not charged to the buyer.${label.testMode ? " Test label." : ""}`,
    detail: { provider: api.id, label_id: label.id, cost_cents: bought.cents, currency: bought.currency, tracking_number: bought.trackingNumber, test: label.testMode },
    actor: "creator",
    key: `label:${api.id}:${bought.labelId}`.slice(0, 200),
  })

  const shipped = await deps.fulfilItems(db, creatorId, checkoutId, {
    items,
    carrier,
    trackingNumber: bought.trackingNumber,
    /* The carrier's own page when Storelib knows the carrier; the provider's tracking page otherwise. */
    trackingUrl: trackingUrl(carrier, bought.trackingNumber) ? null : bought.trackingUrl,
    notifyBuyer: input.notifyBuyer !== false,
    key: `label:${label.id}`,
    locationId: input.locationId,
  })
  if (shipped.ok === false) {
    /* The label is bought and kept: print it, or void it, from the order. */
    return { ok: false, error: `The label was bought but the items could not be marked shipped: ${shipped.error} Print it from the order, or void it there.`, label }
  }
  const made = (shipped.order?.shipments ?? []).find((s: { trackingNumber: string | null; status: string }) => s.status !== "cancelled" && bought.trackingNumber && (s.trackingNumber ?? "").toUpperCase() === bought.trackingNumber.toUpperCase())
  if (made?.id) {
    await db.from("shipping_labels").update({ fulfillment_id: made.id, updated_at: new Date().toISOString() }).eq("id", claim.id)
    label.fulfillmentId = made.id
  }
  return { ok: true, order: shipped.order, label }
}

/* ── voiding it ─────────────────────────────────────────────────────────── */

/** Statuses a parcel can still be in without having moved: a label for one is unused. */
const UNUSED = new Set(["pending", "submitted", "shipped"])

export async function voidLabel(db: Db, creatorId: string, labelId: string, deps: LabelDeps): Promise<{ ok: true; order: any; label: LabelView } | { ok: false; error: string; status?: number }> {
  const { data: row } = await db.from("shipping_labels").select("*").eq("id", labelId).eq("creator_id", creatorId).maybeSingle()
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
