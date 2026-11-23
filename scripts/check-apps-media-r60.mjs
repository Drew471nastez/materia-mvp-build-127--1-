/**
 * ===========================================================================
 *  AN APP'S MEDIA, ITS STICKY BAR AND ITS TYPE (round 60)
 * ===========================================================================
 * The real Integrations page in the /app shell (scripts/render-apps-r58.tsx),
 * in headless Chromium at 360, 390, 768 and 1280 wide (deviceScaleFactor 2),
 * the API answered at the network edge and the YouTube thumbnails fetched
 * for real from i.ytimg.com (handed to the page 350ms late):
 *
 *   G   every gallery picture that is drawn has loaded, is lazy, has alt text
 *   CLS no layout shift inside the page through the reads and the thumbnails
 *   T   a scroll trace, 10px a frame down to 1400 and back: the bar's place,
 *       height, opacity and transform per frame, the sticky column's place,
 *       layout shifts while scrolling, how often the bar comes and goes
 *   Z   with the bar shown, the install sheet covers it
 *   V   pressing the video puts a youtube-nocookie frame in the poster's box,
 *       and nothing is asked of youtube.com before that
 *
 *   SHOTS_DIR=... LABEL=before node scripts/check-apps-media-r60.mjs
 * Writes <label>-results.json and a per-frame trace per page and width.
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const stubs = join(root, ".apps-r60-probe")
const shots = process.env.SHOTS_DIR || join(root, ".apps-r60-shots")
const LABEL = process.env.LABEL || "after"
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

const thumbs = new Map()
function ytimg(url) {
  if (!thumbs.has(url)) {
    try {
      const body = execFileSync("curl", ["-s", "-f", "--max-time", "20", url], { maxBuffer: 8 << 20 })
      thumbs.set(url, { ok: body.length > 1000, body })
    } catch {
      thumbs.set(url, { ok: false, body: null })
    }
  }
  return thumbs.get(url)
}

const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null
const PAGES_ALL = [
  { name: "printful", path: "/app/integrations?integration=printful", mode: "fresh" },
  { name: "printful-installed", path: "/app/integrations?integration=printful", mode: "connected" },
  { name: "pinterest-tag", path: "/app/integrations?integration=pinterest-tag", mode: "fresh" },
  { name: "telegram", path: "/app/integrations?integration=telegram", mode: "fresh" },
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
    alias: { "@": ".", "next/navigation": "./.apps-r60-probe/navigation.js", "next/link": "./.apps-r60-probe/link.jsx", "next/image": "./.apps-r60-probe/image.jsx" },
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
      /* The thumbnails are fetched for real from i.ytimg.com (through the session's proxy, with curl) and handed to the page as they came, after a delay like a phone's, so a late image is what is measured. */
      if (url.startsWith("https://i.ytimg.com/vi/")) {
        const got = ytimg(url)
        return void setTimeout(() => r.respond(got.ok ? { status: 200, contentType: "image/jpeg", body: got.body } : { status: 404, body: "" }).catch(() => {}), 350)
      }
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(1100)
    return { p, errors, external }
  }

  const results = []
  for (const pg of PAGES) {
    for (const vp of WIDTHS) {
      const { p, errors, external } = await open(pg.path, vp, pg.mode)
      /* Thumbnails arrive 350ms late on purpose: wait for them, then shoot. */
      await sleep(900)
      await p.screenshot({ path: join(shots, `${LABEL}-${pg.name}-${vp.width}.png`) })
      const row = { page: pg.name, width: vp.width }
      console.log(`\n${pg.name} at ${vp.width}`)
      expect(errors.length === 0, "no page errors", errors)

      /* G: the gallery's pictures. Every <img> in it that is drawn has loaded, has its box from the first frame (width and height or an aspect box), is lazy and has alt text. */
      const gallery = await p.evaluate(() => {
        const imgs = [...document.querySelectorAll("[data-app-gallery] img[data-app-photo]")].filter((i) => i.getClientRects().length > 0)
        return {
          drawn: imgs.length,
          loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
          lazy: imgs.filter((i) => i.loading === "lazy").length,
          alt: imgs.filter((i) => (i.getAttribute("alt") ?? "").trim().length > 0).length,
          ytimg: imgs.filter((i) => i.src.startsWith("https://i.ytimg.com/vi/")).length,
          more: document.querySelector("[data-app-gallery-more]")?.textContent?.trim() ?? null,
          scenes: [...document.querySelectorAll("[data-app-gallery] [data-app-scene]")].filter((s) => s.getClientRects().length > 0).length,
        }
      })
      row.gallery = gallery
      console.log("  gallery", JSON.stringify(gallery))
      expect(gallery.loaded === gallery.drawn, "G every drawn gallery picture loaded", gallery)
      expect(gallery.lazy === gallery.drawn && gallery.alt === gallery.drawn, "G every gallery picture is lazy and has alt text", gallery)
      expect(gallery.drawn > 0 || gallery.scenes > 0, "G the gallery shows pictures or Storelib's drawn scenes", gallery)

      /* CLS from the first paint, through the reads and the late thumbnails. */
      const shift = await p.evaluate(() => window.__shifts)
      const inPage = shift.filter((e) => e.page).reduce((s, e) => s + e.v, 0)
      row.clsLoad = Number(inPage.toFixed(4))
      expect(inPage === 0, "CLS 0 inside the page through the reads and the thumbnails", { inPage: row.clsLoad, shift: shift.filter((e) => e.page) })
      const wide = await p.evaluate(() => {
        const box = document.querySelector("[data-integrations-scroll]")
        return { doc: document.documentElement.scrollWidth - innerWidth, box: box ? box.scrollWidth - box.clientWidth : 0 }
      })
      expect(wide.doc <= 0 && wide.box <= 0, "W no sideways scroll", wide)
      expect(!external.some((u) => /youtube(-nocookie)?\.com/.test(u)), "V nothing from youtube.com before a press (thumbnails come from i.ytimg.com only)", external.filter((u) => /youtube/.test(u)))

      /*
        T: THE SCROLL TRACE. The page's scroller is moved 10px a frame, down
        to 1400 and back, as a finger or a wheel would; each frame records
        the bar's box, opacity and transform, the column's box (sticky from
        1024px), the Back link's opacity and every layout shift.
      */
      if (pg.mode === "fresh") {
        const trace = await p.evaluate(
          () =>
            new Promise((done) => {
              const box = document.querySelector("[data-integrations-scroll]")
              const shifts0 = window.__shifts.length
              const frames = []
              const pos = []
              for (let y = 0; y <= 1400; y += 10) pos.push(y)
              for (let y = 1400; y >= 0; y -= 10) pos.push(y)
              let i = 0
              const step = () => {
                if (i < pos.length) box.scrollTop = pos[i]
                const top = box.getBoundingClientRect().top
                const pin = document.querySelector("[data-integration-pin]")
                const card = pin?.firstElementChild
                const aside = document.querySelector("[data-app-listing-column]")
                const back = document.querySelector("[data-integration-back]")
                const pcs = pin ? getComputedStyle(pin) : null
                const r = card?.getBoundingClientRect()
                const a = aside?.getBoundingClientRect()
                frames.push({
                  y: Math.round(box.scrollTop),
                  shown: pin?.getAttribute("data-integration-pin"),
                  barTop: r ? Math.round((r.top - top) * 10) / 10 : null,
                  barH: r ? Math.round(r.height * 10) / 10 : null,
                  op: pcs ? Number(pcs.opacity) : null,
                  tf: pcs ? `${pcs.transform}|${pcs.translate}` : null,
                  asideTop: a ? Math.round((a.top - top) * 10) / 10 : null,
                  asidePos: aside ? getComputedStyle(aside).position : null,
                  backOp: back ? Number(getComputedStyle(back).opacity) : null,
                })
                i++
                if (i < pos.length + 20) requestAnimationFrame(step)
                else done({ frames, shifts: window.__shifts.slice(shifts0) })
              }
              requestAnimationFrame(step)
            }),
        )
        const f = trace.frames
        const shownFrames = f.filter((x) => x.op === 1 && x.shown === "shown")
        const barTops = new Set(shownFrames.map((x) => x.barTop))
        const barHs = new Set(f.filter((x) => x.barH !== null).map((x) => x.barH))
        let toggles = 0
        for (let k = 1; k < f.length; k++) if (f[k].shown !== f[k - 1].shown) toggles++
        /* Where the bar is drawn at full opacity it sits at one place under the top; its height never changes. */
        const cls = trace.shifts.reduce((s, e) => s + e.v, 0)
        const stuck = f.filter((x) => x.asidePos === "sticky" && x.y > 400)
        const asideTops = new Set(stuck.map((x) => x.asideTop))
        const barBottom = shownFrames.length ? Math.max(...shownFrames.map((x) => x.barTop + x.barH)) : 0
        const overlap = stuck.filter((x) => x.shown === "shown" && x.asideTop < barBottom - 0.5).length
        /* A jump is the column's box moving by more than the scroll moved it, in one frame. */
        let jump = 0
        for (let k = 1; k < f.length; k++) {
          if (f[k].asideTop === null || f[k - 1].asideTop === null) continue
          const moved = Math.abs(f[k].asideTop - f[k - 1].asideTop)
          const scrolled = Math.abs(f[k].y - f[k - 1].y)
          if (moved > scrolled + 0.5) jump = Math.max(jump, moved - scrolled)
        }
        /* Drift: a frame where the bar can be seen (opacity over 0.02) but is not where its transform alone puts it, as when its sticky box lets go near the top while it fades. */
        const rest = shownFrames.length ? shownFrames[0].barTop : 0
        let drift = 0
        for (const x of f) {
          if (x.op === null || x.op <= 0.02 || x.barTop === null) continue
          const ty = Number((/(-?[\d.e+-]+)px\s*$/.exec(x.tf.split("|")[1] ?? "") ?? [0, 0])[1])
          drift = Math.max(drift, Math.abs(x.barTop - (rest + ty)))
        }
        const tfs = new Set(f.filter((x) => x.shown === "shown" && x.op === 1).map((x) => x.tf))
        row.trace = { frames: f.length, barTops: [...barTops], barHeights: [...barHs], toggles, clsScroll: Number(cls.toFixed(4)), asideStuckTops: [...asideTops], overlapFrames: overlap, asideJumpPx: Number(jump.toFixed(1)), barDriftPx: Number(drift.toFixed(1)), restingTransforms: [...tfs] }
        console.log("  trace", JSON.stringify(row.trace))
        writeFileSync(join(shots, `${LABEL}-trace-${pg.name}-${vp.width}.json`), JSON.stringify(f))
        expect(cls === 0, "T no layout shift while scrolling", row.trace.clsScroll)
        expect(barTops.size <= 1, "T the bar, once shown, sits at one place under the top in every frame (no jump)", [...barTops])
        expect(barHs.size <= 1, "T the bar's height never changes (opacity and transform only)", [...barHs])
        expect(toggles <= 2, "T down then up: the bar comes once and goes once (no flicker)", toggles)
        expect(asideTops.size <= 1 && jump === 0, "T the sticky column holds one place and never jumps", { tops: [...asideTops], jump })
        expect(drift <= 0.5, "T the bar never moves with the page while it can be seen (it fades and slides 6px, nothing else)", row.trace.barDriftPx)
        expect(overlap === 0, "T the sticky column is never under the bar", { overlap, barBottom })

        /* Z: the sheet covers the bar. Scrolled so the bar shows, Install is pressed from the bar; at the bar's place the topmost thing is the sheet or its scrim. */
        await p.evaluate(() => { document.querySelector("[data-integrations-scroll]").scrollTop = 900 })
        await sleep(400)
        /* The bar's own Install where it has one (the column's is scrolled away); from 1024px the column's stays in view, so that one. */
        const pinBtn = (await p.$("[data-integration-pin=shown] [data-integration-pin-action-slot=shown] [data-integration-pin-action]")) ?? (await p.$("[data-app-install]"))
        if (pinBtn) {
          await pinBtn.click()
          await sleep(700)
          const z = await p.evaluate(() => {
            const card = document.querySelector("[data-integration-pin]")?.firstElementChild
            if (!card) return null
            const r = card.getBoundingClientRect()
            const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
            return { inBar: !!el?.closest("[data-integration-pin]"), sheet: !!document.querySelector("[data-install-sheet]") }
          })
          row.zUnderSheet = z
          expect(!!z && z.sheet && !z.inBar, "Z the sheet and its scrim cover the bar", z)
          await p.keyboard.press("Escape")
          const close = await p.$("[data-app-sheet=open] [data-sheet-close]")
          if (close) await close.click()
          await sleep(600)
        }
      }

      /* V: pressing the video plays it: a youtube-nocookie frame in the poster's own box. */
      await p.evaluate(() => { document.querySelector("[data-integrations-scroll]").scrollTop = 0 })
      await sleep(300)
      const poster = await p.evaluateHandle(() => [...document.querySelectorAll("[data-app-video-poster]")].find((b) => b.getClientRects().length > 0 && b.getBoundingClientRect().width > 200) ?? null)
      if (poster.asElement()) {
        const before = await p.evaluate((b) => (({ width, height }) => ({ width: Math.round(width), height: Math.round(height) }))(b.closest("[data-app-video]").getBoundingClientRect()), poster)
        await poster.asElement().click()
        await sleep(500)
        const after = await p.evaluate(() => {
          const f = [...document.querySelectorAll("[data-app-video=playing] iframe")].find((x) => x.getClientRects().length > 0)
          return f ? { src: f.getAttribute("src"), width: Math.round(f.getBoundingClientRect().width), height: Math.round(f.getBoundingClientRect().height) } : null
        })
        row.video = { before, after }
        expect(!!after && after.src.startsWith("https://www.youtube-nocookie.com/embed/") && /autoplay=1/.test(after.src), "V pressing the video loads a youtube-nocookie frame that plays", after)
        expect(!!after && after.width === before.width && after.height === before.height, "V the frame takes the poster's exact box", { before, after })
        await p.screenshot({ path: join(shots, `${LABEL}-${pg.name}-playing-${vp.width}.png`) })
      }
      results.push(row)
      await p.close()
    }
  }
  writeFileSync(join(shots, `${LABEL}-results.json`), JSON.stringify(results, null, 1))
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
