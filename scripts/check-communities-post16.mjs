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


/* ── THE SHEET: frame sequences of the open and the close, and their numbers ── */
const SAMPLE = () => {
  window.__s = []
  window.__srun = true
  const num = (v, i = 0) => {
    if (!v || v === "none") return i === 0 ? 1 : 0
    return parseFloat(String(v).split(" ")[i] ?? "0") || 0
  }
  const tick = (t) => {
    const layer = document.querySelector("[data-post-fullscreen]")
    const page = layer?.querySelector("[role=dialog]")
    const shell = document.querySelector("[data-community-shell]")
    const cs = shell ? getComputedStyle(shell) : null
    const dim = layer?.querySelector("[data-sheet-dim]")
    const posts = document.querySelectorAll("[data-post-fullscreen] [data-post-overlay-post] article").length
    const pr = page?.getBoundingClientRect()
    const tab = document.querySelector("[data-buyer-tab-bar]")
    window.__s.push({
      t: Math.round(t),
      layer: !!layer && getComputedStyle(layer).visibility !== "hidden",
      top: pr ? Math.round(pr.top) : null,
      scale: cs ? Math.round(num(cs.scale) * 1000) / 1000 : 1,
      shiftY: cs ? Math.round(num(cs.translate, 1)) : 0,
      dim: dim ? Math.round(Number(getComputedStyle(dim).opacity) * 100) / 100 : 0,
      posts,
      scrollY: Math.round(scrollY),
      tab: !!tab && tab.getBoundingClientRect().top < innerHeight,
      anims: document.getAnimations().filter((a) => a.playState === "running").length,
    })
    if (window.__srun) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

async function record(s, name, act, ms) {
  const frames = []
  const onFrame = (f) => {
    frames.push({ data: f.data, ts: f.metadata.timestamp })
    void s.cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  }
  s.cdp.on("Page.screencastFrame", onFrame)
  await s.cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, maxWidth: 390, maxHeight: 844, everyNthFrame: 1 })
  await s.p.evaluate(SAMPLE)
  await sleep(80)
  await act()
  await sleep(ms)
  const samples = await s.p.evaluate(() => ((window.__srun = false), window.__s))
  await s.cdp.send("Page.stopScreencast")
  s.cdp.off("Page.screencastFrame", onFrame)
  return { name, frames, samples }
}

let reader = null
async function sheetPng(seq, file, max = 30) {
  reader ??= await browser.newPage()
  /* FRAMES=1: every painted frame of the sequence too, to look at one by one. */
  if (process.env.FRAMES === "1") {
    const dir = join(shots, file.replace(/\.png$/, ""))
    mkdirSync(dir, { recursive: true })
    seq.frames.forEach((f, i) => writeFileSync(join(dir, `${String(i).padStart(3, "0")}.jpg`), Buffer.from(f.data, "base64")))
  }
  const pick = seq.frames.length <= max ? seq.frames : Array.from({ length: max }, (_, i) => seq.frames[Math.round((i * (seq.frames.length - 1)) / (max - 1))])
  const png = await reader.evaluate(async (list) => {
    const W = 130
    const H = Math.round((844 / 390) * W)
    const cols = 6
    const rows = Math.ceil(list.length / cols)
    const c = new OffscreenCanvas(cols * (W + 4), rows * (H + 4))
    const g = c.getContext("2d")
    g.fillStyle = "#444"
    g.fillRect(0, 0, c.width, c.height)
    for (let i = 0; i < list.length; i++) {
      const img = new Image()
      img.src = `data:image/jpeg;base64,${list[i]}`
      await img.decode()
      g.drawImage(img, (i % cols) * (W + 4), Math.floor(i / cols) * (H + 4), W, H)
      g.fillStyle = "#e11"
      g.font = "11px sans-serif"
      g.fillText(String(i), (i % cols) * (W + 4) + 3, Math.floor(i / cols) * (H + 4) + 12)
    }
    const blob = await c.convertToBlob({ type: "image/png" })
    const buf = new Uint8Array(await blob.arrayBuffer())
    let out = ""
    for (let i = 0; i < buf.length; i += 0x8000) out += String.fromCharCode(...buf.subarray(i, i + 0x8000))
    return btoa(out)
  }, pick.map((f) => f.data))
  writeFileSync(join(shots, file), Buffer.from(png, "base64"))
}

function judgeSheet(seq, feedY, closing) {
  const s = seq.samples
  const seen = s.filter((f) => f.layer)
  const twice = s.filter((f) => f.posts > 1)
  const moved = s.filter((f) => f.scrollY !== feedY)
  const noTab = s.filter((f) => !f.tab)
  let longest = 0
  for (let i = 1; i < s.length; i++) longest = Math.max(longest, s[i].t - s[i - 1].t)
  const tops = seen.map((f) => f.top)
  const scales = seen.map((f) => f.scale)
  console.log(`  ${seq.name}: ${seq.frames.length} painted frames, ${s.length} sampled, longest frame ${longest}ms`)
  console.log(`    sheet top ${tops.filter((_, i) => i % 3 === 0).join(" ")}`)
  console.log(`    community scale ${scales.filter((_, i) => i % 3 === 0).join(" ")}`)
  expect(twice.length === 0, `${seq.name}: ONE COPY: never two copies of the post on screen`, twice.length)
  expect(moved.length === 0, `${seq.name}: FEED: the feed's scroll never moves (${feedY})`, moved.slice(0, 3).map((f) => f.scrollY))
  expect(noTab.length === 0, `${seq.name}: TAB BAR on screen on every frame`, noTab.length)
  const inStep = seen.filter((f) => f.top !== null && f.scale < 0.999).every((f) => Math.abs((1 - f.top / 844) - (1 - f.scale) / 0.06) < 0.12)
  expect(inStep, `${seq.name}: the community's scale and the sheet move together (one p)`, seen.slice(0, 6).map((f) => [f.top, f.scale]))
  if (closing) {
    const goneAt = s.findIndex((f, i) => i > 0 && !f.layer && s.slice(i).every((g) => !g.layer))
    const after = s.slice(goneAt)
    expect(goneAt > 0 && after.every((f) => f.scale === 1 && f.shiftY === 0), `${seq.name}: once the sheet has gone the community is at its own size, untouched`, { goneAt, last: s.at(-1) })
  } else {
    const last = s.at(-1)
    expect(last.layer && last.top <= 1 && last.scale === 1, `${seq.name}: arrived covering the screen, and the community let go of under it`, last)
  }
  return { painted: seq.frames.length, sampled: s.length, longestFrameMs: longest, twice: twice.length, feedMoved: moved.length, tabHidden: noTab.length }
}

async function partSheet() {
  console.log("\nTHE SHEET: open and close at 390x844, 4x CPU")
  const out = {}
  const s = await session()
  const pic = 'article[data-post="a0000000-0000-4000-8000-000000000002"] [data-post-excerpt]'
  const at = await centerOf(s, pic)
  await sleep(400)
  const feedY = await s.p.evaluate(() => Math.round(scrollY))
  await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
  const open = await record(s, "open", () => s.tap(at.x, at.y), 1300)
  const backAt = await s.p.evaluate(() => {
    const r = document.querySelector("[data-post-fullscreen] [data-post-overlay-close]").getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })
  const close = await record(s, "close-back", () => s.tap(backAt.x, backAt.y), 1400)
  await sleep(300)
  await record(s, "open-2", () => s.tap(at.x, at.y), 1300)
  const pull = await record(
    s,
    "close-pull",
    async () => {
      await s.touch("touchStart", 200, 300)
      for (let i = 1; i <= 14; i++) {
        await s.touch("touchMove", 200, 300 + i * 22)
        await sleep(16)
      }
      await s.touch("touchEnd", 200, 300 + 14 * 22)
    },
    1400,
  )
  await sleep(300)
  await record(s, "open-3", () => s.tap(at.x, at.y), 1300)
  /* A short pull let go slowly: the sheet goes back up and the community is let go of again under it. */
  const short = await record(
    s,
    "pull-short",
    async () => {
      await s.touch("touchStart", 200, 300)
      for (let i = 1; i <= 4; i++) {
        await s.touch("touchMove", 200, 300 + i * 12)
        await sleep(40)
      }
      await sleep(120)
      await s.touch("touchEnd", 200, 348)
    },
    900,
  )
  const browserBack = await record(s, "close-browser-back", () => s.p.evaluate(() => history.back()), 1400)
  await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  for (const seq of [open, close, pull, browserBack]) {
    out[seq.name] = judgeSheet(seq, feedY, seq.name.startsWith("close"))
    await sheetPng(seq, `${LABEL}-${seq.name}.png`)
  }
  const sl = short.samples.at(-1)
  expect(sl.layer && sl.top <= 1 && sl.scale === 1, "pull-short: a short slow pull springs back up, the community let go of under it", sl)
  const mid = pull.samples.filter((f) => f.layer && f.scale < 0.999 && f.scale > 0.941)
  expect(mid.length >= 3, "close-pull: the community comes forward while the finger has the sheet", mid.length)
  expect(!s.errors.length, "no page errors (sheet)", s.errors.slice(0, 3))
  await s.p.close()

  /* The app: the edge swipe takes the sheet down by its sideways travel. */
  const a = await session({ app: true })
  const at2 = await centerOf(a, pic)
  await sleep(300)
  const feedY2 = await a.p.evaluate(() => Math.round(scrollY))
  await a.tap(at2.x, at2.y)
  await sleep(1400)
  await a.cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
  const edge = await record(
    a,
    "close-edge",
    async () => {
      await a.touch("touchStart", 6, 420)
      for (let i = 1; i <= 12; i++) {
        await a.touch("touchMove", 6 + i * 22, 422)
        await sleep(16)
      }
      await a.touch("touchEnd", 6 + 12 * 22, 422)
    },
    1400,
  )
  await a.cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  out[edge.name] = judgeSheet(edge, feedY2, true)
  const tops = edge.samples.filter((f) => f.layer && f.top !== null).map((f) => f.top)
  expect(tops.some((t) => t > 60 && t < 700), "close-edge: the sheet follows the finger down", tops.filter((_, i) => i % 4 === 0))
  await sheetPng(edge, `${LABEL}-close-edge.png`)
  expect(!a.errors.length, "no page errors (app)", a.errors.slice(0, 3))
  await a.p.close()
  console.log(JSON.stringify({ label: LABEL, part: "sheet", out }))
}


/* ── THE COMPOSER: the same sheet, up and down, over the real feed ── */
const CSAMPLE = () => {
  window.__c = []
  window.__crun = true
  const num = (v) => (!v || v === "none" ? 1 : parseFloat(String(v).split(" ")[0]) || 1)
  const tick = (t) => {
    const sheet = document.querySelector('[data-composer="sheet"]')
    const tb = sheet?.querySelector("[data-composer-toolbar]")
    const head = sheet?.querySelector("[data-composer-cancel]")
    const shell = document.querySelector("[data-community-shell]")
    const bar = document.querySelector("[data-buyer-tab-bar]")
    const sr = sheet?.getBoundingClientRect()
    window.__c.push({
      t: Math.round(t),
      top: sr ? Math.round(sr.top) : null,
      toolbarIn: sr && tb ? Math.round(tb.getBoundingClientRect().top - sr.top) : null,
      headIn: sr && head ? Math.round(head.getBoundingClientRect().top - sr.top) : null,
      scale: shell ? Math.round(num(getComputedStyle(shell).scale) * 1000) / 1000 : 1,
      covered: document.documentElement.hasAttribute("data-tabs-covered"),
      bar: !!bar && bar.getBoundingClientRect().top < innerHeight && getComputedStyle(bar).visibility !== "hidden",
      scrollY: Math.round(scrollY),
      overflow: document.documentElement.style.overflow,
    })
    if (window.__crun) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

async function partCompose() {
  console.log("\nTHE COMPOSER: up and down at 390x844, 4x CPU, over the real feed")
  const out = {}
  const s = await session()
  await s.p.evaluate(() => window.scrollTo(0, 0))
  await sleep(400)
  const field = await s.p.evaluate(() => {
    const r = document.querySelector("[data-composer-open]")?.getBoundingClientRect()
    return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null
  })
  if (!field) {
    expect(false, "the composer's field is on screen")
    return
  }
  const feedY = await s.p.evaluate(() => Math.round(scrollY))
  await s.p.evaluate(WATCH)
  await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
  const sample = async (name, act, ms) => {
    const seq = await record(s, name, async () => {
      await s.p.evaluate(CSAMPLE)
      await act()
    }, ms)
    seq.c = await s.p.evaluate(() => ((window.__crun = false), window.__c))
    return seq
  }
  const open = await sample("compose-open", () => s.tap(field.x, field.y), 1400)
  const cancel = await s.p.evaluate(() => {
    const r = document.querySelector('[data-composer="sheet"] [data-composer-cancel]').getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })
  const close = await sample("compose-close", () => s.tap(cancel.x, cancel.y), 1400)
  await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  const w = await s.p.evaluate(() => ((window.__watch.on = false), window.__watch))
  for (const seq of [open, close]) await sheetPng(seq, `${LABEL}-${seq.name}.png`)
  const c = close.c
  const up = open.c.filter((f) => f.top !== null).map((f) => f.top)
  const goneAt = c.findIndex((f, i) => i > 0 && f.top === null && c.slice(i).every((g) => g.top === null))
  const moving = c.filter((f) => f.top !== null && f.top > 2)
  const toolbarSpots = [...new Set(moving.map((f) => f.toolbarIn))]
  const headSpots = [...new Set(moving.map((f) => f.headIn))]
  console.log(`    open: sheet top ${up.filter((_, i) => i % 3 === 0).join(" ")}`)
  console.log(`    close: sheet top ${c.filter((f) => f.top !== null).map((f) => f.top).filter((_, i) => i % 3 === 0).join(" ")}`)
  console.log(`    close: community scale ${c.map((f) => f.scale).filter((_, i) => i % 3 === 0).join(" ")}`)
  expect(up.length > 4 && up[0] > 300 && up.at(-1) === 0, "COMPOSE OPEN: the screen rises from the foot to the top over several frames", up.filter((_, i) => i % 4 === 0))
  expect(open.c.some((f) => f.scale < 0.99), "and the community eases back behind it as it rises", Math.min(...open.c.map((f) => f.scale)))
  expect(moving.length >= 4 && toolbarSpots.length <= 1 && headSpots.length <= 1, "COMPOSE CLOSE: the screen goes down whole: its header and toolbar never move inside it", { frames: moving.length, toolbarSpots, headSpots })
  expect(c.some((f) => f.scale < 0.99 && f.top !== null && f.top > 2), "and the community comes forward behind it", Math.min(...c.map((f) => f.scale)))
  expect(goneAt > 0 && c[goneAt].bar && !c[goneAt].covered, "the tab bar is on screen and uncovered on the first frame after the screen has gone", c[goneAt])
  expect(c.slice(Math.max(0, goneAt)).every((f) => f.scale === 1), "and the community is at its own size from then on", c.at(-1))
  expect(c.concat(open.c).every((f) => f.scrollY === feedY), `the feed's scroll never moves (${feedY})`, [...new Set(c.concat(open.c).map((f) => f.scrollY))])
  expect(c.concat(open.c).every((f) => f.overflow !== "hidden"), "the document's overflow is never switched off (an iOS restyle and a stuck scroll at the close)", null)
  const count = (k) => w.frames.filter((x) => (typeof x[k] === "number" ? x[k] > 0 : x[k])).length
  const r = { frames: w.frames.length, hidden: count("hidden"), swapped: count("swapped"), faded: count("faded"), decoded: count("decoded"), remounted: w.frames.at(-1)?.remounted ?? 0 }
  out.feedUnder = r
  expect(r.hidden + r.swapped + r.faded + r.decoded + r.remounted === 0, "THE FEED UNDER IT through the open and the close: never hidden, swapped, faded, decoded again or remounted", { ...r, kinds: w.kinds })
  expect(!s.errors.length, "no page errors (composer)", s.errors.slice(0, 3))
  await s.p.close()
  console.log(JSON.stringify({ label: LABEL, part: "compose", out }))
}


/* ── THE KEYBOARD: the comment box on the keys in the iOS app, and white under it whatever the numbers ── */
async function partKeyboard() {
  console.log("\nTHE KEYBOARD: the comment box in the iOS app (390x844)")
  const out = {}
  const s = await session({ app: true, path: "/community/clay-studio?kbdebug=1" })
  const pic = 'article[data-post="a0000000-0000-4000-8000-000000000002"] [data-post-excerpt]'
  const at = await centerOf(s, pic)
  await sleep(300)
  await s.tap(at.x, at.y)
  await sleep(1500)
  /* Every point under the comment box's top edge, down the screen: what is drawn there. */
  const under = () =>
    s.p.evaluate(() => {
      const page = document.querySelector("[data-post-fullscreen] [role=dialog]")
      const dock = page.querySelector("[data-comments-composer]")
      const box = page.querySelector("[data-comment-box=comment]").getBoundingClientRect()
      const d = dock.getBoundingClientRect()
      const seen = []
      for (let y = Math.ceil(d.top) + 1; y < innerHeight; y += 6) {
        for (const x of [4, 195, 386]) {
          const el = document.elementFromPoint(x, y)
          if (!el) continue
          if (el.closest("[data-buyer-tab-bar]")) continue
          const inDock = !!el.closest("[data-comments-composer]")
          const skirt = !!el.closest("[data-post-skirt]")
          /* Anything else of the post (a picture, a card, a comment) or of the feed under it is a see-through. */
          if (!inDock && !skirt) seen.push(`${x},${y}:${el.tagName}${el.closest("[data-post-overlay-post]") ? ":post" : el.closest("[data-community-shell]") ? ":feed" : ""}`)
        }
      }
      const bg = getComputedStyle(dock).boxShadow
      return { source: page.dataset.box, typing: page.hasAttribute("data-typing"), pageTop: Math.round(page.getBoundingClientRect().top), pageBottom: Math.round(page.getBoundingClientRect().bottom), boxBottom: Math.round(box.bottom), dockTop: Math.round(d.top), seen: seen.slice(0, 6), blockShadow: /200vh|1688px|lvh|844px|1600px/.test(bg) || bg.split(",").length > 1, panel: !document.querySelector("[data-kbdebug]").hidden, panelText: document.querySelector("[data-kbdebug]").textContent }
    })
  await s.p.evaluate(() => document.querySelector("[data-post-fullscreen] [data-comments-composer] textarea").focus())
  await sleep(700)
  const a = await under()
  out.table = a
  expect(a.typing && a.source === "table" && a.pageTop === 0 && a.pageBottom === 464, "iOS app, no pan: the page ends on the keyboard's bar (844 - 380 = 464)", a)
  expect(a.boxBottom <= 464 && a.boxBottom >= 450, "and the comment box sits on it", a.boxBottom)
  expect(a.seen.length === 0, "THE BLOCK: everything from the box's top edge down the screen is the box's white or the skirt, never the post or the feed", a.seen)
  expect(a.panel && /used table/.test(a.panelText) && /vv.offsetTop 0/.test(a.panelText), "?kbdebug=1: the readout is on screen while typing, naming what placed the box", a.panelText)
  await s.p.screenshot({ path: join(shots, `${LABEL}-keyboard-app.png`) })
  /*
    76.jpg: iOS pans the page up under the field and says so as visualViewport.offsetTop (62px there). Told the same here, the
    page must follow the pan (its top at 62 in the page, so 0 on the screen) and keep the keyboard's height under it.
  */
  await s.p.evaluate(() => {
    const vv = window.visualViewport
    Object.defineProperty(vv, "offsetTop", { configurable: true, get: () => 62 })
    vv.dispatchEvent(new Event("scroll"))
  })
  await sleep(300)
  const b = await under()
  out.panned = b
  expect(b.source === "table" && b.pageTop === 62 && b.pageBottom === 526, "iOS app, page panned 62px (76.jpg): the page follows the pan, 62 to 526 in the page, so 0 to 464 on the screen", b)
  expect(b.seen.length === 0, "and below the box's top edge it is still only white", b.seen)
  expect(/vv.offsetTop 62/.test(b.panelText), "and the readout shows the pan", b.panelText)
  await s.p.evaluate(() => {
    delete window.visualViewport.offsetTop
    window.visualViewport.dispatchEvent(new Event("scroll"))
  })
  /* A box placed too high (a number off): the block still leaves only white under it. */
  await s.p.evaluate(() => {
    const page = document.querySelector("[data-post-fullscreen] [role=dialog]")
    page.style.height = "400px"
  })
  await sleep(200)
  const c = await under()
  out.short = c
  expect(c.seen.length === 0, "a page placed 64px short of the keys (a wrong number): still only white under the box", c.seen)
  await s.p.screenshot({ path: join(shots, `${LABEL}-keyboard-short.png`) })
  expect(!s.errors.length, "no page errors (keyboard)", s.errors.slice(0, 3))
  await s.p.close()
  console.log(JSON.stringify({ label: LABEL, part: "keyboard", out }))
}


/* ── A COMPUTER: the panel over the feed as before, nothing of the phone's sheet ── */
async function partDesktop() {
  console.log("\nA COMPUTER (1440x900): the post's panel, as before")
  const s = await session({ width: 1440, height: 900 })
  const at = await centerOf(s, 'article[data-post="a0000000-0000-4000-8000-000000000002"] [data-post-excerpt]')
  await sleep(300)
  await s.p.evaluate(WATCH)
  await s.p.mouse.click(at.x, at.y)
  await sleep(800)
  const open = await s.p.evaluate(() => ({ panel: !!document.querySelector('[data-post-overlay="panel"]'), phone: !!document.querySelector("[data-post-fullscreen]"), scale: getComputedStyle(document.querySelector("[data-community-shell]")).scale }))
  await s.p.screenshot({ path: join(shots, `${LABEL}-desktop-open.png`) })
  await s.p.evaluate(() => document.querySelector('[data-post-overlay="panel"] [data-post-overlay-close]').click())
  await sleep(900)
  const w = await s.p.evaluate(() => ((window.__watch.on = false), window.__watch))
  const count = (k) => w.frames.filter((x) => (typeof x[k] === "number" ? x[k] > 0 : x[k])).length
  expect(open.panel && !open.phone && (open.scale === "none" || open.scale === "1"), "the post opens as the panel, and the community is never scaled on a computer", open)
  expect(count("hidden") + count("swapped") + count("decoded") === 0 && (w.frames.at(-1)?.remounted ?? 0) === 0, "the feed under the panel is never hidden, swapped, decoded again or remounted", { hidden: count("hidden"), swapped: count("swapped"), decoded: count("decoded") })
  expect(await s.p.evaluate(() => !document.querySelector('[data-post-overlay="panel"]')), "and it closes", null)
  expect(!s.errors.length, "no page errors (computer)", s.errors.slice(0, 3))
  await s.p.close()
}

try {
  html = await (async () => {
    const [css, js] = await Promise.all([appCss(root), bundle()])
    const fonts = interFaces(root)
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Clay Studio</title><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  })()

  if (PART === "all" || PART === "b") await partB()
  if (PART === "all" || PART === "sheet") await partSheet()
  if (PART === "all" || PART === "compose") await partCompose()
  if (PART === "all" || PART === "keyboard") await partKeyboard()
  if (PART === "all" || PART === "desktop") await partDesktop()
} finally {
  rmSync(stubs, { recursive: true, force: true })
  await browser.close()
}
console.log(`\n  sheets in ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
