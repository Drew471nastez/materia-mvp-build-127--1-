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

/* ── A watch: Maison Verlaine ───────────────────────────────────────────── */

/** The watch seen from above, centred at (cx, cy), case radius r. */
function watch(cx, cy, r, { dial = "#1f4a3a", strap = "#2d4a35", lume = "#d9c48f", straps = true } = {}) {
  const steel = id("steel"), bez = id("bez"), dg = id("dial"), sh = id("glass"), st = id("strap"), gold = id("gold"), gl = id("guil")
  const lug = (sx, sy) => `<path d="M${cx + sx * r * 0.52} ${cy + sy * r * 0.78} L${cx + sx * r * 0.5} ${cy + sy * r * 1.22} Q${cx + sx * r * 0.5} ${cy + sy * r * 1.3} ${cx + sx * r * 0.42} ${cy + sy * r * 1.3} L${cx + sx * r * 0.3} ${cy + sy * r * 1.3} L${cx + sx * r * 0.32} ${cy + sy * r * 0.86}Z" fill="url(#${steel})"/>`
  const strapPiece = (sy) => {
    const y0 = cy + sy * r * 1.18, y1 = cy + sy * r * 3.4
    const stitches = Array.from({ length: 9 }, (_, i) => { const y = y0 + (y1 - y0) * (i + 0.5) / 9; return `<line x1="${cx - r * 0.5}" y1="${y}" x2="${cx - r * 0.5}" y2="${y + sy * r * 0.12}" /><line x1="${cx + r * 0.5}" y1="${y}" x2="${cx + r * 0.5}" y2="${y + sy * r * 0.12}" />` }).join("")
    return `<path d="M${cx - r * 0.6} ${y0} L${cx - r * 0.58} ${y1} L${cx + r * 0.58} ${y1} L${cx + r * 0.6} ${y0}Z" fill="url(#${st})"/>` +
      `<g stroke="${tint(strap, 0.45)}" stroke-width="${r * 0.012}" stroke-linecap="round" opacity="0.8">${stitches}</g>`
  }
  const indices = Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6
    const long = i % 3 === 0
    const r0 = r * (long ? 0.6 : 0.66), r1 = r * 0.76
    const x0 = cx + Math.sin(a) * r0, y0 = cy - Math.cos(a) * r0, x1 = cx + Math.sin(a) * r1, y1 = cy - Math.cos(a) * r1
    return `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="url(#${gold})" stroke-width="${r * (long ? 0.05 : 0.03)}" stroke-linecap="round"/>`
  }).join("")
  const minutes = Array.from({ length: 60 }, (_, i) => {
    const a = (i * Math.PI) / 30
    return `<line x1="${cx + Math.sin(a) * r * 0.8}" y1="${cy - Math.cos(a) * r * 0.8}" x2="${cx + Math.sin(a) * r * 0.83}" y2="${cy - Math.cos(a) * r * 0.83}" stroke="${lume}" stroke-width="${r * 0.008}" opacity="0.7"/>`
  }).join("")
  const hand = (deg, len, wid) => `<g transform="rotate(${deg} ${cx} ${cy})"><path d="M${cx} ${cy - r * len} L${cx + r * wid} ${cy - r * len * 0.3} L${cx} ${cy + r * 0.12} L${cx - r * wid} ${cy - r * len * 0.3}Z" fill="url(#${gold})"/><path d="M${cx} ${cy - r * len} L${cx + r * wid} ${cy - r * len * 0.3} L${cx} ${cy + r * 0.12}Z" fill="#fff" opacity="0.18"/></g>`
  return `<defs>
    <linearGradient id="${steel}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f4f2"/><stop offset="0.35" stop-color="#b9bcbf"/><stop offset="0.55" stop-color="#eef0f1"/><stop offset="0.8" stop-color="#8d9094"/><stop offset="1" stop-color="#d6d8da"/></linearGradient>
    <linearGradient id="${bez}" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#9ea1a5"/><stop offset="1" stop-color="#e9eaeb"/></linearGradient>
    <radialGradient id="${dg}" cx="0.42" cy="0.38" r="0.75"><stop offset="0" stop-color="${tint(dial, 0.18)}"/><stop offset="0.6" stop-color="${dial}"/><stop offset="1" stop-color="${shade(dial, 0.45)}"/></radialGradient>
    <radialGradient id="${gl}" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="0.05"/></radialGradient>
    <linearGradient id="${gold}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6e7b8"/><stop offset="0.5" stop-color="#c9a65a"/><stop offset="1" stop-color="#8f6f2e"/></linearGradient>
    <linearGradient id="${st}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${shade(strap, 0.35)}"/><stop offset="0.25" stop-color="${strap}"/><stop offset="0.6" stop-color="${tint(strap, 0.12)}"/><stop offset="1" stop-color="${shade(strap, 0.4)}"/></linearGradient>
    <linearGradient id="${sh}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.38"/><stop offset="0.45" stop-color="#fff" stop-opacity="0.04"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>
  ${straps ? strapPiece(-1) + strapPiece(1) : ""}
  ${lug(-1, -1)}${lug(1, -1)}${lug(-1, 1)}${lug(1, 1)}
  <rect x="${cx + r * 0.98}" y="${cy - r * 0.11}" width="${r * 0.16}" height="${r * 0.22}" rx="${r * 0.03}" fill="url(#${steel})"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${steel})"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.93}" fill="url(#${bez})"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.86}" fill="url(#${dg})"/>
  ${Array.from({ length: 18 }, (_, i) => `<circle cx="${cx}" cy="${cy}" r="${r * (0.12 + i * 0.03)}" fill="none" stroke="#fff" stroke-opacity="0.035" stroke-width="${r * 0.006}"/>`).join("")}
  ${minutes}${indices}
  <text x="${cx}" y="${cy - r * 0.32}" text-anchor="middle" font-family="${SERIF}" font-size="${r * 0.13}" letter-spacing="${r * 0.025}" fill="${lume}">VERLAINE</text>
  <text x="${cx}" y="${cy - r * 0.22}" text-anchor="middle" font-family="${SANS}" font-size="${r * 0.05}" letter-spacing="${r * 0.02}" fill="${lume}" opacity="0.8">GENÈVE</text>
  <circle cx="${cx}" cy="${cy + r * 0.38}" r="${r * 0.17}" fill="${shade(dial, 0.2)}" stroke="${lume}" stroke-opacity="0.35" stroke-width="${r * 0.008}"/>
  <line x1="${cx}" y1="${cy + r * 0.38}" x2="${cx + r * 0.1}" y2="${cy + r * 0.3}" stroke="${lume}" stroke-width="${r * 0.012}"/>
  ${hand(305, 0.5, 0.045)}${hand(62, 0.72, 0.035)}
  <line x1="${cx}" y1="${cy + r * 0.15}" x2="${cx}" y2="${cy - r * 0.78}" stroke="#c94b3b" stroke-width="${r * 0.01}" transform="rotate(160 ${cx} ${cy})"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.035}" fill="url(#${gold})"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.86}" fill="url(#${gl})"/>
  <path d="M${cx - r * 0.8} ${cy - r * 0.25} A${r * 0.86} ${r * 0.86} 0 0 1 ${cx + r * 0.3} ${cy - r * 0.8} Q${cx - r * 0.2} ${cy - r * 0.55} ${cx - r * 0.8} ${cy - r * 0.25}Z" fill="url(#${sh})"/>`
}

export function watchHero() {
  const w = 1200, h = 1200
  const linen = id("linen")
  return { w, h, svg: doc(w, h, `${sweep(w, h, "#f3eee4", "#ddd3c2", 0.5)}
    <filter id="${linen}"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.9" numOctaves="2" seed="3"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0.08"/></feComponentTransfer></filter><rect width="${w}" height="${h}" filter="url(#${linen})"/>
    ${contact(610, 640, 330, 520, 0.28, 40)}
    <g transform="rotate(-8 600 600)">${watch(600, 600, 230)}</g>
    ${grain(w, h, 0.06)}`) }
}

export function watchStone() {
  const w = 1200, h = 1200
  const stone = id("stone")
  return { w, h, svg: doc(w, h, `<rect width="${w}" height="${h}" fill="#2a2b29"/>
    <filter id="${stone}"><feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves="4" seed="11"/><feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.35  0 0 0 0 0.33  0 0 0 0.9 0"/></filter><rect width="${w}" height="${h}" filter="url(#${stone})" opacity="0.6"/>
    <radialGradient id="spot" cx="0.45" cy="0.4" r="0.6"><stop offset="0" stop-color="#fff" stop-opacity="0.16"/><stop offset="1" stop-color="#000" stop-opacity="0.4"/></radialGradient><rect width="${w}" height="${h}" fill="url(#spot)"/>
    ${contact(640, 660, 300, 480, 0.6, 34)}
    <g transform="rotate(24 600 600)">${watch(600, 600, 250, { dial: "#173b30" })}</g>
    ${grain(w, h, 0.08)}`) }
}

export function watchDial() {
  const w = 1200, h = 1200
  return { w, h, svg: doc(w, h, `<rect width="${w}" height="${h}" fill="#0f2a22"/>
    <g transform="translate(-700 -560) scale(2.3)">${watch(600, 600, 300, { dial: "#1f4a3a" })}</g>
    <radialGradient id="dv" cx="0.5" cy="0.5" r="0.7"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/></radialGradient><rect width="${w}" height="${h}" fill="url(#dv)"/>
    ${grain(w, h, 0.07)}`) }
}

/** The presentation box: walnut, the watch on its cushion. */
export function watchBox() {
  const w = 1200, h = 1200
  const wood = id("wood")
  return { w, h, svg: doc(w, h, `${sweep(w, h, "#efe8dc", "#d4c8b4", 0.45)}
    ${contact(600, 900, 470, 70, 0.4, 26)}
    <filter id="${wood}"><feTurbulence type="fractalNoise" baseFrequency="0.004 0.12" numOctaves="3" seed="5"/><feColorMatrix values="0 0 0 0 0.36  0 0 0 0 0.21  0 0 0 0 0.12  0 0 0 0.55 0"/></filter>
    <rect x="160" y="260" width="880" height="230" rx="18" fill="#5a3826"/><rect x="160" y="260" width="880" height="230" rx="18" filter="url(#${wood})"/>
    <rect x="180" y="280" width="840" height="190" rx="10" fill="#e8dcc6"/>
    <rect x="160" y="480" width="880" height="420" rx="18" fill="#6b4430"/><rect x="160" y="480" width="880" height="420" rx="18" filter="url(#${wood})"/>
    <rect x="200" y="510" width="800" height="350" rx="12" fill="#efe6d4"/>
    <rect x="200" y="510" width="800" height="40" rx="12" fill="#000" opacity="0.06"/>
    <ellipse cx="600" cy="690" rx="190" ry="130" fill="#e3d6bd"/>
    <g transform="translate(600 690) scale(0.62) translate(-600 -600)">${watch(600, 600, 210, { straps: false })}</g>
    <text x="600" y="395" text-anchor="middle" font-family="${SERIF}" font-size="46" letter-spacing="14" fill="#7a5c2e">MAISON VERLAINE</text>
    ${grain(w, h, 0.06)}`) }
}

/* ── Pet food: Marrow & Oat ─────────────────────────────────────────────── */

/** A stand-up kraft pouch centred at cx, its base at baseY, with a coloured label. */
function pouch(cx, baseY, pw, ph, { band = "#b5532f", recipe = "Chicken & Pumpkin", note = "Air-dried  ·  1 kg" } = {}) {
  const k = id("kraft"), cur = id("curve"), tex = id("ktex")
  const x0 = cx - pw / 2, x1 = cx + pw / 2, y0 = baseY - ph
  const shape = `M${x0 + pw * 0.04} ${y0} L${x1 - pw * 0.04} ${y0} Q${x1} ${y0 + ph * 0.4} ${x1 + pw * 0.02} ${baseY - ph * 0.04} Q${cx} ${baseY + ph * 0.025} ${x0 - pw * 0.02} ${baseY - ph * 0.04} Q${x0} ${y0 + ph * 0.4} ${x0 + pw * 0.04} ${y0}Z`
  return `<defs>
    <linearGradient id="${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfa877"/><stop offset="1" stop-color="#b98d58"/></linearGradient>
    <linearGradient id="${cur}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.32"/><stop offset="0.18" stop-color="#000" stop-opacity="0.04"/><stop offset="0.42" stop-color="#fff" stop-opacity="0.16"/><stop offset="0.7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/></linearGradient>
    <filter id="${tex}"><feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="9"/><feColorMatrix values="0 0 0 0 0.3  0 0 0 0 0.2  0 0 0 0 0.1  0 0 0 0.35 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
  </defs>
  <path d="${shape}" fill="url(#${k})"/>
  <path d="${shape}" fill="#fff" filter="url(#${tex})"/>
  <rect x="${x0 + pw * 0.06}" y="${y0 + ph * 0.06}" width="${pw * 0.88}" height="${ph * 0.012}" fill="#000" opacity="0.12"/>
  <rect x="${x0 + pw * 0.06}" y="${y0 + ph * 0.075}" width="${pw * 0.88}" height="${ph * 0.006}" fill="#fff" opacity="0.18"/>
  <rect x="${x0 + pw * 0.1}" y="${y0 + ph * 0.3}" width="${pw * 0.8}" height="${ph * 0.42}" rx="${pw * 0.03}" fill="#f6efe2"/>
  <rect x="${x0 + pw * 0.1}" y="${y0 + ph * 0.3}" width="${pw * 0.8}" height="${ph * 0.12}" rx="${pw * 0.03}" fill="${band}"/>
  <rect x="${x0 + pw * 0.1}" y="${y0 + ph * 0.38}" width="${pw * 0.8}" height="${ph * 0.04}" fill="${band}"/>
  <text x="${cx}" y="${y0 + ph * 0.385}" text-anchor="middle" font-family="${SANS}" font-weight="800" font-size="${pw * 0.068}" letter-spacing="${pw * 0.01}" fill="#f6efe2">MARROW &amp; OAT</text>
  <text x="${cx}" y="${y0 + ph * 0.52}" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-weight="600" font-size="${pw * 0.1}" fill="#2a1d16">${recipe}</text>
  <text x="${cx}" y="${y0 + ph * 0.6}" text-anchor="middle" font-family="${SANS}" font-weight="600" font-size="${pw * 0.05}" letter-spacing="${pw * 0.008}" fill="#6b5a4c">${note.toUpperCase()}</text>
  <circle cx="${cx}" cy="${y0 + ph * 0.665}" r="${pw * 0.028}" fill="${band}"/>
  <text x="${cx}" y="${y0 + ph * 0.18}" text-anchor="middle" font-family="${SANS}" font-weight="700" font-size="${pw * 0.04}" letter-spacing="${pw * 0.008}" fill="#5b3f22" opacity="0.75">FOR DOGS · SMALL BATCH</text>
  <path d="${shape}" fill="url(#${cur})"/>`
}

/** A pile of kibble at (cx, cy). */
function kibble(cx, cy, spread, count, seed, tone = "#8a5a2b") {
  const r = rng(seed)
  const g = id("kib")
  let out = `<defs><radialGradient id="${g}" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="${tint(tone, 0.35)}"/><stop offset="0.7" stop-color="${tone}"/><stop offset="1" stop-color="${shade(tone, 0.45)}"/></radialGradient></defs>`
  const pieces = Array.from({ length: count }, () => {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * spread
    return { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * 0.45 - (spread - d) * 0.25, s: 9 + r() * 7, rot: r() * 180 }
  }).sort((p, q) => p.y - q.y)
  for (const p of pieces) out += `<ellipse cx="${p.x}" cy="${p.y + p.s * 0.45}" rx="${p.s}" ry="${p.s * 0.55}" fill="#000" opacity="0.18"/><ellipse cx="${p.x}" cy="${p.y}" rx="${p.s}" ry="${p.s * 0.78}" transform="rotate(${p.rot} ${p.x} ${p.y})" fill="url(#${g})"/>`
  return out
}

/** A ceramic bowl seen from the front, at (cx, cy) rim centre. */
function bowl(cx, cy, bw, glaze = "#e9e1d3", { food = "" } = {}) {
  const g = id("bowl"), rim = id("rim")
  return `<defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${shade(glaze, 0.3)}"/><stop offset="0.35" stop-color="${tint(glaze, 0.3)}"/><stop offset="1" stop-color="${shade(glaze, 0.35)}"/></linearGradient>
    <radialGradient id="${rim}" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${shade(glaze, 0.25)}"/><stop offset="1" stop-color="${shade(glaze, 0.08)}"/></radialGradient></defs>
    <path d="M${cx - bw / 2} ${cy} Q${cx - bw * 0.44} ${cy + bw * 0.42} ${cx - bw * 0.2} ${cy + bw * 0.46} L${cx + bw * 0.2} ${cy + bw * 0.46} Q${cx + bw * 0.44} ${cy + bw * 0.42} ${cx + bw / 2} ${cy}Z" fill="url(#${g})"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${bw / 2}" ry="${bw * 0.12}" fill="url(#${rim})"/>
    ${food}
    <ellipse cx="${cx}" cy="${cy}" rx="${bw / 2}" ry="${bw * 0.12}" fill="none" stroke="${tint(glaze, 0.4)}" stroke-width="3"/>`
}

const PET_BG = ["#efe3d0", "#d9c3a3"]

export function petHero() {
  const w = 1400, h = 1100
  return { w, h, svg: doc(w, h, `${sweep(w, h, "#ead9c0", "#cfb48f", 0.6)}
    ${contact(520, 905, 230, 34, 0.45, 18)}${contact(880, 905, 230, 34, 0.45, 18)}${contact(1120, 960, 170, 26, 0.4, 14)}
    ${pouch(520, 910, 400, 620, { band: "#b5532f", recipe: "Chicken &amp; Pumpkin" })}
    ${pouch(880, 910, 400, 620, { band: "#2f6d6a", recipe: "Salmon &amp; Kelp" })}
    ${bowl(1130, 830, 260, "#2f3a33", { food: kibble(1130, 828, 104, 60, 4) })}
    ${kibble(330, 960, 90, 26, 8)}
    ${grain(w, h, 0.06)}`) }
}

export function petPouch(variant) {
  const v = { chicken: ["#b5532f", "Chicken &amp; Pumpkin", "#ecdcc4"], salmon: ["#2f6d6a", "Salmon &amp; Kelp", "#dfe6e1"], lamb: ["#6a6a2f", "Lamb &amp; Barley", "#e7e2cf"], duck: ["#7b3f5a", "Duck &amp; Sweet Potato", "#eadbd9"] }[variant]
  const w = 1000, h = 1000
  return { w, h, svg: doc(w, h, `${sweep(w, h, tint(v[2], 0.25), shade(v[2], 0.12), 0.62)}
    ${contact(500, 880, 280, 40, 0.42, 20)}
    ${pouch(500, 885, 470, 700, { band: v[0], recipe: v[1] })}
    ${kibble(220, 900, 70, 18, variant.length * 13)}
    ${grain(w, h, 0.06)}`) }
}

export function petTreats() {
  const w = 1000, h = 1000
  const glass = id("jar")
  return { w, h, svg: doc(w, h, `${sweep(w, h, "#f2e6d4", "#d8c09c", 0.6)}
    ${contact(500, 860, 250, 40, 0.42, 20)}
    <defs><linearGradient id="${glass}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0.45"/><stop offset="0.15" stop-color="#fff" stop-opacity="0.08"/><stop offset="0.8" stop-color="#fff" stop-opacity="0.05"/><stop offset="1" stop-color="#fff" stop-opacity="0.35"/></linearGradient></defs>
    <rect x="300" y="300" width="400" height="560" rx="60" fill="#c9a77a" opacity="0.35"/>
    ${Array.from({ length: 9 }, (_, row) => kibble(500, 820 - row * 56, 160, 16, 30 + row, "#7c4a24")).join("")}
    <rect x="300" y="300" width="400" height="560" rx="60" fill="url(#${glass})" stroke="#fff" stroke-opacity="0.5" stroke-width="3"/>
    <rect x="320" y="230" width="360" height="90" rx="20" fill="#3b2a20"/><rect x="320" y="230" width="360" height="22" rx="10" fill="#fff" opacity="0.12"/>
    <rect x="350" y="470" width="300" height="190" rx="10" fill="#f6efe2"/>
    <text x="500" y="530" text-anchor="middle" font-family="${SANS}" font-weight="800" font-size="34" letter-spacing="5" fill="#b5532f">MARROW &amp; OAT</text>
    <text x="500" y="585" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-weight="600" font-size="40" fill="#2a1d16">Beef liver bites</text>
    <text x="500" y="628" text-anchor="middle" font-family="${SANS}" font-weight="600" font-size="20" letter-spacing="3" fill="#6b5a4c">ONE INGREDIENT · 200 G</text>
    ${grain(w, h, 0.06)}`) }
}

/* ── Meal kits: Fennel & Fig ────────────────────────────────────────────── */

/** A wooden table, seen from above. */
function table(w, h, tone = "#9b7653") {
  const f = id("grain")
  return `<rect width="${w}" height="${h}" fill="${tone}"/><filter id="${f}"><feTurbulence type="fractalNoise" baseFrequency="0.002 0.06" numOctaves="4" seed="21"/><feColorMatrix values="0 0 0 0 0.25  0 0 0 0 0.15  0 0 0 0 0.07  0 0 0 0.7 0"/></filter><rect width="${w}" height="${h}" filter="url(#${f})"/>` +
    `<radialGradient id="tl${uid}" cx="0.4" cy="0.35" r="0.85"><stop offset="0" stop-color="#fff" stop-opacity="0.18"/><stop offset="1" stop-color="#000" stop-opacity="0.3"/></radialGradient><rect width="${w}" height="${h}" fill="url(#tl${uid})"/>`
}

/** A wide bowl from above, with whatever `inside` draws in its well. */
function plateTop(cx, cy, r, glaze, inside) {
  const g = id("pl"), well = id("well")
  return `<defs><radialGradient id="${g}" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="${tint(glaze, 0.25)}"/><stop offset="1" stop-color="${shade(glaze, 0.15)}"/></radialGradient>
    <radialGradient id="${well}" cx="0.5" cy="0.5" r="0.5"><stop offset="0.8" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.25"/></radialGradient>
    <clipPath id="c${g}"><circle cx="${cx}" cy="${cy}" r="${r * 0.8}"/></clipPath></defs>
    <circle cx="${cx + r * 0.06}" cy="${cy + r * 0.08}" r="${r * 1.02}" fill="#000" opacity="0.28" style="filter:blur(${r * 0.06}px)"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${g})"/>
    <g clip-path="url(#c${g})">${inside}</g>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.8}" fill="url(#${well})"/>
    <path d="M${cx - r * 0.7} ${cy - r * 0.55} A${r * 0.92} ${r * 0.92} 0 0 1 ${cx + r * 0.2} ${cy - r * 0.88}" fill="none" stroke="#fff" stroke-opacity="0.5" stroke-width="${r * 0.025}" stroke-linecap="round"/>`
}

function leaves(cx, cy, spread, n, seed, tone = "#3f7a3a") {
  const r = rng(seed)
  return Array.from({ length: n }, () => {
    const x = cx + (r() - 0.5) * spread * 2, y = cy + (r() - 0.5) * spread * 2, s = 14 + r() * 16, a = r() * 360
    return `<g transform="rotate(${a} ${x} ${y})"><path d="M${x - s} ${y} Q${x} ${y - s * 0.7} ${x + s} ${y} Q${x} ${y + s * 0.7} ${x - s} ${y}Z" fill="${r() > 0.5 ? tone : tint(tone, 0.2)}"/><line x1="${x - s * 0.8}" y1="${y}" x2="${x + s * 0.8}" y2="${y}" stroke="${tint(tone, 0.4)}" stroke-width="1.5" opacity="0.7"/></g>`
  }).join("")
}

function grainsOf(cx, cy, spread, n, seed, tone = "#f4efe4") {
  const r = rng(seed)
  return Array.from({ length: n }, () => {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * spread, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d
    return `<ellipse cx="${x}" cy="${y}" rx="7" ry="3.2" transform="rotate(${r() * 180} ${x} ${y})" fill="${r() > 0.3 ? tone : shade(tone, 0.08)}"/>`
  }).join("")
}

const MEALS = {
  dahl(cx, cy, r) {
    const rr = rng(3)
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#d98b2b"/><circle cx="${cx - r * 0.1}" cy="${cy - r * 0.1}" r="${r * 0.7}" fill="#e4a03c" opacity="0.7"/>` +
      `<path d="M${cx - r * 0.4} ${cy + r * 0.1} q${r * 0.2} ${-r * 0.3} ${r * 0.45} ${-r * 0.05} t${r * 0.4} ${-r * 0.1}" fill="none" stroke="#f7ecd6" stroke-width="${r * 0.06}" stroke-linecap="round" opacity="0.9"/>` +
      grainsOf(cx + r * 0.35, cy + r * 0.3, r * 0.4, 160, 5) +
      Array.from({ length: 30 }, () => `<circle cx="${cx + (rr() - 0.5) * r * 1.4}" cy="${cy + (rr() - 0.5) * r * 1.4}" r="${2 + rr() * 2}" fill="#7a3b12" opacity="0.7"/>`).join("") +
      leaves(cx - r * 0.1, cy - r * 0.2, r * 0.45, 12, 9, "#4f8a3c")
  },
  salmon(cx, cy, r) {
    return grainsOf(cx, cy, r, 420, 11) +
      `<rect x="${cx - r * 0.55}" y="${cy - r * 0.42}" width="${r * 0.75}" height="${r * 0.5}" rx="${r * 0.08}" fill="#e57a52" transform="rotate(-12 ${cx} ${cy})"/>` +
      Array.from({ length: 5 }, (_, i) => `<path d="M${cx - r * 0.5 + i * r * 0.15} ${cy - r * 0.42} q${r * 0.05} ${r * 0.25} 0 ${r * 0.5}" stroke="#f7c9b2" stroke-width="${r * 0.025}" fill="none" transform="rotate(-12 ${cx} ${cy})"/>`).join("") +
      `<rect x="${cx - r * 0.55}" y="${cy - r * 0.42}" width="${r * 0.75}" height="${r * 0.12}" rx="${r * 0.05}" fill="#b0482b" opacity="0.6" transform="rotate(-12 ${cx} ${cy})"/>` +
      leaves(cx + r * 0.35, cy + r * 0.25, r * 0.28, 9, 13, "#3d7a35") +
      `<path d="M${cx + r * 0.25} ${cy - r * 0.55} a${r * 0.22} ${r * 0.22} 0 0 1 ${r * 0.4} ${r * 0.1} z" fill="#c9de6a" stroke="#8fb33a" stroke-width="4"/>` +
      Array.from({ length: 40 }, (_, i) => `<circle cx="${cx - r * 0.3 + ((i * 37) % 50) / 50 * r * 0.6}" cy="${cy - r * 0.05 + ((i * 53) % 40) / 40 * r * 0.25}" r="2.6" fill="${i % 3 ? "#f3ead2" : "#2b2b2b"}"/>`).join("")
  },
  curry(cx, cy, r) {
    const rr = rng(17)
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#8aa83a"/><circle cx="${cx + r * 0.1}" cy="${cy - r * 0.05}" r="${r * 0.75}" fill="#a2bd4c" opacity="0.6"/>` +
      Array.from({ length: 14 }, () => { const x = cx + (rr() - 0.5) * r * 1.3, y = cy + (rr() - 0.5) * r * 1.3, s = 16 + rr() * 14; return `<rect x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}" rx="${s * 0.25}" fill="#f3e5c8" transform="rotate(${rr() * 90} ${x} ${y})"/>` }).join("") +
      Array.from({ length: 10 }, () => { const x = cx + (rr() - 0.5) * r * 1.2, y = cy + (rr() - 0.5) * r * 1.2; return `<circle cx="${x}" cy="${y}" r="${10 + rr() * 6}" fill="#d64b2f"/>` }).join("") +
      leaves(cx, cy, r * 0.6, 14, 19, "#2f6b2a")
  },
  pasta(cx, cy, r) {
    const rr = rng(23)
    let s = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#efcf7a"/>`
    for (let i = 0; i < 70; i++) { const x = cx + (rr() - 0.5) * r * 1.6, y = cy + (rr() - 0.5) * r * 1.6; s += `<path d="M${x} ${y} q${(rr() - 0.5) * 120} ${(rr() - 0.5) * 120} ${(rr() - 0.5) * 160} ${(rr() - 0.5) * 160}" stroke="${rr() > 0.5 ? "#f2d27c" : "#dcb357"}" stroke-width="6" fill="none" stroke-linecap="round"/>` }
    for (let i = 0; i < 9; i++) { const x = cx + (rr() - 0.5) * r, y = cy + (rr() - 0.5) * r; s += `<circle cx="${x}" cy="${y}" r="17" fill="#d23a2a"/><circle cx="${x - 5}" cy="${y - 5}" r="5" fill="#fff" opacity="0.35"/>` }
    s += leaves(cx + r * 0.2, cy - r * 0.2, r * 0.3, 7, 29, "#2f7a35")
    s += Array.from({ length: 40 }, () => `<rect x="${cx + (rr() - 0.5) * r}" y="${cy + (rr() - 0.5) * r}" width="7" height="2.5" fill="#fffaf0" opacity="0.9"/>`).join("")
    return s
  },
}

export function mealHero() {
  const w = 1400, h = 1100
  return { w, h, svg: doc(w, h, `${table(w, h)}
    <rect x="-40" y="760" width="560" height="420" rx="8" fill="#e9e2d2" transform="rotate(-6 200 900)"/><rect x="-40" y="760" width="560" height="420" fill="#000" opacity="0.06" transform="rotate(-6 200 900)"/>
    ${plateTop(520, 470, 330, "#f1ece2", MEALS.salmon(520, 470, 280))}
    ${plateTop(1040, 300, 230, "#2f3a35", MEALS.dahl(1040, 300, 190))}
    ${plateTop(1080, 820, 210, "#d9cbb4", MEALS.curry(1080, 820, 170))}
    <g transform="rotate(28 230 180)"><rect x="140" y="80" width="40" height="300" rx="20" fill="#cfc6b5"/><rect x="200" y="80" width="40" height="300" rx="20" fill="#cfc6b5" opacity="0.9"/></g>
    ${leaves(760, 960, 60, 6, 31, "#4f8a3c")}
    ${grain(w, h, 0.07)}`) }
}

export function mealDish(kind) {
  const w = 1000, h = 1000
  const glaze = { dahl: "#2f3a35", salmon: "#f1ece2", curry: "#d9cbb4", pasta: "#e8e1d4" }[kind]
  return { w, h, svg: doc(w, h, `${table(w, h, kind === "salmon" ? "#a98463" : "#8e6b4b")}
    ${plateTop(500, 500, 360, glaze, MEALS[kind](500, 500, 300))}
    ${grain(w, h, 0.07)}`) }
}

export function mealBox() {
  const w = 1000, h = 1000
  return { w, h, svg: doc(w, h, `${sweep(w, h, "#f1ede4", "#d8d1c2", 0.6)}
    ${contact(500, 820, 360, 50, 0.4, 22)}
    <path d="M150 360 L500 250 L850 360 L500 470Z" fill="#d7b98f"/>
    <path d="M150 360 L500 470 L500 840 L150 730Z" fill="#c4a072"/>
    <path d="M850 360 L500 470 L500 840 L850 730Z" fill="#b08a5c"/>
    <path d="M150 360 L500 470 L500 840 L150 730Z" fill="#fff" opacity="0.06"/>
    <g transform="matrix(1 0.314 0 1 0 0)"><rect x="200" y="320" width="270" height="150" rx="10" fill="#33452b"/></g>
    <text font-family="${SANS}" font-weight="800" font-size="27" fill="#f2efe6" letter-spacing="2" transform="matrix(1 0.314 0 1 224 438)">FENNEL &amp; FIG</text>
    <text font-family="${SANS}" font-weight="600" font-size="20" fill="#f2efe6" opacity="0.8" transform="matrix(1 0.314 0 1 224 474)">3 dinners for 2</text>
    <path d="M500 250 L500 470" stroke="#9c7a50" stroke-width="3"/>
    ${leaves(800, 230, 70, 7, 41, "#4f8a3c")}
    ${grain(w, h, 0.06)}`) }
}

/* ── Digital products: Halcyon Presets ──────────────────────────────────── */

/** A landscape photograph, graded: sky, sun, hills, water. */
function landscape(x, y, w, h, grade, seed) {
  const r = rng(seed)
  const sky = id("sky"), sun = id("sun")
  const hills = Array.from({ length: 3 }, (_, i) => {
    const base = y + h * (0.58 + i * 0.09)
    const p1 = r() * 6.28, p2 = r() * 6.28, f1 = 1.2 + r() * 1.4, f2 = 3 + r() * 3, a1 = h * (0.05 + r() * 0.06), a2 = h * (0.015 + r() * 0.02)
    let d = ""
    for (let k = 0; k <= 60; k++) {
      const t = k / 60
      const yy = base - a1 * (1 + Math.cos(t * 6.28 * f1 + p1)) / 2 - a2 * (1 + Math.cos(t * 6.28 * f2 + p2)) / 2
      d += `${k === 0 ? "M" : "L"}${(x + w * t).toFixed(1)} ${yy.toFixed(1)} `
    }
    return `<path d="${d} L${x + w} ${y + h} L${x} ${y + h}Z" fill="${mix(grade.hill, grade.near, i / 2)}"/>` 
  }).join("")
  return `<defs><linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${grade.top}"/><stop offset="0.65" stop-color="${grade.low}"/></linearGradient>
    <radialGradient id="${sun}" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${grade.sun}"/><stop offset="1" stop-color="${grade.sun}" stop-opacity="0"/></radialGradient>
    <clipPath id="c${sky}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath></defs>
    <g clip-path="url(#c${sky})"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${sky})"/>
    <circle cx="${x + w * (0.3 + r() * 0.4)}" cy="${y + h * 0.42}" r="${h * 0.32}" fill="url(#${sun})"/>
    ${hills}
    <rect x="${x}" y="${y + h * 0.82}" width="${w}" height="${h * 0.18}" fill="${grade.water}" opacity="0.85"/></g>`
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
  "watch-hero": watchHero, "watch-stone": watchStone, "watch-dial": watchDial, "watch-box": watchBox,
  "pet-hero": petHero, "pet-chicken": () => petPouch("chicken"), "pet-salmon": () => petPouch("salmon"), "pet-lamb": () => petPouch("lamb"), "pet-duck": () => petPouch("duck"), "pet-treats": petTreats,
  "meal-hero": mealHero, "meal-dahl": () => mealDish("dahl"), "meal-salmon": () => mealDish("salmon"), "meal-curry": () => mealDish("curry"), "meal-pasta": () => mealDish("pasta"), "meal-box": mealBox,
  "preset-coastal": () => presetCover("coastal", "Coastal", "12 Lightroom presets"), "preset-golden": () => presetCover("golden", "Golden Hour", "10 Lightroom presets"),
  "preset-nordic": () => presetCover("nordic", "Nordic Light", "8 Lightroom presets"), "preset-moody": () => presetCover("moody", "Moody Film", "12 presets + LUTs"),
  "preset-compare": presetCompare, "planner": plannerCover,
  "course-hero": courseHero, "lesson-0": () => courseLesson(0), "lesson-1": () => courseLesson(1), "lesson-2": () => courseLesson(2), "lesson-3": () => courseLesson(3), "lesson-4": () => courseLesson(4), "lesson-5": () => courseLesson(5),
  "bio-avatar": bioAvatar, "mugs": mugs,
}
