/**
 * ===========================================================================
 *  SHOPIFY'S OBJECTS, MADE FROM STORELIB'S DATA
 * ===========================================================================
 * A theme imported from Shopify reads `product.price`, `collection.products`,
 * `cart.item_count`, `settings.type_header_font.family`,
 * `section.settings.color_scheme.settings.background` and a few hundred
 * more. Each is built here from what Storelib already holds: the creator's
 * products, collections, menus, the theme's settings, the visitor's cart.
 * Nothing here talks to Shopify; a value Storelib does not have (a vendor, a
 * metafield, a blog) is there and empty, so a theme's `{% if %}` around it
 * reads false instead of printing an error.
 *
 * Money is in cents, as Shopify themes expect (`{{ product.price | money }}`).
 */
import { readPersonalization, themeFieldObjects } from "@/lib/products/personalization"
import { OUTPUT, LFloat } from "./runtime"
import { handleize, parseColor, toHex } from "./filters"
import { shopifyAddress } from "./links"
import { FLAG_SVG_OPEN } from "./first-load"
import { sanitizeRichText } from "@/lib/website-builder/sanitize"
import { withoutNewTab } from "@/lib/website-builder/new-tab"
import { isColorOption, swatchColor } from "@/lib/products/product-page-model"
import { currencyWord } from "@/lib/markets/money"
import { isVideoUrl, videoDuration, videoMime, videoPosterUrl } from "@/lib/media/video"
import { readSizeChart, sizeChartJson, type SizeChart } from "@/lib/size-charts/model"
import { sizeChartTableHtml } from "@/lib/size-charts/html"
import { COMPAT_HTML_EXPRS, COMPAT_SOURCE_EXPR } from "@/lib/storelib-theme/dynamic"
import { safeHref } from "@/lib/storelib-theme/values"
import { OFFERED_FAMILIES } from "@/lib/website-builder/font-link"

type O = Record<string, unknown>

// ── Money ────────────────────────────────────────────────────────────────────

/** "$48.00" as 4800; "" and free as 0. */
export function priceCents(formatted: unknown): number {
  if (typeof formatted === "number") return Math.round(formatted)
  const s = String(formatted ?? "").replace(/[^0-9.,-]/g, "")
  if (!s) return 0
  const n = Number(s.replace(/,(?=\d{3}(\D|$))/g, "").replace(",", "."))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

// ── Images and media ─────────────────────────────────────────────────────────

let imageSeq = 1
/** A picture, as Shopify's image object: prints as its address. */
export function imageObject(src: string, alt = "", extra: O = {}): O | null {
  if (!src) return null
  const width = typeof extra.width === "number" ? extra.width : 1600
  const height = typeof extra.height === "number" ? extra.height : 1600
  const img: O = {
    [OUTPUT]: src,
    id: extra.id ?? imageSeq++,
    src,
    url: src,
    alt,
    width,
    height,
    aspect_ratio: new LFloat(Math.round((width / height) * 1000) / 1000),
    media_type: "image",
    position: extra.position ?? 1,
    presentation: { focal_point: { x: 50, y: 50, [OUTPUT]: "50.0% 50.0%" } },
    attached_to_variant: false,
    variants: [],
  }
  img.preview_image = img
  return img
}

/**
 * A video uploaded to the product, as Shopify's video media: `media_type`
 * "video", its file in `sources` (what `video_tag`, `media_tag` and a theme's
 * own <video> read), its first frame as `preview_image` (or the product's
 * first photo when it has none stored, so a theme's thumbnail is never empty).
 */
function videoMedia(src: string, alt: string, position: number, fallbackPreview: string): O {
  const poster = videoPosterUrl(src) ?? fallbackPreview
  const preview = poster ? imageObject(poster, alt, { position, id: 2000 + position }) : null
  const seconds = videoDuration(src)
  const mime = videoMime(src)
  return {
    [OUTPUT]: src,
    id: 1000 + position - 1,
    media_type: "video",
    position,
    alt,
    src,
    preview_image: preview,
    aspect_ratio: new LFloat(1.778),
    duration: seconds === null ? null : seconds * 1000,
    sources: [{ url: src, mime_type: mime, format: mime.split("/")[1] === "quicktime" ? "mov" : mime.split("/")[1], width: 1280, height: 720 }],
    presentation: { focal_point: { x: 50, y: 50, [OUTPUT]: "50.0% 50.0%" } },
    attached_to_variant: false,
    variants: [],
  }
}

/** The same picture under two addresses that differ only in a query string or the host's case. */
function sameImage(a: string, b: string): boolean {
  const key = (u: string) => {
    const cut = u.trim().split(/[?#]/)[0]
    const m = cut.match(/^(https?:\/\/)([^/]+)(.*)$/i)
    return m ? `${m[1].toLowerCase()}${m[2].toLowerCase()}${m[3]}` : cut
  }
  return key(a) === key(b)
}

/** Every picture (and uploaded video) of a product, as `product.media`. */
function mediaList(images: string[], alt: string): O[] {
  const firstPhoto = images.find((u) => u && !isVideoUrl(u)) ?? ""
  return images.filter(Boolean).map((src, i) => (isVideoUrl(src) ? videoMedia(src, alt, i + 1, firstPhoto) : (imageObject(src, alt, { position: i + 1, id: 1000 + i }) as O)))
}

// ── Products ─────────────────────────────────────────────────────────────────

/** A Storelib product card or product page, block-shaped (`{ id, settings }`). */
export interface CardLike {
  id: string
  settings: Record<string, unknown>
}

/** How the options of a variant read: "Small / Red" is Size Small, Colour Red. */
function variantOptions(name: string, optionCount: number): string[] {
  /* One option: the whole name is its value ("PDF / EPUB bundle" is one licence, not "PDF"). */
  if (optionCount <= 1) return [name.trim() || "Default Title"]
  const parts = name.split(/\s*\/\s*/).map((p) => p.trim())
  return Array.from({ length: Math.max(1, optionCount) }, (_, i) => parts[i] ?? parts[0] ?? "Default Title")
}

/** Storelib's pickup points for an option as Shopify's `variant.store_availabilities`. */
function storeAvailabilities(points: unknown): O[] {
  if (!Array.isArray(points)) return []
  return points.filter((p): p is O => !!p && typeof p === "object" && typeof (p as O).name === "string").slice(0, 10).map((p) => {
    const city = typeof p.city === "string" ? p.city : ""
    return {
      available: true,
      pick_up_enabled: true,
      pick_up_time: String(p.ready ?? ""),
      location: { [OUTPUT]: String(p.name), name: String(p.name), address: { city, summary: city, address1: "", country: "", province: "", zip: "" } },
    }
  })
}

/**
 * What a theme is told about one variant's stock, from what Storelib's
 * loader put on it (./product-facts.ts withPageFacts):
 * whether it sells, how many are left when that is at or under the store's
 * low stock line (Settings), the most one order may take, and whether it
 * keeps selling when none are left. As Shopify answers it:
 *
 *   sold out              inventory_management "shopify", quantity 0
 *   few left              "shopify", the number, so "Only 3 left" shows
 *   counted, Show stock   "shopify", the real number (Round BC): the
 *   left on               theme's inventory block says In stock or Low
 *                         stock at its own line, as on Shopify
 *   plenty, or uncounted  no management, so the theme never prints a
 *                         count Storelib keeps to itself
 *
 * `quantity_rule.max` is the most one order may take when that is a real
 * stop (Limit sales, or the last few), never the whole stock, and never 0:
 * a sold out variant is refused by its button, not by a quantity of 0.
 */
function stockOf(v: O, lowAt: number): { management: string | null; quantity: number; policy: string; max: number | null } {
  const available = v.available !== false
  const keeps = v.policy === "continue"
  const left = typeof v.left === "number" && Number.isFinite(v.left) ? Math.max(0, Math.floor(v.left)) : null
  const few = available && !keeps && left !== null && left > 0 && left <= lowAt ? left : null
  const max = typeof v.max === "number" && Number.isFinite(v.max) && v.max > 0 ? Math.floor(v.max) : null
  /* The real count of a counted option (./product-facts.ts, only while Show stock left is on). */
  const real = typeof v.stock === "number" && Number.isFinite(v.stock) ? Math.max(0, Math.floor(v.stock)) : null
  if (real !== null) return { management: "shopify", quantity: available ? real : 0, policy: keeps ? "continue" : "deny", max: available ? max : null }
  return {
    management: !available ? "shopify" : few !== null ? "shopify" : null,
    quantity: !available ? 0 : few ?? Math.max(10, lowAt) + 1,
    policy: keeps ? "continue" : "deny",
    max: available ? max : null,
  }
}

/**
 * Each variant's option values: the product editor's own (option1 to
 * option3, `v.options`), else read from its name ("Small / Red" is Size
 * Small, Colour Red), one per option the product has.
 */
function optionValuesOf(v: O, count: number): string[] {
  const byName = variantOptions(String(v.name ?? "Default Title"), count)
  const own = Array.isArray(v.options) ? (v.options as unknown[]) : []
  if (!own.some((x) => typeof x === "string" && x.trim() !== "")) return byName
  return Array.from({ length: Math.max(1, count) }, (_, i) => (typeof own[i] === "string" && (own[i] as string).trim() !== "" ? (own[i] as string).trim() : byName[i]))
}

/**
 * A numeric id for an option value, as Shopify's are numbers: what a theme
 * puts in `data-option-value-id` and sends back as `?option_values=`
 * (./site.ts variantForOptionValues reads it). Option `pos`, value `vi`.
 */
export function optionValueId(pos: number, vi: number): number {
  return (pos + 1) * 1000 + vi
}

export function productObject(card: CardLike, extra: { descriptionHtml?: string; selectedVariantId?: string | null; selectedValues?: (string | null)[] | null } = {}): O {
  const s = card.settings
  const title = String(s.title ?? "")
  const handle = String(s.slug ?? "") || handleize(title)
  const ownImages = Array.isArray(s.images) && s.images.length ? (s.images as string[]) : s.image ? [String(s.image)] : []
  const listed = Array.isArray(s.variants) ? (s.variants as O[]) : []
  /*
    A product without options has one variant, "Default" (lib/physical/
    variants.ts): Shopify's has_only_default_variant, which a theme draws
    with no picker, bought by that variant's own id.
  */
  const defaultOnly = listed.length === 1 && !(Array.isArray(s.options) && s.options.length) && /^default( title)?$/i.test(String(listed[0].name ?? "").trim())
  const rawVariants = defaultOnly ? [] : listed
  /*
    A VARIANT'S PHOTO IS ONE OF THE PRODUCT'S MEDIA, as on Shopify: a theme
    finds the picture to show for the chosen variant by
    `variant.featured_media.id` among `product.media` (Dawn's and Horizon's
    galleries, and the variant JSON their scripts read). A variant photo the
    product's gallery does not have is added after it, once.
    `media`: photos and videos in order, when the product has a video
    (lib/website-builder/shop-products.ts); `images` stays pictures only.
  */
  const ordered = Array.isArray(s.media) && s.media.length ? [...(s.media as string[])] : [...ownImages]
  for (const v of rawVariants) {
    const src = typeof v.image === "string" ? v.image : ""
    if (src && !ordered.some((u) => sameImage(u, src))) ordered.push(src)
  }
  const media = mediaList(ordered, title)
  const pictures = media.filter((m) => m.media_type === "image")
  const mediaFor = (src: unknown): O | null => (typeof src === "string" && src ? media.find((m) => sameImage(String(m.src), src)) ?? null : null)
  const price = priceCents(s.price)
  const compare = priceCents(s.compare_price)
  const optionsIn = Array.isArray(s.options) ? (s.options as { name: string; values: string[]; swatches?: Record<string, string> }[]).filter((o) => o && typeof o.name === "string" && o.name.trim() !== "").slice(0, 3) : []
  const optionNames = optionsIn.length ? optionsIn.map((o) => o.name) : rawVariants.length ? ["Option"] : ["Title"]
  /* The store's low stock line (Settings › Locations, or the product's own): a count is said at or under it. */
  const lowAt = typeof s.low_stock_at === "number" && s.low_stock_at > 0 ? Math.floor(s.low_stock_at) : 5

  const variants: O[] = (rawVariants.length ? rawVariants : defaultOnly ? [{ ...listed[0], name: "Default Title" }] : [{ id: card.id, name: "Default Title", price: s.price, compare_price: s.compare_price, available: s.available !== false, checkout_url: s.checkout_url, left: s.left, stock: s.stock, max: s.max, policy: s.policy, sku: s.sku }]).map((v, i) => {
    const opts = rawVariants.length ? optionValuesOf(v, optionNames.length) : ["Default Title"]
    const vTitle = rawVariants.length ? opts.join(" / ") : "Default Title"
    const vPrice = v.price !== undefined && v.price !== "" ? priceCents(v.price) : price
    const vCompare = priceCents(v.compare_price) || compare
    const stock = stockOf(v, lowAt)
    /* Its own photo, or none: Shopify answers nil for a variant without one, and a theme falls back to the product's (`| default: product.featured_media`). */
    const own = mediaFor(v.image)
    const variant: O = {
      [OUTPUT]: String(v.id ?? card.id),
      id: String(v.id ?? card.id),
      title: vTitle,
      public_title: vTitle === "Default Title" ? null : vTitle,
      name: `${title}${vTitle === "Default Title" ? "" : ` - ${vTitle}`}`,
      price: vPrice,
      compare_at_price: vCompare > vPrice ? vCompare : null,
      available: v.available !== false,
      inventory_management: stock.management,
      inventory_policy: stock.policy,
      inventory_quantity: stock.quantity,
      option1: opts[0] ?? null,
      option2: opts[1] ?? null,
      option3: opts[2] ?? null,
      options: opts,
      sku: typeof v.sku === "string" ? v.sku : "",
      barcode: typeof v.barcode === "string" ? v.barcode : "",
      weight: typeof v.weight === "number" ? v.weight : 0,
      weight_unit: "g",
      requires_shipping: String(s.kind ?? "") === "physical",
      taxable: true,
      url: `${String(s.url ?? `/products/${handle}`)}?variant=${encodeURIComponent(String(v.id ?? card.id))}`,
      featured_image: own && own.media_type === "image" ? own : null,
      featured_media: own,
      image: own && own.media_type === "image" ? own : null,
      selected: false,
      matched: true,
      incoming: false,
      next_incoming_date: null,
      quantity_rule: { min: 1, max: stock.max, increment: 1 },
      quantity_price_breaks: [],
      unit_price_measurement: null,
      selling_plan_allocations: [],
      requires_selling_plan: false,
      /* The pickup points that hold this option (lib/physical/storefront-facts.ts), as Shopify's pickup availability block reads them. */
      store_availabilities: storeAvailabilities(v.pickup),
      metafields: {},
      position: i + 1,
      /* Storelib's own checkout for this option. */
      checkout_url: String(v.checkout_url ?? s.checkout_url ?? ""),
    }
    return variant
  })

  /*
    WHAT IS CHOSEN. `?variant=` names a variant; `?option_values=` names
    values, which may be a set no variant has (Ocean in M when Ocean comes
    in S only): then the values stay chosen and there is no variant, so the
    theme says Unavailable, as on Shopify. With neither, the first variant
    that can be bought.
  */
  const asked = extra.selectedVariantId ? variants.find((v) => v.id === extra.selectedVariantId) : undefined
  const valuesAsked = !asked && extra.selectedValues && extra.selectedValues.some((x) => typeof x === "string") ? extra.selectedValues : null
  const byValues = valuesAsked ? variants.find((v) => (v.options as string[]).every((o, k) => valuesAsked[k] === undefined || valuesAsked[k] === null || valuesAsked[k] === o)) : undefined
  const firstAvailable = variants.find((v) => v.available) ?? variants[0]
  const selectedVariant = asked ?? byValues ?? null
  const shownVariant = selectedVariant ?? (valuesAsked ? null : firstAvailable)
  const chosenValues: (string | null)[] = optionNames.map((_, k) => (shownVariant ? (shownVariant.options as string[])[k] : valuesAsked?.[k] ?? (firstAvailable?.options as string[] | undefined)?.[k] ?? null))
  if (shownVariant) shownVariant.selected = true

  const options_with_values = optionNames.map((name, pos) => {
    /* The values the product editor lists, in its order, that some variant has; then any a variant has that the list missed. */
    const had = new Set(variants.map((v) => (v.options as string[])[pos]))
    const listed = (optionsIn[pos]?.values ?? []).filter((x) => had.has(x))
    const values = [...listed, ...[...had].filter((x) => typeof x === "string" && !listed.includes(x))]
    /* A colour option's values as colours, as Storelib's own product page draws them (lib/products/product-page-model.ts): the swatch a theme's card and picker read; a colour without a colour name shows its variant's photo. */
    const colour = isColorOption(name)
    /* The seller's own swatches (Products › Variants, lib/products/option-swatches.ts): a colour, or the variant's photo, over what the name says. */
    const own = optionsIn[pos]?.swatches
    const optionValues = values.map((value, vi) => {
      const mine = own?.[String(value)]
      const hex = mine === "photo" ? null : mine && /^#[0-9a-f]{6}$/i.test(mine) ? mine.toLowerCase() : colour ? swatchColor(String(value)) : null
      /* Shopify: the variant this value makes with the values chosen for the other options, or none. */
      const match = variants.find((v) => (v.options as string[]).every((o, k) => (k === pos ? o === value : chosenValues[k] === null || o === chosenValues[k]))) ?? null
      /* Shopify: available when a variant with this value, and with the values chosen for the options before it, can be bought. */
      const available = variants.some((v) => v.available && (v.options as string[])[pos] === value && (v.options as string[]).every((o, k) => k >= pos || chosenValues[k] === null || o === chosenValues[k]))
      const photo = (colour || mine === "photo") && !hex ? ((variants.find((v) => (v.options as string[])[pos] === value && v.featured_image)?.featured_image as O | undefined) ?? null) : null
      return {
        [OUTPUT]: value,
        id: optionValueId(pos, vi),
        name: value,
        position: vi + 1,
        selected: chosenValues[pos] === value,
        available,
        variant: match,
        product_url: null,
        swatch: hex ? { [OUTPUT]: hex, color: colorObject(hex), image: null } : photo ? { [OUTPUT]: String(photo.src), color: null, image: photo } : null,
      }
    })
    const selectedValue = optionValues.find((v) => v.selected) ?? null
    return { [OUTPUT]: name, name, position: pos + 1, values: optionValues, selected_value: selectedValue }
  })

  /*
    METAFIELD SWATCHES. Themes built before Shopify's own swatches read a
    variant's colour from a metafield: `variant.metafields.custom.swatch`
    or `color_swatch` (a colour, or a picture). Each variant is given its
    colour option's swatch there, the same one `value.swatch` says.
  */
  const colourAt = options_with_values.findIndex((o) => isColorOption(String(o.name)))
  if (colourAt >= 0) {
    for (const v of variants) {
      const value = (options_with_values[colourAt].values as O[]).find((x) => x.name === (v.options as string[])[colourAt])
      const sw = value?.swatch as O | null | undefined
      if (!sw) continue
      const colour = sw.color ? String(sw[OUTPUT] ?? "") : ""
      const image = sw.image ? String((sw.image as O).src ?? "") : ""
      const field = colour
        ? { [OUTPUT]: colour, value: sw.color, key: "swatch", namespace: "custom", type: "color" }
        : { [OUTPUT]: image, value: sw.image, key: "swatch", namespace: "custom", type: "file_reference" }
      v.metafields = { custom: { swatch: field, color_swatch: { ...field, key: "color_swatch" }, colour_swatch: { ...field, key: "colour_swatch" } } }
    }
  }

  const prices = variants.map((v) => v.price as number)
  const compares = variants.map((v) => v.compare_at_price).filter((c): c is number => typeof c === "number" && c > 0)
  /* The product's own description from Products (round 12): the page's product's full read, else what its card carries (lib/website-builder/product-descriptions.ts), already cleaned. */
  const description = extra.descriptionHtml ?? (typeof s.description_html === "string" ? s.description_html : typeof s.description === "string" ? descriptionHtmlOf(s.description) : "")
  const product: O = {
    [OUTPUT]: title,
    id: card.id,
    title,
    handle,
    url: String(s.url ?? `/products/${handle}`),
    description,
    content: description,
    vendor: "",
    type: String(s.category ?? s.kind ?? ""),
    tags: [],
    available: variants.some((v) => v.available),
    price,
    price_min: prices.length ? Math.min(...prices) : price,
    price_max: prices.length ? Math.max(...prices) : price,
    price_varies: new Set(prices).size > 1,
    /* Across the variants, as Shopify's are: the lowest and highest compare at price of any variant that has one. */
    compare_at_price: compares.length ? Math.min(...compares) : compare > price ? compare : null,
    compare_at_price_min: compares.length ? Math.min(...compares) : compare > price ? compare : null,
    compare_at_price_max: compares.length ? Math.max(...compares) : compare > price ? compare : null,
    compare_at_price_varies: new Set(compares).size > 1,
    featured_image: pictures[0] ?? null,
    featured_media: media[0] ?? null,
    images: pictures,
    media,
    first_available_variant: firstAvailable,
    selected_variant: selectedVariant,
    /* None when the values asked for make no variant: Dawn and Horizon read that as Unavailable, as on Shopify. */
    selected_or_first_available_variant: shownVariant,
    variants,
    variants_count: variants.length,
    has_only_default_variant: !rawVariants.length,
    options: optionNames,
    options_with_values,
    options_by_name: anyCase(Object.fromEntries(options_with_values.map((o) => [String(o.name).toLowerCase(), o]))),
    collections: [],
    metafields: productMetafields(s, (card as { rating?: unknown }).rating, String((card as { id?: unknown }).id ?? "")),
    gift_card: false,
    gift_card_: false,
    requires_selling_plan: false,
    selling_plan_groups: [],
    quantity_price_breaks_configured: false,
    published_at: null,
    created_at: null,
    template_suffix: null,
    /* Storelib's own: what kind of product this is and its checkout. */
    kind: String(s.kind ?? ""),
    checkout_url: String(s.checkout_url ?? ""),
    pay_what_you_want: s.pay_what_you_want === true,
  }
  /* The cheapest rate home's business days (./product-facts.ts), for Storelib's Estimated delivery block; a theme never sees a key that starts with __. */
  const ship = s.delivery_days as { minDays?: unknown; maxDays?: unknown } | undefined
  if (ship && typeof ship === "object") Object.defineProperty(product, "__delivery", { value: { minDays: typeof ship.minDays === "number" ? ship.minDays : null, maxDays: typeof ship.maxDays === "number" ? ship.maxDays : null }, enumerable: false, configurable: true })
  for (const v of variants) {
    v.product = { id: product.id, title, handle, url: product.url }
    asJson(v, () => variantJson(v, product.id))
  }
  asJson(product, () => productJson(product))
  /* Each picture knows the variants that show it (`attached_to_variant?`, `variant_ids`), as Shopify's does; ids only, so `| json` never walks a loop. */
  for (const m of media) {
    const own = rawVariants.length ? variants.filter((_, i) => sameImage(String(m.src), String(rawVariants[i]?.image ?? ""))) : []
    if (own.length) {
      m.attached_to_variant = true
      m.variant_ids = own.map((v) => v.id)
    }
  }
  return product
}

/*
  ═══════════════════════════════════════════════════════════════════════════
   `product | json` AS SHOPIFY WRITES IT
  ═══════════════════════════════════════════════════════════════════════════
  A theme's script reads the product from `{{ product | json }}` (or a
  variant from `{{ product.selected_or_first_available_variant | json }}`)
  and expects Shopify's shape, which is not the Liquid object's: `images` a
  list of addresses, `featured_image` an address, a variant's
  `featured_image` a small picture record and `featured_media` with its
  `preview_image`, `public_title`, no loops back to the product. Written
  here, once, and used by the json filter (./filters.ts jsonSafe).
*/

/** The JSON Shopify writes for a product or a variant made here, or null for anything else. */
export function shopifyJson(o: unknown): O | null {
  const write = o && typeof o === "object" ? (o as { __json__?: unknown }).__json__ : undefined
  return typeof write === "function" ? (write() as O) : null
}

/** Gives an object the JSON Shopify writes for it, unseen by Liquid. */
function asJson(o: O, write: () => unknown) {
  Object.defineProperty(o, "__json__", { value: write, enumerable: false, configurable: true })
}

function previewJson(m: O | null): O | null {
  if (!m) return null
  const preview = (m.preview_image as O | null) ?? m
  const ratio = (x: unknown) => (x instanceof LFloat ? x.v : typeof x === "number" ? x : 1)
  return { aspect_ratio: ratio(preview.aspect_ratio), height: preview.height ?? null, width: preview.width ?? null, src: preview.src ?? null }
}

function mediaJson(m: O): O {
  const base = { alt: m.alt ?? null, id: m.id, position: m.position, preview_image: previewJson(m), aspect_ratio: previewJson(m)?.aspect_ratio ?? 1 }
  if (m.media_type === "video") return { ...base, media_type: "video", duration: m.duration ?? null, sources: m.sources ?? [] }
  return { ...base, height: m.height ?? null, media_type: "image", src: m.src, width: m.width ?? null }
}

function variantJson(v: O, productId: unknown): O {
  const image = v.featured_image as O | null
  const media = v.featured_media as O | null
  return {
    id: v.id,
    title: v.title,
    option1: v.option1,
    option2: v.option2,
    option3: v.option3,
    sku: v.sku,
    requires_shipping: v.requires_shipping,
    taxable: v.taxable,
    featured_image: image ? { id: image.id, product_id: productId, position: image.position, created_at: null, updated_at: null, alt: image.alt ?? null, width: image.width ?? null, height: image.height ?? null, src: image.src, variant_ids: Array.isArray(image.variant_ids) ? image.variant_ids : [v.id] } : null,
    available: v.available,
    name: v.name,
    public_title: v.public_title,
    options: v.options,
    price: v.price,
    weight: v.weight,
    compare_at_price: v.compare_at_price,
    inventory_management: v.inventory_management,
    barcode: v.barcode,
    featured_media: media ? { alt: media.alt ?? null, id: media.id, position: media.position, preview_image: previewJson(media) } : null,
    requires_selling_plan: false,
    selling_plan_allocations: [],
    quantity_rule: v.quantity_rule,
  }
}

function productJson(p: O): O {
  const images = ((p.images as O[]) ?? []).map((i) => i.src)
  return {
    id: p.id,
    title: p.title,
    handle: p.handle,
    description: p.description,
    published_at: p.published_at,
    created_at: p.created_at,
    vendor: p.vendor,
    type: p.type,
    tags: p.tags,
    price: p.price,
    price_min: p.price_min,
    price_max: p.price_max,
    available: p.available,
    price_varies: p.price_varies,
    compare_at_price: p.compare_at_price,
    compare_at_price_min: p.compare_at_price_min ?? 0,
    compare_at_price_max: p.compare_at_price_max ?? 0,
    compare_at_price_varies: p.compare_at_price_varies,
    variants: ((p.variants as O[]) ?? []).map((v) => variantJson(v, p.id)),
    images,
    featured_image: images[0] ?? null,
    options: p.options,
    media: ((p.media as O[]) ?? []).map(mediaJson),
    requires_selling_plan: false,
    selling_plan_groups: [],
    content: p.content,
  }
}

/**
 * A product's metafields, the way an Online Store 2.0 theme reads them.
 * `custom`: the creator's custom fields (lib/products/custom-fields.ts), each
 * a drop that prints as its value and has `.value`, `.type`, `.key`, so both
 * `{{ product.metafields.custom.material }}` and `.material.value` work.
 * `storelib.faqs`: the product's own questions, `.value` a list of
 * `{ question, answer }`; it prints as how many there are, never as markup.
 * `storelib.size_chart`: its size chart (lib/size-charts/model.ts
 * sizeChartJson), `.value` the name, unit, columns, rows (and the rows in
 * cm and in), notes and picture; it prints as the chart's name.
 */
function productMetafields(s: Record<string, unknown>, rating?: unknown, productId = ""): O {
  const custom: O = {}
  if (s.fields && typeof s.fields === "object") {
    for (const [key, value] of Object.entries(s.fields as Record<string, unknown>)) {
      if (typeof value !== "string" || !value) continue
      custom[key] = { [OUTPUT]: value, value, key, namespace: "custom", type: value.includes("\n") ? "multi_line_text_field" : "single_line_text_field" }
    }
  }
  /* Round 13: each answer also as safe markup (`answer_html`: escaped words, a <br> per line), so a theme prints it with no filter and never prints a seller's tag as a tag. */
  const faqs = Array.isArray(s.faqs) ? (s.faqs as { question?: unknown; answer?: unknown }[]).filter((f) => typeof f?.question === "string" && typeof f?.answer === "string").map((f) => ({ question: f.question as string, answer: f.answer as string, answer_html: escapeText(f.answer as string).replace(/\r?\n/g, "<br>") })) : []
  const storelib: O = faqs.length ? { faqs: { [OUTPUT]: String(faqs.length), value: faqs, key: "faqs", namespace: "storelib", type: "list.faq" } } : {}
  const chart = readSizeChart(s.size_chart)
  if (chart) {
    /* Round 13: where the chart came from (its own, a collection's, a category's), for a theme that says so. */
    const source = (s.size_chart as { source?: unknown } | null | undefined)?.source
    const value = { ...sizeChartJson(chart), source: source === "collection" || source === "category" ? source : "product" }
    storelib.size_chart = { [OUTPUT]: chart.name, value, key: "size_chart", namespace: "storelib", type: "json" }
    /*
      `custom.size_chart`, the name most Shopify themes read a size chart
      under, as a page: `.value.title` and `.value.content` (the table in
      the chart's own unit), with the same JSON beside them. Never over a
      custom field of the creator's by that name.
    */
    if (custom.size_chart === undefined) {
      custom.size_chart = { [OUTPUT]: chart.name, value: { ...value, [OUTPUT]: chart.name, content: sizeChartTableHtml(chart, chart.unit) }, key: "size_chart", namespace: "custom", type: "json" }
    }
  }
  /* `storelib.personalization`: what the buyer is asked when buying it (lib/products/personalization.ts themeFieldObjects), `.value` one object per field; it prints as how many there are. The theme posts each answer as properties[<label>] (./personalization.ts). */
  const asks = readPersonalization(s.personalization)
  if (asks.length) storelib.personalization = { [OUTPUT]: String(asks.length), value: themeFieldObjects(asks, productId), key: "personalization", namespace: "storelib", type: "list.personalization_field" }
  /*
    `storelib.offers`: what the page offers with the product, the same JSON
    as GET /api/offers?product= (lib/offers/offers-public.ts): `.value` has
    bundles, quantityBreaks and checkoutOffers, so a theme can draw them in
    Liquid. It prints as that JSON, as a json metafield does on Shopify.
  */
  const offers = s.storelib_offers
  if (offers && typeof offers === "object" && !Array.isArray(offers)) storelib.offers = { [OUTPUT]: JSON.stringify(offers), value: offers, key: "offers", namespace: "storelib", type: "json" }
  const reviews = reviewMetafields(rating)
  /* `storelib.reviews`: the same numbers with how many reviews gave each star, for a theme that draws the bars. */
  const summary = storelibReviewSummary(rating)
  if (summary) storelib.reviews = { [OUTPUT]: String(summary.count), value: summary, key: "reviews", namespace: "storelib", type: "json" }
  return { custom, storelib, reviews }
}

/** `product.metafields.storelib.reviews.value`: average, count, scale and the five stars' counts when they were read. */
export function storelibReviewSummary(rating: unknown): O | null {
  const r = (rating && typeof rating === "object" ? rating : {}) as { value?: unknown; count?: unknown; stars?: unknown }
  const count = typeof r.count === "number" && r.count > 0 ? Math.floor(r.count) : 0
  const average = typeof r.value === "number" && r.value > 0 ? Math.round(r.value * 10) / 10 : 0
  if (!count || !average) return null
  const stars = r.stars && typeof r.stars === "object" ? (r.stars as Record<string, unknown>) : null
  const distribution = stars
    ? [5, 4, 3, 2, 1].map((n) => {
        const c = Math.max(0, Math.floor(Number(stars[n]) || 0))
        return { stars: n, count: c, percent: count ? Math.round((c / count) * 100) : 0 }
      })
    : null
  return { average, rating: average, count, scale_min: 1, scale_max: 5, ...(distribution ? { distribution } : {}) }
}

/**
 * Shopify's standard review metafields, from Storelib Reviews' rating beside
 * the card's settings (lib/website-builder/shop-products.ts withRatings): what every Online
 * Store 2.0 theme reads for the stars on a product card and under a product's
 * title. `reviews.rating.value` is a rating (`.rating`, `.scale_min`,
 * `.scale_max`, and it prints as the number); `reviews.rating_count.value` a
 * whole number. Absent with no published reviews, so a theme's
 * `!= blank` test draws no stars.
 */
export function reviewMetafields(rating: unknown): O {
  const r = (rating && typeof rating === "object" ? rating : {}) as { value?: unknown; count?: unknown; color?: unknown }
  const count = typeof r.count === "number" && r.count > 0 ? Math.floor(r.count) : 0
  const average = typeof r.value === "number" && r.value > 0 ? Math.round(r.value * 10) / 10 : 0
  if (!count || !average) return {}
  /* Shopify's rating: `.rating`, `.scale_min`, `.scale_max`; `.value` the same number, for a theme written against that name. */
  const value = { [OUTPUT]: average.toFixed(1), rating: average, value: average, scale_min: 1, scale_max: 5 }
  return {
    /* `__star_color`: the store's star colour, for Storelib Reviews' own stars on a page that has no reviews of its own to read it from (./storelib-reviews.ts). A theme never sees a key that starts with __. */
    rating: { [OUTPUT]: average.toFixed(1), value, key: "rating", namespace: "reviews", type: "rating", ...(typeof r.color === "string" && r.color ? { __star_color: r.color } : {}) },
    rating_count: { [OUTPUT]: String(count), value: count, key: "rating_count", namespace: "reviews", type: "number_integer" },
  }
}

/**
 * The product page's own rating, from the page's Storelib Reviews
 * (lib/reviews/storefront.ts, handed to the page as `reviews`): its
 * published reviews of this product while the app is on, as the rating
 * reviewMetafields above reads. Null for sample reviews, for another
 * product, or with none.
 */
export function productRatingFrom(reviews: unknown, productId: string): { value: number; count: number; color: string; stars?: Record<string, number> } | null {
  const r = reviews as { enabled?: unknown; sample?: unknown; star_color?: unknown; product?: { id?: unknown; summary?: { count?: unknown; average?: unknown; bars?: unknown } } | null } | null | undefined
  if (!r || r.enabled !== true || r.sample === true || !r.product || String(r.product.id ?? "") !== productId) return null
  const count = Number(r.product.summary?.count)
  const value = Number(r.product.summary?.average)
  const bars = Array.isArray(r.product.summary?.bars) ? (r.product.summary!.bars as { stars?: unknown; count?: unknown }[]) : []
  const stars = bars.length ? Object.fromEntries(bars.map((b) => [String(b.stars), Math.max(0, Math.floor(Number(b.count) || 0))])) : undefined
  return count > 0 && value > 0 ? { value, count, color: typeof r.star_color === "string" ? r.star_color : "", ...(stars ? { stars } : {}) } : null
}

/**
 * A description as a theme prints it: a product's rich text is HTML already
 * (the product editor writes it), so it is cleaned and kept, never escaped
 * into visible tags; plain text becomes paragraphs. The same rule the live
 * product page uses (lib/website-builder/compat-site.ts).
 */
function descriptionHtmlOf(text: string): string {
  return /<[a-z][\s\S]*>/i.test(text) ? sanitizeRichText(text) : escapeParagraphs(text)
}

/** Plain words as markup: every tag a seller typed shown as words, quotes too. */
function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

function escapeParagraphs(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return esc.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("")
}

// ── Collections ──────────────────────────────────────────────────────────────

export interface CollectionLike {
  id: string
  title: string
  handle: string
  description?: string
  image?: string
  url?: string
  products_count?: number
  products?: CardLike[]
}

export function collectionObject(c: CollectionLike, productsFor?: (c: CollectionLike) => O[], extra: O = {}): O {
  const products = productsFor ? productsFor(c) : (c.products ?? []).map((p) => productObject(p))
  const image = c.image ? imageObject(c.image, c.title) : null
  return {
    [OUTPUT]: c.title,
    id: c.id,
    title: c.title,
    handle: c.handle,
    url: c.url ?? `/collections/${c.handle}`,
    description: c.description ? descriptionHtmlOf(c.description) : "",
    image,
    featured_image: image ?? (products[0]?.featured_image as O | null) ?? null,
    products,
    all_products_count: c.products_count ?? products.length,
    products_count: c.products_count ?? products.length,
    all_types: [],
    all_vendors: [],
    all_tags: [],
    tags: [],
    filters: [],
    sort_by: "",
    default_sort_by: "manual",
    sort_options: SORT_OPTIONS,
    current_type: null,
    current_vendor: null,
    template_suffix: null,
    metafields: {},
    next_product: null,
    previous_product: null,
    ...extra,
  }
}

export const SORT_OPTIONS = [
  { value: "manual", name: "Featured" },
  { value: "best-selling", name: "Best selling" },
  { value: "title-ascending", name: "Alphabetically, A-Z" },
  { value: "title-descending", name: "Alphabetically, Z-A" },
  { value: "price-ascending", name: "Price, low to high" },
  { value: "price-descending", name: "Price, high to low" },
  { value: "created-ascending", name: "Date, old to new" },
  { value: "created-descending", name: "Date, new to old" },
]

// ── Menus ────────────────────────────────────────────────────────────────────

export interface MenuLinkLike {
  title?: string
  label?: string
  url?: string
  links?: MenuLinkLike[]
}

/** What a menu link points at, as Shopify types it: a catalog, a collection, a product, a page. */
function linkType(url: string): string {
  const path = url.split(/[?#]/)[0].replace(/\/+$/, "") || "/"
  if (path === "/") return "frontpage_link"
  if (path === "/collections/all") return "catalog_link"
  if (path === "/collections") return "collections_link"
  if (/^\/collections\/[^/]+$/.test(path)) return "collection_link"
  if (/^(?:\/collections\/[^/]+)?\/products\/[^/]+$/.test(path)) return "product_link"
  if (path.startsWith("/pages/")) return "page_link"
  if (path === "/search") return "search_link"
  if (/^\/blogs\/[^/]+\/[^/]+$/.test(path)) return "article_link"
  if (path.startsWith("/blogs/")) return "blog_link"
  if (path.startsWith("/policies/")) return "policy_link"
  return "http_link"
}

/**
 * `link.object`: the collection or product a menu link opens, made when a
 * theme reads it. A mega menu draws a collection's picture or a few of its
 * products from it (Horizon's featured collections and products); it was
 * always nil, and those menus drew empty columns.
 */
export function linkTarget(r: Resources): (url: string) => O | null {
  return (url) => {
    const path = url.split(/[?#]/)[0].replace(/\/+$/, "")
    const collection = path.match(/^\/collections\/([^/]+)$/)
    if (collection) return collectionByHandle(r, decodeURIComponent(collection[1]))
    const product = path.match(/^(?:\/collections\/[^/]+)?\/products\/([^/]+)$/)
    if (product) return productById(r, product[1])
    return null
  }
}

/** Where a link goes on this website (./links.ts siteLink), or the address as written where nothing resolves it. */
export type LinkResolver = (url: string) => string

export function linkObject(l: MenuLinkLike, currentPath: string, level = 1, resolve?: LinkResolver, target?: (url: string) => O | null): O {
  const title = String(l.title ?? l.label ?? "")
  const written = String(l.url ?? "#")
  const url = resolve ? resolve(written) || written : written
  /*
    "Open in a new tab" rides on the address as a mark (lib/website-builder/new-tab.ts)
    and stays on `link.url`, so whatever the theme prints it in (a header, a drawer,
    a mega menu, a footer) carries it, and the drawn page turns it into
    target="_blank" (./page.ts). What the link IS, active, its type, its object, is
    read without it.
  */
  const plain = withoutNewTab(url)
  const links = (l.links ?? []).map((c) => linkObject(c, currentPath, level + 1, resolve, target))
  const active = plain === currentPath
  const child_active = links.some((c) => c.active || c.child_active)
  const out: O = {
    [OUTPUT]: title,
    title,
    url,
    handle: handleize(title),
    active,
    current: active,
    child_active,
    child_current: child_active,
    links,
    levels: links.length ? 1 + Math.max(0, ...links.map((c) => Number(c.levels ?? 0))) : 0,
    type: linkType(plain),
    object: null,
  }
  if (target) {
    let made = false
    let value: O | null = null
    Object.defineProperty(out, "object", { enumerable: true, configurable: true, get: () => { if (!made) { made = true; value = target(plain) } return value } })
  }
  return out
}

export function linklistObject(handle: string, title: string, links: MenuLinkLike[], currentPath: string, resolve?: LinkResolver, target?: (url: string) => O | null): O {
  const items = links.map((l) => linkObject(l, currentPath, 1, resolve, target))
  return { [OUTPUT]: handle, handle, title, links: items, levels: items.length ? 1 + Math.max(0, ...items.map((c) => Number(c.levels ?? 0))) : 0 }
}

// ── Colours, fonts, schemes ──────────────────────────────────────────────────

export function colorObject(value: unknown): O | null {
  const c = parseColor(value)
  if (!c) return null
  const hex = toHex(c)
  const R = c.r / 255, G = c.g / 255, B = c.b / 255
  const max = Math.max(R, G, B), min = Math.min(R, G, B)
  const l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = (max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4) * 60
  }
  return {
    [OUTPUT]: c.a < 1 ? `rgba(${c.r}, ${c.g}, ${c.b}, ${+c.a.toFixed(2)})` : hex,
    red: c.r,
    green: c.g,
    blue: c.b,
    alpha: c.a,
    hue: Math.round(h),
    saturation: Math.round(s * 100),
    lightness: Math.round(l * 100),
    rgb: `${c.r} ${c.g} ${c.b}`,
    rgba: `${c.r} ${c.g} ${c.b} / ${+c.a.toFixed(2)}`,
    hex,
  }
}

/** Fonts Shopify's library has that are not on Google Fonts under the same name, by handle prefix. */
const SYSTEM_FONTS: Record<string, string> = {
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  serif: "Iowan Old Style, Apple Garamond, Baskerville, Times New Roman, serif",
  mono: "Menlo, Consolas, Monaco, Liberation Mono, monospace",
}

/*
  A FAMILY BY ITS OWN NAME. A handle is written in small letters, and its
  family was read back with each word capitalised: "dm_sans_n4" became
  "Dm Sans", a name Google Fonts does not know (it answers 400), so a theme
  set to DM Sans or EB Garamond from the font picker drew its fallback, in
  the canvas and live. A family Storelib's picker offers is read back as
  the picker names it.
*/
const OFFERED_BY_HANDLE = new Map([...OFFERED_FAMILIES].map((f) => [f.toLowerCase().replace(/[^a-z0-9]+/g, "_"), f]))

/**
 * A font_picker value ("assistant_n4", "work_sans_i7") as Shopify's font
 * object: the family from the handle, the weight from the digit, italic from
 * the i. Served from Google Fonts, where the families of Shopify's library
 * are, by name.
 */
export function fontObject(handle: unknown): O | null {
  const h = String(handle ?? "").trim()
  if (!h) return null
  const m = h.match(/^(.*)_(n|i|o)(\d)$/)
  const base = m ? m[1] : h
  const style = m ? (m[2] === "n" ? "normal" : "italic") : "normal"
  const weight = m ? String(Number(m[3]) * 100) : "400"
  const system = base in SYSTEM_FONTS || /^(system|sans_serif|serif|monospace)$/.test(base)
  const family = system ? (base === "mono" || base === "monospace" ? "monospace" : base === "serif" ? "serif" : "system-ui") : OFFERED_BY_HANDLE.get(base.toLowerCase()) ?? base.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
  const fallback = system ? SYSTEM_FONTS[base] ?? "sans-serif" : /serif|garamond|baskerville|playfair|lora|merriweather|crimson|libre_baskerville|cormorant|domine|bitter|arvo|fraunces|newsreader|bodoni/i.test(base) ? "serif" : /mono|code|courier/i.test(base) ? "monospace" : "sans-serif"
  return {
    [OUTPUT]: family,
    family,
    fallback_families: fallback,
    weight,
    style,
    system,
    baseline_ratio: 0.8,
    variants: [],
    handle: h,
  }
}

/** The families and weights a theme's font settings name, as Google Fonts stylesheet addresses. */
export function fontLinks(fonts: O[]): string[] {
  const byFamily = new Map<string, Set<string>>()
  for (const f of fonts) {
    if (!f || f.system === true) continue
    const set = byFamily.get(String(f.family)) ?? new Set<string>()
    const ital = f.style === "italic" ? 1 : 0
    /* The regular, the bold and their italics, which every theme asks for with font_modify. */
    for (const w of new Set([String(f.weight || 400), "400", "700"])) { set.add(`${ital},${w}`); set.add(`${1 - ital},${w}`) }
    byFamily.set(String(f.family), set)
  }
  return [...byFamily].map(([family, set]) => {
    const axes = [...set].sort((a, b) => (a < b ? -1 : 1)).join(";")
    return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:ital,wght@${axes}&display=swap`
  })
}

// ── Settings, typed by their schema ──────────────────────────────────────────

export interface Resources {
  products: CardLike[]
  /**
   * Every published product a picker may name, the shop's list included: a
   * product sold as a membership or a community tier is left out of the
   * shop's own list but can be picked for a featured product. Lookups by id
   * read this; listings read `products`.
   */
  catalog?: CardLike[]
  collections: CollectionLike[]
  menus: Record<string, { title?: string; links: MenuLinkLike[] }>
  /** Colour schemes by id, already made objects (schemesObject). */
  schemes: Record<string, O>
  /** A picture setting's value as an address: an asset of the theme, a library file, a URL. */
  imageUrl: (value: string) => string
  currentPath: string
  /** Where a link of the theme goes on this website (./links.ts siteLink). Absent: as written, Shopify's own addresses made this site's. */
  link?: LinkResolver
  /** Product objects by id, made once per draw. */
  productCache?: Map<string, O>
  /** The page's own product, for a picker set to "@current" (the product the page is showing). */
  current?: CardLike | null
  /**
   * Each product's size chart, by product id, read for this store
   * (lib/size-charts/storefront.ts sizeChartsForStore): a featured product
   * and a card get the same product.metafields.storelib.size_chart as the
   * product's own page.
   */
  sizeCharts?: Record<string, SizeChart>
  /**
   * Every product's published rating, by product id (the page's Storelib
   * Reviews, lib/reviews/storefront.ts `ratings`): a product a section picks
   * (a featured product) gets its review metafields from it when its card
   * carries none.
   */
  ratings?: Record<string, { count: number; average: number; stars?: Record<string, number> }>
}

/**
 * What a product setting names, as a plain id or handle. Storelib's own
 * picker stores a product's address ("/products/honey"), a theme's default
 * may be Shopify's ("shopify://products/honey"), and an address may carry a
 * query or a trailing slash: each is the handle.
 */
export function productKey(value: string): string {
  let v = value.trim()
  v = v.replace(/^shopify:\/\/products\//, "").replace(/^(?:https?:\/\/[^/]+)?\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?products\//i, "")
  v = v.split(/[?#]/)[0].replace(/\/+$/, "")
  try {
    v = decodeURIComponent(v)
  } catch {
    /* kept as it is */
  }
  return v
}

/** The card with its size chart from the store's charts, when the card does not carry one. */
function withChart(r: Resources, card: CardLike): CardLike {
  const chart = r.sizeCharts?.[card.id]
  if (!chart || card.settings.size_chart !== undefined) return card
  return { ...card, settings: { ...card.settings, size_chart: chart } }
}

/**
 * A product a section picked (`product` setting: Dawn's and Horizon's
 * featured product): the product's object with its review metafields from
 * the page's ratings when its card has none, so its stars, its rating block
 * and its structured data read the same numbers as its own page.
 */
function pickedProduct(r: Resources, raw: string): O | null {
  const obj = productById(r, raw)
  if (!obj) return null
  const id = String(obj.id ?? "")
  const mf = obj.metafields as O | undefined
  const rated = r.ratings?.[id]
  if (!mf || (mf.reviews && Object.keys(mf.reviews as O).length) || !rated || !(rated.count > 0) || !(rated.average > 0)) return obj
  r.productCache ??= new Map()
  const key = `picked\u0000${id}`
  const hit = r.productCache.get(key)
  if (hit) return hit
  const card = cardById(r, id)
  if (!card) return obj
  /* Its own object, so the shop's cards keep what "Stars on product cards" says. */
  const own = productObject(card)
  const rating = { value: rated.average, count: rated.count, ...(rated.stars ? { stars: rated.stars } : {}) }
  const metafields = own.metafields as O
  metafields.reviews = reviewMetafields(rating)
  const summary = storelibReviewSummary(rating)
  if (summary) (metafields.storelib as O).reviews = { [OUTPUT]: String(summary.count), value: summary, key: "reviews", namespace: "storelib", type: "json" }
  r.productCache.set(key, own)
  return own
}

/** The card a product setting names, with the catalogue's description and the product's size chart. */
function cardById(r: Resources, idOrHandle: string): CardLike | null {
  const urlOf = (p: CardLike) => productKey(String(p.settings.url ?? ""))
  const matches = (p: CardLike) => p.id === idOrHandle || String(p.settings.slug ?? "") === idOrHandle || handleize(String(p.settings.title ?? "")) === idOrHandle || (!!p.settings.url && urlOf(p) === idOrHandle)
  let card = r.products.find(matches) ?? r.catalog?.find(matches)
  if (!card) return null
  /* The shop's card with the catalogue's description (round 12: lib/website-builder/product-descriptions.ts reads it for the catalogue). */
  /* And its questions (round 13: lib/website-builder/product-extras.ts reads them for the catalogue), so a Featured product's metafields are its page's; its size chart is withChart's. */
  {
    const id = card.id
    const full = r.catalog?.find((p) => p.id === id)
    const fill: Record<string, unknown> = {}
    if (full && typeof card.settings.description_html !== "string" && typeof full.settings.description_html === "string") fill.description_html = full.settings.description_html
    if (full && card.settings.faqs === undefined && Array.isArray(full.settings.faqs)) fill.faqs = full.settings.faqs
    if (Object.keys(fill).length) card = { ...card, settings: { ...card.settings, ...fill } }
  }
  return withChart(r, card)
}

export function productById(r: Resources, raw: string): O | null {
  if (!raw) return null
  if (raw === "@current") return r.current ? productObject(withChart(r, r.current)) : null
  const idOrHandle = productKey(raw)
  if (!idOrHandle) return null
  r.productCache ??= new Map()
  const hit = r.productCache.get(idOrHandle)
  if (hit) return hit
  const card = cardById(r, idOrHandle)
  if (!card) return null
  const obj = productObject(card)
  r.productCache.set(idOrHandle, obj)
  return obj
}

/**
 * A collection by its handle. `all` is every product, as on every Shopify
 * store. A handle the shop does not have (a theme's demo collection, a
 * collection of the store the theme came from) is the shop's own products
 * too, so a section set to "Featured" shows real products rather than grey
 * placeholders; the import report names every such handle.
 */
export function collectionByHandle(r: Resources, handle: string): O | null {
  const c = r.collections.find((x) => x.handle === handle || x.id === handle)
  const products = (col: CollectionLike) => (col.products ?? []).map((p) => productById(r, p.id) ?? productObject(p))
  if (c) return collectionObject(c, products)
  if (!handle || r.products.length === 0) return null
  /* Its card links to the whole shop, which is what it shows: the store it came from had that collection, this one does not (./links.ts). */
  const all: CollectionLike = { id: handle === "all" ? "all" : `all-${handle}`, title: handle === "all" ? "Products" : handle.replace(/[-_]+/g, " ").replace(/^./, (x) => x.toUpperCase()), handle, url: "/collections/all", products: r.products, products_count: r.products.length }
  return collectionObject(all, products)
}

/** One setting's stored value, as the object a theme reads for its type. */
export function typedValue(type: string, value: unknown, r: Resources, exact = false): unknown {
  switch (type) {
    case "color":
    case "color_background":
      return type === "color_background" ? (value ?? "") : colorObject(value) ?? (value === "" || value === undefined ? null : value)
    case "font_picker":
      return fontObject(value)
    case "image_picker": {
      const src = typeof value === "string" ? r.imageUrl(value) : ""
      return src ? imageObject(src) : null
    }
    /*
      A HANDLE FROM THE STORE THE THEME CAME FROM ("the-linen-shirt" in its
      settings_data.json) is a product this shop does not have. It is the
      shop's first product, as an unknown collection handle is the shop's
      products (collectionByHandle): a featured product never draws the
      theme's "Example product title" on a shop that has products.
    */
    case "product": {
      if (typeof value !== "string" || !value) return null
      /*
        `exact`: a theme setting (a gift wrap, a free gift, an upsell) is a
        product the shop sells only when it is one: the shop's first product
        stood in as the gift wrap, ticked and charged on every cart.
      */
      return pickedProduct(r, value) ?? (!exact && r.products[0] ? pickedProduct(r, r.products[0].id) : null)
    }
    case "product_list": {
      if (!Array.isArray(value)) return []
      const found = value.map((v) => productById(r, String(v))).filter(Boolean)
      if (found.length > 0 || value.length === 0) return found
      return r.products.slice(0, value.length).map((p) => productById(r, p.id)).filter(Boolean)
    }
    case "collection":
      return typeof value === "string" ? collectionByHandle(r, value) : null
    case "collection_list":
      return Array.isArray(value) ? value.map((v) => collectionByHandle(r, String(v))).filter(Boolean) : []
    case "link_list": {
      const handle = String(value ?? "")
      /* A menu of the store the theme came from ("main-menu-1", "mega-menu") is the shop's own: its footer menu for a footer's, its main menu for the rest. */
      const menu = r.menus[handle] ?? (handle ? r.menus[/footer/i.test(handle) ? "footer" : "main-menu"] ?? r.menus["main-menu"] : undefined)
      return menu ? linklistObject(handle, menu.title ?? handle, menu.links, r.currentPath, r.link, linkTarget(r)) : handle ? linklistObject(handle, handle, [], r.currentPath) : null
    }
    /*
      A PALETTE (Horizon's color_palette): each of its colours a colour, as
      Shopify gives them, so `settings.color_palette.color3` is a colour and
      `for c in settings.color_palette` walks colours with their brightness
      and .rgb. Kept as words, Horizon's "lightest colour of the palette" was
      never found and --palette-lightest-rgb was empty, which left every
      contrast colour built on it unset.
    */
    case "color_palette": {
      if (!value || typeof value !== "object" || Array.isArray(value)) return value ?? null
      const out: O = {}
      for (const [k, v] of Object.entries(value as O)) out[k] = colorObject(v) ?? v
      return out
    }
    case "color_scheme":
      return r.schemes[String(value ?? "")] ?? Object.values(r.schemes)[0] ?? null
    case "color_scheme_group":
      return r.schemes
    case "video":
      return typeof value === "string" && value ? { [OUTPUT]: value, media_type: "video", sources: [{ url: value, mime_type: "video/mp4" }], preview_image: null, alt: "" } : null
    case "video_url": {
      const url = String(value ?? "")
      const yt = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{6,})/)
      const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
      return url ? { [OUTPUT]: url, id: yt?.[1] ?? vm?.[1] ?? "", type: yt ? "youtube" : vm ? "vimeo" : "", url } : null
    }
    case "range":
    case "number":
      return typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : value ?? null
    case "checkbox":
      return value === true || value === "true"
    case "page": {
      /*
        A page picked in the sidebar ("/pages/about") or saved by the theme
        ("about", "shopify://pages/about"): the page at that address, so a
        section that links to it or prints its title has one (round R6).
      */
      const handle = typeof value === "string" ? value.replace(/^shopify:\/\/pages\//, "").replace(/^\/?pages\//, "").replace(/^\//, "").split(/[?#]/)[0] : ""
      if (!/^[a-z0-9][a-z0-9_-]*$/i.test(handle)) return null
      const title = handle.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase())
      return { [OUTPUT]: title, id: handle, title, handle, url: `/pages/${handle}`, content: "", template_suffix: null, metafields: {} }
    }
    case "blog":
    case "article":
    case "metaobject":
      return null
    case "url":
      /* An address of the store the theme came from, or a page this site has none of, is the place on this site it meant (./links.ts). */
      return typeof value === "string" ? (r.link ? r.link(value) : shopifyAddress(value)) : value ?? ""
    default:
      return value ?? (["text", "textarea", "richtext", "inline_richtext", "html", "url", "liquid", "select", "radio", "text_alignment"].includes(type) ? "" : null)
  }
}

export type ShopifySetting = { type: string; id?: string; default?: unknown }

export { shopifyAddress }

/**
 * A value that names another value: `"{{ settings.color_palette.color3 }}"`
 * in a colour setting, `"{{ closest.collection.title }}"` in a heading.
 * Shopify calls these dynamic sources and reads them where they are drawn,
 * so a block inside a product card reads its own product.
 */
/* One placeholder and nothing else: "{{ a }} from {{ b }}" is text with two in it, never one expression "a }} from {{ b". */
const WHOLE = /^\s*\{\{\s*((?:(?!\{\{|\}\})[\s\S])+?)\s*\}\}\s*$/

/** How a dynamic source is read: an expression to a value, or text with `{{ }}` in it to text. */
export interface DynamicResolver {
  value(expr: string): unknown
  text(src: string): string
}

/**
 * THE SHOP'S OWN PRODUCTS WHERE NOTHING IS PICKED YET. A featured collection
 * with no collection chosen, or a featured product with no product, draws
 * Shopify's grey "Example product" cards; on a Storelib shop that has
 * products, the section shows them instead (every product, or the first),
 * so a theme's product sections are filled from the moment it is imported.
 * Only the settings a section is built around (`collection`, `product`);
 * an optional product elsewhere stays empty.
 */
function shopDefault(s: ShopifySetting, value: unknown, r: Resources): unknown {
  const empty = value === undefined || value === null || value === ""
  if (!empty || r.products.length === 0) return value
  if (s.type === "collection" && s.id === "collection") return "all"
  if (s.type === "product" && /^(featured_?)?product(_?\d+)?$/i.test(String(s.id ?? ""))) return r.products[0].id
  return value
}

/*
  A BOUND SETTING, SAFELY. A setting whose value is a dynamic source (a
  Storelib pill, `{{ product.metafields.custom.material }}`, a Shopify
  dynamic source kept in the template) is read in the section's own scope,
  live and in the builder's canvas alike. What it reads is the store's data
  printed where the theme prints the setting, usually as it is, so:

    a text setting       every value is HTML-escaped (`| escape`)
    a rich text setting  the same, except a description or a page's content,
                         which is markup already cleaned when it was saved
                         (./objects.ts descriptionHtmlOf)
    a text setting fed   its words only (`| strip_html | escape`)
      a description
    a link               an address that is not one (javascript:) is "#"

  Storelib's own pill names read the theme's object where it has another
  name (lib/storelib-theme/dynamic.ts COMPAT_SOURCE_EXPR): `product.price`
  is the price formatted, as the pill says, not Shopify's cents.
*/
const BOUND_TEXT = new Set(["text", "textarea", "richtext", "inline_richtext", "html"])
const BOUND_RICH = new Set(["richtext", "inline_richtext", "html"])

const stripClosest = (e: string) => e.replace(/^closest\./, "")

/** One bound expression, as it is read for a setting of this type. */
export function boundExpression(expr: string, type: string): string {
  const e = expr.trim()
  const named = COMPAT_SOURCE_EXPR[e]
  const read = named ?? e
  if (!BOUND_TEXT.has(type)) return read
  const head = stripClosest(read.split("|")[0].trim())
  const markup = COMPAT_HTML_EXPRS.includes(head)
  if (markup && !read.includes("|")) return BOUND_RICH.has(type) ? read : `${read} | strip_html | escape`
  return `${read} | escape`
}

/** Text with bound expressions in it, each read as boundExpression says. */
export function boundText(src: string, type: string): string {
  return src.replace(/\{\{-?\s*([\s\S]+?)\s*-?\}\}/g, (_m, expr: string) => `{{ ${boundExpression(expr, type)} }}`)
}

/** A settings object: every declared setting, its stored value or its default, typed. */
export function typedSettings(schema: ShopifySetting[], stored: Record<string, unknown> | undefined, r: Resources, dyn?: DynamicResolver, opts: { exactProducts?: boolean } = {}): O {
  const exact = opts.exactProducts === true
  const out: O = {}
  const put = (id: string, type: string, raw: unknown) => {
    if (dyn && typeof raw === "string" && raw.includes("{{")) {
      const whole = raw.match(WHOLE)
      let done = false
      let cached: unknown
      Object.defineProperty(out, id, {
        enumerable: true,
        configurable: true,
        get: () => {
          if (done) return cached
          done = true
          const read = whole ? dyn.value(boundExpression(whole[1], type)) : dyn.text(boundText(raw, type))
          /* A bound link is an address or "#", never a script. */
          const said = read && typeof read === "object" && OUTPUT in (read as O) ? String((read as O)[OUTPUT] ?? "") : read
          const v = (type === "url" || type === "link") && typeof said === "string" ? safeHref(said) : read
          /* A colour named by a palette is a colour; the words of a heading stay words. */
          cached = (type === "color" || type === "color_background") && v && typeof v === "object" ? v : typeof v === "string" ? typedValue(type, v, r, exact) : v ?? typedValue(type, "", r, exact)
          return cached
        },
      })
      return
    }
    out[id] = typedValue(type, raw, r, exact)
  }
  const has = (k: string) => !!stored && Object.prototype.hasOwnProperty.call(stored, k)
  const used = new Set<string>()
  for (const s of schema) {
    if (!s.id) continue
    /* The builder stores `padding-block-start` as `padding_block_start`; the theme reads it by its own name. */
    const alt = s.id.replace(/-/g, "_")
    const key = has(s.id) ? s.id : has(alt) ? alt : null
    if (key) used.add(key)
    put(s.id, s.type, shopDefault(s, key ? stored![key] : s.default, r))
  }
  /* A stored value with no setting declared for it (a theme setting a section reads by name) passes through. */
  for (const [k, v] of Object.entries(stored ?? {})) if (!(k in out) && !used.has(k)) put(k, "text", v)
  return out
}

/** The theme's colour schemes (`settings.color_schemes`), each with its colours as colour objects. */
export function schemesObject(schemeSchema: { definition?: ShopifySetting[] } | undefined, stored: unknown): Record<string, O> {
  const out: Record<string, O> = {}
  const defs = schemeSchema?.definition ?? []
  const list = stored && typeof stored === "object" ? (stored as Record<string, { settings?: Record<string, unknown> }>) : {}
  for (const [id, scheme] of Object.entries(list)) {
    const settings: O = {}
    for (const d of defs) if (d.id) settings[d.id] = d.type === "color" || d.type === "color_background" ? (d.type === "color" ? colorObject(scheme.settings?.[d.id] ?? d.default) : scheme.settings?.[d.id] ?? d.default ?? "") : scheme.settings?.[d.id] ?? d.default
    for (const [k, v] of Object.entries(scheme.settings ?? {})) if (!(k in settings)) settings[k] = typeof v === "string" && /^#|^rgb/.test(v) ? colorObject(v) ?? v : v
    out[id] = { [OUTPUT]: id, id, settings }
  }
  return out
}

// ── Sections and blocks ──────────────────────────────────────────────────────

/** What `{{ block.shopify_attributes }}` prints: the marker Storelib's builder selects a block by. */
export function blockAttributes(id: string): string {
  return `data-block-id="${id.replace(/"/g, "")}"`
}

// ── The visitor's page ───────────────────────────────────────────────────────

/*
  THE WEBSITE'S LANGUAGES, for an imported theme (Settings › Markets and
  languages, lib/markets): the language this page is in, the website's own,
  and every published one. A theme's language selector, request.locale,
  shop.published_locales and routes.root_url all read it. Absent: one
  language, the theme's own, as before.
*/
export interface SiteI18n {
  /** The language this page is drawn in. */
  locale: string
  /** The website's own language: its addresses carry no prefix. */
  defaultLanguage: string
  /** Every published language, the website's own first. */
  languages: string[]
  /** The visitor's country and the currency prices are shown in, and every country offered (lib/markets, AC4). */
  country?: { code: string; name: string; currency: string }
  countries?: { code: string; name: string; currency: string }[]
  /** The theme's own words in this language as the store translated them (Translate › Theme words, `tw:<key>`), by locale key: read before the theme's own files. */
  words?: Record<string, string>
  /** Storelib's own words in this language (lib/markets/ui-words.ts, Translate › Shop words), approved only: what Storelib draws in the theme, the review widgets. */
  uiWords?: Record<string, string>
}

/** "/fr" for a language that is not the website's own, "" for it. */
export function localeRoot(i18n: SiteI18n | undefined, code = i18n?.locale): string {
  if (!i18n || !code || code.toLowerCase() === i18n.defaultLanguage.toLowerCase()) return ""
  return `/${code.toLowerCase()}`
}

function languageObject(code: string, i18n: SiteI18n | undefined): O {
  const iso = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/i.test(code) ? code : "en"
  const name = (() => { try { return new Intl.DisplayNames(["en"], { type: "language" }).of(iso) ?? iso } catch { return iso } })()
  const endonym = (() => { try { const n = new Intl.DisplayNames([iso], { type: "language" }).of(iso) ?? iso; return n.charAt(0).toLocaleUpperCase(iso) + n.slice(1) } catch { return iso } })()
  const primary = !i18n || iso.toLowerCase() === i18n.defaultLanguage.toLowerCase()
  return { [OUTPUT]: iso, iso_code: iso, name, endonym_name: endonym, primary, root_url: `${localeRoot(i18n, iso)}/` .replace(/^\/\/$/, "/") }
}

export function requestObject(pageType: string, path: string, designMode: boolean, host = "", lang = "en", i18n?: SiteI18n): O {
  const iso = i18n?.locale ?? (/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(lang) ? lang : "en")
  const lo = languageObject(iso, i18n)
  const name = String(lo.name)
  const endonym = String(lo.endonym_name)
  return {
    page_type: pageType,
    path,
    host,
    origin: host ? `https://${host}` : "",
    design_mode: designMode,
    visual_preview_mode: false,
    locale: { [OUTPUT]: iso, iso_code: iso, name, endonym_name: endonym, primary: lo.primary, root_url: lo.root_url, direction: /^(ar|he|fa|ur)\b/.test(iso) ? "rtl" : "ltr" },
  }
}

/** The routes in this page's language: /fr/cart, /fr/search… (every address of the website answers under its language's prefix). */
export function routesFor(i18n: SiteI18n | undefined): O {
  const root = localeRoot(i18n)
  if (!root) return SHOPIFY_ROUTES
  const out: O = {}
  for (const [k, v] of Object.entries(SHOPIFY_ROUTES)) out[k] = k === "root_url" ? `${root}/` : `${root}${String(v)}`
  return out
}

/** The website's published languages, as shop.published_locales. */
export function publishedLocales(i18n: SiteI18n | undefined, lang: string): O[] {
  if (!i18n) return [{ iso_code: lang, name: String(languageObject(lang, undefined).name), primary: true, root_url: "/" }]
  return i18n.languages.map((code) => {
    const o = languageObject(code, i18n)
    return { iso_code: o.iso_code, name: o.name, endonym_name: o.endonym_name, primary: o.primary, root_url: o.root_url }
  })
}

export const SHOPIFY_ROUTES: O = {
  root_url: "/",
  account_url: "/account",
  account_login_url: "/account/login",
  account_logout_url: "/account/logout",
  account_register_url: "/account/register",
  account_addresses_url: "/account/addresses",
  account_recover_url: "/account/recover",
  cart_url: "/cart",
  cart_add_url: "/cart/add",
  cart_change_url: "/cart/change",
  cart_clear_url: "/cart/clear",
  cart_update_url: "/cart/update",
  collections_url: "/collections",
  all_products_collection_url: "/collections/all",
  products_url: "/products",
  search_url: "/search",
  predictive_search_url: "/search/suggest",
  product_recommendations_url: "/recommendations/products",
  contact_url: "/contact",
  storefront_login_url: "/account/login",
}

/*
  Read by any spelling of its key: Shopify's options_by_name takes the
  option's name in any case (`options_by_name['Color']` and `['color']`).
  Its own keys are the lower case ones.
*/
function anyCase(o: O): O {
  return new Proxy(o, { get: (t, k) => (typeof k === "string" && !(k in t) ? t[k.toLowerCase()] : (t as Record<string | symbol, unknown>)[k]) })
}

/*
  Read once per currency and kept: every page context lists the store's
  countries, each with its currency's sign, and a formatter made for each
  was most of what reading a page's context cost (a header drawn again in
  the builder for each value of a slider read it every time; round 35,
  scripts/check-compat-live-edit.ts). The answer for a code never changes.
*/
const symbols = new Map<string, string>()

/** A currency's sign, as Shopify's currency.symbol gives it. */
export function currencySymbol(iso: string): string {
  const known = symbols.get(iso)
  if (known !== undefined) return known
  let sign: string
  try {
    const part = new Intl.NumberFormat("en", { style: "currency", currency: iso, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((p) => p.type === "currency")
    /* A sign in letters is the currency's own word, never a lone letter (lib/markets/money currencyWord). */
    sign = part && !/^\p{L}+$/u.test(part.value) ? part.value : (currencyWord(iso) ?? iso)
  } catch {
    sign = iso
  }
  if (symbols.size < 1000) symbols.set(iso, sign)
  return sign
}

/**
 * A country's flag as a picture that asks for nothing: an SVG written into
 * the page with the flag's emoji. It used to be the bare code ("DJ"), which
 * a browser asked the website for as /DJ, a whole page, once per country:
 * 250 renders at once on every page view, and the database fell over.
 */
const flags = new Map<string, string>()
export function flagImage(code: string): string {
  const known = flags.get(code)
  if (known !== undefined) return known
  const drawn = drawFlag(code)
  if (flags.size < 1000) flags.set(code, drawn)
  return drawn
}
function drawFlag(code: string): string {
  const cc = /^[A-Za-z]{2}$/.test(code) ? code.toUpperCase() : ""
  const emoji = cc ? String.fromCodePoint(...[...cc].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)) : ""
  /* FLAG_SVG_OPEN is how a live page finds its flags to load them when seen (./first-load.ts). */
  const svg = `${FLAG_SVG_OPEN} x="16" y="19" font-size="20" text-anchor="middle">${emoji}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export function localizationObject(currency: string, i18n?: SiteI18n, lang = "en"): O {
  const languages = (i18n?.languages ?? [lang]).map((c) => languageObject(c, i18n))
  const language = languages.find((l) => String(l.iso_code).toLowerCase() === (i18n?.locale ?? lang).toLowerCase()) ?? languages[0]
  const countryOf = (c: { code: string; name: string; currency: string }) => ({
    [OUTPUT]: c.code,
    /* `country | image_url` is its flag (Shopify's CDN there): drawn in the page itself, never an address on the website. */
    src: flagImage(c.code),
    iso_code: c.code,
    name: c.name,
    currency: { iso_code: c.currency, symbol: currencySymbol(c.currency), name: c.currency },
    unit_system: c.code === "US" || c.code === "LR" || c.code === "MM" ? "imperial" : "metric",
    available_languages: languages,
  })
  const countries = (i18n?.countries ?? []).map(countryOf)
  const country = i18n?.country ? countryOf(i18n.country) : countries[0] ?? countryOf({ code: "US", name: "United States", currency })
  return { country, language, available_countries: countries.length ? countries : [country], available_languages: languages, market: { id: "storelib", handle: "default" } }
}

/** A cart line, as the cart object's `items`. */
export interface CartLineLike {
  key: string
  productId: string
  variantId: string | null
  quantity: number
  product: O | null
  properties?: Record<string, string>
}

/**
 * THE CART'S DISCOUNT CODE, PRICED BY THE WEBSITE'S OWN CHECKOUT
 * (./cart-pricing-server.ts): what it takes off each line, in the cart's
 * money (cents of the currency the page shows), and whether it applies at
 * all. Shopify keeps a code that does not apply on the cart with
 * `applicable: false`, which is how a theme knows to say its own "can't be
 * applied"; so does this.
 *
 *   scope "cart"   a code for the whole order: a cart level discount
 *                  application, the lines' prices left as they are
 *   scope "lines"  a code for some products: each line it covers costs less
 */
export interface CartDiscount {
  code: string
  applicable: boolean
  valueType: "percentage" | "fixed_amount"
  /** The percentage (10 for 10%), or the amount in cents for a fixed code. */
  value: number
  scope: "cart" | "lines"
  /** Cents off each line, by the line's key. */
  lines: Record<string, number>
  total: number
  freeShipping: boolean
  /** Why it does not apply, in the checkout's words (never drawn by a theme; the checkout says it again). */
  error?: string | null
}

/**
 * THE STORE'S OFFERS ON THE CART, priced by the website's own checkout
 * (./cart-pricing-server.ts, lib/offers applyOffers): what each offer takes
 * off each line, in the cart's money (cents of the currency the page shows),
 * by the line's key. Shopify's automatic discounts: each is a line level
 * discount allocation of an application of type "automatic" named by the
 * offer (a quantity break by its tier's label), so a theme's cart drawer and
 * cart page draw "Buy 2 get 1 free -$36.00" under the line and the totals
 * after it, as checkout will charge them, without a script of its own.
 */
export interface CartOffers {
  lines: Record<string, { offerId: string; title: string; kind: string; tier?: number; amount: number }[]>
}

/** Shopify's discount_application for an automatic discount (one of the store's offers). */
export function offerApplication(o: { offerId: string; title: string; kind: string; tier?: number }, total: number): O {
  return {
    [OUTPUT]: o.title,
    type: "automatic",
    key: `${o.offerId}${o.tier !== undefined ? `:${o.tier}` : ""}`,
    title: o.title,
    description: null,
    value: total,
    value_type: "fixed_amount",
    target_selection: "entitled",
    target_type: "line_item",
    allocation_method: "across",
    total_allocated_amount: total,
    /* Which of the store's offers it is (Storelib's own, beside Shopify's fields). */
    offer_id: o.offerId,
    offer_kind: o.kind,
    ...(o.tier !== undefined ? { tier: o.tier } : {}),
  }
}

/** Shopify's discount_application for a code: what a theme's cart loops over for its "Discount (CODE) -$5.00" rows. */
export function discountApplication(d: CartDiscount): O {
  return {
    [OUTPUT]: d.code,
    type: "discount_code",
    key: d.code,
    title: d.code,
    description: null,
    value: d.value,
    value_type: d.valueType,
    target_selection: d.scope === "cart" ? "all" : "entitled",
    target_type: d.total === 0 && d.freeShipping ? "shipping_line" : "line_item",
    allocation_method: d.valueType === "percentage" ? "each" : "across",
    total_allocated_amount: d.total,
  }
}

export function cartObject(lines: CartLineLike[], currency: string, note = "", attributes: Record<string, string> = {}, discount: CartDiscount | null = null, taxesIncluded = false, offers: CartOffers | null = null): O {
  const applied = discount && discount.applicable ? discount : null
  const application = applied ? discountApplication(applied) : null
  /* Each offer's application once for the cart, its total over every line it is on (Shopify's cart.discount_applications). */
  const offerTotals = new Map<string, { o: { offerId: string; title: string; kind: string; tier?: number }; total: number }>()
  const offerKey = (o: { offerId: string; tier?: number }) => `${o.offerId}:${o.tier ?? ""}`
  const lineOffers = (key: string, line: number) => {
    let left = line
    return (offers?.lines[key] ?? []).flatMap((o) => {
      const amount = Math.max(0, Math.min(left, Math.round(o.amount)))
      if (amount <= 0) return []
      left -= amount
      const k = offerKey(o)
      const had = offerTotals.get(k)
      if (had) had.total += amount
      else offerTotals.set(k, { o, total: amount })
      return [{ ...o, amount }]
    })
  }
  const drafts = lines.flatMap((l) => {
    const product = l.product
    if (!product) return []
    const variants = (product.variants as O[]) ?? []
    const variant = (l.variantId ? variants.find((v) => v.id === l.variantId) : null) ?? (product.selected_or_first_available_variant as O) ?? variants[0]
    const price = Number(variant?.price ?? product.price ?? 0)
    const line = price * l.quantity
    return [{ l, product, variant, price, line, mine: lineOffers(l.key, line) }]
  })
  const items = drafts.map(({ l, product, variant, price, line, mine }, i) => {
    /* The store's offers first, on the line itself (Shopify's automatic discounts), as the checkout takes them before any code. */
    const offerOff = mine.reduce((n, o) => n + o.amount, 0)
    const offerAllocations = mine.map((o) => ({ amount: o.amount, discount_application: offerApplication(o, offerTotals.get(offerKey(o))?.total ?? o.amount) }))
    /* What the code takes off this line, after the offers: on the line itself for a code for some products, beside it for a code for the whole order (Shopify's split). */
    const off = application && applied ? Math.max(0, Math.min(line - offerOff, Math.round(applied.lines[l.key] ?? 0))) : 0
    const codeAllocations = off > 0 && application ? [{ amount: off, discount_application: application }] : []
    const allocations = [...offerAllocations, ...codeAllocations]
    const lineLevel = offerOff + (applied?.scope === "lines" ? off : 0)
    const finalLine = line - lineLevel
    const finalUnit = l.quantity > 0 ? Math.round(finalLine / l.quantity) : price
    return {
      [OUTPUT]: String(product.title),
      id: String(variant?.id ?? product.id),
      key: l.key,
      /* From 0: Horizon writes `line_index | plus: 1` for the line's number. */
      index: i,
      quantity: l.quantity,
      title: `${String(product.title)}${variant && variant.title !== "Default Title" ? ` - ${String(variant.title)}` : ""}`,
      product,
      product_id: product.id,
      variant,
      variant_id: variant?.id ?? product.id,
      url: String(variant?.url ?? product.url),
      /* The chosen variant's own photo, else the product's: the colour in the cart is the colour chosen, as on Shopify. */
      image: variant?.featured_image ?? product.featured_image ?? null,
      featured_image: variant?.featured_image ?? product.featured_image ?? null,
      price,
      original_price: price,
      final_price: finalUnit,
      line_price: line,
      original_line_price: line,
      final_line_price: finalLine,
      discounted_price: finalUnit,
      line_level_discount_allocations: [...offerAllocations, ...(applied?.scope === "lines" ? codeAllocations : [])],
      line_level_total_discount: lineLevel,
      discount_allocations: allocations,
      total_discount: offerOff + off,
      /* The code's part alone, for the cart level discount below. */
      code_discount: off,
      properties: hashOf(l.properties ?? {}),
      options_with_values: ((product.options as string[]) ?? []).map((name, p) => ({ name, value: (variant?.options as string[] | undefined)?.[p] ?? "" })).filter((o) => variant && variant.title !== "Default Title" && o.value),
      selling_plan_allocation: null,
      requires_shipping: variant?.requires_shipping === true,
      unit_price: null,
      unit_price_measurement: null,
      sku: typeof variant?.sku === "string" ? variant.sku : "",
      vendor: "",
      gift_card: false,
      has_components: false,
      quantity_rule: { min: 1, max: null, increment: 1 },
      error_message: null,
      /* A theme's Remove link and its quantity link without a script (./site.ts answers GET /cart/change). */
      url_to_remove: `/cart/change?id=${encodeURIComponent(l.key)}&quantity=0`,
    }
  })
  const subtotal = items.reduce((s, i) => s + Number(i.final_line_price), 0)
  const original = items.reduce((s, i) => s + Number(i.original_line_price), 0)
  /* A code for the whole order comes off after the lines, as Shopify's cart level discounts do. */
  const cartLevel = applied?.scope === "cart" ? Math.min(subtotal, items.reduce((s, i) => s + Number(i.code_discount), 0)) : 0
  const automatic = [...offerTotals.values()].map((x) => offerApplication(x.o, x.total))
  const total = subtotal - cartLevel
  return {
    items,
    item_count: items.reduce((s, i) => s + Number(i.quantity), 0),
    items_subtotal_price: subtotal,
    total_price: total,
    original_total_price: original,
    total_discount: original - total,
    total_weight: 0,
    cart_level_discount_applications: application && applied?.scope === "cart" ? [{ ...application, total_allocated_amount: cartLevel }] : application && applied && applied.total === 0 ? [application] : [],
    discount_applications: [...automatic, ...(application ? [application] : [])],
    /* Every code the cart holds, applying or not (Shopify's cart.discount_codes). */
    discount_codes: discount ? [{ code: discount.code, applicable: discount.applicable, [OUTPUT]: discount.code }] : [],
    currency: { iso_code: currency, symbol: currencySymbol(currency), name: currency, [OUTPUT]: currency },
    note,
    /* `cart.attributes['Gift message']`, as the theme set them with /cart/update (./site.ts). */
    attributes: { ...attributes },
    empty: items.length === 0,
    requires_shipping: items.some((i) => i.requires_shipping),
    checkout_charge_amount: total,
    duties_included: false,
    /* The store's own setting (Settings › Taxes, prices include tax), as Shopify's is the shop's: a theme's cart footer reads it for "Taxes included" against "Taxes and shipping calculated at checkout". */
    taxes_included: taxesIncluded,
  }
}

/**
 * A hash as Liquid loops over one: `{% for p in item.properties %}` gives
 * [name, value] pairs, so `p.first` is the name and `p.last` the value. The
 * pairs are held where neither a key read, `size`, `empty` nor `json` sees
 * them; a plain object looped as its values printed "B: e" (the first and
 * last letters of "Bundle") under a cart line.
 */
export function hashOf<T extends Record<string, unknown>>(o: T): T {
  const out = { ...o }
  Object.defineProperty(out, "__list__", { value: Object.entries(o), enumerable: false })
  return out
}

