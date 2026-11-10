/**
 * ===========================================================================
 *  EVERY WORD ON A ONEPAGE CAN BE READ, ON WHATEVER IT SITS ON (wave 10)
 * ===========================================================================
 * The owner: "ensure all the themes apply very well and there is no way across
 * all of OnePage for errors like text not showing or getting hidden ... fix
 * across all places so it NEVER happens". Two of his pages: Messenger's
 * newsletter (Bold layout) drew white words on the skin's white window, and
 * Grunge's drew its title and line white on its taped paper card.
 *
 * Why it kept happening: a word's colour was chosen by one piece of code
 * (the block: "the card is my text colour, so my words are the page's
 * background") and the surface under it by another (a skin's stylesheet:
 * "every newsletter is a white window"; a creator's own block colour; a
 * theme's glass over a photo). Neither knew the other. Fixing each pair one at
 * a time (this round's two, the next theme's next two) is how it came back.
 *
 * So the rule is now one resolver, in two halves:
 *
 *   readableOn(surface, wanted)   pure. The colour `wanted` when it reads on
 *                                 `surface` (4.5:1, or 3:1 for large words),
 *                                 else the nearest colour of the same hue
 *                                 that does (only its lightness moves), else
 *                                 near black or white. A creator's own colour
 *                                 is respected until it cannot be read, then
 *                                 nudged, never replaced by another hue.
 *                                 Components that know their surface call it
 *                                 (lib/onepage/email-signup boldColors, the
 *                                 product card, the button style, the sheets).
 *
 *   guardLegibility(root)         the guarantee. In the browser, after the page
 *                                 is drawn, every element with words of its own
 *                                 (and every field, its value and placeholder)
 *                                 is measured against what is ACTUALLY painted
 *                                 under it: its own and its ancestors'
 *                                 backgrounds, colours and gradients, composited
 *                                 down to the first opaque one (a skin's
 *                                 window, a block's colour, a button's fill,
 *                                 a sheet, the page's own colour or gradient).
 *                                 A word under the minimum gets readableOn's
 *                                 colour, set !important so no skin rule can
 *                                 take it back. It does not know any theme or
 *                                 skin by name, so a theme added tomorrow (the
 *                                 themes2 track's, or anyone's) is covered the
 *                                 day it ships. components/onepage/legible-guard
 *                                 runs it on the live page, the editor's
 *                                 preview and every OnePage sheet, again
 *                                 whenever they change.
 *
 * What it cannot see, it leaves: words on a photo (a creator's picture, a
 * video) have no single colour under them; the page's photo themes carry
 * their own darkening and shadows for that. Words drawn as a gradient fill
 * (background-clip: text) are a picture of words, not a colour.
 *
 * scripts/check-onepage-legible-w10.mjs renders every theme in the picker
 * (all of them, whatever list they come from) in every block layout, plain and
 * with a creator's light text on a light theme and dark on a dark one, and
 * fails on any visible word under its minimum.
 */

export type Rgba = { r: number; g: number; b: number; a: number }

/** WCAG's minimum for body text, and for large text (24px, or 18.66px bold). */
export const MIN_CONTRAST = 4.5
export const MIN_CONTRAST_LARGE = 3

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const NAMED: Record<string, Rgba> = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  white: { r: 255, g: 255, b: 255, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
}

function num(token: string, scale: number): number {
  const t = token.trim()
  if (t === "none") return 0
  return t.endsWith("%") ? (parseFloat(t) / 100) * scale : parseFloat(t)
}

function splitArgs(inner: string): { parts: string[]; alpha: string | null } {
  const [main, alpha] = inner.split("/")
  const parts = main.includes(",") ? main.split(",") : main.trim().split(/\s+/)
  if (alpha === undefined && parts.length === 4) return { parts: parts.slice(0, 3), alpha: parts[3] }
  return { parts: parts.map((p) => p.trim()).filter(Boolean), alpha: alpha === undefined ? null : alpha.trim() }
}

const linToSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)

function oklabToRgb(L: number, A: number, B: number): { r: number; g: number; b: number } {
  const l_ = L + 0.3963377774 * A + 0.2158037573 * B
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B
  const s_ = L - 0.0894841775 * A - 1.291485548 * B
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  return { r: clamp01(linToSrgb(r)) * 255, g: clamp01(linToSrgb(g)) * 255, b: clamp01(linToSrgb(b)) * 255 }
}

/**
 * A CSS colour as a browser computes it (rgb(), rgba(), color(srgb ...), oklab(), oklch(), a hex, transparent),
 * or null for anything else.
 */
export function parseColor(input: string | null | undefined): Rgba | null {
  if (typeof input !== "string") return null
  const c = input.trim().toLowerCase()
  if (!c) return null
  if (NAMED[c]) return { ...NAMED[c] }
  const hex = /^#([0-9a-f]{3,8})$/.exec(c)
  if (hex) {
    let h = hex[1]
    if (h.length === 3 || h.length === 4) h = h.split("").map((x) => x + x).join("")
    if (h.length !== 6 && h.length !== 8) return null
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 }
  }
  const fn = /^([a-z]+)\((.*)\)$/.exec(c)
  if (!fn) return null
  const [, name, inner] = fn
  if (name === "rgb" || name === "rgba") {
    const { parts, alpha } = splitArgs(inner)
    if (parts.length < 3) return null
    return { r: num(parts[0], 255), g: num(parts[1], 255), b: num(parts[2], 255), a: alpha === null ? 1 : clamp01(num(alpha, 1)) }
  }
  if (name === "color") {
    const { parts, alpha } = splitArgs(inner)
    if (parts[0] !== "srgb" && parts[0] !== "srgb-linear" && parts[0] !== "display-p3") return null
    const lin = parts[0] === "srgb-linear"
    const ch = (i: number) => {
      const v = clamp01(num(parts[i], 1))
      return (lin ? linToSrgb(v) : v) * 255
    }
    return { r: ch(1), g: ch(2), b: ch(3), a: alpha === null ? 1 : clamp01(num(alpha, 1)) }
  }
  if (name === "oklab" || name === "oklch") {
    const { parts, alpha } = splitArgs(inner)
    if (parts.length < 3) return null
    const L = num(parts[0], 1)
    let A: number
    let B: number
    if (name === "oklab") {
      A = num(parts[1], 0.4)
      B = num(parts[2], 0.4)
    } else {
      const C = num(parts[1], 0.4)
      const H = (parseFloat(parts[2]) || 0) * (Math.PI / 180)
      A = C * Math.cos(H)
      B = C * Math.sin(H)
    }
    return { ...oklabToRgb(L, A, B), a: alpha === null ? 1 : clamp01(num(alpha, 1)) }
  }
  if (name === "hsl" || name === "hsla") {
    const { parts, alpha } = splitArgs(inner)
    if (parts.length < 3) return null
    const rgb = hslToRgb(parseFloat(parts[0]) || 0, num(parts[1], 1), num(parts[2], 1))
    return { ...rgb, a: alpha === null ? 1 : clamp01(num(alpha, 1)) }
  }
  return null
}

/** `top` painted over `bottom` (source-over). */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a + bottom.a * (1 - top.a)
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 }
  const mix = (t: number, b: number) => (t * top.a + b * bottom.a * (1 - top.a)) / a
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a }
}

const chan = (v: number) => {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
export function luminance(c: Rgba): number {
  return 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b)
}
/** WCAG contrast of two opaque colours (a translucent `fg` is laid over `bg` first). */
export function contrast(fg: Rgba, bg: Rgba): number {
  const f = fg.a < 1 ? over(fg, { ...bg, a: 1 }) : fg
  const a = luminance(f)
  const b = luminance(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** A colour as CSS: hex when solid, rgba() when see-through. */
export function toCss(c: Rgba): string {
  return c.a >= 0.999 ? toHex(c) : `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${Math.round(c.a * 1000) / 1000})`
}

export function toHex(c: Rgba): string {
  const x = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0")
  return `#${x(c.r)}${x(c.g)}${x(c.b)}`
}

function rgbToHsl({ r, g, b }: Rgba): { h: number; s: number; l: number } {
  const rr = r / 255
  const gg = g / 255
  const bb = b / 255
  const max = Math.max(rr, gg, bb)
  const min = Math.min(rr, gg, bb)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h = max === rr ? ((gg - bb) / d) % 6 : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4
  h *= 60
  if (h < 0) h += 360
  return { h, s, l }
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hh = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hh % 2) - 1))
  const [r, g, b] = hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x]
  const m = l - c / 2
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

/** The minimum for words of this size and weight. */
export function minimumFor(fontSizePx: number, fontWeight: number): number {
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700) ? MIN_CONTRAST_LARGE : MIN_CONTRAST
}

/**
 * The colour nearest `wanted` (same hue and saturation, lightness moved the least) that reads at `min` on every
 * one of `grounds`; near black or white when none of that hue does. `wanted` itself when it already reads.
 */
export function nudgeOn(wanted: Rgba, grounds: Rgba[], min = MIN_CONTRAST): Rgba {
  const opaque = { ...wanted, a: 1 }
  const worst = (c: Rgba) => Math.min(...grounds.map((g) => contrast(c, g)))
  if (worst(wanted) >= min) return wanted
  if (wanted.a < 1 && worst(opaque) >= min + NUDGE_MARGIN) {
    /* A see-through colour (a placeholder's half-strength ink): made just strong enough, not solid. */
    let lo = wanted.a
    let hi = 1
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2
      if (worst({ ...wanted, a: mid }) >= min + NUDGE_MARGIN) hi = mid
      else lo = mid
    }
    return { ...wanted, a: hi }
  }
  if (worst(opaque) >= min) return opaque
  const { h, s, l } = rgbToHsl(opaque)
  const at = (ll: number): Rgba => ({ ...hslToRgb(h, s, ll), a: 1 })
  /*
   * Once a colour has to move, it moves with room to spare (NUDGE_MARGIN over the minimum) so grain, a scene or a
   * sparkle under the words does not take it back under; a colour that was all but invisible (under 2:1: white on a
   * white window) crosses over to a strong ink (7:1), not to a grey that only just passes.
   */
  const aim = worst(opaque) < 2 ? Math.max(7, min + NUDGE_MARGIN) : min + NUDGE_MARGIN
  for (const target of [aim, min]) {
    let best: Rgba | null = null
    let bestMove = Infinity
    for (const end of [0, 1]) {
      if (worst(at(end)) < target) continue
      /* The least move toward `end` that reads: contrast only grows on the way, against a ground on the other side. */
      let lo = l
      let hi = end
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2
        if (worst(at(mid)) >= target) hi = mid
        else lo = mid
      }
      const move = Math.abs(hi - l)
      if (move < bestMove) {
        bestMove = move
        best = at(hi)
      }
    }
    if (best) return best
  }
  const black = { r: 17, g: 17, b: 19, a: 1 }
  const white = { r: 255, g: 255, b: 255, a: 1 }
  return worst(black) >= worst(white) ? black : white
}

/** How far over the minimum a colour the resolver had to move lands. */
export const NUDGE_MARGIN = 1.5

/**
 * THE RESOLVER. `wanted` on `surface` when it reads (4.5:1; 3:1 with `large`), else the nearest colour of its hue
 * that does. Both are CSS colours; a surface that is not one colour (a gradient) passes its stops as an array, and
 * the answer reads on every one. Unparseable input gives `wanted` back untouched.
 */
export function readableOn(surface: string | readonly string[], wanted: string, opts: { large?: boolean; min?: number } = {}): string {
  const fg = parseColor(wanted)
  const grounds = (Array.isArray(surface) ? surface : [surface]).map((s) => parseColor(s)).filter((c): c is Rgba => !!c && c.a > 0)
  if (!fg || !grounds.length) return wanted
  const solid = grounds.map((g) => (g.a < 1 ? over(g, { r: 255, g: 255, b: 255, a: 1 }) : g))
  const min = opts.min ?? (opts.large ? MIN_CONTRAST_LARGE : MIN_CONTRAST)
  const out = nudgeOn(fg, solid, min)
  return out === fg ? wanted : toHex(out)
}

/** The colours a CSS gradient (as computed: rgb()/rgba()/color()/oklch()) passes through; empty for none. */
export function gradientColors(image: string): Rgba[] {
  const out: Rgba[] = []
  const re = /(rgba?\([^)]*\)|color\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\)|hsla?\([^)]*\)|#[0-9a-f]{3,8}\b|\btransparent\b)/gi
  for (const m of image.matchAll(re)) {
    const c = parseColor(m[1])
    if (c) out.push(c)
  }
  return out
}

/* ── In the browser: what is actually painted under each word ─────────────── */

/** Splits a computed background-image into its layers, respecting commas inside functions. */
function splitLayers(value: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ""
  for (const ch of value) {
    if (ch === "(") depth++
    if (ch === ")") depth--
    if (ch === "," && depth === 0) {
      out.push(cur.trim())
      cur = ""
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/** Does a background layer of this size cover the element's box? A title bar or a strip of tape does not count. */
function covers(size: string, box: DOMRect): boolean {
  const s = size.trim()
  if (!s || s === "auto" || s === "auto auto" || s === "cover") return true
  if (s === "contain") return false
  const [w, h = "auto"] = s.split(/\s+/)
  const dim = (v: string, full: number) => (v === "auto" ? full : v.endsWith("%") ? (parseFloat(v) / 100) * full : parseFloat(v))
  return dim(w, box.width) >= box.width * 0.9 && dim(h, box.height) >= box.height * 0.9
}

/**
 * A box's opacity at rest: a box fading in (an entrance, a sheet rising) is not a word that cannot be read, so while
 * an animation or a transition runs on it its opacity counts as whole; the guard measures again when it ends.
 */
function restingOpacity(node: Element, cs: CSSStyleDeclaration): number {
  const o = parseFloat(cs.opacity)
  if (!Number.isFinite(o)) return 1
  if (o < 1 && typeof (node as Element & { getAnimations?: () => Animation[] }).getAnimations === "function") {
    if (node.getAnimations().some((a) => a.playState === "running" || a.playState === "paused")) return 1
  }
  return o
}

/**
 * `uncertain`: the ground is a guess, not a measure. Two or more see-through layers (glass on glass: the browser's
 * blur and the page's pattern under them change what shows), or words straight on the page, where a pattern, a grain
 * or a drifting gradient is drawn beside the page's box rather than under it in the tree.
 */
export type GroundRead = { grounds: Rgba[]; photo: boolean; opacity: number; sheened: Rgba[] | null; owner: Element | null; uncertain: boolean }

/** One painted layer of a box, top first: the colours it may show, or a picture. */
type Stops = { axis: "x" | "y"; from: number; length: number; stops: { c: Rgba; at: number }[] }
type Entry = { colors: Rgba[]; sheen?: boolean; stops?: Stops } | { photo: true }
export type GroundCache = Map<Element, { entries: Entry[]; opacity: number; clipText: boolean }>

function entriesOf(node: Element, cache: GroundCache) {
  let info = cache.get(node)
  if (info) return info
  const cs = getComputedStyle(node)
  const entries: Entry[] = []
  const clip = cs.backgroundClip || (cs as unknown as Record<string, string>).webkitBackgroundClip || ""
  const clipText = /text/.test(clip)
  const image = cs.backgroundImage
  if (image && image !== "none" && !clipText) {
    const sizes = splitLayers(cs.backgroundSize || "auto")
    const box = node.getBoundingClientRect()
    splitLayers(image).forEach((layer, i) => {
      const size = sizes[i % Math.max(1, sizes.length)] || "auto"
      if (!covers(size, box)) return
      if (/^url\(/i.test(layer)) {
        /* A drawn svg (a skin's grain, a pattern) is texture over the colour; any other picture is a photo. */
        if (!/^url\(["']?data:image\/svg\+xml/i.test(layer)) entries.push({ photo: true })
        return
      }
      if (!/gradient\(/i.test(layer)) return
      const colors = gradientColors(layer)
      const stops = linearStops(layer, box)
      /* A sheen: a gloss or a shade of only white or black, translucent (a gel's highlight). The words sit on the colour under it. */
      const sheen = colors.every((c) => c.a < 1 && ((c.r > 250 && c.g > 250 && c.b > 250) || (c.r < 5 && c.g < 5 && c.b < 5) || c.a === 0)) && colors.some((c) => c.a > 0)
      if (colors.length) entries.push({ colors, sheen, stops: stops ?? undefined })
    })
  }
  const bg = parseColor(cs.backgroundColor)
  if (bg && bg.a > 0 && !clipText) entries.push({ colors: [bg] })
  info = { entries, opacity: restingOpacity(node, cs), clipText }
  cache.set(node, info)
  return info
}

/**
 * A straight up-and-down or side-to-side linear gradient's stops, placed in px along the box (as computed:
 * "linear-gradient(rgba(0, 0, 0, 0) calc(100% - 48px), rgb(255, 255, 255) 100%)"), so the words are measured on
 * the stretch of it they sit on, not on a colour it only reaches below them. Null for any other gradient.
 */
function linearStops(layer: string, box: DOMRect): Stops | null {
  const m = /^linear-gradient\((.*)\)$/i.exec(layer.trim())
  if (!m) return null
  const args = splitLayers(m[1])
  let axis: "x" | "y" = "y"
  let reverse = false
  const first = args[0]?.trim() || ""
  if (/^(to |-?[\d.]+(deg|turn|rad))/i.test(first)) {
    args.shift()
    const d = first.toLowerCase()
    if (d === "to bottom" || d === "180deg" || d === "0.5turn") axis = "y"
    else if (d === "to top" || d === "0deg") (axis = "y"), (reverse = true)
    else if (d === "to right" || d === "90deg") axis = "x"
    else if (d === "to left" || d === "270deg") (axis = "x"), (reverse = true)
    else return null
  }
  const length = axis === "y" ? box.height : box.width
  const from = axis === "y" ? box.top : box.left
  const pos = (t: string): number | null => {
    const v = t.trim()
    if (!v) return null
    const calc = /^calc\(\s*([\d.]+)%\s*([+-])\s*([\d.]+)px\s*\)$/.exec(v)
    if (calc) return (parseFloat(calc[1]) / 100) * length + (calc[2] === "-" ? -1 : 1) * parseFloat(calc[3])
    if (v.endsWith("%")) return (parseFloat(v) / 100) * length
    if (v.endsWith("px")) return parseFloat(v)
    return null
  }
  const raw: { c: Rgba; at: number | null }[] = []
  for (const a of args) {
    const color = /^(rgba?\([^)]*\)|color\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\)|hsla?\([^)]*\)|#[0-9a-f]{3,8}|transparent)\s*(.*)$/i.exec(a.trim())
    if (!color) return null
    const c = parseColor(color[1])
    if (!c) return null
    const positions = splitLayers(color[2].replace(/\s+(?![^(]*\))/g, ",")).filter(Boolean)
    if (!positions.length) raw.push({ c, at: null })
    for (const p of positions) raw.push({ c, at: pos(p) })
  }
  if (raw.length < 2) return null
  if (raw[0].at === null) raw[0].at = 0
  if (raw[raw.length - 1].at === null) raw[raw.length - 1].at = length
  for (let i = 1; i < raw.length - 1; i++) {
    if (raw[i].at !== null) continue
    let j = i
    while (raw[j].at === null) j++
    const a0 = raw[i - 1].at as number
    const a1 = raw[j].at as number
    for (let k = i; k < j; k++) raw[k].at = a0 + ((a1 - a0) * (k - i + 1)) / (j - i + 1)
  }
  let stops = raw.map((r) => ({ c: r.c, at: r.at as number }))
  for (let i = 1; i < stops.length; i++) if (stops[i].at < stops[i - 1].at) stops[i].at = stops[i - 1].at
  if (reverse) stops = stops.map((st) => ({ c: st.c, at: length - st.at })).reverse()
  return { axis, from, length, stops }
}

/** The colours a gradient shows between `a` and `b` (px along its axis from its box's start). */
function colorsBetween(st: Stops, a: number, b: number): Rgba[] {
  const at = (x: number): Rgba => {
    const s = st.stops
    if (x <= s[0].at) return s[0].c
    if (x >= s[s.length - 1].at) return s[s.length - 1].c
    for (let i = 1; i < s.length; i++)
      if (x <= s[i].at) {
        const t = s[i].at === s[i - 1].at ? 1 : (x - s[i - 1].at) / (s[i].at - s[i - 1].at)
        const p = s[i - 1].c
        const q = s[i].c
        return { r: p.r + (q.r - p.r) * t, g: p.g + (q.g - p.g) * t, b: p.b + (q.b - p.b) * t, a: p.a + (q.a - p.a) * t }
      }
    return s[s.length - 1].c
  }
  return [at(a), ...st.stops.filter((x) => x.at > a && x.at < b).map((x) => x.c), at(b)]
}

/** A stack of layers (top first) composited bottom up, over white when nothing was opaque (the document's own ground). */
function composite(stack: Rgba[][]): Rgba[] {
  let grounds: Rgba[] = [{ r: 255, g: 255, b: 255, a: 1 }]
  for (let i = stack.length - 1; i >= 0; i--) {
    const next: Rgba[] = []
    for (const top of stack[i]) for (const under of grounds) next.push(over(top, under))
    next.sort((a, b) => luminance(a) - luminance(b))
    /* Keep a handful, the extremes and evenly between them, so a long stack stays cheap. */
    grounds = next.length <= 6 ? next : [0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => next[Math.round(f * (next.length - 1))])
  }
  return grounds.map((g) => ({ ...g, a: 1 }))
}

/** The colour of a text-shadow that outlines the words, when it is strong enough to count as a halo; else null. */
export function haloOf(textShadow: string | null | undefined): Rgba | null {
  if (!textShadow || textShadow === "none") return null
  const c = gradientColors(textShadow)[0]
  return c && c.a >= 0.35 ? c : null
}

/**
 * What is painted under `el`'s words: the backgrounds of `el` and its ancestors, top down, until an opaque one,
 * composited. `photo` when a picture (a url other than a drawn svg) is reached first: no colour can be promised there.
 * `opacity` is what the ancestors between the words and their ground fade the words by.
 */
export function groundUnder(el: Element, cache: GroundCache = new Map()): GroundRead {
  const r = el.getBoundingClientRect()
  const stack: Rgba[][] = []
  const full: Rgba[][] = []
  let opacity = 1
  let photo = false
  let done = false
  let owner: Element | null = null
  for (let node: Element | null = el; node && !done; node = node.parentElement) {
    owner = node
    const info = entriesOf(node, cache)
    for (const e of info.entries) {
      if ("photo" in e) {
        photo = true
        done = true
        break
      }
      const colors = e.stops ? (e.stops.axis === "y" ? colorsBetween(e.stops, r.top - e.stops.from, r.bottom - e.stops.from) : colorsBetween(e.stops, r.left - e.stops.from, r.right - e.stops.from)) : e.colors
      full.push(colors)
      if (!e.sheen) stack.push(colors)
      if (colors.every((c) => c.a >= 0.999)) {
        done = true
        break
      }
    }
    if (!done && node !== el) opacity *= info.opacity
  }
  const grounds = composite(stack)
  const seeThrough = stack.filter((l) => l.some((c) => c.a < 0.999)).length
  const onPage = !!owner && owner.matches(".onepage-live, [data-onepage-drag-scope], [data-op-skin]")
  return { grounds, photo, opacity, sheened: full.length !== stack.length ? composite(full) : null, owner, uncertain: seeThrough >= 2 || onPage }
}

export type LegibleFinding = {
  el: Element
  kind: "text" | "value" | "placeholder" | "halo"
  text: string
  color: string
  ground: string
  ratio: number
  min: number
  /** For a "halo": the outline's colour (else the opposite tone of the words). */
  halo?: string
  /** A new colour on a ground that is a guess: an outline as well. */
  alsoHalo?: boolean
}

/* Never words to read: code, pictures, and a skin's scene (its words are drawn texture, aria-hidden, like its clouds). */
const SKIP = "script,style,noscript,template,svg,canvas,video,audio,iframe,[data-legible-skip],[data-skin-scene]"

function ownText(el: Element): string {
  let t = ""
  for (const n of el.childNodes) if (n.nodeType === 3) t += n.textContent || ""
  return t.replace(/\s+/g, " ").trim()
}

/** Is any box from `el` up hidden (inert, or at no opacity)? Remembered per box for one pass. */
function shut(el: Element | null, memo: Map<Element, boolean>): boolean {
  if (!el) return false
  const known = memo.get(el)
  if (known !== undefined) return known
  const v = el.hasAttribute("inert") || getComputedStyle(el).opacity === "0" || shut(el.parentElement, memo)
  memo.set(el, v)
  return v
}

function visible(el: Element, cs: CSSStyleDeclaration, memo: Map<Element, boolean> = new Map()): boolean {
  if (cs.visibility !== "visible" || cs.display === "none") return false
  /* Off screen under content-visibility: auto, the browser has not drawn it; it is measured when it comes into view. */
  const check = (el as Element & { checkVisibility?: (o: object) => boolean }).checkVisibility
  if (typeof check === "function" && !check.call(el, { contentVisibilityAuto: true })) return false
  const r = el.getBoundingClientRect()
  if (r.width < 1 || r.height < 1) return false
  /* A closed sheet or menu: an ancestor at no opacity, or out of the page's flow and hidden. */
  return !shut(el, memo)
}

/** Every visible word (and field) under `root` that does not read on what is under it. Nothing is changed. */
function skipMemo(el: Element, memo: Map<Element, boolean>): boolean {
  const known = memo.get(el)
  if (known !== undefined) return known
  const v = el.matches(SKIP) || (!!el.parentElement && skipMemo(el.parentElement, memo))
  memo.set(el, v)
  return v
}

export function findIllegible(root: ParentNode): LegibleFinding[] {
  const cache: GroundCache = new Map()
  const memo = new Map<Element, boolean>()
  const skipped = new Map<Element, boolean>()
  const out: LegibleFinding[] = []
  const all = root.querySelectorAll("*")
  for (const el of all) {
    if (skipMemo(el, skipped)) continue
    const field = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
    if (field && el instanceof HTMLInputElement && /^(checkbox|radio|hidden|range|color|file|submit|button|image)$/.test(el.type)) continue
    const text = field ? "" : ownText(el)
    if (!field && !text) continue
    const cs = getComputedStyle(el)
    if (!visible(el, cs, memo)) continue
    const fill = (cs as unknown as Record<string, string>).webkitTextFillColor
    if (fill && parseColor(fill)?.a === 0) continue
    const ground = groundUnder(el, cache)
    if (ground.photo || cache.get(el)?.clipText) continue
    /*
     * Words straight on a skinned page sit on its scene too (grain, dots, scribbles, drawn beside the page, not
     * under it in the tree, so not in `grounds`): they get NUDGE_MARGIN of room over the minimum.
     */
    const onScene = !!ground.owner && ground.owner.hasAttribute("data-op-skin")
    const baseMin = minimumFor(parseFloat(cs.fontSize) || 16, parseInt(cs.fontWeight) || 400) + (onScene ? 1 : 0)
    const check = (kind: LegibleFinding["kind"], colorText: string | null | undefined, words: string, ownOpacity: number) => {
      /* A field cannot carry an outline, and a placeholder is thin, light type: fields get half a step of room instead. */
      const min = kind !== "text" ? baseMin + 0.5 : baseMin
      const c = parseColor(colorText)
      /* Clear words are meant to be clear (a placeholder hidden while typing, a label behind its own picture). */
      if (!c || c.a === 0) return
      const shown = { ...c, a: c.a * ground.opacity * ownOpacity }
      const ratio = Math.min(...ground.grounds.map((g) => contrast(shown, g)))
      if (ratio + 0.01 < min) out.push({ el, kind, text: words, color: toCss(c), ground: toHex(ground.grounds[0]), ratio: Math.round(ratio * 100) / 100, min, alsoHalo: kind === "text" && ground.uncertain && !haloOf(cs.textShadow) })
      else if (kind === "text" && onScene && !haloOf(cs.textShadow) && min - 1 > MIN_CONTRAST - 0.01) {
        /* Small words straight on a skin's scene (grain, dots): a soft outline in the page's own colour lifts them off it. */
        out.push({ el, kind: "halo", text: words, color: toHex(c), ground: toHex(ground.grounds[0]), ratio: Math.round(ratio * 100) / 100, min, halo: toHex(ground.grounds[0]) })
      } else if (kind === "text" && ground.uncertain && ratio + 0.01 < min + NUDGE_MARGIN && !haloOf(cs.textShadow)) {
        /* Reads, but on a ground that is a guess (glass on glass, the page's own pattern): a soft outline of the other tone, rather than a new colour. */
        out.push({ el, kind: "halo", text: words, color: toHex(c), ground: toHex(ground.grounds[0]), ratio: Math.round(ratio * 100) / 100, min })
      } else if (kind === "text" && ground.sheened) {
        /* Reads on the gel's colour, but its gloss takes it under: an outline of the other tone, unless it has one. */
        const sheen = Math.min(...ground.sheened.map((g) => contrast(shown, g)))
        const halo = haloOf(cs.textShadow)
        if (sheen + 0.01 < min && !(halo && contrast({ ...c, a: 1 }, { ...halo, a: 1 }) >= min))
          out.push({ el, kind: "halo", text: words, color: toHex(c), ground: toHex(ground.sheened[0]), ratio: Math.round(sheen * 100) / 100, min })
      }
    }
    const ownOpacity = restingOpacity(el, cs)
    if (field) {
      const value = (el as HTMLInputElement).value
      if (value) check("value", cs.color, value, ownOpacity)
      const ph = (el as HTMLInputElement).placeholder
      if (ph && !value) check("placeholder", getComputedStyle(el, "::placeholder").color, ph, ownOpacity)
    } else check("text", fill && parseColor(fill)?.a ? fill : cs.color, text, ownOpacity)
  }
  return out
}

const NUDGED = "data-op-legible"
const PLACEHOLDER_VAR = "--op-legible-ph"

/** Takes back every colour the guard set under `root`, so the next pass measures what the page itself draws. */
export function releaseLegibility(root: ParentNode): void {
  for (const el of root.querySelectorAll(`[${NUDGED}]`)) {
    const h = el as HTMLElement
    const what = h.getAttribute(NUDGED) || ""
    if (what.includes("c")) {
      h.style.removeProperty("color")
      h.style.removeProperty("-webkit-text-fill-color")
      const was = h.dataset.opLegibleWas
      if (was) {
        const important = was.endsWith(" !important")
        h.style.setProperty("color", important ? was.slice(0, -11) : was, important ? "important" : "")
      }
      delete h.dataset.opLegibleWas
    }
    if (what.includes("o")) h.style.removeProperty("opacity")
    if (what.includes("h")) h.style.removeProperty("text-shadow")
    if (what.includes("p")) h.style.removeProperty(PLACEHOLDER_VAR)
    h.removeAttribute(NUDGED)
  }
}

/** The rule that lets the guard colour a placeholder (inline styles cannot reach ::placeholder). */
export const LEGIBLE_CSS = `[${NUDGED}*="p"]::placeholder{color:var(${PLACEHOLDER_VAR}) !important;-webkit-text-fill-color:var(${PLACEHOLDER_VAR}) !important;opacity:1 !important}`

/**
 * Words all but invisible (under 2:1: white on a white window) have no colour of their own worth keeping: they take
 * the nearest ink around them that reads (the card's, the page's, as the browser computed it for an ancestor), so a
 * rescued title wears the theme's own navy or black rather than a grey. Null when no ancestor's ink reads.
 */
function inkAround(el: Element, grounds: Rgba[], aim: number): Rgba | null {
  const seen = new Set<string>()
  for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
    const raw = getComputedStyle(a).color
    if (seen.has(raw)) continue
    seen.add(raw)
    const c = parseColor(raw)
    if (c && c.a >= 0.999 && Math.min(...grounds.map((g) => contrast(c, g))) >= aim) return c
  }
  return null
}

/** A soft outline under words: the ground's side of them (dark under light words, light under dark), or `color`. */
function outline(h: HTMLElement, words: Rgba, ground: GroundRead, color?: string): void {
  const dark = luminance(ground.grounds[Math.floor(ground.grounds.length / 2)]) < luminance(words)
  h.style.setProperty(
    "text-shadow",
    color ? `0 0 2px ${color}, 0 0 4px ${color}, 0 0 6px ${color}` : dark ? "0 0 1px rgba(0,0,0,.7), 0 1px 3px rgba(0,0,0,.6)" : "0 0 1px rgba(255,255,255,.8), 0 1px 3px rgba(255,255,255,.7)",
    "important",
  )
}

/**
 * THE GUARANTEE. Measures every visible word under `root` against what is painted under it and gives each one that
 * does not read the nearest colour that does (readableOn's rule), !important. Anything the guard set before is taken
 * back first, so a creator's change (a colour, a theme) is measured afresh. Returns what it changed.
 */
export function guardLegibility(root: ParentNode): LegibleFinding[] {
  releaseLegibility(root)
  const found = findIllegible(root)
  /* Every read first (grounds, inks, opacities), then every write: a write between reads would make the browser
     work out the page's styles again for each word. */
  const cache: GroundCache = new Map()
  const plans = found.map((f) => {
    const h = f.el as HTMLElement
    const ground = groundUnder(h, cache)
    const wanted = parseColor(f.color)!
    const fixed = (f.ratio < 2 && f.kind !== "halo" && inkAround(h, ground.grounds, f.min + NUDGE_MARGIN)) || nudgeOn(wanted, ground.grounds, f.min)
    const own = f.kind === "text" || f.kind === "value" ? restingOpacity(h, getComputedStyle(h)) : 1
    /* Words faded by their own opacity that still do not read at full colour: shown whole. */
    const whole = own < 1 && Math.min(...ground.grounds.map((g) => contrast({ ...fixed, a: own * ground.opacity }, g))) < f.min
    return { f, h, ground, wanted, fixed, whole }
  })
  for (const { f, h, ground, wanted, fixed, whole } of plans) {
    const marks = new Set((h.getAttribute(NUDGED) || "").split("").filter(Boolean))
    if (f.kind === "halo") {
      outline(h, wanted, ground, f.halo)
      marks.add("h")
    } else if (f.kind === "placeholder") {
      h.style.setProperty(PLACEHOLDER_VAR, toCss(fixed))
      marks.add("p")
    } else {
      if (!marks.has("c")) {
        const was = h.style.getPropertyValue("color")
        if (was) h.dataset.opLegibleWas = h.style.getPropertyPriority("color") === "important" ? `${was} !important` : was
      }
      h.style.setProperty("color", toCss(fixed), "important")
      h.style.setProperty("-webkit-text-fill-color", toCss(fixed), "important")
      marks.add("c")
      if (f.alsoHalo) {
        outline(h, fixed, ground)
        marks.add("h")
      }
      if (whole) {
        h.style.setProperty("opacity", "1", "important")
        marks.add("o")
      }
    }
    h.setAttribute(NUDGED, [...marks].join(""))
  }
  return found
}
