/**
 * STOICISM: a page cut in dark stone (round AT, was Plaster in round AS).
 *
 * The owner: "it should be called stoicism and should be more good and clean
 * and like with some background, more complex", "more cool and clean rather
 * than just some border white". The ground is near black stone with faint
 * pale veins, as polished marble shows them, a fine grain, a geometer's
 * construction drawn very faintly over the top of the page (a circle, its
 * diagonals and a ruled grid that fades as it goes down) and a vignette that
 * darkens the edges. Links are solid ivory tablets with a fine inner rule,
 * set in spaced capitals; under the pointer they turn to stone with ivory
 * words, the rule still there, as if engraved (the theme's Fill hover).
 * Products and the newsletter sit on dark panels framed by two hairlines.
 *
 * Everything is drawn here with CSS and two small SVG textures: no picture
 * is fetched, copied or traced, and nothing moves.
 */
import { svg, S, SCENE, LINK, CTA, CARD, FAQ, CELL, BOX, SURF, INPUT, TITLE, AVATAR, SOCIAL, HEADING, BLOCK_TITLE, DIVIDER, PICTURE, STRIP, rule, comment, banner, onSurface, promise, legal } from "./shared.mjs"

const P = {
  stone: "#0e0e0d",
  panel: "#151514",
  panelHi: "#1c1b19",
  ivory: "#ece6da",
  ink: "#121110",
  hair: "rgba(236,230,218,.24)",
  hairSoft: "rgba(236,230,218,.12)",
}

/*
  Marble veins: a few long threads drawn by hand across the slab, each a
  hairline that thickens and thins (two strokes, one soft), with smaller
  branches. Tiled over 420 by 900, faint.
*/
const VEIN_PATHS = [
  ["M-20 120 C 80 150 120 90 210 140 S 330 230 440 200", 1.1, 0.5],
  ["M-20 330 C 60 300 150 360 230 330 S 360 280 440 320", 0.8, 0.4],
  ["M120 140 C 150 190 140 240 190 290", 0.5, 0.35],
  ["M-20 610 C 90 560 170 640 260 600 S 380 540 440 580", 1.2, 0.45],
  ["M260 600 C 280 660 330 690 340 760", 0.55, 0.3],
  ["M-20 820 C 100 790 200 850 300 810 S 400 780 440 800", 0.7, 0.35],
  ["M300 0 C 320 40 300 70 330 110", 0.45, 0.3],
]
const VEINS = svg(
  `<defs><filter id='s' x='-5%' y='-5%' width='110%' height='110%'><feGaussianBlur stdDeviation='1.6'/></filter></defs>` +
    `<g fill='none' stroke='#ece6da' stroke-linecap='round'>` +
    VEIN_PATHS.map(([d, w, o]) => `<path d='${d}' stroke-width='${w * 4}' stroke-opacity='${o * 0.25}' filter='url(#s)'/><path d='${d}' stroke-width='${w}' stroke-opacity='${o}'/>`).join("") +
    `</g>`,
  "0 0 420 900",
)
/* The stone's own tone: soft clouds a shade lighter and darker, never more than a few percent. */
const CLOUD = svg(
  `<filter id='c' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.0026' numOctaves='3' seed='9' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .9  0 0 0 0 .88  0 0 0 0 .84  .5 0 0 0 -.2'/></filter><rect width='100%' height='100%' filter='url(#c)'/>`,
  "0 0 900 900",
)
/* A fine grain, so the stone is never a flat colour. */
const GRAIN = svg(
  `<filter id='g'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .05 0'/></filter><rect width='100%' height='100%' filter='url(#g)'/>`,
  "0 0 160 160",
)
/* A construction: a circle, its square, the diagonals and the thirds, in one hairline. */
const CONSTRUCTION = svg(
  `<g fill='none' stroke='#ece6da' stroke-width='.6'><circle cx='200' cy='210' r='150'/><circle cx='200' cy='210' r='92' stroke-dasharray='2 5'/><rect x='50' y='60' width='300' height='300'/><path d='M50 60 L350 360 M350 60 L50 360 M0 210 H400 M200 0 V420 M150 0 V420 M250 0 V420'/></g>`,
  "0 0 400 420",
  " preserveAspectRatio='xMidYMin meet'",
)
/* The divider: a hairline with a small lozenge in the middle. */
const RULE = (w) => svg(
  `<g fill='#ece6da' fill-opacity='.55'><rect x='0' y='6.5' width='${w / 2 - 10}' height='.8'/><rect x='${w / 2 + 10}' y='6.5' width='${w / 2 - 10}' height='.8'/><path d='M${w / 2} 3 L ${w / 2 + 4} 7 L ${w / 2} 11 L ${w / 2 - 4} 7Z'/></g>`,
  `0 0 ${w} 14`,
)

/** A tablet's fine inner rule: the edge, a gap of the tablet's own colour, a hairline. */
const tablet = (fill, line) => `inset 0 0 0 3px ${fill}, inset 0 0 0 4px ${line}`

export function stoicism() {
  banner("STOICISM: dark stone with pale veins and a faint construction, ivory tablets with an inner rule (lib/onepage/theme-skin)")
  const sc = SCENE("stoicism")
  rule(`${sc} [data-sk="stone"]`, `position: absolute; inset: 0; background: ${GRAIN} 0 0 / 160px 160px, linear-gradient(180deg, #121211 0%, ${P.stone} 60%);`)
  rule(`${sc} [data-sk="stone"]::before`, `content: ""; position: absolute; inset: 0; background: ${CLOUD} 0 0 / 900px 900px; opacity: .1;`)
  rule(`${sc} [data-sk="stone"]::after`, `content: ""; position: absolute; inset: 0; background: ${VEINS} 0 0 / 420px 900px; opacity: .22;`)
  rule(`${sc} [data-sk="grid"]`, `
    position: absolute; inset: 0;
    background: repeating-linear-gradient(0deg, rgba(236,230,218,.035) 0 1px, transparent 1px 48px), repeating-linear-gradient(90deg, rgba(236,230,218,.035) 0 1px, transparent 1px 48px);
    -webkit-mask-image: linear-gradient(180deg, #000 0%, rgba(0,0,0,.5) 40%, transparent 75%); mask-image: linear-gradient(180deg, #000 0%, rgba(0,0,0,.5) 40%, transparent 75%);`)
  rule(`${sc} [data-sk="construction"]`, `position: absolute; left: 0; right: 0; top: 0; height: 640px; background: ${CONSTRUCTION} center top / 100% auto no-repeat; opacity: .09;`)
  rule(`${sc} [data-sk="vignette"]`, `position: absolute; inset: 0; background: radial-gradient(130% 90% at 50% 18%, rgba(0,0,0,0) 45%, rgba(0,0,0,.55) 100%);`)

  const A = S("stoicism")
  comment("stoicism: ivory tablets with a fine inner rule, in spaced capitals; under the pointer they turn to stone and keep the rule.")
  rule(`${A} ${LINK}`, `
    box-shadow: ${tablet("var(--sk-surface)", "rgba(18,17,16,.34)")}, 0 14px 26px -18px rgba(0,0,0,.9) !important;
    text-transform: uppercase; letter-spacing: .14em; font-size: .86em; font-weight: 500;`)
  rule(`${A} ${CTA}`, `
    background-color: var(--sk-surface) !important; background-image: none; color: var(--sk-ink) !important;
    border: 1px solid var(--sk-surface) !important; border-radius: 0 !important;
    box-shadow: ${tablet("var(--sk-surface)", "rgba(18,17,16,.34)")} !important;
    text-transform: uppercase; letter-spacing: .12em; font-size: .8em; font-weight: 600;`)
  promise("stoicism", "the ivory tablet", P.ink, [P.ivory])
  /* The hover's fill layer (app/globals.css .op-btn::after) covers the tablet's own rule, so the layer carries the rule too: stone, an ivory hairline inside. */
  rule(`${A} :is(a.op-btn, [data-tp-link]):is([data-hover="fill"], [data-hover="pop"])::after`, `box-shadow: ${tablet("var(--op-fill, #0e0e0d)", "rgba(236,230,218,.42)")};`)
  promise("stoicism", "an engraved tablet under the pointer", P.ivory, [P.stone])
  rule(`${A} :is(${CARD}, ${FAQ}, ${CELL}, ${SURF})`, `
    background-color: ${P.panel} !important; background-image: linear-gradient(180deg, rgba(236,230,218,.035) 0%, rgba(236,230,218,0) 50%);
    border: 1px solid ${P.hair} !important; border-radius: 0 !important;
    box-shadow: inset 0 0 0 4px ${P.panel}, inset 0 0 0 5px ${P.hairSoft}, 0 18px 30px -22px rgba(0,0,0,.9) !important;`)
  onSurface("stoicism", "a stone panel", `:is(${CARD}, ${FAQ})`, P.ivory, [P.panel, P.panelHi])
  onSurface("stoicism", "a countdown's number", CELL, P.ivory, [P.panel, P.panelHi])
  rule(`${A} ${STRIP}`, `background-color: transparent !important; border-top: 1px solid ${P.hairSoft};`)
  rule(`${A} ${BOX}`, `
    background-color: ${P.panel} !important; border: 1px solid ${P.hair}; border-radius: 0 !important;
    background-image: radial-gradient(120% 80% at 50% 0%, rgba(236,230,218,.05) 0%, rgba(236,230,218,0) 70%);
    box-shadow: inset 0 0 0 6px ${P.panel}, inset 0 0 0 7px ${P.hairSoft};`)
  onSurface("stoicism", "the subscribe and contact forms' panel", BOX, P.ivory, [P.panel, P.panelHi])
  rule(`${A} ${INPUT}`, `background: rgba(236,230,218,.06) !important; border: 1px solid rgba(236,230,218,.3) !important; border-radius: 0 !important; color: ${P.ivory} !important; box-shadow: none !important;`)
  promise("stoicism", "a field", P.ivory, [P.panelHi])
  rule(`${A} ${INPUT}::placeholder`, `color: rgba(236,230,218,.62) !important;`)
  rule(`${A} ${INPUT}:focus`, `border-color: ${P.ivory} !important; box-shadow: 0 0 0 3px rgba(236,230,218,.14) !important;`)
  rule(`${A} ${TITLE}`, `letter-spacing: -.015em;`)
  rule(`${A} :is(${HEADING}, ${BLOCK_TITLE})`, `
    text-transform: uppercase; letter-spacing: .24em; font-size: .8em; font-weight: 500;
    background: ${RULE(96)} center bottom / 96px 14px no-repeat; padding-bottom: 18px;`)
  rule(`${A} ${AVATAR}`, `box-shadow: 0 0 0 4px ${P.stone}, 0 0 0 5px rgba(236,230,218,.5), 0 18px 34px -16px rgba(0,0,0,.9) !important;`)
  rule(`${A} ${SOCIAL}`, `border-radius: 0 !important; background-color: transparent !important; border: 1px solid rgba(236,230,218,.34) !important; box-shadow: inset 0 0 0 3px ${P.stone}, inset 0 0 0 4px rgba(236,230,218,.1);`)
  rule(`${A} ${DIVIDER}`, `height: 14px; background: ${RULE(220)} center / 220px 14px no-repeat !important;`)
  rule(`${A} ${PICTURE}`, `border-radius: 0 !important; box-shadow: 0 0 0 1px ${P.hair}, 0 18px 30px -22px rgba(0,0,0,.9);`)
  rule(`${A} [data-framed-picture]`, `border-radius: 0;`)
  rule(`${A} [data-code-copy]`, `background-color: ${P.ivory} !important; background-image: none; color: ${P.ink} !important; border-radius: 0 !important; box-shadow: ${tablet(P.ivory, "rgba(18,17,16,.34)")} !important;`)
  promise("stoicism", "the code's Copy", P.ink, [P.ivory])
  legal("stoicism", "rgba(14,14,13,.86)", P.ivory, [P.stone, P.panel], `border: 1px solid ${P.hairSoft}; border-radius: 0;`)
}
