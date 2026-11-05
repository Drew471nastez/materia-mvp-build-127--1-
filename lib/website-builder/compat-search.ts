/**
 * ===========================================================================
 *  AN IMPORTED THEME'S PAGE, AS A SEARCH ENGINE AND A SHARE CARD READ IT
 * ===========================================================================
 * The facts lib/storelib-theme/compat/search-head.ts puts into a live page
 * of an imported theme, by the same rules a Storelib theme's page follows
 * (app/(site)/w/[username]/render-site.tsx and products/[slug]/page.tsx):
 *
 *   description   the page's own (Website settings), else the site's, else
 *                 "Visit <store>'s website." (tab-title.ts siteFallbackDescription), as a Storelib
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
 *                 /blog with no posts), and a post its writer kept out of
 *                 search;
 *   the blog      a post is a BlogPosting published by the store, with its
 *                 picture, og:type article and Home › Blog › Post; the blog
 *                 is a Blog listing its posts (lib/site-blog/seo.ts).
 *
 * Pure, so it is tested without a database. Every address is on the
 * website's own origin (its connected domain when it has one).
 */
import type { CompatPage } from "@/lib/storelib-theme/compat/theme"
import type { SearchHead } from "@/lib/storelib-theme/compat/search-head"
import { productObject } from "@/lib/storelib-theme/compat/objects"
import { jsonLdScript, productJsonLd, websiteJsonLd } from "./site-seo"
import { breadcrumbJsonLd } from "./breadcrumbs"
import { articleJsonLd, blogJsonLd } from "@/lib/site-blog/seo"
import { blogPath } from "@/lib/site-blog/urls"
import { siteFallbackDescription } from "./tab-title"

export interface CompatSearchSite {
  /** https://<the website's own host>. */
  origin: string
  storeName: string
  /** The store's other names (Store details', the person's), for the WebSite's alternateName (site-seo.ts siteAlternateName). */
  alternateNames?: unknown[]
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

/** Template pages with nothing of their own to show: drawn, never a search result. A blog with posts, and a post, are (lib/site-blog). */
const EMPTY_TEMPLATES = new Set(["article", "blog"])
const emptyTemplate = (page: CompatPage): boolean =>
  page.template === "article" ? !page.blogData?.post : page.template === "blog" ? !page.blogData?.cards?.length : EMPTY_TEMPLATES.has(page.template)

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

  if (t === "password") return { noindex: true, description: site.siteDescription || siteFallbackDescription(site.storeName) }

  const noindex =
    emptyTemplate(page) ||
    /* A post its writer kept out of search (its SEO). */
    page.blogData?.post?.seo.noindex === true ||
    (t === "collection" && !page.collection) ||
    (t === "product" && !page.product) ||
    /* The bare page template, reached at /page: a page with no page in it. */
    (t === "page" && !page.suffix && path === "/page")

  const jsonLd: string[] = []
  let image: string | undefined
  let description: string | undefined = own?.description || site.siteDescription
  const home = { name: site.storeName, url: `${site.origin}/` }

  if (t === "index") {
    jsonLd.push(jsonLdScript(websiteJsonLd({ origin: site.origin, name: site.storeName, alternateNames: site.alternateNames, description: site.siteDescription, logo: site.logo, sameAs: site.sameAs })))
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
  } else if (t === "article" && page.blogData?.post && page.blogData.settings) {
    const post = page.blogData.post
    const blog = page.blogData.settings
    const postUrl = `${site.origin}${post.path}`
    const blogUrl = `${site.origin}${blogPath(blog.handle)}`
    const pictures = [post.seo.ogImageUrl, post.coverImageUrl].map((u) => fullImageUrl(u, site.origin)).filter((u): u is string => !!u)
    image = pictures[0]
    description = (post.seo.description || post.excerpt || "").trim().slice(0, 320) || description
    jsonLd.push(
      jsonLdScript(
        articleJsonLd({
          /* Its own canonical, when its writer set one: what the page names as itself. */
          url: post.seo.canonicalUrl || postUrl,
          title: post.seo.title || post.title,
          description: description ?? "",
          images: pictures,
          published: post.publishedAt,
          modified: post.updatedAt,
          author: post.author ? { name: post.author.name, role: post.author.role || null, links: post.author.links } : null,
          publisher: { name: site.storeName, logo: site.logo ?? null, url: `${site.origin}/` },
          category: post.category?.name ?? null,
          tags: post.tags,
          wordCount: post.wordCount,
        }),
      ),
    )
    jsonLd.push(jsonLdScript(breadcrumbJsonLd([home, { name: blog.title, url: blogUrl }, { name: post.title, url: postUrl }])))
    return { description: description || siteFallbackDescription(site.storeName), image: image || fullImageUrl(blog.ogImageUrl, site.origin) || site.shareImage, noindex, jsonLd, ogType: "article" }
  } else if (t === "blog" && page.blogData?.cards?.length && page.blogData.settings) {
    const blog = page.blogData.settings
    const blogUrl = `${site.origin}${blogPath(blog.handle)}`
    const listed = path === blogPath(blog.handle)
    description = (listed ? blog.seoDescription || blog.description : "").trim().slice(0, 320) || description
    /* The posts this page shows (the theme cuts the list into pages; the first page's when it says nothing). */
    const per = Math.max(1, blog.postsPerPage || 12)
    const n = Math.max(1, Math.floor(Number(page.query?.page ?? 1)) || 1)
    const shown = page.blogData.cards.slice((n - 1) * per, n * per)
    jsonLd.push(jsonLdScript(blogJsonLd({ url: `${site.origin}${path}`, name: blog.title, description: listed ? blog.seoDescription || blog.description : "", posts: shown.map((c) => ({ url: `${site.origin}${c.path}`, title: c.title, publishedAt: c.publishedAt, updatedAt: c.updatedAt, image: fullImageUrl(c.coverImageUrl, site.origin) ?? null })) })))
    jsonLd.push(jsonLdScript(breadcrumbJsonLd(listed ? [home, { name: blog.title, url: blogUrl }] : [home, { name: blog.title, url: blogUrl }, { name: page.title || blog.title, url }])))
    image = fullImageUrl(blog.ogImageUrl, site.origin)
  } else if (path !== "/" && !noindex) {
    const name = page.pageObject?.title || page.title || ""
    if (name) jsonLd.push(jsonLdScript(breadcrumbJsonLd([home, { name, url }])))
  }

  return {
    description: description || siteFallbackDescription(site.storeName),
    image: image || fullImageUrl(own?.image, site.origin) || site.shareImage,
    noindex,
    jsonLd,
  }
}
