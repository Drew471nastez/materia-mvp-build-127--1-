/**
 * ===========================================================================
 *  THE CARD RATE LINE, DIGITAL AND PHYSICAL, MEASURED
 * ===========================================================================
 * Free and Grow charge a product that ships less than a download, and the
 * plan cards say both on the rate line without a seventh line
 * (components/marketing/pricing-lines, components/billing/plan-cards): the
 * rate as the line's text, then a smaller muted row under it, "3% + $0.25
 * on physical products". Pro's rate is the same for both and has no second
 * part. What that claims about the page is measured here:
 *
 *   - every card has exactly six lines, as before
 *   - the physical part is right under the rate, on one row where the card
 *     has room (390 and 1280) and wrapped cleanly where it has not (768,
 *     three narrow cards side by side, where every line wraps)
 *   - no lone word on the last row of the rate or of its physical part (an
 *     orphan): the last row is at least 30% as wide as the widest
 *   - the price never breaks over two rows (it did at 768: "$2" over "9")
 *   - the line, and the card, never run wider than the card or the window
 *   - the muted part still reaches 4.5:1 on the card's white
 *
 * At 390, 768 and 1280, on the marketing section (home and /pricing), the
 * onboarding step's compact cards and the upgrade page. Screenshots of every
 * card row go to $SHOTS when it is set.
 *
 *   PROBE_CSS=source SHOTS=/some/dir node scripts/check-pricing-rate-line.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".rate-line-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/pricing"
export const useSearchParams = () => new URLSearchParams()
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const redirect = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, scroll, ...rest }) {
  return React.createElement("a", { href, ...rest }, children)
}
`)
writeFileSync(join(dir, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, priority, sizes, quality, placeholder, ...rest }) {
  return React.createElement("img", { src: typeof src === "string" ? src : src?.src, alt, ...rest })
}
`)
writeFileSync(join(dir, "dynamic.jsx"), `export default function dynamic() { return function Nothing() { return null } }
`)
try {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-pricing-rate-line.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:next/image=${join(dir, "image.jsx")}`, `--alias:next/dynamic=${join(dir, "dynamic.jsx")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl", "--loader:.webp=dataurl", "--loader:.jpg=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const faces = interFaces(root)
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${faces}</style><style>${await appCss(root)}</style><style>body{margin:0;background:#fff;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })
const server = createServer((_, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(html) })
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
console.log(faces ? "Font: Inter from the production build." : "Font: no production build here; Inter is read from the machine's own fonts when it has them (the stylesheet names \"Inter\" first).")

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const problems = []
for (const surface of ["marketing", "onboarding", "upgrade"]) {
  for (const width of [390, 768, 1280]) {
    const page = await browser.newPage()
    await page.setViewport({ width, height: 1000, deviceScaleFactor: 2, isMobile: width < 500, hasTouch: width < 500 })
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e)))
    await page.goto(`${base}/?surface=${surface}`)
    await page.waitForSelector("[data-plan-line='rate']", { timeout: 15_000 }).catch(() => {})
    /* The cards scroll in: bring each into view, then let them settle. */
    await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important}" })
    for (let y = 0; y < 4000; y += 400) await page.evaluate((top) => { scrollTo(0, top); document.querySelector(".app-content-scroll")?.scrollTo(0, top) }, y)
    await page.evaluate(() => { scrollTo(0, 0); document.querySelector(".app-content-scroll")?.scrollTo(0, 0) })
    await new Promise((r) => setTimeout(r, 600))
    const m = await page.evaluate(() => {
      /*
        The rows the visible text under an element sits on: each text node's own glyph boxes (not the boxes
        of the elements around them, which a padded swap cell or a screen reader's hidden comma would add),
        grouped by their middle, so a smaller run on the same row counts as that row. With how full the last
        row is against the widest, for a lone word.
      */
      const textRows = (el, stopAt) => {
        const rects = []
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (stopAt && (stopAt === n.parentElement || stopAt.contains(n))) continue
          if (n.parentElement.closest(".sr-only, [aria-hidden='true'], [data-morph='off']")) continue
          if (!n.textContent.trim() || n.textContent === "\u200b") continue
          const r = document.createRange()
          r.selectNodeContents(n)
          rects.push(...[...r.getClientRects()].filter((x) => x.width > 0.5))
        }
        const rows = []
        for (const r of rects.sort((a, b) => a.top - b.top)) {
          const mid = (r.top + r.bottom) / 2
          const row = rows.find((w) => Math.abs(w.mid - mid) < r.height / 2)
          if (row) row.width += r.width
          else rows.push({ mid, top: r.top, width: r.width })
        }
        const widest = Math.max(0, ...rows.map((w) => w.width))
        const last = rows[rows.length - 1]
        return { rows: rows.length, first: rows[0]?.top ?? 0, last: last?.top ?? 0, orphan: rows.length > 1 && last.width < widest * 0.3 }
      }
      const lum = (c) => {
        const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
      }
      return [...document.querySelectorAll("[data-plan-card]")].map((card) => {
        const cr = card.getBoundingClientRect()
        const lineCount = card.querySelectorAll("[data-plan-line]").length
        const li = card.querySelector("[data-plan-line='rate']")
        const outer = li.querySelector(":scope > span")
        const detail = li.querySelector("[data-plan-line-detail]")
        const main = textRows(outer, detail)
        const sub = detail ? textRows(detail) : null
        const lr = li.getBoundingClientRect()
        const dr = detail?.getBoundingClientRect()
        const price = card.querySelector("[data-plan-price] > span")
        const priceRows = price ? textRows(price).rows : 0
        return {
          name: card.querySelector("h2,h3,[data-plan-name]")?.textContent?.trim() ?? "",
          lineCount,
          text: li.textContent.replace(/\s+/g, " ").trim(),
          mainRows: main.rows,
          detailRows: sub?.rows ?? 0,
          detailBelow: sub ? sub.first > main.last : true,
          orphan: main.orphan || !!sub?.orphan,
          priceRows,
          lineRight: Math.round(lr.right), cardRight: Math.round(cr.right), lineWidth: Math.round(lr.width),
          detailRight: dr ? Math.round(dr.right) : null,
          detailContrast: detail ? (() => { const fg = lum(getComputedStyle(detail).color); return (1 + 0.05) / (fg + 0.05) })() : null,
        }
      })
    })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    const label = `${surface} @${width}`
    if (errors.length) problems.push(`${label}: page errors ${errors.join(" | ")}`)
    if (m.length !== 3) problems.push(`${label}: ${m.length} cards, expected 3`)
    if (overflow > 0) problems.push(`${label}: the page is ${overflow}px wider than the window`)
    for (const c of m) {
      const where = `${label} ${c.text.slice(0, 30)}`
      if (c.lineCount !== 6) problems.push(`${where}: ${c.lineCount} lines, expected 6`)
      if (c.orphan) problems.push(`${where}: a lone word on the last row`)
      if (c.detailRows && !c.detailBelow) problems.push(`${where}: the physical part is not under the rate`)
      if (c.priceRows !== 1) problems.push(`${where}: the price breaks over ${c.priceRows} rows`)
      if (c.lineRight > c.cardRight || (c.detailRight ?? 0) > c.cardRight) problems.push(`${where}: runs past the card`)
      if (c.detailContrast !== null && c.detailContrast < 4.5) problems.push(`${where}: the muted part is ${c.detailContrast.toFixed(2)}:1`)
      console.log(`${label.padEnd(18)} ${c.text.padEnd(62)} rate ${c.mainRows} row${c.mainRows > 1 ? "s" : ""}${c.detailRows ? `, physical ${c.detailRows} row${c.detailRows > 1 ? "s" : ""} under it` : ", no physical part"}${c.detailContrast ? `, ${c.detailContrast.toFixed(2)}:1` : ""}, price ${c.priceRows} row`)
    }
    if (SHOTS) {
      const grid = await page.$("[data-plan-cards]")
      if (grid) await grid.screenshot({ path: join(SHOTS, `${surface}-${width}.png`) })
      /* The rate lines up close. */
      const lines = await page.$$("[data-plan-line='rate']")
      for (const [i, el] of lines.entries()) await el.screenshot({ path: join(SHOTS, `${surface}-${width}-rate-${i + 1}.png`) })
    }
    await page.close()
  }
}
await browser.close()
server.close()
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join("\n")}`)
  process.exit(1)
}
console.log("\nEvery rate line: the physical part under the rate, no lone word, nothing past the card, the price on one row. Six lines on every card.")
