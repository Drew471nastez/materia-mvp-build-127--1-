import "server-only"

/**
 * ===========================================================================
 *  REVIEW IMPORT: WRITING IT, AND TAKING IT BACK
 * ===========================================================================
 * The import screen reads the file in the browser and sends its reviews here
 * in chunks (app/api/app/reviews/import). Every call is the signed in
 * store's, and every write is filtered by its creator id:
 *
 *   start    a row in review_imports (run-now part 215, with the app and
 *            the counts apart from part 232) for the history; the
 *            import's id goes with every chunk
 *   rows     each row read again (lib/reviews/import checkImportRow): only
 *            the store's own products, plain text, whole stars. A review
 *            already there (the app's id, or the same content from any
 *            app) is counted as a duplicate and not written again. The
 *            reviewer's email goes to review_authors, never the review.
 *            Photos are copied into Storelib's review photos when asked and
 *            when the address answers with a picture; otherwise the
 *            address is kept as a link.
 *   finish   the import's row closed, and the ratings counted again for
 *            every product that got a review
 *   undo     Reviews' own Undo (lib/reviews/manage-server undoImport), which
 *            deletes that import's reviews, and the photos it copied, and
 *            nothing else
 *
 * An imported review is never verified and never says Verified purchase on
 * the website (Storelib's ratings count Storelib's own buyers); the app's
 * "verified purchase" is kept as import_verified, for the store to see.
 *
 * Before part 215: no history and no undo; the chunks still import, with the
 * duplicate check made from the reviews already imported. Before part 232:
 * history and undo, the same duplicate check, no app ids or videos.
 */
import { randomBytes } from "node:crypto"
import { fetchPublic } from "@/lib/api/public-fetch"
import { preparePublicImage } from "@/lib/storage/public-image"
import { isMissingTable } from "@/lib/store/settings-server"
import { publicName } from "./app-settings"
import { REVIEW_PHOTO_BUCKET, REVIEW_UPLOAD_BUCKET, REVIEW_PHOTO_MAX_BYTES, removeReviewPhotos } from "./photos-server"
import { refreshReviewStats } from "./store"
import { checkImportRow, contentHash, PLATFORM_BY_ID, type ImportRow, type PlatformId, type RowError } from "./import"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const IMPORT_NEEDS_PART = "Import history and Undo turn on after the database update (SQL part 215)."
export const MAX_ROWS_PER_CHUNK = 250
/** Photos copied in one chunk at most; the rest of the chunk keeps its photos as links. */
const MAX_COPIES_PER_CHUNK = 40
const COPY_TIMEOUT_MS = 7000
/** Rows kept in an import's report (part 215's `report`): the ones that did not go in, first ones first. */
const MAX_REPORT_ROWS = 200

const missing = (error: { code?: string } | null | undefined) => {
  const code = String(error?.code ?? "")
  return code === "42703" || code === "PGRST204" || isMissingTable(error)
}

/**
 * An import's row. Part 215 made the table (file, imported, skipped, a
 * report, undone); part 232 adds the app, the duplicates and errors apart
 * from the rest skipped, when it finished and how many Undo took back. A
 * field part 232 adds is absent before it runs.
 */
export interface ImportRecord {
  id: string
  file_name: string | null
  imported: number
  skipped: number
  report: { row: number; ok: boolean; message?: string | null }[]
  created_at: string
  undone_at: string | null
  platform?: string
  total_rows?: number
  duplicates?: number
  errors?: number
  finished_at?: string | null
  undone_count?: number | null
}

/** Which part the import table is at: 232 (every column), 215 (the import and its Undo), or none. */
export type ImportLevel = 232 | 215 | 0

export const RECORD_COLUMNS_215 = "id, file_name, imported, skipped, report, undone_at, created_at"
export const RECORD_COLUMNS_232 = `${RECORD_COLUMNS_215}, platform, total_rows, duplicates, errors, finished_at, undone_count`

export function readPlatform(v: unknown): PlatformId {
  return typeof v === "string" && v in PLATFORM_BY_ID ? (v as PlatformId) : "other"
}

/** The store's products to match rows against, with every variant's SKU. */
export async function importCatalog(db: Db, creatorId: string): Promise<{ id: string; title: string | null; slug: string | null; skus: string[] }[]> {
  const { data } = await db.from("products").select("id, title, slug").eq("creator_id", creatorId).neq("status", "deleted").limit(5000)
  const products = ((data ?? []) as { id: string; title: string | null; slug: string | null }[]).map((p) => ({ ...p, skus: [] as string[] }))
  if (!products.length) return products
  const byId = new Map(products.map((p) => [p.id, p]))
  try {
    const { data: variants, error } = await db.from("product_variants").select("product_id, sku").in("product_id", products.map((p) => p.id).slice(0, 1000)).limit(10_000)
    if (!error) for (const v of (variants ?? []) as { product_id: string; sku: string | null }[]) if (v.sku) byId.get(v.product_id)?.skus.push(v.sku)
  } catch {
    /* No variants table: titles, handles and ids still match. */
  }
  return products
}

/** One of this store's imports, with the part its table is at. Another store's id reads as none. */
async function ownImport(db: Db, creatorId: string, importId: unknown): Promise<{ record: ImportRecord; level: ImportLevel } | null> {
  if (typeof importId !== "string" || !/^[0-9a-f-]{36}$/i.test(importId)) return null
  const read = (cols: string) => db.from("review_imports").select(cols).eq("id", importId).eq("creator_id", creatorId).maybeSingle()
  let res = await read(RECORD_COLUMNS_232)
  let level: ImportLevel = 232
  if (res.error && missing(res.error)) {
    res = await read(RECORD_COLUMNS_215)
    level = 215
  }
  if (res.error || !res.data) return null
  return { record: res.data as ImportRecord, level }
}

/** Still taking rows: not undone, and (with part 232) not finished. */
const open = (o: { record: ImportRecord; level: ImportLevel }) => !o.record.undone_at && !(o.level === 232 && o.record.finished_at)

export async function startImport(db: Db, a: { creatorId: string; userId: string; platform: PlatformId; fileName: string; totalRows: number }): Promise<{ id: string | null; level: ImportLevel }> {
  const base = { creator_id: a.creatorId, file_name: a.fileName.replace(/[\u0000-\u001f]/g, "").slice(0, 200) || null, imported: 0, skipped: 0 }
  const insert = (row: Record<string, unknown>) => db.from("review_imports").insert(row).select("id").single()
  let res = await insert({ ...base, platform: a.platform, created_by: a.userId, total_rows: Math.max(0, Math.min(1_000_000, Math.floor(a.totalRows) || 0)), duplicates: 0, errors: 0 })
  let level: ImportLevel = 232
  if (res.error && (String(res.error.code) === "42703" || String(res.error.code) === "PGRST204")) {
    res = await insert(base)
    level = 215
  }
  if (res.error) {
    if (missing(res.error)) return { id: null, level: 0 }
    throw new Error(`import not started (${res.error.code ?? "unknown"})`)
  }
  return { id: res.data.id as string, level }
}

/* ── photos ───────────────────────────────────────────────────────────── */

type PhotoEntry = { path: string; url: string; status: "approved" }

/** A photo kept as its own address: shown as it is, never copied. A stand-in path the storage calls pass over. */
function linkEntry(url: string, i: number): PhotoEntry | null {
  if (!url.startsWith("https://")) return null
  return { path: `link:${contentHash({ productId: url, rating: i, body: "", author: null, date: null }).slice(1, 17)}`, url, status: "approved" }
}

/** One picture fetched from a public address and kept under the store's folder, public when its review shows on the website. */
async function copyPhoto(db: Db, creatorId: string, url: string, shown: boolean): Promise<PhotoEntry | null> {
  try {
    const res = await fetchPublic(url, { maxBytes: REVIEW_PHOTO_MAX_BYTES, timeoutMs: COPY_TIMEOUT_MS })
    if (!res.ok) return null
    const picture = preparePublicImage(new Uint8Array(await res.arrayBuffer()), REVIEW_PHOTO_MAX_BYTES)
    if (!picture.ok || !["jpg", "png", "webp", "gif", "avif"].includes(picture.ext)) return null
    const path = `${creatorId}/${randomBytes(16).toString("hex")}.${picture.ext}`
    const bucket = shown ? REVIEW_PHOTO_BUCKET : REVIEW_UPLOAD_BUCKET
    const { error } = await db.storage.from(bucket).upload(path, picture.bytes, { contentType: picture.mime, cacheControl: "31536000", upsert: false })
    if (error) return null
    const publicUrl = db.storage.from(REVIEW_PHOTO_BUCKET).getPublicUrl(path)?.data?.publicUrl
    return typeof publicUrl === "string" && publicUrl.startsWith("https://") ? { path, url: publicUrl, status: "approved" } : null
  } catch {
    return null
  }
}

async function photosFor(db: Db, creatorId: string, rows: ImportRow[], copy: boolean): Promise<Map<number, PhotoEntry[]>> {
  const out = new Map<number, PhotoEntry[]>()
  const jobs: { row: number; i: number; url: string; shown: boolean }[] = []
  rows.forEach((r, row) => {
    out.set(row, [])
    r.photos.forEach((url, i) => jobs.push({ row, i, url, shown: r.status === "published" }))
  })
  let copies = 0
  const results: (PhotoEntry | null)[] = new Array(jobs.length).fill(null)
  const queue = jobs.map((j, k) => ({ ...j, k }))
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const want = copy && copies < MAX_COPIES_PER_CHUNK
      if (want) copies++
      results[next.k] = (want ? await copyPhoto(db, creatorId, next.url, next.shown) : null) ?? linkEntry(next.url, next.i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, jobs.length) }, worker))
  jobs.forEach((j, k) => {
    const e = results[k]
    if (e) out.get(j.row)!.push(e)
  })
  return out
}

/* ── rows ─────────────────────────────────────────────────────────────── */

export interface ChunkResult {
  imported: number
  duplicates: number
  errors: RowError[]
}

/** Which of these keys and fingerprints the store already has: the stored ones (part 232), and those of every review it imported, made again from their rows. */
async function existing(db: Db, creatorId: string, keys: string[], hashes: string[], productIds: string[], ready: boolean): Promise<Set<string>> {
  const have = new Set<string>()
  if (ready) {
    if (keys.length) {
      const { data } = await db.from("reviews").select("import_key").eq("creator_id", creatorId).in("import_key", keys)
      for (const r of (data ?? []) as { import_key: string }[]) have.add(r.import_key)
    }
    if (hashes.length) {
      const { data } = await db.from("reviews").select("content_hash").eq("creator_id", creatorId).in("content_hash", hashes)
      for (const r of (data ?? []) as { content_hash: string }[]) have.add(r.content_hash)
    }
  }
  /* Reviews imported without a fingerprint (before part 232, or by the one-step CSV post): their content, read back. */
  if (!productIds.length) return have
  const { data } = await db.from("reviews").select("product_id, rating, content, reviewer_name, created_at").eq("creator_id", creatorId).eq("source", "import").in("product_id", productIds).limit(5000)
  for (const r of (data ?? []) as { product_id: string; rating: number; content: string; reviewer_name: string | null; created_at: string | null }[]) {
    have.add(contentHash({ productId: r.product_id, rating: Number(r.rating), body: r.content ?? "", author: r.reviewer_name, date: r.created_at }))
  }
  return have
}

/**
 * One chunk of rows, written. `importId` null: part 215 has not run, and the
 * rows are written without an import. Before part 232, without the app's id,
 * fingerprint, verified flag and videos.
 */
export async function importRows(db: Db, a: { creatorId: string; importId: string | null; rows: unknown[]; copyPhotos: boolean; platform?: PlatformId; now?: number }): Promise<ChunkResult | { error: string; status: number }> {
  const own = a.importId ? await ownImport(db, a.creatorId, a.importId) : null
  if (a.importId && !own) return { error: "That import is not yours, or it has gone.", status: 404 }
  if (own && !open(own)) return { error: "That import has finished. Start a new one.", status: 409 }
  if (!a.importId) {
    /* Rows with no import are for before part 215 only: with its table there, every import has its history and its Undo. */
    const probe = await db.from("review_imports").select("id").eq("creator_id", a.creatorId).limit(1)
    if (!probe.error) return { error: "Start the import first.", status: 409 }
  }
  /* Part 232: the app's id and the fingerprint are kept and read; before it, duplicates are found from the reviews already imported. */
  const ready = own?.level === 232
  const platform = readPlatform(own?.record.platform ?? a.platform ?? "other")

  const asked = new Set<string>()
  for (const r of a.rows.slice(0, MAX_ROWS_PER_CHUNK)) {
    const id = r && typeof r === "object" ? (r as { productId?: unknown }).productId : null
    if (typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)) asked.add(id)
  }
  const { data: owned } = asked.size ? await db.from("products").select("id").eq("creator_id", a.creatorId).in("id", [...asked]) : { data: [] }
  const productIds = new Set(((owned ?? []) as { id: string }[]).map((p) => p.id))

  const errors: RowError[] = []
  const good: { row: ImportRow; key: string | null; hash: string }[] = []
  let duplicates = 0
  const inChunk = new Set<string>()
  for (const raw of a.rows.slice(0, MAX_ROWS_PER_CHUNK)) {
    const c = checkImportRow(raw, { platform, productIds, now: a.now })
    if (c.ok === false) {
      errors.push({ line: (c as { line: number }).line, error: (c as { error: string }).error })
      continue
    }
    const keys = [c.key, c.hash].filter((k): k is string => !!k)
    if (keys.some((k) => inChunk.has(k))) {
      duplicates++
      continue
    }
    keys.forEach((k) => inChunk.add(k))
    good.push(c)
  }
  const have = await existing(db, a.creatorId, good.map((g) => g.key).filter((k): k is string => !!k), good.map((g) => g.hash), [...new Set(good.map((g) => g.row.productId))], ready)
  const fresh = good.filter((g) => !(g.key && have.has(g.key)) && !have.has(g.hash))
  duplicates += good.length - fresh.length

  const photos = await photosFor(db, a.creatorId, fresh.map((g) => g.row), a.copyPhotos)
  const nowIso = new Date(a.now ?? Date.now()).toISOString()
  const payload = fresh.map((g, i) => {
    const r = g.row
    const at = r.date ?? nowIso
    const base: Record<string, unknown> = {
      product_id: r.productId,
      creator_id: a.creatorId,
      buyer_id: null,
      order_id: null,
      rating: r.rating,
      title: r.title || null,
      content: r.body,
      reviewer_name: publicName(r.author),
      status: r.status,
      hidden_by: r.status === "hidden" ? "seller" : null,
      ...(r.status === "hidden" ? { hidden_at: nowIso, hidden_reason: "seller" } : {}),
      verified: false,
      source: "import",
      published_at: r.status === "published" ? at : null,
      created_at: at,
      seller_reply: r.reply || null,
      seller_reply_at: r.reply ? (r.replyDate ?? at) : null,
      photos: photos.get(i) ?? [],
    }
    if (ready) return { ...base, import_id: a.importId, import_key: g.key, content_hash: g.hash, import_platform: platform, import_verified: r.verified, videos: r.videos }
    return own ? { ...base, import_id: a.importId } : base
  })

  const written: { id: string; product_id: string; at: number }[] = []
  const insert = async (rows: Record<string, unknown>[]) => db.from("reviews").insert(rows).select("id, product_id")
  if (payload.length) {
    const res = await insert(payload)
    if (res.error && String(res.error.code) === "23505") {
      /* Another import wrote one of these a moment ago: one at a time, and a clash is a duplicate. */
      for (let i = 0; i < payload.length; i++) {
        const one = await insert([payload[i]])
        if (one.error) {
          if (String(one.error.code) === "23505") duplicates++
          else errors.push({ line: fresh[i].row.line, error: "Not saved. Try again." })
          continue
        }
        for (const w of (one.data ?? []) as { id: string; product_id: string }[]) written.push({ ...w, at: i })
      }
    } else if (res.error) {
      const code = String(res.error.code ?? "")
      const later = code === "42703" || code === "PGRST204" || code === "23514"
      await removeReviewPhotos(db, [...photos.values()].flat().map((p) => p.path).filter((p) => !p.startsWith("link:")))
      return { error: later ? "Import turns on after the database update (SQL part 134)." : "The reviews did not import. Try again.", status: later ? 409 : 500 }
    } else {
      /* PostgREST answers inserted rows in the order they were sent. */
      ;((res.data ?? []) as { id: string; product_id: string }[]).forEach((w, i) => written.push({ ...w, at: i }))
    }
  }
  const imported = written.length

  /* The reviewers' addresses, apart from the public rows (review_authors, part 134). */
  const authors = written.map((w) => ({ review_id: w.id, creator_id: a.creatorId, product_id: w.product_id, email: fresh[w.at]?.row.email ?? null })).filter((x) => x.email)
  if (authors.length) await db.from("review_authors").insert(authors).then(() => undefined, () => undefined)

  return { imported, duplicates, errors }
}

/**
 * After a chunk: the counts added to the import's row. `skipped` on the row
 * is every row that did not go in (part 215's meaning); with part 232 the
 * duplicates and errors are kept apart too. The rows that did not go in, with
 * why, go in its report, the first MAX_REPORT_ROWS of them.
 */
export async function addToImport(db: Db, creatorId: string, importId: string | null, add: { imported: number; duplicates: number; skipped: number; errors: RowError[]; extraErrors?: number }): Promise<void> {
  if (!importId) return
  const own = await ownImport(db, creatorId, importId)
  if (!own || !open(own)) return
  const r = own.record
  const errorCount = add.errors.length + (add.extraErrors ?? 0)
  const report = [...(Array.isArray(r.report) ? r.report : []), ...add.errors.map((e) => ({ row: e.line, ok: false, message: e.error }))].slice(0, MAX_REPORT_ROWS)
  const change: Record<string, unknown> = { imported: (r.imported ?? 0) + add.imported, skipped: (r.skipped ?? 0) + add.skipped + add.duplicates + errorCount, report }
  if (own.level === 232) Object.assign(change, { duplicates: (r.duplicates ?? 0) + add.duplicates, errors: (r.errors ?? 0) + errorCount })
  await db.from("review_imports").update(change).eq("id", importId).eq("creator_id", creatorId)
}

/** The import done: its row closed (part 232), and the ratings counted again for every product it wrote to. */
export async function finishImport(db: Db, creatorId: string, importId: string | null, productIds: string[]): Promise<ImportRecord | null> {
  let record: ImportRecord | null = null
  if (importId) {
    const own = await ownImport(db, creatorId, importId)
    if (own) {
      record = own.record
      if (own.level === 232 && !own.record.finished_at) {
        const { data } = await db.from("review_imports").update({ finished_at: new Date().toISOString() }).eq("id", importId).eq("creator_id", creatorId).select(RECORD_COLUMNS_232).single()
        record = (data as ImportRecord | null) ?? own.record
      }
      const { data: rows } = await db.from("reviews").select("product_id").eq("creator_id", creatorId).eq("import_id", importId).limit(10_000)
      productIds = [...productIds, ...((rows ?? []) as { product_id: string }[]).map((x) => x.product_id)]
    }
  }
  await recount(db, creatorId, productIds)
  return record
}

async function recount(db: Db, creatorId: string, productIds: string[]) {
  const ids = [...new Set(productIds.filter((x) => typeof x === "string"))]
  if (ids.length) {
    const { data } = await db.from("products").select("id, slug").eq("creator_id", creatorId).in("id", ids)
    for (const p of (data ?? []) as { id: string; slug: string | null }[]) await refreshReviewStats(db, { productId: p.id, productSlug: p.slug })
  }
  await refreshReviewStats(db, { creatorId })
}
