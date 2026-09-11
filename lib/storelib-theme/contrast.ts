/**
 * ===========================================================================
 *  IS THIS READABLE
 * ===========================================================================
 * A colour scheme is seventeen values somebody can set to anything, and one
 * of the easy mistakes is a pair that looks fine on the designer's screen at
 * midnight and disappears in daylight on a phone. WCAG puts a number on it:
 * the ratio between the lightness of the text and the lightness of what is
 * behind it, 4.5 to 1 for ordinary type and 3 to 1 once the type is large
 * (24px, or 18.66px when it is bold).
 *
 * This is the arithmetic, and only the arithmetic. It lives in the theme
 * package because both the editor's warning and the accessibility probe ask
 * the same question, and two implementations of a formula are two answers.
 *
 * WHAT IT WILL NOT DO. It does not guess. Text on a gradient, on a picture,
 * or on `transparent` has no single colour behind it, so those pairs come
 * back as unknown rather than as a pass. A false all-clear is worse than no
 * answer, because somebody acts on it.
 */
import type { ColorScheme, SchemeColorKey } from "./color-schemes"

export interface Rgb { r: number; g: number; b: number; a: number }

/** `#abc`, `#aabbcc`, `#aabbccdd`, `rgb(...)`, `rgba(...)`. */
export function parseColor(input: string | undefined | null): Rgb | null {
  if (typeof input !== "string") return null
  const s = input.trim().toLowerCase()
  if (!s || s === "transparent" || s === "none" || s === "inherit" || s === "currentcolor") return null

  const hex = /^#([0-9a-f]{3,8})$/.exec(s)
  if (hex) {
    const h = hex[1]
    const pair = (i: number) => parseInt(h.length <= 4 ? h[i] + h[i] : h.slice(i * 2, i * 2 + 2), 16)
    if (h.length === 3 || h.length === 6) return { r: pair(0), g: pair(1), b: pair(2), a: 1 }
    if (h.length === 4 || h.length === 8) return { r: pair(0), g: pair(1), b: pair(2), a: pair(3) / 255 }
    return null
  }

  const fn = /^rgba?\(([^)]+)\)$/.exec(s)
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean)
    const n = parts.map((p) => (p.endsWith("%") ? (parseFloat(p) / 100) * 255 : parseFloat(p)))
    if (n.length < 3 || n.slice(0, 3).some((v) => !Number.isFinite(v))) return null
    let a = 1
    if (parts.length > 3) {
      const raw = parts[3]
      a = raw.endsWith("%") ? parseFloat(raw) / 100 : parseFloat(raw)
      if (!Number.isFinite(a)) a = 1
    }
    return { r: n[0], g: n[1], b: n[2], a: Math.min(1, Math.max(0, a)) }
  }
  return null
}

/** Semi-transparent text is composited onto what is behind it first. */
export function over(fg: Rgb, bg: Rgb): Rgb {
  if (fg.a >= 1) return fg
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  }
}

function luminance(c: Rgb): number {
  const ch = (v: number) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b)
}

/** 1 (identical) to 21 (black on white). */
export function contrastRatio(fg: Rgb, bg: Rgb): number {
  const a = luminance(over(fg, bg))
  const b = luminance(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

export interface ContrastPair {
  /** Which two scheme values. */
  fg: SchemeColorKey
  bg: SchemeColorKey
  /** What to call it in a sentence. */
  label: string
  /** 4.5 for ordinary type, 3 for type that is always large. */
  need: number
}

/**
 * The pairs a visitor actually reads. Not every combination of seventeen
 * values: `border` on `background` is a line, not a word, and warning about
 * a subtle divider is how a warning gets ignored.
 *
 * Headings ask for 3:1 because a heading is large type. Where somebody sets
 * a 14px heading this is generous, but a heading small enough for 4.5 to
 * matter is a typography choice rather than a colour one.
 */
export const READ_PAIRS: ContrastPair[] = [
  { fg: "text", bg: "background", label: "Text on the background", need: 4.5 },
  { fg: "text_muted", bg: "background", label: "Muted text on the background", need: 4.5 },
  { fg: "heading", bg: "background", label: "Headings on the background", need: 3 },
  { fg: "link", bg: "background", label: "Links on the background", need: 4.5 },
  { fg: "text", bg: "background_secondary", label: "Text on the secondary background", need: 4.5 },
  { fg: "primary_button_text", bg: "primary_button_background", label: "The primary button's label", need: 4.5 },
  { fg: "secondary_button_text", bg: "secondary_button_background", label: "The secondary button's label", need: 4.5 },
  { fg: "input_text", bg: "input_background", label: "Text typed into an input", need: 4.5 },
]

export interface ContrastFinding extends ContrastPair {
  ratio: number
}

export interface SchemeContrast {
  /** Pairs under the ratio they need, worst first. */
  failing: ContrastFinding[]
  /** Pairs with nothing measurable behind them: transparent, or a gradient. */
  unknown: ContrastPair[]
}

/**
 * A secondary button is very often transparent on purpose, sitting on the
 * section background, so that is what it is measured against rather than
 * being written off as unknown. Everything else transparent genuinely has
 * no one colour behind it.
 */
const FALLS_BACK_TO_BACKGROUND: Partial<Record<SchemeColorKey, SchemeColorKey>> = {
  secondary_button_background: "background",
  input_background: "background",
  background_secondary: "background",
}

export function schemeContrast(scheme: Partial<ColorScheme> | null | undefined): SchemeContrast {
  const failing: ContrastFinding[] = []
  const unknown: ContrastPair[] = []
  if (!scheme) return { failing, unknown }

  /** A gradient over the background means the background is not one colour. */
  const gradient = typeof scheme.gradient === "string" && scheme.gradient.trim() !== ""

  for (const pair of READ_PAIRS) {
    const fg = parseColor(scheme[pair.fg])
    let bgKey: SchemeColorKey | undefined = pair.bg
    let bg = parseColor(scheme[bgKey])
    while (!bg && bgKey && FALLS_BACK_TO_BACKGROUND[bgKey]) {
      bgKey = FALLS_BACK_TO_BACKGROUND[bgKey]
      bg = parseColor(bgKey ? scheme[bgKey] : undefined)
    }

    if (!fg || !bg) { unknown.push(pair); continue }
    if (gradient && (bgKey === "background" || bgKey === "background_secondary")) { unknown.push(pair); continue }

    const ratio = contrastRatio(fg, bg)
    if (ratio < pair.need - 0.005) failing.push({ ...pair, ratio })
  }

  failing.sort((a, b) => a.ratio / a.need - b.ratio / b.need)
  return { failing, unknown }
}

/** "3.1 to 1" — read aloud, not written as a CSS value. */
export function sayRatio(ratio: number): string {
  return `${(Math.round(ratio * 10) / 10).toFixed(1)} to 1`
}
