import "server-only"

/**
 * A store's upsells and bundles (store_offers, SQL part 116; the arithmetic
 * is lib/offers/offers.ts): reading them for the checkout and the product
 * page, and the store's own edits from /app/offers. Every product an offer
 * names must be the store's own; an offer whose products are no longer on
 * sale simply doesn't apply.
 */
import { loggable } from "@/lib/admin/plain-reason"
import { mediaUrl } from "@/lib/storage/media-url"
import { MAX_OFFERS, type Offer } from "@/lib/offers/offers"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

type Row = { id: string; kind: Offer["kind"]; title: string; product_ids: string[]; trigger_product_ids: string[]; discount_type: Offer["discountType"]; discount_value: number; active: boolean; position: number }
const COLUMNS = "id, kind, title, product_ids, trigger_product_ids, discount_type, discount_value, active, position"
const MISSING = new Set(["42P01", "PGRST205", "42703", "PGRST204"])

const offerOf = (r: Row): Offer => ({ id: r.id, kind: r.kind, title: r.title, productIds: r.product_ids ?? [], triggerIds: r.trigger_product_ids ?? [], discountType: r.discount_type, discountValue: Number(r.discount_value) || 0, active: r.active !== false })

/** The store's offers, in its order. A database without part 116 has none; a failed read has none too, so a checkout never stops on it. */
export async function loadOffers(db: Db, creatorId: string, opts: { activeOnly?: boolean } = {}): Promise<{ offers: Offer[]; ready: boolean }> {
  try {
    let q = db.from("store_offers").select(COLUMNS).eq("creator_id", creatorId)
    if (opts.activeOnly) q = q.eq("active", true)
    const { data, error } = await q.order("position", { ascending: true }).order("created_at", { ascending: true }).limit(MAX_OFFERS)
    if (error) {
      if (!MISSING.has(error.code ?? "")) console.error(`[offers] read failed: ${loggable(error)}`)
      return { offers: [], ready: !MISSING.has(error.code ?? "") }
    }
    return { offers: ((data ?? []) as Row[]).map(offerOf), ready: true }
  } catch (e) {
    console.error(`[offers] read failed: ${loggable(e)}`)
    return { offers: [], ready: true }
  }
}

/** Which of these ids are the store's own products. */
async function ownProducts(db: Db, creatorId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const { data } = await db.from("products").select("id").eq("creator_id", creatorId).in("id", ids)
  return new Set(((data ?? []) as { id: string }[]).map((r) => r.id))
}

type Failure = { ok: false; error: string; status: number }

export async function saveOffer(db: Db, creatorId: string, id: string | null, offer: Omit<Offer, "id">): Promise<{ ok: true; offer: Offer } | Failure> {
  const mine = await ownProducts(db, creatorId, [...offer.productIds, ...offer.triggerIds])
  if (offer.productIds.some((p) => !mine.has(p)) || offer.triggerIds.some((p) => !mine.has(p))) return { ok: false, error: "One of those products isn't in your store any more.", status: 400 }
  const row = { kind: offer.kind, title: offer.title, product_ids: offer.productIds, trigger_product_ids: offer.triggerIds, discount_type: offer.discountType, discount_value: offer.discountValue, active: offer.active, updated_at: new Date().toISOString() }
  if (id) {
    const { data, error } = await db.from("store_offers").update(row).eq("id", id).eq("creator_id", creatorId).select(COLUMNS).maybeSingle()
    if (error) return failed(error)
    if (!data) return { ok: false, error: "Not found.", status: 404 }
    return { ok: true, offer: offerOf(data as Row) }
  }
  const { count } = await db.from("store_offers").select("id", { count: "exact", head: true }).eq("creator_id", creatorId)
  if ((count ?? 0) >= MAX_OFFERS) return { ok: false, error: `A store can have up to ${MAX_OFFERS} offers.`, status: 400 }
  const { data, error } = await db.from("store_offers").insert({ ...row, creator_id: creatorId, position: count ?? 0 }).select(COLUMNS).single()
  if (error || !data) return failed(error)
  return { ok: true, offer: offerOf(data as Row) }
}

export async function deleteOffer(db: Db, creatorId: string, id: string): Promise<{ ok: true } | Failure> {
  const { data, error } = await db.from("store_offers").delete().eq("id", id).eq("creator_id", creatorId).select("id").maybeSingle()
  if (error) return failed(error)
  if (!data) return { ok: false, error: "Not found.", status: 404 }
  return { ok: true }
}

function failed(error: { code?: string } | null | undefined): Failure {
  if (error && MISSING.has(error.code ?? "")) return { ok: false, error: "Upsells and bundles need SQL part 116 (supabase/sql/run-now/116_store_offers.sql).", status: 503 }
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
  /** Options to choose from when there's more than one; one, already chosen, when there's just one. */
  variants: { id: string; name: string; priceCents: number }[]
}

/** The published products among `ids` that belong to the store, ready to show and add to a cart. */
export async function offerProducts(db: Db, creatorId: string, ids: string[]): Promise<Map<string, OfferProduct>> {
  const out = new Map<string, OfferProduct>()
  if (ids.length === 0) return out
  const { data: rows } = await db.from("products").select("id, title, slug, type, price_cents, thumbnail_url, status, creator_id").in("id", ids).eq("creator_id", creatorId).eq("status", "published")
  const products = (rows ?? []) as { id: string; title: string; slug: string; type: string; price_cents: number | null; thumbnail_url: string | null }[]
  const physical = products.filter((p) => p.type === "physical").map((p) => p.id)
  const variantsOf = new Map<string, { id: string; name: string; priceCents: number }[]>()
  if (physical.length) {
    const { data: vs } = await db.from("product_variants").select("id, product_id, name, price_cents, active").in("product_id", physical)
    for (const v of (vs ?? []) as { id: string; product_id: string; name: string | null; price_cents: number | null; active: boolean | null }[]) {
      if (v.active === false) continue
      const list = variantsOf.get(v.product_id) ?? []
      list.push({ id: v.id, name: v.name && v.name !== "Default" ? v.name : "Default", priceCents: Math.max(0, Math.round(Number(v.price_cents) || 0)) })
      variantsOf.set(v.product_id, list)
    }
  }
  for (const p of products) {
    const variants = p.type === "physical" ? (variantsOf.get(p.id) ?? []) : []
    if (p.type === "physical" && variants.length === 0) continue
    const priceCents = variants.length ? Math.min(...variants.map((v) => v.priceCents)) : Math.max(0, Math.round(Number(p.price_cents) || 0))
    if (priceCents <= 0) continue
    out.set(p.id, { id: p.id, title: p.title, slug: p.slug, imageUrl: p.thumbnail_url ? mediaUrl(p.thumbnail_url) : null, type: p.type, priceCents, variants })
  }
  return out
}
