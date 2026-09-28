/**
 * ===========================================================================
 *  A RETURNING VISITOR'S HEADER HYDRATES WITHOUT A MISMATCH OR A FLICKER
 * ===========================================================================
 * The header remembers the last session in localStorage so a returning
 * visitor's photo is there on the first paint. The server cannot see
 * localStorage, so it sends the waiting stand in; the browser used to read
 * the snapshot in its first render and draw the photo in the same hydration
 * pass, React reported the mismatch and threw the server's header away.
 *
 * This server renders the real header (scripts/render-header-hydrate.tsx)
 * with no session, puts a returning visitor's session in localStorage, then
 * hydrates it at 4x CPU while recording every frame:
 *
 *   NO MISMATCH       no recoverable error and no hydration message in the
 *                     console
 *   NO FLICKER        no frame ever shows the guest's Log in or Sign up to
 *                     somebody signed in, the stand in is only ever the
 *                     server's own, and the photo is there by the end
 *   RIGHT FOR EVERYBODY  a guest ends on Log in, a seller on Dashboard, a
 *                     first visit (no snapshot) hydrates cleanly too
 *
 *   PROBE_CSS=source node scripts/check-header-hydrate.mjs
 */
import { build } from "esbuild"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

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
const stubs = join(root, ".header-hydrate-probe")
mkdirSync(stubs, { recursive: true })
const STUBS = {
  "next-navigation": `import { useSyncExternalStore } from "react"
const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
const sub = (f) => { window.__nav.subs.add(f); return () => window.__nav.subs.delete(f) }
export const usePathname = () => useSyncExternalStore(sub, () => window.__nav.path, () => window.__nav.path)
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams("")
export const useParams = () => ({})`,
  "next-link": `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest }, children) })
export const useLinkStatus = () => ({ pending: false })`,
  "next-image": `import React from "react"
export default function Image({ src, alt, fill, priority, preload, sizes, unoptimized, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : "", alt, ...rest }) }`,
  /* The session read answers late, so the frames right after hydration are the snapshot's alone. */
  "supabase-client": `const who = () => window.__who
const USER = { id: "u1", email: "ava@example.com", user_metadata: {} }
const rowFor = (table) => {
  if (table === "profiles") return { display_name: "Ava Stone", avatar_url: null, username: "ava", is_creator: who() === "seller" }
  if (table === "creators") return who() === "seller" ? { id: "c1", slug: "ava", onboarding_completed: true } : null
  return null
}
const chain = (table) => new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: rowFor(table), error: null }) : chain(table), apply: () => chain(table) })
export function isNativePlatform() { return false }
export const capacitorStorage = {}
export function createClient() {
  return {
    auth: {
      getUser: () => new Promise((r) => setTimeout(() => r({ data: { user: who() === "guest" || who() === "first" ? null : USER }, error: null }), 1500)),
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({}),
    },
    from: (table) => chain(table), rpc: () => chain(null), channel: () => chain(null), removeChannel() {},
  }
}`,
}
for (const [k, v] of Object.entries(STUBS)) writeFileSync(join(stubs, `${k}.jsx`), v)
try {
  await build({
    entryPoints: [join(root, "scripts/render-header-hydrate.tsx")],
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
<style>${css}</style><style>body{margin:0;font-family:system-ui,sans-serif;background:#f8f9fa}</style></head>
<body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

/* One row per frame: what the right hand side of the header shows. */
const SAMPLER = `(() => {
  window.__frames = []
  const t0 = performance.now()
  const shown = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.opacity !== "0" && !el.closest("[aria-hidden=true]") }
  const tick = () => {
    const root = document.getElementById("platform-header-root")
    const q = (s) => [...(root?.querySelectorAll(s) ?? [])].some(shown)
    window.__frames.push({
      t: Math.round(performance.now() - t0),
      avatar: q("[data-header-avatar]") || q('button[aria-label="Open profile menu"]'),
      guest: q("[data-guest-actions]:not([data-placeholder])") || [...(root?.querySelectorAll("a, button") ?? [])].some((e) => shown(e) && /^(Log in|Sign up|Sign in)$/.test(e.textContent.trim())),
      placeholder: !!root?.querySelector("[data-guest-actions][data-placeholder]"),
      dashboard: q("[data-header-dashboard]"),
    })
    if (!window.__stop) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})()`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--allow-file-access-from-files"] })
try {
  for (const [label, vp] of [["390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }], ["1280", { width: 1280, height: 900 }]]) {
    for (const who of ["buyer", "seller", "guest", "first"]) {
      console.log(`\n${who} at ${label}`)
      const page = await browser.newPage()
      const said = []
      page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") said.push(m.text()) })
      page.on("pageerror", (e) => said.push(`pageerror: ${e.message}`))
      await page.setViewport(vp)
      await page.goto(`file://${join(stubs, "index.html")}#path=/explore&who=${who}`)
      await page.waitForFunction(() => window.__ready === true, { timeout: 15000 })
      const server = await page.evaluate(() => ({
        placeholder: !!document.querySelector("[data-guest-actions][data-placeholder]"),
        avatar: !!document.querySelector("[data-header-avatar]"),
        /* On a phone the server's Sign in holds its place unseen rather than showing to somebody signed in. */
        phoneSignIn: (() => { const a = document.querySelector("[data-phone-sign-in]"); return a ? getComputedStyle(a).visibility : null })(),
      }))
      const cdp = await page.createCDPSession()
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      await page.evaluate(SAMPLER)
      await page.evaluate(() => window.__go())
      await sleep(1000)
      const frames = await page.evaluate(() => { window.__stop = true; return window.__frames })
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
      const recoverable = await page.evaluate(() => window.__recoverable)
      const hydration = said.filter((s) => /hydrat|did not match|server rendered/i.test(s))
      expect(server.placeholder && !server.avatar && (server.phoneSignIn === null || server.phoneSignIn === "hidden"), `${who}: the server's HTML is the stand in (Sign in unseen on a phone), as a server that cannot see the session sends it`, server)
      expect(recoverable.length === 0 && hydration.length === 0, `${who}: hydrates with no mismatch and nothing in the console about it`, [...recoverable, ...hydration].slice(0, 2))
      const last = frames.at(-1)
      if (who === "buyer" || who === "seller") {
        expect(frames.every((f) => !f.guest), `${who}: no frame shows Log in or Sign up to somebody signed in`, frames.filter((f) => f.guest).map((f) => f.t))
        expect(last?.avatar, `${who}: the photo is there once the page has woken up, before the session read answers`, last)
        if (who === "seller" && vp.width >= 768) expect(last?.dashboard, "seller: Dashboard is there too", last)
        const swapAt = frames.findIndex((f) => f.avatar)
        expect(swapAt > -1 && frames.slice(swapAt).every((f) => f.avatar), `${who}: once the photo is drawn it stays (no second swap)`, swapAt)
      } else if (who === "guest") {
        expect(last?.guest && !last?.avatar, "guest: ends on Log in and Sign up (Sign in on a phone)", last)
      } else {
        expect(!last?.avatar && !last?.guest, "first visit: still the stand in until the session read answers", last)
      }
      await page.close()
    }
  }
} finally {
  await browser.close()
  rmSync(stubs, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} FAILED` : "\nall good")
if (broken) process.exit(1)
