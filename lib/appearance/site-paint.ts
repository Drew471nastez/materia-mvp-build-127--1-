/**
 * ===========================================================================
 *  A COLOUR WRITTEN INLINE THAT FOLLOWS THE PERSON'S LOOK (round 31)
 * ===========================================================================
 * The owner: "in dark mode, opening a product from Explore lands on a white
 * product page; the sticky add to cart bar, the wishlist button and the
 * option selector are not adapted at all".
 *
 * The product page and the parts it is built from (the buy card, the option
 * selector, the wishlist button, the sticky buy bar, the creator bar, the
 * reviews and the cards under the page) write their colours inline: a
 * scheme's literal white, black and hairline grey. app/theme-dark.css maps
 * classes, and an inline colour is out of its reach, so in the dark look
 * those parts stayed white.
 *
 * On Storelib's own product page (a creator who never gave it a look of
 * their own, lib/store-builder/product-page-tone productHasOwnLook) every
 * such colour is written through paint(): the same literal, as the fallback
 * of a variable that only the dark look defines. In the light look nothing
 * defines the variable, so the page is drawn with exactly the colour it
 * always had. In the dark look the variable is the charcoal step the dark
 * sheet gives the same colour as a class (scripts/gen-theme-dark.mjs
 * mapColour, the same thresholds): a white card its surface, black type its
 * ink, a hairline its faint line. A coloured accent (the blue buy button)
 * keeps its colour, as it does as a class.
 *
 * The variables are defined on html[data-sl-dark] by the generator
 * (PAINT_VARS there and here are the same names; tests/theme-dark.test.ts
 * checks it). A page with a look of its own never paints: the dark look is
 * never on it.
 *
 * Pure and server safe: the page paints its own inline styles on the server,
 * and the client parts read whether to paint from SitePaintProvider
 * (./site-paint-context).
 */

/** bg a surface (a card, a bar), page the ground a whole page sits on, ink type and icons, line a hairline. */
export type PaintRole = "bg" | "page" | "ink" | "line"

/** The names app/theme-dark.css defines under html[data-sl-dark], as --sl-pp-<name>. */
/* danger-line: the edge of a control that failed (a pale red), which no grey step stands for: a muted red in the dark. */
export const PAINT_VARS = ["page", "surface", "raised", "raised2", "thumb", "selected", "ink", "text", "muted", "faint", "line", "line2", "line-strong", "danger-line"] as const
export type PaintVar = (typeof PAINT_VARS)[number]

type Rgba = [number, number, number, number]

/** A literal colour (#rgb, #rgba, #rrggbb, #rrggbbaa, rgb(), rgba()), or null for anything else (a variable, transparent, inherit). */
export function parseColour(c: string | null | undefined): Rgba | null {
  if (!c) return null
  const s = c.trim().toLowerCase()
  let m: RegExpExecArray | null
  if ((m = /^#([0-9a-f]{3,8})$/.exec(s))) {
    let h = m[1]
    if (h.length === 5 || h.length === 7) return null
    if (h.length <= 4) h = [...h].map((x) => x + x).join("")
    const n = parseInt(h.slice(0, 6), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1]
  }
  if ((m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(s))) {
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4])
    return [Number(m[1]), Number(m[2]), Number(m[3]), a]
  }
  return null
}

/** Lightness and the spread of the channels, as the dark sheet's generator reads a colour. */
function tone([r, g, b]: Rgba) {
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  return { l: (max + min) / 2, spread: (max - min) * 255 }
}
/*
  A grey: channels within a few steps of each other; a dark ink may lean a little blue (#1a1a2e) and is still ink. And
  the cool greys Tailwind writes type in (#374151, #4b5563, #6b7280: a fifth saturated at most), which the dark sheet
  lightens as a tint of their hue; inline, a grey step of the same lightness reads the same.
*/
const neutral = (c: Rgba) => {
  const { spread, l } = tone(c)
  const saturation = spread / 255 / (1 - Math.abs(2 * l - 1) || 1)
  return spread <= 10 || (l < 0.3 && spread <= 24) || (spread <= 32 && saturation < 0.22)
}

/** Which charcoal step a colour takes in the dark look, in its role, or null when it keeps its own (a colour, a mid grey). */
export function paintVar(c: Rgba, role: PaintRole): PaintVar | null {
  if (!neutral(c)) return null
  const { l } = tone(c)
  if (role === "page" && l >= 0.85) return "page"
  if (role === "bg" || role === "page") {
    if (l >= 0.995) return "surface"
    if (l >= 0.965) return "page"
    if (l >= 0.93) return "raised"
    if (l >= 0.85) return "raised2"
    if (l >= 0.7) return "thumb"
    if (l >= 0.35) return null
    return "selected"
  }
  if (role === "ink") {
    if (l < 0.3) return "ink"
    if (l < 0.5) return "text"
    if (l < 0.62) return "muted"
    if (l < 0.86) return "faint"
    return null
  }
  if (l >= 0.8) return "line"
  if (l >= 0.6) return "line2"
  if (l < 0.3) return "line-strong"
  return null
}

const pct = (a: number) => `${+(a * 100).toFixed(4)}%`

/**
 * The colour as written, made to follow the person's look: var(--sl-pp-<step>, <the colour as written>), so the light
 * look is exactly the colour it was. A translucent surface or hairline (rgba(0,0,0,0.14), a 5% black wash) is a light
 * grey on the light page, and takes the step of that grey. Translucent type keeps its alpha on the dark ink (the same
 * colour mixed with transparent). Anything that is not a literal colour, and any colour with no dark step (a blue
 * button), comes back unchanged.
 */
export function sitePaint<T extends string | null | undefined>(c: T, role: PaintRole): T {
  const rgba = parseColour(c)
  if (!rgba) return c
  const [r, g, b, a] = rgba
  if (role === "ink" && a < 1) {
    const v = paintVar(rgba, role)
    if (!v) return c
    const solid = `#${[r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("")}`
    return `color-mix(in srgb, var(--sl-pp-${v}, ${solid}) ${pct(a)}, transparent)` as T
  }
  /* What it looks like on the light page: over white. */
  const seen: Rgba = a < 1 ? [r * a + 255 * (1 - a), g * a + 255 * (1 - a), b * a + 255 * (1 - a), 1] : rgba
  const v = paintVar(seen, role)
  if (!v) return c
  return `var(--sl-pp-${v}, ${String(c).trim()})` as T
}

/** A colour that has a step of its own in the dark look (PAINT_VARS), as written in the light one. */
export const paintAs = (step: PaintVar, c: string) => `var(--sl-pp-${step}, ${c})`

/** paint(c, role) for a page that follows the look, the colour unchanged for one that does not. */
export type Paint = <T extends string | null | undefined>(c: T, role: PaintRole) => T
export const noPaint: Paint = (c) => c
export const paintFor = (site: boolean): Paint => (site ? sitePaint : noPaint)

/**
 * `${colour}${alpha}`, a colour with a two digit alpha after it, for a colour that may be a variable: a #rrggbb gets
 * the digits exactly as before, anything else is mixed with transparent to the same alpha.
 */
export function tint(c: string, alphaHex: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(c.trim())) return `${c}${alphaHex}`
  if (!/^(var|color-mix|rgb|hsl|oklch)\(/.test(c.trim())) return `${c}${alphaHex}`
  return `color-mix(in srgb, ${c} ${pct(parseInt(alphaHex, 16) / 255)}, transparent)`
}
