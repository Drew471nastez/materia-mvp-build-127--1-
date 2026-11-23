import "server-only"

import { ONLINE_MS } from "@/lib/activity/creator-activity"
import { isMissingActivity } from "@/lib/activity/creator-activity-server"
import { AREAS, LIVE_ONLINE_MS, describeLiveAction, isArea, isLiveAction, isSid, shortSid } from "@/lib/live/live"
import { sampleRate } from "@/lib/live/live-server"
import { maskEmail } from "@/lib/privacy/mask-email"

import type { LiveActionRow, LiveFeedPayload, LiveFeedRow, LiveOverview, LivePayload, LiveSessionPayload, LiveSessionRow, LiveTrailRow, LiveWho } from "../types"
import { Reader, UUID_RE, startOfTodayIso } from "../platform-metrics"
import { creatorRef, one } from "./common"
import { makeCursor, parseCursor } from "./activity"

/**
 * ===========================================================================
 *  WHO IS ON STORELIB NOW, AS /admin READS IT (SQL part 477)
 * ===========================================================================
 * Four reads behind the admin's lock (app/api/admin/platform/live?part=…):
 *
 *   part=overview  one call to platform_live_overview (online now by area,
 *                  signed in, countries, sessions today) plus round 59's two
 *                  head counts for creators in /app
 *   part=sessions  who was seen in the last two minutes, 100 at most, on the
 *                  last seen index, with creators in /app from round 59
 *   part=session   one tab: its trail of pages, its actions, the orders it
 *                  paid, and the creator page when the account is a creator
 *   part=feed      everyone's actions, 50 a page by id with a cursor,
 *                  filtered by area or by action on their own indexes
 *
 * The overview and the list are polled every 30 seconds while the view is
 * on screen, never while the tab is hidden.
 *
 * MISSING, ASKED EVERY TIME (round 61). Before part 477 has run each read
 * answers `missing`, with Supabase's own words, and nothing is remembered: the
 * next poll asks again, so the view changes the moment the part has run.
 *
 * WHO. An account is named only when the tab's row carries it, which the
 * ingest allows only with the visitor's yes to analytics and no opt out
 * signal (lib/live/live-server mayLink): its display name, else its address
 * masked ("ja***@gmail.com"). Everyone else is "Visitor" and four letters of
 * the tab's random id.
 */

export const LIVE_LIST_LIMIT = 100
export const LIVE_FEED_PAGE = 50
export const LIVE_TRAIL_PAGE = 60

type Answer = { data?: unknown; error?: { code?: string; message?: string } | null; count?: number | null }
type Asked = { data: unknown; count: number | null; missing: boolean; failed: boolean }

export class LiveReads {
  missingReason: string | null = null
  constructor(readonly r: Reader) {}

  async ask(metric: string, table: string, run: () => PromiseLike<Answer>): Promise<Asked> {
    try {
      const a = (await run()) as Answer
      if (a.error && isMissingActivity(a.error)) {
        this.missingReason ??= `${table}: ${[a.error.code, a.error.message].filter(Boolean).join(" ")}`.slice(0, 300)
        return { data: null, count: null, missing: true, failed: false }
      }
      if (a.error) {
        this.r.note(metric, table, a.error)
        return { data: null, count: null, missing: false, failed: true }
      }
      return { data: a.data ?? null, count: typeof a.count === "number" ? a.count : null, missing: false, failed: false }
    } catch (e) {
      this.r.note(metric, table, e)
      return { data: null, count: null, missing: false, failed: true }
    }
  }
}

type SessionDb = {
  sid: string
  started_at: string | null
  last_seen_at: string | null
  area: string
  path: string | null
  host: string | null
  last_action: string | null
  last_action_at: string | null
  pages: number | null
  trail?: unknown
  user_id: string | null
  country: string | null
  device: string | null
  os: string | null
  browser: string | null
  shell: string | null
  source: string | null
}

const SESSION_COLUMNS = "sid, started_at, last_seen_at, area, path, host, last_action, last_action_at, pages, user_id, country, device, os, browser, shell, source"

/* ── Names ─────────────────────────────────────────────────────────────── */

type Named = { label: string; creatorId: string | null }

/** Display names (else masked addresses) and creator ids for the accounts on a page, in two reads. */
export async function namesFor(reads: LiveReads, userIds: string[]): Promise<Map<string, Named>> {
  const ids = [...new Set(userIds.filter((u) => UUID_RE.test(u)))].slice(0, 200)
  const out = new Map<string, Named>()
  if (!ids.length) return out
  const [profiles, creators] = await Promise.all([
    reads.ask("live names", "profiles", () => reads.r.db.from("profiles").select("id, display_name, email").in("id", ids)),
    reads.ask("live creators", "creators", () => reads.r.db.from("creators").select("id, user_id").in("user_id", ids)),
  ])
  const creatorOf = new Map<string, string>()
  for (const c of (creators.data ?? []) as { id: string; user_id: string }[]) if (!creatorOf.has(c.user_id)) creatorOf.set(c.user_id, c.id)
  for (const p of (profiles.data ?? []) as { id: string; display_name: string | null; email: string | null }[]) {
    out.set(p.id, { label: (p.display_name ?? "").trim() || (p.email ? maskEmail(p.email) : "Signed in"), creatorId: creatorOf.get(p.id) ?? null })
  }
  for (const id of ids) if (!out.has(id)) out.set(id, { label: "Signed in", creatorId: creatorOf.get(id) ?? null })
  return out
}

function whoOf(sid: string, userId: string | null, names: Map<string, Named>): LiveWho {
  if (userId) {
    const n = names.get(userId)
    return { kind: "account", label: n?.label ?? "Signed in", userId, creatorId: n?.creatorId ?? null }
  }
  return { kind: "visitor", label: `Visitor ${shortSid(sid)}` }
}

function rowOf(s: SessionDb, names: Map<string, Named>): LiveSessionRow {
  return {
    id: s.sid,
    who: whoOf(s.sid, s.user_id, names),
    area: s.area,
    path: s.path,
    host: s.host,
    lastAction: s.last_action,
    lastActionAt: s.last_action_at,
    started: s.started_at,
    lastSeen: s.last_seen_at,
    pages: s.pages,
    country: s.country,
    device: s.device,
    os: s.os,
    browser: s.browser,
    shell: s.shell,
    source: s.source,
  }
}

/* ── The line ──────────────────────────────────────────────────────────── */

type OverviewDb = { online?: number; signed_in?: number; areas?: Record<string, number>; countries_now?: [string, number][]; today?: number; today_signed_in?: number; countries_today?: [string, number][] }

/** Anonymous figures scaled back up when tabs are sampled. Signed in figures are never sampled. */
function scale(n: number | null, signed: number | null, rate: number): number | null {
  if (n === null || rate >= 1) return n
  const s = signed ?? 0
  return Math.round(s + Math.max(0, n - s) / rate)
}

export async function liveOverview(reads: LiveReads, now = Date.now()): Promise<{ overview: LiveOverview; missing: boolean }> {
  const r = reads.r
  const since = new Date(now - LIVE_ONLINE_MS).toISOString()
  const today = startOfTodayIso(now)
  const [o, appNow, appToday] = await Promise.all([
    reads.ask("live overview", "platform_live_overview", () => r.db.rpc("platform_live_overview", { p_since: since, p_today: today })),
    reads.ask("creators in /app now", "creator_presence", () => r.db.from("creator_presence").select("user_id", { count: "exact", head: true }).gte("last_seen_at", new Date(now - ONLINE_MS).toISOString())),
    reads.ask("creators in /app today", "creator_presence", () => r.db.from("creator_presence").select("user_id", { count: "exact", head: true }).gte("last_seen_at", today)),
  ])
  const rate = sampleRate()
  const d = (o.data ?? null) as OverviewDb | null
  const app = appNow.count
  const areas: Record<string, number> = {}
  for (const a of AREAS) areas[a] = 0
  if (d?.areas) for (const [k, v] of Object.entries(d.areas)) if (isArea(k) && typeof v === "number") areas[k] = rate < 1 ? Math.round(v / rate) : v
  if (typeof app === "number") areas.app += app
  const signedIn = d ? (d.signed_in ?? 0) + (app ?? 0) : null
  const onlineRaw = d ? (d.online ?? 0) : null
  const online = onlineRaw === null ? null : (scale(onlineRaw, d?.signed_in ?? 0, rate) ?? 0) + (app ?? 0)
  return {
    missing: o.missing,
    overview: {
      online,
      signedIn,
      areas,
      countriesNow: Array.isArray(d?.countries_now) ? d!.countries_now : [],
      today: d ? scale(d.today ?? 0, d.today_signed_in ?? 0, rate) : null,
      todaySignedIn: d ? (d.today_signed_in ?? 0) : null,
      countriesToday: Array.isArray(d?.countries_today) ? d!.countries_today : [],
      creatorsToday: appToday.count,
      sample: rate,
    },
  }
}

/* ── Who is online ─────────────────────────────────────────────────────── */

type PresenceDb = { user_id: string; last_seen_at: string | null; session_started_at: string | null; last_path: string | null; last_action: string | null; last_action_at: string | null; country: string | null; device: string | null; os: string | null; browser: string | null; shell: string | null; creator?: unknown }

export async function liveSessions(reads: LiveReads, area: string | null, now = Date.now()): Promise<{ rows: LiveSessionRow[] | null; missing: boolean }> {
  const r = reads.r
  const since = new Date(now - LIVE_ONLINE_MS).toISOString()
  const wantApp = !area || area === "app"
  const wantTabs = !area || (isArea(area) && area !== "app")
  const [tabs, app] = await Promise.all([
    wantTabs
      ? reads.ask("who is online", "platform_live_sessions", () => {
          let q = r.db.from("platform_live_sessions").select(SESSION_COLUMNS).gte("last_seen_at", since)
          if (area) q = q.eq("area", area)
          return q.order("last_seen_at", { ascending: false }).limit(LIVE_LIST_LIMIT)
        })
      : Promise.resolve({ data: [], count: null, missing: false, failed: false } as Asked),
    wantApp
      ? reads.ask("creators in /app", "creator_presence", () =>
          r.db
            .from("creator_presence")
            .select("user_id, last_seen_at, session_started_at, last_path, last_action, last_action_at, country, device, os, browser, shell, creator:creators(id, slug, display_name)")
            .gte("last_seen_at", new Date(now - ONLINE_MS).toISOString())
            .order("last_seen_at", { ascending: false })
            .limit(LIVE_LIST_LIMIT),
        )
      : Promise.resolve({ data: [], count: null, missing: false, failed: false } as Asked),
  ])
  /* Part 477 missing: still the creators in /app, which part 430 records. */
  if (tabs.failed) return { rows: null, missing: false }
  const sessions = (tabs.missing ? [] : tabs.data ?? []) as SessionDb[]
  const names = await namesFor(reads, sessions.map((s) => s.user_id).filter((u): u is string => !!u))
  const rows = sessions.map((s) => rowOf(s, names))
  for (const p of (app.data ?? []) as PresenceDb[]) {
    const c = creatorRef(one(p.creator as never))
    rows.push({
      id: `app:${p.user_id}`,
      who: { kind: "account", label: c?.name ?? "Creator", userId: p.user_id, creatorId: c?.id ?? null },
      area: "app",
      path: p.last_path,
      host: null,
      lastAction: p.last_action,
      lastActionAt: p.last_action_at,
      started: p.session_started_at,
      lastSeen: p.last_seen_at,
      pages: null,
      country: p.country,
      device: p.device,
      os: p.os,
      browser: p.browser,
      shell: p.shell,
      source: null,
    })
  }
  rows.sort((a, b) => Date.parse(b.lastSeen ?? "") - Date.parse(a.lastSeen ?? ""))
  return { rows: rows.slice(0, LIVE_LIST_LIMIT), missing: tabs.missing }
}

/* ── One tab ───────────────────────────────────────────────────────────── */

type EventDb = { id: number; at: string; sid: string; user_id: string | null; area: string; name: string; path: string | null; host: string | null; order_id: string | null; country: string | null }

function actionOf(e: EventDb): LiveActionRow {
  return { id: e.id, at: e.at, name: e.name, label: describeLiveAction(e.name), area: e.area, path: e.path, host: e.host, orderId: e.order_id }
}

/** The trail as stored ([seconds, area, path], newest last), newest first, checked item by item. */
export function trailOf(raw: unknown): LiveTrailRow[] {
  if (!Array.isArray(raw)) return []
  const out: LiveTrailRow[] = []
  for (const t of raw) {
    if (!Array.isArray(t) || t.length < 3) continue
    const [sec, area, path] = t as unknown[]
    if (typeof sec !== "number" || typeof area !== "string" || typeof path !== "string") continue
    out.push({ at: new Date(sec * 1000).toISOString(), area, path })
  }
  return out.reverse()
}

export async function liveSession(reads: LiveReads, sid: string): Promise<Omit<LiveSessionPayload, "problems" | "notices">> {
  const empty: Omit<LiveSessionPayload, "problems" | "notices"> = { missing: false, session: null, trail: [], actions: [], orders: [] }
  if (!isSid(sid)) return empty
  const r = reads.r
  const [s, ev] = await Promise.all([
    reads.ask("one session", "platform_live_sessions", () => r.db.from("platform_live_sessions").select(`${SESSION_COLUMNS}, trail`).eq("sid", sid).limit(1)),
    reads.ask("one session's actions", "platform_live_events", () => r.db.from("platform_live_events").select("id, at, sid, user_id, area, name, path, host, order_id, country").eq("sid", sid).order("id", { ascending: false }).limit(LIVE_TRAIL_PAGE)),
  ])
  if (s.missing || ev.missing) return { ...empty, missing: true, missingReason: reads.missingReason }
  const row = ((s.data ?? []) as SessionDb[])[0] ?? null
  const events = (ev.data ?? []) as EventDb[]
  const names = await namesFor(reads, row?.user_id ? [row.user_id] : [])
  const orderIds = [...new Set(events.map((e) => e.order_id).filter((o): o is string => !!o && UUID_RE.test(o)))]
  let orders: LiveSessionPayload["orders"] = []
  if (orderIds.length || row?.user_id) {
    const got = await reads.ask("orders of a session", "orders", () => {
      let q = r.db.from("orders").select("id, created_at, amount_cents, currency")
      if (orderIds.length) q = q.in("id", orderIds)
      else {
        const from = row!.started_at ?? new Date().toISOString()
        const to = new Date(Date.parse(row!.last_seen_at ?? from) + 60 * 60_000).toISOString()
        q = q.eq("buyer_id", row!.user_id!).eq("status", "completed").gte("created_at", from).lte("created_at", to)
      }
      return q.order("created_at", { ascending: false }).limit(10)
    })
    orders = ((got.data ?? []) as { id: string; created_at: string; amount_cents: number | null; currency: string | null }[]).map((o) => ({ id: o.id, at: o.created_at, amount: o.amount_cents, currency: o.currency }))
  }
  return {
    missing: false,
    session: row ? rowOf(row, names) : null,
    trail: row ? trailOf(row.trail) : [],
    actions: events.map(actionOf),
    orders,
  }
}

/* ── Everyone's actions ────────────────────────────────────────────────── */

export async function liveFeed(reads: LiveReads, params: { area?: string | null; action?: string | null; before?: string | null }): Promise<Omit<LiveFeedPayload, "problems" | "notices">> {
  const r = reads.r
  const area = isArea(params.area) ? params.area : null
  const action = isLiveAction(params.action) ? params.action : null
  const cursor = parseCursor(params.before)
  const got = await reads.ask("everyone's actions", "platform_live_events", () => {
    let q = r.db.from("platform_live_events").select("id, at, sid, user_id, area, name, path, host, order_id, country")
    if (area) q = q.eq("area", area)
    if (action) q = q.eq("name", action)
    if (cursor) q = q.lt("id", cursor.id)
    return q.order("id", { ascending: false }).limit(LIVE_FEED_PAGE + 1)
  })
  if (got.missing) return { missing: true, missingReason: reads.missingReason, rows: [], next: null }
  if (got.failed) return { missing: false, rows: null, next: null }
  const raw = (got.data ?? []) as EventDb[]
  const page = raw.slice(0, LIVE_FEED_PAGE)
  const names = await namesFor(reads, page.map((e) => e.user_id).filter((u): u is string => !!u))
  const rows: LiveFeedRow[] = page.map((e) => ({ ...actionOf(e), sid: e.sid, who: whoOf(e.sid, e.user_id, names), country: e.country }))
  return { missing: false, rows, next: raw.length > LIVE_FEED_PAGE && rows.length ? makeCursor(rows[rows.length - 1]) : null }
}

/* ── The one entry the admin route calls ───────────────────────────────── */

export async function live(r: Reader, params: URLSearchParams): Promise<Record<string, unknown>> {
  const reads = new LiveReads(r)
  const part = params.get("part")
  if (part === "session") return liveSession(reads, params.get("id") ?? "")
  if (part === "feed") return liveFeed(reads, { area: params.get("area"), action: params.get("action"), before: params.get("before") })
  const [o, s] = await Promise.all([liveOverview(reads), part === "overview" ? Promise.resolve({ rows: null, missing: false }) : liveSessions(reads, params.get("area"))])
  const missing = o.missing || s.missing
  return { missing, missingReason: missing ? reads.missingReason : null, overview: o.overview, sessions: s.rows } satisfies Omit<LivePayload, "problems" | "notices">
}

/**
 * The console's "N on Storelib now", read every 30 seconds on every view:
 * everyone online across the platform once part 477 is in, else the old
 * count of visitors on creators' pages (analytics_events), so the line
 * never goes blank.
 */
export async function liveNow(r: Reader, now = Date.now()): Promise<{ liveNow: number | null; scope: "platform" | "creators" }> {
  const reads = new LiveReads(r)
  const since = new Date(now - LIVE_ONLINE_MS).toISOString()
  const [tabs, app] = await Promise.all([
    reads.ask("on Storelib now", "platform_live_sessions", () => r.db.from("platform_live_sessions").select("sid", { count: "exact", head: true }).gte("last_seen_at", since)),
    reads.ask("creators in /app now", "creator_presence", () => r.db.from("creator_presence").select("user_id", { count: "exact", head: true }).gte("last_seen_at", new Date(now - ONLINE_MS).toISOString())),
  ])
  if (!tabs.missing && tabs.count !== null) {
    const rate = sampleRate()
    return { liveNow: Math.round(tabs.count / rate) + (app.count ?? 0), scope: "platform" }
  }
  const viewSince = new Date(now - 5 * 60_000).toISOString()
  const rows = await r.rows<{ visitor_id: string | null }>("live now", "analytics_events", "visitor_id", (q) => q.eq("event_type", "view").gte("created_at", viewSince).limit(5000))
  return { liveNow: rows ? new Set(rows.map((v) => v.visitor_id).filter(Boolean)).size : null, scope: "creators" }
}
