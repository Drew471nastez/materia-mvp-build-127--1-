/**
 * PRODUCT PICTURES, MEASURED (round AL; storelib.com covers whole).
 *
 * The owner's rule: on storelib.com's own commerce pages (Explore, the marketplace, a creator's store on storelib.com,
 * the /p/ product page) a cover shows WHOLE in the 16:9 frame, letterboxed like Explore: the product editor's 16:9 copy
 * with its light grey padding, or the picture contained on that same grey when it has no padded copy. Everywhere else
 * (the OnePage, creator websites and the builder, the editor's tiles) the picture is in its own shape or fills its
 * frame, with no grey bars. This probe serves the files as the editor makes them (a 1080x1350 portrait cover; its
 * 1280x720 copy on a light grey gradient, named `<ms>_<name>_processed.jpg`; a landscape 1600x1000 cover the editor
 * keeps as it is, with no padded copy), and draws the real components (scripts/render-product-cover-ratio.tsx) with
 * the page's own trim in <head> (lib/images/cover-trim, as app/(storelib)/layout.tsx and app/(site)/layout.tsx write it):
 *
 *   editor          Photos and video: the cover tile (its original) and a gallery tile (padded only)       no bars
 *   store           a creator's storelib.com store card: padded copy with an original, padded only, and
 *                   the landscape cover with no padded copy                                                bars, whole
 *   product page    storelib.com's /p/ gallery: the cover, a second gallery photo, the landscape cover,
 *                   and a thumbnail                                                                         bars, whole
 *   site            a theme's 16:9 card (object-fit: cover) with the original, with only the padded copy,
 *                   with the landscape cover, and a picture in its own shape (width 100%, height auto)      no bars
 *   onepage         the product block and its sheet's first two slides, for a product with only padded copies   no bars
 *   explore         an Explore card: the padded copy, bars and all                                         bars, whole
 *
 * For each frame, the share of its left and right edge pixels that are the editor's light grey padding, from a
 * screenshot (0 is no bar): under 0.05 where there must be none, over 0.8 where the picture is letterboxed. Where the
 * picture must be whole, the share of the drawn picture inside its frame (from its natural size, its box and its
 * object-fit) must be at least 0.995. The picture in its own shape must be about 4:5.
 *
 *   CHROMIUM=/opt/pw-browsers/chromium/chrome-linux/chrome node scripts/check-product-cover-ratio.mjs
 *   REPORT=1 prints the numbers without failing; NO_TRIM=1 REPORT=1 measures the pages without the trim.
 */
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
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
/* The landscape cover (1600x1000, 1.6): "already widescreen" to processImageToWidescreen, so stored as it is, with no padded copy. A dark band along its bottom edge, the part object-fit: cover used to cut off. */
const LW = 1600
const LH = 1000
writeFileSync(join(dir, "1767225600002_resume_kit.jpg"), await sharp(Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${LW}" height="${LH}"><rect width="100%" height="100%" fill="#2d5b3c"/>` +
  Array.from({ length: 10 }, (_, i) => `<rect x="${(i * LW) / 10}" y="0" width="${LW / 40}" height="${LH}" fill="#3f7d53"/>`).join("") +
  `<rect x="0" y="${LH * 0.88}" width="${LW}" height="${LH * 0.12}" fill="#13251a"/></svg>`,
)).jpeg({ quality: 92 }).toBuffer())

/* The trim exactly as the layouts write it. */
execFileSync("pnpm", ["exec", "esbuild", "lib/images/cover-trim.ts", "--bundle", "--format=esm", "--platform=neutral", "--log-level=error", `--outfile=${join(dir, "cover-trim.mjs")}`], { stdio: ["ignore", "ignore", "inherit"] })
const { COVER_TRIM_SCRIPT } = await import(pathToFileURL(join(dir, "cover-trim.mjs")).href)

const { base, server } = await serveEditorProbe({ entry: "scripts/render-product-cover-ratio.tsx", statics: { "/__cover/": dir }, imageFill: true, /* NO_TRIM=1 leaves the trim out, to see what the bars measure without it (REPORT=1 with it). */
  /* The product page's gallery is a Swiper strip: its stylesheet (components/product/media-swiper imports swiper/css; the bundle drops CSS) so each slide is the frame's size. */
  head: `<style>${readFileSync(join(process.cwd(), "node_modules/swiper/swiper.css"), "utf8")}</style>` + (process.env.NO_TRIM ? "" : `<script>${COVER_TRIM_SCRIPT}</script>`) })
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

/*
  How much of the picture drawn in a frame is inside it: from each <img>'s natural size, its box, its object-fit and
  object-position, the drawn picture's rectangle, clipped by the frame. The picture in front (the most of it inside
  the frame) is the one measured. 1 is the whole picture; a 16:10 cover filling a 16:9 card shows 0.9 of it.
*/
const wholeShare = (page, selector) =>
  page.evaluate((sel) => {
    const frame = document.querySelector(sel)
    if (!frame) return null
    const f = frame.getBoundingClientRect()
    let best = null
    for (const img of frame.tagName === "IMG" ? [frame] : frame.querySelectorAll("img")) {
      if (!img.naturalWidth || !img.naturalHeight) continue
      const b = img.getBoundingClientRect()
      const cs = getComputedStyle(img)
      const nw = img.naturalWidth
      const nh = img.naturalHeight
      let w = b.width
      let h = b.height
      if (cs.objectFit === "contain" || cs.objectFit === "cover") {
        const k = (cs.objectFit === "contain" ? Math.min : Math.max)(b.width / nw, b.height / nh)
        w = nw * k
        h = nh * k
      } else if (cs.objectFit === "none") { w = nw; h = nh }
      const [px, py] = cs.objectPosition.split(" ").map((v) => (v.endsWith("%") ? parseFloat(v) / 100 : 0.5))
      const x = b.left + (b.width - w) * px
      const y = b.top + (b.height - h) * py
      const ix = Math.max(0, Math.min(x + w, f.right, b.right) - Math.max(x, f.left, b.left))
      const iy = Math.max(0, Math.min(y + h, f.bottom, b.bottom) - Math.max(y, f.top, b.top))
      const shown = (ix * iy) / (w * h)
      if (!best || ix * iy > best.area) best = { area: ix * iy, share: Math.round(shown * 1000) / 1000, fit: cs.objectFit, src: (img.currentSrc || img.src).split("/").pop() }
    }
    return best && { share: best.share, fit: best.fit, src: best.src }
  }, selector)

const settled = (page) =>
  page.waitForFunction(() => [...document.images].every((i) => !/_processed\./.test(i.currentSrc || i.src) || ["keep", "none", "framed"].includes(i.getAttribute("data-cover-trim") || "")) && [...document.images].every((i) => i.complete), { timeout: 15000 }).catch(() => null)

try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage()
    const errors = []
    page.on("pageerror", (e) => errors.push(e.message))
    await page.setViewport({ width, height: 3600, isMobile: width < 640, hasTouch: width < 640 })
    await page.evaluateOnNewDocument(() => {
      const at = (f) => `${location.origin}/__cover/${f}`
      window.PROBE_COVER = { original: at("1767225600000_original_cover.jpg"), padded: at("1767225600000_cover_processed.jpg"), padded2: at("1767225600001_second_processed.jpg"), landscape: at("1767225600002_resume_kit.jpg") }
    })
    await page.goto(`${base}/app/probe?view=places`)
    await page.waitForSelector("[data-probe=explore] img")
    await settled(page)
    await sleep(400)
    /*
      Each frame: its selector, whether it is letterboxed (bars: storelib.com's commerce pages) or must have none, and
      whether the whole picture must be inside it. A thumbnail is measured for wholeness only (an unpicked one is faded).
    */
    const frames = {
      "editor tile 1 (original)": ["[data-probe=editor] [data-media-tile]", "none"],
      "editor tile 2 (padded only)": ["[data-probe=editor] [data-media-id=b] [data-media-tile]", "none"],
      "store card (padded, has original)": ["[data-probe=store-original] a[href]", "bars", true],
      "store card (padded only)": ["[data-probe=store-padded] a[href]", "bars", true],
      "store card (landscape, no padded)": ["[data-probe=store-landscape] a[href]", "bars", true],
      "product page cover": ["[data-probe=product-page-cover] [data-gallery-index]", "bars", true],
      "product page second photo": ["[data-probe=product-page-second] [data-gallery-index]", "bars", true],
      "product page landscape cover": ["[data-probe=product-page-landscape] [data-gallery-index]", "bars", true],
      "product page thumbnail 2": ["[data-probe=product-page-cover] [data-gallery-thumb='1']", "any", true],
      "site 16:9 card (original)": ["[data-probe=site-wide]", "none"],
      "site 16:9 card (padded only)": ["[data-probe=site-wide-padded]", "none"],
      "site 16:9 card (landscape)": ["[data-probe=site-wide-landscape]", "none"],
      "site own shape (padded only)": ["[data-probe=site-natural] img", "none"],
      "explore card": ["[data-probe=explore] a[href]", "bars", true],
    }
    for (const [name, [sel, want, whole]] of Object.entries(frames)) {
      /* The card's picture is its first link (the 16:9 box); the others are the frame itself. */
      const rect = await rectOf(page, sel)
      await sleep(150)
      const again = await rectOf(page, sel)
      const share = await sideBars(page, again ?? rect)
      const seen = await wholeShare(page, sel)
      rows.push({ width, place: name, bars: share, whole: seen })
      if (share === null) failures.push(`${width}px ${name}: no frame found (${sel})`)
      else if (want === "bars" && !(share > 0.8)) failures.push(`${width}px ${name}: bar share ${share}, wanted > 0.8 (letterboxed)`)
      else if (want === "none" && !(share < 0.05)) failures.push(`${width}px ${name}: bar share ${share}, wanted < 0.05`)
      if (whole && !(seen && seen.share >= 0.995)) failures.push(`${width}px ${name}: ${seen ? `${seen.share} of the picture shown (${seen.fit})` : "no picture"}, wanted the whole picture`)
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
      window.PROBE_COVER = { original: at("1767225600000_original_cover.jpg"), padded: at("1767225600000_cover_processed.jpg"), padded2: at("1767225600001_second_processed.jpg"), landscape: at("1767225600002_resume_kit.jpg") }
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

for (const r of rows) console.log(`${String(r.width).padStart(5)}px  ${r.place.padEnd(44)} ${typeof r.bars === "object" ? JSON.stringify(r.bars) : r.bars}${r.whole ? `  whole ${r.whole.share} (${r.whole.fit}, ${r.whole.src})` : ""}`)
if (failures.length) {
  console.log("\n" + failures.map((f) => "FAIL  " + f).join("\n"))
  if (!report) process.exit(1)
} else console.log("\nall frames as wanted: storelib.com's store card, product page and Explore letterboxed with the whole picture shown; no bars on the OnePage, the site cards or the editor")
