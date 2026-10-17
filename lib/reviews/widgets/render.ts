/**
 * ===========================================================================
 *  STORELIB REVIEWS WIDGETS, DRAWN
 * ===========================================================================
 * One function draws every widget, as HTML, from the reviews a page was
 * handed (lib/reviews/storefront.ts) and the widget's settings
 * (./config.ts). The same markup everywhere:
 *
 *   a Storelib theme     the Reviews widget section (sections/
 *                        reviews_widget.storelib) prints it through the
 *                        template's `review_widget` filter
 *   an imported theme    the Storelib review widget section and its
 *                        `storelib_review_widget` filter (compat/
 *                        storelib-reviews.ts)
 *   the gallery          Storelib Reviews › Widgets draws its previews and
 *                        the customizer with it, in a frame
 *
 * LIGHT BY DESIGN. Server HTML that reads without a script: the carousel is
 * a scroll-snapping row (its buttons appear once ./enhance.ts runs), the
 * strip is a CSS animation that stops on hover and for anybody who asked
 * for less motion, "Show more" is a <details>, the form is a plain form.
 * Photos load lazily. The stylesheet is one small block per widget, scoped
 * to .slw, with the widget's values as custom properties on its root; every
 * value there came through ./config.ts, so nothing typed reaches CSS.
 *
 * Every string printed is escaped here. Pure: no DOM, no server.
 */
import { UI_WORDS } from "@/lib/markets/ui-words"
import { sortReviews, type StorefrontReview, type StorefrontReviewSummary } from "../storefront"
import { WIDGET_INFO, resolveWidgetSettings, sectionOverrides, widgetWords, isWidgetType, type WidgetLabelKey, type WidgetSettings, type WidgetType } from "./config"

/** What a widget reads of a page's reviews: the shape lib/reviews/storefront.ts makes, loosely, since templates hand it over as a plain object. */
export interface WidgetReviews {
  enabled: boolean
  sample?: boolean
  star_color?: string
  can_write?: boolean
  photos_allowed?: boolean
  form_action?: string
  product?: { id: string; title?: string; summary: StorefrontReviewSummary; items: StorefrontReview[] } | null
  all: { summary: StorefrontReviewSummary; items: StorefrontReview[]; featured_items?: StorefrontReview[] }
  page_url?: string
  /** Saved widget configurations of the store, by id (./server.ts). */
  widgets?: Record<string, { type: string; settings: unknown }>
  /** The page's language, and whether it is the website's own. */
  locale?: string | null
  default_locale?: boolean
}

export interface WidgetRenderInput {
  type: WidgetType
  settings: WidgetSettings
  reviews: WidgetReviews | null | undefined
  /** The website's dictionary in the page's language (lib/markets/ui-words.ts shopWords). */
  words?: Partial<Record<string, string>> | null
  shopName?: string
  /** The builder, the gallery: an empty widget says so instead of drawing nothing, and sample reviews say they are samples. */
  inEditor?: boolean
  /** Unique on the page: the form's ids. */
  uid?: string
  /** This page's own heading and supporting line (a section's settings), over the look's. */
  page?: { heading?: string; subheading?: string }
}

/* ── Escaping ──────────────────────────────────────────────────────────── */

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }
export const esc = (v: unknown): string => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c])

/** An address a widget may link or load: ours, or http(s). A data: picture only for sample reviews. */
function safeUrl(v: unknown, allowData = false): string {
  const s = typeof v === "string" ? v.trim() : ""
  if (!s) return ""
  if (/^https?:\/\//i.test(s)) return s
  if (s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\")) return s
  if (allowData && /^data:image\/(?:svg\+xml|png|jpeg|webp);/i.test(s)) return s
  return ""
}

const UID = /^[A-Za-z0-9_-]{1,64}$/

/* ── Which reviews ─────────────────────────────────────────────────────── */

interface Pool {
  scope: "product" | "shop"
  productId: string
  summary: StorefrontReviewSummary
  items: StorefrontReview[]
}

const hasText = (r: StorefrontReview) => (r.body ?? "").trim().length > 0 || (r.title ?? "").trim().length > 0

/** The reviews a widget draws: the product's on its page (unless it is set to the whole shop), filtered, sorted, cut to its limit. */
export function widgetPool(reviews: WidgetReviews, s: WidgetSettings): Pool {
  const product = s.scope === "auto" && reviews.product ? reviews.product : null
  const base = product ? product.items : reviews.all.items
  const summary = product ? product.summary : reviews.all.summary
  const kept = base.filter((r) => r.rating >= s.min_rating && (!s.only_with_text || hasText(r)) && (!s.only_with_media || r.has_photos))
  return { scope: product ? "product" : "shop", productId: product?.id ?? "", summary, items: sortReviews(kept, s.sort).slice(0, s.limit) }
}

/* ── Look ──────────────────────────────────────────────────────────────── */

const FONTS: Record<WidgetSettings["font"], string> = {
  theme: "",
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", serif',
  rounded: 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif',
  mono: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
}

/* The star shapes, as masks: no "<" anywhere (the stylesheet is written into a <style>). */
const svg = (inner: string) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E${inner}%3C/svg%3E")`
const STAR = "M12 2.6l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.4l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"
const SHAPES = {
  sharp: svg(`%3Cpath d='${STAR}' fill='%23000'/%3E`),
  rounded: svg(`%3Cpath d='${STAR}' fill='%23000' stroke='%23000' stroke-width='2.4' stroke-linejoin='round' transform='translate(1.3 1.3) scale(.89)'/%3E`),
  outline: svg(`%3Cpath d='${STAR}' fill='none' stroke='%23000' stroke-width='1.7' stroke-linejoin='round' transform='translate(.9 .9) scale(.925)'/%3E`),
}

/** The root's custom properties: only the values that were set, each already a hex colour or a clamped number. */
function rootStyle(s: WidgetSettings, fallbackStar: string): string {
  const v: [string, string][] = []
  const color = (name: string, value: string) => {
    if (value) v.push([name, value])
  }
  v.push(["--slw-star", s.star_color || (/^#[0-9a-f]{3,8}$/i.test(fallbackStar) ? fallbackStar : "#f5a623")])
  color("--slw-text", s.text_color)
  color("--slw-muted", s.muted_color)
  color("--slw-bg", s.background)
  color("--slw-card", s.card_color)
  color("--slw-line", s.border_color)
  color("--slw-btn", s.button_color)
  color("--slw-btn-text", s.button_text)
  if (FONTS[s.font]) v.push(["--slw-font", FONTS[s.font]])
  /* 0: the theme's own heading size (a Storelib theme hands it over as --slw-theme-hs). */
  if (s.heading_size > 0) v.push(["--slw-hs", `${s.heading_size}px`])
  v.push(
    ["--slw-ts", `${s.text_size}px`],
    ["--slw-ss", `${s.star_size}px`],
    ["--slw-bw", `${s.card_style === "plain" ? 0 : s.border_width}px`],
    ["--slw-r", `${s.radius}px`],
    ["--slw-gap", `${s.gap}px`],
    ["--slw-cp", `${s.card_style === "plain" ? 0 : s.card_padding}px`],
    ["--slw-pt", `${s.padding_top}px`],
    ["--slw-pb", `${s.padding_bottom}px`],
    ["--slw-mw", `${s.max_width}px`],
    ["--slw-cols", String(s.columns)],
    ["--slw-cols-m", String(s.columns_mobile)],
    ["--slw-speed", `${s.marquee_seconds}s`],
  )
  return v.map(([k, x]) => `${k}: ${x}`).join("; ")
}

/** The stylesheet: the shared part, and only the parts this widget uses. */
const CSS_BASE = `.slw{container-type:inline-size;font-family:var(--slw-font,inherit);color:var(--slw-text,inherit);background:var(--slw-bg,transparent);--slw-m:var(--slw-muted,color-mix(in srgb,currentColor 66%,transparent));--slw-l:var(--slw-line,color-mix(in srgb,currentColor 14%,transparent));--slw-soft:color-mix(in srgb,currentColor 6%,transparent)}
.slw *,.slw *::before,.slw *::after{box-sizing:border-box}
.slw__in{max-width:var(--slw-mw);margin:0 auto;padding:var(--slw-pt) 20px var(--slw-pb)}
.slw__head{margin:0 0 20px}.slw--center .slw__head{text-align:center}
.slw__h{margin:0;font-size:var(--slw-hs,var(--slw-theme-hs,28px));line-height:1.15;font-family:var(--slw-font,inherit);color:inherit;letter-spacing:-.01em}
.slw__sub{margin:8px 0 0;font-size:var(--slw-ts);line-height:1.55;color:var(--slw-m)}
.slw-stars{position:relative;display:inline-block;vertical-align:middle;flex:none;width:calc(var(--slw-ss) * 5);height:var(--slw-ss)}
.slw-stars::before,.slw-stars::after{content:"";position:absolute;top:0;bottom:0;left:0;-webkit-mask-size:var(--slw-ss) var(--slw-ss);mask-size:var(--slw-ss) var(--slw-ss);-webkit-mask-repeat:repeat-x;mask-repeat:repeat-x;-webkit-mask-position:left center;mask-position:left center}
.slw-stars::before{right:0;background:var(--slw-empty,color-mix(in srgb,currentColor 20%,transparent));-webkit-mask-image:var(--slw-shape-e);mask-image:var(--slw-shape-e)}
.slw-stars::after{width:var(--p,0%);background:var(--slw-star);-webkit-mask-image:var(--slw-shape-f);mask-image:var(--slw-shape-f)}
.slw-star-sharp{--slw-shape-e:${SHAPES.sharp};--slw-shape-f:${SHAPES.sharp}}.slw-star-rounded{--slw-shape-e:${SHAPES.rounded};--slw-shape-f:${SHAPES.rounded}}.slw-star-outline{--slw-shape-e:${SHAPES.outline};--slw-shape-f:${SHAPES.sharp};--slw-empty:var(--slw-star)}
.slw-sample{margin:0 0 14px;font-size:13px;color:var(--slw-m)}.slw-sample b{display:inline-block;margin-right:6px;padding:1px 7px;border-radius:99px;background:var(--slw-soft);font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:inherit}
.slw-empty{margin:0;padding:18px;border:1px dashed var(--slw-l);border-radius:var(--slw-r);font-size:14px;color:var(--slw-m);text-align:center}
.slw-card{display:flex;flex-direction:column;min-width:0;padding:var(--slw-cp);background:var(--slw-card,transparent);border:var(--slw-bw) solid var(--slw-l);border-radius:var(--slw-r);font-size:var(--slw-ts);line-height:1.6}
.slw-plain .slw-card{border-radius:0}
.slw-card__top{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;color:var(--slw-m)}
.slw-card__title{margin:10px 0 0;font-size:1.05em;font-weight:600;line-height:1.35;color:inherit;overflow-wrap:anywhere}
.slw-card__body{margin:6px 0 0;white-space:pre-line;overflow-wrap:anywhere}
.slw-card__by{margin:12px 0 0;display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;font-size:13px;color:var(--slw-m)}
.slw-name{font-weight:600;color:var(--slw-text,inherit)}
.slw-ver{display:inline-flex;align-items:center;gap:4px}.slw-ver::before{content:"\\2713";font-weight:700;color:var(--slw-star)}
.slw-prod{color:inherit;text-decoration:underline;text-underline-offset:3px}
.slw-photos{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.slw-photos a{display:block;width:72px;height:72px;border-radius:calc(var(--slw-r) / 2);overflow:hidden;background:var(--slw-soft)}.slw-photos img{width:100%;height:100%;object-fit:cover;display:block}
.slw-reply{margin-top:12px;padding:10px 12px;border-left:2px solid var(--slw-l);background:var(--slw-soft);border-radius:0 calc(var(--slw-r) / 2) calc(var(--slw-r) / 2) 0;font-size:.94em}.slw-reply p{margin:0}.slw-reply p+p{margin-top:4px}
.slw-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 20px;border-radius:min(var(--slw-r),999px);border:1px solid var(--slw-btn,currentColor);background:var(--slw-btn,transparent);color:var(--slw-btn-text,inherit);font:inherit;font-weight:600;cursor:pointer;list-style:none;text-decoration:none}
.slw-btn::-webkit-details-marker{display:none}.slw-btn:focus-visible,.slw a:focus-visible,.slw-track:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.slw-quiet{background:transparent;color:inherit;border-color:var(--slw-l)}
.slw-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.slw-grid{display:grid;gap:var(--slw-gap);grid-template-columns:repeat(var(--slw-cols-m),minmax(0,1fr))}
@container (min-width:640px){.slw-grid{grid-template-columns:repeat(min(var(--slw-cols),2),minmax(0,1fr))}}
@container (min-width:900px){.slw-grid{grid-template-columns:repeat(var(--slw-cols),minmax(0,1fr))}}
.slw-line{display:inline-flex;flex-wrap:wrap;align-items:center;gap:6px 10px;color:inherit;text-decoration:none;font-size:var(--slw-ts)}
.slw-avg{font-weight:700;font-variant-numeric:tabular-nums}
.slw-count{color:var(--slw-m)}a.slw-line:hover .slw-count{text-decoration:underline;text-underline-offset:3px}
`

const CSS_SUMMARY = `.slw-top{display:flex;flex-wrap:wrap;align-items:center;gap:18px 40px;padding-bottom:20px;margin-bottom:8px;border-bottom:1px solid var(--slw-l)}
.slw-sum{display:flex;align-items:center;gap:14px}
.slw-big{margin:0;font-size:calc(var(--slw-hs,var(--slw-theme-hs,28px)) * 1.45);font-weight:700;line-height:1;font-variant-numeric:tabular-nums}
.slw-based{margin:6px 0 0;font-size:14px;color:var(--slw-m)}
.slw-bars{list-style:none;margin:0;padding:0;display:grid;gap:6px;min-width:200px;flex:0 1 320px}
.slw-bars li{display:grid;grid-template-columns:34px 1fr 30px;align-items:center;gap:8px;font-size:13px;color:var(--slw-m);font-variant-numeric:tabular-nums}
.slw-bar{height:7px;border-radius:9px;background:var(--slw-soft);overflow:hidden}.slw-bar span{display:block;height:100%;background:var(--slw-star);border-radius:9px}
.slw-top .slw-btn{margin-left:auto}
`

const CSS_PRODUCT = `.slw-list{display:grid;gap:var(--slw-gap)}.slw-plain .slw-list{gap:0}.slw-plain .slw-list>.slw-card{padding:20px 0;border-bottom:1px solid var(--slw-l)}
.slw-note{display:none;margin:16px 0 0;padding:12px 14px;border-radius:calc(var(--slw-r) / 2);background:var(--slw-soft);font-size:14px}.slw-note:target{display:block}
.slw-write{margin:16px 0}.slw-write[open]>summary{margin-bottom:14px}
.slw-form{display:grid;gap:12px;max-width:620px;padding:18px;border:1px solid var(--slw-l);border-radius:var(--slw-r)}
.slw-form fieldset{border:0;margin:0;padding:0}.slw-form legend,.slw-form label{font-size:14px;font-weight:600}.slw-form label{display:grid;gap:6px}
.slw-form input:not([type=radio]):not([type=file]),.slw-form textarea{width:100%;padding:10px 12px;font:inherit;font-size:16px;color:inherit;background:transparent;border:1px solid var(--slw-l);border-radius:calc(var(--slw-r) / 2)}
.slw-rate{display:inline-flex;flex-direction:row-reverse;justify-content:flex-end}.slw-rate input{position:absolute;opacity:0;width:1px;height:1px}
.slw-rate label{display:block;width:36px;height:36px;font-size:28px;line-height:36px;text-align:center;cursor:pointer;color:var(--slw-l)}.slw-rate label::before{content:"\\2605"}
.slw-rate input:checked~label,.slw-rate label:hover,.slw-rate label:hover~label{color:var(--slw-star)}.slw-rate input:focus-visible+label{outline:2px solid currentColor}
.slw-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.slw-small{margin:0;font-size:13px;color:var(--slw-m)}
.slw-more{margin-top:16px}.slw-more[open]>summary{display:none}.slw-more>.slw-list{margin-top:0}
`

const CSS_CAROUSEL = `.slw-car{position:relative}
.slw-track{display:grid;grid-auto-flow:column;grid-auto-columns:86%;gap:var(--slw-gap);overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;padding:2px 2px 12px;margin:0 -2px;scrollbar-width:thin;overscroll-behavior-x:contain}
@container (min-width:640px){.slw-track{grid-auto-columns:calc((100% - var(--slw-gap)) / 2)}}
@container (min-width:900px){.slw-track{grid-auto-columns:calc((100% - (var(--slw-cols) - 1) * var(--slw-gap)) / var(--slw-cols))}}
.slw-track>.slw-card{scroll-snap-align:start}
.slw-navs{display:none;justify-content:flex-end;gap:8px;margin-top:10px}[data-slw-ready] .slw-navs{display:flex}
.slw-nav{width:40px;height:40px;border-radius:99px;border:1px solid var(--slw-l);background:var(--slw-card,transparent);color:inherit;font:inherit;font-size:18px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}.slw-nav:disabled{opacity:.35;cursor:default}.slw-nav:focus-visible{outline:2px solid currentColor;outline-offset:2px}
@media (prefers-reduced-motion:reduce){.slw-track{scroll-behavior:auto}}
`

const CSS_TESTIMONIALS = `.slw-quote{align-items:center;text-align:center}.slw--left .slw-quote{align-items:flex-start;text-align:left}
.slw-quote .slw-card__body{margin-top:14px;font-size:1.08em;line-height:1.55}
.slw-quote .slw-card__body::before{content:"\\201C"}.slw-quote .slw-card__body::after{content:"\\201D"}
.slw-quote .slw-card__by{justify-content:inherit;margin-top:16px}
`

const CSS_MEDIA = `.slw-tiles{display:grid;gap:var(--slw-gap);grid-template-columns:repeat(var(--slw-cols-m),minmax(0,1fr))}
@container (min-width:640px){.slw-tiles{grid-template-columns:repeat(min(var(--slw-cols),3),minmax(0,1fr))}}
@container (min-width:900px){.slw-tiles{grid-template-columns:repeat(var(--slw-cols),minmax(0,1fr))}}
.slw-tile{position:relative;display:block;aspect-ratio:1;overflow:hidden;border-radius:var(--slw-r);background:var(--slw-soft);color:#fff;text-decoration:none}
.slw-tile img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s ease}
.slw-tile:hover img{transform:scale(1.03)}
.slw-tile__meta{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;gap:2px;padding:24px 10px 8px;background:linear-gradient(transparent,rgba(0,0,0,.6));font-size:12px;line-height:1.3}
.slw-tile__meta .slw-stars{--slw-ss:12px;--slw-empty:rgba(255,255,255,.4)}
@media (prefers-reduced-motion:reduce){.slw-tile img{transition:none}}
`

const CSS_MARQUEE = `.slw-mq{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)}
.slw-mq__track{display:flex;width:max-content;animation:slw-mq var(--slw-speed) linear infinite}
.slw-mq:hover .slw-mq__track,.slw-mq:focus-within .slw-mq__track{animation-play-state:paused}
.slw-mq__set{display:flex;gap:var(--slw-gap);padding-right:var(--slw-gap)}
.slw-mq .slw-card{width:min(320px,78vw);flex:none;font-size:calc(var(--slw-ts) * .93)}
.slw-mq .slw-card__body{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
@keyframes slw-mq{to{transform:translateX(-50%)}}
@media (prefers-reduced-motion:reduce){.slw-mq{overflow-x:auto;-webkit-mask-image:none;mask-image:none}.slw-mq__track{animation:none}.slw-mq__set[aria-hidden]{display:none}}
`

const CSS_BADGE = `.slw-badge{display:flex}.slw--center .slw-badge{justify-content:center}
.slw-banner{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px 14px;padding:16px 20px;border:var(--slw-bw) solid var(--slw-l);border-radius:var(--slw-r);background:var(--slw-card,var(--slw-soft));font-size:calc(var(--slw-ts) * 1.08)}
.slw--left .slw-banner{justify-content:flex-start}
`

const CSS_FOR: Record<WidgetType, string> = {
  product_reviews: CSS_SUMMARY + CSS_PRODUCT,
  star_badge: CSS_BADGE,
  rating_summary: CSS_SUMMARY,
  grid: CSS_SUMMARY,
  carousel: CSS_CAROUSEL,
  testimonials: CSS_TESTIMONIALS,
  media_wall: CSS_MEDIA,
  marquee: CSS_MARQUEE,
  trust_badge: CSS_BADGE,
}

/** The whole stylesheet of one widget type. Exported for the tests: never a "<" in it. */
export function widgetCss(type: WidgetType): string {
  return (CSS_BASE + CSS_FOR[type]).replace(/\n/g, "")
}

/* ── Pieces ────────────────────────────────────────────────────────────── */

type Words = Record<WidgetLabelKey, string>

function fmtCount(n: number, locale: string | null | undefined): string {
  try {
    return new Intl.NumberFormat(locale && locale !== "default" ? locale : "en").format(n)
  } catch {
    return String(n)
  }
}

function stars(rating: number, percent: number, w: Words): string {
  const label = `${Number.isInteger(rating) ? rating : rating.toFixed(1)} ${w.out_of_five_stars}`
  return `<span class="slw-stars" style="--p: ${Math.max(0, Math.min(100, Math.round(percent)))}%" role="img" aria-label="${esc(label)}"></span>`
}

const countWord = (n: number, w: Words) => (n === 1 ? w.review : w.reviews)

function card(r: StorefrontReview, s: WidgetSettings, w: Words, ctx: { shopName: string; scope: "product" | "shop"; sample: boolean }, cls = "slw-card"): string {
  const parts: string[] = []
  parts.push(`<div class="slw-card__top">${stars(r.rating, r.rating * 20, w)}${s.show_date && r.date ? `<time datetime="${esc(r.iso)}">${esc(r.date)}</time>` : ""}</div>`)
  if (s.show_title && r.title) parts.push(`<h3 class="slw-card__title">${esc(r.title)}</h3>`)
  if (r.body) parts.push(`<p class="slw-card__body">${esc(r.body)}</p>`)
  if (s.show_photos && r.photos.length) {
    const pics = r.photos
      .map((p) => safeUrl(p, ctx.sample))
      .filter(Boolean)
      .map((p) => `<a href="${esc(p)}" target="_blank" rel="noopener"><img src="${esc(p)}" alt="${esc(`${w.photo_from} ${r.author}`)}" loading="lazy" decoding="async" width="72" height="72"></a>`)
      .join("")
    if (pics) parts.push(`<div class="slw-photos">${pics}</div>`)
  }
  const by: string[] = []
  if (s.show_name) by.push(`<span class="slw-name">${esc(r.author)}</span>`)
  if (s.show_verified && r.verified) by.push(`<span class="slw-ver">${esc(w.verified_buyer)}</span>`)
  if (s.show_product && ctx.scope === "shop" && r.product_title) {
    const href = safeUrl(r.product_url)
    by.push(href ? `<a class="slw-prod" href="${esc(href)}">${esc(r.product_title)}</a>` : `<span>${esc(r.product_title)}</span>`)
  }
  if (by.length) parts.push(`<p class="slw-card__by">${by.join("")}</p>`)
  if (s.show_reply && r.reply) parts.push(`<div class="slw-reply"><p><b>${esc(w.reply_from)} ${esc(ctx.shopName)}</b></p><p>${esc(r.reply)}</p></div>`)
  return `<article class="${cls}" data-review-id="${esc(r.id)}">${parts.join("")}</article>`
}

/** The widget's own heading when the look has none, in the page's language. */
function ownHeading(type: WidgetType, w: Words): string {
  if (type === "product_reviews" || type === "rating_summary") return w.customer_reviews
  if (type === "grid" || type === "carousel" || type === "testimonials") return w.what_customers_say
  if (type === "media_wall") return w.customer_photos
  return ""
}

/**
 * The heading: this page's own (a section setting, translated with the
 * page), else the store's words for this language, else the look's, else
 * the widget's own in the page's language. Off, none at all.
 */
function head(type: WidgetType, s: WidgetSettings, w: Words, page: { heading?: string; subheading?: string }): string {
  if (!s.show_heading) return ""
  const heading = page.heading || w.heading || s.heading || ownHeading(type, w)
  const sub = page.subheading || w.subheading || s.subheading
  if (!heading && !sub) return ""
  return `<div class="slw__head">${heading ? `<h2 class="slw__h h2">${esc(heading)}</h2>` : ""}${sub ? `<p class="slw__sub">${esc(sub)}</p>` : ""}</div>`
}

function summaryBlock(sum: StorefrontReviewSummary, s: WidgetSettings, w: Words, locale: string | null | undefined, action = ""): string {
  const left = sum.count > 0
    ? `<div class="slw-sum">${s.show_average ? `<p class="slw-big">${esc(sum.average_label)}</p>` : ""}<div>${stars(sum.average, sum.percent, w)}${s.show_count ? `<p class="slw-based">${esc(w.based_on)} ${esc(fmtCount(sum.count, locale))} ${esc(countWord(sum.count, w))}</p>` : ""}</div></div>`
    : `<div class="slw-sum"><p class="slw-based">${esc(w.no_reviews_yet)}</p></div>`
  const bars = s.show_bars && sum.count > 0
    ? `<ul class="slw-bars" aria-label="${esc(w.reviews_by_rating)}">${sum.bars.map((b) => `<li><span>${b.stars} &#9733;</span><span class="slw-bar"><span style="width: ${Math.max(0, Math.min(100, Math.round(b.percent)))}%"></span></span><span>${esc(fmtCount(b.count, locale))}</span></li>`).join("")}</ul>`
    : ""
  return `<div class="slw-top">${left}${bars}${action}</div>`
}

function writeForm(reviews: WidgetReviews, productId: string, w: Words, uid: string): string {
  const id = (n: number) => `slw-${uid}-r${n}`
  const rate = [5, 4, 3, 2, 1].map((n) => `<input type="radio" id="${id(n)}" name="rating" value="${n}"${n === 5 ? " required" : ""}><label for="${id(n)}"><span class="slw-sr">${n} ${n === 1 ? w.star : w.stars}</span></label>`).join("")
  const action = safeUrl(reviews.form_action) || "/api/reviews/site"
  return `<details class="slw-write"><summary class="slw-btn">${esc(w.write_a_review)}</summary>`
    + `<form class="slw-form" method="post" action="${esc(action)}" enctype="multipart/form-data" data-storelib-form="native">`
    + `<input type="hidden" name="productId" value="${esc(productId)}">`
    + `<fieldset><legend>${esc(w.your_rating)}</legend><div class="slw-rate">${rate}</div></fieldset>`
    + `<label>${esc(w.review_title)} ${esc(w.optional)}<input name="title" maxlength="120"></label>`
    + `<label>${esc(w.your_review)}<textarea name="content" rows="4" required minlength="2" maxlength="2000"></textarea></label>`
    + `<label>${esc(w.your_name)}<input name="name" required maxlength="40" autocomplete="given-name"></label>`
    + `<label>${esc(w.email)}<input type="email" name="email" required maxlength="254" autocomplete="email"></label>`
    + (reviews.photos_allowed ? `<label>${esc(w.photos)} ${esc(w.optional_up_to_four)}<input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple></label>` : "")
    + `<div class="slw-hp" aria-hidden="true"><label>Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label></div>`
    + `<p class="slw-small">${esc(w.review_privacy)}</p>`
    + `<button class="slw-btn" type="submit">${esc(w.post_review)}</button></form></details>`
}

function notes(w: Words): string {
  return `<p class="slw-note" id="review-posted">${esc(w.review_posted)}</p><p class="slw-note" id="review-waiting">${esc(w.review_waiting)}</p><p class="slw-note" id="review-check-email">${esc(w.review_check_email)}</p><p class="slw-note" id="review-error">${esc(w.review_error)}</p>`
}

/* ── The widgets ───────────────────────────────────────────────────────── */

/**
 * The widget's HTML, or "" when it draws nothing: Storelib Reviews off, or
 * no reviews and the widget set to hide then. In the builder an empty
 * widget says so instead, so it can be found and styled.
 */
export function renderReviewWidget(input: WidgetRenderInput): string {
  const { type, settings: s } = input
  const reviews = input.reviews
  if (!reviews || !reviews.enabled || !reviews.all) return ""
  const locale = reviews.locale ?? null
  const w = widgetWords(input.words, s.labels, { locale, isDefault: reviews.default_locale ?? !locale }, UI_WORDS as unknown as Record<string, string>)
  const pool = widgetPool(reviews, s)
  const sample = reviews.sample === true
  const shopName = input.shopName || ""
  const uid = input.uid && UID.test(input.uid) ? input.uid : "w"
  const ctx = { shopName, scope: pool.scope, sample }
  const editor = input.inEditor === true
  const page = input.page ?? {}
  const canWrite = type === "product_reviews" && s.show_write && reviews.can_write === true && pool.scope === "product"

  const summaryOnly = type === "star_badge" || type === "trust_badge" || type === "rating_summary"
  const empty = summaryOnly ? pool.summary.count === 0 : pool.items.length === 0 && !(type === "product_reviews" && (canWrite || pool.summary.count > 0))
  if (empty && s.hide_when_empty && !editor) return ""

  let body = ""
  const emptyNote = editor ? `<p class="slw-empty">${esc(w.no_reviews_yet)}</p>` : ""
  switch (type) {
    case "product_reviews": {
      body = head(type, s, w, page)
        + (s.show_summary ? summaryBlock(pool.summary, s, w, locale) : "")
        + notes(w)
        + (canWrite ? writeForm(reviews, pool.productId, w, uid) : "")
      const first = pool.items.slice(0, s.rows_before_more)
      const rest = pool.items.slice(s.rows_before_more)
      if (first.length) body += `<div class="slw-list">${first.map((r) => card(r, s, w, ctx)).join("")}</div>`
      else if (!s.show_summary) body += emptyNote
      if (rest.length) body += `<details class="slw-more"><summary class="slw-btn slw-quiet">${esc(w.show_more_reviews)}</summary><div class="slw-list">${rest.map((r) => card(r, s, w, ctx)).join("")}</div></details>`
      break
    }
    case "star_badge": {
      const sum = pool.summary
      const href = pool.scope === "product" ? "#reviews" : safeUrl(reviews.page_url) || "#reviews"
      const inner = sum.count > 0
        ? `${stars(sum.average, sum.percent, w)}${s.show_average ? `<span class="slw-avg">${esc(sum.average_label)}</span>` : ""}${s.show_count ? `<span class="slw-count">(${esc(fmtCount(sum.count, locale))} ${esc(countWord(sum.count, w))})</span>` : ""}`
        : `${stars(0, 0, w)}<span class="slw-count">${esc(w.no_reviews_yet)}</span>`
      body = `<div class="slw-badge">${sum.count > 0 ? `<a class="slw-line" href="${esc(href)}">${inner}</a>` : `<span class="slw-line">${inner}</span>`}</div>`
      break
    }
    case "trust_badge": {
      const sum = pool.summary
      const href = safeUrl(reviews.page_url)
      const text = sum.count > 0
        ? `${stars(sum.average, sum.percent, w)}${s.show_average ? `<span class="slw-avg">${esc(sum.average_label)}</span>` : ""}${s.show_count ? `<span class="slw-count">${esc(w.rating_from)} ${esc(fmtCount(sum.count, locale))} ${esc(countWord(sum.count, w))}</span>` : ""}`
        : `${stars(0, 0, w)}<span class="slw-count">${esc(w.no_reviews_yet)}</span>`
      const line = href && sum.count > 0 ? `<a class="slw-line" href="${esc(href)}">${text}</a>` : `<span class="slw-line">${text}</span>`
      body = head(type, s, w, page) + `<div class="slw-badge">${s.badge_layout === "banner" ? `<div class="slw-banner">${line}</div>` : line}</div>`
      break
    }
    case "rating_summary": {
      const action = s.show_write && pool.scope === "product" && reviews.can_write ? `<a class="slw-btn" href="#reviews">${esc(w.write_a_review)}</a>` : ""
      body = head(type, s, w, page) + summaryBlock(pool.summary, s, w, locale, action)
      break
    }
    case "grid": {
      const line = s.show_summary && pool.summary.count > 0 ? `<p class="slw-line" style="margin:0 0 18px">${stars(pool.summary.average, pool.summary.percent, w)}<span class="slw-avg">${esc(pool.summary.average_label)}</span><span class="slw-count">${esc(w.rating_from)} ${esc(fmtCount(pool.summary.count, locale))} ${esc(countWord(pool.summary.count, w))}</span></p>` : ""
      body = head(type, s, w, page) + line + (pool.items.length ? `<div class="slw-grid">${pool.items.map((r) => card(r, s, w, ctx)).join("")}</div>` : emptyNote)
      break
    }
    case "carousel": {
      const n = pool.items.length
      const label = page.heading || s.heading || ownHeading(type, w) || WIDGET_INFO.carousel.name
      body = head(type, s, w, page) + (n
        ? `<div class="slw-car" data-slw-carousel${s.autoplay ? ` data-autoplay="${s.autoplay_seconds}"` : ""}><div class="slw-track" role="region" aria-roledescription="carousel" aria-label="${esc(label)}" tabindex="0">${pool.items.map((r, i) => card(r, s, w, ctx, "slw-card").replace("<article ", `<article role="group" aria-roledescription="slide" aria-label="${i + 1} / ${n}" `)).join("")}</div><div class="slw-navs"><button type="button" class="slw-nav" data-slw-prev aria-label="${esc(w.previous)}">&#8592;</button><button type="button" class="slw-nav" data-slw-next aria-label="${esc(w.next)}">&#8594;</button></div></div>`
        : emptyNote)
      break
    }
    case "testimonials": {
      body = head(type, s, w, page) + (pool.items.length ? `<div class="slw-grid">${pool.items.map((r) => card(r, s, w, ctx, "slw-card slw-quote")).join("")}</div>` : emptyNote)
      break
    }
    case "media_wall": {
      const tiles: string[] = []
      for (const r of pool.items) {
        for (const p of r.photos) {
          const src = safeUrl(p, sample)
          if (!src) continue
          if (tiles.length >= s.limit) break
          tiles.push(`<a class="slw-tile" href="${esc(src)}" target="_blank" rel="noopener"><img src="${esc(src)}" alt="${esc(`${w.photo_from} ${r.author}`)}" loading="lazy" decoding="async"><span class="slw-tile__meta">${stars(r.rating, r.rating * 20, w)}${s.show_name ? `<span>${esc(r.author)}</span>` : ""}</span></a>`)
        }
      }
      if (!tiles.length && s.hide_when_empty && !editor) return ""
      body = head(type, s, w, page) + (tiles.length ? `<div class="slw-tiles" aria-label="${esc(w.customer_photos)}" role="list">${tiles.map((t) => t.replace("<a ", '<a role="listitem" ')).join("")}</div>` : emptyNote)
      break
    }
    case "marquee": {
      if (pool.items.length) {
        const set = pool.items.map((r) => card({ ...r, body: r.body.length > 180 ? `${r.body.slice(0, 177).trimEnd()}...` : r.body }, s, w, ctx)).join("")
        body = head(type, s, w, page) + `<div class="slw-mq" tabindex="0" aria-label="${esc(page.heading || s.heading || w.customer_reviews)}"><div class="slw-mq__track"><div class="slw-mq__set">${set}</div><div class="slw-mq__set" aria-hidden="true">${set.replace(/<a /g, '<a tabindex="-1" ')}</div></div></div>`
      } else body = head(type, s, w, page) + emptyNote
      break
    }
  }

  const sampleNote = sample && editor ? `<p class="slw-sample"><b>Sample</b>Your real reviews show here once you have some.</p>` : ""
  const css = `<style>${widgetCss(type)}</style>`
  const cls = ["slw", `slw--${type}`, `slw--${s.align}`, `slw-${s.card_style}`, `slw-star-${s.star_shape}`].join(" ")
  const anchor = type === "product_reviews" ? ` id="reviews"` : ""
  return `<div class="${esc(cls)}"${anchor} data-slw="${type}" style="${esc(rootStyle(s, reviews.star_color ?? ""))}">${css}<div class="slw__in">${sampleNote}${body}</div></div>`
}

/* ── From a section ────────────────────────────────────────────────────── */

/**
 * A page's section (either kind of theme) as a widget: its `widget`, the
 * saved configuration it names (`review_config`, one of the store's, of the
 * same widget), and what it changes for this page only.
 */
export function renderReviewWidgetSection(input: {
  settings: Record<string, unknown> | null | undefined
  reviews: WidgetReviews | null | undefined
  words?: Partial<Record<string, string>> | null
  shopName?: string
  inEditor?: boolean
  uid?: string
}): string {
  const settings = input.settings ?? {}
  const type = isWidgetType(settings.widget) ? settings.widget : "product_reviews"
  const id = typeof settings.review_config === "string" ? settings.review_config : ""
  const saved = id && input.reviews?.widgets?.[id]
  const base = saved && saved.type === type ? saved.settings : undefined
  /* The page's own heading wins over the look's words in every language: it is the page's text, translated with the page. */
  const { heading, subheading, ...overrides } = sectionOverrides(settings)
  return renderReviewWidget({
    type,
    settings: resolveWidgetSettings(type, base, overrides),
    page: { heading, subheading },
    reviews: input.reviews,
    words: input.words,
    shopName: input.shopName,
    inEditor: input.inEditor,
    uid: input.uid,
  })
}
