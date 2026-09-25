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
 * And the DNS set up (components/domains/dns-setup.tsx), on the waiting
 * apex, before and after a check that fails:
 *
 *   the picker         a provider rewrites the Name column (Porkbun: empty)
 *                      and the link goes to its DNS page for the domain
 *   copy buttons       44 by 44 on a phone, 32 on a computer
 *   status per record  Not checked, then Other value / Not found yet
 *   fixes              none before the check, the route's after it
 *   get a domain       three registrars, each 44px tall on a phone
 *   how it works       four lines, and how many lines of text they take
 *
 * Screenshots are named domains2-*.
 *
 *   node scripts/check-domains.mjs            (SHOTS_DIR=... keeps the pictures)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

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
  `<style>${await appCss(root)}\n${interFaces(root).replace(/url\(file:\/\//g, "url(/__font?p=")}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
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
/* What the route answers for a check that did not pass: its old fields, and per record checks and fixes. */
const verifyAnswer = (id) => {
  const d = domains.find((x) => x.id === id)
  if (d?.id === "d2") {
    return {
      verified: false,
      status: "pending",
      message: "The records are not showing yet. DNS changes can take from a few minutes to a day to reach everyone.",
      hints: [],
      records: d.records,
      found: { aRecord: false, cname: false, txt: false },
      warnings: [],
      issues: [],
      checks: [
        { type: "A", name: "@", state: "conflict", seen: ["34.120.5.9"] },
        { type: "CNAME", name: "www", state: "missing", seen: [] },
      ],
      fixes: ["Delete the A record 34.120.5.9 on @. Only 216.150.1.1 should be there.", "No CNAME record on www yet. Add it with the value cname.vercel-dns.com."],
    }
  }
  return { verified: false, status: "pending", message: "The records are not showing yet.", records: d?.records ?? [], found: { aRecord: false, cname: false, txt: false }, warnings: [], issues: [], checks: (d?.records ?? []).map((r) => ({ type: r.type, name: r.name, state: "missing", seen: [] })), fixes: ["Nothing has shown up yet. New records usually appear within an hour, sometimes up to 48 hours."] }
}
const posted = []
const server = createServer((req, res) => {
  /* Inter from the build, served from here: a page on http may not read file:// fonts. */
  if (req.url.startsWith("/__font?p=")) {
    const file = decodeURIComponent(req.url.slice("/__font?p=".length))
    if (!/\/\.next\/static\/media\/[\w.-]+\.woff2$/.test(file) || !existsSync(file)) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { "content-type": "font/woff2" })
    res.end(readFileSync(file))
    return
  }
  if (req.url.startsWith("/api/")) {
    let body = {}
    const chunks = []
    req.on("data", (c) => chunks.push(c))
    req.on("end", () => {
      const sent = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null
      if (req.url.startsWith("/api/billing/subscription")) body = { currentPlan: { id: "pro" } }
      else if (req.url.startsWith("/api/domains/verify")) body = verifyAnswer(sent?.domainId)
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
  const inter = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].some((f) => f.family.replace(/"/g, "") === "Inter" && f.status === "loaded") })
  console.log(`        text measured in ${inter ? "Inter, the face that ships" : "the container's fallback face, which is wider than Inter"}`)
  await page.screenshot({ path: join(shots, `domains2-${label}.png`), fullPage: false })
  const scroller = await page.$(".app-content-scroll")
  const full = await page.evaluate(() => { const s = document.querySelector(".app-content-scroll"); return s.scrollHeight })
  await page.setViewport({ ...viewport, height: Math.min(full + 80, 4000) })
  await wait(200)
  await page.screenshot({ path: join(shots, `domains2-${label}-full.png`), fullPage: false })
  await page.setViewport(viewport)
  void scroller

  const text = await page.evaluate(() => document.querySelector("[data-settings-panel=domains]")?.innerText ?? "")
  expect(/Website/.test(text) && /Creator page/.test(text), "a group for the website and one for the creator page")
  expect(/maralind\.com/.test(text) && /links\.maralind\.com/.test(text), "each domain in its group")
  expect(/216\.150\.1\.1/.test(text) && /cname\.vercel-dns\.com/.test(text), "a waiting domain shows its records")
  expect(/Check DNS/.test(text) && !/Check again/.test(text), "and can be checked (Check again once it has been)")
  expect((text.match(/\bPrimary\b/g) || []).length >= 1, "the primary domain is named", (text.match(/\bPrimary\b/g) || []).length)
  expect(!/—/.test(text), "no em dashes in the copy")
  const sideways = await page.evaluate(() => { const s = document.querySelector(".app-content-scroll"); return Math.max(s.scrollWidth - s.clientWidth, document.documentElement.scrollWidth - document.documentElement.clientWidth) })
  expect(sideways === 0, "nothing scrolls sideways", sideways)
  const purple = await page.evaluate(() => [...document.querySelectorAll("[data-settings-panel=domains] *")].filter((el) => { const c = getComputedStyle(el); return [c.backgroundColor, c.color, c.borderColor].some((v) => /rgb\((1[2-5]\d), ([4-9]\d), (2[2-5]\d)\)/.test(v)) }).length)
  expect(purple === 0, "no violet in the panel", purple)

  /* ── The DNS set up, on the waiting apex ─────────────────────────── */
  const phone = label === "390"
  const setupSel = '[data-domain-setup="maralind.shop"]'
  const before = await page.evaluate((sel) => {
    const box = document.querySelector(sel)
    return {
      setups: document.querySelectorAll("[data-dns-setup]").length,
      steps: box.querySelectorAll("[data-dns-setup] ol > li").length,
      picker: Boolean(box.querySelector("[data-dns-registrar]")),
      header: [...box.querySelectorAll("[role=columnheader]")].filter((h) => h.getBoundingClientRect().width > 0).map((h) => h.textContent),
      status: [...box.querySelectorAll("[data-dns-record]")].map((r) => r.innerText.includes("Not checked")),
      fixes: document.querySelectorAll("[data-dns-fixes]").length,
      copies: [...document.querySelectorAll("[data-dns-copy]")].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)] }),
      connectedSetup: Boolean(document.querySelector('[data-domain-setup="maralind.com"]')),
      connected: document.querySelector('[data-domain-row="maralind.com"]')?.innerText ?? "",
    }
  }, setupSel)
  expect(before.setups === 2 && before.steps === 3 && before.picker, "each waiting domain has the three steps and a provider picker", { setups: before.setups, steps: before.steps })
  expect(phone ? before.header.length === 0 : before.header.join() === "Type,Name,Value,TTL,Status", phone ? "on a phone each record is a stack, no header row" : "Type, Name, Value, TTL and Status", before.header)
  expect(before.status.every(Boolean) && before.fixes === 0, "before a check: every record Not checked, and no fixes", { status: before.status, fixes: before.fixes })
  const want = phone ? 44 : 32
  expect(before.copies.length === 3 && before.copies.every(([w, h]) => w === want && h === want), `copy buttons ${want} by ${want}`, before.copies)
  expect(!before.connectedSetup && /Connected/.test(before.connected), "the connected domain shows no set up, and says Connected", before.connected.replace(/\n/g, " | "))

  await page.select(`${setupSel} [data-dns-registrar]`, "porkbun")
  await wait(120)
  const pork = await page.evaluate((sel) => ({
    name: document.querySelector(`${sel} [data-dns-record="A"] [data-dns-name]`)?.textContent,
    www: document.querySelector(`${sel} [data-dns-record="CNAME"] [data-dns-name]`)?.textContent,
    ttl: document.querySelector(`${sel} [data-dns-record="A"]`)?.innerText.includes("600"),
    link: document.querySelector(`${sel} [data-dns-open]`)?.getAttribute("href"),
  }), setupSel)
  expect(pork.name === "Leave empty" && pork.www === "www" && pork.ttl && /porkbun\.com/.test(pork.link ?? ""), "Porkbun: @ is left empty, www stays, its TTL and its DNS page", pork)
  await page.select(`${setupSel} [data-dns-registrar]`, "namecheap")
  await wait(120)
  const cheap = await page.evaluate((sel) => ({
    name: document.querySelector(`${sel} [data-dns-record="A"] [data-dns-name]`)?.textContent,
    link: document.querySelector(`${sel} [data-dns-open]`)?.getAttribute("href"),
    note: document.querySelector(`${sel} [data-dns-note]`)?.textContent,
  }), setupSel)
  expect(cheap.name === "@" && /\/maralind\.shop\/advancedns$/.test(cheap.link ?? "") && /Advanced DNS/.test(cheap.note ?? ""), "Namecheap: @, a link to this domain's Advanced DNS, and its one note", cheap)
  await page.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: "start" }), setupSel)
  await wait(150)
  await page.screenshot({ path: join(shots, `domains2-${label}-setup.png`) })

  await page.click(`${setupSel} [data-dns-check]`)
  await wait(500)
  const after = await page.evaluate((sel) => {
    const box = document.querySelector(sel)
    return {
      a: box.querySelector('[data-dns-record="A"]')?.innerText ?? "",
      cname: box.querySelector('[data-dns-record="CNAME"]')?.innerText ?? "",
      fixes: [...box.querySelectorAll("[data-dns-fixes] li")].map((li) => li.textContent),
      otherFixes: document.querySelectorAll("[data-dns-fixes]").length,
      button: box.querySelector("[data-dns-check]")?.textContent.trim(),
      sideways: (() => { const s = document.querySelector(".app-content-scroll"); return Math.max(s.scrollWidth - s.clientWidth, document.documentElement.scrollWidth - document.documentElement.clientWidth) })(),
    }
  }, setupSel)
  expect(/Other value/.test(after.a) && /34\.120\.5\.9/.test(after.a) && /Not found yet/.test(after.cname), "after a failed check each record says what was found", { a: after.a.replace(/\n/g, " | "), cname: after.cname.replace(/\n/g, " | ") })
  expect(after.fixes.length === 2 && /Delete the A record 34\.120\.5\.9/.test(after.fixes[0]) && after.otherFixes === 1, "and the fixes appear, only under the domain that was checked", after.fixes)
  expect(after.button === "Check again", "the button now says Check again", after.button)
  expect(after.sideways === 0, "nothing sideways with the fixes open", after.sideways)
  await page.evaluate((sel) => document.querySelector(`${sel} [data-dns-check]`).scrollIntoView({ block: "center" }), setupSel)
  await wait(150)
  await page.screenshot({ path: join(shots, `domains2-${label}-failed.png`) })

  /* Get a domain, and the four lines on how domains work. */
  const extra = await page.evaluate(() => {
    const shops = [...document.querySelectorAll("[data-domains-shops] a")].map((a) => ({ name: a.textContent.trim(), h: Math.round(a.getBoundingClientRect().height), top: Math.round(a.getBoundingClientRect().top), href: a.getAttribute("href") }))
    const lines = [...document.querySelectorAll("[data-how-line]")].map((row) => {
      const dd = row.querySelector("dd")
      const lh = parseFloat(getComputedStyle(dd).lineHeight)
      return { term: row.querySelector("dt").textContent, lines: Math.round(dd.getBoundingClientRect().height / lh) }
    })
    const how = document.querySelector("[data-how-it-works]")?.innerText ?? ""
    return { shops, lines, how }
  })
  expect(extra.shops.map((s) => s.name).join() === "GoDaddy,Namecheap,Hostinger" && extra.shops.every((s) => s.h >= (phone ? 44 : 32) && s.top === extra.shops[0].top), "Get a domain: GoDaddy, Namecheap and Hostinger on one row, each a thumb's height on a phone", extra.shops.map((s) => `${s.name} ${s.h}px`))
  expect(extra.lines.length === 4, "how custom domains work: four lines", extra.lines.map((l) => `${l.term}: ${l.lines}`))
  if (!phone) expect(extra.lines.every((l) => l.lines === 1), "and at 1280 each is one line of text", extra.lines.map((l) => l.lines))
  else expect(extra.lines.every((l) => l.lines <= 2), `at 390 each takes at most two lines under its label (${extra.lines.reduce((n, l) => n + l.lines, 0)} in all)`, extra.lines.map((l) => l.lines))
  expect(!/Your Store|Product Pages|\/p\//.test(extra.how) && /www\.maralind\.com/.test(extra.how), "true for today: no Your Store or /p/, and the creator's own apex in the www line", extra.how.replace(/\n/g, " | "))
  await page.evaluate(() => document.querySelector("[data-how-it-works]").scrollIntoView({ block: "center" }))
  await wait(150)
  await page.screenshot({ path: join(shots, `domains2-${label}-how.png`) })
  await page.evaluate(() => document.querySelector(".app-content-scroll").scrollTo(0, 0))
  await wait(100)

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
  await page.screenshot({ path: join(shots, `domains2-${label}-remove.png`) })
  const wideSideways = await page.evaluate(() => { const s = document.querySelector(".app-content-scroll"); return s.scrollWidth - s.clientWidth })
  expect(wideSideways === 0, "still nothing sideways with the question open", wideSideways)
  await page.close()
}
await browser.close()
server.close()
console.log(`\nshots in ${shots}`)
if (broken) fail(`${broken} check(s) failed`)
console.log("ok: Settings › Domains at 390 and 1280")
