/**
 * ===========================================================================
 *  A NEW ACCOUNT'S ONBOARDING, BOTH BRANCHES, IN A BROWSER (round 13 O2)
 * ===========================================================================
 * The onboarding as /onboarding/start opens it (scripts/render-onboarding-
 * branch.tsx), at 390x844 and 1440x900, and in the app at 390 (a stubbed
 * Capacitor bridge):
 *
 *   PROFILE           "Make it yours": photo, name (prefilled), username,
 *                     optional bio. Continue saves the name and handle.
 *   NOTIFICATIONS     "Don't miss a thing". Not now skips. Turn on
 *                     notifications asks the phone only in the app stub.
 *   THE STEP CHANGE   sampled every frame: the step leaving and the one
 *                     arriving cross on opacity and translate, with a
 *                     filmstrip of the frames to look at
 *
 *   PROBE_CSS=source SHOTS=/some/dir node scripts/check-onboarding-branch.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const SHOTS = process.env.SHOTS || null
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const dir = join(root, ".onboarding-branch-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/onboarding/start"
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push(h) { if (typeof h === "string") location.assign(h) }, replace(h) { if (typeof h === "string") location.assign(h) }, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
`)
writeFileSync(join(dir, "image.jsx"), `import React from "react"
export default function Image({ src, alt, width, height, fill, sizes, preload, priority, unoptimized, loading, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src.src, alt, width, height, ...rest }) }
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(dir, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) }, from: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
`)
/* The phone's notification question: the stub answers yes after a beat, and says it was asked. */
writeFileSync(join(dir, "push.js"), `export const PushNotifications = {
  checkPermissions: async () => ({ receive: "prompt" }),
  requestPermissions: async () => { window.__pushAsked = (window.__pushAsked || 0) + 1; await new Promise((r) => setTimeout(r, 120)); return { receive: "granted" } },
}
`)
writeFileSync(join(dir, "push-client.js"), `export async function registerDevice() { window.__registered = true }
`)
try {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-onboarding-branch.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:next/image=${join(dir, "image.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@capacitor/push-notifications=${join(dir, "push.js")}`,
    `--alias:@/lib/push/client=${join(dir, "push-client.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
  `<style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

/** Every /api call the page made, in order, with its body. */
const calls = []
const server = createServer((req, res) => {
  let body = ""
  req.on("data", (c) => (body += c))
  req.on("end", () => {
    if (req.url.startsWith("/api/")) {
      calls.push({ method: req.method, url: req.url, body })
      let out = "{}"
      if (req.url.startsWith("/api/profile/username") && req.method === "GET") {
        const handle = new URL(req.url, "http://x").searchParams.get("handle")
        out = JSON.stringify(handle === "taken" ? { handle, available: false, error: "This username is taken" } : { handle, available: true })
      } else if (req.url.startsWith("/api/profile/username")) out = JSON.stringify({ username: JSON.parse(body || "{}").username })
      else if (req.url.startsWith("/api/account/welcome")) out = JSON.stringify({ ok: true })
      setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(out) }, 80)
      return
    }
    if (req.url.startsWith("/images/")) {
      const file = join(root, "public", decodeURIComponent(req.url.split("?")[0]))
      if (existsSync(file)) {
        res.writeHead(200, { "content-type": file.endsWith(".webp") ? "image/webp" : file.endsWith(".png") ? "image/png" : "image/jpeg" })
        res.end(readFileSync(file))
        return
      }
    }
    res.writeHead(200, { "content-type": "text/html" })
    res.end(html)
  })
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const problems = []
const report = {}
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--font-render-hinting=none"], headless: true })

/** Frames of the step change: what is on screen, how visible, how far moved, every frame for `ms`. */
const SAMPLE = (ms) => `new Promise((done) => {
  const out = []; const t0 = performance.now()
  const step = () => {
    const enter = document.querySelector("[data-onboarding-step]")
    const leave = document.querySelector("[data-onboarding-leaving]")
    const read = (el) => el ? { o: +getComputedStyle(el).opacity, t: getComputedStyle(el).translate } : null
    out.push({ at: Math.round(performance.now() - t0), enter: read(enter), leave: read(leave), step: enter && enter.getAttribute("data-onboarding-step") })
    if (performance.now() - t0 < ${ms}) requestAnimationFrame(step); else done(out)
  }
  requestAnimationFrame(step)
})`

/** A strip of screenshots taken as fast as the browser gives them, laid side by side in one picture. */
async function filmstrip(page, viewport, name, act) {
  /* A screenshot takes longer than the whole 280ms step change, so the change is slowed to a twelfth for the strip (CDP's animation clock); the per frame sample above runs at full speed. */
  const cdp = await page.createCDPSession()
  await cdp.send("Animation.enable")
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 / 12 })
  const frames = []
  await act()
  const t0 = Date.now()
  for (let i = 0; i < 6; i++) {
    frames.push({ at: Math.round((Date.now() - t0) / 12), data: await page.screenshot({ encoding: "base64", type: "jpeg", quality: 70 }) })
  }
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 })
  await cdp.detach()
  if (!SHOTS) return
  const strip = await browser.newPage()
  const w = Math.min(viewport.width, 480)
  const scale = w / viewport.width
  await strip.setViewport({ width: Math.round(w * frames.length + 8 * (frames.length + 1)), height: Math.round(viewport.height * scale) + 40, deviceScaleFactor: 1 })
  await strip.setContent(`<body style="margin:0;background:#e5e7eb;display:flex;gap:8px;padding:8px;font:12px system-ui">${frames
    .map((f) => `<figure style="margin:0"><img style="width:${w}px;display:block" src="data:image/jpeg;base64,${f.data}"><figcaption>about ${f.at}ms in</figcaption></figure>`)
    .join("")}</body>`)
  await strip.screenshot({ path: join(SHOTS, `${name}.png`) })
  await strip.close()
}

const textOf = (page, sel) => page.$eval(sel, (el) => el.textContent.trim()).catch(() => null)
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

for (const [label, viewport, native] of [
  ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, false],
  ["1440", { width: 1440, height: 900, deviceScaleFactor: 1 }, false],
  ["390-app", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, true],
]) {
  const page = await browser.newPage()
  await page.setViewport(viewport)
  const navigations = []
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) navigations.push(f.url()) })
  const r = (report[label] = {})
  const q = native ? "?native=1" : ""

  await page.goto(`${base}/onboarding/start${q}`, { waitUntil: "load" })
  await page.waitForSelector("[data-onboarding-join='profile']")
  await wait(400)
  r.heading = await textOf(page, "[data-onboarding-step] h1")
  if (r.heading !== "Make it yours") problems.push(`${label}: the first step reads "${r.heading}"`)
  r.photoBox = await page.$eval("[data-onboarding-join-photo]", (el) => { const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) } }).catch(() => null)
  if (!r.photoBox || r.photoBox.h < 44) problems.push(`${label}: the photo is missing`)
  r.leave = await page.$eval("[data-onboarding-leave]", (el) => { const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), text: el.textContent.trim() } }).catch(() => null)
  if (!r.leave || r.leave.h < 40) problems.push(`${label}: the way out is missing or under 40px`)
  r.nameValue = await page.$eval("[data-onboarding-join-name]", (el) => el.value)
  if (r.nameValue !== "Ana Lucia") problems.push(`${label}: the name is not prefilled (${r.nameValue})`)
  const handle = await page.$("[data-onboarding-join-handle]")
  const retype = async (text) => {
    await handle.evaluate((el) => { el.focus(); el.select() })
    await page.keyboard.press("Backspace")
    await handle.type(text)
  }
  await retype("taken")
  await wait(700)
  r.takenSays = await page.$eval("[data-onboarding-join='profile'] p[aria-live]", (el) => el.textContent.trim())
  r.nextHeldWhenTaken = await page.$eval("[data-onboarding-next]", (el) => el.disabled)
  if (!/taken/i.test(r.takenSays) || !r.nextHeldWhenTaken) problems.push(`${label}: a taken handle did not hold Continue (${r.takenSays})`)
  await retype("Ana Lucia.2")
  await wait(700)
  r.freeSays = await page.$eval("[data-onboarding-join='profile'] p[aria-live]", (el) => el.textContent.trim())
  if (r.freeSays !== "storelib.com/@ana-lucia-2") problems.push(`${label}: the typed handle reads ${r.freeSays}`)
  r.continueLabel = await textOf(page, "[data-onboarding-next]")
  if (r.continueLabel !== "Continue") problems.push(`${label}: the profile button reads ${r.continueLabel}`)
  r.overflowName = await overflow(page)
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${label}-1-profile.png`) })
  const sample = page.evaluate(SAMPLE(420))
  const before = calls.length
  await page.click("[data-onboarding-next]")
  r.frames = await sample
  await page.waitForSelector("[data-onboarding-step='13']", { timeout: 4000 }).catch(() => null)
  const crossing = (r.frames || []).filter((f) => f.leave && f.enter)
  if (crossing.length < 3) problems.push(`${label}: the step change crossed in ${crossing.length} frames (a cut, not a crossfade)`)
  const saved = calls.slice(before)
  if (!saved.some((c) => c.method === "PATCH" && c.url.startsWith("/api/profile/username"))) problems.push(`${label}: the new handle was not saved`)
  if (!saved.some((c) => c.url.startsWith("/api/account/welcome") && /"name":"Ana Lucia"/.test(c.body))) problems.push(`${label}: the name was not saved`)
  await wait(400)
  r.notifyHeading = await textOf(page, "[data-onboarding-step] h1")
  if (r.notifyHeading !== "Don't miss a thing") problems.push(`${label}: notifications open on "${r.notifyHeading}"`)
  r.skipLabel = await textOf(page, "[data-onboarding-skip]")
  if (r.skipLabel !== "Not now") problems.push(`${label}: notifications are not skippable with Not now (${r.skipLabel})`)
  r.allowLabel = await textOf(page, "[data-onboarding-allow-push]")
  if (r.allowLabel !== "Turn on notifications") problems.push(`${label}: the primary reads ${r.allowLabel}`)
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${label}-2-notify.png`) })
  const doneBefore = calls.length
  if (native) {
    await page.click("[data-onboarding-allow-push]")
    await wait(700)
    r.pushAsked = await page.evaluate(() => window.__pushAsked || 0)
    if (r.pushAsked !== 1) problems.push(`${label}: the phone was asked ${r.pushAsked} times`)
  } else {
    await page.click("[data-onboarding-skip]")
    await wait(700)
    r.pushAsked = await page.evaluate(() => window.__pushAsked || 0)
    if (r.pushAsked) problems.push(`${label}: the web asked before Turn on notifications`)
  }
  r.doneCalls = calls.slice(doneBefore).map((c) => `${c.method} ${c.url} ${c.body}`)
  r.landed = navigations[navigations.length - 1]
  if (!calls.slice(doneBefore).some((c) => /"done":true/.test(c.body))) problems.push(`${label}: finishing did not mark onboarding answered`)
  if (!/\/community\/clay-studio\?join=1$/.test(r.landed || "")) problems.push(`${label}: finished on ${r.landed}`)
  if (r.overflowName > 0) problems.push(`${label}: the page scrolls sideways (${r.overflowName})`)
  await page.close()
}

await browser.close()
server.close()
console.log(JSON.stringify(report, (k, v) => (k === "frames" ? undefined : v), 2))
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n  ${problems.join("\n  ")}`)
  process.exit(1)
}
console.log("\nonboarding branch: all checks passed")
