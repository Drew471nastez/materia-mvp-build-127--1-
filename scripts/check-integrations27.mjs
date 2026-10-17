/**
 * ===========================================================================
 *  ROUND 27: INTEGRATIONS, STORELIB REVIEWS AND THE /app BAR, MEASURED
 * ===========================================================================
 * The real pages in the real /app shell (scripts/render-integrations27.tsx),
 * in headless Chromium, at 1440x900 and at 390x844 (touch, CPU 4x slower):
 *
 *   K   the page bar: flat and scrolled away on Integrations, sticky with its
 *       depth on an order; the same box either way
 *   L1  a card under the pointer does not move, frame by frame, in and out
 *   L2  the badge sits inside the card's band, clear of its edge
 *   L3  an integration's Connect follows in a bar once scrolled away, and the
 *       bar leaves when the header's own is back: never both on screen
 *   L4  Back from an integration's page: the list where it was, no blank frame
 *   L5  an integration's page has no page title, from its first frame
 *   L6  /app/reviews is Storelib Reviews' page, Products › Reviews lit
 *   L7  where it stands is one line
 *   L8  the reviews tabs: marked on the press, no grey boxes on a view seen
 *       before or readied under the pointer, the tabs never move
 *
 *   PROBE_CSS=source node scripts/check-integrations27.mjs
 *
 * Pictures and frame sheets go to SHOTS_DIR (.i27-shots) to look at.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const stubs = join(root, ".integrations27-probe")
const shots = process.env.SHOTS_DIR || join(root, ".i27-shots")
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
/* I27_ONLY=K,L1,L3,L6 and I27_VP=1440 or 390 run a part of it, while working on one thing. */
const want = (part) => !process.env.I27_ONLY || process.env.I27_ONLY.split(",").includes(part)

/* ── What the server answers ─────────────────────────────────────────────── */
const days = (n) => new Date(Date.parse("2026-10-17T10:00:00Z") - n * 86_400_000).toISOString()
const PRODUCTS = [
  { id: "11111111-0000-4000-8000-000000000001", title: "Notion Budget", slug: "notion-budget", thumbnail_url: null },
  { id: "11111111-0000-4000-8000-000000000002", title: "Linen apron", slug: "linen-apron", thumbnail_url: null },
]
const row = (n, rating, content, extra = {}) => ({ id: `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`, product_id: PRODUCTS[n % 2].id, rating, title: null, content, created_at: days(n), edited_at: null, status: "published", hidden_by: null, on_storelib: true, verified: true, source: "storelib", featured: false, photos: [], reviewer_name: null, seller_reply: null, seller_reply_at: null, buyer: { display_name: ["Ghita Nastase", "Ana Pop", "Mihai Ionescu", "Lena Marin"][n % 4], avatar_url: null }, customer: null, product: PRODUCTS[n % 2], ...extra })
const ROWS = Array.from({ length: 18 }, (_, i) => row(i + 1, [5, 4, 5, 3, 5, 2][i % 6], ["Clean files and the setup guide is clear.", "Good, I would like a dark version.", "The first budget template I kept using.", "Fine, the import from my bank did not work.", "Soft linen, the stitching is neat.", "Arrived late, the apron itself is nice."][i % 6]))
const dist = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: ROWS.filter((r) => r.rating === stars).length }))
const summary = { total: 18, published: 18, pending: 0, hidden: 0, reported: 0, unanswered: 18, verifiedPublished: 18, distribution: dist, average: 4.0 }
const funnel = { sent: 40, delivered: 38, opened: 25, clicked: 19, submitted: 18, scheduled: 3, responseRate: 45 }
const totals = { received: 18, published: 18, average: 4, verified: 18, verifiedShare: 100, distribution: dist }
const REQ = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, order_id: `o${i}`, product: { id: PRODUCTS[i % 2].id, title: PRODUCTS[i % 2].title }, email: `buyer${i}@example.com`, first_name: "Ana", shown: ["sent", "opened", "submitted", "scheduled"][i % 4], skip_reason: null, due_at: days(-2), sent_at: days(i), reminded_at: null, opened_at: null, review_id: null, manual: false, created_at: days(i + 1) }))
const SETTINGS = {
  enabled: true, enabledAt: null, publish: "auto", minStars: 1, photos: true, who: "verified",
  request: { enabled: true, digitalDays: 7, physicalDays: 7, physicalFrom: "delivered", reminder: true, reminderDays: 7 },
  display: { starColor: "#f5a623", showVerified: true, showDate: true, showPhotos: true, showCardRating: true, productPage: true, sort: "featured", perPage: 6 },
  editDays: 30,
}
function answer(url, method) {
  const u = new URL(url)
  const p = u.pathname
  const q = u.searchParams
  if (p === "/api/store/integrations/installed") return { installed: [] }
  if (p === "/api/store/integrations") return { tracking: { ga4: "G-TEST123" }, ready: true, ga: null }
  if (p === "/api/physical/integrations") return { integrations: [{ provider: "printful", status: "connected", url: null, keyHint: "1234", secretHint: null, lastSyncAt: null, lastError: null }] }
  if (p === "/api/store/integrations/marketing") return { marketing: [] }
  if (p === "/api/store/integrations/apps") return { states: { "storelib-email-marketing": "on", "storelib-markets": "setup", "storelib-code": "off", "storelib-bundles": "on", "storelib-reviews": "on", "courier-tracking": "on" }, hrefs: {} }
  if (p === "/api/store/integrations/catalog") return { overrides: [] }
  if (p === "/api/store/reviews-app") return { ready: true, counts: { pending: 0, published: 18, asked: 40 }, settings: SETTINGS }
  if (p === "/api/store/tracking-app") return { tracking: { platform: { on: true, providerName: "17TRACK", webhooks: true }, ready: true, own: null, following: 3, lastCheckedAt: null } }
  if (p === "/api/app/reviews/overview") return { summary, funnel, recent: ROWS.slice(0, 5).map((r) => ({ id: r.id, rating: r.rating, title: null, excerpt: r.content, name: r.buyer.display_name, created_at: r.created_at, status: "published", verified: true, product: r.product.title })), ready: true, app: { enabled: true, ready: true } }
  if (p === "/api/app/reviews" && q.get("only") === "products") return { products: PRODUCTS.map((x) => ({ id: x.id, title: x.title })) }
  if (p === "/api/app/reviews") return { rows: ROWS, total: ROWS.length, page: 1, pageSize: 25, counts: { all: 18, published: 18, pending: 0, hidden: 0, reported: 0, unanswered: 18 }, ready: true }
  if (p === "/api/app/reviews/requests" && q.get("orders")) return { orders: [] }
  if (p === "/api/app/reviews/requests") return { rows: REQ, total: REQ.length, page: 1, pageSize: 25, tracked: true, ready: true }
  if (p === "/api/app/reviews/request-email" && method === "POST") return { subject: "Would you review Notion Budget?", html: "<p style='font-family:sans-serif;padding:24px'>Would you review Notion Budget?</p>" }
  if (p === "/api/app/reviews/request-email") return { ready: true, copy: { request: null, reminder: null } }
  if (p === "/api/app/reviews/analytics") {
    const from = Date.parse(`${q.get("from")}T00:00:00Z`) || Date.parse("2026-09-17T00:00:00Z")
    const series = Array.from({ length: 30 }, (_, i) => ({ key: new Date(from + i * 86_400_000).toISOString().slice(0, 10), received: i % 3, average: i % 3 ? 4.2 : null, verified: i % 3 }))
    return { from: q.get("from"), to: q.get("to"), bucket: "day", series, current: totals, previous: { ...totals, received: 11 }, funnel, previousFunnel: { ...funnel, sent: 30, submitted: 10 }, capped: false }
  }
  if (p === "/api/reviews/widgets") return { configs: [], ready: true, shopName: "Mara Lind", languages: { defaultLanguage: "en", others: [] } }
  /* No reviews of its own yet: the sample ones the server sends then (lib/reviews/storefront sampleStorefrontReviews). */
  if (p === "/api/reviews/storefront") return { reviews: SAMPLE_STOREFRONT }
  return {}
}
let SAMPLE_STOREFRONT = null
/* Every answer takes this long, as a real one does: a grey box that would show on a real phone shows here too. */
const API_MS = 160

try {
  writeFileSync(join(stubs, "navigation.js"), `import { useMemo, useSyncExternalStore } from "react"
const subs = new Set()
const ping = () => { for (const f of [...subs]) f() }
const sub = (f) => { subs.add(f); return () => subs.delete(f) }
for (const name of ["pushState", "replaceState"]) {
  const orig = history[name].bind(history)
  history[name] = (...a) => { orig(...a); ping() }
}
addEventListener("popstate", () => setTimeout(ping, 0))
export const usePathname = () => useSyncExternalStore(sub, () => location.pathname)
export const useSearchParams = () => { const s = useSyncExternalStore(sub, () => location.search); return useMemo(() => new URLSearchParams(s), [s]) }
const router = { push(href) { history.pushState(null, "", href) }, replace(href) { history.replaceState(null, "", href) }, prefetch() {}, back() { history.back() }, refresh() {} }
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
  await build({
    bundle: true,
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.integrations27-probe/navigation.js", "next/link": "./.integrations27-probe/link.jsx", "next/image": "./.integrations27-probe/image.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })); b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: nav })) } }],
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
    entryPoints: [join(root, "scripts/render-integrations27.tsx")],
    format: "iife",
    outfile: join(stubs, "page.js"),
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  })
  writeFileSync(join(stubs, "storefront-entry.ts"), `export { sampleStorefrontReviews } from "@/lib/reviews/storefront"\nexport { REVIEWS_APP_DEFAULTS } from "@/lib/reviews/app-settings"\n`)
  await build({ bundle: true, alias: { "@": "." }, absWorkingDir: root, nodePaths: [join(root, "node_modules")], logLevel: "error", entryPoints: [join(stubs, "storefront-entry.ts")], format: "esm", platform: "node", outfile: join(stubs, "storefront.mjs") })
  const sf = await import(pathToFileURL(join(stubs, "storefront.mjs")).href)
  SAMPLE_STOREFRONT = { ...sf.sampleStorefrontReviews(sf.REVIEWS_APP_DEFAULTS, "c1", null), enabled: true, widgets: [] }
  const css = await appCss(root)
  const fonts = interFaces(root)
  const js = readFileSync(join(stubs, "page.js"), "utf8")
  const page = (sheet) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${sheet}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  /*
    A COMPUTER HAS A MOUSE. Headless Chromium has no pointer at all: it
    answers (hover: none), so every hover style is off and the touch rules
    (app/globals.css @media (hover: none)) take every transition off the
    cards, and nothing about a hover could be measured. The computer's page
    gets the stylesheet as a computer with a mouse reads it.
  */
  const mouseCss = css.replace(/\(hover: hover\) and \(pointer: fine\)/g, "all").replace(/\(hover: hover\)/g, "all").replace(/\(hover: none\)/g, "not all")
  const htmlFor = (vp) => (vp.width >= 768 ? page(mouseCss) : page(css))

  console.log("\nThe harness is the layout\n")
  {
    const layout = readFileSync(join(root, "app/app/layout.tsx"), "utf8")
    const harness = readFileSync(join(root, "scripts/render-integrations27.tsx"), "utf8")
    const cls = (src, re) => re.exec(src)?.[1]
    expect(cls(layout, /<main className="([^"]+)"/) === cls(harness, /MAIN_CLASS =\s*"([^"]+)"/), "the page's <main> has app/app/layout.tsx's classes")
    expect(cls(layout, /<div className="([^"]+)" data-app-rail=\{rail\}/) === cls(harness, /ROOT_CLASS = "([^"]+)"/), "and so has the shell's root")
  }

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--font-render-hinting=none"], protocolTimeout: 240_000 })
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const isPhone = (vp) => vp.width < 768

  async function open(path, { vp = DESK } = {}) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        if (process.env.I27_DEBUG) console.log("   api", Date.now() % 100000, r.method(), url.replace(ORIGIN, "").slice(0, 70))
        const body = JSON.stringify(answer(url, r.method()))
        return void setTimeout(() => r.respond({ status: 200, contentType: "application/json", body }).catch(() => {}), API_MS)
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
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: htmlFor(vp) })
      if (url.startsWith("data:") || url.startsWith("file:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(1000)
    if (isPhone(vp)) {
      const cdp = await p.createCDPSession()
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    }
    return { p, errors }
  }

  /** The screen, every frame, while `act` runs: kept as PNGs for a frame sheet. */
  async function film(p, vp, act, ms) {
    const cdp = await p.createCDPSession()
    const frames = []
    cdp.on("Page.screencastFrame", (f) => {
      frames.push({ t: f.metadata.timestamp * 1000, data: f.data })
      cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
    })
    await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1, maxWidth: vp.width, maxHeight: vp.height })
    await sleep(250)
    const t0 = Date.now()
    await act()
    await sleep(ms)
    await cdp.send("Page.stopScreencast")
    await sleep(80)
    await cdp.detach()
    return frames.filter((f) => f.t >= t0 - 40).map((f) => ({ t: Math.round(f.t - t0), data: f.data }))
  }

  /** Up to `max` frames of a film, laid out four across with their time, in one picture to look at. */
  async function sheet(frames, file, { max = 12, width = 360, crop = null } = {}) {
    if (!frames.length) return
    const pick = frames.length <= max ? frames : Array.from({ length: max }, (_, i) => frames[Math.round((i * (frames.length - 1)) / (max - 1))])
    const tiles = []
    for (const f of pick) {
      let img = sharp(Buffer.from(f.data, "base64"))
      if (crop) {
        const meta = await img.metadata()
        const s = meta.width / crop.vw
        img = sharp(await img.extract({ left: Math.round(crop.x * s), top: Math.round(crop.y * s), width: Math.round(crop.w * s), height: Math.round(crop.h * s) }).toBuffer())
      }
      const buf = await img.resize({ width }).png().toBuffer()
      const meta = await sharp(buf).metadata()
      const label = Buffer.from(`<svg width="${width}" height="22"><rect width="100%" height="22" fill="#111"/><text x="6" y="15" font-family="sans-serif" font-size="13" fill="#fff">${f.t} ms</text></svg>`)
      tiles.push({ buf: await sharp({ create: { width, height: meta.height + 22, channels: 3, background: "#fff" } }).composite([{ input: label, top: 0, left: 0 }, { input: buf, top: 22, left: 0 }]).png().toBuffer(), h: meta.height + 22 })
    }
    const cols = 4
    const rows = Math.ceil(tiles.length / cols)
    const th = Math.max(...tiles.map((t) => t.h))
    const out = sharp({ create: { width: cols * width + (cols + 1) * 6, height: rows * th + (rows + 1) * 6, channels: 3, background: "#888" } })
    await out.composite(tiles.map((t, i) => ({ input: t.buf, left: 6 + (i % cols) * (width + 6), top: 6 + Math.floor(i / cols) * (th + 6) }))).jpeg({ quality: 82 }).toFile(join(shots, file))
  }

  /** In the page, every frame for `ms`: what `probeSrc` reads, after `actSrc` runs on the first frame. */
  const domFilm = (p, actSrc, probeSrc, ms) =>
    p.evaluate(
      (actSrc, probeSrc, ms) =>
        new Promise((res) => {
          const frames = []
          let t0 = 0
          const probe = new Function(`return (${probeSrc})()`)
          const tick = (t) => {
            if (!t0) {
              t0 = t
              new Function(actSrc)()
              /* Read after the press has been handled (React answers a click in a microtask), still before this frame is painted. */
              queueMicrotask(() => {
                frames.push({ t: 0, ...probe() })
                requestAnimationFrame(tick)
              })
              return
            }
            frames.push({ t: Math.round(t - t0), ...probe() })
            if (t - t0 < ms) requestAnimationFrame(tick)
            else res(frames)
          }
          requestAnimationFrame(tick)
        }),
      actSrc,
      probeSrc,
      ms,
    )

  for (const vp of [DESK, PHONE].filter((v) => !process.env.I27_VP || String(v.width) === process.env.I27_VP)) {
    const tag = isPhone(vp) ? "390" : "1440"

    // ── K: the page bar ─────────────────────────────────────────────────────
    if (want("K")) console.log(`\nK  The page bar (${tag})\n`)
    if (want("K")) {
      const { p, errors } = await open("/app/integrations", { vp })
      const read = () =>
        p.evaluate(() => {
          const bar = document.querySelector("[data-orders-bar]")
          const pane = bar.closest(".orders-pane")
          const b = bar.getBoundingClientRect()
          const cs = getComputedStyle(bar)
          return { position: cs.position, shadow: cs.boxShadow, height: Math.round(b.height), fromPaneTop: Math.round(b.top - pane.getBoundingClientRect().top), scroll: pane.scrollTop, searchTop: Math.round(document.querySelector("[data-integrations-search]").getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop) }
        })
      const top = await read()
      await p.evaluate(() => (document.querySelector("[data-integrations-scroll]").scrollTop = 600))
      await sleep(300)
      const down = await read()
      report[`bar_integrations_${tag}`] = { top, down }
      expect(top.position !== "sticky" && down.fromPaneTop <= -top.height && (down.shadow === "none" || /rgba\(0, 0, 0, 0\)/.test(down.shadow)), "Integrations: the bar is not sticky; scrolled 600px it is gone above the pane, with no shadow", { position: top.position, fromPaneTop: down.fromPaneTop, shadow: down.shadow })
      expect(top.height >= 60 && top.searchTop === top.height + 4, "  the same box as before: the title bar, then the search 4px under it", { height: top.height, searchTop: top.searchTop })
      await p.evaluate(() => (document.querySelector("[data-integrations-scroll]").scrollTop = 0))
      await sleep(200)
      await p.screenshot({ path: join(shots, `k-integrations-top-${tag}.png`) })
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }
    if (want("K")) {
      const { p, errors } = await open("/app/orders/1", { vp })
      const read = () =>
        p.evaluate(() => {
          const bar = document.querySelector("[data-orders-bar]")
          const pane = bar.closest(".orders-pane")
          const cs = getComputedStyle(bar)
          return { position: cs.position, scrolled: bar.dataset.scrolled, shadow: cs.boxShadow, fromPaneTop: Math.round(bar.getBoundingClientRect().top - pane.getBoundingClientRect().top) }
        })
      const top = await read()
      await p.evaluate(() => (document.querySelector("[data-stand-in]").scrollTop = 600))
      await sleep(300)
      const down = await read()
      report[`bar_order_${tag}`] = { top, down }
      expect(top.position === "sticky" && top.scrolled === "false" && down.fromPaneTop === 0 && down.scrolled === "true" && /rgba\(17, 24, 39, 0\.07\)/.test(down.shadow), "an order: the bar is sticky, flat at the top, at the pane's top with its hairline and shadow once scrolled", { top: top.scrolled, down })
      await p.screenshot({ path: join(shots, `k-order-scrolled-${tag}.png`) })
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }

    // ── L1, L2: the cards ───────────────────────────────────────────────────
    if (!isPhone(vp) && want("L1")) {
      console.log(`\nL1 L2  The cards (${tag})\n`)
      const { p, errors } = await open("/app/integrations", { vp })
      await p.evaluate(() => { const s = document.querySelector("[data-integrations-scroll]"); s.scrollTop = document.querySelector("[data-integration-pills]").getBoundingClientRect().top - s.getBoundingClientRect().top - 12 + s.scrollTop })
      await sleep(300)
      const ids = await p.evaluate(() => [...document.querySelectorAll("[data-integration-grid] > li:not([hidden]) [data-integration-card]")].slice(0, 6).map((c) => c.getAttribute("data-integration-card")))
      if (process.env.I27_DEBUG) console.log(await p.evaluate(() => { const c = document.querySelector("[data-integration-card]"); const cs = getComputedStyle(c); return { reduce: matchMedia("(prefers-reduced-motion: reduce)").matches, hover: matchMedia("(hover: hover) and (pointer: fine)").matches, prop: cs.transitionProperty, dur: cs.transitionDuration, ease: cs.transitionTimingFunction, shadow: cs.boxShadow } }))
      const moves = []
      for (const id of ids.slice(0, 4)) {
        const box = await p.evaluate((id) => { const r = document.querySelector(`[data-integration-card="${id}"]`).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }, id)
        /* Every frame while the pointer comes in, rests on the bottom edge, and leaves. */
        const sampler = p.evaluate(
          (id) =>
            new Promise((res) => {
              const el = document.querySelector(`[data-integration-card="${id}"]`)
              const first = el.getBoundingClientRect()
              const out = { frames: 0, maxMove: 0, maxSize: 0, moved: new Set(), shadows: new Set() }
              const t0 = performance.now()
              const tick = () => {
                const r = el.getBoundingClientRect()
                out.frames++
                out.maxMove = Math.max(out.maxMove, Math.abs(r.top - first.top), Math.abs(r.left - first.left))
                out.maxSize = Math.max(out.maxSize, Math.abs(r.width - first.width), Math.abs(r.height - first.height))
                const cs = getComputedStyle(el)
                out.moved.add(cs.transform)
                out.shadows.add(cs.boxShadow)
                if (performance.now() - t0 < 1500) requestAnimationFrame(tick)
                else res({ ...out, moved: [...out.moved], shadows: out.shadows.size })
              }
              requestAnimationFrame(tick)
            }),
          id,
        )
        await sleep(50)
        await p.mouse.move(box.x - 30, box.y + box.h / 2)
        await p.mouse.move(box.x + box.w / 2, box.y + box.h / 2, { steps: 6 })
        await sleep(350)
        await p.mouse.move(box.x + box.w / 2, box.y + box.h - 1, { steps: 4 })
        await sleep(350)
        await p.mouse.move(box.x + box.w / 2, box.y + box.h + 40, { steps: 6 })
        const got = await sampler
        moves.push({ id, ...got })
      }
      report.hover = moves
      expect(moves.every((m) => m.maxMove === 0 && m.maxSize === 0 && m.moved.every((t) => t === "none")), "a card under the pointer, resting on its bottom edge and leaving: 0px of movement in every frame", moves.map((m) => ({ id: m.id, frames: m.frames, move: m.maxMove, size: m.maxSize, moved: m.moved })))
      expect(moves.every((m) => m.shadows > 2), "  and its depth eases in and out (the shadow takes several values on the way)", moves.map((m) => m.shadows))
      /* A frame sheet of one hover, in and out. */
      const first = await p.evaluate((id) => { const r = document.querySelector(`[data-integration-card="${id}"]`).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }, ids[0])
      const frames = await film(p, vp, async () => {
        await p.mouse.move(first.x + first.w / 2, first.y + first.h / 2, { steps: 4 })
        await sleep(320)
        await p.mouse.move(first.x + first.w / 2, first.y + first.h + 60, { steps: 4 })
      }, 380)
      await sheet(frames, `l1-hover-sheet-${tag}.jpg`, { crop: { vw: vp.width, x: first.x - 16, y: first.y - 16, w: first.w + 32, h: first.h + 32 }, width: 300 })
      report.hoverFrames = frames.length

      const badges = await p.evaluate(() =>
        [...document.querySelectorAll("[data-integration-grid] > li:not([hidden]) [data-integration-card]")].slice(0, 12).map((card) => {
          const band = card.querySelector(":scope > span[aria-hidden]")
          const badge = card.querySelector("[data-integration-card-badge] [data-integration-badge]")
          const b = band.getBoundingClientRect()
          const g = badge.getBoundingClientRect()
          const c = card.getBoundingClientRect()
          const line = b.bottom - parseFloat(getComputedStyle(band).borderBottomWidth)
          return { id: card.getAttribute("data-integration-card"), word: badge.textContent, above: +(g.top - c.top - 1).toFixed(1), below: +(line - g.bottom).toFixed(1), right: +(c.right - 1 - g.right).toFixed(1) }
        }),
      )
      report.badges = badges
      expect(badges.length > 0 && badges.every((b) => b.below >= 8 && b.above >= 8 && Math.abs(b.above - b.below) <= 1.5), "every badge sits inside the band, at least 8px clear of its line and of the card's top, centred between them", badges.slice(0, 4))
      await p.screenshot({ path: join(shots, `l2-cards-${tag}.png`), clip: { x: 240, y: 120, width: 1200, height: 560 } })
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }

    // ── L5, L3, L4, L7: an integration's page ───────────────────────────────
    if (want("L3")) console.log(`\nL3 L4 L5 L7  An integration's page (${tag})\n`)
    if (want("L3")) {
      const { p, errors } = await open("/app/integrations", { vp })
      /* Klaviyo: something to connect, and a page long enough on a computer to scroll its Connect away. */
      const cardId = "klaviyo"
      await p.evaluate((id) => { const s = document.querySelector("[data-integrations-scroll]"); const c = document.querySelector(`[data-integration-card="${id}"]`); s.scrollTop += c.getBoundingClientRect().top - s.getBoundingClientRect().top - 220 }, cardId)
      await sleep(300)
      const before = await p.evaluate((id) => ({ scroll: document.querySelector("[data-integrations-scroll]").scrollTop, cardTop: Math.round(document.querySelector(`[data-integration-card="${id}"]`).getBoundingClientRect().top) }), cardId)
      /* L5: from the first frame of the page, no page title. */
      const PROBE = `() => {
        const s = document.querySelector("[data-integrations-scroll]")
        const bar = document.querySelector("[data-orders-bar]")
        const view = document.querySelector("[data-integrations]")?.getAttribute("data-integrations-view") ?? null
        const back = document.querySelector("[data-integration-back]")
        const card = document.querySelector('[data-integration-card="${cardId}"]')
        return { view, bar: bar ? bar.getBoundingClientRect().height : 0, scroll: s.scrollTop, back: back ? Math.round(back.getBoundingClientRect().top - s.getBoundingClientRect().top) : null, card: card ? Math.round(card.getBoundingClientRect().top) : null, h: Math.round(s.scrollHeight) }
      }`
      const inFrames = await domFilm(p, `document.querySelector('[data-integration-card="${cardId}"]').click()`, PROBE, 500)
      const pageFrames = inFrames.filter((f) => f.view === "page")
      report[`open_${tag}`] = { first: inFrames.slice(0, 3), page: pageFrames.slice(0, 2) }
      expect(pageFrames.length > 0 && pageFrames.every((f) => f.bar === 0), "an integration's page: no Integrations title in any frame of it, from the first", pageFrames.slice(0, 2))
      expect(pageFrames.every((f) => f.back === pageFrames[0].back && f.scroll === 0), "  its Back at one place from the first frame, the page at its top", { back: pageFrames[0]?.back, scrolls: [...new Set(pageFrames.map((f) => f.scroll))] })
      const head = await p.evaluate(() => {
        const st = document.querySelector("[data-integration-standing]")
        return { h1: document.querySelector("[data-integration-header] h1")?.textContent ?? null, backText: document.querySelector("[data-integration-back]")?.textContent ?? null, standingH: Math.round(st.getBoundingClientRect().height), standing: st.innerText.replace(/\s+/g, " ").trim() }
      })
      expect(head.h1 === "Klaviyo" && /Back to integrations/.test(head.backText ?? ""), "  the integration's name is the page's title, under Back to integrations", head)
      expect(head.standingH <= 26 && head.standing === "Email marketing Not connected", "  L7: where it stands is one line, with no sentence after it", head)
      await p.screenshot({ path: join(shots, `l5-page-top-${tag}.png`) })

      /* L3: the action follows once the header's is scrolled away, and leaves when it is back. */
      const pinRead = `() => {
        const s = document.querySelector("[data-integrations-scroll]")
        const a = document.querySelector("[data-integration-action]")
        const pin = document.querySelector("[data-integration-pin]")
        const card = pin?.firstElementChild
        const sb = s.getBoundingClientRect()
        const ab = a.getBoundingClientRect()
        const btn = document.querySelector("[data-integration-pin-action]")
        /* Seen: some of it below the room the bar takes at the top (64px); under that room it is behind the bar. */
        return { scroll: Math.round(s.scrollTop), actionVisible: ab.bottom > sb.top + 64.5 && ab.top < sb.bottom, opacity: +getComputedStyle(pin).opacity, state: pin.getAttribute("data-integration-pin"), gap: card ? Math.round(card.getBoundingClientRect().top - sb.top) : null, radius: btn ? getComputedStyle(btn).borderTopLeftRadius : null, label: btn?.textContent ?? null }
      }`
      const exists = await p.evaluate(() => !!document.querySelector("[data-integration-pin]"))
      expect(exists, "a page with something to connect has the following bar, hidden while the header's action shows")
      if (exists) {
        const actionBottom = await p.evaluate(() => { const s = document.querySelector("[data-integrations-scroll]"); return Math.round(document.querySelector("[data-integration-action]").getBoundingClientRect().bottom - s.getBoundingClientRect().top) })
        /* Scrolled down in small steps, as a wheel does: the bar appears only once the action is gone. */
        const down = await domFilm(p, `const s = document.querySelector("[data-integrations-scroll]"); let n = 0; const step = () => { s.scrollTop += 24; if (++n < ${Math.ceil((actionBottom + 140) / 24)}) requestAnimationFrame(step) }; requestAnimationFrame(step)`, pinRead, 900)
        const up = await domFilm(p, `const s = document.querySelector("[data-integrations-scroll]"); const step = () => { s.scrollTop -= 24; if (s.scrollTop > 0) requestAnimationFrame(step) }; requestAnimationFrame(step)`, pinRead, 900)
        const early = down.filter((f) => f.actionVisible && f.state === "shown")
        const goneAt = down.findIndex((f) => !f.actionVisible)
        const cameAt = down.findIndex((f) => f.state === "shown")
        const backAt = up.findIndex((f) => f.actionVisible)
        const leftAt = up.findIndex((f, i) => i >= backAt && f.state === "hidden")
        const clearAt = up.findIndex((f, i) => i >= backAt && f.opacity === 0)
        report[`pin_${tag}`] = { actionBottom, maxScroll: down.at(-1).scroll, goneAt, cameAt, backAt, leftAt, clearMs: clearAt >= 0 && backAt >= 0 ? up[clearAt].t - up[backAt].t : null, endDown: down.at(-1), endUp: up.at(-1), ramp: down.filter((f) => f.opacity > 0 && f.opacity < 1).map((f) => f.opacity) }
        expect(goneAt > 0, "  (the page scrolls far enough to take the header's action out of view)", { actionBottom, scroll: down.at(-1).scroll })
        expect(down.at(-1).state === "shown" && down.at(-1).opacity === 1, "scrolled past it: the bar is there", down.at(-1))
        expect(early.length === 0 && cameAt - goneAt <= 2, "  it comes only once the header's action is gone, within two frames of it", { goneAt, cameAt, early: early.length })
        expect(up.at(-1).state === "hidden" && up.at(-1).opacity === 0, "scrolled back up: the bar is gone", up.at(-1))
        expect(backAt >= 0 && leftAt - backAt <= 2 && report[`pin_${tag}`].clearMs <= 200, "  it starts to leave within two frames of the header's action coming back, and is gone within 200ms", { backAt, leftAt, clearMs: report[`pin_${tag}`].clearMs })
        expect(down.filter((f) => f.opacity > 0 && f.opacity < 1).length >= 3, "  it fades in over several frames, not in one", report[`pin_${tag}`].ramp)
        expect(down.at(-1).radius === "8px" && down.at(-1).gap >= 8 && down.at(-1).gap <= 12, "  its button has an 8px radius, the bar 8 to 12px under the top", { radius: down.at(-1).radius, gap: down.at(-1).gap })
        /* Frame sheet of it coming in and leaving. */
        await p.evaluate(() => (document.querySelector("[data-integrations-scroll]").scrollTop = 0))
        await sleep(300)
        const frames = await film(p, vp, async () => {
          await p.evaluate((to) => document.querySelector("[data-integrations-scroll]").scrollTo({ top: to, behavior: "smooth" }), actionBottom + 160)
        }, 900)
        await sheet(frames, `l3-pin-in-sheet-${tag}.jpg`, { width: isPhone(vp) ? 200 : 360 })
        await p.screenshot({ path: join(shots, `l3-pinned-${tag}.png`) })
        const framesOut = await film(p, vp, async () => {
          await p.evaluate(() => document.querySelector("[data-integrations-scroll]").scrollTo({ top: 0, behavior: "smooth" }))
        }, 900)
        await sheet(framesOut, `l3-pin-out-sheet-${tag}.jpg`, { width: isPhone(vp) ? 200 : 360 })
      }
      await p.evaluate(() => (document.querySelector("[data-integrations-scroll]").scrollTop = 0))
      await sleep(200)

      /* L4: Back, by the page's own button. */
      const outFrames = await domFilm(p, `document.querySelector("[data-integration-back]").click()`, PROBE, 700)
      const listFrames = outFrames.filter((f) => f.view === "list")
      const firstList = listFrames[0]
      report[`back_${tag}`] = { before, firstList, last: outFrames.at(-1), blank: outFrames.filter((f) => !f.view).length }
      expect(!!firstList && listFrames.every((f) => f.bar > 0 && f.scroll === before.scroll && f.card === before.cardTop), "Back: the list with its title, its scroll and the card where they were, from the first frame of it", { before, firstList })
      expect(outFrames.every((f) => f.view), "  no frame without a page", outFrames.filter((f) => !f.view).length)
      const backFilm = await (async () => {
        await p.evaluate((id) => document.querySelector(`[data-integration-card="${id}"]`).click(), cardId)
        await sleep(500)
        return film(p, vp, () => p.evaluate(() => document.querySelector("[data-integration-back]").click()), 500)
      })()
      await sheet(backFilm, `l4-back-sheet-${tag}.jpg`, { width: isPhone(vp) ? 200 : 360 })
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }

    // ── L6, L7, L8: Storelib Reviews at /app/reviews ─────────────────────────
    if (want("L6")) console.log(`\nL6 L7 L8  Storelib Reviews at /app/reviews (${tag})\n`)
    if (want("L6")) {
      const { p, errors } = await open("/app/reviews", { vp })
      await sleep(600)
      const g = await p.evaluate(() => {
        const st = document.querySelector("[data-integration-standing]")
        const link = [...document.querySelectorAll('a[href="/app/reviews"]')].find((a) => a.getBoundingClientRect().width > 0)
        const coupons = [...document.querySelectorAll('a[href="/app/coupons"]')].find((a) => a.getBoundingClientRect().width > 0)
        return {
          page: document.querySelector("[data-integration-page]")?.getAttribute("data-integration-page") ?? null,
          back: !!document.querySelector("[data-integration-back]"),
          bar: !!document.querySelector("[data-orders-bar]"),
          h1: document.querySelector("h1")?.textContent ?? null,
          standing: st?.innerText.replace(/\s+/g, " ").trim() ?? null,
          standingLines: st ? Math.round(st.getBoundingClientRect().height / 20) : null,
          standingH: st ? Math.round(st.getBoundingClientRect().height) : null,
          note: !!document.querySelector("[data-integration-standing-note]"),
          lit: link ? getComputedStyle(link).fontWeight : null,
          unlit: coupons ? getComputedStyle(coupons).fontWeight : null,
          tabs: [...document.querySelectorAll("[data-integration-tab]")].map((t) => t.getAttribute("data-integration-tab")),
          pin: !!document.querySelector("[data-integration-pin]"),
        }
      })
      report[`reviews_${tag}`] = g
      expect(g.page === "storelib-reviews" && !g.back && !g.bar && g.h1 === "Storelib Reviews", "/app/reviews is Storelib Reviews' page: no Back to integrations, no Integrations title, its name the title", g)
      if (!isPhone(vp)) expect(g.lit !== null && g.lit !== g.unlit, "  Products › Reviews is the row lit in the sidebar", { reviews: g.lit, coupons: g.unlit })
      expect(g.standing === "Reviews Made by Storelib Connected" && g.standingH <= 26 && !g.note, "L7: where it stands is one line: Reviews, Made by Storelib, Connected; no Working on your store", { standing: g.standing, height: g.standingH })
      expect(g.tabs.join() === "overview,reviews,requests,widgets,analytics,settings", "  its six tabs", g.tabs)
      await p.screenshot({ path: join(shots, `l6-reviews-${tag}.png`) })

      /* L8: every tab in turn, then back through them. Hovered first on a computer (as a pointer is), pressed at once on a phone. */
      const TAB_PROBE = `() => {
        const s = document.querySelector("[data-integrations-scroll]")
        const tabs = document.querySelector("[data-integration-tabs]")
        const panel = document.querySelector("[data-integration-tabpanel]")
        const shown = panel ? [...panel.querySelectorAll("[data-reviews-pane]")].find((x) => !x.hidden) : null
        const grey = shown ? [...shown.querySelectorAll(".animate-pulse")].filter((el) => el.getBoundingClientRect().height > 0).length : -1
        return { on: document.querySelector('[data-integration-tab][aria-selected="true"]')?.getAttribute("data-integration-tab") ?? null, pane: shown?.getAttribute("data-reviews-pane") ?? null, grey, tabsTop: Math.round(tabs.getBoundingClientRect().top), panelH: Math.round(panel.getBoundingClientRect().height), scroll: Math.round(s.scrollTop) }
      }`
      const order = ["reviews", "requests", "widgets", "analytics", "settings", "overview", "reviews", "settings", "requests", "overview"]
      const seen = new Set(["overview"])
      const results = []
      /* Scrolled so the tabs sit near the top, as they are when someone works down the page. */
      await p.evaluate(() => { const s = document.querySelector("[data-integrations-scroll]"); s.scrollTop += document.querySelector("[data-integration-tabs]").getBoundingClientRect().top - s.getBoundingClientRect().top - 40 })
      await sleep(400)
      for (const id of order) {
        const again = seen.has(id)
        if (!isPhone(vp)) {
          const b = await p.evaluate((id) => { const r = document.querySelector(`[data-integration-tab="${id}"]`).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }, id)
          if (process.env.I27_DEBUG) console.log("hover", id, Date.now() % 100000)
          await p.mouse.move(b.x, b.y, { steps: 3 })
          await sleep(320)
          if (process.env.I27_DEBUG) console.log(id, await p.evaluate(() => [...document.querySelectorAll("[data-reviews-pane]")].map((x) => `${x.getAttribute("data-reviews-pane")}${x.hidden ? "(h)" : ""}:${x.querySelectorAll(".animate-pulse").length}`).join(" ")))
        }
        const frames = await domFilm(p, `document.querySelector('[data-integration-tab="${id}"]').click()`, TAB_PROBE, 900)
        seen.add(id)
        const firstOn = frames.findIndex((f) => f.on === id)
        const grey = frames.filter((f) => f.grey > 0).length
        const tabsMoved = Math.max(...frames.map((f) => Math.abs(f.tabsTop - frames[0].tabsTop)))
        const empty = frames.filter((f) => f.panelH < 40).length
        results.push({ id, again, firstOn, greyFrames: grey, tabsMoved, emptyFrames: empty, frames: frames.length })
        await sleep(200)
      }
      report[`tabs_${tag}`] = results
      expect(results.every((r) => r.firstOn === 0), "L8: the pressed tab is marked in the first frame after the press, every time", results.map((r) => `${r.id}:${r.firstOn}`))
      expect(results.filter((r) => r.again).every((r) => r.greyFrames === 0), "  a view opened before comes back with no grey box in any frame", results.filter((r) => r.again).map((r) => `${r.id}:${r.greyFrames}`))
      if (!isPhone(vp)) expect(results.every((r) => r.greyFrames === 0), "  with a pointer, even a first visit has none: its page is readied while the pointer is on its tab", results.map((r) => `${r.id}:${r.greyFrames}`))
      expect(results.every((r) => r.tabsMoved === 0 && r.emptyFrames === 0), "  the tabs never move on screen and the page under them is never empty", results.map((r) => `${r.id}:${r.tabsMoved}/${r.emptyFrames}`))
      /* A frame sheet of moving through them, filmed. */
      const tabFilm = await film(p, vp, async () => {
        for (const id of ["reviews", "requests", "analytics", "overview"]) {
          await p.evaluate((id) => document.querySelector(`[data-integration-tab="${id}"]`).click(), id)
          await sleep(260)
        }
      }, 200)
      await sheet(tabFilm, `l8-tabs-sheet-${tag}.jpg`, { width: isPhone(vp) ? 200 : 360, max: 16 })
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }
    if (want("L6")) {
      /* A link the bell or an email has: ?review= opens the Reviews tab on it. */
      const { p, errors } = await open(`/app/reviews?review=${ROWS[2].id}`, { vp })
      await sleep(500)
      const on = await p.evaluate(() => ({ tab: document.querySelector('[data-integration-tab][aria-selected="true"]')?.getAttribute("data-integration-tab"), search: location.search }))
      expect(on.tab === "reviews", "/app/reviews?review=<id> opens the Reviews tab", on)
      expect(errors.length === 0, "no page errors", errors)
      await p.close()
    }
  }

  writeFileSync(join(shots, "report.json"), JSON.stringify(report, null, 2))
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\n${broken ? `${broken} FAILED` : "all ok"}   (pictures in ${shots})\n`)
process.exit(broken ? 1 : 0)
