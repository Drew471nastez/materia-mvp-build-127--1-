/**
 * ===========================================================================
 *  FILES' DETAIL VIEW, MEASURED (round V)
 * ===========================================================================
 * scripts/render-file-modal.tsx mounts the real Files library. This serves
 * it thirty pictures (the repository's own), answers /api/files,
 * /api/files/usage and /_next/image, then at 390x844 (a phone, touch, 3x),
 * 768x1024 and 1280x800:
 *
 *   GRID     which copy each tile asked for (the w= of its currentSrc), that
 *            tiles past the first rows are lazy, and the layout shift while
 *            the pictures arrive
 *   OPEN     a press on the first tile: the window's or the sheet's box
 *            against the viewport, the picture's stage, and that nothing in
 *            the column scrolls sideways
 *   LINK     the Copy button's width against its natural width (the width it
 *            takes with nothing pressing on it), before and after it says
 *            Copied, the field's width against its column, and that the
 *            address is cut (scrollWidth over clientWidth) rather than
 *            pushing the button
 *   KEYS     → opens the next file, ← the one before, Escape closes
 *   ALT      typed, saved, Saved shown, the PATCH the server got
 *   DELETE   the question, with the in-use warning naming the two places
 *            the first file is used
 *
 * Fails when the Copy button is ever narrower than its natural width, the
 * window or sheet leaves the viewport, or a step does not happen.
 *
 *   node scripts/check-file-modal.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const work = mkdtempSync(join(tmpdir(), "file-modal-"))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

writeFileSync(join(work, "supabase.js"), `export const createClient = () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) }, storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: (p) => ({ data: { publicUrl: "https://storelib.com/media/store-builder-images/" + p } }) }) } })\n`)
writeFileSync(join(work, "sonner.js"), `const say = (kind) => (m) => { (window.__toasts ||= []).push(kind + ": " + m) }\nexport const toast = Object.assign(say("info"), { error: say("error"), success: say("success") })\nexport const Toaster = () => null\n`)
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-file-modal.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(work, "app.js")}`,
  '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN="storelib.com"',
  "--define:process.env.NEXT_PUBLIC_SUPABASE_URL=undefined", "--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=undefined",
  `--alias:@/lib/supabase/client=${join(work, "supabase.js")}`, `--alias:sonner=${join(work, "sonner.js")}`,
  `--alias:@=${root}`, "--loader:.css=empty"],
  { stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, NODE_PATH: join(root, "node_modules") } })
const css = await appCss(root)
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
  `<style>${css}</style><style>body{margin:0;background:#f8f9fa}</style></head><body><div id="app"></div>` +
  `<script>window.process={env:{NODE_ENV:"production"}};window.__err=[];addEventListener("error",e=>__err.push(String(e.message)))</script>` +
  `<script src="/app.js"></script></body></html>`

const SOURCES = ["public/images/brand/storelib-og-v2.jpg", "public/modern-tech-product.png", "public/images/onepage-themes/nature.webp", "public/images/onepage-themes/fusion.webp", "public/images/design-mode/storelib.png", "public/product-launch-email-template.png"].filter((p) => existsSync(join(root, p)))
const typeOf = (p) => (p.endsWith(".png") ? "image/png" : p.endsWith(".webp") ? "image/webp" : "image/jpeg")
/* The first file has a long name, so its address is longer than the field. */
const files = Array.from({ length: 30 }, (_, i) => {
  const name = i === 0 ? `1760000000000-summer-collection-hero-banner-final-final-v3-${i}.jpg` : `photo-${i}.jpg`
  const path = `u1/files/${i}-${name}`
  return { id: `store-builder-images:${path}`, bucket: "store-builder-images", path, name, url: `https://storelib.com/media/store-builder-images/${path}`, bytes: 240000 + i * 1000, type: "image/jpeg", createdAt: new Date(Date.UTC(2026, 9, 1) - i * 3600e3).toISOString(), source: i % 2 ? "Website" : "Library" }
})
const patches = []
const server = createServer(async (req, res) => {
  const u = new URL(req.url, "http://x")
  if (u.pathname === "/") return res.end(html)
  if (u.pathname === "/app.js") { res.setHeader("content-type", "text/javascript"); return res.end(readFileSync(join(work, "app.js"))) }
  res.setHeader("content-type", "application/json")
  if (u.pathname === "/api/files" && req.method === "PATCH") { let b = ""; for await (const c of req) b += c; const body = JSON.parse(b); patches.push(body); await wait(120); return res.end(JSON.stringify({ ok: true, alt: body.alt })) }
  if (u.pathname === "/api/files") { await wait(150); return res.end(JSON.stringify({ files })) }
  if (u.pathname === "/api/files/usage") {
    await wait(120)
    const uses = (u.searchParams.get("path") || "").startsWith("u1/files/0-") ? [{ kind: "product", label: "Linen shirt", href: "/app/products/p1" }, { kind: "website", label: "Website: Home", href: "/app/website-builder" }] : []
    return res.end(JSON.stringify({ uses }))
  }
  if (u.pathname === "/_next/image") {
    const i = Number((u.searchParams.get("url") || "").match(/\/files\/(\d+)-/)?.[1] ?? 0)
    const p = SOURCES[i % SOURCES.length]
    res.setHeader("content-type", typeOf(p))
    res.setHeader("cache-control", "public, max-age=31536000")
    return res.end(readFileSync(join(root, p)))
  }
  res.statusCode = 404
  res.end("{}")
})
await new Promise((r) => server.listen(0, r))
const base = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
await browser.defaultBrowserContext().overridePermissions(base, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"])

async function answerMedia(cdp) {
  await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "https://storelib.com/*" }] })
  cdp.on("Fetch.requestPaused", (e) => {
    const i = Number(e.request.url.match(/\/files\/(\d+)-/)?.[1] ?? 0)
    const p = SOURCES[i % SOURCES.length]
    const body = readFileSync(join(root, p))
    cdp.send("Fetch.fulfillRequest", { requestId: e.requestId, responseCode: 200, responseHeaders: [{ name: "content-type", value: typeOf(p) }, { name: "access-control-allow-origin", value: "*" }], body: body.toString("base64") }).catch(() => {})
  })
}

const problems = []
const expect = (ok, what) => { if (!ok) problems.push(what) }
const results = []

for (const vp of [{ width: 390, height: 844, phone: true }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
  const page = await browser.newPage()
  if (vp.phone) await page.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" })
  else await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2 })
  const cdp = await page.createCDPSession()
  await answerMedia(cdp)
  await page.evaluateOnNewDocument(() => {
    window.__shift = 0
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shift += e.value }).observe({ type: "layout-shift", buffered: true })
  })
  await page.goto(base + "/")
  await page.waitForSelector("[data-file-tile] img[data-loaded]", { timeout: 20000 })
  await wait(900)
  const grid = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll("[data-file-tile] img[data-file-img]")]
    const first = imgs[0]
    return {
      tile: Math.round(first.closest("[data-file-box]").getBoundingClientRect().width),
      asked: Number(/[?&]w=(\d+)/.exec(first.currentSrc)?.[1] ?? 0),
      sizes: first.getAttribute("sizes"),
      lazy: imgs.filter((i) => i.loading === "lazy").length,
      eager: imgs.filter((i) => i.loading === "eager").length,
      shift: Number(window.__shift.toFixed(4)),
    }
  })
  expect(grid.asked >= grid.tile * (vp.phone ? 3 : 2) * 0.66, `${vp.width}: the tile asked for a ${grid.asked}px copy for a ${grid.tile}px tile`)
  expect(grid.lazy > 0 && grid.eager <= 12, `${vp.width}: lazy after the first rows`)

  /* Open the first file. */
  await page.click("[data-file-tile] button[data-file]")
  await page.waitForSelector("[data-file-copy]", { visible: true })
  await wait(700)
  const measure = () => page.evaluate(() => {
    const btn = document.querySelector("[data-file-copy]")
    const clone = btn.cloneNode(true)
    clone.style.cssText = "position:absolute;left:-9999px;top:0;width:max-content;flex:none;visibility:hidden"
    btn.parentElement.appendChild(clone)
    const natural = clone.getBoundingClientRect().width
    clone.remove()
    const field = document.querySelector("[data-file-link]")
    const input = document.querySelector("[data-file-link-url]")
    const column = field.parentElement
    const details = document.querySelector("[data-file-details]")
    const box = (details.closest("[data-slot='dialog-content']") || details.closest("[data-sheet-panel]") || details).getBoundingClientRect()
    const stage = document.querySelector("[data-file-stage]").getBoundingClientRect()
    const scrollers = [...details.querySelectorAll("*")].filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible" && el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")
    return {
      button: Math.round(btn.getBoundingClientRect().width * 10) / 10,
      natural: Math.round(natural * 10) / 10,
      label: btn.textContent.trim(),
      field: Math.round(field.getBoundingClientRect().width),
      column: Math.round(column.getBoundingClientRect().width - parseFloat(getComputedStyle(column).paddingLeft) - parseFloat(getComputedStyle(column).paddingRight)),
      cut: input.scrollWidth > input.clientWidth,
      box: { x: Math.round(box.left), y: Math.round(box.top), w: Math.round(box.width), h: Math.round(box.height) },
      stage: { w: Math.round(stage.width), h: Math.round(stage.height) },
      sideways: scrollers.length,
      name: document.querySelector("[data-file-details] h2")?.textContent ?? "",
    }
  })
  const before = await measure()
  await page.click("[data-file-copy]")
  await wait(150)
  const after = await measure()
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => "(unreadable)"))
  for (const [m, when] of [[before, "before"], [after, "copied"]]) {
    expect(m.button >= m.natural - 0.5, `${vp.width}: Copy button ${m.button}px under its natural ${m.natural}px (${when})`)
  }
  expect(after.label === "Copied", `${vp.width}: the button did not say Copied (${after.label})`)
  expect(clip === files[0].url || clip === "(unreadable)", `${vp.width}: the clipboard has ${clip}`)
  expect(before.cut, `${vp.width}: the long address is not cut inside the field`)
  expect(Math.abs(before.field - before.column) <= 1, `${vp.width}: the link field is ${before.field}px in a ${before.column}px column`)
  expect(before.box.x >= 0 && before.box.y >= 0 && before.box.x + before.box.w <= vp.width + 0.5 && before.box.y + before.box.h <= vp.height + 0.5, `${vp.width}: the window leaves the viewport ${JSON.stringify(before.box)}`)
  expect(before.sideways === 0, `${vp.width}: ${before.sideways} parts of the column scroll sideways`)

  /* Keys. */
  await page.keyboard.press("ArrowRight")
  await wait(250)
  const nextName = await page.evaluate(() => document.querySelector("[data-file-details] h2")?.textContent ?? "")
  await page.keyboard.press("ArrowLeft")
  await wait(250)
  const backName = await page.evaluate(() => document.querySelector("[data-file-details] h2")?.textContent ?? "")
  expect(nextName === files[1].name && backName === files[0].name, `${vp.width}: arrows went to ${nextName} and back to ${backName}`)

  /* Alt text. */
  const had = patches.length
  await page.click("[data-file-alt] textarea")
  await page.keyboard.type("A linen shirt on a chair")
  await page.click("[data-file-alt-save]")
  await page.waitForSelector("[data-file-alt-saved]", { timeout: 4000 }).catch(() => null)
  const altSaved = patches.length > had && patches[patches.length - 1].alt === "A linen shirt on a chair" && (await page.$("[data-file-alt-saved]")) !== null
  expect(altSaved, `${vp.width}: alt text was not saved`)

  /* Delete asks, and names where it is used. */
  await page.click("[data-file-delete]")
  await page.waitForSelector("[data-file-confirm-in-use]", { visible: true, timeout: 4000 }).catch(() => null)
  const warning = await page.evaluate(() => document.querySelector("[data-file-confirm-in-use]")?.textContent ?? "")
  expect(/Used in 2 places/.test(warning) && /Linen shirt/.test(warning) && /Website: Home/.test(warning), `${vp.width}: the delete question said "${warning}"`)
  await page.keyboard.press("Escape")
  await wait(500)
  const confirmGone = (await page.$("[data-file-confirm-in-use]")) === null || (await page.evaluate(() => !document.querySelector("[data-file-confirm-in-use]")?.getClientRects().length))

  /* Escape closes the view. */
  await page.keyboard.press("Escape")
  await wait(700)
  const closed = await page.evaluate(() => { const d = document.querySelector("[data-file-details]"); return !d || !d.getClientRects().length || d.getBoundingClientRect().top >= innerHeight - 2 })
  expect(closed, `${vp.width}: Escape did not close the view`)
  const errors = await page.evaluate(() => window.__err)
  expect(errors.length === 0, `${vp.width}: page errors ${errors.join(" | ")}`)

  results.push({ viewport: `${vp.width}x${vp.height}`, grid, before, after: { button: after.button, natural: after.natural, label: after.label }, keys: { next: nextName === files[1].name, back: backName === files[0].name }, altSaved, warning: warning.replace(/\s+/g, " ").trim(), confirmClosedByEscape: confirmGone, closed })
  await page.close()
}

await browser.close()
server.close()
for (const r of results) {
  console.log(`\n${r.viewport}`)
  console.log(`  grid     tile ${r.grid.tile}px, asked w=${r.grid.asked} (sizes "${r.grid.sizes}"), ${r.grid.eager} eager / ${r.grid.lazy} lazy, layout shift ${r.grid.shift}`)
  console.log(`  window   ${r.before.box.w}x${r.before.box.h} at ${r.before.box.x},${r.before.box.y}; picture stage ${r.before.stage.w}x${r.before.stage.h}; sideways scrollers ${r.before.sideways}`)
  console.log(`  link     field ${r.before.field}px in a ${r.before.column}px column, address cut: ${r.before.cut}`)
  console.log(`  copy     ${r.before.button}px (natural ${r.before.natural}px) "${r.before.label}" -> ${r.after.button}px (natural ${r.after.natural}px) "${r.after.label}"`)
  console.log(`  keys     next ${r.keys.next}, back ${r.keys.back}; alt saved ${r.altSaved}; Escape closed the question ${r.confirmClosedByEscape}, the view ${r.closed}`)
  console.log(`  delete   "${r.warning}"`)
}
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n  ${problems.join("\n  ")}`)
  process.exit(1)
}
console.log("\nall measurements passed")
