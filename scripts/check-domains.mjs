/**
 * ===========================================================================
 *  SETTINGS › DOMAINS: THE OWNER'S DESIGN, WITH WHAT THE TAB DOES NOW
 * ===========================================================================
 * "Keep the UI and design I created and follow that, baking it into the
 * domains tab how it was."
 *
 * The real Settings page (scripts/render-settings-probe.tsx) opened on
 * Domains, three times over:
 *
 *   owner    the owner's own tab, from components/app/settings-form-new.tsx
 *            at 87e06ebc~1 (OWNER=<commit> to change it)
 *   before   the tab that replaced it (BEFORE=<commit>, default the commit
 *            this work started from), with its components/app/settings/
 *            domains-panel.tsx of the same commit
 *   after    this checkout
 *
 * at 390 and 1440, on Pro with four domains (two website domains connected,
 * one website domain and one creator page domain waiting on DNS) and on the
 * free plan with none. Screenshots are named domains-<version>-<width>-<plan>.
 *
 * Measured on `after`, against `owner` where the owner's design decides:
 *
 *   the cards        in the owner's order: the Pro bar (free), Connect your
 *                    own domain, Your Domains, DNS Setup Instructions, How
 *                    Custom Domains Work; the same titles
 *   the free plan    the violet bar, and the two cards blurred 1.5px at 80%,
 *                    taking no pointer, as the owner's were
 *   the marks        Hostinger, GoDaddy and Namecheap at 20px beside "Get a
 *                    domain:", the owner's order
 *   the table        the owner's four columns at 1440, each row's columns
 *                    under its header; a card per domain at 390
 *   what it is for   Connect asks website or creator page; each row says
 *                    which; Primary when a purpose has several; Make primary
 *   the records      a grey step per record, named for the provider picked
 *                    (Porkbun: Leave empty), Verified, Not found or Other
 *                    value after Verify, What to fix, Check again
 *   remove           asks in the row and says where visitors go
 *   phones           nothing scrolls sideways at 390
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
const OWNER = process.env.OWNER || "87e06ebc~1"
const BEFORE = process.env.BEFORE || "96949910"

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
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) }, from: () => q, rpc: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)
const git = (spec) => {
  try {
    return execFileSync("git", ["show", spec], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "ignore"] })
  } catch {
    return null
  }
}
const versions = { after: `import { mount } from "@/scripts/render-settings-probe"\nimport { SettingsFormNew } from "@/components/app/settings-form-new"\nmount(SettingsFormNew as never)\n` }
const ownerForm = git(`${OWNER}:components/app/settings-form-new.tsx`)
if (ownerForm) {
  writeFileSync(join(dir, "owner-form.tsx"), ownerForm)
  versions.owner = `import { mount } from "@/scripts/render-settings-probe"\nimport { SettingsFormNew } from "./owner-form"\nmount(SettingsFormNew as never)\n`
}
const beforeForm = git(`${BEFORE}:components/app/settings-form-new.tsx`)
const beforePanel = git(`${BEFORE}:components/app/settings/domains-panel.tsx`)
if (beforeForm && beforePanel) {
  writeFileSync(join(dir, "before-form.tsx"), beforeForm.replace('from "@/components/app/settings/domains-panel"', 'from "./before-domains-panel"'))
  writeFileSync(join(dir, "before-domains-panel.tsx"), beforePanel)
  versions.before = `import { mount } from "@/scripts/render-settings-probe"\nimport { SettingsFormNew } from "./before-form"\nmount(SettingsFormNew as never)\n`
}
const scripts = {}
for (const [name, entry] of Object.entries(versions)) {
  writeFileSync(join(dir, `entry-${name}.tsx`), entry)
  try {
    execFileSync("npx", ["--no-install", "esbuild", join(dir, `entry-${name}.tsx`),
      "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, `${name}.js`)}`,
      '--define:process.env.NODE_ENV="production"',
      `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
      `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
      `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
      { stdio: ["ignore", "ignore", "inherit"] })
    scripts[name] = readFileSync(join(dir, `${name}.js`), "utf8")
  } catch {
    console.log(`  (${name} did not bundle: it is left out)`)
  }
}
/*
  The stylesheet, with the older copies in it: Tailwind leaves gitignored
  folders out (.*-probe/ is one), and a class only the owner's file used
  would otherwise have no rule, and its table would not be drawn.
*/
const sheet = join(dir, "probe.css")
writeFileSync(sheet, `${readFileSync(join(root, "app/globals.css"), "utf8")}\n@source "../.domains-probe/owner-form.tsx";\n@source "../.domains-probe/before-form.tsx";\n@source "../.domains-probe/before-domains-panel.tsx";\n`)
const css = `${await appCss(root, sheet)}\n${interFaces(root).replace(/url\(file:\/\//g, "url(/__font?p=")}`
rmSync(dir, { recursive: true, force: true })
if (!scripts.after) fail("this checkout's Settings did not bundle")
const pageOf = (script) => `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};window.__fixture={tab:"domains"};window.__err=[];window.addEventListener("error",function(e){window.__err.push(String(e.message))})</script><script>${script}</script></body></html>`

const records = (host, apex) => apex
  ? [{ type: "A", name: "@", value: "216.150.1.1" }, { type: "CNAME", name: "www", value: "cname.vercel-dns.com" }]
  : [{ type: "CNAME", name: host.split(".")[0], value: "cname.vercel-dns.com" }]
const DOMAINS = [
  { id: "d1", domain: "maralind.com", purpose: "website", is_primary: true, status: "active", ssl_status: "active", created_at: "2026-08-01T10:00:00Z", host: "www.maralind.com", apex: true, records: records("maralind.com", true) },
  { id: "d2", domain: "maralind.co", purpose: "website", is_primary: false, status: "active", ssl_status: "active", created_at: "2026-08-20T10:00:00Z", host: "www.maralind.co", apex: true, records: records("maralind.co", true) },
  { id: "d3", domain: "maralind.shop", purpose: "website", is_primary: false, status: "pending", ssl_status: "pending", created_at: "2026-09-20T10:00:00Z", host: "www.maralind.shop", apex: true, records: records("maralind.shop", true), verification_token: "storelib-verify=abc123" },
  { id: "d4", domain: "links.maralind.com", purpose: "creator_page", is_primary: true, status: "pending", ssl_status: "pending", created_at: "2026-09-24T10:00:00Z", host: "links.maralind.com", apex: false, records: records("links.maralind.com", false), verification_token: "storelib-verify=def456" },
]
const verifyAnswer = (id) => {
  const d = DOMAINS.find((x) => x.id === id)
  if (d?.id === "d3") {
    return {
      verified: false, status: "pending", message: "The records are not showing yet. DNS changes can take from a few minutes to a day to reach everyone.",
      hints: [], records: d.records, found: { aRecord: false, cname: false, txt: false }, warnings: [], issues: [],
      checks: [{ type: "A", name: "@", state: "conflict", seen: ["34.120.5.9"] }, { type: "CNAME", name: "www", state: "missing", seen: [] }],
      fixes: ["Delete the A record 34.120.5.9 on @. Only 216.150.1.1 should be there.", "No CNAME record on www yet. Add it with the value cname.vercel-dns.com."],
    }
  }
  return { verified: false, status: "pending", message: "The records are not showing yet.", records: d?.records ?? [], found: { aRecord: false, cname: false, txt: false }, warnings: [], issues: [], checks: (d?.records ?? []).map((r) => ({ type: r.type, name: r.name, state: "missing", seen: [] })), fixes: ["Nothing has shown up yet. New records usually appear within an hour, sometimes up to 48 hours."] }
}

const server = createServer((req, res) => {
  const u = new URL(req.url, "http://x")
  if (u.pathname === "/__font") {
    const file = u.searchParams.get("p") || ""
    if (!/\/\.next\/static\/media\/[\w.-]+\.woff2$/.test(file) || !existsSync(file)) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { "content-type": "font/woff2" }); res.end(readFileSync(file)); return
  }
  const plan = (req.headers.referer ? new URL(req.headers.referer).searchParams.get("plan") : null) || "pro"
  if (u.pathname.startsWith("/api/")) {
    const chunks = []
    req.on("data", (c) => chunks.push(c))
    req.on("end", () => {
      const sent = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || "null") : null
      let body = {}
      if (u.pathname.startsWith("/api/billing/subscription")) body = { currentPlan: { id: plan } }
      else if (u.pathname.startsWith("/api/domains/verify")) body = verifyAnswer(sent?.domainId)
      else if (u.pathname.startsWith("/api/domains")) body = plan === "free" ? { domains: [], schema: "current", purposes: ["website", "creator_page"] } : { domains: DOMAINS, schema: "current", purposes: ["website", "creator_page"], primary: { website: "www.maralind.com", creator_page: "links.maralind.com" } }
      else if (u.pathname.startsWith("/api/stripe/connect/status")) body = { connected: true, status: "connected" }
      setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)) }, 40)
    })
    return
  }
  const which = u.searchParams.get("v") || "after"
  if (!scripts[which]) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { "content-type": "text/html" }); res.end(pageOf(scripts[which]))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"], headless: true })
const open = async (which, plan, width) => {
  const p = await browser.newPage()
  const phone = width < 640
  await p.setViewport(phone ? { width, height: 3400, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width, height: 3000, deviceScaleFactor: 1 })
  await p.goto(`${base}/?v=${which}&plan=${plan}`, { waitUntil: "load" })
  await p.waitForFunction("window.__ran === true", { timeout: 15000 })
  await p.evaluate(() => document.fonts.ready)
  await wait(900)
  return p
}
/** The Domains tab's cards, top to bottom: their title and box, and how each is drawn. */
const cardsOf = (p) => p.evaluate(() => {
  const panel = document.querySelector('[data-settings-panel="domains"]')
  if (!panel) return null
  const cards = [...panel.querySelectorAll(":scope > div > div, :scope > div > section")].filter((el) => el.getBoundingClientRect().height > 20)
  return cards.map((el) => {
    const cs = getComputedStyle(el)
    const b = el.getBoundingClientRect()
    return { title: (el.querySelector("h3")?.textContent || el.textContent || "").trim().slice(0, 48), h: Math.round(b.height), filter: cs.filter, opacity: cs.opacity, pointer: cs.pointerEvents, bg: cs.backgroundImage.startsWith("linear") ? "gradient" : cs.backgroundColor }
  })
})
const shoot = async (p, name) => {
  const box = await p.evaluate(() => { const el = document.querySelector('[data-settings-panel="domains"]'); const b = el.getBoundingClientRect(); return { x: Math.max(0, b.left - 12), y: Math.max(0, b.top - 12), w: b.width + 24, h: b.height + 24 } })
  await p.screenshot({ path: join(shots, `${name}.png`), clip: { x: box.x, y: box.y, width: Math.min(box.w, p.viewport().width - box.x), height: box.h } })
}

console.log("\nThe three versions, side by side")
const summary = {}
for (const width of [390, 1440]) {
  for (const plan of ["pro", "free"]) {
    for (const which of ["owner", "before", "after"]) {
      if (!scripts[which]) continue
      const p = await open(which, plan, width)
      const cards = await cardsOf(p)
      summary[`${which}-${width}-${plan}`] = cards?.map((c) => c.title.replace(/\s+/g, " ").slice(0, 28)).join(" | ")
      await shoot(p, `domains-${which}-${width}-${plan}`)
      const errors = await p.evaluate(() => window.__err)
      if (errors.length && which === "after") expect(false, `after ${width} ${plan}: the page threw`, errors)
      await p.close()
    }
  }
}
for (const [k, v] of Object.entries(summary)) console.log(`  ${k.padEnd(18)} ${v}`)

console.log("\nThe owner's design, kept (1440, Pro)")
{
  const owner = scripts.owner ? await open("owner", "pro", 1440) : null
  const p = await open("after", "pro", 1440)
  const titles = async (x) => x.evaluate(() => [...document.querySelectorAll('[data-settings-panel="domains"] h3')].map((h) => h.textContent.trim()))
  const t = await titles(p)
  const o = owner ? await titles(owner) : null
  console.log(`  owner: ${o?.join(" / ")}\n  after: ${t.join(" / ")}`)
  expect(!o || JSON.stringify(o) === JSON.stringify(t), "the same cards, with the same titles, in the same order", { owner: o, after: t })
  const look = (x) => x.evaluate(() => {
    const input = document.querySelector('[data-settings-panel="domains"] input[placeholder^="Enter your domain"]')
    const button = [...document.querySelectorAll('[data-settings-panel="domains"] button')].find((b) => b.textContent.trim() === "Connect")
    const marks = [...document.querySelectorAll('[data-settings-panel="domains"] a[title]')].filter((a) => ["Hostinger", "GoDaddy", "Namecheap"].includes(a.title))
    const header = [...document.querySelectorAll('[data-settings-panel="domains"] p')].filter((el) => ["Domain Name", "Status", "Date Added", "Actions"].includes(el.textContent.trim())).map((el) => el.textContent.trim())
    const svg = marks[0]?.querySelector("svg")?.getBoundingClientRect()
    return {
      input: input ? { h: Math.round(input.getBoundingClientRect().height), radius: getComputedStyle(input).borderRadius } : null,
      connect: button ? { bg: getComputedStyle(button).backgroundColor, h: Math.round(button.getBoundingClientRect().height) } : null,
      marks: marks.map((a) => a.title), mark: svg ? [Math.round(svg.width), Math.round(svg.height)] : null,
      header,
    }
  })
  const a = await look(p)
  const b = owner ? await look(owner) : null
  console.log(`  owner: ${JSON.stringify(b)}\n  after: ${JSON.stringify(a)}`)
  expect(a.input?.h === 44 && (!b || (a.input.h === b.input?.h && a.input.radius === b.input?.radius)), "the field: 44px, the owner's corners", a.input)
  expect(a.connect?.bg === "rgb(124, 58, 237)" && a.connect?.h === 44, "Connect: the owner's violet, 44px", a.connect)
  expect(a.marks.join() === "Hostinger,GoDaddy,Namecheap" && a.mark?.join() === "20,20", "Get a domain: Hostinger, GoDaddy, Namecheap, at 20px", a)
  expect(a.header.join() === "Domain Name,Status,Date Added,Actions" && (!b || b.header.join() === a.header.join()), "Your Domains: the owner's four columns", a.header)
  /* Each row's columns under the header's. */
  const cols = await p.evaluate(() => {
    const grids = [...document.querySelectorAll('[data-domains-list] .lg\\:grid')].filter((g) => g.getClientRects().length)
    return grids.map((g) => [...g.children].map((c) => Math.round(c.getBoundingClientRect().left)))
  })
  expect(cols.length === 5 && cols.every((c) => JSON.stringify(c) === JSON.stringify(cols[0])), "every row's columns start where the header's do", cols)
  const rows = await p.evaluate(() => [...document.querySelectorAll("[data-domain-row]")].map((r) => {
    const desk = r.querySelector(".lg\\:grid")
    return {
      domain: r.getAttribute("data-domain-row"), purpose: r.getAttribute("data-domain-purpose"),
      line: desk?.querySelector("p.mt-0\\.5")?.textContent.trim(), primary: /Primary/.test(desk?.textContent || ""),
      buttons: [...(desk?.querySelectorAll("button") || [])].map((x) => x.textContent.trim()).filter(Boolean),
    }
  }))
  for (const r of rows) console.log(`  ${r.domain.padEnd(20)} ${r.line}  [${r.buttons.join(", ")}]${r.primary ? "  Primary" : ""}`)
  expect(rows.map((r) => r.purpose).join() === "website,website,website,creator_page", "website domains first, then the creator page's", rows.map((r) => r.purpose))
  expect(rows[0].primary && !rows[1].primary && rows[1].buttons.includes("Make primary") && !rows[0].buttons.includes("Make primary"), "Primary on the website's primary, Make primary on the other connected one", rows.slice(0, 2))
  expect(/Sends visitors to maralind\.com/.test(rows[1].line) && /Fallback: maralind\.storelib\.com/.test(rows[2].line) && /Creator page · Fallback: storelib\.com\/maralind/.test(rows[3].line), "each row says what it is for, and where it sends people", rows.map((r) => r.line))
  expect(rows[2].buttons.join() === "Verify,Remove" && rows[3].buttons.join() === "Verify,Remove", "a waiting domain: Verify and Remove, as the owner had them", rows.slice(2).map((r) => r.buttons))
  /* Verify, per record */
  const verify = await p.evaluateHandle(() => [...document.querySelectorAll('[data-domain-row="maralind.shop"] .lg\\:grid button')].find((b) => b.textContent.trim() === "Verify"))
  await verify.asElement().click()
  await wait(500)
  const after = await p.evaluate(() => {
    const steps = [...document.querySelectorAll('[data-dns-domain="maralind.shop"] [data-dns-record]')].map((s) => ({ type: s.getAttribute("data-dns-record"), state: s.querySelector("[data-dns-state]")?.textContent.trim() ?? null, found: [...s.querySelectorAll("span")].find((x) => x.textContent === "Found:")?.nextElementSibling?.textContent ?? null }))
    const fixes = [...document.querySelectorAll('[data-dns-domain="maralind.shop"] [data-dns-fixes] li')].map((li) => li.textContent.trim())
    const button = [...document.querySelectorAll('[data-domain-row="maralind.shop"] .lg\\:grid button:not([data-info-tip])')].map((b) => b.textContent.trim())
    const result = document.querySelector('[data-domain-row="maralind.shop"] [data-domain-result]')?.textContent.trim() ?? null
    return { steps, fixes, button, result }
  })
  console.log(`  after Verify: ${JSON.stringify(after.steps)}`)
  expect(after.steps.length === 2 && after.steps[0].state === "Other value" && after.steps[0].found === "34.120.5.9" && after.steps[1].state === "Not found", "each record says what the check saw: Other value (34.120.5.9), Not found", after.steps)
  expect(after.fixes.length === 2 && /Delete the A record 34\.120\.5\.9/.test(after.fixes[0]), "What to fix, from the check", after.fixes)
  expect(after.button[0] === "Check again" && /not showing yet/.test(after.result ?? ""), "the button is Check again, and the answer is under the row", after)
  await shoot(p, "domains-after-1440-pro-checked")
  /* The provider picked renames the records */
  await p.select("[data-dns-registrar]", "porkbun")
  await wait(150)
  const names = await p.evaluate(() => [...document.querySelectorAll('[data-dns-domain="maralind.shop"] [data-dns-name]')].map((n) => n.textContent.trim()))
  const tip = await p.evaluate(() => document.querySelector("[data-dns-tip]")?.textContent.trim())
  expect(names[0] === "Leave empty" && names[1] === "www" && /Porkbun/.test(tip ?? ""), "Porkbun: the domain's own record is Leave empty, and Porkbun's tip", { names, tip })
  await p.select("[data-dns-registrar]", "godaddy")
  /* Remove asks in the row */
  const remove = await p.evaluateHandle(() => [...document.querySelectorAll('[data-domain-row="maralind.co"] .lg\\:grid button')].find((b) => b.textContent.trim() === "Remove"))
  await remove.asElement().click()
  await wait(150)
  const ask = await p.evaluate(() => document.querySelector('[data-domain-confirm="maralind.co"]')?.textContent.replace(/\s+/g, " ").trim())
  expect(/Remove maralind\.co\?/.test(ask ?? "") && /sends visitors to maralind\.com/.test(ask ?? ""), "Remove asks in the row, and says where visitors go", ask)
  await shoot(p, "domains-after-1440-pro-remove")
  await p.close()
  await owner?.close()
}

console.log("\nThe free plan (1440 and 390)")
for (const width of [1440, 390]) {
  const p = await open("after", "free", width)
  const free = await p.evaluate(() => {
    const bar = document.querySelector("[data-domains-upgrade]")
    const blur = ["[data-domains-connect]", "[data-domains-list]"].map((s) => { const cs = getComputedStyle(document.querySelector(s)); return { filter: cs.filter, opacity: cs.opacity, pointer: cs.pointerEvents } })
    const marks = [...document.querySelectorAll("[data-domains-shops] a")].length
    return { bar: bar ? { gradient: getComputedStyle(bar).backgroundImage.startsWith("linear-gradient"), text: bar.textContent.replace(/\s+/g, " ").trim() } : null, blur, marks, scrollW: document.documentElement.scrollWidth }
  })
  expect(!!free.bar && free.bar.gradient && /Upgrade/.test(free.bar.text), `${width}: the owner's violet Pro bar with Upgrade`, free.bar)
  expect(free.blur.every((b) => b.filter === "blur(1.5px)" && b.opacity === "0.8" && b.pointer === "none"), `${width}: Connect and Your Domains blurred 1.5px at 80%, taking no pointer`, free.blur)
  expect(free.marks === 3, `${width}: with the three marks in the blurred card`, free.marks)
  expect(free.scrollW <= width, `${width}: nothing scrolls sideways`, free.scrollW)
  await p.close()
}

console.log("\nA phone (390, Pro)")
{
  const p = await open("after", "pro", 390)
  const phone = await p.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    cards: [...document.querySelectorAll("[data-domain-row] > .lg\\:hidden")].filter((c) => c.getClientRects().length).length,
    table: [...document.querySelectorAll("[data-domains-list] .lg\\:grid")].filter((g) => g.getClientRects().length).length,
    buttons: [...document.querySelectorAll("[data-domain-row] > .lg\\:hidden button:not([data-info-tip])")].filter((b) => b.getClientRects().length).map((b) => Math.round(b.getBoundingClientRect().height)),
    purpose: [...document.querySelectorAll('[data-domains-purpose] [role="radio"]')].map((b) => b.textContent.trim()),
  }))
  expect(phone.scrollW <= 390, "nothing scrolls sideways", phone.scrollW)
  expect(phone.cards === 4 && phone.table === 0, "a card per domain, the owner's phone layout", phone)
  expect(phone.buttons.every((h) => h >= 36), "the card's buttons are the owner's 36px", phone.buttons)
  expect(phone.purpose.join() === "Website,Creator page", "Connect asks what the domain is for", phone.purpose)
  await p.close()
}

await browser.close()
server.close()
console.log(`\nScreenshots: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
