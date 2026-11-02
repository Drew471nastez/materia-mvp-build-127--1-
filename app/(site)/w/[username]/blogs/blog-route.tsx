/**
 * ===========================================================================
 *  THE BLOG ON A STORELIB THEME: ITS LISTS, ITS POSTS AND A POST'S PREVIEW
 * ===========================================================================
 * Every address under /blogs on a published Storelib-theme website:
 *
 *   /blogs/<handle>                         the blog          (template "blogs")
 *   /blogs/<handle>/page/<n>                page n of it
 *   /blogs/<handle>/tagged/<tag>[/page/n]   one tag's posts
 *   /blogs/<handle>/category/<c>[/page/n]   one category's posts
 *   /blogs/<handle>/<slug>                  one post          (template "article")
 *   /blogs/<handle>/~preview/<token>        a post's draft, by a signed link
 *
 * Drawn the way a collection page is (../collections/[handle]/
 * collection-page.tsx): the creator's chrome around the template they
 * arranged in the builder, or the generated one (lib/website-builder/
 * blog-page.ts), dressed with the blog's live posts and drawn on the server.
 *
 * A site with no blog, before SQL part 353 or with no live post, answers
 * 404 at every one of these, exactly as it did before there were blogs.
 * An old handle or an old slug answers 308 to the current one. The lists
 * and posts are held a minute like every published page (revalidate = 60);
 * a publish expires the blog's tag and the site's pages (lib/site-blog/
 * cache.ts). A preview is drawn per request, sent no-store and noindex.
 */
import type { Metadata } from "next"
import { notFound, permanentRedirect, redirect } from "next/navigation"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
import { TrackView } from "@/components/analytics/track-view"
import { StoreTracking } from "@/components/website-builder/store-tracking"
import { SiteVitals } from "@/components/website-builder/site-vitals"
import { cachedStoreCurrency } from "@/lib/store/selling-currency-server"
import { splitSiteName } from "@/lib/markets/site-name"
import { languageChoice, siteLanguages, siteLocalizer } from "@/lib/markets/live"
import { localizedPath } from "@/lib/markets/locales"
import { renderWithSources } from "@/lib/website-builder/storefront-render"
import { dressPage, publishedShopByName } from "@/lib/website-builder/published-site"
import { blogArticleSections, blogListingSections } from "@/lib/website-builder/blog-page"
import { breadcrumbJsonLd } from "@/lib/website-builder/breadcrumbs"
import { jsonLdScript } from "@/lib/website-builder/site-seo"
import { siteOrigin } from "@/lib/website-builder/site-seo-data"
import { siteStoreName } from "@/lib/website-builder/tab-title"
import { getMainDomain } from "@/lib/url-helpers"
import { blogFor, readBlogListing, readLivePost, readPreviewPost, relatedPosts, siteBlogRedirect } from "@/lib/site-blog/public-read"
import { articleJsonLd, blogJsonLd, postSeoDescription, postShareImage } from "@/lib/site-blog/seo"
import { RESERVED_POST_SLUGS, isBlogHandle, isPostSlug } from "@/lib/site-blog/slug"
import { blogPath, categoryPath, pagedPath, postPath, tagPath } from "@/lib/site-blog/urls"
import type { BlogListing, PublicPost, PublicPostCard, SiteBlogSettings } from "@/lib/site-blog/types"
import { siteMetadata } from "../render-site"

/* ── What the address asks for ────────────────────────────────────────── */

/** One list of the blog: which page, and of which tag or category. */
export interface BlogListAsk {
  handle: string
  /** The page segment as typed, /page/<n>; absent on page 1. */
  page?: string
  tag?: string
  category?: string
}

const CATEGORY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function decode(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return ""
  }
}

/** A tag as the blog stores it (lib/site-blog/sanitize.ts cleanTag lower-cases and trims). Null for one no post could have. */
export function tagFromSegment(raw: string): string | null {
  const t = decode(raw).trim().toLowerCase()
  return t && t.length <= 60 && !/[/\\<>"]/.test(t) ? t : null
}

/**
 * The page number a /page/<n> segment names: 2 and on. "1" is the list
 * itself, under another address (the caller answers 308 to it); anything
 * that is not a plain number is no page at all.
 */
export function pageFromSegment(raw: string | undefined): { kind: "first" } | { kind: "page"; n: number } | { kind: "bad" } {
  if (raw === undefined) return { kind: "first" }
  if (!/^\d{1,5}$/.test(raw)) return { kind: "bad" }
  const n = Number(raw)
  if (n === 1) return { kind: "first" }
  return n >= 2 ? { kind: "page", n } : { kind: "bad" }
}

/** Where a list of the blog lives: the blog, a tag or a category, page n. */
export function listPath(handle: string, ask: { tag?: string | null; category?: string | null }, page = 1): string {
  const base = ask.category ? categoryPath(handle, ask.category) : ask.tag ? tagPath(handle, ask.tag) : blogPath(handle)
  return pagedPath(base, page, false)
}

/**
 * The blog this address names, or where to send it. An old handle (Blog
 * settings keep every one it had) answers 308 to the same address under
 * the current one; one it never had is a 404.
 */
export function handleDecision(settings: SiteBlogSettings, asked: string): { kind: "current" } | { kind: "moved" } | { kind: "missing" } {
  const handle = decode(asked).toLowerCase()
  if (handle === settings.handle) return { kind: "current" }
  if (isBlogHandle(handle) && settings.previousHandles.includes(handle)) return { kind: "moved" }
  return { kind: "missing" }
}

/* ── The site and the blog ────────────────────────────────────────────── */

/** The published site behind the name, or the answer for a name that has none. Throws Next's redirect or 404. */
async function siteAt(segment: string, path: string) {
  const { name: username, locale, market } = splitSiteName(segment)
  const found = await publishedShopByName(username)
  if (found.kind === "renamed") permanentRedirect(`https://${found.to}.${getMainDomain()}${path}`)
  if (found.kind === "missing") notFound()
  if (found.kind === "unpublished") redirect(`https://${getMainDomain()}/${username.toLowerCase()}`)
  return { found, username, locale, market }
}

/** The same address in the page's language: /fr/blogs/… for a French page. */
async function inLanguage(creatorId: string, locale: string | null, path: string): Promise<string> {
  if (!locale) return path
  const langs = await siteLanguages(creatorId)
  const code = langs.others.find((l) => l.toLowerCase() === locale)
  return code ? localizedPath(path, code, langs.defaultLanguage) : path
}

/* ── A list ───────────────────────────────────────────────────────────── */

/**
 * What a list draws, or why it does not: the blog, the list, and the
 * address it is canonically at. Shared by the page and its metadata, and
 * held per request by the cached reads beneath it.
 */
async function listFor(creatorId: string, ask: BlogListAsk): Promise<
  | { kind: "ok"; source: { settings: SiteBlogSettings; cards: PublicPostCard[] }; listing: BlogListing; path: string }
  | { kind: "redirect"; to: string }
  | { kind: "missing" }
> {
  const source = await blogFor(creatorId).catch(() => null)
  if (!source || source.cards.length === 0) return { kind: "missing" }
  const handle = handleDecision(source.settings, ask.handle)
  const tag = ask.tag !== undefined ? tagFromSegment(ask.tag) : null
  const category = ask.category !== undefined ? decode(ask.category).toLowerCase() : null
  if ((ask.tag !== undefined && !tag) || (category !== null && !CATEGORY_SLUG.test(category))) return { kind: "missing" }
  const page = pageFromSegment(ask.page)
  if (page.kind === "bad") return { kind: "missing" }
  const n = page.kind === "page" ? page.n : 1
  const here = listPath(source.settings.handle, { tag, category }, n)
  if (handle.kind === "missing") return { kind: "missing" }
  /* An old handle, or /page/1 of a list: the same list at its one address. */
  if (handle.kind === "moved" || (ask.page !== undefined && page.kind === "first")) return { kind: "redirect", to: here }
  const listing = await readBlogListing(creatorId, { page: n, categorySlug: category, tag }).catch(() => null)
  /* An unknown category, a page past the last, or a tag or category with no live post: not a page. */
  if (!listing || listing.posts.length === 0) return { kind: "missing" }
  return { kind: "ok", source, listing, path: here }
}

/** The name a list goes by in a tab and a search result: the category's, the tag's, or the blog's. */
export function listingName(listing: BlogListing): string {
  const blog = listing.blog
  return listing.category ? listing.category.seoTitle || listing.category.name : listing.tag ? `${blog.title}: ${listing.tag}` : blog.seoTitle || blog.title
}

/**
 * A list's metadata over the site's own for the page (siteMetadata: its
 * canonical at the list's path, every language, the store's name, the
 * site's robots): its description, a website share card with the blog's
 * picture, and a tag's list followed but never indexed. Pure.
 */
export function listingMetadata(base: Metadata, listing: BlogListing): Metadata {
  const blog = listing.blog
  const description = (listing.category ? listing.category.seoDescription || listing.category.description : "") || blog.seoDescription || blog.description || (typeof base.description === "string" ? base.description : "")
  const image = blog.ogImageUrl && /^https?:\/\//i.test(blog.ogImageUrl) ? blog.ogImageUrl : null
  return {
    ...base,
    ...(description ? { description } : {}),
    openGraph: {
      ...(base.openGraph ?? {}),
      type: "website",
      ...(description ? { description } : {}),
      ...(image ? { images: [{ url: image }] } : {}),
    },
    ...(image || description ? { twitter: { ...(base.twitter ?? {}), ...(description ? { description } : {}), ...(image ? { images: [image] } : {}) } } : {}),
    /* A tag's list is the blog's posts again, sorted by a word: followed, never a search result of its own. */
    ...(listing.tag ? { robots: { index: false, follow: !isNoFollow(base.robots) } } : {}),
  }
}

export async function blogListMetadata(segment: string, ask: BlogListAsk): Promise<Metadata> {
  const { name: username } = splitSiteName(segment)
  const found = await publishedShopByName(username).catch(() => null)
  if (found?.kind !== "site") return siteMetadata(segment, undefined, "blogs")
  const got = await listFor(found.site.creatorId, ask).catch(() => ({ kind: "missing" as const }))
  if (got.kind !== "ok") return { title: "Not Found", robots: { index: false, follow: false } }
  const base = await siteMetadata(segment, undefined, "blogs", null, { page: { kind: "page", name: listingName(got.listing) }, pageNumber: got.listing.page, path: got.path })
  return listingMetadata(base, got.listing)
}

/** Whether metadata already tells crawlers not to follow the page's links (a site kept out of search). */
function isNoFollow(robots: Metadata["robots"]): boolean {
  return !!robots && typeof robots === "object" && "follow" in robots && robots.follow === false
}

export async function BlogListPage({ segment, ask }: { segment: string; ask: BlogListAsk }) {
  const { found, username, locale, market } = await siteAt(segment, blogPath(ask.handle))
  if (found.kind !== "site") notFound()
  const { site: own, productCount } = found
  const got = await listFor(own.creatorId, ask)
  if (got.kind === "redirect") permanentRedirect(await inLanguage(own.creatorId, locale, got.to))
  if (got.kind !== "ok") notFound()
  const { source, listing, path } = got

  const [localizer, language] = await Promise.all([siteLocalizer(own.creatorId, locale, market), languageChoice(own.creatorId, locale, market)])
  const site = localizer ? { ...own, themeSettings: localizer.theme(own.themeSettings as Record<string, unknown>) as typeof own.themeSettings } : own
  const products = localizer && found.products ? localizer.cards(found.products) : found.products
  const arranged = blogListingSections(site.pages.home ?? site.sections, site.themeSettings, site.pages.blogs)
  const title = listing.category?.name ?? (listing.tag ? `${listing.blog.title}: ${listing.tag}` : listing.blog.title)
  const dressed = await dressPage(site, localizer ? localizer.sections(arranged, site.sources) : arranged, products, productCount, "blog", title, undefined, { cached: true, localizer, blog: { source, listing } })
  const prerendered = renderWithSources(site.sources, dressed.sections, site.themeSettings, "blog", products, { path }, dressed.data)

  /* For search results: the blog and this page's posts, and where the list sits (Home › Blog › Recipes). */
  const origin = await siteOrigin(site.creatorId, username)
  const brand = siteStoreName({ brandName: site.themeSettings.brand_name, storeName: site.profile?.storeName, displayName: site.displayName })
  const data = listingStructuredData({ listing, path, origin, brand })
  const ld = jsonLdScript(data.blog)
  const crumbs = jsonLdScript(data.crumbs)

  return (
    <StorelibSourcesProvider prerendered={prerendered} page={{ template: "blog" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: crumbs }} />
      <ThemePage
        theme={site.themeSettings}
        sections={dressed.sections}
        storefront={{ creatorId: site.creatorId, installId: site.installId, language, words: localizer?.words, display: localizer?.display, currency: await cachedStoreCurrency(site.creatorId) }}
      />
      <TrackView creatorId={site.creatorId} />
      <StoreTracking creatorId={site.creatorId} />
      <SiteVitals installId={site.installId} />
    </StorelibSourcesProvider>
  )
}

/** What a search engine reads about a list: the blog (Blog, with this page's posts) and where it sits (Home › Blog › Recipes). Pure. */
export function listingStructuredData(input: { listing: BlogListing; path: string; origin: string; brand: string }) {
  const { listing, path, origin, brand } = input
  return {
    blog: blogJsonLd({
      url: `${origin}${path}`,
      name: listing.blog.title,
      description: listing.blog.description,
      posts: listing.posts.map((p) => ({ url: `${origin}${p.path}`, title: p.title, publishedAt: p.publishedAt, updatedAt: p.updatedAt, image: p.coverImageUrl })),
    }),
    crumbs: breadcrumbJsonLd([
      { name: brand, url: `${origin}/` },
      { name: listing.blog.title, url: `${origin}${blogPath(listing.blog.handle)}` },
      ...(listing.category ? [{ name: listing.category.name, url: `${origin}${categoryPath(listing.blog.handle, listing.category.slug)}` }] : []),
      ...(listing.tag ? [{ name: listing.tag, url: `${origin}${tagPath(listing.blog.handle, listing.tag)}` }] : []),
    ]),
  }
}

/** What a search engine reads about a post: a BlogPosting the store published, and Home › Blog › Recipes › the post. Pure. */
export function postStructuredData(input: { post: PublicPost; settings: SiteBlogSettings; origin: string; brand: string; logo: string | null }) {
  const { post, settings, origin, brand, logo } = input
  return {
    article: articleJsonLd({
      url: ownCanonical(post) ?? `${origin}${post.path}`,
      title: post.seo.title || post.title,
      description: postSeoDescription(post, settings.description),
      images: [post.seo.ogImageUrl, post.coverImageUrl],
      published: post.publishedAt,
      modified: post.updatedAt,
      author: post.author ? { name: post.author.name, role: post.author.role, links: post.author.links } : null,
      publisher: { name: brand, logo, url: `${origin}/` },
      category: post.category?.name ?? null,
      tags: post.tags,
      wordCount: post.wordCount,
    }),
    crumbs: breadcrumbJsonLd([
      { name: brand, url: `${origin}/` },
      { name: settings.title, url: `${origin}${blogPath(settings.handle)}` },
      ...(post.category ? [{ name: post.category.name, url: `${origin}${post.category.path}` }] : []),
      { name: post.title, url: `${origin}${post.path}` },
    ]),
  }
}

/* ── A post ───────────────────────────────────────────────────────────── */

/** The post this address names, or where it moved to. */
async function postFor(creatorId: string, rawHandle: string, rawSlug: string): Promise<
  | { kind: "ok"; source: { settings: SiteBlogSettings; cards: PublicPostCard[] }; post: PublicPost }
  | { kind: "redirect"; to: string }
  | { kind: "missing" }
> {
  const source = await blogFor(creatorId).catch(() => null)
  if (!source || source.cards.length === 0) return { kind: "missing" }
  const handle = handleDecision(source.settings, rawHandle)
  if (handle.kind === "missing") return { kind: "missing" }
  const slug = decode(rawSlug).toLowerCase()
  if (!slug || slug.length > 200 || RESERVED_POST_SLUGS.includes(slug)) return { kind: "missing" }
  const current = source.settings.handle
  const post = isPostSlug(slug) ? await readLivePost(creatorId, slug).catch(() => null) : null
  if (post) return handle.kind === "moved" ? { kind: "redirect", to: postPath(current, post.slug) } : { kind: "ok", source, post }
  /* A slug the post had before it was renamed: 308 to its address now. */
  const moved = await siteBlogRedirect(creatorId, slug).catch(() => null)
  if (moved && isPostSlug(moved)) return { kind: "redirect", to: postPath(current, moved) }
  return { kind: "missing" }
}

/** A post's own canonical, when its author set one: a full http(s) address, else none. */
function ownCanonical(post: PublicPost): string | null {
  const c = post.seo.canonicalUrl.trim()
  return /^https?:\/\/[^\s]+$/i.test(c) ? c : null
}

/**
 * A post's metadata over the site's own for its page (siteMetadata: the
 * canonical at the post's path, every language, the store's name and the
 * site's robots): its own search title and description, a share card of
 * type article with its picture, dates, author, section and tags, the
 * canonical its author set, and robots that keep a post marked noindex,
 * and every preview, out of search. Pure.
 */
export function articleMetadata(base: Metadata, post: PublicPost, settings: SiteBlogSettings, opts: { preview: boolean }): Metadata {
  const siteDescription = typeof base.description === "string" ? base.description : ""
  const description = postSeoDescription(post, settings.description || siteDescription)
  const baseImages = base.openGraph && "images" in base.openGraph ? base.openGraph.images : undefined
  const fallback = settings.ogImageUrl || (Array.isArray(baseImages) ? String((baseImages[0] as { url?: unknown })?.url ?? baseImages[0] ?? "") : typeof baseImages === "string" ? baseImages : "")
  const image = postShareImage(post, fallback)
  const picture = image && /^https?:\/\//i.test(image) ? image : null
  const shareTitle = post.seo.ogTitle || post.seo.title || post.title
  const shareDescription = post.seo.ogDescription || description
  const canonical = ownCanonical(post)
  const title = post.seo.title.trim() ? { absolute: post.seo.title.trim() } : base.title
  const robots: Metadata["robots"] = opts.preview ? { index: false, follow: false } : post.seo.noindex ? { index: false, follow: !isNoFollow(base.robots) } : base.robots
  return {
    ...base,
    title,
    description,
    ...(canonical && !opts.preview ? { alternates: { ...(base.alternates ?? {}), canonical } } : {}),
    openGraph: {
      ...(base.openGraph ?? {}),
      type: "article",
      title: shareTitle,
      description: shareDescription,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt || post.publishedAt,
      ...(post.author ? { authors: [post.author.name] } : {}),
      ...(post.category ? { section: post.category.name } : {}),
      ...(post.tags.length ? { tags: post.tags } : {}),
      ...(picture ? { images: [{ url: picture, alt: post.coverAlt || post.title }] } : {}),
    },
    twitter: {
      ...(base.twitter ?? {}),
      card: "summary_large_image",
      title: shareTitle,
      description: shareDescription,
      ...(picture ? { images: [picture] } : {}),
    },
    ...(robots ? { robots } : {}),
  }
}

/** The metadata of a post, live or previewed. */
async function postMetadata(segment: string, post: PublicPost, settings: SiteBlogSettings, opts: { preview: boolean }): Promise<Metadata> {
  const base = await siteMetadata(segment, undefined, "article", null, { page: { kind: "page", name: post.title }, path: post.path })
  return articleMetadata(base, post, settings, opts)
}

export async function blogPostMetadata(segment: string, rawHandle: string, rawSlug: string): Promise<Metadata> {
  const { name: username } = splitSiteName(segment)
  const found = await publishedShopByName(username).catch(() => null)
  if (found?.kind !== "site") return siteMetadata(segment, undefined, "article")
  const got = await postFor(found.site.creatorId, rawHandle, rawSlug).catch(() => ({ kind: "missing" as const }))
  if (got.kind !== "ok") return { title: "Not Found", robots: { index: false, follow: false } }
  return postMetadata(segment, got.post, got.source.settings, { preview: false })
}

/** The post's page: the one for visitors, and the preview a signed link opens. */
async function drawPost(args: {
  site: Extract<Awaited<ReturnType<typeof publishedShopByName>>, { kind: "site" }>
  username: string
  locale: string | null
  market: string | null
  source: { settings: SiteBlogSettings; cards: PublicPostCard[] } | null
  settings: SiteBlogSettings
  post: PublicPost
  preview: boolean
}) {
  const { site: found, username, locale, market, post, settings, preview } = args
  const { site: own, productCount } = found
  const [localizer, language] = await Promise.all([siteLocalizer(own.creatorId, locale, market), languageChoice(own.creatorId, locale, market)])
  const site = localizer ? { ...own, themeSettings: localizer.theme(own.themeSettings as Record<string, unknown>) as typeof own.themeSettings } : own
  const products = localizer && found.products ? localizer.cards(found.products) : found.products
  const cards = args.source?.cards ?? []
  const arranged = blogArticleSections(site.pages.home ?? site.sections, site.themeSettings, site.pages.article)
  const dressed = await dressPage(site, localizer ? localizer.sections(arranged, site.sources) : arranged, products, productCount, "article", post.title, undefined, {
    /* A preview is one person's look at a draft: read fresh, never held where anybody else could read it. */
    cached: !preview,
    localizer,
    blog: { source: args.source ?? { settings, cards: [] }, post, related: relatedPosts(cards, post, 6) },
  })
  const prerendered = renderWithSources(site.sources, dressed.sections, site.themeSettings, "article", products, { path: post.path }, dressed.data)

  const origin = await siteOrigin(site.creatorId, username)
  const brand = siteStoreName({ brandName: site.themeSettings.brand_name, storeName: site.profile?.storeName, displayName: site.displayName })
  const logo = typeof site.themeSettings.logo_url === "string" && /^https?:\/\//i.test(site.themeSettings.logo_url) ? site.themeSettings.logo_url : null
  /* What a search engine reads about the post and where it sits. A preview says nothing. */
  const ld = preview ? null : postStructuredData({ post, settings, origin, brand, logo })
  const article = ld ? jsonLdScript(ld.article) : null
  const crumbs = ld ? jsonLdScript(ld.crumbs) : null

  return (
    <StorelibSourcesProvider prerendered={prerendered} page={{ template: "article" }}>
      {article ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: article }} /> : null}
      {crumbs ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: crumbs }} /> : null}
      <ThemePage
        theme={site.themeSettings}
        sections={dressed.sections}
        storefront={{ creatorId: site.creatorId, installId: site.installId, language, words: localizer?.words, display: localizer?.display, currency: await cachedStoreCurrency(site.creatorId) }}
      />
      {preview ? null : <TrackView creatorId={site.creatorId} />}
      <StoreTracking creatorId={site.creatorId} />
      <SiteVitals installId={site.installId} />
    </StorelibSourcesProvider>
  )
}

export async function BlogPostPage({ segment, rawHandle, rawSlug }: { segment: string; rawHandle: string; rawSlug: string }) {
  const { found, username, locale, market } = await siteAt(segment, `${blogPath(decode(rawHandle) || "news")}/${decode(rawSlug)}`)
  if (found.kind !== "site") notFound()
  const got = await postFor(found.site.creatorId, rawHandle, rawSlug)
  if (got.kind === "redirect") permanentRedirect(await inLanguage(found.site.creatorId, locale, got.to))
  if (got.kind !== "ok") notFound()
  return drawPost({ site: found, username, locale, market, source: got.source, settings: got.source.settings, post: got.post, preview: false })
}

/* ── A post's preview ─────────────────────────────────────────────────── */

/** A preview token's shape: lib/site-blog/preview-token.ts signs `<id>.<exp>.<mac>`. Checked again, by its signature, when it is read. */
const TOKEN = /^[0-9a-f-]{36}\.[0-9a-z]{1,12}\.[0-9a-f]{32}$/

async function previewFor(segment: string, rawToken: string) {
  const token = decode(rawToken)
  if (!TOKEN.test(token)) return null
  const { name: username } = splitSiteName(segment)
  const found = await publishedShopByName(username).catch(() => null)
  if (found?.kind !== "site") return null
  const post = await readPreviewPost(found.site.creatorId, token).catch(() => null)
  if (!post) return null
  const source = await blogFor(found.site.creatorId).catch(() => null)
  return { found, post, source }
}

export async function blogPreviewMetadata(segment: string, rawToken: string): Promise<Metadata> {
  const got = await previewFor(segment, rawToken)
  if (!got) return { title: "Preview", robots: { index: false, follow: false } }
  const settings = got.source?.settings ?? previewSettings(got.post)
  return postMetadata(segment, got.post, settings, { preview: true })
}

/** The blog a first post is previewed in, before the blog has a live post: its handle is the post's own address's. */
function previewSettings(post: PublicPost): SiteBlogSettings {
  const handle = decode(/^\/blogs\/([^/]+)\//.exec(post.path)?.[1] ?? "news")
  return { handle, previousHandles: [], title: "Blog", description: "", postsPerPage: 12, seoTitle: "", seoDescription: "", ogImageUrl: "" }
}

export async function BlogPreviewPage({ segment, rawToken }: { segment: string; rawToken: string }) {
  const got = await previewFor(segment, rawToken)
  if (!got) notFound()
  const { name: username, locale, market } = splitSiteName(segment)
  const settings = got.source?.settings ?? previewSettings(got.post)
  return drawPost({ site: got.found, username, locale, market, source: got.source, settings, post: got.post, preview: true })
}

/* ── /blogs ───────────────────────────────────────────────────────────── */

/** /blogs on its own: the blog, when there is one with a live post. */
export async function blogsIndexTarget(segment: string): Promise<string | null> {
  const { name: username, locale } = splitSiteName(segment)
  const found = await publishedShopByName(username).catch(() => null)
  if (found?.kind !== "site") return null
  const source = await blogFor(found.site.creatorId).catch(() => null)
  if (!source || source.cards.length === 0) return null
  return inLanguage(found.site.creatorId, locale, blogPath(source.settings.handle))
}
