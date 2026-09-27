/**
 * ===========================================================================
 *  HOW MANY OF A PHONE'S 390 PIXELS AN /app PAGE SPENDS BEFORE ITS CONTENT
 * ===========================================================================
 * "On mobile devices, reduce the left and right padding a little bit more of
 * the containers with the settings things. Reduce their padding left and
 * right, like increase their width on phones so they are more close to the
 * edges."
 *
 * A card on an /app page is inset twice. The page shell keeps a gutter
 * between the card and the glass, and the card keeps its own padding between
 * its border and the words in it. Neither is visible on its own, so the only
 * honest way to answer "how far in does the writing start" is to render the
 * real pages and read the two numbers off the boxes:
 *
 *   PAGE GUTTER   the padding-inline of the shell the cards sit in: the
 *                 nearest ancestor of the first card that has any
 *   CARD LEFT     where the card's own border is, from the left of the glass
 *   CARD PADDING  its padding-left, plus its border
 *   CONTENT LEFT  card left + padding + border: the first pixel a word can
 *                 use, and the number this whole change is about
 *
 * Read for every card-shaped box on the page, not just the first, because a
 * page mixes cards that pad themselves with rows that are meant to run edge
 * to edge, and only the first kind should move. The narrowest and widest
 * content inset on each page are both printed, so a row that is deliberately
 * full-bleed shows up as a 0 rather than hiding in an average.
 *
 * Also asserted, on every page and both widths, because a gutter is the one
 * thing standing between a wide card and a sideways scroll:
 *
 *   NO SIDEWAYS SCROLL      document.documentElement.scrollWidth is no wider
 *                           than the window
 *   NOTHING OFF THE GLASS   no card's right edge past the window
 *
 * The pages are the real ones, bundled from app/ and components/ with the
 * same stand-ins the page probes beside this one use, in a copy of the /app
 * shell's frame (the 68px header space and the .app-content-scroll pane), at
 * 390 and 360.
 *
 *   node scripts/check-app-insets.mjs
 *   INSET_SHOTS=<dir> node scripts/check-app-insets.mjs   also writes pictures
 *   INSET_JSON=<file> node scripts/check-app-insets.mjs   the table as data
 *   INSET_ONLY=settings-general,home  just those pages
 */
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".app-insets-probe")
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })

/* ── The stand-ins every entry shares ──────────────────────────────────── */
const p = (f) => join(dir, f).replace(/\\/g, "/")
writeFileSync(
  p("navigation.js"),
  `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => { log("push", h); if (window.__navigate) window.__navigate(h, "push") }, replace: (h) => log("replace", h), prefetch: (h) => log("prefetch", h), back: () => log("back"), refresh: () => log("refresh") }
export const usePathname = () => window.__path || "/app"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const useParams = () => ({})
export const redirect = () => {}
`,
)
writeFileSync(
  p("link.jsx"),
  `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, replace, scroll, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault() } }, children) })
export const useLinkStatus = () => ({ pending: false })
`,
)
writeFileSync(
  p("image.jsx"),
  `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, placeholder, blurDataURL, loader, unoptimized, quality, ...rest }) {
  return React.createElement("img", { src: typeof src === "string" ? src : "", alt: alt || "", style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" } : undefined, ...rest })
}
`,
)
writeFileSync(
  p("supabase.js"),
  `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: [], error: null, count: 0 }) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) }, from: () => q, rpc: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`,
)
/* Every name lib/native-bridge exports, answering "not a native app". */
writeFileSync(
  p("native-bridge.js"),
  `export const isNative = false
export const isNativeApp = () => false
export const isIOS = () => false
export const isAndroid = () => false
export const nativeAuthStart = () => {}
export const nativeAppReady = () => {}
export const nativeAppReadyForce = () => {}
export const setNativeAuthInProgress = () => {}
export const isNativeAuthInProgress = () => false
export const sanitizeNativeHome = (x) => x
export const cacheNativeHome = () => {}
export const getCachedNativeHome = () => null
export const nativeLogOut = async () => {}
export const nativeLogout = async () => {}
export const startNativeGoogleOAuth = async () => {}
export const handleNativeOAuthCallback = async () => {}
export const triggerHaptic = async () => {}
export const hapticTap = () => {}
export const openExternal = () => {}
`,
)
/* The description cleaner is a server action; in the browser it is what it answers. */
writeFileSync(
  p("description-action.js"),
  `import { cleanStoredHtml } from "${join(root, "lib/rich-text/html.ts").replace(/\\/g, "/")}"
export async function cleanDescription(html) { return { ok: true, html: cleanStoredHtml(String(html ?? "")) } }
`,
)

/* ── One entry per page ────────────────────────────────────────────────── */
const H = (f) => join(root, "scripts", f).replace(/\\/g, "/")

const settingsEntry = (tab) => `import { mount } from "${H("render-settings-probe.tsx")}"
import { SettingsFormNew } from "${join(root, "components/app/settings-form-new.tsx").replace(/\\/g, "/")}"
document.documentElement.classList.add("app-layout")
window.__path = "/app/settings"
window.__fixture = { tab: ${JSON.stringify(tab)} }
mount(SettingsFormNew)
`

const ordersEntry = `import React from "react"
import { createRoot } from "react-dom/client"
import { App } from "${H("render-orders-probe.tsx")}"
document.documentElement.classList.add("app-layout")
window.__path = "/app/orders"
globalThis.__probeNow = Date.now()
globalThis.__probeTz = "Europe/Bucharest"
createRoot(document.getElementById("app")).render(React.createElement(App))
window.__ran = true
`

const PAGES = [
  { id: "settings-general", label: "Settings · General", entry: settingsEntry("general"), ready: "[data-settings-panel]" },
  { id: "settings-security", label: "Settings · Security", entry: settingsEntry("security"), ready: "[data-settings-panel]" },
  { id: "settings-notifications", label: "Settings · Notifications", entry: settingsEntry("notifications"), ready: "[data-settings-panel]" },
  { id: "settings-payments", label: "Settings · Payments", entry: settingsEntry("payments"), ready: "[data-settings-panel]" },
  { id: "settings-billing", label: "Settings · Billing", entry: settingsEntry("billing"), ready: "[data-settings-panel]" },
  { id: "home", label: "Home", from: H("render-home-cards.tsx"), ready: "main, [data-home-banner], .dashboard-scroll-container" },
  { id: "products", label: "Products", from: H("render-products-probe.tsx"), ready: "[data-row]" },
  { id: "orders", label: "Orders", entry: ordersEntry, ready: ".orders-stage, table" },
  { id: "analytics", label: "Analytics", from: H("render-analytics-page.tsx"), ready: "#app div" },
  { id: "product-editor", label: "Product editor", from: H("render-product-editor.tsx"), ready: "input, textarea" },
]

const only = process.env.INSET_ONLY ? new Set(process.env.INSET_ONLY.split(",")) : null
const pages = PAGES.filter((x) => !only || only.has(x.id))

const { build } = await import("esbuild")
const css = await appCss(root)
const inter = interFaces(root)

for (const page of pages) {
  const entry = page.from ?? p(`${page.id}.tsx`)
  if (!page.from) writeFileSync(entry, page.entry)
  await build({
    entryPoints: [entry],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    platform: "browser",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: {
      "@": root,
      react: join(root, "node_modules/next/dist/compiled/react"),
      "react-dom": join(root, "node_modules/next/dist/compiled/react-dom"),
      "next/navigation": p("navigation.js"),
      "next/link": p("link.jsx"),
      "next/image": p("image.jsx"),
      "@/lib/supabase/client": p("supabase.js"),
      "@/lib/native-bridge": p("native-bridge.js"),
    },
    banner: { js: `var process={env:{NODE_ENV:"production",NEXT_PUBLIC_SUPABASE_URL:"https://placeholder.supabase.co",NEXT_PUBLIC_SUPABASE_ANON_KEY:"placeholder"}};globalThis.process=process;` },
    loader: { ".jsx": "jsx", ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    outfile: join(dir, `${page.id}.js`),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
    plugins: [
      {
        name: "server-action-stub",
        setup(b) {
          b.onResolve({ filter: /description-action$/ }, () => ({ path: p("description-action.js") }))
        },
      },
    ],
  }).catch((e) => fail(`${page.id} did not bundle: ${e.message}`))
}

const shell = (id) =>
  `<!doctype html><html class="light app-layout"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${inter}</style><style>${css}</style>` +
  `<style>html,body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script src="/${id}.js"></script></body></html>`

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  const m = /^\/([a-z-]+)\.js$/.exec(url.pathname)
  if (m) {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(readFileSync(join(dir, `${m[1]}.js`)))
  }
  if (url.pathname.startsWith("/api/")) {
    const free = { id: "free", name: "Free", price_cents: 0, billing_period: null, features: [] }
    const body = url.pathname.startsWith("/api/billing/overview")
      ? { plans: [free, { id: "growth", name: "Growth", price_cents: 2990, billing_period: "month", features: [] }, { id: "pro", name: "Pro", price_cents: 9900, billing_period: "month", features: [] }], subscription: null, currentPlan: free, invoices: [], paymentMethod: null }
      : url.pathname.startsWith("/api/domains")
        ? { domains: [] }
        : {}
    res.writeHead(200, { "content-type": "application/json" })
    return res.end(JSON.stringify(body))
  }
  const id = url.pathname.replace(/^\/+|\/+$/g, "") || pages[0].id
  res.writeHead(200, { "content-type": "text/html" })
  res.end(shell(id))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

/*
  WHAT COUNTS AS A CARD. Not a class name: the pages were written over two
  years and no one class marks them. A card is what a reader sees as one —
  a box with a corner radius, a surface of its own, most of the width of the
  page, tall enough to hold something — so that is what this looks for, and
  the boxes that fail it (a full-bleed row, a table's scroller) are counted
  separately rather than quietly dropped.
*/
const READ = () => {
  const win = window.innerWidth
  const n = (v) => Math.round(parseFloat(v) || 0)
  const solid = (c) => c && c !== "transparent" && !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(c)
  const cards = []
  const wide = []
  for (const el of document.querySelectorAll("div,section,form,article,li,fieldset")) {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === "hidden" || cs.display === "none" || cs.position === "fixed") continue
    /* Past the right edge only counts when nothing above it clips or scrolls
       sideways: a tab bar is meant to be wider than its scroller. */
    if (r.right > win + 0.5) {
      let held = false
      for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX
        if (ox !== "visible") { held = true; break }
      }
      if (!held) wide.push({ cls: el.className.toString().slice(0, 60), left: Math.round(r.left * 10) / 10, right: Math.round(r.right * 10) / 10 })
    }
    if (r.width < win * 0.5 || r.height < 36) continue
    if (n(cs.borderTopLeftRadius) < 8) continue
    if (!solid(cs.backgroundColor) && n(cs.borderTopWidth) === 0) continue
    /* A card inside a card (a nested panel) is read too, but the page's own
       gutter is read from the outermost one. */
    const bl = n(cs.borderLeftWidth)
    const br = n(cs.borderRightWidth)
    cards.push({
      cls: el.className.toString().slice(0, 48),
      left: Math.round(r.left * 10) / 10,
      right: Math.round(r.right * 10) / 10,
      width: Math.round(r.width * 10) / 10,
      padL: n(cs.paddingLeft),
      padR: n(cs.paddingRight),
      border: bl,
      contentL: Math.round((r.left + bl + n(cs.paddingLeft)) * 10) / 10,
      contentR: Math.round((win - r.right + br + n(cs.paddingRight)) * 10) / 10,
      depth: (() => {
        let d = 0
        for (let a = el.parentElement; a; a = a.parentElement) d++
        return d
      })(),
      el,
    })
  }
  /* The page's gutter: the nearest ancestor of the shallowest card that pads sideways. */
  let gutter = null
  let gutterCls = null
  const first = cards.slice().sort((a, b) => a.depth - b.depth)[0]
  if (first) {
    for (let a = first.el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a)
      const pl = n(cs.paddingLeft)
      if (pl > 0) {
        gutter = pl
        gutterCls = a.className.toString().slice(0, 48)
        break
      }
    }
    if (gutter === null) {
      /* No padded ancestor: the card is held off the edge by its own margin. */
      gutter = Math.round(first.left * 10) / 10
      gutterCls = "(margin)"
    }
  }
  for (const c of cards) delete c.el
  return {
    win,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    gutter,
    gutterCls,
    cards,
    wide: wide.slice(0, 8),
    cardCount: cards.length,
  }
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--font-render-hinting=none"], headless: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const shots = process.env.INSET_SHOTS
if (shots) mkdirSync(shots, { recursive: true })

const rows = []
const problems = []
for (const page of pages) {
  /* The two phones this change is about. INSET_WIDTHS=768,1280 adds a tablet
     and a computer, to show they did not move. */
  const widths = [
    ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
    ["360", { width: 360, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
    ...(process.env.INSET_WIDTHS ?? "")
      .split(",")
      .filter(Boolean)
      .map((w) => [w.trim(), { width: Number(w), height: 900, deviceScaleFactor: 1 }]),
  ]
  for (const [label, vp] of widths) {
    const tab = await browser.newPage()
    await tab.setViewport(vp)
    const errors = []
    tab.on("pageerror", (e) => errors.push(String(e)))
    await tab.goto(`${origin}/${page.id}`, { waitUntil: "load" })
    try {
      await tab.waitForSelector(page.ready, { timeout: 12_000 })
    } catch {
      problems.push(`${page.id} @${label}: never showed ${page.ready}${errors.length ? ` — ${errors[0]}` : ""}`)
    }
    await wait(900)
    const read = await tab.evaluate(READ)
    if (shots) await tab.screenshot({ path: join(shots, `${page.id}-${label}.png`) })
    if (read.scrollWidth > read.win) problems.push(`${page.id} @${label}: the page scrolls sideways (scrollWidth ${read.scrollWidth} > ${read.win})`)
    if (read.wide.length) problems.push(`${page.id} @${label}: ${read.wide.length} box(es) past the right edge — ${JSON.stringify(read.wide[0])}`)
    /* A card is a box at least half the window wide (see READ). From 1024 a
       page may lay its cards in columns narrower than that — the product
       editor's two — so at those widths an empty reading is the rule's own
       limit, not the page's, and it is printed rather than refused. */
    if (!read.cardCount && vp.width < 1024) problems.push(`${page.id} @${label}: no card-shaped box found`)
    const insets = read.cards.map((c) => c.contentL)
    const lefts = read.cards.map((c) => c.left)
    rows.push({
      page: page.label,
      id: page.id,
      w: label,
      gutter: read.gutter,
      gutterCls: read.gutterCls,
      cards: read.cardCount,
      cardLeft: lefts.length ? Math.min(...lefts) : null,
      padMin: read.cards.length ? Math.min(...read.cards.map((c) => c.padL)) : null,
      padMax: read.cards.length ? Math.max(...read.cards.map((c) => c.padL)) : null,
      insetMin: insets.length ? Math.min(...insets) : null,
      insetMax: insets.length ? Math.max(...insets) : null,
      errors: errors.slice(0, 2),
    })
    await tab.close()
  }
}

await browser.close()
server.close()
rmSync(dir, { recursive: true, force: true })

const pad = (s, n) => String(s ?? "—").padEnd(n)
const num = (s, n) => String(s ?? "—").padStart(n)
console.log("\n  PAGE                      W     GUTTER  CARD@   CARD PAD   CONTENT STARTS AT")
console.log("  " + "─".repeat(78))
for (const r of rows) {
  console.log(
    `  ${pad(r.page, 24)} ${num(r.w, 4)}  ${num(r.gutter, 6)}  ${num(r.cardLeft, 5)}  ${num(r.padMin, 4)}–${num(r.padMax, 3)}   ${num(r.insetMin, 5)}–${num(r.insetMax, 4)}  (${r.cards} cards)`,
  )
}
console.log("  " + "─".repeat(78))
console.log("  GUTTER = the page shell's padding-left. CARD@ = the leftmost card's border.")
console.log("  CONTENT STARTS AT = card border + its border-width + its padding-left.\n")
for (const r of rows) if (r.errors.length) console.log(`  ! ${r.id} @${r.w}: ${r.errors.join(" | ")}`)

if (process.env.INSET_JSON) writeFileSync(process.env.INSET_JSON, JSON.stringify(rows, null, 2))

if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n` + problems.map((x) => `  • ${x}`).join("\n") + "\n")
  process.exit(1)
}
console.log("  Nothing scrolls sideways and nothing is off the glass.\n")
