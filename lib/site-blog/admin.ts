import "server-only"
/**
 * ===========================================================================
 *  A CREATOR'S BLOG: EVERY READ AND WRITE THE BLOG SCREEN MAKES
 * ===========================================================================
 * Every function takes the client the route was handed by
 * websiteInstallCaller (the owner's own, under row level security, or the
 * service role for a team member with Website) and the store's creator id,
 * and every query filters creator_id itself, so a team member's service role
 * client can never reach another store's posts. tests/site-blog-data.test.ts
 * greps this file for a `.from("site_blog_…")` without it.
 *
 * DRAFT AND LIVE (SQL part 353). A post that is not published keeps its
 * words in the row's own columns. A published post (live or scheduled) keeps
 * what visitors read in those columns and every save in draft_meta /
 * draft_content; Publish/Update copies the draft over the live columns. A
 * live post's slug change waits in draft_meta.slug until then, and leaves a
 * redirect from the old address.
 *
 * VERSION. Every write bumps `version`; a save carrying another one is
 * answered 409 with the post as it is now, and the write itself is a
 * compare-and-set on the version, so two tabs never overwrite each other.
 *
 * Nothing here touches a cache. The route calls revalidateSiteBlog when a
 * mutation reports `liveChanged` (never for an autosave).
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { readMinutes, wordCount } from "@/lib/blog/editor-tools"
import { revisionsToPrune, slugChangePlan, REVISION_CAP } from "@/lib/blog/save-rules"
import type { SiteBlock } from "./blocks"
import { blocksPlainText, truncateWords } from "./render-html"
import { cleanTag, emptyPostMeta, sanitizeAuthorInput, sanitizeBlogSettingsInput, sanitizeCategoryInput, sanitizePostMeta, sanitizeSiteBlocks } from "./sanitize"
import { postStatusOf } from "./schedule"
import { DEFAULT_BLOG_HANDLE, isPostSlug, postSlugFrom, uniqueSlug } from "./slug"
import type { AdminPost, AdminPostSummary, SiteBlogAuthor, SiteBlogCategory, SiteBlogSettings, SitePostMeta, SitePostStatus } from "./types"
import { postPath } from "./urls"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

export const SQL_PART = 353 as const
export const SQL_MISSING = "Blog turns on after the database update (SQL part 353)."
export const MAX_BULK = 200
/** How often a plain save also leaves a revision: one per post per ten minutes, so fifty reach back further than one sitting. */
export const SAVE_REVISION_EVERY_MS = 10 * 60 * 1000

/** A refusal a route answers with its status (and, for 409, the post as it is now). */
export class SiteBlogError extends Error {
  constructor(
    public status: 400 | 404 | 409 | 500 | 503,
    message: string,
    public current?: AdminPost,
  ) {
    super(message)
    this.name = "SiteBlogError"
  }
}

/** The tables are not there yet: SQL part 353 has not been run. */
export function missingTable(err: unknown): boolean {
  if (!err) return false
  const e = err as { message?: string; code?: string; details?: string }
  const text = `${e.message ?? ""} ${e.details ?? ""}`
  return e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(text)
}

function fail(err: { message?: string; code?: string } | null, what: string): never {
  if (missingTable(err)) throw new SiteBlogError(503, SQL_MISSING)
  if (err?.code === "23505") throw new SiteBlogError(400, "That address is already used.")
  throw new SiteBlogError(500, `Could not ${what}.`)
}

/* ── Rows into the contract's shapes ─────────────────────────────────────── */

const POST_LIST_COLUMNS = "id, status, slug, title, excerpt, cover_image_url, category_id, tags, author_id, featured, published_at, updated_at, draft_meta, draft_saved_at"

/** The live columns as meta: what visitors read. */
export function liveMetaOf(row: Row): SitePostMeta {
  return {
    title: row.title ?? "",
    slug: row.slug ?? "",
    excerpt: row.excerpt ?? "",
    coverImageUrl: row.cover_image_url ?? "",
    coverAlt: row.cover_alt ?? "",
    categoryId: row.category_id ?? null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    authorId: row.author_id ?? null,
    seoTitle: row.seo_title ?? "",
    seoDescription: row.seo_description ?? "",
    canonicalUrl: row.canonical_url ?? "",
    ogTitle: row.og_title ?? "",
    ogDescription: row.og_description ?? "",
    ogImageUrl: row.og_image_url ?? "",
    noindex: row.noindex === true,
    featured: row.featured === true,
    publishedAt: row.published_at ?? null,
  }
}

/** The editor's view: the working copy over the live one. */
export function draftMetaOf(row: Row): SitePostMeta {
  const live = liveMetaOf(row)
  return row.draft_meta && typeof row.draft_meta === "object" ? sanitizePostMeta(row.draft_meta, live) : live
}

function draftBlocksOf(row: Row): SiteBlock[] {
  return sanitizeSiteBlocks(row.draft_content ?? row.content ?? [])
}

function hasDraft(row: Row): boolean {
  return row.status === "published" && (row.draft_meta != null || row.draft_content != null)
}

function summaryOf(row: Row, handle: string, now = Date.now()): AdminPostSummary {
  const meta = draftMetaOf(row)
  const status = postStatusOf(row as { status: string; published_at: string | null }, now)
  return {
    id: row.id,
    status,
    title: meta.title,
    slug: meta.slug,
    excerpt: meta.excerpt,
    coverImageUrl: meta.coverImageUrl,
    categoryId: meta.categoryId,
    tags: meta.tags,
    authorId: meta.authorId,
    featured: meta.featured,
    publishedAt: row.status === "published" ? (row.published_at ?? null) : meta.publishedAt,
    updatedAt: row.draft_saved_at && row.draft_saved_at > (row.updated_at ?? "") ? row.draft_saved_at : (row.updated_at ?? row.created_at ?? ""),
    hasUnpublishedChanges: hasDraft(row),
    livePath: row.status === "published" ? postPath(handle, row.slug) : null,
  }
}

export function adminPostOf(row: Row, handle: string, now = Date.now()): AdminPost {
  const blocks = draftBlocksOf(row)
  const words = wordCount(blocks)
  return {
    ...summaryOf(row, handle, now),
    meta: draftMetaOf(row),
    blocks,
    version: Number(row.version) || 1,
    liveSlug: row.status === "published" ? row.slug : null,
    createdAt: row.created_at ?? "",
    firstPublishedAt: row.first_published_at ?? null,
    wordCount: words,
    readingMinutes: readMinutes(words),
  }
}

/** The live columns a meta and blocks are written into. */
function liveColumns(meta: SitePostMeta, blocks: SiteBlock[]): Row {
  const words = wordCount(blocks)
  return {
    slug: meta.slug,
    title: meta.title,
    excerpt: meta.excerpt,
    content: blocks,
    cover_image_url: meta.coverImageUrl || null,
    cover_alt: meta.coverAlt || null,
    category_id: meta.categoryId,
    tags: meta.tags,
    author_id: meta.authorId,
    seo_title: meta.seoTitle || null,
    seo_description: meta.seoDescription || null,
    canonical_url: meta.canonicalUrl || null,
    og_title: meta.ogTitle || null,
    og_description: meta.ogDescription || null,
    og_image_url: meta.ogImageUrl || null,
    noindex: meta.noindex,
    featured: meta.featured,
    word_count: words,
    reading_minutes: blocks.length ? readMinutes(words) : 0,
    summary: truncateWords(blocksPlainText(blocks), 60).slice(0, 600),
  }
}

/* ── Reads every write needs ─────────────────────────────────────────────── */

async function blogHandle(db: Db, creatorId: string): Promise<string> {
  const { data, error } = await db.from("site_blog_settings").select("handle").eq("creator_id", creatorId).maybeSingle()
  if (error) fail(error, "read the blog")
  return (data as { handle?: string } | null)?.handle || DEFAULT_BLOG_HANDLE
}

async function postRow(db: Db, creatorId: string, id: string): Promise<Row | null> {
  if (!isUuid(id)) return null
  const { data, error } = await db.from("site_blog_posts").select("*").eq("creator_id", creatorId).eq("id", id).maybeSingle()
  if (error) fail(error, "read the post")
  return (data as Row | null) ?? null
}

async function mustPostRow(db: Db, creatorId: string, id: string): Promise<Row> {
  const row = await postRow(db, creatorId, id)
  if (!row) throw new SiteBlogError(404, "Post not found.")
  return row
}

/** Every slug of the store's other posts that starts like `base` (the candidates uniqueSlug checks). */
async function takenSlugs(db: Db, creatorId: string, base: string, exceptId: string | null): Promise<Set<string>> {
  const root = base.replace(/-\d+$/, "")
  const { data, error } = await db.from("site_blog_posts").select("id, slug").eq("creator_id", creatorId).like("slug", `${root}%`).limit(5000)
  if (error) fail(error, "check the address")
  return new Set(((data ?? []) as Row[]).filter((r) => r.id !== exceptId).map((r) => r.slug as string))
}

async function slugFor(db: Db, creatorId: string, meta: SitePostMeta, exceptId: string | null): Promise<string> {
  const wanted = isPostSlug(meta.slug) ? meta.slug : postSlugFrom(meta.title) || "untitled"
  return uniqueSlug(wanted, await takenSlugs(db, creatorId, isPostSlug(wanted) ? wanted : "post", exceptId))
}

const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

/** The category and author ids a post names, kept only when they are this store's. */
async function ownRefs(db: Db, creatorId: string, meta: SitePostMeta): Promise<SitePostMeta> {
  const [cat, author] = await Promise.all([
    meta.categoryId ? db.from("site_blog_categories").select("id").eq("creator_id", creatorId).eq("id", meta.categoryId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    meta.authorId ? db.from("site_blog_authors").select("id").eq("creator_id", creatorId).eq("id", meta.authorId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ])
  if (cat.error) fail(cat.error, "check the category")
  if (author.error) fail(author.error, "check the author")
  return { ...meta, categoryId: cat.data ? meta.categoryId : null, authorId: author.data ? meta.authorId : null }
}

/* ── Revisions: fifty per post ───────────────────────────────────────────── */

type RevisionKind = "save" | "publish" | "update" | "schedule" | "unpublish" | "restore"

async function writeRevision(db: Db, creatorId: string, userId: string | null, postId: string, kind: RevisionKind, meta: SitePostMeta, blocks: SiteBlock[]): Promise<void> {
  if (kind === "save") {
    const { data: last } = await db.from("site_blog_post_revisions").select("kind, created_at").eq("creator_id", creatorId).eq("post_id", postId).order("created_at", { ascending: false }).limit(1).maybeSingle()
    const at = Date.parse((last as Row | null)?.created_at ?? "")
    if (Number.isFinite(at) && Date.now() - at < SAVE_REVISION_EVERY_MS) return
  }
  const { error } = await db.from("site_blog_post_revisions").insert({ creator_id: creatorId, post_id: postId, kind, meta, content: blocks, created_by: userId })
  if (error) return /* a revision is a convenience: the post itself is saved */
  const { data: ids } = await db.from("site_blog_post_revisions").select("id").eq("creator_id", creatorId).eq("post_id", postId).order("created_at", { ascending: false }).limit(REVISION_CAP + 50)
  const prune = revisionsToPrune(((ids ?? []) as Row[]).map((r) => r.id as string))
  if (prune.length) await db.from("site_blog_post_revisions").delete().eq("creator_id", creatorId).eq("post_id", postId).in("id", prune)
}

/* ── The list ────────────────────────────────────────────────────────────── */

export interface AdminPostQuery {
  search?: string
  status?: "all" | SitePostStatus
  categoryId?: string
  tag?: string
  authorId?: string
  sort?: "updated" | "published" | "title"
  page?: number
  perPage?: number
}

export async function postCounts(db: Db, creatorId: string, now = Date.now()): Promise<Record<"all" | SitePostStatus, number>> {
  const nowIso = new Date(now).toISOString()
  const head = { count: "exact" as const, head: true }
  const [draft, archived, live, scheduled] = await Promise.all([
    db.from("site_blog_posts").select("id", head).eq("creator_id", creatorId).eq("status", "draft"),
    db.from("site_blog_posts").select("id", head).eq("creator_id", creatorId).eq("status", "archived"),
    db.from("site_blog_posts").select("id", head).eq("creator_id", creatorId).eq("status", "published").lte("published_at", nowIso),
    db.from("site_blog_posts").select("id", head).eq("creator_id", creatorId).eq("status", "published").gt("published_at", nowIso),
  ])
  for (const r of [draft, archived, live, scheduled]) if (r.error) fail(r.error, "count the posts")
  const n = (r: { count: number | null }) => r.count ?? 0
  return { all: n(draft) + n(live) + n(scheduled), draft: n(draft), scheduled: n(scheduled), published: n(live), archived: n(archived) }
}

/** Search words as a PostgREST pattern: the characters its filter syntax gives meaning to are dropped. */
const searchPattern = (q: string) => q.replace(/[,()*%\\:"'.]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100)

export async function listAdminPosts(db: Db, creatorId: string, q: AdminPostQuery = {}): Promise<{ posts: AdminPostSummary[]; total: number; counts: Record<"all" | SitePostStatus, number> }> {
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  const perPage = Math.max(1, Math.min(200, Math.floor(Number(q.perPage) || 50)))
  const page = Math.max(1, Math.floor(Number(q.page) || 1))
  let query = db.from("site_blog_posts").select(POST_LIST_COLUMNS, { count: "exact" }).eq("creator_id", creatorId)
  const status = q.status ?? "all"
  if (status === "draft") query = query.eq("status", "draft")
  else if (status === "archived") query = query.eq("status", "archived")
  else if (status === "published") query = query.eq("status", "published").lte("published_at", nowIso)
  else if (status === "scheduled") query = query.eq("status", "published").gt("published_at", nowIso)
  else query = query.neq("status", "archived")
  const words = searchPattern(q.search ?? "")
  if (words) query = query.or(`title.ilike.*${words}*,slug.ilike.*${words}*,excerpt.ilike.*${words}*,draft_meta->>title.ilike.*${words}*`)
  if (isUuid(q.categoryId)) query = query.eq("category_id", q.categoryId)
  const tag = q.tag ? cleanTag(q.tag) : ""
  if (tag) query = query.contains("tags", [tag])
  if (isUuid(q.authorId)) query = query.eq("author_id", q.authorId)
  if (q.sort === "title") query = query.order("title", { ascending: true }).order("id", { ascending: true })
  else if (q.sort === "published") query = query.order("published_at", { ascending: false, nullsFirst: false }).order("id", { ascending: true })
  else query = query.order("updated_at", { ascending: false }).order("id", { ascending: true })
  const from = (page - 1) * perPage
  const [list, counts, handle] = await Promise.all([query.range(from, from + perPage - 1), postCounts(db, creatorId, now), blogHandle(db, creatorId)])
  if (list.error) fail(list.error, "list the posts")
  return { posts: ((list.data ?? []) as Row[]).map((r) => summaryOf(r, handle, now)), total: list.count ?? 0, counts }
}

export async function getAdminPost(db: Db, creatorId: string, id: string): Promise<AdminPost | null> {
  const [row, handle] = await Promise.all([postRow(db, creatorId, id), blogHandle(db, creatorId)])
  return row ? adminPostOf(row, handle) : null
}

/* ── Create and save ─────────────────────────────────────────────────────── */

export async function createPost(db: Db, creatorId: string, userId: string, init: { meta?: Partial<SitePostMeta>; blocks?: unknown } = {}): Promise<AdminPost> {
  const meta = await ownRefs(db, creatorId, sanitizePostMeta(init.meta ?? {}, emptyPostMeta()))
  const blocks = sanitizeSiteBlocks(init.blocks ?? [])
  const slug = await slugFor(db, creatorId, meta, null)
  const row = { creator_id: creatorId, status: "draft", ...liveColumns({ ...meta, slug }, blocks), published_at: meta.publishedAt, version: 1, created_by: userId, updated_by: userId }
  const { data, error } = await db.from("site_blog_posts").insert({ ...row, creator_id: creatorId }).select("*").single()
  if (error || !data) fail(error, "create the post")
  return adminPostOf(data as Row, await blogHandle(db, creatorId))
}

export type SaveResult = { ok: true; post: AdminPost } | { ok: false; status: 409; current: AdminPost } | { ok: false; status: 400 | 404; error: string }

/**
 * An autosave or a Save. `version` is the one the editor last had; another
 * one is a 409 with the post as it is now. A published post's save goes to
 * its draft columns only: what visitors read changes on Update.
 */
export async function savePostDraft(db: Db, creatorId: string, userId: string, id: string, body: { meta: unknown; blocks: unknown; version: number }): Promise<SaveResult> {
  const version = Number(body?.version)
  if (!Number.isInteger(version) || version < 1) return { ok: false, status: 400, error: "version" }
  const row = await postRow(db, creatorId, id)
  if (!row) return { ok: false, status: 404, error: "Post not found." }
  const handle = await blogHandle(db, creatorId)
  if (Number(row.version) !== version) return { ok: false, status: 409, current: adminPostOf(row, handle) }

  const meta = await ownRefs(db, creatorId, sanitizePostMeta(body.meta, draftMetaOf(row)))
  const blocks = sanitizeSiteBlocks(body.blocks)
  const nowIso = new Date().toISOString()
  let patch: Row
  if (row.status === "published") {
    /* The live copy stays as visitors see it; a slug change waits here until Update. */
    const slug = isPostSlug(meta.slug) ? meta.slug : row.slug
    patch = { draft_meta: { ...meta, slug }, draft_content: blocks, draft_saved_at: nowIso }
  } else {
    const slug = meta.slug === row.slug && isPostSlug(meta.slug) ? meta.slug : await slugFor(db, creatorId, meta, row.id)
    patch = { ...liveColumns({ ...meta, slug }, blocks), published_at: meta.publishedAt, draft_meta: null, draft_content: null, draft_saved_at: nowIso }
  }
  const { data, error } = await db
    .from("site_blog_posts")
    .update({ ...patch, version: version + 1, updated_by: userId })
    .eq("creator_id", creatorId)
    .eq("id", row.id)
    .eq("version", version)
    .select("*")
  if (error) {
    if (missingTable(error)) throw new SiteBlogError(503, SQL_MISSING)
    if (error.code === "23505") return { ok: false, status: 400, error: "That address is already used by another post." }
    throw new SiteBlogError(500, "Could not save the post.")
  }
  const saved = ((data ?? []) as Row[])[0]
  if (!saved) {
    /* Another tab saved between the read and the write. */
    const now = await postRow(db, creatorId, id)
    return now ? { ok: false, status: 409, current: adminPostOf(now, handle) } : { ok: false, status: 404, error: "Post not found." }
  }
  await writeRevision(db, creatorId, userId, row.id, "save", draftMetaOf(saved), blocks)
  return { ok: true, post: adminPostOf(saved, handle) }
}

/** A write that carries the row's version, refused when another tab got there first. */
async function writePost(db: Db, creatorId: string, row: Row, patch: Row, userId: string | null): Promise<Row> {
  const { data, error } = await db
    .from("site_blog_posts")
    .update({ ...patch, version: (Number(row.version) || 1) + 1, updated_by: userId })
    .eq("creator_id", creatorId)
    .eq("id", row.id)
    .eq("version", row.version)
    .select("*")
  if (error) fail(error, "save the post")
  const saved = ((data ?? []) as Row[])[0]
  if (!saved) {
    const now = await postRow(db, creatorId, row.id)
    if (!now) throw new SiteBlogError(404, "Post not found.")
    throw new SiteBlogError(409, "This post was changed somewhere else.", adminPostOf(now, await blogHandle(db, creatorId)))
  }
  return saved
}

/* ── Publish, schedule, update ───────────────────────────────────────────── */

export type Mutated = AdminPost & { liveChanged: boolean }

function withLive(post: AdminPost, liveChanged: boolean): Mutated {
  return Object.assign(post, { liveChanged })
}

/**
 * Publish now, schedule, or update a live post: the draft is checked (a
 * title; a slug of its own, not reserved), copied over the live columns, the
 * draft cleared, a revision written, and a live slug that changed leaves a
 * redirect. The date is `publishAt`, else the one in the draft, else the one
 * the post had, else now; "publish" never leaves it ahead, "schedule" needs
 * it ahead.
 */
export async function publishPost(db: Db, creatorId: string, userId: string, id: string, opts: { publishAt?: string | null; version?: number; mode?: "publish" | "schedule" | "update" } = {}): Promise<Mutated> {
  const row = await mustPostRow(db, creatorId, id)
  const handle = await blogHandle(db, creatorId)
  if (opts.version !== undefined && opts.version !== null && Number(opts.version) !== Number(row.version)) {
    throw new SiteBlogError(409, "This post was changed somewhere else.", adminPostOf(row, handle))
  }
  const now = Date.now()
  const wasStatus = postStatusOf(row as { status: string; published_at: string | null }, now)
  const meta = await ownRefs(db, creatorId, draftMetaOf(row))
  const blocks = draftBlocksOf(row)
  if (!meta.title.trim()) throw new SiteBlogError(400, "Give the post a title first.")
  const slug = isPostSlug(meta.slug) ? meta.slug : postSlugFrom(meta.title)
  if (!isPostSlug(slug)) throw new SiteBlogError(400, "Give the post an address of letters, numbers and dashes.")
  if (slug !== row.slug && (await takenSlugs(db, creatorId, slug, row.id)).has(slug)) throw new SiteBlogError(400, "Another post already uses that address.")

  const given = opts.publishAt ? Date.parse(opts.publishAt) : NaN
  if (opts.publishAt && !Number.isFinite(given)) throw new SiteBlogError(400, "That date could not be read.")
  let at = Number.isFinite(given) ? given : Date.parse(meta.publishedAt ?? row.published_at ?? "")
  if (!Number.isFinite(at)) at = now
  if (opts.mode === "publish" && at > now) at = now
  if (opts.mode === "schedule" && at <= now) throw new SiteBlogError(400, "Pick a time ahead to schedule the post.")
  const publishedAt = new Date(at).toISOString()
  const kind: RevisionKind = at > now ? "schedule" : row.status === "published" ? "update" : "publish"
  const nowIso = new Date(now).toISOString()

  const saved = await writePost(
    db,
    creatorId,
    row,
    {
      ...liveColumns({ ...meta, slug, publishedAt }, blocks),
      status: "published",
      published_at: publishedAt,
      first_published_at: row.first_published_at ?? publishedAt,
      content_updated_at: nowIso,
      draft_meta: null,
      draft_content: null,
      draft_saved_at: null,
    },
    userId,
  )
  /* A live post that moved keeps its old address as a redirect (one hop, never a chain); an address that is a post again stops redirecting. */
  const plan = wasStatus === "published" ? slugChangePlan(row.slug, slug) : null
  if (plan) {
    await db.from("site_blog_redirects").upsert({ creator_id: creatorId, ...plan.upsert }, { onConflict: "creator_id,from_slug" })
    await db.from("site_blog_redirects").update({ to_slug: slug }).eq("creator_id", creatorId).eq("to_slug", plan.repointFrom)
  }
  await db.from("site_blog_redirects").delete().eq("creator_id", creatorId).eq("from_slug", slug)
  await writeRevision(db, creatorId, userId, row.id, kind, { ...meta, slug, publishedAt }, blocks)
  return withLive(adminPostOf(saved, handle), true)
}

/** The draft view written into the row's own columns: what unpublish and archive leave, so the editor shows the newest words. */
async function foldedDraft(db: Db, creatorId: string, row: Row): Promise<Row> {
  if (!hasDraft(row)) return {}
  const meta = await ownRefs(db, creatorId, draftMetaOf(row))
  const blocks = draftBlocksOf(row)
  const slug = meta.slug !== row.slug && isPostSlug(meta.slug) && !(await takenSlugs(db, creatorId, meta.slug, row.id)).has(meta.slug) ? meta.slug : row.slug
  return { ...liveColumns({ ...meta, slug }, blocks), draft_meta: null, draft_content: null }
}

export async function unpublishPost(db: Db, creatorId: string, userId: string, id: string): Promise<Mutated> {
  const row = await mustPostRow(db, creatorId, id)
  if (row.status !== "published") return withLive(adminPostOf(row, await blogHandle(db, creatorId)), false)
  const saved = await writePost(db, creatorId, row, { ...(await foldedDraft(db, creatorId, row)), status: "draft" }, userId)
  await writeRevision(db, creatorId, userId, row.id, "unpublish", draftMetaOf(saved), draftBlocksOf(saved))
  return withLive(adminPostOf(saved, await blogHandle(db, creatorId)), true)
}

export async function archivePost(db: Db, creatorId: string, userId: string, id: string): Promise<Mutated> {
  const row = await mustPostRow(db, creatorId, id)
  if (row.status === "archived") return withLive(adminPostOf(row, await blogHandle(db, creatorId)), false)
  const saved = await writePost(db, creatorId, row, { ...(await foldedDraft(db, creatorId, row)), status: "archived" }, userId)
  return withLive(adminPostOf(saved, await blogHandle(db, creatorId)), row.status === "published")
}

export async function unarchivePost(db: Db, creatorId: string, userId: string, id: string): Promise<Mutated> {
  const row = await mustPostRow(db, creatorId, id)
  if (row.status !== "archived") return withLive(adminPostOf(row, await blogHandle(db, creatorId)), false)
  const saved = await writePost(db, creatorId, row, { status: "draft" }, userId)
  return withLive(adminPostOf(saved, await blogHandle(db, creatorId)), false)
}

/** A new draft with the post's newest words, "(copy)" on the title, its own address, not featured and with no date. */
export async function duplicatePost(db: Db, creatorId: string, userId: string, id: string): Promise<Mutated> {
  const row = await mustPostRow(db, creatorId, id)
  const meta = draftMetaOf(row)
  const title = `${meta.title || "Untitled"} (copy)`.slice(0, 200)
  const copy = await createPost(db, creatorId, userId, { meta: { ...meta, title, slug: `${meta.slug || postSlugFrom(title)}-copy`.slice(0, 110), featured: false, publishedAt: null }, blocks: draftBlocksOf(row) })
  return withLive(copy, false)
}

export async function deletePost(db: Db, creatorId: string, _userId: string, id: string): Promise<{ id: string; liveChanged: boolean }> {
  const row = await mustPostRow(db, creatorId, id)
  const { error } = await db.from("site_blog_posts").delete().eq("creator_id", creatorId).eq("id", row.id)
  if (error) fail(error, "delete the post")
  /* Old addresses that led here would lead nowhere. */
  await db.from("site_blog_redirects").delete().eq("creator_id", creatorId).eq("to_slug", row.slug)
  return { id: row.id, liveChanged: row.status === "published" }
}

/* ── Many at once ────────────────────────────────────────────────────────── */

export type BulkAction = "publish" | "unpublish" | "archive" | "unarchive" | "delete" | "set_category" | "add_tag" | "remove_tag"
export const BULK_ACTIONS: readonly BulkAction[] = ["publish", "unpublish", "archive", "unarchive", "delete", "set_category", "add_tag", "remove_tag"]

/** A category or a tag on a post, live and draft alike: a list action is meant for what visitors see too. */
async function retag(db: Db, creatorId: string, userId: string, row: Row, change: (m: SitePostMeta) => SitePostMeta): Promise<boolean> {
  const live = change(liveMetaOf(row))
  const patch: Row = { category_id: live.categoryId, tags: live.tags }
  if (row.draft_meta && typeof row.draft_meta === "object") patch.draft_meta = change(draftMetaOf(row))
  await writePost(db, creatorId, row, patch, userId)
  return row.status === "published"
}

export async function bulkPosts(db: Db, creatorId: string, userId: string, ids: string[], action: BulkAction, arg?: string | null): Promise<{ done: string[]; failed: { id: string; error: string }[]; liveChanged: boolean }> {
  if (!BULK_ACTIONS.includes(action)) throw new SiteBlogError(400, "Unknown action.")
  const list = [...new Set((Array.isArray(ids) ? ids : []).filter(isUuid))]
  if (list.length > MAX_BULK) throw new SiteBlogError(400, `At most ${MAX_BULK} posts at once.`)
  let categoryId: string | null = null
  if (action === "set_category" && arg) {
    if (!isUuid(arg)) throw new SiteBlogError(400, "Unknown category.")
    const { data, error } = await db.from("site_blog_categories").select("id").eq("creator_id", creatorId).eq("id", arg).maybeSingle()
    if (error) fail(error, "read the category")
    if (!data) throw new SiteBlogError(400, "Unknown category.")
    categoryId = arg
  }
  const tag = action === "add_tag" || action === "remove_tag" ? cleanTag(arg ?? "") : ""
  if ((action === "add_tag" || action === "remove_tag") && !tag) throw new SiteBlogError(400, "Name the tag.")

  const done: string[] = []
  const failed: { id: string; error: string }[] = []
  let liveChanged = false
  for (const id of list) {
    try {
      let changed = false
      if (action === "publish") changed = (await publishPost(db, creatorId, userId, id, { mode: "publish" })).liveChanged
      else if (action === "unpublish") changed = (await unpublishPost(db, creatorId, userId, id)).liveChanged
      else if (action === "archive") changed = (await archivePost(db, creatorId, userId, id)).liveChanged
      else if (action === "unarchive") changed = (await unarchivePost(db, creatorId, userId, id)).liveChanged
      else if (action === "delete") changed = (await deletePost(db, creatorId, userId, id)).liveChanged
      else {
        const row = await mustPostRow(db, creatorId, id)
        changed = await retag(db, creatorId, userId, row, (m) =>
          action === "set_category"
            ? { ...m, categoryId }
            : action === "add_tag"
              ? { ...m, tags: m.tags.includes(tag) ? m.tags : [...m.tags, tag].slice(0, 20) }
              : { ...m, tags: m.tags.filter((t) => t !== tag) },
        )
      }
      liveChanged ||= changed
      done.push(id)
    } catch (e) {
      if (e instanceof SiteBlogError && e.status === 503) throw e
      failed.push({ id, error: e instanceof Error ? e.message : "Failed" })
    }
  }
  for (const id of (Array.isArray(ids) ? ids : []).filter((x) => !isUuid(x))) failed.push({ id: String(id).slice(0, 60), error: "Post not found." })
  return { done, failed, liveChanged }
}

/* ── Revisions ───────────────────────────────────────────────────────────── */

export async function listRevisions(db: Db, creatorId: string, postId: string): Promise<{ id: string; kind: RevisionKind; createdAt: string; title: string }[]> {
  if (!isUuid(postId)) return []
  const { data, error } = await db.from("site_blog_post_revisions").select("id, kind, created_at, meta").eq("creator_id", creatorId).eq("post_id", postId).order("created_at", { ascending: false }).limit(REVISION_CAP)
  if (error) fail(error, "list the revisions")
  return ((data ?? []) as Row[]).map((r) => ({ id: r.id, kind: r.kind, createdAt: r.created_at, title: typeof r.meta?.title === "string" ? r.meta.title : "" }))
}

/** A revision back in the editor: into the draft of a published post, into the post itself otherwise. Visitors see it after Update. */
export async function restoreRevision(db: Db, creatorId: string, userId: string, postId: string, revisionId: string): Promise<AdminPost> {
  const row = await mustPostRow(db, creatorId, postId)
  if (!isUuid(revisionId)) throw new SiteBlogError(404, "Revision not found.")
  const { data, error } = await db.from("site_blog_post_revisions").select("meta, content").eq("creator_id", creatorId).eq("post_id", row.id).eq("id", revisionId).maybeSingle()
  if (error) fail(error, "read the revision")
  if (!data) throw new SiteBlogError(404, "Revision not found.")
  const rev = data as Row
  const saved = await savePostDraft(db, creatorId, userId, row.id, { meta: rev.meta, blocks: rev.content, version: Number(row.version) })
  if (!saved.ok) {
    if (saved.status === 409) throw new SiteBlogError(409, "This post was changed somewhere else.", saved.current)
    throw new SiteBlogError(saved.status, saved.error)
  }
  await writeRevision(db, creatorId, userId, row.id, "restore", saved.post.meta, saved.post.blocks)
  return saved.post
}

/* ── Categories ──────────────────────────────────────────────────────────── */

function categoryOf(r: Row): SiteBlogCategory {
  return { id: r.id, slug: r.slug, name: r.name, description: r.description ?? "", sortOrder: Number(r.sort_order) || 0, seoTitle: r.seo_title ?? "", seoDescription: r.seo_description ?? "" }
}

export async function listCategories(db: Db, creatorId: string): Promise<SiteBlogCategory[]> {
  const [cats, posts] = await Promise.all([
    db.from("site_blog_categories").select("*").eq("creator_id", creatorId).order("sort_order", { ascending: true }).order("name", { ascending: true }).limit(1000),
    db.from("site_blog_posts").select("category_id").eq("creator_id", creatorId).neq("status", "archived").not("category_id", "is", null).limit(20000),
  ])
  if (cats.error) fail(cats.error, "list the categories")
  const counts = new Map<string, number>()
  for (const p of (posts.data ?? []) as Row[]) counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1)
  return ((cats.data ?? []) as Row[]).map((r) => ({ ...categoryOf(r), postCount: counts.get(r.id) ?? 0 }))
}

export async function saveCategory(db: Db, creatorId: string, input: Partial<SiteBlogCategory> & { id?: string }): Promise<SiteBlogCategory> {
  let base: Partial<SiteBlogCategory> = {}
  if (input.id !== undefined) {
    if (!isUuid(input.id)) throw new SiteBlogError(404, "Category not found.")
    const { data, error } = await db.from("site_blog_categories").select("*").eq("creator_id", creatorId).eq("id", input.id).maybeSingle()
    if (error) fail(error, "read the category")
    if (!data) throw new SiteBlogError(404, "Category not found.")
    base = categoryOf(data as Row)
    /* A rename keeps the address unless a new one is given. */
    if (input.slug === undefined) input = { ...input, slug: base.slug }
  }
  const c = sanitizeCategoryInput({ ...base, ...input })
  if (!c.name) throw new SiteBlogError(400, "Name the category.")
  if (!c.slug) throw new SiteBlogError(400, "Give the category an address of letters, numbers and dashes.")
  const row = { name: c.name, slug: c.slug, description: c.description, sort_order: c.sortOrder, seo_title: c.seoTitle || null, seo_description: c.seoDescription || null }
  const q = input.id
    ? db.from("site_blog_categories").update(row).eq("creator_id", creatorId).eq("id", input.id).select("*").single()
    : db.from("site_blog_categories").insert({ ...row, creator_id: creatorId }).select("*").single()
  const { data, error } = await q
  if (error || !data) {
    if (error?.code === "23505") throw new SiteBlogError(400, "Another category already uses that address.")
    fail(error, "save the category")
  }
  return categoryOf(data as Row)
}

/** Its posts keep going, with no category (the column is ON DELETE SET NULL). */
export async function deleteCategory(db: Db, creatorId: string, id: string): Promise<void> {
  if (!isUuid(id)) throw new SiteBlogError(404, "Category not found.")
  const { data, error } = await db.from("site_blog_categories").delete().eq("creator_id", creatorId).eq("id", id).select("id")
  if (error) fail(error, "delete the category")
  if (!(data ?? []).length) throw new SiteBlogError(404, "Category not found.")
}

/* ── Authors ─────────────────────────────────────────────────────────────── */

function authorOf(r: Row): SiteBlogAuthor {
  const links = Array.isArray(r.links) ? (r.links as Row[]).filter((l) => l && typeof l.url === "string").map((l) => ({ label: String(l.label ?? ""), url: l.url as string })) : []
  return { id: r.id, slug: r.slug, name: r.name, role: r.role ?? "", bio: r.bio ?? "", avatarUrl: r.avatar_url ?? "", links }
}

export async function listAuthors(db: Db, creatorId: string): Promise<SiteBlogAuthor[]> {
  const { data, error } = await db.from("site_blog_authors").select("*").eq("creator_id", creatorId).order("name", { ascending: true }).limit(500)
  if (error) fail(error, "list the authors")
  return ((data ?? []) as Row[]).map(authorOf)
}

export async function saveAuthor(db: Db, creatorId: string, input: Partial<SiteBlogAuthor> & { id?: string }): Promise<SiteBlogAuthor> {
  let base: Partial<SiteBlogAuthor> = {}
  if (input.id !== undefined) {
    if (!isUuid(input.id)) throw new SiteBlogError(404, "Author not found.")
    const { data, error } = await db.from("site_blog_authors").select("*").eq("creator_id", creatorId).eq("id", input.id).maybeSingle()
    if (error) fail(error, "read the author")
    if (!data) throw new SiteBlogError(404, "Author not found.")
    base = authorOf(data as Row)
    if (input.slug === undefined) input = { ...input, slug: base.slug }
  }
  const a = sanitizeAuthorInput({ ...base, ...input })
  if (!a.name) throw new SiteBlogError(400, "Name the author.")
  if (!a.slug) throw new SiteBlogError(400, "Give the author an address of letters, numbers and dashes.")
  const row = { name: a.name, slug: a.slug, role: a.role || null, bio: a.bio || null, avatar_url: a.avatarUrl || null, links: a.links }
  const q = input.id
    ? db.from("site_blog_authors").update(row).eq("creator_id", creatorId).eq("id", input.id).select("*").single()
    : db.from("site_blog_authors").insert({ ...row, creator_id: creatorId }).select("*").single()
  const { data, error } = await q
  if (error || !data) {
    if (error?.code === "23505") throw new SiteBlogError(400, "Another author already uses that address.")
    fail(error, "save the author")
  }
  return authorOf(data as Row)
}

export async function deleteAuthor(db: Db, creatorId: string, id: string): Promise<void> {
  if (!isUuid(id)) throw new SiteBlogError(404, "Author not found.")
  const { data, error } = await db.from("site_blog_authors").delete().eq("creator_id", creatorId).eq("id", id).select("id")
  if (error) fail(error, "delete the author")
  if (!(data ?? []).length) throw new SiteBlogError(404, "Author not found.")
}

/* ── The blog's own settings ─────────────────────────────────────────────── */

export function defaultBlogSettings(): SiteBlogSettings {
  return { handle: DEFAULT_BLOG_HANDLE, previousHandles: [], title: "Blog", description: "", postsPerPage: 12, seoTitle: "", seoDescription: "", ogImageUrl: "" }
}

export function settingsOf(r: Row | null): SiteBlogSettings {
  if (!r) return defaultBlogSettings()
  return {
    handle: r.handle || DEFAULT_BLOG_HANDLE,
    previousHandles: Array.isArray(r.previous_handles) ? r.previous_handles : [],
    title: r.title ?? "Blog",
    description: r.description ?? "",
    postsPerPage: Number(r.posts_per_page) || 12,
    seoTitle: r.seo_title ?? "",
    seoDescription: r.seo_description ?? "",
    ogImageUrl: r.og_image_url ?? "",
  }
}

export async function getBlogSettings(db: Db, creatorId: string): Promise<SiteBlogSettings> {
  const { data, error } = await db.from("site_blog_settings").select("*").eq("creator_id", creatorId).maybeSingle()
  if (error) fail(error, "read the blog")
  return settingsOf((data as Row | null) ?? null)
}

/** Only the fields given change. A new handle keeps the old one in previous_handles, which the site answers with a 308 to the new one. */
export async function saveBlogSettings(db: Db, creatorId: string, input: Partial<SiteBlogSettings>): Promise<SiteBlogSettings> {
  const current = await getBlogSettings(db, creatorId)
  const clean = sanitizeBlogSettingsInput(input)
  if (input && typeof input.handle === "string" && input.handle.trim() && !clean.handle) throw new SiteBlogError(400, "The blog's address takes letters, numbers and dashes.")
  const next: SiteBlogSettings = { ...current, ...clean }
  if (clean.handle && clean.handle !== current.handle) next.previousHandles = [current.handle, ...current.previousHandles.filter((h) => h !== current.handle)].filter((h) => h !== clean.handle).slice(0, 20)
  else next.previousHandles = current.previousHandles.filter((h) => h !== next.handle)
  const row = {
    creator_id: creatorId,
    handle: next.handle,
    previous_handles: next.previousHandles,
    title: next.title,
    description: next.description,
    posts_per_page: next.postsPerPage,
    seo_title: next.seoTitle || null,
    seo_description: next.seoDescription || null,
    og_image_url: next.ogImageUrl || null,
  }
  const { data, error } = await db.from("site_blog_settings").upsert(row, { onConflict: "creator_id" }).select("*").single()
  if (error || !data) fail(error, "save the blog")
  return settingsOf(data as Row)
}

/** Every tag the store's posts use (archived ones aside), sorted. */
export async function allTags(db: Db, creatorId: string): Promise<string[]> {
  const { data, error } = await db.from("site_blog_posts").select("tags, draft_meta").eq("creator_id", creatorId).neq("status", "archived").limit(20000)
  if (error) fail(error, "list the tags")
  const set = new Set<string>()
  for (const r of (data ?? []) as Row[]) {
    for (const t of Array.isArray(r.tags) ? r.tags : []) if (typeof t === "string" && t) set.add(t)
    for (const t of Array.isArray(r.draft_meta?.tags) ? r.draft_meta.tags : []) if (typeof t === "string" && t) set.add(cleanTag(t))
  }
  set.delete("")
  return [...set].sort((a, b) => a.localeCompare(b))
}
