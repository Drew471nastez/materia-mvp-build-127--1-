/**
 * ===========================================================================
 *  ROUND 16: A POST OPENED AND CLOSED INSIDE THE REAL SHELL, FRAME BY FRAME
 * ===========================================================================
 * The owner: "it glitches and flashes things in the community feed. It also
 * happens on the profile page." ARCH16 finding B: the opened post's address
 * (/community/<slug>/post/<id>) is not a place, and the place host decides
 * what it shows from whether the address is one. This runs the REAL overlay
 * inside the REAL host (scripts/render-communities-post16.tsx) on a phone
 * (390x844, the CPU slowed four times) and, for a post opened and closed by
 * the back button, by a pull, and by the browser's back, from the feed, a
 * space, Saved and a person's profile, counts on every animation frame:
 *
 *   HIDDEN    the screen that held the place is not displayed
 *   SWAPPED   another slot (the routed one, another kept screen) is shown
 *   FADED     something inside the place animates (an arrival, a fade)
 *   CHANGED   the place's DOM changed (a card or a picture put in or taken
 *             out, a picture's address changed)
 *   DECODED   a picture inside the place loaded again
 *   REMOUNTED a card that was there when the post opened is no longer the
 *             same element
 *   RELOADED  the page itself was loaded again (a post opened by address)
 *
 * Zero is the only passing number for every one of them. PART=b runs only
 * this; PART=sheet only the motion (frame sequences of the open and the
 * close written to SHOTS_DIR as contact sheets, and per frame numbers);
 * PART=compose the composer; PART=keyboard the comment box on the keyboard.
 *
 *   PROBE_CSS=source LABEL=after node scripts/check-communities-post16.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const LABEL = process.env.LABEL || "run"
const THROTTLE = Number(process.env.THROTTLE || 4)
const PART = process.env.PART || "all"
const ORIGIN = "https://storelib.com"
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-post16-")), "shots")
mkdirSync(shots, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const stubs = join(root, ".post16-probe")
mkdirSync(stubs, { recursive: true })

async function bundle() {
  /* Next's router follows history.pushState (app router since 14.1) in a transition; the stub does the same, and Back too. */
  writeFileSync(
    join(stubs, "navigation.js"),
    `import { startTransition, useEffect, useState } from "react"
const log = (k, a) => (window.__router ||= []).push([k, a])
/* A router move draws the route's page again (the harness listens for probe:route), as Next's soft navigation does. */
const move = (kind, h) => { log(kind, h); history[kind === "push" ? "pushState" : "replaceState"](history.state, "", h); window.dispatchEvent(new Event("probe:route")) }
const router = { push: (h) => move("push", h), replace: (h) => move("replace", h), prefetch: (h) => log("prefetch", h), back: () => history.back(), refresh: () => log("refresh") }
if (!window.__pushPatched) {
  window.__pushPatched = true
  const push = history.pushState.bind(history)
  const replace = history.replaceState.bind(history)
  history.pushState = (s, u, url) => { push(s, u, url); queueMicrotask(() => window.dispatchEvent(new Event("probe:path"))) }
  history.replaceState = (s, u, url) => { replace(s, u, url); queueMicrotask(() => window.dispatchEvent(new Event("probe:path"))) }
}
const useLocation = (read) => {
  const [v, setV] = useState(read)
  useEffect(() => {
    const on = () => startTransition(() => setV(read()))
    window.addEventListener("probe:path", on)
    window.addEventListener("popstate", on)
    on()
    return () => { window.removeEventListener("probe:path", on); window.removeEventListener("popstate", on) }
  }, [])
  return v
}
export const usePathname = () => useLocation(() => location.pathname)
export const useSearchParams = () => new URLSearchParams(useLocation(() => location.search))
export const useRouter = () => router
export const redirect = () => {}
export const notFound = () => {}
`,
  )
  writeFileSync(
    join(stubs, "link.jsx"),
    `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]); location.assign(href) } } }, children) })
`,
  )
  writeFileSync(
    join(stubs, "image.jsx"),
    `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined }) }
`,
  )
  writeFileSync(
    join(stubs, "dynamic.jsx"),
    `import React from "react"
export default function dynamic(load) { const Lazy = React.lazy(() => load().then((m) => ({ default: m && m.default ? m.default : m }))); return function Dynamic(props) { return React.createElement(Lazy, props) } }
`,
  )
  writeFileSync(
    join(stubs, "supabase-client.js"),
    `export function createClient() {
  return {
    channel() { const ch = { on() { return ch }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 30); return ch }, track: async () => "ok", presenceState: () => ({}), send: async () => "ok" }; return ch },
    removeChannel() {},
    realtime: { setAuth: async () => {} },
    auth: { getSession: async () => ({ data: { session: { user: { id: "u-me" } } } }), signOut: async () => ({ error: null }) },
  }
}
export const isNativePlatform = () => false
`,
  )
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-communities-post16.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.post16-probe/navigation.js", "next/link": "./.post16-probe/link.jsx", "next/image": "./.post16-probe/image.jsx", "next/dynamic": "./.post16-probe/dynamic.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  return readFileSync(join(stubs, "app.js"), "utf8")
}

/* ── In the page: what the place under the post is doing, every frame ── */
const WATCH = () => {
  const host = document.querySelector("[data-place-host]")
  const slots = () => Array.from(host.querySelectorAll(":scope > [data-place-routed], :scope > [data-place-screen]"))
  const shown = (el) => el.getClientRects().length > 0
  const visible = slots().filter(shown)
  const start = visible[0] ?? null
  const label = (el) => (el ? (el.hasAttribute("data-place-routed") ? `routed:${el.querySelector("[data-place-seed]")?.getAttribute("data-place-seed") ?? "page"}` : `kept:${el.getAttribute("data-place-screen")}`) : "none")
  const cards = new Set(start ? Array.from(start.querySelectorAll("article[data-post], [data-profile-post]")) : [])
  const imgs = new Set(start ? Array.from(start.querySelectorAll("img")) : [])
  const w = (window.__watch = { start: label(start), frames: [], mut: 0, loads: 0, on: true, alive: Math.random() })
  window.__alive = w.alive
  const mo = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "childList" && [...m.addedNodes, ...m.removedNodes].some((n) => n.nodeType === 1)) w.mut++
      else if (m.type === "attributes" && m.target.tagName === "IMG") w.mut++
    }
  })
  if (start) mo.observe(start, { subtree: true, childList: true, attributes: true, attributeFilter: ["src", "srcset"] })
  const onLoad = (e) => {
    if (e.target?.tagName === "IMG" && start?.contains(e.target)) w.loads++
  }
  document.addEventListener("load", onLoad, true)
  let lastMut = 0
  let lastLoads = 0
  const tick = () => {
    if (!w.on) {
      mo.disconnect()
      document.removeEventListener("load", onLoad, true)
      return
    }
    const now = slots().filter(shown)
    /* A press's own tint (a CSS transition of a colour) is the member's finger, not the place moving. */
    const moving = start ? document.getAnimations().filter((a) => a.playState === "running" && a.effect?.target && start.contains(a.effect.target) && !(a.transitionProperty && /color$/.test(a.transitionProperty))) : []
    const anims = moving.length
    for (const a of moving) (w.kinds ||= {})[`${a.constructor.name}:${a.transitionProperty || a.animationName || (a.effect.getKeyframes?.()[0] ? Object.keys(a.effect.getKeyframes()[0]).filter((k) => !["offset", "easing", "composite", "computedOffset"].includes(k)).join("+") : "")}:${a.effect.target.tagName}`] = 1
    let gone = 0
    for (const c of cards) if (!c.isConnected || !start.contains(c)) gone++
    let imgGone = 0
    for (const i of imgs) if (!i.isConnected) imgGone++
    w.frames.push({
      t: Math.round(performance.now()),
      hidden: !!start && !shown(start),
      swapped: now.length !== 1 || now[0] !== start,
      shown: now.map(label).join(","),
      faded: anims,
      changed: w.mut - lastMut,
      decoded: w.loads - lastLoads,
      remounted: gone + imgGone,
      sheet: !!document.querySelector("[data-post-fullscreen]"),
      url: location.pathname + location.search,
    })
    lastMut = w.mut
    lastLoads = w.loads
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

let html = ""
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })

async function session({ app = false, width = 390, height = 844, path = "/community/clay-studio" } = {}) {
  const p = await browser.newPage()
  await p.setViewport({ width, height, isMobile: width < 640, hasTouch: width < 640, deviceScaleFactor: 1 })
  const errors = []
  let loads = 0
  p.on("pageerror", (e) => errors.push(String(e.stack || e).slice(0, 400)))
  /* A real page load (a history push within the page is not one). */
  p.on("domcontentloaded", () => loads++)
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const url = r.url()
    if (url.startsWith(`${ORIGIN}/api/`)) return void r.respond({ status: 200, contentType: "application/json", body: "{}" })
    if (url.startsWith(`${ORIGIN}/`)) return void r.respond({ status: 200, contentType: "text/html", body: html })
    if (url.startsWith("data:")) return void r.continue()
    return void r.respond({ status: 204, body: "" })
  })
  if (app) {
    await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Capacitor StorelibWindows/1")
    await p.evaluateOnNewDocument(() => document.addEventListener("DOMContentLoaded", () => document.documentElement.classList.add("capacitor")))
  }
  await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
  await p.evaluate(() => document.fonts.ready)
  await sleep(1200)
  const cdp = await p.target().createCDPSession()
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 4, radiusY: 4, force: 1 }] })
  const tap = async (x, y) => {
    await touch("touchStart", x, y)
    await sleep(40)
    await touch("touchEnd", x, y)
  }
  return { p, cdp, errors, touch, tap, loads: () => loads }
}

/* A link the shell catches (shell-frame.tsx: a place in this community is navigator.go), pressed: how a member moves between places. */
async function goPlace(s, href) {
  await s.p.evaluate((h) => {
    const a = document.createElement("a")
    a.href = h
    a.textContent = "go"
    a.setAttribute("data-probe-go", "")
    document.querySelector("[data-community-shell]").appendChild(a)
    a.click()
    a.remove()
  }, href)
  await sleep(1400)
}

async function centerOf(s, sel) {
  return s.p.evaluate((q) => {
    const el = document.querySelector(q)
    if (!el) return null
    el.scrollIntoView({ block: "center" })
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left + Math.min(60, r.width / 2)), y: Math.round(r.top + r.height / 2) }
  }, sel)
}

/* ── FINDING B ── */
async function partB() {
  console.log("\nFINDING B: the place under an opened post, frame by frame")
  const s = await session()
  const results = {}
  const closeBy = {
    back: async () => {
      const b = await s.p.evaluate(() => {
        const el = document.querySelector("[data-post-fullscreen] [data-post-overlay-close]")
        const r = el?.getBoundingClientRect()
        return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null
      })
      if (b) await s.tap(b.x, b.y)
    },
    pull: async () => {
      await s.touch("touchStart", 200, 300)
      for (let i = 1; i <= 14; i++) {
        await s.touch("touchMove", 200, 300 + i * 24)
        await sleep(16)
      }
      await s.touch("touchEnd", 200, 300 + 14 * 24)
    },
    history: async () => {
      await s.p.evaluate(() => history.back())
    },
  }
  async function run(name, openSel, how) {
    await sleep(300)
    const at = await centerOf(s, openSel)
    if (!at) {
      expect(false, `${name}: the thing to open is on screen (${openSel})`)
      return
    }
    await sleep(300)
    const before = await s.p.evaluate(() => location.pathname + location.search)
    const loadsBefore = s.loads()
    await s.p.evaluate(WATCH)
    await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
    await s.tap(at.x, at.y)
    await sleep(1500)
    const opened = await s.p.evaluate(() => ({ sheet: !!document.querySelector("[data-post-fullscreen]"), url: location.pathname }))
    await closeBy[how]()
    await sleep(1800)
    await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    const reloaded = s.loads() !== loadsBefore || (await s.p.evaluate(() => !window.__watch))
    const w = reloaded ? null : await s.p.evaluate(() => ((window.__watch.on = false), window.__watch))
    const f = w?.frames ?? []
    const count = (k) => f.filter((x) => (typeof x[k] === "number" ? x[k] > 0 : x[k])).length
    const after = await s.p.evaluate(() => location.pathname + location.search)
    const r = {
      frames: f.length,
      hidden: count("hidden"),
      swapped: count("swapped"),
      faded: count("faded"),
      changed: count("changed"),
      decoded: count("decoded"),
      remounted: f.length ? f.at(-1).remounted : 0,
      reloaded: reloaded ? 1 : 0,
      opened: opened.sheet,
      backTo: after === before,
    }
    results[name] = r
    const flashes = r.hidden + r.swapped + r.faded + r.changed + r.decoded + r.remounted + r.reloaded
    const shownSet = [...new Set(f.map((x) => x.shown))]
    expect(r.opened && flashes === 0 && r.backTo, `${name}: opened over the place, nothing under it hidden, swapped, faded, changed, decoded, remounted or reloaded, and back at ${before}`, { ...r, start: w?.start, shown: shownSet.slice(0, 4), url: after, kinds: w?.kinds })
  }
  /* The feed (All): the post with a picture. */
  const pic = 'article[data-post="a0000000-0000-4000-8000-000000000002"] [data-post-excerpt]'
  await run("feed/back", pic, "back")
  await run("feed/pull", pic, "pull")
  await run("feed/browser-back", pic, "history")
  /* A space, by its pill. */
  await goPlace(s, "/community/clay-studio/space/critique")
  const crit = 'article[data-post="a0000000-0000-4000-8000-000000000004"] [data-post-excerpt]'
  await run("space/back", crit, "back")
  await run("space/browser-back", crit, "history")
  /* Saved. */
  await goPlace(s, "/community/clay-studio/saved")
  await run("saved/back", pic, "back")
  await run("saved/pull", pic, "pull")
  /* A person's profile: a post of theirs, from its row. */
  await goPlace(s, "/community/clay-studio?profile=mara")
  const row = '[data-profile-post="a0000000-0000-4000-8000-000000000002"] a'
  await run("profile/back", row, "back")
  await run("profile/browser-back", row, "history")
  expect(!s.errors.length, "no page errors", s.errors.slice(0, 3))
  await s.p.close()

  /*
    OPENED BY ITS LINK (a shared link, a notification, a search result): the post route's page is in the router's slot, the
    post over a feed. Closing it must leave that feed exactly as it is. POSTPAGE=feed draws the page as the base commit did.
  */
  {
    const l = await session({ path: `/community/clay-studio/post/a0000000-0000-4000-8000-000000000002?postpage=${process.env.POSTPAGE || "seed"}` })
    await sleep(600)
    const before = "/community/clay-studio"
    const loadsBefore = l.loads()
    await l.p.evaluate(WATCH)
    await l.cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
    const b = await l.p.evaluate(() => {
      const el = document.querySelector("[data-post-fullscreen] [data-post-overlay-close]")
      const r = el?.getBoundingClientRect()
      return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null
    })
    if (b) await l.tap(b.x, b.y)
    await sleep(1800)
    await l.cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    const w = await l.p.evaluate(() => ((window.__watch.on = false), window.__watch))
    const f = w.frames
    const count = (k) => f.filter((x) => (typeof x[k] === "number" ? x[k] > 0 : x[k])).length
    const after = await l.p.evaluate(() => location.pathname + location.search)
    const r = { frames: f.length, hidden: count("hidden"), swapped: count("swapped"), faded: count("faded"), changed: count("changed"), decoded: count("decoded"), remounted: f.length ? f.at(-1).remounted : 0, reloaded: l.loads() !== loadsBefore ? 1 : 0, opened: !!b, backTo: after === before }
    results["link/back"] = r
    const flashes = r.hidden + r.swapped + r.faded + r.changed + r.decoded + r.remounted + r.reloaded
    expect(r.opened && flashes === 0 && r.backTo, `link/back: a post opened by its link closes onto the feed already under it, nothing hidden, swapped, changed or remounted, at ${before}`, { ...r, start: w.start, shown: [...new Set(f.map((x) => x.shown))].slice(0, 4), url: after, kinds: w.kinds })
    expect(!l.errors.length, "no page errors (link)", l.errors.slice(0, 3))
    await l.p.close()
  }
  console.log(JSON.stringify({ label: LABEL, part: "b", results }))
  return results
}

try {
  html = await (async () => {
    const [css, js] = await Promise.all([appCss(root), bundle()])
    const fonts = interFaces(root)
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Clay Studio</title><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  })()
  if (PART === "debug") { const s = await session(); console.log(s.errors.map((e) => e.split("\n").slice(0, 4).join(" / ")), await s.p.evaluate(() => document.body.innerHTML.slice(0, 600))); await s.p.screenshot({ path: join(shots, "debug.png") }) }
  if (PART === "all" || PART === "b") await partB()
} finally {
  rmSync(stubs, { recursive: true, force: true })
  await browser.close()
}
console.log(`\n  sheets in ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
