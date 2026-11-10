import "server-only"

/**
 * ===========================================================================
 *  THE ADMIN'S SCREENSHOTS: DATABASE ROWS AND PRIVATE PICTURES
 * ===========================================================================
 * SQL part 431: `public.design_references` (one row per uploaded picture,
 * keyed by the picture's own hash) and the PRIVATE storage bucket
 * `design-references`. Row level security is on with no policy, and anon
 * and authenticated have no grant: only the server (service role) reads or
 * writes, and only behind the admin cookie (app/api/admin/design-references)
 * or for an AI job (findReferences, referenceImagesFor). No picture ever
 * gets a public or signed URL: the server downloads it and hands the bytes
 * to the provider, or streams it to the signed in admin.
 *
 * Generation reads are cached per server instance for a minute, so a job does
 * not add a database round trip per model call, and a missing table (part
 * 431 not run yet) is an empty library, never a failed job.
 */
import type { AgentImage } from "@/lib/sites/agent/attachments"
import { MAX_IMAGES, MAX_TOTAL_IMAGE_BYTES } from "@/lib/sites/agent/attachments"
import { referenceProblems, type DesignReference } from "./types"
import { searchReferences, type BriefLike, type SearchOptions } from "./search"
import { toBase64 } from "./ingest"

export const REFERENCES_TABLE = "design_references"
export const REFERENCES_BUCKET = "design-references"
export const ROW_COLUMNS = "id, version, status, enabled, record, notes, source_note, image_sha256, original_path, view_path, page_path, width, height, bytes, analysis_model, analysis_usd, analysed_at, error, created_at, updated_at"

/** Hard ceilings so a curator's afternoon cannot become an unbounded bill. */
export const MAX_STORED_REFERENCES = 500
export const MAX_ANALYSES_PER_HOUR = 30

type Db = { from: (table: string) => any; storage: { from: (bucket: string) => any } } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface ReferenceRow {
  id: string
  version: number
  status: "analyzing" | "ready" | "failed"
  enabled: boolean
  record: DesignReference | null
  notes: string | null
  source_note: string | null
  image_sha256: string
  original_path: string | null
  view_path: string | null
  page_path: string | null
  width: number | null
  height: number | null
  bytes: number | null
  analysis_model: string | null
  analysis_usd: number | null
  analysed_at: string | null
  error: string | null
  created_at: string
  updated_at: string
}

export function isMissingTable(error: { message?: string; code?: string } | null | undefined): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || /design_references|relation|schema cache|does not exist/i.test(error.message ?? ""))
}

/** A row's record as generation uses it: only ready, enabled, valid records. */
export function usableRecord(row: Pick<ReferenceRow, "status" | "enabled" | "record">): DesignReference | null {
  if (row.status !== "ready" || !row.enabled || !row.record) return null
  const r = { ...row.record, enabled: true }
  return referenceProblems(r).length ? null : r
}

/* ── generation side ────────────────────────────────────────────────────── */

const CACHE_MS = 60_000
let cache: { at: number; refs: DesignReference[] } | null = null

/** Every ready, enabled uploaded reference. Cached a minute; [] when the table is not there. */
export async function storedReferences(db: Db, opts: { fresh?: boolean; now?: number } = {}): Promise<DesignReference[]> {
  const now = opts.now ?? Date.now()
  if (!opts.fresh && cache && now - cache.at < CACHE_MS) return cache.refs
  const { data, error } = await db.from(REFERENCES_TABLE).select("status, enabled, record").eq("status", "ready").eq("enabled", true).limit(MAX_STORED_REFERENCES)
  if (error) {
    if (!isMissingTable(error)) console.error(`[references] read: ${String(error.message ?? "").slice(0, 200)}`)
    return []
  }
  const refs = ((data ?? []) as ReferenceRow[]).map(usableRecord).filter((r): r is DesignReference => !!r)
  cache = { at: now, refs }
  return refs
}

export function forgetStoredReferences(): void {
  cache = null
}

/** searchReferences over the built in library AND the admin's screenshots. */
export async function findReferencesIn(db: Db, brief: BriefLike, opts: Omit<SearchOptions, "extra"> = {}): Promise<DesignReference[]> {
  const extra = await storedReferences(db).catch(() => [])
  return searchReferences(brief, { ...opts, extra })
}

/**
 * THE SHARED NAME (round O): the pictures of these references, as images a
 * provider can take (base64, never a URL). Only uploaded references have
 * pictures; ids without one are skipped. At most four, within the same
 * byte budget a creator's attachments have.
 */
export async function referenceImagesFrom(db: Db, ids: readonly string[]): Promise<{ id: string; image: AgentImage }[]> {
  const wanted = [...new Set(ids)].filter((id) => /^ref_up-[0-9a-f]{16}$/.test(id)).slice(0, MAX_IMAGES)
  if (!wanted.length) return []
  const { data, error } = await db.from(REFERENCES_TABLE).select("id, status, enabled, view_path").in("id", wanted)
  if (error || !data) return []
  const rows = new Map(((data as ReferenceRow[]) ?? []).map((r) => [r.id, r]))
  const out: { id: string; image: AgentImage }[] = []
  let total = 0
  for (const id of wanted) {
    const row = rows.get(id)
    if (!row || row.status !== "ready" || !row.enabled || !row.view_path) continue
    try {
      const { data: blob, error: dlErr } = await db.storage.from(REFERENCES_BUCKET).download(row.view_path)
      if (dlErr || !blob) continue
      const bytes = new Uint8Array(await (blob as Blob).arrayBuffer())
      if (total + bytes.byteLength > MAX_TOTAL_IMAGE_BYTES) break
      total += bytes.byteLength
      out.push({ id, image: { mediaType: "image/jpeg", data: toBase64(bytes), name: `reference ${id}` } })
    } catch {
      continue
    }
  }
  return out
}

/* ── admin side ─────────────────────────────────────────────────────────── */

export async function listRows(db: Db): Promise<{ rows: ReferenceRow[]; missing: boolean }> {
  const { data, error } = await db.from(REFERENCES_TABLE).select(ROW_COLUMNS).order("created_at", { ascending: false }).limit(MAX_STORED_REFERENCES)
  if (error) {
    if (isMissingTable(error)) return { rows: [], missing: true }
    throw new Error("The references could not be read.")
  }
  return { rows: (data ?? []) as ReferenceRow[], missing: false }
}

export async function rowById(db: Db, id: string): Promise<ReferenceRow | null> {
  const { data } = await db.from(REFERENCES_TABLE).select(ROW_COLUMNS).eq("id", id).maybeSingle()
  return (data ?? null) as ReferenceRow | null
}

export async function rowBySha(db: Db, sha: string): Promise<ReferenceRow | null> {
  const { data } = await db.from(REFERENCES_TABLE).select(ROW_COLUMNS).eq("image_sha256", sha).maybeSingle()
  return (data ?? null) as ReferenceRow | null
}

/** How many analyses ran in the last hour, and how many references there are. */
export async function usageNow(db: Db, now: Date): Promise<{ lastHour: number; total: number }> {
  const since = new Date(now.getTime() - 3_600_000).toISOString()
  const [hour, all] = await Promise.all([
    db.from(REFERENCES_TABLE).select("id", { count: "exact", head: true }).gte("analysed_at", since),
    db.from(REFERENCES_TABLE).select("id", { count: "exact", head: true }),
  ])
  return { lastHour: Number(hour?.count ?? 0), total: Number(all?.count ?? 0) }
}

/** Fields the admin may change on a record. Everything else (id, rights, provenance, image) stays as analysed. */
export const EDITABLE_FIELDS = ["title", "summary", "styleTags", "industries", "tone", "borrow", "avoid", "fitsPoorly", "quality"] as const
export type EditableField = (typeof EDITABLE_FIELDS)[number]

/** The record with the admin's edits, version bumped, checked. Null + problems when invalid. */
export function editedRecord(current: DesignReference, patch: Partial<Record<EditableField, unknown>>): { record: DesignReference | null; problems: string[] } {
  const next: DesignReference = { ...current }
  const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, " ").replace(/—|–/g, ", ").replace(/\s+/g, " ").trim().slice(0, max) : null)
  const cleanList = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => clean(x, max)).filter((x): x is string => !!x).slice(0, n) : null)
  let changed = false
  for (const key of EDITABLE_FIELDS) {
    if (!(key in patch)) continue
    const v = patch[key]
    if (key === "title" || key === "summary") {
      const t = clean(v, key === "title" ? 120 : 800)
      if (t) {
        next[key] = t
        changed = true
      }
    } else if (key === "quality") {
      const q = Math.round(Number(v))
      if (q >= 1 && q <= 5) {
        next.quality = q
        changed = true
      }
    } else {
      const max = key === "borrow" || key === "avoid" ? 300 : 50
      const l = cleanList(v, key === "borrow" || key === "avoid" ? 8 : 12, max)
      if (l) {
        ;(next as unknown as Record<string, unknown>)[key] = key === "borrow" || key === "avoid" ? l : l.map((x) => x.toLowerCase())
        changed = true
      }
    }
  }
  if (!changed) return { record: current, problems: [] }
  next.version = current.version + 1
  next.provenance = { ...current.provenance, verifiedByHuman: true }
  const problems = referenceProblems(next)
  return problems.length ? { record: null, problems } : { record: next, problems: [] }
}
