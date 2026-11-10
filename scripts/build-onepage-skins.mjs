/**
 * ===========================================================================
 *  THE SKINS' STYLESHEET, WRITTEN FROM ITS SOURCE (round W9)
 * ===========================================================================
 * components/onepage/themes/theme-skins.css draws the six skins (lib/onepage/theme-skin): the
 * material of every block and the scene behind the page. Its pictures are
 * small SVGs inlined as data addresses, which are unreadable once encoded,
 * so they are written here as SVG and encoded on the way out.
 *
 *   node scripts/build-onepage-skins.mjs          writes components/onepage/themes/theme-skins.css
 *   node scripts/build-onepage-skins.mjs --check  fails when the file is not what this writes
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
 */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const OUT = join(process.cwd(), "components/onepage/themes/theme-skins.css")

/** An SVG as a CSS url(), encoded the way every browser reads it. */
const svg = (body, viewBox, extra = "") =>
  `url("data:image/svg+xml,${`<svg xmlns='http://www.w3.org/2000/svg' viewBox='${viewBox}'${extra}>${body}</svg>`.replace(/[%#<>"]/g, (c) => encodeURIComponent(c))}")`

const S = (skin) => `[data-op-skin="${skin}"]`
const LINK = ":is(a.op-btn, [data-tp-link])"
const CTA = ":is([data-product-cta], [data-email-form] button[type=submit], [data-onepage-contact] button[type=submit])"
const CARD = ":is([data-product-block], [data-tp-product], a.op-card, [data-tp-card], [data-onepage-code], [data-onepage-testimonials] figure)"
const FAQ = "[data-onepage-faq] .op-card"
const CELL = "[data-onepage-countdown] .grid > div"
const BOX = ":is([data-email-layout], [data-onepage-contact])"
const SURF = ':where([style*="background-clip: padding-box"]:not(.op-btn, button, [data-product-block], [data-tp-product], .op-card, [data-tp-card], [data-tp-link], [data-onepage-code], figure, [data-onepage-countdown] .grid > div))'
const INPUT = ":is([data-email-form], [data-onepage-contact] form) :is(input:not([type=checkbox]):not([type=radio]):not(.absolute), textarea)"
const TITLE = ":is([data-op-header] h1, [data-tp-title])"
const BIO = "[data-op-header] > p"
const AVATAR = ":is([data-page-avatar] [data-slot=avatar], [data-tp-avatar])"
const AVATAR_BOX = ":is([data-page-avatar], [data-tp-avatar])"
const SOCIAL = ":is([data-op-social-icon], [data-tp-socials] > span)"
const HEADING = "[data-onepage-heading]"
const BLOCK_TITLE = ":is([data-onepage-faq], [data-onepage-countdown], [data-onepage-testimonials]) > [data-block-title]"
const DIVIDER = "[data-op-block] > .flex.items-center > .h-px:only-child"
const PICTURE = "[data-op-block] div[class*='aspect-']:has(> img):not(.op-card div)"
const STRIP = ".op-card > div:last-child"
const HOVER = "@media (hover: hover) and (pointer: fine)"
const HOVERED = ":is(.op-btn:hover, .op-host:hover .op-btn)"
/* A link that is a tile (Grid, Mixed tiles), on the page and on a card. */
const TILE = ":is([data-link-tile], [data-block-size='half'], [data-tp-pair], [data-tp-masonry])"

const css = []
const rule = (sel, body) => css.push(`${sel} {\n${body.trim().split("\n").map((l) => `  ${l.trim()}`).join("\n")}\n}`)
const comment = (text) => css.push(`\n/* ${text} */`)
const banner = (text) => css.push(`\n/* ===========================================================================\n   ${text}\n   =========================================================================== */`)

/* ── Shared art ─────────────────────────────────────────────────────── */

const NOISE = (alpha) => svg(`<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${alpha} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/>`, "0 0 200 200")

/* ── AERO ───────────────────────────────────────────────────────────── */

const CLOUD = svg(
  `<defs><radialGradient id='c' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#fff'/><stop offset='.5' stop-color='#fff' stop-opacity='.92'/><stop offset='1' stop-color='#fff' stop-opacity='0'/></radialGradient><radialGradient id='s' cx='.5' cy='.2' r='.6'><stop offset='0' stop-color='#cfe6f7' stop-opacity='.55'/><stop offset='1' stop-color='#cfe6f7' stop-opacity='0'/></radialGradient></defs>` +
    `<g fill='url(#c)'><ellipse cx='92' cy='92' rx='74' ry='44'/><ellipse cx='152' cy='66' rx='74' ry='58'/><ellipse cx='214' cy='84' rx='70' ry='46'/><ellipse cx='250' cy='104' rx='46' ry='28'/><ellipse cx='150' cy='106' rx='138' ry='32'/></g><ellipse cx='150' cy='124' rx='120' ry='14' fill='url(#s)'/>`,
  "0 0 300 150",
)
const SWOOSH = svg(
  `<defs><linearGradient id='a' x1='0' x2='1'><stop offset='0' stop-color='#fff' stop-opacity='0'/><stop offset='.35' stop-color='#fff' stop-opacity='.75'/><stop offset='.7' stop-color='#e6fbff' stop-opacity='.45'/><stop offset='1' stop-color='#fff' stop-opacity='0'/></linearGradient><linearGradient id='b' x1='0' x2='1'><stop offset='0' stop-color='#b8f0ff' stop-opacity='0'/><stop offset='.5' stop-color='#fff' stop-opacity='.6'/><stop offset='1' stop-color='#9fe6ff' stop-opacity='0'/></linearGradient></defs>` +
    `<path d='M-20 168 C 70 92 190 62 420 80 L 420 98 C 200 80 80 112 -20 192 Z' fill='url(#a)'/>` +
    `<path d='M-20 132 C 110 84 250 132 420 30 L 420 36 C 250 140 110 96 -20 140 Z' fill='url(#b)'/>` +
    `<path d='M-20 200 C 120 150 260 170 420 120 L 420 124 C 260 176 120 158 -20 206 Z' fill='#fff' fill-opacity='.35'/>`,
  "0 0 400 220",
  " preserveAspectRatio='none'",
)
const MEADOW = svg(
  `<defs><linearGradient id='b' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#b4ea74'/><stop offset='1' stop-color='#63bd34'/></linearGradient><linearGradient id='f' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#93de52'/><stop offset='.5' stop-color='#5ab72c'/><stop offset='1' stop-color='#3d971e'/></linearGradient><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='.6'/><stop offset='1' stop-color='#fff' stop-opacity='0'/></linearGradient></defs>` +
    `<path d='M0 66 C 70 36 150 40 232 62 S 362 58 400 42 V160 H0Z' fill='url(#b)'/>` +
    `<path d='M0 104 C 92 70 192 76 272 96 S 372 92 400 82 V160 H0Z' fill='url(#f)'/>` +
    `<path d='M0 104 C 92 70 192 76 272 96 S 372 92 400 82 V92 C 372 102 330 106 272 106 C 190 88 92 84 0 116Z' fill='url(#s)'/>` +
    `<g fill='#fff' fill-opacity='.85'><circle cx='40' cy='128' r='1.6'/><circle cx='118' cy='138' r='1.4'/><circle cx='206' cy='126' r='1.7'/><circle cx='298' cy='140' r='1.4'/><circle cx='360' cy='122' r='1.6'/></g><g fill='#ffe45c'><circle cx='40' cy='128' r='.7'/><circle cx='206' cy='126' r='.7'/><circle cx='360' cy='122' r='.7'/></g>`,
  "0 0 400 160",
  " preserveAspectRatio='none'",
)
const BUBBLE = [
  "radial-gradient(circle at 31% 27%, rgba(255,255,255,.98) 0, rgba(255,255,255,.9) 6%, rgba(255,255,255,0) 15%)",
  "radial-gradient(circle at 68% 76%, rgba(255,255,255,.55) 0, rgba(255,255,255,0) 20%)",
  "radial-gradient(circle at 50% 50%, rgba(160,225,255,0) 52%, rgba(170,235,255,.28) 62%, rgba(230,255,240,.55) 67%, rgba(255,255,255,.85) 70%, rgba(255,255,255,0) 70.8%)",
].join(", ")
const AERO_GLOSS = "linear-gradient(180deg, rgba(255,255,255,.92) 0%, rgba(255,255,255,.45) 46%, rgba(255,255,255,.06) 50%, rgba(255,255,255,0) 78%, rgba(180,232,255,.4) 100%)"
const GEL_GLOSS = "linear-gradient(180deg, rgba(255,255,255,.75) 0%, rgba(255,255,255,.3) 46%, rgba(255,255,255,0) 50%, rgba(255,255,255,0) 82%, rgba(255,255,255,.28) 100%)"

banner("AERO: a clear sky over a meadow, glass and gel (lib/onepage/theme-skin)")
const A = S("aero")
rule(`[data-skin-scene="aero"] [data-sk="sun"]`, `
  position: absolute; top: -300px; right: -260px; width: 640px; height: 640px; border-radius: 50%;
  background: radial-gradient(circle, rgba(255,255,255,.95) 0%, rgba(255,255,255,.6) 12%, rgba(255,255,255,.18) 34%, rgba(255,255,255,0) 60%), repeating-conic-gradient(from 0deg, rgba(255,255,255,.2) 0deg 5deg, rgba(255,255,255,0) 5deg 15deg);
  -webkit-mask-image: radial-gradient(circle, #000 0%, rgba(0,0,0,.6) 30%, transparent 68%); mask-image: radial-gradient(circle, #000 0%, rgba(0,0,0,.6) 30%, transparent 68%);
  animation: sk-spin 160s linear infinite;`)
rule(`[data-skin-scene="aero"] [data-sk="swoosh"]`, `position: absolute; left: -10%; width: 120%; top: 150px; height: 260px; background: ${SWOOSH} center / 100% 100% no-repeat; opacity: .9;`)
rule(`[data-skin-scene="aero"] [data-sk="cloud"]`, `position: absolute; width: 300px; height: 150px; background: ${CLOUD} center / contain no-repeat; animation: sk-drift 46s ease-in-out infinite alternate;`)
rule(`[data-skin-scene="aero"] [data-sk="cloud"]:nth-child(3)`, `top: 14px; left: -90px; transform: scale(.95);`)
rule(`[data-skin-scene="aero"] [data-sk="cloud"]:nth-child(4)`, `top: 330px; right: -120px; width: 260px; height: 130px; opacity: .8; animation-duration: 58s; animation-delay: -20s;`)
rule(`[data-skin-scene="aero"] [data-sk="cloud"]:nth-child(5)`, `top: 46%; left: -150px; width: 340px; height: 170px; opacity: .7; animation-duration: 64s; animation-delay: -34s;`)
rule(`[data-skin-scene="aero"] [data-sk="meadow"]`, `position: absolute; left: 0; right: 0; bottom: 0; height: 170px; background: ${MEADOW} center bottom / 100% 100% no-repeat;`)
rule(`[data-skin-scene="aero"] [data-sk="bubble"]`, `
  position: absolute; width: 48px; aspect-ratio: 1; border-radius: 50%; background: ${BUBBLE};
  box-shadow: inset 0 0 10px rgba(255,255,255,.35), 0 6px 18px -8px rgba(20,100,170,.25);
  animation: sk-bob 11s ease-in-out infinite alternate;`)
const bubbles = [["9%", "left: 6%", 54, 0], ["16%", "right: 5%", 30, -3], ["27%", "left: 84%", 74, -6], ["40%", "left: 2%", 22, -2], ["52%", "right: 3%", 42, -8], ["63%", "left: 3%", 62, -5], ["74%", "right: 7%", 26, -1], ["85%", "left: 14%", 36, -7], ["4%", "left: 40%", 18, -4]]
bubbles.forEach(([top, side, size, delay], i) => rule(`[data-skin-scene="aero"] [data-sk="bubble"]:nth-child(${7 + i})`, `top: ${top}; ${side}; width: ${size}px; animation-delay: ${delay}s; animation-duration: ${9 + (i % 4) * 1.6}s;`))

comment("Aero: frosted glass with a gel highlight, a soft blue shadow; the words stay the theme's.")
rule(`${A} ${LINK}`, `
  background-color: color-mix(in srgb, var(--sk-surface) 66%, transparent) !important;
  background-image: ${AERO_GLOSS};
  border-color: rgba(255,255,255,.95) !important;
  box-shadow: inset 0 1px 0 #fff, inset 0 -10px 18px -12px rgba(40,140,220,.45), 0 10px 24px -12px rgba(8,70,140,.55), 0 1px 2px rgba(8,60,120,.12) !important;
  -webkit-backdrop-filter: blur(12px) saturate(1.5); backdrop-filter: blur(12px) saturate(1.5);
  font-weight: 600;`)
rule(`${A} .op-btn::after`, `background-image: linear-gradient(180deg, rgba(255,255,255,.55) 0%, rgba(255,255,255,.14) 48%, rgba(255,255,255,0) 52%);`)
rule(`${A} ${CTA}`, `
  background-color: #7fdc56 !important;
  background-image: linear-gradient(180deg, rgba(255,255,255,.85) 0%, rgba(255,255,255,.3) 46%, rgba(255,255,255,0) 50%), linear-gradient(180deg, #a3ec74 0%, #6fcf45 50%, #58bd33 51%, #8ee05e 100%);
  color: #08325a !important; border-color: #3f9a2a !important; font-weight: 700;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.9), 0 6px 14px -6px rgba(40,120,30,.55) !important;`)
rule(`${A} :is(${CARD}, ${FAQ}, ${CELL}, ${SURF})`, `
  background-color: color-mix(in srgb, var(--sk-surface) 58%, transparent) !important;
  background-image: linear-gradient(180deg, rgba(255,255,255,.75) 0%, rgba(255,255,255,0) 42px);
  border-color: rgba(255,255,255,.95) !important; border-radius: 20px !important;
  box-shadow: inset 0 1px 0 #fff, 0 14px 34px -16px rgba(8,70,140,.5), 0 1px 3px rgba(8,60,120,.1) !important;
  -webkit-backdrop-filter: blur(14px) saturate(1.4); backdrop-filter: blur(14px) saturate(1.4);`)
rule(`${A} ${CELL}`, `border-radius: 16px !important;`)
rule(`${A} ${STRIP}`, `background-color: transparent !important;`)
rule(`${A} ${BOX}`, `
  background-color: rgba(255,255,255,.42) !important; border: 1px solid rgba(255,255,255,.9); border-radius: 22px !important;
  background-image: linear-gradient(180deg, rgba(255,255,255,.7) 0%, rgba(255,255,255,0) 56px);
  box-shadow: inset 0 1px 0 #fff, 0 16px 36px -18px rgba(8,70,140,.5);
  -webkit-backdrop-filter: blur(14px) saturate(1.4); backdrop-filter: blur(14px) saturate(1.4);`)
rule(`${A} ${INPUT}`, `
  background: rgba(255,255,255,.92) !important; border: 1px solid rgba(120,180,230,.7) !important; border-radius: 12px !important;
  box-shadow: inset 0 2px 4px rgba(8,60,120,.12) !important; color: #063a6b !important;`)
rule(`${A} ${INPUT}:focus`, `box-shadow: inset 0 2px 4px rgba(8,60,120,.12), 0 0 0 3px rgba(80,170,240,.45) !important;`)
rule(`${A} ${TITLE}`, `text-shadow: 0 1px 0 rgba(255,255,255,.85), 0 0 22px rgba(255,255,255,.85); letter-spacing: -.01em;`)
rule(`${A} :is(${BIO}, ${HEADING}, ${BLOCK_TITLE})`, `text-shadow: 0 1px 0 rgba(255,255,255,.7), 0 0 14px rgba(255,255,255,.8);`)
rule(`${A} ${AVATAR}`, `box-shadow: 0 0 0 1px rgba(120,190,240,.5), 0 10px 28px -8px rgba(0,80,160,.55), 0 0 34px rgba(255,255,255,.75) !important;`)
rule(`${A} ${AVATAR_BOX}::after`, `content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: linear-gradient(180deg, rgba(255,255,255,.6) 0%, rgba(255,255,255,.12) 44%, rgba(255,255,255,0) 46%);`)
rule(`${A} ${SOCIAL}`, `
  width: 44px; height: 44px; padding: 0; border-radius: 50% !important;
  background-color: rgba(255,255,255,.55) !important; border: 1px solid rgba(255,255,255,.95) !important;
  background-image: ${AERO_GLOSS};
  box-shadow: inset 0 1px 0 #fff, 0 6px 14px -6px rgba(8,70,140,.45);`)
rule(`${A} ${DIVIDER}`, `height: 2px; border-radius: 2px; background: linear-gradient(90deg, rgba(255,255,255,0), #fff 30%, #fff 70%, rgba(255,255,255,0)) !important; box-shadow: 0 0 10px rgba(255,255,255,.9);`)
rule(`${A} ${PICTURE}`, `border-radius: 20px !important; box-shadow: 0 0 0 3px rgba(255,255,255,.85), 0 12px 26px -12px rgba(8,70,140,.55);`)
rule(`${A} [data-framed-picture]`, `border-radius: 14px; box-shadow: 0 0 0 2px rgba(255,255,255,.9);`)

/* ── AQUA ───────────────────────────────────────────────────────────── */

const AQUA_WAVE = svg(
  `<defs><linearGradient id='a' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#5aa2f0'/><stop offset='.6' stop-color='#9cc8f6'/><stop offset='1' stop-color='#e6f0fb'/></linearGradient><linearGradient id='b' x1='1' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#ffffff' stop-opacity='.9'/><stop offset='1' stop-color='#ffffff' stop-opacity='0'/></linearGradient></defs>` +
    `<path d='M0 0 H400 V120 C 320 200 190 120 120 170 C 70 206 30 230 0 236 Z' fill='url(#a)'/>` +
    `<path d='M400 40 C 300 150 200 70 110 130 C 70 156 30 190 0 200 V214 C 40 200 80 172 120 148 C 210 92 310 168 400 60 Z' fill='url(#b)'/>` +
    `<path d='M0 60 C 90 120 180 20 300 70 C 340 86 370 80 400 64 V72 C 370 92 330 96 300 82 C 180 34 90 132 0 72 Z' fill='#fff' fill-opacity='.35'/>`,
  "0 0 400 240",
  " preserveAspectRatio='none'",
)
const AQUA_LIGHTS = [
  "radial-gradient(circle at 14px 11px, rgba(255,255,255,.85) 0 1.5px, transparent 2.5px)",
  "radial-gradient(circle at 32px 11px, rgba(255,255,255,.85) 0 1.5px, transparent 2.5px)",
  "radial-gradient(circle at 50px 11px, rgba(255,255,255,.85) 0 1.5px, transparent 2.5px)",
  "radial-gradient(circle at 14px 12px, #ff5f57 0 4.6px, #c33c35 5.2px, transparent 5.8px)",
  "radial-gradient(circle at 32px 12px, #febc2e 0 4.6px, #c58a12 5.2px, transparent 5.8px)",
  "radial-gradient(circle at 50px 12px, #28c840 0 4.6px, #16912a 5.2px, transparent 5.8px)",
  "linear-gradient(180deg, #fbfbfb 0px, #e2e2e2 22px, #a6a6a6 22px, #a6a6a6 23px, rgba(255,255,255,0) 23px)",
  "repeating-linear-gradient(180deg, rgba(255,255,255,.55) 0 1px, rgba(255,255,255,0) 1px 2px)",
].join(", ")
const BLUE_GEL = "linear-gradient(180deg, rgba(255,255,255,.88) 0%, rgba(255,255,255,.35) 46%, rgba(255,255,255,0) 50%), radial-gradient(120% 70% at 50% 115%, rgba(190,235,255,.95) 0%, rgba(150,210,255,0) 70%), linear-gradient(180deg, #7cb9f6 0%, #4a94ec 50%, #3d89e8 51%, #5aa9f5 100%)"
const CLEAR_GEL = "linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(255,255,255,.75) 45%, rgba(225,231,240,.0) 50%), radial-gradient(120% 75% at 50% 120%, rgba(255,255,255,.95) 0%, rgba(255,255,255,0) 70%), linear-gradient(180deg, #f7f9fc 0%, #eaeef4 50%, #dde3ec 51%, #f3f6fa 100%)"

banner("AQUA: a pinstriped window, clear and blue gel")
const Q = S("aqua")
rule(`[data-skin-scene="aqua"] [data-sk="stripes"]`, `position: absolute; inset: 0; background: repeating-linear-gradient(180deg, rgba(255,255,255,.8) 0 2px, rgba(255,255,255,0) 2px 4px);`)
rule(`[data-skin-scene="aqua"] [data-sk="light"]`, `position: absolute; left: 50%; top: -180px; width: 760px; height: 560px; margin-left: -380px; background: radial-gradient(closest-side, rgba(255,255,255,.95), rgba(255,255,255,0));`)
rule(`[data-skin-scene="aqua"] [data-sk="wave"]`, `
  position: absolute; left: 0; right: 0; top: 0; height: 300px; background: ${AQUA_WAVE} center top / 100% 100% no-repeat; opacity: .5;
  -webkit-mask-image: linear-gradient(180deg, #000 30%, transparent 100%); mask-image: linear-gradient(180deg, #000 30%, transparent 100%);`)
rule(`[data-skin-scene="aqua"] [data-sk="wave"]:nth-child(4)`, `top: auto; bottom: 0; transform: scale(-1, -1); opacity: .3; height: 260px;`)
comment("Aqua: clear gel pills, the default button in blue gel and slowly throbbing, cards as windows with a title bar.")
rule(`${Q} ${LINK}`, `
  background-image: ${CLEAR_GEL};
  border-color: #8e99ad !important;
  box-shadow: inset 0 1px 0 #fff, inset 0 -1px 1px rgba(255,255,255,.9), 0 1px 1px rgba(0,0,0,.28), 0 3px 8px -2px rgba(0,0,0,.2) !important;
  font-weight: 700; text-shadow: 0 1px 0 rgba(255,255,255,.8);`)
rule(`${Q} ${TILE} ${LINK}`, `border-radius: 22px !important;`)
rule(`${Q} .op-btn::after`, `background-image: ${BLUE_GEL};`)
rule(`${Q} ${CTA}`, `
  background-color: #4a94ec !important; background-image: ${BLUE_GEL};
  color: #06162e !important; border-color: #2459a8 !important; font-weight: 700; text-shadow: 0 1px 0 rgba(255,255,255,.35);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.7), 0 1px 1px rgba(0,0,0,.3), 0 4px 10px -3px rgba(20,80,180,.45) !important;
  animation: sk-throb 1.9s ease-in-out infinite alternate;`)
rule(`${Q} :is(${CARD}, ${BOX})`, `
  background-color: #ffffff !important; background-image: ${AQUA_LIGHTS};
  border: 1px solid #9c9c9c !important; border-radius: 9px !important; padding-top: 23px !important;
  box-shadow: 0 12px 28px -12px rgba(0,0,0,.45), 0 1px 3px rgba(0,0,0,.18) !important;`)
rule(`${Q} :is([data-product-block="row"], [data-tp-product="row"], a.op-card, [data-tp-card])`, `background-image: none; padding-top: 0 !important;`)
rule(`${Q} :is([data-onepage-code], [data-onepage-testimonials] figure)`, `padding-top: 33px !important;`)
rule(`${Q} ${BOX}`, `padding: 37px 20px 20px !important;`)
rule(`${Q} :is(${FAQ}, ${CELL}, ${SURF})`, `
  background-color: #ffffff !important; background-image: linear-gradient(180deg, #ffffff 0%, #f1f1f1 100%);
  border-color: #a8a8a8 !important; border-radius: 7px !important;
  box-shadow: inset 0 1px 0 #fff, 0 1px 2px rgba(0,0,0,.2) !important;`)
rule(`${Q} ${STRIP}`, `background-color: #ffffff !important; background-image: linear-gradient(180deg, #ffffff, #ececec);`)
rule(`${Q} ${INPUT}`, `background: #fff !important; border: 1px solid #8f8f8f !important; border-top-color: #6b6b6b !important; border-radius: 4px !important; box-shadow: inset 0 1px 2px rgba(0,0,0,.28) !important; color: #141414 !important;`)
rule(`${Q} ${INPUT}:focus`, `box-shadow: inset 0 1px 2px rgba(0,0,0,.28), 0 0 0 3px rgba(80,150,240,.7) !important;`)
rule(`${Q} ${TITLE}`, `text-shadow: 0 1px 0 rgba(255,255,255,.95); letter-spacing: -.005em;`)
rule(`${Q} :is(${HEADING}, ${BLOCK_TITLE})`, `text-shadow: 0 1px 0 rgba(255,255,255,.95);`)
rule(`${Q} ${AVATAR}`, `box-shadow: 0 0 0 1px rgba(0,0,0,.18), 0 8px 18px -4px rgba(0,0,0,.45) !important;`)
rule(`${Q} ${AVATAR_BOX}::after`, `content: ""; position: absolute; inset: 3px; border-radius: inherit; pointer-events: none; background: linear-gradient(180deg, rgba(255,255,255,.45) 0%, rgba(255,255,255,.08) 40%, rgba(255,255,255,0) 41%);`)
rule(`${Q} ${SOCIAL}`, `
  width: 42px; height: 42px; padding: 0; border-radius: 50% !important;
  background-image: ${CLEAR_GEL}; border: 1px solid #8e99ad !important;
  box-shadow: inset 0 1px 0 #fff, 0 1px 1px rgba(0,0,0,.25), 0 3px 7px -2px rgba(0,0,0,.2);`)
rule(`${Q} ${DIVIDER}`, `height: 2px; background: linear-gradient(180deg, #b4b4b4 0 1px, #ffffff 1px 2px) !important;`)
rule(`${Q} ${PICTURE}`, `border-radius: 9px !important; border: 3px solid #fff; box-shadow: 0 1px 0 rgba(0,0,0,.15), 0 8px 18px -6px rgba(0,0,0,.4);`)

/* ── MESSENGER ──────────────────────────────────────────────────────── */

const MSN_RIBBON = svg(
  `<defs><linearGradient id='a' x1='0' x2='1'><stop offset='0' stop-color='#fff' stop-opacity='0'/><stop offset='.4' stop-color='#fff' stop-opacity='.55'/><stop offset='1' stop-color='#fff' stop-opacity='0'/></linearGradient></defs>` +
    `<path d='M-10 120 C 80 40 220 150 410 50 L410 64 C 220 166 80 58 -10 136Z' fill='url(#a)'/>` +
    `<path d='M-10 70 C 120 120 240 10 410 90 L410 96 C 240 22 120 132 -10 78Z' fill='#fff' fill-opacity='.3'/>`,
  "0 0 400 180",
  " preserveAspectRatio='none'",
)
const STATUS_DOT = (x, y) => `radial-gradient(circle at calc(${x} - 1.5px) calc(${y} - 2px), rgba(255,255,255,.95) 0 1.6px, transparent 2.4px), radial-gradient(circle at ${x} ${y}, #8fe35c 0 4px, #3c9a1d 5px, rgba(60,154,29,0) 5.8px)`
const ROW = "linear-gradient(180deg, #ffffff 0%, #ffffff 55%, #edf3fd 100%)"
const LUNA_BAR = "linear-gradient(180deg, #3d8ef8 0%, #0b5fe0 22%, #0350d2 62%, #0a5ce0 86%, #2a75ee 100%)"
const XP_ORB = svg(`<defs><radialGradient id='g' cx='.4' cy='.35' r='.7'><stop offset='0' stop-color='#d8ffb8'/><stop offset='.45' stop-color='#6fd23f'/><stop offset='1' stop-color='#2f8a17'/></radialGradient></defs><circle cx='8.5' cy='8.5' r='7.4' fill='url(#g)' stroke='#fff' stroke-opacity='.9' stroke-width='1.2'/><ellipse cx='7.4' cy='5.6' rx='3.6' ry='2.1' fill='#fff' fill-opacity='.75'/>`, "0 0 17 17")
const XP_DOTS = "radial-gradient(circle at calc(100% - 14px) 13px, rgba(255,255,255,.95) 0 2px, transparent 2.6px), radial-gradient(circle at calc(100% - 26px) 13px, rgba(255,255,255,.7) 0 2px, transparent 2.6px), radial-gradient(circle at calc(100% - 38px) 13px, rgba(255,255,255,.5) 0 2px, transparent 2.6px)"
const XP_GREEN = "linear-gradient(180deg, rgba(255,255,255,.5) 0%, rgba(255,255,255,.12) 46%, rgba(255,255,255,0) 50%), linear-gradient(180deg, #3b9a2f 0%, #2b7f22 50%, #226b1a 51%, #2f8a26 100%)"

banner("MESSENGER: a buddy list in Luna blue, status lights and green gel")
const M = S("messenger")
rule(`[data-skin-scene="messenger"] [data-sk="band"]`, `position: absolute; left: 0; right: 0; top: 0; height: 190px; background: linear-gradient(180deg, #1e5fd0 0%, #3d7fe6 38%, rgba(120,170,240,.55) 72%, rgba(212,227,251,0) 100%);`)
rule(`[data-skin-scene="messenger"] [data-sk="ribbon"]`, `position: absolute; left: -5%; width: 110%; top: 18px; height: 150px; background: ${MSN_RIBBON} center / 100% 100% no-repeat; animation: sk-sway 18s ease-in-out infinite alternate;`)
rule(`[data-skin-scene="messenger"] [data-sk="ribbon"]:nth-child(3)`, `top: 60px; transform: scaleX(-1); opacity: .6; animation-duration: 24s;`)
rule(`[data-skin-scene="messenger"] [data-sk="glow"]`, `position: absolute; width: 420px; height: 420px; border-radius: 50%; background: radial-gradient(closest-side, rgba(150,190,255,.35), rgba(150,190,255,0)); left: -200px; top: 46%;`)
rule(`[data-skin-scene="messenger"] [data-sk="glow"]:nth-child(5)`, `left: auto; right: -220px; top: 72%; background: radial-gradient(closest-side, rgba(140,220,120,.22), rgba(140,220,120,0));`)
comment("Messenger: rows of a buddy list (a green light, the name, selection blue on hover), windows with a Luna title bar.")
rule(`${M} ${LINK}`, `
  background-image: ${STATUS_DOT("21px", "50%")}, ${ROW};
  border-color: #9fb9e3 !important; padding-left: 40px !important;
  box-shadow: 0 1px 0 rgba(255,255,255,.9) inset, 0 2px 5px -2px rgba(30,80,170,.35) !important;
  font-weight: 700;`)
rule(`${M} :is([data-link-tile], [data-block-size="half"], [data-tp-masonry], [data-tp-pair]) ${LINK}`, `background-image: ${STATUS_DOT("calc(100% - 16px)", "16px")}, ${ROW}; padding-left: 14px !important;`)
rule(`${M} .op-btn::after`, `background-image: linear-gradient(180deg, rgba(255,255,255,.28) 0%, rgba(255,255,255,0) 52%);`)
rule(`${M} ${CTA}`, `
  background-color: #2b7f22 !important; background-image: ${XP_GREEN};
  color: #ffffff !important; border-color: #1d5c16 !important; font-weight: 800; font-style: italic; text-shadow: 0 1px 1px rgba(0,0,0,.45);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.45), 0 2px 6px -2px rgba(20,70,10,.6) !important;`)
rule(`${M} :is(${CARD}, ${BOX})`, `
  background-color: #ffffff !important; background-image: ${XP_ORB}, ${XP_DOTS}, ${LUNA_BAR};
  background-size: 17px 17px, auto, auto, auto, 100% 26px; background-repeat: no-repeat; background-position: 7px 4px, 0 0, 0 0, 0 0, 0 0;
  border: 1px solid #0a4fc4 !important; border-radius: 9px 9px 5px 5px !important; padding-top: 26px !important;
  box-shadow: 0 10px 24px -12px rgba(10,50,130,.55), 0 1px 2px rgba(10,50,130,.2) !important;`)
rule(`${M} :is([data-product-block="row"], [data-tp-product="row"], a.op-card, [data-tp-card])`, `background-image: ${ROW}; background-size: auto; padding-top: 0 !important; border-color: #9fb9e3 !important; border-radius: 6px !important;`)
rule(`${M} [data-onepage-code]`, `padding-top: 36px !important;`)
rule(`${M} ${BOX}`, `padding: 40px 20px 20px !important;`)
rule(`${M} :is(${FAQ}, ${CELL}, ${SURF})`, `background-image: ${ROW}; border-color: #9fb9e3 !important; box-shadow: 0 2px 5px -2px rgba(30,80,170,.3) !important;`)
rule(`${M} ${STRIP}`, `background-color: #f1f6ff !important; border-top: 1px solid #c9d8f2;`)
rule(`${M} ${INPUT}`, `background: #fff !important; border: 1px solid #7f9db9 !important; border-radius: 3px !important; box-shadow: inset 0 1px 2px rgba(15,42,85,.12) !important; color: #0f2a55 !important;`)
rule(`${M} ${INPUT}:focus`, `border-color: #316ac5 !important; box-shadow: 0 0 0 2px rgba(49,106,197,.35) !important;`)
rule(`${M} ${TITLE}`, `text-shadow: 0 1px 0 #fff;`)
rule(`${M} :is(${HEADING}, ${BLOCK_TITLE})`, `background: linear-gradient(90deg, rgba(49,106,197,0), rgba(49,106,197,.55), rgba(49,106,197,0)) center bottom / 70% 2px no-repeat; padding-bottom: 6px;`)
rule(`${M} ${AVATAR}`, `border-radius: 12px !important; box-shadow: 0 0 0 2px #fff, 0 0 0 5px #6cc04a, 0 0 0 6px #3f8f2a, 0 8px 18px -4px rgba(10,50,130,.45) !important;`)
rule(`${M} [data-page-avatar]::after, ${M} [data-tp-avatar]::after`, `
  content: ""; position: absolute; right: -8px; bottom: -8px; width: 22px; height: 22px; border-radius: 50%; pointer-events: none;
  background: radial-gradient(circle at 36% 30%, #fff 0 2px, transparent 3.5px), radial-gradient(circle, #9be864 0%, #4aa82a 70%, #2f7f17 100%);
  box-shadow: 0 0 0 2px #fff, 0 2px 4px rgba(0,0,0,.3); animation: sk-online 2.6s ease-in-out infinite;`)
rule(`${M} ${SOCIAL}`, `
  width: 42px; height: 42px; padding: 0; border-radius: 8px !important;
  background-color: #fff !important; background-image: linear-gradient(180deg, #ffffff 0%, #ffffff 50%, #e1ebfb 100%);
  border: 1px solid #a9c1e8 !important; box-shadow: 0 2px 4px -1px rgba(30,80,170,.3);`)
rule(`${M} ${DIVIDER}`, `height: 1px; background: repeating-linear-gradient(90deg, #8fb0e6 0 2px, transparent 2px 4px) !important;`)
rule(`${M} ${PICTURE}`, `border-radius: 8px !important; border: 1px solid #9fb9e3; box-shadow: 0 0 0 3px #fff, 0 6px 14px -6px rgba(30,80,170,.45);`)

/* ── Y2K ────────────────────────────────────────────────────────────── */

const SPARK = (fill) => svg(
  `<defs><radialGradient id='g'><stop offset='0' stop-color='${fill}' stop-opacity='.55'/><stop offset='1' stop-color='${fill}' stop-opacity='0'/></radialGradient></defs><circle cx='50' cy='50' r='50' fill='url(#g)'/><path d='M50 4 C 53 38 62 47 96 50 C 62 53 53 62 50 96 C 47 62 38 53 4 50 C 38 47 47 38 50 4Z' fill='${fill}'/><circle cx='50' cy='50' r='5' fill='#fff'/>`,
  "0 0 100 100",
)
const CHROME = "linear-gradient(180deg, #ffffff 0%, #eef1f6 16%, #c5cbd8 47%, #939bad 50%, #d8dde7 76%, #ffffff 100%)"
const HOLO = "linear-gradient(115deg, #ffc2ef 0%, #bfefff 30%, #d9cbff 55%, #c4ffe2 78%, #ffd9b8 100%)"

banner("Y2K: chrome, holograms and sparkles at night")
const Y = S("y2k")
rule(`[data-skin-scene="y2k"] [data-sk="aurora"]`, `position: absolute; width: 520px; height: 520px; border-radius: 50%; animation: sk-aurora 26s ease-in-out infinite alternate;`)
rule(`[data-skin-scene="y2k"] [data-sk="aurora"]:nth-child(1)`, `top: -200px; left: -220px; background: radial-gradient(closest-side, rgba(255,79,216,.42), rgba(255,79,216,0));`)
rule(`[data-skin-scene="y2k"] [data-sk="aurora"]:nth-child(2)`, `top: 26%; right: -260px; background: radial-gradient(closest-side, rgba(54,224,255,.32), rgba(54,224,255,0)); animation-duration: 32s; animation-delay: -12s;`)
rule(`[data-skin-scene="y2k"] [data-sk="aurora"]:nth-child(3)`, `top: 62%; left: -240px; background: radial-gradient(closest-side, rgba(139,92,255,.42), rgba(139,92,255,0)); animation-duration: 29s; animation-delay: -20s;`)
rule(`[data-skin-scene="y2k"] [data-sk="horizon"]`, `
  position: absolute; left: -50%; width: 200%; bottom: 0; height: 300px; transform-origin: 50% 100%; transform: perspective(260px) rotateX(64deg);
  background: linear-gradient(rgba(150,205,255,.55) 1.5px, transparent 1.5px) 0 0 / 44px 44px, linear-gradient(90deg, rgba(255,150,240,.45) 1.5px, transparent 1.5px) 0 0 / 44px 44px;
  -webkit-mask-image: linear-gradient(to top, #000 0%, transparent 92%); mask-image: linear-gradient(to top, #000 0%, transparent 92%); opacity: .55;`)
rule(`[data-skin-scene="y2k"] [data-sk="pixels"]`, `
  position: absolute; inset: 0; opacity: .8; animation: sk-shimmer 5s ease-in-out infinite alternate;
  background-image: radial-gradient(circle, #fff 0 1px, transparent 1.6px), radial-gradient(circle, #bfefff 0 1px, transparent 1.6px), radial-gradient(circle, #ffc2ef 0 1.2px, transparent 1.8px);
  background-size: 173px 211px, 97px 139px, 251px 187px; background-position: 13px 29px, 61px 7px, 120px 90px;`)
rule(`[data-skin-scene="y2k"] [data-sk="spark"]`, `position: absolute; width: 22px; aspect-ratio: 1; background: ${SPARK("#ffffff")} center / contain no-repeat; animation: sk-twinkle 3.4s ease-in-out infinite;`)
const sparks = [["7%", "left: 9%", 34, 0, "#ffffff"], ["13%", "right: 11%", 18, -1.2, "#bfefff"], ["22%", "left: 4%", 14, -2.3, "#ffc2ef"], ["31%", "right: 4%", 36, -0.6, "#ffffff"], ["44%", "left: 6%", 20, -1.8, "#d9cbff"], ["53%", "right: 8%", 14, -2.9, "#ffffff"], ["64%", "left: 3%", 32, -0.3, "#bfefff"], ["73%", "right: 5%", 18, -1.5, "#ffc2ef"], ["84%", "left: 11%", 16, -2.6, "#ffffff"], ["3%", "left: 46%", 12, -0.9, "#d9cbff"]]
sparks.forEach(([top, side, size, delay, fill], i) => rule(`[data-skin-scene="y2k"] [data-sk="spark"]:nth-child(${6 + i})`, `top: ${top}; ${side}; width: ${size}px; animation-delay: ${delay}s;${fill !== "#ffffff" ? ` background-image: ${SPARK(fill)};` : ""}`))
comment("Y2K: chrome pills, holographic buttons and rims, chrome type.")
rule(`${Y} ${LINK}`, `
  background-image: ${CHROME};
  border-color: rgba(255,255,255,.95) !important;
  box-shadow: inset 0 1px 0 #fff, inset 0 -2px 5px rgba(70,80,110,.35), 0 0 0 1px rgba(10,8,30,.55), 0 10px 26px -10px rgba(140,110,255,.75), 0 0 22px -6px rgba(90,220,255,.45) !important;
  font-weight: 600; letter-spacing: .01em; text-shadow: 0 1px 0 rgba(255,255,255,.7);`)
rule(`${Y} ${TILE} ${LINK}`, `border-radius: 26px !important;`)
rule(`${Y} .op-btn::after`, `background-image: ${HOLO};`)
rule(`${Y} ${CTA}`, `
  background-color: #d9cbff !important; background-image: linear-gradient(180deg, rgba(255,255,255,.7) 0%, rgba(255,255,255,.15) 48%, rgba(255,255,255,0) 52%), ${HOLO};
  color: #14112b !important; border-color: rgba(255,255,255,.9) !important; font-weight: 700;
  box-shadow: inset 0 1px 0 #fff, 0 0 0 1px rgba(10,8,30,.5), 0 6px 18px -6px rgba(255,120,230,.7) !important;`)
rule(`${Y} :is(${CARD}, ${FAQ}, ${CELL}, ${SURF})`, `
  background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(226,231,242,.94)) padding-box, ${HOLO} border-box !important;
  border: 2px solid transparent !important; border-radius: 22px !important;
  box-shadow: 0 0 0 1px rgba(10,8,30,.5), 0 14px 34px -14px rgba(139,92,255,.8), 0 0 28px -10px rgba(90,220,255,.55) !important;`)
rule(`${Y} ${CELL}`, `border-radius: 16px !important;`)
rule(`${Y} ${STRIP}`, `background-color: transparent !important;`)
rule(`${Y} ${BOX}`, `
  background: linear-gradient(180deg, rgba(30,24,72,.82), rgba(18,15,46,.86)) padding-box, ${HOLO} border-box !important;
  border: 1.5px solid transparent; border-radius: 24px !important;
  box-shadow: 0 16px 40px -16px rgba(139,92,255,.75), inset 0 1px 0 rgba(255,255,255,.12);`)
rule(`${Y} ${INPUT}`, `background: rgba(255,255,255,.94) !important; border: 1px solid rgba(255,255,255,.9) !important; border-radius: 999px !important; box-shadow: inset 0 2px 4px rgba(20,17,43,.25) !important; color: #14112b !important;`)
rule(`${Y} ${INPUT}:is(textarea)`, `border-radius: 18px !important;`)
rule(`${Y} ${INPUT}:focus`, `box-shadow: inset 0 2px 4px rgba(20,17,43,.25), 0 0 0 3px rgba(191,239,255,.6) !important;`)
rule(`${Y} ${TITLE}`, `
  background: linear-gradient(180deg, #ffffff 0%, #f1f4fb 36%, #9aa4bd 50%, #6f7a96 54%, #eef2fa 70%, #c9d2e6 100%);
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 0 14px rgba(170,130,255,.55)) drop-shadow(0 2px 0 rgba(8,6,26,.9));`)
rule(`${Y} :is(${HEADING}, ${BLOCK_TITLE})`, `text-shadow: 0 0 14px rgba(191,239,255,.55), 0 0 2px rgba(255,255,255,.4); letter-spacing: .02em;`)
rule(`${Y} ${AVATAR}`, `box-shadow: 0 0 0 2px #0d0c1f, 0 0 26px -2px rgba(191,239,255,.6) !important;`)
rule(`${Y} [data-tp-avatar]`, `box-shadow: 0 0 0 3px #0d0c1f, 0 0 0 7px #d9cbff, 0 0 26px rgba(191,239,255,.6) !important;`)
rule(`${Y} [data-page-avatar]::before`, `
  content: ""; position: absolute; inset: -7px; border-radius: inherit; pointer-events: none; z-index: -1;
  background: conic-gradient(from 0deg, #ffc2ef, #bfefff, #d9cbff, #c4ffe2, #ffd9b8, #ffc2ef);
  animation: sk-spin 9s linear infinite;`)
rule(`${Y} [data-page-avatar]`, `isolation: isolate;`)
rule(`${Y} ${SOCIAL}`, `
  width: 44px; height: 44px; padding: 0; border-radius: 50% !important;
  background-color: rgba(255,255,255,.06) !important; border: 1.5px solid rgba(227,231,239,.75) !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.25), 0 0 16px -4px rgba(191,239,255,.6);`)
rule(`${Y} ${DIVIDER}`, `height: 4px; background: repeating-linear-gradient(90deg, #bfefff 0 4px, transparent 4px 8px, #ffc2ef 8px 12px, transparent 12px 16px) !important; image-rendering: pixelated; opacity: .9;`)
rule(`${Y} ${PICTURE}`, `border-radius: 22px !important; box-shadow: 0 0 0 2px #e3e7ef, 0 0 0 4px rgba(139,92,255,.55), 0 14px 30px -12px rgba(139,92,255,.8);`)
rule(`${Y} [data-framed-picture]`, `border-radius: 14px;`)

/* ── PLAYFUL ────────────────────────────────────────────────────────── */

const BLOB = (fill, d) => svg(`<path d='${d}' fill='${fill}'/>`, "0 0 200 200")
const BLOBS = [
  BLOB("#ffd2b6", "M44 28 C 78 -6 150 6 172 46 C 196 88 186 142 146 170 C 104 198 40 188 18 146 C -4 104 12 60 44 28Z"),
  BLOB("#e4d6ff", "M60 18 C 104 0 168 20 184 70 C 198 116 168 176 112 186 C 60 196 12 160 10 108 C 8 64 22 34 60 18Z"),
  BLOB("#c8f1d8", "M40 40 C 70 6 140 -2 170 34 C 200 70 192 126 160 160 C 128 192 64 198 32 166 C 2 134 10 74 40 40Z"),
  BLOB("#fff0a6", "M34 60 C 46 18 112 0 156 26 C 196 50 200 116 170 154 C 140 192 76 200 40 170 C 8 142 22 100 34 60Z"),
]
const INK = "#161412"
const DOODLES = [
  svg(`<path d='M20 2 C 22 14 26 18 38 20 C 26 22 22 26 20 38 C 18 26 14 22 2 20 C 14 18 18 14 20 2Z' fill='none' stroke='${INK}' stroke-width='2.4' stroke-linejoin='round'/>`, "0 0 40 40"),
  svg(`<path d='M3 22 C 9 8 15 8 18 20 S 27 32 31 18 S 40 6 45 16' fill='none' stroke='${INK}' stroke-width='2.6' stroke-linecap='round'/>`, "0 0 48 30"),
  svg(`<path d='M20 34 C 6 24 2 16 6 10 C 10 4 18 6 20 12 C 22 6 30 4 34 10 C 38 16 34 24 20 34Z' fill='#ff8fc7' stroke='${INK}' stroke-width='2.4' stroke-linejoin='round'/>`, "0 0 40 40"),
  svg(`<path d='M2 14 L 10 4 L 18 14 L 26 4 L 34 14 L 42 4' fill='none' stroke='${INK}' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/>`, "0 0 44 18"),
  svg(`<circle cx='20' cy='20' r='8' fill='#ffe066' stroke='${INK}' stroke-width='2.4'/><g stroke='${INK}' stroke-width='2.4' stroke-linecap='round'><path d='M20 2v5M20 33v5M2 20h5M33 20h5M7 7l3.5 3.5M29.5 29.5 33 33M7 33l3.5-3.5M29.5 10.5 33 7'/></g>`, "0 0 40 40"),
]
const FILLS = ["#ffe066", "#8ee86b", "#ff9fd0", "#c5a8ff", "#8fd3ff", "#ffb36b"]

banner("PLAYFUL: a sticker sheet, thick outlines, hard shadows, a run of colours")
const P = S("playful")
rule(`[data-skin-scene="playful"] [data-sk="paper"]`, `position: absolute; inset: 0; background: ${NOISE(0.09)} 0 0 / 220px 220px; mix-blend-mode: multiply;`)
rule(`[data-skin-scene="playful"] [data-sk="blob"]`, `position: absolute; width: 340px; aspect-ratio: 1; background: center / contain no-repeat; animation: sk-blob 30s ease-in-out infinite alternate;`)
const blobAt = [["top: -110px; left: -140px", 0], ["top: 30%; right: -170px; width: 380px", -8], ["top: 58%; left: -170px; width: 320px", -16], ["bottom: -120px; right: -100px; width: 360px", -24]]
blobAt.forEach(([where, delay], i) => rule(`[data-skin-scene="playful"] [data-sk="blob"]:nth-child(${2 + i})`, `${where}; background-image: ${BLOBS[i]}; animation-delay: ${delay}s;`))
rule(`[data-skin-scene="playful"] [data-sk="doodle"]`, `position: absolute; width: 34px; height: 34px; background: center / contain no-repeat; animation: sk-wiggle 3.2s ease-in-out infinite alternate; transform-origin: 50% 50%;`)
const doodleAt = [["top: 96px; left: 9%", "rotate: -12deg"], ["top: 120px; right: 8%; width: 46px; height: 30px", ""], ["top: 38%; left: 1%; width: 30px; height: 30px", "rotate: 10deg"], ["top: 66%; right: 2%; width: 40px; height: 18px", ""], ["bottom: 70px; left: 6%; width: 38px; height: 38px", ""]]
doodleAt.forEach(([where, extra], i) => rule(`[data-skin-scene="playful"] [data-sk="doodle"]:nth-child(${6 + i})`, `${where}; background-image: ${DOODLES[i]}; animation-delay: ${-i * 0.7}s;${extra ? ` ${extra};` : ""}`))
comment("Playful: every block a sticker in the next colour of the run; the words stay ink.")
FILLS.forEach((fill, i) => rule(`${P} :is([data-block-layout] > *, [data-tp-masonry] > *):nth-child(${FILLS.length}n+${i + 1})`, `--sk-fill: ${fill};`))
/* A card has no header block before its links, so its run starts one colour on: its first link wears the page's first link's colour. */
FILLS.forEach((fill, i) => rule(`${P} [data-tp-blocks] > :nth-child(${FILLS.length}n+${((i + 5) % FILLS.length) + 1})`, `--sk-fill: ${fill};`))
FILLS.forEach((fill, i) => rule(`${P} :is([data-link-pair], [data-product-pair], [data-tp-pair], [data-tp-masonry]):nth-child(${FILLS.length}n+${i + 1}) > :nth-child(2)`, `--sk-fill: ${FILLS[(i + 2) % FILLS.length]};`))
rule(`${P} :is([data-tp-pair], [data-tp-masonry]) > :nth-child(3)`, `--sk-fill: #8fd3ff;`)
rule(`${P} :is(${LINK}, ${CARD}, ${FAQ}, ${SURF})`, `
  background-color: var(--sk-fill, var(--sk-surface)) !important;
  border-color: ${INK} !important; border-width: 3px !important; border-style: solid !important;
  box-shadow: 4px 4px 0 ${INK} !important;`)
rule(`${P} ${LINK}`, `font-weight: 600; text-transform: uppercase; letter-spacing: .04em;`)
rule(`${P} :is(${CARD})`, `border-radius: 18px !important;`)
rule(`${P} ${CELL}`, `background-color: #fff !important; border: 3px solid ${INK} !important; border-radius: 14px !important; box-shadow: 3px 3px 0 ${INK} !important;`)
rule(`${P} ${STRIP}`, `background-color: transparent !important; border-top: 3px solid ${INK};`)
rule(`${P} ${CTA}`, `
  background-color: ${INK} !important; background-image: none; color: #ffffff !important;
  border: 3px solid ${INK} !important; border-radius: 12px !important; font-weight: 600; text-transform: uppercase; letter-spacing: .05em;
  box-shadow: 3px 3px 0 rgba(22,20,18,.25) !important;`)
rule(`${P} ${BOX}`, `
  background-color: #ffc6e3 !important; border: 3px solid ${INK}; border-radius: 22px !important; box-shadow: 5px 5px 0 ${INK};`)
rule(`${P} [data-onepage-contact]`, `background-color: #c8f1d8 !important;`)
rule(`${P} ${INPUT}`, `background: #fff !important; border: 3px solid ${INK} !important; border-radius: 12px !important; color: ${INK} !important; font-weight: 500;`)
rule(`${P} ${INPUT}:focus`, `box-shadow: 3px 3px 0 ${INK} !important;`)
rule(`${P} ${TITLE}`, `
  background: linear-gradient(transparent 56%, #ffe066 56%, #ffe066 90%, transparent 90%) center / 100% 100% no-repeat;
  padding-inline: .18em; letter-spacing: .02em; transform: rotate(-1.5deg);`)
rule(`${P} :is(${HEADING}, ${BLOCK_TITLE})`, `
  font-family: 'Permanent Marker', cursive !important; text-transform: uppercase; letter-spacing: .03em;
  background: ${svg(`<path d='M2 6 C 12 1 22 11 32 6 S 52 1 62 6 S 82 11 92 6 S 112 1 118 6' fill='none' stroke='${INK}' stroke-width='2.4' stroke-linecap='round'/>`, "0 0 120 12")} center bottom / 96px 9px no-repeat; padding-bottom: 12px;`)
rule(`${P} ${AVATAR}`, `box-shadow: 5px 5px 0 ${INK} !important; border-radius: 24px !important;`)
rule(`${P} ${AVATAR_BOX}`, `transform: rotate(-3deg);`)
rule(`${P} ${SOCIAL}`, `
  width: 44px; height: 44px; padding: 0; border-radius: 12px !important;
  background-color: var(--sk-fill, #ffe066) !important; border: 3px solid ${INK} !important; box-shadow: 3px 3px 0 ${INK};`)
FILLS.slice(0, 5).forEach((fill, i) => rule(`${P} ${SOCIAL}:nth-child(5n+${i + 1})`, `--sk-fill: ${[FILLS[3], FILLS[4], FILLS[1], FILLS[5], FILLS[2]][i]};`))
rule(`${P} ${DIVIDER}`, `height: 12px; background: ${svg(`<path d='M0 9 L 6 3 L 12 9 L 18 3 L 24 9' fill='none' stroke='${INK}' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/>`, "0 0 24 12")} 0 0 / 24px 12px repeat-x !important;`)
rule(`${P} ${PICTURE}`, `border-radius: 18px !important; border: 3px solid ${INK}; box-shadow: 4px 4px 0 ${INK};`)
rule(`${P} [data-framed-picture]`, `border: 2.5px solid ${INK}; border-radius: 12px;`)
rule(`${P} [data-code-copy]`, `border: 2.5px dashed ${INK} !important; background: rgba(255,255,255,.6);`)

/* ── GRUNGE ─────────────────────────────────────────────────────────── */

const TONER = svg(`<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' seed='7' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 16 -9.6'/></filter><rect width='100%' height='100%' filter='url(#n)'/>`, "0 0 240 240")
const SPECKS = svg(`<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='2' seed='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 18 -12.6'/></filter><rect width='100%' height='100%' filter='url(#n)'/>`, "0 0 200 200")
const HOLES = svg(`<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.62' numOctaves='3' seed='11' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -11 7.4'/></filter><rect width='100%' height='100%' filter='url(#n)'/>`, "0 0 160 160")
const BARBED = svg(
  `<g fill='#0d0d0d'>` +
    `<path d='M100 0 L 103.5 200 L 100 400 L 96.5 200Z'/>` +
    `<path d='M100 58 Q 58 66 14 22 Q 62 86 100 78Z'/><path d='M100 58 Q 142 66 186 22 Q 138 86 100 78Z'/>` +
    `<path d='M100 132 Q 52 140 34 232 Q 64 158 100 150Z'/><path d='M100 132 Q 148 140 166 232 Q 136 158 100 150Z'/>` +
    `<path d='M100 292 Q 62 290 30 236 Q 66 314 100 312Z'/><path d='M100 292 Q 138 290 170 236 Q 134 314 100 312Z'/>` +
    `<path d='M100 360 Q 84 356 70 330 Q 84 372 100 376Z'/><path d='M100 360 Q 116 356 130 330 Q 116 372 100 376Z'/>` +
    `<path d='M101 22 l 14 -4 -12 8Z'/><path d='M99 22 l -14 -4 12 8Z'/><path d='M102 108 l 12 -2 -10 7Z'/><path d='M98 108 l -12 -2 10 7Z'/><path d='M102 262 l 12 3 -10 4Z'/><path d='M98 262 l -12 3 10 4Z'/>` +
    `</g><g fill='none' stroke='#0d0d0d' stroke-linecap='round'>` +
    `<ellipse cx='100' cy='200' rx='26' ry='40' stroke-width='2.4'/><ellipse cx='100' cy='200' rx='12' ry='22' stroke-width='1.4'/>` +
    `<path d='M100 96 C 30 128 24 268 100 300' stroke-width='1.5'/><path d='M100 96 C 170 128 176 268 100 300' stroke-width='1.5'/>` +
    `<path d='M48 150 l -10 -6 M44 190 l -12 0 M48 236 l -10 6 M152 150 l 10 -6 M156 190 l 12 0 M152 236 l 10 6' stroke-width='1.6'/>` +
    `</g>`,
  "0 0 200 400",
)
const BARCODE = "linear-gradient(90deg, #0d0d0d 0 2px, transparent 2px 4px, #0d0d0d 4px 5px, transparent 5px 8px, #0d0d0d 8px 11px, transparent 11px 12px, #0d0d0d 12px 13px, transparent 13px 16px, #0d0d0d 16px 18px, transparent 18px 19px, #0d0d0d 19px 20px, transparent 20px 23px, #0d0d0d 23px 26px, transparent 26px 27px, #0d0d0d 27px 28px, transparent 28px 31px, #0d0d0d 31px 32px, transparent 32px 34px, #0d0d0d 34px 37px, transparent 37px 38px, #0d0d0d 38px 39px, transparent 39px 42px, #0d0d0d 42px 44px, transparent 44px 45px, #0d0d0d 45px 46px, transparent 46px 48px, #0d0d0d 48px 51px, transparent 51px 52px, #0d0d0d 52px 53px, transparent 53px 56px, #0d0d0d 56px 58px)"
const TORN = "polygon(0 3px, 5% 0, 11% 2px, 19% 0, 28% 3px, 37% 1px, 46% 3px, 55% 0, 63% 2px, 72% 0, 81% 3px, 90% 1px, 96% 3px, 100% 0, 100% calc(100% - 2px), 94% 100%, 86% calc(100% - 3px), 77% 100%, 68% calc(100% - 2px), 59% 100%, 50% calc(100% - 3px), 41% 100%, 32% calc(100% - 2px), 23% 100%, 14% calc(100% - 3px), 6% 100%, 0 calc(100% - 2px))"
const TAPE = "linear-gradient(rgba(186,184,172,.72), rgba(186,184,172,.72))"
const PAPER = "#f4f3ee"

banner("GRUNGE: a photocopied zine, black and white, cut, taped and distressed")
const G = S("grunge")
rule(`[data-skin-scene="grunge"] [data-sk="copy"]`, `position: absolute; inset: -40px; background: ${TONER} 0 0 / 240px 240px; opacity: .5; animation: sk-jitter .9s steps(3) infinite;`)
rule(`[data-skin-scene="grunge"] [data-sk="streaks"]`, `
  position: absolute; inset: 0;
  background: repeating-linear-gradient(90deg, rgba(0,0,0,.05) 0 1px, transparent 1px 37px), repeating-linear-gradient(90deg, rgba(0,0,0,.04) 0 3px, transparent 3px 113px), repeating-linear-gradient(90deg, rgba(255,255,255,.4) 0 2px, transparent 2px 71px), linear-gradient(180deg, transparent 0 34%, rgba(0,0,0,.06) 34% 35.5%, transparent 35.5% 71%, rgba(0,0,0,.05) 71% 71.8%, transparent 71.8%);`)
rule(`[data-skin-scene="grunge"] [data-sk="halftone"]`, `
  position: absolute; left: -20px; bottom: 0; width: 70%; height: 420px;
  background: radial-gradient(circle, #0d0d0d 1.3px, transparent 1.8px) 0 0 / 7px 7px;
  -webkit-mask-image: radial-gradient(farthest-side at 0% 100%, #000 0%, transparent 100%); mask-image: radial-gradient(farthest-side at 0% 100%, #000 0%, transparent 100%); opacity: .5;`)
rule(`[data-skin-scene="grunge"] [data-sk="barbed"]`, `position: absolute; width: 210px; height: 420px; background: ${BARBED} center / contain no-repeat; opacity: .32;`)
rule(`[data-skin-scene="grunge"] [data-sk="barbed"]:nth-child(4)`, `top: 14px; right: -92px; rotate: 14deg; opacity: .24;`)
rule(`[data-skin-scene="grunge"] [data-sk="barbed"]:nth-child(5)`, `top: 52%; left: -96px; rotate: -166deg; opacity: .2;`)
rule(`[data-skin-scene="grunge"] [data-sk="code"]`, `position: absolute; right: 28px; top: 84px; width: 58px; height: 26px; background: ${BARCODE}; opacity: .75;`)
rule(`[data-skin-scene="grunge"] [data-sk="code"]::after`, `content: "NO. 0091 / COPY"; position: absolute; right: 0; top: 30px; white-space: nowrap; font: 700 8px/1 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .12em; color: #0d0d0d;`)
rule(`[data-skin-scene="grunge"] [data-sk="edge"]`, `position: absolute; inset: 0; box-shadow: inset 0 0 90px rgba(0,0,0,.32), inset 0 0 18px rgba(0,0,0,.35);`)
rule(`[data-skin-scene="grunge"] [data-sk="edge-words"]`, `
  position: absolute; top: 72px; right: 1px; writing-mode: vertical-rl; white-space: nowrap;
  font: 400 15px/1 'Archivo Black', Impact, sans-serif; letter-spacing: .14em; color: #0d0d0d; opacity: .9;`)
comment("Grunge: black bars cut from paper, taped paper cards, xeroxed pictures, a distressed name.")
rule(`${G} ${LINK}`, `
  background-color: #0d0d0d !important; color: #f1efe8 !important; --op-fill: ${PAPER} !important; --op-fill-text: #0d0d0d !important;
  background-image: ${SPECKS}; background-size: 200px 200px;
  clip-path: ${TORN};
  text-transform: uppercase; letter-spacing: .1em; font-weight: 700;`)
rule(`${G} [data-block-layout] > :nth-child(3n+2) ${LINK}, ${G} [data-link-pair] > :nth-child(2) ${LINK}, ${G} [data-tp-blocks] > [data-tp-link]:nth-child(3n+1), ${G} [data-tp-pair] > :nth-child(2)`, `background-color: ${PAPER} !important; color: #0d0d0d !important; background-image: none; --op-fill: #0d0d0d !important; --op-fill-text: #f1efe8 !important;`)
rule(`${G} ${CTA}`, `
  background-color: #0d0d0d !important; color: #f1efe8 !important; --op-fill: ${PAPER} !important; --op-fill-text: #0d0d0d !important;
  background-image: ${SPECKS}; background-size: 200px 200px; border: 2px solid #0d0d0d !important;
  text-transform: uppercase; letter-spacing: .1em; font-weight: 700; clip-path: ${TORN};`)
rule(`${G} :is(${CARD}, ${FAQ}, ${SURF})`, `
  background-color: ${PAPER} !important; background-image: ${TAPE}; background-size: 74px 16px; background-position: 50% 0; background-repeat: no-repeat;
  border: 2px solid #0d0d0d !important; border-radius: 0 !important; color: #0d0d0d;
  box-shadow: 5px 5px 0 rgba(13,13,13,.18) !important;`)
rule(`${G} ${FAQ}`, `background-image: none;`)
rule(`${G} :is([data-op-block], [data-product-pair] > *):nth-child(odd) :is([data-product-block], a.op-card, [data-onepage-testimonials] figure)`, `rotate: -.6deg;`)
rule(`${G} :is([data-op-block], [data-product-pair] > *):nth-child(even) :is([data-product-block], a.op-card, [data-onepage-testimonials] figure)`, `rotate: .5deg;`)
rule(`${G} ${CELL}`, `background-color: #0d0d0d !important; color: #f1efe8 !important; background-image: ${SPECKS}; background-size: 200px 200px; border-color: #0d0d0d !important; border-radius: 0 !important;`)
rule(`${G} ${STRIP}`, `background-color: ${PAPER} !important; border-top: 2px solid #0d0d0d;`)
rule(`${G} ${STRIP} [data-block-title]`, `color: #0d0d0d !important; text-transform: uppercase; letter-spacing: .08em; font-weight: 700;`)
rule(`${G} ${BOX}`, `
  background-color: ${PAPER} !important; background-image: ${TAPE}, ${BARCODE}; background-size: 74px 16px, 58px 18px; background-position: 50% 0, calc(100% - 12px) 12px; background-repeat: no-repeat;
  border: 2px solid #0d0d0d; border-radius: 0 !important; box-shadow: 6px 6px 0 #0d0d0d; rotate: -.4deg;`)
rule(`${G} ${INPUT}`, `background: #fff !important; border: 2px solid #0d0d0d !important; border-radius: 0 !important; color: #0d0d0d !important; font-family: 'JetBrains Mono', ui-monospace, monospace;`)
rule(`${G} ${INPUT}:focus`, `box-shadow: 4px 4px 0 #0d0d0d !important;`)
rule(`${G} ${TITLE}`, `
  -webkit-mask-image: ${HOLES}; mask-image: ${HOLES}; -webkit-mask-size: 160px 160px; mask-size: 160px 160px;
  letter-spacing: .01em; text-shadow: 2px 1px 0 rgba(13,13,13,.28);`)
rule(`${G} :is(${HEADING}, ${BLOCK_TITLE})`, `
  display: block; background: #0d0d0d; color: #f1efe8 !important; padding: 6px 10px 5px !important; text-transform: uppercase;
  letter-spacing: .14em; font-family: 'Archivo Black', Impact, sans-serif !important; font-size: 15px !important; clip-path: ${TORN};`)
rule(`${G} :is(${AVATAR}, ${PICTURE}) img, ${G} [data-tp-avatar]`, `filter: grayscale(1) contrast(1.35) brightness(.98);`)
rule(`${G} ${AVATAR}`, `box-shadow: 7px 7px 0 #0d0d0d !important;`)
rule(`${G} ${AVATAR_BOX}`, `rotate: -2deg;`)
rule(`${G} ${SOCIAL}`, `width: 42px; height: 42px; padding: 0; border-radius: 0 !important; background-color: ${PAPER} !important; border: 2px solid #0d0d0d !important;`)
rule(`${G} ${SOCIAL}:nth-child(even)`, `background-color: #0d0d0d !important;`)
rule(`${G} ${SOCIAL}:nth-child(even) svg`, `filter: invert(1);`)
rule(`${G} ${DIVIDER}`, `height: 18px; background: ${svg(`<g fill='none' stroke='#0d0d0d' stroke-width='1.8' stroke-linecap='round'><path d='M0 8 C 10 5 20 11 30 8 S 50 5 60 8'/><path d='M0 10 C 10 13 20 7 30 10 S 50 13 60 10'/><path d='M14 3 l 6 12 M20 3 l -6 12 M44 3 l 6 12 M50 3 l -6 12'/></g>`, "0 0 60 18")} 0 50% / 60px 18px repeat-x !important;`)
rule(`${G} ${PICTURE}`, `border-radius: 0 !important; border: 2px solid #0d0d0d; box-shadow: 5px 5px 0 #0d0d0d;`)
rule(`${G} [data-framed-picture]`, `border: 2px solid #0d0d0d; border-radius: 0;`)
rule(`${G} [data-code-copy]`, `border-radius: 0 !important; border: 2px dashed #0d0d0d !important;`)

/* ── All: hover words, motion, theme cards ──────────────────────────── */

banner("ALL SKINS: a button's words on hover, motion, theme cards")
comment("A button the skin paints keeps the hover's own words when it fills (app/globals.css .op-btn).")
css.push(`${HOVER} {\n  [data-op-skin] ${HOVERED}:is([data-hover="fill"], [data-hover="pop"]) { color: var(--op-fill-text, inherit) !important; text-shadow: none; }\n}`)
css.push(`@keyframes sk-spin { to { rotate: 360deg; } }
@keyframes sk-drift { from { translate: -24px 0; } to { translate: 30px 0; } }
@keyframes sk-bob { from { translate: 0 0; } to { translate: 6px -22px; } }
@keyframes sk-sway { from { translate: -12px 0; } to { translate: 12px 4px; } }
@keyframes sk-aurora { from { translate: 0 0; scale: 1; } to { translate: 40px 30px; scale: 1.12; } }
@keyframes sk-shimmer { from { opacity: .45; } to { opacity: .9; } }
@keyframes sk-twinkle { 0%, 100% { opacity: .25; scale: .45; } 50% { opacity: 1; scale: 1; } }
@keyframes sk-blob { from { translate: 0 0; rotate: 0deg; } to { translate: 18px -14px; rotate: 14deg; } }
@keyframes sk-wiggle { from { rotate: -9deg; } to { rotate: 9deg; } }
@keyframes sk-jitter { 0% { translate: 0 0; } 33% { translate: -13px 7px; } 66% { translate: 9px -11px; } 100% { translate: 0 0; } }
@keyframes sk-throb { from { filter: brightness(1) saturate(1); } to { filter: brightness(1.1) saturate(1.15); } }
@keyframes sk-online { 0%, 100% { scale: 1; } 50% { scale: 1.12; } }`)
comment("Still for anyone who asked for less motion, and in a theme card (components/onepage/themes/theme-preview), which is a picture.")
css.push(`@media (prefers-reduced-motion: reduce) {\n  [data-skin-scene] *, [data-skin-scene] *::after, [data-op-skin] *, [data-op-skin] *::before, [data-op-skin] *::after { animation: none !important; }\n}`)
rule(`[data-tp-page] [data-skin-scene] *, [data-tp-page][data-op-skin] *, [data-tp-page][data-op-skin] *::before, [data-tp-page][data-op-skin] *::after`, `animation: none !important;`)
rule(`[data-tp-page] :is([data-op-skin] [data-tp-link], [data-op-skin] [data-tp-card])`, `-webkit-backdrop-filter: none; backdrop-filter: none;`)

const header = `/*
 * GENERATED by scripts/build-onepage-skins.mjs from its source: edit that, then run it.
 * The six OnePage skins (round W9, lib/onepage/theme-skin): the material of every block
 * on a page whose theme names one ([data-op-skin]) and the scene behind it ([data-skin-scene],
 * components/onepage/themes/theme-skin-scene). Outside every @layer, as the OnePage rules in
 * app/globals.css are, so a skin wins over the Tailwind utilities it adjusts. Imported by
 * components/onepage/themes/theme-skin-scene.tsx, so only a OnePage loads it.
 */
`
const out = header + css.join("\n") + "\n"
if (process.argv.includes("--check")) {
  const now = readFileSync(OUT, "utf8")
  if (now !== out) { console.error("components/onepage/themes/theme-skins.css is not what scripts/build-onepage-skins.mjs writes: run it."); process.exit(1) }
  console.log("components/onepage/themes/theme-skins.css is current")
} else {
  writeFileSync(OUT, out)
  console.log(`wrote ${OUT} (${(out.length / 1024).toFixed(1)} KB)`)
}
