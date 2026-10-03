/**
 * ===========================================================================
 *  /admin/communities, MEASURED AT A DESK AND ON A PHONE
 * ===========================================================================
 * Renders the real page (app/admin/communities/communities-admin.tsx) with
 * fixtures (scripts/render-community-admin.tsx) at 1440 and 390 wide, with
 * the switch on and off, the confirm before off, the escalated reports and
 * one community opened, and measures:
 *
 *   the page never scrolls sideways            document scrollWidth
 *   the switch is at the top, says its state   its rect, aria-checked, word
 *   the switch is a 44px target on a phone      its rect
 *   pressing it off asks first; on does not    an open dialog after a press
 *   a figure is not cut off                     value scrollWidth
 *   a row's cells do not overlap                each cell against the next
 *   tap targets are 40px or more on a phone     buttons and links outside rows
 *   a dialog is a sheet on a phone              its rect against the viewport
 *   the surface is dark                         computed background
 *
 * and writes a screenshot of each to SHOTS_DIR (or a temp folder).
 *
 *   PROBE_CSS=source node scripts/check-community-admin.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const out = mkdtempSync(join(tmpdir(), "storelib-community-admin-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })

execFileSync(
  "npx",
  [
    "--no-install", "esbuild", join(root, "scripts/render-community-admin.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
    `--outfile=${join(out, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:@=${root}`, "--loader:.css=empty",
  ],
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
for (const width of [1440, 390]) {
  CASES.push({ width, query: "?on=1", name: `on-${width}`, expect: "on" })
  CASES.push({ width, query: "?on=0", name: `off-${width}`, expect: "off" })
  CASES.push({ width, query: "?on=1&confirm=1", name: `confirm-off-${width}`, dialog: true })
  CASES.push({ width, query: "?on=0&confirm=1", name: `turn-on-${width}`, noDialog: true })
  CASES.push({ width, query: "?on=1&view=reports", name: `reports-${width}` })
  CASES.push({ width, query: "?on=1&open=1", name: `community-${width}`, dialog: true })
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const problems = []
const note = (c, m) => problems.push(`${c.name}: ${m}`)

for (const c of CASES) {
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e.message)))
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text())
  })
  await page.setViewport({ width: c.width, height: c.width > 800 ? 900 : 844, deviceScaleFactor: 1, isMobile: c.width < 800, hasTouch: c.width < 800 })
  await page.goto(`file://${join(out, "index.html")}${c.query}`, { waitUntil: "load" })
  await new Promise((r) => setTimeout(r, 600))

  const m = await page.evaluate(() => {
    const vw = window.innerWidth
    const visible = (el) => {
      if (!el) return false
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"
    }
    const sw = document.querySelector("[data-switch]")
    const panel = document.querySelector("[data-community-switch]")
    const overlaps = []
    for (const row of document.querySelectorAll("[data-row]")) {
      for (const grid of row.children) {
        if (!visible(grid)) continue
        const cells = [...grid.children].filter(visible).map((el) => el.getBoundingClientRect())
        for (let i = 0; i + 1 < cells.length; i++) {
          const a = cells[i]
          const b = cells[i + 1]
          if (Math.abs(a.top - b.top) < 4 && a.right > b.left + 0.5) overlaps.push(Math.round(a.right - b.left))
        }
      }
    }
    const figures = [...document.querySelectorAll("[data-figure]")].filter(visible).map((f) => {
      const value = f.querySelector("p:nth-of-type(2)")
      return { label: f.getAttribute("data-figure"), cut: value && !f.querySelector("[data-unreadable]") ? value.scrollWidth - value.clientWidth : 0 }
    })
    const dialog = document.querySelector("dialog[open]")
    const scope = dialog || document
    const small = [...scope.querySelectorAll("button, a, input, textarea")].filter(visible).filter((el) => {
      const r = el.getBoundingClientRect()
      return r.height < 40 && !el.closest("[data-row]") && el.getAttribute("role") !== "tab" && !el.closest("[role=tablist]")
    }).map((el) => `${el.tagName} "${(el.textContent || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().slice(0, 24)}" ${Math.round(el.getBoundingClientRect().height)}px`)
    return {
      vw,
      vh: window.innerHeight,
      scroll: document.documentElement.scrollWidth - vw,
      switchRect: sw ? sw.getBoundingClientRect().toJSON() : null,
      switchState: sw ? sw.getAttribute("aria-checked") : null,
      panelState: panel ? panel.getAttribute("data-community-switch") : null,
      panelTop: panel ? Math.round(panel.getBoundingClientRect().top) : null,
      firstFigureTop: (() => { const f = document.querySelector("[data-figure]"); return f ? Math.round(f.getBoundingClientRect().top) : null })(),
      overlaps,
      figures,
      rows: document.querySelectorAll("[data-row]").length,
      dialog: dialog ? dialog.getBoundingClientRect().toJSON() : null,
      dialogText: dialog ? dialog.textContent.replace(/\s+/g, " ").slice(0, 400) : "",
      small,
      background: getComputedStyle(document.querySelector("[data-admin-communities]")).backgroundColor,
    }
  })

  await page.screenshot({ path: join(shots, `${c.name}.png`), fullPage: !c.dialog })

  if (errors.length) note(c, `errors: ${errors.join(" | ").slice(0, 300)}`)
  if (m.scroll > 0) note(c, `page scrolls sideways by ${m.scroll}px`)
  if (!m.switchRect) note(c, "no switch")
  if (m.panelTop !== null && m.firstFigureTop !== null && m.panelTop > m.firstFigureTop) note(c, "the switch is not above the figures")
  if (c.expect && m.panelState !== c.expect) note(c, `switch reads ${m.panelState}, expected ${c.expect}`)
  if (c.width < 800 && m.switchRect && (m.switchRect.height < 40 || m.switchRect.width < 40)) note(c, `switch is ${Math.round(m.switchRect.width)}x${Math.round(m.switchRect.height)} on a phone`)
  if (c.dialog && !m.dialog) note(c, "no dialog opened")
  if (c.noDialog && m.dialog) note(c, "turning on asked a question it should not")
  if (c.noDialog && m.switchState !== "true") note(c, `turning on did not turn it on (${m.switchState})`)
  if (c.name.startsWith("confirm-off") && !/Nothing is deleted/.test(m.dialogText)) note(c, "the confirm does not say nothing is deleted")
  if (m.dialog && c.width < 800 && Math.abs(m.dialog.bottom - m.vh) > 2) note(c, `the dialog is not a sheet on the phone (bottom ${Math.round(m.dialog.bottom)} of ${m.vh})`)
  if (m.dialog && c.width > 800 && (m.dialog.left < 100 || m.vw - m.dialog.right < 100)) note(c, "the dialog is not centred on a desk")
  if (m.overlaps.length) note(c, `cells overlap by ${m.overlaps.join(", ")}px`)
  for (const f of m.figures) if (f.cut > 1) note(c, `figure ${f.label} is cut by ${f.cut}px`)
  if (c.width < 800 && m.small.length) note(c, `small tap targets: ${m.small.join("; ")}`)
  if (!/rgb\(11, 11, 15\)/.test(m.background)) note(c, `background is ${m.background}`)

  console.log(`${c.name.padEnd(20)} switch=${m.switchState} rows=${m.rows} scroll=${m.scroll} dialog=${m.dialog ? `${Math.round(m.dialog.width)}x${Math.round(m.dialog.height)}` : "-"} small=${m.small.length}`)
  await page.close()
}

await browser.close()
console.log(`\nscreenshots: ${shots}`)
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n  ${problems.join("\n  ")}`)
  process.exit(1)
}
console.log("\nall clear")
