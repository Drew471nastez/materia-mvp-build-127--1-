import "server-only"

/**
 * A store's upsells and bundles (store_offers, SQL parts 116 and 230; the
 * arithmetic is lib/offers/offers.ts, the reads lib/offers/offers-read.ts):
 * the store's own edits from /app/offers, and the products an offer shows a
 * buyer. Every product and collection an offer names must be the store's
 * own; an offer whose products are no longer on sale simply doesn't apply.
 * Saving one of part 230's settings away from its default before that part
 * has run says which part to run, rather than dropping it without a word.
 */
import { loggable } from "@/lib/admin/plain-reason"
import { mediaUrl } from "@/lib/storage/media-url"
import { selectTolerant } from "@/lib/supabase/tolerant-select"
import { MAX_OFFERS, PLACEMENTS_FOR, discountLabel, offerUnitPrice, type Offer } from "@/lib/offers/offers"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { shopMoneyIn } from "@/lib/store/shop-money"
import { BASE_COLUMNS, COLUMNS, PART_230, loadOffers, offerOf, type Row } from "./offers-read"

export { collectionsOf, loadOffers, offerLinesFor, offerOf, PART_230, PART_230_COLUMNS } from "./offers-read"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** Which of these ids are the store's own products. */
async function ownProducts(db: Db, creatorId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const { data } = await db.from("products").select("id").eq("creator_id", creatorId).in("id", ids)
  return new Set(((data ?? []) as { id: string }[]).map((r) => r.id))
}

/** Which of these ids are the store's own collections. */
async function ownCollections(db: Db, creatorId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const { data } = await db.from("product_collections").select("id").eq("creator_id", creatorId).in("id", ids)
  return new Set(((data ?? []) as { id: string }[]).map((r) => r.id))
}

type Failure = { ok: false; error: string; status: number }

/** Whether an offer uses any of part 230's settings away from its default. */
function usesNewSettings(o: Omit<Offer, "id">): boolean {
  const all = PLACEMENTS_FOR[o.kind]
  const places = o.placements ?? all
  return (
    (o.triggerCollectionIds?.length ?? 0) > 0 ||
    places.length !== all.length ||
    !!o.startsAt ||
    !!o.endsAt ||
    o.combinesWithCodes === false ||
    o.maxPerOrder != null ||
    o.minSubtotalCents != null ||
    o.discountType === "free_shipping"
  )
}

function rowOf(o: Omit<Offer, "id">, withSettings: boolean) {
  const base = { kind: o.kind, title: o.title, product_ids: o.productIds, trigger_product_ids: o.triggerIds, discount_type: o.discountType, discount_value: o.discountValue, active: o.active, updated_at: new Date().toISOString() }
  if (!withSettings) return base
  return {
    ...base,
    trigger_collection_ids: o.triggerCollectionIds ?? [],
    placements: o.placements ?? [...PLACEMENTS_FOR[o.kind]],
    starts_at: o.startsAt ?? null,
    ends_at: o.endsAt ?? null,
    combines_with_codes: o.combinesWithCodes !== false,
    max_per_order: o.maxPerOrder ?? null,
    min_subtotal_cents: o.minSubtotalCents ?? null,
  }
}

export async function saveOffer(db: Db, creatorId: string, id: string | null, offer: Omit<Offer, "id">): Promise<{ ok: true; offer: Offer } | Failure> {
  const mine = await ownProducts(db, creatorId, [...offer.productIds, ...offer.triggerIds])
  if (offer.productIds.some((p) => !mine.has(p)) || offer.triggerIds.some((p) => !mine.has(p))) return { ok: false, error: "One of those products isn't in your store any more.", status: 400 }
  const collections = offer.triggerCollectionIds ?? []
  if (collections.length) {
    const own = await ownCollections(db, creatorId, collections)
    if (collections.some((c) => !own.has(c))) return { ok: false, error: "One of those collections isn't in your store any more.", status: 400 }
  }
  const write = async (withSettings: boolean) => {
    const row = rowOf(offer, withSettings)
    const columns = withSettings ? COLUMNS : BASE_COLUMNS
    if (id) return db.from("store_offers").update(row).eq("id", id).eq("creator_id", creatorId).select(columns).maybeSingle()
    const { count } = await db.from("store_offers").select("id", { count: "exact", head: true }).eq("creator_id", creatorId)
    if ((count ?? 0) >= MAX_OFFERS) return { data: null, error: { code: "LIMIT" } }
    return db.from("store_offers").insert({ ...row, creator_id: creatorId, position: count ?? 0 }).select(columns).single()
  }
  let { data, error } = await write(true)
  /* Part 230 not run yet: an offer that needs none of its settings is saved without them; one that does says so. */
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    if (usesNewSettings(offer)) return { ok: false, error: `Dates, places, limits, collections, free shipping and the code rule need SQL part 230 (${PART_230}). Run it in Supabase and save again.`, status: 503 }
    ;({ data, error } = await write(false))
  }
  if (error?.code === "LIMIT") return { ok: false, error: `A store can have up to ${MAX_OFFERS} offers.`, status: 400 }
  if (error) return failed(error)
  if (!data) return id ? { ok: false, error: "Not found.", status: 404 } : failed(null)
  return { ok: true, offer: offerOf(data as Row) }
}

/** The store's order for its offers: the ids as listed, first applies first. Ids that aren't the store's change nothing. */
export async function reorderOffers(db: Db, creatorId: string, ids: string[]): Promise<{ ok: true } | Failure> {
  const { offers, ready } = await loadOffers(db, creatorId)
  if (!ready) return failed({ code: "42P01" })
  const own = new Set(offers.map((o) => o.id))
  const order = [...ids.filter((id) => own.has(id)), ...offers.map((o) => o.id).filter((id) => !ids.includes(id))]
  for (const [position, id] of order.entries()) {
    const { error } = await db.from("store_offers").update({ position }).eq("id", id).eq("creator_id", creatorId)
    if (error) return failed(error)
  }
  return { ok: true }
}

export async function deleteOffer(db: Db, creatorId: string, id: string): Promise<{ ok: true } | Failure> {
  const { data, error } = await db.from("store_offers").delete().eq("id", id).eq("creator_id", creatorId).select("id").maybeSingle()
  if (error) return failed(error)
  if (!data) return { ok: false, error: "Not found.", status: 404 }
  return { ok: true }
}

function failed(error: { code?: string } | null | undefined): Failure {
  if (error && (error.code === "42P01" || error.code === "PGRST205")) return { ok: false, error: "Upsells and bundles need SQL part 116 (supabase/sql/run-now/116_store_offers.sql).", status: 503 }
  console.error(`[offers] write failed: ${loggable(error)}`)
  return { ok: false, error: "That could not be saved. Try again in a moment.", status: 500 }
}

/* ─────────────────── the products an offer shows to a buyer ─────────────────── */

export interface OfferProduct {
  id: string
  title: string
  slug: string
  imageUrl: string | null
  type: string
  /** The price a buyer pays without the offer: the product's, or its cheapest option's. */
  priceCents: number
  /** Options to choose from when there's more than one; one, already chosen, when there's just one. Only options that can be bought now. */
  variants: { id: string; name: string; priceCents: number }[]
}

const VARIANT_COLUMNS = "id, product_id, name, price_cents, active, track_inventory, inventory_policy"

/**
 * The published products among `ids` that belong to the store, ready to show
 * and add to a cart. An option out of stock (tracked, and not sold past zero)
 * is left out, and a product with no option left is too, so a bundle with it
 * isn't shown; the checkout counts the stock again when it holds it.
 */
export async function offerProducts(db: Db, creatorId: string, ids: string[]): Promise<Map<string, OfferProduct>> {
  const out = new Map<string, OfferProduct>()
  if (ids.length === 0) return out
  const { data: rows } = await selectTolerant("offer products", "id, title, slug, type, price_cents, thumbnail_url, status, creator_id, pay_what_you_want, pwyw_min_price_cents, track_inventory, continue_selling", ["pay_what_you_want", "pwyw_min_price_cents", "track_inventory", "continue_selling"], (columns) =>
    db.from("products").select(columns).in("id", ids).eq("creator_id", creatorId).eq("status", "published"),
  )
  const products = (rows ?? []) as { id: string; title: string; slug: string; type: string; price_cents: number | null; thumbnail_url: string | null; pay_what_you_want?: boolean | null; pwyw_min_price_cents?: number | null; track_inventory?: boolean | null; continue_selling?: boolean | null }[]
  const physical = products.filter((p) => p.type === "physical").map((p) => p.id)
  const variantsOf = new Map<string, { id: string; name: string; priceCents: number }[]>()
  if (physical.length) {
    const { data: vs } = await selectTolerant("offer variants", VARIANT_COLUMNS, ["track_inventory", "inventory_policy"], (columns) => db.from("product_variants").select(columns).in("product_id", physical))
    const list = ((vs ?? []) as { id: string; product_id: string; name: string | null; price_cents: number | null; active: boolean | null; track_inventory?: boolean | null; inventory_policy?: string | null }[]).filter((v) => v.active !== false)
    const stock = new Map<string, number>()
    if (list.length) {
      const { data: lv } = await db.from("inventory_levels").select("variant_id, available").in("variant_id", list.map((v) => v.id))
      for (const l of (lv ?? []) as { variant_id: string; available: number | null }[]) stock.set(l.variant_id, (stock.get(l.variant_id) ?? 0) + Math.max(0, Number(l.available) || 0))
    }
    const byId = new Map(products.map((p) => [p.id, p]))
    for (const v of list) {
      const p = byId.get(v.product_id)
      const tracked = (v.track_inventory ?? p?.track_inventory ?? true) !== false
      const sellsPast = v.inventory_policy === "continue" || p?.continue_selling === true
      if (tracked && !sellsPast && (stock.get(v.id) ?? 0) <= 0) continue
      const options = variantsOf.get(v.product_id) ?? []
      options.push({ id: v.id, name: v.name && v.name !== "Default" ? v.name : "Default", priceCents: Math.max(0, Math.round(Number(v.price_cents) || 0)) })
      variantsOf.set(v.product_id, options)
    }
  }
  for (const p of products) {
    const variants = p.type === "physical" ? (variantsOf.get(p.id) ?? []) : []
    if (p.type === "physical" && variants.length === 0) continue
    /* Pay what you want shows its minimum, which is what a line that names no amount costs (lib/checkout/pricing baseFor). */
    const own = p.pay_what_you_want ? Number(p.pwyw_min_price_cents) || 0 : Number(p.price_cents) || 0
    const priceCents = variants.length ? Math.min(...variants.map((v) => v.priceCents)) : Math.max(0, Math.round(own))
    if (priceCents <= 0) continue
    out.set(p.id, { id: p.id, title: p.title, slug: p.slug, imageUrl: p.thumbnail_url ? mediaUrl(p.thumbnail_url) : null, type: p.type, priceCents, variants })
  }
  return out
}

/** How an offer's discount reads for a buyer, in the store's own currency ("15% off", "€5.00 off"); null when it has none. */
export async function offerLabeler(db: Db, creatorId: string): Promise<(o: Pick<Offer, "discountType" | "discountValue">) => string | null> {
  const { currency } = await readStoreCurrency(db, creatorId)
  return (o) => (o.discountType === "none" ? null : discountLabel(o, (c) => shopMoneyIn(c, currency)))
}

/** A checkout offer as a card a buyer can add: its product, and the price it adds at. */
export async function suggestionCards(db: Db, creatorId: string, offers: Offer[]) {
  if (offers.length === 0) return []
  const [products, label] = await Promise.all([offerProducts(db, creatorId, offers.map((o) => o.productIds[0])), offerLabeler(db, creatorId)])
  return offers.flatMap((o) => {
    const p = products.get(o.productIds[0])
    if (!p) return []
    return [{ offerId: o.id, title: o.title, label: label(o), product: p, offerPriceCents: offerUnitPrice(o, p.priceCents) }]
  })
}

/* ─────────────────── the store's own page, /app/offers ─────────────────── */

export interface OfferAreaProduct {
  id: string
  title: string
  type: string
  published: boolean
  /** What one costs: its price, or its minimum for pay what you want. */
  priceCents: number
  imageUrl: string | null
  /** Pay what you want: an offer never discounts it; it counts toward a set at its minimum. */
  payWhatYouWant: boolean
}

/**
 * Everything /app/offers draws, read once on the server (the page) or by
 * GET /api/store/offers: the offers in their order, the store's products and
 * collections to choose from, whether parts 116 and 230 have run, and the
 * currency its amounts are in. Every read is filtered by the creator id the
 * caller was checked for.
 */
export async function offersArea(db: Db, creatorId: string) {
  const [{ offers, ready, settings }, { data: rows }, { data: cols }, store] = await Promise.all([
    loadOffers(db, creatorId),
    db.from("products").select("id, title, type, status, price_cents, thumbnail_url, pay_what_you_want, pwyw_min_price_cents").eq("creator_id", creatorId).neq("status", "archived").order("created_at", { ascending: false }).limit(500),
    db.from("product_collections").select("id, title").eq("creator_id", creatorId).order("title").limit(200),
    readStoreCurrency(db, creatorId),
  ])
  type P = { id: string; title: string; type: string; status: string; price_cents: number | null; thumbnail_url: string | null; pay_what_you_want?: boolean | null; pwyw_min_price_cents?: number | null }
  const products: OfferAreaProduct[] = ((rows ?? []) as P[]).map((p) => ({
    id: p.id,
    title: p.title,
    type: p.type,
    published: p.status === "published",
    priceCents: Math.max(0, Math.round(Number(p.pay_what_you_want ? p.pwyw_min_price_cents : p.price_cents) || 0)),
    imageUrl: p.thumbnail_url ? mediaUrl(p.thumbnail_url) : null,
    payWhatYouWant: p.pay_what_you_want === true,
  }))
  const collections = ((cols ?? []) as { id: string; title: string }[]).map((c) => ({ id: c.id, title: c.title }))
  return { offers, products, collections, ready, settings, currency: store.currency }
}
