/**
 * ===========================================================================
 *  THE ONEPAGE EDITOR AND THE LIVE PAGE OVER A LONG SESSION, MEASURED
 * ===========================================================================
 * Round 12. The owner: "Sometimes on storelib.com and storelib.me ... it's
 * just crashing" (Chrome's "Aw, Snap! Error code: 5" on /app/onepage). That
 * is a killed renderer, most often one out of memory. This drives the real
 * editor (scripts/render-onepage-memory.tsx over the stubs of
 * scripts/onepage-probe-server.mjs, React's production build, the app's CSS)
 * through a long session on a phone (390x844, touch, 3x) with a heavy page
 * (a photo wallpaper, photos, a video, embeds, a map, a music player), and
 * the published page with a video wallpaper at 390 and 1440, and reads after
 * each part, with the garbage collected:
 *
 *   heap       the JS heap in use (CDP Performance.getMetrics)
 *   nodes      DOM nodes the renderer holds (CDP Memory.getDOMCounters),
 *              and how many of them are out of the document (detached)
 *   images     <img> elements alive (in the page or not) and the decoded
 *              pixels of those that are drawn, in megabytes
 *   media      <video> and <iframe> elements in every document
 *   layers     composited layers, and their whole area in device-pixel
 *              megabytes (an upper bound: the browser only draws the tiles
 *              near the screen, so only the count has a budget)
 *   private    the renderer process's own memory (/proc smaps_rollup)
 *
 * Every cross-origin request (YouTube, Spotify, Google Maps, the photos) is
 * answered here, so a frame is a real document with nothing in it: the
 * count of frames, not their weight, is what this measures. Site isolation
 * is off, as on most phones: every frame shares the editor's process.
 *
 * Fails when a budget below is broken. Budgets are set from the measured
 * numbers after round 12's fixes with room for the machine's noise.
 *
 *   node scripts/check-memory-r12.mjs
 *   PARTS=editor node scripts/check-memory-r12.mjs     (editor | live)
 *   ROUNDS=10 node scripts/check-memory-r12.mjs        (a shorter session)
 *   NO_BUDGET=1 node scripts/check-memory-r12.mjs      (print, never fail)
 */
import { spawn } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const FFMPEG = process.env.FFMPEG ?? "/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const PARTS = (process.env.PARTS || "editor,live").split(",")
const ROUNDS = Number(process.env.ROUNDS || 50)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const T0 = Date.now()
const step = (m) => { if (process.env.DEBUG) console.log(`    [${((Date.now() - T0) / 1000).toFixed(1)}s] ${m}`) }

/*
  BUDGETS. Megabytes unless said. `after` is the editor at the end of the
  session; `left` is the page once the editor is gone again, against the
  page as it was before the editor was first drawn.
*/
const BUDGET = {
  editor: { heapMB: 40, nodes: 8000, detached: 1500, imgs: 40, decodedMB: 60, frames: 8, videos: 2, layers: 60, growMB: 15 },
  left: { heapOverMB: 4, nodesOver: 200, frames: 0, videos: 0 },
  live390: { videos: 1, frames: 4, nodes: 2000, decodedMB: 40 },
  live1440: { videos: 2, frames: 4, nodes: 2000, decodedMB: 40 },
}

/* ── the files the page asks other hosts for ─────────────────────────────── */
const cache = join(tmpdir(), "storelib-memory-r12")
mkdirSync(cache, { recursive: true })
const photos = []
for (let n = 0; n < 5; n++) {
  const file = join(cache, `photo-${n}.jpg`)
  if (!existsSync(file)) {
    /* A phone camera's photo: 4032 by 3024. */
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4032" height="3024"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="hsl(${n * 70},60%,45%)"/><stop offset="1" stop-color="hsl(${n * 70 + 120},50%,25%)"/></linearGradient></defs><rect width="4032" height="3024" fill="url(#g)"/><circle cx="2000" cy="1500" r="900" fill="#ffffff55"/></svg>`
    writeFileSync(file, await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer())
  }
  photos.push(readFileSync(file))
}
const ytPoster = await sharp(photos[2]).resize({ width: 480, height: 360, fit: "cover" }).jpeg().toBuffer()
const videoFile = join(cache, "wallpaper.webm")
if (!existsSync(videoFile)) {
  await new Promise((resolve, reject) => {
    const ff = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", "30", "-i", "pipe:0", "-c:v", "libvpx", "-b:v", "2M", "-pix_fmt", "yuv420p", "-y", videoFile], { stdio: ["pipe", "inherit", "inherit"] })
    ff.on("error", reject)
    ff.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg ${c}`))))
    ;(async () => {
      for (let i = 0; i < 90; i++) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280"><rect width="720" height="1280" fill="hsl(${i * 4},50%,40%)"/><circle cx="${360 + 200 * Math.sin(i / 9)}" cy="${640 + 300 * Math.cos(i / 9)}" r="160" fill="#fff8"/></svg>`
        ff.stdin.write(await sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer())
      }
      ff.stdin.end()
    })()
  })
}

const { base, server } = await serveEditorProbe({ root, entry: "scripts/render-onepage-memory.tsx", statics: { "/__media/": cache }, fail })

const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  headless: true,
  args: ["--no-sandbox", "--enable-precise-memory-info", "--js-flags=--expose-gc", "--disable-site-isolation-trials", "--disable-features=IsolateOrigins,site-per-process", "--autoplay-policy=no-user-gesture-required"],
})
const browserCdp = await browser.target().createCDPSession()

/** Every request that is not this server's: answered here. /_next/image is resized as the optimizer would. */
async function answerOthers(p) {
  await p.setRequestInterception(true)
  p.on("request", async (req) => {
    const url = new URL(req.url())
    if (url.origin === base && url.pathname === "/_next/image") {
      const src = url.searchParams.get("url") || ""
      const n = Number((src.match(/photo-(\d)/) || [])[1] || 0)
      const w = Number(url.searchParams.get("w") || 640)
      const body = await sharp(photos[n]).resize({ width: w }).webp({ quality: 70 }).toBuffer()
      return req.respond({ status: 200, contentType: "image/webp", body })
    }
    if (url.origin === base || url.protocol === "data:" || url.protocol === "blob:") return req.continue()
    const type = req.resourceType()
    /* A YouTube poster is YouTube's own 480 by 360 hqdefault.jpg. */
    if (type === "image" && url.hostname.endsWith("ytimg.com")) return req.respond({ status: 200, contentType: "image/jpeg", body: ytPoster })
    if (type === "image") {
      const n = Number((url.pathname.match(/photo-(\d)/) || [])[1] || 0)
      return req.respond({ status: 200, contentType: "image/jpeg", body: photos[n] })
    }
    if (type === "document") return req.respond({ status: 200, contentType: "text/html", body: "<!doctype html><title>frame</title><body style='margin:0;background:#222'></body>" })
    if (type === "stylesheet") return req.respond({ status: 200, contentType: "text/css", body: "" })
    return req.respond({ status: 204, body: "" })
  })
}

/** The renderer processes' own memory, in MB (Private_Clean + Private_Dirty). */
async function rendererPrivateMB() {
  const { processInfo } = await browserCdp.send("SystemInfo.getProcessInfo")
  let kb = 0
  for (const proc of processInfo.filter((x) => x.type === "renderer")) {
    try {
      const s = readFileSync(`/proc/${proc.id}/smaps_rollup`, "utf8")
      for (const m of s.matchAll(/^Private_(?:Clean|Dirty):\s+(\d+) kB/gm)) kb += Number(m[1])
    } catch { /* gone */ }
  }
  return kb / 1024
}

/** Instances of a DOM class in every same-origin document's realm, in the page or not. */
async function countAlive(p, cls) {
  let total = 0
  for (const frame of p.frames().filter((f) => f.url().startsWith(base))) {
    try {
      const proto = await frame.evaluateHandle((c) => window[c]?.prototype ?? null, cls)
      if (!(await proto.jsonValue().catch(() => true))) continue
      const all = await p.queryObjects(proto)
      total += await all.evaluate((a) => a.length)
      await all.dispose()
      await proto.dispose()
    } catch { /* a cross-origin frame */ }
  }
  return total
}

async function measure(p, cdp, layersRef) {
  step("measure")
  await cdp.send("HeapProfiler.collectGarbage")
  await sleep(150)
  await cdp.send("HeapProfiler.collectGarbage")
  const metrics = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]))
  const dom = await cdp.send("Memory.getDOMCounters")
  step("  metrics done")
  const imgs = await countAlive(p, "HTMLImageElement")
  step("  imgs counted")
  let decoded = 0
  let videos = 0
  let attachedNodes = 0
  for (const frame of p.frames().filter((f) => f.url().startsWith(base))) {
    try {
      const r = await frame.evaluate(() => {
        let px = 0
        for (const img of document.images) if (img.complete && img.naturalWidth) px += img.naturalWidth * img.naturalHeight
        return { px, videos: document.querySelectorAll("video").length, nodes: document.getElementsByTagName("*").length }
      })
      decoded += r.px
      videos += r.videos
      attachedNodes += r.nodes
    } catch { /* cross-origin */ }
  }
  const dpr = await p.evaluate(() => devicePixelRatio)
  const layers = layersRef.current
  const layerPx = layers.reduce((a, l) => a + (l.drawsContent ? l.width * l.height : 0), 0) * dpr * dpr
  return {
    heapMB: +(metrics.JSHeapUsedSize / 1048576).toFixed(1),
    nodes: dom.nodes,
    detached: Math.max(0, dom.nodes - attachedNodes - dom.documents * 2),
    listeners: dom.jsEventListeners,
    docs: dom.documents,
    frames: p.frames().length - 1,
    imgs,
    decodedMB: +((decoded * 4) / 1048576).toFixed(1),
    videos,
    layers: layers.filter((l) => l.drawsContent).length,
    layersMB: +((layerPx * 4) / 1048576).toFixed(1),
    privateMB: +(await rendererPrivateMB()).toFixed(0),
  }
}

async function phone(width = 390, height = 844, touch = true) {
  const p = await browser.newPage()
  await p.setViewport({ width, height, deviceScaleFactor: touch ? 3 : 1, isMobile: touch, hasTouch: touch })
  await answerOthers(p)
  const cdp = await p.createCDPSession()
  await cdp.send("Performance.enable")
  await cdp.send("HeapProfiler.enable")
  const layersRef = { current: [] }
  await cdp.send("LayerTree.enable")
  cdp.on("LayerTree.layerTreeDidChange", (e) => { if (e.layers) layersRef.current = e.layers })
  return { p, cdp, layersRef }
}

const rows = []
const report = (part, label, m) => {
  rows.push({ part, label, ...m })
  console.log(`  ${label.padEnd(26)} heap ${String(m.heapMB).padStart(6)}MB  nodes ${String(m.nodes).padStart(6)} (detached ${String(m.detached).padStart(5)})  listeners ${String(m.listeners).padStart(5)}  imgs ${String(m.imgs).padStart(4)} decoded ${String(m.decodedMB).padStart(6)}MB  video ${m.videos}  frames ${m.frames}  layers ${String(m.layers).padStart(3)} ${String(m.layersMB).padStart(6)}MB  private ${m.privateMB}MB`)
  return m
}
const problems = []
const over = (what, value, max) => { if (value > max) problems.push(`${what}: ${value} over ${max}`) }

const click = (sel) => `(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.getClientRects().length); if (b) b.click(); return !!b })()`
const clickText = (re) => `(() => { const b = [...document.querySelectorAll("button")].find((e) => ${re}.test(e.textContent.trim()) && e.getClientRects().length); if (b) b.click(); return !!b })()`
const frames = (p, n = 2) => p.evaluate((n) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f) }), n)

/* ── the editor ──────────────────────────────────────────────────────────── */
if (PARTS.includes("editor")) {
  console.log(`\nTHE EDITOR, 390x844 touch, ${ROUNDS} rounds`)
  const { p, cdp, layersRef } = await phone()
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  /* A renderer that dies mid-session is the "Aw, Snap" itself. */
  p.on("error", (e) => { problems.push(`THE PAGE CRASHED: ${e.message}`); console.log(`  !! the page crashed: ${e.message}`) })
  p.on("framenavigated", (f) => { if (f === p.mainFrame()) step(`main frame navigated to ${f.url()}`) })
  step("goto")
  await p.goto(`${base}/app/onepage#links`, { waitUntil: "load" })
  step("loaded")
  await (await p.waitForSelector("[data-tab]", { timeout: 30000 })).dispose()
  await sleep(4000)
  const first = report("editor", "opened", await measure(p, cdp, layersRef))

  for (let i = 0; i < ROUNDS; i++) {
    for (const t of ["links", "design", "products", "settings"]) {
      await p.evaluate(click(`[data-tab="${t}"]`))
      await frames(p, 2)
    }
  }
  await p.evaluate(click(`[data-tab="links"]`))
  await sleep(800)
  report("editor", `tabs x${ROUNDS}`, await measure(p, cdp, layersRef))

  /* Design: the theme page, every kind picked in turn, the grid scrolled. */
  await p.evaluate(click(`[data-tab="design"]`))
  await sleep(500)
  await p.evaluate(click(`[data-nav-row="theme"]`))
  await (await p.waitForSelector("[data-theme-filter]", { timeout: 10000 })).dispose()
  await sleep(800)
  report("editor", "theme page", await measure(p, cdp, layersRef))
  const kinds = ["light", "dark", "gradient", "image", "all"]
  for (let i = 0; i < ROUNDS; i++) {
    await p.evaluate(click(`[data-theme-filter="${kinds[i % kinds.length]}"]`))
    await frames(p, 3)
    await p.evaluate(() => { const box = document.querySelector("[data-scroll-container]"); if (box) box.scrollTop = (box.scrollTop + 400) % Math.max(1, box.scrollHeight - box.clientHeight) })
  }
  await p.evaluate(click(`[data-theme-filter="all"]`))
  await sleep(600)
  report("editor", `kinds x${ROUNDS}`, await measure(p, cdp, layersRef))
  const cards = await p.evaluate(() => [...document.querySelectorAll("[data-theme-card]")].map((e) => e.getAttribute("data-theme-card")))
  for (let i = 0; i < 20; i++) {
    await p.evaluate(click(`[data-theme-card="${cards[i % cards.length]}"]`))
    await sleep(120)
    /* A theme that asks to change the header layout: keep it. */
    await p.evaluate(clickText(/^Update to Classic$/))
  }
  await sleep(1200)
  report("editor", "themes x20", await measure(p, cdp, layersRef))

  /* The sheets: Add block and Share, each opened and closed. */
  await p.evaluate(click(`[data-tab="links"]`))
  await sleep(500)
  for (let i = 0; i < 5; i++) {
    await p.evaluate(clickText(/^Add$/))
    await sleep(500)
    await p.keyboard.press("Escape")
    await sleep(450)
    await p.evaluate(click("[data-onepage-share]"))
    await sleep(500)
    await p.keyboard.press("Escape")
    await sleep(450)
  }
  report("editor", "sheets x5", await measure(p, cdp, layersRef))

  /* An upload: a phone camera photo into the first file field there is. */
  const input = await p.$("input[type=file][accept*=image]")
  if (input) {
    await input.uploadFile(join(cache, "photo-1.jpg"))
    await input.dispose()
    await sleep(3000)
    await p.keyboard.press("Escape")
    await sleep(600)
    report("editor", "upload", await measure(p, cdp, layersRef))
  } else console.log("  (no image file field on Links: upload skipped)")

  /* The whole-screen preview, opened and closed. */
  for (let i = 0; i < 5; i++) {
    await p.evaluate(clickText(/^Preview$/))
    await sleep(1500)
    await p.evaluate(clickText(/^Edit$/))
    await sleep(500)
  }
  await sleep(1000)
  const after = report("editor", "preview x5", await measure(p, cdp, layersRef))

  /* Idle: nothing should grow on its own. */
  for (let i = 0; i < 5; i++) {
    await sleep(2000)
    step(`idle heap ${((await cdp.send("Performance.getMetrics")).metrics.find((x) => x.name === "JSHeapUsedSize").value / 1048576).toFixed(1)}MB`)
  }
  const idle = report("editor", "idle 10s", await measure(p, cdp, layersRef))

  /* Out to /app and back, ten times. */
  for (let i = 0; i < 10; i++) {
    await p.evaluate(() => window.__probeMount(false))
    await sleep(300)
    await p.evaluate(() => window.__probeMount(true))
    await sleep(1500)
    step(`exit/enter ${i}`)
  }
  await sleep(1500)
  const back = report("editor", "exit/enter x10", await measure(p, cdp, layersRef))
  await p.evaluate(() => window.__probeMount(false))
  await sleep(2500)
  const left = report("editor", "left the editor", await measure(p, cdp, layersRef))

  const b = BUDGET.editor
  for (const [label, m] of [["after the session", after], ["after exit/enter", back]]) {
    over(`editor heap ${label} (MB)`, m.heapMB, b.heapMB)
    over(`editor DOM nodes ${label}`, m.nodes, b.nodes)
    over(`editor detached nodes ${label}`, m.detached, b.detached)
    over(`editor <img> alive ${label}`, m.imgs, b.imgs)
    over(`editor decoded pixels ${label} (MB)`, m.decodedMB, b.decodedMB)
    over(`editor frames ${label}`, m.frames, b.frames)
    over(`editor videos ${label}`, m.videos, b.videos)
    over(`editor composited layers ${label}`, m.layers, b.layers)
  }
  over("editor heap growth over the session (MB)", +(back.heapMB - first.heapMB).toFixed(1), b.growMB)
  over("editor heap growth idle (MB)", +(idle.heapMB - after.heapMB).toFixed(1), 2)
  over("heap left behind by the editor, over the page as first opened (MB)", +(left.heapMB - first.heapMB).toFixed(1), BUDGET.left.heapOverMB)
  over("DOM nodes left behind by the editor", left.nodes, BUDGET.left.nodesOver)
  over("<img> left alive by the editor", left.imgs, 0)
  over("frames left behind by the editor", left.frames, BUDGET.left.frames)
  over("videos left behind by the editor", left.videos, BUDGET.left.videos)
  if (errors.length) problems.push(`page errors: ${errors.slice(0, 3).join(" | ")}`)
  await p.close()
}

/* ── the published page ──────────────────────────────────────────────────── */
if (PARTS.includes("live")) {
  for (const [w, h, touch, key] of [[390, 844, true, "live390"], [1440, 900, false, "live1440"]]) {
    for (const wallpaper of ["video", "image"]) {
      console.log(`\nTHE LIVE PAGE, ${w}x${h}, ${wallpaper} wallpaper`)
      const { p, cdp, layersRef } = await phone(w, h, touch)
      await p.goto(`${base}/app/onepage?live&wallpaper=${wallpaper}`, { waitUntil: "load" })
      await sleep(4000)
      await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)) } scrollTo(0, 0) })
      await sleep(1500)
      if (process.env.SHOTS) await p.screenshot({ path: join(process.env.SHOTS, `live-${w}-${wallpaper}.png`), fullPage: true })
      const m = report(key, `${wallpaper} wallpaper`, await measure(p, cdp, layersRef))
      const b = BUDGET[key]
      over(`${key} (${wallpaper}) videos`, m.videos, wallpaper === "video" ? b.videos : 0)
      over(`${key} (${wallpaper}) frames`, m.frames, b.frames)
      over(`${key} (${wallpaper}) DOM nodes`, m.nodes, b.nodes)
      over(`${key} (${wallpaper}) decoded pictures (MB)`, m.decodedMB, b.decodedMB)
      await p.close()
    }
  }
}

await browser.close()
server.close()
const out = process.env.OUT
if (out) writeFileSync(out, JSON.stringify(rows, null, 2))
if (problems.length && !process.env.NO_BUDGET) fail(`MEMORY BUDGETS BROKEN:\n  ${problems.join("\n  ")}`)
console.log(problems.length ? `\n(over budget, not failing: ${problems.join("; ")})` : "\nAll memory budgets held.")
