/**
 * THE ANALYTICS REPORTS, MEASURED
 *
 * Mounts the real cards in Chromium with the build's CSS, holds the data back,
 * then lets it arrive and checks: no card moved or changed height when the
 * figures landed, the page never scrolls sideways on a phone, every card has
 * its figure, the tabs switch what a card lists, and the chart answers a
 * pointer with the figures for that day. Screenshots at desktop and phone.
 *
 *   pnpm build && node scripts/check-analytics-reports.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) { console.error("Run `pnpm build` first."); process.exit(1) }
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")
const out = mkdtempSync(join(tmpdir(), "storelib-reports-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
execFileSync("npx", ["esbuild", join(root, "scripts/render-analytics-reports.tsx"), "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
  `--alias:@=${root}`, "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--loader:.css=empty", "--log-level=error"], { cwd: root, stdio: "inherit" })
const bundle = readFileSync(join(out, "probe.js"))
const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0}</style></head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};localStorage.setItem("storelib_timezone","Europe/Bucharest");window.__cls=0;new PerformanceObserver(l=>{for(const e of l.getEntries())window.__cls+=e.value}).observe({type:"layout-shift",buffered:true})</script><script src="/probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  res.writeHead(200, { "content-type": "text/html" }); res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`
let broken = 0
const expect = (ok, what, got) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`); if (!ok) broken++ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const boxes = (p) => p.evaluate(() => [...document.querySelectorAll("section")].map((s) => { const r = s.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] }))

for (const [name, vp] of [["desktop, 1440 wide", { width: 1440, height: 1000 }], ["phone, 390 wide", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
  console.log(`\n${name}`)
  const p = await browser.newPage()
  await p.emulateTimezone("Europe/Bucharest")
  await p.setViewport(vp)
  await p.goto(origin, { waitUntil: "load" })
  await p.waitForSelector("section")
  await sleep(300)
  const before = await boxes(p)
  await p.evaluate(() => window.__cls = 0)
  await p.evaluate(() => window.__release())
  await sleep(700)
  const after = await boxes(p)
  const cls = await p.evaluate(() => window.__cls)
  const moved = before.map((b, i) => [b, after[i]]).filter(([b, a]) => !a || b.some((v, j) => Math.abs(v - a[j]) > 1))
  expect(before.length === 11 && after.length === 11, "eleven report cards", after.length)
  expect(moved.length === 0, "no card moved or changed size when the figures arrived", moved.slice(0, 3))
  expect(cls < 0.001, "no layout shift", cls)
  const width = await p.evaluate(() => document.documentElement.scrollWidth)
  expect(width <= vp.width, "the page never scrolls sideways", width)
  const titles = await p.$$eval("section h3", (hs) => hs.map((h) => h.textContent))
  expect(titles.includes("Average order value over time") && titles.includes("Total sales by product") && titles.includes("Sessions by traffic source"), "the reports asked for are there", titles)
  const figures = await p.$$eval("section", (ss) => ss.map((s) => s.querySelector(".text-\\[24px\\], svg, ol, .grid-cols-4") ? 1 : 0))
  expect(figures.every(Boolean), "every card shows a figure, a chart or a list", figures)
  await p.screenshot({ path: join(shots, `${name.split(",")[0]}-reports.png`), fullPage: true })

  /* Tabs change the list. */
  const listOf = () => p.evaluate(() => [...[...document.querySelectorAll("section")].find((s) => s.querySelector("h3").textContent === "Sessions by traffic source").querySelectorAll("ol li span.truncate")].map((x) => x.textContent))
  const sources = await listOf()
  await p.evaluate(() => [...document.querySelectorAll("section")].find((s) => s.querySelector("h3").textContent === "Sessions by traffic source").querySelector("[role=tab]:nth-child(3)").click())
  await sleep(150)
  const social = await listOf()
  expect(sources.includes("Direct") && social.includes("Instagram") && !social.includes("Direct"), "the Social tab lists the apps, not the sources", { sources, social })

  /* The chart answers a pointer. */
  const svg = await p.evaluateHandle(() => [...document.querySelectorAll("section")].find((s) => s.querySelector("h3").textContent === "Sessions over time").querySelector("svg"))
  await svg.evaluate((el) => el.scrollIntoView({ block: "center" }))
  await sleep(200)
  const r = await svg.boundingBox()
  /* A pointer on the desktop, a finger on the phone: a tap has to leave the
     figures up, not flash them while the finger lifts. */
  if (vp.hasTouch) await p.touchscreen.tap(r.x + r.width * 0.6, r.y + r.height / 2)
  else await p.mouse.move(r.x + r.width * 0.6, r.y + r.height / 2)
  await sleep(400)
  const tip = await p.evaluate(() => [...document.querySelectorAll("section")].find((s) => s.querySelector("h3").textContent === "Sessions over time").querySelector(".pointer-events-none.absolute")?.textContent || "")
  expect(/Thisperiod[\d.,$%]+Before[\d.,$%]+/.test(tip.replace(/\s/g, "")), vp.hasTouch ? "a tap on the chart shows that day's figures, and they stay" : "the chart shows that day's figures under the pointer", tip)
  if (name.startsWith("desktop")) await p.screenshot({ path: join(shots, "desktop-tooltip.png"), clip: { x: r.x - 40, y: r.y - 140, width: r.width + 80, height: r.height + 200 } })
  await p.close()
}
await browser.close(); server.close()
console.log(`\nscreenshots: ${shots}`)
console.log(broken === 0 ? "\nThe reports measured as asked.\n" : `\n${broken} measured wrong.\n`)
process.exit(broken === 0 ? 0 : 1)
