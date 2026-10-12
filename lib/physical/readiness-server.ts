import "server-only"

/**
 * ===========================================================================
 *  PHYSICAL READINESS: THE READS, THE CACHE, AND WHAT CHANGED
 * ===========================================================================
 * readReadinessFacts reads what ./readiness.ts judges, with the loaders the
 * settings and the checkout themselves use, for one store. A read that fails
 * counts as nothing there, except payments and business details, which are
 * null (not known) and claim nothing.
 *
 * CACHED CHEAPLY. Home, Products, the editor and the builder all ask on
 * every visit, so the answer is kept per store for a minute
 * (unstable_cache, tag physical-readiness:<creator>), and every Settings save
 * that changes it (shipping, locations, packages, taxes, integrations)
 * clears the tag at once through readinessChanged, so the checklist and the
 * banners show the fix straight away. Products are saved from the browser,
 * so a product change is seen within the minute, or at once by a screen that
 * asks with `fresh`.
 *
 * WHAT CHANGED. noteReadiness compares the answer with the one last recorded
 * (physical_readiness_state, SQL part 162) and raises
 * physical_readiness.not_ready when a store with something on sale goes from
 * fine (or nothing on sale) to a blocking gap: the first physical product
 * published with no shipping rate, or the last zone deleted from a store that
 * was selling. It is keyed by the store and the episode, so the same change
 * seen by two screens at once, or by a screen and the hourly sweep, is one
 * event, and lib/notify turns it into one bell row and one email, then one
 * reminder (workflows/physical.ts). Before part 162 runs nothing is recorded
 * and nothing is raised from here: the banners still show, the emails wait.
 */
import { revalidateTag, unstable_cache } from "next/cache"
import { after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkoutReadyForCreator } from "@/lib/payments/service"
import { loadStoreLegal } from "@/lib/store/settings-server"
import { selectTolerant } from "@/lib/supabase/tolerant-select"
import { defaultPackageGrams, loadLocations, loadPackages, loadProfiles, loadSettings, loadTaxRates } from "./config-server"
import { methodOf, readMethod } from "./fulfillment"
import { madeToOrder } from "./partner"
import { physicalReadiness, readinessTransition, type PhysicalReadiness, type ReadinessFacts, type ReadinessProduct, type ReadinessState } from "./readiness"
import type { Location } from "./types"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const readinessTag = (creatorId: string) => `physical-readiness:${creatorId}`
const KEEP_SECONDS = 60

const PRODUCT_COLUMNS = "id, title, status, price_cents, weight_grams, requires_shipping, track_inventory, continue_selling, shipping_profile_id, fulfillment_location_id, fulfillment_method"
const VARIANT_COLUMNS = "id, product_id, price_cents, weight_grams, track_inventory, inventory_policy, requires_shipping, active, fulfillment_location_id, fulfillment_method"

type ProductRow = {
  id: string
  title: string | null
  status: string | null
  price_cents?: number | null
  weight_grams?: number | null
  requires_shipping?: boolean | null
  track_inventory?: boolean | null
  continue_selling?: boolean | null
  shipping_profile_id?: string | null
  fulfillment_location_id?: string | null
  fulfillment_method?: string | null
}
type VariantRow = {
  id: string
  product_id: string
  price_cents?: number | null
  weight_grams?: number | null
  track_inventory?: boolean | null
  inventory_policy?: string | null
  requires_shipping?: boolean | null
  active?: boolean | null
  fulfillment_location_id?: string | null
  fulfillment_method?: string | null
}

/**
 * Products and their variants as readiness reads them, the way the checkout
 * prices a line (checkout-pricing-server): a variant's own value first, then
 * the product's; printed to order is never short of stock.
 */
export function productsFrom(rows: ProductRow[], variants: VariantRow[], stock: Map<string, number>, locations: Location[]): ReadinessProduct[] {
  const byProduct = new Map<string, VariantRow[]>()
  for (const v of variants) {
    if (v.active === false) continue
    const list = byProduct.get(v.product_id) ?? []
    list.push(v)
    byProduct.set(v.product_id, list)
  }
  const fulfilling = new Set(locations.filter((l) => l.active && l.fulfillsOrders).map((l) => l.id))
  return rows
    .filter((p) => p.status !== "deleted" && p.status !== "archived")
    .map((p) => {
      /* A product saved before variants existed sells as itself: one line from the product's own columns. */
      const vs: VariantRow[] = byProduct.get(p.id) ?? [{ id: "", product_id: p.id }]
      let tracked = false
      let inStock = false
      let requiresShipping = false
      let weight: number | null = null
      let price: number | null = null
      for (const v of vs) {
        const own = v.fulfillment_location_id ?? p.fulfillment_location_id ?? null
        const printed = madeToOrder(methodOf(readMethod(v.fulfillment_method), readMethod(p.fulfillment_method)), locations.find((l) => l.id === own))
        const tracks = !printed && (v.track_inventory ?? p.track_inventory ?? true) !== false
        const sellsPastZero = v.inventory_policy === "continue" || p.continue_selling === true
        const counted = tracks && !sellsPastZero
        if (counted) tracked = true
        if (!counted || (v.id && (stock.get(v.id) ?? 0) > 0)) inStock = true
        if ((v.requires_shipping ?? p.requires_shipping ?? true) !== false) requiresShipping = true
        const w = Number(v.weight_grams ?? p.weight_grams ?? 0)
        weight = weight === null ? w : Math.min(weight, w)
        const c = Math.max(0, Math.round(Number(v.price_cents ?? p.price_cents ?? 0)))
        price = price === null ? c : Math.min(price, c)
      }
      /* Stock only counts at a location that fulfils orders, as checkout counts it. */
      if (tracked && fulfilling.size === 0) inStock = false
      return {
        id: p.id,
        title: (p.title ?? "").trim() || "Untitled product",
        live: p.status === "published",
        requiresShipping,
        tracked,
        inStock,
        weightGrams: weight && weight > 0 ? weight : null,
        priceCents: price ?? 0,
        shippingProfileId: p.shipping_profile_id ?? null,
        locationId: p.fulfillment_location_id ?? null,
      }
    })
}

export async function readReadinessFacts(db: Db, creatorId: string): Promise<ReadinessFacts> {
  const safe = <T,>(p: Promise<T> | PromiseLike<T>, fallback: T): Promise<T> => Promise.resolve(p).catch(() => fallback)
  const [settings, locations, profiles, packages, packageGrams, productRead, contact, legal, paymentsReady] = await Promise.all([
    safe(loadSettings(db, creatorId), null),
    safe(loadLocations(db, creatorId), [] as Location[]),
    safe(loadProfiles(db, creatorId), []),
    safe(loadPackages(db, creatorId), []),
    safe(defaultPackageGrams(db, creatorId), 0),
    safe(
      selectTolerant("readiness products", PRODUCT_COLUMNS, PRODUCT_COLUMNS.split(",").map((c) => c.trim()).slice(3), (columns) =>
        db.from("products").select(columns).eq("creator_id", creatorId).eq("type", "physical").limit(500),
      ),
      { data: [], error: null, dropped: [] as string[] },
    ),
    safe(contactEmailSet(db, creatorId), true),
    safe(loadStoreLegal(db, creatorId), null),
    /* Not knowing is not "not ready": a failed read claims nothing. */
    safe(checkoutReadyForCreator(creatorId) as Promise<boolean | null>, null),
  ])
  const rows = ((productRead as { data: unknown }).data ?? []) as ProductRow[]
  const ids = rows.map((r) => r.id)
  let variants: VariantRow[] = []
  const stock = new Map<string, number>()
  if (ids.length) {
    const v = await safe(
      selectTolerant("readiness variants", VARIANT_COLUMNS, VARIANT_COLUMNS.split(",").map((c) => c.trim()).slice(2), (columns) => db.from("product_variants").select(columns).in("product_id", ids)),
      { data: [], error: null, dropped: [] as string[] },
    )
    variants = ((v as { data: unknown }).data ?? []) as VariantRow[]
    const variantIds = variants.map((x) => x.id).slice(0, 1000)
    const fulfilling = locations.filter((l) => l.active && l.fulfillsOrders).map((l) => l.id)
    if (variantIds.length && fulfilling.length) {
      const { data: levels } = await safe(Promise.resolve(db.from("inventory_levels").select("variant_id, available").in("variant_id", variantIds).in("location_id", fulfilling).gt("available", 0)), { data: [] })
      for (const l of (levels ?? []) as { variant_id: string; available: number }[]) stock.set(l.variant_id, (stock.get(l.variant_id) ?? 0) + Number(l.available ?? 0))
    }
  }
  const taxMode = settings?.taxMode ?? "none"
  const taxRates = taxMode === "manual" ? (await safe(loadTaxRates(db, creatorId), [])).length : 0
  return {
    paymentsReady,
    products: productsFrom(rows, variants, stock, locations),
    profiles,
    locations,
    defaultLocationId: settings?.defaultLocationId ?? null,
    packages: packages.length,
    packageGrams,
    taxMode,
    taxRates,
    contactEmail: contact,
    businessDetails: legal ? true : taxMode === "manual" ? await safe(legalKnownEmpty(db, creatorId), null) : null,
  }
}

/** A store contact address or a support address is set. A read that fails says yes: nothing is claimed. */
async function contactEmailSet(db: Db, creatorId: string): Promise<boolean> {
  const usable = (v: unknown) => typeof v === "string" && v.includes("@")
  /* A query builder is a thenable with no .catch: each read is awaited in its own try. */
  const readOne = async (q: PromiseLike<{ data: unknown; error: unknown }>) => {
    try {
      return await q
    } catch {
      return { data: null, error: true }
    }
  }
  const [s, c] = await Promise.all([
    readOne(db.from("store_settings").select("contact_email").eq("creator_id", creatorId).maybeSingle()),
    readOne(db.from("creators").select("support_email").eq("id", creatorId).maybeSingle()),
  ])
  if (usable((s as { data?: { contact_email?: unknown } | null }).data?.contact_email)) return true
  if (usable((c as { data?: { support_email?: unknown } | null }).data?.support_email)) return true
  /* Neither could be read at all: don't nag. */
  if ((s as { error?: unknown }).error && (c as { error?: unknown }).error) return true
  return false
}

/** False only when the business column is there and empty; null when part 153 has not run (nothing to fill in yet). */
async function legalKnownEmpty(db: Db, creatorId: string): Promise<boolean | null> {
  const { error } = await db.from("store_settings").select("legal").eq("creator_id", creatorId).maybeSingle()
  return error ? null : false
}

export async function computePhysicalReadiness(db: Db, creatorId: string, opts: { asLive?: string | null } = {}): Promise<PhysicalReadiness> {
  return physicalReadiness(await readReadinessFacts(db, creatorId), opts)
}

/**
 * The answer for a store, kept a minute. `fresh` reads it now (a screen that
 * just saved something), and `asLive` asks for the editor's draft as if it
 * were published, which is never cached.
 */
export async function getPhysicalReadiness(creatorId: string, opts: { fresh?: boolean; asLive?: string | null } = {}): Promise<PhysicalReadiness> {
  if (opts.fresh || opts.asLive) {
    if (opts.fresh) clearReadiness(creatorId)
    return computePhysicalReadiness(createAdminClient(), creatorId, { asLive: opts.asLive ?? null })
  }
  return unstable_cache(() => computePhysicalReadiness(createAdminClient(), creatorId), ["physical-readiness", creatorId], { tags: [readinessTag(creatorId)], revalidate: KEEP_SECONDS })()
}

export function clearReadiness(creatorId: string): void {
  try {
    revalidateTag(readinessTag(creatorId), { expire: 0 })
  } catch {
    /* Outside a request (a script, a test): there is no cache to clear. */
  }
}

/* ── What changed ─────────────────────────────────────────────────────── */

export async function readState(db: Db, creatorId: string): Promise<ReadinessState | null | "unavailable"> {
  const { data, error } = await db.from("physical_readiness_state").select("broken, episode, signature, live").eq("creator_id", creatorId).maybeSingle()
  /* Part 162 not run (MISSING), or an outage: nothing is recorded, so nothing is told from here. */
  if (error) return "unavailable"
  if (!data) return null
  return { broken: data.broken === true, episode: Number(data.episode ?? 0), signature: String(data.signature ?? ""), live: Number(data.live ?? 0) }
}

/**
 * Records the answer and raises the event when it is news. Never throws:
 * a banner or a settings save never fails because of it.
 */
export async function noteReadiness(db: Db, creatorId: string, r: PhysicalReadiness): Promise<{ notified: boolean; recorded: boolean }> {
  const c = { creatorId }
  try {
    const prev = await readState(db, c.creatorId)
    if (prev === "unavailable") return { notified: false, recorded: false }
    const t = readinessTransition(prev, r)
    const same = prev && prev.broken === t.next.broken && prev.episode === t.next.episode && prev.signature === t.next.signature && prev.live === t.next.live
    if (!same) {
      const { error } = await db.from("physical_readiness_state").upsert({ creator_id: c.creatorId, ...t.next, updated_at: new Date().toISOString() }, { onConflict: "creator_id" })
      if (error) return { notified: false, recorded: false }
    }
    if (!t.notify) return { notified: false, recorded: true }
    /* The store's owner, always: a team member's save is still the owner's store to hear about. */
    const { data: owner } = await db.from("creators").select("user_id").eq("id", c.creatorId).maybeSingle()
    const userId = (owner as { user_id?: string | null } | null)?.user_id ?? null
    if (!userId) return { notified: false, recorded: true }
    const { emit } = await import("@/lib/notify/outbox")
    const out = await emit(
      {
        name: "physical_readiness.not_ready",
        key: `physical_readiness.not_ready:${c.creatorId}:${t.notify.episode}`,
        userId,
        creatorId: c.creatorId,
        entityType: "creator",
        entityId: c.creatorId,
        payload: { episode: t.notify.episode, reason: t.notify.reason, blocking: t.next.signature },
      },
      { db },
    )
    return { notified: out.ok, recorded: true }
  } catch {
    return { notified: false, recorded: false }
  }
}

/**
 * For a Settings route that just changed something readiness reads: the
 * cached answer is dropped at once, and after the response the store is
 * read again and any change recorded (and told, when it is news). Called as
 * `readinessChanged(c)` with the route's caller.
 */
export function readinessChanged(c: { creatorId: string; db?: Db }, opts: { recheck?: boolean } = {}): void {
  clearReadiness(c.creatorId)
  /* Stock is only ever a recommendation, never news: a stock count just drops the cached answer. */
  if (opts.recheck === false) return
  const run = async () => {
    const db = c.db ?? createAdminClient()
    const r = await computePhysicalReadiness(db, c.creatorId)
    await noteReadiness(db, c.creatorId, r)
  }
  try {
    after(() => run().catch(() => undefined))
  } catch {
    /* Not inside a request: do it now, without waiting for it. */
    void run().catch(() => undefined)
  }
}

/* ── The hourly sweep ─────────────────────────────────────────────────── */

export interface ReadinessSweep {
  available: boolean
  checked: number
  notified: number
}

/**
 * Every store with a physical product on sale, read again once an hour from
 * the notifications cron, so a store nobody opened still has its change
 * recorded and told (a product published from the browser, which no
 * Settings route sees). Only when physical commerce is on.
 */
export async function sweepPhysicalReadiness(db: Db, opts: { budgetMs?: number } = {}): Promise<ReadinessSweep> {
  const out: ReadinessSweep = { available: true, checked: 0, notified: 0 }
  const stopAt = Date.now() + (opts.budgetMs ?? 8_000)
  const { isPhysicalCommerceEnabled } = await import("@/lib/platform/physical-commerce")
  if (!(await isPhysicalCommerceEnabled())) return { ...out, available: false }
  const probe = await db.from("physical_readiness_state").select("creator_id").limit(1)
  if (probe.error) return { ...out, available: false }
  const { data, error } = await db.from("products").select("creator_id").eq("type", "physical").eq("status", "published").limit(5000)
  if (error) return { ...out, available: false }
  const { data: states } = await db.from("physical_readiness_state").select("creator_id").eq("broken", true)
  const creators = [...new Set(((data ?? []) as { creator_id: string }[]).map((r) => r.creator_id))]
  const brokenOnes = new Set(((states ?? []) as { creator_id: string }[]).map((s) => s.creator_id))
  /* A store recorded broken that has nothing live any more is read too, so it is recorded as fine. */
  for (const id of brokenOnes) if (!creators.includes(id)) creators.push(id)
  for (const creatorId of creators) {
    if (Date.now() > stopAt) break
    out.checked++
    const r = await computePhysicalReadiness(db, creatorId).catch(() => null)
    if (!r) continue
    const n = await noteReadiness(db, creatorId, r)
    if (n.notified) out.notified++
  }
  return out
}
