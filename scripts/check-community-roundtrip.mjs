/**
 * ===========================================================================
 *  THE LIST AND A COMMUNITY, THERE AND BACK, MEASURED
 * ===========================================================================
 * The owner: "opening the edit page of a community must be a smooth transition in; exiting must not be abrupt: a
 * smooth transition back, list position restored, no flash." Over the real list, the real shell and its real
 * sections, with the real stage and loading bar (scripts/render-community-roundtrip.tsx), at 390 and 1280:
 *
 *   in       the list scrolled to its last card, a press on it: frames until the shell is drawn, frames with neither
 *            page, and the landing the stage plays on the shell (its opacity on the first frames)
 *   tabs     Members and Settings pressed (two history entries the shell adds)
 *   out      the shell's back arrow: where the address lands, how many entries the history moved, the list's scroll
 *            against what it was, frames with neither page, the least opacity the list had on any frame (a landing or
 *            a fade is a flash), the card tinted
 *   honest   after the way back, the entry is the list's own (Navigation API index), so the browser's Back leaves it
 *
 * NONAV=1 measures an engine without the Navigation API (WebKit before 26.2): one back, then the list put up in place.
 *
 *   node scripts/check-community-roundtrip.mjs
 *   SIZES=390 NONAV=1 node scripts/check-community-roundtrip.mjs
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const stubs = join(root, ".community-roundtrip-probe")
const ORIGIN = "https://storelib.com"
const SLUG = "salajanywood"
const DELAY = Number(process.env.DELAY || 250)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

mkdirSync(stubs, { recursive: true })
let failed = false
try {
  writeFileSync(
    join(stubs, "navigation.js"),
    `import { useMemo, useSyncExternalStore } from "react"
const DELAY = ${DELAY}
const listeners = new Set()
const push0 = history.pushState.bind(history)
const replace0 = history.replaceState.bind(history)
replace0({ __routed: location.pathname + location.search }, "", location.pathname + location.search)
let state = { pathname: location.pathname, search: location.search, routed: location.pathname + location.search, v: 0 }
const set = (p) => { state = { ...state, ...p }; listeners.forEach((f) => f()) }
const log = (k, a) => (window.__router ||= []).push([k, a, Math.round(performance.now())])
const ahead = new Set()
/* As Next: an entry made by the page itself keeps the page the router drew (its tree is copied into the state). */
const withRouted = (s) => ({ ...(s || {}), __routed: (s && s.__routed) || (history.state && history.state.__routed) || state.routed })
history.pushState = (s, u, url) => { push0(withRouted(s), u, url); set({ pathname: location.pathname, search: location.search }) }
history.replaceState = (s, u, url) => { replace0(withRouted(s), u, url); set({ pathname: location.pathname, search: location.search }) }
/* A back or forward is drawn from the router's cache at once, the page that entry had. */
window.addEventListener("popstate", () => set({ pathname: location.pathname, search: location.search, routed: (history.state && history.state.__routed) || location.pathname + location.search }))
window.__probeRouter = { subscribe: (f) => (listeners.add(f), () => listeners.delete(f)), get: () => state }
const wait = (h) => (ahead.has(h.split("?")[0]) ? 30 : DELAY)
const router = {
  push: (h) => { log("push", h); setTimeout(() => { push0({ __routed: h }, "", h); set({ pathname: location.pathname, search: location.search, routed: h, v: state.v + 1 }) }, wait(h)) },
  replace: (h) => { log("replace", h); setTimeout(() => { replace0({ __routed: h }, "", h); set({ pathname: location.pathname, search: location.search, routed: h, v: state.v + 1 }) }, wait(h)) },
  prefetch: (h) => { log("prefetch", h); ahead.add(h.split("?")[0]) },
  refresh: () => { log("refresh", location.pathname + location.search); setTimeout(() => set({ v: state.v + 1 }), DELAY) },
  back: () => history.back(),
  forward: () => history.forward(),
}
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
    entryPoints: [join(root, "scripts/render-community-roundtrip.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.community-roundtrip-probe/navigation.js", "next/link": "./.community-roundtrip-probe/link.jsx", "next/image": "./.community-roundtrip-probe/image.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], protocolTimeout: 240_000 })
  const ALL = {
    1280: { width: 1280, height: 800, deviceScaleFactor: 1 },
    390: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  }
  const RECORDER = () => {
    window.__rec = { on: false, frames: [] }
    const tick = (now) => {
      if (window.__rec.on) {
        const list = document.querySelector("[data-community-list]")
        const shell = document.querySelector("[data-community-shell]")
        const outer = document.querySelector(".app-content-scroll")
        const op = (el) => (el ? Math.round(Number(getComputedStyle(el).opacity) * 100) / 100 : null)
        const card = document.querySelector('[data-row="6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"]')
        window.__rec.frames.push({
          now,
          path: location.pathname,
          list: !!list,
          shell: !!shell,
          listTop: list ? list.scrollTop : null,
          op: Math.min(op(outer) ?? 1, op(list) ?? 1, op(shell) ?? 1),
          tf: outer ? getComputedStyle(outer).transform : "",
          anims: document.getAnimations().filter((a) => a.playState === "running").length,
          tint: card ? getComputedStyle(card).backgroundColor : null,
        })
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
  const sizes = (process.env.SIZES || "1280,390").split(",")
  const out = []
  for (const size of sizes) {
    const vp = ALL[size]
    const phone = size === "390"
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    p.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text().slice(0, 300)}`))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) return void setTimeout(() => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [], next: null, capped: false, words: [], ready: true, domains: [], communities: [] }) }).catch(() => {}), 120)
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    if (process.env.NONAV) await p.evaluateOnNewDocument(() => Object.defineProperty(window, "navigation", { value: undefined, configurable: true }))
    await p.evaluateOnNewDocument(RECORDER)
    /* The tab's blank page is the entry before the list, as the dashboard would be. */
    await p.goto(`${ORIGIN}/app/community`, { waitUntil: "load" })
    await p.waitForSelector("[data-community-list]")
    await sleep(800)
    const nav = () => p.evaluate(() => ({ idx: window.navigation?.currentEntry?.index ?? null, len: history.length, path: location.pathname }))
    const listEntry = await nav()
    /* The list scrolled so the last card is in view. */
    const scrolledTo = await p.evaluate(() => {
      const list = document.querySelector("[data-community-list]")
      const card = document.querySelector('[data-row="6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"]')
      list.scrollTop = card.offsetTop - 120
      list.dispatchEvent(new Event("scroll"))
      return list.scrollTop
    })
    await sleep(300)
    const tap = async (sel) => {
      const c = await p.evaluate((sel) => {
        const el = document.querySelector(sel)
        if (!el) return null
        const b = el.getBoundingClientRect()
        return { x: b.left + b.width / 2, y: b.top + Math.min(b.height / 2, 40) }
      }, sel)
      if (!c) throw new Error(`missing ${sel}`)
      if (phone) await p.touchscreen.tap(c.x, c.y)
      else {
        await p.mouse.move(c.x, c.y)
        await sleep(80)
        await p.mouse.click(c.x, c.y)
      }
    }
    const film = async (fn, ms) => {
      await p.evaluate(() => {
        window.__rec.frames = []
        window.__rec.on = true
      })
      await fn()
      await sleep(ms)
      return p.evaluate(() => {
        window.__rec.on = false
        return window.__rec.frames
      })
    }
    /* IN */
    const inF = await film(() => tap('[data-row="6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"] [data-card-name]'), 900)
    const firstShell = inF.findIndex((f) => f.shell)
    const inBlank = inF.filter((f) => !f.list && !f.shell).length
    const inOps = inF.slice(firstShell, firstShell + 12).map((f) => f.op)
    const afterIn = await nav()
    /* TABS */
    await tap('[data-tab="members"]')
    await sleep(400)
    await tap('[data-tab="settings"]')
    await sleep(400)
    const deep = await nav()
    /* OUT */
    const outF = await film(() => tap("[data-community-back]"), 1400)
    const firstList = outF.findIndex((f) => f.list)
    const outBlank = outF.filter((f) => !f.list && !f.shell).length
    const listFrames = outF.slice(firstList)
    const back = await nav()
    const tinted = listFrames.some((f) => f.tint && f.tint !== "rgba(0, 0, 0, 0)" && f.tint !== "rgb(255, 255, 255)")
    const r = {
      size,
      nonav: !!process.env.NONAV,
      in: { framesToShell: firstShell, blankFrames: inBlank, opacityFirstFrames: inOps },
      history: { list: listEntry, opened: afterIn, afterTabs: deep, afterBack: back },
      out: {
        path: back.path,
        framesToList: firstList,
        blankFrames: outBlank,
        scrollBefore: scrolledTo,
        scrollFirstFrame: listFrames[0]?.listTop ?? null,
        scrollEnd: listFrames.at(-1)?.listTop ?? null,
        minOpacity: Math.min(...listFrames.map((f) => f.op)),
        tinted,
        /* A back past the list's entry, or a new entry for it: either is a history that lies. */
        entryIsList: process.env.NONAV ? back.path === "/app/community" : back.idx === listEntry.idx,
      },
      errors,
    }
    const ok = r.out.path === "/app/community" && r.out.blankFrames === 0 && r.in.blankFrames === 0 && Math.abs((r.out.scrollFirstFrame ?? -1) - scrolledTo) <= 1 && r.out.minOpacity >= 0.99 && r.out.entryIsList && errors.length === 0
    r.ok = ok
    if (!ok) failed = true
    out.push(r)
    console.log(JSON.stringify(r, null, 1))
    await p.close()
  }
  await browser.close()
  console.log(failed ? "ROUND TRIP: NOT DONE" : "ROUND TRIP: ok at every size")
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
process.exit(failed ? 1 : 0)
