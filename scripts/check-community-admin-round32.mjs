/**
 * ===========================================================================
 *  ROUND 32, MEASURED: MOVING BETWEEN THE SECTIONS OF A COMMUNITY
 * ===========================================================================
 * The owner: "the navigation between Overview, Posts, Spaces, Learn,
 * Calendar, Members, Moderation, Analytics, Settings takes too much ... make
 * sure all navigation in between is smooth, clean, no lags". Headless
 * Chromium over the real shell, the real sections and the real top bar
 * (scripts/render-community-admin-round32.tsx), with a stand-in router that
 * answers like Next with this round's pages: a section's page after GATE ms
 * (its gate: who is asking, which community), its reads DATA ms after that,
 * streamed under the page's Suspense boundary; prefetches four at a time.
 * Every number is printed for round 31's bundle (its shell, its bar, pages
 * answered only once their reads are in) and this round's, side by side.
 *
 *   EARLY     a section pressed 150ms after the page is up, before anything
 *             was read ahead
 *   AHEAD     every section pressed in turn, 2.5s after the page is up
 *   AGAIN     sections already opened, pressed again
 *
 * Per press: ms from the click to the first frame with the section (its
 * frame or itself) on screen, and to the first frame with its content;
 * frames where the last section was still on screen after the press, frames
 * with nothing on screen, frames with the top bar showing, and how far the
 * first card's top and its head's bottom moved when the content took the
 * frame's place.
 *
 *   node scripts/check-community-admin-round32.mjs [GATE=300] [DATA=600]
 *   SHOTS_DIR=dir keeps pictures (.round32-admin-shots by default; delete it before committing)
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const nums = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number)
const GATE = nums[0] ?? 300
const DATA = nums[1] ?? 600
/* Round 31's shell and bar, from the commit before round 32, to measure against. */
const BEFORE = process.env.BEFORE_REF || "9cb7a421"
const stubs = join(root, ".community-admin32-probe")
const shots = process.env.SHOTS_DIR || join(root, ".round32-admin-shots")
const ORIGIN = "https://storelib.com"
const BASE = "/app/community/salajanywood"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const ONLY = (process.env.ONLY || "").split(",").filter(Boolean)
const want = (s, dflt = true) => (ONLY.length ? ONLY.includes(s) : dflt)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

mkdirSync(stubs, { recursive: true })
mkdirSync(shots, { recursive: true })
try {
  writeFileSync(
    join(stubs, "navigation.js"),
    `import { useMemo, useSyncExternalStore } from "react"
const q = new URLSearchParams(location.search)
const GATE = Number(q.get("gate") ?? ${GATE})
const DATA = Number(q.get("data") ?? ${DATA})
const OLD = q.get("v") === "old"
const listeners = new Set()
const pathOf = (h) => new URL(h, location.href).pathname
/* The page the document came with: its reads already streamed in. */
const loaded = Object.assign(Promise.resolve(), { status: "fulfilled", value: undefined })
let state = { pathname: location.pathname, search: location.search, routed: location.pathname + location.search, v: 0, data: loaded }
const set = (p) => { state = { ...state, ...p }; listeners.forEach((f) => f()) }
const log = (k, a) => (window.__router ||= []).push([k, a, Math.round(performance.now())])
const push0 = history.pushState.bind(history)
const replace0 = history.replaceState.bind(history)
/* A navigation another one replaces is dropped (Next's action queue): the address moved by the shell drops one underway. */
let seq = 0
history.pushState = (s, u, url) => { seq++; push0(s, u, url); set({ pathname: location.pathname, search: location.search }) }
history.replaceState = (s, u, url) => { seq++; replace0(s, u, url); set({ pathname: location.pathname, search: location.search }) }
window.addEventListener("popstate", () => set({ pathname: location.pathname, search: location.search }))
window.__probeRouter = { subscribe: (f) => (listeners.add(f), () => listeners.delete(f)), get: () => state }
/* A section's page from the "server": its page after GATE, its reads DATA after that. Prefetches four at a time. */
const entries = new Map()
const waiting = []
let inflight = 0
function request(path) {
  const e = { started: false }
  e.frame = new Promise((r) => (e.frameIn = r))
  e.data = new Promise((r) => (e.dataIn = r))
  e.go = () => {
    e.started = true
    setTimeout(() => { e.frameDone = true; e.frameIn() }, GATE)
    /* Marked fulfilled as a Flight chunk is: a section whose reads are in renders them on the spot, as React reads an RSC payload already streamed. */
    setTimeout(() => { e.dataDone = true; e.data.status = "fulfilled"; e.data.value = undefined; e.dataIn() }, GATE + DATA)
  }
  return e
}
function pump() {
  while (inflight < 4 && waiting.length) {
    const e = waiting.shift()
    inflight++
    e.go()
    e.data.then(() => { inflight--; pump() })
  }
}
function prefetch(h, front) {
  const p = pathOf(h)
  let e = entries.get(p)
  if (e) {
    if (front && !e.started) { waiting.splice(waiting.indexOf(e), 1); waiting.unshift(e) }
    return e
  }
  e = request(p)
  entries.set(p, e)
  front ? waiting.unshift(e) : waiting.push(e)
  pump()
  return e
}
function navigate(h, kind) {
  const p = pathOf(h)
  let e = entries.get(p)
  /* Not asked yet, or still in the queue: the navigation asks the server itself, at once. */
  if (!e || !e.started) { e = request(p); entries.set(p, e); e.go() }
  const mine = ++seq
  const landed = OLD ? e.data : e.frame
  landed.then(() => setTimeout(() => {
    if (seq !== mine) return log("dropped", h)
    if (kind === "push") push0(null, "", h)
    else replace0(null, "", h)
    seq++
    set({ pathname: location.pathname, search: location.search, routed: h, v: state.v + 1, data: e.data })
  }, 0))
}
const router = {
  push: (h) => { log("push", h); navigate(h, "push") },
  replace: (h) => { log("replace", h); navigate(h, "replace") },
  prefetch: (h) => { log("prefetch", h); prefetch(h, false) },
  refresh: () => {
    const h = location.pathname + location.search
    log("refresh", h)
    const e = request(pathOf(h))
    e.go()
    const mine = seq
    ;(OLD ? e.data : e.frame).then(() => setTimeout(() => { if (seq === mine) set({ routed: h, v: state.v + 1, data: e.data }) }, 0))
  },
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
  /* Round 31's shell and bar, as they were. */
  const old = {
    "components/community/creator/community-shell.tsx": join(stubs, "old-community-shell.tsx"),
    "components/app/navigation-loading-bar.tsx": join(stubs, "old-navigation-loading-bar.tsx"),
  }
  for (const [file, to] of Object.entries(old)) writeFileSync(to, execFileSync("git", ["show", `${BEFORE}:${file}`], { cwd: root, encoding: "utf8" }))
  const css = await appCss(root)
  const fonts = interFaces(root)
  const { build } = await import("esbuild")
  const bundle = async (variant) => {
    const swap = variant === "old"
    await build({
      entryPoints: [join(root, "scripts/render-community-admin-round32.tsx")],
      bundle: true,
      format: "iife",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      alias: { "@": ".", "next/navigation": "./.community-admin32-probe/navigation.js", "next/link": "./.community-admin32-probe/link.jsx", "next/image": "./.community-admin32-probe/image.jsx" },
      plugins: [
        {
          name: "stubs",
          setup(b) {
            b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") }))
            if (!swap) return
            b.onResolve({ filter: /community-shell$/ }, (a) => (a.importer.includes(".community-admin32-probe") ? undefined : { path: old["components/community/creator/community-shell.tsx"] }))
            b.onResolve({ filter: /navigation-loading-bar$/ }, () => ({ path: old["components/app/navigation-loading-bar.tsx"] }))
            /* The old files' own relative imports, from where they lived. */
            b.onResolve({ filter: /^\.\.?\// }, (a) => {
              if (a.importer === old["components/community/creator/community-shell.tsx"]) return b.resolve(a.path, { resolveDir: join(root, "components/community/creator"), kind: a.kind })
              if (a.importer === old["components/app/navigation-loading-bar.tsx"]) return b.resolve(a.path, { resolveDir: join(root, "components/app"), kind: a.kind })
              return undefined
            })
          },
        },
      ],
      banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
      loader: { ".css": "empty" },
      outfile: join(stubs, `admin-${variant}.js`),
      logLevel: "error",
      absWorkingDir: root,
      nodePaths: [join(root, "node_modules")],
    })
    const js = readFileSync(join(stubs, `admin-${variant}.js`), "utf8")
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  }
  const html = { old: await bundle("old"), new: await bundle("new") }

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], protocolTimeout: 240_000 })
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }

  async function open(variant, path, vp, settle = 600) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|Not allowed to load local resource/.test(m.text())) errors.push(m.text().slice(0, 300)) })
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        let body = {}
        if (url.includes("/words")) body = { words: ["spam"], action: "block" }
        else if (url.includes("/members?")) body = { rows: [], next: null, capped: false }
        return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html[variant] })
      if (url.startsWith("data:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    const sep = path.includes("?") ? "&" : "?"
    await p.goto(`${ORIGIN}${path}${sep}v=${variant}&gate=${GATE}&data=${DATA}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(settle)
    return { p, errors }
  }

  /* What one frame shows: which section screens are visible, the one with content, the waiting spinner, the bar, and the first card's box. */
  const FRAME_JS = `(() => {
    const vis = (el) => el && el.offsetHeight > 0 && getComputedStyle(el).visibility !== "hidden"
    const screens = [...document.querySelectorAll("[data-section-screen]")].filter(vis)
    const on = screens.map((el) => el.getAttribute("data-section-screen"))
    const content = screens.filter((el) => !el.matches("[data-section-framed]") && !el.querySelector("[data-section-frame]")).map((el) => el.getAttribute("data-section-screen"))
    const waiting = [...document.querySelectorAll("[data-section-waiting]")].filter(vis).map((el) => el.getAttribute("data-section-waiting"))
    const bar = [...document.querySelectorAll("[data-app-nav-progress]")].some((el) => Number(getComputedStyle(el).opacity) > 0.05)
    const s = screens[0]
    /* The first card with a head (a list's), else the first card: the composer above the posts is not a list. */
    const first = (sel) => (s ? [...s.querySelectorAll(sel)].find((el) => el.getClientRects().length > 0 && el.getBoundingClientRect().height > 0) : null)
    const headEl = first("[data-list-head], [data-frame-head]")
    const card = headEl ? headEl.closest("section, [data-frame-card]") : first(".rounded-2xl")
    const r = (el) => (el ? el.getBoundingClientRect() : null)
    return { on, content, waiting, bar, cardTop: card ? Math.round(r(card).top) : null, headBottom: headEl ? Math.round(r(headEl).bottom) : null, framed: !!(s && (s.matches("[data-section-framed]") || s.querySelector("[data-section-frame]"))) }
  })()`

  async function press(p, id) {
    await p.evaluate((id, FRAME_JS) => {
      window.__frames = []
      window.__clickAt = null
      const read = new Function(`return ${FRAME_JS}`)
      document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest(`[data-tab="${id}"]`)) window.__clickAt = performance.now() }, { capture: true, once: true })
      const tick = (now) => {
        window.__frames.push({ now, ...read() })
        if (window.__frames.length < 400) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, id, FRAME_JS)
    await p.click(`[data-tab="${id}"]`)
    await sleep(GATE + DATA + 900)
    return p.evaluate((id) => {
      const at = window.__clickAt
      const after = window.__frames.filter((f) => at !== null && f.now >= at)
      const seen = after.find((f) => f.on.includes(id) || f.waiting.length > 0)
      const shown = after.find((f) => f.on.includes(id))
      const filled = after.find((f) => f.content.includes(id) && f.on.length === 1 && f.on[0] === id && !f.framed)
      const until = filled ? after.indexOf(filled) : after.length
      const lag = after.slice(0, until).filter((f) => !f.on.includes(id) && f.waiting.length === 0).length
      const blank = after.filter((f) => f.on.length === 0 && f.waiting.length === 0).length
      const bar = after.filter((f) => f.bar).length
      /* The frame's last picture against the content's first. */
      const i = filled ? after.indexOf(filled) : -1
      const before = i > 0 ? after.slice(0, i).reverse().find((f) => f.on.includes(id) && f.framed) : null
      const shift = before && filled ? { top: filled.cardTop - before.cardTop, head: before.headBottom != null && filled.headBottom != null ? filled.headBottom - before.headBottom : null } : null
      const ms = (f) => (f ? Math.round(f.now - at) : null)
      return { something: ms(seen), section: ms(shown), content: ms(filled), lag, blank, bar, shift }
    }, id)
  }

  const fmt = (r) => `something ${r.something ?? "-"}ms, its frame ${r.section ?? "-"}ms, content ${r.content ?? "-"}ms; ${r.lag} frames still on the last section, ${r.blank} blank, ${r.bar} with the bar${r.shift ? `; frame to content: card top ${r.shift.top}px, head ${r.shift.head ?? "-"}px` : ""}`
  const results = {}
  const SECTIONS = ["feed", "spaces", "events", "members", "moderation", "analytics", "settings"]

  if (want("SWITCH")) {
  for (const [vpName, vp] of [["1440", DESK], ["390", PHONE]]) {
    for (const variant of ["old", "new"]) {
      const tag = `${vpName} ${variant === "old" ? "round 31" : "round 32"}`
      console.log(`\n${tag}  (page ${GATE}ms, reads ${DATA}ms more)`)
      /* EARLY: pressed 150ms after the page is up. */
      {
        const { p, errors } = await open(variant, BASE, vp, 150)
        const r = await press(p, "members")
        console.log(`  EARLY  members: ${fmt(r)}`)
        results[`${tag} early`] = r
        if (errors.length) console.log("  errors:", errors)
        await p.close()
      }
      /* AHEAD: every section, 2.5s after the page is up. */
      const { p, errors } = await open(variant, BASE, vp, 2500)
      const ahead = await p.evaluate(() => (window.__router || []).filter((c) => c[0] === "prefetch").map((c) => c[1].split("/").pop()))
      console.log(`  read ahead by 2.5s: ${ahead.join(", ")}`)
      for (const id of SECTIONS) {
        const r = await press(p, id)
        console.log(`  AHEAD  ${id}: ${fmt(r)}`)
        results[`${tag} ahead ${id}`] = r
        if (variant === "new" && vpName === "1440" && id === "members") await p.screenshot({ path: join(shots, "members-1440.png") })
      }
      for (const id of ["overview", "members", "settings"]) {
        const r = await press(p, id)
        console.log(`  AGAIN  ${id}: ${fmt(r)}`)
        results[`${tag} again ${id}`] = r
      }
      if (errors.length) console.log("  errors:", errors)
      results[`${tag} errors`] = errors
      await p.close()
    }
  }

  /* What round 32 promises, checked. */
  console.log("\nROUND 32")
  for (const vpName of ["1440", "390"]) {
    const tag = `${vpName} round 32`
    const early = results[`${tag} early`]
    expect(early.section !== null && early.section <= 50, `${vpName}: a section never opened shows its frame on the press, before anything is read`, early)
    expect(early.lag <= 1 && early.blank === 0 && early.bar === 0, `${vpName}: no frame keeps the last section, none is blank, no top bar`, { lag: early.lag, blank: early.blank, bar: early.bar })
    for (const id of SECTIONS) {
      const r = results[`${tag} ahead ${id}`]
      expect(r.content !== null && r.content <= 120 && r.blank === 0 && r.bar === 0, `${vpName}: ${id}, read ahead: in with its content within 120ms, no blank frame, no bar`, { content: r.content, blank: r.blank, bar: r.bar })
    }
    for (const id of ["overview", "members", "settings"]) {
      const r = results[`${tag} again ${id}`]
      expect(r.content !== null && r.content <= 50 && r.lag <= 1, `${vpName}: ${id} again: on screen by the next frame or two`, { content: r.content, lag: r.lag })
    }
    expect(results[`${tag} errors`].length === 0, `${vpName}: no page errors`, results[`${tag} errors`])
  }
  }

  /* A frame that becomes its section moves nothing that was there: the first card stays where it was. */
  if (want("SHIFT")) {
  console.log("\nFRAME TO CONTENT (pressed before the read ahead, every section)")
  for (const [vpName, vp] of [["1440", DESK], ["390", PHONE]]) {
    for (const id of SECTIONS) {
      const { p, errors } = await open("new", BASE, vp, 100)
      const r = await press(p, id)
      console.log(`  ${vpName} ${id}: ${fmt(r)}`)
      if (id === "members" || id === "analytics") {
        /* A picture of the frame itself, for the record. */
      }
      expect(r.shift === null || (Math.abs(r.shift.top) <= 1 && (r.shift.head === null || Math.abs(r.shift.head) <= 1)), `${vpName} ${id}: the first card and its head do not move when the content comes`, r.shift)
      if (errors.length) expect(false, `${vpName} ${id}: no page errors`, errors)
      await p.close()
    }
  }
  }

  /* FRAMESHOTS=1: each section's frame and then its content, as pictures, to compare by eye. */
  if (process.env.FRAMESHOTS || want("SHOTS", false)) {
    for (const [vpName, vp] of [["1440", DESK], ["390", PHONE]]) {
      for (const id of SECTIONS) {
        const { p } = await open("new", BASE, vp, 100)
        await p.click(`[data-tab="${id}"]`)
        const blocks = () =>
          p.evaluate(() => {
            const s = [...document.querySelectorAll("[data-section-screen]")].find((el) => el.offsetHeight > 0)
            const top = s ? s.getBoundingClientRect().top : 0
            const walk = (el, depth) => [...el.children].filter((c) => c.getBoundingClientRect().height > 0).slice(0, 4).map((c) => { const b = c.getBoundingClientRect(); return `${"  ".repeat(depth)}${c.tagName.toLowerCase()} y${Math.round(b.top - top)} h${Math.round(b.height)}` + (depth < 2 ? "\n" + walk(c, depth + 1).join("\n") : "") })
            return s ? walk(s, 0).join("\n") : "none"
          })
        await sleep(GATE / 2)
        await p.screenshot({ path: join(shots, `frame-${id}-${vpName}.png`) })
        const fb = await blocks()
        await sleep(GATE + DATA + 400)
        await p.screenshot({ path: join(shots, `content-${id}-${vpName}.png`) })
        console.log(`\n--- ${vpName} ${id} frame\n${fb}\n--- content\n${await blocks()}`)
        await p.close()
      }
    }
  }

  /* A save elsewhere draws a held section again: it keeps what it shows until the new reads are in, never its frame. */
  console.log("\nREFRESH")
  if (want("REFRESH")) {
    const { p, errors } = await open("new", `${BASE}/members`, DESK, 2500)
    await press(p, "overview")
    await press(p, "members")
    await p.evaluate((FRAME_JS) => {
      window.__frames = []
      const read = new Function(`return ${FRAME_JS}`)
      const tick = (now) => { window.__frames.push({ now, ...read() }); if (window.__frames.length < 200) requestAnimationFrame(tick) }
      requestAnimationFrame(tick)
      window.__probeRouterApi.refresh()
    }, FRAME_JS)
    await sleep(GATE + DATA + 600)
    const frames = await p.evaluate(() => window.__frames.map((f) => ({ framed: f.framed, on: f.on })))
    const framed = frames.filter((f) => f.framed).length
    const blank = frames.filter((f) => f.on.length === 0).length
    expect(framed === 0 && blank === 0, "a held section drawn again never shows its frame or nothing", { framed, blank, frames: frames.length })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  /* Width: the column is /app's widest list column, the bar, the tabs and the first card on one line. */
  if (want("WIDTH")) {
  console.log("\nWIDTH")
  for (const w of [1920, 1440, 1280, 1024, 390]) {
    const { p } = await open("new", BASE, w === 390 ? PHONE : { width: w, height: 900, deviceScaleFactor: 1 }, 400)
    const m = await p.evaluate(() => {
      const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width) } }
      const body = document.querySelector("[data-community-body]")
      const cs = getComputedStyle(body)
      const inner = { x: Math.round(body.getBoundingClientRect().left + parseFloat(cs.paddingLeft)), w: Math.round(body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) }
      const tabs = [...document.querySelectorAll("[data-tab]")]
      const lastTab = tabs[tabs.length - 1].getBoundingClientRect()
      const strip = document.querySelector("[data-section-tabs]")
      return { inner, logo: r("[data-community-back]"), firstTab: r("[data-tab]"), card: r('[data-section-screen="overview"] section'), view: r("[data-community-view]"), tabsFit: strip.scrollWidth <= strip.clientWidth + 1, fades: getComputedStyle(strip).maskImage !== "none" && getComputedStyle(strip).maskImage !== "", lastTabRight: Math.round(lastTab.right), h1: r("[data-community-title] h1") }
    })
    console.log(`  ${w}: content ${m.inner.w}px wide from x=${m.inner.x}; first tab x=${m.firstTab.x}, first card x=${m.card?.x}; name ${m.h1?.w}px; tabs fit: ${m.tabsFit}`)
    if (w >= 1024) {
      expect(m.inner.w >= Math.min(1259, w - 240 - 64), `${w}: the section column uses the width (${m.inner.w}px; was 1016px at most)`, m.inner)
      expect(m.tabsFit || (w < 1280 && m.fades), `${w}: every tab fits on one row (below 1280px a row that does not fit scrolls, its end fading, as on a phone)`, { fits: m.tabsFit, fades: m.fades })
      expect(Math.abs(m.firstTab.x - m.inner.x) <= 1 && Math.abs((m.card?.x ?? 0) - m.inner.x) <= 1, `${w}: the first tab and the first card start where the column starts`, { tab: m.firstTab.x, card: m.card?.x, column: m.inner.x })
    }
    await p.screenshot({ path: join(shots, `overview-${w}.png`) })
    await p.close()
  }
  }

  await browser.close()
  console.log(`\n${broken ? `${broken} FAILED` : "all ok"}`)
  process.exitCode = broken ? 1 : 0
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
