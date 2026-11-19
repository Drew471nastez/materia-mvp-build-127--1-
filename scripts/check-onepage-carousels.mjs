/**
 * ===========================================================================
 *  EVERY ROW THAT SLIDES SIDEWAYS, MEASURED (round 19)
 * ===========================================================================
 * The owner, from a recording of the live OnePage: swiping the product cards
 * "jumps between slides" and the content shifts; the next card is sliced at a
 * hard edge; the arrows are blank white circles; product cards in a carousel
 * still show a grey padded picture. This probe draws the real PublicOnePage
 * (scripts/render-onepage-carousels.tsx: a group of picture links, a group of
 * product cards, a shelf of products, Instagram posts) with the page's own
 * cover trim in <head>, on a dark, a light, an image and a gradient page, at
 * 390x844 with touch and at 1280x900 with a mouse, and measures each row:
 *
 *   edges     whether the row's two sides are faded, from pixels: the side
 *             screenshotted with and without the row's mask (0 is no fade).
 *             Wanted: faded where more content is that way, not where none is.
 *   swipe     a finger's fling (Chrome's own touch scroll with momentum) or a
 *             mouse drag, CPU slowed 4x, sampled every frame: the frames over
 *             25ms, React commits, whether the row moves back once the finger
 *             is up (a snap that jolts), how far it overshoots its resting
 *             point, whether it rests on a slide, and whether anything around
 *             it moves (the row's height, the dots, the block under it).
 *   images    the row's height when its pictures arrive late (300ms) against
 *             its height once they are in: a shift when they load.
 *   arrows    on a computer, the arrow's icon against its own button, from a
 *             screenshot (contrast ratio; 1 is an empty circle).
 *   bars      every product picture in a row: the share of its side columns
 *             that is the editor's light grey padding (0 is no bar).
 *   reduced   with reduced motion: an arrow press lands in one frame, and a
 *             swipe still moves the row.
 *
 *   CHROMIUM=/opt/pw-browsers/chromium/chrome-linux/chrome PROBE_CSS=source node scripts/check-onepage-carousels.mjs
 *   REPORT=1 prints without failing; THEMES=dark,light; MODES=phone,desktop
 */
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const report = !!process.env.REPORT
const THEMES = (process.env.THEMES || "dark,light,image,gradient").split(",")
const MODES = (process.env.MODES || "phone,desktop").split(",")
const findChrome = () => {
  if (process.env.CHROMIUM) return process.env.CHROMIUM
  for (const d of ["/opt/pw-browsers/chromium", ...readdirSync("/opt/pw-browsers").filter((n) => /^chromium-\d+$/.test(n)).map((n) => `/opt/pw-browsers/${n}`)]) {
    for (const sub of ["chrome-linux/chrome", "chrome-linux64/chrome"]) if (existsSync(join(d, sub))) return join(d, sub)
  }
  return "/tmp/chromium"
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ── the files ───────────────────────────────────────────────────────────── */
const dir = join(process.cwd(), `.carousel-probe-${process.pid}`)
mkdirSync(dir, { recursive: true })
const photo = (a, b, w = 1200, h = 900) =>
  sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>` +
    Array.from({ length: 9 }, (_, i) => `<circle cx="${(i * w) / 8}" cy="${h / 2 + Math.sin(i) * h * 0.3}" r="${h / 9}" fill="${i % 2 ? a : b}" opacity="0.7"/>`).join("") + `</svg>`)).jpeg({ quality: 88 }).toBuffer()
const photos = [["#3a2f1f", "#c26a2b"], ["#14324a", "#4fa3c7"], ["#2b2b2b", "#8a8f99"], ["#4a1530", "#d0457a"]]
for (const [i, [a, b]] of photos.entries()) writeFileSync(join(dir, `photo-${i}.jpg`), await photo(a, b))
/* A portrait cover, and the product editor's 1280x720 copy of it on its light grey ground (scripts/check-product-cover-ratio.mjs). */
const W = 1080
const H = 1350
const cover = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#7f2450"/>` +
  Array.from({ length: 14 }, (_, i) => `<rect x="0" y="${(i * H) / 14}" width="${W}" height="${H / 56}" fill="#b8336a"/>`).join("") + `</svg>`)).jpeg({ quality: 92 }).toBuffer()
const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><defs><linearGradient id="g" x1="0" y1="0" x2="1280" y2="720" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#f8f8f8"/><stop offset="0.5" stop-color="#f0f0f0"/><stop offset="1" stop-color="#e8e8e8"/></linearGradient></defs><rect width="1280" height="720" fill="url(#g)"/></svg>`)
const drawW = Math.round(720 * (W / H))
const padded = await sharp(bg).composite([{ input: await sharp(cover).resize(drawW, 720).toBuffer(), left: Math.round((1280 - drawW) / 2), top: 0 }]).jpeg({ quality: 92 }).toBuffer()
writeFileSync(join(dir, "1767225600000_original_cover.jpg"), cover)
writeFileSync(join(dir, "1767225600000_cover_processed.jpg"), padded)

execFileSync("pnpm", ["exec", "esbuild", "lib/images/cover-trim.ts", "--bundle", "--format=esm", "--platform=neutral", "--log-level=error", `--outfile=${join(dir, "cover-trim.mjs")}`], { stdio: ["ignore", "ignore", "inherit"] })
const { COVER_TRIM_SCRIPT } = await import(pathToFileURL(join(dir, "cover-trim.mjs")).href)

const { base, server } = await serveEditorProbe({ entry: "scripts/render-onepage-carousels.tsx", statics: { "/__files/": dir }, head: `<script>${COVER_TRIM_SCRIPT}</script>`, throttle: { latency: 300, bytesPerSecond: 4_000_000 } })
const browser = await puppeteer.launch({ executablePath: findChrome(), args: ["--no-sandbox", "--enable-smooth-scrolling"] })
const failures = []
const out = []
const fail = (m) => failures.push(m)

/* ── in the page ─────────────────────────────────────────────────────────── */
const PAGE_HELPERS = () => {
  window.__rails = () =>
    [...document.querySelectorAll(".op-rail")].filter((el) => el.getClientRects().length > 0 && el.offsetParent !== null && el.scrollWidth > el.clientWidth + 2).map((el) => {
      const name = el.closest("[data-onepage-shelf]") ? "shelf" : el.closest("[data-onepage-posts]") ? "posts" : el.querySelector("[data-product-block]") ? "group products" : el.matches("[data-group-carousel]") ? "group links" : "row"
      return { el, name }
    })
  window.__snapPoints = (row) => {
    const left = row.getBoundingClientRect().left - row.scrollLeft
    const pad = parseFloat(getComputedStyle(row).scrollPaddingLeft) || 0
    const max = row.scrollWidth - row.clientWidth
    const pts = new Set()
    row.querySelectorAll("*").forEach((el) => {
      if (el.parentElement !== row && el.parentElement?.parentElement !== row) return
      const a = getComputedStyle(el).scrollSnapAlign
      if (!a || a === "none") return
      pts.add(Math.max(0, Math.min(max, Math.round(el.getBoundingClientRect().left - left - pad))))
    })
    return [...pts].sort((x, y) => x - y)
  }
  /* What is around a row that must not move while it slides: its own box, the dots, the block under it. */
  window.__around = (row) => {
    const block = row.closest("[data-block-id],[data-onepage-shelf],[data-onepage-posts]") || row.parentElement
    const next = block?.parentElement?.nextElementSibling || block?.nextElementSibling
    const dots = row.parentElement?.querySelector(":scope > div:last-child button")?.parentElement || null
    const r = row.getBoundingClientRect()
    const slides = [...row.querySelectorAll("*")].filter((el) => getComputedStyle(el).scrollSnapAlign !== "none" && (el.parentElement === row || el.parentElement?.parentElement === row))
    return {
      rowH: Math.round(r.height * 10) / 10,
      nextY: next ? Math.round((next.getBoundingClientRect().top - r.top) * 10) / 10 : 0,
      dotsW: dots ? Math.round(dots.getBoundingClientRect().width * 10) / 10 : 0,
      dotsX: dots ? Math.round((dots.getBoundingClientRect().left) * 10) / 10 : 0,
      slideH: slides.map((s) => Math.round(s.getBoundingClientRect().height)).join(","),
    }
  }
  window.__record = (row, ms) =>
    new Promise((resolve) => {
      const frames = []
      const t0 = performance.now()
      const commits0 = window.__commits || 0
      let shifts = 0
      const po = typeof PerformanceObserver === "function" ? new PerformanceObserver((l) => l.getEntries().forEach((e) => (shifts += e.value))) : null
      try { po?.observe({ type: "layout-shift", buffered: false }) } catch {}
      const step = (t) => {
        frames.push({ t: t - t0, x: row.scrollLeft, ...window.__around(row) })
        if (t - t0 < ms) requestAnimationFrame(step)
        else { po?.disconnect(); resolve({ frames, commits: (window.__commits || 0) - commits0, shifts }) }
      }
      requestAnimationFrame(step)
    })
}

/* The share of a strip's pixels that differ with and without the row's mask: how faded that side is. */
async function stripDiff(page, rail, side) {
  const rect = await page.evaluate((i, side) => {
    const el = window.__rails()[i].el
    const r = el.getBoundingClientRect()
    const slide = [...el.querySelectorAll("*")].find((c) => getComputedStyle(c).scrollSnapAlign !== "none")
    const s = slide?.getBoundingClientRect()
    const top = Math.max(r.top, s ? s.top : r.top, 0)
    const bottom = Math.min(r.bottom, s ? s.bottom : r.bottom, innerHeight)
    const x = side === "start" ? Math.max(0, r.left) : Math.min(innerWidth, r.right) - 8
    /* A screenshot's clip is in the page's coordinates, not the window's. */
    return { x: x + scrollX, y: top + 4 + scrollY, width: 8, height: Math.max(4, bottom - top - 8) }
  }, rail, side)
  const shot = async (k) => {
    const png = await page.screenshot({ clip: process.env.SHOTS ? { ...rect, x: rect.x - (side === "start" ? 0 : 120), width: 128 } : rect, captureBeyondViewport: false })
    if (process.env.SHOTS) { mkdirSync(process.env.SHOTS, { recursive: true }); writeFileSync(join(process.env.SHOTS, `edge-${rail}-${side}-${k}-${Date.now()}.png`), png) }
    const crop = process.env.SHOTS ? await sharp(png).extract({ left: side === "start" ? 0 : 120, top: 0, width: rect.width, height: Math.floor(rect.height) }).png().toBuffer() : png
    return sharp(crop).raw().toBuffer()
  }
  const a = await shot("a")
  await page.evaluate((i) => { const el = window.__rails()[i].el; el.style.setProperty("mask-image", "none", "important"); el.style.setProperty("-webkit-mask-image", "none", "important") }, rail)
  await sleep(60)
  const b = await shot("b")
  await page.evaluate((i) => { const el = window.__rails()[i].el; el.style.removeProperty("mask-image"); el.style.removeProperty("-webkit-mask-image") }, rail)
  let d = 0
  for (let k = 0; k < a.length; k++) d += Math.abs(a[k] - b[k])
  return Math.round((d / a.length) * 10) / 10
}

async function sideBars(page, rect) {
  if (!rect || rect.width < 8 || rect.height < 8) return null
  const png = await page.screenshot({ clip: rect, captureBeyondViewport: false })
  if (process.env.SHOTS) { mkdirSync(process.env.SHOTS, { recursive: true }); writeFileSync(join(process.env.SHOTS, `bars-${Date.now()}.png`), png) }
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
  const inset = Math.max(3, Math.round(info.width * 0.04))
  let bar = 0
  let all = 0
  for (let y = Math.round(info.height * 0.2); y < Math.round(info.height * 0.8); y++) {
    for (const x of [inset, info.width - 1 - inset]) {
      const i = (y * info.width + x) * info.channels
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
      all++
      if (Math.min(r, g, b) >= 214 && Math.max(r, g, b) - Math.min(r, g, b) <= 10) bar++
    }
  }
  return Math.round((bar / all) * 1000) / 1000
}

/* The icon against its button: the button's own colour is the most common one, the icon the one furthest from it. */
async function iconContrast(page, rect) {
  const { data, info } = await sharp(await page.screenshot({ clip: rect, captureBeyondViewport: false })).raw().toBuffer({ resolveWithObject: true })
  const lum = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const ls = []
  const cx = info.width / 2
  const cy = info.height / 2
  const rad = Math.min(info.width, info.height) / 2 - 3
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if ((x - cx) ** 2 + (y - cy) ** 2 > rad * rad) continue
    const i = (y * info.width + x) * info.channels
    ls.push(lum(data[i], data[i + 1], data[i + 2]))
  }
  ls.sort((a, b) => a - b)
  const ground = ls[Math.floor(ls.length / 2)]
  const far = Math.abs(ls[0] - ground) > Math.abs(ls[ls.length - 1] - ground) ? ls[0] : ls[ls.length - 1]
  return Math.round(((Math.max(ground, far) + 0.05) / (Math.min(ground, far) + 0.05)) * 100) / 100
}

/* After the finger is up: does the row move back against its own travel, how far past its resting point does it go. */
function analyse(frames, liftAt, points) {
  const after = frames.filter((f) => f.t >= liftAt)
  const xs = after.map((f) => f.x)
  const final = xs[xs.length - 1]
  const dir = Math.sign(final - frames[0].x) || 1
  let reversals = 0
  let back = 0
  for (let i = 1; i < xs.length; i++) {
    const d = (xs[i] - xs[i - 1]) * dir
    if (d < -0.75) { reversals++; back += -d }
  }
  const peak = dir > 0 ? Math.max(...xs) : Math.min(...xs)
  const overshoot = Math.round(Math.abs(peak - final) * 10) / 10
  const settleAt = (() => { for (let i = after.length - 1; i > 0; i--) if (Math.abs(after[i].x - after[i - 1].x) > 0.5) return Math.round(after[i].t - liftAt); return 0 })()
  const offSnap = points.length ? Math.round(Math.min(...points.map((p) => Math.abs(p - final))) * 10) / 10 : 0
  const gaps = frames.slice(1).map((f, i) => f.t - frames[i].t)
  const long = gaps.filter((g) => g > 25).length
  const keys = ["rowH", "nextY", "dotsW", "dotsX", "slideH"]
  const moved = keys.filter((k) => new Set(frames.map((f) => f[k])).size > 1)
  return { travel: Math.round(final - frames[0].x), reversals, back: Math.round(back), overshoot, settleMs: settleAt, offSnap, frames: frames.length, over25ms: long, worstMs: Math.round(Math.max(...gaps)), moved: moved.join(",") || "nothing" }
}

async function openPage(mode, theme, { reduce = false } = {}) {
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))
  const phone = mode === "phone"
  await page.setViewport({ width: phone ? 390 : 1280, height: phone ? 844 : 900, isMobile: phone, hasTouch: phone, deviceScaleFactor: 1 })
  if (reduce) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  await page.evaluateOnNewDocument(() => {
    const at = (f) => `${location.origin}/__files/${f}`
    window.PROBE_FILES = { photos: [0, 1, 2, 3].map((i) => at(`photo-${i}.jpg`)), padded: at("1767225600000_cover_processed.jpg"), original: at("1767225600000_original_cover.jpg") }
  })
  await page.evaluateOnNewDocument(PAGE_HELPERS)
  await page.goto(`${base}/app/probe?theme=${theme}`)
  await page.waitForFunction(() => window.__rails().length >= 3, { timeout: 15000 }).catch(() => null)
  /* Heights now, before the pictures (300ms late), and once they are in. */
  const early = await page.evaluate(() => window.__rails().map((r) => Math.round(r.el.getBoundingClientRect().height)))
  await page.waitForFunction(() => [...document.images].every((i) => i.complete) && [...document.images].every((i) => !/_processed\./.test(i.currentSrc || i.src) || ["keep", "none", "framed"].includes(i.getAttribute("data-cover-trim") || "")), { timeout: 15000 }).catch(() => null)
  await sleep(500)
  const late = await page.evaluate(() => window.__rails().map((r) => Math.round(r.el.getBoundingClientRect().height)))
  const cdp = await page.createCDPSession()
  return { page, cdp, errors, early, late }
}

/* A finger: down, 170px to the left over ~130ms (a quick flick), up; the browser's own scroll, momentum and snap do the rest. */
async function fingerSwipe(cdp, c) {
  const x = Math.round(c.x + 80)
  const y = Math.round(c.y)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] })
  for (let k = 1; k <= 8; k++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - k * 21, y }] }); await sleep(16) }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
}

const centre = (page, i) => page.evaluate((i) => {
  const el = window.__rails()[i].el
  el.scrollIntoView({ block: "center", behavior: "instant" })
  el.scrollLeft = 0
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right }
}, i)

try {
  for (const mode of MODES) {
    for (const theme of THEMES) {
      const { page, cdp, errors, early, late } = await openPage(mode, theme)
      const rails = await page.evaluate(() => window.__rails().map((r) => r.name))
      for (const [i, name] of rails.entries()) {
        const tag = `${mode} ${theme} ${name}`
        const row = { tag }
        row.imageShift = (late[i] ?? 0) - (early[i] ?? 0)
        if (Math.abs(row.imageShift) > 1) fail(`${tag}: the row's height moved ${row.imageShift}px as its pictures loaded`)

        /* Edges at the start, in the middle and at the end. */
        await centre(page, i)
        await sleep(350)
        const edges = {}
        for (const at of ["start", "middle", "end"]) {
          await page.evaluate((i, at) => { const el = window.__rails()[i].el; const max = el.scrollWidth - el.clientWidth; el.style.scrollSnapType = "none"; el.scrollLeft = at === "start" ? 0 : at === "end" ? max : Math.round(max / 2) }, i, at)
          await sleep(350)
          edges[at] = [await stripDiff(page, i, "start"), await stripDiff(page, i, "end")]
          await page.evaluate((i) => { window.__rails()[i].el.style.scrollSnapType = "" }, i)
        }
        row.edges = `start ${edges.start.join("/")}  middle ${edges.middle.join("/")}  end ${edges.end.join("/")}`
        const faded = (v) => v > 4
        if (faded(edges.start[0])) fail(`${tag}: faded on the left with nothing to its left (${edges.start[0]})`)
        if (!faded(edges.start[1])) fail(`${tag}: a hard right edge with more to the right (${edges.start[1]})`)
        if (!faded(edges.middle[0]) || !faded(edges.middle[1])) fail(`${tag}: in the middle, an edge is hard (${edges.middle.join("/")})`)
        if (!faded(edges.end[0])) fail(`${tag}: at the end, a hard left edge (${edges.end[0]})`)
        if (faded(edges.end[1])) fail(`${tag}: at the end, faded on the right with nothing more (${edges.end[1]})`)

        /* The swipe, CPU 4x. */
        const c = await centre(page, i)
        await sleep(400)
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
        const points = await page.evaluate((i) => window.__snapPoints(window.__rails()[i].el), i)
        const recording = page.evaluate((i) => window.__record(window.__rails()[i].el, 2600), i)
        await sleep(50)
        const t0 = Date.now()
        if (mode === "phone") {
          await fingerSwipe(cdp, c)
        } else {
          await page.mouse.move(c.x + 120, c.y)
          await page.mouse.down()
          for (let k = 1; k <= 12; k++) { await page.mouse.move(c.x + 120 - k * 16, c.y); await sleep(16) }
          await page.mouse.up()
        }
        const liftAt = Date.now() - t0 + 50
        const rec = await recording
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
        const a = analyse(rec.frames, liftAt, points)
        row.swipe = { ...a, commits: rec.commits, cls: Math.round(rec.shifts * 1000) / 1000 }
        if (a.travel <= 0) fail(`${tag}: the swipe did not move the row`)
        if (a.back > 2) fail(`${tag}: after the finger is up the row moved back ${a.back}px (${a.reversals} frames)`)
        if (a.offSnap > 2) fail(`${tag}: the row rests ${a.offSnap}px off a slide`)
        if (a.moved !== "nothing") fail(`${tag}: while it slid, ${a.moved} moved`)

        /*
          A trackpad on a computer (the owner's recording): two fingers sideways, then the pad's own momentum, a
          wheel event every frame whose delta fades out over half a second, still arriving after the fingers lift.
        */
        if (mode === "desktop") {
          const w = await centre(page, i)
          await sleep(400)
          await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
          const wrec = page.evaluate((i) => window.__record(window.__rails()[i].el, 2600), i)
          await sleep(50)
          const w0 = Date.now()
          await page.mouse.move(w.x, w.y)
          const deltas = [6, 14, 22, 28, 30, 28, 24, 20, 16, 13, 10, 8, 6, 5, 4, 3, 2, 2, 1, 1, 1]
          let lift = 0
          for (const [k, d] of deltas.entries()) {
            await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: w.x, y: w.y, deltaX: d, deltaY: 0 })
            if (k === 6) lift = Date.now() - w0 + 50
            await sleep(16)
          }
          const wr = await wrec
          await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
          const b = analyse(wr.frames, lift, points)
          row.trackpad = { ...b, commits: wr.commits }
          if (b.travel <= 0) fail(`${tag}: the trackpad did not move the row`)
          if (b.back > 2) fail(`${tag}: under the trackpad the row moved back ${b.back}px (${b.reversals} frames)`)
          if (b.offSnap > 2) fail(`${tag}: after the trackpad the row rests ${b.offSnap}px off a slide`)
        }

        /* Product pictures: no grey bars. */
        const pics = await page.evaluate((i) => window.__rails()[i].el.querySelectorAll("[data-product-block] [data-framed-picture], [data-product-block] img[data-picture-fit=full], [data-shelf-arrange] img").length, i)
        if (pics) {
          const shares = []
          for (let k = 0; k < pics; k++) {
            const rect = await page.evaluate((i, k) => {
              const row = window.__rails()[i].el
              const el = row.querySelectorAll("[data-product-block] [data-framed-picture], [data-product-block] img[data-picture-fit=full], [data-shelf-arrange] img")[k]
              const slide = [...row.children, ...[...row.children].flatMap((c) => [...c.children])].find((s) => s.contains(el))
              row.style.scrollSnapType = "none"
              /* The soft edge is measured above; here the picture itself, with the row's fade off. */
              row.style.setProperty("mask-image", "none", "important")
              row.style.setProperty("-webkit-mask-image", "none", "important")
              row.scrollLeft = Math.max(0, slide.offsetLeft - (row.clientWidth - slide.offsetWidth) / 2)
              const r = el.getBoundingClientRect()
              const rr = row.getBoundingClientRect()
              const x = Math.max(r.left, rr.left)
              const right = Math.min(r.right, rr.right)
              return right - x > 20 ? { x: x + scrollX, y: r.top + scrollY, width: right - x, height: r.height } : null
            }, i, k)
            await sleep(120)
            shares.push(await sideBars(page, rect))
          }
          await page.evaluate((i) => { const row = window.__rails()[i].el; row.style.scrollSnapType = ""; row.style.removeProperty("mask-image"); row.style.removeProperty("-webkit-mask-image"); row.scrollLeft = 0 }, i)
          row.bars = shares.join(",")
          shares.forEach((s, k) => { if (s !== null && s >= 0.05) fail(`${tag}: product picture ${k + 1} shows grey bars (${s})`) })
        }

        /* Arrows, on a computer. */
        if (mode === "desktop" && name.startsWith("group")) {
          const cc = await centre(page, i)
          await page.evaluate((i) => { const el = window.__rails()[i].el; el.scrollLeft = Math.round((el.scrollWidth - el.clientWidth) / 2) }, i)
          await page.mouse.move(cc.x, cc.y)
          await sleep(500)
          const arrows = await page.evaluate((i) => {
            const host = window.__rails()[i].el.parentElement
            return [...host.querySelectorAll(":scope > button")].filter((b) => b.querySelector("svg") && parseFloat(getComputedStyle(b).opacity) > 0.5).map((b) => { const r = b.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height } })
          }, i)
          row.arrows = []
          for (const r of arrows) row.arrows.push(await iconContrast(page, r))
          if (arrows.length === 0) fail(`${tag}: no arrow shows on hover`)
          row.arrows.forEach((v) => { if (v < 3) fail(`${tag}: an arrow's icon has contrast ${v} against its button`) })
          await page.mouse.move(5, 5)
        }
        out.push(row)
      }
      if (errors.length) fail(`${mode} ${theme}: page errors ${errors.join(" | ")}`)
      await page.close()
    }
  }

  /* Reduced motion: an arrow press lands in a frame or two; a finger still moves the row. */
  for (const mode of MODES) {
    const { page, cdp } = await openPage(mode, "dark", { reduce: true })
    const rails = await page.evaluate(() => window.__rails().map((r) => r.name))
    const i = rails.indexOf("group products")
    const c = await centre(page, i)
    await sleep(300)
    const row = { tag: `${mode} reduced motion group products` }
    if (mode === "desktop") {
      await page.mouse.move(c.x, c.y)
      await sleep(500)
      /* The press from inside a frame, so the row's place before it is known (a jump lands before the next frame). */
      const r = await page.evaluate((i) => new Promise((resolve) => requestAnimationFrame(() => {
        const row = window.__rails()[i].el
        const x0 = row.scrollLeft
        const rec = window.__record(row, 900)
        ;[...row.parentElement.querySelectorAll(":scope > button")].at(-1)?.click()
        rec.then((out) => resolve({ ...out, frames: [{ t: 0, x: x0 }, ...out.frames] }))
      })), i)
      const xs = r.frames.map((f) => f.x)
      const final = xs[xs.length - 1]
      const between = xs.filter((x) => x !== xs[0] && Math.abs(x - final) > 1).length
      row.arrowPress = { travel: Math.round(final - xs[0]), framesInBetween: between }
      if (final - xs[0] < 20) fail(`${row.tag}: the arrow did not move the row`)
      if (between > 1) fail(`${row.tag}: the arrow glided over ${between} frames under reduced motion`)
    }
    const rec = page.evaluate((i) => window.__record(window.__rails()[i].el, 1500), i)
    if (mode === "phone") await fingerSwipe(cdp, c)
    else { await page.mouse.move(c.x + 120, c.y); await page.mouse.down(); for (let k = 1; k <= 12; k++) { await page.mouse.move(c.x + 120 - k * 16, c.y); await sleep(16) } await page.mouse.up() }
    const r = await rec
    row.swipeTravel = Math.round(r.frames[r.frames.length - 1].x - r.frames[0].x)
    if (row.swipeTravel <= 0) fail(`${row.tag}: a swipe did not move the row`)
    const behaviour = await page.evaluate((i) => getComputedStyle(window.__rails()[i].el).scrollBehavior, i)
    row.scrollBehavior = behaviour
    out.push(row)
    await page.close()
  }
} finally {
  await browser.close()
  server.close()
  rmSync(dir, { recursive: true, force: true })
}

for (const r of out) {
  console.log(`\n${r.tag}`)
  for (const [k, v] of Object.entries(r)) if (k !== "tag") console.log(`  ${k.padEnd(12)} ${typeof v === "object" ? JSON.stringify(v) : v}`)
}
if (failures.length) {
  console.log(`\n${failures.length} failures\n` + failures.map((f) => "FAIL  " + f).join("\n"))
  if (!report) process.exit(1)
} else console.log("\nevery row as wanted")
