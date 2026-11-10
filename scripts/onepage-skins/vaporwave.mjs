/**
 * VAPORWAVE (round W10): a synthwave sunset. A striped sun sinking behind
 * the picture into a neon grid floor, wireframe mountains, palm silhouettes,
 * stars and a faint VHS scanline; the blocks are hard-edged night panels
 * with a neon edge and a hard magenta or cyan shadow, the products' buttons
 * a sunset gradient, the name in sunset chrome.
 */
import { svg, S, SCENE, LINK, CTA, CARD, FAQ, CELL, BOX, SURF, INPUT, TITLE, BIO, TEXT, AVATAR, SOCIAL, HEADING, BLOCK_TITLE, DIVIDER, PICTURE, STRIP, FILL_LAYER, TILE, rule, comment, banner, onSurface, promise, legal } from "./shared.mjs"

const PANEL = "#1d0d3a"
const PANEL_2 = "#26104a"
const PINK = "#ff3ea5"
const CYAN = "#3ff3ff"
const WORDS = "#fff3fb"
const SUNSET = "linear-gradient(180deg, #ffe66d 0%, #ffb14e 35%, #ff7a5c 62%, #ff3ea5 100%)"
const SUNSET_STOPS = ["#ffe66d", "#ffb14e", "#ff7a5c", "#ff3ea5"]
const SUN = svg(
  `<defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#ffe66d'/><stop offset='.5' stop-color='#ff9a4e'/><stop offset='1' stop-color='#ff2f9a'/></linearGradient><mask id='m'><rect width='200' height='200' fill='#fff'/>` +
    [[66, 3], [80, 5], [93, 7], [105, 9], [116, 11]].map(([y, h]) => `<rect x='0' y='${y}' width='200' height='${h}' fill='#000'/>`).join("") +
    `</mask></defs><circle cx='100' cy='100' r='100' fill='url(#s)' mask='url(#m)'/>`,
  "0 0 200 200",
)
const MOUNTAINS = svg(
  `<g fill='#1a0833' stroke='#ff4fb0' stroke-width='1.4' stroke-linejoin='round'><path d='M0 120 L 40 70 L 70 92 L 110 40 L 150 88 L 182 64 L 230 120Z'/><path d='M170 120 L 230 58 L 262 84 L 300 46 L 344 96 L 372 76 L 400 120Z'/></g>` +
    `<g fill='none' stroke='#ff4fb0' stroke-width='.8' stroke-opacity='.7'><path d='M40 70 L 52 120 M110 40 L 98 120 M110 40 L 128 120 M182 64 L 176 120 M230 58 L 224 120 M300 46 L 290 120 M300 46 L 318 120'/></g>`,
  "0 0 400 120",
  " preserveAspectRatio='none'",
)
const PALM = svg(
  `<g fill='#12052a'><path d='M58 200 C 60 150 62 110 70 70 L 76 71 C 70 110 68 150 68 200Z'/>` +
    `<path d='M72 70 C 50 50 22 52 4 66 C 26 58 48 62 70 74Z'/><path d='M72 70 C 58 40 34 28 12 30 C 34 38 54 50 70 74Z'/>` +
    `<path d='M74 70 C 82 40 104 26 128 26 C 108 36 90 50 76 74Z'/><path d='M74 70 C 98 54 124 56 140 72 C 118 64 96 66 76 76Z'/>` +
    `<path d='M73 70 C 72 46 78 26 92 12 C 84 32 80 52 76 74Z'/></g>`,
  "0 0 144 200",
)

export function vaporwave() {
  banner("VAPORWAVE: a striped sun, a neon grid, night panels with a hard neon shadow")
  const sc = SCENE("vaporwave")
  rule(`${sc} [data-sk="stars"]`, `
    position: absolute; inset: 0 0 50% 0; opacity: .9; animation: sk-shimmer 4s ease-in-out infinite alternate;
    background-image: radial-gradient(circle, #fff 0 1px, transparent 1.5px), radial-gradient(circle, #ffd1f0 0 1px, transparent 1.5px), radial-gradient(circle, #b9fbff 0 1.2px, transparent 1.8px);
    background-size: 131px 97px, 89px 151px, 211px 173px; background-position: 9px 13px, 47px 61px, 100px 30px;`)
  rule(`${sc} [data-sk="sun"]`, `position: absolute; left: 50%; top: -6px; width: 300px; height: 300px; margin-left: -150px; background: ${SUN} center / contain no-repeat; filter: drop-shadow(0 0 40px rgba(255,80,170,.55)); -webkit-mask-image: linear-gradient(180deg, #000 0 58%, transparent 58%); mask-image: linear-gradient(180deg, #000 0 58%, transparent 58%);`)
  rule(`${sc} [data-sk="mountains"]`, `position: absolute; left: 0; right: 0; top: 118px; height: 58px; background: ${MOUNTAINS} center bottom / 100% 100% no-repeat; opacity: .9;`)
  rule(`${sc} [data-sk="floor"]`, `
    position: absolute; left: -50%; width: 200%; top: 174px; height: 340px; transform-origin: 50% 0; transform: perspective(220px) rotateX(58deg); overflow: hidden;
    background: linear-gradient(180deg, #2a0a4f, #12052a);
    -webkit-mask-image: linear-gradient(180deg, #000 0%, transparent 85%); mask-image: linear-gradient(180deg, #000 0%, transparent 85%);`)
  /* The grid runs toward the viewer: its layer moves one square and starts again, by transform alone. */
  rule(`${sc} [data-sk="floor"]::before`, `
    content: ""; position: absolute; left: 0; right: 0; top: -48px; bottom: 0;
    background: linear-gradient(rgba(255,62,165,.85) 2px, transparent 2px) 0 0 / 48px 48px, linear-gradient(90deg, rgba(255,62,165,.85) 2px, transparent 2px) 0 0 / 48px 48px;
    animation: sk-grid 2.4s linear infinite;`)
  rule(`${sc} [data-sk="horizon"]`, `position: absolute; left: 0; right: 0; top: 174px; height: 2px; background: ${PINK}; box-shadow: 0 0 14px 2px rgba(255,62,165,.8);`)
  rule(`${sc} [data-sk="palm"]`, `position: absolute; top: 62px; width: 92px; height: 128px; background: ${PALM} center bottom / contain no-repeat;`)
  rule(`${sc} [data-sk="palm"]:nth-child(6)`, `left: -18px;`)
  rule(`${sc} [data-sk="palm"]:nth-child(7)`, `right: -14px; scale: -1 1; height: 110px; top: 80px;`)
  rule(`${sc} [data-sk="vhs"]`, `position: absolute; inset: 0; background: repeating-linear-gradient(180deg, rgba(255,255,255,.035) 0 1px, transparent 1px 3px); pointer-events: none;`)

  const V = S("vaporwave")
  comment("Vaporwave: night panels with a neon edge and a hard shadow, sunset buttons, italic capitals.")
  rule(`${V} :is(${LINK}, ${CARD}, ${FAQ}, ${SURF}, ${BOX}, ${CELL})`, `border-radius: 4px !important;`)
  rule(`${V} ${LINK}`, `
    background-color: ${PANEL} !important; background-image: linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,0) 60%); color: ${WORDS} !important;
    border: 2px solid ${PINK} !important; box-shadow: 5px 5px 0 ${CYAN}, 0 0 18px -4px rgba(255,62,165,.7) !important;
    font-style: italic; font-weight: 700; text-transform: uppercase; letter-spacing: .08em;`)
  promise("vaporwave", "a night button", WORDS, [PANEL, "#2e1d48"])
  rule(`${V} [data-block-layout] > :nth-child(even) ${LINK}, ${V} [data-tp-blocks] > :nth-child(odd) ${LINK}, ${V} [data-tp-blocks] > [data-tp-link]:nth-child(odd)`, `border-color: ${CYAN} !important; box-shadow: 5px 5px 0 ${PINK}, 0 0 18px -4px rgba(63,243,255,.6) !important;`)
  rule(`${V} ${TILE} ${LINK}`, `border-radius: 6px !important;`)
  rule(`${V} ${FILL_LAYER}`, `background-image: ${SUNSET};`)
  rule(`${V} ${CTA}`, `
    background-color: #ff8a55 !important; background-image: ${SUNSET}; color: #1a0526 !important;
    border: 2px solid #fff3fb !important; font-style: italic; font-weight: 800; text-transform: uppercase; letter-spacing: .08em;
    box-shadow: 4px 4px 0 ${PANEL}, 0 0 20px -4px rgba(255,120,90,.8) !important;`)
  promise("vaporwave", "the sunset button", "#1a0526", SUNSET_STOPS)
  rule(`${V} :is(${CARD}, ${FAQ}, ${SURF}, ${BOX})`, `
    background-color: ${PANEL} !important; background-image: linear-gradient(180deg, ${PANEL_2}, ${PANEL});
    border: 2px solid ${CYAN} !important; box-shadow: 6px 6px 0 ${PINK} !important;`)
  rule(`${V} ${BOX}`, `border-color: ${PINK} !important; box-shadow: 6px 6px 0 ${CYAN} !important;`)
  rule(`${V} ${CELL}`, `background-color: #0e0420 !important; background-image: none; border: 2px solid ${PINK} !important; box-shadow: 0 0 14px -2px rgba(255,62,165,.7), inset 0 0 12px rgba(255,62,165,.25) !important;`)
  onSurface("vaporwave", "a night panel", `:is(${CARD}, ${FAQ}, ${BOX}, ${CELL})`, WORDS, [PANEL, PANEL_2, "#0e0420"])
  rule(`${V} ${CELL} span:first-child`, `color: #ffe66d !important; text-shadow: 0 0 10px rgba(255,200,90,.8);`)
  promise("vaporwave", "a countdown's number", "#ffe66d", ["#0e0420"])
  rule(`${V} ${STRIP}`, `background-color: transparent !important; border-top: 2px solid ${CYAN};`)
  rule(`${V} ${INPUT}`, `background: #0e0420 !important; border: 2px solid ${CYAN} !important; border-radius: 4px !important; color: ${WORDS} !important; box-shadow: inset 0 0 10px rgba(63,243,255,.2) !important;`)
  rule(`${V} ${INPUT}::placeholder`, `color: #c9b6e6 !important; opacity: 1;`)
  promise("vaporwave", "a field", WORDS, ["#0e0420"])
  promise("vaporwave", "a field's placeholder", "#c9b6e6", ["#0e0420"])
  rule(`${V} ${INPUT}:focus`, `box-shadow: 0 0 0 3px rgba(255,62,165,.55), inset 0 0 10px rgba(63,243,255,.2) !important;`)
  rule(`${V} ${TITLE}`, `
    background: ${SUNSET}; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
    font-style: italic; filter: drop-shadow(0 3px 0 #12052a) drop-shadow(0 0 16px rgba(255,62,165,.6)); padding-inline: .08em;`)
  rule(`${V} :is(${BIO}, ${TEXT})`, `text-shadow: 0 1px 10px #12052a, 0 0 2px #12052a;`)
  rule(`${V} :is(${HEADING}, ${BLOCK_TITLE})`, `font-style: italic; text-transform: uppercase; letter-spacing: .14em; text-shadow: 2px 2px 0 ${PINK}, 0 0 12px rgba(63,243,255,.6);`)
  rule(`${V} ${AVATAR}`, `box-shadow: 0 0 0 3px ${PINK}, 0 0 0 6px #12052a, 0 0 30px rgba(255,62,165,.7) !important;`)
  rule(`${V} ${SOCIAL}`, `width: 44px; height: 44px; padding: 0; border-radius: 4px !important; background-color: ${PANEL} !important; border: 2px solid ${CYAN} !important; box-shadow: 3px 3px 0 ${PINK}; color: ${WORDS};`)
  rule(`${V} ${DIVIDER}`, `height: 3px; background: linear-gradient(90deg, transparent, ${PINK} 20%, ${CYAN} 80%, transparent) !important; box-shadow: 0 0 10px rgba(255,62,165,.7);`)
  rule(`${V} ${PICTURE}`, `border-radius: 4px !important; border: 2px solid ${CYAN}; box-shadow: 6px 6px 0 ${PINK};`)
  rule(`${V} [data-framed-picture]`, `border-radius: 2px; box-shadow: 0 0 0 2px ${CYAN};`)
  rule(`${V} [data-code-copy]`, `border-color: ${CYAN} !important; border-radius: 4px !important;`)
  legal("vaporwave", "rgba(18,5,42,.85)", WORDS, ["#12052a", "#2a0d40"])
}
