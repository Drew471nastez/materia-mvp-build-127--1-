import "server-only"

/**
 * ===========================================================================
 *  WHERE A PICTURE IS ACTUALLY USED
 * ===========================================================================
 * Files removed a picture by deleting the storage object, which is the only
 * copy. A logo taken out of Files vanished from the store header, the
 * receipts, the checkout and the published website in the same second.
 *
 * This answers the question the delete never asked: who still points at this
 * object? Two gates, and both have to agree before any bytes go:
 *
 *   1. THIS FILE, by name. A written down list of every surface that stores
 *      a picture's address, with the table, the columns and how that table
 *      narrows to one store. It can say WHERE ("Store logo", "Website",
 *      "Product photos"), which is what the person deleting needs to read
 *      before they press the button, and it is pinned surface by surface in
 *      tests/files-retention.test.ts so a change to one cannot quietly break
 *      another.
 *
 *   2. public.storage_object_referenced (SQL part 18), in the database. It
 *      walks the catalogue instead of a list: every table in `public` with
 *      an owner column, the whole row as text, matched against the path. It
 *      is the backstop, because a surface nobody added to the list below is
 *      still a row with the path in it. It errs one way only: anything it
 *      cannot read counts as in use.
 *
 * So a surface missing from the list below can cost a name in the UI. It
 * cannot cost a file: `collectable` below needs gate 2 to say no as well,
 * and a database without gate 2 collects nothing at all.
 *
 * MATCHING. A row holds the address, not the path: Storelib's own
 * `https://storelib.com/media/<bucket>/<path>`, an older
 * `https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>`,
 * or, in a theme's own file, a bare path. All three contain the path, so the
 * path is what is looked for, in the forms an address can carry it (as it is,
 * and percent encoded the way the storage client writes it). Never the file
 * name alone: two stores both having `logo.png` is not a reference.
 */

import { posterPathFor } from "@/lib/media/video"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface Owner {
  userId: string
  creatorId: string
}

/** How a surface's rows narrow to one store. */
type Scope =
  /** The table has the column itself: `creator_id`, `user_id`, or `id` for creators and profiles. */
  | { kind: "own"; column: string | readonly string[]; owner: "creator" | "user" }
  /**
   * The table points at a parent that is narrowed in its own turn:
   * product_variants.product_id to products.creator_id, and one more hop for
   * lesson_attachments.lesson_id to course_lessons.course_id to
   * courses.creator_id.
   */
  | { kind: "via"; column: string; parent: string; parentScope: Scope }

export interface Surface {
  /** Stable key, used by the tests and the API. */
  key: string
  /** What the person reads: a place in their store, not a table name. */
  label: string
  table: string
  /** The columns that can hold an address. A JSON column is searched whole. */
  columns: string[]
  scope: Scope
  /** At most this many rows read for one question. */
  limit?: number
}

/**
 * EVERY SURFACE THAT STORES A PICTURE'S ADDRESS, as read out of the app
 * (`.from("<table>").select(...)` and the payloads written back). Grouped by
 * the place the owner would name, so two tables behind one screen share a
 * label.
 */
export const SURFACES: readonly Surface[] = [
  /* Settings › Store details: the picture on receipts, order emails and the checkout header (lib/store/settings-server.ts, lib/checkout/brand-server.ts). */
  { key: "store-logo", label: "Store logo, receipts and emails", table: "store_settings", columns: ["logo_url", "checkout", "legal"], scope: { kind: "own", column: "creator_id", owner: "creator" }, limit: 4 },
  /* The published website's theme: Branding › Logo, the favicon, the share image, and every section setting (lib/checkout/brand-server.ts, lib/website-builder). */
  { key: "website-theme", label: "Website theme", table: "store_theme_settings", columns: ["settings", "draft_settings"], scope: { kind: "via", column: "install_id", parent: "store_theme_installs", parentScope: { kind: "own", column: "creator_id", owner: "creator" } }, limit: 40 },
  /* The website's pages and their sections. */
  { key: "website-sections", label: "Website sections", table: "store_theme_pages", columns: ["sections", "draft_sections"], scope: { kind: "via", column: "install_id", parent: "store_theme_installs", parentScope: { kind: "own", column: "creator_id", owner: "creator" } }, limit: 200 },
  { key: "website-install", label: "Website", table: "store_theme_installs", columns: ["sections", "settings", "draft_sections", "draft_settings", "snapshot_url"], scope: { kind: "own", column: "creator_id", owner: "creator" }, limit: 40 },
  /* A theme's own files: an imported theme keeps its asset map and its CSS here, both of which can name a picture. */
  { key: "website-files", label: "Website files", table: "store_theme_custom_files", columns: ["content", "draft_content"], scope: { kind: "via", column: "install_id", parent: "store_theme_installs", parentScope: { kind: "own", column: "creator_id", owner: "creator" } }, limit: 400 },
  /* The store builder's own surface (the creator page and the storefront header). */
  { key: "store-builder", label: "Store page", table: "store_builder_configs", columns: ["draft_config", "published_config", "sections", "settings"], scope: { kind: "own", column: "creator_id", owner: "creator" }, limit: 10 },
  { key: "creator-page", label: "Store page", table: "creators", columns: ["avatar_url", "cover_url", "draft_config", "published_config"], scope: { kind: "own", column: "id", owner: "creator" }, limit: 2 },
  /* Sites: the newer website surface and the files published with it. */
  { key: "site", label: "Website", table: "sites", columns: ["settings"], scope: { kind: "own", column: "creator_id", owner: "creator" }, limit: 40 },
  { key: "site-assets", label: "Website files", table: "site_assets", columns: ["url"], scope: { kind: "via", column: "site_id", parent: "sites", parentScope: { kind: "own", column: "creator_id", owner: "creator" } }, limit: 400 },
  { key: "site-files", label: "Website files", table: "site_files", columns: ["content"], scope: { kind: "via", column: "site_id", parent: "sites", parentScope: { kind: "own", column: "creator_id", owner: "creator" } }, limit: 400 },
  /* Products: the thumbnail, the gallery (which also holds videos), each variant's own picture, and the product page's sections. */
  { key: "product-thumbnail", label: "Product photos", table: "products", columns: ["thumbnail_url", "gallery_urls", "description"], scope: { kind: "own", column: "creator_id", owner: "creator" }, limit: 2000 },
  { key: "product-variant", label: "Product photos", table: "product_variants", columns: ["image_url"], scope: { kind: "via", column: "product_id", parent: "products", parentScope: { kind: "own", column: "creator_id", owner: "creator" } }, limit: 2000 },
  { key: "product-page", label: "Product page", table: "product_page_configs", columns: ["draft_config", "published_config"], scope: { kind: "own", column: "creator_id", owner: "creator" }, limit: 400 },
  { key: "collection", label: "Collections", table: "product_collections", columns: ["image_url"], scope: { kind: "own", column: "creator_id", owner: "creator" }, limit: 400 },
  { key: "offer", label: "Offers", table: "store_offers", columns: ["image_url", "config"], scope: { kind: "own", column: "creator_id", owner: "creator" }, limit: 200 },
  /* Checkout: the store's own checkout words, which can carry a picture, and the icons a reworded block names. */
  { key: "checkout-text", label: "Checkout", table: "checkout_text_overrides", columns: ["text", "values", "overrides"], scope: { kind: "own", column: "creator_id", owner: "creator" }, limit: 200 },
  /* Courses and lessons: a cover and a lesson's video. */
  /* `courses` hangs off its product; it has no creator column of its own. */
  { key: "course", label: "Courses", table: "courses", columns: ["thumbnail_url", "image_url", "cover_url"], scope: { kind: "via", column: "product_id", parent: "products", parentScope: { kind: "own", column: "creator_id", owner: "creator" } }, limit: 400 },
  /* A lesson sits in a module, the module in a course, the course on a product. */
  { key: "course-lesson", label: "Course lessons", table: "course_lessons", columns: ["video_path", "video_url", "thumbnail_url", "content_text"], scope: { kind: "via", column: "module_id", parent: "course_modules", parentScope: { kind: "via", column: "course_id", parent: "courses", parentScope: { kind: "via", column: "product_id", parent: "products", parentScope: { kind: "own", column: "creator_id", owner: "creator" } } } }, limit: 1000 },
  /* Memberships: a post's pictures. */
  { key: "membership-post", label: "Membership posts", table: "membership_posts", columns: ["images", "body", "thumbnail_url"], scope: { kind: "via", column: "product_id", parent: "products", parentScope: { kind: "own", column: "creator_id", owner: "creator" } }, limit: 1000 },
  /* The person behind the store: their photo and cover, which the checkout header falls back to. */
  { key: "profile", label: "Your photo", table: "profiles", columns: ["avatar_url", "cover_url"], scope: { kind: "own", column: "id", owner: "user" }, limit: 2 },
  /* OnePage's owner column has been three different names; each is tried in turn (lib/attribution/server.ts reads all three). */
  { key: "onepage", label: "One page", table: "onepages", columns: ["avatar_url", "draft_blocks", "published_blocks", "settings"], scope: { kind: "own", column: ["creator_id", "seller_id"], owner: "creator" }, limit: 40 },
  /* Communities: the logo and cover of each one they own, their spaces and their events. */
  { key: "community", label: "Community", table: "communities", columns: ["logo_url", "cover_url"], scope: { kind: "own", column: "owner_user_id", owner: "user" }, limit: 100 },
  { key: "community-space", label: "Community spaces", table: "community_spaces", columns: ["icon"], scope: { kind: "via", column: "community_id", parent: "communities", parentScope: { kind: "own", column: "owner_user_id", owner: "user" } }, limit: 400 },
  { key: "community-event", label: "Community events", table: "community_events", columns: ["cover_url"], scope: { kind: "via", column: "community_id", parent: "communities", parentScope: { kind: "own", column: "owner_user_id", owner: "user" } }, limit: 400 },
  { key: "community-post", label: "Community posts", table: "community_feed_posts", columns: ["media", "body"], scope: { kind: "via", column: "community_id", parent: "communities", parentScope: { kind: "own", column: "owner_user_id", owner: "user" } }, limit: 1000 },
  /* Email: a campaign's own pictures and the branding in it. */
  { key: "email-campaign", label: "Email campaigns", table: "email_campaigns", columns: ["body", "rendered_html", "settings"], scope: { kind: "own", column: "creator_id", owner: "creator" }, limit: 400 },
  { key: "email-flow", label: "Email automations", table: "email_flows", columns: ["trigger_config", "steps"], scope: { kind: "own", column: "creator_id", owner: "creator" }, limit: 200 },
  /* `blog_posts` is Storelib's own blog, not a store's, and has no owner column: a creator's picture never lands there, so it is not a surface here. */
  /* Reviews: a saved widget look, and the photos on a review. */
  { key: "review-widget", label: "Review widgets", table: "review_widget_configs", columns: ["settings"], scope: { kind: "own", column: "creator_id", owner: "creator" }, limit: 200 },
  { key: "review", label: "Reviews", table: "reviews", columns: ["photos", "content"], scope: { kind: "own", column: "creator_id", owner: "creator" }, limit: 2000 },
  /* Files attached to a published lesson. */
  {
    key: "lesson-attachment",
    label: "Course lessons",
    table: "lesson_attachments",
    columns: ["file_path"],
    /* Two hops: the attachment's lesson, the lesson's course, the course's
       store. `lesson_attachments` has no owner column of its own, so the
       catalogue walk in the database never reaches it and this list is the
       only gate that can speak for it. */
    scope: { kind: "via", column: "lesson_id", parent: "course_lessons", parentScope: { kind: "via", column: "module_id", parent: "course_modules", parentScope: { kind: "via", column: "course_id", parent: "courses", parentScope: { kind: "via", column: "product_id", parent: "products", parentScope: { kind: "own", column: "creator_id", owner: "creator" } } } } },
    limit: 2000,
  },
]

/** The forms an address can carry a path in. Never the file name alone. */
export function needlesFor(path: string): string[] {
  const out = new Set<string>([path])
  try {
    const encoded = encodeURI(path)
    out.add(encoded)
    /* The storage client leaves # and ? as they are, and the library fixes them after (lib/files/library.ts toFile). */
    out.add(encoded.replace(/#/g, "%23").replace(/\?/g, "%3F"))
  } catch {
    /* a path encodeURI refuses is matched as it is */
  }
  return [...out]
}

/** Whether a value of any shape holds one of the paths. */
export function holdsPath(value: unknown, needles: readonly string[]): boolean {
  if (value === null || value === undefined) return false
  let text: string
  if (typeof value === "string") text = value
  else if (typeof value === "number" || typeof value === "boolean") return false
  else {
    try {
      text = JSON.stringify(value)
    } catch {
      return false
    }
  }
  if (!text) return false
  return needles.some((n) => text.includes(n))
}

export interface Use {
  key: string
  /** The place the owner would name. */
  label: string
  /** How many rows of this surface hold it. */
  count: number
}

export interface UsesResult {
  /** One entry per label, largest first. */
  uses: Use[]
  /** The rows found, over every surface. */
  total: number
  /** A surface that could not be read: its rows are unknown, so the answer is not complete. */
  unreadable: string[]
}

const str = (v: unknown) => (typeof v === "string" ? v : "")

/** A table this database does not have holds no addresses: not an answer this side has to refuse over. */
const NO_SUCH_TABLE = new Set(["42P01", "PGRST205"])
/** A column this table does not have: the read is tried again for every column (`*`) rather than giving up. */
const NO_SUCH_COLUMN = new Set(["42703", "PGRST204", "PGRST100"])

const codeOf = (error: unknown) => (error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "")

async function soft<T>(read: () => PromiseLike<{ data: unknown; error?: unknown }>): Promise<{ rows: T[]; ok: boolean; noColumn?: boolean }> {
  try {
    const { data, error } = await read()
    if (error) {
      const code = codeOf(error)
      if (NO_SUCH_TABLE.has(code)) return { rows: [], ok: true }
      return { rows: [], ok: false, noColumn: NO_SUCH_COLUMN.has(code) }
    }
    return { rows: (Array.isArray(data) ? data : data ? [data] : []) as T[], ok: true }
  } catch {
    return { rows: [], ok: false }
  }
}

/**
 * One surface's rows. Named columns first, because that is a small read; a
 * column this database spells differently (or does not have yet) falls back
 * to every column rather than reading as "could not be checked", which would
 * keep files for ever and tell the person nothing.
 */
async function readSurface(db: Db, table: string, cols: string, narrow: (q: unknown) => unknown): Promise<{ rows: Record<string, unknown>[]; ok: boolean; noColumn?: boolean }> {
  const first = await soft<Record<string, unknown>>(() => narrow(db.from(table).select(cols)) as PromiseLike<{ data: unknown; error?: unknown }>)
  if (first.ok || !first.noColumn) return { rows: first.rows, ok: first.ok }
  const again = await soft<Record<string, unknown>>(() => narrow(db.from(table).select("*")) as PromiseLike<{ data: unknown; error?: unknown }>)
  return { rows: again.rows, ok: again.ok, noColumn: again.noColumn }
}

/**
 * The owner column, tried in order. One surface is spelt differently on
 * different databases (OnePage's owner has been `creator_id`, `seller_id`
 * and `owner_id` in turn, lib/attribution/server.ts reads all three), and a
 * column that is not there must not make the surface unreadable for ever.
 */
async function readBy(db: Db, table: string, cols: string, column: string | readonly string[], narrow: (q: unknown, column: string) => unknown): Promise<{ rows: Record<string, unknown>[]; ok: boolean }> {
  const candidates = typeof column === "string" ? [column] : column
  for (const col of candidates) {
    const read = await readSurface(db, table, cols, (q) => narrow(q, col))
    if (read.ok || !read.noColumn) return { rows: read.rows, ok: read.ok }
  }
  return { rows: [], ok: false }
}

/**
 * The ids of one table's rows that belong to this store, following the chain
 * up to whichever table holds the owner column. One query a hop.
 */
async function idsOf(db: Db, table: string, scope: Scope, owner: Owner): Promise<{ ids: string[]; ok: boolean }> {
  if (scope.kind === "own") {
    const id = scope.owner === "creator" ? owner.creatorId : owner.userId
    if (!id) return { ids: [], ok: true }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { rows, ok } = await readBy(db, table, "id", scope.column, (q: any, col) => q.eq(col, id).limit(600))
    return { ids: rows.map((r) => str(r.id)).filter(Boolean), ok }
  }
  const up = await idsOf(db, scope.parent, scope.parentScope, owner)
  if (!up.ok) return { ids: [], ok: false }
  if (up.ids.length === 0) return { ids: [], ok: true }
  const { rows, ok } = await soft<{ id: string }>(() => db.from(table).select("id").in(scope.column, up.ids).limit(2000))
  return { ids: rows.map((r) => str(r.id)).filter(Boolean), ok }
}

/** The ids of the parent rows a `via` surface hangs off, this store's own. */
async function parentIds(db: Db, scope: Extract<Scope, { kind: "via" }>, owner: Owner): Promise<{ ids: string[]; ok: boolean }> {
  return idsOf(db, scope.parent, scope.parentScope, owner)
}

/** One thing being asked about: an id to answer under, and the paths an address could carry. */
interface Target {
  id: string
  needles: string[]
}

/** The paths one file is asked about: itself, and a video's first frame, which is part of it. */
export function targetFor(bucket: string, path: string): string[] {
  return [...new Set([...needlesFor(path), ...(bucket === "store-builder-images" ? needlesFor(posterPathFor(path)) : [])])]
}

/**
 * One surface read ONCE, however many files are being asked about, so Select
 * and Delete of a hundred files is still one query per surface and not a
 * hundred. Answers how many of its rows hold each target.
 */
async function surfaceHits(db: Db, surface: Surface, owner: Owner, targets: readonly Target[]): Promise<{ counts: Map<string, number>; ok: boolean }> {
  const cols = ["id", ...surface.columns].join(", ")
  const limit = surface.limit ?? 400
  const counts = new Map<string, number>()
  let rows: Record<string, unknown>[] = []
  if (surface.scope.kind === "own") {
    const scope = surface.scope
    const id = scope.owner === "creator" ? owner.creatorId : owner.userId
    if (!id) return { counts, ok: true }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const read = await readBy(db, surface.table, cols, scope.column, (q: any, col) => q.eq(col, id).limit(limit))
    if (!read.ok) return { counts, ok: false }
    rows = read.rows
  } else {
    const scope = surface.scope
    const { ids, ok: parentOk } = await parentIds(db, scope, owner)
    if (!parentOk) return { counts, ok: false }
    if (ids.length === 0) return { counts, ok: true }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const read = await readSurface(db, surface.table, cols, (q: any) => q.in(scope.column, ids).limit(limit))
    if (!read.ok) return { counts, ok: false }
    rows = read.rows
  }
  for (const row of rows) {
    /* The row's own columns joined once, not once per file asked about. A
       read that fell back to every column is searched whole, so a column
       named differently here is still seen. */
    const text = (surface.columns.every((c) => c in row) ? surface.columns.map((c) => textOf(row[c])) : Object.entries(row).filter(([k]) => k !== "id").map(([, v]) => textOf(v)))
      .filter(Boolean)
      .join("\n")
    if (!text) continue
    for (const t of targets) if (t.needles.some((n) => text.includes(n))) counts.set(t.id, (counts.get(t.id) ?? 0) + 1)
  }
  return { counts, ok: true }
}

function textOf(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return ""
  try {
    return JSON.stringify(value)
  } catch {
    return ""
  }
}

/**
 * WHERE EACH OF THESE PICTURES IS USED, by name, over every surface above.
 * Every surface is read once for the whole list.
 *
 * Fails open towards "in use": a surface that cannot be read is named in
 * `unreadable`, and a caller deciding whether bytes may go treats that as a
 * reason to keep them (`collectable` below).
 */
export async function findUsesMany(
  db: Db,
  owner: Owner,
  files: readonly { id: string; bucket: string; path: string }[],
  surfaces: readonly Surface[] = SURFACES,
): Promise<Map<string, UsesResult>> {
  const targets: Target[] = files.map((f) => ({ id: f.id, needles: targetFor(f.bucket, f.path) }))
  const out = new Map<string, UsesResult>()
  for (const t of targets) out.set(t.id, { uses: [], total: 0, unreadable: [] })
  if (targets.length === 0) return out
  const results = await Promise.all(surfaces.map(async (s) => ({ surface: s, ...(await surfaceHits(db, s, owner, targets)) })))
  const byLabel = new Map<string, Map<string, Use>>()
  for (const t of targets) byLabel.set(t.id, new Map())
  for (const r of results) {
    if (!r.ok) {
      for (const t of targets) out.get(t.id)!.unreadable.push(r.surface.key)
      continue
    }
    for (const [id, count] of r.counts) {
      const result = out.get(id)
      if (!result || count === 0) continue
      result.total += count
      const labels = byLabel.get(id)!
      const held = labels.get(r.surface.label)
      if (held) held.count += count
      else labels.set(r.surface.label, { key: r.surface.key, label: r.surface.label, count })
    }
  }
  for (const [id, labels] of byLabel) {
    out.get(id)!.uses = [...labels.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  }
  return out
}

/** Where one picture is used. */
export async function findUses(db: Db, owner: Owner, bucket: string, path: string, surfaces: readonly Surface[] = SURFACES): Promise<UsesResult> {
  const out = await findUsesMany(db, owner, [{ id: "one", bucket, path }], surfaces)
  return out.get("one") ?? { uses: [], total: 0, unreadable: [] }
}

/**
 * THE DATABASE'S OWN ANSWER (SQL part 18): every table in `public` with an
 * owner column, the whole row as text against the path. Three answers:
 *
 *   true     something points at it
 *   false    nothing does
 *   null     the question could not be asked (the function is not there, or
 *            it failed). Not an answer, and never read as "no".
 */
export async function referencedInDatabase(db: Db, bucket: string, path: string): Promise<boolean | null> {
  try {
    const { data, error } = await db.rpc("storage_object_referenced", { p_bucket: bucket, p_name: path })
    if (error) return null
    return typeof data === "boolean" ? data : null
  } catch {
    return null
  }
}

/**
 * MAY THESE BYTES GO? Only when both gates say nothing points at the object:
 * the list above found nothing and could read every surface, and the
 * database's own catalogue walk answered a plain no. Anything else keeps the
 * file, including a database that has not run part 18.
 */
export async function collectable(db: Db, owner: Owner, bucket: string, path: string): Promise<{ ok: boolean; reason: string; uses: UsesResult }> {
  const uses = await findUses(db, owner, bucket, path)
  if (uses.total > 0) return { ok: false, reason: "in-use", uses }
  if (uses.unreadable.length > 0) return { ok: false, reason: "unreadable", uses }
  const inDatabase = await referencedInDatabase(db, bucket, path)
  if (inDatabase === null) return { ok: false, reason: "no-reference-check", uses }
  if (inDatabase) return { ok: false, reason: "in-use-elsewhere", uses }
  return { ok: true, reason: "unreferenced", uses }
}
