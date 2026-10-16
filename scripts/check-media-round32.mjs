/**
 * ===========================================================================
 *  ROUND 32: A POST'S PICTURES AND VIDEOS, MEASURED FRAME BY FRAME
 * ===========================================================================
 * The real shell, feed, opened post and viewer (scripts/render-media-round32.tsx)
 * in headless Chromium, every picture through the image route as in
 * production (answered here with real JPEGs, late when a part says so):
 *
 *   VIEWER   a picture opened from an opened post and closed again, on a
 *            phone and a computer, by a press on the black, Escape and a
 *            swipe down. On every frame: how many copies of the picture can
 *            be seen (one, never two, never none), the flying box (its place,
 *            its size, its corners) and the black's opacity. The box moves
 *            one way only, keeps the picture's shape when the post shows the
 *            picture whole, starts and lands on the picture as the post shows
 *            it (not on its tile's box), and the black fades on its own.
 *   VIDEO    an opened post's video: with its poster fetched ahead, the
 *            poster is there in the first frame of the post; with nothing
 *            fetched (the post opened cold, the poster late), a quiet ground
 *            and no play mark until the poster, which comes in the frame
 *            after it is decoded; a video with no still shows the frame the
 *            card kept in its first frame, and cold, its frame within a frame
 *            of loadeddata. No flat grey box, no box larger than the poster,
 *            one height from the first frame. A press on play hands the
 *            player the poster file already on screen.
 *   REDUCED  with reduced motion the viewer fades in and out, nothing flies.
 *
 *   PROBE_CSS=source node scripts/check-media-round32.mjs [part ...]
 *   SHOTS_DIR=/tmp/r32 to keep the pictures somewhere chosen (a temp folder otherwise, printed at the end)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const ORIGIN = "https://storelib.com"
const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()))
const want = (s) => only.size === 0 || only.has(s)
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-r32-")), "shots")
mkdirSync(shots, { recursive: true })
const stubs = join(root, ".media-r32-probe")
mkdirSync(stubs, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const PID = (n) => `a${n}000000-0000-4000-8000-00000000000${n}`

/* How late each picture is answered, by name, in ms (set per part). */
const late = new Map()

try {
  /* The pictures and the clip, made by ffmpeg: a tall phone photo, a wide one, a square one, a poster. */
  const make = (name, args) => {
    const out = join(stubs, name)
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args, out])
    return readFileSync(out)
  }
  const files = {
    tall: make("tall.jpg", ["-f", "lavfi", "-i", "testsrc2=size=1080x1920", "-frames:v", "1", "-q:v", "4"]),
    wide: make("wide.jpg", ["-f", "lavfi", "-i", "smptebars=size=1600x900", "-frames:v", "1", "-q:v", "4"]),
    square: make("square.jpg", ["-f", "lavfi", "-i", "mandelbrot=size=1200x1200", "-frames:v", "1", "-q:v", "4"]),
    poster: make("poster.jpg", ["-f", "lavfi", "-i", "rgbtestsrc=size=1280x720", "-frames:v", "1", "-q:v", "4"]),
  }
  const clip = make("clip.webm", ["-f", "lavfi", "-i", "testsrc=size=640x360:rate=24:duration=2", "-c:v", "libvpx", "-b:v", "400k", "-pix_fmt", "yuv420p"])

  writeFileSync(
    join(stubs, "navigation.js"),
    `import { startTransition, useEffect, useState } from "react"
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: (h) => log("prefetch", h), back: () => history.back(), refresh: () => log("refresh") }
const useLocation = (read) => {
  const [v, setV] = useState(read)
  useEffect(() => {
    const on = () => startTransition(() => setV(read()))
    window.addEventListener("popstate", on)
    return () => window.removeEventListener("popstate", on)
  }, [])
  return v
}
export const usePathname = () => useLocation(() => location.pathname)
export const useSearchParams = () => new URLSearchParams(useLocation(() => location.search))
export const useRouter = () => router
export const redirect = () => {}
export const notFound = () => {}
`,
  )
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined }) }
`)
  writeFileSync(join(stubs, "dynamic.jsx"), `import React from "react"
export default function dynamic(load) { const Lazy = React.lazy(() => load().then((m) => ({ default: m && m.default ? m.default : m }))); return function Dynamic(props) { return React.createElement(Lazy, props) } }
`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() {
  return {
    channel() { const ch = { on() { return ch }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 30); return ch }, track: async () => "ok", presenceState: () => ({}), send: async () => "ok" }; return ch },
    removeChannel() {},
    realtime: { setAuth: async () => {} },
    auth: { getSession: async () => ({ data: { session: { user: { id: "u-me" } } } }), signOut: async () => ({ error: null }) },
  }
}
export const isNativePlatform = () => false
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-media-round32.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.media-r32-probe/navigation.js", "next/link": "./.media-r32-probe/link.jsx", "next/image": "./.media-r32-probe/image.jsx", "next/dynamic": "./.media-r32-probe/dynamic.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "page.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const css = await appCss(root)
  const themeCss = readFileSync(join(root, "app/theme-dark.css"), "utf8")
  const js = readFileSync(join(stubs, "page.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${interFaces(root)}${css}</style><style>${themeCss}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"], protocolTimeout: 240_000 })
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }

  /** The picture a request is for: the image route's `url`, or the address itself. */
  const pictureOf = (url) => {
    let target = url
    try {
      const u = new URL(url)
      if (u.pathname === "/_next/image") target = u.searchParams.get("url") || url
    } catch {
      return null
    }
    const m = /\/community\/(\w+)\.jpg/.exec(target)
    return m && files[m[1]] ? m[1] : null
  }

  async function open(vp, { dark = false, solo = null, reduced = false, recordFrom = null, until = "load" } = {}) {
    /* Each page in its own context: nothing one page fetched is in the next one's cache, so "cold" is cold. */
    const ctx = await browser.createBrowserContext()
    const p = await ctx.newPage()
    const closePage = p.close.bind(p)
    p.close = async () => {
      await closePage()
      await ctx.close()
    }
    await p.setViewport(vp)
    if (reduced) await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url().split("#")[0]
      const name = pictureOf(url)
      if (name) {
        const answer = () => r.respond({ status: 200, contentType: "image/jpeg", body: files[name], headers: { "Cache-Control": "public, max-age=31536000", "Access-Control-Allow-Origin": "*" } }).catch(() => {})
        const ms = late.get(name) ?? 0
        if (ms) setTimeout(answer, ms)
        else answer()
        return
      }
      if (url === `${ORIGIN}/__clip.webm`) {
        const n = clip.length
        return r.respond({ status: 206, contentType: "video/webm", body: clip, headers: { "Accept-Ranges": "bytes", "Content-Range": `bytes 0-${n - 1}/${n}`, "Content-Length": String(n), "Access-Control-Allow-Origin": "*" } })
      }
      if (url.startsWith(`${ORIGIN}/api/`)) return r.respond({ status: 200, contentType: "application/json", body: "{}" })
      if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("file:")) return r.continue()
      return r.respond({ status: 204, body: "" })
    })
    const q = new URLSearchParams()
    if (dark) q.set("dark", "1")
    if (solo) q.set("solo", solo)
    const qs = q.toString()
    /* Every picture's load and every video's loadeddata, timed, for "within a frame of". */
    await p.evaluateOnNewDocument(() => {
      window.__events = []
      for (const type of ["load", "loadeddata", "seeked"]) {
        document.addEventListener(type, (e) => {
          const t = e.target
          if (!(t instanceof HTMLImageElement || t instanceof HTMLVideoElement)) return
          const poster = t.closest("[data-video-poster-layer]") ? 1 : 0
          window.__events.push({ type, t: performance.now(), tag: t.tagName, poster, frame: t.closest("[data-video-frame]") ? 1 : 0 })
          /* When a picture can be drawn: its decode, asked for here too (the browser decodes it once for everyone who asks). */
          if (type === "load" && t instanceof HTMLImageElement && poster) t.decode().then(() => window.__events.push({ type: "decoded", t: performance.now(), tag: "IMG", poster, frame: 0 }), () => {})
        }, true)
      }
    })
    /* From the page's very first frame, for a part that measures how a cold page arrives. */
    if (recordFrom)
      await p.evaluateOnNewDocument((src) => {
        const fn = new Function(`return (${src})()`)
        window.__trace = []
        const tick = (now) => {
          try {
            window.__trace.push({ t: Math.round(now), at: now, ...fn() })
          } catch (e) {
            window.__trace.push({ t: Math.round(now), at: now, err: String(e) })
          }
          if (now < 6000) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }, recordFrom.toString())
    const url = `${ORIGIN}/community/clay-studio${qs ? `?${qs}` : ""}`
    if (until === "now") {
      /* Not waiting for the page to finish loading (a late picture holds that back): the box as soon as it is drawn. */
      void p.goto(url, { waitUntil: "load", timeout: 60000 }).catch(() => {})
      await p.waitForSelector("[data-solo-panel] [data-media-tile]", { timeout: 15000 })
      await sleep(300)
      return { p, errors }
    }
    await p.goto(url, { waitUntil: until })
    await p.evaluate(() => document.fonts.ready)
    if (solo) await p.waitForSelector("[data-solo-panel] [data-post-media]", { timeout: 15000 })
    else await p.waitForSelector("[data-feed-list] [data-post]", { timeout: 15000 })
    await sleep(500)
    return { p, errors }
  }

  /* Records `measure()` (run in the page) on every frame for `ms` after `act` starts; each frame carries its time. */
  const record = async (p, act, ms, measure) => {
    await p.evaluate((ms, src) => {
      const fn = new Function(`return (${src})()`)
      window.__trace = []
      const t0 = performance.now()
      window.__t0 = t0
      const tick = (now) => {
        const t = now - t0
        try {
          window.__trace.push({ t: Math.round(t), at: now, ...fn() })
        } catch (e) {
          window.__trace.push({ t: Math.round(t), at: now, err: String(e) })
        }
        if (t < ms) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, ms, measure.toString())
    await act()
    await sleep(ms + 150)
    return p.evaluate(() => window.__trace)
  }

  const pressCard = async (p, id, phone) => {
    const sel = `[data-feed-list] > [data-post="${id}"] h2 [data-post-open]`
    await p.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: "center" }), sel)
    await sleep(300)
    const at = await p.evaluate((sel) => {
      const r = document.querySelector(sel)?.getBoundingClientRect()
      return r ? { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 } : null
    }, sel)
    if (!at) return false
    if (phone) await p.touchscreen.tap(at.x, at.y)
    else await p.mouse.click(at.x, at.y)
    return true
  }
  const LAYER = '[data-post-fullscreen], [data-post-overlay="panel"]'

  /* ── The viewer's frames ─────────────────────────────────────────────── */

  /* On every frame: the copies of picture `window.__idx` that can be seen, the flying box, the black. */
  const viewerFrame = () => {
    const seen = (el) => {
      if (!el || !el.isConnected) return false
      const cs = getComputedStyle(el)
      if (cs.visibility === "hidden" || cs.display === "none") return false
      if (el instanceof HTMLImageElement && (!el.complete || el.naturalWidth < 2)) return false
      let o = 1
      for (let x = el; x && x.nodeType === 1; x = x.parentElement) o *= Number(getComputedStyle(x).opacity)
      if (o < 0.02) return false
      const r = el.getBoundingClientRect()
      return r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth
    }
    const idx = window.__idx ?? 0
    const layer = document.querySelector('[data-post-fullscreen], [data-post-overlay="panel"]')
    const tile = layer?.querySelector(`[data-media-index="${idx}"]`)
    const tileImgs = tile ? [...tile.querySelectorAll("img")] : []
    const viewer = [...document.querySelectorAll(`[data-lightbox-slide="${idx}"] img[data-lightbox-image]`)]
    const morph = [...document.querySelectorAll("[data-cover-morph] img")]
    const c = { tile: tileImgs.filter(seen).length, viewer: viewer.filter(seen).length, morph: morph.filter(seen).length }
    const box = document.querySelector("[data-cover-morph]")
    const br = box?.getBoundingClientRect()
    const back = document.querySelector("[data-lightbox-back]")
    const lb = document.querySelector("[data-lightbox]")
    return {
      copies: c.tile + c.viewer + c.morph,
      c,
      box: br ? [br.left, br.top, br.width, br.height].map((v) => +v.toFixed(1)) : null,
      way: box?.getAttribute("data-cover-morph") ?? null,
      /* Where the flight ends, from its own last keyframe: what the frames sampled may miss on a busy machine. */
      end: (() => {
        const a = box?.getAnimations().find((x) => x.effect.getKeyframes().some((k) => k.translate))
        if (!a) return null
        const k = a.effect.getKeyframes().at(-1)
        const [tx, ty] = String(k.translate).split(" ").map(parseFloat)
        const [sx, sy] = String(k.scale).split(" ").map(parseFloat)
        const L = parseFloat(box.style.left), T = parseFloat(box.style.top), W = parseFloat(box.style.width), H = parseFloat(box.style.height)
        const w = W * sx, h = H * (sy || sx)
        return [L + W / 2 + tx - w / 2, T + H / 2 + ty - h / 2, w, h].map((v) => +v.toFixed(1))
      })(),
      /* The corners on screen: the box's own radius is written in its stretched pixels, so it is scaled back here. */
      radius: box ? ["borderTopLeftRadius", "borderTopRightRadius"].map((k) => +((parseFloat(getComputedStyle(box)[k]) || 0) * (br.width / box.offsetWidth)).toFixed(1)) : null,
      back: back ? +(+getComputedStyle(back).opacity * +getComputedStyle(lb).opacity).toFixed(3) : null,
      phase: lb?.getAttribute("data-lightbox-phase") ?? null,
    }
  }

  /* Where the post shows picture `idx` now, measured here independently: the picture's own rectangle inside its tile. */
  const seenRect = (p, idx) =>
    p.evaluate((idx) => {
      const layer = document.querySelector('[data-post-fullscreen], [data-post-overlay="panel"]')
      const tile = layer?.querySelector(`[data-media-index="${idx}"]`)
      if (!tile) return null
      const imgs = [...tile.querySelectorAll("img")].filter((i) => i.complete && i.naturalWidth > 1 && Number(getComputedStyle(i).opacity) > 0.5)
      const img = imgs.sort((a, b) => b.naturalWidth - a.naturalWidth)[0]
      const box = tile.getBoundingClientRect()
      if (!img) return { rect: [box.left, box.top, box.width, box.height], fit: null }
      const r = img.getBoundingClientRect()
      const fit = getComputedStyle(img).objectFit
      let x = r.left, y = r.top, w = r.width, h = r.height
      if (fit === "contain") {
        const s = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight)
        w = img.naturalWidth * s
        h = img.naturalHeight * s
        x = r.left + (r.width - w) / 2
        y = r.top + (r.height - h) / 2
      }
      const L = Math.max(x, box.left), T = Math.max(y, box.top), R = Math.min(x + w, box.right), B = Math.min(y + h, box.bottom)
      return { rect: [L, T, R - L, B - T].map((v) => +v.toFixed(1)), tile: [box.left, box.top, box.width, box.height].map((v) => +v.toFixed(1)), fit, ratio: +(img.naturalWidth / img.naturalHeight).toFixed(4) }
    }, idx)

  /** One way only: every step of `vals` the same sign (steps under half a pixel are rest). */
  const oneWay = (vals) => {
    let sign = 0
    for (let i = 1; i < vals.length; i++) {
      const d = vals[i] - vals[i - 1]
      if (Math.abs(d) < 0.5) continue
      const s = Math.sign(d)
      if (sign && s !== sign) return false
      sign = s
    }
    return true
  }
  const near = (a, b, tol = 1.5) => !!a && !!b && a.every((v, i) => Math.abs(v - b[i]) <= tol)

  /** What one open or close did, frame by frame. */
  const summarise = (trace, way) => {
    const live = trace.filter((f) => f.phase !== null || f.box)
    const morphs = trace.filter((f) => f.box && f.way === way)
    const widths = morphs.map((f) => f.box[2])
    return {
      frames: trace.length,
      copies: [...new Set(trace.map((f) => f.copies))],
      notOne: trace.filter((f) => f.copies !== 1).map((f) => ({ t: f.t, c: f.c })).slice(0, 6),
      morphFrames: morphs.length,
      oneWay: oneWay(widths) && oneWay(morphs.map((f) => f.box[0])) && oneWay(morphs.map((f) => f.box[1])),
      first: morphs[0]?.box ?? null,
      last: morphs[morphs.length - 1]?.box ?? null,
      end: morphs.find((f) => f.end)?.end ?? null,
      aspects: morphs.map((f) => +(f.box[2] / f.box[3]).toFixed(3)),
      radii: morphs.map((f) => f.radius),
      back: live.map((f) => f.back).filter((v) => v !== null),
    }
  }

  async function viewerRun(label, { vp, phone, dark, post, idx, close, shotName }) {
    console.log(`\n  ${label}`)
    const { p, errors } = await open(vp, { dark })
    await pressCard(p, PID(post), phone)
    await p.waitForSelector(`${LAYER.split(", ").map((s) => `${s} [data-media-index="${idx}"]`).join(", ")}`, { timeout: 8000 })
    await sleep(1200)
    await p.evaluate((idx) => (window.__idx = idx), idx)
    const thumb = await seenRect(p, idx)
    const tileAt = await p.evaluate((idx) => {
      const layer = document.querySelector('[data-post-fullscreen], [data-post-overlay="panel"]')
      const r = layer.querySelector(`[data-media-index="${idx}"]`).getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }, idx)
    /* OPEN */
    const opening = await record(p, () => (phone ? p.touchscreen.tap(tileAt.x, tileAt.y) : p.mouse.click(tileAt.x, tileAt.y)), 750, viewerFrame)
    const o = summarise(opening, "in")
    const ratio = thumb?.ratio ?? null
    console.log(`    the thumbnail's picture as the post shows it: ${JSON.stringify(thumb)}`)
    console.log(`    open:  ${o.frames} frames, copies seen ${JSON.stringify(o.copies)}, ${o.morphFrames} frames of flight, box ${JSON.stringify(o.first)} -> ${JSON.stringify(o.last)}`)
    console.log(`           widths ${JSON.stringify(opening.filter((f) => f.box && f.way === "in").map((f) => f.box[2]))}`)
    console.log(`           black ${JSON.stringify(o.back)}`)
    expect(o.copies.length === 1 && o.copies[0] === 1, `${label}, open: one picture on every frame (never two, never none)`, { copies: o.copies, notOne: o.notOne })
    expect(o.morphFrames >= 8, `${label}, open: the picture flies over many frames`, o.morphFrames)
    expect(o.oneWay, `${label}, open: its box grows one way only (width, left, top)`)
    expect(near(o.first, thumb?.rect), `${label}, open: it starts on the picture as the post shows it, not on the tile's box`, { first: o.first, picture: thumb?.rect, tile: thumb?.tile })
    if (thumb?.fit === "contain" && ratio) {
      const worst = Math.max(...o.aspects.map((a) => Math.abs(a / ratio - 1)))
      expect(worst < 0.02, `${label}, open: drawn whole in the post, it keeps its own shape all the way (no wide crop)`, { worst: +worst.toFixed(4), ratio, aspects: o.aspects.slice(0, 4) })
    } else {
      expect(oneWay(o.aspects), `${label}, open: the crop opens out one way only`, o.aspects)
    }
    expect(oneWay(o.back) && o.back[o.back.length - 1] >= 0.99, `${label}, open: the black comes up on its own, one way`, o.back.slice(0, 8))
    await sleep(400)
    await p.screenshot({ path: join(shots, `${shotName}-open.png`) })
    /* CLOSE */
    const closer = await p.evaluate(() => {
      const img = document.querySelector("[data-lightbox-slide] img[data-lightbox-image]")
      const all = [...document.querySelectorAll("[data-lightbox-slide]")]
      const active = all.map((s) => s.querySelector("img[data-lightbox-image]")).find((i) => i && i.getBoundingClientRect().left >= -1 && i.getBoundingClientRect().right <= innerWidth + 1) || img
      const r = active.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
    })
    const act = async () => {
      if (close === "escape") return p.keyboard.press("Escape")
      if (close === "black") {
        /* Beside the picture on a computer, under it on a phone: on the black, never on the picture. */
        const x = phone ? closer.cx : Math.max(20, closer.left / 2)
        const y = phone ? Math.min(830, closer.bottom + (844 - closer.bottom) / 2) : closer.cy
        return phone ? p.touchscreen.tap(x, y) : p.mouse.click(x, y)
      }
      if (close === "swipe") {
        await p.touchscreen.touchStart(closer.cx, closer.cy)
        for (let k = 1; k <= 8; k++) {
          await p.touchscreen.touchMove(closer.cx, closer.cy + k * 22)
          await sleep(16)
        }
        return p.touchscreen.touchEnd()
      }
    }
    const closing = await record(p, act, 800, viewerFrame)
    const c = summarise(closing, "out")
    const after = await seenRect(p, idx)
    const gone = await p.evaluate(() => !document.querySelector("[data-lightbox]"))
    console.log(`    close (${close}): ${c.frames} frames, copies seen ${JSON.stringify(c.copies)}, ${c.morphFrames} frames of flight, box ${JSON.stringify(c.first)} -> ${JSON.stringify(c.last)}`)
    console.log(`           widths ${JSON.stringify(closing.filter((f) => f.box && f.way === "out").map((f) => f.box[2]))}`)
    console.log(`           corners ${JSON.stringify(c.radii)}`)
    console.log(`           black ${JSON.stringify(c.back)}`)
    expect(gone, `${label}, close by ${close}: the viewer is gone`)
    expect(c.copies.length === 1 && c.copies[0] === 1, `${label}, close: one picture on every frame (never two, never none)`, { copies: c.copies, notOne: c.notOne })
    expect(c.morphFrames >= 8, `${label}, close: the picture flies back over many frames`, c.morphFrames)
    expect(c.oneWay, `${label}, close: its box shrinks one way only (width, left, top)`)
    expect(near(c.end, after?.rect, 1.5) && near(c.last, after?.rect, 8), `${label}, close: it lands on the picture as the post shows it (its last keyframe, and the last frame drawn close to it)`, { end: c.end, lastDrawn: c.last, picture: after?.rect, tile: after?.tile })
    if (after?.fit === "contain" && ratio) {
      const worst = Math.max(...c.aspects.map((a) => Math.abs(a / ratio - 1)))
      expect(worst < 0.02, `${label}, close: it keeps its own shape all the way back (no wide crop)`, { worst: +worst.toFixed(4), aspects: c.aspects.slice(0, 4) })
    } else {
      expect(oneWay(c.aspects), `${label}, close: the crop closes in one way only`, c.aspects)
    }
    expect(oneWay(c.back) && (c.back[c.back.length - 1] ?? 0) <= 0.01, `${label}, close: the black fades on its own, one way, to nothing`, c.back.slice(0, 8))
    await p.screenshot({ path: join(shots, `${shotName}-closed.png`) })
    expect(errors.length === 0, `${label}: no page errors`, errors)
    await p.close()
    return { o, c }
  }

  if (want("VIEWER")) {
    console.log("\nVIEWER: one picture, opened and closed, frame by frame")
    await viewerRun("computer, a tall picture drawn whole, closed on the black", { vp: DESK, phone: false, dark: false, post: 1, idx: 0, close: "black", shotName: "viewer-desk-tall" })
    await viewerRun("computer dark, two cropped pictures, the second, closed by Escape", { vp: DESK, phone: false, dark: true, post: 2, idx: 1, close: "escape", shotName: "viewer-desk-pair" })
    await viewerRun("phone, a tall picture drawn whole, closed by a tap on the black", { vp: PHONE, phone: true, dark: false, post: 1, idx: 0, close: "black", shotName: "viewer-phone-tall" })
    await viewerRun("phone dark, a cropped picture, closed by a swipe down", { vp: PHONE, phone: true, dark: true, post: 2, idx: 0, close: "swipe", shotName: "viewer-phone-pair" })
    {
      /* A press ON the picture is not a close (a double tap zooms there). */
      const { p } = await open(PHONE)
      await pressCard(p, PID(1), true)
      await p.waitForSelector('[data-post-fullscreen] [data-media-index="0"]', { timeout: 8000 })
      await sleep(1000)
      const at = await p.evaluate(() => {
        const r = document.querySelector('[data-post-fullscreen] [data-media-index="0"]').getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      })
      await p.touchscreen.tap(at.x, at.y)
      await sleep(700)
      await p.touchscreen.tap(195, 422)
      await sleep(700)
      const still = await p.evaluate(() => document.querySelector("[data-lightbox]")?.getAttribute("data-lightbox-phase") ?? null)
      expect(still === "open", "phone: a tap on the picture itself leaves the viewer open", still)
      await p.close()
    }
  }

  /* ── Reduced motion ──────────────────────────────────────────────────── */
  if (want("REDUCED")) {
    console.log("\nREDUCED: with reduced motion the viewer fades, nothing flies")
    const { p, errors } = await open(DESK, { reduced: true })
    await pressCard(p, PID(1), false)
    await p.waitForSelector('[data-post-overlay="panel"] [data-media-index="0"]', { timeout: 8000 })
    await sleep(1000)
    const at = await p.evaluate(() => {
      const r = document.querySelector('[data-post-overlay="panel"] [data-media-index="0"]').getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    const opening = await record(p, () => p.mouse.click(at.x, at.y), 400, () => ({ box: !!document.querySelector("[data-cover-morph]"), o: document.querySelector("[data-lightbox]") ? +(+getComputedStyle(document.querySelector("[data-lightbox]")).opacity).toFixed(3) : null }))
    const ops = opening.map((f) => f.o).filter((v) => v !== null)
    expect(!opening.some((f) => f.box) && ops.length > 2 && ops[0] < 0.6 && oneWay(ops) && ops[ops.length - 1] === 1, "open: no flying copy, the viewer fades in", ops.slice(0, 10))
    await sleep(300)
    const closing = await record(p, () => p.keyboard.press("Escape"), 500, () => ({ box: !!document.querySelector("[data-cover-morph]"), o: document.querySelector("[data-lightbox]") ? +(+getComputedStyle(document.querySelector("[data-lightbox]")).opacity).toFixed(3) : null }))
    const cs = closing.map((f) => f.o).filter((v) => v !== null)
    expect(!closing.some((f) => f.box) && cs.length > 2 && oneWay(cs) && cs.some((v) => v > 0 && v < 1), "close: no flying copy, the viewer fades out", cs.slice(0, 10))
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  /* ── An opened post's video ──────────────────────────────────────────── */

  const videoFrame = () => {
    const box = document.querySelector('[data-post-fullscreen] [data-media-tile="video"], [data-post-overlay="panel"] [data-media-tile="video"], [data-solo-panel] [data-media-tile="video"]')
    if (!box) return { box: null }
    const b = box.getBoundingClientRect()
    /* Opacity inside the box only: the opened post as a whole fades in with its own move, the question is what the box shows. */
    const op = (el) => {
      let o = 1
      for (let x = el; x && x !== box; x = x.parentElement) o *= Number(getComputedStyle(x).opacity)
      return o
    }
    /* The pictures that cover the box now: loaded, not hidden, how opaque. */
    const pics = [...box.querySelectorAll("[data-video-poster-layer] img, [data-video-frame] img, [data-video-frame] video")]
      .filter((el) => getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden")
      .map((el) => ({ tag: el.tagName, ready: el instanceof HTMLVideoElement ? el.readyState >= 2 : el.complete && el.naturalWidth > 1, o: +op(el).toFixed(3), r: el.getBoundingClientRect() }))
    const covering = pics.filter((x) => x.ready && x.o > 0.01)
    const full = covering.filter((x) => Math.abs(x.r.width - b.width) < 2 && Math.abs(x.r.height - b.height) < 2)
    const mark = box.querySelector("[data-video-play-mark]")
    /* A flat grey slab: anything in the box painted the dark look's graphite or a mid grey. */
    const greys = [...box.querySelectorAll("*")].concat([box]).filter((el) => {
      const m = /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/.exec(getComputedStyle(el).backgroundColor)
      if (!m || (m[4] !== undefined && Number(m[4]) < 0.5)) return false
      const [r, g, bl] = [+m[1], +m[2], +m[3]]
      const l = (0.2126 * r + 0.7152 * g + 0.0722 * bl) / 255
      const rr = el.getBoundingClientRect()
      return Math.max(r, g, bl) - Math.min(r, g, bl) <= 12 && l > 0.13 && l < 0.6 && rr.width * rr.height > 0.25 * b.width * b.height
    }).length
    return {
      box: [b.width, b.height].map((v) => Math.round(v)),
      ground: getComputedStyle(box).backgroundColor,
      picture: full.length ? Math.max(...full.map((x) => x.o)) : 0,
      biggest: covering.length ? covering.map((x) => [Math.round(x.r.width), Math.round(x.r.height)])[0] : null,
      mark: mark ? +op(mark).toFixed(3) : null,
      greys,
      layer: box.querySelector("[data-video-poster-layer]")?.getAttribute("data-video-poster-layer") ?? null,
      frame: box.querySelector("[data-video-frame]")?.getAttribute("data-video-frame") ?? null,
      kept: box.querySelector("[data-video-frame-kept]") ? 1 : 0,
      pics: pics.map((x) => ({ tag: x.tag, ready: x.ready, o: x.o, w: Math.round(x.r.width), h: Math.round(x.r.height) })),
    }
  }
  const firstWith = (trace) => trace.find((f) => f.box)
  /** Frames from an event to the first frame that shows the picture (by the frame's own timestamp). */
  const framesAfter = (trace, at) => {
    if (at == null) return null
    const after = trace.filter((f) => f.at >= at)
    const k = after.findIndex((f) => f.picture > 0)
    return k
  }

  if (want("VIDEO")) {
    console.log("\nVIDEO: an opened post's video, at once and softly")
    {
      /* A poster fetched ahead (the card drew it, the press warmed it): there in the first frame of the opened post. */
      const { p, errors } = await open(PHONE, { dark: true })
      await p.evaluate((id) => document.querySelector(`[data-feed-list] > [data-post="${id}"]`)?.scrollIntoView({ block: "center" }), PID(3))
      await sleep(900)
      const trace = await record(p, () => pressCard(p, PID(3), true), 1400, videoFrame)
      const first = firstWith(trace)
      const hs = new Set(trace.filter((f) => f.box).map((f) => f.box.join("x")))
      const bare = trace.filter((f) => f.box && f.picture < 0.99)
      console.log(`    first frame with the box: ${JSON.stringify(first)}`)
      expect(!!first && first.picture >= 0.99, "phone dark, poster fetched ahead: the poster covers the box in the first frame of the opened post", first)
      expect(bare.length === 0, "phone dark: no frame shows the box without its picture", bare.slice(0, 3))
      expect(hs.size === 1, "phone dark: one size from the first frame (no shift)", [...hs])
      expect(trace.every((f) => !f.box || f.greys === 0), "phone dark: no flat grey box in it", trace.find((f) => f.greys))
      await sleep(300)
      await p.screenshot({ path: join(shots, "video-poster-phone-dark.png") })
      /* A press on play: the player is handed the poster file on screen, from the cache. */
      const before = await p.evaluate(() => document.querySelector("[data-post-fullscreen] [data-media-tile=video] img[data-video-poster]")?.currentSrc ?? null)
      await p.evaluate(() => document.querySelector("[data-post-fullscreen] [data-media-tile=video] [data-video-play]")?.click())
      await p.waitForSelector("[data-post-fullscreen] [data-video-player] video", { timeout: 6000 }).catch(() => null)
      const given = await p.evaluate(() => document.querySelector("[data-post-fullscreen] [data-video-player] video")?.getAttribute("poster") ?? null)
      expect(!!before && given === before, "the player starts on the poster file already on screen", { onScreen: before?.slice(-60), given: given?.slice(-60) })
      expect(errors.length === 0, "phone dark: no page errors", errors)
      await p.close()
    }
    for (const dark of [false, true]) {
      /* Cold: the opened post's media alone, nothing drawn before it, the poster 600ms late. Recorded from the page's first frame. */
      late.set("poster", 600)
      const look = dark ? "dark" : "light"
      {
        /* What the box looks like while the poster is on its way (a poster fifteen seconds late, for the picture only: a page here takes a few seconds to be ready). */
        late.set("poster", 15000)
        const t0 = Date.now()
        const { p } = await open(PHONE, { dark, solo: "poster", until: "now" })
        const state = await p.evaluate(() => document.querySelector("[data-video-poster-layer]")?.getAttribute("data-video-poster-layer"))
        await p.screenshot({ path: join(shots, `video-cold-${look}-waiting.png`) })
        console.log(`    (the waiting picture: poster layer "${state}", ${Date.now() - t0}ms after the page was asked for)`)
        await p.close()
        late.set("poster", 600)
      }
      const { p, errors } = await open(PHONE, { dark, solo: "poster", recordFrom: videoFrame })
      await sleep(1600)
      const { trace, events } = await p.evaluate(() => ({ trace: window.__trace, events: window.__events }))
      late.delete("poster")
      const withBox = trace.filter((f) => f.box)
      const waiting = withBox.filter((f) => f.picture === 0)
      const loaded = events.find((e) => e.type === "load" && e.poster && e.tag === "IMG")?.t ?? null
      const decoded = events.find((e) => e.type === "decoded")?.t ?? null
      const kd = framesAfter(withBox, decoded)
      const k = framesAfter(withBox, loaded)
      const hs = new Set(withBox.map((f) => f.box.join("x")))
      const shown = withBox.find((f) => f.picture >= 0.99)
      console.log(`    ${look}, cold: ground ${withBox[0]?.ground}, ${waiting.length} frames before the poster, poster loaded at ${loaded?.toFixed(0)}ms and decoded at ${decoded?.toFixed(0)}ms, first frame of it ${k} frame(s) after the load, ${kd} after the decode`)
      expect(waiting.length > 0 && waiting.every((f) => f.greys === 0), `${look}, cold: while the poster is on its way the box is the post's quiet ground, not a grey slab`, { ground: withBox[0]?.ground, greys: waiting.find((f) => f.greys)?.greys ?? 0 })
      expect(waiting.every((f) => f.mark === 0), `${look}, cold: no play mark on the empty box`, waiting.map((f) => f.mark).slice(0, 5))
      expect(kd !== null && kd >= 0 && kd <= 1, `${look}, cold: the poster starts coming in within a frame of being decoded (decoded off the thread first, so it never paints in strips)`, { afterDecode: kd, afterLoad: k })
      expect(!!shown && shown.mark === 1, `${look}, cold: the poster in, the play mark with it`, shown && { mark: shown.mark })
      expect(hs.size === 1 && !!shown && shown.biggest?.join("x") === shown.box.join("x"), `${look}, cold: one size from the first frame, the poster fills it exactly (no larger box)`, { sizes: [...hs], poster: shown?.biggest })
      await p.screenshot({ path: join(shots, `video-cold-${look}.png`) })
      expect(errors.length === 0, `${look}, cold: no page errors`, errors)
      await p.close()
    }
    {
      /* Cold, a video with no still: its first frame within a frame of loadeddata. */
      const { p, errors } = await open(PHONE, { dark: true, solo: "bare", recordFrom: videoFrame })
      await sleep(1600)
      const { trace, events } = await p.evaluate(() => ({ trace: window.__trace, events: window.__events }))
      const withBox = trace.filter((f) => f.box)
      const data = events.find((e) => (e.type === "loadeddata" || e.type === "seeked") && e.frame)?.t ?? null
      const k = framesAfter(withBox, data)
      console.log(`    no still, cold: loadeddata at ${data?.toFixed(0)}ms, first frame of it ${k} frame(s) later; ground ${withBox[0]?.ground}`)
      expect(k !== null && k >= 0 && k <= 1, "no still, cold: the first frame starts coming in within one frame of loadeddata", { frames: k })
      expect(withBox.every((f) => f.greys === 0), "no still, cold: no flat grey box while it loads", withBox.find((f) => f.greys))
      expect(withBox.filter((f) => f.picture === 0).every((f) => f.mark === 0), "no still, cold: no play mark on the empty box")
      await p.screenshot({ path: join(shots, "video-bare-cold-dark.png") })
      expect(errors.length === 0, "no still, cold: no page errors", errors)
      await p.close()
    }
    {
      /* The card drew the first frame: the opened post shows that frame in its first frame. */
      const { p, errors } = await open(PHONE, { dark: true })
      await p.evaluate((id) => document.querySelector(`[data-feed-list] > [data-post="${id}"]`)?.scrollIntoView({ block: "center" }), PID(4))
      await p.waitForSelector(`[data-post="${PID(4)}"] [data-card-media-frame] [data-video-frame="shown"]`, { timeout: 8000 }).catch(() => null)
      await sleep(600)
      const trace = await record(p, () => pressCard(p, PID(4), true), 1200, videoFrame)
      const first = firstWith(trace)
      console.log(`    no still, from the card: first frame with the box ${JSON.stringify(first)}`)
      expect(!!first && first.kept === 1 && first.picture >= 0.99, "no still, from the card: the card's frame is in the opened post's first frame", first)
      expect(trace.filter((f) => f.box).every((f) => f.picture >= 0.99 && f.greys === 0), "no still, from the card: never an empty or grey box after")
      await sleep(200)
      await p.screenshot({ path: join(shots, "video-bare-kept-dark.png") })
      expect(errors.length === 0, "no still, from the card: no page errors", errors)
      await p.close()
    }
  }

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

console.log(`\n  pictures: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
