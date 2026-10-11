import "server-only"

/**
 * A store's activity log (SQL part 113, lib/activity/actions.ts): writing a
 * row after a change, and reading the newest rows for Settings › Activity.
 *
 * Writing never throws and never fails the change it records: a store whose
 * database hasn't run part 113 yet, or a row that won't insert, is skipped
 * and noted in the server log without anything personal in it.
 */
import { loggable } from "@/lib/admin/plain-reason"
import type { ActivityEntry } from "@/lib/activity/actions"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const ACTIVITY_PAGE = 40

export interface ActivityNote {
  action: string
  subjectType?: string | null
  subjectId?: string | null
  subjectLabel?: string | null
  meta?: Record<string, unknown>
  actor?: ActivityEntry["actor"]
}

const clip = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null)

export async function recordActivity(db: Db, who: { creatorId: string; userId?: string | null }, note: ActivityNote): Promise<void> {
  try {
    if (!/^[a-z_]+\.[a-z_]+$/.test(note.action)) return
    const { error } = await db.from("store_activity_log").insert({
      creator_id: who.creatorId,
      actor_user_id: who.userId ?? null,
      actor: note.actor ?? (who.userId ? "person" : "system"),
      action: note.action,
      subject_type: clip(note.subjectType, 40),
      subject_id: clip(note.subjectId, 100),
      subject_label: clip(note.subjectLabel, 200),
      meta: note.meta && typeof note.meta === "object" ? note.meta : {},
    })
    /* A database that hasn't run part 113 yet is expected, not an error worth a line on every save. */
    if (error && error.code !== "42P01" && error.code !== "PGRST205") console.error(`[activity] not recorded (${note.action}): ${loggable(error)}`)
  } catch (e) {
    console.error(`[activity] not recorded (${note.action}): ${loggable(e)}`)
  }
}

type Row = { id: number; created_at: string; actor: ActivityEntry["actor"]; action: string; subject_type: string | null; subject_id: string | null; subject_label: string | null; meta: Record<string, unknown> | null }

/** The newest rows, older than `before` (a row id) when given. `missing` is a database without part 113. */
export async function loadActivity(db: Db, creatorId: string, opts: { before?: number | null; prefix?: string | null } = {}): Promise<{ entries: ActivityEntry[]; more: boolean; missing: boolean }> {
  let q = db.from("store_activity_log").select("id, created_at, actor, action, subject_type, subject_id, subject_label, meta").eq("creator_id", creatorId)
  if (opts.before) q = q.lt("id", opts.before)
  /*
    The same groups the page draws (lib/activity/actions groupOf): an offer is
    a Products change, and Settings is everything that is not a product, an
    offer, an order or a file. Offers used to come back under Settings here
    and under Products on the page.
  */
  if (opts.prefix === "settings.") q = q.not("action", "like", "product.%").not("action", "like", "offer.%").not("action", "like", "order.%").not("action", "like", "file.%")
  else if (opts.prefix === "product.") q = q.or("action.like.product.%,action.like.offer.%")
  else if (opts.prefix) q = q.like("action", `${opts.prefix}%`)
  const { data, error } = await q.order("id", { ascending: false }).limit(ACTIVITY_PAGE + 1)
  if (error) {
    const missing = error.code === "42P01" || error.code === "PGRST205"
    if (!missing) console.error(`[activity] read failed: ${loggable(error)}`)
    return { entries: [], more: false, missing }
  }
  const rows = (data ?? []) as Row[]
  return {
    entries: rows.slice(0, ACTIVITY_PAGE).map((r) => ({ id: r.id, createdAt: r.created_at, actor: r.actor, action: r.action, subjectType: r.subject_type, subjectId: r.subject_id, subjectLabel: r.subject_label, meta: r.meta ?? {} })),
    more: rows.length > ACTIVITY_PAGE,
    missing: false,
  }
}

/** A tax region as the log names it: its tax and where, "TVA (RO)". */
export function taxRegionLabel(r: { name?: unknown; country?: unknown; region?: unknown } | null | undefined): string | null {
  if (!r) return null
  const where = [r.country, r.region].filter((v) => typeof v === "string" && v).join(", ")
  const name = typeof r.name === "string" && r.name.trim() ? r.name.trim() : "Tax"
  return where ? `${name} (${where})` : name
}
