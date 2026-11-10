/**
 * PLAYFUL (round W9) and PLAYFUL NIGHT (round W10): neo-brutalist stickers.
 * The first on cream paper with black outlines and hard black shadows; the
 * second on a dark board, the same thick outlines with hard shadows in
 * cream, the stickers in louder colours, doodles in chalk.
 */
import { svg, S, SCENE, LINK, CTA, CARD, FAQ, CELL, BOX, SURF, INPUT, TITLE, AVATAR, AVATAR_BOX, SOCIAL, HEADING, BLOCK_TITLE, DIVIDER, PICTURE, STRIP, RUN_HOST, NOISE, rule, comment, banner, onSurface, promise, legal } from "./shared.mjs"

const BLOB = (fill, d) => svg(`<path d='${d}' fill='${fill}'/>`, "0 0 200 200")
const SHAPES = [
  "M44 28 C 78 -6 150 6 172 46 C 196 88 186 142 146 170 C 104 198 40 188 18 146 C -4 104 12 60 44 28Z",
  "M60 18 C 104 0 168 20 184 70 C 198 116 168 176 112 186 C 60 196 12 160 10 108 C 8 64 22 34 60 18Z",
  "M40 40 C 70 6 140 -2 170 34 C 200 70 192 126 160 160 C 128 192 64 198 32 166 C 2 134 10 74 40 40Z",
  "M34 60 C 46 18 112 0 156 26 C 196 50 200 116 170 154 C 140 192 76 200 40 170 C 8 142 22 100 34 60Z",
]
const doodles = (ink, heart, sun) => [
  svg(`<path d='M20 2 C 22 14 26 18 38 20 C 26 22 22 26 20 38 C 18 26 14 22 2 20 C 14 18 18 14 20 2Z' fill='none' stroke='${ink}' stroke-width='2.4' stroke-linejoin='round'/>`, "0 0 40 40"),
  svg(`<path d='M3 22 C 9 8 15 8 18 20 S 27 32 31 18 S 40 6 45 16' fill='none' stroke='${ink}' stroke-width='2.6' stroke-linecap='round'/>`, "0 0 48 30"),
  svg(`<path d='M20 34 C 6 24 2 16 6 10 C 10 4 18 6 20 12 C 22 6 30 4 34 10 C 38 16 34 24 20 34Z' fill='${heart}' stroke='${ink}' stroke-width='2.4' stroke-linejoin='round'/>`, "0 0 40 40"),
  svg(`<path d='M2 14 L 10 4 L 18 14 L 26 4 L 34 14 L 42 4' fill='none' stroke='${ink}' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/>`, "0 0 44 18"),
  svg(`<circle cx='20' cy='20' r='8' fill='${sun}' stroke='${ink}' stroke-width='2.4'/><g stroke='${ink}' stroke-width='2.4' stroke-linecap='round'><path d='M20 2v5M20 33v5M2 20h5M33 20h5M7 7l3.5 3.5M29.5 29.5 33 33M7 33l3.5-3.5M29.5 10.5 33 7'/></g>`, "0 0 40 40"),
]

const DAY = {
  ink: "#161412",
  line: "#161412",
  shadow: "#161412",
  fills: ["#ffe066", "#8ee86b", "#ff9fd0", "#c5a8ff", "#8fd3ff", "#ffb36b"],
  blobs: ["#ffd2b6", "#e4d6ff", "#c8f1d8", "#fff0a6"],
  doodleInk: "#161412",
  heart: "#ff8fc7",
  sun: "#ffe066",
  paper: NOISE(0.09),
  cta: { fill: "#161412", ink: "#ffffff" },
  box: "#ffc6e3",
  contact: "#c8f1d8",
  swash: "#ffe066",
  cell: "#ffffff",
  headFont: "'Permanent Marker', cursive",
  legal: "#fffdf6",
}
const NIGHT = {
  ink: "#0e0e0e",
  line: "#0e0e0e",
  shadow: "#f4ecd8",
  fills: ["#ffd23f", "#3ee08f", "#ff7ab5", "#b8a2ff", "#4cc9ff", "#ff9a52"],
  blobs: ["#2a2440", "#1f3328", "#3a2230", "#2c2a18"],
  doodleInk: "#f4ecd8",
  heart: "#ff6fae",
  sun: "#ffd23f",
  paper: NOISE(0.16),
  cta: { fill: "#0e0e0e", ink: "#ffffff" },
  box: "#b8a2ff",
  contact: "#3ee08f",
  swash: "#7b3cff",
  cell: "#f4ecd8",
  headFont: "'Bangers', cursive",
  legal: "#f4ecd8",
}

function scene(skin, p) {
  const sc = SCENE(skin)
  rule(`${sc} [data-sk="paper"]`, `position: absolute; inset: 0; background: ${p.paper} 0 0 / 220px 220px; mix-blend-mode: ${p === DAY ? "multiply" : "screen"}; opacity: ${p === DAY ? 1 : 0.35};`)
  if (p === NIGHT) rule(`${sc} [data-sk="paper"]::after`, `content: ""; position: absolute; inset: 0; background: radial-gradient(circle, rgba(244,236,216,.16) 0 1.2px, transparent 1.8px) 0 0 / 22px 22px;`)
  rule(`${sc} [data-sk="blob"]`, `position: absolute; width: 340px; aspect-ratio: 1; background: center / contain no-repeat; animation: sk-blob 30s ease-in-out infinite alternate;`)
  const blobAt = [["top: -110px; left: -140px", 0], ["top: 30%; right: -170px; width: 380px", -8], ["top: 58%; left: -170px; width: 320px", -16], ["bottom: -120px; right: -100px; width: 360px", -24]]
  blobAt.forEach(([where, delay], i) => rule(`${sc} [data-sk="blob"]:nth-child(${2 + i})`, `${where}; background-image: ${BLOB(p.blobs[i], SHAPES[i])}; animation-delay: ${delay}s;`))
  rule(`${sc} [data-sk="doodle"]`, `position: absolute; width: 34px; height: 34px; background: center / contain no-repeat; animation: sk-wiggle 3.2s ease-in-out infinite alternate; transform-origin: 50% 50%;`)
  const art = doodles(p.doodleInk, p.heart, p.sun)
  const doodleAt = [["top: 96px; left: 9%", "rotate: -12deg"], ["top: 120px; right: 8%; width: 46px; height: 30px", ""], ["top: 38%; left: 1%; width: 30px; height: 30px", "rotate: 10deg"], ["top: 66%; right: 2%; width: 40px; height: 18px", ""], ["bottom: 70px; left: 6%; width: 38px; height: 38px", ""]]
  doodleAt.forEach(([where, extra], i) => rule(`${sc} [data-sk="doodle"]:nth-child(${6 + i})`, `${where}; background-image: ${art[i]}; animation-delay: ${-i * 0.7}s;${extra ? ` ${extra};` : ""}`))
}

function material(skin, p) {
  const P = S(skin)
  const F = p.fills
  comment(`${skin}: every block a sticker in the next colour of the run; the words on a sticker are ink.`)
  F.forEach((fill, i) => rule(`${P} ${RUN_HOST}:nth-child(${F.length}n+${i + 1})`, `--sk-fill: ${fill};`))
  /* A card has no header block before its links, so its run starts one colour on: its first link wears the page's first link's colour. */
  F.forEach((fill, i) => rule(`${P} [data-tp-blocks] > :nth-child(${F.length}n+${((i + 5) % F.length) + 1})`, `--sk-fill: ${fill};`))
  F.forEach((fill, i) => rule(`${P} :is([data-link-pair], [data-product-pair], [data-tp-pair], [data-tp-masonry]):nth-child(${F.length}n+${i + 1}) > :nth-child(2)`, `--sk-fill: ${F[(i + 2) % F.length]};`))
  rule(`${P} :is([data-tp-pair], [data-tp-masonry]) > :nth-child(3)`, `--sk-fill: ${F[4]};`)
  rule(`${P} :is(${LINK}, ${CARD}, ${FAQ}, ${SURF})`, `
    background-color: var(--sk-fill, ${F[0]}) !important;
    border-color: ${p.line} !important; border-width: 3px !important; border-style: solid !important;
    box-shadow: 4px 4px 0 ${p.shadow} !important;`)
  /* The run is the skin's, so its words are too (round W10): a creator's white words would vanish on a yellow sticker. */
  rule(`${P} ${LINK}`, `color: ${p.ink} !important; font-weight: 600; text-transform: uppercase; letter-spacing: .04em;`)
  promise(skin, "a sticker in the run", p.ink, F)
  onSurface(skin, "a sticker card", `:is(${CARD}, ${FAQ})`, p.ink, F)
  rule(`${P} :is(${CARD})`, `border-radius: 18px !important;`)
  rule(`${P} ${CELL}`, `background-color: ${p.cell} !important; border: 3px solid ${p.line} !important; border-radius: 14px !important; box-shadow: 3px 3px 0 ${p.shadow} !important;`)
  onSurface(skin, "a countdown's number", CELL, p.ink, [p.cell])
  rule(`${P} ${STRIP}`, `background-color: transparent !important; border-top: 3px solid ${p.line};`)
  rule(`${P} ${CTA}`, `
    background-color: ${p.cta.fill} !important; background-image: none; color: ${p.cta.ink} !important;
    border: 3px solid ${p.line} !important; border-radius: 12px !important; font-weight: 600; text-transform: uppercase; letter-spacing: .05em;
    box-shadow: 3px 3px 0 rgba(22,20,18,.25) !important;`)
  promise(skin, "the black button", p.cta.ink, [p.cta.fill])
  rule(`${P} ${BOX}`, `background-color: ${p.box} !important; border: 3px solid ${p.line}; border-radius: 22px !important; box-shadow: 5px 5px 0 ${p.shadow};`)
  rule(`${P} [data-onepage-contact]`, `background-color: ${p.contact} !important;`)
  onSurface(skin, "the subscribe and contact forms", BOX, p.ink, [p.box, p.contact])
  rule(`${P} ${INPUT}`, `background: #fff !important; border: 3px solid ${p.line} !important; border-radius: 12px !important; color: ${p.ink} !important; font-weight: 500;`)
  rule(`${P} ${INPUT}:focus`, `box-shadow: 3px 3px 0 ${p.line} !important;`)
  rule(`${P} ${TITLE}`, `
    background: linear-gradient(transparent 56%, ${p.swash} 56%, ${p.swash} 90%, transparent 90%) center / 100% 100% no-repeat;
    padding-inline: .18em; letter-spacing: .02em; transform: rotate(-1.5deg);`)
  rule(`${P} :is(${HEADING}, ${BLOCK_TITLE})`, `
    font-family: ${p.headFont} !important; text-transform: uppercase; letter-spacing: .03em;
    background: ${svg(`<path d='M2 6 C 12 1 22 11 32 6 S 52 1 62 6 S 82 11 92 6 S 112 1 118 6' fill='none' stroke='${p.doodleInk}' stroke-width='2.4' stroke-linecap='round'/>`, "0 0 120 12")} center bottom / 96px 9px no-repeat; padding-bottom: 12px;`)
  rule(`${P} ${AVATAR}`, `box-shadow: 5px 5px 0 ${p.shadow} !important; border-radius: 24px !important;`)
  rule(`${P} ${AVATAR_BOX}`, `transform: rotate(-3deg);`)
  rule(`${P} ${SOCIAL}`, `
    width: 44px; height: 44px; padding: 0; border-radius: 12px !important; color: ${p.ink} !important;
    background-color: var(--sk-fill, ${F[0]}) !important; border: 3px solid ${p.line} !important; box-shadow: 3px 3px 0 ${p.shadow};`)
  F.slice(0, 5).forEach((fill, i) => rule(`${P} ${SOCIAL}:nth-child(5n+${i + 1})`, `--sk-fill: ${[F[3], F[4], F[1], F[5], F[2]][i]};`))
  rule(`${P} ${DIVIDER}`, `height: 12px; background: ${svg(`<path d='M0 9 L 6 3 L 12 9 L 18 3 L 24 9' fill='none' stroke='${p.doodleInk}' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/>`, "0 0 24 12")} 0 0 / 24px 12px repeat-x !important;`)
  rule(`${P} ${PICTURE}`, `border-radius: 18px !important; border: 3px solid ${p.line}; box-shadow: 4px 4px 0 ${p.shadow};`)
  rule(`${P} [data-framed-picture]`, `border: 2.5px solid ${p.line}; border-radius: 12px;`)
  rule(`${P} [data-code-copy]`, `border: 2.5px dashed ${p.line} !important; background: rgba(255,255,255,.6);`)
  legal(skin, p.legal, p.ink, [p.legal], `border: 2.5px solid ${p.line}; box-shadow: 3px 3px 0 ${p.shadow};`)
}

export function playful() {
  banner("PLAYFUL: a sticker sheet, thick outlines, hard shadows, a run of colours")
  scene("playful", DAY)
  material("playful", DAY)
}

export function playfulNight() {
  banner("PLAYFUL NIGHT: dark neo-brutalism, cream shadows, loud stickers, chalk doodles")
  scene("playful2", NIGHT)
  material("playful2", NIGHT)
  /* On the dark board the picture's frame and the stickers keep their black outline; the hard shadow is cream. */
  rule(`${S("playful2")} ${TITLE}`, `text-shadow: 3px 3px 0 #0e0e0e;`)
}
