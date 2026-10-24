/**
 * ===========================================================================
 *  THE DEMO STORES' PRODUCT PICTURES, DRAWN HERE
 * ===========================================================================
 * The front page hero (scripts/hero-shots.mjs) photographs demo Storelib
 * stores. Their product pictures are drawn by this file as SVG and rendered
 * by Chromium: studio light on a paper sweep, a soft contact shadow, a little
 * grain. No photograph, no brand, no real person: everything here is made up
 * and drawn from shapes, so the pictures are ours to show.
 *
 * Each export is (name) => { w, h, svg }. hero-shots.mjs renders them to PNG
 * under the demo folder the screens read from (/demo/<name>.png).
 */

/* ── Shared pieces ──────────────────────────────────────────────────────── */

let uid = 0
const id = (p) => `${p}${++uid}`
const doc = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`

/** Film grain over the whole picture, at `amount` (0 to 1). */
function grain(w, h, amount = 0.07, freq = 0.85) {
  const f = id("grain")
  return `<filter id="${f}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" stitchTiles="stitch" seed="7"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 ${amount}"/></feComponentTransfer></filter><rect width="${w}" height="${h}" filter="url(#${f})" style="mix-blend-mode:overlay"/><rect width="${w}" height="${h}" filter="url(#${f})" opacity="0.5"/>`
}

/** A seamless paper sweep: lighter behind, a soft floor, a vignette. */
function sweep(w, h, top, floor, horizon = 0.62) {
  const g = id("sweep")
  const v = id("vig")
  return `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="${horizon}" stop-color="${mix(top, floor, 0.55)}"/><stop offset="1" stop-color="${floor}"/></linearGradient>` +
    `<radialGradient id="${v}" cx="0.5" cy="0.42" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.22"/></radialGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#${g})"/><rect width="${w}" height="${h}" fill="url(#${v})"/>`
}

/** A soft shadow under an object resting at (cx, cy). */
function contact(cx, cy, rx, ry, strength = 0.35, blur = 18) {
  const f = id("sh")
  return `<filter id="${f}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${blur}"/></filter>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#1a1208" opacity="${strength}" filter="url(#${f})"/>` +
    `<ellipse cx="${cx}" cy="${cy - ry * 0.15}" rx="${rx * 0.72}" ry="${ry * 0.4}" fill="#120c05" opacity="${strength * 0.9}" filter="url(#${f.replace("sh", "sh")})" style="filter:blur(${Math.max(2, blur / 4)}px)"/>`
}

function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
function mix(a, b, t) { const x = hex(a), y = hex(b); return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}` }
const shade = (c, t) => mix(c, "#000000", t)
const tint = (c, t) => mix(c, "#ffffff", t)

/** A seeded random, so a picture is the same every run. */
function rng(seed) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

const SERIF = "'Cormorant Garamond', 'Playfair Display', Georgia, serif"
const SANS = "Inter, 'DM Sans', Arial, sans-serif"
const GARAMOND = "'EB Garamond', 'Cormorant Garamond', Georgia, serif"
const BEBAS = "'Bebas Neue', Oswald, Impact, sans-serif"

/** Gaussian blur as a filter id, for shadows and soft folds. */
function blur(sd) {
  const f = id("bl")
  return { id: f, def: `<filter id="${f}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${sd}"/></filter>` }
}

/** A fine noise laid over a shape (fabric, stone, paper), clipped to it. */
function texture(clip, w, h, { freq = "0.9 0.7", amount = 0.12, seed = 3, blend = "multiply" } = {}) {
  const f = id("tx")
  return `<filter id="${f}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="3" seed="${seed}"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 ${amount}"/></feComponentTransfer></filter>` +
    `<rect x="${-w}" y="${-h}" width="${w * 3}" height="${h * 3}" filter="url(#${f})" clip-path="url(#${clip})" style="mix-blend-mode:${blend}"/>`
}

/* ── Streetwear: Pale Hours ─────────────────────────────────────────────── */

/*
  Clothes folded, the way a shop photographs its basics: a folded garment is
  a soft rectangle with a collar, two creases where the sides turn under and
  the cotton's grain, which drawn shapes can do honestly. Garments drawn
  flat and whole looked like cut paper, so there are none.
*/

/** One folded garment, its front face w x h with the top left at (x, y). kind: tee, hoodie or sweat. */
function folded(x, y, w, h, color, { kind = "tee", print = "PALE HOURS", seed = 3, side = false } = {}) {
  const clip = id("fd"), light = id("fl"), b = blur(Math.max(2, w * 0.02)), bb = blur(Math.max(3, w * 0.05))
  const pale = hex(color).reduce((a, c) => a + c, 0) > 520
  const deep = shade(color, pale ? 0.28 : 0.45), lit = tint(color, pale ? 0.5 : 0.12)
  const r = Math.min(w, h) * 0.06
  const cx = x + w / 2
  /* From above, the shoulders slope down from the collar to the folded sides; from the side, a soft box. */
  const body = side
    ? `M${x + r} ${y} L${x + w - r} ${y} Q${x + w} ${y} ${x + w} ${y + r} L${x + w + w * 0.006} ${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h + h * 0.01} L${x + r} ${y + h + h * 0.01} Q${x} ${y + h} ${x - w * 0.006} ${y + h - r} L${x} ${y + r} Q${x} ${y} ${x + r} ${y}Z`
    : `M${x + w * 0.04} ${y + h * 0.07} Q${x + w * 0.2} ${y + h * 0.015} ${cx - w * 0.2} ${y + h * 0.008} L${cx + w * 0.2} ${y + h * 0.008} Q${x + w * 0.8} ${y + h * 0.015} ${x + w * 0.96} ${y + h * 0.07} Q${x + w * 1.005} ${y + h * 0.1} ${x + w * 1.006} ${y + h * 0.2} L${x + w * 1.01} ${y + h * 0.95} Q${x + w} ${y + h * 1.005} ${x + w * 0.94} ${y + h * 1.006} L${x + w * 0.06} ${y + h * 1.008} Q${x} ${y + h * 1.003} ${x - w * 0.008} ${y + h * 0.95} L${x - w * 0.006} ${y + h * 0.2} Q${x - w * 0.004} ${y + h * 0.1} ${x + w * 0.04} ${y + h * 0.07}Z`
  const rib = shade(color, pale ? 0.07 : 0.12)
  const collar = kind === "hoodie"
    ? `<path d="M${cx - w * 0.3} ${y + h * 0.01} Q${cx - w * 0.33} ${y + h * 0.3} ${cx} ${y + h * 0.33} Q${cx + w * 0.33} ${y + h * 0.3} ${cx + w * 0.3} ${y + h * 0.01}Z" fill="${shade(color, 0.05)}"/>
       <path d="M${cx - w * 0.3} ${y + h * 0.01} Q${cx - w * 0.33} ${y + h * 0.3} ${cx} ${y + h * 0.33} Q${cx + w * 0.33} ${y + h * 0.3} ${cx + w * 0.3} ${y + h * 0.01}" stroke="#000" stroke-opacity="0.3" stroke-width="${w * 0.03}" fill="none" filter="url(#${bb.id})"/>
       <path d="M${cx} ${y + h * 0.04} L${cx} ${y + h * 0.31}" stroke="${deep}" stroke-opacity="0.6" stroke-width="${w * 0.006}" stroke-dasharray="${w * 0.012} ${w * 0.01}"/>
       <path d="M${cx - w * 0.07} ${y + h * 0.3} q${-w * 0.012} ${h * 0.14} ${w * 0.004} ${h * 0.26}" stroke="${pale ? shade(color, 0.2) : tint(color, 0.3)}" stroke-width="${w * 0.016}" fill="none" stroke-linecap="round"/><path d="M${cx + w * 0.07} ${y + h * 0.3} q${w * 0.012} ${h * 0.16} ${-w * 0.002} ${h * 0.29}" stroke="${pale ? shade(color, 0.2) : tint(color, 0.3)}" stroke-width="${w * 0.016}" fill="none" stroke-linecap="round"/>`
    : `<ellipse cx="${cx}" cy="${y + h * 0.06}" rx="${w * 0.19}" ry="${h * 0.075}" fill="${rib}"/>
       <ellipse cx="${cx}" cy="${y + h * 0.058}" rx="${w * 0.155}" ry="${h * 0.052}" fill="${shade(color, pale ? 0.32 : 0.55)}"/>
       <path d="M${cx - w * 0.155} ${y + h * 0.058} Q${cx} ${y + h * 0.075} ${cx + w * 0.155} ${y + h * 0.058} Q${cx} ${y + h * 0.13} ${cx - w * 0.155} ${y + h * 0.058}Z" fill="${rib}"/>
       <path d="M${cx - w * 0.19} ${y + h * 0.065} Q${cx} ${y + h * 0.17} ${cx + w * 0.19} ${y + h * 0.065}" stroke="#000" stroke-opacity="0.18" stroke-width="${w * 0.012}" fill="none" filter="url(#${b.id})"/>
       <path d="M${cx - w * 0.16} ${y + h * 0.03} Q${cx} ${y + h * 0.0} ${cx + w * 0.16} ${y + h * 0.03}" stroke="#fff" stroke-opacity="0.18" stroke-width="${w * 0.008}" fill="none"/>`
  const rr = rng(seed)
  const wrinkles = Array.from({ length: 5 }, () => {
    const wx = x + w * (0.15 + rr() * 0.7), wy = y + h * (0.25 + rr() * 0.6)
    return `<path d="M${wx} ${wy} q${w * 0.08} ${(rr() - 0.5) * h * 0.08} ${w * (0.12 + rr() * 0.1)} ${(rr() - 0.5) * h * 0.06}" stroke="${rr() > 0.5 ? deep : lit}" stroke-opacity="0.2" stroke-width="${w * 0.02}" fill="none" stroke-linecap="round" filter="url(#${bb.id})"/>`
  }).join("")
  return `<defs>${b.def}${bb.def}<clipPath id="${clip}"><path d="${body}"/></clipPath>
    <linearGradient id="${light}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${pale ? 0.2 : 0.12}"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${pale ? 0.12 : 0.26}"/></linearGradient></defs>
    <path d="${body}" fill="${color}"/>
    <g clip-path="url(#${clip})">
      <rect x="${x}" y="${y}" width="${w * 0.07}" height="${h * 1.02}" fill="${deep}" opacity="0.32" filter="url(#${b.id})"/><rect x="${x + w * 0.93}" y="${y}" width="${w * 0.07}" height="${h * 1.02}" fill="${deep}" opacity="0.4" filter="url(#${b.id})"/>
      <rect x="${x + w * 0.2}" y="${y}" width="${w * 0.012}" height="${h}" fill="${deep}" opacity="0.22" filter="url(#${b.id})"/><rect x="${x + w * 0.79}" y="${y}" width="${w * 0.012}" height="${h}" fill="${deep}" opacity="0.26" filter="url(#${b.id})"/>
      <rect x="${x + w * 0.214}" y="${y}" width="${w * 0.02}" height="${h}" fill="${lit}" opacity="0.22" filter="url(#${b.id})"/>
      ${side ? "" : collar}${wrinkles}
      ${print ? `<text x="${cx}" y="${y + h * (side ? 0.62 : kind === "hoodie" ? 0.74 : 0.5)}" text-anchor="middle" font-family="${BEBAS}" font-size="${w * 0.1}" letter-spacing="${w * 0.012}" fill="${pale ? shade(color, 0.62) : tint(color, 0.62)}" opacity="0.92">${print}</text>` : ""}
      <rect x="${x - w * 0.1}" y="${y - h * 0.1}" width="${w * 1.2}" height="${h * 1.2}" fill="url(#${light})"/>
      ${texture(clip, w, h, { freq: "1.6 1.1", amount: pale ? 0.18 : 0.26, seed })}
      ${side
        ? `<rect x="${x}" y="${y + h * 0.97}" width="${w}" height="${h * 0.04}" fill="${deep}" opacity="0.35"/>`
        : `<path d="M${x} ${y + h * 0.22} L${x + w * 0.2} ${y + h * 0.1}" stroke="${deep}" stroke-opacity="0.3" stroke-width="${w * 0.014}" filter="url(#${b.id})"/><path d="M${x + w} ${y + h * 0.22} L${x + w * 0.8} ${y + h * 0.1}" stroke="${deep}" stroke-opacity="0.34" stroke-width="${w * 0.014}" filter="url(#${b.id})"/>
           <rect x="${x}" y="${y + h * 0.86}" width="${w}" height="${h * 0.012}" fill="${deep}" opacity="0.3" filter="url(#${b.id})"/><rect x="${x}" y="${y + h * 0.872}" width="${w}" height="${h * 0.01}" fill="${lit}" opacity="0.25" filter="url(#${b.id})"/>`}
    </g>`
}

/** A stack of folded garments, bottom first, each a little off the one under it. */
function stack(cx, baseY, w, layers) {
  let y = baseY
  return layers.map(([color, kind, h, print, dx], i) => {
    y -= h * 0.98
    const x = cx - w / 2 + (dx ?? 0)
    const sh = blur(Math.max(3, w * 0.03))
    return `<defs>${sh.def}</defs><rect x="${x + w * 0.02}" y="${y + h * 0.9}" width="${w * 0.96}" height="${h * 0.16}" rx="${h * 0.06}" fill="#1c1611" opacity="${i === 0 ? 0.35 : 0.42}" filter="url(#${sh.id})"/>${folded(x, y, w, h, color, { kind, print: i === layers.length - 1 ? print : "", seed: 7 + i, side: true })}`
  }).join("")
}

/** A ribbed beanie, cuff turned up, a woven label on the cuff. */
function beanie(cx, baseY, s, color) {
  const clip = id("bn"), sh = id("bns"), b = blur(6 * s)
  const dome = `M${cx - 150 * s} ${baseY - 120 * s} Q${cx - 160 * s} ${baseY - 330 * s} ${cx} ${baseY - 342 * s} Q${cx + 160 * s} ${baseY - 330 * s} ${cx + 150 * s} ${baseY - 120 * s}Z`
  const cuff = `M${cx - 160 * s} ${baseY - 150 * s} Q${cx} ${baseY - 168 * s} ${cx + 160 * s} ${baseY - 150 * s} L${cx + 164 * s} ${baseY - 6 * s} Q${cx} ${baseY + 10 * s} ${cx - 164 * s} ${baseY - 6 * s}Z`
  return `<defs>${b.def}<clipPath id="${clip}"><path d="${dome}"/><path d="${cuff}"/></clipPath><radialGradient id="${sh}" cx="0.35" cy="0.3" r="0.85"><stop offset="0" stop-color="#fff" stop-opacity="0.14"/><stop offset="0.6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.32"/></radialGradient></defs>
    <path d="${dome}" fill="${color}"/>
    <g clip-path="url(#${clip})">${Array.from({ length: 24 }, (_, i) => { const t = i / 23; const px = cx - 150 * s + t * 300 * s; return `<path d="M${px} ${baseY - 120 * s} Q${cx + (px - cx) * 0.6} ${baseY - 260 * s} ${cx + (px - cx) * 0.1} ${baseY - 340 * s}" stroke="${shade(color, 0.35)}" stroke-opacity="0.35" stroke-width="${3 * s}" fill="none"/>` }).join("")}</g>
    <path d="${cuff}" fill="${shade(color, 0.05)}"/>
    <g clip-path="url(#${clip})">${Array.from({ length: 30 }, (_, i) => `<line x1="${cx - 164 * s + i * 11.3 * s}" y1="${baseY - 165 * s}" x2="${cx - 164 * s + i * 11.3 * s}" y2="${baseY + 8 * s}" stroke="${shade(color, 0.35)}" stroke-opacity="0.4" stroke-width="${3.5 * s}"/>`).join("")}
      <path d="M${cx - 160 * s} ${baseY - 150 * s} Q${cx} ${baseY - 168 * s} ${cx + 160 * s} ${baseY - 150 * s}" stroke="#000" stroke-opacity="0.3" stroke-width="${10 * s}" fill="none" filter="url(#${b.id})"/>
      <rect x="${cx - 200 * s}" y="${baseY - 360 * s}" width="${400 * s}" height="${380 * s}" fill="url(#${sh})"/>${texture(clip, 400 * s, 400 * s, { freq: "1.4", amount: 0.22, seed: 12 })}</g>
    <rect x="${cx - 40 * s}" y="${baseY - 100 * s}" width="${80 * s}" height="${44 * s}" rx="${3 * s}" fill="#ebe5d8"/><text x="${cx}" y="${baseY - 70 * s}" text-anchor="middle" font-family="${BEBAS}" font-size="${24 * s}" letter-spacing="${2 * s}" fill="#2b2b2b">PH</text>`
}

/** A heavy canvas tote, standing. */
function tote(cx, baseY, s, color = "#e6dfcf") {
  const clip = id("tt"), light = id("ttl")
  const bag = `M${cx - 170 * s} ${baseY - 400 * s} L${cx + 170 * s} ${baseY - 400 * s} L${cx + 182 * s} ${baseY - 8 * s} Q${cx + 182 * s} ${baseY} ${cx + 172 * s} ${baseY} L${cx - 172 * s} ${baseY} Q${cx - 182 * s} ${baseY} ${cx - 182 * s} ${baseY - 8 * s}Z`
  return `<defs><clipPath id="${clip}"><path d="${bag}"/></clipPath><linearGradient id="${light}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.2"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.18"/></linearGradient></defs>
    <path d="M${cx - 110 * s} ${baseY - 396 * s} Q${cx - 104 * s} ${baseY - 620 * s} ${cx - 20 * s} ${baseY - 620 * s} M${cx + 110 * s} ${baseY - 396 * s} Q${cx + 104 * s} ${baseY - 620 * s} ${cx + 20 * s} ${baseY - 620 * s} M${cx - 20 * s} ${baseY - 620 * s} L${cx + 20 * s} ${baseY - 620 * s}" stroke="${shade(color, 0.12)}" stroke-width="${26 * s}" fill="none" stroke-linecap="round"/>
    <path d="${bag}" fill="${color}"/>
    <g clip-path="url(#${clip})"><rect x="${cx - 200 * s}" y="${baseY - 420 * s}" width="${400 * s}" height="${440 * s}" fill="url(#${light})"/>
      <path d="M${cx - 60 * s} ${baseY - 400 * s} Q${cx - 50 * s} ${baseY - 200 * s} ${cx - 76 * s} ${baseY}" stroke="#000" stroke-opacity="0.08" stroke-width="${18 * s}" fill="none" style="filter:blur(${6 * s}px)"/>
      <text x="${cx}" y="${baseY - 210 * s}" text-anchor="middle" font-family="${BEBAS}" font-size="${54 * s}" letter-spacing="${6 * s}" fill="#2b2b2b" opacity="0.88">PALE HOURS</text>
      <text x="${cx}" y="${baseY - 168 * s}" text-anchor="middle" font-family="${SANS}" font-weight="600" font-size="${15 * s}" letter-spacing="${4 * s}" fill="#2b2b2b" opacity="0.7">GOODS FOR LATE DAYS</text>
      ${texture(clip, 400 * s, 440 * s, { freq: "1.1 1.6", amount: 0.22, seed: 15 })}</g>`
}

/** Concrete: a warm grey wall or block with its pores and a mottle. */
function concrete(clipId, w, h, seed) {
  return texture(clipId, w, h, { freq: "0.01 0.016", amount: 0.22, seed }) + texture(clipId, w, h, { freq: "0.7", amount: 0.14, seed: seed + 1 })
}

export function streetHero() {
  const w = 1800, h = 1050
  const wall = id("wall"), wc = id("wc"), sun = blur(26)
  const floorY = h * 0.8
  return { w, h, svg: doc(w, h, `<defs><linearGradient id="${wall}" x1="0" y1="0" x2="1" y2="0.3"><stop offset="0" stop-color="#b9b2a6"/><stop offset="0.6" stop-color="#cbc4b8"/><stop offset="1" stop-color="#b1aa9d"/></linearGradient><clipPath id="${wc}"><rect width="${w}" height="${h}"/></clipPath>${sun.def}</defs>
    <rect width="${w}" height="${h}" fill="url(#${wall})"/>${concrete(wc, w, h, 21)}
    <rect y="${floorY}" width="${w}" height="${h - floorY}" fill="#8e877c"/><rect y="${floorY}" width="${w}" height="3" fill="#6f695f" opacity="0.5"/>
    <g filter="url(#${sun.id})" opacity="0.45" fill="#fff3da"><path d="M820 0 L1240 0 L1060 ${floorY} L600 ${floorY}Z"/><path d="M1330 0 L1720 0 L1560 ${floorY} L1140 ${floorY}Z"/></g>
    ${contact(1150, floorY + 4, 330, 18, 0.4, 14)}${contact(1560, floorY + 4, 170, 14, 0.4, 12)}
    ${concreteBlock(1150, floorY, 560, 200)}
    ${concreteBlock(1560, floorY, 300, 330)}
    ${stack(1010, floorY - 200, 250, [["#e7e1d3", "tee", 62], ["#8e8f8b", "sweat", 70], ["#1c1c1e", "hoodie", 92, "PALE HOURS"]])}
    ${stack(1300, floorY - 200, 250, [["#4b5136", "tee", 60], ["#e7e1d3", "tee", 60, "PALE HOURS", 6]])}
    ${beanie(1560, floorY - 330, 0.62, "#3a3f2c")}
    ${grain(w, h, 0.07)}`) }
}

/** A cast concrete block, its top face lit, standing on the floor at baseY. */
function concreteBlock(cx, baseY, bw, bh) {
  const c = id("cb"), g = id("cbg")
  return `<defs><clipPath id="${c}"><rect x="${cx - bw / 2}" y="${baseY - bh}" width="${bw}" height="${bh}"/></clipPath><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c9c3b8"/><stop offset="0.6" stop-color="#b9b2a6"/><stop offset="1" stop-color="#9e978b"/></linearGradient></defs>
    <rect x="${cx - bw / 2}" y="${baseY - bh}" width="${bw}" height="${bh}" fill="url(#${g})"/>${concrete(c, bw, bh, Math.round(cx) % 40)}
    <rect x="${cx - bw / 2}" y="${baseY - bh}" width="${bw}" height="4" fill="#e3ddd2" opacity="0.8"/>`
}

export function streetProduct(kind) {
  const w = 1000, h = 1250
  const ground = { hoodie: ["#e9e7e2", "#cfccc5"], tee: ["#dcd8cf", "#bfb9ad"], sweat: ["#e6e4df", "#cac7c0"], olive: ["#e4e2db", "#c8c5bc"], beanie: ["#e7e4dd", "#cbc6bc"], tote: ["#d9d4ca", "#b9b2a5"] }[kind]
  let art = ""
  const flat = (color, k, seed) => `${contact(500, 1000, 340, 26, 0.32, 20)}<g transform="rotate(-3 500 620)"><rect x="196" y="282" width="620" height="740" rx="30" fill="#1c1611" opacity="0.28" style="filter:blur(16px)"/>${folded(190, 260, 620, 740, color, { kind: k, seed })}</g>`
  if (kind === "hoodie") art = flat("#1c1c1e", "hoodie", 4)
  if (kind === "tee") art = flat("#e7e1d3", "tee", 5)
  if (kind === "sweat") art = flat("#8e8f8b", "sweat", 6)
  if (kind === "olive") art = flat("#4b5136", "tee", 7)
  if (kind === "beanie") art = `${contact(500, 862, 220, 22, 0.4, 16)}${beanie(500, 860, 1.25, "#3a3f2c")}`
  if (kind === "tote") art = `${contact(500, 1000, 250, 24, 0.4, 16)}${tote(500, 1000, 1.25)}`
  const shadowed = ""
  return { w, h, svg: doc(w, h, `${sweep(w, h, ground[0], ground[1], 0.62)}${shadowed}${art}${grain(w, h, 0.06)}`) }
}

/* ── Skincare: Ferne ────────────────────────────────────────────────────── */

/** A travertine block: pale stone, its pits and a soft light from the left. cx, the top face's centre; bw x bh. */
function plinth(cx, topY, bw, bh, tone = "#e4d9c6", round = false) {
  const clip = id("pl"), sh = id("pls")
  const body = round
    ? `<path d="M${cx - bw / 2} ${topY} L${cx - bw / 2} ${topY + bh} A${bw / 2} ${bw * 0.12} 0 0 0 ${cx + bw / 2} ${topY + bh} L${cx + bw / 2} ${topY}Z"/>`
    : `<rect x="${cx - bw / 2}" y="${topY}" width="${bw}" height="${bh}"/>`
  return `<defs><clipPath id="${clip}">${body}</clipPath><linearGradient id="${sh}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="0.55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.18"/></linearGradient></defs>
    <g clip-path="url(#${clip})"><rect x="${cx - bw / 2}" y="${topY - 10}" width="${bw}" height="${bh + bw}" fill="${tone}"/><rect x="${cx - bw / 2}" y="${topY - 10}" width="${bw}" height="${bh + bw}" fill="url(#${sh})"/>
    ${texture(clip, bw * 2, bh * 2, { freq: "0.02 0.25", amount: 0.3, seed: Math.round(cx) % 50 })}${texture(clip, bw * 2, bh * 2, { freq: "0.9", amount: 0.14, seed: 4 })}</g>
    ${round ? `<ellipse cx="${cx}" cy="${topY}" rx="${bw / 2}" ry="${bw * 0.12}" fill="${tint(tone, 0.22)}"/>` : `<rect x="${cx - bw / 2}" y="${topY - 2}" width="${bw}" height="4" fill="${tint(tone, 0.35)}"/>`}`
}

/** Ferne's label: cream paper, the name in Garamond, the product under it. */
function label(x, y, lw, lh, name, line2, { paper = "#f3ede2", ink = "#2f3a2f", size = 1 } = {}) {
  return `<rect x="${x}" y="${y}" width="${lw}" height="${lh}" fill="${paper}"/><rect x="${x}" y="${y}" width="${lw}" height="${lh}" fill="#000" opacity="0.03"/>
    <text x="${x + lw / 2}" y="${y + lh * 0.36}" text-anchor="middle" font-family="${GARAMOND}" font-size="${30 * size}" letter-spacing="${5 * size}" fill="${ink}">FERNE</text>
    <line x1="${x + lw * 0.35}" y1="${y + lh * 0.48}" x2="${x + lw * 0.65}" y2="${y + lh * 0.48}" stroke="${ink}" stroke-opacity="0.4" stroke-width="${1.2 * size}"/>
    <text x="${x + lw / 2}" y="${y + lh * 0.66}" text-anchor="middle" font-family="${SANS}" font-weight="500" font-size="${15 * size}" letter-spacing="${1.4 * size}" fill="${ink}">${name}</text>
    <text x="${x + lw / 2}" y="${y + lh * 0.84}" text-anchor="middle" font-family="${SANS}" font-size="${11.5 * size}" letter-spacing="${0.8 * size}" fill="${ink}" opacity="0.7">${line2}</text>`
}

/** Glass: a body colour, dark at the edges, a long highlight and a soft reflected edge. */
function glassGrad(color) {
  const g = id("gls")
  return { id: g, def: `<linearGradient id="${g}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${shade(color, 0.55)}"/><stop offset="0.14" stop-color="${shade(color, 0.15)}"/><stop offset="0.3" stop-color="${tint(color, 0.18)}"/><stop offset="0.5" stop-color="${color}"/><stop offset="0.82" stop-color="${shade(color, 0.3)}"/><stop offset="1" stop-color="${shade(color, 0.6)}"/></linearGradient>` }
}

function dropper(cx, base, s, { glass = "#8a5524", name = "Barrier serum", line2 = "Ceramides  ·  30 ml" } = {}) {
  const gg = glassGrad(glass), bulb = id("bulb"), hl = blur(2.5)
  const bw = 150 * s, bh = 230 * s, x = cx - bw / 2, top = base - bh
  return `<defs>${gg.def}${hl.def}<linearGradient id="${bulb}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1b1b1b"/><stop offset="0.35" stop-color="#4a4a48"/><stop offset="1" stop-color="#121212"/></linearGradient></defs>
    <path d="M${x} ${base - 14 * s} L${x} ${top + 40 * s} Q${x} ${top} ${x + 40 * s} ${top} L${x + bw - 40 * s} ${top} Q${x + bw} ${top} ${x + bw} ${top + 40 * s} L${x + bw} ${base - 14 * s} Q${x + bw} ${base} ${x + bw - 14 * s} ${base} L${x + 14 * s} ${base} Q${x} ${base} ${x} ${base - 14 * s}Z" fill="url(#${gg.id})"/>
    ${label(x + 14 * s, top + 70 * s, bw - 28 * s, 120 * s, name, line2, { size: s * 0.82 })}
    <rect x="${x + 20 * s}" y="${top + 12 * s}" width="${9 * s}" height="${bh - 34 * s}" rx="${4 * s}" fill="#fff" opacity="0.35" filter="url(#${hl.id})"/>
    <rect x="${cx - 34 * s}" y="${top - 26 * s}" width="${68 * s}" height="${30 * s}" rx="${4 * s}" fill="${shade(glass, 0.35)}"/>
    <rect x="${cx - 40 * s}" y="${top - 72 * s}" width="${80 * s}" height="${50 * s}" rx="${6 * s}" fill="#e9e4da"/><rect x="${cx - 40 * s}" y="${top - 72 * s}" width="${80 * s}" height="${50 * s}" rx="${6 * s}" fill="url(#${bulb})" opacity="0.12"/>
    <path d="M${cx - 30 * s} ${top - 70 * s} L${cx - 30 * s} ${top - 132 * s} Q${cx - 30 * s} ${top - 168 * s} ${cx} ${top - 170 * s} Q${cx + 30 * s} ${top - 168 * s} ${cx + 30 * s} ${top - 132 * s} L${cx + 30 * s} ${top - 70 * s}Z" fill="url(#${bulb})"/>`
}

function jar(cx, base, s, { lid = "#ece7dd", body = "#f6f3ec", name = "Night cream", line2 = "Oat and squalane  ·  50 ml" } = {}) {
  const jw = 220 * s, jh = 120 * s, x = cx - jw / 2, sh = id("jar"), lg = id("lid")
  return `<defs><linearGradient id="${sh}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${shade(body, 0.22)}"/><stop offset="0.3" stop-color="${tint(body, 0.4)}"/><stop offset="0.7" stop-color="${body}"/><stop offset="1" stop-color="${shade(body, 0.28)}"/></linearGradient>
    <linearGradient id="${lg}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${shade(lid, 0.25)}"/><stop offset="0.3" stop-color="${tint(lid, 0.35)}"/><stop offset="1" stop-color="${shade(lid, 0.3)}"/></linearGradient></defs>
    <path d="M${x} ${base - jh} L${x} ${base - 10 * s} Q${x} ${base} ${x + 12 * s} ${base + 2 * s} Q${cx} ${base + 14 * s} ${x + jw - 12 * s} ${base + 2 * s} Q${x + jw} ${base} ${x + jw} ${base - 10 * s} L${x + jw} ${base - jh}Z" fill="url(#${sh})"/>
    ${label(x + 30 * s, base - jh + 14 * s, jw - 60 * s, jh - 28 * s, name, line2, { size: s * 0.68 })}
    <rect x="${x - 4 * s}" y="${base - jh - 62 * s}" width="${jw + 8 * s}" height="${66 * s}" rx="${10 * s}" fill="url(#${lg})"/>
    ${Array.from({ length: 34 }, (_, i) => `<line x1="${x + 2 * s + i * (jw / 34)}" y1="${base - jh - 52 * s}" x2="${x + 2 * s + i * (jw / 34)}" y2="${base - jh - 6 * s}" stroke="#000" stroke-opacity="0.05" stroke-width="${2 * s}"/>`).join("")}
    <ellipse cx="${cx}" cy="${base - jh - 62 * s}" rx="${jw / 2 + 4 * s}" ry="${12 * s}" fill="${tint(lid, 0.3)}"/>`
}

function pump(cx, base, s, { body = "#dfe3d8", name = "Oat cleanser", line2 = "Gentle gel  ·  150 ml" } = {}) {
  const bw = 140 * s, bh = 330 * s, x = cx - bw / 2, top = base - bh, sh = id("pmp")
  return `<defs><linearGradient id="${sh}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${shade(body, 0.25)}"/><stop offset="0.28" stop-color="${tint(body, 0.35)}"/><stop offset="0.65" stop-color="${body}"/><stop offset="1" stop-color="${shade(body, 0.32)}"/></linearGradient></defs>
    <path d="M${x} ${base - 18 * s} L${x} ${top + 30 * s} Q${x} ${top} ${x + 30 * s} ${top} L${x + bw - 30 * s} ${top} Q${x + bw} ${top} ${x + bw} ${top + 30 * s} L${x + bw} ${base - 18 * s} Q${x + bw} ${base} ${x + bw - 18 * s} ${base} L${x + 18 * s} ${base} Q${x} ${base} ${x} ${base - 18 * s}Z" fill="url(#${sh})"/>
    ${label(x + 12 * s, top + 110 * s, bw - 24 * s, 130 * s, name, line2, { size: s * 0.78, paper: "transparent" })}
    <rect x="${cx - 30 * s}" y="${top - 30 * s}" width="${60 * s}" height="${32 * s}" rx="${5 * s}" fill="#2b2f2a"/>
    <rect x="${cx - 9 * s}" y="${top - 78 * s}" width="${18 * s}" height="${50 * s}" fill="#2b2f2a"/>
    <path d="M${cx - 24 * s} ${top - 100 * s} L${cx + 70 * s} ${top - 100 * s} Q${cx + 80 * s} ${top - 98 * s} ${cx + 80 * s} ${top - 88 * s} L${cx + 80 * s} ${top - 82 * s} L${cx - 24 * s} ${top - 76 * s}Z" fill="#2b2f2a"/>`
}

function tube(cx, base, s, { body = "#efe9dd", cap: capColor = "#b98a5a", name = "Daily SPF 30", line2 = "Mineral  ·  50 ml" } = {}) {
  const sh = id("tb")
  const d = `M${cx - 62 * s} ${base - 46 * s} L${cx - 86 * s} ${base - 330 * s} L${cx + 86 * s} ${base - 330 * s} L${cx + 62 * s} ${base - 46 * s}Z`
  return `<defs><linearGradient id="${sh}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${shade(body, 0.22)}"/><stop offset="0.3" stop-color="${tint(body, 0.4)}"/><stop offset="0.7" stop-color="${body}"/><stop offset="1" stop-color="${shade(body, 0.3)}"/></linearGradient></defs>
    <path d="${d}" fill="url(#${sh})"/>
    <rect x="${cx - 88 * s}" y="${base - 344 * s}" width="${176 * s}" height="${18 * s}" fill="${shade(body, 0.08)}"/>
    ${Array.from({ length: 16 }, (_, i) => `<line x1="${cx - 84 * s + i * 11 * s}" y1="${base - 343 * s}" x2="${cx - 84 * s + i * 11 * s}" y2="${base - 328 * s}" stroke="#000" stroke-opacity="0.08" stroke-width="${1.5 * s}"/>`).join("")}
    ${label(cx - 62 * s, base - 270 * s, 124 * s, 130 * s, name, line2, { size: s * 0.66, paper: "transparent" })}
    <rect x="${cx - 64 * s}" y="${base - 50 * s}" width="${128 * s}" height="${50 * s}" rx="${8 * s}" fill="${capColor}"/><rect x="${cx - 64 * s}" y="${base - 50 * s}" width="${128 * s}" height="${50 * s}" rx="${8 * s}" fill="url(#${sh})" opacity="0.35"/>`
}

/** Leaf shadows from a window plant, falling across the scene. */
function leafShadow(w, h, seed, { opacity = 0.16, x0 = 0, y0 = 0, scale = 1 } = {}) {
  const r = rng(seed), b = blur(7)
  const fronds = Array.from({ length: 3 }, (_, f) => {
    const sx = x0 + r() * w * 0.4, sy = y0 + r() * h * 0.2, ang = 20 + r() * 50
    const leaves = Array.from({ length: 14 }, (_, i) => {
      const t = i / 14, px = t * 520 * scale, side = i % 2 ? 1 : -1
      return `<ellipse cx="${px}" cy="${side * 46 * scale}" rx="${70 * scale * (1 - t * 0.5)}" ry="${16 * scale}" transform="rotate(${side * 38} ${px} ${side * 46 * scale})"/>`
    }).join("")
    return `<g transform="translate(${sx} ${sy}) rotate(${ang + f * 12})"><rect x="0" y="-3" width="${540 * scale}" height="6"/>${leaves}</g>`
  }).join("")
  return `<defs>${b.def}</defs><g fill="#1c2418" opacity="${opacity}" filter="url(#${b.id})">${fronds}</g>`
}

export function skinHero() {
  const w = 1400, h = 1000
  return { w, h, svg: doc(w, h, `${sweep(w, h, "#dfe3d6", "#c3c8b6", 0.6)}
    <rect y="${h * 0.7}" width="${w}" height="${h * 0.3}" fill="#b9bea9" opacity="0.5"/>
    ${leafShadow(w, h, 31, { opacity: 0.14, x0: 700, y0: -60, scale: 1.3 })}
    ${contact(470, 790, 230, 26, 0.3, 16)}${contact(860, 830, 300, 30, 0.3, 18)}
    ${plinth(470, 560, 380, 240, "#e2d6c2", true)}
    ${plinth(860, 690, 520, 150, "#d9ccb6")}
    ${contact(470, 562, 90, 12, 0.5, 8)}${dropper(470, 562, 1.15)}
    ${contact(745, 692, 120, 12, 0.45, 8)}${jar(745, 692, 1.05)}
    ${contact(990, 692, 80, 10, 0.45, 8)}${pump(990, 692, 0.95)}
    ${leafShadow(w, h, 33, { opacity: 0.1, x0: 300, y0: 200, scale: 1 })}
    ${grain(w, h, 0.06)}`) }
}

export function skinProduct(kind) {
  const w = 1000, h = 1250
  const grounds = { serum: ["#e6dccd", "#cbbda6"], cream: ["#e3e5dc", "#c7cbbb"], cleanser: ["#e9e3da", "#cfc6b8"], spf: ["#efe2d3", "#d6c2aa"], set: ["#e1e4da", "#c6cab9"] }
  const [top, floor] = grounds[kind]
  let art = ""
  if (kind === "serum") art = `${plinth(500, 880, 520, 380, "#e8dfcf", true)}${contact(500, 882, 110, 14, 0.5, 9)}${dropper(500, 882, 1.6)}`
  if (kind === "cream") art = `${plinth(500, 880, 620, 380, "#e3dccd")}${contact(500, 882, 170, 16, 0.5, 9)}${jar(500, 882, 1.6)}`
  if (kind === "cleanser") art = `${plinth(500, 900, 560, 360, "#e6ddcc", true)}${contact(500, 902, 120, 14, 0.5, 9)}${pump(500, 902, 1.45)}`
  if (kind === "spf") art = `${plinth(500, 900, 600, 360, "#eadfcd")}${contact(500, 902, 110, 14, 0.5, 9)}${tube(500, 902, 1.5)}`
  if (kind === "set") art = `${plinth(500, 860, 760, 400, "#e3d8c5")}${contact(330, 862, 80, 12, 0.5, 8)}${dropper(330, 862, 1.05)}${contact(560, 862, 110, 12, 0.5, 8)}${jar(560, 862, 0.95)}${contact(760, 862, 70, 10, 0.5, 8)}${tube(760, 862, 0.95)}`
  return { w, h, svg: doc(w, h, `${sweep(w, h, top, floor, 0.55)}${leafShadow(w, h, kind.length * 7, { opacity: 0.12, x0: 380, y0: -40, scale: 1 })}${art}${grain(w, h, 0.06)}`) }
}

/* ── A community post's pictures: glaze test tiles ───────────────────────── */

export function glazeTiles() {
  const w = 1200, h = 900
  const glazes = ["#5e7f86", "#9c5a3c", "#e8e0d0", "#3f4a3c", "#c38d5e", "#7a6a8c", "#8fa38a", "#d9c7a3", "#2f3d4a", "#b5653f", "#a7b8b5", "#6b4a33"]
  const r = rng(17)
  const tiles = glazes.map((g, i) => {
    const col = i % 4, row = Math.floor(i / 4)
    const x = 170 + col * 225 + (r() - 0.5) * 14, y = 150 + row * 210 + (r() - 0.5) * 12, rot = (r() - 0.5) * 5
    const gg = id("tile")
    return `<g transform="rotate(${rot} ${x + 90} ${y + 90})"><rect x="${x + 6}" y="${y + 12}" width="180" height="170" rx="10" fill="#000" opacity="0.2" style="filter:blur(8px)"/>
      <rect x="${x}" y="${y}" width="180" height="170" rx="10" fill="#d9c3a3"/>
      <defs><linearGradient id="${gg}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tint(g, 0.1)}"/><stop offset="0.7" stop-color="${g}"/><stop offset="1" stop-color="${shade(g, 0.35)}"/></linearGradient></defs>
      <path d="M${x} ${y + 10} Q${x} ${y} ${x + 10} ${y} L${x + 170} ${y} Q${x + 180} ${y} ${x + 180} ${y + 10} L${x + 180} ${y + 104 + r() * 20} Q${x + 140} ${y + 118} ${x + 90} ${y + 110 + r() * 14} Q${x + 40} ${y + 122} ${x} ${y + 108}Z" fill="url(#${gg})"/>
      <rect x="${x + 14}" y="${y + 14}" width="40" height="70" rx="6" fill="#fff" opacity="0.12"/>
      <text x="${x + 18}" y="${y + 154}" font-family="${SANS}" font-weight="600" font-size="18" fill="#5b4a37" opacity="0.8">${String.fromCharCode(65 + row)}${col + 1}</text></g>`
  }).join("")
  return { w, h, svg: doc(w, h, `<rect width="${w}" height="${h}" fill="#8a7a66"/><rect width="${w}" height="${h}" fill="#000" opacity="0.06"/>
    <filter id="wd"><feTurbulence type="fractalNoise" baseFrequency="0.004 0.08" numOctaves="3" seed="8"/><feColorMatrix values="0 0 0 0 0.4  0 0 0 0 0.3  0 0 0 0 0.2  0 0 0 0.5 0"/></filter><rect width="${w}" height="${h}" filter="url(#wd)"/>
    <radialGradient id="lamp" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#fff3dc" stop-opacity="0.25"/><stop offset="1" stop-color="#000" stop-opacity="0.3"/></radialGradient>
    ${tiles}<rect width="${w}" height="${h}" fill="url(#lamp)"/>${grain(w, h, 0.07)}`) }
}

/** The page behind three phones: a warm blur of window light, as in a real photograph of a desk. */
export function warmBackdrop() {
  const w = 1200, h = 750
  const b = blur(70)
  return { w, h, svg: doc(w, h, `<defs>${b.def}</defs><rect width="${w}" height="${h}" fill="#f1dcc4"/>
    <g filter="url(#${b.id})"><ellipse cx="180" cy="120" rx="320" ry="220" fill="#f6c58f"/><ellipse cx="1050" cy="640" rx="360" ry="240" fill="#f0a868"/><ellipse cx="1100" cy="90" rx="260" ry="180" fill="#f8e3c2"/><ellipse cx="120" cy="680" rx="300" ry="200" fill="#f3cfa5"/><ellipse cx="620" cy="380" rx="420" ry="260" fill="#f7e6d3"/><ellipse cx="860" cy="300" rx="200" ry="160" fill="#f5c79a" opacity="0.7"/></g>
    ${grain(w, h, 0.09, 0.75)}`) }
}

/* ── Digital products: Halcyon Presets ──────────────────────────────────── */

/** A landscape photograph, graded: sky, sun, hills, water. */
function landscape(x, y, w, h, grade, seed) {
  /*
    Round AD5: closer to a photograph. Five ridges fading into the haze with
    distance, mist lying in each valley, a tree line on the nearest, the
    ridges' own rock and grass texture, and a sea with the sun's track and
    a sheen that breaks into lines.
  */
  const r = rng(seed)
  const sky = id("sky"), sun = id("sun"), mist = id("mist"), sea = id("sea"), clip = `c${sky}`, mb = blur(Math.max(4, h * 0.012))
  const sunX = x + w * (0.3 + r() * 0.4)
  const ridge = (base, amp, wob, n = 90) => {
    const p1 = r() * 6.28, p2 = r() * 6.28, p3 = r() * 6.28, f1 = 1 + r() * 1.3, f2 = 3 + r() * 3, f3 = 11 + r() * 9
    let d = ""
    const ys = []
    for (let k = 0; k <= n; k++) {
      const t = k / n
      const yy = base - amp * (1 + Math.cos(t * 6.28 * f1 + p1)) / 2 - amp * 0.3 * (1 + Math.cos(t * 6.28 * f2 + p2)) / 2 - wob * (1 + Math.cos(t * 6.28 * f3 + p3)) / 2 - wob * 0.5 * r()
      ys.push(yy)
      d += `${k === 0 ? "M" : "L"}${(x + w * t).toFixed(1)} ${yy.toFixed(1)} `
    }
    /* The ridge's height at a point across, so trees stand on it. */
    const at = (t) => ys[Math.min(n, Math.max(0, Math.round(t * n)))]
    return { d: `${d} L${x + w} ${y + h} L${x} ${y + h}Z`, at }
  }
  const layers = [0.5, 0.56, 0.63, 0.7, 0.77].map((at, i) => {
    const base = y + h * at
    const tone = mix(mix(grade.low, grade.hill, 0.35 + i * 0.12), grade.near, Math.max(0, (i - 1) / 3.2))
    const rg = ridge(base, h * (0.06 - i * 0.006), h * (0.004 + i * 0.003))
    const d = rg.d
    const lc = id("lc")
    const trees = i >= 3 ? Array.from({ length: i === 4 ? 90 : 50 }, () => {
      const t = r(), tx = x + t * w, th = h * (i === 4 ? 0.014 + r() * 0.026 : 0.008 + r() * 0.012)
      return `<path d="M${tx} ${rg.at(t) + th * 0.25 - th} l${th * 0.26} ${th} l${-th * 0.52} 0Z"/>`
    }).join("") : ""
    return `<defs><clipPath id="${lc}"><path d="${d}"/></clipPath></defs><path d="${d}" fill="${tone}"/>
      ${i >= 2 ? texture(lc, w, h, { freq: `${0.004 + i * 0.002} ${0.03 + i * 0.01}`, amount: 0.12 + i * 0.04, seed: seed + i }) : ""}
      ${trees ? `<g fill="${shade(tone, 0.25)}" clip-path="url(#${clip})">${trees}</g>` : ""}
      <rect x="${x}" y="${base - h * 0.035}" width="${w}" height="${h * 0.06}" fill="url(#${mist})" opacity="${0.5 - i * 0.07}" filter="url(#${mb.id})"/>`
  }).join("")
  const sheen = Array.from({ length: 46 }, () => {
    const sy = y + h * (0.83 + r() * 0.17), len = w * (0.02 + r() * 0.12), sx = sunX - len / 2 + (r() - 0.5) * w * 0.25 * ((sy - y - h * 0.83) / (h * 0.17) + 0.3)
    return `<rect x="${sx}" y="${sy}" width="${len}" height="${Math.max(1, h * 0.002)}" fill="${grade.sun}" opacity="${0.25 + r() * 0.4}"/>`
  }).join("")
  return `<defs>${mb.def}<linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${grade.top}"/><stop offset="0.65" stop-color="${grade.low}"/></linearGradient>
    <radialGradient id="${sun}" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${grade.sun}"/><stop offset="0.35" stop-color="${grade.sun}" stop-opacity="0.55"/><stop offset="1" stop-color="${grade.sun}" stop-opacity="0"/></radialGradient>
    <linearGradient id="${mist}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${grade.low}" stop-opacity="0"/><stop offset="0.5" stop-color="${grade.low}"/><stop offset="1" stop-color="${grade.low}" stop-opacity="0"/></linearGradient>
    <linearGradient id="${sea}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(grade.water, grade.low, 0.35)}"/><stop offset="1" stop-color="${shade(grade.water, 0.25)}"/></linearGradient>
    <clipPath id="${clip}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath></defs>
    <g clip-path="url(#${clip})"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${sky})"/>
    <circle cx="${sunX}" cy="${y + h * 0.4}" r="${h * 0.34}" fill="url(#${sun})"/>
    <circle cx="${sunX}" cy="${y + h * 0.4}" r="${h * 0.035}" fill="${tint(grade.sun, 0.4)}" opacity="0.9"/>
    ${layers}
    <rect x="${x}" y="${y + h * 0.83}" width="${w}" height="${h * 0.17}" fill="url(#${sea})"/>
    <rect x="${sunX - w * 0.08}" y="${y + h * 0.83}" width="${w * 0.16}" height="${h * 0.17}" fill="${grade.sun}" opacity="0.18" filter="url(#${mb.id})"/>
    ${sheen}</g>`
}

const GRADES = {
  coastal: { top: "#9cc3cf", low: "#f1d9b8", sun: "#fff3d6", hill: "#7d9a91", near: "#3e5752", water: "#6f9aa0" },
  golden: { top: "#e9a86b", low: "#f6dcae", sun: "#fff1c2", hill: "#a8735a", near: "#5a3a2c", water: "#c48a62" },
  nordic: { top: "#c9d3d6", low: "#eef0ec", sun: "#ffffff", hill: "#8c9a9b", near: "#4b5658", water: "#a9b8bb" },
  moody: { top: "#3d4a52", low: "#8b8f86", sun: "#e8d9b0", hill: "#2f3b38", near: "#1a2221", water: "#56645f" },
}

export function presetCover(grade, title, sub) {
  const w = 1000, h = 1000
  const g = GRADES[grade]
  return { w, h, svg: doc(w, h, `<rect width="${w}" height="${h}" fill="#111"/>
    ${landscape(0, 0, w, h, g, grade.length * 7)}
    <rect width="${w}" height="${h}" fill="#000" opacity="0.18"/>
    <rect x="60" y="60" width="${w - 120}" height="${h - 120}" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="2"/>
    <text x="100" y="${h - 190}" font-family="${SANS}" font-weight="800" font-size="92" letter-spacing="-2" fill="#fff">${title}</text>
    <text x="104" y="${h - 130}" font-family="${SANS}" font-weight="500" font-size="32" fill="#fff" opacity="0.85">${sub}</text>
    <text x="100" y="130" font-family="${SANS}" font-weight="700" font-size="24" letter-spacing="6" fill="#fff" opacity="0.9">HALCYON</text>
    ${grain(w, h, 0.1, 0.95)}`) }
}

/** Before and after: the same scene, flat on the left, graded on the right. */
export function presetCompare() {
  const w = 1000, h = 1000
  const flat = { top: "#b7bcbe", low: "#d9d9d4", sun: "#f2f2ee", hill: "#8f9590", near: "#5d625e", water: "#9fa5a3" }
  return { w, h, svg: doc(w, h, `${landscape(0, 0, w, h, flat, 77)}
    <clipPath id="half"><rect x="500" y="0" width="500" height="${h}"/></clipPath><g clip-path="url(#half)">${landscape(0, 0, w, h, GRADES.coastal, 77)}</g>
    <rect x="497" y="0" width="6" height="${h}" fill="#fff"/><circle cx="500" cy="500" r="34" fill="#fff"/><path d="M486 500 l-10 0 M514 500 l10 0 M478 492 l-8 8 8 8 M522 492 l8 8 -8 8" stroke="#222" stroke-width="4" fill="none" stroke-linecap="round"/>
    <rect x="40" y="40" width="120" height="44" rx="22" fill="#000" opacity="0.45"/><text x="100" y="69" text-anchor="middle" font-family="${SANS}" font-weight="600" font-size="20" fill="#fff">Before</text>
    <rect x="840" y="40" width="120" height="44" rx="22" fill="#000" opacity="0.45"/><text x="900" y="69" text-anchor="middle" font-family="${SANS}" font-weight="600" font-size="20" fill="#fff">After</text>
    ${grain(w, h, 0.08, 0.95)}`) }
}

/** A creator page's cover: one of the photographer's own landscapes, wide. */
export function landscapeCover() {
  const w = 1800, h = 640
  return { w, h, svg: doc(w, h, `${landscape(0, -h * 0.25, w, h * 1.3, GRADES.golden, 41)}${grain(w, h, 0.08, 0.9)}`) }
}

/** A planner template: the product as it looks open, on a soft ground. */
export function plannerCover() {
  const w = 1000, h = 1000
  const rows = ["Plan the week", "Edit Lisbon set", "Client calls", "Post to the shop", "Invoice March"]
  return { w, h, svg: doc(w, h, `<rect width="${w}" height="${h}" fill="#e7e4dc"/>
    <rect x="120" y="150" width="760" height="700" rx="22" fill="#000" opacity="0.12" style="filter:blur(18px)" transform="translate(0 18)"/>
    <rect x="120" y="150" width="760" height="700" rx="22" fill="#fcfbf8"/>
    <rect x="120" y="150" width="760" height="56" rx="22" fill="#f1efe9"/><rect x="120" y="190" width="760" height="16" fill="#f1efe9"/>
    <circle cx="156" cy="178" r="8" fill="#e06c5b"/><circle cx="182" cy="178" r="8" fill="#e8b84f"/><circle cx="208" cy="178" r="8" fill="#76b36a"/>
    <text x="170" y="290" font-family="${SANS}" font-weight="800" font-size="48" fill="#1d1d1f">Studio OS</text>
    <text x="172" y="330" font-family="${SANS}" font-weight="500" font-size="22" fill="#77736c">Week 12  ·  March</text>
    ${["Mon", "Tue", "Wed", "Thu", "Fri"].map((d, i) => `<rect x="${170 + i * 136}" y="370" width="120" height="92" rx="12" fill="${i === 2 ? "#1d1d1f" : "#f1efe9"}"/><text x="${186 + i * 136}" y="404" font-family="${SANS}" font-weight="700" font-size="20" fill="${i === 2 ? "#fff" : "#1d1d1f"}">${d}</text><text x="${186 + i * 136}" y="440" font-family="${SANS}" font-weight="500" font-size="18" fill="${i === 2 ? "#cfcfcf" : "#8a857c"}">${[3, 5, 2, 4, 1][i]} tasks</text>`).join("")}
    ${rows.map((t, i) => `<rect x="170" y="${500 + i * 62}" width="26" height="26" rx="7" fill="${i < 2 ? "#1d1d1f" : "none"}" stroke="#1d1d1f" stroke-width="2.5"/>${i < 2 ? `<path d="M176 ${513 + i * 62} l6 6 10 -12" stroke="#fff" stroke-width="3" fill="none"/>` : ""}<text x="214" y="${521 + i * 62}" font-family="${SANS}" font-weight="500" font-size="24" fill="${i < 2 ? "#9a958c" : "#1d1d1f"}" ${i < 2 ? 'text-decoration="line-through"' : ""}>${t}</text><rect x="660" y="${504 + i * 62}" width="120" height="22" rx="11" fill="${["#e9e1f7", "#dcefe2", "#f7e6d5", "#dde8f6", "#f3dede"][i]}"/>`).join("")}`) }
}

/* ── A course: Wheel & Kiln ─────────────────────────────────────────────── */

/** A thrown vase, glazed, centred on cx with its foot at baseY. */
function vase(cx, baseY, s, glaze, { lip = true } = {}) {
  const g = id("glz"), hl = id("hl")
  const d = `M${cx - s * 0.22} ${baseY} Q${cx - s * 0.5} ${baseY - s * 0.35} ${cx - s * 0.36} ${baseY - s * 0.7} Q${cx - s * 0.18} ${baseY - s * 0.95} ${cx - s * 0.16} ${baseY - s * 1.12} L${cx + s * 0.16} ${baseY - s * 1.12} Q${cx + s * 0.18} ${baseY - s * 0.95} ${cx + s * 0.36} ${baseY - s * 0.7} Q${cx + s * 0.5} ${baseY - s * 0.35} ${cx + s * 0.22} ${baseY}Z`
  return `<defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${shade(glaze, 0.45)}"/><stop offset="0.32" stop-color="${tint(glaze, 0.12)}"/><stop offset="0.55" stop-color="${glaze}"/><stop offset="1" stop-color="${shade(glaze, 0.5)}"/></linearGradient>
    <linearGradient id="${hl}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
    <path d="${d}" fill="url(#${g})"/>
    <path d="M${cx - s * 0.22} ${baseY} Q${cx - s * 0.5} ${baseY - s * 0.35} ${cx - s * 0.36} ${baseY - s * 0.6} L${cx + s * 0.36} ${baseY - s * 0.6} Q${cx + s * 0.5} ${baseY - s * 0.35} ${cx + s * 0.22} ${baseY}Z" fill="#d8c3a5" opacity="0.0"/>
    <path d="M${cx - s * 0.2} ${baseY - s * 0.15} Q${cx - s * 0.3} ${baseY - s * 0.5} ${cx - s * 0.24} ${baseY - s * 0.75}" stroke="url(#${hl})" stroke-width="${s * 0.05}" fill="none" stroke-linecap="round"/>
    ${lip ? `<ellipse cx="${cx}" cy="${baseY - s * 1.12}" rx="${s * 0.16}" ry="${s * 0.035}" fill="${shade(glaze, 0.6)}"/>` : ""}
    <path d="M${cx - s * 0.22} ${baseY} Q${cx} ${baseY + s * 0.025} ${cx + s * 0.22} ${baseY}" stroke="#c9b08f" stroke-width="${s * 0.04}" fill="none"/>`
}

export function courseHero() {
  const w = 1400, h = 1000
  return { w, h, svg: doc(w, h, `${sweep(w, h, "#e9e2d6", "#c9bba5", 0.66)}
    <rect y="680" width="${w}" height="320" fill="#b9a68b" opacity="0.35"/>
    ${contact(470, 760, 150, 22, 0.45, 14)}${contact(720, 770, 190, 26, 0.45, 16)}${contact(960, 760, 130, 20, 0.45, 12)}
    ${vase(470, 760, 330, "#5e7f86")}
    ${vase(720, 770, 470, "#e8e0d0")}
    ${vase(960, 760, 270, "#9c5a3c")}
    ${grain(w, h, 0.06)}`) }
}

export function courseLesson(i) {
  const w = 1000, h = 700
  const glazes = ["#5e7f86", "#9c5a3c", "#e8e0d0", "#3f4a3c", "#c38d5e", "#7a6a8c"]
  const bg = ["#e5ddd0", "#dfe3df", "#ece4d8", "#e4dfd6", "#e9e1d5", "#e3dee4"][i % 6]
  return { w, h, svg: doc(w, h, `${sweep(w, h, tint(bg, 0.2), shade(bg, 0.15), 0.65)}
    ${contact(500, 590, 160, 24, 0.45, 14)}
    ${vase(500, 590, 420 - (i % 3) * 40, glazes[i % glazes.length])}
    ${grain(w, h, 0.06)}`) }
}

/** The link in bio's picture: the maker's own work, not a face. */
export function bioAvatar() {
  const w = 600, h = 600
  return { w, h, svg: doc(w, h, `${sweep(w, h, "#e8d8c3", "#c9ae8c", 0.65)}${contact(300, 500, 110, 18, 0.45, 12)}${vase(300, 500, 330, "#5e7f86")}${grain(w, h, 0.06)}`) }
}

/*
  THE OTHER TWO LINK IN BIO PICTURES. No faces anywhere in the hero: a drawn
  face is either a cartoon or uncanny, and a photograph of a real person is
  not ours to use. A stylist's page shows a vase of dried stems from one of
  her rooms; a photographer's shows one of his own landscapes.
*/
export function stemsAvatar() {
  const w = 600, h = 600
  const r = rng(29)
  const stems = Array.from({ length: 9 }, (_, i) => {
    const x0 = 300 + (r() - 0.5) * 30, ang = -42 + i * 10 + (r() - 0.5) * 6, len = 250 + r() * 90
    const x1 = x0 + Math.sin((ang * Math.PI) / 180) * len, y1 = 330 - Math.cos((ang * Math.PI) / 180) * len
    const head = Array.from({ length: 6 }, (_, k) => `<ellipse cx="${x1 + (r() - 0.5) * 18}" cy="${y1 + k * 9}" rx="${7 - k * 0.6}" ry="${3.4}" fill="#cfae7d" transform="rotate(${ang} ${x1} ${y1 + k * 9})"/>`).join("")
    return `<path d="M${x0} 330 Q${(x0 + x1) / 2 + (r() - 0.5) * 30} ${(330 + y1) / 2} ${x1} ${y1}" stroke="#a88a5c" stroke-width="3" fill="none"/>${head}`
  }).join("")
  return { w, h, svg: doc(w, h, `${sweep(w, h, "#efe4d4", "#cdb69a", 0.6)}<rect x="0" y="0" width="160" height="${h}" fill="#fff" opacity="0.18" style="filter:blur(30px)"/>
    ${stems}${contact(300, 540, 100, 16, 0.42, 12)}${vase(300, 540, 280, "#d9d0c0")}${grain(w, h, 0.07)}`) }
}

export function landscapeAvatar() {
  const w = 600, h = 600
  return { w, h, svg: doc(w, h, `${landscape(-300, -40, 1200, 700, GRADES.moody, 53)}${grain(w, h, 0.08, 0.9)}`) }
}

export function mugs() {
  const w = 1000, h = 1000
  const mug = (cx, base, glaze) => `<rect x="${cx - 110}" y="${base - 230}" width="220" height="230" rx="34" fill="${glaze}"/><rect x="${cx - 110}" y="${base - 230}" width="220" height="230" rx="34" fill="url(#mugsh)"/><path d="M${cx + 108} ${base - 180} q90 10 70 90 q-12 50 -70 50" stroke="${glaze}" stroke-width="30" fill="none"/><ellipse cx="${cx}" cy="${base - 228}" rx="108" ry="18" fill="${shade(glaze, 0.5)}"/>`
  return { w, h, svg: doc(w, h, `${sweep(w, h, "#efe7dc", "#d2c3ae", 0.62)}
    <defs><linearGradient id="mugsh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.35"/><stop offset="0.3" stop-color="#fff" stop-opacity="0.12"/><stop offset="1" stop-color="#000" stop-opacity="0.4"/></linearGradient></defs>
    ${contact(330, 760, 150, 22, 0.42, 14)}${contact(640, 780, 150, 22, 0.42, 14)}
    ${mug(330, 760, "#5e7f86")}${mug(640, 780, "#e3dccd")}
    ${grain(w, h, 0.06)}`) }
}

/** Every picture the demo stores use, by file name. */
export const DEMO_ART = {
  "street-hero": streetHero, "street-hoodie": () => streetProduct("hoodie"), "street-tee": () => streetProduct("tee"), "street-sweat": () => streetProduct("sweat"),
  "street-olive": () => streetProduct("olive"), "street-beanie": () => streetProduct("beanie"), "street-tote": () => streetProduct("tote"),
  "skin-hero": skinHero, "skin-serum": () => skinProduct("serum"), "skin-cream": () => skinProduct("cream"), "skin-cleanser": () => skinProduct("cleanser"), "skin-spf": () => skinProduct("spf"), "skin-set": () => skinProduct("set"),
  "avatar-stems": stemsAvatar, "avatar-landscape": landscapeAvatar,
  "glaze-tiles": glazeTiles, "warm-backdrop": warmBackdrop,
  "preset-harbour": () => presetCover("coastal", "Harbour", "12 Lightroom presets"), "preset-late-summer": () => presetCover("golden", "Late Summer", "10 Lightroom presets"),
  "preset-overcast": () => presetCover("nordic", "Overcast", "8 Lightroom presets"), "preset-tungsten": () => presetCover("moody", "Tungsten Nights", "10 presets and 3 LUTs"),
  "preset-compare": presetCompare, "landscape-cover": landscapeCover,
  "course-hero": courseHero, "lesson-0": () => courseLesson(0), "lesson-1": () => courseLesson(1), "lesson-2": () => courseLesson(2), "lesson-3": () => courseLesson(3), "lesson-4": () => courseLesson(4), "lesson-5": () => courseLesson(5),
  "bio-avatar": bioAvatar, "mugs": mugs,
}
