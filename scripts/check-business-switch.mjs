/**
 * ===========================================================================
 *  SWITCHING BUSINESS, EVERY FRAME, FROM THE PRESS TO THE NEW /app
 * ===========================================================================
 * "When I switch between businesses, in the Storelib menu when I click, a
 * loading state, switching, with multi step text changing until it loads,
 * very smooth clean loading state, and then it switches. And when I appear
 * in the new /app make sure the elements appear smoothly, not bad."
 *
 * The real /app wrapper, the real AppSidebar with its account dropdown and
 * phone sheet, the real switcher and switch screen, and the real switch
 * client (scripts/render-business-switch-tree.tsx). The old business's /app
 * is drawn in the browser; the press asks the probe's server to switch
 * (SWITCH_MS), the browser loads the new business's /app as a document
 * (the server takes DOC_MS, its script JS_MS), and that HTML is the tree
 * rendered on the server with the arrival screen when the switch's cookie
 * came, as app/app/layout.tsx does. The new business's photo and page
 * picture come PHOTO_MS late, its chart's figures FIGURES_MS after its
 * script runs.
 *
 * Recorded twice, across the reload: the compositor's own frames (a
 * screencast, read pixel by pixel) and one DOM reading per animation frame
 * in each document.
 *
 *   UP AT ONCE        the screen is showing within two frames of the press
 *   THE LINES         "Switching to", then "Opening ...'s store", each change
 *                     a fade through several part-way frames; the new
 *                     document opens on the line the old one ended on
 *   THE SPINNER       turns on across the reload, not back to twelve
 *   NEVER NOTHING     no frame, from the press to the end, that is white,
 *                     empty, or the cold start's bare spinner: always the old
 *                     page, the screen, or the new page
 *   READY FIRST       the screen starts to go only once the new page is
 *                     there, its chart answered and its pictures decoded;
 *                     the hand over is one fade through part-way frames
 *   STILL             no layout shift in the new document
 *   CHEAP             what moves in the screen and the page moves on
 *                     opacity, transform or translate only
 *   CLEARED           the cookie is gone once the screen is
 *   A FAILED SWITCH   (390, 1280) the screen goes, the menu says why, and
 *                     the page is still the old business
 *   REDUCED MOTION    (390) the same, with no movement on the lines
 *
 *   node scripts/check-business-switch.mjs
 *   WIDTHS=360,390,430,1280,1440   the widths (these by default)
 *   SHOTS=<dir>                    pictures of the frames that matter
 *   CPU=4                          the phone's slowdown (a computer runs at 1)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const WIDTHS = (process.env.WIDTHS || "360,390,430,1280,1440").split(",").map(Number)
const SHOTS = process.env.SHOTS || null
const CPU = Number(process.env.CPU || 4)
const SWITCH_MS = 350
const DOC_MS = 700
const JS_MS = 250
const PHOTO_MS = 500
const FIGURES_MS = 600
const NEW_NAME = "Lind Studio"
const NEW_PHOTO = "/photos/studio.png"
const OLD_NAME = "Mara Lind"
const NEW_ID = "00000000-0000-4000-8000-00000000000b"
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

/* ── Bundles ────────────────────────────────────────────────────────────── */

const dir = join(root, ".business-switch-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `const here = () => (typeof location === "undefined" ? "/app" : location.pathname)
const router = { push(h) { location.href = h }, replace(h) { location.replace(h) }, prefetch() {}, refresh() {}, back() { history.back() }, forward() {} }
export const usePathname = () => here()
export const useSearchParams = () => new URLSearchParams(typeof location === "undefined" ? "" : location.search)
export const useRouter = () => router
export const useParams = () => ({})
export const useSelectedLayoutSegment = () => null
export const useSelectedLayoutSegments = () => []
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, replace, scroll, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(dir, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : q, apply: () => q })
const auth = {
  getUser: async () => ({ data: { user: { id: "u", user_metadata: {} } } }),
  getSession: async () => ({ data: { session: { access_token: "probe" } } }),
  setSession: async () => { await new Promise((r) => setTimeout(r, 30)); return { data: {}, error: null } },
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  signOut: async () => ({}),
}
export function createClient() { return { auth, from: () => q, rpc: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)
const ALIASES = [
  `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
  `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
  `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl",
]
const bundle = (entry, out, extra) => {
  try {
    execFileSync("npx", ["--no-install", "esbuild", entry, "--bundle", "--jsx=automatic", "--log-level=error", `--outfile=${out}`, '--define:process.env.NODE_ENV="production"', ...ALIASES, ...extra], { stdio: ["ignore", "ignore", "inherit"] })
  } catch {
    rmSync(dir, { recursive: true, force: true })
    fail(`${entry} did not bundle. The error above is esbuild's.`)
  }
  return readFileSync(out)
}
const clientJs = bundle(join(root, "scripts/render-business-switch.tsx"), join(dir, "client.js"), [
  "--format=iife", "--platform=browser",
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
])
bundle(join(root, "scripts/render-business-switch-ssr.tsx"), join(dir, "ssr.cjs"), ["--format=cjs", "--platform=node"])
const ssr = JSON.parse(execFileSync("node", [join(dir, "ssr.cjs"), NEW_NAME, NEW_PHOTO], { encoding: "utf8", maxBuffer: 64 << 20 }))
rmSync(dir, { recursive: true, force: true })

const css = `${await appCss(root)}\n${interFaces(root).replace(/url\(file:\/\//g, "url(/__font?p=")}`
/* The stylesheet as a file, as the app sends it (render blocking, cached after the first page), not inlined: a megabyte of <style> parsed inside the document is parser time the real page never spends. */
const HEAD = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/app.css">`
/* The root layout's <html> and <body> (app/layout.tsx). */
const BODY = `class="font-sans antialiased bg-background text-foreground"`
const oldHtml = `<!doctype html><html lang="en" class="light" style="color-scheme:light"><head>${HEAD}</head><body ${BODY}><div id="app"></div><script src="/client.js"></script></body></html>`
const newHtml = (arriving) => `<!doctype html><html lang="en" class="light" style="color-scheme:light"><head>${HEAD}<script>window.__arriving=${JSON.stringify(arriving)}</script></head>` +
  `<body ${BODY}><div id="app">${arriving ? ssr.arriving : ssr.plain}</div><script src="/client.js?doc=app" defer></script></body></html>`

/* ── The browser, the pictures, the server ──────────────────────────────── */

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
async function pngOf(color) {
  const p = await browser.newPage()
  const data = await p.evaluate((c) => { const k = document.createElement("canvas"); k.width = k.height = 192; const g = k.getContext("2d"); g.fillStyle = c; g.fillRect(0, 0, 192, 192); g.fillStyle = "#fff"; g.beginPath(); g.arc(96, 80, 36, 0, 7); g.fill(); return k.toDataURL("image/png") }, color)
  await p.close()
  return Buffer.from(data.split(",")[1], "base64")
}
const photos = { "mara.png": await pngOf("#b5452a"), "studio.png": await pngOf("#0b6e4f"), "old-product.png": await pngOf("#6d4c27"), "new-product.png": await pngOf("#27496d") }

let mode = "ok"
const seen = { switchBody: null, cookie: null }
const server = createServer((req, res) => {
  const u = new URL(req.url, "http://probe")
  const send = (status, type, body, headers = {}) => { res.writeHead(status, { "content-type": type, "cache-control": "no-store", ...headers }); res.end(body) }
  if (u.pathname.startsWith("/__font")) {
    const file = decodeURIComponent(u.searchParams.get("p") || "")
    if (!/\/\.next\/static\/media\/[\w.-]+\.woff2$/.test(file) || !existsSync(file)) return send(404, "text/plain", "")
    return send(200, "font/woff2", readFileSync(file), { "cache-control": "max-age=3600" })
  }
  if (u.pathname === "/app.css") return send(200, "text/css", css, { "cache-control": "max-age=3600" })
  if (u.pathname === "/client.js") return setTimeout(() => send(200, "text/javascript", clientJs), u.searchParams.get("doc") ? JS_MS : 0)
  const src = u.pathname === "/_next/image" ? new URL(u.searchParams.get("url") || "/", "http://probe").pathname : u.pathname
  const photo = src.match(/^\/photos\/([\w-]+\.png)$/)
  /* Cached as the image optimizer and storage answer them: a photo fetched once is not fetched again. */
  if (photo && photos[photo[1]]) return setTimeout(() => send(200, "image/png", photos[photo[1]], { "cache-control": "public, max-age=3600" }), /studio|new-/.test(photo[1]) ? PHOTO_MS : 0)
  if (u.pathname === "/api/businesses/switch" && req.method === "POST") {
    const chunks = []
    req.on("data", (c) => chunks.push(c))
    req.on("end", () => {
      try { seen.switchBody = JSON.parse(Buffer.concat(chunks).toString()) } catch { seen.switchBody = null }
      setTimeout(() => {
        if (mode === "fail") return send(403, "application/json", JSON.stringify({ error: "That business is not yours to open." }))
        send(200, "application/json", JSON.stringify({ session: { access_token: "a", refresh_token: "r" } }))
      }, SWITCH_MS)
    })
    return
  }
  if (u.pathname === "/api/figures") return setTimeout(() => send(200, "application/json", JSON.stringify({ figures: ["860", "$1,240", "18", "2.1%"] })), FIGURES_MS)
  if (u.pathname.startsWith("/api/")) return send(200, "application/json", "{}")
  if (u.pathname === "/app") {
    /* As app/app/layout.tsx reads it (lib/businesses/switch-screen readSwitchCookie). */
    const raw = /(?:^|;\s*)storelib_switching=([^;]*)/.exec(req.headers.cookie || "")?.[1]
    let arriving = null
    try {
      const value = raw ? decodeURIComponent(raw) : null
      const at = value ? value.indexOf("\n") : -1
      arriving = value ? { name: at === -1 ? value : value.slice(0, at), photo: at === -1 ? null : value.slice(at + 1) } : null
    } catch { arriving = null }
    seen.cookie = arriving
    return setTimeout(() => send(200, "text/html", newHtml(arriving)), DOC_MS)
  }
  if (u.pathname === "/") return send(200, "text/html", oldHtml)
  send(404, "text/plain", "")
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

/* ── Reading ────────────────────────────────────────────────────────────── */

/* One reading per animation frame in every document of the tab, from its very first. */
const RECORDER = `(() => {
  const doc = location.pathname
  let shift = 0
  const long = []
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) shift += e.value }).observe({ type: "layout-shift", buffered: true }) } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) long.push([Math.round(performance.timeOrigin + e.startTime), Math.round(e.duration)]) }).observe({ type: "longtask", buffered: true }) } catch {}
  document.addEventListener("click", (e) => {
    if (e.target.closest && e.target.closest('[data-business-row="other"]')) window.__probeRec({ press: performance.timeOrigin + performance.now() })
  }, true)
  const angleOf = (el) => {
    const m = getComputedStyle(el).transform
    if (!m || m === "none") return 0
    const [a, b] = m.slice(m.indexOf("(") + 1, -1).split(",").map(Number)
    return (Math.atan2(b, a) * 180 / Math.PI + 360) % 360
  }
  const SKIP = new Set(["offset", "computedOffset", "easing", "composite"])
  const shown = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map((n) => Math.round(n * 10) / 10) }
  /* What the black bar shows: the screen's still bar while the screen is mostly up, the real header otherwise. */
  function barOf(scr) {
    if (scr && +getComputedStyle(scr).opacity >= 0.5) {
      const bar = Array.from(scr.querySelectorAll("[data-still-bar]")).find(shown)
      if (!bar) return { still: true, name: null, photo: null }
      const img = bar.querySelector("[data-still=avatar] img")
      return { still: true, name: (bar.querySelector("[data-still=name]") || {}).textContent || null, photo: img ? img.complete && img.naturalWidth > 0 : null }
    }
    const phone = document.getElementById("account-trigger")
    const trigger = shown(phone) ? phone : Array.from(document.querySelectorAll("header[data-shell-chrome] button")).find(shown)
    const img = trigger && trigger.querySelector("[data-app-avatar] img")
    return { still: false, name: trigger ? ((trigger.querySelector("span.truncate") || {}).textContent || null) : null, photo: img ? img.complete && img.naturalWidth > 0 && +getComputedStyle(img).opacity > 0.99 : null }
  }
  /* Where each piece of the bar is: the still one (once, while the screen is whole) and the real one (once, after the screen has gone). */
  function stillGeo(scr) {
    const bar = Array.from(scr.querySelectorAll("[data-still-bar]")).find(shown)
    if (!bar) return null
    const q = (k) => bar.querySelector("[data-still=" + k + "]")
    const svg = (k) => q(k) && (q(k).tagName.toLowerCase() === "svg" ? q(k) : q(k).querySelector("svg"))
    const g = { avatar: box(q("avatar")), name: box(q("name")), chevron: box(q("chevron")) }
    if (bar.dataset.stillBar === "phone") Object.assign(g, { explore: box(svg("explore")), bell: box(svg("bell")) })
    else Object.assign(g, { search: box(q("search")), compass: box(svg("compass")), bell: box(svg("bell")), settings: box(svg("settings")), logo: box(q("logo") && q("logo").querySelector("img")) })
    return g
  }
  function realGeo() {
    const phone = document.getElementById("account-trigger")
    if (shown(phone)) {
      const svgs = phone.querySelectorAll("svg")
      return {
        avatar: box(phone.querySelector("[data-app-avatar]")), name: box(phone.querySelector("span.truncate")), chevron: box(svgs[svgs.length - 1]),
        explore: box(document.querySelector('button[aria-label="Explore"] svg')), bell: box(Array.from(document.querySelectorAll('button[aria-label="Notifications"] svg')).find(shown)),
      }
    }
    const header = Array.from(document.querySelectorAll("header[data-shell-chrome]")).find(shown)
    if (!header) return null
    const trigger = header.querySelector("button")
    const svgs = trigger.querySelectorAll("svg")
    return {
      avatar: box(trigger.querySelector("[data-app-avatar]")), name: box(trigger.querySelector("span.truncate")), chevron: box(svgs[svgs.length - 1]),
      search: box(header.querySelector('button[aria-label="Search"]')), compass: box(header.querySelector('a[title="Discover"] svg')), bell: box(header.querySelector('button[title="Notifications"] svg')),
      settings: box(header.querySelector('a[title="Settings"] svg')), logo: box(header.querySelector('a[href="/app"] img')),
    }
  }
  let geoStill = null, geoReal = null, goneFrames = 0
  function tick() {
    const scr = document.querySelector("[data-business-switch-screen]")
    const lines = scr ? Array.from(scr.querySelectorAll("[data-switch-line]")).map((p) => { const cs = getComputedStyle(p); return { text: p.textContent, o: Math.round(+cs.opacity * 1000) / 1000, tr: cs.translate } }) : []
    const spin = scr && scr.querySelector(".activity-spinner")
    const anims = []
    for (const a of document.getAnimations()) {
      const t = a.effect && a.effect.target
      if (!t || a.playState !== "running") continue
      if (!(scr && scr.contains(t)) && !(t.closest && t.closest(".app-content-scroll"))) continue
      if (a.transitionProperty) anims.push(a.transitionProperty)
      else for (const k of a.effect.getKeyframes()) for (const p of Object.keys(k)) if (!SKIP.has(p)) anims.push(p)
    }
    const app = document.getElementById("app")
    const neu = document.querySelector('[data-probe-page="new"]')
    if (scr && !geoStill && +getComputedStyle(scr).opacity >= 0.999) geoStill = stillGeo(scr)
    if (!scr && neu && doc === "/app" && ++goneFrames > 3 && !geoReal) geoReal = realGeo()
    window.__probeRec({
      bar: barOf(scr), geoStill, geoReal,
      t: performance.timeOrigin + performance.now(), doc,
      parsed: !!(app && app.firstElementChild),
      screen: scr ? Math.round(+getComputedStyle(scr).opacity * 1000) / 1000 : null,
      step: scr ? scr.dataset.step : null, lines, angle: spin ? angleOf(spin) : null,
      old: !!document.querySelector('[data-probe-page="old"]'), neu: !!neu,
      cold: Array.from(document.querySelectorAll("[data-app-cold-start]")).filter((el) => !(scr && scr.contains(el))).length,
      busy: document.querySelectorAll('[data-probe-page] [aria-busy="true"]').length,
      pictures: neu ? Array.from(document.images).filter((i) => /\\/photos\\//.test(i.src) && i.getBoundingClientRect().width > 0).map((i) => i.complete && i.naturalWidth > 0) : [],
      anims: Array.from(new Set(anims)), shift, long: long.slice(),
      alert: (document.querySelector('[data-business-switcher] [role="alert"]') || {}).textContent || null,
      cookie: document.cookie.includes("storelib_switching="),
      paints: performance.getEntriesByType("paint").map((p) => [p.name, Math.round(performance.timeOrigin + p.startTime)]),
      origin: Math.round(performance.timeOrigin),
    })
    requestAnimationFrame(tick)
  }
  /* No frame asked for while the document is still being parsed: a
     requestAnimationFrame there makes the browser draw whatever it has
     parsed so far (a white page, measured), which a real page with no such
     loop in its <head> is never made to do, and the probe would be
     measuring itself. So the readings start once the page has drawn its
     first element; what the glass showed before that is the screencast's to
     say, and it is read for white and empty frames all the same. Nothing
     of the probe's runs while the document is parsed (a timer or a
     MutationObserver there was measured making the parser stop and the
     browser draw, twice as often and three times as long): the readings
     start when parsing ends, before the page's own script. */
  if (document.readyState !== "loading") requestAnimationFrame(tick)
  else document.addEventListener("readystatechange", () => requestAnimationFrame(tick), { once: true })
})()`

/* A blank page whose canvas reads a frame, so the probe needs no image library. */
const reader = await browser.newPage()
await reader.evaluate(() => {
  window.readFrame = async (png, o) => {
    const img = new Image()
    img.src = `data:image/png;base64,${png}`
    await img.decode()
    const c = document.createElement("canvas")
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const g = c.getContext("2d", { willReadFrequently: true })
    g.drawImage(img, 0, 0)
    const { data, width } = g.getImageData(0, 0, c.width, c.height)
    const k = width / o.W
    const px = (x, y) => (Math.round(y * k) * width + Math.round(x * k)) * 4
    let white = 0, all = 0
    for (let y = 0; y < o.H; y += 6) for (let x = 0; x < o.W; x += 6) {
      const i = px(x, y)
      all++
      if (data[i] >= 250 && data[i + 1] >= 250 && data[i + 2] >= 250) white++
    }
    /* The content area: whatever is not its own grey (#f8f9fa), white, or the header's black showing through a corner. */
    let ink = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1
    for (let y = o.HEADER + 24; y < o.H - 2; y += 2) for (let x = o.RAIL + 2; x < o.W - 2; x += 2) {
      const i = px(x, y)
      const r = data[i], gg = data[i + 1], b = data[i + 2]
      if (Math.abs(r - 248) <= 3 && Math.abs(gg - 249) <= 3 && Math.abs(b - 250) <= 3) continue
      if (r >= 252 && gg >= 252 && b >= 252) continue
      ink++
      if (x < x0) x0 = x
      if (y < y0) y0 = y
      if (x > x1) x1 = x
      if (y > y1) y1 = y
    }
    /* The black bar: whatever in it is not the bar's own colour (the photo, the name, the icons). An empty band has none. */
    let barInk = 0
    for (let y = 2; y < o.HEADER - 4; y += 2) for (let x = 2; x < o.W - 2; x += 2) {
      const i = px(x, y)
      if (Math.max(Math.abs(data[i] - o.BAR[0]), Math.abs(data[i + 1] - o.BAR[1]), Math.abs(data[i + 2] - o.BAR[2])) > 40) barInk++
    }
    return { white: white / all, ink, w: ink ? x1 - x0 : 0, h: ink ? y1 - y0 : 0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, barInk }
  }
})
const kindOf = (f) => {
  if (f.white > 0.97) return "white"
  if (f.ink === 0) return "blank"
  if (f.w <= 40 && f.h <= 40) return "spinner"
  if (f.w <= 330 && f.h <= 96) return "screen"
  return "page"
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const problems = []
const summary = []
const expect = (ok, what, detail) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${detail ? `: ${detail}` : ""}`)
  if (!ok) problems.push(`${what}${detail ? ` (${detail})` : ""}`)
}
const ms = (n) => `${Math.round(n)}ms`
const partWay = (o) => o > 0.04 && o < 0.96
const topLine = (r) => {
  const l = r.lines.filter((x) => x.o > 0.5)
  return l.length ? l[l.length - 1].text : r.lines.length ? r.lines[r.lines.length - 1].text : null
}
const ALLOWED = new Set(["opacity", "transform", "translate"])

async function run(W, { scenario = "switch", reduced = false } = {}) {
  const phone = W < 768
  const H = phone ? 844 : 900
  const o = { W, H, HEADER: phone ? 68 : 58, RAIL: phone ? 0 : 240, BAR: phone ? [17, 17, 17] : [19, 19, 22] }
  mode = scenario === "fail" ? "fail" : "ok"
  seen.switchBody = null
  seen.cookie = null
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  await page.setViewport(phone ? { width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: W, height: H, deviceScaleFactor: 1 })
  if (reduced) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  const recs = []
  let press = null
  await page.exposeFunction("__probeRec", (r) => { if (r.press) press = r.press; else recs.push(r) })
  await page.evaluateOnNewDocument(RECORDER)
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e.message || e)))
  await page.goto(`${base}/`)
  await page.waitForSelector('[data-probe-page="old"]')
  await wait(400)

  /* Open the account menu and the list of businesses in it. */
  const visible = (sel) => page.evaluateHandle((s) => Array.from(document.querySelectorAll(s)).find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" }) || null, sel)
  if (phone) await (await visible("#account-trigger")).click()
  else await (await visible("header[data-shell-chrome] button")).click()
  await wait(phone ? 600 : 300)
  await (await visible('[data-business-row="current"]')).click()
  await wait(400)
  const cdp = await page.createCDPSession()
  if (phone && CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU })
  const shots = []
  cdp.on("Page.screencastFrame", (f) => {
    shots.push({ at: f.metadata.timestamp ? f.metadata.timestamp * 1000 : Date.now(), data: f.data })
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 })
  await wait(150)
  const other = await visible('[data-business-row="other"]')
  if (!other.asElement()) { await ctx.close(); problems.push(`at ${W}: no other business to press`); return }
  await other.click()

  if (scenario === "fail") {
    for (let i = 0; i < 60; i++) {
      await wait(100)
      const done = await page.evaluate(() => !document.querySelector("[data-business-switch-screen]") && !!document.querySelector('[data-business-switcher] [role="alert"]')).catch(() => false)
      if (done) break
    }
    await wait(400)
  } else {
    for (let i = 0; i < 150; i++) {
      await wait(100)
      const done = await page.evaluate(() => location.pathname === "/app" && !!document.querySelector('[data-probe-page="new"]') && !document.querySelector("[data-business-switch-screen]")).catch(() => false)
      if (done) break
    }
    await wait(600)
  }
  await cdp.send("Page.stopScreencast").catch(() => {})
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 }).catch(() => {})
  const where = await page.evaluate(() => location.pathname)
  await ctx.close()

  const label = `${W}${scenario === "fail" ? " failed" : ""}${reduced ? " reduced motion" : ""}`
  console.log(`\n${label}`)
  if (press == null) { expect(false, "the press was recorded"); return }
  const after = recs.filter((r) => r.t >= press)
  const A = after.filter((r) => r.doc === "/")
  const B = after.filter((r) => r.doc === "/app")
  const frames = []
  for (const s of shots.filter((s) => s.at >= press - 20)) frames.push({ ...(await reader.evaluate((png, o) => window.readFrame(png, o), s.data, o)), at: s.at, data: s.data })
  for (const f of frames) f.kind = kindOf(f)
  if (process.env.DEBUG) {
    console.log("A first:", A.slice(0, 5).map((r) => `${Math.round(r.t - press)}:${r.screen}`).join(" "))
    console.log("A last:", A.slice(-3).map((r) => `${Math.round(r.t - press)}:${r.screen}`).join(" "), "B first:", B.slice(0, 6).map((r) => `${Math.round(r.t - press)}:${r.parsed}:${r.screen}`).join(" "))
    console.log("glass:", frames.filter((f) => B[0] && Math.abs(f.at - B[0].t) < 150).map((f) => `${Math.round(f.at - press)}:${f.kind}`).join(" "))
    const lb = B[B.length - 1]
    if (lb) console.log("B origin", Math.round(lb.origin - press), "paints", lb.paints.map(([n, t]) => `${n} ${Math.round(t - press)}`).join(", "))
    frames.filter((f) => f.kind === "white").forEach((f, i) => { if (SHOTS) writeFileSync(join(SHOTS, `debug-white-${i}.png`), Buffer.from(f.data, "base64")) })
  }
  const save = (name, f) => { if (SHOTS && f) writeFileSync(join(SHOTS, `switch-${label.replace(/ /g, "-")}-${name}.png`), Buffer.from(f.data, "base64")) }

  /* UP AT ONCE */
  const firstUp = A.findIndex((r) => r.screen != null && r.screen > 0)
  expect(firstUp !== -1 && firstUp <= 1, "the screen is up within two frames of the press", firstUp === -1 ? "never" : `frame ${firstUp + 1}, ${ms(A[firstUp].t - press)} after it`)
  save("1-press", frames.find((f) => f.at >= (A[firstUp]?.t ?? press) + 40))

  /* NEVER NOTHING, on the glass */
  const bad = frames.filter((f) => f.kind === "white" || f.kind === "blank" || f.kind === "spinner")
  const kinds = []
  for (const f of frames) if (!kinds.length || kinds[kinds.length - 1].kind !== f.kind) kinds.push({ kind: f.kind, at: Math.round(f.at - press) })
  console.log(`        ${frames.length} frames on the glass: ${kinds.map((k) => `${k.kind} from ${k.at}ms`).join(", ")}`)
  expect(bad.length === 0, "no frame is white, empty, or a bare spinner", bad.length ? `${bad.length}: ${bad.slice(0, 4).map((f) => `${f.kind} at ${ms(f.at - press)}`).join(", ")}` : `${frames.length} frames read`)
  bad.slice(0, 2).forEach((f, i) => save(`bad-${i}`, f))

  /* CHEAP */
  const props = new Set(after.flatMap((r) => r.anims))
  const off = [...props].filter((p) => !ALLOWED.has(p))
  expect(off.length === 0, "the screen and the page move on opacity, transform and translate only", `${[...props].join(", ") || "nothing"}`)
  if (errors.length) expect(false, "no script errors", errors.slice(0, 3).join(" | "))

  /* THE BAR IS NEVER AN EMPTY BAND: on every frame on the glass, from the press to the end, something is drawn in it. */
  const BAR_MIN = 40
  const barLow = frames.filter((f) => f.barInk < BAR_MIN)
  const barInks = frames.map((f) => f.barInk)
  expect(barLow.length === 0, "the black bar is never an empty band: a photo and a name are in it on every frame",
    barLow.length ? `${barLow.length} frames under ${BAR_MIN}, first at ${ms(barLow[0].at - press)}` : `${frames.length} frames, the least ${Math.min(...barInks)} points drawn in the bar`)
  barLow.slice(0, 2).forEach((f, i) => save(`empty-bar-${i}`, f))

  if (scenario === "fail") {
    const lastBar = [...A].reverse().find((r) => r.bar)?.bar
    expect(!!lastBar && !lastBar.still && lastBar.name === OLD_NAME, "  and once the screen has gone, the bar is the business you are still in", lastBar ? `${lastBar.still ? "still" : "real"}: ${lastBar.name}` : "-")
    const gone = A.findIndex((r, i) => i > firstUp && r.screen == null)
    const fading = A.filter((r, i) => i > firstUp && r.screen != null && r.screen < 0.96 && r.screen > 0.04 && r.t > press + SWITCH_MS)
    const last = recs[recs.length - 1]
    expect(where === "/" && A.every((r) => r.old), "the page stays the business you are in", where)
    expect(gone !== -1, "the screen goes away", gone === -1 ? "still up" : `${ms(A[gone].t - press)} after the press`)
    expect(fading.length >= 3, "  on a fade", `${fading.length} part-way frames`)
    expect(!!last?.alert && /not yours to open/.test(last.alert), "the menu says why, in a sentence", last?.alert ?? "nothing")
    expect(!last?.cookie, "no switch cookie is left")
    save("2-after", frames[frames.length - 1])
    summary.push({ W: label, glass: frames.length, bad: bad.length, props: [...props].join("/") })
    return
  }

  /* THE LINES */
  const seq = []
  for (const r of after) { const t = topLine(r); if (t && seq[seq.length - 1] !== t) seq.push(t) }
  expect(seq[0] === `Switching to ${NEW_NAME}` && seq.includes(`Opening ${NEW_NAME}'s store`), "the lines follow the steps", seq.join(" > "))
  expect(seq.every((l) => !/[\u2014\u2013]/.test(l)), "  in plain words, no dashes")
  expect(seen.switchBody?.to === NEW_ID, "the switch asked for the other business", JSON.stringify(seen.switchBody))
  expect(seen.cookie?.name === NEW_NAME && seen.cookie?.photo === NEW_PHOTO, "the new /app was asked for with the switch's cookie: the name and the photo", JSON.stringify(seen.cookie))

  /* THE BAR SAYS WHERE YOU ARE GOING, from the screen being up to the end, and where the real one will. */
  const barWrong = after.filter((r) => r.bar && (r.bar.still || r.doc === "/app") && r.bar.name !== NEW_NAME)
  expect(barWrong.length === 0, "from the screen being up, the bar names the business you are going to, across the reload and after it",
    barWrong.length ? `${barWrong.length} frames, e.g. ${barWrong[0].doc} ${barWrong[0].bar.still ? "still" : "real"}: ${barWrong[0].bar.name}` : `${after.filter((r) => r.bar?.still).length} frames of the still bar`)
  const firstStillA = A.find((r) => r.bar?.still)
  const firstStillB = B.find((r) => r.parsed && r.bar?.still)
  expect(firstStillA?.bar.photo === true && firstStillB?.bar.photo === true, "  its photo drawn in it on the screen's first frame and on the new document's first",
    `old page ${firstStillA?.bar.photo}, new document ${firstStillB?.bar.photo}`)
  const lastReal = [...B].reverse().find((r) => r.bar && !r.bar.still)
  expect(!!lastReal && lastReal.bar.photo === true, "  and the real header under it has the same photo, drawn, when the screen goes", lastReal ? String(lastReal.bar.photo) : "-")
  const gStill = after.find((r) => r.geoStill)?.geoStill
  const gReal = [...after].reverse().find((r) => r.geoReal)?.geoReal
  const drift = gStill && gReal ? Object.keys(gReal).map((k) => [k, gStill[k] && gReal[k] ? Math.max(...gReal[k].map((v, i) => Math.abs(v - gStill[k][i]))) : Infinity]) : []
  const worst = drift.reduce((m, [, d]) => Math.max(m, d), 0)
  expect(!!gStill && !!gReal && worst <= 1, "  every piece of the still bar where the real header puts it, within a pixel",
    drift.length ? drift.map(([k, d]) => `${k} ${Number.isFinite(d) ? Math.round(d * 10) / 10 : "missing"}`).join(", ") : "not measured")
  const changeFrames = after.filter((r) => r.lines.length > 1 && r.lines.some((l) => partWay(l.o)))
  const lineMoves = new Set(after.flatMap((r) => r.lines.filter((l) => partWay(l.o)).map((l) => l.tr)))
  expect(changeFrames.length >= 3, "each line change is a fade through part-way frames", `${changeFrames.length} frames with a line part way`)
  if (reduced) expect([...lineMoves].every((t) => t === "none" || /^0px( 0px)?$/.test(t)), "  with no movement under reduced motion", [...lineMoves].join(" | "))
  const midChange = changeFrames[Math.floor(changeFrames.length / 2)]
  save("2-line-change", frames.find((f) => midChange && f.at >= midChange.t))

  /* ACROSS THE RELOAD */
  const lastA = A.filter((r) => r.screen != null).pop()
  const firstB = B.find((r) => r.parsed && r.screen != null)
  const firstBAny = B.find((r) => r.parsed)
  expect(!!firstB && firstB === firstBAny && firstB.screen >= 0.99, "the new document's first frame is the screen, whole", firstB ? `opacity ${firstB.screen}` : "no screen")
  expect(!!lastA && !!firstB && topLine(lastA) === topLine(firstB), "  with the line the page before ended on", `${lastA ? topLine(lastA) : "-"} | ${firstB ? topLine(firstB) : "-"}`)
  if (lastA?.angle != null && firstB?.angle != null && !reduced) {
    const expected = (lastA.angle + (firstB.t - lastA.t) * 0.36) % 360
    const off = Math.abs(((firstB.angle - expected + 540) % 360) - 180)
    expect(off <= 36, "  and its spinner turning on from where it was", `${Math.round(off)}deg from where it would be (${ms(firstB.t - lastA.t)} between the two documents' frames)`)
  }
  save("3-last-old-document", frames.filter((f) => lastA && f.at <= lastA.t + 20).pop())
  save("4-first-new-document", frames.find((f) => firstB && f.at >= firstB.t))

  /* READY FIRST, one fade */
  const leaving = B.findIndex((r) => r.screen != null && r.screen < 0.99)
  const gone = B.findIndex((r) => r.parsed && r.screen == null)
  const handover = leaving !== -1 ? B[leaving] : gone !== -1 ? B[gone] : null
  expect(!!handover && handover.neu && handover.cold === 0 && handover.busy === 0 && handover.pictures.length > 0 && handover.pictures.every(Boolean),
    "the screen starts to go only once the new page is there, its chart answered and its pictures decoded",
    handover ? `page ${handover.neu}, cold start ${handover.cold}, busy ${handover.busy}, pictures ${handover.pictures.join("/")}` : "never")
  const fade = B.filter((r) => r.screen != null && r.screen < 0.96 && r.screen > 0.04)
  if (reduced) expect(fade.length === 0, "  gone in one step under reduced motion", `${fade.length} part-way frames`)
  else expect(fade.length >= 3, "  in one fade through part-way frames", `${fade.length} frames`)
  const neither = B.filter((r) => r.parsed && (r.screen == null || r.screen === 0) && !r.neu)
  expect(neither.length === 0, "no frame of the new document without the screen or the page", `${neither.length}`)
  save("5-handover", frames.find((f) => fade.length && f.at >= fade[Math.floor(fade.length / 2)].t))
  save("6-arrived", frames[frames.length - 1])

  /* STILL, CLEARED */
  const lastB = B[B.length - 1]
  expect(!!lastB && lastB.shift === 0, "no layout shift in the new document", lastB ? String(Math.round(lastB.shift * 10000) / 10000) : "-")
  expect(!!lastB && !lastB.cookie, "the switch cookie is gone once the screen is")
  const timing = {
    up: firstUp !== -1 ? ms(A[firstUp].t - press) : "-",
    newDocument: firstB ? ms(firstB.t - press) : "-",
    handover: handover ? ms(handover.t - press) : "-",
    done: gone !== -1 ? ms(B[gone].t - press) : "-",
  }
  /* Long tasks from the press on: the old page's own first render is not the switch's. */
  const longA = Math.max(0, ...(A[A.length - 1]?.long ?? []).filter(([t]) => t >= press).map(([, d]) => d))
  const longB = Math.max(0, ...(lastB?.long ?? []).map(([, d]) => d))
  /* The fade is the one moment a long task would show: the spinner turns on the compositor, a fade driven by a busy page would not. */
  const inFade = handover ? (lastB?.long ?? []).filter(([t, d]) => t + d > handover.t && t < handover.t + 260).map(([, d]) => d) : []
  expect(inFade.every((d) => d < 100), "no long task while the screen hands over", inFade.length ? `${inFade.join(", ")}ms` : "none")
  console.log(`        times from the press: screen up ${timing.up}, new document ${timing.newDocument}, hand over ${timing.handover}, screen gone ${timing.done}; longest task ${longA}ms from the press to the reload, ${longB}ms in the new document (under the screen)`)
  summary.push({ W: label, glass: frames.length, bad: bad.length, lines: seq.length, lineFadeFrames: changeFrames.length, handoverFrames: fade.length, shift: lastB?.shift ?? null, ...timing, longA, longB })
}

for (const W of WIDTHS) await run(W)
if (WIDTHS.includes(390)) {
  await run(390, { scenario: "fail" })
  await run(390, { reduced: true })
}
if (WIDTHS.includes(1280)) await run(1280, { scenario: "fail" })

await browser.close()
server.close()
console.log("\n" + JSON.stringify(summary, null, 1))
if (problems.length) fail(`${problems.length} problem${problems.length === 1 ? "" : "s"}:\n  ${problems.join("\n  ")}`)
console.log("\nok: the switch screen is up at once, follows the steps, carries across the reload, and hands over to a ready page in one fade, at every width")
