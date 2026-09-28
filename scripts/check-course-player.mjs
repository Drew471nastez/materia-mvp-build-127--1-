/**
 * ===========================================================================
 *  THE COURSE PLAYER AND THE COURSES LIST, MEASURED
 * ===========================================================================
 * The real components (scripts/render-course-player.tsx) in Chromium at
 * 390x844 and 1280x800, playing a real WebM served with Range support the
 * way storage serves a signed address:
 *
 *   LAYOUT    nothing scrolls sideways; the video is 16:9, edge to edge on a
 *             phone; the lessons sit beside it on a computer and in a sheet
 *             from "All lessons" on a phone,
 *             standing on the buyer's tab bar (--buyer-tabs-h)
 *   RESUME    the lesson opens at the second it was left (12s), and says so
 *   PLAY      it plays inline (playsinline), the played bar moves, the
 *             buffered bar is drawn
 *   CONTROLS  10s skip, the speed list (1.5x), captions on, the arrow key
 *   FINISH    past 90% the lesson is marked done without a press: the POST
 *             says complete, the check appears, the percentage moves
 *   NEXT      at the end the "Up next" card counts down and opens the next
 *             lesson
 *   RENEW     an address about to expire is renewed and swapped in while
 *             paused, at the same second
 *   LIST      rows for three courses from two creators, the filters narrow
 *             them, Continue says which lesson
 *
 *   PROBE_CSS=source node scripts/check-course-player.mjs
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
const css = await appCss(root)
const stubs = join(root, ".course-player-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-course-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

writeFileSync(join(stubs, "navigation.js"), `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: () => {}, back: () => log("back"), refresh: () => log("refresh") }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined, ...rest }) }
`)
const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-course-player.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": ".", "next/navigation": "./.course-player-probe/navigation.js", "next/link": "./.course-player-probe/link.jsx", "next/image": "./.course-player-probe/image.jsx" },
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  loader: { ".css": "empty" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(stubs, "app.js"), "utf8")

const args = ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"]
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args })

/* ─── A real video: 60 seconds of numbered frames, VP8 in WebM ─── */
async function makeVideo() {
  const page = await browser.newPage()
  await page.setViewport({ width: 640, height: 360 })
  const ff = spawn(FFMPEG, ["-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", "2", "-i", "pipe:0", "-c:v", "vp8", "-b:v", "300k", "-f", "webm", join(stubs, "video.webm")], { stdio: ["pipe", "ignore", "inherit"] })
  const done = new Promise((r) => ff.on("close", r))
  for (let i = 0; i < 120; i++) {
    const t = i / 2
    await page.setContent(`<body style="margin:0;width:640px;height:360px;display:flex;align-items:center;justify-content:center;background:hsl(${(i * 7) % 360},45%,32%);color:#fff;font:600 64px system-ui">0:${String(Math.floor(t)).padStart(2, "0")}</body>`)
    ff.stdin.write(await page.screenshot({ type: "jpeg", quality: 70 }))
  }
  ff.stdin.end()
  await done
  await page.close()
  return readFileSync(join(stubs, "video.webm"))
}
const video = await makeVideo()
console.log(`video: ${video.length} bytes`)
const vtt = "WEBVTT\n\n00:00:00.000 --> 00:01:00.000\nThe caption line\n"
const thumb = (hue) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="hsl(${hue},40%,55%)"/></svg>`)

/** The routes the player calls, answered in the page, and recorded. */
const fetchStub = (expiresIn) => `
window.__calls = []
const realFetch = window.fetch
let plays = 0
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url
  const body = init && init.body ? JSON.parse(init.body) : null
  window.__calls.push({ url, body })
  const json = (x, status = 200) => new Response(JSON.stringify(x), { status, headers: { "Content-Type": "application/json" } })
  if (/\\/api\\/courses\\/lessons\\/.+\\/play/.test(url)) { plays++; return json({ kind: "video", url: "/__video.webm?v=" + plays, expiresAt: Date.now() + ${expiresIn}, mime: "video/webm", captions: "/__captions.vtt", access: "owner" }) }
  if (url.includes("/api/courses/progress")) return json({ kept: true, completedAt: body && body.complete === true ? new Date().toISOString() : body && body.complete === false ? null : undefined })
  if (url.includes("/api/courses/reminders")) return json({ ok: true })
  return realFetch(input, init)
}
navigator.sendBeacon = (u, b) => { window.__calls.push({ url: u, beacon: true }); return true }
`

async function open(vp, mode, expiresIn = 3_600_000) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  /* Each run starts as a first visit: the player remembers speed and captions per browser. */
  await p.evaluateOnNewDocument(() => {
    try {
      localStorage.clear()
    } catch {}
  })
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style><script>window.__MODE=${JSON.stringify(mode)};document.documentElement.dataset.buyerTabs="shown";${fetchStub(expiresIn)}</script></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const u = new URL(r.url())
    if (u.pathname.startsWith("/__probe")) return r.respond({ status: 200, contentType: "text/html", body: html })
    if (u.pathname === "/__video.webm") {
      /* Storage answers a Range with 206 and the bytes asked for, as the player expects. */
      const range = /bytes=(\d+)-(\d*)/.exec(r.headers().range || "")
      if (!range) return r.respond({ status: 200, headers: { "Content-Type": "video/webm", "Accept-Ranges": "bytes", "Content-Length": String(video.length) }, body: video })
      const start = Number(range[1])
      const end = range[2] ? Math.min(Number(range[2]), video.length - 1) : video.length - 1
      return r.respond({ status: 206, headers: { "Content-Type": "video/webm", "Accept-Ranges": "bytes", "Content-Range": `bytes ${start}-${end}/${video.length}`, "Content-Length": String(end - start + 1) }, body: video.subarray(start, end + 1) })
    }
    if (u.pathname === "/__captions.vtt") return r.respond({ status: 200, contentType: "text/vtt", body: vtt })
    if (u.pathname.startsWith("/__img/")) return r.respond({ status: 200, contentType: "image/svg+xml", body: thumb(u.pathname.includes("b") ? 200 : 20) })
    return r.respond({ status: 404, body: "" })
  })
  await p.goto(`https://storelib.com/__probe?mode=${mode}`, { waitUntil: "domcontentloaded" })
  return { p, errors }
}

const noSideScroll = (p) => p.evaluate(() => ({ scroll: document.scrollingElement.scrollWidth, width: innerWidth }))
const calls = (p) => p.evaluate(() => window.__calls.filter((c) => c.url.includes("/progress")).map((c) => c.body || { beacon: true }))

for (const [label, vp] of [
  ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ["desktop-1280", { width: 1280, height: 800 }],
].filter(([l]) => !process.env.ONLY || l.startsWith(process.env.ONLY))) {
  const phone = label.startsWith("phone")
  console.log(`\n${label}: the player`)
  const { p, errors } = await open(vp, "player")
  await p.waitForSelector("[data-lesson-video] video", { timeout: 15000 })
  await p.waitForFunction(() => document.querySelector("video").readyState >= 1, { timeout: 15000 })
  await sleep(400)

  const layout = await p.evaluate(() => {
    const v = document.querySelector("[data-lesson-video]").getBoundingClientRect()
    const aside = document.querySelector("aside[aria-label=Lessons]")
    const a = aside.getBoundingClientRect()
    const el = document.querySelector("video")
    return {
      videoX: Math.round(v.left),
      videoW: Math.round(v.width),
      ratio: +(v.width / v.height).toFixed(3),
      asideShown: getComputedStyle(aside).display !== "none",
      asideX: Math.round(a.left),
      playsinline: el.playsInline && el.hasAttribute("webkit-playsinline"),
      nativeControls: el.controls,
      lessonsButton: !!document.querySelector("[data-open-lessons]") && getComputedStyle(document.querySelector("[data-open-lessons]")).display !== "none",
    }
  })
  const scroll = await noSideScroll(p)
  expect(scroll.scroll <= scroll.width, "LAYOUT: nothing scrolls sideways", scroll)
  expect(Math.abs(layout.ratio - 16 / 9) < 0.02, "LAYOUT: the video is 16:9", layout.ratio)
  expect(layout.playsinline && !layout.nativeControls, "PLAY: inline on iOS, Storelib's controls not the browser's", layout)
  if (phone) {
    expect(layout.videoX === 0 && layout.videoW === 390, "LAYOUT: edge to edge on a phone", layout)
    expect(!layout.asideShown && layout.lessonsButton, "LAYOUT: the lessons are behind a Lessons button", layout)
  } else {
    expect(layout.asideShown && layout.asideX > layout.videoX + layout.videoW, "LAYOUT: the lessons sit beside the video", layout)
    expect(!layout.lessonsButton, "LAYOUT: no Lessons button on a computer", layout)
  }

  const resumed = await p.evaluate(() => ({ t: document.querySelector("video").currentTime, chip: document.body.innerText.includes("Resuming at 0:12") }))
  expect(Math.abs(resumed.t - 12) < 1 && resumed.chip, "RESUME: opens at the second it was left, and says so", resumed)
  const opened = await calls(p)
  expect(opened.some((b) => b.opened === true), "RESUME: the server is told which lesson is open", opened.length)
  await p.screenshot({ path: join(shots, `${label}-player-paused.png`) })

  /* Play */
  if (phone) await p.tap("[data-lesson-video] button[aria-label=Play]")
  else await p.click("[data-lesson-video] button[aria-label=Play]")
  await sleep(1600)
  const playing = await p.evaluate(() => {
    const v = document.querySelector("video")
    return { paused: v.paused, t: +v.currentTime.toFixed(2), played: parseFloat(document.querySelector("[data-played]").style.width), buffered: parseFloat(document.querySelector("[data-buffered]").style.width) }
  })
  expect(!playing.paused && playing.t > 12.5, "PLAY: it plays from where it resumed", playing)
  expect(playing.played > 19 && playing.buffered >= playing.played, "PLAY: the played bar moves, the buffered bar is ahead of it", playing)

  /* Controls */
  const beforeSkip = await p.evaluate(() => document.querySelector("video").currentTime)
  await p.evaluate(() => document.querySelector("[data-lesson-video] button[aria-label='Forward 10 seconds']").click())
  await sleep(250)
  const afterSkip = await p.evaluate(() => document.querySelector("video").currentTime)
  expect(afterSkip - beforeSkip > 9 && afterSkip - beforeSkip < 12, "CONTROLS: forward 10 seconds", +(afterSkip - beforeSkip).toFixed(2))
  await p.evaluate(() => document.querySelector("[data-lesson-video] button[aria-haspopup=menu]").click())
  await sleep(100)
  await p.screenshot({ path: join(shots, `${label}-player-speed.png`) })
  await p.evaluate(() => [...document.querySelectorAll("[role=menuitemradio]")].find((b) => b.textContent.startsWith("1.5x")).click())
  const rate = await p.evaluate(() => document.querySelector("video").playbackRate)
  expect(rate === 1.5, "CONTROLS: the speed list sets 1.5x", rate)
  await p.evaluate(() => document.querySelector("[data-lesson-video] button[aria-label=Captions]").click())
  await sleep(200)
  const cc = await p.evaluate(() => document.querySelector("video").textTracks[0]?.mode)
  expect(cc === "showing", "CONTROLS: captions on", cc)
  const lift = await p.evaluate(() => {
    const t = document.querySelector("video").textTracks[0]
    return { cues: t.cues?.length ?? 0, line: t.cues?.[0]?.line, controls: document.querySelector("[data-lesson-video]").getAttribute("data-controls") }
  })
  expect(lift.cues > 0 && (lift.controls !== "shown" || lift.line === -4), "CONTROLS: a caption sits above the bar while it shows", lift)
  if (!phone) {
    const k0 = await p.evaluate(() => document.querySelector("video").currentTime)
    await p.keyboard.press("ArrowLeft")
    await sleep(200)
    const k1 = await p.evaluate(() => document.querySelector("video").currentTime)
    expect(k0 - k1 > 8, "CONTROLS: the left arrow goes back 10 seconds", +(k0 - k1).toFixed(2))
  }
  await p.screenshot({ path: join(shots, `${label}-player-playing.png`) })

  /* Past 90%: finished without a press */
  const doneBefore = await p.evaluate(() => document.querySelectorAll("[data-curriculum] [data-done]").length / (document.querySelectorAll("[data-curriculum]").length || 1))
  await p.evaluate(() => {
    const v = document.querySelector("video")
    v.currentTime = 55
  })
  await sleep(1500)
  const finished = await p.evaluate(() => ({
    done: document.querySelectorAll("[data-curriculum] [data-done]").length / (document.querySelectorAll("[data-curriculum]").length || 1),
    ring: document.querySelector("[data-progress-ring]")?.getAttribute("aria-label"),
    button: document.querySelector("[data-mark-complete]")?.textContent,
  }))
  const posted = await calls(p)
  expect(posted.some((b) => b.complete === true), "FINISH: past 90% the lesson is saved as complete", posted.filter((b) => "complete" in b))
  expect(finished.done === doneBefore + 1 && /Completed/.test(finished.button ?? ""), "FINISH: its check appears and the button says Completed", { doneBefore, ...finished })
  expect(finished.ring === "25% complete", "FINISH: 2 of 8 lessons is 25%", finished.ring)

  /* The end: the next lesson counts down and opens */
  await p.waitForSelector("[data-next-card]", { timeout: 12000 })
  await p.screenshot({ path: join(shots, `${label}-player-next.png`) })
  const card = await p.evaluate(() => document.querySelector("[data-next-card]").innerText)
  expect(/Up next/i.test(card) && card.includes("Lesson 3: Stretching paper"), "NEXT: the card names the next lesson", card.replace(/\s+/g, " "))
  await p.waitForFunction(() => document.querySelector("[aria-current=true][data-lesson-row]")?.innerText.includes("Stretching"), { timeout: 9000 }).then(
    () => expect(true, "NEXT: after the countdown the next lesson opens"),
    () => expect(false, "NEXT: after the countdown the next lesson opens"),
  )
  const url = await p.evaluate(() => location.search)
  expect(url.includes("lesson=00000000-0000-4000-8000-000000000003"), "NEXT: the address follows the lesson", url)

  if (phone) {
    /* The sheet, filmed: where its top is on each frame as it rises. */
    await p.evaluate(() => window.scrollTo(0, 0))
    await p.tap("[data-open-lessons]")
    const tops = await p.evaluate(
      () =>
        new Promise((resolve) => {
          const out = []
          const t0 = performance.now()
          const tick = () => {
            const sheet = document.querySelector("[data-lesson-sheet] > div:last-child")
            if (sheet) out.push(Math.round(sheet.getBoundingClientRect().top))
            if (performance.now() - t0 < 450) requestAnimationFrame(tick)
            else resolve(out)
          }
          requestAnimationFrame(tick)
        }),
    )
    const rising = tops.length > 5 && tops[0] > tops[tops.length - 1] && tops.every((t, i) => i === 0 || t <= tops[i - 1] + 1)
    expect(rising, "SHEET: slides up frame by frame, never back", tops.slice(0, 12))
    const sheet = await p.evaluate(() => {
      const s = document.querySelector("[data-lesson-sheet] > div:last-child").getBoundingClientRect()
      return { bottom: Math.round(s.bottom), height: Math.round(s.height), rows: document.querySelectorAll("[data-lesson-sheet] [data-lesson-row]").length }
    })
    /* The buyer's tab bar is 56px on a phone (--buyer-tabs-h): the sheet stands on it. */
    expect(sheet.bottom === 844 - 56 && sheet.height <= 844 * 0.83 && sheet.rows === 8, "SHEET: stands on the tab bar, under 83% tall, every lesson in it", sheet)
    await p.screenshot({ path: join(shots, `${label}-player-sheet.png`) })
    await p.tap("[data-lesson-sheet] button[aria-label=Close]")
    await sleep(450)
    const gone = await p.evaluate(() => !document.querySelector("[data-lesson-sheet]"))
    expect(gone, "SHEET: closes")
  }

  /* The whole page, for the eye */
  await p.evaluate(() => document.querySelector("video")?.pause())
  await p.screenshot({ path: join(shots, `${label}-player-full.png`), fullPage: true })
  expect(errors.length === 0, "no errors on the page", errors)
  await p.close()

  /* RENEW: an address five minutes and two seconds from its end is renewed in two seconds */
  console.log(`\n${label}: renewing the address`)
  const renew = await open(vp, "player", 5 * 60 * 1000 + 2000)
  await renew.p.waitForFunction(() => document.querySelector("video")?.readyState >= 1, { timeout: 15000 })
  await renew.p.evaluate(() => {
    const v = document.querySelector("video")
    v.currentTime = 30
  })
  await sleep(3500)
  const swapped = await renew.p.evaluate(() => ({ src: document.querySelector("video").currentSrc.split("/").pop(), t: +document.querySelector("video").currentTime.toFixed(1), asked: window.__calls.filter((c) => c.url.includes("/play")).length }))
  expect(swapped.asked >= 2 && swapped.src.includes("v=2") && Math.abs(swapped.t - 30) < 1.5, "RENEW: a fresh address, swapped in while paused, at the same second", swapped)
  await renew.p.close()

  console.log(`\n${label}: the courses list`)
  const list = await open(vp, "index")
  await list.p.waitForSelector("[data-course-list]")
  const rows = await list.p.evaluate(() => [...document.querySelectorAll("[data-course-row]")].map((r) => r.getAttribute("data-course-row")))
  expect(rows.length === 3, "LIST: three courses from two creators", rows)
  const ls = await noSideScroll(list.p)
  expect(ls.scroll <= ls.width, "LIST: nothing scrolls sideways", ls)
  const cont = await list.p.evaluate((phoneMode) => {
    const a = document.querySelector(phoneMode ? "[data-continue-phone]" : "[data-continue]")
    return { text: a.innerText.trim(), href: a.getAttribute("href"), h: Math.round(a.getBoundingClientRect().height) }
  }, phone)
  expect(cont.href.includes("?lesson=") && (phone ? cont.text === "Continue: Lesson 4" : cont.text === "Continue") && cont.h >= 40, "LIST: Continue opens the lesson they are on", cont)
  await list.p.screenshot({ path: join(shots, `${label}-courses.png`), fullPage: true })
  await list.p.evaluate(() => [...document.querySelectorAll("[role=tab]")].find((b) => b.textContent.startsWith("Completed")).click())
  const completed = await list.p.evaluate(() => document.querySelectorAll("[data-course-row]").length)
  expect(completed === 1, "LIST: Completed shows the finished one", completed)
  await list.p.evaluate(() => [...document.querySelectorAll("[role=tab]")].find((b) => b.textContent.startsWith("All")).click())
  await list.p.select("[data-creator-filter]", "c2")
  const byCreator = await list.p.evaluate(() => document.querySelectorAll("[data-course-row]").length)
  expect(byCreator === 2, "LIST: one creator's courses", byCreator)
  expect(list.errors.length === 0, "no errors on the page", list.errors)
  await list.p.close()
}

await browser.close()
console.log(`\nscreenshots: ${shots}`)
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nall checks passed")
