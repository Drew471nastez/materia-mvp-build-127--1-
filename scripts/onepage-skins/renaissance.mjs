/**
 * RENAISSANCE: a page hung in front of an old master (wave 15).
 *
 * The owner, wave 15: "I like the Renaissance theme, but I don't like the
 * white rectangle that shows (the thin white frame around the page)", "make
 * the background smoother and cleaner with no weird issues", "make
 * Renaissance more Renaissance: the theme, the structure, all of it". This
 * overrides round 3's brief (modern grotesk, white hairlines, no gold, no
 * serif), which read as a plain blue page with a frame.
 *
 * The scene is a real painting: Titian's "Bacchus and Ariadne" (1520 to 1523,
 * The National Gallery, London; public domain), cut and compressed by
 * scripts/build-renaissance-paintings.mjs into public/images/onepage-themes/
 * renaissance: Ariadne on the shore under the starred sky for a phone and the
 * page as a card, the sky with Ariadne and Bacchus leaping from his chariot
 * in the room around the card on a computer (chosen by the scene's own width,
 * a container query, so a phone never fetches the wide one).
 *
 * The painting is shown whole and clear, at the height of the screen, and
 * stays put while the page moves over it (position: sticky inside a scene
 * that clips rather than hides, so it is the page that scrolls it). A long
 * page never runs off the end of the picture into a flat colour, a short one
 * never shows a stretched crop, and there is no frame, no seam, no band.
 *
 * Nothing veils the painting as a whole. Words that sit on it get a soft,
 * even scrim of the painting's own ultramarine night under them and nowhere
 * else: the name and the line under it (a band from the top of the page that
 * eases away below the header), a heading, a paragraph. Everything else that
 * holds words is a gallery plaque: lapis, opaque, framed by a gilt hairline
 * with a second, finer one inside it, as a picture's slip sits inside its
 * frame. A link fills ivory under the pointer and its words turn lapis; the
 * product's button is the ivory plaque and fills lapis.
 *
 * The composition is classical: the header centred, the picture a tondo in a
 * fine gilt ring, the name in Cormorant Garamond, reading in EB Garamond, one
 * small gilt quatrefoil rule under the name and under each heading. Gold is a
 * hairline, never a fill; nothing is ornamented twice.
 */
import { svg, css, S, SCENE, LINK, CTA, CARD, FAQ, CELL, BOX, SURF, INPUT, TITLE, BIO, TEXT, AVATAR, SOCIAL, HEADING, BLOCK_TITLE, DIVIDER, PICTURE, STRIP, FILL_LAYER, rule, comment, banner, onSurface, promise, legal } from "./shared.mjs"

export const RENAISSANCE_PALETTE = {
  /* The painting's night (its deepest ultramarine): the ground and the scrim under words. */
  night: "#121a33",
  /* Ariadne's robe, deepened: every plaque. */
  lapis: "#17224a",
  /* A field, a shade under the plaque. */
  field: "#0f1631",
  /* Her sleeve and the clouds' light: every word. */
  ivory: "#f4ecda",
  /* Gilt, only ever a hairline. */
  gilt: "#c6a15b",
  giltSoft: "rgba(198,161,91,.5)",
  giltFaint: "rgba(198,161,91,.32)",
}
const P = RENAISSANCE_PALETTE
/* The scrim under words: the night at this share, which leaves ivory at 4.5:1 even over the painting's white. */
export const RENAISSANCE_SCRIM = 0.66
const SCRIM_RGB = "12,17,36"
/*
  The painting's foot eases into the night over its last few percent: where the page cannot hold it still (a box that
  hides its overflow around the page) the page goes on below it on the night with no edge.
*/
const FOOT = "linear-gradient(180deg, #000 0%, #000 86%, rgba(0,0,0,.55) 95%, transparent 100%)"
const PIC = (name) => `image-set(url("/images/onepage-themes/renaissance/${name}.avif") type("image/avif"), url("/images/onepage-themes/renaissance/${name}.webp") type("image/webp"))`

/*
  The one ornament: a small gilt quatrefoil on a gilt hairline, under the name, under a heading, as a divider. The
  quatrefoil is drawn once (--rn-q, on the page's root) and the line is a gradient either side of it.
*/
const QUATREFOIL = svg(
  `<g fill='#c6a15b'><circle cx='9.8' cy='7' r='2.4'/><circle cx='16.2' cy='7' r='2.4'/><circle cx='13' cy='3.8' r='2.4'/><circle cx='13' cy='10.2' r='2.4'/><circle cx='4' cy='7' r='.9'/><circle cx='22' cy='7' r='.9'/></g><circle cx='13' cy='7' r='1.1' fill='#121a33'/>`,
  "0 0 26 14",
)
const ornament = (w, at) => `var(--rn-q) ${at} / 26px 14px no-repeat, linear-gradient(90deg, ${P.giltSoft} calc(50% - 16px), transparent 0 calc(50% + 16px), ${P.giltSoft} 0) ${at === "center" ? "center" : "center bottom 6.5px"} / ${w}px 1px no-repeat`
/* A plaque's frame: the gilt edge (its border), a gap of the plaque's own colour, a finer gilt line inside. */
const slip = (fill, line) => `inset 0 0 0 3px ${fill}, inset 0 0 0 4px ${line}`
/*
  A soft scrim under words, as a layer behind the element (positioned, so the layer sits under its words and over
  the painting): solid where the words are, easing to nothing over 34px beyond them on every side, so it has no
  edge. Two masks intersected make the soft rectangle (--rn-soft, on the page's root).
*/
const FEATHER = 34
const SOFT = `linear-gradient(90deg, transparent, #000 ${FEATHER}px, #000 calc(100% - ${FEATHER}px), transparent), linear-gradient(180deg, transparent, #000 ${FEATHER}px, #000 calc(100% - ${FEATHER}px), transparent)`
const MASKED = (v) => `-webkit-mask-image: ${v}; -webkit-mask-composite: source-in; mask-image: ${v}; mask-composite: intersect;`
/* `x` below 0 keeps a full width line's scrim inside the page's 28px gutter on a computer's card, so its soft side is never cut by the card's edge. */
const scrimUnder = (sel, { x = -8, y = 4 } = {}) => {
  rule(sel, `position: relative;`)
  rule(`${sel}::before`, `
    content: ""; position: absolute; z-index: -1; pointer-events: none;
    inset: ${-(y + FEATHER)}px ${-(x + FEATHER)}px; background: rgba(${SCRIM_RGB},${RENAISSANCE_SCRIM}); ${MASKED("var(--rn-soft)")}`)
}

export function renaissance() {
  banner("RENAISSANCE: Titian's painting, whole and still behind the page; lapis plaques in gilt hairlines; Garamond (lib/onepage/theme-skin)")
  const sc = SCENE("renaissance")
  /* The scene measures its own width (a phone's page, the page as a card, or the room around the card) and clips rather than hides, so the painting can stay put while the page scrolls. */
  rule(sc, `container-type: inline-size; background-color: ${P.night}; overflow: clip;`)
  /*
    The painting: the height of the screen (never more than the page), covering it, held still while the page moves
    over it. In a box that cannot scroll (a theme card) it is simply the whole picture.
  */
  rule(`${sc} [data-sk="painting"]`, `
    position: sticky; top: 0; display: block; width: 100%;
    height: min(100vh, 100%); height: min(100lvh, 100%);
    background: ${PIC("portrait")} center 22% / cover no-repeat;
    -webkit-mask-image: ${FOOT}; mask-image: ${FOOT};`)
  /* Around the card on a computer: the wide cut, the card's shadow helped by a soft shade behind it. */
  css.push(`@container (min-width: 720px) {
  ${sc} [data-sk="painting"] { background-image: ${PIC("wide")}; background-position: center 30%; }
  ${sc} [data-sk="painting"]::after { content: ""; position: absolute; inset: 0; background: radial-gradient(34% 60% at 50% 50%, rgba(${SCRIM_RGB},.38) 0%, rgba(${SCRIM_RGB},0) 100%); }
}`)

  const A = S("renaissance")
  comment("renaissance: soft scrims under the words that sit on the painting, and nowhere else.")
  /* The header: a band of the night from the top of the page, as deep as the header, easing away under it. Full bleed on a phone (its soft sides are off the screen), soft at the sides on a wider column. */
  rule(`${A} [data-op-header]:not([data-op-cover])`, `position: relative;`)
  rule(`${A} [data-op-header]:not([data-op-cover])::before`, `
    content: ""; position: absolute; z-index: -1; pointer-events: none;
    left: -76px; right: -76px; top: -200px; bottom: -64px;
    background: rgba(${SCRIM_RGB},${RENAISSANCE_SCRIM});
    ${MASKED("linear-gradient(90deg, transparent, #000 56px, #000 calc(100% - 56px), transparent), linear-gradient(180deg, #000 calc(100% - 84px), transparent)")}`)
  /* A header over a cover picture (the creator's own): only its words get the scrim. */
  rule(A, `--rn-q: ${QUATREFOIL}; --rn-soft: ${SOFT};`)
  scrimUnder(`${A} [data-op-header][data-op-cover] > :is(h1, p)`, { x: 0, y: 0 })
  /* The Hero's name and line, over the photo's faded end. */
  scrimUnder(`${A} [data-hero-title]`, { x: 0, y: 0 })
  /* A heading, a block's title, a paragraph. */
  scrimUnder(`${A} :is(${HEADING}, ${BLOCK_TITLE})`)
  /* A paragraph clips what overflows it (app/globals.css), so its scrim is its block's. */
  scrimUnder(`${A} [data-op-block]:has(> p.whitespace-pre-line)`)

  comment("renaissance: lapis plaques framed in gilt; a link fills ivory under the pointer, the product's button is the ivory plaque.")
  rule(`${A} ${LINK}`, `
    background-color: var(--sk-surface) !important; background-image: none;
    border: 1px solid ${P.gilt} !important; border-radius: 2px !important;
    box-shadow: ${slip("var(--sk-surface)", P.giltFaint)}, 0 14px 28px -20px rgba(4,6,14,.9) !important;
    font-weight: 500; letter-spacing: .015em; font-size: 1.04em;`)
  rule(`${A} ${FILL_LAYER}`, `background-image: none;`)
  /*
    The hover's fill layer (app/globals.css .op-btn::after) covers the plaque's edge and its inner line, so the layer
    carries both: the gilt edge, its own colour, the finer gilt line inside. A link fills ivory, the product's button lapis.
  */
  rule(`${A} :is(.op-btn, [data-tp-link]):is([data-hover="fill"], [data-hover="pop"])::after`, `box-shadow: inset 0 0 0 1px ${P.gilt}, inset 0 0 0 4px var(--op-fill, ${P.ivory}), inset 0 0 0 5px ${P.giltSoft};`)
  promise("renaissance", "a lapis plaque", P.ivory, [P.lapis])
  promise("renaissance", "a plaque under the pointer", P.lapis, [P.ivory])
  rule(`${A} ${CTA}`, `
    background-color: ${P.ivory} !important; background-image: none;
    color: ${P.lapis} !important; border: 1px solid ${P.gilt} !important; border-radius: 2px !important;
    box-shadow: ${slip(P.ivory, P.giltSoft)} !important;
    font-weight: 600; letter-spacing: .03em;
    --op-fill: ${P.lapis} !important; --op-fill-text: ${P.ivory} !important;`)
  promise("renaissance", "the ivory plaque", P.lapis, [P.ivory])
  promise("renaissance", "the ivory plaque under the pointer", P.ivory, [P.lapis])
  rule(`${A} :is(${CARD}, ${FAQ}, ${CELL}, ${SURF})`, `
    background-color: ${P.lapis} !important; background-image: none;
    border: 1px solid ${P.giltSoft} !important; border-radius: 2px !important;
    box-shadow: ${slip(P.lapis, P.giltFaint)}, 0 14px 28px -20px rgba(4,6,14,.9) !important;`)
  onSurface("renaissance", "a panel", `:is(${CARD}, ${FAQ})`, P.ivory, [P.lapis])
  onSurface("renaissance", "a countdown's number", CELL, P.ivory, [P.lapis])
  rule(`${A} ${STRIP}`, `background-color: transparent !important; border-top: 1px solid ${P.giltFaint};`)
  rule(`${A} ${BOX}`, `
    background-color: ${P.lapis} !important; background-image: none;
    border: 1px solid ${P.giltSoft}; border-radius: 2px !important;
    box-shadow: inset 0 0 0 5px ${P.lapis}, inset 0 0 0 6px ${P.giltFaint}, 0 14px 28px -20px rgba(4,6,14,.9);`)
  onSurface("renaissance", "the subscribe and contact forms' panel", BOX, P.ivory, [P.lapis])
  rule(`${A} ${INPUT}`, `background: ${P.field} !important; border: 1px solid ${P.giltSoft} !important; border-radius: 2px !important; color: ${P.ivory} !important; box-shadow: none !important;`)
  rule(`${A} ${INPUT}::placeholder`, `color: rgba(244,236,218,.7) !important;`)
  promise("renaissance", "a field", P.ivory, [P.field])
  rule(`${A} ${INPUT}:focus`, `border-color: ${P.gilt} !important; box-shadow: 0 0 0 1px ${P.gilt} !important;`)

  comment("renaissance: the classical header, the headings, the ornament.")
  rule(`${A} ${TITLE}`, `letter-spacing: .005em; text-shadow: 0 1px 2px rgba(6,9,20,.5), 0 2px 24px rgba(6,9,20,.45);`)
  /* Tight leading on the page's name only: a theme card's name keeps its own line (scripts/check-onepage-theme-previews). */
  rule(`${A} [data-op-header] h1`, `line-height: 1.05;`)
  rule(`${A} :is(${BIO}, ${TEXT}, [data-hero-title] p)`, `text-shadow: 0 1px 12px rgba(6,9,20,.5);`)
  rule(`${A} ${TEXT}`, `font-size: 1rem; line-height: 1.6;`)
  /* The one ornament under the name, over the line under it. */
  rule(`${A} [data-op-header] > p::before`, `content: ""; display: block; width: 132px; height: 14px; margin: -2px auto 12px; background: ${ornament(132, "center")};`)
  rule(`${A} [data-op-align="left"] [data-op-header] > p::before`, `margin-left: 0;`)
  rule(`${A} :is(${HEADING}, ${BLOCK_TITLE})`, `
    font-size: .95rem !important; font-weight: 600 !important; letter-spacing: .2em; text-transform: uppercase;
    padding-top: 6px; padding-bottom: 22px; background: ${ornament(96, "center bottom")};
    text-shadow: 0 1px 2px rgba(6,9,20,.6);`)
  rule(`${A} ${AVATAR}`, `box-shadow: 0 0 0 4px rgba(${SCRIM_RGB},.55), 0 0 0 5px ${P.gilt}, 0 16px 36px -14px rgba(4,6,14,.85) !important;`)
  rule(`${A} ${SOCIAL}`, `
    width: 42px; height: 42px; padding: 0; border-radius: 50% !important;
    background-color: ${P.lapis} !important; border: 1px solid ${P.giltSoft} !important; box-shadow: none;`)
  rule(`${A} ${DIVIDER}`, `height: 14px; background: ${ornament(220, "center")} !important;`)
  rule(`${A} ${PICTURE}`, `border-radius: 2px !important; box-shadow: 0 0 0 1px ${P.giltSoft}, 0 16px 30px -20px rgba(4,6,14,.9);`)
  rule(`${A} [data-framed-picture]`, `border-radius: 2px; box-shadow: 0 0 0 1px ${P.giltSoft};`)
  rule(`${A} [data-code-copy]`, `background-color: ${P.ivory} !important; background-image: none; color: ${P.lapis} !important; border: 1px solid ${P.gilt} !important; border-radius: 2px !important; box-shadow: none !important;`)
  promise("renaissance", "the code's Copy", P.lapis, [P.ivory])
  /* The badge under the page (components/onepage/public-onepage "… on Storelib"): a small plaque too. */
  rule(`${A} a[href="https://storelib.com"]`, `background-color: ${P.lapis} !important; color: ${P.ivory} !important; border: 1px solid ${P.giltSoft}; border-radius: 2px !important; box-shadow: ${slip(P.lapis, P.giltFaint)}, 0 12px 24px -16px rgba(4,6,14,.9) !important; letter-spacing: .02em;`)
  promise("renaissance", "the badge under the page", P.ivory, [P.lapis])
  legal("renaissance", P.lapis, P.ivory, [P.lapis], `border: 1px solid ${P.giltFaint}; border-radius: 2px;`)
}
