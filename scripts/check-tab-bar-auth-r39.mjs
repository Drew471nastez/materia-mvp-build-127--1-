/**
 * ===========================================================================
 *  ROUND 39, MEASURED: NO PHONE TAB BAR FOR SOMEBODY SIGNED OUT
 * ===========================================================================
 * The owner: "inside Storelib when logged out it should not have on mobile
 * the mobile bottom navigation bar". Storelib's pages are the same HTML for
 * everybody (held at the edge), so the server cannot leave the bar out; the
 * page has to decide before it paints, and never show the bar and then take
 * it away.
 *
 * The real BuyerTabBar (scripts/render-tab-bar-auth-r39.tsx) rendered by
 * react-dom/server as the server renders it, loaded in headless Chromium on
 * a 390x844 phone with the person's record in localStorage as the header
 * leaves it, and hydrated in the page after. Every animation frame from the
 * first one is sampled (is the bar on screen, how tall is the page), so a
 * bar that showed for one frame, or a page that changed height when the
 * script woke up, is caught.
 *
 *   SIGNED OUT   the bar never on screen on any frame, before or after the
 *                page wakes; no room left at the foot of the page for it;
 *                the page's height the same from the first frame to the last
 *   SIGNED IN    the bar on screen from the first frame and after; its room
 *                there from the first frame (nothing moves)
 *   THE APP      signed out, html.capacitor: the bar stays (the app's
 *                signed-out start is Explore, where it is the way around)
 *
 * Pictures go to SHOTS_DIR (.round39-tabs-shots by default).
 *
 *   PROBE_CSS=source node scripts/check-tab-bar-auth-r39.mjs
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { createRequire } from "node:module"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const require = createRequire(join(root, "package.json"))
/* This checkout's node_modules or, in a worktree, the first one above it. */
let up = root
while (!existsSync(join(up, "node_modules")) && dirname(up) !== up) up = dirname(up)
const nodePaths = [join(up, "node_modules")]
const css = await appCss(root)
const stubs = join(root, ".tab-bar-auth-r39-probe")
const shots = process.env.SHOTS_DIR || join(root, ".round39-tabs-shots")
mkdirSync(shots, { recursive: true })
mkdirSync(stubs, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"

try {
  writeFileSync(join(stubs, "navigation.js"), `const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => "/explore"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams("")
export const redirect = () => {}
export const permanentRedirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
`)
  writeFileSync(join(stubs, "supabase-client.js"), `export const isNativePlatform = () => false
export function createClient() { return { auth: { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from() { return { select() { return this }, eq() { return this }, maybeSingle: async () => ({ data: null }) } } } }
`)
  writeFileSync(join(stubs, "ssr-entry.tsx"), `import React from "react"
import { renderToString } from "react-dom/server"
import { App } from "../scripts/render-tab-bar-auth-r39"
export const html = () => renderToString(<App />)
`)
  const { build } = await import("esbuild")
  const common = {
    bundle: true,
    jsx: "automatic",
    alias: { "@": ".", "next/navigation": "./.tab-bar-auth-r39-probe/navigation.js", "next/link": "./.tab-bar-auth-r39-probe/link.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    loader: { ".css": "empty" },
    logLevel: "error",
    absWorkingDir: root,
    nodePaths,
  }
  await build({ ...common, entryPoints: [join(stubs, "ssr-entry.tsx")], platform: "node", format: "cjs", define: { "process.env.NODE_ENV": '"production"', SSR: "true" }, outfile: join(stubs, "ssr.cjs") })
  await build({
    ...common,
    entryPoints: [join(root, "scripts/render-tab-bar-auth-r39.tsx")],
    format: "iife",
    define: { "process.env.NODE_ENV": '"production"', SSR: "false" },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    outfile: join(stubs, "client.js"),
  })
  const { html: ssr } = require(join(stubs, "ssr.cjs"))
  const markup = ssr()
  const client = readFileSync(join(stubs, "client.js"), "utf8")
  const page = (native) =>
    `<!doctype html><html class="light${native ? " capacitor" : ""}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app">${markup}</div></body></html>`

  console.log(`\nThe server's HTML draws the bar pending, with the line that reads the record before it`)
  expect(/data-tabs-auth="pending"/.test(markup) && /data-buyer-tab-bar=/.test(markup), "the bar and its room are in the server's HTML, marked pending", markup.match(/data-tabs-auth="pending"/g)?.length)
  expect(markup.indexOf("_sl_auth_v1") > -1 && markup.indexOf("_sl_auth_v1") < markup.indexOf("data-buyer-tabs-room"), "the record is read before the room and the bar are parsed")

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }

  async function run(name, { signedIn, native }) {
    const p = await browser.newPage()
    await p.setViewport(PHONE)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    await p.setRequestInterception(true)
    p.on("request", (r) => (r.url().startsWith(ORIGIN) ? r.respond({ status: 200, contentType: "text/html", body: page(native) }) : r.url().startsWith("data:") ? r.continue() : r.respond({ status: 404, body: "" })))
    await p.evaluateOnNewDocument((signedIn) => {
      try {
        localStorage.setItem("storelib_consent", "x")
        if (signedIn) localStorage.setItem("_sl_auth_v1", JSON.stringify({ signedIn: true, userId: "u1", avatarUrl: null, displayName: "Alex Morgan", username: "alex", isSeller: false }))
        else localStorage.removeItem("_sl_auth_v1")
      } catch {}
      /* Every frame from the first: the bar on screen, the room's height, the page's height. */
      const frames = (window.__frames = [])
      const sample = () => {
        /* Frames before the page's HTML is parsed have nothing on them to measure. */
        if (!document.querySelector("[data-footer-last]")) return void requestAnimationFrame(sample)
        const bar = document.querySelector("[data-buyer-tab-bar]")
        const room = document.querySelector("[data-buyer-tabs-room]")
        const r = bar?.getBoundingClientRect()
        frames.push({
          t: Math.round(performance.now()),
          bar: !!bar && getComputedStyle(bar).display !== "none" && !!r && r.height > 0 && r.top < innerHeight,
          room: room ? Math.round(room.getBoundingClientRect().height) : 0,
          page: document.documentElement.scrollHeight,
          attr: document.documentElement.getAttribute("data-buyer-tabs"),
        })
        if (frames.length < 400) requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    }, signedIn)
    await p.goto(`${ORIGIN}/explore`, { waitUntil: "load" })
    await sleep(300)
    const before = await p.evaluate(() => window.__frames.slice())
    await p.screenshot({ path: join(shots, `${name}-server-html.png`) })
    /* The page wakes up: the same bundle the site would load, hydrating the server's HTML. */
    await p.addScriptTag({ content: client })
    await sleep(1200)
    const all = await p.evaluate(() => window.__frames.slice())
    const hydration = await p.evaluate(() => window.__hydrationErrors || [])
    await p.screenshot({ path: join(shots, `${name}-awake.png`) })
    const after = all.slice(before.length)
    const last = all[all.length - 1]
    await p.close()
    return { before, after, all, last, errors, hydration }
  }

  console.log("\nSIGNED OUT, in a phone's browser")
  {
    const r = await run("signed-out", { signedIn: false, native: false })
    expect(r.all.length > 20 && r.all.every((f) => !f.bar), `the bar is never on screen, on any of ${r.all.length} frames`, r.all.filter((f) => f.bar).slice(0, 3))
    expect(r.all.every((f) => f.room === 0), "no room is kept for it at the foot of the page on any frame", [...new Set(r.all.map((f) => f.room))])
    expect(new Set(r.all.map((f) => f.page)).size === 1, "the page is one height from the first frame to the last", [...new Set(r.all.map((f) => f.page))])
    expect(r.all.every((f) => f.attr === null), "the page never makes room for a bar (no data-buyer-tabs on any frame)", [...new Set(r.all.map((f) => f.attr))])
    expect(r.hydration.length === 0 && r.errors.length === 0, "no hydration mismatch, no page errors", { hydration: r.hydration, errors: r.errors })
  }

  console.log("\nSIGNED IN, in a phone's browser")
  {
    const r = await run("signed-in", { signedIn: true, native: false })
    expect(r.all.length > 20 && r.all.every((f) => f.bar), `the bar is on screen from the first frame (${r.all.length} frames)`, r.all.filter((f) => !f.bar).slice(0, 3))
    expect(r.all.every((f) => f.room === 56), "its room is there from the first frame", [...new Set(r.all.map((f) => f.room))])
    expect(new Set(r.all.map((f) => f.page)).size === 1, "the page is one height from the first frame to the last", [...new Set(r.all.map((f) => f.page))])
    expect(r.last.attr === "shown", "awake, it tells the page it is there (data-buyer-tabs)", r.last.attr)
    expect(r.hydration.length === 0 && r.errors.length === 0, "no hydration mismatch, no page errors", { hydration: r.hydration, errors: r.errors })
  }

  console.log("\nTHE APP, signed out")
  {
    const r = await run("app-signed-out", { signedIn: false, native: true })
    expect(r.all.length > 20 && r.all.every((f) => f.bar), "the app keeps its bar signed out, from the first frame", r.all.filter((f) => !f.bar).slice(0, 3))
    expect(new Set(r.all.map((f) => f.page)).size === 1, "the page is one height from the first frame to the last", [...new Set(r.all.map((f) => f.page))])
    expect(r.hydration.length === 0 && r.errors.length === 0, "no hydration mismatch, no page errors", { hydration: r.hydration, errors: r.errors })
  }
  console.log(`  pictures: ${shots}`)
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
