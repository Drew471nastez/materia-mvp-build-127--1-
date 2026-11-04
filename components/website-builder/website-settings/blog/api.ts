/**
 * The Blog screen's calls to its routes (app/api/website-builder/themes/
 * [installId]/blog/**), typed by lib/site-blog/types.ts. Every call answers
 * the route's body or throws a BlogApiError that says why: the route's own
 * words, "offline", or `sql` when the tables of SQL part 355 are not there
 * yet (the routes answer 503 { sql: 355 }).
 *
 * A post's save is the one call that does not throw on a refusal: a 409 is
 * an answer the editor acts on (someone else saved since), so it comes back
 * as `{ ok: false, conflict }` with the post as it is now.
 */
import type {
  AdminPost,
  AdminPostSummary,
  BlogTemplateKeys,
  SiteBlogAuthor,
  SiteBlogCategory,
  SiteBlogSettings,
  SitePostMeta,
  SitePostStatus,
  SiteBlock,
} from "@/lib/site-blog/types"
import { tt } from "@/lib/i18n/text"

export type PostCounts = Record<"all" | SitePostStatus, number>
export type PostStatusFilter = "all" | SitePostStatus
export type PostSort = "updated" | "published" | "title"

export interface BlogOverview {
  settings: SiteBlogSettings
  categories: SiteBlogCategory[]
  authors: SiteBlogAuthor[]
  tags: string[]
  counts: PostCounts
  templates: BlogTemplateKeys
  /** The site's origin, its own domain when it has one: a post's address is liveBase + its path. */
  liveBase: string
}

export interface PostQuery {
  search?: string
  status?: PostStatusFilter
  categoryId?: string
  tag?: string
  authorId?: string
  sort?: PostSort
  page?: number
}

export interface PostPage {
  posts: AdminPostSummary[]
  total: number
  counts: PostCounts
}

export type PostAction = "publish" | "schedule" | "update" | "unpublish" | "archive" | "unarchive" | "duplicate"
export type BulkAction = "publish" | "unpublish" | "archive" | "unarchive" | "delete" | "set_category" | "add_tag" | "remove_tag"

export interface RevisionRow {
  id: string
  kind: "save" | "publish" | "update" | "schedule" | "unpublish" | "restore"
  createdAt: string
  title: string
}

export type CategoryInput = Partial<Pick<SiteBlogCategory, "name" | "slug" | "description" | "sortOrder" | "seoTitle" | "seoDescription">>
export type AuthorInput = Partial<Pick<SiteBlogAuthor, "name" | "slug" | "role" | "bio" | "avatarUrl" | "links">>

/** Posts on one page of the list. The route's own page size wins when it says one. */
export const POSTS_PER_PAGE = 20

export class BlogApiError extends Error {
  /** 0 when nothing answered. */
  readonly status: number
  /** The blog's tables are not there yet: SQL part 355 has not been run. */
  readonly sql: boolean
  constructor(message: string, status: number, sql = false) {
    super(message)
    this.name = "BlogApiError"
    this.status = status
    this.sql = sql
  }
}

export const isSqlMissing = (e: unknown): boolean => e instanceof BlogApiError && e.sql

const base = (installId: string) => `/api/website-builder/themes/${encodeURIComponent(installId)}/blog`

/** The query string the posts route reads: only what is set, in a fixed order. */
export function postsQueryString(q: PostQuery): string {
  const p = new URLSearchParams()
  const search = (q.search ?? "").trim()
  if (search) p.set("q", search)
  if (q.status && q.status !== "all") p.set("status", q.status)
  if (q.categoryId) p.set("category", q.categoryId)
  if (q.tag) p.set("tag", q.tag)
  if (q.authorId) p.set("author", q.authorId)
  if (q.sort && q.sort !== "updated") p.set("sort", q.sort)
  if (q.page && q.page > 1) p.set("page", String(Math.floor(q.page)))
  p.set("perPage", String(POSTS_PER_PAGE))
  return `?${p.toString()}`
}

/** What a refusal says: the route's words, else a sentence for its status. */
export function refusalMessage(status: number, data: unknown): string {
  const said = data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string" ? (data as { error: string }).error : ""
  if (said) return said
  if (status === 401) return tt("You were signed out. Sign in again in another tab, then try again.")
  if (status === 403) return tt("You do not have access to this website's blog.")
  if (status === 404) return tt("That post is gone. It may have been deleted in another tab.")
  if (status === 413) return tt("This post is too large to save. Split it into two posts.")
  if (status === 429) return tt("Too many changes at once. Wait a moment and try again.")
  return tt("Something went wrong. Try again.")
}

const sqlOf = (status: number, data: unknown) => status === 503 && !!data && typeof data === "object" && (data as { sql?: unknown }).sql === 355

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, { cache: "no-store", ...init, headers: init?.body ? { "Content-Type": "application/json", ...(init.headers ?? {}) } : init?.headers })
  } catch {
    throw new BlogApiError(tt("You are offline or the server did not answer."), 0)
  }
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) throw new BlogApiError(sqlOf(res.status, data) ? tt("Blog turns on after the database update (SQL part 355).") : refusalMessage(res.status, data), res.status, sqlOf(res.status, data))
  return data as T
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })

/* ── The blog ──────────────────────────────────────────────────────────── */

export const getBlog = (installId: string) => call<BlogOverview>(base(installId))

export const saveBlogSettings = (installId: string, settings: Partial<SiteBlogSettings>) =>
  call<{ settings: SiteBlogSettings }>(base(installId), json("PATCH", { settings })).then((r) => r.settings)

/* ── Posts ─────────────────────────────────────────────────────────────── */

export const listPosts = (installId: string, q: PostQuery) => call<PostPage>(`${base(installId)}/posts${postsQueryString(q)}`)

export const createPost = (installId: string, init: { meta?: Partial<SitePostMeta>; blocks?: SiteBlock[] } = {}) =>
  call<{ post: AdminPost }>(`${base(installId)}/posts`, json("POST", init)).then((r) => r.post)

export const getPost = (installId: string, postId: string) => call<{ post: AdminPost }>(`${base(installId)}/posts/${encodeURIComponent(postId)}`).then((r) => r.post)

export const deletePost = (installId: string, postId: string) => call<{ ok?: boolean }>(`${base(installId)}/posts/${encodeURIComponent(postId)}`, { method: "DELETE" })

export type SaveAnswer =
  | { ok: true; post: AdminPost }
  | { ok: false; conflict: AdminPost | null }
  | { ok: false; error: string; status: number; sql: boolean; retry: boolean }

/** One autosave or Cmd+S: the draft and the version it was edited from. */
export async function savePostDraft(installId: string, postId: string, body: { meta: SitePostMeta; blocks: SiteBlock[]; version: number }): Promise<SaveAnswer> {
  let res: Response
  try {
    res = await fetch(`${base(installId)}/posts/${encodeURIComponent(postId)}`, { method: "PUT", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  } catch {
    return { ok: false, error: tt("You are offline or the server did not answer."), status: 0, sql: false, retry: true }
  }
  const data = (await res.json().catch(() => null)) as { post?: AdminPost; current?: AdminPost; error?: string } | null
  if (res.ok && data?.post) return { ok: true, post: data.post }
  if (res.status === 409) return { ok: false, conflict: data?.current ?? null }
  const sql = sqlOf(res.status, data)
  return {
    ok: false,
    error: sql ? tt("Blog turns on after the database update (SQL part 355).") : refusalMessage(res.status, data),
    status: res.status,
    sql,
    /* Worth trying again by itself: nothing answered, the server stumbled, or a sign in that may come back. */
    retry: !sql && (res.status === 401 || res.status === 429 || res.status >= 500),
  }
}

export const postAction = (installId: string, postId: string, action: PostAction, opts: { publishAt?: string | null; version?: number } = {}) =>
  call<{ post: AdminPost }>(`${base(installId)}/posts/${encodeURIComponent(postId)}/actions`, json("POST", { action, ...opts })).then((r) => r.post)

export const bulkPosts = (installId: string, ids: string[], action: BulkAction, arg?: string | null) =>
  call<{ done: string[]; failed: { id: string; error: string }[] }>(`${base(installId)}/posts/bulk`, json("POST", { ids, action, arg: arg ?? null }))

export const listRevisions = (installId: string, postId: string) =>
  call<{ revisions: RevisionRow[] }>(`${base(installId)}/posts/${encodeURIComponent(postId)}/revisions`).then((r) => r.revisions)

export const restoreRevision = (installId: string, postId: string, revisionId: string) =>
  call<{ post: AdminPost }>(`${base(installId)}/posts/${encodeURIComponent(postId)}/revisions/${encodeURIComponent(revisionId)}`, { method: "POST" }).then((r) => r.post)

export const previewPost = (installId: string, postId: string) =>
  call<{ url: string }>(`${base(installId)}/posts/${encodeURIComponent(postId)}/preview`, { method: "POST" }).then((r) => r.url)

/** A picture on another site copied into the website's own files, for a pasted address. */
export const copyImage = (installId: string, url: string) => call<{ url: string }>(`${base(installId)}/copy-image`, json("POST", { url })).then((r) => r.url)

/* ── Categories and authors ────────────────────────────────────────────── */

export const listCategories = (installId: string) => call<{ categories: SiteBlogCategory[] }>(`${base(installId)}/categories`).then((r) => r.categories)
export const createCategory = (installId: string, input: CategoryInput) => call<{ category: SiteBlogCategory }>(`${base(installId)}/categories`, json("POST", input)).then((r) => r.category)
export const updateCategory = (installId: string, id: string, input: CategoryInput) =>
  call<{ category: SiteBlogCategory }>(`${base(installId)}/categories/${encodeURIComponent(id)}`, json("PATCH", input)).then((r) => r.category)
export const deleteCategory = (installId: string, id: string) => call<{ ok?: boolean }>(`${base(installId)}/categories/${encodeURIComponent(id)}`, { method: "DELETE" })

export const listAuthors = (installId: string) => call<{ authors: SiteBlogAuthor[] }>(`${base(installId)}/authors`).then((r) => r.authors)
export const createAuthor = (installId: string, input: AuthorInput) => call<{ author: SiteBlogAuthor }>(`${base(installId)}/authors`, json("POST", input)).then((r) => r.author)
export const updateAuthor = (installId: string, id: string, input: AuthorInput) =>
  call<{ author: SiteBlogAuthor }>(`${base(installId)}/authors/${encodeURIComponent(id)}`, json("PATCH", input)).then((r) => r.author)
export const deleteAuthor = (installId: string, id: string) => call<{ ok?: boolean }>(`${base(installId)}/authors/${encodeURIComponent(id)}`, { method: "DELETE" })
