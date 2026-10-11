/**
 * ===========================================================================
 *  THE STYLES OF A SECTION PICTURED IN ADD A SECTION
 * ===========================================================================
 * Add a section pictures every section of an imported theme in one tall
 * document (components/website-builder/compat/compat-section-preview.tsx).
 * Two things about the theme's styles have to change for that, and only
 * for that:
 *
 *   A VIEWPORT HEIGHT IS THE WINDOW'S, NOT THE DOCUMENT'S. The document's
 *   viewport is as tall as the whole list, so a hero that is `100vh` would
 *   be tens of thousands of pixels tall with its words in the middle. Each
 *   viewport height in a stylesheet, a <style> or a style attribute is
 *   turned into the pixels it is in a window of an ordinary size. Widths
 *   need nothing: the document is as wide as the window pictured.
 *
 *   THE STYLESHEETS ARE CARRIED IN THE DOCUMENT. An editor's draft asset is
 *   answered "revalidate every time", so each linked stylesheet was a round
 *   trip before the section could be drawn styled. Their text is already in
 *   the editor (the install's files), so it is put in the document instead.
 *
 * Nothing here runs on a live page or in the canvas.
 */

const VIEWPORT_UNIT = /([\s:,(+*/]|^)(-?(?:\d+\.?\d*|\.\d+))([sld]?)(vh|vmin|vmax)\b/g

/** A viewport height (vh, svh, dvh, lvh, vmin, vmax) in pixels of a window this size. */
export function freezeViewportUnits(css: string, width: number, height: number): string {
  if (!/\d[sld]?v(h|min|max)\b/.test(css)) return css
  const vh = height / 100
  const vw = width / 100
  return css.replace(VIEWPORT_UNIT, (_m, pre: string, n: string, _p: string, unit: string) => {
    const per = unit === "vh" ? vh : unit === "vmin" ? Math.min(vh, vw) : Math.max(vh, vw)
    return `${pre}${Math.round(Number(n) * per * 1000) / 1000}px`
  })
}

/** The same, in a piece of markup: its <style> elements and its style attributes, not its words. */
export function freezeViewportInMarkup(html: string, width: number, height: number): string {
  if (!/\d[sld]?v(h|min|max)\b/.test(html)) return html
  return html
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open: string, css: string, close: string) => open + freezeViewportUnits(css, width, height) + close)
    .replace(/(\sstyle\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi, (_m, pre: string, dq?: string, sq?: string) =>
      dq !== undefined ? `${pre}"${freezeViewportUnits(dq, width, height)}"` : `${pre}'${freezeViewportUnits(sq ?? "", width, height)}'`,
    )
}

/** A stylesheet's own relative addresses (its fonts, its pictures), made absolute so they still resolve once its text is in the document. */
function absoluteUrls(css: string, base: string): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q: string, u: string) => {
    const url = u.trim()
    if (/^(data:|blob:|https?:|\/\/|\/|#|about:)/i.test(url)) return m
    try {
      return `url(${q}${new URL(url, base).href}${q})`
    } catch {
      return m
    }
  })
}

/**
 * THE THEME'S STYLESHEETS, CARRIED IN THE DOCUMENT. Read from the install's
 * own files rather than fetched: the document has its styles the moment it
 * is parsed, so nothing in it is ever drawn unstyled, and their viewport
 * heights can be frozen with the rest. A stylesheet that is not among the
 * files stays a link.
 */
export function inlineStylesheets(html: string, rows: Record<string, string> | null, width: number, height: number): string {
  if (!rows) return html
  const base = typeof document !== "undefined" ? document.baseURI : "http://localhost/"
  /*
    THE SAME STYLESHEET TWICE IS KEPT ONCE, THE LAST TIME. A theme that
    links theme.css in its layout and again in a snippet has every one of
    its rules matched twice for every element. Each rule of the first copy
    is in the second, later, at the same specificity, so the first never
    decides anything: dropping it changes nothing on the page.
  */
  const seen = new Map<string, number>()
  let at = 0
  const inlined: string[] = []
  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/\brel\s*=\s*["']?stylesheet\b/i.test(tag)) return tag
    const href = tag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
    const url = (href?.[1] ?? href?.[2] ?? href?.[3] ?? "").replace(/&amp;/g, "&")
    if (!url || /^(https?:)?\/\//i.test(url)) return tag
    let name = ""
    try {
      name = decodeURIComponent(url.split(/[?#]/)[0].split("/").pop() ?? "")
    } catch {
      return tag
    }
    const text = name ? rows[`shopify/assets/${name}`] : undefined
    if (typeof text !== "string" || text.startsWith("base64:")) return tag
    const media = tag.match(/\bmedia\s*=\s*(?:"([^"]*)"|'([^']*)')/i)
    const m = media ? (media[1] ?? media[2] ?? "").trim() : ""
    let abs = base
    try {
      abs = new URL(url, base).href
    } catch {
      /* the page's own address then */
    }
    const css = freezeViewportUnits(absoluteUrls(text, abs), width, height).replace(/<\/style/gi, "\\3c /style")
    const media_ = m && m !== "all" ? ` media="${m.replace(/"/g, "")}"` : ""
    const n = at++
    seen.set(`${name}|${media_}`, n)
    inlined.push(`${name}|${media_}`)
    return `<!--sl-sheet:${n}--><style data-sheet-from="${name.replace(/["<>&]/g, "")}"${media_}>${css}</style>`
  })
  return html.replace(/<!--sl-sheet:(\d+)-->(<style\b[^>]*>[\s\S]*?<\/style>)/g, (_m, n: string, style: string) => (seen.get(inlined[Number(n)]) === Number(n) ? style : ""))
}
