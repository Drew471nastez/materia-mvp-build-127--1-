/**
 * ===========================================================================
 *  ROUND 37, FILMED: MOVING BETWEEN THE COMMUNITY ADMIN'S TABS
 * ===========================================================================
 * The owner: "In the community admin, switching between pages is not smooth
 * and clean, it has bumps." Headless Chromium over the real shell and every
 * real section (scripts/render-community-admin-round37.tsx) presses every
 * tab in order and back, at 1440x900, 1280x800 and 390x844, at 1x and 4x
 * CPU, films it (CDP screencast) and reads every frame of every switch:
 *
 *   tabs/head   how far the row of tabs and the bar above it moved
 *   top         how far the section's top moved against the row under it
 *   scroll      the pane's scroll on every frame (a jump is a change after the first frame)
 *   collapse    the least the pane could scroll on any frame against before and after
 *   swap        the frame giving way to the section: how far its first cards moved, and its height
 *   after       anything in the section that moved once it was in (reads arriving, pictures, fonts)
 *   foot        the save bar coming or going, and whether the section moved with it
 *   gutter      the pane's inner width on every frame (a scrollbar coming or going)
 *   blank       frames with no section on screen
 *   pill        the lit tab's pill: the frames it spent between the old tab and the new (0 is a jump)
 *   shift       layout shift (CLS style) summed over the switch
 *   ms          first frame of the new section and the first frame of its content
 *
 * Passes: "first" opens each tab for the first time (read ahead, so the router answers within a frame or two; with
 * COLD=1 it answers after 450ms and the frame is on screen meanwhile), "back" walks the row back over held sections,
 * "scrolled" presses the next tab with the section scrolled 600px down.
 *
 *   node scripts/check-community-admin-round37.mjs              every size, 1x and 4x
 *   SIZES=1440 CPU=1 node scripts/check-community-admin-round37.mjs
 *   COLD=1  the router answers after 450ms even after a read ahead
 *   FILM=dir keeps every frame and a contact sheet per switch (.round37-film by default; delete it before committing)
 *   BASE_SRC=dir measures an older copy of components/community (see round 33's probe) for a before and after
 *   JSON=file writes every number
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { execFileSync } from "node:child_process"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const stubs = join(root, ".community-admin37-probe")
const film = process.env.FILM || join(root, ".round37-film")
const ORIGIN = "https://storelib.com"
const BASE = "/app/community/salajanywood"
const DELAY = 450
const COLD = !!process.env.COLD
const WINDOW = Number(process.env.WINDOW || (COLD ? 1100 : 700))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

mkdirSync(stubs, { recursive: true })
mkdirSync(film, { recursive: true })
const results = []
try {
  writeFileSync(
    join(stubs, "navigation.js"),
    `import { useMemo, useSyncExternalStore } from "react"
const DELAY = ${DELAY}
const COLD = ${COLD}
const listeners = new Set()
let state = { pathname: location.pathname, search: location.search, routed: location.pathname + location.search, v: 0 }
const set = (p) => { state = { ...state, ...p }; listeners.forEach((f) => f()) }
const log = (k, a) => (window.__router ||= []).push([k, a, Math.round(performance.now())])
const push0 = history.pushState.bind(history)
const replace0 = history.replaceState.bind(history)
const ahead = new Map()
/* A page read ahead a while ago is in the router's cache: the push answers within two frames, as Next's does. */
const wait = (h) => { const at = ahead.get(h.split("?")[0]); if (COLD || at === undefined) return DELAY; return Math.max(24, DELAY - (performance.now() - at)) }
history.pushState = (s, u, url) => { push0(s, u, url); set({ pathname: location.pathname, search: location.search }) }
history.replaceState = (s, u, url) => { replace0(s, u, url); set({ pathname: location.pathname, search: location.search }) }
window.addEventListener("popstate", () => set({ pathname: location.pathname, search: location.search }))
window.__probeRouter = { subscribe: (f) => (listeners.add(f), () => listeners.delete(f)), get: () => state }
const router = {
  push: (h) => { log("push", h); setTimeout(() => { push0(null, "", h); set({ pathname: location.pathname, search: location.search, routed: h, v: state.v + 1 }) }, wait(h)) },
  replace: (h) => { log("replace", h); setTimeout(() => { replace0(null, "", h); set({ pathname: location.pathname, search: location.search, routed: h, v: state.v + 1 }) }, wait(h)) },
  prefetch: (h) => { log("prefetch", h); if (!ahead.has(h.split("?")[0])) ahead.set(h.split("?")[0], performance.now()) },
  refresh: () => { log("refresh", location.pathname + location.search); setTimeout(() => set({ routed: location.pathname + location.search, v: state.v + 1 }), DELAY) },
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
  let sheet = null
  if (process.env.BASE_SRC) {
    sheet = join(stubs, "globals-with-base.css")
    writeFileSync(sheet, `${readFileSync(join(root, "app/globals.css"), "utf8")}\n@source "${process.env.BASE_SRC}";\n`)
  }
  const css = await appCss(root, sheet)
  const fonts = interFaces(root)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-admin-round37.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.community-admin37-probe/navigation.js", "next/link": "./.community-admin37-probe/link.jsx", "next/image": "./.community-admin37-probe/image.jsx" },
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
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], protocolTimeout: 240_000 })
  const ALL = {
    1440: { width: 1440, height: 900, deviceScaleFactor: 1 },
    1280: { width: 1280, height: 800, deviceScaleFactor: 1 },
    390: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  }
  const sizes = (process.env.SIZES || "1440,1280,390").split(",")
  const cpus = (process.env.CPU || "1,4").split(",").map(Number)

  /* Every frame, from the page: what the eye would follow. */
  const RECORDER = () => {
    if (window.__rec) return
    window.__rec = { on: false, frames: [], shifts: [], long: [] }
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          if (!window.__rec.on) continue
          window.__rec.shifts.push({
            at: e.startTime,
            v: e.value,
            src: (e.sources || []).slice(0, 3).map((s) => {
              const n = s.node
              const tag = n ? `${n.nodeName.toLowerCase()}${n.id ? `#${n.id}` : ""}${n.getAttribute ? [...n.attributes].filter((a) => a.name.startsWith("data-")).map((a) => `[${a.name}]`).join("") : ""}` : "?"
              return { tag, cls: n && n.className && typeof n.className === "string" ? n.className.slice(0, 80) : "", dy: Math.round(s.currentRect.y - s.previousRect.y), dh: Math.round(s.currentRect.height - s.previousRect.height) }
            }),
          })
        }
      }).observe({ type: "layout-shift", buffered: false })
    } catch {}
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (window.__rec.on) window.__rec.long.push({ at: e.startTime, ms: Math.round(e.duration) })
      }).observe({ type: "longtask", buffered: false })
    } catch {}
    const R = (el) => {
      if (!el) return null
      const b = el.getBoundingClientRect()
      return [Math.round(b.left * 10) / 10, Math.round(b.top * 10) / 10, Math.round(b.width * 10) / 10, Math.round(b.height * 10) / 10]
    }
    const sample = (now) => {
      const pane = document.querySelector("[data-community-shell]")
      if (!pane) return null
      const screens = [...pane.querySelectorAll("[data-section-screen]")].filter((el) => !el.hidden && el.getClientRects().length > 0)
      const vis = screens.map((el) => {
        const cs = getComputedStyle(el)
        const inner = el.querySelector("[data-section-frame]")
        const kind = el.hasAttribute("data-section-framed") ? "frame" : inner ? "fallback" : el.hasAttribute("data-section-kept") ? "kept" : "routed"
        /* The first cards on screen, against the screen's top: what a frame has to match. */
        const cards = []
        const all = el.querySelectorAll("section, [data-frame-card], [class*='rounded-2xl']")
        for (const c of all) {
          if (cards.length >= 4) break
          const b = c.getBoundingClientRect()
          if (b.height < 16 || b.width < 120) continue
          if (cards.some((k) => k.el.contains(c))) continue
          cards.push({ el: c, r: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] })
        }
        const imgs = [...el.querySelectorAll("img")].filter((i) => i.getClientRects().length && !i.complete).length
        return { id: el.getAttribute("data-section-screen"), kind, r: R(el), op: Number(cs.opacity), tf: cs.translate !== "none" ? cs.translate : cs.transform !== "none" ? cs.transform : "", cards: cards.map((c) => c.r), imgs }
      })
      const lit = pane.querySelector('[data-tab][aria-current="page"]')
      const pill = pane.querySelector("[data-tab-pill]")
      const foot = [...document.querySelectorAll('[data-editor-foot][data-foot="up"]')].find((el) => el.getClientRects().length > 0)
      return {
        now,
        st: pane.scrollTop,
        sh: pane.scrollHeight,
        cw: pane.clientWidth,
        ch: pane.clientHeight,
        head: R(pane.querySelector("[data-community-header]")),
        tabs: R(pane.querySelector("[data-community-tabs-bar]")),
        lit: lit ? lit.getAttribute("data-tab") : null,
        litR: R(lit),
        pill: pill ? R(pill) : null,
        vis,
        foot: foot ? R(foot.querySelector("[data-foot-bar]") || foot) : null,
        fonts: document.fonts.status,
      }
    }
    window.__sample = () => sample(performance.now())
    const tick = (now) => {
      if (window.__rec.on) {
        const s = sample(now)
        if (s) window.__rec.frames.push(s)
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  async function open(vp, cpu) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => { errors.push(String(e).slice(0, 300)); if (process.env.DEBUG) console.log("PAGEERROR", String(e).slice(0, 600)) })
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        let body = { rows: [], next: null, capped: false }
        if (url.includes("/words")) body = { words: ["spam"], action: "block" }
        else if (url.includes("/api/domains")) body = { domains: [], purposes: ["community"], communities: [] }
        else if (url.includes("/scheduled-posts")) body = { rows: [], ready: true }
        /* As a server would: the section's own reads after mount take a moment. */
        return void setTimeout(() => r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) }).catch(() => {}), 120)
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    const cdp = await p.createCDPSession()
    if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
    await p.evaluateOnNewDocument(RECORDER)
    await p.goto(`${ORIGIN}${BASE}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(1200)
    return { p, cdp, errors }
  }

  /* Bring a tab into the strip's view without moving the pane (a finger would swipe the row), then a real press on it. */
  async function press(p, id, phone) {
    const at = await p.evaluate((id) => {
      const t = document.querySelector(`[data-tab="${id}"]`)
      if (!t) return { missing: id, tabs: [...document.querySelectorAll("[data-tab]")].map((x) => x.getAttribute("data-tab")), path: location.pathname, body: document.body.innerText.slice(0, 400) }
      const s = t.closest("[data-section-tabs]")
      const tb = t.getBoundingClientRect()
      const sb = s.getBoundingClientRect()
      if (tb.left < sb.left + 8 || tb.right > sb.right - 8) s.scrollLeft += tb.left - sb.left - (sb.width - tb.width) / 2
      return null
    }, id)
    if (at) throw new Error(`no tab: ${JSON.stringify(at)}`)
    await sleep(120)
    const c = await p.evaluate((id) => {
      const b = document.querySelector(`[data-tab="${id}"]`).getBoundingClientRect()
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
    }, id)
    await p.mouse.move(c.x, c.y)
    await sleep(60)
    await p.evaluate(() => {
      window.__rec.frames = []
      window.__rec.shifts = []
      window.__rec.long = []
      window.__rec.before = window.__sample()
      window.__rec.on = true
      document.addEventListener("click", () => (window.__rec.clickAt = performance.now()), { capture: true, once: true })
    })
    const wall = Date.now()
    if (phone) await p.touchscreen.tap(c.x, c.y)
    else await p.mouse.click(c.x, c.y)
    await sleep(WINDOW)
    const rec = await p.evaluate(() => {
      window.__rec.on = false
      return { frames: window.__rec.frames, shifts: window.__rec.shifts, long: window.__rec.long, before: window.__rec.before, clickAt: window.__rec.clickAt }
    })
    return { ...rec, wall }
  }

  /* The numbers of one switch, from its frames. */
  function measure(from, to, rec) {
    const { frames, before, clickAt } = rec
    const f = frames.filter((x) => x.now >= (clickAt ?? 0) - 1)
    const max = (a) => (a.length ? Math.max(...a) : 0)
    const tabs0 = before.tabs[1]
    const head0 = before.head[1]
    const tabsDy = max(f.map((x) => Math.abs(x.tabs[1] - tabs0)))
    const headDy = max(f.map((x) => Math.abs(x.head[1] - head0)))
    const mine = (x) => x.vis.find((v) => v.id === to)
    const firstI = f.findIndex((x) => mine(x))
    const contentI = f.findIndex((x) => mine(x) && (mine(x).kind === "kept" || mine(x).kind === "routed"))
    /* The section's top against the row of tabs' foot (what stays put on screen): its first and every later frame. */
    const tops = f.filter(mine).map((x) => Math.round(mine(x).r[1] + 0 - (x.tabs[1] + x.tabs[3])))
    const topDy = tops.length ? max(tops.map((t) => Math.abs(t - tops[0]))) : 0
    const sts = f.map((x) => Math.round(x.st))
    const st0 = Math.round(before.st)
    const stEnd = sts.length ? sts[sts.length - 1] : st0
    /* A jump: the scroll changing after the frame the section first appeared on. */
    const stAfter = firstI >= 0 ? sts.slice(firstI) : sts
    const scrollJump = stAfter.length ? max(stAfter.map((s) => Math.abs(s - stAfter[0]))) : 0
    const maxScroll = f.map((x) => x.sh - x.ch)
    const collapse = Math.max(0, Math.min(before.sh - before.ch, maxScroll.length ? maxScroll[maxScroll.length - 1] : 0) - Math.min(...maxScroll, Infinity))
    const cws = [...new Set(f.map((x) => x.cw))]
    const blank = f.filter((x) => x.vis.length === 0 || x.vis.every((v) => v.r[3] < 40)).length
    /* The swap: the last frame as a frame, the first frame as content. */
    let swap = null
    if (contentI > 0) {
      const a = mine(f[contentI - 1])
      const b = mine(f[contentI])
      if (a && (a.kind === "frame" || a.kind === "fallback")) {
        const dy = []
        for (let i = 0; i < Math.min(a.cards.length, b.cards.length); i++) if (a.cards[i][1] < f[contentI].ch + 200) dy.push(Math.abs(a.cards[i][1] - b.cards[i][1]) + Math.abs(a.cards[i][3] - b.cards[i][3]) * (i === 0 ? 1 : 0))
        swap = { firstDy: a.cards[0] && b.cards[0] ? Math.round(b.cards[0][1] - a.cards[0][1]) : null, firstDh: a.cards[0] && b.cards[0] ? Math.round(b.cards[0][3] - a.cards[0][3]) : null, cardsDy: max(dy), dh: Math.round(b.r[3] - a.r[3]), n: [a.cards.length, b.cards.length] }
      }
    }
    /* After the content is in: anything that moved (cards' tops), on the frames that followed. */
    let after = 0
    let afterWhat = ""
    if (contentI >= 0) {
      const c0 = mine(f[contentI]).cards
      for (const x of f.slice(contentI + 1)) {
        const v = mine(x)
        if (!v) continue
        const scrollD = Math.round(x.st) - Math.round(f[contentI].st)
        for (let i = 0; i < Math.min(c0.length, v.cards.length); i++) {
          const d = Math.abs(v.cards[i][1] + scrollD - c0[i][1]) + Math.abs(v.cards[i][3] - c0[i][3])
          if (d > after) {
            after = Math.round(d)
            afterWhat = `card ${i} ${c0[i][1]}/${c0[i][3]} -> ${v.cards[i][1]}/${v.cards[i][3]}`
          }
        }
      }
    }
    const footB = !!before.foot
    const footA = f.length ? !!f[f.length - 1].foot : footB
    const pillXs = f.map((x) => (x.pill ? x.pill[0] : x.litR ? x.litR[0] : null))
    const litFrom = before.pill ? before.pill[0] : before.litR?.[0]
    const litTo = pillXs.length ? pillXs[pillXs.length - 1] : null
    const between = pillXs.filter((x) => x !== null && litFrom !== undefined && litTo !== null && Math.abs(x - litFrom) > 1 && Math.abs(x - litTo) > 1).length
    const minOp = Math.min(...f.map((x) => (mine(x) ? mine(x).op : 1)), 1)
    const cls = rec.shifts.reduce((s, e) => s + e.v, 0)
    const ms = (i) => (i >= 0 ? Math.round(f[i].now - clickAt) : null)
    return {
      sw: `${from}>${to}`,
      firstF: firstI >= 0 ? firstI + 1 : null,
      firstMs: ms(firstI),
      contentF: contentI >= 0 ? contentI + 1 : null,
      contentMs: ms(contentI),
      tabsDy: Math.round(tabsDy),
      headDy: Math.round(headDy),
      topDy,
      st: `${st0}>${stEnd}`,
      scrollJump,
      collapse: Math.round(collapse),
      gutter: cws.length > 1 ? cws.join("/") : "",
      blank,
      swap,
      after,
      afterWhat,
      foot: footB === footA ? "" : footA ? "up" : "down",
      pill: between,
      minOp: Math.round(minOp * 100) / 100,
      cls: Math.round(cls * 10000) / 10000,
      shiftSrc: rec.shifts.flatMap((e) => e.src.map((s) => `${s.tag}${s.dy ? ` dy${s.dy}` : ""}${s.dh ? ` dh${s.dh}` : ""}`)).slice(0, 4),
      imgs: max(f.map((x) => (mine(x) ? mine(x).imgs : 0))),
      fonts: f.some((x) => x.fonts !== "loaded"),
      long: max(rec.long.map((t) => t.ms)),
      frames: f.length,
    }
  }

  const row = (m) =>
    `  ${m.sw.padEnd(22)} ${String(m.firstF ?? "-").padStart(2)}f ${String(m.firstMs ?? "-").padStart(4)}ms  content ${String(m.contentF ?? "-").padStart(2)}f ${String(m.contentMs ?? "-").padStart(4)}ms  tabs ${m.tabsDy} head ${m.headDy} top ${m.topDy}  scroll ${m.st} jump ${m.scrollJump} collapse ${m.collapse}${m.gutter ? ` GUTTER ${m.gutter}` : ""}  blank ${m.blank}  swap ${m.swap ? `${m.swap.firstDy}/${m.swap.firstDh} cards ${m.swap.cardsDy} h ${m.swap.dh}` : "-"}  after ${m.after}${m.foot ? `  foot ${m.foot}` : ""}  pill ${m.pill}  op ${m.minOp}  cls ${m.cls}${m.imgs ? `  imgs ${m.imgs}` : ""}${m.long ? `  long ${m.long}` : ""}${m.shiftSrc.length ? `  [${m.shiftSrc.join(", ")}]` : ""}${m.afterWhat ? `  {${m.afterWhat}}` : ""}`

  for (const w of sizes) {
    const vp = ALL[w]
    const phone = w === "390"
    for (const cpu of cpus) {
      const { p, cdp, errors } = await open(vp, cpu)
      const tabs = await p.evaluate(() => [...document.querySelectorAll("[data-tab]")].map((t) => t.getAttribute("data-tab")))
      const dir = join(film, `${w}-${cpu}x`)
      rmSync(dir, { recursive: true, force: true })
      mkdirSync(dir, { recursive: true })
      const shots = []
      cdp.on("Page.screencastFrame", async (e) => {
        shots.push({ t: e.metadata.timestamp * 1000, data: e.data })
        cdp.send("Page.screencastFrameAck", { sessionId: e.sessionId }).catch(() => {})
      })
      await cdp.send("Page.startScreencast", { format: "jpeg", quality: 55, maxWidth: phone ? 390 : 720, maxHeight: phone ? 844 : 450, everyNthFrame: 1 })
      console.log(`\n${w}x${vp.height} at ${cpu}x CPU${COLD ? ", cold" : ""}`)
      const switches = []
      const run = async (pass, list, prep) => {
        console.log(` ${pass}`)
        for (let i = 1; i < list.length; i++) {
          if (prep) await prep()
          const rec = await press(p, list[i], phone)
          const m = measure(list[i - 1], list[i], rec)
          m.pass = pass
          switches.push({ m, wall: rec.wall })
          console.log(row(m))
          if (process.env.FRAMES && m.sw.includes(process.env.FRAMES)) for (const x of rec.frames) console.log(`      ${Math.round(x.now - rec.clickAt)}ms lit ${x.lit} pill ${JSON.stringify(x.pill || x.litR)} st ${x.st} ${x.vis.map((v) => `${v.id}:${v.kind} top ${v.r[1]} h ${v.r[3]} op ${Math.round(v.op * 100) / 100} ${v.tf} cards ${JSON.stringify(v.cards.map((c) => [c[1], c[3]]))}`).join(" | ")}`)
          results.push({ size: w, cpu, cold: COLD, ...m })
        }
      }
      await run("first", tabs)
      await run("back", [...tabs].reverse())
      await run("scrolled", tabs, () =>
        p.evaluate(async () => {
          const pane = document.querySelector("[data-community-shell]")
          pane.scrollTop = 600
          await new Promise((r) => setTimeout(r, 120))
        }),
      )
      await cdp.send("Page.stopScreencast")
      /* The film: every frame kept, and a contact sheet per switch of its first frames after the press. */
      for (const [k, s] of switches.entries()) {
        const mine = shots.filter((x) => x.t >= s.wall - 40 && x.t <= s.wall + WINDOW)
        const names = []
        for (const [j, x] of mine.slice(0, 12).entries()) {
          const name = join(dir, `${String(k).padStart(2, "0")}-${s.m.pass}-${s.m.sw.replace(">", "-")}-${String(j).padStart(2, "0")}-${Math.round(x.t - s.wall)}ms.jpg`)
          writeFileSync(name, Buffer.from(x.data, "base64"))
          names.push(name)
        }
        if (names.length && process.env.SHEETS !== "0") {
          try {
            execFileSync("montage", [...names, "-tile", phone ? "6x" : "4x", "-geometry", phone ? "+2+2" : "+2+2", "-pointsize", "11", join(dir, `sheet-${String(k).padStart(2, "0")}-${s.m.pass}-${s.m.sw.replace(">", "-")}.jpg`)])
          } catch {}
        }
      }
      if (errors.length) console.log(`  page errors: ${JSON.stringify(errors)}`)
      await p.close()
    }
  }
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

/* The round's sums: the worst of each number over every switch. */
const worst = (k, f = (x) => x[k]) => Math.max(0, ...results.map((r) => Number(f(r)) || 0))
console.log("\nWORST OVER EVERY SWITCH")
console.log(`  tabs row moved ${worst("tabsDy")}px, bar ${worst("headDy")}px, section top ${worst("topDy")}px, scroll jump ${worst("scrollJump")}px, collapse ${worst("collapse")}px`)
console.log(`  swap: first card ${worst("", (r) => Math.abs(r.swap?.firstDy ?? 0))}px, its height ${worst("", (r) => Math.abs(r.swap?.firstDh ?? 0))}px, cards ${worst("", (r) => r.swap?.cardsDy ?? 0)}px; after the content: ${worst("after")}px`)
console.log(`  blank frames ${worst("blank")}, gutter changes ${results.filter((r) => r.gutter).length}, pill frames between ${worst("pill")} (switches with 0: ${results.filter((r) => r.pill === 0).length}/${results.length}), CLS ${worst("cls")}, longest task ${worst("long")}ms`)
console.log(`  content: worst ${worst("contentMs")}ms; first frame worst ${worst("firstMs")}ms`)
if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(results, null, 1))
console.log(`\nfilm: ${film}`)
