/**
 * Website settings › Performance on its own, for scripts/check-performance-tab.mjs:
 * the real Website Settings opened on that subject, with a fake fetch whose
 * answer the check picks with `?state=`:
 *
 *   ready        a week of visits made with the real rollup and report code
 *                (lib/website-builder/web-performance.ts) from synthetic page
 *                views: slow product pages on phones, Safari visitors, a lab
 *                test on file
 *   thin         19 page views: every figure is "Not enough visits yet"
 *   new          published an hour ago, no visits yet
 *   quiet        published long ago, no visits in the period
 *   unpublished  never published
 *   unavailable  part 210 not run
 *
 * Mobile has Google's test on file (tests/fixtures/pagespeed), desktop a quick check, and
 * Run test answers with a quick check, as the server does without a key.
 * `?first=` and `?delay=` hold the first and later answers that many ms.
 * The collector's own text is put on window.__beacon for the size check.
 */
import * as React from "react"
import { ProjectSettings } from "@/components/website-builder/project-settings"
import { SITE_VITALS_JS } from "@/lib/perf/site-vitals-inline"
import { buildReport, rollupEvents, windowFor, type RumEvent } from "@/lib/website-builder/web-performance"
import { labEvidence, parsePsi, type LabResult } from "@/lib/website-builder/pagespeed"
import { quickFindings, type QuickCheckResult } from "@/lib/website-builder/quick-check"
import type { PerfRange } from "@/lib/website-builder/web-performance"
import fixture from "../tests/fixtures/pagespeed/v5-mobile-shape.json"

declare global {
  interface Window {
    __calls?: string[]
    __beacon?: string
  }
}

let seed = 7
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
const ln = (m: number, s: number) => m * Math.exp(s * Math.sqrt(-2 * Math.log(Math.max(rnd(), 1e-9))) * Math.cos(2 * Math.PI * rnd()))

const NOW = Date.parse("2026-10-17T12:00:00Z")

function events(): RumEvent[] {
  const out: RumEvent[] = []
  const pages: Array<[string, string]> = [["/", "home"], ["/products/linen-shirt", "product"], ["/products/canvas-tote", "product"], ["/collections/summer", "collection"], ["/about", "page"], ["/cart", "cart"], ["/refund-policy", "policy"]]
  const countries = ["GB", "US", "DE", "FR", "NL", "SE"]
  for (let d = 0; d < 7; d++) {
    for (let i = 0; i < 120; i++) {
      const mobile = rnd() < 0.68
      const [path, type] = pages[Math.floor(rnd() * pages.length)]
      const safari = mobile && rnd() < 0.4
      const product = type === "product"
      out.push({
        at: new Date(NOW - d * 86_400_000 - Math.floor(rnd() * 40_000_000)).toISOString(),
        path,
        page_type: type,
        device: mobile ? "mobile" : "desktop",
        browser: safari ? "Safari" : rnd() < 0.15 ? "Edge" : "Chrome",
        country: countries[Math.floor(rnd() * countries.length)],
        lcp_ms: Math.round(Math.min(60_000, ln(mobile ? (product ? 3300 : 2300) : 1500, 0.4))),
        inp_ms: safari || rnd() < 0.3 ? null : Math.round(ln(mobile ? 170 : 90, 0.5)),
        cls: Math.round(Math.min(10, rnd() < 0.5 ? 0 : ln(0.05, 0.8)) * 1000) / 1000,
        fcp_ms: Math.round(ln(mobile ? 1600 : 900, 0.4)),
        ttfb_ms: Math.round(ln(mobile ? 520 : 320, 0.4)),
        nav_ms: null,
        weight: 1,
      })
    }
  }
  return out
}

/** What Storelib's quick check keeps, as the route would store it (lib/website-builder/quick-check.ts). */
function quickResult(strategy: "mobile" | "desktop"): QuickCheckResult {
  const base: Omit<QuickCheckResult, "findings"> = {
    source: "quick",
    strategy,
    url: "https://astrid.storelib.com/",
    fetchedAt: new Date(NOW - 1_800_000).toISOString(),
    status: 200,
    ttfb: { median: 182, samples: [412, 176, 182, 190, 171] },
    html: { bytes: 96_400, transferBytes: 18_900, encoding: "br" },
    edge: { cached: true, status: "HIT", cacheControl: "public, max-age=0, must-revalidate" },
    blocking: { styles: 3, scripts: 1, bytes: 162_200, files: [] },
    images: { count: 14, unsized: 2, notLazy: 4, largest: [{ url: "https://images.storelib.com/creators/astrid/hero-summer.jpg", bytes: 1_240_000 }] },
    fonts: { files: 3, hosts: ["fonts.googleapis.com"] },
    thirdParty: ["cdn.example-reviews.com", "fonts.googleapis.com", "i.pinimg.com", "www.googletagmanager.com", "www.youtube.com"],
  }
  return { ...base, findings: quickFindings(base) }
}

function readyAnswer(thin = false, range: PerfRange = "7d") {
  const all = events()
  /* Each period a little different, so switching really changes every figure on screen. */
  const k = range === "24h" ? 0.9 : range === "30d" ? 1.15 : range === "90d" ? 1.3 : 1
  const list = (thin ? all.slice(0, 19) : all).map((e) => ({ ...e, lcp_ms: e.lcp_ms === null ? null : Math.round(e.lcp_ms * k), inp_ms: e.inp_ms === null ? null : Math.round(e.inp_ms * k), cls: e.cls === null ? null : Math.round(e.cls * k * 1000) / 1000, ttfb_ms: e.ttfb_ms === null ? null : Math.round(e.ttfb_ms * k) }))
  const w = windowFor(range, NOW)
  const points =
    w.grain === "hour"
      ? Array.from({ length: 24 }, (_, h) => {
          const from = w.start + h * 3_600_000
          return { t: new Date(from).toISOString(), rows: rollupEvents(list.filter((e) => Date.parse(e.at) >= from && Date.parse(e.at) < from + 3_600_000), ["all"]) }
        })
      : w.days.map((d) => ({ t: `${d}T00:00:00.000Z`, rows: rollupEvents(list.filter((e) => e.at.startsWith(d)), ["all"]) }))
  /* The previous week: a little faster on phones, so the deltas have something to say. */
  const previous = rollupEvents(list.map((e) => ({ ...e, lcp_ms: e.lcp_ms === null ? null : Math.round(e.lcp_ms * 0.82) })), ["all"])
  const lab = parsePsi(fixture)
  const result = (lab as { result: LabResult }).result
  const report = buildReport({
    range,
    now: NOW,
    current: rollupEvents(w.grain === "hour" ? list.filter((e) => Date.parse(e.at) >= w.start) : list),
    previous,
    points,
    lastViewAt: new Date(NOW - 120_000).toISOString(),
    evidence: { mobile: labEvidence(result) },
  })
  return {
    available: true,
    live: true,
    report,
    lab: { mobile: thin ? null : { strategy: "mobile", url: "https://astrid.storelib.com/", ranAt: new Date(NOW - 3_600_000).toISOString(), result }, desktop: thin ? null : { strategy: "desktop", url: "https://astrid.storelib.com/", ranAt: new Date(NOW - 1_800_000).toISOString(), result: quickResult("desktop") } },
  }
}

function emptyAnswer(live: boolean) {
  return { available: true, live, report: buildReport({ range: "7d", now: NOW, current: [], previous: [], points: windowFor("7d", NOW).days.map((d) => ({ t: `${d}T00:00:00.000Z`, rows: [] })), lastViewAt: null }), lab: { mobile: null, desktop: null } }
}

function stubFetch(state: string, q: URLSearchParams) {
  window.__calls = []
  const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    window.__calls?.push(`${method} ${url}`)
    if (url.includes("/performance/lab") && method === "POST") {
      /* No key on the server, as today: the quick check answers. */
      const strategy = JSON.parse(String(init?.body ?? "{}")).strategy === "desktop" ? "desktop" : "mobile"
      const result = quickResult(strategy)
      return new Promise((r) => setTimeout(() => r(new Response(JSON.stringify({ lab: { strategy, url: "https://astrid.storelib.com/", ranAt: new Date().toISOString(), result }, kept: true }), { status: 200 })), 300))
    }
    if (url.includes("/performance")) {
      const range = (new URL(url, location.origin).searchParams.get("range") ?? "7d") as PerfRange
      /* `?first=` holds the first answer that long, `?delay=` every one after it. */
      const asks = (window.__calls ?? []).filter((c) => c.startsWith("GET") && c.includes("/performance?")).length
      const wait = asks <= 1 ? Number(q.get("first") ?? 0) : Number(q.get("delay") ?? 0)
      const later = (body: unknown) => (wait > 0 ? new Promise<Response>((r) => setTimeout(() => r(new Response(JSON.stringify(body), { status: 200 })), wait)) : json(body))
      if (state === "unavailable") return later({ available: false, live: true })
      if (state === "thin") return later(readyAnswer(true, range))
      if (state === "new" || state === "quiet") return later(emptyAnswer(true))
      if (state === "unpublished") return later(emptyAnswer(false))
      return later(readyAnswer(false, range))
    }
    return json({})
  }) as typeof fetch
}

export function boot(mount: (el: React.ReactElement) => void) {
  const q = new URLSearchParams(location.search)
  const state = q.get("state") || "ready"
  window.__beacon = SITE_VITALS_JS
  stubFetch(state, q)
  const publishedAt = state === "new" ? new Date(Date.now() - 3_600_000).toISOString() : state === "unpublished" ? null : "2026-08-02T10:00:00Z"
  mount(
    <ProjectSettings
      open
      onClose={() => {}}
      installId="install-1"
      name="Astrid Studio"
      onRenamed={() => {}}
      websiteUrl="https://astrid.storelib.com"
      websiteUrlDisplay="astrid.storelib.com"
      live={state !== "unpublished"}
      publishedAt={publishedAt}
      initialSection="performance"
      pages={[
        { key: "home", name: "Home", path: "/" },
        { key: "about", name: "About", path: "/about" },
        { key: "contact", name: "Contact", path: "/contact" },
      ]}
    />,
  )
}
