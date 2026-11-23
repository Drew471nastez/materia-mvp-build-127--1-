/**
 * ===========================================================================
 *  CREATOR ACTIVITY IN /admin, MEASURED AT 390 AND 1280 (round 59)
 * ===========================================================================
 * The real console views (app/(storelib)/admin/_console) with the fixtures
 * of scripts/render-admin.tsx, which also answers /api/admin/platform/activity
 * with payloads shaped like lib/admin/views/activity.ts. For each case:
 *
 *   the page never scrolls sideways      document scrollWidth
 *   nothing pokes out of its panel        each section's scrollWidth
 *   a row's cells do not overlap          each cell against the next
 *   what each case must show is there     data-activity-* markers
 *
 * and a screenshot at deviceScaleFactor 2 to SHOTS_DIR, named with PREFIX
 * ("before" or "after").
 *
 *   SHOTS_DIR=… PREFIX=after node scripts/check-creator-activity-r59.mjs
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
const out = mkdtempSync(join(tmpdir(), "storelib-activity-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
const prefix = process.env.PREFIX || "after"
const expectNew = prefix !== "before"
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

const CREATOR = "c0000001-0000-4000-8000-000000000000"
const CASES = []
for (const width of [390, 1280]) {
  CASES.push({ width, name: `creators-${width}`, query: "?view=creators", must: expectNew ? ["[data-activity-line]"] : [] })
  if (expectNew) {
    CASES.push({ width, name: `creators-online-${width}`, query: "?view=creators&tab=online", must: ["[data-activity-line]", "[data-activity-online] [data-row]"] })
    CASES.push({ width, name: `creators-activity-${width}`, query: "?view=creators&tab=activity", must: ["[data-activity-feed] [data-row]"] })
    CASES.push({ width, name: `creators-activity-missing-${width}`, query: "?view=creators&tab=activity&activity=missing", must: ["[data-activity-missing]"] })
  }
  CASES.push({ width, name: `creator-${width}`, query: `?view=creator&id=${CREATOR}`, must: expectNew ? ["[data-activity-card]", "[data-activity-session]"] : [], scrollTo: expectNew ? "[data-activity-card]" : null })
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const problems = []
for (const c of CASES) {
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e.message)))
  await page.setViewport({ width: c.width, height: c.width > 800 ? 900 : 844, deviceScaleFactor: 2, isMobile: c.width < 800, hasTouch: c.width < 800 })
  await page.goto(`file://${join(out, "index.html")}${c.query}`, { waitUntil: "load" })
  await new Promise((r) => setTimeout(r, 600))
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
    return {
      sideways: document.documentElement.scrollWidth - window.innerWidth,
      panels: [...document.querySelectorAll("section")].filter(visible).map((s) => s.scrollWidth - s.clientWidth).filter((n) => n > 1),
      overlaps,
      missing: must.filter((sel) => !document.querySelector(sel)),
      line: document.querySelector("[data-activity-line]")?.textContent ?? null,
    }
  }, c.must)
  if (m.sideways > 0) problems.push(`${c.name}: page scrolls sideways by ${m.sideways}px`)
  if (m.panels.length) problems.push(`${c.name}: a panel overflows by ${m.panels.join(", ")}px`)
  if (m.overlaps.length) problems.push(`${c.name}: cells overlap by ${m.overlaps.join(", ")}px`)
  if (m.missing.length) problems.push(`${c.name}: missing ${m.missing.join(", ")}`)
  if (errors.length) problems.push(`${c.name}: ${errors.join(" | ")}`)
  if (c.scrollTo) await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: "start" }), c.scrollTo)
  await new Promise((r) => setTimeout(r, 100))
  await page.screenshot({ path: join(shots, `${prefix}-${c.name}.png`), fullPage: !c.scrollTo })
  console.log(`  ${m.sideways > 0 || m.panels.length || m.overlaps.length || m.missing.length || errors.length ? "FAIL" : "ok  "}  ${c.name}${m.line ? `  line: "${m.line}"` : ""}`)
  await page.close()
}
await browser.close()
console.log(`\nshots: ${shots}`)
if (problems.length) {
  console.error(`\n${problems.join("\n")}`)
  process.exit(1)
}
