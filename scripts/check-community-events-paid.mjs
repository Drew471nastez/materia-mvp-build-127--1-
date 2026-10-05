/**
 * ===========================================================================
 *  A PAID EVENT ON THE MEMBER SIDE, MEASURED
 * ===========================================================================
 * The real components (scripts/render-community-events-paid.tsx) with
 * fixture props, served at a storelib.com address with the API answered
 * here and Stripe's Embedded Checkout replaced by a stub of the same shape
 * (it asks fetchClientSecret, draws a form, and calls onComplete when Pay
 * is pressed), at 1440x900 and on a 390x844 phone:
 *
 *   EVERY CASE   nothing scrolls sideways; on a phone every button and link
 *                is at least 40px tall; no page errors; screenshots.
 *   LIST         a paid event states its price once; a free one says
 *                nothing about money; a full one reads Sold out; a seat
 *                already bought reads Going.
 *   MONTH        the same prices in the grid, and a held seat drawn in ink.
 *   PAY          the price, how many are going, the seats left, one
 *                Get a ticket button, and the three quiet lines; no meeting
 *                link, no address, no attendees, no calendar file.
 *   CHECKOUT     the sheet asks the server for a session once, draws
 *                Stripe's form in a dialog no wider than 520px on a
 *                computer and a sheet on a phone that sits on the bottom
 *                edge, and Pay confirms once and says they are going.
 *   HOLDER       the details open, the quiet ticket line, Give up my seat
 *                and the Storelib confirm that says what comes back.
 *   INVITED      says they were invited, never a price.
 *   SOLD OUT, CLOSED, REFUNDED, CANCELLED  each one calm sentence.
 *   FREE         no money anywhere on the page.
 *
 *   PROBE_CSS=source node scripts/check-community-events-paid.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const work = mkdtempSync(join(tmpdir(), "storelib-events-paid-"))
const shots = process.env.SHOTS_DIR || join(work, "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

writeFileSync(join(work, "navigation.js"), `export const usePathname = () => "/community/makers/events"
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() { window.__refreshed = (window.__refreshed || 0) + 1 } })
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(work, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault() } }, children) })
`)
writeFileSync(join(work, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, quality, ...rest }) { return React.createElement("img", { src, alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" } : undefined, ...rest }) }
`)
/* Stripe's Embedded Checkout, the same shape: the provider asks for the client secret, the form calls onComplete. */
writeFileSync(join(work, "stripe-react.jsx"), `import React from "react"
const Ctx = React.createContext(null)
export function EmbeddedCheckoutProvider({ options, children }) {
  const [secret, setSecret] = React.useState(null)
  React.useEffect(() => { let live = true; options.fetchClientSecret().then((s) => live && setSecret(s), () => {}); return () => { live = false } }, [])
  return React.createElement(Ctx.Provider, { value: { secret, options } }, children)
}
export function EmbeddedCheckout() {
  const c = React.useContext(Ctx)
  if (!c || !c.secret) return React.createElement("div", { "data-stripe-stub": "loading", style: { height: 520 } })
  const field = (label, h = 44) => React.createElement("div", { style: { margin: "0 20px 14px" } }, React.createElement("div", { style: { font: "500 13px Inter, sans-serif", color: "#30313d", marginBottom: 6 } }, label), React.createElement("div", { style: { height: h, border: "1px solid #e0e0e0", borderRadius: 6, boxShadow: "0 1px 1px rgba(0,0,0,.03)" } }))
  return React.createElement("div", { "data-stripe-stub": "form", "data-secret": c.secret, style: { paddingTop: 8 } },
    React.createElement("div", { style: { margin: "4px 20px 18px", height: 44, borderRadius: 6, background: "#000", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", font: "600 15px Inter, sans-serif" } }, "Pay with Link"),
    field("Email"), field("Card information", 88), field("Cardholder name"), field("Country or region"),
    React.createElement("button", { type: "button", "data-stripe-pay": "", onClick: () => c.options.onComplete(), style: { display: "block", width: "calc(100% - 40px)", margin: "8px 20px 20px", height: 46, borderRadius: 6, background: "#0074d4", color: "#fff", border: 0, font: "600 16px Inter, sans-serif" } }, "Pay $25.00"))
}
`)
writeFileSync(join(work, "stripe-pure.js"), `export const loadStripe = () => Promise.resolve({})\n`)

const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-community-events-paid.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: {
    "@": ".",
    "next/navigation": join(work, "navigation.js"),
    "next/link": join(work, "link.jsx"),
    "next/image": join(work, "image.jsx"),
    "@stripe/react-stripe-js": join(work, "stripe-react.jsx"),
    "@stripe/stripe-js/pure": join(work, "stripe-pure.js"),
  },
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder',NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:'pk_test_probe'}};" },
  loader: { ".css": "empty" },
  outfile: join(work, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(work, "app.js"), "utf8")
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const json = (r, body, status = 200) => r.respond({ status, contentType: "application/json", body: JSON.stringify(body) })

async function open(vp, which) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  const calls = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const u = r.url()
    if (u.startsWith("https://storelib.com/__eprobe")) return r.respond({ status: 200, contentType: "text/html", body: html })
    if (u.includes("/api/")) calls.push(`${r.method()} ${u.replace("https://storelib.com", "")}`)
    if (/\/checkout\/confirm$/.test(u)) return json(r, { ok: true, created: true })
    if (/\/checkout$/.test(u)) return json(r, { clientSecret: "cs_test_event_secret_x", sessionId: "cs_test_event000001", amountCents: 2500, currency: "usd" })
    if (/\/ticket$/.test(u)) return json(r, { ok: true, refundedCents: 2500 })
    if (/\/events\?/.test(u) || /\/events$/.test(u)) return json(r, { events: [], nextCursor: null })
    if (u.startsWith("data:")) return r.continue()
    return r.abort()
  })
  await p.goto(`https://storelib.com/__eprobe?${which}`, { waitUntil: "domcontentloaded" })
  await p.waitForSelector("[data-probe-case]")
  await sleep(400)
  return { p, errors, calls }
}

async function common(p, label, which, phone, scope = "main", fullPage = true) {
  const m = await p.evaluate((sel) => {
    const over = document.documentElement.scrollWidth - innerWidth
    const small = []
    for (const el of document.querySelectorAll(`${sel} a, ${sel} button, ${sel} input, ${sel} select`)) {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || el.closest("[hidden]") || el.closest("[data-stripe-stub]")) continue
      if (el.type === "file" || el.getAttribute("role") === "switch") continue
      if (r.height < 40) small.push(`${(el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 28)} ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
    return { over, small }
  }, scope)
  expect(m.over <= 0, `${label} ${which}: nothing scrolls sideways`, m.over)
  if (phone) expect(m.small.length === 0, `${label} ${which}: every button, link and field is at least 40px tall`, m.small)
  await p.screenshot({ path: join(shots, `${which}-${label}.png`), fullPage })
}

const VIEWPORTS = [
  ["desktop-1440", { width: 1440, height: 900 }, false],
  ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, true],
]

for (const [label, vp, phone] of VIEWPORTS) {
  console.log(`\n${label}`)

  /* The list */
  {
    const { p, errors } = await open(vp, "list")
    const g = await p.evaluate(() => {
      const row = (id) => document.querySelector(`[data-event-row="${id}"]`)
      const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : null)
      return {
        prices: [...document.querySelectorAll("[data-event-price]")].map((e) => e.textContent.trim()),
        soldOut: [...document.querySelectorAll("[data-event-sold-out]")].length,
        free: text(row("e2")),
        holder: !!row("e4")?.querySelector("[data-my-rsvp='going']"),
        holderPrice: !!row("e4")?.querySelector("[data-event-price]"),
        cancelledPrice: !!row("e5")?.querySelector("[data-event-price]"),
        rows: document.querySelectorAll("[data-event-row]").length,
      }
    })
    expect(g.rows === 7, `${label} list: every event is a row`, g.rows)
    expect(g.prices.join() === "$25,$15", `${label} list: the paid events state their price once`, g.prices)
    expect(g.soldOut === 1, `${label} list: the full paid event reads Sold out and no price`, g.soldOut)
    expect(g.free !== null && !/\$/.test(g.free), `${label} list: a free event says nothing about money`, g.free)
    expect(g.holder && !g.holderPrice, `${label} list: a seat already bought reads Going, with no price beside it`, g)
    expect(!g.cancelledPrice, `${label} list: a cancelled event does not ask for money`, g.cancelledPrice)
    await common(p, label, "list", phone)
    expect(errors.length === 0, `${label} list: no page errors`, errors)
    await p.close()
  }

  /* The month grid, computers only */
  if (!phone) {
    const { p, errors } = await open(vp, "month")
    await p.click("[data-events-tab='calendar']")
    await sleep(350)
    const g = await p.evaluate(() => ({
      prices: [...document.querySelectorAll("[data-calendar-price]")].map((e) => e.textContent.replace(/\s+/g, " ").trim()),
      pricesFit: [...document.querySelectorAll("[data-calendar-price]")].every((e) => {
        const r = e.getBoundingClientRect()
        const cell = e.closest("[data-day]").getBoundingClientRect()
        return r.width > 0 && r.right <= cell.right + 1
      }),
      ink: [...document.querySelectorAll("[data-calendar-event]")].filter((e) => getComputedStyle(e).backgroundColor === "rgb(26, 26, 46)").length,
      cells: document.querySelectorAll("[data-day]").length,
    }))
    expect(g.cells === 42, `${label} month: the grid is always six weeks`, g.cells)
    expect(g.prices.length >= 2 && g.prices.every((t) => /\$/.test(t)) && g.pricesFit, `${label} month: a paid event carries its price in the grid, where it fits`, g)
    expect(g.ink >= 2, `${label} month: a seat held or answered is drawn in ink`, g.ink)
    await common(p, label, "month", phone)
    expect(errors.length === 0, `${label} month: no page errors`, errors)
    await p.close()
  }

  /* A paid event, no ticket */
  {
    const { p, errors } = await open(vp, "pay")
    const g = await p.evaluate(() => ({
      gate: document.querySelector("[data-ticket-gate]")?.getAttribute("data-ticket-gate"),
      heading: document.querySelector("[data-ticket-gate] p")?.textContent.replace(/\s+/g, " ").trim(),
      seats: document.querySelector("[data-ticket-gate] p + p")?.textContent.replace(/\s+/g, " ").trim(),
      button: document.querySelector("[data-buy-ticket]")?.textContent.replace(/\s+/g, " ").trim(),
      buttonH: Math.round(document.querySelector("[data-buy-ticket]")?.getBoundingClientRect().height || 0),
      terms: [...document.querySelectorAll("[data-ticket-terms] li")].map((l) => l.textContent.replace(/\s+/g, " ").trim()),
      join: !!document.querySelector("[data-join-now]"),
      ics: !!document.querySelector("[data-ics]"),
      attendees: !!document.querySelector("[data-attendees]"),
      calendar: !!document.querySelector("[data-add-to-calendar]"),
      teaser: !!document.querySelector("[data-event-teaser]"),
      where: document.querySelector("[data-event-facts] li:nth-child(2)")?.textContent.replace(/\s+/g, " ").trim(),
      dollars: (document.querySelector("main").textContent.match(/\$25/g) || []).length,
    }))
    expect(g.gate === "pay", `${label} pay: the gate is the price`, g.gate)
    expect(/costs \$25/.test(g.heading || ""), `${label} pay: it says what it costs, once`, g.heading)
    expect(/going/.test(g.seats || "") && /seats left/.test(g.seats || ""), `${label} pay: how many are going and how many seats are left`, g.seats)
    expect(g.button === "Get a ticket · $25" && g.buttonH >= 40, `${label} pay: one clear Get a ticket button`, g)
    expect(g.terms.length === 3 && /seat at this event/.test(g.terms[0]) && /address/.test(g.terms[1]) && /refundable|comes back/.test(g.terms[2]), `${label} pay: what they get, in three quiet lines`, g.terms)
    expect(!g.join && !g.ics && !g.attendees && !g.calendar, `${label} pay: no meeting link, no calendar file, no attendees`, g)
    expect(g.teaser && /Lisbon/.test(g.where || "") && !/Rua das Flores/.test(g.where || ""), `${label} pay: a teaser and the town, never the street`, { teaser: g.teaser, where: g.where })
    expect(g.dollars === 2, `${label} pay: the price is stated plainly and twice at most (the line and the button)`, g.dollars)
    await common(p, label, "pay", phone)
    expect(errors.length === 0, `${label} pay: no page errors`, errors)
    await p.close()
  }

  /* The checkout sheet */
  {
    const { p, errors, calls } = await open(vp, "checkout")
    await p.click("[data-buy-ticket]")
    await p.waitForSelector("[data-stripe-stub='form']", { timeout: 5000 }).catch(() => null)
    await p.waitForFunction(() => { const s = document.querySelector("[data-sheet-panel]"); return !s || getComputedStyle(s).position === "absolute" || Math.abs(s.getBoundingClientRect().bottom - innerHeight) < 1 }, { timeout: 3000 }).catch(() => null)
    await sleep(400)
    const g = await p.evaluate(() => {
      const box = document.querySelector("[data-ticket-checkout]")
      const panel = box?.closest("[data-sheet-panel]") ?? box?.closest("[role=dialog]") ?? box?.parentElement
      const pr = panel?.getBoundingClientRect()
      return {
        form: !!document.querySelector("[data-stripe-stub='form']"),
        secret: document.querySelector("[data-stripe-stub='form']")?.getAttribute("data-secret"),
        width: Math.round(pr?.width || 0),
        left: Math.round(pr?.left || 0),
        bottom: Math.round(pr?.bottom || 0),
        top: Math.round(pr?.top || 0),
        title: box?.querySelector("h2")?.textContent,
        line: box?.querySelector("p")?.textContent.replace(/\s+/g, " ").trim(),
        bodyScrolls: (() => { const b = document.querySelector("[data-ticket-checkout-body]"); return b ? getComputedStyle(b).overflowY : null })(),
        opacity: (() => { let o = 1; for (let el = panel; el && el !== document.documentElement; el = el.parentElement) o *= Number(getComputedStyle(el).opacity); return Math.round(o * 1000) / 1000 })(),
      }
    })
    const asked = calls.filter((c) => /^POST .*\/checkout$/.test(c)).length
    expect(g.form && g.secret === "cs_test_event_secret_x", `${label} checkout: Stripe's form, made from the server's session`, g)
    expect(asked === 1, `${label} checkout: the session is asked for once`, calls)
    expect(/\$25/.test(g.line || "") && g.title === "Wheel throwing, a whole Saturday", `${label} checkout: the event, its price and when, at the top`, { title: g.title, line: g.line })
    if (phone) expect(Math.abs(g.bottom - 844) <= 2 && g.top > 40 && g.top < 120, `${label} checkout: a bottom sheet above the keyboard line, nearly full height`, g)
    else expect(g.width > 0 && g.width <= 520 && Math.abs(g.left + g.width / 2 - 720) <= 2, `${label} checkout: a centred dialog, at most 520px wide`, g)
    expect(g.bodyScrolls === "auto", `${label} checkout: a long form scrolls inside the sheet`, g.bodyScrolls)
    expect(g.opacity >= 0.99, `${label} checkout: the sheet is opaque, nothing of the page shows through`, g.opacity)
    await sleep(700)
    await common(p, label, "checkout", phone, "[data-ticket-checkout]", false)
    /*
      THE SHEET'S PANEL SITS AT opacity 0.999 ON PURPOSE (components/ui/
      bottom-sheet.tsx, so its layer is drawn past Safari's floating bar).
      Headless Chromium blends that layer with the page behind it in a
      screenshot, which no real device does, so a second picture with the
      panel forced opaque is the one worth looking at.
    */
    if (phone) {
      await p.evaluate(() => { const s = document.querySelector("[data-sheet-panel]"); if (s) s.style.opacity = "1" })
      await sleep(150)
      await p.screenshot({ path: join(shots, `checkout-opaque-${label}.png`) })
    }
    await p.click("[data-stripe-pay]")
    await p.waitForSelector("[data-ticket-bought]", { timeout: 4000 }).catch(() => null)
    await sleep(300)
    const done = await p.evaluate(() => ({ bought: !!document.querySelector("[data-ticket-bought]"), text: document.querySelector("[data-ticket-bought]")?.textContent.replace(/\s+/g, " ").trim(), refreshed: window.__refreshed || 0 }))
    const confirmed = calls.filter((c) => /^POST .*\/checkout\/confirm$/.test(c)).length
    expect(done.bought && confirmed === 1 && done.refreshed >= 1, `${label} checkout: Pay confirms once, says they are going, and refreshes the page`, { ...done, confirmed })
    await p.screenshot({ path: join(shots, `bought-${label}.png`) })
    expect(errors.length === 0, `${label} checkout: no page errors`, errors)
    await p.close()
  }

  /* With a ticket */
  {
    const { p, errors, calls } = await open(vp, "holder")
    const g = await p.evaluate(() => ({
      state: document.querySelector("[data-rsvp-state]")?.getAttribute("data-rsvp-state"),
      line: document.querySelector("[data-ticket-line]")?.textContent.replace(/\s+/g, " ").trim(),
      giveUp: document.querySelector("[data-give-up-seat]")?.textContent.trim(),
      giveUpH: Math.round(document.querySelector("[data-give-up-seat]")?.getBoundingClientRect().height || 0),
      ics: !!document.querySelector("[data-ics]"),
      attendees: !!document.querySelector("[data-attendees]"),
      where: document.querySelector("[data-event-facts] li:nth-child(2)")?.textContent.replace(/\s+/g, " ").trim(),
      gate: !!document.querySelector("[data-ticket-gate]"),
      buy: !!document.querySelector("[data-buy-ticket]"),
      prose: !!document.querySelector("[data-event-description] .storelib-prose"),
    }))
    expect(g.state === "going" && /Paid \$25 on/.test(g.line || ""), `${label} holder: You are going, and one quiet line about what they paid`, g)
    expect(g.giveUp === "Give up my seat" && g.giveUpH >= 40, `${label} holder: Give up my seat, a full size button`, g)
    expect(g.ics && g.attendees && /Rua das Flores/.test(g.where || "") && g.prose, `${label} holder: the details are open`, g)
    expect(!g.gate && !g.buy, `${label} holder: nothing asks them to buy again`, g)
    await common(p, label, "holder", phone)
    /* The confirm says what comes back, and only then is the seat given up. */
    await p.click("[data-give-up-seat]")
    await sleep(350)
    const ask = await p.evaluate(() => {
      const d = document.querySelector("[role=dialog]")
      return { title: d?.querySelector("h2, [id]")?.textContent.trim(), text: d?.textContent.replace(/\s+/g, " ").trim(), button: !!d?.querySelector("[data-confirm]") }
    })
    expect(/Give up your seat/.test(ask.title || "") && /\$25 goes back/.test(ask.text || "") && /5 to 10 days/.test(ask.text || ""), `${label} holder: the confirm says what comes back and when`, ask)
    await p.screenshot({ path: join(shots, `holder-confirm-${label}.png`) })
    await p.click("[data-confirm]")
    await sleep(500)
    const sent = calls.filter((c) => /^DELETE .*\/ticket$/.test(c)).length
    expect(sent === 1, `${label} holder: the seat is given up once, through the ticket route`, calls)
    expect(errors.length === 0, `${label} holder: no page errors`, errors)
    await p.close()
  }

  /* Invited, sold out, closed, refunded, cancelled, free */
  for (const [which, want] of [
    ["invited", (g) => /invited/i.test(g.line || "") && !/\$/.test(g.line || "")],
    ["soldout", (g) => g.gate === "sold_out" && /Sold out/.test(g.heading || "")],
    ["closed", (g) => g.gate === "sales_closed" && /closed/i.test(g.heading || "")],
    ["refund", (g) => g.gate === "refunded" && /refunded/i.test(g.heading || "")],
    ["cancelled", (g) => /cancelled/i.test(g.body || "") && /on its way back/.test(g.money || "")],
    ["free", (g) => !/\$/.test(g.main || "") && !g.gate && !g.line],
  ]) {
    const { p, errors } = await open(vp, which)
    const g = await p.evaluate(() => ({
      gate: document.querySelector("[data-ticket-gate]")?.getAttribute("data-ticket-gate") ?? null,
      heading: document.querySelector("[data-ticket-gate] p")?.textContent.replace(/\s+/g, " ").trim() ?? null,
      line: document.querySelector("[data-ticket-line]")?.textContent.replace(/\s+/g, " ").trim() ?? null,
      money: document.querySelector("[data-ticket-money]")?.textContent.replace(/\s+/g, " ").trim() ?? null,
      body: document.querySelector("[data-event-actions]")?.textContent.replace(/\s+/g, " ").trim() ?? null,
      main: document.querySelector("main")?.textContent ?? null,
    }))
    expect(want(g), `${label} ${which}: reads as one calm sentence`, g)
    await common(p, label, which, phone)
    expect(errors.length === 0, `${label} ${which}: no page errors`, errors)
    await p.close()
  }
}

await browser.close()
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
