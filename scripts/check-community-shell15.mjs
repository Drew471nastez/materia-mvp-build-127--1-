/**
 * ===========================================================================
 *  ROUND 15: MOVING BETWEEN A COMMUNITY'S PLACES, MEASURED BEFORE AND AFTER
 * ===========================================================================
 * The owner: "I click Learn, Calendar, Members, About and it freezes the whole
 * screen for one or two seconds with white, then abruptly shows". This
 * measures, on a 390x844 phone at 4x CPU throttling, the time from a tap on a
 * place (Members, Leaderboards, Calendar, About, back to Community) or a space
 * pill to its content on screen, frame by frame, and on every frame whether
 * the middle is blank (nothing of the old place, the new place or its waiting
 * screen) and whether the community's header is still the same element.
 *
 *   BEFORE  the base commit's own harness (scripts/render-community-shell.tsx
 *           ?case=nav at 91eb630d, given as BEFORE_ROOT): the frame stays, the
 *           page inside it is swapped as the app router swapped it: from the
 *           router's cache when it was prefetched or visited, otherwise its
 *           loading.tsx for the server's time and then the page.
 *   AFTER   this checkout's shell (scripts/render-community-shell15.tsx): the
 *           navigator, the place host, the places drawn from data; the JSON
 *           place route answered after the same server time.
 *
 * Three runs each: COLD (nothing read ahead, the first visit to each place),
 * WARM (the same places again in the same visit), and AHEAD (the first visit
 * after the frame has been idle long enough to read ahead).
 * The server's time is 600ms in both (LATENCY=), the live site's RSC time for
 * a community place measured from here (0.42s to 1.76s).
 *
 * Frame sequences of chosen taps are saved under SHOTS_DIR to be looked at.
 *
 *   BEFORE_ROOT=<checkout of 91eb630d> PROBE_CSS=source node scripts/check-community-shell15.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const AFTER_ROOT = process.cwd()
const BEFORE_ROOT = process.env.BEFORE_ROOT || null
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const LATENCY = Number(process.env.LATENCY || 600)
const ORIGIN = "https://storelib.com"
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-shell15-")), "shots")
mkdirSync(shots, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

/* ── The bundles ── */

async function bundle(root, entry, tag) {
  const stubs = join(root, `.community-shell15-probe-${tag}`)
  mkdirSync(stubs, { recursive: true })
  /* Next's router follows history.pushState (app router since 14.1) in a transition; the stub does the same. */
  writeFileSync(
    join(stubs, "navigation.js"),
    `import { startTransition, useEffect, useState } from "react"
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => { log("push", h); window.__navigate && window.__navigate(h) }, replace: (h) => log("replace", h), prefetch: (h, o) => { log("prefetch", h); window.__onPrefetch && window.__onPrefetch(h) }, back: () => history.back(), refresh: () => log("refresh") }
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
export default React.forwardRef(function Link({ href, children, prefetch, scroll, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]); window.__navigate && window.__navigate(href) } } }, children) })
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
  const rel = `./.community-shell15-probe-${tag}`
  await build({
    entryPoints: [join(root, entry)],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": `${rel}/navigation.js`, "next/link": `${rel}/link.jsx`, "next/image": `${rel}/image.jsx`, "next/dynamic": `${rel}/dynamic.jsx` },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(AFTER_ROOT, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  rmSync(stubs, { recursive: true, force: true })
  return js
}

const PLACES = [{ kind: "community", id: "c0000000-0000-4000-8000-000000000001", slug: "clay-studio", title: "Clay Studio", imageUrl: null }]

async function htmlFor(root, entry, tag) {
  const [css, js] = await Promise.all([appCss(root), bundle(root, entry, tag)])
  const fonts = interFaces(AFTER_ROOT)
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Clay Studio</title><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
}

/* ── What is on screen, every frame ── */

/* A place's content, as each place draws it. */
const CONTENT = {
  feed: "[data-feed-list] [data-post]",
  members: "[data-members] [data-member-list]",
  leaderboard: "[data-leaderboard]",
  calendar: "[data-event-list], [data-month-calendar]",
  about: "[data-community-description], [data-community-creator-card]",
  glaze: '[data-post="p-glaze-1"]',
}
/* A waiting screen counts once something of it is seen: its title, or its spinner past its own delay. */
const WAITING = "[data-place-loading] [data-page-title], [data-place-spinner] [data-place-spinner-glyph]"

/* Runs in the page: a frame recorder. Each frame: when, which places' content is visible, a waiting screen, the header's identity. */
const RECORDER = `(() => {
  const SEL = ${JSON.stringify(CONTENT)}
  const WAIT = ${JSON.stringify(WAITING)}
  /* Laid out with height. A waiting screen must also be seen: its spinner waits out a delay at opacity 0, which to the eye is a blank, so its opacity (and its wrapper's) is read; nothing else here is ever see-through for long. */
  const laid = (el) => el.getClientRects().length > 0 && el.getBoundingClientRect().height > 0
  const opaque = (el) => { let o = 1; for (let n = el, i = 0; n && i < 3; n = n.parentElement, i++) o *= Number(getComputedStyle(n).opacity); return o > 0.05 }
  const shown = (sel, see) => { for (const el of document.querySelectorAll(sel)) { if (laid(el) && (!see || opaque(el))) return true } return false }
  window.__rec = { taps: [], frames: [], on: false, headerSwaps: 0 }
  const tagHeader = () => { const h = document.querySelector("[data-community-top]"); if (h && !h.__probeId) { h.__probeId = Math.random() } return h }
  let header = tagHeader()
  window.__rec.headerId = header && header.__probeId
  document.addEventListener("click", () => window.__rec.taps.push(performance.now()), true)
  const frame = (t) => {
    if (window.__rec.on) {
      const h = document.querySelector("[data-community-top]")
      if (h !== header) { window.__rec.headerSwaps++; header = h; if (h && !h.__probeId) h.__probeId = Math.random() }
      const f = { t: performance.now() }
      for (const k of Object.keys(SEL)) f[k] = shown(SEL[k], false)
      f.waiting = shown(WAIT, true)
      window.__rec.frames.push(f)
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
})()`

async function openPage(browser, html, url, { latency = LATENCY, before = false } = {}) {
  const p = await browser.newPage()
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const u = r.url()
    if (u.startsWith(`${ORIGIN}/api/`)) {
      const short = u.replace(ORIGIN, "")
      let body = {}
      if (short.endsWith("/presence")) body = { ok: true, ready: true }
      else if (short.startsWith("/api/me/places")) body = { signedIn: true, communitiesOn: true, isCreator: false, hasSellerAccess: true, recent: PLACES }
      else if (short.startsWith("/api/notifications")) body = { unread: 0, items: [], nextCursor: null, available: true }
      else if (short.includes("/dms")) body = { ready: true, unread: 2, conversations: [] }
      else if (short.includes("/search?index")) body = { index: { at: Date.now(), spaces: [], posts: [], members: [] } }
      else if (short.includes("/members?")) body = { members: [], nextCursor: null }
      else if (short.startsWith("/api/version")) body = { deploymentId: "" }
      return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
    }
    if (u.startsWith(`${ORIGIN}/`)) return void r.respond({ status: 200, contentType: "text/html", body: html })
    if (u.startsWith("data:")) return void r.continue()
    return void r.respond({ status: 204, body: "" })
  })
  await p.evaluateOnNewDocument((ms) => {
    window.__placeLatency = ms
    window.__feedLatency = 250
  }, latency)
  await p.goto(`${ORIGIN}${url}`, { waitUntil: "load" })
  await p.evaluate(() => document.fonts.ready)
  await sleep(900)
  await p.evaluate(RECORDER)
  const cdp = await p.target().createCDPSession()
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  return { p, cdp, errors, before }
}

/* A tap where a finger would land: the place's tab in the row under the bar, or a space pill. */
async function tap(page, cdp, selector) {
  const at = await page.evaluate((sel) => {
    const el = Array.from(document.querySelectorAll(sel)).find((e) => e.getClientRects().length && e.getBoundingClientRect().width > 0)
    if (!el) return null
    el.scrollIntoView({ block: "nearest", inline: "nearest" })
    const b = el.getBoundingClientRect()
    return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }
  }, selector)
  if (!at) return false
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: at.x, y: at.y, radiusX: 6, radiusY: 6, force: 1 }] })
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  return true
}

/* Taps a place and follows the frames until its content is on screen: the time, blank frames, waiting frames, header swaps. */
async function measure(run, label, selector, want, prev, { film = null } = {}) {
  const { p, cdp } = run
  await p.evaluate(() => {
    window.__rec.frames = []
    window.__rec.taps = []
    window.__rec.headerSwaps = 0
    window.__rec.on = true
  })
  let frames = []
  if (film) {
    mkdirSync(join(shots, film), { recursive: true })
    let n = 0
    cdp.on("Page.screencastFrame", async (f) => {
      writeFileSync(join(shots, film, `${String(n++).padStart(3, "0")}.jpg`), Buffer.from(f.data, "base64"))
      await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
    })
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 60, maxWidth: 390, maxHeight: 844, everyNthFrame: 1 })
  }
  const ok = await tap(p, cdp, selector)
  if (!ok) {
    console.log(`  (no ${selector} to tap)`)
    return null
  }
  const deadline = Date.now() + 6000
  let rec = null
  while (Date.now() < deadline) {
    await sleep(120)
    rec = await p.evaluate(() => window.__rec)
    const t0 = rec.taps[0]
    const hit = t0 !== undefined && rec.frames.find((f) => f.t >= t0 && f[want])
    if (hit && rec.frames[rec.frames.length - 1].t - hit.t > 300) break
  }
  if (film) {
    await cdp.send("Page.stopScreencast").catch(() => {})
    cdp.removeAllListeners("Page.screencastFrame")
  }
  await p.evaluate(() => (window.__rec.on = false))
  const t0 = rec.taps[0]
  frames = rec.frames.filter((f) => t0 !== undefined && f.t >= t0)
  const hit = frames.find((f) => f[want])
  const until = hit ? frames.filter((f) => f.t <= hit.t) : frames
  const blank = until.filter((f) => !f[want] && !f.waiting && !(prev && f[prev])).length
  const waiting = until.filter((f) => f.waiting && !f[want]).length
  const ms = hit ? Math.round(hit.t - t0) : null
  const firstWait = until.find((f) => f.waiting && !f[want])
  const waitAt = firstWait ? Math.round(firstWait.t - t0) : null
  const out = { label, ms, frames: until.length, blank, waiting, waitAt, headerSwaps: rec.headerSwaps }
  console.log(`  ${label.padEnd(44)} ${ms === null ? "never" : `${String(ms).padStart(5)}ms`}  frames ${String(until.length).padStart(3)}  blank ${blank}  waiting ${waiting}  header swaps ${rec.headerSwaps}${waitAt === null ? "" : `  waiting from ${waitAt}ms`}`)
  return out
}

/* The tab for a place in the row under the bar (a phone has no left column). */
const TAB = (label) => `[data-community-tabs] a[data-community-nav="${label}"]`
const PILL = 'a[href*="glaze-lab"]'

async function sequence(run, tag, { films = false } = {}) {
  const out = []
  const steps = [
    ["Members", "members", "feed"],
    ["Leaderboards", "leaderboard", "members"],
    ["Calendar", "calendar", "leaderboard"],
    ["About", "about", "calendar"],
    ["Community", "feed", "about"],
  ]
  for (const [label, want, prev] of steps) {
    out.push(await measure(run, `${tag} ${label}`, TAB(label), want, prev, { film: films ? `${tag}-${label}`.replace(/\s+/g, "-").toLowerCase() : null }))
    await sleep(700)
  }
  out.push(await measure(run, `${tag} space pill Glaze lab`, PILL, "glaze", "feed", { film: films ? `${tag}-space`.replace(/\s+/g, "-").toLowerCase() : null }))
  await sleep(700)
  return out.filter(Boolean)
}

const results = {}
let browser
try {
  browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], protocolTimeout: 240_000 })
  const modes = []
  if (BEFORE_ROOT) modes.push(["before", await htmlFor(BEFORE_ROOT, "scripts/render-community-shell.tsx", "before")])
  modes.push(["after", await htmlFor(AFTER_ROOT, "scripts/render-community-shell15.tsx", "after")])
  const COLD = "members,leaderboard,events,about,learn"
  for (const [mode, html] of modes) {
    console.log(`\n${mode.toUpperCase()}`)
    /* COLD then WARM: nothing read ahead; the first round visits each place for the first time, the second comes back to each. */
    const coldUrl = mode === "before" ? `/community/clay-studio?case=nav&idle=0&cold=${COLD}&latency=${LATENCY}` : `/community/clay-studio?idle=0`
    const run = await openPage(browser, html, coldUrl, { before: mode === "before" })
    const cold = await sequence(run, `${mode} cold`, { films: true })
    const warm = await sequence(run, `${mode} warm`, { films: true })
    if (run.errors.length) console.log("  page errors:", run.errors.slice(0, 3))
    await run.p.close()
    /* AHEAD: the frame left idle first, so it reads places ahead (before: router.prefetch; after: the JSON place route). */
    const aheadUrl = mode === "before" ? `/community/clay-studio?case=nav&latency=${LATENCY}` : `/community/clay-studio`
    const run2 = await openPage(browser, html, aheadUrl, { before: mode === "before" })
    await sleep(4000)
    const ahead = await sequence(run2, `${mode} ahead`)
    await run2.p.close()
    results[mode] = { cold, warm, ahead }
  }

  /* ── What must hold after ── */
  const a = results.after
  const all = [...a.cold, ...a.warm, ...a.ahead]
  console.log("\nAFTER, checked")
  expect(all.every((r) => r.ms !== null), "every place's content arrives", all.filter((r) => r.ms === null).map((r) => r.label))
  expect(all.every((r) => r.blank === 0), "no blank frame on any move (the old place stays until the new one or its waiting screen)", all.map((r) => r.blank))
  expect(all.every((r) => r.headerSwaps === 0), "the header is the same element on every move", all.map((r) => r.headerSwaps))
  const warmPlaces = a.warm.slice(0, 5)
  expect(warmPlaces.every((r) => r.ms !== null && r.ms <= 120), "warm (kept alive): content within a few frames of the tap at 4x CPU", warmPlaces.map((r) => r.ms))
  /* In hand, so never a waiting screen; the time is the screen's own first draw at 4x CPU (About's sheet is the heaviest, 30 to 260ms across runs). */
  expect(a.ahead.slice(0, 4).every((r) => r.ms !== null && r.ms <= 400 && r.waiting === 0 && r.waitAt === null), "read ahead: no waiting screen, only the screen's own first draw", a.ahead.slice(0, 4).map((r) => [r.ms, r.waiting]))
  expect(a.cold.slice(0, 4).every((r) => r.waitAt === null || r.waitAt >= 230), "cold: the waiting screen never shows before 250ms (the place being left stays until then)", a.cold.slice(0, 4).map((r) => r.waitAt))
  writeFileSync(join(shots, "results.json"), JSON.stringify(results, null, 2))
  console.log(`\nframes and results in ${shots}`)
} finally {
  await browser?.close()
}
if (broken) {
  console.log(`\n${broken} failed`)
  process.exit(1)
}
console.log("\nall ok")
