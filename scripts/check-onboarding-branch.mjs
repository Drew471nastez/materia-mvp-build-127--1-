/**
 * ===========================================================================
 *  A NEW ACCOUNT'S ONBOARDING, BOTH BRANCHES, IN A BROWSER (round 13 O2)
 * ===========================================================================
 * The onboarding as /onboarding/start opens it (scripts/render-onboarding-
 * branch.tsx), at 390x844 and 1440x900, and in the app at 390 (a stubbed
 * Capacitor bridge):
 *
 *   THE QUESTION      "What brings you to Storelib?", two answers, each a
 *                     whole card, 44px or taller on a phone, side by side
 *                     on a computer, nothing past the screen's edge
 *   SELL              the store setup's first step, unchanged; Back returns
 *                     to the question
 *   JOIN              the name (prefilled) and handle (checked as typed),
 *                     saved through /api/profile/username and
 *                     /api/account/welcome as the step is left; the photo;
 *                     Done ends at the community it was going to
 *   APP               a notifications step whose button asks the phone
 *                     (the stub records the ask) and says the answer
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
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
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

  /* ── The question, then the sell branch and back ───────────────────── */
  await page.goto(`${base}/onboarding/start${q}`, { waitUntil: "load" })
  await page.waitForSelector("[data-onboarding-branch]")
  await wait(500)
  r.heading = await textOf(page, "[data-onboarding-branch] h1")
  if (r.heading !== "What brings you to Storelib?") problems.push(`${label}: the first step reads "${r.heading}"`)
  r.choices = await page.$$eval("[data-onboarding-branch-choice]", (els) => els.map((el) => { const b = el.getBoundingClientRect(); return { key: el.getAttribute("data-onboarding-branch-choice"), x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) } }))
  if (r.choices.length !== 2) problems.push(`${label}: ${r.choices.length} answers, not 2`)
  if (r.choices.some((c) => c.h < 44)) problems.push(`${label}: an answer is under 44px tall`)
  if (viewport.width >= 640 && !(r.choices[0].y === r.choices[1].y)) problems.push(`${label}: the answers are not side by side on a computer`)
  if (viewport.width < 640 && !(r.choices[1].y > r.choices[0].y)) problems.push(`${label}: the answers are not stacked on a phone`)
  r.overflowQuestion = await overflow(page)
  r.footerHidden = await page.$$eval("[data-onboarding-back], [data-onboarding-next]", (els) => els.map((el) => getComputedStyle(el.closest("[style]") || el).visibility))
  r.leave = await page.$eval("[data-onboarding-leave]", (el) => { const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), text: el.textContent.trim() } }).catch(() => null)
  if (!r.leave || r.leave.h < 40) problems.push(`${label}: Not now is missing or under 40px`)
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${label}-0-question.png`) })

  await filmstrip(page, viewport, `${label}-strip-sell`, () => page.click('[data-onboarding-branch-choice="sell"]'))
  await wait(400)
  r.sellHeading = await textOf(page, "[data-onboarding-step] h1")
  if (r.sellHeading !== "Name your store") problems.push(`${label}: the sell branch opens on "${r.sellHeading}"`)
  r.sellBackShown = await page.$eval("[data-onboarding-back]", (el) => getComputedStyle(el).visibility === "visible" && !el.disabled)
  if (!r.sellBackShown) problems.push(`${label}: no Back from the store's first step to the question`)
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${label}-1-sell.png`) })
  await page.click("[data-onboarding-back]")
  await wait(450)
  r.backToQuestion = !!(await page.$("[data-onboarding-step='0'] [data-onboarding-branch]"))
  if (!r.backToQuestion) problems.push(`${label}: Back did not return to the question`)

  /* ── The join branch ──────────────────────────────────────────────── */
  const sample = page.evaluate(SAMPLE(420))
  await page.click('[data-onboarding-branch-choice="join"]')
  r.frames = await sample
  /* And once more, slowed, for the strip: back to the question, then the join answer again. */
  await wait(400)
  await page.click("[data-onboarding-back]")
  await wait(500)
  await filmstrip(page, viewport, `${label}-strip-join`, () => page.click('[data-onboarding-branch-choice="join"]'))
  await page.waitForSelector("[data-onboarding-step='11']")
  const crossing = r.frames.filter((f) => f.leave && f.enter)
  r.crossFrames = crossing.length
  r.enterOpacities = r.frames.map((f) => f.enter?.o ?? null).slice(0, 14)
  if (crossing.length < 3) problems.push(`${label}: the step change crossed in ${crossing.length} frames (a cut, not a crossfade)`)
  if (!r.frames.some((f) => f.enter && f.enter.o > 0 && f.enter.o < 1)) problems.push(`${label}: the arriving step never faded`)
  await wait(400)
  r.joinHeading = await textOf(page, "[data-onboarding-step] h1")
  if (r.joinHeading !== "What should we call you?") problems.push(`${label}: the join branch opens on "${r.joinHeading}"`)
  r.nameValue = await page.$eval("[data-onboarding-join-name]", (el) => el.value)
  if (r.nameValue !== "Ana Lucia") problems.push(`${label}: the name is not prefilled (${r.nameValue})`)
  /* A taken handle says so and holds Next; a free one lets it go. */
  const handle = await page.$("[data-onboarding-join-handle]")
  const retype = async (text) => {
    await handle.evaluate((el) => { el.focus(); el.select() })
    await page.keyboard.press("Backspace")
    await handle.type(text)
  }
  await retype("taken")
  await wait(700)
  r.takenSays = await page.$eval("[data-onboarding-join='name'] p[aria-live]", (el) => el.textContent.trim())
  r.nextHeldWhenTaken = await page.$eval("[data-onboarding-next]", (el) => el.disabled)
  if (!/taken/i.test(r.takenSays) || !r.nextHeldWhenTaken) problems.push(`${label}: a taken handle did not hold Next (${r.takenSays})`)
  /* Typed the way people type: a space and a dot become the dash a handle allows. */
  await retype("Ana Lucia.2")
  await wait(700)
  r.freeSays = await page.$eval("[data-onboarding-join='name'] p[aria-live]", (el) => el.textContent.trim())
  if (r.freeSays !== "storelib.com/@ana-lucia-2") problems.push(`${label}: the typed handle reads ${r.freeSays}`)
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${label}-2-name.png`) })
  r.overflowName = await overflow(page)
  const before = calls.length
  await page.click("[data-onboarding-next]")
  await page.waitForSelector("[data-onboarding-step='12']", { timeout: 4000 }).catch(() => null)
  const saved = calls.slice(before)
  r.savedCalls = saved.map((c) => `${c.method} ${c.url.split("?")[0]} ${c.body}`)
  if (!saved.some((c) => c.method === "PATCH" && c.url.startsWith("/api/profile/username"))) problems.push(`${label}: the new handle was not saved`)
  if (!saved.some((c) => c.url.startsWith("/api/account/welcome") && /"name":"Ana Lucia"/.test(c.body))) problems.push(`${label}: the name was not saved`)
  await wait(400)
  r.photoHeading = await textOf(page, "[data-onboarding-step] h1")
  if (r.photoHeading !== "Add a photo") problems.push(`${label}: after the name comes "${r.photoHeading}"`)
  r.photoBox = await page.$eval("[data-onboarding-join-photo]", (el) => { const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) } })
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${label}-3-photo.png`) })
  r.nextLabelOnPhoto = await textOf(page, "[data-onboarding-next]")

  if (native) {
    if (r.nextLabelOnPhoto !== "Next") problems.push(`${label}: in the app the photo step is not followed by notifications (${r.nextLabelOnPhoto})`)
    await page.click("[data-onboarding-next]")
    await page.waitForSelector("[data-onboarding-step='13']", { timeout: 3000 }).catch(() => null)
    await wait(400)
    r.notifyHeading = await textOf(page, "[data-onboarding-step] h1")
    r.skipLabel = await textOf(page, "[data-onboarding-skip]")
    if (r.skipLabel !== "Not now") problems.push(`${label}: notifications are not skippable with Not now (${r.skipLabel})`)
    r.doneBeforeAnswer = await page.$eval("[data-onboarding-next]", (el) => getComputedStyle(el).visibility)
    if (r.doneBeforeAnswer !== "hidden") problems.push(`${label}: Done shows beside Not now before the phone was asked`)
    r.allowBox = await page.$eval("[data-onboarding-allow-push]", (el) => { const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) } }).catch(() => null)
    if (!r.allowBox || r.allowBox.h < 44) problems.push(`${label}: Allow notifications is missing or under 44px`)
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `${label}-4-notify.png`) })
    await page.click("[data-onboarding-allow-push]")
    await wait(500)
    r.pushAsked = await page.evaluate(() => window.__pushAsked || 0)
    r.registered = await page.evaluate(() => !!window.__registered)
    r.answer = await page.$eval("[data-onboarding-join='notify']", (el) => el.getAttribute("data-push-answer"))
    if (r.pushAsked !== 1 || r.answer !== "granted" || !r.registered) problems.push(`${label}: the phone was asked ${r.pushAsked} times, answer ${r.answer}, registered ${r.registered}`)
    r.skipAfterAnswer = await page.$eval("[data-onboarding-skip]", (el) => getComputedStyle(el).visibility)
    if (r.skipAfterAnswer !== "hidden") problems.push(`${label}: Not now stays after the answer`)
    await wait(300)
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `${label}-5-notify-on.png`) })
  } else if (r.nextLabelOnPhoto !== "Done") problems.push(`${label}: on the web the photo step should be the last (${r.nextLabelOnPhoto})`)

  const doneBefore = calls.length
  await page.click("[data-onboarding-next]")
  await wait(900)
  r.doneCalls = calls.slice(doneBefore).map((c) => `${c.method} ${c.url} ${c.body}`)
  r.landed = navigations[navigations.length - 1]
  if (!calls.slice(doneBefore).some((c) => /"done":true/.test(c.body))) problems.push(`${label}: Done did not mark the question answered`)
  if (!/\/community\/clay-studio\?join=1$/.test(r.landed || "")) problems.push(`${label}: Done landed on ${r.landed}, not the community`)
  if (r.overflowQuestion > 0 || r.overflowName > 0) problems.push(`${label}: the page scrolls sideways (${r.overflowQuestion}, ${r.overflowName})`)
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
