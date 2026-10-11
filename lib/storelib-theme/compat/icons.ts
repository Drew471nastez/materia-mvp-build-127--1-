/**
 * ===========================================================================
 *  AN ICON FROM A SPRITE FILE DRAWS WHEREVER THE PAGE DRAWS
 * ===========================================================================
 * Most themes draw icons inline: a snippet with an <svg> in it
 * (`{% render 'icon-cart' %}`), an asset read in with
 * `{{ 'icon-cart.svg' | inline_asset_content }}`, or a sprite of <symbol>s
 * in the page that `<use href="#icon-cart">` points at. Those draw anywhere.
 *
 * One way does not: a sprite FILE, `<use href="{{ 'icons.svg' | asset_url
 * }}#cart">`. A browser fetches that file only from the page's own origin.
 * The builder's canvas is a sandboxed frame with no origin at all, so there
 * every such icon was an empty box, and a theme served from a host other
 * than its assets' would lose them on the website too.
 *
 * So the symbol is drawn in place: the <use> becomes an <svg> with the
 * symbol's viewBox and its shapes, which is exactly what <use> of a
 * <symbol> renders. Only for a sprite that is one of the theme's own assets
 * (its text is in the theme's files); anything else is left as written.
 */

const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** The symbol (or bare <svg>) with that id in a sprite file, as nested markup, or null. */
function symbolMarkup(sprite: string, id: string, attrs: string): string | null {
  const open = new RegExp(`<(symbol|svg)\\b([^>]*\\bid\\s*=\\s*["']${esc(id)}["'][^>]*)>`, "i").exec(sprite)
  if (!open) return null
  const tag = open[1].toLowerCase()
  const close = sprite.indexOf(`</${tag}>`, open.index + open[0].length)
  if (close < 0) return null
  const inner = sprite.slice(open.index + open[0].length, close)
  const viewBox = open[2].match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1]
  const keep = attrs.replace(/\s(?:xlink:)?href\s*=\s*("[^"]*"|'[^']*')/gi, "").trim()
  return `<svg${viewBox ? ` viewBox="${viewBox}"` : ""}${/\bwidth\s*=/.test(keep) ? "" : ' width="100%"'}${/\bheight\s*=/.test(keep) ? "" : ' height="100%"'}${keep ? ` ${keep}` : ""}>${inner}</svg>`
}

/**
 * Every `<use href="<sprite file>#<id>">` whose sprite `spriteText` knows,
 * drawn in place. `spriteText` is given the address as written and answers
 * with the file's text, or null for a file that is not the theme's.
 */
export function inlineSpriteFiles(html: string, spriteText: (url: string) => string | null): string {
  if (!html || html.indexOf("<use") < 0) return html
  return html.replace(/<use\b([^>]*?)\s*(\/>|>\s*<\/use\s*>|>)/gi, (whole, attrs: string) => {
    const href = attrs.match(/\s(?:xlink:)?href\s*=\s*["']([^"']+)["']/i)?.[1]
    if (!href || href.startsWith("#")) return whole
    const hash = href.indexOf("#")
    if (hash <= 0) return whole
    const url = href.slice(0, hash).replace(/&amp;/g, "&")
    if (!/\.svg(?:$|[?])/i.test(url)) return whole
    let id = href.slice(hash + 1)
    try {
      id = decodeURIComponent(id)
    } catch {
      return whole
    }
    const sprite = spriteText(url)
    if (!sprite) return whole
    return symbolMarkup(sprite, id, attrs) ?? whole
  })
}

/** The asset name an address names, for an address of the theme's own assets (its last part, decoded, any query left off). */
export function assetNameOf(url: string): string | null {
  const path = url.split(/[?#]/)[0]
  const last = path.slice(path.lastIndexOf("/") + 1)
  if (!last) return null
  try {
    return decodeURIComponent(last)
  } catch {
    return null
  }
}
