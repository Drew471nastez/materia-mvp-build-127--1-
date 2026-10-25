/**
 * ===========================================================================
 *  THE PRODUCT THE PRODUCT SECTION DRAWS, READ ON THE SERVER
 * ===========================================================================
 * The main product section reads the product it is about from
 * `_product_data` (lib/products/product-page-model.ts says what is in it).
 * Two places fill it, and both call this, so the section is given the same
 * product in the builder's canvas as on the live page:
 *
 *   the live product page     components/website-builder/theme/render-product.tsx
 *   the builder's canvas      app/api/website-builder/products (?id=), for the
 *                             product the creator chose to preview
 *
 * What it reads beside the product row: its variants (with each one's option
 * values, picture, compare at price and pay what you want terms), its
 * options (Size, Colour), whether each variant can be bought (stock for a
 * product that ships, the purchase limit for one that does not), and the
 * kind of each file a download holds, and the size chart a product that
 * ships was given. A column an older database does not
 * have yet is asked for again without it, and a read that fails leaves its
 * part empty: a product whose options will not load is still a product.
 *
 * ONLY WHAT A VISITOR OF THE PAGE COULD SEE. Never a cost, a SKU, a
 * location, an exact stock level above the "only N left" line, or a file's
 * own name.
 */

import { cleanSwatches } from "@/lib/products/option-swatches"
import { cleanStoredHtml, looksLikeHtml, plainTextToHtml } from "@/lib/rich-text/html"
import { variantSoldOut } from "@/lib/checkout/pricing"
import { SAY_LEFT_FROM, liveVariant, physicalStock } from "@/lib/physical/storefront-stock"
import { productDelivery } from "@/lib/physical/storefront-facts"
import { mediaUrl } from "@/lib/storage/media-url"
import { uniqueImages, type ProductOptionData, type ProductSectionData, type ProductVariantData } from "./product-page-model"
import { shownCustomFields } from "./custom-fields"
import { readPersonalization } from "./personalization"
import { productFaqs } from "./product-faqs"
import { salesStanding } from "./sales-standings"
import { FEW_LEFT, copiesLeft } from "./sales-limit"
import { sizeChartForProduct } from "@/lib/size-charts/storefront"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** The product row as the routes read it: `*`, so any of these may be missing. */
export interface ProductSectionRow {
  id: string
  creator_id?: string | null
  title?: string | null
  slug?: string | null
  type?: string | null
  description?: string | null
  price_cents?: number | null
  compare_at_cents?: number | null
  thumbnail_url?: string | null
  gallery_urls?: unknown
  whats_included?: unknown
  pay_what_you_want?: boolean | null
  pwyw_min_price_cents?: number | null
  pwyw_suggested_price_cents?: number | null
  inventory_count?: number | null
  track_inventory?: boolean | null
  continue_selling?: boolean | null
  low_stock_threshold?: number | null
  created_at?: string | null
  category?: string | null
  faqs?: unknown
  custom_fields?: unknown
  /** What a buyer is asked when buying it (SQL part 307, lib/products/personalization). */
  personalization?: unknown
}

const VARIANT_TIERS = [
  "id, name, option1, option2, option3, price_cents, compare_at_price_cents, image_url, pay_what_you_want, pwyw_min_price_cents, pwyw_suggested_price_cents, max_purchases, active, track_inventory, inventory_policy, position",
  "id, name, price_cents, compare_at_price_cents, pay_what_you_want, pwyw_min_price_cents, pwyw_suggested_price_cents, max_purchases, position",
  "id, name, price_cents, position",
]

type VariantRow = {
  id: string
  name: string | null
  option1?: string | null
  option2?: string | null
  option3?: string | null
  price_cents: number | null
  compare_at_price_cents?: number | null
  image_url?: string | null
  pay_what_you_want?: boolean | null
  pwyw_min_price_cents?: number | null
  pwyw_suggested_price_cents?: number | null
  max_purchases?: number | null
  active?: boolean | null
  track_inventory?: boolean | null
  inventory_policy?: string | null
}

async function readVariants(db: Db, productId: string): Promise<VariantRow[]> {
  for (const cols of VARIANT_TIERS) {
    try {
      const { data, error } = await db.from("product_variants").select(cols).eq("product_id", productId).order("position", { ascending: true })
      if (error) continue
      return (data ?? []) as VariantRow[]
    } catch {
      return []
    }
  }
  return []
}

async function readOptions(db: Db, productId: string): Promise<ProductOptionData[]> {
  try {
    /* With each value's own swatch (part 286, lib/products/option-swatches.ts); a database before it answers without. */
    let res = await db.from("product_options").select("name, values, position, swatches").eq("product_id", productId).order("position", { ascending: true })
    if (res.error) res = await db.from("product_options").select("name, values, position").eq("product_id", productId).order("position", { ascending: true })
    const { data, error } = res
    if (error) return []
    return ((data ?? []) as { name: unknown; values: unknown; swatches?: unknown }[])
      .filter((o) => typeof o.name === "string" && Array.isArray(o.values))
      .map((o) => {
        const values = (o.values as unknown[]).filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim())
        const swatches = cleanSwatches(o.swatches, values)
        return { name: (o.name as string).trim(), values, ...(Object.keys(swatches).length ? { swatches } : {}) }
      })
      .filter((o) => o.name && o.values.length)
  } catch {
    return []
  }
}

/** A download's files, by kind and size only: "PDF, 2.1MB". Never the file's own name. */
async function readFiles(db: Db, productId: string): Promise<NonNullable<ProductSectionData["files"]>> {
  try {
    const { data, error } = await db
      .from("digital_assets")
      .select("file_name, file_size, mime_type")
      .eq("product_id", productId)
      .eq("upload_status", "completed")
      .order("created_at", { ascending: true })
      .limit(50)
    if (error) return []
    return ((data ?? []) as { file_name?: string | null; file_size?: number | null; mime_type?: string | null }[]).map((f) => {
      const ext = (f.file_name ?? "").split(".").pop() ?? ""
      return { file_name: ext && ext !== f.file_name ? `file.${ext.slice(0, 8)}` : "file", file_size: Number(f.file_size) || 0, mime_type: f.mime_type ?? "" }
    })
  } catch {
    return []
  }
}

/** The description as markup the section may inject: cleaned rich text, or plain text as paragraphs. */
export function descriptionHtml(description: string | null | undefined): string {
  if (!description) return ""
  return looksLikeHtml(description) ? cleanStoredHtml(description) : plainTextToHtml(description)
}

/**
 * Everything the product section needs about one product. `opts.files` reads
 * the kinds of file a download holds (the File list block).
 */
export async function productSectionData(db: Db, row: ProductSectionRow, opts: { files?: boolean; counts?: boolean } = {}): Promise<ProductSectionData> {
  const type = row.type ?? ""
  const [rawVariants, options, files, standing, delivery, sizeChart] = await Promise.all([
    readVariants(db, row.id),
    type === "physical" ? readOptions(db, row.id) : Promise.resolve([] as ProductOptionData[]),
    opts.files && type !== "physical" ? readFiles(db, row.id) : Promise.resolve([] as NonNullable<ProductSectionData["files"]>),
    /* Limit sales (lib/products/sales-limit.ts): a download's copies left, counted on the server. None for no limit, or a client that may not ask. */
    type !== "physical" ? salesStanding(db as Parameters<typeof salesStanding>[0], row.id).catch(() => null) : Promise.resolve(null),
    /* Delivery and pickup (lib/physical/storefront-facts.ts): the cheapest delivery home and how long, the pickup points that hold each option. */
    type === "physical" && row.creator_id ? productDelivery(db, row.creator_id, row.id) : Promise.resolve(null),
    /* Its size chart (lib/size-charts/storefront.ts): the Size chart block and the variant picker's Size guide link. None before SQL part 283 has run. */
    type === "physical" ? sizeChartForProduct(db, row.id, row.creator_id ?? null) : Promise.resolve(null),
  ])

  const variantsLive = rawVariants.filter((v) => liveVariant({ id: v.id, name: v.name ?? "", active: v.active }))
  const salesLeft = standing ? copiesLeft(standing) : null
  const productSoldOut = (typeof row.inventory_count === "number" && row.inventory_count <= 0 && type !== "physical") || salesLeft === 0

  /* Whether each can be bought: stock for what ships, the purchase limit for the rest. */
  let stock = new Map<string, { soldOut: boolean; left: number | null; maxQuantity: number; lowAt?: number; count?: number | null }>()
  if (type === "physical" && row.creator_id && variantsLive.length) {
    stock = await physicalStock(db, { id: row.id, creator_id: row.creator_id, track_inventory: row.track_inventory, continue_selling: row.continue_selling, low_stock_threshold: row.low_stock_threshold ?? null }, variantsLive.map((v) => ({ id: v.id, name: v.name ?? "", active: v.active, track_inventory: v.track_inventory, inventory_policy: v.inventory_policy })))
  }
  const limited = new Set<string>()
  if (type !== "physical") {
    await Promise.all(
      variantsLive
        .filter((v) => Number(v.max_purchases) > 0)
        .map(async (v) => {
          if (await variantSoldOut(db, { id: v.id, max_purchases: v.max_purchases }).catch(() => false)) limited.add(v.id)
        }),
    )
  }

  const variants: ProductVariantData[] = variantsLive.map((v) => {
    const s = stock.get(v.id)
    const price = Math.max(0, Number(v.price_cents) || 0)
    const compare = Number(v.compare_at_price_cents) || 0
    return {
      id: v.id,
      name: (v.name ?? "").trim() || "Option",
      options: [v.option1 ?? null, v.option2 ?? null, v.option3 ?? null],
      price_cents: price,
      compare_at_cents: compare > price ? compare : null,
      /* Storelib's own address, as the product's own pictures already are:
         the storage host's address for the same file was a second copy of
         it in the gallery, and the variant's picture was never found there. */
      image_url: typeof v.image_url === "string" && v.image_url.trim() ? mediaUrl(v.image_url.trim()) : null,
      available: !productSoldOut && !limited.has(v.id) && !(s?.soldOut ?? false),
      left: s ? s.left : null,
      max_quantity: s ? s.maxQuantity : type === "digital" ? 1 : 99,
      ...(opts.counts && type === "physical" ? { count: s?.count ?? null, tracked: typeof s?.count === "number" } : {}),
      pay_what_you_want: v.pay_what_you_want === true,
      pwyw_min_price_cents: v.pwyw_min_price_cents ?? null,
      pwyw_suggested_price_cents: v.pwyw_suggested_price_cents ?? null,
    }
  })

  const gallery = Array.isArray(row.gallery_urls) ? (row.gallery_urls as unknown[]).filter((u): u is string => typeof u === "string").map((u) => mediaUrl(u)) : []
  const thumbnail = mediaUrl(row.thumbnail_url ?? "") ?? ""
  const images = uniqueImages([thumbnail, ...gallery, ...variants.map((v) => v.image_url)])

  return {
    id: row.id,
    title: row.title ?? "",
    slug: row.slug ?? "",
    type,
    description: row.description ?? "",
    description_html: descriptionHtml(row.description),
    price_cents: Math.max(0, Number(row.price_cents) || 0),
    compare_at_cents: row.compare_at_cents ?? null,
    thumbnail_url: thumbnail,
    gallery_urls: gallery,
    images,
    whats_included: Array.isArray(row.whats_included) ? (row.whats_included as unknown[]).filter((x): x is string => typeof x === "string") : [],
    files,
    pay_what_you_want: row.pay_what_you_want === true,
    pwyw_min_price_cents: row.pwyw_min_price_cents ?? null,
    pwyw_suggested_price_cents: row.pwyw_suggested_price_cents ?? null,
    options,
    variants,
    /* A product without variants: its own count, when it is counted, and only
       when it is few (or none), as for a variant. Plenty is said as nothing. */
    inventory_left: fewestLeft(
      typeof row.inventory_count === "number" && type !== "physical" && row.inventory_count <= SAY_LEFT_FROM ? Math.max(0, row.inventory_count) : null,
      /* A limited run's copies left, said only under FEW_LEFT (or none: sold out). */
      salesLeft !== null && salesLeft < FEW_LEFT ? salesLeft : null,
    ),
    created_at: row.created_at ?? null,
    category: row.category ?? null,
    low_stock_at: [...stock.values()][0]?.lowAt ?? null,
    faqs: productFaqs(row.faqs),
    details: shownCustomFields(row.custom_fields),
    delivery,
    size_chart: sizeChart,
    /* Personalization (lib/products/personalization): only a product that ships asks. */
    personalization: type === "physical" ? readPersonalization(row.personalization) : [],
  }
}

/** The lower of two "left" counts, either of which may not be said. */
function fewestLeft(a: number | null, b: number | null): number | null {
  if (a === null) return b
  if (b === null) return a
  return Math.min(a, b)
}

/* The product's questions as plain text (lib/products/product-faqs.ts), here for the readers that import them from this file. */
export { productFaqs }
