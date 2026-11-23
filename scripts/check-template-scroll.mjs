/**
 * ===========================================================================
 *  THE TEMPLATES' PREVIEWS WHILE SCROLLING: THE HEADER AND THE PICTURES
 * ===========================================================================
 *   node scripts/check-template-scroll.mjs [slug ...]
 *
 * Reported from the theme preview (OKTAV, templates round 23): scrolling up,
 * the sticky header jumped, a white band showed under the announcement bar,
 * the header slid over the bar and snapped at the top; and pictures came in
 * late and abruptly while scrolling through sections.
 *
 * Each template's prerendered home page (public/theme-previews/<slug>/,
 * scripts/build-template-previews.ts) is opened in Chromium, framed as the
 * marketplace's Preview frames it, and scrolled with the wheel: slowly down,
 * slowly up, a fling up to the top, a short way down and back. Read in every
 * frame, after the page's own scripts and layout and before paint:
 *
 *   band     how much of the header's own place in the page shows with no
 *            header over it (the white band), in px
 *   jump     the header moving 30px or more in one frame while the page
 *            did not scroll
 *
 * Then, on a 12 Mbps connection, the page read at a skimming pace: how many
 * frames had a picture on screen that had not arrived yet.
 *
 * Fails when a band or a jump is seen, or a picture was missing on screen.
 */
import { createServer } from "node:http"
import { existsSync, readFileSync, statSync } from "node:fs"
import { extname, join } from "node:path"
import puppeteer from "puppeteer-core"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const ROOT = join(process.cwd(), "public")
const slugs = process.argv.slice(2).length ? process.argv.slice(2) : ["merch", "clothing", "landing-page", "ebooks"]
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg" }

const server = createServer((req, res) => {
  const u = new URL(req.url, "http://x")
  if (u.pathname === "/frame") {
    res.writeHead(200, { "content-type": "text/html" })
    return res.end(`<!doctype html><body style="margin:0"><iframe sandbox="allow-scripts" src="${u.searchParams.get("src")}" style="border:0;width:100vw;height:100vh"></iframe>`)
  }
  const f = join(ROOT, decodeURIComponent(u.pathname))
  if (!f.startsWith(ROOT) || !existsSync(f) || statSync(f).isDirectory()) {
    res.writeHead(404)
    return res.end()
  }
  res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream", "cache-control": "no-store" })
  res.end(readFileSync(f))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`
if (!existsSync(CHROMIUM)) throw new Error(`No browser at ${CHROMIUM}`)
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
const pause = (ms) => new Promise((r) => setTimeout(r, ms))
let bad = 0

/* Every frame, read after rAF callbacks and layout: a ResizeObserver on a box resized each frame. */
const RECORD = () => {
  window.__frames = []
  const section = document.querySelector("header.header[data-sticky]")?.closest(".shopify-section")
  const box = document.createElement("div")
  box.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none"
  document.body.append(box)
  let k = 0
  new ResizeObserver(() => {
    const anchor = document.querySelector("span[data-header-anchor]")
    const header = section?.querySelector("header.header")
    if (!anchor || !header) return
    const r = header.getBoundingClientRect()
    window.__frames.push({ y: Math.round(scrollY), slot: Math.round(anchor.getBoundingClientRect().top), top: Math.round(r.top), bottom: Math.round(r.bottom) })
  }).observe(box)
  const loop = () => {
    box.style.width = 1 + (k++ % 2) + "px"
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

for (const slug of slugs) {
  for (const width of [1280, 390]) {
    const page = await browser.newPage()
    await page.setViewport(width < 600 ? { width, height: 844, isMobile: true, hasTouch: true } : { width, height: 800 })
    await page.goto(`${origin}/frame?src=${encodeURIComponent(`/theme-previews/${slug}/index.html`)}`, { waitUntil: "networkidle0", timeout: 90000 })
    const frame = page.frames().find((f) => f !== page.mainFrame())
    await pause(800)
    await frame.evaluate(RECORD)
    const wheel = async (dy, n, gap = 16) => {
      for (let i = 0; i < n; i++) {
        await page.mouse.wheel({ deltaY: dy })
        await pause(gap)
      }
    }
    await page.mouse.move(width / 2, 400)
    await wheel(40, 40); await pause(700)
    await wheel(-20, 30); await pause(700)
    await wheel(-40, 40); await pause(900)
    await wheel(60, 30); await pause(700)
    await wheel(-150, 13); await pause(900)
    await wheel(50, 6); await pause(500)
    await wheel(-50, 6); await pause(900)
    const frames = await frame.evaluate(() => window.__frames)
    let band = 0
    let jumps = 0
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]
      const h = f.bottom - f.top
      const placeBottom = f.slot + h
      if (placeBottom > 0) band = Math.max(band, placeBottom - Math.max(f.bottom, f.slot, 0))
      const p = frames[i - 1]
      if (p && Math.abs(f.y - p.y) < 3 && Math.abs(f.top - p.top) >= 30) jumps++
    }
    const ok = band <= 1 && jumps === 0
    if (!ok) bad++
    console.log(`${ok ? "ok  " : "FAIL"}  ${slug} ${width}: header over ${frames.length} frames, widest band ${band}px, ${jumps} jumps`)
    await page.close()
  }

  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  const cdp = await page.createCDPSession()
  await cdp.send("Network.enable")
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true })
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 70, downloadThroughput: 12e6 / 8, uploadThroughput: 3e6 / 8 })
  await page.goto(`${origin}/theme-previews/${slug}/index.html`, { waitUntil: "load", timeout: 90000 })
  await pause(1500)
  await page.evaluate(() => {
    window.__blank = 0
    const tick = () => {
      for (const img of document.images) {
        const r = img.getBoundingClientRect()
        if (r.width < 24 || r.height < 24 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue
        if (getComputedStyle(img).visibility === "hidden") continue
        if (!(img.complete && img.naturalWidth > 0)) { window.__blank++; break }
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  await page.mouse.move(720, 450)
  for (let y = 0; y < height; y += 100) {
    await page.mouse.wheel({ deltaY: 100 })
    await pause(y % 900 === 0 ? 380 : 80)
  }
  const blank = await page.evaluate(() => window.__blank)
  if (blank) bad++
  console.log(`${blank ? "FAIL" : "ok  "}  ${slug}: ${blank} frames with a picture on screen still on its way`)
  await page.close()
}
await browser.close()
server.close()
console.log(bad ? `\n${bad} to look at` : "\nall smooth")
process.exit(bad ? 1 : 0)
