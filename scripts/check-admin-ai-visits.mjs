/**
 * ===========================================================================
 *  THE AUDIENCE VIEW'S AI ASSISTANTS GROUP, RENDERED AND MEASURED (round 46)
 * ===========================================================================
 * The real console (scripts/render-admin.tsx fixtures, as scripts/check-admin.mjs
 * renders them) at 1440 and 390, in two states:
 *
 *   COUNTED    part 347 has run: storelib.com visits first in each row, the
 *              top storelib.com pages per assistant, and the line saying
 *              where the numbers come from
 *   MISSING    before part 347: no visits column, one line saying to run it
 *
 * Measured: nothing sideways, nothing poking out of the panel, no cell over
 * the next, the copy on the page. Pictures go to SHOTS_DIR or a temp folder.
 *
 *   node scripts/check-admin-ai-visits.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const out = mkdtempSync(join(tmpdir(), "storelib-admin-ai-"))
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

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
try {
  for (const width of [1440, 390]) {
    for (const state of ["counted", "missing"]) {
      console.log(`\n${state} at ${width}`)
      const page = await browser.newPage()
      const errors = []
      page.on("pageerror", (e) => errors.push(String(e.message)))
      await page.setViewport({ width, height: width > 800 ? 900 : 844, deviceScaleFactor: 2, isMobile: width < 800, hasTouch: width < 800 })
      await page.goto(`file://${join(out, "index.html")}?view=audience${state === "missing" ? "&ai=missing" : ""}`, { waitUntil: "load" })
      await new Promise((r) => setTimeout(r, 300))
      const m = await page.evaluate(() => {
        const panel = document.querySelector("[data-ai-assistants]")?.closest("section")
        const visible = (el) => {
          const r = el.getBoundingClientRect()
          const s = getComputedStyle(el)
          return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden"
        }
        const overlaps = []
        for (const row of panel?.querySelectorAll("[data-row]") ?? []) {
          for (const grid of row.children) {
            if (!visible(grid)) continue
            const cells = [...grid.children].filter(visible).map((el) => el.getBoundingClientRect())
            for (let i = 0; i + 1 < cells.length; i++) if (Math.abs(cells[i].top - cells[i + 1].top) < 4 && cells[i].right > cells[i + 1].left + 0.5) overlaps.push(Math.round(cells[i].right - cells[i + 1].left))
          }
        }
        const headers = [...(panel?.querySelectorAll('[role="table"][aria-label="AI assistants"] [role="columnheader"]') ?? [])].filter(visible).map((h) => h.textContent)
        const cut = [...(panel?.querySelectorAll('[role="cell"]') ?? [])].filter(visible).filter((c) => c.scrollWidth > c.clientWidth + 1 && !c.querySelector("[title]")).map((c) => c.textContent)
        const r = panel?.getBoundingClientRect()
        return {
          sideways: document.documentElement.scrollWidth - innerWidth,
          over: panel ? panel.scrollWidth - panel.clientWidth : -1,
          panelWidth: r ? Math.round(r.width) : 0,
          text: panel?.textContent ?? "",
          headers,
          overlaps,
          cut,
          landings: panel?.querySelectorAll('[role="table"][aria-label="Top storelib.com pages per assistant"] [data-row]').length ?? 0,
          top: r ? r.top + scrollY : 0,
          height: r ? r.height : 0,
        }
      })
      expect(errors.length === 0, "no page errors", errors)
      expect(m.sideways <= 0, "nothing sideways", m.sideways)
      expect(m.over <= 0, "nothing pokes out of the panel", m.over)
      expect(m.overlaps.length === 0, "no cell over the next", m.overlaps)
      expect(m.cut.length === 0, "no figure cut off", m.cut)
      expect(/AI-referred \(where the source is known\)/.test(m.text), "the panel says where the source is known")
      if (state === "counted") {
        expect(m.text.includes("Counted by Storelib, visitors who accepted analytics, where the assistant is known."), "the storelib.com visits say where they come from")
        expect(m.text.includes("1,479 storelib.com visits, then 50 of 1,204 Storelib sign ups, then 7 on a paid plan"), "visits, then sign ups, then paid")
        expect(m.landings === 7, "the top pages per assistant", m.landings)
        if (width > 800) expect(m.headers[1] === "storelib.com visits", "storelib.com visits first after the assistant", m.headers)
        expect(!m.text.includes("Run SQL part 347"), "no run-347 line once it has run")
      } else {
        expect(m.text.includes("Run SQL part 347 to count visits to storelib.com"), "says to run part 347")
        expect(!m.text.includes("storelib.com visits,") && m.landings === 0, "and shows no visits or pages")
        if (width > 800) expect(!m.headers.includes("storelib.com visits"), "no visits column", m.headers)
      }
      const file = join(shots, `aivisits-${state}-${width}.png`)
      await page.screenshot({ path: file, clip: { x: 0, y: Math.max(0, m.top - 12), width, height: m.height + 24 }, captureBeyondViewport: true })
      console.log(`  shot  ${file}`)
      if (state === "counted") {
        const whole = join(shots, `aivisits-audience-${width}.png`)
        await page.screenshot({ path: whole, fullPage: true })
        console.log(`  shot  ${whole}`)
      }
      await page.close()
    }
  }
} finally {
  await browser.close()
}
console.log(broken ? `\n${broken} problem(s)` : "\nall good")
process.exit(broken ? 1 : 0)
