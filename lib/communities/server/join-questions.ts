import "server-only"

/**
 * ===========================================================================
 *  QUESTIONS BEFORE JOINING, ON THE SERVER (round 32)
 * ===========================================================================
 * The reads and writes behind Settings › Access › Questions before joining,
 * the join form and Members › Requests. Every function takes a community
 * the caller already checked: the admin routes through
 * requireCreatorCommunity (manage_settings to write the questions,
 * approve_member to read the answers), the join route through the signed in
 * person joining. Both tables are server only (run-now part 189): nobody
 * reads them from a browser.
 *
 * Before part 189 runs every read answers "not ready" with no questions, so
 * joining is exactly what it was.
 */
import { csvRow } from "@/components/community/creator/logic"
import { answerText, checkJoinQuestions, readJoinAnswers, readJoinQuestions, type JoinAnswer, type JoinQuestion } from "../join-questions"
import { peopleOf } from "./moderation"
import { audit } from "./audit"
import { missing, nowIso, reasonOf, type Db } from "./db"

export interface JoinForm {
  /** Part 189 has run. */
  ready: boolean
  questions: JoinQuestion[]
}

export async function readJoinForm(db: Db, communityId: string): Promise<JoinForm> {
  try {
    const { data, error } = await db.from("community_join_forms").select("questions").eq("community_id", communityId).maybeSingle()
    if (error) {
      if (!missing(error)) console.error(`[communities] join form read: ${reasonOf(error)}`)
      return { ready: !missing(error), questions: [] }
    }
    return { ready: true, questions: readJoinQuestions((data as { questions?: unknown } | null)?.questions) }
  } catch (e) {
    console.error(`[communities] join form read: ${reasonOf(e)}`)
    return { ready: false, questions: [] }
  }
}

export type FormResult = { ok: true; questions: JoinQuestion[] } | { ok: false; status: number; error: string; index?: number }

/** Saves the questions as the editor sent them (checked first), and writes the change to the audit log. */
export async function saveJoinForm(db: Db, a: { communityId: string; actorId: string; raw: unknown }): Promise<FormResult> {
  const checked = checkJoinQuestions(a.raw)
  if (checked.ok === false) return { ok: false, status: 400, error: checked.error, index: checked.index }
  const { error } = await db.from("community_join_forms").upsert({ community_id: a.communityId, questions: checked.value, updated_by: a.actorId, updated_at: nowIso() }, { onConflict: "community_id" })
  if (error) {
    if (missing(error)) return { ok: false, status: 503, error: "not_ready" }
    console.error(`[communities] join form save: ${reasonOf(error)}`)
    return { ok: false, status: 500, error: "The questions did not save. Try again." }
  }
  await audit(db, { communityId: a.communityId, actorId: a.actorId, actorKind: "member", action: "join_form.saved", targetType: "community", targetId: a.communityId, detail: { questions: checked.value.length } })
  return { ok: true, questions: checked.value }
}

/** Keeps what somebody answered (one row per community and person; answering again replaces it). False when it could not be kept. */
export async function saveJoinAnswers(db: Db, a: { communityId: string; userId: string; answers: JoinAnswer[] }): Promise<boolean> {
  try {
    const { error } = await db.from("community_join_answers").upsert({ community_id: a.communityId, user_id: a.userId, answers: a.answers, submitted_at: nowIso() }, { onConflict: "community_id,user_id" })
    if (error) {
      if (!missing(error)) console.error(`[communities] join answers save: ${reasonOf(error)}`)
      return false
    }
    return true
  } catch (e) {
    console.error(`[communities] join answers save: ${reasonOf(e)}`)
    return false
  }
}

/** Answers for some people, by user id. */
export async function answersOf(db: Db, communityId: string, userIds: string[]): Promise<Map<string, { answers: JoinAnswer[]; submittedAt: string }>> {
  const out = new Map<string, { answers: JoinAnswer[]; submittedAt: string }>()
  const ids = [...new Set(userIds)]
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await db.from("community_join_answers").select("user_id, answers, submitted_at").eq("community_id", communityId).in("user_id", ids.slice(i, i + 150))
    if (error) {
      if (!missing(error)) console.error(`[communities] join answers read: ${reasonOf(error)}`)
      return out
    }
    for (const r of (data as { user_id: string; answers: unknown; submitted_at: string }[] | null) ?? []) out.set(r.user_id, { answers: readJoinAnswers(r.answers), submittedAt: r.submitted_at })
  }
  return out
}

export interface JoinRequestView {
  userId: string
  name: string
  username: string | null
  avatarUrl: string | null
  email: string | null
  requestedAt: string | null
  note: string | null
  /** Approved and waiting to pay. */
  approved: boolean
  answers: JoinAnswer[]
}

export const REQUESTS_PAGE = 100

/**
 * The people waiting for an admin, newest first (up to 100 at a time), with
 * what they answered and the note they wrote. Emails only when the caller
 * may see them (manage_members, as Members decides).
 */
export async function listJoinRequests(db: Db, communityId: string, opts: { withEmail: boolean }): Promise<{ rows: JoinRequestView[]; total: number }> {
  const { data, error, count } = await db
    .from("community_members")
    .select("user_id, requested_at, request_note, approved_by", { count: "exact" })
    .eq("community_id", communityId)
    .eq("status", "pending")
    .order("requested_at", { ascending: false })
    .limit(REQUESTS_PAGE)
  if (error) {
    if (!missing(error)) console.error(`[communities] requests read: ${reasonOf(error)}`)
    return { rows: [], total: 0 }
  }
  const rows = (data as { user_id: string; requested_at: string | null; request_note: string | null; approved_by: string | null }[] | null) ?? []
  const ids = rows.map((r) => r.user_id)
  const [people, answers] = await Promise.all([peopleOf(db, ids, { email: opts.withEmail }), answersOf(db, communityId, ids)])
  return {
    total: typeof count === "number" ? count : rows.length,
    rows: rows.map((r) => {
      const p = people.get(r.user_id)
      return {
        userId: r.user_id,
        name: p?.name ?? "Member",
        username: p?.username ?? null,
        avatarUrl: p?.avatarUrl ?? null,
        email: opts.withEmail ? (p?.email ?? null) : null,
        requestedAt: r.requested_at,
        note: r.request_note,
        approved: Boolean(r.approved_by),
        answers: answers.get(r.user_id)?.answers ?? [],
      }
    }),
  }
}

export const ANSWERS_EXPORT_MAX = 10_000

/**
 * Every answer kept for the community as CSV, newest first: who, their
 * status in the community now, when they answered, then one column per
 * question asked now (by its words) and, after them, any answer to a
 * question that has since been removed, as "question: answer".
 */
export async function answersCsv(db: Db, communityId: string, opts: { withEmail: boolean }): Promise<string> {
  const form = await readJoinForm(db, communityId)
  const rows: { user_id: string; answers: unknown; submitted_at: string }[] = []
  for (let from = 0; from < ANSWERS_EXPORT_MAX; from += 1000) {
    const { data, error } = await db.from("community_join_answers").select("user_id, answers, submitted_at").eq("community_id", communityId).order("submitted_at", { ascending: false }).range(from, from + 999)
    if (error) {
      if (!missing(error)) console.error(`[communities] answers export: ${reasonOf(error)}`)
      break
    }
    const page = (data as typeof rows | null) ?? []
    rows.push(...page)
    if (page.length < 1000) break
  }
  const ids = rows.map((r) => r.user_id)
  const statuses = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await db.from("community_members").select("user_id, status").eq("community_id", communityId).in("user_id", ids.slice(i, i + 150))
    for (const m of (data as { user_id: string; status: string }[] | null) ?? []) statuses.set(m.user_id, m.status)
  }
  const people = await peopleOf(db, ids, { email: opts.withEmail })
  const asked = form.questions
  let out = csvRow(["Name", "Username", ...(opts.withEmail ? ["Email"] : []), "Status", "Answered", ...asked.map((q) => q.label), "Other answers"])
  for (const r of rows) {
    const p = people.get(r.user_id)
    const answers = readJoinAnswers(r.answers)
    const byId = new Map(answers.map((a) => [a.id, a]))
    const other = answers.filter((a) => !asked.some((q) => q.id === a.id)).map((a) => `${a.label}: ${answerText(a)}`).join(" | ")
    out += csvRow([p?.name ?? "Member", p?.username ?? "", ...(opts.withEmail ? [p?.email ?? ""] : []), statuses.get(r.user_id) ?? "left", r.submitted_at, ...asked.map((q) => (byId.has(q.id) ? answerText(byId.get(q.id)!) : "")), other])
  }
  return out
}
