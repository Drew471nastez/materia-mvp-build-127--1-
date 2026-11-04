import "server-only"
/**
 * ===========================================================================
 *  WHAT VISITORS OF A CREATOR'S SITE READ OF ITS BLOG
 * ===========================================================================
 * Read with the service role (there is no anon policy on site_blog_*), always
 * filtered by creator_id, and only the live columns: a draft never leaves
 * this file except through readPreviewPost, which needs a signed token and is
 * never cached.
 *
 * CACHED UNDER ONE TAG, `site-blog:<creator>` (lib/site-blog/cache.ts), for
 * five minutes, cleared by every publish-type change. What is held is every
 * row with status 'published', SCHEDULED ONES INCLUDED, and whether one is
 * live is decided here, outside the cache, against the clock: a post
 * scheduled for 9:00 is on the site at 9:00 (within the page's own minute)
 * with no job and no cache clear. Never cache anything keyed by "now".
 *
 * BEFORE SQL PART 355 every read answers null or nothing, so a site is drawn
 * exactly as it was. A read that fails for another reason serves the last
 * good copy this server holds (LastGood), else nothing.
 */
import { unstable_cache } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"
import { LastGood, keyedAs } from "@/lib/website-builder/last-good"
import { draftMetaOf, missingTable, settingsOf } from "./admin"
import { siteBlogTag } from "./cache"
import { verifySitePostPreview } from "./preview-token"
import { escapeHtml, renderBlocksHtml } from "./render-html"
import { sanitizeSiteBlocks } from "./sanitize"
import { isLive } from "./schedule"
import { samplePosts } from "./sample"
import { isPostSlug } from "./slug"
import type { BlogListing, PublicPost, PublicPostCard, SiteBlogAuthor, SiteBlogCategory, SiteBlogSettings } from "./types"
import { categoryPath, postPath } from "./urls"
import { readMinutes, wordCount } from "@/lib/blog/editor-tools"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

export const MAX_CARDS = 2000
const HOLD_SECONDS = 300

/**
 * The client and the cache these reads use. Tests swap them for an
 * in-memory database and a pass-through (tests/site-blog-data.test.ts).
 */
export const siteBlogReadDeps: {
  db: () => Db
  cached: <T>(fn: () => Promise<T>, key: string[], creatorId: string) => Promise<T>
} = {
  db: () => createAdminClient() as unknown as Db,
  cached: <T>(fn: () => Promise<T>, key: string[], creatorId: string) =>
    unstable_cache(keyedAs(key.join(":"), fn), key, { tags: [siteBlogTag(creatorId)], revalidate: HOLD_SECONDS })(),
}

/** A read that failed for a reason other than a missing table: thrown inside the cache so it is never held. */
class ReadFailed extends Error {}

/* ── One cached read per creator: settings, categories, authors, published cards ── */

const CARD_COLUMNS = "id, slug, status, title, excerpt, summary, cover_image_url, cover_alt, category_id, tags, author_id, published_at, updated_at, content_updated_at, reading_minutes, featured, noindex"

interface BlogData {
  /** False when the creator has no blog row and no post: no blog at all. */
  configured: boolean
  settings: SiteBlogSettings
  categories: SiteBlogCategory[]
  authors: SiteBlogAuthor[]
  /** Every published row, scheduled included, newest first. */
  rows: Row[]
}

async function loadBlogData(creatorId: string, db: Db = siteBlogReadDeps.db()): Promise<BlogData | null> {
  const [settings, cats, authors, posts] = await Promise.all([
    db.from("site_blog_settings").select("*").eq("creator_id", creatorId).maybeSingle(),
    db.from("site_blog_categories").select("*").eq("creator_id", creatorId).order("sort_order", { ascending: true }).order("name", { ascending: true }).limit(1000),
    db.from("site_blog_authors").select("*").eq("creator_id", creatorId).limit(500),
    db.from("site_blog_posts").select(CARD_COLUMNS).eq("creator_id", creatorId).eq("status", "published").order("published_at", { ascending: false }).limit(MAX_CARDS),
  ])
  for (const r of [settings, cats, authors, posts]) {
    if (r.error && missingTable(r.error)) return null
    if (r.error) throw new ReadFailed(r.error.message)
  }
  const rows = (posts.data ?? []) as Row[]
  if (!settings.data && !rows.length) {
    /* No blog row and nothing published: is there any post at all (a creator writing their first)? */
    const any = await db.from("site_blog_posts").select("id").eq("creator_id", creatorId).limit(1)
    if (any.error && !missingTable(any.error)) throw new ReadFailed(any.error.message)
    if (!(any.data ?? []).length) return { configured: false, settings: settingsOf(null), categories: [], authors: [], rows: [] }
  }
  return {
    configured: true,
    settings: settingsOf((settings.data as Row | null) ?? null),
    categories: ((cats.data ?? []) as Row[]).map((r) => ({ id: r.id, slug: r.slug, name: r.name, description: r.description ?? "", sortOrder: Number(r.sort_order) || 0, seoTitle: r.seo_title ?? "", seoDescription: r.seo_description ?? "" })),
    authors: ((authors.data ?? []) as Row[]).map(authorOf),
    rows,
  }
}

function authorOf(r: Row): SiteBlogAuthor {
  const links = Array.isArray(r.links) ? (r.links as Row[]).filter((l) => l && typeof l.url === "string").map((l) => ({ label: String(l.label ?? ""), url: l.url as string })) : []
  return { id: r.id, slug: r.slug, name: r.name, role: r.role ?? "", bio: r.bio ?? "", avatarUrl: r.avatar_url ?? "", links }
}

const dataHeld = new LastGood<BlogData | null>(500)

async function blogData(creatorId: string): Promise<BlogData | null> {
  if (!creatorId) return null
  try {
    const data = await siteBlogReadDeps.cached(() => loadBlogData(creatorId), ["site-blog-data", "v1", creatorId], creatorId)
    dataHeld.remember(creatorId, data)
    return data
  } catch (e) {
    const held = dataHeld.get(creatorId)
    if (held !== undefined) return held
    console.error("[site-blog] blog read failed", { creatorId, error: e instanceof Error ? e.message : String(e) })
    return null
  }
}

/* ── Rows into cards ─────────────────────────────────────────────────────── */

function cardOf(r: Row, data: BlogData): PublicPostCard {
  const handle = data.settings.handle
  const cat = r.category_id ? data.categories.find((c) => c.id === r.category_id) : undefined
  const author = r.author_id ? (data.authors.find((a) => a.id === r.author_id) ?? null) : null
  const summary = String(r.excerpt || r.summary || "").trim()
  return {
    id: r.id,
    slug: r.slug,
    path: postPath(handle, r.slug),
    title: r.title ?? "",
    excerpt: r.excerpt ?? "",
    summaryHtml: summary ? `<p>${escapeHtml(summary)}</p>` : "",
    coverImageUrl: r.cover_image_url ?? "",
    coverAlt: r.cover_alt ?? "",
    category: cat ? { slug: cat.slug, name: cat.name, path: categoryPath(handle, cat.slug) } : null,
    tags: Array.isArray(r.tags) ? r.tags : [],
    author,
    publishedAt: r.published_at ?? "",
    updatedAt: r.content_updated_at ?? r.updated_at ?? r.published_at ?? "",
    readingMinutes: Number(r.reading_minutes) || 0,
    featured: r.featured === true,
  }
}

/* ── The public reads ────────────────────────────────────────────────────── */

/** The blog's settings, or null when the creator has no blog (nothing set up, no post) or SQL 355 has not run. */
export async function readSiteBlog(creatorId: string): Promise<SiteBlogSettings | null> {
  const data = await blogData(creatorId)
  return data?.configured ? data.settings : null
}

/** Every published post as a card, SCHEDULED ONES INCLUDED, newest first: the canvas shows them; visitors get liveCards. */
export async function readPublishedCards(creatorId: string): Promise<PublicPostCard[]> {
  const data = await blogData(creatorId)
  return data ? data.rows.map((r) => cardOf(r, data)) : []
}

/** The cards visitors see: published, and their time has come. Filtered here, outside the cache. */
export async function liveCards(creatorId: string, now: number = Date.now()): Promise<PublicPostCard[]> {
  const data = await blogData(creatorId)
  return data ? liveRows(data, now).map((r) => cardOf(r, data)) : []
}

function liveRows(data: BlogData, now: number): Row[] {
  return data.rows.filter((r) => isLive(r as { status: string; published_at: string | null }, now))
}

/** The listing at a page, optionally for one category or one tag. Null: no blog, an unknown category, or a page past the last. */
export async function readBlogListing(creatorId: string, opts: { page?: number; categorySlug?: string | null; tag?: string | null } = {}, now: number = Date.now()): Promise<BlogListing | null> {
  const data = await blogData(creatorId)
  if (!data?.configured) return null
  const all = liveRows(data, now).map((r) => cardOf(r, data))
  const category = opts.categorySlug ? (data.categories.find((c) => c.slug === opts.categorySlug) ?? null) : null
  if (opts.categorySlug && !category) return null
  const tag = opts.tag ? String(opts.tag).toLowerCase().trim() : null
  const list = all.filter((c) => (!category || c.category?.slug === category.slug) && (!tag || c.tags.includes(tag)))
  const per = data.settings.postsPerPage || 12
  const pages = Math.max(1, Math.ceil(list.length / per))
  const page = Math.max(1, Math.floor(Number(opts.page) || 1))
  if (page > pages) return null
  const counts = new Map<string, number>()
  for (const c of all) if (c.category) counts.set(c.category.slug, (counts.get(c.category.slug) ?? 0) + 1)
  const categories = data.categories.map((c) => ({ ...c, postCount: counts.get(c.slug) ?? 0 }))
  return {
    blog: data.settings,
    posts: list.slice((page - 1) * per, page * per),
    page,
    pages,
    total: list.length,
    category: category ? { ...category, postCount: counts.get(category.slug) ?? 0 } : null,
    tag,
    categories,
    allTags: [...new Set(all.flatMap((c) => c.tags))].sort((a, b) => a.localeCompare(b)),
  }
}

const POST_COLUMNS = `${CARD_COLUMNS}, content, word_count, seo_title, seo_description, canonical_url, og_title, og_description, og_image_url`
const postHeld = new LastGood<Row | null>(2000)

async function loadPostRow(creatorId: string, slug: string): Promise<Row | null> {
  const { data, error } = await siteBlogReadDeps.db().from("site_blog_posts").select(POST_COLUMNS).eq("creator_id", creatorId).eq("slug", slug).eq("status", "published").maybeSingle()
  if (error && missingTable(error)) return null
  if (error) throw new ReadFailed(error.message)
  return (data as Row | null) ?? null
}

function publicPostOf(r: Row, data: BlogData, blocks: unknown): PublicPost {
  const clean = sanitizeSiteBlocks(blocks)
  const words = Number(r.word_count) || wordCount(clean)
  return {
    ...cardOf(r, data),
    readingMinutes: Number(r.reading_minutes) || (clean.length ? readMinutes(words) : 0),
    blocks: clean,
    html: renderBlocksHtml(clean),
    wordCount: words,
    seo: {
      title: r.seo_title ?? "",
      description: r.seo_description ?? "",
      canonicalUrl: r.canonical_url ?? "",
      ogTitle: r.og_title ?? "",
      ogDescription: r.og_description ?? "",
      ogImageUrl: r.og_image_url ?? "",
      noindex: r.noindex === true,
    },
  }
}

/** A live post by its slug: cached per slug under the blog's tag, whether it is live yet checked after the cache. */
export async function readLivePost(creatorId: string, slug: string, now: number = Date.now()): Promise<PublicPost | null> {
  if (!creatorId || !isPostSlug(slug)) return null
  const data = await blogData(creatorId)
  if (!data?.configured) return null
  const key = `${creatorId}:${slug}`
  let row: Row | null
  try {
    row = await siteBlogReadDeps.cached(() => loadPostRow(creatorId, slug), ["site-blog-post", "v1", creatorId, slug], creatorId)
    postHeld.remember(key, row)
  } catch (e) {
    const held = postHeld.get(key)
    if (held === undefined) {
      console.error("[site-blog] post read failed", { creatorId, slug, error: e instanceof Error ? e.message : String(e) })
      return null
    }
    row = held
  }
  if (!row || !isLive(row as { status: string; published_at: string | null }, now)) return null
  return publicPostOf(row, data, row.content)
}

/** Up to `n` other posts: the same category first, then the most tags in common, then the newest. */
export function relatedPosts(cards: PublicPostCard[], post: Pick<PublicPostCard, "id" | "category" | "tags">, n = 3): PublicPostCard[] {
  const tags = new Set(post.tags)
  return cards
    .filter((c) => c.id !== post.id)
    .map((c, i) => ({ c, i, cat: post.category && c.category?.slug === post.category.slug ? 1 : 0, shared: c.tags.filter((t) => tags.has(t)).length }))
    .sort((a, b) => b.cat - a.cat || b.shared - a.shared || Date.parse(b.c.publishedAt) - Date.parse(a.c.publishedAt) || a.i - b.i)
    .slice(0, Math.max(0, n))
    .map((x) => x.c)
}

/** The slug an old post address now points to, or null. The caller answers 308 to postPath(handle, it). */
export async function siteBlogRedirect(creatorId: string, slug: string): Promise<string | null> {
  if (!creatorId || !slug || slug.length > 200) return null
  try {
    return await siteBlogReadDeps.cached(
      async () => {
        const { data, error } = await siteBlogReadDeps.db().from("site_blog_redirects").select("to_slug").eq("creator_id", creatorId).eq("from_slug", slug).maybeSingle()
        if (error && missingTable(error)) return null
        if (error) throw new ReadFailed(error.message)
        const to = (data as { to_slug?: string } | null)?.to_slug ?? null
        return to && to !== slug ? to : null
      },
      ["site-blog-redirect", "v1", creatorId, slug],
      creatorId,
    )
  } catch {
    return null
  }
}

/** A post's draft (over its live copy) for a signed preview link: never cached, the store's own post only. */
export async function readPreviewPost(creatorId: string, token: string, now: number = Date.now()): Promise<PublicPost | null> {
  const id = verifySitePostPreview(token, now)
  if (!id || !creatorId) return null
  const { data: row, error } = await siteBlogReadDeps.db().from("site_blog_posts").select("*").eq("creator_id", creatorId).eq("id", id).maybeSingle()
  if (error || !row) return null
  const data = (await blogData(creatorId)) ?? { configured: true, settings: settingsOf(null), categories: [], authors: [], rows: [] }
  const r = row as Row
  const meta = draftMetaOf(r)
  const nowIso = new Date(now).toISOString()
  const view: Row = {
    ...r,
    slug: meta.slug || r.slug,
    title: meta.title,
    excerpt: meta.excerpt,
    summary: r.draft_content ? "" : r.summary,
    cover_image_url: meta.coverImageUrl,
    cover_alt: meta.coverAlt,
    category_id: meta.categoryId,
    tags: meta.tags,
    author_id: meta.authorId,
    seo_title: meta.seoTitle,
    seo_description: meta.seoDescription,
    canonical_url: meta.canonicalUrl,
    og_title: meta.ogTitle,
    og_description: meta.ogDescription,
    og_image_url: meta.ogImageUrl,
    featured: meta.featured,
    /* A preview is never indexed, whatever the post says. */
    noindex: true,
    published_at: meta.publishedAt ?? r.published_at ?? nowIso,
    content_updated_at: r.draft_saved_at ?? r.content_updated_at ?? nowIso,
    word_count: 0,
    reading_minutes: 0,
  }
  return publicPostOf(view, data, r.draft_content ?? r.content ?? [])
}

/** What the sitemap lists: the blog's address, its live indexable-or-not posts with their date and pictures, the categories that have live posts, the newest date. */
export async function listedBlogEntries(creatorId: string, now: number = Date.now()): Promise<{ handle: string; posts: { slug: string; lastmod: string; images: string[]; noindex: boolean }[]; categories: string[]; newest: string | null }> {
  const data = await blogData(creatorId)
  if (!data?.configured) return { handle: data?.settings.handle ?? settingsOf(null).handle, posts: [], categories: [], newest: null }
  const live = liveRows(data, now)
  const used = new Set(live.map((r) => r.category_id).filter(Boolean))
  const posts = live.map((r) => ({
    slug: r.slug as string,
    lastmod: (r.content_updated_at ?? r.published_at ?? r.updated_at) as string,
    images: [r.cover_image_url].filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u)),
    noindex: r.noindex === true,
  }))
  const newest = posts.reduce<string | null>((m, p) => (!m || Date.parse(p.lastmod) > Date.parse(m) ? p.lastmod : m), null)
  return { handle: data.settings.handle, posts, categories: data.categories.filter((c) => used.has(c.id)).map((c) => c.slug), newest }
}

/** The one read compat SiteData and native dressPage use: the blog's settings and its live cards, or null when there is no blog. */
export async function blogFor(creatorId: string, now: number = Date.now()): Promise<{ settings: SiteBlogSettings; cards: PublicPostCard[] } | null> {
  const data = await blogData(creatorId)
  if (!data?.configured) return null
  return { settings: data.settings, cards: liveRows(data, now).map((r) => cardOf(r, data)) }
}

/**
 * What the builder's canvases draw for the Blog and Post templates: read
 * fresh with the editor's own client (never the cache), live AND scheduled
 * posts, or the three sample posts when nothing is published, flagged
 * `sample: true`. Null before SQL part 355.
 */
export async function readCanvasBlog(db: Db, creatorId: string, slug: string | null, now: number = Date.now()): Promise<{ settings: SiteBlogSettings; listing: BlogListing; post: PublicPost | null; sample: boolean } | null> {
  const data = await loadBlogData(creatorId, db)
  if (!data) return null
  const per = data.settings.postsPerPage || 12
  const cards = data.rows.map((r) => cardOf(r, data))
  if (!cards.length) {
    const samples = samplePosts(data.settings.handle, now)
    const cats = [...new Map(samples.filter((p) => p.category).map((p) => [p.category!.slug, p.category!])).values()]
    const listing: BlogListing = {
      blog: data.settings,
      posts: samples.map(({ blocks: _b, html: _h, wordCount: _w, seo: _s, ...card }) => card),
      page: 1,
      pages: 1,
      total: samples.length,
      category: null,
      tag: null,
      categories: cats.map((c, i) => ({ id: `sample-${c.slug}`, slug: c.slug, name: c.name, description: "", sortOrder: i, seoTitle: "", seoDescription: "", postCount: 1 })),
      allTags: [...new Set(samples.flatMap((p) => p.tags))].sort(),
    }
    return { settings: data.settings, listing, post: samples.find((p) => p.slug === slug) ?? samples[0], sample: true }
  }
  const counts = new Map<string, number>()
  for (const c of cards) if (c.category) counts.set(c.category.slug, (counts.get(c.category.slug) ?? 0) + 1)
  const listing: BlogListing = {
    blog: data.settings,
    posts: cards.slice(0, per),
    page: 1,
    pages: Math.max(1, Math.ceil(cards.length / per)),
    total: cards.length,
    category: null,
    tag: null,
    categories: data.categories.map((c) => ({ ...c, postCount: counts.get(c.slug) ?? 0 })),
    allTags: [...new Set(cards.flatMap((c) => c.tags))].sort((a, b) => a.localeCompare(b)),
  }
  const want = slug && isPostSlug(slug) ? slug : cards[0].slug
  const { data: row, error } = await db.from("site_blog_posts").select(POST_COLUMNS).eq("creator_id", creatorId).eq("slug", want).eq("status", "published").maybeSingle()
  if (error && !missingTable(error)) throw new ReadFailed(error.message)
  return { settings: data.settings, listing, post: row ? publicPostOf(row as Row, data, (row as Row).content) : null, sample: false }
}
