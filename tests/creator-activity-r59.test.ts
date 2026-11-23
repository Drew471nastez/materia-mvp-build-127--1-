/**
 * ===========================================================================
 *  CREATOR ACTIVITY IN /admin (round 59, SQL part 430)
 * ===========================================================================
 * The owner: "for each creator I want to see when they went live, when they
 * were last active, whether they are online now, what they click and where
 * they go, their country and device, without running up server costs."
 *
 * What this proves, by running the real code (the database and the browser
 * stubbed at their edges):
 *
 *   paths keep only Storelib's own words; ids, slugs and emails are `:id`
 *   a batch keeps pages and named actions and nothing else
 *   the browser queue sends at most once a minute while visible, nothing
 *     while hidden, once on hide, early only when full, and never typed text
 *   the server makes ONE database call per batch, none for a heartbeat inside
 *     the presence window, and drops a sender past six a minute
 *   country and device from the request, coarse, the IP never read
 *   /admin's activity reads are behind the admin cookie (401 without it)
 *   before part 430 the reads say "missing" and ask the database once per
 *     period, not on every poll; the ingest the same
 *   the 30 day cleanup deletes in batches until a short one
 *
 * scripts/check-activity-beacon-r59.mjs drives the beacon in Chromium and
 * measures the requests; scripts/check-creator-activity-r59.mjs the admin.
 */
import { readFileSync } from "node:fs"

import { ACTIONS, MAX_BATCH, ONLINE_MS, PRESENCE_EVERY_MS, SEND_EVERY_MS, countryFlag, countryOf, describeEvent, deviceLabel, deviceOf, groupSessions, isOnline, normalisePath, pageLabel, parseBatch } from "@/lib/activity/creator-activity"
import { actionOfClick, createActivityQueue } from "@/lib/activity/creator-activity-client"
import { PER_MINUTE, forgetIngestMemory, ingestBatch, isMissingActivity, purgeOldActivity, PURGE_BATCH } from "@/lib/activity/creator-activity-server"
import { parseUserAgent } from "@/lib/analytics/user-agent"
import { forgetMissing } from "@/lib/supabase/missing-memory"
import { activityFeed, activitySummary, creatorActivity, makeCursor, onlineCreators, parseCursor } from "@/lib/admin/views/activity"
import { Reader } from "@/lib/admin/platform-metrics"

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
const read = (p: string) => readFileSync(p, "utf8")

/* ── A PostgREST stand-in: every chain records itself and answers what it is told ── */

type Call = { table?: string; rpc?: string; args?: unknown; ops: [string, unknown[]][] }
function fakeDb(answer: (c: Call) => { data?: unknown; error?: unknown; count?: number | null }) {
  const calls: Call[] = []
  const chain = (call: Call): unknown => {
    const p: Record<string, unknown> = {}
    for (const op of ["select", "eq", "gte", "lt", "lte", "gt", "not", "like", "order", "limit", "in", "is", "or", "range", "insert", "update"]) {
      p[op] = (...a: unknown[]) => {
        call.ops.push([op, a])
        return chain(call)
      }
    }
    p.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(answer(call)).then(res, rej)
    return p
  }
  return {
    calls,
    from(table: string) {
      const c: Call = { table, ops: [] }
      calls.push(c)
      return chain(c)
    },
    rpc(fn: string, args: unknown) {
      const c: Call = { rpc: fn, args, ops: [] }
      calls.push(c)
      return Promise.resolve(answer(c))
    },
  }
}
const headers = (h: Record<string, string>) => ({ get: (k: string) => h[k.toLowerCase()] ?? null })

async function main() {
  console.log("\nPaths keep only Storelib's own words")
  {
    check("a uuid is :id", normalisePath("/app/products/3f2a9c1e-1b2c-4d5e-8f90-123456789abc") === "/app/products/:id")
    check("a contact's key that is an email is :id", normalisePath("/app/contacts/ana%40gmail.com") === "/app/contacts/:id")
    check("a slug made from a title is :id", normalisePath("/app/help/selling/how-to-sell-honey-jars") === "/app/help/:id/:id")
    check("the query and hash never reach the server", normalisePath("/app/orders?q=ana@gmail.com#x") === "/app/orders")
    check("product words stay", normalisePath("/app/products/new") === "/app/products/new" && normalisePath("/app/settings/payments") === "/app/settings/payments")
    check("the editor is :id too", normalisePath("/website-builder/editor/9f8e7d6c-1111-4222-8333-444455556666") === "/website-builder/editor/:id")
    check("anything outside /app and the builder is not kept", normalisePath("/ana.pop") === null && normalisePath("/checkout/x") === null && normalisePath("https://evil.example/app") === "/app")
    check("pages read as words", pageLabel("/app") === "Home" && pageLabel("/app/settings/payments") === "Settings, payments" && pageLabel("/website-builder/editor/:id") === "Website editor")
  }

  console.log("\nA batch keeps pages and named actions, nothing else")
  {
    const now = Date.UTC(2026, 10, 23, 12, 0, 0)
    const got = parseBatch({ v: 1, e: [[5, "p", "/app/products/abc123abc123abc1"], [2, "a", "site.publish"], [1, "a", "typed.secret"], [0, "t", "hello my password"], [-50, "p", "/app"], [99999, "p", "/app/orders"], ["x", "p", "/app"]] }, now)!
    check("pages normalised, actions only from the list", JSON.stringify(got.map((e) => [e.kind, e.name])) === JSON.stringify([["page", "/app/products/:id"], ["action", "site.publish"], ["page", "/app"], ["page", "/app/orders"]]), got)
    check("the server's clock, never the future, at most an hour back", got[2].at === new Date(now).toISOString() && got[3].at === new Date(now - 3600_000).toISOString())
    check("a batch longer than 40 is cut", parseBatch({ v: 1, e: Array.from({ length: 100 }, () => [0, "p", "/app"]) }, now)!.length === MAX_BATCH)
    check("anything else is refused", parseBatch({ e: [] }, now) === null && parseBatch("x", now) === null && parseBatch(null, now) === null)
    check("every named action reads as words", Object.keys(ACTIONS).every((k) => describeEvent({ kind: "action", name: k }) === ACTIONS[k as keyof typeof ACTIONS]))
  }

  console.log("\nThe browser's queue: once a minute while visible, none while hidden")
  {
    let t = 1_000_000
    const sent: { how: string; body: string }[] = []
    const q = createActivityQueue({ now: () => t, send: (b) => sent.push({ how: "send", body: b }), beacon: (b) => sent.push({ how: "beacon", body: b }) })
    q.page("/app")
    q.page("/app") // the same page twice is one
    q.page("/app/products/3f2a9c1e-1b2c-4d5e-8f90-123456789abc")
    q.action("site.publish")
    q.action("not.a.name")
    check("a repeated page and an unknown action are not queued", q.pending() === 3)
    t += 30_000
    q.tick()
    check("nothing is sent before a minute", sent.length === 0)
    t += 30_000
    q.tick()
    check("at a minute, one request with everything", sent.length === 1 && sent[0].how === "send" && JSON.parse(sent[0].body).e.length === 3)
    const bytes = Buffer.byteLength(sent[0].body)
    check(`the batch is small (${bytes} bytes for three events)`, bytes < 200, sent[0].body)
    check("no ids in it", !/[0-9a-f]{8}-/.test(sent[0].body))
    t += 60_000
    q.tick()
    check("an empty minute is the heartbeat: one small request", sent.length === 2 && sent[1].body === '{"v":1,"e":[]}')
    q.page("/app/orders")
    t += 5_000
    q.hide()
    check("hiding sends what is waiting with sendBeacon", sent.length === 3 && sent[2].how === "beacon")
    for (let i = 0; i < 10; i++) {
      t += 60_000
      q.tick()
    }
    check("ten hidden minutes send nothing", sent.length === 3)
    q.hide()
    check("hiding with nothing waiting sends nothing", sent.length === 3)
    t += 60_000
    q.show()
    const resumed = JSON.parse(sent[sent.length - 1].body)
    check("back after a while: the page again (a new session's first page), sent at once", sent.length === 4 && resumed.e.length === 1 && resumed.e[0][2] === "/app/orders")
    for (let i = 0; i < MAX_BATCH; i++) q.action("stripe.start")
    check("a full queue goes early, without waiting for the minute", sent.length === 5 && JSON.parse(sent[4].body).e.length === MAX_BATCH)
    /* An hour visible and idle: 60 requests; an hour busy: still 60 plus a hide or two. */
    let n = 0
    const q2 = createActivityQueue({ now: () => t, send: () => n++, beacon: () => n++ })
    for (let i = 0; i < 60; i++) {
      t += SEND_EVERY_MS
      q2.page(i % 2 ? "/app" : "/app/orders")
      q2.tick()
    }
    check(`an hour of use is ${n} requests`, n === 60, n)
  }

  console.log("\nNo click is recorded unless it is named, and nothing typed ever is")
  {
    const el = (attrs: Record<string, string>, tag = "button") => ({
      closest(sel: string) {
        if (sel === "[data-activity]") return attrs["data-activity"] ? { getAttribute: () => attrs["data-activity"] } : null
        if (sel === "a[href]") return tag === "a" ? { getAttribute: () => attrs.href } : null
        return null
      },
    })
    check("a named button", actionOfClick(el({ "data-activity": "stripe.start" }) as unknown as EventTarget) === "stripe.start")
    check("a name not on the list", actionOfClick(el({ "data-activity": "anything.else" }) as unknown as EventTarget) === null)
    check("a plain button or a field", actionOfClick(el({}) as unknown as EventTarget) === null && actionOfClick(el({}, "input") as unknown as EventTarget) === null)
    check("a link to the editor is Opened the editor", actionOfClick(el({ href: "/website-builder/editor/abc" }, "a") as unknown as EventTarget) === "editor.open")
    const client = read("lib/activity/creator-activity-client.ts") + read("components/app/activity-beacon.tsx")
    check("the tracker never listens for keys or input, and reads no value", !/addEventListener\("(input|change|keydown|keyup|keypress|submit)"/.test(client) && !/\.value\b/.test(client) && !/clientX|pageX|screenX/.test(client))
    check("and keeps nothing on the device", !/localStorage|sessionStorage|indexedDB|document\.cookie/.test(client))
    check("nothing is sent while hidden: the timer checks visibility", /if \(document\.visibilityState === "visible"\) queue\.tick\(\)/.test(read("components/app/activity-beacon.tsx")))
    check("mounted in /app and the website builder", read("app/(storelib)/app/layout.tsx").includes("<ActivityBeacon />") && read("app/(storelib)/website-builder/layout.tsx").includes("<ActivityBeacon />"))
    check("publishing, the editor's publish and Stripe setup note their action only after the server said yes", /if \(done\) noteActivity\("site\.publish"\)/.test(read("app/(storelib)/app/website-builder/website-builder-client.tsx")) && /noteActivity\("editor\.publish"\)/.test(read("app/(storelib)/website-builder/editor/[installId]/page.tsx")) && /const data = await read<T>\(res\)[\s\S]{0,300}noteActivity\("stripe\.start"\)/.test(read("components/app/settings/payments-setup-flow.tsx")))
  }

  console.log("\nCountry and device, coarse, from the request")
  {
    const iphoneApp = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 StorelibApp Capacitor"
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"
    const androidWv = "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36"
    const ipad = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    const a = deviceOf(iphoneApp, parseUserAgent)
    check("the iPhone app", a.device === "phone" && a.os === "iOS" && a.shell === "ios_app" && a.browser === null, a)
    const b = deviceOf(mac, parseUserAgent)
    check("a Mac in Chrome", b.device === "desktop" && b.os === "macOS" && b.browser === "Chrome" && b.shell === "web", b)
    check("the Android app's web view", deviceOf(androidWv, parseUserAgent).shell === "android_app")
    check("an iPad", deviceOf(ipad, parseUserAgent).device === "tablet")
    check("in words", deviceLabel(a) === "Phone, iOS, Storelib app" && deviceLabel(b) === "Desktop, macOS, Chrome")
    check("the country is Vercel's two letters, nothing else", countryOf(headers({ "x-vercel-ip-country": "ro" })) === "RO" && countryOf(headers({ "x-vercel-ip-country": "XX" })) === null && countryOf(headers({})) === null && countryFlag("RO") === "\u{1F1F7}\u{1F1F4}")
    const server = read("lib/activity/creator-activity-server.ts") + read("app/api/activity/route.ts")
    check("the IP address is never read", !/x-forwarded-for|x-real-ip|clientIp|\.ip\b/.test(server))
  }

  console.log("\nThe server: one call per batch, none for a heartbeat inside the window")
  {
    forgetIngestMemory()
    forgetMissing()
    const db = fakeDb(() => ({ data: { events: 1, presence: true }, error: null }))
    const now = Date.UTC(2026, 10, 23, 12, 0, 0)
    const h = headers({ "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/131.0 Safari/537.36", "x-vercel-ip-country": "DE", "x-forwarded-for": "203.0.113.9" })
    const first = await ingestBatch(db, { userId: "u1", body: { v: 1, e: [[0, "p", "/app"]] }, headers: h, now })
    check("a batch is one rpc", first.outcome === "written" && db.calls.length === 1 && db.calls[0].rpc === "creator_activity_ingest")
    const args = db.calls[0].args as Record<string, unknown>
    check("with the country and coarse device, and no address", args.p_country === "DE" && args.p_device === "desktop" && args.p_os === "macOS" && !JSON.stringify(args).includes("203.0.113.9"), args)
    const hb = await ingestBatch(db, { userId: "u1", body: { v: 1, e: [] }, headers: h, now: now + 30_000 })
    check("a heartbeat 30 s later never reaches the database", hb.outcome === "skipped" && db.calls.length === 1)
    await ingestBatch(db, { userId: "u1", body: { v: 1, e: [] }, headers: h, now: now + PRESENCE_EVERY_MS + 1 })
    check("one past the window does", db.calls.length === 2)
    check("part 430 writes presence at most every 55 s (the conditional update)", /last_seen_at < now\(\) - interval '55 seconds'/.test(read("supabase/sql/run-now/430_creator_activity.sql")))
    forgetIngestMemory()
    let refused = 0
    for (let i = 0; i < PER_MINUTE + 4; i++) if ((await ingestBatch(db, { userId: "u2", body: { v: 1, e: [[0, "p", "/app"]] }, headers: h, now: now + i })).outcome === "refused") refused++
    check(`more than ${PER_MINUTE} a minute from one person is dropped`, refused === 4, refused)
  }

  console.log("\nBefore part 430: soft; ingest asks again after a minute, the admin on every read")
  {
    forgetIngestMemory()
    forgetMissing()
    const missing = { code: "PGRST202", message: "Could not find the function public.creator_activity_ingest" }
    const db = fakeDb(() => ({ data: null, error: missing }))
    const now = Date.UTC(2026, 10, 23, 12, 0, 0)
    const a = await ingestBatch(db, { userId: "u1", body: { v: 1, e: [[0, "p", "/app"]] }, headers: headers({}), now })
    const b = await ingestBatch(db, { userId: "u3", body: { v: 1, e: [[0, "p", "/app"]] }, headers: headers({}), now: now + 1000 })
    check("the first batch learns it is missing; the next asks nothing for a minute", a.outcome === "missing" && b.outcome === "missing" && db.calls.length === 1)
    check("missing is a missing function or table, not any error", isMissingActivity({ code: "42P01" }) && isMissingActivity({ code: "PGRST205" }) && !isMissingActivity({ code: "57014" }))

    forgetMissing()
    const r = new Reader()
    const tdb = fakeDb(() => ({ data: null, error: { code: "42P01", message: 'relation "public.creator_presence" does not exist' }, count: null }))
    ;(r as unknown as { client: unknown }).client = tdb
    const s1 = await activitySummary(r)
    const askedOnce = tdb.calls.length
    const s2 = await activitySummary(r)
    const o = await onlineCreators(r)
    const f = await activityFeed(r, {})
    check("the summary, the list and the feed say missing, with no problem raised", s1.missing && s2.missing && o.missing && f.missing && r.problems.length === 0, r.problems)
    /* Changed on purpose (r61): the admin asks on every read and shows Supabase's own words, so the console changes the moment part 430 runs (an owner ran it and kept seeing the note for the remembered period). */
    check("and the admin asks the database on every read, never a remembered answer", askedOnce === 3 && tdb.calls.length === 3 + 3 + 1 + 1, tdb.calls.length)
    const { missingReason } = await import("@/lib/admin/views/activity")
    check("  with Supabase's own words for what it could not find", /^creator_[a-z_]+: 42P01 relation "public.creator_presence" does not exist$/.test(missingReason() ?? ""), missingReason())
    const ok = fakeDb(() => ({ data: [], error: null, count: 0 }))
    ;(r as unknown as { client: unknown }).client = ok
    const s3 = await activitySummary(r)
    check("  and the next read after the part runs is no longer missing", !s3.missing && s3.summary.onlineNow === 0, s3)
  }

  console.log("\nThe admin's reads")
  {
    forgetMissing()
    const r = new Reader()
    const db = fakeDb((c) => {
      if (c.table === "creators") return { data: [{ id: "c0000001-0000-4000-8000-000000000000", user_id: "u1" }], error: null }
      if (c.table === "creator_presence" && c.ops.some(([op]) => op === "select")) return { data: [{ user_id: "u1", last_seen_at: new Date().toISOString(), session_started_at: null, last_path: "/app", last_action: null, last_action_at: null, country: "RO", device: "phone", os: "iOS", browser: null, shell: "ios_app", live_since: "2026-10-01T00:00:00Z" }], error: null, count: 4 }
      if (c.table === "creator_activity_events") {
        if (c.ops.some(([op, a]) => op === "select" && (a[1] as { head?: boolean } | undefined)?.head)) return { data: null, error: null, count: 3 }
        if (c.ops.some(([op, a]) => op === "eq" && a[0] === "session_start")) return { data: [{ at: "2026-11-23T10:00:00Z", country: "RO", device: "phone", os: "iOS", browser: null, shell: "ios_app" }, { at: "2026-11-22T10:00:00Z", country: "RO", device: "phone", os: "iOS", browser: null, shell: "ios_app" }], error: null }
        return { data: Array.from({ length: 61 }, (_, i) => ({ id: 1000 - i, at: new Date(Date.UTC(2026, 10, 23, 11, 0) - i * 60_000).toISOString(), kind: i % 5 ? "page" : "action", name: i % 5 ? "/app" : "site.publish", session_start: i === 60 })), error: null }
      }
      if (c.table === "store_activity_log") return { data: [{ id: 7, created_at: "2026-11-23T10:30:00Z", action: "product.price", subject_label: "Honey", meta: {} }], error: null }
      return { data: [], error: null }
    })
    ;(r as unknown as { client: unknown }).client = db
    const d = await creatorActivity(r, "c0000001-0000-4000-8000-000000000000", null)
    check("a page of 60, with a cursor for the next", d.timeline.filter((t) => t.kind !== "saved").length === 60 && !!d.next && parseCursor(d.next)?.id === 941, d.next)
    check("what they saved is in the same timeline, in time order", d.timeline.some((t) => t.kind === "saved" && t.label === "Changed the price of Honey") && d.timeline.every((t, i, a) => i === 0 || Date.parse(a[i - 1].at) >= Date.parse(t.at)))
    check("live since from the presence row, sessions counted, places once each", d.liveSince === "2026-10-01T00:00:00Z" && d.sessions7 === 3 && d.places.length === 1)
    const timeline = db.calls.find((c) => c.table === "creator_activity_events" && c.ops.some(([op]) => op === "order") && c.ops.some(([op, a]) => op === "eq" && a[0] === "user_id") && !c.ops.some(([op, a]) => op === "eq" && a[0] === "session_start"))!
    check("the timeline is by user_id and id, the index part 430 makes", timeline.ops.some(([op, a]) => op === "order" && a[0] === "id") && /creator_activity_events_user_idx ON public\.creator_activity_events \(user_id, id DESC\)/.test(read("supabase/sql/run-now/430_creator_activity.sql")))
    const store = db.calls.find((c) => c.table === "store_activity_log")!
    check("only what a person did, not a buyer or Storelib", store.ops.some(([op, a]) => op === "eq" && a[0] === "actor" && a[1] === "person"))
    check("a cursor round trips", JSON.stringify(parseCursor(makeCursor({ id: 42, at: "2026-11-23T10:00:00.000Z" }))) === JSON.stringify({ id: 42, at: "2026-11-23T10:00:00.000Z" }) && parseCursor("1;drop") === null)
    const sessions = groupSessions(d.timeline)
    check("one unbroken hour is one session, with the saved change in it", sessions.length === 1 && sessions[0].events.length === 61)
    const ev = (m: number, start = false) => ({ id: String(m), at: new Date(Date.UTC(2026, 10, 23, 12, 0) - m * 60_000).toISOString(), kind: "page" as const, name: "/app", label: "Home", sessionStart: start })
    const split = groupSessions([ev(0), ev(5, true), ev(6), ev(20), ev(100)])
    check("a new session where the database marked one, and after a 30 minute gap", split.length === 3 && split[0].events.length === 2 && split[1].events.length === 2 && split[2].events.length === 1, split.map((s) => s.events.length))
    check("online means within two minutes", isOnline(new Date(Date.now() - ONLINE_MS + 5000).toISOString()) && !isOnline(new Date(Date.now() - ONLINE_MS - 5000).toISOString()) && !isOnline(null))
  }

  console.log("\nAdmin only")
  {
    const route = await import("@/app/api/admin/platform/[section]/route")
    const res = await route.GET(new Request("https://storelib.com/api/admin/platform/activity?part=online") as never, { params: Promise.resolve({ section: "activity" }) })
    check("without the admin cookie: 401, and nothing read", res.status === 401)
    const src = read("app/api/admin/platform/[section]/route.ts")
    check("activity is a section behind that one door", /"activity",/.test(src) && src.indexOf("isAdminAuthenticated()") < src.indexOf("build(section"))
    const sql = read("supabase/sql/run-now/430_creator_activity.sql")
    check("part 430: row level security on, nothing for anon or signed in users", /ALTER TABLE public\.creator_activity_events ENABLE ROW LEVEL SECURITY/.test(sql) && /REVOKE ALL ON public\.creator_presence FROM PUBLIC, anon, authenticated/.test(sql) && !/CREATE POLICY/i.test(sql) && /REVOKE ALL ON FUNCTION public\.creator_activity_ingest\(uuid, jsonb, text, text, text, text, text\) FROM PUBLIC, anon, authenticated/.test(sql))
    const ingest = read("app/api/activity/route.ts")
    check("the ingest writes only as the signed in person, after the check", ingest.indexOf("if (!current.user) return NO_CONTENT()") < ingest.indexOf("createAdminClient()") && /userId: current\.user\.id/.test(ingest))
    check("the creator's card shows the masked email only, as before", /email: p\?\.email \? maskEmail\(p\.email\) : null/.test(read("lib/admin/views/creators.ts")) && !/email/.test(read("lib/admin/views/activity.ts")))
  }

  console.log("\nThirty days, then gone, in batches")
  {
    forgetMissing()
    const sizes = [PURGE_BATCH, PURGE_BATCH, 1234]
    const db = fakeDb(() => ({ data: sizes.shift() ?? 0, error: null }))
    const out = await purgeOldActivity(db)
    check("batches until a short one", out.removed === PURGE_BATCH * 2 + 1234 && db.calls.length === 3 && !out.failed)
    forgetMissing()
    const none = fakeDb(() => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }))
    const a = await purgeOldActivity(none)
    const b = await purgeOldActivity(none)
    check("before part 430: skipped, asked once per period", a.missing && b.missing && none.calls.length === 1)
    const cron = read("app/api/cron/purge-chat-attachments/route.ts")
    check("in the daily cleanup that already runs", /await purgeOldActivity\(createAdminClient\(\)\)/.test(cron) && /requireBearerSecret\(request, "CRON_SECRET"\)/.test(cron))
    check("part 430 deletes oldest first, past 30 days, by id", /WHERE at < now\(\) - interval '30 days' ORDER BY id LIMIT/.test(read("supabase/sql/run-now/430_creator_activity.sql")))
  }

  console.log("\nThe admin console")
  {
    const panel = read("app/(storelib)/admin/_console/panel-activity.tsx")
    check("the online list is read every 30 s, only while the tab is visible", /const POLL_MS = 30_000/.test(panel) && /if \(document\.visibilityState !== "visible"\) return/.test(panel))
    check("definitions said in words", panel.includes("Online now: something arrived from them in the last") && panel.includes("Live on Storelib: the first day"))
    check("no AI words and no em dashes in the copy", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform|—/i.test(panel))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

void main()
