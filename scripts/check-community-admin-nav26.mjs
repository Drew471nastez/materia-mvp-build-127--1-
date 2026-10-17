/**
 * ===========================================================================
 *  ROUND 26 (W2), MEASURED: THE COMMUNITY ADMIN'S ROW OF TABS AND OVERVIEW
 * ===========================================================================
 * Headless Chromium over the real shell, the real sections and the real
 * Overview (scripts/render-community-admin-nav26.tsx), under a stand-in for
 * the /app header with its two rounded corners, at 1440x900, 820x1180 and
 * 390x844 (touch, the CPU slowed 4x):
 *
 *   STICKY    scrolled, the row of tabs sits at the top of the pane, right
 *             under the header and never under it; the pill's room above and
 *             below inside the row (balanced, and not tight against the edge)
 *   HOVER     every tab pointed at, at the top and stuck: every tab's box,
 *             the row, the strip's scroll, the pane's scroll and the first
 *             card, read on every frame from before the pointer arrives until
 *             the hover has settled; the largest movement of any of them
 *   WHEEL     a wheel over the row scrolls the page, never the strip up and
 *             down; a sideways wheel at the strip's end goes no further
 *   SWITCH    every tab pressed in turn, then again: the tabs and the row on
 *             every frame, frames with no section or two, the frame (the
 *             section's shape while it comes) only on a first visit, the
 *             first card where the frame's was
 *   SCROLL    a section scrolled, another opened, the first again: it is
 *             where it was; stuck, a press keeps the row at the top
 *   KEYS      Tab reaches the tabs, the ring shows, Enter opens the section
 *             and keeps the focus on its tab
 *   PHONE     the row scrolls sideways with no scrollbar, the page never
 *             does; the pressed tab is brought into view, gradually
 *   OVERVIEW  at most four figures, none twice, no selector or chart; a
 *             phone stacks them as rows; free, new and busy communities
 *   MEMBERS   the Members card shows its table only when it is wide enough
 *             (860px), the rows below; no header runs into the next; the
 *             search keeps its room; at 820, 1024, 1150, 1440 and 390
 *   DELETING  a community being deleted: the banner says when, and that
 *             Settings keeps it
 *   CHROME    every section at each size, light, and with the dark attribute
 *             on <html> (which /app never carries: lib/appearance), for
 *             pictures to look at
 *
 *   node scripts/check-community-admin-nav26.mjs [STICKY HOVER ...]
 *   SHOTS_DIR=dir keeps the pictures (.nav26-admin-shots by default; delete it before committing)
 *   BASE_SRC=dir measures an older copy of components/community and lib/communities (git archive), for a before
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()))
const want = (s) => only.size === 0 || only.has(s)
const stubs = join(root, ".community-admin-nav26-probe")
const shots = process.env.SHOTS_DIR || join(root, ".nav26-admin-shots")
const ORIGIN = "https://storelib.com"
const BASE = "/app/community/salajanywood"
const DELAY = 450
const TABS = ["overview", "page", "feed", "spaces", "classroom", "events", "members", "moderation", "analytics", "settings"]
let broken = 0
const results = {}
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

mkdirSync(stubs, { recursive: true })
mkdirSync(shots, { recursive: true })
try {
  writeFileSync(
    join(stubs, "navigation.js"),
    `import { useMemo, useSyncExternalStore } from "react"
const DELAY = Number(new URLSearchParams(location.search).get("delay") ?? ${DELAY})
const listeners = new Set()
let state = { pathname: location.pathname, search: location.search, routed: location.pathname + location.search, v: 0 }
const set = (p) => { state = { ...state, ...p }; listeners.forEach((f) => f()) }
const log = (k, a) => (window.__router ||= []).push([k, a, Math.round(performance.now())])
const push0 = history.pushState.bind(history)
const replace0 = history.replaceState.bind(history)
history.pushState = (s, u, url) => { push0(s, u, url); set({ pathname: location.pathname, search: location.search }) }
history.replaceState = (s, u, url) => { replace0(s, u, url); set({ pathname: location.pathname, search: location.search }) }
window.addEventListener("popstate", () => set({ pathname: location.pathname, search: location.search }))
window.__probeRouter = { subscribe: (f) => (listeners.add(f), () => listeners.delete(f)), get: () => state }
const router = {
  push: (h) => { log("push", h); setTimeout(() => { push0(null, "", h); set({ pathname: location.pathname, search: location.search, routed: h, v: state.v + 1 }) }, DELAY) },
  replace: (h) => { log("replace", h); setTimeout(() => { replace0(null, "", h); set({ pathname: location.pathname, search: location.search, routed: h, v: state.v + 1 }) }, DELAY) },
  prefetch: (h) => log("prefetch", h),
  refresh: () => { log("refresh", location.pathname + location.search); setTimeout(() => set({ routed: location.pathname + location.search, v: state.v + 1 }), DELAY) },
  back: () => history.back(),
  forward: () => history.forward(),
}
window.__probeRouterApi = router
export const usePathname = () => useSyncExternalStore(window.__probeRouter.subscribe, () => state.pathname, () => state.pathname)
export const useSearchParams = () => { const s = useSyncExternalStore(window.__probeRouter.subscribe, () => state.search, () => state.search); return useMemo(() => new URLSearchParams(s), [s]) }
export const useRouter = () => router
export const redirect = () => {}
export const permanentRedirect = () => {}
export const notFound = () => {}
`,
  )
  writeFileSync(
    join(stubs, "link.jsx"),
    `import React from "react"
import { useRouter } from "next/navigation"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, unstable_dynamicOnHover, ...rest }, ref) {
  const router = useRouter()
  return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (e.defaultPrevented) return; e.preventDefault(); router.push(href) } }, children)
})
`,
  )
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"\nexport default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }\n`)
  writeFileSync(
    join(stubs, "supabase-client.js"),
    `export function createClient() { const ch = { on() { return ch }, subscribe() { return ch } }; return { channel: () => ch, removeChannel() {}, auth: { getSession: async () => ({ data: { session: null } }) } } }\nexport const isNativePlatform = () => false\n`,
  )
  let sheet = null
  if (process.env.BASE_SRC) {
    sheet = join(stubs, "globals-with-base.css")
    writeFileSync(sheet, `${readFileSync(join(root, "app/globals.css"), "utf8")}\n@source "${process.env.BASE_SRC}";\n`)
  }
  const css = await appCss(root, sheet)
  const fonts = interFaces(root)
  /* The dark look is its own stylesheet (app/layout.tsx imports it beside globals.css); it only applies under the attribute. */
  const darkCss = readFileSync(join(root, "app/theme-dark.css"), "utf8")
  const { build } = await import("esbuild")
  await build({
    entryPoints: [process.env.HARNESS || join(root, "scripts/render-community-admin-nav26.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.community-admin-nav26-probe/navigation.js", "next/link": "./.community-admin-nav26-probe/link.jsx", "next/image": "./.community-admin-nav26-probe/image.jsx" },
    plugins: [
      { name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } },
      ...(process.env.BASE_SRC
        ? [{ name: "base-src", setup(b) { b.onResolve({ filter: /^(@|\.)\/(components\/community|lib\/communities)\// }, (args) => (args.resolveDir === root || args.path.startsWith("@") ? b.resolve(`./${args.path.replace(/^(@|\.)\//, "")}`, { resolveDir: process.env.BASE_SRC, kind: args.kind }) : undefined)) } }]
        : []),
    ],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "admin.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "admin.js"), "utf8")
  const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style><style>${darkCss}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], protocolTimeout: 240_000, timeout: 120_000 })
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const TABLET = { width: 820, height: 1180, deviceScaleFactor: 1 }
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
  const SIZES = [["1440", DESK], ["820", TABLET], ["390", PHONE]]

  async function open(path, vp, { cpu = vp === PHONE ? 4 : 1 } = {}) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    if (cpu > 1) {
      const cdp = await p.target().createCDPSession()
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
    }
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    p.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text().slice(0, 400)}`))
    await p.evaluateOnNewDocument(() => {
      window.__errs = []
      window.addEventListener("error", (e) => window.__errs.push(String(e.error?.stack || e.message).slice(0, 900)))
    })
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        let body = {}
        if (url.includes("/words")) body = { words: ["spam"], action: "block" }
        else if (url.includes("/api/domains")) body = { domains: [], purposes: ["community"], communities: [] }
        else if (url.includes("/members?")) body = { rows: [], next: null, capped: false }
        else if (url.includes("/scheduled-posts")) body = { ready: true, rows: [], spaces: [{ id: "s1", name: "General", kind: "feed" }] }
        return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(cpu > 1 ? 1500 : 700)
    return { p, errors }
  }
  /* A screenshot now and then never comes back from headless Chromium: ask again rather than wait out the protocol. */
  async function snap(p, opts) {
    for (let i = 0; ; i++) {
      await p.bringToFront()
      const t = new Promise((_, no) => setTimeout(() => no(new Error("screenshot timed out")), 15_000))
      try {
        return await Promise.race([p.screenshot({ captureBeyondViewport: false, ...opts }), t])
      } catch (e) {
        if (i >= 3) throw e
        await sleep(300)
      }
    }
  }
  const shot = (p, name, clip) => snap(p, { path: join(shots, `${name}.png`), ...(clip ? { clip } : {}) })

  /* Everything that must not move, to the hundredth of a pixel. */
  const GEOMETRY = () => {
    const r2 = (n) => Math.round(n * 100) / 100
    const rect = (el) => {
      if (!el) return null
      const b = el.getBoundingClientRect()
      return { x: r2(b.left), y: r2(b.top), w: r2(b.width), h: r2(b.height) }
    }
    const pane = document.querySelector("[data-community-shell]")
    const strip = document.querySelector("[data-section-tabs]")
    const screen = [...document.querySelectorAll("[data-section-screen]")].find((el) => el.offsetHeight > 0)
    const first = screen ? [...screen.querySelectorAll("section, [data-frame-card]")].find((el) => el.offsetHeight > 0) : null
    return {
      tabs: [...document.querySelectorAll("[data-section-tabs] [data-tab]")].map((t) => ({ id: t.getAttribute("data-tab"), ...rect(t), fw: getComputedStyle(t).fontWeight, ls: getComputedStyle(t).letterSpacing })),
      row: rect(document.querySelector("[data-community-tabs-bar]")),
      strip: { ...rect(strip), left: r2(strip.scrollLeft), top: r2(strip.scrollTop) },
      pane: r2(pane.scrollTop),
      card: rect(first),
    }
  }
  /* The largest difference between two readings, and where. */
  function drift(a, b) {
    let max = 0
    let where = ""
    const cmp = (x, y, name) => {
      for (const k of ["x", "y", "w", "h", "left", "top"]) {
        if (x?.[k] === undefined || y?.[k] === undefined) continue
        const d = Math.abs(x[k] - y[k])
        if (d > max) {
          max = d
          where = `${name}.${k}`
        }
      }
    }
    a.tabs.forEach((t, i) => cmp(t, b.tabs[i], `tab:${t.id}`))
    cmp(a.row, b.row, "row")
    cmp(a.strip, b.strip, "strip")
    cmp(a.card, b.card, "card")
    if (Math.abs(a.pane - b.pane) > max) {
      max = Math.abs(a.pane - b.pane)
      where = "pane.scrollTop"
    }
    const weights = a.tabs.some((t, i) => t.fw !== b.tabs[i].fw || t.ls !== b.tabs[i].ls)
    return { max: Math.round(max * 100) / 100, where, weights }
  }
  /* Reads GEOMETRY on every frame until stop() and keeps the largest drift from the first reading. */
  const startWatch = (p) =>
    p.evaluate((src) => {
      const geometry = new Function(`return (${src})()`)
      window.__watch = { first: geometry(), frames: [], on: true }
      const tick = () => {
        if (!window.__watch.on) return
        window.__watch.frames.push(geometry())
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, GEOMETRY.toString())
  const stopWatch = async (p) => {
    const w = await p.evaluate(() => {
      window.__watch.on = false
      return window.__watch
    })
    let worst = { max: 0, where: "", weights: false }
    for (const f of w.frames) {
      const d = drift(w.first, f)
      if (d.max > worst.max || (d.weights && !worst.weights)) worst = d
    }
    return { ...worst, frames: w.frames.length }
  }
  /*
    THE PIXELS, NOT ONLY THE BOXES. A box can stay put while its words are drawn half a pixel elsewhere (a layer re-snapped
    under a mask, a repaint at another subpixel offset). The row is photographed at rest and hovered: every pixel outside
    the hovered tab must be the same, and the hovered tab's ink (its dark pixels) must cover the same box.
  */
  const decode = async (buf) => {
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
    return { data, w: info.width, h: info.height, c: info.channels }
  }
  function pixelDrift(a, b, tab) {
    let outside = 0
    const ink = (img) => {
      let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
      for (let y = Math.max(0, tab.y); y < Math.min(img.h, tab.y + tab.h); y++)
        for (let x = Math.max(0, tab.x); x < Math.min(img.w, tab.x + tab.w); x++) {
          const i = (y * img.w + x) * img.c
          if (img.data[i] + img.data[i + 1] + img.data[i + 2] < 3 * 150) {
            x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
          }
        }
      return [x0, y0, x1, y1]
    }
    for (let y = 0; y < a.h; y++)
      for (let x = 0; x < a.w; x++) {
        if (x >= tab.x - 2 && x < tab.x + tab.w + 2 && y >= tab.y - 2 && y < tab.y + tab.h + 2) continue
        const i = (y * a.w + x) * a.c
        if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 6) outside++
      }
    const i0 = ink(a)
    const i1 = ink(b)
    return { outside, ink: Math.max(...i0.map((v, k) => Math.abs(v - i1[k]))) }
  }
  const barHeight = (p) => p.evaluate(() => document.querySelector("[data-community-header]").offsetHeight)
  const scrollPane = (p, top) =>
    p.evaluate(async (top) => {
      const pane = document.querySelector("[data-community-shell]")
      pane.scrollTop = top
      await new Promise((r) => setTimeout(r, 200))
      return pane.scrollTop
    }, top)

  /* ── STICKY ── */
  if (want("STICKY")) {
    console.log("\nSTICKY")
    results.sticky = {}
    for (const [w, vp] of SIZES) {
      const { p, errors } = await open(`${BASE}/members`, vp)
      const bh = await barHeight(p)
      await scrollPane(p, bh + 400)
      const r = await p.evaluate(() => {
        const pane = document.querySelector("[data-community-shell]").getBoundingClientRect()
        const header = document.querySelector("header").getBoundingClientRect()
        const row = document.querySelector("[data-community-tabs-bar]").getBoundingClientRect()
        const on = document.querySelector('[data-section-tabs] [aria-current="page"]').getBoundingClientRect()
        return { header: header.bottom, pane: pane.top, row: row.top, rowH: row.height, above: on.top - row.top, below: row.bottom - on.bottom, pill: on.height, stuck: document.querySelector("[data-community-tabs-bar]").getAttribute("data-scrolled") }
      })
      results.sticky[w] = r
      expect(r.row === r.pane && r.row >= r.header, `${w}: stuck at the pane's top, right under the header (${r.header}px)`, { row: r.row, pane: r.pane })
      expect(r.stuck === "true", `${w}: the hairline once something is under it`)
      expect(Math.abs(r.above - r.below) <= 1, `${w}: the pill sits in the middle of the row (${r.above}px above, ${r.below}px below)`)
      expect(r.above >= 6, `${w}: not tight against the top edge`, r.above)
      await shot(p, `sticky-${w}`, { x: 0, y: 0, width: vp.width, height: Math.min(220, vp.height) })
      /* At the top too: the row under the bar, the same room. */
      await scrollPane(p, 0)
      await shot(p, `top-${w}`, { x: 0, y: 0, width: vp.width, height: Math.min(260, vp.height) })
      expect(errors.length === 0, `${w}: no page errors`, errors)
      await p.close()
    }
  }

  /* ── HOVER ── */
  if (want("HOVER")) {
    console.log("\nHOVER")
    results.hover = {}
    for (const [w, vp] of [["1440", DESK], ["820", TABLET]]) {
      const { p, errors } = await open(BASE, vp)
      const bh = await barHeight(p)
      for (const state of ["top", "stuck"]) {
        await scrollPane(p, state === "stuck" ? bh + 120 : 0)
        let worst = { max: 0, where: "", weights: false }
        const pixels = { outside: 0, ink: 0 }
        for (const id of TABS) {
          const at = await p.evaluate((id) => {
            const el = document.querySelector(`[data-section-tabs] [data-tab="${id}"]`)
            const s = el.closest("[data-section-tabs]")
            const b = el.getBoundingClientRect()
            const sb = s.getBoundingClientRect()
            if (b.right > sb.right - 4 || b.left < sb.left) return null
            return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
          }, id)
          if (!at) continue
          if (process.env.PROBE_TRACE) console.log(`      ${w} ${state} ${id}`)
          await p.mouse.move(vp.width - 40, vp.height - 40)
          await sleep(160)
          const clip = await p.evaluate((id) => {
            const r = document.querySelector("[data-community-tabs-bar]").getBoundingClientRect()
            const t = document.querySelector(`[data-section-tabs] [data-tab="${id}"]`).getBoundingClientRect()
            return { row: { x: 0, y: Math.round(r.top), width: Math.round(window.innerWidth), height: Math.round(r.height) }, tab: { x: Math.floor(t.left), y: Math.floor(t.top - r.top), w: Math.ceil(t.width) + 1, h: Math.ceil(t.height) + 1 } }
          }, id)
          const rest = await decode(await snap(p, { clip: clip.row }))
          await startWatch(p)
          await p.mouse.move(at.x, at.y, { steps: 4 })
          await sleep(260)
          const hovered = await decode(await snap(p, { clip: clip.row }))
          await p.mouse.move(vp.width - 40, vp.height - 40, { steps: 4 })
          await sleep(200)
          const d = await stopWatch(p)
          const px = pixelDrift(rest, hovered, clip.tab)
          pixels.outside = Math.max(pixels.outside, px.outside)
          pixels.ink = Math.max(pixels.ink, px.ink)
          if (d.max > worst.max || d.weights) worst = { ...d, tab: id }
        }
        results.hover[`${w}-${state}`] = { ...worst, pixels }
        expect(worst.max === 0 && !worst.weights, `${w} ${state}: pointing at every tab moves nothing (largest: ${worst.max}px at ${worst.where || "-"}, weight changed: ${worst.weights})`)
        expect(pixels.outside === 0 && pixels.ink === 0, `${w} ${state}: and nothing is drawn elsewhere: ${pixels.outside} pixels changed outside the tab, its words moved ${pixels.ink}px`)
      }
      /* WHEEL: down over the row scrolls the page; the strip never scrolls up and down. */
      await scrollPane(p, 0)
      const tab = await p.evaluate(() => {
        const b = document.querySelector('[data-tab="spaces"]').getBoundingClientRect()
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
      })
      await p.mouse.move(tab.x, tab.y)
      await p.mouse.wheel({ deltaY: 240 })
      await sleep(400)
      const wheel = await p.evaluate(() => {
        const s = document.querySelector("[data-section-tabs]")
        return { stripTop: s.scrollTop, stripRoomY: s.scrollHeight - s.clientHeight, pane: document.querySelector("[data-community-shell]").scrollTop, overscrollX: getComputedStyle(s).overscrollBehaviorX }
      })
      results.hover[`${w}-wheel`] = wheel
      expect(wheel.stripTop === 0 && wheel.stripRoomY === 0, `${w}: the strip has no room to scroll up and down`, wheel)
      expect(wheel.pane > 0, `${w}: a wheel over the row scrolls the page`, wheel.pane)
      expect(wheel.overscrollX === "contain", `${w}: a sideways swipe at the strip's end stays in the strip (no Back gesture)`, wheel.overscrollX)
      expect(errors.length === 0, `${w}: no page errors`, errors)
      await p.close()
    }
  }

  /* ── SWITCH and SCROLL ── */
  if (want("SWITCH") || want("SCROLL")) {
    console.log("\nSWITCH")
    results.switch = {}
    for (const [w, vp] of SIZES) {
      const { p, errors } = await open(BASE, vp)
      const phone = vp === PHONE
      const press = async (id) => {
        await p.evaluate((id) => {
          const el = document.querySelector(`[data-section-tabs] [data-tab="${id}"]`)
          if (!el) throw new Error(`no tab ${id}: ${JSON.stringify(window.__errs || [])} ${[...document.querySelectorAll("[data-section-tabs] [data-tab]")].map((t) => t.getAttribute("data-tab"))} on ${location.pathname} ${document.body.innerText.slice(0, 300)}`)
          const s = el.closest("[data-section-tabs]")
          const b = el.getBoundingClientRect()
          const sb = s.getBoundingClientRect()
          if (b.left < sb.left + 12 || b.right > sb.right - 20) s.scrollLeft += b.left - sb.left - 40
        }, id)
        await sleep(phone ? 250 : 80)
        const at = await p.evaluate((id) => {
          const b = document.querySelector(`[data-section-tabs] [data-tab="${id}"]`).getBoundingClientRect()
          return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
        }, id)
        await p.evaluate(() => {
          window.__sw = { frames: [], on: true }
          const tick = (now) => {
            if (!window.__sw.on) return
            const screens = [...document.querySelectorAll("[data-section-screen]")].filter((el) => el.offsetHeight > 0)
            const row = document.querySelector("[data-community-tabs-bar]").getBoundingClientRect()
            const tabs = [...document.querySelectorAll("[data-section-tabs] [data-tab]")].map((t) => Math.round(t.getBoundingClientRect().top * 100) / 100)
            window.__sw.frames.push({ now, n: screens.length, framed: screens.some((s) => s.hasAttribute("data-section-framed")), row: Math.round(row.top * 100) / 100, tabsTop: Math.max(...tabs) - Math.min(...tabs), tabH: [...document.querySelectorAll("[data-section-tabs] [data-tab]")].map((t) => t.getBoundingClientRect().height) })
            requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        })
        if (phone) await p.touchscreen.tap(at.x, at.y)
        else await p.mouse.click(at.x, at.y)
        await sleep(DELAY + (phone ? 900 : 350))
        const f = await p.evaluate(() => {
          window.__sw.on = false
          return window.__sw.frames
        })
        const rows = f.map((x) => x.row)
        return {
          frames: f.length,
          empty: f.filter((x) => x.n === 0).length,
          double: f.filter((x) => x.n > 1).length,
          framed: f.filter((x) => x.framed).length,
          rowMoved: Math.max(...rows) - Math.min(...rows),
          tabsUneven: Math.max(...f.map((x) => x.tabsTop)),
          tabHeights: [...new Set(f.flatMap((x) => x.tabH))],
        }
      }
      const first = {}
      const again = {}
      for (const id of TABS.slice(1)) first[id] = await press(id)
      for (const id of TABS) again[id] = await press(id)
      results.switch[w] = { first, again }
      const all = [...Object.values(first), ...Object.values(again)]
      expect(all.every((r) => r.empty === 0 && r.double === 0), `${w}: never a frame with no section or with two`, all.map((r) => [r.empty, r.double]))
      expect(all.every((r) => r.rowMoved === 0 && r.tabsUneven === 0), `${w}: the row and its tabs never move on a press`, all.map((r) => [r.rowMoved, r.tabsUneven]))
      expect(all.every((r) => r.tabHeights.length === 1), `${w}: one tab height throughout`, [...new Set(all.flatMap((r) => r.tabHeights))])
      expect(Object.values(again).every((r) => r.framed === 0), `${w}: a section opened before comes back as it was, never its frame`, Object.values(again).map((r) => r.framed))

      /* SCROLL: where a section was is kept; stuck, a press keeps the row at the top. */
      const bh = await barHeight(p)
      await press("members")
      const kept = await scrollPane(p, bh + 300)
      await press("overview")
      const ovTop = await p.evaluate(() => document.querySelector("[data-community-shell]").scrollTop)
      await press("members")
      const back = await p.evaluate(() => document.querySelector("[data-community-shell]").scrollTop)
      const row = await p.evaluate(() => Math.round(document.querySelector("[data-community-tabs-bar]").getBoundingClientRect().top - document.querySelector("[data-community-shell]").getBoundingClientRect().top))
      results.switch[`${w}-scroll`] = { kept, overviewOpenedAt: ovTop, membersBackAt: back, rowFromPaneTop: row, barHeight: bh }
      expect(back === kept, `${w}: Members comes back where it was scrolled to`, { kept, back })
      expect(ovTop >= bh - 1, `${w}: stuck, another section opens with the row still at the top`, { ovTop, bh })
      expect(row === 0, `${w}: the row is at the top of the pane`, row)
      expect(errors.length === 0, `${w}: no page errors`, errors)
      await p.close()
    }
  }

  /* ── KEYS ── */
  if (want("KEYS")) {
    console.log("\nKEYS")
    const { p, errors } = await open(BASE, DESK)
    let hops = 0
    let on = null
    while (hops < 30) {
      await p.keyboard.press("Tab")
      hops++
      on = await p.evaluate(() => document.activeElement?.getAttribute("data-tab"))
      if (on) break
    }
    expect(on === "overview", "Tab reaches the row of tabs, at Overview", { on, hops })
    await p.keyboard.press("Tab")
    await sleep(250)
    const ring = await p.evaluate(() => ({ id: document.activeElement.getAttribute("data-tab"), visible: document.activeElement.matches(":focus-visible"), shadow: getComputedStyle(document.activeElement).boxShadow }))
    const drawn = /rgba\(\d+, \d+, \d+, 0\.[1-9]|rgb\(/.test(ring.shadow)
    expect(ring.id === "page" && ring.visible && drawn, "the next Tab is Page, with a ring that shows", ring)
    await p.keyboard.press("Tab")
    await p.keyboard.press("Enter")
    await sleep(DELAY + 300)
    const opened = await p.evaluate(() => ({ section: document.querySelector("[data-community-shell]").getAttribute("data-section"), focus: document.activeElement?.getAttribute("data-tab"), current: document.querySelector('[data-section-tabs] [aria-current="page"]')?.getAttribute("data-tab") }))
    expect(opened.section === "feed" && opened.focus === "feed" && opened.current === "feed", "Enter opens Posts and the focus stays on its tab", opened)
    await shot(p, "keys-focus", { x: 0, y: 0, width: 1440, height: 200 })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  /* ── PHONE ── */
  if (want("PHONE")) {
    console.log("\nPHONE")
    const { p, errors } = await open(BASE, PHONE)
    const r = await p.evaluate(() => {
      const s = document.querySelector("[data-section-tabs]")
      const pane = document.querySelector("[data-community-shell]")
      return { overflows: s.scrollWidth > s.clientWidth, bar: s.offsetHeight - s.clientHeight, page: document.scrollingElement.scrollWidth, pane: pane.scrollWidth - pane.clientWidth, scrollbarWidth: getComputedStyle(s).scrollbarWidth }
    })
    results.phone = { strip: r }
    expect(r.overflows, "the row is wider than the phone and scrolls sideways")
    expect(r.bar === 0 && r.scrollbarWidth === "none", "with no scrollbar", r)
    expect(r.page <= 390 && r.pane === 0, "the page never scrolls sideways", r)
    /* Moderation half under the fade at the right: pressed, it comes into view over several frames, not in one jump. */
    const tapAt = await p.evaluate(() => {
      const s = document.querySelector("[data-section-tabs]")
      s.scrollLeft = 0
      const ids = [...s.querySelectorAll("[data-tab]")]
      const sb = s.getBoundingClientRect()
      const cut = ids.find((t) => t.getBoundingClientRect().right > sb.right - 20 && t.getBoundingClientRect().left < sb.right - 30)
      const b = cut.getBoundingClientRect()
      return { id: cut.getAttribute("data-tab"), x: Math.min(b.left + 14, sb.right - 32), y: b.top + b.height / 2 }
    })
    await sleep(200)
    await p.evaluate(() => {
      window.__left = []
      const s = document.querySelector("[data-section-tabs]")
      const tick = () => {
        window.__left.push(Math.round(s.scrollLeft))
        if (window.__left.length < 90) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await p.touchscreen.tap(tapAt.x, tapAt.y)
    await sleep(1600)
    const after = await p.evaluate((id) => {
      const s = document.querySelector("[data-section-tabs]")
      const sb = s.getBoundingClientRect()
      const b = document.querySelector(`[data-section-tabs] [data-tab="${id}"]`).getBoundingClientRect()
      return { left: b.left - sb.left, right: sb.right - b.right, section: document.querySelector("[data-community-shell]").getAttribute("data-section"), lefts: window.__left }
    }, tapAt.id)
    const steps = new Set(after.lefts).size
    results.phone.reveal = { tab: tapAt.id, left: after.left, right: after.right, distinct: steps, lefts: after.lefts.filter((v, i, a) => i === 0 || v !== a[i - 1]) }
    expect(after.section === tapAt.id, `the half hidden tab (${tapAt.id}) opens its section`, after.section)
    expect(after.left >= 12 && after.right >= 20, "and is then wholly in view, clear of the fades", { left: after.left, right: after.right })
    expect(steps > 3, "brought into view gradually, not in one jump", results.phone.reveal.lefts)
    await shot(p, "phone-tabs", { x: 0, y: 0, width: 390, height: 260 })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  /* ── OVERVIEW ── */
  if (want("OVERVIEW")) {
    console.log("\nOVERVIEW")
    results.overview = {}
    for (const [variant, q] of [["busy", ""], ["free", "?sells=0"], ["new", "?fresh=1&sells=0"], ["draft", "?draft=1"]]) {
      for (const [w, vp] of SIZES) {
        const { p, errors } = await open(`${BASE}${q}`, vp, { cpu: 1 })
        const r = await p.evaluate(() => {
          const o = document.querySelector("[data-overview]")
          const figs = [...o.querySelectorAll("[data-figure]")]
          const card = o.querySelector("[data-figures]")?.getBoundingClientRect()
          const labels = figs.map((f) => f.getAttribute("data-figure"))
          const panels = [...o.querySelectorAll("section")].filter((s) => s.offsetHeight > 0).map((s) => s.getAttribute("aria-label") || s.querySelector("h2")?.textContent)
          return {
            labels,
            widths: figs.map((f) => Math.round(f.getBoundingClientRect().width)),
            cut: figs.flatMap((f) => [...f.querySelectorAll("span")].filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.textContent)),
            cardW: card ? Math.round(card.width) : 0,
            rows: new Set(figs.map((f) => Math.round(f.getBoundingClientRect().top))).size,
            selects: o.querySelectorAll("select, [role=combobox], [role=listbox]").length,
            charts: o.querySelectorAll("canvas, svg.recharts-surface, [data-chart]").length,
            panels,
            height: Math.round(o.getBoundingClientRect().height),
            overflow: document.querySelector("[data-community-shell]").scrollWidth - document.querySelector("[data-community-shell]").clientWidth,
          }
        })
        results.overview[`${variant}-${w}`] = r
        expect(r.labels.length <= 4 && new Set(r.labels).size === r.labels.length, `${variant} ${w}: at most four figures, none twice`, r.labels)
        expect(r.selects === 0 && r.charts === 0, `${variant} ${w}: no selector, no chart`)
        expect(r.overflow === 0, `${variant} ${w}: nothing wider than the screen`, r.overflow)
        if (vp === PHONE) expect(r.rows === r.labels.length && r.widths.every((x) => x >= r.cardW - 2), `${variant} ${w}: on a phone the figures are rows across the card, not squeezed columns`, { rows: r.rows, widths: r.widths, card: r.cardW })
        else if (vp === DESK) expect(r.rows === 1, `${variant} ${w}: the figures are one row`, r.rows)
        else expect(r.rows <= 2, `${variant} ${w}: two by two at most`, { rows: r.rows, widths: r.widths })
        expect(r.cut.length === 0, `${variant} ${w}: no name, number or line in a figure is cut`, r.cut)
        console.log(`        panels: ${r.panels.join(" | ")}`)
        await p.evaluate(() => (document.querySelector("[data-community-shell]").scrollTop = 0))
        await shot(p, `overview-${variant}-${w}`)
        if (vp !== DESK) {
          const full = await p.evaluate(() => document.querySelector("[data-community-shell]").scrollHeight)
          await p.setViewport({ ...vp, height: Math.min(full + 80, 4000) })
          await sleep(300)
          await shot(p, `overview-${variant}-${w}-full`)
        }
        expect(errors.length === 0, `${variant} ${w}: no page errors`, errors)
        await p.close()
      }
    }
    /* The frame (the shape while it comes) and the Overview itself: the first card in the same place, the same height of row. */
    for (const [w, vp] of SIZES) {
      const { p } = await open(`${BASE}/members`, vp, { cpu: 1 })
      await p.evaluate(() => document.querySelector('[data-section-tabs] [data-tab="overview"]').click())
      /* Once its 150ms arrival (and its 3px rise) is over, well before the section comes at DELAY. */
      await sleep(240)
      const frame = await p.evaluate(() => {
        const f = document.querySelector('[data-section-framed] [data-frame-card]')
        return f ? { y: Math.round(f.getBoundingClientRect().top), h: Math.round(f.getBoundingClientRect().height) } : null
      })
      await sleep(DELAY + 200)
      const real = await p.evaluate(() => {
        const f = document.querySelector("[data-overview] [data-figures]")?.closest("section")
        return f ? { y: Math.round(f.getBoundingClientRect().top), h: Math.round(f.getBoundingClientRect().height) } : null
      })
      results.overview[`frame-${w}`] = { frame, real }
      expect(frame && real && frame.y === real.y && Math.abs(frame.h - real.h) <= 2, `${w}: the frame's figures card is where and how tall the Overview's is`, { frame, real })
      await p.close()
    }
  }

  /* ── MEMBERS: the table or the rows by the card's own width, never headers into each other ── */
  if (want("MEMBERS")) {
    console.log("\nMEMBERS")
    const LAPTOP = { width: 1024, height: 768, deviceScaleFactor: 1 }
    const MID = { width: 1150, height: 800, deviceScaleFactor: 1 }
    for (const [w, vp] of [["820", TABLET], ["1024", LAPTOP], ["1150", MID], ["1440", DESK], ["390", PHONE]]) {
      const { p, errors } = await open(`${BASE}/members`, vp, { cpu: 1 })
      const r = await p.evaluate(() => {
        const box = document.querySelector("[data-members-table]")
        const card = box.getBoundingClientRect().width
        const table = box.querySelector("table")
        const list = box.querySelector("[data-members-list]")
        const shown = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== "none"
        const ths = table && shown(table) ? [...table.querySelectorAll("thead th")].map((th) => ({ text: th.textContent.trim(), w: Math.round(th.getBoundingClientRect().width), over: th.scrollWidth > th.clientWidth + 1 })) : []
        const search = box.querySelector("[data-toolbar] input")
        const filters = box.querySelector("[data-member-filters]")
        return {
          card: Math.round(card),
          table: shown(table),
          list: shown(list),
          ths,
          member: ths.find((t) => t.text === "Member")?.w ?? null,
          search: search ? Math.round(search.getBoundingClientRect().width) : null,
          oneRow: search && filters ? Math.abs(search.getBoundingClientRect().top - filters.getBoundingClientRect().top) < 12 : null,
          wider: box.scrollWidth - box.clientWidth,
        }
      })
      results[`members-${w}`] = r
      expect(r.table === r.card >= 860 && r.list === !r.table, `${w}: a ${r.card}px card shows the ${r.table ? "table" : "rows"}`, { card: r.card, table: r.table, list: r.list })
      if (r.table) expect(r.ths.every((t) => !t.over) && (r.member ?? 0) >= 200, `${w}: no header runs into the next, the Member column keeps ${r.member}px`, r.ths.filter((t) => t.over))
      expect((r.search ?? 0) >= 160, `${w}: the search box keeps its room (${r.search}px, ${r.oneRow ? "beside" : "above"} the filters)`)
      expect(r.wider <= 0, `${w}: nothing wider than the card`, r.wider)
      await shot(p, `members-${w}`, { x: 0, y: 0, width: vp.width, height: Math.min(560, vp.height) })
      expect(errors.length === 0, `${w}: no page errors`, errors)
      await p.close()
    }
  }

  /* ── DELETING: a community whose deletion is scheduled says when, not "bring it back" ── */
  if (want("DELETING")) {
    console.log("\nDELETING")
    for (const [w, vp] of [["1440", DESK], ["390", PHONE]]) {
      const { p, errors } = await open(`${BASE}?deleting=1`, vp, { cpu: 1 })
      const { t, back } = await p.evaluate(() => ({ t: document.querySelector("[data-community-deleting]")?.textContent ?? null, back: /Bring it back/.test(document.body.innerText) }))
      expect(!!t && /^Deleting on .+\. Members can read it until then\. Keep it from Settings\.$/.test(t) && !back, `${w}: the banner says when it goes and that Settings keeps it`, t)
      await shot(p, `deleting-${w}`, { x: 0, y: 0, width: vp.width, height: Math.min(360, vp.height) })
      expect(errors.length === 0, `${w}: no page errors`, errors)
      await p.close()
    }
  }

  /* ── CHROME: every section, light and with the dark attribute ── */
  if (want("CHROME")) {
    console.log("\nCHROME")
    for (const dark of [false, true]) {
      for (const [w, vp] of SIZES) {
        for (const id of TABS) {
          const path = id === "overview" ? BASE : `${BASE}/${{ feed: "feed", classroom: "learn", events: "events" }[id] ?? id}`
          const { p, errors } = await open(`${path}${dark ? "?dark=1" : ""}`, vp, { cpu: 1 })
          await shot(p, `chrome-${dark ? "dark" : "light"}-${id}-${w}`)
          expect(errors.length === 0, `${dark ? "dark" : "light"} ${id} ${w}: drawn with no page errors`, errors)
          await p.close()
        }
      }
    }
  }

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
writeFileSync(join(shots, "results.json"), JSON.stringify(results, null, 1))
console.log(`\n${broken ? `${broken} FAILED` : "all ok"}   (pictures and results.json in ${shots})`)
process.exit(broken ? 1 : 0)
