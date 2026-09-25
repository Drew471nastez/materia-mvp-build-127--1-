/**
 * ===========================================================================
 *  THE ENGINE'S ROWS IN POSTGRES
 * ===========================================================================
 * lib/notifications/engine.ts NotificationStore on the real database, with
 * the service role. Every promise the engine relies on is kept by Postgres,
 * never by memory (serverless instances share none):
 *
 *   once per dedupe key   INSERT ... ON CONFLICT (creator_id, dedupe_key) DO
 *                         NOTHING, on the unique index
 *                         seller_notifications_once
 *   one run per creator   notification_claim_creators: a lease taken with
 *                         FOR UPDATE SKIP LOCKED
 *   one push per row      UPDATE ... SET pushed_at WHERE pushed_at IS NULL,
 *                         and only the caller that changed the row pushes
 *   resolved once         UPDATE ... WHERE resolved_at IS NULL
 *
 * Before supabase/sql/run-now/XX_notification_rules.sql the function and
 * the columns are missing: claimCreators says null (the engine is not
 * available) and every write fails quietly. Database error text is never
 * logged or returned; codes only.
 */
import type { ExistingRow } from "./types"
import type { NewRow, NotificationStore } from "./engine"

type Db = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

type PgError = { code?: string | null; message?: string | null } | null | undefined

/** The engine's SQL has not run: a function, table or column is not there. */
export function missingSchema(error: PgError): boolean {
  const code = String(error?.code ?? "")
  return code === "PGRST202" || code === "PGRST204" || code === "PGRST205" || code === "42883" || code === "42P01" || code === "42703"
}

export const EXISTING_COLUMNS = "id, creator_id, kind, category, dedupe_key, subject_id, created_at, read_at, dismissed_at, resolved_at, pushed_at, metadata"

/** What a planned row is as a seller_notifications record. */
export function recordOf(row: NewRow): Record<string, unknown> {
  const metadata: Record<string, unknown> = { area: row.area, ...row.data }
  if (row.items) metadata.items = row.items.slice(0, 5)
  if (row.foldedInto) metadata.folded_into = row.foldedInto
  if (row.baseline) metadata.baseline = true
  if (row.pushTitle) metadata.push_title = row.pushTitle
  const silent = row.baseline || !!row.foldedInto
  return {
    creator_id: row.creatorId,
    user_id: row.userId,
    type: row.category,
    title: (row.title || row.kind).slice(0, 200),
    message: (row.message || "").slice(0, 600),
    action_url: row.href,
    product_id: row.productId,
    review_id: row.reviewId,
    metadata,
    kind: row.kind,
    category: row.category,
    priority: row.priority,
    dedupe_key: row.dedupeKey,
    subject_id: row.subject,
    rule_version: row.version,
    created_at: row.at,
    read_at: silent ? row.at : null,
    dismissed_at: silent ? row.at : null,
    resolved_at: row.baseline ? row.at : null,
  }
}

export function supabaseNotificationStore(db: Db, log: (line: string) => void = (l) => console.warn(l)): NotificationStore {
  return {
    async claimCreators(limit, leaseSeconds) {
      const { data, error } = await db.rpc("notification_claim_creators", { p_limit: limit, p_lease_seconds: leaseSeconds })
      if (error) {
        if (!missingSchema(error)) log(`[notifications] could not claim creators (${error.code ?? "unknown"})`)
        return null
      }
      /* A set of uuids comes back as an array of strings, or of one-key rows on some versions. */
      return ((data ?? []) as unknown[])
        .map((v) => (typeof v === "string" ? v : v && typeof v === "object" ? (Object.values(v as Record<string, unknown>)[0] as string) : null))
        .filter((v): v is string => typeof v === "string" && v.length > 0)
    },

    async finishCreators(ids, at) {
      if (ids.length === 0) return
      const { error } = await db.from("notification_creator_state").update({ evaluated_at: at, lease_until: null }).in("creator_id", ids)
      if (error) log(`[notifications] could not finish a batch (${error.code ?? "unknown"})`)
    },

    async existing(creatorIds, since) {
      if (creatorIds.length === 0) return []
      const out: ExistingRow[] = []
      const PAGE = 1000
      for (let page = 0; page < 20; page++) {
        const { data, error } = await db
          .from("seller_notifications")
          .select(EXISTING_COLUMNS)
          .in("creator_id", creatorIds)
          .not("kind", "is", null)
          .or(`resolved_at.is.null,created_at.gte.${since},category.eq.milestone`)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(page * PAGE, page * PAGE + PAGE - 1)
        if (error) {
          if (!missingSchema(error)) log(`[notifications] could not read rows (${error.code ?? "unknown"})`)
          return null
        }
        const rows = (data ?? []) as ExistingRow[]
        out.push(...rows)
        if (rows.length < PAGE) break
      }
      return out
    },

    async insert(row) {
      const record = recordOf(row)
      /* The first review: the review's own row (app/api/reviews) becomes the
         milestone, rather than a second row about the same review. */
      if (row.kind === "first_review" && row.reviewId) {
        const { data } = await db
          .from("seller_notifications")
          .update({ kind: row.kind, category: row.category, priority: row.priority, dedupe_key: row.dedupeKey, subject_id: row.subject, rule_version: row.version, title: record.title, metadata: record.metadata })
          .eq("creator_id", row.creatorId)
          .eq("review_id", row.reviewId)
          .eq("type", "new_review")
          .is("kind", null)
          .select("id")
        const upgraded = (data ?? [])[0] as { id?: string } | undefined
        if (upgraded?.id) return upgraded.id
      }
      let attempt = await db.from("seller_notifications").upsert(record, { onConflict: "creator_id,dedupe_key", ignoreDuplicates: true }).select("id")
      if (attempt.error && String(attempt.error.code) === "23503") {
        /* The product or review went between the read and the write. */
        attempt = await db
          .from("seller_notifications")
          .upsert({ ...record, product_id: null, review_id: null }, { onConflict: "creator_id,dedupe_key", ignoreDuplicates: true })
          .select("id")
      }
      if (attempt.error) {
        if (String(attempt.error.code) === "23505") return null
        throw new Error(`insert failed (${attempt.error.code ?? "unknown"})`)
      }
      const inserted = (attempt.data ?? [])[0] as { id?: string } | undefined
      return inserted?.id ?? null
    },

    async resolve(creatorId, ids, at) {
      if (ids.length === 0) return
      const { error } = await db.from("seller_notifications").update({ resolved_at: at }).eq("creator_id", creatorId).in("id", ids).is("resolved_at", null)
      if (error) throw new Error(`resolve failed (${error.code ?? "unknown"})`)
    },

    async claimPush(id, at) {
      const { data, error } = await db.from("seller_notifications").update({ pushed_at: at }).eq("id", id).is("pushed_at", null).select("id")
      if (error) return false
      return (data ?? []).length === 1
    },
  }
}
