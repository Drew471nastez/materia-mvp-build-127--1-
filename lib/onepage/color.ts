// OnePage: colour arithmetic for the editor's colour picker
// Location: lib/onepage/color.ts
//
// Plain functions, no React, so tests/onepage-editor-ui.test.ts can hold them
// to exact numbers. The picker (components/onepage/color-picker.tsx) works in
// HSV because that is the shape of what it draws: a square whose x is
// saturation and whose y is brightness, over a hue chosen on a strip. The
// theme stores hex, so every move goes HSV -> hex, and every value that
// arrives (a swatch, a typed code, the eyedropper) goes hex -> HSV.
//
// ONE THING HSV CANNOT KEEP: the hue of a grey. #808080 has no hue, so a
// round trip through hex would snap the strip back to red every time the
// square touched its left or bottom edge. The picker keeps its own hue while
// the colour is grey and only takes the hue from hex when there is one
// (see `hsvFromHex(hex, keepHue)`).

export interface Hsv {
  /** 0 to 360 */
  h: number
  /** 0 to 1 */
  s: number
  /** 0 to 1 */
  v: number
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * A colour typed or pasted however people type them ("fff", "#FFF",
 * " #b2846c ", "B2846C") as "#rrggbb", or null when it is not one. An eight
 * digit value keeps only its colour: the picker has no alpha, and the few
 * theme fields that carry one (the pattern colour) add it back themselves.
 */
export function normalizeHex(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  let t = raw.trim().replace(/^#/, "").toLowerCase()
  if (/^[0-9a-f]{3}$/.test(t)) t = t.split("").map((c) => c + c).join("")
  if (/^[0-9a-f]{8}$/.test(t)) t = t.slice(0, 6)
  return /^[0-9a-f]{6}$/.test(t) ? `#${t}` : null
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = normalizeHex(hex) ?? "#000000"
  return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) }
}

export function rgbToHex(r: number, g: number, b: number): string {
  const x = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0")
  return `#${x(r)}${x(g)}${x(b)}`
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const hh = ((h % 360) + 360) % 360 / 60
  const ss = clamp(s, 0, 1)
  const vv = clamp(v, 0, 1)
  const c = vv * ss
  const x = c * (1 - Math.abs((hh % 2) - 1))
  const m = vv - c
  const [r, g, b] =
    hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x]
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

/** Hex to HSV. A grey has no hue of its own, so it keeps `keepHue` (see the note above). */
export function hsvFromHex(hex: string, keepHue = 0): Hsv {
  const { r, g, b } = hexToRgb(hex)
  const rr = r / 255
  const gg = g / 255
  const bb = b / 255
  const max = Math.max(rr, gg, bb)
  const min = Math.min(rr, gg, bb)
  const d = max - min
  let h = keepHue
  if (d > 0) {
    if (max === rr) h = 60 * (((gg - bb) / d) % 6)
    else if (max === gg) h = 60 * ((bb - rr) / d + 2)
    else h = 60 * ((rr - gg) / d + 4)
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

/** Relative luminance, 0 (black) to 1 (white), for choosing a mark that shows on a swatch. */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Is a swatch so light that it needs a hairline to be seen on white? */
export function isNearWhite(hex: string): boolean {
  return luminance(hex) > 0.86
}

/* ── Recently used ─────────────────────────────────────────────────────── */

export const RECENT_COLORS_KEY = "onepage-recent-colors"
export const RECENT_COLORS_MAX = 8

/** The recent list with `hex` at its front, once, and at most RECENT_COLORS_MAX long. */
export function pushRecent(list: readonly string[], hex: string): string[] {
  const h = normalizeHex(hex)
  if (!h) return list.slice(0, RECENT_COLORS_MAX)
  return [h, ...list.filter((c) => normalizeHex(c) !== h)].slice(0, RECENT_COLORS_MAX)
}

/** What was stored, read defensively: a private window or a hand-edited value gives an empty list. */
export function readRecent(raw: string | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return v.map(normalizeHex).filter((c): c is string => !!c).slice(0, RECENT_COLORS_MAX)
  } catch {
    return []
  }
}
