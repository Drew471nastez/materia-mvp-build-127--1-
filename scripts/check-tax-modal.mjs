/**
 * ===========================================================================
 *  SETTINGS › TAXES, WHO DOES WHAT, MEASURED
 * ===========================================================================
 * The real TaxesPanel (components/app/settings/taxes-panel.tsx), bundled with
 * its own CSS and fed a store's setup and overview by a small server, in
 * headless Chromium at 390 (a phone) and 1280 (a computer), in English and
 * in German (the longest of the six languages):
 *
 *   • Who does what is a button in Tax collected, and a press opens the
 *     shared Modal: a sheet from the bottom edge on a phone, a centred
 *     dialog no wider than 520 on a computer;
 *   • everything in it is on screen without scrolling sideways, its text at
 *     14px, the close button big enough to press;
 *   • it arrives with motion (the sheet rises, the dialog fades and grows),
 *     and Escape or the close button closes it;
 *   • the status lines at the top are in the dashboard's language.
 *
 *   node scripts/check-tax-modal.mjs   (PROBE_CSS=source without a build)
 *
 * Screenshots go to SHOTS_DIR (prefix tax-modal-), or a temporary folder.
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

const out = mkdtempSync(join(tmpdir(), "storelib-tax-modal-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
const stubs = join(root, ".tax-modal-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/app/settings"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
writeFileSync(join(stubs, "browser.tsx"), `import React from "react"
import { createRoot } from "react-dom/client"
import { TaxesPanel } from "${join(root, "components/app/settings/taxes-panel.tsx")}"
import { loadCatalog, setCatalog } from "${join(root, "lib/i18n/text.ts")}"
window.__errors = []
const origError = console.error
console.error = (...a) => { window.__errors.push(a.map(String).join(" ")); origError(...a) }
window.addEventListener("error", (e) => window.__errors.push(String(e.message)))
const lang = new URLSearchParams(location.search).get("lang") || "en"
loadCatalog(lang).then((words) => {
  setCatalog(lang, words)
  createRoot(document.getElementById("app")).render(
    React.createElement("div", { className: "min-h-svh bg-[#f8f9fa] font-sans" },
      React.createElement("div", { className: "mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8" }, React.createElement(TaxesPanel))),
  )
})
`)
execFileSync(
  "npx",
  [
    "esbuild", join(stubs, "browser.tsx"), "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
    `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@=${root}`,
    "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--jsx=automatic",
    '--define:process.env.NODE_ENV="production"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
    "--log-level=error",
  ],
  { cwd: root, stdio: "inherit" },
)
const bundle = readFileSync(join(out, "probe.js"))
rmSync(stubs, { recursive: true, force: true })

const SETUP = {
  enabled: true, included: true, onShipping: false, digital: true, ready: true, detectedCountry: "DE", currency: "EUR",
  regions: [{ id: "de", country: "DE", region: null, name: "VAT", rateBps: 1900 }, { id: "fr", country: "FR", region: null, name: "TVA", rateBps: 2000 }],
  overrides: [], products: [],
}
const OVERVIEW = {
  status: [
    { key: "store", state: "charging", count: 2, digital: true, tone: "on", title: "Charging tax in 2 regions", detail: "" },
    { key: "memberships", state: "own_rates", count: 2, digital: true, tone: "on", title: "Memberships: your rates", detail: "" },
  ],
  summary: { totalCents: 48210, orders: 31, byCountry: [{ country: "DE", label: "VAT", taxCents: 30120, orders: 19 }, { country: "FR", label: "TVA", taxCents: 18090, orders: 12 }] },
  days: 30,
  currency: "EUR",
}
const html =
  `<!doctype html><html class="light"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
  `<style>${css}</style><style>body{margin:0;background:#f8f9fa}</style></head><body>` +
  `<div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script>` +
  `<script src="/probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  if (req.url.startsWith("/api/store/taxes/overview")) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(OVERVIEW)) }
  if (req.url.startsWith("/api/store/taxes")) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(SETUP)) }
  if (req.url.startsWith("/api/")) { res.writeHead(200, { "content-type": "application/json" }); return res.end("{}") }
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

const TITLE = { en: "Who does what", de: "Wer was macht" }

for (const lang of ["en", "de"]) {
  for (const [w, h] of [[390, 844], [1280, 800]]) {
    const phone = w < 640
    console.log(`\n${phone ? "Phone" : "Computer"} ${w}x${h}, ${lang}`)
    const p = await browser.newPage()
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone })
    await p.goto(`${origin}/?lang=${lang}`, { waitUntil: "load" })
    await p.waitForSelector("[data-tax-responsibility]")
    await sleep(300)
    const status = await p.$$eval("[data-tax-status] li", (els) => els.map((e) => e.textContent.trim()))
    expect(lang === "en" ? status[0] === "Charging tax in 2 regions" : status[0] === "Steuer in 2 Regionen", "the status line is in the dashboard's language", status[0])
    const btn = await p.$eval("[data-tax-responsibility]", (e) => { const r = e.getBoundingClientRect(); return { tag: e.tagName, h: Math.round(r.height), text: e.textContent.trim(), popup: e.getAttribute("aria-haspopup") } })
    expect(btn.tag === "BUTTON" && btn.popup === "dialog" && btn.text === TITLE[lang], "Who does what is a button that opens a dialog", btn)
    expect(btn.h >= 36, "  tall enough to press", `${btn.h}px`)
    await p.$eval("[data-tax-responsibility]", (e) => e.scrollIntoView({ block: "center" }))
    await p.click("[data-tax-responsibility]")
    /* Motion: the panel's box sampled while it arrives. */
    const frames = await p.evaluate(async (title) => {
      const seen = []
      const t0 = performance.now()
      while (performance.now() - t0 < 520) {
        const d = [...document.querySelectorAll("[role=dialog]")].find((x) => x.getAttribute("aria-label") === title)
        /* A phone sheet's dialog covers the screen; the panel that moves is the one holding its handle. */
        const panel = d ? d.querySelector("[data-sheet-handle]")?.parentElement ?? d : null
        if (panel) {
          const r = panel.getBoundingClientRect()
          seen.push({ t: Math.round(performance.now() - t0), top: Math.round(r.top), opacity: Number(getComputedStyle(panel).opacity), scale: getComputedStyle(panel).transform })
        }
        await new Promise((r) => requestAnimationFrame(r))
      }
      return seen
    }, TITLE[lang])
    expect(frames.length > 5, "the panel is on screen while it arrives", `${frames.length} frames`)
    const first = frames[0]
    const last = frames[frames.length - 1]
    const moved = first && last && (first.top - last.top > 8 || first.opacity < last.opacity - 0.05 || first.scale !== last.scale)
    expect(!!moved, phone ? "the sheet rises into place" : "the dialog fades and grows into place", first && last ? `top ${first.top}→${last.top}, opacity ${first.opacity}→${last.opacity}` : "none")
    await sleep(250)
    const m = await p.evaluate((title) => {
      const d = [...document.querySelectorAll("[role=dialog]")].find((x) => x.getAttribute("aria-label") === title)
      if (!d) return null
      const r = (d.querySelector("[data-sheet-handle]")?.parentElement ?? d).getBoundingClientRect()
      const parts = [...d.querySelectorAll("[data-tax-who] dt")].map((e) => e.textContent.trim())
      const dd = d.querySelector("[data-tax-who] dd")
      const close = [...d.querySelectorAll("button")].find((b) => /close|schlie/i.test(b.getAttribute("aria-label") || ""))
      const cr = close ? close.getBoundingClientRect() : null
      const scrollers = [...d.querySelectorAll("*")].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== "visible")
      const who = d.querySelector("[data-tax-who]")
      const wr = who.getBoundingClientRect()
      return {
        left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height),
        parts, ddSize: dd ? getComputedStyle(dd).fontSize : null, ddColor: dd ? getComputedStyle(dd).color : null,
        close: cr ? { w: Math.round(cr.width), h: Math.round(cr.height) } : null,
        sideways: scrollers.length, docSideways: document.documentElement.scrollWidth > innerWidth,
        whoBottom: Math.round(wr.bottom), radius: getComputedStyle(d).borderTopLeftRadius,
        text: who.textContent,
      }
    }, TITLE[lang])
    expect(!!m, "it opens", m ? `${m.width}x${m.height}` : "nothing")
    if (!m) { await p.close(); continue }
    await p.screenshot({ path: join(shots, `tax-modal-${lang}-${w}.png`) })
    if (phone) {
      expect(m.bottom === h && m.left === 0 && m.width === w, "a sheet on the bottom edge, the phone's whole width", `left ${m.left}, bottom ${m.bottom}, width ${m.width}`)
      expect(m.top >= 40, "  with the page still showing above it", `top ${m.top}`)
    } else {
      expect(m.width <= 520 && Math.abs(m.left + m.right - w) <= 2, "a centred dialog no wider than 520", `width ${m.width}, left ${m.left}, right ${w - m.right}`)
      expect(m.top >= 0 && m.bottom <= h, "  wholly on screen", `top ${m.top}, bottom ${m.bottom}`)
    }
    expect(m.parts.length === 4, "four parts: Storelib, you, memberships, payments", m.parts.join(" | "))
    expect(m.ddSize === "14px", "  each said at 14px", m.ddSize)
    expect(m.whoBottom <= m.bottom, "  all of it inside the panel", `content ends ${m.whoBottom}, panel ${m.bottom}`)
    expect(m.sideways === 0 && !m.docSideways, "nothing scrolls sideways", `${m.sideways} boxes`)
    expect(!!m.close && m.close.w >= 36 && m.close.h >= 36, "a close button big enough to press", m.close)
    expect(!/[—]/.test(m.text) && !/\b(unlock|elevate|seamless|powerful|effortless|supercharge|transform)/i.test(m.text), "no em dashes and no AI words")
    expect(lang === "en" ? /does not file or pay tax/.test(m.text) : /zahlt keine Steuer/.test(m.text), "it says who files and pays: the seller")
    /* Closing: Escape on a computer, the close button on a phone. */
    if (phone) await p.evaluate((title) => [...document.querySelectorAll("[role=dialog]")].find((x) => x.getAttribute("aria-label") === title)?.querySelector("[data-close]")?.click(), TITLE[lang])
    else await p.keyboard.press("Escape")
    await sleep(700)
    const gone = await p.evaluate((title) => ![...document.querySelectorAll("[role=dialog]")].some((x) => x.getAttribute("aria-label") === title && x.getBoundingClientRect().height > 0 && getComputedStyle(x).visibility !== "hidden"), TITLE[lang])
    expect(gone, phone ? "the close button closes it" : "Escape closes it")
    const errors = await p.evaluate(() => window.__errors)
    expect(errors.length === 0, "no errors on the page", errors.slice(0, 2))
    await p.close()
  }
}

await browser.close()
server.close()
console.log(`\nScreenshots: ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
