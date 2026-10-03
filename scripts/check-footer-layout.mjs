/**
 * ===========================================================================
 *  THE FOOTER IS COMPACT AND ORGANISED AT EVERY WIDTH
 * ===========================================================================
 * The report was a screenshot of a published footer: the logo and a line on
 * the far left, Services and Legal stacked in a narrow column on the far
 * right, Contact beside them, and the middle of a wide screen empty. Tall and
 * sparse.
 *
 * This mounts the real footer (scripts/render-footer-layout.tsx) in that
 * shape, and with a sign-up and payment icons, at 1280, 768 and 390 wide, and
 * reports for each:
 *
 *   height             the footer's height in px
 *   rows               the top grid's rows, each a list of blocks with x and width
 *   widest empty gap   the largest horizontal gap between neighbours in a row
 *   overflow           anything wider than the page
 *
 *   node scripts/check-footer-layout.mjs
 *
 * FOOTER_PROBE_ENTRY points it at another render file, to measure an older
 * footer against the same numbers.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
const dir = join(root, ".footer-layout-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "next-navigation.js"), `const r = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }
export const useRouter = () => r
export const usePathname = () => "/"
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(dir, "next-link.js"), `import * as React from "react"
export default function Link({ href, children, prefetch, replace, scroll, ...rest }) { return React.createElement("a", { href: String(href), ...rest }, children) }
`)

const css = await appCss(root)
const entry = process.env.FOOTER_PROBE_ENTRY || "scripts/render-footer-layout.tsx"
execFileSync("npx", ["--no-install", "esbuild", join(root, entry),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:next/navigation=${join(dir, "next-navigation.js")}`,
  `--alias:next/link=${join(dir, "next-link.js")}`,
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { cwd: root, stdio: "inherit" })

const IDS = ["reported", "with-signup"]
writeFileSync(join(dir, "index.html"), `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body>
${IDS.map((id) => `<div class="@container" id="${id}" style="margin-bottom:40px"></div>`).join("\n")}
<script src="probe.js"></script></body></html>`)

const MEASURE = `(() => {
  const out = {}
  for (const id of ${JSON.stringify(IDS)}) {
    const host = document.getElementById(id)
    const footer = host.querySelector("footer")
    if (!footer) { out[id] = null; continue }
    const f = footer.getBoundingClientRect()
    /* The parts of the top: brand, each link column, the sign-up. */
    const parts = [
      ["brand", host.querySelector("[data-footer-brand]")],
      ...[...host.querySelectorAll("[data-footer-columns] > div")].map((el) => ["col:" + (el.firstElementChild?.textContent?.trim() || "?"), el]),
      ["signup", host.querySelector("[data-footer-newsletter]")],
    ].filter(([, el]) => el && el.getClientRects().length)
    const boxes = parts.map(([name, el]) => { const r = el.getBoundingClientRect(); return { name, x: Math.round(r.left - f.left), y: Math.round(r.top - f.top), w: Math.round(r.width), h: Math.round(r.height) } })
    const rows = {}
    for (const b of boxes) (rows[b.y] ||= []).push(b)
    const ordered = Object.keys(rows).map(Number).sort((a, b) => a - b).map((y) => rows[y].sort((a, b) => a.x - b.x))
    let widestGap = 0
    for (const row of ordered) for (let i = 1; i < row.length; i++) widestGap = Math.max(widestGap, row[i].x - (row[i - 1].x + row[i - 1].w))
    /* Text inside a block can be narrower than the block: the real empty
       space is between what is drawn, so measure the inked width too. */
    let widestInkGap = 0
    for (const row of ordered) {
      const ink = row.map((b) => {
        const el = parts.find(([n]) => n === b.name)[1]
        let right = 0
        for (const t of el.querySelectorAll("a, p, div, img, span, input, button, li")) { const r = t.getBoundingClientRect(); if (r.width) right = Math.max(right, r.right - f.left) }
        return { x: b.x, right: Math.round(right) }
      })
      for (let i = 1; i < ink.length; i++) widestInkGap = Math.max(widestInkGap, ink[i].x - ink[i - 1].right)
    }
    const bottom = host.querySelector("[data-footer-bottom]").getBoundingClientRect()
    out[id] = {
      height: Math.round(f.height),
      rows: ordered.map((row) => row.map((b) => b.name + "@" + b.x + "+" + b.w).join("  ")),
      widestGap,
      widestInkGap,
      bottomRowHeight: Math.round(bottom.height),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      leftoverDrawers: document.querySelectorAll("[data-site-drawer], [role=dialog]").length,
    }
  }
  return out
})()`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox"] })
let broken = 0
const fail = (m) => { broken++; console.log(`  FAIL  ${m}`) }
try {
  for (const width of [1280, 768, 390]) {
    const page = await browser.newPage()
    await page.setViewport({ width, height: 900 })
    await page.goto(`file://${join(dir, "index.html")}`)
    await page.waitForFunction(() => document.querySelectorAll("footer").length >= 2, { timeout: 10000 })
    await page.evaluate(() => document.fonts.ready)
    const m = await page.evaluate(MEASURE)
    console.log(`\n${width}px`)
    for (const [id, r] of Object.entries(m)) {
      if (!r) { fail(`${id}: no footer`); continue }
      console.log(`  ${id}: height ${r.height}px, widest gap ${r.widestGap}px (ink ${r.widestInkGap}px), bottom row ${r.bottomRowHeight}px, overflow ${r.overflowX}px, drawers ${r.leftoverDrawers}`)
      for (const row of r.rows) console.log(`      ${row}`)
      if (r.overflowX > 0) fail(`${id} at ${width}: wider than the page by ${r.overflowX}px`)
      if (r.leftoverDrawers > 0) fail(`${id} at ${width}: a drawer or dialog in the footer`)
      if (width === 1280) {
        if (r.rows.length !== 1) fail(`${id} at 1280: the top is ${r.rows.length} rows, not one`)
        if (r.widestInkGap > 260) fail(`${id} at 1280: ${r.widestInkGap}px of nothing between two parts`)
        if (r.height > 420) fail(`${id} at 1280: ${r.height}px tall`)
      }
      if (width === 768 && r.rows.length > 2) fail(`${id} at 768: ${r.rows.length} rows`)
    }
    await page.close()
  }
} finally {
  await browser.close()
  rmSync(dir, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} failed` : "\nall held")
process.exit(broken ? 1 : 0)
