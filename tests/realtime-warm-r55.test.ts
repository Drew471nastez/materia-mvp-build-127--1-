/**
 * Round 55: two sources of database load.
 *
 * A. LIVE UPDATES BY BROADCAST. The bell, a community's inbox, Home's orders
 *    and a plan set from /admin listened with Realtime postgres_changes, which
 *    has the database check every listener's row level security on every
 *    change to those tables. Now SQL part 370's triggers send the person
 *    concerned "a row of yours changed, this one" on their private topic
 *    `user:<id>` (lib/realtime/own-topic.ts). Until the part has run the
 *    join is refused and each listener opens its old subscription, so nothing
 *    goes quiet. Driven here with a fake realtime client.
 *
 * B. THE WARM AFTER A DEPLOY. It drew every published site's front page,
 *    products page, sitemap and four sitemap pages. Now only sites with a
 *    page view in the last 7 days, their front page, and /products where it
 *    was opened. Counted with a stub database (every query recorded) and a
 *    stub fetch (every page asked for).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { forgetOwnTopics, listenOwn, ownTopic, type OwnPayload } from "@/lib/realtime/own-topic"
import { visitedWebsites, warmListOf, warmPublishedSites, startFrom, VISITED_DAYS, WARM_PATHS } from "@/lib/website-builder/warm-sites"
import { stripComments } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`)
  }
}
const raw = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => stripComments(raw(p))
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))

/* ───────────────────────── a fake realtime client ───────────────────────── */

type Status = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED"
class FakeChannel {
  bindings: { type: string; filter: Record<string, unknown>; cb: (p: unknown) => void }[] = []
  subscribed = false
  removed = false
  constructor(public topic: string, public params: Record<string, unknown>, private client: FakeClient) {}
  on(type: string, filter: Record<string, unknown>, cb: (p: unknown) => void) {
    this.bindings.push({ type, filter, cb })
    return this
  }
  subscribe(cb?: (s: Status) => void) {
    this.subscribed = true
    const answer = this.client.answer(this)
    setTimeout(() => cb?.(answer), 1)
    return this
  }
  /** What the server would push on this topic. */
  push(event: string, payload: OwnPayload) {
    for (const b of this.bindings) if (b.type === "broadcast" && (b.filter.event === "*" || b.filter.event === event)) b.cb({ type: "broadcast", event, payload })
  }
}
class FakeClient {
  channels: FakeChannel[] = []
  setAuthCalls = 0
  constructor(public answer: (ch: FakeChannel) => Status) {}
  realtime = { setAuth: async () => void this.setAuthCalls++ }
  channel(topic: string, params: Record<string, unknown> = {}) {
    const ch = new FakeChannel(topic, params, this)
    this.channels.push(ch)
    return ch
  }
  removeChannel(ch: FakeChannel) {
    ch.removed = true
    return Promise.resolve("ok")
  }
  open() {
    return this.channels.filter((c) => c.subscribed && !c.removed)
  }
}
const asClient = (c: FakeClient) => c as never

async function realtimeChecks() {
  console.log("\nA. Live updates on the person's own topic\n")
  const uid = "00000000-0000-4000-a000-000000000001"

  /* After part 370: the join is accepted. */
  forgetOwnTopics()
  {
    const client = new FakeClient((ch) => (ch.topic === ownTopic(uid) ? "SUBSCRIBED" : "CHANNEL_ERROR"))
    const heard: OwnPayload[] = []
    let fallbacks = 0
    const stopBell = listenOwn(asClient(client), uid, "notification", (p) => heard.push(p), () => void fallbacks++)
    const orders: OwnPayload[] = []
    const stopHome = listenOwn(asClient(client), uid, "order", (p) => orders.push(p), () => void fallbacks++)
    const stopPlan = listenOwn(asClient(client), uid, "plan", () => {}, () => void fallbacks++)
    await tick(20)
    const own = client.channels.filter((c) => c.topic === ownTopic(uid))
    check("one private channel for the whole page, on user:<id>", own.length === 1 && own[0].params && (own[0].params as { config?: { private?: boolean } }).config?.private === true, client.channels.map((c) => c.topic))
    check("  joined with the session's token", client.setAuthCalls >= 1)
    check("  no postgres_changes anywhere once the topic is accepted", fallbacks === 0 && !client.channels.some((c) => c.bindings.some((b) => b.type === "postgres_changes")))
    own[0].push("notification", { table: "user_notifications", op: "insert", id: "n1", unread: true })
    own[0].push("order", { op: "insert", id: "o1", creator_id: "c1" })
    check("each listener hears only its own event", heard.length === 1 && heard[0].id === "n1" && orders.length === 1 && orders[0].id === "o1", { heard, orders })
    stopBell()
    stopHome()
    check("  the channel stays while one listener is left", !own[0].removed)
    stopPlan()
    check("  and goes with the last", own[0].removed)
  }

  /* Before part 370: the join is refused, and every listener opens its old subscription. */
  forgetOwnTopics()
  {
    const client = new FakeClient(() => "CHANNEL_ERROR")
    let opened = 0
    let closed = 0
    const old = () => {
      opened++
      return () => void closed++
    }
    const stopA = listenOwn(asClient(client), uid, "notification", () => {}, old)
    const stopB = listenOwn(asClient(client), uid, "order", () => {}, old)
    await tick(20)
    check("a refused join (part 370 not run) opens each listener's old subscription", opened === 2, opened)
    check("  and lets the refused channel go, so it is not asked again and again", client.channels.filter((c) => c.topic === ownTopic(uid)).every((c) => c.removed))
    const stopC = listenOwn(asClient(client), uid, "plan", () => {}, old)
    await tick(5)
    check("  a listener that comes later on the same page goes straight to the old way", opened === 3 && client.channels.filter((c) => c.topic === ownTopic(uid)).length === 1, { opened, joins: client.channels.length })
    stopA()
    stopB()
    stopC()
    check("  each old subscription is closed with its listener", closed === 3, closed)
  }

  /* A listener gone before the answer leaves nothing open. */
  forgetOwnTopics()
  {
    const client = new FakeClient(() => "CHANNEL_ERROR")
    let opened = 0
    const stop = listenOwn(asClient(client), uid, "notification", () => {}, () => void opened++)
    stop()
    await tick(20)
    check("a listener gone before the join was answered opens nothing", opened === 0 && client.open().length === 0, { opened, open: client.open().map((c) => c.topic) })
  }
  forgetOwnTopics()

  /* The five places that listened with postgres_changes. */
  const files = {
    bell: code("components/notifications/notification-bell.tsx"),
    home: code("components/app/dashboard-client.tsx"),
    plan: code("components/app/plan-watch.tsx"),
    inbox: code("components/community/member/realtime.ts"),
    page: code("components/community/member/notifications.tsx"),
  }
  for (const [name, src] of Object.entries(files)) {
    const listen = src.indexOf("listenOwn(")
    const pg = src.indexOf('"postgres_changes"')
    check(`${name}: listens on the own topic, postgres_changes only inside its fallback`, listen > 0 && (pg === -1 || pg > listen))
  }
  check("Home asks for its orders again on an order of its own store only", /"order",\s*\(p\) => \{\s*if \(!p\.creator_id \|\| p\.creator_id === creatorId\) changed\(\)/.test(files.home))
  check("the bell's badge and list on a new row or a row raised unread, from the payload's flag only", /if \(p\.op === "update"\) raised\(p\.unread !== false\)\s*else arrived\(p\.unread !== false\)/.test(files.bell))
  check("the bell still reads the count when the tab comes back", /document\.addEventListener\("visibilitychange", again\)/.test(files.bell))

  /* The SQL part. */
  const sql = raw("supabase/sql/run-now/370_realtime_own_topic.sql")
  check("part 370 is safe to run again and says so", /Safe to run again\.\s*\*\//.test(sql.split("\n")[0]) && /DROP POLICY IF EXISTS "storelib own topic read"/.test(sql) && (sql.match(/DROP TRIGGER IF EXISTS/g) ?? []).length >= 6)
  check("  does nothing without realtime.messages, realtime.topic() and realtime.send", /to_regclass\('realtime\.messages'\) IS NULL OR to_regprocedure\('realtime\.topic\(\)'\) IS NULL OR to_regprocedure\('realtime\.send\(jsonb,text,text,boolean\)'\) IS NULL THEN RAISE NOTICE[^;]*; RETURN;/.test(sql))
  check("  no trigger when the policy could not be added (no listener could join)", /EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE[^;]*; RETURN; END; IF to_regclass\('public\.user_notifications'\)/.test(sql))
  check("  a person may join only user:<their own id>, read only", /p_topic = 'user:' \|\| \(SELECT auth\.uid\(\)\)::text/.test(sql) && /FOR SELECT TO authenticated USING \(realtime\.messages\.extension = ''broadcast'' AND public\.storelib_own_topic_ok\(realtime\.topic\(\)\)\)/.test(sql) && !/ON realtime\.messages FOR INSERT/.test(sql))
  check("  the sender is the server's only and a failed send never fails the write", /REVOKE ALL ON FUNCTION public\.storelib_tell_owner\(uuid, text, jsonb\) FROM PUBLIC, anon, authenticated, service_role/.test(sql) && (sql.match(/EXCEPTION WHEN OTHERS THEN RETURN/g) ?? []).length >= 5)
  check("  the payloads carry ids and flags only", !/to_jsonb\(NEW\)\)|'title', NEW|'body', NEW|amount_cents', v_row/.test(sql) && /jsonb_build_object\('op', lower\(TG_OP\), 'id', v_row ->> 'id', 'creator_id', v_creator\)/.test(sql))
  check("  an order's email counters do not send: only status, amount, refund, creator or product changes", /column_name IN \('status', 'amount_cents', 'refund_amount_cents', 'refunded_at', 'creator_id', 'product_id'\)/.test(sql))
  const readme = raw("supabase/sql/run-now/README.md")
  const after = raw("supabase/sql/run-now/99_check_after.sql")
  check("README rows and check columns for parts 370 and 371", readme.includes("| `370_realtime_own_topic.sql` |") && readme.includes("| `371_warm_visited_websites.sql` |") && after.includes("as p370_realtime_own_topic") && after.includes("as p371_warm_visited_websites"))
  const bundle = raw("supabase/sql/all-in-two/1_of_2_everything.sql")
  check("  both in the bundle the owner pastes", bundle.includes("-- part 370_realtime_own_topic.sql") && bundle.includes("-- part 371_warm_visited_websites.sql"))
}

/* ───────────────────────── a counting database ───────────────────────── */

type Row = Record<string, unknown>
interface Logged { table: string; select?: string; rpc?: string }
function countingDb(tables: Record<string, Row[]>, rpcs: Record<string, Row[] | null>) {
  const log: Logged[] = []
  const query = (table: string) => {
    const filters: ((r: Row) => boolean)[] = []
    let sel = ""
    let range: [number, number] | null = null
    let single = false
    let lim: number | null = null
    let orderBy: { col: string; asc: boolean } | null = null
    const q = {
      select(s: string) {
        sel = s
        return q
      },
      eq(c: string, v: unknown) {
        filters.push((r) => r[c] === v)
        return q
      },
      in(c: string, v: unknown[]) {
        filters.push((r) => v.includes(r[c]))
        return q
      },
      not(c: string, _op: string, _v: unknown) {
        filters.push((r) => r[c] !== null && r[c] !== undefined)
        return q
      },
      gte(c: string, v: string) {
        filters.push((r) => String(r[c]) >= v)
        return q
      },
      gt(c: string, v: number) {
        filters.push((r) => Number(r[c]) > v)
        return q
      },
      order(col: string, o?: { ascending?: boolean }) {
        orderBy ??= { col, asc: o?.ascending !== false }
        return q
      },
      limit(n: number) {
        lim = n
        return q
      },
      range(a: number, b: number) {
        range = [a, b]
        return q
      },
      maybeSingle() {
        single = true
        return q
      },
      upsert(row: Row) {
        log.push({ table, select: "upsert" })
        tables[table] = [row]
        return Promise.resolve({ data: null, error: null })
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        log.push({ table, select: sel })
        let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
        if (orderBy) {
          const { col, asc } = orderBy
          rows = [...rows].sort((x, y) => (String(x[col]) < String(y[col]) ? -1 : String(x[col]) > String(y[col]) ? 1 : 0) * (asc ? 1 : -1))
        }
        if (range) rows = rows.slice(range[0], range[1] + 1)
        if (lim !== null) rows = rows.slice(0, lim)
        const out = single ? { data: rows[0] ?? null, error: null } : { data: rows, error: null }
        return Promise.resolve(out).then(resolve, reject)
      },
    }
    return q
  }
  return {
    log,
    db: {
      from: (t: string) => query(t),
      rpc: (fn: string) => {
        log.push({ table: `rpc:${fn}`, rpc: fn })
        const rows = rpcs[fn]
        return Promise.resolve(rows === null || rows === undefined ? { data: null, error: { code: "PGRST202", message: "not found" } } : { data: rows, error: null })
      },
    },
  }
}

const DAY = 86_400_000
const NOW = Date.parse("2026-11-06T12:00:00Z")
const day = (n: number) => new Date(NOW - n * DAY).toISOString().slice(0, 10)
/** 120 published websites; 12 of them visited this week, 4 of those on /products; 30 more visited a month ago. */
function shop(): { tables: Record<string, Row[]>; visited: Row[] } {
  const creators: Row[] = []
  const installs: Row[] = []
  const profiles: Row[] = []
  const daily: Row[] = []
  for (let i = 0; i < 120; i++) {
    const id = `c${String(i).padStart(3, "0")}`
    creators.push({ id, user_id: `u${i}`, banned_at: null })
    installs.push({ id: `i${i}`, creator_id: id, status: "published" })
    profiles.push({ id: `u${i}`, username: `shop${i}`, avatar_url: null })
  }
  for (let i = 0; i < 12; i++) daily.push({ creator_id: `c${String(i * 7).padStart(3, "0")}`, property_type: "website", day: day(1), page_views: 20 - i })
  for (let i = 0; i < 30; i++) daily.push({ creator_id: `c${String(i + 40).padStart(3, "0")}`, property_type: "website", day: day(30), page_views: 5 })
  const visited = Array.from({ length: 12 }, (_, i) => ({ creator_id: `c${String(i * 7).padStart(3, "0")}`, views: 20 - i, shop_views: i < 4 ? 3 : 0 }))
  return {
    tables: {
      platform_settings: [],
      analytics_rollup_days: [{ day: day(1) }],
      analytics_property_daily: daily,
      store_theme_installs: installs,
      creators,
      profiles,
      custom_domains: [],
      website_addresses: [],
    },
    visited,
  }
}

function countingFetch() {
  const asked: string[] = []
  const fetcher = (async (url: string | URL) => {
    asked.push(String(url))
    return new Response("<html></html>", { status: 200, headers: { "x-vercel-cache": "MISS" } })
  }) as typeof fetch
  return { asked, fetcher }
}

async function warmChecks() {
  console.log("\nB. The warm after a deploy\n")
  const before = process.env.VERCEL_DEPLOYMENT_ID
  process.env.VERCEL_DEPLOYMENT_ID = "dpl_r55"
  try {
    check("a site's pages: its front page, and /products only when its visitors open it", JSON.stringify(warmListOf({ origin: "https://a.test", products: false })) === JSON.stringify(["https://a.test/"]) && JSON.stringify(warmListOf({ origin: "https://a.test", products: true })) === JSON.stringify(WARM_PATHS.map((p) => `https://a.test${p}`)))

    /* With part 371: one read says who visited and who opened /products. */
    {
      const { tables, visited } = shop()
      const { db, log } = countingDb(tables, { warm_visited_websites: visited })
      const { asked, fetcher } = countingFetch()
      const r = await warmPublishedSites({ budgetMs: 30_000, fetcher, admin: db as never, now: NOW })
      const pages = asked.length
      const products = asked.filter((u) => u.endsWith("/products")).length
      console.log(`    measured: ${log.length} database calls, ${pages} pages asked (${products} of them /products), ${r.sites} sites`)
      check(`only the ${visited.length} sites visited in the last ${VISITED_DAYS} days, busiest first`, r.source === "visited" && r.sites === 12 && asked[0] === "https://shop0.storelib.com/", { r, first: asked[0] })
      check("  their front page, and /products for the 4 whose visitors opened it: 16 pages", pages === 16 && products === 4, asked)
      check("  no sitemap is read any more", !asked.some((u) => u.endsWith("/sitemap.xml")))
      check("  a handful of database calls for the whole run", log.length <= 12, log)
      check("  the run is remembered as done for this deploy", (tables.platform_settings[0] as { value?: { done?: boolean; source?: string } })?.value?.done === true && (tables.platform_settings[0] as { value?: { source?: string } }).value?.source === "visited")
      const again = await warmPublishedSites({ budgetMs: 30_000, fetcher, admin: db as never, now: NOW })
      check("  and the next run of the same deploy asks for nothing", again.skipped === "already-warmed" && asked.length === pages)
    }

    /* Without part 371: the rollup's rows, front pages only. */
    {
      const { tables } = shop()
      const { db, log } = countingDb(tables, {})
      const { asked, fetcher } = countingFetch()
      const r = await warmPublishedSites({ budgetMs: 30_000, fetcher, admin: db as never, now: NOW })
      console.log(`    measured without part 371: ${log.length} database calls, ${asked.length} pages asked`)
      check("before part 371: the same 12 sites from the rollup's rows, front pages only", r.source === "visited" && r.sites === 12 && asked.length === 12 && !asked.some((u) => u.endsWith("/products")), { r, asked })
    }

    /* The rollup cannot say (the cron has not rolled a day lately): every published site, front page only. */
    {
      const { tables } = shop()
      tables.analytics_rollup_days = [{ day: day(10) }]
      const { db, log } = countingDb(tables, {})
      const { asked, fetcher } = countingFetch()
      const r = await warmPublishedSites({ budgetMs: 30_000, fetcher, admin: db as never, now: NOW })
      console.log(`    measured with a stale rollup: ${log.length} database calls, ${asked.length} pages asked`)
      check("a rollup with no day in the last 3 is not read as 'nobody visited': every published site, front page only", r.source === "all" && r.sites === 120 && asked.length === 120 && asked.every((u) => u.endsWith("/")), { r, n: asked.length })
    }

    /* The way it was, for the measurement: every published site, its sitemap, its front and products pages and four sitemap pages. */
    {
      const sitemapPages = 4
      const old = 120 * (1 + 2 + sitemapPages)
      console.log(`    before this round, the same shop: ${old} requests (120 sites x sitemap, /, /products and ${sitemapPages} sitemap pages)`)
      check("16 pages instead of 840 on this shop", old === 840)
    }

    check("visitedWebsites answers null (not an empty list) when the rollup table cannot be read", (await visitedWebsites({ from: () => { throw new Error("no table") } } as never, NOW)) === null)
    check("a saved run from the other list starts again from the top", startFrom({ deployment: "d", offset: 30, done: false, source: "all" }, "d", "visited").offset === 0 && startFrom({ deployment: "d", offset: 30, done: false, source: "visited" }, "d", "visited").offset === 30 && startFrom({ deployment: "d", offset: 30, done: true, source: "all" }, "d", "visited").done === true)

    const sql = raw("supabase/sql/run-now/371_warm_visited_websites.sql")
    check("part 371: server only, skips itself without the rollup, safe to run again", /REVOKE ALL ON FUNCTION public\.warm_visited_websites\(date\) FROM PUBLIC, anon, authenticated/.test(sql) && /GRANT EXECUTE ON FUNCTION public\.warm_visited_websites\(date\) TO service_role/.test(sql) && /to_regclass\('public\.analytics_property_daily'\) IS NULL THEN RAISE NOTICE/.test(sql) && /Safe to run again\./.test(sql.split("\n")[0]))
    const warm = code("lib/website-builder/warm-sites.ts")
    check("the cap and the time budget stay: 36 sites a page, 6 at a time, the hard stop", /const PAGE = 36/.test(warm) && /const AT_ONCE = 6/.test(warm) && /export const WARM_HARD_STOP_MS = 7_000/.test(warm) && /while \(Date\.now\(\) < until\)/.test(warm))
  } finally {
    if (before === undefined) delete process.env.VERCEL_DEPLOYMENT_ID
    else process.env.VERCEL_DEPLOYMENT_ID = before
  }
}

async function main() {
  await realtimeChecks()
  await warmChecks()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log("failed:\n  " + failures.join("\n  "))
    process.exit(1)
  }
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
