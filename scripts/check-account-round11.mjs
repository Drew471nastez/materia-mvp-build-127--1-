/**
 * ===========================================================================
 *  THE ACCOUNT, ROUND 11, MEASURED AND PHOTOGRAPHED
 * ===========================================================================
 * The real profile center and Settings (scripts/render-account-round11.tsx)
 * in the account layout's shape, with Storelib's header, a footer and the
 * phone's real tab bar, at 390x844 and 1440x900:
 *
 *   PHOTO       a picture chosen in Settings goes straight up: no sheet
 *               ever appears, the picture is in the circle on the next
 *               frames with the progress ring, the upload goes, and nothing
 *               on the page moves
 *   BACK        Settings' back: the press shows on the first frame after the
 *               finger lands, one tap is one navigation, a double tap is
 *               still one; the way back (/account) was read ahead once
 *               Settings was idle
 *   COVER       /account's band 157 / 233 / 312 tall and the photo 125 / 142,
 *               straddling the band's edge
 *   SAVE        the sticky Save bar: hidden with nothing to change; a change
 *               brings it up (frames sampled: it only rises, translate only);
 *               at 390 with the tab bar it stands on the tab bar, its white
 *               running on under it with no strip of page between; with a
 *               field focused (the tab bar away) and with no tab bar at all
 *               it is at the foot of the screen; at 1440 Save ends on the
 *               cards' right edge; at every one the page is padded so the
 *               last field and the footer scroll clear of it; Discard and
 *               Save take it back down
 *   WARM        the tab bar reads /account ahead; a tap on Profile lands
 *               with no skeleton on any frame; on /account the Settings pill
 *               and Edit profile are read ahead, and the pill lands on
 *               Settings with no skeleton on any frame
 *
 *   PROBE_CSS=source node scripts/check-account-round11.mjs
 * Screenshots go to SHOTS_DIR (printed at the end): look at them.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
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
const stubs = join(root, ".account-round11-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-account-r11-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const only = (part) => !process.env.PROBE_ONLY || process.env.PROBE_ONLY.split(",").includes(part)
const ORIGIN = "https://storelib.com"

const STUBS = {
  /* The router: a push changes the path after __navMs (a page the router already has), and every call is written down. */
  "next-navigation.js": `import { useSyncExternalStore } from "react"
const nav = window.__nav
const subs = new Set()
const notify = () => subs.forEach((f) => f())
const subscribe = (f) => { subs.add(f); return () => subs.delete(f) }
const log = (k, a, o) => (window.__router ||= []).push([k, a, o && o.kind ? o.kind : null, Math.round(performance.now())])
const go = (h) => { const [p, s] = String(h).split("?"); nav.path = p; nav.search = s ? "?" + s : ""; window.__arrivedAt = performance.now(); notify() }
window.__go = go
const router = { push: (h) => { log("push", h); setTimeout(() => go(h), window.__navMs ?? 40) }, replace: (h) => { log("replace", h); go(h) }, prefetch: (h, o) => log("prefetch", h, o), back: () => log("back"), forward: () => log("forward"), refresh: () => log("refresh") }
export const usePathname = () => useSyncExternalStore(subscribe, () => nav.path, () => nav.path)
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(useSyncExternalStore(subscribe, () => nav.search, () => nav.search))
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`,
  /* A link press: its own onClick first; if nothing took it, the router goes there. */
  "next-link.jsx": `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (e.defaultPrevented) return; e.preventDefault(); (window.__router ||= []).push(["link", href, null, Math.round(performance.now())]); setTimeout(() => window.__go(href), window.__navMs ?? 40) } }, children) })
export const useLinkStatus = () => ({ pending: false })
`,
  "next-image.jsx": `import React from "react"
export default function Image({ src, alt, fill, priority, preload, sizes, unoptimized, quality, className, style, ...rest }) {
  return React.createElement("img", { src: typeof src === "string" ? src : "", alt, className, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style, ...rest })
}
`,
  "supabase-client.jsx": `const USER = { id: "user-1", email: "ava@example.com", user_metadata: {} }
function chain(table) {
  const b = {
    select() { return b }, eq() { return b }, is() { return b }, limit() { return b }, order() { return b }, single() { return b }, maybeSingle() { return b }, or() { return b }, in() { return b },
    update(patch) { (window.__updates ||= []).push(patch); return b },
    then(res) { setTimeout(() => res({ data: table === "profiles" ? { display_name: "Ava Stone", avatar_url: null, username: "ava", is_creator: false } : null, error: null }), 120) },
  }
  return b
}
export function isNativePlatform() { return false }
export const capacitorStorage = {}
export function createClient() {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: USER }, error: null }),
      getSession: async () => ({ data: { session: { access_token: "probe-token", user: USER } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({}),
    },
    from: (table) => chain(table),
    rpc: () => chain(null),
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: (p) => ({ data: { publicUrl: "https://placeholder.supabase.co/storage/v1/object/public/avatars/" + p } }) }) },
    channel: () => ({ on() { return this }, subscribe() { return this } }),
    removeChannel() {},
  }
}
`,
}
for (const [k, v] of Object.entries(STUBS)) writeFileSync(join(stubs, k), v)

let html
try {
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-account-round11.tsx")],
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

/* A picture to choose in Settings: 1200x800. */
const picture = join(stubs, "pick.png")
await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#d8cfc4" } })
  .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><circle cx="600" cy="330" r="150" fill="#8a6f5a"/><rect x="430" y="520" width="340" height="300" rx="150" fill="#8a6f5a"/></svg>`) }])
  .png().toFile(picture)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, protocolTimeout: 240000, args: ["--no-sandbox", "--hide-scrollbars", "--allow-file-access-from-files"] })
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }

async function open(vp, address) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e?.stack || e).split("\n").slice(0, 4).join(" | ").slice(0, 400)))
  await p.setRequestInterception(true)
  p.on("request", async (r) => {
    const u = r.url()
    if (u.startsWith(ORIGIN) && r.resourceType() === "document") return r.respond({ status: 200, contentType: "text/html", body: html })
    if (u.startsWith(ORIGIN + "/__font/")) {
      const file = fontFiles.get(u.split("/").pop())
      if (file && existsSync(file)) return r.respond({ status: 200, contentType: "font/woff2", headers: { "access-control-allow-origin": "*" }, body: readFileSync(file) })
    }
    if (u.startsWith("https://placeholder.supabase.co/storage/v1/object/avatars/")) {
      if (r.method() === "OPTIONS") return r.respond({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST" } })
      await sleep(700)
      return r.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: '{"Key":"avatars/x"}' })
    }
    if (u.startsWith(ORIGIN + "/api/account/avatar")) { await sleep(150); return r.respond({ status: 200, contentType: "application/json", body: "{}" }) }
    if (u.startsWith(ORIGIN + "/api/profile/username")) return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ available: true }) })
    if (u.startsWith(ORIGIN + "/api/me/push")) return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ supported: false }) })
    if (u.startsWith(ORIGIN + "/api/storage/uploaded") || u.startsWith(ORIGIN + "/api/profile/cover")) return r.respond({ status: 200, contentType: "application/json", body: "{}" })
    if (u.startsWith(ORIGIN + "/api/platform/flags")) return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ communities: true }) })
    if (u.startsWith(ORIGIN + "/")) {
      const file = join(root, "public", decodeURIComponent(new URL(u).pathname))
      if (existsSync(file) && statSync(file).isFile()) return r.respond({ status: 200, contentType: file.endsWith(".svg") ? "image/svg+xml" : file.endsWith(".png") ? "image/png" : "application/octet-stream", body: readFileSync(file) })
    }
    if (u.startsWith("data:") || u.startsWith("blob:") || u.startsWith("file:")) return r.continue()
    return r.respond({ status: 404, body: "" })
  })
  const [path, search] = address.split("?")
  await p.evaluateOnNewDocument((path, search) => {
    window.__nav = { path, search: "" }
    window.__probeSearch = search
    try {
      localStorage.clear()
      localStorage.setItem("_sl_auth_v1", JSON.stringify({ signedIn: true, userId: "user-1", avatarUrl: null, displayName: "Ava Stone", username: "ava", isSeller: false }))
    } catch {}
  }, path, search || "")
  await p.goto(`${ORIGIN}${path}${search ? `?${search}` : ""}`, { waitUntil: "load" })
  await p.evaluate(() => Promise.all([document.fonts.load("400 16px Inter"), document.fonts.load("600 16px Inter")]).catch(() => {}).then(() => document.fonts.ready))
  await sleep(500)
  return { p, errors }
}

const rect = (p, sel) => p.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), right: Math.round(r.right) } }, sel)
const routerLog = (p) => p.evaluate(() => window.__router || [])
const touch = (cdp, type, pt) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: pt.x, y: pt.y }] })
const centreOf = (p, sel) => p.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, sel)

/* Frame by frame from now: the bar's place and the first frame anything shows, until stopped. */
const startFrames = (p) => p.evaluate(() => {
  window.__frames = []
  window.__downAt = null
  /* When the page's own handler saw the finger land (a capture listener), which is what a frame is counted from. */
  document.addEventListener("pointerdown", () => { if (window.__downAt === null) window.__downAt = performance.now() }, { capture: true })
  window.__framesOn = true
  const tick = () => {
    const bar = document.querySelector("[data-account-save-bar]")
    const back = document.querySelector("[data-back-control]")
    window.__frames.push({
      t: performance.now(),
      barTop: bar ? Math.round(bar.getBoundingClientRect().top * 10) / 10 : null,
      barTranslate: bar ? getComputedStyle(bar).translate : null,
      /* The matrix property (read by name), which must stay "none": the bar moves on translate alone. */
      barMatrix: bar ? getComputedStyle(bar).getPropertyValue("trans" + "form") : null,
      pressed: back ? back.hasAttribute("data-pressed") : null,
      backBg: back ? getComputedStyle(back).backgroundColor : null,
      skeleton: !!document.querySelector("[data-account-skeleton], [aria-busy=true]"),
      hub: !!document.querySelector("[data-account-hub]"),
      settings: !!document.querySelector("[data-account-settings]"),
      sheet: !!document.querySelector("[data-photo-crop]") || [...document.querySelectorAll("[role=dialog]")].some((d) => { const r = d.getBoundingClientRect(); const cs = getComputedStyle(d); return !d.closest("header, #platform-header-root") && r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && Number(cs.opacity) > 0 }),
      preview: !!document.querySelector("[data-photo-preview]"),
      ring: !!document.querySelector("[data-photo-progress]"),
    })
    if (window.__framesOn) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
const stopFrames = (p) => p.evaluate(() => { window.__framesOn = false; return window.__frames })

try {
  /* ── PHOTO: straight up ──────────────────────────────────────────────── */
  if (only("photo")) for (const [label, vp] of [["390", PHONE], ["1440", DESK]]) {
    console.log(`\n${label}: Settings, a photo chosen`)
    const { p, errors } = await open(vp, "/account/settings")
    if (!(await p.$("[data-account-photo-input]"))) { console.log(errors, await p.evaluate(() => document.body.innerText.slice(0, 600))); process.exit(1) }
    const before = { row: await rect(p, "[data-account-photo-row]"), name: await rect(p, "[data-account-name]") }
    await startFrames(p)
    const t0 = await p.evaluate(() => performance.now())
    const input = await p.$("[data-account-photo-input]")
    await input.uploadFile(picture)
    await p.waitForSelector("[data-photo-preview]", { timeout: 4000 })
    await sleep(80)
    await p.screenshot({ path: join(shots, `photo-${label}-uploading.png`), clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 420) } })
    await sleep(1500)
    const frames = await stopFrames(p)
    const firstPreview = frames.find((f) => f.preview)
    if (frames.some((f) => f.sheet)) console.log("  info  dialogs on screen:", await p.evaluate(() => [...document.querySelectorAll("[role=dialog]")].map((d) => (d.getAttribute("aria-label") || d.className).slice(0, 120))))
    expect(!frames.some((f) => f.sheet), "no sheet appears at any frame between the choice and the save", frames.filter((f) => f.sheet).length)
    expect(!!firstPreview && frames.some((f) => f.ring), "the picture is in the circle with the progress ring", { previewAfterMs: firstPreview ? Math.round(firstPreview.t - t0) : null })
    const after = { row: await rect(p, "[data-account-photo-row]"), name: await rect(p, "[data-account-name]") }
    expect(JSON.stringify(before) === JSON.stringify(after), "nothing on the page moved", { before, after })
    const done = await p.evaluate(() => ({ ring: !!document.querySelector("[data-photo-progress]"), error: document.querySelector("[data-account-photo-error]")?.textContent ?? null, preview: !!document.querySelector("[data-photo-preview]") }))
    expect(done.preview && !done.ring && !done.error, "uploaded and saved: the photo stays, the ring has gone, no error", done)
    expect(errors.length === 0, "no errors", errors)
    await p.screenshot({ path: join(shots, `photo-${label}-done.png`), clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 420) } })
    await p.close()
  }

  /* ── BACK: first frame, one tap, one navigation ─────────────────────── */
  if (only("back")) {
    console.log("\n390: Settings' back, a finger, CPU slowed 4x")
    for (const double of [false, true]) {
      const { p, errors } = await open(PHONE, "/account/settings")
      await sleep(1200)
      const ahead = (await routerLog(p)).filter((e) => e[0] === "prefetch").map((e) => `${e[1]}${e[2] ? ` (${e[2]})` : ""}`)
      if (!double) expect(ahead.includes("/account (full)"), "the way back (/account) was read ahead, whole, once Settings was idle", ahead)
      const cdp = await p.createCDPSession()
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      const pt = await centreOf(p, "[data-back-control]")
      const rest = await p.evaluate(() => getComputedStyle(document.querySelector("[data-back-control]")).backgroundColor)
      await startFrames(p)
      await sleep(60)
      const tDown = await p.evaluate(() => performance.now())
      await touch(cdp, "touchStart", pt)
      await sleep(90)
      await touch(cdp, "touchEnd", pt)
      if (double) {
        await sleep(110)
        await touch(cdp, "touchStart", pt)
        await sleep(60)
        await touch(cdp, "touchEnd", pt)
      }
      await sleep(700)
      const frames = await stopFrames(p)
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
      const downAt = (await p.evaluate(() => window.__downAt)) ?? tDown
      const after = frames.filter((f) => f.t >= downAt)
      const first = after.findIndex((f) => f.pressed && f.backBg !== rest)
      const navs = (await routerLog(p)).filter((e) => e[0] === "push" || e[0] === "back" || e[0] === "link" || e[0] === "replace")
      if (!double) {
        expect(first === 0 || first === 1, "the press shows on the first frame after the finger lands (a darker fill, no wait)", { frame: first + 1, ms: first >= 0 ? Math.round(after[first].t - downAt) : null, rest, pressed: after[first]?.backBg })
        expect(navs.length === 1, "one tap, one navigation", navs)
      } else expect(navs.length === 1, "a double tap is still one navigation", navs)
      expect(errors.length === 0, "no errors", errors)
      await p.close()
    }
  }

  /* ── COVER AND PHOTO SIZES ─────────────────────────────────────────── */
  if (only("cover")) for (const [w, band, photo] of [[390, 157, 125], [800, 233, 142], [1440, 312, 142]]) {
    const { p, errors } = await open({ width: w, height: 900, deviceScaleFactor: 1, isMobile: w < 640, hasTouch: w < 640 }, "/account")
    const m = await p.evaluate(() => {
      const r = (s) => { const el = document.querySelector(s); if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height), mid: Math.round(b.left + b.width / 2) } }
      return { band: r("[data-profile-cover-band]"), avatar: r("[data-profile-header] [data-account-avatar]"), sideways: document.documentElement.scrollWidth - innerWidth }
    })
    expect(m.band?.h === band && m.avatar?.w === photo && m.avatar?.h === photo, `/account at ${w}: the cover ${band}px tall, the photo ${photo}px`, m)
    expect(Math.abs(m.avatar.top + m.avatar.h / 2 - m.band.bottom) <= 1, "  the photo's middle on the band's lower edge", { avatarMid: m.avatar.top + m.avatar.h / 2, bandBottom: m.band.bottom })
    expect(m.sideways <= 0 && errors.length === 0, "  nothing sideways, no errors", { sideways: m.sideways, errors })
    await p.screenshot({ path: join(shots, `cover-${w}.png`) })
    await p.close()
  }

  /* ── SAVE: the sticky bar ──────────────────────────────────────────── */
  if (only("save")) for (const [label, vp, address] of [["390-tabs", PHONE, "/account/settings"], ["390-no-tabs", PHONE, "/account/settings?tabs=no"], ["1440", DESK, "/account/settings"]]) {
    console.log(`\n${label}: Save changes`)
    const { p, errors } = await open(vp, address)
    const hidden = await p.evaluate(() => { const b = document.querySelector("[data-account-save-bar]"); const r = b.getBoundingClientRect(); return { state: b.getAttribute("data-account-save-bar"), top: Math.round(r.top), vis: getComputedStyle(b).visibility, pad: document.body.style.paddingBottom } })
    expect(hidden.state === "hidden" && hidden.top >= vp.height && hidden.vis === "hidden", "nothing to save: no bar on screen", hidden)
    expect(!(await p.$("[data-account-card=profile] [data-account-save]")), "  and no Save button left inside the card", null)
    /* A change: the bar rises. */
    await p.click("[data-account-name]", { clickCount: 3 })
    await startFrames(p)
    await p.keyboard.type("Ava Stone Lee")
    await sleep(600)
    const rise = (await stopFrames(p)).filter((f) => f.barTop !== null)
    const tops = rise.map((f) => f.barTop)
    const moving = tops.filter((t, i) => i > 0 && t !== tops[i - 1]).length
    expect(moving >= 4 && tops.every((t, i) => i === 0 || t <= tops[i - 1] + 0.5), "a change brings it up over several frames, only ever rising", tops.slice(0, 18))
    expect(rise.every((f) => f.barMatrix === "none"), "  translate only (no matrix, no size change)", [...new Set(rise.map((f) => f.barMatrix))])
    const focused = await p.evaluate(() => {
      const bar = document.querySelector("[data-account-save-bar]").getBoundingClientRect()
      const row = document.querySelector("[data-account-save-row]").getBoundingClientRect()
      const tabs = document.querySelector("[data-buyer-tab-bar]")
      return { barBottom: Math.round(bar.bottom), rowBottom: Math.round(row.bottom), tabs: tabs?.getAttribute("data-buyer-tab-bar") ?? null, h: innerHeight }
    })
    if (label === "390-tabs") {
      expect(focused.tabs === "away" && Math.abs(focused.rowBottom - (focused.h - 12)) <= 1, "typing (the tab bar away): the bar comes down to the foot of the screen with it", focused)
      await p.screenshot({ path: join(shots, `save-${label}-typing.png`) })
      /* Done typing: the tab bar comes back and the bar stands on it. */
      await p.evaluate(() => document.activeElement.blur())
      await sleep(600)
    }
    const m = await p.evaluate(() => {
      const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width) } }
      const bar = document.querySelector("[data-account-save-bar]")
      const tabs = document.querySelector("[data-buyer-tab-bar]")
      return {
        state: bar.getAttribute("data-account-save-bar"),
        bar: r(bar),
        row: r(document.querySelector("[data-account-save-row]")),
        save: r(bar.querySelector("[data-account-save]")),
        discard: r(bar.querySelector("[data-account-discard]")),
        tabs: tabs && tabs.getAttribute("data-buyer-tab-bar") === "shown" ? r(tabs) : null,
        card: r(document.querySelector("[data-account-card=profile]")),
        h: innerHeight,
        bg: getComputedStyle(bar).backgroundColor,
        pad: document.body.style.paddingBottom,
        sideways: document.documentElement.scrollWidth - innerWidth,
      }
    })
    expect(m.state === "shown" && m.bg === "rgb(255, 255, 255)" && m.bar.bottom >= m.h, "its own white surface, down to the screen's foot", { state: m.state, bg: m.bg, bottom: m.bar.bottom, h: m.h })
    if (label === "390-tabs") {
      expect(m.tabs && m.row.bottom <= m.tabs.top - 11 && m.bar.top < m.tabs.top && m.bar.bottom >= m.tabs.bottom, "with the tab bar: the row stands 12px above it and the white runs on under it (no strip of page between)", { row: m.row, tabs: m.tabs, bar: m.bar })
    } else if (label === "390-no-tabs") {
      expect(!m.tabs && Math.abs(m.row.bottom - (m.h - 12)) <= 1, "with no tab bar: at the foot of the screen", { row: m.row, h: m.h })
    } else {
      expect(Math.abs(m.save.right - m.card.right) <= 1 && m.bar.left === 0 && m.bar.w === 1440, "1440: across the window, Save ending on the cards' right edge", { save: m.save, card: m.card })
    }
    expect([m.save, m.discard].every((b) => b.bottom - b.top >= (label === "1440" ? 40 : 44)), "  Save and Discard are full size targets", [m.save.bottom - m.save.top, m.discard.bottom - m.discard.top])
    expect(m.sideways <= 0, "  nothing sideways", m.sideways)
    await p.screenshot({ path: join(shots, `save-${label}-shown.png`) })
    /* Nothing covered: at the very bottom of the page the last field and the footer are above the bar. */
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await sleep(250)
    const end = await p.evaluate(() => {
      const top = document.querySelector("[data-account-save-bar]").getBoundingClientRect().top
      const tabs = document.querySelector("[data-buyer-tab-bar='shown']")
      const cover = Math.min(top, tabs ? tabs.getBoundingClientRect().top : Infinity)
      const bottom = (s) => Math.round(document.querySelector(s).getBoundingClientRect().bottom)
      return { cover: Math.round(cover), bio: bottom("[data-account-bio-field]"), card: bottom("[data-account-card=profile]"), footer: bottom("[data-probe-footer-last]"), pad: document.body.style.paddingBottom }
    })
    expect(end.bio <= end.cover && end.card <= end.cover && end.footer <= end.cover && parseFloat(end.pad) > 0, "scrolled to the end: the last field, the card and the footer all clear the bar (the page is padded for it)", end)
    await p.screenshot({ path: join(shots, `save-${label}-end.png`) })
    /* The bio, the last field, focused and changed near the foot: it is in the clear above the bar. */
    await p.evaluate(() => window.scrollTo(0, 0))
    await sleep(150)
    await p.click("[data-account-discard]")
    await sleep(500)
    const gone = await p.evaluate(() => ({ state: document.querySelector("[data-account-save-bar]").getAttribute("data-account-save-bar"), vis: getComputedStyle(document.querySelector("[data-account-save-bar]")).visibility, name: document.querySelector("[data-account-name]").value }))
    expect(gone.state === "hidden" && gone.vis === "hidden" && gone.name === "Ava Stone", "Discard: the name goes back and the bar goes down", gone)
    await p.evaluate(() => { const el = document.querySelector("[data-account-bio-field]"); el.scrollIntoView({ block: "end" }); window.scrollBy(0, 0) })
    await sleep(150)
    await p.focus("[data-account-bio-field]")
    await p.keyboard.press("End")
    await p.keyboard.press("PageDown")
    await p.keyboard.type(" Weekends.")
    await sleep(900)
    const clear = await p.evaluate(() => {
      const top = document.querySelector("[data-account-save-bar]").getBoundingClientRect().top
      return { bio: Math.round(document.querySelector("[data-account-bio-field]").getBoundingClientRect().bottom), barTop: Math.round(top) }
    })
    expect(clear.bio <= clear.barTop, "typing in the last field as the bar rises: the page moves it into the clear above the bar", clear)
    await p.screenshot({ path: join(shots, `save-${label}-bio.png`) })
    /* Save: the bar goes back down, the update was sent. */
    await p.click("[data-account-save]")
    await sleep(900)
    const saved = await p.evaluate(() => ({ state: document.querySelector("[data-account-save-bar]").getAttribute("data-account-save-bar"), updates: window.__updates || [] }))
    expect(saved.state === "hidden" && saved.updates.length === 1 && /Weekends/.test(saved.updates[0].bio || ""), "Save: sent once, and the bar goes down", saved)
    expect(errors.length === 0, "no errors", errors)
    await p.close()
  }

  /* ── WARM: the tab bar to Profile, and the Settings pill ─────────────── */
  if (only("warm")) {
    console.log("\n390: the tab bar to Profile, then the Settings pill")
    const { p, errors } = await open(PHONE, "/explore")
    await sleep(1600)
    const ahead = (await routerLog(p)).filter((e) => e[0] === "prefetch").map((e) => `${e[1]}${e[2] ? ` (${e[2]})` : ""}`)
    expect(ahead.includes("/account (full)"), "the tab bar has read /account ahead, whole, before any tap", ahead)
    const cdp = await p.createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    const tab = await centreOf(p, "[data-buyer-tab-bar] a[href='/account']")
    await startFrames(p)
    const t0 = await p.evaluate(() => performance.now())
    await touch(cdp, "touchStart", tab)
    await sleep(70)
    await touch(cdp, "touchEnd", tab)
    await sleep(900)
    const frames = (await stopFrames(p)).filter((f) => f.t >= t0)
    const landed = frames.find((f) => f.hub)
    expect(!!landed && !frames.some((f) => f.skeleton), "a tap on Profile lands on the profile with no skeleton on any frame", { landedMs: landed ? Math.round(landed.t - t0) : null, skeleton: frames.filter((f) => f.skeleton).length })
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    await sleep(1600)
    const ahead2 = (await routerLog(p)).filter((e) => e[0] === "prefetch").map((e) => `${e[1]}${e[2] ? ` (${e[2]})` : ""}`)
    expect(ahead2.includes("/account/settings?section=account (full)") && ahead2.includes("/account/settings (full)"), "on the profile, the Settings pill and Edit profile are read ahead, whole", ahead2)
    await p.screenshot({ path: join(shots, "warm-390-account.png") })
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    const pill = await centreOf(p, "[data-profile-owner-pill=settings]")
    await startFrames(p)
    const t1 = await p.evaluate(() => performance.now())
    await touch(cdp, "touchStart", pill)
    await sleep(70)
    await touch(cdp, "touchEnd", pill)
    await sleep(900)
    const f2 = (await stopFrames(p)).filter((f) => f.t >= t1)
    const there = f2.find((f) => f.settings)
    expect(!!there && !f2.some((f) => f.skeleton), "the Settings pill lands on Settings with no skeleton on any frame", { landedMs: there ? Math.round(there.t - t1) : null, skeleton: f2.filter((f) => f.skeleton).length })
    const presses = (await routerLog(p)).filter((e) => e[0] === "prefetch" && e[3] >= t1).length
    expect(presses === 0, "  and the press asked for nothing new: it was already read", presses)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    await sleep(300)
    await p.screenshot({ path: join(shots, "warm-390-settings.png") })
    expect(errors.length === 0, "no errors", errors)
    await p.close()
  }
} finally {
  await browser.close()
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nshots: ${shots}`)
console.log(broken ? `${broken} failed` : "all passed")
process.exit(broken ? 1 : 0)
