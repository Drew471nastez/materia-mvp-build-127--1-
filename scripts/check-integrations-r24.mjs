/**
 * ===========================================================================
 *  INTEGRATIONS: THE INSTALL SHEET, THE PILLS, BACK AND THE GALLERY (r24)
 * ===========================================================================
 * The real Integrations page in the /app shell (scripts/render-apps-r58.tsx),
 * in headless Chromium at 1440 and 390 wide (deviceScaleFactor 2), the API
 * answered at the network edge, nothing fetched from outside:
 *
 *   M   Install opens the sheet and its close button closes it. Every frame
 *       of both is traced: the panel's opacity, its translate and scale, its
 *       box, the scrim's opacity, and where the Install button sits on the
 *       page under it. The exit has to play (frames in between, opacity
 *       falling all the way), the page under it must not move, and nothing
 *       may flash (the panel never comes back once it has started to go).
 *   P   the category pills are one row at both widths, scroll sideways with
 *       no scrollbar, fade at the end that is cut, and a mouse drag scrolls
 *       the row without choosing a pill.
 *   B   the floating Back is hidden at the top, comes in once the page's own
 *       Back has scrolled away, and goes back to the list.
 *   G   the gallery is one YouTube cover and Storelib's pictures of the app:
 *       the pictures lazy with a srcset, nothing from youtube.com until the
 *       cover is pressed, then a youtube-nocookie frame.
 *
 *   SHOTS_DIR=... LABEL=after node scripts/check-integrations-r24.mjs
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const stubs = join(root, ".integrations-r24-probe")
const shots = process.env.SHOTS_DIR || join(root, ".integrations-r24-shots")
const LABEL = process.env.LABEL || "after"
mkdirSync(shots, { recursive: true })
mkdirSync(stubs, { recursive: true })
const ORIGIN = "https://storelib.com"
let broken = 0
const results = {}
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 500)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function answer(url) {
  const p = new URL(url).pathname
  if (p === "/api/store/integrations/installed") return { installed: [] }
  if (p === "/api/store/integrations") return { tracking: {}, ready: true, ga: null }
  if (p === "/api/physical/integrations") return { integrations: [] }
  if (p === "/api/store/integrations/marketing") return { marketing: [] }
  if (p === "/api/store/integrations/apps") return { states: { "storelib-reviews": "on", "courier-tracking": "on" }, hrefs: {} }
  if (p === "/api/store/integrations/catalog") return { overrides: [] }
  if (p === "/api/onepage/integrations") return { integrations: [] }
  return {}
}

const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null
const PAGES = ["mailchimp", "printify", "google-tag-manager", "google-ads", "pinterest-tag"].filter((p) => !ONLY || ONLY.includes(p))
const WIDTHS = [
  { width: 1440, height: 900, deviceScaleFactor: 2 },
  { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
].filter((w) => !process.env.WIDTHS || process.env.WIDTHS.split(",").includes(String(w.width)))

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
    alias: { "@": ".", "next/navigation": "./.integrations-r24-probe/navigation.js", "next/link": "./.integrations-r24-probe/link.jsx", "next/image": "./.integrations-r24-probe/image.jsx" },
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
  const cls = `<script>window.__shifts=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries()){if(!e.hadRecentInput)window.__shifts.push({v:e.value,t:Math.round(e.startTime),n:(e.sources||[]).map(s=>s.node&&s.node.nodeType===1?s.node.tagName+'.'+String(s.node.className).slice(0,60):'?')})}}).observe({type:'layout-shift',buffered:true})}catch{}</script>`
  const page = (sheet) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${cls}<style>${fonts}${sheet}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  const mouseCss = css.replace(/\(hover: hover\) and \(pointer: fine\)/g, "all").replace(/\(hover: hover\)/g, "all").replace(/\(hover: none\)/g, "not all")
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--font-render-hinting=none"], protocolTimeout: 240_000 })

  async function open(path, vp) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    const external = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)) })
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) return void setTimeout(() => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(answer(url)) }).catch(() => {}), 80)
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
    await sleep(900)
    return { p, errors, external }
  }

  /* Per frame, from the page's own rAF: the sheet's panel, the scrim, and the Install button under them. */
  const TRACE = `(() => {
    window.__frames = []
    const t0 = performance.now()
    const tick = () => {
      const sheet = document.querySelector("[data-install-sheet]")
      const panel = sheet ? (sheet.closest("[data-sheet-panel]") || sheet.closest("[role=dialog]")) : null
      const layer = sheet ? (sheet.closest("[data-install-dialog]") || sheet.closest("[data-app-sheet]")) : null
      const scrim = layer ? layer.firstElementChild : null
      const btn = document.querySelector("[data-app-install]")
      const f = { t: Math.round(performance.now() - t0), on: !!sheet }
      if (panel) {
        const cs = getComputedStyle(panel)
        const r = panel.getBoundingClientRect()
        Object.assign(f, { op: Number(cs.opacity), tr: cs.translate, sc: cs.scale, tf: cs.transform, top: Math.round(r.top * 10) / 10, h: Math.round(r.height), state: layer && (layer.getAttribute("data-install-dialog") || layer.getAttribute("data-app-sheet")) })
      }
      if (scrim) f.scrim = Number(getComputedStyle(scrim).opacity)
      if (btn) f.btn = Math.round(btn.getBoundingClientRect().top * 10) / 10
      window.__frames.push(f)
      if (performance.now() - t0 < 1100) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })()`

  for (const id of PAGES) {
    for (const vp of WIDTHS) {
      const key = `${id}-${vp.width}`
      results[key] = {}
      const { p, errors, external } = await open(`/app/integrations?integration=${id}`, vp)
      console.log(`\n${id} at ${vp.width}`)
      expect(errors.length === 0, "no page errors", errors)
      await p.screenshot({ path: join(shots, `${LABEL}-${id}-${vp.width}.png`) })

      /* ---- G: the gallery ---- */
      const g = await p.evaluate(() => {
        const box = document.querySelector("[data-app-gallery]")
        if (!box) return null
        const row = innerWidth < 1024 ? box.querySelector("[data-app-gallery-row]") : box.firstElementChild
        return {
          count: Number(box.getAttribute("data-app-gallery-count")),
          videos: row.querySelectorAll("[data-app-video]").length,
          pictures: [...new Map([...row.querySelectorAll("img[data-app-shot]")].map((i) => [i.alt, i])).values()].map((i) => ({ lazy: i.loading, srcset: (i.getAttribute("srcset") || "").split(",").length, alt: i.alt.length, w: i.getAttribute("width"), h: i.getAttribute("height"), done: i.complete && i.naturalWidth > 0, cur: i.currentSrc.split("/").pop() })),
        }
      })
      results[key].gallery = g
      expect(!!g && g.videos === 1, "G exactly one video in the gallery", g && g.videos)
      expect(!!g && g.pictures.length >= 2 && g.pictures.length <= 3 && g.pictures.every((x) => x.lazy === "lazy" && x.srcset >= 2 && x.alt > 10 && x.w && x.h), "G two or three pictures of the app, lazy, with a srcset, sized and described", g && g.pictures)
      expect(!external.some((u) => /youtube\.com|youtube-nocookie/.test(u)), "G nothing from youtube.com before the cover is pressed", external.filter((u) => /youtube/.test(u)))

      /* ---- P: the pills, on the list ---- */
      {
        const q = await open(`/app/integrations`, vp)
        const row = await q.p.evaluate(() => {
          const el = document.querySelector("[data-integration-pills]")
          const pills = [...el.querySelectorAll("[data-integration-pill]")]
          const tops = new Set(pills.map((b) => Math.round(b.getBoundingClientRect().top)))
          const cs = getComputedStyle(el)
          return { rows: tops.size, pills: pills.length, h: Math.round(el.getBoundingClientRect().height), sw: el.scrollWidth, cw: el.clientWidth, overflowX: cs.overflowX, scrollbar: el.offsetHeight - el.clientHeight, sbw: cs.scrollbarWidth, fadeEnd: el.hasAttribute("data-fade-end"), fadeStart: el.hasAttribute("data-fade-start"), mask: cs.maskImage !== "none" || (cs.webkitMaskImage && cs.webkitMaskImage !== "none") }
        })
        results[key].pills = row
        expect(row.rows === 1, "P the pills are one row", row)
        expect(row.overflowX === "auto" && row.scrollbar === 0, "P the row scrolls sideways with no scrollbar showing", row)
        if (row.sw > row.cw + 1) {
          expect(row.fadeEnd && !row.fadeStart && row.mask, "P the cut end fades, the whole one does not", row)
          if (vp.width >= 768) {
            /* A mouse drag scrolls the row and does not choose the pill it started on. */
            const r = await q.p.evaluate(() => { const b = document.querySelector("[data-integration-pill]:nth-child(3)").getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } })
            const before = await q.p.evaluate(() => ({ at: document.querySelector("[data-integration-pills]").scrollLeft, on: document.querySelector("[data-integration-pill][aria-selected=true]").getAttribute("data-integration-pill") }))
            await q.p.mouse.move(r.x, r.y)
            await q.p.mouse.down()
            for (let i = 1; i <= 12; i++) await q.p.mouse.move(r.x - i * 15, r.y)
            await q.p.mouse.up()
            await sleep(150)
            const after = await q.p.evaluate(() => ({ at: document.querySelector("[data-integration-pills]").scrollLeft, on: document.querySelector("[data-integration-pill][aria-selected=true]").getAttribute("data-integration-pill"), fadeStart: document.querySelector("[data-integration-pills]").hasAttribute("data-fade-start") }))
            results[key].drag = { before, after }
            expect(after.at > before.at + 100 && after.on === before.on && after.fadeStart, "P a mouse drag scrolls the row, chooses nothing, and the start fades once scrolled", { before, after })
          } else {
            const at = await q.p.evaluate(async () => { const el = document.querySelector("[data-integration-pills]"); el.scrollBy({ left: 160 }); await new Promise((r) => setTimeout(r, 200)); return { at: el.scrollLeft, fadeStart: el.hasAttribute("data-fade-start") } })
            expect(at.at > 100 && at.fadeStart, "P the row scrolls with a swipe and the start fades once scrolled", at)
          }
        }
        await q.p.evaluate(() => { const el = document.querySelector("[data-integration-pills]"); el.scrollLeft = 0 })
        await sleep(120)
        await q.p.screenshot({ path: join(shots, `${LABEL}-list-${vp.width}.png`) })
        await q.p.close()
      }

      /* ---- M: the sheet, open and closed ---- */
      const btn = await p.$("[data-app-install]")
      expect(!!btn, "M an Install button")
      if (btn) {
        await p.evaluate(() => { window.__shifts = [] })
        await p.evaluate(TRACE)
        await btn.click()
        await sleep(1150)
        const opening = await p.evaluate(() => window.__frames)
        await p.screenshot({ path: join(shots, `${LABEL}-${id}-sheet-${vp.width}.png`) })
        const close = await p.$("[data-install-dialog] [data-close], [data-app-sheet=open] [data-sheet-close]")
        await p.evaluate(TRACE)
        if (close) await close.click()
        else await p.keyboard.press("Escape")
        await sleep(1150)
        const closing = await p.evaluate(() => window.__frames)
        const shifts = await p.evaluate(() => window.__shifts)
        results[key].sheet = { opening, closing, shifts }
        writeFileSync(join(shots, `${LABEL}-${id}-${vp.width}-sheet-trace.json`), JSON.stringify({ opening, closing, shifts }, null, 1))
        const shown = opening.filter((f) => f.op !== undefined)
        const inBetweenIn = shown.filter((f) => f.op > 0.02 && f.op < 0.98).length
        const tIn = shown.find((f) => f.op >= 0.999)?.t
        const exit = closing.filter((f) => f.op !== undefined)
        const startOut = exit.findIndex((f, i) => i > 0 && f.op < exit[0].op - 0.001)
        const goneAt = closing.find((f) => !f.on)?.t ?? null
        const inBetweenOut = exit.filter((f) => f.op > 0.02 && f.op < 0.98).length
        let rises = 0
        for (let i = 1; i < exit.length; i++) if (exit[i].op > exit[i - 1].op + 0.001) rises++
        const lastOp = exit.length ? exit[exit.length - 1].op : null
        const btnMoves = new Set([...opening, ...closing].map((f) => f.btn).filter((v) => v !== undefined)).size
        const sum = { inFrames: inBetweenIn, tIn, outFrames: inBetweenOut, goneAt, rises, lastOp, btnPlaces: btnMoves, shifts: shifts.length, startOut }
        results[key].sheetSummary = sum
        console.log("   sheet:", JSON.stringify(sum))
        const phone = vp.width < 640
        const risingTops = shown.filter((f, i) => i > 0 && f.top < shown[i - 1].top - 0.5).length
        expect(phone ? risingTops >= 4 : inBetweenIn >= 4, "M it comes in over several frames", phone ? risingTops : inBetweenIn)
        expect(phone ? true : inBetweenOut >= 4, "M the dialog's way out plays (frames in between)", inBetweenOut)
        if (phone) {
          /* The phone sheet goes down on transform; read its travel. */
          const ys = exit.map((f) => f.top)
          const between = ys.filter((y, i) => i > 0 && y > ys[0] + 4 && y < vp.height - 4).length
          expect(between >= 4, "M the phone sheet slides down over several frames", { between, ys: ys.slice(0, 40) })
        }
        expect(rises === 0, "M no flash: once it starts to go it never comes back", { rises })
        expect(goneAt !== null, "M it is gone at the end", goneAt)
        expect(!phone ? (lastOp ?? 0) < 0.1 : true, "M the last frame drawn before it goes is (nearly) clear, so nothing is cut", lastOp)
        expect(btnMoves <= 1, "M the page under it does not move", [...new Set([...opening, ...closing].map((f) => f.btn))])
        expect(shifts.length === 0, "M no layout shift while it opens and closes", shifts)
      }

      /* ---- B: the floating Back ---- */
      if (await p.$("[data-integration-float-back]")) {
        const at0 = await p.evaluate(() => { const b = document.querySelector("[data-integration-float-back]"); return b ? { state: b.getAttribute("data-integration-float-back"), op: Number(getComputedStyle(b).opacity) } : null })
        expect(!!at0 && at0.state === "hidden" && at0.op === 0, "B the floating Back is hidden at the top", at0)
        await p.evaluate(() => { document.querySelector("[data-integrations-scroll]").scrollTop = 0 })
        await p.evaluate(() => {
          window.__back = []
          const box = document.querySelector("[data-integrations-scroll]")
          let n = 0
          const step = () => {
            box.scrollTop += 12
            const b = document.querySelector("[data-integration-float-back]")
            const r = b.getBoundingClientRect()
            window.__back.push({ s: box.scrollTop, op: Number(getComputedStyle(b).opacity), top: Math.round(r.top), tr: getComputedStyle(b).translate })
            if (++n < 60) requestAnimationFrame(step)
          }
          requestAnimationFrame(step)
        })
        await sleep(1600)
        const trace = await p.evaluate(() => window.__back)
        results[key].back = trace
        const last = trace[trace.length - 1]
        const tops = new Set(trace.filter((f) => f.op > 0.98).map((f) => f.top))
        const mid = trace.filter((f) => f.op > 0.02 && f.op < 0.98).length
        expect(last.op === 1, "B shown once scrolled down", last)
        expect(mid >= 3, "B it fades in over frames, not cut in", mid)
        expect(tops.size <= 1, "B once in, it stays at one place while the page scrolls under it", [...tops])
        await p.screenshot({ path: join(shots, `${LABEL}-${id}-scrolled-${vp.width}.png`) })
        const geo = await p.evaluate(() => { const b = document.querySelector("[data-integration-float-back] button"); const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); return { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), top: Math.round(r.top), radius: cs.borderRadius, shadow: cs.boxShadow.slice(0, 120), text: b.textContent.trim() } })
        results[key].backGeo = geo
        expect(geo.h >= 40 && geo.text === "Back", "B a round control named Back, 40px or more", geo)
        await p.click("[data-integration-float-back] button")
        await sleep(500)
        const url = await p.evaluate(() => location.pathname + location.search)
        expect(url === "/app/integrations", "B it goes back to the list", url)
      }

      /* ---- V: the video plays on a press ---- */
      {
        const q = await open(`/app/integrations?integration=${id}`, vp)
        const sel = vp.width >= 1024 ? "[data-app-gallery-main] [data-app-video-poster]" : "[data-app-gallery-row] [data-app-video-poster]"
        const poster = await q.p.$(sel)
        expect(!!poster, "V the video's cover is a button", sel)
        if (poster) {
          await poster.click()
          await sleep(400)
          const src = await q.p.evaluate(() => [...document.querySelectorAll("[data-app-video] iframe")].map((f) => f.getAttribute("src")))
          expect(src.length === 1 && src[0].startsWith("https://www.youtube-nocookie.com/embed/"), "V a youtube-nocookie frame, only after the press", src)
        }
        await q.p.close()
      }
      await p.close()
    }
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
writeFileSync(join(shots, `${LABEL}-results.json`), JSON.stringify(results, null, 1))
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
