/**
 * ===========================================================================
 *  ROUND 13'S VIDEO AND ATTACHMENTS, MEASURED
 * ===========================================================================
 * The real components (scripts/render-community-video.tsx) at 1440x900 and on
 * a 390x844 phone, each photographed:
 *
 *   UPLOAD     a video from the device through a STUBBED video service:
 *              prepare, the PUT with progress, complete answers processing,
 *              the status route answers processing twice then ready. Post
 *              waits the whole time (the tile shows its percent, then
 *              Processing) and is ready once the video plays.
 *   FAIL       the service answers failed with a reason: the tile turns red,
 *              the reason is said under the row, Post keeps waiting; taking
 *              it off lets the post go.
 *   TRAY       drag at 4x CPU with a mouse (1440) and a finger (390, after a
 *              hold): the lifted tile follows every frame, a neighbour slides,
 *              the order is kept on release, nothing is left transformed;
 *              a quick swipe does not lift; remove and Add.
 *   PLAYER     a post's video: the poster, the preview loop (it starts, plays
 *              and goes back to the start before PREVIEW_SECONDS), then the
 *              player: play, the time moves, scrub to the middle, mute, keys,
 *              controls fade while playing; every control >= 40px on a phone.
 *   PORTRAIT   a phone video keeps a 4:5 box.
 *   COVER      the About gallery led by an uploaded cover video: the loop
 *              plays while on screen, a press plays it in the community player.
 *
 * and everywhere: nothing scrolls sideways, no page error.
 *
 *   PROBE_CSS=source node scripts/check-community-video.mjs
 *   Pictures go to SHOTS_DIR (a temp folder by default).
 */
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const FFMPEG = process.env.FFMPEG_PATH || "/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux"
const css = await appCss(root)
/* The About gallery is the product gallery's Swiper: its own stylesheet, as the app loads it. */
const swiperCss = readFileSync(join(realpathSync(join(root, "node_modules/swiper")), "swiper.css"), "utf8")
const fonts = interFaces(root)
const stubs = join(root, ".community-video-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-community-video-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const want = (name) => !process.env.SECTION || process.env.SECTION.split(",").includes(name)
const ORIGIN = "https://storelib.com"
const CID = "6f1c2a1e-0000-4000-8000-000000000001"
const VID = "33333333-0000-4000-8000-000000000001"
const NEW_VID = "44444444-0000-4000-8000-000000000001"
const svg = (a, b, w = 400, h = 300) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${a}"/><circle cx="${w / 2}" cy="${h / 2}" r="${h / 4}" fill="${b}"/></svg>`

writeFileSync(join(stubs, "navigation.js"), `const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, priority, sizes, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src?.src, alt, ...rest }) }
`)
writeFileSync(join(stubs, "supabase-client.js"), `export const isNativePlatform = () => false
export function createClient() {
  const ch = { on() { return ch }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 20); return ch }, send() { return Promise.resolve("ok") }, unsubscribe() {} }
  return {
    realtime: { setAuth: async () => {} },
    channel() { return ch },
    removeChannel() {},
    storage: { from() { return { upload: async () => ({ error: null }), getPublicUrl: (p) => ({ data: { publicUrl: "https://placeholder.supabase.co/storage/v1/object/public/" + p } }) } } },
    auth: { getSession: async () => ({ data: { session: null } }) },
  }
}
`)

/* ── A real WebM clip: frames drawn in Chromium, encoded by Playwright's own ffmpeg ── */
async function makeClip(browser, w, h, seconds = 8, fps = 15) {
  const page = await browser.newPage()
  const frames = await page.evaluate(
    async (w, h, n) => {
      const c = document.createElement("canvas")
      c.width = w
      c.height = h
      const x = c.getContext("2d")
      const out = []
      for (let i = 0; i < n; i++) {
        const t = i / n
        const g = x.createLinearGradient(0, 0, w, h)
        g.addColorStop(0, `hsl(${210 + t * 40}, 35%, ${22 + t * 10}%)`)
        g.addColorStop(1, `hsl(${190 + t * 40}, 30%, ${40 + t * 8}%)`)
        x.fillStyle = g
        x.fillRect(0, 0, w, h)
        x.fillStyle = "rgba(255,255,255,0.85)"
        x.beginPath()
        x.arc(w * (0.15 + 0.7 * t), h * 0.5, Math.min(w, h) * 0.12, 0, Math.PI * 2)
        x.fill()
        x.font = `600 ${Math.round(h / 9)}px sans-serif`
        x.fillText(`${(i / 15).toFixed(1)}s`, w * 0.06, h * 0.9)
        out.push(c.toDataURL("image/jpeg", 0.8).split(",")[1])
      }
      return out
    },
    w,
    h,
    seconds * fps,
  )
  await page.close()
  const input = Buffer.concat(frames.map((f) => Buffer.from(f, "base64")))
  const file = join(stubs, `clip-${w}x${h}.webm`)
  /* This ffmpeg reads files, not pipes: the frames go in as one MJPEG stream on disk. */
  const frameFile = join(stubs, `frames-${w}x${h}.mjpeg`)
  writeFileSync(frameFile, input)
  const r = spawnSync(FFMPEG, ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", frameFile, "-c:v", "libvpx", "-b:v", "600k", "-g", String(fps), file])
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`)
  return file
}

const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-community-video.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": ".", "next/navigation": "./.community-video-probe/navigation.js", "next/link": "./.community-video-probe/link.jsx", "next/image": "./.community-video-probe/image.jsx" },
  plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  loader: { ".css": "empty" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(stubs, "app.js"), "utf8")
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style><style>${swiperCss}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars", "--autoplay-policy=no-user-gesture-required"] })
const clip = readFileSync(await makeClip(browser, 640, 360))
const clipPath = join(stubs, "clip-640x360.webm")

const VIEWPORTS = [
  ["desktop-1440", { width: 1440, height: 900, deviceScaleFactor: 1 }],
  ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
]

async function open(name, query, vp, opts = {}) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  const calls = []
  let statusAsks = 0
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
  if (process.env.DEBUG) p.on("console", (m) => console.log("    [page]", m.text()))
  if (opts.reduced) await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const url = r.url()
    const method = r.method()
    const reply = (body, status = 200, wait = 0) => setTimeout(() => r.respond({ status, contentType: "application/json", body: JSON.stringify(body) }), wait)
    if (url.startsWith(`${ORIGIN}/media/clip.webm`)) {
      calls.push({ url: url.replace(ORIGIN, ""), method, media: true })
      const range = /bytes=(\d+)-(\d*)/.exec(r.headers().range || "")
      if (!range) return r.respond({ status: 200, contentType: "video/webm", headers: { "accept-ranges": "bytes" }, body: clip })
      const start = Number(range[1])
      const end = range[2] ? Math.min(Number(range[2]), clip.length - 1) : clip.length - 1
      return r.respond({ status: 206, contentType: "video/webm", headers: { "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${clip.length}` }, body: clip.subarray(start, end + 1) })
    }
    if (url.startsWith(`${ORIGIN}/upload/`)) {
      calls.push({ url: url.replace(ORIGIN, ""), method })
      return reply({}, 200, opts.putWait ?? 900)
    }
    if (url.startsWith(`${ORIGIN}/_next/image`) || /supabase\.co\//.test(url)) {
      calls.push({ url: url.replace(ORIGIN, ""), method, picture: true })
      if (method !== "GET") return reply({})
      return r.respond({ status: 200, contentType: "image/svg+xml", body: svg("#dfe5ec", "#8796ab", 1200, 800) })
    }
    if (url.startsWith(`${ORIGIN}/api/`)) {
      const short = url.replace(ORIGIN, "")
      const body = r.postData() || null
      calls.push({ url: short, method, body })
      const sent = body ? JSON.parse(body) : {}
      if (short.startsWith(`/api/community/${CID}/videos/${VID}/play`)) return reply({ url: `${ORIGIN}/media/clip.webm?token=t`, expiresAt: Date.now() + 3_600_000, mime: "video/webm", captions: null, poster: null, durationSeconds: 8 }, 200, 120)
      const view = (status, error = null) => ({ id: NEW_VID, provider: "mux", status, durationSeconds: 8, width: 640, height: 360, sizeBytes: clip.length, thumbnailUrl: null, hasCaptions: false, error, createdAt: new Date().toISOString() })
      if (short === `/api/community/${CID}/videos` && sent.action === "prepare") return reply({ ticket: { videoId: NEW_VID, provider: "mux", method: "put", url: `${ORIGIN}/upload/mux`, path: null, token: null, headers: {} } }, 200, 150)
      if (short === `/api/community/${CID}/videos` && sent.action === "complete") return reply({ video: view("processing") }, 200, 150)
      if (short === `/api/community/${CID}/videos/${NEW_VID}`) {
        statusAsks++
        if (opts.fail && statusAsks >= 2) return reply({ video: view("failed", "Mux could not read a video track in this file") }, 200, 80)
        return reply({ video: view(statusAsks >= 3 ? "ready" : "processing") }, 200, 80)
      }
      if (short.endsWith("/posts") && method === "POST") return reply({ post: { id: "p-new", title: sent.title, media: sent.media } }, 201, 200)
      return reply({})
    }
    if (url.startsWith(ORIGIN)) return r.respond({ status: 200, contentType: "text/html", body: html })
    return r.continue()
  })
  await p.goto(`${ORIGIN}/probe?case=${name}${query ? `&${query}` : ""}`, { waitUntil: "load" })
  await sleep(400)
  return { p, errors, calls, asks: () => statusAsks }
}

const sideScroll = (p) => p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }))
async function smallTargets(p, scope) {
  return p.evaluate((scope) => {
    const out = []
    for (const el of document.querySelectorAll(`${scope} button, ${scope} [role=slider], ${scope} input`)) {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      if (r.width === 0 || s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) continue
      if (el.type === "range" || el.type === "file") continue
      if (r.height < 39.5 && el.getAttribute("role") !== "slider") out.push({ label: el.getAttribute("aria-label") || el.textContent.trim().slice(0, 20), h: Math.round(r.height), w: Math.round(r.width) })
      if (el.getAttribute("role") === "slider" && r.height < 23.5) out.push({ label: "slider", h: Math.round(r.height) })
    }
    return out
  }, scope)
}

try {
  for (const [label, vp] of VIEWPORTS) {
    const phone = vp.width < 640
    console.log(`\n${label}`)

    /* ── UPLOAD: through a stubbed service, Post waits until it plays ── */
    if (want("upload")) {
      const { p, errors, calls, asks } = await open("composer", "", vp)
      await p.click("[data-composer-open]")
      await sleep(500)
      await p.type("[data-composer-title]", "The studio, on video")
      await p.type('[aria-label="Post"]', "A short walk through the room. ")
      await sleep(200)
      const disabled = () => p.$eval("[data-composer-post]", (b) => b.disabled)
      expect(!(await disabled()), "with a title, words and the one space, Post is ready before any video")
      const input = await p.$("[data-composer-video-input]")
      await input.uploadFile(clipPath)
      const phases = []
      const t0 = Date.now()
      let shotUp = false
      let shotProc = false
      while (Date.now() - t0 < 20000) {
        const s = await p.evaluate(() => {
          const t = document.querySelector('[data-tray-tile="video"]')
          const prog = t?.querySelector("[data-tray-progress]")
          return { tile: !!t, ready: t?.getAttribute("data-ready"), phase: prog?.getAttribute("data-tray-progress") ?? null, text: prog?.textContent ?? null, post: document.querySelector("[data-composer-post]")?.disabled }
        })
        const last = phases[phases.length - 1]
        const key = `${s.ready}|${s.phase}|${s.post}`
        if (!last || last.key !== key) phases.push({ key, ...s, at: Date.now() - t0 })
        if (s.phase === "uploading" && !shotUp) {
          shotUp = true
          await (await p.$("[data-attachment-tray]"))?.screenshot({ path: join(shots, `${label}-upload-sending.png`) })
        }
        if (s.phase === "processing" && !shotProc) {
          shotProc = true
          await (await p.$("[data-attachment-tray]"))?.screenshot({ path: join(shots, `${label}-upload-processing.png`) })
        }
        if (s.ready === "true") break
        await sleep(40)
      }
      const sawUploading = phases.some((x) => x.phase === "uploading" && x.post === true)
      const sawProcessing = phases.some((x) => x.phase === "processing" && x.post === true)
      const end = phases[phases.length - 1]
      expect(sawUploading, "while it uploads the tile shows its percent and Post waits", phases.map((x) => x.key))
      expect(sawProcessing, "while the service processes it the tile says Processing and Post waits", phases.map((x) => x.key))
      expect(end?.ready === "true" && end.post === false, "once the service says ready, the video is attached and Post is ready", end)
      expect(asks() >= 3 && calls.some((c) => c.url === "/upload/mux" && c.method === "PUT") && calls.some((c) => /"complete"/.test(c.body || "")), "prepare, PUT, complete, then the status route asked until ready", { asks: asks() })
      await (await p.$("[data-attachment-tray]"))?.screenshot({ path: join(shots, `${label}-upload-ready.png`) })
      await p.click("[data-composer-post]")
      await sleep(800)
      const posted = calls.find((c) => c.url === `/api/community/${CID}/posts` && c.method === "POST")
      const media = posted ? JSON.parse(posted.body).media : null
      expect(!!media && media.some((m) => m.type === "video" && m.videoId === NEW_VID), "the post carries the ready video", media)
      const side = await sideScroll(p)
      expect(side.scroll <= side.width, "nothing scrolls sideways", side)
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── FAIL: the service refuses it ── */
    if (want("fail") && !phone) {
      const { p, errors } = await open("composer", "", vp, { fail: true })
      await p.click("[data-composer-open]")
      await sleep(500)
      await p.type("[data-composer-title]", "The studio, on video")
      await p.type('[aria-label="Post"]', "A short walk through the room. ")
      await (await p.$("[data-composer-video-input]")).uploadFile(clipPath)
      await p.waitForSelector("[data-tray-error]", { timeout: 15000 }).catch(() => {})
      const said = await p.evaluate(() => ({ text: document.querySelector("[data-tray-error]")?.textContent, red: !!document.querySelector("[data-tray-failed]"), post: document.querySelector("[data-composer-post]")?.disabled }))
      expect(said.red && /could not be processed: Mux could not read a video track in this file\. Remove it to post\./.test(said.text || "") && said.post === true, "a failure is red on the tile, the reason is said, Post waits", said)
      await (await p.$("[data-attachment-tray]"))?.screenshot({ path: join(shots, `${label}-upload-failed.png`) })
      await p.click('[data-tray-tile="video"] [data-tray-remove]')
      await sleep(300)
      const after = await p.evaluate(() => ({ tiles: document.querySelectorAll("[data-tray-tile]").length, post: document.querySelector("[data-composer-post]")?.disabled }))
      expect(after.tiles === 0 && after.post === false, "taken off, the post can go", after)
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── TRAY: drag at 4x CPU, remove, add ── */
    if (want("tray")) {
      const { p, errors } = await open("tray", "", vp)
      await p.screenshot({ path: join(shots, `${label}-tray.png`) })
      const cdp = await p.createCDPSession()
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      const boxes = await p.$$eval("[data-tray-tile]", (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { key: e.getAttribute("data-key"), x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width } }))
      expect(boxes.length === 6 && boxes.every((b) => Math.round(b.w) === 84), "six equal 84px tiles", boxes.map((b) => Math.round(b.w)))
      /* A sampler: every frame, where the held tile is, and a neighbour's translate. */
      await p.evaluate(() => {
        window.__frames = []
        const tick = (t) => {
          const held = document.querySelector("[data-lifted]")
          const b = document.querySelector('[data-key="b"]')
          window.__frames.push({ t, held: held ? held.getBoundingClientRect().x : null, heldKey: held?.getAttribute("data-key") ?? null, nb: b ? getComputedStyle(b).translate : null, scale: held ? getComputedStyle(held).scale : null })
          if (window.__frames.length < 2000) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      const from = boxes[0]
      const to = boxes[2]
      if (!phone) {
        await p.mouse.move(from.x, from.y)
        await p.mouse.down()
        for (let i = 1; i <= 24; i++) {
          await p.mouse.move(from.x + ((to.x + 20 - from.x) * i) / 24, from.y + ((to.y - from.y) * i) / 24)
          if (i === 16) await p.screenshot({ path: join(shots, `${label}-tray-dragging.png`) })
        }
        await sleep(120)
        await p.mouse.up()
      } else {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y, id: 1 }] })
        await sleep(450)
        for (let i = 1; i <= 24; i++) {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + ((to.x + 20 - from.x) * i) / 24, y: from.y + ((to.y - from.y) * i) / 24, id: 1 }] })
          if (i === 16) await p.screenshot({ path: join(shots, `${label}-tray-dragging.png`) })
        }
        await sleep(120)
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      }
      await sleep(900)
      const frames = await p.evaluate(() => window.__frames)
      const heldFrames = frames.filter((f) => f.heldKey === "a")
      const gaps = frames.slice(1).map((f, i) => f.t - frames[i].t)
      const slid = frames.some((f) => f.nb && f.nb !== "none" && f.nb !== "0px" && f.nb !== "0px 0px")
      const order = await p.evaluate(() => [...document.querySelectorAll("[data-tray-tile]")].map((e) => e.getAttribute("data-key")).join(""))
      const leftover = await p.evaluate(() => [...document.querySelectorAll("[data-tray-tile]")].filter((e) => e.style.translate || e.style.scale || e.style.zIndex).length)
      const xs = heldFrames.map((f) => f.held)
      const steps = xs.slice(1).map((x, i) => Math.round(x - xs[i]))
      expect(heldFrames.length >= 10, `the tile lifts (${phone ? "after a hold" : "after a few pixels"}) and is held over many frames`, heldFrames.length)
      expect(heldFrames.some((f) => Number(f.scale) > 1.04), "lifted: a little larger", heldFrames.map((f) => f.scale).slice(0, 4))
      expect(slid, "a neighbour slides out of the way while it moves")
      expect(Math.max(0, ...steps.map(Math.abs)) <= 60, "it follows the pointer in small steps, no jumps", { steps: steps.slice(0, 30) })
      expect(order === "bcadef", "on release the order is kept (a after c)", order)
      expect(leftover === 0, "nothing is left moved or lifted afterwards", leftover)
      expect(Math.max(...gaps) < 200, "no long frame while dragging at 4x CPU", { max: Math.round(Math.max(...gaps)), p95: Math.round(gaps.sort((a, b) => a - b)[Math.floor(gaps.length * 0.95)]) })
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
      await p.screenshot({ path: join(shots, `${label}-tray-after.png`) })

      if (phone) {
        /* A quick swipe across the tiles does not lift one (it is a scroll). */
        const b = boxes[3]
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: b.x, y: b.y, id: 1 }] })
        for (let i = 1; i <= 6; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: b.x + i * 12, y: b.y - i * 3, id: 1 }] })
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
        await sleep(400)
        const still = await p.evaluate(() => [...document.querySelectorAll("[data-tray-tile]")].map((e) => e.getAttribute("data-key")).join(""))
        expect(still === "bcadef", "a quick swipe does not move anything", still)
      }
      /* Keys: the focused tile moves. */
      await p.focus('[data-key="f"]')
      await p.keyboard.press("ArrowLeft")
      await sleep(150)
      const keyed = await p.evaluate(() => [...document.querySelectorAll("[data-tray-tile]")].map((e) => e.getAttribute("data-key")).join(""))
      expect(keyed === "bcadfe", "the arrow key moves the focused tile", keyed)
      await p.click('[data-key="e"] [data-tray-remove]')
      await sleep(200)
      await p.click("[data-tray-add]")
      await sleep(200)
      const n = await p.evaluate(() => [...document.querySelectorAll("[data-tray-tile]")].map((e) => e.getAttribute("data-key")).join(""))
      expect(n === "bcadfn5", "remove takes it off, Add adds one at the end", n)
      if (phone) {
        const small = await smallTargets(p, "[data-attachment-tray]")
        expect(small.length === 0, "every control in the tray is at least 40px", small)
      }
      const side = await sideScroll(p)
      expect(side.scroll <= side.width, "nothing scrolls sideways", side)
      expect(errors.length === 0, "no page error", errors)
      await p.close()

      const st = await open("tray", "states=1", vp)
      await (await st.p.$("[data-attachment-tray]")).screenshot({ path: join(shots, `${label}-tray-states.png`) })
      const kinds = await st.p.evaluate(() => [...document.querySelectorAll("[data-tray-progress],[data-tray-failed]")].map((e) => e.getAttribute("data-tray-progress") || "failed"))
      expect(kinds.join() === "uploading,processing,failed", "uploading, processing and failed each look their own", kinds)
      await st.p.close()
    }

    /* ── PLAYER ── */
    if (want("player")) {
      const { p, errors, calls } = await open("player", "", vp)
      await p.screenshot({ path: join(shots, `${label}-player-poster.png`) })
      const box = await p.$eval("[data-storelib-video]", (e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) } })
      expect(Math.abs(box.w / box.h - 16 / 9) < 0.02, "a landscape video in a 16:9 box", box)
      /* The preview: a resting pointer on a computer, on screen on a phone. */
      if (!phone) await p.hover("[data-storelib-video]")
      await p.waitForSelector('[data-video-preview="playing"]', { timeout: 6000 }).catch(() => {})
      const loop = []
      for (let i = 0; i < 40; i++) {
        loop.push(await p.evaluate(() => { const v = document.querySelector("[data-video-preview] video"); return v ? { t: Math.round(v.currentTime * 100) / 100, o: getComputedStyle(v).opacity, muted: v.muted } : null }))
        await sleep(150)
      }
      const ts = loop.filter(Boolean).map((x) => x.t)
      const wrapped = ts.some((t, i) => i > 0 && t < ts[i - 1] - 1)
      expect(!!loop[0] && loop.every((x) => !x || x.muted), "the preview plays muted", loop[0])
      expect(Math.max(...ts) <= 4.4 && wrapped, "it loops the first seconds (back to the start after about 4s)", { max: Math.max(...ts), wrapped })
      expect(loop.filter(Boolean).some((x) => x.o === "1"), "and fades in over the poster once it plays")
      await p.screenshot({ path: join(shots, `${label}-player-preview.png`) })
      const asked = calls.filter((c) => c.url.includes("/play")).map((c) => c.url)
      expect(asked.length === 1 && /\?q=low$/.test(asked[0]), "the preview asks once, for the lighter file", asked)
      /* Play. */
      await p.click("[data-video-play]")
      await p.waitForSelector("[data-video-player]", { timeout: 4000 })
      await sleep(1500)
      const playing = await p.evaluate(() => { const v = document.querySelector("[data-video-player] video"); return { t: v.currentTime, paused: v.paused, d: v.duration } })
      expect(!playing.paused && playing.t > 0.3, "pressed, it plays in the community player", playing)
      expect(calls.filter((c) => c.url.includes("/play")).length === (asked.length + 1) || calls.filter((c) => c.url.includes("/play")).length === asked.length, "the press reuses or asks once more", calls.filter((c) => c.url.includes("/play")).length)
      if (!phone) {
        await p.mouse.move(10, 10)
        await p.hover("[data-video-player]")
      } else if ((await p.$eval("[data-video-player]", (e) => e.getAttribute("data-controls"))) === "hidden") {
        /* A phone: the first tap on the picture brings the controls back, as on any phone player. */
        const v = await p.$eval("[data-video-surface]", (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 3 } })
        await p.touchscreen.tap(v.x, v.y)
        await sleep(250)
        expect((await p.$eval("[data-video-player]", (e) => e.getAttribute("data-controls"))) === "shown", "a tap on the picture brings the controls back")
      }
      await sleep(200)
      await p.screenshot({ path: join(shots, `${label}-player-playing.png`) })
      const bar = await p.$eval("[data-video-scrub]", (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + r.height / 2, w: r.width } })
      if (phone) await p.touchscreen.tap(bar.x + bar.w / 2, bar.y)
      else await p.mouse.click(bar.x + bar.w / 2, bar.y)
      await sleep(400)
      const mid = await p.evaluate(() => document.querySelector("[data-video-player] video").currentTime)
      expect(Math.abs(mid - 4) < 0.8, "a press on the middle of the line goes to the middle", mid)
      if (phone) await p.tap("[data-video-mute]")
      else await p.click("[data-video-mute]")
      const muted = await p.evaluate(() => document.querySelector("[data-video-player] video").muted)
      expect(muted, "mute")
      await p.click("[data-video-mute]")
      await p.focus("[data-video-toggle]")
      await p.keyboard.press("k")
      await sleep(200)
      const paused = await p.evaluate(() => document.querySelector("[data-video-player] video").paused)
      expect(paused, "K pauses the focused player")
      const controls = await p.evaluate(() => ({ pip: !!document.querySelector("[data-video-pip]"), full: !!document.querySelector("[data-video-full]"), time: document.querySelector("[data-video-time]")?.textContent }))
      expect(controls.full && /\d:\d\d \/ 0:0[78]/.test(controls.time || ""), "fullscreen and the time (place / length)", controls)
      if (phone) {
        const small = await smallTargets(p, "[data-video-player]")
        expect(small.length === 0, "every control on the player is at least 40px", small)
      }
      /* Playing, the controls fade after a while without movement. */
      await p.evaluate(() => document.querySelector("[data-video-player] video").play())
      await sleep(3200)
      const faded = await p.$eval("[data-video-player]", (e) => e.getAttribute("data-controls"))
      expect(faded === "hidden", "playing, the controls fade after a while", faded)
      await p.screenshot({ path: join(shots, `${label}-player-clean.png`) })
      const side = await sideScroll(p)
      expect(side.scroll <= side.width, "nothing scrolls sideways", side)
      expect(errors.length === 0, "no page error", errors)
      await p.close()

      const rm = await open("player", "", vp, { reduced: true })
      if (!phone) await rm.p.hover("[data-storelib-video]")
      await sleep(1500)
      const noPreview = await rm.p.evaluate(() => document.querySelector("[data-video-preview]")?.getAttribute("data-video-preview"))
      expect(noPreview === "off" && !rm.calls.some((c) => c.url.includes("/play")), "with reduced motion there is no preview and nothing is asked", noPreview)
      await rm.p.close()
    }

    if (want("portrait") && phone) {
      const { p, errors } = await open("portrait", "", vp)
      const box = await p.$eval("[data-storelib-video]", (e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) } })
      expect(Math.abs(box.w / box.h - 0.8) < 0.02, "a portrait phone video keeps a 4:5 box", box)
      await p.screenshot({ path: join(shots, `${label}-portrait.png`) })
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }

    /* ── COVER: the About page's hero ── */
    if (want("cover")) {
      const { p, errors } = await open("cover", "", vp)
      await p.waitForSelector('[data-video-preview="playing"]', { timeout: 6000 }).catch(() => {})
      await sleep(600)
      const state = await p.evaluate(() => { const v = document.querySelector("[data-video-preview] video"); return v ? { t: v.currentTime, muted: v.muted, o: getComputedStyle(v).opacity } : null })
      expect(!!state && state.muted && state.t > 0 && state.o === "1", "the cover video loops muted while on screen, without a press", state)
      await p.screenshot({ path: join(shots, `${label}-cover-loop.png`) })
      const playBox = await p.evaluate(() => { const b = document.querySelector('[data-gallery-play="upload"]'); const r = b?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height } : null })
      if (!playBox || !playBox.w) console.log("    (cover play box)", playBox)
      else if (phone) await p.touchscreen.tap(playBox.x, playBox.y)
      else await p.mouse.click(playBox.x, playBox.y)
      await p.waitForSelector("[data-gallery-video] [data-video-player]", { timeout: 5000 }).catch(() => {})
      await sleep(1200)
      const played = await p.evaluate(() => { const v = document.querySelector("[data-gallery-video] video"); return v ? { t: v.currentTime, paused: v.paused, controls: v.controls } : null })
      expect(!!played && !played.paused && played.t > 0.2 && !played.controls, "pressed, it plays in the community player (not the browser's controls)", played)
      await p.screenshot({ path: join(shots, `${label}-cover-playing.png`) })
      const side = await sideScroll(p)
      expect(side.scroll <= side.width, "nothing scrolls sideways", side)
      expect(errors.length === 0, "no page error", errors)
      await p.close()
    }
  }
} finally {
  await browser.close()
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nshots: ${shots}`)
if (broken) {
  console.log(`\n${broken} failed`)
  process.exit(1)
}
console.log("\nall good")
