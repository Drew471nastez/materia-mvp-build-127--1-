/**
 * ===========================================================================
 *  THE STORELIB HEADER, ROUND 8, MEASURED
 * ===========================================================================
 * The real header (scripts/render-header-round8.tsx) in headless Chromium:
 *
 *   NAVIGATOR   the hamburger's popover (1440) and sheet (390) opened and
 *               closed six times each with the CPU slowed four times: the
 *               time from the press to the first frame that moves, and the
 *               longest frame while it moves, median and worst
 *   BAR         no wishlist heart on Explore (it stays on other pages); the
 *               Dashboard button white with a hairline and ink text; the
 *               counts ink, not red
 *   SEARCH      focused with nothing typed: recent searches only, no
 *               category pills; with no recent searches, no panel. "e":
 *               at most five rows, products and communities together,
 *               then View all; the arrows and Enter; a slim scrollbar; the
 *               communities switch off asks for no communities
 *   BELL SHEET  at 375x667 and 390x844, as Safari and as Chrome on a phone:
 *               the first page read before it opens, rows on the first
 *               frame it is seen (no skeleton at any frame), the sheet as
 *               tall as its rows with no gap under the last one and none
 *               under the sheet, still so when the window shrinks the way a
 *               browser's bottom bar does, and a long list scrolling inside
 *               a sheet that stops at its maximum
 *
 *   PROBE_CSS=source node scripts/check-header-round8.mjs
 *   Pictures go to SHOTS_DIR (a temp folder by default).
 */
import { build } from "esbuild"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const note = (m) => console.log(`        ${m}`)

const css = await appCss(root)
const faces = interFaces(root)
const stubs = join(root, ".header-round8-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-header-r8-")), "shots")
mkdirSync(shots, { recursive: true })

const PRODUCTS = [
  ["Editing Presets for Film", "mara"],
  ["Lightroom essentials", "leo"],
  ["Sound effects pack", "sam"],
  ["Free ambience sample pack", "sam"],
  ["Moodboard templates", "ava"],
  ["The Edit Book", "mara"],
].map(([title, who], i) => ({
  id: `p${i}`, title, slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  thumbnail_url: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88"><rect width="88" height="88" fill="${["#c08457", "#5b7c99", "#8a9a5b"][i % 3]}"/></svg>`)}`,
  price_cents: i === 3 ? 0 : 900 + i * 500, compare_at_cents: null, pay_what_you_want: false, pwyw_min_price_cents: null, type: "digital",
  creators: { id: `c-${who}`, user_id: `u-${who}`, display_name: who[0].toUpperCase() + who.slice(1), slug: who, username: null, avatar_url: null },
}))

const STUBS = {
  "next/navigation": `import { useSyncExternalStore } from "react"
const router = { push: (h) => (window.__pushed ||= []).push(h), replace() {}, prefetch() {}, back() {}, refresh() {} }
const sub = (f) => { window.__nav.subs.add(f); return () => window.__nav.subs.delete(f) }
export const usePathname = () => useSyncExternalStore(sub, () => window.__nav.path)
export const useRouter = () => router
/* One object for the page, as Next's own is stable between renders (a new one each render resets the field's query). */
const params = new URLSearchParams("")
export const useSearchParams = () => params
export const useParams = () => ({})`,
  "next/link": `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, onClick, ...rest }, ref) {
  return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, onClick: (e) => { onClick?.(e); e.preventDefault(); (window.__clicked ||= []).push(typeof href === "string" ? href : "#") }, ...rest }, children)
})
export const useLinkStatus = () => ({ pending: false })`,
  "next/image": `import React from "react"
export default function Image({ src, alt, fill, priority, preload, sizes, unoptimized, className, style, ...rest }) {
  return React.createElement("img", { src: typeof src === "string" ? src : "", alt, className, style, ...rest })
}`,
  /* Preferences allowed, so recent searches are kept (lib/consent/client). */
  consent: `export const hasConsent = () => true
export const readConsent = () => ({ necessary: true, preferences: true, analytics: false, marketing: false })
export const writeConsent = () => {}
export const consentDecided = () => true
export const CONSENT_EVENT = "consent"`,
  "supabase-client": `const who = () => window.__who
const USER = { id: "u1", email: "ava@example.com", user_metadata: {} }
const PRODUCTS = ${JSON.stringify(PRODUCTS)}
const rowFor = (table) => {
  if (table === "profiles") return { display_name: "Ava Stone", avatar_url: null, username: "ava", is_creator: who() === "seller" }
  if (table === "creators") return who() === "seller" ? { id: "c1", slug: "ava", onboarding_completed: true } : null
  if (table === "products") return PRODUCTS
  return null
}
const chain = (table) => new Proxy(function () {}, {
  get: (_, k) => k === "then" ? (r) => { (window.__asked ||= []).push(table); r({ data: rowFor(table), error: null }) } : chain(table),
  apply: () => chain(table),
})
export function isNativePlatform() { return false }
export const capacitorStorage = {}
export function createClient() {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: who() === "guest" ? null : USER }, error: null }),
      getSession: async () => ({ data: { session: who() === "guest" ? null : { user: USER, access_token: "t" } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({}),
    },
    realtime: { setAuth: async () => {} },
    from: (table) => chain(table),
    rpc: () => chain(null),
    channel: (name) => { const ch = { name, on() { return ch }, subscribe() { return ch } }; return ch },
    removeChannel() {},
  }
}`,
}
for (const [k, v] of Object.entries(STUBS)) writeFileSync(join(stubs, `${k.replace(/\//g, "-")}.jsx`), v)

try {
  await build({
    entryPoints: [join(root, "scripts/render-header-round8.tsx")],
    bundle: true, format: "iife", jsx: "automatic", logLevel: "error",
    outfile: join(stubs, "app.js"),
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: "var process={env:{NODE_ENV:'production'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;" },
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    plugins: [{
      name: "stubs",
      setup(b) {
        b.onResolve({ filter: /^next\/(navigation|link|image)$/ }, (a) => ({ path: join(stubs, `${a.path.replace(/\//g, "-")}.jsx`) }))
        b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.jsx") }))
        b.onResolve({ filter: /^@\/lib\/consent\/client$/ }, () => ({ path: join(stubs, "consent.jsx") }))
        b.onResolve({ filter: /^@\// }, async (a) => b.resolve("./" + a.path.slice(2), { resolveDir: root, kind: a.kind }))
      },
    }],
    nodePaths: [join(root, "node_modules")],
  })
} catch (e) {
  rmSync(stubs, { recursive: true, force: true })
  fail(`The probe did not bundle: ${e.message}`)
}
const js = readFileSync(join(stubs, "app.js"), "utf8")
writeFileSync(join(stubs, "index.html"), `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style></head>
<body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files"] })
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1"
const CHROME = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36"

async function open(vp, hash, { ua, wait = 1600 } = {}) {
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  if (ua) await p.setUserAgent(ua)
  await p.setViewport(vp)
  await p.goto(`file://${join(stubs, "index.html")}#${hash}`)
  await p.evaluate(() => document.fonts.ready)
  await sleep(wait)
  if (errors.length) fail(`The page threw (${hash}): ${errors[0]}`)
  p.__errors = errors
  return p
}
const throttle = async (p, rate) => { const c = await p.target().createCDPSession(); await c.send("Emulation.setCPUThrottlingRate", { rate }); return c }
const visiblePoint = (p, sel) => p.evaluate((sel) => {
  const el = [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}, sel)
const shot = async (p, opts) => { await p.screenshot({ ...opts, path: undefined }); await p.screenshot(opts) }
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? Math.round(s[Math.floor(s.length / 2)] * 10) / 10 : null }
const worst = (a) => (a.length ? Math.round(Math.max(...a) * 10) / 10 : null)

/*
  ONE PRESS, MEASURED. Each animation frame records where `sel` is (its
  opacity, its box on screen, its scale and translate), from just before the press until it has
  stopped moving. Reported: the time from the press to the first frame in
  which it has moved, and the longest gap between frames while it moves.
*/
async function pressAndSample(p, pressSel, panelSel, { touch = false, ms = 700 } = {}) {
  await p.evaluate((panelSel) => {
    window.__s = []
    window.__run = true
    const read = () => {
      const el = document.querySelector(panelSel)
      if (!el) return { o: 0, m: "none", v: "hidden" }
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return { o: +cs.opacity, m: `${r.top.toFixed(1)}|${r.height.toFixed(1)}|${cs.scale}|${cs.translate}`, v: cs.visibility }
    }
    window.__base = read()
    const tick = (t) => { window.__s.push({ t, ...read() }); if (window.__run) requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  }, panelSel)
  await sleep(50)
  const pt = await visiblePoint(p, pressSel)
  const t0 = await p.evaluate(() => performance.now())
  if (touch) await p.touchscreen.tap(pt.x, pt.y)
  else await p.mouse.click(pt.x, pt.y)
  await sleep(ms)
  const s = await p.evaluate(() => { window.__run = false; return { s: window.__s, base: window.__base } })
  const after = s.s.filter((x) => x.t >= t0)
  /* Seen to move: its opacity or its position, not a visibility flip while it is still transparent. */
  const changed = (x, y) => Math.abs(x.o - y.o) > 0.001 || x.m !== y.m
  const first = after.findIndex((x) => changed(x, s.base))
  let last = first
  for (let i = first + 1; i < after.length; i++) if (changed(after[i], after[i - 1])) last = i
  let longest = 0
  for (let i = Math.max(1, first); i <= last; i++) longest = Math.max(longest, after[i].t - after[i - 1].t)
  return { toFirst: first < 0 ? null : after[first].t - t0, longest, frames: last - first + 1 }
}

/*
  THE MAIN THREAD BETWEEN THE PRESS AND THE FIRST FRAME, from Chromium's own
  trace: the time from the press to the first frame handed to the
  compositor (Commit), and in it the script and the style work (how many
  elements were restyled). Steadier than counting frames in a headless
  browser, whose frame clock wanders under a slowed CPU.
*/
async function traceToggle(p, pressSel, { touch = false, closeSel } = {}) {
  const one = async (sel) => {
    await p.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline"] })
    const pt = await visiblePoint(p, sel)
    if (touch) await p.touchscreen.tap(pt.x, pt.y)
    else await p.mouse.click(pt.x, pt.y)
    await sleep(500)
    const ev = JSON.parse(Buffer.from(await p.tracing.stop()).toString("utf8")).traceEvents
    const press = ev.find((e) => e.ph === "X" && e.name === "EventDispatch" && e.args?.data?.type === "click")
    if (!press) return null
    const main = ev.filter((e) => e.ph === "X" && e.tid === press.tid && e.pid === press.pid && e.ts >= press.ts)
    const commit = main.find((e) => e.name === "Commit")
    const until = commit ? commit.ts : press.ts + 200000
    const inWindow = main.filter((e) => e.ts < until)
    const sum = (n) => inWindow.filter((e) => e.name === n).reduce((t, e) => t + e.dur, 0) / 1000
    return { toCommit: (until - press.ts) / 1000, script: sum("FunctionCall") + sum("EventDispatch") * 0, style: sum("UpdateLayoutTree"), restyled: inWindow.filter((e) => e.name === "UpdateLayoutTree").reduce((t, e) => t + (e.args?.elementCount || 0), 0) }
  }
  const opens = []
  const closes = []
  for (let i = 0; i < RUNS; i++) {
    opens.push(await one(pressSel))
    await sleep(200)
    closes.push(await one(closeSel || pressSel))
    await sleep(200)
  }
  const med = (a, k) => median(a.filter(Boolean).map((x) => x[k]))
  const pick = (a) => ({ toCommit: med(a, "toCommit"), script: med(a, "script"), style: med(a, "style"), restyled: med(a, "restyled") })
  return { open: pick(opens), close: pick(closes) }
}

async function measureToggle(p, pressSel, panelSel, opts) {
  const opens = []
  const closes = []
  for (let i = 0; i < RUNS; i++) {
    opens.push(await pressAndSample(p, pressSel, panelSel, opts))
    await sleep(150)
    const closeSel = opts?.closeSel || pressSel
    closes.push(await pressAndSample(p, closeSel, panelSel, opts))
    await sleep(150)
  }
  const sum = (a, k) => ({ median: median(a.map((x) => x[k]).filter((x) => x != null)), worst: worst(a.map((x) => x[k]).filter((x) => x != null)) })
  return { open: { pressToFirstFrame: sum(opens, "toFirst"), longestFrame: sum(opens, "longest") }, close: { pressToFirstFrame: sum(closes, "toFirst"), longestFrame: sum(closes, "longest") } }
}

const RUNS = Number(process.env.RUNS || 6)
const only = (process.env.ONLY || "nav,bar,search,bell").split(",")

/* ── 1. The navigator ─────────────────────────────────────────────── */
if (only.includes("nav")) {
  console.log(`\nthe navigator, CPU slowed 4x, ${RUNS} opens and ${RUNS} closes`)
  if (!only.includes("sheet-only")) {
    const p = await open(DESK, "path=/explore&who=buyer")
    const cdp = await throttle(p, 4)
    const r = await measureToggle(p, "[data-place-navigator-trigger]", '[data-place-navigator-panel="popover"]')
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    note(`popover 1440: ${JSON.stringify(r)}`)
    await throttle(p, 4)
    const tr = await traceToggle(p, "[data-place-navigator-trigger]")
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    note(`popover 1440, traced (ms at 4x, median): ${JSON.stringify(tr)}`)
    expect(tr.open.restyled <= 12 && tr.close.restyled <= 12, "the press restyles the panel, not everything in it", tr)
    await p.mouse.click(720, 600)
    await sleep(300)
    const pt = await visiblePoint(p, "[data-place-navigator-trigger]")
    await p.mouse.click(pt.x, pt.y)
    await sleep(500)
    const look = await p.evaluate(() => {
      const el = document.querySelector('[data-place-navigator-panel="popover"]')
      const icons = [...el.querySelectorAll("[data-navigator-link] svg")].map((s) => ({ w: Math.round(s.getBoundingClientRect().width), link: s.closest("[data-navigator-link]").getAttribute("data-navigator-link") }))
      return { shadow: getComputedStyle(el).boxShadow, icons }
    })
    expect(look.icons.length === 2 && look.icons.every((i) => i.w >= 18 && i.w <= 22), "Explore and Discover communities each have their icon", look.icons)
    await shot(p, { path: join(shots, "nav-popover-1440.png"), clip: { x: 0, y: 0, width: 560, height: 420 } })
    await p.close()
  }
  {
    const p = await open({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, "path=/explore&who=buyer", { ua: SAFARI, wait: 2200 })
    const cdp = await throttle(p, 4)
    /* Closed by a tap on the dimmed page, the way a thumb does it. */
    const r = await measureToggle(p, "[data-place-navigator-trigger]", "[data-sheet-panel]:has([data-place-navigator-panel])", { touch: true, ms: 900, closeSel: "[data-app-sheet] > div:first-child" })
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    note(`sheet 390: ${JSON.stringify(r)}`)
    await throttle(p, 4)
    const tr = await traceToggle(p, "[data-place-navigator-trigger]", { touch: true, closeSel: "[data-app-sheet] > div:first-child" })
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    note(`sheet 390, traced (ms at 4x, median): ${JSON.stringify(tr)}`)
    if (process.env.PROFILE) {
      /* Development aid: where the script time of one open goes, by function, self time. */
      const c = await p.target().createCDPSession()
      await c.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      await c.send("Profiler.enable")
      await c.send("Profiler.setSamplingInterval", { interval: 100 })
      await c.send("Profiler.start")
      const pt = await visiblePoint(p, "[data-place-navigator-trigger]")
      await p.touchscreen.tap(pt.x, pt.y)
      await sleep(120)
      const { profile } = await c.send("Profiler.stop")
      await c.send("Emulation.setCPUThrottlingRate", { rate: 1 })
      const self = new Map()
      const dt = profile.timeDeltas
      const byId = new Map(profile.nodes.map((n) => [n.id, n]))
      profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || "(anon)"}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0) / 1000) })
      note("profile: " + [...self.entries()].filter(([k]) => !/^\((idle|program|garbage collector)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(" | "))
    }
    expect(r.open.longestFrame.median <= 34 && r.close.longestFrame.median <= 34, "sheet: no frame longer than two vsyncs while it moves (median of six)", r)
    const pt = await visiblePoint(p, "[data-place-navigator-trigger]")
    await p.touchscreen.tap(pt.x, pt.y)
    await sleep(700)
    await shot(p, { path: join(shots, "nav-sheet-390.png") })
    await p.close()
  }
}

/* ── 2. The bar ───────────────────────────────────────────────────── */
if (only.includes("bar")) {
  console.log("\nthe bar")
  const p = await open(DESK, "path=/explore&who=seller")
  const bar = await p.evaluate(() => {
    const root = document.getElementById("platform-header-root")
    const vis = (sel) => [...root.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0)
    const dash = vis("[data-header-dashboard]")[0]
    const cs = dash && getComputedStyle(dash)
    const badge = vis("[data-bell-badge]")[0]
    return {
      hearts: vis('[aria-label="Wishlist"], [aria-label="wishlist"]').length + vis("a[href*='wishlist']").length,
      dash: cs && { bg: cs.backgroundColor, color: cs.color, border: cs.borderTopColor, borderW: cs.borderTopWidth, shadow: cs.boxShadow },
      badge: badge && { bg: getComputedStyle(badge).backgroundColor, color: getComputedStyle(badge).color },
    }
  })
  expect(bar.hearts === 0, "no wishlist heart on Explore (computer)", bar.hearts)
  expect(bar.dash && bar.dash.bg === "rgb(255, 255, 255)" && bar.dash.color === "rgb(26, 26, 46)" && bar.dash.borderW === "1px" && /rgba?\(/.test(bar.dash.shadow), "Dashboard: white, a hairline, a soft shadow, ink text", bar.dash)
  expect(bar.badge && bar.badge.bg === "rgb(26, 26, 46)" && bar.badge.color === "rgb(255, 255, 255)", "the bell's count is ink with white figures", bar.badge)
  await shot(p, { path: join(shots, "bar-1440-explore.png"), clip: { x: 0, y: 0, width: 1440, height: 90 } })
  await p.close()

  const help = await open(DESK, "path=/help&who=seller")
  const hearts = await help.evaluate(() => [...document.querySelectorAll('#platform-header-root a[href*="wishlist"]')].filter((e) => e.getBoundingClientRect().width > 0).length)
  expect(hearts === 1, "and the heart stays on the other pages that share the bar", hearts)
  await help.close()

  const phone = await open({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, "path=/explore&who=buyer", { ua: SAFARI })
  const ph = await phone.evaluate(() => [...document.querySelectorAll('#platform-header-root a[href*="wishlist"]')].filter((e) => e.getBoundingClientRect().width > 0).length)
  expect(ph === 0, "no wishlist heart on Explore (phone)", ph)
  await shot(phone, { path: join(shots, "bar-390-explore.png"), clip: { x: 0, y: 0, width: 390, height: 80 } })
  await phone.close()
}

/* ── 3. The search ────────────────────────────────────────────────── */
if (only.includes("search")) {
  console.log("\nthe header's search (1440, a page where the bar carries the field)")
  const FIELD = "[data-header-search-field] input"
  const PANEL = '[data-header-search-modal][data-state="open"]'
  {
    const p = await open(DESK, "path=/help&who=seller")
    await p.click(FIELD)
    await sleep(400)
    const shown = await p.$(PANEL)
    expect(!shown, "nothing typed and nothing searched before: no panel at all", !!shown)
    await p.close()
  }
  {
    const p = await open(DESK, "path=/help&who=seller&recent=presets,film grain")
    await p.click(FIELD)
    await sleep(400)
    const r = await p.evaluate((PANEL) => {
      const el = document.querySelector(PANEL)
      return el && { text: el.textContent, recents: el.querySelectorAll("[data-header-search-recent] [role=option]").length }
    }, PANEL)
    expect(r && r.recents === 2, "nothing typed: the two recent searches", r)
    expect(r && !/Categories|Design|Start typing/.test(r.text), "and no categories in it", r?.text)
    await shot(p, { path: join(shots, "search-recent-1440.png"), clip: { x: 200, y: 0, width: 1000, height: 300 } })
    await p.keyboard.press("ArrowDown")
    await p.keyboard.press("Enter")
    await sleep(700)
    const v = await p.$eval(FIELD, (i) => i.value)
    expect(v === "presets", "a recent search, chosen with the arrows and Enter, is searched", v)
    await p.close()
  }
  {
    const p = await open(DESK, "path=/help&who=seller")
    await p.click(FIELD)
    await p.keyboard.type("e")
    await sleep(900)
    const r = await p.evaluate((PANEL) => {
      const el = document.querySelector(PANEL)
      if (!el) return null
      const rows = [...el.querySelectorAll("[data-header-search-hit]")]
      const all = el.querySelector("[data-header-search-all]")
      const img = el.querySelector("[data-header-search-hit] img")
      return {
        rows: rows.map((x) => `${x.getAttribute("data-header-search-hit")}:${x.querySelector(".truncate").textContent}`),
        heights: rows.map((x) => Math.round(x.getBoundingClientRect().height)),
        all: all && all.textContent,
        cats: /Categories/.test(el.textContent),
        scrollbar: getComputedStyle(el).scrollbarWidth,
        img: img && { w: img.getAttribute("width"), h: img.getAttribute("height"), box: Math.round(img.getBoundingClientRect().width) },
        overflowX: el.scrollWidth - el.clientWidth,
        opacity: getComputedStyle(el).opacity,
        bg: getComputedStyle(el).backgroundColor,
        anims: el.getAnimations().map((a) => [a.playState, a.currentTime, a.transitionProperty]),
      }
    }, PANEL)
    expect(r && r.rows.length > 0 && r.rows.length <= 5, "\"e\": five rows at most", r?.rows)
    expect(r && r.rows.some((x) => x.startsWith("community:")) && r.rows.some((x) => x.startsWith("product:")), "products and communities together", r?.rows)
    expect(r && /^(product|community):E/i.test(r.rows[0]) && /^(product|community):E/i.test(r.rows[1]), "names that start with the word first", r?.rows)
    expect(r && r.all && /View all results for .e./.test(r.all), "then View all results for \"e\"", r?.all)
    expect(r && !r.cats, "and no categories", r?.cats)
    expect(r && r.opacity === "1" && r.bg === "rgb(255, 255, 255)", "the panel is solid white once open", r && { opacity: r.opacity, bg: r.bg, anims: r.anims })
    expect(r && r.scrollbar === "thin", "a slim scrollbar", r?.scrollbar)
    expect(r && r.img && r.img.w === "42" && r.img.h === "42" && r.img.box === 42, "pictures have their size set, drawn at it", r?.img)
    expect(r && r.heights.every((h) => h >= 44), "every row at least 44px", r?.heights)
    await shot(p, { path: join(shots, "search-e-1440.png") })
    await p.keyboard.press("ArrowDown")
    await p.keyboard.press("ArrowDown")
    const ad = await p.$eval(FIELD, (i) => ({ ad: i.getAttribute("aria-activedescendant"), role: i.getAttribute("role"), expanded: i.getAttribute("aria-expanded") }))
    expect(ad.ad === "header-search-opt-1" && ad.role === "combobox" && ad.expanded === "true", "the arrows mark a row (aria-activedescendant)", ad)
    await p.keyboard.press("Enter")
    await sleep(300)
    const pushed = await p.evaluate(() => window.__pushed || [])
    expect(pushed.length === 1 && /^\/(community\/|[a-z]+\/)/.test(pushed[0]), "Enter opens the marked row", pushed)
    await p.click(FIELD)
    await p.keyboard.down("Control")
    await p.keyboard.press("KeyA")
    await p.keyboard.up("Control")
    await p.keyboard.type("x")
    await sleep(700)
    await p.keyboard.press("Enter")
    await sleep(300)
    const pushed2 = await p.evaluate(() => window.__pushed || [])
    expect(pushed2.at(-1) === "/explore?q=x", "Enter with no row marked is View all: /explore?q=", pushed2.at(-1))
    await p.close()
  }
  {
    const p = await open(DESK, "path=/help&who=seller&communities=off")
    await p.click(FIELD)
    await p.keyboard.type("e")
    await sleep(900)
    const asked = await p.evaluate(() => window.__fetches.filter((u) => u.startsWith("/api/explore/communities")).length)
    expect(asked === 0, "communities switched off: none asked for", asked)
    await p.close()
  }
}

/* ── 4. The bell's sheet on a phone ───────────────────────────────── */
if (only.includes("bell")) {
  for (const [name, ua] of [["safari", SAFARI], ["chrome", CHROME]]) {
    for (const vp of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
      const tag = `${name}-${vp.width}x${vp.height}`
      console.log(`\nthe bell's sheet, ${tag}`)
      const p = await open({ ...vp, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, "path=/explore&who=buyer&rows=4", { ua, wait: 2400 })
      const pre = await p.evaluate(() => window.__fetches.filter((u) => u.startsWith("/api/notifications/inbox?filter=")).length)
      expect(pre >= 1, "the first page was read before the bell was touched", pre)
      /* Every frame from the tap: is the sheet on screen yet, how many rows does it hold, is a skeleton drawn. */
      await p.evaluate(() => {
        window.__f = []
        window.__run = true
        const tick = (t) => {
          const panel = document.querySelector('[data-sheet-panel]:has([data-notification-panel="sheet"])')
          if (panel) {
            const r = panel.getBoundingClientRect()
            window.__f.push({ t, onScreen: getComputedStyle(panel.closest("[data-sheet-root]")).visibility !== "hidden" && r.top < innerHeight - 1, rows: panel.querySelectorAll("[data-notification-row]").length, skeleton: !!panel.querySelector("[data-bell-loading]") })
          }
          if (window.__run) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      const pt = await visiblePoint(p, "[data-notification-bell]")
      await p.touchscreen.tap(pt.x, pt.y)
      await sleep(900)
      const frames = await p.evaluate(() => { window.__run = false; return window.__f })
      const seen = frames.filter((f) => f.onScreen)
      expect(seen.length > 0 && seen[0].rows === 4, "rows on the first frame the sheet is seen", seen[0])
      expect(seen.every((f) => !f.skeleton), "and no skeleton in any frame", seen.filter((f) => f.skeleton).length)
      const geo = () => p.evaluate(() => {
        const panel = document.querySelector('[data-sheet-panel]:has([data-notification-panel="sheet"])')
        const pr = panel.getBoundingClientRect()
        const rows = [...panel.querySelectorAll("[data-notification-row]")]
        const list = panel.querySelector("[data-bell-list]")
        const lr = list.getBoundingClientRect()
        const lastVisible = rows.filter((r) => r.getBoundingClientRect().top < lr.bottom).at(-1).getBoundingClientRect()
        const cs = getComputedStyle(panel)
        return {
          vh: innerHeight, sheetTop: Math.round(pr.top), sheetBottom: Math.round(pr.bottom), sheetH: Math.round(pr.height),
          gapUnderList: Math.round(pr.bottom - lr.bottom), gapUnderLastRow: Math.round(lr.bottom - lastVisible.bottom),
          scrolls: list.scrollHeight > list.clientHeight + 1, position: cs.position, opacity: cs.opacity, bg: cs.backgroundColor,
          pad: cs.paddingBottom, overflow: document.documentElement.scrollWidth - innerWidth,
        }
      })
      const g = await geo()
      expect(g.sheetBottom === g.vh, "the sheet reaches the bottom of the window", g)
      expect(g.gapUnderLastRow <= 1 && g.gapUnderList <= parseFloat(g.pad) + 1, "no empty space under the last row: only the sheet's own bottom padding", g)
      expect(g.position === "fixed" && Number(g.opacity) < 1 && Number(g.opacity) >= 0.999 && g.bg === "rgb(255, 255, 255)", "the panel is fixed itself, white, a hair under opaque (SAFARI'S FLOATING BAR)", { position: g.position, opacity: g.opacity })
      expect(g.overflow === 0, "nothing scrolls sideways", g.overflow)
      await shot(p, { path: join(shots, `bell-${tag}.png`) })
      /* A browser's bottom bar coming up: the window shrinks under the open sheet. */
      await p.setViewport({ ...vp, height: vp.height - 84, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
      await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      const g2 = await geo()
      expect(g2.sheetBottom === g2.vh && g2.gapUnderLastRow <= 1 && g2.gapUnderList <= parseFloat(g2.pad) + 1, "with the bottom bar up (the window 84px shorter): still at the bottom, still no gap", g2)
      await shot(p, { path: join(shots, `bell-${tag}-bar.png`) })
      await p.close()
    }
  }
  console.log("\nthe bell's sheet with twenty rows, 390x844")
  {
    const p = await open({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, "path=/explore&who=buyer&rows=20", { ua: SAFARI, wait: 2400 })
    const pt = await visiblePoint(p, "[data-notification-bell]")
    await p.touchscreen.tap(pt.x, pt.y)
    await sleep(900)
    const g = await p.evaluate(() => {
      const panel = document.querySelector('[data-sheet-panel]:has([data-notification-panel="sheet"])')
      const pr = panel.getBoundingClientRect()
      const list = panel.querySelector("[data-bell-list]")
      const lr = list.getBoundingClientRect()
      return { vh: innerHeight, sheetTop: Math.round(pr.top), sheetBottom: Math.round(pr.bottom), sheetH: Math.round(pr.height), listBottom: Math.round(lr.bottom), scrolls: list.scrollHeight > list.clientHeight + 1, pad: getComputedStyle(panel).paddingBottom }
    })
    expect(g.sheetH === Math.min(Math.round(0.78 * 844), 640) && g.scrolls, "a long list: the sheet stops at its maximum and the list scrolls inside it", g)
    expect(g.sheetBottom === g.vh && g.sheetBottom - g.listBottom <= parseFloat(g.pad) + 1, "and the list runs to the sheet's foot", g)
    await shot(p, { path: join(shots, "bell-20-rows-390.png") })
    await p.close()
  }
}

await browser.close()
if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
