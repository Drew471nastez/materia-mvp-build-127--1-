/**
 * ===========================================================================
 *  STORELIB REVIEWS IN A THEME IMPORTED FROM SHOPIFY
 * ===========================================================================
 * Three ways reviews reach an imported theme, all from the same data
 * (lib/reviews/storefront.ts), handed to the page as `storelib_reviews`:
 *
 *   THE THEME'S OWN STARS   product.metafields.reviews.rating and
 *                           rating_count, Shopify's standard review
 *                           metafields (./objects.ts reviewMetafields): Dawn,
 *                           Horizon and every Online Store 2.0 theme draw
 *                           their card and product stars from them. On a
 *                           product page they are the page's own reviews
 *                           (./theme.ts), whatever the cards show.
 *   A SECTION             "Storelib Reviews" (sections/storelib-reviews),
 *                           in Add section like the theme's own, on any
 *                           template: the product's reviews on a product
 *                           page, the shop's anywhere else. Every imported
 *                           theme has it (withStorelibReviewsSection), unless
 *                           the theme has a file of that name itself.
 *   AN APP BLOCK            a reviews app's block the theme was using on
 *                           Shopify (Judge.me, Product Reviews, Loox, Yotpo,
 *                           Okendo, Stamped, Ali Reviews, Reviews.io), kept in
 *                           the imported template as `shopify://apps/...`:
 *                           drawn as Storelib Reviews in the same place,
 *                           whether the theme draws its blocks with
 *                           {% content_for 'blocks' %} or {% render block %}:
 *                           a badge or a rating as the stars, anything else
 *                           as the reviews. And Storelib Reviews' own two,
 *                           Star rating and Reviews (./review-app-blocks.ts),
 *                           in Add block wherever the theme's schema takes
 *                           "@app", as a reviews app's are on Shopify.
 *
 * The markup is plain Liquid over `storelib_reviews` and `rv` (the section's
 * settings, or the block's), its words `storelib_words` (Storelib's own in
 * the page's language, Translate › Shop words), with its own small
 * stylesheet scoped to .slrv, inheriting the theme's font and text colour.
 * The write form posts to /api/reviews/site with no script and comes back
 * to #review-posted and the rest, as the Storelib theme's section does.
 * Pure: no Node, no DOM, the same in the canvas and on the website.
 */
import { wrapCompatTemplate, isCompatSource } from "./theme"
import { toOutput, type Ctx } from "./runtime"
import { renderReviewWidgetSection, type WidgetReviews } from "@/lib/reviews/widgets/render"
import { reviewWidgetScript } from "@/lib/reviews/widgets/enhance"
import { WIDGET_INFO, WIDGET_TYPES } from "@/lib/reviews/widgets/config"
import { NEWSLETTER_SECTION_PATH, NEWSLETTER_SECTION_TYPE, newsletterSectionSource } from "./storelib-newsletter"

import { REVIEWS_SECTION_TYPE, REVIEW_WIDGET_SECTION_TYPE, STORELIB_APP_SECTION_TYPES } from "./native-sections"

/* Registered in ./native-sections.ts, so the import and a GitHub push accept them without a theme file. */
export { REVIEWS_SECTION_TYPE, REVIEW_WIDGET_SECTION_TYPE, STORELIB_APP_SECTION_TYPES }
export const REVIEWS_SECTION_PATH = `sections/${REVIEWS_SECTION_TYPE}.storelib`

/** An app block that was a reviews app's on Shopify. */
const REVIEW_APPS = /^shopify:\/\/apps\/[^/]*(judge-?me|product-reviews|reviews|loox|yotpo|okendo|stamped|ali-?reviews|reviewsio|rivyo|opinew|storelib-reviews)[^/]*\/blocks\//i

export function isReviewsAppBlock(type: unknown): boolean {
  return typeof type === "string" && REVIEW_APPS.test(type)
}

/** The settings the section is drawn with when it has none of its own. */
export const REVIEWS_DEFAULTS = { heading: "Customer reviews", show_summary: true, show_bars: true, show_write: true, per_page: 5, star_color: "" }

/**
 * What a reviews app's block was on Shopify, so Storelib draws the same
 * thing in its place: the stars (Judge.me's preview badge, Product Reviews'
 * star rating, Loox's rating, Yotpo's and Okendo's star rating, Storelib
 * Reviews' own Star rating) or the reviews (every other one).
 */
export function reviewAppBlockKind(type: unknown): "stars" | "reviews" | null {
  if (!isReviewsAppBlock(type)) return null
  const handle = /\/blocks\/([^/]+)/.exec(String(type))?.[1] ?? ""
  return /badge|rating|stars?(?![a-z])/i.test(handle) ? "stars" : "reviews"
}

/**
 * ===========================================================================
 *  THE STARS, AS AN APP BLOCK
 * ===========================================================================
 * Under a product's title, on a card, in a featured product: the stars, and
 * the average and how many reviews when the block says so, in the theme's
 * own font and text colour, the stars in the block's colour, else the
 * store's (Storelib Reviews › Display). Its words are Storelib's in the
 * page's language (Translate › Shop words). No reviews: nothing on the
 * website, and a quiet "No reviews yet" in the builder so the block can
 * still be found and selected. Pure.
 */
const RATING_STYLE = `<style>
.slrv-rating{margin:.35em 0;font:inherit;color:inherit;line-height:1.3}
.slrv-rating-in{display:inline-flex;flex-wrap:wrap;align-items:center;gap:.45em;color:inherit;text-decoration:none}
a.slrv-rating-in:hover .slrv-rating-n{text-decoration:underline;text-underline-offset:.2em}
.slrv-rating .slrv-stars{position:relative;display:inline-block;line-height:1;letter-spacing:.12em;font-size:1em;color:color-mix(in srgb,currentColor 18%,transparent)}
.slrv-rating .slrv-stars:before{content:"\\2605\\2605\\2605\\2605\\2605"}
.slrv-rating .slrv-stars:after{content:"\\2605\\2605\\2605\\2605\\2605";position:absolute;left:0;top:0;bottom:0;width:var(--rv,0%);overflow:hidden;white-space:nowrap;color:var(--slrv-star,currentColor)}
.slrv-rating-avg{font-weight:600}
.slrv-rating-n,.slrv-rating-none{font-size:.875em;color:color-mix(in srgb,currentColor 70%,transparent)}
</style>`

const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
/** A colour a setting or the store gave, kept only when it reads as one. */
const safeColour = (v: unknown) => (typeof v === "string" && /^[#a-z0-9(),.%\s-]{1,64}$/i.test(v.trim()) ? v.trim() : "")

export interface ReviewStarsInput {
  /** One decimal, 0 with no reviews. */
  average: number
  count: number
  /** The block's own settings, as stored. */
  settings: Record<string, unknown>
  /** The store's star colour (Storelib Reviews › Display). */
  starColor: string
  /** Storelib's words in the page's language (lib/markets/ui-words.ts shopWords). */
  words: Record<string, string>
  /** Where pressing the stars goes: the reviews on this page, or the product's. Null: nowhere. */
  href: string | null
  inEditor: boolean
}

export function reviewStarsHtml(input: ReviewStarsInput): string {
  const s = input.settings
  const w = input.words
  const on = (k: string, d: boolean) => (typeof s[k] === "boolean" ? (s[k] as boolean) : d)
  const count = Math.max(0, Math.floor(input.count) || 0)
  if (!(count > 0 && input.average > 0)) return input.inEditor ? `${RATING_STYLE}<p class="slrv-rating slrv-rating-none">${escapeHtml(w.no_reviews_yet ?? "No reviews yet")}</p>` : ""
  const average = Math.min(5, Math.round(input.average * 10) / 10)
  const label = average.toFixed(1)
  const many = `${count} ${count === 1 ? w.review ?? "review" : w.reviews ?? "reviews"}`
  const colour = safeColour(s.star_color) || safeColour(input.starColor)
  const said = `${label} ${w.out_of_five_stars ?? "out of 5 stars"}, ${many}`
  const inner = [
    `<span class="slrv-stars" style="--rv: ${Math.round((average / 5) * 100)}%;" aria-hidden="true"></span>`,
    on("show_average", false) ? `<span class="slrv-rating-avg" aria-hidden="true">${label}</span>` : "",
    on("show_count", true) ? `<span class="slrv-rating-n" aria-hidden="true">${escapeHtml(many)}</span>` : "",
  ].join("")
  const link = on("link", true) && input.href ? input.href : null
  const holder = link ? `<a class="slrv-rating-in" href="${escapeHtml(link)}" aria-label="${escapeHtml(said)}">${inner}</a>` : `<span class="slrv-rating-in" role="img" aria-label="${escapeHtml(said)}">${inner}</span>`
  return `${RATING_STYLE}<div class="slrv-rating"${colour ? ` style="--slrv-star: ${escapeHtml(colour)};"` : ""}>${holder}</div>`
}

/** A product's rating as a theme reads it: Shopify's review metafields (./objects.ts), or none. */
export function ratingOfProduct(product: unknown): { average: number; count: number; color: string } | null {
  const mf = (product as { metafields?: { reviews?: { rating?: { value?: { rating?: unknown }; __star_color?: unknown }; rating_count?: { value?: unknown } } } } | null | undefined)?.metafields?.reviews
  const average = Number(mf?.rating?.value?.rating)
  const count = Number(mf?.rating_count?.value)
  return average > 0 && count > 0 ? { average, count, color: typeof mf?.rating?.__star_color === "string" ? mf.rating.__star_color : "" } : null
}

/** The settings the reviews block is drawn with: its own over the block's defaults, compact, with Storelib's heading in the page's language when it has none. */
export function reviewsBlockSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const own: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(settings ?? {})) if (v !== undefined && v !== null && !k.startsWith("__")) own[k] = v
  return { ...REVIEWS_DEFAULTS, heading: "", per_page: 3, ...own, in_block: true }
}

const STYLE = `<style>
.slrv{--slrv-line:color-mix(in srgb,currentColor 14%,transparent);--slrv-soft:color-mix(in srgb,currentColor 6%,transparent);--slrv-muted:color-mix(in srgb,currentColor 68%,transparent);max-width:960px;margin:0 auto;padding:48px 20px;font:inherit;color:inherit}
.slrv h2{margin:0 0 20px}
.slrv-block{max-width:none;margin:0;padding:12px 0}.slrv-block h2{font-size:1.25em}
.slrv-stars{position:relative;display:inline-block;line-height:1;letter-spacing:2px;color:var(--slrv-line);font-size:16px}
.slrv-stars:before{content:"\\2605\\2605\\2605\\2605\\2605"}
.slrv-stars:after{content:"\\2605\\2605\\2605\\2605\\2605";position:absolute;left:0;top:0;bottom:0;width:var(--rv,0%);overflow:hidden;white-space:nowrap;color:var(--slrv-star)}
.slrv-top{display:flex;flex-wrap:wrap;align-items:center;gap:16px 40px;padding-bottom:20px;border-bottom:1px solid var(--slrv-line)}
.slrv-sum{display:flex;align-items:center;gap:12px}
.slrv-avg{margin:0;font-size:40px;font-weight:700;line-height:1}
.slrv-count,.slrv-none{margin:6px 0 0;font-size:14px;color:var(--slrv-muted)}
.slrv-bars{list-style:none;margin:0;padding:0;display:grid;gap:5px;min-width:200px;flex:0 1 300px}
.slrv-bars li{display:grid;grid-template-columns:32px 1fr 26px;align-items:center;gap:8px;font-size:13px;color:var(--slrv-muted)}
.slrv-bar{height:6px;border-radius:9px;background:var(--slrv-soft);overflow:hidden}.slrv-bar span{display:block;height:100%;background:var(--slrv-star)}
.slrv-btn{display:inline-flex;align-items:center;justify-content:center;padding:11px 20px;border-radius:6px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer;font:inherit;font-weight:600;list-style:none;transition:background-color .15s ease}
.slrv-btn:hover{background:var(--slrv-soft)}
.slrv-btn::-webkit-details-marker{display:none}
.slrv-quiet{border-color:var(--slrv-line)}
.slrv-note{display:none;margin:16px 0 0;padding:12px 14px;border-radius:6px;background:var(--slrv-soft);font-size:14px}.slrv-note:target{display:block}
.slrv-write{margin-top:20px}.slrv-write[open]>summary{margin-bottom:16px}
.slrv-form{display:grid;gap:12px;max-width:620px;padding:18px;border:1px solid var(--slrv-line);border-radius:8px}
.slrv-form fieldset{border:0;margin:0;padding:0}.slrv-form legend,.slrv-form label{font-size:14px;font-weight:600}
.slrv-form label{display:grid;gap:6px}
.slrv-form input:not([type=radio]):not([type=file]),.slrv-form textarea{width:100%;box-sizing:border-box;padding:10px 12px;font:inherit;font-size:16px;color:inherit;background:transparent;border:1px solid var(--slrv-line);border-radius:6px}
.slrv-rate{display:inline-flex;flex-direction:row-reverse;justify-content:flex-end}
.slrv-rate input{position:absolute;opacity:0;width:1px;height:1px}
.slrv-rate label{display:block;width:34px;height:34px;font-size:28px;line-height:34px;text-align:center;cursor:pointer;color:var(--slrv-line)}
.slrv-rate label:before{content:"\\2605"}
.slrv-rate input:checked~label,.slrv-rate label:hover,.slrv-rate label:hover~label{color:var(--slrv-star)}
.slrv-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.slrv-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.slrv-small{margin:0;font-size:13px;color:var(--slrv-muted)}
.slrv-card{padding:22px 0;border-bottom:1px solid var(--slrv-line)}
.slrv-card-top{display:flex;justify-content:space-between;gap:12px;font-size:13px;color:var(--slrv-muted)}
.slrv-card h3{margin:10px 0 0;font-size:16px}
.slrv-body{margin:8px 0 0;line-height:1.6;white-space:pre-line;overflow-wrap:anywhere}
.slrv-photos{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.slrv-photos img{width:70px;height:70px;object-fit:cover;border-radius:6px;display:block}
.slrv-by{margin:12px 0 0;font-size:13px;color:var(--slrv-muted)}.slrv-by b{color:inherit;font-weight:600}
.slrv-reply{margin-top:12px;padding:10px 12px;border-left:2px solid var(--slrv-line);background:var(--slrv-soft)}
.slrv-more{margin-top:18px}.slrv-more[open]>summary{display:none}
.slrv-sample{margin:-10px 0 18px;font-size:13px;color:var(--slrv-muted)}
</style>`

const CARD = `<article class="slrv-card"><div class="slrv-card-top"><span class="slrv-stars" style="--rv: {{ r.rating | times: 20 }}%;" role="img" aria-label="{{ r.rating }} {{ slrv_w.out_of_five_stars }}"></span>{% if storelib_reviews.show_date %}<span>{{ r.date }}</span>{% endif %}</div>{% if r.title != blank %}<h3>{{ r.title | escape }}</h3>{% endif %}<p class="slrv-body">{{ r.body | escape }}</p>{% if storelib_reviews.show_photos and r.has_photos %}<div class="slrv-photos">{% for ph in r.photos %}<a href="{{ ph | escape }}" target="_blank" rel="noopener"><img src="{{ ph | escape }}" alt="{{ slrv_w.photo_from }} {{ r.author | escape }}" loading="lazy"></a>{% endfor %}</div>{% endif %}<p class="slrv-by"><b>{{ r.author | escape }}</b>{% if storelib_reviews.show_verified and r.verified %} · {{ slrv_w.verified_buyer }}{% endif %}{% if slrv_here.scope == 'shop' and r.product_title != blank %} · {{ slrv_w.review_on }} <a href="{{ r.product_url | escape }}">{{ r.product_title | escape }}</a>{% endif %}</p>{% if r.reply != blank %}<div class="slrv-reply"><p class="slrv-small"><b>{{ slrv_w.reply_from }} {{ shop.name | escape }}</b></p><p class="slrv-body">{{ r.reply | escape }}</p></div>{% endif %}</article>`

/** The widget, over `storelib_reviews` and `rv`. */
export const REVIEWS_WIDGET_LIQUID = `{%- if storelib_reviews.enabled -%}{%- assign slrv_here = storelib_reviews.here -%}{%- assign slrv_per = rv.per_page | default: 5 -%}{%- assign slrv_w = storelib_words -%}{%- assign slrv_n = slrv_here.summary.count -%}
{%- if slrv_here.summary.count > 0 or storelib_reviews.can_write or storelib_reviews.sample -%}
${STYLE}
<div class="slrv{% if rv.in_block %} slrv-block{% endif %}" id="reviews" style="--slrv-star: {% if rv.star_color != blank %}{{ rv.star_color | escape }}{% else %}{{ storelib_reviews.star_color | escape }}{% endif %};">
{%- if rv.heading != blank -%}<h2 class="h2">{{ rv.heading | escape }}</h2>{%- elsif rv.in_block -%}<h2 class="h2">{{ slrv_w.customer_reviews | escape }}</h2>{%- endif -%}
{%- if storelib_reviews.sample -%}<p class="slrv-sample">Sample reviews. Your real reviews show here once you have some.</p>{%- endif -%}
{%- if rv.show_summary -%}<div class="slrv-top"><div class="slrv-sum">{%- if slrv_here.summary.count > 0 -%}<p class="slrv-avg">{{ slrv_here.summary.average_label }}</p><div><span class="slrv-stars" style="--rv: {{ slrv_here.summary.percent }}%; font-size: 20px;" role="img" aria-label="{{ slrv_here.summary.average_label }} {{ slrv_w.out_of_five_stars }}"></span><p class="slrv-count">{{ slrv_w.based_on }} {{ slrv_n }} {% if slrv_n == 1 %}{{ slrv_w.review }}{% else %}{{ slrv_w.reviews }}{% endif %}</p></div>{%- else -%}<p class="slrv-none">{{ slrv_w.no_reviews_yet }}</p>{%- endif -%}</div>
{%- if rv.show_bars and slrv_here.summary.count > 0 -%}<ul class="slrv-bars">{%- for b in slrv_here.summary.bars -%}<li><span>{{ b.stars }} &#9733;</span><span class="slrv-bar"><span style="width: {{ b.percent }}%;"></span></span><span>{{ b.count }}</span></li>{%- endfor -%}</ul>{%- endif -%}</div>{%- endif -%}
<p class="slrv-note" id="review-posted">{{ slrv_w.review_posted }}</p><p class="slrv-note" id="review-waiting">{{ slrv_w.review_waiting }}</p><p class="slrv-note" id="review-check-email">{{ slrv_w.review_check_email }}</p><p class="slrv-note" id="review-error">{{ slrv_w.review_error }}</p>
{%- if rv.show_write and storelib_reviews.can_write and slrv_here.scope == 'product' -%}
<details class="slrv-write"><summary class="slrv-btn"><span>{{ slrv_w.write_a_review }}</span></summary>
<form class="slrv-form" method="post" action="{{ storelib_reviews.form_action }}" enctype="multipart/form-data" data-storelib-form="native">
<input type="hidden" name="productId" value="{{ slrv_here.product_id }}">
<fieldset><legend>{{ slrv_w.your_rating }}</legend><div class="slrv-rate">{%- for n in (1..5) reversed -%}<input type="radio" id="slrv-r{{ n }}" name="rating" value="{{ n }}"{% if n == 5 %} required{% endif %}><label for="slrv-r{{ n }}"><span class="slrv-sr">{{ n }} {% if n == 1 %}{{ slrv_w.star }}{% else %}{{ slrv_w.stars }}{% endif %}</span></label>{%- endfor -%}</div></fieldset>
<label>{{ slrv_w.review_title }} {{ slrv_w.optional }}<input name="title" maxlength="120"></label>
<label>{{ slrv_w.your_review }}<textarea name="content" rows="4" required minlength="2" maxlength="2000"></textarea></label>
<label>{{ slrv_w.your_name }}<input name="name" required maxlength="40" autocomplete="given-name"></label>
<label>{{ slrv_w.email }}<input type="email" name="email" required maxlength="254" autocomplete="email"></label>
{%- if storelib_reviews.photos_allowed -%}<label>{{ slrv_w.photos }} {{ slrv_w.optional_up_to_four }}<input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple></label>{%- endif -%}
<div class="slrv-hp" aria-hidden="true"><label>Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label></div>
<p class="slrv-small">{{ slrv_w.review_privacy }}</p>
<button class="slrv-btn" type="submit"><span>{{ slrv_w.post_review }}</span></button>
</form></details>
{%- endif -%}
{%- for r in slrv_here.items limit: slrv_per -%}${CARD}{%- endfor -%}
{%- if slrv_here.items.size > slrv_per -%}<details class="slrv-more"><summary class="slrv-btn slrv-quiet"><span>{{ slrv_w.show_more_reviews }}</span></summary>{%- for r in slrv_here.items offset: slrv_per -%}${CARD}{%- endfor -%}</details>{%- endif -%}
{% raw %}${reviewWidgetScript()}{% endraw %}</div>
{%- endif -%}{%- endif -%}`

/**
 * The section file, in the shape an imported theme's sections are kept in:
 * the markup, then one schema for the panel and the theme. Made on first use
 * (theme.ts imports this file, and this file uses theme.ts).
 */
let sectionSource: string | null = null
export function reviewsSectionSource(): string {
  if (sectionSource === null) sectionSource = makeSectionSource()
  return sectionSource
}

const makeSectionSource = () => `${wrapCompatTemplate(`{%- assign rv = section.settings -%}\n${REVIEWS_WIDGET_LIQUID}`)}

<schema>
${JSON.stringify(
  {
    schema_version: 1,
    type: REVIEWS_SECTION_TYPE,
    name: "Storelib Reviews",
    description: "Product reviews from Storelib Reviews: the rating, the reviews and a form to write one.",
    version: "1.0.0",
    icon: "star",
    settings: [
      { type: "text", id: "heading", label: "Heading", default: REVIEWS_DEFAULTS.heading },
      { type: "toggle", id: "show_summary", label: "Show the rating", default: true },
      { type: "toggle", id: "show_bars", label: "Show reviews by stars", default: true },
      { type: "toggle", id: "show_write", label: "Show Write a review", default: true },
      { type: "range", id: "per_page", label: "Reviews before Show more", default: REVIEWS_DEFAULTS.per_page, min: 2, max: 24, step: 1 },
      { type: "color", id: "star_color", label: "Star colour", default: "" },
    ],
    presets: [{ name: "Storelib Reviews", settings: {} }],
    shopify: {
      name: "Storelib Reviews",
      settings: [
        { type: "text", id: "heading", label: "Heading", default: REVIEWS_DEFAULTS.heading },
        { type: "checkbox", id: "show_summary", label: "Show the rating", default: true },
        { type: "checkbox", id: "show_bars", label: "Show reviews by stars", default: true },
        { type: "checkbox", id: "show_write", label: "Show Write a review", default: true },
        { type: "range", id: "per_page", label: "Reviews before Show more", default: REVIEWS_DEFAULTS.per_page, min: 2, max: 24, step: 1 },
        { type: "color", id: "star_color", label: "Star colour", default: "" },
      ],
      presets: [{ name: "Storelib Reviews" }],
    },
  },
  null,
  2,
)}
</schema>
`

/**
 * ===========================================================================
 *  THE REVIEW WIDGETS IN AN IMPORTED THEME
 * ===========================================================================
 * "Reviews widget" (sections/storelib-review-widget), beside the Storelib
 * Reviews section in Add section, one card per widget (its presets): the
 * same widgets a Storelib theme has (lib/reviews/widgets), drawn by the
 * same function through the `storelib_review_widget` filter, with the look
 * saved in Storelib Reviews › Widgets that the section names. Its words are
 * Storelib's in the page's language (page.i18n.uiWords) under the store's
 * own per language. A carousel brings its few lines of script along.
 */
export const REVIEW_WIDGET_SECTION_PATH = `sections/${REVIEW_WIDGET_SECTION_TYPE}.storelib`


/** A value of the section's settings as plain words: a colour setting is an object to the theme. */
function plainSettings(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object") return {}
  const out: Record<string, unknown> = {}
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (k.startsWith("__")) continue
    out[k] = x !== null && typeof x === "object" ? toOutput(x) : x
  }
  return out
}

/** `{{ section.settings | storelib_review_widget: storelib_reviews }}` */
export function storelibReviewWidgetFilter(input: unknown, args: unknown[], _kw: Record<string, unknown>, ctx: Ctx): string {
  const reviews = (args[0] ?? null) as WidgetReviews | null
  if (!reviews || typeof reviews !== "object") return ""
  const page = (ctx.registers.page ?? {}) as { i18n?: { locale?: string; defaultLanguage?: string; uiWords?: Record<string, string> }; designMode?: boolean; shop?: { name?: string } }
  const section = (ctx.registers.section ?? {}) as { id?: unknown }
  const i18n = page.i18n
  const html = renderReviewWidgetSection({
    settings: plainSettings(input),
    reviews: { ...reviews, locale: i18n?.locale ?? null, default_locale: !i18n || i18n.locale === i18n.defaultLanguage },
    words: i18n?.uiWords ?? null,
    shopName: page.shop?.name ?? "",
    inEditor: page.designMode === true,
    uid: typeof section.id === "string" ? section.id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) : undefined,
  })
  /* The carousel's buttons and its own movement: a script that sets up the widget it sits in. */
  /* Round AH: and a write form, sent without leaving the page; and the section a buyer comes back to from the confirm email. */
  return html.includes("data-slw-carousel") || html.includes('data-storelib-form="native"') || html.includes('id="review-posted"') ? html.replace(/<\/div>$/, `${reviewWidgetScript()}</div>`) : html
}

const WIDGET_OPTIONS = WIDGET_TYPES.map((t) => ({ label: WIDGET_INFO[t].name, value: t }))
const AS_SAVED = { label: "As saved", value: "" }
const WIDGET_SETTINGS = [
  { type: "select", id: "widget", label: "Widget", default: "product_reviews", options: WIDGET_OPTIONS },
  { type: "text", id: "review_config", label: "Saved look", default: "", info: "Made in Storelib Reviews › Widgets. Empty uses the widget's own look." },
  { type: "text", id: "heading", label: "Heading", default: "", placeholder: "As saved" },
  { type: "text", id: "subheading", label: "Supporting line", default: "", placeholder: "As saved" },
  { type: "select", id: "align", label: "Align", default: "", options: [AS_SAVED, { label: "Left", value: "left" }, { label: "Centre", value: "center" }] },
  { type: "select", id: "columns", label: "Columns on a computer", default: "", options: [AS_SAVED, ...[1, 2, 3, 4, 5, 6].map((n) => ({ label: String(n), value: String(n) }))] },
  { type: "select", id: "limit", label: "How many reviews", default: "", options: [AS_SAVED, ...[3, 4, 6, 8, 9, 10, 12, 16, 20, 24].map((n) => ({ label: String(n), value: String(n) }))] },
  { type: "select", id: "sort", label: "Order", default: "", options: [AS_SAVED, { label: "Featured first", value: "featured" }, { label: "Newest", value: "newest" }, { label: "Highest rated", value: "highest" }, { label: "Lowest rated", value: "lowest" }, { label: "With photos first", value: "photos" }] },
  { type: "select", id: "scope", label: "Whose reviews", default: "", options: [AS_SAVED, { label: "The product's on its page, else the shop's", value: "auto" }, { label: "The whole shop's", value: "shop" }] },
  { type: "select", id: "hide_when_empty", label: "With no reviews", default: "", options: [AS_SAVED, { label: "Hide it", value: "true" }, { label: "Show it anyway", value: "false" }] },
  { type: "color", id: "star_color", label: "Star colour", default: "" },
  { type: "color", id: "background", label: "Background", default: "" },
]

let widgetSectionSource: string | null = null
export function reviewWidgetSectionSource(): string {
  if (widgetSectionSource === null) {
    widgetSectionSource = `${wrapCompatTemplate(`{%- if storelib_reviews.enabled -%}{{ section.settings | storelib_review_widget: storelib_reviews }}{%- endif -%}`)}

<schema>
${JSON.stringify(
  {
    schema_version: 1,
    type: REVIEW_WIDGET_SECTION_TYPE,
    name: "Reviews widget",
    description: "Storelib Reviews: one of your review widgets, with the look you saved in Storelib Reviews › Widgets.",
    version: "1.0.0",
    icon: "star",
    settings: WIDGET_SETTINGS,
    presets: WIDGET_TYPES.map((t) => ({ name: WIDGET_INFO[t].name, settings: { widget: t } })),
    shopify: {
      name: "Reviews widget",
      settings: WIDGET_SETTINGS,
      presets: WIDGET_TYPES.map((t) => ({ name: WIDGET_INFO[t].name, settings: { widget: t } })),
    },
  },
  null,
  2,
)}
</schema>
`
  }
  return widgetSectionSource
}

/**
 * An imported theme's files with the Storelib Reviews section and the
 * Reviews widget section in them: only a theme drawn by the compatible
 * engine (its layout is a compatible file), and never over a file of the
 * theme's own by that name.
 */
export function withStorelibReviewsSection(files: Record<string, string>): Record<string, string> {
  if (!isCompatSource(files["layout/theme.storelib"])) return files
  const add: Record<string, string> = {}
  if (files[REVIEWS_SECTION_PATH] === undefined && files[`sections/${REVIEWS_SECTION_TYPE}.liquid`] === undefined) add[REVIEWS_SECTION_PATH] = reviewsSectionSource()
  if (files[REVIEW_WIDGET_SECTION_PATH] === undefined && files[`sections/${REVIEW_WIDGET_SECTION_TYPE}.liquid`] === undefined) add[REVIEW_WIDGET_SECTION_PATH] = reviewWidgetSectionSource()
  /* And Storelib Email's Newsletter (./storelib-newsletter.ts), the Email app's embed, in every imported theme. */
  if (files[NEWSLETTER_SECTION_PATH] === undefined && files[`sections/${NEWSLETTER_SECTION_TYPE}.liquid`] === undefined) add[NEWSLETTER_SECTION_PATH] = newsletterSectionSource()
  return Object.keys(add).length ? { ...files, ...add } : files
}

/**
 * ===========================================================================
 *  EVERY PRODUCT PAGE OF AN IMPORTED THEME, WITHOUT PLACING ANYTHING
 * ===========================================================================
 * A theme imported from a Shopify store that never had a reviews app has no
 * reviews block on its product template, so turning Storelib Reviews on
 * showed nothing on its product pages until the store found the Storelib
 * Reviews section and placed it. With the app's "Add to product pages" on,
 * a product page that has no reviews of its own is drawn with:
 *
 *   THE THEME'S OWN STARS   its main product section's `rating` block (Dawn
 *                           and every theme built on it have one, reading
 *                           product.metafields.reviews.rating), put under
 *                           the title when the section's schema has that
 *                           block and the page did not place it
 *   THE REVIEWS             the Storelib Reviews section, right under the
 *                           main product section
 *
 * Drawn only: nothing is written to the theme, so the template the store
 * edits is its own, and the app's switch takes both away again. A page that
 * already has reviews (a section or block whose type names reviews, or a
 * reviews app's block) is left as it is, and a main product section that
 * has its stars keeps them. Pure.
 */
export const AUTO_REVIEWS_SECTION_ID = "storelib-reviews-auto"
export const AUTO_RATING_BLOCK_ID = "storelib-rating-auto"

/** Only what this needs of a page row's section (./page.ts StoredSection), so this file imports nothing of the page's. */
interface PageSection {
  id: string
  type: string
  group?: unknown
  hidden?: boolean
  settings?: Record<string, unknown>
  blocks?: PageBlock[]
}
interface PageBlock {
  id: string
  type: string
  settings?: Record<string, unknown>
  blocks?: PageBlock[]
}

const MAIN_PRODUCT = /^(?:main[-_]?product(?:[-_][\w-]*)?|product[-_](?:template|information|main))$/i

/** A page's main product section, in either kind of theme: an imported theme's main-product, or Storelib's own `product`. Where a product widget goes under (Add to website). */
export function isMainProductSectionType(type: string): boolean {
  return type === "product" || MAIN_PRODUCT.test(type)
}
const CHROME = new Set(["header", "footer", "overlay"])

const namesReviews = (type: string) => /review/i.test(type) || isReviewsAppBlock(type)
function blocksNameReviews(blocks: PageBlock[] | undefined): boolean {
  return (blocks ?? []).some((b) => namesReviews(String(b.type ?? "")) || blocksNameReviews(b.blocks))
}
function blocksHaveStars(blocks: PageBlock[] | undefined): boolean {
  return (blocks ?? []).some((b) => b.type === "rating" || isReviewsAppBlock(b.type) || blocksHaveStars(b.blocks))
}

export function withProductPageReviews<T extends PageSection>(
  sections: T[],
  theme: { files: Record<string, string>; schemaOf: (folder: "sections" | "blocks", type: string) => Record<string, unknown> },
): T[] {
  if (theme.files[REVIEWS_SECTION_PATH] === undefined && theme.files[`sections/${REVIEWS_SECTION_TYPE}.liquid`] === undefined) return sections
  const template = sections.filter((s) => !CHROME.has(String(s.group ?? "")))
  if (template.some((s) => s.type === REVIEWS_SECTION_TYPE || /review/i.test(s.type) || blocksNameReviews(s.blocks))) return sections
  const blockTypes = (type: string) => {
    const blocks = theme.schemaOf("sections", type).blocks
    return Array.isArray(blocks) ? blocks.map((b) => String((b as { type?: unknown }).type ?? "")) : []
  }
  const main = template.find((s) => !s.hidden && MAIN_PRODUCT.test(s.type)) ?? template.find((s) => !s.hidden && blockTypes(s.type).includes("buy_buttons"))
  const out = [...sections]
  let at = main ? out.indexOf(main) : -1
  if (main && !blocksHaveStars(main.blocks) && blockTypes(main.type).includes("rating")) {
    const blocks = main.blocks ?? []
    const title = blocks.findIndex((b) => b.type === "title")
    if (title >= 0) {
      const rating: PageBlock = { id: AUTO_RATING_BLOCK_ID, type: "rating", settings: {} }
      out[at] = { ...main, blocks: [...blocks.slice(0, title + 1), rating, ...blocks.slice(title + 1)] } as T
    }
  }
  /* No main product section found: after the page's last section of its own, before the footer. */
  if (at < 0) at = template.length ? out.indexOf(template[template.length - 1]) : -1
  if (at < 0) return sections
  const reviews = { id: AUTO_REVIEWS_SECTION_ID, type: REVIEWS_SECTION_TYPE, settings: {} } as unknown as T
  out.splice(at + 1, 0, reviews)
  return out
}
