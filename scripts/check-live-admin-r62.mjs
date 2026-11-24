/**
 * ===========================================================================
 *  /admin LIVE, MEASURED AT 390 AND 1280 (round 62)
 * ===========================================================================
 * The real console (app/(storelib)/admin/_console) with the fixtures of
 * scripts/render-admin.tsx, which answers /api/admin/platform/live with
 * payloads shaped like lib/admin/views/live.ts. For each case:
 *
 *   the page never scrolls sideways      document scrollWidth
 *   nothing pokes out of its panel        each section's scrollWidth
 *   a row's cells do not overlap          each cell against the next
 *   what each case must show is there     data-live-* markers
 *   no layout shift after the first read  CLS from PerformanceObserver
 *
 * and a screenshot at deviceScaleFactor 2 to SHOTS_DIR.
 *
 *   SHOTS_DIR=… node scripts/check-live-admin-r62.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) throw new Error(`No browser at ${CHROMIUM}`)
const out = mkdtempSync(join(tmpdir(), "storelib-live-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })

execFileSync(
  "npx",
  ["--no-install", "esbuild", join(root, "scripts/render-admin.tsx"), "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`, '--define:process.env.NODE_ENV="production"', `--alias:@=${root}`, "--loader:.css=empty"],
  { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
)
const css = await appCss(root)
writeFileSync(
  join(out, "index.html"),
  `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style><style>body{margin:0;font-family:Inter,ui-sans-serif,system-ui,sans-serif}</style></head>
<body><div id="root"></div><script src="probe.js"></script></body></html>`,
)

const CASES = []
for (const width of [390, 1280]) {
  CASES.push({ width, name: `live-${width}`, query: "?view=live", must: ["[data-figure]", "[data-live-areas] [data-live-area]", "[data-live-online] [data-row]", "[data-live-countries]"] })
  CASES.push({ width, name: `live-area-${width}`, query: "?view=live&filter=checkout", must: ["[data-live-online] [data-row]", '[data-live-area="checkout"][aria-pressed="true"]'] })
  CASES.push({ width, name: `live-session-${width}`, query: "?view=live&id=k3j9a8b7c6d5e4f3", must: ["[data-live-session]", "[data-live-timeline] [data-row]", "[data-live-orders]"] })
  CASES.push({ width, name: `live-activity-${width}`, query: "?view=live&tab=activity", must: ["[data-live-feed] [data-row]"] })
  CASES.push({ width, name: `live-missing-${width}`, query: "?view=live&live=missing", must: ["[data-live-missing]", "[data-live-missing-reason]", "[data-unreadable]"] })
  CASES.push({ width, name: `creators-${width}`, query: "?view=creators", must: ["[data-activity-line]", "[data-activity-live]"] })
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const problems = []
for (const c of CASES) {
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e.message)))
  await page.setViewport({ width: c.width, height: c.width > 800 ? 900 : 844, deviceScaleFactor: 2, isMobile: c.width < 800, hasTouch: c.width < 800 })
  await page.evaluateOnNewDocument(() => {
    window.__cls = 0
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value
      }).observe({ type: "layout-shift", buffered: true })
    } catch {}
  })
  await page.goto(`file://${join(out, "index.html")}${c.query}`, { waitUntil: "load" })
  await new Promise((r) => setTimeout(r, 400))
  const clsAtRead = await page.evaluate(() => window.__cls)
  await new Promise((r) => setTimeout(r, 400))
  const m = await page.evaluate((must) => {
    const visible = (el) => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"
    }
    const overlaps = []
    for (const row of document.querySelectorAll("[data-row]")) {
      for (const grid of row.children) {
        if (!visible(grid)) continue
        const cells = [...grid.children].filter(visible).map((el) => el.getBoundingClientRect())
        for (let i = 0; i + 1 < cells.length; i++) if (Math.abs(cells[i].top - cells[i + 1].top) < 4 && cells[i].right > cells[i + 1].left + 0.5) overlaps.push(Math.round(cells[i].right - cells[i + 1].left))
      }
    }
    const small = [...document.querySelectorAll("[data-live-area], [data-live-feed] button, [data-live-online] [data-row]")].filter(visible).map((el) => el.getBoundingClientRect().height).filter((h) => h < 40)
    return {
      sideways: document.documentElement.scrollWidth - window.innerWidth,
      panels: [...document.querySelectorAll("section")].filter(visible).map((s) => s.scrollWidth - s.clientWidth).filter((n) => n > 1),
      overlaps,
      missing: must.filter((sel) => !document.querySelector(sel)),
      rows: document.querySelectorAll("[data-row]").length,
      smallTargets: window.innerWidth < 800 ? small.length : 0,
      cls: window.__cls,
      text: document.body.innerText,
    }
  }, c.must)
  if (m.sideways > 0) problems.push(`${c.name}: page scrolls sideways by ${m.sideways}px`)
  if (m.panels.length) problems.push(`${c.name}: a panel overflows by ${m.panels.join(", ")}px`)
  if (m.overlaps.length) problems.push(`${c.name}: cells overlap by ${m.overlaps.join(", ")}px`)
  if (m.missing.length) problems.push(`${c.name}: missing ${m.missing.join(", ")}`)
  if (m.smallTargets) problems.push(`${c.name}: ${m.smallTargets} touch targets under 40px`)
  if (m.cls - clsAtRead > 0.001) problems.push(`${c.name}: layout shifted ${m.cls.toFixed(3)} after the first read`)
  if (/—|unlock|seamless|effortless|supercharge|elevate/i.test(m.text)) problems.push(`${c.name}: copy has a banned word or an em dash`)
  if (errors.length) problems.push(`${c.name}: ${errors.join(" | ")}`)
  await page.screenshot({ path: join(shots, `after-${c.name}.png`), fullPage: true })
  const bad = m.sideways > 0 || m.panels.length || m.overlaps.length || m.missing.length || errors.length || m.smallTargets
  console.log(`  ${bad ? "FAIL" : "ok  "}  ${c.name}  rows ${m.rows}  cls ${m.cls.toFixed(3)}`)
  await page.close()
}
await browser.close()
console.log(`\nshots: ${shots}`)
if (problems.length) {
  console.error(`\n${problems.join("\n")}`)
  process.exit(1)
}
