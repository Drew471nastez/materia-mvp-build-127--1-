/**
 * ===========================================================================
 *  A LINK THAT OPENS IN A NEW TAB
 * ===========================================================================
 * Every link on a website is one string, in a React section, a coded section
 * or a menu, so "open in a new tab" travels with the address itself: a mark
 * at its end, `#_blank`. The link picker sets and clears it
 * (components/website-builder/link-picker.tsx), and the published site turns
 * a marked link into a real one, the mark taken off and
 * `target="_blank" rel="noopener noreferrer"` put on
 * (components/website-builder/new-tab-links.tsx). Before that script runs a
 * marked link still works: it opens in the same tab, at a place on the page
 * that is not there, which a browser ignores.
 *
 * Pure, so tests can ask it everything.
 */
export const NEW_TAB_MARK = "#_blank"

/** Whether this address asks for a new tab. */
export function opensNewTab(href: string | null | undefined): boolean {
  return typeof href === "string" && href.endsWith(NEW_TAB_MARK)
}

/** The address without the mark, as the browser should follow it. */
export function withoutNewTab(href: string): string {
  return opensNewTab(href) ? href.slice(0, -NEW_TAB_MARK.length) : href
}

/** The address with the mark on or off. An empty address stays empty. */
export function withNewTab(href: string, on: boolean): string {
  const bare = withoutNewTab(href ?? "")
  if (!bare) return ""
  return on ? `${bare}${NEW_TAB_MARK}` : bare
}

/* ── Checkout of one product ─────────────────────────────────────────── */

/**
 * A link straight to one product's checkout, not its page and not the cart:
 * `/checkout?productId=<id>&src=website`, the address the developer docs
 * give sections (lib/developers "Selling"). On the website's own address
 * (its subdomain or its custom domain) /checkout is served there, and
 * CheckoutLinkOrigin adds the page and the visit's source as it is followed.
 */
export function productCheckoutHref(productId: string): string {
  return `/checkout?productId=${encodeURIComponent(productId)}&src=website`
}

/** The product a checkout link is for, or null for any other address. */
export function checkoutProductOf(href: string | null | undefined): string | null {
  const v = withoutNewTab((href ?? "").trim())
  const m = /^(?:https?:\/\/[^/]+)?\/checkout\?(.*)$/i.exec(v)
  if (!m) return null
  const id = new URLSearchParams(m[1].split("#")[0]).get("productId")
  return id || null
}

/* ── Drawn as a real new tab link ────────────────────────────────────── */

/**
 * What an `<a>` for this address carries: the address without the mark, and
 * `target="_blank"` with `rel="noopener noreferrer"` when it asked for a new
 * tab. A React section spreads it; `openInNew` is a link's own setting (the
 * header's `open_in_new_tab`), which asks the same thing.
 */
export function newTabLink(href: string | null | undefined, openInNew = false): { href: string; target?: "_blank"; rel?: string } {
  const raw = href ?? ""
  const bare = withoutNewTab(raw)
  return openInNew || opensNewTab(raw) ? { href: bare, target: "_blank", rel: "noopener noreferrer" } : { href: bare }
}

/* An address before the mark: "#_blank" alone is a place on the page, never a link the picker made (withNewTab). */
const MARKED_ANCHOR = /<a\b[^>]*?\shref\s*=\s*(?:"[^"]+#_blank"|'[^']+#_blank'|[^\s"'>]+#_blank(?=[\s>]))[^>]*>/gi

/**
 * The same, in markup a template drew: every `<a>` whose address ends in the
 * mark loses it and gains `target="_blank" rel="noopener noreferrer"`. For
 * the pages that are strings rather than React: an imported theme's Liquid
 * (its header, drawers, mega menus and footer all print `link.url`) and a
 * coded section. Done where the page is drawn, so the live site and the
 * builder's canvas get the same real link, with no script waiting to fix it.
 * Pure; a page with no marked link comes back as it was.
 */
export function withNewTabAnchors(html: string): string {
  if (!html.includes(NEW_TAB_MARK)) return html
  return html.replace(MARKED_ANCHOR, (tag) => {
    let out = tag.replace(/(\shref\s*=\s*)(?:"([^"]+)#_blank"|'([^']+)#_blank'|([^\s"'>]+)#_blank(?=[\s>]))/i, (_m, lead: string, dq?: string, sq?: string, bare?: string) =>
      dq !== undefined ? `${lead}"${dq}"` : sq !== undefined ? `${lead}'${sq}'` : `${lead}${bare ?? ""}`,
    )
    /* The theme's own target or rel, if it wrote one, gives way: the creator asked for a new tab. */
    out = out.replace(/\s\btarget\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, "")
    const rel = out.match(/\s\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
    const words = new Set(((rel?.[1] ?? rel?.[2] ?? rel?.[3] ?? "") + " noopener noreferrer").split(/\s+/).filter(Boolean))
    if (rel) out = out.replace(rel[0], "")
    return out.replace(/\s*(\/?)>$/, ` target="_blank" rel="${[...words].join(" ")}"$1>`)
  })
}
