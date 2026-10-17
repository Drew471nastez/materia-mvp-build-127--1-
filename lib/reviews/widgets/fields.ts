/**
 * The customizer's fields (components/reviews/widgets/widget-customizer.tsx):
 * which settings each widget offers, in groups, with their plain names. A
 * setting a widget does not draw is not offered for it, so a strip of
 * reviews has no "Show the form" and a star line no columns. Pure.
 */
import { ENUMS, NUMBER_RANGES, type NumberKey, type WidgetSettings, type WidgetType } from "./config"

export type FieldKind = "text" | "color" | "range" | "toggle" | "select"

export interface CustomizerField {
  key: keyof WidgetSettings
  label: string
  kind: FieldKind
  /** The widgets that draw it; absent, every widget. */
  only?: readonly WidgetType[]
  options?: { value: string; label: string }[]
  unit?: string
  hint?: string
}

const CARDS: readonly WidgetType[] = ["product_reviews", "grid", "carousel", "testimonials", "marquee"]
const LISTS: readonly WidgetType[] = ["product_reviews", "grid", "carousel", "testimonials", "media_wall", "marquee"]

const opt = <K extends keyof typeof ENUMS>(key: K, labels: Record<(typeof ENUMS)[K][number], string>) => ENUMS[key].map((v) => ({ value: v, label: labels[v as (typeof ENUMS)[K][number]] }))

export const CUSTOMIZER_GROUPS: { id: string; label: string; fields: CustomizerField[] }[] = [
  {
    id: "content",
    label: "Content",
    fields: [
      { key: "show_heading", label: "Show a heading", kind: "toggle" },
      { key: "heading", label: "Heading", kind: "text", hint: "Empty uses the widget's own, in each language." },
      { key: "subheading", label: "Supporting line", kind: "text" },
      { key: "align", label: "Align", kind: "select", options: opt("align", { left: "Left", center: "Centre" }) },
      { key: "badge_layout", label: "Style", kind: "select", only: ["trust_badge"], options: opt("badge_layout", { inline: "A line", banner: "A banner" }) },
    ],
  },
  {
    id: "reviews",
    label: "Which reviews",
    fields: [
      { key: "scope", label: "Whose reviews", kind: "select", options: opt("scope", { auto: "The product's on its page, else the shop's", shop: "The whole shop's" }) },
      { key: "sort", label: "Order", kind: "select", only: LISTS, options: opt("sort", { featured: "Featured first", newest: "Newest", highest: "Highest rated", lowest: "Lowest rated", photos: "With photos first" }) },
      { key: "min_rating", label: "Lowest rating shown", kind: "range", only: LISTS, unit: "stars" },
      { key: "only_with_text", label: "Only reviews with words", kind: "toggle", only: LISTS },
      { key: "only_with_media", label: "Only reviews with photos", kind: "toggle", only: LISTS.filter((t) => t !== "media_wall") },
      { key: "limit", label: "How many", kind: "range", only: LISTS },
      { key: "rows_before_more", label: "Reviews before Show more", kind: "range", only: ["product_reviews"] },
      { key: "hide_when_empty", label: "Hide when there are no reviews", kind: "toggle" },
    ],
  },
  {
    id: "shows",
    label: "What it shows",
    fields: [
      { key: "show_summary", label: "Rating summary", kind: "toggle", only: ["product_reviews", "grid"] },
      { key: "show_bars", label: "Reviews by stars", kind: "toggle", only: ["product_reviews", "rating_summary"] },
      { key: "show_average", label: "The average", kind: "toggle", only: ["product_reviews", "rating_summary", "star_badge", "trust_badge"] },
      { key: "show_count", label: "How many reviews", kind: "toggle", only: ["product_reviews", "rating_summary", "star_badge", "trust_badge"] },
      { key: "show_write", label: "Write a review", kind: "toggle", only: ["product_reviews", "rating_summary"], hint: "Only when anyone may write, in Storelib Reviews settings." },
      { key: "show_name", label: "Name", kind: "toggle", only: LISTS },
      { key: "show_date", label: "Date", kind: "toggle", only: CARDS },
      { key: "show_verified", label: "Verified buyer", kind: "toggle", only: CARDS },
      { key: "show_title", label: "Review title", kind: "toggle", only: CARDS },
      { key: "show_product", label: "Product", kind: "toggle", only: CARDS, hint: "On the shop's reviews." },
      { key: "show_photos", label: "Photos", kind: "toggle", only: CARDS },
      { key: "show_reply", label: "Your replies", kind: "toggle", only: CARDS },
    ],
  },
  {
    id: "layout",
    label: "Layout",
    fields: [
      { key: "columns", label: "Columns on a computer", kind: "range", only: ["grid", "carousel", "testimonials", "media_wall"] },
      { key: "columns_mobile", label: "Columns on a phone", kind: "range", only: ["grid", "testimonials", "media_wall"] },
      { key: "autoplay", label: "Move by itself", kind: "toggle", only: ["carousel"], hint: "Never for visitors who asked for less motion." },
      { key: "autoplay_seconds", label: "Seconds per slide", kind: "range", only: ["carousel"], unit: "s" },
      { key: "marquee_seconds", label: "Speed (seconds per loop)", kind: "range", only: ["marquee"], unit: "s" },
      { key: "gap", label: "Space between", kind: "range", only: LISTS, unit: "px" },
      { key: "max_width", label: "Width", kind: "range", unit: "px" },
      { key: "padding_top", label: "Space above", kind: "range", unit: "px" },
      { key: "padding_bottom", label: "Space below", kind: "range", unit: "px" },
    ],
  },
  {
    id: "colors",
    label: "Colours",
    fields: [
      { key: "star_color", label: "Stars", kind: "color" },
      { key: "text_color", label: "Text", kind: "color" },
      { key: "muted_color", label: "Quiet text", kind: "color" },
      { key: "background", label: "Background", kind: "color" },
      { key: "card_color", label: "Cards", kind: "color", only: [...CARDS, "trust_badge"] },
      { key: "border_color", label: "Borders", kind: "color", only: [...CARDS, "rating_summary", "trust_badge"] },
      { key: "button_color", label: "Button", kind: "color", only: ["product_reviews", "rating_summary"] },
      { key: "button_text", label: "Button text", kind: "color", only: ["product_reviews", "rating_summary"] },
    ],
  },
  {
    id: "style",
    label: "Style",
    fields: [
      { key: "font", label: "Font", kind: "select", options: opt("font", { theme: "Your theme's", sans: "Sans serif", serif: "Serif", rounded: "Rounded", mono: "Monospace" }) },
      { key: "heading_size", label: "Heading size", kind: "range", unit: "px", hint: "0 uses your theme's." },
      { key: "text_size", label: "Text size", kind: "range", unit: "px" },
      { key: "star_shape", label: "Stars", kind: "select", options: opt("star_shape", { sharp: "Filled", rounded: "Rounded", outline: "Outline" }) },
      { key: "star_size", label: "Star size", kind: "range", unit: "px" },
      { key: "card_style", label: "Reviews as", kind: "select", only: CARDS, options: opt("card_style", { card: "Cards", outline: "Outlined", plain: "Plain, with lines between" }) },
      { key: "border_width", label: "Border", kind: "range", only: CARDS, unit: "px" },
      { key: "radius", label: "Corners", kind: "range", only: [...CARDS, "media_wall", "trust_badge"], unit: "px" },
      { key: "card_padding", label: "Space inside", kind: "range", only: CARDS, unit: "px" },
    ],
  },
]

export function fieldsFor(type: WidgetType): { id: string; label: string; fields: CustomizerField[] }[] {
  return CUSTOMIZER_GROUPS.map((g) => ({ ...g, fields: g.fields.filter((f) => !f.only || f.only.includes(type)) })).filter((g) => g.fields.length > 0)
}

export function rangeOf(key: keyof WidgetSettings): { min: number; max: number; step: number } {
  return NUMBER_RANGES[key as NumberKey] ?? { min: 0, max: 100, step: 1 }
}

/** The words a store most often wants to say its own way, in the order the customizer lists them. */
export const EDITABLE_LABELS = [
  "write_a_review", "verified_buyer", "based_on", "reviews", "review", "rating_from", "no_reviews_yet", "show_more_reviews",
  "reply_from", "post_review", "customer_photos", "read_all_reviews", "previous", "next",
] as const
