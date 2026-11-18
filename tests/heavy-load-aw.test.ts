/** Round AW (heavy load): calls that end, clicks that do not wait on the database, counts the database makes, a limit on a public read. */
import { readCode } from "./_source"
import { GOOGLE_CALL_MS, GoogleCalendarError, askGoogle, freeBusy, listCalendars, refreshAccess, type Fetch } from "@/lib/google-calendar/api"
import { tallyFor } from "@/lib/onepage/poll-server"
import { starBreakdown } from "@/lib/reviews/store"
import { countStars, summarize, summarizeStars } from "@/lib/reviews/rules"
import { withDataBlocks, type DataDeps } from "@/lib/onepage/data-blocks-server"
import { forgetMissing } from "@/lib/supabase/missing-memory"
import { memoryFirstVerdict, MEMORY_FIRST_SHARE } from "@/lib/api/rate-limit"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}`)
  }
}
const sleep = (ms: number) => new Promise<"late">((r) => setTimeout(() => r("late"), ms))
/* A section that throws is one failure, and the next section still runs. */
async function section(title: string, run: () => Promise<void>) {
  console.log(`\n${title}`)
  try {
    await run()
  } catch (e) {
    check(`the section ran to its end (${e instanceof Error ? e.message : String(e)})`, false)
  }
}

/*
  A database the way PostgREST answers: a GET returns at most MAX_ROWS rows
  whatever the limit asks, a count is of every matching row, a HEAD has no
  body (so a HEAD naming a missing column answers an error with no code), and
  `neq` leaves NULL out as SQL does.
*/
const MAX_ROWS = 1000
type Row = Record<string, unknown>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function postgrest(tables: Record<string, Row[]>, opts: { missingColumns?: string[] } = {}): any {
  const missing = new Set(opts.missingColumns ?? [])
  const asked: { table: string; head: boolean; counted: boolean; rows: number }[] = []
  function from(table: string) {
    const filters: ((r: Row) => boolean)[] = []
    const named: string[] = []
    let head = false
    let counted = false
    let limitN = Infinity
    let single = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api: any = {}
    api.select = (_columns?: string, o?: { count?: string; head?: boolean }) => ((head = !!o?.head), (counted = o?.count === "exact"), api)
    api.eq = (k: string, v: unknown) => (named.push(k), filters.push((r) => r[k] === v), api)
    api.neq = (k: string, v: unknown) => (named.push(k), filters.push((r) => r[k] !== null && r[k] !== undefined && r[k] !== v), api)
    api.in = (k: string, v: unknown[]) => (named.push(k), filters.push((r) => v.includes(r[k])), api)
    api.order = () => api
    api.limit = (n: number) => ((limitN = n), api)
    api.maybeSingle = () => ((single = true), api)
    api.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
      try {
        const gone = named.find((c) => missing.has(c))
        if (gone) {
          asked.push({ table, head, counted, rows: 0 })
          return resolve(head ? { data: null, count: null, error: { message: "" } } : { data: null, count: null, error: { code: "42703", message: `column ${table}.${gone} does not exist` } })
        }
        const all = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
        const rows = head ? [] : all.slice(0, Math.min(limitN, MAX_ROWS))
        asked.push({ table, head, counted, rows: rows.length })
        return resolve({ data: head ? null : single ? (rows[0] ?? null) : rows, count: counted ? all.length : null, error: null })
      } catch (e) {
        return reject?.(e)
      }
    }
    return api
  }
  return { from, tables, asked }
}

async function main() {
  await section("Every call to Google Calendar ends (a visitor's booking calendar and booking never wait on a Google that does not answer)", async () => {
    check("one call's deadline is a few seconds, never the platform's 300", typeof GOOGLE_CALL_MS === "number" && GOOGLE_CALL_MS >= 2_000 && GOOGLE_CALL_MS <= 10_000)
    /* A Google that took the request and never answers: only an abort ends it. */
    const hang: Fetch = (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        if (!signal) return
        if (signal.aborted) return reject(signal.reason)
        signal.addEventListener("abort", () => reject(signal.reason), { once: true })
      })
    const ask = typeof askGoogle === "function" ? askGoogle : null
    const t0 = Date.now()
    const late = ask ? await Promise.race([ask(hang, "https://www.googleapis.com/calendar/v3/freeBusy", {}, "Google Calendar did not answer. Try again.", 60).then(() => "answered", (e: unknown) => e), sleep(3_000)]) : "missing"
    check("a call that gets no answer is given up on at its deadline", late instanceof GoogleCalendarError && Date.now() - t0 < 2_000)
    check("  as a GoogleCalendarError (504) in plain words, which every caller already turns into its fallback", late instanceof GoogleCalendarError && late.status === 504 && late.reconnect === false && late.message === "Google Calendar did not answer. Try again.")
    const down: Fetch = async () => {
      throw new TypeError("fetch failed")
    }
    const unreachable = ask ? await ask(down, "https://oauth2.googleapis.com/token", {}, "Google did not answer the sign in. Try again.", 60).then(() => null, (e: unknown) => e) : null
    check("a dropped connection is a GoogleCalendarError too (502), never the network's own words", unreachable instanceof GoogleCalendarError && unreachable.status === 502 && unreachable.message === "Google did not answer the sign in. Try again.")
    const mine = new AbortController()
    mine.abort(new Error("the caller stopped"))
    const stopped = ask ? await ask(hang, "https://www.googleapis.com/calendar/v3/x", { signal: mine.signal }, "no", 5_000).then(() => null, (e: unknown) => e) : null
    check("a caller's own abort is handed back as it was", stopped instanceof Error && !(stopped instanceof GoogleCalendarError) && stopped.message === "the caller stopped")
    const ok: Fetch = async () => new Response(JSON.stringify({ calendars: {} }), { status: 200, headers: { "content-type": "application/json" } })
    check("an answer in time is handed back untouched", ask ? (await ask(ok, "https://www.googleapis.com/x", {}, "no", 1_000)).status === 200 : false)

    /* Every public call hands its fetch a live signal. */
    const signals: (AbortSignal | null | undefined)[] = []
    const spy: Fetch = async (url, init) => {
      signals.push(init?.signal)
      if (url.includes("/token")) return new Response(JSON.stringify({ access_token: "ya29.x", expires_in: 3600 }), { status: 200, headers: { "content-type": "application/json" } })
      if (url.includes("calendarList")) return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "content-type": "application/json" } })
      return new Response(JSON.stringify({ calendars: {} }), { status: 200, headers: { "content-type": "application/json" } })
    }
    await freeBusy(spy, "ya29.x", ["primary"], 0, 86_400_000)
    await listCalendars(spy, "ya29.x")
    await refreshAccess(spy, { clientId: "id", clientSecret: "secret" }, "1//refresh", 0)
    check("freeBusy, the calendar list and the token refresh each give the fetch a deadline signal", signals.length === 3 && signals.every((s) => typeof AbortSignal !== "undefined" && s instanceof AbortSignal && !s.aborted))

    /* End to end with the real deadline: the slots' busy read against a Google that never answers ends (before: never). */
    const started = Date.now()
    const busy = await Promise.race([freeBusy(hang, "ya29.x", ["primary"], 0, 86_400_000).then(() => "answered", (e: unknown) => e), sleep(GOOGLE_CALL_MS + 3_000)])
    check(`freeBusy against a Google that never answers ends with a GoogleCalendarError at about ${GOOGLE_CALL_MS / 1000}s`, busy instanceof GoogleCalendarError && Date.now() - started >= GOOGLE_CALL_MS - 200 && Date.now() - started < GOOGLE_CALL_MS + 2_500)

    const api = readCode("lib/google-calendar/api.ts")
    const direct = [...api.matchAll(/\bfetcher\(/g)].length
    check("no call reaches Google except through askGoogle (one fetcher call in the file, inside it)", direct === 1 && /return await fetcher\(url, \{ \.\.\.init, signal: merged\(caller, ours\) \}\)/.test(api))
  })

  await section("A campaign link goes at once: the recipient's row is read with the click, after the response", async () => {
    const click = readCode("app/api/email/click/route.ts")
    const get = click.slice(click.indexOf("export async function GET"))
    const vouched = get.indexOf("if (allowed) {")
    check("a signed link (or Storelib's own page) is decided before any database read", vouched > 0 && !/\bawait\b/.test(get.slice(0, vouched)))
    const block = vouched > 0 ? get.slice(vouched, get.indexOf("let recipient", vouched)) : ""
    check("  and redirected in that branch, its row read inside after()", /after\(async \(\) => \{[\s\S]*await recipientOf\(db, t\)[\s\S]*await recordClick\(db, r, target, userAgent\)[\s\S]*\}\)[\s\S]*return NextResponse\.redirect\(target\)/.test(block))
    check("an older unsigned link is still vouched for by the campaign's own body before it goes", /recipient = await recipientOf\(db, token!\)/.test(get) && /appearsIn\(campaign\.body, target\)/.test(get) && get.indexOf("appearsIn(") > vouched)
    check("  and anything not vouched for still goes home", /if \(!allowed\) return NextResponse\.redirect\(home\)/.test(get))
    check("the click is still counted once, with its event", /click_count: \(r\.click_count \|\| 0\) \+ 1/.test(click) && /event_type: "clicked"/.test(click) && [...click.matchAll(/recordClick\(/g)].length === 3)
  })

  await section("A poll's totals are counted by the database, exact past a thousand votes", async () => {
    const PAGE = "11111111-2222-4333-8444-555555555555"
    const votes: Row[] = []
    for (let i = 0; i < 1500; i++) votes.push({ onepage_id: PAGE, block_id: "poll1", option_id: "a", voter_key: `a${i}` })
    for (let i = 0; i < 1000; i++) votes.push({ onepage_id: PAGE, block_id: "poll1", option_id: "b", voter_key: `b${i}` })
    for (let i = 0; i < 40; i++) votes.push({ onepage_id: PAGE, block_id: "poll1", option_id: "gone", voter_key: `g${i}` })
    for (let i = 0; i < 30; i++) votes.push({ onepage_id: PAGE, block_id: "poll2", option_id: "a", voter_key: `o${i}` })
    const db = postgrest({ onepage_poll_votes: votes })
    const tally = await tallyFor(db, PAGE, "poll1", [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }])
    check("2,500 votes are 2,500 (a read of rows stopped at 1,000)", tally?.total === 2500)
    check("  shared 60, 40, 0 by what was really voted", tally?.options.map((o) => `${o.id}:${o.count}:${o.percent}`).join() === "a:1500:60,b:1000:40,c:0:0")
    check("  an answer the creator removed is still left out, another poll's votes never counted", !tally?.options.some((o) => o.id === "gone") && tally?.options.find((o) => o.id === "a")?.count === 1500)
    check("  and no vote rows cross the wire, only counts", db.asked.length === 3 && db.asked.every((a: { head: boolean; counted: boolean; rows: number }) => a.head && a.counted && a.rows === 0))
    const broken = postgrest({ onepage_poll_votes: votes }, { missingColumns: ["option_id"] })
    check("a count that fails is no tally, as a failed read was", (await tallyFor(broken, PAGE, "poll1", [{ id: "a", label: "A" }])) === null)
    check("a poll with no answers is an empty tally", (await tallyFor(db, PAGE, "poll1", []))?.total === 0)
  })

  await section("Ratings are counted by the database: past a thousand reviews the count, the average and the stars stay right", async () => {
    const PRODUCT = "99999999-8888-4777-8666-555555555555"
    const CREATOR = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
    const reviews: Row[] = []
    const add = (n: number, rating: number, extra: Row) => {
      for (let i = 0; i < n; i++) reviews.push({ id: `${reviews.length}`, product_id: PRODUCT, creator_id: CREATOR, rating, status: "published", verified: true, ...extra })
    }
    add(1500, 5, {})
    add(500, 1, {})
    add(300, 1, { verified: false })
    add(100, 5, { status: "hidden" })
    forgetMissing()
    const db = postgrest({ reviews })
    const product = await starBreakdown(db, PRODUCT)
    check("2,000 verified buyers' reviews are 2,000 (the read stopped at 1,000)", product?.count === 2000)
    check("  averaging 4.0 over all of them (the first thousand read said 5.0)", product?.average === 4)
    check("  with every star counted", JSON.stringify(product?.stars) === JSON.stringify({ 1: 500, 2: 0, 3: 0, 4: 0, 5: 1500 }))
    check("  an imported or hidden review moves nothing, and no review rows cross the wire", db.asked.length === 5 && db.asked.every((a: { counted: boolean; rows: number }) => a.counted && a.rows <= 1))
    forgetMissing()
    const older = postgrest({ reviews: reviews.map(({ verified: _v, ...r }) => r) }, { missingColumns: ["verified"] })
    const before134 = await starBreakdown(older, PRODUCT)
    check("a database before part 134 (no verified) is asked the older way and still counts every published review", before134?.count === 2300 && before134?.average === Math.round(((1500 * 5 + 800) / 2300) * 10) / 10)
    forgetMissing()
    const store = readCode("lib/reviews/store.ts")
    check("the recount after a review writes the counted figures, never a thousand-row sample, onto the product and the creator", /const stars = await publishedStars\(db, \{ productId: ids\.productId \}\)/.test(store) && /const stars = await publishedStars\(db, \{ creatorId: ids\.creatorId \}\)/.test(store) && !/\.select\("rating"\)/.test(store))

    const deps: DataDeps = { ready: async () => false, currency: async () => "usd", money: (c) => `$${c / 100}`, reviews: async () => null, fetchText: async () => null, bandsintown: async () => null }
    const block = { id: "s", type: "app", enabled: true, sort_order: 0, data: { provider: "stats", items: [{ id: "r", title: "Rating", value: "", source: "rating" }] } }
    const shopDb = postgrest({ reviews: reviews.map((r) => ({ ...r, creator_id: CREATOR })) })
    const filled = (await withDataBlocks(shopDb, deps, CREATOR, [block])) as { data: { items: { value: string }[] } }[]
    /* Every published review of the store, imported ones too, as the stats block always counted: (1500*5 + 800*1) / 2300. */
    check("a OnePage's rating stat is the average of every published review, not of the first thousand", filled[0]?.data?.items?.[0]?.value === (Math.floor(((1500 * 5 + 800) / 2300) * 10) / 10).toFixed(1))
  })

  await section("The figures from star counts are the figures from the ratings themselves", async () => {
    for (let round = 0; round < 25; round++) {
      const ratings = Array.from({ length: 1 + Math.floor(Math.random() * 400) }, () => 1 + Math.floor(Math.random() * 5))
      const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      for (const r of ratings) counts[r]++
      const a = summarize(ratings)
      const b = summarizeStars(counts)
      if (a.count !== b.count || a.average !== b.average || JSON.stringify(a.stars) !== JSON.stringify(b.stars)) {
        check(`summarizeStars agrees with summarize (${JSON.stringify(counts)})`, false)
        break
      }
      if (round === 24) check("summarizeStars gives what summarize gives for the same ratings (25 random sets)", true)
    }
    check("no reviews is a count of 0 and an average of 0", summarizeStars({}).count === 0 && summarizeStars({}).average === 0)
    const firstError = await countStars((n) => Promise.resolve(n === 3 ? { error: { code: "42703", message: "missing" } } : { count: 2 }))
    check("countStars hands back the first error, so a ladder can see a missing column", firstError.data === null && firstError.error?.code === "42703")
    const thrown = await countStars((n) => (n === 2 ? Promise.reject(new Error("socket hang up")) : Promise.resolve({ count: 1 })))
    check("  and never throws", thrown.data === null && /socket hang up/.test(String(thrown.error?.message)))
    const fine = await countStars((n) => Promise.resolve({ count: n * 10 }))
    check("  five counts are the stars", JSON.stringify(fine.data) === JSON.stringify({ 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 }))
  })

  await section("The public price check is limited per address, counted in memory first like the cart's", async () => {
    const route = readCode("app/api/products/prices/route.ts")
    check("each address is limited before any read", /rateLimit\(\{ bucket: "product-prices", subjects: \[addressSubject\(request\)\], windows: PRICE_WINDOWS, memoryFirst: true/.test(route) && route.indexOf("rateLimit(") > 0 && route.indexOf("rateLimit(") < route.indexOf("createPublicReadClient()"))
    const m = /PRICE_WINDOWS: readonly RateWindow\[\] = \[\{ limit: (\d+), seconds: 60 \}, \{ limit: (\d+), seconds: 3600 \}\]/.exec(route)
    const perMinute = m ? Number(m[1]) : 0
    const perHour = m ? Number(m[2]) : 0
    check("the limit is far above a visitor's few asks a minute", perMinute >= 60 && perHour >= 600)
    const windows = [{ limit: perMinute, seconds: 60 }, { limit: perHour, seconds: 3600 }]
    const store = new Map<string, { n: number; until: number }>()
    const t = 1_000_000
    const visitor = Array.from({ length: 10 }, (_, i) => memoryFirstVerdict("product-prices", ["ip:visitor"], windows, t + i * 1000, store))
    check("  a visitor's asks are allowed without counting in Postgres", visitor.every((v) => v === "allow"))
    const flood = Array.from({ length: perMinute + 5 }, () => memoryFirstVerdict("product-prices", ["ip:script"], windows, t, store))
    check("  a script asking every id it can find is refused here, without Postgres", flood.slice(-3).every((v) => v === "refuse") && flood.filter((v) => v === "ask").length > 0 && Math.floor(perMinute * MEMORY_FIRST_SHARE) > 10)
    const client = readCode("components/product/use-canonical-price.ts")
    check("a refused answer changes nothing on the page: the card keeps its own price", /if \(!res\.ok\) return/.test(client))
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
