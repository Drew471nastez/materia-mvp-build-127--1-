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
import { cleanMenus, type Menu, type MenuLink } from "@/lib/storelib-theme/values"
import { SOURCE_TARGETS, fillSources, type DynamicContext } from "@/lib/storelib-theme/dynamic"
import { resolveControlType } from "@/lib/storelib-theme/controls/registry"
import type { StorefrontData } from "@/lib/storelib-theme/types"
import { plainText } from "@/lib/storelib-theme/values"
import { sanitizeRichText } from "./sanitize"
import { formatPrice, type ProductCard } from "./shop-products"
import type { SchemaField, SectionInstance, SectionSchema, ThemeSettingsValues } from "./types"

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
}

/**
 * A product as a section reads it. The description is stored as rich text,
 * so it goes out twice: as words, and as markup cleaned against the same
 * allow list a rich text setting is, which is the promise `raw` rests on.
 */
export function productFacts(row: ProductRowLike | null | undefined): NonNullable<StorefrontData["product"]> | null {
  if (!row) return null
  const images = [row.thumbnail_url, ...(row.gallery_urls ?? [])].filter((u): u is string => typeof u === "string" && /^(https?:\/\/|\/(?![/\\]))/.test(u))
  const unique = [...new Set(images)]
  const html = sanitizeRichText(row.description ?? "")
  const price = formatPrice(row.price_cents)
  const was = formatPrice(row.compare_at_cents)
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
  }
}

/* ── dynamic sources ────────────────────────────────────────────────────── */

export interface CreatorFacts {
  name?: string
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
      name: brand || input.creator?.name || "",
      description: str(t.seo_description),
      url: input.siteUrl ?? "",
      product_count: typeof input.productCount === "number" ? input.productCount : undefined,
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
}): StorefrontData {
  return {
    catalog: input.catalog,
    menus: input.menus,
    ...(input.communities ? { communities: input.communities } : {}),
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
