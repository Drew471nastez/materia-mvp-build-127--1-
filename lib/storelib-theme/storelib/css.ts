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

  const scope = scopeSelector(SCOPE_PLACEHOLDER)
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
      if (stripped.startsWith("&")) return stripped.replace(/^&/, scope)
      return `${scope} ${stripped}`
    })
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

/** Fill the placeholder for one instance. */
export function cssForInstance(scopedCss: string, id: string): string {
  return scopedCss.split(SCOPE_PLACEHOLDER).join(id)
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
