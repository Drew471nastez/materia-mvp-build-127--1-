/**
 * ===========================================================================
 *  THE GREY BEHIND THE NAME IN THE BLACK BAR, FRAME BY FRAME
 * ===========================================================================
 * "The gray on the name button in the black header: when I'm on it and when
 * I'm out of it it's not smooth, glitchy and too direct. It doesn't create
 * that hover gray film smoothly and cleanly when I click it."
 *
 * The real /app shell (scripts/render-account-film.tsx: the real AppSidebar
 * with its phone account sheet and desktop dropdown) against the account
 * buttons as they were (/before: the same class strings, the grey a
 * background colour). The glass is read, not the DOM: a screencast of every
 * frame the compositor drew, and the bar's colour read at a point inside the
 * button's padding, beside the photo.
 *
 * The press is made as busy as the real one: the sheet or the dropdown is put
 * together in the click (BUSY_CLICK_MS of script), and the page goes on
 * working for BUSY_AFTER_MS a frame later, while the grey should be fading
 * in (the sheet's first frames, its photo, its prefetches). That is the frame
 * a background colour, which only the page's main thread can move, loses.
 *
 *   PHONE (390, touch, CPU slowed 4x)   a tap opens the sheet: the grey comes
 *                                       in; a tap on the page closes it: out
 *   DESKTOP (1280, mouse)               the pointer comes on: hover grey; a
 *                                       click opens the dropdown: open grey;
 *                                       a click closes it with the pointer
 *                                       still on: back to hover; the pointer
 *                                       leaves: nothing
 *
 * The grey is read as the button's colour over the bar's beside it, so a
 * sheet's scrim, which darkens both by the same share, does not count as the
 * grey moving; each reading carries how far 8 bit colour can put it off.
 *
 * For every change, on the glass: it moves through part-way frames (at least
 * MIN_STEPS, or 2 for a change only a few times the reading's error, such as
 * the dropdown's hover to open), it never goes back on itself by more than a
 * reading can be off, and no one frame carries more than MAX_JUMP of the
 * whole change. /before is
 * measured the same way and printed beside it, not held to it.
 * Reduced motion: every change in one frame.
 *
 *   node scripts/check-account-film.mjs
 *   SHOTS=<dir>   a picture of the button at rest, open and half way
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
const SHOTS = process.env.SHOTS || null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const BUSY_CLICK_MS = 40
const BUSY_AFTER_MS = 110
const MIN_STEPS = 4
const MAX_JUMP = 0.4

/* ── Bundle ─────────────────────────────────────────────────────────────── */

const dir = join(root, ".account-film-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `const router = { push(h) { location.href = h }, replace(h) { location.replace(h) }, prefetch() {}, refresh() {}, back() { history.back() }, forward() {} }
export const usePathname = () => "/app"
export const useSearchParams = () => new URLSearchParams()
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
const auth = { getUser: async () => ({ data: { user: { id: "u", user_metadata: {} } } }), getSession: async () => ({ data: { session: null } }), setSession: async () => ({ data: {}, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) }
export function createClient() { return { auth, from: () => q, rpc: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)
try {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-account-film.tsx"), "--bundle", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "client.js")}`,
    '--define:process.env.NODE_ENV="production"', "--format=iife", "--platform=browser",
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"], { stdio: ["ignore", "ignore", "inherit"] })
} catch {
  rmSync(dir, { recursive: true, force: true })
  fail("scripts/render-account-film.tsx did not bundle. The error above is esbuild's.")
}
const clientJs = readFileSync(join(dir, "client.js"))
rmSync(dir, { recursive: true, force: true })
const css = `${await appCss(root)}\n${interFaces(root).replace(/url\(file:\/\//g, "url(/__font?p=")}`
/*
  A HOVERING MOUSE, FOR THE COMPUTER. Tailwind's hover: is inside
  @media (hover: hover), and a headless Chromium says it has no pointer that
  hovers whatever it is told (its flags and CDP's media emulation were tried
  and read back false). So the computer's page is sent the same stylesheet
  with that query answered yes, which is what a computer with a mouse
  answers; the phone's page keeps it as it is, as a phone answers no.
*/
const cssWithMouse = css.replace(/@media\s*\(\s*hover\s*:\s*hover\s*\)/g, "@media all")
const htmlFor = (mouse) => `<!doctype html><html lang="en" class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/app.css${mouse ? "?mouse=1" : ""}"></head><body class="font-sans antialiased"><div id="app"></div><script src="/client.js"></script></body></html>`

const server = createServer((req, res) => {
  const u = new URL(req.url, "http://probe")
  const send = (status, type, body) => { res.writeHead(status, { "content-type": type, "cache-control": "no-store" }); res.end(body) }
  if (u.pathname.startsWith("/__font")) {
    const file = decodeURIComponent(u.searchParams.get("p") || "")
    if (!/\/\.next\/static\/media\/[\w.-]+\.woff2$/.test(file) || !existsSync(file)) return send(404, "text/plain", "")
    return send(200, "font/woff2", readFileSync(file))
  }
  if (u.pathname === "/app.css") return send(200, "text/css", u.searchParams.get("mouse") ? cssWithMouse : css)
  if (u.pathname === "/client.js") return send(200, "text/javascript", clientJs)
  if (u.pathname.startsWith("/api/")) return send(200, "application/json", "{}")
  if (u.pathname === "/" || u.pathname === "/before") return send(200, "text/html", htmlFor(u.searchParams.get("mouse") === "1"))
  send(404, "text/plain", "")
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

/* ── Reading the glass ──────────────────────────────────────────────────── */

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const reader = await browser.newPage()
await reader.evaluate(() => {
  /* The grey as the eye reads it: the button's padding against the bar beside the button, so a sheet's scrim dimming both is not counted as the grey moving. */
  window.readAt = async (png, x, y, bx, scale) => {
    const img = new Image()
    img.src = `data:image/png;base64,${png}`
    await img.decode()
    const c = document.createElement("canvas")
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const g = c.getContext("2d", { willReadFrequently: true })
    g.drawImage(img, 0, 0)
    const k = img.naturalWidth / scale
    const d = g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data
    const e = g.getImageData(Math.round(bx * k), Math.round(y * k), 1, 1).data
    /* As a ratio: a scrim over both multiplies both, and leaves it where it was. In steps of a fortieth of the bar. */
    const ratio = (p, q) => ((p + 1) / (q + 1) - 1) * 40
    /* How far one step of 8 bit colour in either reading can move it: under a scrim the bar is dark, and a step is worth more. */
    const tol = Math.max(ratio(d[0] + 1, e[0] - 1) - ratio(d[0], e[0]), ratio(d[0], e[0]) - ratio(d[0] - 1, e[0] + 1))
    return { v: Math.round(ratio(d[0], e[0])), tol: Math.max(1, Math.ceil(tol)) }
  }
})

const problems = []
const expect = (ok, what, detail) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${detail ? `: ${detail}` : ""}`)
  if (!ok) problems.push(`${what}${detail ? ` (${detail})` : ""}`)
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * One change on the glass: the frames from `from` for `span` ms, as the
 * bar's red channel at the sample point, from the level before to the level
 * it settles on.
 */
function change(frames, from, span) {
  const inside = frames.filter((f) => f.at >= from - 5 && f.at <= from + span)
  const before = [...frames].reverse().find((f) => f.at < from - 5)
  const a = before ? before.v : inside[0]?.v
  const b = inside[inside.length - 1]?.v
  const total = b - a
  const seq = [a, ...inside.map((f) => f.v)]
  const tols = [0, ...inside.map((f) => f.tol)]
  let steps = 0, back = 0, jump = 0, peak = a
  for (let i = 1; i < seq.length; i++) {
    const d = seq[i] - seq[i - 1]
    /* Part way: further from both ends than reading the colour can be off by. */
    if (Math.abs(seq[i] - a) > tols[i] && Math.abs(seq[i] - b) > tols[i]) steps++
    /* The furthest it has gone back from the furthest it had got: a dip, or an overshoot that comes back. */
    if (total > 0) { peak = Math.max(peak, seq[i]); back = Math.max(back, peak - seq[i]) }
    if (total < 0) { peak = Math.min(peak, seq[i]); back = Math.max(back, seq[i] - peak) }
    if (total) jump = Math.max(jump, Math.abs(d) / Math.abs(total))
  }
  /* What reading the colour can be off by in these frames (8 bit steps, worth more under a scrim). */
  const tol = Math.max(1, ...inside.map((f) => f.tol))
  const moved = inside.findIndex((f) => Math.abs(f.v - a) > f.tol)
  const settled = inside.findIndex((f, i) => i >= moved && inside.slice(i).every((g) => Math.abs(g.v - b) <= g.tol))
  const times = inside.map((f) => `${Math.round(f.at - from)}:${f.v}`).join(" ")
  return { a, b, steps, back, tol, jump: Math.round(jump * 100) / 100, starts: moved === -1 ? null : Math.round(inside[moved].at - from), lasts: moved === -1 || settled === -1 ? null : Math.round(inside[settled].at - inside[moved].at), seq: times }
}

async function run({ phone, before = false, reduced = false }) {
  const W = phone ? 390 : 1280
  const H = phone ? 844 : 900
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  await page.setViewport(phone ? { width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: W, height: H, deviceScaleFactor: 1 })
  if (reduced) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e.message || e)))
  await page.goto(`${base}${before ? "/before" : "/"}${phone ? "" : "?mouse=1"}`)
  await wait(700)
  const trigger = phone ? "#account-trigger" : "header[data-shell-chrome] button"
  const at = await page.evaluate((sel) => {
    const el = Array.from(document.querySelectorAll(sel)).find((e) => e.getBoundingClientRect().width > 0)
    const r = el.getBoundingClientRect()
    /* The press is as busy as the real one: the menu put together in the click, and the page still at work a frame later. */
    el.addEventListener("click", () => {
      const spin = (ms) => { const t = performance.now(); while (performance.now() - t < ms) {} }
      spin(window.__busyClick)
      setTimeout(() => spin(window.__busyAfter), 16)
    })
    return { x: r.left + 5, bx: r.right + 10, y: r.top + r.height / 2, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
  }, trigger)
  await page.evaluate((a, b) => { window.__busyClick = a; window.__busyAfter = b }, BUSY_CLICK_MS, BUSY_AFTER_MS)
  if (process.env.DEBUG) await page.evaluate((sel) => {
    const el = Array.from(document.querySelectorAll(sel)).find((e) => e.getBoundingClientRect().width > 0)
    window.__log = []
    const tick = () => {
      const f = el.querySelector("[data-account-film]")
      window.__log.push(`${Math.round(performance.now())}:${f ? Math.round(+getComputedStyle(f).opacity * 1000) / 1000 : getComputedStyle(el).backgroundColor}${el.dataset.pressed !== undefined ? "p" : ""}${el.dataset.open !== undefined ? "o" : ""}`)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    for (const t of ["pointerdown", "pointerup", "click"]) el.addEventListener(t, () => window.__log.push(`${Math.round(performance.now())}:${t}`))
  }, trigger)
  const cdp = await page.createCDPSession()
  if (phone) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  const shots = []
  let t0 = null
  cdp.on("Page.screencastFrame", (f) => {
    shots.push({ at: f.metadata.timestamp * 1000, data: f.data })
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  })
  const now = () => page.evaluate(() => performance.timeOrigin + performance.now())
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 })
  await wait(300)
  const marks = {}
  if (phone) {
    marks.open = await now()
    await page.touchscreen.tap(at.cx, at.cy)
    await wait(900)
    marks.close = await now()
    await page.touchscreen.tap(W / 2, 170)
    await wait(900)
  } else {
    marks.hoverIn = await now()
    await page.mouse.move(at.cx, at.cy, { steps: 1 })
    await wait(600)
    marks.open = await now()
    await page.mouse.click(at.cx, at.cy)
    await wait(700)
    marks.close = await now()
    await page.mouse.click(at.cx, at.cy)
    await wait(700)
    marks.hoverOut = await now()
    await page.mouse.move(at.cx, H - 40, { steps: 1 })
    await wait(600)
  }
  await cdp.send("Page.stopScreencast")
  if (process.env.DEBUG === "2") console.log((await page.evaluate(() => window.__log)).slice(0, 80).join(" "))
  if (phone) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  const film = before ? null : await page.evaluate((sel) => {
    const el = Array.from(document.querySelectorAll(sel)).find((e) => e.getBoundingClientRect().width > 0)
    const f = el.querySelector("[data-account-film]")
    return f ? { duration: getComputedStyle(f).transitionDuration, easing: getComputedStyle(f).transitionTimingFunction, property: getComputedStyle(f).transitionProperty } : null
  }, trigger)
  await ctx.close()
  const frames = []
  for (const s of shots) frames.push({ at: s.at, ...(await reader.evaluate((png, x, y, bx, w) => window.readAt(png, x, y, bx, w), s.data, at.x, at.y, at.bx, W)), data: s.data })
  if (t0 === null) t0 = frames[0]?.at
  const label = `${phone ? "phone 390" : "desktop 1280"}${before ? " BEFORE (background colour)" : ""}${reduced ? " reduced motion" : ""}`
  console.log(`\n${label}${film ? `   film: ${film.property} ${film.duration} ${film.easing}` : ""}`)
  const names = phone ? [["open", "the tap opens the sheet: the grey comes in"], ["close", "the sheet closes: the grey goes"]]
    : [["hoverIn", "the pointer comes on: the hover grey comes in"], ["open", "the click opens the dropdown: the open grey"], ["close", "the click closes it, pointer still on: back to the hover grey"], ["hoverOut", "the pointer leaves: the grey goes"]]
  const out = {}
  for (const [k, what] of names) {
    const c = change(frames, marks[k], phone ? 800 : 560)
    out[k] = c
    const detail = `${c.a} to ${c.b}, ${c.steps} part way frames, largest frame ${Math.round(c.jump * 100)}% of it, went back ${c.back} levels (reading within ${c.tol}), starts ${c.starts}ms, lasts ${c.lasts}ms`
    if (before) { console.log(`        ${what}: ${detail}`); continue }
    if (reduced) { expect(c.a !== c.b && c.steps === 0, `${what}, in one frame`, detail); continue }
    expect(c.a !== c.b && c.steps >= (Math.abs(c.b - c.a) > 4 * c.tol ? MIN_STEPS : 2) && c.back <= c.tol && c.jump <= MAX_JUMP, what, detail)
    if (process.env.DEBUG) console.log("         ", c.seq)
  }
  if (SHOTS && !before && !reduced) {
    const pick = (t) => frames.find((f) => f.at >= t)
    const save = (n, f) => f && writeFileSync(join(SHOTS, `account-film-${phone ? 390 : 1280}-${n}.png`), Buffer.from(f.data, "base64"))
    save("1-rest", frames[0])
    save("2-half-way", pick(marks.open + (out.open.starts ?? 0) + 90))
    save("3-open", pick(marks.close - 30))
  }
  if (errors.length) expect(false, "no script errors", errors.slice(0, 2).join(" | "))
  return out
}

const results = {}
for (const phone of [true, false]) {
  results[`${phone ? "phone" : "desktop"} before`] = await run({ phone, before: true })
  results[`${phone ? "phone" : "desktop"}`] = await run({ phone })
  results[`${phone ? "phone" : "desktop"} reduced`] = await run({ phone, reduced: true })
}
await browser.close()
server.close()
const table = Object.fromEntries(Object.entries(results).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([n, c]) => [n, `${c.steps} steps, max ${Math.round(c.jump * 100)}%, ${c.lasts}ms`]))]))
console.log("\n" + JSON.stringify(table, null, 1))
if (problems.length) fail(`${problems.length} problem${problems.length === 1 ? "" : "s"}:\n  ${problems.join("\n  ")}`)
console.log("\nok: the account button's grey fades in and out through part way frames on the glass, never back on itself, on a phone and a computer, in the busy frame of the menu opening")
