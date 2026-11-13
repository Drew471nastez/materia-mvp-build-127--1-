// OnePage: the wallpaper's patterns and textures, drawn once for every surface
// Location: lib/onepage/wallpaper.ts
//
// WHAT WAS WRONG. A pattern was drawn by three copies of the same code: the
// Design tab's thumbnails, the editor's phone preview and the live page, each
// an inline <svg> with a <pattern id="...">. They had drifted. Morph,
// Organic, Flow Maze and Topographic were drawn in an SVG with a viewBox and
// `preserveAspectRatio="xMidYMid slice"`, so their tile was scaled with the
// page: a few centimetres on the editor's small phone, a hand's width on a
// tall live page. And the grain ("Noise") on the live page was
// `<filter id="noise">`, the same id in the desktop layout and the phone
// layout. The page draws both and hides one with CSS, and `url(#noise)`
// resolves to the FIRST element with that id in the document: on a phone,
// the one inside the hidden desktop layout, which some browsers will not
// render from. The grain the creator saw in the editor was not reliably on
// their page.
//
// WHAT IS HERE NOW. Each pattern is one small SVG tile, turned into a CSS
// `background-image` data URI. There are no ids, so nothing can collide;
// the tile is a fixed number of pixels, so it looks the same at every size;
// and the editor's preview, the live page and the thumbnails all call
// `patternStyle` below, so they cannot drift again.
//
// THE COLOUR goes into the SVG, so it is checked first: only a hex colour
// (#rgb, #rrggbb, #rrggbbaa) is written into the URI. A theme holding
// anything else draws the pattern in black at half strength rather than
// writing somebody's string into a stylesheet.
//
// TEXTURES (grain, paper, linen) are new. Grain and paper are SVG noise
// (feTurbulence) tiled with `stitchTiles`, which makes the noise wrap at the
// tile's edges, so there is no seam. They work on a flat colour too, which
// the old Noise switch (gradient and image wallpapers only) never did.

export type PatternOpacity = "low" | "medium" | "hard" | "very_hard"

export interface WallpaperPattern {
  id: string
  name: string
  kind: "none" | "pattern" | "texture"
}

/*
  ROUND W10: FEWER ODD ONES, FIVE LOVED ONES. The owner: "get rid of the
  zigzag, get rid of the weird ones, and create 5 more, the best". Zigzag,
  Morph (loose squiggles), Organic (grey blobs) and Flow (thick worms) are
  gone from the picker; Contours is drawn again as a real contour map. New:
  Gingham, Scales (seigaiha), Honeycomb, Plus and Sparkles, the patterns
  people reach for on link-in-bio pages. Crosshatch, a third set of plain
  lines beside Lines and Diagonal, is drawn as Diagonal.

  A page that saved a removed one still draws something close to it
  (LEGACY_PATTERNS), so no page changes to a bare wallpaper overnight; the
  next pick in the Design tab writes a pattern that is offered.
*/

/** Every pattern and texture the Design tab offers, in the order it shows them. */
export const WALLPAPER_PATTERNS: readonly WallpaperPattern[] = [
  { id: "none", name: "None", kind: "none" },
  { id: "grain", name: "Grain", kind: "texture" },
  { id: "paper", name: "Paper", kind: "texture" },
  { id: "linen", name: "Linen", kind: "texture" },
  { id: "dots", name: "Dots", kind: "pattern" },
  { id: "grid", name: "Grid", kind: "pattern" },
  { id: "gingham", name: "Gingham", kind: "pattern" },
  { id: "checker", name: "Checker", kind: "pattern" },
  { id: "lines", name: "Lines", kind: "pattern" },
  { id: "diagonal", name: "Diagonal", kind: "pattern" },
  { id: "plus", name: "Plus", kind: "pattern" },
  { id: "halftone", name: "Halftone", kind: "pattern" },
  { id: "waves", name: "Waves", kind: "pattern" },
  { id: "scales", name: "Scales", kind: "pattern" },
  { id: "honeycomb", name: "Honeycomb", kind: "pattern" },
  { id: "topographic", name: "Contours", kind: "pattern" },
  { id: "terrazzo", name: "Terrazzo", kind: "pattern" },
  { id: "sparkles", name: "Sparkles", kind: "pattern" },
  { id: "stars", name: "Stars", kind: "pattern" },
  { id: "blueprint", name: "Blueprint", kind: "pattern" },
]

/** Patterns no longer offered, and the offered one each is drawn as, so a page that saved one keeps a pattern like it. */
export const LEGACY_PATTERNS: Readonly<Record<string, string>> = {
  zigzag: "waves",
  morph: "topographic",
  flowmaze: "topographic",
  organic: "terrazzo",
  /* Diagonal both ways, and next to Diagonal and Grid it was one more of the same. */
  crosshatch: "diagonal",
}

/** The offered pattern a saved value names: itself, what a removed one became, or null for "none" and names nobody knows. */
export function canonicalPatternId(v: unknown): string | null {
  if (typeof v !== "string" || v === "none") return null
  if (Object.prototype.hasOwnProperty.call(LEGACY_PATTERNS, v)) return LEGACY_PATTERNS[v]
  return WALLPAPER_PATTERNS.some((p) => p.id === v) ? v : null
}

/** Does a saved value draw a pattern? Offered ones and removed ones (drawn as their stand-in) do. */
export function isPatternId(v: unknown): boolean {
  return canonicalPatternId(v) !== null
}

/** The layer's opacity for each strength. "Very strong" is the pattern drawn twice (see patternStyle). "high", which one old theme wrote, is Strong. */
export function patternOpacityValue(level: unknown): number {
  return level === "low" ? 0.4 : level === "hard" || level === "very_hard" || level === "high" ? 1 : 0.7
}

/** A theme's pattern colour as an rgb hex and an alpha, or the safe default. */
export function patternInk(raw: unknown): { rgb: string; alpha: number } {
  const t = typeof raw === "string" ? raw.trim().replace(/^#/, "").toLowerCase() : ""
  const full = /^[0-9a-f]{3}$/.test(t) ? t.split("").map((c) => c + c).join("") : t
  if (/^[0-9a-f]{6}$/.test(full)) return { rgb: `#${full}`, alpha: 1 }
  if (/^[0-9a-f]{8}$/.test(full)) return { rgb: `#${full.slice(0, 6)}`, alpha: Math.round((parseInt(full.slice(6), 16) / 255) * 100) / 100 }
  return { rgb: "#000000", alpha: 0.56 }
}

/*
  THE PATTERN'S COLOUR FOLLOWS THE WALLPAPER (round W10). "Some of them
  don't work." A page with no pattern colour of its own drew its pattern in
  black, so on a dark wallpaper (Night, Space, Y2K, any dark gradient) the
  pattern was there and nobody could see it, while the Design tab's squares
  showed it in white. And the two colours the Design tab wrote for "the one
  that shows" (#00000090 on a light wallpaper, #ffffff90 on a dark one)
  stayed when the wallpaper changed: black lines on a page made dark later.

  Now no colour, or either of those two, means "automatic": black on a light
  wallpaper, white on a dark one, read off the wallpaper itself each time it
  is drawn. Any other colour is the creator's and is drawn as chosen.
*/
export const AUTO_INKS = ["#00000090", "#ffffff90"] as const

/** Is this saved pattern colour "automatic" (nothing, or one of the two the picker wrote for it)? */
export function isAutoInk(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true
  if (typeof raw !== "string") return true
  const t = raw.trim().toLowerCase()
  return t === "" || (AUTO_INKS as readonly string[]).includes(t)
}

type GroundLike = { background_type?: unknown; background_color?: unknown; background_gradient?: unknown } | null | undefined

const relLum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}
const hex6 = (raw: string): string | null => {
  const t = raw.trim().replace(/^#/, "").toLowerCase()
  if (/^[0-9a-f]{3}$/.test(t)) return `#${t.split("").map((c) => c + c).join("")}`
  if (/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(t)) return `#${t.slice(0, 6)}`
  return null
}

/** Is the wallpaper dark? A flat colour by its own lightness, a gradient by the average of its colours. Unknown: light. */
export function wallpaperIsDark(ground: GroundLike): boolean {
  if (!ground) return false
  const colours: string[] = []
  if (ground.background_type === "gradient" && typeof ground.background_gradient === "string") {
    for (const m of ground.background_gradient.match(/#[0-9a-f]{3,8}\b/gi) ?? []) {
      const h = hex6(m)
      if (h) colours.push(h)
    }
    for (const m of ground.background_gradient.matchAll(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/gi)) {
      colours.push(`#${[m[1], m[2], m[3]].map((v) => Math.min(255, Number(v)).toString(16).padStart(2, "0")).join("")}`)
    }
  }
  if (colours.length === 0 && typeof ground.background_color === "string") {
    const h = hex6(ground.background_color)
    if (h) colours.push(h)
  }
  if (colours.length === 0) return false
  const avg = colours.reduce((sum, c) => sum + relLum(c), 0) / colours.length
  /* 0.18 is where black and white text are about as readable as each other. */
  return avg < 0.18
}

/** The automatic pattern colour for a wallpaper: white on a dark one, black on a light one, each at the strength that reads the same. */
export function autoPatternInk(ground: GroundLike): string {
  return wallpaperIsDark(ground) ? "#ffffff80" : "#00000073"
}

/** The colour a pattern is drawn in: the creator's own, or the automatic one for the wallpaper. */
export function resolvedPatternInk(raw: unknown, ground: GroundLike | undefined): string {
  /* Without a wallpaper to read (an old caller), the colour is drawn as it is saved, as it always was. */
  if (ground === undefined) return typeof raw === "string" && raw.trim() ? raw : "#00000090"
  return isAutoInk(raw) ? autoPatternInk(ground) : String(raw)
}

const svg = (w: number, h: number, body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${body}</svg>`)}")`

/** The noise filter behind grain and paper: `freq` sets the size of the speckle, `a`/`b` how much of it shows. */
const noise = (w: number, freq: string, octaves: number, rgb: string, a: number, b: number) => {
  const { r, g, bl } = { r: parseInt(rgb.slice(1, 3), 16) / 255, g: parseInt(rgb.slice(3, 5), 16) / 255, bl: parseInt(rgb.slice(5, 7), 16) / 255 }
  const f = (n: number) => n.toFixed(3)
  return svg(
    w,
    w,
    `<filter id='n' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='${octaves}' stitchTiles='stitch'/>` +
      `<feColorMatrix values='0 0 0 0 ${f(r)} 0 0 0 0 ${f(g)} 0 0 0 0 ${f(bl)} ${a} 0 0 0 ${b}'/></filter><rect width='100%' height='100%' filter='url(#n)'/>`,
  )
}

/*
  TERRAZZO: stone chips set in a pale ground, as a poured floor is. Each chip
  is an uneven polygon of four to six corners, in three sizes (a few large,
  more middle, many small specks), each at its own strength of the colour so
  the stone has depth. Laid out once from a fixed seed, so every page draws
  the same stone, and a chip that crosses the tile's edge is drawn again on
  the other side, so the floor has no seam. Chips of the same strength are
  one path, so the tile is a few elements, not seventy.
*/
const TERRAZZO_SIZE = 260
const TERRAZZO_CHIPS: readonly { d: string; o: number }[] = (() => {
  let seed = 20261024
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
  const W = TERRAZZO_SIZE
  const byStrength = new Map<number, string[]>()
  const chip = (r: number, strength: [number, number]) => {
    const cx = rnd() * W
    const cy = rnd() * W
    const corners = 4 + Math.floor(rnd() * 3)
    const turn = rnd() * Math.PI * 2
    const pts: [number, number][] = []
    for (let i = 0; i < corners; i++) {
      const a = turn + (i * Math.PI * 2) / corners + (rnd() - 0.5) * 0.9
      const rr = r * (0.55 + rnd() * 0.55)
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr])
    }
    const o = Math.round((strength[0] + rnd() * (strength[1] - strength[0])) * 10) / 10
    const list = byStrength.get(o) ?? []
    for (const dx of [-W, 0, W]) for (const dy of [-W, 0, W]) {
      const x = cx + dx
      const y = cy + dy
      if (x < -r || x > W + r || y < -r || y > W + r) continue
      list.push(`M${pts.map(([px, py]) => `${(x + px).toFixed(1)} ${(y + py).toFixed(1)}`).join("L")}Z`)
    }
    byStrength.set(o, list)
  }
  for (let i = 0; i < 7; i++) chip(9 + rnd() * 5, [0.35, 0.75])
  for (let i = 0; i < 22; i++) chip(3.5 + rnd() * 3, [0.4, 0.9])
  for (let i = 0; i < 46; i++) chip(1.1 + rnd() * 1.4, [0.5, 1])
  return [...byStrength].map(([o, ds]) => ({ o, d: ds.join("") }))
})()

/* BLUEPRINT: drafting paper. A fine line every 10px, a firmer one every 50px, and a small cross where the firm ones meet. */
const BLUEPRINT_MINOR = [10, 20, 30, 40, 60, 70, 80, 90].map((n) => `M0 ${n + 0.5}H100M${n + 0.5} 0V100`).join("")

const r2 = (n: number) => Math.round(n * 100) / 100

/*
  CONTOURS: a contour map, not rings. Four hills, each a stack of wobbly
  closed lines (a radius that rises and falls a little around the hill), the
  tile's edge crossed by copies on the other side so it has no seam. Hills
  are far enough apart that their lines never cross, as on a real map.
*/
const TOPO_SIZE = 280
const TOPO_PATH = (() => {
  const W = TOPO_SIZE
  const hills: [number, number, number[], number, number][] = [
    [70, 72, [16, 32, 48, 64, 78], 0.4, 1.7],
    [212, 208, [14, 30, 46, 62, 76], 2.1, 0.6],
    [214, 66, [12, 24, 36], 1.2, 2.9],
    [66, 212, [10, 22, 34], 3.3, 0.2],
  ]
  const out: string[] = []
  for (const [cx, cy, radii, p1, p2] of hills) {
    for (const R of radii) {
      const pts: string[] = []
      const n = 48
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        const r = R * (1 + 0.11 * Math.sin(3 * a + p1) + 0.06 * Math.sin(5 * a + p2))
        pts.push(`${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`)
      }
      const reach = R * 1.2
      for (const dx of [-W, 0, W]) for (const dy of [-W, 0, W]) {
        const x = cx + dx
        const y = cy + dy
        if (x < -reach || x > W + reach || y < -reach || y > W + reach) continue
        out.push(`M${pts.map((pt) => { const [px, py] = pt.split(" ").map(Number); return `${(x + px).toFixed(1)} ${(y + py).toFixed(1)}` }).join("L")}Z`)
      }
    }
  }
  return out.join("")
})()

/* SCALES: a half circle of radius 20 and two inside it (14, 8), on a 40px grid, the second row half a step over. */
const SCALES_PATH = (() => {
  const arcs = (cx: number, cy: number) => [20, 14, 8].map((r) => `M${cx - r} ${cy}A${r} ${r} 0 0 0 ${cx + r} ${cy}`).join("")
  return [arcs(20, 0), arcs(0, 20), arcs(40, 20), arcs(20, 40), arcs(-20, 40), arcs(60, 40)].join("")
})()

/* HONEYCOMB: pointy-top hexagons, 28 wide and 32 tall, on a 28 by 48 tile (a row every 24px, every other one half over). */
const HONEY_PATH = (() => {
  const hex = (cx: number, cy: number) => `M${cx} ${cy - 16}L${cx + 14} ${cy - 8}L${cx + 14} ${cy + 8}L${cx} ${cy + 16}L${cx - 14} ${cy + 8}L${cx - 14} ${cy - 8}Z`
  return [hex(14, 0), hex(14, 48), hex(0, 24), hex(28, 24)].join("")
})()

/* SPARKLES: four-pointed stars of three sizes and a few specks, each well inside the tile. */
const SPARKLE_SIZE = 180
const SPARKLE_PATH = (() => {
  const star = (x: number, y: number, r: number) => {
    const k = r * 0.18
    return `M${x} ${y - r}C${x + k} ${y - k} ${x + k} ${y - k} ${x + r} ${y}C${x + k} ${y + k} ${x + k} ${y + k} ${x} ${y + r}C${x - k} ${y + k} ${x - k} ${y + k} ${x - r} ${y}C${x - k} ${y - k} ${x - k} ${y - k} ${x} ${y - r}Z`
  }
  const dot = (x: number, y: number, r: number) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`
  return [star(36, 40, 11), star(128, 30, 6.5), star(150, 116, 10), star(62, 134, 7), star(102, 80, 4.5), star(20, 162, 5), star(164, 170, 4), star(92, 168, 3.5), dot(84, 18, 1.6), dot(168, 64, 1.4), dot(28, 94, 1.4), dot(122, 158, 1.6), dot(60, 76, 1.1), dot(140, 76, 1.1)].join("")
})()

/** One tile for each pattern, in `c` at opacity `o`. The ids inside a data URI belong to that image alone. */
function tile(id: string, c: string, o: number): { image: string; size: string } | null {
  const s = `stroke='${c}' stroke-opacity='${o}' fill='none'`
  const fill = `fill='${c}' fill-opacity='${o}'`
  switch (id) {
    case "grid":
      return { image: svg(20, 20, `<path d='M20 .5H.5V20' ${s} stroke-width='1'/>`), size: "20px 20px" }
    case "dots":
      return { image: svg(16, 16, `<circle cx='8' cy='8' r='1.8' ${fill}/>`), size: "16px 16px" }
    case "lines":
      return { image: svg(10, 10, `<path d='M0 9.5H10' ${s} stroke-width='1'/>`), size: "10px 10px" }
    case "diagonal":
      return { image: svg(10, 10, `<path d='M-1 11L11 -1M-1 1L1 -1M9 11L11 9' ${s} stroke-width='1'/>`), size: "10px 10px" }
    case "crosshatch":
      return { image: svg(12, 12, `<path d='M-1 13L13 -1M-1 -1L13 13' ${s} stroke-width='0.8'/>`), size: "12px 12px" }
    case "checker":
      /* Half strength: a checker at full strength is louder than anything else on the page. */
      return { image: svg(24, 24, `<path d='M0 0h12v12H0zM12 12h12v12H12z' fill='${c}' fill-opacity='${o * 0.45}'/>`), size: "24px 24px" }
    case "linen":
      return {
        image: svg(6, 6, `<path d='M0 .5H6M0 3.5H6' stroke='${c}' stroke-opacity='${o * 0.55}' stroke-width='0.6'/><path d='M1.5 0V6M4.5 0V6' stroke='${c}' stroke-opacity='${o * 0.35}' stroke-width='0.6'/>`),
        size: "6px 6px",
      }
    case "waves":
      return { image: svg(50, 25, `<path d='M0 12.5Q12.5 0 25 12.5T50 12.5' ${s} stroke-width='2'/>`), size: "50px 25px" }
    case "topographic":
      return { image: svg(TOPO_SIZE, TOPO_SIZE, `<path d='${TOPO_PATH}' ${s} stroke-width='1.2' stroke-linejoin='round'/>`), size: `${TOPO_SIZE}px ${TOPO_SIZE}px` }
    case "stars":
      return {
        image: svg(
          220,
          220,
          /* Stars are points of light: brighter than the lines are, or a starfield is not seen at all. */
          `<g fill='${c}' fill-opacity='${r2(Math.min(1, o * 1.8))}'>` +
            [[18, 22, 1.4], [64, 48, 1], [120, 16, 1.6], [170, 60, 0.9], [205, 30, 1.3], [40, 110, 1.1], [96, 92, 0.8], [150, 120, 1.5], [196, 150, 1], [20, 176, 0.9], [78, 160, 1.4], [130, 196, 1.1], [182, 204, 0.8], [110, 140, 0.7]]
              .map(([x, y, r]) => `<circle cx='${x}' cy='${y}' r='${r}'/>`)
              .join("") +
            `</g>`,
        ),
        size: "220px 220px",
      }
    case "gingham":
      /* Picnic cloth: a band each way at a third of the strength, twice that where they cross. */
      return { image: svg(28, 28, `<path d='M0 0h14v28H0z' fill='${c}' fill-opacity='${r2(o * 0.3)}'/><path d='M0 0h28v14H0z' fill='${c}' fill-opacity='${r2(o * 0.3)}'/>`), size: "28px 28px" }
    case "scales":
      /* Seigaiha: rows of half circles, each with two inside it, every other row moved over by half. */
      return { image: svg(40, 40, `<path d='${SCALES_PATH}' ${s} stroke-width='1'/>`), size: "40px 40px" }
    case "honeycomb":
      return { image: svg(28, 48, `<path d='${HONEY_PATH}' ${s} stroke-width='1' stroke-linejoin='round'/>`), size: "28px 48px" }
    case "plus":
      return { image: svg(32, 32, `<path d='M8 4.5v7M4.5 8h7M24 20.5v7M20.5 24h7' ${s} stroke-width='1.5' stroke-linecap='round'/>`), size: "32px 32px" }
    case "sparkles":
      return { image: svg(SPARKLE_SIZE, SPARKLE_SIZE, `<path d='${SPARKLE_PATH}' ${fill}/>`), size: `${SPARKLE_SIZE}px ${SPARKLE_SIZE}px` }
    case "terrazzo":
      return {
        image: svg(TERRAZZO_SIZE, TERRAZZO_SIZE, TERRAZZO_CHIPS.map((g) => `<path d='${g.d}' fill='${c}' fill-opacity='${Math.round(o * g.o * 100) / 100}'/>`).join("")),
        size: `${TERRAZZO_SIZE}px ${TERRAZZO_SIZE}px`,
      }
    case "blueprint":
      return {
        image: svg(
          100,
          100,
          `<path d='${BLUEPRINT_MINOR}' stroke='${c}' stroke-opacity='${Math.round(o * 0.4 * 100) / 100}' stroke-width='0.5' fill='none'/>` +
            `<path d='M0 .5H100M0 50.5H100M.5 0V100M50.5 0V100' ${s} stroke-width='1'/>` +
            `<path d='M46.5 50.5H54.5M50.5 46.5V54.5' ${s} stroke-width='1.5'/>`,
        ),
        size: "100px 100px",
      }
    case "halftone":
      /* A print's dot screen, turned 45 degrees: a dot at each corner and one in the middle. */
      return { image: svg(7, 7, `<g ${fill}><circle cx='0' cy='0' r='1'/><circle cx='7' cy='0' r='1'/><circle cx='0' cy='7' r='1'/><circle cx='7' cy='7' r='1'/><circle cx='3.5' cy='3.5' r='1'/></g>`), size: "7px 7px" }
    case "grain":
      return { image: noise(160, "1.05", 3, c, 1.25 * o, -0.56 * o), size: "160px 160px" }
    case "paper":
      return {
        image: `${noise(240, "0.03", 4, c, 0.75 * o, -0.33 * o)}, ${noise(120, "0.8", 2, c, 0.8 * o, -0.37 * o)}`,
        size: "240px 240px, 120px 120px",
      }
    default:
      return null
  }
}

/**
 * The CSS for a pattern layer: an element with this style, absolutely placed
 * over the wallpaper, draws the pattern. Null for "none" or a name nobody
 * knows (an old theme), which draws nothing. A removed pattern draws the one
 * that took its place (LEGACY_PATTERNS). With `ground` (the theme, or just
 * its wallpaper), an automatic colour follows the wallpaper (resolvedPatternInk).
 */
export function patternStyle(
  id: unknown,
  color: unknown,
  level: unknown = "medium",
  ground?: GroundLike,
): { backgroundImage: string; backgroundSize: string; backgroundRepeat: string; opacity: number } | null {
  const kept = canonicalPatternId(id)
  if (!kept) return null
  const { rgb, alpha } = patternInk(resolvedPatternInk(color, ground))
  const t = tile(kept, rgb, alpha)
  if (!t) return null
  /* Very strong: the same tile twice, one over the other, which is what the old 1.5 opacity meant and never did (opacity stops at 1). */
  const twice = level === "very_hard"
  return {
    backgroundImage: twice ? `${t.image}, ${t.image}` : t.image,
    backgroundSize: twice ? `${t.size}, ${t.size}` : t.size,
    backgroundRepeat: "repeat",
    opacity: patternOpacityValue(level),
  }
}

/** The grey grain the Noise switch lays over a gradient or a photo, blended as an overlay. */
export const NOISE_IMAGE = svg(
  180,
  180,
  /* Grey noise, fully opaque: an overlay of light and dark greys lifts and darkens what is under it; a flat 50% grey would do nothing. */
  `<filter id='n' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='table' tableValues='1 1'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(#n)'/>`,
)

/** The Noise switch's strength (5 to 50) as the layer's opacity, as it always was: strength / 50. */
export function noiseOpacity(strength: unknown): number {
  const n = typeof strength === "number" && Number.isFinite(strength) ? strength : 15
  return Math.min(1, Math.max(0, (n / 100) * 2))
}

/* ── Effects on a photo or a video wallpaper (round AR) ────────────────── */
//
// The owner: "for the wallpapers, for the images or video, I can apply
// effects: none, mono, blur, halftone, and so on; I can adjust the tint."
//
// Each effect is CSS only: a filter on the photo or the video element, and
// at most two plain layers over it (a colour, a dot screen, the grain) with
// a blend mode. Nothing runs per frame in script, so a video wallpaper costs
// what its filter costs the compositor, and a photo is drawn once.
//
//   none       the picture as it is (Brightness still applies)
//   mono       black and white
//   blur       out of focus, by `wallpaper_blur` px (up to 40); the picture
//              is scaled up a little so its soft edge never shows
//   halftone   black and white with a fine print dot screen over it
//   grain      film grain over it (the Noise layer, at the Noise strength)
//   duotone    the picture's lights and darks mapped to two shades of the
//              tint colour (a multiply layer, then a screen layer)
//
// The tint (`wallpaper_tint`, at `wallpaper_tint_strength` 0 to 100) is a
// flat colour laid over any effect; in duotone it is the duotone's colour.
// lib/onepage/contrast counts it into what the page's words sit on.
//
// A page saved before this has no effect and keeps its look: the image's
// own Blur (`image_blur`) still blurs it, and Brightness is as it was.

export const WALLPAPER_EFFECTS = ["none", "mono", "blur", "halftone", "grain", "duotone"] as const
export type WallpaperEffect = (typeof WALLPAPER_EFFECTS)[number]

export interface WallpaperEffectThemeLike {
  background_type?: unknown
  image_brightness?: unknown
  image_blur?: unknown
  video_brightness?: unknown
  wallpaper_effect?: unknown
  wallpaper_blur?: unknown
  wallpaper_tint?: unknown
  wallpaper_tint_strength?: unknown
  noise_strength?: unknown
}

export function wallpaperEffectOf(theme: WallpaperEffectThemeLike | null | undefined): WallpaperEffect {
  const e = theme?.wallpaper_effect
  return typeof e === "string" && (WALLPAPER_EFFECTS as readonly string[]).includes(e) ? (e as WallpaperEffect) : "none"
}

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback)
const clampNum = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** The default blur of the Blur effect, and its most. */
export const WALLPAPER_BLUR_DEFAULT = 12
export const WALLPAPER_BLUR_MAX = 40

/** A #rrggbb tint, or null. */
export function wallpaperTint(theme: WallpaperEffectThemeLike | null | undefined): string | null {
  const t = typeof theme?.wallpaper_tint === "string" ? theme.wallpaper_tint.trim() : ""
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t)
  if (!m) return null
  return `#${(m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1]).toLowerCase()}`
}

/** The tint's strength, 0 to 1. Duotone with no strength set is the full duotone. */
export function wallpaperTintAlpha(theme: WallpaperEffectThemeLike | null | undefined): number {
  const raw = theme?.wallpaper_tint_strength
  if (typeof raw !== "number" || !Number.isFinite(raw)) return wallpaperEffectOf(theme) === "duotone" ? 1 : 0
  return clampNum(raw, 0, 100) / 100
}

/** The duotone's dark colour when no tint is chosen. */
export const DUOTONE_DEFAULT = "#1f2a6b"

const mixHexes = (a: string, b: string, t: number) => {
  const pa = Number.parseInt(a.slice(1), 16)
  const pb = Number.parseInt(b.slice(1), 16)
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t)
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`
}

export interface WallpaperLayer {
  key: "duotone-light" | "duotone-dark" | "halftone" | "grain" | "tint" | "veil"
  style: { background?: string; backgroundImage?: string; backgroundSize?: string; backgroundPosition?: string; mixBlendMode?: "multiply" | "screen" | "overlay" | "normal"; opacity: number }
}

export interface WallpaperMediaLook {
  effect: WallpaperEffect
  /** The CSS filter for the photo or video element. */
  filter: string
  /** Scale the element by this, so a blurred edge stays outside the frame. 1 is none. */
  scale: number
  /** Layers laid over the element, in order, each covering it. */
  layers: WallpaperLayer[]
}

/** The dot screen of Halftone: a dot every 4px, every other row shifted half a step, as a print screen at 45 degrees. */
const HALFTONE_DOT = "radial-gradient(circle at center, rgba(0,0,0,0.55) 0.9px, transparent 1.4px)"

/**
 * How a photo (`kind` "image") or a video wallpaper is drawn: its filter, its
 * scale and the layers over it. `extraBlur` is a blur the caller adds for its
 * own reasons (the desktop surround's 20px).
 */
export function wallpaperMediaLook(theme: WallpaperEffectThemeLike | null | undefined, kind: "image" | "video", extraBlur = 0): WallpaperMediaLook {
  const effect = wallpaperEffectOf(theme)
  const brightness = clampNum(num(kind === "image" ? theme?.image_brightness : theme?.video_brightness, 100) || 100, 10, 200)
  const ownBlur =
    effect === "blur" ? clampNum(num(theme?.wallpaper_blur, WALLPAPER_BLUR_DEFAULT), 0, WALLPAPER_BLUR_MAX) : kind === "image" ? clampNum(num(theme?.image_blur, 0), 0, WALLPAPER_BLUR_MAX) : 0
  const blur = ownBlur + extraBlur
  const parts = [`brightness(${brightness}%)`]
  if (blur > 0) parts.push(`blur(${blur}px)`)
  if (effect === "mono") parts.push("grayscale(1)", "contrast(1.06)")
  if (effect === "halftone") parts.push("grayscale(1)", "contrast(1.4)")
  if (effect === "duotone") parts.push("grayscale(1)", "contrast(1.12)")
  const layers: WallpaperLayer[] = []
  const tint = wallpaperTint(theme)
  const alpha = wallpaperTintAlpha(theme)
  if (effect === "duotone") {
    const dark = tint ?? DUOTONE_DEFAULT
    const light = mixHexes(dark, "#ffffff", 0.82)
    /* An unset strength is already full for a duotone (wallpaperTintAlpha); a chosen 0% is 0%, not full (the OnePage production audit, D7). */
    const strength = alpha
    layers.push({ key: "duotone-light", style: { background: light, mixBlendMode: "multiply", opacity: strength } })
    layers.push({ key: "duotone-dark", style: { background: dark, mixBlendMode: "screen", opacity: strength } })
  }
  if (effect === "halftone") {
    layers.push({ key: "halftone", style: { backgroundImage: `${HALFTONE_DOT}, ${HALFTONE_DOT}`, backgroundSize: "4px 4px", backgroundPosition: "0 0, 2px 2px", mixBlendMode: "multiply", opacity: 0.85 } })
  }
  if (effect === "grain") {
    layers.push({ key: "grain", style: { backgroundImage: NOISE_IMAGE, backgroundSize: "180px 180px", mixBlendMode: "overlay", opacity: Math.max(0.3, noiseOpacity(theme?.noise_strength ?? 24)) } })
  }
  if (effect !== "duotone" && tint && alpha > 0) layers.push({ key: "tint", style: { background: tint, mixBlendMode: "normal", opacity: alpha } })
  /* A blur pulls the edge in by about twice its radius: scaled so that edge is outside the frame. */
  const scale = blur > 0 ? Math.round((1 + Math.min(0.3, blur * 0.012)) * 1000) / 1000 : 1
  return { effect, filter: parts.join(" "), scale, layers }
}

/**
 * A pixel of the picture as the page shows it: through the brightness, the
 * grey of Mono, Halftone and Duotone with their contrast, and Duotone's two
 * colours (the tint is laid on later, by lib/onepage/contrast). The blur and
 * the halftone's dots are left out: they narrow the picture's range, so the
 * ends read here are the harder case. Used on the few pixels the page
 * samples once (components/onepage/wallpaper-layers usePhotoGrounds).
 */
export function pixelThroughLook(px: { r: number; g: number; b: number }, theme: WallpaperEffectThemeLike | null | undefined, kind: "image" | "video"): { r: number; g: number; b: number; a: number } {
  const effect = wallpaperEffectOf(theme)
  const k = clampNum(num(kind === "image" ? theme?.image_brightness : theme?.video_brightness, 100) || 100, 10, 200) / 100
  let [r, g, b] = [px.r, px.g, px.b].map((v) => clampNum((v / 255) * k, 0, 1))
  if (effect === "mono" || effect === "halftone" || effect === "duotone") {
    const c = effect === "mono" ? 1.06 : effect === "halftone" ? 1.4 : 1.12
    const grey = clampNum((0.2126 * r + 0.7152 * g + 0.0722 * b - 0.5) * c + 0.5, 0, 1)
    r = g = b = grey
    if (effect === "duotone") {
      const dark = wallpaperTint(theme) ?? DUOTONE_DEFAULT
      const light = mixHexes(dark, "#ffffff", 0.82)
      const ch = (hex: string, i: number) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
      const s = wallpaperTintAlpha(theme)
      const out = [0, 1, 2].map((i) => {
        const m = grey * (1 - s + s * ch(light, i))
        return 1 - (1 - m) * (1 - s * ch(dark, i))
      })
      ;[r, g, b] = out
    }
  }
  return { r: r * 255, g: g * 255, b: b * 255, a: 1 }
}

/** The look with the veil that makes the page's words read on this picture (lib/onepage/contrast photoVeil) laid last; the same look when none is needed. */
export function withVeil(look: WallpaperMediaLook, veil: { color: string; alpha: number }): WallpaperMediaLook {
  if (!(veil.alpha > 0)) return look
  return { ...look, layers: [...look.layers, { key: "veil", style: { background: veil.color, mixBlendMode: "normal", opacity: veil.alpha } }] }
}
