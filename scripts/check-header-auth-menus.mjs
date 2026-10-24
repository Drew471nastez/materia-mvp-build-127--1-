/**
 * ===========================================================================
 *  THE PHONE'S MENUS ARE NEVER EMPTY AND ALWAYS KNOW WHO IS SIGNED IN
 * ===========================================================================
 * The owner: "when I go to Explore and open the hamburger icon, sometimes it
 * just doesn't display things. Ensure the mobile bottom sheets and the
 * hamburger menus know when I'm logged in or logged out."
 *
 * Renders the real PlatformHeaderClient (scripts/render-header-auth.tsx) at
 * 390x844 with touch, and opens and closes the hamburger again and again:
 * on Explore, a product page and a creator page (the navigator) and on the
 * home page and Pricing (the marketing sheet), moving between them, signing
 * in and out "in another tab" (the storage event and Supabase's broadcast,
 * and once with the storage event alone), with the list answering slowly,
 * failing, never answering and throwing, and with the CPU slowed four
 * times. After every open the sheet on screen is read: it must be up, have
 * rows a person can press, and be the right menu for who is signed in.
 *
 *   node scripts/check-header-auth-menus.mjs
 */
import { build } from "esbuild"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const css = await appCss(root)
const faces = interFaces(root)
const stubs = join(root, ".header-auth-probe")
mkdirSync(stubs, { recursive: true })

const STUBS = {
  "next/navigation": `import { useSyncExternalStore } from "react"
const router = { push: (h) => (window.__pushed ||= []).push(h), replace() {}, prefetch() {}, back() {}, refresh() { window.__refreshed = (window.__refreshed || 0) + 1 } }
const sub = (f) => { window.__nav.subs.add(f); return () => window.__nav.subs.delete(f) }
export const usePathname = () => useSyncExternalStore(sub, () => window.__nav.path)
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams("")
export const useParams = () => ({})
export const useSelectedLayoutSegments = () => []`,
  "next/link": `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, onClick, ...rest }, ref) {
  return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, onClick: (e) => { onClick?.(e); e.preventDefault(); (window.__clicked ||= []).push(typeof href === "string" ? href : "#") }, ...rest }, children)
})
export const useLinkStatus = () => ({ pending: false })`,
  "next/image": `import React from "react"
export default function Image({ src, alt, fill, priority, preload, sizes, unoptimized, className, style, ...rest }) {
  return React.createElement("img", { src: typeof src === "string" ? src : "", alt, className, style, ...rest })
}`,
  /* Who the cookie says is window.__who; Supabase's own events are kept so the probe can send them as another tab would. */
  "supabase-client": `const who = () => window.__who
const USER = { id: "u1", email: "ava@example.com", user_metadata: {} }
const rowFor = (table) => {
  if (table === "profiles") return { display_name: "Ava Stone", avatar_url: null, username: "ava", is_creator: who() === "seller" }
  if (table === "creators") return who() === "seller" ? { id: "c1", slug: "ava", onboarding_completed: true } : null
  return null
}
const chain = (table) => new Proxy(function () {}, {
  get: (_, k) => k === "then" ? (r) => setTimeout(() => r({ data: rowFor(table), error: null }), 40) : chain(table),
  apply: () => chain(table),
})
export function isNativePlatform() { return false }
export const capacitorStorage = {}
export function createClient() {
  return {
    auth: {
      getUser: () => new Promise((r) => setTimeout(() => r({ data: { user: who() === "guest" ? null : USER }, error: who() === "guest" ? { name: "AuthSessionMissingError", message: "Auth session missing!", status: 400 } : null }), 120)),
      getSession: async () => ({ data: { session: who() === "guest" ? null : { user: USER, access_token: "t" } }, error: null }),
      onAuthStateChange: (f) => { (window.__authSubs ||= new Set()).add(f); return { data: { subscription: { unsubscribe() { window.__authSubs.delete(f) } } } } },
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
    entryPoints: [join(root, "scripts/render-header-auth.tsx")],
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
writeFileSync(join(stubs, "index.html"), `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style></head>
<body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files"] })
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }

async function open(hash) {
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.setViewport(PHONE)
  await p.goto(`file://${join(stubs, "index.html")}#${hash}`)
  await p.evaluate(() => document.fonts.ready)
  await sleep(700)
  p.__errors = errors
  return p
}

const MARKETING = new Set(["/", "/pricing", "/features", "/blog", "/faq"])

/* The visible hamburger: the navigator's three lines, or the marketing row's button. */
const tapMenu = async (p) => {
  const pt = await p.evaluate(() => {
    const el = [...document.querySelectorAll('[data-place-navigator-trigger], button[aria-label="Open menu"], button[aria-label="Close menu"]')].find((e) => e.getBoundingClientRect().width > 0)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  if (!pt) return false
  await p.touchscreen.tap(pt.x, pt.y)
  return true
}

/* The sheet that is up: on screen, not at rest, and what a person can read and press in it. */
const readSheet = (p) => p.evaluate(() => {
  const roots = [...document.querySelectorAll("[data-sheet-root]")].filter((r) => r.getAttribute("aria-hidden") !== "true" && !r.hasAttribute("data-app-sheet-rest"))
  for (const r of roots) {
    const panel = r.querySelector("[data-sheet-panel]")
    if (!panel) continue
    const box = panel.getBoundingClientRect()
    const cs = getComputedStyle(panel)
    if (box.top >= innerHeight - 40 || +cs.opacity < 0.5 || cs.contentVisibility === "hidden" || getComputedStyle(r).display === "none") continue
    const actions = [...panel.querySelectorAll("a, button")]
      .filter((a) => { const b = a.getBoundingClientRect(); return b.height > 20 && b.width > 40 && b.bottom <= innerHeight + 1 && b.top >= box.top - 1 })
      .map((a) => (a.getAttribute("data-navigator-action") || a.getAttribute("data-navigator-link") || (a.hasAttribute("data-account-link") ? "account" : "") || (a.hasAttribute("data-menu-sign-up") ? "sign-up" : "") || (a.hasAttribute("data-menu-log-in") ? "log-in" : "") || (a.hasAttribute("data-sheet-dashboard") ? "dashboard" : "") || a.textContent.trim().slice(0, 24)))
    return {
      top: Math.round(box.top),
      actions,
      skeleton: !!panel.querySelector("[data-navigator-loading], [data-menu-loading]"),
      recent: panel.querySelectorAll("[data-navigator-kind]").length,
      guest: !!panel.querySelector("[data-guest-sheet]"),
    }
  }
  return null
})

/* Closed by a tap on the dimmed page above it, as a person would. */
const closeSheet = async (p) => {
  await p.touchscreen.tap(195, 40)
  await sleep(520)
}

/** What the menu must offer: a visitor a way in, a signed in person their own ways and never Log in. */
function rightFor(who, path, s) {
  const marketing = MARKETING.has(path)
  if (marketing) {
    if (who === "guest") return s.guest && s.actions.includes("sign-up")
    return s.actions.includes("account") && !s.guest && (who === "seller" ? s.actions.includes("dashboard") : true)
  }
  if (who === "guest") return s.actions.includes("log-in") && s.actions.includes("sign-up") && s.actions.includes("explore")
  if (s.actions.includes("log-in") || s.actions.includes("sign-up")) return false
  return s.actions.includes("explore") && s.actions.includes(who === "seller" ? "dashboard" : "start-creating")
}

/** One open: the sheet must be up within `within` ms, never empty, and right for who is signed in. */
async function openAndRead(p, who, path, { within = 700, settle = 0 } = {}) {
  const tapped = await tapMenu(p)
  if (!tapped) return { ok: false, why: "no hamburger on screen" }
  const t0 = Date.now()
  let s = null
  while (Date.now() - t0 < within) {
    await sleep(60)
    s = await readSheet(p)
    if (s && s.actions.length && s.top < 844 - 200) break
  }
  if (settle) { await sleep(settle); s = await readSheet(p) }
  if (!s) return { ok: false, why: "no sheet on screen" }
  if (!s.actions.length) return { ok: false, why: "an empty sheet", s }
  if (!rightFor(who, path, s)) return { ok: false, why: `the wrong menu for ${who}`, s }
  return { ok: true, s }
}

/* ------------------------------------------------------------------ */
console.log("\n1. Thirty opens at 390, moving between pages and signing in and out in another tab, CPU slowed 4x")
{
  const p = await open("path=/explore&who=guest")
  const cdp = await p.target().createCDPSession()
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  const route = ["/explore", "/ava/color-grading-pack", "/@ava", "/", "/pricing", "/explore"]
  let who = "guest"
  const misses = []
  let opens = 0
  let skeletons = 0
  for (let i = 0; i < 30; i++) {
    const path = route[i % route.length]
    await p.evaluate((path) => window.__nav.go(path), path)
    await sleep(250)
    /* Every fifth open, the other tab signs in or out first, and this one is opened straight after. */
    if (i % 5 === 2) {
      who = who === "guest" ? (i % 10 === 2 ? "buyer" : "seller") : "guest"
      await p.evaluate((who) => (who === "guest" ? window.__signOut() : window.__signIn(who)), who)
      await sleep(900)
    }
    const r = await openAndRead(p, who, path, { within: 1500, settle: MARKETING.has(path) ? 0 : 450 })
    opens++
    if (r.s?.skeleton) skeletons++
    if (!r.ok) misses.push({ i, path, who, why: r.why, actions: r.s?.actions })
    await closeSheet(p)
  }
  expect(misses.length === 0, `every one of ${opens} opens showed a full menu, right for who was signed in`, misses.length ? misses.slice(0, 4) : { opens, stillLoadingAfter450ms: skeletons })
  expect(p.__errors.length === 0, "nothing threw", p.__errors.slice(0, 2))
  await p.close()
}

console.log("\n2. Signed in elsewhere, heard through the storage event alone (no Supabase broadcast)")
{
  const p = await open("path=/&who=guest&broadcast=0")
  let r = await openAndRead(p, "guest", "/")
  expect(r.ok, "a visitor's sheet first", r.s?.actions)
  await closeSheet(p)
  await p.evaluate(() => window.__signIn("seller"))
  await sleep(1200)
  r = await openAndRead(p, "seller", "/")
  expect(r.ok, "then the seller's sheet: their account and Dashboard, with nothing reloaded", r.s?.actions ?? r.why)
  await closeSheet(p)
  await p.evaluate(() => window.__nav.go("/explore"))
  await sleep(300)
  r = await openAndRead(p, "seller", "/explore", { settle: 400 })
  expect(r.ok, "and the navigator on Explore says Dashboard, not Log in", r.s?.actions ?? r.why)
  await closeSheet(p)
  await p.evaluate(() => window.__signOut())
  await sleep(1200)
  r = await openAndRead(p, "guest", "/explore", { settle: 300 })
  expect(r.ok && r.s.recent === 0, "signed out elsewhere: Log in and Sign up, and none of their courses left in it", r.s ?? r.why)
  await p.close()
}

console.log("\n3. The list fails, then answers: never stuck on a stand in, filled in without reopening")
{
  const p = await open("path=/explore&who=buyer&places=fail")
  await p.evaluate(() => localStorage.setItem("_sl_auth_v1", JSON.stringify({ signedIn: true, userId: "u1", avatarUrl: null, displayName: "Ava Stone", username: "ava", isSeller: false })))
  await sleep(1500)
  let r = await openAndRead(p, "buyer", "/explore", { settle: 300 })
  expect(r.ok && !r.s.skeleton, "a failed list: Explore and Start creating at once, no grey row, and never the visitor's Log in", r.s ?? r.why)
  await p.evaluate(() => { window.__placesMode = "ok" })
  await sleep(9000)
  r = { s: await readSheet(p) }
  expect(r.s && r.s.recent === 2, "asked again on its own: the two recent rows arrive in the open sheet", r.s)
  const asked = await p.evaluate(() => window.__placesAsked)
  expect(asked >= 2 && asked <= 6, "a few asks, not a loop", asked)
  await p.close()
}

console.log("\n4. The list never answers, or throws")
for (const mode of ["hang", "offline"]) {
  const p = await open(`path=/explore&who=buyer&places=${mode}`)
  await p.evaluate(() => localStorage.setItem("_sl_auth_v1", JSON.stringify({ signedIn: true, userId: "u1", avatarUrl: null, displayName: "Ava Stone", username: "ava", isSeller: true })))
  await sleep(300)
  const r = await openAndRead(p, "seller", "/explore")
  expect(r.ok, `${mode}: open at once with the seller's Dashboard`, r.s?.actions ?? r.why)
  await sleep(mode === "hang" ? 8600 : 600)
  const s = await readSheet(p)
  expect(s && !s.skeleton && s.actions.includes("dashboard"), `${mode}: the grey row is gone by ${mode === "hang" ? "the 8s limit" : "the failure"}, the menu still whole`, s)
  await p.close()
}

console.log("\n5. A slow list (2.5s): the grey row only while it comes, then the rows")
{
  const p = await open("path=/explore&who=buyer&places=slow")
  await p.evaluate(() => localStorage.setItem("_sl_auth_v1", JSON.stringify({ signedIn: true, userId: "u1", avatarUrl: null, displayName: "Ava Stone", username: "ava", isSeller: false })))
  await p.evaluate(() => window.dispatchEvent(new Event("storelib:auth-snapshot")))
  const r = await openAndRead(p, "buyer", "/explore")
  expect(r.ok, "open at once: Explore and Start creating", r.s?.actions ?? r.why)
  await sleep(3200)
  const s = await readSheet(p)
  expect(s && !s.skeleton && s.recent === 2, "then the recent rows, the grey row gone", s)
  await p.close()
}

console.log("\n6. Signed in as a visitor's list was held: the held list is not shown to the new person")
{
  const p = await open("path=/explore&who=guest&broadcast=0")
  let r = await openAndRead(p, "guest", "/explore", { settle: 300 })
  expect(r.ok, "a visitor's navigator, its answer held for the tab", r.s?.actions)
  await closeSheet(p)
  /* Signed in on the sign in page of this same tab: the record is written, and the list was asked for seconds ago. */
  await p.evaluate(() => { window.__who = "buyer"; localStorage.setItem("_sl_auth_v1", JSON.stringify({ signedIn: true, userId: "u1", avatarUrl: null, displayName: "Ava Stone", username: "ava", isSeller: false })); window.dispatchEvent(new Event("storelib:auth-snapshot")) })
  await sleep(400)
  r = await openAndRead(p, "buyer", "/explore", { settle: 300 })
  expect(r.ok && r.s.recent === 2, "the next open is theirs: their recent rows and Start creating, no Log in", r.s ?? r.why)
  await p.close()
}

await browser.close()
rmSync(stubs, { recursive: true, force: true })
console.log(broken ? `\n${broken} check(s) failed\n` : "\nall checks passed\n")
process.exit(broken ? 1 : 0)
