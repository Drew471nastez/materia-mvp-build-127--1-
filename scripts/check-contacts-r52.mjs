/**
 * ===========================================================================
 *  CONTACTS, ROUND 52, LOOKED AT AND MEASURED
 * ===========================================================================
 * The real People list, a rich and a thin person, and the Forms page's bar
 * (scripts/render-contacts-r52.tsx), in Chromium at a phone (390x844) and a
 * computer (1280x800), light and dark (html[data-sl-dark], app/theme-dark.css),
 * with Products and Orders drawn the same way beside them. Screenshots go to
 * SHOTS_DIR (default a temp folder), c52-*.png. It measures what the round
 * promised: no page wider than the phone, the default list calm (one dark
 * action, Import and Export behind ⋯, no coloured pills in a row), the tap
 * targets on a phone, and a profile with no card inside a card.
 *
 *   node scripts/check-contacts-r52.mjs
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
if (!existsSync(CHROMIUM)) throw new Error(`No browser at ${CHROMIUM}`)
const css = (await appCss(root)) + "\n" + readFileSync(join(root, "app/theme-dark.css"), "utf8") + "\n" + interFaces(root)
const out = mkdtempSync(join(tmpdir(), "storelib-c52-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
const stubs = join(root, ".contacts-r52-probe")
mkdirSync(stubs, { recursive: true })
process.on("exit", () => rmSync(stubs, { recursive: true, force: true }))
writeFileSync(join(stubs, "navigation.js"), `import React from "react"
export function useSearchParams() { return React.useMemo(() => new URLSearchParams(location.search), []) }
export const usePathname = () => "/app/contacts"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, scroll, replace, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
execFileSync("npx", ["esbuild", join(root, "scripts/render-contacts-r52.tsx"), "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`, `--alias:@=${root}`, `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--jsx=automatic", '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"', "--log-level=error"], { cwd: root, stdio: "inherit" })
const bundle = readFileSync(join(out, "probe.js"))

/* ── the people ─────────────────────────────────────────────────────── */
const NOW = Date.now()
const D = 86_400_000
const iso = (d) => new Date(NOW - d * D).toISOString()
const names = ["Ana Popescu", "Jordan Blake", null, "Maximiliana Alexandrescu-Vasilescu de la Montagne", "Sam Rivera", "Amelia Hart", null, "Lukas Schneider", "Chen Wei", "Priya Raman", "Tomás García", "Olivia Brown"]
const emails = ["ana@example.com", "jordan.blake@example.com", "no.name.just.a.very.long.address.for.testing@subdomain.example-company.co.uk", "maximiliana.alexandrescu@example.ro", "sam@rivera.studio", "amelia@example.com", "buyer4821@gmail.com", "lukas@example.de", "chen@example.cn", "priya@example.in", "tomas@example.es", "olivia@example.com"]
const origins = ["checkout", "form", "community", "onepage", "import", "manual", "website", "product", "profile", "api", "unknown", "checkout"]
const tagsets = [["VIP", "Wholesale"], [], ["Newsletter 2025", "Early access", "Bucharest workshop", "Instagram"], ["Lead"], [], ["Course: Lightroom basics"], [], ["Germany"], [], ["Podcast guest", "Affiliate"], [], []]
const person = (i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  userId: i % 3 ? null : `u${i}`,
  email: emails[i % emails.length],
  name: names[i % names.length],
  firstSeen: iso(40 + i * 3),
  lastSeen: iso(i * 2),
  lead: i % 4 === 1,
  customer: i % 2 === 0,
  subscriber: i % 3 !== 2,
  member: i % 5 === 2,
  student: i % 6 === 0,
  subscription: i % 3 === 2 ? "none" : i === 7 ? "unsubscribed" : "subscribed",
  origin: origins[i % origins.length],
  orders: i % 2 === 0 ? 2 : 0,
  forms: i % 4 === 1 ? 1 : 0,
  tags: tagsets[i % tagsets.length],
  communities: [],
  tiers: [],
  access: [],
  leadStatuses: [],
  hasContact: i % 2 === 1,
})
const ROWS = Array.from({ length: 50 }, (_, i) => person(i))
const counts = { all: 1234, leads: 212, customers: 486, subscribers: 903, members: 77 }
const query = (over = {}) => ({ filter: "all", q: "", sort: "recent", page: 1, adv: {}, ...over })
const communities = [{ id: "c1", name: "Darkroom Club", tiers: [{ id: "t1", name: "Pro" }, { id: "t2", name: "Free" }] }]
const people = (over = {}) => ({ query: query(), page: { rows: ROWS, total: 1234, counts, partial: false, via: "sql" }, communities, ...over })

const rich = {
  person: { ...person(0), name: "Ana Popescu", email: "ana@example.com", customer: true, subscriber: true, member: true, student: true, lead: true, tags: ["VIP", "Wholesale", "Bucharest workshop"], hasContact: true },
  account: { email: "ana@example.com", verified: true },
  emails: ["ana@example.com", "ana.popescu@work.example.com"],
  consent: { state: "subscribed", subscriberId: "s1", consentText: "Signed up on the Newsletter form and ticked “Send me news”", consentAt: iso(200), unsubscribedAt: null, suppressed: false },
  contact: { id: "k1", notes: "Met at the Bucharest workshop. Wants the wholesale price list for 20+ prints.", tags: ["VIP", "Wholesale"], name: "Ana Popescu" },
  purchases: [
    { id: "o1", at: iso(3), product: "Lightroom preset pack", amountCents: 4900, refundCents: 0, currency: "EUR", status: "completed" },
    { id: "o2", at: iso(40), product: "Linen shirt, a very long product title that should truncate rather than wrap on a phone", amountCents: 18900, refundCents: 0, currency: "EUR", status: "completed" },
    { id: "o3", at: iso(90), product: "Stoneware mug", amountCents: 7900, refundCents: 7900, currency: "EUR", status: "refunded" },
  ],
  spent: [{ currency: "EUR", cents: 23800 }],
  memberships: [{ id: "m1", title: "Darkroom Club Pro", status: "active", amountCents: 900, currency: "EUR", interval: "month", at: iso(60) }],
  communities: [{ memberId: "cm1", communityId: "c1", name: "Darkroom Club", tier: "Pro", status: "active", source: "checkout", joinedAt: iso(60), lastActiveAt: iso(1), expiresAt: null, joinAnswers: [{ label: "What do you shoot?", value: "Street and portraits, mostly on film." }, { label: "Instagram", value: "@ana.shoots" }], cancellation: null }],
  communityEvents: [{ eventId: "e1", communityId: "c1", title: "Monthly critique call", startsAt: iso(-5), status: "going", attended: false }],
  courses: [{ id: "cr1", title: "Lightroom basics", percent: 64, startedAt: iso(30), completedAt: null }],
  forms: [{ id: "fs1", formId: "f1", title: "Workshop waitlist", at: iso(120), status: "contacted", answers: [{ label: "Name", value: "Ana Popescu" }, { label: "Which city?", value: "Bucharest" }, { label: "Anything else?", value: "Can I bring a friend?" }] }],
  leads: [{ id: "l1", at: iso(150) }],
  messages: [{ id: "msg1", at: iso(10), subject: "Wholesale question", message: "Hi! Do you offer a discount for 20 prints or more? We are opening a small gallery in March." }],
  sends: [
    { id: "cs1", kind: "campaign", subject: "November drop: new presets", at: iso(4), opened: true, clicked: true, status: "sent" },
    { id: "as1", kind: "automation", subject: "Welcome to the newsletter", at: iso(200), opened: true, clicked: false, status: "sent" },
  ],
  events: [],
  activity: [
    { at: iso(1), kind: "community", text: "Darkroom Club" },
    { at: iso(3), kind: "order", text: "Lightroom preset pack", href: "/app/orders?order=o1" },
    { at: iso(4), kind: "campaign", text: "November drop: new presets" },
    { at: iso(10), kind: "message", text: "Wholesale question" },
    { at: iso(30), kind: "course", text: "Lightroom basics" },
    { at: iso(40), kind: "order", text: "Linen shirt" },
    { at: iso(120), kind: "form", text: "Workshop waitlist" },
    { at: iso(200), kind: "subscribed", text: "" },
  ],
}
const thin = {
  person: { ...person(5), id: "00000000-0000-4000-8000-000000000999", name: "Sam Rivera", email: null, customer: false, subscriber: false, member: false, student: false, lead: true, tags: [], hasContact: false, origin: "form", subscription: "none" },
  account: null,
  emails: [],
  consent: { state: "none", subscriberId: null, consentText: null, consentAt: null, unsubscribedAt: null, suppressed: false },
  contact: null,
  purchases: [], spent: [], memberships: [], communities: [], communityEvents: [], courses: [],
  forms: [{ id: "fs9", formId: "f2", title: "Contact us", at: iso(2), status: "new", answers: [{ label: "Phone", value: "+40 712 345 678" }] }],
  leads: [], messages: [], sends: [], events: [],
  activity: [{ at: iso(2), kind: "form", text: "Contact us" }],
}

/* Neighbours */
const cover = (hue) => "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="hsl(${hue},45%,72%)"/></svg>`)
const products = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, creator_id: "c1", title: `Product ${i + 1}`, type: "digital", price_cents: 1200 + i * 350, status: i % 5 === 2 ? "draft" : "published", thumbnail_url: i % 4 === 0 ? null : cover(i * 37), slug: `product-${i}`, created_at: iso(i), archived: false, sales_count: i * 3 }))
const orow = (id, h, over) => ({ id, product_id: "p-digital", amount_cents: 4900, fee_cents: 150, status: "completed", created_at: new Date(NOW - h * 3600000).toISOString(), buyer_email: "ana.pop@example.com", buyer_first_name: "Ana", buyer_last_name: "Pop", buyer_country: "Romania", buyer_country_code: "RO", card_brand: "visa", card_last4: "4242", payment_method: "card", receipt_token: `tok-${id}`, stripe_payment_intent_id: `pi_${id}`, stripe_session_id: null, buyer_notified_at: null, source: "website", currency: "EUR", seller_seen_at: new Date(NOW).toISOString(), product: { id: "p-digital", title: "Lightroom preset pack", type: "digital", thumbnail_url: null }, ...over })
const OIDS = Array.from({ length: 12 }, (_, i) => `d-${i}`)
const listing = { rows: OIDS.map((id, i) => orow(id, i * 7 + 1, { buyer_first_name: ["Ana", "Jordan", "Sam", "Amelia"][i % 4] })), numbers: Object.fromEntries(OIDS.map((id, i) => [id, 1100 - i])), pageIds: OIDS, before: null, after: null, matching: OIDS.length, range: { page: 1, pages: 1, from: 1, to: OIDS.length }, metrics: [], summary: { total: OIDS.length, earliest: iso(10), ships: false, views: ["all"], currency: "EUR" }, figures: true, partial: false }

const VIEWS = {
  people: ["people", people()],
  "people-empty": ["people", people({ page: { rows: [], total: 0, counts: { all: 0, leads: 0, customers: 0, subscribers: 0, members: 0 }, partial: false, via: "sql" } })],
  "people-nomatch": ["people", people({ query: query({ q: "zzz" }), page: { rows: [], total: 0, counts, partial: false, via: "sql" } })],
  "people-error": ["people", people({ page: null })],
  "people-notice": ["people", people({ notice: "not_found", page: { rows: ROWS.slice(0, 6), total: 6, counts, partial: true, via: "app" } })],
  "people-filtered": ["people", people({ query: query({ q: "ana", adv: { tag: "VIP", community: "c1" } }) })],
  profile: ["profile", { profile: rich }],
  "profile-thin": ["profile", { profile: thin }],
  forms: ["forms", {}],
  products: ["products", { products }],
  orders: ["orders", { listing, now: NOW }],
}

const page = (mode, props, dark) => `<!doctype html><html class="light app-layout"${dark ? " data-sl-dark" : ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};window.__mode=${JSON.stringify(mode)};window.__props=${JSON.stringify(props).replace(/</g, "\\u003c")}</script><script src="/probe.js"></script></body></html>`
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  if (url.pathname === "/probe.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  if (url.pathname === "/api/app/orders/list") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(listing)) }
  if (url.pathname.startsWith("/api/")) { res.writeHead(200, { "content-type": "application/json" }); return res.end("{}") }
  const view = url.searchParams.get("v") || "people"
  const [mode, props] = VIEWS[view] ?? VIEWS.people
  res.writeHead(200, { "content-type": "text/html" })
  res.end(page(mode, props, url.searchParams.get("dark") === "1"))
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
const PHONE = { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
const DESK = { width: 1280, height: 800, deviceScaleFactor: 1 }
const only = (process.env.VIEWS || "").split(",").filter(Boolean)

async function open(view, size, dark) {
  const p = await browser.newPage()
  await p.setViewport(size)
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.goto(`${origin}/?v=${view}${dark ? "&dark=1" : ""}`, { waitUntil: "networkidle0" })
  await sleep(250)
  return { p, errors }
}
const shot = (p, name, full = true) => p.screenshot({ path: join(shots, `c52-${name}.png`), fullPage: false, captureBeyondViewport: false, ...(full ? {} : {}) })
/* The page scroll is the inner .app-content-scroll; a full shot grows the viewport to its height. */
async function fullShot(p, name, size) {
  const h = await p.evaluate(() => document.querySelector(".app-content-scroll")?.scrollHeight ?? 800)
  await p.setViewport({ ...size, height: Math.min(Math.max(h, size.height), 4000) })
  await sleep(150)
  await shot(p, name)
  await p.setViewport(size)
}

for (const view of Object.keys(VIEWS)) {
  if (only.length && !only.includes(view)) continue
  for (const [sizeName, size] of [["phone", PHONE], ["desk", DESK]]) {
    for (const dark of [false, true]) {
      const { p, errors } = await open(view, size, dark)
      const name = `${view}-${sizeName}${dark ? "-dark" : ""}`
      await fullShot(p, name, size)
      if (!dark) {
        expect(errors.length === 0, `${name}: no errors`, errors[0])
        const wide = await p.evaluate(() => { const s = document.querySelector(".app-content-scroll"); return s ? s.scrollWidth - s.clientWidth : 0 })
        expect(wide <= 0, `${name}: nothing wider than the screen`, wide)
      }
      await p.close()
    }
  }
}

/* Opened states, light, both sizes. */
async function opened(view, size, sizeName, label, act) {
  if (only.length && !only.includes(view)) return
  const { p } = await open(view, size, false)
  try {
    await act(p)
    await sleep(450)
    await shot(p, `${view}-${label}-${sizeName}`)
  } catch (e) {
    expect(false, `${view} ${label} ${sizeName}`, e.message)
  }
  await p.close()
}
for (const [sizeName, size] of [["phone", PHONE], ["desk", DESK]]) {
  await opened("people", size, sizeName, "more", (p) => p.click("[data-contacts-more]"))
  await opened("people", size, sizeName, "add", (p) => p.click("[data-add-contact]"))
  await opened("people", size, sizeName, "import", async (p) => { await p.click("[data-contacts-more]"); await sleep(400); const items = await p.$$("[role=menuitem], [data-action-item], button"); for (const b of items) { const t = await b.evaluate((e) => e.textContent); if (/Import/.test(t)) { await b.click(); break } } })
  await opened("people", size, sizeName, "search", (p) => p.click("[data-contacts-filters]"))
  await opened("people", size, sizeName, "sort", (p) => p.click("[data-contacts-sort]"))
  /* Picking people is a computer's (a phone row has no checkbox, as on Orders). */
  if (sizeName === "desk") await opened("people", size, sizeName, "picked", async (p) => { const boxes = await p.$$("[data-contact-row] input[type=checkbox]"); for (const b of boxes.slice(0, 3)) await b.click() })
  await opened("profile", size, sizeName, "menu", (p) => p.click("[data-contact-more]"))
  await opened("profile", size, sizeName, "edit", (p) => p.click("[data-contact-edit]"))
}

/* Measurements. */
{
  const { p } = await open("people", DESK, false)
  const m = await p.evaluate(() => {
    const dark = [...document.querySelectorAll("button, a")].filter((e) => getComputedStyle(e).backgroundColor === "rgb(26, 26, 46)" && e.getBoundingClientRect().width > 0)
    return { darkActions: dark.map((e) => e.textContent.trim()), importVisible: [...document.querySelectorAll("button, a")].some((e) => /Import/.test(e.textContent) && e.getBoundingClientRect().width > 0) }
  })
  expect(m.darkActions.length === 1 && /Add contact/.test(m.darkActions[0]), "People: one dark action, Add contact", m.darkActions)
  expect(!m.importVisible, "People: Import is behind ⋯")
  await p.close()
}
{
  const { p } = await open("people", PHONE, false)
  const small = await p.evaluate(() => [...document.querySelectorAll("[data-contacts-people] button, [data-contacts-people] a, header button, header a")].filter((e) => { if (e.closest("[data-phone-row]")) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 36 }).map((e) => e.getAttribute("aria-label") || e.textContent.trim()).slice(0, 6))
  expect(small.length === 0, "People on a phone: every control at least 36px tall", small)
  await p.close()
}
{
  const { p } = await open("profile", DESK, false)
  const nested = await p.evaluate(() => [...document.querySelectorAll("[data-contact-profile] section")].filter((s) => s.parentElement?.closest("[data-contact-profile] section") || s.querySelector("[class*=rounded-lg][class*=bg-]")).length)
  expect(nested === 0, "Profile: no card inside a card", nested)
  await p.close()
}

await browser.close()
server.close()
console.log(`\nShots in ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
