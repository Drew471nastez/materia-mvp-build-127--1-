/**
 * ===========================================================================
 *  AN AVATAR WITH A PHOTO NEVER SHOWS INITIALS FIRST
 * ===========================================================================
 * "When the user profile avatar loads, it first shows the initials and then
 * the image loads abruptly. Make it cleaner; that way is cheap."
 *
 * Every avatar the shell draws (components/app/app-avatar), with its photo
 * held back 400ms by the server, read on every animation frame from the
 * first one, at 390 and 1440:
 *
 *   NO INITIALS       frames showing initials while a photo exists: 0
 *   THE CIRCLE        its full size on the first frame, and never changing
 *   THE FADE          the photo goes from 0 to 1 over about 150ms, through
 *                     several frames, never backwards
 *   COMING BACK       drawn again once the photo has been seen: it is at full
 *                     opacity on the first frame, with no fade replayed
 *   NO PHOTO, OR A    the initials, and only then
 *   BROKEN ONE
 *
 *   node scripts/check-app-avatar.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".avatar-probe")
mkdirSync(dir, { recursive: true })
try {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-app-avatar.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"', `--alias:@=${root}`, "--loader:.css=empty"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })
const photo = readFileSync(join(root, "public/placeholder-user.jpg"))

const server = createServer((req, res) => {
  let url = new URL(req.url, "http://x")
  /* A root relative picture goes through the image optimizer in the app; here it answers with the same file. */
  if (url.pathname === "/_next/image") url = new URL(url.searchParams.get("url") || "/", "http://x")
  if (url.pathname === "/avatar.png") {
    setTimeout(() => { res.writeHead(200, { "content-type": "image/jpeg", "cache-control": "max-age=3600" }); res.end(photo) }, Number(url.searchParams.get("delay") || 0))
    return
  }
  if (url.pathname === "/missing.png") { setTimeout(() => { res.writeHead(404); res.end() }, 200); return }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

const RECORD = () => {
  window.__rec = []
  const tick = (t) => {
    window.__rec.push({
      t,
      avatars: [...document.querySelectorAll("[data-app-avatar]")].map((a) => {
        const r = a.getBoundingClientRect()
        const img = a.querySelector("img")
        const text = [...a.querySelectorAll("span")].map((s) => s.textContent).join("").trim()
        return { w: Math.round(r.width), h: Math.round(r.height), initials: text.length > 0, img: !!img, opacity: img ? Number(getComputedStyle(img).opacity) : null }
      }),
    })
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const problems = []
const report = {}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (const [label, viewport] of [
  ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["1440", { width: 1440, height: 900, deviceScaleFactor: 1 }],
]) {
  const page = await browser.newPage()
  await page.setViewport(viewport)
  await page.evaluateOnNewDocument(`(${RECORD})()`)
  await page.goto(`${base}/?delay=400`)
  await wait(1100)
  const first = await page.evaluate(() => window.__rec.filter((r) => r.avatars.length))
  /* Drawn again, the photo already seen. */
  const t0 = await page.evaluate(() => performance.now())
  await page.evaluate(() => window.__remount())
  await wait(400)
  const again = await page.evaluate((t0) => window.__rec.filter((r) => r.t >= t0 && r.avatars.length), t0)
  await page.goto(`${base}/?fail`)
  await wait(900)
  const broken = await page.evaluate(() => window.__rec.slice(-1)[0])
  await page.goto(`${base}/?none`)
  await wait(300)
  const none = await page.evaluate(() => window.__rec.slice(-1)[0])
  await page.close()

  const n = first[0].avatars.length
  const initialsFrames = first.filter((r) => r.avatars.some((a) => a.initials)).length
  const sizes = first.map((r) => r.avatars.map((a) => `${a.w}x${a.h}`).join(","))
  const sizeChanges = new Set(sizes).size - 1
  const fades = []
  for (let i = 0; i < n; i++) {
    const op = first.map((r) => r.avatars[i].opacity)
    const start = op.findIndex((o) => o > 0.01)
    const end = op.findIndex((o) => o >= 0.99)
    let back = 0
    for (let k = 1; k < op.length; k++) if (op[k] < op[k - 1] - 0.001) back++
    fades.push({ ms: start >= 0 && end >= 0 ? Math.round(first[end].t - first[Math.max(0, start - 1)].t) : null, steps: op.filter((o) => o > 0.01 && o < 0.99).length, back })
  }
  const againFirst = again[0]?.avatars ?? []
  const againFaded = again.filter((r) => r.avatars.some((a) => a.opacity !== null && a.opacity < 0.99)).length
  const brokenInitials = broken.avatars.every((a) => a.initials && !a.img)
  const noneInitials = none.avatars.every((a) => a.initials && !a.img)
  report[label] = { avatars: n, framesWatched: first.length, initialsFrames, sizeChanges, firstSizes: sizes[0], fades, againFirstOpacity: againFirst.map((a) => a.opacity), againFadedFrames: againFaded, brokenInitials, noneInitials }
  const at = `at ${label}:`
  if (initialsFrames) problems.push(`${at} ${initialsFrames} frames showed initials while a photo was on its way`)
  if (sizeChanges) problems.push(`${at} an avatar changed size while its photo loaded`)
  fades.forEach((f, i) => {
    if (f.ms == null || f.ms < 100 || f.ms > 260) problems.push(`${at} avatar ${i} faded in over ${f.ms}ms, not about 150`)
    if (f.steps < 3) problems.push(`${at} avatar ${i} appeared in ${f.steps} steps: that is a pop, not a fade`)
    if (f.back) problems.push(`${at} avatar ${i} flickered`)
  })
  if (againFaded) problems.push(`${at} drawn again, the photo faded in again for ${againFaded} frames`)
  if (!brokenInitials) problems.push(`${at} a broken photo did not fall back to initials`)
  if (!noneInitials) problems.push(`${at} no photo did not show initials`)
}
await browser.close()
server.close()
console.log(JSON.stringify(report))
if (problems.length) fail(problems.join("\n"))
console.log("ok: a photo comes in on a quiet circle with no initials first, fades once, and is simply there after that")
