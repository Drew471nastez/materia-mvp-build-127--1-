/**
 * NO GREY BARS OUTSIDE EXPLORE, MEASURED (round AL).
 *
 * The owner: a portrait cover (4:5) shows with grey bars around it in places where it should not. Only Explore keeps
 * the product editor's 16:9 copy with its padding. This probe serves that pair of files, made as the editor makes them
 * (a 1080x1350 cover; its 1280x720 copy on a light grey gradient, named `<ms>_<name>_processed.jpg`), and draws the
 * real components (scripts/render-product-cover-ratio.tsx) with the page's own trim in <head> (lib/images/cover-trim,
 * as app/(storelib)/layout.tsx and app/(site)/layout.tsx write it):
 *
 *   editor          Photos and video: the cover tile (its original) and a gallery tile (padded only)
 *   store           the store grid's card, with the original and with only the padded copy
 *   site            a theme's 16:9 card (object-fit: cover) with the original and with only the padded copy, and a
 *                   picture in its own shape (width 100%, height auto)
 *   onepage         the product block and its sheet's first two slides, for a product with only padded copies
 *   explore         an Explore card: the padded copy, bars and all
 *
 * For each frame, the share of its left and right edge pixels that are the editor's light grey padding, from a
 * screenshot (0 is no bar). Outside Explore every share must be under 0.05; Explore's must be over 0.8. The picture
 * in its own shape must be about 4:5.
 *
 *   CHROMIUM=/opt/pw-browsers/chromium/chrome-linux/chrome node scripts/check-product-cover-ratio.mjs
 *   REPORT=1 prints the numbers without failing; NO_TRIM=1 REPORT=1 measures the pages without the trim.
 */
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const report = !!process.env.REPORT
const findChrome = () => {
  if (process.env.CHROMIUM) return process.env.CHROMIUM
  for (const d of ["/opt/pw-browsers/chromium", ...readdirSync("/opt/pw-browsers").filter((n) => /^chromium-\d+$/.test(n)).map((n) => `/opt/pw-browsers/${n}`)]) {
    for (const sub of ["chrome-linux/chrome", "chrome-linux64/chrome"]) if (existsSync(join(d, sub))) return join(d, sub)
  }
  return "/tmp/chromium"
}

/* The files, as the product editor makes them. */
const dir = join(process.cwd(), `.cover-probe-${process.pid}`)
mkdirSync(dir, { recursive: true })
const W = 1080
const H = 1350
/* A saturated cover with stripes and a white title band in the middle: no edge of it is ever a flat light grey. */
const coverSvg = (fill, stripe) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="${fill}"/>` +
  Array.from({ length: 14 }, (_, i) => `<rect x="0" y="${(i * H) / 14}" width="${W}" height="${H / 56}" fill="${stripe}"/>`).join("") +
  `<rect x="${W * 0.2}" y="${H * 0.45}" width="${W * 0.6}" height="${H * 0.1}" fill="#ffffff"/></svg>`
const original = await sharp(Buffer.from(coverSvg("#7f2450", "#b8336a"))).jpeg({ quality: 92 }).toBuffer()
const second = await sharp(Buffer.from(coverSvg("#1f4f7a", "#2f78b5"))).jpeg({ quality: 92 }).toBuffer()
/* processImageToWidescreen: 1280x720, the gradient #f8f8f8 > #f0f0f0 > #e8e8e8 corner to corner, the cover fit by height in the middle. */
const padded = async (cover) => {
  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><defs><linearGradient id="g" x1="0" y1="0" x2="1280" y2="720" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#f8f8f8"/><stop offset="0.5" stop-color="#f0f0f0"/><stop offset="1" stop-color="#e8e8e8"/></linearGradient></defs><rect width="1280" height="720" fill="url(#g)"/></svg>`,
  )
  const drawW = Math.round(720 * (W / H))
  const inner = await sharp(cover).resize(drawW, 720).toBuffer()
  return sharp(bg).composite([{ input: inner, left: Math.round((1280 - drawW) / 2), top: 0 }]).jpeg({ quality: 92 }).toBuffer()
}
writeFileSync(join(dir, "1767225600000_original_cover.jpg"), original)
writeFileSync(join(dir, "1767225600000_cover_processed.jpg"), await padded(original))
writeFileSync(join(dir, "1767225600001_second_processed.jpg"), await padded(second))

/* The trim exactly as the layouts write it. */
execFileSync("pnpm", ["exec", "esbuild", "lib/images/cover-trim.ts", "--bundle", "--format=esm", "--platform=neutral", "--log-level=error", `--outfile=${join(dir, "cover-trim.mjs")}`], { stdio: ["ignore", "ignore", "inherit"] })
const { COVER_TRIM_SCRIPT } = await import(pathToFileURL(join(dir, "cover-trim.mjs")).href)

const { base, server } = await serveEditorProbe({ entry: "scripts/render-product-cover-ratio.tsx", statics: { "/__cover/": dir }, /* NO_TRIM=1 leaves the trim out, to see what the bars measure without it (REPORT=1 with it). */
  head: process.env.NO_TRIM ? "" : `<script>${COVER_TRIM_SCRIPT}</script>` })
const browser = await puppeteer.launch({ executablePath: findChrome(), args: ["--no-sandbox"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const rows = []

/* Left and right edge columns of a frame on screen: the share that is the padding's light, colourless grey. */
async function sideBars(page, rect) {
  if (!rect || rect.width < 8 || rect.height < 8) return null
  /* The frame as it is on screen now (viewport coordinates), cut out of a screenshot of the screen. */
  const png = await page.screenshot({ clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, encoding: "base64" })
  if (process.env.SHOTS) {
    mkdirSync(process.env.SHOTS, { recursive: true })
    writeFileSync(join(process.env.SHOTS, `${Math.round(rect.x)}-${Math.round(rect.y)}-${Date.now()}.png`), Buffer.from(png, "base64"))
  }
  return page.evaluate(async (data) => {
    const img = new Image()
    img.src = "data:image/png;base64," + data
    await img.decode()
    const c = document.createElement("canvas")
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const ctx = c.getContext("2d")
    ctx.drawImage(img, 0, 0)
    const px = ctx.getImageData(0, 0, c.width, c.height).data
    const inset = Math.max(3, Math.round(c.width * 0.04))
    let bar = 0
    let all = 0
    /* The middle 60% of each side: clear of a badge, a number or a rounded corner. */
    for (let y = Math.round(c.height * 0.2); y < Math.round(c.height * 0.8); y++) {
      for (const x of [inset, c.width - 1 - inset]) {
        const i = (y * c.width + x) * 4
        const [r, g, b] = [px[i], px[i + 1], px[i + 2]]
        all++
        if (Math.min(r, g, b) >= 214 && Math.max(r, g, b) - Math.min(r, g, b) <= 10) bar++
      }
    }
    return Math.round((bar / all) * 1000) / 1000
  }, png)
}

const rectOf = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    /* The page is drawn on one tall screen and never scrolled: a rect on screen is a rect in the screenshot. */
    const r = el.getBoundingClientRect()
    return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }
  }, selector)

const settled = (page) =>
  page.waitForFunction(() => [...document.images].every((i) => !/_processed\./.test(i.currentSrc || i.src) || ["keep", "none", "framed"].includes(i.getAttribute("data-cover-trim") || "")) && [...document.images].every((i) => i.complete), { timeout: 15000 }).catch(() => null)

try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage()
    const errors = []
    page.on("pageerror", (e) => errors.push(e.message))
    await page.setViewport({ width, height: 2600, isMobile: width < 640, hasTouch: width < 640 })
    await page.evaluateOnNewDocument(() => {
      const at = (f) => `${location.origin}/__cover/${f}`
      window.PROBE_COVER = { original: at("1767225600000_original_cover.jpg"), padded: at("1767225600000_cover_processed.jpg"), padded2: at("1767225600001_second_processed.jpg") }
    })
    await page.goto(`${base}/app/probe?view=places`)
    await page.waitForSelector("[data-probe=explore] img")
    await settled(page)
    await sleep(400)
    const frames = {
      "editor tile 1 (original)": "[data-probe=editor] [data-media-tile]",
      "editor tile 2 (padded only)": "[data-probe=editor] [data-media-id=b] [data-media-tile]",
      "store card (original)": "[data-probe=store-original] a[href]",
      "store card (padded only)": "[data-probe=store-padded] a[href]",
      "site 16:9 card (original)": "[data-probe=site-wide]",
      "site 16:9 card (padded only)": "[data-probe=site-wide-padded]",
      "site own shape (padded only)": "[data-probe=site-natural] img",
      "explore card": "[data-probe=explore] a[href]",
    }
    for (const [name, sel] of Object.entries(frames)) {
      /* The card's picture is its first link (the 16:9 box); the others are the frame itself. */
      const rect = await rectOf(page, sel)
      await sleep(150)
      const again = await rectOf(page, sel)
      const share = await sideBars(page, again ?? rect)
      rows.push({ width, place: name, bars: share })
      const explore = name.startsWith("explore")
      if (share === null) failures.push(`${width}px ${name}: no frame found (${sel})`)
      else if (explore ? !(share > 0.8) : !(share < 0.05)) failures.push(`${width}px ${name}: bar share ${share}, wanted ${explore ? "> 0.8" : "< 0.05"}`)
    }
    const natural = await page.evaluate(() => {
      const img = document.querySelector("[data-probe-natural]")
      return img ? { ratio: Math.round((img.naturalWidth / img.naturalHeight) * 1000) / 1000, shown: Math.round((img.clientWidth / img.clientHeight) * 1000) / 1000, state: img.getAttribute("data-cover-trim") } : null
    })
    rows.push({ width, place: "site own shape: picture ratio (4:5 is 0.8)", bars: natural })
    if (!natural || Math.abs(natural.shown - 0.8) > 0.03) failures.push(`${width}px own shape: shown ratio ${JSON.stringify(natural)}, wanted about 0.8`)
    const states = await page.evaluate(() => [...document.images].filter((i) => /_processed\.|^blob:/.test(i.currentSrc || i.src)).map((i) => i.getAttribute("data-cover-trim")))
    rows.push({ width, place: "trim states of padded pictures", bars: states.join(",") })
    if (errors.length) failures.push(`${width}px page errors: ${errors.join(" | ")}`)
    await page.close()

    /* The OnePage: a block for a product saved before part 377, and its sheet. */
    const op = await browser.newPage()
    const opErrors = []
    op.on("pageerror", (e) => opErrors.push(e.message))
    await op.setViewport({ width, height: 900, isMobile: width < 640, hasTouch: width < 640 })
    await op.evaluateOnNewDocument(() => {
      const at = (f) => `${location.origin}/__cover/${f}`
      window.PROBE_COVER = { original: at("1767225600000_original_cover.jpg"), padded: at("1767225600000_cover_processed.jpg"), padded2: at("1767225600001_second_processed.jpg") }
    })
    await op.goto(`${base}/app/probe?view=onepage`)
    await op.waitForSelector("[data-product-block] [data-framed-picture]")
    await settled(op)
    await sleep(500)
    const blockShare = await sideBars(op, await rectOf(op, "[data-product-block] [data-framed-picture]"))
    rows.push({ width, place: "onepage block", bars: blockShare })
    if (!(blockShare !== null && blockShare < 0.05)) failures.push(`${width}px onepage block: bar share ${blockShare}`)
    await op.evaluate(() => [...document.querySelectorAll("a,button")].find((e) => e.textContent.includes("View guide"))?.click())
    await op.waitForSelector("[data-product-sheet-strip] img", { visible: true }).catch(() => null)
    await op.waitForFunction(() => document.querySelector("[data-product-sheet-strip] img")?.naturalWidth > 0, { timeout: 8000 }).catch(() => null)
    await settled(op)
    await sleep(900)
    const slides = await op.evaluate(() => [...document.querySelectorAll("[data-product-sheet-strip] > *")].slice(0, 2).map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: Math.min(r.width, innerWidth - r.x), height: Math.min(r.height, innerHeight - r.y) } }))
    const s1 = await sideBars(op, slides[0])
    rows.push({ width, place: "onepage sheet slide 1", bars: s1 })
    if (!(s1 !== null && s1 < 0.05)) failures.push(`${width}px onepage sheet slide 1: bar share ${s1}`)
    /* The second slide, brought into view. */
    await op.evaluate(() => { const strip = document.querySelector("[data-product-sheet-strip]"); const second = strip?.children[1]; if (strip && second) strip.scrollLeft = second.offsetLeft })
    await sleep(700)
    const slide2 = await op.evaluate(() => { const el = document.querySelector("[data-product-sheet-strip]")?.children[1]; const r = el?.getBoundingClientRect(); return r ? { x: Math.max(0, r.x), y: r.y, width: Math.min(r.width, innerWidth - Math.max(0, r.x)), height: Math.min(r.height, innerHeight - r.y) } : null })
    const s2 = await sideBars(op, slide2)
    rows.push({ width, place: "onepage sheet slide 2 (gallery photo)", bars: s2 })
    if (!(s2 !== null && s2 < 0.05)) failures.push(`${width}px onepage sheet slide 2: bar share ${s2}`)
    if (opErrors.length) failures.push(`${width}px onepage page errors: ${opErrors.join(" | ")}`)
    await op.close()
  }
} finally {
  await browser.close()
  server.close()
  rmSync(dir, { recursive: true, force: true })
}

for (const r of rows) console.log(`${String(r.width).padStart(5)}px  ${r.place.padEnd(44)} ${typeof r.bars === "object" ? JSON.stringify(r.bars) : r.bars}`)
if (failures.length) {
  console.log("\n" + failures.map((f) => "FAIL  " + f).join("\n"))
  if (!report) process.exit(1)
} else console.log("\nall frames as wanted: no bars outside Explore, Explore's 16:9 copy kept")
