/**
 * ===========================================================================
 *  "CHOOSE FROM YOUR FILES", WATCHED FRAME BY FRAME
 * ===========================================================================
 * scripts/render-files-picker.tsx mounts the real chooser over a settings
 * page. This serves it with a library of 60 pictures (/api/files answered
 * here, /_next/image answered with real resized copies made in the browser
 * first), then:
 *
 *   PHONE    390x844, touch, the CPU slowed four times. Open, a drag that
 *            follows the finger and is let go, a pill switch, a scroll of the
 *            grid, the three dots, Delete and its confirm, a flick closed.
 *   COMPUTER 1440x900. Open, the three dots' dropdown, a pill switch, Escape.
 *
 * For each it prints the longest gap between frames and how many were over
 * 20ms, and for the drag how far the sheet was from the finger on every
 * frame. It saves each sequence as a contact sheet of screencast frames
 * (OUT=<dir>, default a temp dir) to be looked at, and the thumbnail widths
 * the grid asked for.
 *
 *   node scripts/check-files-picker.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const THROTTLE = Number(process.env.THROTTLE ?? 4)
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const OUT = process.env.OUT ?? mkdtempSync(join(tmpdir(), "files-picker-"))
mkdirSync(OUT, { recursive: true })
const work = mkdtempSync(join(tmpdir(), "files-picker-build-"))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/* ── The bundle ── */
writeFileSync(join(work, "supabase.js"), `export const createClient = () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) }, storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: (p) => ({ data: { publicUrl: "https://storelib.com/media/store-builder-images/" + p } }) }) } })\n`)
writeFileSync(join(work, "sonner.js"), `const say = (kind) => (m) => { (window.__toasts ||= []).push(kind + ": " + m) }\nexport const toast = Object.assign(say("info"), { error: say("error"), success: say("success") })\nexport const Toaster = () => null\n`)
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-files-picker.tsx"),
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

/* ── The library: 60 pictures from the repository's own, in three sources ── */
const SOURCES = ["public/images/brand/storelib-og-v2.jpg", "public/modern-tech-product.png", "public/images/onepage-themes/nature.webp", "public/images/onepage-themes/fusion.webp", "public/images/design-mode/storelib.png", "public/product-launch-email-template.png"].filter((p) => existsSync(join(root, p)))
const FROM = ["Library", "Website", "Product photos"]
const files = Array.from({ length: 60 }, (_, i) => {
  const bucket = FROM[i % 3] === "Product photos" ? "product-images" : "store-builder-images"
  const path = bucket === "product-images" ? `c1/p${i}/${i}.jpg` : `u1/${FROM[i % 3] === "Library" ? "files" : "site"}/${i}.jpg`
  return { id: `${bucket}:${path}`, bucket, path, name: `photo-${i}.jpg`, url: `https://storelib.com/media/${bucket}/${path}`, bytes: 200000 + i * 1000, type: "image/jpeg", createdAt: new Date(Date.UTC(2026, 9, 1) - i * 3600e3).toISOString(), source: FROM[i % 3] }
})
const thumbs = new Map() // `${src}:${w}` -> Buffer
const asked = []
const deleted = []
const server = createServer(async (req, res) => {
  const u = new URL(req.url, "http://x")
  if (u.pathname === "/") return res.end(html)
  if (u.pathname === "/app.js") { res.setHeader("content-type", "text/javascript"); return res.end(readFileSync(join(work, "app.js"))) }
  if (u.pathname.startsWith("/src/")) { const p = SOURCES[Number(u.pathname.slice(5))]; res.setHeader("content-type", p.endsWith(".png") ? "image/png" : p.endsWith(".webp") ? "image/webp" : "image/jpeg"); return res.end(readFileSync(join(root, p))) }
  if (u.pathname === "/api/files") {
    if (req.method === "DELETE") { let b = ""; for await (const c of req) b += c; deleted.push(JSON.parse(b)); await wait(150); res.setHeader("content-type", "application/json"); return res.end('{"ok":true}') }
    await wait(250)
    res.setHeader("content-type", "application/json")
    return res.end(JSON.stringify({ files: files.filter((f) => !deleted.some((d) => d.path === f.path)) }))
  }
  if (u.pathname === "/_next/image") {
    const w = Number(u.searchParams.get("w"))
    const i = Number((u.searchParams.get("url") || "").match(/\/(\d+)\.jpg$/)?.[1] ?? 0)
    asked.push(w)
    const buf = thumbs.get(`${i % SOURCES.length}:${w}`)
    if (!buf) { res.statusCode = 400; return res.end() }
    await wait(30 + ((i * 37) % 120))
    res.setHeader("content-type", "image/webp")
    res.setHeader("cache-control", "public, max-age=31536000")
    return res.end(buf)
  }
  res.statusCode = 404
  res.end()
})
await new Promise((r) => server.listen(0, r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })

/* The resized copies, made by the browser from the originals, as the optimizer would. */
{
  const page = await browser.newPage()
  await page.goto(base + "/src/0")
  for (let s = 0; s < SOURCES.length; s++) {
    for (const w of [128, 256, 384, 1080]) {
      const data = await page.evaluate(async (src, w) => {
        const img = new Image()
        img.src = src
        await img.decode()
        const c = document.createElement("canvas")
        c.width = w
        c.height = Math.round((img.naturalHeight / img.naturalWidth) * w)
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height)
        return c.toDataURL("image/webp", 0.75).split(",")[1]
      }, `/src/${s}`, w)
      thumbs.set(`${s}:${w}`, Buffer.from(data, "base64"))
    }
  }
  await page.close()
}

/* ── Watching ── */
async function session(phone) {
  const page = await browser.newPage()
  if (phone) await page.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" })
  else await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
  if (process.env.REDUCED) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  await page.goto(base + "/")
  await page.waitForSelector("[data-open-chooser]")
  await page.evaluate(() => {
    window.__frames = []
    window.__shifts = []
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shifts.push({ t: e.startTime, v: e.value }) }).observe({ type: "layout-shift", buffered: false })
    const tick = (t) => {
      const panel = document.querySelector("[data-files-chooser]")?.closest("[data-sheet-panel]")
      /* How far the panel is below where it rests (its top as drawn, which includes the drag). */
      const ty = panel && window.__restTop != null ? panel.getBoundingClientRect().top - window.__restTop : null
      window.__frames.push({ t, ty, finger: window.__finger ?? null })
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const cdp = await page.createCDPSession()
  if (phone) await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
  return { page, cdp, phone }
}

async function film(s, name, action, settle = 700) {
  const shots = []
  const onFrame = (f) => { shots.push(f.data); s.cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}) }
  s.cdp.on("Page.screencastFrame", onFrame)
  const vp = s.page.viewport()
  await s.cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, everyNthFrame: 1, maxWidth: Math.round(vp.width * (s.phone ? 1 : 0.5)), maxHeight: Math.round(vp.height * (s.phone ? 1 : 0.5)) })
  await wait(80)
  const t0 = await s.page.evaluate(() => performance.now())
  await action()
  await wait(settle)
  const t1 = await s.page.evaluate(() => performance.now())
  await s.cdp.send("Page.stopScreencast")
  s.cdp.off("Page.screencastFrame", onFrame)
  const got = await s.page.evaluate((a, b) => ({ frames: window.__frames.filter((f) => f.t >= a && f.t < b), shifts: window.__shifts.filter((x) => x.t >= a && x.t < b) }), t0, t1)
  const gaps = got.frames.slice(1).map((f, k) => f.t - got.frames[k].t)
  const result = {
    name,
    frames: got.frames.length,
    worstGapMs: Math.round(Math.max(0, ...gaps)),
    over20: gaps.filter((g) => g > 20).length,
    over34: gaps.filter((g) => g > 34).length,
    shift: Number(got.shifts.reduce((a, x) => a + x.v, 0).toFixed(4)),
    shots: shots.length,
  }
  /* The contact sheet: every screencast frame in order, to be looked at. */
  const pick = shots.length > 24 ? shots.filter((_, i) => i % Math.ceil(shots.length / 24) === 0) : shots
  const sheet = await browser.newPage()
  const cols = s.phone ? 8 : 4
  const w = s.phone ? 195 : 360
  await sheet.setViewport({ width: cols * (w + 4), height: 400, deviceScaleFactor: 1 })
  await sheet.setContent(`<body style="margin:0;background:#222;display:flex;flex-wrap:wrap;gap:4px">${pick.map((d, i) => `<div style="position:relative"><img style="width:${w}px;display:block" src="data:image/jpeg;base64,${d}"><b style="position:absolute;left:4px;top:4px;color:#fff;background:#000a;font:12px monospace;padding:1px 4px">${i}</b></div>`).join("")}</body>`)
  await sheet.evaluate(() => Promise.all(Array.from(document.images, (i) => i.decode().catch(() => {}))))
  await sheet.screenshot({ path: join(OUT, `${s.phone ? "phone" : "desk"}-${name}.png`), fullPage: true })
  await sheet.close()
  return { result, frames: got.frames }
}

const results = []
const report = (r) => { results.push(r); console.log(`  ${r.name.padEnd(22)} frames ${String(r.frames).padStart(3)}  worst gap ${String(r.worstGapMs).padStart(3)}ms  >20ms ${r.over20}  >34ms ${r.over34}  shift ${r.shift}${r.extra ? "  " + r.extra : ""}`) }

/* ── Phone ── */
console.log(`\nPHONE 390x844, CPU ${THROTTLE}x slower`)
{
  const s = await session(true)
  const { page, cdp } = s
  const touch = (type, x, y) => {
    return page.evaluate((y) => { window.__finger = y }, y).then(() => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] }))
  }
  const open = await film(s, "open", async () => { await page.tap("[data-open-chooser]") }, 900)
  report(open.result)
  await page.waitForSelector("[data-files-grid] img[data-loaded]", { timeout: 8000 })
  await wait(1200)
  const loaded = await page.evaluate(() => ({ tiles: document.querySelectorAll("[data-files-grid] > li:not([hidden])").length, loaded: document.querySelectorAll("[data-files-grid] img[data-loaded]").length, eager: document.querySelectorAll('[data-files-grid] img[loading="eager"]').length, decoding: document.querySelector("[data-files-grid] img")?.getAttribute("decoding"), current: document.querySelector("[data-files-grid] img")?.currentSrc.replace(/^.*\/_next/, "/_next").slice(0, 80) }))
  console.log(`  grid: ${loaded.tiles} tiles, ${loaded.loaded} shown so far, ${loaded.eager} eager, decoding=${loaded.decoding}, first tile from ${loaded.current}`)

  /* A drag from the handle: down 260px over 32 moves at about 8ms, back up 200px, let go. Where the sheet is, against the finger, every frame. */
  await page.evaluate(() => { window.__restTop = document.querySelector("[data-files-chooser]").closest("[data-sheet-panel]").getBoundingClientRect().top })
  const handle = await page.evaluate(() => { const r = document.querySelector("[data-files-chooser]").closest("[data-sheet-panel]").querySelector("[data-sheet-handle]").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  const drag = await film(s, "drag", async () => {
    await touch("touchStart", handle.x, handle.y)
    for (let i = 1; i <= 32; i++) { await touch("touchMove", handle.x, handle.y + i * 8); await wait(8) }
    for (let i = 1; i <= 25; i++) { await touch("touchMove", handle.x, handle.y + 256 - i * 8); await wait(8) }
    await wait(60)
    await touch("touchEnd", handle.x, handle.y + 56)
    await page.evaluate(() => { window.__finger = null })
  }, 700)
  const follow = drag.frames.filter((f) => f.finger !== null && f.ty !== null).map((f) => Math.abs((f.finger - handle.y) - f.ty))
  /* The first frames are the sheet deciding the touch is a drag (a few px of slop). */
  const lag = follow.slice(3)
  drag.result.extra = `finger to sheet: median ${lag.length ? Math.round(lag.sort((a, b) => a - b)[Math.floor(lag.length / 2)]) : "?"}px, worst ${lag.length ? Math.round(Math.max(...lag)) : "?"}px over ${lag.length} frames; rests at ${Math.round(drag.frames.at(-1)?.ty ?? -1)}px`
  report(drag.result)

  const pill = await film(s, "pill-website", async () => { await page.tap('[data-files-pill="Website"]') }, 500)
  pill.result.extra = `${await page.evaluate(() => document.querySelectorAll("[data-files-grid] > li:not([hidden])").length)} shown`
  report(pill.result)
  const pill2 = await film(s, "pill-all", async () => { await page.tap('[data-files-pill="All"]') }, 500)
  report(pill2.result)
  const search = await film(s, "search", async () => { await page.type('input[type="search"]', "1", { delay: 40 }) }, 500)
  report(search.result)
  await page.evaluate(() => { const i = document.querySelector('input[type="search"]'); i.blur() })
  await page.tap('[data-files-pill="All"]')
  await page.evaluate(() => {
    const i = document.querySelector('input[type="search"]')
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set
    set.call(i, "")
    i.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await wait(500)

  /* A scroll of the grid with the finger: a slow pull up through the library. */
  const grid = await page.evaluate(() => { const r = document.querySelector("[data-files-scroll]").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * 0.75 } })
  const scroll = await film(s, "scroll", async () => {
    await touch("touchStart", grid.x, grid.y)
    for (let i = 1; i <= 40; i++) { await touch("touchMove", grid.x, grid.y - i * 9); await wait(8) }
    await touch("touchEnd", grid.x, grid.y - 360)
    await page.evaluate(() => { window.__finger = null })
  }, 900)
  scroll.result.extra = `scrolled to ${await page.evaluate(() => Math.round(document.querySelector("[data-files-scroll]").scrollTop))}px`
  report(scroll.result)
  await page.evaluate(() => { document.querySelector("[data-files-scroll]").scrollTop = 0 })
  await wait(300)

  /* The three dots, Delete, its confirm. */
  const dots = await film(s, "menu", async () => { await page.tap('[data-files-grid] > li:nth-child(2) [data-file-menu]') }, 700)
  report(dots.result)
  const rows = await page.evaluate(() => Array.from(document.querySelectorAll("[data-action-sheet] button, [data-action-sheet] a")).map((b) => b.textContent.trim()))
  console.log(`  menu rows: ${rows.join(", ")}`)
  const target = await page.evaluate(() => document.querySelector("[data-files-grid] > li:nth-child(2)").getAttribute("data-file-tile"))
  await page.evaluate(() => Array.from(document.querySelectorAll("[data-action-sheet] button, [data-action-sheet] a")).find((b) => b.textContent.trim() === "Delete").click())
  await page.waitForSelector("[data-file-confirm-delete]", { timeout: 4000 })
  await wait(600)
  await page.screenshot({ path: join(OUT, "phone-confirm.png") })
  await page.tap("[data-file-confirm-delete]")
  await wait(900)
  const gone = await page.evaluate((id) => !document.querySelector(`[data-file-tile="${CSS.escape(id)}"]`), target)
  console.log(`  delete: API called with ${JSON.stringify(deleted.at(-1))}, tile gone: ${gone}, toasts: ${JSON.stringify(await page.evaluate(() => window.__toasts || []))}`)

  /* A flick down from the handle closes it. */
  const h2 = await page.evaluate(() => { const r = document.querySelector("[data-files-chooser]").closest("[data-sheet-panel]").querySelector("[data-sheet-handle]").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  /* Straight to the browser, with no script between the moves, so the release carries the finger's speed. */
  const raw = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] })
  const close = await film(s, "flick-close", async () => {
    await raw("touchStart", h2.x, h2.y)
    for (let i = 1; i <= 8; i++) await raw("touchMove", h2.x, h2.y + i * 30)
    await raw("touchEnd", h2.x, h2.y + 240)
  }, 800)
  close.result.extra = `closed: ${await page.evaluate(() => !document.querySelector("[data-app-sheet='open'] [data-files-chooser]"))}`
  report(close.result)

  const reopen = await film(s, "reopen (kept list)", async () => { await page.tap("[data-open-chooser]") }, 700)
  reopen.result.extra = `tiles on the first frames: ${await page.evaluate(() => document.querySelectorAll("[data-files-grid] > li:not([hidden])").length)}, placeholders: ${await page.evaluate(() => document.querySelectorAll("[data-files-waiting]").length)}`
  report(reopen.result)
  await wait(400)
  const scrim = await film(s, "tap-outside-close", async () => { await page.touchscreen.tap(195, 40) }, 700)
  scrim.result.extra = `closed: ${await page.evaluate(() => !document.querySelector("[data-app-sheet='open'] [data-files-chooser]"))}`
  report(scrim.result)
  console.log(`  errors: ${JSON.stringify(await page.evaluate(() => window.__err))}`)
  await page.close()
}

/* ── Computer ── */
console.log(`\nCOMPUTER 1440x900`)
{
  const s = await session(false)
  const { page } = s
  /* The screencast itself costs frames on a computer-sized page, so open and close are timed once without it first. */
  const bare = async (name, action, settle) => {
    const t0 = await page.evaluate(() => performance.now())
    await action()
    await wait(settle)
    const fr = await page.evaluate((a) => window.__frames.filter((f) => f.t >= a).map((f) => f.t), t0)
    const gaps = fr.slice(1).map((t, k) => t - fr[k])
    report({ name, frames: fr.length, worstGapMs: Math.round(Math.max(0, ...gaps)), over20: gaps.filter((g) => g > 20).length, over34: gaps.filter((g) => g > 34).length, shift: 0 })
  }
  await bare("open (no film)", () => page.click("[data-open-chooser]"), 700)
  await page.waitForSelector("[data-files-grid] img[data-loaded]", { timeout: 8000 })
  await wait(600)
  await bare("pill (no film)", () => page.click('[data-files-pill="Website"]'), 500)
  await page.click('[data-files-pill="All"]')
  await wait(400)
  await bare("escape (no film)", () => page.keyboard.press("Escape"), 600)
  await wait(300)
  const open = await film(s, "open", async () => { await page.click("[data-open-chooser]") }, 700)
  report(open.result)
  await page.waitForSelector("[data-files-grid] img[data-loaded]", { timeout: 8000 })
  await wait(800)
  const box = await page.evaluate(() => { const r = document.querySelector("[data-files-chooser]").getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) } })
  console.log(`  window ${box.w}x${box.h}`)
  await page.hover("[data-files-grid] > li:nth-child(3)")
  const menu = await film(s, "menu", async () => { await page.click("[data-files-grid] > li:nth-child(3) [data-file-menu]") }, 400)
  report(menu.result)
  console.log(`  dropdown rows: ${await page.evaluate(() => Array.from(document.querySelectorAll("[data-action-list] [role=menuitem]")).map((b) => b.textContent.trim()).join(", "))}`)
  await page.screenshot({ path: join(OUT, "desk-menu-open.png") })
  /* Headless Chromium reports no hover and no fine pointer, so the dots show here as on a touch screen. What a mouse gets is the rule itself. */
  const flat = css.replace(/\s+/g, " ")
  const at = flat.indexOf(String.raw`.\[\@media\(hover\:hover\)_and_\(pointer\:fine\)\]\:opacity-0 {`)
  const rule = at >= 0 && flat.slice(at, at + 160).includes("@media (hover:hover) and (pointer:fine) { opacity: 0%")
  console.log(`  with a mouse the dots wait for the pointer (rule in the stylesheet): ${rule}; headless reports hover: ${await page.evaluate(() => matchMedia("(hover:hover)").matches)}`)
  await page.keyboard.press("Escape")
  await wait(300)
  const pill = await film(s, "pill-product", async () => { await page.click('[data-files-pill="Product photos"]') }, 500)
  report(pill.result)
  await page.click('[data-files-pill="All"]')
  await wait(400)
  const close = await film(s, "escape-close", async () => { await page.keyboard.press("Escape") }, 500)
  close.result.extra = `closed: ${await page.evaluate(() => !document.querySelector("[data-files-chooser]"))}`
  report(close.result)
  console.log(`  errors: ${JSON.stringify(await page.evaluate(() => window.__err))}`)
  await page.close()
}

const widths = asked.reduce((a, w) => ((a[w] = (a[w] || 0) + 1), a), {})
console.log(`\nthumbnail widths asked for: ${JSON.stringify(widths)}`)
console.log(`frames saved in ${OUT}`)
writeFileSync(join(OUT, "results.json"), JSON.stringify({ results, widths }, null, 2))
await browser.close()
server.close()
