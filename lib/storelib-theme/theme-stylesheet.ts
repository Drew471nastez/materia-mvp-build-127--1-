/**
 * ===========================================================================
 *  AN IMPORTED THEME'S STYLESHEET, FOR THE WHOLE PAGE AND NOTHING ELSE
 * ===========================================================================
 * A Shopify theme keeps most of its look outside its sections: CSS variables
 * built from its colours and fonts, base rules for headings, buttons and
 * links, and the stylesheets its layout links. The importer works that out
 * once (lib/storelib-theme/shopify/static-liquid.ts) and keeps it as the
 * theme setting `theme_stylesheet`. This is what makes it safe to draw.
 *
 * It is neither a section's stylesheet nor the creator's custom CSS:
 *
 *   A section's CSS (./storelib/css.ts) is scoped to one instance and its
 *   keyframes are renamed per section. Theme CSS is meant for every section,
 *   so its rules are scoped to the PAGE ROOT, its keyframe names stay as
 *   written (a section's markup names them), and a rule nested inside
 *   another is left alone, because its parent already carries the scope.
 *
 *   Custom CSS (./custom-css.ts) is typed by hand and held to 20,000
 *   characters with no nesting. A theme's stylesheet is a few hundred KB of
 *   modern CSS, nesting and @layer included.
 *
 * What the compiler does:
 *
 *   every top level rule is prefixed with the page root, `[data-storelib-theme]`,
 *   so nothing reaches the editor that shares the document with the canvas;
 *
 *   `html`, `body` and `:root` mean the page root. A rule that named one of
 *   them keeps only what a page root may take from a theme: custom
 *   properties, colours, backgrounds and type. `body { display: grid }` on
 *   Storelib's root would rearrange the header, sections and footer;
 *
 *   a width only media query becomes the same container query, and viewport
 *   units answer to the canvas, exactly as a section's do, so the phone
 *   preview draws the phone layout;
 *
 *   `@import`, `@charset`, `@namespace` and `@font-face` are dropped (fonts
 *   load through Theme settings › Typography), and so is any value with a
 *   `url()` that is not https, same site or a package asset, or that holds
 *   something CSS has no business holding;
 *
 *   `<` is written as its escape, so the result can never close the <style>
 *   it is drawn in.
 *
 * It runs on import, on every save (lib/website-builder/sanitize-sections.ts)
 * and on every read the site makes, and it is IDEMPOTENT: a selector that
 * already starts at the page root is left as it is, so compiling twice gives
 * the same text. Results are kept per input, so a published page does not
 * parse the same stylesheet on every request.
 */
import postcss, { type AtRule, type ChildNode, type Container, type Declaration, type Rule } from "postcss"

import { canvasSafeSelector, canvasSafeUnits, widthQueryAsContainer } from "./storelib/css"

/** The page root every rule answers to. Kept in step with THEME_ROOT_ATTRIBUTE (lib/website-builder/theme-css.ts). */
export const THEME_STYLESHEET_SCOPE = "[data-storelib-theme]"

/**
 * Most characters read. The converter keeps 400,000 of a theme's CSS, and
 * scoping makes that longer; a value past this was not written by it.
 */
export const THEME_STYLESHEET_LIMIT = 600_000

const ROOT_LIKE = /^(html|body|:root)$/i
const ROOT_PREFIX = /^(html|body|:root)((?:[.#[:][^\s>+~]*)?)(\s*[>+~]?\s*)/i
const DROPPED_AT_RULES = new Set(["import", "charset", "namespace", "font-face", "font-feature-values", "page"])
const BANNED_VALUE = /expression\s*\(|javascript:|vbscript:|-moz-binding|\bbehaviou?r\s*:|<\/?\w|@import/i

/**
 * What a rule that named the page itself may still say. A theme's colours,
 * type and variables reach every section through these; anything about
 * layout would rearrange Storelib's own page.
 */
const ROOT_PROPERTY = /^(--|color$|background|font|line-height$|letter-spacing$|word-spacing$|text-|-webkit-text-|-webkit-font-smoothing$|-moz-osx-font-smoothing$|accent-color$|caret-color$|color-scheme$|scroll-padding|tab-size$|hyphens$|direction$)/i

function urlAllowed(raw: string): boolean {
  const u = raw.trim().replace(/^['"]|['"]$/g, "").trim()
  if (!u) return true
  if (/^#/.test(u)) return true
  if (/^asset:\/\/[0-9a-f]{64}$/i.test(u)) return true
  if (/^data:image\/(png|gif|jpe?g|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(u)) return true
  if (/^https:\/\//i.test(u)) return true
  /* Same site: a path, never a protocol relative address. */
  return /^\/(?!\/)/.test(u)
}

function valueAllowed(value: string): boolean {
  if (BANNED_VALUE.test(value)) return false
  const urls = value.match(/url\(\s*("[^"]*"|'[^']*'|[^)]*)\s*\)/gi)
  if (!urls) return true
  return urls.every((u) => urlAllowed(u.replace(/^url\(\s*/i, "").replace(/\s*\)$/, "")))
}

/** The selector, answering to the page root. Idempotent. */
function scopeSelector(selector: string, scope: string): { selector: string; root: boolean } {
  const s = selector.trim()
  if (!s) return { selector: s, root: false }
  if (s === scope || s.startsWith(`${scope} `) || s.startsWith(`${scope}.`) || s.startsWith(`${scope}:`) || s.startsWith(`${scope}[`) || s.startsWith(`${scope}>`)) {
    return { selector: canvasOnce(s), root: s === scope }
  }
  if (ROOT_LIKE.test(s)) return { selector: scope, root: true }
  /* `html .x`, `body.page .x`, `:root[dir=rtl] .x`: the root, with its own qualifier, then the rest. */
  const m = s.match(ROOT_PREFIX)
  if (m && (m[3] || m[2])) {
    const qualifier = m[2] ?? ""
    /* `html body .x`: the second one is the same root. */
    const rest = s.slice(m[0].length).replace(/^body(?![\w-])\s*/i, "")
    if (!rest) return { selector: canvasOnce(`${scope}${qualifier}`), root: true }
    const joiner = m[3].trim() ? ` ${m[3].trim()} ` : " "
    return { selector: canvasOnce(`${scope}${qualifier}${joiner}${rest}`), root: false }
  }
  return { selector: canvasOnce(`${scope} ${s}`), root: false }
}

function insideRule(node: ChildNode): boolean {
  let p: Container | undefined = node.parent as Container | undefined
  while (p && p.type !== "root") {
    if (p.type === "rule") return true
    p = p.parent as Container | undefined
  }
  return false
}

/**
 * Inside a width query, which is a container query once compiled. The page
 * root is the container those answer to, and a container never answers its
 * own query, so `:root { --gap: 2rem }` inside one would never apply. Its
 * children do answer, and a variable set on them reaches everything below.
 */
function insideContainerQuery(node: ChildNode): boolean {
  let p: Container | undefined = node.parent as Container | undefined
  while (p && p.type !== "root") {
    if (p.type === "atrule" && (p as AtRule).name.toLowerCase() === "container") return true
    p = p.parent as Container | undefined
  }
  return false
}

/** canvasSafeSelector, once: what it wrote already matches the canvas. */
function canvasOnce(selector: string): string {
  return selector.includes("[data-sl-open]") ? selector : canvasSafeSelector(selector)
}

function insideKeyframes(node: ChildNode): boolean {
  let p: Container | undefined = node.parent as Container | undefined
  while (p && p.type !== "root") {
    if (p.type === "atrule" && /keyframes$/i.test((p as AtRule).name)) return true
    p = p.parent as Container | undefined
  }
  return false
}

export interface CompiledThemeStylesheet {
  css: string
  /** Rules, declarations and at-rules left out, by reason. For the import report. */
  dropped: { atRules: number; declarations: number; rules: number }
  /** True when the input could not be read as CSS at all. */
  failed: boolean
}

const cache = new Map<string, CompiledThemeStylesheet>()
const CACHE_SIZE = 16

/** The stylesheet, safe to draw inside the page root. Never throws. */
export function compileThemeStylesheet(input: unknown, scope = THEME_STYLESHEET_SCOPE): CompiledThemeStylesheet {
  if (typeof input !== "string" || !input.trim()) return { css: "", dropped: { atRules: 0, declarations: 0, rules: 0 }, failed: false }
  if (input.length > THEME_STYLESHEET_LIMIT) return { css: "", dropped: { atRules: 0, declarations: 0, rules: 0 }, failed: true }
  const source = input
  const key = `${scope}\n${source}`
  const hit = cache.get(key)
  if (hit) return hit

  const dropped = { atRules: 0, declarations: 0, rules: 0 }
  let root
  try {
    root = postcss.parse(source)
  } catch {
    const out = { css: "", dropped, failed: true }
    remember(key, out)
    return out
  }

  /* Comments are for the theme's authors, and a few KB the page does not need. */
  root.walkComments((c) => { c.remove() })

  root.walkAtRules((at: AtRule) => {
    const name = at.name.toLowerCase().replace(/^-webkit-/, "")
    if (DROPPED_AT_RULES.has(name)) {
      at.remove()
      dropped.atRules++
      return
    }
    if (name === "media") {
      const container = widthQueryAsContainer(at.params)
      if (container) {
        at.name = "container"
        at.params = container
      }
    }
    if (BANNED_VALUE.test(at.params)) {
      at.remove()
      dropped.atRules++
    }
  })

  root.walkRules((rule: Rule) => {
    if (insideKeyframes(rule)) return
    if (insideRule(rule)) {
      rule.selectors = rule.selectors.map((s) => canvasOnce(s))
      return
    }
    const inQuery = insideContainerQuery(rule)
    const scoped = rule.selectors.map((s) => scopeSelector(s, scope)).map((s) => (s.root && inQuery && s.selector === scope ? { selector: `${scope} > *`, root: true } : s))
    const kept = scoped.map((s) => s.selector).filter(Boolean)
    if (!kept.length) {
      rule.remove()
      dropped.rules++
      return
    }
    /*
      A rule that is only about the page root keeps only what a page root
      may take. Mixed with other selectors (`body, .page-width`), it is split
      so the others keep everything.
    */
    const rootOnly = scoped.filter((s) => s.root).map((s) => s.selector)
    const others = scoped.filter((s) => !s.root).map((s) => s.selector)
    if (rootOnly.length && others.length) {
      const copy = rule.clone({ selectors: [...new Set(rootOnly)] })
      trimToRoot(copy, dropped)
      rule.selectors = others
      if (copy.nodes.length) rule.before(copy)
      return
    }
    rule.selectors = [...new Set(kept)]
    if (rootOnly.length) {
      trimToRoot(rule, dropped)
      if (!rule.nodes.length) rule.remove()
    }
  })

  root.walkDecls((decl: Declaration) => {
    if (!valueAllowed(decl.value) || /[<>]/.test(decl.prop)) {
      decl.remove()
      dropped.declarations++
      return
    }
    /* Once: what canvasSafeUnits writes still holds a `1vh` of its own. */
    if (!decl.value.includes("var(--sl-v")) decl.value = canvasSafeUnits(decl.value)
  })

  /* Empty containers left by what was dropped. */
  root.walkRules((rule) => {
    if (!rule.nodes.length) rule.remove()
  })

  const css = root.toString().replace(/</g, "\\3c ")
  const out = { css, dropped, failed: false }
  remember(key, out)
  return out
}

function trimToRoot(rule: Rule, dropped: CompiledThemeStylesheet["dropped"]) {
  for (const node of [...rule.nodes]) {
    if (node.type === "decl" && !ROOT_PROPERTY.test(node.prop)) {
      node.remove()
      dropped.declarations++
    }
  }
}

function remember(key: string, value: CompiledThemeStylesheet) {
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value as string)
  cache.set(key, value)
}
