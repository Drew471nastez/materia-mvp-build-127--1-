/**
 * ===========================================================================
 *  SETTINGS > PLAN: ONE COLUMN, CANCEL PLAN AND RESUME PLAN, MEASURED
 * ===========================================================================
 * The real Settings page on its Plan tab (scripts/render-billing-cancel-probe.tsx)
 * at 390x844, 1440x900 and 1920x1080, against a server that stands in for
 * the billing API and keeps the subscription's state. For each width:
 *
 *   COLUMN   the Plans heading, the plan cards, the Subscription Overview
 *            and the Billing History share one left and one right edge.
 *   GAPS     the space between the three sections is the same.
 *   FREE     somebody on Free sees no Cancel plan.
 *   CANCEL   on Pro: Cancel plan opens the dialog (a bottom sheet on the
 *            phone), a reason and a note are sent to the cancel route, and
 *            the overview then says "Pro until <date>" with Resume plan.
 *   RESUME   Resume plan posts to the resume route and Cancel plan is back.
 *
 *   node scripts/check-billing-cancel.mjs
 *   SHOTS=/dir node scripts/check-billing-cancel.mjs     # screenshots
 *
 * Nothing here talks to Stripe or a database.
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { createRequire } from "node:module"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { appCss, interFaces } from "./probe-css.mjs"
import nextConfig from "../next.config.mjs"

const require = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require("playwright"))
} catch {
  const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim()
  ;({ chromium } = require(join(globalRoot, "playwright")))
}

const SHOTS = process.env.SHOTS
const root = process.cwd()
const tmp = mkdtempSync(join(tmpdir(), "storelib-cancel-"))
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }

/* The two header pictures, fetched once (the browser cannot reach out). */
const cardsSource = readFileSync(join(root, "components/billing/plan-cards.tsx"), "utf8")
const base = /const PICTURE_BASE = "([^"]+)"/.exec(cardsSource)?.[1]
const names = [...cardsSource.matchAll(/picture: `\$\{PICTURE_BASE\}\/([^`]+)`/g)].map((m) => m[1])
const pictures = new Map()
for (const [i, name] of names.entries()) {
  const url = `${base}/${name}`
  const file = join(tmp, `picture-${i}.png`)
  try {
    execFileSync("curl", ["-sSf", "-o", file, url], { stdio: ["ignore", "ignore", "ignore"], timeout: 60_000 })
    pictures.set(url, file)
  } catch {
    /* Without the picture the header shows its own ground colour; the layout is the same. */
  }
}

const dir = join(root, ".billing-cancel-probe")
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
writeFileSync(join(dir, "dynamic.js"), `export default function dynamic() { return () => null }
`)
writeFileSync(join(dir, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}), updateUser: async () => ({ data: {}, error: null }), reauthenticate: async () => ({ error: null }), refreshSession: async () => ({}) }, from: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)
const imageOpts = {
  deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  imageSizes: [32, 48, 64, 96, 128, 256, 384],
  path: "/_next/image", loader: "default", loaderFile: "", domains: [], disableStaticImages: false,
  minimumCacheTTL: nextConfig.images.minimumCacheTTL, formats: nextConfig.images.formats,
  dangerouslyAllowSVG: false, contentSecurityPolicy: "script-src 'none'; frame-src 'none'; sandbox;", contentDispositionType: "attachment",
  remotePatterns: nextConfig.images.remotePatterns, qualities: nextConfig.images.qualities, unoptimized: false,
}
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-billing-cancel-probe.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--define:process.env.__NEXT_IMAGE_OPTS=${JSON.stringify(imageOpts)}`,
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:next/dynamic=${join(dir, "dynamic.js")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const script = readFileSync(join(dir, "probe.js"), "utf8")
rmSync(dir, { recursive: true, force: true })

const fontFiles = new Map()
const faces = interFaces(root).replace(/url\(file:\/\/([^)]+)\)/g, (_, p) => {
  const key = `/__font/${fontFiles.size}.woff2`
  fontFiles.set(key, p)
  return `url(${key})`
})
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${faces}</style><style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${script}</script></body></html>`

/* ── The billing API, with state ───────────────────────────────────────── */
const FREE = { id: "free", name: "Free", price_cents: 0, fee_percent: 0.05, fee_fixed_cents: 25 }
const PRO = { id: "growth", name: "Pro", price_cents: 2900, fee_percent: 0.03, fee_fixed_cents: 25 }
const PERIOD_END = "2026-11-10T09:00:00.000Z"
const invoices = [0, 1, 2].map((i) => ({
  id: `in_${i}`, amount_cents: 2900, status: "paid", description: "Pro",
  created_at: `2026-${String(10 - i).padStart(2, "0")}-10T10:00:00Z`, period_start: null, period_end: null, invoice_pdf_url: null,
}))
const state = { plan: "pro", canceling: false, posts: [] }
const subscription = () => state.plan === "free" ? null : {
  id: "sub_1", stripe_subscription_id: "sub_1", plan_id: "growth", pending_plan_id: null, status: "active",
  current_period_start: "2026-10-10T09:00:00.000Z", current_period_end: PERIOD_END, cancel_at_period_end: state.canceling,
}
const overview = () => ({
  plans: [FREE, PRO],
  subscription: subscription(),
  currentPlan: state.plan === "free" ? FREE : PRO,
  invoices: state.plan === "free" ? [] : invoices,
  paymentMethod: state.plan === "free" ? null : { card_brand: "visa", card_last4: "4242", card_exp_month: 8, card_exp_year: 2029 },
})

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://probe")
  if (url.pathname === "/_next/image") {
    const file = pictures.get(url.searchParams.get("url") ?? "")
    if (!file) { res.writeHead(404).end(); return }
    res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" }).end(readFileSync(file))
    return
  }
  if (fontFiles.has(url.pathname)) {
    res.writeHead(200, { "Content-Type": "font/woff2" }).end(readFileSync(fontFiles.get(url.pathname)))
    return
  }
  if (url.pathname.startsWith("/api/")) {
    let raw = ""
    for await (const chunk of req) raw += chunk
    let body = {}
    if (url.pathname === "/api/billing/overview") body = overview()
    else if (url.pathname === "/api/billing/subscription") body = { subscription: subscription(), currentPlan: state.plan === "free" ? FREE : PRO, status: "active" }
    else if (url.pathname === "/api/billing/invoices") body = { invoices: state.plan === "free" ? [] : invoices }
    else if (url.pathname === "/api/billing/subscription/cancel" && req.method === "POST") {
      state.posts.push({ path: url.pathname, body: raw ? JSON.parse(raw) : null })
      state.canceling = true
      await new Promise((r) => setTimeout(r, 300))
      body = { success: true, cancelAt: PERIOD_END }
    } else if (url.pathname === "/api/billing/subscription/resume" && req.method === "POST") {
      state.posts.push({ path: url.pathname, body: null })
      state.canceling = false
      body = { success: true, cancelAtPeriodEnd: false, renewsAt: PERIOD_END }
    } else if (url.pathname.startsWith("/api/domains")) body = { domains: [] }
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body))
    return
  }
  res.writeHead(200, { "content-type": "text/html" }).end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${typeof got === "string" ? got : JSON.stringify(got)}`}`)
  if (!ok) broken++
}
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" })
const SIZES = [
  { name: "390", width: 390, height: 844, phone: true },
  { name: "1440", width: 1440, height: 900, phone: false },
  { name: "1920", width: 1920, height: 1080, phone: false },
]

const geometry = () => {
  const box = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top + scrollY), b: Math.round(r.bottom + scrollY), w: Math.round(r.width) } }
  return {
    column: box("[data-billing-column]"),
    heading: box("[data-plan-heading-row] h2"),
    cards: box("[data-plan-cards]"),
    overview: box("[data-billing-overview]"),
    overviewGrid: box("[data-billing-overview-grid]"),
    history: box("[data-billing-history]"),
    plansSection: box("[data-billing-plans]"),
    cancel: !!document.querySelector("[data-billing-cancel]"),
    pageWidth: document.documentElement.scrollWidth,
  }
}

for (const size of SIZES) {
  console.log(`\n${size.width}x${size.height}`)
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.phone ? 3 : 1, hasTouch: size.phone, isMobile: size.phone })
  const page = await context.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))

  /* Free first: no Cancel plan. */
  Object.assign(state, { plan: "free", canceling: false, posts: [] })
  await page.goto(`${origin}/?tab=billing`)
  await page.waitForSelector("[data-billing-plan]", { timeout: 30_000 })
  await page.waitForTimeout(600)
  expect(!(await page.evaluate(geometry)).cancel, "on Free there is no Cancel plan")
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `plan-free-${size.name}.png`), fullPage: false })

  /* Pro. */
  Object.assign(state, { plan: "pro", canceling: false, posts: [] })
  await page.goto(`${origin}/?tab=billing`)
  await page.waitForSelector("[data-billing-cancel]", { timeout: 30_000 })
  await page.waitForTimeout(800)
  const g = await page.evaluate(geometry)
  expect(g.pageWidth <= size.width, "nothing wider than the screen", g.pageWidth)
  expect(g.heading.l === g.cards.l && g.cards.l === g.overviewGrid.l && g.overviewGrid.l === g.history.l, "the heading, the plan cards, the overview and the history start at one edge", [g.heading.l, g.cards.l, g.overviewGrid.l, g.history.l])
  expect(g.cards.r === g.overviewGrid.r && g.overviewGrid.r === g.history.r, "and end at one edge", [g.cards.r, g.overviewGrid.r, g.history.r])
  const gap1 = g.overview.t - g.plansSection.b
  const gap2 = g.history.t - g.overview.b
  expect(gap1 === gap2 && gap1 >= 32, "the sections are the same distance apart, with room for the cards' shadow", [gap1, gap2])
  console.log(`        column ${g.column.l}..${g.column.r} (${g.column.w}px), section gap ${gap1}px`)
  if (SHOTS) {
    await page.screenshot({ path: join(SHOTS, `plan-pro-${size.name}.png`), fullPage: false })
    await page.evaluate(() => document.querySelector("[data-billing-overview]").scrollIntoView({ block: "start" }))
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(SHOTS, `plan-pro-overview-${size.name}.png`), fullPage: false })
  }

  /* Cancel plan. */
  await page.click("[data-billing-cancel]")
  await page.waitForSelector("[data-cancel-plan-dialog]", { timeout: 10_000 })
  await page.waitForTimeout(700)
  const inSheet = await page.evaluate(() => !!document.querySelector("[data-cancel-plan-dialog]").closest("[data-app-sheet]"))
  expect(inSheet === size.phone, size.phone ? "a bottom sheet on the phone" : "a dialog on a computer")
  const until = await page.textContent("[data-cancel-until]")
  expect(/November 10, 2026/.test(until ?? ""), "the dialog says when Pro ends, from the subscription", until)
  const buttons = await page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect()
    return { keep: r("[data-cancel-keep]").bottom, confirm: r("[data-cancel-confirm]").bottom, vh: innerHeight }
  })
  expect(buttons.keep <= buttons.vh && buttons.confirm <= buttons.vh, "Keep Pro and Cancel plan are on screen without scrolling", buttons)
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `cancel-dialog-${size.name}.png`), fullPage: false })
  await page.click('[data-cancel-reason="not_selling"]')
  await page.fill("[data-cancel-note]", "Back when the shop picks up")
  if (SHOTS) {
    await page.evaluate(() => { const n = document.querySelector("[data-cancel-note]"); n.scrollIntoView({ block: "center" }); n.blur() })
    await page.waitForTimeout(200)
    await page.screenshot({ path: join(SHOTS, `cancel-dialog-filled-${size.name}.png`), fullPage: false })
  }
  await page.click("[data-cancel-confirm]")
  await page.waitForSelector("[data-billing-resume]", { timeout: 10_000 })
  await page.waitForTimeout(900)
  const sent = state.posts.find((p) => p.path.endsWith("/cancel"))
  expect(sent?.body?.reason === "not_selling" && sent?.body?.note === "Back when the shop picks up", "the reason and the note were sent", sent)
  const ends = await page.textContent("[data-billing-ends]")
  expect(/Pro until Nov 10, 2026/.test(ends ?? ""), "the overview says Pro until the date", ends)
  expect(!(await page.evaluate(geometry)).cancel, "and Cancel plan is gone while it is scheduled")
  if (SHOTS) {
    await page.evaluate(() => document.querySelector("[data-billing-overview]").scrollIntoView({ block: "start" }))
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(SHOTS, `plan-canceling-${size.name}.png`), fullPage: false })
  }

  /* Resume plan. */
  await page.click("[data-billing-resume]")
  await page.waitForSelector("[data-billing-cancel]", { timeout: 10_000 })
  expect(state.posts.some((p) => p.path.endsWith("/resume")), "Resume plan posted to the resume route, and Cancel plan is back")
  expect(errors.length === 0, "no errors on the page", errors)
  await context.close()
}

await browser.close()
server.close()
rmSync(tmp, { recursive: true, force: true })
console.log(broken ? `\n${broken} failed\n` : "\nall ok\n")
process.exit(broken ? 1 : 0)
