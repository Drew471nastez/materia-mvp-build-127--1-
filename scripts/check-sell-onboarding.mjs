/**
 * ===========================================================================
 *  /sell: ONE SCREEN FROM THE CLICK TO THE SETUP, AND A WAY OUT
 * ===========================================================================
 * "The onboarding and loading must be very smooth and clean." Sell on
 * Storelib, Become a seller and the end of a Sell on Storelib signup all
 * arrive on /sell, which the server has already decided (lib/auth/continue.ts
 * sellDecision), so what is left to see is the arrival itself:
 *
 *   NO JUMP          the route's loading screen and the page's first frame
 *                    draw the spinner in the same place, so the swap from
 *                    one to the other is invisible
 *   NO BLANK FRAME   sampled every frame with the CPU slowed four times:
 *                    at every frame either the spinner or the setup is on
 *                    screen, and the setup is fully up within 2s even so
 *   ON THE COMPOSITOR the spinner leaves on opacity alone
 *   NOTHING OF /app  no dashboard, sidebar or app shell is ever drawn
 *   THE WAY OUT      "Not now" at the top left, on the progress bar's line,
 *                    never touching it, a 44px press on a phone, going to
 *                    the page the link was pressed on; a second business
 *                    gets its way back to the first one instead
 *
 *   PROBE_CSS=source node scripts/check-sell-onboarding.mjs
 *   SHOTS=/some/dir PROBE_CSS=source node scripts/check-sell-onboarding.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".sell-onboarding-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/sell"
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(dir, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}), setSession: async () => ({}) }, from: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)
try {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-sell-onboarding.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div class="bg-white" data-page="auth"><div id="app"></div></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

const server = createServer((req, res) => {
  if (req.url.startsWith("/api/")) { res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); return }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--font-render-hinting=none"], headless: true })
const problems = []
const report = {}

/* Every frame: where the spinner is and how visible, and how visible the setup is. */
const SAMPLER = `(() => {
  window.__frames = []
  window.__stop = false
  const spin = () => document.querySelector(".animate-spin")
  const tick = () => {
    const s = spin()
    const d = document.querySelector('[role="dialog"]')
    const sb = s ? s.getBoundingClientRect() : null
    let so = 0
    for (let el = s; el && el !== document.body; el = el.parentElement) { const o = parseFloat(getComputedStyle(el).opacity); so = (so || 1) * o }
    const dop = d ? parseFloat(getComputedStyle(d).opacity) : 0
    /* The middle, because a spinning square's box grows and shrinks as it turns; its middle does not move. */
    window.__frames.push({ t: performance.now(), spinner: s ? { x: Math.round(sb.left + sb.width / 2), y: Math.round(sb.top + sb.height / 2), o: +so.toFixed(3) } : null, dialog: d ? +dop.toFixed(3) : null,
      appShell: !!document.querySelector(".app-main-content, [data-app-sidebar], aside") })
    if (!window.__stop) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})()`

for (const [label, viewport] of [
  ["390", { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
  ["320", { width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["768", { width: 768, height: 1024, deviceScaleFactor: 2 }],
  ["1440", { width: 1440, height: 900, deviceScaleFactor: 1 }],
]) {
  for (const second of [false, true]) {
    const phone = viewport.width < 640
    const at = `at ${label}${second ? " (second business)" : ""}:`
    const page = await browser.newPage()
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e)))
    await page.setViewport(viewport)
    await page.goto(`${base}/${second ? "?first=1" : ""}`)
    await page.waitForFunction(() => window.__ran === true, { timeout: 15000 })
    await wait(150)
    const loading = await page.evaluate(() => { const s = document.querySelector(".animate-spin"); if (!s) return null; const b = s.getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) } })
    if (!loading) problems.push(`${at} the loading screen drew no spinner`)

    const cdp = await page.createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    await page.evaluate(SAMPLER)
    await page.evaluate(() => window.__swap())
    await page.waitForFunction(() => { const d = document.querySelector('[role="dialog"]'); return d && parseFloat(getComputedStyle(d).opacity) >= 0.999 }, { timeout: 8000 }).catch(() => {})
    await wait(500)
    const frames = await page.evaluate(() => { window.__stop = true; return window.__frames })
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })

    const first = frames[0]
    if (loading && first?.spinner && (Math.abs(first.spinner.x - loading.x) > 0 || Math.abs(first.spinner.y - loading.y) > 0)) {
      problems.push(`${at} the spinner jumps from ${JSON.stringify(loading)} to ${JSON.stringify(first.spinner)} when the page replaces the loading screen`)
    }
    const blank = frames.filter((f) => (f.spinner?.o ?? 0) < 0.05 && (f.dialog ?? 0) < 0.05)
    /* The dialog opening from nothing and the spinner still fully there is the first frame; blank means neither. */
    if (blank.length) problems.push(`${at} ${blank.length} frame(s) with neither the spinner nor the setup on screen`)
    if (frames.some((f) => f.appShell)) problems.push(`${at} something of the /app shell was drawn`)
    const up = frames.find((f) => (f.dialog ?? 0) >= 0.999)
    const upAfter = up ? Math.round(up.t - frames[0].t) : null
    if (upAfter == null || upAfter > 2000) problems.push(`${at} the setup was not fully up within 2s at 4x slower CPU (${upAfter}ms)`)
    const spinnerSteps = new Set(frames.map((f) => f.spinner?.o).filter((o) => o != null && o > 0 && o < 1)).size

    const row = await page.evaluate(() => {
      const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), midY: +(r.top + r.height / 2).toFixed(1) } }
      const bar = document.querySelector("[data-onboarding-progress]")
      const leave = document.querySelector("[data-onboarding-leave]")
      const back = document.querySelector("[data-onboarding-switch-back]")
      return { bar: bar ? box(bar) : null, leave: leave ? { ...box(leave), href: leave.getAttribute("href"), label: leave.getAttribute("aria-label"), text: leave.textContent.trim(), shown: getComputedStyle(leave.querySelector("span")).display !== "none" } : null, back: back ? box(back) : null }
    })
    if (second) {
      if (row.leave) problems.push(`${at} a second business shows Not now as well as its way back`)
      if (!row.back) problems.push(`${at} a second business has no way back to the first one`)
    } else if (!row.leave || !row.bar) problems.push(`${at} no way out of the setup was drawn`)
    else {
      if (row.leave.href !== "/p/prints") problems.push(`${at} Not now goes to ${row.leave.href}, not the page it was pressed on`)
      if (row.leave.label !== "Not now") problems.push(`${at} the way out is labelled ${row.leave.label}`)
      if (row.bar.x - row.leave.right < 8) problems.push(`${at} Not now and the bar are ${row.bar.x - row.leave.right}px apart`)
      if (Math.abs(row.leave.midY - row.bar.midY) > 1) problems.push(`${at} Not now is not on the bar's line (${row.leave.midY} vs ${row.bar.midY})`)
      if (phone && (row.leave.w < 44 || row.leave.h < 44)) problems.push(`${at} Not now is ${row.leave.w}x${row.leave.h}, under a 44px press`)
      if (phone === row.leave.shown) problems.push(`${at} the words Not now should show ${phone ? "only from 640px" : "beside the arrow"}`)
    }
    if (errors.length) problems.push(`${at} page errors: ${errors.join(" | ")}`)
    report[`${label}${second ? "+second" : ""}`] = { frames: frames.length, setupUpAfterMs: upAfter, spinnerFadeFrames: spinnerSteps, gap: row.leave && row.bar ? row.bar.x - row.leave.right : null }
    if (process.env.SHOTS && !second) await page.screenshot({ path: join(process.env.SHOTS, `sell-${label}.png`) })
    await page.close()
  }
}

/* A SETUP BEGUN AND NOT FINISHED: back on the plan step it was left on, with what was typed still there. */
for (const [label, viewport] of [["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ["1440", { width: 1440, height: 900 }]]) {
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.setViewport(viewport)
  await page.goto(`${base}/?resume=1`)
  await page.waitForFunction(() => window.__ran === true, { timeout: 15000 })
  await page.evaluate(() => window.__swap())
  await page.waitForFunction(() => { const d = document.querySelector('[role="dialog"]'); return d && parseFloat(getComputedStyle(d).opacity) >= 0.999 }, { timeout: 8000 }).catch(() => {})
  await wait(600)
  const plan = await page.evaluate(() => /Free|Growth|Pro/.test(document.querySelector('[role="dialog"]')?.textContent || "") && !document.querySelector('[role="dialog"] input[type="text"]'))
  if (!plan) problems.push(`resume at ${label}: did not open on the plan step`)
  /* Back once: step three, then the first step with the store name typed last time. */
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { const b = [...document.querySelectorAll('[role="dialog"] button')].find((x) => /^Back$/i.test((x.getAttribute("aria-label") || x.textContent || "").trim())); b?.click() })
    await wait(450)
  }
  const name = await page.evaluate(() => document.querySelector('[role="dialog"] input[type="text"]')?.value ?? null)
  if (name !== "Maya Prints") problems.push(`resume at ${label}: step one shows ${JSON.stringify(name)}, not the store name typed before`)
  if (errors.length) problems.push(`resume at ${label}: page errors: ${errors.join(" | ")}`)
  report[`resume-${label}`] = { plan, name }
  if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, `sell-resume-${label}.png`) })
  await page.close()
}

await browser.close()
server.close()
console.log(JSON.stringify(report, null, 2))
if (problems.length) { console.error(`\n${problems.length} problem(s):\n  - ${problems.join("\n  - ")}`); process.exit(1) }
console.log("\nok  /sell opens on the loading screen's spinner, the setup fades up over it without a blank frame or any of /app, and Not now is in its place")
