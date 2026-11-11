/**
 * MESSENGER (round W9) and MESSENGER OLIVE (round W10): a buddy list. The
 * first in Luna blue; the second in the olive green setting of the same
 * desktop, a sunny gel for the buttons. Rows carry a status light (online,
 * away, busy), cards are windows with a title bar, the picture a display
 * picture that is online.
 */
import { svg, S, SCENE, LINK, CTA, CARD, FAQ, CELL, BOX, SURF, INPUT, TITLE, AVATAR, SOCIAL, HEADING, BLOCK_TITLE, DIVIDER, PICTURE, STRIP, FILL_LAYER, rule, comment, banner, onSurface, promise, legal } from "./shared.mjs"

const RIBBON = svg(
  `<defs><linearGradient id='a' x1='0' x2='1'><stop offset='0' stop-color='#fff' stop-opacity='0'/><stop offset='.4' stop-color='#fff' stop-opacity='.55'/><stop offset='1' stop-color='#fff' stop-opacity='0'/></linearGradient></defs>` +
    `<path d='M-10 120 C 80 40 220 150 410 50 L410 64 C 220 166 80 58 -10 136Z' fill='url(#a)'/>` +
    `<path d='M-10 70 C 120 120 240 10 410 90 L410 96 C 240 22 120 132 -10 78Z' fill='#fff' fill-opacity='.3'/>`,
  "0 0 400 180",
  " preserveAspectRatio='none'",
)
const DOT = (x, y, [hi, lo]) => `radial-gradient(circle at calc(${x} - 1.5px) calc(${y} - 2px), rgba(255,255,255,.95) 0 1.6px, transparent 2.4px), radial-gradient(circle at ${x} ${y}, ${hi} 0 4px, ${lo} 5px, transparent 5.8px)`
const ONLINE = ["#8fe35c", "#3c9a1d"]
const AWAY = ["#ffd45c", "#c98a0c"]
const BUSY = ["#ff7a6b", "#c0281a"]
const ORB = (hi, mid, lo) => svg(`<defs><radialGradient id='g' cx='.4' cy='.35' r='.7'><stop offset='0' stop-color='${hi}'/><stop offset='.45' stop-color='${mid}'/><stop offset='1' stop-color='${lo}'/></radialGradient></defs><circle cx='8.5' cy='8.5' r='7.4' fill='url(#g)' stroke='#fff' stroke-opacity='.9' stroke-width='1.2'/><ellipse cx='7.4' cy='5.6' rx='3.6' ry='2.1' fill='#fff' fill-opacity='.75'/>`, "0 0 17 17")
const DOTS = "radial-gradient(circle at calc(100% - 14px) 13px, rgba(255,255,255,.95) 0 2px, transparent 2.6px), radial-gradient(circle at calc(100% - 26px) 13px, rgba(255,255,255,.7) 0 2px, transparent 2.6px), radial-gradient(circle at calc(100% - 38px) 13px, rgba(255,255,255,.5) 0 2px, transparent 2.6px)"

const BLUE = {
  band: "linear-gradient(180deg, #1e5fd0 0%, #3d7fe6 38%, rgba(120,170,240,.55) 72%, rgba(212,227,251,0) 100%)",
  bar: "linear-gradient(180deg, #3d8ef8 0%, #0b5fe0 22%, #0350d2 62%, #0a5ce0 86%, #2a75ee 100%)",
  barEdge: "#0a4fc4",
  orb: ORB("#d8ffb8", "#6fd23f", "#2f8a17"),
  row: "linear-gradient(180deg, #ffffff 0%, #ffffff 55%, #edf3fd 100%)",
  rowEdge: "#9fb9e3",
  rowShadow: "rgba(30,80,170,.35)",
  ink: "#0f2a55",
  /* Send and the products' buttons: a deep green gel whose words are white on every band of it. */
  cta: { color: "#1a6c17", art: "linear-gradient(180deg, rgba(255,255,255,.1) 0%, rgba(255,255,255,.03) 46%, rgba(255,255,255,0) 50%), linear-gradient(180deg, #1d7019 0%, #1a6c17 50%, #145d12 51%, #1a6a16 100%)", stops: ["#337e2f", "#1d7019", "#1a6c17", "#145d12", "#1a6a16"], ink: "#ffffff", edge: "#14540f", shadow: "rgba(20,70,10,.6)" },
  strip: "#f1f6ff",
  stripLine: "#c9d8f2",
  field: "#7f9db9",
  focus: "#316ac5",
  glowA: "rgba(150,190,255,.35)",
  glowB: "rgba(140,220,120,.22)",
  heading: "rgba(49,106,197,.55)",
  social: "linear-gradient(180deg, #ffffff 0%, #ffffff 50%, #e1ebfb 100%)",
  socialEdge: "#a9c1e8",
  dash: "#8fb0e6",
}
const OLIVE = {
  band: "linear-gradient(180deg, #7d8c43 0%, #a3b366 40%, rgba(196,206,150,.6) 72%, rgba(238,240,220,0) 100%)",
  bar: "linear-gradient(180deg, #b7c58a 0%, #8f9f55 22%, #7a8a3f 62%, #8a9a4d 86%, #a8b874 100%)",
  barEdge: "#5f6e2c",
  orb: ORB("#fff2b8", "#f2c043", "#b07a10"),
  row: "linear-gradient(180deg, #fffef8 0%, #fffef8 55%, #f1f2e2 100%)",
  rowEdge: "#b4bd8a",
  rowShadow: "rgba(80,90,30,.35)",
  ink: "#2b3510",
  cta: { color: "#f6c349", art: "linear-gradient(180deg, rgba(255,255,255,.75) 0%, rgba(255,255,255,.25) 46%, rgba(255,255,255,0) 50%), linear-gradient(180deg, #ffdf7e 0%, #f8c94f 50%, #f0b636 51%, #f9cf5c 100%)", stops: ["#ffdf7e", "#f8c94f", "#f0b636", "#f9cf5c"], ink: "#2a1d00", edge: "#b98512", shadow: "rgba(120,90,10,.5)" },
  strip: "#f7f8ec",
  stripLine: "#d8dcbc",
  field: "#9aa275",
  focus: "#7a8a3f",
  glowA: "rgba(190,205,130,.35)",
  glowB: "rgba(255,210,110,.22)",
  heading: "rgba(110,126,52,.6)",
  social: "linear-gradient(180deg, #fffef8 0%, #fffef8 50%, #ecefd6 100%)",
  socialEdge: "#bcc495",
  dash: "#a7b27a",
}

function scene(skin, p) {
  const sc = SCENE(skin)
  rule(`${sc} [data-sk="band"]`, `position: absolute; left: 0; right: 0; top: 0; height: 190px; background: ${p.band};`)
  rule(`${sc} [data-sk="ribbon"]`, `position: absolute; left: -5%; width: 110%; top: 18px; height: 150px; background: ${RIBBON} center / 100% 100% no-repeat; animation: sk-sway 18s ease-in-out infinite alternate;`)
  rule(`${sc} [data-sk="ribbon"]:nth-child(3)`, `top: 60px; transform: scaleX(-1); opacity: .6; animation-duration: 24s;`)
  rule(`${sc} [data-sk="glow"]`, `position: absolute; width: 420px; height: 420px; border-radius: 50%; background: radial-gradient(closest-side, ${p.glowA}, transparent); left: -200px; top: 46%;`)
  rule(`${sc} [data-sk="glow"]:nth-child(5)`, `left: auto; right: -220px; top: 72%; background: radial-gradient(closest-side, ${p.glowB}, transparent);`)
}

function material(skin, p) {
  const M = S(skin)
  comment(`${skin}: rows of a buddy list (a status light, the name, selection on hover), windows with a title bar.`)
  rule(`${M} ${LINK}`, `
    --sk-dot: ${DOT("21px", "50%", ONLINE)};
    background-image: var(--sk-dot), ${p.row};
    border-color: ${p.rowEdge} !important; padding-left: 40px !important;
    box-shadow: 0 1px 0 rgba(255,255,255,.9) inset, 0 2px 5px -2px ${p.rowShadow} !important;
    font-weight: 700;`)
  /* A buddy list is never all online: every third is away, the next busy. */
  rule(`${M} :is([data-block-layout] > *, [data-tp-blocks] > *):nth-child(3n+2) ${LINK}, ${M} [data-tp-blocks] > [data-tp-link]:nth-child(3n+2)`, `--sk-dot: ${DOT("21px", "50%", AWAY)};`)
  rule(`${M} :is([data-block-layout] > *, [data-tp-blocks] > *):nth-child(3n) ${LINK}, ${M} [data-tp-blocks] > [data-tp-link]:nth-child(3n)`, `--sk-dot: ${DOT("21px", "50%", BUSY)};`)
  rule(`${M} :is([data-link-tile], [data-block-size="half"], [data-tp-masonry], [data-tp-pair]) ${LINK}`, `background-image: ${DOT("calc(100% - 16px)", "16px", ONLINE)}, ${p.row}; padding-left: 14px !important;`)
  /* Wave 11: the selection's gloss stops above the words, so white words keep their pair on it, pressed too. */
  rule(`${M} ${FILL_LAYER}`, `background-image: linear-gradient(180deg, rgba(255,255,255,.22) 0%, rgba(255,255,255,0) 30%);`)
  rule(`${M} ${CTA}`, `
    background-color: ${p.cta.color} !important; background-image: ${p.cta.art};
    color: ${p.cta.ink} !important; border-color: ${p.cta.edge} !important; font-weight: 800; font-style: italic; text-shadow: ${p.cta.ink === "#ffffff" ? "0 1px 1px rgba(0,0,0,.45)" : "0 1px 0 rgba(255,255,255,.5)"};
    box-shadow: inset 0 1px 0 rgba(255,255,255,.45), 0 2px 6px -2px ${p.cta.shadow} !important;`)
  promise(skin, "the gel button", p.cta.ink, p.cta.stops)
  rule(`${M} :is(${CARD}, ${BOX})`, `
    background-color: #ffffff !important; background-image: ${p.orb}, ${DOTS}, ${p.bar};
    background-size: 17px 17px, auto, auto, auto, 100% 26px; background-repeat: no-repeat; background-position: 7px 4px, 0 0, 0 0, 0 0, 0 0;
    border: 1px solid ${p.barEdge} !important; border-radius: 9px 9px 5px 5px !important; padding-top: 26px !important;
    box-shadow: 0 10px 24px -12px ${p.rowShadow}, 0 1px 2px ${p.rowShadow} !important;`)
  rule(`${M} :is([data-product-block="row"], [data-tp-product="row"], a.op-card, [data-tp-card])`, `background-image: ${p.row}; background-size: auto; padding-top: 0 !important; border-color: ${p.rowEdge} !important; border-radius: 6px !important;`)
  rule(`${M} [data-onepage-code]`, `padding-top: 36px !important;`)
  rule(`${M} ${BOX}`, `padding: 40px 20px 20px !important;`)
  rule(`${M} :is(${FAQ}, ${CELL}, ${SURF})`, `background-color: #ffffff !important; background-image: ${p.row}; border-color: ${p.rowEdge} !important; box-shadow: 0 2px 5px -2px ${p.rowShadow} !important;`)
  onSurface(skin, "a window, a row and a panel", `:is(${CARD}, ${BOX}, ${FAQ}, ${CELL})`, p.ink, ["#ffffff", p === BLUE ? "#edf3fd" : "#f1f2e2", p.strip])
  rule(`${M} ${STRIP}`, `background-color: ${p.strip} !important; border-top: 1px solid ${p.stripLine};`)
  rule(`${M} ${INPUT}`, `background: #fff !important; border: 1px solid ${p.field} !important; border-radius: 3px !important; box-shadow: inset 0 1px 2px rgba(15,42,85,.12) !important; color: ${p.ink} !important;`)
  rule(`${M} ${INPUT}:focus`, `border-color: ${p.focus} !important; box-shadow: 0 0 0 2px color-mix(in srgb, ${p.focus} 35%, transparent) !important;`)
  rule(`${M} ${TITLE}`, `text-shadow: 0 1px 0 #fff;`)
  rule(`${M} :is(${HEADING}, ${BLOCK_TITLE})`, `background: linear-gradient(90deg, transparent, ${p.heading}, transparent) center bottom / 70% 2px no-repeat; padding-bottom: 6px;`)
  rule(`${M} ${AVATAR}`, `border-radius: 12px !important; box-shadow: 0 0 0 2px #fff, 0 0 0 5px #6cc04a, 0 0 0 6px #3f8f2a, 0 8px 18px -4px ${p.rowShadow} !important;`)
  rule(`${M} [data-page-avatar]::after, ${M} [data-tp-avatar]::after`, `
    content: ""; position: absolute; right: -8px; bottom: -8px; width: 22px; height: 22px; border-radius: 50%; pointer-events: none;
    background: radial-gradient(circle at 36% 30%, #fff 0 2px, transparent 3.5px), radial-gradient(circle, #9be864 0%, #4aa82a 70%, #2f7f17 100%);
    box-shadow: 0 0 0 2px #fff, 0 2px 4px rgba(0,0,0,.3); animation: sk-online 2.6s ease-in-out infinite;`)
  rule(`${M} ${SOCIAL}`, `
    width: 42px; height: 42px; padding: 0; border-radius: 8px !important;
    background-color: #fff !important; background-image: ${p.social};
    border: 1px solid ${p.socialEdge} !important; box-shadow: 0 2px 4px -1px ${p.rowShadow};`)
  rule(`${M} ${DIVIDER}`, `height: 1px; background: repeating-linear-gradient(90deg, ${p.dash} 0 2px, transparent 2px 4px) !important;`)
  rule(`${M} ${PICTURE}`, `border-radius: 8px !important; border: 1px solid ${p.rowEdge}; box-shadow: 0 0 0 3px #fff, 0 6px 14px -6px ${p.rowShadow};`)
}

export function messenger() {
  banner("MESSENGER: a buddy list in Luna blue, status lights and green gel")
  scene("messenger", BLUE)
  material("messenger", BLUE)
  legal("messenger", "#ffffff", BLUE.ink, ["#ffffff"], `border: 1px solid ${BLUE.rowEdge};`)
}

export function messengerOlive() {
  banner("MESSENGER OLIVE: the same buddy list in olive green, sunny gel")
  scene("messenger2", OLIVE)
  material("messenger2", OLIVE)
  legal("messenger2", "#fffef8", OLIVE.ink, ["#fffef8"], `border: 1px solid ${OLIVE.rowEdge};`)
}
