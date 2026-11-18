/**
 * ===========================================================================
 *  A PALETTE IS ONLY ACCEPTED WHEN EVERY PAIR A VISITOR READS IS READABLE
 * ===========================================================================
 * Round 56. Both engines accepted palettes where some text could not be
 * read: the native engine laid the brain's muted and border colours (chosen
 * for the brain's own background) under the model's background and never
 * measured the accent or the button label; the agent's set_tokens never
 * measured a pair. The native fitness site put a lime link on light grey at
 * 1.03:1.
 *
 * `repairPalette` measures the nine pairs a visitor actually reads:
 *
 *   text on background, text on surface             4.5  body copy
 *   muted on background, muted on surface           4.5  captions, meta
 *   accent on background, as a link                  4.5  link text
 *   accent against background, as a control         3.0  a button's edge
 *   button label on the accent                      4.5  the button's words
 *   band text on the dark band                      4.5  inverse sections
 *   band accent on the dark band, as a link         4.5
 *
 * and repairs only LIGHTNESS (hue and saturation kept, so a green stays
 * that green), moving the foreground of a pair, never the ground the
 * designer chose. A button label is first swapped for the palette's own ink
 * or paper before it is moved. Each move is reported in plain words.
 *
 * THE BRAND STAYS. When the accent has to move to be read as text or a
 * control, the colour as chosen is kept as `brand`: it fills the accent band
 * and the dark band's links where it reads there, and is a token
 * (var(--t-brand)) for large type and decoration. Only the text and control
 * uses get the repaired value.
 *
 * Keys in `lock` are never moved (the creator's own colour edits): a pair
 * whose only movable side is locked is reported, not changed.
 *
 * Pure. Browser safe.
 */

export type PaletteKey = "background" | "surface" | "text" | "muted" | "accent" | "accentText" | "border"

export interface PaletteColors {
  background: string
  surface: string
  text: string
  muted: string
  accent: string
  accentText: string
  border: string
  inverse?: { background: string; text: string; accent: string }
  /** The brand colour as chosen, when the accent had to move for text or control use. */
  brand?: string
}

export interface PalettePair {
  id: string
  label: string
  fg: string
  bg: string
  ratio: number
  min: number
  ok: boolean
}

export interface PaletteRepair {
  colors: PaletteColors
  /** One plain sentence per colour moved. */
  moves: string[]
  /** Pairs still under their minimum (a locked side, or no lightness that reaches it). */
  unresolved: PalettePair[]
  /** Every pair as measured after the repair. */
  pairs: PalettePair[]
}

/* ── colour maths ─────────────────────────────────────────────────────── */

export function hexOf(v: string | null | undefined): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(v ?? "").trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]
  return `#${h.toLowerCase()}`
}

function rgb(hex: string): [number, number, number] {
  const h = hexOf(hex) ?? "#000000"
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((x) => {
    const u = x / 255
    return u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio; 1 when either is not a colour. */
export function ratioOf(a: string, b: string): number {
  if (!hexOf(a) || !hexOf(b)) return 1
  const x = luminance(a)
  const y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map((x) => x / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h *= 60
  return [h, s, l]
}

function fromHsl(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return `#${[f(0), f(8), f(4)].map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, "0")).join("")}`
}

/**
 * The colour of `fg`'s hue and saturation, at the lightness nearest its own,
 * that reads `min`:1 against `bg`. Darker on a light ground, lighter on a
 * dark one (the other way when that is the only way). Null: none does.
 */
export function nearestReadable(fg: string, bg: string, min: number): string | null {
  const f = hexOf(fg)
  const g = hexOf(bg)
  if (!f || !g) return null
  if (ratioOf(f, g) >= min) return f
  const [h, s, l] = toHsl(f)
  const groundLight = luminance(g) > 0.18
  const tryDir = (dir: -1 | 1): string | null => {
    for (let step = 1; step <= 100; step++) {
      const nl = l + (dir * step) / 100
      if (nl < 0 || nl > 1) return null
      const c = fromHsl(h, s, nl)
      if (ratioOf(c, g) >= min + 0.02) return c
    }
    return null
  }
  return groundLight ? tryDir(-1) ?? tryDir(1) : tryDir(1) ?? tryDir(-1)
}

/** A hex colour of `a` mixed toward `b` by t (0..1). */
export function mixHex(a: string, b: string, t: number): string {
  const x = rgb(a)
  const y = rgb(b)
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`
}

/* ── the pairs ────────────────────────────────────────────────────────── */

export const PAIR_MINIMUMS = { text: 4.5, control: 3 } as const

/** The nine pairs as measured, for a report or the eval. Pure. */
export function palettePairs(c: PaletteColors): PalettePair[] {
  const pair = (id: string, label: string, fg: string, bg: string, min: number): PalettePair => {
    const ratio = Math.round(ratioOf(fg, bg) * 100) / 100
    return { id, label, fg, bg, ratio, min, ok: ratio >= min }
  }
  const out = [
    pair("text/background", "body text on the page", c.text, c.background, 4.5),
    pair("text/surface", "body text on the surface", c.text, c.surface, 4.5),
    pair("muted/background", "muted text on the page", c.muted, c.background, 4.5),
    pair("muted/surface", "muted text on the surface", c.muted, c.surface, 4.5),
    pair("accent/background:link", "the accent as a link", c.accent, c.background, 4.5),
    pair("accent/background:control", "the accent as a button against the page", c.accent, c.background, 3),
    pair("accentText/accent", "the button's label", c.accentText, c.accent, 4.5),
  ]
  if (c.inverse) {
    out.push(pair("inverse.text/inverse.background", "text on the dark band", c.inverse.text, c.inverse.background, 4.5))
    out.push(pair("inverse.accent/inverse.background", "links on the dark band", c.inverse.accent, c.inverse.background, 4.5))
  }
  return out
}

const NAMES: Record<string, string> = { text: "body text", muted: "muted text", accent: "accent", accentText: "button label", "inverse.text": "band text", "inverse.accent": "band link colour" }

/**
 * The palette with every pair readable, moving lightness only; the brand
 * colour kept as `brand` when the accent moved. Pure, deterministic.
 */
export function repairPalette(input: PaletteColors, opts: { lock?: Iterable<string> } = {}): PaletteRepair {
  const lock = new Set(opts.lock ?? [])
  const c: PaletteColors = JSON.parse(JSON.stringify(input))
  const moves: string[] = []
  const say = (key: string, from: string, to: string, against: string, before: number, after: number, why: string) =>
    moves.push(`${NAMES[key] ?? key} ${from} read ${before.toFixed(2)}:1 ${why} on ${against}; now ${to} (${after.toFixed(2)}:1).`)
  const fix = (key: "text" | "muted" | "accent", grounds: string[], min: number, why: string) => {
    const was = c[key]
    if (!hexOf(was) || lock.has(key)) return
    let now = was
    for (const g of grounds) {
      if (!hexOf(g) || ratioOf(now, g) >= min) continue
      now = nearestReadable(now, g, min) ?? now
    }
    if (now !== was && grounds.every((g) => !hexOf(g) || ratioOf(now, g) >= min - 0.01)) {
      const worst = grounds.reduce((w, g) => (ratioOf(was, g) < ratioOf(was, w) ? g : w), grounds[0])
      c[key] = now
      say(key, was, now, worst, ratioOf(was, worst), ratioOf(now, worst), why)
    }
  }
  fix("text", [c.background, c.surface], 4.5, "as body text")
  fix("muted", [c.background, c.surface], 4.5, "as small text")
  const brand = c.accent
  fix("accent", [c.background], 4.5, "as a link")
  if (c.accent !== brand && hexOf(brand)) {
    c.brand = brand
    moves.push(`The brand colour ${brand} stays for the accent band, large type and decoration (var(--t-brand)); only its text and button uses moved.`)
  }
  /* The button's label: the palette's own ink or paper first, then its own lightness. */
  if (!lock.has("accentText") && ratioOf(c.accentText, c.accent) < 4.5) {
    const was = c.accentText
    const options = [c.background, c.text, "#ffffff", "#111111"].filter((x) => hexOf(x))
    const best = options.reduce((b, x) => (ratioOf(x, c.accent) > ratioOf(b, c.accent) ? x : b), was)
    const next = ratioOf(best, c.accent) >= 4.5 ? best : nearestReadable(was, c.accent, 4.5) ?? best
    if (next !== was) {
      c.accentText = next
      say("accentText", was, next, c.accent, ratioOf(was, c.accent), ratioOf(next, c.accent), "on the button")
    }
  }
  if (c.inverse) {
    const inv = c.inverse
    if (!lock.has("inverse.text") && ratioOf(inv.text, inv.background) < 4.5) {
      const was = inv.text
      const next = nearestReadable(was, inv.background, 4.5)
      if (next) {
        inv.text = next
        say("inverse.text", was, next, inv.background, ratioOf(was, inv.background), ratioOf(next, inv.background), "as text")
      }
    }
    /* The band's links: the brand itself where it reads there (lime on a dark band), else the band accent, repaired. */
    const brandOnBand = c.brand && ratioOf(c.brand, inv.background) >= 4.5 ? c.brand : null
    if (!lock.has("inverse.accent") && ratioOf(inv.accent, inv.background) < 4.5) {
      const was = inv.accent
      const next = brandOnBand ?? nearestReadable(was, inv.background, 4.5)
      if (next) {
        inv.accent = next
        say("inverse.accent", was, next, inv.background, ratioOf(was, inv.background), ratioOf(next, inv.background), "as a link")
      }
    }
  }
  /* The border follows the text it frames, only when it vanished into the page (1.1:1 or less). */
  if (!lock.has("border") && hexOf(c.border) && ratioOf(c.border, c.background) < 1.1) {
    const was = c.border
    c.border = mixHex(c.background, c.text, 0.16)
    moves.push(`border ${was} could not be seen on ${c.background}; now ${c.border}.`)
  }
  const pairs = palettePairs(c)
  return { colors: c, moves, unresolved: pairs.filter((p) => !p.ok), pairs }
}

/**
 * Muted and border for a ground the palette did not choose them for: muted
 * text and lines mixed from this palette's own text and background, so they
 * belong to it (the native engine's brain palette under a model's own
 * background). Pure.
 */
export function mutedAndBorderFor(colors: { background: string; text: string }): { muted: string; border: string } {
  const muted = nearestReadable(mixHex(colors.text, colors.background, 0.38), colors.background, 4.5) ?? colors.text
  return { muted, border: mixHex(colors.background, colors.text, 0.16) }
}
