/**
 * ===========================================================================
 *  THE TAB BAR IS THERE EXACTLY WHEN IT SHOULD BE, WHATEVER OPENS AND CLOSES
 * ===========================================================================
 * Round 15 (tests/nav-tabs15.test.ts lists the seven ways the bar went).
 * The real tab bar with the layers that cover it, lift it, or neither
 * (scripts/render-nav-tabs15.tsx), at 390x844 and 1440x900, opened and closed
 * in every order: one at a time, two at once, one closing while the next
 * opens in the same commit, a field with the caret taken away with its layer
 * (WebKit sends no focusout for that, so the probe swallows it the way WebKit
 * never sends it), a layer's element torn out behind React's back and the
 * address moving on, a class the server printed for a layer that never ran,
 * Settings closing and a tab pressed right after.
 *
 * After every step: is the bar on the screen and does a finger at its middle
 * land on it (VISIBLE), and is that what the step should leave (EXPECTED).
 * Under a layer that covers it the bar must hold still in place (not slid
 * away), so it is there on the first frame after the layer goes.
 *
 * OLD=1 runs the same steps against the bar as it was on the round's base
 * (git show 91eb630d), for the before numbers. A filmstrip of the bar's third
 * slot changing from Library to Create post is written to SHOTS_DIR.
 *
 *   PROBE_CSS=source node scripts/check-nav-tabs15.mjs
 */
import { execSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const OLD = process.env.OLD === "1"
const BASE = process.env.BASE || "91eb630d"
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const fonts = interFaces(root)
const stubs = join(root, ".nav-tabs15-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-nav-tabs15-")), "shots")
mkdirSync(shots, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"
let broken = 0
const rows = []
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

writeFileSync(
  join(stubs, "navigation.js"),
  `import { useSyncExternalStore } from "react"
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: (h) => log("prefetch", h), back: () => log("back"), refresh: () => log("refresh") }
const sub = (fn) => { addEventListener("popstate", fn); addEventListener("probe-nav", fn); return () => { removeEventListener("popstate", fn); removeEventListener("probe-nav", fn) } }
export const usePathname = () => useSyncExternalStore(sub, () => location.pathname, () => "/")
const read = () => location.search
export const useSearchParams = () => new URLSearchParams(useSyncExternalStore(sub, read, () => ""))
export const useRouter = () => router
export const redirect = () => {}
export const notFound = () => {}
`,
)
writeFileSync(
  join(stubs, "link.jsx"),
  `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`,
)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"\nexport default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }\n`)
writeFileSync(
  join(stubs, "supabase-client.js"),
  `export function createClient() { const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: null }), single: async () => ({ data: null }), then: (f) => f({ data: [] }) }; return { from: () => q, auth: { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, channel() { const ch = { on() { return ch }, subscribe() { return ch } }; return ch }, removeChannel() {} } }
export const isNativePlatform = () => false
`,
)
const barFile = OLD ? join(stubs, "old-bar.tsx") : join(root, "components/nav/buyer-tab-bar.tsx")
if (OLD) writeFileSync(barFile, execSync(`git show ${BASE}:components/nav/buyer-tab-bar.tsx`, { cwd: root }).toString())

const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-nav-tabs15.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": ".", "@probe/bar": barFile, "next/navigation": "./.nav-tabs15-probe/navigation.js", "next/link": "./.nav-tabs15-probe/link.jsx", "next/image": "./.nav-tabs15-probe/image.jsx" },
  plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  loader: { ".css": "empty" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(stubs, "app.js"), "utf8")
/* WebKit sends no focusout when a focused field leaves the document; Chromium does. While __webkit is on, the probe swallows it. */
const webkit = `<script>addEventListener("focusout",function(e){if(window.__webkit){e.stopImmediatePropagation()}},true)</script>`
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>${webkit}</head><body><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })

async function open(path, vp) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const url = r.url()
    if (url.startsWith(`${ORIGIN}/api/`)) return r.respond({ status: 404, contentType: "application/json", body: "{}" })
    if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
    return r.respond({ status: 204, body: "" })
  })
  await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
  await p.evaluate(() => document.fonts.ready)
  await sleep(400)
  return { p, errors }
}

/** The bar as a finger finds it: on the screen, at rest, and the thing a press at its middle lands on. */
const state = (p) =>
  p.evaluate(() => {
    const el = document.querySelector("[data-buyer-tab-bar]")
    const h = document.documentElement
    const flags = { covered: h.hasAttribute("data-tabs-covered"), over: h.hasAttribute("data-tabs-over"), ghost: h.hasAttribute("data-ghost-tap-guard"), pageLayer: h.classList.contains("has-page-layer") }
    if (!el) return { present: false, ...flags }
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    const shown = cs.display !== "none" && cs.visibility !== "hidden" && r.height > 0
    const atRest = Math.abs(r.bottom - innerHeight) < 2
    const hit = document.elementFromPoint(innerWidth / 2, r.top + 24)
    const reachable = shown && atRest && !!hit && el.contains(hit) && cs.pointerEvents !== "none"
    return { present: true, attr: el.getAttribute("data-buyer-tab-bar"), shown, atRest, reachable, ...flags }
  })

/** Two frames: what the very next painted frame after a step shows. */
const frames = (p, n = 2) => p.evaluate((n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f) }), n)

async function step(p, label, fn, want, { settle = 420, quick = false } = {}) {
  await fn()
  if (quick) await frames(p, 2)
  else await sleep(settle)
  const s = await state(p)
  const visible = !!s.reachable
  const ok = want === "covered" ? !visible && s.attr === "shown" && s.atRest : want === visible
  rows.push({ label, want, visible, attr: s.attr, atRest: s.atRest, covered: s.covered, over: s.over })
  expect(ok, `${label}: ${want === "covered" ? "covered, held in place" : want ? "bar there" : "bar gone (as it should be)"}`, { visible, attr: s.attr, atRest: s.atRest, covered: s.covered, over: s.over, ghost: s.ghost })
  return s
}

const call = (p, fn, ...args) => p.evaluate((fn, args) => window.__probe[fn](...args), fn, args)

console.log(`\n${OLD ? "BEFORE (the base's bar)" : "NOW"} at 390x844, outside a community`)
{
  const { p, errors } = await open("/explore", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await step(p, "at rest", async () => {}, true)
  await step(p, "composer open, caret in its field", () => call(p, "open", "composer", true), "covered")
  await p.evaluate(() => { window.__webkit = true })
  await step(p, "composer closed with the caret still in it (WebKit: no focusout)", () => call(p, "close", "composer"), true, { quick: true })
  await step(p, "  and a moment later", async () => {}, true)
  await p.evaluate(() => { window.__webkit = false })
  await step(p, "post open", () => call(p, "open", "post"), true)
  await step(p, "comment field focused (the keyboard is up)", () => p.focus("[data-probe-field=comment]"), false)
  await p.evaluate(() => { window.__webkit = true })
  await step(p, "post closed with the comment field focused (WebKit)", () => call(p, "close", "post"), true)
  await p.evaluate(() => { window.__webkit = false })
  await step(p, "two at once: composer, then the viewer over it", async () => { await call(p, "open", "composer", false); await call(p, "open", "viewer") }, "covered")
  await step(p, "viewer closed, composer still up", () => call(p, "close", "viewer"), "covered")
  await step(p, "composer closed", () => call(p, "close", "composer"), true, { quick: true })
  await step(p, "one closing while the next opens: post out, composer in, one commit", async () => { await call(p, "open", "post"); await sleep(100); await call(p, "swap", "post", "composer") }, "covered")
  await step(p, "and back: composer out, post in, one commit", () => call(p, "swap", "composer", "post"), true)
  await step(p, "post closed", () => call(p, "close", "post"), true)
  await step(p, "a class the server printed for a layer that never ran, then the address moves", async () => {
    await p.evaluate(() => {
      document.documentElement.classList.add("has-page-layer")
      const ghost = document.createElement("div")
      ghost.setAttribute("data-layer-kind", "page")
      document.body.appendChild(ghost)
      ghost.remove()
      window.__probe.navigate("/explore/design")
    })
  }, true)
  const leftover = await p.evaluate(() => document.documentElement.classList.contains("has-page-layer"))
  expect(OLD ? true : !leftover, "  the printed class is gone after the move", { leftover })
  await step(p, "a composer's element torn out behind React's back, then the address moves", async () => {
    await call(p, "open", "composer", false)
    await sleep(300)
    await p.evaluate(() => {
      document.querySelector("[data-probe-layer=composer]")?.remove()
      window.__probe.navigate("/explore/art")
    })
  }, true)
  /* Settings over the profile, closed by its back, and a tab pressed at once. */
  await step(p, "Settings open (the real layer)", async () => { await call(p, "settings"); await sleep(500) }, OLD ? true : "covered", { settle: 200 })
  const back = await p.evaluate(() => { const b = document.querySelector("[data-settings-subpage] [data-back-control]"); const r = b?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null })
  if (back) {
    await p.evaluate(() => { window.__router = [] })
    await p.touchscreen.tap(back.x, back.y)
    await sleep(560)
    const lib = await p.evaluate(() => { const r = document.querySelector('[data-buyer-tab="library"]')?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null })
    await p.touchscreen.tap(lib.x, lib.y)
    await sleep(120)
    const pushed = await p.evaluate(() => (window.__router || []).filter(([k]) => k === "push").map(([, h]) => h))
    const s = await state(p)
    expect(pushed.includes("/account/library"), "6  a tab pressed 0.56s after Settings closed answers the first tap", { pushed, ghostGuardOnBar: s.ghost })
    rows.push({ label: "tab pressed right after Settings closed", want: true, visible: pushed.includes("/account/library") })
  } else expect(false, "Settings' back control found")
  expect(errors.length === 0, "no page errors", errors)
  await p.close()
}

console.log(`\n${OLD ? "BEFORE" : "NOW"} at 390x844, inside a community: the third slot`)
{
  const { p, errors } = await open("/explore", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const slot = () => p.evaluate(() => [...document.querySelectorAll("[data-buyer-tab-bar] [data-buyer-tab]")].map((a) => a.getAttribute("data-buyer-tab")).join())
  const before = await slot()
  /* The filmstrip: the bar, every frame we can take, from the move into the community. */
  const thirdEl = await p.evaluate(() => !!document.querySelector('[data-buyer-tab="library"]'))
  /* The frames as the page paints them (the compositor's own screencast), and the two glyphs' opacity sampled on every frame in the page. */
  const cdp = await p.target().createCDPSession()
  const film = []
  let shot = 0
  cdp.on("Page.screencastFrame", async (f) => {
    film.push(f)
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 })
  await sleep(150)
  const samples = await p.evaluate(() => new Promise((res) => {
    const out = []
    const t0 = performance.now()
    window.__probe.navigate("/community/clay-studio")
    const tick = () => {
      const t = Math.round(performance.now() - t0)
      out.push(`${t}ms ` + [...document.querySelectorAll("[data-third-slot]")].map((s) => `${s.getAttribute("data-third-slot")}:${Number(getComputedStyle(s).opacity).toFixed(2)}`).join(" "))
      if (t < 320) requestAnimationFrame(tick)
      else res(out)
    }
    requestAnimationFrame(tick)
  }))
  await sleep(150)
  await cdp.send("Page.stopScreencast")
  const { Buffer } = await import("node:buffer")
  for (const f of film.slice(0, 24)) {
    writeFileSync(join(shots, `${OLD ? "old" : "new"}-slot-${String(shot++).padStart(2, "0")}.png`), Buffer.from(f.data, "base64"))
  }
  console.log("  frames:", samples.join(" | "))
  const after = await slot()
  expect(OLD ? true : before === "home,search,library,profile" && after === "home,search,compose,profile", "outside Home, Search, Library, Profile; inside Home, Search, Create post, Profile", { before, after })
  if (!OLD) {
    const sameSlot = await p.evaluate(() => !!document.querySelector('[data-buyer-tab="compose"] [data-third-slot="library"]'))
    expect(thirdEl && sameSlot, "the third slot is the same element through the change (both glyphs in it)")
    const mid = samples.filter((f) => /library:0\.[1-9]/.test(f) && /compose:0\.[1-9]/.test(f))
    expect(mid.length >= 3, "the glyphs cross fade over several frames (both part way)", mid.length)
  }
  expect(errors.length === 0, "no page errors", errors)
  await p.close()
}

console.log(`\n${OLD ? "BEFORE" : "NOW"} at 1440x900`)
{
  const { p, errors } = await open("/explore", { width: 1440, height: 900, deviceScaleFactor: 1 })
  const s0 = await state(p)
  expect(s0.present && !s0.shown, "no bar on a computer", s0)
  await call(p, "open", "composer", true)
  await sleep(200)
  await call(p, "open", "post")
  await sleep(200)
  await call(p, "close", "composer")
  await call(p, "close", "post")
  await sleep(300)
  const s1 = await state(p)
  expect(!s1.covered && !s1.over && !s1.ghost, "every layer opened and closed: nothing left on <html>", s1)
  expect(errors.length === 0, "no page errors", errors)
  await p.close()
}

await browser.close()
const table = rows.map((r) => `${r.visible === (r.want === "covered" ? false : r.want) ? "  " : "!!"} ${r.label.padEnd(86)} ${String(r.want).padEnd(8)} ${r.visible}`).join("\n")
console.log(`\nstep${" ".repeat(85)}want     visible\n${table}`)
console.log(`\nfilmstrip in ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken && !OLD ? 1 : 0)
