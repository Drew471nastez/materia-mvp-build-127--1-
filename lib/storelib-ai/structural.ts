/**
 * ===========================================================================
 *  WILL IT HOLD ON A PHONE: READ FROM THE FILE AND FROM ITS DRAWN HTML
 * ===========================================================================
 * The run's browser check (lib/website-builder/agent/visual-check.ts) draws
 * the page in Chromium at 1440, 834 and 390 wide. It is not always there: no
 * browser on the server, a timeout, a section writer that never had one. So
 * the faults a phone shows first are also read here, from the source and
 * from the section rendered to HTML, which works everywhere:
 *
 *   FIXED WIDTH    a box 420px or wider with no container or width rule
 *                  anywhere in the file: the page scrolls sideways on a phone
 *   COLUMNS        three or more grid columns (or a number of them from a
 *                  setting) with no rule for a narrow screen: each is about
 *                  110px on a 390px phone
 *   IMAGES         a picture with no size and no aspect-ratio (the page
 *                  jumps as it loads), or no alt
 *   CONTRAST       a text colour setting whose default is hard to read on
 *                  the background of the scheme it starts on
 *
 * The first two are errors for a file an agent writes (./integration.ts):
 * they are a broken phone layout, not a matter of taste. The rest are notes
 * handed back with a save that went through.
 *
 * PURE: text in, findings out.
 */

import { contrastRatio, parseColor } from "@/lib/storelib-theme/contrast"
import { defaultSchemeKey, themeColorSchemes } from "@/lib/storelib-theme/color-schemes"
import type { QualityFinding } from "./quality"

const stripCss = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, " ")

function declarations(css: string): { prop: string; value: string }[] {
  const out: { prop: string; value: string }[] = []
  for (const m of css.replace(/@[a-z-]+[^{;]*\{/gi, "{").matchAll(/([a-z-]+)\s*:\s*([^;{}]+)/gi)) out.push({ prop: m[1].toLowerCase(), value: m[2].trim() })
  return out
}

/** How many columns a grid-template-columns value makes, Infinity when a setting decides, 0 when it fits itself (auto-fit). */
export function columnCount(value: string): number {
  const v = value.trim()
  if (/auto-fit|auto-fill/i.test(v)) return 0
  const rep = v.match(/^repeat\(\s*([^,]+),/i)
  if (rep) {
    const n = Number(rep[1].trim())
    return Number.isFinite(n) ? n : Infinity
  }
  let depth = 0
  let tracks = 0
  let inTrack = false
  for (const ch of v) {
    if (ch === "(") depth++
    else if (ch === ")") depth--
    if (depth === 0 && /\s/.test(ch)) inTrack = false
    else if (!inTrack) {
      inTrack = true
      tracks++
    }
  }
  return tracks
}

/**
 * A row of parts rather than a layout of columns: "34px 1fr 28px" (an icon, a bar, a count) fits any phone. Fewer than
 * three flexible tracks, and fixed tracks that add up to less than a phone's width.
 */
function smallRow(value: string): boolean {
  if (/^repeat\(/i.test(value.trim())) return false
  const flexible = (value.match(/\d*\.?\d+fr\b/g) ?? []).length
  const fixed = [...value.matchAll(/(\d+)px/g)].reduce((n, m) => n + Number(m[1]), 0)
  return flexible < 3 && fixed < 300
}

/** Whether a width value is a fixed px of at least `min`, rather than one that shrinks (min(), clamp(), a percentage). */
function fixedPx(value: string, min: number): number | null {
  if (/\b(min|clamp)\(|%|vw|fr\b/i.test(value)) return null
  const px = [...value.matchAll(/(\d{3,})px/g)].map((m) => Number(m[1])).find((n) => n >= min)
  return px ?? null
}

interface Rule {
  selectors: string[]
  decls: { prop: string; value: string }[]
  /** Inside a width condition: @container, or @media on a width. */
  sized: boolean
}

/** The stylesheet's rules, each with whether a width condition holds it. Keyframes and other at-rules are not layout. */
function rulesOf(css: string, sized = false, out: Rule[] = []): Rule[] {
  for (let i = 0; i < css.length; ) {
    const open = css.indexOf("{", i)
    if (open < 0) break
    const prelude = css.slice(i, open).replace(/^[\s;}]+/, "").trim()
    let depth = 0
    let j = open
    for (; j < css.length; j++) {
      if (css[j] === "{") depth++
      else if (css[j] === "}" && --depth === 0) break
    }
    const body = css.slice(open + 1, j)
    if (/^@container\b/i.test(prelude) || /^@media\b[^{]*(?:width|inline-size)/i.test(prelude)) rulesOf(body, true, out)
    else if (!prelude.startsWith("@")) out.push({ selectors: prelude.split(",").map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean), decls: declarations(body), sized })
    i = j + 1
  }
  return out
}

export function checkResponsiveStructure(cssText: string): QualityFinding[] {
  const css = stripCss(cssText)
  const rules = rulesOf(css)
  /* A box is looked after on a narrow screen when a width condition sets its size or layout again. */
  const LAYOUT = /^(width|min-width|max-width|flex|flex-basis|flex-direction|flex-wrap|grid-template-columns|grid-column|display)$/
  const resized = (rule: Rule) => rules.some((r) => r.sized && r.selectors.some((x) => rule.selectors.includes(x)) && r.decls.some((d) => LAYOUT.test(d.prop)))
  const always = rules.filter((r) => !r.sized && !resized(r))
  const out: QualityFinding[] = []
  const wideIn = (r: Rule) => r.decls.find((d) => /^(width|min-width|flex-basis)$/.test(d.prop) && fixedPx(d.value, 420) !== null) ?? r.decls.find((d) => d.prop === "flex" && fixedPx(d.value.split(/\s+/).pop() ?? "", 420) !== null)
  const wideRule = always.find((r) => !!wideIn(r))
  const wide = wideRule ? wideIn(wideRule) : undefined
  if (wide) {
    out.push({
      id: "structure-fixed-width",
      severity: "error",
      message: `"${wide.prop}: ${wide.value}" is wider than a phone (390px) and nothing in the file changes it on a narrow screen, so the page scrolls sideways. Use max-width (or min(100%, …)), and put the wide layout inside @container (min-width: 760px) with container-type: inline-size on the section's outer element.`,
    })
  }
  const grid = always.flatMap((r) => r.decls).find((d) => d.prop === "grid-template-columns" && columnCount(d.value) >= 3 && !smallRow(d.value))
  if (grid) {
    const n = columnCount(grid.value)
    out.push({
      id: "structure-grid-columns",
      severity: "error",
      message: `"grid-template-columns: ${grid.value}" lays ${Number.isFinite(n) ? `${n} columns` : "a number of columns from a setting"} side by side at every width, so on a 390px phone each is about ${Number.isFinite(n) ? Math.floor(340 / n) : 110}px wide. Start with one column (or two for small cards), and set the full grid inside @container (min-width: 760px), with container-type: inline-size on the section's outer element.`,
    })
  }
  return out
}

/**
 * The section drawn to HTML with its own defaults and this site's theme,
 * read for what a phone and a slow connection show first. Notes, never
 * refusals: a picture's size can come from CSS this cannot see.
 */
export function checkRenderedSection(input: { html: string; css: string; schemaSettings?: { id?: unknown; type?: unknown; default?: unknown }[]; theme?: Record<string, unknown> | null }): QualityFinding[] {
  const out: QualityFinding[] = []
  const css = stripCss(input.css)
  const imgs = [...input.html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0])
  const unsized = imgs.filter((t) => !(/\swidth\s*=/.test(t) && /\sheight\s*=/.test(t)))
  if (unsized.length && !/aspect-ratio\s*:/.test(css)) {
    out.push({
      id: "render-image-size",
      severity: "warning",
      message: `${unsized.length === 1 ? "A picture is" : `${unsized.length} pictures are`} drawn with no width and height and the CSS gives no aspect-ratio, so the page jumps as it loads. Give the img width and height, or its frame an aspect-ratio with object-fit: cover.`,
    })
  }
  const noAlt = imgs.filter((t) => !/\salt\s*=/.test(t))
  if (noAlt.length) {
    out.push({ id: "render-image-alt", severity: "warning", message: `${noAlt.length === 1 ? "A picture is" : `${noAlt.length} pictures are`} drawn with no alt. Print alt from a setting, or alt="" when it is decoration.` })
  }
  const inlineWide = [...input.html.matchAll(/style\s*=\s*"([^"]*)"/gi)].flatMap((m) => declarations(m[1])).find((d) => /^(width|min-width)$/.test(d.prop) && fixedPx(d.value, 420) !== null)
  if (inlineWide) {
    out.push({ id: "render-inline-width", severity: "warning", message: `The drawn section has "${inlineWide.prop}: ${inlineWide.value}" in a style attribute, wider than a phone. A width from a setting needs a max-width: 100% beside it.` })
  }

  /* A text colour's default against the scheme the section starts on. */
  const settings = input.schemaSettings ?? []
  const schemeSetting = settings.find((s) => s?.type === "color_scheme")
  if (schemeSetting) {
    const schemes = themeColorSchemes(input.theme ?? {})
    const key = typeof schemeSetting.default === "string" && schemes[schemeSetting.default] ? schemeSetting.default : defaultSchemeKey(input.theme ?? {}, schemes)
    const bg = parseColor((schemes[key] as unknown as { background?: string })?.background)
    for (const s of settings) {
      if (s?.type !== "color" || typeof s.default !== "string" || !/^#/.test(s.default)) continue
      if (!/(text|heading|title|copy|label|body|eyebrow|caption)/i.test(String(s.id ?? ""))) continue
      const fg = parseColor(s.default)
      if (!fg || !bg) continue
      const ratio = contrastRatio(fg, bg)
      if (ratio < 3) {
        out.push({
          id: `render-contrast:${String(s.id)}`,
          severity: "warning",
          message: `"${String(s.id)}" defaults to ${s.default}, which is ${ratio.toFixed(2)}:1 on the "${key}" scheme's background. Text needs 4.5:1 (3:1 for large headings): default it to the scheme colour it follows ("scheme.heading", "scheme.text") instead.`,
        })
      }
    }
  }
  return out
}
