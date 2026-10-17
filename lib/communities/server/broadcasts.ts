import "server-only"

/**
 * ===========================================================================
 *  EMAIL YOUR MEMBERS (round AG)
 * ===========================================================================
 * The owner, or an admin with the settings permission, writes one email (a
 * subject and a message) and it goes to every active member who keeps
 * community emails on (community_members.email_announcements). One row in
 * community_broadcasts (run-now part 217), then a job pages through the
 * members (FANOUT_PAGE at a time) and raises one community.broadcast event per
 * member through sendCommunityEmail, so the suppression list, each member's
 * daily cap on optional email, retries and the unsubscribe footer all apply.
 *
 * ONE A DAY PER COMMUNITY. Members join a community for its content, not for
 * an inbox full of it, and a bulk sender's reputation is everyone's. So a
 * community sends at most one email in any 24 hours (BROADCAST_GAP_MS); the
 * composer says when the next one can go.
 *
 * ONCE PER MEMBER. The event's key is the broadcast and the member, so a job
 * that runs again (a retry, a crash halfway) sends nobody a second copy.
 *
 * The job rides the fanout_announcement queue kind (reason "broadcast"), as a
 * new program does, since the queue's kinds are fixed in SQL.
 */
import type { JobRow } from "../types"
import { missing, nowIso, reasonOf, type Db } from "./db"
import { sendCommunityEmail } from "./email"
import { queueJob } from "./notify"
import type { JobContext, JobOutcome } from "./jobs/index"

export const BROADCAST_GAP_MS = 24 * 60 * 60 * 1000
export const BROADCAST_LIMITS = { subject: 120, message: 4000 } as const
const PAGE = 500
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface BroadcastRow {
  id: string
  subject: string
  status: "sending" | "sent" | "failed"
  sentCount: number
  createdAt: string
  sentAt: string | null
  authorName: string | null
}

export interface MemberEmailsView {
  ready: boolean
  /** Active members who keep community emails on: who a broadcast reaches. */
  audience: number
  /** When the next email may go, or null: now. */
  nextAt: string | null
  recent: BroadcastRow[]
}

/** The subject and message, cleaned, or what is wrong with them. */
export function broadcastInput(body: Record<string, unknown>): { subject: string; message: string } | { error: string; field: "subject" | "message" } {
  // eslint-disable-next-line no-control-regex
  const subject = typeof body.subject === "string" ? body.subject.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim() : ""
  // eslint-disable-next-line no-control-regex
  const message = typeof body.message === "string" ? body.message.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() : ""
  if (subject.length < 3) return { error: "Give the email a subject.", field: "subject" }
  if (subject.length > BROADCAST_LIMITS.subject) return { error: `Keep the subject under ${BROADCAST_LIMITS.subject} characters.`, field: "subject" }
  if (message.length < 10) return { error: "Write a few words for your members.", field: "message" }
  if (message.length > BROADCAST_LIMITS.message) return { error: `Keep the message under ${BROADCAST_LIMITS.message} characters.`, field: "message" }
  return { subject, message }
}

/** When the next email may go after one sent at `lastAt`, or null when it may go now. */
export function nextBroadcastAt(lastAt: string | null | undefined, now = Date.now()): string | null {
  const t = lastAt ? Date.parse(lastAt) : NaN
  if (!Number.isFinite(t)) return null
  const next = t + BROADCAST_GAP_MS
  return next > now ? new Date(next).toISOString() : null
}

/** What the Member emails panel shows: who it reaches, when the next can go, the last few sent. */
export async function loadMemberEmails(db: Db, communityId: string): Promise<MemberEmailsView> {
  const [list, audience] = await Promise.all([
    db.from("community_broadcasts").select("id, subject, status, sent_count, created_at, sent_at, author_id").eq("community_id", communityId).order("created_at", { ascending: false }).limit(5),
    db.from("community_members").select("user_id", { count: "exact", head: true }).eq("community_id", communityId).eq("status", "active").eq("email_announcements", true),
  ])
  if (list.error) {
    if (!missing(list.error)) console.error(`[communities] broadcasts read: ${reasonOf(list.error)}`)
    return { ready: false, audience: audience.count ?? 0, nextAt: null, recent: [] }
  }
  const rows = (list.data as { id: string; subject: string; status: BroadcastRow["status"]; sent_count: number | null; created_at: string; sent_at: string | null; author_id: string | null }[] | null) ?? []
  const authors = [...new Set(rows.map((r) => r.author_id).filter((v): v is string => !!v))]
  const names = new Map<string, string>()
  if (authors.length) {
    const { data } = await db.from("profiles").select("id, display_name, username").in("id", authors)
    for (const p of (data as { id: string; display_name: string | null; username: string | null }[] | null) ?? []) names.set(p.id, p.display_name || p.username || "")
  }
  return {
    ready: true,
    audience: audience.count ?? 0,
    nextAt: nextBroadcastAt(rows[0]?.created_at),
    recent: rows.map((r) => ({ id: r.id, subject: r.subject, status: r.status, sentCount: r.sent_count ?? 0, createdAt: r.created_at, sentAt: r.sent_at, authorName: (r.author_id && names.get(r.author_id)) || null })),
  }
}

/** Saves the email and queues the job that sends it. Refused inside 24 hours of the last one. */
export async function startBroadcast(
  db: Db,
  a: { communityId: string; authorId: string; subject: string; message: string },
): Promise<{ ok: true; broadcast: BroadcastRow; nextAt: string } | { error: string; status: number; nextAt?: string }> {
  const { data: last, error: lastError } = await db.from("community_broadcasts").select("created_at").eq("community_id", a.communityId).order("created_at", { ascending: false }).limit(1).maybeSingle()
  if (lastError) {
    if (missing(lastError)) return { error: "Emailing members needs run-now part 217 in Supabase first.", status: 503 }
    console.error(`[communities] broadcast last read: ${reasonOf(lastError)}`)
    return { error: "Could not send that. Try again.", status: 500 }
  }
  const wait = nextBroadcastAt(last?.created_at)
  if (wait) return { error: "Your community sends one email a day. You can send the next one later.", status: 429, nextAt: wait }
  const { data: row, error } = await db
    .from("community_broadcasts")
    .insert({ community_id: a.communityId, author_id: a.authorId, subject: a.subject, message: a.message, status: "sending" })
    .select("id, subject, status, sent_count, created_at, sent_at")
    .single()
  if (error || !row) {
    console.error(`[communities] broadcast insert: ${reasonOf(error)}`)
    return { error: "Could not send that. Try again.", status: 500 }
  }
  const queued = await queueJob(db, { kind: "fanout_announcement", payload: { reason: "broadcast", communityId: a.communityId, broadcastId: row.id }, idempotencyKey: `broadcast:${row.id}` })
  if (queued === "unavailable") {
    await db.from("community_broadcasts").update({ status: "failed" }).eq("id", row.id)
    return { error: "Could not send that. Try again.", status: 500 }
  }
  return {
    ok: true,
    broadcast: { id: row.id, subject: row.subject, status: row.status, sentCount: 0, createdAt: row.created_at, sentAt: null, authorName: null },
    nextAt: new Date(Date.parse(row.created_at) + BROADCAST_GAP_MS).toISOString(),
  }
}

/** The job: one page of members at a time, by user id, each told once. Hands its cursor back when the run is nearly over. */
export async function fanoutBroadcast(db: Db, payload: JobRow["payload"], ctx: JobContext): Promise<JobOutcome | void> {
  const communityId = typeof payload.communityId === "string" ? payload.communityId : ""
  const broadcastId = typeof payload.broadcastId === "string" ? payload.broadcastId : ""
  if (!UUID.test(communityId) || !UUID.test(broadcastId)) throw new Error("a broadcast needs payload.communityId and payload.broadcastId")
  let after = typeof payload.after === "string" && UUID.test(payload.after) ? payload.after : null
  let sent = typeof payload.sent === "number" && payload.sent >= 0 ? payload.sent : 0

  const { data: b, error: bError } = await db.from("community_broadcasts").select("id, community_id, author_id, subject, message, status").eq("id", broadcastId).maybeSingle()
  if (bError) throw new Error(`broadcast read: ${reasonOf(bError)}`)
  if (!b || b.community_id !== communityId || b.status !== "sending") return
  let authorName = ""
  if (b.author_id) {
    const { data: p } = await db.from("profiles").select("display_name, username").eq("id", b.author_id).maybeSingle()
    authorName = (p?.display_name || p?.username || "").trim()
  }
  const data = { broadcastId, subject: b.subject, message: b.message, authorName }

  for (;;) {
    let read = db.from("community_members").select("user_id").eq("community_id", communityId).eq("status", "active").eq("email_announcements", true).order("user_id", { ascending: true }).limit(PAGE)
    if (after) read = read.gt("user_id", after)
    const { data: rows, error } = await read
    if (error) throw new Error(`members read: ${reasonOf(error)}`)
    const page = (rows as { user_id: string }[] | null) ?? []
    for (const m of page) {
      if (Date.now() > ctx.deadline - 5_000) {
        await db.from("community_broadcasts").update({ sent_count: sent }).eq("id", broadcastId)
        return { again: { payload: { ...payload, after, sent } } }
      }
      const outcome = await sendCommunityEmail(db, "community.broadcast", { userId: m.user_id, communityId, data, key: `broadcast:${broadcastId}` }, { soon: false })
      if (outcome === "queued") sent++
      after = m.user_id
    }
    if (page.length < PAGE) break
  }
  await db.from("community_broadcasts").update({ status: "sent", sent_count: sent, sent_at: nowIso() }).eq("id", broadcastId)
  try {
    const { processSoon } = await import("@/lib/notify/worker")
    processSoon()
  } catch {
    /* the notify cron sends them within five minutes */
  }
}
