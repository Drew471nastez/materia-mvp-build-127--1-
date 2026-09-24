/**
 * ===========================================================================
 *  THE NAV PILL STAYS WHERE IT IS WHEN A SHEET OPENS AND CLOSES
 * ===========================================================================
 * "The mobile navigation sometimes disappears when the bottom sheet opens and
 * then suddenly appears or glitches back into position when the bottom sheet
 * closes." The pill used to step down to layer 0 while any sheet was open:
 * under the page's own content before the sheet had covered it, and back on
 * top of the sheet the moment it started to close.
 *
 * Against the built stylesheet, on a phone, with the pill, a page with a
 * positioned card over the bottom of the screen, and each kind of sheet the
 * app has (the shared BottomSheet's marker, a Radix Sheet, a Radix
 * AlertDialog, and a modal a page draws at the old layer 50):
 *   • the pill's layer is the same with a sheet open as without one;
 *   • with a sheet open, what is on top where the pill is, is the sheet;
 *   • nothing of the page's own ever covers the pill.
 *
 *   pnpm build && node scripts/check-pill-under-sheets.mjs
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createServer } from "node:http"
import puppeteer from "puppeteer-core"

const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style>
<style>body{margin:0;background:#f8f9fa}</style></head><body>
<div data-app-nav-pill="" class="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex items-end justify-center md:hidden" style="padding-bottom:16px">
  <div id="pill" style="pointer-events:auto;width:220px;height:56px;border-radius:28px;background:#1a1a2e"></div>
</div>
<main style="height:2000px;position:relative">
  <div id="card" style="position:fixed;left:0;right:0;bottom:0;height:140px;z-index:10;background:#fff">page's own card</div>
</main>
<div id="sheets"></div>
<script>
  window.sheets = {
    bottom: '<div data-app-sheet="open" role="dialog" aria-modal="true" class="fixed inset-0 z-[200]"><div class="absolute inset-x-0 bottom-0 h-[60vh] bg-white" data-sheet-body></div></div>',
    radix: '<div data-slot="sheet-overlay" class="fixed inset-0 z-50 bg-black/50"></div><div data-slot="sheet-content" class="fixed inset-x-0 bottom-0 z-50 h-[60vh] bg-white"></div>',
    alert: '<div data-slot="alert-dialog-overlay" class="fixed inset-0 z-50 bg-black/50"></div><div data-slot="alert-dialog-content" class="fixed left-[50%] top-[50%] z-50 w-[300px] h-[200px] bg-white"></div>',
    page: '<div class="fixed inset-0 z-[60] flex items-center justify-center" data-page-modal><div class="absolute inset-0 bg-black/50"></div></div>',
  }
</script>
</body></html>`

const server = createServer((_, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(html) })
await new Promise((r) => server.listen(0, r))
let bad = 0
const expect = (ok, what, got = "") => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got !== "" ? `   (${got})` : ""}`); if (!ok) bad++ }
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
const p = await browser.newPage()
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await p.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "load" })

const state = () => p.evaluate(() => {
  const pill = document.querySelector("[data-app-nav-pill]")
  const r = document.getElementById("pill").getBoundingClientRect()
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  return {
    z: getComputedStyle(pill).zIndex,
    y: Math.round(r.top),
    top: top?.id === "pill" ? "pill" : top?.id === "card" ? "page" : top ? "sheet" : "none",
  }
})
const closed = await state()
console.log("\nno sheet open")
expect(closed.top === "pill", "the pill is on top of the page's own content", JSON.stringify(closed))
for (const kind of ["bottom", "radix", "alert", "page"]) {
  console.log(`\n${kind} sheet open`)
  await p.evaluate((k) => { document.getElementById("sheets").innerHTML = window.sheets[k] }, kind)
  const open = await state()
  /* It steps under the overlay (app/globals.css, "the pill stays visible under a sheet") and keeps its place: nothing jumps, nothing vanishes. */
  expect(open.y === closed.y && Number(open.z) > 0, "the pill keeps its place, under the sheet", `${closed.z} → ${open.z}, ${closed.y} → ${open.y}`)
  expect(open.top === "sheet", "and the sheet is over it, never the page", open.top)
  await p.evaluate(() => { document.getElementById("sheets").innerHTML = "" })
  const after = await state()
  expect(after.top === "pill" && after.z === closed.z, "closed, the pill is already there", JSON.stringify(after))
}
await browser.close()
server.close()
console.log(bad ? `\n${bad} check(s) failed.` : "\nThe pill stays put; every sheet goes over it.")
process.exit(bad ? 1 : 0)
