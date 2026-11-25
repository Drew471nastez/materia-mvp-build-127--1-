/**
 * ===========================================================================
 *  A THEME'S UNCHANGED FILES, KEPT ONCE FOR EVERY WEBSITE (round 27)
 * ===========================================================================
 * Every website added from a Materia template is 986 rows and 28.5 MB of
 * text in store_theme_custom_files, almost all of it the same text as every
 * other Materia website's. Adding one wrote all of it; opening its editor
 * read 27 MB of it back; a cold server drawing its live site read it again.
 *
 * A REFERENCE ROW holds no text of its own: `content` is '' and
 * `blob_sha256` names the text in theme_file_blobs (the table site releases
 * already keep every published file in, one row per distinct text, SQL part
 * 180). Readers resolve it (resolveFileRows); the text is the same for every
 * website, so a server keeps it in memory once (BLOB_CACHE_CHARS) for all of
 * them. A file the creator edits becomes their own copy: any write that
 * changes `content` clears `blob_sha256` (the trigger in
 * supabase/sql/RUN_PENDING_ROUND_27.sql), so every existing writer is a
 * copy-on-write writer without knowing it.
 *
 * NOTHING CHANGES UNTIL THE OWNER TURNS IT ON, and not before every reader
 * resolves:
 *
 *   existing websites   full copies, never touched; a row with text is read
 *                       exactly as before (a row is a reference only when
 *                       its content is '' AND it names a blob)
 *   reads               ask for `blob_sha256` only when the column exists
 *                       and references are on (refReads); otherwise the
 *                       query is the query of today, to the character
 *   new websites        written as references only when references are on,
 *                       the column and the blobs table exist, and
 *                       REFS_READERS_DONE (every reader of the table
 *                       resolves; tests/theme-file-refs-r27.test.ts checks it)
 *
 * Turned on by STORELIB_THEME_FILE_REFS=1 (an environment variable), after
 * RUN_PENDING_ROUND_27.sql. Server only.
 */
import { createHash } from "node:crypto"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any }

export const REF_COLUMN = "blob_sha256"
export const BLOBS_TABLE = "theme_file_blobs"
/** Below this many characters a file keeps its own text: a reference would cost more than it saves. */
export const REF_MIN_CHARS = 1024
/** Text a server keeps in memory by sha256, for every website that names it. */
export const BLOB_CACHE_CHARS = 96 * 1024 * 1024
const BLOB_READ_CHUNK = 60
const BLOB_WRITE_ROWS = 200
const BLOB_WRITE_CHARS = 3_000_000

/*
  EVERY READER OF store_theme_custom_files RESOLVES REFERENCES (round 27,
  part 3): the storefront, the builder and code editor, the agents, Storelib
  AI, GitHub sync, backups and restore, export, duplicate and theme updates.
  tests/theme-file-refs-r27.test.ts fails when a file reads the table's text
  without fileCols and resolveRefs, and runs each reader over an old
  full-copy website and a new referencing one side by side. Set back to
  false and no new website is written as references, whatever the flag says.
*/
export const REFS_READERS_DONE = true

export const sha256Text = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex")
const SHA = /^[0-9a-f]{64}$/

/** The owner's switch (an environment variable). Off: nothing here asks the database anything. */
export function refsSwitchedOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.STORELIB_THEME_FILE_REFS === "1"
}

/* Whether the column and the blobs table are there, known for a while per server. */
let known: { at: number; present: boolean } | null = null
const PRESENT_MS = 10 * 60_000
const ABSENT_MS = 60_000
export async function refColumnPresent(db: Db, now = Date.now()): Promise<boolean> {
  if (known && now - known.at < (known.present ? PRESENT_MS : ABSENT_MS)) return known.present
  let present = false
  try {
    const [col, blobs] = await Promise.all([
      db.from("store_theme_custom_files").select(REF_COLUMN).limit(1),
      db.from(BLOBS_TABLE).select("sha256").limit(1),
    ])
    present = !col.error && !blobs.error
  } catch {
    present = false
  }
  known = { at: now, present }
  return present
}
/** For the tests. */
export function forgetRefColumn(): void {
  known = null
}

/** Whether reads should ask for references: the switch on and the column there. Off: no query at all. */
export async function refReads(db: Db, env?: Record<string, string | undefined>): Promise<boolean> {
  if (!refsSwitchedOn(env)) return false
  return refColumnPresent(db)
}

/** Whether a NEW website may be written as references now. */
export async function refWrites(db: Db, env?: Record<string, string | undefined>, readersDone = REFS_READERS_DONE): Promise<boolean> {
  return readersDone && (await refReads(db, env))
}

/** The columns a read selects: today's, with the reference column when references are read. */
export function withRefColumn(columns: string, refs: boolean): string {
  return refs ? `${columns}, ${REF_COLUMN}` : columns
}

export type MaybeRef = { path: string; content?: string | null; blob_sha256?: string | null }

/** A row that names a blob and has no text of its own. A row with text is its own copy, whatever it names. */
export function isRefRow(row: MaybeRef): boolean {
  return typeof row.blob_sha256 === "string" && SHA.test(row.blob_sha256) && (row.content === "" || row.content === null || row.content === undefined)
}

/* ── The blobs this server holds ───────────────────────────────────────── */
const held = new Map<string, string>()
let heldChars = 0
function hold(sha: string, text: string) {
  if (held.has(sha)) {
    held.delete(sha)
    held.set(sha, text)
    return
  }
  held.set(sha, text)
  heldChars += text.length
  while (heldChars > BLOB_CACHE_CHARS && held.size > 1) {
    const [old, t] = held.entries().next().value as [string, string]
    held.delete(old)
    heldChars -= t.length
  }
}
/** For the tests. */
export function forgetHeldBlobs(): void {
  held.clear()
  heldChars = 0
}
export function heldBlobCount(): number {
  return held.size
}

/** Blobs by sha256 from the table, each checked against its own name; every one or a throw. */
export async function readBlobTexts(db: Db, shas: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const wanted = [...new Set(shas)].filter((s) => SHA.test(s))
  const missing: string[] = []
  for (const s of wanted) {
    const t = held.get(s)
    if (t !== undefined) {
      out.set(s, t)
      hold(s, t)
    } else missing.push(s)
  }
  const chunks: string[][] = []
  for (let i = 0; i < missing.length; i += BLOB_READ_CHUNK) chunks.push(missing.slice(i, i + BLOB_READ_CHUNK))
  /* A few at a time. */
  for (let i = 0; i < chunks.length; i += 4) {
    const answers = await Promise.all(chunks.slice(i, i + 4).map((c) => db.from(BLOBS_TABLE).select("sha256, content").in("sha256", c)))
    for (const r of answers as { data: unknown; error: { message?: string } | null }[]) {
      if (r.error) throw new Error(`theme blobs: ${r.error.message ?? "the read failed"}`)
      for (const row of (r.data ?? []) as { sha256: string; content: string }[]) {
        if (typeof row.content === "string" && sha256Text(row.content) === row.sha256) {
          out.set(row.sha256, row.content)
          hold(row.sha256, row.content)
        }
      }
    }
  }
  const absent = wanted.filter((s) => !out.has(s))
  if (absent.length) throw new Error(`theme blobs: ${absent.length} not there`)
  return out
}

/**
 * The rows with every reference's text in `content` (new objects for those
 * rows only; the others are returned as they were). A blob that cannot be
 * read throws: a theme with a file missing is never handed on as the theme.
 */
export async function resolveFileRows<R extends MaybeRef>(db: Db, rows: readonly R[]): Promise<R[]> {
  const refs = rows.filter(isRefRow)
  if (refs.length === 0) return rows as R[]
  const texts = await readBlobTexts(db, refs.map((r) => r.blob_sha256 as string))
  return rows.map((r) => (isRefRow(r) ? { ...r, content: texts.get(r.blob_sha256 as string)! } : r))
}

/* ── Writing a new website's files ─────────────────────────────────────── */

export type FileRow = { install_id: string; path: string; content: string }
export type StoredRow = FileRow & { blob_sha256?: string }

/**
 * The rows to insert for a new website, with every file of REF_MIN_CHARS or
 * more as a reference, and its text written to the blobs table first when
 * Storelib does not hold it yet. Throws when the blobs cannot be written
 * (the caller then writes full copies, as before).
 */
export async function asReferenceRows(db: Db, rows: readonly FileRow[]): Promise<StoredRow[]> {
  const texts = new Map<string, string>()
  const out: StoredRow[] = rows.map((r) => {
    if (typeof r.content !== "string" || r.content.length < REF_MIN_CHARS) return r
    const sha = sha256Text(r.content)
    texts.set(sha, r.content)
    return { install_id: r.install_id, path: r.path, content: "", blob_sha256: sha }
  })
  const shas = [...texts.keys()]
  const have = new Set<string>()
  for (const s of shas) if (held.has(s)) have.add(s)
  const ask = shas.filter((s) => !have.has(s))
  for (let i = 0; i < ask.length; i += BLOB_READ_CHUNK) {
    const r = await db.from(BLOBS_TABLE).select("sha256").in("sha256", ask.slice(i, i + BLOB_READ_CHUNK))
    if (r.error) throw new Error(`theme blobs: ${r.error.message ?? "the read failed"}`)
    for (const row of (r.data ?? []) as { sha256: string }[]) have.add(row.sha256)
  }
  let batch: { sha256: string; content: string; size: number }[] = []
  let chars = 0
  const flush = async () => {
    if (!batch.length) return
    const w = await db.from(BLOBS_TABLE).upsert(batch, { onConflict: "sha256", ignoreDuplicates: true })
    if (w.error) throw new Error(`theme blobs: ${w.error.message ?? "the write failed"}`)
    batch = []
    chars = 0
  }
  for (const sha of shas) {
    if (have.has(sha)) continue
    const content = texts.get(sha)!
    if (batch.length && (batch.length >= BLOB_WRITE_ROWS || chars + content.length > BLOB_WRITE_CHARS)) await flush()
    batch.push({ sha256: sha, content, size: Buffer.byteLength(content, "utf8") })
    chars += content.length
  }
  await flush()
  for (const sha of shas) hold(sha, texts.get(sha)!)
  return out
}

/* ═══════════════════════════════════════════════════════════════════════
   ONE WAY IN FOR EVERY READER AND WRITER (round 27, part 3)
   ═══════════════════════════════════════════════════════════════════════
   A reader may hold the signed-in person's client (row level security) or
   the service role. Whether references are on, and the blobs themselves,
   are always asked with the service role: the blobs are nobody's to read
   directly, and every caller here has already been allowed the install.
   With STORELIB_THEME_FILE_REFS unset none of these asks anything:
   fileCols answers today's columns, resolveRefs answers the rows it was
   given, ownRowsOnly the query it was given. */

let adminFactory: (() => Db | Promise<Db>) | null = null
/** For the tests: the client the blobs are read and written with. */
export function setRefsAdmin(factory: (() => Db | Promise<Db>) | null): void {
  adminFactory = factory
}
export async function refsAdmin(): Promise<Db> {
  if (adminFactory) return adminFactory()
  const { createAdminClient } = await import("@/lib/supabase/admin")
  return createAdminClient() as unknown as Db
}

/** References are read: the switch on and the column there. Off: no query. */
export async function refsOn(): Promise<boolean> {
  if (!refsSwitchedOn()) return false
  return refColumnPresent(await refsAdmin())
}

/** New rows may be written as references (the switch, the column, every reader done). */
export async function refsWritable(): Promise<boolean> {
  if (!REFS_READERS_DONE || !refsSwitchedOn()) return false
  return refColumnPresent(await refsAdmin())
}

/** The columns to select: today's, plus the reference column when references are read. */
export async function fileCols(columns: string): Promise<string> {
  return withRefColumn(columns, await refsOn())
}

/** Rows with every reference's text in `content`; rows without references as given (no client made). */
export async function resolveRefs<R extends MaybeRef>(rows: readonly R[] | null | undefined): Promise<R[]> {
  const list = (rows ?? []) as R[]
  if (!list.some(isRefRow)) return list
  return resolveFileRows(await refsAdmin(), list)
}

/** One row (or null) resolved. */
export async function resolveRef<R extends MaybeRef>(row: R | null | undefined): Promise<R | null> {
  if (!row) return null
  return (await resolveRefs([row]))[0]
}

/**
 * A delete meant for rows with no text of their own (a file created as a
 * draft and never published has content ''): with references on, a
 * reference row (content '' too) is never one of them.
 */
export async function ownRowsOnly<Q extends { is(column: string, value: null): Q }>(q: Q): Promise<Q> {
  return (await refsOn()) ? q.is(REF_COLUMN, null) : q
}

/**
 * Rows copied from one install to another (a duplicate, a theme update's
 * copy): a reference stays a reference (the copy costs no text), a row with
 * text is copied as it is, and, when new rows may be references, a long text
 * is written as one. Without references, the rows as given.
 */
export async function copyRows<R extends { install_id: string; path: string; content: string; blob_sha256?: string | null }>(rows: readonly R[]): Promise<R[]> {
  /* A row with text names no blob in its copy (a stale name is never carried). */
  const kept = rows.map((r) => {
    if (isRefRow(r) || !("blob_sha256" in r)) return r
    const { blob_sha256: _gone, ...rest } = r
    void _gone
    return rest as unknown as R
  })
  if (!(await refsWritable())) return kept
  const own = kept.filter((r) => !isRefRow(r))
  const made = await asReferenceRows(await refsAdmin(), own as unknown as FileRow[])
  const byPath = new Map(made.map((m) => [m.path, m]))
  return kept.map((r) => (isRefRow(r) ? r : ({ ...r, ...byPath.get(r.path) } as R)))
}
