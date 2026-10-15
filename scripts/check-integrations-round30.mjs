/**
 * ===========================================================================
 *  ROUND 30: THE INTEGRATIONS PAGE, MEASURED
 * ===========================================================================
 * The real Integrations page in the real /app shell (scripts/render-
 * integrations-round30.tsx: sidebar, NavigationLoadingBar, AppStage), with a
 * router that moves the address for real, in headless Chromium:
 *
 *   how it works   at the bar's right from 640px, across from the title;
 *                  on a phone the last words of the line under the title,
 *                  with no row of its own
 *   the pills      All, Reviews, Analytics, Installed, Storelib apps,
 *                  Advertising, Email marketing, Automation, then the rest
 *                  in the catalog's order; each pill's number is its cards
 *   All, mixed     no block of Storelib's own at the top: the first row is
 *                  one of each lane, no lane twice in a row while another
 *                  has a card left, Coming soon last; a category reads
 *                  Storelib's own first, working, then Coming soon
 *   in and out     an integration's page and back, and one of Storelib's
 *                  apps (a page of its own) and Back: every frame filmed
 *                  (screencast pixels and the DOM), none blank, no grey
 *                  loading box when the answer is kept, the pill and the
 *                  scroll as they were, no landing on the way back, and
 *                  the app's page prefetched on a hover
 *
 *   PROBE_CSS=source node scripts/check-integrations-round30.mjs
 *
 * Pictures go to SHOTS_DIR (.round30-shots) to look at.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const stubs = join(root, ".integrations-round30-probe")
const shots = process.env.SHOTS_DIR || join(root, ".round30-shots")
mkdirSync(shots, { recursive: true })
mkdirSync(stubs, { recursive: true })
const ORIGIN = "https://storelib.com"
let broken = 0
const report = {}
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const API = {
  "/api/store/integrations/installed": { installed: [] },
  "/api/store/integrations": { tracking: { ga4: "G-TEST123" }, ready: true, ga: null },
  "/api/physical/integrations": {
    integrations: [
      { provider: "printful", status: "connected", url: null, keyHint: "1234", secretHint: null, lastSyncAt: null, lastError: null },
      { provider: "custom_webhook", status: "disconnected", url: null, keyHint: null, secretHint: null, lastSyncAt: null, lastError: null },
    ],
  },
  "/api/store/integrations/marketing": { marketing: [{ provider: "klaviyo", connected: true, keyHint: "abcd", account: "Mara", listId: "L1", listName: "News", lastError: null }] },
  "/api/store/integrations/apps": { states: { "storelib-email-marketing": "on", "storelib-markets": "setup", "storelib-code": "off", "storelib-bundles": "on", "storelib-reviews": "on", "courier-tracking": "on" }, hrefs: {} },
  "/api/store/integrations/catalog": { overrides: [] },
  /* The shapes lib/reviews/app-settings and the tracking panel read. */
  "/api/store/reviews-app": {
    ready: true,
    counts: { pending: 0, published: 12, asked: 30 },
    settings: {
      enabled: true, enabledAt: null, publish: "auto", minStars: 1, photos: true, who: "verified",
      request: { enabled: true, digitalDays: 7, physicalDays: 7, physicalFrom: "delivered", reminder: true, reminderDays: 7 },
      display: { starColor: "#f5a623", showVerified: true, showDate: true, showPhotos: true, showCardRating: true, productPage: true, sort: "featured", perPage: 6 },
      editDays: 30,
    },
  },
  "/api/store/tracking-app": {
    tracking: {
      platform: { on: true, providerName: "17TRACK", webhooks: true },
      ready: true,
      own: { provider: "aftership", providerName: "AfterShip", status: "connected", keyHint: "abcd", secretHint: null, lastError: null, verifiedAt: null, lastWebhookAt: null, webhookUrl: null },
      following: 3,
      lastCheckedAt: null,
    },
  },
}
const EXPECTED_INSTALLED = ["storelib-reviews", "courier-tracking", "storelib-email-marketing", "storelib-bundles", "google-analytics", "klaviyo", "aftership", "printful"].sort()
const APP_IN = { "storelib-email-marketing": "email" }
const OWNER_PILLS = ["all", "reviews", "analytics", "installed", "storelib", "advertising", "email", "automation"]

try {
  /*
    A router that moves the address: pushState and replaceState are heard
    (as Next's are synced with useSearchParams), Back is the browser's, and
    every hook reads the address as it is now.
  */
  writeFileSync(join(stubs, "navigation.js"), `import { useMemo, useSyncExternalStore } from "react"
const subs = new Set()
const ping = () => { for (const f of [...subs]) f() }
const sub = (f) => { subs.add(f); return () => subs.delete(f) }
for (const name of ["pushState", "replaceState"]) {
  const orig = history[name].bind(history)
  history[name] = (...a) => { orig(...a); ping() }
}
/* Next answers a Back in a transition, after every popstate listener has run (the shell's marks it as a return): not inside the event. */
addEventListener("popstate", () => setTimeout(ping, 0))
window.__prefetched = []
export const usePathname = () => useSyncExternalStore(sub, () => location.pathname)
export const useSearchParams = () => { const s = useSyncExternalStore(sub, () => location.search); return useMemo(() => new URLSearchParams(s), [s]) }
const router = { push(href) { history.pushState(null, "", href) }, replace(href) { history.replaceState(null, "", href) }, prefetch(href, o) { window.__prefetched.push({ href, kind: o && o.kind }) }, back() { history.back() }, refresh() {} }
export const useRouter = () => router
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
import { useRouter } from "next/navigation"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, unstable_dynamicOnHover, ...rest }, ref) {
  const router = useRouter()
  return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (e.defaultPrevented) return; e.preventDefault(); router.push(href) } }, children)
})
export const useLinkStatus = () => ({ pending: false })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() {
  const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: null, error: null }), single: async () => ({ data: null, error: null }), then: (r) => r({ data: [], error: null }) }
  return {
    channel() { const ch = { on() { return ch }, subscribe() { return ch } }; return ch },
    removeChannel() {},
    auth: { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({ error: null }) },
    from() { return q },
  }
}
export const isNativePlatform = () => false
`)
  const { build } = await import("esbuild")
  const nav = join(stubs, "navigation.js")
  const common = {
    bundle: true,
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.integrations-round30-probe/navigation.js", "next/link": "./.integrations-round30-probe/link.jsx", "next/image": "./.integrations-round30-probe/image.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })); b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: nav })) } }],
    loader: { ".css": "empty" },
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  }
  await build({ ...common, entryPoints: [join(root, "scripts/render-integrations-round30.tsx")], format: "iife", outfile: join(stubs, "page.js"), banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" } })
  writeFileSync(join(stubs, "catalog-entry.ts"), `export { visibleIntegrations, CATEGORY_ORDER, CATEGORY_NAMES } from "@/lib/integrations/catalog"\nexport { storelibApps } from "@/lib/integrations/storelib-apps"\nexport { hasBuiltInArt } from "@/components/app/settings/integration-mark"\n`)
  await build({ ...common, entryPoints: [join(stubs, "catalog-entry.ts")], format: "esm", platform: "node", outfile: join(stubs, "catalog.mjs"), external: ["react", "react-dom", "lucide-react"] })
  const catalog = await import(pathToFileURL(join(stubs, "catalog.mjs")).href)

  const css = await appCss(root)
  const fonts = interFaces(root)
  const js = readFileSync(join(stubs, "page.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  console.log("\nThe harness is the layout\n")
  {
    const layout = readFileSync(join(root, "app/app/layout.tsx"), "utf8")
    const harness = readFileSync(join(root, "scripts/render-integrations-round30.tsx"), "utf8")
    const cls = (src, re) => re.exec(src)?.[1]
    expect(cls(layout, /<main className="([^"]+)"/) === cls(harness, /MAIN_CLASS =\s*"([^"]+)"/), "the page's <main> has app/app/layout.tsx's classes")
    expect(cls(layout, /<div className="([^"]+)" data-app-rail=\{rail\}/) === cls(harness, /ROOT_CLASS = "([^"]+)"/), "and so has the shell's root")
  }

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--font-render-hinting=none"], protocolTimeout: 240_000 })
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }

  async function open(path, { vp = DESK } = {}) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        const short = url.replace(ORIGIN, "").split("?")[0]
        return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(API[short] ?? {}) })
      }
      if (url.startsWith(`${ORIGIN}/integrations/`)) {
        const file = join(root, "public", decodeURIComponent(new URL(url).pathname))
        const type = { svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" }[file.split(".").pop()] ?? "application/octet-stream"
        try {
          return void r.respond({ status: 200, contentType: type, body: readFileSync(file), headers: { "cache-control": "max-age=3600" } })
        } catch {
          return void r.respond({ status: 404, body: "" })
        }
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:") || url.startsWith("file:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(900)
    if (!(await p.$("[data-integrations]"))) throw new Error(`the page did not draw: ${errors.join(" | ") || (await p.evaluate(() => document.body.innerHTML.slice(0, 400)))}`)
    return { p, errors }
  }

  /** Every frame the screen showed while `act` ran: the content area's spread of colour (a blank one is flat). */
  async function film(p, vp, act, ms) {
    const cdp = await p.createCDPSession()
    const frames = []
    cdp.on("Page.screencastFrame", (f) => {
      frames.push({ t: f.metadata.timestamp * 1000, data: f.data })
      cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
    })
    await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1, maxWidth: vp.width, maxHeight: vp.height })
    await sleep(300)
    const t0 = Date.now()
    await act()
    await sleep(ms)
    await cdp.send("Page.stopScreencast")
    await sleep(80)
    await cdp.detach()
    const start = t0 - 30
    const out = []
    /* The content area: right of the rail on a computer, under the header. */
    const left = vp.width >= 768 ? 260 : 0
    const top = vp.width >= 768 ? 70 : 80
    for (const f of frames.filter((f) => f.t >= start)) {
      const img = sharp(Buffer.from(f.data, "base64"))
      const meta = await img.metadata()
      const sx = meta.width / vp.width
      const region = { left: Math.round(left * sx), top: Math.round(top * sx), width: Math.round((vp.width - left) * sx), height: Math.round((vp.height - top - 10) * sx) }
      const stats = await img.extract(region).stats()
      const spread = stats.channels.slice(0, 3).reduce((a, c) => a + c.stdev, 0) / 3
      const mean = stats.channels.slice(0, 3).reduce((a, c) => a + c.mean, 0) / 3
      out.push({ t: Math.round(f.t - t0), spread: +spread.toFixed(1), mean: +mean.toFixed(1) })
    }
    return out
  }

  /** The DOM every frame while `act` runs: the view, its opacity and every box that lands, grey loading boxes, the scroll. */
  const domFilm = (p, actSrc, ms) =>
    p.evaluate(
      (actSrc, ms) =>
        new Promise((res) => {
          const frames = []
          let t0 = 0
          const tick = (t) => {
            if (!t0) {
              t0 = t
              new Function(actSrc)()
            }
            const scroll = document.querySelector(".app-content-scroll")
            const pane = scroll?.firstElementChild
            const view = document.querySelector("[data-integrations]")
            const min = (els) => Math.min(1, ...els.map((el) => { let o = 1; for (let e = el; e && e !== document.body; e = e.parentElement) o *= +getComputedStyle(e).opacity; return o }))
            const movers = pane ? [...pane.children] : []
            frames.push({
              t: Math.round(t - t0),
              path: location.pathname + location.search,
              view: view?.getAttribute("data-integrations-view") ?? (pane?.getAttribute("data-stand-in") ? "stand-in" : null),
              opacity: +min(view ? [view, ...movers] : movers).toFixed(3),
              pulses: [...document.querySelectorAll("[data-integrations] .animate-pulse")].filter((el) => el.getBoundingClientRect().height > 0).length,
              scroll: pane?.scrollTop ?? 0,
              pill: document.querySelector('[data-integration-pill][aria-selected="true"]')?.getAttribute("data-integration-pill") ?? null,
            })
            if (t - t0 < ms) requestAnimationFrame(tick)
            else res(frames)
          }
          requestAnimationFrame(tick)
        }),
      actSrc,
      ms,
    )

  // ── How it works ───────────────────────────────────────────────────────────
  console.log("\nHow it works\n")
  {
    const { p, errors } = await open("/app/integrations")
    const g = await p.evaluate(() => {
      const shown = [...document.querySelectorAll('[data-how-it-works="integrations"]')].filter((el) => el.getBoundingClientRect().width > 0)
      const el = shown[0]
      const b = el.getBoundingClientRect()
      const bar = document.querySelector("[data-orders-bar]")
      const h1 = bar.querySelector("h1").getBoundingClientRect()
      const col = bar.firstElementChild
      const cs = getComputedStyle(col)
      const colRight = col.getBoundingClientRect().right - parseFloat(cs.paddingRight)
      const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim()
      return { shown: shown.length, inBar: bar.contains(el), right: +(colRight - b.right).toFixed(1), textRight: +(colRight - b.right + 8).toFixed(1), midDy: +(b.top + b.height / 2 - (h1.top + h1.height / 2)).toFixed(1), icon: !!el.querySelector("svg"), text, size: getComputedStyle(el).fontSize, colour: getComputedStyle(el).color, lede: document.querySelector("[data-integrations-lede]").getBoundingClientRect().height, searchTop: Math.round(document.querySelector("[data-integrations-search]").getBoundingClientRect().top) }
    })
    report.howDesk = g
    expect(g.shown === 1 && g.inBar && g.icon && g.text === "How it works", "1440: one How it works, in the page's bar, an icon and its words", { shown: g.shown, inBar: g.inBar, text: g.text })
    expect(Math.abs(g.midDy) <= 1.5 && g.right >= -8.5 && g.right <= 0.5, "1440: across from the title, centred on it, its words ending at the column's right edge", { midDy: g.midDy, fromRight: g.right })
    expect(g.lede <= 21, "1440: the line under the title is one line, with nothing after it", { lede: g.lede })
    await p.screenshot({ path: join(shots, "desk-top.png"), clip: { x: 240, y: 58, width: 1200, height: 420 } })
    await p.screenshot({ path: join(shots, "desk-full.png") })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }
  {
    const { p, errors } = await open("/app/integrations", { vp: PHONE })
    const g = await p.evaluate(() => {
      const shown = [...document.querySelectorAll('[data-how-it-works="integrations"]')].filter((el) => el.getBoundingClientRect().width > 0)
      const el = shown[0]
      const lede = document.querySelector("[data-integrations-lede]")
      const bar = document.querySelector("[data-orders-bar]")
      const rects = [...el.getClientRects()]
      const h1 = bar.querySelector("h1").getBoundingClientRect()
      const lb = lede.getBoundingClientRect()
      return { shown: shown.length, inLede: lede.contains(el), inBar: bar.contains(el), lines: Math.round(lb.height / 20), ledeH: lb.height, titleToSearch: Math.round(document.querySelector("[data-integrations-search]").getBoundingClientRect().top - h1.bottom), linkH: Math.max(...rects.map((r) => r.height)), icon: !!el.querySelector("svg") && el.querySelector("svg").getBoundingClientRect().width > 0, colour: getComputedStyle(el).color, underline: getComputedStyle(el).textDecorationLine, hit: (() => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.left + 4, r.top + r.height / 2)?.closest("[data-how-it-works]") === el })() }
    })
    report.howPhone = g
    expect(g.shown === 1 && g.inLede && !g.inBar && !g.icon && g.underline === "underline", "390: one How it works, the last words of the line under the title, underlined, no icon, not in the bar", { shown: g.shown, inLede: g.inLede, inBar: g.inBar, icon: g.icon })
    expect(g.lines <= 2 && g.hit, "390: the line and the link take two lines at most, and the link takes the press", { lines: g.lines, ledeH: g.ledeH })
    await p.evaluate(() => [...document.querySelectorAll('[data-how-it-works="integrations"]')].find((el) => el.getBoundingClientRect().width > 0).click())
    await sleep(600)
    expect(await p.evaluate(() => !!document.querySelector('[data-how-it-works-panel="integrations"]')), "390: a press opens the explanation")
    await p.keyboard.press("Escape")
    await sleep(500)
    await p.screenshot({ path: join(shots, "phone-top.png") })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  // ── The pills and the order ────────────────────────────────────────────────
  console.log("\nThe pills and the order\n")
  {
    const { p, errors } = await open("/app/integrations")
    const all = catalog.visibleIntegrations(true)
    const apps = catalog.storelibApps(true).filter((a) => !a.core)
    const own = (id) => catalog.hasBuiltInArt(id) || apps.some((a) => a.id === id)
    const laneOf = (id) => all.find((i) => i.id === id)?.category ?? APP_IN[id] ?? "storelib"
    const soon = new Set(all.filter((i) => i.comingSoon || i.paused).map((i) => i.id))
    const catalogAt = (id) => { const at = all.findIndex((i) => i.id === id); return at < 0 ? all.length + apps.findIndex((a) => a.id === id) : at }
    const expected = { all: [...all.map((i) => i.id), ...apps.map((a) => a.id)], storelib: [...all.filter((i) => catalog.hasBuiltInArt(i.id)).map((i) => i.id), ...apps.map((a) => a.id)], installed: EXPECTED_INSTALLED }
    for (const c of catalog.CATEGORY_ORDER) expected[c] = [...all.filter((i) => i.category === c).map((i) => i.id), ...apps.filter((a) => APP_IN[a.id] === c).map((a) => a.id)]
    const pills = await p.evaluate(() => [...document.querySelectorAll("[data-integration-pill]")].map((b) => ({ id: b.getAttribute("data-integration-pill"), label: b.textContent, count: Number(b.lastElementChild.textContent) })))
    const want = [...OWNER_PILLS, ...catalog.CATEGORY_ORDER.filter((c) => !OWNER_PILLS.includes(c))].filter((x) => ["all", "installed", "storelib"].includes(x) || expected[x].length > 0)
    report.pillOrder = pills.map((x) => x.id)
    expect(report.pillOrder.join() === want.join(), "All, Reviews, Analytics, Installed, Storelib apps, Advertising, Email marketing, Automation, then the rest in the catalog's order", report.pillOrder)
    report.pills = {}
    for (const pill of pills) {
      await p.evaluate((id) => document.querySelector(`[data-integration-pill="${id}"]`).click(), pill.id)
      await sleep(420)
      const ids = await p.evaluate(() => [...document.querySelectorAll("[data-integration-grid] > li")].filter((li) => !li.hidden).map((li) => li.querySelector("[data-integration-card]").getAttribute("data-integration-card")))
      const w = expected[pill.id] ?? []
      const missing = w.filter((id) => !ids.includes(id))
      const extra = ids.filter((id) => !w.includes(id))
      report.pills[pill.id] = { count: pill.count, cards: ids.length, order: ids }
      expect(pill.count === ids.length && !missing.length && !extra.length && new Set(ids).size === ids.length, `${pill.label.replace(/\d+$/, "").padEnd(16)} ${String(pill.count).padStart(2)} on the pill, ${String(ids.length).padStart(2)} cards, exactly its own`, missing.length || extra.length ? { missing, extra } : undefined)
      if (catalog.CATEGORY_ORDER.includes(pill.id)) {
        /* A category in its own order: Storelib's own, then working services, then Coming soon, each as the catalog lists them. */
        const rank = (id) => (soon.has(id) ? 2 : own(id) ? 0 : 1)
        const sorted = [...ids].sort((a, b) => rank(a) - rank(b) || (catalog.hasBuiltInArt(a) ? 0 : 1) - (catalog.hasBuiltInArt(b) ? 0 : 1) || catalogAt(a) - catalogAt(b))
        expect(sorted.join() === ids.join(), `${" ".repeat(19)}in its own order: Storelib's own, working, Coming soon`, sorted.join() === ids.join() ? undefined : ids)
      }
    }
    /* All, mixed. */
    const order = report.pills.all.order
    const lanes = order.map(laneOf)
    const working = order.filter((id) => !soon.has(id))
    const wl = working.map(laneOf)
    const distinctLanes = [...new Set(wl)]
    const firstRound = wl.slice(0, distinctLanes.length)
    let longest = 1
    let run = 1
    for (let i = 1; i < lanes.length; i++) { run = lanes[i] === lanes[i - 1] ? run + 1 : 1; longest = Math.max(longest, run) }
    /* Two of one lane side by side is fine only where no other lane had a card left to put between them. */
    const avoidable = []
    for (const group of [working, order.filter((id) => soon.has(id))]) {
      const gl = group.map(laneOf)
      for (let i = 1; i < gl.length; i++) if (gl[i] === gl[i - 1] && gl.slice(i + 1).some((l) => l !== gl[i])) avoidable.push(group[i])
    }
    const ownAt = order.map((id, i) => (own(id) ? i : -1)).filter((i) => i >= 0)
    const firstSoon = order.findIndex((id) => soon.has(id))
    report.mixed = { first12: order.slice(0, 12), lanesFirstRow: wl.slice(0, 3), longestRun: longest, avoidableNeighbours: avoidable.length, storelibPositions: ownAt, firstSoon, total: order.length }
    expect(new Set(firstRound).size === distinctLanes.length, `All opens on one card of each of its ${distinctLanes.length} lanes`, firstRound)
    expect(firstRound.join() === ["reviews", "analytics", "storelib", "advertising", "email", "automation", ...catalog.CATEGORY_ORDER.filter((c) => !OWNER_PILLS.includes(c))].filter((l) => distinctLanes.includes(l)).join(), "  in the pills' order")
    expect(ownAt.at(-1) > ownAt.length * 2 && ownAt.some((i, k) => k > 0 && i - ownAt[k - 1] > 2), "Storelib's own are spread through All, not a block at the top", ownAt)
    expect(avoidable.length === 0, "no two of one lane side by side while another lane has a card left", avoidable)
    expect(firstSoon < 0 || order.slice(firstSoon).every((id) => soon.has(id)), "Coming soon is still last", { firstSoon, total: order.length })
    await p.evaluate(() => document.querySelector('[data-integration-pill="all"]').click())
    await sleep(400)
    await p.evaluate(() => { const s = document.querySelector("[data-integrations-scroll]"); s.scrollTop = document.querySelector("[data-integration-pills]").getBoundingClientRect().top - 140 + s.scrollTop })
    await sleep(200)
    await p.screenshot({ path: join(shots, "desk-all.png") })
    /* The pill in the address. */
    await p.evaluate(() => document.querySelector('[data-integration-pill="analytics"]').click())
    await sleep(300)
    const addr = await p.evaluate(() => location.search)
    await p.evaluate(() => document.querySelector('[data-integration-pill="all"]').click())
    await sleep(300)
    const addrAll = await p.evaluate(() => location.search)
    const entries = await p.evaluate(() => history.length)
    expect(addr === "?c=analytics" && addrAll === "", "the pill is in the address (?c=analytics), All is the plain address, and no history entry is added", { addr, addrAll, entries })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }
  {
    const { p } = await open("/app/integrations?c=email")
    const g = await p.evaluate(() => ({ pill: document.querySelector('[data-integration-pill][aria-selected="true"]').getAttribute("data-integration-pill"), cards: [...document.querySelectorAll("[data-integration-grid] > li")].filter((li) => !li.hidden).length }))
    expect(g.pill === "email" && g.cards === report.pills.email.cards, "an address with ?c=email opens on Email marketing, its cards and no others", g)
    await p.close()
    const { p: q } = await open("/app/integrations?c=nonsense")
    expect((await q.evaluate(() => document.querySelector('[data-integration-pill][aria-selected="true"]').getAttribute("data-integration-pill"))) === "all", "a ?c= that names no pill is All")
    await q.close()
  }

  // ── In and out ─────────────────────────────────────────────────────────────
  for (const [name, vp] of [["1440", DESK], ["390", PHONE]]) {
    console.log(`\nAn integration's page, in and back (${name})\n`)
    const { p, errors } = await open("/app/integrations?c=reviews", { vp })
    await p.evaluate(() => document.querySelector('[data-integration-pill="storelib"]').click())
    await sleep(400)
    await p.evaluate(() => { const s = document.querySelector("[data-integrations-scroll]"); s.scrollTop = 460 })
    await sleep(250)
    const before = await p.evaluate(() => ({ scroll: document.querySelector("[data-integrations-scroll]").scrollTop, search: location.search }))
    const inPixels = await film(p, vp, () => p.evaluate(() => document.querySelector('[data-integration-card="storelib-reviews"]').click()), 420)
    const inDom = await p.evaluate(() => ({ view: document.querySelector("[data-integrations]").getAttribute("data-integrations-view"), pulses: document.querySelectorAll("[data-integrations] .animate-pulse").length, panel: !!document.querySelector("[data-reviews-app-panel]"), search: location.search }))
    await p.screenshot({ path: join(shots, `${name}-integration-page.png`) })
    const outDom = await domFilm(p, "history.back()", 420)
    await sleep(150)
    const after = await p.evaluate(() => ({ scroll: document.querySelector("[data-integrations-scroll]").scrollTop, search: location.search, pill: document.querySelector('[data-integration-pill][aria-selected="true"]').getAttribute("data-integration-pill"), focused: document.activeElement?.getAttribute("data-integration-card") }))
    /* And in again, its DOM filmed. */
    const inAgain = await domFilm(p, 'document.querySelector(\'[data-integration-card="storelib-reviews"]\').click()', 300)
    const outPixels = await film(p, vp, () => p.evaluate(() => document.querySelector("[data-integration-back]").click()), 420)
    await sleep(150)
    const after2 = await p.evaluate(() => ({ scroll: document.querySelector("[data-integrations-scroll]").scrollTop, pill: document.querySelector('[data-integration-pill][aria-selected="true"]').getAttribute("data-integration-pill") }))
    const blank = (fs) => fs.filter((f) => f.spread < 6)
    if (process.env.DEBUG_FILM) console.log(JSON.stringify({ inPixels, outPixels }))
    report[`page${name}`] = { before, after, after2, inFrames: inPixels.length, outFrames: outPixels.length, minSpreadIn: Math.min(...inPixels.map((f) => f.spread)), minSpreadOut: Math.min(...outPixels.map((f) => f.spread)), minOpacityIn: Math.min(...inAgain.map((f) => f.opacity)), minOpacityOut: Math.min(...outDom.map((f) => f.opacity)), pulsesIn: Math.max(...inAgain.map((f) => f.pulses)) }
    expect(inPixels.length >= 3 && blank(inPixels).length === 0, `${name}: in, every frame filmed has the page on it, none blank`, { frames: inPixels.length, minSpread: report[`page${name}`].minSpreadIn })
    expect(inDom.view === "page" && inDom.panel && inDom.pulses === 0 && Math.max(...inAgain.map((f) => f.pulses)) === 0, `${name}: Storelib Reviews' settings drawn at once from the kept answer, no grey loading box on any frame`, { pulses: inDom.pulses, panel: inDom.panel })
    /* The DOM on every frame (the screencast skips frames while the page is busy; this does not). */
    const firstPage = inAgain.find((f) => f.view === "page")
    const firstList = outDom.find((f) => f.view === "list")
    report[`page${name}`].firstPageFrame = firstPage
    report[`page${name}`].firstListFrame = firstList
    expect(Math.min(...inAgain.map((f) => f.opacity)) === 1 && Math.min(...outDom.map((f) => f.opacity)) === 1, `${name}: in and out, whole on every frame: no fade, no pale frame`, { minIn: report[`page${name}`].minOpacityIn, minOut: report[`page${name}`].minOpacityOut })
    expect(!!firstPage && firstPage.t <= 70 && inAgain.every((f) => f.view === "list" || f.view === "page") && !!firstList && firstList.scroll === before.scroll && outDom.filter((f) => f.view === "list").every((f) => f.scroll === before.scroll), `${name}: the list stays until the page is drawn (within 70ms), and the list comes back at its scroll on its first frame and stays`, { pageAt: firstPage?.t, listScroll: firstList?.scroll, before: before.scroll })
    expect(outPixels.length >= 3 && blank(outPixels).length === 0, `${name}: back, every frame filmed has the list on it, none blank`, { frames: outPixels.length, minSpread: report[`page${name}`].minSpreadOut })
    expect(after.scroll === before.scroll && after.search === before.search && after.pill === "storelib" && after.focused === "storelib-reviews", `${name}: the browser's Back: same pill (?c=storelib), same scroll, the card opened focused`, { before: before.scroll, after: after.scroll, search: after.search, pill: after.pill })
    expect(after2.scroll === before.scroll && after2.pill === "storelib", `${name}: Back to integrations does the same`, after2)
    expect(errors.length === 0, `${name}: no page errors`, errors)
    await p.close()
  }

  for (const [name, vp] of [["1440", DESK], ["390", PHONE]]) {
    console.log(`\nOne of Storelib's apps, a page of its own, and Back (${name})\n`)
    const { p, errors } = await open("/app/integrations", { vp })
    await p.evaluate(() => document.querySelector('[data-integration-pill="storelib"]').click())
    await sleep(400)
    await p.evaluate(() => { const s = document.querySelector("[data-integrations-scroll]"); s.scrollTop = 520 })
    await sleep(250)
    const card = await p.$('[data-integration-card="storelib-bundles"]')
    await card.evaluate((el) => el.scrollIntoView({ block: "center" }))
    await sleep(250)
    const before = await p.evaluate(() => ({ scroll: document.querySelector("[data-integrations-scroll]").scrollTop, search: location.search }))
    if (vp === DESK) await card.hover()
    else await card.evaluate((el) => el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true })))
    await sleep(80)
    const prefetched = await p.evaluate(() => window.__prefetched.filter((x) => x.href === "/app/offers"))
    expect(prefetched.length === 1 && prefetched[0].kind === "full", `${name}: its page fetched in full on a ${vp === DESK ? "hover" : "touch"}, once`, prefetched)
    const goPixels = await film(p, vp, () => p.evaluate(() => document.querySelector('[data-integration-card="storelib-bundles"]').click()), 380)
    const there = await p.evaluate(() => location.pathname)
    await p.screenshot({ path: join(shots, `${name}-app-page.png`) })
    const backDom = await domFilm(p, "history.back()", 420)
    const backPixels = await film(p, vp, async () => {
      await p.evaluate(() => history.forward())
      await sleep(400)
      await p.evaluate(() => history.back())
    }, 420)
    await sleep(150)
    const after = await p.evaluate(() => ({ scroll: document.querySelector("[data-integrations-scroll]").scrollTop, search: location.search, path: location.pathname, pill: document.querySelector('[data-integration-pill][aria-selected="true"]')?.getAttribute("data-integration-pill") }))
    const firstBack = backDom.find((f) => f.view === "list")
    report[`app${name}`] = { before, after, there, goFrames: goPixels.length, backFrames: backPixels.length, minSpreadGo: Math.min(...goPixels.map((f) => f.spread)), minSpreadBack: Math.min(...backPixels.map((f) => f.spread)), backOpacity: Math.min(...backDom.filter((f) => f.view === "list").map((f) => f.opacity)), firstBack, scrolls: [...new Set(backDom.filter((f) => f.view === "list").map((f) => f.scroll))] }
    expect(there === "/app/offers", `${name}: the card opens its own page`, there)
    expect(goPixels.length >= 3 && goPixels.every((f) => f.spread >= 6), `${name}: on the way there no frame is blank`, { frames: goPixels.length, minSpread: report[`app${name}`].minSpreadGo })
    expect(!!firstBack && firstBack.scroll === before.scroll && firstBack.pill === "storelib" && report[`app${name}`].scrolls.length === 1, `${name}: Back: the first frame of the list is already at its scroll and its pill, and it never moves after`, { before: before.scroll, first: firstBack, scrolls: report[`app${name}`].scrolls })
    expect(report[`app${name}`].backOpacity === 1 && backDom.every((f) => f.pulses === 0), `${name}: Back: no landing (every box at full opacity on every frame), no grey loading box`, { minOpacity: report[`app${name}`].backOpacity })
    expect(backPixels.length >= 3 && backPixels.every((f) => f.spread >= 6), `${name}: forward and Back again: no frame is blank`, { frames: backPixels.length, minSpread: report[`app${name}`].minSpreadBack })
    expect(after.scroll === before.scroll && after.search === "?c=storelib" && after.pill === "storelib", `${name}: and it settles where it was`, after)
    expect(errors.length === 0, `${name}: no page errors`, errors)
    await p.screenshot({ path: join(shots, `${name}-back-from-app.png`) })
    await p.close()
  }

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

console.log(`\n${JSON.stringify(report, (k, v) => (k === "order" ? undefined : v), 1).slice(0, 6000)}\n`)
console.log(broken ? `${broken} FAILED` : "all ok")
process.exit(broken ? 1 : 0)
