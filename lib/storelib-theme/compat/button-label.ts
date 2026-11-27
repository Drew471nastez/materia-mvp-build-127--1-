/**
 * ===========================================================================
 *  A FILLED BUTTON'S LABEL READS ON ITS FILL, IN THEMES STORES ALREADY HAVE
 * ===========================================================================
 * Round 68, the owner, on a Notion template: "it looks really weird with the
 * button text black on that orange button. Fix it in all the templates."
 * Round 67 gave Octavo deep orange buttons with white labels and round 68
 * did the same for every template whose orange or coral button had a dark
 * label (Wellkept, the creator templates, the landing page, Digital
 * Renaissance, the ebook shop), and deepened every fill whose label read
 * under 4.5:1. A website keeps the colour schemes it was installed with, so
 * this is run over every page an installed Materia theme draws (theme.ts
 * renderDocument), live and on the builder's canvas.
 *
 * Materia writes each colour scheme as CSS variables (layout/theme.liquid,
 * main-cart-items, the cart drawer): --btn-primary-bg-color beside
 * --btn-primary-color, and the same for hover and the secondary button. In
 * every rule that has such a pair:
 *
 *  1. A TEMPLATE'S OLD DEFAULT PAIR becomes the template's new one
 *     (LEGACY_PAIRS): a store that never changed its button colours gets what
 *     a new install gets. These are the exact pairs the templates shipped,
 *     so a colour a creator picked is never one of them by accident.
 *
 *  2. A LABEL THAT DOES NOT READ (under 4.5:1, WCAG AA) is fixed, and a label
 *     that reads is left as the creator set it, whatever its colour:
 *       - a light label on a fill too light for it: the fill is deepened,
 *         same hue, until the label reads;
 *       - a dark label on a saturated orange or red fill: the label turns
 *         white and the fill is deepened until white reads (dark text on
 *         orange is the look the owner asked to be rid of);
 *       - any other dark label: the label is darkened until it reads, which
 *         on a light fill ends near black.
 *     A fill's border and gradient variables that carried the old fill
 *     follow it.
 *
 *  3. THE XP SHOP'S GREEN GLOSS (LEGACY_GRADIENTS) is a shade deeper, so its
 *     white labels read.
 *
 * New theme files and new installs are already fixed in their data, so this
 * changes nothing on them. Pure string work on the drawn page: no script, so
 * nothing flashes.
 */

type Rgb = [number, number, number]

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

function parse(value: string): Rgb | null {
  const v = value.trim()
  const m = v.match(HEX)
  if (!m) return null
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

const hex = (c: Rgb) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`

function luminance([r, g, b]: Rgb): number {
  const f = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

export function contrast(a: Rgb, b: Rgb): number {
  const x = luminance(a)
  const y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

function toHsl([r, g, b]: Rgb): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255
  const max = Math.max(R, G, B), min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4
  return [h * 60, s, l]
}

function fromHsl(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0) * 255, f(8) * 255, f(4) * 255].map(Math.round) as Rgb
}

/** The same hue, darker, until `against` reads on it at `target` (or black). */
function deepen(c: Rgb, against: Rgb, target = 4.6): Rgb {
  const [h, s, l0] = toHsl(c)
  for (let l = l0; l > 0; l -= 0.005) {
    const next = fromHsl(h, s, l)
    if (contrast(next, against) >= target) return next
  }
  return [0, 0, 0]
}

/** Orange, coral, red: hue 0 to 44 or 340 to 360, and vivid (the owner's #f0b54a, Wellkept's #f07a5c). Yellow, from 45, keeps a dark label. */
export function saturatedOrange(c: Rgb): boolean {
  const [h] = toHsl(c)
  const chroma = Math.max(...c) - Math.min(...c)
  return chroma >= 110 && (h < 45 || h >= 340)
}

/**
 * Old default (fill, label) pairs the templates shipped, and what they ship
 * now. Octavo (newleaf) before round 67; the rest before round 68
 * (scripts: the round 68 template data, tests/theme-templates-r68.test.ts).
 */
export const LEGACY_PAIRS: Record<string, [string, string]> = {
  /* Octavo, the first New Leaf palette */
  "#f0b54a|#1b1a16": ["#c2410c", "#ffffff"],
  "#f5c46a|#1b1a16": ["#9a3412", "#ffffff"],
  /* Wellkept (workspace) */
  "#f07a5c|#13292c": ["#c4482b", "#ffffff"],
  "#f07a5c|#12292c": ["#c4482b", "#ffffff"],
  "#e4654a|#13292c": ["#a93c23", "#ffffff"],
  "#f59a82|#12292c": ["#a93c23", "#ffffff"],
  /* Creator landing */
  "#f6a27c|#1c1b2b": ["#c2512a", "#ffffff"],
  "#f6a27c|#1d1b2a": ["#c2512a", "#ffffff"],
  "#f3916a|#1c1b2b": ["#a9441f", "#ffffff"],
  "#f08a5d|#1d1b2a": ["#c2512a", "#ffffff"],
  /* Landing page */
  "#ff5f1f|#111113": ["#c2410c", "#ffffff"],
  "#ff7a42|#111113": ["#9a3412", "#ffffff"],
  /* Digital Renaissance, its schemes and its curriculum's button */
  "#e3a63a|#15130f": ["#b45309", "#ffffff"],
  /* Ebooks, its dark scheme */
  "#d9774c|#1f1b17": ["#b9562a", "#ffffff"],
}

const PAIRS: { bg: string; fg: string; follow: string[] }[] = [
  { bg: "--btn-primary-bg-color", fg: "--btn-primary-color", follow: ["--btn-primary-bg-graident-color", "--btn-primary-border-color"] },
  { bg: "--btn-primary-hover-bg-color", fg: "--btn-primary-hover-color", follow: ["--btn-primary-hover-bg-color-graident", "--btn-primary-hover-border-color"] },
  { bg: "--btn-secondary-bg-color", fg: "--btn-secondary-color", follow: ["--btn-secondary-border-color"] },
  { bg: "--btn-secondary-hover-bg-color", fg: "--btn-secondary-hover-color", follow: ["--btn-secondary-hover-border-color"] },
  /* The header's own button (header.liquid, written on its style attribute) */
  { bg: "--hs-cta-bg", fg: "--hs-cta-fg", follow: ["--hs-cta-bd"] },
  { bg: "--hs-cta-hbg", fg: "--hs-cta-hfg", follow: ["--hs-cta-hbd"] },
]

const WHITE: Rgb = [255, 255, 255]

/** The (fill, label) a pair should have, or null when it is fine as it is. */
export function fixPair(fill: string, label: string): [string, string] | null {
  const legacy = LEGACY_PAIRS[`${fill.trim().toLowerCase()}|${label.trim().toLowerCase()}`]
  if (legacy) return legacy
  const b = parse(fill)
  const c = parse(label)
  if (!b || !c || contrast(b, c) >= 4.5) return null
  if (luminance(c) > luminance(b)) return [hex(deepen(b, c)), label]
  if (saturatedOrange(b)) return [hex(deepen(b, WHITE)), "#ffffff"]
  return [fill, hex(deepen(c, b))]
}

const value = (body: string, name: string): string | null => {
  const m = body.match(new RegExp(`(?:^|[\\s;{"'])${name}\\s*:\\s*(#[0-9a-fA-F]{3,6})\\s*(?:!important\\s*)?(?=[;}"']|$)`))
  return m ? m[1] : null
}

const setValue = (body: string, name: string, from: string, to: string): string =>
  body.replace(new RegExp(`((?:^|[\\s;{"'])${name}\\s*:\\s*)${from}(?=\\s*(?:!important\\s*)?(?:[;}"']|$))`, "gi"), `$1${to}`)

/** Old default fills a button rule's :hover sets on its own (no colour beside it): the old fill to the new. */
const LEGACY_HOVER_FILLS: Record<string, string> = Object.fromEntries(Object.entries(LEGACY_PAIRS).map(([k, v]) => [k.split("|")[0], v[0]]))

function fixVars(body: string): string {
  let out = body
  for (const p of PAIRS) {
    const fill = value(out, p.bg)
    const label = value(out, p.fg)
    if (!fill || !label) continue
    const fixed = fixPair(fill, label)
    if (!fixed) continue
    const [nextFill, nextLabel] = fixed
    if (nextFill.toLowerCase() !== fill.toLowerCase()) {
      out = setValue(out, p.bg, fill, nextFill)
      for (const f of p.follow) out = setValue(out, f, fill, nextFill)
    }
    if (nextLabel.toLowerCase() !== label.toLowerCase()) out = setValue(out, p.fg, label, nextLabel)
  }
  return out
}

/** A button's own rule written with plain declarations (a section's inline style: `.x__btn { background: #f07a5c; color: #13292c; }`). */
function fixPlainRule(selector: string, body: string, before: string): string {
  if (!/btn|button/i.test(selector)) return body
  /* `background: var(--lapis)` (Digital Renaissance's curriculum): the variable's last value written before this rule, when that and the label are a template's old pair, is replaced by the new fill itself. */
  const viaVar = body.match(/(?:^|[\s;{])(background(?:-color)?)\s*:\s*var\((--[\w-]+)\)\s*(?=[;}]|$)/)
  if (viaVar) {
    const label = value(body, "color")
    const defs = [...before.slice(-6000).matchAll(new RegExp(`${viaVar[2]}\\s*:\\s*(#[0-9a-fA-F]{6})`, "g"))]
    const fill = defs.length ? defs[defs.length - 1][1] : null
    const legacy = fill && label ? LEGACY_PAIRS[`${fill.toLowerCase()}|${label.toLowerCase()}`] : undefined
    if (!legacy || !label) return body
    return setValue(body.replace(viaVar[0], viaVar[0].replace(`var(${viaVar[2]})`, legacy[0])), "color", label, legacy[1])
  }
  const bgName = value(body, "background") ? "background" : value(body, "background-color") ? "background-color" : null
  if (!bgName) return body
  const fill = value(body, bgName) as string
  const label = value(body, "color")
  if (!label) {
    const next = /:hover|:focus/.test(selector) ? LEGACY_HOVER_FILLS[fill.toLowerCase()] : undefined
    return next ? setValue(body, bgName, fill, next) : body
  }
  const fixed = fixPair(fill, label)
  if (!fixed) return body
  let out = body
  if (fixed[0].toLowerCase() !== fill.toLowerCase()) out = setValue(out, bgName, fill, fixed[0])
  if (fixed[1].toLowerCase() !== label.toLowerCase()) out = setValue(out, "color", label, fixed[1])
  return out
}

/**
 * The XP shop's glossy green buttons (xpshop sections, before round 68): white
 * labels on a light green, 3.2:1 at the label's height. The same gloss, a
 * shade deeper, reads at 4.5:1 or more. Exact strings, so nothing else moves.
 */
export const LEGACY_GRADIENTS: [string, string][] = [
  ["#7ad36c 0%, #45b041 42%, #2f962f 58%, #3aa73a 100%", "#64b956 0%, #2e8634 42%, #1f6f21 58%, #277d28 100%"],
  ["#8bdc7d 0%, #52bd4c 42%, #379f36 58%, #45b041 100%", "#6cc35e 0%, #33903a 42%, #237a24 58%, #2b852b 100%"],
]

/** Every button colour pair in the page (scheme variables, the header button's style attribute, a button's own rule), fixed where it needs to be. */
export function fixButtonLabels(html: string): string {
  if (!/--btn-|--hs-cta-|btn|button/i.test(html)) return html
  let out = html
  for (const [from, to] of LEGACY_GRADIENTS) if (out.includes(from)) out = out.split(from).join(to)
  out = out.replace(/\{[^{}<]*--btn-(?:primary|secondary)[^{}<]*\}/g, fixVars)
  out = out.replace(/style="[^"]*--hs-cta-bg[^"]*"/g, fixVars)
  out = out.replace(/(^|[}\s>])([^{}<>]*(?:btn|button)[^{}<>]*)\{([^{}<]*)\}/gi, (m, lead: string, selector: string, body: string, at: number, all: string) => {
    const next = fixPlainRule(selector, body, all.slice(Math.max(0, at - 6000), at))
    return next === body ? m : `${lead}${selector}{${next}}`
  })
  return out
}
