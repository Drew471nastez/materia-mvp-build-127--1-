/**
 * ===========================================================================
 *  <style scoped>: THIS SECTION'S CSS, AND NOBODY ELSE'S
 * ===========================================================================
 * A section's stylesheet is rewritten so that every rule can only match
 * inside that section's instance. `.button { … }` becomes
 * `[data-section-id="hero-a1b2"] .button { … }`, and a rule that names
 * `html`, `body` or `:root` is pointed at the section root instead — a
 * section cannot restyle the page it is on, and it cannot restyle the editor
 * that is showing it.
 *
 * The id is left as a placeholder at compile time and filled at render
 * time: the same compiled CSS serves every instance of the section, and a
 * page with three heroes gets three scoped copies rather than one that
 * leaks between them.
 *
 * `@keyframes` are renamed with the section type as a prefix and every
 * `animation` that names them is rewritten to match, so two sections that
 * both declare `@keyframes fade` do not fight over the name.
 *
 * Global theme CSS is a different thing with a different door:
 * `layout/theme.storelib`'s <style> is not scoped, and is the only place a
 * theme should put rules meant for the whole page.
 */
import postcss, { type AtRule, type Rule } from "postcss"

import { LIMITS, type Result, type ThemeError } from "../types"

/** Replaced with the instance id when rendering. */
export const SCOPE_PLACEHOLDER = "__SECTION_ID__"

export function scopeSelector(id: string): string {
  return `[data-section-id="${id}"]`
}

const ROOT_LIKE = /^(html|body|:root)$/i

export interface ScopeOptions {
  file?: string
  /** The line the <style> block starts on. */
  line?: number
  /** Prefix for keyframe names: the section type. */
  type: string
  /**
   * What every rule is scoped to. A section's instance by default; a theme
   * block passes `[data-block-type="…"]`, or a section-and-block pair when
   * its rules read a setting and so differ per instance.
   */
  scope?: string
}

/** Replaced with the block's id when a theme block's per-instance CSS is drawn. */
export const BLOCK_PLACEHOLDER = "__BLOCK_ID__"

/** A theme block's scope: every instance of the type, or one instance in one section. */
export function blockScope(type: string, perInstance: boolean): string {
  return perInstance
    ? `[data-section-id="${SCOPE_PLACEHOLDER}"] [data-block-id="${BLOCK_PLACEHOLDER}"]`
    : `[data-block-type="${type}"]`
}

/** Fill both placeholders of a theme block's per-instance CSS. */
export function cssForBlockInstance(scopedCss: string, sectionId: string, blockId: string): string {
  return scopedCss.split(SCOPE_PLACEHOLDER).join(sectionId).split(BLOCK_PLACEHOLDER).join(blockId)
}

/**
 * `{{ … }}` IS NOT CSS, AND POSTCSS IS RIGHT TO SAY SO.
 *
 * A style block runs through the template language, so a rule may read a
 * setting (docs/theme/10). To postcss an expression is an unknown word, so
 * each one is swapped for an inert placeholder of the same length before
 * parsing and swapped back after: the stylesheet postcss sees is valid CSS,
 * the columns it reports are the real ones, and the scoped output still
 * carries the expressions for the template step that follows.
 */
const EXPR = /\{\{[\s\S]*?\}\}/g

/**
 * The padding is `_`, not a digit, and that is the whole reason this works.
 * Padding with zeros made the mask for expression 1 read `--sl-x1000000`,
 * and `(\d+)` swallowed the padding as part of the index: everything after
 * the first expression in a stylesheet resolved to `exprs[1000000]`, came
 * back undefined, and was left in the CSS as garbage the browser dropped.
 * A non-digit pad cannot be confused with the index.
 */
function maskExpressions(css: string): { masked: string; exprs: string[] } {
  const exprs: string[] = []
  const masked = css.replace(EXPR, (m) => {
    const token = `--sl-x${exprs.length}`
    exprs.push(m)
    // Same length wherever it lands, so postcss reports the real columns.
    return token.padEnd(Math.max(m.length, token.length), "_")
  })
  return { masked, exprs }
}

function unmaskExpressions(css: string, exprs: string[]): string {
  return css.replace(/--sl-x(\d+)_*/g, (m, i) => exprs[Number(i)] ?? m)
}

export function scopeCss(css: string, opts: ScopeOptions): Result<string> {
  if (Buffer.byteLength(css, "utf8") > LIMITS.cssBytes) {
    return { ok: false, errors: [{ stage: "css", file: opts.file, line: opts.line, message: `The stylesheet is over ${LIMITS.cssBytes / 1024} KB` }] }
  }
  const base = (opts.line ?? 1) - 1
  const { masked, exprs } = maskExpressions(css)
  let root
  try {
    root = postcss.parse(masked, { from: opts.file })
  } catch (e) {
    const err = e as { line?: number; column?: number; reason?: string; message: string }
    return {
      ok: false,
      errors: [{ stage: "css", file: opts.file, line: err.line !== undefined ? base + err.line : undefined, column: err.column, message: err.reason ?? err.message }],
    }
  }

  const scope = opts.scope ?? scopeSelector(SCOPE_PLACEHOLDER)
  const keyframes = new Map<string, string>()
  const prefix = `sl-${opts.type.replace(/[^a-z0-9]/gi, "-")}-`
  const errors: ThemeError[] = []

  root.walkAtRules((at: AtRule) => {
    const name = at.name.toLowerCase()
    if (name === "keyframes" || name === "-webkit-keyframes") {
      const original = at.params.trim()
      const renamed = prefix + original
      keyframes.set(original, renamed)
      at.params = renamed
    }
    if (name === "media") {
      const container = widthQueryAsContainer(at.params)
      if (container) {
        at.name = "container"
        at.params = container
      }
    }
    if (name === "import") {
      errors.push({ stage: "css", file: opts.file, line: at.source?.start ? base + at.source.start.line : undefined, message: "@import is not allowed in a section stylesheet" })
    }
  })

  root.walkRules((rule: Rule) => {
    // Rules inside @keyframes are frame selectors (from, to, 50%), not element selectors.
    const parent = rule.parent as AtRule | undefined
    if (parent && parent.type === "atrule" && /keyframes$/i.test(parent.name)) return

    rule.selectors = rule.selectors.map((sel) => {
      const s = sel.trim()
      if (ROOT_LIKE.test(s)) return scope
      // `html .x` / `body .x` — drop the root and scope the rest.
      const stripped = s.replace(/^(html|body|:root)\s+/i, "")
      const scoped = stripped.startsWith("&") ? stripped.replace(/^&/, scope) : `${scope} ${stripped}`
      return canvasSafeSelector(scoped)
    })
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  A BUTTON YOU FILLED AND NEVER SAID THE COLOUR OF
   * ═══════════════════════════════════════════════════════════════════════
   * A rule that gives a button a background and no `color` leaves its label
   * inheriting the SECTION's text colour. On a dark section with a white
   * button that is white on white: a blank slab where the words should be.
   * It looks right on the screen it was written on, because there the two
   * colours happen to differ, and it is wrong the moment somebody puts the
   * section on a different scheme.
   *
   * Caught here, at save, with the line — the same as every other mistake in
   * a section file — rather than left to be noticed on a live page.
   *
   * NARROW ON PURPOSE. Only a rule whose selector says "button", only when
   * it sets a background that is really a fill, and never for a state
   * (`:hover`, `:focus`) or a rule that is only setting a border. Those
   * rules legitimately change one thing and inherit the rest, and a check
   * that shouts about them is a check people learn to work around.
   */
  root.walkRules((rule: Rule) => {
    const parent = rule.parent as AtRule | undefined
    if (parent && parent.type === "atrule" && /keyframes$/i.test(parent.name)) return

    const selector = rule.selector.toLowerCase()
    if (!/(^|[\s.#\[>+~])[a-z0-9_-]*(btn|button)/.test(selector)) return
    // A state or a part of one is a change to something already painted.
    if (/:(hover|focus|active|visited|disabled|focus-visible|focus-within)|::/.test(selector)) return

    let fills = false
    let names = false
    let line: number | undefined
    rule.walkDecls((decl) => {
      const prop = decl.prop.toLowerCase()
      if (prop === "color") names = true
      if (prop !== "background" && prop !== "background-color") return
      const v = decl.value.trim().toLowerCase()
      // `transparent`, `none` and `inherit` are not a fill: the label goes on
      // whatever is behind, which is what it was already inheriting.
      if (v === "transparent" || v === "none" || v === "inherit" || v === "unset" || v === "initial") return
      fills = true
      if (decl.source?.start) line = base + decl.source.start.line
    })

    if (fills && !names) {
      errors.push({
        stage: "css",
        file: opts.file,
        line,
        message:
          `"${rule.selector.trim()}" gives this button a background but never says what colour its label is, ` +
          `so the label takes the section's text colour and can come out invisible on it. ` +
          `Add a \`color\` — \`var(--s-btn-text)\` is the one the colour scheme picked for a filled button.`,
      })
    }
  })

  root.walkDecls((decl) => {
    decl.value = canvasSafeUnits(decl.value)
  })

  if (keyframes.size) {
    root.walkDecls(/^(animation|animation-name)$/i, (decl) => {
      for (const [from, to] of keyframes) {
        decl.value = decl.value.replace(new RegExp(`(^|[\\s,])${escapeRe(from)}(?=$|[\\s,])`, "g"), `$1${to}`)
      }
    })
  }

  if (errors.length) return { ok: false, errors }
  return { ok: true, value: unmaskExpressions(root.toString(), exprs) }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE WINDOW A SECTION SEES IS THE PAGE IT IS ON, NOT THE EDITOR
 * ═══════════════════════════════════════════════════════════════════════════
 * In the builder a section is drawn inside the canvas, in the editor's own
 * document. Two things in a stylesheet ask about the WINDOW rather than the
 * page, and in the builder the window is the editor:
 *
 *   `100vh`, `100vw`   a hero at 100vw was the editor's width in a 390px phone
 *                      preview, so the section ran off the canvas;
 *   `@media (max-width: 767px)`
 *                      the editor is 1400px wide, so the phone preview drew the
 *                      desktop layout.
 *
 * Both are rewritten here, the same for the builder and the live site:
 *
 *   `100vh` becomes `calc(100 * var(--sl-vh, 1vh))`. The canvas sets `--sl-vh`
 *   to 1% of its own height (app/globals.css, `.wb-canvas-frame`); on the live
 *   site nothing sets it, and it is the real `1vh`. Widths likewise.
 *
 *   A media query that asks ONLY about width becomes the same container
 *   query. Every section sits in a container as wide as the page
 *   (SectionRenderer), so on the live site the answer is the window's, and in
 *   the phone preview it is the phone's. A query about anything else (motion,
 *   hover, print, orientation) is about the visitor and stays a media query.
 *
 * `position: fixed` needs nothing here: the canvas frame contains it
 * (`contain: layout`), so a menu an agent fixes to the window covers the page
 * it is on and never the editor.
 *
 * A popover, and a dialog opened as a modal, go further than fixed: the
 * browser draws them in its top layer, above the whole document, and no
 * ancestor can contain or clip that. In the canvas they are opened without
 * the top layer (components/website-builder/canvas-top-layer.tsx marks them
 * `data-sl-open`), so `:popover-open` and `:modal` are widened here to match
 * that mark as well. On the live site nothing sets it, and they are the
 * browser's own.
 */
export function canvasSafeSelector(selector: string): string {
  if (!/:(?:popover-open|modal)(?![\w-])/i.test(selector)) return selector
  return selector
    .replace(/(?<!:):popover-open(?![\w-])/gi, ":is(:popover-open, [data-sl-open])")
    .replace(/(?<!:):modal(?![\w-])/gi, ":is(:modal, [data-sl-open])")
}

const VIEWPORT_UNIT = /(^|[^\w.-])(-?\d*\.?\d+)(dvh|svh|lvh|vh|dvw|svw|lvw|vw|vmin|vmax)(?![\w-])/gi

export function canvasSafeUnits(value: string): string {
  if (!/\d(dvh|svh|lvh|vh|dvw|svw|lvw|vw|vmin|vmax)/i.test(value)) return value
  return value.replace(VIEWPORT_UNIT, (_m, lead: string, n: string, unit: string) => {
    const u = unit.toLowerCase()
    const vh = `var(--sl-vh, 1${u.endsWith("h") ? u : "vh"})`
    const vw = `var(--sl-vw, 1${u.endsWith("w") ? u : "vw"})`
    const one = u === "vmin" ? `min(${vw}, ${vh})` : u === "vmax" ? `max(${vw}, ${vh})` : u.endsWith("h") ? vh : vw
    return `${lead}calc(${n} * ${one})`
  })
}

const WIDTH_FEATURE = /^\(\s*(?:(?:min-|max-)?width\s*:\s*[^()]+|[^()]*\bwidth\b\s*(?:<=|>=|<|>|=)\s*[^()]+|[^()]+(?:<=|>=|<|>)\s*width\b[^()]*)\)$/i

/** The container query a width-only media query means, or null when it asks about more than width. */
export function widthQueryAsContainer(params: string): string | null {
  if (params.includes(",")) return null
  const rest = params.trim().replace(/^(only\s+)?(screen|all)\s+and\s+/i, "").trim()
  if (!rest || /^(only\s+)?(screen|all|print)$/i.test(rest)) return null
  const conditions = rest.split(/\s+and\s+/i).map((c) => c.trim())
  return conditions.every((c) => WIDTH_FEATURE.test(c)) ? conditions.join(" and ") : null
}

/** Fill the placeholder for one instance. */
export function cssForInstance(scopedCss: string, id: string): string {
  return scopedCss.split(SCOPE_PLACEHOLDER).join(id)
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
