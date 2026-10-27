/**
 * ===========================================================================
 *  A SECTION'S SCRIPT ASKS FOR ANOTHER SECTION; THE PAGE SCROLLS (round 25)
 * ===========================================================================
 * A section's script runs in a frame with no origin and cannot scroll the
 * page it is drawn on. It asks (storelib.scrollToSection, or navigate() to a
 * section of this page) and the page checks and scrolls itself
 * (components/website-builder/sections/section-sandbox.tsx, reveal). The
 * product's own provider and guest, in Chromium, on the live page (the
 * window scrolls) and in the builder's canvas (#wb-preview-root scrolls):
 *
 *   - the section lands just below the sticky header, one way;
 *   - navigate("/#section-…") to this page is the same scroll, in the
 *     editor too, never a page load;
 *   - a key that names nothing, or one written to break out of a
 *     selector, moves nothing and breaks nothing;
 *   - reduced motion: there at once.
 *
 *   node scripts/check-section-scroll-bridge.mjs
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const dir = mkdtempSync(join(root, ".scroll-bridge-"))
let js
try {
  execFileSync("pnpm", ["exec", "esbuild", "scripts/render-section-scroll-bridge.tsx", "--bundle", "--format=iife", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "app.js")}`,
    '--define:process.env.NODE_ENV="production"', '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"}};globalThis.process=process;', `--alias:@=${root}`, "--loader:.css=empty"], { stdio: "inherit" })
  js = readFileSync(join(dir, "app.js"), "utf8")
} finally {
  rmSync(dir, { recursive: true, force: true })
}
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
const server = createServer((req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(html) })
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}/`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] })

for (const [name, query, reduced] of [["the live page", "", false], ["the builder's canvas", "?editor=1", false], ["the live page, reduced motion", "", true]]) {
  console.log(`\n${name}`)
  const p = await browser.newPage()
  await p.setViewport({ width: 1200, height: 800 })
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }])
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 160)))
  let loads = 0
  p.on("framenavigated", (f) => { if (f === p.mainFrame()) loads++ })
  await p.evaluateOnNewDocument(() => { window.__msgs = []; addEventListener("message", (e) => { try { window.__msgs.push(JSON.stringify(e.data).slice(0, 120)) } catch {} }) })
  await p.goto(base + query)
  await sleep(1500)
  const y = () => p.evaluate(() => { const sc = document.getElementById("wb-preview-root"); return Math.round(sc ? sc.scrollTop : scrollY) })
  const top = (id) => p.evaluate((id) => { const el = document.querySelector(`[data-section-key="${id}"]`); const sc = document.getElementById("wb-preview-root"); return Math.round(el.getBoundingClientRect().top - (sc ? sc.getBoundingClientRect().top : 0)) }, id)
  const press = async (sel) => { const b = await p.$(sel); const box = await b.boundingBox(); await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2) }
  const frames = (ms) => p.evaluate((ms) => new Promise((done) => { const ys = []; const sc = document.getElementById("wb-preview-root"); const t0 = performance.now(); const tick = () => { ys.push(Math.round(sc ? sc.scrollTop : scrollY)); if (performance.now() - t0 < ms) requestAnimationFrame(tick); else done(ys) }; requestAnimationFrame(tick) }), ms)

  /* scrollToSection("benefits") from the first section. */
  const seen = frames(1400)
  await press('[data-section-key="intro"] [data-ask]')
  const ys = await seen
  const landed = await top("benefits")
  const between = new Set(ys.filter((v) => v !== ys[0] && v !== ys.at(-1))).size
  expect(Math.abs(landed - 64) <= 2, "the section lands just below the sticky header", { top: landed })
  expect(ys.every((v, i) => i === 0 || v >= ys[i - 1]), "one way", { from: ys[0], to: ys.at(-1) })
  if (reduced) expect(between === 0, "with no travel for reduced motion", between)
  else expect(between > 3, "travelling, not jumping", between)

  /* Back up, then navigate("/#section-benefits") from a section that declared navigation. */
  await p.evaluate(() => { const sc = document.getElementById("wb-preview-root"); if (sc) sc.scrollTop = 0; else scrollTo(0, 0) })
  await sleep(300)
  const loadsBefore = loads
  /* Off screen: pressed as an element click, which the page forwards to the script like a real one. */
  await p.$eval('[data-section-key="faq"] [data-nav]', (b) => b.click())
  await sleep(1400)
  expect(Math.abs((await top("benefits")) - 64) <= 2 && loads === loadsBefore, "navigate() to a section of this page is the same scroll, never a page load", { top: await top("benefits"), loads: loads - loadsBefore })

  /* A key naming nothing, and one written to break out of a selector. */
  const before = await y()
  await p.$eval('[data-section-key="faq"] [data-ask]', (b) => b.click())
  await sleep(500)
  await p.$eval('[data-section-key="evil"] [data-ask]', (b) => b.click())
  await sleep(500)
  const after = await y()
  const shown = await p.evaluate(() => getComputedStyle(document.body).display)
  const asked = await p.evaluate(() => window.__msgs.filter((m) => m.includes('"reveal"')).length)
  expect(after === before && shown !== "none" && asked >= 3, "a key that names nothing, or tries to break out, moves nothing and breaks nothing (asked, and refused)", { before, after, body: shown, asked })
  expect(errors.length === 0, "no errors on the page", errors)
  await p.close()
}

await browser.close()
server.close()
console.log(`\n${broken ? `${broken} FAILED` : "all ok"}`)
process.exit(broken ? 1 : 0)
