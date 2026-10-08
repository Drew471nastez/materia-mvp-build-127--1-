/**
 * ===========================================================================
 *  THE COMMUNITY FEED'S PULL TO REFRESH (round 20)
 * ===========================================================================
 * The real feed (scripts/render-community-shell.tsx ?case=feed) on a 390px
 * phone, a finger pulling down from the top (CDP touch events):
 *
 *   FOLLOWS    each move is on the page the moment it is made, not a frame
 *              later (the offset is read straight after the event)
 *   COMPOSITOR let go past the trigger, the page holds open and later goes
 *              back by Web Animations of transform (the compositor's), not by
 *              a loop of main thread writes, and the spokes go with it
 *   ENDS       the page is back where it started, with no transform and no
 *              shift mark, and nothing is left running
 *
 *   node scripts/check-feed-pull.mjs
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
const stubs = join(root, ".feed-pull-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-feed-pull-")), "shots")
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
    alias: { "@": ".", "next/navigation": "./.feed-pull-probe/navigation.js", "next/link": "./.feed-pull-probe/link.jsx" },
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
  await p.evaluate(() => window.scrollTo(0, 0))
  await sleep(300)
  const cdp = await p.target().createCDPSession()
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 4, radiusY: 4, force: 1 }] })
  const offset = () => p.evaluate(() => { const el = document.querySelector("[data-pull-content]"); if (!el) return null; const t = getComputedStyle(el).transform; return t === "none" ? 0 : new DOMMatrixReadOnly(t).m42 })

  const hasContent = await p.evaluate(() => !!document.querySelector("[data-pull-content]"))
  expect(hasContent, "the feed is inside the pull's wrapper", hasContent)
  /* Read in the same event, after the hook's own listener has run (window, bubbling): what the page shows for this move. */
  await p.evaluate(() => {
    window.__sync = []
    window.addEventListener("touchmove", () => {
      const el = document.querySelector("[data-pull-content]")
      const t = el?.style.transform || ""
      const m = /translate3d\(0(?:px)?, ([\d.]+)px/.exec(t)
      window.__sync.push(m ? Number(m[1]) : 0)
    })
  })
  await touch("touchStart", 200, 300)
  for (let i = 1; i <= 14; i++) {
    await touch("touchMove", 200, 300 + i * 12)
    await sleep(16)
  }
  const seen = await p.evaluate(() => window.__sync)
  /* A frame behind, the first move reads 0 here and each read is the move before it. */
  expect(seen.length >= 10 && seen.every((y, i) => y > 0 && (i === 0 || y >= seen[i - 1])), "FOLLOWS: every move is on the page in the same event, not a frame later", seen.map((y) => Math.round(y)))
  await touch("touchEnd", 0, 0)
  await sleep(40)
  const running = await p.evaluate(() => {
    const el = document.querySelector("[data-pull-content]")
    const ring = document.querySelector("[data-ptr-indicator]")
    const props = (x) => (x ? x.getAnimations().map((a) => Object.keys(a.effect?.getKeyframes?.()[0] ?? {}).filter((k) => !["offset", "easing", "composite", "computedOffset"].includes(k)).join("+")) : [])
    return { page: props(el), spokes: props(ring), phase: el.getAttribute("data-ptr-phase") }
  })
  expect(running.page.includes("transform") && running.spokes.some((k) => k.includes("transform")), "COMPOSITOR: the page and the spokes settle by Web Animations of transform", running)
  await sleep(2600)
  const end = await p.evaluate(() => {
    const el = document.querySelector("[data-pull-content]")
    return { transform: getComputedStyle(el).transform, shift: el.getAttribute("data-ptr-shift"), phase: el.getAttribute("data-ptr-phase"), anims: el.getAnimations().length }
  })
  expect(end.transform === "none" && end.shift === null && end.phase === "idle" && end.anims === 0, "ENDS: back where it started, no transform, no shift mark, nothing running", end)
  expect(errors.length === 0, "no page errors", errors)
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nall checks passed")
