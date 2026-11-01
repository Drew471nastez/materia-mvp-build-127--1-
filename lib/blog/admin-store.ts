import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

import type { Block } from "./blocks"
import { DEFAULT_BYLINE, editorStateFromRow, liveColumns, metaFromRow, normalizeBlocks, normalizeMeta, slugify, type PostMeta } from "./editor-model"
import { REVISION_CAP, editVersion, isStaleSave, revisionsToPrune, slugChangePlan } from "./save-rules"
import { isPostLive, postStatus, type BlogPostStatus } from "./schedule"

/**
 * ===========================================================================
 *  THE ADMIN'S READS AND WRITES OF THE BLOG
 * ===========================================================================
 * Everything app/api/admin/blog and the /admin/blog pages do to the tables,
 * in one place, with the service role. Every caller has already asked for
 * the admin session (lib/admin/gate.ts); nothing here asks again.
 *
 * WITH OR WITHOUT SQL PART 345. blogSchema() looks once a minute for what
 * part 345 adds. Without it a save writes the columns the table always had,
 * a live post is saved straight to its page (there is no draft copy to save
 * into), and history, redirects, snippets, authors and the managed
 * categories are off, each with a note in the admin saying which part turns
 * it on.
 */

export type Supa = ReturnType<typeof createAdminClient>
type Row = Record<string, unknown>

/* ── Is part 345 there ───────────────────────────────────────────────────── */

export function isMissingSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return ["42P01", "42703", "PGRST204", "PGRST205", "PGRST200"].includes(error.code ?? "") || /does not exist|schema cache|Could not find/i.test(error.message ?? "")
}

let cached: { full: boolean; at: number } | null = null

/** Whether SQL part 345 has run: its draft column and its revisions table both answer. Asked at most once a minute. */
export async function blogSchema(supabase: Supa): Promise<{ full: boolean }> {
  if (cached && Date.now() - cached.at < 60_000) return { full: cached.full }
  const [col, table] = await Promise.all([
    supabase.from("blog_posts").select("draft_saved_at").limit(1),
    supabase.from("blog_post_revisions").select("id").limit(1),
  ])
  const full = !col.error && !table.error
  if (!full && !isMissingSchema(col.error) && !isMissingSchema(table.error)) {
    /* Some other failure: say no for now, and ask again on the next call. */
    return { full: false }
  }
  cached = { full, at: Date.now() }
  return { full }
}

export const NEEDS_345 = "Run SQL part 345 (Admin › SQL updates) to turn this on."

/* ── What the admin is shown of a post ───────────────────────────────────── */

export interface AdminPostView {
  id: string
  meta: PostMeta
  blocks: Block[]
  /** What is live, for the slug warning and the list. */
  live: { slug: string; title: string; published_at: string | null; is_published: boolean }
  status: BlogPostStatus
  /** A live or scheduled post whose draft differs from what is live. */
  hasDraft: boolean
  version: string | null
  updated_at: string | null
  draft_saved_at: string | null
  created_at: string | null
}

export function adminView(row: Row): AdminPostView {
  const state = editorStateFromRow(row)
  return {
    id: String(row.id),
    meta: state.meta,
    blocks: state.blocks,
    live: { slug: String(row.slug ?? ""), title: String(row.title ?? ""), published_at: (row.published_at as string) ?? null, is_published: row.is_published === true },
    status: postStatus(row as { is_published?: boolean; published_at?: string }),
    hasDraft: row.is_published === true && state.hasDraft,
    version: editVersion(row),
    updated_at: (row.updated_at as string) ?? null,
    draft_saved_at: (row.draft_saved_at as string) ?? null,
    created_at: (row.created_at as string) ?? null,
  }
}

export interface AdminListRow {
  id: string
  slug: string
  title: string
  category: string
  author: string
  author_id: string | null
  status: BlogPostStatus
  published_at: string | null
  edited_at: string | null
  views: number
  cover_image_url: string | null
  hasDraft: boolean
  tags: string[]
}

const LIST_BASE = "id, slug, title, category, is_published, published_at, views, created_at, updated_at, cover_image_url, author_name"
const LIST_FULL = `${LIST_BASE}, author_id, tags, draft_saved_at, draft_meta`

/** Every post, light columns only, newest edit first. The list page reads this on the server, so it draws on the first paint. */
export async function listAdminPosts(supabase: Supa, full: boolean): Promise<{ rows: AdminListRow[]; error: string | null }> {
  const { data, error } = await supabase.from("blog_posts").select(full ? LIST_FULL : LIST_BASE).order("updated_at", { ascending: false }).range(0, 1999)
  if (error) return { rows: [], error: "The posts could not be read." }
  const now = Date.now()
  const rows = ((data ?? []) as unknown as Row[]).map((r) => {
    const draft = (r.draft_meta as Partial<PostMeta> | null) ?? null
    const edited = [r.draft_saved_at, r.updated_at].filter(Boolean).sort().pop() as string | undefined
    return {
      id: String(r.id),
      slug: String(r.slug ?? ""),
      title: String((r.is_published && draft?.title) || r.title || ""),
      category: String(r.category ?? ""),
      author: String(r.author_name ?? "") || DEFAULT_BYLINE,
      author_id: (r.author_id as string) ?? null,
      status: postStatus(r as { is_published?: boolean; published_at?: string }, now),
      published_at: (r.published_at as string) ?? null,
      edited_at: edited ?? (r.created_at as string) ?? null,
      views: Number(r.views ?? 0),
      cover_image_url: (r.cover_image_url as string) ?? null,
      hasDraft: r.is_published === true && Boolean(draft),
      tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    }
  })
  rows.sort((a, b) => (b.edited_at ?? "").localeCompare(a.edited_at ?? ""))
  return { rows, error: null }
}

export async function readAdminPost(supabase: Supa, id: string): Promise<Row | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { data } = await supabase.from("blog_posts").select("*").eq("id", id).maybeSingle()
  return (data as Row | null) ?? null
}

/* ── Lookups the editor needs, read once with the page ───────────────────── */

export interface BlogCategory { id: string | null; slug: string; name: string; description: string; posts?: number }
export interface BlogAuthor { id: string; slug: string; name: string; role: string; bio: string; avatar_url: string | null; links: { label: string; url: string }[]; posts?: number }
export interface BlogSnippet { id: string; name: string; blocks: Block[]; updated_at: string | null }

export async function readCategories(supabase: Supa, full: boolean, fallback: readonly string[]): Promise<BlogCategory[]> {
  if (full) {
    const { data, error } = await supabase.from("blog_categories").select("id, slug, name, description, sort_order").order("sort_order").order("name")
    if (!error && data) return data.map((c) => ({ id: c.id as string, slug: c.slug as string, name: c.name as string, description: (c.description as string) ?? "" }))
  }
  return fallback.map((name) => ({ id: null, slug: slugify(name), name, description: "" }))
}

export async function readAuthors(supabase: Supa, full: boolean): Promise<BlogAuthor[]> {
  if (!full) return []
  const { data, error } = await supabase.from("blog_authors").select("id, slug, name, role, bio, avatar_url, links").order("name")
  if (error || !data) return []
  return data.map((a) => ({ id: a.id as string, slug: a.slug as string, name: a.name as string, role: (a.role as string) ?? "", bio: (a.bio as string) ?? "", avatar_url: (a.avatar_url as string) ?? null, links: Array.isArray(a.links) ? (a.links as BlogAuthor["links"]) : [] }))
}

export async function readSnippets(supabase: Supa, full: boolean): Promise<BlogSnippet[]> {
  if (!full) return []
  const { data, error } = await supabase.from("blog_snippets").select("id, name, blocks, updated_at").order("name")
  if (error || !data) return []
  return data.map((s) => ({ id: s.id as string, name: s.name as string, blocks: normalizeBlocks(s.blocks), updated_at: (s.updated_at as string) ?? null }))
}

/** Every tag in use, most used first, for the editor's suggestions. */
export async function readTagSuggestions(supabase: Supa, full: boolean): Promise<string[]> {
  if (!full) return []
  const { data, error } = await supabase.from("blog_posts").select("tags").range(0, 1999)
  if (error || !data) return []
  const count = new Map<string, number>()
  for (const r of data) for (const t of (r.tags as string[]) ?? []) count.set(t, (count.get(t) ?? 0) + 1)
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 200)
}

/** The byline written beside an author profile: "Name - Role", which the article splits back into a Person and a jobTitle. */
export function bylineOf(a: Pick<BlogAuthor, "name" | "role">): string {
  return a.role ? `${a.name} - ${a.role}` : a.name
}

/* ── Saving ──────────────────────────────────────────────────────────────── */

export type SaveAction = "autosave" | "save" | "publish" | "update" | "unpublish"
export const SAVE_ACTIONS: SaveAction[] = ["autosave", "save", "publish", "update", "unpublish"]

export type SaveResult =
  | { ok: true; before: Row; row: Row; liveChanged: boolean; oldSlug: string | null }
  | { ok: false; status: number; error: string; code?: string; current?: AdminPostView }

/** A free slug: `wanted`, or `wanted-2`, `wanted-3`… when another post has it. */
export async function freeSlug(supabase: Supa, wanted: string, exceptId?: string): Promise<string> {
  const base = wanted || `post-${Date.now().toString(36)}`
  const { data } = await supabase.from("blog_posts").select("id, slug").like("slug", `${base}%`).range(0, 199)
  const taken = new Set((data ?? []).filter((r) => r.id !== exceptId).map((r) => r.slug as string))
  if (!taken.has(base)) return base
  for (let n = 2; n < 500; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
  return `${base}-${Date.now().toString(36)}`
}

async function slugTaken(supabase: Supa, slug: string, id: string): Promise<boolean> {
  const { data } = await supabase.from("blog_posts").select("id").eq("slug", slug).neq("id", id).limit(1)
  return Boolean(data?.length)
}

/** The publish date: the one asked for, else the one the post already had if it has passed, else now. */
export function publishDate(asked: unknown, previous: string | null | undefined, now = Date.now()): string {
  if (typeof asked === "string" && asked) {
    const t = Date.parse(asked)
    if (Number.isFinite(t) && Math.abs(t - now) < 5 * 365 * 86400_000) return new Date(t).toISOString()
  }
  const p = previous ? Date.parse(previous) : NaN
  return Number.isFinite(p) && p <= now ? new Date(p).toISOString() : new Date(now).toISOString()
}

/**
 * One save of one post. The compare and the write are one step: the update
 * names the version it was made from, so of two saves sent at once from the
 * same version only one finds its row (lib/blog/save-rules.ts).
 */
export async function savePost(
  supabase: Supa,
  id: string,
  body: { action?: unknown; version?: unknown; meta?: unknown; blocks?: unknown; publish_at?: unknown; force?: unknown },
  full: boolean,
): Promise<SaveResult> {
  const action = SAVE_ACTIONS.includes(body.action as SaveAction) ? (body.action as SaveAction) : "save"
  const before = await readAdminPost(supabase, id)
  if (!before) return { ok: false, status: 404, error: "That post no longer exists." }
  const force = body.force === true
  const version = typeof body.version === "string" ? body.version : null
  if (isStaleSave(version, before as { draft_saved_at?: string; updated_at?: string }, force)) {
    return { ok: false, status: 409, code: "stale", error: "This post was changed somewhere else after you opened it.", current: adminView(before) }
  }

  const current = editorStateFromRow(before)
  const meta = body.meta === undefined ? current.meta : normalizeMeta(body.meta as Partial<PostMeta>, metaFromRow(before))
  const blocks = body.blocks === undefined ? current.blocks : normalizeBlocks(body.blocks)
  if (!meta.slug) meta.slug = slugify(meta.title) || String(before.slug)
  if (meta.slug !== before.slug && (await slugTaken(supabase, meta.slug, id))) {
    return { ok: false, status: 409, code: "slug_taken", error: `Another post already uses /blog/${meta.slug}. Pick a different address.` }
  }

  const wasPublished = before.is_published === true
  const now = new Date().toISOString()
  const update: Row = {}
  let liveChanged = false

  if (action === "autosave" || action === "save") {
    if (full) {
      update.draft_content = blocks
      update.draft_meta = meta
    }
    /* Nobody can see a draft post, so its live columns follow it; and before 345 there is no draft copy, so a live post's do too. */
    if (!wasPublished || !full) {
      Object.assign(update, liveColumns(meta, blocks, full))
      if (wasPublished) liveChanged = true
    }
  } else if (action === "publish" || action === "update") {
    Object.assign(update, liveColumns(meta, blocks, full))
    update.is_published = true
    if (action === "publish" || body.publish_at !== undefined) update.published_at = publishDate(body.publish_at, before.published_at as string | null)
    if (full) {
      update.draft_content = null
      update.draft_meta = null
    }
    liveChanged = true
  } else if (action === "unpublish") {
    update.is_published = false
    liveChanged = wasPublished
  }
  if (full) update.draft_saved_at = now

  const write = (seen: Row) => {
    let q = supabase.from("blog_posts").update(update).eq("id", id)
    if (!force) {
      /* The same version the check above read, so a save that landed in between finds no row. */
      if (full && seen.draft_saved_at) q = q.eq("draft_saved_at", seen.draft_saved_at as string)
      else if (full) q = q.is("draft_saved_at", null).eq("updated_at", seen.updated_at as string)
      else q = q.eq("updated_at", seen.updated_at as string)
    }
    return q.select().maybeSingle()
  }
  let { data, error } = await write(before)
  /* Before 345 a reader's view moves updated_at between the read and the write. When the post itself is unchanged, write again over the new updated_at. */
  for (let tries = 0; !full && !force && !error && !data && tries < 2; tries++) {
    const fresh = await readAdminPost(supabase, id)
    if (!fresh || editVersion(fresh) !== editVersion(before)) break
    ;({ data, error } = await write(fresh))
  }
  if (error) {
    if (error.code === "23505") return { ok: false, status: 409, code: "slug_taken", error: `Another post already uses /blog/${meta.slug}. Pick a different address.` }
    console.error("[admin] blog save:", error.message?.slice(0, 300))
    return { ok: false, status: 500, error: "Couldn't save. Nothing was changed." }
  }
  if (!data) {
    const fresh = await readAdminPost(supabase, id)
    return { ok: false, status: 409, code: "stale", error: "This post was changed somewhere else after you opened it.", current: fresh ? adminView(fresh) : undefined }
  }
  const row = data as Row

  /* A live address that moved leaves a redirect behind. Only a post that was live: a draft's slug changes as its title is typed, and nobody has its address yet. */
  const oldSlug = String(before.slug ?? "")
  const wasLive = isPostLive({ is_published: wasPublished, published_at: before.published_at as string | null })
  if (full && liveChanged && wasLive && row.slug !== oldSlug) await recordSlugChange(supabase, id, oldSlug, String(row.slug))

  if (full && action !== "autosave") await writeRevision(supabase, id, action === "save" ? "save" : action, meta, blocks)
  return { ok: true, before, row, liveChanged, oldSlug: oldSlug !== row.slug ? oldSlug : null }
}

/** blog_redirects for a slug that moved: lib/blog/save-rules.ts slugChangePlan. A failure is logged, never a failed save. */
export async function recordSlugChange(supabase: Supa, postId: string, from: string, to: string): Promise<void> {
  const plan = slugChangePlan(from, to)
  if (!plan) return
  try {
    await supabase.from("blog_redirects").delete().eq("from_slug", plan.deleteFrom)
    await supabase.from("blog_redirects").update({ to_slug: plan.upsert.to_slug }).eq("to_slug", plan.repointFrom)
    await supabase.from("blog_redirects").upsert({ ...plan.upsert, post_id: postId }, { onConflict: "from_slug" })
  } catch (e) {
    console.error("[admin] blog redirect not recorded:", (e as Error).message)
  }
}

export async function writeRevision(supabase: Supa, postId: string, kind: string, meta: PostMeta, blocks: Block[]): Promise<void> {
  try {
    await supabase.from("blog_post_revisions").insert({ post_id: postId, kind, title: meta.title, content: blocks, meta, created_by: "admin" })
    const { data } = await supabase.from("blog_post_revisions").select("id").eq("post_id", postId).order("created_at", { ascending: false }).range(0, REVISION_CAP + 49)
    const prune = revisionsToPrune((data ?? []).map((r) => r.id as string))
    if (prune.length) await supabase.from("blog_post_revisions").delete().in("id", prune)
  } catch (e) {
    console.error("[admin] blog revision not written:", (e as Error).message)
  }
}

/** A new post. Its slug is made free first; it starts as a draft unless `publish`. */
export async function createPost(supabase: Supa, body: { meta?: unknown; blocks?: unknown; action?: unknown; publish_at?: unknown }, full: boolean): Promise<{ ok: true; row: Row } | { ok: false; status: number; error: string }> {
  const meta = normalizeMeta(body.meta as Partial<PostMeta>)
  const blocks = normalizeBlocks(body.blocks)
  meta.slug = await freeSlug(supabase, meta.slug || slugify(meta.title))
  const publish = body.action === "publish"
  const insert: Row = { ...liveColumns(meta, blocks, full), is_published: publish, published_at: publish ? publishDate(body.publish_at, null) : null }
  if (full) insert.draft_saved_at = new Date().toISOString()
  const { data, error } = await supabase.from("blog_posts").insert([insert]).select().single()
  if (error) {
    console.error("[admin] blog create:", error.message?.slice(0, 300))
    return { ok: false, status: 500, error: "Couldn't create the post." }
  }
  if (full && body.action && body.action !== "autosave") await writeRevision(supabase, String(data.id), publish ? "publish" : "save", meta, blocks)
  return { ok: true, row: data as Row }
}
