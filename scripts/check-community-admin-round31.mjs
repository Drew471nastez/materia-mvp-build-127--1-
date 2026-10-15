/**
 * ===========================================================================
 *  ROUND 31, MEASURED: THE COMMUNITY ADMIN SHELL
 * ===========================================================================
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
const stubs = join(root, ".community-admin31-probe")
const shots = process.env.SHOTS_DIR || join(root, ".round31-admin-shots")
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
    entryPoints: [join(root, "scripts/render-community-admin-round31.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.community-admin31-probe/navigation.js", "next/link": "./.community-admin31-probe/link.jsx", "next/image": "./.community-admin31-probe/image.jsx" },
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

  if (want("SWITCH")) {
    for (const [vpName, vp] of [["1440", DESK], ["390", PHONE]]) {
      console.log(`\nSWITCH at ${vpName}: a section opened once comes back at once, with nothing asked`)
      const { p, errors, api } = await open(BASE, vp)
      const first = await press(p, "members")
      expect(first.calls.some((c) => c[0] === "push"), `${vpName}: Members, never opened: asked of the router once`, first.calls.map((c) => c[0]))
      expect(first.blank === 0, `${vpName}: and the overview stays on screen while it comes (blank frames)`, first.blank)
      await press(p, "settings")
      const apiBefore = api.length
      const results = {}
      for (const id of ["overview", "members", "settings", "overview", "settings", "members"]) {
        const r = await press(p, id)
        results[id] = r
        expect(r.calls.length === 0, `${vpName}: ${id} again: no router call`, r.calls)
        expect(r.frame !== null && r.frame <= 2, `${vpName}: ${id} again: on screen by the second frame after the click`, { ms: r.ms, frame: r.frame, longestTask: r.longest })
        expect(r.blank === 0, `${vpName}: ${id} again: no frame without a section`, r.blank)
      }
      const newApi = api.slice(apiBefore)
      expect(newApi.length === 0, `${vpName}: no request at all while moving between sections already opened`, newApi)
      /* The scroll comes back with the section. */
      const set = await p.evaluate(() => { const el = document.querySelector("[data-community-shell]"); el.scrollTop = Math.min(420, el.scrollHeight - el.clientHeight); return Math.round(el.scrollTop) })
      await sleep(120)
      await press(p, "overview")
      const atOverview = await p.evaluate(() => Math.round(document.querySelector("[data-community-shell]").scrollTop))
      await press(p, "members")
      const backAt = await p.evaluate(() => Math.round(document.querySelector("[data-community-shell]").scrollTop))
      expect(set > 100 && Math.abs(backAt - set) <= 1 && atOverview === 0, `${vpName}: Members comes back where it was scrolled; the overview at its own top`, { set, atOverview, backAt })
      /* Back and Forward: the address is the truth, no router call. */
      const n = await p.evaluate(() => (window.__router || []).length)
      await p.goBack()
      await sleep(250)
      const afterBack = { path: await p.evaluate(() => location.pathname), on: await shownSection(p) }
      expect(afterBack.path === BASE && afterBack.on.includes("overview"), `${vpName}: Back returns to the overview`, afterBack)
      await p.goForward()
      await sleep(250)
      const afterFwd = { path: await p.evaluate(() => location.pathname), on: await shownSection(p) }
      expect(afterFwd.path === `${BASE}/members` && afterFwd.on.includes("members"), `${vpName}: Forward to Members again`, afterFwd)
      const calls = await p.evaluate((n) => (window.__router || []).slice(n).filter((c) => c[0] !== "prefetch"), n)
      expect(calls.length === 0, `${vpName}: Back and Forward asked the router for nothing`, calls)
      /* Read ahead: the sections never opened were fetched ahead once the first painted. */
      const ahead = await p.evaluate(() => (window.__router || []).filter((c) => c[0] === "prefetch").map((c) => c[1]))
      expect(ahead.some((h) => /\/analytics$/.test(h)), `${vpName}: the sections not opened yet were read ahead`, ahead)
      expect(errors.length === 0, `${vpName}: no page errors`, errors)
      console.log(`  numbers: first open of Members ${first.ms}ms (the stand-in server answers in ${DELAY}ms); again: ${Object.entries(results).map(([k, r]) => `${k} ${r.ms}ms, frame ${r.frame}, longest task ${r.longest}ms`).join("; ")}`)
      await p.close()
    }
  }

  if (want("REFRESH")) {
    console.log("\nREFRESH: a section drawn again by the router keeps its state")
    const { p, errors } = await open(`${BASE}/settings?tab=page`, DESK)
    await press(p, "overview")
    await press(p, "settings")
    await p.evaluate(() => document.querySelector("[data-settings]").setAttribute("data-probe-mark", "1"))
    await p.click("#g-tagline")
    await p.$eval("#g-tagline", (el) => el.select())
    await p.type("#g-tagline", "Typed before the refresh")
    const n = await p.evaluate(() => (window.__router || []).length)
    await p.evaluate(() => window.__probeRouterApi.refresh())
    await sleep(DELAY + 300)
    const after = await p.evaluate(() => ({ mark: !!document.querySelector("[data-settings][data-probe-mark]"), tagline: document.querySelector("#g-tagline").value, foot: document.querySelector('[data-settings-panel="page"] [data-editor-foot]').getAttribute("data-state"), on: [...document.querySelectorAll("[data-section-screen]")].filter((el) => el.offsetHeight > 0).map((el) => el.getAttribute("data-section-screen")) }))
    const calls = await p.evaluate((n) => (window.__router || []).slice(n).map((c) => c[0]), n)
    expect(calls.includes("refresh"), "the router drew Settings again", calls)
    expect(after.mark && after.tagline === "Typed before the refresh" && after.foot === "dirty", "Settings was not mounted again: what was typed is still there, still to save", after)
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  if (want("HEADER")) {
    console.log("\nHEADER at 390: the name has the row")
    for (const name of ["SalajanyWood Woodworking Club", "Clay"]) {
      const { p, errors } = await open(`${BASE}?name=${encodeURIComponent(name)}`, PHONE)
      const parts = await p.evaluate(() => {
        const bar = document.querySelector("[data-community-bar]")
        const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.left), r: Math.round(b.right), y: Math.round(b.top), b: Math.round(b.bottom), w: Math.round(b.width) } }
        return { bar: r(bar), back: r(bar.querySelector("[data-community-back]")), logo: r(bar.querySelector("[data-community-logo]")), title: r(bar.querySelector("[data-community-title]")), h1: r(bar.querySelector("h1")), actions: r(bar.querySelector("[data-community-actions]")), view: !!bar.querySelector("[data-community-view]") && getComputedStyle(bar.querySelector("[data-community-view]")).display !== "none", state: bar.querySelector("[data-community-state]")?.textContent ?? null }
      })
      const order = [parts.back, parts.logo, parts.title, parts.actions]
      const overlaps = order.slice(1).filter((x, i) => x && order[i] && x.x < order[i].r)
      expect(overlaps.length === 0, `"${name}": back, logo, name and menu side by side, none over another`, order)
      expect(parts.title.w >= 220, `"${name}": the name has at least 220px of the 390 (the badge and View page used to take 120px of it)`, parts.title.w)
      expect(!parts.view, `"${name}": View page is in the menu, not a button in the row`)
      expect(/Published/.test(parts.state || ""), `"${name}": the state is a line under the name`, parts.state)
      if (name.length > 10) await p.screenshot({ path: join(shots, "header-390.png"), clip: { x: 0, y: 60, width: 390, height: 150 } })
      expect(errors.length === 0, `"${name}": no page errors`, errors)
      await p.close()
    }
    const { p } = await open(`${BASE}/settings`, PHONE)
    const tab = await p.evaluate(() => {
      const s = document.querySelector("[data-section-tabs]")
      const a = s.querySelector('[aria-current="page"]')
      const sb = s.getBoundingClientRect()
      const ab = a.getBoundingClientRect()
      return { tab: a.getAttribute("data-tab"), inView: ab.left >= sb.left - 1 && ab.right <= sb.right + 1, scroller: s.scrollWidth > s.clientWidth }
    })
    expect(tab.tab === "settings" && tab.inView && tab.scroller, "390: the row scrolls sideways and the tab you are on is in view", tab)
    await p.screenshot({ path: join(shots, "settings-list-390.png") })
    await p.close()
    const d = await open(BASE, DESK)
    const desk = await d.p.evaluate(() => {
      const bar = document.querySelector("[data-community-bar]")
      const v = bar.querySelector("[data-community-view]")
      return { view: !!v && getComputedStyle(v).display !== "none", h1: Math.round(bar.querySelector("h1").getBoundingClientRect().width), more: getComputedStyle(bar.querySelector("[data-community-more]").parentElement).display }
    })
    expect(desk.view && desk.more === "none", "1440: View page is a button; no menu button", desk)
    await d.p.screenshot({ path: join(shots, "overview-1440.png") })
    await d.p.close()
    const ph = await open(BASE, PHONE)
    await ph.p.screenshot({ path: join(shots, "overview-390.png") })
    await ph.p.close()
  }

  if (want("SETTINGS")) {
    console.log("\nSETTINGS: the list of panels on a phone, the column on a computer")
    const { p, errors } = await open(`${BASE}/settings`, PHONE)
    const list = await box(p, "[data-settings-list]")
    const openPanel = await box(p, "[data-settings-open]")
    const rows = await p.evaluate(() => [...document.querySelectorAll("[data-settings-row]")].map((r) => r.getAttribute("data-settings-row")))
    expect(list?.shown && !openPanel?.shown, "390: Settings opens on the list, no panel", { list, openPanel })
    expect(rows.length >= 7, "390: a row for each panel", rows)
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
    for (const tab of ["page", "access", "features", "policies", "gamification", "notifications", "advanced"]) {
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
