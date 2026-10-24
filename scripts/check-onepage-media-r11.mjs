/**
 * ===========================================================================
 *  ONEPAGE UPLOADS AND THE CROPPER, IN A REAL BROWSER
 * ===========================================================================
 * Round 11: "It failed to upload a video in the OnePage editor, in all
 * places, or images. Make sure it supports all kinds of videos up to 2 GB."
 * "The crop video and crop images ... make sure it works on mobile devices
 * with dragging in corners, and desktop."
 *
 * Nothing leaves the machine. The probe is its own Supabase Storage: the two
 * endpoints the editor uploads to (one request, and TUS resumable parts),
 * written to behave as Supabase's do where it matters (a TUS part must be
 * exactly 6 MB but the last, its offset must be the one storage has, a
 * project upload limit answers 413 with Supabase's words). Real files are
 * made for it: a 5 MB JPEG (PIL), an iPhone HEIC (byte-faithful: the ISO
 * `ftyp heic` box and data; Chromium cannot draw HEIC, which is the case a
 * desktop Chrome user meets), a 50 MB MP4 and a 300 MB MOV (byte-faithful
 * containers: `ftyp isom` / `ftyp qt  ` and an mdat; the bytes are what an
 * upload moves), a real WebM clip (vp8, for the video crop preview) and a
 * 2 GiB MP4 (sparse on disk, uploaded whole through the browser).
 *
 *   UPLOAD    each file through the real uploadOnePageMedia and the browser's
 *             XMLHttpRequest: the route it took, every byte arrived, the
 *             parts, the progress, the type storage was told; the HEIC's
 *             error; Stop in the middle of the 300 MB; the 413 a project
 *             limit gives; the whole 2 GiB
 *   CROP      the real MediaCropper at 390x844 (touch, CPU 4x slower) and at
 *             1440x900 (mouse): every corner and edge dragged, the box's
 *             handle measured against the finger after every move, the page
 *             never scrolling under it, a pinch, the video crop playing
 *   SAME      the crop as the live page draws it against the file the editor
 *             uploads for it, pixel by pixel
 *   DESIGN    the real Design tab's Wallpaper: Upload, Replace and Delete
 *             tapped as the owner would, with screenshots
 *
 *   PROBE_CSS=source node scripts/check-onepage-media-r11.mjs
 *   SHOTS_DIR=/some/dir   where the screenshots go (prefix media-)
 *   SKIP_2GB=1            skip the 2 GiB upload (it takes a minute or two)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { closeSync, createReadStream, existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync, writeSync, ftruncateSync } from "node:fs"
import { join, extname } from "node:path"
import { tmpdir } from "node:os"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const shots = process.env.SHOTS_DIR || join(tmpdir(), "storelib-media-r11-shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const MB = 1024 * 1024

/* ── The media ────────────────────────────────────────────────────────── */
const mediaDir = join(tmpdir(), `storelib-media-r11-${process.pid}`)
mkdirSync(mediaDir, { recursive: true })
function container(path, size, brand) {
  const fd = openSync(path, "w")
  const ftyp = Buffer.alloc(32)
  ftyp.writeUInt32BE(32, 0)
  ftyp.write("ftyp", 4, "latin1")
  ftyp.write(brand, 8, "latin1")
  ftyp.writeUInt32BE(0x200, 12)
  ftyp.write(brand === "qt  " ? "qt  qt  qt  qt  " : brand === "heic" ? "mif1heicmiafMiHE" : "isomiso2avc1mp41", 16, "latin1")
  writeSync(fd, ftyp)
  const mdat = Buffer.alloc(16)
  mdat.writeUInt32BE(1, 0)
  mdat.write("mdat", 4, "latin1")
  mdat.writeBigUInt64BE(BigInt(size - 32), 8)
  writeSync(fd, mdat)
  /* A few real-looking bytes through the file, then sparse to the size. */
  for (let at = 1 * MB; at < size; at += 64 * MB) writeSync(fd, Buffer.from(`frame@${at}`.padEnd(64, "x")), 0, 64, at)
  ftruncateSync(fd, size)
  closeSync(fd)
}
const python = (code) => execFileSync("python3", ["-I", "-c", code], { stdio: ["ignore", "inherit", "inherit"] })
python(`
from PIL import Image, ImageDraw
import random
random.seed(7)
w, h = 1600, 1200
im = Image.new("RGB", (w, h))
d = ImageDraw.Draw(im)
for gx in range(0, w, 100):
    for gy in range(0, h, 100):
        d.rectangle([gx, gy, gx + 99, gy + 99], fill=((gx * 7) % 256, (gy * 11) % 256, ((gx + gy) * 3) % 256))
im.save(${JSON.stringify(join(mediaDir, "grid.jpg"))}, "JPEG", quality=95)
big = Image.effect_noise((2600, 1950), 60).convert("RGB")
big.save(${JSON.stringify(join(mediaDir, "photo-5mb.jpg"))}, "JPEG", quality=97)
`)
let photo = statSync(join(mediaDir, "photo-5mb.jpg")).size
container(join(mediaDir, "IMG_0001.HEIC"), 2 * MB + 1234, "heic")
container(join(mediaDir, "clip-50mb.mp4"), 50 * MB, "isom")
container(join(mediaDir, "IMG_1234.MOV"), 300 * MB, "qt  ")
const GIB2 = 2 * 1024 * MB
if (!process.env.SKIP_2GB) container(join(mediaDir, "long-2gb.mp4"), GIB2, "isom")
/* A real playing clip for the video crop: vp8 in WebM, from Playwright's own ffmpeg (no other encoder here). */
const FFMPEG = "/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux"
python(`
from PIL import Image, ImageDraw
import io, subprocess
p = subprocess.Popen([${JSON.stringify(FFMPEG)}, "-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", "24", "-i", "pipe:0", "-c:v", "libvpx", "-b:v", "1M", ${JSON.stringify(join(mediaDir, "clip.webm"))}], stdin=subprocess.PIPE)
for i in range(72):
    im = Image.new("RGB", (640, 360), (20, 20, 30)); d = ImageDraw.Draw(im)
    for gx in range(0, 640, 80):
        for gy in range(0, 360, 80):
            d.rectangle([gx, gy, gx + 79, gy + 79], fill=((gx * 3 + i * 4) % 255, (gy * 3) % 255, 150))
    d.ellipse([200 + i * 2, 120, 320 + i * 2, 240], fill=(255, 255, 255))
    b = io.BytesIO(); im.save(b, "JPEG", quality=90); p.stdin.write(b.getvalue())
p.stdin.close(); p.wait()
`)
console.log(`media: photo ${(photo / MB).toFixed(1)} MB, HEIC, 50 MB MP4, 300 MB MOV, ${process.env.SKIP_2GB ? "no 2 GiB" : "2 GiB MP4"}, WebM clip ${statSync(join(mediaDir, "clip.webm")).size} bytes`)

/* ── The storage stub ─────────────────────────────────────────────────── */
const PART = 6 * MB
const log = []
const tus = new Map()
let projectLimit = Infinity
/* The Design tab test holds a picture's answer back, so the progress over it can be seen and photographed. */
let slowSingleMs = 0
function readBody(req, onChunk) {
  return new Promise((resolve, reject) => {
    let n = 0
    req.on("data", (c) => {
      n += c.length
      onChunk?.(c)
    })
    req.on("end", () => resolve(n))
    req.on("error", reject)
    req.on("aborted", () => resolve(-1))
  })
}
let html = ""
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x")
  const p = url.pathname
  const json = (status, body, headers = {}) => {
    res.writeHead(status, { "content-type": "application/json", ...headers })
    res.end(JSON.stringify(body))
  }
  if (p === "/" || p.startsWith("/app")) {
    res.writeHead(200, { "content-type": "text/html" })
    return res.end(html)
  }
  /* What storage serves for an uploaded file: the probe's own copy of the same kind, so the editor shows it after saving. */
  const served = p.startsWith("/storage/v1/object/public/") ? (p.endsWith(".webm") ? "/media/clip.webm" : /\.(jpe?g)$/.test(p) ? "/media/photo-5mb.jpg" : null) : null
  if (p.startsWith("/media/") || served) {
    const f = join(mediaDir, (served || p).slice(7))
    if (!existsSync(f)) return json(404, {})
    const type = { ".jpg": "image/jpeg", ".webm": "video/webm" }[extname(f)] || "application/octet-stream"
    const size = statSync(f).size
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || "")
    if (range) {
      const a = Number(range[1])
      const b = range[2] ? Number(range[2]) : size - 1
      res.writeHead(206, { "content-type": type, "content-range": `bytes ${a}-${b}/${size}`, "accept-ranges": "bytes", "content-length": b - a + 1 })
      return createReadStream(f, { start: a, end: b }).pipe(res)
    }
    res.writeHead(200, { "content-type": type, "content-length": size, "accept-ranges": "bytes" })
    return createReadStream(f).pipe(res)
  }
  /* One request: POST /storage/v1/object/<bucket>/<path> */
  const single = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(p)
  if (single && req.method === "POST") {
    const entry = { kind: "single", bucket: single[1], path: decodeURIComponent(single[2]), type: req.headers["content-type"], auth: req.headers.authorization, upsert: req.headers["x-upsert"], bytes: 0 }
    log.push(entry)
    entry.bytes = await readBody(req)
    if (slowSingleMs) await sleep(slowSingleMs)
    if (entry.bytes > projectLimit) return json(400, { statusCode: "413", error: "Payload too large", message: "The object exceeded the maximum allowed size" })
    return json(200, { Key: `${single[1]}/${single[2]}` })
  }
  /* TUS */
  if (p === "/storage/v1/upload/resumable" && req.method === "POST") {
    const length = Number(req.headers["upload-length"])
    const meta = Object.fromEntries(String(req.headers["upload-metadata"] || "").split(",").map((kv) => kv.trim().split(" ")).map(([k, v]) => [k, Buffer.from(v || "", "base64").toString()]))
    await readBody(req)
    if (length > projectLimit) return json(413, { message: "The object exceeded the maximum allowed size" })
    const id = Math.random().toString(36).slice(2)
    const entry = { kind: "tus", id, length, meta, auth: req.headers.authorization, upsert: req.headers["x-upsert"], offset: 0, parts: 0, badParts: 0, deleted: false }
    tus.set(id, entry)
    log.push(entry)
    res.writeHead(201, { location: `/storage/v1/upload/resumable/${id}`, "tus-resumable": "1.0.0" })
    return res.end()
  }
  const one = /^\/storage\/v1\/upload\/resumable\/(\w+)$/.exec(p)
  if (one) {
    const entry = tus.get(one[1])
    if (!entry) return json(404, {})
    if (req.method === "HEAD") {
      res.writeHead(200, { "upload-offset": String(entry.offset), "upload-length": String(entry.length), "tus-resumable": "1.0.0" })
      return res.end()
    }
    if (req.method === "DELETE") {
      entry.deleted = true
      res.writeHead(204)
      return res.end()
    }
    if (req.method === "PATCH") {
      const offset = Number(req.headers["upload-offset"])
      if (offset !== entry.offset) {
        await readBody(req)
        return json(409, { message: "offset" })
      }
      const n = await readBody(req)
      if (n < 0) return
      const last = offset + n === entry.length
      /* Supabase's own rule: every part but the last is exactly 6 MB. */
      if (n !== PART && !last) {
        entry.badParts++
        return json(400, { message: `part of ${n} bytes` })
      }
      entry.offset += n
      entry.parts++
      res.writeHead(204, { "upload-offset": String(entry.offset), "tus-resumable": "1.0.0" })
      return res.end()
    }
  }
  if (p === "/api/storage/uploaded") return json(200, { ok: true })
  return json(200, {})
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

/* ── The bundle ───────────────────────────────────────────────────────── */
const work = join(root, `.onepage-media-probe-${process.pid}`)
mkdirSync(work, { recursive: true })
writeFileSync(join(work, "navigation.js"), `export const usePathname = () => "/app/onepage"
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
`)
writeFileSync(join(work, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(work, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, priority, unoptimized, sizes, quality, placeholder, blurDataURL, loader, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src && src.src, alt, ...rest }) }
`)
/* Signed in: the upload uses the session's token, as in the app. */
writeFileSync(join(work, "supabase.js"), `const result = { data: Object.assign([], { onboarding_completed: true }), error: null }
const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r(result) : q, apply: () => q })
const session = { access_token: "probe-jwt", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "probe-user" } }
export function createClient() { return { auth: { getUser: async () => ({ data: { user: session.user } }), getSession: async () => ({ data: { session } }), refreshSession: async () => ({ data: { session } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
`)
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-onepage-media-r11.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(work, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_APP_URL="https://storelib.com"',
    `--define:process.env.NEXT_PUBLIC_SUPABASE_URL=${JSON.stringify(base)}`, '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="probe-anon"',
    `--alias:next/navigation=${join(work, "navigation.js")}`, `--alias:next/link=${join(work, "link.jsx")}`, `--alias:next/image=${join(work, "image.jsx")}`,
    `--alias:@/lib/supabase/client=${join(work, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch {
  rmSync(work, { recursive: true, force: true })
  console.error("the probe did not bundle")
  process.exit(1)
}
const bundle = readFileSync(join(work, "probe.js"), "utf8")
rmSync(work, { recursive: true, force: true })
const css = await appCss(root)
const pageHtml = (theme = {}) =>
  `<!doctype html><html lang="en" class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
  `<style>${interFaces(root)}</style><style>${css}</style></head><body><div id="app"></div>` +
  `<script>window.process={env:{NODE_ENV:"production"}};window.PROBE_THEME=${JSON.stringify(theme)};</script><script>${bundle.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
html = pageHtml()

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none", "--autoplay-policy=no-user-gesture-required"] })
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }
const DESK = { width: 1440, height: 900 }
async function open(vp, path, { cpu = 1 } = {}) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const cdp = await p.createCDPSession()
  if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
  p.on("pageerror", (e) => console.log("  page error:", e.message))
  await p.goto(`${base}${path}`, { waitUntil: "load" })
  await sleep(400)
  return { p, cdp }
}
const frames = (p) => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

/* ── UPLOAD ───────────────────────────────────────────────────────────── */
console.log("\nUPLOAD (the real uploadOnePageMedia, the browser's XMLHttpRequest, the storage stub)")
{
  const { p } = await open(DESK, "/app?view=upload")
  const send = async (file, { stopAt = null, wait = 600_000 } = {}) => {
    const before = log.length
    const input = await p.$("#pick")
    await input.uploadFile(join(mediaDir, file))
    const t0 = Date.now()
    let stopped = false
    while (Date.now() - t0 < wait) {
      const rec = await p.evaluate(() => { const u = window.__uploads.at(-1); return u && { done: !!u.done, last: u.progress.at(-1) ?? 0 } })
      if (stopAt !== null && !stopped && rec && rec.last >= stopAt) {
        await p.evaluate(() => window.__stop())
        stopped = true
      }
      if (rec?.done) break
      await sleep(stopAt !== null ? 20 : 150)
    }
    await sleep(150)
    const rec = await p.evaluate(() => window.__uploads.at(-1))
    return { rec, entries: log.slice(before) }
  }

  {
    const { rec, entries } = await send("photo-5mb.jpg")
    const e = entries[0]
    expect(rec.result && entries.length === 1 && e.kind === "single" && e.bytes === photo, `5 MB JPEG (${(photo / MB).toFixed(1)} MB): one request straight to storage, every byte`, { route: e?.kind, bytes: e?.bytes, ms: rec.ms })
    expect(e?.type === "image/jpeg" && e?.auth === "Bearer probe-jwt" && /^probe-user\/probe-\d+-\w+\.jpg$/.test(e?.path) && e?.bucket === "onepage-assets", "5 MB JPEG: typed image/jpeg, the session's token, the owner's folder in onepage-assets", e?.path)
    expect(rec.progress.length >= 2 && rec.progress.at(-1) === 100, "5 MB JPEG: progress reported to 100", rec.progress.slice(-4))
  }
  {
    const { rec, entries } = await send("IMG_0001.HEIC")
    expect(!rec.result && rec.error?.code === "unreadable" && entries.length === 0, "iPhone HEIC in Chromium (which cannot draw HEIC): a plain sentence, nothing half uploaded", rec.error?.message)
  }
  {
    const { rec, entries } = await send("clip-50mb.mp4")
    const t = entries.find((x) => x.kind === "tus")
    expect(rec.result && t && t.offset === 50 * MB && t.parts === 9 && t.badParts === 0, "50 MB MP4: TUS, 9 parts of exactly 6 MB, every byte", { parts: t?.parts, bytes: t?.offset, ms: rec.ms })
    expect(t?.meta.contentType === "video/mp4" && t?.meta.bucketName === "onepage-assets" && /^probe-user\//.test(t?.meta.objectName), "50 MB MP4: typed video/mp4, into the owner's folder", t?.meta)
    const ups = rec.progress.filter((v, i, a) => i === 0 || v > a[i - 1]).length
    expect(ups >= 9 && rec.progress.at(-1) === 100, "50 MB MP4: progress climbs through the upload", `${ups} steps`)
  }
  {
    const { rec, entries } = await send("IMG_1234.MOV", { stopAt: 40 })
    const t = entries.find((x) => x.kind === "tus")
    expect(!rec.result && rec.error?.code === "cancelled" && t && t.offset < 300 * MB && t.offset > 0, "300 MB MOV, Stop at 40%: stopped, not finished", { got: t?.offset, error: rec.error?.code })
    await sleep(300)
    expect(t?.deleted === true, "300 MB MOV, Stop: storage told to drop the parts (TUS DELETE)")
  }
  {
    const { rec, entries } = await send("IMG_1234.MOV")
    const t = entries.find((x) => x.kind === "tus")
    expect(rec.result && t?.offset === 300 * MB && t.parts === 50 && t.badParts === 0, "300 MB MOV: TUS, 50 parts, every byte", { parts: t?.parts, ms: rec.ms })
    expect(t?.meta.contentType === "video/quicktime" && rec.result.path.endsWith(".mov"), "300 MB MOV: stored as video/quicktime .mov", t?.meta.contentType)
  }
  {
    projectLimit = 50 * MB
    const { rec } = await send("IMG_1234.MOV")
    projectLimit = Infinity
    expect(!rec.result && rec.error?.code === "too_large" && /bigger than uploads allow/.test(rec.error.message), "a project upload limit under the file (Supabase's 50 MB default): a plain sentence", rec.error?.message)
  }
  if (!process.env.SKIP_2GB) {
    const { rec, entries } = await send("long-2gb.mp4", { wait: 900_000 })
    const t = entries.find((x) => x.kind === "tus")
    expect(rec.result && t?.offset === GIB2 && t.parts === 342 && t.badParts === 0 && !entries.some((x) => x.kind === "single"), "2 GiB MP4: TUS, 342 parts, every byte, never one request", { parts: t?.parts, bytes: t?.offset, seconds: Math.round(rec.ms / 1000) })
  }
  await p.close()
}

/* ── CROP ─────────────────────────────────────────────────────────────── */
console.log("\nCROP (the real MediaCropper)")
const handleAt = (p, sel, h) =>
  p.evaluate((sel, h) => {
    const el = document.querySelector(`${sel} [data-crop-handle="${h}"]`)
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, sel, h)
/** Where the handle's own point on the box is (a corner, or an edge's middle), on screen. */
const boxPoint = (p, sel, h) =>
  p.evaluate((sel, h) => {
    const r = document.querySelector(`${sel} [data-crop-box]`).getBoundingClientRect()
    return { x: h.includes("e") ? r.right : h.includes("w") ? r.left : r.left + r.width / 2, y: h.includes("s") ? r.bottom : h.includes("n") ? r.top : r.top + r.height / 2 }
  }, sel, h)

async function dragHandle({ p, cdp }, sel, h, dx, dy, { touch, steps = 16 }) {
  /* On screen first, as a person would have it: a touch outside the viewport is no touch at all. */
  await p.evaluate((sel) => { const r = document.querySelector(`${sel} [data-crop-box]`).getBoundingClientRect(); if (r.top < 60 || r.bottom > innerHeight - 60) scrollBy(0, r.top - 120) }, sel)
  await frames(p)
  const start = await handleAt(p, sel, h)
  const box0 = await boxPoint(p, sel, h)
  const off = { x: start.x - box0.x, y: start.y - box0.y }
  await p.evaluate(() => {
    window.__ft = []
    let last = performance.now()
    window.__ftOn = true
    const tick = (t) => { window.__ft.push(t - last); last = t; if (window.__ftOn) requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })
  const scroll0 = await p.evaluate(() => scrollY)
  if (touch) await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: start.x, y: start.y, id: 1 }] })
  else {
    await p.mouse.move(start.x, start.y)
    await p.mouse.down()
  }
  let worst = 0
  for (let i = 1; i <= steps; i++) {
    const x = start.x + (dx * i) / steps
    const y = start.y + (dy * i) / steps
    if (touch) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id: 1 }] })
    else await p.mouse.move(x, y)
    await frames(p)
    const at = await boxPoint(p, sel, h)
    const ex = h.includes("e") || h.includes("w") ? Math.abs(at.x + off.x - x) : 0
    const ey = h.includes("n") || h.includes("s") ? Math.abs(at.y + off.y - y) : 0
    worst = Math.max(worst, ex, ey)
  }
  if (touch) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  else await p.mouse.up()
  await frames(p)
  const ft = await p.evaluate(() => { window.__ftOn = false; return window.__ft.slice(1) })
  const scroll1 = await p.evaluate(() => scrollY)
  return { worst, scrolled: scroll1 - scroll0, longest: Math.round(Math.max(0, ...ft)), median: Math.round(ft.sort((a, b) => a - b)[Math.floor(ft.length / 2)] || 0) }
}
const crops = (p) => p.evaluate(() => JSON.parse(JSON.stringify(window.__crops)))

for (const [label, vp, touch, cpu] of [["390 touch, CPU 4x", PHONE, true, 4], ["1440 mouse", DESK, false, 1]]) {
  const pp = await open(vp, "/app?view=cropper", { cpu })
  await pp.p.waitForSelector("#sheet [data-crop-box]")
  await pp.p.waitForSelector("#wall [data-crop-box]", { timeout: 15000 }).catch(() => {})
  await pp.p.screenshot({ path: join(shots, `media-cropper-${vp.width}.png`) })
  /* Locked square on a picture in a transformed sheet: each corner along its diagonal (pull in, then out). */
  for (const h of ["se", "nw", "ne", "sw"]) {
    const sx = h.includes("e") ? -1 : 1
    const sy = h.includes("s") ? -1 : 1
    const r = await dragHandle(pp, "#sheet", h, sx * 40, sy * 40, { touch })
    expect(r.worst <= 3 && r.scrolled === 0, `${label}: circle crop in a scaled sheet, ${h} corner follows the finger every frame, page still`, r)
    const back = await dragHandle(pp, "#sheet", h, -sx * 30, -sy * 30, { touch })
    expect(back.worst <= 3 && back.scrolled === 0, `${label}: and back out again`, back)
  }
  for (const h of ["n", "e", "s", "w"]) {
    const d = { n: [0, 30], s: [0, -30], e: [-30, 0], w: [30, 0] }[h]
    const r = await dragHandle(pp, "#sheet", h, d[0], d[1], { touch })
    const c = (await crops(pp.p)).avatar
    expect(r.scrolled === 0 && Math.abs((c.width * 4) / 3 - c.height) < 0.6, `${label}: circle crop, ${h} edge resizes and keeps it round`, { ...r, crop: c })
  }
  /* Free crop: corners in any direction, edges exactly. */
  for (const [h, dx, dy] of [["se", -50, -20], ["nw", 30, 45], ["ne", -25, 35], ["sw", 20, -30], ["e", -30, 0], ["n", 0, 25]]) {
    const r = await dragHandle(pp, "#logo", h, dx, dy, { touch })
    expect(r.worst <= 3 && r.scrolled === 0, `${label}: free logo crop, ${h} follows the finger in both directions`, r)
  }
  /* Move the whole box. */
  {
    const box = await pp.p.evaluate(() => { const r = document.querySelector("#logo [data-crop-box]").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top } })
    if (touch) {
      await pp.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x, y: box.y, id: 1 }] })
      for (let i = 1; i <= 10; i++) { await pp.cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + i, y: box.y + i * 1.5, id: 1 }] }); await frames(pp.p) }
      await pp.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    } else {
      await pp.p.mouse.move(box.x, box.y); await pp.p.mouse.down()
      for (let i = 1; i <= 10; i++) { await pp.p.mouse.move(box.x + i, box.y + i * 1.5); await frames(pp.p) }
      await pp.p.mouse.up()
    }
    await frames(pp.p)
    const after = await pp.p.evaluate(() => { const r = document.querySelector("#logo [data-crop-box]").getBoundingClientRect(); return { l: r.left, t: r.top } })
    expect(Math.abs(after.l - box.l - 10) <= 2 && Math.abs(after.t - box.t - 15) <= 2, `${label}: dragging inside the box moves it with the finger`, { dx: Math.round(after.l - box.l), dy: Math.round(after.t - box.t) })
  }
  /* The 9:16 wallpaper crop on a playing video. */
  {
    const v0 = await pp.p.evaluate(() => { const v = document.querySelector("#wall video"); return { t: v.currentTime, ready: v.readyState, w: v.videoWidth, paused: v.paused } })
    await sleep(700)
    const v1 = await pp.p.evaluate(() => { const v = document.querySelector("#wall video"); return { t: v.currentTime, paused: v.paused } })
    /* A three second clip on a loop: moving and not paused (it may have wrapped round). */
    expect(v0.w === 640 && !v0.paused && !v1.paused && v1.t !== v0.t, `${label}: the video crop preview plays while cropping`, { from: v0.t.toFixed(2), to: v1.t.toFixed(2) })
    const r = await dragHandle(pp, "#wall", "sw", 25, -25 * (16 / 9), { touch })
    const c = (await crops(pp.p)).wall
    const realAspect = ((c.width / 100) * 640) / ((c.height / 100) * 360)
    expect(r.scrolled === 0 && Math.abs(realAspect - 9 / 16) < 0.01 && c.v === 2, `${label}: wallpaper crop keeps 9:16 of the real video`, { ...r, aspect: realAspect.toFixed(4) })
  }
  if (touch) {
    /* Pinch on the logo box: two fingers apart, the box grows about its centre. */
    const before = (await crops(pp.p)).logo
    await pp.p.evaluate(() => document.querySelector("#logo").scrollIntoView({ block: "center" }))
    await frames(pp.p)
    const c = await pp.p.evaluate(() => { const r = document.querySelector("#logo [data-crop-box]").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
    await pp.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: c.x - 10, y: c.y, id: 1 }, { x: c.x + 10, y: c.y, id: 2 }] })
    for (let i = 1; i <= 8; i++) { await pp.cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: c.x - 10 - i * 2, y: c.y, id: 1 }, { x: c.x + 10 + i * 2, y: c.y, id: 2 }] }); await frames(pp.p) }
    await pp.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await frames(pp.p)
    const after = (await crops(pp.p)).logo
    expect(after.width > before.width || after.width >= 99.9, "390 touch: a pinch zooms the crop", { before: before.width, after: after.width })
  }
  await pp.p.screenshot({ path: join(shots, `media-cropper-${vp.width}-after.png`) })
  await pp.p.close()
}

/* ── SAME ─────────────────────────────────────────────────────────────── */
console.log("\nSAME (the live page's drawing of a crop against the file the editor saves)")
{
  const crop = { x: 20, y: 10, width: 45, height: 60, v: 2 }
  const { p } = await open({ width: 700, height: 500 }, `/app?view=same&crop=${encodeURIComponent(JSON.stringify(crop))}`)
  await p.waitForFunction(() => document.querySelector("#saved img")?.complete && document.querySelector("#live img")?.complete, { timeout: 15000 })
  await sleep(300)
  const shot = async (sel) => (await p.$(sel)).screenshot({ encoding: "base64" })
  const a = await shot("#live")
  const b = await shot("#saved")
  await (await p.$("body")).screenshot({ path: join(shots, "media-same.png") })
  const diff = await p.evaluate(async (a, b) => {
    const load = async (s) => { const i = new Image(); i.src = `data:image/png;base64,${s}`; await i.decode(); const c = document.createElement("canvas"); c.width = i.width; c.height = i.height; const g = c.getContext("2d"); g.drawImage(i, 0, 0); return g.getImageData(0, 0, c.width, c.height) }
    const A = await load(a), B = await load(b)
    let worst = 0, sum = 0, n = 0
    /* Sample away from the 100px grid lines' anti-aliasing: the middle of cells. */
    for (let y = 4; y < Math.min(A.height, B.height) - 4; y += 7) for (let x = 4; x < Math.min(A.width, B.width) - 4; x += 7) {
      const i = (y * A.width + x) * 4, j = (y * B.width + x) * 4
      const d = Math.max(Math.abs(A.data[i] - B.data[j]), Math.abs(A.data[i + 1] - B.data[j + 1]), Math.abs(A.data[i + 2] - B.data[j + 2]))
      sum += d; n++; worst = Math.max(worst, d)
    }
    return { mean: +(sum / n).toFixed(2), size: [A.width, A.height, B.width, B.height] }
  }, a, b)
  expect(diff.mean < 6 && diff.size[0] === diff.size[2] && diff.size[1] === diff.size[3], "a crop drawn on the live page is the same picture as the file saved for it", diff)
  await p.close()
}

/* ── DESIGN: Wallpaper, Upload, Replace, Delete ──────────────────────── */
console.log("\nDESIGN (the real Design tab, Wallpaper, as the owner taps it)")
for (const [label, vp, touch] of [["390 touch", PHONE, true], ["1440", DESK, false]]) {
  html = pageHtml({ background_type: "image", background_image_url: "" })
  const { p } = await open(vp, "/app?view=design", { cpu: touch ? 4 : 1 })
  const tap = async (sel) => { const el = await p.waitForSelector(sel, { visible: true, timeout: 10000 }); if (touch) await el.tap(); else await el.click(); await sleep(250) }
  await tap('[data-nav-row="wallpaper"]')
  await sleep(500)
  const upBox = await p.$('[data-wallpaper-upload="image"]')
  expect(!!upBox, `${label}: an empty picture wallpaper shows its upload box`)
  const [chooser] = await Promise.all([p.waitForFileChooser({ timeout: 5000 }), upBox && (touch ? upBox.tap() : upBox.click())])
  const before = log.length
  slowSingleMs = 2500
  await chooser.accept([join(mediaDir, "photo-5mb.jpg")])
  /* The picture shows at once with its progress over it. */
  await p.waitForSelector('[data-wallpaper-cover="image"]', { timeout: 5000 }).catch(() => {})
  const during = await p.evaluate(() => ({ cover: !!document.querySelector('[data-wallpaper-cover="image"] img'), progress: !!document.querySelector("[data-upload-progress]") }))
  await p.screenshot({ path: join(shots, `media-wallpaper-${vp.width}-uploading.png`) })
  slowSingleMs = 0
  await p.waitForFunction(() => window.__theme?.background_image_url?.includes("/storage/v1/object/public/onepage-assets/probe-user/wallpaper-"), { timeout: 30000 }).catch(() => {})
  const saved = await p.evaluate(() => window.__theme?.background_image_url || "")
  expect(during.cover && saved.includes("/onepage-assets/probe-user/wallpaper-") && log.slice(before).some((e) => e.kind === "single" && e.bytes === photo), `${label}: Upload: shown at once, uploaded straight to storage, saved on the page`, { during, saved: saved.slice(-60) })
  await sleep(600)
  await p.screenshot({ path: join(shots, `media-wallpaper-${vp.width}-image.png`) })
  /* Replace */
  const [chooser2] = await Promise.all([p.waitForFileChooser({ timeout: 5000 }), tap("[data-wallpaper-replace]")])
  await chooser2.accept([join(mediaDir, "photo-5mb.jpg")])
  await p.waitForFunction((old) => window.__theme?.background_image_url && window.__theme.background_image_url !== old, { timeout: 30000 }, saved).catch(() => {})
  const replaced = await p.evaluate(() => window.__theme?.background_image_url || "")
  expect(replaced && replaced !== saved && replaced.includes("/wallpaper-"), `${label}: Replace: a new picture, saved`, replaced.slice(-40))
  /* Delete */
  await sleep(500)
  await tap("[data-wallpaper-delete]")
  const gone = await p.evaluate(() => ({ url: window.__theme?.background_image_url, box: !!document.querySelector('[data-wallpaper-upload="image"]') }))
  expect(gone.url === "" && gone.box, `${label}: Delete: the picture is gone and the upload box is back`, gone)
  await p.screenshot({ path: join(shots, `media-wallpaper-${vp.width}-deleted.png`) })
  /* Video: pick, crop sheet, save. */
  const videoTile = await p.evaluateHandle(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Video"))
  const [chooser3] = await Promise.all([p.waitForFileChooser({ timeout: 5000 }), touch ? videoTile.tap() : videoTile.click()])
  await chooser3.accept([join(mediaDir, "clip.webm")])
  await p.waitForSelector('[data-crop-upload="video"] [data-crop-box]', { timeout: 15000 }).catch(() => {})
  await sleep(800)
  await p.screenshot({ path: join(shots, `media-wallpaper-${vp.width}-video-crop.png`) })
  await tap("[data-crop-save]")
  await p.waitForFunction(() => window.__theme?.background_type === "video" && window.__theme?.background_video_url, { timeout: 30000 }).catch(() => {})
  const vt = await p.evaluate(() => ({ type: window.__theme?.background_type, url: window.__theme?.background_video_url, crop: window.__theme?.background_video_crop }))
  expect(vt.type === "video" && /onepage-assets\/probe-user\/wallpaper-video-.*\.webm$/.test(vt.url || "") && vt.crop?.v === 2, `${label}: Video: cropped and saved with its crop`, vt)
  await sleep(700)
  await p.screenshot({ path: join(shots, `media-wallpaper-${vp.width}-video.png`) })
  await tap("[data-wallpaper-delete]")
  const vgone = await p.evaluate(() => ({ type: window.__theme?.background_type, url: window.__theme?.background_video_url }))
  expect(!vgone.url, `${label}: Delete video: gone`, vgone)
  await p.close()
}

await browser.close()
server.close()
rmSync(mediaDir, { recursive: true, force: true })
console.log(`\nscreenshots: ${shots}`)
console.log(broken ? `\n${broken} FAILED` : "\nall passed")
process.exit(broken ? 1 : 0)
