/**
 * ===========================================================================
 *  ROUND 32, MEASURED: THE COMMUNITY ADMIN'S OVERVIEW AND SETTINGS
 * ===========================================================================
 * The owner, round 32: "the admin of the community on desktop and larger
 * screens looks absolutely horrible, it's too shrunk". Over the real shell
 * and sections (scripts/render-community-admin-round32.tsx), at 1440, 1280
 * and 390:
 *
 *   LAYOUT    the overview and every settings panel: the width the content
 *             is given and the width the panel uses, every card's width, no
 *             paragraph of two lines or more narrower than 240px, no two
 *             controls over each other, nothing past the screen's edge and
 *             no sideways scroll, no browser select, box or radio
 *   GALLERY   the product editor's media grid: 16:9 tiles three a row from
 *             640px and two on a phone, at least 200px (computer) and 150px
 *             (phone) across, the upload zone the grid's width with its
 *             words on one line
 *   LOOK      no White or Dark setting anywhere in Settings
 *   SHEETS    at 390 the category picker and a tile's menu open as the
 *             bottom sheet, inside the screen
 *   OVERVIEW  the figures in a row of four, two columns from 1280px, the
 *             setup, the activity, the shortcuts; one column on a phone in
 *             the order figures, waiting, setup, shortcuts, activity
 * and round 31's SETTINGS, CONTROLS, SAVEBAR and DRAG, kept.
 *
 *   node scripts/check-community-admin-round32.mjs [LAYOUT GALLERY ...]
 *   SHOTS_DIR=dir to keep the pictures (.round32-admin-shots by default; delete it before committing)
 *
 * Round 31's header, kept for what the shared setup below does:
 * The owner's asks for /app/community/<slug>, each as numbers from headless
 * Chromium over the real shell and sections (scripts/render-community-admin-
 * round31.tsx, with a stand-in router that answers after ?delay= ms):
 *
 *   SWITCH    a section opened once comes back with no router call and no
 *             request, on the next frame; every frame between the press and
 *             the section has a section on it (no blank frame); its scroll
 *             comes back; Back and Forward too
 *   HEADER    at 390: the name has the row (its width), nothing in the bar
 *             overlaps, the state is a line under the name, View page is in
 *             the menu; the tab you are on is in view
 *   SETTINGS  at 390 Settings opens on the list of panels, a row opens one,
 *             Back returns to the list; at 1440 the column of groups
 *   CONTROLS  no browser select or checkbox left in the settings panels
 *   SAVEBAR   up only with a change, fixed above the navigation pill on a
 *             phone and 16px off the bottom on a computer, still while the
 *             form scrolls under it
 *   DRAG      the gallery reorders with a mouse, a held finger and the
 *             keyboard; a swipe that does not hold leaves the order alone
 *
 *   node scripts/check-community-admin-round31.mjs [SWITCH HEADER ...]
 *   SHOTS_DIR=dir to keep the pictures (.round31-admin-shots by default; delete it before committing)
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()))
const want = (s) => only.size === 0 || only.has(s)
const stubs = join(root, ".community-admin32-probe")
const shots = process.env.SHOTS_DIR || join(root, ".round32-admin-shots")
const ORIGIN = "https://storelib.com"
const BASE = "/app/community/salajanywood"
const DELAY = 450
let broken = 0
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
/* As Next: the address moves, the router's tree does not. */
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
  const css = await appCss(root)
  const fonts = interFaces(root)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-admin-round32.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.community-admin32-probe/navigation.js", "next/link": "./.community-admin32-probe/link.jsx", "next/image": "./.community-admin32-probe/image.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "admin.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "admin.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], protocolTimeout: 240_000 })
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
  const LAPTOP = { width: 1280, height: 800, deviceScaleFactor: 1 }

  async function open(path, vp) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    const api = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        api.push(url.replace(ORIGIN, ""))
        let body = {}
        if (url.includes("/words")) body = { words: ["spam"], action: "block" }
        else if (url.includes("/api/domains")) body = { domains: [], purposes: ["community"], communities: [{ id: "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a", name: "SalajanyWood Woodworking Club", slug: "salajanywood" }] }
        else if (url.includes("/members?")) body = { rows: [], next: null, capped: false }
        return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(600)
    return { p, errors, api }
  }
  const box = (p, sel) =>
    p.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const b = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right), bottom: Math.round(b.bottom), shown: cs.display !== "none" && cs.visibility !== "hidden" && b.width > 0 && b.height > 0, opacity: Number(cs.opacity) }
    }, sel)
  const shownSection = (p) => p.evaluate(() => [...document.querySelectorAll("[data-section-screen]")].filter((el) => el.offsetHeight > 0).map((el) => el.getAttribute("data-section-screen")))
  /*
    Press a tab and follow every frame until `id` is on screen: how long after the click (the click's own time, read in the
    page), how many frames, whether any frame had no section on it, and the longest task in between.
  */
  async function press(p, id) {
    const before = await p.evaluate(() => (window.__router || []).length)
    await p.evaluate((id) => {
      window.__frames = []
      window.__clickAt = null
      window.__long = []
      if (!window.__longWatch) {
        window.__longWatch = new PerformanceObserver((l) => { for (const e of l.getEntries()) (window.__long ||= []).push({ at: e.startTime, ms: Math.round(e.duration) }) })
        try { window.__longWatch.observe({ type: "longtask", buffered: false }) } catch {}
      }
      document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest(`[data-tab="${id}"]`)) window.__clickAt = performance.now() }, { capture: true, once: true })
      const tick = (now) => {
        const on = [...document.querySelectorAll("[data-section-screen]")].filter((el) => el.offsetHeight > 0).map((el) => el.getAttribute("data-section-screen"))
        const waiting = !!document.querySelector("[data-section-waiting]")
        window.__frames.push({ now, on, waiting })
        if (window.__frames.length < 240) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, id)
    await p.click(`[data-tab="${id}"]`)
    await sleep(DELAY + 500)
    const out = await p.evaluate((id) => {
      const at = window.__clickAt
      const after = window.__frames.filter((f) => at !== null && f.now >= at)
      const arrived = after.find((f) => f.on.includes(id))
      const long = (window.__long || []).filter((t) => at !== null && t.at >= at - 5 && arrived && t.at <= arrived.now)
      return {
        ms: arrived ? Math.round(arrived.now - at) : null,
        frame: arrived ? after.indexOf(arrived) + 1 : null,
        blank: window.__frames.filter((f) => f.on.length === 0 && !f.waiting).length,
        longest: long.reduce((m, t) => Math.max(m, t.ms), 0),
      }
    }, id)
    const calls = await p.evaluate((n) => (window.__router || []).slice(n).filter((c) => c[0] !== "prefetch"), before)
    return { ...out, calls }
  }


  /*
    One screen, measured: the content area (the shell's body), the part this section draws, its cards, and everything
    that would say it is squeezed or broken.
  */
  const measure = (p, scopeSel) =>
    p.evaluate((scopeSel) => {
      const vw = innerWidth
      const pane = document.querySelector("[data-community-shell]")
      const bodyEl = document.querySelector("[data-community-body]")
      const bs = getComputedStyle(bodyEl)
      const body = bodyEl.getBoundingClientRect()
      const inner = body.width - parseFloat(bs.paddingLeft) - parseFloat(bs.paddingRight)
      const scope = document.querySelector(scopeSel)
      const sb = scope.getBoundingClientRect()
      const shown = (el) => {
        if (el.closest("[data-editor-foot]") || el.closest("[hidden]")) return false
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) return false
        const cs = getComputedStyle(el)
        return cs.visibility !== "hidden" && cs.display !== "none"
      }
      /* A paragraph squeezed into a strip: two lines or more, under 240px. */
      const narrow = []
      for (const el of scope.querySelectorAll("p, h2, h3, label, li, span, a, button, time")) {
        if (!shown(el)) continue
        const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim()
        if (own.length < 24) continue
        const r = el.getBoundingClientRect()
        const lh = parseFloat(getComputedStyle(el).lineHeight) || 20
        const lines = Math.round(r.height / lh)
        if (lines >= 2 && r.width < 240) narrow.push({ text: own.slice(0, 48), w: Math.round(r.width), lines })
      }
      /* The narrowest block of words of any length that wraps, and the narrowest that holds a sentence. */
      let narrowestWrap = Infinity
      for (const el of scope.querySelectorAll("p, label, h2, li")) {
        if (!shown(el)) continue
        const t = (el.textContent || "").trim()
        if (t.length < 40) continue
        const r = el.getBoundingClientRect()
        narrowestWrap = Math.min(narrowestWrap, Math.round(r.width))
      }
      const outside = [...scope.querySelectorAll("*")].filter((el) => {
        if (!shown(el)) return false
        const r = el.getBoundingClientRect()
        /* Inside a strip that scrolls sideways on purpose is not outside. */
        let a = el.parentElement
        while (a && a !== scope) {
          const o = getComputedStyle(a).overflowX
          if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return false
          a = a.parentElement
        }
        return r.right > vw + 1 || r.left < -1
      }).length
      const native = [...scope.querySelectorAll("select, input[type=checkbox], input[type=radio]")].filter(shown).length
      const ctrls = [...scope.querySelectorAll("button, input, textarea, a, [role=switch]")].filter(shown).map((el) => ({ el, r: el.getBoundingClientRect() }))
      const overlaps = []
      for (let i = 0; i < ctrls.length; i++)
        for (let j = i + 1; j < ctrls.length; j++) {
          const a = ctrls[i]
          const b = ctrls[j]
          if (a.el.contains(b.el) || b.el.contains(a.el)) continue
          if (a.el.closest("[data-gallery-item]") && a.el.closest("[data-gallery-item]") === b.el.closest("[data-gallery-item]")) continue
          const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left)
          const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top)
          if (w > 2 && h > 2) overlaps.push([(a.el.textContent || a.el.getAttribute("aria-label") || a.el.tagName).trim().slice(0, 24), (b.el.textContent || b.el.getAttribute("aria-label") || b.el.tagName).trim().slice(0, 24)])
        }
      const cards = [...scope.querySelectorAll("section")].filter((el) => shown(el) && !el.parentElement.closest("section")).map((el) => Math.round(el.getBoundingClientRect().width))
      return {
        vw,
        content: Math.round(inner),
        scope: Math.round(sb.width),
        used: Math.round((sb.width / inner) * 100),
        cards: cards.length ? { n: cards.length, min: Math.min(...cards), max: Math.max(...cards) } : null,
        narrow,
        narrowestWrap: narrowestWrap === Infinity ? null : narrowestWrap,
        hscroll: pane.scrollWidth > pane.clientWidth + 1 || document.documentElement.scrollWidth > vw + 1,
        outside,
        native,
        overlaps: overlaps.slice(0, 6),
      }
    }, scopeSel)

  const TABS = ["page", "address", "access", "discovery", "features", "advanced", "policies", "roles", "gamification", "notifications"]

  if (want("LAYOUT")) {
    console.log("\nLAYOUT: the width used, nothing squeezed, nothing over anything, nothing off the screen")
    for (const [vpName, vp] of [["1440", DESK], ["1280", LAPTOP], ["390", PHONE]]) {
      for (const [name, path, scope] of [["overview", BASE, "[data-overview]"], ["overview, a draft", `${BASE}?draft=1`, "[data-overview]"], ...TABS.map((t) => [`settings ${t}`, `${BASE}/settings?tab=${t}`, `[data-settings-panel="${t}"]`])]) {
        const { p, errors } = await open(path, vp)
        await sleep(150)
        const m = await measure(p, scope)
        const tag = `${vpName} ${name}`
        console.log(`  ..    ${tag}: content ${m.content}px, this ${m.scope}px (${m.used}%), cards ${m.cards ? `${m.cards.n} at ${m.cards.min} to ${m.cards.max}px` : "none"}, narrowest sentence ${m.narrowestWrap}px`)
        expect(m.narrow.length === 0, `${tag}: no words of two lines or more in a strip under 240px`, m.narrow.slice(0, 4))
        expect(!m.hscroll && m.outside === 0, `${tag}: no sideways scroll, nothing past the edge`, { hscroll: m.hscroll, outside: m.outside })
        expect(m.native === 0, `${tag}: no browser select, box or radio`, m.native)
        expect(m.overlaps.length === 0, `${tag}: no control over another`, m.overlaps)
        if (name.startsWith("settings") && vpName !== "390") expect(m.cards && m.cards.min >= m.scope - 2, `${tag}: every card is the panel's full width (no side column)`, m.cards)
        if (vpName === "1440") expect(m.content >= 1130, "1440: the content area is the /app 1200px container less its gutters", m.content)
        expect(errors.length === 0, `${tag}: no page errors`, errors)
        if ((vpName === "1440" || vpName === "390") && ["overview", "settings page", "settings address", "settings access", "settings discovery", "settings advanced"].includes(name)) {
          await p.screenshot({ path: join(shots, `${name.replace(/[ ,]+/g, "-")}-${vpName}.png`), fullPage: false })
        }
        await p.close()
      }
    }
  }

  if (want("OVERVIEW")) {
    console.log("\nOVERVIEW: figures, two columns from 1280px, one column on a phone in its order")
    for (const [vpName, vp] of [["1440", DESK], ["1280", LAPTOP], ["390", PHONE]]) {
      const { p, errors } = await open(`${BASE}?draft=1`, vp)
      const o = await p.evaluate(() => {
        const figs = [...document.querySelectorAll("[data-figures] [data-figure]")].map((el) => el.getBoundingClientRect())
        const rowTop = figs.length ? Math.round(figs[0].top) : null
        const firstRow = figs.filter((r) => Math.round(r.top) === rowTop).length
        const at = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) } }
        return { firstRow, value: getComputedStyle(document.querySelector("[data-figures] [data-figure] span:nth-child(2)")).fontSize, steps: at("[data-next-steps-card]"), activity: at("[data-overview-activity]"), actions: at("[data-overview-actions]"), waiting: at("[data-overview-waiting]"), share: at("[data-overview-share]"), lines: document.querySelectorAll("[data-activity]").length }
      })
      expect(o.firstRow === (vpName === "390" ? 2 : 4), `${vpName}: the figures ${vpName === "390" ? "two" : "four"} to a row`, o.firstRow)
      expect(o.value === (vpName === "390" ? "20px" : "22px"), `${vpName}: the figure is the Analytics row's size`, o.value)
      expect(o.lines === 5, `${vpName}: recent activity lists the newest posts and members`, o.lines)
      if (vpName === "390") {
        const ys = [o.waiting, o.steps, o.actions, o.activity, o.share].map((x) => x?.y ?? -1)
        expect(ys.every((y, i) => i === 0 || y > ys[i - 1]), "390: one column, waiting, setup, shortcuts, activity, link in that order", ys)
      } else if (vpName === "1440" || vpName === "1280") {
        expect(o.actions && o.steps && o.actions.x > o.steps.x + o.steps.w - 2 && o.actions.w >= 300, `${vpName}: two columns, the work and the side (340px)`, { steps: o.steps, actions: o.actions })
        expect(o.steps.w >= 560, `${vpName}: the main column is at least 560px`, o.steps.w)
      }
      await p.screenshot({ path: join(shots, `overview-draft-${vpName}.png`) })
      expect(errors.length === 0, `${vpName}: no page errors`, errors)
      await p.close()
    }
  }

  if (want("GALLERY")) {
    console.log("\nGALLERY: the product editor's media grid")
    for (const [vpName, vp] of [["1440", DESK], ["1280", LAPTOP], ["390", PHONE]]) {
      for (const empty of [false, true]) {
        const { p, errors } = await open(`${BASE}/settings?tab=page${empty ? "&empty=1" : ""}`, vp)
        await p.evaluate(() => { const pane = document.querySelector("[data-community-shell]"); const g = document.querySelector("[data-gallery]"); pane.scrollTop += g.getBoundingClientRect().top - pane.getBoundingClientRect().top - 160 })
        await sleep(200)
        const g = await p.evaluate(() => {
          const tiles = [...document.querySelectorAll("[data-gallery-item]")].map((el) => el.firstElementChild.getBoundingClientRect())
          const grid = document.querySelector("[data-gallery-grid]")?.getBoundingClientRect() ?? null
          const zone = document.querySelector("[data-gallery-drop]")?.getBoundingClientRect() ?? null
          const card = document.querySelector("#gallery").getBoundingClientRect()
          const words = [...document.querySelectorAll("[data-gallery-drop] p, [data-gallery-drop] button")].filter((el) => el.offsetParent !== null).map((el) => { const r = el.getBoundingClientRect(); const lh = parseFloat(getComputedStyle(el).lineHeight) || 20; return { t: el.textContent.trim().slice(0, 30), lines: Math.round((r.height - (el.tagName === "BUTTON" ? r.height - lh : 0)) / lh) } })
          const top = tiles.length ? Math.round(tiles[0].top) : null
          return { n: tiles.length, perRow: tiles.filter((r) => Math.round(r.top) === top).length, w: tiles.length ? Math.round(tiles[0].width) : 0, ratio: tiles.length ? +(tiles[0].width / tiles[0].height).toFixed(2) : 0, grid: grid && Math.round(grid.width), zone: zone && Math.round(zone.width), card: Math.round(card.width), words }
        })
        const tag = `${vpName}${empty ? " empty" : ""}`
        if (!empty) {
          expect(g.perRow === (vpName === "390" ? 2 : 3), `${tag}: ${vpName === "390" ? "two" : "three"} tiles a row`, g.perRow)
          expect(g.w >= (vpName === "390" ? 150 : 200), `${tag}: a tile is at least ${vpName === "390" ? 150 : 200}px across`, g.w)
          expect(Math.abs(g.ratio - 1.78) < 0.05, `${tag}: 16:9 tiles, as the product editor's`, g.ratio)
          expect(g.zone !== null && Math.abs(g.zone - g.grid) <= 2, `${tag}: the upload zone is the grid's width`, { zone: g.zone, grid: g.grid })
        } else {
          expect(g.n === 0 && g.zone !== null && g.zone >= g.card - 80, `${tag}: an empty gallery is the zone across the card`, { zone: g.zone, card: g.card })
        }
        expect(g.words.every((x) => x.lines <= 1), `${tag}: the zone's words each on one line`, g.words)
        await p.screenshot({ path: join(shots, `gallery-${tag.replace(" ", "-")}.png`) })
        expect(errors.length === 0, `${tag}: no page errors`, errors)
        await p.close()
      }
    }
  }

  if (want("LOOK")) {
    console.log("\nLOOK: members choose their own; no setting for it in the admin")
    for (const t of TABS) {
      const { p } = await open(`${BASE}/settings?tab=${t}`, DESK)
      const found = await p.evaluate(() => /White or dark|White look|Dark look/i.test(document.querySelector("[data-settings]").innerText) || !![...document.querySelectorAll('[role="radiogroup"]')].find((g) => /^Look$/i.test(g.getAttribute("aria-label") || "")))
      expect(!found, `${t}: no White or Dark setting`, found)
      await p.close()
    }
  }

  if (want("SHEETS")) {
    console.log("\nSHEETS: pickers and menus are the bottom sheet on a phone")
    const sheetBox = (p) =>
      p.evaluate(() => {
        /* The shared sheet's panel (components/ui/bottom-sheet data-sheet-panel), not the screen-wide layer round it. */
        const el = [...document.querySelectorAll("[data-sheet-panel]")].filter((d) => d.getBoundingClientRect().height > 0).pop()
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), vh: innerHeight, vw: innerWidth }
      })
    {
      const { p, errors } = await open(`${BASE}/settings?tab=discovery`, PHONE)
      await p.click("#g-category")
      await sleep(900)
      const b = await sheetBox(p)
      expect(b && b.bottom >= b.vh - 2 && b.top > 80 && b.left >= -1 && b.right <= b.vw + 1, "390: the category opens as a bottom sheet", b)
      await p.screenshot({ path: join(shots, "sheet-category-390.png") })
      expect(errors.length === 0, "390 category: no page errors", errors)
      await p.close()
    }
    {
      const { p, errors } = await open(`${BASE}/settings?tab=page`, PHONE)
      await p.evaluate(() => { const pane = document.querySelector("[data-community-shell]"); const g = document.querySelector("[data-gallery]"); pane.scrollTop += g.getBoundingClientRect().top - pane.getBoundingClientRect().top - 160 })
      await sleep(200)
      await p.click("[data-gallery-item]:nth-child(2) [data-tile-menu]")
      await sleep(900)
      const b = await sheetBox(p)
      expect(b && b.bottom >= b.vh - 2 && b.left >= -1 && b.right <= b.vw + 1, "390: a tile's menu opens as a bottom sheet", b)
      await p.screenshot({ path: join(shots, "sheet-tile-menu-390.png") })
      expect(errors.length === 0, "390 tile menu: no page errors", errors)
      await p.close()
    }
  }

  if (want("SETTINGS")) {
    console.log("\nSETTINGS: the list of panels on a phone, the column on a computer")
    const { p, errors } = await open(`${BASE}/settings`, PHONE)
    const list = await box(p, "[data-settings-list]")
    const openPanel = await box(p, "[data-settings-open]")
    const rows = await p.evaluate(() => [...document.querySelectorAll("[data-settings-row]")].map((r) => r.getAttribute("data-settings-row")))
    expect(list?.shown && !openPanel?.shown, "390: Settings opens on the list, no panel", { list, openPanel })
    expect(rows.length === TABS.length, "390: a row for each panel", rows)
    await p.click('[data-settings-row="access"]')
    await sleep(250)
    const after = { list: (await box(p, "[data-settings-list]"))?.shown, panel: (await box(p, '[data-settings-panel="access"]'))?.shown, url: await p.evaluate(() => location.search) }
    expect(!after.list && after.panel && after.url === "?tab=access", "390: a row opens its panel, and the address says which", after)
    await p.screenshot({ path: join(shots, "settings-access-390.png") })
    await p.goBack()
    await sleep(250)
    const back = { list: (await box(p, "[data-settings-list]"))?.shown, url: await p.evaluate(() => location.search), path: await p.evaluate(() => location.pathname) }
    expect(back.list && back.url === "" && back.path === `${BASE}/settings`, "390: Back returns to the list, still in Settings", back)
    await p.click('[data-settings-row="page"]')
    await sleep(200)
    await p.click("[data-settings-back]")
    await sleep(250)
    expect((await box(p, "[data-settings-list]"))?.shown, "390: the back row returns to the list too")
    expect(errors.length === 0, "390: no page errors", errors)
    await p.close()
    const d = await open(`${BASE}/settings`, DESK)
    const col = await box(d.p, "[data-settings-groups]")
    const dl = await box(d.p, "[data-settings-list]")
    const page = await box(d.p, '[data-settings-panel="page"]')
    expect(col?.shown && !dl?.shown && page?.shown, "1440: the column of groups beside the Page panel, no list", { col, dl, page })
    await d.p.screenshot({ path: join(shots, "settings-page-1440.png") })
    await d.p.close()
  }

  if (want("CONTROLS")) {
    console.log("\nCONTROLS: the app's own, no browser select or box")
    for (const tab of TABS) {
      const { p } = await open(`${BASE}/settings?tab=${tab}`, DESK)
      const native = await p.evaluate(() => [...document.querySelectorAll("[data-settings-open] select, [data-settings-open] input[type=checkbox], [data-settings-open] input[type=radio]")].filter((el) => el.offsetParent !== null).length)
      const shown = await p.evaluate(() => [...document.querySelectorAll("[data-settings-open] input[type=file]")].filter((el) => el.offsetParent !== null).length)
      expect(native === 0 && shown === 0, `${tab}: no browser select, box or file field on screen`, { native, shown })
      await p.close()
    }
  }

  if (want("SAVEBAR")) {
    for (const [vpName, vp] of [["390", PHONE], ["1440", DESK]]) {
      console.log(`\nSAVEBAR at ${vpName}`)
      const { p, errors } = await open(`${BASE}/settings?tab=page`, vp)
      const down = await p.evaluate(() => { const el = document.querySelector('[data-settings-panel="page"] [data-editor-foot]'); return { foot: el?.getAttribute("data-foot"), opacity: Number(getComputedStyle(el.firstElementChild).opacity) } })
      expect(down.foot === "down" && down.opacity < 0.05, `${vpName}: nothing changed, no bar`, down)
      await p.click("#g-name", { clickCount: 3 })
      await p.type("#g-name", "SalajanyWood Club")
      await sleep(450)
      const bar = await p.evaluate(() => {
        const el = document.querySelector('[data-settings-panel="page"] [data-editor-foot] > div')
        const b = el.getBoundingClientRect()
        const pill = document.querySelector("[data-app-nav-pill]")
        const pb = pill && getComputedStyle(pill).display !== "none" ? pill.getBoundingClientRect() : null
        const head = document.querySelector("[data-community-header]").getBoundingClientRect()
        return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), h: Math.round(b.height), opacity: Number(getComputedStyle(el).opacity), vh: innerHeight, vw: innerWidth, pillTop: pb ? Math.round(pb.top) : null, headBottom: Math.round(head.bottom) }
      })
      expect(bar.opacity > 0.95, `${vpName}: a change brings the bar up`, bar.opacity)
      if (vpName === "390") {
        expect(bar.pillTop !== null && bar.bottom <= bar.pillTop - 6 && bar.bottom >= bar.pillTop - 16, "390: the bar sits just above the navigation pill (6 to 16px)", bar)
        expect(bar.left >= 12 && bar.right <= bar.vw - 12, "390: inside the 12px gutters", bar)
      } else {
        expect(bar.vh - bar.bottom >= 14 && bar.vh - bar.bottom <= 18, "1440: 16px off the bottom", bar.vh - bar.bottom)
        expect(bar.left >= 240, "1440: in the content area, clear of the rail", bar.left)
      }
      expect(bar.top > bar.headBottom, `${vpName}: under the header, never over it`, bar)
      await p.evaluate(() => { document.querySelector("[data-community-shell]").scrollTop = 500 })
      await sleep(150)
      const moved = await p.evaluate(() => Math.round(document.querySelector('[data-settings-panel="page"] [data-editor-foot] > div').getBoundingClientRect().top))
      expect(moved === bar.top, `${vpName}: it stays put while the form scrolls`, { before: bar.top, after: moved })
      await p.screenshot({ path: join(shots, `savebar-${vpName}.png`) })
      await p.click('[data-settings-panel="page"] [data-foot-cancel]')
      await sleep(450)
      const gone = await p.evaluate(() => document.querySelector('[data-settings-panel="page"] [data-editor-foot]').getAttribute("data-foot"))
      expect(gone === "down", `${vpName}: Cancel puts the change back and the bar away`, gone)
      expect(errors.length === 0, `${vpName}: no page errors`, errors)
      await p.close()
    }
  }

  if (want("DRAG")) {
    console.log("\nDRAG: the gallery reorders")
    const order = (p) => p.evaluate(() => [...document.querySelectorAll("[data-gallery-item]")].map((el) => { const k = el.getAttribute("data-gallery-key"); let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) | 0; return (h >>> 0).toString(36).slice(0, 5) }))
    const centre = (p, i) => p.evaluate((i) => { const b = document.querySelectorAll("[data-gallery-item]")[i].getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } }, i)
    {
      const { p, errors } = await open(`${BASE}/settings?tab=page`, DESK)
      await p.evaluate(() => { const pane = document.querySelector("[data-community-shell]"); const g = document.querySelector("[data-gallery]"); pane.scrollTop += g.getBoundingClientRect().top - pane.getBoundingClientRect().top - 220 })
      await sleep(200)
      const before = await order(p)
      const a = await centre(p, 0)
      const b = await centre(p, 2)
      await p.mouse.move(a.x, a.y)
      await p.mouse.down()
      for (let i = 1; i <= 12; i++) {
        await p.mouse.move(a.x + ((b.x - a.x) * i) / 12, a.y + ((b.y - a.y) * i) / 12)
        await sleep(16)
      }
      await sleep(120)
      await p.mouse.up()
      await sleep(300)
      const after = await order(p)
      expect(after[2] === before[0] && after.length === before.length, "mouse: the first tile dragged to the third place", { before, after })
      const dirty = await p.evaluate(() => document.querySelector('[data-settings-panel="page"] [data-editor-foot]').getAttribute("data-state"))
      expect(dirty === "dirty", "mouse: the new order is a change to save", dirty)
      /* The keyboard: Space lifts, an arrow moves, Space drops. */
      const k0 = await order(p)
      await p.focus('[data-gallery-item]:nth-child(2) [data-gallery-handle]')
      await p.keyboard.press("Space")
      await sleep(150)
      await p.keyboard.press("ArrowLeft")
      await sleep(150)
      await p.keyboard.press("Space")
      await sleep(300)
      const k1 = await order(p)
      expect(k1[0] === k0[1] && k1[1] === k0[0], "keyboard: Space, Left, Space moves the second tile first", { k0, k1 })
      /* The tile's menu: Show first. */
      const m0 = await order(p)
      await p.hover("[data-gallery-item]:nth-child(4)")
      await sleep(150)
      await p.click("[data-gallery-item]:nth-child(4) [data-tile-menu]")
      await sleep(300)
      const item = await p.evaluateHandle(() => [...document.querySelectorAll('[role="menuitem"]')].find((el) => /Show first/.test(el.textContent)))
      if (item) await item.asElement()?.click()
      await sleep(300)
      const m1 = await order(p)
      expect(m1[0] === m0[3], "menu: Show first puts the fourth tile first", { m0, m1 })
      await p.screenshot({ path: join(shots, "gallery-1440.png") })
      expect(errors.length === 0, "desktop: no page errors", errors)
      await p.close()
    }
    {
      const { p, errors } = await open(`${BASE}/settings?tab=page`, PHONE)
      await p.evaluate(() => { const pane = document.querySelector("[data-community-shell]"); const g = document.querySelector("[data-gallery]"); pane.scrollTop += g.getBoundingClientRect().top - pane.getBoundingClientRect().top - 220 })
      await sleep(250)
      const client = await p.target().createCDPSession()
      const touch = (type, pt) => client.send("Input.dispatchTouchEvent", { type, touchPoints: pt ? [{ x: pt.x, y: pt.y }] : [] })
      const before = await order(p)
      const a = await centre(p, 0)
      const b = await centre(p, 1)
      /* A swipe that does not hold: no drag. */
      await touch("touchStart", a)
      for (let i = 1; i <= 6; i++) {
        await touch("touchMove", { x: a.x + 6 * i, y: a.y - 4 * i })
        await sleep(16)
      }
      await touch("touchEnd")
      await sleep(300)
      const swiped = await order(p)
      expect(JSON.stringify(swiped) === JSON.stringify(before), "finger: a quick swipe moves nothing", { before, swiped })
      /* A hold, then a move: the tile follows and lands. */
      const a2 = await centre(p, 0)
      const b2 = await centre(p, 1)
      await touch("touchStart", a2)
      await sleep(420)
      for (let i = 1; i <= 14; i++) {
        await touch("touchMove", { x: a2.x + ((b2.x - a2.x) * i) / 14, y: a2.y + ((b2.y - a2.y) * i) / 14 })
        await sleep(16)
      }
      await sleep(120)
      await touch("touchEnd", null)
      await sleep(350)
      const held = await order(p)
      expect(held[1] === before[0] && held[0] === before[1], "finger: held 420ms then moved, the first tile lands second", { before, held })
      await p.screenshot({ path: join(shots, "gallery-390.png") })
      expect(errors.length === 0, "phone: no page errors", errors)
      void b
      await p.close()
    }
  }

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

console.log(`\npictures: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
