/**
 * ===========================================================================
 *  A LIVE WEBSITE'S FIRST VISIT, ON A THROTTLED PHONE
 * ===========================================================================
 * Opens each address in a fresh browser (nothing cached) as a mid range
 * phone on a mobile network sees it: 390 by 844, 10 Mbps down, 40ms of
 * latency, the CPU slowed four times. Prints, per address, the median of
 * the runs:
 *
 *   ttfb   the document's first byte
 *   fcp    first contentful paint
 *   lcp    largest contentful paint
 *   dcl    DOMContentLoaded finished (the theme's deferred scripts have run)
 *   load   the load event finished
 *   long   main thread time spent in tasks over 50ms, summed
 *   tbt    the part of those tasks over 50ms (total blocking time)
 *   cache  the document's x-vercel-cache, when there is one
 *
 * and, with --nav, the way a visitor moves between pages: from clicking the
 * page's first internal link to the next page's first paint (navFcp, what
 * they wait for) and to its load event (nav, the theme's scripts done).
 *
 *   node scripts/check-live-first-load.mjs https://andrewrullz.storelib.com/
 *   node scripts/check-live-first-load.mjs --runs 3 --nav http://localhost:4100/
 *
 * Targets for an imported theme's page on this profile: fcp under 1.8s, lcp
 * under 2.5s, dcl under 3s. It prints what it measured and says which
 * targets were missed; it never rounds a miss into a pass.
 */
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { join } from "node:path"

const require = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require("playwright"))
} catch {
  const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim()
  ;({ chromium } = require(join(globalRoot, "playwright")))
}

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  if (i < 0) return null
  args.splice(i, 1)
  return true
}
const option = (name, fallback) => {
  const i = args.indexOf(name)
  if (i < 0) return fallback
  const v = args[i + 1]
  args.splice(i, 2)
  return v
}
const runs = Number(option("--runs", "1"))
const withNav = !!flag("--nav")
const desktop = !!flag("--desktop")
const urls = args
if (!urls.length) {
  console.error("Usage: node scripts/check-live-first-load.mjs [--runs N] [--nav] [--desktop] <url> [url...]")
  process.exit(2)
}

const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
const TARGET = { fcp: 1800, lcp: 2500, dcl: 3000 }

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" })

async function once(url) {
  const ctx = await browser.newContext(desktop ? { viewport: { width: 1440, height: 900 } } : { viewport: { width: 390, height: 844 }, userAgent: PHONE_UA, isMobile: true, hasTouch: true, deviceScaleFactor: 3 })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send("Network.enable")
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 40, downloadThroughput: 10e6 / 8, uploadThroughput: 5e6 / 8 })
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: desktop ? 1 : 4 })
  let docCache = ""
  page.on("response", (r) => {
    if (r.request().resourceType() === "document" && r.frame() === page.mainFrame() && !docCache) docCache = r.headers()["x-vercel-cache"] || "-"
  })
  await page.addInitScript(() => {
    window.__lcp = 0
    window.__long = 0
    window.__tbt = 0
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime }).observe({ type: "largest-contentful-paint", buffered: true })
      new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__long += e.duration; window.__tbt += Math.max(0, e.duration - 50) } }).observe({ type: "longtask", buffered: true })
    } catch {}
  })
  await page.goto(url, { waitUntil: "load", timeout: 120000 })
  await page.waitForTimeout(1500)
  const m = await page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0]
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]
    return {
      ttfb: Math.round(n.responseStart),
      fcp: Math.round(fcp?.startTime || 0),
      lcp: Math.round(window.__lcp),
      dcl: Math.round(n.domContentLoadedEventEnd),
      load: Math.round(n.loadEventEnd),
      long: Math.round(window.__long),
      tbt: Math.round(window.__tbt),
      htmlKB: Math.round(n.transferSize / 1024),
      nodes: document.getElementsByTagName("*").length,
      requests: performance.getEntriesByType("resource").length,
    }
  })
  m.cache = docCache
  if (withNav) {
    const origin = new URL(url).origin
    const href = await page.evaluate((o) => [...document.querySelectorAll("a[href]")].map((a) => a.href).find((h) => h.startsWith(o) && !h.includes("#") && new URL(h).pathname !== new URL(location.href).pathname && !/cart|checkout|account|login/.test(h)), origin)
    if (href) {
      const t1 = Date.now()
      await page.evaluate((h) => { const a = [...document.querySelectorAll("a")].find((x) => x.href === h); a?.click() }, href)
      await page.waitForURL((u) => u.href.replace(/\/$/, "") === href.replace(/\/$/, ""), { timeout: 60000 }).catch(() => {})
      await page.waitForLoadState("load").catch(() => {})
      m.nav = Date.now() - t1
      m.navTo = href.replace(origin, "")
      /* When the next page was first drawn, from the click: what the visitor waits for before they see it. */
      const drawnAt = await page.evaluate(() => performance.timeOrigin + (performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? NaN)).catch(() => NaN)
      m.navFcp = Number.isFinite(drawnAt) ? Math.round(drawnAt - t1) : 0
    }
  }
  await ctx.close()
  return m
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/* Round by round across the addresses, so a busy moment on the machine lands on every address alike and a comparison stays fair. */
const results = new Map(urls.map((u) => [u, []]))
for (let i = 0; i < runs; i++) for (const url of urls) results.get(url).push(await once(url))

let missed = 0
for (const url of urls) {
  const all = results.get(url)
  const keys = ["ttfb", "fcp", "lcp", "dcl", "load", "long", "tbt", "htmlKB", "nodes", "requests", ...(withNav ? ["nav", "navFcp"] : [])]
  const row = Object.fromEntries(keys.map((k) => [k, median(all.map((r) => r[k] ?? 0))]))
  row.cache = all.map((r) => r.cache).join("/")
  if (withNav) row.navTo = all[0].navTo
  console.log(url)
  console.log("  " + Object.entries(row).map(([k, v]) => `${k} ${v}`).join("  "))
  if (runs > 1) console.log("  runs: " + all.map((r) => `fcp ${r.fcp} lcp ${r.lcp} dcl ${r.dcl}${withNav ? ` nav ${r.nav}` : ""}`).join(" | "))
  if (!desktop) {
    const misses = Object.entries(TARGET).filter(([k, t]) => row[k] > t).map(([k, t]) => `${k} ${row[k]}ms > ${t}ms`)
    if (misses.length) {
      missed++
      console.log("  over target: " + misses.join(", "))
    } else console.log("  within targets (fcp < 1.8s, lcp < 2.5s, dcl < 3s)")
  }
}
await browser.close()
process.exitCode = missed ? 1 : 0
