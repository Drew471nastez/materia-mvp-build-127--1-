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
  { id: "terrazzo", name: "Terrazzo", kind: "pattern" },
  { id: "blueprint", name: "Blueprint", kind: "pattern" },
  { id: "halftone", name: "Halftone", kind: "pattern" },
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
  key: "duotone-light" | "duotone-dark" | "halftone" | "grain" | "tint"
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
    const strength = alpha > 0 ? alpha : 1
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
