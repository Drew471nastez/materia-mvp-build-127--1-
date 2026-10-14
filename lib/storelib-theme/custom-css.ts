/**
 * ===========================================================================
 *  CUSTOM CSS: THE CREATOR'S OWN RULES, KEPT TO THEIR OWN PAGE
 * ===========================================================================
 * Shopify's Theme settings › Custom CSS, and the same promise: rules the
 * creator writes apply to their storefront and nowhere else. What is stored
 * is exactly what they typed, so nothing they wrote is ever lost to a rule
 * they cannot see; what is DRAWN is this function's output, on the live
 * page and in the builder alike:
 *
 *   SCOPED. Every selector is put under the page root, so `.card { … }`
 *   cannot reach the builder around the canvas, and `html`, `body` and
 *   `:root` mean the page root itself.
 *
 *   ONLY CSS. A `<` anywhere is refused, so the text can never close the
 *   <style> it is printed in. So are backslash escapes, which are how a
 *   blocked word is spelled past a filter, `@import`, `@font-face`,
 *   `@charset` and `@namespace`, `expression()`, `behavior` and
 *   `-moz-binding`, and any `url()` that is not https or one of the site's
 *   own paths.
 *
 *   KEPT WHERE IT CAN BE. A declaration that breaks a rule is dropped on its
 *   own and named in `dropped`, and the rest of the rule stays; the editor
 *   shows the names under the box so the creator knows which line did not
 *   take.
 *
 *   ANSWERING TO THE PAGE. A media query that asks only about width becomes
 *   the same container query and viewport units become the page's, the
 *   rewrite every section's stylesheet gets (storelib/css-units.ts), so the
 *   phone preview shows the phone rules.
 *
 * No parser library: this runs in the browser on every keystroke in the
 * box, and the grammar it accepts is small on purpose.
 */
import { canvasSafeUnits, widthQueryAsContainer } from "./storelib/css-units"

/** Characters of custom CSS the theme keeps. Shopify's own limit is 1,500 per section; the theme's box is bigger. */
export const CUSTOM_CSS_MAX = 20000

export interface CleanedCss {
  /** Scoped, safe CSS, ready for a <style>. Empty when nothing was usable. */
  css: string
  /** What was left out, in a few words each, for the editor to show. */
  dropped: string[]
}

const BLOCK_AT_RULES = new Set(["media", "supports", "container", "layer"])
const BANNED_VALUE = /expression\s*\(|javascript:|vbscript:|-moz-binding|behaviou?r\s*:/i
const PROPERTY = /^(--[A-Za-z0-9_-]{1,64}|-?[a-z][a-z-]{0,63})$/
const BANNED_PROPERTY = /^(behaviou?r|-moz-binding)$/i

/** Split on a character at depth zero, outside strings, brackets and parentheses. */
function splitTop(text: string, sep: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote = ""
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === quote) quote = ""
      continue
    }
    if (c === '"' || c === "'") quote = c
    else if (c === "(" || c === "[") depth++
    else if ((c === ")" || c === "]") && depth > 0) depth--
    else if (c === sep && depth === 0) {
      out.push(text.slice(start, i))
      start = i + 1
    }
  }
  out.push(text.slice(start))
  return out
}

interface Node {
  prelude: string
  /** The text between the braces, or null for a statement that ended with `;`. */
  body: string | null
}

/** The top-level rules of a stylesheet: each prelude and its block. Unbalanced braces end the read. */
function readNodes(text: string): Node[] {
  const nodes: Node[] = []
  let i = 0
  while (i < text.length) {
    let quote = ""
    let j = i
    let found = -1
    for (; j < text.length; j++) {
      const c = text[j]
      if (quote) {
        if (c === quote) quote = ""
        continue
      }
      if (c === '"' || c === "'") quote = c
      else if (c === "{" || c === ";" || c === "}") {
        found = j
        break
      }
    }
    if (found === -1) {
      if (text.slice(i).trim()) nodes.push({ prelude: text.slice(i).trim(), body: null })
      break
    }
    const prelude = text.slice(i, found).trim()
    if (text[found] !== "{") {
      if (prelude) nodes.push({ prelude, body: null })
      i = found + 1
      continue
    }
    // The block runs to its matching brace.
    let depth = 1
    let k = found + 1
    quote = ""
    for (; k < text.length && depth > 0; k++) {
      const c = text[k]
      if (quote) {
        if (c === quote) quote = ""
        continue
      }
      if (c === '"' || c === "'") quote = c
      else if (c === "{") depth++
      else if (c === "}") depth--
    }
    if (depth !== 0) {
      nodes.push({ prelude, body: null })
      break
    }
    nodes.push({ prelude, body: text.slice(found + 1, k - 1) })
    i = k
  }
  return nodes
}

/** A `url(...)` that loads from https or the site itself. */
function urlsAllowed(value: string): boolean {
  const urls: string[] = value.match(/url\s*\(\s*(['"]?)(.*?)\1\s*\)/gi) ?? []
  if (/url\s*\(/i.test(value) && urls.length === 0) return false
  return urls.every((u) => {
    const m = u.match(/url\s*\(\s*(['"]?)(.*?)\1\s*\)/i)
    const addr = (m?.[2] ?? "").trim()
    return /^https:\/\//i.test(addr) || /^\/(?![/\\])/.test(addr)
  })
}

function cleanDeclarations(body: string, dropped: string[]): string {
  const out: string[] = []
  for (const raw of splitTop(body, ";")) {
    const decl = raw.trim()
    if (!decl) continue
    const colon = decl.indexOf(":")
    if (colon <= 0) {
      dropped.push(`"${decl.slice(0, 40)}" is not a declaration`)
      continue
    }
    const prop = decl.slice(0, colon).trim()
    const value = decl.slice(colon + 1).trim()
    if (!PROPERTY.test(prop) || BANNED_PROPERTY.test(prop)) {
      dropped.push(`${prop.slice(0, 40)} is not allowed`)
      continue
    }
    if (!value || /[{}]/.test(value) || BANNED_VALUE.test(value) || !urlsAllowed(value)) {
      dropped.push(`${prop}: that value is not allowed`)
      continue
    }
    out.push(`${prop}:${canvasSafeUnits(value)}`)
  }
  return out.join(";")
}

const ROOT_LIKE = /^(html|body|:root)$/i

function scopeSelectors(prelude: string, scope: string): string | null {
  const parts = splitTop(prelude, ",").map((s) => s.trim()).filter(Boolean)
  if (parts.length === 0) return null
  return parts
    .map((sel) => {
      if (ROOT_LIKE.test(sel)) return scope
      const stripped = sel.replace(/^(html|body|:root)\s+/i, "")
      return stripped.startsWith("&") ? stripped.replace(/^&/, scope) : `${scope} ${stripped}`
    })
    .join(",")
}

function cleanNodes(nodes: Node[], scope: string, dropped: string[], depth: number): string[] {
  const out: string[] = []
  for (const n of nodes) {
    if (n.prelude.startsWith("@")) {
      const name = (n.prelude.match(/^@([a-z-]+)/i)?.[1] ?? "").toLowerCase()
      const params = n.prelude.slice(name.length + 1).trim()
      if (n.body !== null && BLOCK_AT_RULES.has(name) && depth < 3 && !/[;{}]/.test(params)) {
        const inner = cleanNodes(readNodes(n.body), scope, dropped, depth + 1)
        if (inner.length === 0) continue
        const container = name === "media" ? widthQueryAsContainer(params) : null
        out.push(`${container ? `@container ${container}` : `@${name} ${params}`}{${inner.join("")}}`)
        continue
      }
      if (n.body !== null && (name === "keyframes" || name === "-webkit-keyframes") && /^[A-Za-z_][\w-]{0,63}$/.test(params)) {
        const frames = readNodes(n.body)
          .filter((f) => f.body !== null && /^(from|to|\d{1,3}(\.\d+)?%)(\s*,\s*(from|to|\d{1,3}(\.\d+)?%))*$/i.test(f.prelude))
          .map((f) => `${f.prelude}{${cleanDeclarations(f.body ?? "", dropped)}}`)
        out.push(`@keyframes ${params}{${frames.join("")}}`)
        continue
      }
      dropped.push(`@${name || "rule"} is not allowed here`)
      continue
    }
    if (n.body === null) {
      dropped.push(`"${n.prelude.slice(0, 40)}" has no rules`)
      continue
    }
    const selector = /[@]/.test(n.prelude) ? null : scopeSelectors(n.prelude, scope)
    if (!selector) {
      dropped.push(`"${n.prelude.slice(0, 40)}" is not a selector`)
      continue
    }
    const decls = cleanDeclarations(n.body, dropped)
    if (decls) out.push(`${selector}{${decls}}`)
  }
  return out
}

/** The creator's CSS, scoped to `scope` and cleaned. Pure; safe to call on every keystroke. */
export function cleanCustomCss(input: unknown, scope: string): CleanedCss {
  if (typeof input !== "string" || input.trim() === "") return { css: "", dropped: [] }
  const dropped: string[] = []
  let text = input.length > CUSTOM_CSS_MAX ? (dropped.push(`everything after ${CUSTOM_CSS_MAX} characters`), input.slice(0, CUSTOM_CSS_MAX)) : input
  text = text.replace(/\/\*[\s\S]*?(\*\/|$)/g, " ")
  /* Nothing can close the <style> this is printed in, and nothing is spelled past the rules with an escape. */
  if (/[<\\]/.test(text)) {
    dropped.push(/</.test(text) ? "the < character" : "backslash escapes")
    text = text.replace(/[<\\]/g, "")
  }
  const css = cleanNodes(readNodes(text), scope, dropped, 0).join("\n")
  return { css, dropped: [...new Set(dropped)].slice(0, 20) }
}
