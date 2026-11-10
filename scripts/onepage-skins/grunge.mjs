/**
 * GRUNGE (round W9) and GRUNGE ZINE (round W10): a photocopied zine. The
 * first black and white, cut, taped and distressed; the second a collage on
 * newsprint with a red second colour: red cut bars, red tape headings, a
 * misregistered name, a red marker scribble and a safety pin.
 *
 * Round W10: the words on the page sit on paper labels (the bio, a text
 * block), the toner is lighter behind them, the specks on a black bar stay
 * off its words, and every picture is xeroxed, the links' and the featured
 * card's too.
 */
import { svg, S, SCENE, LINK, CTA, CARD, FAQ, CELL, BOX, SURF, INPUT, TITLE, BIO, TEXT, AVATAR, AVATAR_BOX, SOCIAL, HEADING, BLOCK_TITLE, DIVIDER, PICTURE, ANY_PICTURE, STRIP, rule, comment, banner, onSurface, promise, legal } from "./shared.mjs"

const TONER = svg(`<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' seed='7' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 16 -9.6'/></filter><rect width='100%' height='100%' filter='url(#n)'/>`, "0 0 240 240")
/* White specks on a black bar: fewer than they were, so a word is never lost in them. */
const SPECKS = svg(`<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='2' seed='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 18 -14.2'/></filter><rect width='100%' height='100%' filter='url(#n)'/>`, "0 0 200 200")
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
const BLACK = "#0d0d0d"
const LIGHT = "#f1efe8"

const MONO = { paper: "#f4f3ee", second: BLACK, secondInk: LIGHT, label: "#f4f3ee", copy: 0.32, display: "'Archivo Black', Impact, sans-serif" }
const ZINE = { paper: "#f3eee2", second: "#c8141b", secondInk: "#ffffff", label: "#f3eee2", copy: 0.22, display: "'Anton', Impact, sans-serif" }

/* Zine's art: a red marker scribble, a safety pin, staples, newsprint columns. */
const SCRIBBLE = svg(`<path d='M30 60 C 34 26 92 12 140 18 C 186 24 206 52 190 74 C 170 102 96 108 52 96 C 22 88 14 66 34 46 C 56 26 120 22 160 30' fill='none' stroke='#c8141b' stroke-width='5' stroke-linecap='round' stroke-opacity='.85'/>`, "0 0 220 120")
const PIN = svg(`<g fill='none' stroke='#5b5b5b' stroke-width='3' stroke-linecap='round'><path d='M14 70 L 104 24 C 116 18 126 30 114 38 L 30 82'/><path d='M14 70 C 4 76 10 92 22 86 L 30 82'/></g><rect x='100' y='16' width='26' height='18' rx='4' transform='rotate(-27 113 25)' fill='#8c8c8c' stroke='#3c3c3c' stroke-width='2'/>`, "0 0 140 100")
const STAPLE = "linear-gradient(#6f6f6f, #6f6f6f)"
const COLUMNS = "repeating-linear-gradient(180deg, rgba(13,13,13,.14) 0 2px, transparent 2px 7px)"

function scene(skin, p) {
  const sc = SCENE(skin)
  rule(`${sc} [data-sk="copy"]`, `position: absolute; inset: -40px; background: ${TONER} 0 0 / 240px 240px; opacity: ${p.copy}; animation: sk-jitter .9s steps(3) infinite;`)
  rule(`${sc} [data-sk="streaks"]`, `
    position: absolute; inset: 0;
    background: repeating-linear-gradient(90deg, rgba(0,0,0,.05) 0 1px, transparent 1px 37px), repeating-linear-gradient(90deg, rgba(0,0,0,.04) 0 3px, transparent 3px 113px), repeating-linear-gradient(90deg, rgba(255,255,255,.4) 0 2px, transparent 2px 71px), linear-gradient(180deg, transparent 0 34%, rgba(0,0,0,.06) 34% 35.5%, transparent 35.5% 71%, rgba(0,0,0,.05) 71% 71.8%, transparent 71.8%);`)
  rule(`${sc} [data-sk="halftone"]`, `
    position: absolute; left: -20px; bottom: 0; width: 70%; height: 420px;
    background: radial-gradient(circle, ${p.second} 1.3px, transparent 1.8px) 0 0 / 7px 7px;
    -webkit-mask-image: radial-gradient(farthest-side at 0% 100%, #000 0%, transparent 100%); mask-image: radial-gradient(farthest-side at 0% 100%, #000 0%, transparent 100%); opacity: .45;`)
  rule(`${sc} [data-sk="edge"]`, `position: absolute; inset: 0; box-shadow: inset 0 0 90px rgba(0,0,0,.28), inset 0 0 18px rgba(0,0,0,.3);`)
  rule(`${sc} [data-sk="edge-words"]`, `
    position: absolute; top: 72px; right: 1px; writing-mode: vertical-rl; white-space: nowrap;
    font: 400 15px/1 ${p.display}; letter-spacing: .14em; color: ${p.second === BLACK ? BLACK : p.second}; opacity: .9;`)
}

function material(skin, p) {
  const G = S(skin)
  comment(`${skin}: bars cut from paper, taped paper cards, xeroxed pictures, a distressed name.`)
  rule(`${G} ${LINK}`, `
    background-color: ${BLACK} !important; color: ${LIGHT} !important; --op-fill: ${p.paper} !important; --op-fill-text: ${BLACK} !important;
    background-image: ${SPECKS}; background-size: 200px 200px;
    clip-path: ${TORN};
    text-transform: uppercase; letter-spacing: .1em; font-weight: 700;`)
  promise(skin, "a black bar", LIGHT, [BLACK])
  rule(`${G} [data-block-layout] > :nth-child(3n+2) ${LINK}, ${G} [data-link-pair] > :nth-child(2) ${LINK}, ${G} [data-tp-blocks] > [data-tp-link]:nth-child(3n+1), ${G} [data-tp-pair] > :nth-child(2)`, `background-color: ${p.paper} !important; color: ${BLACK} !important; background-image: none; --op-fill: ${BLACK} !important; --op-fill-text: ${LIGHT} !important;`)
  promise(skin, "a paper bar", BLACK, [p.paper])
  if (p.second !== BLACK) {
    rule(`${G} [data-block-layout] > :nth-child(3n+1) ${LINK}, ${G} [data-tp-blocks] > [data-tp-link]:nth-child(3n)`, `background-color: ${p.second} !important; color: ${p.secondInk} !important; --op-fill: ${BLACK} !important; --op-fill-text: ${LIGHT} !important;`)
    promise(skin, "a red bar", p.secondInk, [p.second])
  }
  rule(`${G} ${CTA}`, `
    background-color: ${p.second} !important; color: ${p.secondInk} !important; --op-fill: ${p.paper} !important; --op-fill-text: ${BLACK} !important;
    background-image: ${SPECKS}; background-size: 200px 200px; border: 2px solid ${p.second} !important;
    text-transform: uppercase; letter-spacing: .1em; font-weight: 700; clip-path: ${TORN};`)
  promise(skin, "a cut button", p.secondInk, [p.second])
  rule(`${G} :is(${CARD}, ${FAQ}, ${SURF})`, `
    background-color: ${p.paper} !important; background-image: ${TAPE}; background-size: 74px 16px; background-position: 50% 0; background-repeat: no-repeat;
    border: 2px solid ${BLACK} !important; border-radius: 0 !important;
    box-shadow: 5px 5px 0 rgba(13,13,13,.18) !important;`)
  onSurface(skin, "taped paper", `:is(${CARD}, ${FAQ})`, BLACK, [p.paper, "#bab8ac"])
  rule(`${G} ${FAQ}`, `background-image: none;`)
  rule(`${G} :is([data-op-block], [data-product-pair] > *):nth-child(odd) :is([data-product-block], a.op-card, [data-onepage-testimonials] figure)`, `rotate: -.6deg;`)
  rule(`${G} :is([data-op-block], [data-product-pair] > *):nth-child(even) :is([data-product-block], a.op-card, [data-onepage-testimonials] figure)`, `rotate: .5deg;`)
  rule(`${G} ${CELL}`, `background-color: ${BLACK} !important; background-image: none; border-color: ${BLACK} !important; border-radius: 0 !important;`)
  onSurface(skin, "a countdown's number", CELL, LIGHT, [BLACK])
  rule(`${G} ${STRIP}`, `background-color: ${p.paper} !important; border-top: 2px solid ${BLACK};`)
  rule(`${G} ${STRIP} [data-block-title]`, `text-transform: uppercase; letter-spacing: .08em; font-weight: 700;`)
  rule(`${G} ${BOX}`, `
    background-color: ${p.paper} !important; background-image: ${TAPE}, ${BARCODE}; background-size: 74px 16px, 58px 18px; background-position: 50% 0, calc(100% - 12px) 12px; background-repeat: no-repeat;
    border: 2px solid ${BLACK}; border-radius: 0 !important; box-shadow: 6px 6px 0 ${BLACK}; rotate: -.4deg;`)
  /* The owner: "Join my newsletter" was white on this paper (a Bold form's words are its own). Now they are ink, whatever the layout. */
  onSurface(skin, "the subscribe and contact forms' paper", BOX, BLACK, [p.paper])
  rule(`${G} ${BOX} h3`, `padding-right: 64px; padding-left: 64px;`)
  rule(`${G} ${INPUT}`, `background: #fff !important; border: 2px solid ${BLACK} !important; border-radius: 0 !important; color: ${BLACK} !important; font-family: 'JetBrains Mono', ui-monospace, monospace;`)
  rule(`${G} ${INPUT}:focus`, `box-shadow: 4px 4px 0 ${BLACK} !important;`)
  rule(`${G} [data-op-header]`, `padding-right: 16px;`)
  rule(`${G} ${TITLE}`, `
    -webkit-mask-image: ${HOLES}; mask-image: ${HOLES}; -webkit-mask-size: 160px 160px; mask-size: 160px 160px;
    letter-spacing: .01em; text-shadow: ${p.second === BLACK ? "2px 1px 0 rgba(13,13,13,.28)" : `3px 2px 0 ${p.second}`};`)
  /* The bio and a text block typed on paper labels, so the toner never sits under a word. */
  rule(`${G} :is(${BIO}, ${TEXT}, [data-tp-title] + span)`, `background: ${p.label}; padding: 6px 10px; box-shadow: 3px 3px 0 rgba(13,13,13,.2); width: fit-content; max-width: 100%;`)
  rule(`${G} ${TEXT}`, `margin-inline: auto;`)
  rule(`${G} [data-tp-title] + span`, `box-sizing: content-box;`)
  onSurface(skin, "a paper label", `:is(${BIO}, ${TEXT})`, BLACK, [p.label])
  rule(`${G} :is(${HEADING}, ${BLOCK_TITLE})`, `
    display: block; background: ${p.second}; padding: 6px 10px 5px !important; text-transform: uppercase;
    letter-spacing: .14em; font-family: ${p.display} !important; font-size: 15px !important; clip-path: ${TORN};`)
  onSurface(skin, "a cut heading", `:is(${HEADING}, ${BLOCK_TITLE})`, p.secondInk, [p.second], { whole: true })
  rule(`${G} :is(${AVATAR} img, ${ANY_PICTURE}), ${G} [data-tp-avatar]`, `filter: grayscale(1) contrast(1.3) brightness(1);`)
  rule(`${G} ${AVATAR}`, `box-shadow: 7px 7px 0 ${p.second} !important;`)
  rule(`${G} ${AVATAR_BOX}`, `rotate: -2deg;`)
  rule(`${G} ${SOCIAL}`, `width: 42px; height: 42px; padding: 0; border-radius: 0 !important; background-color: ${p.paper} !important; border: 2px solid ${BLACK} !important; color: ${BLACK};`)
  rule(`${G} ${SOCIAL}:nth-child(even)`, `background-color: ${p.second} !important;`)
  rule(`${G} ${SOCIAL}:nth-child(even) svg`, `filter: brightness(0) invert(1);`)
  rule(`${G} ${SOCIAL}:nth-child(odd) svg`, `filter: brightness(0);`)
  rule(`${G} ${DIVIDER}`, `height: 18px; background: ${svg(`<g fill='none' stroke='${p.second === BLACK ? BLACK : p.second}' stroke-width='1.8' stroke-linecap='round'><path d='M0 8 C 10 5 20 11 30 8 S 50 5 60 8'/><path d='M0 10 C 10 13 20 7 30 10 S 50 13 60 10'/><path d='M14 3 l 6 12 M20 3 l -6 12 M44 3 l 6 12 M50 3 l -6 12'/></g>`, "0 0 60 18")} 0 50% / 60px 18px repeat-x !important;`)
  rule(`${G} ${PICTURE}`, `border-radius: 0 !important; border: 2px solid ${BLACK}; box-shadow: 5px 5px 0 ${BLACK};`)
  rule(`${G} [data-framed-picture]`, `border: 2px solid ${BLACK}; border-radius: 0;`)
  rule(`${G} [data-code-copy]`, `border-radius: 0 !important; border: 2px dashed ${BLACK} !important;`)
  legal(skin, p.paper, BLACK, [p.paper], `border-radius: 0; border: 2px solid ${BLACK}; rotate: .6deg;`)
}

export function grunge() {
  banner("GRUNGE: a photocopied zine, black and white, cut, taped and distressed")
  const sc = SCENE("grunge")
  scene("grunge", MONO)
  rule(`${sc} [data-sk="barbed"]`, `position: absolute; width: 210px; height: 420px; background: ${BARBED} center / contain no-repeat; opacity: .32;`)
  rule(`${sc} [data-sk="barbed"]:nth-child(4)`, `top: 14px; right: -92px; rotate: 14deg; opacity: .24;`)
  rule(`${sc} [data-sk="barbed"]:nth-child(5)`, `top: 52%; left: -96px; rotate: -166deg; opacity: .2;`)
  rule(`${sc} [data-sk="code"]`, `position: absolute; right: 28px; top: 84px; width: 58px; height: 26px; background: ${BARCODE}; opacity: .75;`)
  rule(`${sc} [data-sk="code"]::after`, `content: "NO. 0091 / COPY"; position: absolute; right: 0; top: 30px; white-space: nowrap; font: 700 8px/1 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .12em; color: #0d0d0d;`)
  material("grunge", MONO)
}

export function grungeZine() {
  banner("GRUNGE ZINE: a collage on newsprint, black and red, a misregistered name")
  const sc = SCENE("grunge2")
  scene("grunge2", ZINE)
  rule(`${sc} [data-sk="columns"]`, `
    position: absolute; top: 0; bottom: 0; width: 120px; opacity: .55;
    background: ${COLUMNS};
    -webkit-mask-image: repeating-linear-gradient(180deg, #000 0 140px, transparent 140px 168px); mask-image: repeating-linear-gradient(180deg, #000 0 140px, transparent 140px 168px);`)
  rule(`${sc} [data-sk="columns"]:nth-child(4)`, `left: -64px; rotate: -3deg;`)
  rule(`${sc} [data-sk="columns"]:nth-child(5)`, `right: -70px; rotate: 2deg; top: 120px;`)
  rule(`${sc} [data-sk="scribble"]`, `position: absolute; bottom: 34px; left: 50%; width: 250px; height: 112px; margin-left: -125px; background: ${SCRIBBLE} center / contain no-repeat; rotate: -6deg; opacity: .85;`)
  rule(`${sc} [data-sk="pin"]`, `position: absolute; top: 44%; right: -18px; width: 86px; height: 62px; background: ${PIN} center / contain no-repeat; rotate: 64deg; opacity: .9;`)
  rule(`${sc} [data-sk="staple"]`, `position: absolute; width: 28px; height: 4px; background: ${STAPLE}; border-radius: 2px; box-shadow: 0 1px 0 rgba(255,255,255,.6);`)
  rule(`${sc} [data-sk="staple"]:nth-child(9)`, `top: 18px; left: 18px; rotate: -12deg;`)
  rule(`${sc} [data-sk="staple"]:nth-child(10)`, `top: 18px; right: 18px; rotate: 10deg;`)
  material("grunge2", ZINE)
  /* The zine's name is cut from a red strip, white capitals, a little crooked. */
  rule(`${S("grunge2")} ${TITLE}`, `-webkit-mask-image: none; mask-image: none; background: #c8141b; padding: 2px 12px 0; width: fit-content; rotate: -2deg; box-shadow: 4px 4px 0 ${BLACK}; text-shadow: none; letter-spacing: .03em;`)
  onSurface("grunge2", "the name's red strip", TITLE, "#ffffff", ["#c8141b"], { whole: true })
}
