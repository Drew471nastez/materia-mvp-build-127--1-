/**
 * ===========================================================================
 *  AN IMPORTED THEME'S PAGE, AS A SEARCH ENGINE AND A SHARE CARD READ IT
 * ===========================================================================
 * The facts lib/storelib-theme/compat/search-head.ts puts into a live page
 * of an imported theme, by the same rules a Storelib theme's page follows
 * (app/(site)/w/[username]/render-site.tsx and products/[slug]/page.tsx):
 *
 *   description   the page's own (Website settings), else the site's, else
 *                 "Visit <store>'s website on Storelib", as a Storelib
 *                 theme's page says it;
 *   share picture a product's first photo on its page, a collection's
 *                 picture on its page, else the page's or the site's share
 *                 picture (SEO & Social), else the site's (its logo, the
 *                 front page's first picture, the creator's photo:
 *                 compat-site.ts);
 *   structured    the website and who owns it on the front page; the
 *                 product with its price, currency, stock and Storelib
 *                 Reviews rating on a product page; where the page sits
 *                 (BreadcrumbList) on every page under the front one;
 *   noindex       the password page, and the addresses that are only a
 *                 template with nothing in it (/collection, /page, /article,
 *                 /blog with no posts: Storelib keeps none).
 *
 * Pure, so it is tested without a database. Every address is on the
 * website's own origin (its connected domain when it has one).
 */
import type { CompatPage } from "@/lib/storelib-theme/compat/theme"
import type { SearchHead } from "@/lib/storelib-theme/compat/search-head"
import { productObject } from "@/lib/storelib-theme/compat/objects"
import { jsonLdScript, productJsonLd, websiteJsonLd } from "./site-seo"
import { breadcrumbJsonLd } from "./breadcrumbs"

export interface CompatSearchSite {
  /** https://<the website's own host>. */
  origin: string
  storeName: string
  /** The site's description (SEO & Social), when it has one. */
  siteDescription?: string
  /** The share picture for a page with none of its own: the site's (compat-site.ts). */
  shareImage?: string
  logo?: string
  sameAs?: string[]
  currency?: string
  /** The page's own SEO (Website settings), by page key. */
  pageSeo?: (key: string) => { description?: string; image?: string } | null
  /** The page key a path is drawn from, for its own SEO. */
  keyOf?: (path: string) => string | null
}

/** Template pages with nothing of their own to show: drawn, never a search result. */
const EMPTY_TEMPLATES = new Set(["article", "blog"])

/**
 * A picture's address as a share card and a search engine can fetch it: an
 * image the site serves through `/_next/image?url=…` is the picture itself,
 * a `//host/…` address takes https, and a path takes the site's origin.
 */
export function fullImageUrl(src: unknown, origin: string): string | undefined {
  if (typeof src !== "string") return undefined
  let v = src.trim()
  if (!v) return undefined
  const wrapped = v.match(/^(?:https?:\/\/[^/]+)?\/_next\/image\?(.*)$/i)
  if (wrapped) {
    const inner = new URLSearchParams(wrapped[1]).get("url")
    if (!inner) return undefined
    v = inner
  }
  if (v.startsWith("//")) v = `https:${v}`
  else if (v.startsWith("/")) v = `${origin}${v}`
  return /^https?:\/\/[^/\s]+\//i.test(v) ? v : undefined
}

const plain = (v: unknown): string =>
  String(v ?? "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    /* A block ends a sentence's run; an inline tag (a bold word) is part of it: "a <b>tee</b>." is "a tee.". */
    .replace(/<\/?(p|div|br|li|ul|ol|h[1-6]|tr|td|th|table|section|blockquote)\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()

export function compatSearchHead(site: CompatSearchSite, page: CompatPage, path: string): SearchHead | null {
  const t = page.template
  /* A visitor's own pages and the cart are not results; robots.txt already keeps crawlers out of them. */
  if (t === "cart" || t === "search" || t === "404" || t.startsWith("customers/")) return null
  const key = site.keyOf?.(path) ?? null
  const own = key ? site.pageSeo?.(key) ?? null : null
  const url = `${site.origin}${path === "/" ? "/" : path}`

  if (t === "password") return { noindex: true, description: site.siteDescription || `Visit ${site.storeName}'s website on Storelib` }

  const noindex =
    EMPTY_TEMPLATES.has(t) ||
    (t === "collection" && !page.collection) ||
    (t === "product" && !page.product) ||
    /* The bare page template, reached at /page: a page with no page in it. */
    (t === "page" && !page.suffix && path === "/page")

  const jsonLd: string[] = []
  let image: string | undefined
  let description: string | undefined = own?.description || site.siteDescription
  const home = { name: site.storeName, url: `${site.origin}/` }

  if (t === "index") {
    jsonLd.push(jsonLdScript(websiteJsonLd({ origin: site.origin, name: site.storeName, description: site.siteDescription, logo: site.logo, sameAs: site.sameAs })))
  } else if (t === "product" && page.product) {
    const p = productObject(page.product, { descriptionHtml: page.product.descriptionHtml })
    const pictures = ((p.images as { src?: unknown }[] | undefined) ?? []).map((i) => fullImageUrl(i?.src, site.origin)).filter((u): u is string => !!u)
    image = pictures[0]
    const name = String(p.title ?? "")
    const text = plain(p.description)
    description = text ? text.slice(0, 320) : description
    /* Storelib Reviews, only while the app is on for this website and only real reviews (never the builder's samples). */
    const reviews = page.reviews as { enabled?: boolean; sample?: boolean; product?: { summary?: { count?: number; average?: number }; items?: { author: string; rating: number; body: string; title?: string; iso?: string }[] } | null } | null | undefined
    const summary = reviews?.enabled === true && reviews.sample !== true ? reviews.product?.summary : null
    const rating =
      summary && Number(summary.count) > 0 && Number(summary.average) > 0
        ? { average: Number(summary.average), count: Number(summary.count), reviews: (reviews?.product?.items ?? []).map((r) => ({ author: r.author, rating: r.rating, body: r.body, title: r.title, date: r.iso ?? "" })) }
        : null
    jsonLd.push(
      jsonLdScript(
        productJsonLd({
          url,
          name,
          description: text || null,
          images: pictures,
          /* The price as the page draws it: the variant on show, the first one that sells. */
          priceCents: typeof p.price === "number" ? p.price : null,
          inStock: p.available === true,
          seller: site.storeName,
          rating,
          currency: site.currency,
        }),
      ),
    )
    /* "Products" is the whole shop, which an imported theme shows at /collections/all. */
    jsonLd.push(jsonLdScript(breadcrumbJsonLd([home, { name: "Products", url: `${site.origin}/collections/all` }, { name, url }])))
  } else if (t === "collection" && page.collection) {
    image = fullImageUrl(page.collection.image, site.origin)
    const text = plain(page.collection.description)
    description = text ? text.slice(0, 320) : description
    jsonLd.push(jsonLdScript(breadcrumbJsonLd([home, { name: "Collections", url: `${site.origin}/collections` }, { name: page.collection.title, url }])))
  } else if (path !== "/" && !noindex) {
    const name = page.pageObject?.title || page.title || ""
    if (name) jsonLd.push(jsonLdScript(breadcrumbJsonLd([home, { name, url }])))
  }

  return {
    description: description || `Visit ${site.storeName}'s website on Storelib`,
    image: image || fullImageUrl(own?.image, site.origin) || site.shareImage,
    noindex,
    jsonLd,
  }
}
