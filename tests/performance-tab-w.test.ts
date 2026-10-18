/**
 * ===========================================================================
 *  WEBSITE SETTINGS › PERFORMANCE, ROUND W
 * ===========================================================================
 *   the quick check   a storefront's HTML (tests/fixtures/quick-check) read
 *                     for what holds up the first paint, the images, the
 *                     fonts and the other services; what is inside scripts,
 *                     comments, noscript and template is not counted
 *   the run           against a fake network: five asks, the median, the
 *                     edge cache, the sizes by HEAD, and never a private
 *                     address asked
 *   which test        no key: the quick check, Google never called; a key
 *                     and Google's 429: the quick check, never the quota
 *                     line; a key and an answer: Google's; Google unable to
 *                     load the page: said as it is
 *   the controls      a row of choices moves with the arrow keys, Home and
 *                     End, and wraps
 *   a new period      the old figures stay, dimmed, until the new arrive; an
 *                     old answer arriving late is dropped; nothing empties
 *   the overall       the worst of the three, with or without INP
 *
 *   npx tsx tests/performance-tab-w.test.ts
 */

import { readFileSync } from "node:fs"
import { analyzeHtml, edgeOf, median, notLazyCount, quickFindings, runQuickCheck, safeToAsk, type QuickCheckResult, type QuickFetch } from "@/lib/website-builder/quick-check"
import { runLab, LAB_MESSAGES } from "@/lib/website-builder/lab-run"
import { isQuickCheck, labEvidence, type AnyLabResult } from "@/lib/website-builder/pagespeed"
import { initialLoad, loadReducer, loadView, segmentKey, PERF_SKELETON_AFTER_MS, type LoadState } from "@/lib/website-builder/perf-view"
import { overallRating, type MetricFigure, type PerfRating, type RumMetric } from "@/lib/website-builder/web-performance"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    const d = detail === undefined ? "" : typeof detail === "string" ? detail : JSON.stringify(detail)
    failures.push(name + (d ? ` (${d})` : ""))
    console.log(`  FAIL  ${name}${d ? `  (${d})` : ""}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const PAGE = "https://astrid.storelib.com/"
const HTML = read("tests/fixtures/quick-check/storefront.html")

/* A network that answers like a Storelib site behind Vercel's edge, and keeps a log. */
function fakeNet(opts: { status?: number; psi?: { status: number; body: unknown }; html?: string; sizes?: Record<string, number> } = {}) {
  let clock = 0
  const log: string[] = []
  const gaps = [400, 120, 110, 130, 115, 125]
  let pageAsks = 0
  const sizes: Record<string, number> = opts.sizes ?? {
    "https://astrid.storelib.com/_next/static/css/app-1a2b.css": 48_000,
    "https://astrid.storelib.com/_next/static/css/theme-3c4d.css": 22_000,
    "https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&display=swap": 1_200,
    "https://cdn.example-reviews.com/widget.js": 91_000,
    "https://astrid.storelib.com/_next/image?url=%2Fhero.jpg&w=1080&q=75": 820_000,
    "https://images.storelib.com/creators/astrid/shirt.jpg": 1_700_000,
    "https://images.storelib.com/creators/astrid/tote.jpg": 140_000,
  }
  const fetch: QuickFetch = async (url, init) => {
    const method = init.method ?? "GET"
    log.push(`${method} ${url}`)
    if (url.startsWith("https://www.googleapis.com/")) {
      clock += 900
      const p = opts.psi ?? { status: 500, body: {} }
      return new Response(JSON.stringify(p.body), { status: p.status, headers: { "content-type": "application/json" } })
    }
    if (method === "HEAD") {
      clock += 20
      const n = sizes[url]
      return new Response(null, { status: n ? 200 : 404, headers: n ? { "content-length": String(n) } : {} })
    }
    clock += gaps[pageAsks % gaps.length]
    pageAsks++
    const body = opts.html ?? HTML
    const res = new Response(body, {
      status: opts.status ?? 200,
      headers: { "content-type": "text/html", "content-encoding": "br", "x-vercel-cache": pageAsks === 1 ? "MISS" : "HIT", "cache-control": "public, max-age=0, must-revalidate" },
    })
    Object.defineProperty(res, "url", { value: url })
    return res
  }
  return { fetch, now: () => clock, log }
}

async function main() {
  // ── 1. Reading the HTML ──────────────────────────────────────────────
  console.log("\n1. A storefront's HTML, read for what it loads")
  {
    const f = analyzeHtml(HTML, PAGE, "mobile")
    check("render-blocking stylesheets: the two of the theme and Google Fonts; print and alternate ones are not", f.blockingStyles.length === 3 && f.blockingStyles.every((u) => !/print|dark/.test(u)), f.blockingStyles)
    check("render-blocking scripts: only the one without async, defer or type=module", f.blockingScripts.length === 1 && f.blockingScripts[0] === "https://cdn.example-reviews.com/widget.js", f.blockingScripts)
    check("a script at the end of the body does not block the first paint", !f.blockingScripts.some((u) => u.includes("late-in-body")))
    check("tags written inside scripts, comments, noscript and template are not counted", ![...f.blockingStyles, ...f.blockingScripts, ...f.images.map((i) => i.url ?? "")].some((u) => /inside-a-script|commented-out|noscript-pixel|template-image|not-a-real-image/.test(u)))
    check("eight images, in page order", f.images.length === 8, f.images.map((i) => i.url))
    check("an image sized by width and height, by position absolute (Next's fill) or by aspect-ratio counts as sized", f.images.filter((i) => !i.sized).length === 2 && f.images.filter((i) => !i.sized).every((i) => /shirt|pinimg/.test(i.url ?? "")))
    check("the srcset candidate a phone would take (1080w for 828)", f.images[1].url === "https://astrid.storelib.com/_next/image?url=%2Fhero.jpg&w=1080&q=75", f.images[1].url)
    check("and a computer's (1920w)", analyzeHtml(HTML, PAGE, "desktop").images[1].url?.includes("w=1920") === true)
    check("data-src is read when there is no src", f.images.some((i) => i.url === "https://astrid.storelib.com/lazy-by-script.jpg"))
    check("images below the first three without loading=lazy: four", notLazyCount(f.images) === 4, notLazyCount(f.images))
    check("the main image (fetchpriority=high) is never asked to be lazy", f.images[1].eager === true)
    check("font files: the preloaded one and the two in @font-face", f.fontFiles.length === 3 && f.fontFiles.includes("https://astrid.storelib.com/fonts/brand.woff"), f.fontFiles)
    check("fonts from another host: Google Fonts", f.fontHosts.length === 1 && f.fontHosts[0] === "fonts.googleapis.com", f.fontHosts)
    check(
      "other services: the five hosts the page loads from, not Storelib's own and not a preconnect",
      JSON.stringify(f.thirdPartyHosts) === JSON.stringify(["cdn.example-reviews.com", "fonts.googleapis.com", "i.pinimg.com", "www.googletagmanager.com", "www.youtube.com"]),
      f.thirdPartyHosts,
    )
    check("&amp; in an address is read as &", f.blockingStyles.includes("https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&display=swap"))
    check("an empty page is nothing, not an error", analyzeHtml("", PAGE).images.length === 0 && analyzeHtml("<html><body>", PAGE).blockingStyles.length === 0)
  }

  // ── 2. The edge, the median, private addresses ───────────────────────
  console.log("\n2. The edge cache, the median, and where the server never asks")
  {
    check("Vercel's HIT is cached, MISS is not", edgeOf(new Headers({ "x-vercel-cache": "HIT" })).cached === true && edgeOf(new Headers({ "x-vercel-cache": "MISS" })).cached === false)
    check("Cloudflare's header, and Age alone, are read too", edgeOf(new Headers({ "cf-cache-status": "HIT" })).cached === true && edgeOf(new Headers({ age: "42" })).cached === true)
    check("no header at all is unknown, not a miss", edgeOf(new Headers({})).cached === null)
    check("the median: odd and even counts", median([400, 120, 110, 130, 115]) === 120 && median([100, 300]) === 200 && median([]) === 0)
    for (const bad of ["http://169.254.169.254/latest/meta-data", "http://localhost:3000/x.jpg", "http://10.0.0.7/x.jpg", "https://db.internal/x", "https://[::1]/x", "https://shop.storelib.com:8443/x.jpg", "file:///etc/passwd", "https://user:pw@images.storelib.com/x.jpg"]) {
      check(`never asked: ${bad}`, safeToAsk(bad) === false)
    }
    check("an ordinary public file is asked", safeToAsk("https://images.storelib.com/creators/astrid/hero.jpg") && safeToAsk("http://cdn.example.com/a.js"))
  }

  // ── 3. The run ───────────────────────────────────────────────────────
  console.log("\n3. The quick check against a fake network")
  let quick: QuickCheckResult | null = null
  {
    const net = fakeNet()
    const run = await runQuickCheck(PAGE, "mobile", { fetch: net.fetch, now: net.now })
    quick = run.ok ? (run as { result: QuickCheckResult }).result : null
    const r = quick
    check("it ran", !!r, run)
    if (r) {
      check("five asks for the page, the median of their times (the cold first one does not decide it)", r.ttfb.samples.length === 5 && r.ttfb.median === 120, r.ttfb)
      check("the HTML's size and its compression", r.html.bytes === Buffer.byteLength(HTML) && r.html.encoding === "br", r.html)
      check("the edge as the last ask saw it: served from cache", r.edge.cached === true && r.edge.status === "HIT", r.edge)
      check("blocking files counted, and their size from HEAD", r.blocking.styles === 3 && r.blocking.scripts === 1 && r.blocking.bytes === 48_000 + 22_000 + 1_200 + 91_000, r.blocking)
      check("the heaviest images by HEAD, heaviest first", r.images.largest[0]?.bytes === 1_700_000 && r.images.largest[1]?.bytes === 820_000 && r.images.largest.length === 3, r.images.largest)
      check("images: count, unsized, not lazy", r.images.count === 8 && r.images.unsized === 2 && r.images.notLazy === 4, r.images)
      check("no score of any kind", !("score" in r) && !JSON.stringify(r).includes("score"))
      check("labelled as the quick check", r.source === "quick" && isQuickCheck(r as AnyLabResult))
      const kinds = r.findings.map((f) => f.kind)
      check("findings: the blocking script, the heavy image, the unsized images, the lazy ones, Google Fonts, four other services", ["blocking", "heavy-image", "unsized-images", "not-lazy", "font-host", "third-party"].every((k) => kinds.includes(k as never)), kinds)
      check("nothing said about a fast, cached, compressed server", !kinds.includes("slow-server") && !kinds.includes("not-cached") && !kinds.includes("not-compressed"))
      check("the worst first", r.findings[0]?.severity === "poor" && r.findings.every((f, i, a) => i === 0 || !(f.severity === "poor" && a[i - 1].severity !== "poor")))
      check("kept small", JSON.stringify(r).length < 4000, String(JSON.stringify(r).length))
      check("evidence for the tab's insights: the heavy image", labEvidence(r).lcp?.kind === "largest-file" && labEvidence(r).ttfb === undefined)
      const heads = net.log.filter((l) => l.startsWith("HEAD"))
      check("at most sixteen files asked for their size", heads.length <= 16, heads.length)
    }

    const slow = await runQuickCheck(PAGE, "desktop", {
      fetch: async (url, init) => {
        const res = new Response("<html><head></head><body>" + "x".repeat(30_000) + "</body></html>", { status: 200, headers: { "x-vercel-cache": "MISS" } })
        Object.defineProperty(res, "url", { value: url })
        void init
        return res
      },
      now: (() => {
        let t = 0
        return () => (t += 1000)
      })(),
    })
    const s = slow.ok ? (slow as { result: QuickCheckResult }).result : null
    check("a slow, uncached, uncompressed page says all three", !!s && ["slow-server", "not-cached", "not-compressed"].every((k) => s.findings.some((f) => f.kind === k)), s?.findings)

    const gone = await runQuickCheck(PAGE, "mobile", { fetch: fakeNet({ status: 500 }).fetch })
    check("a page that answers 500 is unreachable, not a result", gone.ok === false && (gone as { error: string }).error === "unreachable")
    const down = await runQuickCheck(PAGE, "mobile", { fetch: async () => { throw new Error("ECONNREFUSED") } })
    check("a site that does not answer is unreachable", down.ok === false && (down as { error: string }).error === "unreachable")

    const net2 = fakeNet({ html: `<html><head></head><body><img src="http://169.254.169.254/latest/meta-data/x.jpg"><img src="http://localhost/y.jpg"><img src="https://images.storelib.com/ok.jpg"></body></html>` })
    await runQuickCheck(PAGE, "mobile", { fetch: net2.fetch, now: net2.now })
    const asked = net2.log.filter((l) => l.startsWith("HEAD"))
    check("the HTML cannot send the server to a private address", asked.length === 1 && asked[0] === "HEAD https://images.storelib.com/ok.jpg", asked)
  }

  // ── 4. Which test runs ───────────────────────────────────────────────
  console.log("\n4. Which test runs")
  {
    const fixture = JSON.parse(read("tests/fixtures/pagespeed/v5-mobile-shape.json"))
    const quota = JSON.parse(read("tests/fixtures/pagespeed/v5-quota-429.json"))

    const a = fakeNet()
    const noKey = await runLab({ target: PAGE, strategy: "mobile", key: null, fetch: a.fetch, samples: 3 })
    check("no key: the quick check, and Google is never called", noKey.ok === true && isQuickCheck((noKey as { result: AnyLabResult }).result) && !a.log.some((l) => l.includes("pagespeedonline")) && (noKey as { fellBack: string }).fellBack === "no-key", a.log.slice(0, 2))

    const b = fakeNet({ psi: { status: 429, body: quota } })
    const q = await runLab({ target: PAGE, strategy: "mobile", key: "k", fetch: b.fetch, samples: 3 })
    check("a key and Google's 429: one call to Google, then the quick check", q.ok === true && isQuickCheck((q as { result: AnyLabResult }).result) && b.log.filter((l) => l.includes("pagespeedonline")).length === 1 && (q as { fellBack: string }).fellBack === "quota", b.log.slice(0, 2))
    check("  and the key went with it", b.log[0].includes("key=k"))

    const c = fakeNet({ psi: { status: 500, body: { error: { code: 500, message: "Internal error" } } } })
    const f500 = await runLab({ target: PAGE, strategy: "mobile", key: "k", fetch: c.fetch, samples: 3 })
    check("a key and Google failing: the quick check too", f500.ok === true && isQuickCheck((f500 as { result: AnyLabResult }).result))

    const d = fakeNet({ psi: { status: 200, body: fixture } })
    const ok = await runLab({ target: PAGE, strategy: "mobile", key: "k", fetch: d.fetch })
    const okr = (ok as { result: AnyLabResult }).result
    check("a key and an answer: Google's result, with its score, and the page is not fetched", ok.ok === true && !isQuickCheck(okr) && (okr as { score: number }).score === 58 && (okr as { source?: string }).source === "pagespeed" && d.log.length === 1)

    const e = fakeNet({ psi: { status: 200, body: { lighthouseResult: { audits: {}, runtimeError: { code: "FAILED_DOCUMENT_REQUEST" } } } } })
    const un = await runLab({ target: PAGE, strategy: "mobile", key: "k", fetch: e.fetch })
    check("Google unable to load the page: said as it is, no quick check", un.ok === false && (un as { error: string }).error === "unreachable" && e.log.length === 1)

    const sources = [code("lib/website-builder/lab-run.ts"), code("app/api/website-builder/themes/[installId]/performance/lab/route.ts"), code("components/website-builder/website-settings/performance.tsx")].join("\n")
    check("Google's quota line is nowhere: not a message, not a result", !/too many requests today/i.test(sources) && !Object.values(LAB_MESSAGES).some((m) => /google/i.test(m)))
    const route = code("app/api/website-builder/themes/[installId]/performance/lab/route.ts")
    check("the route runs runLab with the server-only key", /runLab\(\{ target, strategy, key: process\.env\.PAGESPEED_API_KEY \|\| null/.test(route))
    check("the route keeps the newest result per site and strategy, and hands it back inside the minute", /onConflict: "install_id,strategy"/.test(route) && /cached: true/.test(route) && /LAB_COOLDOWN_MS/.test(route))
    check("still rate limited per person and per site", /LIMITS\.siteLabTest/.test(route) && /`install:\$\{install\.id\}`/.test(route))
    check("only the site's own address is ever fetched", /siteOrigin\(creator\.id/.test(route) && !/body\.url/.test(route))
  }

  // ── 5. The controls ──────────────────────────────────────────────────
  console.log("\n5. A row of choices and the keys")
  {
    const r = ["24h", "7d", "30d", "90d"] as const
    check("right and down move on", segmentKey(r, "7d", "ArrowRight") === "30d" && segmentKey(r, "7d", "ArrowDown") === "30d")
    check("left and up move back", segmentKey(r, "7d", "ArrowLeft") === "24h" && segmentKey(r, "7d", "ArrowUp") === "24h")
    check("both ends wrap", segmentKey(r, "90d", "ArrowRight") === "24h" && segmentKey(r, "24h", "ArrowLeft") === "90d")
    check("Home and End", segmentKey(r, "30d", "Home") === "24h" && segmentKey(r, "7d", "End") === "90d")
    check("any other key is left to the browser (Tab leaves the row)", segmentKey(r, "7d", "Tab") === null && segmentKey(r, "7d", "a") === null && segmentKey([], "x", "ArrowRight") === null)
    const ui = code("components/website-builder/website-settings/performance.tsx")
    check("the switches are radio groups with one Tab stop", /role="radiogroup"/.test(ui) && /role="radio"/.test(ui) && /tabIndex=\{on \? 0 : -1\}/.test(ui) && /segmentKey\(options\.map/.test(ui))
    check("every choice the same width, the plate slides on transform", /repeat\(\$\{options\.length\}, minmax\(0, 1fr\)\)/.test(ui) && /translateX\(\$\{index \* 100\}%\)/.test(ui) && /transition-transform/.test(ui))
    check("the period is 24h, 7d, 30d, 90d and the device All, Mobile, Desktop", /const RANGES: PerfRange\[\] = \["24h", "7d", "30d", "90d"\]/.test(ui) && /tt\("All"\)/.test(ui))
    check("the figures are the chart's tabs, the arrow keys move between them", /role="tablist"/.test(ui) && /role="tab"/.test(ui) && /segmentKey\(order, metric, e\.key\)/.test(ui))
    check("the quick check is labelled as what it is", /Quick check from Storelib's server\. Not a full browser test\./.test(ui))
  }

  // ── 6. A new period ──────────────────────────────────────────────────
  console.log("\n6. A new period never empties the page")
  {
    type A = { range: string }
    let s: LoadState<A> = initialLoad<A>(null, "s|7d")
    check("the first visit, nothing kept: a placeholder", loadView(s).placeholder === true)
    s = loadReducer(s, { type: "ask", key: "s|7d", id: 1, cached: null })
    s = loadReducer(s, { type: "answer", key: "s|7d", id: 1, answer: { range: "7d" } })
    check("the answer is drawn", s.shown?.range === "7d" && !loadView(s).placeholder && !loadView(s).busy)
    s = loadReducer(s, { type: "ask", key: "s|30d", id: 2, cached: null })
    check("30 days asked: the 7 days stay on screen, dimmed, no placeholder", s.shown?.range === "7d" && loadView(s).dim && !loadView(s).placeholder)
    s = loadReducer(s, { type: "ask", key: "s|90d", id: 3, cached: null })
    s = loadReducer(s, { type: "answer", key: "s|30d", id: 2, answer: { range: "30d" } })
    check("30 days arriving after 90 were asked is dropped", s.shown?.range === "7d" && loadView(s).dim)
    s = loadReducer(s, { type: "answer", key: "s|90d", id: 3, answer: { range: "90d" } })
    check("90 days lands, sharp", s.shown?.range === "90d" && !loadView(s).dim && !loadView(s).busy)
    s = loadReducer(s, { type: "ask", key: "s|7d", id: 4, cached: { range: "7d" } })
    check("back to 7 days, kept from before: drawn at once, not dimmed, read again quietly", s.shown?.range === "7d" && !loadView(s).dim && loadView(s).busy)
    s = loadReducer(s, { type: "fail", id: 4, error: "Could not load visitor speed. Try again." })
    check("a failed read keeps the figures and says so", s.shown?.range === "7d" && s.error !== null && !loadView(s).busy)
    s = loadReducer(s, { type: "patch", answer: { range: "7d+lab" } })
    check("a lab test patched in place", s.shown?.range === "7d+lab")
    check("the placeholder waits 300 ms", PERF_SKELETON_AFTER_MS === 300)
    const ui = code("components/website-builder/website-settings/performance.tsx")
    check("the page uses that reducer, dims the body and runs the app's progress line", /useReducer\(loadReducer<Answer>/.test(ui) && /view\.dim && "opacity-50"/.test(ui) && /<LoadingLine active=\{view\.busy\} \/>/.test(ui))
    check("the placeholder is drawn only after the wait", /skeleton-reveal 260ms ease-out \$\{PERF_SKELETON_AFTER_MS\}ms forwards/.test(ui))
    const chart = code("components/website-builder/website-settings/performance-chart.tsx")
    check("the chart holds its height before it is measured, and its crosshair glides on transform", /height: H/.test(chart) && /useState\(0\)/.test(chart) && /translateX\(\$\{x\(active\)\}px\)/.test(chart))
  }

  // ── 7. The overall rating ────────────────────────────────────────────
  console.log("\n7. The Core Web Vitals as one rating")
  {
    const fig = (rating: PerfRating | null): MetricFigure => ({ p75: rating ? 1 : null, samples: rating ? 50 : 0, rating, bands: null, previous: null })
    const sum = (lcp: PerfRating | null, inp: PerfRating | null, cls: PerfRating | null) =>
      ({ metrics: { lcp: fig(lcp), inp: fig(inp), cls: fig(cls), fcp: fig(null), ttfb: fig(null), nav: fig(null) } as Record<RumMetric, MetricFigure> })
    check("all Good is Good", overallRating(sum("good", "good", "good")) === "good")
    check("the worst decides", overallRating(sum("good", "poor", "needs-improvement")) === "poor" && overallRating(sum("needs-improvement", "good", "good")) === "needs-improvement")
    check("without INP, LCP and CLS decide", overallRating(sum("good", null, "good")) === "good")
    check("without LCP or CLS there is no rating", overallRating(sum(null, "good", "good")) === null && overallRating(sum("good", "good", null)) === null)
  }

  // ── 8. Words ─────────────────────────────────────────────────────────
  console.log("\n8. The words")
  {
    const ui = read("components/website-builder/website-settings/performance.tsx")
    const strings = [...ui.matchAll(/tt\("([^"]+)"/g)].map((m) => m[1])
    check("no em dash in what the tab says", !strings.some((s) => s.includes("—")), strings.filter((s) => s.includes("—")))
    check("none of the words the owner banned", !strings.some((s) => /\b(unlock|elevate|seamless|powerful|effortless|supercharge|transform)/i.test(s)))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

void main()
