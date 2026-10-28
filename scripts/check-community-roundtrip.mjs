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
 * BASE=<git ref> measures the list, the shell and the way back as they were at that commit (a before and after).
 * AUDIT=1 opens every section instead (and every Settings panel) and reports, per section: errors in the console,
 * anything wider than the window (a sideways scroll of the page), boxes cut off at the right edge, and presses under
 * 32px on a phone. SHOTS=dir keeps a screenshot of each.
 * NONAV=1 measures an engine without the Navigation API (WebKit before 26.2): one back, then the list put up in place.
 *
 *   node scripts/check-community-roundtrip.mjs
 *   SIZES=390 NONAV=1 node scripts/check-community-roundtrip.mjs
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { execFileSync } from "node:child_process"
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
/* A back or forward is drawn from the router's cache, the page that entry had, in a render of its own after the event (Next's is a transition), so every popstate listener has run first. */
window.addEventListener("popstate", () => setTimeout(() => set({ pathname: location.pathname, search: location.search, routed: (history.state && history.state.__routed) || location.pathname + location.search }), 0))
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
    plugins: [
      { name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } },
      ...(process.env.BASE
        ? [{
            name: "base",
            setup(b) {
              const files = ["components/community/creator/community-list.tsx", "components/community/creator/community-shell.tsx", "components/community/creator/delete-community.tsx", "components/app/list-return.ts", "lib/navigation/go-back.ts"]
              b.onLoad({ filter: /\.(tsx?|ts)$/ }, (args) => {
                const rel = args.path.slice(root.length + 1)
                if (process.env.DEBUG && rel.includes("community-list")) console.log("BASE load", rel)
                if (!files.includes(rel)) return undefined
                return { contents: execFileSync("git", ["show", `${process.env.BASE}:${rel}`], { cwd: root, encoding: "utf8" }), loader: rel.endsWith("x") ? "tsx" : "ts", resolveDir: dirname(args.path) }
              })
            },
          }]
        : []),
    ],
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
        /* What the stage's landing moves: the boxes inside the page's scroller (app-stage playEntrance). */
        const kids = [...(list || shell)?.children || []].filter((k) => k.getClientRects().length)
        const kidsOp = kids.length ? Math.min(...kids.map(op)) : 1
        const card = document.querySelector('[data-community-card="6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"]')
        window.__rec.frames.push({
          now,
          path: location.pathname,
          list: !!list,
          shell: !!shell,
          listTop: list ? list.scrollTop : null,
          op: Math.min(op(outer) ?? 1, op(list) ?? 1, op(shell) ?? 1, kidsOp),
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
  if (process.env.AUDIT) {
    for (const size of sizes) await audit(browser, ALL[size], size === "390", size, html)
    await browser.close()
    process.exit(failed ? 1 : 0)
  }
  for (const size of sizes) {
    const vp = ALL[size]
    const phone = size === "390"
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    /* The probe's own page cannot load the built fonts from disk: not the app's. */
    p.on("console", (m) => m.type() === "error" && !/Not allowed to load local resource/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 300)}`))
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
      const card = document.querySelector('[data-community-card="6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"]')
      list.scrollTop = card.offsetTop - 120
      list.dispatchEvent(new Event("scroll"))
      return list.scrollTop
    })
    await sleep(300)
    const tap = async (sel) => {
      const c = await p.evaluate((sel) => {
        const el = document.querySelector(sel)
        if (!el) return null
        /* A tab out of the strip's view is swiped into it first, as a finger would. */
        const strip = el.closest("[data-section-tabs]")
        if (strip) {
          const tb = el.getBoundingClientRect()
          const sb = strip.getBoundingClientRect()
          if (tb.left < sb.left + 8 || tb.right > sb.right - 8) strip.scrollLeft += tb.left - sb.left - (sb.width - tb.width) / 2
        }
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
    const inF = await film(() => tap('[data-community-card="6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"] [data-card-name]'), 900)
    const firstShell = inF.findIndex((f) => f.shell)
    const inBlank = inF.filter((f) => !f.list && !f.shell).length
    const inOps = inF.slice(firstShell, firstShell + 14).map((f) => f.op)
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

/* ── AUDIT=1: every section at this size ── */
async function audit(browser, vp, phone, size, html) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
  p.on("console", (m) => m.type() === "error" && !/Not allowed to load local resource/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 300)}`))
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const url = r.url()
    if (url.startsWith(`${ORIGIN}/api/`)) return void setTimeout(() => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [], next: null, capped: false, words: [], ready: true, domains: [], communities: [] }) }).catch(() => {}), 120)
    if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
    if (url.startsWith("data:")) return r.continue()
    return r.respond({ status: 204, body: "" })
  })
  await p.goto(`${ORIGIN}/app/community/${SLUG}`, { waitUntil: "load" })
  await p.waitForSelector("[data-community-shell]")
  await sleep(900)
  const tabs = await p.$$eval("[data-tab]", (els) => els.map((e) => e.getAttribute("data-tab")).filter((t) => t !== "page"))
  const shots = process.env.SHOTS
  if (shots) mkdirSync(shots, { recursive: true })
  const measure = (phone) =>
    p.evaluate((phone) => {
      const vw = document.documentElement.clientWidth
      const pane = document.querySelector("[data-community-shell]")
      const screen = [...pane.querySelectorAll("[data-section-screen]")].find((el) => !el.hidden && el.getClientRects().length)
      /* Inside a box that scrolls sideways on purpose (the row of tabs, a wide table): not cut off. */
      const scrollsX = (el) => {
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const ox = getComputedStyle(a).overflowX
          if ((ox === "auto" || ox === "scroll") && a.scrollWidth > a.clientWidth + 1) return true
          if (ox === "hidden" || ox === "clip") return a !== pane
        }
        return false
      }
      const who = (el) => `${el.nodeName.toLowerCase()}${[...el.attributes].filter((a) => a.name.startsWith("data-") || a.name === "aria-label").slice(0, 2).map((a) => `[${a.name}${a.value ? `=${a.value.slice(0, 24)}` : ""}]`).join("")} "${(el.textContent || "").trim().slice(0, 30)}"`
      const cut = []
      const small = []
      for (const el of screen ? screen.querySelectorAll("*") : []) {
        const b = el.getBoundingClientRect()
        if (!b.width || !b.height) continue
        const cs = getComputedStyle(el)
        if (cs.visibility === "hidden" || cs.position === "fixed") continue
        if (b.right > vw + 1 && !scrollsX(el)) cut.push(`${who(el)} right ${Math.round(b.right)}`)
        if (phone && (el.matches("button, a[href], [role=button], input[type=checkbox], select")) && (b.height < 32 || b.width < 32)) {
          /* A press made bigger by its ::after (the app's 44px rule) counts as big enough. */
          const after = getComputedStyle(el, "::after")
          const grown = after.content !== "none" && after.position === "absolute"
          if (!grown && !el.closest("p, li > span") ) small.push(`${who(el)} ${Math.round(b.width)}x${Math.round(b.height)}`)
        }
      }
      return { wide: pane.scrollWidth > pane.clientWidth + 1 ? pane.scrollWidth : 0, cut: [...new Set(cut)].slice(0, 8), small: [...new Set(small)].slice(0, 8), height: screen ? Math.round(screen.getBoundingClientRect().height) : 0, text: screen ? (screen.innerText || "").trim().slice(0, 80).replace(/\s+/g, " ") : "" }
    }, phone)
  const rows = []
  for (const id of tabs) {
    await p.evaluate((id) => {
      const el = document.querySelector(`[data-tab="${id}"]`)
      const strip = el.closest("[data-section-tabs]")
      const tb = el.getBoundingClientRect()
      const sb = strip.getBoundingClientRect()
      if (tb.left < sb.left + 8 || tb.right > sb.right - 8) strip.scrollLeft += tb.left - sb.left - (sb.width - tb.width) / 2
    }, id)
    await sleep(150)
    const c = await p.$eval(`[data-tab="${id}"]`, (el) => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } })
    const before = errors.length
    if (phone) await p.touchscreen.tap(c.x, c.y)
    else await p.mouse.click(c.x, c.y)
    await sleep(1000)
    const m = await measure(phone)
    rows.push({ id, ...m, errors: errors.slice(before) })
    if (shots) await p.screenshot({ path: join(shots, `${size}-${id}.png`), fullPage: false })
  }
  for (const r of rows) {
    const bad = r.wide || r.cut.length || r.errors.length
    if (bad) failed = true
    console.log(`${size} ${r.id.padEnd(11)} ${bad ? "CHECK" : "ok   "} wide ${r.wide} cut ${r.cut.length} small ${r.small.length} errors ${r.errors.length}`)
    for (const x of [...r.cut, ...r.small.map((s) => `small: ${s}`), ...r.errors]) console.log(`    ${x}`)
  }
  await p.close()
}
