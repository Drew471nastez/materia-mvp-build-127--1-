/**
 * ===========================================================================
 *  THE THEME MARKETPLACE'S PAGES, RENDERED AND MEASURED (round 58)
 * ===========================================================================
 *   BASE=http://localhost:3158 SHOTS_DIR=<dir> node scripts/check-theme-seo-r58.mjs [--before]
 *
 * Against a running server (next dev or next start):
 *
 *   THE HTML A CRAWLER GETS   status, one <title>, a description, the
 *                             canonical, og:url and og:image, the X card,
 *                             no noindex, one H1, every <img> with alt,
 *                             width and height, the JSON-LD parsed and its
 *                             types, the links to every template; 404 for
 *                             an unknown template and an unknown category
 *   IN CHROMIUM               at 360, 390, 768 and 1280 (device scale 2):
 *                             nothing wider than the window, the layout
 *                             shift after load (CLS), the bytes of pictures
 *                             loaded, full page screenshots; the phone's
 *                             Filter sheet opened and a feature ticked; a
 *                             category chosen at 1280 with every frame of
 *                             the change sampled for an empty grid
 *
 * --before measures what the address serves without the round's checks
 * that only the new pages pass (screenshots and the shared numbers only).
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const BASE = process.env.BASE || "http://localhost:3158"
const SHOTS = process.env.SHOTS_DIR || "/tmp/theme-seo-shots"
const BEFORE = process.argv.includes("--before")
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
mkdirSync(SHOTS, { recursive: true })
let broken = 0
const out = []
const expect = (ok, what, got) => {
  const line = `  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`
  console.log(line)
  out.push(line)
  if (!ok) broken++
}

const PAGES = BEFORE ? ["/themes", "/themes/clothing"] : ["/themes", "/themes/category/fashion", "/themes/category/courses", "/themes/clothing", "/themes/online-course", "/themes/storelib-default"]

/* ── The HTML ─────────────────────────────────────────────────────────── */
async function html(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual" })
  return { status: res.status, text: await res.text() }
}
const attr = (s, re) => re.exec(s)?.[1] ?? null

if (!BEFORE) {
  console.log("\nThe HTML a crawler gets")
  const seen = new Set()
  for (const path of PAGES) {
    const { status, text } = await html(path)
    const title = attr(text, /<title>([^<]*)<\/title>/)
    const desc = attr(text, /<meta name="description" content="([^"]*)"/)
    const canonical = attr(text, /<link rel="canonical" href="([^"]*)"/)
    const ogUrl = attr(text, /<meta property="og:url" content="([^"]*)"/)
    const ogImage = attr(text, /<meta property="og:image" content="([^"]*)"/)
    const card = attr(text, /<meta name="twitter:card" content="([^"]*)"/)
    const robots = attr(text, /<meta name="robots" content="([^"]*)"/)
    const h1s = (text.match(/<h1\b/g) ?? []).length
    const imgs = [...text.matchAll(/<img\b[^>]*>/g)].map((m) => m[0])
    const bareImgs = imgs.filter((i) => !/\balt="/.test(i) || !/\bwidth="/.test(i) || !/\bheight="/.test(i))
    const ld = [...text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => {
      try {
        return JSON.parse(m[1])
      } catch {
        return null
      }
    })
    const types = ld.flatMap((d) => (d?.["@graph"] ?? [d]).map((n) => n?.["@type"])).filter(Boolean)
    const want = path === "/themes" ? ["CollectionPage", "ItemList", "BreadcrumbList"] : path.includes("/category/") ? ["CollectionPage", "ItemList", "BreadcrumbList", "FAQPage"] : ["WebPage", "CreativeWork", "BreadcrumbList", "FAQPage"]
    const decoded = (s) => s?.replace(/&amp;/g, "&")
    console.log(`\n  ${path}`)
    expect(status === 200, "answers 200", status)
    expect(!!title && title.length <= 65 && !seen.has(title), "a title of its own", decoded(title))
    seen.add(title)
    expect(!!desc && desc.length >= 100 && desc.length <= 170, "a description of 100 to 170 characters", desc?.length)
    expect(canonical === `https://storelib.com${path}` && ogUrl === canonical, "canonical and og:url are this address", canonical)
    expect(!!ogImage && /^https:\/\/storelib\.com\//.test(ogImage), "a share picture", ogImage)
    expect(card === "summary_large_image", "the X card is the large one", card)
    expect(!robots || !/noindex/.test(robots), "no noindex", robots)
    expect(h1s === 1, "one H1", h1s)
    expect(bareImgs.length === 0, `${imgs.length} pictures, every one with alt, width and height`, bareImgs.slice(0, 2))
    expect(ld.every(Boolean) && want.every((t) => types.includes(t)), "the JSON-LD parses, with its types", types)
    if (path === "/themes") {
      const links = [...text.matchAll(/href="(\/themes\/[a-z0-9-]+)"/g)].map((m) => m[1])
      expect(new Set(links).size >= 19, "every template is a link in the page, the hidden ones too", new Set(links).size)
    }
    writeFileSync(join(SHOTS, `${path.replace(/\//g, "_") || "_"}.html`), text)
  }
  for (const [path, want] of [["/themes/no-such-template", 404], ["/themes/category/no-such-kind", 404], ["/themes/category", 308]]) {
    const { status } = await html(path)
    expect(status === want, `${path} answers ${want}`, status)
  }
}

/* ── In Chromium ──────────────────────────────────────────────────────── */
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
const WIDTHS = [360, 390, 768, 1280]
const shotPages = BEFORE ? PAGES : ["/themes", "/themes/category/fashion", "/themes/clothing"]
console.log("\nIn Chromium")
for (const path of shotPages) {
  for (const w of WIDTHS) {
    const page = await browser.newPage()
    await page.setViewport({ width: w, height: w < 768 ? 800 : 900, deviceScaleFactor: 2 })
    await page.evaluateOnNewDocument(() => {
      window.__cls = 0
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value
      }).observe({ type: "layout-shift", buffered: true })
    })
    let imageBytes = 0
    page.on("response", async (r) => {
      if (r.request().resourceType() === "image") {
        const len = Number(r.headers()["content-length"] || 0)
        imageBytes += len || (await r.buffer().then((b) => b.length).catch(() => 0))
      }
    })
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0", timeout: 120000 })
    await new Promise((r) => setTimeout(r, 800))
    const m = await page.evaluate(() => ({ cls: window.__cls, wide: document.documentElement.scrollWidth - window.innerWidth, cards: document.querySelectorAll("[data-market-card]:not([hidden])").length }))
    /* For the pictures people look at: the cookie notice answered, and the page scrolled through so the lazy pictures are in. */
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Reject all")?.click())
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 60))
      }
      window.scrollTo(0, 0)
    })
    await new Promise((r) => setTimeout(r, 1200))
    const name = `${BEFORE ? "before" : "after"}${path.replace(/\//g, "_")}-${w}.png`
    await page.screenshot({ path: join(SHOTS, name), fullPage: true })
    expect(m.wide <= 0, `${path} at ${w}: nothing wider than the window`, m.wide)
    expect(BEFORE || m.cls < 0.01, `${path} at ${w}: layout shift after load ${m.cls.toFixed(4)}`, `${Math.round(imageBytes / 1024)} KB of pictures by the end of a scroll through (browser cache shared between widths), ${m.cards} cards shown`)
    if (!BEFORE && path === "/themes" && w === 390) {
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.click("[data-market-filter-open]")
      await new Promise((r) => setTimeout(r, 700))
      await page.screenshot({ path: join(SHOTS, "after_themes-390-filter-sheet.png") })
      const before = await page.$eval("[data-market-count]", (e) => e.textContent)
      const box = await page.$$('[role="dialog"] input[type="checkbox"]')
      if (box.length) await box[box.length - 1].click()
      await new Promise((r) => setTimeout(r, 300))
      const after = await page.$eval("[data-market-count]", (e) => e.textContent)
      expect(box.length > 0 && before !== after, "the phone's Filter sheet has the checkboxes, and one narrows the grid", `${before} -> ${after}`)
      await page.screenshot({ path: join(SHOTS, "after_themes-390-filter-ticked.png") })
    }
    if (!BEFORE && path === "/themes" && w === 1280) {
      /* A category chosen: sample every frame until the new page's grid is drawn, and count the frames with no cards. */
      await page.evaluate(() => {
        window.__frames = []
        const tick = () => {
          window.__frames.push(document.querySelectorAll("[data-market-card]:not([hidden])").length)
          if (window.__frames.length < 600) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      await page.click('aside a[href="/themes/category/fashion"]')
      await page.waitForFunction(() => location.pathname === "/themes/category/fashion" && document.querySelector("h1")?.textContent?.includes("Fashion"), { timeout: 60000 })
      await new Promise((r) => setTimeout(r, 300))
      const frames = await page.evaluate(() => window.__frames)
      expect(frames.every((n) => n > 0), `choosing a category: ${frames.length} frames sampled, none with an empty grid`, `${Math.min(...frames)} to ${Math.max(...frames)} cards`)
      const box = await page.$$("aside input[type=checkbox]")
      const t0 = await page.$eval("[data-market-count]", (e) => e.textContent)
      if (box.length) await box[box.length - 1].click()
      await new Promise((r) => setTimeout(r, 300))
      const t1 = await page.$eval("[data-market-count]", (e) => e.textContent)
      expect(t0 !== t1 && /feature=/.test(await page.evaluate(() => location.search)), "a feature ticked narrows the grid and is kept in the address", `${t0} -> ${t1}`)
    }
    await page.close()
  }
}
await browser.close()
writeFileSync(join(SHOTS, `${BEFORE ? "before" : "after"}-report.txt`), out.join("\n") + "\n")
console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
