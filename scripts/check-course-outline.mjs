/**
 * ===========================================================================
 *  A COURSE'S CURRICULUM ON ITS PRODUCT PAGE, MEASURED
 * ===========================================================================
 * components/courses/course-outline.tsx (drawn by
 * scripts/render-course-outline.tsx) at 390x844 and 1280x800, with the
 * lesson route answered in the page:
 *
 *   COUNTS    the whole course (modules, lessons, total length) and each
 *             module's lessons and length
 *   PREVIEW   only a free preview lesson is a button; it opens the buyers'
 *             player in a dialog, asks /api/courses/lessons/<id>/play, and
 *             the video plays
 *   GONE      a lesson that is no longer a preview says so in the dialog
 *   FIT       nothing scrolls sideways; a preview row is at least 40px
 *
 *   PROBE_CSS=source node scripts/check-course-outline.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { spawn } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const FFMPEG = process.env.FFMPEG_PATH || "/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux"
const css = await appCss(root)
const inter = interFaces(root)
const stubs = join(root, ".course-outline-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-course-outline-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-course-outline.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": "." },
  banner: { js: "var process={env:{NODE_ENV:'production'}};" },
  loader: { ".css": "empty" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(stubs, "app.js"), "utf8")

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] })

/* A real video: ten seconds of frames, VP8 in WebM (the course player probe's way). */
async function makeVideo() {
  const kept = join(root, ".course-player-probe/video.webm")
  if (existsSync(kept)) return readFileSync(kept)
  const page = await browser.newPage()
  await page.setViewport({ width: 640, height: 360 })
  const ff = spawn(FFMPEG, ["-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", "2", "-i", "pipe:0", "-c:v", "vp8", "-b:v", "300k", "-f", "webm", join(stubs, "video.webm")], { stdio: ["pipe", "ignore", "inherit"] })
  const done = new Promise((r) => ff.on("close", r))
  for (let i = 0; i < 20; i++) {
    await page.setContent(`<body style="margin:0;width:640px;height:360px;display:flex;align-items:center;justify-content:center;background:hsl(${i * 17},45%,32%);color:#fff;font:600 64px system-ui">${i}</body>`)
    ff.stdin.write(await page.screenshot({ type: "jpeg", quality: 70 }))
  }
  ff.stdin.end()
  await done
  await page.close()
  return readFileSync(join(stubs, "video.webm"))
}
const video = await makeVideo()

const server = `
window.__plays = []
const realFetch = window.fetch
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url
  const m = /\\/api\\/courses\\/lessons\\/([^/]+)\\/play/.exec(url)
  if (!m) return realFetch(input, init)
  window.__plays.push(m[1])
  const json = (x, status) => new Response(JSON.stringify(x), { status, headers: { "Content-Type": "application/json" } })
  if (m[1].endsWith("4")) return json({ error: "Lesson not found" }, 404)
  return json({ kind: "video", url: "/__video.webm", expiresAt: Date.now() + 3600000, mime: "video/webm", captions: null, access: "preview" }, 200)
}
`
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style><script>${server}</script></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

for (const [label, vp] of [
  ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ["desktop-1280", { width: 1280, height: 800 }],
]) {
  console.log(`\n${label}`)
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const u = new URL(r.url())
    if (u.pathname === "/__probe") return r.respond({ status: 200, contentType: "text/html", body: html })
    if (u.pathname === "/__video.webm") {
      const range = r.headers()["range"]
      if (!range) return r.respond({ status: 200, headers: { "Content-Type": "video/webm", "Accept-Ranges": "bytes", "Content-Length": String(video.length) }, body: video })
      const [, a, b] = /bytes=(\d+)-(\d*)/.exec(range)
      const start = Number(a)
      const end = b ? Math.min(Number(b), video.length - 1) : video.length - 1
      return r.respond({ status: 206, headers: { "Content-Type": "video/webm", "Accept-Ranges": "bytes", "Content-Range": `bytes ${start}-${end}/${video.length}`, "Content-Length": String(end - start + 1) }, body: video.subarray(start, end + 1) })
    }
    return r.respond({ status: 404, body: "" })
  })
  await p.goto("https://storelib.com/__probe", { waitUntil: "domcontentloaded" })
  await p.waitForSelector("[data-course-outline]")

  const counts = await p.evaluate(() => ({
    total: document.querySelector("[data-outline-total]").textContent,
    modules: [...document.querySelectorAll("[data-outline-module]")].map((m) => m.querySelector("span.shrink-0").textContent),
    buttons: [...document.querySelectorAll("[data-course-outline] button")].map((b) => b.getAttribute("data-preview-lesson")),
    rowHeights: [...document.querySelectorAll("[data-preview-lesson]")].map((b) => Math.round(b.getBoundingClientRect().height)),
    scroll: document.scrollingElement.scrollWidth,
  }))
  expect(counts.total === "2 modules · 5 lessons · 1 h 52 min", "COUNTS: the whole course", counts.total)
  expect(counts.modules.join(" | ") === "3 lessons · 19 min | 2 lessons · 1 h 33 min", "COUNTS: each module", counts.modules)
  expect(counts.buttons.length === 2 && counts.buttons.every((id) => id.endsWith("1") || id.endsWith("4")), "PREVIEW: only the free previews are buttons", counts.buttons)
  expect(counts.rowHeights.every((h) => h >= 40) && counts.scroll <= vp.width, "FIT: preview rows at least 40px, nothing scrolls sideways", { rows: counts.rowHeights, scroll: counts.scroll })
  await p.screenshot({ path: join(shots, `${label}-outline.png`), fullPage: true })

  await p.click('[data-preview-lesson$="1"]')
  await p.waitForSelector("[role=dialog] video", { timeout: 5000 }).catch(() => {})
  await sleep(1800)
  const playing = await p.evaluate(() => {
    const v = document.querySelector("[role=dialog] video")
    return v ? { src: v.currentSrc.replace(location.origin, ""), time: +v.currentTime.toFixed(2), paused: v.paused, plays: window.__plays } : { plays: window.__plays }
  })
  expect(playing.src === "/__video.webm" && playing.time > 0.3 && playing.plays[0]?.endsWith("1"), "PREVIEW: the dialog asks the lesson route, and the video plays", playing)
  const box = await p.evaluate(() => {
    const d = document.querySelector("[role=dialog]").getBoundingClientRect()
    return { left: Math.round(d.left), width: Math.round(d.width), top: Math.round(d.top), bottom: Math.round(d.bottom) }
  })
  expect(box.left >= 0 && box.left + box.width <= vp.width && box.top >= 0 && box.bottom <= vp.height, "PREVIEW: the dialog fits the window", box)
  await p.screenshot({ path: join(shots, `${label}-preview.png`) })
  await p.keyboard.press("Escape")
  await sleep(400)
  const closed = await p.evaluate(() => !document.querySelector("[role=dialog]"))
  expect(closed, "PREVIEW: Escape closes it")

  await p.click('[data-preview-lesson$="4"]')
  await sleep(600)
  const gone = await p.evaluate(() => document.querySelector("[role=dialog]")?.innerText || "")
  expect(/not available any more/.test(gone), "GONE: a lesson that is no longer a preview says so", gone.replace(/\s+/g, " "))
  expect(errors.length === 0, "no errors on the page", errors)
  await p.close()
}

await browser.close()
if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
console.log(`\nscreenshots: ${shots}`)
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nall checks passed")
