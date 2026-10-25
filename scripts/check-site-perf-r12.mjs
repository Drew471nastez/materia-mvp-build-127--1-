/**
 * ===========================================================================
 *  A PUBLISHED WEBSITE'S LOAD AND NAVIGATION BUDGET (round 12)
 * ===========================================================================
 * Opens each published website as a visitor does, in a real Chromium, and
 * measures what the visitor waits for:
 *
 *   first load   TTFB, FCP, LCP, CLS, blocking time, script and total bytes
 *   navigation   a tap on a link to another page of the same site, from the
 *                tap to the new page's main content drawn (and the address
 *                changed), the way SiteLinks opens it in place
 *   back         Back to the first page: restored from the back/forward
 *                cache or redrawn, and how long it took
 *
 * The budget is the owner's: a page drawn (LCP) under 2 s and a navigation
 * under 1 s. A site over budget fails the run (exit 1).
 *
 *   node scripts/check-site-perf-r12.mjs                       every site in storelib.com/sitemap/websites-0.xml
 *   SITES=https://trp8.storelib.com,https://calvin.storelib.com node scripts/check-site-perf-r12.mjs
 *   BASE=http://127.0.0.1:3000 SITE_HOSTS=trp8.storelib.com node scripts/check-site-perf-r12.mjs
 *       a production build (`next start`) with real env: each host is mapped to BASE, so proxy.ts routes it as
 *       the live site, the same address a visitor types
 *
 *   PROFILE=mobile (default: 390x844, touch, CPU 4x slower, fast 4G) or PROFILE=desktop (1440x900, no throttling)
 *   RUNS=3          median of this many cold loads per site
 *   JSON=out.json   write every sample
 *   NO_BUDGET=1     report only
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, writeFileSync } from "node:fs"
import puppeteer from "puppeteer-core"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const PROFILE = process.env.PROFILE === "desktop" ? "desktop" : "mobile"
const RUNS = Math.max(1, Number(process.env.RUNS ?? 3))
export const BUDGET = { lcp: 2000, nav: 1000, cls: 0.1 }

function reachabilityFlags() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy
  if (!proxy || process.env.BASE) return []
  const flags = [`--proxy-server=${proxy}`]
  for (const ca of ["/root/.ccr/agent-proxy-ca.crt", "/root/.ccr/ca-bundle.crt"]) {
    if (!existsSync(ca)) continue
    try {
      const pem = execFileSync("openssl", ["x509", "-in", ca, "-pubkey", "-noout"], { encoding: "buffer" })
      const spki = createHash("sha256").update(execFileSync("openssl", ["pkey", "-pubin", "-outform", "der"], { input: pem })).digest("base64")
      flags.push(`--ignore-certificate-errors-spki-list=${spki}`)
      break
    } catch { /* next */ }
  }
  return flags
}

async function siteList() {
  if (process.env.SITE_HOSTS) return process.env.SITE_HOSTS.split(",").map((h) => `http://${h.trim()}`)
  if (process.env.SITES) return process.env.SITES.split(",").map((s) => s.trim().replace(/\/$/, ""))
  const xml = await (await fetch("https://storelib.com/sitemap/websites-0.xml")).text()
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/\/$/, ""))
}

/** Map every host to BASE when measuring a local production build. */
function hostRules() {
  if (!process.env.BASE) return []
  const base = new URL(process.env.BASE)
  return [`--host-resolver-rules=MAP * ${base.hostname}:${base.port || 80}, EXCLUDE localhost`]
}

const median = (xs) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : NaN
}

const OBSERVE = () => {
  window.__perf = { lcp: 0, cls: 0, tbt: 0, lcpEl: "", shifts: [] }
  /* Back to a page the browser kept whole (the back/forward cache). */
  addEventListener("pageshow", (e) => { if (e.persisted) window.__restored = (window.__restored || 0) + 1 })
  const name = (n) => (n && n.nodeName ? `${n.nodeName.toLowerCase()}${n.id ? `#${n.id}` : ""}${typeof n.className === "string" && n.className ? `.${n.className.trim().split(/\s+/).slice(0, 2).join(".")}` : ""}` : "?")
  new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__perf.lcp = e.startTime; window.__perf.lcpEl = name(e.element) + (e.url ? ` ${e.url.slice(0, 80)}` : "") } }).observe({ type: "largest-contentful-paint", buffered: true })
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (e.hadRecentInput) continue
      window.__perf.cls += e.value
      /* Which elements moved, for the JSON: the cause of a shift is the first thing to fix. */
      if (e.value > 0.01) window.__perf.shifts.push({ at: Math.round(e.startTime), value: Number(e.value.toFixed(3)), moved: e.sources.map((s) => `${name(s.node)} ${Math.round(s.previousRect.y)},${Math.round(s.previousRect.height)} -> ${Math.round(s.currentRect.y)},${Math.round(s.currentRect.height)}`) })
    }
  }).observe({ type: "layout-shift", buffered: true })
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.tbt += Math.max(0, e.duration - 50) }).observe({ type: "longtask", buffered: true })
}

async function emulate(page) {
  const cdp = await page.createCDPSession()
  if (PROFILE === "mobile") {
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
    await page.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    /* "Fast 4G": 9 Mbps down, 1.5 up, 60 ms. */
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 60, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 })
  } else {
    await page.setViewport({ width: 1440, height: 900 })
  }
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: false })
  return cdp
}

async function loadOnce(browser, url) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  const cdp = await emulate(page)
  await page.evaluateOnNewDocument(OBSERVE)
  const bytes = { script: 0, total: 0, requests: 0, document: 0 }
  const types = new Map()
  cdp.on("Network.responseReceived", (e) => types.set(e.requestId, { type: e.type, url: e.response.url, cache: e.response.headers["x-vercel-cache"] ?? e.response.headers["X-Vercel-Cache"] }))
  cdp.on("Network.loadingFinished", (e) => {
    const t = types.get(e.requestId)
    bytes.total += e.encodedDataLength
    bytes.requests++
    if (t?.type === "Script") bytes.script += e.encodedDataLength
    if (t?.type === "Document") bytes.document += e.encodedDataLength
  })
  await cdp.send("Network.enable")
  const res = await page.goto(url, { waitUntil: "load", timeout: 60_000 })
  await new Promise((r) => setTimeout(r, 1500))
  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0]
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]
    return { ttfb: nav.responseStart, fcp: fcp?.startTime ?? NaN, load: nav.loadEventEnd, ...window.__perf }
  })
  return { ctx, page, cdp, sample: { ...m, ...bytes, status: res?.status(), cache: res?.headers()["x-vercel-cache"] ?? "-" } }
}

/** A link to another page of this site that the site itself draws (header, product card). */
async function pickLink(page) {
  return page.evaluate(() => {
    const here = location.href.split("#")[0]
    const links = [...document.querySelectorAll("a[href]")].filter((a) => {
      const u = new URL(a.href, location.href)
      const r = a.getBoundingClientRect()
      return u.origin === location.origin && u.href.split("#")[0] !== here && !/\/(checkout|cart|account|api)\b/.test(u.pathname) && r.width > 0 && r.height > 0 && !a.target
    })
    /* Only a link a finger can reach: on screen once scrolled to, and not under a banner or a closed menu. */
    const reachable = (a) => {
      a.scrollIntoView({ block: "center" })
      const r = a.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return !!hit && (hit === a || a.contains(hit)) && getComputedStyle(a).visibility !== "hidden"
    }
    links.splice(0, links.length, ...links.filter(reachable))
    const prefer = links.find((a) => /\/products\/[^/]+$/.test(new URL(a.href).pathname)) ?? links.find((a) => /\/products\/?$/.test(new URL(a.href).pathname)) ?? links[0]
    if (!prefer) return null
    prefer.setAttribute("data-perf-target", "1")
    prefer.scrollIntoView({ block: "center" })
    return prefer.href
  })
}

async function navigate(page) {
  const href = await pickLink(page)
  if (!href) return { href: null, nav: NaN, back: NaN, bfcache: false, mode: "-" }
  await new Promise((r) => setTimeout(r, 400))
  const from = await page.evaluate(() => { window.__stay = 1; return location.href.split("#")[0] })
  const t0 = Date.now()
  const box = await (await page.$("[data-perf-target]")).boundingBox()
  if (PROFILE === "mobile") await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
  else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  /* Done when the address has moved on (to the link's, or wherever the site sent it) and the new page is parsed. */
  await page.waitForFunction((start) => location.href.split("#")[0] !== start && document.readyState !== "loading", { timeout: 20_000, polling: 16 }, from).catch(() => null)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => null)
  const nav = Date.now() - t0
  const mode = await page.evaluate(() => (window.__stay === 1 ? "in-place" : "document")).catch(() => "?")
  await new Promise((r) => setTimeout(r, 800))
  const b0 = Date.now()
  await page.goBack({ waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => null)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => null)
  const back = Date.now() - b0
  /* Only a whole-document navigation can use the back/forward cache; an in-place one goes Back inside the page. */
  const bfcache = mode === "document" ? await page.evaluate(() => (window.__restored || 0) > 0).catch(() => false) : null
  return { href, nav, back, bfcache, mode }
}

async function main() {
  if (!existsSync(CHROMIUM)) throw new Error(`No browser at ${CHROMIUM}`)
  const sites = await siteList()
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", ...reachabilityFlags(), ...hostRules()] })
  const rows = []
  const all = []
  try {
    for (const site of sites) {
      const samples = []
      let navs = []
      for (let i = 0; i < RUNS; i++) {
        const { ctx, page, sample } = await loadOnce(browser, `${site}/`).catch((e) => ({ sample: { error: String(e.message ?? e) } }))
        if (page) {
          const n = await navigate(page).catch((e) => ({ error: String(e.message ?? e) }))
          navs.push(n)
          await ctx.close()
        }
        samples.push(sample)
      }
      all.push({ site, samples, navs })
      const row = {
        site: site.replace(/^https?:\/\//, ""),
        status: samples[0].status ?? samples[0].error,
        cache: samples.map((s) => s.cache).join("/"),
        ttfb: Math.round(median(samples.map((s) => s.ttfb))),
        fcp: Math.round(median(samples.map((s) => s.fcp))),
        lcp: Math.round(median(samples.map((s) => s.lcp))),
        cls: Number(median(samples.map((s) => s.cls)).toFixed(3)),
        tbt: Math.round(median(samples.map((s) => s.tbt))),
        jsKB: Math.round(median(samples.map((s) => s.script)) / 1024),
        totalKB: Math.round(median(samples.map((s) => s.total)) / 1024),
        reqs: median(samples.map((s) => s.requests)),
        nav: Math.round(median(navs.map((n) => n.nav))),
        navMode: navs.map((n) => n.mode).join("/"),
        back: Math.round(median(navs.map((n) => n.back))),
        bfcache: navs.some((n) => n.bfcache !== null) ? `${navs.filter((n) => n.bfcache).length}/${navs.filter((n) => n.bfcache !== null).length}` : "in-place",
        navTo: navs[0]?.href ? new URL(navs[0].href).pathname : "-",
      }
      rows.push(row)
      console.log(JSON.stringify(row))
    }
  } finally {
    await browser.close()
  }
  console.log(`\nProfile: ${PROFILE}, ${RUNS} run(s) each. Budget: LCP < ${BUDGET.lcp} ms, navigation < ${BUDGET.nav} ms, CLS < ${BUDGET.cls}.`)
  console.table(rows)
  if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify({ profile: PROFILE, rows, all }, null, 2))
  const over = rows.filter((r) => !(r.lcp < BUDGET.lcp) || (Number.isFinite(r.nav) && r.nav >= BUDGET.nav) || r.cls >= BUDGET.cls)
  if (over.length && !process.env.NO_BUDGET) {
    console.error(`\nOver budget: ${over.map((r) => r.site).join(", ")}`)
    process.exit(1)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
