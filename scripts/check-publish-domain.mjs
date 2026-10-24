/**
 * ===========================================================================
 *  PUBLISH › WEBSITE URL › + ADD DOMAIN, IN A BROWSER
 * ===========================================================================
 * The Publish panel (scripts/render-publish-domain.tsx) at 1280 and 390:
 *
 *   • on a plan with domains, "+ Add domain" on the Website URL line opens a
 *     window to connect one; typing a domain and pressing Connect shows its
 *     records and Check DNS, and Check says Connected;
 *   • on a plan without, the Pro pill is beside it and it is a link to the
 *     upgrade page, and no window opens;
 *   • a domain already connected is a row in the URL card with its status,
 *     and no Add domain;
 *   • closing the window gives the Publish panel back;
 *   • nothing scrolls sideways, and no console errors.
 *
 *   node scripts/check-publish-domain.mjs
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
const out = mkdtempSync(join(tmpdir(), "storelib-publish-domain-"))
const stubs = join(root, ".settings-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/website-builder/editor/install-1"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
writeFileSync(join(stubs, "publish-browser.tsx"), `window.__errors = []
const origError = console.error
console.error = (...a) => { window.__errors.push(a.map(String).join(" ")); origError(...a) }
window.addEventListener("error", (e) => window.__errors.push(String(e.message)))
import("${join(root, "scripts/render-publish-domain.tsx")}")
`)
execFileSync("npx", ["esbuild", join(stubs, "publish-browser.tsx"), "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@=${root}`,
  "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--jsx=automatic", '--define:process.env.NODE_ENV="production"',
  '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"', "--log-level=error"],
  { cwd: root, stdio: "inherit" })
const bundle = readFileSync(join(out, "probe.js"))
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0}</style></head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script src="/probe.js"></script></body></html>`
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

const press = (p, sel) => p.evaluate((s) => { const el = document.querySelector(s); if (!el) return false; el.click(); return true }, sel)
const pressText = (p, text) => p.evaluate((t) => { const el = [...document.querySelectorAll("button, a")].find((b) => b.textContent.trim() === t); if (!el) return false; el.click(); return true }, text)

for (const [label, vp, q] of [
  ["desktop", { width: 1280, height: 860 }, ""],
  ["phone", { width: 390, height: 844, isMobile: true, hasTouch: true }, "&mobile=1"],
]) {
  console.log(`\n${label}`)
  {
    const p = await browser.newPage()
    await p.setViewport(vp)
    await p.goto(`${origin}/?plan=pro${q}`, { waitUntil: "load" })
    await sleep(1200)
    const line = await p.evaluate(() => {
      const el = document.querySelector("[data-publish-add-domain]")
      return el ? { kind: el.getAttribute("data-publish-add-domain"), text: el.textContent.trim(), pro: Boolean(el.querySelector("[data-publish-pro]")), row: el.parentElement.textContent.trim() } : null
    })
    expect(line?.kind === "connect" && /Add domain/.test(line.text) && !line.pro, "a plan with domains: + Add domain, no Pro pill", line)
    expect(/^Website URL/.test(line?.row ?? ""), "on the Website URL line", line?.row)
    await p.screenshot({ path: join(out, `${label}-panel.png`) })
    await pressText(p, "Add domain")
    await sleep(700)
    const dialog = await p.evaluate(() => {
      const d = document.querySelector("[data-connect-domain]")
      if (!d) return null
      const r = d.getBoundingClientRect()
      return { title: d.textContent.includes("Connect a domain"), input: Boolean(document.querySelector("#publish-new-domain")), panel: Boolean(document.querySelector("[role=dialog][aria-label=Publish]")), visible: r.height > 100 && r.bottom <= innerHeight + 1 }
    })
    expect(dialog?.title && dialog.input && dialog.visible, "it opens the window to connect a domain", dialog)
    await p.type("#publish-new-domain", "https://www.NewStudio.com/")
    await pressText(p, "Connect")
    await sleep(600)
    const added = await p.evaluate(() => ({
      calls: window.__calls.filter((c) => c.startsWith("POST")),
      records: Boolean(document.querySelector("[data-connect-domain] [data-dns-setup]")),
      status: document.querySelector("[data-domain-status]")?.getAttribute("data-domain-status"),
    }))
    expect(added.calls.includes("POST /api/domains") && added.records && added.status === "pending", "Connect adds it and shows its records and status", added)
    await p.screenshot({ path: join(out, `${label}-records.png`) })
    await pressText(p, "Check DNS")
    await sleep(500)
    const verified = await p.evaluate(() => document.querySelector("[data-domain-status]")?.getAttribute("data-domain-status"))
    expect(verified === "active", "Check DNS marks it connected", verified)
    const sideways = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    expect(sideways <= 0, "nothing scrolls sideways", sideways)
    await press(p, "[data-connect-domain] button[aria-label=Close]")
    await sleep(700)
    const back = await p.evaluate(() => ({
      window: Boolean(document.querySelector("[data-connect-domain]")) && document.querySelector("[data-connect-domain]").getBoundingClientRect().top < innerHeight - 10,
      row: document.querySelector("[data-publish-domain]")?.textContent.trim() ?? null,
      add: Boolean(document.querySelector("[data-publish-add-domain]")),
    }))
    expect(!back.window && /www\.newstudio\.com/.test(back.row ?? "") && /Connected/.test(back.row ?? "") && !back.add, "closing gives Publish back, with the domain as a row and its status", back)
    await p.screenshot({ path: join(out, `${label}-back.png`) })
    const errors = await p.evaluate(() => window.__errors)
    expect(errors.length === 0, "no console errors", errors.slice(0, 3))
    await p.close()
  }
  {
    const p = await browser.newPage()
    await p.setViewport(vp)
    await p.goto(`${origin}/?plan=free${q}`, { waitUntil: "load" })
    await sleep(1200)
    const line = await p.evaluate(() => {
      const el = document.querySelector("[data-publish-add-domain]")
      const a = el?.querySelector("a")
      return el ? { kind: el.getAttribute("data-publish-add-domain"), pro: el.querySelector("[data-publish-pro]")?.textContent.trim(), href: a?.getAttribute("href"), target: a?.getAttribute("target") } : null
    })
    expect(line?.kind === "upgrade" && line.pro === "Pro" && line.href === "/app/settings/billing/upgrade", "a plan without: the Pro pill, and Add domain goes to the upgrade page", line)
    await p.screenshot({ path: join(out, `${label}-free.png`) })
    await p.close()
  }
  {
    const p = await browser.newPage()
    await p.setViewport(vp)
    await p.goto(`${origin}/?plan=pro&domain=pending${q}`, { waitUntil: "load" })
    await sleep(1200)
    const row = await p.evaluate(() => ({ row: document.querySelector("[data-publish-domain]")?.textContent.trim() ?? null, add: Boolean(document.querySelector("[data-publish-add-domain]")) }))
    expect(/www\.astridstudio\.com/.test(row.row ?? "") && /Waiting for DNS/.test(row.row ?? "") && !row.add, "a domain already connected shows with its status, and no Add domain", row)
    await press(p, "[data-publish-domain]")
    await sleep(700)
    const opened = await p.evaluate(() => ({ records: Boolean(document.querySelector("[data-connect-domain] [data-dns-setup]")), field: Boolean(document.querySelector("#publish-new-domain")) }))
    expect(opened.records && !opened.field, "pressing it opens its records, not an empty field", opened)
    await p.close()
  }
}
await browser.close(); server.close()
console.log(`\nshots in ${out}`)
process.exit(broken ? 1 : 0)
