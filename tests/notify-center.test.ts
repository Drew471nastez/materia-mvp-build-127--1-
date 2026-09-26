/**
 * THE NOTIFICATION CENTER: PAGES, EXPIRY, PRIORITY, READ AND UNREAD
 *
 *   1. The list is paged newest first by a cursor (`before`, the last row's
 *      created_at); a full page says another may follow; the next page is
 *      appended without a row twice, and a row read here stays read.
 *   2. What has expired is not listed and not counted on the bell: the
 *      route filters on expires_at in the list, the count and the total.
 *   3. The notification engine's rows carry its priority: critical is the
 *      red dot, important the amber one, and nothing else changes colour.
 *      A tap reads them and they stay.
 *   4. Read and unread: one marked read, all marked read and put back when
 *      the server says no; the bell counts the browser's own to-dos too.
 *   5. The time is relative: "Just now", "12m ago", "3h ago", "Yesterday".
 *   6. The admin's trace and counts (lib/notify/admin-trace.ts) against an
 *      in-memory database: addresses masked, nothing from job data but its
 *      keys, events over jobs over deliveries.
 */
import { readCode } from "./_source"
import { engineTypeOf, isExpired, levelOf, mergePage, notExpiredFilter, oldestOf, pageOf, parseListParams, relativeTime } from "@/lib/notifications/center"
import { staysOnOpen, toneOf } from "@/lib/notifications/panel"
import { EMPTY_STATE, markAllRead, unreadCount } from "@/lib/notifications/unread-state"
import { classifyQuery, groupTrace, maskText, parseDays, summarizeStats, traceDeliveries } from "@/lib/notify/admin-trace"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    const d = detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`
    failures.push(label + d)
    console.log(`  FAIL  ${label}${d}`)
  }
}

/* ── A small in-memory PostgREST: the filters the trace uses ─────────── */
type Row = Record<string, unknown>
class Query {
  private filters: ((r: Row) => boolean)[] = []
  private max = Infinity
  private sortBy: { col: string; asc: boolean } | null = null
  constructor(private rows: Row[], private log: string[], table: string) {
    log.push(table)
  }
  select() {
    return this
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => r[col] === v)
    return this
  }
  in(col: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[col]))
    return this
  }
  ilike(col: string, v: string) {
    this.filters.push((r) => String(r[col] ?? "").toLowerCase() === v.toLowerCase())
    return this
  }
  or(expr: string) {
    const parts = expr.match(/[a-z_]+\.(eq\.("[^"]*"|[^,]+)|in\.\([^)]*\))/g) ?? []
    const tests = parts.map((p) => {
      const [col, op, ...rest] = p.split(".")
      const raw = rest.join(".")
      if (op === "in") {
        const list = raw.slice(1, -1).split(",")
        return (r: Row) => list.includes(String(r[col]))
      }
      const v = raw.startsWith('"') ? raw.slice(1, -1) : raw
      return (r: Row) => String(r[col] ?? "") === v
    })
    this.log.push(`or:${expr}`)
    this.filters.push((r) => tests.some((t) => t(r)))
    return this
  }
  order(col: string, o?: { ascending?: boolean }) {
    this.sortBy = { col, asc: o?.ascending !== false }
    return this
  }
  limit(n: number) {
    this.max = n
    return this
  }
  then(resolve: (v: { data: Row[]; error: null }) => void) {
    let out = this.rows.filter((r) => this.filters.every((f) => f(r)))
    if (this.sortBy) {
      const { col, asc } = this.sortBy
      out = out.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1))
    }
    resolve({ data: out.slice(0, this.max), error: null })
  }
}
function fakeDb(tables: Record<string, Row[]>) {
  const log: string[] = []
  return { log, from: (t: string) => new Query(tables[t] ?? [], log, t), rpc: () => ({ data: null, error: null }) }
}

async function main() {
  console.log("\nPages, by a cursor")
  {
    const p = parseListParams(new URLSearchParams("limit=500&before=2026-09-20T10:00:00.000Z&unread_only=true"))
    check("a page is at most 50", p.limit === 50)
    check("before is read as a time", p.before === "2026-09-20T10:00:00.000Z" && p.unreadOnly)
    check("a before that is not a time is ignored", parseListParams(new URLSearchParams("before=');drop")).before === null)
    check("the defaults: 20, from the top", (() => {
      const d = parseListParams(new URLSearchParams(""))
      return d.limit === 20 && d.offset === 0 && d.before === null && !d.summary
    })())
    check("summary=1 is the bell's count", parseListParams(new URLSearchParams("summary=1")).summary)
    const rows = Array.from({ length: 21 }, (_, i) => ({ id: `n${i}`, created_at: new Date(Date.UTC(2026, 8, 25, 12, 0, 0) - i * 60_000).toISOString() }))
    const full = pageOf(rows, 20)
    check("21 read for a page of 20: 20 kept, and another follows", full.rows.length === 20 && full.hasMore)
    check("the cursor is the last kept row's time", full.nextCursor === rows[19].created_at)
    const last = pageOf(rows.slice(0, 7), 20)
    check("a short page is the last one, with no cursor", !last.hasMore && last.nextCursor === null && last.rows.length === 7)
    const shown = [
      { id: "a", read_at: "2026-09-25T12:00:00Z" },
      { id: "b", read_at: null },
    ]
    const merged = mergePage(shown, [
      { id: "a", read_at: null },
      { id: "c", read_at: null },
    ])
    check("the next page is appended without a row twice", merged.map((r) => r.id).join() === "a,b,c")
    check("and a row read here stays read", merged[0].read_at === "2026-09-25T12:00:00Z")
    check("the oldest time in a list is where the next page starts", oldestOf(rows) === rows[20].created_at && oldestOf([]) === null)

    const route = readCode("app/api/notifications/route.ts")
    check("the route pages by created_at before the cursor, one more than a page", /if \(before\) return q\.lt\("created_at", before\)\.order\("created_at", \{ ascending: false \}\)\.limit\(limit \+ 1\)/.test(route))
    check("and by offset for anything that still sends one", /\.range\(offset, offset \+ limit\)/.test(route))
    check("the pinned rows come with the first page only", /const firstPage = !before && offset === 0/.test(route))
    check("it answers hasMore and nextCursor", /hasMore: more\.hasMore,\s*nextCursor: more\.nextCursor/.test(route))
    const panel = readCode("components/app/notifications-modal.tsx")
    check("the panel asks for the next page with before", /\/api\/notifications\?limit=\$\{PAGE_SIZE\}&before=\$\{encodeURIComponent\(older\.cursor\)\}/.test(panel))
    check("when its foot shows, or its button is pressed", /new IntersectionObserver/.test(panel) && /onClick=\{\(\) => void loadOlder\(\)\}/.test(panel) && /"Show older"/.test(panel))
    check("appending through mergePage", /setDbNotifications\(\(shown\) => mergePage\(shown, rows\)\)/.test(panel))
  }

  console.log("\nExpired is gone")
  {
    const now = Date.UTC(2026, 8, 25, 12)
    check("a time passed is expired", isExpired({ expires_at: "2026-09-25T11:59:59Z" }, now))
    check("one ahead is not", !isExpired({ expires_at: "2026-09-25T12:00:01Z" }, now))
    check("no expiry never expires", !isExpired({ expires_at: null }, now) && !isExpired({}, now))
    check("the filter keeps rows with none or one ahead", notExpiredFilter("2026-09-25T12:00:00.000Z") === "expires_at.is.null,expires_at.gt.2026-09-25T12:00:00.000Z")
    const route = readCode("app/api/notifications/route.ts")
    const count = route.slice(route.indexOf("const countUnread"), route.indexOf("const coveredFor"))
    check("the bell's count leaves expired rows out", /\.or\(notExpiredFilter\(now\)\)/.test(count))
    check("so do the list, the pinned rows and the total", /if \(withExpiry\) q = q\.or\(notExpiredFilter\(now\)\)/.test(route) && (route.match(/if \(withExpiry\) q = q\.or\(notExpiredFilter\(now\)\)/g) ?? []).length === 2 && /if \(schema === "expiry"\) q = q\.or\(notExpiredFilter\(now\)\)/.test(route))
    check("before the engine's SQL it steps down, not out", /schema = "engine"/.test(route) && /schema = "legacy"/.test(route) && /recentQuery\(COLUMNS, true, false\)/.test(route))
    check("the panel drops one that expires while it is open", /dbNotifications\.filter\(\(n\) => !isExpired\(n\)\)/.test(readCode("components/app/notifications-modal.tsx")))
  }

  console.log("\nPriority, quietly")
  {
    const engine = { kind: "PAYOUT_FAILED", metadata: { engine: "notify", notification_type: "PAYOUT_FAILED" } }
    check("an engine row is known by its type", engineTypeOf(engine) === "PAYOUT_FAILED" && engineTypeOf({ kind: "stripe_restricted", metadata: {} }) === null)
    check("its priority is the registry's: a failed payout is critical", levelOf(engine) === "critical", levelOf(engine))
    check("a first sale is important", levelOf({ kind: "FIRST_SALE", metadata: { notification_type: "FIRST_SALE" } }) === "important")
    check("a new sale is neither", levelOf({ kind: "NEW_SALE", metadata: { notification_type: "NEW_SALE" } }) === null)
    check("a priority written in metadata wins", levelOf({ kind: "NEW_SALE", metadata: { notification_type: "NEW_SALE", priority: "critical" } }) === "critical")
    check("an older row says nothing here", levelOf({ kind: "payout_failed", metadata: { priority: 95 } }) === null)
    check("critical is the red dot, important the amber one", toneOf({ category: null, level: "critical" }) === "critical" && toneOf({ category: null, level: "important" }) === "problem" && toneOf({ category: null, level: null }) === null)
    check("the older categories keep theirs", toneOf({ category: "critical" }) === "critical" && toneOf({ category: "problem" }) === "problem" && toneOf({ category: "milestone" }) === null)
    check("a tap on an engine row reads it and it stays", staysOnOpen({ category: "milestone", engine: true }) && !staysOnOpen({ category: "milestone" }))
    const panel = readCode("components/app/notifications-modal.tsx")
    check("the panel gives each row its level and says whether it is the engine's", /level: levelOf\(n\),\s*engine: engineTypeOf\(n\) !== null/.test(panel))
    const item = panel.slice(panel.indexOf("function NotificationItem("), panel.indexOf("export function NotificationBadge"))
    check("no loud colours on a row: no red or amber ground, nothing violet", !/bg-red-|bg-amber-|bg-\[#fe[ef]|8b5cf6/.test(item))
  }

  console.log("\nRead and unread")
  {
    const rows = [
      { id: "a", read_at: null as string | null },
      { id: "b", read_at: "2026-09-25T10:00:00Z" },
      { id: "c", read_at: null as string | null },
    ]
    const state = { ...EMPTY_STATE, dbUnread: 2 }
    check("the bell counts unread rows and the to-dos not read here", unreadCount(state, ["payment-setup"]) === 3)
    const all = markAllRead(rows, state, ["payment-setup"], "2026-09-25T12:00:00Z")
    check("mark all: every row read at once, the bell at nothing", all.rows.every((r) => r.read_at) && unreadCount(all.state, ["payment-setup"]) === 0)
    const back = all.undo(all.rows, all.state)
    check("the server says no: exactly what it changed goes back", back.rows.map((r) => r.read_at === null).join() === "true,false,true" && back.state.dbUnread === 2)
    const panel = readCode("components/app/notifications-modal.tsx")
    check("one row read from its check, on screen before the answer", panel.indexOf("setDbNotifications((rows) => rows.map((r) => (r.id === notification.id ? { ...r, read_at: at } : r)))") < panel.indexOf('body: JSON.stringify({ ids: [notification.id], action: "read" })'))
    check("and put back if the answer is no", /r\.id === notification\.id && r\.read_at === at \? \{ \.\.\.r, read_at: null \}/.test(panel))
    check("a row with a link is followed with the app's navigation", /<Link\s+href=\{notification\.href\}/.test(panel) && /href: panelHref\(n\.action_url\)/.test(panel))
    check("the browser's own to-dos are still drawn", /setupShown\("payment-setup", unread\)/.test(panel) && /setupShown\("onepage-setup", unread\)/.test(panel))
  }

  console.log("\nWhen, relatively")
  {
    const now = new Date(2026, 8, 25, 15, 0, 0)
    const at = (ms: number) => new Date(now.getTime() - ms)
    check("under a minute", relativeTime(at(20_000), now) === "Just now")
    check("minutes", relativeTime(at(12 * 60_000), now) === "12m ago")
    check("hours, today", relativeTime(at(3 * 3_600_000), now) === "3h ago")
    check("yesterday", relativeTime(new Date(2026, 8, 24, 9, 0), now) === "Yesterday")
    check("older: the date", relativeTime(new Date(2026, 8, 11, 9, 0), now) === "Sep 11")
    check("another year: with it", relativeTime(new Date(2025, 8, 11, 9, 0), now) === "Sep 11, 2025")
    check("no date: nothing", relativeTime(new Date(0), now) === null && relativeTime(new Date(Number.NaN), now) === null)
    check("the panel draws it in a <time>", /relativeTime\(notification\.createdAt\)/.test(readCode("components/app/notifications-modal.tsx")))
  }

  console.log("\nThe admin's trace")
  {
    check("an address is an address", classifyQuery("Maker@Example.com").kind === "email" && (classifyQuery("Maker@Example.com") as { value: string }).value === "maker@example.com")
    check("an id is an id, a type a type, anything else a key", classifyQuery("5b0c1d2e-3f40-4a5b-8c6d-7e8f90a1b2c3").kind === "uuid" && classifyQuery("payout_failed").kind === "type" && classifyQuery("stripe:evt_123").kind === "text" && classifyQuery("  ").kind === "empty")
    check("an address in error text is masked", maskText("550 no such user maker@example.com") === "550 no such user ma***@example.com")
    check("7 or 30 days, nothing else", parseDays("30") === 30 && parseDays("365") === 7 && parseDays(null) === 7)

    const U = "11111111-1111-4111-8111-111111111111"
    const db = fakeDb({
      profiles: [{ id: U, email: "maker@example.com" }],
      notification_events: [{ id: "e1", name: "payout.failed", event_key: "stripe:evt_1", occurred_at: "2026-09-25T10:00:00Z", processed_at: "2026-09-25T10:00:02Z", attempts: 1, payload: { secret: "never" } }],
      notification_jobs: [
        { id: "j1", event_id: "e1", type: "PAYOUT_FAILED", state: "sent", recipient_user_id: U, recipient_email: "maker@example.com", run_at: "2026-09-25T10:00:03Z", attempts: 1, max_attempts: 5, data: { amount: 1200, bankLast4: "4242" }, created_at: "2026-09-25T10:00:03Z" },
        { id: "j2", event_id: null, type: "FIRST_PRODUCT_REMINDER", state: "skipped", skip_reason: "CONDITION_NO_LONGER_TRUE", recipient_user_id: U, recipient_email: "maker@example.com", created_at: "2026-09-24T10:00:00Z" },
        { id: "j3", event_id: null, type: "NEW_SALE", state: "sent", recipient_user_id: "someone-else", recipient_email: "other@example.com", created_at: "2026-09-25T11:00:00Z" },
      ],
      notification_deliveries: [
        { id: "d1", job_id: "j1", channel: "email", provider: "mailgun", provider_message_id: "<abc@mg.storelib.com>", status: "bounced", attempt_count: 1, failure_reason: "550 mailbox maker@example.com unavailable", html: "<p>the body</p>", created_at: "2026-09-25T10:00:04Z" },
        { id: "d2", job_id: "j1", channel: "in_app", provider: null, status: "sent", attempt_count: 1, created_at: "2026-09-25T10:00:04Z" },
      ],
    })
    const r = await traceDeliveries(db, { q: "maker@example.com" })
    check("an address finds that person's jobs and nobody else's", r.ok && r.jobs === 2, r)
    if (r.ok) {
      const json = JSON.stringify(r.events)
      check("event over its jobs, jobs with no event after", r.events[0].name === "payout.failed" && r.events[0].key === "stripe:evt_1" && r.events[1].id === null && r.events[1].jobs[0].skipReason === "CONDITION_NO_LONGER_TRUE")
      const job = r.events[0].jobs[0]
      check("a job's state, run at, attempts", job.state === "sent" && job.runAt === "2026-09-25T10:00:03Z" && job.attempts === 1 && job.maxAttempts === 5)
      check("its deliveries: channel, provider, message id, status", job.deliveries.length === 2 && job.deliveries[0].provider === "mailgun" && job.deliveries[0].providerMessageId === "<abc@mg.storelib.com>" && job.deliveries[0].status === "bounced")
      check("the address is masked, and so is one inside a failure reason", job.recipient === "ma***@example.com" && job.deliveries[0].failureReason === "550 mailbox ma***@example.com unavailable")
      check("no full address, no job data values, no payload, no body", !json.includes("maker@example.com") && !json.includes("4242") && !json.includes("never") && !json.includes("the body"))
      check("only the keys the template was given", job.dataKeys.join() === "amount,bankLast4")
    }
    const byKey = await traceDeliveries(db, { q: "stripe:evt_1" })
    check("an event key finds its jobs", byKey.ok && byKey.jobs === 1 && byKey.events[0].jobs[0].id === "j1")
    const byMessage = await traceDeliveries(db, { q: "<abc@mg.storelib.com>" })
    check("a provider message id finds its job", byMessage.ok && byMessage.jobs === 1)
    const byType = await traceDeliveries(db, { q: "", type: "NEW_SALE" })
    check("a type filter", byType.ok && byType.jobs === 1 && byType.events[0].jobs[0].type === "NEW_SALE")
    const byState = await traceDeliveries(db, { state: "skipped" })
    check("a state filter", byState.ok && byState.jobs === 1 && byState.events[0].jobs[0].id === "j2")
    const nothing = await traceDeliveries(db, { q: "no-such-key" })
    check("nothing found is an empty answer, not an error", nothing.ok && nothing.jobs === 0)
    check("grouping keeps the newest event first", groupTrace([{ id: "x", event_id: "a" }, { id: "y", event_id: "b" }], [{ id: "a", occurred_at: "2026-01-01T00:00:00Z" }, { id: "b", occurred_at: "2026-02-01T00:00:00Z" }], []).map((g) => g.id).join() === "b,a")

    const stats = summarizeStats(
      {
        jobs: [
          { type: "NEW_SALE", queued: 2, sent: 10, skipped: 1, cancelled: 0, failed: 0 },
          { type: "PAYOUT_FAILED", queued: 0, sent: 3, skipped: 0, cancelled: 0, failed: 1 },
        ],
        deliveries: [
          { type: "NEW_SALE", channel: "email", sent: 10, delivered: 9, failed: 0, bounced: 1, opened: 4, clicked: 2, unsubscribed: 1, complained: 0 },
          { type: "PAYOUT_FAILED", channel: "email", sent: 3, delivered: 1, failed: 2, bounced: 0, opened: 0, clicked: 0, unsubscribed: 0, complained: 1 },
        ],
        skip_reasons: [{ reason: "PREFERENCE_OFF", n: 1 }],
        lifecycle: [{ type: "FIRST_PRODUCT_REMINDER", reminded: 10, settled: 8, completed: 2 }],
      },
      30,
    )
    check("totals across types, every status", stats.totals.queued === 2 && stats.totals.sent === 13 && stats.totals.delivered === 10 && stats.totals.bounced === 1 && stats.totals.failed === 3 && stats.totals.opened === 4 && stats.totals.clicked === 2 && stats.totals.unsubscribed === 1 && stats.totals.complained === 1, stats.totals)
    check("the type failing most first", stats.topFailing[0].type === "PAYOUT_FAILED" && stats.topFailing[0].failed === 3)
    check("onboarding: the share who did it, of those whose three days are over", stats.lifecycle[0].rate === 0.25)
    check("an answer with nothing in it counts nothing", summarizeStats(null, 7).byType.length === 0 && summarizeStats(null, 7).totals.sent === 0)

    const api = readCode("app/api/admin/notifications/route.ts")
    check("the admin route checks the cookie first", /const denied = await requireAdmin\(\)\s*\n\s*if \(denied\) return denied/.test(api) && api.indexOf("requireAdmin()") < api.indexOf("createAdminClient()"))
    check("the counts are the part 41 function", /db\.rpc\("notification_admin_stats", \{ p_days: days \}\)/.test(api))
    const sql = readCode("supabase/sql/run-now/41_notification_admin.sql")
    check("which is server only", /REVOKE ALL ON FUNCTION public\.notification_admin_stats\(integer\) FROM PUBLIC, anon, authenticated;/.test(sql) && /GRANT EXECUTE ON FUNCTION public\.notification_admin_stats\(integer\) TO service_role;/.test(sql) && /SECURITY DEFINER SET search_path = public/.test(sql))
    check("and has its column in the check after", /as p41_notification_admin/.test(readCode("supabase/sql/run-now/99_check_after.sql")))
    check("a bounce is counted as bounced, not failed as well", /x\.status = 'failed' OR \(x\.failed_at IS NOT NULL AND x\.status <> 'bounced'\)\) AS failed/.test(sql))
    check("a failed job counts only when no delivery already says it failed", /j\.state = 'failed' AND NOT EXISTS \(SELECT 1 FROM public\.notification_deliveries fd WHERE fd\.job_id = j\.id/.test(sql))
    const mig = readCode("supabase/migrations/20261008_notification_admin.sql")
    const statements = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.trim()).filter(Boolean).join("\n")
    check("the migration is the same statements", statements(mig) === statements(sql) && !/^--/m.test(mig) && /NOTIFY pgrst, 'reload schema';\s*$/.test(sql))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

void main()
