/**
 * ===========================================================================
 *  STORELIB REVIEWS ON AN IMPORTED THEME'S PRODUCT PAGE, MEASURED
 * ===========================================================================
 * The Materia fixture with tests/fixtures/shopify-reviews laid over it,
 * imported through the real converter and drawn by the engine as the
 * website draws it, then measured in headless Chromium at 390x844 and
 * 1280x900. Two product pages:
 *
 *   DAWN SHAPE     main-product: the theme's own rating block, Storelib
 *                  Reviews' Star rating under the title and Reviews at the
 *                  foot of the product information column
 *   HORIZON SHAPE  product-information > product details: the theme's own
 *                  review block (closest.product), Star rating and Reviews
 *                  nested beside it
 *
 * For each, at each width:
 *
 *   FITS        nothing scrolls sideways; Reviews stays inside the column
 *               it was placed in
 *   THEME       Star rating and Reviews in the theme's own font family and
 *               text colour (read off the column they sit in)
 *   STARS       the gold part of Star rating is 90% of its stars (4.5 of
 *               5), in the store's colour; the theme's own block says
 *               4.5 / 5 (2) from the same reviews
 *   TAP         Write a review is at least 40px tall
 *   LINK        pressing Star rating lands on the reviews (#reviews)
 *
 * DAWN=/path/to/a/dawn/checkout measures Shopify's Dawn as well: its own
 * main-product rating block and the two blocks in its product column.
 *
 *   node scripts/check-compat-reviews.mjs        SHOTS=/dir for screenshots
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, extname } from "node:path"
import puppeteer from "puppeteer-core"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS
const DAWN = process.env.DAWN
const root = process.cwd()
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

/* ── the pages, drawn by the engine ───────────────────────────────────── */

const at = (p) => JSON.stringify(join(root, p))
const renderDir = mkdtempSync(join(tmpdir(), "check-compat-reviews-"))
writeFileSync(
  join(renderDir, "render.ts"),
  `import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createRequire } from "node:module"
import { convertShopifyTheme } from ${at("lib/storelib-theme/shopify/convert.ts")}
import { drawPage, themeOfInstall } from ${at("lib/storelib-theme/compat/page.ts")}
import { REVIEWS_LIST_BLOCK, REVIEW_STARS_BLOCK } from ${at("lib/storelib-theme/compat/review-app-blocks.ts")}
import { buildStorefrontReviews } from ${at("lib/reviews/storefront.ts")}
import { readReviewsApp } from ${at("lib/reviews/app-settings.ts")}
/* From the checkout: this file sits outside it, where node_modules is not found by itself. */
const JSZip = createRequire(${at("package.json")})("jszip")
const P1 = "11111111-1111-4111-8111-111111111111"
const card = { id: P1, settings: { title: "Prime1 Clarity", slug: "prime1-clarity", url: "/products/prime1-clarity", price: 3900, price_cents: 3900, description: "Energia e lucidità per tutta la giornata." }, rating: { value: 4.5, count: 2, percent: 90, color: "#c2410c" } }
const settings = readReviewsApp({ enabled: true, who: "anyone", display: { starColor: "#c2410c" } })
const rows = [
  { id: "r1", product_id: P1, rating: 5, title: "Perfetto", content: "Mi aiuta a restare concentrato tutto il pomeriggio. Il gusto è leggero.", created_at: "2026-09-30T10:00:00Z", reviewer_name: "Maya Rivers", verified: true },
  { id: "r2", product_id: P1, rating: 4, content: "Buono, lo ricompro.", created_at: "2026-09-20T10:00:00Z", reviewer_name: "Jonas Kahn" },
]
const reviews = buildStorefrontReviews({ settings, creatorId: "c", rows, products: [{ id: P1, title: "Prime1 Clarity", slug: "prime1-clarity" }], product: { id: P1, title: "Prime1 Clarity", rows, ratings: [5, 4] } })
async function zipOf(dirs: string[]) {
  const zip = new JSZip()
  const walk = (dir: string, rel: string) => {
    for (const n of readdirSync(dir)) {
      if (n.startsWith(".")) continue
      const p = join(dir, n)
      if (statSync(p).isDirectory()) walk(p, rel + n + "/")
      else zip.file(rel + n, readFileSync(p))
    }
  }
  for (const d of dirs) for (const top of ["assets", "blocks", "config", "layout", "locales", "sections", "snippets", "templates"]) { try { walk(join(d, top), top + "/") } catch {} }
  return zip
}
async function pages(dirs: string[], shape: (sections: any[]) => Record<string, any[]>) {
  const r = await convertShopifyTheme(await zipOf(dirs))
  if (!r.ok) throw new Error("convert: " + JSON.stringify(r).slice(0, 400))
  const theme = themeOfInstall(r.theme.files as Record<string, string>, r.theme.settings, { assetUrl: (n: string) => "/assets/" + n, assetText: () => null })
  const template = (r.theme.pages as any[]).find((p) => p.page_key === "product").sections
  const page = { template: "product", path: card.settings.url, designMode: false, host: "127.0.0.1", products: [card], collections: [], menus: {}, shop: { name: "Materia", currency: "EUR", moneyFormat: "€{{amount}}" }, product: card, reviews }
  const out: Record<string, string> = {}
  for (const [name, sections] of Object.entries(shape(template))) out[name] = drawPage(theme, page as never, sections as never, { scripts: false }).html
  return out
}
const stars = { id: "stars", type: REVIEW_STARS_BLOCK, settings: { show_average: true } }
const list = { id: "list", type: REVIEWS_LIST_BLOCK, settings: {} }
const withBlocks = (template: any[]) => template.map((s) => (s.type === "main-product" ? { ...s, blocks: [s.blocks[0], stars, ...s.blocks.slice(1), list] } : s))
;(async () => {
  const fixture = await pages([${at("tests/fixtures/shopify-materia")}, ${at("tests/fixtures/shopify-reviews")}], (template) => ({
    dawnShape: withBlocks(template),
    horizonShape: [...template.filter((s: any) => s.group), { id: "pi", type: "product-information", settings: {}, blocks: [{ id: "details", type: "_product-details", settings: {}, blocks: [{ id: "title", type: "product-title", settings: {} }, { id: "hr", type: "review", settings: {} }, stars, list] }] }],
  }))
  const dawnDir = process.env.DAWN
  const dawn = dawnDir ? await pages([dawnDir], (template) => ({ dawn: template.map((s: any) => (s.type === "main-product" ? { ...s, blocks: [s.blocks.find((b: any) => b.type === "title"), { id: "rating", type: "rating", settings: {} }, stars, ...s.blocks.filter((b: any) => b.type !== "title"), list] } : s)) })) : {}
  process.stdout.write(JSON.stringify({ ...fixture, ...dawn }))
})().catch((e) => { process.stderr.write(String(e?.stack ?? e)); process.exit(1) })
`,
)
let drawn
try {
  drawn = JSON.parse(execFileSync("npx", ["tsx", join(renderDir, "render.ts")], { cwd: root, maxBuffer: 128 * 1024 * 1024, env: { ...process.env, NODE_OPTIONS: "" }, stdio: ["ignore", "pipe", "pipe"] }).toString())
} catch (e) {
  fail(`the pages did not draw: ${String(e?.stderr || "").slice(0, 900)} ${String(e?.message || e).slice(0, 300)}`)
} finally {
  rmSync(renderDir, { recursive: true, force: true })
}

/* ── served, with each theme's own assets ─────────────────────────────── */

const TYPES = { ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" }
const assetDirs = { dawnShape: join(root, "tests/fixtures/shopify-materia/assets"), horizonShape: join(root, "tests/fixtures/shopify-materia/assets"), dawn: DAWN ? join(DAWN, "assets") : "" }
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  const [, name, ...rest] = url.pathname.split("/")
  if (rest[0] === "assets") {
    const file = join(assetDirs[name] ?? "", rest.slice(1).join("/"))
    if (existsSync(file)) {
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" })
      res.end(readFileSync(file))
      return
    }
    res.writeHead(404)
    res.end()
    return
  }
  const html = drawn[name]
  if (!html) {
    res.writeHead(404)
    res.end()
    return
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
  res.end(html.replaceAll('"/assets/', `"/${name}/assets/`))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got !== "" ? `   ${typeof got === "string" ? got : JSON.stringify(got)}` : ""}`)
  if (!ok) broken++
}

const MEASURE = `(() => {
  const stars = document.querySelector('[data-block-id="stars"] .slrv-rating')
  const list = document.querySelector('[data-block-id="list"] .slrv')
  const column = stars.closest('.rv-product__info, .rv-details, .product__info-container') ?? stars.parentElement.parentElement
  const cs = (el) => getComputedStyle(el)
  const glyphs = stars.querySelector('.slrv-stars')
  const after = getComputedStyle(glyphs, '::after')
  const btn = list.querySelector('.slrv-write > summary')
  const box = (el) => el.getBoundingClientRect()
  const theirs = document.querySelector('.rating-wrapper, .horizon-rating, .product .rating')
  return {
    overflow: document.documentElement.scrollWidth - innerWidth,
    starsVisible: box(stars).height > 0 && box(stars).width > 0,
    starsFont: cs(stars).fontFamily, starsColor: cs(stars).color,
    columnFont: cs(column).fontFamily, columnColor: cs(column).color,
    listFont: cs(list).fontFamily, listColor: cs(list).color,
    fill: Math.round((parseFloat(after.width) / box(glyphs).width) * 100),
    fillColor: after.color,
    listLeft: Math.round(box(list).left), listRight: Math.round(box(list).right),
    columnLeft: Math.round(box(column).left), columnRight: Math.round(box(column).right),
    writeH: Math.round(box(btn).height),
    theirs: theirs ? theirs.textContent.replace(/\\s+/g, ' ').trim() : null,
    href: stars.querySelector('a')?.getAttribute('href') ?? null,
  }
})()`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"] })
try {
  for (const name of Object.keys(drawn)) {
    for (const [w, h] of [[390, 844], [1280, 900]]) {
      console.log(`\n${name} at ${w}x${h}`)
      const page = await browser.newPage()
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 })
      await page.goto(`${base}/${name}`, { waitUntil: "load" })
      const m = await page.evaluate(MEASURE)
      expect(m.overflow <= 0, "nothing scrolls sideways", `scrollWidth - width = ${m.overflow}px`)
      expect(m.listLeft >= m.columnLeft - 1 && m.listRight <= m.columnRight + 1, "Reviews stays inside the column it was placed in", `list ${m.listLeft}..${m.listRight}, column ${m.columnLeft}..${m.columnRight}`)
      expect(m.starsVisible && m.starsFont === m.columnFont && m.listFont === m.columnFont, "Star rating and Reviews in the theme's font", m.starsFont.slice(0, 60))
      expect(m.starsColor === m.columnColor && m.listColor === m.columnColor, "  and its text colour", m.starsColor)
      expect(m.fill >= 89 && m.fill <= 91 && m.fillColor === "rgb(194, 65, 12)", "the stars filled to 90% in the store's colour", `${m.fill}% ${m.fillColor}`)
      expect(m.theirs !== null && /4\.5/.test(m.theirs) && /\b2\b/.test(m.theirs), "the theme's own rating block reads the same reviews", m.theirs ?? "none")
      expect(m.writeH >= 40, "Write a review is tap sized", `${m.writeH}px`)
      await page.click('[data-block-id="stars"] a')
      await new Promise((r) => setTimeout(r, 150))
      const landed = await page.evaluate(() => {
        const top = Math.round(document.getElementById("reviews").getBoundingClientRect().top)
        /* A short page ends before the reviews reach the top of the window. */
        const atEnd = scrollY >= document.documentElement.scrollHeight - innerHeight - 1
        return { hash: location.hash, top, atEnd, height: innerHeight }
      })
      /* At the top of the window (within a theme's own scroll margin), or in view at the end of a page too short to scroll further. */
      const there = Math.abs(landed.top) <= 12 || (landed.atEnd && landed.top > 0 && landed.top < landed.height / 2)
      expect(m.href === "#reviews" && landed.hash === "#reviews" && there, "pressing Star rating lands on the reviews", `${landed.hash} at ${landed.top}px${landed.atEnd ? ", the page's end" : ""}`)
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `compat-reviews-${name}-${w}.png`), fullPage: true })
      await page.close()
    }
  }
} finally {
  await browser.close()
  server.close()
}
console.log(broken ? `\n${broken} check(s) failed` : "\nAll checks pass")
process.exit(broken ? 1 : 0)
