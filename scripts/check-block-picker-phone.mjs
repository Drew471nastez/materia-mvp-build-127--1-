/**
 * ===========================================================================
 *  ADD BLOCK ON A PHONE, FROM THE CANVAS (round 58)
 * ===========================================================================
 * The owner's screenshot: Add block pressed between two blocks ON THE CANVAS
 * of a phone opened the computer's panel, 410 wide, its list taking 280 of
 * that and the preview a 64px sliver with a speck in it. The phone's own
 * sheet (drag handle, safe area, the preview edge to edge) only opened from
 * the sidebar's row, because the picker asked whether the row it was opened
 * from sat inside the sections sheet, and the canvas is not.
 *
 * The real editor (editor-probe-harness.mjs) at 360, 390, 768 and 1280, the
 * canvas's own Add block (the strip between two blocks, found by moving a
 * mouse over the gap, as a narrow window or a phone with a pointer does):
 *
 *   WHICH     the sheet under 768, the panel from 768 up
 *   PREVIEW   the preview pane's size and how much of it the block fills
 *   OPEN      the sheet's top edge sampled each frame while it comes in:
 *             it only rises (no jump back), and is up within 500ms
 *   KEYS      the search field is 16px on a phone (iOS does not zoom)
 *   CLOSE     a tap above the sheet puts it away
 *
 *   node scripts/check-block-picker-phone.mjs
 *   SHOTS=/path node scripts/check-block-picker-phone.mjs
 */
import { createServer } from "node:http"
import { mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import puppeteer from "puppeteer-core"
import { bundle, css } from "./editor-probe-harness.mjs"
import { interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS ?? join(tmpdir(), "storelib-block-picker-phone")
const LABEL = process.env.LABEL ?? "now"
mkdirSync(SHOTS, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const SECTION = "blocks_section-1"

const js = readFileSync(bundle)
const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${interFaces()}</style><style>${css}</style></head><body><div id="app"></div>
<script>
  window.PROBE_SHORT = false
  window.PROBE_PAGES = { home: ["header", "blocks_section", "product", "features_grid", "footer"] }
</script>
<script src="/editor-probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.startsWith("/editor-probe.js")) {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(js)
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(page)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"] })

let bad = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) bad++
}

for (const [w, h] of [[360, 740], [390, 844], [768, 1024], [1280, 800]]) {
  const phone = w < 768
  const p = await browser.newPage()
  await p.setViewport({ width: w, height: h, deviceScaleFactor: 2 })
  await p.goto(`${origin}/editor`, { waitUntil: "load" })
  await p.waitForFunction(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length >= 3, { timeout: 60_000 })
  await sleep(2500)
  console.log(`\n══ ${w} × ${h} ══\n`)
  /* The section on screen, then the mouse down its middle until the strip between two blocks shows. */
  await p.evaluate((id) => document.getElementById(`wb-section-${id}`)?.scrollIntoView({ block: "center" }), SECTION)
  await sleep(400)
  const box = await p.evaluate((id) => { const r = document.getElementById(`wb-section-${id}`).getBoundingClientRect(); return { x: r.left + r.width / 2, top: Math.max(0, r.top), bottom: Math.min(innerHeight, r.bottom) } }, SECTION)
  let found = false
  for (let y = box.top + 30; y < box.bottom - 30 && !found; y += 6) {
    await p.mouse.move(box.x, y)
    await sleep(40)
    found = await p.evaluate(() => !!document.querySelector("[data-wb-block-insert-button]"))
  }
  if (!found) { expect(false, "the canvas's Add block strip shows under the mouse"); await p.close(); continue }
  await sleep(250)
  const btn = await p.evaluate(() => { const r = document.querySelector("[data-wb-block-insert-button]").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await p.evaluate(() => {
    window.__frames = []
    const t0 = performance.now()
    const tick = () => {
      const sheet = document.querySelector("[data-block-picker='phone']")?.closest("[data-mobile-bottom-sheet]")
      const panel = document.querySelector("[data-block-picker='desktop']")
      const el = sheet ?? panel
      if (el) { const r = el.getBoundingClientRect(); window.__frames.push([Math.round(performance.now() - t0), Math.round(r.top), +Number(getComputedStyle(el).opacity).toFixed(2)]) }
      if (performance.now() - t0 < 900) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await p.mouse.click(btn.x, btn.y)
  await sleep(1000)
  const st = await p.evaluate(() => {
    const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) } }
    const sheetBody = document.querySelector("[data-block-picker='phone']")
    const sheet = sheetBody?.closest("[data-mobile-bottom-sheet]")
    const panel = document.querySelector("[data-block-picker='desktop']")
    const pane = document.querySelector("[data-block-preview]")
    const stage = pane?.querySelector("[data-bp-showing]")
    const win = stage?.getAttribute("data-bp-window")?.split(" ").map(Number)
    const scale = Number(stage?.getAttribute("data-bp-scale") || 0)
    const clip = pane?.querySelector("[data-bp-clip]")
    const cr = clip?.getBoundingClientRect(), pr = pane?.getBoundingClientRect()
    const search = document.querySelector("[data-block-picker-search]")
    const handle = sheet?.querySelector(".cursor-grab.touch-none") ?? null
    return {
      kind: sheetBody ? "sheet" : panel ? "panel" : "none",
      surface: rect(sheet ?? panel),
      pane: rect(pane),
      canvas: rect(document.querySelector("[data-block-picker-canvas]")),
      /* How much of the pane the drawn block takes, in each direction. */
      fill: cr && pr ? { w: Math.round((cr.width / pr.width) * 100), h: Math.round((cr.height / pr.height) * 100) } : null,
      scale: +scale.toFixed(3),
      window: win ?? null,
      showing: stage?.getAttribute("data-bp-showing") ?? null,
      used: [...document.querySelectorAll("[data-block-picker-closed] [role='option']")].map((r) => r.textContent.trim()),
      heading: document.querySelector("[data-block-picker-heading]")?.textContent.trim() ?? null,
      searchFont: search ? getComputedStyle(search).fontSize : null,
      handle: !!handle,
      paddingBottom: sheetBody ? getComputedStyle(sheetBody.lastElementChild).paddingBottom : null,
      overflow: document.documentElement.scrollWidth - innerWidth,
    }
  })
  const frames = await p.evaluate(() => window.__frames)
  console.log(`  --    ${JSON.stringify({ kind: st.kind, surface: st.surface, pane: st.pane, canvas: st.canvas, fill: st.fill, scale: st.scale, showing: st.showing, used: st.used, heading: st.heading, searchFont: st.searchFont, handle: st.handle })}`)
  expect(st.kind === (phone ? "sheet" : "panel"), phone ? "a phone gets the sheet" : "a computer gets the panel", st.kind)
  if (phone) {
    expect(st.surface && st.surface.w === w, "the sheet is the screen's width", st.surface)
    expect(st.canvas && st.canvas.w === w && st.canvas.h >= 180, "the preview is the sheet's own canvas, edge to edge, at least 180 tall", st.canvas)
    expect(st.searchFont === "16px", "the search is 16px (iOS does not zoom into it)", st.searchFont)
    expect(st.handle, "the sheet has its drag handle")
    expect(/calc|px/.test(st.paddingBottom ?? "") && parseFloat(st.paddingBottom) >= 12, "the Add button clears the home indicator (12px plus the safe area)", st.paddingBottom)
    const tops = frames.map((f) => f[1])
    const rises = tops.every((t, i) => i === 0 || t <= tops[i - 1] + 1)
    const settled = frames.find((f, i) => i > 0 && frames.slice(i).every((g) => Math.abs(g[1] - f[1]) <= 1))
    expect(rises, "the sheet only rises while it comes in", tops.slice(0, 40))
    expect(settled && settled[0] <= 500, "and is up within 500ms", settled)
  } else {
    expect(st.pane && st.pane.w >= 380, "the preview pane is at least 380 wide", st.pane)
  }
  /* A block drawn at its own size (scale 1, a button) is not blown up to fill: it is shown as it will be. */
  expect(st.fill && (st.fill.w >= 60 || st.fill.h >= 60 || st.scale >= 1), "the block fills most of the preview in one direction, or is at its own size", { fill: st.fill, scale: st.scale })
  expect(st.overflow <= 0, "nothing wider than the window", st.overflow)
  await p.screenshot({ path: join(SHOTS, `${LABEL}-canvas-add-block-${w}.png`) })
  /* Put away: a tap (a click) above the sheet, or Escape. */
  if (phone) await p.mouse.click(Math.round(w / 2), 20)
  else await p.keyboard.press("Escape")
  await sleep(700)
  const open = await p.evaluate(() => !!document.querySelector("[data-block-picker][data-picker-open]") || document.querySelector("[data-block-picker-layer]")?.getAttribute("data-state") === "open")
  expect(!open, "put away")
  await p.close()
}

await browser.close()
server.close()
console.log(bad ? `\n${bad} failed\n` : "\nall good\n")
process.exit(bad && process.env.REPORT_ONLY !== "1" ? 1 : 0)
