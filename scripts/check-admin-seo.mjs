/**
 * ===========================================================================
 *  /admin/seo, RENDERED AND MEASURED
 * ===========================================================================
 * The real client component (app/(storelib)/admin/seo/seo-admin.tsx) with stubbed
 * console data, in headless Chromium, with the app's own stylesheet
 * (scripts/probe-css.mjs). Two scenarios:
 *
 *   NOT CONNECTED   no service account: the setup steps are on the page,
 *                   and the figures, the kinds and the rows are still there
 *   CONNECTED       a row on Google, one not, one outside Storelib's
 *                   Search Console; a row opens its thirteen checks, and
 *                   Check now posts to /api/admin/seo/check and shows the
 *                   answer
 *
 * Round 45 adds Search performance, Indexing issues, Sitemap conflicts,
 * Crawlability (and its Check crawlability button) and Bing: each is on
 * the page, every figure names where it came from, and "On Google" appears
 * only in what Google answered.
 *
 * At 1440 and 390: nothing sideways, no control off the edge, the wide
 * table header only on a desk. Pictures go to SHOTS_DIR or a temp folder.
 *
 *   node scripts/check-admin-seo.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const stubs = join(root, ".admin-seo-probe")
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-admin-seo-")), "shots")
mkdirSync(stubs, { recursive: true })
mkdirSync(shots, { recursive: true })
const URL_BASE = "https://storelib.com/__admin_seo_probe"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const checks = (score) => [
  ["http", "Answers 200", "pass", "HTTP 200", 15],
  ["indexable", "No noindex", "pass", "Indexable", 15],
  ["canonical", "Canonical is this address", "pass", "Self canonical", 10],
  ["title", "Title, 10 to 70 characters", "pass", "33 characters: Notion planner by Maya | Storelib", 8],
  ["description", "Description, 50 to 170 characters", score < 90 ? "fail" : "pass", score < 90 ? "No description" : "102 characters", 8],
  ["h1", "Exactly one h1", "pass", "1 h1", 6],
  ["ogTitle", "Open Graph title", "pass", "Notion planner", 4],
  ["ogImage", "Open Graph image", "pass", "https://storelib.com/media/p/1.jpg", 4],
  ["structuredData", "Structured data that parses", "pass", "Product", 8],
  ["imageAlt", "Images have alt text", score < 90 ? "fail" : "pass", score < 90 ? "2 of 6 without alt" : "6 images", 5],
  ["sitemap", "In the sitemap", "pass", "Listed", 6],
  ["robots", "Allowed by robots.txt", "pass", "Allowed", 6],
  ["google", "Indexed on Google", "skip", "Not checked with Google", 5],
].map(([id, label, state, found, points]) => ({ id, label, state, found, points }))

const base = {
  source: "products-0", in_sitemap: true, first_seen_at: "2026-10-01T00:00:00Z", last_seen_at: "2026-10-29T08:00:00Z", left_sitemap_at: null,
  verdict: null, coverage_state: null, indexing_state: null, robots_txt_state: null, page_fetch_state: null, last_crawl_time: null,
  google_canonical: null, user_canonical: null, inspection_link: null, inspect_error: null, inspected_at: null, http_status: 200, score_error: null, scored_at: "2026-10-29T07:40:00Z",
}
const rows = [
  { ...base, url: "https://storelib.com/maya/notion-planner-for-weekly-reviews-habits-and-goals", kind: "product", property: "sc-domain:storelib.com", google_status: "indexed", verdict: "PASS", coverage_state: "Submitted and indexed", indexing_state: "INDEXING_ALLOWED", robots_txt_state: "ALLOWED", page_fetch_state: "SUCCESSFUL", last_crawl_time: "2026-10-27T14:03:11Z", google_canonical: "https://storelib.com/maya/notion-planner-for-weekly-reviews-habits-and-goals", user_canonical: "https://storelib.com/maya/notion-planner-for-weekly-reviews-habits-and-goals", inspection_link: "https://search.google.com/search-console/inspect?id=x", inspected_at: "2026-10-29T06:00:00Z", score: 100, checks: checks(100) },
  { ...base, url: "https://storelib.me/maya", kind: "onepage", source: "onepages-0", property: "sc-domain:storelib.me", google_status: "not_indexed", verdict: "NEUTRAL", coverage_state: "Crawled - currently not indexed", last_crawl_time: "2026-10-20T08:41:52Z", google_canonical: "https://storelib.me/maya", user_canonical: "https://storelib.me/maya/", inspected_at: "2026-10-28T06:00:00Z", score: 74, checks: checks(74) },
  { ...base, url: "https://www.mayamakes.com/about", kind: "website", source: "site:maya", property: null, google_status: "no_property", score: 88, checks: checks(88) },
  { ...base, url: "https://storelib.com/blog/how-to-start-selling-digital-products-2026", kind: "blog", source: "pages", property: "sc-domain:storelib.com", google_status: null, score: null, checks: null, scored_at: null, http_status: null },
]
const totals = [
  { kind: "blog", listed: 412, in_sitemap: 410, answers_200: 408, indexed: 371, not_indexed: 22, not_checked: 17, no_property: 0, scored: 410, average_score: 91.2 },
  { kind: "onepage", listed: 48211, in_sitemap: 47090, answers_200: 46988, indexed: 20114, not_indexed: 9120, not_checked: 17856, no_property: 0, scored: 30111, average_score: 78.4 },
  { kind: "product", listed: 183402, in_sitemap: 180331, answers_200: 179950, indexed: 96310, not_indexed: 30442, not_checked: 53579, no_property: 0, scored: 60021, average_score: 84.9 },
  { kind: "website", listed: 9020, in_sitemap: 9002, answers_200: 8890, indexed: 4011, not_indexed: 1802, not_checked: 1100, no_property: 2089, scored: 6110, average_score: 81.7 },
]
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString()
const verdicts = (blocked) => ["Googlebot", "Bingbot", "OAI-SearchBot"].map((crawler) => ({ crawler, allowed: !blocked, rule: blocked ? "Disallow: /app/" : "Allow: /", group: "*" }))
const crawl = {
  missingTable: false,
  robots: { checkedAt: ago(20), report: { url: "https://storelib.com/robots.txt", status: 200, reading: "parsed", ms: 112, sitemaps: ["https://storelib.com/sitemap.xml"], notes: [], paths: [
    { label: "Home", path: "/", verdicts: verdicts(false) },
    { label: "Pricing", path: "/pricing", verdicts: verdicts(false) },
    { label: "Blog", path: "/blog", verdicts: verdicts(false) },
    { label: "A product", path: "/maya/notion-planner-for-weekly-reviews-habits-and-goals", verdicts: verdicts(false) },
    { label: "A creator page", path: "/maya", verdicts: verdicts(false) },
  ] } },
  sitemaps: { checkedAt: ago(20), report: { skipped: 0, indexes: [{ url: "https://storelib.com/sitemap.xml", status: 200, files: 5, error: null }, { url: "https://storelib.me/sitemap.xml", status: 200, files: 1, error: null }], files: [
    { url: "https://storelib.com/sitemap/pages.xml", index: "https://storelib.com/sitemap.xml", status: 200, ms: 338, urls: 214, invalidCount: 0, invalid: [], error: null },
    { url: "https://storelib.com/sitemap/products-0-of-1.xml", index: "https://storelib.com/sitemap.xml", status: 200, ms: 512, urls: 18233, invalidCount: 2, invalid: [{ loc: "https://storelib.com/maya/planner", reason: "Listed twice" }, { loc: "https://storelib.com/x", reason: 'lastmod "yesterday" is not a W3C date' }], error: null },
    { url: "https://storelib.com/sitemap/creators-0-of-1.xml", index: "https://storelib.com/sitemap.xml", status: 503, ms: 10021, urls: null, invalidCount: 0, invalid: [], error: "HTTP 503" },
    { url: "https://storelib.me/sitemap/onepages-0-of-1.xml", index: "https://storelib.me/sitemap.xml", status: 200, ms: 290, urls: 4112, invalidCount: 0, invalid: [], error: null },
  ] } },
}
const conflicts = [
  { kind: "not_200", label: "Does not answer 200", count: 14, sample: [{ url: "https://storelib.com/maya/old-planner", kind: "not_200", found: "HTTP 404", scoredAt: ago(35) }] },
  { kind: "noindex", label: "Says noindex", count: 3, sample: [{ url: "https://storelib.com/drafty", kind: "noindex", found: "robots meta: noindex", scoredAt: ago(50) }] },
  { kind: "canonical", label: "Canonical is not this address", count: 0, sample: [] },
]
const coverageGroups = [
  { googleStatus: "indexed", coverageState: "Submitted and indexed", addresses: 120435, newestAnswer: ago(120) },
  { googleStatus: "not_indexed", coverageState: "Crawled - currently not indexed", addresses: 30112, newestAnswer: ago(130) },
  { googleStatus: "not_indexed", coverageState: "Discovered - currently not indexed", addresses: 9254, newestAnswer: ago(140) },
  { googleStatus: "not_indexed", coverageState: "Duplicate, Google chose different canonical than user", addresses: 1220, newestAnswer: ago(300) },
]
const searchRows = (keys) => keys.map((key, i) => ({ key, clicks: 900 - i * 120, impressions: 21000 - i * 2500, ctr: (900 - i * 120) / (21000 - i * 2500), position: 4.2 + i * 1.7 }))
const search = [{ property: "sc-domain:storelib.com", startDate: "2026-10-02", endDate: "2026-10-29", readAt: ago(15), error: null,
  totals: { clicks: 4210, impressions: 188020, ctr: 0.0224, position: 11.8 },
  pages: searchRows(["https://storelib.com/", "https://storelib.com/pricing", "https://storelib.com/blog/how-to-sell-digital-products", "https://storelib.com/maya/notion-planner-for-weekly-reviews-habits-and-goals"]),
  queries: searchRows(["storelib", "sell digital products", "gumroad alternative", "notion planner"]) },
  { property: "sc-domain:storelib.me", startDate: "2026-10-02", endDate: "2026-10-29", readAt: ago(15), error: "The service account is not a user on sc-domain:storelib.me in Search Console.", totals: null, pages: [], queries: [] }]
const data = (connected) => ({
  schemaReady: true,
  google: { connected, clientEmail: connected ? "storelib-seo@storelib-prod.iam.gserviceaccount.com" : null, properties: ["sc-domain:storelib.com", "sc-domain:storelib.me"], perDay: 2000, reserve: 200, usedToday: connected ? { "sc-domain:storelib.com": 742, "sc-domain:storelib.me": 690 } : {} },
  totals,
  list: { rows, total: 236833, page: 1, pages: 4737 },
  sync: { files: Array.from({ length: 44 }, (_, i) => `products-${i}`), next_file: 17, sweep_started_at: "2026-10-29T05:00:00Z", sweep_finished_at: "2026-10-28T20:10:00Z", last_run_at: "2026-10-29T08:00:00Z", last_error: null },
  query: { kind: "all", status: "all", q: "", page: 1 },
  problems: [],
  readAt: new Date(Date.now() - 60_000).toISOString(),
  newest: { google: connected ? new Date(Date.now() - 2 * 3600_000).toISOString() : null, scored: new Date(Date.now() - 20 * 60_000).toISOString() },
  crawl,
  conflicts,
  coverage: { basis: "database", groups: connected ? coverageGroups : [] },
  search: connected ? search : null,
  bing: { connected, stats: connected ? { siteUrl: "https://storelib.com/", days: 28, clicks: 1203, impressions: 88412, from: "2026-10-03", to: "2026-10-30", readAt: new Date(Date.now() - 40 * 60_000).toISOString(), error: null } : null },
  verification: { google: connected, bing: false },
})

try {
  writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/admin/seo"
const router = { push: (h) => { (window.__pushed ||= []).push(h) }, replace: () => {}, refresh: () => { window.__refreshed = (window.__refreshed || 0) + 1 }, prefetch: () => {}, back: () => {} }
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams("")
`)
  writeFileSync(join(stubs, "entry.tsx"), `import React from "react"
import { createRoot } from "react-dom/client"
import { SeoAdmin } from "@/app/(storelib)/admin/seo/seo-admin"
createRoot(document.getElementById("app")!).render(<SeoAdmin data={(window as any).__data} />)
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(stubs, "entry.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": root, "next/navigation": join(stubs, "navigation.js") },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const css = await appCss(root)
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style><style>body{margin:0}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
  const open = async (viewport, connected) => {
    const p = await browser.newPage()
    await p.setViewport(viewport)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      if (r.url().startsWith(URL_BASE)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (r.url().endsWith("/api/admin/seo/crawl")) return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ...crawl, robots: { ...crawl.robots, checkedAt: new Date().toISOString() } }) })
      if (r.url().endsWith("/api/admin/seo/check")) {
        const asked = JSON.parse(r.postData() || "{}").url
        const row = rows.find((x) => x.url === asked)
        return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ row: { ...row, scored_at: new Date().toISOString(), inspected_at: new Date().toISOString() }, notes: connected ? [] : ["Google Search Console is not connected, so Google was not asked."] }) })
      }
      return r.respond({ status: 404, body: "" })
    })
    await p.evaluateOnNewDocument((d) => {
      window.__data = d
    }, data(connected))
    await p.goto(URL_BASE, { waitUntil: "load" })
    await sleep(250)
    return { p, errors }
  }
  const layout = (p) =>
    p.evaluate(() => {
      const visible = (el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"
      }
      const controls = [...document.querySelectorAll("a, button, input, select")].filter(visible)
      const header = document.querySelector('[role="table"][aria-label="Addresses"] [role="columnheader"]')
      return {
        sideways: document.documentElement.scrollWidth - innerWidth,
        /* The status tabs scroll sideways inside their own row, as everywhere in the console. */
        out: controls.filter((el) => { const r = el.getBoundingClientRect(); return (r.left < -0.5 || r.right > innerWidth + 0.5) && !el.closest('[role="tablist"]') }).map((el) => el.textContent.trim().slice(0, 24)),
        h1: document.querySelector("h1")?.textContent,
        figures: [...document.querySelectorAll("[data-figure]")].filter((f) => !f.closest("[data-search-performance], [data-bing]")).map((f) => f.getAttribute("data-figure")),
        rows: document.querySelectorAll('[role="table"][aria-label="Addresses"] [data-row]').length,
        kinds: document.querySelectorAll('[role="table"][aria-label="Totals by kind"] [data-row]').length,
        setup: !!document.querySelector("[data-gsc-setup]"),
        wideHeader: !!header && visible(header),
        googleWords: [...document.querySelectorAll('[role="table"][aria-label="Addresses"] [data-row]')].map((r) => r.querySelector('[role="cell"]:nth-child(4)')?.textContent.trim()),
        sync: document.querySelector("[data-sync]")?.textContent.trim(),
      }
    })

  for (const [name, viewport] of [["desk 1440", { width: 1440, height: 900 }], ["phone 390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
    for (const connected of [false, true]) {
      console.log(`\n${name}, ${connected ? "connected" : "not connected"}`)
      const { p, errors } = await open(viewport, connected)
      const l = await layout(p)
      expect(l.h1 === "SEO status", "the heading", l.h1)
      expect(l.sideways <= 0, "nothing sideways", l.sideways)
      expect(l.out.length === 0, "no control off the edge", l.out)
      expect(l.figures.join("|") === "In sitemap|Answers 200|Average score|On Google|Not on Google|Not checked", "six figures in one panel", l.figures)
      expect(l.kinds === 4 && l.rows === 4, "four kinds, four rows", { kinds: l.kinds, rows: l.rows })
      expect(l.setup === !connected, connected ? "no setup steps once connected" : "the setup steps when not connected", l.setup)
      expect(l.wideHeader === viewport.width >= 1024, "the table header on a desk only", l.wideHeader)
      if (viewport.width >= 1024) expect(JSON.stringify(l.googleWords) === JSON.stringify(["On Google", "Crawled - currently not indexed", "Not in Storelib's Search Console", "Not checked"]), "Google's words, as Google said them", l.googleWords)
      await p.screenshot({ path: join(shots, `seo-${viewport.width}-${connected ? "connected" : "not-connected"}.png`), fullPage: true })

      /* A row opens its checks, and Check now asks again. */
      await p.evaluate(() => document.querySelectorAll('[role="table"][aria-label="Addresses"] [data-row]')[1].click())
      await sleep(200)
      const sheet = await p.evaluate(() => {
        const d = document.querySelector("[data-row-sheet]")
        const r = d?.getBoundingClientRect()
        return { open: !!d?.open, checks: d?.querySelectorAll("[data-check]").length ?? 0, fails: d?.querySelectorAll('[data-check][data-state="fail"]').length ?? 0, width: r ? Math.round(r.width) : 0, inside: r ? r.left >= -0.5 && r.right <= innerWidth + 0.5 : false }
      })
      expect(sheet.open && sheet.checks === 13, "a row opens its thirteen checks", sheet)
      expect(sheet.fails === 2, "  with the two that failed marked", sheet.fails)
      expect(sheet.inside, "  inside the screen", sheet.width)
      await p.screenshot({ path: join(shots, `seo-${viewport.width}-${connected ? "connected" : "not-connected"}-checks.png`) })
      await p.evaluate(() => document.querySelector("[data-check-now]").click())
      await sleep(300)
      const after = await p.evaluate(() => ({ notes: [...document.querySelectorAll('[data-row-sheet] [role="status"]')].map((n) => n.textContent), refreshed: window.__refreshed || 0, button: document.querySelector("[data-check-now]")?.textContent }))
      expect(after.refreshed >= 1 && after.button === "Check now", "Check now answers and the figures are read again", after)
      if (!connected) expect(after.notes.includes("Google Search Console is not connected, so Google was not asked."), "  and says Google was not asked", after.notes)
      const r45 = await p.evaluate(() => ({
        crawl: !!document.querySelector("[data-crawl] [data-robots]") && document.querySelectorAll("[data-sitemap-files] [data-row]").length,
        conflicts: document.querySelectorAll("[data-conflict]").length,
        coverage: document.querySelectorAll("[data-coverage] [data-row]").length,
        search: !!document.querySelector("[data-search-performance]"),
        aiNote: !!document.querySelector("[data-ai-overviews-note]"),
        bing: document.querySelector("[data-bing]")?.getAttribute("data-bing"),
        sources: [...document.querySelectorAll("[data-figure]")].filter((f) => !f.querySelector("[data-source]")).map((f) => f.getAttribute("data-figure")),
      }))
      expect(r45.crawl === 4, "crawlability: robots.txt verdicts and four sitemap files", r45.crawl)
      expect(r45.conflicts === 3, "three kinds of sitemap conflict", r45.conflicts)
      expect(r45.coverage === (connected ? 4 : 0), "coverage groups only from Google's answers", r45.coverage)
      expect(r45.search === connected, "search performance only when connected", r45.search)
      expect(r45.aiNote, "the AI Overviews and AI Mode note", r45.aiNote)
      expect(r45.bing === (connected ? "connected" : "not_connected"), "Bing's state", r45.bing)
      expect(r45.sources.length === 0, "every figure names its source", r45.sources)
      await p.evaluate(() => document.querySelector("[data-crawl-check]").click())
      await sleep(300)
      expect(await p.evaluate(() => /just now/.test(document.querySelector("[data-crawl]")?.textContent || "")), "Check crawlability shows the new report", null)
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }
  }
  await browser.close()
  console.log(`\npictures in ${shots}`)
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
