/**
 * Y2K (round W9) and Y2K KAWAII (round W10). The first is a night of chrome
 * and holograms; the second the pastel, cute side of the same years: jelly
 * buttons in candy colours, a checkered floor, hearts, stars and sparkles,
 * bubble letters with a white outline.
 */
import { svg, S, SCENE, LINK, CTA, CARD, FAQ, CELL, BOX, SURF, INPUT, TITLE, BIO, TEXT, AVATAR, SOCIAL, HEADING, BLOCK_TITLE, DIVIDER, PICTURE, STRIP, FILL_LAYER, TILE, SPARK, rule, comment, banner, onSurface, promise, legal } from "./shared.mjs"

/* The chrome's horizon kept light enough that the words across it read (round W10: it ran a dark line through every label). */
const CHROME = "linear-gradient(180deg, #ffffff 0%, #eef1f6 18%, #d3d8e3 46%, #b9c0cf 50%, #dfe3eb 74%, #ffffff 100%)"
const CHROME_STOPS = ["#ffffff", "#eef1f6", "#d3d8e3", "#b9c0cf", "#dfe3eb"]
const HOLO = "linear-gradient(115deg, #ffc2ef 0%, #bfefff 30%, #d9cbff 55%, #c4ffe2 78%, #ffd9b8 100%)"
const HOLO_STOPS = ["#ffc2ef", "#bfefff", "#d9cbff", "#c4ffe2", "#ffd9b8"]

export function y2k() {
  banner("Y2K: chrome, holograms and sparkles at night")
  const sc = SCENE("y2k")
  rule(`${sc} [data-sk="aurora"]`, `position: absolute; width: 520px; height: 520px; border-radius: 50%; animation: sk-aurora 26s ease-in-out infinite alternate;`)
  rule(`${sc} [data-sk="aurora"]:nth-child(1)`, `top: -200px; left: -220px; background: radial-gradient(closest-side, rgba(255,79,216,.42), rgba(255,79,216,0));`)
  rule(`${sc} [data-sk="aurora"]:nth-child(2)`, `top: 26%; right: -260px; background: radial-gradient(closest-side, rgba(54,224,255,.32), rgba(54,224,255,0)); animation-duration: 32s; animation-delay: -12s;`)
  rule(`${sc} [data-sk="aurora"]:nth-child(3)`, `top: 62%; left: -240px; background: radial-gradient(closest-side, rgba(139,92,255,.42), rgba(139,92,255,0)); animation-duration: 29s; animation-delay: -20s;`)
  rule(`${sc} [data-sk="horizon"]`, `
    position: absolute; left: -50%; width: 200%; bottom: 0; height: 300px; transform-origin: 50% 100%; transform: perspective(260px) rotateX(64deg);
    background: linear-gradient(rgba(150,205,255,.55) 1.5px, transparent 1.5px) 0 0 / 44px 44px, linear-gradient(90deg, rgba(255,150,240,.45) 1.5px, transparent 1.5px) 0 0 / 44px 44px;
    -webkit-mask-image: linear-gradient(to top, #000 0%, transparent 92%); mask-image: linear-gradient(to top, #000 0%, transparent 92%); opacity: .55;`)
  rule(`${sc} [data-sk="pixels"]`, `
    position: absolute; inset: 0; opacity: .8; animation: sk-shimmer 5s ease-in-out infinite alternate;
    background-image: radial-gradient(circle, #fff 0 1px, transparent 1.6px), radial-gradient(circle, #bfefff 0 1px, transparent 1.6px), radial-gradient(circle, #ffc2ef 0 1.2px, transparent 1.8px);
    background-size: 173px 211px, 97px 139px, 251px 187px; background-position: 13px 29px, 61px 7px, 120px 90px;`)
  rule(`${sc} [data-sk="spark"]`, `position: absolute; width: 22px; aspect-ratio: 1; background: ${SPARK("#ffffff")} center / contain no-repeat; animation: sk-twinkle 3.4s ease-in-out infinite;`)
  /* Round W10: the sparkles keep to the edges, off the words (one sat on the bio). */
  const sparks = [["58px", "left: 7%", 30, 0, "#ffffff"], ["150px", "right: 5%", 18, -1.2, "#bfefff"], ["22%", "left: 1%", 14, -2.3, "#ffc2ef"], ["31%", "right: 1%", 30, -0.6, "#ffffff"], ["44%", "left: 1.5%", 20, -1.8, "#d9cbff"], ["53%", "right: 2%", 14, -2.9, "#ffffff"], ["64%", "left: 1%", 28, -0.3, "#bfefff"], ["73%", "right: 1.5%", 18, -1.5, "#ffc2ef"], ["84%", "left: 3%", 16, -2.6, "#ffffff"], ["2%", "right: 22%", 12, -0.9, "#d9cbff"]]
  sparks.forEach(([top, side, size, delay, fill], i) => rule(`${sc} [data-sk="spark"]:nth-child(${6 + i})`, `top: ${top}; ${side}; width: ${size}px; animation-delay: ${delay}s;${fill !== "#ffffff" ? ` background-image: ${SPARK(fill)};` : ""}`))

  const Y = S("y2k")
  comment("Y2K: chrome pills, holographic buttons and rims, chrome type.")
  rule(`${Y} ${LINK}`, `
    background-image: ${CHROME};
    border-color: rgba(255,255,255,.95) !important;
    box-shadow: inset 0 1px 0 #fff, inset 0 -2px 5px rgba(70,80,110,.3), 0 0 0 1px rgba(10,8,30,.55), 0 10px 26px -10px rgba(140,110,255,.75), 0 0 22px -6px rgba(90,220,255,.45) !important;
    font-weight: 600; letter-spacing: .01em; text-shadow: 0 1px 0 rgba(255,255,255,.7);`)
  promise("y2k", "a chrome pill (the theme's words)", "#14112b", CHROME_STOPS)
  rule(`${Y} ${TILE} ${LINK}`, `border-radius: 26px !important;`)
  rule(`${Y} ${FILL_LAYER}`, `background-image: ${HOLO};`)
  rule(`${Y} ${CTA}`, `
    background-color: #d9cbff !important; background-image: linear-gradient(180deg, rgba(255,255,255,.7) 0%, rgba(255,255,255,.15) 48%, rgba(255,255,255,0) 52%), ${HOLO};
    color: #14112b !important; border-color: rgba(255,255,255,.9) !important; font-weight: 700;
    box-shadow: inset 0 1px 0 #fff, 0 0 0 1px rgba(10,8,30,.5), 0 6px 18px -6px rgba(255,120,230,.7) !important;`)
  promise("y2k", "the holographic button", "#14112b", HOLO_STOPS)
  rule(`${Y} :is(${CARD}, ${FAQ}, ${CELL}, ${SURF})`, `
    background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(226,231,242,.94)) padding-box, ${HOLO} border-box !important;
    border: 2px solid transparent !important; border-radius: 22px !important;
    box-shadow: 0 0 0 1px rgba(10,8,30,.5), 0 14px 34px -14px rgba(139,92,255,.8), 0 0 28px -10px rgba(90,220,255,.55) !important;`)
  onSurface("y2k", "a card on its white glass", `:is(${CARD}, ${FAQ}, ${CELL})`, "#14112b", ["#ffffff", "#e2e7f2"])
  rule(`${Y} ${CELL}`, `border-radius: 16px !important;`)
  rule(`${Y} ${STRIP}`, `background-color: transparent !important;`)
  rule(`${Y} ${BOX}`, `
    background: linear-gradient(180deg, rgba(30,24,72,.9), rgba(18,15,46,.92)) padding-box, ${HOLO} border-box !important;
    border: 1.5px solid transparent; border-radius: 24px !important;
    box-shadow: 0 16px 40px -16px rgba(139,92,255,.75), inset 0 1px 0 rgba(255,255,255,.12);`)
  onSurface("y2k", "the forms' night glass", BOX, "#f3f0ff", ["#1e1848", "#120f2e"])
  rule(`${Y} ${INPUT}`, `background: rgba(255,255,255,.94) !important; border: 1px solid rgba(255,255,255,.9) !important; border-radius: 999px !important; box-shadow: inset 0 2px 4px rgba(20,17,43,.25) !important; color: #14112b !important;`)
  rule(`${Y} ${INPUT}:is(textarea)`, `border-radius: 18px !important;`)
  rule(`${Y} ${INPUT}:focus`, `box-shadow: inset 0 2px 4px rgba(20,17,43,.25), 0 0 0 3px rgba(191,239,255,.6) !important;`)
  rule(`${Y} ${TITLE}`, `
    background: linear-gradient(180deg, #ffffff 0%, #f1f4fb 36%, #9aa4bd 50%, #6f7a96 54%, #eef2fa 70%, #c9d2e6 100%);
    -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 0 14px rgba(170,130,255,.55)) drop-shadow(0 2px 0 rgba(8,6,26,.9));`)
  rule(`${Y} :is(${HEADING}, ${BLOCK_TITLE})`, `text-shadow: 0 0 14px rgba(191,239,255,.55), 0 0 2px rgba(255,255,255,.4); letter-spacing: .02em;`)
  rule(`${Y} :is(${BIO}, ${TEXT})`, `text-shadow: 0 1px 8px rgba(8,6,26,.9);`)
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
  legal("y2k", "rgba(13,12,31,.78)", "#e3e7ef", ["#0d0c1f", "#1b1446"])
}

/* Kawaii's candy: each jelly a colour and the ink that reads on it. */
const CANDY = ["#ffb8dd", "#b8e6ff", "#d6c4ff", "#bff5d8", "#ffe0a8"]
const PLUM = "#3b1458"
const HEART = (fill) => svg(`<path d='M20 35 C 6 25 1 17 4 10 C 7 3 16 3 20 10 C 24 3 33 3 36 10 C 39 17 34 25 20 35Z' fill='${fill}' stroke='#fff' stroke-width='2.5' stroke-linejoin='round'/><ellipse cx='12' cy='11' rx='3.4' ry='2.2' fill='#fff' fill-opacity='.8' transform='rotate(-30 12 11)'/>`, "0 0 40 40")
const STAR = (fill) => svg(`<path d='M20 3 L 24.6 14.4 L 37 15.2 L 27.4 23 L 30.6 35 L 20 28.4 L 9.4 35 L 12.6 23 L 3 15.2 L 15.4 14.4 Z' fill='${fill}' stroke='#fff' stroke-width='2.5' stroke-linejoin='round'/>`, "0 0 40 40")
const JELLY = (c) => `linear-gradient(180deg, rgba(255,255,255,.9) 0%, rgba(255,255,255,.4) 40%, rgba(255,255,255,0) 52%), radial-gradient(90% 60% at 50% 110%, rgba(255,255,255,.7), rgba(255,255,255,0) 70%), linear-gradient(180deg, ${c}, ${c})`

export function y2kKawaii() {
  banner("Y2K KAWAII: pastel jelly, a checkered floor, hearts and stars")
  const sc = SCENE("y2k2")
  rule(`${sc} [data-sk="glow"]`, `position: absolute; width: 460px; height: 460px; border-radius: 50%; animation: sk-aurora 28s ease-in-out infinite alternate;`)
  rule(`${sc} [data-sk="glow"]:nth-child(1)`, `top: -180px; right: -200px; background: radial-gradient(closest-side, rgba(255,170,220,.55), transparent);`)
  rule(`${sc} [data-sk="glow"]:nth-child(2)`, `top: 34%; left: -220px; background: radial-gradient(closest-side, rgba(170,220,255,.55), transparent); animation-delay: -10s;`)
  rule(`${sc} [data-sk="glow"]:nth-child(3)`, `top: 66%; right: -230px; background: radial-gradient(closest-side, rgba(210,190,255,.55), transparent); animation-delay: -18s;`)
  rule(`${sc} [data-sk="floor"]`, `
    position: absolute; left: -50%; width: 200%; bottom: 0; height: 260px; transform-origin: 50% 100%; transform: perspective(300px) rotateX(58deg);
    background: repeating-conic-gradient(rgba(255,184,221,.55) 0 25%, rgba(255,255,255,.35) 0 50%) 0 0 / 56px 56px;
    -webkit-mask-image: linear-gradient(to top, #000 0%, transparent 88%); mask-image: linear-gradient(to top, #000 0%, transparent 88%);`)
  rule(`${sc} [data-sk="dots"]`, `position: absolute; inset: 0; background: radial-gradient(circle, rgba(255,255,255,.9) 0 1.4px, transparent 2px) 0 0 / 26px 26px; opacity: .55;`)
  rule(`${sc} [data-sk="charm"]`, `position: absolute; width: 30px; aspect-ratio: 1; background: center / contain no-repeat; animation: sk-bob 6s ease-in-out infinite alternate; filter: drop-shadow(0 3px 4px rgba(120,60,140,.25));`)
  const charms = [["9%", "left: 3%", HEART("#ff8cc6"), 30, 0], ["17%", "right: 3%", STAR("#ffd36b"), 26, -2], ["35%", "right: 1.5%", HEART("#b49bff"), 22, -4], ["49%", "left: 1.5%", STAR("#8fd8ff"), 24, -1], ["66%", "right: 2%", HEART("#ff8cc6"), 26, -3], ["80%", "left: 2.5%", STAR("#ffb3d9"), 22, -5]]
  charms.forEach(([top, side, art, size, delay], i) => rule(`${sc} [data-sk="charm"]:nth-child(${6 + i})`, `top: ${top}; ${side}; width: ${size}px; background-image: ${art}; animation-delay: ${delay}s;`))
  rule(`${sc} [data-sk="spark"]`, `position: absolute; width: 18px; aspect-ratio: 1; background: ${SPARK("#ffffff")} center / contain no-repeat; animation: sk-twinkle 3.6s ease-in-out infinite;`)
  const sparks = [["4%", "left: 22%"], ["12%", "right: 14%"], ["27%", "left: 2%"], ["42%", "right: 2%"], ["58%", "left: 2%"], ["74%", "right: 3%"]]
  sparks.forEach(([top, side], i) => rule(`${sc} [data-sk="spark"]:nth-child(${12 + i})`, `top: ${top}; ${side}; animation-delay: ${-i * 0.6}s;`))

  const K = S("y2k2")
  comment("Y2K Kawaii: candy jelly pills in a run of pastels, white cards with a candy rim, bubble letters.")
  CANDY.forEach((c, i) => rule(`${K} :is([data-block-layout] > *, [data-tp-masonry] > *):nth-child(${CANDY.length}n+${i + 1})`, `--sk-candy: ${c};`))
  CANDY.forEach((c, i) => rule(`${K} [data-tp-blocks] > :nth-child(${CANDY.length}n+${((i + CANDY.length - 1) % CANDY.length) + 1})`, `--sk-candy: ${c};`))
  CANDY.forEach((c, i) => rule(`${K} :is([data-link-pair], [data-tp-pair]):nth-child(${CANDY.length}n+${i + 1}) > :nth-child(2)`, `--sk-candy: ${CANDY[(i + 2) % CANDY.length]};`))
  rule(`${K} ${LINK}`, `
    background-color: var(--sk-candy, ${CANDY[0]}) !important; background-image: ${JELLY("var(--sk-candy, #ffb8dd)")};
    color: ${PLUM} !important; border-color: #ffffff !important; border-width: 2px !important;
    box-shadow: 0 0 0 1.5px rgba(59,20,88,.18), 0 8px 18px -8px rgba(160,70,170,.55), inset 0 -3px 6px rgba(255,255,255,.55) !important;
    font-weight: 700;`)
  promise("y2k2", "a jelly pill", PLUM, CANDY)
  rule(`${K} ${TILE} ${LINK}`, `border-radius: 26px !important;`)
  rule(`${K} ${FILL_LAYER}`, `background-image: ${JELLY("#ff8cc6")};`)
  rule(`${K} ${CTA}`, `
    background-color: #ff8cc6 !important; background-image: ${JELLY("#ff8cc6")};
    color: ${PLUM} !important; border: 2px solid #fff !important; font-weight: 800;
    box-shadow: 0 0 0 1.5px rgba(59,20,88,.2), 0 8px 16px -8px rgba(230,80,160,.7) !important;`)
  promise("y2k2", "the candy button", PLUM, ["#ff8cc6", "#ffc0e0"])
  rule(`${K} :is(${CARD}, ${FAQ}, ${CELL}, ${SURF}, ${BOX})`, `
    background: linear-gradient(180deg, #ffffff, #fff6fb) padding-box, linear-gradient(120deg, #ffb8dd, #b8e6ff, #d6c4ff, #bff5d8) border-box !important;
    border: 3px solid transparent !important; border-radius: 24px !important;
    box-shadow: 0 12px 28px -14px rgba(160,70,170,.55), 0 2px 0 rgba(255,255,255,.9) inset !important;`)
  onSurface("y2k2", "a white card", `:is(${CARD}, ${FAQ}, ${CELL}, ${BOX})`, PLUM, ["#ffffff", "#fff6fb"])
  rule(`${K} ${CELL}`, `border-radius: 18px !important;`)
  rule(`${K} ${STRIP}`, `background-color: transparent !important;`)
  rule(`${K} ${INPUT}`, `background: #fff !important; border: 2px solid #f3c6e2 !important; border-radius: 999px !important; color: ${PLUM} !important; box-shadow: inset 0 2px 3px rgba(160,70,170,.12) !important;`)
  rule(`${K} ${INPUT}:is(textarea)`, `border-radius: 20px !important;`)
  rule(`${K} ${INPUT}:focus`, `box-shadow: 0 0 0 4px rgba(255,140,198,.35) !important; border-color: #ff8cc6 !important;`)
  rule(`${K} ${TITLE}`, `-webkit-text-stroke: 7px #ffffff; paint-order: stroke fill; text-shadow: 0 4px 0 #ffb8dd, 0 8px 18px rgba(160,70,170,.35); letter-spacing: .01em;`)
  rule(`${K} :is(${HEADING}, ${BLOCK_TITLE})`, `-webkit-text-stroke: 4px #fff; paint-order: stroke fill; letter-spacing: .02em;`)
  rule(`${K} :is(${HEADING}, ${BLOCK_TITLE})::after`, `content: " ♡"; color: #ff6fb5; -webkit-text-stroke: 0;`)
  rule(`${K} ${AVATAR}`, `box-shadow: 0 0 0 4px #fff, 0 0 0 8px #ffb8dd, 0 12px 24px -8px rgba(160,70,170,.55) !important;`)
  rule(`${K} [data-page-avatar]::after, ${K} [data-tp-avatar]::after`, `content: ""; position: absolute; right: -10px; top: -8px; width: 30px; height: 30px; background: ${HEART("#ff8cc6")} center / contain no-repeat; pointer-events: none; animation: sk-online 2.4s ease-in-out infinite;`)
  rule(`${K} ${SOCIAL}`, `
    width: 44px; height: 44px; padding: 0; border-radius: 50% !important;
    background-color: var(--sk-candy, #ffb8dd) !important; background-image: ${JELLY("var(--sk-candy, #ffb8dd)")}; border: 2px solid #fff !important; color: ${PLUM};
    box-shadow: 0 6px 12px -6px rgba(160,70,170,.55);`)
  CANDY.forEach((c, i) => rule(`${K} ${SOCIAL}:nth-child(5n+${i + 1})`, `--sk-candy: ${c};`))
  rule(`${K} ${SOCIAL} svg`, `color: ${PLUM}; fill: currentColor;`)
  rule(`${K} ${DIVIDER}`, `height: 14px; background: ${HEART("#ffb8dd")} 0 50% / 14px 14px space no-repeat, radial-gradient(circle, #d6c4ff 0 3px, transparent 3.5px) 7px 50% / 28px 14px repeat-x !important;`)
  rule(`${K} ${PICTURE}`, `border-radius: 22px !important; box-shadow: 0 0 0 4px #fff, 0 0 0 7px #d6c4ff, 0 12px 26px -12px rgba(160,70,170,.6);`)
  rule(`${K} [data-framed-picture]`, `border-radius: 16px;`)
  legal("y2k2", "rgba(255,255,255,.85)", PLUM, ["#ffffff", "#ffeef7"])
}
