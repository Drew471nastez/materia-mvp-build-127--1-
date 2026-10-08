/**
 * ===========================================================================
 *  THE SPACE PILL'S FILL, MEASURED (round 16)
 * ===========================================================================
 * The owner: "the pill fill is too direct, it glitches and bumps; make it
 * fill smooth and clean, like the Settings tabs". The real feed
 * (scripts/render-community-shell.tsx ?case=feed) on a 390px phone at 4x
 * CPU. A finger taps a space pill (CDP touch), and every frame records the
 * opacity of the tapped pill's fill, the previous pill's fill, and which
 * list the feed has drawn:
 *
 *   EASES      the new fill passes through several in between values (not
 *              0 one frame, 1 the next), and so does the old one going out
 *   FIRST      the fill's transition has started within two frames of the
 *              tap (read as a running transition: the opacity itself is
 *              eased on the compositor, which a page script cannot sample)
 *   APART      the list is drawn on a later frame than the fill started,
 *              so the fill is already easing while the posts change
 *   SETTLES    after the fill, the pill is ink with white words
 *
 *   node scripts/check-space-pill-fill.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const fonts = interFaces(root)
const stubs = join(root, ".space-pill-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-space-pill-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"

try {
  writeFileSync(join(stubs, "navigation.js"), `import { useSyncExternalStore } from "react"
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: (h, o) => { log("prefetch", h); window.__onPrefetch && window.__onPrefetch(h) }, back: () => log("back"), refresh: () => log("refresh") }
const subscribe = (cb) => { window.addEventListener("probe:path", cb); window.addEventListener("popstate", cb); return () => { window.removeEventListener("probe:path", cb); window.removeEventListener("popstate", cb) } }
const path = () => location.pathname
export const usePathname = () => useSyncExternalStore(subscribe, path, path)
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]); window.__navigate && window.__navigate(href) } } }, children) })
`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() {
  return {
    channel() { const ch = { on() { return ch }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 30); return ch }, track: async () => "ok", presenceState: () => ({}) }; return ch },
    removeChannel() {},
    realtime: { setAuth: async () => {} },
    auth: { getSession: async () => ({ data: { session: { user: { id: "u-me" } } } }), signOut: async () => ({ error: null }) },
  }
}
export const isNativePlatform = () => false
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-shell.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.space-pill-probe/navigation.js", "next/link": "./.space-pill-probe/link.jsx" },
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
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })
  const p = await browser.newPage()
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const url = r.url()
    if (url.startsWith(`${ORIGIN}/api/`)) return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, unread: 0, items: [], conversations: [], communities: [] }) })
    if (url.startsWith(`${ORIGIN}/`)) return void r.respond({ status: 200, contentType: "text/html", body: html })
    if (url.startsWith("data:")) return void r.continue()
    return void r.respond({ status: 204, body: "" })
  })
  await p.goto(`${ORIGIN}/community/clay-studio?case=feed`, { waitUntil: "load" })
  await p.evaluate(() => document.fonts.ready)
  await sleep(1500)
  const cdp = await p.target().createCDPSession()
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })

  const chips = await p.evaluate(() => [...document.querySelectorAll("[data-space-chip]")].map((c) => ({ slug: c.getAttribute("data-space-chip"), on: c.getAttribute("aria-current") === "page", fill: !!c.querySelector("[data-chip-fill]") })))
  expect(chips.length >= 2 && chips.every((c) => c.fill), "every pill carries its fill layer", chips)
  const from = chips.find((c) => c.on)?.slug
  const to = chips.find((c) => !c.on && c.slug !== "all")?.slug ?? chips.find((c) => !c.on)?.slug
  const at = await p.evaluate((slug) => { const b = document.querySelector(`[data-space-chip="${slug}"]`).getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) } }, to)
  await p.screenshot({ path: join(shots, "before.png"), clip: { x: 0, y: 0, width: 390, height: 420 } })

  await p.evaluate((from, to) => {
    window.__frames = []
    window.__run = true
    window.__tap = 0
    addEventListener("touchend", () => { window.__tap = Math.round(performance.now()) }, { capture: true, once: true })
    const el = (slug) => document.querySelector(`[data-space-chip="${slug}"] [data-chip-fill]`)
    const fill = (slug) => Number(getComputedStyle(el(slug)).opacity)
    const tick = () => {
      const o = fill(to)
      /* Started: the pill is chosen and its fill's opacity transition is running (or done), read after the style was resolved. */
      const started = document.querySelector(`[data-space-chip="${to}"]`).getAttribute("aria-current") === "page" && (o > 0 || el(to).getAnimations().length > 0)
      window.__frames.push({ t: Math.round(performance.now()), to: o, started, from: from ? fill(from) : null, list: document.querySelector("[data-community-feed]")?.getAttribute("data-feed-key") ?? null })
      if (window.__run) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, from, to)
  await sleep(120)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: at.x, y: at.y, radiusX: 6, radiusY: 6, force: 1 }] })
  await sleep(60)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await sleep(900)
  const tapAt = await p.evaluate(() => window.__tap)
  const frames = await p.evaluate(() => { window.__run = false; return window.__frames })
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  await p.screenshot({ path: join(shots, "after.png"), clip: { x: 0, y: 0, width: 390, height: 420 } })

  const after = frames.filter((f) => f.t >= tapAt - 40)
  const firstFill = after.findIndex((f) => f.started)
  const listBefore = frames[0]?.list
  const listAt = after.findIndex((f) => f.list !== listBefore)
  const between = after.filter((f) => f.to > 0.05 && f.to < 0.95).length
  const outBetween = after.filter((f) => f.from !== null && f.from > 0.05 && f.from < 0.95).length
  console.log(`  tapped ${to} (from ${from ?? "none"}); frames after the tap: ${after.length}`)
  console.log(`  frames: ${after.slice(0, 14).map((f) => `+${f.t - tapAt}ms ${f.to.toFixed(2)}${f.list !== listBefore ? "*" : ""}`).join(" | ")}`)
  expect(between >= 3, "EASES: the new fill passes through several in between values", { between })
  expect(from == null || outBetween >= 3, "EASES: the old fill fades out over several frames too", { outBetween })
  expect(firstFill >= 0 && firstFill <= 2, "FIRST: the fill has started within two frames of the tap", { firstFill })
  expect(listAt > firstFill, "APART: the list is drawn on a later frame than the fill starts", { firstFill, listAt })
  const settled = await p.evaluate((slug) => { const c = document.querySelector(`[data-space-chip="${slug}"]`); return { fill: getComputedStyle(c.querySelector("[data-chip-fill]")).opacity, color: getComputedStyle(c).color, current: c.getAttribute("aria-current") } }, to)
  expect(settled.fill === "1" && settled.color === "rgb(255, 255, 255)" && settled.current === "page", "SETTLES: the pill is ink with white words", settled)
  expect(errors.length === 0, "no page errors", errors)
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nScreenshots: ${shots}`)
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nall checks passed")
