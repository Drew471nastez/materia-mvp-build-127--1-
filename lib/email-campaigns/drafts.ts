/**
 * What the compose page may write to a campaign, cleaned on the server.
 *
 * The page saves as the creator types (debounced), so this is the only
 * place a draft's fields are written from. The body is sanitized for
 * storage here, the audience is checked against what exists, and a segment
 * must be the creator's own.
 */
import "server-only"

import { sanitizeForStorage } from "./sanitize"
import { byteLength } from "./validate"
import { AUDIENCES, isModernSchema, type Db } from "./queue"
import { UUID } from "./route-auth"

export const STORED_BODY_MAX = 400_000

export type DraftPatch = Partial<{
  subject: string
  preview_text: string | null
  body: string
  audience_type: string
  segment_id: string | null
  track_opens: boolean
}>

export type Cleaned = { ok: true; patch: DraftPatch } | { ok: false; status: number; error: string; field?: string }

export async function cleanDraft(db: Db, creatorId: string, input: Record<string, unknown>): Promise<Cleaned> {
  const patch: DraftPatch = {}
  if ("subject" in input) {
    patch.subject = typeof input.subject === "string" ? input.subject.replace(/[\r\n]+/g, " ").slice(0, 300) : ""
  }
  if ("preview_text" in input) {
    const p = typeof input.preview_text === "string" ? input.preview_text.replace(/[\r\n]+/g, " ").slice(0, 300) : ""
    patch.preview_text = p || null
  }
  if ("body" in input) {
    const raw = typeof input.body === "string" ? input.body : ""
    if (byteLength(raw) > STORED_BODY_MAX) return { ok: false, status: 413, field: "body", error: "This email is too long to save. Remove some blocks." }
    patch.body = sanitizeForStorage(raw)
  }
  if ("audience_type" in input) {
    const a = typeof input.audience_type === "string" ? input.audience_type : "all"
    if (!(AUDIENCES as readonly string[]).includes(a)) return { ok: false, status: 400, field: "audience", error: "Choose who this email goes to." }
    patch.audience_type = a
  }
  if ("segment_id" in input) {
    const s = input.segment_id
    if (s === null || s === "" || s === undefined) patch.segment_id = null
    else if (typeof s === "string" && UUID.test(s)) {
      const { data } = await db.from("email_segments").select("id").eq("id", s).eq("creator_id", creatorId).maybeSingle()
      if (!data) return { ok: false, status: 400, field: "audience", error: "That segment no longer exists." }
      patch.segment_id = s
    } else return { ok: false, status: 400, field: "audience", error: "That segment no longer exists." }
  }
  if (patch.audience_type && patch.audience_type !== "segment" && !("segment_id" in patch)) patch.segment_id = null
  /* Only once the column exists (RUN_EMAIL_SENDING.sql); before, opens are always counted. */
  if ("track_opens" in input && (await isModernSchema(db))) patch.track_opens = input.track_opens !== false
  return { ok: true, patch }
}

/**
 * A draft the database refused because of its audience check: before
 * RUN_EMAIL_SENDING.sql the table only accepts all, onepage and
 * store_builder. Said plainly rather than saved as something else.
 */
export async function audienceRefusal(db: Db, error: { code?: string } | null, audience?: string): Promise<string | null> {
  if (error?.code !== "23514") return null
  if (!audience || audience === "all") return null
  const modern = await isModernSchema(db)
  return modern ? "This audience could not be saved. Choose another." : "This audience needs a database update before it can be used. Choose All subscribers for now."
}

export const DRAFT_COLUMNS = "id, subject, preview_text, body, status, audience_type, segment_id, scheduled_at, sent_at, updated_at, created_at, audience_count"
export const DRAFT_COLUMNS_MODERN = `${DRAFT_COLUMNS}, last_error, completed_at, track_opens`
