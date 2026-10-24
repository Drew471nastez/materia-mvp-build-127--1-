/**
 * Website settings › Domains, in a browser: connect a domain, then open the
 * "Bought at" list. The list is portalled to the body, so it has to sit
 * above the full-screen settings page or it opens unseen and the page
 * stops answering clicks (Radix blocks pointer events outside an open list).
 *
 *   node scripts/check-website-domains.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) { console.error("no browser"); process.exit(1) }
const css = await appCss(root)
const out = mkdtempSync(join(tmpdir(), "storelib-domains-"))
const stubs = join(root, ".settings-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/website-builder/editor/install-1"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
writeFileSync(join(stubs, "domains-browser.tsx"), `import { createRoot } from "react-dom/client"
import { boot } from "${join(root, "scripts/render-website-settings-probe.tsx")}"
window.__errors = []
const origError = console.error
console.error = (...a) => { window.__errors.push(a.map(String).join(" ")); origError(...a) }
window.addEventListener("error", (e) => window.__errors.push(String(e.message)))
window.__section = "domains"
boot((el) => createRoot(document.getElementById("app")).render(el))
`)
execFileSync("npx", ["esbuild", join(stubs, "domains-browser.tsx"), "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@=${root}`,
  "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--jsx=automatic", '--define:process.env.NODE_ENV="production"',
  '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"', "--log-level=error"],
  { cwd: root, stdio: "inherit" })
const bundle = readFileSync(join(out, "probe.js"))
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script src="/probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  res.writeHead(200, { "content-type": "text/html" }); res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`); if (!ok) broken++ }
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
for (const vp of [{ width: 1280, height: 860 }, { width: 390, height: 844, isMobile: true, hasTouch: true }]) {
  console.log(`\n${vp.width} wide`)
  const p = await browser.newPage()
  await p.setViewport(vp)
  await p.goto(origin, { waitUntil: "load" })
  await p.waitForSelector("#wb-new-domain", { timeout: 15000 })
  await p.type("#wb-new-domain", "newstudio.com")
  await p.evaluate(() => [...document.querySelectorAll("main button")].find((b) => /^(Connect|Replace)$/.test(b.textContent.trim()))?.click())
  await sleep(200)
  await p.evaluate(() => [...document.querySelectorAll("main button")].find((b) => /^(Connect|Replace)$/.test(b.textContent.trim()))?.click())
  await p.waitForSelector("[data-dns-registrar]", { timeout: 5000 }).catch(() => null)
  const trigger = await p.$("[data-dns-registrar]")
  expect(Boolean(trigger), "the new domain shows its records and the Bought at list")
  if (!trigger) continue
  await trigger.evaluate((el) => el.scrollIntoView({ block: "center" }))
  await sleep(200)
  await trigger.click()
  await sleep(500)
  const state = await p.evaluate(() => {
    const list = document.querySelector("[role=listbox]")
    if (!list) return { open: false }
    const opt = list.querySelector("[data-registrar-option]")
    const r = opt.getBoundingClientRect()
    /* elementFromPoint skips anything with pointer-events: none, which Radix sets on the body while the list is open; lifted for the read. */
    const pe = document.body.style.pointerEvents
    document.body.style.pointerEvents = "auto"
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    document.body.style.pointerEvents = pe
    return { open: true, onTop: Boolean(top && list.contains(top)), hit: top ? top.tagName + "." + String(top.className).slice(0, 40) : null }
  })
  await p.screenshot({ path: join(out, `domains-open-${vp.width}.png`) })
  expect(state.open, "pressing it opens the list")
  expect(state.onTop, "and the list is drawn over the settings page, where it can be pressed", state)
  if (state.onTop) {
    await p.evaluate(() => document.querySelector("[data-registrar-option=namecheap]")?.click())
    await sleep(300)
    const picked = await p.evaluate(() => document.querySelector("[data-dns-registrar]").textContent.trim())
    expect(/Namecheap/.test(picked), "and choosing one sets it", picked)
  }
  /* Escape closes the list and only the list: Website settings stays open. */
  await trigger.click()
  await sleep(400)
  await p.keyboard.press("Escape")
  await sleep(300)
  const after = await p.evaluate(() => ({ list: Boolean(document.querySelector("[role=listbox]")), settings: Boolean(document.querySelector("[role=dialog][aria-label='Website settings']")) }))
  expect(!after.list && after.settings, "Escape closes the list and keeps Website settings open", after)
  const errors = await p.evaluate(() => window.__errors)
  expect(errors.length === 0, "no errors in the console", errors.slice(0, 3))
  await p.screenshot({ path: join(out, `domains-${vp.width}.png`) })
  await p.close()
}
await browser.close(); server.close()
console.log(`\nshots in ${out}`)
process.exit(broken ? 1 : 0)
