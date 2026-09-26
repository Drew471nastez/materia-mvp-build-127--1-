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

/** Every pattern and texture the Design tab offers, in the order it shows them. */
export const WALLPAPER_PATTERNS: readonly WallpaperPattern[] = [
  { id: "none", name: "None", kind: "none" },
  { id: "grain", name: "Grain", kind: "texture" },
  { id: "paper", name: "Paper", kind: "texture" },
  { id: "linen", name: "Linen", kind: "texture" },
  { id: "dots", name: "Dots", kind: "pattern" },
  { id: "grid", name: "Grid", kind: "pattern" },
  { id: "lines", name: "Lines", kind: "pattern" },
  { id: "diagonal", name: "Diagonal", kind: "pattern" },
  { id: "crosshatch", name: "Crosshatch", kind: "pattern" },
  { id: "checker", name: "Checker", kind: "pattern" },
  { id: "waves", name: "Waves", kind: "pattern" },
  { id: "zigzag", name: "Zigzag", kind: "pattern" },
  { id: "topographic", name: "Contours", kind: "pattern" },
  { id: "organic", name: "Organic", kind: "pattern" },
  { id: "morph", name: "Morph", kind: "pattern" },
  { id: "flowmaze", name: "Flow", kind: "pattern" },
  { id: "stars", name: "Stars", kind: "pattern" },
]

export function isPatternId(v: unknown): boolean {
  return typeof v === "string" && v !== "none" && WALLPAPER_PATTERNS.some((p) => p.id === v)
}

/** The layer's opacity for each strength. "Very strong" is the pattern drawn twice (see patternStyle). */
export function patternOpacityValue(level: unknown): number {
  return level === "low" ? 0.4 : level === "hard" || level === "very_hard" ? 1 : 0.7
}

/** A theme's pattern colour as an rgb hex and an alpha, or the safe default. */
export function patternInk(raw: unknown): { rgb: string; alpha: number } {
  const t = typeof raw === "string" ? raw.trim().replace(/^#/, "").toLowerCase() : ""
  const full = /^[0-9a-f]{3}$/.test(t) ? t.split("").map((c) => c + c).join("") : t
  if (/^[0-9a-f]{6}$/.test(full)) return { rgb: `#${full}`, alpha: 1 }
  if (/^[0-9a-f]{8}$/.test(full)) return { rgb: `#${full.slice(0, 6)}`, alpha: Math.round((parseInt(full.slice(6), 16) / 255) * 100) / 100 }
  return { rgb: "#000000", alpha: 0.56 }
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
    case "zigzag":
      return { image: svg(20, 12, `<path d='M0 6L5 0L10 6L15 0L20 6' ${s} stroke-width='1.5'/>`), size: "20px 12px" }
    case "morph":
      return {
        image: svg(
          200,
          200,
          `<g ${s} stroke-width='2'><path d='M40 20Q60 40 40 60Q20 80 40 100Q60 80 80 100Q100 120 80 140Q60 120 40 140Q20 160 40 180' opacity='.5'/><path d='M120 10Q140 30 160 20Q180 40 160 60Q180 80 160 100Q140 80 120 100Q100 80 120 60' opacity='.4'/><path d='M100 140Q120 160 140 150Q160 170 140 190Q120 170 100 180' opacity='.45'/></g>` +
            `<g ${fill}><circle cx='50' cy='50' r='8' opacity='.3'/><circle cx='150' cy='70' r='6' opacity='.25'/><circle cx='100' cy='160' r='5' opacity='.3'/><rect x='170' y='150' width='20' height='2' rx='1' opacity='.4'/><rect x='10' y='100' width='15' height='2' rx='1' opacity='.35'/></g>`,
        ),
        size: "200px 200px",
      }
    case "organic":
      return {
        image: svg(
          200,
          200,
          `<g ${fill}><path d='M30 40Q50 20 70 40Q90 60 70 80Q50 100 30 80Q10 60 30 40' opacity='.35'/><path d='M120 30Q150 25 160 50Q170 80 140 90Q110 95 100 70Q95 45 120 30' opacity='.3'/><path d='M60 130Q80 110 110 125Q130 140 115 165Q95 185 65 170Q45 155 60 130' opacity='.32'/><path d='M160 140Q180 145 185 165Q188 185 170 190Q150 188 145 170Q143 152 160 140' opacity='.28'/><path d='M20 160Q35 150 45 165Q50 180 35 190Q20 185 15 175Q12 165 20 160' opacity='.25'/></g>`,
        ),
        size: "200px 200px",
      }
    case "flowmaze":
      return {
        image: svg(
          240,
          240,
          `<g ${s} stroke-width='5' stroke-linecap='round'><path d='M12 30Q36 12 60 30Q84 48 72 78Q60 108 36 102Q12 96 18 72Q24 48 48 54Q72 60 84 84Q96 108 78 132Q60 156 36 144' opacity='.5'/><path d='M108 18Q132 6 156 24Q180 42 168 72Q156 102 132 90Q108 78 120 54Q132 30 156 42Q180 54 192 84Q204 114 180 138' opacity='.45'/><path d='M18 168Q42 150 66 168Q90 186 78 216Q66 240 42 228Q18 216 30 192' opacity='.48'/><path d='M120 174Q144 156 168 174Q192 192 180 222Q168 240 144 231Q120 222 132 198Q144 174 174 186Q204 198 216 228' opacity='.42'/></g>`,
        ),
        size: "240px 240px",
      }
    case "topographic":
      return {
        image: svg(
          300,
          300,
          `<g ${s} stroke-width='1.5'>` +
            [
              [100, 100, 90, 80, 0.3], [100, 100, 70, 62, 0.35], [100, 100, 50, 44, 0.4], [100, 100, 30, 26, 0.45], [100, 100, 12, 10, 0.5],
              [220, 200, 75, 90, 0.28], [220, 200, 55, 70, 0.33], [220, 200, 35, 50, 0.38], [220, 200, 18, 30, 0.43],
              [50, 250, 45, 40, 0.3], [50, 250, 28, 25, 0.38], [50, 250, 12, 10, 0.45],
              [250, 50, 40, 45, 0.32], [250, 50, 22, 28, 0.4], [250, 50, 8, 12, 0.48],
            ]
              .map(([cx, cy, rx, ry, op]) => `<ellipse cx='${cx}' cy='${cy}' rx='${rx}' ry='${ry}' opacity='${op}'/>`)
              .join("") +
            `</g>`,
        ),
        size: "300px 300px",
      }
    case "stars":
      return {
        image: svg(
          220,
          220,
          `<g ${fill}>` +
            [[18, 22, 1], [64, 48, 0.7], [120, 16, 1.1], [170, 60, 0.6], [205, 30, 0.9], [40, 110, 0.8], [96, 92, 0.5], [150, 120, 1], [196, 150, 0.7], [20, 176, 0.6], [78, 160, 1], [130, 196, 0.8], [182, 204, 0.5], [110, 140, 0.4]]
              .map(([x, y, r]) => `<circle cx='${x}' cy='${y}' r='${r}'/>`)
              .join("") +
            `</g>`,
        ),
        size: "220px 220px",
      }
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
 * knows (an old theme), which draws nothing.
 */
export function patternStyle(id: unknown, color: unknown, level: unknown = "medium"): { backgroundImage: string; backgroundSize: string; backgroundRepeat: string; opacity: number } | null {
  if (!isPatternId(id)) return null
  const { rgb, alpha } = patternInk(color)
  const t = tile(id as string, rgb, alpha)
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
