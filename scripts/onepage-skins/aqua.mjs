/**
 * AQUA (round W9) and AQUA GRAPHITE (round W10): clear gel pills and
 * windows. Aqua is pinstripes and blue gel; Graphite is the same desk in
 * brushed metal with graphite gel and grey lights, the sober setting of
 * the era.
 */
import { svg, S, SCENE, LINK, CTA, CARD, FAQ, CELL, BOX, SURF, INPUT, TITLE, AVATAR, AVATAR_BOX, SOCIAL, HEADING, BLOCK_TITLE, DIVIDER, PICTURE, STRIP, FILL_LAYER, TILE, NOISE, rule, comment, banner, onSurface, promise, legal } from "./shared.mjs"

const AQUA_WAVE = svg(
  `<defs><linearGradient id='a' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#5aa2f0'/><stop offset='.6' stop-color='#9cc8f6'/><stop offset='1' stop-color='#e6f0fb'/></linearGradient><linearGradient id='b' x1='1' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#ffffff' stop-opacity='.9'/><stop offset='1' stop-color='#ffffff' stop-opacity='0'/></linearGradient></defs>` +
    `<path d='M0 0 H400 V120 C 320 200 190 120 120 170 C 70 206 30 230 0 236 Z' fill='url(#a)'/>` +
    `<path d='M400 40 C 300 150 200 70 110 130 C 70 156 30 190 0 200 V214 C 40 200 80 172 120 148 C 210 92 310 168 400 60 Z' fill='url(#b)'/>` +
    `<path d='M0 60 C 90 120 180 20 300 70 C 340 86 370 80 400 64 V72 C 370 92 330 96 300 82 C 180 34 90 132 0 72 Z' fill='#fff' fill-opacity='.35'/>`,
  "0 0 400 240",
  " preserveAspectRatio='none'",
)
const lights = (a, b, c, ring) => [
  "radial-gradient(circle at 14px 11px, rgba(255,255,255,.85) 0 1.5px, transparent 2.5px)",
  "radial-gradient(circle at 32px 11px, rgba(255,255,255,.85) 0 1.5px, transparent 2.5px)",
  "radial-gradient(circle at 50px 11px, rgba(255,255,255,.85) 0 1.5px, transparent 2.5px)",
  `radial-gradient(circle at 14px 12px, ${a} 0 4.6px, ${ring} 5.2px, transparent 5.8px)`,
  `radial-gradient(circle at 32px 12px, ${b} 0 4.6px, ${ring} 5.2px, transparent 5.8px)`,
  `radial-gradient(circle at 50px 12px, ${c} 0 4.6px, ${ring} 5.2px, transparent 5.8px)`,
]
const bar = (top, bottom, line) => [`linear-gradient(180deg, ${top} 0px, ${bottom} 22px, ${line} 22px, ${line} 23px, rgba(255,255,255,0) 23px)`, "repeating-linear-gradient(180deg, rgba(255,255,255,.55) 0 1px, rgba(255,255,255,0) 1px 2px)"]
const gel = (stops) => `linear-gradient(180deg, rgba(255,255,255,.88) 0%, rgba(255,255,255,.35) 46%, rgba(255,255,255,0) 50%), radial-gradient(120% 70% at 50% 115%, rgba(255,255,255,.55) 0%, rgba(255,255,255,0) 70%), linear-gradient(180deg, ${stops[0]} 0%, ${stops[1]} 50%, ${stops[2]} 51%, ${stops[3]} 100%)`
const CLEAR_GEL = "linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(255,255,255,.75) 45%, rgba(225,231,240,.0) 50%), radial-gradient(120% 75% at 50% 120%, rgba(255,255,255,.95) 0%, rgba(255,255,255,0) 70%), linear-gradient(180deg, #f7f9fc 0%, #eaeef4 50%, #dde3ec 51%, #f3f6fa 100%)"

const AQUA = {
  /* The default button: blue gel, near-black words (the gel's darkest band reads at 4.5:1). */
  gel: ["#7cb9f6", "#4a94ec", "#3d89e8", "#5aa9f5"],
  gelInk: "#06162e",
  gelEdge: "#2459a8",
  gelGlow: "rgba(20,80,180,.45)",
  windowBar: bar("#fbfbfb", "#e2e2e2", "#a6a6a6"),
  windowLights: lights("#ff5f57", "#febc2e", "#28c840", "#00000033"),
  windowEdge: "#9c9c9c",
  ink: "#141414",
  pill: "#8e99ad",
  focus: "rgba(80,150,240,.7)",
}
const GRAPHITE = {
  gel: ["#b7c0cc", "#8f9aa8", "#7f8a99", "#a3adba"],
  gelInk: "#0b1220",
  gelEdge: "#525c6b",
  gelGlow: "rgba(40,50,70,.45)",
  windowBar: bar("#ececec", "#c9c9c9", "#8c8c8c"),
  windowLights: lights("#9aa3ae", "#9aa3ae", "#9aa3ae", "#5f6874"),
  windowEdge: "#8a8a8a",
  ink: "#141414",
  pill: "#868d98",
  focus: "rgba(120,135,160,.75)",
}

function material(skin, p) {
  const Q = S(skin)
  comment(`${skin}: clear gel pills, the default button in gel and slowly throbbing, cards as windows with a title bar.`)
  rule(`${Q} ${LINK}`, `
    background-image: ${CLEAR_GEL};
    border-color: ${p.pill} !important;
    box-shadow: inset 0 1px 0 #fff, inset 0 -1px 1px rgba(255,255,255,.9), 0 1px 1px rgba(0,0,0,.28), 0 3px 8px -2px rgba(0,0,0,.2) !important;
    font-weight: 700; text-shadow: 0 1px 0 rgba(255,255,255,.8);`)
  rule(`${Q} ${TILE} ${LINK}`, `border-radius: 22px !important;`)
  rule(`${Q} ${FILL_LAYER}`, `background-image: ${gel(p.gel)};`)
  rule(`${Q} ${CTA}`, `
    background-color: ${p.gel[1]} !important; background-image: ${gel(p.gel)};
    color: ${p.gelInk} !important; border-color: ${p.gelEdge} !important; font-weight: 700; text-shadow: 0 1px 0 rgba(255,255,255,.35);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.7), 0 1px 1px rgba(0,0,0,.3), 0 4px 10px -3px ${p.gelGlow} !important;
    animation: sk-throb 1.9s ease-in-out infinite alternate;`)
  promise(skin, "the default (gel) button", p.gelInk, p.gel)
  rule(`${Q} :is(${CARD}, ${BOX})`, `
    background-color: #ffffff !important; background-image: ${[...p.windowLights, ...p.windowBar].join(", ")};
    border: 1px solid ${p.windowEdge} !important; border-radius: 9px !important; padding-top: 23px !important;
    box-shadow: 0 12px 28px -12px rgba(0,0,0,.45), 0 1px 3px rgba(0,0,0,.18) !important;`)
  rule(`${Q} :is([data-product-block="row"], [data-tp-product="row"], a.op-card, [data-tp-card])`, `background-image: none; padding-top: 0 !important;`)
  rule(`${Q} :is([data-onepage-code], [data-onepage-testimonials] figure)`, `padding-top: 33px !important;`)
  rule(`${Q} ${BOX}`, `padding: 37px 20px 20px !important;`)
  rule(`${Q} :is(${FAQ}, ${CELL}, ${SURF})`, `
    background-color: #ffffff !important; background-image: linear-gradient(180deg, #ffffff 0%, #f1f1f1 100%);
    border-color: #a8a8a8 !important; border-radius: 7px !important;
    box-shadow: inset 0 1px 0 #fff, 0 1px 2px rgba(0,0,0,.2) !important;`)
  onSurface(skin, "a window and a panel", `:is(${CARD}, ${BOX}, ${FAQ}, ${CELL})`, p.ink, ["#ffffff", "#f1f1f1", "#ececec"])
  rule(`${Q} ${STRIP}`, `background-color: #ffffff !important; background-image: linear-gradient(180deg, #ffffff, #ececec);`)
  rule(`${Q} ${INPUT}`, `background: #fff !important; border: 1px solid #8f8f8f !important; border-top-color: #6b6b6b !important; border-radius: 4px !important; box-shadow: inset 0 1px 2px rgba(0,0,0,.28) !important; color: ${p.ink} !important;`)
  rule(`${Q} ${INPUT}:focus`, `box-shadow: inset 0 1px 2px rgba(0,0,0,.28), 0 0 0 3px ${p.focus} !important;`)
  rule(`${Q} ${TITLE}`, `text-shadow: 0 1px 0 rgba(255,255,255,.95); letter-spacing: -.005em;`)
  rule(`${Q} :is(${HEADING}, ${BLOCK_TITLE})`, `text-shadow: 0 1px 0 rgba(255,255,255,.95);`)
  rule(`${Q} ${AVATAR}`, `box-shadow: 0 0 0 1px rgba(0,0,0,.18), 0 8px 18px -4px rgba(0,0,0,.45) !important;`)
  rule(`${Q} ${AVATAR_BOX}::after`, `content: ""; position: absolute; inset: 3px; border-radius: inherit; pointer-events: none; background: linear-gradient(180deg, rgba(255,255,255,.45) 0%, rgba(255,255,255,.08) 40%, rgba(255,255,255,0) 41%);`)
  rule(`${Q} ${SOCIAL}`, `
    width: 42px; height: 42px; padding: 0; border-radius: 50% !important;
    background-image: ${CLEAR_GEL}; border: 1px solid ${p.pill} !important;
    box-shadow: inset 0 1px 0 #fff, 0 1px 1px rgba(0,0,0,.25), 0 3px 7px -2px rgba(0,0,0,.2);`)
  rule(`${Q} ${DIVIDER}`, `height: 2px; background: linear-gradient(180deg, #b4b4b4 0 1px, #ffffff 1px 2px) !important;`)
  rule(`${Q} ${PICTURE}`, `border-radius: 9px !important; border: 3px solid #fff; box-shadow: 0 1px 0 rgba(0,0,0,.15), 0 8px 18px -6px rgba(0,0,0,.4);`)
}

export function aqua() {
  banner("AQUA: a pinstriped window, clear and blue gel")
  const sc = SCENE("aqua")
  rule(`${sc} [data-sk="stripes"]`, `position: absolute; inset: 0; background: repeating-linear-gradient(180deg, rgba(255,255,255,.8) 0 2px, rgba(255,255,255,0) 2px 4px);`)
  rule(`${sc} [data-sk="light"]`, `position: absolute; left: 50%; top: -180px; width: 760px; height: 560px; margin-left: -380px; background: radial-gradient(closest-side, rgba(255,255,255,.95), rgba(255,255,255,0));`)
  rule(`${sc} [data-sk="wave"]`, `
    position: absolute; left: 0; right: 0; top: 0; height: 300px; background: ${AQUA_WAVE} center top / 100% 100% no-repeat; opacity: .5;
    -webkit-mask-image: linear-gradient(180deg, #000 30%, transparent 100%); mask-image: linear-gradient(180deg, #000 30%, transparent 100%);`)
  rule(`${sc} [data-sk="wave"]:nth-child(4)`, `top: auto; bottom: 0; transform: scale(-1, -1); opacity: .3; height: 260px;`)
  material("aqua", AQUA)
  legal("aqua", "rgba(255,255,255,.8)", "#141414", ["#ffffff", "#ececec"])
}

export function aquaGraphite() {
  banner("AQUA GRAPHITE: brushed metal, graphite gel, grey lights")
  const sc = SCENE("aqua2")
  rule(`${sc} [data-sk="brush"]`, `
    position: absolute; inset: 0;
    background: repeating-linear-gradient(180deg, rgba(255,255,255,.22) 0 1px, rgba(0,0,0,.035) 1px 2px, rgba(255,255,255,.08) 2px 3px), ${NOISE(0.07)} 0 0 / 160px 160px;`)
  rule(`${sc} [data-sk="sheen"]`, `
    position: absolute; inset: 0;
    background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.38) 22%, rgba(255,255,255,0) 40%, rgba(255,255,255,0) 60%, rgba(255,255,255,.26) 80%, rgba(255,255,255,0) 100%);`)
  rule(`${sc} [data-sk="light"]`, `position: absolute; left: 50%; top: -220px; width: 760px; height: 520px; margin-left: -380px; background: radial-gradient(closest-side, rgba(255,255,255,.75), rgba(255,255,255,0));`)
  material("aqua2", GRAPHITE)
  legal("aqua2", "rgba(255,255,255,.7)", "#141414", ["#ffffff", "#e6e7ea"])
  rule(`${S("aqua2")} ${TITLE}`, `text-shadow: 0 1px 0 rgba(255,255,255,.9), 0 -1px 0 rgba(0,0,0,.18);`)
}
