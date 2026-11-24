import "server-only"

import { describeActivity } from "@/lib/activity/actions"
import { ACTION_GROUPS, ONLINE_MS, describeEvent } from "@/lib/activity/creator-activity"
import { isMissingActivity } from "@/lib/activity/creator-activity-server"

import type { ActivityFeedRow, ActivityPayload, ActivityPlace, ActivitySummary, CreatorActivityPayload, PresenceRow, TimelineRow } from "../types"
import { Reader, UUID_RE, isoDaysAgo, startOfTodayIso } from "../platform-metrics"
import { creatorRef, one } from "./common"

/**
 * ===========================================================================
 *  CREATOR ACTIVITY, AS /admin READS IT (SQL part 430)
 * ===========================================================================
 * Three reads behind the admin's lock (app/api/admin/platform/[section]):
 *
 *   part=online    the line at the top of Creators ("12 online now, 340
 *                  active today, 1,204 live on Storelib") and who is online,
 *                  from creator_presence alone: three head counts and one
 *                  list on its last_seen_at index. Polled every 30 seconds
 *                  while the tab is visible.
 *   part=feed      everyone's newest events, 50 a page, by id with a cursor
 *                  (no count of a table that grows all day), filtered by
 *                  pages, actions or a group of actions.
 *   part=creator   one creator's presence, their sessions in 7 and 30 days,
 *                  where and on what, and their timeline: events by
 *                  (user_id, id) with a cursor, with what they saved in the
 *                  same window from store_activity_log (part 113).
 *
 * Before part 430 has run every read answers "missing" and the console says
 * activity starts recording once it has, with Supabase's own words for what
 * it could not find. Every read asks the database again, so the console
 * changes the moment the part has run.
 */

export const FEED_PAGE = 50
export const TIMELINE_PAGE = 60
export const ONLINE_LIMIT = 100

type Answer = { data?: unknown; error?: { code?: string; message?: string } | null; count?: number | null; missing?: true }
const MISSING_ANSWER = (): Promise<Answer> => Promise.resolve({ data: null, error: null, count: null, missing: true })

type Asked = { data: unknown; count: number | null; missing: boolean; failed: boolean }

async function ask(r: Reader, key: string, metric: string, table: string, run: () => PromiseLike<Answer>): Promise<Asked> {
  /* Asked on every read, never remembered: the admin polls a few small reads, so the moment part 430 is in the database the console shows it. */
  void key
  try {
    const a = (await run()) as Answer
    if (a.error && isMissingActivity(a.error)) {
      lastMissing = `${table}: ${[a.error.code, a.error.message].filter(Boolean).join(" ")}`.slice(0, 300)
      return { data: null, count: null, missing: true, failed: false }
    }
    if (a.error) {
      r.note(metric, table, a.error)
      return { data: null, count: null, missing: false, failed: true }
    }
    return { data: a.data ?? null, count: typeof a.count === "number" ? a.count : null, missing: false, failed: false }
  } catch (e) {
    r.note(metric, table, e)
    return { data: null, count: null, missing: false, failed: true }
  }
}

/** What Supabase said the last time a read found part 430 missing, shown under the note so the reason is never a guess. */
let lastMissing: string | null = null
export function missingReason(): string | null {
  return lastMissing
}

type CreatorEmbed = { id: string; slug: string | null; display_name: string | null } | { id: string; slug: string | null; display_name: string | null }[] | null

type PresenceDb = {
  user_id: string
  first_seen_at?: string | null
  last_seen_at: string | null
  session_started_at: string | null
  last_path: string | null
  last_action: string | null
  last_action_at: string | null
  country: string | null
  device: string | null
  os: string | null
  browser: string | null
  shell: string | null
  live_since?: string | null
  creator?: CreatorEmbed
}

const place = (p: Partial<ActivityPlace>): ActivityPlace => ({ country: p.country ?? null, device: p.device ?? null, os: p.os ?? null, browser: p.browser ?? null, shell: p.shell ?? null })

/** A cursor is "<id>.<ms>": the oldest event on the page before, and its time. */
export function parseCursor(raw: string | null | undefined): { id: number; at: string } | null {
  const m = /^(\d{1,18})\.(\d{10,14})$/.exec(raw ?? "")
  if (!m) return null
  const id = Number(m[1])
  const ms = Number(m[2])
  if (!Number.isSafeInteger(id) || !Number.isFinite(ms)) return null
  return { id, at: new Date(ms).toISOString() }
}

export function makeCursor(row: { id: number | string; at: string }): string {
  return `${row.id}.${Date.parse(row.at)}`
}

/* ── The line and who is online ─────────────────────────────────────────── */

export async function activitySummary(r: Reader, now = Date.now()): Promise<{ summary: ActivitySummary; missing: boolean }> {
  const online = new Date(now - ONLINE_MS).toISOString()
  const [a, b, c] = await Promise.all([
    ask(r, "online-count", "online now", "creator_presence", () => r.db.from("creator_presence").select("user_id", { count: "exact", head: true }).gte("last_seen_at", online)),
    ask(r, "today-count", "active today", "creator_presence", () => r.db.from("creator_presence").select("user_id", { count: "exact", head: true }).gte("last_seen_at", startOfTodayIso(now))),
    ask(r, "live-count", "live on Storelib", "creator_presence", () => r.db.from("creator_presence").select("user_id", { count: "exact", head: true }).not("live_since", "is", null)),
  ])
  return { summary: { onlineNow: a.count, activeToday: b.count, live: c.count }, missing: a.missing || b.missing || c.missing }
}

export async function onlineCreators(r: Reader, now = Date.now()): Promise<{ rows: PresenceRow[] | null; missing: boolean }> {
  const since = new Date(now - ONLINE_MS).toISOString()
  const got = await ask(r, "online-list", "online creators", "creator_presence", () =>
    r.db
      .from("creator_presence")
      .select("user_id, last_seen_at, session_started_at, last_path, last_action, last_action_at, country, device, os, browser, shell, creator:creators(id, slug, display_name)")
      .gte("last_seen_at", since)
      .order("last_seen_at", { ascending: false })
      .limit(ONLINE_LIMIT),
  )
  if (got.missing) return { rows: [], missing: true }
  if (got.failed) return { rows: null, missing: false }
  const rows = ((got.data ?? []) as PresenceDb[]).map((p) => ({
    userId: p.user_id,
    creator: creatorRef(one(p.creator ?? null)),
    lastSeen: p.last_seen_at,
    sessionStarted: p.session_started_at,
    lastPath: p.last_path,
    lastAction: p.last_action,
    lastActionAt: p.last_action_at,
    ...place(p),
  }))
  return { rows, missing: false }
}

/* ── Everyone's feed ────────────────────────────────────────────────────── */

export const FEED_FILTERS = ["all", "pages", "actions", ...ACTION_GROUPS.map((g) => g.id)] as const

type EventDb = { id: number; at: string; kind: "page" | "action"; name: string; session_start?: boolean; creator?: CreatorEmbed }

export async function activityFeed(r: Reader, params: { filter?: string | null; before?: string | null }): Promise<{ feed: { rows: ActivityFeedRow[]; next: string | null } | null; missing: boolean }> {
  const filter = (FEED_FILTERS as readonly string[]).includes(params.filter ?? "") ? params.filter! : "all"
  const cursor = parseCursor(params.before)
  const got = await ask(r, "feed", "activity feed", "creator_activity_events", () => {
    let q = r.db.from("creator_activity_events").select("id, at, kind, name, creator:creators(id, slug, display_name)")
    if (filter === "pages") q = q.eq("kind", "page")
    else if (filter === "actions") q = q.eq("kind", "action")
    else if (filter !== "all") q = q.eq("kind", "action").like("name", `${filter}.%`)
    if (cursor) q = q.lt("id", cursor.id)
    return q.order("id", { ascending: false }).limit(FEED_PAGE + 1)
  })
  if (got.missing) return { feed: { rows: [], next: null }, missing: true }
  if (got.failed) return { feed: null, missing: false }
  const raw = (got.data ?? []) as EventDb[]
  const rows = raw.slice(0, FEED_PAGE).map((e) => ({ id: e.id, at: e.at, kind: e.kind, name: e.name, label: describeEvent(e), creator: creatorRef(one(e.creator ?? null)) }))
  return { feed: { rows, next: raw.length > FEED_PAGE && rows.length ? makeCursor(rows[rows.length - 1]) : null }, missing: false }
}

/* ── One creator ────────────────────────────────────────────────────────── */

type StoreLogDb = { id: number; created_at: string; action: string; subject_label: string | null; meta: Record<string, unknown> | null }

export async function creatorActivity(r: Reader, creatorId: string, before: string | null, now = Date.now()): Promise<Omit<CreatorActivityPayload, "problems" | "notices">> {
  const empty: Omit<CreatorActivityPayload, "problems" | "notices"> = { missing: false, presence: null, liveSince: null, sessions7: null, sessions30: null, places: [], timeline: [], next: null }
  if (!UUID_RE.test(creatorId)) return empty
  const found = await r.rows<{ id: string; user_id: string | null }>("activity creator", "creators", "id, user_id", (q) => q.eq("id", creatorId).limit(1))
  const userId = found?.[0]?.user_id
  if (!userId) return empty
  const cursor = parseCursor(before)

  const [presence, events, s7, s30, starts] = await Promise.all([
    ask(r, "creator-presence", "creator presence", "creator_presence", () =>
      r.db.from("creator_presence").select("user_id, first_seen_at, last_seen_at, session_started_at, last_path, last_action, last_action_at, country, device, os, browser, shell, live_since").eq("user_id", userId).limit(1),
    ),
    ask(r, "creator-events", "creator timeline", "creator_activity_events", () => {
      let q = r.db.from("creator_activity_events").select("id, at, kind, name, session_start").eq("user_id", userId)
      if (cursor) q = q.lt("id", cursor.id)
      return q.order("id", { ascending: false }).limit(TIMELINE_PAGE + 1)
    }),
    ask(r, "creator-sessions-7", "sessions in 7 days", "creator_activity_events", () =>
      r.db.from("creator_activity_events").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("session_start", true).gte("at", isoDaysAgo(7, now)),
    ),
    ask(r, "creator-sessions-30", "sessions in 30 days", "creator_activity_events", () =>
      r.db.from("creator_activity_events").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("session_start", true).gte("at", isoDaysAgo(30, now)),
    ),
    ask(r, "creator-places", "where they signed in from", "creator_activity_events", () =>
      r.db.from("creator_activity_events").select("at, country, device, os, browser, shell").eq("user_id", userId).eq("session_start", true).order("at", { ascending: false }).limit(30),
    ),
  ])
  if (presence.missing || events.missing) return { ...empty, missing: true, missingReason: missingReason() }

  const p = ((presence.data ?? []) as PresenceDb[])[0] ?? null
  let liveSince = p?.live_since ?? null
  if (!liveSince) {
    const live = await ask(r, "creator-live-since", "live on Storelib since", "creator_activity_live_since", () => r.db.rpc("creator_activity_live_since", { p_creator: creatorId }))
    liveSince = typeof live.data === "string" ? live.data : null
  }

  const raw = (events.data ?? []) as EventDb[]
  const more = raw.length > TIMELINE_PAGE
  const page = raw.slice(0, TIMELINE_PAGE)
  const timeline: TimelineRow[] = page.map((e) => ({ id: `e${e.id}`, at: e.at, kind: e.kind, name: e.name, label: describeEvent(e), sessionStart: !!e.session_start }))

  /* What they saved in the same stretch of time (part 113): the server's own record, so a publish or a price change shows even from another device. */
  const upper = cursor?.at ?? new Date(now).toISOString()
  const lower = more && page.length ? page[page.length - 1].at : isoDaysAgo(30, now)
  const saved = await ask(r, "creator-store-log", "what they saved", "store_activity_log", () =>
    r.db.from("store_activity_log").select("id, created_at, action, subject_label, meta").eq("creator_id", creatorId).eq("actor", "person").gte("created_at", lower).lt("created_at", upper).order("created_at", { ascending: false }).limit(TIMELINE_PAGE),
  )
  for (const s of (saved.data ?? []) as StoreLogDb[]) {
    timeline.push({ id: `s${s.id}`, at: s.created_at, kind: "saved", name: s.action, label: describeActivity({ action: s.action, subjectLabel: s.subject_label, meta: s.meta ?? {} }), sessionStart: false })
  }
  timeline.sort((x, y) => Date.parse(y.at) - Date.parse(x.at))

  const seen = new Set<string>()
  const places: CreatorActivityPayload["places"] = []
  for (const row of (starts.data ?? []) as (ActivityPlace & { at: string })[]) {
    const key = [row.country, row.device, row.os, row.browser, row.shell].join("|")
    if (seen.has(key)) continue
    seen.add(key)
    places.push({ at: row.at, ...place(row) })
    if (places.length >= 5) break
  }

  return {
    missing: false,
    presence: p
      ? { firstSeen: p.first_seen_at ?? null, lastSeen: p.last_seen_at, sessionStarted: p.session_started_at, lastPath: p.last_path, lastAction: p.last_action, lastActionAt: p.last_action_at, ...place(p) }
      : null,
    liveSince,
    sessions7: s7.count,
    sessions30: s30.count,
    places,
    timeline,
    next: more && page.length ? makeCursor(page[page.length - 1]) : null,
  }
}

/* ── The one entry the admin route calls ────────────────────────────────── */

export async function activity(r: Reader, params: URLSearchParams): Promise<Record<string, unknown>> {
  lastMissing = null
  const part = params.get("part") ?? "online"
  if (part === "creator") return creatorActivity(r, params.get("id") ?? "", params.get("before"))
  if (part === "feed") {
    const { feed, missing } = await activityFeed(r, { filter: params.get("filter"), before: params.get("before") })
    return { missing, missingReason: missing ? missingReason() : null, summary: null, online: null, feed } satisfies Omit<ActivityPayload, "problems" | "notices">
  }
  const [s, o] = await Promise.all([activitySummary(r), part === "summary" ? Promise.resolve({ rows: null, missing: false }) : onlineCreators(r)])
  return { missing: s.missing || o.missing, missingReason: s.missing || o.missing ? missingReason() : null, summary: s.summary, online: o.rows, feed: null } satisfies Omit<ActivityPayload, "problems" | "notices">
}
