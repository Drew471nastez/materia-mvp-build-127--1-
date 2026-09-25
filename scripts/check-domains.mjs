/**
 * ===========================================================================
 *  SETTINGS › DOMAINS, MEASURED
 * ===========================================================================
 * The real Settings page (scripts/render-settings-tabs.tsx) opened on its
 * Domains tab, with a creator on Pro who has three domains: a website domain
 * that is connected and primary, a second website domain still waiting on
 * DNS, and a creator page domain on a subdomain. At 390 and 1280 this reads:
 *
 *   the two groups     Website and Creator page, each with its own domains
 *   the waiting one    shows the records Vercel asked for, and Check again
 *   primary            said once per group, and offered on the other one
 *   nothing sideways   no horizontal scroll at a phone's width
 *   the add form       asks what the domain is for before it is sent
 *
 *   node scripts/check-domains.mjs            (SHOTS_DIR=... keeps the pictures)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-domains-")), "shots")
mkdirSync(shots, { recursive: true })

const dir = join(root, ".domains-probe")
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
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-settings-tabs.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

const records = (host, apex) => apex
  ? [{ type: "A", name: "@", value: "216.150.1.1" }, { type: "CNAME", name: "www", value: "cname.vercel-dns.com" }]
  : [{ type: "CNAME", name: host.split(".")[0], value: "cname.vercel-dns.com" }]
const domains = [
  { id: "d1", domain: "maralind.com", purpose: "website", is_primary: true, status: "active", ssl_status: "active", created_at: "2026-08-01T10:00:00Z", host: "www.maralind.com", apex: true, records: records("maralind.com", true) },
  { id: "d2", domain: "maralind.shop", purpose: "website", is_primary: false, status: "pending", ssl_status: "pending", created_at: "2026-09-20T10:00:00Z", host: "www.maralind.shop", apex: true, records: records("maralind.shop", true) },
  { id: "d3", domain: "links.maralind.com", purpose: "creator_page", is_primary: true, status: "pending", ssl_status: "pending", created_at: "2026-09-24T10:00:00Z", host: "links.maralind.com", apex: false, records: records("links.maralind.com", false) },
]
const posted = []
const server = createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    let body = {}
    const chunks = []
    req.on("data", (c) => chunks.push(c))
    req.on("end", () => {
      const sent = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null
      if (req.url.startsWith("/api/billing/subscription")) body = { currentPlan: { id: "pro" } }
      else if (req.url.startsWith("/api/domains/verify")) body = { verified: false, message: "The records are not showing yet.", records: { aRecord: false, cname: false, txt: false } }
      else if (req.url.startsWith("/api/domains") && req.method === "POST") { posted.push(sent); body = { error: "This domain is already connected to another account" }; res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify(body)); return }
      else if (req.url.startsWith("/api/domains")) body = { domains, schema: "current" }
      setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)) }, 60)
    })
    return
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
for (const [label, viewport] of [
  ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["1280", { width: 1280, height: 900, deviceScaleFactor: 1 }],
]) {
  console.log(`\n${label}`)
  const page = await browser.newPage()
  await page.setViewport(viewport)
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.goto(`${base}/app/settings?tab=domains`)
  await page.waitForSelector("[data-settings-panel=domains]")
  await wait(900)
  expect(errors.length === 0, "the page does not throw", errors[0])
  await page.screenshot({ path: join(shots, `domains-${label}.png`), fullPage: false })
  const scroller = await page.$(".app-content-scroll")
  const full = await page.evaluate(() => { const s = document.querySelector(".app-content-scroll"); return s.scrollHeight })
  await page.setViewport({ ...viewport, height: Math.min(full + 80, 4000) })
  await wait(200)
  await page.screenshot({ path: join(shots, `domains-${label}-full.png`), fullPage: false })
  await page.setViewport(viewport)
  void scroller

  const text = await page.evaluate(() => document.querySelector("[data-settings-panel=domains]")?.innerText ?? "")
  expect(/Website/.test(text) && /Creator page/.test(text), "a group for the website and one for the creator page")
  expect(/maralind\.com/.test(text) && /links\.maralind\.com/.test(text), "each domain in its group")
  expect(/216\.150\.1\.1/.test(text) && /cname\.vercel-dns\.com/.test(text), "a waiting domain shows its records")
  expect(/Check again/.test(text), "and can be checked again")
  expect((text.match(/\bPrimary\b/g) || []).length >= 1, "the primary domain is named", (text.match(/\bPrimary\b/g) || []).length)
  expect(!/—/.test(text), "no em dashes in the copy")
  const sideways = await page.evaluate(() => { const s = document.querySelector(".app-content-scroll"); return Math.max(s.scrollWidth - s.clientWidth, document.documentElement.scrollWidth - document.documentElement.clientWidth) })
  expect(sideways === 0, "nothing scrolls sideways", sideways)
  const purple = await page.evaluate(() => [...document.querySelectorAll("[data-settings-panel=domains] *")].filter((el) => { const c = getComputedStyle(el); return [c.backgroundColor, c.color, c.borderColor].some((v) => /rgb\((1[2-5]\d), ([4-9]\d), (2[2-5]\d)\)/.test(v)) }).length)
  expect(purple === 0, "no violet in the panel", purple)

  /* Connecting: the form reads the name before anything is sent, and says what the server said. */
  const hint = () => page.$eval("#domains-new-hint", (el) => el.textContent.trim())
  const sentBefore = posted.length
  await page.type("#domains-new", "storelib.com")
  await page.click("[data-domains-add] button")
  await wait(150)
  expect(/belongs to Storelib/.test(await hint()) && posted.length === sentBefore, "storelib.com is refused in the form, and nothing is sent", await hint())
  await page.$eval("#domains-new", (el) => { el.focus(); el.select() })
  await page.keyboard.press("Backspace")
  await page.type("#domains-new", "Maralind.store")
  await wait(100)
  expect(/www\.maralind\.store/.test(await hint()), "an apex is said to open at its www", await hint())
  await page.click("[data-domains-add] button")
  await wait(400)
  expect(/another account/.test(await hint()) && posted.at(-1)?.purpose === "website", "the server's refusal is shown under the field", { hint: await hint(), sent: posted.at(-1) })
  await page.evaluate(() => [...document.querySelectorAll("[role=radio]")].find((b) => b.textContent.includes("Creator page")).click())
  await page.$eval("#domains-new", (el) => { el.focus(); el.select() })
  await page.keyboard.press("Backspace")
  await page.type("#domains-new", "links.maralind.store")
  await wait(100)
  const typed = await page.$eval("#domains-new", (el) => el.value)
  expect(/links\.maralind\.store\/links/.test(await hint()) && !/www\.links/.test(await hint()), "a creator page subdomain opens as it is, with the OnePage at /links", { hint: await hint(), typed })

  /* Remove asks first, in the row, from the action list (a menu here, a sheet on a phone). */
  await page.click('[aria-label="Actions for www.maralind.shop"]')
  await wait(label === "390" ? 700 : 300)
  const items = await page.evaluate(() => [...document.querySelectorAll("[data-action-list] [role=menuitem], [data-sheet-panel] button, [data-sheet-panel] a")].map((el) => el.textContent.trim()).filter(Boolean))
  expect(items.includes("Make primary") && items.includes("Remove") && items.includes("Copy address"), "a waiting second domain offers Copy address, Make primary and Remove", items)
  await page.evaluate(() => [...document.querySelectorAll("[data-action-list] [role=menuitem], [data-sheet-panel] button")].find((el) => el.textContent.trim() === "Remove").click())
  await wait(label === "390" ? 800 : 300)
  const ask = await page.evaluate(() => document.querySelector("[role=alertdialog]")?.innerText ?? "")
  expect(/Remove www\.maralind\.shop\?/.test(ask) && /nothing that was shared stops working/.test(ask), "and the row asks before anything is removed", ask)
  await page.evaluate(() => document.querySelector("[role=alertdialog]").scrollIntoView({ block: "center" }))
  await wait(150)
  await page.screenshot({ path: join(shots, `domains-${label}-remove.png`) })
  const wideSideways = await page.evaluate(() => { const s = document.querySelector(".app-content-scroll"); return s.scrollWidth - s.clientWidth })
  expect(wideSideways === 0, "still nothing sideways with the question open", wideSideways)
  await page.close()
}
await browser.close()
server.close()
console.log(`\nshots in ${shots}`)
if (broken) fail(`${broken} check(s) failed`)
console.log("ok: Settings › Domains at 390 and 1280")
