/**
 * ===========================================================================
 *  THE PRODUCT SHEET'S OPTIONS, PICTURES AND PRICE, WITHOUT REACT
 * ===========================================================================
 * Round 43, the owner: "make the product sheet complete and smooth: the media
 * gallery works 100%, variant options selectable with colour swatches, image
 * swatches and size selectors as the product defines, the size chart, the
 * compare-at price and a sale badge, personalization, quantity".
 *
 * The sheet (components/onepage/product-sheet.tsx) is handed the facts
 * /api/onepage/product answers (components/checkout/instant-checkout
 * ProductFacts). A product that ships now carries what its product page
 * knows: its options (Size, Colour, with the seller's own swatches), each
 * variant's option values, picture, compare at price and whether it can be
 * bought. This turns those facts into the shape the product page's own
 * rules take (lib/products/product-page-model: pickerOptions, choose,
 * variantFor, valueAvailable), so the sheet and the product page choose a
 * variant by exactly the same rules:
 *
 *   valued     a product whose variants carry option values ("M / Navy"):
 *              one row per option, the first variant that can be bought
 *              chosen at the start, as the product page opens
 *   by name    a download's licences, or variants with names only: one row
 *              of their names, and none chosen for the buyer when there are
 *              two or more (the price differs, so the buyer picks)
 *
 * How each option's values are drawn (`optionLook`): a colour option, or any
 * value the seller gave a swatch, as swatches (a colour, or the photo of a
 * variant with that value); everything else as size pills. Pure, for tests.
 */
import type { ProductFacts } from "@/components/checkout/instant-checkout"
import {
  imageKey,
  initialChoice,
  isColorOption,
  pickerOptions,
  valuePrefersPhoto,
  valueSwatchColor,
  type ProductOptionData,
  type ProductSectionData,
  type ProductVariantData,
} from "@/lib/products/product-page-model"

export type SheetModel = Pick<ProductSectionData, "options" | "variants">
type FactsProduct = ProductFacts["product"]

/** The facts, as the product page's own option rules take them. */
export function sheetModel(p: Pick<FactsProduct, "variants" | "options">): SheetModel {
  return {
    options: (p.options ?? []).map((o) => ({ name: o.name, values: o.values, ...(o.swatches ? { swatches: o.swatches } : {}) })),
    variants: p.variants.map(
      (v): ProductVariantData => ({
        id: v.id,
        name: v.name,
        options: v.options && v.options.length ? v.options : [null, null, null],
        price_cents: v.priceCents,
        compare_at_cents: typeof v.compareAtCents === "number" && v.compareAtCents > v.priceCents ? v.compareAtCents : null,
        image_url: v.imageUrl ?? null,
        available: v.available !== false,
        left: typeof v.left === "number" ? v.left : null,
        max_quantity: typeof v.maxQuantity === "number" && v.maxQuantity > 0 ? v.maxQuantity : 99,
        pay_what_you_want: v.pwyw,
        pwyw_min_price_cents: null,
        pwyw_suggested_price_cents: null,
      }),
    ),
  }
}

/** The variants carry option values (Size, Colour), rather than names alone. */
export function sheetValued(m: SheetModel): boolean {
  return (m.options ?? []).some((o) => o.values.length > 0) || (m.variants ?? []).some((v) => v.options.some((x) => typeof x === "string" && x !== ""))
}

/**
 * What the sheet opens on. One variant: it, chosen for the buyer. Valued options: the first variant that can be
 * bought, as the product page opens. Two or more named variants (licences): none, the buyer picks.
 */
export function sheetStartChoice(m: SheetModel): (string | null)[] {
  const variants = m.variants ?? []
  if (!variants.length) return []
  if (variants.length === 1 && !sheetValued(m)) return [variants[0].name]
  if (variants.length === 1 || sheetValued(m)) return initialChoice(m)
  return pickerOptions(m).map(() => null)
}

export type OptionLook = "swatch" | "pill"

/** How an option's values are drawn: swatches for a colour (or values the seller gave a swatch), else pills. */
export function optionLook(option: ProductOptionData): OptionLook {
  if (isColorOption(option.name)) return "swatch"
  if (option.swatches && Object.keys(option.swatches).length) return "swatch"
  return "pill"
}

export type ValueSwatch = { kind: "color"; color: string } | { kind: "photo"; src: string } | { kind: "word" }

/**
 * One value's swatch: the seller's own colour, else the colour its name says ("Navy", "Dark green"); the photo of a
 * variant with that value when the seller asked for it or the name is no colour ("Ocean"); else its word on a pill.
 */
export function valueSwatch(option: ProductOptionData, index: number, value: string, m: SheetModel): ValueSwatch {
  const photo = () => (m.variants ?? []).find((v) => v.options[index] === value && v.image_url)?.image_url ?? null
  if (valuePrefersPhoto(value, option.swatches)) {
    const src = photo()
    return src ? { kind: "photo", src } : { kind: "word" }
  }
  const color = valueSwatchColor(value, option.swatches)
  if (color) return { kind: "color", color }
  const src = photo()
  return src ? { kind: "photo", src } : { kind: "word" }
}

/** Whether an option is the size one, where the size guide opens. */
export function isSizeOption(name: string): boolean {
  return /\b(sizes?|größe|taille|talla|taglia|rozmiar|tamanho|maat)\b/i.test(name)
}

/** The pictures: the product's, then any variant's own that is not already there, each once. */
export function sheetImages(productImages: readonly string[], m: SheetModel, fallback?: string | null): string[] {
  /* The product's own come as the server checked them; only a variant's own picture is added, once. */
  const out: string[] = []
  const seen = new Set<string>()
  for (const u of [...productImages, ...(m.variants ?? []).map((v) => v.image_url)]) {
    if (typeof u !== "string" || !u.trim()) continue
    const key = imageKey(u)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(u.trim())
    if (out.length >= 24) break
  }
  return out.length ? out : fallback ? [fallback] : []
}

/** Where a variant's own picture is among them, or -1. */
export function sheetImageFor(images: readonly string[], variant: Pick<ProductVariantData, "image_url"> | null | undefined): number {
  if (!variant?.image_url) return -1
  const key = imageKey(variant.image_url)
  return images.findIndex((u) => imageKey(u) === key)
}

/** The whole percent saved, for the sale badge: "Save 24%". Null when nothing is saved or the figures are odd. */
export function savedPercent(nowCents: number, wasCents: number | null | undefined): number | null {
  const was = Number(wasCents) || 0
  if (!(was > 0) || !(nowCents >= 0) || was <= nowCents) return null
  const pct = Math.round(((was - nowCents) / was) * 100)
  return pct >= 1 && pct <= 99 ? pct : null
}

/*
 * ROUND 53, THE GALLERY. "A bit taller on a phone, closer to Shopify's 4:5, and no crop surprises": the box is 4:5 on
 * a phone (square in its column on a computer), and each picture or video fills it only when that cuts little of it.
 * A landscape photo in a portrait box would lose its sides, so it is drawn whole on the gallery's ground instead.
 */

/** The gallery's box, width over height: 4:5 on a phone, square beside the details on a computer. */
export const SHEET_PHONE_RATIO = 4 / 5
export const SHEET_COLUMN_RATIO = 1

/**
 * ROUND W8, THE SQUARE. "The main product image is tall/portrait": the sheet's gallery is a square on a phone and on
 * a computer, the full width of the sheet's content, every picture filling it (object-cover) like the thumbnails
 * under it. SHEET_PHONE_RATIO and sheetFrameRatio stay for what still reads them; the gallery reads this.
 */
export const SHEET_GALLERY_RATIO = 1

/**
 * THE GALLERY'S FRAME (round AK): the first picture's own shape, once its padding is off (lib/images/letterbox), kept
 * between 9:16 and 1.91:1, and the same for every slide, so a swipe never resizes the sheet. Until that shape is
 * known, the box above. The other slides fill it when little is lost (mediaFit) and sit whole over a soft fill of
 * themselves when much would be.
 */
export const SHEET_FRAME_MIN = 9 / 16
export const SHEET_FRAME_MAX = 1.91

export function sheetFrameRatio(firstShown: number | null | undefined, fallback: number): number {
  if (typeof firstShown !== "number" || !(firstShown > 0) || !Number.isFinite(firstShown)) return fallback
  return Math.min(SHEET_FRAME_MAX, Math.max(SHEET_FRAME_MIN, firstShown))
}

/** At most this share of a picture is cut off to fill the box; past it the picture is drawn whole. */
export const SHEET_MAX_CROP = 0.2

/** How a picture or video of this size sits in a box of `box` (width over height): filled, or whole. */
export function mediaFit(width: number, height: number, box: number): "cover" | "contain" {
  if (!(width > 0) || !(height > 0) || !(box > 0)) return "cover"
  const r = width / height
  const kept = Math.min(r / box, box / r)
  return 1 - kept <= SHEET_MAX_CROP + 1e-9 ? "cover" : "contain"
}

/** From one dot's centre to the next: 6px dots, 6px apart. The lit dot moves this far for each slide scrolled. */
export const DOT_STEP_PX = 12

/** Where the lit dot stands for a scroll, in slides (a fraction while it moves), between the first and the last. */
export function dotPosition(scrollLeft: number, slideWidth: number, count: number): number {
  if (!(slideWidth > 0) || count < 2) return 0
  return Math.max(0, Math.min(count - 1, scrollLeft / slideWidth))
}
