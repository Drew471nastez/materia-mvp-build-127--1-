/**
 * ===========================================================================
 *  CORE WEB VITALS OF THE LIVE SITE (round 46)
 * ===========================================================================
 * Opens each page the way a visitor does, in a real headless Chromium
 * (Playwright), and reads what the visitor waits for:
 *
 *   TTFB, FCP, LCP (and the element that was it, with its fetchpriority and
 *   loading attributes), CLS (and which elements moved), TBT (every long task
 *   after FCP, the part over 50 ms), script bytes, image bytes, total bytes,
 *   request count, and the third party hosts that sent scripts.
 *
 * Each page is loaded cold RUNS times (a fresh browser context each time) and
 * the median of each number is reported. "Good" is Google's threshold:
 * LCP <= 2.5 s, CLS <= 0.1, and TBT <= 200 ms as the lab stand in for INP.
 *
 *   node scripts/check-live-vitals.mjs                       every page below, mobile then desktop
 *   PAGES=/,/pricing node scripts/check-live-vitals.mjs      only these (a path is on storelib.com)
 *   PROFILE=mobile    390x844 @3x, touch, CPU 4x slower (CDP Emulation.setCPUThrottlingRate),
 *                     Fast 4G (CDP Network.emulateNetworkConditions: 9 Mbps down, 1.5 up, 60 ms)
 *   PROFILE=desktop   1440x900, no throttling
 *   PROFILE=both      (default) mobile, then desktop
 *   RUNS=3            cold loads per page
 *   OUT=dir           write vitals-<profile>.json and vitals.md (a table) there
 *   BASE=http://127.0.0.1:3000   a local production build: every storelib.com path goes to BASE
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"

/* Playwright is installed globally (NODE_PATH), which an ES module import does not search. */
const require = createRequire(import.meta.url)
const { chromium } = require("playwright")

export const GOOD = { lcp: 2500, cls: 0.1, tbt: 200 }

export const DEFAULT_PAGES = [
  "https://storelib.com/",
  "https://storelib.com/pricing",
  "https://storelib.com/features",
  "https://storelib.com/sell/digital-products",
  "https://storelib.com/alternatives",
  "https://storelib.com/alternatives/gumroad",
  "https://storelib.com/blog",
  "https://storelib.com/blog/how-to-price-your-digital-products-without-leaving-money-on-the-table",
  "https://storelib.com/blog/category/creator-tips",
  "https://storelib.com/andrewrullz",
  "https://storelib.com/andrewrullz/tech-house-master-bundle-2026",
  "https://andrewrullz.storelib.com/",
  "https://help.storelib.com/products/files-and-delivery",
]

const RUNS = Math.max(1, Number(process.env.RUNS ?? 3))
const PROFILES = process.env.PROFILE === "mobile" ? ["mobile"] : process.env.PROFILE === "desktop" ? ["desktop"] : ["mobile", "desktop"]

function pages() {
  const list = process.env.PAGES ? process.env.PAGES.split(",").map((p) => p.trim()) : DEFAULT_PAGES
  return list.map((p) => (p.startsWith("http") ? p : `https://storelib.com${p}`)).map((p) => (process.env.BASE ? p.replace("https://storelib.com", process.env.BASE.replace(/\/$/, "")) : p))
}

/** Through the session's HTTPS proxy, trusting only its own CA by public key. */
function proxyArgs() {
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

export const median = (xs) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : NaN
}

/** Runs in the page before any of its own script. */
function observe() {
  const name = (n) => {
    if (!n || !n.nodeName) return "?"
    const cls = typeof n.className === "string" && n.className.trim() ? `.${n.className.trim().split(/\s+/).slice(0, 3).join(".")}` : ""
    return `${n.nodeName.toLowerCase()}${n.id ? `#${n.id}` : ""}${cls}`
  }
  const p = (window.__vitals = { lcp: 0, lcpEl: "", lcpUrl: "", lcpAttrs: null, cls: 0, shifts: [], longtasks: [] })
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      p.lcp = e.startTime
      p.lcpEl = name(e.element)
      p.lcpUrl = e.url || ""
      p.lcpLoad = e.loadTime || 0
      const el = e.element
      p.lcpAttrs = el && el.tagName === "IMG"
        ? { fetchpriority: el.getAttribute("fetchpriority"), loading: el.getAttribute("loading"), sizes: el.getAttribute("sizes"), width: el.getAttribute("width"), height: el.getAttribute("height"), rendered: `${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`, natural: `${el.naturalWidth}x${el.naturalHeight}`, current: (el.currentSrc || "").slice(0, 160) }
        : el ? { text: (el.textContent || "").trim().slice(0, 60) } : null
    }
  }).observe({ type: "largest-contentful-paint", buffered: true })
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (e.hadRecentInput) continue
      p.cls += e.value
      if (e.value > 0.005) p.shifts.push({ at: Math.round(e.startTime), value: Number(e.value.toFixed(4)), moved: e.sources.map((s) => `${name(s.node)} y${Math.round(s.previousRect.y)} h${Math.round(s.previousRect.height)} -> y${Math.round(s.currentRect.y)} h${Math.round(s.currentRect.height)}`) })
    }
  }).observe({ type: "layout-shift", buffered: true })
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) p.longtasks.push({ start: e.startTime, duration: e.duration })
  }).observe({ type: "longtask", buffered: true })
}

async function loadOnce(browser, url, profile) {
  const context = await browser.newContext(
    profile === "mobile"
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" }
      : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  )
  try {
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await cdp.send("Network.enable")
    if (profile === "mobile") {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 60, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 })
    }
    await page.addInitScript(observe)
    const bytes = { js: 0, img: 0, font: 0, css: 0, total: 0, requests: 0 }
    const thirdParty = new Set()
    const types = new Map()
    const origin = new URL(url).hostname.split(".").slice(-2).join(".")
    cdp.on("Network.responseReceived", (e) => types.set(e.requestId, { type: e.type, url: e.response.url }))
    cdp.on("Network.loadingFinished", (e) => {
      const t = types.get(e.requestId)
      bytes.total += e.encodedDataLength
      bytes.requests++
      if (!t) return
      if (t.type === "Script") {
        bytes.js += e.encodedDataLength
        try { const h = new URL(t.url).hostname; if (!h.endsWith(origin)) thirdParty.add(h) } catch { /* data: */ }
      }
      if (t.type === "Image") bytes.img += e.encodedDataLength
      if (t.type === "Font") bytes.font += e.encodedDataLength
      if (t.type === "Stylesheet") bytes.css += e.encodedDataLength
    })
    const res = await page.goto(url, { waitUntil: "load", timeout: 90_000 })
    /* Settle: late images, hydration and the first idle work after load. */
    await page.waitForTimeout(3000)
    const m = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0]
      const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? NaN
      const v = window.__vitals
      const tbt = v.longtasks.filter((t) => t.start >= fcp).reduce((s, t) => s + Math.max(0, t.duration - 50), 0)
      const lcpRes = v.lcpUrl ? performance.getEntriesByName(v.lcpUrl)[0] : null
      return {
        ttfb: nav.responseStart, fcp, lcp: v.lcp, cls: v.cls, tbt, load: nav.loadEventEnd,
        lcpEl: v.lcpEl, lcpUrl: v.lcpUrl.slice(0, 200), lcpAttrs: v.lcpAttrs,
        lcpResource: lcpRes ? { start: Math.round(lcpRes.startTime), end: Math.round(lcpRes.responseEnd), size: lcpRes.encodedBodySize } : null,
        shifts: v.shifts, longtasks: v.longtasks.length,
      }
    })
    return { ...m, ...bytes, thirdParty: [...thirdParty], status: res?.status() ?? 0, cache: res?.headers()["x-vercel-cache"] ?? "-" }
  } finally {
    await context.close()
  }
}

const ms = (x) => (Number.isFinite(x) ? `${Math.round(x)}` : "-")
const kb = (x) => (Number.isFinite(x) ? `${Math.round(x / 1024)}` : "-")

export function verdict(r) {
  const miss = []
  if (!(r.lcp <= GOOD.lcp)) miss.push("LCP")
  if (!(r.cls <= GOOD.cls)) miss.push("CLS")
  if (!(r.tbt <= GOOD.tbt)) miss.push("TBT")
  return miss.length ? `miss ${miss.join("+")}` : "good"
}

function table(rows, profile) {
  const head = `| page | TTFB | FCP | LCP | CLS | TBT | JS KB | img KB | total KB | req | verdict | LCP element |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|`
  const body = rows.map((r) => `| ${r.page.replace(/^https?:\/\//, "")} | ${ms(r.ttfb)} | ${ms(r.fcp)} | ${ms(r.lcp)} | ${Number.isFinite(r.cls) ? r.cls.toFixed(3) : "-"} | ${ms(r.tbt)} | ${kb(r.js)} | ${kb(r.img)} | ${kb(r.total)} | ${ms(r.requests)} | ${verdict(r)} | ${(r.lcpEl || "").slice(0, 50)}${r.lcpUrl ? " (img)" : ""} |`)
  return `### ${profile} (median of ${RUNS})\n\n${head}\n${body.join("\n")}\n`
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", ...proxyArgs()] })
  const out = process.env.OUT
  if (out) mkdirSync(out, { recursive: true })
  const md = []
  try {
    for (const profile of PROFILES) {
      const rows = []
      for (const page of pages()) {
        const samples = []
        for (let i = 0; i < RUNS; i++) samples.push(await loadOnce(browser, page, profile).catch((e) => ({ error: String(e.message ?? e).slice(0, 200) })))
        const ok = samples.filter((s) => !s.error)
        const pick = (k) => median(ok.map((s) => s[k]))
        /* The element and its shifts from the run whose LCP is the median one. */
        const lcpMed = pick("lcp")
        const rep = ok.find((s) => s.lcp === lcpMed) ?? ok[0] ?? {}
        const row = { page, ttfb: pick("ttfb"), fcp: pick("fcp"), lcp: lcpMed, cls: pick("cls"), tbt: pick("tbt"), js: pick("js"), img: pick("img"), font: pick("font"), css: pick("css"), total: pick("total"), requests: pick("requests"), lcpEl: rep.lcpEl, lcpUrl: rep.lcpUrl, lcpAttrs: rep.lcpAttrs, lcpResource: rep.lcpResource, shifts: ok.flatMap((s) => s.shifts ?? []).slice(0, 12), thirdParty: rep.thirdParty, status: rep.status, cache: rep.cache, errors: samples.filter((s) => s.error).map((s) => s.error), samples }
        rows.push(row)
        console.log(`${profile.padEnd(7)} ${page.padEnd(90)} LCP ${ms(row.lcp).padStart(5)} CLS ${Number.isFinite(row.cls) ? row.cls.toFixed(3) : "-"} TBT ${ms(row.tbt).padStart(5)} JS ${kb(row.js)}KB img ${kb(row.img)}KB ${verdict(row)}  ${row.lcpEl ?? ""}`)
      }
      md.push(table(rows, profile))
      if (out) writeFileSync(join(out, `vitals-${profile}.json`), JSON.stringify(rows, null, 2))
    }
  } finally {
    await browser.close()
  }
  console.log(`\n${md.join("\n")}`)
  if (out) writeFileSync(join(out, "vitals.md"), md.join("\n"))
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1) })
