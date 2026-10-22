/**
 * ===========================================================================
 *  ROUND 39, LOOKED AT: THE COMMUNITY'S COLUMNS
 * ===========================================================================
 * The owner: "Top contributors should sit in the left side under the main
 * card with the cover, community and things, not right aligned", "on the
 * Chat tab no Top contributors show in the right side", and the list ran off
 * the right edge of the window.
 *
 * The real member frame (scripts/render-community-shell.tsx: shell-frame.tsx,
 * wall.tsx, the feed, the chat through place-views.tsx) in headless Chromium
 * at 1280, 1440 and 1920 wide and on a 390 phone, light and dark. For each:
 *
 *   COLUMNS   the community card on the left, the next event and the top
 *             contributors under it in the same column at the card's width,
 *             no right column, the page beside them
 *   CHAT      the same left column, no right column, the chat wider than the
 *             feed's old middle column
 *   FIT       nothing in the frame reaches past the window's right edge and
 *             the page never scrolls sideways
 *   PHONE     one column, no side cards, nothing wider than the screen
 *
 * Pictures go to SHOTS_DIR (.round39-shots by default), one per case, width
 * and look, to be looked at. BEFORE=1 prints the numbers without checks (for
 * a run on the code before this round).
 *
 *   PROBE_CSS=source node scripts/check-community-round39.mjs
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { createRequire } from "node:module"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const BEFORE = !!process.env.BEFORE
const require = createRequire(join(root, "package.json"))
/* node_modules is this checkout's or, in a worktree, the one Node finds above it. */
const swiperDir = dirname(realpathSync(require.resolve("swiper/package.json")))
const modules = dirname(swiperDir)
const css = await appCss(root)
const fonts = interFaces(root) || interFaces(dirname(modules))
const themeCss = readFileSync(join(root, "app/theme-dark.css"), "utf8")
const swiperCss = existsSync(join(swiperDir, "swiper.css")) ? readFileSync(join(swiperDir, "swiper.css"), "utf8") : ""
const stubs = join(root, ".community-round39-probe")
const shots = process.env.SHOTS_DIR || join(root, ".round39-shots")
mkdirSync(shots, { recursive: true })
mkdirSync(stubs, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  if (BEFORE) return console.log(`  ....  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"

try {
  writeFileSync(join(stubs, "navigation.js"), `import { startTransition, useEffect, useState } from "react"
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: (h) => log("prefetch", h), back: () => log("back"), refresh: () => log("refresh") }
export const usePathname = () => {
  const [p, setP] = useState(location.pathname)
  useEffect(() => {
    const on = () => startTransition(() => setP(location.pathname))
    window.addEventListener("popstate", on)
    return () => window.removeEventListener("popstate", on)
  }, [])
  return p
}
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) e.preventDefault() } }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined }) }
`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() {
  const ch = { on() { return ch }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 30); return ch }, track: async () => "ok", presenceState: () => ({}), send: async () => "ok" }
  return { channel() { return ch }, removeChannel() {}, realtime: { setAuth: async () => {} }, storage: { from() { return { upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) } } }, auth: { getSession: async () => ({ data: { session: { user: { id: "u-me" } } } }), getUser: async () => ({ data: { user: null } }), signOut: async () => ({ error: null }) } }
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
    alias: { "@": ".", "next/navigation": "./.community-round39-probe/navigation.js", "next/link": "./.community-round39-probe/link.jsx", "next/image": "./.community-round39-probe/image.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "member.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [modules],
  })
  const js = readFileSync(join(stubs, "member.js"), "utf8")
  const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}${css}</style><style>${themeCss}</style><style>${swiperCss}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], protocolTimeout: 240_000 })
  const WIDTHS = [
    { name: "1280", vp: { width: 1280, height: 800, deviceScaleFactor: 1 } },
    { name: "1440", vp: { width: 1440, height: 900, deviceScaleFactor: 1 } },
    { name: "1920", vp: { width: 1920, height: 1080, deviceScaleFactor: 1 } },
  ]
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }

  async function open(path, vp) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`)) {
        const short = url.replace(ORIGIN, "")
        let body = {}
        if (short.endsWith("/presence")) body = { ok: true, ready: true }
        else if (short.startsWith("/api/notifications")) body = { unread: 0, items: [], nextCursor: null, available: true }
        else if (short.includes("/dms")) body = { ready: true, unread: 0, conversations: [] }
        else if (short.includes("/messages")) body = { messages: [], hasMore: false }
        else if (short.startsWith("/api/me/places")) body = { signedIn: true, communitiesOn: true, isCreator: false, hasSellerAccess: true, recent: [] }
        return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
      }
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: page })
      if (url.startsWith("data:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(900)
    return { p, errors }
  }
  const goDark = async (p) => {
    await p.evaluate(() => {
      const b = document.querySelector("[data-appearance-button]")
      if (b) b.click()
    })
    await sleep(700)
  }
  /* The frame's boxes, and anything in it that reaches past the window's right edge. */
  const facts = (p) =>
    p.evaluate(() => {
      const box = (sel) => {
        const el = document.querySelector(sel)
        if (!el) return null
        const b = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right), shown: cs.display !== "none" && b.width > 0 && b.height > 0 }
      }
      const vw = document.documentElement.clientWidth
      const past = []
      for (const el of document.querySelectorAll("[data-community-shell] *")) {
        const b = el.getBoundingClientRect()
        if (b.width === 0 || b.height === 0) continue
        if (el.closest("[data-community-tabs-track], [data-space-chips], [aria-hidden=true], [data-sticky-chips]")) continue
        const cs = getComputedStyle(el)
        if (cs.visibility === "hidden" || cs.position === "fixed") continue
        if (b.right > vw + 0.5) past.push({ el: `${el.tagName.toLowerCase()}${[...el.attributes].filter((a) => a.name.startsWith("data-")).map((a) => `[${a.name}]`).join("")}`, right: Math.round(b.right) })
      }
      const contributors = box("[data-wall-contributors]")
      const inLeft = !!document.querySelector("[data-community-left] [data-wall-contributors]")
      const inRight = !!document.querySelector("[data-community-right] [data-wall-contributors]")
      return {
        vw,
        scrollW: document.documentElement.scrollWidth,
        left: box("[data-community-left]"),
        card: box("[data-wall-card]"),
        main: box("[data-community-main]"),
        right: box("[data-community-right]"),
        upcoming: box("[data-wall-upcoming]"),
        contributors,
        inLeft,
        inRight,
        chat: box("[data-chat]"),
        past: past.slice(0, 6),
      }
    })

  const CASES = [
    ["feed", "/community/clay-studio?case=feed"],
    ["chat", "/community/clay-studio/space/kiln-room?case=chat"],
    ["members", "/community/clay-studio/members?case=members"],
    ["leaderboard", "/community/clay-studio/leaderboard?case=leaderboard"],
  ]
  const feedMain = {}
  for (const { name, vp } of WIDTHS) {
    console.log(`\n${name} wide`)
    for (const [kind, path] of CASES) {
      const { p, errors } = await open(path, vp)
      const f = await facts(p)
      await p.screenshot({ path: join(shots, `${kind}-${name}-light.png`) })
      await goDark(p)
      await p.screenshot({ path: join(shots, `${kind}-${name}-dark.png`) })
      const f2 = await facts(p)
      if (kind === "feed") feedMain[name] = f.main?.w ?? 0
      expect(f.scrollW <= f.vw && f.past.length === 0 && f2.past.length === 0, `${kind}: nothing past the window's right edge (scroll ${f.scrollW} of ${f.vw})`, f.past.length ? f.past : undefined)
      expect(!!f.left?.shown && !!f.card?.shown, `${kind}: the community card is on the left`, f.left)
      expect(!f.right?.shown, `${kind}: no right column`, f.right)
      if (kind !== "leaderboard") {
        expect(f.inLeft && !f.inRight && !!f.contributors?.shown, `${kind}: Top contributors in the left column`, { contributors: f.contributors, inLeft: f.inLeft, inRight: f.inRight })
        expect(!!f.contributors && !!f.card && f.contributors.w === f.card.w && f.contributors.x === f.card.x && f.contributors.y > f.card.y, `${kind}: under the card, at its width`, { card: f.card, contributors: f.contributors })
      } else {
        expect(!f.contributors, "leaderboard: no Top contributors beside the leaderboard itself", f.contributors)
      }
      if (f.upcoming) expect(f.upcoming.x === f.card.x && f.upcoming.w === f.card.w, `${kind}: the next event under the card too`, f.upcoming)
      expect(!!f.main && !!f.left && f.main.x >= f.left.right + 16, `${kind}: the page beside the left column`, { left: f.left, main: f.main })
      if (kind === "chat") {
        expect(!!f.chat && f.chat.w > 760, "chat: the chat takes the room the right column had", f.chat)
        expect(!!f.chat && f.chat.right <= f.vw - 24, "chat: and stops inside the frame's own margin", f.chat)
      }
      expect(errors.length === 0, `${kind}: no page errors`, errors)
      await p.close()
    }
  }

  console.log("\n390 phone")
  for (const [kind, path] of CASES) {
    const { p, errors } = await open(path, PHONE)
    const f = await facts(p)
    await p.screenshot({ path: join(shots, `${kind}-390-light.png`) })
    await goDark(p)
    await p.screenshot({ path: join(shots, `${kind}-390-dark.png`) })
    expect(f.scrollW <= f.vw && f.past.length === 0, `${kind}: nothing wider than the phone (scroll ${f.scrollW} of ${f.vw})`, f.past.length ? f.past : undefined)
    expect(!f.left?.shown && !f.right?.shown, `${kind}: one column, no side cards`, { left: f.left, right: f.right })
    expect(errors.length === 0, `${kind}: no page errors`, errors)
    await p.close()
  }
  /*
    PERF: the frame drawn from nothing (the probe's page is client rendered, so this is the frame's own work, not the
    server's: scripts/measure-community-member-server.mjs has that), at full speed and with the CPU slowed four times,
    at 1440 and on the phone. Time to the first post (or chat message) on screen, the layout's shifts after the first
    paint (CLS, every shift counted), and the main thread's long tasks.
  */
  console.log("\nPERF: the frame from nothing, 1x and 4x CPU")
  const perf = []
  for (const [kind, path, sel] of [["feed", "/community/clay-studio?case=feed", "[data-post]"], ["chat", "/community/clay-studio/space/kiln-room?case=chat", "[data-chat-message]"], ["members", "/community/clay-studio/members?case=members", "[data-members] a, [data-members] li"]]) {
    for (const [vpName, vp] of [["1440", { width: 1440, height: 900, deviceScaleFactor: 1 }], ["390", PHONE]]) {
      for (const rate of [1, 4]) {
        const p = await browser.newPage()
        await p.setViewport(vp)
        const cdp = await p.target().createCDPSession()
        await cdp.send("Emulation.setCPUThrottlingRate", { rate })
        await p.evaluateOnNewDocument((sel) => {
          window.__perf = { cls: 0, shifts: [], long: 0, first: null }
          new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__perf.cls += e.value; window.__perf.shifts.push({ t: Math.round(e.startTime), v: +e.value.toFixed(4), who: (e.sources || []).map((s) => s.node && s.node.nodeType === 1 ? s.node.tagName.toLowerCase() + [...s.node.attributes].filter((a) => a.name.startsWith("data-")).map((a) => `[${a.name}]`).join("") : "").slice(0, 3) }) } }).observe({ type: "layout-shift", buffered: true })
          new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.long += e.duration }).observe({ type: "longtask", buffered: true })
          const look = () => { const el = document.querySelector(sel); const r = el?.getBoundingClientRect(); if (r && r.height > 0 && r.top < innerHeight) { window.__perf.first = Math.round(performance.now()); return } requestAnimationFrame(look) }
          requestAnimationFrame(look)
        }, sel)
        const { p: pp, errors } = await (async () => {
          const errors = []
          p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
          await p.setRequestInterception(true)
          p.on("request", (r) => {
            const url = r.url()
            if (url.startsWith(`${ORIGIN}/api/`)) return void r.respond({ status: 200, contentType: "application/json", body: url.includes("/messages") ? JSON.stringify({ messages: [], hasMore: false }) : "{}" })
            if (url.startsWith(`${ORIGIN}/`)) return void r.respond({ status: 200, contentType: "text/html", body: page })
            if (url.startsWith("data:")) return void r.continue()
            return void r.respond({ status: 204, body: "" })
          })
          await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
          await sleep(rate === 4 ? 3000 : 1500)
          return { p, errors }
        })()
        const m = await pp.evaluate(() => window.__perf)
        perf.push({ kind, vp: vpName, cpu: `${rate}x`, firstMs: m.first, cls: +m.cls.toFixed(4), longMs: Math.round(m.long), shifts: m.shifts.slice(0, 4) })
        console.log(`  ${kind.padEnd(8)} ${vpName.padEnd(5)} ${rate}x   first ${String(m.first).padStart(5)}ms   CLS ${m.cls.toFixed(4)}   long tasks ${Math.round(m.long)}ms${m.shifts.length ? `   shifts ${JSON.stringify(m.shifts.slice(0, 3))}` : ""}`)
        if (!BEFORE) expect(m.cls < 0.02, `${kind} ${vpName} ${rate}x: the frame does not shift once drawn`, m.cls)
        if (errors.length) console.log(`    page errors: ${JSON.stringify(errors)}`)
        await pp.close()
      }
    }
  }
  if (process.env.PERF_JSON) writeFileSync(process.env.PERF_JSON, JSON.stringify(perf, null, 2))

  console.log(`\n  feed's column: ${JSON.stringify(feedMain)}`)
  console.log(`  pictures: ${shots}`)
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

console.log(BEFORE ? "\n(before: numbers only)" : broken ? `\n${broken} failed` : "\nall ok")
process.exit(BEFORE ? 0 : broken ? 1 : 0)
