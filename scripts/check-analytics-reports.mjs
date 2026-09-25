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
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"

const css = await appCss(root)
const out = mkdtempSync(join(tmpdir(), "storelib-reports-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
execFileSync("npx", ["esbuild", join(root, "scripts/render-analytics-reports.tsx"), "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
  `--alias:@=${root}`, "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--loader:.css=empty", "--log-level=error"], { cwd: root, stdio: "inherit" })
const bundle = readFileSync(join(out, "probe.js"))
const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0}</style></head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};localStorage.setItem("storelib_timezone","Europe/Bucharest");window.__cls=0;new PerformanceObserver(l=>{for(const e of l.getEntries())window.__cls+=e.value}).observe({type:"layout-shift",buffered:true})</script><script src="/probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  /* The country flags are files in public/flags, as on the site. */
  const flag = /^\/flags\/([A-Z]{2})\.svg$/.exec(req.url)
  if (flag && existsSync(join(root, "public/flags", `${flag[1]}.svg`))) { res.writeHead(200, { "content-type": "image/svg+xml" }); return res.end(readFileSync(join(root, "public/flags", `${flag[1]}.svg`))) }
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
  /* A pointer on the desktop glides; a finger drags sideways to scrub, the
     same as the chart at the top of Analytics, and the page stays put. */
  let tip = ""
  if (vp.hasTouch) {
    const y0 = r.y + r.height / 2
    const top0 = await p.evaluate(() => window.scrollY)
    await p.touchscreen.touchStart(r.x + r.width * 0.3, y0)
    for (let k = 1; k <= 8; k++) {
      await p.touchscreen.touchMove(r.x + r.width * (0.3 + k * 0.04), y0)
      await sleep(16)
    }
    await sleep(120)
    tip = await p.evaluate(() => [...document.querySelectorAll("section")].find((s) => s.querySelector("h3").textContent === "Sessions over time").querySelector("[data-chart-tooltip]")?.textContent || "")
    const top1 = await p.evaluate(() => window.scrollY)
    await p.touchscreen.touchEnd()
    expect(Math.abs(top1 - top0) < 2, "scrubbing the chart does not move the page", `${top0} -> ${top1}`)
  } else {
    await p.mouse.move(r.x + r.width * 0.6, r.y + r.height / 2)
    await sleep(300)
    tip = await p.evaluate(() => [...document.querySelectorAll("section")].find((s) => s.querySelector("h3").textContent === "Sessions over time").querySelector("[data-chart-tooltip]")?.textContent || "")
  }
  expect(/Thisperiod[\d.,$%]+Before[\d.,$%]+/.test(tip.replace(/\s/g, "")), vp.hasTouch ? "a sideways drag scrubs the chart and shows that day" : "the chart shows that day's figures under the pointer", tip)

  /* Nothing inside a card scrolls, so a wheel over a card moves the page. */
  const inner = await p.evaluate(() => [...document.querySelectorAll("section *")].filter((el) => {
    const cs = getComputedStyle(el)
    return (cs.overflowY === "auto" || cs.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1
  }).length)
  expect(inner === 0, "no card has a scrolling area of its own", inner)

  /* The data is Storelib's violet, the accent every /app page uses. The
     blue it was drawn in for a while was asked to go ("I don't like that
     blue"), so none of it is left. */
  const colours = await p.evaluate(() => {
    const els = [...document.querySelectorAll("section svg path, section svg circle, section svg rect, section [style*='background']")]
    const text = (el) => (el.getAttribute("stroke") || "") + (el.getAttribute("fill") || "") + (el.getAttribute("style") || "")
    return {
      violet: els.filter((el) => /8b5cf6|139,\s*92,\s*246/i.test(text(el))).length,
      blue: els.filter((el) => /2a78d6|42,\s*120,\s*214/i.test(text(el))).length,
    }
  })
  expect(colours.violet > 0 && colours.blue === 0, "the data is drawn in Storelib's violet, with none of the old blue left", colours)

  if (name.startsWith("desktop")) await p.screenshot({ path: join(shots, "desktop-tooltip.png"), clip: { x: r.x - 40, y: r.y - 140, width: r.width + 80, height: r.height + 200 } })
  if (!vp.hasTouch) {
    const help = await p.evaluateHandle(() => [...document.querySelectorAll("section h3")].find((h) => h.textContent === "Conversion rate breakdown"))
    await help.hover()
    await sleep(350)
    const text = await p.evaluate(() => document.querySelector(".help-card")?.textContent || "")
    expect(/pressed Buy/.test(text), "a card's title explains itself on hover", text)
    await p.mouse.move(2, 2)
    await sleep(250)
    const viewAll = await p.evaluateHandle(() => [...document.querySelectorAll("section button")].find((b) => /^View all/.test(b.textContent)))
    if (viewAll.asElement()) {
      await viewAll.click()
      await sleep(400)
      const listed = await p.evaluate(() => document.querySelectorAll("[role=dialog] ol li").length)
      expect(listed > 5, "View all opens the whole list", listed)
      await p.screenshot({ path: join(shots, "desktop-view-all.png") })
      await p.keyboard.press("Escape")
      await sleep(300)
    }
  }
  await p.close()
}
await browser.close(); server.close()
console.log(`\nscreenshots: ${shots}`)
console.log(broken === 0 ? "\nThe reports measured as asked.\n" : `\n${broken} measured wrong.\n`)
process.exit(broken === 0 ? 0 : 1)
