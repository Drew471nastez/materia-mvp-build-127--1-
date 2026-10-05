/**
 * ===========================================================================
 *  SETTINGS, NOTIFICATIONS, MEASURED AND PHOTOGRAPHED (rounds 12 and 13)
 * ===========================================================================
 * The real Settings opened on Notifications (scripts/render-community-
 * notify.tsx), at 1440x900 and 390x844, in a browser and in the app with a
 * stubbed Capacitor bridge:
 *
 *   LAYOUT      no sideways scroll, every switch, button and select at
 *               least 40px tall on a phone, the five cards there for a
 *               moderator, nothing overlapping
 *   BROWSER     (round 13) "This browser" turns web push on (the browser's
 *               question, a subscription, POST /api/push/web) and off
 *               (unsubscribe, DELETE); a browser without the Push API gets
 *               the one line about the app instead
 *   QUIET       the switch saves 22:00 to 08:00 and opens the two times,
 *               which save on change; the daily limit is one line
 *   COMMUNITY   a row opens to its level (PATCH /api/community/<id>/me) and
 *               its kinds (PATCH { community }); it folds back smoothly
 *   EMAIL       the weekly digest saves its opt in; the zone is saved
 *               quietly on load
 *   SWITCHES    a kind saves PATCH { push: { likes: true } } on the press;
 *               two quick presses go one after the other, never together;
 *               the main switch off greys the kinds and disables them
 *   WEB         the push plugin is never touched in a browser
 *   APP         launch only reads the permission (never asks); Allow asks
 *               once; a no shows how to turn it on in the phone's settings
 *               and Check again reads it again; turning push on from off
 *               asks from that tap, a yes registers the phone and says so;
 *               already allowed at launch registers without asking
 *
 *   PROBE_CSS=source node scripts/check-community-notify.mjs
 * Screenshots go to SHOTS_DIR (printed at the end): look at them.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const fontFiles = new Map()
const faces = interFaces(root).replace(/url\(file:\/\/([^)]+)\)/g, (_, path) => {
  const name = path.split("/").pop()
  fontFiles.set(name, path)
  return `url(https://storelib.com/__font/${name})`
})
const stubs = join(root, ".community-notify-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-notify-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"

const STUBS = {
  "next-navigation.js": `export const usePathname = () => "/account/settings"
const router = { push() {}, replace() {}, prefetch() {}, back() {}, forward() {}, refresh() {} }
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams("")
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`,
  "next-link.jsx": `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest }, children) })
export const useLinkStatus = () => ({ pending: false })
`,
  "next-image.jsx": `import React from "react"
export default function Image({ src, alt, fill, priority, preload, sizes, unoptimized, quality, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : "", alt, ...rest }) }
`,
  "supabase-client.jsx": `export function isNativePlatform() { return !!(window.Capacitor && window.Capacitor.isNativePlatform()) }
export const capacitorStorage = {}
const b = { select() { return b }, eq() { return b }, is() { return b }, limit() { return b }, order() { return b }, single() { return b }, maybeSingle() { return b }, in() { return b }, update() { return b }, then(res) { res({ data: null, error: null }) } }
export function createClient() {
  return { auth: { getUser: async () => ({ data: { user: { id: "user-1", email: "ava@example.com" } }, error: null }), getSession: async () => ({ data: { session: null }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) }, from: () => b, rpc: () => b, storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} }
}
`,
  /* The Capacitor bridge: core reads window.Capacitor; the push plugin writes down every call and answers what the probe set. */
  "capacitor-core.js": `export const Capacitor = { isNativePlatform: () => !!(window.Capacitor && window.Capacitor.isNativePlatform()), getPlatform: () => (window.Capacitor ? window.Capacitor.getPlatform() : "web") }
export const registerPlugin = () => new Proxy({}, { get: () => async () => ({}) })
export class WebPlugin { addListener() { return Promise.resolve({ remove() {} }) } }
`,
  "capacitor-push.js": `const s = () => (window.__pushStub ||= { state: "prompt", answer: "denied", calls: [] })
export const PushNotifications = {
  checkPermissions: async () => { s().calls.push(["check", Math.round(performance.now())]); return { receive: s().state } },
  requestPermissions: async () => { s().calls.push(["request", Math.round(performance.now()), window.__lastTap || 0]); await new Promise((r) => setTimeout(r, 200)); s().state = s().answer; return { receive: s().state } },
  register: async () => { s().calls.push(["register", Math.round(performance.now())]) },
  addListener: async () => ({ remove() {} }),
}
`,
}
for (const [k, v] of Object.entries(STUBS)) writeFileSync(join(stubs, k), v)

let html
try {
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-notify.tsx")],
    bundle: true, format: "iife", jsx: "automatic", logLevel: "error",
    outfile: join(stubs, "app.js"),
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;" },
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    plugins: [{
      name: "stubs",
      setup(b) {
        b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: join(stubs, "next-navigation.js") }))
        b.onResolve({ filter: /^next\/link$/ }, () => ({ path: join(stubs, "next-link.jsx") }))
        b.onResolve({ filter: /^next\/image$/ }, () => ({ path: join(stubs, "next-image.jsx") }))
        b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.jsx") }))
        b.onResolve({ filter: /^@capacitor\/core$/ }, () => ({ path: join(stubs, "capacitor-core.js") }))
        b.onResolve({ filter: /^@capacitor\/push-notifications$/ }, () => ({ path: join(stubs, "capacitor-push.js") }))
        b.onResolve({ filter: /^@\// }, async (a) => b.resolve("./" + a.path.slice(2), { resolveDir: root, kind: a.kind }))
      },
    }],
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
} catch (e) {
  rmSync(stubs, { recursive: true, force: true })
  console.error(`The probe did not bundle: ${e.message}`)
  process.exit(1)
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, protocolTimeout: 240000, args: ["--no-sandbox", "--hide-scrollbars"] })
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }

const KINDS = { mentions: true, comments: true, admin_posts: true, posts: true, events: true, programs: true, likes: false, messages: true, followers: true }
const CKINDS = { mentions: true, comments: true, admin_posts: true, posts: true, events: true, programs: true, likes: true, messages: true }
const C1 = "00000000-0000-4000-b000-000000000001"
const COMMUNITIES = [
  { id: C1, name: "Film Loft", slug: "film-loft", logoUrl: null, level: "important", kinds: { ...CKINDS, likes: false } },
  { id: "00000000-0000-4000-b000-000000000002", name: "Clay Club and the Saturday Wheel Throwing Circle", slug: "clay-club", logoUrl: null, level: "all", kinds: CKINDS },
]
const STATE = { enabled: true, devices: 0, kinds: KINDS, emails: { report_digest: true, weekly_digest: false }, moderates: true, quiet: null, tz: "Europe/Bucharest", communities: COMMUNITIES }
const KEY = "BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ"

async function open(vp, { app = false, state = STATE, push = null, webPush = true } = {}) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  const patches = []
  const web = []
  p.on("pageerror", (e) => errors.push(String(e?.stack || e).split("\n").slice(0, 3).join(" | ").slice(0, 300)))
  await p.setRequestInterception(true)
  p.on("request", async (r) => {
    const u = r.url()
    if (u.startsWith(ORIGIN) && r.resourceType() === "document") return r.respond({ status: 200, contentType: "text/html", body: html })
    if (u.startsWith(ORIGIN + "/__font/")) {
      const file = fontFiles.get(u.split("/").pop())
      if (file && existsSync(file)) return r.respond({ status: 200, contentType: "font/woff2", headers: { "access-control-allow-origin": "*" }, body: readFileSync(file) })
    }
    if (u.startsWith(ORIGIN + "/api/push/web")) {
      web.push({ method: r.method(), body: r.postData() ? JSON.parse(r.postData()) : null, url: u })
      if (r.method() === "GET") return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ publicKey: KEY, saved: u.includes("endpoint=") ? true : null }) })
      await sleep(150)
      return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
    }
    if (u.startsWith(ORIGIN + "/api/community/") && r.method() === "PATCH") {
      patches.push({ url: u, body: JSON.parse(r.postData() || "{}"), at: Date.now(), done: Date.now() + 200 })
      await sleep(200)
      return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
    }
    if (u.startsWith(ORIGIN + "/api/me/push")) {
      if (r.method() === "PATCH") {
        const entry = { body: JSON.parse(r.postData() || "{}"), at: Date.now(), done: 0 }
        patches.push(entry)
        await sleep(300)
        entry.done = Date.now()
        return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
      }
      await sleep(120)
      return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(state) })
    }
    if (u.startsWith("data:") || u.startsWith("blob:")) return r.continue()
    return r.respond({ status: 404, body: "" })
  })
  await p.evaluateOnNewDocument((app, push, webPush) => {
    /* A browser with the Push API, stood in for: the question answers what the probe set, a subscription is a plain object. */
    if (webPush && !app) {
      const perm = { value: "default" }
      window.__permAnswer = "granted"
      const N = function () {}
      Object.defineProperty(N, "permission", { get: () => perm.value })
      N.requestPermission = (cb) => new Promise((res) => setTimeout(() => { perm.value = window.__permAnswer; cb && cb(perm.value); res(perm.value) }, 120))
      window.Notification = N
      window.PushManager = function () {}
      const pm = {
        getSubscription: async () => window.__sub || null,
        subscribe: async (o) => {
          const key = o.applicationServerKey
          window.__sub = { endpoint: "https://push.example.net/sub/abc", options: { applicationServerKey: key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) }, toJSON() { return { endpoint: this.endpoint, keys: { p256dh: "p256", auth: "auth" } } }, unsubscribe: async () => { window.__sub = null; return true } }
          return window.__sub
        },
      }
      const reg = { active: { scriptURL: location.origin + "/storelib-push-sw.js" }, pushManager: pm }
      Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistrations: async () => (window.__reg ? [window.__reg] : []), register: async () => { window.__reg = reg; return reg } } })
    } else if (!app) {
      /* A browser with no Push API at all. */
      try { delete window.PushManager } catch {}
    }
    window.__probeSearch = app ? "app=1" : ""
    if (app) window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios" }
    window.__pushStub = { state: "prompt", answer: "denied", calls: [], ...(push || {}) }
    document.addEventListener("pointerdown", () => { window.__lastTap = Math.round(performance.now()) }, true)
  }, app, push, webPush)
  await p.goto(`${ORIGIN}/account/settings?section=notifications`, { waitUntil: "load" })
  await p.waitForSelector('[data-account-card="push-kinds"]', { timeout: 15000 })
  await sleep(350)
  return { p, errors, patches, web }
}

async function layout(p, phone) {
  return p.evaluate((phone) => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth
    const small = []
    const panel = document.querySelector("[data-account-panel]")
    for (const el of panel ? panel.querySelectorAll("button, [role=switch], select") : []) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || el.closest("[aria-hidden=true]")) continue
      if (phone && r.height < 40) small.push([el.textContent?.trim().slice(0, 20) || el.getAttribute("aria-label"), Math.round(r.height)])
    }
    const cards = [...document.querySelectorAll("[data-account-card]")].map((c) => c.getAttribute("data-account-card"))
    /* Nothing overlaps: each row's text ends before its control starts. */
    const overlaps = []
    for (const row of document.querySelectorAll("[data-privacy-row]")) {
      const text = row.firstElementChild?.getBoundingClientRect()
      const ctl = row.lastElementChild?.getBoundingClientRect()
      if (text && ctl && row.children.length > 1 && text.right > ctl.left + 1) overlaps.push(row.getAttribute("data-privacy-row"))
    }
    return { overflow, small, cards, overlaps }
  }, phone)
}

const stub = (p) => p.evaluate(() => window.__pushStub.calls.map((c) => c[0]))

/* ── A browser ─────────────────────────────────────────────────────────── */
const mine = (patches) => patches.filter((x) => !x.url && !("tz" in x.body))
for (const [name, vp] of [["1440", DESK], ["390", PHONE]]) {
  console.log(`\nIn a browser at ${name}`)
  const { p, errors, patches, web } = await open(vp)
  await p.waitForSelector("[data-privacy-row=browser-push]", { timeout: 5000 }).catch(() => null)
  await sleep(200)
  const l = await layout(p, vp === PHONE)
  expect(l.overflow <= 0, "no sideways scroll", l.overflow)
  expect(l.small.length === 0, "every switch, button and select is at least 40px tall", l.small)
  expect(l.overlaps.length === 0, "no row's words run under its switch", l.overlaps)
  expect(["notifications", "push-kinds", "quiet-hours", "notify-communities", "notify-email"].every((c) => l.cards.includes(c)), "the five cards for a moderator in two communities", l.cards)
  expect((await p.$eval("#push-kind-likes", (e) => e.getAttribute("aria-checked"))) === "false", "likes shows as off, as saved")
  expect(patches.some((x) => x.body.tz && !x.url), "the browser's zone is saved quietly on load", patches.map((x) => x.body))
  await p.screenshot({ path: join(shots, `web-${name}.png`), fullPage: true })
  expect((await stub(p)).length === 0, "the push plugin is never touched in a browser", await stub(p))
  const press = (sel) => (vp === PHONE ? p.tap(sel) : p.click(sel))

  /* This browser: on, then off. */
  expect((await p.$eval("#browser-push-switch", (e) => e.getAttribute("aria-checked"))) === "false" && (await p.$("[data-push-no-device]")) === null, "This browser is offered, off, instead of the app line")
  await press("#browser-push-switch")
  await p.waitForFunction(() => document.querySelector("#browser-push-switch")?.getAttribute("aria-checked") === "true" && !document.querySelector("#browser-push-switch")?.getAttribute("aria-busy"), { timeout: 5000 }).catch(() => null)
  await sleep(300)
  const posted = web.find((w) => w.method === "POST")
  expect(!!posted && posted.body?.subscription?.endpoint === "https://push.example.net/sub/abc", "on: the browser is asked, subscribes and is saved (POST /api/push/web)", web.map((w) => w.method))
  expect((await p.$eval("[data-browser-detail]", (e) => e.getAttribute("data-browser-detail"))) === "on", "and the row says this browser gets them")
  if (name === "390") await p.screenshot({ path: join(shots, "web-390-browser-on.png"), clip: await p.$eval('[data-account-card="notifications"]', (e) => { const r = e.getBoundingClientRect(); return { x: 0, y: r.top + scrollY, width: innerWidth, height: r.height } }) })
  await press("#browser-push-switch")
  await p.waitForFunction(() => document.querySelector("#browser-push-switch")?.getAttribute("aria-checked") === "false", { timeout: 5000 }).catch(() => null)
  await sleep(300)
  const deleted = web.find((w) => w.method === "DELETE")
  expect(!!deleted && deleted.body?.endpoint === "https://push.example.net/sub/abc" && (await p.evaluate(() => window.__sub === null)), "off: unsubscribed and forgotten (DELETE /api/push/web)", web.map((w) => w.method))

  /* The kinds, one save at a time. */
  const k0 = mine(patches).length
  await press("#push-kind-likes")
  await press("#push-kind-posts")
  await sleep(900)
  const kp = mine(patches).slice(k0)
  expect(kp.length === 2 && JSON.stringify(kp[0].body) === '{"push":{"likes":true}}' && JSON.stringify(kp[1].body) === '{"push":{"posts":false}}', "each press saves its kind", kp.map((x) => x.body))
  expect(kp.length === 2 && kp[1].at >= kp[0].done, "two quick presses save one after the other", kp.map((x) => [x.at, x.done]))

  /* Quiet hours. */
  await p.$eval('[data-account-card="quiet-hours"]', (e) => e.scrollIntoView({ block: "center" }))
  await press("#quiet-switch")
  await sleep(500)
  const qp = mine(patches).at(-1)
  const times = await p.evaluate(() => ({ state: document.querySelector("[data-quiet-times]")?.getAttribute("data-quiet-times"), h: Math.round(document.querySelector("[data-quiet-from]")?.getBoundingClientRect().height ?? 0), detail: document.querySelector("[data-quiet-detail]")?.textContent }))
  expect(JSON.stringify(qp?.body) === '{"quiet":{"from":1320,"to":480}}' && times.state === "open" && times.h >= 40 && /22:00 to 08:00/.test(times.detail ?? ""), "the quiet switch saves 22:00 to 08:00 and opens the times", { body: qp?.body, times })
  await p.select("[data-quiet-to]", String(7 * 60))
  await sleep(500)
  expect(JSON.stringify(mine(patches).at(-1)?.body) === '{"quiet":{"from":1320,"to":420}}', "a time saves on change", mine(patches).at(-1)?.body)
  expect(/After 10 pushes in a day/.test(await p.$eval("[data-daily-limit]", (e) => e.textContent)), "the daily limit is said in one line")
  if (name === "390") await p.screenshot({ path: join(shots, "web-390-quiet.png"), clip: await p.$eval('[data-account-card="quiet-hours"]', (e) => { const r = e.getBoundingClientRect(); return { x: 0, y: r.top + scrollY - 8, width: innerWidth, height: r.height + 16 } }) })

  /* A community: open, level, a kind, fold. */
  await p.$eval('[data-account-card="notify-communities"]', (e) => e.scrollIntoView({ block: "start" }))
  const summary = await p.$eval(`[data-notify-community="${C1}"] [data-community-summary]`, (e) => e.textContent)
  expect(/Everything but likes, 1 off here/.test(summary), "a community's row says its level and what is off there", summary)
  await press(`[data-notify-community="${C1}"] [data-notify-community-toggle]`)
  /* The fold opening, sampled each frame: its height only grows, never jumps back. */
  const growth = await p.evaluate(async (id) => {
    const panel = document.querySelector(`[data-notify-community="${id}"] [data-community-panel]`)
    const hs = []
    for (let i = 0; i < 20; i++) {
      hs.push(Math.round(panel.getBoundingClientRect().height))
      await new Promise((r) => requestAnimationFrame(r))
    }
    return hs
  }, C1)
  const grows = growth.every((h, i) => i === 0 || h >= growth[i - 1] - 1) && growth.at(-1) > 200 && growth.some((h) => h > 0 && h < growth.at(-1))
  expect(grows, "it opens smoothly: its height rises frame by frame to the end", growth)
  await sleep(250)
  if (name === "390") await p.screenshot({ path: join(shots, "web-390-community-open.png"), clip: await p.$eval('[data-account-card="notify-communities"]', (e) => { const r = e.getBoundingClientRect(); return { x: 0, y: r.top + scrollY - 8, width: innerWidth, height: r.height + 16 } }) })
  else await p.screenshot({ path: join(shots, "web-1440-community-open.png"), clip: await p.$eval('[data-account-card="notify-communities"]', (e) => { const r = e.getBoundingClientRect(); return { x: r.left - 16, y: r.top + scrollY - 16, width: r.width + 32, height: r.height + 32 } }) })
  const lo = await layout(p, vp === PHONE)
  expect(lo.overflow <= 0 && lo.small.length === 0, "open, it still fits: no sideways scroll, 40px targets", lo)
  await p.select(`[data-notify-community="${C1}"] [data-community-level]`, "all")
  await sleep(400)
  const lp = patches.filter((x) => x.url).at(-1)
  expect(!!lp && lp.url.endsWith(`/api/community/${C1}/me`) && JSON.stringify(lp.body) === '{"notifyLevel":"all"}', "its level saves through the community's own route", lp)
  await press(`#community-${C1}-likes`)
  await sleep(500)
  expect(JSON.stringify(mine(patches).at(-1)?.body) === JSON.stringify({ community: { id: C1, push: { likes: true } } }), "a kind there saves for that community alone", mine(patches).at(-1)?.body)
  expect(/^Everything$/.test((await p.$eval(`[data-notify-community="${C1}"] [data-community-summary]`, (e) => e.firstChild?.textContent ?? e.textContent)).trim()), "and the row's line follows")
  await press(`[data-notify-community="${C1}"] [data-notify-community-toggle]`)
  await sleep(350)
  expect((await p.$eval(`[data-notify-community="${C1}"] [data-community-panel]`, (e) => Math.round(e.getBoundingClientRect().height))) === 0, "and folds away again")

  /* The weekly digest. */
  await p.$eval('[data-account-card="notify-email"]', (e) => e.scrollIntoView({ block: "center" }))
  await press("#weekly-digest-switch")
  await sleep(500)
  expect(JSON.stringify(mine(patches).at(-1)?.body) === '{"email":{"weekly_digest":true}}', "the weekly digest saves its opt in", mine(patches).at(-1)?.body)
  if (name === "390") await p.screenshot({ path: join(shots, "web-390-email.png"), clip: await p.$eval('[data-account-card="notify-email"]', (e) => { const r = e.getBoundingClientRect(); return { x: 0, y: r.top + scrollY - 8, width: innerWidth, height: r.height + 16 } }) })

  /* The main switch off greys and disables everything that depends on it. */
  await p.$eval("#push-switch", (e) => e.scrollIntoView({ block: "center" }))
  await press("#push-switch")
  await sleep(700)
  const off = await p.evaluate(() => ({ live: document.querySelector("[data-push-kinds]")?.getAttribute("data-push-kinds"), disabled: [...document.querySelectorAll("[id^=push-kind-]")].every((b) => b.disabled), quiet: document.querySelector("#quiet-switch")?.disabled, opacity: getComputedStyle(document.querySelector("[data-push-kinds]")).opacity }))
  expect(patches.some((x) => JSON.stringify(x.body) === '{"enabled":false}') && off.live === "off" && off.disabled && off.quiet && Number(off.opacity) < 0.7, "the main switch off: saved, the kinds and quiet hours greyed and disabled", off)
  if (name === "390") await p.screenshot({ path: join(shots, `web-390-push-off.png`), fullPage: true })
  expect((await stub(p)).length === 0, "still nothing asked of a phone", await stub(p))
  expect(errors.length === 0, "no page errors", errors)
  await p.close()
}

console.log("\nA browser without the Push API")
{
  const { p, errors } = await open(PHONE, { webPush: false })
  await sleep(300)
  expect((await p.$("[data-push-no-device]")) !== null && (await p.$("#browser-push-switch")) === null, "no browser row: the one line about the app instead")
  expect(errors.length === 0, "no page errors", errors)
  await p.close()
}

/* ── The app: not asked yet, push on, the person says no ───────────────── */
console.log("\nIn the app (iOS), not asked yet, push on: Allow, then No")
{
  const { p, errors } = await open(PHONE, { app: true, push: { state: "prompt", answer: "denied" } })
  await sleep(300)
  const launch = await stub(p)
  expect(launch.includes("check") && !launch.includes("request"), "launch and the screen only read the permission", launch)
  expect((await p.$("[data-phone-allow]")) !== null, "This phone: Allow is offered")
  const l = await layout(p, true)
  expect(l.overflow <= 0 && l.small.length === 0 && l.overlaps.length === 0, "phone layout: no sideways scroll, 40px targets, nothing overlapping", l)
  await p.screenshot({ path: join(shots, "app-390-allow.png"), fullPage: true })
  await p.tap("[data-phone-allow]")
  await sleep(600)
  const calls = await p.evaluate(() => window.__pushStub.calls)
  const asks = calls.filter((c) => c[0] === "request")
  expect(asks.length === 1 && asks[0][2] > 0 && asks[0][1] - asks[0][2] < 1000, "Allow asks once, straight from the tap", asks)
  const denied = await p.$eval("[data-phone-permission=denied]", (e) => e.textContent).catch(() => "")
  expect(/Notifications are off for Storelib on this phone/.test(denied) && /Settings, Notifications, Storelib/.test(denied), "a no explains where to turn it on", denied.slice(0, 160))
  const l2 = await layout(p, true)
  expect(l2.overflow <= 0 && l2.small.length === 0, "the explanation fits the phone", l2)
  await p.screenshot({ path: join(shots, "app-390-denied.png"), fullPage: true })
  const before = (await stub(p)).filter((c) => c === "check").length
  await p.tap("[data-phone-recheck]")
  await sleep(300)
  expect((await stub(p)).filter((c) => c === "check").length === before + 1 && (await stub(p)).filter((c) => c === "request").length === 1, "Check again reads the phone again, without asking")
  expect(errors.length === 0, "no page errors", errors)
  await p.close()
}

/* ── The app: push off, turned on: the tap asks, the phone says yes ────── */
console.log("\nIn the app, push off, turned on: asked from that tap, then registered")
{
  const { p, errors, patches } = await open(PHONE, { app: true, push: { state: "prompt", answer: "granted" }, state: { ...STATE, enabled: false, devices: 1, moderates: false } })
  await sleep(300)
  expect(!(await stub(p)).includes("request") && (await p.$("[data-phone-allow]")) === null, "with push off nothing is asked and no Allow is shown")
  expect((await p.$('[data-privacy-row="report-digest"]')) === null && (await p.$('[data-privacy-row="weekly-digest"]')) !== null, "not a moderator: the weekly digest, no report summary")
  await p.tap("#push-switch")
  await sleep(800)
  const calls = await p.evaluate(() => window.__pushStub.calls)
  const ask = calls.find((c) => c[0] === "request")
  expect(!!ask && ask[1] - ask[2] < 1000, "turning push on asks, from that tap", calls)
  expect(calls.some((c) => c[0] === "register"), "a yes registers this phone at once", calls.map((c) => c[0]))
  expect((await p.$("[data-phone-permission=granted]")) !== null, "and says notifications are allowed")
  expect(patches.some((x) => JSON.stringify(x.body) === '{"enabled":true}'), "the switch is saved on")
  await p.screenshot({ path: join(shots, "app-390-granted.png"), fullPage: true })
  expect(errors.length === 0, "no page errors", errors)
  await p.close()
}

/* ── The app: already allowed at launch ─────────────────────────────────── */
console.log("\nIn the app, already allowed")
{
  const { p, errors } = await open(PHONE, { app: true, push: { state: "granted", answer: "granted" } })
  await sleep(400)
  const calls = await stub(p)
  expect(calls.includes("register") && !calls.includes("request"), "launch registers the phone without asking", calls)
  expect((await p.$("[data-phone-allow]")) === null && (await p.$("[data-phone-permission]")) === null, "nothing about permission is drawn when it is simply on")
  expect(errors.length === 0, "no page errors", errors)
  await p.close()
}

await browser.close()
rmSync(stubs, { recursive: true, force: true })
console.log(`\nShots: ${shots}`)
console.log(broken ? `\n${broken} problem(s)` : "\nAll good")
process.exit(broken ? 1 : 0)
