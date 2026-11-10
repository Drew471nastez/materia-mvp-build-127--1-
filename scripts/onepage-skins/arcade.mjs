/**
 * ARCADE (round W10): an 8-bit game. A night of pixel stars over pixel
 * hills, a CRT's scanlines and a score along the top; the links are pixel
 * buttons with stepped corners in a run of coin colours, the cards are a
 * role-playing game's text boxes (navy with a white pixel border), the
 * products' buttons a green START, the countdown a scoreboard, the dividers
 * a row of hearts. Pixel type for the name, the headings and the buttons.
 */
import { svg, S, SCENE, LINK, CTA, CARD, FAQ, CELL, BOX, SURF, INPUT, TITLE, BIO, TEXT, AVATAR, SOCIAL, HEADING, BLOCK_TITLE, DIVIDER, PICTURE, STRIP, FILL_LAYER, RUN_HOST, css, rule, comment, banner, onSurface, promise, legal } from "./shared.mjs"

const INK = "#0b0b1e"
const BOXFILL = "#1a2a8c"
const BOXFILL_2 = "#0f1a66"
const WHITE = "#ffffff"
const COINS = ["#ffd23f", "#3ee0ff", "#ff6fae", "#5ef08a"]
/* Stepped corners, 4px steps: the shape of a pixel button. */
const STEPS = "polygon(0 8px, 4px 8px, 4px 4px, 8px 4px, 8px 0, calc(100% - 8px) 0, calc(100% - 8px) 4px, calc(100% - 4px) 4px, calc(100% - 4px) 8px, 100% 8px, 100% calc(100% - 8px), calc(100% - 4px) calc(100% - 8px), calc(100% - 4px) calc(100% - 4px), calc(100% - 8px) calc(100% - 4px), calc(100% - 8px) 100%, 8px 100%, 8px calc(100% - 4px), 4px calc(100% - 4px), 4px calc(100% - 8px), 0 calc(100% - 8px))"
const PIXEL_FONT = "'Press Start 2P', 'Pixelify Sans', monospace"
const pix = (rows, colours, size = 1) => svg(
  rows.flatMap((row, y) => [...row].map((c, x) => (c === "." ? "" : `<rect x='${x * size}' y='${y * size}' width='${size}' height='${size}' fill='${colours[c]}'/>`))).join(""),
  `0 0 ${rows[0].length * size} ${rows.length * size}`,
  " shape-rendering='crispEdges'",
)
const HEART = pix([".rr.rr.", "rwrrrrr", "rrrrrrr", "rrrrrrr", ".rrrrr.", "..rrr..", "...r..."], { r: "#ff3b5c", w: "#ffffff" })
const COIN = pix(["..yyyy..", ".yYYYYy.", "yYyyyyYy", "yYyYYyYy", "yYyYYyYy", "yYyyyyYy", ".yYYYYy.", "..yyyy.."], { y: "#c98a00", Y: "#ffd23f" })
const STAR = pix(["...w...", "...w...", ".wwwww.", "...w...", "...w..."], { w: "#ffffff" })
const HILLS = pix(
  [
    "................................................................",
    "..........gg....................................gggg............",
    "........gggggg.........................gg.....gggggggg..........",
    "......gggggggggg.....................gggggg.gggggggggggg........",
    "....gggggggggggggg................gggggggggggggggggggggggg......",
    "..gggggggggggggggggggg.........gggggggggggggggggggggggggggggg...",
    "GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
    "GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
  ],
  { g: "#163f30", G: "#0f2c22" },
)

export function arcade() {
  banner("ARCADE: pixel stars, pixel buttons, text boxes, a scoreboard")
  const sc = SCENE("arcade")
  rule(`${sc} [data-sk="stars"]`, `
    position: absolute; inset: 0; image-rendering: pixelated;
    background-image: linear-gradient(#fff, #fff), linear-gradient(#9fd8ff, #9fd8ff), linear-gradient(#ffd23f, #ffd23f);
    background-size: 2px 2px, 2px 2px, 2px 2px; background-repeat: no-repeat;
    background-position: 12% 6%, 78% 11%, 33% 19%;`)
  rule(`${sc} [data-sk="stars"]::before`, `content: ""; position: absolute; inset: 0; background: radial-gradient(circle, #fff 0 1px, transparent 1px) 0 0 / 97px 83px, radial-gradient(circle, #9fd8ff 0 1px, transparent 1px) 40px 30px / 151px 127px; opacity: .8;`)
  rule(`${sc} [data-sk="twinkle"]`, `position: absolute; width: 14px; height: 10px; background: ${STAR} center / contain no-repeat; image-rendering: pixelated; animation: sk-blink 1.6s steps(2) infinite;`)
  const twinkles = [["9%", "left: 6%"], ["17%", "right: 7%"], ["34%", "left: 2%"], ["51%", "right: 3%"], ["69%", "left: 4%"]]
  twinkles.forEach(([top, side], i) => rule(`${sc} [data-sk="twinkle"]:nth-child(${2 + i})`, `top: ${top}; ${side}; animation-delay: ${-i * 0.37}s;`))
  rule(`${sc} [data-sk="coin"]`, `position: absolute; width: 20px; height: 20px; background: ${COIN} center / contain no-repeat; image-rendering: pixelated; animation: sk-hop 1.2s steps(2) infinite alternate;`)
  rule(`${sc} [data-sk="coin"]:nth-child(7)`, `top: 26%; right: 2.5%;`)
  rule(`${sc} [data-sk="coin"]:nth-child(8)`, `top: 60%; left: 2%; animation-delay: -.6s;`)
  rule(`${sc} [data-sk="hills"]`, `position: absolute; left: 0; right: 0; bottom: 0; height: 64px; background: ${HILLS} center bottom / 100% 100% no-repeat; image-rendering: pixelated;`)
  /* The score is the phone's and the card's: around a wide page's card it would be a second one. */
  rule(`${sc}`, `container-type: inline-size;`)
  css.push(`@container (min-width: 700px) {\n  ${sc} [data-sk="hud"] { display: none; }\n}`)
  rule(`${sc} [data-sk="hud"]`, `position: absolute; left: 0; right: 0; top: 10px; display: flex; justify-content: center; gap: 28px; font: 400 9px/1 ${PIXEL_FONT}; color: #ffd23f; letter-spacing: .06em; opacity: .9;`)
  rule(`${sc} [data-sk="hud"]::before`, `content: "1UP 004200"; color: #ffffff;`)
  rule(`${sc} [data-sk="hud"]::after`, `content: "HI 099990";`)
  rule(`${sc} [data-sk="crt"]`, `position: absolute; inset: 0; background: repeating-linear-gradient(180deg, rgba(0,0,0,.22) 0 1px, transparent 1px 3px); box-shadow: inset 0 0 120px rgba(0,0,0,.6);`)

  const R = S("arcade")
  comment("Arcade: pixel buttons in coin colours, text boxes, START buttons, a scoreboard.")
  COINS.forEach((c, i) => rule(`${R} ${RUN_HOST}:nth-child(${COINS.length}n+${i + 1})`, `--sk-coin: ${c};`))
  /* A card has one block fewer before its first link than the page, so its run starts one colour on (as Playful's). */
  COINS.forEach((c, i) => rule(`${R} [data-tp-blocks] > :nth-child(${COINS.length}n+${((i + COINS.length - 1) % COINS.length) + 1})`, `--sk-coin: ${c};`))
  COINS.forEach((c, i) => rule(`${R} :is([data-link-pair], [data-tp-pair]):nth-child(${COINS.length}n+${i + 1}) > :nth-child(2)`, `--sk-coin: ${COINS[(i + 1) % COINS.length]};`))
  rule(`${R} :is(${LINK}, ${CTA}, ${SOCIAL})`, `border-radius: 0 !important; clip-path: ${STEPS};`)
  rule(`${R} ${LINK}`, `
    background-color: var(--sk-coin, ${COINS[0]}) !important; background-image: none; color: ${INK} !important;
    border: 0 solid transparent !important; box-shadow: inset -4px -4px 0 rgba(0,0,0,.32), inset 4px 4px 0 rgba(255,255,255,.5) !important;
    font-family: ${PIXEL_FONT} !important; font-size: 11px !important; line-height: 1.7; text-transform: uppercase; letter-spacing: .02em;`)
  promise("arcade", "a pixel button", INK, COINS)
  rule(`${R} ${LINK}:active`, `box-shadow: inset 4px 4px 0 rgba(0,0,0,.32) !important; translate: 0 2px;`)
  rule(`${R} ${FILL_LAYER}`, `background-image: linear-gradient(#ffffff, #ffffff);`)
  rule(`${R} ${CTA}`, `
    background-color: #5ef08a !important; background-image: none; color: ${INK} !important; border: 0 solid transparent !important;
    box-shadow: inset -4px -4px 0 rgba(0,0,0,.3), inset 4px 4px 0 rgba(255,255,255,.5) !important;
    font-family: ${PIXEL_FONT} !important; font-size: 11px !important; text-transform: uppercase; letter-spacing: .04em;`)
  promise("arcade", "the START button", INK, ["#5ef08a"])
  rule(`${R} :is(${CARD}, ${FAQ}, ${SURF}, ${BOX})`, `
    background-color: ${BOXFILL} !important; background-image: linear-gradient(180deg, ${BOXFILL}, ${BOXFILL_2});
    border: 4px solid ${WHITE} !important; border-radius: 6px !important;
    box-shadow: 0 0 0 4px ${INK}, 6px 6px 0 4px rgba(0,0,0,.45) !important;`)
  rule(`${R} ${CELL}`, `background-color: #000 !important; background-image: none; border: 4px solid #3a3a5a !important; border-radius: 0 !important; box-shadow: 0 0 0 2px ${INK} !important;`)
  onSurface("arcade", "a text box", `:is(${CARD}, ${FAQ}, ${BOX})`, WHITE, [BOXFILL, BOXFILL_2])
  onSurface("arcade", "the scoreboard", CELL, WHITE, ["#000000"])
  rule(`${R} ${CELL} span:first-child`, `font-family: ${PIXEL_FONT}; font-size: 16px !important; color: #ffd23f !important; line-height: 1.4;`)
  promise("arcade", "a score", "#ffd23f", ["#000000"])
  rule(`${R} ${STRIP}`, `background-color: transparent !important; border-top: 4px solid ${WHITE};`)
  rule(`${R} :is(${CARD}, ${BOX}) [data-block-title], ${R} ${BOX} h3`, `font-family: ${PIXEL_FONT} !important; font-size: 12px !important; line-height: 1.6; text-transform: uppercase;`)
  rule(`${R} ${INPUT}`, `background: #000 !important; border: 4px solid ${WHITE} !important; border-radius: 0 !important; color: ${WHITE} !important; caret-color: #ffd23f;`)
  rule(`${R} ${INPUT}::placeholder`, `color: #b9c3ff !important; opacity: 1;`)
  promise("arcade", "a field", WHITE, ["#000000"])
  promise("arcade", "a field's placeholder", "#b9c3ff", ["#000000"])
  rule(`${R} ${INPUT}:focus`, `border-color: #ffd23f !important; box-shadow: none !important;`)
  rule(`${R} ${TITLE}`, `font-family: ${PIXEL_FONT} !important; line-height: 1.35; text-shadow: 4px 4px 0 #ff3b5c, 8px 8px 0 rgba(0,0,0,.6);`)
  rule(`${R} :is(${HEADING}, ${BLOCK_TITLE})`, `font-family: ${PIXEL_FONT} !important; font-size: 13px !important; line-height: 1.6; text-transform: uppercase; letter-spacing: .04em; text-shadow: 2px 2px 0 #ff3b5c;`)
  rule(`${R} :is(${HEADING}, ${BLOCK_TITLE})::before`, `content: "▶ "; color: #ffd23f;`)
  rule(`${R} :is(${BIO}, ${TEXT})`, `text-shadow: 2px 2px 0 #000;`)
  rule(`${R} ${AVATAR}`, `border-radius: 0 !important; clip-path: ${STEPS}; box-shadow: inset 0 0 0 4px ${WHITE} !important;`)
  rule(`${R} ${SOCIAL}`, `width: 44px; height: 44px; padding: 0; background-color: var(--sk-coin, #ffd23f) !important; border: 0 solid transparent !important; color: ${INK}; box-shadow: inset -3px -3px 0 rgba(0,0,0,.3), inset 3px 3px 0 rgba(255,255,255,.5);`)
  COINS.forEach((c, i) => rule(`${R} ${SOCIAL}:nth-child(4n+${i + 1})`, `--sk-coin: ${c};`))
  rule(`${R} ${SOCIAL} svg`, `filter: brightness(0) saturate(100%);`)
  rule(`${R} ${DIVIDER}`, `height: 14px; background: ${HEART} 0 50% / 14px 14px space no-repeat !important; image-rendering: pixelated;`)
  rule(`${R} ${PICTURE}`, `border-radius: 0 !important; border: 4px solid ${WHITE}; box-shadow: 0 0 0 4px ${INK}, 6px 6px 0 4px rgba(0,0,0,.45);`)
  rule(`${R} [data-framed-picture]`, `border-radius: 0; box-shadow: 0 0 0 3px ${WHITE};`)
  rule(`${R} [data-code-copy]`, `border-radius: 0 !important; border: 3px dashed ${WHITE} !important; font-family: ${PIXEL_FONT};`)
  legal("arcade", "#000000", WHITE, ["#000000"], `border-radius: 0; box-shadow: 0 0 0 3px ${WHITE};`)
}
