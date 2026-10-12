/**
 * ===========================================================================
 *  WHAT A WEBSITE'S BROWSER TAB SAYS, ONE RULE FOR EVERY PAGE
 * ===========================================================================
 * The tab, the search result and a shared link's title are the same line,
 * and before this each place made its own: the home page took the site
 * title, a sub-page "<page> | <brand>", a product "<name> | <brand>" with a
 * different brand, the cart "Cart | Storelib", every collection
 * "Collections | <brand>", the checkout "Checkout · <store>", and an
 * imported theme wrote its own "<title> – <shop>" after whatever it was
 * given. SEO & Social previewed one of those and the tab showed another
 * (round I, the owner: "exactly the same in the browser tab").
 *
 * Shopify's rule, with one separator:
 *
 *   home          the site title from SEO & Social exactly, else the store name
 *   a page        its own SEO title exactly when the creator wrote one,
 *                 else "<page> | <store>"
 *   a product     its SEO title exactly, else "<product> | <store>"
 *   a collection  "<collection> | <store>"
 *   search        "Search: <words> | <store>"
 *   cart          "Your cart | <store>"
 *   checkout      "Checkout | <store>"
 *   not found     "Page not found | <store>"
 *   page 2 of a list  "<list> | Page 2 | <store>"
 *
 * The store's name is never said twice: a title that already has it in it
 * stands alone, as a Shopify theme's `unless page_title contains shop.name`.
 *
 * Read by the live pages' metadata (app/(site)/w/[username]/render-site.tsx
 * and the routes beside it), a product's (components/website-builder/theme/
 * render-product.tsx), an imported theme's live page, whose own <title> is
 * set to this (lib/storelib-theme/compat/site.ts), the checkout's template,
 * and the preview in Website settings › SEO & Social. Pure, so the browser
 * and the server say the same.
 */

/** Between a page's name and the store's. The one SEO & Social shows. */
export const TAB_SEPARATOR = " | "

export type TabPage =
  | { kind: "home" }
  /** Any page with a name of its own: About, Shop, Collections, a policy, Sign in. */
  | { kind: "page"; name: string }
  | { kind: "product"; name: string }
  | { kind: "collection"; name: string }
  | { kind: "search"; query?: string | null }
  | { kind: "cart" }
  | { kind: "checkout" }
  | { kind: "not-found" }

export interface TabTitleInput {
  page: TabPage
  /** The store's name, as the website shows it (siteStoreName). */
  storeName: string
  /** SEO & Social's site title: the home page's, exactly. */
  siteTitle?: string | null
  /** The page's or product's own SEO title, when the creator wrote one: used exactly. */
  ownTitle?: string | null
  /** Which page of a long list: 2 and on say so. */
  pageNumber?: number | null
}

/** One line, no control characters, no runs of spaces. */
export function cleanTitle(value: unknown): string {
  if (typeof value !== "string") return ""
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()
}

/**
 * The store's name as a website says it: the website's brand name (Theme
 * settings), else Store details' store name, else the person's name, else
 * the address it lives at. The order an imported theme's `shop.name` has
 * always used (lib/website-builder/compat-site.ts).
 */
export function siteStoreName(names: { brandName?: unknown; storeName?: unknown; displayName?: unknown; handle?: unknown }): string {
  return cleanTitle(names.brandName) || cleanTitle(names.storeName) || cleanTitle(names.displayName) || cleanTitle(names.handle) || "Store"
}

/** What the page is called, without the store: Shopify's `page_title`. */
export function tabPagePart(page: TabPage): string {
  switch (page.kind) {
    case "home": return ""
    case "page":
    case "product":
    case "collection": return cleanTitle(page.name)
    case "search": {
      const q = cleanTitle(page.query ?? "").slice(0, 80)
      return q ? `Search: ${q}` : "Search"
    }
    case "cart": return "Your cart"
    case "checkout": return "Checkout"
    case "not-found": return "Page not found"
  }
}

const contains = (text: string, part: string) => !!part && text.toLocaleLowerCase().includes(part.toLocaleLowerCase())

/** The tab's whole line. */
export function siteTabTitle(input: TabTitleInput): string {
  const store = cleanTitle(input.storeName) || "Store"
  const n = Math.floor(Number(input.pageNumber) || 1)
  const paged = (title: string) => (n > 1 ? `${title}${TAB_SEPARATOR}Page ${n}` : title)
  const own = cleanTitle(input.ownTitle)
  if (input.page.kind === "home") return paged(cleanTitle(input.siteTitle) || own || store)
  if (own) return paged(own)
  const part = tabPagePart(input.page) || store
  const title = paged(part)
  return contains(part, store) ? title : `${title}${TAB_SEPARATOR}${store}`
}

/** A Next title template for pages that name only themselves ("Checkout"), as siteTabTitle would. */
export function tabTitleTemplate(storeName: string): string {
  return `%s${TAB_SEPARATOR}${cleanTitle(storeName) || "Store"}`
}

/** The page number a list's address asks for (`?page=2`), or 1. */
export function pageNumberOf(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) && n > 1 && n < 10000 ? n : 1
}

const escapeHtmlText = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/**
 * AN IMPORTED THEME'S PAGE, SAYING THE SAME. A theme writes its own <title>
 * from `page_title` and `shop.name`, each its own way (Dawn's "<title> –
 * <shop> – Page 2", others the title alone), so the tab of an imported site
 * said something SEO & Social never showed. Its <title> and its share
 * card's title (og:title, twitter:title) are set to the website's line
 * here, in the page's <head> only; everything else the theme wrote stays.
 */
export function withTabTitle(html: string, title: string): string {
  const t = cleanTitle(title)
  if (!t) return html
  const end = html.search(/<\/head\s*>/i)
  if (end < 0) return html
  let head = html.slice(0, end)
  const tag = `<title>${escapeHtmlText(t)}</title>`
  const own = /<title\b[^>]*>[\s\S]*?<\/title\s*>/i
  if (own.test(head)) head = head.replace(own, () => tag)
  else if (/<head\b[^>]*>/i.test(head)) head = head.replace(/<head\b[^>]*>/i, (m) => `${m}${tag}`)
  else head = `${head}${tag}`
  head = head.replace(/<meta\b[^>]*\b(?:property|name)\s*=\s*["'](?:og:title|twitter:title)["'][^>]*>/gi, (meta) =>
    meta.replace(/\bcontent\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, () => `content="${escapeHtmlText(t)}"`),
  )
  return head + html.slice(end)
}
