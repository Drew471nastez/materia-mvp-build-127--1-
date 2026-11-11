/**
 * RENAISSANCE: a page painted on an old master's canvas.
 *
 * The ground is a warm primed linen under a soft sky that clears to the
 * paint's own ochre, mottled like aged varnish, with the blue-green hills of
 * a fifteenth-century background far away at the foot (aerial perspective:
 * the farther, the bluer and the paler). Everything on it is set like a
 * small panel in a gilt frame: ivory, a hairline of gold and a second
 * hairline inside it, a soft warm shadow. Gold is only ever a line. The
 * products' buttons are lapis, the blue painters paid more for than gold,
 * with ivory words; a link turns madder red under the pointer (the theme's
 * Fill hover). Headings are a Garamond italic between two gold rules.
 *
 * Everything is drawn here: no painting is fetched, copied or traced.
 */
import { svg, S, SCENE, LINK, CTA, CARD, FAQ, CELL, BOX, SURF, INPUT, TITLE, BIO, TEXT, AVATAR, AVATAR_BOX, SOCIAL, HEADING, BLOCK_TITLE, DIVIDER, PICTURE, STRIP, FILL_LAYER, rule, comment, banner, onSurface, promise, legal } from "./shared.mjs"

const P = {
  ivory: "#f7f0de",
  panel: "#f6eedb",
  parchment: "#f2e8cf",
  ink: "#2a1d13",
  gilt: "#a8843f",
  giltSoft: "rgba(168,132,63,.5)",
  lapis: "#22396b",
  lapisDeep: "#1a2c55",
  umberShadow: "rgba(74,47,23,.42)",
}

/* Aged varnish: low frequency noise turned into warm umber clouds, tiled without a seam. */
const VARNISH = svg(
  `<filter id='v' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.0024 .0032' numOctaves='3' seed='11' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .50  0 0 0 0 .33  0 0 0 0 .14  0 0 0 1.1 -.4'/></filter><rect width='100%' height='100%' filter='url(#v)'/>`,
  "0 0 900 900",
)
/* The linen under the paint: a little grain; the weave itself is two repeating hairline gradients (no tile edge to show). */
const GRAIN = svg(
  `<filter id='g'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .25  0 0 0 0 .16  0 0 0 0 .07  0 0 0 .1 0'/></filter><rect width='100%' height='100%' filter='url(#g)'/>`,
  "0 0 160 160",
)
/* A painted sky: soft clouds, blurred, warm on top. */
const CLOUDS = svg(
  `<defs><filter id='b' x='-20%' y='-50%' width='140%' height='200%'><feGaussianBlur stdDeviation='14'/></filter></defs>` +
    `<g filter='url(#b)' fill='#fbf3df'><ellipse cx='90' cy='120' rx='120' ry='26' fill-opacity='.55'/><ellipse cx='330' cy='80' rx='150' ry='30' fill-opacity='.5'/><ellipse cx='560' cy='140' rx='130' ry='22' fill-opacity='.45'/><ellipse cx='250' cy='200' rx='170' ry='20' fill-opacity='.35'/></g>`,
  "0 0 700 260",
  " preserveAspectRatio='none'",
)
/* Far hills, a river's light and a nearer slope, in the blues and greens of distance. */
const HILLS = svg(
  `<defs><filter id='s' x='-5%' y='-20%' width='110%' height='140%'><feGaussianBlur stdDeviation='1.1'/></filter><linearGradient id='f' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#8aa3b6'/><stop offset='1' stop-color='#b3bfbd'/></linearGradient><linearGradient id='m' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#7c9690'/><stop offset='1' stop-color='#a2ab92'/></linearGradient><linearGradient id='n' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#948a5e'/><stop offset='1' stop-color='#c2b58a'/></linearGradient></defs>` +
    `<g filter='url(#s)'>` +
    `<path d='M0 70 C 30 52 52 40 78 46 C 104 52 118 30 146 26 C 176 22 196 44 226 40 C 258 36 276 18 306 22 C 340 26 366 46 400 40 V200 H0Z' fill='url(#f)' fill-opacity='.75'/>` +
    `<path d='M0 104 C 46 88 88 80 132 90 C 170 98 200 84 238 80 C 286 76 330 96 400 86 V200 H0Z' fill='url(#m)' fill-opacity='.8'/>` +
    `<path d='M150 118 C 190 112 230 116 262 112 C 236 122 198 126 168 130Z' fill='#e9e3cf' fill-opacity='.8'/>` +
    `<path d='M0 140 C 60 124 120 128 170 138 C 230 150 300 132 400 128 V200 H0Z' fill='url(#n)' fill-opacity='.75'/>` +
    `</g>`,
  "0 0 400 200",
  " preserveAspectRatio='none'",
)
/* A gold rule with a lozenge in the middle, for the divider and under a heading. */
const RULE = (w) => svg(
  `<g fill='${P.gilt}'><rect x='0' y='6.5' width='${w / 2 - 12}' height='1'/><rect x='${w / 2 + 12}' y='6.5' width='${w / 2 - 12}' height='1'/><path d='M${w / 2} 2 L ${w / 2 + 5} 7 L ${w / 2} 12 L ${w / 2 - 5} 7Z'/><circle cx='${w / 2 - 9}' cy='7' r='1.3'/><circle cx='${w / 2 + 9}' cy='7' r='1.3'/></g>`,
  `0 0 ${w} 14`,
)

/** A panel in a gilt frame: the hairline is the border, the second hairline sits a few pixels inside it. */
const frame = (fill, inset = 3) => `inset 0 0 0 ${inset}px ${fill}, inset 0 0 0 ${inset + 1}px ${P.giltSoft}`

export function renaissance() {
  banner("RENAISSANCE: an old master's canvas, ivory panels in gilt frames, lapis and madder (lib/onepage/theme-skin)")
  const sc = SCENE("renaissance")
  rule(`${sc} [data-sk="sky"]`, `
    position: absolute; left: 0; right: 0; top: 0; height: 520px;
    background: ${CLOUDS} center 40px / 150% 240px no-repeat, radial-gradient(110% 70% at 24% 0%, rgba(255,240,206,.7) 0%, rgba(255,240,206,0) 60%), linear-gradient(180deg, rgba(122,152,176,.55) 0%, rgba(152,174,186,.36) 32%, rgba(200,200,190,.16) 62%, rgba(236,225,200,0) 100%);`)
  rule(`${sc} [data-sk="varnish"]`, `position: absolute; inset: 0; background: ${VARNISH} 0 0 / 1100px 1100px; opacity: .32; mix-blend-mode: multiply;`)
  rule(`${sc} [data-sk="canvas"]`, `position: absolute; inset: 0; background: ${GRAIN} 0 0 / 160px 160px, repeating-linear-gradient(0deg, rgba(90,60,28,.035) 0 1px, rgba(90,60,28,0) 1px 3px), repeating-linear-gradient(90deg, rgba(90,60,28,.025) 0 1px, rgba(90,60,28,0) 1px 3px); mix-blend-mode: multiply;`)
  rule(`${sc} [data-sk="hills"]`, `
    position: absolute; left: 0; right: 0; bottom: 0; height: 220px; background: ${HILLS} center bottom / 100% 100% no-repeat; opacity: .55;
    -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 34%); mask-image: linear-gradient(180deg, transparent 0%, #000 34%);`)
  rule(`${sc} [data-sk="vignette"]`, `position: absolute; inset: 0; background: radial-gradient(140% 100% at 50% 30%, rgba(74,47,23,0) 58%, rgba(74,47,23,.2) 100%);`)

  const A = S("renaissance")
  comment("renaissance: ivory panels in a gilt frame, lapis for what is bought or sent; the words on a link stay the theme's, so the madder hover wins.")
  rule(`${A} ${LINK}`, `
    background-color: color-mix(in srgb, var(--sk-surface) 94%, transparent) !important; background-image: linear-gradient(180deg, rgba(255,252,242,.55) 0%, rgba(255,252,242,0) 60%);
    border-color: ${P.gilt} !important;
    box-shadow: ${frame("color-mix(in srgb, var(--sk-surface) 94%, transparent)")}, 0 1px 0 rgba(255,250,236,.7), 0 8px 18px -12px ${P.umberShadow} !important;
    font-weight: 500; letter-spacing: .01em; font-size: 1.04em;`)
  rule(`${A} ${FILL_LAYER}`, `background-image: linear-gradient(180deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,0) 60%);`)
  rule(`${A} ${CTA}`, `
    background-color: ${P.lapis} !important; background-image: linear-gradient(180deg, rgba(255,255,255,.1) 0%, rgba(255,255,255,0) 55%);
    color: ${P.ivory} !important; border: 1px solid ${P.gilt} !important; border-radius: 3px !important; font-weight: 600; letter-spacing: .03em;
    box-shadow: inset 0 0 0 2px ${P.lapis}, inset 0 0 0 3px rgba(217,191,122,.55), 0 6px 14px -8px rgba(26,44,85,.6) !important;`)
  promise("renaissance", "the lapis button", P.ivory, [P.lapis, P.lapisDeep])
  rule(`${A} :is(${CARD}, ${FAQ}, ${CELL}, ${SURF})`, `
    background-color: ${P.panel} !important; background-image: none;
    border-color: ${P.gilt} !important; border-radius: 3px !important;
    box-shadow: ${frame(P.panel)}, 0 10px 22px -16px ${P.umberShadow} !important;`)
  onSurface("renaissance", "an ivory card", `:is(${CARD}, ${FAQ})`, P.ink, [P.panel])
  onSurface("renaissance", "a countdown's number", CELL, P.ink, [P.panel])
  rule(`${A} ${STRIP}`, `background-color: transparent !important; border-top: 1px solid ${P.giltSoft};`)
  rule(`${A} ${BOX}`, `
    background-color: ${P.parchment} !important; border: 1px solid ${P.gilt}; border-radius: 3px !important;
    background-image: radial-gradient(120% 90% at 50% 0%, rgba(255,250,236,.7) 0%, rgba(255,250,236,0) 70%);
    box-shadow: ${frame(P.parchment, 5)}, 0 12px 26px -18px ${P.umberShadow};`)
  onSurface("renaissance", "the subscribe and contact forms' parchment", BOX, P.ink, [P.parchment, "#f8f1df"])
  rule(`${A} ${INPUT}`, `background: #fffaf0 !important; border: 1px solid #c4ae82 !important; border-radius: 2px !important; color: ${P.ink} !important; box-shadow: inset 0 1px 2px rgba(74,47,23,.1) !important;`)
  promise("renaissance", "a field", P.ink, ["#fffaf0"])
  rule(`${A} ${INPUT}:focus`, `border-color: ${P.gilt} !important; box-shadow: inset 0 1px 2px rgba(74,47,23,.1), 0 0 0 3px rgba(168,132,63,.25) !important;`)
  rule(`${A} ${TITLE}`, `letter-spacing: .005em; line-height: 1.05; text-shadow: 0 1px 0 rgba(255,248,230,.55);`)
  rule(`${A} :is(${BIO}, ${TEXT})`, `text-shadow: 0 1px 0 rgba(255,248,230,.45);`)
  rule(`${A} :is(${HEADING}, ${BLOCK_TITLE})`, `
    font-style: italic; letter-spacing: .01em;
    background: ${RULE(120)} center bottom / 120px 14px no-repeat; padding-bottom: 16px;`)
  rule(`${A} ${AVATAR}`, `box-shadow: 0 0 0 3px ${P.ivory}, 0 0 0 4px ${P.gilt}, 0 0 0 8px rgba(168,132,63,.14), 0 16px 32px -14px rgba(60,35,15,.6) !important;`)
  rule(`${A} ${AVATAR_BOX}::after`, `content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: radial-gradient(90% 70% at 35% 25%, rgba(255,240,210,.18), rgba(255,240,210,0) 60%);`)
  rule(`${A} ${SOCIAL}`, `
    width: 42px; height: 42px; padding: 0; border-radius: 50% !important;
    background-color: ${P.ivory} !important; border: 1px solid ${P.gilt} !important;
    box-shadow: inset 0 0 0 2px ${P.ivory}, inset 0 0 0 3px rgba(168,132,63,.35), 0 4px 10px -6px ${P.umberShadow};`)
  rule(`${A} ${DIVIDER}`, `height: 14px; background: ${RULE(240)} center / 240px 14px no-repeat !important;`)
  rule(`${A} ${PICTURE}`, `border-radius: 2px !important; box-shadow: 0 0 0 1px ${P.gilt}, 0 0 0 4px ${P.ivory}, 0 0 0 5px ${P.giltSoft}, 0 14px 24px -16px rgba(60,35,15,.6);`)
  rule(`${A} [data-framed-picture]`, `border-radius: 2px; box-shadow: 0 0 0 1px ${P.giltSoft};`)
  rule(`${A} [data-code-copy]`, `background-color: ${P.lapis} !important; background-image: none; color: ${P.ivory} !important; border: 1px solid ${P.gilt} !important; box-shadow: inset 0 0 0 2px ${P.lapis}, inset 0 0 0 3px rgba(217,191,122,.55) !important;`)
  promise("renaissance", "the code's Copy", P.ivory, [P.lapis])
  legal("renaissance", "rgba(246,238,219,.92)", P.ink, [P.panel, "#e9dcc0"], `border: 1px solid ${P.giltSoft};`)
}
