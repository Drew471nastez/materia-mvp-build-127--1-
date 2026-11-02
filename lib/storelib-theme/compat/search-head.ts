/**
 * ===========================================================================
 *  WHAT AN IMPORTED THEME'S PAGE TELLS A SEARCH ENGINE, MADE WHOLE
 * ===========================================================================
 * An imported theme draws its own <head>, and Shopify fills in for it what
 * Storelib does not: `page_image` for the share card, a CDN that answers
 * `"https:" | append: image_url`, the store's structured data. Measured on
 * the owner's live site (round BC): no page had an og:image, not even a
 * product; the theme's Product JSON-LD named its pictures
 * "https:/_next/image?…", an address that goes nowhere; the front page and
 * a page with no SEO description had no meta description; the password page
 * said nothing about not being indexed.
 *
 * This puts in what the theme left out, on the finished page, and only that:
 *
 *   description   a meta description, when the theme wrote none (or an
 *                 empty one);
 *   image         og:image and twitter:image, when the theme wrote none;
 *                 one the theme wrote that is not a full address is taken
 *                 out first, since a share card cannot fetch it;
 *   noindex       a robots meta, for a page that is not a search result;
 *   jsonLd        Storelib's structured data. The theme's own Product,
 *                 BreadcrumbList, Organization and WebSite blocks are taken
 *                 out when it is given, so a search engine reads one product
 *                 with a price and real pictures, not two that disagree.
 *                 Anything else a theme describes (an FAQ, a video) stays.
 *
 * Pure text in, text out, and small on purpose: the builder's canvas loads
 * the file that calls it (./site.ts). What the facts are is decided on the
 * server, in lib/website-builder/compat-search.ts.
 */

export interface SearchHead {
  description?: string | null
  image?: string | null
  noindex?: boolean
  /** Each one a JSON-LD script body, already safe to print (lib/seo/json-ld.ts). */
  jsonLd?: string[]
  /** og:type, where the page is not what the theme's head says (a blog post is an "article"). */
  ogType?: string
}

const attr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** The types Storelib describes itself, so the theme's own copy of them is dropped. */
const OWN_TYPES = /"@type"\s*:\s*"(?:Product|BreadcrumbList|Organization|WebSite|OnlineStore|Article|BlogPosting|Blog)"/

const metaContent = (tag: string): string | null => {
  const m = tag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i)
  return m ? (m[1] ?? m[2] ?? "") : null
}

/** A meta tag in the head, by its name or property. */
function metaTags(head: string, key: string): string[] {
  const re = new RegExp(`<meta\\b[^>]*\\b(?:name|property)\\s*=\\s*["']?${key.replace(/:/g, "\\:")}["']?[^>]*>`, "gi")
  return head.match(re) ?? []
}

/** A picture address a share card can fetch: https or http, with a host. */
export function isFullImageUrl(v: string | null | undefined): boolean {
  return typeof v === "string" && /^https?:\/\/[^/\s"'<>]+\//i.test(v.trim())
}

export function withSearchHead(html: string, s: SearchHead | null | undefined): string {
  if (!s) return html
  const end = html.search(/<\/head\s*>/i)
  if (end < 0) return html
  let head = html.slice(0, end)
  let body = html.slice(end)
  const add: string[] = []

  if (s.jsonLd && s.jsonLd.length) {
    const drop = (part: string) =>
      part.replace(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi, (m, inner: string) => (OWN_TYPES.test(inner) ? "" : m))
    head = drop(head)
    body = drop(body)
    for (const ld of s.jsonLd) add.push(`<script type="application/ld+json" data-storelib-seo>${ld}</script>`)
  }

  const description = (s.description ?? "").replace(/\s+/g, " ").trim()
  if (description) {
    const own = metaTags(head, "description")
    if (!own.some((t) => (metaContent(t) ?? "").trim() !== "")) {
      for (const t of own) head = head.replace(t, "")
      add.push(`<meta name="description" content="${attr(description.slice(0, 320))}" data-storelib-seo>`)
    }
  }

  /* A share picture the theme wrote with no host ("https:/_next/image…") is no picture: taken out, so the one below is the only one. */
  for (const key of ["og:image", "og:image:secure_url", "twitter:image"]) {
    for (const t of metaTags(head, key)) if (!isFullImageUrl(metaContent(t))) head = head.replace(t, "")
  }
  if (isFullImageUrl(s.image)) {
    const image = attr(s.image!.trim())
    if (metaTags(head, "og:image").length === 0) add.push(`<meta property="og:image" content="${image}" data-storelib-seo>`)
    if (metaTags(head, "twitter:image").length === 0) add.push(`<meta name="twitter:image" content="${image}" data-storelib-seo>`)
  }

  if (s.ogType && /^[a-z.]+$/.test(s.ogType)) {
    const own = metaTags(head, "og:type")
    if (!own.some((t) => metaContent(t) === s.ogType)) {
      for (const t of own) head = head.replace(t, "")
      add.push(`<meta property="og:type" content="${s.ogType}" data-storelib-seo>`)
    }
  }

  if (s.noindex && !metaTags(head, "robots").some((t) => /noindex/i.test(metaContent(t) ?? ""))) {
    for (const t of metaTags(head, "robots")) head = head.replace(t, "")
    add.push(`<meta name="robots" content="noindex, follow" data-storelib-seo>`)
  }

  return add.length || head.length !== end ? `${head}${add.join("")}${body}` : html
}
