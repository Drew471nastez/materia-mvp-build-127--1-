/**
 * ===========================================================================
 *  STORELIB REVIEWS WIDGETS: WHAT THEY ARE, AND WHAT A SAVED ONE MAY HOLD
 * ===========================================================================
 * A review widget is an ordinary section of the website's theme
 * (themes/default/sections/reviews_*.storelib), in Add section under Apps ›
 * Reviews, drawn by the same renderer as every other section from the data
 * lib/reviews/storefront.ts hands it: published reviews only, never sample
 * ones on a live page. Placed, it is saved with the theme like any section,
 * so it moves, hides and goes with the page as they do.
 *
 * Reviews › Widgets (app/app/reviews/widgets) shows each one drawn with the
 * store's own reviews and lets the store save named settings for it, a
 * preset (run-now part 190, review_widget_presets). A preset is a copy of
 * some of a section's settings, nothing more: placing the widget copies it
 * into the new section, and removing the section from a page leaves the
 * preset where it was.
 *
 * Two template filters pick what a widget shows (lib/storelib-theme/
 * storelib/template.ts calls these):
 *
 *   reviews | review_scope: settings.scope
 *       a list of one: this page's reviews ("here": the product's on its
 *       page, the shop's anywhere else) or the whole shop's ("all"), so a
 *       template names the scope once: {% for s in reviews | review_scope: settings.scope %}
 *   s.items | review_list: settings.sort, settings.min_rating, settings.media
 *       those reviews in the widget's order, from the lowest rating it
 *       shows, and with photos only when it asks
 *
 * Pure: no database and no server modules, so the gallery, the routes, the
 * editor and the tests share it.
 */
import { featuredOf, sortReviews, summaryOf, type StorefrontReview, type StorefrontReviewSummary } from "./storefront"

export type WidgetSort = "featured" | "newest" | "highest" | "lowest" | "photos"
export const WIDGET_SORTS: readonly WidgetSort[] = ["featured", "newest", "highest", "lowest", "photos"]

/** Where a widget fits best, which is the page the placement step offers first. */
export type WidgetPage = "product" | "home" | "any"

export interface ReviewWidget {
  /** The section type, which is also the widget's id in an address (?add=reviews_carousel). */
  type: string
  /** What the gallery and Add section call it. Shown through tt() in the dashboard. */
  name: string
  /** One plain line on what it shows. */
  description: string
  page: WidgetPage
  /** The ones an imported (Shopify) theme has too, as Storelib sections of its own (compat/storelib-reviews.ts). */
  compat?: string
}

/**
 * Every widget, in the order the gallery lists them. The names are the
 * section schemas' own (`name` in each file's <schema>), which the test
 * holds them to, so the editor and the gallery never disagree.
 */
export const REVIEW_WIDGETS: readonly ReviewWidget[] = [
  { type: "reviews_product", name: "Product reviews", description: "The product's rating, its reviews and a form to write one. Anywhere but a product page it shows the whole shop's.", page: "product", compat: "storelib-reviews" },
  { type: "reviews_badge", name: "Star rating", description: "The stars and how many reviews, in one line that jumps to the reviews.", page: "product", compat: "storelib-reviews-stars" },
  { type: "reviews_summary", name: "Rating summary", description: "The average, the stars and a bar for each rating, with a link to every review.", page: "any" },
  { type: "reviews_grid", name: "Review grid", description: "Reviews as cards in columns, or stacked at their own heights.", page: "any" },
  { type: "reviews_carousel", name: "Reviews carousel", description: "A row of reviews that scrolls sideways.", page: "home" },
  { type: "reviews_testimonials", name: "Testimonials", description: "A few reviews as large quotes, one at a time or side by side.", page: "home" },
  { type: "reviews_media", name: "Photo reviews", description: "The reviews buyers added photos to, as a gallery.", page: "any" },
  { type: "reviews_marquee", name: "Reviews marquee", description: "Short reviews that drift across the page in a loop.", page: "home" },
  { type: "reviews_trust", name: "Trust badge", description: "The shop's rating as a small badge or a full width bar.", page: "any" },
  { type: "reviews_all", name: "All reviews", description: "Every review of the shop with the product each is about, for a reviews page.", page: "any" },
]

export const REVIEW_WIDGET_TYPES: readonly string[] = REVIEW_WIDGETS.map((w) => w.type)

/** The widget an address names: `reviews_carousel`, or `reviews-carousel` as a person types it. Null for anything else. */
export function widgetFromParam(raw: unknown): ReviewWidget | null {
  if (typeof raw !== "string") return null
  const type = raw.trim().toLowerCase().replace(/-/g, "_")
  return REVIEW_WIDGETS.find((w) => w.type === type) ?? null
}

/* ── The two filters ─────────────────────────────────────────────────── */

export interface ReviewScope {
  scope: "product" | "shop"
  product_id: string
  summary: StorefrontReviewSummary
  items: StorefrontReview[]
  /** The featured ones, or the four and five star ones when none is (featuredOf). */
  featured_items: StorefrontReview[]
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** `reviews | review_scope: "here" | "all"`: the one scope, as a list of one. Nothing when the reviews are not there. */
export function reviewScope(reviews: unknown, which: unknown): ReviewScope[] {
  const r = obj(reviews)
  const src = obj(which === "all" ? r.all : r.here ?? r.all)
  const summary = src.summary as StorefrontReviewSummary | undefined
  if (!summary || !Array.isArray(src.items)) return []
  const items = src.items as StorefrontReview[]
  const scope = src.scope === "product" ? "product" : "shop"
  return [{ scope, product_id: typeof src.product_id === "string" ? src.product_id : "", summary, items, featured_items: Array.isArray(src.featured_items) ? (src.featured_items as StorefrontReview[]) : featuredOf(items) }]
}

/** `items | review_list: sort, min_rating, media`: the reviews a widget shows, in its order. */
export function reviewList(items: unknown, sort: unknown, minRating: unknown, media: unknown): StorefrontReview[] {
  if (!Array.isArray(items)) return []
  const min = Math.max(1, Math.min(5, Math.round(Number(minRating) || 1)))
  const order = (WIDGET_SORTS as readonly unknown[]).includes(sort) ? (sort as WidgetSort) : "featured"
  const onlyPhotos = media === true || media === "photos"
  const kept = (items as StorefrontReview[]).filter((r) => r && typeof r === "object" && Number(r.rating) >= min && (!onlyPhotos || r.has_photos))
  /* "app": the order Storelib Reviews' own setting already put them in (a section saved before it had an order of its own). */
  if (sort === "app") return kept
  return sortReviews(kept, order)
}

/* ── Sample reviews, for a preview only ──────────────────────────────── */

/** A flat picture standing in for a buyer's photo: a soft colour and a shape, as an SVG data address. */
function samplePhoto(hue: number, shape: number): string {
  const bg = `hsl(${hue} 32% 86%)`
  const fg = `hsl(${hue} 28% 58%)`
  const mark = shape === 0
    ? `<circle cx="80" cy="74" r="34" fill="${fg}"/><rect x="38" y="116" width="84" height="12" rx="6" fill="${fg}" opacity=".5"/>`
    : shape === 1
      ? `<rect x="44" y="40" width="72" height="88" rx="10" fill="${fg}"/>`
      : `<path d="M30 124 L70 64 L96 100 L112 82 L134 124 Z" fill="${fg}"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" fill="${bg}"/>${mark}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/**
 * The store's reviews as a preview draws them when it has none yet: the
 * canvas's sample reviews (lib/reviews/storefront.ts sampleStorefrontReviews,
 * marked `sample`), with two more and pictures on three, so the photo
 * gallery and the marquee have something to show. For Reviews › Widgets and
 * Add section's cards only: a live page is never handed sample reviews.
 */
export function sampleWidgetReviews<T extends { sample: boolean; all: { summary: StorefrontReviewSummary; items: StorefrontReview[]; featured_items: StorefrontReview[] }; here: { summary: StorefrontReviewSummary; items: StorefrontReview[] }; product: { summary: StorefrontReviewSummary; items: StorefrontReview[] } | null }>(base: T): T {
  if (!base.sample) return base
  const more: StorefrontReview[] = [
    { ...base.all.items[0], id: "sample-4", rating: 5, title: "Lovely detail", body: "Arrived quickly and looks even better in person.", author: "Elena V.", initial: "E", featured: false, reply: "" },
    { ...base.all.items[0], id: "sample-5", rating: 4, title: "Good value", body: "Does the job well. I would buy it again.", author: "Tom B.", initial: "T", featured: false, reply: "" },
  ]
  const photos: Record<string, string[]> = {
    "sample-0": [samplePhoto(24, 0), samplePhoto(200, 1)],
    "sample-2": [samplePhoto(140, 2)],
    "sample-4": [samplePhoto(320, 1)],
  }
  const dress = (r: StorefrontReview): StorefrontReview => (photos[r.id] ? { ...r, photos: photos[r.id], has_photos: true } : r)
  const items = [...base.all.items, ...more].map(dress)
  const summary = summaryOf(items.map((r) => r.rating))
  const out = { ...base, all: { ...base.all, summary, items, featured_items: featuredOf(items) } }
  out.here = { ...base.here, summary, items }
  if (base.product) out.product = { ...base.product, summary, items }
  return out
}

/* ── Presets ─────────────────────────────────────────────────────────── */

export const MAX_PRESET_NAME = 60
/** A store keeps at most this many saved widgets, across every kind. */
export const MAX_PRESETS = 60
/** The stored settings stay small: a preset is a few dozen values. */
export const MAX_PRESET_BYTES = 6000

export interface WidgetPreset {
  id: string
  widget: string
  name: string
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

/** What a preset may hold for one setting: the shape a section setting of that type has. */
export interface PresetField {
  id: string
  type: string
  options?: { value: string }[]
  min?: number
  max?: number
  responsive?: boolean
}

/** A preset's name: one line, trimmed, at most MAX_PRESET_NAME characters. Null when nothing is left. */
export function cleanPresetName(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const s = raw.replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_PRESET_NAME)
  return s || null
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const SCHEME_REF = /^scheme\.[a-z0-9_]+$/i

function cleanRange(v: unknown, f: PresetField): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN
  if (!Number.isFinite(n)) return undefined
  const lo = typeof f.min === "number" ? f.min : -1e6
  const hi = typeof f.max === "number" ? f.max : 1e6
  return Math.min(hi, Math.max(lo, n))
}

/**
 * What a preset keeps of the settings it was sent: only the section's own
 * setting ids, each the right kind of value (a colour a colour, a choice one
 * of its options, a number inside its range), so nothing stored can draw a
 * section its schema does not describe. Headings and labels are the store's
 * words and are kept as written; the website translates them like any other
 * section text.
 */
export function cleanPresetSettings(raw: unknown, fields: readonly PresetField[]): Record<string, unknown> {
  const input = obj(raw)
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    if (!(f.id in input) || f.type === "header") continue
    const v = input[f.id]
    switch (f.type) {
      case "text":
      case "textarea":
        if (typeof v === "string") out[f.id] = v.replace(/\u0000/g, "").slice(0, f.type === "text" ? 300 : 2000)
        break
      case "toggle":
      case "checkbox":
        if (typeof v === "boolean") out[f.id] = v
        break
      case "select":
      case "radio":
      case "color_scheme":
        if (typeof v === "string" && v.length <= 64 && (f.type === "color_scheme" || !f.options || f.options.some((o) => o.value === v))) out[f.id] = v
        break
      case "color":
        if (v === "" || (typeof v === "string" && (HEX.test(v) || SCHEME_REF.test(v)))) out[f.id] = typeof v === "string" ? v.toLowerCase() : v
        break
      case "range":
      case "number": {
        if (f.responsive && v && typeof v === "object") {
          const r = obj(v)
          const each: Record<string, number> = {}
          for (const k of ["desktop", "tablet", "mobile"]) {
            const n = cleanRange(r[k], f)
            if (n !== undefined) each[k] = n
          }
          if (Object.keys(each).length) out[f.id] = each
        } else {
          const n = cleanRange(v, f)
          if (n !== undefined) out[f.id] = n
        }
        break
      }
      default:
        break
    }
  }
  return out
}

/** Only what differs from the section's defaults: what a preset or an address carries. */
export function changedSettings(settings: Record<string, unknown>, defaults: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(settings)) if (JSON.stringify(v) !== JSON.stringify(defaults[k])) out[k] = v
  return out
}

/* ── Settings carried in an address ──────────────────────────────────── */

/**
 * "Add to website" with settings that were never saved as a preset carries
 * the changed ones in the editor's address, as base64url JSON. Small by
 * construction (only what differs from the defaults), and read back through
 * cleanPresetSettings, so an address somebody edited by hand can only set
 * what a preset could.
 */
export function encodeWidgetSettings(settings: Record<string, unknown>): string {
  const json = JSON.stringify(settings)
  const bytes = new TextEncoder().encode(json)
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function decodeWidgetSettings(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 8000 || !/^[A-Za-z0-9_-]+$/.test(raw)) return {}
  try {
    const bin = atob(raw.replace(/-/g, "+").replace(/_/g, "/"))
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return obj(JSON.parse(new TextDecoder().decode(bytes)))
  } catch {
    return {}
  }
}

/* ── Where "Add to website" puts it ──────────────────────────────────── */

export type PlacementPage = "product" | "home"
export type PlacementAt = "top" | "after_product" | "bottom" | "choose"

/** The editor's address for placing a widget: its page, where on it, and the settings it starts with. */
export function editorAddUrl(installId: string, input: { type: string; page: PlacementPage | "other"; at: PlacementAt; presetId?: string | null; settings?: Record<string, unknown> | null }): string {
  const q = new URLSearchParams()
  q.set("add", input.type)
  if (input.page === "product") q.set("page", "product")
  else if (input.page === "home") q.set("page", "home")
  q.set("at", input.page === "other" ? "choose" : input.at)
  if (input.presetId) q.set("preset", input.presetId)
  else if (input.settings && Object.keys(input.settings).length) q.set("settings", encodeWidgetSettings(input.settings))
  return `/website-builder/editor/${encodeURIComponent(installId)}?${q.toString()}`
}

/** The placement an address asks for, read back by the editor. */
export function readPlacement(params: URLSearchParams): { widget: ReviewWidget; at: PlacementAt; presetId: string | null; settings: Record<string, unknown> } | null {
  const widget = widgetFromParam(params.get("add"))
  if (!widget) return null
  const at = params.get("at")
  const presetId = params.get("preset")
  return {
    widget,
    at: at === "top" || at === "after_product" || at === "bottom" ? at : "choose",
    presetId: presetId && /^[0-9a-f-]{36}$/i.test(presetId) ? presetId : null,
    settings: decodeWidgetSettings(params.get("settings")),
  }
}

/**
 * Where in a page's sections a placed widget goes: at the top (under the
 * header), right under the product section, or at the bottom (above the
 * footer). `bodyStart` and `bodyEnd` are the page's own sections, between
 * its header and footer groups. Under the product falls back to the bottom
 * on a page with no product section.
 */
export function placementIndex(types: readonly string[], at: PlacementAt, bodyStart: number, bodyEnd: number): number {
  if (at === "top") return bodyStart
  if (at === "after_product") {
    const i = types.findIndex((t, n) => n >= bodyStart && n < bodyEnd && t === "product")
    if (i >= 0) return i + 1
  }
  return bodyEnd
}
