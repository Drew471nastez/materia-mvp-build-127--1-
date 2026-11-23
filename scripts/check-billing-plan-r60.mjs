/**
 * ===========================================================================
 *  ROUND 60: SETTINGS > PLAN AND THE PLANS PAGE'S BAR, MEASURED BESIDE /pricing
 * ===========================================================================
 * The owner: Settings > Plan draws /pricing's cards as /pricing does (the
 * same components and data, at /pricing's own card width, never squashed, no
 * cut off label, the current plan's button filled), and on the plans page
 * the logo sits at the left of the bar, on the page content's left edge.
 *
 * scripts/render-billing-plan-r60.tsx draws the three with their real
 * components. In headless Chromium at 360, 390, 768 and 1280 (2x):
 *
 *   WIDTHS     every plan card's width on /pricing, in Settings > Plan and
 *              on the plans page; Settings' cards must be /pricing's width
 *              at the same window, or /pricing's computer card (its width at
 *              1280) where the sheet's column is narrower than /pricing's
 *   LABELS     every plan button's label: its text box is not wider than
 *              the room it has (nothing cut off with an ellipsis)
 *   CURRENT    the current plan's button: filled (its background not white
 *              or clear), no outline, says Current plan
 *   SIDEWAYS   the document and the sheet's scroller are never wider than
 *              the window (the cards' own row scrolls sideways on purpose)
 *   LOGO       the plans page's logo: at the bar's left, its left edge on
 *              the cards' left edge, with Billing after it and X at the right;
 *              with a 47px side inset emulated, the bar's controls clear it
 *
 *   LABEL=before SHOTS_DIR=/dir node scripts/check-billing-plan-r60.mjs
 * Prints a JSON report at the end; exits 1 when an "after" expectation fails.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const LABEL = process.env.LABEL || "after"
const STRICT = LABEL !== "before"
const WIDTHS = (process.env.WIDTHS || "360,390,768,1280").split(",").map(Number)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : STRICT ? "FAIL" : "note"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok && STRICT) broken++
}

const stubs = mkdtempSync(join(tmpdir(), "storelib-plan-r60-"))
const shots = process.env.SHOTS_DIR || join(stubs, "shots")
mkdirSync(shots, { recursive: true })

writeFileSync(join(stubs, "navigation.js"), `const router = { push: (h) => (window.__nav ||= []).push(h), replace: (h) => (window.__nav ||= []).push(h), prefetch() {}, back() {}, refresh() {} }
export const useRouter = () => router
export const usePathname = () => location.pathname
export const useSearchParams = () => new URLSearchParams(location.search)
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) {
  return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault() } }, children)
})
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, quality, placeholder, blurDataURL, unoptimized, loader, ...rest }) { const s = typeof src === "object" && src ? src.src : src; return React.createElement("img", { src: s, alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined, ...rest }) }
`)
writeFileSync(join(stubs, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) }, from: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)

const { build } = await import("esbuild")
const compiled = (p) => join(root, "node_modules/next/dist/compiled", p)
await build({
  entryPoints: [join(root, "scripts/render-billing-plan-r60.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: {
    "@": ".",
    react: compiled("react"),
    "react-dom": compiled("react-dom"),
    "next/navigation": join(stubs, "navigation.js"),
    "@/lib/supabase/client": join(stubs, "supabase.js"),
    "next/link": join(stubs, "link.jsx"),
    "next/image": join(stubs, "image.jsx"),
  },
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl", ".webp": "dataurl", ".jpg": "dataurl" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(stubs, "app.js"), "utf8")
const css = await appCss(root)
const inter = interFaces(root).replace(/url\(file:\/\//g, "url(http://probe.test/__file")
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

/* The billing overview Settings asks for: somebody on Grow with a live subscription. */
const PLANS = [
  { id: "free", name: "Free", price_cents: 0, billing_period: null, features: [] },
  { id: "growth", name: "Growth", price_cents: 1400, billing_period: "month", features: [] },
  { id: "pro", name: "Pro", price_cents: 9900, billing_period: "month", features: [] },
]
const OVERVIEW = {
  plans: PLANS,
  currentPlan: PLANS[1],
  subscription: { id: "sub_1", status: "active", plan_id: "growth", cancel_at_period_end: false, current_period_end: "2026-12-23T00:00:00Z", pending_plan_id: null },
  invoices: [],
  paymentMethod: { brand: "visa", last4: "4242", exp_month: 4, exp_year: 2029 },
  canManage: true,
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--font-render-hinting=none"] })
const report = { label: LABEL, widths: {} }
const TYPES = { png: "image/png", svg: "image/svg+xml", webp: "image/webp", jpg: "image/jpeg", ico: "image/x-icon" }

async function open(path, viewport, { insets = null } = {}) {
  const page = await browser.newPage()
  await page.setViewport(viewport)
  const cdp = await page.createCDPSession()
  let insetOk = false
  if (insets) {
    try {
      await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets })
      insetOk = true
    } catch {
      insetOk = false
    }
  }
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const u = r.url()
    if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
    const pub = join(root, "public", decodeURIComponent(new URL(u).pathname))
    if (u.startsWith("http://probe.test/") && /\.(png|svg|webp|jpg|ico)$/.test(pub) && existsSync(pub)) return r.respond({ status: 200, contentType: TYPES[pub.split(".").pop()], body: readFileSync(pub) })
    if (u.startsWith("http://probe.test/api/billing/overview")) return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(OVERVIEW) })
    if (u.startsWith("http://probe.test/api/")) return r.respond({ status: 200, contentType: "application/json", body: "{}" })
    if (u.startsWith("http://probe.test/")) return r.respond({ status: 200, contentType: "text/html", body: html })
    if (u.startsWith("data:")) return r.continue()
    return r.respond({ status: 404, body: "" })
  })
  await page.goto(`http://probe.test${path}`, { waitUntil: "load" })
  await page.evaluate(() => document.fonts.ready)
  await sleep(1400)
  return { page, insetOk }
}

const shot = async (page, name) => {
  const file = join(shots, `${LABEL}-${name}.png`)
  await page.screenshot({ path: file })
  return file
}

/* Everything measured on one page's cards. */
const MEASURE = () => {
  const r = (el) => el.getBoundingClientRect()
  const cards = [...document.querySelectorAll("[data-plan-card]")].map((c) => ({ id: c.getAttribute("data-plan-card"), w: Math.round(r(c).width * 10) / 10 }))
  const labels = [...document.querySelectorAll("[data-plan-action]")]
    .filter((b) => r(b).width > 0)
    .map((b) => {
      const span = [...b.querySelectorAll("span")].find((s) => s.className.includes("truncate") || s.hasAttribute("data-plan-label-text")) || b
      return { text: span.textContent.trim(), cut: span.scrollWidth > span.clientWidth + 0.5, need: span.scrollWidth, room: span.clientWidth }
    })
  const cur = document.querySelector("[data-plan-current]")
  let current = null
  if (cur) {
    const s = getComputedStyle(cur)
    const bg = s.backgroundColor
    const m = bg.match(/rgba?\(([^)]+)\)/)
    const [R, G, B, A = 1] = m ? m[1].split(",").map(Number) : [255, 255, 255, 1]
    current = { text: cur.textContent.trim(), bg, filled: A > 0.5 && R + G + B < 600, border: s.borderTopWidth, outline: s.borderTopWidth !== "0px" && s.borderTopStyle !== "none" ? s.borderTopColor : null, disabled: cur.disabled }
  }
  const sc = document.querySelector("[data-settings-sheet-scroll]") || document.querySelector("[data-page-layer-scroll]")
  return {
    cards,
    labels,
    current,
    doc: { scroll: document.documentElement.scrollWidth, win: innerWidth },
    scroller: sc ? { scroll: sc.scrollWidth, client: sc.clientWidth } : null,
  }
}

for (const width of WIDTHS) {
  const phone = width < 768
  const vp = { width, height: phone ? 800 : width === 768 ? 1024 : 860, deviceScaleFactor: 2, isMobile: phone, hasTouch: phone }
  const out = (report.widths[width] = {})
  console.log(`\n── ${width}px ──`)

  /* /pricing: the cards, as the public page draws them. */
  {
    const { page } = await open("/pricing", vp)
    await page.evaluate(() => document.querySelector("[data-plan-cards]")?.scrollIntoView({ block: "center" }))
    await sleep(400)
    out.pricing = await page.evaluate(MEASURE)
    out.pricingShot = await shot(page, `pricing-${width}`)
    await page.close()
  }

  /* Settings > Plan, somebody on Grow. */
  {
    const { page } = await open("/app/settings?tab=billing", vp)
    await page.waitForSelector("[data-plan-card]", { timeout: 8000 }).catch(() => {})
    await sleep(500)
    await page.evaluate(() => {
      const sc = document.querySelector("[data-settings-sheet-scroll]")
      const h = document.querySelector("[data-billing-plans]")
      if (sc && h) sc.scrollTop += h.getBoundingClientRect().top - sc.getBoundingClientRect().top - 8
    })
    await sleep(400)
    out.settings = await page.evaluate(MEASURE)
    out.settingsShot = await shot(page, `settings-plan-${width}`)
    /* The row's far end too, where it scrolls. */
    const scrolled = await page.evaluate(() => {
      const row = document.querySelector("[data-billing-plans] [data-plan-cards]")
      if (!row || row.scrollWidth <= row.clientWidth + 1) return false
      row.style.scrollBehavior = "auto"
      row.scrollLeft = row.scrollWidth
      return true
    })
    if (scrolled) {
      await sleep(500)
      out.settingsShotEnd = await shot(page, `settings-plan-end-${width}`)
    }
    await page.close()
  }

  /* The plans page, somebody on Grow. */
  {
    const { page } = await open("/app/settings/billing/upgrade?current=growth&active=1", vp)
    await sleep(500)
    out.upgrade = await page.evaluate(MEASURE)
    out.bar = await page.evaluate(() => {
      const r = (s) => {
        const el = document.querySelector(s)
        if (!el) return null
        const b = el.getBoundingClientRect()
        return { left: Math.round(b.left * 10) / 10, right: Math.round(b.right * 10) / 10, top: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }
      }
      const ground = document.querySelector("[data-upgrade-page] [data-plan-ground]")
      const gb = ground?.getBoundingClientRect()
      return { logo: r("[data-upgrade-logo]"), back: r("[data-upgrade-back]"), close: r("[data-upgrade-close]"), bar: r("[data-upgrade-bar]"), content: gb ? { left: Math.round(gb.left * 10) / 10, right: Math.round(gb.right * 10) / 10 } : null }
    })
    out.upgradeShot = await shot(page, `upgrade-${width}`)
    await page.close()
  }

  const s = out.settings, p = out.pricing, u = out.upgrade, b = out.bar
  console.log(`  /pricing cards ${JSON.stringify(p.cards.map((c) => c.w))}, Settings ${JSON.stringify(s.cards.map((c) => c.w))}, plans page ${JSON.stringify(u.cards.map((c) => c.w))}`)
  out.desktopCard = null
  expect(s.cards.length === 3, "Settings > Plan draws three plan cards", s.cards.length)
  /* /pricing's computer card: its width at 1280 (measured once there, set by its own layout: 1180 across three with 20px between). */
  const target = width >= 768 ? 380 : p.cards[0]?.w
  expect(s.cards.every((c) => Math.abs(c.w - target) <= 1), `Settings' cards are /pricing's card width (${target}px)`, s.cards.map((c) => c.w))
  for (const [name, m] of [["Settings", s], ["plans page", u]]) {
    const cut = m.labels.filter((l) => l.cut)
    expect(cut.length === 0, `${name}: no button label cut off`, cut.length ? cut : m.labels.map((l) => l.text))
    expect(!!m.current && m.current.filled && m.current.border === "0px" && /Current plan/.test(m.current.text), `${name}: the current plan's button is filled, with no outline`, m.current)
    expect(m.doc.scroll <= m.doc.win && (!m.scroller || m.scroller.scroll <= m.scroller.client + 1), `${name}: no sideways scroll`, { doc: m.doc, scroller: m.scroller })
  }
  if (b.logo && b.content && b.back && b.close) {
    expect(Math.abs(b.logo.left - b.content.left) <= 1, "plans page: the logo's left edge is the cards' left edge", { logo: b.logo.left, cards: b.content.left })
    expect(b.logo.right <= b.back.left, "plans page: Billing comes after the logo", { logo: b.logo.right, back: b.back.left })
    expect(b.close.right <= width && b.close.left > b.back.right, "plans page: X at the right", b.close)
  } else expect(false, "plans page: bar measured", b)
}

/* Safe areas: a phone on its side with a notch at the left, and a status bar inset at the top. */
{
  const vp = { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  const { page, insetOk } = await open("/app/settings/billing/upgrade?current=growth&active=1", vp, { insets: { top: 0, left: 47, right: 47, bottom: 21 } })
  const m = await page.evaluate(() => {
    const r = (s) => document.querySelector(s)?.getBoundingClientRect()
    return { logo: r("[data-upgrade-logo]")?.left, back: r("[data-upgrade-back]")?.left, close: r("[data-upgrade-close]")?.right, win: innerWidth }
  })
  report.insets = { insetOk, ...m }
  console.log("\n── 844x390, 47px side insets ──")
  if (insetOk) {
    expect(m.logo >= 47 && m.close <= m.win - 47 + 6, "the bar's logo and X clear the side insets", m)
    report.insetShot = await shot(page, "upgrade-landscape-insets-844")
  } else console.log("  note  this Chromium cannot emulate safe area insets")
  await page.close()
}

await browser.close()
rmSync(stubs, { recursive: true, force: true })
console.log("\n" + JSON.stringify(report, null, 1))
if (broken) {
  console.log(`\n${broken} expectation(s) failed`)
  process.exit(1)
}
