import "server-only"

/**
 * ===========================================================================
 *  FROM A NEW NOTIFICATION TO THE PERSON'S PHONE
 * ===========================================================================
 * Every row that lands in a person's bell can also reach their phone (the
 * Storelib app on iOS and Android, through lib/push/sender) and any browser
 * they turned notifications on for. This file decides whether it does, and
 * what it says. It is called after a row was NEWLY written (never for a
 * duplicate):
 *
 *   community_notifications  lib/communities/server/notify.ts notifyMember,
 *                            and the fan out jobs (announcements, new events,
 *                            event reminders)
 *   user_notifications       lib/notifications/user-inbox.ts notifyUser, and
 *                            the fan out jobs (followers, past buyers,
 *                            membership posts)
 *   a direct message         lib/communities/server/direct.ts, which has no
 *                            bell row: the other person gets a push
 *
 * WHO NEVER GETS ONE. The person who did it. Somebody whose notify_level in
 * that community is "none", or "mentions" for anything that is not addressed
 * to them (a mention, a reply, a message from the admins, news about their
 * own membership, a direct message). Somebody who turned the push switch off
 * (GET and PATCH /api/me/push; stored in notification_preferences as the
 * category "social" on the channel "push", part 86), or turned off that
 * kind alone (new posts, comments, likes, mentions, messages, events, new
 * followers: lib/notifications/push-kinds.ts, kept on the account's
 * app_metadata). Anything from a community while communities are switched
 * off, since its link would 404.
 *
 * NEW POSTS push to members whose level in that community is "all"
 * (Everything) or the default "important" (Everything but likes), never to
 * "mentions" or "none", never write a bell row (the feed is where a post is), and
 * have a window of their own per community (group "p:<id>"), so a busy
 * afternoon is one push and then "4 new posts", and a like on your post is
 * never held behind somebody else's post.
 *
 * LIKES are one bell row per post per window (lib/communities/server/
 * notify.ts): "7 people liked your post". The row is new for the first like
 * and rewritten for the rest, and each rewrite takes the same road as a new
 * row here, so the phone hears "Mara liked your post" at once and "7 people
 * liked your post" when the five minutes close.
 *
 * RIGHT AWAY OR ONE AT A TIME. Mentions, replies, direct messages,
 * announcements, event reminders, a waitlist spot opening, approvals and
 * admin messages push at once. Everything else (likes, comments on your post,
 * new events, level ups, new followers, a followed creator's new product or
 * community, a membership post) is low priority: the first one pushes at
 * once, and anything more in the same community (or from the same source of
 * the bell: following, purchases) within five minutes is held. When the five
 * minutes are over one push_digest job sends what was held as one line,
 * "3 new likes and 2 new comments", and opens a new five minutes. So a post
 * that takes off is two pushes, not two hundred.
 *
 * The five minutes are counted in rate_limit_hits (part 01, already there:
 * one row per push sent, swept after an hour), bucket "push-coalesce",
 * subject "<user>|<group>". The held line is a community_jobs row of kind
 * push_digest, once per window (its idempotency key names the push that
 * opened it). Before part 86 runs that kind is refused: the first push still
 * goes, the rest stay in the bell only.
 *
 * FAN OUTS NEVER PUSH THOUSANDS IN A REQUEST. A job hands its page of fresh
 * rows to pushFanout, which keeps only people with a registered device (one
 * read), reads their switches and windows in one read each, and sends ten at
 * a time until the job's time is nearly spent. What is left goes back to the
 * job as `pushLeft` in its payload and is sent first in the next run.
 *
 * WHERE A TAP GOES. data.url, a path on storelib.com (the row's own link, a
 * direct message's ?dm= link). lib/push/tap.ts is the app's side of it and
 * lib/push/sender.ts the browser's.
 */
import { after } from "next/server"

import type { PushPayload } from "@/lib/push/sender"
import type { AccessRuleJson, NotificationKind, NotifyLevel, Role } from "@/lib/communities/types"
import { evaluateAccess, type AccessViewer } from "@/lib/communities/access"
import { missing, reasonOf, type Db } from "@/lib/communities/server/db"
import type { UserNotificationKind, UserNotificationSource } from "./user-inbox-shared"
import { NOTIFY_META_KEY, kindAllowed, pushKindOf, readNotifyChoice, type NotifyChoice } from "./push-kinds"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/* ── The rules, pure ────────────────────────────────────────────────────── */

export type PushKind = NotificationKind | UserNotificationKind | "dm" | "post"
export type PushPriority = "now" | "coalesce"

/** One push per person per group for low priority kinds in this long. */
export const PUSH_WINDOW_MS = 5 * 60_000
/** Where the windows are counted (rate_limit_hits.bucket). */
export const PUSH_GATE_BUCKET = "push-coalesce"
/** Where the person's switch is kept (notification_preferences, part 86). */
export const PUSH_SWITCH = { category: "social", channel: "push" } as const
/** Pushes in flight at once from a job. */
export const PUSH_CONCURRENCY = 10
/** A job stops sending this long before its deadline and hands the rest back. */
export const PUSH_SEND_MARGIN_MS = 6_000
/** One device's send is given up on after this long, so one slow phone never holds a page. */
export const PUSH_SEND_TIMEOUT_MS = 8_000

export const PUSH_TITLE_MAX = 60
export const PUSH_BODY_MAX = 180

/** The kinds that push at once, every time. */
export const IMMEDIATE_KINDS: readonly PushKind[] = ["mention", "reply", "dm", "announcement", "event_reminder", "membership", "admin_message"]

/** What "mentions only" still pushes: what is addressed to the person. */
export const ADDRESSED_KINDS: readonly PushKind[] = ["mention", "reply", "admin_message", "membership", "dm"]

export function pushPriority(kind: string, dedupeKey?: string | null): PushPriority {
  if ((IMMEDIATE_KINDS as readonly string[]).includes(kind)) return "now"
  /* "A spot opened: you are going" is an event row about the person alone. */
  if (kind === "event" && typeof dedupeKey === "string" && dedupeKey.startsWith("event_promoted:")) return "now"
  return "coalesce"
}

/** Whether a member's notify_level in a community lets this kind reach their phone. */
export function levelAllowsPush(level: NotifyLevel | null | undefined, kind: string): boolean {
  switch (level ?? "important") {
    case "none":
      return false
    case "mentions":
      return (ADDRESSED_KINDS as readonly string[]).includes(kind)
    case "important":
      return kind !== "reaction"
    default:
      return true
  }
}

/** The group a window is counted in: a community, a source of the bell, a conversation. */
export function communityGroup(communityId: string): string {
  return `c:${communityId}`
}
/** A community's new posts: a window of their own, apart from the community's other news. */
export function postGroup(communityId: string): string {
  return `p:${communityId}`
}
export function sourceGroup(source: UserNotificationSource): string {
  return `s:${source}`
}
export function conversationGroup(conversationId: string): string {
  return `dm:${conversationId}`
}
export function gateSubject(userId: string, group: string): string {
  return `${userId}|${group}`
}

/** Only a path on storelib.com is ever handed to a phone. */
export function safePushUrl(url: unknown): string | null {
  if (typeof url !== "string") return null
  const u = url.trim()
  if (!u.startsWith("/") || u.startsWith("//") || u.startsWith("/\\") || u.length > 500) return null
  if (/[\s<>"'`\u0000-\u001f\u007f]/.test(u)) return null
  return u
}

function clip(text: string, max: number): string {
  const t = text.replace(/[ \t]+/g, " ").trim()
  return t.length <= max ? t : `${t.slice(0, max - 3).trimEnd()}...`
}

function oneLine(text: string | null | undefined): string {
  return String(text ?? "").replace(/\s+/g, " ").trim()
}

export interface PushContent {
  title: string
  body: string
  url: string
  kind: string
  collapseKey?: string
}

/** The payload lib/push/sender takes, from what a push says. */
export function payloadOf(c: PushContent): PushPayload {
  const data: Record<string, string> = { type: "inbox", kind: c.kind, url: c.url }
  return { title: c.title, body: c.body, data, ...(c.collapseKey ? { collapseKey: c.collapseKey } : {}) }
}

/**
 * A community row as a push: the community's name on top, what happened
 * under it, and the words someone wrote on a second line. A title that
 * already starts with the community's name ("Loft: New workshop") drops it.
 */
export function communityPushContent(row: { kind: string; title: string; body?: string | null; url: string }, communityName: string | null): PushContent | null {
  const url = safePushUrl(row.url)
  if (!url) return null
  const name = oneLine(communityName) || "Storelib"
  let line = oneLine(row.title)
  if (line.toLowerCase().startsWith(`${name.toLowerCase()}: `)) line = line.slice(name.length + 2)
  const extra = oneLine(row.body)
  const body = extra ? `${clip(line, 100)}\n${clip(extra, PUSH_BODY_MAX - Math.min(100, line.length) - 1)}` : clip(line, PUSH_BODY_MAX)
  return { title: clip(name, PUSH_TITLE_MAX), body, url, kind: row.kind }
}

/** A row of the person's own inbox as a push: its line on top, its detail under. */
export function userPushContent(row: { kind: string; title: string; body?: string | null; url: string }): PushContent | null {
  const url = safePushUrl(row.url)
  if (!url) return null
  return { title: clip(oneLine(row.title) || "Storelib", PUSH_TITLE_MAX), body: clip(oneLine(row.body), PUSH_BODY_MAX), url, kind: row.kind }
}

/** A direct message: who wrote, what they wrote. One banner per conversation (the newest replaces the last). */
export function directMessageContent(m: { senderName: string; text: string; communitySlug: string; senderId: string; conversationId: string }): PushContent | null {
  const url = safePushUrl(`/community/${m.communitySlug}?dm=${m.senderId}`)
  if (!url || !UUID.test(m.senderId)) return null
  return { title: clip(oneLine(m.senderName) || "New message", PUSH_TITLE_MAX), body: clip(oneLine(m.text) || "Sent you a message", PUSH_BODY_MAX), url, kind: "dm", collapseKey: conversationGroup(m.conversationId) }
}

/** How a held kind is counted in a summary line. */
const NOUNS: Record<string, readonly [string, string]> = {
  reaction: ["new like", "new likes"],
  comment: ["new comment", "new comments"],
  event: ["new event", "new events"],
  course_available: ["new course", "new courses"],
  level_up: ["level up", "level ups"],
  report: ["new report", "new reports"],
  join_request: ["request to join", "requests to join"],
  new_follower: ["new follower", "new followers"],
  followed_new_product: ["new product", "new products"],
  purchased_creator_new_product: ["new product", "new products"],
  followed_new_community: ["new community", "new communities"],
  membership_post: ["new post", "new posts"],
  post: ["new post", "new posts"],
}

/** "3 new likes", "3 new likes and 2 new comments", "3 new likes, 2 new comments and 1 new event". */
export function summaryLine(kinds: readonly string[]): string {
  const counts = new Map<string, { n: number; nouns: readonly [string, string] }>()
  for (const k of kinds) {
    const nouns = NOUNS[k] ?? (["update", "updates"] as const)
    const key = nouns[0]
    const had = counts.get(key)
    counts.set(key, { n: (had?.n ?? 0) + 1, nouns })
  }
  const parts = [...counts.values()].sort((a, b) => b.n - a.n).map((c) => `${c.n} ${c.n === 1 ? c.nouns[0] : c.nouns[1]}`)
  if (parts.length <= 1) return parts[0] ?? ""
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
}

export interface HeldRow {
  kind: string
  title: string
  body: string | null
  url: string | null
}

/**
 * What was held in a window, as one push. One row reads as itself. More
 * read as a count; the tap opens the one place they share (the same post),
 * or the community's notifications, or the newest one's page.
 */
export function digestContent(rows: readonly HeldRow[], scope: { group: string; communityName?: string | null; communitySlug?: string | null }): PushContent | null {
  const usable = rows.filter((r) => safePushUrl(r.url))
  if (usable.length === 0) return null
  const community = /^[cp]:/.test(scope.group)
  if (usable.length === 1) {
    const r = usable[0]
    return community ? communityPushContent({ kind: r.kind, title: r.title, body: r.body, url: r.url! }, scope.communityName ?? null) : userPushContent({ kind: r.kind, title: r.title, body: r.body, url: r.url! })
  }
  const urls = new Set(usable.map((r) => r.url))
  const url =
    urls.size === 1
      ? usable[0].url!
      : community && scope.communitySlug
        ? scope.group.startsWith("p:")
          ? `/community/${scope.communitySlug}`
          : `/community/${scope.communitySlug}/notifications`
        : usable[0].url!
  const title = community ? oneLine(scope.communityName) || "Storelib" : "Storelib"
  return { title: clip(title, PUSH_TITLE_MAX), body: clip(summaryLine(usable.map((r) => r.kind)), PUSH_BODY_MAX), url: safePushUrl(url) ?? usable[0].url!, kind: "digest", collapseKey: `digest:${scope.group}` }
}

/* ── What a push needs from the rest of Storelib ───────────────────────── */

export type PushSender = (userId: string, payload: PushPayload) => Promise<void>

interface Deps {
  sender: PushSender
  communitiesOn: () => Promise<boolean>
  /** How a request's push is put off until after its response (pushSoon). */
  defer: (task: () => Promise<void>) => Promise<void>
}

/** After the response, inside a request; outside one (a script) there is no after(), so now. */
function deferAfterResponse(task: () => Promise<void>): Promise<void> {
  try {
    after(task)
    return Promise.resolve()
  } catch {
    return task()
  }
}

const DEFAULTS: Deps = {
  sender: (userId, payload) => import("@/lib/push/sender").then((m) => m.sendPushToUser(userId, payload)),
  communitiesOn: () => import("@/lib/communities/flag").then((m) => m.communitiesEnabled()),
  defer: deferAfterResponse,
}

let deps: Deps = DEFAULTS

/** For tests: a fake sender and switch, and nothing remembered from before. Null puts the real ones back. */
export function setPushBridgeDeps(next: Partial<Deps> | null): void {
  deps = next ? { ...DEFAULTS, ...next } : DEFAULTS
  choiceCache.clear()
}

/**
 * After the response has gone, inside a request (a reply posted, a follow).
 * Outside one (a script, a test) it runs now and is waited for. A push never
 * fails the thing that caused it.
 */
export function pushSoon(task: () => Promise<unknown>): Promise<void> {
  const safe = () =>
    task().then(
      () => undefined,
      (e) => console.error(`[push-bridge] ${reasonOf(e)}`),
    )
  return deps.defer(safe).catch(() => undefined)
}

/* ── Reads and writes, a page of people at a time ─────────────────────── */

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === "string" && UUID.test(id)))]
}

/**
 * The people who turned the push switch off. No row means on. A missing
 * table reads as everybody on; any other failure throws, so nobody who said
 * no is pushed because a read failed.
 */
export async function pushSwitchedOff(db: Db, userIds: readonly string[]): Promise<Set<string>> {
  const ids = unique(userIds)
  if (ids.length === 0) return new Set()
  const { data, error } = await db.from("notification_preferences").select("user_id, enabled").in("user_id", ids).eq("category", PUSH_SWITCH.category).eq("channel", PUSH_SWITCH.channel)
  if (error) {
    if (missing(error)) return new Set()
    throw new Error(`push switches: ${reasonOf(error)}`)
  }
  return new Set(((data as { user_id: string; enabled: boolean }[] | null) ?? []).filter((r) => r.enabled === false).map((r) => r.user_id))
}

/** The person's switch, for Settings. On unless they turned it off. */
export async function readPushEnabled(db: Db, userId: string): Promise<boolean> {
  try {
    return !(await pushSwitchedOff(db, [userId])).has(userId)
  } catch {
    return true
  }
}

export type SwitchSave = "saved" | "not_set_up" | "failed"

/** Turns the person's push on or off. "not_set_up" before part 86 (the category is refused). */
export async function setPushEnabled(db: Db, userId: string, enabled: boolean): Promise<SwitchSave> {
  if (!UUID.test(userId)) return "failed"
  const { error } = await db
    .from("notification_preferences")
    .upsert({ user_id: userId, category: PUSH_SWITCH.category, channel: PUSH_SWITCH.channel, enabled, source: "settings", updated_at: new Date().toISOString() }, { onConflict: "user_id,category,channel" })
  if (!error) return "saved"
  if (missing(error) || error.code === "23514") return "not_set_up"
  console.error(`[push-bridge] switch not saved: ${reasonOf(error)}`)
  return "failed"
}

/** How many phones and browsers this account has registered, for Settings. */
export async function deviceCount(db: Db, userId: string): Promise<number> {
  try {
    const { count, error } = await db.from("push_tokens").select("id", { count: "exact", head: true }).eq("user_id", userId)
    return error ? 0 : (count ?? 0)
  } catch {
    return 0
  }
}

/**
 * Of these people, the ones a push can reach at all: a phone or browser
 * registered to their account, or another business of their login that may
 * have one (lib/push/sender sends to every device of the login). Everybody
 * else is skipped without a read per person.
 */
export async function reachable(db: Db, userIds: readonly string[]): Promise<Set<string>> {
  const ids = unique(userIds)
  if (ids.length === 0) return new Set()
  const [tokens, asOwner, asMember] = await Promise.all([
    db.from("push_tokens").select("user_id").in("user_id", ids),
    db.from("business_links").select("owner_id").in("owner_id", ids),
    db.from("business_links").select("member_id").in("member_id", ids),
  ])
  const out = new Set<string>()
  for (const r of (tokens.data as { user_id: string }[] | null) ?? []) out.add(r.user_id)
  for (const r of (asOwner.data as { owner_id: string }[] | null) ?? []) out.add(r.owner_id)
  for (const r of (asMember.data as { member_id: string }[] | null) ?? []) out.add(r.member_id)
  return out
}

/* ── The person's kinds (lib/notifications/push-kinds.ts) ──────────────── */

/** A choice read from an account is trusted this long in one server instance; Settings forgets its own at once. */
export const CHOICE_TTL_MS = 30_000
/** Accounts read at once for a page of pushes. */
const CHOICE_READS_AT_ONCE = 10

const choiceCache = new Map<string, { at: number; choice: NotifyChoice | null }>()

/** Forgets what was read for this person (Settings just changed it). */
export function forgetChoice(userId: string): void {
  choiceCache.delete(userId)
}

async function readOneChoice(db: Db, userId: string): Promise<NotifyChoice | null> {
  if (typeof db?.auth?.admin?.getUserById !== "function") return null
  try {
    const { data, error } = await db.auth.admin.getUserById(userId)
    if (error) throw error
    return readNotifyChoice(data?.user?.app_metadata)
  } catch (e) {
    /*
      FAILS OPEN. The kinds are a refinement of the main switch, which is a
      real row and fails closed (pushSwitchedOff). An auth hiccup must not
      silence a reply for everyone who never touched these switches.
    */
    console.error(`[push-bridge] kinds for ${userId}: ${reasonOf(e)}`)
    return null
  }
}

/** What each of these people turned off, read from their accounts a few at a time, kept for a moment. Null: nothing turned off (or unreadable). */
export async function readChoices(db: Db, userIds: readonly string[], now: number = Date.now()): Promise<Map<string, NotifyChoice | null>> {
  const out = new Map<string, NotifyChoice | null>()
  const todo: string[] = []
  for (const id of unique(userIds)) {
    const hit = choiceCache.get(id)
    if (hit && now - hit.at < CHOICE_TTL_MS) out.set(id, hit.choice)
    else todo.push(id)
  }
  for (let i = 0; i < todo.length; i += CHOICE_READS_AT_ONCE) {
    const batch = todo.slice(i, i + CHOICE_READS_AT_ONCE)
    const read = await Promise.all(batch.map((id) => readOneChoice(db, id)))
    batch.forEach((id, j) => {
      out.set(id, read[j])
      choiceCache.set(id, { at: now, choice: read[j] })
    })
  }
  if (choiceCache.size > 5000) choiceCache.clear()
  return out
}

/** The person's own choice, fresh, for Settings. */
export async function readChoice(db: Db, userId: string): Promise<NotifyChoice> {
  forgetChoice(userId)
  return (await readOneChoice(db, userId)) ?? { pushOff: [], emailOff: [] }
}

/** Saves the person's choice on their account. Only the server can write app_metadata. */
export async function saveChoice(db: Db, userId: string, choice: NotifyChoice): Promise<boolean> {
  if (!UUID.test(userId) || typeof db?.auth?.admin?.updateUserById !== "function") return false
  try {
    const { error } = await db.auth.admin.updateUserById(userId, { app_metadata: { [NOTIFY_META_KEY]: { pushOff: choice.pushOff, emailOff: choice.emailOff } } })
    forgetChoice(userId)
    if (error) throw error
    return true
  } catch (e) {
    console.error(`[push-bridge] kinds not saved: ${reasonOf(e)}`)
    return false
  }
}

/** Keeps only the items whose kind the person still wants on their phone. One read per person, only for kinds a switch governs. */
async function byKind<T extends { userId: string; kind: string }>(db: Db, items: T[]): Promise<T[]> {
  const governed = items.filter((i) => pushKindOf(i.kind)).map((i) => i.userId)
  if (governed.length === 0) return items
  const choices = await readChoices(db, governed)
  return items.filter((i) => kindAllowed(choices.get(i.userId), i.kind))
}

/** The last push in each window still open, by subject. */
async function openWindows(db: Db, subjects: readonly string[], now: number): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (subjects.length === 0) return out
  const { data, error } = await db
    .from("rate_limit_hits")
    .select("subject, created_at")
    .eq("bucket", PUSH_GATE_BUCKET)
    .in("subject", [...new Set(subjects)])
    .gte("created_at", new Date(now - PUSH_WINDOW_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(Math.min(2000, subjects.length * 4))
  if (error) {
    /* Without the counter every push goes, as before this file. */
    if (!missing(error)) console.error(`[push-bridge] windows: ${reasonOf(error)}`)
    return out
  }
  for (const r of (data as { subject: string; created_at: string }[] | null) ?? []) if (!out.has(r.subject)) out.set(r.subject, r.created_at)
  return out
}

async function openWindowsFor(db: Db, subjects: readonly string[]): Promise<void> {
  if (subjects.length === 0) return
  const { error } = await db.from("rate_limit_hits").insert([...new Set(subjects)].map((subject) => ({ bucket: PUSH_GATE_BUCKET, subject })))
  if (error && !missing(error)) console.error(`[push-bridge] windows not opened: ${reasonOf(error)}`)
}

let digestRefusedSaid = false

/** One push_digest job per open window, run when it closes. */
async function holdForDigest(db: Db, held: { userId: string; group: string; since: string }[]): Promise<void> {
  const seen = new Set<string>()
  const rows: Record<string, unknown>[] = []
  for (const h of held) {
    const key = `push_digest:${h.userId}:${h.group}:${h.since}`.slice(0, 300)
    if (seen.has(key)) continue
    seen.add(key)
    const closes = Date.parse(h.since) + PUSH_WINDOW_MS + 5_000
    rows.push({ kind: "push_digest", payload: { userId: h.userId, group: h.group, since: h.since }, run_at: new Date(Number.isFinite(closes) ? closes : Date.now() + PUSH_WINDOW_MS).toISOString(), idempotency_key: key })
  }
  if (rows.length === 0) return
  const { error } = await db.from("community_jobs").upsert(rows, { onConflict: "idempotency_key", ignoreDuplicates: true })
  if (!error) return
  /* Before part 86 the queue refuses the kind: held rows stay in the bell. Said once per instance. */
  if (error.code === "23514" || missing(error)) {
    if (!digestRefusedSaid) console.log("[push-bridge] push_digest jobs need part 86; held pushes stay in the bell until it runs")
    digestRefusedSaid = true
    return
  }
  console.error(`[push-bridge] digest not queued: ${reasonOf(error)}`)
}

/* ── Sending ────────────────────────────────────────────────────────────── */

/** Pushes still to send, grouped by what they say: carried in a job's payload as `pushLeft`. */
export type PushLeft = { p: PushPayload; u: string[] }[]

function withTimeout(p: Promise<void>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    p.then(
      () => {
        clearTimeout(timer)
        resolve()
      },
      (e) => {
        clearTimeout(timer)
        console.error(`[push-bridge] send: ${reasonOf(e)}`)
        resolve()
      },
    )
  })
}

/** A `pushLeft` read back from a job's payload: only well formed entries. */
export function readPushLeft(v: unknown): PushLeft {
  if (!Array.isArray(v)) return []
  const out: PushLeft = []
  for (const e of v.slice(0, 50)) {
    const p = (e as { p?: unknown })?.p as PushPayload | undefined
    const u = (e as { u?: unknown })?.u
    if (!p || typeof p.title !== "string" || typeof p.body !== "string" || !Array.isArray(u)) continue
    const url = safePushUrl(p.data?.url)
    if (!url) continue
    out.push({ p: { ...p, data: { ...(p.data ?? {}), url } }, u: unique(u as string[]).slice(0, 5000) })
  }
  return out.filter((e) => e.u.length > 0)
}

/**
 * Sends PUSH_CONCURRENCY at a time until the deadline is near, and hands
 * back what is left in the same shape.
 */
export async function drainPushes(left: PushLeft, opts: { deadline: number }): Promise<PushLeft> {
  const queue: [string, number][] = []
  left.forEach((e, i) => e.u.forEach((u) => queue.push([u, i])))
  let at = 0
  while (at < queue.length && Date.now() < opts.deadline - PUSH_SEND_MARGIN_MS) {
    const batch = queue.slice(at, at + PUSH_CONCURRENCY)
    at += batch.length
    await Promise.all(batch.map(([u, i]) => withTimeout(Promise.resolve().then(() => deps.sender(u, left[i].p)), PUSH_SEND_TIMEOUT_MS)))
  }
  const rest = new Map<number, string[]>()
  for (const [u, i] of queue.slice(at)) rest.set(i, [...(rest.get(i) ?? []), u])
  return [...rest.entries()].map(([i, u]) => ({ p: left[i].p, u }))
}

/* ── The decisions ──────────────────────────────────────────────────────── */

export interface PushItem {
  userId: string
  kind: PushKind
  /** communityGroup(), sourceGroup() or conversationGroup(). */
  group: string
  /** Who did it: never pushed. */
  actorId?: string | null
  dedupeKey?: string | null
  /** The member's notify_level in the community, for a community kind. Left out for the person's own inbox. */
  level?: NotifyLevel | null
  content: PushContent
}

/** A push whose link is a community page: only while communities are switched on (it would answer 404). */
function needsCommunities(i: Pick<PushItem, "group" | "kind">): boolean {
  return i.group.startsWith("c:") || i.group.startsWith("p:") || i.group.startsWith("dm:") || i.kind === "followed_new_community" || i.kind === "post" || i.group === "s:communities"
}

/**
 * Many at once, for a job: who may hear, who has a device, whose window is
 * open; one read each for the page. Sends what it can before the deadline and
 * answers what is left (empty when all went). Never throws.
 */
export async function pushFanout(db: Db, items: readonly PushItem[], opts: { deadline: number; now?: number }): Promise<PushLeft> {
  try {
    const now = opts.now ?? Date.now()
    let list = items.filter((i) => i && UUID.test(i.userId) && i.userId !== i.actorId && safePushUrl(i.content?.url) && (i.level === undefined || levelAllowsPush(i.level, i.kind)))
    if (list.length === 0) return []
    const reach = await reachable(db, list.map((i) => i.userId))
    list = list.filter((i) => reach.has(i.userId))
    if (list.length === 0) return []
    if (list.some(needsCommunities) && !(await deps.communitiesOn())) list = list.filter((i) => !needsCommunities(i))
    if (list.length === 0) return []
    const off = await pushSwitchedOff(db, list.map((i) => i.userId))
    list = list.filter((i) => !off.has(i.userId))
    if (list.length === 0) return []
    list = await byKind(db, list)
    if (list.length === 0) return []

    const coalesced = list.filter((i) => pushPriority(i.kind, i.dedupeKey) === "coalesce")
    const windows = await openWindows(db, coalesced.map((i) => gateSubject(i.userId, i.group)), now)
    const send: PushItem[] = []
    const opened: string[] = []
    const held: { userId: string; group: string; since: string }[] = []
    for (const i of list) {
      if (pushPriority(i.kind, i.dedupeKey) === "now") {
        send.push(i)
        continue
      }
      const subject = gateSubject(i.userId, i.group)
      const since = windows.get(subject)
      if (since) {
        held.push({ userId: i.userId, group: i.group, since })
        continue
      }
      windows.set(subject, new Date(now).toISOString())
      opened.push(subject)
      send.push(i)
    }
    await Promise.all([openWindowsFor(db, opened), holdForDigest(db, held)])

    const byPayload = new Map<string, { p: PushPayload; u: string[] }>()
    for (const i of send) {
      const p = payloadOf(i.content)
      const key = JSON.stringify(p)
      const had = byPayload.get(key)
      if (had) had.u.push(i.userId)
      else byPayload.set(key, { p, u: [i.userId] })
    }
    return await drainPushes([...byPayload.values()], { deadline: opts.deadline })
  } catch (e) {
    console.error(`[push-bridge] fan out: ${reasonOf(e)}`)
    return []
  }
}

export type PushOutcome = "sent" | "held" | "skipped"

/** One person, one new row: the same rules as a fan out, for a request. Never throws. */
export async function pushOne(db: Db, item: PushItem, now: number = Date.now()): Promise<PushOutcome> {
  try {
    if (!UUID.test(item.userId) || item.userId === item.actorId || !safePushUrl(item.content?.url)) return "skipped"
    if (item.level !== undefined && !levelAllowsPush(item.level, item.kind)) return "skipped"
    /* Nobody with a phone or browser to reach: nothing to decide, nothing to count. */
    if (!(await reachable(db, [item.userId])).has(item.userId)) return "skipped"
    if (needsCommunities(item) && !(await deps.communitiesOn())) return "skipped"
    if ((await pushSwitchedOff(db, [item.userId])).has(item.userId)) return "skipped"
    if ((await byKind(db, [item])).length === 0) return "skipped"
    if (pushPriority(item.kind, item.dedupeKey) === "coalesce") {
      const subject = gateSubject(item.userId, item.group)
      const since = (await openWindows(db, [subject], now)).get(subject)
      if (since) {
        await holdForDigest(db, [{ userId: item.userId, group: item.group, since }])
        return "held"
      }
      await openWindowsFor(db, [subject])
    }
    await withTimeout(Promise.resolve().then(() => deps.sender(item.userId, payloadOf(item.content))), PUSH_SEND_TIMEOUT_MS)
    return "sent"
  } catch (e) {
    console.error(`[push-bridge] ${item.dedupeKey ?? item.kind}: ${reasonOf(e)}`)
    return "skipped"
  }
}

/** A community row a job wrote, as a push item. */
export function communityPushItem(
  r: { userId: string; communityId: string; kind: NotificationKind; actorId?: string | null; title: string; body?: string | null; url: string; dedupeKey?: string | null; level?: NotifyLevel | null },
  communityName: string | null,
): PushItem | null {
  const content = communityPushContent({ kind: r.kind, title: r.title, body: r.body, url: r.url }, communityName)
  if (!content) return null
  return { userId: r.userId, kind: r.kind, group: communityGroup(r.communityId), actorId: r.actorId ?? null, dedupeKey: r.dedupeKey ?? null, level: r.level === undefined ? undefined : r.level, content }
}

/**
 * A new post, as a push to one member who hears it (Everything, or the default Everything but likes). There is no bell
 * row for it: the post is in the feed. Its window is the community's posts
 * (postGroup), so the first post of a quiet spell pushes at once and the
 * rest are counted.
 */
export function newPostPushItem(
  r: { userId: string; communityId: string; communitySlug: string; postId: string; actorId: string | null; authorName: string; heading: string; text: string; level: NotifyLevel | null },
  communityName: string | null,
): PushItem | null {
  const content = communityPushContent({ kind: "post", title: `${oneLine(r.authorName) || "A member"} posted`, body: oneLine(r.heading) || oneLine(r.text) || null, url: `/community/${r.communitySlug}/post/${r.postId}` }, communityName)
  if (!content) return null
  return { userId: r.userId, kind: "post", group: postGroup(r.communityId), actorId: r.actorId, dedupeKey: `post:${r.postId}:${r.userId}`, level: r.level, content }
}

/** A row of the person's own inbox a job wrote, as a push item. */
export function userPushItem(r: { userId: string; kind: UserNotificationKind; source: UserNotificationSource; actorId?: string | null; title: string; body?: string | null; url: string; dedupeKey?: string | null }): PushItem | null {
  const content = userPushContent({ kind: r.kind, title: r.title, body: r.body, url: r.url })
  if (!content) return null
  return { userId: r.userId, kind: r.kind, group: sourceGroup(r.source), actorId: r.actorId ?? null, dedupeKey: r.dedupeKey ?? null, content }
}

/**
 * The first thing a fan out job does: send what an earlier run of it could
 * not, before anything new. Answers what is still left (the job hands it back
 * at once) and the payload without it, to carry on from.
 */
export async function carryPushes(payload: Record<string, unknown> | null | undefined, deadline: number): Promise<{ left: PushLeft; payload: Record<string, unknown> }> {
  const { pushLeft, ...rest } = (payload ?? {}) as Record<string, unknown>
  const pending = readPushLeft(pushLeft)
  if (pending.length === 0) return { left: [], payload: rest }
  return { left: await drainPushes(pending, { deadline }), payload: rest }
}

/* ── The three places a row is written ──────────────────────────────────── */

async function communityName(db: Db, communityId: string): Promise<{ name: string; slug: string } | null> {
  const { data } = await db.from("communities").select("name, slug").eq("id", communityId).maybeSingle()
  return (data as { name: string; slug: string } | null) ?? null
}

/** After notifyMember wrote a new row. */
export async function pushCommunityRow(
  db: Db,
  n: { userId: string; communityId: string; kind: NotificationKind; actorId?: string | null; title: string; body?: string | null; url: string; dedupeKey: string; level: NotifyLevel | null },
): Promise<PushOutcome> {
  if (n.actorId && n.actorId === n.userId) return "skipped"
  if (!levelAllowsPush(n.level, n.kind)) return "skipped"
  try {
    const c = await communityName(db, n.communityId)
    const content = communityPushContent({ kind: n.kind, title: n.title, body: n.body, url: n.url }, c?.name ?? null)
    if (!content) return "skipped"
    return await pushOne(db, { userId: n.userId, kind: n.kind, group: communityGroup(n.communityId), actorId: n.actorId, dedupeKey: n.dedupeKey, level: n.level, content })
  } catch (e) {
    console.error(`[push-bridge] ${n.dedupeKey}: ${reasonOf(e)}`)
    return "skipped"
  }
}

/** After notifyUser wrote a new row. */
export async function pushUserRow(db: Db, n: { userId: string; kind: UserNotificationKind; source: UserNotificationSource; actorId?: string | null; title: string; body?: string | null; url: string; dedupeKey: string }): Promise<PushOutcome> {
  const content = userPushContent({ kind: n.kind, title: n.title, body: n.body, url: n.url })
  if (!content) return "skipped"
  return pushOne(db, { userId: n.userId, kind: n.kind, group: sourceGroup(n.source), actorId: n.actorId, dedupeKey: n.dedupeKey, content })
}

/** After a direct message was written: the other person, right away, unless their notify_level is "none". */
export async function pushDirectMessage(
  db: Db,
  m: { communityId: string; communitySlug: string; conversationId: string; senderId: string; recipientId: string; text: string },
): Promise<PushOutcome> {
  if (m.senderId === m.recipientId) return "skipped"
  try {
    const [{ data: member }, { data: sender }] = await Promise.all([
      db.from("community_members").select("status, notify_level").eq("community_id", m.communityId).eq("user_id", m.recipientId).maybeSingle(),
      db.from("profiles").select("display_name, username").eq("id", m.senderId).maybeSingle(),
    ])
    const r = member as { status: string; notify_level: NotifyLevel | null } | null
    if (!r || r.status !== "active") return "skipped"
    const s = sender as { display_name: string | null; username: string | null } | null
    const content = directMessageContent({ senderName: (s?.display_name || (s?.username ? `@${s.username}` : "") || "A member").trim(), text: m.text, communitySlug: m.communitySlug, senderId: m.senderId, conversationId: m.conversationId })
    if (!content) return "skipped"
    return await pushOne(db, { userId: m.recipientId, kind: "dm", group: conversationGroup(m.conversationId), actorId: m.senderId, level: r.notify_level, content })
  } catch (e) {
    console.error(`[push-bridge] message in ${m.conversationId}: ${reasonOf(e)}`)
    return "skipped"
  }
}

/* ── The held pushes, when their window closes (jobs/push_digest.ts) ───── */

const HELD_COMMUNITY_KINDS: readonly NotificationKind[] = ["reaction", "comment", "event", "course_available", "level_up", "report", "join_request"]
const HELD_USER_KINDS: readonly UserNotificationKind[] = ["new_follower", "followed_new_product", "followed_new_community", "membership_post", "purchased_creator_new_product", "system"]
const DIGEST_READ = 100

export interface DigestPayload {
  userId: string
  group: string
  /** When the push that opened the window went. */
  since: string
  /** A later push that opened a newer window, which this one now waits for. */
  anchor?: string
}

export function readDigestPayload(v: unknown): DigestPayload | null {
  const p = (v ?? {}) as Record<string, unknown>
  const userId = typeof p.userId === "string" && UUID.test(p.userId) ? p.userId : null
  const group = typeof p.group === "string" && /^([cp]:[0-9a-f-]{36}|s:(following|purchases|communities|system))$/i.test(p.group) ? p.group : null
  const since = typeof p.since === "string" && Number.isFinite(Date.parse(p.since)) ? p.since : null
  if (!userId || !group || !since) return null
  const anchor = typeof p.anchor === "string" && Number.isFinite(Date.parse(p.anchor)) ? p.anchor : undefined
  return { userId, group, since, ...(anchor ? { anchor } : {}) }
}

/**
 * The new posts a member who hears them has not been pushed about since
 * a window opened, in the spaces they can see. Their posts are not in the
 * bell, so they are read from the feed: published, by someone else, newest
 * first. A space open only through a product is left out here (owning it
 * would be one more read per member); staff and tier members see theirs.
 * Null when the member no longer hears new posts from this community.
 */
async function heldPosts(db: Db, communityId: string, userId: string, since: string): Promise<{ rows: HeldRow[]; name: string; slug: string } | null> {
  const [{ data: member }, c, { data: spaces }] = await Promise.all([
    db.from("community_members").select("status, notify_level, role, tier_id, level").eq("community_id", communityId).eq("user_id", userId).maybeSingle(),
    communityName(db, communityId),
    db.from("community_spaces").select("id, kind, view_access, archived_at").eq("community_id", communityId),
  ])
  const m = member as { status: string; notify_level: NotifyLevel | null; role: Role | null; tier_id: string | null; level: number | null } | null
  if (!m || m.status !== "active" || !c || !levelAllowsPush(m.notify_level, "post")) return null
  const viewer: AccessViewer = { role: m.role ?? "member", active: true, tierId: m.tier_id ?? null, ownedProductIds: [], level: m.level ?? 1 }
  const open = ((spaces as { id: string; kind: string; view_access: unknown; archived_at: string | null }[] | null) ?? [])
    .filter((s) => !s.archived_at && s.kind !== "chat" && evaluateAccess(s.view_access as AccessRuleJson, viewer).ok)
    .map((s) => s.id)
  if (open.length === 0) return null
  const { data, error } = await db
    .from("community_feed_posts")
    .select("id, author_id, title, body_text, created_at")
    .eq("community_id", communityId)
    .eq("status", "published")
    .in("space_id", open)
    .gt("created_at", since)
    .order("created_at", { ascending: false })
    .limit(DIGEST_READ)
  if (error) throw new Error(`held posts: ${reasonOf(error)}`)
  const rows = ((data as { id: string; author_id: string | null; title: string | null; body_text: string | null }[] | null) ?? [])
    .filter((p) => p.author_id !== userId)
    .map((p) => ({ kind: "post", title: oneLine(p.title) || clip(oneLine(p.body_text), 100) || "New post", body: null, url: `/community/${c.slug}/post/${p.id}` }))
  return { rows, name: c.name, slug: c.slug }
}

/**
 * Sends what was held in one window as one push, or waits for a newer
 * window that opened since. Nothing when everything held was read in the
 * bell in the meantime, or the person can no longer hear it.
 */
export async function runPushDigest(db: Db, raw: unknown, now: number = Date.now()): Promise<{ again?: { payload: Record<string, unknown>; runAt: string } } | void> {
  const d = readDigestPayload(raw)
  if (!d) throw new Error("push_digest needs payload.userId, payload.group and payload.since")
  const community = d.group.startsWith("c:")
  const posts = d.group.startsWith("p:")
  if ((community || posts || d.group === "s:communities") && !(await deps.communitiesOn())) return
  if ((await pushSwitchedOff(db, [d.userId])).has(d.userId)) return

  const subject = gateSubject(d.userId, d.group)
  const latest = (await openWindows(db, [subject], now)).get(subject)
  const anchor = Date.parse(d.anchor ?? d.since)
  if (latest && Date.parse(latest) > anchor + 1_000) {
    return { again: { payload: { ...d, anchor: latest }, runAt: new Date(Date.parse(latest) + PUSH_WINDOW_MS + 5_000).toISOString() } }
  }

  let rows: HeldRow[] = []
  let scope: { group: string; communityName?: string | null; communitySlug?: string | null } = { group: d.group }
  if (posts) {
    const held = await heldPosts(db, d.group.slice(2), d.userId, d.since)
    if (!held) return
    rows = held.rows
    scope = { group: d.group, communityName: held.name, communitySlug: held.slug }
  } else if (community) {
    const communityId = d.group.slice(2)
    const [{ data: member }, c] = await Promise.all([
      db.from("community_members").select("status, notify_level").eq("community_id", communityId).eq("user_id", d.userId).maybeSingle(),
      communityName(db, communityId),
    ])
    const m = member as { status: string; notify_level: NotifyLevel | null } | null
    if (!m || m.status !== "active" || !c) return
    const { data, error } = await db
      .from("community_notifications")
      .select("kind, title, body, url, actor_id, created_at")
      .eq("user_id", d.userId)
      .eq("community_id", communityId)
      .in("kind", HELD_COMMUNITY_KINDS as unknown as string[])
      .gt("created_at", d.since)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(DIGEST_READ)
    if (error) throw new Error(`held rows: ${reasonOf(error)}`)
    rows = ((data as (HeldRow & { actor_id: string | null })[] | null) ?? []).filter((r) => r.actor_id !== d.userId && levelAllowsPush(m.notify_level, r.kind))
    scope = { group: d.group, communityName: c.name, communitySlug: c.slug }
  } else {
    const source = d.group.slice(2)
    const { data, error } = await db
      .from("user_notifications")
      .select("kind, title, body, url, actor_id, created_at")
      .eq("user_id", d.userId)
      .eq("source", source)
      .in("kind", HELD_USER_KINDS as unknown as string[])
      .gt("created_at", d.since)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(DIGEST_READ)
    if (error) throw new Error(`held rows: ${reasonOf(error)}`)
    rows = ((data as (HeldRow & { actor_id: string | null })[] | null) ?? []).filter((r) => r.actor_id !== d.userId)
    /* A followed creator's new community is only told while communities are on. */
    if (rows.some((r) => r.kind === "followed_new_community") && !(await deps.communitiesOn())) rows = rows.filter((r) => r.kind !== "followed_new_community")
  }
  rows = await byKind(db, rows.map((r) => ({ ...r, userId: d.userId })))
  const content = digestContent(rows, scope)
  if (!content) return
  await openWindowsFor(db, [subject])
  await withTimeout(Promise.resolve().then(() => deps.sender(d.userId, payloadOf(content))), PUSH_SEND_TIMEOUT_MS)
}
