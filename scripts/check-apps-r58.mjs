/**
 * ===========================================================================
 *  AN APP'S PAGE, ITS INSTALL SHEET AND ITS INSTALLED PAGE (round 58)
 * ===========================================================================
 * The real Integrations page and the real Reviews page in the /app shell
 * (scripts/render-apps-r58.tsx), in headless Chromium at 360, 390, 768 and
 * 1280 wide (deviceScaleFactor 2), with the API answered at the network edge:
 *
 *   shots     Printful before it is connected, Printful connected (its
 *             installed page), ShipStation, Mailchimp and Storelib Reviews,
 *             at the four widths, into SHOTS_DIR/<label>-<page>-<width>.png
 *   MEASURE=1 also measures, at each width:
 *     CLS     layout shift after the first paint, through the page's own
 *             reads arriving (0 is the claim)
 *     K       no key field is drawn on the page before Install is pressed
 *     M       Install opens the sheet (a dialog on a computer, a bottom sheet
 *             on a phone), its steps numbered, its key field inside it; the
 *             sheet's frames during opening and closing move on transform
 *             and opacity only; it is gone after closing
 *     V       the video is not loaded until its poster is pressed, and then
 *             it is a youtube-nocookie.com frame
 *     W       no sideways scroll
 *
 *   SHOTS_DIR=... LABEL=before node scripts/check-apps-r58.mjs
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const stubs = join(root, ".apps-r58-probe")
const shots = process.env.SHOTS_DIR || join(root, ".apps-r58-shots")
const LABEL = process.env.LABEL || "after"
const MEASURE = process.env.MEASURE === "1"
mkdirSync(shots, { recursive: true })
mkdirSync(stubs, { recursive: true })
const ORIGIN = "https://storelib.com"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 400)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const PRINTFUL_ON = { provider: "printful", status: "connected", url: null, keyHint: "a1b2", secretHint: null, lastSyncAt: "2026-11-22T09:12:00Z", lastError: null, account: "Mara Lind Prints", verifiedAt: "2026-11-20T08:00:00Z", autoConfirm: false, webhooks: "on", location: { id: "loc1", name: "Printful" }, ordersSent: 14 }

function answer(url, mode) {
  const p = new URL(url).pathname
  if (p === "/api/store/integrations/installed") return { installed: mode === "connected" ? [{ id: "printful", name: "Printful", logo: "/integrations/printful.svg", needsAttention: false }] : [] }
  if (p === "/api/store/integrations") return { tracking: {}, ready: true, ga: null }
  if (p === "/api/physical/integrations") return { integrations: mode === "connected" ? [PRINTFUL_ON] : [] }
  if (p === "/api/store/integrations/marketing") return { marketing: [] }
  if (p === "/api/store/integrations/apps") return { states: { "storelib-reviews": "on", "courier-tracking": "on" }, hrefs: {} }
  if (p === "/api/store/integrations/catalog") return { overrides: [] }
  if (p === "/api/store/reviews-app") return { ready: true, counts: { pending: 2, published: 31, asked: 12 }, settings: { enabled: true, enabledAt: "2026-09-01T10:00:00Z", publish: "auto", minStars: 1, photos: true, who: "verified", request: { enabled: true, digitalDays: 7, physicalDays: 7, physicalFrom: "delivered", reminder: true, reminderDays: 7 }, display: { starColor: "#f5a524", showVerified: true, showDate: true, showPhotos: true, showCardRating: true, productPage: true, sort: "featured", perPage: 6 }, editDays: 30 } }
  if (p === "/api/app/reviews/overview") return { ready: true, app: { enabled: true, ready: true }, summary: { total: 36, published: 31, pending: 2, hidden: 3, reported: 0, unanswered: 4, verifiedPublished: 27, distribution: [{ stars: 5, count: 22 }, { stars: 4, count: 6 }, { stars: 3, count: 2 }, { stars: 2, count: 1 }, { stars: 1, count: 0 }], average: 4.6, photos: 5 }, funnel: { sent: 40, delivered: 39, opened: 25, clicked: 14, submitted: 12, scheduled: 3, responseRate: 30 }, recent: [{ id: "r1", rating: 5, title: "Lovely print", excerpt: "The colours are exactly as shown and it arrived quickly.", name: "Ana P.", created_at: "2026-11-20T10:00:00Z", status: "published", verified: true, product: "Harbour print" }] }
  if (p === "/api/onepage/integrations") return { integrations: [] }
  if (p === "/api/store/tracking-app") return { tracking: { platform: { on: true, providerName: "17TRACK", webhooks: true }, ready: true, own: null, following: 0, lastCheckedAt: null } }
  return {}
}

const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null
const PAGES_ALL = [
  { name: "printful", path: "/app/integrations?integration=printful", mode: "fresh" },
  { name: "printful-installed", path: "/app/integrations?integration=printful", mode: "connected" },
  { name: "shipstation", path: "/app/integrations?integration=shipstation", mode: "fresh" },
  { name: "mailchimp", path: "/app/integrations?integration=mailchimp", mode: "fresh" },
  { name: "reviews", path: "/app/reviews", mode: "fresh" },
]
const PAGES = PAGES_ALL.filter((p) => !ONLY || ONLY.includes(p.name))
const WIDTHS_ALL = [
  { width: 360, height: 780, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { width: 768, height: 1024, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { width: 1280, height: 800, deviceScaleFactor: 2 },
]
const WIDTHS = WIDTHS_ALL.filter((w) => !process.env.WIDTHS || process.env.WIDTHS.split(",").includes(String(w.width)))

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
    alias: { "@": ".", "next/navigation": "./.apps-r58-probe/navigation.js", "next/link": "./.apps-r58-probe/link.jsx", "next/image": "./.apps-r58-probe/image.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })); b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: nav })) } }],
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
    entryPoints: [join(root, "scripts/render-apps-r58.tsx")],
    format: "iife",
    outfile: join(stubs, "page.js"),
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  })
  const css = await appCss(root)
  const fonts = interFaces(root)
  const js = readFileSync(join(stubs, "page.js"), "utf8")
  /* A layout-shift observer from before the first paint, so every shift is counted. */
  const cls = `<script>window.__shifts=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries()){if(!e.hadRecentInput)window.__shifts.push({v:e.value,t:Math.round(e.startTime),n:(e.sources||[]).map(s=>s.node&&s.node.nodeType===1?s.node.tagName+'.'+String(s.node.className).slice(0,60):'?'),page:(e.sources||[]).some(s=>s.node&&s.node.nodeType===1&&!!s.node.closest('[data-integrations-scroll]'))})}}).observe({type:'layout-shift',buffered:true})}catch{}</script>`
  const page = (sheet) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${cls}<style>${fonts}${sheet}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  const mouseCss = css.replace(/\(hover: hover\) and \(pointer: fine\)/g, "all").replace(/\(hover: hover\)/g, "all").replace(/\(hover: none\)/g, "not all")
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--font-render-hinting=none"], protocolTimeout: 240_000 })

  async function open(path, vp, mode) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    await p.setCacheEnabled(false)
    const errors = []
    const external = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)) })
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) return void setTimeout(() => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(answer(url, mode)) }).catch(() => {}), 120)
      if (url.startsWith(`${ORIGIN}/integrations/`) || url.startsWith(`${ORIGIN}/apps/`)) {
        const file = join(root, "public", decodeURIComponent(new URL(url).pathname))
        const type = { svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", webp: "image/webp" }[file.split(".").pop()] ?? "application/octet-stream"
        try {
          return void r.respond({ status: 200, contentType: type, body: readFileSync(file) })
        } catch {
          return void r.respond({ status: 404, body: "" })
        }
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: vp.width < 768 ? page(css) : page(mouseCss) })
      if (url.startsWith("data:")) return r.continue()
      external.push(url)
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(1100)
    return { p, errors, external }
  }

  for (const pg of PAGES) {
    for (const vp of WIDTHS) {
      const { p, errors, external } = await open(pg.path, vp, pg.mode)
      if (errors.length) console.log(pg.name, vp.width, "page errors:", errors)
      if (process.env.DEBUG) console.log(pg.name, vp.width, await p.evaluate(() => ({ len: document.getElementById("app").innerHTML.length, url: location.href, text: document.body.innerText.slice(0, 200) })))
      await p.screenshot({ path: join(shots, `${LABEL}-${pg.name}-${vp.width}.png`) })
      if (MEASURE) {
        console.log(`\n${pg.name} at ${vp.width}`)
        expect(errors.length === 0, "no page errors", errors)
        const shift = await p.evaluate(() => window.__shifts)
        const total = shift.reduce((s, e) => s + e.v, 0)
        const inPage = shift.filter((e) => e.page).reduce((s, e) => s + e.v, 0)
        expect(inPage === 0, "CLS 0 after first paint, inside the page", { inPage: Number(inPage.toFixed(4)), shell: Number((total - inPage).toFixed(4)), shift })
        const wide = await p.evaluate(() => {
          const box = document.querySelector("[data-integrations-scroll]")
          return { doc: document.documentElement.scrollWidth - innerWidth, box: box ? box.scrollWidth - box.clientWidth : 0 }
        })
        expect(wide.doc <= 0 && wide.box <= 0, "W no sideways scroll", wide)
        expect(!external.some((u) => /youtube|ytimg/.test(u)), "V nothing from YouTube before the poster is pressed", external.filter((u) => /youtube|ytimg/.test(u)))
        if (pg.mode === "fresh" && pg.name !== "reviews") {
          const keyOnPage = await p.evaluate(() => [...document.querySelectorAll("input[type=password], [data-integration-key]")].filter((el) => !el.closest("[role=dialog]") && el.getBoundingClientRect().height > 0).length)
          expect(keyOnPage === 0, "K no key field on the page before Install", keyOnPage)
          const btn = await p.$("[data-app-install]")
          expect(!!btn, "M an Install button in the listing's column")
          if (btn) {
            /* Frames of the sheet while it opens: what it animates. */
            await p.evaluate(() => {
              window.__frames = []
              const t0 = performance.now()
              const tick = () => {
                const el = document.querySelector("[data-install-sheet]")
                if (el) {
                  const box = el.closest("[role=dialog]") || el
                  const cs = getComputedStyle(box)
                  window.__frames.push({ t: Math.round(performance.now() - t0), op: cs.opacity, tf: cs.transform, h: box.offsetHeight })
                }
                if (performance.now() - t0 < 700) requestAnimationFrame(tick)
              }
              requestAnimationFrame(tick)
            })
            await btn.click()
            await sleep(800)
            const sheet = await p.evaluate(() => {
              const el = document.querySelector("[data-install-sheet]")
              if (!el) return null
              const dlg = el.closest("[role=dialog]")
              return {
                steps: [...el.querySelectorAll("[data-install-step]")].map((s) => s.textContent.trim().slice(0, 60)),
                key: !!el.querySelector("input[type=password]"),
                phoneSheet: !!el.closest("[data-app-sheet]"),
                rect: dlg ? (({ x, y, width, height }) => ({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }))(dlg.getBoundingClientRect()) : null,
              }
            })
            const frames = await p.evaluate(() => window.__frames)
            expect(!!sheet && sheet.steps.length >= 2, "M the sheet opens with numbered steps", sheet)
            expect(!!sheet && (pg.name === "mailchimp" || sheet.key), "M the key field is in the sheet", sheet && sheet.key)
            const heights = new Set(frames.map((f) => f.h))
            expect(heights.size <= 1, "M the sheet's height never changes while it opens (transform and opacity only)", { heights: [...heights], frames: frames.length })
            await p.screenshot({ path: join(shots, `${LABEL}-${pg.name}-sheet-${vp.width}.png`) })
            await p.keyboard.press("Escape")
            if (vp.width < 768) {
              const close = await p.$("[data-app-sheet=open] [data-sheet-close]")
              if (close) await close.click()
            }
            await sleep(700)
            const gone = await p.evaluate(() => !document.querySelector("[data-app-sheet=open] [data-install-sheet]") && !document.querySelector("[data-modal-dialog] [data-install-sheet]"))
            expect(gone, "M the sheet is gone after closing")
          }
        }
        const poster = await p.$("[data-app-video-poster]")
        if (poster) {
          await poster.click()
          await sleep(400)
          const src = await p.evaluate(() => document.querySelector("[data-app-video] iframe")?.getAttribute("src") ?? null)
          expect(!!src && src.startsWith("https://www.youtube-nocookie.com/embed/"), "V pressing the poster loads a youtube-nocookie frame", src)
        }
      }
      await p.close()
    }
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
