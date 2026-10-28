/**
 * ===========================================================================
 *  A VISITOR WHO DECLINED ANALYTICS IS ONE VISIT, NOT ONE PER PAGE
 * ===========================================================================
 * lib/analytics/anon-visit.ts. Without analytics consent app/api/track-view
 * gave every page view a fresh visitor and session, so five pages were five
 * sessions: sessions read high and conversion (orders over sessions) low.
 * What this pins:
 *
 *   the visitor is a keyed hash, stable for a day and a creator, never the IP
 *   it changes every UTC day and differs per creator, so it follows nobody
 *   pages under 30 minutes apart are one session, as with consent
 *   the reports then count that visitor's five pages as one session
 *   both trackers use it, store nothing on the device, and hand no hash back
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ANON_SESSION_MS, anonSession, anonSessionId, anonVisitorId, clientIp, dailyKey, utcDay } from "../lib/analytics/anon-visit"
import { buildReports } from "../lib/analytics/reports"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const SECRET = "test-secret"
const IP = "203.0.113.7"
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1"
const CREATOR = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"
const MORNING = Date.parse("2026-09-25T08:00:00Z")
const id = (over: Partial<Parameters<typeof anonVisitorId>[0]> = {}) =>
  anonVisitorId({ ip: IP, userAgent: UA, creatorId: CREATOR, now: MORNING, secret: SECRET, ...over })

async function main() {
  console.log("\nThe visitor: a daily hash, never the address")
  {
    const v = id()
    check("the same person on the same day is the same visitor", v !== null && v === id({ now: MORNING + 9 * 3_600_000 }))
    check("  written as anon_ and 32 hex characters", /^anon_[0-9a-f]{32}$/.test(v ?? ""), v)
    check("  holding neither the IP address nor the browser", !(v ?? "").includes(IP) && !(v ?? "").includes("iPhone"))
    check("the next UTC day is a new visitor", id({ now: MORNING + 24 * 3_600_000 }) !== v)
    check("another creator sees another visitor", id({ creatorId: OTHER }) !== v)
    check("another browser is another visitor", id({ userAgent: "curl-less browser" }) !== v)
    check("another secret, another visitor: nothing is linkable without the server's secret", id({ secret: "other" }) !== v)
    check("no IP address, no hash: the caller falls back to a throwaway id", id({ ip: null }) === null)
    check("the key turns over at UTC midnight", utcDay(Date.parse("2026-09-25T23:59:59Z")) === "2026-09-25" && dailyKey(MORNING, SECRET) !== dailyKey(MORNING + 86_400_000, SECRET))
  }

  console.log("\nThe address, as the platform saw it")
  check("the first address a proxy forwarded", clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })) === IP)
  check("  or the real IP header", clientIp(new Headers({ "x-real-ip": IP })) === IP)
  check("  or nothing", clientIp(new Headers()) === null)

  console.log("\nThe session: pages under 30 minutes apart")
  {
    const v = id()!
    const rows: Array<{ creator_id: string; visitor_id: string; event_type: string; session_id: string; created_at: string }> = []
    const db = {
      from: () => {
        const f: Array<(r: (typeof rows)[number]) => boolean> = []
        const q = {
          select: () => q,
          eq: (c: string, val: unknown) => (f.push((r) => (r as Record<string, unknown>)[c] === val), q),
          gte: (c: string, val: string) => (f.push((r) => (r as Record<string, string>)[c] >= val), q),
          order: () => q,
          limit: () => q,
          then: (res: (x: unknown) => unknown) =>
            Promise.resolve(res({ data: rows.filter((r) => f.every((g) => g(r))).sort((a, b) => b.created_at.localeCompare(a.created_at)), error: null })),
        }
        return q
      },
    }
    const view = async (at: number) => {
      const s = await anonSession(db, v, CREATOR, at)
      rows.push({ creator_id: CREATOR, visitor_id: v, event_type: "view", session_id: s, created_at: new Date(at).toISOString() })
      return s
    }
    const first = await view(MORNING)
    const second = await view(MORNING + 10 * 60_000)
    const third = await view(MORNING + 35 * 60_000)
    check("the first page starts a visit", first === anonSessionId(v, MORNING))
    check("a page ten minutes later is the same visit", second === first)
    check("  and one 25 minutes after that still is: 30 minutes without a page ends it, not 30 from the start", third === first)
    const later = await view(MORNING + 35 * 60_000 + ANON_SESSION_MS + 1)
    check("over 30 minutes without a page is a new visit", later !== first)
    check("another creator's pages never join it", (await anonSession(db, v, OTHER, MORNING + 11 * 60_000)) !== first)

    console.log("\nThe reports count that visitor once per visit")
    const window = { start: MORNING - 3_600_000, end: MORNING + 3 * 3_600_000 }
    const r = buildReports({
      /* Every page view the tracker writes now says which place it was on (part 61); a visit is counted per place. */
      views: rows.map((x, i) => ({ id: `e${i}`, visitor_id: x.visitor_id, session_id: x.session_id, created_at: x.created_at, property_type: "creator_page", property_id: null })),
      steps: [],
      orders: [],
      window,
      previous: null,
      timeZone: "UTC",
      mainDomain: "",
      productTitles: {},
    })
    check("four pages over two visits are two sessions, not four", r.sessions.value === 2 && r.views.value === 4, { sessions: r.sessions.value, views: r.views.value })
  }

  console.log("\nThe trackers")
  {
    /* Changed on purpose: views, links and funnel steps are one pipeline now, lib/analytics/collect. */
    const view = read("lib/analytics/collect.ts")
    const door = read("lib/analytics/collect-route.ts")
    check("the view tracker gives a declining visitor the daily hash and its visit",
      /anonVisitorId\(\{ ip: clientIp\(req\.headers\), userAgent: ua, creatorId, now \}\)/.test(view) && /await anonSession\(db, anonVisitor, creatorId, now\)/.test(view))
    check("  still reads no cookie and sets none without consent",
      /consented \? browserId\(req\.cookie\("visitor_id"\)\)/.test(view) && /if \(!consented\) return req\.cookie\("visitor_id"\) \? \{ clear: true \} : null/.test(view))
    check("  and hands the hash back to nobody: every answer is an empty 204", /new NextResponse\(null, \{ status: 204 \}\)/.test(door) && !/NextResponse\.json/.test(door) && !/visitorId/.test(door))
    const written = view.slice(view.indexOf("/* 11. The row. */"), view.indexOf("const insert = async"))
    check("  the IP address is never written to the event", written.length > 100 && !/clientIp|forwarded|\bip\b/i.test(written.replace(/x-vercel-ip-(country|city|country-region)/g, "")))
    check("the funnel steps join the same visit", /visitorId = consented \? browserId\(body\.visitorId\) : anonVisitor/.test(view) && /sessionId = consented \? sessionFromBody : anonVisitor \? await anonSession\(db, anonVisitor, creatorId, now\)/.test(view))
    check("the privacy policy says what is kept", /changes every day and cannot be turned back into either/.test(read("components/legal/privacy-body.tsx"))) /* Changed on purpose (r40): the text moved out of the page so a OnePage can show it in a sheet. */
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
