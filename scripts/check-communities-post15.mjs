/**
 * ===========================================================================
 *  ROUND 15: OPENING AND CLOSING A POST ON A PHONE, FRAME BY FRAME (worker O)
 * ===========================================================================
 * The owner's recording (images/74.mp4) showed four faults in the close: a
 * blank band above the post as it went, the post's header and the
 * community's crossfading over each other, the card in the wrong place then
 * snapping, and after it all looked settled a second animation drawing the
 * picture and the title twice. This probe watches the same thing the way the
 * owner did: a phone (390x844), the CPU slowed four times, every painted
 * frame recorded (CDP screencast) and the page measured on every animation
 * frame, for an open, a close by the back button, a pull down and (in the
 * app) the edge swipe.
 *
 * PER FRAME
 *   DOUBLED   a copy of the post's title, of its picture or of a header
 *             (the community's and the post's own) seen over another copy
 *             of it: both on screen, overlapping, the upper one not opaque
 *             (so the lower shows through) or not covering it.
 *   BAND      in the recorded picture, a run of blank white rows the full
 *             width of the screen, between the header and the tab bar,
 *             that neither the screen before nor after has.
 *   FEED      the feed's scroll is where it was at every frame of the open
 *             and the close (restored, if anything moved it, before the
 *             close moves).
 *   LATE      once the post is no longer seen, nothing in the feed animates
 *             or moves for the next 40 frames.
 *   TAB BAR   the tab bar stays on screen through the open, the post and
 *             the close (ARCH round 15: the opened post does not hide it).
 *
 * Writes contact sheets of each sequence to SHOTS_DIR (default a temp dir)
 * and prints a line per check. LABEL names the run ("before", "after").
 *
 *   PROBE_CSS=source LABEL=after node scripts/check-communities-post15.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const LABEL = process.env.LABEL || "run"
const THROTTLE = Number(process.env.THROTTLE || 4)
const css = await appCss(root)
const fonts = interFaces(root)
const stubs = join(root, ".post15-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-post15-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"

/* Measured on every animation frame, in the page. */
const SAMPLER = () => {
  const eff = (el) => {
    let o = 1
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity)
    return o
  }
  const box = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null
  }
  const area = (a) => Math.max(0, a.r - a.l) * Math.max(0, a.b - a.t)
  const inter = (a, b) => ({ l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) })
  const onScreen = (a) => a && a.r > 0 && a.l < innerWidth && a.b > 0 && a.t < innerHeight
  window.__frames = []
  window.__run = true
  const tick = (t) => {
    const layer = document.querySelector("[data-post-fullscreen]")
    const page = layer?.querySelector("[role=dialog]")
    const pageBox = box(page)
    const pageOp = page ? eff(page) : 0
    const pageSeen = !!pageBox && onScreen(pageBox) && pageOp > 0.02
    /* A part of the feed is hidden when the opaque page covers its middle. */
    const coveredByPage = (b) => {
      if (!pageSeen || pageOp < 0.98 || !b) return false
      const cx = (b.l + b.r) / 2
      const cy = (b.t + b.b) / 2
      return cx > pageBox.l && cx < pageBox.r && cy > pageBox.t && cy < pageBox.b
    }
    const card = document.querySelector('article[data-post="p-pic"]')
    const copies = {
      title: [card?.querySelector("h2"), page?.querySelector("[data-post-overlay-post] h1")],
      picture: [card?.querySelector("img[src^='data:image/svg']"), page?.querySelector("[data-post-overlay-post] img[src^='data:image/svg']")],
      header: [document.querySelector("[data-community-top]"), layer?.querySelector("[data-post-fullscreen-top]")],
    }
    const doubled = []
    for (const [name, [under, over]] of Object.entries(copies)) {
      const a = box(under)
      const b = box(over)
      if (!a || !b || !onScreen(a) || !onScreen(b)) continue
      const i = inter(a, b)
      if (i.r <= i.l || i.b <= i.t) continue
      if (area(i) < 0.2 * Math.min(area(a), area(b))) continue
      const overOp = eff(over)
      const underOp = eff(under)
      if (overOp < 0.02 || underOp < 0.02) continue
      /* The post's own copy is drawn over the feed's: the feed's is seen when the copy over it lets it through or the page does not cover it. */
      const underSeen = !coveredByPage(a) || overOp < 0.98
      if (underSeen && overOp < 0.98) doubled.push(`${name} ${overOp.toFixed(2)} over ${underOp.toFixed(2)}`)
      else if (underSeen && name === "header" && overOp >= 0.98 && !coveredByPage(a)) doubled.push(`${name} side by side`)
    }
    const tab = document.querySelector("[data-buyer-tab-bar]")
    const tb = box(tab)
    /* The tab bar is seen when nothing opaque of the post's is over it: the bar's z against the layer's. */
    let tabSeen = !!tb && onScreen(tb)
    if (tabSeen && layer) {
      const zBar = Number(getComputedStyle(tab).zIndex) || 0
      const zLayer = Number(getComputedStyle(layer).zIndex) || 0
      if (zLayer > zBar && pageSeen && pageOp > 0.98 && pageBox.b > tb.t + 4 && pageBox.l < innerWidth / 2) tabSeen = false
    }
    const feedAnims = document.getAnimations().filter((a) => a.playState === "running" && a.effect?.target && !a.effect.target.closest?.("[data-post-fullscreen]") && a.effect.target.closest?.("[data-community-feed]")).length
    window.__frames.push({
      t: Math.round(t),
      layer: !!layer,
      pageSeen,
      pageOp: Number(pageOp.toFixed(3)),
      pageBox: pageBox && [pageBox.l, pageBox.t, pageBox.r, pageBox.b].map(Math.round),
      scrollY: Math.round(window.scrollY),
      card: box(card) && Object.values(box(card)).map((v) => Math.round(v * 10) / 10),
      doubled,
      tabSeen,
      feedAnims,
    })
    if (window.__run) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

try {
  writeFileSync(join(stubs, "navigation.js"), `import { useSyncExternalStore } from "react"
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: (h) => log("prefetch", h), back: () => log("back"), refresh: () => log("refresh") }
const subscribe = (cb) => { window.addEventListener("popstate", cb); return () => window.removeEventListener("popstate", cb) }
const path = () => location.pathname
export const usePathname = () => useSyncExternalStore(subscribe, path, path)
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) e.preventDefault() } }, children) })
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
    entryPoints: [join(root, "scripts/render-communities-post15.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.post15-probe/navigation.js", "next/link": "./.post15-probe/link.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })

  async function session(app) {
    const p = await browser.newPage()
    await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e.stack || e).slice(0, 400)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = r.url()
      if (url.startsWith(`${ORIGIN}/api/`) && /\/posts\/[^/?]+(\?|$)/.test(url)) return void r.respond({ status: 404, contentType: "application/json", body: "{}" })
      if (url.startsWith(`${ORIGIN}/api/`)) {
        const body = /\/comments/.test(url) ? { comments: [], nextCursor: null, commentsEnabled: true, mediaReady: true, me: { name: "Sam Carter", avatarUrl: null } } : { ok: true }
        return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
      }
      if (url.startsWith(`${ORIGIN}/`)) return void r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.startsWith("data:")) return void r.continue()
      return void r.respond({ status: 204, body: "" })
    })
    if (app) await p.evaluateOnNewDocument(() => document.addEventListener("DOMContentLoaded", () => document.documentElement.classList.add("capacitor")))
    await p.goto(`${ORIGIN}/community/bandido`, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await sleep(900)
    const cdp = await p.target().createCDPSession()
    return { p, cdp, errors }
  }

  /* Every painted frame while `act` runs, plus a sample of the page on every animation frame. */
  async function record(s, name, act, ms) {
    const { p, cdp } = s
    const frames = []
    const onFrame = (f) => {
      frames.push({ data: f.data, ts: f.metadata.timestamp })
      void cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
    }
    cdp.on("Page.screencastFrame", onFrame)
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, maxWidth: 390, maxHeight: 844, everyNthFrame: 1 })
    await p.evaluate(SAMPLER)
    await sleep(60)
    await act()
    await sleep(ms)
    const samples = await p.evaluate(() => {
      window.__run = false
      return window.__frames
    })
    await cdp.send("Page.stopScreencast")
    cdp.off("Page.screencastFrame", onFrame)
    return { name, frames, samples }
  }

  /* The pictures, read in a page of their own: full width blank white rows between the header and the tab bar. */
  const reader = await browser.newPage()
  async function bands(frames) {
    return reader.evaluate(async (list) => {
      const out = []
      for (const src of list) {
        const img = new Image()
        img.src = `data:image/jpeg;base64,${src}`
        await img.decode()
        const c = new OffscreenCanvas(img.width, img.height)
        const g = c.getContext("2d")
        g.drawImage(img, 0, 0)
        const d = g.getImageData(0, 0, img.width, img.height).data
        const k = img.width / 390
        const top = Math.round(97 * k)
        const bottom = Math.round(788 * k)
        let run = 0
        let best = 0
        let at = -1
        for (let y = top; y < bottom; y++) {
          let blank = true
          for (let x = 2; x < img.width - 2; x += 3) {
            const i = (y * img.width + x) * 4
            if (d[i] < 246 || d[i + 1] < 246 || d[i + 2] < 246) {
              blank = false
              break
            }
          }
          run = blank ? run + 1 : 0
          if (run > best) {
            best = run
            at = y - run + 1
          }
        }
        out.push({ run: Math.round(best / k), at: Math.round(at / k) })
      }
      return out
    }, frames.map((f) => f.data))
  }

  /* A contact sheet of a sequence: up to 30 frames, 6 a row, each at 130px wide. */
  async function sheet(seq, file) {
    const pick = seq.frames.length <= 30 ? seq.frames : Array.from({ length: 30 }, (_, i) => seq.frames[Math.round((i * (seq.frames.length - 1)) / 29)])
    const png = await reader.evaluate(async (list) => {
      const W = 130
      const H = Math.round((844 / 390) * W)
      const cols = 6
      const rows = Math.ceil(list.length / cols)
      const c = new OffscreenCanvas(cols * (W + 4), rows * (H + 4))
      const g = c.getContext("2d")
      g.fillStyle = "#444"
      g.fillRect(0, 0, c.width, c.height)
      for (let i = 0; i < list.length; i++) {
        const img = new Image()
        img.src = `data:image/jpeg;base64,${list[i]}`
        await img.decode()
        g.drawImage(img, (i % cols) * (W + 4), Math.floor(i / cols) * (H + 4), W, H)
        g.fillStyle = "#e11"
        g.font = "11px sans-serif"
        g.fillText(String(i), (i % cols) * (W + 4) + 3, Math.floor(i / cols) * (H + 4) + 12)
      }
      const blob = await c.convertToBlob({ type: "image/png" })
      const buf = new Uint8Array(await blob.arrayBuffer())
      let s = ""
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
      return btoa(s)
    }, pick.map((f) => f.data))
    writeFileSync(join(shots, file), Buffer.from(png, "base64"))
  }

  function judge(seq, b, feedY, closing) {
    const s = seq.samples
    const doubled = s.filter((f) => f.doubled.length)
    console.log(`  ${seq.name}: ${seq.frames.length} painted frames, ${s.length} animation frames sampled`)
    expect(doubled.length === 0, `${seq.name}: DOUBLED: no frame shows two copies of the title, the picture or a header`, doubled.slice(0, 6).map((f) => `${f.t}: ${f.doubled.join(", ")}`))
    const runs = b.map((x) => x.run)
    const steady = Math.max(runs[0] ?? 0, runs.at(-1) ?? 0)
    const bandFrames = b.map((x, i) => ({ i, ...x })).filter((x) => x.run > steady + 24)
    expect(bandFrames.length === 0, `${seq.name}: BAND: no frame has a blank band the screens before and after do not`, { steady, worst: bandFrames.slice(0, 5) })
    const moved = s.filter((f) => f.scrollY !== feedY)
    expect(moved.length === 0, `${seq.name}: FEED: the feed's scroll never moves (${feedY})`, moved.slice(0, 4).map((f) => [f.t, f.scrollY]))
    const hidden = s.filter((f) => !f.tabSeen)
    expect(hidden.length === 0, `${seq.name}: TAB BAR: on screen on every frame`, { hiddenFrames: hidden.length })
    if (closing) {
      const goneAt = s.findIndex((f, i) => i > 0 && !f.pageSeen && s.slice(i).every((g) => !g.pageSeen))
      const after = goneAt >= 0 ? s.slice(goneAt, goneAt + 40) : []
      const cardBoxes = new Set(after.map((f) => JSON.stringify(f.card)))
      const anims = after.filter((f) => f.feedAnims > 0)
      expect(goneAt >= 0 && after.length >= 10 && anims.length === 0 && cardBoxes.size <= 1, `${seq.name}: LATE: once the post has gone nothing in the feed animates or moves`, { goneAtFrame: goneAt, framesAfter: after.length, animatingFrames: anims.length, cardBoxes: cardBoxes.size })
    }
    return { painted: seq.frames.length, sampled: s.length, doubled: doubled.length, bands: bandFrames.length, feedMoved: moved.length, tabHidden: hidden.length }
  }

  const summary = {}
  /* ── THE BROWSER: open, back, open, pull down ── */
  {
    const s = await session(false)
    const { p, cdp } = s
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 4, radiusY: 4, force: 1 }] })
    /* The picture's card just under the header, its top a little under it, as in the recording. */
    await p.evaluate(() => {
      const card = document.querySelector('article[data-post="p-pic"]')
      window.scrollTo(0, window.scrollY + card.getBoundingClientRect().top - 84)
    })
    await sleep(400)
    const feedY = await p.evaluate(() => Math.round(window.scrollY))
    const at = await p.evaluate(() => {
      const r = document.querySelector('article[data-post="p-pic"] [data-post-excerpt]').getBoundingClientRect()
      return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2) }
    })
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
    const tap = async (x, y) => {
      await touch("touchStart", x, y)
      await sleep(40)
      await touch("touchEnd", x, y)
    }
    const open1 = await record(s, "open", () => tap(at.x, at.y), 1600)
    await sleep(400)
    const back = await p.evaluate(() => {
      const b = document.querySelector("[data-post-fullscreen] [data-post-overlay-close]")
      const r = b?.getBoundingClientRect()
      return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), l: Math.round(r.left) } : null
    })
    const close1 = await record(s, "close-back", () => tap(back.x, back.y), 1800)
    await sleep(500)
    const open2 = await record(s, "open-again", () => tap(at.x, at.y), 1400)
    await sleep(400)
    const pull = await record(
      s,
      "close-pull",
      async () => {
        await touch("touchStart", 200, 260)
        for (let i = 1; i <= 14; i++) {
          await touch("touchMove", 200, 260 + i * 22)
          await sleep(16)
        }
        await touch("touchEnd", 200, 260 + 14 * 22)
      },
      1800,
    )
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    for (const seq of [open1, close1, open2, pull]) {
      const b = await bands(seq.frames)
      summary[seq.name] = judge(seq, b, feedY, seq.name.startsWith("close"))
      await sheet(seq, `${LABEL}-${seq.name}.png`)
    }
    expect(back && back.w >= 48 && back.h >= 48 && back.l <= 4, "BACK: the back button takes a tap 48px or more across, reaching the screen's edge", back)
    expect(!s.errors.length, "no page errors", s.errors.slice(0, 2))
    await p.close()
  }

  /* ── THE APP (iOS): the edge swipe ── */
  if (process.env.EDGE !== "0") {
    const s = await session(true)
    const { p, cdp } = s
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 4, radiusY: 4, force: 1 }] })
    await p.evaluate(() => {
      const card = document.querySelector('article[data-post="p-pic"]')
      window.scrollTo(0, window.scrollY + card.getBoundingClientRect().top - 120)
    })
    await sleep(300)
    const feedY = await p.evaluate(() => Math.round(window.scrollY))
    const at = await p.evaluate(() => {
      const r = document.querySelector('article[data-post="p-pic"] [data-post-excerpt]').getBoundingClientRect()
      return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2) }
    })
    await touch("touchStart", at.x, at.y)
    await sleep(40)
    await touch("touchEnd", at.x, at.y)
    await sleep(1200)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
    const edge = await record(
      s,
      "close-edge",
      async () => {
        await touch("touchStart", 6, 420)
        for (let i = 1; i <= 12; i++) {
          await touch("touchMove", 6 + i * 22, 422)
          await sleep(16)
        }
        await touch("touchEnd", 6 + 12 * 22, 422)
      },
      1800,
    )
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    const b = await bands(edge.frames)
    summary[edge.name] = judge(edge, b, feedY, true)
    const xs = edge.samples.filter((f) => f.pageBox).map((f) => f.pageBox[0])
    expect(xs.some((x) => x > 30 && x < 330), "EDGE: the page follows the finger to the right", xs.filter((_, i) => i % 4 === 0).slice(0, 12))
    await sheet(edge, `${LABEL}-close-edge.png`)
    expect(!s.errors.length, "no page errors in the app", s.errors.slice(0, 2))
    await p.close()
  }
  console.log(JSON.stringify({ label: LABEL, throttle: THROTTLE, summary }))
  console.log(`\n  sheets in ${shots}`)
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
