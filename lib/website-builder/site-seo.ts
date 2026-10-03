/**
 * ===========================================================================
 *  A CREATOR'S WEBSITE, AS A SEARCH ENGINE READS IT
 * ===========================================================================
 * Every published website answers for itself at its own address, whether
 * that is `<name>.storelib.com` or a domain the creator connected:
 *
 *   /robots.txt    lets crawlers in and names the sitemap, or, for a site the
 *                  creator has hidden from search, names no sitemap, so each
 *                  page's own `noindex` is what a crawler finds;
 *   /sitemap.xml   every published page and every published product, with
 *                  when it last changed and the pictures on it, so the
 *                  images are found as well as the pages;
 *   each page      a canonical address on the site's own domain, Open Graph
 *                  that names it, and structured data: the website and its
 *                  owner on the home page, the product on a product page.
 *
 * Before this, both files answered with Storelib's own: a creator's site
 * told Google to read storelib.com's sitemap, and nothing listed its pages.
 *
 * Pure. The loader that fills these from the database is ./site-seo-data.ts.
 */
import type { SectionInstance } from "./types"
import { SITE_DISALLOW, xmlEscape } from "@/lib/seo/indexing"
import { sameAsUrls } from "@/lib/seo/structured-data"
import { THEME_SETTINGS_GROUPS } from "./theme-settings-schema"

export interface SitemapImage {
  loc: string
  title?: string
}

export interface SitemapEntry {
  loc: string
  lastmod?: string
  images?: SitemapImage[]
}

/** Google reads at most this many images per page. */
export const MAX_IMAGES_PER_PAGE = 1000
/** And at most this many addresses per sitemap. */
export const MAX_SITEMAP_URLS = 50000

/**
 * Pages that are addresses, but not ones worth a search result. The account,
 * sign in and Wishlist pages are one visitor's, and a creator who arranged
 * them in the builder has them stored like any page, so they are named here.
 */
const UNLISTED_PAGE_KEYS = new Set(["search", "product", "cart", "404", "account", "login", "wishlist", "password"])

/** The address of a page of the site, on the site's own origin. */
export function pageUrl(origin: string, pageKey: string): string {
  return pageKey === "home" ? `${origin}/` : `${origin}/${pageKey}`
}

export function productUrl(origin: string, slug: string): string {
  return `${origin}/products/${encodeURIComponent(slug)}`
}

/** Whether the creator lets search engines list the site: Website Settings › SEO. */
export function siteIsIndexable(settings: Record<string, unknown>): boolean {
  const v = settings.seo_robots
  if (v === false) return false
  if (typeof v === "string" && /noindex/i.test(v)) return false
  return true
}

/** The pages a sitemap lists, in a stable order: home, then the rest by name. */
export function listedPageKeys(pageKeys: string[]): string[] {
  const keys = pageKeys.filter((k) => !UNLISTED_PAGE_KEYS.has(k))
  return [...(keys.includes("home") ? ["home"] : []), ...keys.filter((k) => k !== "home").sort()]
}

const IMAGE_URL = /^https?:\/\/[^\s"'<>]+\.(?:avif|webp|png|jpe?g|gif|svg)(?:\?[^\s"'<>]*)?$/i
const STORAGE_IMAGE = /^https?:\/\/[^\s"'<>]+\/storage\/v1\/object\/public\/[^\s"'<>]+$/i

function isImageUrl(value: string): boolean {
  return IMAGE_URL.test(value) || (STORAGE_IMAGE.test(value) && !/\.(?:mp4|webm|mov|pdf|zip)(?:\?|$)/i.test(value))
}

/**
 * Every picture a page shows: any setting of any section or block whose
 * value is an image address. Settings are the only place a picture on a
 * published page comes from (a section's defaults never carry one), so
 * walking them finds the lot without knowing any section's schema.
 */
export function imagesOnPage(sections: SectionInstance[], limit = MAX_IMAGES_PER_PAGE): SitemapImage[] {
  const seen = new Set<string>()
  const out: SitemapImage[] = []
  const take = (value: unknown, title?: string) => {
    if (out.length >= limit) return
    if (typeof value === "string") {
      const v = value.trim()
      if (isImageUrl(v) && !seen.has(v)) {
        seen.add(v)
        out.push(title ? { loc: v, title } : { loc: v })
      }
      return
    }
    if (Array.isArray(value)) value.forEach((x) => take(x, title))
    else if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach((x) => take(x, title))
  }
  for (const s of sections) {
    if (s.hidden) continue
    const heading = typeof s.settings?.heading === "string" ? s.settings.heading : undefined
    take(s.settings, heading)
    for (const b of s.blocks ?? []) take(b.settings, heading)
  }
  return out
}

/**
 * The first picture of the first hero on a page, or undefined. A share card
 * with no picture of its own takes this: it is what the site opens with.
 * An SVG is passed over, because the networks that draw share cards do not
 * draw one.
 */
export function heroImage(sections: SectionInstance[]): string | undefined {
  const hero = sections.find((s) => !s.hidden && /^(?:hero|video_hero)/.test(s.type))
  if (!hero) return undefined
  return imagesOnPage([hero], 20).find((i) => !/\.svg(?:\?|$)/i.test(i.loc))?.loc
}

/** Every address field in Website Settings › Social links, read from the schema so a new one is not missed. */
const SOCIAL_SETTING_IDS = (THEME_SETTINGS_GROUPS.find((g) => g.id === "social")?.fields ?? [])
  .filter((f) => f.type === "link")
  .map((f) => f.id)

/** A site's profiles elsewhere, for `sameAs`: the social links its creator gave it. */
export function siteSameAs(settings: Record<string, unknown>): string[] {
  return sameAsUrls(SOCIAL_SETTING_IDS.map((id) => settings[id]))
}

export function sitemapXml(entries: SitemapEntry[]): string {
  const rows = entries.slice(0, MAX_SITEMAP_URLS).map((e) => {
    const images = (e.images ?? []).slice(0, MAX_IMAGES_PER_PAGE).map(
      (i) => `    <image:image><image:loc>${xmlEscape(i.loc)}</image:loc>${i.title ? `<image:title>${xmlEscape(i.title)}</image:title>` : ""}</image:image>`,
    )
    return [
      "  <url>",
      `    <loc>${xmlEscape(e.loc)}</loc>`,
      ...(e.lastmod ? [`    <lastmod>${xmlEscape(e.lastmod)}</lastmod>`] : []),
      ...images,
      "  </url>",
    ].join("\n")
  })
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...rows,
    "</urlset>",
    "",
  ].join("\n")
}

/**
 * A site hidden from search still lets crawlers IN. Shutting them out with
 * `Disallow: /` would stop them reading each page's `noindex`, and a page
 * Google cannot read it keeps listing on what it last knew. It just names
 * no sitemap.
 */
export function robotsTxt(origin: string, indexable: boolean): string {
  /*
    A draft shared by link, the basket and search results are never results.
    ANCHORED, because a robots rule is a prefix: `Disallow: /cart` also hid a
    creator's own page at /cartoons, and `/search` hid /search-tips. Only the
    keys `cart` and `search` are reserved (./site-pages.ts), so the rules name
    those addresses exactly: SITE_DISALLOW in lib/seo/indexing.ts.
  */
  const lines = ["User-agent: *", "Allow: /", ...SITE_DISALLOW.map((rule) => `Disallow: ${rule}`)]
  if (indexable) lines.push("", `Sitemap: ${origin}/sitemap.xml`)
  return `${lines.join("\n")}\n`
}

/** Plain text, one line, for a description or a name in structured data. */
function plain(value: unknown, max = 500): string | undefined {
  if (typeof value !== "string") return undefined
  const t = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
  return t ? t.slice(0, max) : undefined
}

/** The home page's structured data: the website, and who it belongs to. */
export function websiteJsonLd(site: { origin: string; name: string; description?: string; logo?: string; sameAs?: string[] }) {
  const owner = {
    "@type": "Organization",
    "@id": `${site.origin}/#owner`,
    name: site.name,
    url: `${site.origin}/`,
    ...(site.logo ? { logo: site.logo } : {}),
    ...(site.sameAs && site.sameAs.length ? { sameAs: site.sameAs } : {}),
  }
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${site.origin}/#website`,
        url: `${site.origin}/`,
        name: site.name,
        ...(plain(site.description) ? { description: plain(site.description) } : {}),
        publisher: { "@id": `${site.origin}/#owner` },
      },
      owner,
    ],
  }
}

/** A product page's structured data, which is what puts a price in a search result. */
export function productJsonLd(p: {
  url: string
  name: string
  description?: string | null
  images: string[]
  priceCents: number | null
  inStock: boolean
  seller: string
}) {
  const price = typeof p.priceCents === "number" && p.priceCents >= 0 ? (p.priceCents / 100).toFixed(2) : null
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    url: p.url,
    ...(plain(p.description) ? { description: plain(p.description, 5000) } : {}),
    ...(p.images.length ? { image: p.images.slice(0, 10) } : {}),
    brand: { "@type": "Brand", name: p.seller },
    ...(price !== null
      ? {
          offers: {
            "@type": "Offer",
            url: p.url,
            price,
            priceCurrency: "USD",
            availability: p.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            seller: { "@type": "Organization", name: p.seller },
          },
        }
      : {}),
  }
}

/**
 * Structured data as a script body. `<` is escaped so a product description
 * that says `</script>` cannot end the element it sits in. One function for
 * every page that prints JSON-LD, the website's and the platform's alike.
 */
export { jsonLdScript } from "@/lib/seo/json-ld"
