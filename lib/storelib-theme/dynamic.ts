/**
 * ===========================================================================
 *  DYNAMIC SOURCES: A SETTING THAT READS THE SHOP INSTEAD OF A TYPED VALUE
 * ===========================================================================
 * A heading that says the product's name, a picture that is the creator's
 * photo, a footer that says the year. Typed by hand, each of those is wrong
 * the day the product is renamed, the photo changes or the year turns. So a
 * text setting may hold a placeholder, `{{ product.title }}`, and the page
 * fills it in when it is drawn, on the server, from the creator's own data.
 *
 * It is the same idea as a Shopify dynamic source, written the same way,
 * and deliberately smaller:
 *
 *   A CLOSED LIST. The names below are the only ones that mean anything.
 *   `{{ product.title }}` is filled in; `{{ product.cost_price }}` is not a
 *   source, so it is left exactly as typed. Nothing here walks an object by
 *   a path somebody wrote, so a placeholder cannot reach anything that was
 *   not put on this list on purpose.
 *
 *   NOT THE TEMPLATE LANGUAGE. A placeholder is a name and nothing else: no
 *   filters, no conditions, no loops. It is replaced before the section is
 *   drawn, and the result is a plain value like any other, so a section
 *   printing `{{ settings.heading }}` escapes it exactly as it escapes a
 *   heading somebody typed.
 *
 *   ESCAPED FOR WHERE IT LANDS. A text setting receives the words. A rich
 *   text setting is printed as markup, so a text source is HTML-escaped on
 *   the way in and the one markup source (a product's description) arrives
 *   already cleaned against the rich text allow list. A link setting takes a
 *   source only as its whole value, and only one that is an address, and
 *   the address is checked. A picture setting likewise, and only a picture.
 *
 * The engine is pure and knows nothing about where the values come from:
 * lib/website-builder/dynamic-sources.ts builds the context from the
 * creator's rows, cleaned, and hands it here.
 */
import { decodeEntities, plainText, safeHref, safeMediaUrl, sanitizeInlineHtml } from "./values"

/** What a source's value is. */
export type SourceKind = "text" | "html" | "image" | "url" | "number"

/** What a setting does with a value, which decides how a source is escaped into it. */
export type SourceTarget = "text" | "html" | "inline" | "url" | "image" | "number"

export interface DynamicSource {
  /** The placeholder's name: `{{ product.title }}` is `product.title`. */
  id: string
  /** What the editor calls it. */
  label: string
  group: "Shop" | "Creator" | "Product" | "Page" | "Social" | "Date"
  kind: SourceKind
  /**
   * The pages where it has a value, as `page.template` names them. Absent
   * means every page. A product source on the home page is empty, and the
   * editor does not offer it there.
   */
  templates?: readonly string[]
  /** One sentence, for the editor and the docs. */
  description: string
  /** Offered only on an imported theme's settings, where the theme's own Liquid objects fill it (COMPAT_SOURCE_EXPR). */
  compatOnly?: boolean
}

const PRODUCT_ONLY = ["product"] as const

export const DYNAMIC_SOURCES: readonly DynamicSource[] = [
  { id: "shop.name", label: "Shop name", group: "Shop", kind: "text", description: "The store's name from Branding, or the creator's name when there is none." },
  { id: "shop.description", label: "Shop description", group: "Shop", kind: "text", description: "The site's description from SEO." },
  { id: "shop.url", label: "Shop address", group: "Shop", kind: "url", description: "The site's own address, such as https://drew.storelib.com." },
  { id: "shop.product_count", label: "Number of products", group: "Shop", kind: "number", description: "How many products the shop has published." },
  { id: "shop.brand_headline", label: "Brand headline", group: "Shop", kind: "text", description: "The headline from Theme settings › Brand information." },
  { id: "shop.brand_description", label: "Brand description", group: "Shop", kind: "text", description: "The description from Theme settings › Brand information." },
  { id: "shop.brand_image", label: "Brand image", group: "Shop", kind: "image", description: "The image from Theme settings › Brand information." },
  { id: "creator.name", label: "Creator name", group: "Creator", kind: "text", description: "The creator's public name." },
  { id: "creator.headline", label: "Creator headline", group: "Creator", kind: "text", description: "The one line under the creator's name on their Storelib page." },
  { id: "creator.bio", label: "Creator bio", group: "Creator", kind: "text", description: "The creator's bio." },
  { id: "creator.avatar", label: "Creator photo", group: "Creator", kind: "image", description: "The creator's profile photo." },
  { id: "product.title", label: "Product title", group: "Product", kind: "text", templates: PRODUCT_ONLY, description: "The name of the product the page is showing." },
  { id: "product.price", label: "Product price", group: "Product", kind: "text", templates: PRODUCT_ONLY, description: "Its price, formatted, such as $48.00." },
  { id: "product.compare_price", label: "Product price before sale", group: "Product", kind: "text", templates: PRODUCT_ONLY, description: "The price it had before a sale, or nothing." },
  { id: "product.description", label: "Product description", group: "Product", kind: "html", templates: PRODUCT_ONLY, description: "Its description. Formatted in a rich text setting, words only anywhere else." },
  { id: "product.image", label: "Product image", group: "Product", kind: "image", templates: PRODUCT_ONLY, description: "Its first picture." },
  { id: "product.faqs", label: "Product FAQ", group: "Product", kind: "html", templates: PRODUCT_ONLY, description: "Its questions and answers from the FAQ in the product editor. Formatted in a rich text setting, words only anywhere else." },
  { id: "product.url", label: "Product address", group: "Product", kind: "url", templates: PRODUCT_ONLY, description: "Its page on this site, /products/<slug>." },
  { id: "page.title", label: "Page title", group: "Page", kind: "text", description: "The name of the page, such as About or Refund Policy." },
  { id: "social.instagram", label: "Instagram", group: "Social", kind: "url", description: "The Instagram address from Social links." },
  { id: "social.tiktok", label: "TikTok", group: "Social", kind: "url", description: "The TikTok address from Social links." },
  { id: "social.youtube", label: "YouTube", group: "Social", kind: "url", description: "The YouTube address from Social links." },
  { id: "social.twitter", label: "X", group: "Social", kind: "url", description: "The X address from Social links." },
  { id: "date.year", label: "This year", group: "Date", kind: "number", description: "The current year, for a footer's copyright line." },
]

/**
 * ===========================================================================
 *  THE SAME SOURCES ON AN IMPORTED SHOPIFY THEME
 * ===========================================================================
 * An imported theme's setting is drawn by the compatible engine
 * (lib/storelib-theme/compat), which reads a placeholder as a Liquid
 * expression in the section's own scope: `{{ product.title }}`,
 * `{{ closest.product.metafields.custom.material }}`, `{{ shop.name }}`,
 * and every Shopify-style dynamic source a theme's templates already hold.
 * The pills the editor writes are Storelib's names; most are the theme's
 * own objects by the same name, and the few that are not read the theme's
 * object here. A source with no entry (the creator's bio, a social link) is
 * not offered on an imported theme, because its page has no such object.
 */
export const COMPAT_SOURCE_EXPR: Readonly<Record<string, string>> = {
  "shop.name": "shop.name",
  "shop.description": "shop.description",
  "shop.url": "shop.url",
  "shop.product_count": "collections.all.products_count",
  "product.title": "product.title",
  "product.price": "product.price | money",
  "product.compare_price": "product.compare_at_price | money",
  "product.description": "product.description",
  "product.image": "product.featured_image | image_url",
  "product.url": "product.url",
  "page.title": "page_title",
  "date.year": "'now' | date: '%Y'",
  "product.rating": "product.metafields.reviews.rating.value.rating",
  "product.rating_count": "product.metafields.reviews.rating_count.value",
  "product.size_chart": "product.metafields.storelib.size_chart",
}

/** Sources only an imported theme offers: the review metafields and the size chart every product drop carries there. */
export const COMPAT_ONLY_SOURCES: readonly DynamicSource[] = [
  { id: "product.rating", label: "Product rating", group: "Product", kind: "number", templates: PRODUCT_ONLY, compatOnly: true, description: "The average of its published reviews, such as 4.6 (product.metafields.reviews.rating)." },
  { id: "product.rating_count", label: "Number of reviews", group: "Product", kind: "number", templates: PRODUCT_ONLY, compatOnly: true, description: "How many published reviews it has (product.metafields.reviews.rating_count)." },
  { id: "product.size_chart", label: "Size chart name", group: "Product", kind: "text", templates: PRODUCT_ONLY, compatOnly: true, description: "The name of the size chart it uses (product.metafields.storelib.size_chart)." },
]

/** Sources whose value is markup already cleaned, never escaped on the way into a rich text setting. */
export const COMPAT_HTML_EXPRS: readonly string[] = ["product.description", "collection.description", "page.content", "article.content", "blog.description"]

const BY_ID = new Map([...DYNAMIC_SOURCES, ...COMPAT_ONLY_SOURCES].map((s) => [s.id, s]))

export function dynamicSource(id: string): DynamicSource | undefined {
  return BY_ID.get(id)
}

/**
 * What the page knows. Every field is optional: a surface that has no
 * product (the home page, the export, a test) leaves `product` out and a
 * product placeholder there comes out empty.
 */
export interface DynamicContext {
  shop?: { name?: string; description?: string; url?: string; product_count?: number; brand_headline?: string; brand_description?: string; brand_image?: string }
  creator?: { name?: string; headline?: string; bio?: string; avatar?: string }
  product?: {
    title?: string
    price?: string
    compare_price?: string
    /** Plain text. */
    description?: string
    /** Already cleaned against the rich text allow list by whoever built the context. */
    description_html?: string
    image?: string
    url?: string
    /** The product's questions as rich text, every word already escaped (lib/products/product-faqs.ts). */
    faqs_html?: string
  } | null
  page?: { title?: string; template?: string }
  social?: Partial<Record<"instagram" | "tiktok" | "youtube" | "twitter", string>>
  date?: { year?: number }
}

/** The value of one source, raw, or undefined when the page has none. */
function valueOf(id: string, ctx: DynamicContext): unknown {
  switch (id) {
    case "shop.name": return ctx.shop?.name
    case "shop.description": return ctx.shop?.description
    case "shop.url": return ctx.shop?.url
    case "shop.product_count": return ctx.shop?.product_count
    case "shop.brand_headline": return ctx.shop?.brand_headline
    case "shop.brand_description": return ctx.shop?.brand_description
    case "shop.brand_image": return ctx.shop?.brand_image
    case "creator.name": return ctx.creator?.name
    case "creator.headline": return ctx.creator?.headline
    case "creator.bio": return ctx.creator?.bio
    case "creator.avatar": return ctx.creator?.avatar
    case "product.title": return ctx.product?.title
    case "product.price": return ctx.product?.price
    case "product.compare_price": return ctx.product?.compare_price
    case "product.description": {
      /* Markup only when whoever built the context says it was cleaned;
         plain words otherwise, escaped so they read as markup safely. */
      if (typeof ctx.product?.description_html === "string") return ctx.product.description_html
      return typeof ctx.product?.description === "string" ? escapeHtml(ctx.product.description) : undefined
    }
    case "product.image": return ctx.product?.image
    case "product.url": return ctx.product?.url
    case "product.faqs": return ctx.product?.faqs_html || undefined
    case "page.title": return ctx.page?.title
    case "social.instagram": return ctx.social?.instagram
    case "social.tiktok": return ctx.social?.tiktok
    case "social.youtube": return ctx.social?.youtube
    case "social.twitter": return ctx.social?.twitter
    case "date.year": return ctx.date?.year
  }
  return undefined
}

/**
 * `{{ product.title }}`, with or without the inner spaces. A name is two or
 * three lowercase words joined by dots, which is the shape of every source
 * and of nothing a person types by accident.
 */
const PLACEHOLDER = /\{\{\s*([a-z_]+(?:\.[a-z_]+){1,2})\s*\}\}/g
const WHOLE = /^\s*\{\{\s*([a-z_]+(?:\.[a-z_]+){1,2})\s*\}\}\s*$/

/** The sources a value names, known ones only, in order. */
export function sourcesIn(value: unknown): string[] {
  if (typeof value !== "string" || !value.includes("{{")) return []
  const out: string[] = []
  for (const m of value.matchAll(PLACEHOLDER)) if (BY_ID.has(m[1]) && !out.includes(m[1])) out.push(m[1])
  return out
}

/** The one source a value consists of, or null when it is anything else. */
export function wholeSource(value: unknown): string | null {
  if (typeof value !== "string") return null
  const m = value.match(WHOLE)
  return m && BY_ID.has(m[1]) ? m[1] : null
}

/** The placeholder for a source, as the editor writes it. */
export function placeholderFor(id: string): string {
  return `{{ ${id} }}`
}

/**
 * Which setting types take a source, and how. A control that is not here
 * holds no placeholders at all: a colour, a scheme, a select.
 */
export const SOURCE_TARGETS: Record<string, SourceTarget> = {
  text: "text",
  textarea: "text",
  richtext: "html",
  html: "html",
  inline_richtext: "inline",
  url: "url",
  link: "url",
  image_picker: "image",
  image: "image",
  number: "number",
  range: "number",
}

/** Which kinds of source a target accepts. Text reads anything as words. */
const ACCEPTS: Record<SourceTarget, readonly SourceKind[]> = {
  text: ["text", "html", "number", "url"],
  html: ["text", "html", "number", "url"],
  inline: ["text", "html", "number", "url"],
  url: ["url"],
  image: ["image"],
  number: ["number"],
}

/** Whether a target takes a placeholder among other words, or only as its whole value. */
export function targetIsWhole(target: SourceTarget): boolean {
  return target === "url" || target === "image" || target === "number"
}

/**
 * The sources an editor may offer for a setting of this type on this page.
 * `compat`: an imported theme's setting, which offers what its Liquid
 * objects can fill (COMPAT_SOURCE_EXPR), the review and size chart sources
 * among them.
 */
export function sourcesFor(controlType: string, template?: string, opts: { compat?: boolean } = {}): DynamicSource[] {
  const target = SOURCE_TARGETS[controlType]
  if (!target) return []
  const kinds = ACCEPTS[target]
  const list = opts.compat ? [...DYNAMIC_SOURCES, ...COMPAT_ONLY_SOURCES].filter((s) => COMPAT_SOURCE_EXPR[s.id] !== undefined) : DYNAMIC_SOURCES
  return list.filter((s) => kinds.includes(s.kind) && (!s.templates || (template !== undefined && s.templates.includes(template))))
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
}

/** One source's value, made fit for a place it is going. */
function fit(source: DynamicSource, raw: unknown, target: SourceTarget): string | number {
  if (raw === undefined || raw === null) return target === "number" ? NaN : ""
  switch (target) {
    case "number": {
      const n = typeof raw === "number" ? raw : Number(raw)
      return Number.isFinite(n) ? n : NaN
    }
    case "url":
      return source.kind === "url" ? safeHref(String(raw)) : ""
    case "image":
      return source.kind === "image" ? safeMediaUrl(String(raw)) : ""
    case "text":
      /* Markup read as words: a description in a heading says what it says. */
      return source.kind === "html" ? plainText(String(raw)) : String(raw)
    case "html":
      /*
        The one markup source was cleaned against the rich text allow list
        when the context was built (lib/website-builder/dynamic-sources.ts),
        which is the same list a rich text setting is cleaned against on
        save. Everything else is words, and words are escaped.
      */
      return source.kind === "html" ? String(raw) : escapeHtml(String(raw))
    case "inline":
      return source.kind === "html" ? sanitizeInlineHtml(String(raw)) : escapeHtml(String(raw))
  }
}

/**
 * A stored value with its placeholders filled in, for a setting of the
 * given control type. A value with no placeholder comes back as it was, the
 * same string, so the common case allocates nothing.
 *
 * Whole-value targets (a link, a picture, a number) take a source only as
 * the entire value; `/products/{{ product.title }}` in a link is left alone
 * and then refused as an address like any other text.
 *
 * A source that has no value here (a product on the home page) fills in as
 * nothing, or as NaN for a number, which the resolver then treats as unset.
 */
export function fillSources(value: unknown, controlType: string, ctx: DynamicContext): unknown {
  if (typeof value !== "string" || !value.includes("{{")) return value
  const target = SOURCE_TARGETS[controlType]
  if (!target) return value
  if (targetIsWhole(target)) {
    const id = wholeSource(value)
    if (!id) return value
    const source = BY_ID.get(id)!
    if (!ACCEPTS[target].includes(source.kind)) return value
    return fit(source, valueOf(id, ctx), target)
  }
  let changed = false
  const out = value.replace(PLACEHOLDER, (whole, id: string) => {
    const source = BY_ID.get(id)
    if (!source || !ACCEPTS[target].includes(source.kind)) return whole
    changed = true
    const v = fit(source, valueOf(id, ctx), target)
    return typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : v
  })
  return changed ? out : value
}

/** What a placeholder reads as in the editor's field: "Product title". Plain text. */
export function describePlaceholders(value: unknown): string {
  if (typeof value !== "string") return ""
  return decodeEntities(value.replace(PLACEHOLDER, (whole, id: string) => BY_ID.get(id)?.label ?? whole))
}

/** One run of a value as the editor reads it back: words, or a source by its name. */
export type PlaceholderPart = { text: string } | { source: string; label: string }

/**
 * A value cut into the words around its placeholders and the sources they
 * name, so the editor can print "Get [Product title] today" with the name
 * set apart instead of the braces. A placeholder that is not a source stays
 * in the words exactly as typed. Markup is read as words.
 */
export function placeholderParts(value: unknown): PlaceholderPart[] {
  if (typeof value !== "string" || value === "") return []
  /* plainText trims, and the space between "By" and a name is part of the reading. */
  const words = (s: string) => {
    if (!s.includes("<")) return decodeEntities(s)
    const bare = s.replace(/^(?:<[^>]*>)+|(?:<[^>]*>)+$/g, "")
    const inner = plainText(s)
    if (!inner) return /\s/.test(bare) ? " " : ""
    return `${/^\s/.test(bare) ? " " : ""}${inner}${/\s$/.test(bare) ? " " : ""}`
  }
  const out: PlaceholderPart[] = []
  let last = 0
  for (const m of value.matchAll(PLACEHOLDER)) {
    const source = BY_ID.get(m[1])
    if (!source) continue
    const at = m.index ?? 0
    const before = words(value.slice(last, at))
    if (before) out.push({ text: before })
    out.push({ source: source.id, label: source.label })
    last = at + m[0].length
  }
  const rest = words(value.slice(last))
  if (rest) out.push({ text: rest })
  return out
}

/**
 * Where a placeholder goes into a text setting: at the caret when the
 * editor knows one, at the end otherwise, with a space on whichever side
 * would run into a word. Returns the caret after it too, so a second
 * insert lands after the first rather than before it.
 */
export function insertPlaceholder(text: string, id: string, at?: number | null): { value: string; caret: number } {
  const token = placeholderFor(id)
  const pos = typeof at === "number" && at >= 0 && at <= text.length ? at : text.length
  const before = text.slice(0, pos)
  const after = text.slice(pos)
  const lead = before === "" || /\s$/.test(before) ? "" : " "
  const trail = after === "" || /^\s/.test(after) ? "" : " "
  return { value: `${before}${lead}${token}${trail}${after}`, caret: before.length + lead.length + token.length + trail.length }
}
