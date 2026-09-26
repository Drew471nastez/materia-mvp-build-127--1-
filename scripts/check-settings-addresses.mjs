/**
 * ===========================================================================
 *  SETTINGS, GENERAL: YOUR ADDRESSES ON A PHONE AND A COMPUTER
 * ===========================================================================
 * "On mobile there's too much text, that one text shrinks the rest." The
 * Website row carried a sentence and four actions, which squeezed its text
 * into a third of the row, one or two words a line, and cut the OnePage's
 * address off.
 *
 * The real Settings page on General (scripts/render-settings-addresses.tsx),
 * with the owner's account, at 390 and 1280, three ways: no website, a
 * website at the username's subdomain, and one with a domain of its own.
 * For every row it reads:
 *
 *   ADDRESS    its drawn width against the row's, and whether it is cut
 *              (text wider than its box) when the whole of it would fit
 *   LINES      how many lines each piece of text takes; one each
 *   SENTENCE   no row explains itself ("Published: ...", "A custom domain")
 *   TARGETS    every button and link, 44px or more each way on a phone
 *   ACTIONS    Copy copies the row's address, Open opens it, and every
 *              place the row went before is still reachable from it
 *   HEIGHT     the card's and the list's
 *
 *   node scripts/check-settings-addresses.mjs
 *   SHOTS=/some/dir node scripts/check-settings-addresses.mjs
 *   PROBE_STRICT=0 node scripts/check-settings-addresses.mjs   (report only)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS
const STRICT = process.env.PROBE_STRICT !== "0"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".settings-addresses-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/app/settings"
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(dir, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) }, from: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-settings-addresses.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }

/* Inter from a build, served by this server: a page on http cannot read file:// fonts. */
let mediaDir = null
const faces = interFaces(root).replace(/url\(file:\/\/([^)]*?\/static\/media)\//g, (_, d) => { mediaDir = d; return "url(/media/" })
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${faces}</style><style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  if (url.pathname.startsWith("/media/") && mediaDir) {
    const file = join(mediaDir, url.pathname.slice(7))
    if (existsSync(file)) { res.writeHead(200, { "content-type": "font/woff2" }); res.end(readFileSync(file)); return }
  }
  if (url.pathname.startsWith("/api/")) {
    const site = new URL(req.headers.referer || "http://x/").searchParams.get("site")
    const body = url.pathname.startsWith("/api/domains")
      ? { domains: site === "domain" ? [{ id: "d1", domain: "lucadragoste.com", status: "active", purpose: "website", is_primary: true }] : [], primary: { website: site === "domain" ? "lucadragoste.com" : null, creator_page: null }, schema: "current" }
      : url.pathname.startsWith("/api/billing/subscription") ? { currentPlan: { id: "growth" } } : {}
    setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)) }, 60)
    return
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const problems = []
const report = { font: faces ? "Inter" : "fallback (no build with Inter found)" }
const SENTENCE = /Published:|custom domain is set|Its own address|until you give it/

for (const [label, viewport] of [
  ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["1280", { width: 1280, height: 900, deviceScaleFactor: 1 }],
]) {
  const phone = label === "390"
  for (const site of ["sub", "domain", "none"]) {
    const page = await browser.newPage()
    await page.setViewport(viewport)
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e)))
    await page.evaluateOnNewDocument(() => {
      window.__copied = []
      window.__opened = []
      Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t) => { window.__copied.push(t) } }, configurable: true })
      window.open = (u) => { window.__opened.push(String(u)); return {} }
    })
    await page.goto(`${base}/app/settings?site=${site}`)
    await page.waitForSelector("[data-address-row]")
    await page.evaluate(() => document.fonts.ready)
    await wait(500)

    const measured = await page.evaluate(() => {
      const textW = (el) => { const r = document.createRange(); r.selectNodeContents(el); return Math.round(r.getBoundingClientRect().width * 10) / 10 }
      const box = (el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 } }
      const card = document.querySelector('[data-settings-card="profile"]')
      const list = document.querySelector("[data-address-list]")
      const rows = [...document.querySelectorAll("[data-address-row]")].map((row) => {
        const address = row.querySelector("[data-address-display]") ?? row.querySelector("div > p:nth-child(2)")
        const texts = [...row.querySelectorAll("p, span")].filter((el) => !el.closest("button, a") && el.children.length === 0 && el.textContent.trim())
        const lines = texts.map((el) => {
          const cs = getComputedStyle(el)
          const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5
          return { text: el.textContent.trim(), lines: Math.round(el.getBoundingClientRect().height / lh) }
        })
        const targets = [...row.querySelectorAll("button, a")].filter((el) => el.getClientRects().length).map((el) => ({ name: el.getAttribute("aria-label") || el.textContent.trim(), ...box(el) }))
        return {
          row: row.getAttribute("data-address-row"),
          rowW: box(row).w,
          rowH: box(row).h,
          address: address?.textContent.trim() ?? null,
          /* The text's own width (a range over it), what of it is drawn, and the box it has. */
          addressFullW: address ? textW(address) : null,
          addressW: address ? Math.round(Math.min(textW(address), address.clientWidth) * 10) / 10 : null,
          addressBoxW: address ? address.clientWidth : null,
          truncated: address ? address.scrollWidth > address.clientWidth + 0.5 : null,
          lines,
          text: row.innerText.replace(/\s+/g, " ").trim(),
          targets,
        }
      })
      return { cardH: card ? box(card).h : null, listH: list ? box(list).h : null, rows }
    })

    /* The card as it rests, before anything is pressed. */
    if (SHOTS) {
      mkdirSync(SHOTS, { recursive: true })
      const clip = await page.evaluate(() => { const r = document.querySelector('[data-settings-card="profile"]').getBoundingClientRect(); const s = document.querySelector(".app-content-scroll"); s.scrollTop += r.top - 80; const b = document.querySelector('[data-settings-card="profile"]').getBoundingClientRect(); return { x: Math.max(0, b.left - 8), y: Math.max(0, b.top - 8), width: b.width + 16, height: b.height + 16 } })
      await wait(100)
      await page.screenshot({ path: join(SHOTS, `settings-addresses-${label}-${site}.png`), clip })
    }

    /* Every place a row goes: its links, and what its menu offers once open. */
    for (const row of measured.rows) {
      row.hrefs = await page.evaluate((name) => [...document.querySelector(`[data-address-row="${name}"]`).querySelectorAll("a[href]")].map((a) => a.getAttribute("href")), row.row)
      const hasMenu = await page.evaluate((name) => !!document.querySelector(`[data-address-row="${name}"] [data-address-menu]`), row.row)
      if (hasMenu) {
        await page.click(`[data-address-row="${row.row}"] [data-address-menu]`)
        await wait(phone ? 600 : 250)
        row.menu = await page.evaluate(() => {
          const host = document.querySelector("[data-action-sheet]") ?? document.querySelector("[data-action-list]")
          return host ? [...host.querySelectorAll("a, button")].map((el) => ({ label: el.textContent.trim(), href: el.getAttribute("href"), h: Math.round(el.getBoundingClientRect().height) })) : null
        })
        if (SHOTS && site === "sub") { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: join(SHOTS, `settings-addresses-menu-${label}.png`) }) }
        await page.keyboard.press("Escape")
        await wait(phone ? 600 : 250)
      }
      /* Copy and Open, pressed. */
      const copy = await page.$(`[data-address-row="${row.row}"] button[aria-label^="Copy"]`)
      const open = await page.$(`[data-address-row="${row.row}"] button[aria-label^="Open"]`)
      if (copy) { await copy.click(); await wait(80) }
      if (open) { await open.click(); await wait(80) }
      const { copied, opened } = await page.evaluate(() => ({ copied: window.__copied.slice(-1)[0] ?? null, opened: window.__opened.slice(-1)[0] ?? null }))
      row.copied = copy ? copied : null
      row.opened = open ? opened : null
      await page.evaluate(() => { window.__copied = []; window.__opened = [] })
    }
    await page.close()

    const key = `${label}/${site}`
    report[key] = { cardH: measured.cardH, listH: measured.listH, rows: measured.rows, errors: errors.slice(0, 3) }
    for (const r of measured.rows) {
      const at = `at ${label}, ${site}, ${r.row}:`
      if (SENTENCE.test(r.text)) problems.push(`${at} it explains itself: "${r.text}"`)
      const wrapped = r.lines.filter((l) => l.lines > 1)
      if (wrapped.length) problems.push(`${at} text on more than one line: ${wrapped.map((l) => `"${l.text}" x${l.lines}`).join(", ")}`)
      if (r.truncated && r.addressFullW <= r.rowW) problems.push(`${at} the address is cut (${r.addressW}px of ${r.addressFullW}px) although the row is ${r.rowW}px`)
      if (phone) for (const t of r.targets) if (t.w < 44 || t.h < 44) problems.push(`${at} "${t.name}" is ${t.w}x${t.h}`)
      if (phone) for (const m of r.menu ?? []) if (m.h < 44) problems.push(`${at} the menu's "${m.label}" is ${m.h}px tall`)
      /* Where it goes: everything it went to before, and the address it shows. */
      const reach = [...r.hrefs, ...(r.menu ?? []).map((m) => m.href)]
      const want = {
        "Creator page": ["/creator-page"],
        OnePage: ["/app/onepage"],
        Website: site === "none" ? ["/app/website-builder"] : ["?settings=domains", "?settings=seo", "?settings=general"].map((q) => `/website-builder/editor/install-1${q}`),
      }[r.row] ?? []
      for (const w of want) if (!reach.includes(w)) problems.push(`${at} ${w} is no longer reachable`)
      const url = { "Creator page": "https://storelib.com/andrewrullz", OnePage: "https://storelib.com/andrewrullz/links", Website: site === "domain" ? "https://lucadragoste.com" : site === "sub" ? "https://andrewrullz.storelib.com" : null }[r.row]
      if (url && (r.copied !== url || r.opened !== url)) problems.push(`${at} copies ${r.copied} and opens ${r.opened}, not ${url}`)
    }
  }
}

await browser.close()
server.close()
console.log(JSON.stringify(report, null, 1))
if (problems.length) {
  if (STRICT) fail(problems.join("\n"))
  console.log(`\n${problems.length} problems (report only):\n${problems.join("\n")}`)
} else console.log("\nok: every address is whole on one line, nothing explains itself, every target is 44px on a phone")
