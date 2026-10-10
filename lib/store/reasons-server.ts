import "server-only"

/**
 * ===========================================================================
 *  A STORE'S REASONS, READ AND WRITTEN
 * ===========================================================================
 * commerce_reasons (SQL part 109), always filtered by the caller's own
 * creator id. A list nobody has changed has no rows and reads as Storelib's
 * defaults (lib/store/reasons.ts); the first change writes the defaults out
 * and then makes it, so a store never loses a reason it did not remove.
 * Reasons are kept by their value, which never changes once made: a return
 * made with "size" still reads with whatever "size" is called today.
 */
import { FALLBACK_REASON, MAX_REASONS, defaultsFor, freeValue, isReasonValue, readReason, valueFromLabel, type Reason, type ReasonKind } from "./reasons"
import { isMissingTable } from "./settings-server"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const REASONS_NEED_PART = "Reasons need their database update. Run SQL part 109 in Supabase, then try again."

export interface ReasonList {
  kind: ReasonKind
  reasons: Reason[]
  /** True once the store has its own rows; false while it has Storelib's list. */
  custom: boolean
}

export async function loadReasons(db: Db, creatorId: string, kind: ReasonKind): Promise<ReasonList & { ready: boolean }> {
  const { data, error } = await db.from("commerce_reasons").select("id, value, label, description, position").eq("creator_id", creatorId).eq("kind", kind).order("position").order("created_at").limit(MAX_REASONS + 5)
  if (error) return { kind, reasons: defaultsFor(kind), custom: false, ready: !isMissingTable(error) }
  const rows = (data ?? []) as { id: string; value: string; label: string; description: string | null }[]
  if (rows.length === 0) return { kind, reasons: defaultsFor(kind), custom: false, ready: true }
  return { kind, reasons: rows.map((r) => ({ id: r.id, value: r.value, label: r.label, description: r.description ?? null })), custom: true, ready: true }
}

/** Both lists, for Settings. */
export async function loadAllReasons(db: Db, creatorId: string) {
  const [ret, ref] = await Promise.all([loadReasons(db, creatorId, "return"), loadReasons(db, creatorId, "refund")])
  return { return: ret.reasons, refund: ref.reasons, ready: ret.ready && ref.ready }
}

/** The store's list, or the defaults on any failure: a return or a refund never fails over its reason. */
export async function reasonsFor(db: Db, creatorId: string, kind: ReasonKind): Promise<Reason[]> {
  try {
    return (await loadReasons(db, creatorId, kind)).reasons
  } catch {
    return defaultsFor(kind)
  }
}

type Done = { ok: true; reasons: Reason[] } | { ok: false; error: string; status: number }

/** The rows, writing the defaults out first when there are none yet. */
async function rowsOf(db: Db, creatorId: string, kind: ReasonKind): Promise<{ ok: true; reasons: Reason[] } | { ok: false; error: string; status: number }> {
  const now = await loadReasons(db, creatorId, kind)
  if (!now.ready) return { ok: false, error: REASONS_NEED_PART, status: 409 }
  if (now.custom) return { ok: true, reasons: now.reasons }
  const { error } = await db.from("commerce_reasons").upsert(
    now.reasons.map((r, i) => ({ creator_id: creatorId, kind, value: r.value, label: r.label, description: r.description, position: i })),
    { onConflict: "creator_id,kind,value", ignoreDuplicates: true },
  )
  if (error) return { ok: false, error: isMissingTable(error) ? REASONS_NEED_PART : "The reasons could not be saved.", status: isMissingTable(error) ? 409 : 500 }
  const again = await loadReasons(db, creatorId, kind)
  return { ok: true, reasons: again.reasons }
}

async function done(db: Db, creatorId: string, kind: ReasonKind): Promise<Done> {
  return { ok: true, reasons: (await loadReasons(db, creatorId, kind)).reasons }
}

export async function addReason(db: Db, creatorId: string, kind: ReasonKind, input: unknown): Promise<Done> {
  const read = readReason(input)
  if (!read.ok) return { ok: false, error: read.error, status: 400 }
  const rows = await rowsOf(db, creatorId, kind)
  if (!rows.ok) return rows
  if (rows.reasons.length >= MAX_REASONS) return { ok: false, error: `A list holds up to ${MAX_REASONS} reasons.`, status: 400 }
  if (rows.reasons.some((r) => r.label.toLowerCase() === read.label.toLowerCase())) return { ok: false, error: "There is already a reason with that name.", status: 400 }
  const value = freeValue(valueFromLabel(read.label), rows.reasons.map((r) => r.value))
  /* Before "other", which stays last unless it was moved. */
  const otherAt = rows.reasons.findIndex((r) => r.value === FALLBACK_REASON)
  const position = otherAt === rows.reasons.length - 1 ? otherAt : rows.reasons.length
  if (otherAt === rows.reasons.length - 1) {
    const other = rows.reasons[otherAt]
    if (other.id) await db.from("commerce_reasons").update({ position: position + 1 }).eq("id", other.id).eq("creator_id", creatorId)
  }
  const { error } = await db.from("commerce_reasons").insert({ creator_id: creatorId, kind, value, label: read.label, description: read.description, position })
  if (error) return { ok: false, error: "The reason could not be saved.", status: 500 }
  return done(db, creatorId, kind)
}

export async function updateReason(db: Db, creatorId: string, kind: ReasonKind, value: unknown, input: unknown): Promise<Done> {
  if (!isReasonValue(value)) return { ok: false, error: "That reason was not found.", status: 404 }
  const read = readReason(input)
  if (!read.ok) return { ok: false, error: read.error, status: 400 }
  const rows = await rowsOf(db, creatorId, kind)
  if (!rows.ok) return rows
  if (!rows.reasons.some((r) => r.value === value)) return { ok: false, error: "That reason was not found.", status: 404 }
  if (rows.reasons.some((r) => r.value !== value && r.label.toLowerCase() === read.label.toLowerCase())) return { ok: false, error: "There is already a reason with that name.", status: 400 }
  const { error } = await db.from("commerce_reasons").update({ label: read.label, description: read.description, updated_at: new Date().toISOString() }).eq("creator_id", creatorId).eq("kind", kind).eq("value", value)
  if (error) return { ok: false, error: "The reason could not be saved.", status: 500 }
  return done(db, creatorId, kind)
}

export async function deleteReason(db: Db, creatorId: string, kind: ReasonKind, value: unknown): Promise<Done> {
  if (!isReasonValue(value)) return { ok: false, error: "That reason was not found.", status: 404 }
  if (value === FALLBACK_REASON) return { ok: false, error: "This one stays: a reason nobody picked from your list is kept as it.", status: 400 }
  const rows = await rowsOf(db, creatorId, kind)
  if (!rows.ok) return rows
  const { error } = await db.from("commerce_reasons").delete().eq("creator_id", creatorId).eq("kind", kind).eq("value", value)
  if (error) return { ok: false, error: "The reason could not be removed.", status: 500 }
  return done(db, creatorId, kind)
}

/** The list in a new order, given as its values; values not sent keep their place after them. */
export async function orderReasons(db: Db, creatorId: string, kind: ReasonKind, order: unknown): Promise<Done> {
  if (!Array.isArray(order) || !order.every(isReasonValue)) return { ok: false, error: "Bad request.", status: 400 }
  const rows = await rowsOf(db, creatorId, kind)
  if (!rows.ok) return rows
  const known = new Set(rows.reasons.map((r) => r.value))
  const sent = [...new Set(order as string[])].filter((v) => known.has(v))
  const next = [...sent, ...rows.reasons.map((r) => r.value).filter((v) => !sent.includes(v))]
  const results = await Promise.all(next.map((value, position) => db.from("commerce_reasons").update({ position }).eq("creator_id", creatorId).eq("kind", kind).eq("value", value)))
  if (results.some((r: { error?: unknown }) => r.error)) return { ok: false, error: "The order could not be saved.", status: 500 }
  return done(db, creatorId, kind)
}

export const readKind = (v: unknown): ReasonKind | null => (v === "return" || v === "refund" ? v : null)
