/**
 * The vocabulary and the helpers every skin's source shares (round W10).
 * scripts/build-onepage-skins.mjs puts the skins together; each family
 * (aero.mjs, aqua.mjs, ...) is one function drawn once per variant with its
 * own palette, so a second version of a skin is a palette, not a copy.
 *
 * Vocabulary (what the live page and the theme card already carry):
 *   LINK   a link button (a.op-btn), a card's link ([data-tp-link])
 *   CTA    a product's button, the subscribe and contact form's Send
 *   CARD   a product, a featured link card, a promo code, a testimonial
 *   FAQ    a question; CELL a countdown's number; BOX the subscribe and contact forms
 *   SURF   anything else drawn in the page's button look (themeButtonStyle
 *          sets background-clip: padding-box on every bordered one, and
 *          every skinned theme has a border): a block added later is
 *          skinned without a line here.
 * Inline colours are the theme's; a rule overrides one only where the
 * material needs it (!important), and never the words of a link, so the
 * hover's colours (app/globals.css .op-btn) still win.
 *
 * WORDS ON A PAINTED SURFACE (round W10). The owner: "Messenger subscribe
 * block text white on white", "Grunge 'Join my newsletter' invisible on
 * paper". A skin that paints a surface a colour of its own (paper, a window,
 * a sticker) also says what colour the words on it are: `onSurface` sets the
 * surface's colour and every inline colour inside it (the form's title and
 * line, a product's name and price, a testimonial), never a button's, and
 * records the pair, which tests/onepage-themes-w10.test.ts measures at 4.5:1
 * even at 70% (the blocks draw their small lines at .7 to .85).
 */

/** An SVG as a CSS url(), encoded the way every browser reads it. */
export const svg = (body, viewBox, extra = "") =>
  `url("data:image/svg+xml,${`<svg xmlns='http://www.w3.org/2000/svg' viewBox='${viewBox}'${extra}>${body}</svg>`.replace(/[%#<>"]/g, (c) => encodeURIComponent(c))}")`

export const S = (skin) => `[data-op-skin="${skin}"]`
export const SCENE = (skin) => `[data-skin-scene="${skin}"]`
export const LINK = ":is(a.op-btn, [data-tp-link])"
export const CTA = ":is([data-product-cta], [data-email-form] button[type=submit], [data-onepage-contact] button[type=submit])"
export const CARD = ":is([data-product-block], [data-tp-product], a.op-card, [data-tp-card], [data-onepage-code], [data-onepage-testimonials] figure)"
export const FAQ = "[data-onepage-faq] .op-card"
export const CELL = "[data-onepage-countdown] .grid > div"
export const BOX = ":is([data-email-layout], [data-onepage-contact])"
export const SURF = ':where([style*="background-clip: padding-box"]:not(.op-btn, button, [data-product-block], [data-tp-product], .op-card, [data-tp-card], [data-tp-link], [data-onepage-code], figure, [data-onepage-countdown] .grid > div))'
export const INPUT = ":is([data-email-form], [data-onepage-contact] form) :is(input:not([type=checkbox]):not([type=radio]):not(.absolute), textarea)"
export const TITLE = ":is([data-op-header] h1, [data-tp-title])"
export const BIO = "[data-op-header] > p"
/* A text block (components/onepage/public-onepage case "text"). */
export const TEXT = "[data-op-block] > p.whitespace-pre-line"
export const AVATAR = ":is([data-page-avatar] [data-slot=avatar], [data-tp-avatar])"
export const AVATAR_BOX = ":is([data-page-avatar], [data-tp-avatar])"
export const SOCIAL = ":is([data-op-social-icon], [data-tp-socials] > span)"
export const HEADING = "[data-onepage-heading]"
export const BLOCK_TITLE = ":is([data-onepage-faq], [data-onepage-countdown], [data-onepage-testimonials]) > [data-block-title]"
export const DIVIDER = "[data-op-block] > .flex.items-center > .h-px:only-child"
export const PICTURE = "[data-op-block] div[class*='aspect-']:has(> img):not(.op-card div)"
/* Every picture a skin may tint (Grunge's photocopy): a grid's, a featured card's, a link's thumbnail, a product's. */
export const ANY_PICTURE = ":is([data-op-block] img, [data-tp-photo], [data-tp-link] img)"
export const STRIP = ".op-card > div:last-child"
/* The layer a Fill or Pop hover fills (app/globals.css .op-btn::after), at a weight that wins over the page's own rule for it. */
export const FILL_LAYER = ".op-btn[data-hover]:not(.animate-onepage-swipe)::after"
export const HOVER = "@media (hover: hover) and (pointer: fine)"
export const HOVERED = ":is(.op-btn:hover, .op-host:hover .op-btn)"
/* A link that is a tile (Grid, Mixed tiles), on the page and on a card. */
export const TILE = ":is([data-link-tile], [data-block-size='half'], [data-tp-pair], [data-tp-masonry])"
/* The Grid's pairs and the Mixed tiles, where a run of colours goes on (Playful, Arcade). */
export const RUN_HOST = ":is([data-block-layout] > *, [data-tp-masonry] > *)"
/* Words set inline inside a surface, never a button's: `[style*=" color:"]` is a colour, not a background-color. */
const BUTTONS = `:is(${CTA}, a.op-btn, [data-tp-link], [data-hover])`
export const INLINE_INK = `:is([style^="color:"], [style*=" color:"]):not(input, textarea, ${BUTTONS}, ${BUTTONS} *)`

export const NOISE = (alpha) => svg(`<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${alpha} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/>`, "0 0 200 200")

export const SPARK = (fill) => svg(
  `<defs><radialGradient id='g'><stop offset='0' stop-color='${fill}' stop-opacity='.55'/><stop offset='1' stop-color='${fill}' stop-opacity='0'/></radialGradient></defs><circle cx='50' cy='50' r='50' fill='url(#g)'/><path d='M50 4 C 53 38 62 47 96 50 C 62 53 53 62 50 96 C 47 62 38 53 4 50 C 38 47 47 38 50 4Z' fill='${fill}'/><circle cx='50' cy='50' r='5' fill='#fff'/>`,
  "0 0 100 100",
)

/** The stylesheet being written, and the pairs of words and paint it promises. */
export const css = []
export const pairs = []
export const rule = (sel, body) => css.push(`${sel} {\n${body.trim().split("\n").map((l) => `  ${l.trim()}`).join("\n")}\n}`)
export const comment = (text) => css.push(`\n/* ${text} */`)
export const banner = (text) => css.push(`\n/* ===========================================================================\n   ${text}\n   =========================================================================== */`)

/**
 * Words on a surface the skin paints: the surface's own colour and every
 * colour set inline inside it, a button's excepted. `under` is every colour
 * the paint shows under the words (each stop of a gradient), for the test.
 */
export function onSurface(skin, what, sel, ink, under, { whole = false } = {}) {
  /*
    Round 3: never a product drawn over its own picture (product-block Overlay). Its words are on the photo and its
    shade, white; the surface's ink there was dark words on a dark photo (Aqua, Y2K, Messenger: 1.2:1). The
    legibility guard used to turn them back, measuring the card under the picture; it now sees the picture.
  */
  const on = `${sel}:not([data-product-block="overlay"])`
  rule(`${S(skin)} ${on}`, `color: ${ink} !important;`)
  rule(`${S(skin)} ${on} ${INLINE_INK}`, `color: ${ink} !important;`)
  /* `whole`: a heading or a name, never drawn faded. */
  pairs.push({ skin, what, ink, under, faded: !whole })
}

/**
 * The legal links under the page (components/onepage/onepage-legal-links) sit
 * on whatever the scene draws at the bottom (a meadow, sand, a taskbar,
 * hills): each skin gives them a small backing of its own and words for it.
 */
export const LEGAL = "[data-onepage-legal]"
export function legal(skin, backing, ink, under, extra = "") {
  rule(`${S(skin)} ${LEGAL}`, `background: ${backing}; color: ${ink} !important; width: fit-content; margin-inline: auto; padding: 4px 14px; border-radius: 999px;${extra ? ` ${extra}` : ""}`)
  pairs.push({ skin, what: "the legal links", ink, under })
}

/** A pair the skin promises without a rule here (a button's words, set with its paint). */
export const promise = (skin, what, ink, under) => pairs.push({ skin, what, ink, under })
