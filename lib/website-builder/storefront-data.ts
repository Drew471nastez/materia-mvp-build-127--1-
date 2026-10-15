/**
 * ===========================================================================
 *  WHAT A PAGE KNOWS ABOUT ITS OWN SHOP, BUILT ONCE PER DRAW
 * ===========================================================================
 * The engine (lib/storelib-theme) reads the shop's facts and never fetches
 * them. This is where they are put together from what a surface already
 * has in hand: the theme's settings, the page's sections, the creator's
 * public profile, the products, and on a product page the product.
 *
 * Every surface that draws a page calls the same functions here, the
 * published site, the preview link, the cover render, the product page and
 * the builder's canvas, so a placeholder or a menu cannot mean one thing in
 * the editor and another on the live site.
 *
 * PURE. No database, no request. The fetching lives in
 * storefront-data-server.ts, which is server only.
 */
import { cleanCustomFields } from "@/lib/products/custom-fields"
import { productFaqs, productFaqsHtml } from "@/lib/products/product-faqs"
import { cleanMenus, type Menu, type MenuLink } from "@/lib/storelib-theme/values"
import { SOURCE_TARGETS, fillSources, type DynamicContext } from "@/lib/storelib-theme/dynamic"
import { resolveControlType } from "@/lib/storelib-theme/controls/registry"
import type { StorefrontData } from "@/lib/storelib-theme/types"
import { plainText } from "@/lib/storelib-theme/values"
import { sanitizeRichText } from "./sanitize"
import { formatPrice, type ProductCard } from "./shop-products"
import type { SchemaField, SectionInstance, SectionSchema, ThemeSettingsValues } from "./types"
import { imagesOnly } from "@/lib/media/video"

/* ── menus ──────────────────────────────────────────────────────────────── */

/** The handle the header's own links answer to. */
export const MAIN_MENU = "main-menu"

type NavBlock = { id: string; type: string; settings?: Record<string, unknown> }

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")

/** One header link's address, by the same rules the header draws it with. */
export function navHref(settings: Record<string, unknown> | undefined): string {
  const s = settings ?? {}
  const type = str(s.link_type) || "custom"
  const target = str(s.target_id)
  if (type === "product" && target) return `/products/${target}`
  if (type === "page" && target) return `/${target}`
  return str(s.url) || "#"
}

/**
 * The header's nav links as a menu: root links in order, each with the links
 * whose `parent_id` names it. So a section that asks for `main-menu` gets
 * the navigation the creator already built, without a second copy of it to
 * keep in step.
 */
export function menuFromHeader(header: SectionInstance | undefined): Menu | null {
  const blocks = (header?.blocks ?? []).filter((b) => b.type === "nav_link") as NavBlock[]
  if (blocks.length === 0) return null
  const kids = new Map<string, MenuLink[]>()
  for (const b of blocks) {
    const parent = str(b.settings?.parent_id)
    if (!parent) continue
    const title = str(b.settings?.label)
    if (!title) continue
    kids.set(parent, [...(kids.get(parent) ?? []), { title, url: navHref(b.settings) }])
  }
  const links: MenuLink[] = []
  for (const b of blocks) {
    if (str(b.settings?.parent_id)) continue
    const title = str(b.settings?.label)
    if (!title) continue
    const children = kids.get(b.id)
    links.push(children?.length ? { title, url: navHref(b.settings), links: children } : { title, url: navHref(b.settings) })
  }
  return { title: "Main menu", links }
}

/**
 * Every menu a section may name: the ones the creator made in Theme
 * settings › Menus, cleaned, and `main-menu` from the header unless the
 * creator made a menu by that name themselves.
 */
export function siteMenus(theme: ThemeSettingsValues | Record<string, unknown>, sections: SectionInstance[]): Record<string, Menu> {
  const own = cleanMenus((theme as Record<string, unknown>).menus)
  if (!own[MAIN_MENU]) {
    const fromHeader = menuFromHeader(sections.find((s) => s.type === "header"))
    if (fromHeader) return { [MAIN_MENU]: fromHeader, ...own }
  }
  return own
}

/* ── the catalogue a picker may name ────────────────────────────────────── */

/**
 * What every `product_picker` and `product_list` on these sections names,
 * as ids and as addresses, so a surface can fetch the ones it does not
 * already have. Only the settings the schema declares as those types are
 * read: a text box that happens to hold a product's address is not a
 * reference.
 */
export function productReferences(
  sections: SectionInstance[],
  schemaOf: (type: string) => SectionSchema | undefined,
): { ids: string[]; slugs: string[] } {
  const ids = new Set<string>()
  const slugs = new Set<string>()
  const take = (v: unknown) => {
    if (typeof v !== "string") return
    const s = v.trim()
    if (!s) return
    const m = s.match(/^\/products\/([^/?#]+)$/)
    if (m) slugs.add(decodeURIComponent(m[1]))
    else if (/^[0-9a-f-]{8,64}$/i.test(s)) ids.add(s)
  }
  const walk = (fields: SchemaField[] | undefined, settings: Record<string, unknown> | undefined) => {
    for (const f of fields ?? []) {
      const kind = resolveControlType(f.type)
      const v = settings?.[f.id]
      if (kind === "product_picker") take(v)
      else if (kind === "product_list" && Array.isArray(v)) v.forEach(take)
    }
  }
  for (const s of sections) {
    const schema = schemaOf(s.type)
    if (!schema) continue
    walk(schema.fields, s.settings)
    for (const b of s.blocks ?? []) walk(schema.blocks?.find((d) => d.type === b.type)?.fields, b.settings)
  }
  return { ids: [...ids], slugs: [...slugs] }
}

/**
 * What every `community_picker` on these sections names: community ids,
 * once each, lower case. Only settings the schema declares as that type are
 * read, like the product references above. A surface reads these communities
 * on the server (lib/communities/server/blocks.ts communityCardsFor), the
 * creator's own and public ones only.
 */
export function communityReferences(
  sections: SectionInstance[],
  schemaOf: (type: string) => SectionSchema | undefined,
): string[] {
  const ids = new Set<string>()
  const walk = (fields: SchemaField[] | undefined, settings: Record<string, unknown> | undefined) => {
    for (const f of fields ?? []) {
      if (resolveControlType(f.type) !== "community_picker") continue
      const v = settings?.[f.id]
      if (typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim())) ids.add(v.trim().toLowerCase())
    }
  }
  for (const s of sections) {
    const schema = schemaOf(s.type)
    if (!schema) continue
    walk(schema.fields, s.settings)
    for (const b of s.blocks ?? []) walk(schema.blocks?.find((d) => d.type === b.type)?.fields, b.settings)
  }
  return [...ids]
}

/**
 * ===========================================================================
 *  WHETHER A PAGE NEEDS THE CREATOR'S COLLECTIONS
 * ===========================================================================
 * Collections are read on the server, a minute in the cache like the shop,
 * and only for a page that uses them: one with a `collection_picker` or
 * `collection_list` setting, or a section whose template loops over the
 * page's `collections` (the collections page's own section, or one a
 * creator wrote). A page that does neither reads nothing.
 */
/**
 * Whether a page draws Storelib Reviews: a section whose template reads
 * `reviews.` (sections/reviews_*.storelib, or one a creator wrote). Only
 * those pages read the reviews.
 */
export function pageWantsReviews(sections: SectionInstance[], sourceOf: (type: string) => string | undefined): boolean {
  return sections.some((s) => !s.hidden && /\breviews\.(?:all|product|enabled|sample|star_color)\b/.test(sourceOf(s.type) ?? ""))
}

export function pageWantsCollections(
  sections: SectionInstance[],
  schemaOf: (type: string) => SectionSchema | undefined,
  sourceOf: (type: string) => string | undefined = () => undefined,
): boolean {
  for (const s of sections) {
    const source = sourceOf(s.type)
    if (source && /\bin\s+collections\b|\bcollections\.size\b/.test(source)) return true
    const schema = schemaOf(s.type)
    if (!schema) continue
    const named = (fields: SchemaField[] | undefined) =>
      (fields ?? []).some((f) => {
        const kind = resolveControlType(f.type)
        return kind === "collection_picker" || kind === "collection_list"
      })
    if (named(schema.fields)) return true
    if ((s.blocks ?? []).some((b) => named(schema.blocks?.find((d) => d.type === b.type)?.fields))) return true
  }
  return false
}

/** The shop's newest products and any picked ones it did not include, once each. */
export function mergeCatalog(...lists: (ProductCard[] | undefined)[]): ProductCard[] {
  const seen = new Set<string>()
  const out: ProductCard[] = []
  for (const list of lists) {
    for (const card of list ?? []) {
      if (!card || seen.has(card.id)) continue
      seen.add(card.id)
      out.push(card)
    }
  }
  return out
}

/** Which references a catalogue does not answer yet. */
export function missingReferences(refs: { ids: string[]; slugs: string[] }, catalog: ProductCard[]): { ids: string[]; slugs: string[] } {
  const haveIds = new Set(catalog.map((c) => c.id))
  const haveSlugs = new Set(catalog.map((c) => c.settings.url.replace(/^\/products\//, "")))
  return { ids: refs.ids.filter((i) => !haveIds.has(i)), slugs: refs.slugs.filter((s) => !haveSlugs.has(s)) }
}

/* ── the product a product page is about ────────────────────────────────── */

export interface ProductRowLike {
  id: string
  title?: string | null
  slug?: string | null
  description?: string | null
  price_cents?: number | null
  compare_at_cents?: number | null
  thumbnail_url?: string | null
  gallery_urls?: string[] | null
  whats_included?: string[] | null
  custom_fields?: unknown
  /** The product editor's FAQ card (lib/products/product-faqs.ts). */
  faqs?: unknown
}

/**
 * A product as a section reads it. The description is stored as rich text,
 * so it goes out twice: as words, and as markup cleaned against the same
 * allow list a rich text setting is, which is the promise `raw` rests on.
 */
export function productFacts(row: ProductRowLike | null | undefined, currency?: string): NonNullable<StorefrontData["product"]> | null {
  if (!row) return null
  const images = imagesOnly([row.thumbnail_url, ...(row.gallery_urls ?? [])]).filter((u): u is string => typeof u === "string" && /^(https?:\/\/|\/(?![/\\]))/.test(u))
  const unique = [...new Set(images)]
  const html = sanitizeRichText(row.description ?? "")
  /* In the store's own currency (lib/store/selling-currency), the one the price is in. */
  const price = formatPrice(row.price_cents, currency)
  const was = formatPrice(row.compare_at_cents, currency)
  return {
    id: row.id,
    title: row.title ?? "",
    price,
    compare_price: was && (row.compare_at_cents ?? 0) > (row.price_cents ?? 0) ? was : "",
    description: plainText(html),
    description_html: html,
    image: unique[0] ?? "",
    images: unique,
    url: row.slug ? `/products/${row.slug}` : "",
    includes: (row.whats_included ?? []).filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()),
    /* Its custom fields by name, plain words: {{ product.fields.material }} (lib/products/custom-fields.ts). */
    fields: cleanCustomFields(row.custom_fields),
    /* Its own questions: `product.faqs` in a template, and the "Product FAQ" source as rich text. */
    ...(() => {
      const faqs = productFaqs(row.faqs)
      return { faqs, faqs_html: productFaqsHtml(faqs) }
    })(),
  }
}

/* ── dynamic sources ────────────────────────────────────────────────────── */

export interface CreatorFacts {
  name?: string
  /** Settings › Store details' store name, the name receipts and checkout already sign with; empty when none is saved. */
  storeName?: string
  headline?: string
  bio?: string
  avatar?: string
}

/**
 * The context placeholders are filled from. Published values only, and
 * public ones: a creator's name, headline, bio and photo are what their own
 * Storelib page already shows anybody.
 */
export function dynamicContext(input: {
  theme: ThemeSettingsValues | Record<string, unknown>
  creator?: CreatorFacts | null
  siteUrl?: string | null
  productCount?: number | null
  product?: StorefrontData["product"]
  pageTitle?: string
  template?: string
  now?: Date
}): DynamicContext {
  const t = input.theme as Record<string, unknown>
  const brand = str(t.brand_name)
  const social = (id: string) => str(t[`social_${id}`]) || undefined
  return {
    shop: {
      /* The website's own brand name, else the store's name from Store details, else the person's. */
      name: brand || input.creator?.storeName || input.creator?.name || "",
      description: str(t.seo_description),
      url: input.siteUrl ?? "",
      product_count: typeof input.productCount === "number" ? input.productCount : undefined,
      /* Theme settings › Brand information. */
      brand_headline: str(t.brand_headline),
      brand_description: str(t.brand_description),
      brand_image: str(t.brand_image),
    },
    creator: {
      name: input.creator?.name ?? "",
      headline: input.creator?.headline ?? "",
      bio: input.creator?.bio ?? "",
      avatar: input.creator?.avatar ?? "",
    },
    product: input.product ?? null,
    page: { title: input.pageTitle ?? "", template: input.template },
    social: { instagram: social("instagram"), tiktok: social("tiktok"), youtube: social("youtube"), twitter: social("twitter") },
    date: { year: (input.now ?? new Date()).getUTCFullYear() },
  }
}

/** The shop's facts as a section's `shop`, `creator` and `product` roots read them. */
export function storefrontData(input: {
  dynamic: DynamicContext
  catalog?: ProductCard[]
  menus?: Record<string, Menu>
  /** The creator's communities a `community_picker` may name, read on the server; absent means none. */
  communities?: StorefrontData["communities"]
  /** The creator's published collections, read on the server; absent means none. */
  collections?: StorefrontData["collections"]
  /** Storelib Reviews for the page (lib/reviews/storefront.ts); absent means none. */
  reviews?: StorefrontData["reviews"]
  /** The shop's own words in the page's language (lib/markets/ui-words.ts); absent, English. */
  words?: StorefrontData["words"]
}): StorefrontData {
  return {
    catalog: input.catalog,
    menus: input.menus,
    ...(input.communities ? { communities: input.communities } : {}),
    ...(input.collections ? { collections: input.collections } : {}),
    ...(input.reviews ? { reviews: input.reviews } : {}),
    ...(input.words && Object.keys(input.words).length ? { words: input.words } : {}),
    shop: input.dynamic.shop,
    creator: input.dynamic.creator,
    product: input.dynamic.product ?? null,
  }
}

/**
 * ===========================================================================
 *  EVERY PLACEHOLDER ON A PAGE, FILLED IN
 * ===========================================================================
 * Before a page is drawn, each setting that holds a placeholder is given its
 * value, by the setting's own type, so the heading gets words and the rich
 * text gets escaped words (lib/storelib-theme/dynamic.ts). Both families of
 * section are handled here, the `.storelib` ones and the platform's own
 * React ones, because both read `section.settings` and neither should ever
 * see a placeholder.
 *
 * NEVER STORED. This runs on the way to the page. What is saved keeps the
 * placeholder, which is the whole point: the value follows the shop.
 *
 * The same objects come back when nothing changed, so the canvas, which
 * compares sections by identity, does not redraw a section that has no
 * placeholder in it.
 */
export function withDynamicSources(
  sections: SectionInstance[],
  schemaOf: (type: string) => SectionSchema | undefined,
  ctx: DynamicContext,
): SectionInstance[] {
  let touched = false
  const out = sections.map((s) => {
    const next = sectionWithSources(s, schemaOf(s.type), ctx)
    if (next !== s) touched = true
    return next
  })
  return touched ? out : sections
}

function fillSettings(
  settings: Record<string, unknown> | undefined,
  fields: SchemaField[] | undefined,
  ctx: DynamicContext,
): Record<string, unknown> | undefined {
  if (!settings || !fields?.length) return settings
  let out: Record<string, unknown> | undefined
  for (const f of fields) {
    const v = settings[f.id]
    if (typeof v !== "string" || !v.includes("{{")) continue
    const type = resolveControlType(f.type) ?? f.type
    if (!SOURCE_TARGETS[type] && !SOURCE_TARGETS[f.type]) continue
    const filled = fillSources(v, SOURCE_TARGETS[type] ? type : f.type, ctx)
    if (filled === v) continue
    out ??= { ...settings }
    /* A number source that has no value here is left unset, so the default draws. */
    if (typeof filled === "number" && !Number.isFinite(filled)) delete out[f.id]
    else out[f.id] = filled
  }
  return out ?? settings
}

export function sectionWithSources(section: SectionInstance, schema: SectionSchema | undefined, ctx: DynamicContext): SectionInstance {
  if (!schema) return section
  const settings = fillSettings(section.settings, schema.fields, ctx)
  let blocks = section.blocks
  if (blocks?.length && schema.blocks?.length) {
    let changed = false
    const next = blocks.map((b) => {
      const s = fillSettings(b.settings, schema.blocks?.find((d) => d.type === b.type)?.fields, ctx)
      if (s === b.settings) return b
      changed = true
      return { ...b, settings: s ?? {} }
    })
    if (changed) blocks = next
  }
  if (settings === section.settings && blocks === section.blocks) return section
  return { ...section, settings: settings ?? {}, ...(blocks ? { blocks } : {}) }
}
