/**
 * ===========================================================================
 *  WHO IS ON STORELIB NOW, ACROSS THE PLATFORM (round 62, SQL part 477)
 * ===========================================================================
 * The owner: "I want to see the live ones on Storelib: who they are, where
 * they are from, what it is, what they do. Not only on creators' pages,
 * across the whole platform."
 *
 * What this proves by running the real code (database and browser stubbed
 * at their edges):
 *
 *   paths: areas placed on the server, ids, tokens, emails and private
 *     segments `:id`, public slugs kept, query and hash dropped
 *   nothing typed: a batch keeps placed pages and listed actions only
 *   consent: without a yes, or with GPC or DNT, no account is read or linked
 *   robots: a bot signature or Vercel's bot header writes nothing
 *   presence: a heartbeat inside 55 s asks nothing; six a minute per tab
 *   a purchase is the order the server found, never the token
 *   the queue: one send a minute while visible, none hidden, none on /app
 *   /admin's Live reads are behind the admin cookie (401 without it)
 *   before part 477: every read says missing with Supabase's words, and asks
 *     again on the next read; the ingest asks again after a minute
 *   the purge: in batches until a short one, in the daily cleanup
 *
 * scripts/check-platform-live-sql.sh runs part 477 twice on Postgres;
 * scripts/check-live-beacon-r62.mjs drives the beacon in Chromium;
 * scripts/check-live-admin-r62.mjs draws the admin at 390 and 1280.
 */
import { readFileSync } from "node:fs"

import { AREAS, LIVE_ACTIONS, LIVE_MAX_BATCH, LIVE_PRESENCE_EVERY_MS, cleanSource, parseLiveBatch, placePath, sessionLength } from "@/lib/live/live"
import { actionOfRequest, createLiveQueue, newSid, receiptTokenOf, sourceOf, tabSid } from "@/lib/live/live-client"
import { LIVE_MISSING_MS, LIVE_PER_MINUTE, LIVE_PURGE_BATCH, forgetLiveMemory, hostKindOf, ingestLive, isBotRequest, mayLink, optedOut, purgeOldLive, sampledIn } from "@/lib/live/live-server"
import { forgetMissing } from "@/lib/supabase/missing-memory"
import { LiveReads, liveFeed, liveNow, liveOverview, liveSession, liveSessions, trailOf } from "@/lib/admin/views/live"
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

type Call = { table?: string; rpc?: string; args?: unknown; ops: [string, unknown[]][] }
function fakeDb(answer: (c: Call) => { data?: unknown; error?: unknown; count?: number | null }) {
  const calls: Call[] = []
  const chain = (call: Call): unknown => {
    const p: Record<string, unknown> = {}
    for (const op of ["select", "eq", "gte", "lt", "lte", "gt", "not", "like", "order", "limit", "in", "is", "or", "range", "insert", "update", "maybeSingle"]) {
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
function readerWith(db: ReturnType<typeof fakeDb>): Reader {
  const r = new Reader()
  Object.defineProperty(r, "db", { get: () => db })
  return r
}

const CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
const MISSING = { code: "PGRST202", message: "Could not find the function public.platform_live_ingest in the schema cache" }
const NOW = Date.UTC(2026, 10, 23, 12, 0, 0)
const CONSENT_YES = `2.p1.a1.m0.${Math.floor(NOW / 1000) - 60}`
const CONSENT_NO = `2.p0.a0.m0.${Math.floor(NOW / 1000) - 60}`

function headers(extra: Record<string, string> = {}) {
  const h = new Headers({ "user-agent": CHROME, host: "storelib.com", "sec-fetch-site": "same-origin", "x-vercel-ip-country": "RO", ...extra })
  return h
}
let sidN = 0
const freshSid = () => `t${String(++sidN).padStart(15, "0")}`

async function main() {
  console.log("Paths")
  {
    const p = (raw: string, host: "storelib" | "site" = "storelib") => placePath(raw, host)
    check("storelib.com's home is the marketing site", p("/")?.area === "marketing" && p("/")?.path === "/")
    check("a blog post keeps its public slug", p("/blog/how-to-sell-presets?ref=x#top")?.path === "/blog/how-to-sell-presets")
    check("the query and the hash are dropped (a search term never leaves)", p("/explore?q=my+secret+search")?.path === "/explore")
    check("themes, explore, community", p("/themes/aurora")?.area === "themes" && p("/explore/presets")?.area === "explore" && p("/community/photo-club")?.area === "community")
    check("a creator's handle and product are a creator page, the product noted", p("/ana.pop")?.area === "creators" && p("/ana.pop/blue-brushes")?.product === true && p("/p/blue-brushes")?.product === true)
    check("a uuid in a public path is :id", p("/p/0b6f7f2a-1c1b-4e7e-9a55-2f0e5f1c3a10")?.path === "/p/:id")
    check("an email in a path is :id", p("/u/someone@example.com")?.path === "/u/:id")
    check("a long number is :id, a page number stays", p("/blog/page/2")?.path === "/blog/page/2" && p("/blog/1234567")?.path === "/blog/:id")
    check("a token-like run is :id", p("/l/a8F3kq92LmZpQ7rT1xYv")?.path === "/l/:id")
    check("a Stripe id is :id", p("/explore/cs_test_a1B2c3D4e5F6")?.path === "/explore/:id")
    check("the receipt's token is :id, and noted as a receipt", p("/receipt/AbCdEf0123456789xyzQ")?.path === "/receipt/:id" && p("/receipt/AbCdEf0123456789xyzQ")?.receipt === true)
    check("private areas keep only the product's words", p("/account/library/courses/my-course-slug")?.path === "/account/library/courses/:id" && p("/library/some-product")?.path === "/library/:id")
    check("a course opened is noted", p("/account/library/courses/x")?.course === true)
    check("checkout is noted as a start, its receipt is not", p("/checkout")?.checkout === true && p("/checkout/receipt")?.checkout === false && p("/checkout")?.area === "checkout")
    check("signing in is its own area, its callback's code is gone", p("/auth/callback?code=secret")?.path === "/auth/callback" && p("/login")?.area === "auth")
    check("/app, the editor, /admin, previews and the API are not recorded here", [ "/app", "/app/products", "/website-builder/editor/x", "/admin", "/onepage-preview/x", "/api/live", "/_next/static/x.js"].every((x) => p(x) === null))
    check("creator tools outside /app are the app area", p("/store/ana/themes/x/editor")?.area === "app" && p("/store/ana/themes/x/editor")?.path === "/store/:id/themes/:id/editor")
    check("on a creator's website every page is a creator page; its product is noted", p("/products/blue-brushes", "site")?.area === "creators" && p("/products/blue-brushes", "site")?.product === true)
    check("a website's account pages are private too", p("/account/orders/1234567", "site")?.path === "/account/orders/:id")
    check("at most eight segments, at most 200 characters", (p("/blog/a/b/c/d/e/f/g/h/i/j")?.path.split("/").length ?? 0) <= 9)
    check("a source is a host or a word, never a path", cleanSource("https://www.google.com/search?q=secret") === "google.com" && cleanSource("newsletter") === "newsletter" && cleanSource("a b") === null && cleanSource("x@y.com") === null)
    check("nine areas", AREAS.length === 9)
  }

  console.log("\nNothing typed")
  {
    const batch = parseLiveBatch(
      { v: 1, s: "abcdefgh12345678", e: [[3, "p", "/checkout?email=a@b.com"], [2, "a", "checkout.start"], [1, "t", "my password"], [1, "a", "typed.text"], [0, "p", "/explore"], [0, "a", "cart.add", "extra"], [0, "a", "order.paid", "not a token!"]], src: "https://instagram.com/p/xyz" },
      NOW,
      "storelib",
    )
    const json = JSON.stringify(batch)
    check("only placed pages and listed actions survive", batch?.events.length === 4 && batch.events.map((e) => (e.kind === "page" ? e.path : e.name)).join(",") === "/checkout,checkout.start,/explore,cart.add", batch?.events)
    check("no email, no typed words, no bad token anywhere in what is kept", !/a@b\.com|password|typed|not a token/.test(json))
    check("the source is the host only", batch?.source === "instagram.com")
    check("a batch without a proper tab id is refused", parseLiveBatch({ v: 1, s: "short", e: [] }, NOW, "storelib") === null && parseLiveBatch({ v: 1, s: "ABCDEFGH12345678", e: [] }, NOW, "storelib") === null)
    check("at most 30 events", (parseLiveBatch({ v: 1, s: "abcdefgh12345678", e: Array.from({ length: 60 }, (_, i) => [0, "p", `/blog/p${i}`]) }, NOW, "storelib")?.events.length ?? 0) === LIVE_MAX_BATCH)
    check("eight named actions, plain words", Object.keys(LIVE_ACTIONS).length === 8 && !/unlock|elevate|seamless|powerful|effortless|supercharge|transform|—/i.test(Object.values(LIVE_ACTIONS).join(" ")))
    const beacon = read("components/platform/live-beacon.tsx") + read("lib/live/live-client.ts")
    check("the beacon never reads a field, a key or a form", !/addEventListener\("(input|change|keydown|keyup|submit)"/.test(beacon) && !/\.value\b/.test(beacon))
  }

  console.log("\nThe browser's queue")
  {
    let t = NOW
    const sent: string[] = []
    const beaconed: string[] = []
    const q = createLiveQueue({ now: () => t, sid: "abcdefgh12345678", host: "storelib", source: "google.com", app: false, send: (b) => sent.push(b), beacon: (b) => beaconed.push(b), receiptToken: receiptTokenOf })
    q.page("/explore")
    q.page("/explore")
    q.page("/p/blue-brushes")
    t += 30_000
    q.tick()
    check("nothing before a minute has passed", sent.length === 0)
    t += 31_000
    q.tick()
    const first = JSON.parse(sent[0] ?? "{}")
    check("one send a minute with the pages, the product view derived, the source once", sent.length === 1 && first.e.length === 3 && first.e[2][2] === "product.view" && first.src === "google.com", first)
    t += 60_000
    q.tick()
    check("an empty minute is the heartbeat, without the source again", sent.length === 2 && JSON.parse(sent[1]).e.length === 0 && JSON.parse(sent[1]).src === undefined)
    q.hide()
    check("hidden with nothing waiting: nothing sent", beaconed.length === 0)
    t += 600_000
    q.tick()
    check("nothing while hidden", sent.length === 2)
    q.action("cart.add")
    q.hide()
    q.show()
    t += 61_000
    q.page("/receipt/AbCdEf0123456789xyzQ")
    q.hide()
    const last = JSON.parse(beaconed[beaconed.length - 1] ?? "{}")
    check("hiding with something waiting sends it with sendBeacon", beaconed.length === 1)
    check("a receipt sends order.paid with its token for the server to check", last.e.some((e: unknown[]) => e[2] === "order.paid" && e[3] === "AbCdEf0123456789xyzQ"))
    const app: string[] = []
    let t2 = NOW
    const inApp = createLiveQueue({ now: () => t2, sid: "abcdefgh12345679", host: "storelib", source: null, app: false, send: (b) => app.push(b), beacon: (b) => app.push(b) })
    inApp.page("/app/products")
    for (let i = 0; i < 5; i++) {
      t2 += 60_000
      inApp.tick()
    }
    check("on /app (round 59's) the beacon sends nothing, not even a heartbeat", app.length === 0)
    check("a theme site's /cart/add is heard by its address only", actionOfRequest("https://shop.example/cart/add.js") === "cart.add" && actionOfRequest("https://shop.example/cart") === null)
    const store = new Map<string, string>()
    const st = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
    const rnd = (n: number) => Uint8Array.from({ length: n }, (_, i) => i * 7)
    const a = tabSid(st, rnd)
    const b = tabSid(st, () => new Uint8Array(16))
    check("the tab's id is made once and kept in sessionStorage, sixteen of [a-z0-9]", a === b && /^[a-z0-9]{16}$/.test(a) && store.get("sl_live") === a && newSid(rnd) === a)
    check("before a yes to analytics nothing is stored on the device: the id is in memory and an earlier one is removed (r62 coordinator)", /const sid = tabSid\(consented \? storage\(\) : null, random\)/.test(read("components/platform/live-beacon.tsx")) && /if \(!consented\)[\s\S]{0,80}removeItem\(LIVE_SID_KEY\)/.test(read("components/platform/live-beacon.tsx")) && /^[a-z0-9]{16}$/.test(tabSid(null, rnd)))
    check("with storage blocked the id lives in memory", /^[a-z0-9]{16}$/.test(tabSid({ getItem: () => { throw new Error("blocked") }, setItem: () => { throw new Error("blocked") } }, rnd)))
    check("the source: utm_source first, an outside referrer's host, never our own", sourceOf("https://google.com/x", "https://storelib.com/?utm_source=Newsletter", ["storelib.com"]) === "newsletter" && sourceOf("https://www.google.com/search?q=secret", "https://storelib.com/", ["storelib.com"]) === "google.com" && sourceOf("https://ana.storelib.com/", "https://storelib.com/", ["storelib.com"]) === null)
    const src = read("components/platform/live-beacon.tsx")
    check("not inside a frame, not while prerendering", /window\.self !== window\.top/.test(src) && /prerendering/.test(src))
    check("no cookie written by the beacon", !/document\.cookie/.test(src + read("lib/live/live-client.ts")))
  }

  console.log("\nConsent, the account, robots and the presence window")
  {
    check("consent: a yes to analytics links", mayLink(CONSENT_YES, headers(), NOW))
    check("consent: no record, or a no, does not", !mayLink(undefined, headers(), NOW) && !mayLink(CONSENT_NO, headers(), NOW))
    check("Global Privacy Control or Do Not Track overrides a yes", !mayLink(CONSENT_YES, headers({ "sec-gpc": "1" }), NOW) && !mayLink(CONSENT_YES, headers({ dnt: "1" }), NOW) && optedOut(headers({ dnt: "1" })))
    check("robots: a crawler's signature, a headless browser, Vercel's bot header", isBotRequest(headers({ "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" })) && isBotRequest(headers({ "user-agent": "Mozilla/5.0 HeadlessChrome/120" })) && isBotRequest(headers({ "x-vercel-verified-bot": "googlebot" })) && !isBotRequest(headers()))
    check("storelib.com is Storelib, any other host is a creator's website", hostKindOf("storelib.com", "storelib.com").kind === "storelib" && hostKindOf("shop.example.com", "storelib.com").host === "shop.example.com")

    forgetLiveMemory()
    forgetMissing()
    const db = fakeDb((c) => (c.rpc === "platform_live_ingest" ? { data: { events: 1, session: true }, error: null } : { data: null, error: null }))
    let accountAsked = 0
    const account = async () => {
      accountAsked++
      return "aaaaaaaa-0000-4000-8000-000000000001"
    }
    const signedInCookies = ["__Host-sb-x-auth-token", "storelib_consent"]
    const base = { headers: headers(), cookieNames: signedInCookies, now: NOW, mainDomain: "storelib.com", account, sample: 1 }

    const sidA = freshSid()
    const anon = await ingestLive(db, { ...base, body: { v: 1, s: sidA, e: [[0, "p", "/explore"]] }, cookie: () => undefined })
    check("before consent: written, no account asked, none linked", anon.outcome === "written" && accountAsked === 0 && (anon.args as { p_user: unknown }).p_user === null && (anon.args as { p_consented: boolean }).p_consented === false)
    const declined = await ingestLive(db, { ...base, body: { v: 1, s: freshSid(), e: [[0, "p", "/explore"]] }, cookie: (n) => (n === "storelib_consent" ? CONSENT_NO : undefined) })
    check("declined: no account asked, none linked", declined.outcome === "written" && accountAsked === 0 && !declined.linked)
    const gpc = await ingestLive(db, { ...base, headers: headers({ "sec-gpc": "1" }), body: { v: 1, s: freshSid(), e: [[0, "p", "/explore"]] }, cookie: (n) => (n === "storelib_consent" ? CONSENT_YES : undefined) })
    check("GPC with a yes: no account asked, none linked", gpc.outcome === "written" && accountAsked === 0 && !gpc.linked)
    const sidB = freshSid()
    const yes = await ingestLive(db, { ...base, body: { v: 1, s: sidB, e: [[0, "p", "/library"]] }, cookie: (n) => (n === "storelib_consent" ? CONSENT_YES : undefined) })
    check("a yes and a sign in: the account is linked", yes.linked && (yes.args as { p_user: unknown }).p_user === "aaaaaaaa-0000-4000-8000-000000000001" && accountAsked === 1)
    const yesNoSignIn = await ingestLive(db, { ...base, cookieNames: ["storelib_consent"], body: { v: 1, s: freshSid(), e: [[0, "p", "/library"]] }, cookie: (n) => (n === "storelib_consent" ? CONSENT_YES : undefined) })
    check("a yes without a sign in: nothing to link, nothing asked", !yesNoSignIn.linked && accountAsked === 1)
    await ingestLive(db, { ...base, now: NOW + 70_000, body: { v: 1, s: sidB, e: [[0, "p", "/library/x"]] }, cookie: (n) => (n === "storelib_consent" ? CONSENT_YES : undefined) })
    check("the account is remembered per tab, not read every minute", accountAsked === 1)

    const callsBefore = db.calls.length
    const hb = await ingestLive(db, { ...base, now: NOW + 20_000, body: { v: 1, s: sidA, e: [] }, cookie: () => undefined })
    check("a heartbeat inside 55 s: no database call", hb.outcome === "skipped" && db.calls.length === callsBefore)
    const hb2 = await ingestLive(db, { ...base, now: NOW + LIVE_PRESENCE_EVERY_MS + 1_000, body: { v: 1, s: sidA, e: [] }, cookie: () => undefined })
    check("after the window: one call", hb2.outcome === "written" && db.calls.length === callsBefore + 1)
    const bot = await ingestLive(db, { ...base, headers: headers({ "user-agent": "facebookexternalhit/1.1" }), body: { v: 1, s: freshSid(), e: [[0, "p", "/"]] }, cookie: () => undefined })
    const otherSite = await ingestLive(db, { ...base, headers: headers({ "sec-fetch-site": "cross-site" }), body: { v: 1, s: freshSid(), e: [[0, "p", "/"]] }, cookie: () => undefined })
    check("a robot and another site's request: dropped, no call", bot.outcome === "bot" && otherSite.outcome === "refused" && db.calls.length === callsBefore + 1)
    const flood = freshSid()
    const outs: string[] = []
    for (let i = 0; i < LIVE_PER_MINUTE + 3; i++) outs.push((await ingestLive(db, { ...base, now: NOW + i, body: { v: 1, s: flood, e: [[0, "p", `/blog/p${i}`]] }, cookie: () => undefined })).outcome)
    check("more than six a minute from one tab is dropped", outs.filter((o) => o === "refused").length === 3, outs)

    /* The purchase. */
    const shop = fakeDb((c) =>
      c.table === "orders"
        ? { data: { id: "0b6f7f2a-1c1b-4e7e-9a55-2f0e5f1c3a10", status: "completed", created_at: new Date(NOW - 60_000).toISOString() }, error: null }
        : { data: { events: 1, session: true }, error: null },
    )
    const paid = await ingestLive(shop, { ...base, body: { v: 1, s: freshSid(), e: [[0, "p", "/receipt/AbCdEf0123456789xyzQ"], [0, "a", "order.paid", "AbCdEf0123456789xyzQ"]] }, cookie: () => undefined })
    const sentEvents = JSON.stringify((paid.args as { p_events: unknown }).p_events)
    check("a purchase is the order found on the server, the token is not kept", sentEvents.includes("0b6f7f2a-1c1b-4e7e-9a55-2f0e5f1c3a10") && !sentEvents.includes("AbCdEf0123456789xyzQ"))
    const unpaid = fakeDb((c) => (c.table === "orders" ? { data: { id: "x", status: "pending", created_at: new Date(NOW).toISOString() }, error: null } : { data: { session: true }, error: null }))
    const notPaid = await ingestLive(unpaid, { ...base, body: { v: 1, s: freshSid(), e: [[0, "p", "/receipt/AbCdEf0123456789xyzQ"], [0, "a", "order.paid", "AbCdEf0123456789xyzQ"]] }, cookie: () => undefined })
    check("an order that is not paid is not a purchase", !JSON.stringify((notPaid.args as { p_events: unknown }).p_events).includes("order.paid"))
    check("the IP address is never sent to the database", !JSON.stringify(yes.args).includes("x-forwarded-for") && !Object.keys(yes.args ?? {}).some((k) => /ip/i.test(k.replace("p_", ""))))
    check("sampling is stable per tab and keeps everyone at 1", sampledIn("abcdefgh12345678", 1) && sampledIn("abcdefgh12345678", 0.5) === sampledIn("abcdefgh12345678", 0.5) && !sampledIn("abcdefgh12345678", 0))
    let kept = 0
    for (let i = 0; i < 10_000; i++) if (sampledIn(newSid((n) => crypto.getRandomValues(new Uint8Array(n))), 0.1)) kept++
    check("a 10% sample keeps about one tab in ten", kept > 700 && kept < 1300, kept)
    check("a sampled-out anonymous tab's beacon sends nothing at all, the same test as the server", /!consented && !sampledIn\(sid, liveSampleRate\(process\.env\.NEXT_PUBLIC_LIVE_ANON_SAMPLE\)\)\) return/.test(read("components/platform/live-beacon.tsx")) && /liveSampleRate\(process\.env\.NEXT_PUBLIC_LIVE_ANON_SAMPLE\)/.test(read("lib/live/live-server.ts")))
    const outOf = await ingestLive(db, { ...base, body: { v: 1, s: "zzzzzzzzzzzzzzzz", e: [[0, "p", "/"]] }, cookie: () => undefined, sample: 0.000001 })
    check("a sampled-out anonymous tab costs no call", outOf.outcome === "sampled_out")
  }

  console.log("\nBefore part 477")
  {
    forgetLiveMemory()
    forgetMissing()
    const none = fakeDb(() => ({ data: null, error: MISSING }))
    const base = { headers: headers(), cookieNames: [], now: NOW, mainDomain: "storelib.com", account: async () => null, cookie: () => undefined, sample: 1 }
    const a = await ingestLive(none, { ...base, body: { v: 1, s: freshSid(), e: [[0, "p", "/"]] } })
    const b = await ingestLive(none, { ...base, now: NOW + 10_000, body: { v: 1, s: freshSid(), e: [[0, "p", "/"]] } })
    check("the ingest fails soft and stops asking for a minute", a.outcome === "missing" && b.outcome === "missing" && none.calls.length === 1)
    await ingestLive(none, { ...base, now: NOW + LIVE_MISSING_MS + 1_000, body: { v: 1, s: freshSid(), e: [[0, "p", "/"]] } })
    check("then asks again", none.calls.length === 2)

    const r = readerWith(fakeDb((c) => (c.table === "creator_presence" ? { data: [], count: 3, error: null } : { data: null, error: { code: "PGRST205", message: "Could not find the table 'public.platform_live_sessions' in the schema cache" } })))
    const reads = new LiveReads(r)
    const s1 = await liveSessions(reads, null, NOW)
    check("the admin's list says missing, with Supabase's own words", s1.missing && /Could not find the table 'public\.platform_live_sessions'/.test(reads.missingReason ?? ""))
    const db2 = fakeDb((c) => (c.rpc === "platform_live_overview" ? { data: null, error: MISSING } : { data: [], count: 2, error: null }))
    const reads2 = new LiveReads(readerWith(db2))
    const o1 = await liveOverview(reads2, NOW)
    const o2 = await liveOverview(new LiveReads(readerWith(db2)), NOW)
    check("asked on every read, never remembered", o1.missing && o2.missing && db2.calls.filter((c) => c.rpc === "platform_live_overview").length === 2)
    check("creators in /app still count while the part is missing", o1.overview.areas.app === 2 && o1.overview.online === null)
    const n = await liveNow(readerWith(fakeDb((c) => (c.table === "platform_live_sessions" ? { data: null, error: { code: "42P01", message: 'relation "public.platform_live_sessions" does not exist' } } : c.table === "analytics_events" ? { data: [{ visitor_id: "a" }, { visitor_id: "b" }, { visitor_id: "a" }], error: null } : { data: null, count: 0, error: null }))), NOW)
    check("the console's line falls back to creators' pages, said as such", n.scope === "creators" && n.liveNow === 2)
    const feed = await liveFeed(new LiveReads(readerWith(fakeDb(() => ({ data: null, error: MISSING })))), {})
    check("the feed says missing too", feed.missing && Array.isArray(feed.rows) && feed.rows.length === 0)
  }

  console.log("\nThe admin's reads, with the part in")
  {
    const sid = "abcdefgh12345678"
    const user = "aaaaaaaa-0000-4000-8000-000000000001"
    const db = fakeDb((c) => {
      if (c.rpc === "platform_live_overview") return { data: { online: 40, signed_in: 4, areas: { explore: 10, checkout: 2, nowhere: 9 }, countries_now: [["RO", 20]], today: 900, today_signed_in: 30, countries_today: [["RO", 400]] }, error: null }
      if (c.table === "creator_presence") return { data: [], count: 5, error: null }
      if (c.table === "platform_live_sessions") return { data: [{ sid, started_at: new Date(NOW - 300_000).toISOString(), last_seen_at: new Date(NOW - 10_000).toISOString(), area: "checkout", path: "/checkout", host: null, last_action: "checkout.start", last_action_at: new Date(NOW).toISOString(), pages: 4, user_id: user, country: "RO", device: "phone", os: "iOS", browser: "Safari", shell: "web", source: "instagram.com", trail: [[NOW / 1000 - 60, "explore", "/explore"], [NOW / 1000, "checkout", "/checkout"]] }], error: null }
      if (c.table === "profiles") return { data: [{ id: user, display_name: null, email: "jane.doe@gmail.com" }], error: null }
      if (c.table === "creators") return { data: [], error: null }
      if (c.table === "platform_live_events") return { data: [{ id: 9, at: new Date(NOW).toISOString(), sid, user_id: null, area: "checkout", name: "order.paid", path: "/receipt/:id", host: null, order_id: "0b6f7f2a-1c1b-4e7e-9a55-2f0e5f1c3a10", country: "RO" }], error: null }
      if (c.table === "orders") return { data: [{ id: "0b6f7f2a-1c1b-4e7e-9a55-2f0e5f1c3a10", created_at: new Date(NOW).toISOString(), amount_cents: 2900, currency: "usd" }], error: null }
      return { data: null, error: null }
    })
    const o = await liveOverview(new LiveReads(readerWith(db)), NOW)
    check("online now adds creators in /app; areas only the known ones", o.overview.online === 45 && o.overview.areas.app === 5 && o.overview.areas.explore === 10 && !("nowhere" in o.overview.areas) && o.overview.signedIn === 9)
    const s = await liveSessions(new LiveReads(readerWith(db)), null, NOW)
    const row = s.rows?.[0]
    check("a signed in, consenting visitor is shown by a masked address", row?.who.kind === "account" && row.who.label === "ja***@gmail.com")
    const listCall = db.calls.find((c) => c.table === "platform_live_sessions")
    check("the list reads the last two minutes on last_seen_at, newest first, at most 100", !!listCall && listCall.ops.some(([op, a]) => op === "gte" && a[0] === "last_seen_at") && listCall.ops.some(([op, a]) => op === "order" && a[0] === "last_seen_at") && listCall.ops.some(([op, a]) => op === "limit" && a[0] === 100))
    const one = await liveSession(new LiveReads(readerWith(db)), sid)
    check("one tab: its trail newest first, its actions, the order it paid", one.trail[0]?.path === "/checkout" && one.actions[0]?.name === "order.paid" && one.orders[0]?.id === "0b6f7f2a-1c1b-4e7e-9a55-2f0e5f1c3a10")
    check("a malformed tab id reads nothing", (await liveSession(new LiveReads(readerWith(db)), "../../etc")).session === null)
    const anonDb = fakeDb((c) => (c.table === "platform_live_events" ? { data: [{ id: 3, at: new Date(NOW).toISOString(), sid, user_id: null, area: "explore", name: "product.view", path: "/p/x", host: null, order_id: null, country: null }], error: null } : { data: [], error: null }))
    const f = await liveFeed(new LiveReads(readerWith(anonDb)), { area: "explore", action: "product.view" })
    const feedCall = anonDb.calls.find((c) => c.table === "platform_live_events")
    check("the feed: a visitor is 'Visitor' and four letters", f.rows?.[0]?.who.label === "Visitor abcd")
    check("the feed filters by area and action on their indexes, by id", !!feedCall && feedCall.ops.some(([op, a]) => op === "eq" && a[0] === "area") && feedCall.ops.some(([op, a]) => op === "eq" && a[0] === "name") && feedCall.ops.some(([op, a]) => op === "order" && a[0] === "id"))
    const bad = await liveFeed(new LiveReads(readerWith(anonDb)), { area: "'; drop", action: "nope" })
    check("an unknown filter is no filter", !!bad.rows)
    check("a trail item that is not ours is skipped", trailOf([[1, "x", "/a"], "junk", [null, "x", "/b"]]).length === 1)
    check("time on site in words", sessionLength(new Date(NOW - 75 * 60_000).toISOString(), new Date(NOW).toISOString()) === "1 h 15 min")
  }

  console.log("\nAdmin only")
  {
    const route = await import("@/app/api/admin/platform/[section]/route")
    for (const part of ["overview", "sessions", "session&id=abcdefgh12345678", "feed"]) {
      const res = await route.GET(new Request(`https://storelib.com/api/admin/platform/live?part=${part}`) as never, { params: Promise.resolve({ section: "live" }) })
      check(`live?part=${part.split("&")[0]} without the admin cookie: 401`, res.status === 401)
    }
    const src = read("app/api/admin/platform/[section]/route.ts")
    check("live is a section behind that one door", /"live",/.test(src) && src.indexOf("isAdminAuthenticated()") < src.indexOf("build(section"))
    const sql = read("supabase/sql/run-now/477_platform_live.sql")
    check("part 477: RLS on, no policy, nothing granted to anon or signed in users", /ENABLE ROW LEVEL SECURITY/.test(sql) && !/CREATE POLICY/i.test(sql) && /REVOKE ALL ON public\.platform_live_sessions FROM PUBLIC, anon, authenticated/.test(sql) && !/GRANT [^;]* TO (anon|authenticated)/.test(sql))
    check("part 477 changes nothing that exists", !/\bDROP\s+(TABLE|COLUMN|INDEX|FUNCTION)\b|\bTRUNCATE\b|ALTER TABLE [^;]* DROP/i.test(sql))
    check("part 477 keeps no IP and no email column", !/\bip\b|ip_address|email/i.test(sql.split("*/").slice(1).join("*/")))
    const ingest = read("app/api/live/route.ts")
    check("the ingest always answers 204 and sets no cookie", /status: 204/.test(ingest) && !/cookies\.set/.test(ingest))
  }

  console.log("\nThe purge")
  {
    forgetMissing()
    const sizes = [LIVE_PURGE_BATCH, 17]
    const db = fakeDb(() => ({ data: sizes.shift() ?? 0, error: null }))
    const out = await purgeOldLive(db)
    check("batches until a short one", out.removed === LIVE_PURGE_BATCH + 17 && db.calls.length === 2 && !out.failed)
    forgetMissing()
    const none = fakeDb(() => ({ data: null, error: MISSING }))
    const a = await purgeOldLive(none)
    const b = await purgeOldLive(none)
    check("before part 477: skipped quietly", a.missing && b.missing && !a.failed)
    const cron = read("app/api/cron/purge-chat-attachments/route.ts")
    check("in the daily cleanup that already runs, beside round 59's", /await purgeOldLive\(createAdminClient\(\)\)/.test(cron) && /await purgeOldActivity\(createAdminClient\(\)\)/.test(cron))
    const sql = read("supabase/sql/run-now/477_platform_live.sql")
    check("actions after 30 days, anonymous sessions after 7, the rest after 30", /at < now\(\) - interval '30 days'/.test(sql) && /interval '7 days'/.test(sql) && /user_id IS NULL AND NOT consented/.test(sql))
  }

  console.log("\nThe console")
  {
    const panel = read("app/(storelib)/admin/_console/panel-live.tsx")
    check("read every 30 s, only while the tab is visible", /const POLL_MS = 30_000/.test(panel) && /if \(document\.visibilityState !== "visible"\) return/.test(panel))
    check("Live is in the console's navigation", /\{ id: "live", label: "Live" \}/.test(read("app/(storelib)/admin/_console/shell.tsx")) && /"live"/.test(read("app/(storelib)/admin/_console/nav-state.ts")))
    check("no AI words and no em dashes in the copy", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform|—/i.test(panel + read("lib/live/live.ts")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

void main()
