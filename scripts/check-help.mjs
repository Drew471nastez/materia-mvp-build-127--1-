/**
 * ===========================================================================
 *  THE HELP CENTER, MEASURED
 * ===========================================================================
 * "Remake /help, it's too AI-looking. Polaris or Shopify help centre style,
 * with Storelib UI, good and clean."
 *
 * Whether it looks right is a judgement; these are the parts of it that are
 * numbers, taken from the real pages in the real stylesheet at a phone, a
 * laptop and a wide desktop:
 *
 *   nothing wider than the window, on any page, tables included
 *   an article's lines no longer than about seventy characters
 *   article text at 16px or more, with a line height of at least 1.6
 *   the topics as one column on a phone and three on a desktop
 *   typing in the search shows results, and the keyboard opens one
 *   no gradient and no icon on any page but the one in the search field
 *
 *   node scripts/check-help.mjs            (SHOTS=1 also writes screenshots)
 *
 * Runs without a build: the stylesheet comes from scripts/probe-css.mjs.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
const dir = join(root, ".help-probe")
mkdirSync(dir, { recursive: true })
const shots = process.env.SHOTS ? join(root, ".help-shots") : null
if (shots) mkdirSync(shots, { recursive: true })

writeFileSync(join(dir, "next-navigation.js"), `const nav = () => (globalThis.__nav = globalThis.__nav || [])
const r = { push: (u) => nav().push(String(u)), replace: (u) => nav().push(String(u)), refresh() {}, back() {}, forward() {}, prefetch() {} }
export const useRouter = () => r
export const usePathname = () => "/help"
export const useSearchParams = () => new URLSearchParams()
export function notFound() { throw new Error("notFound") }
export function redirect() {}
`)
writeFileSync(join(dir, "next-link.js"), `import * as React from "react"
export default function Link({ href, children, prefetch, replace, scroll, ...rest }) { return React.createElement("a", { href: String(href), ...rest }, children) }
`)

const css = await appCss(root)
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-help.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:next/navigation=${join(dir, "next-navigation.js")}`,
  `--alias:next/link=${join(dir, "next-link.js")}`,
  `--alias:@=${root}`, "--loader:.css=empty"],
  { cwd: root, stdio: "inherit" })
writeFileSync(join(dir, "index.html"), `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head>
<body><div id="app"></div><script src="probe.js"></script></body></html>`)

const PAGES = ["index", "category/orders-and-payouts", "article/orders-and-payouts/refund-an-order", "article/account-and-billing/plans", "search/domain"]

const MEASURE = `(() => {
  const r = {}
  r.overflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth
  r.gradients = [...document.querySelectorAll("*")].filter((e) => /gradient/.test(getComputedStyle(e).backgroundImage)).length
  r.svgs = [...document.querySelectorAll("svg")].filter((s) => !s.closest("form[role=search]")).length
  const h1 = document.querySelector("h1")
  r.h1 = h1 ? { size: getComputedStyle(h1).fontSize, weight: getComputedStyle(h1).fontWeight, color: getComputedStyle(h1).color } : null
  const body = document.querySelector("article .max-w-\\\\[36rem\\\\]")
  if (body) {
    const p = body.querySelector("p")
    const s = getComputedStyle(p)
    /* Characters per line: the paragraph's width over the average width of
       its own characters, measured on a copy that does not wrap. */
    const probe = document.createElement("span")
    probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;font:" + s.font
    probe.textContent = "the quick brown fox jumps over the lazy dog and pays for a product at checkout"
    document.body.appendChild(probe)
    const perChar = probe.getBoundingClientRect().width / probe.textContent.length
    probe.remove()
    r.article = { size: s.fontSize, lineHeight: s.lineHeight, ratio: Math.round(parseFloat(s.lineHeight) / parseFloat(s.fontSize) * 100) / 100, width: Math.round(p.getBoundingClientRect().width), charsPerLine: Math.round(p.getBoundingClientRect().width / perChar) }
    const tables = [...body.querySelectorAll("table")]
    r.tablesInside = tables.every((t) => t.parentElement.getBoundingClientRect().right <= document.documentElement.clientWidth + 0.5)
  }
  const grid = document.querySelector(".grid.sm\\\\:grid-cols-2")
  if (grid) r.topicColumns = getComputedStyle(grid).gridTemplateColumns.split(" ").length
  return r
})()`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox"] })
let broken = 0
const fail = (m) => { broken++; console.log(`  FAIL  ${m}`) }
try {
  for (const width of [390, 1280, 1920]) {
    console.log(`\n${width}px`)
    for (const which of PAGES) {
      const page = await browser.newPage()
      await page.setViewport({ width, height: 900 })
      await page.goto(`file://${join(dir, "index.html")}#${which}`)
      await page.waitForFunction(() => window.__ready === true && document.querySelector("h1"), { timeout: 10000 })
      await page.evaluate(() => document.fonts.ready)
      const m = await page.evaluate(MEASURE)
      console.log(`  ${which}: ${JSON.stringify(m)}`)
      if (m.overflowX > 0) fail(`${which}: wider than the window by ${m.overflowX}px`)
      if (m.gradients > 0) fail(`${which}: ${m.gradients} gradients`)
      if (m.svgs > 0) fail(`${which}: ${m.svgs} icons outside the search field`)
      if (m.article) {
        if (parseFloat(m.article.size) < 16) fail(`${which}: article text ${m.article.size}`)
        if (m.article.ratio < 1.6) fail(`${which}: line height ratio ${m.article.ratio}`)
        if (m.article.charsPerLine > 80) fail(`${which}: ${m.article.charsPerLine} characters per line`)
        if (m.tablesInside === false) fail(`${which}: a table runs past the window`)
      }
      if (which === "index") {
        const want = width < 640 ? 1 : width < 1024 ? 2 : 3
        if (m.topicColumns !== want) fail(`index: ${m.topicColumns} topic columns, expected ${want}`)
        /* Type, see results, open the second with the keyboard. */
        await page.click("input[type=search]")
        await page.keyboard.type("refund")
        await page.waitForSelector("[role=listbox] [role=option]", { timeout: 3000 }).catch(() => {})
        const options = await page.evaluate(() => [...document.querySelectorAll("[role=listbox] [role=option]")].map((o) => o.querySelector("span")?.textContent))
        if (shots) await page.screenshot({ path: join(shots, `search-open-${width}.png`) })
        await page.keyboard.press("ArrowDown")
        await page.keyboard.press("ArrowDown")
        const active = await page.evaluate(() => document.querySelector("input[type=search]").getAttribute("aria-activedescendant"))
        await page.keyboard.press("Enter")
        const went = await page.evaluate(() => globalThis.__nav || [])
        console.log(`  search "refund": ${JSON.stringify({ options, active, went })}`)
        if (options[0] !== "Refund an order") fail(`search: first result is ${options[0]}`)
        if (!active || !/r1$/.test(active)) fail(`search: the second result is not highlighted (${active})`)
        if (went[0] !== "/help/policies/refund-policy") fail(`search: Enter went to ${went[0]}`)
        await page.keyboard.press("Escape")
      }
      if (shots) await page.screenshot({ path: join(shots, `${which.replace(/\//g, "_")}-${width}.png`), fullPage: true })
      await page.close()
    }
  }
} finally {
  await browser.close()
  rmSync(dir, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} failed` : "\nall held")
process.exit(broken ? 1 : 0)
