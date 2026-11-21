/**
 * ===========================================================================
 *  EVERY PLAN CARD LINE ON ONE ROW, MEASURED
 * ===========================================================================
 * Pricing one row round, the owner: every benefit line on every plan card
 * fits on one row (components/marketing/pricing-lines, drawn by
 * components/billing/plan-cards). Measured here, line by line, on the
 * marketing section (home and /pricing), the onboarding step and the upgrade
 * page, at 390, 768 and 1280:
 *
 *   - at 390 and 1280 every line is one row, or the probe fails
 *   - at 768, three narrow cards side by side, each line that still wraps is
 *     listed with how wide it is against the room it has (reported, not
 *     failed: the owner asked to know what still wraps there)
 *   - no line runs past its card
 *
 * It renders with scripts/render-pricing-rate-line.tsx, the same harness as
 * scripts/check-pricing-rate-line.mjs. Screenshots of each card grid go to
 * $SHOTS when it is set.
 *
 *   PROBE_CSS=source SHOTS=/some/dir node scripts/check-pricing-lines-one-row.mjs
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

const dir = join(root, ".pricing-lines-probe")
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
console.log(faces ? "Font: Inter from the production build." : "Font: no production build here; Inter is read from the machine's own fonts when it has them.")

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const problems = []
const wraps768 = []
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

for (const surface of ["marketing", "onboarding", "upgrade"]) {
  for (const width of [390, 768, 1280]) {
    const touch = width < 500
    const page = await browser.newPage()
    await page.setViewport({ width, height: touch ? 844 : 1000, deviceScaleFactor: 2, isMobile: touch, hasTouch: touch })
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e)))
    await page.goto(`${base}/?surface=${surface}`)
    await page.waitForSelector("[data-plan-line]", { timeout: 15_000 }).catch(() => {})
    await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important}" })
    for (let y = 0; y < 4000; y += 400) await page.evaluate((top) => { scrollTo(0, top); document.querySelector(".app-content-scroll")?.scrollTo(0, top) }, y)
    await page.evaluate(() => { scrollTo(0, 0); document.querySelector(".app-content-scroll")?.scrollTo(0, 0) })
    await wait(600)
    const cards = await page.evaluate(() => {
      /* The rows a line's visible text sits on: its text nodes' glyph boxes grouped by their middle. */
      const rowsOf = (el) => {
        const rects = []
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (n.parentElement.closest(".sr-only, [aria-hidden='true'], [data-card-rates-tip] [role='tooltip']")) continue
          if (!n.textContent.trim()) continue
          const r = document.createRange()
          r.selectNodeContents(n)
          rects.push(...[...r.getClientRects()].filter((x) => x.width > 0.5))
        }
        const btn = el.querySelector("[data-plan-info]")
        if (btn) rects.push(btn.getBoundingClientRect())
        const rows = []
        for (const r of rects.sort((a, b) => a.top - b.top)) {
          const mid = (r.top + r.bottom) / 2
          if (!rows.some((w) => Math.abs(w - mid) < Math.max(r.height, 8) / 2)) rows.push(mid)
        }
        return rows.length
      }
      return [...document.querySelectorAll("[data-plan-card]")].map((card) => {
        const cr = card.getBoundingClientRect()
        return {
          id: card.getAttribute("data-plan-card"),
          lines: [...card.querySelectorAll("[data-plan-line]")].map((li) => {
            const span = li.querySelector(":scope > span")
            const ghost = span.cloneNode(true)
            ghost.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;width:auto"
            span.parentElement.appendChild(ghost)
            const natural = Math.ceil(ghost.getBoundingClientRect().width)
            ghost.remove()
            const lr = li.getBoundingClientRect()
            return {
              text: [...span.childNodes].map((n) => (n.nodeType === 3 ? n.textContent : n.querySelector?.("[role='tooltip']") ? n.firstChild?.textContent ?? "" : n.textContent)).join("").replace(/\s+/g, " ").trim(),
              rows: rowsOf(span),
              natural,
              room: Math.floor(lr.right - span.getBoundingClientRect().left),
              past: Math.round(lr.right) > Math.round(cr.right),
            }
          }),
        }
      })
    })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    const label = `${surface} @${width}`
    if (errors.length) problems.push(`${label}: page errors ${errors.join(" | ")}`)
    if (cards.length !== 3) problems.push(`${label}: ${cards.length} cards, expected 3`)
    if (overflow > 0) problems.push(`${label}: the page is ${overflow}px wider than the window`)
    console.log(`\n${label}`)
    for (const c of cards) {
      for (const l of c.lines) {
        const tag = l.rows === 1 ? "1 row " : `${l.rows} ROWS`
        console.log(`  ${c.id.padEnd(7)} ${tag} ${String(l.natural).padStart(4)}px in ${String(l.room).padStart(4)}px  ${l.text}`)
        if (l.past) problems.push(`${label} ${c.id} "${l.text}": runs past the card`)
        if (l.rows !== 1) {
          if (width === 768) wraps768.push(`${label} ${c.id} "${l.text}": ${l.rows} rows, ${l.natural}px in ${l.room}px`)
          else problems.push(`${label} ${c.id} "${l.text}": ${l.rows} rows (${l.natural}px in ${l.room}px), expected 1`)
        }
      }
    }
    if (SHOTS) {
      const grid = await page.$("[data-plan-cards]")
      if (grid) await grid.screenshot({ path: join(SHOTS, `lines-${surface}-${width}.png`) })
    }
    await page.close()
  }
}
await browser.close()
server.close()
console.log(wraps768.length ? `\nStill two rows at 768 (three narrow cards):\n${wraps768.map((p) => `  - ${p}`).join("\n")}` : "\nAt 768 every line is one row too.")
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join("\n")}`)
  process.exit(1)
}
console.log("\nEvery line on every card is one row at 390 and 1280, on the marketing section, the onboarding step and the upgrade page, and none runs past its card.")
