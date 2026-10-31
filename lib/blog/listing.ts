/**
 * ===========================================================================
 *  THE BLOG'S LIST OF POSTS, ONE COPY
 * ===========================================================================
 * The blog is the posts written in /admin/blog (the `blog_posts` table) and
 * four posts written into the code before that existed. The four were listed
 * three times over (the index, the category pages, the sitemap), each copy
 * with its own excerpts and the sitemap with one date for all four. They are
 * here once, with the rules every list of posts follows:
 *
 *   ORDER     newest first, by published_at.
 *   A DB ROW  with the same slug as one of the four wins: it is the edited copy.
 *   PAGES     BLOG_PAGE_SIZE posts to a page. /blog is page 1, /blog/page/2
 *             the next, each linked with a real <a href> so a crawler that
 *             runs no script reaches every post (components: ../../app/
 *             (marketing)/blog/_blog-listing.tsx).
 *   THE FEED  /blog/rss.xml, RSS 2.0, the newest BLOG_FEED_SIZE posts.
 *
 * Pure, so tests/seo-marketing-r44.test.ts runs it without a database.
 */
const XML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }
/* The sitemap's escaping (lib/seo/indexing xmlEscape), written out so the blog pages do not load the indexing rules. */
const xmlEscape = (s: string) => s.replace(/[&<>"']/g, (c) => XML_ESCAPES[c])

export const BLOG_ORIGIN = "https://storelib.com"
export const BLOG_URL = `${BLOG_ORIGIN}/blog`
export const BLOG_FEED_PATH = "/blog/rss.xml"
export const BLOG_FEED_URL = `${BLOG_ORIGIN}${BLOG_FEED_PATH}`
/** Two columns, so an even number; the index showed fifty before it had pages. */
export const BLOG_PAGE_SIZE = 50
export const BLOG_FEED_SIZE = 30
/** The columns a list of posts reads. */
export const BLOG_LIST_COLUMNS = "id, slug, title, excerpt, category, published_at, updated_at, read_time, cover_image_url"

export interface BlogPost {
  id: string
  slug: string
  title: string
  excerpt: string
  category: string
  published_at: string | null
  updated_at?: string | null
  read_time: string
  cover_image_url: string | null
  gradient?: string
}

/** The four posts written in code. Their date is the day each was written; nothing records an edit since. */
export const STATIC_BLOG_POSTS: BlogPost[] = [
  { id: "s1", slug: "how-to-start-selling-digital-products-2026", title: "How to Start Selling Digital Products in 2026", excerpt: "Turn your skills into income. A no-fluff guide to launching your first digital product store, from choosing what to sell to getting your first sale.", category: "Getting Started", published_at: "2026-01-15T00:00:00Z", read_time: "5 min read", cover_image_url: "/images/blog/digital-products-2026.svg", gradient: "from-neutral-800 to-neutral-900" },
  { id: "s2", slug: "why-low-transaction-fees-matter", title: "Why Low Transaction Fees Matter for Digital Creators", excerpt: "The difference between 3% and 15% fees adds up fast. We break down the real numbers and show how much more you keep with lower fees.", category: "Creator Tips", published_at: "2026-02-03T00:00:00Z", read_time: "4 min read", cover_image_url: "/images/blog/transaction-fees.svg", gradient: "from-neutral-700 to-neutral-800" },
  { id: "s3", slug: "building-an-audience-before-you-launch", title: "Building an Audience Before You Launch", excerpt: "The creators who sell the most don't start marketing on launch day. Here's how to build anticipation and a waiting list before your product is even ready.", category: "Growth", published_at: "2026-02-10T00:00:00Z", read_time: "6 min read", cover_image_url: "/images/blog/digital-products-2026.svg", gradient: "from-neutral-800 to-neutral-700" },
  { id: "s4", slug: "pricing-strategies-for-digital-products", title: "Pricing Strategies That Actually Work for Digital Products", excerpt: "Most creators underprice their work. Learn proven pricing frameworks, when to offer discounts, and how to position premium products that sell.", category: "Strategy", published_at: "2026-02-14T00:00:00Z", read_time: "7 min read", cover_image_url: "/images/blog/transaction-fees.svg", gradient: "from-neutral-700 to-neutral-900" },
]

export const STATIC_BLOG_SLUGS = STATIC_BLOG_POSTS.map((p) => p.slug)

const time = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? t : 0
}

/** The published rows and the four, one per slug, newest first. `category` keeps one category's. */
export function mergeBlogPosts(rows: BlogPost[], category?: string | null): BlogPost[] {
  const slugs = new Set(rows.map((p) => p.slug))
  const all = [...rows, ...STATIC_BLOG_POSTS.filter((p) => !slugs.has(p.slug))]
  return all.filter((p) => !category || p.category === category).sort((a, b) => time(b.published_at) - time(a.published_at))
}

export function blogPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / BLOG_PAGE_SIZE))
}

/** `/blog` for page 1, `/blog/page/N` after it. */
export function blogPagePath(page: number): string {
  return page <= 1 ? "/blog" : `/blog/page/${page}`
}

/**
 * Page `page` of the posts, or null when there is no such page (a 404, so a
 * page that ran out is not a 200 with nothing on it).
 */
export function blogPage(posts: BlogPost[], page: number): { posts: BlogPost[]; page: number; pages: number } | null {
  const pages = blogPageCount(posts.length)
  if (!Number.isInteger(page) || page < 1 || page > pages) return null
  return { posts: posts.slice((page - 1) * BLOG_PAGE_SIZE, page * BLOG_PAGE_SIZE), page, pages }
}

/** The page number in /blog/page/<n>: digits only, no leading zero; anything else is null. */
export function blogPageParam(raw: string): number | null {
  return /^[1-9]\d{0,5}$/.test(raw) ? Number(raw) : null
}

/** A post's picture as a full address, or null. */
export function absoluteBlogImage(url: string | null | undefined): string | null {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  return url.startsWith("/") ? `${BLOG_ORIGIN}${url}` : null
}

/** The newest change among the posts: what the feed and the sitemap say about /blog. */
export function newestBlogChange(posts: BlogPost[]): string | null {
  let best = 0
  for (const p of posts) best = Math.max(best, time(p.updated_at), time(p.published_at))
  return best ? new Date(best).toISOString() : null
}

/** RSS 2.0 for the newest posts, with each post's address as its guid. */
export function blogRssXml(posts: BlogPost[]): string {
  const items = posts.slice(0, BLOG_FEED_SIZE).map((p) => {
    const url = `${BLOG_URL}/${p.slug}`
    const date = time(p.published_at)
    return [
      "<item>",
      `<title>${xmlEscape(p.title)}</title>`,
      `<link>${xmlEscape(url)}</link>`,
      `<guid isPermaLink="true">${xmlEscape(url)}</guid>`,
      date ? `<pubDate>${new Date(date).toUTCString()}</pubDate>` : "",
      p.category ? `<category>${xmlEscape(p.category)}</category>` : "",
      `<description>${xmlEscape(p.excerpt || "")}</description>`,
      "</item>",
    ].filter(Boolean).join("")
  })
  const newest = newestBlogChange(posts)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    "<title>Storelib Blog</title>",
    `<link>${BLOG_URL}</link>`,
    "<description>Guides for creators who sell digital products: getting started, pricing, growth and Storelib news.</description>",
    "<language>en</language>",
    newest ? `<lastBuildDate>${new Date(newest).toUTCString()}</lastBuildDate>` : "",
    `<atom:link href="${BLOG_FEED_URL}" rel="self" type="application/rss+xml"/>`,
    ...items,
    "</channel>",
    "</rss>",
    "",
  ].filter((line, i, all) => line !== "" || i === all.length - 1).join("\n")
}

/**
 * THE BLOG'S ROWS IN storelib.com/sitemap/pages.xml, from the published rows
 * (lib/seo/sitemaps.ts pagesSitemap reads them): /blog and each of its pages,
 * each category that has a post (an empty one is noindex), and each post,
 * every one with the newest real date it has. A DB row with one of the four
 * code-written slugs is that post's edited copy and its date wins. An
 * unpublished or deleted post is not in `rows`, so it is not here.
 */
export function blogSitemapEntries(
  rows: Array<Pick<BlogPost, "slug" | "published_at" | "updated_at"> & { category?: string | null }>,
  categories: readonly string[],
  categorySlug: (c: string) => string,
  /** The authors and their live posts (lib/blog/post readBlogAuthorsForSitemap); an author with none is noindex and left out. */
  authors: readonly BlogAuthorWithPosts[] = [],
): Array<{ url: string; lastModified: string | null }> {
  const posts = mergeBlogPosts(rows.map((r) => ({ id: r.slug, title: "", excerpt: "", read_time: "", cover_image_url: null, ...r, category: r.category ?? "" })))
  const out: Array<{ url: string; lastModified: string | null }> = []
  const newest = newestBlogChange(posts)
  for (let page = 1; page <= blogPageCount(posts.length); page++) {
    out.push({ url: `${BLOG_ORIGIN}${blogPagePath(page)}`, lastModified: page === 1 ? newest : newestBlogChange(posts.slice((page - 1) * BLOG_PAGE_SIZE, page * BLOG_PAGE_SIZE)) })
  }
  for (const category of categories) {
    const inIt = posts.filter((p) => p.category === category)
    if (inIt.length) out.push({ url: `${BLOG_URL}/category/${categorySlug(category)}`, lastModified: newestBlogChange(inIt) })
  }
  for (const p of posts) out.push({ url: `${BLOG_URL}/${p.slug}`, lastModified: newestBlogChange([p]) })
  out.push(...blogAuthorSitemapEntries(authors))
  return out
}

/* ── Author pages: /blog/author/<slug> ─────────────────────────────────── */

/** An author (blog_authors, SQL part 345) and the dates of their live posts. */
export interface BlogAuthorWithPosts {
  slug: string
  posts: Array<Pick<BlogPost, "published_at"> & { updated_at?: string | null }>
}

export const BLOG_AUTHOR_BASE = "/blog/author"

/** `/blog/author/<slug>` for page 1, `/blog/author/<slug>/page/N` after it. */
export function blogAuthorPath(slug: string, page = 1): string {
  return page <= 1 ? `${BLOG_AUTHOR_BASE}/${slug}` : `${BLOG_AUTHOR_BASE}/${slug}/page/${page}`
}

/**
 * The author pages in the sitemap: the authors index once one author has a
 * live post, and each such author's pages, dated by their newest post. An
 * author with no live post has a noindex page, so it is not listed.
 */
export function blogAuthorSitemapEntries(authors: readonly BlogAuthorWithPosts[]): Array<{ url: string; lastModified: string | null }> {
  const withPosts = authors.filter((a) => a.slug && a.posts.length > 0)
  if (!withPosts.length) return []
  const all = withPosts.flatMap((a) => a.posts)
  const out: Array<{ url: string; lastModified: string | null }> = [{ url: `${BLOG_ORIGIN}${BLOG_AUTHOR_BASE}`, lastModified: newestBlogChange(all as BlogPost[]) }]
  for (const a of withPosts) {
    const sorted = [...a.posts].sort((x, y) => time(y.published_at) - time(x.published_at)) as BlogPost[]
    for (let page = 1; page <= blogPageCount(sorted.length); page++) {
      out.push({ url: `${BLOG_ORIGIN}${blogAuthorPath(a.slug, page)}`, lastModified: newestBlogChange(sorted.slice((page - 1) * BLOG_PAGE_SIZE, page * BLOG_PAGE_SIZE)) })
    }
  }
  return out
}

/** The <link rel="alternate"> every blog page carries, so a reader finds the feed. */
export const BLOG_FEED_ALTERNATE = { "application/rss+xml": [{ url: BLOG_FEED_URL, title: "Storelib Blog" }] }
