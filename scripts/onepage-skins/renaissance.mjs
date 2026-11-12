/**
 * RENAISSANCE: an oil painting behind a modern page (round 3).
 *
 * The owner's reference is Shopify Editions Winter '26, "The Renaissance
 * Edition": classical oil painting scenes full bleed (sky, drapery, landscape,
 * figures) with crisp modern type over them, large, white, confident, and
 * thin white editorial frames. Modern meets classical, restrained, not a
 * costume.
 *
 * The scene is a real painting: Titian's "Bacchus and Ariadne" (1520 to 1523,
 * The National Gallery, London; public domain), cut and compressed by
 * scripts/build-renaissance-paintings.mjs into public/images/onepage-themes/
 * renaissance: Ariadne on the shore under the starred sky for a phone and the
 * page as a card, the sky with Ariadne and Bacchus leaping from his chariot
 * around the card on a computer (chosen by the scene's own width, a container
 * query, so a phone never fetches the wide one). It runs the height of the
 * first screen and fades into the painting's own ultramarine night, so a long
 * page ends on a calm ground rather than on a stretched picture.
 *
 * Over it, everything is ink and hairline: panels of the night at 60%, framed
 * by a single white line, square cornered; the name in a modern grotesk
 * (Geist), tight and white; headings as small capitals over a white rule. The
 * product's button is white with ink words, the one solid thing on the page.
 * A link fills white under the pointer and its words turn ink (the theme's own
 * hover colours). Where words sit on the painting itself, a scrim darkens it
 * first: the sky at the top, more where the clouds are bright.
 */
import { css, S, SCENE, LINK, CTA, CARD, FAQ, CELL, BOX, SURF, INPUT, TITLE, BIO, TEXT, AVATAR, SOCIAL, HEADING, BLOCK_TITLE, DIVIDER, PICTURE, STRIP, FILL_LAYER, rule, comment, banner, onSurface, promise, legal } from "./shared.mjs"

const P = {
  night: "#0e1220",
  white: "#ffffff",
  /* A panel of the night laid over the painting: the painting shows through, the words read. */
  panel: "rgba(11,14,26,.6)",
  line: "rgba(255,255,255,.72)",
  hair: "rgba(255,255,255,.42)",
  field: "#151b2e",
}
/* What a panel looks like over the brightest cloud in the painting (#ece6d8) under the scrim's lightest (.24), and over the night. */
const lay = (top, a, under) => "#" + [0, 1, 2].map((i) => Math.round(top[i] * a + under[i] * (1 - a)).toString(16).padStart(2, "0")).join("")
const CLOUD = lay([9, 12, 24], 0.24, [0xec, 0xe6, 0xd8])
P.panelOnCloud = lay([11, 14, 26], 0.6, [0, 2, 4].map((i) => parseInt(CLOUD.slice(1 + i, 3 + i), 16)))
P.panelOnNight = lay([11, 14, 26], 0.6, [0x0e, 0x12, 0x20])
const PIC = (name) => `image-set(url("/images/onepage-themes/renaissance/${name}.avif") type("image/avif"), url("/images/onepage-themes/renaissance/${name}.webp") type("image/webp"))`
/* How tall the painting runs: two and a half times the scene's width on a phone (the whole cut), never past 1120px. */
const TALL = "min(250cqw, 1120px)"
/*
  Where it starts. Above it the painting's own sky goes on, deep and even (its top row is #3a507f), so the name and
  the line under it sit on calm ultramarine rather than on the bright clouds, which then fall behind the first
  buttons' panels; Ariadne and the shore come after.
*/
const SKY = "min(72cqw, 300px)"
const WIDE_TALL = "min(100%, 110cqw, 1400px)"

export function renaissance() {
  banner("RENAISSANCE: Titian's sky behind ink panels, white hairlines and a modern grotesk (lib/onepage/theme-skin)")
  const sc = SCENE("renaissance")
  /* The scene measures its own width: a phone's page, the page as a card, or the room around the card. */
  rule(sc, `container-type: inline-size; background-color: ${P.night};`)
  rule(`${sc} [data-sk="sky"]`, `position: absolute; inset: 0; background: linear-gradient(180deg, #2b3d6b 0, #3a507f calc(${SKY} + 40px), #3a507f calc(${SKY} + 120px), ${P.night} calc(${SKY} + ${TALL}));`)
  rule(`${sc} [data-sk="painting"]`, `
    position: absolute; left: 0; right: 0; top: ${SKY}; height: ${TALL};
    background: ${PIC("portrait")} center top / cover no-repeat;
    -webkit-mask-image: linear-gradient(180deg, transparent 0, #000 72px, #000 62%, transparent 100%); mask-image: linear-gradient(180deg, transparent 0, #000 72px, #000 62%, transparent 100%);`)
  /* The scrim: a breath over the sky where the name sits, more over the bright clouds behind the first buttons and headings, then the night. */
  rule(`${sc} [data-sk="scrim"]`, `
    position: absolute; left: 0; right: 0; top: 0; height: calc(${SKY} + ${TALL});
    background: linear-gradient(180deg, rgba(9,12,24,.28) 0, rgba(9,12,24,.2) calc(${SKY} - 60px), rgba(9,12,24,.36) calc(${SKY} + 40px), rgba(9,12,24,.32) calc(${SKY} + 12%), rgba(9,12,24,.24) calc(${SKY} + 45%), rgba(9,12,24,.24) calc(${SKY} + 60%), rgba(14,18,32,.86) 94%, ${P.night} 100%);`)
  /* A thin white editorial frame round the painting, inside the page's edge, open at the foot where the painting fades. */
  rule(`${sc} [data-sk="frame"]`, `
    position: absolute; left: 14px; right: 14px; top: 14px; height: calc((${SKY} + ${TALL}) * .72);
    border: 1px solid ${P.hair}; border-bottom: 0;
    -webkit-mask-image: linear-gradient(180deg, #000 70%, transparent 100%); mask-image: linear-gradient(180deg, #000 70%, transparent 100%);`)
  /* The page drawn as a card on a computer (components/onepage/public-onepage): the room around it carries the frame. */
  rule(`${sc}[class*="rounded-[40px]"] [data-sk="frame"]`, `display: none;`)
  /* Around the card on a computer: the wide cut from the top, as tall as the room, the frame further in. */
  css.push(`@container (min-width: 720px) {
  ${sc} [data-sk="sky"] { display: none; }
  ${sc} [data-sk="painting"] { top: 0; height: ${WIDE_TALL}; background-image: ${PIC("wide")}; background-position: center 30%; -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 62%, transparent 100%); mask-image: linear-gradient(180deg, #000 0%, #000 62%, transparent 100%); }
  ${sc} [data-sk="scrim"] { height: ${WIDE_TALL}; background: radial-gradient(60% 80% at 50% 45%, rgba(9,12,24,.5) 0%, rgba(9,12,24,.16) 70%), linear-gradient(180deg, rgba(9,12,24,.2) 0%, rgba(9,12,24,.1) 50%, rgba(14,18,32,.8) 90%, ${P.night} 100%); }
  ${sc} [data-sk="frame"] { left: 28px; right: 28px; top: 28px; height: calc(${WIDE_TALL} * .78); }
}`)

  const A = S("renaissance")
  comment("renaissance: panels of the night in a white hairline; the product's button the one white thing; a link's words stay the theme's, so its white Fill hover wins.")
  rule(`${A} ${LINK}`, `
    background-color: ${P.panel} !important; background-image: none;
    border: 1px solid ${P.line} !important; border-radius: 2px !important;
    box-shadow: none !important;
    font-weight: 500; letter-spacing: -.005em;`)
  rule(`${A} ${FILL_LAYER}`, `background-image: none;`)
  promise("renaissance", "a link's panel", P.white, [P.panelOnCloud, P.panelOnNight])
  rule(`${A} ${CTA}`, `
    background-color: ${P.white} !important; background-image: none;
    color: ${P.night} !important; border: 1px solid ${P.white} !important; border-radius: 999px !important;
    font-weight: 600; letter-spacing: -.005em; box-shadow: none !important;
    --op-fill: ${P.night} !important; --op-fill-text: ${P.white} !important;`)
  promise("renaissance", "the white button", P.night, [P.white])
  promise("renaissance", "the white button under the pointer", P.white, [P.night])
  rule(`${A} :is(${CARD}, ${FAQ}, ${CELL}, ${SURF})`, `
    background-color: ${P.panel} !important; background-image: none;
    border-color: ${P.hair} !important; border-radius: 2px !important;
    box-shadow: none !important;`)
  onSurface("renaissance", "a panel", `:is(${CARD}, ${FAQ})`, P.white, [P.panelOnCloud, P.panelOnNight])
  onSurface("renaissance", "a countdown's number", CELL, P.white, [P.panelOnCloud, P.panelOnNight])
  rule(`${A} ${STRIP}`, `background-color: transparent !important; border-top: 1px solid ${P.hair};`)
  rule(`${A} ${BOX}`, `
    background-color: ${P.panel} !important; background-image: none;
    border: 1px solid ${P.line}; border-radius: 2px !important; box-shadow: none;`)
  onSurface("renaissance", "the subscribe and contact forms' panel", BOX, P.white, [P.panelOnCloud, P.panelOnNight])
  rule(`${A} ${INPUT}`, `background: ${P.field} !important; border: 1px solid ${P.hair} !important; border-radius: 2px !important; color: ${P.white} !important; box-shadow: none !important;`)
  promise("renaissance", "a field", P.white, [P.field])
  rule(`${A} ${INPUT}:focus`, `border-color: ${P.white} !important; box-shadow: 0 0 0 1px ${P.white} !important;`)
  rule(`${A} ${TITLE}`, `letter-spacing: -.035em; text-shadow: 0 2px 28px rgba(6,9,20,.45);`)
  /* Tight leading on the page's name only: a theme card's name keeps its own line (scripts/check-onepage-theme-previews). */
  rule(`${A} [data-op-header] h1`, `line-height: 1.04;`)
  rule(`${A} :is(${BIO}, ${TEXT})`, `text-shadow: 0 1px 14px rgba(6,9,20,.55);`)
  rule(`${A} :is(${HEADING}, ${BLOCK_TITLE})`, `
    font-size: .8rem !important; font-weight: 600 !important; letter-spacing: .14em; text-transform: uppercase;
    border-top: 1px solid ${P.line}; padding-top: 12px; text-shadow: 0 1px 2px rgba(6,9,20,.7), 0 0 14px rgba(6,9,20,.55);`)
  rule(`${A} ${AVATAR}`, `box-shadow: 0 0 0 4px rgba(11,14,26,.35), 0 0 0 5px ${P.line} !important;`)
  rule(`${A} ${SOCIAL}`, `
    width: 42px; height: 42px; padding: 0; border-radius: 50% !important;
    background-color: ${P.panel} !important; border: 1px solid ${P.line} !important; box-shadow: none;`)
  rule(`${A} ${DIVIDER}`, `height: 1px; background: ${P.line} !important;`)
  rule(`${A} ${PICTURE}`, `border-radius: 2px !important; box-shadow: 0 0 0 1px ${P.line};`)
  rule(`${A} [data-framed-picture]`, `border-radius: 2px; box-shadow: 0 0 0 1px ${P.hair};`)
  rule(`${A} [data-code-copy]`, `background-color: ${P.white} !important; background-image: none; color: ${P.night} !important; border: 1px solid ${P.white} !important; border-radius: 999px !important; box-shadow: none !important;`)
  promise("renaissance", "the code's Copy", P.night, [P.white])
  legal("renaissance", P.panel, P.white, [P.panelOnCloud, P.panelOnNight], `border: 1px solid ${P.hair};`)
}
