/**
 * AERO (round W9) and AERO AQUARIUM (round W10): glass and gel. The day is a
 * clear sky over a meadow; the aquarium is the same glass under water at
 * night, light shafts, rising bubbles, goldfish and weed, the products'
 * buttons in goldfish-orange gel.
 */
import { svg, S, SCENE, LINK, CTA, CARD, FAQ, CELL, BOX, SURF, INPUT, TITLE, BIO, TEXT, AVATAR, AVATAR_BOX, SOCIAL, HEADING, BLOCK_TITLE, DIVIDER, PICTURE, STRIP, FILL_LAYER, SPARK, rule, comment, banner, onSurface, promise, legal } from "./shared.mjs"

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
/* A goldfish, side on, facing right: a sleek coral body, a forked veil tail, one fin and a small dark eye. */
const GOLDFISH = svg(
  `<defs><linearGradient id='b' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#ffb067'/><stop offset='.6' stop-color='#ff8a3d'/><stop offset='1' stop-color='#ffc996'/></linearGradient><linearGradient id='t' x1='1' x2='0'><stop offset='0' stop-color='#ff9a4e' stop-opacity='.85'/><stop offset='1' stop-color='#ffc996' stop-opacity='.2'/></linearGradient></defs>` +
    `<path d='M17 20 C 11 13 6 9 1 7 C 4 13 5 17 5 20 C 5 23 4 27 1 33 C 6 31 11 27 17 20Z' fill='url(#t)'/>` +
    `<path d='M15 20 C 27 9 50 8 65 15 C 71 18 74 20 74 20 C 74 20 71 22 65 25 C 50 32 27 31 15 20Z' fill='url(#b)'/>` +
    `<path d='M37 11 C 43 5 51 5 55 10Z' fill='#ff9a4e' fill-opacity='.7'/>` +
    `<circle cx='64' cy='18.5' r='1.5' fill='#3a1a08' fill-opacity='.85'/>`,
  "0 0 76 40",
)
const WEED = (fill) => svg(
  `<path d='M30 300 C 18 240 44 210 28 160 C 14 116 40 84 30 30 C 26 12 34 4 36 2 C 42 30 50 70 44 108 C 38 150 58 186 48 230 C 42 260 46 282 44 300Z' fill='${fill}'/>` +
    `<path d='M48 300 C 52 262 70 236 64 196 C 58 160 78 130 76 96 C 82 120 86 150 80 182 C 74 214 70 250 62 300Z' fill='${fill}' fill-opacity='.75'/>`,
  "0 0 100 300",
)
const SAND = svg(
  `<defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#8a7a4e'/><stop offset='1' stop-color='#4a3f26'/></linearGradient></defs>` +
    `<path d='M0 40 C 80 22 150 30 230 38 S 360 26 400 32 V120 H0Z' fill='url(#s)'/>` +
    `<g fill='#b8a777' fill-opacity='.6'><ellipse cx='52' cy='62' rx='9' ry='5'/><ellipse cx='150' cy='74' rx='6' ry='4'/><ellipse cx='270' cy='60' rx='11' ry='6'/><ellipse cx='352' cy='80' rx='7' ry='4'/></g>` +
    `<g fill='#6f5c33' fill-opacity='.5'><ellipse cx='96' cy='86' rx='8' ry='4'/><ellipse cx='214' cy='92' rx='10' ry='5'/><ellipse cx='318' cy='98' rx='6' ry='3'/></g>`,
  "0 0 400 120",
  " preserveAspectRatio='none'",
)

const DAY = {
  gloss: "linear-gradient(180deg, rgba(255,255,255,.92) 0%, rgba(255,255,255,.45) 46%, rgba(255,255,255,.06) 50%, rgba(255,255,255,0) 78%, rgba(180,232,255,.4) 100%)",
  rim: "rgba(255,255,255,.95)",
  rimInset: "inset 0 1px 0 #fff",
  glow: "rgba(40,140,220,.45)",
  shadow: "rgba(8,70,140,.55)",
  /* The products' buttons and Send: green gel, dark blue words. */
  gel: { color: "#7fdc56", art: "linear-gradient(180deg, rgba(255,255,255,.85) 0%, rgba(255,255,255,.3) 46%, rgba(255,255,255,0) 50%), linear-gradient(180deg, #a3ec74 0%, #6fcf45 50%, #58bd33 51%, #8ee05e 100%)", stops: ["#a3ec74", "#6fcf45", "#58bd33", "#8ee05e"], ink: "#08325a", edge: "#3f9a2a", glow: "rgba(40,120,30,.55)" },
  box: { fill: "rgba(255,255,255,.62)", top: "rgba(255,255,255,.7)", ink: "#042c52", under: ["#d9effb", "#e9f6fd"], border: "rgba(255,255,255,.9)" },
  field: { ink: "#063a6b", border: "rgba(120,180,230,.7)" },
  /* Round AS: the emboss and a close soft light, not a 22px white cloud round the name (scripts/check-onepage-glow-as1.mjs). */
  titleShadow: "0 1px 0 rgba(255,255,255,.85), 0 0 6px rgba(255,255,255,.45)",
  textShadow: "0 1px 0 rgba(255,255,255,.7), 0 0 4px rgba(255,255,255,.4)",
  social: "rgba(255,255,255,.55)",
  divider: "#fff",
}
/*
  Round op-themes: the aquarium made quieter. The owner found it "a little
  cringe": the same gel split in two as the day's (a bright half over a dark
  half), orange gel, a glow round every word and cartoon goldfish with a
  white glint in the eye. Now the glass is lit from above and fades evenly,
  its rims are a thin wet line, the products' button is a smooth coral, the
  words carry only a soft shadow, and the fish are small and sleek.
*/
const NIGHT = {
  gloss: "linear-gradient(180deg, rgba(200,245,255,.2) 0%, rgba(200,245,255,.06) 45%, rgba(200,245,255,0) 70%, rgba(110,220,255,.08) 100%)",
  rim: "rgba(150,225,255,.36)",
  rimInset: "inset 0 1px 0 rgba(210,248,255,.32)",
  glow: "rgba(60,200,255,.16)",
  shadow: "rgba(0,12,28,.6)",
  gel: { color: "#ffad66", art: "linear-gradient(180deg, rgba(255,255,255,.3) 0%, rgba(255,255,255,0) 55%), linear-gradient(180deg, #ffc685 0%, #ff9f58 100%)", stops: ["#ffc685", "#ff9f58"], ink: "#2e1300", edge: "rgba(255,200,150,.85)", glow: "rgba(255,140,60,.32)" },
  box: { fill: "rgba(6,48,78,.7)", top: "rgba(160,230,255,.07)", ink: "#eafaff", under: ["#0a3552", "#0b3d5c"], border: "rgba(150,225,255,.32)" },
  field: { ink: "#06324a", border: "rgba(150,225,255,.6)" },
  titleShadow: "0 0 6px rgba(90,220,255,.22), 0 1px 2px rgba(0,20,40,.5)",
  textShadow: "0 1px 2px rgba(0,20,40,.55)",
  social: "rgba(20,90,130,.38)",
  divider: "#7fd6f5",
}

function material(skin, p) {
  const A = S(skin)
  comment(`${skin}: frosted glass with a gel highlight; the words on the glass are the theme's.`)
  rule(`${A} ${LINK}`, `
    background-color: color-mix(in srgb, var(--sk-surface) 72%, transparent) !important;
    background-image: ${p.gloss};
    border-color: ${p.rim} !important;
    box-shadow: ${p.rimInset}, inset 0 -10px 18px -12px ${p.glow}, 0 10px 24px -12px ${p.shadow}, 0 1px 2px rgba(8,60,120,.12) !important;
    font-weight: 600;`)
  rule(`${A} ${FILL_LAYER}`, `background-image: linear-gradient(180deg, rgba(255,255,255,.55) 0%, rgba(255,255,255,.14) 48%, rgba(255,255,255,0) 52%);`)
  rule(`${A} ${CTA}`, `
    background-color: ${p.gel.color} !important; background-image: ${p.gel.art};
    color: ${p.gel.ink} !important; border-color: ${p.gel.edge} !important; font-weight: 700;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.9), 0 6px 14px -6px ${p.gel.glow} !important;`)
  promise(skin, "the gel button", p.gel.ink, p.gel.stops)
  rule(`${A} :is(${CARD}, ${FAQ}, ${CELL}, ${SURF})`, `
    background-color: color-mix(in srgb, var(--sk-surface) 66%, transparent) !important;
    background-image: linear-gradient(180deg, ${p.box.top} 0%, rgba(255,255,255,0) 42px);
    border-color: ${p.rim} !important; border-radius: 20px !important;
    box-shadow: ${p.rimInset}, 0 14px 34px -16px ${p.shadow}, 0 1px 3px rgba(8,60,120,.1) !important;`)
  rule(`${A} ${CELL}`, `border-radius: 16px !important;`)
  rule(`${A} ${STRIP}`, `background-color: transparent !important;`)
  rule(`${A} ${BOX}`, `
    background-color: ${p.box.fill} !important; border: 1px solid ${p.box.border}; border-radius: 22px !important;
    background-image: linear-gradient(180deg, ${p.box.top} 0%, rgba(255,255,255,0) 56px);
    box-shadow: ${p.rimInset}, 0 16px 36px -18px ${p.shadow};`)
  onSurface(skin, "the subscribe and contact forms' glass", BOX, p.box.ink, p.box.under)
  rule(`${A} ${INPUT}`, `
    background: rgba(255,255,255,.94) !important; border: 1px solid ${p.field.border} !important; border-radius: 12px !important;
    box-shadow: inset 0 2px 4px rgba(8,60,120,.12) !important; color: ${p.field.ink} !important;`)
  promise(skin, "a field", p.field.ink, ["#ffffff", "#f0f0f0"])
  rule(`${A} ${INPUT}:focus`, `box-shadow: inset 0 2px 4px rgba(8,60,120,.12), 0 0 0 3px rgba(80,170,240,.45) !important;`)
  rule(`${A} ${TITLE}`, `text-shadow: ${p.titleShadow}; letter-spacing: -.01em;`)
  rule(`${A} :is(${BIO}, ${HEADING}, ${BLOCK_TITLE}, ${TEXT})`, `text-shadow: ${p.textShadow};`)
  rule(`${A} ${AVATAR}`, `box-shadow: 0 0 0 1px rgba(120,190,240,.5), 0 10px 28px -8px rgba(0,80,160,.55), 0 0 14px ${p === DAY ? "rgba(255,255,255,.45)" : "rgba(90,220,255,.3)"} !important;`)
  rule(`${A} ${AVATAR_BOX}::after`, `content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: linear-gradient(180deg, rgba(255,255,255,.6) 0%, rgba(255,255,255,.12) 44%, rgba(255,255,255,0) 46%);`)
  rule(`${A} ${SOCIAL}`, `
    width: 44px; height: 44px; padding: 0; border-radius: 50% !important;
    background-color: ${p.social} !important; border: 1px solid ${p.rim} !important;
    background-image: ${p.gloss};
    box-shadow: ${p.rimInset}, 0 6px 14px -6px ${p.shadow};`)
  rule(`${A} ${DIVIDER}`, `height: 2px; border-radius: 2px; background: linear-gradient(90deg, transparent, ${p.divider} 30%, ${p.divider} 70%, transparent) !important; box-shadow: 0 0 10px ${p.divider};`)
  rule(`${A} ${PICTURE}`, `border-radius: 20px !important; box-shadow: 0 0 0 ${p === DAY ? "3px rgba(255,255,255,.85)" : "1.5px rgba(150,225,255,.4)"}, 0 12px 26px -12px ${p.shadow};`)
  rule(`${A} [data-framed-picture]`, `border-radius: 14px; box-shadow: 0 0 0 2px ${p.rim};`)
}

export function aero() {
  banner("AERO: a clear sky over a meadow, glass and gel (lib/onepage/theme-skin)")
  const sc = SCENE("aero")
  rule(`${sc} [data-sk="sun"]`, `
    position: absolute; top: -300px; right: -260px; width: 640px; height: 640px; border-radius: 50%;
    background: radial-gradient(circle, rgba(255,255,255,.95) 0%, rgba(255,255,255,.6) 12%, rgba(255,255,255,.18) 34%, rgba(255,255,255,0) 60%), repeating-conic-gradient(from 0deg, rgba(255,255,255,.2) 0deg 5deg, rgba(255,255,255,0) 5deg 15deg);
    -webkit-mask-image: radial-gradient(circle, #000 0%, rgba(0,0,0,.6) 30%, transparent 68%); mask-image: radial-gradient(circle, #000 0%, rgba(0,0,0,.6) 30%, transparent 68%);
    animation: sk-spin 160s linear infinite;`)
  rule(`${sc} [data-sk="swoosh"]`, `position: absolute; left: -10%; width: 120%; top: 150px; height: 260px; background: ${SWOOSH} center / 100% 100% no-repeat; opacity: .9;`)
  rule(`${sc} [data-sk="cloud"]`, `position: absolute; width: 300px; height: 150px; background: ${CLOUD} center / contain no-repeat; animation: sk-drift 46s ease-in-out infinite alternate;`)
  rule(`${sc} [data-sk="cloud"]:nth-child(3)`, `top: 14px; left: -90px; transform: scale(.95);`)
  rule(`${sc} [data-sk="cloud"]:nth-child(4)`, `top: 330px; right: -120px; width: 260px; height: 130px; opacity: .8; animation-duration: 58s; animation-delay: -20s;`)
  rule(`${sc} [data-sk="cloud"]:nth-child(5)`, `top: 46%; left: -150px; width: 340px; height: 170px; opacity: .7; animation-duration: 64s; animation-delay: -34s;`)
  rule(`${sc} [data-sk="meadow"]`, `position: absolute; left: 0; right: 0; bottom: 0; height: 170px; background: ${MEADOW} center bottom / 100% 100% no-repeat;`)
  rule(`${sc} [data-sk="bubble"]`, `
    position: absolute; width: 48px; aspect-ratio: 1; border-radius: 50%; background: ${BUBBLE};
    box-shadow: inset 0 0 10px rgba(255,255,255,.35), 0 6px 18px -8px rgba(20,100,170,.25);
    animation: sk-bob 11s ease-in-out infinite alternate;`)
  const bubbles = [["9%", "left: 6%", 54, 0], ["16%", "right: 5%", 30, -3], ["27%", "left: 84%", 74, -6], ["40%", "left: 2%", 22, -2], ["52%", "right: 3%", 42, -8], ["63%", "left: 3%", 62, -5], ["74%", "right: 7%", 26, -1], ["85%", "left: 14%", 36, -7], ["4%", "left: 40%", 18, -4]]
  bubbles.forEach(([top, side, size, delay], i) => rule(`${sc} [data-sk="bubble"]:nth-child(${7 + i})`, `top: ${top}; ${side}; width: ${size}px; animation-delay: ${delay}s; animation-duration: ${9 + (i % 4) * 1.6}s;`))
  rule(`${sc} [data-sk="glint"]`, `position: absolute; width: 26px; aspect-ratio: 1; background: ${SPARK("#ffffff")} center / contain no-repeat; animation: sk-twinkle 4.2s ease-in-out infinite;`)
  rule(`${sc} [data-sk="glint"]:nth-child(16)`, `top: 58px; right: 92px;`)
  rule(`${sc} [data-sk="glint"]:nth-child(17)`, `top: 132px; right: 34px; width: 16px; animation-delay: -1.6s;`)
  rule(`${sc} [data-sk="glint"]:nth-child(18)`, `top: 33%; left: 16%; width: 14px; animation-delay: -2.8s;`)
  material("aero", DAY)
  legal("aero", "rgba(255,255,255,.86)", "#063a6b", ["#ffffff", "#e3f3d8"])
}

export function aeroAquarium() {
  banner("AERO AQUARIUM: the same glass under water at night, goldfish and rising bubbles")
  const sc = SCENE("aero2")
  rule(`${sc} [data-sk="rays"]`, `
    position: absolute; left: 50%; top: -60px; width: 900px; height: 820px; margin-left: -450px; transform-origin: 50% 0;
    background: repeating-conic-gradient(from 168deg at 50% 0%, rgba(170,240,255,.08) 0deg 3deg, rgba(170,240,255,0) 3deg 11deg, rgba(170,240,255,.05) 11deg 13deg, rgba(170,240,255,0) 13deg 22deg);
    -webkit-mask-image: radial-gradient(70% 90% at 50% 0%, #000 0%, transparent 78%); mask-image: radial-gradient(70% 90% at 50% 0%, #000 0%, transparent 78%);
    animation: sk-sway 30s ease-in-out infinite alternate;`)
  rule(`${sc} [data-sk="caustics"]`, `
    position: absolute; left: 0; right: 0; top: 0; height: 240px; opacity: .4;
    background: radial-gradient(60px 18px at 20% 30%, rgba(190,245,255,.35), transparent 70%), radial-gradient(80px 20px at 62% 18%, rgba(190,245,255,.3), transparent 70%), radial-gradient(70px 16px at 84% 44%, rgba(190,245,255,.25), transparent 70%), radial-gradient(90px 22px at 38% 58%, rgba(190,245,255,.2), transparent 70%);
    animation: sk-shimmer 6s ease-in-out infinite alternate;`)
  rule(`${sc} [data-sk="sand"]`, `position: absolute; left: 0; right: 0; bottom: 0; height: 90px; background: ${SAND} center bottom / 100% 100% no-repeat; opacity: .55;`)
  rule(`${sc} [data-sk="weed"]`, `position: absolute; bottom: 30px; width: 70px; height: 220px; background: center bottom / contain no-repeat; transform-origin: 50% 100%; opacity: .55; animation: sk-weed 9s ease-in-out infinite alternate;`)
  rule(`${sc} [data-sk="weed"]:nth-child(4)`, `left: -6px; background-image: ${WEED("#1f7a63")};`)
  rule(`${sc} [data-sk="weed"]:nth-child(5)`, `right: -2px; height: 260px; background-image: ${WEED("#26876b")}; animation-delay: -3s; animation-duration: 8.5s;`)
  rule(`${sc} [data-sk="fish"]`, `position: absolute; width: 46px; height: 24px; background: ${GOLDFISH} center / contain no-repeat; opacity: .9; animation: sk-swim 18s ease-in-out infinite alternate; filter: drop-shadow(0 3px 4px rgba(0,10,25,.3));`)
  rule(`${sc} [data-sk="fish"]:nth-child(6)`, `top: 128px; left: 5%;`)
  rule(`${sc} [data-sk="fish"]:nth-child(7)`, `top: 64px; right: 16%; width: 34px; height: 18px; scale: -1 1; animation-duration: 21s; animation-delay: -6s; opacity: .75;`)
  rule(`${sc} [data-sk="fish"]:nth-child(8)`, `top: 46%; left: -4px; width: 28px; height: 15px; animation-duration: 16s; animation-delay: -9s; opacity: .6;`)
  rule(`${sc} [data-sk="bubble"]`, `
    position: absolute; bottom: 60px; width: 18px; aspect-ratio: 1; border-radius: 50%; background: ${BUBBLE}; opacity: 0;
    animation: sk-rise 9s linear infinite;`)
  const rising = [["6%", 14, 0], ["11%", 9, -2.5], ["15%", 20, -5], ["86%", 12, -1], ["90%", 18, -4], ["94%", 8, -6.5], ["9%", 11, -7.5], ["88%", 10, -3.2]]
  rising.forEach(([left, size, delay], i) => rule(`${sc} [data-sk="bubble"]:nth-child(${9 + i})`, `left: ${left}; width: ${size}px; animation-delay: ${delay}s; animation-duration: ${8 + (i % 3) * 2}s;`))
  rule(`${sc} [data-sk="glint"]`, `position: absolute; width: 12px; aspect-ratio: 1; background: ${SPARK("#bff4ff")} center / contain no-repeat; opacity: .6; animation: sk-twinkle 6s ease-in-out infinite;`)
  rule(`${sc} [data-sk="glint"]:nth-child(17)`, `top: 64px; right: 18%;`)
  rule(`${sc} [data-sk="glint"]:nth-child(18)`, `top: 38%; left: 10%; width: 12px; animation-delay: -2s;`)
  material("aero2", NIGHT)
  legal("aero2", "rgba(4,30,50,.82)", "#eafaff", ["#041e32", "#0d2a35"])
}
