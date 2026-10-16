/**
 * ===========================================================================
 *  ROUND 33, MEASURED: THE COMMUNITY ADMIN'S SHELL, SAVE BAR AND CARDS
 * ===========================================================================
 * The owner's round 33 asks, as numbers from headless Chromium over the real
 * shell, sections and list (scripts/render-community-admin-round33.tsx), at
 * 1440, 1280 and 390:
 *
 *   HEADER    the way back is /app's (36px square, the quiet grey arrow), the
 *             state is a badge beside the name (22px, the /app tint), no
 *             member count under the name, nothing in the bar overlaps, Page
 *             is the tab after Overview; with no logo the letter sits on a
 *             gradient
 *   TABS      scrolled, the bar with the name is out of sight and the row of
 *             tabs is at the top of the pane; a press while scrolled keeps
 *             the row where it was
 *   SAVEBAR   a settings form's bar: up only with a change, wholly inside
 *             the screen, clear of the rail on a computer and above the pill
 *             on a phone; scrolled to the end, the last card ends above it
 *   EDITOR    an editor page's bar (EditorFoot with a status): up from the
 *             start with the state as a badge and Back, Cancel once there is
 *             a change; the page's last line clears it; the room it keeps is
 *             dropped as soon as another section is shown
 *   CARDS     /app/community: every state a badge; a card with no cover is a
 *             gradient (from the logo's colours once read, from the name
 *             without a logo), never flat grey
 *   SWITCH    Page opens from its tab, and a second time with no router call
 *
 *   node scripts/check-community-admin-round33.mjs [HEADER TABS ...]
 *   SHOTS_DIR=dir to keep the pictures (.round33-admin-shots by default; delete it before committing)
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()))
const want = (s) => only.size === 0 || only.has(s)
const stubs = join(root, ".community-admin33-probe")
const shots = process.env.SHOTS_DIR || join(root, ".round33-admin-shots")
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
  /* With BASE_SRC, the stylesheet is compiled over that copy too, so its own classes have their CSS. */
  let sheet = null
  if (process.env.BASE_SRC) {
    sheet = join(stubs, "globals-with-base.css")
    writeFileSync(sheet, `${readFileSync(join(root, "app/globals.css"), "utf8")}\n@source "${process.env.BASE_SRC}";\n`)
  }
  const css = await appCss(root, sheet)
  const fonts = interFaces(root)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-admin-round33.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.community-admin33-probe/navigation.js", "next/link": "./.community-admin33-probe/link.jsx", "next/image": "./.community-admin33-probe/image.jsx" },
    plugins: [
      { name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } },
      /*
        BASE_SRC=dir measures an older copy of the community screens (components/community and lib/communities, say from
        `git archive <commit> components/community lib/communities | tar -x -C dir`) with everything else from this
        checkout, for a before and after with the same probe.
      */
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


  const SIZES = [
    ["1440", DESK],
    ["1280", LAPTOP],
    ["390", PHONE],
  ]
  const shot = (p, name) => p.screenshot({ path: join(shots, `${name}.png`) })
  /* The pane's own top, and the rect of the bar of a form or an editor that is up and on screen. */
  const paneTop = (p) => p.evaluate(() => Math.round(document.querySelector("[data-community-shell]").getBoundingClientRect().top))
  const footUp = (p) =>
    p.evaluate(() => {
      const foot = [...document.querySelectorAll('[data-editor-foot][data-foot="up"]')].find((el) => el.getClientRects().length > 0)
      if (!foot) return null
      const b = foot.querySelector("[data-foot-bar]").getBoundingClientRect()
      const pill = document.querySelector("[data-app-nav-pill]")
      const pr = pill && getComputedStyle(pill).display !== "none" ? pill.getBoundingClientRect() : null
      return {
        x: Math.round(b.left),
        right: Math.round(b.right),
        y: Math.round(b.top),
        bottom: Math.round(b.bottom),
        h: Math.round(b.height),
        vw: innerWidth,
        vh: innerHeight,
        pillTop: pr ? Math.round(pr.top) : null,
        kind: foot.getAttribute("data-foot-kind"),
        words: foot.querySelector("[data-foot-words]").textContent.trim(),
        leave: !!foot.querySelector("[data-foot-leave]"),
        cancel: !!foot.querySelector("[data-foot-cancel]"),
        foots: Number(document.querySelector("[data-community-body]")?.getAttribute("data-foots") ?? -1),
      }
    })
  const toEnd = (p) =>
    p.evaluate(async () => {
      const pane = document.querySelector("[data-community-shell]")
      pane.scrollTop = pane.scrollHeight
      await new Promise((r) => setTimeout(r, 200))
    })
  /* A bar wholly on screen: inside the window, clear of the rail (from 768px) and above the pill (a phone). */
  const barInside = (f, phone) => f && f.x >= (phone ? 0 : 240) && f.right <= f.vw && f.y >= 0 && f.bottom <= f.vh && (!phone || f.pillTop === null || f.bottom <= f.pillTop - 4)

  if (want("HEADER")) {
    console.log("\nHEADER")
    for (const [w, vp] of SIZES) {
      for (const q of ["", "?draft=1", "?nologo=1"]) {
        const { p, errors } = await open(`${BASE}${q}`, vp)
        const r = await p.evaluate(() => {
          const q = (s) => document.querySelector(s)
          const R = (el) => {
            if (!el) return null
            const b = el.getBoundingClientRect()
            return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right), bottom: Math.round(b.bottom) }
          }
          const back = q("[data-community-back]")
          const title = q("[data-community-title]")
          const badgeWord = title.querySelector("[data-community-state]")
          const badge = badgeWord?.parentElement
          const name = title.querySelector("h1")
          const actions = [...q("[data-community-actions]").children].filter((el) => el.getClientRects().length && getComputedStyle(el).display !== "none")
          const logo = q("[data-community-logo]")
          return {
            back: { ...R(back), color: getComputedStyle(back).color, radius: getComputedStyle(back).borderRadius },
            logo: { ...R(logo), ground: getComputedStyle(logo).backgroundImage.startsWith("radial-gradient") || getComputedStyle(logo).backgroundImage.startsWith("linear-gradient"), img: logo.tagName === "IMG" },
            name: R(name),
            badge: badge ? { ...R(badge), word: badgeWord.textContent, state: badgeWord.getAttribute("data-community-state"), bg: getComputedStyle(badge).backgroundColor } : null,
            actionsX: actions.length ? Math.min(...actions.map((el) => el.getBoundingClientRect().left)) : innerWidth,
            memberLine: /members?\b/i.test(title.textContent),
            bar: R(q("[data-community-bar]")),
            tabsBar: R(q("[data-community-tabs-bar]")),
            tabs: [...document.querySelectorAll("[data-tab]")].map((t) => t.getAttribute("data-tab")),
          }
        })
        const tag = `${w}${q ? ` ${q.slice(1)}` : ""}`
        expect(r.back.w === 36 && r.back.h === 36 && r.back.color === "rgb(75, 85, 99)" && r.back.radius === "8px", `${tag}: the way back is /app's 36px square, the quiet grey arrow`, r.back)
        expect(!!r.badge && r.badge.h === 22 && r.badge.word === (q === "?draft=1" ? "Draft" : "Published"), `${tag}: the state is a 22px badge beside the name`, r.badge)
        /* Beside the name, or under it when the row has no room for both. */
        expect(!!r.badge && (r.name.right <= r.badge.x || r.badge.y >= r.name.bottom - 2) && r.badge.right <= r.actionsX - 4 && r.name.right <= r.actionsX - 4, `${tag}: name, badge and actions do not overlap`, { name: r.name, badge: r.badge, actionsX: r.actionsX })
        expect(r.name.w >= (vp === PHONE ? 120 : 300), `${tag}: the name keeps the room it needs`, r.name.w)
        expect(!r.memberLine, `${tag}: no member count under the name`)
        expect(r.tabs[0] === "overview" && r.tabs[1] === "page", `${tag}: Page is the tab after Overview`, r.tabs.slice(0, 3))
        if (q === "?nologo=1") expect(r.logo.ground && !r.logo.img, `${tag}: no logo: the letter on a gradient`, r.logo)
        console.log(`        bar ${r.bar.h}px, tabs row ${r.tabsBar.h}px, name ${r.name.w}px`)
        await shot(p, `header-${w}${q ? `-${q.slice(1, q.indexOf("="))}` : ""}`)
        expect(errors.length === 0, `${tag}: no page errors`, errors)
        await p.close()
      }
    }
  }

  if (want("TABS")) {
    console.log("\nTABS")
    for (const [w, vp] of SIZES) {
      const { p, errors } = await open(`${BASE}/settings?tab=access`, vp)
      const top = await paneTop(p)
      await p.evaluate(async () => {
        const pane = document.querySelector("[data-community-shell]")
        pane.scrollTop = 500
        await new Promise((r) => setTimeout(r, 150))
      })
      const r = await p.evaluate(() => ({
        bar: Math.round(document.querySelector("[data-community-bar]").getBoundingClientRect().bottom),
        row: Math.round(document.querySelector("[data-community-tabs-bar]").getBoundingClientRect().top),
        rowH: Math.round(document.querySelector("[data-community-tabs-bar]").getBoundingClientRect().height),
        stuck: document.querySelector("[data-community-tabs-bar]").getAttribute("data-scrolled"),
      }))
      expect(r.row === top && r.bar <= top, `${w}: scrolled, the row of tabs is at the pane's top and the bar is out of sight`, { ...r, paneTop: top })
      expect(r.stuck === "true", `${w}: the row has its hairline once something is under it`)
      await shot(p, `tabs-scrolled-${w}`)
      /* A press while scrolled: the row stays where it was. */
      await p.evaluate(() => document.querySelector('[data-tab="overview"]').click())
      await sleep(DELAY + 300)
      const after = await p.evaluate(() => Math.round(document.querySelector("[data-community-tabs-bar]").getBoundingClientRect().top))
      expect(after === top, `${w}: a press while scrolled keeps the row at the top`, { after, paneTop: top })
      expect(errors.length === 0, `${w}: no page errors`, errors)
      await p.close()
    }
  }

  if (want("SAVEBAR")) {
    console.log("\nSAVEBAR")
    for (const [w, vp] of SIZES) {
      const phone = vp === PHONE
      const { p, errors } = await open(`${BASE}/settings?tab=address`, vp)
      const before = await footUp(p)
      expect(before === null, `${w}: no bar before a change`)
      await p.click("#g-slug")
      await p.keyboard.type("x")
      await sleep(450)
      const f = await footUp(p)
      expect(barInside(f, phone), `${w}: the bar is wholly on screen, clear of the rail${phone ? " and above the pill" : ""}`, f)
      expect(f && f.h === 52, `${w}: 52px tall`, f?.h)
      expect(f && f.foots === 1, `${w}: the section keeps room for one bar`, f?.foots)
      await shot(p, `savebar-${w}`)
      await toEnd(p)
      const end = await p.evaluate(() => {
        const panel = document.querySelector("[data-settings-panel]:not([hidden])")
        const last = [...panel.querySelectorAll("section")].filter((el) => el.getClientRects().length).pop()
        return Math.round(last.getBoundingClientRect().bottom)
      })
      const f2 = await footUp(p)
      expect(f2 && end <= f2.y - 8, `${w}: scrolled to the end, the last card ends above the bar`, { lastCardBottom: end, barTop: f2?.y })
      console.log(`        clearance at the end: ${f2 ? f2.y - end : "?"}px`)
      await shot(p, `savebar-end-${w}`)
      expect(errors.length === 0, `${w}: no page errors`, errors)
      await p.close()
    }
  }

  if (want("EDITOR")) {
    console.log("\nEDITOR")
    for (const [w, vp] of SIZES) {
      const phone = vp === PHONE
      const { p, errors } = await open(`${BASE}/page`, vp)
      await sleep(300)
      const f = await footUp(p)
      expect(f && f.kind === "editor" && f.words === "Published" && f.leave && !f.cancel, `${w}: up from the start, the state and Back`, f)
      expect(barInside(f, phone), `${w}: wholly on screen`, f)
      await shot(p, `editor-${w}`)
      await toEnd(p)
      const r = await p.evaluate(() => ({
        last: Math.round(document.querySelector("[data-demo-last]").getBoundingClientRect().bottom),
        row: Math.round(document.querySelector("[data-community-tabs-bar]").getBoundingClientRect().bottom),
      }))
      const f2 = await footUp(p)
      expect(f2 && r.last <= f2.y - 8, `${w}: the page's last line clears the bar`, { last: r.last, barTop: f2?.y })
      console.log(`        scrolled: the content has ${f2 ? f2.y - r.row : "?"}px between the tabs row and the bar, of ${vp.height}px`)
      await shot(p, `editor-end-${w}`)
      await p.click("[data-demo-name]")
      await p.keyboard.type("!")
      await sleep(200)
      const f3 = await footUp(p)
      expect(f3 && f3.cancel && !f3.leave && /Unsaved/.test(f3.words), `${w}: a change: Unsaved changes, Cancel and Save`, f3)
      await p.click("[data-foot-cancel]")
      await sleep(200)
      /* Another section: the editor's bar and its room go with it. */
      await p.evaluate(() => document.querySelector('[data-tab="overview"]').click())
      await sleep(DELAY + 400)
      const away = await footUp(p)
      const foots = await p.evaluate(() => Number(document.querySelector("[data-community-body]").getAttribute("data-foots")))
      expect(away === null && foots === 0, `${w}: on Overview no bar is shown and no room is kept`, { away, foots })
      await p.evaluate(() => document.querySelector('[data-tab="page"]').click())
      await sleep(300)
      const back = await footUp(p)
      expect(back && back.foots === 1, `${w}: back on Page the bar and its room return`, back)
      expect(errors.length === 0, `${w}: no page errors`, errors)
      await p.close()
    }
  }

  if (want("CARDS")) {
    console.log("\nCARDS")
    for (const [w, vp] of SIZES) {
      const { p, errors } = await open(`/app/community`, vp)
      await sleep(900)
      const cards = await p.evaluate(() =>
        [...document.querySelectorAll("[data-community-card]")].map((c) => {
          const cover = c.querySelector("[data-card-cover]")
          const fill = cover.querySelector("[data-cover-fill]")
          const over = fill?.firstElementChild && !fill.firstElementChild.hasAttribute("data-cover-fill") ? getComputedStyle(fill.firstElementChild).backgroundImage : null
          const badge = c.querySelector("[data-card-state] [data-community-state]")?.parentElement
          const coverBg = fill ? getComputedStyle(fill).backgroundImage : ""
          return {
            id: c.getAttribute("data-community-card"),
            name: c.querySelector("[data-card-name]").textContent,
            cover: cover.getAttribute("data-card-cover"),
            fill: fill?.getAttribute("data-cover-fill") ?? null,
            gradient: /gradient/.test(coverBg),
            icon: over ? over.match(/rgb\([^)]+\)/g)?.slice(1, 3) : null,
            name_: coverBg.match(/rgb\([^)]+\)/g)?.slice(1, 3) ?? null,
            badge: badge ? { word: badge.textContent, h: Math.round(badge.getBoundingClientRect().height), bg: getComputedStyle(badge).backgroundColor } : null,
          }
        }),
      )
      for (const c of cards) {
        expect(!!c.badge && c.badge.h === 22, `${w}: ${c.name}: the state is a badge`, c.badge)
        if (c.cover === "gradient") expect(c.gradient, `${w}: ${c.name}: no cover, a gradient`, c.name_)
      }
      const byId = Object.fromEntries(cards.map((c) => [c.id, c]))
      expect(byId.c0.cover === "picture", `${w}: a cover is its picture`)
      expect(byId.c1.fill === "icon" && byId.c2.fill === "icon", `${w}: with a logo, the gradient is read from it`, { c1: byId.c1.icon, c2: byId.c2.icon })
      expect(byId.c3.fill === "name", `${w}: with neither, the name's gradient`, byId.c3.name_)
      console.log(`        Morning Pages (teal and amber logo): ${JSON.stringify(byId.c1.icon)}; Trail Runners (blue and red): ${JSON.stringify(byId.c2.icon)}`)
      await shot(p, `cards-${w}`)
      expect(errors.length === 0, `${w}: no page errors`, errors)
      await p.close()
    }
  }

  if (want("SWITCH")) {
    console.log("\nSWITCH")
    const { p, errors } = await open(`${BASE}`, DESK)
    await sleep(400)
    const first = await press(p, "page")
    expect(first.ms !== null && first.blank === 0, "the first press on Page: its frame at once, no blank frame", first)
    await press(p, "overview")
    const again = await press(p, "page")
    expect(again.calls.length === 0 && again.frame !== null && again.frame <= 2, "the second press on Page: no router call, on the next frame", again)
    await shot(p, "page-1440")
    for (const [w, vp] of SIZES) {
      const o = await open(`${BASE}`, vp)
      await shot(o.p, `overview-${w}`)
      await o.p.close()
      const s = await open(`${BASE}/settings?tab=access`, vp)
      await shot(s.p, `settings-${w}`)
      if (vp === PHONE) {
        const l = await open(`${BASE}/settings`, vp)
        await shot(l.p, `settings-list-${w}`)
        await l.p.close()
      }
      await s.p.close()
    }
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

console.log(`\npictures: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
