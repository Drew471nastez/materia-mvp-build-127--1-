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
 * The markup is plain Liquid over `storelib_reviews` and `rv` (the section's
 * settings, or the defaults for an app block), with its own small
 * stylesheet scoped to .slrv, inheriting the theme's font and text colour.
 * The write form posts to /api/reviews/site with no script and comes back
 * to #review-posted and the rest, as the Storelib theme's section does.
 * Pure: no Node, no DOM, the same in the canvas and on the website.
 */
import { wrapCompatTemplate, isCompatSource } from "./theme"

export const REVIEWS_SECTION_TYPE = "storelib-reviews"
export const REVIEWS_SECTION_PATH = `sections/${REVIEWS_SECTION_TYPE}.storelib`

/** An app block that was a reviews app's on Shopify. */
const REVIEW_APPS = /^shopify:\/\/apps\/[^/]*(judge-?me|product-reviews|reviews|loox|yotpo|okendo|stamped|ali-?reviews|reviewsio|rivyo|opinew|storelib-reviews)[^/]*\/blocks\//i

export function isReviewsAppBlock(type: unknown): boolean {
  return typeof type === "string" && REVIEW_APPS.test(type)
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

const CARD = `<article class="slrv-card"><div class="slrv-card-top"><span class="slrv-stars" style="--rv: {{ r.rating | times: 20 }}%;" role="img" aria-label="{{ r.rating }} out of 5 stars"></span>{% if storelib_reviews.show_date %}<span>{{ r.date }}</span>{% endif %}</div>{% if r.title != blank %}<h3>{{ r.title | escape }}</h3>{% endif %}<p class="slrv-body">{{ r.body | escape }}</p>{% if storelib_reviews.show_photos and r.has_photos %}<div class="slrv-photos">{% for ph in r.photos %}<a href="{{ ph | escape }}" target="_blank" rel="noopener"><img src="{{ ph | escape }}" alt="Photo from {{ r.author | escape }}" loading="lazy"></a>{% endfor %}</div>{% endif %}<p class="slrv-by"><b>{{ r.author | escape }}</b>{% if storelib_reviews.show_verified and r.verified %} · Verified buyer{% endif %}{% if slrv_here.scope == 'shop' and r.product_title != blank %} · on <a href="{{ r.product_url | escape }}">{{ r.product_title | escape }}</a>{% endif %}</p>{% if r.reply != blank %}<div class="slrv-reply"><p class="slrv-small"><b>Reply from {{ shop.name | escape }}</b></p><p class="slrv-body">{{ r.reply | escape }}</p></div>{% endif %}</article>`

/** The widget, over `storelib_reviews` and `rv`. */
export const REVIEWS_WIDGET_LIQUID = `{%- if storelib_reviews.enabled -%}{%- assign slrv_here = storelib_reviews.here -%}{%- assign slrv_per = rv.per_page | default: 5 -%}
{%- if slrv_here.summary.count > 0 or storelib_reviews.can_write or request.design_mode -%}
${STYLE}
<div class="slrv" id="reviews" style="--slrv-star: {% if rv.star_color != blank %}{{ rv.star_color | escape }}{% else %}{{ storelib_reviews.star_color | escape }}{% endif %};">
{%- if rv.heading != blank -%}<h2 class="h2">{{ rv.heading | escape }}</h2>{%- endif -%}
{%- if request.design_mode and storelib_reviews.sample -%}<p class="slrv-sample">Sample reviews. Your real reviews show here once you have some.</p>{%- endif -%}
{%- if rv.show_summary -%}<div class="slrv-top"><div class="slrv-sum">{%- if slrv_here.summary.count > 0 -%}<p class="slrv-avg">{{ slrv_here.summary.average_label }}</p><div><span class="slrv-stars" style="--rv: {{ slrv_here.summary.percent }}%; font-size: 20px;" role="img" aria-label="{{ slrv_here.summary.average_label }} out of 5 stars"></span><p class="slrv-count">Based on {{ slrv_here.summary.count_label }}</p></div>{%- else -%}<p class="slrv-none">No reviews yet</p>{%- endif -%}</div>
{%- if rv.show_bars and slrv_here.summary.count > 0 -%}<ul class="slrv-bars">{%- for b in slrv_here.summary.bars -%}<li><span>{{ b.stars }} &#9733;</span><span class="slrv-bar"><span style="width: {{ b.percent }}%;"></span></span><span>{{ b.count }}</span></li>{%- endfor -%}</ul>{%- endif -%}</div>{%- endif -%}
<p class="slrv-note" id="review-posted">Thanks. Your review is up.</p><p class="slrv-note" id="review-waiting">Thanks. Your review shows once the store has read it.</p><p class="slrv-note" id="review-check-email">Thanks. Check your email and open the link in it to post your review.</p><p class="slrv-note" id="review-error">That didn't go through. Check the form and try again.</p>
{%- if rv.show_write and storelib_reviews.can_write and slrv_here.scope == 'product' -%}
<details class="slrv-write"><summary class="slrv-btn"><span>Write a review</span></summary>
<form class="slrv-form" method="post" action="{{ storelib_reviews.form_action }}" enctype="multipart/form-data" data-storelib-form="native">
<input type="hidden" name="productId" value="{{ slrv_here.product_id }}">
<fieldset><legend>Your rating</legend><div class="slrv-rate">{%- for n in (1..5) reversed -%}<input type="radio" id="slrv-r{{ n }}" name="rating" value="{{ n }}"{% if n == 5 %} required{% endif %}><label for="slrv-r{{ n }}"><span class="slrv-sr">{{ n }} stars</span></label>{%- endfor -%}</div></fieldset>
<label>Title (optional)<input name="title" maxlength="120"></label>
<label>Your review<textarea name="content" rows="4" required minlength="2" maxlength="2000"></textarea></label>
<label>Name<input name="name" required maxlength="40" autocomplete="given-name"></label>
<label>Email<input type="email" name="email" required maxlength="254" autocomplete="email"></label>
{%- if storelib_reviews.photos_allowed -%}<label>Photos (optional, up to 4)<input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple></label>{%- endif -%}
<div class="slrv-hp" aria-hidden="true"><label>Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label></div>
<p class="slrv-small">Only your first name and last initial are shown. Your email is not.</p>
<button class="slrv-btn" type="submit"><span>Post review</span></button>
</form></details>
{%- endif -%}
{%- for r in slrv_here.items limit: slrv_per -%}${CARD}{%- endfor -%}
{%- if slrv_here.items.size > slrv_per -%}<details class="slrv-more"><summary class="slrv-btn slrv-quiet"><span>Show more reviews</span></summary>{%- for r in slrv_here.items offset: slrv_per -%}${CARD}{%- endfor -%}</details>{%- endif -%}
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

/**
 * An imported theme's files with the Storelib Reviews section in them: only
 * a theme drawn by the compatible engine (its layout is a compatible file),
 * and never over a file of the theme's own by that name.
 */
export function withStorelibReviewsSection(files: Record<string, string>): Record<string, string> {
  if (files[REVIEWS_SECTION_PATH] !== undefined || files[`sections/${REVIEWS_SECTION_TYPE}.liquid`] !== undefined) return files
  if (!isCompatSource(files["layout/theme.storelib"])) return files
  return { ...files, [REVIEWS_SECTION_PATH]: reviewsSectionSource() }
}
