import "server-only"

/**
 * ===========================================================================
 *  A PHYSICAL PRODUCT'S OPTIONS, VARIANTS, COSTS AND STOCK
 * ===========================================================================
 * The product row itself (title, description, images, price) is saved by
 * the product editor as it always was. What makes it physical is saved here,
 * by the server, for the owner only:
 *
 *   shipping   weight, size, origin, HS code, profile, tax, stock settings
 *   options    up to three (Size, Color...), their values
 *   variants   every combination, matched to the saved ones by its values so
 *              a variant keeps its id, stock and orders through an edit;
 *              one "Default" variant when there are no options
 *   costs      apart from the variant rows, which buyers can read
 *   stock      the on hand count per location, changed through
 *              physical_inventory_apply so every change is in the history
 *
 * The product's own price follows its cheapest active variant, so listings,
 * the shop grid and the product page agree with what the cart will charge.
 */

import { COUNTRY_CODES } from "@/lib/checkout/countries"
import type { Db } from "./auth"
import { int, text } from "./config-server"
import { normaliseOptions, planVariants, variantName, type Combination } from "./variants"
import type { InventoryLevel, PhysicalVariant, ProductOption } from "./types"
import { applyInventory } from "./inventory-server"

export interface PhysicalProductData {
  productId: string
  vendor: string | null
  tags: string[]
  requiresShipping: boolean
  weightGrams: number | null
  lengthMm: number | null
  widthMm: number | null
  heightMm: number | null
  weightUnit: "g" | "kg" | "oz" | "lb"
  dimensionUnit: "cm" | "in"
  originCountry: string | null
  hsCode: string | null
  taxable: boolean
  trackInventory: boolean
  continueSelling: boolean
  lowStockThreshold: number | null
  fulfillmentLocationId: string | null
  shippingProfileId: string | null
  options: ProductOption[]
  variants: PhysicalVariant[]
  levels: InventoryLevel[]
}

const PRODUCT_COLUMNS =
  "id, creator_id, type, title, price_cents, vendor, tags, requires_shipping, weight_grams, length_mm, width_mm, height_mm, weight_unit, dimension_unit, origin_country, hs_code, taxable, track_inventory, continue_selling, low_stock_threshold, fulfillment_location_id, shipping_profile_id"

const VARIANT_COLUMNS =
  "id, product_id, name, price_cents, compare_at_price_cents, position, option1, option2, option3, sku, barcode, weight_grams, image_url, track_inventory, inventory_policy, requires_shipping, taxable, active, fulfillment_location_id"

export function variantFromRow(r: Record<string, any>, product: Record<string, any>, cost: number | null): PhysicalVariant {
  return {
    id: r.id,
    productId: r.product_id,
    name: r.name,
    options: [r.option1 ?? null, r.option2 ?? null, r.option3 ?? null],
    priceCents: Number(r.price_cents ?? 0),
    compareAtCents: r.compare_at_price_cents ?? null,
    costCents: cost,
    sku: r.sku ?? null,
    barcode: r.barcode ?? null,
    weightGrams: r.weight_grams ?? product.weight_grams ?? null,
    imageUrl: r.image_url ?? null,
    trackInventory: r.track_inventory ?? product.track_inventory ?? true,
    inventoryPolicy: r.inventory_policy === "continue" || (r.inventory_policy == null && product.continue_selling) ? "continue" : "deny",
    requiresShipping: r.requires_shipping ?? product.requires_shipping ?? true,
    taxable: r.taxable ?? product.taxable ?? true,
    active: r.active !== false,
    fulfillmentLocationId: r.fulfillment_location_id ?? product.fulfillment_location_id ?? null,
    position: Number(r.position ?? 0),
  }
}

export async function loadPhysicalProduct(db: Db, creatorId: string, productId: string): Promise<PhysicalProductData | null> {
  const { data: p } = await db.from("products").select(PRODUCT_COLUMNS).eq("id", productId).eq("creator_id", creatorId).maybeSingle()
  if (!p) return null
  const [{ data: options }, { data: variants }] = await Promise.all([
    db.from("product_options").select("position, name, values").eq("product_id", productId).order("position"),
    db.from("product_variants").select(VARIANT_COLUMNS).eq("product_id", productId).order("position"),
  ])
  const ids = ((variants ?? []) as { id: string }[]).map((v) => v.id)
  const [{ data: costs }, { data: levels }] = ids.length
    ? await Promise.all([
        db.from("product_variant_costs").select("variant_id, cost_cents").eq("creator_id", creatorId).in("variant_id", ids),
        db.from("inventory_levels").select("variant_id, location_id, on_hand, committed, incoming, available").eq("creator_id", creatorId).in("variant_id", ids),
      ])
    : [{ data: [] }, { data: [] }]
  const costOf = new Map(((costs ?? []) as { variant_id: string; cost_cents: number }[]).map((c) => [c.variant_id, c.cost_cents]))
  return {
    productId,
    vendor: p.vendor ?? null,
    tags: p.tags ?? [],
    requiresShipping: p.requires_shipping ?? true,
    weightGrams: p.weight_grams ?? null,
    lengthMm: p.length_mm ?? null,
    widthMm: p.width_mm ?? null,
    heightMm: p.height_mm ?? null,
    weightUnit: p.weight_unit ?? "kg",
    dimensionUnit: p.dimension_unit ?? "cm",
    originCountry: p.origin_country ?? null,
    hsCode: p.hs_code ?? null,
    taxable: p.taxable !== false,
    trackInventory: p.track_inventory !== false,
    continueSelling: !!p.continue_selling,
    lowStockThreshold: p.low_stock_threshold ?? null,
    fulfillmentLocationId: p.fulfillment_location_id ?? null,
    shippingProfileId: p.shipping_profile_id ?? null,
    options: ((options ?? []) as { position: 1 | 2 | 3; name: string; values: string[] }[]).map((o) => ({ position: o.position, name: o.name, values: o.values ?? [] })),
    variants: ((variants ?? []) as Record<string, any>[]).map((v) => variantFromRow(v, p, costOf.get(v.id) ?? null)),
    levels: ((levels ?? []) as Record<string, any>[]).map((l) => ({
      variantId: l.variant_id,
      locationId: l.location_id,
      onHand: l.on_hand,
      committed: l.committed,
      incoming: l.incoming,
      available: l.available,
    })),
  }
}

export interface VariantInput {
  id?: string | null
  options: Combination
  priceCents: number | null
  compareAtCents: number | null
  costCents: number | null
  sku: string | null
  barcode: string | null
  weightGrams: number | null
  imageUrl: string | null
  active: boolean
  /** location id → on hand wanted; only the ones given are changed. */
  stock: Record<string, number>
}

function cents(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  return int(value, 0, 100_000_000)
}

function readVariant(raw: unknown): VariantInput | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const opts = Array.isArray(r.options) ? r.options : []
  const stock: Record<string, number> = {}
  if (r.stock && typeof r.stock === "object") {
    for (const [loc, qty] of Object.entries(r.stock as Record<string, unknown>)) {
      const n = int(qty, -1_000_000, 1_000_000)
      if (n !== null && /^[0-9a-f-]{36}$/i.test(loc)) stock[loc] = n
    }
  }
  const imageUrl = typeof r.imageUrl === "string" && /^https:\/\/[^\s"'<>]{1,2040}$/.test(r.imageUrl) ? r.imageUrl : null
  return {
    id: typeof r.id === "string" ? r.id : null,
    options: [0, 1, 2].map((i) => (typeof opts[i] === "string" && (opts[i] as string).trim() ? (opts[i] as string).trim().slice(0, 100) : null)) as Combination,
    priceCents: cents(r.priceCents),
    compareAtCents: cents(r.compareAtCents),
    costCents: cents(r.costCents),
    sku: text(r.sku, 64),
    barcode: text(r.barcode, 64),
    weightGrams: r.weightGrams === null || r.weightGrams === "" || r.weightGrams === undefined ? null : int(r.weightGrams, 0, 1_000_000),
    imageUrl,
    active: r.active !== false,
    stock,
  }
}

export type SaveResult = { ok: true; data: PhysicalProductData } | { ok: false; error: string; status?: number }

/**
 * Everything physical about one product, in one call. Validated first, so
 * a bad value changes nothing; then the product's shipping fields, the
 * options, the variants (kept, added, removed), their costs, and stock
 * counts, each stock change through the inventory engine.
 */
export async function savePhysicalProduct(db: Db, creatorId: string, productId: string, body: Record<string, unknown>): Promise<SaveResult> {
  const { data: product } = await db.from("products").select(PRODUCT_COLUMNS).eq("id", productId).eq("creator_id", creatorId).maybeSingle()
  if (!product) return { ok: false, error: "Product not found.", status: 404 }

  const options = normaliseOptions(body.options)
  const rawVariants = Array.isArray(body.variants) ? body.variants.slice(0, 250).map(readVariant) : []
  if (rawVariants.some((v) => v === null)) return { ok: false, error: "A variant could not be read." }
  const variantsIn = rawVariants as VariantInput[]

  const weightUnit = ["g", "kg", "oz", "lb"].includes(String(body.weightUnit)) ? String(body.weightUnit) : product.weight_unit ?? "kg"
  const dimensionUnit = ["cm", "in"].includes(String(body.dimensionUnit)) ? String(body.dimensionUnit) : product.dimension_unit ?? "cm"
  const origin = body.originCountry ? String(body.originCountry).toUpperCase() : null
  if (origin && !COUNTRY_CODES.has(origin)) return { ok: false, error: "Choose the country of origin." }
  const hs = body.hsCode ? String(body.hsCode).replace(/\s/g, "") : null
  if (hs && !/^[0-9.]{4,14}$/.test(hs)) return { ok: false, error: "An HS code is 6 to 10 digits." }

  for (const [key, table] of [
    ["fulfillmentLocationId", "inventory_locations"],
    ["shippingProfileId", "shipping_profiles"],
  ] as const) {
    const id = body[key]
    if (id === null || id === undefined || id === "") continue
    if (typeof id !== "string") return { ok: false, error: "Choose one of your own." }
    const { data } = await db.from(table).select("id").eq("id", id).eq("creator_id", creatorId).maybeSingle()
    if (!data) return { ok: false, error: "Choose one of your own." }
  }

  /* Stock locations named in the request must be this shop's. */
  const stockLocations = [...new Set(variantsIn.flatMap((v) => Object.keys(v.stock)))]
  if (stockLocations.length) {
    const { data: locs } = await db.from("inventory_locations").select("id").eq("creator_id", creatorId).in("id", stockLocations)
    if ((locs ?? []).length !== stockLocations.length) return { ok: false, error: "Stock can only be set at your own locations." }
  }

  const tags = Array.isArray(body.tags)
    ? [...new Set(body.tags.map((t) => (typeof t === "string" ? t.trim().slice(0, 40) : "")).filter(Boolean))].slice(0, 50)
    : (product.tags ?? [])

  const productUpdate: Record<string, unknown> = {
    vendor: text(body.vendor, 120),
    tags,
    requires_shipping: body.requiresShipping !== false,
    weight_grams: body.weightGrams === null || body.weightGrams === "" || body.weightGrams === undefined ? null : int(body.weightGrams, 0, 1_000_000),
    length_mm: body.lengthMm ? int(body.lengthMm, 0, 10_000) : null,
    width_mm: body.widthMm ? int(body.widthMm, 0, 10_000) : null,
    height_mm: body.heightMm ? int(body.heightMm, 0, 10_000) : null,
    weight_unit: weightUnit,
    dimension_unit: dimensionUnit,
    origin_country: origin,
    hs_code: hs,
    taxable: body.taxable !== false,
    track_inventory: body.trackInventory !== false,
    continue_selling: body.continueSelling === true,
    low_stock_threshold: body.lowStockThreshold === null || body.lowStockThreshold === "" || body.lowStockThreshold === undefined ? null : int(body.lowStockThreshold, 0, 1_000_000),
    fulfillment_location_id: (body.fulfillmentLocationId as string) || null,
    shipping_profile_id: (body.shippingProfileId as string) || null,
    updated_at: new Date().toISOString(),
  }

  /* The variants: matched by their option values to the ones saved. */
  const { data: existingRows } = await db.from("product_variants").select("id, option1, option2, option3, price_cents").eq("product_id", productId)
  const existing = ((existingRows ?? []) as { id: string; option1: string | null; option2: string | null; option3: string | null; price_cents: number }[]).map((v) => ({
    id: v.id,
    options: [v.option1, v.option2, v.option3] as Combination,
  }))
  let plan: ReturnType<typeof planVariants>
  try {
    plan = planVariants(existing, options)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Too many variants." }
  }
  const inputFor = (c: Combination, id?: string) =>
    (id ? variantsIn.find((v) => v.id === id) : null) ?? variantsIn.find((v) => variantName(v.options) === variantName(c)) ?? null
  const basePrice = Number(product.price_cents ?? 0)

  const { error: productError } = await db.from("products").update(productUpdate).eq("id", productId).eq("creator_id", creatorId)
  if (productError) return { ok: false, error: productError.code === "42703" || productError.code === "PGRST204" ? "Physical commerce needs its database update. Run SQL part 78 in Supabase." : "The product could not be saved." }

  /* Options: replaced as a whole, positions 1 to 3. */
  await db.from("product_options").delete().eq("product_id", productId)
  if (options.length) {
    const { error } = await db.from("product_options").insert(options.map((o) => ({ product_id: productId, position: o.position, name: o.name, values: o.values })))
    if (error) return { ok: false, error: "The options could not be saved." }
  }

  const rowFor = (c: Combination, input: VariantInput | null, position: number) => {
    const price = input?.priceCents ?? basePrice
    return {
      product_id: productId,
      name: variantName(c),
      option1: c[0],
      option2: c[1],
      option3: c[2],
      price_cents: price,
      compare_at_price_cents: input?.compareAtCents && input.compareAtCents > price ? input.compareAtCents : null,
      position,
      sku: input?.sku ?? null,
      barcode: input?.barcode ?? null,
      weight_grams: input?.weightGrams ?? null,
      image_url: input?.imageUrl ?? null,
      active: input ? input.active : true,
    }
  }

  const savedIds: { id: string; input: VariantInput | null }[] = []
  let position = 0
  /* Removed first, so the unique option index never sees an old and a new row with the same values. */
  for (const id of plan.remove) {
    const { error } = await db.from("product_variants").delete().eq("id", id).eq("product_id", productId)
    /* A variant somebody bought stays, switched off: its orders keep pointing at it. */
    if (error) await db.from("product_variants").update({ active: false, option1: null, option2: null, option3: null, name: `Archived ${id.slice(0, 8)}` }).eq("id", id)
  }
  for (const k of plan.keep) {
    const input = inputFor(k.options, k.id)
    const { error } = await db.from("product_variants").update(rowFor(k.options, input, position++)).eq("id", k.id).eq("product_id", productId)
    if (error) return { ok: false, error: error.code === "23505" ? "Two variants have the same options." : "A variant could not be saved." }
    savedIds.push({ id: k.id, input })
  }
  for (const c of plan.create) {
    const input = inputFor(c)
    const { data, error } = await db.from("product_variants").insert(rowFor(c, input, position++)).select("id").single()
    if (error || !data) return { ok: false, error: error?.code === "23505" ? "Two variants have the same options." : "A variant could not be saved." }
    savedIds.push({ id: data.id, input })
  }

  /* Costs: private, one row per variant, removed when cleared. */
  const withCost = savedIds.filter((s) => s.input?.costCents !== null && s.input?.costCents !== undefined)
  const withoutCost = savedIds.filter((s) => !withCost.includes(s)).map((s) => s.id)
  if (withCost.length) {
    await db.from("product_variant_costs").upsert(
      withCost.map((s) => ({ variant_id: s.id, creator_id: creatorId, cost_cents: s.input!.costCents, updated_at: new Date().toISOString() })),
      { onConflict: "variant_id" },
    )
  }
  if (withoutCost.length) await db.from("product_variant_costs").delete().eq("creator_id", creatorId).in("variant_id", withoutCost)

  /* The product's price is its cheapest active variant's. */
  const prices = savedIds.filter((s) => s.input?.active !== false).map((s) => s.input?.priceCents ?? basePrice)
  if (prices.length) await db.from("products").update({ price_cents: Math.min(...prices) }).eq("id", productId).eq("creator_id", creatorId)

  /* Stock counts: the difference from what is on hand now, as a count. */
  for (const s of savedIds) {
    if (!s.input) continue
    for (const [locationId, wanted] of Object.entries(s.input.stock)) {
      const { data: level } = await db.from("inventory_levels").select("on_hand").eq("variant_id", s.id).eq("location_id", locationId).maybeSingle()
      const delta = wanted - Number(level?.on_hand ?? 0)
      if (delta === 0 && level) continue
      const moved = await applyInventory(db, {
        creatorId,
        variantId: s.id,
        locationId,
        onHand: delta,
        reason: level ? "count" : "initial",
        actor: "creator",
        note: "Set in the product editor",
      })
      if (!moved.ok) return { ok: false, error: moved.error }
    }
  }

  const data = await loadPhysicalProduct(db, creatorId, productId)
  return data ? { ok: true, data } : { ok: false, error: "Saved, but could not be read back. Refresh the page." }
}
