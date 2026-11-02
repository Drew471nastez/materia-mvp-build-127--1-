/**
 * ===========================================================================
 *  THE BLOG'S TWO TEMPLATES ON A STORELIB THEME, AND WHAT THEIR SECTIONS READ
 * ===========================================================================
 * A creator's blog (lib/site-blog) is drawn on a Storelib theme by two page
 * templates, edited in the builder like the Collection page:
 *
 *   "blogs"    every /blogs/<handle> list: page N, a tag, a category
 *   "article"  every post, /blogs/<handle>/<slug>
 *
 * Each is the home page's header and footer around one section, main_blog
 * or main_article, until the creator arranges it; from then on what they
 * saved is the layout every list or every post is drawn with. Posts are
 * never typed into sections: the sections read `blog` and `article`, built
 * here from the live posts the route read (lib/site-blog/public-read.ts).
 *
 * Pure, so the shapes are tested by running them (tests/site-blog-native).
 */
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import type { StorefrontArticle, StorefrontArticleFull, StorefrontBlog } from "@/lib/storelib-theme/types"
import type { BlogListing, PublicPost, PublicPostCard, SiteBlogCategory, SiteBlogSettings } from "@/lib/site-blog/types"
import { blogPath, categoryPath, pagedPath, tagPath } from "@/lib/site-blog/urls"
import { chromeOf, withUniversalChrome } from "@/lib/website-builder/universal-chrome"
import { chromeScheme } from "@/lib/website-builder/shop-page"

/** The ids are fixed, not generated: the same page must render the same twice. */
const LISTING_ID = "storelib-blog"
const ARTICLE_ID = "storelib-article"

/** The section types that show posts. A page with one of these reads the blog (published-site.ts dressPage). */
export const BLOG_SECTION_TYPES: readonly string[] = ["main_blog", "main_article", "blog_featured"]

/** Whether a section shows posts: one of the three, or a copy of one saved under its own name (main_blog_2). */
export function isBlogSectionType(type: string): boolean {
  return BLOG_SECTION_TYPES.some((t) => type === t || type.startsWith(`${t}_`) || type.startsWith(`${t}-`))
}

/** Whether a page has a section that shows posts, so the blog is read for it. */
export function pageWantsBlog(sections: readonly { type: string; hidden?: boolean }[]): boolean {
  return sections.some((s) => !s.hidden && isBlogSectionType(s.type))
}

/**
 * The Blog template: the header, the list of posts, the footer. `stored`
 * is the template as the creator arranged it in the builder, page key
 * "blogs"; absent or empty, the generated one.
 */
export function blogListingSections(homeSections: SectionInstance[], _theme: ThemeSettingsValues, stored?: SectionInstance[] | null): SectionInstance[] {
  if (stored && stored.length > 0) return stored
  const main: SectionInstance = {
    id: LISTING_ID,
    type: "main_blog",
    name: "Blog posts",
    settings: { color_scheme: chromeScheme(homeSections) },
    blocks: [],
    hidden: false,
  }
  return withUniversalChrome([main], chromeOf(homeSections))
}

/** The Blog post template: the header, the post, the footer. `stored` as above, page key "article". */
export function blogArticleSections(homeSections: SectionInstance[], _theme: ThemeSettingsValues, stored?: SectionInstance[] | null): SectionInstance[] {
  if (stored && stored.length > 0) return stored
  const main: SectionInstance = {
    id: ARTICLE_ID,
    type: "main_article",
    name: "Blog post",
    settings: { color_scheme: chromeScheme(homeSections) },
    blocks: [],
    hidden: false,
  }
  return withUniversalChrome([main], chromeOf(homeSections))
}

/* ── What a section reads ─────────────────────────────────────────────── */

/** The newest posts every page of the blog hands its sections, for Featured posts and Related posts. */
export const RECENT_POSTS = 24

/** A date as people read it in the page's language: "12 March 2026", "12 mars 2026". Never throws. */
export function postDate(iso: string, locale?: string | null): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ""
  const fmt = (l: string) => new Intl.DateTimeFormat(l, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(t))
  try {
    return fmt(locale && locale.trim() ? locale : "en-GB")
  } catch {
    return fmt("en-GB")
  }
}

/** One post as a section reads it: public facts only. */
export function storefrontArticle(card: PublicPostCard, locale?: string | null): StorefrontArticle {
  return {
    id: card.id,
    handle: card.slug,
    title: card.title,
    url: card.path,
    excerpt: card.excerpt,
    summary_html: card.summaryHtml,
    image: card.coverImageUrl,
    image_alt: card.coverAlt || card.title,
    date: postDate(card.publishedAt, locale),
    published_at: card.publishedAt,
    updated_at: card.updatedAt,
    reading_minutes: Math.max(1, Math.round(card.readingMinutes || 1)),
    featured: card.featured === true,
    category: card.category ? { name: card.category.name, handle: card.category.slug, url: card.category.path } : null,
    tags: card.tags.map((t) => ({ name: t, url: tagPathOf(card.path, t) })),
    author: card.author
      ? { name: card.author.name, role: card.author.role, bio: card.author.bio, avatar: card.author.avatarUrl, links: card.author.links.slice(0, 6) }
      : null,
  }
}

/** /blogs/<handle>/tagged/<tag>, from a post's own address: the handle is the post's. */
function tagPathOf(postUrl: string, tag: string): string {
  const handle = /^\/blogs\/([^/]+)\//.exec(postUrl)?.[1]
  return handle ? tagPath(decodeURIComponent(handle), tag) : `/blogs/tagged/${encodeURIComponent(tag)}`
}

/**
 * The page numbers a list shows: the first, the last, and two either side of
 * the one open, with a gap where pages are skipped. 1 … 4 5 [6] 7 8 … 20.
 */
export function pageParts(page: number, pages: number, urlOf: (n: number) => string): StorefrontBlog["pagination"]["parts"] {
  if (pages <= 1) return []
  const shown = new Set<number>([1, pages])
  for (let n = page - 2; n <= page + 2; n++) if (n >= 1 && n <= pages) shown.add(n)
  const out: StorefrontBlog["pagination"]["parts"] = []
  let last = 0
  for (const n of [...shown].sort((a, b) => a - b)) {
    if (n - last > 1) out.push({ label: "…", url: "", current: false, gap: true })
    out.push({ label: String(n), url: urlOf(n), current: n === page, gap: false })
    last = n
  }
  return out
}

/** How many of its newest posts each category hands a section: the most a Blog posts section shows. */
export const CATEGORY_POSTS = 12

/** The categories the blog shows: each with a live post, in the creator's order, with how many and its newest posts. */
function categoriesOf(listed: SiteBlogCategory[], cards: PublicPostCard[], handle: string, active: string | null, locale?: string | null): StorefrontBlog["categories"] {
  const counts = new Map<string, number>()
  for (const c of cards) if (c.category) counts.set(c.category.slug, (counts.get(c.category.slug) ?? 0) + 1)
  const fromList = listed.length
    ? [...listed].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)).map((c) => ({ name: c.name, handle: c.slug, count: counts.get(c.slug) ?? c.postCount ?? 0 }))
    : /* No list handed (a page with a Featured posts section): the categories the posts are in, as they first appear. */
      [...new Map(cards.filter((c) => c.category).map((c) => [c.category!.slug, { name: c.category!.name, handle: c.category!.slug, count: counts.get(c.category!.slug) ?? 0 }])).values()]
  return fromList
    .filter((c) => c.count > 0)
    .map((c) => ({
      ...c,
      url: categoryPath(handle, c.handle),
      active: c.handle === active,
      posts: cards.filter((p) => p.category?.slug === c.handle).slice(0, CATEGORY_POSTS).map((p) => storefrontArticle(p, locale)),
    }))
}

export interface BlogDataInput {
  settings: SiteBlogSettings
  /** Every live post, newest first (lib/site-blog/public-read.ts liveCards). */
  cards: PublicPostCard[]
  /** The list this page shows, on a /blogs/<handle> page; absent, page 1 of every post. */
  listing?: BlogListing | null
  /** The page's language, for its dates. */
  locale?: string | null
  /** The builder's sample posts: the canvas only, never a live page. */
  sample?: boolean
}

/** The blog as a section reads it: `blog` in a template. */
export function storefrontBlog(input: BlogDataInput): StorefrontBlog {
  const { settings, cards, listing, locale } = input
  const handle = settings.handle
  const per = Math.max(1, Math.min(48, Math.floor(settings.postsPerPage || 12)))
  const posts = listing ? listing.posts : cards.slice(0, per)
  const page = listing ? listing.page : 1
  const total = listing ? listing.total : cards.length
  const pages = listing ? listing.pages : Math.max(1, Math.ceil(cards.length / per))
  const tag = listing?.tag ?? null
  const category = listing?.category ?? null
  /* Where page N of this very list is: the blog, a tag or a category, page 2 on as /page/N (lib/site-blog/urls.ts). */
  const base = category ? categoryPath(handle, category.slug) : tag ? tagPath(handle, tag) : blogPath(handle)
  const urlOf = (n: number) => pagedPath(base, n, false)
  const allTags = listing?.allTags?.length ? listing.allTags : [...new Set(cards.flatMap((c) => c.tags))].sort((a, b) => a.localeCompare(b))
  return {
    title: settings.title,
    handle,
    url: blogPath(handle),
    description: settings.description,
    articles: posts.map((p) => storefrontArticle(p, locale)),
    articles_count: total,
    recent: cards.slice(0, RECENT_POSTS).map((p) => storefrontArticle(p, locale)),
    featured: cards.filter((p) => p.featured).slice(0, CATEGORY_POSTS).map((p) => storefrontArticle(p, locale)),
    all_tags: allTags,
    categories: categoriesOf(listing?.categories ?? [], cards, handle, category?.slug ?? null, locale),
    tags: allTags.slice(0, 40).map((t) => ({ name: t, url: tagPath(handle, t), active: t === tag })),
    current_tag: tag,
    current_category: category ? { name: category.name, handle: category.slug, url: categoryPath(handle, category.slug), description: category.description } : null,
    pagination: {
      page,
      pages,
      total,
      previous_url: page > 1 ? urlOf(page - 1) : "",
      next_url: page < pages ? urlOf(page + 1) : "",
      parts: pageParts(page, pages, urlOf),
    },
    sample: input.sample === true,
  }
}

/** How many related posts a post's page is handed: the most a Blog post section shows. */
export const RELATED_POSTS = 6

/**
 * Posts like this one, from the live ones: its category first, then the most
 * tags in common, then the newest. The same rule as lib/site-blog's
 * relatedPosts, kept here so the canvas and a test draw it without a server.
 */
export function relatedCards(cards: PublicPostCard[], post: Pick<PublicPostCard, "id" | "category" | "tags">, n = RELATED_POSTS): PublicPostCard[] {
  const tags = new Set(post.tags)
  const score = (c: PublicPostCard) => (post.category && c.category?.slug === post.category.slug ? 100 : 0) + c.tags.filter((t) => tags.has(t)).length
  return cards
    .filter((c) => c.id !== post.id)
    .map((c, i) => ({ c, i, s: score(c) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, Math.max(0, n))
    .map((x) => x.c)
}

/** The post as a section reads it: `article` in a template, with its neighbours, related posts and share links. */
export function storefrontArticleFull(input: {
  post: PublicPost
  /** Every live post, newest first: the neighbours and related posts are found among them. */
  cards: PublicPostCard[]
  /** The site's own address (siteOrigin), for share links. */
  origin: string
  locale?: string | null
  /** Posts like this one, already chosen (lib/site-blog relatedPosts); absent, chosen here. */
  related?: PublicPostCard[]
}): StorefrontArticleFull {
  const { post, cards, origin, locale } = input
  const at = cards.findIndex((c) => c.id === post.id)
  /* Newest first: the one before it in the list is newer (next), the one after it older (previous). */
  const newer = at > 0 ? cards[at - 1] : null
  const older = at >= 0 && at < cards.length - 1 ? cards[at + 1] : null
  const url = `${origin.replace(/\/+$/, "")}${post.path}`
  const enc = encodeURIComponent
  return {
    ...storefrontArticle(post, locale),
    content: post.html,
    related: (input.related ?? relatedCards(cards, post)).slice(0, RELATED_POSTS).map((c) => storefrontArticle(c, locale)),
    previous: older ? storefrontArticle(older, locale) : null,
    next: newer ? storefrontArticle(newer, locale) : null,
    share: {
      url,
      x: `https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(post.title)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`,
      email: `mailto:?subject=${enc(post.title)}&body=${enc(url)}`,
    },
  }
}

/* ── The builder's canvas ─────────────────────────────────────────────── */

/** What GET blog/canvas answers (lib/site-blog, blueprint §C). */
export interface BlogCanvasPayload {
  settings: SiteBlogSettings
  listing: BlogListing
  post: PublicPost | null
  sample: boolean
}

/**
 * The blog and the post the canvas draws a blog page with: the blog's own
 * posts, or its sample ones while it has none. Sample posts are flagged
 * `sample` and only the canvas ever asks for them.
 */
export function canvasBlogData(payload: BlogCanvasPayload | null, pageKey: string, origin = ""): { blog: StorefrontBlog | null; article: StorefrontArticleFull | null } {
  if (!payload?.settings) return { blog: null, article: null }
  const cards = payload.listing?.posts ?? []
  const blog = storefrontBlog({ settings: payload.settings, cards, listing: payload.listing, sample: payload.sample })
  const post = pageKey === "article" ? payload.post ?? null : null
  return { blog, article: post ? storefrontArticleFull({ post, cards, origin }) : null }
}
