/**
 * ===========================================================================
 *  STORELIB REVIEWS WIDGETS: WHAT A WIDGET IS, AND WHAT IT MAY BE SET TO
 * ===========================================================================
 * A widget is one way of showing the store's reviews on its website: the
 * product's reviews under the product, the stars under a title, a grid, a
 * carousel, a strip that scrolls by. Each has a look the store sets in
 * Storelib Reviews › Widgets and saves under a name (a "configuration",
 * review_widget_configs, run-now part 216), and a section on a page names
 * the configuration it draws with and may change a few things for that
 * page only (`overrides`).
 *
 * EVERY VALUE IS FROM A LIST OR A RANGE. Settings end up in a style
 * attribute and a stylesheet, so a colour is a hex colour or nothing, a
 * size is a number clamped to its range, a font is one of a few named
 * stacks, a choice is one of its options. Anything else is dropped and the
 * default stands. Text (a heading, a label) is kept as plain words and
 * escaped wherever it is printed. Nothing a merchant types reaches CSS.
 *
 * Pure: no database, no React, the same in the gallery, the builder and on
 * the website.
 */

export const WIDGET_TYPES = [
  "product_reviews",
  "star_badge",
  "rating_summary",
  "grid",
  "carousel",
  "testimonials",
  "media_wall",
  "marquee",
  "trust_badge",
] as const

export type WidgetType = (typeof WIDGET_TYPES)[number]

export function isWidgetType(v: unknown): v is WidgetType {
  return typeof v === "string" && (WIDGET_TYPES as readonly string[]).includes(v)
}

/** Where the widget goes when it is added to a website without being told: Add to website, the product page or the home page. */
export type WidgetHome = "product" | "home"

export interface WidgetInfo {
  type: WidgetType
  name: string
  description: string
  home: WidgetHome
}

/** In the order the gallery lists them. Plain names, the way a store owner would say them. */
export const WIDGET_INFO: Record<WidgetType, WidgetInfo> = {
  product_reviews: { type: "product_reviews", name: "Product reviews", description: "The rating, the reviews and a form to write one, under the product.", home: "product" },
  star_badge: { type: "star_badge", name: "Star rating", description: "Stars and the number of reviews under a product's name. Jumps to the reviews.", home: "product" },
  rating_summary: { type: "rating_summary", name: "Rating summary", description: "The average and how many reviews got each number of stars.", home: "product" },
  grid: { type: "grid", name: "Reviews grid", description: "Reviews in columns, with photos when they have them.", home: "home" },
  carousel: { type: "carousel", name: "Reviews carousel", description: "A row of reviews that slides sideways, by swipe or by itself.", home: "home" },
  testimonials: { type: "testimonials", name: "Testimonials", description: "A few of your best reviews, large, with the buyer's name.", home: "home" },
  media_wall: { type: "media_wall", name: "Photo reviews", description: "A wall of the photos buyers sent with their reviews.", home: "home" },
  marquee: { type: "marquee", name: "Review strip", description: "Short reviews scrolling past in a thin strip. Stops when someone hovers.", home: "home" },
  trust_badge: { type: "trust_badge", name: "Trust badge", description: "\"4.8 from 1,200 reviews\" as a line or a banner.", home: "home" },
}

/* ── The settings ──────────────────────────────────────────────────────── */

export type StarShape = "sharp" | "rounded" | "outline"
export type FontChoice = "theme" | "sans" | "serif" | "rounded" | "mono"
export type CardStyle = "card" | "outline" | "plain"
export type WidgetSort = "featured" | "newest" | "highest" | "lowest" | "photos"
export type WidgetScope = "auto" | "shop"
export type Align = "left" | "center"
export type BadgeLayout = "inline" | "banner"

export interface WidgetSettings {
  /* Words */
  heading: string
  subheading: string
  align: Align
  /* Colours: a hex colour, or "" to take the theme's */
  star_color: string
  text_color: string
  muted_color: string
  background: string
  card_color: string
  border_color: string
  button_color: string
  button_text: string
  /* Type */
  font: FontChoice
  heading_size: number
  text_size: number
  /* Stars */
  star_shape: StarShape
  star_size: number
  /* Box */
  card_style: CardStyle
  border_width: number
  radius: number
  gap: number
  card_padding: number
  padding_top: number
  padding_bottom: number
  max_width: number
  /* Layout */
  columns: number
  columns_mobile: number
  limit: number
  rows_before_more: number
  autoplay: boolean
  autoplay_seconds: number
  marquee_seconds: number
  badge_layout: BadgeLayout
  /* What a review shows */
  show_name: boolean
  show_date: boolean
  show_verified: boolean
  show_product: boolean
  show_photos: boolean
  show_reply: boolean
  show_title: boolean
  show_summary: boolean
  show_bars: boolean
  show_write: boolean
  show_count: boolean
  show_average: boolean
  /* Which reviews, in what order */
  sort: WidgetSort
  scope: WidgetScope
  min_rating: number
  only_with_text: boolean
  only_with_media: boolean
  /* When there are none */
  hide_when_empty: boolean
  /** The widget's words, per language: `{ default: { write_a_review: "Leave a review" }, fr: { ... } }`. The store's own words win over the dictionary. */
  labels: Record<string, Record<string, string>>
}

export type NumberKey = { [K in keyof WidgetSettings]: WidgetSettings[K] extends number ? K : never }[keyof WidgetSettings]
export type BoolKey = { [K in keyof WidgetSettings]: WidgetSettings[K] extends boolean ? K : never }[keyof WidgetSettings]

/** Each number's range, and its step for a slider. */
export const NUMBER_RANGES: Record<NumberKey, { min: number; max: number; step: number }> = {
  heading_size: { min: 14, max: 56, step: 1 },
  text_size: { min: 12, max: 22, step: 1 },
  star_size: { min: 10, max: 40, step: 1 },
  border_width: { min: 0, max: 4, step: 1 },
  radius: { min: 0, max: 32, step: 1 },
  gap: { min: 0, max: 48, step: 2 },
  card_padding: { min: 0, max: 48, step: 2 },
  padding_top: { min: 0, max: 160, step: 4 },
  padding_bottom: { min: 0, max: 160, step: 4 },
  max_width: { min: 480, max: 1600, step: 20 },
  columns: { min: 1, max: 6, step: 1 },
  columns_mobile: { min: 1, max: 2, step: 1 },
  limit: { min: 1, max: 24, step: 1 },
  rows_before_more: { min: 1, max: 24, step: 1 },
  autoplay_seconds: { min: 3, max: 15, step: 1 },
  marquee_seconds: { min: 15, max: 120, step: 5 },
  min_rating: { min: 1, max: 5, step: 1 },
}

export const ENUMS = {
  align: ["left", "center"],
  font: ["theme", "sans", "serif", "rounded", "mono"],
  star_shape: ["sharp", "rounded", "outline"],
  card_style: ["card", "outline", "plain"],
  sort: ["featured", "newest", "highest", "lowest", "photos"],
  scope: ["auto", "shop"],
  badge_layout: ["inline", "banner"],
} as const satisfies Partial<Record<keyof WidgetSettings, readonly string[]>>

const COLOR_KEYS = ["star_color", "text_color", "muted_color", "background", "card_color", "border_color", "button_color", "button_text"] as const
export type ColorKey = (typeof COLOR_KEYS)[number]
export const WIDGET_COLOR_KEYS: readonly ColorKey[] = COLOR_KEYS

const TEXT_KEYS = ["heading", "subheading"] as const
const BOOL_KEYS: readonly BoolKey[] = [
  "autoplay", "show_name", "show_date", "show_verified", "show_product", "show_photos", "show_reply", "show_title",
  "show_summary", "show_bars", "show_write", "show_count", "show_average", "only_with_text", "only_with_media", "hide_when_empty",
]

/** The words a widget draws itself, which a store may say otherwise per language. Keys of lib/markets/ui-words.ts. */
export const WIDGET_LABEL_KEYS = [
  "write_a_review", "verified_buyer", "based_on", "reviews", "review", "no_reviews_yet", "reply_from", "show_more_reviews",
  "rating_from", "out_of_five_stars", "post_review", "your_rating", "your_review", "review_title", "your_name", "email",
  "previous", "next", "customer_photos", "read_all_reviews", "review_privacy", "review_posted", "review_waiting",
  "review_check_email", "review_error", "optional", "photos", "optional_up_to_four",
] as const
export type WidgetLabelKey = (typeof WIDGET_LABEL_KEYS)[number]

export const MAX_TEXT = 160
export const MAX_LABEL = 200
/** A language code as the website's languages are written: "en", "fr", "pt-BR", or "default" for the website's own. */
const LANG = /^(?:default|[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?)$/
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

const BASE: WidgetSettings = {
  heading: "",
  subheading: "",
  align: "left",
  star_color: "",
  text_color: "",
  muted_color: "",
  background: "",
  card_color: "",
  border_color: "",
  button_color: "",
  button_text: "",
  font: "theme",
  heading_size: 28,
  text_size: 15,
  star_shape: "sharp",
  star_size: 16,
  card_style: "card",
  border_width: 1,
  radius: 12,
  gap: 16,
  card_padding: 20,
  padding_top: 48,
  padding_bottom: 48,
  max_width: 1200,
  columns: 3,
  columns_mobile: 1,
  limit: 12,
  rows_before_more: 5,
  autoplay: false,
  autoplay_seconds: 6,
  marquee_seconds: 40,
  badge_layout: "inline",
  show_name: true,
  show_date: true,
  show_verified: true,
  show_product: false,
  show_photos: true,
  show_reply: true,
  show_title: true,
  show_summary: true,
  show_bars: true,
  show_write: true,
  show_count: true,
  show_average: true,
  sort: "featured",
  scope: "auto",
  min_rating: 1,
  only_with_text: false,
  only_with_media: false,
  hide_when_empty: true,
  labels: {},
}

/** What each widget starts as: the base, with what suits it. */
const TYPE_DEFAULTS: Record<WidgetType, Partial<WidgetSettings>> = {
  product_reviews: { heading: "Customer reviews", card_style: "plain", columns: 1, limit: 24, rows_before_more: 5, max_width: 960, hide_when_empty: false, scope: "auto" },
  star_badge: { padding_top: 4, padding_bottom: 4, star_size: 18, show_date: false, hide_when_empty: true },
  rating_summary: { heading: "Customer reviews", padding_top: 32, padding_bottom: 32, max_width: 720, show_write: false },
  grid: { heading: "What customers say", columns: 3, limit: 9, show_product: true, scope: "shop" },
  carousel: { heading: "What customers say", columns: 3, limit: 10, show_product: true, scope: "shop", min_rating: 4 },
  testimonials: { heading: "Loved by our customers", align: "center", columns: 3, limit: 3, card_style: "plain", text_size: 18, show_date: false, show_photos: false, show_reply: false, scope: "shop", min_rating: 4, only_with_text: true },
  media_wall: { heading: "Customer photos", columns: 4, columns_mobile: 2, limit: 12, gap: 8, radius: 10, only_with_media: true, sort: "photos", scope: "shop" },
  marquee: { padding_top: 20, padding_bottom: 20, limit: 12, card_padding: 14, show_date: false, show_photos: false, show_reply: false, show_title: false, scope: "shop", min_rating: 4, only_with_text: true },
  trust_badge: { align: "center", padding_top: 20, padding_bottom: 20, star_size: 20, scope: "shop", badge_layout: "inline" },
}

export function defaultWidgetSettings(type: WidgetType): WidgetSettings {
  return { ...BASE, labels: {}, ...TYPE_DEFAULTS[type] }
}

/* ── Cleaning ──────────────────────────────────────────────────────────── */

/** Plain words: no control characters, no markup brackets, one line, at most `max` characters. Printed escaped anyway. */
export function cleanText(v: unknown, max = MAX_TEXT): string | null {
  if (typeof v !== "string") return null
  return Array.from(v.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim()).slice(0, max).join("")
}

export function cleanColor(v: unknown): string | null {
  if (v === "" ) return ""
  return typeof v === "string" && HEX.test(v.trim()) ? v.trim().toLowerCase() : null
}

function cleanNumber(key: NumberKey, v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN
  if (!Number.isFinite(n)) return null
  const r = NUMBER_RANGES[key]
  return Math.max(r.min, Math.min(r.max, Math.round(n)))
}

function cleanBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v
  if (v === "true") return true
  if (v === "false") return false
  return null
}

function cleanEnum<K extends keyof typeof ENUMS>(key: K, v: unknown): (typeof ENUMS)[K][number] | null {
  return typeof v === "string" && (ENUMS[key] as readonly string[]).includes(v) ? (v as (typeof ENUMS)[K][number]) : null
}

export function cleanLabels(v: unknown): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {}
  if (!v || typeof v !== "object" || Array.isArray(v)) return out
  let langs = 0
  for (const [lang, words] of Object.entries(v as Record<string, unknown>)) {
    if (!LANG.test(lang) || !words || typeof words !== "object" || Array.isArray(words)) continue
    if (++langs > 20) break
    const kept: Record<string, string> = {}
    for (const key of WIDGET_LABEL_KEYS) {
      const t = cleanText((words as Record<string, unknown>)[key], MAX_LABEL)
      if (t) kept[key] = t
    }
    if (Object.keys(kept).length) out[lang] = kept
  }
  return out
}

/**
 * Only the keys this knows, each to its kind; anything unknown, out of
 * range or of the wrong shape is left out. A partial object comes back
 * partial (for overrides); `fill` lays it over the widget's defaults.
 */
export function sanitizeWidgetSettings(raw: unknown): Partial<WidgetSettings> {
  const out: Partial<WidgetSettings> = {}
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out
  const r = raw as Record<string, unknown>
  const set = <K extends keyof WidgetSettings>(k: K, v: WidgetSettings[K] | null) => {
    if (v !== null) out[k] = v
  }
  for (const k of TEXT_KEYS) if (k in r) set(k, cleanText(r[k]))
  for (const k of COLOR_KEYS) if (k in r) set(k, cleanColor(r[k]))
  for (const k of Object.keys(NUMBER_RANGES) as NumberKey[]) if (k in r) set(k, cleanNumber(k, r[k]))
  for (const k of BOOL_KEYS) if (k in r) set(k, cleanBool(r[k]))
  for (const k of Object.keys(ENUMS) as (keyof typeof ENUMS)[]) if (k in r) set(k, cleanEnum(k, r[k]) as never)
  if ("labels" in r) out.labels = cleanLabels(r.labels)
  return out
}

/** A widget's whole settings: its defaults, then a saved configuration, then a page's overrides, each cleaned. */
export function resolveWidgetSettings(type: WidgetType, ...layers: unknown[]): WidgetSettings {
  const out = defaultWidgetSettings(type)
  for (const layer of layers) {
    const clean = sanitizeWidgetSettings(layer)
    const labels = clean.labels
    delete clean.labels
    Object.assign(out, clean)
    if (labels) for (const [lang, words] of Object.entries(labels)) out.labels[lang] = { ...(out.labels[lang] ?? {}), ...words }
  }
  return out
}

/**
 * A section's overrides, as the builder's panel stores them: an empty text,
 * colour or choice, and a number of 0, mean "as the configuration says", so
 * a field left alone never pins a value.
 */
export function sectionOverrides(settings: Record<string, unknown> | null | undefined): Partial<WidgetSettings> {
  if (!settings) return {}
  const picked: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(settings)) {
    if (k === "widget" || k === "review_config") continue
    if (v === "" || v === null || v === undefined || v === "inherit") continue
    if (typeof v === "number" && v === 0 && k !== "border_width" && k !== "gap" && k !== "card_padding" && k !== "radius" && k !== "padding_top" && k !== "padding_bottom") continue
    picked[k] = v
  }
  return sanitizeWidgetSettings(picked)
}

/* ── Saved configurations ──────────────────────────────────────────────── */

export const MAX_CONFIGS_PER_STORE = 60
export const MAX_CONFIG_NAME = 60

export interface WidgetConfig {
  id: string
  type: WidgetType
  name: string
  settings: Partial<WidgetSettings>
  updated_at: string
}

/** A configuration as it may be saved: a known type, a name, and only cleaned settings. */
export function cleanWidgetConfigInput(body: unknown): { ok: true; type: WidgetType; name: string; settings: Partial<WidgetSettings> } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Bad request." }
  const b = body as Record<string, unknown>
  if (!isWidgetType(b.type)) return { ok: false, error: "Pick a widget." }
  const name = cleanText(b.name, MAX_CONFIG_NAME)
  if (!name) return { ok: false, error: "Give it a name." }
  const settings = sanitizeWidgetSettings(b.settings)
  /* A saved look is kept whole, so a later change to the defaults does not move it. */
  return { ok: true, type: b.type, name, settings: { ...resolveWidgetSettings(b.type, settings) } }
}

/** Rows read back, cleaned again: whatever is in the table, only what this knows reaches a page. */
export function readWidgetConfigRow(row: unknown): WidgetConfig | null {
  if (!row || typeof row !== "object") return null
  const r = row as Record<string, unknown>
  if (typeof r.id !== "string" || !isWidgetType(r.type)) return null
  return {
    id: r.id,
    type: r.type,
    name: cleanText(r.name, MAX_CONFIG_NAME) || WIDGET_INFO[r.type].name,
    settings: sanitizeWidgetSettings(r.settings),
    updated_at: typeof r.updated_at === "string" ? r.updated_at : "",
  }
}

/* ── Words ─────────────────────────────────────────────────────────────── */

/**
 * The widget's words in the page's language: the store's own for this
 * language (`labels.fr`; `labels.default` on a page in the website's own
 * language), then the website's dictionary (lib/markets/ui-words.ts, handed
 * over already in this language), then English. Manual words always win.
 */
export function widgetWords(
  words: Partial<Record<string, string>> | null | undefined,
  labels: WidgetSettings["labels"],
  page: { locale?: string | null; isDefault?: boolean } | null | undefined,
  english: Record<string, string>,
): Record<WidgetLabelKey, string> {
  const locale = page?.locale ?? null
  const isDefault = page?.isDefault ?? !locale
  const own = (locale && (labels[locale] || labels[locale.split("-")[0]])) || (isDefault ? labels.default : undefined) || {}
  const out = {} as Record<WidgetLabelKey, string>
  for (const k of WIDGET_LABEL_KEYS) {
    const mine = own[k]
    const dict = words?.[k]
    out[k] = (mine && mine.trim()) || (typeof dict === "string" && dict.trim() ? dict : "") || english[k] || k
  }
  return out
}
