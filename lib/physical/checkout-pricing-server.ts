import "server-only"

/**
 * ===========================================================================
 *  PRICING A PHYSICAL OR MIXED CART, ON THE SERVER, FROM IDS ALONE
 * ===========================================================================
 * The browser sends product ids, variant ids and quantities. Everything
 * else is read here: each product must be published and one shop's, each
 * variant must be that product's and active, every price is the row's, the
 * stock is checked (and later held, atomically, by physical_reserve), the
 * code is the shop's own and its rules are applied, the delivery options
 * are quoted from the shop's rates for the buyer's country and the tax from
 * its own rates. The page shows these numbers; the payment is created from
 * them computed again, never from anything the page sends back.
 *
 * Digital products can share the cart: they are one each, need no
 * delivery and hold no stock. Something the buyer already owns is left out.
 */

import { salesStandings } from "@/lib/products/sales-standings"
import { MAX_PWYW_CENTS, baseFor, wholeCents } from "@/lib/checkout/pricing"
import { ownedKey, ownedLines } from "@/lib/checkout/owned"
import { couponCovers, couponLabel, couponStanding, findCoupon, lineDiscounts, normaliseCode, type CouponRow } from "@/lib/checkout/coupons"
import type { Db } from "./auth"
import { inSmartCollection, readRules, type RuleProduct } from "./collections"
import { defaultPackageGrams, loadLocations, loadProfiles, loadSettings, loadTaxSettings, type CommerceSettings } from "./config-server"
import { methodOf, readMethod } from "./fulfillment"
import { isPickupOptionId, pickupOptions } from "./pickup"
import { quoteDelivery, pickOption, type Quote } from "./rates"
import { physicalTotals, type PhysicalTotals, type TaxSettings } from "./totals"
import { applyOffers, suggestionsFor, type AppliedOffer, type Offer } from "@/lib/offers/offers"
import { loadOffers } from "@/lib/offers/offers-server"
import { orderLimits, overLimit } from "./order-limit"
import type { Address, DeliveryOption, Location, PricedLine } from "./types"

export const MAX_CHECKOUT_LINES = 50
export const MAX_LINE_QUANTITY = 999

export interface CheckoutItem {
  productId: string
  variantId: string | null
  quantity: number
  /** A pay what you want amount the buyer named for a digital line; held to its minimum below (baseFor). */
  customPriceCents?: number
}

export function readItems(input: unknown): CheckoutItem[] {
  if (!Array.isArray(input)) return []
  const merged = new Map<string, CheckoutItem>()
  for (const raw of input.slice(0, MAX_CHECKOUT_LINES)) {
    const r = raw as Record<string, unknown>
    if (typeof r?.productId !== "string" || !/^[0-9a-f-]{36}$/i.test(r.productId)) continue
    const variantId = typeof r.variantId === "string" && /^[0-9a-f-]{36}$/i.test(r.variantId) ? r.variantId : null
    const quantity = Math.max(1, Math.min(MAX_LINE_QUANTITY, Math.floor(Number(r.quantity) || 1)))
    const key = `${r.productId}:${variantId ?? ""}`
    const had = merged.get(key)
    const custom = wholeCents(r.customPriceCents, 0, MAX_PWYW_CENTS) ?? had?.customPriceCents ?? null
    merged.set(key, {
      productId: r.productId,
      variantId,
      quantity: Math.min(MAX_LINE_QUANTITY, (had?.quantity ?? 0) + quantity),
      ...(custom !== null ? { customPriceCents: custom } : {}),
    })
  }
  return [...merged.values()]
}

export interface StockIssue {
  productId: string
  variantId: string | null
  title: string
  available: number
}

export type PricedCheckout =
  | {
      ok: true
      creatorId: string
      lines: PricedLine[]
      dropped: string[]
      /** Digital lines left out because the buyer owns them (lib/checkout/owned); their titles are in `dropped` too. */
      owned?: { productId: string; variantId: string | null; title: string; thumbnailUrl: string | null }[]
      stockIssues: StockIssue[]
      coupon: CouponRow | null
      couponLabel: string | null
      /** The store's upsells and bundles this cart qualifies for (lib/offers), already in the lines' discounts. */
      offers: AppliedOffer[]
      /** Checkout offers to suggest: their product isn't in the cart yet. */
      suggestions: Offer[]
      freeShipping: boolean
      settings: CommerceSettings
      tax: TaxSettings
      requiresShipping: boolean
      /** The shop's locations, for pickup. */
      locations: Location[]
      /** Stock available at a fulfilling location, as read for this cart. */
      available: (variantId: string, locationId: string) => number
    }
  | { ok: false; status: number; error: string }

const SELLABLE = new Set(["physical", "digital", "course"])

interface ProductRow {
  id: string
  title: string
  slug: string
  type: string
  status: string
  creator_id: string
  price_cents: number
  compare_at_price_cents?: number | null
  pay_what_you_want?: boolean | null
  pwyw_min_price_cents?: number | null
  thumbnail_url: string | null
  requires_shipping?: boolean | null
  weight_grams?: number | null
  taxable?: boolean | null
  track_inventory?: boolean | null
  continue_selling?: boolean | null
  fulfillment_location_id?: string | null
  fulfillment_method?: string | null
  shipping_profile_id?: string | null
  tags?: string[] | null
  vendor?: string | null
  created_at?: string
  category?: string | null
}

export async function priceCheckout(
  db: Db,
  /* `buyerEmail` is the address typed (a code's per customer limit); `ownerEmail` one the buyer proved, whose orders count as owned (lib/checkout/owned). */
  req: { items: CheckoutItem[]; couponCode?: unknown; buyerId?: string | null; buyerEmail?: string | null; ownerEmail?: string | null; shopId?: string | null },
): Promise<PricedCheckout> {
  if (req.items.length === 0) return { ok: false, status: 400, error: "Your cart is empty." }
  const productIds = [...new Set(req.items.map((i) => i.productId))]
  const { data: products, error } = await db
    .from("products")
    .select(
      "id, title, slug, type, status, creator_id, price_cents, compare_at_price_cents, pay_what_you_want, pwyw_min_price_cents, thumbnail_url, requires_shipping, weight_grams, taxable, track_inventory, continue_selling, fulfillment_location_id, fulfillment_method, shipping_profile_id, tags, vendor, created_at, category",
    )
    .in("id", productIds)
    .eq("status", "published")
  if (error) {
    const missing = error.code === "42703" || error.code === "PGRST204"
    return { ok: false, status: missing ? 503 : 500, error: missing ? "This shop is not ready to sell physical products yet." : "Could not read the cart." }
  }
  const rows = (products ?? []) as ProductRow[]
  if (rows.length === 0) return { ok: false, status: 400, error: "Nothing in the cart is on sale any more." }
  const creatorIds = [...new Set(rows.map((p) => p.creator_id))]
  if (creatorIds.length !== 1 || (req.shopId && creatorIds[0] !== req.shopId)) return { ok: false, status: 400, error: "A cart can only hold one shop's products." }
  const creatorId = creatorIds[0]
  const byId = new Map(rows.map((p) => [p.id, p]))

  /* What the buyer already owns, per option; a physical product never is (lib/checkout/owned). */
  const owned = await ownedLines(
    db,
    { userId: req.buyerId ?? null, provenEmail: req.ownerEmail ?? null },
    req.items.map((i) => ({ productId: i.productId, variantId: i.variantId ?? null, type: byId.get(i.productId)?.type ?? "physical" })),
  )
  const ownedList: { productId: string; variantId: string | null; title: string; thumbnailUrl: string | null }[] = []

  /* The variants of the physical products asked for, all of them: a line with no variant chosen takes the only one. */
  const physicalIds = rows.filter((p) => p.type === "physical").map((p) => p.id)
  const variantsByProduct = new Map<string, Record<string, any>[]>()
  if (physicalIds.length) {
    const { data: vs } = await db
      .from("product_variants")
      .select("id, product_id, name, price_cents, sku, weight_grams, image_url, track_inventory, inventory_policy, requires_shipping, taxable, active, fulfillment_location_id, fulfillment_method, pay_what_you_want, pwyw_min_price_cents")
      .in("product_id", physicalIds)
    for (const v of (vs ?? []) as Record<string, any>[]) {
      const list = variantsByProduct.get(v.product_id) ?? []
      list.push(v)
      variantsByProduct.set(v.product_id, list)
    }
  }
  const digitalVariantIds = req.items.filter((i) => i.variantId && byId.get(i.productId)?.type !== "physical").map((i) => i.variantId!) as string[]
  const digitalVariants = new Map<string, Record<string, any>>()
  if (digitalVariantIds.length) {
    const { data: vs } = await db.from("product_variants").select("id, product_id, name, price_cents, pay_what_you_want, pwyw_min_price_cents").in("id", digitalVariantIds)
    for (const v of (vs ?? []) as Record<string, any>[]) digitalVariants.set(v.id, v)
  }

  /* A download with a sales limit whose copies have all been sold is left out and named (lib/checkout/sales-limit). The checkout's hold decides the last copies. */
  const digitalIds = rows.filter((p) => p.type !== "physical").map((p) => p.id)
  const salesStanding = digitalIds.length ? await salesStandings(db as Parameters<typeof salesStandings>[0], digitalIds) : new Map()

  const [settings, locations] = await Promise.all([loadSettings(db, creatorId), loadLocations(db, creatorId)])
  const fulfilling = locations.filter((l) => l.active && l.fulfillsOrders).map((l) => l.id)
  const defaultLocation = settings.defaultLocationId && fulfilling.includes(settings.defaultLocationId) ? settings.defaultLocationId : (fulfilling[0] ?? null)

  /* Stock of the variants in play, at the locations that fulfil. */
  const physicalVariantIds = [...variantsByProduct.values()].flat().map((v) => v.id as string)
  const levelOf = new Map<string, number>()
  if (physicalVariantIds.length && fulfilling.length) {
    const { data: lv } = await db.from("inventory_levels").select("variant_id, location_id, available").in("variant_id", physicalVariantIds).in("location_id", fulfilling)
    for (const l of (lv ?? []) as { variant_id: string; location_id: string; available: number }[]) levelOf.set(`${l.variant_id}:${l.location_id}`, l.available)
  }

  const lines: PricedLine[] = []
  const dropped: string[] = []
  const stockIssues: StockIssue[] = []
  for (const item of req.items) {
    const p = byId.get(item.productId)
    if (!p) {
      dropped.push("A product that is no longer on sale")
      continue
    }
    if (!SELLABLE.has(p.type)) {
      dropped.push(p.title)
      continue
    }
    if (p.type !== "physical") {
      if (owned.has(ownedKey(p.id, item.variantId ?? null))) {
        dropped.push(p.title)
        ownedList.push({ productId: p.id, variantId: item.variantId ?? null, title: p.title, thumbnailUrl: p.thumbnail_url ?? null })
        continue
      }
      const standing = salesStanding.get(p.id)
      if (standing && standing.sold >= standing.limit) {
        dropped.push(p.title)
        continue
      }
      const v = item.variantId ? digitalVariants.get(item.variantId) : null
      if (item.variantId && (!v || v.product_id !== p.id)) {
        dropped.push(p.title)
        continue
      }
      /* Pay what you want is the amount the buyer named in the cart, held to
         the product's (or the option's) minimum and the ceiling, as the
         basket checkout holds it; none named is the minimum. Under it is
         refused with the reason, never charged at a price nobody chose. */
      const priced = baseFor(v ?? p, item.customPriceCents)
      if (priced.ok === false) return { ok: false, status: 400, error: `${p.title}: ${priced.error}` }
      const unit = priced.cents
      if (unit <= 0) {
        dropped.push(p.title)
        continue
      }
      lines.push({
        productId: p.id,
        variantId: v?.id ?? null,
        title: p.title,
        variantName: v?.name ?? null,
        sku: null,
        imageUrl: p.thumbnail_url,
        type: p.type,
        quantity: 1,
        unitCents: unit,
        discountCents: 0,
        requiresShipping: false,
        taxable: p.taxable !== false,
        weightGrams: 0,
        locationId: null,
        trackInventory: false,
        inventoryPolicy: "continue",
        shippingProfileId: null,
        fulfillmentMethod: null,
      })
      continue
    }

    const variants = (variantsByProduct.get(p.id) ?? []).filter((v) => v.active !== false)
    const v = item.variantId ? variants.find((x) => x.id === item.variantId) : variants.length === 1 ? variants[0] : null
    if (!v) {
      dropped.push(item.variantId ? `${p.title} (that option is no longer sold)` : `${p.title} (choose an option)`)
      continue
    }
    const unit = Math.max(0, Math.round(Number(v.price_cents ?? p.price_cents ?? 0)))
    if (unit <= 0) {
      dropped.push(p.title)
      continue
    }
    const tracked = v.track_inventory ?? p.track_inventory ?? true
    const policy: "deny" | "continue" = v.inventory_policy === "continue" || p.continue_selling ? "continue" : "deny"
    /* Where it ships from: its own location, else the one with enough available, else the default. */
    const own = v.fulfillment_location_id ?? p.fulfillment_location_id ?? null
    let locationId: string | null = own && fulfilling.includes(own) ? own : null
    if (!locationId) {
      locationId = fulfilling.find((l) => (levelOf.get(`${v.id}:${l}`) ?? 0) >= item.quantity) ?? defaultLocation
    }
    if (tracked && !locationId) {
      stockIssues.push({ productId: p.id, variantId: v.id, title: p.title, available: 0 })
      continue
    }
    const available = locationId ? (levelOf.get(`${v.id}:${locationId}`) ?? 0) : 0
    if (tracked && policy === "deny" && available < item.quantity) {
      stockIssues.push({ productId: p.id, variantId: v.id, title: v.name && v.name !== "Default" ? `${p.title}, ${v.name}` : p.title, available: Math.max(0, available) })
      continue
    }
    lines.push({
      productId: p.id,
      variantId: v.id,
      title: p.title,
      variantName: v.name && v.name !== "Default" ? v.name : null,
      sku: v.sku ?? null,
      imageUrl: v.image_url ?? p.thumbnail_url,
      type: "physical",
      quantity: item.quantity,
      unitCents: unit,
      discountCents: 0,
      requiresShipping: v.requires_shipping ?? p.requires_shipping ?? true,
      taxable: v.taxable ?? p.taxable ?? true,
      weightGrams: Math.max(0, Number(v.weight_grams ?? p.weight_grams ?? 0)),
      locationId,
      trackInventory: tracked,
      inventoryPolicy: policy,
      shippingProfileId: p.shipping_profile_id ?? null,
      fulfillmentMethod: methodOf(readMethod(v.fulfillment_method), readMethod(p.fulfillment_method)),
    })
  }

  /* Limit sales (./order-limit.ts): a product's variants together, never more than the seller allows in one order. */
  if (physicalIds.length) {
    const tooMany = overLimit(lines.filter((l) => l.type === "physical"), await orderLimits(db, physicalIds))
    if (tooMany) return { ok: false, status: 400, error: tooMany }
  }

  const tax = await loadTaxSettings(db, creatorId, settings)
  const available = (variantId: string, locationId: string) => levelOf.get(`${variantId}:${locationId}`) ?? 0
  /*
    Upsells and bundles (lib/offers): the store's own, applied to the lines this function just priced from the database, before any code.
    A line's discountCents is then the offers' part, and a code adds its own on what's left.
  */
  const { offers } = await loadOffers(db, creatorId, { activeOnly: true })
  const fromOffers = applyOffers(lines.map((l) => ({ productId: l.productId, unitCents: l.unitCents, quantity: l.quantity })), offers)
  fromOffers.discounts.forEach((d, i) => (lines[i].discountCents = d))
  const base = { ok: true as const, creatorId, lines, dropped, owned: ownedList, stockIssues, settings, tax, requiresShipping: lines.some((l) => l.requiresShipping), locations, available, offers: fromOffers.applied, suggestions: suggestionsFor(lines, offers) }

  const typed = typeof req.couponCode === "string" && req.couponCode.trim() ? req.couponCode : null
  if (!typed || lines.length === 0) return { ...base, coupon: null, couponLabel: null, freeShipping: false }
  const code = normaliseCode(typed)
  if (!code) return { ok: false, status: 400, error: "That code is not valid." }
  const coupon = (await findCoupon(db, creatorId, code)) as (CouponRow & { free_shipping?: boolean; physical_only?: boolean; per_customer_limit?: number | null; collection_ids?: string[] | null }) | null
  const standing = couponStanding(coupon)
  if (standing.ok === false) return { ok: false, status: 400, error: standing.error }
  const c = standing.coupon as typeof coupon & CouponRow

  /* Which lines the code covers: its products, its collections, physical only. */
  let inCollections: Set<string> | null = null
  if (c.collection_ids && c.collection_ids.length) {
    inCollections = new Set<string>()
    const { data: cols } = await db.from("product_collections").select("id, kind, rules, match").eq("creator_id", creatorId).in("id", c.collection_ids)
    const { data: manual } = await db.from("product_collection_items").select("collection_id, product_id").in("collection_id", c.collection_ids)
    for (const m of (manual ?? []) as { product_id: string }[]) inCollections.add(m.product_id)
    for (const col of (cols ?? []) as { kind: string; rules: unknown; match: "all" | "any" }[]) {
      if (col.kind !== "smart") continue
      const rules = readRules(col.rules)
      for (const p of rows) {
        const rp: RuleProduct = { id: p.id, title: p.title, type: p.type, tags: p.tags ?? [], vendor: p.vendor ?? null, priceCents: p.price_cents, compareAtCents: p.compare_at_price_cents ?? null, inventory: null, weightGrams: p.weight_grams ?? null, createdAt: p.created_at, category: p.category ?? null }
        if (inSmartCollection(rules, col.match, rp)) inCollections.add(p.id)
      }
    }
  }
  const applies = lines.map((l) => {
    if (c.physical_only && l.type !== "physical") return false
    if (inCollections) return inCollections.has(l.productId)
    return couponCovers(c, l.productId)
  })
  if (!applies.some(Boolean)) return { ok: false, status: 400, error: "That code does not apply to anything in your cart." }
  const eligible = lines.reduce((n, l, i) => n + (applies[i] ? l.unitCents * l.quantity : 0), 0)
  if (c.min_purchase_cents && eligible < c.min_purchase_cents) {
    return { ok: false, status: 400, error: `That code needs an order of at least $${(c.min_purchase_cents / 100).toFixed(2)}.` }
  }
  if (c.per_customer_limit && c.per_customer_limit > 0 && req.buyerEmail) {
    const { count } = await db
      .from("commerce_checkouts")
      .select("id", { count: "exact", head: true })
      .eq("creator_id", creatorId)
      .eq("coupon_id", c.id)
      .eq("status", "paid")
      .eq("buyer_email", req.buyerEmail.toLowerCase().trim())
    if ((count ?? 0) >= c.per_customer_limit) return { ok: false, status: 400, error: "You have already used this code." }
  }
  /* On what each line costs after its offers, so a code and a bundle together never take a line below zero. */
  const discounts = Number(c.discount_value) > 0 ? lineDiscounts(c, lines.map((l) => Math.max(0, l.unitCents * l.quantity - l.discountCents)), applies) : lines.map(() => 0)
  discounts.forEach((d, i) => (lines[i].discountCents += d))
  const freeShipping = c.free_shipping === true
  if (!freeShipping && discounts.every((d) => d <= 0)) return { ok: false, status: 400, error: "That code takes nothing off this order." }
  const label = [Number(c.discount_value) > 0 ? couponLabel(c) : null, freeShipping ? "free shipping" : null].filter(Boolean).join(" and ")
  return { ...base, coupon: c, couponLabel: label, freeShipping }
}

export interface CheckoutQuote {
  /** Shipping to the address: its options, or why there are none. */
  quote: Quote
  /** Local pickup points that can hand over this whole cart. */
  pickups: DeliveryOption[]
  option: DeliveryOption | null
  totals: PhysicalTotals
  /** The lines as they will be held: a pickup takes the stock from the pickup location. */
  lines: PricedLine[]
}

/**
 * Delivery for the address and the totals with the chosen option (or the
 * cheapest shipping rate). A pickup option needs no address: tax is then
 * worked out for the pickup location, and the shipped lines' stock is held
 * there.
 */
export async function quoteCheckout(db: Db, priced: Extract<PricedCheckout, { ok: true }>, address: Pick<Address, "country" | "region"> | null, optionId?: unknown): Promise<CheckoutQuote> {
  let quote: Quote = { ok: true, required: false, options: [] }
  let pickups: DeliveryOption[] = []
  if (priced.requiresShipping) {
    pickups = pickupOptions(priced.locations, priced.lines, priced.available)
    if (!address?.country) {
      quote = { ok: true, required: true, options: [] }
    } else {
      const [profiles, packageGrams] = await Promise.all([loadProfiles(db, priced.creatorId), defaultPackageGrams(db, priced.creatorId)])
      quote = quoteDelivery(
        profiles,
        priced.lines.map((l) => ({
          shippingProfileId: l.shippingProfileId,
          quantity: l.quantity,
          lineCents: l.unitCents * l.quantity - l.discountCents,
          weightGrams: l.weightGrams,
          requiresShipping: l.requiresShipping,
        })),
        { country: address.country, region: address.region ?? null },
        undefined,
        { packageGrams },
      )
    }
  }
  const pickup = isPickupOptionId(optionId) ? (pickups.find((o) => o.id === optionId) ?? null) : null
  const option = pickup ?? (quote.ok && quote.required ? (pickOption(quote, optionId) ?? quote.options[0] ?? null) : null)
  const pickupLocation = pickup ? priced.locations.find((l) => l.id === pickup.pickup?.locationId) ?? null : null
  const lines = pickupLocation
    ? priced.lines.map((l) => (l.type === "physical" && l.requiresShipping ? { ...l, locationId: pickupLocation.id } : l))
    : priced.lines
  const taxPlace = pickupLocation ? { country: pickupLocation.country, region: pickupLocation.region } : { country: address?.country ?? null, region: address?.region ?? null }
  const totals = physicalTotals(
    lines.map((l) => ({ productId: l.productId, unitCents: l.unitCents, quantity: l.quantity, discountCents: l.discountCents, taxable: l.taxable, digital: l.type !== "physical" })),
    { shippingCents: option?.priceCents ?? 0, freeShipping: priced.freeShipping, tax: priced.tax, country: taxPlace.country ?? null, region: taxPlace.region ?? null },
  )
  return { quote, pickups, option, totals, lines }
}
