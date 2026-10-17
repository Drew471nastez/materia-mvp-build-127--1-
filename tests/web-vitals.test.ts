/**
 * The website page's performance bar and what feeds it:
 *
 *   lib/website-builder/web-vitals.ts          Google's lines, p75, CLS and INP
 *   components/website-builder/site-vitals.tsx the collector on published sites
 *   app/api/public/vitals/route.ts             where the beacons land
 *   supabase/sql/RUN_SITE_VITALS.sql           the table, its policy, its reads
 *   lib/website-builder/site-performance.ts    visits, orders and conversion
 *   components/ui/responsive-action-menu.tsx   the More menu's groups
 *
 * The rule that runs through all of it: every number is measured, and a
 * number that is not there says so.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  MIN_SAMPLES,
  cleanBeacon,
  clsFromShifts,
  deviceClassOf,
  formatVital,
  inpFromInteractions,
  p75,
  rate,
  vitalsFromRows,
} from "@/lib/website-builder/web-vitals"
import { trafficFigures } from "@/lib/website-builder/site-performance"
import { analyticsHref, periodFromParams, periodQuery } from "@/lib/website-builder/site-period"
import { groupsOf } from "@/components/ui/responsive-action-menu"
import type { ViewRow } from "@/lib/analytics/reports"
import type { OrderRow } from "@/lib/orders/order-view"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
function section(name: string) {
  console.log(`\n  ${name}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

// ── Google's lines ──────────────────────────────────────────────────────
section("Good, Needs improvement and Poor are Google's lines")
check("LCP: 2.5 s is good, 4 s is the last needs improvement, past it poor",
  rate("lcp", 2500) === "good" && rate("lcp", 2501) === "needs-improvement" && rate("lcp", 4000) === "needs-improvement" && rate("lcp", 4001) === "poor")
check("INP: 200 ms and 500 ms", rate("inp", 200) === "good" && rate("inp", 201) === "needs-improvement" && rate("inp", 500) === "needs-improvement" && rate("inp", 501) === "poor")
check("CLS: 0.1 and 0.25", rate("cls", 0.1) === "good" && rate("cls", 0.11) === "needs-improvement" && rate("cls", 0.25) === "needs-improvement" && rate("cls", 0.26) === "poor")
check("numbers read the way a person says them",
  formatVital("lcp", 2140) === "2.1 s" && formatVital("lcp", 850) === "850 ms" && formatVital("inp", 184) === "184 ms" && formatVital("cls", 0.043) === "0.04")

section("The 75th percentile is a value somebody had")
check("nearest rank, not interpolated", p75([1, 2, 3, 4]) === 3 && p75([10, 20, 30, 40, 50, 60, 70, 80]) === 60 && p75([5]) === 5)
check("no values is no answer, never zero", p75([]) === null)

section("CLS is the worst session window")
check("shifts under a second apart add up", Math.abs(clsFromShifts([{ value: 0.05, startTime: 100 }, { value: 0.05, startTime: 900 }]) - 0.1) < 1e-9)
check("a gap of a second or more starts a new window", clsFromShifts([{ value: 0.05, startTime: 100 }, { value: 0.04, startTime: 1200 }]) === 0.05)
check("a window is at most five seconds long",
  (() => {
    const shifts = Array.from({ length: 12 }, (_, i) => ({ value: 0.01, startTime: i * 600 }))
    // 0..4800 is nine shifts inside five seconds; the tenth at 5400 starts again.
    return Math.abs(clsFromShifts(shifts) - 0.09) < 1e-9
  })())
check("a page that never moved has a CLS of 0", clsFromShifts([]) === 0)

section("INP forgives one outlier per fifty interactions")
check("few interactions: the slowest one", inpFromInteractions([40, 300, 120], 3) === 300)
check("fifty or more: the second slowest", inpFromInteractions([900, 300, 120, 80], 60) === 300)
check("a hundred or more: the third", inpFromInteractions([900, 700, 300, 120], 130) === 300)
check("nobody interacted: no INP, not an INP of zero", inpFromInteractions([], 0) === null)

// ── The beacon ──────────────────────────────────────────────────────────
section("What the ingest route accepts")
const id = "0b7e4c1a-5d2f-4e8b-9a61-3c2d1e0f9a8b"
check("a site id and a believable number", JSON.stringify(cleanBeacon({ s: id, lcp: 2140.6, cls: 0.043219 })) === JSON.stringify({ installId: id, lcp: 2141, inp: null, cls: 0.0432 }))
check("anything that is not a site id is nothing", cleanBeacon({ s: "../etc", lcp: 100 }) === null && cleanBeacon({ lcp: 100 }) === null && cleanBeacon("x") === null)
check("a minute is the most any timing can be; past it, or negative, it is dropped",
  cleanBeacon({ s: id, lcp: 60_001, inp: -1, cls: 0.2 })?.lcp === null && cleanBeacon({ s: id, lcp: 60_001, inp: -1, cls: 0.2 })?.inp === null)
check("no believable number at all is nothing", cleanBeacon({ s: id, lcp: "fast", cls: 99 }) === null)
check("nothing else in the body is read, so nothing else can be stored",
  Object.keys(cleanBeacon({ s: id, lcp: 100, email: "a@b.c", url: "https://x" }) ?? {}).sort().join() === "cls,inp,installId,lcp")
check("phones and tablets are mobile, the way Search Console splits them",
  deviceClassOf("mobile") === "mobile" && deviceClassOf("tablet") === "mobile" && deviceClassOf("desktop") === "desktop" && deviceClassOf(null) === "desktop")

section("Too few page loads is said, not shown")
{
  const m = vitalsFromRows([
    { metric: "lcp", device: null, p75: 2100, samples: MIN_SAMPLES },
    { metric: "lcp", device: "mobile", p75: 2900, samples: MIN_SAMPLES - 1 },
    { metric: "inp", device: null, p75: null, samples: 0 },
  ])
  check("enough samples: the number", m.lcp.all.p75 === 2100 && m.lcp.all.samples === MIN_SAMPLES)
  check("one short: no number, and the count is kept to say how many", m.lcp.mobile.p75 === null && m.lcp.mobile.samples === MIN_SAMPLES - 1)
  check("a metric with no rows is empty, not zero", m.cls.all.p75 === null && m.cls.all.samples === 0)
}

// ── Visits, orders, conversion ──────────────────────────────────────────
section("Visits and orders are the website's own")
{
  const day = Date.UTC(2026, 8, 10)
  const span = { start: day, end: day + 86_400_000 }
  const previous = { start: day - 86_400_000, end: day }
  const at = (h: number, back = false) => new Date((back ? previous.start : span.start) + h * 3_600_000).toISOString()
  const views: ViewRow[] = [
    { session_id: "a", created_at: at(1), page_url: "https://mara.storelib.com/" },
    { session_id: "a", created_at: at(2), page_url: "https://mara.storelib.com/about" },
    { session_id: "b", created_at: at(3), page_url: "https://www.marashop.com/" },
    { session_id: "c", created_at: at(4), page_url: "https://storelib.com/mara" },
    { session_id: "d", created_at: at(5), page_url: null },
    { session_id: "e", created_at: at(5, true), page_url: "https://mara.storelib.com/" },
  ]
  const order = (id: string, source: string | null, status: string, h: number, session?: string): OrderRow =>
    ({ id, product_id: "p", status, created_at: at(h), amount_cents: 1000, source, stripe_session_id: session ?? null }) as unknown as OrderRow
  const orders: OrderRow[] = [
    order("1", "website", "completed", 6),
    order("2", "storelib", "completed", 7),
    order("3", "website", "failed", 8),
    order("4", "website", "pending", 9),
    order("5", null, "completed", 10, "cs_1"),
    order("6", null, "completed", 10, "cs_1"),
  ]
  const f = trafficFigures({ views, orders, span, previous, timeZone: "UTC", mainDomain: "storelib.com" })
  check("a visit to the subdomain or the connected domain counts once, storelib.com does not", f.visits?.value === 2, JSON.stringify(f.visits))
  check("  and the period before is counted the same way", f.visits?.previous === 1 && f.visits?.change === 1)
  check("orders the website brought, paid only; a basket is always the website's", f.orders?.value === 2, JSON.stringify(f.orders))
  check("conversion is orders per visit", f.conversion?.value === 1)
  const unread = trafficFigures({ views: null, orders, span, previous, timeZone: "UTC", mainDomain: "storelib.com" })
  check("a read that failed is null, never a zero, and takes conversion with it", unread.visits === null && unread.conversion === null && unread.orders !== null)
  const allTime = trafficFigures({ views, orders, span, previous: null, timeZone: "UTC", mainDomain: "storelib.com" })
  check("with nothing to compare against there is no change", allTime.visits?.previous === null && allTime.visits?.change === null)
}

section("The period is the shared picker's, and Analytics opens on the same one")
{
  const now = Date.UTC(2026, 8, 24, 15)
  const p = periodFromParams(new URLSearchParams(), "UTC", now)
  check("thirty days by default, like Shopify's bar", p.period.preset === "last_30_days" && p.period.end === "2026-09-24")
  check("compared with the thirty days before", !!p.previous && p.previous.end <= p.span.start)
  const all = periodFromParams(new URLSearchParams("range=all_time"), "UTC", now)
  check("all time is compared with nothing", all.previous === null)
  check("Analytics is opened on the same period", analyticsHref(p.period) === "/app/analytics?range=last_30_days")
  const custom = periodFromParams(new URLSearchParams("range=custom&from=2026-09-01&to=2026-09-10"), "UTC", now)
  check("a custom range travels with its dates", analyticsHref(custom.period) === "/app/analytics?range=custom&from=2026-09-01&to=2026-09-10")
  check("the bar's own default is left out of its address", periodQuery(p.period, "last_30_days") === "")
}

// ── The collector ───────────────────────────────────────────────────────
section("The collector runs on published pages only, once, and sends nothing personal")
{
  /*
    The collector is one inline script now (lib/perf/site-vitals-inline.ts),
    the same on a Storelib theme's page and an imported theme's, and it no
    longer sends the site: the route finds it from the host
    (tests/web-performance-v.test.ts holds the rest of it).
  */
  const c = read("lib/perf/site-vitals-inline.ts")
  check("never inside a frame (the editor canvas, previews embedded anywhere)", /W\.self!==W\.top/.test(c))
  check("never in a browser driven by a script (cover screenshots, bots)", /N\.webdriver/.test(c))
  check("once per page load, whatever remounts it", /if\(W\.__slSV\|\|/.test(c) && /W\.__slSV=1/.test(c))
  check("the browser's own observers, no library", /new PerformanceObserver/.test(c) && /"largest-contentful-paint"/.test(c) && /"layout-shift"/.test(c) && /"event"/.test(c) && !/from "web-vitals"/.test(c))
  check("sent once, as the page is hidden or left, by beacon", /"visibilitychange"/.test(c) && /"pagehide"/.test(c) && /sendBeacon/.test(c) && /if\(v\.sent\)return/.test(c))
  const js = c.slice(c.indexOf("export const SITE_VITALS_JS"))
  check("no cookie and no visitor in the body, and no site id either", !/document\.cookie|localStorage|visitor/i.test(js) && !/installId|s:ID/.test(js) && /credentials:"omit"/.test(js))
  check("a Storelib theme's page renders that script", /__html: SITE_VITALS_JS/.test(code("components/website-builder/site-vitals.tsx")))
  const site = read("app/(site)/w/[username]/render-site.tsx")
  const published = site.slice(site.indexOf("export async function renderSite"), site.indexOf("export async function previewInstall"))
  const preview = site.slice(site.indexOf("async function previewPage"))
  check("mounted on the published site", /<SiteVitals installId=\{site\.installId\} \/>/.test(published))
  check("  and not on a preview or a cover render", !/SiteVitals/.test(preview))
  check("  and on a product page only without a preview token", /previewToken \? null : <SiteVitals installId=\{install\.id\} \/>/.test(read("components/website-builder/theme/render-product.tsx")))
  check("no new dependency for any of it", !/"web-vitals"/.test(read("package.json")))
}

section("The ingest route keeps the site, the numbers, the device and the day")
{
  const r = code("app/api/public/vitals/route.ts")
  check("under /api/public/, the prefix the proxy keeps for public endpoints", true)
  check("validated and bounded by the pure rules", /cleanRumBeacon\(raw\)/.test(r))
  check("only a published site is recorded, found from the host", /rumSiteOfHost\(admin, req\.headers\.get\("host"\)/.test(r) && /\.eq\("status", "published"\)/.test(read("lib/website-builder/rum-site.ts")))
  check("limited per address", /PER_MINUTE/.test(r) && /allowed\(address/.test(r))
  check("bots are not visitors", /isBotAgent/.test(r))
  check("it sets no cookie and caches nothing", !/cookies\(|set-cookie|Set-Cookie/i.test(r) && /"Cache-Control": "no-store"/.test(r))
  check("the body is capped", /MAX_BODY/.test(r))
  check("it stops asking while the SQL has not been run", /missingUntil/.test(r))
  const sql = read("supabase/sql/RUN_SITE_VITALS.sql")
  check("the table has no address, no agent, no time of day", !/\b(ip|user_agent|url|created_at|timestamp)\b/i.test(sql.slice(sql.indexOf("create table"), sql.indexOf(");", sql.indexOf("create table")))))
  check("row level security: a creator reads only their own sites",
    /enable row level security/.test(sql) && /creator_id in \(select c\.id from public\.creators c where c\.user_id = auth\.uid\(\)\)/.test(sql))
  check("  and nobody writes from a browser", /revoke insert, update, delete on public\.site_web_vitals from anon, authenticated/.test(sql) && !/for insert/i.test(sql))
  check("the write is capped per site, device and day, so the table stays small", /limit p_cap/.test(sql) && /if v_seen >= p_cap then return false/.test(sql))
  check("the read runs as the asker, so the policy applies", /site_vitals_summary[\s\S]*security invoker/.test(sql) && /percentile_disc\(0\.75\)/.test(sql))
  check("the migration says the same thing", /create table if not exists public\.site_web_vitals/.test(read("supabase/migrations/20260925_site_vitals.sql")))
}

section("The page above the cover counts nothing")
{
  /* The bar above the cover was the site's numbers; the owner asked for the
     settings instead (app/app/website-builder/settings-strip.tsx), so the
     page no longer asks for them. The reading below is still what the
     performance route uses. */
  const page = code("app/app/website-builder/page.tsx")
  check("the Website page does not count visits or speed on every load", !/websitePerformanceFor/.test(page) && !/performance=/.test(page))
  const read_ = code("lib/website-builder/site-performance-read.ts")
  check("speed is read with the signed in user's client, so the policy decides", /user\.rpc\("site_vitals_summary"/.test(read_))
  check("only the website's views are read, and a page at a time", /\.not\("page_url", "ilike"/.test(read_) && /\.range\(a, b\)/.test(read_) && /CEILING/.test(read_))
}

// ── The More menu ───────────────────────────────────────────────────────
section("The More menu is an action list in groups")
{
  const g = groupsOf([
    { label: "Pages", section: "Website settings" },
    { label: "Domain" },
    { label: "Edit code", separatorBefore: true },
    { label: "Rename" },
    { label: "Take offline", separatorBefore: true, variant: "warning" },
  ])
  check("a titled group, a plain group, and the last one on its own", g.length === 3 && g[0].title === "Website settings" && g[0].items.length === 2 && g[2].items[0].label === "Take offline")
  const m = code("components/ui/responsive-action-menu.tsx")
  check("a popover on a computer, with a hairline between groups", /DropdownMenuPrimitive\.Separator className="h-px bg-\[#ebecef\]"/.test(m) && /data-action-list=""/.test(m))
  check("the shared sheet on a phone, with big rows", /<BottomSheet isOpen=\{sheetOpen\}/.test(m) && /min-h-\[52px\]/.test(m))
  check("destructive rows in red", /destructive: \{\s*row: "text-\[#c4290c\]/.test(m))
  const css = read("app/globals.css")
  check("150ms open and close, on transform and opacity only",
    /\.action-list\[data-state="open"\] \{ animation: action-list-in 150ms/.test(css) && /\.action-list\[data-state="closed"\] \{ animation: action-list-out 150ms/.test(css) &&
      !/@keyframes action-list-(in|out) \{[^}]*\b(height|width|top|left|margin)\b/.test(css))
  const client = code("app/app/website-builder/website-builder-client.tsx")
  const menu = client.slice(client.indexOf("const menuFor ="), client.indexOf("// Four themes"))
  check("destructive actions are the last group", /variant: "destructive", separatorBefore: true \}\)\s*\}\s*return items/.test(menu))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
