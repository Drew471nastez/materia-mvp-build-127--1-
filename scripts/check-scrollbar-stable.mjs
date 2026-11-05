/**
 * ===========================================================================
 *  THE PAGE'S BOX AND THE SCROLLBAR DO NOT MOVE WHEN AN /app PAGE SWAPS
 * ===========================================================================
 * "Each time I switch between pages in /app on desktop large screens, the
 * scrollbar on the right side of the screen is bumping." Then, after the
 * first fix: "Still when I switch between /app pages it glitches: the scroll
 * bar there popping and then closing. [...] the Products page for example
 * doesn't have a scroll bar, but when I switch to the Orders page it has a
 * scroll bar because it's needed."
 *
 * A classic scrollbar (a Mac with a mouse or "Show scroll bars: Always",
 * Windows, Linux) takes a column of layout, so every frame in which one
 * appears or goes moves the page beside it. This runs with REAL scrollbars:
 * no `--hide-scrollbars`, which puppeteer adds by default and which makes
 * every number here zero.
 *
 * The real AppStage and top bar over a shell shaped like app/(storelib)/app/layout.tsx
 * (scripts/render-scrollbar-stable.tsx), with the REAL Dashboard, Products
 * (three products, nothing to scroll), Orders (a hundred and thirty), Emails,
 * Coupons, Analytics, Payouts, Settings, Customers, the website list and the
 * product editor in it, and stand-ins for two edge cases. At 1280, 1440 and
 * 1920, between the four from the report, every pair both ways and Back
 * after each, plus the older route through the rest, reading every
 * animation frame:
 *
 *   THE BOX STAYS PUT       the box the page is laid out in (the client box
 *                           of whatever scrolls it) has the same left edge
 *                           and width in every frame, on every page
 *   THE TRACK STAYS PUT     the scrollbar column is the same width at the
 *                           same x in every frame, on every page, and it is
 *                           painted in every frame (it never comes and goes)
 *   THE BAR HOLDS STILL     the scrollbar is never faded or moved by the
 *                           page's landing: the page rises into place, its
 *                           scrollbar does not
 *   NO THUMB FLASH          a page's thumb shows at most once, and never
 *                           shows and goes (the rise tipping a page that fits
 *                           over the edge)
 *   ONE TRACK               nothing inside a page paints a second, empty
 *                           track of its own (Settings' billing tab did)
 *   NOTHING ELSE SCROLLS    <html> never takes a scrollbar, nothing is wider
 *                           than the window, the document never scrolls
 *   BACK                    the page is where it was on its first frame
 *
 *   node scripts/check-scrollbar-stable.mjs
 *   AUDIT=1 node scripts/check-scrollbar-stable.mjs   (the table: every page,
 *     short and long, at 1280, 1440 and 1920: what scrolls it, its gutter, its box)
 *   WIDTHS=1440 ...         one width only
 *   SWAP=@/components/app/app-stage=<file>,... ...   measure other copies of
 *     modules (an older commit's) in place of this checkout's
 *   STYLESHEET=<file> ...   measure another copy of app/globals.css (an older
 *     commit's) over this checkout's components
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".scrollbar-probe")
mkdirSync(dir, { recursive: true })
/* The router: the address is a store the probe commits to after a delay, as
   Next.js commits a page when it is ready. A page that writes the address
   itself (an order, an email, a tab) is synced at once, as Next.js syncs
   pushState into useSearchParams. */
writeFileSync(join(dir, "navigation.js"), `import { useSyncExternalStore } from "react"
const subs = new Set()
let href = location.pathname + location.search
const notify = () => { for (const f of [...subs]) f() }
globalThis.__commit = (next) => { href = next; notify() }
const push = history.pushState.bind(history), replace = history.replaceState.bind(history)
globalThis.__commitHistory = push
history.pushState = (...a) => { push(...a); href = location.pathname + location.search; notify() }
history.replaceState = (...a) => { replace(...a); href = location.pathname + location.search; notify() }
const sub = (f) => { subs.add(f); return () => subs.delete(f) }
const read = () => href
export const usePathname = () => useSyncExternalStore(sub, () => read().split("?")[0], () => "/app")
export const useSearchParams = () => new URLSearchParams(useSyncExternalStore(sub, () => read().split("?")[1] || "", () => ""))
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() { history.back() } })
export const useParams = () => ({})
export const useSelectedLayoutSegment = () => null
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, prefetch, replace, scroll, onClick, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest, onClick: (e) => { e.preventDefault(); onClick && onClick(e) } }) })
`)
writeFileSync(join(dir, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, quality, placeholder, blurDataURL, unoptimized, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : "", alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined, ...rest }) }
`)
/* Supabase: every read answers from window.__tables. */
writeFileSync(join(dir, "supabase.js"), `function answer(table, one) {
  return new Promise((r) => setTimeout(() => {
    const rows = (window.__tables && window.__tables[table]) || []
    r({ data: one ? rows[0] ?? null : rows, error: null, count: rows.length })
  }, 60))
}
function chain(table) {
  let one = false
  const p = new Proxy(function () {}, {
    get(_, key) {
      if (key === "then") { const pr = answer(table, one); return pr.then.bind(pr) }
      if (key === "single" || key === "maybeSingle") return () => { one = true; return p }
      return () => p
    },
    apply() { return p },
  })
  return p
}
export function createClient() {
  return {
    from: (t) => chain(t),
    rpc: (t) => chain(t),
    channel: () => { const c = { on: () => c, subscribe: () => c, unsubscribe: () => {} }; return c },
    removeChannel: () => {},
    storage: { from: () => chain("storage") },
    auth: {
      getUser: async () => ({ data: { user: { id: "u1", email: "ana@example.com" } } }),
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({}),
    },
  }
}
export function isNativePlatform() { return false }
`)
writeFileSync(join(dir, "request-scope.js"), `export const currentUserForRequest = async () => ({ user: { id: "u1", email: "ana@example.com" } })
export const creatorForRequest = async () => ({ id: "c1", user_id: "u1", slug: "ana" })
export const profileForRequest = async () => null
`)
writeFileSync(join(dir, "admin.js"), `const rows = {
  customers: Array.from({ length: 30 }, (_, i) => ({ id: "cu" + i, email: "buyer" + i + "@example.com", name: "Buyer " + i, created_at: new Date(Date.now() - i * 86400000).toISOString() })),
  products: [{ id: "p1" }],
  orders: [],
}
function chain(table) {
  const p = new Proxy(function () {}, {
    get(_, key) {
      if (key === "then") { const pr = Promise.resolve({ data: rows[table] || [], error: null }); return pr.then.bind(pr) }
      return () => p
    },
    apply() { return p },
  })
  return p
}
export function createAdminClient() { return { from: (t) => chain(t) } }
`)
try {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-scrollbar-stable.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://probe.invalid"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="probe-anon-key"',
    "--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN=undefined",
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:next/image=${join(dir, "image.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@/lib/supabase/admin=${join(dir, "admin.js")}`,
    `--alias:@/lib/auth/request-scope=${join(dir, "request-scope.js")}`,
    `--alias:server-only=${join(dir, "admin.js")}`,
    ...(process.env.SWAP ? process.env.SWAP.split(",").map((pair) => `--alias:${pair}`) : []),
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, NODE_PATH: join(root, "node_modules") } })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const stylesheet = process.env.STYLESHEET || null
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${await appCss(root, stylesheet)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8").replace(/<\/script/gi, "<\\/script")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

const server = createServer((_, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(html) })
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

/* Real, classic scrollbars: puppeteer hides them unless told not to. */
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const VIEWPORTS = [
  ["1280", { width: 1280, height: 800, deviceScaleFactor: 1 }],
  ["1440", { width: 1440, height: 900, deviceScaleFactor: 1 }],
  ["1920", { width: 1920, height: 1080, deviceScaleFactor: 1 }],
].filter(([label]) => !process.env.WIDTHS || process.env.WIDTHS.split(",").includes(label))

/*
 * ONE READING. Everything that scrolls a page: the shell's scroller and any
 * box in it at least half its height that scrolls (a page's own scroller, a
 * pane of the orders stage). The page is laid out in the client box of the
 * innermost one showing; the scrollbar column is whatever lies between that
 * box's right edge and the window's.
 */
const READ = `(() => {
  const outer = document.querySelector(".app-content-scroll")
  if (!outer) return null
  const oh = outer.clientHeight
  const cands = [outer, ...outer.querySelectorAll(":scope > *, :scope > * > *, :scope > * > * > *, .orders-pane, [data-page-layer-scroll] > .page-scroll")]
  const seen = new Set()
  const scrollers = []
  for (const el of cands) {
    if (seen.has(el)) continue
    seen.add(el)
    const cs = getComputedStyle(el)
    if (!/(auto|scroll)/.test(cs.overflowY)) continue
    if (el !== outer) {
      if (cs.visibility === "hidden" || cs.display === "none") continue
      /* A page's scroller is as tall as the shell's, or shorter and scrolling.
         A box that is only as tall as what is in it (overflow-x: hidden makes
         a y of auto) is not one: it has nowhere to scroll to. */
      const full = Math.abs(el.offsetHeight - oh) <= 1
      if (!full && !(el.scrollHeight > el.clientHeight + 1 && el.offsetHeight <= oh + 1 && el.offsetHeight >= oh / 2)) continue
    }
    scrollers.push(el)
  }
  /* The innermost showing: the last one in the list that is not an ancestor of another. */
  const inner = scrollers.filter((a) => !scrollers.some((b) => b !== a && a.contains(b))).pop() || outer
  const r = inner.getBoundingClientRect()
  const cs = getComputedStyle(inner)
  const left = r.left + inner.clientLeft
  const right = left + inner.clientWidth
  /* The bar that shows: on the innermost scroller that has a column, or the shell. */
  let barEl = null
  for (const el of [inner, ...scrollers.filter((s) => s.contains(inner) && s !== inner).reverse()]) {
    const g = el.offsetWidth - el.clientWidth - el.clientLeft - (parseFloat(getComputedStyle(el).borderRightWidth) || 0)
    if (g > 0) { barEl = el; break }
  }
  const bcs = barEl ? getComputedStyle(barEl) : null
  /* A painted track: overflow-y scroll always paints one; auto only when there is somewhere to go. */
  const painted = !!barEl && (bcs.overflowY === "scroll" || (bcs.overflowY === "auto" && barEl.scrollHeight > barEl.clientHeight))
  const thumb = !!barEl && /(auto|scroll)/.test(bcs.overflowY) && barEl.scrollHeight > barEl.clientHeight
  /* Whatever the landing does to the bar: its box's own and its ancestors' opacity and translation. */
  let opacity = 1, shift = 0
  for (let el = barEl; el && el !== document.body; el = el.parentElement) {
    const s = getComputedStyle(el)
    opacity *= Number(s.opacity)
    if (s.translate && s.translate !== "none") shift += parseFloat(s.translate.split(" ")[1] || "0") || 0
    if (s.transform && s.transform !== "none") shift += new DOMMatrixReadOnly(s.transform).m42
  }
  /* An order or an email fading in over its list (app/(storelib)/app/orders/order-motion.ts):
     the list's own track is drawn under it, still, at full strength, in the
     same column, so what the eye sees is the track, and the two thumbs
     crossing. */
  const list = barEl && barEl.classList.contains("orders-detail") ? barEl.parentElement.querySelector(":scope > .orders-list") : null
  if (list && getComputedStyle(list).visibility !== "hidden" && getComputedStyle(list).overflowY === "scroll") opacity = 1
  const name = (el) => el === outer ? "shell" : (el.className && typeof el.className === "string"
    ? (el.className.match(/orders-(list|detail)|page-scroll|dashboard-scroll-container|orders-pane/g) || ["box"]).slice(0, 2).join(".")
    : "box")
  /* A second track: a box in the page, not one of the page's scrollers, that
     always paints one (overflow-y: scroll) with a column for it. */
  let stray = 0
  for (const el of outer.querySelectorAll("*")) {
    if (scrollers.includes(el) || el.offsetWidth - el.clientWidth <= 0) continue
    const s = getComputedStyle(el)
    if (s.overflowY === "scroll" && s.visibility !== "hidden") stray++
  }
  const de = document.documentElement
  const h1 = [...document.querySelectorAll(".app-content-scroll h1")].find((h) => h.getBoundingClientRect().width > 0 && getComputedStyle(h).visibility !== "hidden")
  return {
    /* The page on screen: the address the router last committed, not the
       browser's, which a Back changes before the page it names is drawn. */
    path: outer.dataset.shown || location.pathname + location.search,
    scroller: name(inner),
    left: Math.round(left * 10) / 10,
    width: Math.round(inner.clientWidth * 10) / 10,
    column: Math.round((innerWidth - right) * 10) / 10,
    columnAt: Math.round(right * 10) / 10,
    bar: barEl ? name(barEl) : "none",
    painted,
    thumb,
    /* Drawn: the stage draws a thumb clear while a page that fitted rises. */
    thumbShown: thumb && !barEl.hasAttribute("data-app-landing"),
    barOpacity: Math.round(opacity * 100) / 100,
    barShift: Math.round(shift * 10) / 10,
    h1: h1 ? Math.round(h1.getBoundingClientRect().left) : null,
    stray,
    htmlGutter: innerWidth - de.clientWidth,
    wide: Math.max(de.scrollWidth, document.body.scrollWidth) > innerWidth,
    docScroll: window.scrollY + de.scrollTop + document.body.scrollTop,
    shellTop: outer.scrollTop,
    innerTop: inner === outer ? null : inner.scrollTop,
  }
})()`

async function open(viewport, url) {
  const page = await browser.newPage()
  await page.setViewport(viewport)
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.goto(url)
  await page.waitForSelector(".app-content-scroll > *")
  return { page, errors }
}

/* ── THE AUDIT ─────────────────────────────────────────────────────────── */
const AUDIT = [
  "/app", "/app/products", "/app/orders", "/app/orders?order=ord-0003", "/app/coupons", "/app/analytics", "/app/payouts",
  "/app/emails", "/app/emails?tab=published", "/app/emails?tab=flows", "/app/emails?tab=published&email=00000000-0000-4000-8000-000000000001",
  "/app/website-builder", "/app/settings", "/app/settings?tab=security", "/app/settings?tab=billing", "/app/customers", "/app/sites", "/app/products/x",
]
if (process.env.AUDIT) {
  const rows = []
  for (const [label, viewport] of VIEWPORTS) {
    for (const path of AUDIT) {
      for (const v of ["short", "long"]) {
        const url = `${base}${path}${path.includes("?") ? "&" : "?"}v=${v}`
        const { page, errors } = await open(viewport, url)
        await wait(1100)
        const r = await page.evaluate(READ)
        const threw = await page.evaluate(() => window.__threw || null)
        rows.push({ at: label, page: path, v, scroller: r.scroller, bar: r.bar, track: r.painted ? "painted" : r.column > 0 ? "reserved" : "none", thumb: r.thumb, stray: r.stray, box: `${r.left}/${r.width}`, column: `${r.column}@${r.columnAt}`, h1: r.h1, ...(threw || errors.length ? { error: String(threw || errors[0]).slice(0, process.env.VERBOSE ? 400 : 80) } : {}) })
        await page.close()
      }
    }
  }
  await browser.close()
  server.close()
  const pad = (s, n) => String(s).padEnd(n)
  console.log(pad("at", 5) + pad("page", 62) + pad("v", 6) + pad("scroller", 30) + pad("bar", 22) + pad("track", 9) + pad("thumb", 6) + pad("extra", 6) + pad("box", 12) + pad("column", 12) + "h1")
  for (const r of rows) console.log(pad(r.at, 5) + pad(r.page, 62) + pad(r.v, 6) + pad(r.scroller, 30) + pad(r.bar, 22) + pad(r.track, 9) + pad(r.thumb ? "yes" : "", 6) + pad(r.stray || "", 6) + pad(r.box, 12) + pad(r.column, 12) + (r.h1 ?? "") + (r.error ? `  ERROR ${r.error}` : ""))
  const boxes = new Set(rows.map((r) => `${r.at} ${r.box} ${r.column}`))
  console.log(`\ndistinct page boxes: ${[...boxes].join(" | ")}`)
  process.exit(0)
}

/* ── THE SWAPS ─────────────────────────────────────────────────────────── */
const problems = []
const report = {}
const FOUR = ["/app/products", "/app/orders", "/app/emails", "/app"]

for (const [label, viewport] of VIEWPORTS) {
  const { page, errors } = await open(viewport, `${base}/app/sites`)
  await wait(600)
  await page.evaluate((READ) => {
    const read = new Function(`return ${READ}`)
    window.__rec = []
    const tick = (t) => {
      const r = read()
      if (r) window.__rec.push({ t, ...r })
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, READ)
  const now = () => page.evaluate(() => performance.now())
  const since = (t0) => page.evaluate((t0) => window.__rec.filter((r) => r.t >= t0), t0)

  const navs = []
  async function step(name, act, delay = 80, settle = 520) {
    await page.evaluate((d) => { window.__delay = d }, delay)
    const t0 = await now()
    await page.evaluate(act)
    await wait(delay + settle)
    const rec = await since(t0)
    navs.push({ name: `${String(navs.length + 1).padStart(2, "0")} ${name}`, rec })
    return rec
  }
  const go = (to, delay) => step(`to ${to}`, `document.querySelector('a[data-to="${to}"]').click()`, delay)
  const back = (name) => step(name, "history.back()")
  const scrollPage = (top) => page.evaluate((top) => {
    const outer = document.querySelector(".app-content-scroll")
    const inner = [...outer.querySelectorAll(":scope > *, .orders-list")].reverse().find((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight)
    const el = inner || outer
    el.scrollTop = top
    return el.scrollTop
  }, top)

  /* The four from the report: every pair, both ways, and Back after each. */
  await go("/app/products")
  for (let i = 0; i < FOUR.length; i++) {
    for (let j = 0; j < FOUR.length; j++) {
      if (i === j) continue
      await go(FOUR[i])
      await go(FOUR[j])
      await back(`back to ${FOUR[i]}`)
    }
  }

  /* Scrolled, away, and Back: the page is where it was on its first frame. */
  await go("/app/settings")
  const settingsAt = await scrollPage(600)
  await wait(100)
  await go("/app/sites")
  const backToSettings = await back("back to /app/settings")
  await go("/app/orders")
  const ordersAt = await scrollPage(500)
  await wait(100)
  await go("/app/products")
  const backToOrders = await back("back to /app/orders")

  /* An order over the list and back; an email over the list and back. */
  await step("open an order", `document.querySelector(".orders-list tr[data-order-id]")?.click()`, 0, 600)
  await back("back from the order")
  await go("/app/emails")
  await step("to the Sent tab", `[...document.querySelectorAll("button")].find((b) => /^Sent/.test(b.textContent.trim()))?.click()`, 0, 700)
  await step("open an email", `document.querySelector(".orders-list tr[data-campaign-row]")?.click()`, 0, 800)
  await back("back from the email")

  /* The rest of the route: short and long pages the shell scrolls, the edge
     case the rise tips over, a slow page, and the product editor. */
  await go("/app/fits")
  await go("/app/coupons")
  await go("/app/analytics")
  await go("/app/payouts")
  await go("/app/website-builder")
  await go("/app/customers")
  await go("/app/settings", 1300)
  /* Settings' tabs, Billing among them: drawn inside the page, no track of their own. */
  for (const tab of ["Billing", "Security", "General"]) await step(`to Settings, ${tab}`, `[...document.querySelectorAll("[data-settings-tabs] button")].find((b) => b.textContent.trim() === "${tab}")?.click()`, 0, 700)
  await go("/app/products/x")
  await back("back from the editor")
  await go("/app/products")
  await go("/app/products/x")
  await go("/app/orders")

  const all = navs.flatMap((n) => n.rec)
  const ref = all[0]
  const summary = {}
  for (const n of navs) {
    const rec = n.rec
    const moved = rec.filter((r) => r.left !== ref.left || r.width !== ref.width)
    const column = rec.filter((r) => r.column !== ref.column || r.columnAt !== ref.columnAt)
    const unpainted = rec.filter((r) => !r.painted)
    const carried = rec.filter((r) => r.thumb && (r.barOpacity !== 1 || r.barShift !== 0))
    const strays = n.rec.filter((r) => r.stray > 0)
    /* A thumb that shows and goes again on the same page is a flash. */
    const runs = []
    for (const r of n.rec) { const k = `${r.path}|${r.thumbShown}`; if (runs[runs.length - 1] !== k) runs.push(k) }
    const byPage = {}
    for (const k of runs) { const [p, v] = k.split("|"); (byPage[p] ??= []).push(v === "true") }
    /* A page finding out it is long (its data arriving) shows a thumb once and
       keeps it. A thumb that shows and goes (the rise tipping a page that fits
       over the edge), or goes and comes back, is a flash. */
    const flashed = Object.values(byPage).filter((v) => v.length > 2 || (v.length === 2 && v[0] && !v[1])).length
    const bars = []
    for (const r of n.rec) { const s = `${r.bar}${r.thumb ? "+thumb" : ""}`; if (bars[bars.length - 1] !== s) bars.push(s) }
    summary[n.name] = {
      frames: n.rec.length,
      boxMoved: moved.length,
      columnMoved: column.length,
      trackMissing: unpainted.length,
      barCarried: carried.length,
      extraTracks: strays.length,
      thumbFlashes: flashed,
      thumb: runs.join(" > "),
      bars: bars.join(" > "),
      ...(moved.length ? { seen: [...new Set(moved.map((r) => `${r.path}:${r.scroller}:${r.left}/${r.width}`))].slice(0, 3) } : {}),
    }
    const at = `${label} ${n.name}:`
    if (moved.length) problems.push(`${at} the page's box moved in ${moved.length} of ${n.rec.length} frames (${summary[n.name].seen.join(", ")}; it is ${ref.left}/${ref.width})`)
    if (column.length) problems.push(`${at} the scrollbar column changed in ${column.length} frames (${[...new Set(column.map((r) => `${r.path}:${r.column}px@${r.columnAt}`))].slice(0, 3).join(", ")}; it is ${ref.column}px at ${ref.columnAt})`)
    if (unpainted.length) problems.push(`${at} no scrollbar track was painted in ${unpainted.length} frames (${[...new Set(unpainted.map((r) => `${r.path}:${r.bar}`))].slice(0, 3).join(", ")})`)
    if (flashed) problems.push(`${at} the thumb came and went: ${runs.join(" > ")}`)
    if (strays.length) problems.push(`${at} a second, empty track was painted inside the page in ${strays.length} frames (${[...new Set(strays.map((r) => r.path))].join(", ")})`)
    if (carried.length) problems.push(`${at} the scrollbar moved with the page in ${carried.length} frames (${[...new Set(carried.map((r) => `${r.path}:${r.bar} opacity ${r.barOpacity} shift ${r.barShift}`))].slice(0, 3).join(", ")})`)
  }
  const htmlBars = all.filter((r) => r.htmlGutter !== 0).length
  const wide = all.filter((r) => r.wide).length
  const docScrolled = all.filter((r) => r.docScroll !== 0).length
  if (htmlBars) problems.push(`${label}: <html> took a scrollbar in ${htmlBars} frames`)
  if (wide) problems.push(`${label}: something was wider than the window in ${wide} frames`)
  if (docScrolled) problems.push(`${label}: the document scrolled in ${docScrolled} frames`)
  const firstOf = (rec, path) => rec.find((r) => r.path.split("?")[0] === path)
  const settingsBack = firstOf(backToSettings, "/app/settings")
  const ordersBack = firstOf(backToOrders, "/app/orders")
  const topOf = (r) => r ? (r.innerTop ?? r.shellTop) : undefined
  if (!(settingsAt > 0) || topOf(settingsBack) !== settingsAt) problems.push(`${label}: Back to Settings showed its first frame at ${topOf(settingsBack)}, not ${settingsAt}`)
  if (!(ordersAt > 0) || topOf(ordersBack) !== ordersAt) problems.push(`${label}: Back to Orders showed its first frame at ${topOf(ordersBack)}, not ${ordersAt}`)
  const threw = await page.evaluate(() => window.__threw || null)
  if (threw) problems.push(`${label}: a page threw: ${threw.join("; ")}`)
  if (errors.length) problems.push(`${label}: the page threw: ${errors[0]}`)
  const total = (k) => Object.values(summary).reduce((s, n) => s + n[k], 0)
  report[label] = {
    box: `${ref.left}/${ref.width}`,
    column: `${ref.column}px at x=${ref.columnAt}`,
    frames: all.length,
    boxMovedFrames: total("boxMoved"),
    columnMovedFrames: total("columnMoved"),
    trackMissingFrames: total("trackMissing"),
    barCarriedFrames: total("barCarried"),
    extraTrackFrames: total("extraTracks"),
    thumbFlashes: total("thumbFlashes"),
    htmlScrollbarFrames: htmlBars,
    widerThanWindowFrames: wide,
    backFirstFrame: { settings: `${topOf(settingsBack)} (left at ${settingsAt})`, orders: `${topOf(ordersBack)} (left at ${ordersAt})` },
    navigations: process.env.VERBOSE ? summary : undefined,
  }
  await page.close()
}

await browser.close()
server.close()
console.log(JSON.stringify(report, null, 1))
if (problems.length) fail(problems.slice(0, 60).join("\n") + (problems.length > 60 ? `\n...and ${problems.length - 60} more` : ""))
console.log("ok: at 1280, 1440 and 1920 with classic scrollbars, the page's box and the scrollbar track never move or come and go while pages swap, both ways and on Back, and the bar never moves with the page")
