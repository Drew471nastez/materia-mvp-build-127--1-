/**
 * ===========================================================================
 *  ROUND 15: THE FEED, ITS SPACE PILLS, ITS PICTURES AND ITS REFRESH, MEASURED
 * ===========================================================================
 * The real member frame and feed (scripts/render-communities-feed15.tsx)
 * served by a real HTTP server, at 390x844 (touch, 2x) and 1440x900, with
 * the CPU throttled 4x. Sections (all by default, or name them):
 *
 *   TAPS     taps on each pill, between two pills, just above and below one,
 *            and with a finger that drifts a few pixels: every tap must pick
 *            the pill it was nearest, exactly once (one address pushed)
 *   PRESS    the pressed pill's colour, frame by frame from the finger landing:
 *            something on the first frame, then an ease, never a jump
 *   FILL     the chosen pill's ink, frame by frame through a switch: one ink,
 *            moving calmly, and no pill changing its size or place
 *   REFRESH  a refresh that brings new counts for the same posts: cards and
 *            pictures must stay the same elements, and no picture on screen
 *            may be less than fully drawn on any frame
 *   PULL     the same through a real pull gesture, and how long the page takes
 *            to settle once the data is in
 *   SPEED    the first screen of pictures on a slow 4G profile (1.6Mbit,
 *            150ms) at both sizes, with screenshots of the same picture
 *   QUALITY  that picture at 390px, cut out of the screen, for looking at
 *
 *   PROBE_CSS=source node scripts/check-communities-feed15.mjs [SECTION ...]
 *   SHOTS_DIR=... keeps the screenshots; LABEL=before|after names them.
 */
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()))
const want = (s) => only.size === 0 || only.has(s)
const LABEL = process.env.LABEL || "now"
const PHOTOS = process.env.PHOTOS_DIR || "/tmp/claude-0/-home-user-DREW/4149d236-7d9f-55de-bc3e-49a9513a374e/scratchpad/p14/photos"
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-feed15-")), "shots")
mkdirSync(shots, { recursive: true })
const stubs = join(root, ".communities-feed15-probe")
mkdirSync(stubs, { recursive: true })

let broken = 0
const results = {}
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const say = (what, got) => console.log(`        ${what}: ${typeof got === "object" ? JSON.stringify(got) : got}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ── Real photographs, through the optimizer's own conversion ─────────────── */
const PHOTO_LIST = existsSync(PHOTOS) ? readdirSync(PHOTOS).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort() : []
if (!PHOTO_LIST.length) {
  console.log("no photographs to serve: set PHOTOS_DIR to a folder of real JPEGs")
  process.exit(1)
}
const photoBytes = PHOTO_LIST.map((f) => readFileSync(join(PHOTOS, f)))
const sharp = (await import(join(root, "node_modules/sharp/lib/index.js"))).default
const encoded = new Map()
/* Next's optimizer: AVIF at quality less 20 and effort 3, WebP at the quality itself (node_modules/next/dist/server/image-optimizer.js). */
async function optimize(buffer, width, quality, format) {
  const key = `${buffer.length}:${width}:${quality}:${format}`
  const held = encoded.get(key)
  if (held) return held
  const t = sharp(buffer).rotate().resize(width, undefined, { withoutEnlargement: true })
  const out = format === "avif" ? await t.avif({ quality: Math.max(quality - 20, 1), effort: 3 }).toBuffer() : await t.webp({ quality }).toBuffer()
  encoded.set(key, out)
  return out
}
function photoFor(url) {
  const name = decodeURIComponent(url).split("/").pop() || ""
  const n = (name.match(/(\d+)/g) || ["0"]).map(Number).reduce((a, b) => a + b, 0)
  return photoBytes[n % photoBytes.length]
}

/* ── The bundle ─────────────────────────────────────────────────────────── */
writeFileSync(
  join(stubs, "navigation.js"),
  `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: (h) => log("prefetch", h), back: () => log("back"), refresh: () => log("refresh") }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`,
)
writeFileSync(
  join(stubs, "link.jsx"),
  `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) {
  return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children)
})
`,
)
writeFileSync(
  join(stubs, "supabase-client.js"),
  `export function createClient() {
  return { channel() { const ch = { on: () => ch, subscribe: () => ch, track: async () => "ok", untrack: async () => "ok", send: async () => "ok", presenceState: () => ({}) }; return ch }, removeChannel() {}, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } }
}
export const isNativePlatform = () => false
`,
)
const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-communities-feed15.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": ".", "next/navigation": "./.communities-feed15-probe/navigation.js", "next/link": "./.communities-feed15-probe/link.jsx" },
  plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  loader: { ".css": "empty" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const jsGzip = gzipSync(readFileSync(join(stubs, "app.js")))
const css = await appCss(root)
const fonts = interFaces(root)
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Clay Studio</title><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style></head><body><div id="app"></div><script src="/app.js"></script></body></html>`
const htmlGzip = gzipSync(Buffer.from(html))

/* ── The server ─────────────────────────────────────────────────────────── */
const served = []
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1")
  if (url.pathname === "/app.js") {
    res.writeHead(200, { "content-type": "text/javascript", "content-encoding": "gzip", "cache-control": "no-store" })
    return res.end(jsGzip)
  }
  if (url.pathname === "/_next/image") {
    const src = url.searchParams.get("url") || ""
    const w = Number(url.searchParams.get("w") || 640)
    const q = Number(url.searchParams.get("q") || 75)
    const format = (req.headers.accept || "").includes("image/avif") ? "avif" : "webp"
    try {
      const out = await optimize(photoFor(src), w, q, format)
      served.push({ kind: "optimized", w, q, format, bytes: out.length, src })
      res.writeHead(200, { "content-type": `image/${format}`, "content-length": out.length, "cache-control": "public, max-age=31536000" })
      return res.end(out)
    } catch (e) {
      res.writeHead(500)
      return res.end(String(e))
    }
  }
  if (url.pathname.startsWith("/community/") || url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip", "cache-control": "no-store" })
    return res.end(htmlGzip)
  }
  res.writeHead(204)
  res.end()
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const ORIGIN = `http://127.0.0.1:${server.address().port}`
const PAGE = `${ORIGIN}/community/clay-studio`

const SLOW_4G = { offline: false, latency: 150, downloadThroughput: Math.round((1.6 * 1024 * 1024) / 8), uploadThroughput: Math.round((750 * 1024) / 8) }
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"], protocolTimeout: Number(process.env.PROTOCOL_MS || 180_000) })

async function open(viewport, { cpu = 4, network = null, cache = true, path = PAGE } = {}) {
  const p = await browser.newPage()
  await p.setViewport(viewport)
  await p.setCacheEnabled(cache)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 240)))
  if (process.env.DEBUG) p.on("console", (m) => console.log("    [page]", m.text()))
  const cdp = await p.target().createCDPSession()
  await cdp.send("Network.enable")
  if (network) await cdp.send("Network.emulateNetworkConditions", network)
  await p.goto(path, { waitUntil: "domcontentloaded" })
  await p.waitForSelector("[data-space-chip]", { timeout: 30_000 })
  await settlePictures(p, 20_000)
  if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
  await sleep(300)
  return { p, cdp, errors }
}

async function settlePictures(p, ms) {
  await p.evaluate(async (ms) => {
    const deadline = performance.now() + ms
    while (performance.now() < deadline) {
      const imgs = [...document.querySelectorAll("[data-feed-list] img")].filter((el) => {
        const b = el.getBoundingClientRect()
        return b.width > 24 && b.top < innerHeight && b.bottom > 0
      })
      if (imgs.every((el) => el.complete && el.naturalWidth > 0)) return
      await new Promise((r) => setTimeout(r, 50))
    }
  }, ms)
}

/** A finger: down at (x, y), optionally moved by (dx, dy) on the way, up where it ended. */
async function tap(cdp, x, y, { dx = 0, dy = 0, hold = 60, radius = 6 } = {}) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, radiusX: radius, radiusY: radius, force: 1, id: 1 }] })
  if (dx || dy) {
    await sleep(hold / 2)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + dx / 2, y: y + dy / 2, id: 1 }] })
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + dx, y: y + dy, id: 1 }] })
  }
  await sleep(hold / 2)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
}

const chipRects = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll("[data-space-chip]")].map((el) => {
      const b = el.getBoundingClientRect()
      return { id: el.getAttribute("data-space-chip"), left: b.left, right: b.right, top: b.top, bottom: b.bottom, on: el.getAttribute("aria-current") === "page" }
    }),
  )
const chosen = (p) => p.evaluate(() => document.querySelector("[data-space-chip][aria-current=page]")?.getAttribute("data-space-chip") ?? null)

try {
  /* ── TAPS ─────────────────────────────────────────────────────────────── */
  if (want("TAPS")) {
    for (const RADIUS of [1, 6]) {
    console.log(`\nTAPS on and between the space pills, a finger ${RADIUS * 2}px across, 390x844, CPU 4x [${LABEL}]`)
    const { p, cdp, errors } = await open(PHONE)
    await p.screenshot({ path: join(shots, `${LABEL}-open-390.png`) })
    await p.evaluate(() => {
      window.__ev = []
      for (const type of ["pointerdown", "pointerup", "pointercancel", "click"]) document.addEventListener(type, (e) => window.__ev.push(`${type}@${e.target.closest?.("[data-space-chip]")?.getAttribute("data-space-chip") ?? e.target.tagName}`), true)
    })
    /*
      THE ROW'S OWN HIT TEST, with no finger size: Chromium widens a touch to the nearest target (its touch adjustment, which
      is why the taps above land even in a gap on the old row), Safari does much less. Every pixel along the pills' middle
      line, and 4px above and below the pills, between the first pill and the last one wholly on screen: whose is it?
    */
    const strict = await p.evaluate(() => {
      const chips = [...document.querySelectorAll("[data-space-chip]")]
      const track = document.querySelector("[data-space-chips-track]").getBoundingClientRect()
      const boxes = chips.map((c) => c.getBoundingClientRect()).filter((b) => b.left >= track.left && b.right <= track.right - 24)
      const left = Math.ceil(boxes[0].left)
      const right = Math.floor(boxes[boxes.length - 1].right)
      const mid = (boxes[0].top + boxes[0].bottom) / 2
      /* 4px past the pill's outer edge: its hit area is 6px past its inner (padding) edge, a hairline inside that. */
      const lines = { middle: mid, above: boxes[0].top - 4, below: boxes[0].bottom + 4 }
      const out = {}
      for (const [name, y] of Object.entries(lines)) {
        let dead = 0
        let all = 0
        for (let x = left; x <= right; x++) {
          all++
          if (!document.elementFromPoint(x, y)?.closest("[data-space-chip]")) dead++
        }
        const c = boxes[1] ?? boxes[0]
        const hit = document.elementFromPoint((c.left + c.right) / 2, y)
        out[name] = { dead, all, atPillMiddle: hit?.closest("[data-space-chip]") ? "pill" : `${hit?.tagName}.${String(hit?.className).slice(0, 50)}` }
      }
      /* And every pixel inside each gap between two neighbouring pills, top to bottom of the pills. */
      let gapDead = 0
      let gapAll = 0
      for (let i = 0; i + 1 < boxes.length; i++) {
        for (let x = Math.ceil(boxes[i].right); x < boxes[i + 1].left; x++) {
          for (let y = Math.ceil(boxes[i].top); y < boxes[i].bottom; y += 4) {
            gapAll++
            if (!document.elementFromPoint(x, y)?.closest("[data-space-chip]")) gapDead++
          }
        }
      }
      out.gaps = { dead: gapDead, all: gapAll, pills: boxes.length }
      return out
    })
    say("points along the row that belong to no pill", strict)
    results[`strict${RADIUS}`] = strict
    expect(Object.values(strict).every((v) => v.dead === 0), "every point between and around the pills belongs to a pill", strict)
    const rows = []
    /* Keep the first chips in view: every tap is on a chip whose whole row of neighbours is on screen. */
    const plan = []
    const kinds = ["centre", "gap-left", "gap-right", "above", "below", "drift"]
    for (let k = 0; k < 4; k++) for (const kind of kinds) plan.push({ k, kind })
    const specFor = (rects, step) => {
      const a = rects[step.k + 1]
      const b = rects[step.k + 2]
      if (!a || !b) return null
      const mid = (a.right + b.left) / 2
      const cy = (a.top + a.bottom) / 2
      return {
        centre: { x: (a.left + a.right) / 2, y: cy, intended: a.id },
        "gap-left": { x: mid - 1.5, y: cy, intended: a.id },
        "gap-right": { x: mid + 1.5, y: cy, intended: b.id },
        above: { x: (a.left + a.right) / 2, y: a.top - 2, intended: a.id },
        below: { x: (a.left + a.right) / 2, y: a.bottom + 2, intended: a.id },
        drift: { x: (a.left + a.right) / 2, y: cy, dx: 5, dy: 3, intended: a.id },
      }[step.kind]
    }
    for (const step of plan) {
      let rects = await chipRects(p)
      let spec = specFor(rects, step)
      if (!spec) continue
      /* A pill already chosen takes no tap: choose All first (not counted), and measure the row again once it has moved. */
      if (rects.find((r) => r.on)?.id === spec.intended) {
        /* Another pill wholly on screen, never the one about to be tapped. */
        const other = rects.find((r) => r.id !== spec.intended && !r.on && (r.left + r.right) / 2 > 24 && (r.left + r.right) / 2 < 320)
        await tap(cdp, (other.left + other.right) / 2, (other.top + other.bottom) / 2)
        await sleep(1200)
        rects = await chipRects(p)
        spec = specFor(rects, step)
      }
      /* A tap under the row's fade or the sort button is not a tap on the row: the row is scrolled for the next one instead. */
      const trackRight = await p.evaluate(() => document.querySelector("[data-space-chips-track]").getBoundingClientRect().right)
      if (spec.x > trackRight - 28) continue
      const before = await p.evaluate(() => ((window.__ev.length = 0), window.__pushes.length))
      await tap(cdp, spec.x, spec.y, { dx: spec.dx, dy: spec.dy, radius: RADIUS })
      await sleep(900)
      const after = await p.evaluate(() => window.__pushes.length)
      const now = await chosen(p)
      const ev = await p.evaluate(() => window.__ev.join(" "))
      rows.push({ kind: step.kind, pill: spec.intended, pushes: after - before, chosen: now, ok: after - before === 1 && now === spec.intended, ev, at: [Math.round(spec.x), Math.round(spec.y)] })
      if (process.env.VERBOSE) say(step.kind, rows[rows.length - 1])
    }
    const byKind = {}
    for (const r of rows) {
      byKind[r.kind] ??= { taps: 0, once: 0, missed: 0, twice: 0, wrong: 0 }
      const t = byKind[r.kind]
      t.taps++
      if (r.ok) t.once++
      else if (r.pushes === 0) t.missed++
      else if (r.pushes > 1) t.twice++
      else t.wrong++
    }
    for (const [k, v] of Object.entries(byKind)) say(k, v)
    const total = rows.length
    const once = rows.filter((r) => r.ok).length
    results[`taps${RADIUS}`] = { total, once, byKind }
    expect(errors.length === 0, "no page error", errors.slice(0, 2))
    expect(once === total, "every tap picks the pill it was nearest, exactly once", `${once}/${total}`)
    const geometry = await p.evaluate(() => {
      const el = document.querySelector("[data-space-chip='general']")
      const b = el.getBoundingClientRect()
      const hit = getComputedStyle(el, "::after")
      return { h: Math.round(b.height), afterInset: [hit.left, hit.right, hit.top, hit.bottom] }
    })
    say("a pill's box and its hit area", geometry)

    await p.screenshot({ path: join(shots, `${LABEL}-taps-390.png`), clip: { x: 0, y: 0, width: 390, height: 420 } })
    await p.close()
    }
  }

  /* ── DRIFT: how far a finger may roll before the tap is lost, and what the browser said ── */
  if (want("DRIFT")) {
    console.log(`\nDRIFT: one pill, a finger that rolls a little further each time, 390x844, CPU 4x [${LABEL}]`)
    const { p, cdp } = await open(PHONE)
    await p.evaluate(() => {
      window.__ev = []
      for (const type of ["pointerdown", "pointerup", "pointercancel", "click"]) document.addEventListener(type, (e) => window.__ev.push(type), true)
      window.__scrolls = 0
      document.querySelector("[data-space-chips-track]").addEventListener("scroll", () => window.__scrolls++)
      addEventListener("scroll", () => window.__scrolls++)
      /* A touchmove the page cancelled (iOS sends no click after one) and how far the page itself moved under the finger. */
      window.__cancelled = 0
      addEventListener("touchmove", (e) => queueMicrotask(() => e.defaultPrevented && window.__cancelled++), { passive: true })
      window.__moved = 0
      const content = document.querySelector("[data-pull-content]")
      const look = () => {
        const wrap = content?.parentElement
        if (content && wrap) window.__moved = Math.max(window.__moved, Math.abs(content.getBoundingClientRect().top - wrap.getBoundingClientRect().top))
        requestAnimationFrame(look)
      }
      requestAnimationFrame(look)
    })
    const rows = []
    for (const [d, v] of [[0, 0], [2, 1], [4, 1], [6, 1], [8, 1], [10, 1], [0, 3], [0, 5], [5, 3], [3, 4]]) {
      const rects = await chipRects(p)
      const target = (await chosen(p)) === rects[1].id ? rects[2] : rects[1]
      await p.evaluate(() => {
        window.__ev.length = 0
        window.__scrolls = 0
        window.__cancelled = 0
        window.__moved = 0
      })
      const before = await p.evaluate(() => window.__pushes.length)
      await tap(cdp, (target.left + target.right) / 2, (target.top + target.bottom) / 2, { dx: d, dy: v })
      await sleep(900)
      const r = await p.evaluate(() => ({ ev: window.__ev.join(" "), scrolls: window.__scrolls, pushes: window.__pushes.length, cancelled: window.__cancelled, bump: window.__moved }))
      rows.push({ drift: `${d},${v}`, picked: r.pushes - before, events: r.ev, scrolled: r.scrolls, movesCancelled: r.cancelled, pageMovedPx: Math.round(r.bump * 10) / 10 })
    }
    for (const r of rows) say(`drift ${r.drift}px`, r)
    /*
      WHAT AN iPHONE SENDS. Chromium keeps a small roll's touchmoves from the page (its slop), Safari does not: every pixel is a
      touchmove the page may cancel, and a cancelled one means no click. Sent here as Safari sends them, on the pill itself.
    */
    const ios = []
    for (const [dx, dy] of [[0, 2], [0, 4], [1, 6], [3, 3], [6, 1]]) {
      ios.push(
        await p.evaluate(
          async (dx, dy) => {
            const chip = document.querySelector("[data-space-chip][aria-current] ~ [data-space-chip]") || document.querySelectorAll("[data-space-chip]")[2]
            const b = chip.getBoundingClientRect()
            const x = b.left + b.width / 2
            const y = b.top + b.height / 2
            const touch = (cx, cy) => new Touch({ identifier: 7, target: chip, clientX: cx, clientY: cy, pageX: cx, pageY: cy + scrollY })
            const send = (type, t) => {
              const e = new TouchEvent(type, { bubbles: true, cancelable: true, composed: true, touches: t ? [t] : [], targetTouches: t ? [t] : [], changedTouches: [t ?? touch(x + dx, y + dy)] })
              chip.dispatchEvent(e)
              return e.defaultPrevented
            }
            window.__moved = 0
            send("touchstart", touch(x, y))
            let cancelled = 0
            const steps = Math.max(Math.abs(dx), Math.abs(dy))
            for (let i = 1; i <= steps; i++) {
              if (send("touchmove", touch(x + (dx * i) / steps, y + (dy * i) / steps))) cancelled++
              await new Promise((r) => requestAnimationFrame(r))
            }
            send("touchend", null)
            await new Promise((r) => setTimeout(r, 500))
            return { roll: `${dx},${dy}`, movesCancelled: cancelled, pageMovedPx: Math.round(window.__moved * 10) / 10 }
          },
          dx,
          dy,
        ),
      )
    }
    for (const r of ios) say(`as Safari sends it, roll ${r.roll}`, r)
    results.iosRoll = ios
    expect(ios.every((r) => r.movesCancelled === 0), "no move of a tap on a pill is cancelled (Safari would send no click)", ios.map((r) => [r.roll, r.movesCancelled]))
    expect(ios.every((r) => r.pageMovedPx < 0.5), "the page does not move under a rolling tap (no bump)", ios.map((r) => [r.roll, r.pageMovedPx]))
    say("pull wrapper", await p.evaluate(() => ({ y: scrollY, ptr: [...document.querySelectorAll("[data-pull-to-refresh]")].map((e) => e.getAttribute("data-ptr-off") ?? "on"), lockedAttr: document.documentElement.hasAttribute("data-scroll-locked"), sheet: !!document.querySelector("[data-app-sheet='open']") })))
    results.drift = rows
    expect(rows.every((r) => r.picked === 1), "a finger rolling up to 10px is still one tap", rows.map((r) => [r.drift, r.picked]))
    expect(rows.every((r) => r.pageMovedPx < 0.5), "the page never moves under a tap (no bump)", rows.map((r) => [r.drift, r.pageMovedPx]))
    await p.close()
  }

  /* ── PRESS ────────────────────────────────────────────────────────────── */
  if (want("PRESS")) {
    console.log(`\nPRESS: the pressed pill's colour from the frame the finger lands, 390x844, CPU 4x [${LABEL}]`)
    const { p, cdp } = await open(PHONE)
    const rects = await chipRects(p)
    const a = rects[1]
    await p.evaluate((id) => {
      const el = document.querySelector(`[data-space-chip='${id}']`)
      const out = (window.__press = [])
      const t0 = performance.now()
      const layer = el.querySelector("[data-chip-press]")
      const look = () => {
        const cs = getComputedStyle(el)
        /* What the eye sees: the pill's own ground, with the press layer (if any) over it at its opacity. */
        let bg = cs.backgroundColor
        if (layer) {
          const o = Number(getComputedStyle(layer).opacity)
          const m = /(\d+), (\d+), (\d+)/.exec(getComputedStyle(layer).backgroundColor)
          const base = /(\d+), (\d+), (\d+)/.exec(bg)
          if (m && base) bg = `rgb(${[1, 2, 3].map((k) => Math.round(Number(base[k]) * (1 - o) + Number(m[k]) * o)).join(", ")})`
        }
        out.push({ t: Math.round(performance.now() - t0), bg, pressed: el.hasAttribute("data-pressed") })
        if (out.length < 40) requestAnimationFrame(look)
      }
      el.addEventListener("pointerdown", () => {
        out.length = 0
        window.__downAt = performance.now()
        requestAnimationFrame(look)
      }, { once: true })
    }, a.id)
    /* Held, not released: what a finger resting on a pill sees. */
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: (a.left + a.right) / 2, y: (a.top + a.bottom) / 2, id: 1 }] })
    await sleep(900)
    const frames = await p.evaluate(() => window.__press)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    const grey = (bg) => {
      const m = /(\d+), (\d+), (\d+)/.exec(bg)
      return m ? Number(m[1]) : 255
    }
    const values = frames.map((f) => grey(f.bg))
    const rest = 255
    const firstChange = values.findIndex((v) => v !== rest)
    const end = values[values.length - 1]
    const distinct = [...new Set(values)].length
    const firstFrameShare = firstChange === 0 && end !== rest ? (rest - values[0]) / (rest - end) : null
    const settleAt = frames[values.findIndex((v) => v === end)]?.t
    say("the red channel per frame", values.slice(0, 16))
    say("frame times", frames.slice(0, 16).map((f) => f.t))
    results.press = { firstChange, distinct, firstFrameShare, settleAt, end }
    expect(firstChange === 0, "the press shows on the first frame after the finger lands", firstChange)
    expect(distinct >= 4, "it eases in over several frames, not one jump", distinct)
    expect(firstFrameShare !== null && firstFrameShare < 0.6, "the first frame is part of the way, not the whole colour", firstFrameShare)
    await p.close()
  }

  /* ── FILL ─────────────────────────────────────────────────────────────── */
  if (want("FILL")) {
    for (const [name, vp] of [["390", PHONE], ["1440", DESK]]) {
      console.log(`\nFILL: the chosen pill's ink through a switch, ${name}, CPU 4x [${LABEL}]`)
      const { p, cdp } = await open(vp)
      const rects = await chipRects(p)
      const from = rects[0]
      const to = rects[2]
      await p.evaluate(() => {
        const out = (window.__fill = [])
        const t0 = performance.now()
        const look = () => {
          const chips = [...document.querySelectorAll("[data-space-chip]")]
          const inks = [...document.querySelectorAll("[data-chip-fill], [data-chip-ink], [data-pill-glider]")].map((f) => {
            /* The gliding ink is three pieces: its box is theirs together. */
            const parts = f.hasAttribute("data-chip-ink") ? [...f.children].map((c) => c.getBoundingClientRect()) : [f.getBoundingClientRect()]
            const left = Math.min(...parts.map((b) => b.left))
            const right = Math.max(...parts.map((b) => b.right))
            return { o: Number(getComputedStyle(f).opacity), l: Math.round(left * 10) / 10, w: Math.round((right - left) * 10) / 10 }
          })
          out.push({
            t: Math.round(performance.now() - t0),
            ink: inks.reduce((n, i) => n + (i.w > 0 ? i.o : 0), 0),
            inks: inks.filter((i) => i.o > 0.02 && i.w > 0),
            /* Each pill's place in its row and its size (the row itself may glide sideways to bring the chosen one into view). */
            chips: chips.map((c) => [c.offsetLeft, Math.round(c.getBoundingClientRect().width * 10) / 10, c.offsetTop, Math.round(c.getBoundingClientRect().height * 10) / 10]),
            words: chips.map((c) => getComputedStyle(c).color),
          })
          if (out.length < 70) requestAnimationFrame(look)
        }
        requestAnimationFrame(look)
      })
      /*
        WHAT REACHES THE SCREEN. The samples above are the page's own view, taken on its thread; the ink moves on the
        compositor, which keeps drawing while that thread is busy building the new list. The screencast is the composited
        frames themselves: the ink is found in each by its colour along the pills' middle line.
      */
      const cast = []
      const onFrame = (f) => {
        cast.push({ data: f.data, t: f.metadata.timestamp })
        void cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
      }
      cdp.on("Page.screencastFrame", onFrame)
      await p.evaluate(() => {
        window.__long = []
        try {
          new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: "longtask" })
        } catch {}
        window.__upAt = 0
        document.addEventListener("pointerup", () => (window.__upAt = performance.now()), { capture: true, once: true })
        document.addEventListener("click", () => (window.__upAt ||= performance.now()), { capture: true, once: true })
        window.__inkAt = 0
        const watch = () => {
          const ink = document.querySelector("[data-chip-ink]")
          if (ink && ink.style.opacity === "1" && !window.__inkAt) window.__inkAt = performance.now()
          if (!window.__inkAt) requestAnimationFrame(watch)
        }
        requestAnimationFrame(watch)
      })
      await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 })
      await sleep(250)
      if (vp.hasTouch) await tap(cdp, (to.left + to.right) / 2, (to.top + to.bottom) / 2)
      else await p.mouse.click((to.left + to.right) / 2, (to.top + to.bottom) / 2)
      await sleep(1600)
      await cdp.send("Page.stopScreencast")
      cdp.off("Page.screencastFrame", onFrame)
      /* A line through the pills above their words (the white words would break the ink's run). */
      const lineY = to.top + 5
      const trackBox = await p.evaluate(() => {
        const b = document.querySelector("[data-space-chips-track]").getBoundingClientRect()
        return { left: b.left, right: b.right }
      })
      cast.sort((a, b) => a.t - b.t)
      const band = { top: Math.max(0, Math.floor(to.top - 14)), bottom: Math.ceil(to.bottom + 14) }
      const seen = []
      const crops = []
      for (const f of cast) {
        const buf = Buffer.from(f.data, "base64")
        const img = sharp(buf)
        const meta = await img.metadata()
        const scale = meta.width / vp.width
        const { data, info } = await img.clone().raw().toBuffer({ resolveWithObject: true })
        const y = Math.round(lineY * scale)
        let best = null
        let run = null
        for (let x = Math.max(0, Math.floor(trackBox.left * scale)); x < Math.min(info.width, Math.ceil(trackBox.right * scale)); x++) {
          const i = (y * info.width + x) * info.channels
          const dark = data[i] < 70 && data[i + 1] < 70 && data[i + 2] < 90
          if (dark) run = run ? { ...run, r: x } : { l: x, r: x }
          if ((!dark || x === Math.min(info.width, Math.ceil(trackBox.right * scale)) - 1) && run) {
            if (!best || run.r - run.l > best.r - best.l) best = run
            run = null
          }
        }
        const left = best ? Math.round((best.l / scale) * 10) / 10 : null
        const width = best ? Math.round(((best.r - best.l) / scale) * 10) / 10 : null
        const last = seen[seen.length - 1]
        if (!last || last.left !== left || last.width !== width) {
          seen.push({ t: Math.round((f.t - cast[0].t) * 1000), left, width })
          if (crops.length < 24) crops.push(await sharp(buf).extract({ left: 0, top: Math.round(band.top * scale), width: meta.width, height: Math.round((band.bottom - band.top) * scale) }).png().toBuffer())
        }
      }
      if (crops.length) {
        const metas = await Promise.all(crops.map((c) => sharp(c).metadata()))
        const h = metas.reduce((n, m) => n + m.height + 4, 0)
        let top = 0
        await sharp({ create: { width: metas[0].width, height: h, channels: 3, background: "#ff3366" } })
          .composite(crops.map((c, i) => {
            const at = top
            top += metas[i].height + 4
            return { input: c, left: 0, top: at }
          }))
          .png()
          .toFile(join(shots, `${LABEL}-fill-frames-${name}.png`))
      }
      const screenLefts = seen.map((x) => x.left).filter((x) => x !== null)
      const screenSteps = screenLefts.slice(1).map((l, i) => Math.abs(l - screenLefts[i]))
      const timing = await p.evaluate(() => ({ releaseToGlide: window.__inkAt && window.__upAt ? Math.round(window.__inkAt - window.__upAt) : null, longTasks: window.__long.filter(([t]) => t >= window.__upAt - 5) }))
      say("from the finger lifting to the ink starting to move (the page's frame)", `${timing.releaseToGlide}ms`)
      say("long tasks after the release", timing.longTasks)
      results[`fillTiming${name}`] = timing
      say("on screen: the ink's left edge and width in each new frame", seen.map((x) => `${x.t}ms ${x.left}/${x.width}`))
      results[`fillScreen${name}`] = seen
      const frames = await p.evaluate(() => window.__fill)
      const moving = frames.filter((f) => f.inks.length)
      const maxInk = Math.max(...frames.map((f) => f.ink))
      const minInk = Math.min(...frames.map((f) => f.ink))
      /* Layout shift: every chip's left and width, against the first frame. */
      const first = frames[0].chips
      const shift = Math.max(...frames.flatMap((f) => f.chips.map((c, i) => Math.max(...c.map((v, k) => Math.abs(v - first[i][k]))))))
      /* The ink's journey: its left edge (one moving ink) or its opacity (a crossfade), frame to frame. */
      const lefts = moving.map((f) => (f.inks.length === 1 ? f.inks[0].l : null)).filter((x) => x !== null)
      const steps = lefts.slice(1).map((l, i) => Math.abs(l - lefts[i]))
      const travel = Math.abs(to.left - from.left)
      const biggest = steps.length ? Math.max(...steps) : null
      const changing = frames.filter((f, i) => i > 0 && JSON.stringify(f.inks) !== JSON.stringify(frames[i - 1].inks))
      const duration = changing.length ? changing[changing.length - 1].t - changing[0].t : 0
      say("ink on screen (sum of opacity), lowest and highest", [Math.round(minInk * 100) / 100, Math.round(maxInk * 100) / 100])
      say("the ink's left edge per frame", lefts.slice(0, 30))
      say("frames the ink changed in, over", `${changing.length} frames, ${duration}ms`)
      say("the biggest single frame step of the ink, of the distance", biggest === null ? "n/a" : `${biggest.toFixed(1)} of ${travel.toFixed(1)}px`)
      results[`fill${name}`] = { minInk, maxInk, shift, biggest, travel, duration, frames: changing.length }
      expect(shift < 0.5, "no pill moves or changes size while one is chosen (no layout shift)", shift)
      expect(maxInk < 1.25, "never two inks on screen at once", maxInk)
      expect(minInk > 0.75, "never a frame with no ink", minInk)
      expect(duration >= 180, "the ink moves over more than a few frames", `${duration}ms`)
      const bigScreen = screenSteps.length ? Math.max(...screenSteps) : null
      say("on screen, the biggest single frame step of the ink", bigScreen === null ? "n/a" : `${bigScreen.toFixed(1)} of ${travel.toFixed(1)}px over ${screenSteps.length} steps`)
      say("frame sequence", join(shots, `${LABEL}-fill-frames-${name}.png`))
      expect(bigScreen !== null && bigScreen < travel * 0.35, "on screen, no single frame jumps the ink more than a third of the way", bigScreen)
      expect(seen.every((x) => x.left !== null), "on screen, never a frame with no ink", seen.filter((x) => x.left === null).length)
      await p.screenshot({ path: join(shots, `${LABEL}-fill-${name}.png`), clip: { x: 0, y: 0, width: vp.width, height: Math.min(480, vp.height) } })
      await p.close()
    }
  }

  /* ── REFRESH ──────────────────────────────────────────────────────────── */
  const refreshRun = async (vp, name, how) => {
    const { p, cdp, errors } = await open(vp)
    /* Down to where two cards with pictures are on screen, every picture there drawn. */
    await p.evaluate(() => window.scrollTo(0, 420))
    await sleep(400)
    await settlePictures(p, 10_000)
    await sleep(400)
    await p.evaluate(() => {
      const tag = (sel, key) => document.querySelectorAll(sel).forEach((el, i) => (el[key] = `${key}${i}`))
      tag("[data-feed-list] > [data-post]", "__card")
      tag("[data-feed-list] img", "__img")
      window.__cardsBefore = document.querySelectorAll("[data-feed-list] > [data-post]").length
      const out = (window.__frames = [])
      const t0 = performance.now()
      window.__t0 = t0
      const look = () => {
        const imgs = [...document.querySelectorAll("[data-feed-list] img")].filter((el) => {
          const b = el.getBoundingClientRect()
          return b.width > 24 && b.bottom > 0 && b.top < innerHeight
        })
        const dim = imgs.filter((el) => {
          let o = 1
          for (let n = el; n && n !== document.body; n = n.parentElement) o *= Number(getComputedStyle(n).opacity)
          return o < 0.99 || !el.complete || el.naturalWidth === 0
        })
        const fresh = imgs.filter((el) => !el.__img)
        const cards = [...document.querySelectorAll("[data-feed-list] > [data-post]")]
        const content = document.querySelector("[data-pull-content]")
        /* How far the pull holds the page down: the content's top against its wrapper's. */
        const tf = content ? Math.round((content.getBoundingClientRect().top - content.parentElement.getBoundingClientRect().top) * 10) / 10 : 0
        out.push({ t: Math.round(performance.now() - t0), tf, dim: dim.length, freshImgs: fresh.length, freshCards: cards.filter((c) => !c.__card).length, y: Math.round(scrollY), count: document.querySelector("[data-feed-list] [data-post] [data-like-count], [data-feed-list] [data-post] button[aria-pressed]")?.textContent ?? "" })
        if (performance.now() - t0 < 4000) requestAnimationFrame(look)
      }
      requestAnimationFrame(look)
    })
    const started = Date.now()
    await p.evaluate(() => window.__bump())
    let doneAt = null
    if (how === "event") {
      doneAt = await p.evaluate(async () => {
        const detail = { scope: "community-feed" }
        if (window.__refreshFeed) await window.__refreshFeed()
        else {
          window.dispatchEvent(new CustomEvent("storelib:pull-refresh", { detail }))
          await Promise.resolve(detail.done)
        }
        return Math.round(performance.now() - window.__t0)
      })
    } else {
      /* A real pull from the top: up there first. */
      await p.evaluate(() => window.scrollTo(0, 0))
      await sleep(300)
      const x = 200
      let y = 240
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] })
      for (let i = 0; i < 14; i++) {
        y += 14
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id: 1 }] })
        await sleep(16)
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    }
    await sleep(3200)
    const frames = await p.evaluate(() => window.__frames)
    const reads = await p.evaluate(() => window.__reads)
    const settled = await p.evaluate(() => {
      const c = document.querySelector("[data-pull-content]")
      return c ? Math.round((c.getBoundingClientRect().top - c.parentElement.getBoundingClientRect().top) * 10) / 10 : 0
    })
    const flash = frames.filter((f) => f.dim > 0)
    const remountCards = Math.max(...frames.map((f) => f.freshCards))
    const remountImgs = Math.max(...frames.map((f) => f.freshImgs))
    say("frames sampled", frames.length)
    say("frames with a picture on screen less than fully drawn", flash.length ? flash.slice(0, 6) : 0)
    say("cards and pictures that became new elements", { cards: remountCards, pictures: remountImgs })
    if (doneAt !== null) say("the data was in at", `${doneAt}ms`)
    results[`refresh-${how}-${name}`] = { flashFrames: flash.length, remountCards, remountImgs, doneAt, reads }
    expect(errors.length === 0, "no page error", errors.slice(0, 2))
    expect(flash.length === 0, "no frame with a picture flashing during the refresh", flash.length)
    expect(remountCards === 0 && remountImgs === 0, "the same cards and pictures, patched in place", { remountCards, remountImgs })
    if (how === "pull") {
      /* The page home and still: the content back at rest, and how long after the release it took. */
      const moves = frames.filter((f, i) => i > 0 && f.y !== frames[i - 1].y)
      say("the content wrapper at rest", settled)
      expect(settled === 0, "the pull settles home", settled)
      say("scroll moves after the pull", moves.length)
      /* How long the page stayed held after the data was in: the last read's answer, then the first frame back at rest. */
      const readAt = await p.evaluate(() => (window.__readAt ? Math.round(window.__readAt - window.__t0) : null))
      const pulled = frames.findIndex((f) => f.tf > 0)
      const home = frames.findIndex((f, i) => i > pulled && f.t >= (readAt ?? 0) && f.tf === 0)
      const settleMs = readAt !== null && home >= 0 ? frames[home].t - readAt : null
      say("the data was in at, and the page home", { readAt, homeAt: home >= 0 ? frames[home].t : null, after: settleMs, deepest: Math.max(...frames.map((f) => f.tf)) })
      results["pull-settle-390"] = { readAt, settleMs }
      expect(settleMs !== null && settleMs < 700, "the page is home within 700ms of the data being in (the spinner's floor and its spring)", settleMs)
    }
    return { p, frames }
  }
  if (want("REFRESH")) {
    for (const [name, vp] of [["390", PHONE], ["1440", DESK]]) {
      console.log(`\nREFRESH in place, ${name}, CPU 4x [${LABEL}]`)
      const { p } = await refreshRun(vp, name, "event")
      await p.close()
    }
  }
  if (want("PULL")) {
    console.log(`\nPULL to refresh by touch, 390x844, CPU 4x [${LABEL}]`)
    const { p } = await refreshRun(PHONE, "390", "pull")
    await p.screenshot({ path: join(shots, `${LABEL}-pull-390.png`) })
    await p.close()
  }

  /* ── SEARCH: the results drawn, to be looked at, at both sizes ── */
  if (want("SEARCH")) {
    console.log(`\nSEARCH: "glaze" in the community's search [${LABEL}]`)
    {
      const p = await browser.newPage()
      await p.setViewport(DESK)
      await p.goto(PAGE, { waitUntil: "domcontentloaded" })
      await p.waitForSelector("input[placeholder^='Search']")
      await sleep(500)
      await p.click("input[placeholder^='Search']")
      await p.keyboard.type("glaze", { delay: 40 })
      await p.waitForSelector("[data-search-results][data-search-source=server]", { timeout: 8000 }).catch(() => {})
      await sleep(500)
      const rows = await p.evaluate(() => [...document.querySelectorAll("[data-search-option]")].map((el) => ({ group: el.getAttribute("data-search-option"), h: Math.round(el.getBoundingClientRect().height) })))
      say("1440 rows", rows)
      const panel = await p.evaluate(() => {
        const el = document.querySelector("[data-community-search-panel]")
        if (!el) return null
        const cs = getComputedStyle(el)
        const b = el.getBoundingClientRect()
        const chain = []
        for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
          const c = getComputedStyle(n)
          if (c.opacity !== "1" || c.zIndex !== "auto" || c.backdropFilter !== "none" || c.mixBlendMode !== "normal") chain.push([n.tagName, (n.className.baseVal ?? n.className).slice(0, 60), c.opacity, c.zIndex, c.mixBlendMode])
        }
        const at = document.elementFromPoint(b.left + 200, b.top + 120)
        return { opacity: cs.opacity, bg: cs.backgroundColor, animation: cs.animationName, list: getComputedStyle(el.firstElementChild).opacity, anims: el.getAnimations().map((a) => [a.animationName, a.playState, a.currentTime]), at: at?.closest("[data-community-search-panel]") ? "panel" : at?.outerHTML.slice(0, 120), chain }
      })
      say("the panel", panel)
      expect(panel && Number(panel.opacity) === 1 && panel.bg === "rgb(255, 255, 255)", "the results panel is opaque white once it is up", panel)
      await sleep(300)
      await p.screenshot({ path: join(shots, `${LABEL}-search-1440.png`), clip: { x: 300, y: 0, width: 840, height: 720 }, captureBeyondViewport: false })
      await p.close()
    }
    {
      const p = await browser.newPage()
      await p.setViewport(PHONE)
      await p.goto(PAGE, { waitUntil: "domcontentloaded" })
      await p.waitForSelector("[data-space-chip]")
      await sleep(500)
      /* The phone's search screen opens from the tab bar through the bridge (lib/nav/community-search-bridge.ts); its button in the bar does the same. */
      const opened = await p.evaluate(() => {
        return window.__openSearch()
      })
      await sleep(600)
      const field = await p.$("[data-community-search-screen] input")
      if (field) {
        await field.type("glaze", { delay: 40 })
        await p.waitForSelector("[data-search-results][data-search-source=server]", { timeout: 8000 }).catch(() => {})
        await sleep(700)
      }
      say("390 opened", { opened, field: !!field })
      const rows = await p.evaluate(() => [...document.querySelectorAll("[data-search-option]")].map((el) => ({ group: el.getAttribute("data-search-option"), h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width) })))
      say("390 rows", rows)
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      expect(overflow <= 0, "no sideways overflow on the phone", overflow)
      expect(rows.every((r) => r.h >= 44), "every result row is at least 44px tall on a phone", rows.map((r) => r.h))
      await p.screenshot({ path: join(shots, `${LABEL}-search-390.png`) })
      await p.close()
    }
  }

  /* ── SLOTS: what each picture's box measures at each width, against what its `sizes` says ── */
  if (want("SLOTS")) {
    console.log(`\nSLOTS: each picture's box, and the width its sizes attribute claims [${LABEL}]`)
    const p = await browser.newPage()
    await p.setViewport(PHONE)
    await p.goto(PAGE, { waitUntil: "domcontentloaded" })
    await p.waitForSelector("[data-feed-list] [data-card-media]")
    const rows = []
    for (const width of (process.env.SLOT_WIDTHS || "360,390,430,640,768,1023,1024,1100,1279,1280,1300,1350,1376,1400,1440,1920").split(",").map(Number)) {
      await p.setViewport({ width, height: 900, deviceScaleFactor: 1, isMobile: width < 640, hasTouch: width < 640 })
      await sleep(400)
      const boxes = await p.evaluate(() => {
        const out = {}
        const note = (name, el) => {
          if (!el || out[name]) return
          const img = el.querySelector("img")
          const b = el.getBoundingClientRect()
          if (b.width < 1) return
          /* What the browser makes of the sizes attribute: the img's own sizes, read through a probe img of that sizes. */
          const probe = document.createElement("img")
          probe.sizes = img?.getAttribute("sizes") ?? ""
          out[name] = { box: Math.round(b.width), sizes: img?.getAttribute("sizes") ?? null }
        }
        note("cardSingle", document.querySelector("[data-card-media='single']"))
        const pair = document.querySelector("[data-card-media='pair'] [data-card-media-tile]")
        note("cardHalf", pair)
        const grid = document.querySelectorAll("[data-card-media='grid'] [data-card-media-tile]")
        note("cardGridLead", grid[0])
        note("cardGridSmall", grid[1])
        note("cardThumb", document.querySelector("[data-post-thumb]"))
        return out
      })
      rows.push({ width, ...Object.fromEntries(Object.entries(boxes).map(([k, v]) => [k, v.box])) })
      if (width === 390 || width === 1440) say(`sizes at ${width}`, Object.fromEntries(Object.entries(boxes).map(([k, v]) => [k, v.sizes])))
    }
    console.table(rows)
    results.slots = rows
    await p.close()
  }

  /* ── SPEED and QUALITY ────────────────────────────────────────────────── */
  if (want("QUALITY")) {
    /*
      THE SAME PICTURE AS A PHONE DRAWS IT, to be looked at: a fresh page at 390px on a 3x screen (an iPhone) and on a 2x one,
      the first card's picture cut out of the screen as it was painted, and the file it came from.
    */
    console.log(`\nQUALITY: the first card's picture at 390px, 3x and 2x [${LABEL}]`)
    for (const dpr of [3, 2]) {
      const p = await browser.newPage()
      await p.setViewport({ ...PHONE, deviceScaleFactor: dpr })
      await p.goto(PAGE, { waitUntil: "domcontentloaded" })
      await p.waitForSelector("[data-feed-list] [data-card-media]")
      await settlePictures(p, 30_000)
      await sleep(900)
      const box = await p.evaluate(() => {
        const el = document.querySelector("[data-feed-list] [data-card-media='single']")
        const b = el.getBoundingClientRect()
        const img = el.querySelector("img")
        return { x: b.left, y: b.top + scrollY, width: b.width, height: b.height, file: img?.currentSrc.replace(location.origin, ""), w: Number(/[?&]w=(\d+)/.exec(img?.currentSrc ?? "")?.[1] ?? 0), q: Number(/[?&]q=(\d+)/.exec(img?.currentSrc ?? "")?.[1] ?? 0) }
      })
      const el = await p.$("[data-feed-list] [data-card-media='single']")
      await el.scrollIntoView()
      await sleep(400)
      await el.screenshot({ path: join(shots, `${LABEL}-quality-390-${dpr}x.png`) })
      say(`${dpr}x: the file drawn in a ${Math.round(box.width)}px box`, { w: box.w, q: box.q })
      results[`quality${dpr}x`] = { w: box.w, q: box.q, box: Math.round(box.width) }
      await p.close()
    }
  }

  if (want("SPEED")) {
    const REPEATS = Number(process.env.REPEATS || 3)
    const median = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)]
    for (const [name, vp] of [["390", PHONE], ["1440", DESK]]) {
      console.log(`\nSPEED: the first screen of pictures, ${name}, slow 4G, CPU 4x [${LABEL}]`)
      /* Fill the probe's encoder first, so no measured run waits on sharp. */
      {
        const warm = await browser.newPage()
        await warm.setViewport(vp)
        await warm.goto(PAGE, { waitUntil: "domcontentloaded" })
        await warm.waitForSelector("[data-feed-list]")
        await settlePictures(warm, 30_000)
        await warm.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
        await sleep(1500)
        await settlePictures(warm, 30_000)
        await warm.close()
      }
      const runs = []
      for (let i = 0; i < REPEATS; i++) {
        served.length = 0
        const p = await browser.newPage()
        await p.setViewport(vp)
        await p.setCacheEnabled(false)
        const cdp = await p.target().createCDPSession()
        await cdp.send("Network.enable")
        await cdp.send("Network.emulateNetworkConditions", SLOW_4G)
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
        await p.goto(PAGE, { waitUntil: "domcontentloaded" })
        const r = await p.evaluate(async () => {
          const firstScreen = () =>
            [...document.querySelectorAll("[data-feed-list] img")].filter((el) => {
              const b = el.getBoundingClientRect()
              return b.width > 24 && b.top < innerHeight && b.bottom > 0
            })
          const deadline = performance.now() + 40_000
          let pics = []
          while (performance.now() < deadline) {
            const imgs = firstScreen()
            if (imgs.length && imgs.every((el) => el.complete && el.naturalWidth > 0)) {
              pics = imgs.map((el) => ({ w: Math.round(el.getBoundingClientRect().width), natural: Number(/[?&]w=(\d+)/.exec(el.currentSrc)?.[1] ?? el.naturalWidth), src: el.currentSrc.replace(location.origin, "").slice(0, 120) }))
              break
            }
            await new Promise((res) => setTimeout(res, 25))
          }
          const paint = performance.getEntriesByType("paint").find((e) => e.name === "first-contentful-paint")
          return { firstScreenMs: Math.round(performance.now()), fcpMs: paint ? Math.round(paint.startTime) : null, pics }
        })
        const bytes = served.reduce((n, s) => n + s.bytes, 0)
        runs.push({ ...r, bytes, widths: [...new Set(served.map((s) => s.w))].sort((a, b) => a - b), qualities: [...new Set(served.map((s) => s.q))], requests: served.length })
        if (i === REPEATS - 1) {
          await p.screenshot({ path: join(shots, `${LABEL}-speed-${name}.png`) })
        }
        await p.close()
      }
      const m = {
        firstScreenMs: median(runs.map((r) => r.firstScreenMs)),
        fcpMs: median(runs.map((r) => r.fcpMs ?? 0)),
        bytes: median(runs.map((r) => r.bytes)),
        runs: runs.map((r) => r.firstScreenMs),
        widths: runs[runs.length - 1].widths,
        qualities: runs[runs.length - 1].qualities,
        requests: runs[runs.length - 1].requests,
        pics: runs[runs.length - 1].pics,
      }
      say("time to the first screen of pictures", `${m.firstScreenMs}ms (runs ${JSON.stringify(m.runs)})`)
      say("first contentful paint", `${m.fcpMs}ms`)
      say("picture bytes in that time", `${Math.round(m.bytes / 1024)}KB in ${m.requests} requests`)
      say("file widths asked for", m.widths)
      say("qualities", m.qualities)
      say("first screen pictures", m.pics.map((x) => `${x.w}px box <- ${x.natural}px file`))
      results[`speed${name}`] = m
      expect(m.firstScreenMs > 0 && m.firstScreenMs < 30_000, "the first screen settles", m.firstScreenMs)
      if (name === "390") expect(!m.widths.some((w) => w > 828), "no file wider than 828 on a phone at 2x", m.widths)
    }
  }
} finally {
  await browser.close()
  server.close()
}

writeFileSync(join(shots, `${LABEL}-results.json`), JSON.stringify(results, null, 2))
console.log(`\n${broken ? `${broken} broken` : "all good"}; screenshots and ${LABEL}-results.json in ${shots}`)
process.exit(broken ? 1 : 0)
