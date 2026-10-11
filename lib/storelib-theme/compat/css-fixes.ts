/**
 * ===========================================================================
 *  A BUTTON'S LABEL NEVER WEARS A BOX OF ITS OWN
 * ===========================================================================
 * A theme that wants its button colour to win over every other rule writes
 * it for the button and for everything inside it at once:
 *
 *   cart-notification .btn-checkout,
 *   cart-notification .btn-checkout * { background-color: #111 !important; color: #fff !important }
 *   cart-notification .btn-checkout:hover { background-color: #383838 !important }
 *
 * The `*` is there for the colour, so the label's <span> cannot be painted
 * by a rule meant for the drawer's text. But the background goes with it,
 * and on hover only the button changes: the word "Checkout" then sits on a
 * dark box of its own, the button's resting colour, inside the lighter
 * hover colour (Posturex's cart drawer, scratchpad r2-checkout-button.png).
 *
 * So in a rule that names a button and `that button *` together, what is
 * inside the button is given a transparent background instead, with the
 * same weight (!important stays !important). The button itself keeps every
 * declaration, the label keeps its colour, and the label now shows the
 * button through it, at rest and on hover alike. Nothing else is touched:
 * only rules with both halves, only a selector that reads as a button.
 *
 * Applied to every stylesheet the theme brings: its <style> blocks
 * (theme.ts finish), its {% stylesheet %} bundle, and its CSS assets
 * (site.ts themeAsset and the asset route). Pure, so tests/compat-css-fixes
 * reads exactly what comes out.
 */

/* What a theme calls a button, read from the selector's last part. */
const BUTTONISH = /(?:\bbtn\b|btn[-_]|[-_]btn\b|button|\bcheckout\b|checkout[-_]|[-_]checkout\b|\bsubmit\b|\bcta\b|add[-_]to[-_]cart|\[name=["']?(?:add|checkout)["']?\])/i

/** Splits a selector list at its top-level commas (not those inside :is(), :not() or an attribute). */
function splitSelectors(list: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote = ""
  let start = 0
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    if (quote) {
      if (c === quote && list[i - 1] !== "\\") quote = ""
      continue
    }
    if (c === '"' || c === "'") quote = c
    else if (c === "(" || c === "[") depth++
    else if (c === ")" || c === "]") depth = Math.max(0, depth - 1)
    else if (c === "," && depth === 0) {
      out.push(list.slice(start, i))
      start = i + 1
    }
  }
  out.push(list.slice(start))
  return out.map((s) => s.trim()).filter(Boolean)
}

/** The declarations, with every background one made transparent at the same weight. Null when there was none. */
function clearBackgrounds(body: string): string | null {
  let any = false
  const decls = body.split(";").map((d) => {
    const m = d.match(/^\s*(background(?:-color|-image)?)\s*:\s*([\s\S]*)$/i)
    if (!m) return d
    any = true
    const important = /!\s*important\s*$/i.test(m[2]) ? " !important" : ""
    const prop = m[1].toLowerCase()
    return `${prop}:${prop === "background-image" ? "none" : "transparent"}${important}`
  })
  if (!any) return null
  return decls.join(";")
}

/**
 * One stylesheet with the fix above made. Fast to say no: a sheet with no
 * ` *` and no background in it comes back as it was.
 */
export function fixThemeCss(css: string): string {
  if (!css || css.indexOf("*") < 0 || !/background/i.test(css)) return css
  return css.replace(/([^{};]+)\{([^{}]*)\}/g, (whole, rawSelectors: string, body: string) => {
    if (rawSelectors.indexOf("*") < 0 || !/background/i.test(body)) return whole
    /* A comment before the rule is not part of any selector. */
    const lead = rawSelectors.match(/^[\s\S]*\*\/\s*/)?.[0] ?? ""
    const selectorText = rawSelectors.slice(lead.length)
    if (/^\s*@/.test(selectorText) || selectorText.indexOf("*") < 0) return whole
    const selectors = splitSelectors(selectorText)
    const own = new Set(selectors)
    const inside = selectors.filter((s) => {
      const m = s.match(/^([\s\S]+?)\s+\*$/)
      if (!m) return false
      const base = m[1].trim()
      if (!own.has(base)) return false
      const last = base.split(/\s*[\s>+~]\s*/).pop() ?? base
      return BUTTONISH.test(last)
    })
    if (!inside.length) return whole
    const cleared = clearBackgrounds(body)
    if (cleared === null) return whole
    const rest = selectors.filter((s) => !inside.includes(s))
    /* The button keeps the rule as written; what is inside it, the same declarations with the background made clear. */
    return `${lead}${rest.length ? `${rest.join(",")}{${body}}` : ""}${inside.join(",")}{${cleared}}`
  })
}

/** Every <style> block of a page or a section, fixed. */
export function fixInlineStyles(html: string): string {
  if (!html || html.indexOf("<style") < 0) return html
  return html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi, (whole, open: string, css: string, close: string) => {
    const fixed = fixThemeCss(css)
    return fixed === css ? whole : `${open}${fixed}${close}`
  })
}
