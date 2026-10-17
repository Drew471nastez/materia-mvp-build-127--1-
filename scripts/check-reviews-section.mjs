/**
 * ===========================================================================
 *  THE PRODUCT REVIEWS SECTION AND THE IMPORT MAPPING STEP, MEASURED
 * ===========================================================================
 * At 390x844 and 1280x900, in headless Chromium:
 *
 *   SECTION   sections/reviews_product.storelib drawn by the live engine over
 *             fourteen reviews (the app shows four before Show more, newest
 *             first): nothing scrolls sideways; the chips and the sort are
 *             tap sized; four cards show; the 1 star chip leaves only the one
 *             star reviews; Lowest rating puts a one star review first and
 *             shows them all; back to Newest shows four; Show more shows all;
 *             a photo opens in a popover that fits the window and Escape
 *             closes it. No script runs: every one of these is CSS over
 *             inputs the section draws.
 *   IMPORT    app/app/reviews/import-flow.tsx with a Yotpo export chosen:
 *             the dialog fits the window, the file is read as Yotpo, the
 *             fields are one column on a phone and two on a computer, every
 *             select is tap sized on a phone, the preview table scrolls
 *             inside its own box, and an Amazon file whose product is not
 *             the store's goes to the products step.
 *
 *   node scripts/check-reviews-section.mjs        SHOTS=/dir for screenshots
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { build } from "esbuild"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS
const root = process.cwd()
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const dir = join(root, "node_modules/.cache/check-reviews-section")
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

/* ── the section, drawn by the engine ─────────────────────────────────── */

const at = (p) => JSON.stringify(join(root, p))
/* Outside node_modules: tsx leaves TypeScript under node_modules untranslated. */
const renderDir = mkdtempSync(join(tmpdir(), "check-reviews-section-"))
writeFileSync(
  join(renderDir, "render.ts"),
  `import { compileSection, renderSection } from ${at("lib/storelib-theme/index.ts")}
import { DEFAULT_THEME_SOURCES } from ${at("themes/default/sources.generated.ts")}
import { storefrontData } from ${at("lib/website-builder/storefront-data.ts")}
import { readReviewsApp } from ${at("lib/reviews/app-settings.ts")}
import { buildStorefrontReviews } from ${at("lib/reviews/storefront.ts")}
const settings = readReviewsApp({ enabled: true, who: "anyone", display: { perPage: 4, sort: "newest" } })
const ratings = [5, 4, 5, 3, 1, 5, 4, 2, 5, 5, 4, 1, 5, 3]
const rows = ratings.map((rating, i) => ({ id: "r" + i, product_id: "p1", rating, title: i % 3 ? "" : "Exactly what I hoped for", content: i === 1 ? "The linen is heavier than I expected and the pocket sits right. Washed it twice and it kept its shape." : "Clear, well made and easy to get started with.", created_at: new Date(Date.UTC(2026, 8, 1 + i)).toISOString(), reviewer_name: ["Maya Rivers", "Jonas Kahn", "Priya Shah", "Sam Tan"][i % 4], verified: i % 2 === 0, photos: i === 13 ? [{ path: "c/a.svg", url: "https://photo.test/a.svg", status: "approved" }] : [], seller_reply: i === 13 ? "Thank you, glad it works." : null }))
const data = buildStorefrontReviews({ settings, creatorId: "c", rows, products: [{ id: "p1", title: "Linen Apron", slug: "linen-apron" }], product: { id: "p1", title: "Linen Apron", rows, ratings }, limit: 100 })
const r = compileSection(DEFAULT_THEME_SOURCES["sections/reviews_product.storelib"], { file: "sections/reviews_product.storelib" })
if (r.ok !== true) throw new Error(JSON.stringify(r.errors))
const out = renderSection({ compiled: r.value, id: "s1", instance: { type: "reviews_product", settings: {} }, theme: {}, page: { template: "product" } as never, data: storefrontData({ dynamic: { shop: { name: "Drew Studio" } } as never, reviews: data as never }), products: [] as never })
process.stdout.write(JSON.stringify({ html: out.html, css: out.css }))
`,
)
let drawn
try {
  drawn = JSON.parse(execFileSync("npx", ["tsx", join(renderDir, "render.ts")], { cwd: root, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NODE_OPTIONS: "" }, stdio: ["ignore", "pipe", "pipe"] }).toString())
} catch (e) {
  fail(`the section did not draw: ${String(e?.stderr || "").slice(0, 600)} ${String(e?.stdout || "").slice(0, 300)} ${String(e?.message || e).slice(0, 300)}`)
} finally {
  rmSync(renderDir, { recursive: true, force: true })
}
const PHOTO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"><rect width="1200" height="900" fill="#d9c7b4"/><circle cx="600" cy="420" r="200" fill="#8a6a52"/></svg>'
const sectionPage = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${interFaces(root)}</style>
<style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style><style>${drawn.css}</style></head>
<body><div data-section-id="s1" style="--s-bg:#fff">${drawn.html.replaceAll("https://photo.test/a.svg", "/photo.svg")}</div></body></html>`

/* ── the import step, bundled for the browser ─────────────────────────── */

writeFileSync(
  join(dir, "import-probe.tsx"),
  `import React from "react"
import { createRoot } from "react-dom/client"
import { ImportFlow } from ${at("app/app/reviews/import-flow.tsx")}
const products = [{ id: "p1", title: "Linen Apron", slug: "linen-apron", skus: ["LA-01"] }, { id: "p2", title: "Oak Board", slug: "oak-board", skus: [] }]
const calls: unknown[] = []
;(window as any).__calls = calls
window.fetch = (async (url: string, init?: RequestInit) => {
  const body = init?.body ? JSON.parse(String(init.body)) : null
  calls.push({ url, method: init?.method ?? "GET", body })
  let out: unknown = {}
  if (!init || init.method === "GET") out = { products, imports: [{ id: "i1", platform: "judgeme", file_name: "judgeme-export.csv", status: "done", imported: 312, duplicates: 4, skipped: 2, errors: 1, created_at: "2026-10-01T10:00:00Z", undone_count: null }], ready: true }
  else if (body?.action === "start") out = { importId: "00000000-0000-4000-8000-000000000002", ready: true }
  else if (body?.action === "rows") out = { imported: body.rows.length, duplicates: 0, errors: [] }
  else if (body?.action === "finish") out = { import: { id: "00000000-0000-4000-8000-000000000002", platform: "yotpo", file_name: "yotpo.csv", status: "done", imported: 2, duplicates: 0, skipped: 0, errors: 0, created_at: new Date().toISOString(), undone_count: null } }
  return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } })
}) as typeof fetch
createRoot(document.getElementById("app")!).render(<div className="min-h-screen bg-[#f8f9fa]"><ImportFlow onClose={() => {}} onChanged={() => {}} /></div>)
`,
)
try {
  await build({
    entryPoints: [join(dir, "import-probe.tsx")],
    outfile: join(dir, "import-probe.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    logLevel: "error",
    alias: { "@": root },
    define: { "process.env.NODE_ENV": '"production"' },
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    nodePaths: [join(root, "node_modules")],
  })
} catch (e) {
  fail(`the import step did not bundle: ${e instanceof Error ? e.message.slice(0, 400) : e}`)
}
const sheet = await appCss(root)
const importPage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${interFaces(root)}</style><style>${sheet}</style>
<style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "import-probe.js"), "utf8")}</script></body></html>`

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  if (url.pathname === "/photo.svg") {
    res.writeHead(200, { "content-type": "image/svg+xml" })
    res.end(PHOTO_SVG)
    return
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(url.pathname === "/import" ? importPage : sectionPage)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got !== "" ? `   ${typeof got === "string" ? got : JSON.stringify(got)}` : ""}`)
  if (!ok) broken++
}

const VISIBLE = `(() => [...document.querySelectorAll(".rv-card")].filter((c) => getComputedStyle(c).display !== "none").map((c) => ({ id: c.dataset.reviewId, rating: Number(c.dataset.rating), top: Math.round(c.getBoundingClientRect().top + scrollY) })).sort((a, b) => a.top - b.top))()`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"] })
try {
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    console.log(`\nProduct reviews section at ${w}x${h}`)
    const page = await browser.newPage()
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 })
    await page.goto(`${base}/section`, { waitUntil: "load" })
    const m = await page.evaluate(() => {
      const box = (el) => (el ? el.getBoundingClientRect() : null)
      const chips = [...document.querySelectorAll(".rv-chip")].map((c) => box(c))
      const sort = box(document.querySelector(".rv-sort__s"))
      const tools = box(document.querySelector(".rv__tools"))
      const list = box(document.querySelector(".rv__list"))
      const more = box(document.querySelector(".rv-more-b"))
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        chips: chips.length,
        chipH: Math.min(...chips.map((c) => Math.round(c.height))),
        chipRows: new Set(chips.map((c) => Math.round(c.top))).size,
        sortH: Math.round(sort.height),
        sortW: Math.round(sort.width),
        toolsH: Math.round(tools.height),
        listW: Math.round(list.width),
        listLeft: Math.round(list.left),
        moreH: more ? Math.round(more.height) : 0,
        scripts: document.querySelectorAll("script").length,
      }
    })
    expect(m.overflow <= 0, "nothing scrolls sideways", `scrollWidth - width = ${m.overflow}px`)
    expect(m.chips === 6 && m.chipH >= 36, "All and five star chips, each at least 36px tall", `${m.chips} chips, ${m.chipH}px tall, on ${m.chipRows} row(s)`)
    expect(m.sortH >= 36, "the sort select is tap sized", `${m.sortW}x${m.sortH}px`)
    expect(m.scripts === 0, "no script on the page", `${m.scripts} scripts`)
    console.log(`        tools row ${m.toolsH}px tall; list ${m.listW}px wide from x=${m.listLeft}; Show more ${m.moreH}px tall`)

    let v = await page.evaluate(VISIBLE)
    expect(v.length === 4 && v[0].id === "r13", "four cards before Show more (the app's number), newest first", v.map((x) => x.id).join(","))
    await page.click('label[for="rv-f1-s1"]')
    v = await page.evaluate(VISIBLE)
    expect(v.length === 2 && v.every((x) => x.rating === 1), "1 star: only the two one star reviews", v.map((x) => `${x.id}:${x.rating}`).join(","))
    await page.click('label[for="rv-f0-s1"]')
    await page.select(".rv-sort__s", "lowest")
    v = await page.evaluate(VISIBLE)
    expect(v.length === 14 && v[0].rating === 1 && v[1].rating === 1 && v[13].rating === 5, "Lowest rating: every review, one stars first", v.slice(0, 3).map((x) => `${x.id}:${x.rating}`).join(","))
    await page.select(".rv-sort__s", "highest")
    v = await page.evaluate(VISIBLE)
    expect(v[0].rating === 5 && v[13].rating === 1, "Highest rating: fives first", `${v[0].rating} first, ${v[13].rating} last`)
    await page.select(".rv-sort__s", "newest")
    v = await page.evaluate(VISIBLE)
    expect(v.length === 4, "back to the store's order: four again", `${v.length}`)
    await page.click(".rv-more-b")
    v = await page.evaluate(VISIBLE)
    const moreGone = await page.evaluate(() => getComputedStyle(document.querySelector(".rv-more-b")).display === "none")
    expect(v.length === 14 && moreGone, "Show more: all fourteen, and the button goes", `${v.length} shown`)
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `reviews-section-${w}.png`), fullPage: true })

    await page.click(".rv-ph")
    await new Promise((r) => setTimeout(r, 150))
    const lb = await page.evaluate(() => {
      const el = document.querySelector(".rv-lb")
      const img = el.querySelector("img")
      const b = el.getBoundingClientRect()
      const i = img.getBoundingClientRect()
      return { open: el.matches(":popover-open"), left: Math.round(b.left), top: Math.round(b.top), right: Math.round(b.right), bottom: Math.round(b.bottom), imgW: Math.round(i.width), imgH: Math.round(i.height) }
    })
    expect(lb.open && lb.left >= 0 && lb.top >= 0 && lb.right <= w && lb.bottom <= h, "a photo opens in a popover inside the window", lb)
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `reviews-lightbox-${w}.png`) })
    await page.keyboard.press("Escape")
    const closed = await page.evaluate(() => !document.querySelector(".rv-lb").matches(":popover-open"))
    expect(closed, "Escape closes it")
    await page.close()
  }

  for (const [w, h] of [[390, 844], [1280, 900]]) {
    console.log(`\nImport, the mapping step, at ${w}x${h}`)
    const page = await browser.newPage()
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 })
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)))
    await page.goto(`${base}/import`, { waitUntil: "load" })
    await page.waitForSelector("[data-import-history] li", { timeout: 10_000 }).catch(() => null)
    const input = await page.$('input[type="file"]')
    await input.uploadFile(join(root, "tests/fixtures/reviews/yotpo.csv"))
    await page.waitForSelector("[data-import-map]", { timeout: 10_000 }).catch(() => null)
    const m = await page.evaluate(() => {
      const dialog = document.querySelector("[data-import-step]").getBoundingClientRect()
      const grid = document.querySelector("[data-import-fields]")
      const cols = getComputedStyle(grid).gridTemplateColumns.split(" ").length
      const selects = [...grid.querySelectorAll("select")].map((s) => s.getBoundingClientRect())
      const prev = document.querySelector("[data-import-preview]")
      const buttons = [...document.querySelectorAll("[data-import-step] > div:last-child button")].map((b) => b.getBoundingClientRect())
      return {
        platform: document.querySelector("[data-import-platform]").value,
        body: document.querySelector('[data-import-field="body"]').selectedOptions[0]?.textContent,
        dialog: { left: Math.round(dialog.left), right: Math.round(dialog.right), top: Math.round(dialog.top), bottom: Math.round(dialog.bottom), w: Math.round(dialog.width), h: Math.round(dialog.height) },
        cols,
        selectH: Math.min(...selects.map((s) => Math.round(s.height))),
        selectW: Math.min(...selects.map((s) => Math.round(s.width))),
        previewRows: prev.querySelectorAll("tbody tr").length,
        previewScroll: prev.scrollWidth - prev.clientWidth,
        previewBox: Math.round(prev.getBoundingClientRect().width),
        buttonH: Math.min(...buttons.map((b) => Math.round(b.height))),
        overflow: document.documentElement.scrollWidth - innerWidth,
      }
    })
    expect(m.platform === "yotpo" && m.body === "Review Content", "the file is read as Yotpo, the review is Review Content", `${m.platform}, ${m.body}`)
    expect(m.dialog.left >= 0 && m.dialog.right <= w && m.dialog.top >= 0 && m.dialog.bottom <= h, "the dialog fits the window", m.dialog)
    expect(m.overflow <= 0, "nothing scrolls sideways", `${m.overflow}px`)
    expect(w < 640 ? m.cols === 1 : m.cols === 2, w < 640 ? "fields in one column on a phone" : "fields in two columns on a computer", `${m.cols} column(s), selects ${m.selectW}x${m.selectH}px`)
    expect(w < 768 ? m.selectH >= 40 : m.selectH >= 32, "every select is tap sized", `${m.selectH}px`)
    expect(m.previewRows === 2, "the preview shows the file's two reviews", `${m.previewRows} rows`)
    expect(m.previewScroll <= 0 || w < 640, "the preview table scrolls inside its own box when it must", `box ${m.previewBox}px, scrolls ${Math.max(0, m.previewScroll)}px`)
    expect(m.buttonH >= (w < 640 ? 44 : 36), "the footer buttons are tap sized", `${m.buttonH}px`)
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `reviews-import-map-${w}.png`) })

    await page.click("[data-import-continue]")
    await page.waitForSelector("[data-import-result]", { timeout: 10_000 }).catch(() => null)
    const done = await page.evaluate(() => {
      const dl = document.querySelector("[data-import-result] dl")
      return { cols: dl ? getComputedStyle(dl).gridTemplateColumns.split(" ").length : 0, sent: window.__calls.filter((c) => c.body?.action === "rows").reduce((n, c) => n + c.body.rows.length, 0), imported: dl?.querySelector("dd")?.textContent }
    })
    expect(done.sent === 2 && done.imported === "2", "both reviews sent and counted", done)
    expect(done.cols === (w < 640 ? 2 : 4), "the result counts in a grid", `${done.cols} columns`)
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `reviews-import-done-${w}.png`) })

    await page.goto(`${base}/import`, { waitUntil: "load" })
    const again = await page.$('input[type="file"]')
    await again.uploadFile(join(root, "tests/fixtures/reviews/amazon-asin.csv"))
    await page.waitForSelector("[data-import-map]", { timeout: 10_000 }).catch(() => null)
    await page.click("[data-import-continue]")
    await page.waitForSelector("[data-import-products]", { timeout: 10_000 }).catch(() => null)
    const p = await page.evaluate(() => {
      const el = document.querySelector("[data-import-products]")
      const sel = el?.querySelector("select")
      return { shown: !!el, groups: el ? el.querySelectorAll("li").length : 0, value: sel?.value, selectH: sel ? Math.round(sel.getBoundingClientRect().height) : 0, run: document.querySelector("[data-import-run]")?.textContent }
    })
    expect(p.shown && p.groups === 1 && p.value === "skip", "an Amazon ASIN the store does not have: the products step, skipped until a product is picked", p)
    await page.select("[data-import-assign]", "p2")
    const run = await page.evaluate(() => document.querySelector("[data-import-run]")?.textContent)
    expect(run === "Import 1 review", "a product picked: the button counts it", run)
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `reviews-import-products-${w}.png`) })
    expect(errors.length === 0, "no errors in the page", errors)
    await page.close()
  }
} finally {
  await browser.close()
  server.close()
  rmSync(dir, { recursive: true, force: true })
}

console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
