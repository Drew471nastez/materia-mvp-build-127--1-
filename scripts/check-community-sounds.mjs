/**
 * ===========================================================================
 *  SETTINGS, PREFERENCES: THE SOUNDS SWITCH (round 13, P2 ask 17)
 * ===========================================================================
 * The real Settings opened on Preferences (scripts/render-community-sounds.tsx) at 1440x900 and
 * 390x844: the Sounds row is there ("Likes, comments and posts"), its switch is at least 40px tall,
 * a press turns Sounds off in this browser (storelib:sounds = off, the key the like, comment and post
 * sounds read) and on again, and nothing scrolls sideways. The scaffolding (stubs, bundling) is the
 * notifications probe's (scripts/check-community-notify.mjs).
 *
 *   PROBE_CSS=source node scripts/check-community-sounds.mjs
 *
 * ---- the notifications probe's own header, for its scaffolding: ----
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
const stubs = join(root, ".community-sounds-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-sounds-")), "shots")
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
    entryPoints: [join(root, "scripts/render-community-sounds.tsx")],
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
const VIEWPORTS = [
  ["desktop-1440", { width: 1440, height: 900, deviceScaleFactor: 1 }],
  ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
]
try {
  for (const [label, vp] of VIEWPORTS) {
    console.log(`\n${label}`)
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const u = r.url()
      if (u.startsWith(ORIGIN) && r.resourceType() === "document") return r.respond({ status: 200, contentType: "text/html", body: html })
      if (u.startsWith(ORIGIN + "/__font/")) {
        const file = fontFiles.get(u.split("/").pop())
        if (file && existsSync(file)) return r.respond({ status: 200, contentType: "font/woff2", headers: { "access-control-allow-origin": "*" }, body: readFileSync(file) })
      }
      if (u.startsWith("data:") || u.startsWith("blob:")) return r.continue()
      if (u.startsWith(ORIGIN + "/api/")) return r.respond({ status: 200, contentType: "application/json", body: "{}" })
      return r.respond({ status: 404, body: "" })
    })
    await p.goto(`${ORIGIN}/account/settings?section=preferences`, { waitUntil: "load" })
    await p.waitForSelector('[data-privacy-row="sounds"]', { timeout: 15000 }).catch(() => {})
    await sleep(300)
    const row = await p.evaluate(() => {
      const r = document.querySelector('[data-privacy-row="sounds"]')
      const sw = r?.querySelector('[role="switch"]')
      const b = sw?.getBoundingClientRect()
      return r ? { text: r.textContent.trim(), on: sw?.getAttribute("aria-checked"), h: b ? Math.round(b.height) : 0, overflow: document.documentElement.scrollWidth - innerWidth } : null
    })
    expect(!!row && /Sounds/.test(row.text) && /Likes, comments and posts/.test(row.text), "R13 SOUNDS: Preferences has the Sounds row (likes, comments and posts)", row)
    expect(row?.on === "true" && row.h >= 40, "on by default, its switch at least 40px tall", row)
    expect(row?.overflow <= 0, "nothing scrolls sideways", row?.overflow)
    await p.click('[data-privacy-row="sounds"] [role="switch"]')
    await sleep(250)
    const off = await p.evaluate(() => ({ on: document.querySelector('[data-privacy-row="sounds"] [role="switch"]').getAttribute("aria-checked"), stored: localStorage.getItem("storelib:sounds") }))
    expect(off.on === "false" && off.stored === "off", "a press turns Sounds off in this browser (the key the sounds read)", off)
    await (await p.$('[data-account-card="preferences"]'))?.screenshot({ path: join(shots, `${label}-r13-sounds-off.png`) })
    await p.click('[data-privacy-row="sounds"] [role="switch"]')
    await sleep(250)
    const on = await p.evaluate(() => ({ on: document.querySelector('[data-privacy-row="sounds"] [role="switch"]').getAttribute("aria-checked"), stored: localStorage.getItem("storelib:sounds") }))
    expect(on.on === "true" && on.stored === null, "and on again", on)
    await p.screenshot({ path: join(shots, `${label}-r13-sounds.png`) })
    expect(errors.length === 0, "no page error", errors)
    await p.close()
  }
} finally {
  await browser.close()
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nshots: ${shots}\n`)
console.log(broken ? `${broken} check(s) failed` : "all checks passed")
process.exit(broken ? 1 : 0)
