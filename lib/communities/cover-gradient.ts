/**
 * ===========================================================================
 *  A COMMUNITY WITH NO COVER: A GROUND MADE FROM ITS OWN COLOURS
 * ===========================================================================
 * Round 33, the owner: a community card with no cover was a flat grey field.
 * Now it is a gradient in the community's own colours, read from its icon in
 * the browser (a 24px copy of the icon drawn on a canvas, its pixels counted
 * here), and a gradient from its name until the icon has been read, or when
 * there is no icon or it cannot be read. Never grey.
 *
 *   paletteFromPixels   the two colours an icon is mostly made of: the
 *                       pixels in buckets, grey, white, black and see-through
 *                       ones counted for little, the second colour the most
 *                       common one near the first on the colour wheel but not
 *                       the same (or the first's own neighbour)
 *   namePalette         two colours from a hash of the name, from a short
 *                       list of hue pairs that sit well together (no violet
 *                       pairs: a purple wash is what every template has)
 *   coverGradient       the CSS for a pair, each colour brought to a
 *                       lightness and a saturation that read well under white
 *                       text and a logo with a white ring
 *
 * Pure apart from `sampleIconPalette`, which only runs in a browser, and its
 * cache (memory, then localStorage, keyed by the icon's address).
 * components/community/cover-fill.tsx draws it.
 */

export type Rgb = readonly [number, number, number]
export type Palette = readonly [string, string]

/** Hue pairs the name gradient picks from: a hue and a neighbour, never two purples. */
const NAME_PAIRS: readonly (readonly [number, number])[] = [
  [12, 38],
  [24, 350],
  [36, 8],
  [150, 190],
  [168, 205],
  [196, 222],
  [205, 172],
  [214, 188],
  [340, 18],
  [28, 54],
  [140, 96],
  [186, 150],
]

/** A small, stable hash of a string (FNV-1a), so a name always gets the same pair. */
export function nameHash(s: string): number {
  let h = 0x811c9dc5
  for (const ch of s.trim().toLowerCase()) {
    h ^= ch.codePointAt(0) ?? 0
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function hexOf([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("")}`
}

export function rgbOf(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** RGB 0..255 to HSL with h in degrees, s and l 0..1. */
export function hslOf([r, g, b]: Rgb): [number, number, number] {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4
  return [h * 60, s, l]
}

export function rgbFromHsl(h: number, s: number, l: number): Rgb {
  const hue = (((h % 360) + 360) % 360) / 360
  if (s === 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const t = (x: number) => {
    let v = x
    if (v < 0) v += 1
    if (v > 1) v -= 1
    if (v < 1 / 6) return p + (q - p) * 6 * v
    if (v < 1 / 2) return q
    if (v < 2 / 3) return p + (q - p) * (2 / 3 - v) * 6
    return p
  }
  return [t(hue + 1 / 3) * 255, t(hue) * 255, t(hue - 1 / 3) * 255]
}

const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/** Two colours from a name. */
export function namePalette(name: string): Palette {
  const h = nameHash(name || "Community")
  const [a, b] = NAME_PAIRS[h % NAME_PAIRS.length]
  /* A few degrees either way from the pair, so two names on the same pair are not the same picture. */
  const shift = ((h >>> 8) % 13) - 6
  return [hexOf(rgbFromHsl(a + shift, 0.5, 0.62)), hexOf(rgbFromHsl(b + shift, 0.46, 0.5))]
}

/**
 * The two colours an icon is mostly made of, from its RGBA pixels (a canvas's getImageData().data). Null when nothing in
 * it has colour (a black, white or grey icon): the caller then keeps the name's gradient.
 */
export function paletteFromPixels(data: ArrayLike<number>): Palette | null {
  const buckets = new Map<number, { w: number; r: number; g: number; b: number }>()
  for (let i = 0; i + 3 < data.length; i += 4) {
    const a = data[i + 3]
    if (a < 128) continue
    const px: Rgb = [data[i], data[i + 1], data[i + 2]]
    const [, s, l] = hslOf(px)
    /* Grey, near white and near black say little about a brand: counted, but for very little. */
    const weight = s < 0.18 || l > 0.94 || l < 0.08 ? 0.04 : 0.35 + s
    const key = ((px[0] >> 4) << 8) | ((px[1] >> 4) << 4) | (px[2] >> 4)
    const cell = buckets.get(key) ?? { w: 0, r: 0, g: 0, b: 0 }
    cell.w += weight
    cell.r += px[0] * weight
    cell.g += px[1] * weight
    cell.b += px[2] * weight
    buckets.set(key, cell)
  }
  const ranked = [...buckets.values()]
    .filter((c) => c.w > 0)
    .map((c) => ({ w: c.w, rgb: [c.r / c.w, c.g / c.w, c.b / c.w] as Rgb }))
    .map((c) => ({ ...c, hsl: hslOf(c.rgb) }))
    .sort((x, y) => y.w - x.w)
  const first = ranked.find((c) => c.hsl[1] >= 0.18 && c.hsl[2] <= 0.94 && c.hsl[2] >= 0.08)
  if (!first) return null
  /*
    The second: the most common colour 24 to 110 degrees round the wheel from the first. Two colours further apart (teal
    and amber, blue and red) blend through a muddy middle; the first then pairs with its own neighbour below.
  */
  const second = ranked.find((c) => c !== first && c.hsl[1] >= 0.18 && c.hsl[2] <= 0.94 && c.hsl[2] >= 0.08 && hueGap(c.hsl[0], first.hsl[0]) >= 24 && hueGap(c.hsl[0], first.hsl[0]) <= 110 && c.w >= first.w * 0.08)
  const one = hexOf(first.rgb)
  if (second) return [one, hexOf(second.rgb)]
  /* One colour only: its neighbour, a little darker, so the ground still has depth. */
  const [h, s, l] = first.hsl
  /* Turned away from violet when the step would land there (a blue logo is not a purple wash). */
  const step = (h + 28) % 360 >= 248 && (h + 28) % 360 <= 300 ? -28 : 28
  return [one, hexOf(rgbFromHsl(h + step, s, clamp(l - 0.12, 0.2, 0.8)))]
}

/** A colour brought into the band that reads well behind a logo: not washed out, not neon, not near black. */
function tame(hex: string, lightness: [number, number]): string {
  const rgb = rgbOf(hex)
  if (!rgb) return hex
  const [h, s, l] = hslOf(rgb)
  return hexOf(rgbFromHsl(h, clamp(s, 0.3, 0.58), clamp(l, lightness[0], lightness[1])))
}

/**
 * The CSS background for a pair: the first colour from the top left, the second from the bottom right, and a soft
 * light from the top so the ground is not a flat wash.
 */
export function coverGradient([a, b]: Palette): string {
  const one = tame(a, [0.5, 0.7])
  const two = tame(b, [0.38, 0.6])
  return [
    "radial-gradient(120% 90% at 18% 0%, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 55%)",
    `radial-gradient(90% 120% at 100% 100%, ${two} 0%, rgba(0,0,0,0) 70%)`,
    `linear-gradient(135deg, ${one} 0%, ${two} 100%)`,
  ].join(", ")
}

/** The name's gradient: what a card shows before its icon is read, and when there is no icon. */
export function nameCoverGradient(name: string): string {
  return coverGradient(namePalette(name))
}

/* ── In a browser: read an icon, once ───────────────────────────────────── */

const STORE_KEY = "storelib:cover-palette:v1"
const memory = new Map<string, Palette | null>()
let stored: Record<string, Palette | null> | null = null
const pending = new Map<string, Promise<Palette | null>>()

function storedAll(): Record<string, Palette | null> {
  if (stored) return stored
  try {
    stored = JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}") as Record<string, Palette | null>
  } catch {
    stored = {}
  }
  return stored
}

function keep(key: string, p: Palette | null) {
  memory.set(key, p)
  try {
    const all = storedAll()
    all[key] = p
    /* Only the newest 200 icons are kept. */
    const keys = Object.keys(all)
    for (const k of keys.slice(0, Math.max(0, keys.length - 200))) delete all[k]
    window.localStorage.setItem(STORE_KEY, JSON.stringify(all))
  } catch {
    /* A private window or full storage: the memory copy still serves this visit. */
  }
}

/** A palette read before, from memory or localStorage; undefined when this icon has not been read yet. */
export function cachedIconPalette(src: string): Palette | null | undefined {
  if (memory.has(src)) return memory.get(src)
  if (typeof window === "undefined") return undefined
  const all = storedAll()
  if (Object.prototype.hasOwnProperty.call(all, src)) {
    memory.set(src, all[src])
    return all[src]
  }
  return undefined
}

/**
 * The icon's palette, read from a 24px copy drawn on a canvas. `fileUrl` is the file to draw (a small same origin copy
 * from the image optimizer when there is one, so the canvas is never tainted); `key` is what it is cached under.
 * Resolves to null when the icon has no colour or cannot be read.
 */
export function sampleIconPalette(key: string, fileUrl: string): Promise<Palette | null> {
  const known = cachedIconPalette(key)
  if (known !== undefined) return Promise.resolve(known)
  const running = pending.get(key)
  if (running) return running
  const job = new Promise<Palette | null>((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.decoding = "async"
    img.onload = () => {
      try {
        const size = 24
        const canvas = document.createElement("canvas")
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext("2d", { willReadFrequently: true })
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0, size, size)
        const p = paletteFromPixels(ctx.getImageData(0, 0, size, size).data)
        keep(key, p)
        resolve(p)
      } catch {
        /* A file from a host that does not allow reading it: the name's gradient stays. */
        memory.set(key, null)
        resolve(null)
      }
    }
    img.onerror = () => {
      memory.set(key, null)
      resolve(null)
    }
    img.src = fileUrl
  }).finally(() => pending.delete(key))
  pending.set(key, job)
  return job
}
