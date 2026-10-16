/**
 * ===========================================================================
 *  THE EDITOR'S PREVIEW LANGUAGE AND CURRENCY, MEASURED
 * ===========================================================================
 * Website settings › General › Preview switches the canvas's language and
 * currency with the state the theme's own selectors use. Checked in a
 * browser, with the real hooks over stubbed routes
 * (scripts/render-editor-preview-probe.tsx):
 *
 *   • a website in three languages and two currencies: Language lists all
 *     three, the default first, the unpublished one saying so; Currency the
 *     store's and the market's;
 *   • a pick here moves the canvas's state, and a pick in the theme's
 *     selector moves what is selected here;
 *   • the controls are the page's own dark select, the same box as
 *     Navigation's, and nothing scrolls sideways at 1280 or 390;
 *   • a website in one language and one currency: one line, to Languages &
 *     Currency;
 *   • the inspector's line in a 288px column: how many lines it takes, its
 *     size and colour, and where Edit translation goes.
 *
 *   node scripts/check-editor-preview-controls.mjs   (PROBE_CSS=source without a build)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const css = (await appCss(root)) + "\n" + interFaces(root)

const out = mkdtempSync(join(tmpdir(), "storelib-preview-controls-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
/* In the checkout, so the bundle resolves its packages; .*-probe/ is ignored, and it is removed once bundled. */
const stubs = join(root, ".preview-controls-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/website-builder/editor/install-1"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
writeFileSync(join(stubs, "browser.tsx"), `import { createRoot } from "react-dom/client"
import { boot } from "${join(root, "scripts/render-editor-preview-probe.tsx")}"
window.__errors = []
window.addEventListener("error", (e) => window.__errors.push(String(e.message)))
boot((el) => createRoot(document.getElementById("app")).render(el))
`)
try {
  execFileSync(
  "pnpm",
  [
    "exec", "esbuild", join(stubs, "browser.tsx"), "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
    `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@=${root}`,
    "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--jsx=automatic",
    '--define:process.env.NODE_ENV="production"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
    "--log-level=error",
  ],
  { cwd: root, stdio: "inherit" },
  )
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
const bundle = readFileSync(join(out, "probe.js"))
const html =
  `<!doctype html><html class="light"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${css}</style><style>body{margin:0;background:#fff}</style></head><body>` +
  `<div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script>` +
  `<script src="/probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })

async function open(viewport, query = "") {
  const p = await browser.newPage()
  await p.setViewport(viewport)
  await p.goto(`${origin}/?${query}`, { waitUntil: "load" })
  await sleep(600)
  return p
}
const options = (p, id) => p.$$eval(`#${id} option`, (o) => o.map((x) => ({ value: x.value, text: x.textContent.trim(), selected: x.selected })))
const canvas = (p) => p.evaluate(() => window.__canvas)
const overflow = (p) => p.evaluate(() => {
  const d = document.querySelector("[role=dialog]")
  const main = d.querySelector("main")
  return Math.max(d.scrollWidth - d.clientWidth, main ? main.scrollWidth - main.clientWidth : 0)
})

console.log("\nthree languages, two currencies, 1280 wide")
{
  const p = await open({ width: 1280, height: 900 })
  const card = await p.evaluate(() => {
    const el = document.querySelector("[data-wb-preview]")
    const section = el?.closest("section")
    return el ? { state: el.getAttribute("data-wb-preview"), title: section.querySelector("h2")?.textContent, footer: section.lastElementChild?.textContent } : null
  })
  expect(card?.state === "" && card?.title === "Preview", "a Preview card, under Languages and currencies", card)
  const langs = await options(p, "wb-preview-language")
  expect(JSON.stringify(langs.map((o) => o.text)) === JSON.stringify(["English", "French", "Spanish · Not published"]), "Language: every language, the default first, the unpublished one says so", langs.map((o) => o.text))
  expect(langs[0].selected, "the default is selected while the canvas is in it")
  const money = await options(p, "wb-preview-currency")
  expect(JSON.stringify(money.map((o) => o.text)) === JSON.stringify(["USD · Store currency", "EUR · Europe"]), "Currency: the store currency, then the market", money.map((o) => o.text))

  /* The same box as Navigation's selects and General's name field. */
  const look = await p.evaluate(() => {
    const s = document.getElementById("wb-preview-language")
    const name = document.getElementById("wb-website-name")
    const cs = (e) => { const c = getComputedStyle(e); return [c.height, c.backgroundColor, c.borderTopColor, c.borderRadius, c.fontSize, c.color].join(" ") }
    return { select: cs(s), field: cs(name), width: Math.round(s.getBoundingClientRect().width) }
  })
  expect(look.select === look.field, "its selects are drawn as the page's own field", look)
  await p.screenshot({ path: join(shots, "general-preview-desktop.png"), fullPage: true })

  /* Here, then the canvas. */
  await p.select("#wb-preview-language", "es")
  await p.select("#wb-preview-currency", "eu")
  await sleep(300)
  let c = await canvas(p)
  expect(c.locale === "es" && c.marketId === "eu" && c.currency === "EUR", "a pick here is what the canvas draws", c)

  /* The theme's selector, then here. */
  await p.evaluate(() => { window.__theme.language("fr"); window.__theme.currency("home") })
  await sleep(300)
  c = await canvas(p)
  const lang2 = (await options(p, "wb-preview-language")).find((o) => o.selected)?.value
  const money2 = (await options(p, "wb-preview-currency")).find((o) => o.selected)?.value
  expect(c.locale === "fr" && c.marketId === null && lang2 === "fr" && money2 === "home", "a pick in the theme's selector is what is selected here", { canvas: c, lang2, money2 })

  /* Back to the default from here: the canvas's "no language picked". */
  await p.select("#wb-preview-language", "en")
  await sleep(200)
  c = await canvas(p)
  expect(c.locale === null, "picking the default puts the canvas back in the website's own language", c)
  expect((await overflow(p)) === 0, "nothing scrolls sideways", await overflow(p))
  const errors = await p.evaluate(() => window.__errors)
  expect(errors.length === 0, "no errors on the page", errors)
  await p.close()
}

console.log("\nthe same, 390 wide")
{
  const p = await open({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  /* A phone opens on the list of subjects; General is its first. */
  await p.evaluate(() => [...document.querySelectorAll("nav[aria-label='Website settings'] button")].find((b) => b.textContent.trim() === "General")?.click())
  await sleep(700)
  const box = await p.evaluate(() => {
    const s = document.getElementById("wb-preview-language")
    const r = s.getBoundingClientRect()
    return { left: Math.round(r.left), right: Math.round(r.right), height: Math.round(r.height), font: getComputedStyle(s).fontSize }
  })
  expect(box.left >= 16 && box.right <= 390 - 16 && box.height === 44 && box.font === "16px", "the select fits the gutter, a thumb tall, 16px so iOS does not zoom", box)
  expect((await overflow(p)) === 0, "nothing scrolls sideways", await overflow(p))
  await p.evaluate(() => document.querySelector("[data-wb-preview]")?.scrollIntoView({ block: "center" }))
  await sleep(200)
  await p.screenshot({ path: join(shots, "general-preview-phone.png") })
  await p.close()
}

console.log("\none language, one currency")
{
  const p = await open({ width: 1280, height: 900 }, "store=single")
  const single = await p.evaluate(() => {
    const el = document.querySelector("[data-wb-preview]")
    const section = el?.closest("section")
    return el ? { state: el.getAttribute("data-wb-preview"), rows: el.children.length, text: el.textContent.trim(), selects: section.querySelectorAll("select").length, title: !!section.querySelector("h2") } : null
  })
  expect(single?.state === "single" && single.rows === 1 && single.selects === 0 && !single.title, "one line, no controls", single)
  await p.evaluate(() => [...document.querySelectorAll("[data-wb-preview] button")].find((b) => b.textContent.trim() === "Add languages and currencies")?.click())
  const calls = await p.evaluate(() => window.__calls.filter((c) => c.startsWith("navigate")))
  expect(calls.includes("navigate /app/settings?tab=markets"), "Add languages and currencies goes to Languages & Currency", calls)
  await p.evaluate(() => document.querySelector("[data-wb-preview]")?.scrollIntoView({ block: "center" }))
  await p.screenshot({ path: join(shots, "general-preview-single.png") })
  await p.close()
}

console.log("\nthe inspector in another language, 288px column")
{
  const p = await open({ width: 1280, height: 600 }, "mode=note")
  const note = await p.evaluate(() => {
    const el = document.querySelector("[data-preview-language-note]")
    const cs = getComputedStyle(el)
    const lh = parseFloat(cs.lineHeight)
    const inner = el.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
    return { text: el.textContent.trim(), lines: Math.round(inner / lh), font: cs.fontSize, color: cs.color, top: Math.round(el.getBoundingClientRect().top), firstInColumn: el.parentElement.firstElementChild === el }
  })
  expect(note.text === "Showing Spanish. Fields show your original text. Edit translation", "says which language and that the fields hold the original", note.text)
  expect(note.firstInColumn && note.top === 0, "at the top of the panel's content", note)
  expect(note.font === "12px", "in the panel's small text", note.font)
  console.log(`  note  it takes ${note.lines} line(s) in the 288px column, colour ${note.color}`)
  await p.evaluate(() => [...document.querySelectorAll("[data-preview-language-note] button")].find((b) => b.textContent.trim() === "Edit translation")?.click())
  const calls = await p.evaluate(() => window.__calls.filter((c) => c.startsWith("navigate")))
  expect(calls.includes("navigate /app/settings?tab=markets&translate=es"), "Edit translation opens Languages & Currency on that language", calls)
  await p.screenshot({ path: join(shots, "inspector-note.png"), clip: { x: 0, y: 0, width: 300, height: 140 } })
  await p.close()
}

await browser.close()
server.close()
console.log(`\nScreenshots: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
