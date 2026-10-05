/**
 * ===========================================================================
 *  SETTINGS, NOTIFICATIONS, MEASURED AND PHOTOGRAPHED (round 12)
 * ===========================================================================
 * The real Settings opened on Notifications (scripts/render-community-
 * notify.tsx), at 1440x900 and 390x844, in a browser and in the app with a
 * stubbed Capacitor bridge:
 *
 *   LAYOUT      no sideways scroll, every switch and button at least 40px
 *               tall on a phone, the three cards there for a moderator
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

const KINDS = { posts: true, comments: true, likes: false, mentions: true, messages: true, events: true, followers: true }

async function open(vp, { app = false, state = { enabled: true, devices: 0, kinds: KINDS, emails: { report_digest: true }, moderates: true }, push = null } = {}) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  const patches = []
  p.on("pageerror", (e) => errors.push(String(e?.stack || e).split("\n").slice(0, 3).join(" | ").slice(0, 300)))
  await p.setRequestInterception(true)
  p.on("request", async (r) => {
    const u = r.url()
    if (u.startsWith(ORIGIN) && r.resourceType() === "document") return r.respond({ status: 200, contentType: "text/html", body: html })
    if (u.startsWith(ORIGIN + "/__font/")) {
      const file = fontFiles.get(u.split("/").pop())
      if (file && existsSync(file)) return r.respond({ status: 200, contentType: "font/woff2", headers: { "access-control-allow-origin": "*" }, body: readFileSync(file) })
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
  await p.evaluateOnNewDocument((app, push) => {
    window.__probeSearch = app ? "app=1" : ""
    if (app) window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios" }
    window.__pushStub = { state: "prompt", answer: "denied", calls: [], ...(push || {}) }
    document.addEventListener("pointerdown", () => { window.__lastTap = Math.round(performance.now()) }, true)
  }, app, push)
  await p.goto(`${ORIGIN}/account/settings?section=notifications`, { waitUntil: "load" })
  await p.waitForSelector('[data-account-card="push-kinds"]', { timeout: 15000 })
  await sleep(350)
  return { p, errors, patches }
}

async function layout(p, phone) {
  return p.evaluate((phone) => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth
    const small = []
    const panel = document.querySelector("[data-account-panel]")
    for (const el of panel ? panel.querySelectorAll("button, [role=switch]") : []) {
      const r = el.getBoundingClientRect()
      if (r.width === 0) continue
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
for (const [name, vp] of [["1440", DESK], ["390", PHONE]]) {
  console.log(`\nIn a browser at ${name}`)
  const { p, errors, patches } = await open(vp)
  const l = await layout(p, vp === PHONE)
  expect(l.overflow <= 0, "no sideways scroll", l.overflow)
  expect(l.small.length === 0, "every switch and button is at least 40px tall", l.small)
  expect(l.overlaps.length === 0, "no row's words run under its switch", l.overlaps)
  expect(["notifications", "push-kinds", "notify-email"].every((c) => l.cards.includes(c)), "the three cards for a moderator", l.cards)
  expect((await p.$eval("#push-kind-likes", (e) => e.getAttribute("aria-checked"))) === "false", "likes shows as off, as saved")
  expect((await p.$("[data-push-no-device]")) !== null, "no phone yet: it says how to get them, in one line")
  await p.screenshot({ path: join(shots, `web-${name}.png`), fullPage: true })
  expect((await stub(p)).length === 0, "the push plugin is never touched in a browser", await stub(p))
  const press = (sel) => (vp === PHONE ? p.tap(sel) : p.click(sel))
  await press("#push-kind-likes")
  await press("#push-kind-posts")
  await sleep(900)
  expect(patches.length === 2 && JSON.stringify(patches[0].body) === '{"push":{"likes":true}}' && JSON.stringify(patches[1].body) === '{"push":{"posts":false}}', "each press saves its kind", patches.map((x) => x.body))
  expect(patches.length === 2 && patches[1].at >= patches[0].done, "two quick presses save one after the other", patches.map((x) => [x.at, x.done]))
  expect((await p.$eval("#push-kind-likes", (e) => e.getAttribute("aria-checked"))) === "true", "likes is on now")
  await press("#push-switch")
  await sleep(700)
  const off = await p.evaluate(() => ({ live: document.querySelector("[data-push-kinds]")?.getAttribute("data-push-kinds"), disabled: [...document.querySelectorAll("[id^=push-kind-]")].every((b) => b.disabled), opacity: getComputedStyle(document.querySelector("[data-push-kinds]")).opacity }))
  expect(patches.some((x) => JSON.stringify(x.body) === '{"enabled":false}') && off.live === "off" && off.disabled && Number(off.opacity) < 0.7, "the main switch off: saved, the kinds greyed and disabled", off)
  if (name === "390") await p.screenshot({ path: join(shots, `web-390-push-off.png`), fullPage: true })
  expect((await stub(p)).length === 0, "still nothing asked of a phone", await stub(p))
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
  const { p, errors, patches } = await open(PHONE, { app: true, push: { state: "prompt", answer: "granted" }, state: { enabled: false, devices: 1, kinds: KINDS, emails: { report_digest: true }, moderates: false } })
  await sleep(300)
  expect(!(await stub(p)).includes("request") && (await p.$("[data-phone-allow]")) === null, "with push off nothing is asked and no Allow is shown")
  expect((await p.$('[data-account-card="notify-email"]')) === null, "not a moderator: no report email card")
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
