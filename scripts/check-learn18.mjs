/**
 * ===========================================================================
 *  A PROGRAM'S LESSON INSIDE A COMMUNITY, MEASURED (round 18, L18)
 * ===========================================================================
 * The real ProgramPlayer (scripts/render-learn18.tsx) in Chromium at 390x844
 * and 1440x900, with the CPU slowed four times, the play route answering
 * after PLAY_MS and a real WebM served with Range support:
 *
 *   COVER     no frame, from the first one on, shows the program's cover
 *             where the lesson's media goes: not while the lesson's media is
 *             asked for, not as the video's poster
 *   STILL     while it is asked for, the media's own box is there already, at
 *             the size the media will have, so nothing below it moves when
 *             it arrives; a lesson that is text only never draws a box
 *   SWITCH    Next, Previous and a row of the list change the lesson in place
 *             (no page load, the address follows with replaceState); the
 *             media box keeps its height from video to video, no frame has
 *             the lesson faded out
 *   LAYOUT    nothing scrolls sideways; on a phone every button is 40px or
 *             taller
 *
 * Every step's frames are saved as a contact sheet (SHOTS_DIR) to LOOK at.
 *
 *   PROBE_CSS=source node scripts/check-learn18.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { spawn } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const FFMPEG = process.env.FFMPEG_PATH || "/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux"
const PLAY_MS = Number(process.env.PLAY_MS || 600)
const css = await appCss(root)
const work = mkdtempSync(join(tmpdir(), "storelib-learn18-"))
const shots = process.env.SHOTS_DIR || join(work, "shots")
mkdirSync(shots, { recursive: true })
const tag = process.env.TAG || "after"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

writeFileSync(join(work, "navigation.js"), `export const usePathname = () => location.pathname
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
/* A link that never leaves: what was pressed is logged, so the probe knows a press went nowhere it should not. */
writeFileSync(join(work, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__links ||= []).push(href) } } }, children) })
`)
writeFileSync(join(work, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, quality, ...rest }) { return React.createElement("img", { src, alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" } : undefined, ...rest }) }
`)

const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-learn18.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": ".", "next/navigation": join(work, "navigation.js"), "next/link": join(work, "link.jsx"), "next/image": join(work, "image.jsx") },
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  loader: { ".css": "empty" },
  outfile: join(work, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(work, "app.js"), "utf8")

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--hide-scrollbars"] })

/* A real video: 20 seconds of numbered frames, VP8 in WebM, 16:9. */
async function makeVideo() {
  const page = await browser.newPage()
  await page.setViewport({ width: 640, height: 360 })
  const ff = spawn(FFMPEG, ["-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", "2", "-i", "pipe:0", "-c:v", "vp8", "-b:v", "300k", "-f", "webm", join(work, "video.webm")], { stdio: ["pipe", "ignore", "inherit"] })
  const done = new Promise((r) => ff.on("close", r))
  for (let i = 0; i < 40; i++) {
    await page.setContent(`<body style="margin:0;width:640px;height:360px;display:flex;align-items:center;justify-content:center;background:#2d4a3e;color:#fff;font:600 54px system-ui">Lesson video ${Math.floor(i / 2)}s</body>`)
    ff.stdin.write(await page.screenshot({ type: "jpeg", quality: 70 }))
  }
  ff.stdin.end()
  await done
  await page.close()
  return readFileSync(join(work, "video.webm"))
}
const video = await makeVideo()
/* The program's cover, loud on purpose: any frame that shows it is plain to see. */
const COVER = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#ff6a00"/><text x="40" y="200" font-family="Arial" font-size="56" font-weight="700" fill="#fff">PROGRAM COVER</text></svg>`
const EMBED = `<!doctype html><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#202020;color:#fff;font:600 28px system-ui">YouTube embed</body>`

const KIND = { 1: "video", 2: "video", 3: "external", 4: "text", 5: "video", 6: "video", 7: "video" }
const fetchStub = `
window.__calls = []
const realFetch = window.fetch
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url
  window.__calls.push(url)
  const json = (x, status = 200) => new Response(JSON.stringify(x), { status, headers: { "Content-Type": "application/json" } })
  const m = /\\/api\\/courses\\/lessons\\/([^/]+)\\/play/.exec(url)
  if (m) {
    await new Promise((r) => setTimeout(r, ${PLAY_MS}))
    const n = Number(m[1].slice(-2))
    const kind = ${JSON.stringify(KIND)}[n]
    if (kind === "video") return json({ kind, url: "/__video.webm?l=" + n, expiresAt: Date.now() + 3600000, mime: "video/webm", captions: null, access: "owner" })
    if (kind === "external") return json({ kind, provider: "youtube", embedUrl: "/__embed?l=" + n, access: "owner" })
    return json({ kind: "text", access: "owner" })
  }
  if (url.includes("/api/courses/progress")) return json({ kept: true })
  return realFetch(input, init)
}
navigator.sendBeacon = () => true
`

/*
  WHAT EACH FRAME SHOWS, sampled on every animation frame: the cover anywhere in the lesson's column (an <img> of it, or a
  video whose poster is it and that has no frame of its own yet), the media box's height and top, the lesson column's
  opacity, and the lesson's title.
*/
const SAMPLER = `
window.__frames = []
const coverShown = () => {
  const col = document.querySelector("[data-course-player]")
  if (!col) return false
  for (const img of col.querySelectorAll("img")) {
    if (!/cover\\.svg/.test(img.currentSrc || img.src)) continue
    const r = img.getBoundingClientRect()
    let o = 1, el = img
    while (el && el !== document.body) { o *= Number(getComputedStyle(el).opacity); el = el.parentElement }
    if (r.width > 0 && r.height > 0 && o > 0.05 && img.closest("aside") === null && !img.closest("[data-lesson-sheet]")) return true
  }
  for (const v of col.querySelectorAll("video")) if (/cover\\.svg/.test(v.poster || "") && v.readyState < 2) return true
  return false
}
const stage = () => document.querySelector("[data-lesson-stage]") || document.querySelector("[data-course-player] [data-stage-loading], [data-course-player] .aspect-video")
const sample = () => {
  const s = stage()
  const r = s ? s.getBoundingClientRect() : null
  const col = document.querySelector("[data-lesson-column]") || (s && s.parentElement)
  let o = 1, el = s
  while (el && el !== document.body) { o *= Number(getComputedStyle(el).opacity); el = el.parentElement }
  const title = document.querySelector("[data-lesson-title]") || document.querySelector("[data-course-player] h2")
  window.__frames.push({ t: Math.round(performance.now()), cover: coverShown(), h: r ? Math.round(r.height) : 0, top: r ? Math.round(r.top + scrollY) : null, o: Math.round(o * 100) / 100, title: title ? title.textContent : null, text: !!document.querySelector("[data-lesson-text]") })
  requestAnimationFrame(sample)
}
requestAnimationFrame(sample)
`

async function sheet(frames, file, vp) {
  if (!frames.length) return
  const w = vp.width > 800 ? 360 : 180
  const p = await browser.newPage()
  const cells = frames.map((f) => `<figure><img src="data:image/png;base64,${f.data}"><figcaption>${f.label}</figcaption></figure>`).join("")
  await p.setViewport({ width: Math.min(8, frames.length) * (w + 8) + 8, height: 400 })
  await p.setContent(`<style>body{margin:4px;background:#ddd;font:11px system-ui;display:flex;flex-wrap:wrap;gap:8px}figure{margin:0;width:${w}px}img{width:${w}px;display:block;border:1px solid #999}</style>${cells}`)
  await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))))
  await p.screenshot({ path: file, fullPage: true })
  await p.close()
}

/** Records what the screen painted while `act` runs, at 4x CPU, and keeps up to `keep` frames spread over the time. */
async function film(page, name, vp, act, ms = 1400, keep = 16) {
  const cdp = await page.createCDPSession()
  const frames = []
  cdp.on("Page.screencastFrame", (f) => {
    frames.push({ at: f.metadata.timestamp * 1000, data: f.data })
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1, maxWidth: vp.width, maxHeight: vp.height })
  await sleep(150)
  const t0 = Date.now()
  await act()
  await sleep(ms)
  await cdp.send("Page.stopScreencast")
  const after = frames.filter((f) => f.at >= t0 - 60).sort((a, b) => a.at - b.at)
  const step = Math.max(1, Math.ceil(after.length / keep))
  const picked = after.filter((_, i) => i % step === 0).map((f) => ({ ...f, label: `+${Math.round(f.at - t0)}ms` }))
  await sheet(picked, join(shots, `${tag}-${name}.png`), vp)
  return after.length
}

async function open(vp, throttle) {
  const page = await browser.newPage()
  await page.setViewport(vp)
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 200)))
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.clear()
    } catch {}
  })
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style><script>${fetchStub}${SAMPLER}</script></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const u = new URL(r.url())
    if (u.pathname.startsWith("/community/")) return r.respond({ status: 200, contentType: "text/html", body: html })
    if (u.pathname === "/__img/cover.svg") return r.respond({ status: 200, contentType: "image/svg+xml", body: COVER })
    if (u.pathname === "/__embed") return r.respond({ status: 200, contentType: "text/html", body: EMBED })
    if (u.pathname === "/__video.webm") {
      const range = r.headers().range
      if (range) {
        const [a, b] = range.replace("bytes=", "").split("-")
        const start = Number(a)
        const end = b ? Math.min(Number(b), video.length - 1) : video.length - 1
        return r.respond({ status: 206, headers: { "Content-Range": `bytes ${start}-${end}/${video.length}`, "Accept-Ranges": "bytes", "Content-Type": "video/webm" }, body: video.subarray(start, end + 1) })
      }
      return r.respond({ status: 200, headers: { "Accept-Ranges": "bytes", "Content-Type": "video/webm" }, body: video })
    }
    if (u.protocol === "data:") return r.continue()
    return r.abort()
  })
  const cdp = await page.createCDPSession()
  if (throttle) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  return { page, errors, cdp }
}

const frames = (page) => page.evaluate(() => window.__frames.splice(0))

const VIEWPORTS = [
  ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, true],
  ["desktop-1440", { width: 1440, height: 900 }, false],
]

for (const [label, vp, phone] of VIEWPORTS) {
  console.log(`\n${label}`)
  const { page, errors } = await open(vp, true)

  /* ── The first load: the lesson asked for, its media on its way ── */
  await film(page, `${label}-1-load`, vp, () => page.goto("https://storelib.com/community/salajanywood/learn/prog-1?lesson=lesson-1", { waitUntil: "domcontentloaded" }), 2200)
  await page.waitForSelector("[data-course-player]")
  await sleep(600)
  let f = await frames(page)
  const drawn = f.filter((x) => x.h > 0)
  expect(f.every((x) => !x.cover), `${label} load: no frame shows the program's cover where the lesson goes`, f.filter((x) => x.cover).length)
  const settledH = drawn.length ? drawn[drawn.length - 1].h : 0
  const firstH = drawn.length ? drawn[0].h : 0
  expect(Math.abs(firstH - settledH) <= 1, `${label} load: the media's box has its size from its first frame`, { first: firstH, settled: settledH })
  const stageW = await page.evaluate(() => (document.querySelector("[data-lesson-stage]") || document.querySelector("[data-course-player] .aspect-video"))?.getBoundingClientRect().width ?? 0)
  expect(settledH > 0 && Math.abs((stageW * 9) / 16 - settledH) <= 2, `${label} load: the media box is 16:9`, { w: stageW, h: settledH })

  /* ── The page as it reads, at rest ── */
  await page.evaluate(() => document.querySelector("video")?.pause())
  const m = await page.evaluate(() => {
    const over = document.documentElement.scrollWidth - innerWidth
    const small = []
    for (const el of document.querySelectorAll("[data-course-player] a, [data-course-player] button")) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0 || el.closest("[data-lesson-sheet]") || el.closest(".group\\/player") || el.closest("[data-lesson-text]")) continue
      if (r.height < 40) small.push(`${(el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 24)} ${Math.round(r.height)}`)
    }
    return { over, small, url: location.pathname + location.search }
  })
  expect(m.over <= 0, `${label}: nothing scrolls sideways`, m.over)
  if (phone) expect(m.small.length === 0, `${label}: every button and link is 40px or taller`, m.small)
  await page.screenshot({ path: join(shots, `${tag}-${label}-2-rest.png`) })
  await page.screenshot({ path: join(shots, `${tag}-${label}-3-full.png`), fullPage: true })

  /* ── Next: one video lesson to the next, in place ── */
  const loads = await page.evaluate(() => performance.getEntriesByType("navigation").length)
  const nextBtn = await page.$("[aria-label='Next lesson']")
  await nextBtn.evaluate((b) => b.scrollIntoView({ block: "center" }))
  await sleep(200)
  await frames(page)
  await film(page, `${label}-4-next`, vp, () => nextBtn.click(), 1600)
  f = await frames(page)
  const hs = [...new Set(f.filter((x) => x.h > 0).map((x) => x.h))]
  expect(f.every((x) => !x.cover), `${label} next: no frame shows the program's cover`, f.filter((x) => x.cover).length)
  expect(hs.length === 1, `${label} next: the media box keeps its height through the change`, hs)
  expect(f.every((x) => x.o >= 0.99), `${label} next: the lesson is never faded out`, Math.min(...f.map((x) => x.o)))
  const after = await page.evaluate(() => ({ url: location.pathname + location.search, navs: performance.getEntriesByType("navigation").length, title: (document.querySelector("[data-lesson-title]") || document.querySelector("[data-course-player] h2"))?.textContent }))
  expect(after.title === "Centering, slowly" && after.navs === loads, `${label} next: the next lesson, with no page load`, after)
  expect(/\?lesson=centering-slowly$/.test(after.url), `${label} next: the address follows`, after.url)

  /* ── To the reading lesson, from the list: text only, no media box at all ── */
  const pickText = async () => {
    if (phone && (await page.$("[data-lessons-inline]"))) {
      const row = await page.$("[data-lessons-inline] [data-lesson-row$='04']")
      await row.evaluate((b) => b.scrollIntoView({ block: "center" }))
      await sleep(250)
      await row.click()
    } else if (phone) {
      await page.click("[data-open-lessons]")
      await sleep(700)
      await page.click("[data-lesson-sheet] [data-lesson-row$='04']")
    } else await page.click("aside [data-lesson-row$='04']")
  }
  await frames(page)
  await film(page, `${label}-5-text`, vp, pickText, 1400)
  f = await frames(page)
  const tail = f.slice(-5)
  expect(tail.every((x) => x.h === 0), `${label} text: a lesson that is words only has no media box`, tail.map((x) => x.h))
  const boxAfterPick = f.filter((x) => x.title === "A reading list" && x.h > 0).length
  expect(boxAfterPick === 0, `${label} text: no frame of it draws an empty media box first`, boxAfterPick)

  /* ── Previous: back to the embed ── */
  await page.evaluate(() => scrollTo(0, 0))
  await frames(page)
  await film(page, `${label}-6-prev`, vp, () => page.click("[aria-label='Previous lesson']"), 1400)
  f = await frames(page)
  expect(f.every((x) => !x.cover), `${label} previous: no frame shows the program's cover`, f.filter((x) => x.cover).length)
  const embedH = f.filter((x) => x.title === "Opening the form" && x.h > 0).map((x) => x.h)
  expect(new Set(embedH).size <= 1, `${label} previous: the embed's box is one size from its first frame`, [...new Set(embedH)])

  expect(errors.length === 0, `${label}: no page errors`, errors)
  await page.close()
}

await browser.close()
console.log(`\nshots: ${shots}`)
if (broken) {
  console.log(`${broken} check(s) failed`)
  process.exit(1)
}
console.log("all checks passed")
