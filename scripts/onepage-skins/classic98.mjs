/**
 * CLASSIC 98 (round W10): the desktop of the late nineties. A teal desktop
 * with a taskbar and a clock, grey raised buttons with a bevel that presses
 * in, windows with a navy to blue title bar and its three little buttons,
 * white sunken fields, headings as title bars, a pixel face. No maker's
 * logo, flag or name: the look of the era, drawn here.
 */
import { svg, S, SCENE, LINK, CTA, CARD, FAQ, CELL, BOX, SURF, INPUT, TITLE, BIO, TEXT, AVATAR, SOCIAL, HEADING, BLOCK_TITLE, DIVIDER, PICTURE, STRIP, FILL_LAYER, HOVER, HOVERED, css, rule, comment, banner, onSurface, promise, legal } from "./shared.mjs"

const GREY = "#c0c0c0"
const INK = "#000000"
const NAVY = "#000080"
const TITLE_BAR = "linear-gradient(90deg, #000080, #0f6fb5)"
/* Raised and pressed, as the era drew them: white and light grey on the top left, black and dark grey on the bottom right. */
const RAISED = "inset -1px -1px 0 #0a0a0a, inset 1px 1px 0 #ffffff, inset -2px -2px 0 #808080, inset 2px 2px 0 #dfdfdf"
const PRESSED = "inset 1px 1px 0 #0a0a0a, inset -1px -1px 0 #ffffff, inset 2px 2px 0 #808080, inset -2px -2px 0 #dfdfdf"
const SUNKEN = "inset 1px 1px 0 #808080, inset -1px -1px 0 #ffffff, inset 2px 2px 0 #0a0a0a, inset -2px -2px 0 #dfdfdf"
/* A title bar's three buttons, minimise, maximise and close, drawn small. */
const CAPTION = svg(
  `<g>` +
    [0, 18, 34].map((x) => `<rect x='${x}' y='0' width='16' height='14' fill='#c0c0c0'/><path d='M${x} 14 V0 H${x + 16}' stroke='#fff' fill='none'/><path d='M${x + 16} 0 V14 H${x}' stroke='#0a0a0a' fill='none'/>`).join("") +
    `<rect x='4' y='9' width='6' height='2' fill='#000'/>` +
    `<rect x='21.5' y='3' width='9' height='7' fill='none' stroke='#000'/><rect x='21.5' y='3' width='9' height='1.6' fill='#000'/>` +
    `<path d='M38 3.5 L 46 10.5 M46 3.5 L 38 10.5' stroke='#000' stroke-width='1.6'/>` +
    `</g>`,
  "0 0 50 14",
)
const DITHER = svg(`<rect width='2' height='2' fill='#007878'/><rect x='2' y='2' width='2' height='2' fill='#007878'/>`, "0 0 4 4")
/* A folder and a page, the desktop's icons, for a wide screen only. */
const FOLDER = svg(`<path d='M2 8 H14 L17 11 H34 V30 H2Z' fill='#f6d75b' stroke='#000'/><path d='M2 13 H34' stroke='#c9a520'/>`, "0 0 36 32")
const PAGE = svg(`<path d='M6 2 H24 L30 8 V34 H6Z' fill='#fff' stroke='#000'/><path d='M24 2 V8 H30' fill='#c0c0c0' stroke='#000'/><path d='M10 14 H26 M10 18 H26 M10 22 H22 M10 26 H24' stroke='#000080'/>`, "0 0 36 36")

export function classic98() {
  banner("CLASSIC 98: a teal desktop, grey bevels, navy title bars")
  const sc = SCENE("classic98")
  rule(`${sc}`, `container-type: inline-size;`)
  rule(`${sc} [data-sk="dither"]`, `position: absolute; inset: 0; background: ${DITHER} 0 0 / 4px 4px; opacity: .35; image-rendering: pixelated;`)
  rule(`${sc} [data-sk="taskbar"]`, `
    position: absolute; left: 0; right: 0; bottom: 0; height: 30px; background: ${GREY};
    box-shadow: inset 0 1px 0 #dfdfdf, inset 0 2px 0 #ffffff;`)
  rule(`${sc} [data-sk="taskbar"]::before`, `
    content: "Start"; position: absolute; left: 3px; top: 4px; height: 22px; padding: 0 8px 0 26px; display: flex; align-items: center;
    font: 700 13px/1 'Pixelify Sans', Tahoma, sans-serif; color: #000; background: ${GREY} ${svg(`<rect x='1' y='1' width='6' height='6' fill='#000080'/><rect x='9' y='1' width='6' height='6' fill='#008080'/><rect x='1' y='9' width='6' height='6' fill='#808080'/><rect x='9' y='9' width='6' height='6' fill='#000'/>`, "0 0 16 16")} 7px 50% / 14px 14px no-repeat;
    box-shadow: ${RAISED};`)
  rule(`${sc} [data-sk="taskbar"]::after`, `
    content: "12:00 PM"; position: absolute; right: 3px; top: 4px; height: 22px; padding: 0 10px; display: flex; align-items: center;
    font: 400 12px/1 'Pixelify Sans', Tahoma, sans-serif; color: #000; box-shadow: ${SUNKEN};`)
  rule(`${sc} [data-sk="icon"]`, `display: none; position: absolute; left: 22px; width: 72px; height: 64px; background: center 0 / 34px 32px no-repeat;`)
  rule(`${sc} [data-sk="icon"]::after`, `content: attr(data-label); position: absolute; left: 0; right: 0; bottom: 0; text-align: center; font: 400 12px/1.2 'Pixelify Sans', Tahoma, sans-serif; color: #fff;`)
  rule(`${sc} [data-sk="icon"]:nth-child(3)`, `top: 96px; background-image: ${FOLDER};`)
  rule(`${sc} [data-sk="icon"]:nth-child(3)::after`, `content: "Projects";`)
  rule(`${sc} [data-sk="icon"]:nth-child(4)`, `top: 180px; background-image: ${PAGE};`)
  rule(`${sc} [data-sk="icon"]:nth-child(4)::after`, `content: "Readme.txt";`)
  css_container()

  const W = S("classic98")
  comment("Classic 98: raised grey buttons that press in, windows with a title bar, sunken white fields.")
  rule(`${W} :is(${LINK}, ${CTA}, ${FAQ}, ${CELL}, ${SURF}, ${CARD}, ${BOX}, ${SOCIAL}, ${INPUT}, ${PICTURE})`, `border-radius: 0 !important;`)
  rule(`${W} ${LINK}`, `
    background-color: ${GREY} !important; background-image: none; color: ${INK} !important;
    border: 1px solid ${GREY} !important; box-shadow: ${RAISED} !important;
    font-weight: 600; letter-spacing: .01em;`)
  promise("classic98", "a grey button", INK, [GREY])
  rule(`${W} ${LINK}:active`, `box-shadow: ${PRESSED} !important;`)
  rule(`${W} ${LINK}:focus-visible`, `outline: 1px dotted #000; outline-offset: -5px;`)
  rule(`${W} ${FILL_LAYER}`, `background-image: none;`)
  rule(`${W} ${CTA}`, `
    background-color: ${GREY} !important; background-image: none; color: ${INK} !important;
    border: 1px solid #000 !important; box-shadow: ${RAISED} !important; font-weight: 700;`)
  rule(`${W} ${CTA}:active`, `box-shadow: ${PRESSED} !important;`)
  promise("classic98", "the default button", INK, [GREY])
  rule(`${W} :is(${CARD}, ${BOX})`, `
    background-color: ${GREY} !important; background-image: ${CAPTION}, ${TITLE_BAR};
    background-size: 50px 14px, 100% 22px; background-position: calc(100% - 7px) 7px, 0 0; background-repeat: no-repeat;
    background-origin: border-box, padding-box; background-clip: padding-box;
    border: 3px solid ${GREY} !important; box-shadow: ${RAISED}, 0 0 0 1px #0a0a0a00 !important; padding-top: 25px !important;`)
  rule(`${W} :is([data-product-block="row"], [data-tp-product="row"], a.op-card, [data-tp-card])`, `background-image: none; padding-top: 0 !important;`)
  rule(`${W} :is([data-onepage-code], [data-onepage-testimonials] figure)`, `padding-top: 34px !important;`)
  rule(`${W} ${BOX}`, `padding: 36px 18px 18px !important;`)
  rule(`${W} :is(${FAQ}, ${SURF})`, `background-color: ${GREY} !important; background-image: none; border: 1px solid ${GREY} !important; box-shadow: ${RAISED} !important;`)
  rule(`${W} ${CELL}`, `background-color: #ffffff !important; background-image: none; border: 1px solid #fff !important; box-shadow: ${SUNKEN} !important;`)
  onSurface("classic98", "a grey window and a panel", `:is(${CARD}, ${BOX}, ${FAQ})`, INK, [GREY])
  onSurface("classic98", "a sunken counter", CELL, INK, ["#ffffff"])
  rule(`${W} ${STRIP}`, `background-color: ${GREY} !important; border-top: 1px solid #808080; box-shadow: inset 0 1px 0 #fff;`)
  rule(`${W} ${INPUT}`, `background: #fff !important; border: 1px solid #fff !important; box-shadow: ${SUNKEN} !important; color: ${INK} !important; padding-left: 10px;`)
  rule(`${W} ${INPUT}:focus`, `outline: 1px dotted #000 !important; outline-offset: -5px;`)
  promise("classic98", "a field", INK, ["#ffffff"])
  rule(`${W} ${TITLE}`, `text-shadow: 2px 2px 0 #000; letter-spacing: .01em;`)
  rule(`${W} :is(${BIO}, ${TEXT})`, `text-shadow: 1px 1px 0 #003c3c;`)
  /* A heading is a title bar, as a window's caption is. */
  rule(`${W} :is(${HEADING}, ${BLOCK_TITLE})`, `
    display: block; text-align: left !important; background: ${CAPTION} calc(100% - 4px) 50% / 50px 14px no-repeat, ${TITLE_BAR};
    padding: 3px 62px 3px 8px !important; font-weight: 700; font-size: 14px !important; letter-spacing: .02em;
    box-shadow: 0 0 0 2px ${GREY};`)
  onSurface("classic98", "a title bar", `:is(${HEADING}, ${BLOCK_TITLE})`, "#ffffff", [NAVY, "#0f6fb5"], { whole: true })
  rule(`${W} ${AVATAR}`, `border-radius: 0 !important; box-shadow: 0 0 0 3px ${GREY}, 0 0 0 4px #0a0a0a, -1px -1px 0 4px #fff !important;`)
  rule(`${W} ${SOCIAL}`, `
    width: 40px; height: 40px; padding: 0; background-color: ${GREY} !important; border: 1px solid ${GREY} !important; box-shadow: ${RAISED}; color: #000;`)
  rule(`${W} ${SOCIAL} svg`, `filter: grayscale(1) brightness(0);`)
  rule(`${W} ${DIVIDER}`, `height: 2px; background: linear-gradient(180deg, #004c4c 0 1px, #40a0a0 1px 2px) !important;`)
  rule(`${W} ${PICTURE}`, `border: 2px solid #fff; box-shadow: ${SUNKEN}, 0 0 0 2px ${GREY};`)
  rule(`${W} [data-framed-picture]`, `border-radius: 0; box-shadow: ${SUNKEN};`)
  rule(`${W} [data-code-copy]`, `border: 1px dotted #000 !important; border-radius: 0 !important; background: #fff;`)
  css_hover(W)
  legal("classic98", GREY, INK, [GREY], `border-radius: 0; box-shadow: ${RAISED};`)
}

/* The icons are for a wide desktop, never over a phone's blocks. */
function css_container() {
  css.push(`@container (min-width: 1000px) {\n  ${SCENE("classic98")} [data-sk="icon"] { display: block; }\n}`)
}

/* Hover: the selection navy with white words, as the era highlighted an item. */
function css_hover(W) {
  css.push(`${HOVER} {\n  ${W} ${HOVERED}:is([data-hover="fill"], [data-hover="pop"]) { color: #ffffff !important; }\n}`)
  promise("classic98", "a highlighted button", "#ffffff", [NAVY])
}
