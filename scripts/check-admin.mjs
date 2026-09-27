/**
 * ===========================================================================
 *  THE ADMIN CONSOLE, MEASURED AT A DESK AND ON A PHONE
 * ===========================================================================
 * Renders the real console (app/admin/_console) with fixture payloads shaped
 * like the admin API's (scripts/render-admin.tsx) at 1440 and 390 wide, with
 * the app's own CSS, and measures rather than looks:
 *
 *   the page never scrolls sideways          document scrollWidth
 *   nothing pokes out of its panel            each panel's scrollWidth
 *   the column and the page do not overlap    nav right edge vs main left
 *   a row's cells do not overlap              each cell against the next
 *   a figure is not cut off                   value text scrollWidth
 *   the phone bar stays one row, 52px          its height
 *   the phone menu covers the page under it   its rect
 *   confirmation is a sheet on a phone and    dialog rect against the
 *     a centred box on a desk                  viewport
 *   the surface is dark                       computed background colours
 *
 * and writes a screenshot of each to SHOTS_DIR (or a temp folder) to look at.
 *
 *   node scripts/check-admin.mjs
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

const out = mkdtempSync(join(tmpdir(), "storelib-admin-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })

execFileSync(
  "npx",
  [
    "--no-install", "esbuild", join(root, "scripts/render-admin.tsx"),
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

const VIEWS = ["overview", "creators", "creator", "products", "orders", "payouts", "websites", "email", "audience", "people", "audit", "system"]
const CASES = []
for (const width of [1440, 390]) {
  for (const view of VIEWS) CASES.push({ width, query: `?view=${view}${view === "creator" ? `&id=c0000001-0000-4000-8000-000000000000` : ""}`, name: `${view}-${width}` })
  CASES.push({ width, query: "?view=orders&dialog=1", name: `dialog-${width}`, dialog: true })
  CASES.push({ width, query: "?login=1", name: `login-${width}`, login: true })
  /* The wallet panel reads itself, so it is measured in both of its states. */
  CASES.push({ width, query: "?view=system", name: `wallets-waiting-${width}`, wallets: "waiting" })
  CASES.push({ width, query: "?view=system&wallets=done", name: `wallets-done-${width}`, wallets: "done" })
}
CASES.push({ width: 390, query: "?view=overview&menu=1", name: "menu-390", menu: true })

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
  await new Promise((r) => setTimeout(r, c.dialog ? 500 : 250))

  const m = await page.evaluate(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const rect = (el) => (el ? el.getBoundingClientRect().toJSON() : null)
    const visible = (el) => {
      if (!el) return false
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"
    }
    const panels = [...document.querySelectorAll("section")].filter(visible).map((s) => ({ over: s.scrollWidth - s.clientWidth, text: (s.querySelector("h2")?.textContent || "").slice(0, 30) }))
    /* Cells of each visible row, in order, and whether any overlaps the next. */
    const overlaps = []
    for (const row of document.querySelectorAll("[data-row]")) {
      for (const grid of row.children) {
        if (!visible(grid)) continue
        const cells = [...grid.children].filter(visible).map((el) => el.getBoundingClientRect())
        for (let i = 0; i + 1 < cells.length; i++) {
          const a = cells[i]
          const b = cells[i + 1]
          const sameLine = Math.abs(a.top - b.top) < 4
          if (sameLine && a.right > b.left + 0.5) overlaps.push(Math.round(a.right - b.left))
        }
      }
    }
    const figures = [...document.querySelectorAll("[data-figure]")].filter(visible).map((f) => {
      const value = f.querySelector("p:nth-of-type(2)")
      return { label: f.getAttribute("data-figure"), cut: value && !f.querySelector("[data-unreadable]") ? value.scrollWidth - value.clientWidth : 0, width: Math.round(f.getBoundingClientRect().width) }
    })
    const nav = document.querySelector("[data-admin-nav]")
    const main = document.querySelector("[data-admin-main] > div")
    const bar = document.querySelector("[data-admin-bar]")
    const menu = document.querySelector("[data-admin-menu]")
    const dialog = document.querySelector("dialog[open]")
    const shell = document.querySelector("[data-admin-shell]") || document.querySelector("[data-admin-login]")
    const small = [...document.querySelectorAll("button, a, input")].filter(visible).filter((el) => {
      const r = el.getBoundingClientRect()
      return r.height < 28 && !el.closest("[data-row]") && !el.closest("[data-read-notes]")
    }).map((el) => `${el.tagName} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 20)}" ${Math.round(el.getBoundingClientRect().height)}px`)
    return {
      vw,
      vh,
      scroll: document.documentElement.scrollWidth - vw,
      panels,
      overlaps,
      figures,
      nav: visible(nav) ? rect(nav) : null,
      main: rect(main),
      bar: visible(bar) ? rect(bar) : null,
      menu: visible(menu) ? rect(menu) : null,
      dialog: dialog ? rect(dialog) : null,
      background: shell ? getComputedStyle(shell).backgroundColor : null,
      rows: document.querySelectorAll("[data-row]").length,
      wallet: (() => {
        const p = document.getElementById("wallet-domains")
        if (!p) return null
        const press = p.querySelector("header button")
        return {
          over: p.scrollWidth - p.clientWidth,
          rows: p.querySelectorAll("[data-row]").length,
          press: press ? { label: (press.textContent || "").trim(), height: Math.round(press.getBoundingClientRect().height) } : null,
          said: (p.textContent || "").replace(/\s+/g, " ").trim(),
        }
      })(),
      unreadable: document.querySelectorAll("[data-unreadable]").length,
      small,
      text: (document.body.textContent || "").slice(0, 80),
    }
  })

  await page.screenshot({ path: join(shots, `${c.name}.png`), fullPage: !c.dialog && !c.menu })

  if (errors.length) note(c, `errors: ${errors.slice(0, 3).join(" | ")}`)
  if (m.scroll > 0) note(c, `the page scrolls sideways by ${m.scroll}px`)
  for (const p of m.panels) if (p.over > 1) note(c, `panel "${p.text}" is ${p.over}px wider than itself`)
  if (m.overlaps.length) note(c, `${m.overlaps.length} row cells overlap the next (worst ${Math.max(...m.overlaps)}px)`)
  for (const f of m.figures) if (f.cut > 1) note(c, `figure "${f.label}" is cut off by ${f.cut}px in ${f.width}px`)
  if (m.background !== "rgb(11, 11, 15)") note(c, `the surface is ${m.background}, not the dark console`)
  if (!c.login) {
    if (c.width >= 1024) {
      if (!m.nav) note(c, "no navigation column at a desk")
      else if (m.main && m.nav.right > m.main.left + 0.5) note(c, `the column overlaps the page by ${Math.round(m.nav.right - m.main.left)}px`)
      if (m.bar) note(c, "the phone bar shows at a desk")
    } else {
      if (m.nav) note(c, "the desk column shows on a phone")
      if (!m.bar) note(c, "no bar on a phone")
      else if (Math.round(m.bar.height) !== 52) note(c, `the phone bar is ${Math.round(m.bar.height)}px, not one 52px row`)
      if (m.main && m.bar && m.main.top < m.bar.bottom - 0.5 && !c.menu && !c.dialog) note(c, "the page starts under the bar")
    }
  }
  if (c.menu && (!m.menu || m.menu.bottom < m.vh - 1 || m.menu.width < m.vw - 1)) note(c, `the menu does not cover the page: ${JSON.stringify(m.menu)}`)
  if (c.dialog) {
    if (!m.dialog) note(c, "the confirmation did not open")
    else if (c.width < 640 && (Math.abs(m.dialog.bottom - m.vh) > 1 || Math.abs(m.dialog.width - m.vw) > 1)) note(c, `on a phone the confirmation is not a sheet: ${JSON.stringify(m.dialog)}`)
    else if (c.width >= 640 && Math.abs(m.dialog.left + m.dialog.width / 2 - m.vw / 2) > 2) note(c, "at a desk the confirmation is not centred")
  }
  if (m.small.length) note(c, `controls under 28px tall: ${m.small.slice(0, 4).join(", ")}`)
  /**
   * The wallet panel with its answer stubbed: one row per wallet the express
   * checkout asks for, one button to press, and Stripe's own reason readable
   * rather than cut off. It is the whole remaining step for Apple Pay, so it
   * is measured and not looked at.
   */
  if (c.wallets) {
    const w = m.wallet
    if (!w) note(c, "the wallet panel did not render")
    else {
      if (w.rows !== 3) note(c, `the wallet panel shows ${w.rows} wallets, not Apple Pay, Google Pay and Link`)
      if (!w.press) note(c, "the wallet panel has nothing to press")
      else if (w.press.height < 32) note(c, `the wallet button is ${w.press.height}px tall`)
      if (w.over > 1) note(c, `the wallet panel is ${w.over}px wider than itself`)
      for (const word of ["Apple Pay", "Google Pay", "Link"]) if (!w.said.includes(word)) note(c, `the wallet panel never says ${word}`)
      if (c.wallets === "waiting") {
        if (w.press?.label !== "Check again") note(c, `a registered domain offers "${w.press?.label}" rather than a re-check`)
        if (!w.said.includes("Apple could not verify")) note(c, "Stripe's own reason is not shown")
        if (!w.said.includes("Not found")) note(c, "the association file's 404 is not shown")
      } else {
        if (!w.said.includes("all active")) note(c, "the finished state does not say the wallets are active")
        if (!w.said.includes("9094 bytes")) note(c, "the association file's length is not shown")
      }
    }
  }
  console.log(
    `${c.name.padEnd(16)} rows ${String(m.rows).padStart(3)}  figures ${String(m.figures.length).padStart(2)}  unreadable ${m.unreadable}  sideways ${m.scroll}px  overlaps ${m.overlaps.length}` +
      (m.dialog ? `  dialog ${Math.round(m.dialog.width)}x${Math.round(m.dialog.height)} at ${Math.round(m.dialog.left)},${Math.round(m.dialog.top)}` : ""),
  )
  await page.close()
}

await browser.close()
console.log(`\nScreenshots in ${shots}`)
if (problems.length) {
  console.log(`\n${problems.length} problems:`)
  for (const p of problems) console.log(`  - ${p}`)
  process.exit(1)
}
console.log("\nNo overflow, no overlap, dark at both widths.")
