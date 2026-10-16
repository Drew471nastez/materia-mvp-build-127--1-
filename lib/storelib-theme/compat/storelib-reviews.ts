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
 *                           their card and product stars from them.
 *   A SECTION               "Storelib Reviews" (sections/storelib-reviews),
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
 *                           {% content_for 'blocks' %} or {% render block %}.
 *
 *   THE STARS ALONE         "Storelib star rating" (sections/storelib-reviews-
 *                           stars), the stars, the average and how many,
 *                           linking to the reviews; and a reviews app's
 *                           star or badge block (Judge.me's preview badge,
 *                           Loox's rating) drawn as that, not as the whole
 *                           list of reviews.
 *
 * The markup is plain Liquid over `storelib_reviews` and `rv` (the section's
 * settings, or the defaults for an app block), with its own small
 * stylesheet scoped to .slrv, inheriting the theme's font and text colour.
 * Every word it draws is the shop's own (`storelib_words`, lib/markets/
 * ui-words.ts), in the page's language once the store's Translate has it,
 * as the Storelib theme's review sections are; the reviews themselves stay
 * in the words their buyers wrote them in.
 * The write form posts to /api/reviews/site with no script and comes back
 * to #review-posted and the rest, as the Storelib theme's section does.
 * Pure: no Node, no DOM, the same in the canvas and on the website.
 */
import { wrapCompatTemplate, isCompatSource } from "./theme"

export const REVIEWS_SECTION_TYPE = "storelib-reviews"
export const REVIEWS_SECTION_PATH = `sections/${REVIEWS_SECTION_TYPE}.storelib`
export const STARS_SECTION_TYPE = "storelib-reviews-stars"
export const STARS_SECTION_PATH = `sections/${STARS_SECTION_TYPE}.storelib`

/** An app block that was a reviews app's on Shopify. */
const REVIEW_APPS = /^shopify:\/\/apps\/[^/]*(judge-?me|product-reviews|reviews|loox|yotpo|okendo|stamped|ali-?reviews|reviewsio|rivyo|opinew|storelib-reviews)[^/]*\/blocks\//i

export function isReviewsAppBlock(type: unknown): boolean {
  return typeof type === "string" && REVIEW_APPS.test(type)
}

/** A reviews app's stars-only block (a "preview badge", a "star rating"): drawn as the stars, not as the list of reviews. */
export function isReviewsBadgeBlock(type: unknown): boolean {
  return isReviewsAppBlock(type) && /\/blocks\/[^/]*(badge|stars?|rating|preview)[^/]*(\/|$)/i.test(String(type))
}

/** The settings an app block is drawn with: the section's defaults. */
export const REVIEWS_DEFAULTS = { heading: "Customer reviews", show_summary: true, show_bars: true, show_write: true, per_page: 5, star_color: "" }

const STYLE = `<style>
.slrv{--slrv-line:color-mix(in srgb,currentColor 14%,transparent);--slrv-soft:color-mix(in srgb,currentColor 6%,transparent);--slrv-muted:color-mix(in srgb,currentColor 68%,transparent);max-width:960px;margin:0 auto;padding:48px 20px;font:inherit;color:inherit}
.slrv h2{margin:0 0 20px}
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

const CARD = `<article class="slrv-card"><div class="slrv-card-top"><span class="slrv-stars" style="--rv: {{ r.rating | times: 20 }}%;" role="img" aria-label="{{ r.rating }} {{ storelib_words.out_of_five_stars | escape }}"></span>{% if storelib_reviews.show_date %}<span>{{ r.date }}</span>{% endif %}</div>{% if r.title != blank %}<h3>{{ r.title | escape }}</h3>{% endif %}<p class="slrv-body">{{ r.body | escape }}</p>{% if storelib_reviews.show_photos and r.has_photos %}<div class="slrv-photos">{% for ph in r.photos %}<a href="{{ ph | escape }}" target="_blank" rel="noopener"><img src="{{ ph | escape }}" alt="{{ storelib_words.photo_from | escape }} {{ r.author | escape }}" loading="lazy"></a>{% endfor %}</div>{% endif %}<p class="slrv-by"><b>{{ r.author | escape }}</b>{% if storelib_reviews.show_verified and r.verified %} · {{ storelib_words.verified_buyer | escape }}{% endif %}{% if slrv_here.scope == 'shop' and r.product_title != blank %} · {{ storelib_words.review_on | escape }} <a href="{{ r.product_url | escape }}">{{ r.product_title | escape }}</a>{% endif %}</p>{% if r.reply != blank %}<div class="slrv-reply"><p class="slrv-small"><b>{{ storelib_words.reply_from | escape }} {{ shop.name | escape }}</b></p><p class="slrv-body">{{ r.reply | escape }}</p></div>{% endif %}</article>`

/** The widget, over `storelib_reviews` and `rv`. */
export const REVIEWS_WIDGET_LIQUID = `{%- if storelib_reviews.enabled -%}{%- assign slrv_here = storelib_reviews.here -%}{%- assign slrv_per = rv.per_page | default: 5 -%}
{%- if slrv_here.summary.count > 0 or storelib_reviews.can_write or storelib_reviews.sample -%}
${STYLE}
<div class="slrv" id="reviews" style="--slrv-star: {% if rv.star_color != blank %}{{ rv.star_color | escape }}{% else %}{{ storelib_reviews.star_color | escape }}{% endif %};">
{%- if rv.heading != blank -%}<h2 class="h2">{{ rv.heading | escape }}</h2>{%- endif -%}
{%- if storelib_reviews.sample -%}<p class="slrv-sample">Sample reviews. Your real reviews show here once you have some.</p>{%- endif -%}
{%- if rv.show_summary -%}<div class="slrv-top"><div class="slrv-sum">{%- if slrv_here.summary.count > 0 -%}<p class="slrv-avg">{{ slrv_here.summary.average_label }}</p><div><span class="slrv-stars" style="--rv: {{ slrv_here.summary.percent }}%; font-size: 20px;" role="img" aria-label="{{ slrv_here.summary.average_label }} {{ storelib_words.out_of_five_stars | escape }}"></span><p class="slrv-count">{{ storelib_words.based_on | escape }} {{ slrv_here.summary.count }} {% if slrv_here.summary.count == 1 %}{{ storelib_words.review | escape }}{% else %}{{ storelib_words.reviews | escape }}{% endif %}</p></div>{%- else -%}<p class="slrv-none">{{ storelib_words.no_reviews_yet | escape }}</p>{%- endif -%}</div>
{%- if rv.show_bars and slrv_here.summary.count > 0 -%}<ul class="slrv-bars" aria-label="{{ storelib_words.reviews_by_rating | escape }}">{%- for b in slrv_here.summary.bars -%}<li><span>{{ b.stars }} &#9733;</span><span class="slrv-bar"><span style="width: {{ b.percent }}%;"></span></span><span>{{ b.count }}</span></li>{%- endfor -%}</ul>{%- endif -%}</div>{%- endif -%}
<p class="slrv-note" id="review-posted">{{ storelib_words.review_posted | escape }}</p><p class="slrv-note" id="review-waiting">{{ storelib_words.review_waiting | escape }}</p><p class="slrv-note" id="review-check-email">{{ storelib_words.review_check_email | escape }}</p><p class="slrv-note" id="review-error">{{ storelib_words.review_error | escape }}</p>
{%- if rv.show_write and storelib_reviews.can_write and slrv_here.scope == 'product' -%}
<details class="slrv-write"><summary class="slrv-btn"><span>{{ storelib_words.write_a_review | escape }}</span></summary>
<form class="slrv-form" method="post" action="{{ storelib_reviews.form_action }}" enctype="multipart/form-data" data-storelib-form="native">
<input type="hidden" name="productId" value="{{ slrv_here.product_id }}">
<fieldset><legend>{{ storelib_words.your_rating | escape }}</legend><div class="slrv-rate">{%- for n in (1..5) reversed -%}<input type="radio" id="slrv-r{{ n }}" name="rating" value="{{ n }}"{% if n == 5 %} required{% endif %}><label for="slrv-r{{ n }}"><span class="slrv-sr">{{ n }} {% if n == 1 %}{{ storelib_words.star | escape }}{% else %}{{ storelib_words.stars | escape }}{% endif %}</span></label>{%- endfor -%}</div></fieldset>
<label>{{ storelib_words.review_title | escape }} {{ storelib_words.optional | escape }}<input name="title" maxlength="120"></label>
<label>{{ storelib_words.your_review | escape }}<textarea name="content" rows="4" required minlength="2" maxlength="2000"></textarea></label>
<label>{{ storelib_words.your_name | escape }}<input name="name" required maxlength="40" autocomplete="given-name"></label>
<label>{{ storelib_words.email | escape }}<input type="email" name="email" required maxlength="254" autocomplete="email"></label>
{%- if storelib_reviews.photos_allowed -%}<label>{{ storelib_words.photos | escape }} {{ storelib_words.optional_up_to_four | escape }}<input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple></label>{%- endif -%}
<div class="slrv-hp" aria-hidden="true"><label>Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label></div>
<p class="slrv-small">{{ storelib_words.review_privacy | escape }}</p>
<button class="slrv-btn" type="submit"><span>{{ storelib_words.post_review | escape }}</span></button>
</form></details>
{%- endif -%}
{%- for r in slrv_here.items limit: slrv_per -%}${CARD}{%- endfor -%}
{%- if slrv_here.items.size > slrv_per -%}<details class="slrv-more"><summary class="slrv-btn slrv-quiet"><span>{{ storelib_words.show_more_reviews | escape }}</span></summary>{%- for r in slrv_here.items offset: slrv_per -%}${CARD}{%- endfor -%}</details>{%- endif -%}
</div>
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

/** The settings a star badge app block is drawn with: the star section's defaults. */
export const STARS_DEFAULTS = { show_average: true, show_count: true, link: "#reviews", size: 16, align: "left", star_color: "" }

/**
 * The stars alone, over `storelib_reviews` and `rv`: the product's on its
 * page, the shop's anywhere else, linking to the reviews. Nothing at all
 * until there is a review, except a quiet line in the builder.
 */
export const STARS_WIDGET_LIQUID = `{%- if storelib_reviews.enabled -%}{%- assign slrv_here = storelib_reviews.here -%}
{%- if slrv_here.summary.count > 0 or storelib_reviews.sample -%}
<style>.slrv-badge{display:flex;margin:6px 0;font:inherit;color:inherit}.slrv-badge--center{justify-content:center}.slrv-badge--right{justify-content:flex-end}.slrv-badge a,.slrv-badge span.slrv-b{display:inline-flex;align-items:center;gap:8px;color:inherit;text-decoration:none}.slrv-badge a:hover .slrv-bc{text-decoration:underline;text-underline-offset:3px}.slrv-bs{position:relative;display:inline-block;line-height:1;letter-spacing:2px;color:color-mix(in srgb,currentColor 18%,transparent)}.slrv-bs:before{content:"\\2605\\2605\\2605\\2605\\2605"}.slrv-bs:after{content:"\\2605\\2605\\2605\\2605\\2605";position:absolute;left:0;top:0;bottom:0;width:var(--rv,0%);overflow:hidden;white-space:nowrap;color:var(--slrv-star)}.slrv-ba{font-weight:700}.slrv-bc{opacity:.75}</style>
<div class="slrv-badge slrv-badge--{{ rv.align | default: 'left' | escape }}" style="--slrv-star: {% if rv.star_color != blank %}{{ rv.star_color | escape }}{% else %}{{ storelib_reviews.star_color | escape }}{% endif %}; font-size: {{ rv.size | default: 16 | times: 0.85 }}px;">
{%- if slrv_here.summary.count > 0 -%}<a href="{{ rv.link | default: '#reviews' | escape }}"><span class="slrv-bs" style="--rv: {{ slrv_here.summary.percent }}%; font-size: {{ rv.size | default: 16 }}px;" role="img" aria-label="{{ slrv_here.summary.average_label }} {{ storelib_words.out_of_five_stars | escape }}"></span>{%- if rv.show_average -%}<span class="slrv-ba">{{ slrv_here.summary.average_label }}</span>{%- endif -%}{%- if rv.show_count -%}<span class="slrv-bc">({{ slrv_here.summary.count }} {% if slrv_here.summary.count == 1 %}{{ storelib_words.review | escape }}{% else %}{{ storelib_words.reviews | escape }}{% endif %})</span>{%- endif -%}</a>
{%- else -%}<span class="slrv-b" style="opacity:.6"><span class="slrv-bs" style="--rv: 0%; font-size: {{ rv.size | default: 16 }}px;"></span><span class="slrv-bc">{{ storelib_words.no_reviews_yet | escape }}</span></span>{%- endif -%}
</div>
{%- endif -%}{%- endif -%}`

let starsSource: string | null = null
export function starsSectionSource(): string {
  if (starsSource === null) starsSource = makeStarsSource()
  return starsSource
}

const makeStarsSource = () => `${wrapCompatTemplate(`{%- assign rv = section.settings -%}\n${STARS_WIDGET_LIQUID}`)}

<schema>
${JSON.stringify(
  {
    schema_version: 1,
    type: STARS_SECTION_TYPE,
    name: "Storelib star rating",
    description: "The stars and how many reviews from Storelib Reviews, linking to the reviews.",
    version: "1.0.0",
    icon: "star",
    settings: [
      { type: "toggle", id: "show_average", label: "Show the average", default: true },
      { type: "toggle", id: "show_count", label: "Show how many reviews", default: true },
      { type: "text", id: "link", label: "Link", default: STARS_DEFAULTS.link },
      { type: "radio", id: "align", label: "Align", default: "left", options: [{ label: "Left", value: "left" }, { label: "Centre", value: "center" }, { label: "Right", value: "right" }] },
      { type: "range", id: "size", label: "Star size", default: STARS_DEFAULTS.size, min: 12, max: 32, step: 1, unit: "px" },
      { type: "color", id: "star_color", label: "Star colour", default: "" },
    ],
    presets: [{ name: "Storelib star rating", settings: {} }],
    shopify: {
      name: "Storelib star rating",
      settings: [
        { type: "checkbox", id: "show_average", label: "Show the average", default: true },
        { type: "checkbox", id: "show_count", label: "Show how many reviews", default: true },
        { type: "text", id: "link", label: "Link", default: STARS_DEFAULTS.link },
        { type: "select", id: "align", label: "Align", default: "left", options: [{ label: "Left", value: "left" }, { label: "Centre", value: "center" }, { label: "Right", value: "right" }] },
        { type: "range", id: "size", label: "Star size", default: STARS_DEFAULTS.size, min: 12, max: 32, step: 1, unit: "px" },
        { type: "color", id: "star_color", label: "Star colour", default: "" },
      ],
      presets: [{ name: "Storelib star rating" }],
    },
  },
  null,
  2,
)}
</schema>
`

/**
 * An imported theme's files with the Storelib Reviews section in them: only
 * a theme drawn by the compatible engine (its layout is a compatible file),
 * and never over a file of the theme's own by that name.
 */
export function withStorelibReviewsSection(files: Record<string, string>): Record<string, string> {
  if (!isCompatSource(files["layout/theme.storelib"])) return files
  const has = (type: string) => files[`sections/${type}.storelib`] !== undefined || files[`sections/${type}.liquid`] !== undefined
  const add: Record<string, string> = {}
  if (!has(REVIEWS_SECTION_TYPE)) add[REVIEWS_SECTION_PATH] = reviewsSectionSource()
  /* The stars alone, beside it: Add section › Apps › Reviews in an imported theme has both. */
  if (!has(STARS_SECTION_TYPE)) add[STARS_SECTION_PATH] = starsSectionSource()
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
