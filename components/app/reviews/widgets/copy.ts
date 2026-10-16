import { tt } from "@/lib/i18n/text"

/**
 * The words Reviews › Widgets says about each widget and each of its
 * settings, in the dashboard's language. The section files carry the same
 * names and labels in English for the website editor's panel
 * (themes/default/sections/reviews_*.storelib); tests/review-widgets.test.ts
 * holds the widget names here to the schemas', so the two never drift.
 * A setting without a line here shows the schema's own label.
 */

export const WIDGET_COPY: Record<string, { name: () => string; description: () => string }> = {
  reviews_product: { name: () => tt("Product reviews"), description: () => tt("The product's rating, its reviews and a form to write one.") },
  reviews_badge: { name: () => tt("Star rating"), description: () => tt("The stars and how many reviews, in one line that jumps to the reviews.") },
  reviews_summary: { name: () => tt("Rating summary"), description: () => tt("The average, the stars and a bar for each rating.") },
  reviews_grid: { name: () => tt("Review grid"), description: () => tt("Reviews as cards in columns, or stacked at their own heights.") },
  reviews_carousel: { name: () => tt("Reviews carousel"), description: () => tt("A row of reviews that scrolls sideways.") },
  reviews_testimonials: { name: () => tt("Testimonials"), description: () => tt("A few reviews as large quotes, side by side or one at a time.") },
  reviews_media: { name: () => tt("Photo reviews"), description: () => tt("The reviews buyers added photos to, as a gallery.") },
  reviews_marquee: { name: () => tt("Reviews marquee"), description: () => tt("Short reviews that drift across the page in a loop.") },
  reviews_trust: { name: () => tt("Trust badge"), description: () => tt("The shop's rating as a small badge or a full width bar.") },
  reviews_all: { name: () => tt("All reviews"), description: () => tt("Every review of the shop with its product, for a reviews page.") },
}

export const GROUP_LABELS: Record<string, () => string> = {
  hdr_content: () => tt("Content"),
  hdr_reviews: () => tt("Reviews"),
  hdr_shown: () => tt("Shown on each review"),
  hdr_layout: () => tt("Layout"),
  hdr_style: () => tt("Style"),
  hdr_type: () => tt("Typography"),
  hdr_motion: () => tt("Motion"),
  hdr_visibility: () => tt("Visibility"),
  hdr_spacing: () => tt("Spacing"),
}

export const SETTING_LABELS: Record<string, () => string> = {
  heading: () => tt("Heading"),
  subheading: () => tt("Supporting line"),
  align: () => tt("Align"),
  scope: () => tt("Whose reviews"),
  source: () => tt("Reviews"),
  sort: () => tt("Order"),
  min_rating: () => tt("Lowest rating shown"),
  count: () => tt("How many"),
  per_page: () => tt("Reviews before Show more"),
  show_more: () => tt("Show more button for the rest"),
  show_title: () => tt("Title"),
  show_date: () => tt("Date"),
  show_verified: () => tt("Verified buyer"),
  show_photos: () => tt("Photos"),
  show_product: () => tt("Product"),
  show_avatar: () => tt("Initial beside the name"),
  show_body: () => tt("Review text"),
  show_summary: () => tt("Show the rating"),
  show_bars: () => tt("A bar for each rating"),
  bar_numbers: () => tt("Beside each bar"),
  show_write: () => tt("Show Write a review"),
  show_score: () => tt("Show the shop's rating"),
  show_all_link: () => tt("Link to all reviews"),
  all_link_label: () => tt("Link label"),
  show_average: () => tt("Show the average"),
  show_count: () => tt("Show how many reviews"),
  link: () => tt("Link"),
  link_label: () => tt("Link label"),
  layout: () => tt("Layout"),
  caption: () => tt("Words"),
  quote_align: () => tt("Quote sits"),
  columns: () => tt("Columns"),
  gap: () => tt("Space between"),
  card_width: () => tt("Card width"),
  max_width: () => tt("Content width"),
  size: () => tt("Star size"),
  speed: () => tt("Time for one loop"),
  direction: () => tt("Moves"),
  pause: () => tt("Stop while the pointer is on it"),
  color_scheme: () => tt("Colour scheme"),
  background: () => tt("Background"),
  text_color: () => tt("Text"),
  card_background: () => tt("Card background"),
  border_color: () => tt("Border"),
  border_width: () => tt("Border width"),
  radius: () => tt("Corner radius"),
  star_style: () => tt("Stars"),
  star_color: () => tt("Star colour"),
  star_size: () => tt("Star size"),
  text_scale: () => tt("Text size"),
  heading_scale: () => tt("Heading size"),
  show_on: () => tt("Show on"),
  padding_top: () => tt("Top padding"),
  padding_bottom: () => tt("Bottom padding"),
}

/** `<setting>:<value>`, or `*:<value>` for a word every setting shares. */
export const OPTION_LABELS: Record<string, () => string> = {
  "*:left": () => tt("Left"),
  "*:center": () => tt("Centre"),
  "*:right": () => tt("Right"),
  "scope:here": () => tt("This page"),
  "scope:all": () => tt("The whole shop"),
  "source:featured": () => tt("Featured, or four and five stars"),
  "source:recent": () => tt("All of them"),
  "sort:app": () => tt("As set in Storelib Reviews"),
  "sort:featured": () => tt("Featured first"),
  "sort:newest": () => tt("Newest"),
  "sort:highest": () => tt("Highest rated"),
  "sort:lowest": () => tt("Lowest rated"),
  "sort:photos": () => tt("With photos first"),
  "layout:grid": () => tt("Cards in rows"),
  "layout:masonry": () => tt("Cards at their own height"),
  "layout:list": () => tt("List"),
  "layout:columns": () => tt("Side by side"),
  "layout:slider": () => tt("One at a time"),
  "layout:badge": () => tt("Badge"),
  "layout:banner": () => tt("Full width bar"),
  "layout:row": () => tt("In a row"),
  "layout:stacked": () => tt("Stacked"),
  "caption:below": () => tt("Under the photo"),
  "caption:overlay": () => tt("Over the photo"),
  "bar_numbers:count": () => tt("How many"),
  "bar_numbers:percent": () => tt("Share"),
  "max_width:narrow": () => tt("Narrow"),
  "max_width:medium": () => tt("Medium"),
  "max_width:wide": () => tt("Wide"),
  "max_width:full": () => tt("Full"),
  "star_style:solid": () => tt("Solid"),
  "star_style:outline": () => tt("Outline"),
  "star_style:heart": () => tt("Hearts"),
  "show_on:all": () => tt("Phones and computers"),
  "show_on:desktop": () => tt("Computers only"),
  "show_on:mobile": () => tt("Phones only"),
}

export function settingLabel(id: string, fallback: string): string {
  return SETTING_LABELS[id]?.() ?? fallback
}

export function optionLabel(id: string, value: string, fallback: string): string {
  return (OPTION_LABELS[`${id}:${value}`] ?? OPTION_LABELS[`*:${value}`])?.() ?? fallback
}
