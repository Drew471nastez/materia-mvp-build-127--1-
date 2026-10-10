/**
 * SUPPORT, FROM BOTH SIDES, DRAWN AND PRESSED.
 *
 *   node scripts/check-support.mjs        (SHOTS=dir to keep screenshots)
 *
 * The store's /app/support and Storelib's /admin/resolution
 * (scripts/render-support.tsx) against a stubbed API, at a phone's width and
 * a computer's: nothing runs off the side, the list and the thread read
 * right, New request sends what it says, and "Suggest a reply" fills the
 * box without sending anything.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
if (!existsSync(CHROMIUM)) { console.error("No browser"); process.exit(1) }
const css = await appCss(root)
const out = mkdtempSync(join(tmpdir(), "storelib-support-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-support.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"', `--alias:@=${root}`, `--alias:next/navigation=${join(root, "scripts/probe-next-navigation.ts")}`, "--loader:.css=empty"],
  { stdio: ["ignore", "ignore", "inherit"] })
writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><style>body{margin:0;background:#f8f9fa}</style></head><body><div id="app"></div><script src="probe.js"></script></body></html>`)

const iso = (h) => new Date(Date.now() - h * 3600_000).toISOString()
const T = (id, subject, status, extra = {}) => ({ id, topic: "payouts", subject, status, priority: "normal", orderRef: null, createdAt: iso(30), lastMessageAt: iso(2), unread: false, ...extra })
const t1 = "11111111-1111-4111-8111-111111111111"
const t2 = "22222222-2222-4222-8222-222222222222"
const THREAD = { ticket: T(t1, "My payout from last Friday still hasn't arrived in my bank account", "waiting", { orderRef: "1A2B3C4D" }), messages: [
  { id: 1, author: "creator", internal: false, body: "Hi, the payout was due Friday and I still don't see it.\n\nCan you check?", createdAt: iso(30) },
  { id: 2, author: "storelib", internal: false, body: "Thanks for the details. It left Stripe on Monday and banks take 2 to 3 business days.\n\nStorelib support", createdAt: iso(2) },
] }
const STORE_API = {
  "GET /api/support/tickets": { tickets: [T(t1, THREAD.ticket.subject, "waiting", { unread: true }), T(t2, "Domain not connecting", "resolved", { topic: "website" })] },
  [`GET /api/support/tickets/${t1}`]: THREAD,
  "POST /api/support/tickets": { ticket: T("33333333-3333-4333-8333-333333333333", "Order never arrived", "open", { topic: "orders" }) },
  [`POST /api/support/tickets/${t1}`]: { ticket: { ...THREAD.ticket, status: "open" }, messages: [...THREAD.messages, { id: 3, author: "creator", internal: false, body: "Got it, thanks", createdAt: iso(0) }] },
}
const ADMIN_TICKET = { ...THREAD.ticket, status: "open", creatorId: "c1", store: { name: "Angus Farm", slug: "angus" }, disputeId: null, resolvedAt: null }
const ADMIN_API = {
  "GET /api/admin/support?status=open": { tickets: [{ ...ADMIN_TICKET, priority: "urgent" }, { ...ADMIN_TICKET, id: t2, subject: "Shipping labels", topic: "shipping" }], counts: { open: 2, waiting: 5, resolved: 40 } },
  [`GET /api/admin/support/${t1}`]: { ticket: ADMIN_TICKET, messages: [...THREAD.messages, { id: 3, author: "storelib", internal: true, body: "Payout po_123 in transit per Stripe.", createdAt: iso(1) }], contact: "owner@example.com" },
  [`POST /api/admin/support/${t1}/suggest`]: { draft: "Hi, your payout is on its way and should land by Thursday.\n\nStorelib support" },
  "GET /api/admin/payments/disputes": { rows: [], cases: [{ disputeId: "dp_1", amount: 4900, currency: "EUR", reason: "fraudulent", status: "needs_response", inquiry: false, evidenceDueBy: iso(-24), product: "Bread course", outcome: null, creatorNote: null, opened: iso(48), closed: null, creator: { slug: "angus", display_name: "Angus Farm" } }] },
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--force-device-scale-factor=1"] })
const page = await browser.newPage()
let bad = 0
const say = (ok, line) => { if (!ok) bad++; console.log(`  ${ok ? "ok   " : "FAIL "} ${line}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function open(panel, vp, api, search = "") {
  await page.setViewport(vp)
  await page.evaluateOnNewDocument((p, a) => { window.__panel = p; window.__api = a }, panel, api)
  await page.goto(`file://${join(out, "index.html")}${search}`)
  await wait(400)
}
const fits = () => page.evaluate(() => {
  const over = document.documentElement.scrollWidth - innerWidth
  const cut = [...document.querySelectorAll("button, label, p, h1, h2, span, a")].filter((el) => {
    if (!(el instanceof HTMLElement) || !el.offsetParent) return false
    /* A row of tabs that scrolls sideways on purpose (the console's Filters) runs past the edge by design. */
    if (el.closest('[role="tablist"]') && getComputedStyle(el.closest('[role="tablist"]')).overflowX === "auto") return false
    const r = el.getBoundingClientRect()
    return r.right > innerWidth + 1 || (el.tagName === "BUTTON" && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== "visible")
  }).map((el) => (el.textContent || "").trim().slice(0, 40))
  return { over, cut }
})
const fitLine = (f) => `nothing runs off the side or is cut (${f.over}px over${f.cut.length ? `, cut: ${f.cut.join(" | ")}` : ""})`
const sent = () => page.evaluate(() => window.__sent)

for (const [name, vp] of [["a phone", { width: 390, height: 844, isMobile: true, hasTouch: true }], ["a computer", { width: 1280, height: 900 }]]) {
  console.log(`\nThe store's Support on ${name}`)
  await open("store", vp, STORE_API)
  say((await fits()).over <= 0 && (await fits()).cut.length === 0, fitLine(await fits()))
  const list = await page.evaluate(() => [...document.querySelectorAll("[data-ticket]")].map((b) => b.textContent.replace(/\s+/g, " ").trim()))
  say(list.length === 2 && /New reply/.test(list[0]) && /Resolved/.test(list[1]), `requests with whose turn: ${list.map((l) => l.slice(-12)).join(" | ")}`)
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/support-list-${vp.width}.png` })
  await page.click(`[data-ticket="${t1}"]`)
  await wait(300)
  const th = await page.evaluate(() => ({ url: location.search, msgs: [...document.querySelectorAll("[data-message]")].map((m) => m.getAttribute("data-message")), title: document.querySelector("[data-support-thread] h2")?.textContent }))
  say(th.url === `?ticket=${"11111111-1111-4111-8111-111111111111"}` && th.msgs.join() === "creator,storelib", `a request opens into its thread, in the address: ${th.url}, ${th.msgs.join(" then ")}`)
  say((await fits()).over <= 0 && (await fits()).cut.length === 0, `the thread: ${fitLine(await fits())}`)
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/support-thread-${vp.width}.png`, fullPage: true })
  await page.type("#support-reply", "Got it, thanks")
  await page.click("[data-support-reply]")
  await wait(250)
  const r = (await sent()).at(-1)
  const after = await page.evaluate(() => document.querySelectorAll("[data-message]").length)
  say(r?.body?.action === "reply" && r.body.body === "Got it, thanks" && after === 3, `a reply sends and shows: ${JSON.stringify(r?.body)}`)

  await open("store", vp, STORE_API)
  await page.click("[data-support-new]")
  await wait(250)
  const form = await page.evaluate(() => ({ dialog: (({ bottom, width }) => ({ bottom, width }))(document.querySelector('[role="dialog"]').getBoundingClientRect()), order: !!document.querySelector("#support-order") }))
  if (name === "a phone") say(Math.round(form.dialog.bottom) === 844 && form.dialog.width === 390, `New request is a sheet from the bottom (${Math.round(form.dialog.bottom)}px)`)
  say((await fits()).over <= 0 && (await fits()).cut.length === 0, `New request: ${fitLine(await fits())}`)
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/support-new-${vp.width}.png` })
  await page.type("#support-subject", "Order never arrived")
  await page.type("#support-order", "#9F8E7D6C")
  await page.type("#support-message", "The buyer says the parcel never came, tracking stopped in Sofia.")
  await page.click("[data-support-send]")
  await wait(300)
  const s = (await sent()).find((x) => x.path === "/api/support/tickets")
  say(s && s.body.topic === "orders" && s.body.subject === "Order never arrived" && s.body.orderRef === "#9F8E7D6C" && /Sofia/.test(s.body.message), `Send sends the topic, subject, order and details: ${JSON.stringify(s?.body).slice(0, 120)}`)
  const landed = await page.evaluate(() => location.search)
  say(/^\?ticket=3333/.test(landed), `and opens the new request: ${landed}`)

  console.log(`\nStorelib's Resolution center on ${name}`)
  await open("admin", vp, ADMIN_API)
  say((await fits()).over <= 0 && (await fits()).cut.length === 0, fitLine(await fits()))
  const q = await page.evaluate(() => ({ rows: [...document.querySelectorAll("[data-admin-ticket]")].map((b) => b.textContent.replace(/\s+/g, " ").trim()), tabs: document.querySelector("[data-admin-resolution]").textContent.includes("Needs a reply (2)") }))
  say(q.rows.length === 2 && /Urgent/.test(q.rows[0]) && /Angus Farm/.test(q.rows[0]) && q.tabs, `Needs a reply first with counts, the urgent one marked: "${q.rows[0]?.slice(0, 70)}"`)
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/resolution-${vp.width}.png` })
  await page.click(`[data-admin-ticket="${t1}"]`)
  await wait(300)
  const v = await page.evaluate(() => ({ kinds: [...document.querySelectorAll("[data-admin-message]")].map((m) => m.getAttribute("data-admin-message")), meta: document.querySelector("[data-admin-ticket-view]")?.textContent.includes("owner@example.com") }))
  say(v.kinds.join() === "creator,storelib,note" && v.meta, `the thread with the internal note set apart, and who to write to: ${v.kinds.join(", ")}`)
  say((await fits()).over <= 0 && (await fits()).cut.length === 0, `the request: ${fitLine(await fits())}`)
  await page.click("[data-admin-suggest]")
  await wait(250)
  const d = await page.evaluate(() => ({ draft: document.querySelector('textarea[aria-label="Reply"]')?.value, posted: window.__sent.map((x) => x.path) }))
  say(/should land by Thursday/.test(d.draft ?? "") && d.posted.length === 1 && d.posted[0].endsWith("/suggest"), `Suggest a reply fills the box and sends nothing: ${d.posted.join(", ")}`)
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/resolution-ticket-${vp.width}.png`, fullPage: true })
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Internal note").click())
  await wait(80)
  await page.click("[data-admin-send]")
  await wait(200)
  const n = (await sent()).at(-1)
  say(n?.body?.action === "reply" && n.body.internal === true, `Internal note sends as a note, not to the store: ${JSON.stringify(n?.body).slice(0, 90)}`)
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Disputes").click())
  await wait(300)
  const dz = await page.evaluate(() => document.querySelector("[data-admin-disputes]")?.textContent.replace(/\s+/g, " "))
  say(/Angus Farm/.test(dz ?? "") && /Evidence due/.test(dz ?? "") && /hasn't added evidence/.test(dz ?? ""), `Disputes: the store, the deadline, whether they've answered: "${(dz ?? "").slice(0, 90)}"`)
  say((await fits()).over <= 0 && (await fits()).cut.length === 0, `Disputes: ${fitLine(await fits())}`)
}

await browser.close()
console.log(bad ? `\n${bad} failed` : "\nBoth sides fit, read right, and send what they say.")
process.exit(bad ? 1 : 0)
