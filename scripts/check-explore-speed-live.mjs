/**
 * ===========================================================================
 *  EXPLORE ON THE REAL SITE, ON A SLOW PHONE: HOW LONG UNTIL THERE IS A GRID
 * ===========================================================================
 * Loads https://storelib.com/explore (or URL) in Chromium with the CPU slowed
 * four times and the network at DevTools' "Slow 3G" (2s round trip, 50kB/s),
 * and reads what a visitor waits for:
 *
 *   TTFB          the first byte of the document
 *   FIRST CARD    the first product card painted in the grid (a card in the
 *                 DOM with a box on screen), from navigation start
 *   LCP           the browser's own largest contentful paint
 *   PILL          a tap on the Design pill until the grid shows Design (the
 *                 pressed pill and a grid that changed), products mode; and
 *                 the same in communities mode (?type=communities), where a
 *                 pill is a request
 *
 * Then, at full speed, crops of the search field at 1440 and 390, at rest
 * (the hero's field) and scrolled (the header's field), to look at its depth.
 *
 *   node scripts/check-explore-speed-live.mjs            (both)
 *   AB=1 node scripts/check-explore-speed-live.mjs       (first load, live HTML against round 10's)
 *   SPEED=0 node scripts/check-explore-speed-live.mjs    (crops only)
 *
 * Read only: it never signs in, buys or writes anything.
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { cropPng } from "./probe-crop.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const BASE = process.env.URL ?? "https://storelib.com/explore"
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-explore-speed-")), "shots")
mkdirSync(shots, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function reachabilityFlags() {
  const flags = []
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy
  if (!proxy) return flags
  flags.push(`--proxy-server=${proxy}`)
  for (const ca of ["/root/.ccr/agent-proxy-ca.crt", "/root/.ccr/ca-bundle.crt"]) {
    if (!existsSync(ca)) continue
    try {
      const pem = execFileSync("openssl", ["x509", "-in", ca, "-pubkey", "-noout"], { encoding: "buffer" })
      const spki = createHash("sha256").update(execFileSync("openssl", ["pkey", "-pubin", "-outform", "der"], { input: pem })).digest("base64")
      flags.push(`--ignore-certificate-errors-spki-list=${spki}`)
      break
    } catch { /* the run fails loudly instead */ }
  }
  return flags
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", ...reachabilityFlags()] })

const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
const SLOW3G = { offline: false, latency: 2000, downloadThroughput: 50_000, uploadThroughput: 50_000 }

/* A fresh context each time: nothing cached from the run before, as a first visit. */
async function page(vp, slow) {
  const ctx = await browser.createBrowserContext()
  const p = await ctx.newPage()
  await p.setViewport(vp)
  if (slow) {
    const cdp = await p.createCDPSession()
    await cdp.send("Network.enable")
    await cdp.send("Network.emulateNetworkConditions", SLOW3G)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  }
  await p.evaluateOnNewDocument(() => {
    window.__lcp = 0
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime }).observe({ type: "largest-contentful-paint", buffered: true })
    window.__firstCard = 0
    const tick = () => {
      const c = document.querySelector("[data-product-card], [data-community-card]")
      if (c && c.getBoundingClientRect().height > 0) { window.__firstCard = performance.now(); return }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  return p
}

/* What a pill tap costs: from the tap to the grid showing the new set. */
const PILL_TAP = (label) => `(async () => {
  const pill = [...document.querySelectorAll("[data-category-pills-row] > button")].find((b) => b.textContent.includes(${JSON.stringify(label)}))
  if (!pill) return { error: "no pill" }
  const firstName = () => {
    const c = document.querySelector("[data-communities-results] a, [data-product-card]")
    return c ? c.textContent.slice(0, 60) : null
  }
  const before = firstName()
  const t0 = performance.now()
  pill.click()
  let pressedAt = 0, skeletonSeen = false
  return await new Promise((done) => {
    const tick = () => {
      const now = performance.now()
      if (!pressedAt && pill.getAttribute("aria-pressed") === "true") pressedAt = now - t0
      if (document.querySelector("[data-communities-loading]")) skeletonSeen = true
      const after = firstName()
      const busy = document.querySelector("[data-communities-loading], [aria-busy=true]")
      if (pressedAt && after && after !== before && !busy) return done({ pressed: Math.round(pressedAt), content: Math.round(now - t0), skeletonSeen })
      if (now - t0 > 30000) return done({ pressed: Math.round(pressedAt), content: null, skeletonSeen })
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
})()`

if (process.env.SPEED !== "0") {
  for (const [label, vp] of [["phone", PHONE], ["desktop", DESK]]) {
    for (const type of ["products", "communities"]) {
      const p = await page(vp, true)
      const url = type === "communities" ? `${BASE}?type=communities` : `${BASE}?type=products`
      const t = Date.now()
      await p.goto(url, { waitUntil: "load", timeout: 180_000 }).catch((e) => console.log("  goto:", e.message))
      const nav = await p.evaluate(() => {
        const n = performance.getEntriesByType("navigation")[0]
        const res = performance.getEntriesByType("resource")
        const kb = (f) => Math.round(res.filter(f).reduce((s, r) => s + (r.transferSize || 0), 0) / 1024) + "kB"
        const img = (r) => r.initiatorType === "img" || /\/_next\/image|\.(png|jpe?g|webp|avif)/.test(r.name)
        return {
          ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd),
          firstCard: Math.round(window.__firstCard), lcp: Math.round(window.__lcp),
          doc: Math.round((n.transferSize || 0) / 1024) + "kB", js: kb((r) => /\.js(\?|$)/.test(r.name)), css: kb((r) => /\.css(\?|$)/.test(r.name)), images: kb(img), imageCount: res.filter(img).length,
          imageWidths: [...new Set(res.filter(img).map((r) => new URL(r.name).searchParams.get("w")).filter(Boolean))].join(","),
        }
      })
      await sleep(1500)
      const pill = await p.evaluate(PILL_TAP("Design"))
      await sleep(500)
      const pill2 = await p.evaluate(PILL_TAP("Business"))
      await sleep(500)
      const back = await p.evaluate(PILL_TAP("Design"))
      console.log(`${label} ${type} 4xCPU slow3G: ${JSON.stringify(nav)}  wall=${Date.now() - t}ms`)
      console.log(`   pill Design ${JSON.stringify(pill)}  Business ${JSON.stringify(pill2)}  Design again ${JSON.stringify(back)}`)
      await p.browserContext().close()
    }
  }
}

/*
  AB=1: THE FIRST LOAD, THE LIVE PAGE AGAINST THE SAME PAGE WITH THIS
  ROUND'S HTML CHANGES. The document is fetched once and served to both arms
  from memory (so the server's time is the same zero in both); every other
  request goes to the site through the same throttling. Arm B is the live
  HTML with what components/explore changed in it: one picture preloaded
  instead of three (the first card's), the second and third cards' pictures
  lazy like the rest, and the grid's real `sizes` (GRID_SIZES). Read: the
  first card painted, the first card's picture decoded, LCP.
*/
const LIVE_SIZES = "(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
const GRID_SIZES = "(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 440px"
function armB(html) {
  let preloads = 0
  html = html.replace(/<link rel="preload" as="image"[^>]*product-images[^>]*>/g, (m) => (++preloads === 1 ? m : ""))
  let imgs = 0
  html = html.replace(/<img [^>]*product-images[^>]*>/g, (m) => {
    imgs++
    if (imgs === 2 || imgs === 3) m = m.replace(/ fetchPriority="high"/, "").replace("<img ", '<img loading="lazy" ')
    return m
  })
  return html.split(LIVE_SIZES).join(GRID_SIZES)
}
if (process.env.AB === "1") {
  const res = await fetch(`${BASE}?type=products`)
  const live = await res.text()
  const arms = { A: live, B: armB(live) }
  console.log(`AB: document ${Math.round(live.length / 1024)}kB; arm B drops ${(live.match(/<link rel="preload" as="image"[^>]*product-images/g) || []).length - 1} picture preloads`)
  const runs = Number(process.env.RUNS || 2)
  for (const [label, vp] of [["phone", PHONE], ["desktop", DESK]]) {
    for (let i = 0; i < runs; i++) {
      for (const arm of ["A", "B"]) {
        const p = await page(vp, true)
        await p.setRequestInterception(true)
        p.on("request", (req) => {
          if (req.resourceType() === "document" && req.url().startsWith(BASE)) return req.respond({ status: 200, contentType: "text/html; charset=utf-8", body: arms[arm] })
          req.continue()
        })
        await p.evaluateOnNewDocument(() => {
          window.__firstImg = 0
          const tick = () => {
            const img = document.querySelector("[data-product-card] img")
            if (img && img.complete && img.naturalWidth > 0) { window.__firstImg = performance.now(); return }
            requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        })
        await p.goto(`${BASE}?type=products`, { waitUntil: "domcontentloaded", timeout: 180_000 }).catch((e) => console.log("  goto:", e.message))
        await p.waitForFunction(() => window.__firstImg > 0, { timeout: 180_000, polling: 200 }).catch(() => {})
        await sleep(500)
        const m = await p.evaluate(() => ({ firstCard: Math.round(window.__firstCard), firstPicture: Math.round(window.__firstImg), lcp: Math.round(window.__lcp), pictures: performance.getEntriesByType("resource").filter((r) => /product-images/.test(r.name)).length }))
        console.log(`  ${label} run ${i + 1} arm ${arm} (${arm === "A" ? "live" : "round 10"}): ${JSON.stringify(m)}`)
        await p.browserContext().close()
      }
    }
  }
  await browser.close()
  process.exit(0)
}

/* The field's depth, at rest and scrolled, and what could cut it. Whole
   viewport shots (a clipped shot of a fixed header comes back blank), then
   cropped around the field and enlarged three times. */
const CLIPPERS = `((input) => {
  const out = []
  for (let el = input.parentElement; el; el = el.parentElement) {
    const cs = getComputedStyle(el)
    if (cs.overflowX !== "visible" || cs.overflowY !== "visible" || cs.clipPath !== "none" || cs.contain.includes("paint")) out.push(el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + "." + String(el.className).slice(0, 70) + " " + cs.overflowX + "/" + cs.overflowY)
  }
  return out
})`
for (const [label, vp] of [["desktop", { ...DESK, deviceScaleFactor: 2 }], ["phone", PHONE]]) {
  const p = await page(vp, false)
  await p.goto(`${BASE}?type=products`, { waitUntil: "networkidle2", timeout: 90_000 }).catch(() => {})
  await sleep(1200)
  await p.evaluate(() => { for (const b of document.querySelectorAll("button")) if (/^Reject all$/.test(b.textContent.trim())) b.click() })
  await sleep(300)
  const hero = await p.evaluate(`(() => {
    const input = document.querySelector("main form[role=search] input")
    if (!input) return null
    const r = input.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, shadow: getComputedStyle(input).boxShadow, clippers: ${CLIPPERS}(input) }
  })()`)
  console.log(`${label} hero field`, JSON.stringify(hero))
  if (hero) {
    const full = join(shots, `${label}-hero-full.png`)
    await p.screenshot({ path: full })
    const s = vp.deviceScaleFactor
    await cropPng(browser, full, join(shots, `${label}-hero-field.png`), { x: Math.max(0, hero.left - 30) * s, y: (hero.top - 30) * s, width: Math.min(vp.width, hero.right - hero.left + 60) * s, height: (hero.bottom - hero.top + 70) * s }, 3 / s)
    await cropPng(browser, full, join(shots, `${label}-hero-field-corner.png`), { x: Math.max(0, hero.left - 24) * s, y: (hero.bottom - 30) * s, width: 220 * s, height: 64 * s }, 4 / s)
  }
  /* Scrolled until the header's field (or the phone's strip) is the search. */
  await p.evaluate(() => window.scrollTo(0, 900))
  await p.mouse.wheel({ deltaY: 60 })
  await sleep(1200)
  const sticky = await p.evaluate(`(() => {
    const input = [...document.querySelectorAll("[data-header-search-field] input")].find((i) => { const r = i.getBoundingClientRect(); return r.height > 0 && getComputedStyle(i).visibility !== "hidden" && r.top >= 0 && r.top < 200 })
    if (!input) return null
    const r = input.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, shadow: getComputedStyle(input).boxShadow, clippers: ${CLIPPERS}(input) }
  })()`)
  console.log(`${label} sticky field`, JSON.stringify(sticky))
  const full = join(shots, `${label}-sticky-full.png`)
  await p.screenshot({ path: full })
  if (sticky) {
    const s = vp.deviceScaleFactor
    await cropPng(browser, full, join(shots, `${label}-sticky-field.png`), { x: Math.max(0, sticky.left - 30) * s, y: 0, width: Math.min(vp.width - Math.max(0, sticky.left - 30), sticky.right - sticky.left + 60) * s, height: (sticky.bottom + 40) * s }, 3 / s)
    await cropPng(browser, full, join(shots, `${label}-sticky-field-corner.png`), { x: Math.max(0, sticky.left - 24) * s, y: (sticky.bottom - 30) * s, width: 220 * s, height: 64 * s }, 4 / s)
  }
  await p.browserContext().close()
}

console.log(`\nshots: ${shots}`)
await browser.close()
