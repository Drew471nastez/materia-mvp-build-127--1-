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
 *   THE BAR           "there's the black top bar there showing, which I don't
 *                     understand why": on every frame on the glass the black
 *                     bar has something drawn in it (never an empty band);
 *                     from the screen being up it names the business you are
 *                     going to, with its photo drawn, on both sides of the
 *                     reload; and every piece of the screen's bar (photo,
 *                     name, chevron, icons, search, logo) is within a pixel
 *                     of where the real header puts it
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
 *   IN TWO PARTS      (390, 1440) the new document's head lands 300ms before
 *                     the rest of it, which is how a megabyte of /app
 *                     arrives: the browser has a document it can lay out
 *                     before it has the screen's markup, and what it draws
 *                     in between is the flash this probe was extended for
 *
 *   THE SURFACE       (phones) the screen's field under the bar is the page's
 *                     own #f8f9fa on every frame it is up, and on the new
 *                     page's after it: the switch and the landing are one
 *                     surface; the corners are there on every frame
 *
 *   NEVER STUCK       every one ends somewhere useful, and the switch cookie
 *                     is gone at the end of each:
 *     LOCK            (390) the Supabase client's getSession and setSession
 *                     never answer (its lock held by a renewal on a phone
 *                     just back from the background): the switch still goes
 *     SERVER SILENT   (390) the switch's request never answers: after its
 *                     limit the screen goes, the menu says why with Try
 *                     again, and Try again then switches
 *     PAGE SILENT     (390) the new /app never answers: asked for again, then
 *                     the screen says it did not open, with Try again, and
 *                     Try again opens it
 *     NO SCRIPT       (390) the new /app's script never loads: the HTML's
 *                     own limit takes the screen away and clears the cookie
 *     GATE            (390) the app's session gate holds the cold start past
 *                     the screen's shell limit: the screen waits for the
 *                     gate, never hands over to the cold start's empty bar
 *     SAFE AREA       (390) a notch (47px top, 34px bottom, emulated): the
 *                     still bar where the real header is, at the new height
 *
 *   NO FLASH          no frame's light jumps away from the frames either
 *                     side of it and back again, across the whole recording
 *                     and across the swap of documents above all: a fade is
 *                     a run of steps one way, a flash is a step out and back
 *
 *   node scripts/check-business-switch.mjs
 *   WIDTHS=360,390,430,1280,1440   the widths (these by default)
 *   SHOTS=<dir>                    pictures of the frames that matter
 *   CPU=4                          the phone's slowdown (a computer runs at 1)
 *   CPU_DESKTOP=4                  slow the computer widths down too
 *   COLD=1                         the new document with nothing in the cache
 *   FLASH=1                        every frame's light, and its picture with SHOTS
 *   SPLIT_MS=300                   the new document's head lands this long before the rest of it
 *   EXPECT=off                     as a browser that does not know rel=expect sees it
 *   STUCK=0                        leave out the NEVER STUCK runs (a minute and a half)
 *   ONLY=stuck | ONLY=film         only those, or everything but those
 *
 * EXPECT=off with the document in two parts is the one place this probe is
 * meant to fail, and what it fails on is the residual: with nothing left to
 * hold the glass but the canvas, a frame or two of the swap is the screen's
 * two fields without the bar's name and photo, the spinner and the line on
 * them. The light of the glass holds (a step of half a point of 255 against
 * sixteen before), so there is no flash; "never nothing" and "never an empty
 * band" count what is drawn, not how bright it is, and they say so.
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
const CPU_DESKTOP = Number(process.env.CPU_DESKTOP || 1)
const COLD = process.env.COLD === "1"
/* The gap between the head of the new document and the rest of it: a big
   document does not land in one piece, and what the browser does in that gap
   is what this probe was extended to measure. SPLIT_MS puts every run in two
   parts; without it the two-part run below is the only one. */
const SPLIT_MS = Number(process.env.SPLIT_MS || 0)
const SPLIT_SCENARIO_MS = 300
let split = SPLIT_MS
const SWITCH_MS = 350
const DOC_MS = 700
const JS_MS = 250
const PHOTO_MS = 500
const FIGURES_MS = 600
const NEW_NAME = "Lind Studio"
const NEW_PHOTO = "/photos/studio.png"
const OLD_NAME = "Mara Lind"
const NEW_ID = "00000000-0000-4000-8000-00000000000b"
const OLD_ID = "00000000-0000-4000-8000-00000000000a"
/* The session's cookie, named from the project's address as supabase-js names it (lib/supabase/session-jar storedSessionKey). */
const SUPABASE_URL = "https://probeproj.supabase.co"
const SESSION_COOKIE = "sb-probeproj-auth-token"
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url")
const jwt = (sub) => `${b64u({ alg: "HS256" })}.${b64u({ sub, exp: 9999999999 })}.probe`
/* The new page's session gate, in the GATE run: past the screen's own limit for the shell (ARRIVAL_CAP_MS, 8s). */
const GATE_MS = 9500
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
/* The browser's Supabase client. \`window.__probeHang\` makes its session calls never answer, as a client whose lock is held by a renewal that never ends does. */
writeFileSync(join(dir, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : q, apply: () => q })
const hang = () => typeof window !== "undefined" && window.__probeHang
const never = () => new Promise(() => {})
const auth = {
  getUser: async () => ({ data: { user: { id: "u", user_metadata: {} } } }),
  getSession: () => hang() ? never() : Promise.resolve({ data: { session: { access_token: ${JSON.stringify(jwt(OLD_ID))} } } }),
  setSession: () => hang() ? never() : new Promise((r) => setTimeout(() => r({ data: {}, error: null }), 30)),
  stopAutoRefresh: async () => {},
  startAutoRefresh: async () => {},
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
    execFileSync("npx", ["--no-install", "esbuild", entry, "--bundle", "--jsx=automatic", "--log-level=error", `--outfile=${out}`, '--define:process.env.NODE_ENV="production"', `--define:process.env.NEXT_PUBLIC_SUPABASE_URL=${JSON.stringify(SUPABASE_URL)}`, ...ALIASES, ...extra], { stdio: ["ignore", "ignore", "inherit"] })
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
const ssr = JSON.parse(execFileSync("node", [join(dir, "ssr.cjs"), NEW_NAME, NEW_PHOTO, String(GATE_MS)], { encoding: "utf8", maxBuffer: 64 << 20 }))
rmSync(dir, { recursive: true, force: true })

const css = `${await appCss(root)}\n${interFaces(root).replace(/url\(file:\/\//g, "url(/__font?p=")}`
/* The stylesheet as a file, as the app sends it (render blocking, cached after the first page), not inlined: a megabyte of <style> parsed inside the document is parser time the real page never spends. */
/* What app/layout.tsx runs in the head of every document before its body is
   parsed (lib/businesses/switch-screen SWITCH_FIRST_PAINT_SCRIPT). EXPECT=off
   makes its `rel=expect` link inert, which is what a browser that does not
   know that relation does with it: what is left to hold the glass then is the
   canvas the same script paints. */
const headScript = process.env.EXPECT === "off" ? ssr.head.replace('l.rel="expect"', 'l.rel="x-no-expect"') : ssr.head
const HEAD = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/app.css"><script>${headScript}</script>`
/* The root layout's <html> and <body> (app/layout.tsx). */
const BODY = `class="font-sans antialiased bg-background text-foreground"`
const oldHtml = `<!doctype html><html lang="en" class="light" style="color-scheme:light"><head>${HEAD}</head><body ${BODY}><div id="app"></div><script src="/client.js"></script></body></html>`
/**
 * THE NEW DOCUMENT, IN TWO PARTS, AS A BIG ONE ARRIVES. The real /app HTML
 * is the shell, the page and the whole RSC payload beside it: a megabyte,
 * which does not land in the browser in one piece. The browser has the head
 * and the start of the body, with the stylesheet already applied, for some
 * time before it has the screen's markup — and a browser that has a body it
 * can lay out will paint it rather than hold the page before on the glass
 * for ever. What it paints there is whatever the document says the page is
 * before anything is in it: the canvas.
 *
 * SPLIT_MS is that gap (0, one write, by default). The head and the open
 * <body> go first, then the rest.
 */
const newHead = (arriving) => `<!doctype html><html lang="en" class="light" style="color-scheme:light"><head>${HEAD}<script>window.__arriving=${JSON.stringify(arriving)};window.__gateMs=${mode === "gate" && arriving ? GATE_MS : 0}</script></head><body ${BODY}>`
const newRest = (arriving) => `<div id="app">${arriving ? (mode === "gate" ? ssr.gated : ssr.arriving) : ssr.plain}</div><script src="/client.js?doc=app" defer></script></body></html>`
const newHtml = (arriving) => newHead(arriving) + newRest(arriving)

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
const seen = { switchBody: null, cookie: null, sessionUser: null, appAsks: 0, switchAsks: 0 }
/* Requests the probe is holding open on purpose (SERVER SILENT, PAGE SILENT), dropped by release() when the run is over. */
let held = []
const release = () => { const h = held; held = []; for (const f of h) f() }
/* How many of the next requests for each to hold open. */
const silent = { switch: 0, app: 0 }
/* The session a switch answer puts in the jar, as app/api/businesses/switch does (lib/supabase/session-jar). */
function sessionCookies(arrival) {
  const session = { access_token: jwt(NEW_ID), token_type: "bearer", expires_in: 3600, expires_at: 2000000000, refresh_token: "r", user: { id: NEW_ID } }
  const out = [`${SESSION_COOKIE}=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}; Path=/; Max-Age=34560000; SameSite=Lax`]
  if (arrival && typeof arrival.name === "string") out.push(`storelib_switching=${encodeURIComponent(arrival.photo ? `${arrival.name}\n${arrival.photo}` : arrival.name)}; Path=/app; Max-Age=30; SameSite=Lax`)
  return { session, out }
}
function jarUser(cookieHeader) {
  const raw = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]*)`).exec(cookieHeader || "")?.[1]
  if (!raw) return null
  try {
    const json = JSON.parse(Buffer.from(decodeURIComponent(raw).replace(/^base64-/, ""), "base64url").toString())
    return JSON.parse(Buffer.from(json.access_token.split(".")[1], "base64url").toString()).sub
  } catch { return null }
}
const server = createServer((req, res) => {
  const u = new URL(req.url, "http://probe")
  const send = (status, type, body, headers = {}) => { res.writeHead(status, { "content-type": type, "cache-control": "no-store", ...headers }); res.end(body) }
  if (u.pathname.startsWith("/__font")) {
    const file = decodeURIComponent(u.searchParams.get("p") || "")
    if (!/\/\.next\/static\/media\/[\w.-]+\.woff2$/.test(file) || !existsSync(file)) return send(404, "text/plain", "")
    return send(200, "font/woff2", readFileSync(file), { "cache-control": "max-age=3600" })
  }
  if (u.pathname === "/app.css") return send(200, "text/css", css, { "cache-control": "max-age=3600" })
  /* NO SCRIPT: the new /app's script never loads. */
  if (u.pathname === "/client.js" && u.searchParams.get("doc") && mode === "noscript") return send(404, "text/plain", "")
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
      seen.switchAsks++
      const answer = () => {
        if (mode === "fail") return send(403, "application/json", JSON.stringify({ error: "That business is not yours to open." }))
        const { session, out } = sessionCookies(seen.switchBody?.arrival)
        send(200, "application/json", JSON.stringify({ session }), { "set-cookie": out })
      }
      if (silent.switch > 0) { silent.switch--; held.push(() => res.destroy()); return }
      setTimeout(answer, SWITCH_MS)
    })
    return
  }
  /* NEVER STUCK: what a page mid-way to its next page shows, reported by itself. */
  if (u.pathname === "/__state" && req.method === "POST") {
    const chunks = []
    req.on("data", (c) => chunks.push(c))
    req.on("end", () => { try { seen.report = JSON.parse(Buffer.concat(chunks).toString()) } catch {} ; send(204, "text/plain", "") })
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
    seen.sessionUser = jarUser(req.headers.cookie)
    seen.appAsks++
    if (silent.app > 0) { silent.app--; held.push(() => res.destroy()); return }
    if (!split) return setTimeout(() => send(200, "text/html", newHtml(arriving)), DOC_MS)
    const gap = split
    return setTimeout(() => {
      res.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" })
      res.write(newHead(arriving))
      setTimeout(() => res.end(newRest(arriving)), gap)
    }, DOC_MS)
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
    /* THE LIGHT OF THE FRAME, AND WHERE IT IS. A flash is a frame whose light
       jumps away from the frames either side of it and back again, so every
       frame is read for its mean luminance and for a coarse grid of it
       (GRID x GRID cells): the mean says how bright the glass was, the grid
       says how much of it changed from the frame before. Rec. 709 luma, on
       samples every 3px. */
    const GRID = 24
    const cells = new Float64Array(GRID * GRID)
    const counts = new Int32Array(GRID * GRID)
    let lum = 0, lumN = 0
    for (let y = 0; y < o.H; y += 3) for (let x = 0; x < o.W; x += 3) {
      const i = px(x, y)
      const L = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
      lum += L
      lumN++
      const c = Math.min(GRID - 1, (y / o.H * GRID) | 0) * GRID + Math.min(GRID - 1, (x / o.W * GRID) | 0)
      cells[c] += L
      counts[c]++
    }
    const grid = []
    for (let k = 0; k < cells.length; k++) grid.push(counts[k] ? cells[k] / counts[k] : 0)
    /* THE FIELD UNDER THE BAR, where nothing of a page is drawn (its right margin, 40px down), and THE CORNER: the first pixel under the bar at the left edge, the bar's colour when the rounded corner is there. */
    const rgb = (x, y) => { const i = px(x, y); return [data[i], data[i + 1], data[i + 2]] }
    return { white: white / all, ink, w: ink ? x1 - x0 : 0, h: ink ? y1 - y0 : 0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, barInk, lum: lum / lumN, grid, field: rgb(o.W - 6, o.HEADER + 40), corner: rgb(1, o.HEADER + 1) }
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

const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`
const near = (a, b, d = 3) => a.every((v, i) => Math.abs(v - b[i]) <= d)
const PAGE_FIELD = [248, 249, 250]

/* A notch: the insets an iPhone's portrait glass has, emulated (Emulation.setSafeAreaInsetsOverride), read by env(safe-area-inset-*). */
const NOTCH = { top: 47, bottom: 34, left: 0, right: 0 }

async function run(W, { scenario = "switch", reduced = false, inParts = false, lock = false, gate = false, insets = false } = {}) {
  split = inParts ? SPLIT_SCENARIO_MS : SPLIT_MS
  const phone = W < 768
  const H = phone ? 844 : 900
  const TOP = insets ? NOTCH.top : 0
  const o = { W, H, HEADER: (phone ? 68 : 58) + TOP, RAIL: phone ? 0 : 240, BAR: phone ? [17, 17, 17] : [19, 19, 22] }
  mode = scenario === "fail" ? "fail" : gate ? "gate" : "ok"
  seen.switchBody = null
  seen.cookie = null
  seen.sessionUser = null
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  await page.setViewport(phone ? { width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: W, height: H, deviceScaleFactor: 1 })
  if (insets) {
    /* The override belongs to the document it was set on, and a phone's notch does not: it is set again the moment each new document commits, before its first frame. */
    const notch = await page.createCDPSession()
    await notch.send("Page.enable")
    notch.on("Page.frameNavigated", () => { notch.send("Emulation.setSafeAreaInsetsOverride", { insets: NOTCH }).catch(() => {}) })
    await notch.send("Emulation.setSafeAreaInsetsOverride", { insets: NOTCH })
  }
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
  /* The phone's slowdown by default; CPU_DESKTOP makes a computer slow too, because a flash is easiest to see on a slow machine. */
  const rate = phone ? CPU : CPU_DESKTOP
  if (rate > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate })
  /* COLD=1: the new document is asked for with nothing in the cache, so its stylesheet, font and photos are all fetched again. The page you were on stays warm, as it is. */
  if (COLD) {
    await cdp.send("Network.enable").catch(() => {})
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true }).catch(() => {})
  }
  const shots = []
  cdp.on("Page.screencastFrame", (f) => {
    shots.push({ at: f.metadata.timestamp ? f.metadata.timestamp * 1000 : Date.now(), data: f.data })
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 })
  await wait(150)
  const other = await visible('[data-business-row="other"]')
  if (!other.asElement()) { await ctx.close(); problems.push(`at ${W}: no other business to press`); return }
  /* LOCK: from here the client's session calls never answer. */
  if (lock) await page.evaluate(() => { window.__probeHang = true })
  await other.click()

  if (scenario === "fail") {
    for (let i = 0; i < 60; i++) {
      await wait(100)
      const done = await page.evaluate(() => !document.querySelector("[data-business-switch-screen]") && !!document.querySelector('[data-business-switcher] [role="alert"]')).catch(() => false)
      if (done) break
    }
    await wait(400)
  } else {
    for (let i = 0; i < (gate ? 260 : lock ? 300 : 150); i++) {
      await wait(100)
      const done = await page.evaluate(() => location.pathname === "/app" && !!document.querySelector('[data-probe-page="new"]') && !document.querySelector("[data-business-switch-screen]")).catch(() => false)
      if (done) break
    }
    await wait(600)
  }
  await cdp.send("Page.stopScreencast").catch(() => {})
  if (rate > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 }).catch(() => {})
  const where = await page.evaluate(() => location.pathname)
  await ctx.close()

  const label = `${W}${scenario === "fail" ? " failed" : ""}${reduced ? " reduced motion" : ""}${split ? " in two parts" : ""}${lock ? " lock" : ""}${gate ? " gate" : ""}${insets ? " notch" : ""}`
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

  /**
   * NO FLASH, FRAME BY FRAME. "Make sure there is no flash happening in that
   * transition to the business page."
   *
   * A flash is not a white frame (the check above already forbids those) and
   * not a frame that is merely different: it is a frame, or a run of two or
   * three, whose light jumps away from the frames either side of it AND BACK
   * AGAIN. A fade is a run of frames each a little closer to the next thing;
   * a flash is a step out and a step back. So every pair of frames on the
   * glass is read for how much of the picture changed (cells of the frame's
   * luminance grid that moved by more than GRID_STEP) and how far the mean
   * light moved, and every short run is read for a there-and-back jump
   * against its neighbours (JUMP, in luma out of 255).
   *
   * Reported for the whole recording and, separately, for the swap of
   * documents: the frames within SWAP_WINDOW_MS of the new document's first
   * reading, which is where a flash between two documents has to be.
   */
  const JUMP = 4
  const GRID_STEP = 8
  const SWAP_WINDOW_MS = 400
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1].grid, b = frames[i].grid
    let moved = 0
    for (let k = 0; k < a.length; k++) if (Math.abs(a[k] - b[k]) > GRID_STEP) moved++
    frames[i].changed = moved / a.length
    frames[i].dLum = frames[i].lum - frames[i - 1].lum
  }
  /* A run of frames (up to FLASH_MAX_FRAMES, about two thirds of a second)
     that steps away from both neighbours in the same direction and comes
     back. Longer than that and it is not a blink but a state the screen was
     in, which the other checks have their own words for. */
  const FLASH_MAX_FRAMES = 40
  const flashes = []
  for (let i = 1; i < frames.length - 1; i++) {
    for (let len = 1; len <= FLASH_MAX_FRAMES && i + len < frames.length; len++) {
      const before = frames[i - 1].lum, after = frames[i + len].lum
      const run = frames.slice(i, i + len)
      const mid = run.reduce((s, f) => s + f.lum, 0) / len
      const up = mid - before, back = mid - after
      if (Math.abs(up) <= JUMP || Math.abs(back) <= JUMP) continue
      if (Math.sign(up) !== Math.sign(back)) continue
      /* The neighbours have to agree with each other, or this is a fade, not a flash. */
      if (Math.abs(before - after) > Math.min(Math.abs(up), Math.abs(back)) / 2) continue
      flashes.push({ at: run[0].at, len, held: frames[i + len].at - run[0].at, out: Math.round(Math.min(Math.abs(up), Math.abs(back)) * 10) / 10, dir: up > 0 ? "lighter" : "darker" })
      i += len
      break
    }
  }
  const swapAt = B.find((r) => r.parsed)?.t ?? null
  const inSwap = (f) => swapAt != null && Math.abs(f.at - swapAt) <= SWAP_WINDOW_MS
  const pairs = frames.slice(1)
  const swapPairs = pairs.filter(inSwap)
  const worstOf = (list, key) => list.reduce((m, f) => Math.max(m, Math.abs(f[key])), 0)
  console.log(`        light on the glass: ${frames.length} frames, the biggest step between two of them ${Math.round(worstOf(pairs, "dLum") * 10) / 10} of 255` +
    (swapPairs.length ? `; across the swap (${swapPairs.length} frames in ${SWAP_WINDOW_MS * 2}ms) ${Math.round(worstOf(swapPairs, "dLum") * 10) / 10}, the most of the picture to change at once ${Math.round(worstOf(swapPairs, "changed") * 100)}%` : ""))
  if (process.env.FLASH) {
    for (const f of frames) console.log(`        ${String(Math.round(f.at - press)).padStart(5)}ms ${f.kind.padEnd(7)} lum ${f.lum.toFixed(1).padStart(6)} d ${(f.dLum ?? 0).toFixed(1).padStart(6)} changed ${Math.round((f.changed ?? 0) * 100).toString().padStart(3)}% bar ${String(f.barInk).padStart(5)}${inSwap(f) ? "  <- swap" : ""}`)
    if (SHOTS) frames.filter(inSwap).forEach((f, i) => writeFileSync(join(SHOTS, `swap-${label.replace(/ /g, "-")}-${String(i).padStart(2, "0")}-${Math.round(f.at - press)}ms.png`), Buffer.from(f.data, "base64")))
  }
  /* Not for a failed switch: there the screen comes up and goes away again
     inside half a second, which is a there-and-back by design. */
  if (scenario !== "fail") expect(flashes.length === 0, "no frame's light jumps away from its neighbours and back: no flash",
    flashes.length ? `${flashes.length}: ${flashes.slice(0, 5).map((f) => `${f.dir} by ${f.out} of 255 for ${f.len} frame${f.len === 1 ? "" : "s"} (${ms(f.held)}) at ${ms(f.at - press)}`).join(", ")}` : `${pairs.length} pairs read, none jumps by more than ${JUMP} of 255 and back`)
  flashes.slice(0, 3).forEach((f, i) => save(`flash-${i}-${Math.round(f.at - press)}ms`, frames.find((g) => g.at === f.at)))

  /*
    THE FILM, IN SEGMENTS. Every frame on the glass from the press, run
    together while it shows the same thing: what kind of frame, the colour of
    the field under the bar, whether the bar's corner is drawn, whether the
    bar has its photo and name in it. A change of any of these is a line.
  */
  const segs = []
  for (const f of frames) {
    const key = `${f.kind} field ${hex(f.field)} corner ${near(f.corner, o.BAR, 8) ? "on" : "off"} bar ${f.barInk >= 40 ? "drawn" : "EMPTY"}`
    if (!segs.length || segs[segs.length - 1].key !== key) segs.push({ key, from: Math.round(f.at - press), n: 1 })
    else segs[segs.length - 1].n++
  }
  console.log(`        the film, ${frames.length} frames:\n${segs.map((g) => `          ${String(g.from).padStart(5)}ms  x${String(g.n).padStart(3)}  ${g.key}`).join("\n")}`)

  /* THE SURFACE (phones): from the frame the screen is whole to the last frame, the field under the bar is the page's own #f8f9fa, and the corner is drawn. */
  const whole = A.find((r) => r.screen != null && r.screen >= 0.999)
  const fromWhole = whole ? frames.filter((f) => f.at >= whole.t + 20) : []
  if (phone && scenario !== "fail" && !reduced) {
    const off = fromWhole.filter((f) => !near(f.field, PAGE_FIELD))
    expect(fromWhole.length > 0 && off.length === 0, "the field under the bar is the page's own #f8f9fa on every frame from the screen being whole to the end: the switch and the landing are one surface",
      off.length ? `${off.length} frames, e.g. ${hex(off[0].field)} at ${ms(off[0].at - press)}` : `${fromWhole.length} frames`)
    const square = fromWhole.filter((f) => !near(f.corner, o.BAR, 8))
    expect(square.length === 0, "  and the bar's corners are drawn on every one of them", square.length ? `${square.length} frames without, e.g. ${hex(square[0].corner)} at ${ms(square[0].at - press)}` : `${fromWhole.length} frames`)
  }

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

  /* THE SESSION: the new /app was asked for with the new business in the jar (app/api/businesses/switch sets it with its answer). */
  expect(seen.sessionUser === NEW_ID, "the new /app was asked for as the new business: its session in the cookie jar", String(seen.sessionUser))
  if (gate) {
    expect(B.some((r) => r.cold > 0), "  the app's session gate held the cold start under the screen", `${B.filter((r) => r.cold > 0).length} frames`)
  }

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
  const inFadeAt = handover ? (lastB?.long ?? []).filter(([t, d]) => t + d > handover.t && t < handover.t + 260) : []
  const inFade = inFadeAt.map(([, d]) => d)
  expect(inFade.every((d) => d < 100), "no long task while the screen hands over", inFade.length ? inFadeAt.map(([t, d]) => `${d}ms from ${Math.round(t - handover.t)}ms`).join(", ") : "none")
  console.log(`        times from the press: screen up ${timing.up}, new document ${timing.newDocument}, hand over ${timing.handover}, screen gone ${timing.done}; longest task ${longA}ms from the press to the reload, ${longB}ms in the new document (under the screen)`)
  summary.push({ W: label, glass: frames.length, bad: bad.length, lines: seq.length, lineFadeFrames: changeFrames.length, handoverFrames: fade.length, shift: lastB?.shift ?? null, ...timing, longA, longB })
}

/**
 * NEVER STUCK. A switch whose request, page or script never comes, on a
 * phone at 390 slowed four times. Each is read by what is on the page, not
 * filmed: where it ends, how long it took, and whether the cookie is gone.
 */
async function stuck(kind) {
  const W = 390
  mode = kind === "noscript" ? "noscript" : "ok"
  silent.switch = kind === "server" ? 1 : 0
  silent.app = kind === "page" ? 2 : 0
  held = []
  seen.switchAsks = 0
  seen.appAsks = 0
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  await page.setViewport({ width: W, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e.message || e)))
  await page.goto(`${base}/`)
  await page.waitForSelector('[data-probe-page="old"]')
  await wait(400)
  const visible = (sel) => page.evaluateHandle((q) => Array.from(document.querySelectorAll(q)).find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" }) || null, sel)
  await (await visible("#account-trigger")).click()
  await wait(600)
  await (await visible('[data-business-row="current"]')).click()
  await wait(400)
  const cdp = await page.createCDPSession()
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU })
  /*
    READING A PAGE WHOSE NEXT PAGE NEVER COMES. The protocol sends an
    evaluation to the document that is on its way, and PAGE SILENT's never
    arrives, so a plain evaluate waits for ever. The page reports itself
    instead: every 200ms it sends what it shows to the probe's server
    (STATE_REPORT), and it presses Try again itself once that has been on
    the glass for a second, when asked to. The protocol is still asked
    first, with a limit, and answers for any page that is not mid-way.
  */
  const STATE = `(() => ({
    at: location.pathname,
    screen: (() => { const s = document.querySelector("[data-business-switch-screen]"); return s && getComputedStyle(s).display !== "none" ? s.dataset.step || "up" : null })(),
    line: (Array.from(document.querySelectorAll("[data-switch-line]")).pop() || {}).textContent || null,
    retryOnScreen: !!document.querySelector("[data-switch-retry]"),
    alert: (document.querySelector('[data-business-switcher] [role="alert"]') || {}).textContent || null,
    retryInMenu: !!document.querySelector("[data-business-retry]"),
    arrived: !!document.querySelector('[data-probe-page="new"]') && !document.querySelector("[data-business-switch-screen]"),
    cookie: document.cookie.includes("storelib_switching="),
    canvas: document.documentElement.classList.contains("switch-arriving"),
  }))()`
  const soon = (p, ms) => Promise.race([p, wait(ms).then(() => undefined)])
  const js = async (expression) => (await soon(cdp.send("Runtime.evaluate", { expression, returnByValue: true }).catch(() => null), 1500))?.result?.value
  const shot = async (name) => {
    if (!SHOTS) return
    const r = await soon(cdp.send("Page.captureScreenshot", { format: "png" }).catch(() => null), 3000)
    if (r) writeFileSync(join(SHOTS, `stuck-${kind}-${name}.png`), Buffer.from(r.data, "base64"))
  }
  seen.report = null
  await page.evaluate(`setInterval(() => {
    try {
      const s = ${STATE}
      navigator.sendBeacon("/__state", JSON.stringify(s))
      if (window.__probeAutoRetry && s.retryOnScreen) {
        window.__probeRetrySeen = window.__probeRetrySeen || Date.now()
        if (Date.now() - window.__probeRetrySeen > 1000 && !window.__probeRetried) { window.__probeRetried = true; document.querySelector("[data-switch-retry]").click() }
      }
    } catch {}
  }, 200)`)
  if (kind === "page") await page.evaluate(() => { window.__probeAutoRetry = true })
  const state = async () => (await js(STATE)) ?? seen.report
  const press = (sel) => js(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (b) b.click(); return !!b })()`)
  const until = async (test, limit) => {
    const t0 = Date.now()
    for (;;) {
      const s = await state()
      if (s && test(s)) return { s, t: Date.now() - t0 }
      if (Date.now() - t0 > limit) return { s, t: null }
      await wait(200)
    }
  }
  console.log(`\n390 never stuck: ${kind}`)
  await (await visible('[data-business-row="other"]')).click()
  const pressed = Date.now()
  if (kind === "server") {
    const r = await until((x) => !x.screen && !!x.alert, 32_000)
    await shot("1-ended")
    expect(r.t != null, "the request that never answers ends: the screen goes, the menu says why", r.t != null ? `${ms(Date.now() - pressed)} after the press` : `still up: ${JSON.stringify(r.s)}`)
    expect(!!r.s && r.s.at === "/" && /could not be opened/.test(r.s.alert || "") && r.s.retryInMenu, "  back where you were, one line, with Try again", JSON.stringify(r.s && { at: r.s.at, alert: r.s.alert, retry: r.s.retryInMenu }))
    expect(!!r.s && !r.s.cookie, "  no switch cookie left")
    release()
    await press("[data-business-retry]")
    const again = await until((x) => x.arrived, 20_000)
    await shot("2-after-try-again")
    expect(again.t != null, "  and Try again switches", again.t != null ? `arrived ${ms(again.t)} after it` : JSON.stringify(again.s))
  } else if (kind === "page") {
    const r = await until((x) => x.retryOnScreen, 34_000)
    await shot("1-did-not-open")
    expect(r.t != null, "the page that never comes ends: the screen says so, with Try again", r.t != null ? `${ms(Date.now() - pressed)} after the press, the line "${r.s.line}"` : `still: ${JSON.stringify(r.s)}`)
    expect(seen.appAsks >= 2, "  it asked for the page again on the way", `${seen.appAsks} requests`)
    expect(!!r.s && /did not open/.test(r.s.line || ""), "  in one line", r.s?.line ?? "-")
    /* Try again (pressed by the page itself, a second after it shows) while the two held requests are still open: its own request supersedes them, as a real one does. */
    const again = await until((x) => x.arrived, 20_000)
    await shot("2-after-try-again")
    expect(again.t != null && !again.s.cookie, "  and Try again opens it, and the cookie is gone after", again.t != null ? `arrived ${ms(again.t)} after it` : JSON.stringify(again.s))
  } else if (kind === "noscript") {
    const onApp = await until((x) => x.at === "/app", 15_000)
    const r = await until((x) => x.at === "/app" && !x.screen, 30_000)
    await shot("1-ended")
    expect(onApp.t != null && r.t != null, "a new /app whose script never loads: the HTML's own limit takes the screen away", r.t != null ? `${ms(Date.now() - pressed)} after the press` : `still up: ${JSON.stringify(r.s)}`)
    expect(!!r.s && !r.s.cookie && !r.s.canvas, "  and clears the cookie and gives the canvas back", JSON.stringify(r.s && { cookie: r.s.cookie, canvas: r.s.canvas }))
  }
  if (errors.length) expect(false, "no script errors", errors.slice(0, 3).join(" | "))
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 }).catch(() => {})
  release()
  await ctx.close()
  silent.switch = 0
  silent.app = 0
  mode = "ok"
}

/* ONLY=stuck: the NEVER STUCK runs alone; ONLY=film: everything else. */
const ONLY = process.env.ONLY || ""
if (ONLY !== "stuck") {
  for (const W of WIDTHS) await run(W)
  if (WIDTHS.includes(390)) {
    await run(390, { scenario: "fail" })
    await run(390, { reduced: true })
  }
  if (WIDTHS.includes(1280)) await run(1280, { scenario: "fail" })
  /* THE NEW DOCUMENT IN TWO PARTS, which is how a megabyte of /app arrives.
     The browser has a document it can lay out before it has the screen, and
     what it draws in between used to be one white frame held for the whole
     gap. See lib/businesses/switch-screen.ts. */
  for (const W of [390, 1440]) if (WIDTHS.includes(W)) await run(W, { inParts: true })
  /* SAFE AREA: the still bar at the real header's place under a notch. */
  if (WIDTHS.includes(390)) await run(390, { insets: true })
}
if (ONLY !== "film" && process.env.STUCK !== "0" && WIDTHS.includes(390)) {
  await run(390, { lock: true })
  await run(390, { gate: true })
  for (const kind of ["server", "page", "noscript"]) await stuck(kind)
}

await browser.close()
server.close()
console.log("\n" + JSON.stringify(summary, null, 1))
if (problems.length) fail(`${problems.length} problem${problems.length === 1 ? "" : "s"}:\n  ${problems.join("\n  ")}`)
console.log("\nok: the switch screen is up at once, follows the steps, carries across the reload, and hands over to a ready page in one fade, at every width")
