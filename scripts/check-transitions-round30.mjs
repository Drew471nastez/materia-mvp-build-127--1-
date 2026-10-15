/**
 * ===========================================================================
 *  ROUND 30, FILMED: OPENING A COMMUNITY, AND GOING INTO /app FROM THE DARK
 * ===========================================================================
 * The owner: "opening a community from Explore, it slides in from the side,
 * there is a flash and a white space during it, in dark mode too", and "in
 * dark mode, going from a community to the dashboard shows white while it
 * loads".
 *
 *   COMMUNITY  Explore's stand in, then the real community frame
 *              (scripts/render-community-shell.tsx ?from=explore) mounted in
 *              one commit, as the app router does. Every frame the screen
 *              paints is filmed (CDP screencast) and its average colour and
 *              its share of flash pixels (near white now, dark on the first
 *              and the last frame) are read; on every animation frame the
 *              frame's root has its transform, translate and opacity read.
 *              Light and dark, phone and computer, a member and a visitor.
 *   APP        A dark page left for an /app document (the head script of
 *              app/layout.tsx and the canvas rules of app/globals.css, as
 *              printed in the real <head>), filmed from the press until the
 *              shell has been on screen for a while: no frame with a light
 *              field in it before the shell, and the dark attribute is never
 *              on the /app document.
 *
 *   PROBE_CSS=source node scripts/check-transitions-round30.mjs [community app]
 *   SHOTS_DIR=... keeps the filmed frames to look at.
 */
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()))
const want = (s) => only.size === 0 || only.has(s)
const css = await appCss(root)
const fonts = interFaces(root)
const themeCss = readFileSync(join(root, "app/theme-dark.css"), "utf8")
const swiperCss = readFileSync(join(realpathSync(join(root, "node_modules/swiper")), "swiper.css"), "utf8")
const stubs = join(root, ".transitions30-probe")
const shots = process.env.SHOTS_DIR || null
if (shots) mkdirSync(shots, { recursive: true })
mkdirSync(stubs, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"

/* One filmed frame: its average colour, and per pixel whether it is near white. */
async function readFrame(b64) {
  const { data, info } = await sharp(Buffer.from(b64, "base64")).resize({ width: 195, fit: "inside" }).raw().toBuffer({ resolveWithObject: true })
  const n = info.width * info.height
  let r = 0, g = 0, b = 0
  const bright = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const R = data[i * info.channels], G = data[i * info.channels + 1], B = data[i * info.channels + 2]
    r += R; g += G; b += B
    bright[i] = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255 > 0.8 ? 1 : 0
  }
  return { avg: [Math.round(r / n), Math.round(g / n), Math.round(b / n)], bright, w: info.width, h: info.height }
}
/* A flash: pixels light now that are dark on both the frame before the move and the settled one. */
function flashShare(frame, first, last) {
  if (frame.bright.length !== first.bright.length || frame.bright.length !== last.bright.length) return 0
  let k = 0
  for (let i = 0; i < frame.bright.length; i++) if (frame.bright[i] && !first.bright[i] && !last.bright[i]) k++
  return k / frame.bright.length
}
const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

/* Every element on screen whose own background or border is light while the page is dark, and dark ink or icons on the
   dark ground: scripts/check-dark-pages.mjs lightPatches, the same rules, over the whole page rather than the window. */
const lightPatchesOf = (p) =>
  p.evaluate(() => {
    const out = []
    const parse = (rgb) => {
      const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(rgb || "")
      if (!m) return null
      return { l: (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255, a: m[4] === undefined ? 1 : Number(m[4]) }
    }
    const name = (el) => `${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).slice(0, 90)}`
    const KEEP = "img, video, picture, canvas, [data-community-mark], [data-keep-bright], [data-storelib-mark], [data-soft-img], iframe"
    for (const el of document.querySelectorAll("body *")) {
      if (el.closest(KEEP)) continue
      const b = el.getBoundingClientRect()
      if (b.width === 0 || b.height === 0) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === "hidden" || Number(cs.opacity) === 0 || cs.display === "none") continue
      let hiddenUp = false
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const s = getComputedStyle(a)
        if (Number(s.opacity) === 0 || s.visibility === "hidden") { hiddenUp = true; break }
      }
      if (hiddenUp) continue
      if (el instanceof SVGElement) {
        if (el.tagName.toLowerCase() === "svg" || b.width < 6) continue
        const fill = cs.fill === "none" ? null : parse(cs.fill)
        const stroke = cs.stroke === "none" ? null : parse(cs.stroke)
        const dark = (c) => c && c.a > 0.5 && c.l < 0.22
        const owner = el.closest("svg")
        const ob = owner ? getComputedStyle(owner) : null
        if ((dark(stroke) && parseFloat(cs.strokeWidth) > 0) || (dark(fill) && cs.fillOpacity !== "0")) {
          if (ob && Number(ob.opacity) > 0.1) out.push({ what: "dark icon", el: name(owner || el), fill: cs.fill, stroke: cs.stroke })
        }
        continue
      }
      if (b.width >= 14 && b.height >= 14) {
        const bg = parse(cs.backgroundColor)
        if (bg && bg.a > 0.35 && bg.l > 0.55) out.push({ what: "light background", el: name(el), bg: cs.backgroundColor })
        for (const side of ["Top", "Right", "Bottom", "Left"]) {
          const w = parseFloat(cs[`border${side}Width`])
          const c = parse(cs[`border${side}Color`])
          if (w >= 1 && c && c.a > 0.3 && c.l > 0.45) {
            out.push({ what: `light border ${side}`, el: name(el), color: cs[`border${side}Color`] })
            break
          }
        }
      }
      const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
      const ink = parse(cs.color)
      if (ownText && ink && ink.a > 0.5 && ink.l < 0.3) {
        let ground = null
        for (let a = el; a; a = a.parentElement) {
          const g = parse(getComputedStyle(a).backgroundColor)
          if (g && g.a > 0.5) { ground = g; break }
        }
        if (!ground || ground.l < 0.5) out.push({ what: "dark text", el: name(el), color: cs.color, text: el.textContent.trim().slice(0, 40) })
      }
    }
    const seen = new Set()
    return out.filter((o) => { const k = `${o.what}|${o.el}`; if (seen.has(k)) return false; seen.add(k); return true }).slice(0, 30)
  })

try {
  writeFileSync(join(stubs, "navigation.js"), `import { startTransition, useEffect, useState } from "react"
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: (h) => log("prefetch", h), back: () => log("back"), refresh: () => log("refresh") }
if (!window.__pushPatched) {
  window.__pushPatched = true
  const push = history.pushState.bind(history)
  history.pushState = (s, u, url) => { push(s, u, url); queueMicrotask(() => window.dispatchEvent(new Event("probe:path"))) }
}
export const usePathname = () => {
  const [p, setP] = useState(location.pathname)
  useEffect(() => {
    const on = () => startTransition(() => setP(location.pathname))
    window.addEventListener("probe:path", on)
    window.addEventListener("popstate", on)
    on()
    return () => { window.removeEventListener("probe:path", on); window.removeEventListener("popstate", on) }
  }, [])
  return p
}
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const useParams = () => ({})
export const useSelectedLayoutSegment = () => null
export const useSelectedLayoutSegments = () => []
export const permanentRedirect = () => {}
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined }) }
`)
  writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() {
  return {
    channel() { const ch = { on() { return ch }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 30); return ch }, track: async () => "ok", presenceState: () => ({}), send: async () => "ok" }; return ch },
    removeChannel() {},
    realtime: { setAuth: async () => {} },
    auth: { getSession: async () => ({ data: { session: { user: { id: "u-me" } } } }), getUser: async () => ({ data: { user: { id: "u-me", email: "sam@example.com", user_metadata: {} } }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({ error: null }) },
    from() { const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: null, error: null }), single: async () => ({ data: null, error: null }), then: (r) => r({ data: [], error: null }) }; return q },
  }
}
export const isNativePlatform = () => false
`)
  const { build } = await import("esbuild")
  const bundle = async (entry, out) => {
    await build({
      entryPoints: [join(root, entry)],
      bundle: true,
      format: "iife",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      alias: { "@": ".", "next/navigation": "./.transitions30-probe/navigation.js", "next/link": "./.transitions30-probe/link.jsx", "next/image": "./.transitions30-probe/image.jsx" },
      plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
      banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
      loader: { ".css": "empty" },
      outfile: join(stubs, out),
      logLevel: "error",
      absWorkingDir: root,
      nodePaths: [join(root, "node_modules")],
    })
    return readFileSync(join(stubs, out), "utf8")
  }
  const doc = (js, head = "") =>
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${head}<style>${fonts}${css}</style><style>${themeCss}</style><style>${swiperCss}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  /* The boots as lib/appearance prints them. */
  await build({ entryPoints: [join(root, "lib/appearance/site-appearance.ts")], bundle: true, format: "esm", platform: "neutral", outfile: join(stubs, "boots.mjs"), logLevel: "error" })

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], protocolTimeout: 240_000 })
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }

  /* Films `act` from just before it until `ms` after: every painted frame, decoded. */
  async function film(p, act, ms) {
    const cdp = await p.target().createCDPSession()
    const frames = []
    let t0 = Date.now()
    cdp.on("Page.screencastFrame", (f) => {
      frames.push({ t: Date.now() - t0, data: f.data })
      cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
    })
    await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 })
    await sleep(250)
    t0 = Date.now()
    const before = frames.length
    await act()
    await sleep(ms)
    await cdp.send("Page.stopScreencast")
    await cdp.detach().catch(() => {})
    /* The last frame before the act stands for the page as it was (at 0ms). */
    const from = frames.slice(Math.max(0, before - 1))
    return from.map((f, i) => ({ ...f, t: i === 0 && before > 0 ? 0 : Math.max(0, f.t) }))
  }

  /* ── COMMUNITY ─────────────────────────────────────────────────────────── */
  if (want("COMMUNITY")) {
    const shellJs = await bundle("scripts/render-community-shell.tsx", "shell.js")
    const page = doc(shellJs)
    for (const who of ["feed", "about-visitor"]) {
      for (const look of ["light", "dark"]) {
        for (const vp of [PHONE, DESK]) {
          const label = `${who === "feed" ? "member" : "visitor"} ${look} ${vp.width}`
          console.log(`\nCOMMUNITY: Explore to the community, ${label}`)
          const p = await browser.newPage()
          await p.setViewport(vp)
          const errors = []
          p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
          await p.setRequestInterception(true)
          p.on("request", (r) => {
            const url = r.url()
            if (url.startsWith(`${ORIGIN}/api/`)) {
              const short = url.replace(ORIGIN, "")
              let body = {}
              if (short.endsWith("/presence")) body = { ok: true, ready: true }
              else if (short.startsWith("/api/notifications")) body = { unread: 0, items: [], nextCursor: null, available: true }
              else if (short.includes("/dms")) body = { ready: true, unread: 0, conversations: [] }
              else if (short.startsWith("/api/me/places")) body = { signedIn: true, communitiesOn: true, isCreator: false, hasSellerAccess: true, recent: [] }
              return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
            }
            if (url.startsWith(`${ORIGIN}/`)) return r.respond({ status: 200, contentType: "text/html", body: page })
            if (url.startsWith("data:")) return r.continue()
            return r.respond({ status: 204, body: "" })
          })
          await p.goto(`${ORIGIN}/explore?case=${who}&from=explore`, { waitUntil: "load" })
          await p.evaluate(() => document.fonts.ready)
          /* The person's look, as this browser keeps it (the harness empties storage as it starts). */
          await p.evaluate((look) => {
            localStorage.setItem("storelib:appearance", look)
            window.dispatchEvent(new StorageEvent("storage", { key: "storelib:appearance" }))
          }, look)
          await sleep(600)
          const startDark = await p.evaluate(() => document.documentElement.hasAttribute("data-sl-dark"))
          expect(startDark === (look === "dark"), `${label}: Explore is in the ${look} look before the press`, { startDark })
          /* The root of the frame, read on every animation frame from the press. */
          const go = () =>
            p.evaluate(() => {
              const log = (window.__motion = [])
              const t0 = performance.now()
              const tick = () => {
                const el = document.querySelector("[data-community-shell], [data-community-public]")
                if (el) {
                  /* What is written on the root as it arrives: each animation's length and the properties it moves. */
                  if (!window.__anims) window.__anims = el.getAnimations().map((a) => ({ name: a.animationName || "script", ms: Number(a.effect?.getTiming().duration) || 0, props: [...new Set(a.effect?.getKeyframes().flatMap((k) => Object.keys(k).filter((x) => !["offset", "easing", "composite", "computedOffset"].includes(x))))] }))
                  const cs = getComputedStyle(el)
                  const st = document.querySelector("[data-arrival-still]")
                  log.push({ t: Math.round(performance.now() - t0), transform: cs.transform, translate: cs.translate, top: cs.top, opacity: Number(cs.opacity), stills: document.querySelectorAll("[data-leaving-still],[data-page-motion]").length, still: st ? Number(getComputedStyle(st).opacity) : null, bar: Math.round(el.querySelector("header")?.getBoundingClientRect().top ?? -1) })
                }
                if (performance.now() - t0 < 900) requestAnimationFrame(tick)
              }
              requestAnimationFrame(tick)
              window.__go()
            })
          const frames = await film(p, go, 900)
          const motion = await p.evaluate(() => window.__motion)
          const read = []
          for (const f of frames) read.push({ t: f.t, ...(await readFrame(f.data)) })
          const first = read[0]
          const last = read[read.length - 1]
          let worst = { share: 0, t: null }
          for (const f of read) {
            const s = flashShare(f, first, last)
            if (s > worst.share) worst = { share: +s.toFixed(4), t: f.t }
          }
          const moved = motion.filter((m) => (m.transform && m.transform !== "none") || (m.translate && m.translate !== "none" && m.translate !== "0px"))
          const avgs = read.map((f) => ({ t: f.t, avg: f.avg }))
          console.log(`    ${read.length} frames; average colour by frame: ${avgs.map((a) => `${a.t}ms ${a.avg.join(",")}`).join(" | ")}`)
          console.log(`    root by frame: ${motion.slice(0, 14).map((m) => `${m.t}ms o${m.opacity.toFixed(2)} ${m.translate}${m.transform === "none" ? "" : ` ${m.transform}`}`).join(" | ")}`)
          expect(moved.length === 0, `${label}: the community never moves sideways (no transform or translate on its root, any frame)`, moved.slice(0, 3))
          const fades = motion.filter((m) => m.opacity < 0.999)
          /* Changed on purpose (round 31): from Explore the frame is whole at once and Explore goes out over it, under its bar (lib/navigation/arrival-still.ts). */
          const going = motion.filter((m) => m.still !== null && m.still < 0.999)
          expect(fades.length > 0 || going.length > 0, `${label}: arrives on a fade (${fades.length} frames of the frame below full opacity, ${going.length} of Explore going out over it)`)
          /* What the root is given to play (the clock of a headless film is too uneven to time a 180ms fade by its frames). */
          const anims = await p.evaluate(() => window.__anims || [])
          /* Round 31: with Explore going out over it the frame plays nothing of its own; its bar stands where it lands. */
          const bars = [...new Set(motion.map((m) => m.bar))]
          expect(bars.length === 1, `${label}: the community's bar stands still from its first frame`, bars)
          expect(going.length > 0 || (anims.length > 0 && anims.every((a) => a.ms <= 200 && a.props.every((x) => x === "opacity" || x === "top"))), `${label}: one short fade on arrival, opacity only (a visitor's 2px settle is \`top\`, never sideways), 200ms at most`, anims)
          /* The document under the fade: the frame's own ground while it lands, the page's own again after. */
          const ground = await p.evaluate(() => ({ html: document.documentElement.style.backgroundColor, body: document.body.style.backgroundColor }))
          /* <html> carries the bar's own colour inline (lib/ui/light-chrome, for the strip under the clock), so only <body> is read here. */
          expect(!ground.body, `${label}: the ground held under the landing is put back afterwards`, ground)
          if (look === "dark") {
            const lightest = Math.max(...read.map((f) => lum(f.avg)))
            expect(worst.share < 0.003, `${label}: no frame has a light field that is dark before and after (worst share of the screen)`, worst)
            expect(lightest <= Math.max(lum(first.avg), lum(last.avg)) + 0.03, `${label}: no frame is brighter on average than the pages on either side of it`, { lightest: +lightest.toFixed(3), from: +lum(first.avg).toFixed(3), to: +lum(last.avg).toFixed(3) })
          } else {
            expect(worst.share < 0.003, `${label}: no frame flashes light over the pages on either side`, worst)
          }
          const dark = await p.evaluate(() => ({ attr: document.documentElement.hasAttribute("data-sl-dark"), frame: document.querySelector("[data-community-theme]")?.getAttribute("data-community-theme") }))
          expect(dark.attr === (look === "dark") && dark.frame === look, `${label}: the community is in the ${look} look once there`, dark)
          expect(errors.length === 0, `${label}: no page errors`, errors)
          if (shots) {
            const dir = join(shots, `community-${label.replace(/\s+/g, "-")}`)
            mkdirSync(dir, { recursive: true })
            for (const f of frames) writeFileSync(join(dir, `${String(f.t).padStart(5, "0")}ms.png`), Buffer.from(f.data, "base64"))
          }
          await p.close()
        }
      }
    }
  }

  /* ── APP ───────────────────────────────────────────────────────────────── */
  if (want("APP")) {
    const http = await import("node:http")
    /* The boots as the root layout prints them: the appearance's from its module, the /app canvas class from app/layout.tsx itself. */
    const boots = await import(join(stubs, "boots.mjs"))
    const layoutSrc = readFileSync(join(root, "app/layout.tsx"), "utf8")
    const canvasBoot = /try\{if\(\/\^\\\\\/app\(\\\\\/\|\$\)\/\.test\(location\.pathname\)\)\{document\.documentElement\.classList\.add\('app-layout','app-arriving'\)\}\}catch\(e\)\{\}/.exec(layoutSrc)?.[0]?.replace(/\\\\/g, "\\")
    expect(!!canvasBoot, "app/layout.tsx still marks an arriving /app document in <head> (app-layout, app-arriving)")
    const appJs = await bundle("scripts/render-app-from-dark.tsx", "app.js")
    const BODY_LATE_MS = 700
    /* The real order in <head>: the canvas class, the person's look, the veil. APP_BASELINE=1 leaves the veil out, to film what it was. */
    const headFor = () =>
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>${canvasBoot || ""}</script><script>${boots.APPEARANCE_BOOT}</script>${process.env.APP_BASELINE ? "" : `<script>${boots.APP_FROM_DARK_BOOT}</script>`}<style>${fonts}${css}</style><style>${themeCss}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head>`
    const server = http.createServer((req, res) => {
      const path = (req.url || "/").split("?")[0]
      if (path.startsWith("/api/")) {
        res.writeHead(200, { "content-type": "application/json" })
        return res.end("{}")
      }
      if (path === "/favicon.ico") return res.writeHead(204).end()
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" })
      res.write(headFor())
      const body = `<body><div id="app"></div><script>${appJs.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
      /* The dashboard's body comes late, as a server render does: the frames before it are the head's alone. */
      if (/^\/app(\/|$)/.test(path)) setTimeout(() => res.end(body), BODY_LATE_MS)
      else res.end(body)
    })
    await new Promise((r) => server.listen(0, "127.0.0.1", r))
    const base = `http://127.0.0.1:${server.address().port}`
    for (const vp of [PHONE, DESK]) {
      const label = `dark page to /app ${vp.width}${process.env.APP_BASELINE ? " (baseline, no veil)" : ""}`
      console.log(`\nAPP: ${label}`)
      const p = await browser.newPage()
      await p.setViewport(vp)
      const errors = []
      p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
      /* In every document, from its first line: the veil's opacity, the classes and the dark attribute on every animation frame. */
      await p.evaluateOnNewDocument(() => {
        const log = (window.__veil = [])
        const tick = () => {
          const h = document.documentElement
          if (h) {
            const after = getComputedStyle(h, "::after")
            log.push({ t: Math.round(performance.now()), veil: after.content !== "none" && after.content !== "normal" ? Number(after.opacity) : null, dark: h.hasAttribute("data-sl-dark"), arriving: h.classList.contains("app-arriving"), shell: !!document.querySelector("[data-probe-app-shell]") })
          }
          if (performance.now() < 4000) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      await p.goto(`${base}/community/clay-studio`, { waitUntil: "load" })
      await p.evaluate(() => localStorage.setItem("storelib:appearance", "dark"))
      await p.goto(`${base}/community/clay-studio`, { waitUntil: "load" })
      await sleep(500)
      const before = await p.evaluate(() => ({ dark: document.documentElement.hasAttribute("data-sl-dark"), look: sessionStorage.getItem("storelib:look-now") }))
      expect(before.dark && before.look === "dark", `${label}: the page left is dark, and the tab says so`, before)
      const frames = await film(p, () => p.click("[data-probe-to-app]"), 2200)
      const log = await p.evaluate(() => window.__veil)
      const read = []
      for (const f of frames) read.push({ t: f.t, ...(await readFrame(f.data)) })
      const brightShare = (f) => f.bright.reduce((a, b) => a + b, 0) / f.bright.length
      console.log(`    ${read.length} frames; average colour, light share: ${read.map((f) => `${f.t}ms ${f.avg.join(",")} ${(brightShare(f) * 100).toFixed(0)}%`).join(" | ")}`)
      const first = read[0]
      /* The first frame of the new document: the first that is not the dark page any more. */
      const changed = read.findIndex((f, i) => i > 0 && Math.abs(lum(f.avg) - lum(first.avg)) > 0.01)
      const arrival = changed > 0 ? read[changed] : null
      const veilFrames = log.filter((l) => l.veil !== null)
      const firstFrame = log[0]
      const shellAt = log.find((l) => l.shell)?.t ?? null
      const veilGoneAt = log.find((l) => l.veil !== null && l.veil < 0.05)?.t ?? null
      const veilFullUntil = [...log].reverse().find((l) => l.veil !== null && l.veil > 0.98)?.t ?? null
      console.log(`    /app document: first frame ${firstFrame?.t}ms veil ${firstFrame?.veil}; shell drawn ${shellAt}ms; veil full until ${veilFullUntil}ms, gone by ${veilGoneAt}ms`)
      if (process.env.APP_BASELINE) {
        console.log(`    baseline: the first new frame ${arrival ? `${arrival.t}ms ${arrival.avg.join(",")}, light share ${(brightShare(arrival) * 100).toFixed(0)}%` : "not seen"}`)
      } else {
        expect(!!firstFrame && firstFrame.veil !== null && firstFrame.veil > 0.98, `${label}: the veil is up on the /app document's very first frame`, firstFrame)
        expect(!!arrival && lum(arrival.avg) < 0.15 && brightShare(arrival) < 0.01, `${label}: the first frame after the dark page is dark too, with no light field`, arrival && { t: arrival.t, avg: arrival.avg, light: +brightShare(arrival).toFixed(3) })
        expect(shellAt !== null && veilFullUntil !== null && veilFullUntil >= shellAt - 20, `${label}: the veil holds until the shell is drawn`, { shellAt, veilFullUntil })
        const fadeFrames = log.filter((l) => l.veil !== null && l.veil > 0.05 && l.veil < 0.95)
        expect(veilGoneAt !== null && veilGoneAt - (veilFullUntil ?? 0) <= 400 && fadeFrames.length >= 1, `${label}: then it fades off, ${boots.APP_FROM_DARK_MS}ms written (frames part way: ${fadeFrames.length})`, { from: veilFullUntil, gone: veilGoneAt })
        /* After it, the screen only gets lighter as the veil goes: never a frame lighter than the one after it (a flash and back). */
        const after = read.slice(Math.max(1, changed))
        const dips = after.filter((f, i) => i + 1 < after.length && lum(f.avg) > lum(after[i + 1].avg) + 0.04)
        expect(dips.length === 0, `${label}: from the dark page to the dashboard the screen only lightens, it never flashes light and back`, dips.map((f) => ({ t: f.t, avg: f.avg })))
      }
      const end = await p.evaluate(() => ({ path: location.pathname, dark: document.documentElement.hasAttribute("data-sl-dark"), classes: document.documentElement.className, everDark: (window.__veil || []).some((l) => l.dark) }))
      expect(end.path === "/app" && !end.dark && !end.everDark, `${label}: /app is never dark, on any frame`, end)
      expect(!/app-from-dark|app-arriving/.test(end.classes), `${label}: the veil and the canvas are both gone once the shell is up`, end.classes)
      const look = await p.evaluate(() => sessionStorage.getItem("storelib:look-now"))
      expect(look === "light", `${label}: the tab now says light, so a reload of /app opens with no veil`, look)
      expect(errors.length === 0, `${label}: no page errors`, errors)
      if (shots) {
        const dir = join(shots, `app-${vp.width}${process.env.APP_BASELINE ? "-baseline" : ""}`)
        mkdirSync(dir, { recursive: true })
        for (const f of frames) writeFileSync(join(dir, `${String(f.t).padStart(5, "0")}ms.png`), Buffer.from(f.data, "base64"))
      }
      await p.close()
    }
    server.close()
  }

  /* ── PRODUCT ─────────────────────────────────────────────────────────────── */
  if (want("PRODUCT")) {
    const pic = (bg, fg) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" width="1200" height="900"><rect width="1200" height="900" fill="${bg}"/><ellipse cx="600" cy="560" rx="300" ry="190" fill="${fg}"/></svg>`)}`
    const FIX = {
      product: { id: "p-1", slug: "glaze-notes", title: "Glaze notes for cone 6", description: "<p>Forty tested recipes with photos of each on two clay bodies, and the firing schedule that made them.</p>", price_cents: 2400, compare_at_cents: null, currency: "usd", type: "digital", status: "published", creator_id: "cr-1", thumbnail_url: pic("#d9cbb6", "#a9845c"), images: [pic("#d9cbb6", "#a9845c"), pic("#cfdbd5", "#6f8f7f")], category: "design", product_categories: [{ category: { id: "c-1", name: "Design", slug: "design", type: "digital" } }], whats_included: ["40 recipes", "Firing schedule"], faqs: [], created_at: new Date().toISOString() },
      creator: { id: "cr-1", user_id: "u-1", name: "Mara Lindqvist", slug: "mara", username: "mara" },
      profile: { id: "u-1", display_name: "Mara Lindqvist", username: "mara", avatar_url: pic("#e8d5c4", "#8a5a3c") },
    }
    const stubFiles = {
      "data.js": `const C = () => globalThis.__productCase || "default"
const FIX = ${JSON.stringify(FIX)}
const own = { published_config: { globalSettings: { themePreset: "sage" }, globalColors: {}, headerSettings: {} } }
export const loadProductBySlug = async () => ({ product: FIX.product, viaHistory: false })
export const loadCreator = async () => FIX.creator
export const loadCreatorProfile = async () => FIX.profile
export const loadStoreConfig = async () => (C() === "custom" ? own : null)
export const loadProductPageConfig = async () => null
`,
      "cache.js": `const pic = ${JSON.stringify(FIX.product.images[1])}
export const PRODUCT_CACHE_TTL = 60
export const productTag = (s) => "product:" + s
export const creatorTag = (c) => "creator:" + c
export const PRODUCT_SELECT = "*"
export const VARIANT_SELECT = "*"
export const cachedProductBySlug = async () => null
export const cachedCreator = async () => null
export const cachedCreatorProfile = async () => null
export const cachedStoreConfig = async () => null
export const cachedProductPageConfig = async () => null
export const cachedVariants = async () => []
export const cachedProductAssets = async () => [{ id: "a-1", file_name: "glaze-notes.pdf" }]
export const cachedCourseOutline = async () => null
export const cachedMoreFromCreator = async () => [1, 2, 3].map((i) => ({ id: "m-" + i, slug: "more-" + i, title: ["Trimming guide", "Kiln log sheet", "Wax resist basics"][i - 1], price_cents: 900 * i, compare_at_cents: null, type: "digital", thumbnail_url: pic, images: [pic], creator_id: "cr-1", status: "published" }))
export const cachedReviews = async () => [{ id: "r-1", product_id: "p-1", rating: 5, content: "The photos on two clay bodies saved me a month of test tiles.", created_at: new Date().toISOString(), reviewer_name: "Jonas", buyer: { id: "u-2", display_name: "Jonas Berg", avatar_url: null } }, { id: "r-2", product_id: "p-1", rating: 4, content: "Clear and tested. The schedule worked in my small kiln.", created_at: new Date().toISOString(), reviewer_name: "Priya", buyer: { id: "u-3", display_name: "Priya Raman", avatar_url: null } }]
`,
      "supabase.js": `const result = { data: null, error: null, count: 0 }
function q() { const b = new Proxy(function () {}, { get(_, k) { if (k === "then") return (res) => res({ data: [], error: null, count: 0 }); if (k === "maybeSingle" || k === "single") return async () => result; return () => b }, apply() { return b } }); return b }
const client = { from: () => q(), rpc: async () => ({ data: null, error: null }), auth: { getUser: async () => ({ data: { user: null }, error: null }), getSession: async () => ({ data: { session: null } }) }, storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) } }
export async function createClient() { return client }
export function createAdminClient() { return client }
export function createPublicReadClient() { return client }
export function createServiceClient() { return client }
export default client
`,
      "auth.js": `export const currentUserForRequest = async () => ({ user: null })
export const profileForRequest = async () => null
export const creatorForRequest = async () => null
export const sellerAccessForRequest = async () => null
`,
      "headers.js": `export async function headers() { return new Headers({ host: "storelib.com" }) }
export async function cookies() { return { get: () => undefined, getAll: () => [], has: () => false } }
export async function draftMode() { return { isEnabled: false } }
`,
      "cache-next.js": `export const unstable_cache = (fn) => fn
export const revalidateTag = () => {}
export const revalidatePath = () => {}
export const unstable_noStore = () => {}
`,
      "navigation-server.js": `export const notFound = () => { throw new Error("notFound") }
export const redirect = (u) => { throw new Error("redirect " + u) }
export const permanentRedirect = (u) => { throw new Error("permanentRedirect " + u) }
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const usePathname = () => "/mara/glaze-notes"
export const useSearchParams = () => new URLSearchParams("layout=discover&recommended=1")
export const useParams = () => ({})
`,
      "empty.js": "export {}\n",
    }
    for (const [f, src] of Object.entries(stubFiles)) writeFileSync(join(stubs, f), src)
    const STUB = {
      "lib/commerce/product-page-data": "data.js",
      "lib/commerce/product-page-cache": "cache.js",
      "lib/supabase/server": "supabase.js",
      "lib/supabase/admin": "supabase.js",
      "lib/supabase/public-read": "supabase.js",
      "lib/auth/request-scope": "auth.js",
    }
    await build({
      entryPoints: [join(root, "scripts/render-product-page-ssr30.tsx")],
      bundle: true,
      format: "esm",
      platform: "node",
      target: "es2022",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      alias: { "@": ".", "next/headers": "./.transitions30-probe/headers.js", "next/cache": "./.transitions30-probe/cache-next.js", "next/navigation": "./.transitions30-probe/navigation-server.js", "next/link": "./.transitions30-probe/link.jsx", "next/image": "./.transitions30-probe/image.jsx", "server-only": "./.transitions30-probe/empty.js" },
      plugins: [{ name: "data-stubs", setup(b) { b.onResolve({ filter: /.*/ }, (a) => { for (const [k, f] of Object.entries(STUB)) if (a.path.endsWith(k) || a.path === `@/${k}`) return { path: join(stubs, f) } ; return undefined }) } }],
      banner: { js: "import { createRequire as __cr } from 'module'; import { fileURLToPath as __fu } from 'url'; import { dirname as __dn } from 'path'; const require = __cr(import.meta.url); const __filename = __fu(import.meta.url); const __dirname = __dn(__filename);" },
      loader: { ".css": "empty", ".png": "empty", ".svg": "empty" },
      outfile: join(stubs, "product.mjs"),
      logLevel: "error",
      absWorkingDir: root,
      nodePaths: [join(root, "node_modules")],
    })
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://placeholder.supabase.co"
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "placeholder"
    const { renderProduct } = await import(join(stubs, "product.mjs"))
    for (const which of ["default", "custom"]) {
      let markup = ""
      try {
        markup = await renderProduct(which)
      } catch (e) {
        expect(false, `product ${which}: the page renders`, String(e?.stack || e).split("\n").slice(0, 6).join(" | "))
        continue
      }
      const ownLook = /data-own-look=""/.test(markup)
      const followsLook = /data-product-look="site"/.test(markup)
      console.log(`\nPRODUCT: ${which}, ${markup.length} characters of HTML; own look ${ownLook}, follows the person's look ${followsLook}`)
      if (which === "custom") {
        /* Changed on purpose (round 31): no boot takes the dark look off the document; the dark sheet leaves [data-own-look] out, so the Storelib header and the sheets around the creator's page follow the person (lib/appearance/site-appearance, WHOSE LOOK, PART BY PART). */
        expect(ownLook && !followsLook && !/removeAttribute\("data-sl-dark"\)/.test(markup), "custom: a creator's own scheme keeps its look (data-own-look), and nothing takes the dark look off the document")
      } else {
        expect(followsLook && !ownLook, "default: the platform's default look follows the person's look (data-product-look=\"site\", no data-own-look)")
      }
      for (const vp of [PHONE, DESK]) {
        for (const look of ["light", "dark"]) {
          const p = await browser.newPage()
          await p.setViewport(vp)
          const errors = []
          p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
          const head = `<script>${look === "dark" ? `localStorage.setItem("storelib:appearance","dark");` : `localStorage.removeItem("storelib:appearance");`}</script><script>${(await import(join(stubs, "boots.mjs")).catch(() => null))?.APPEARANCE_BOOT ?? ""}</script>`
          const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${head}<style>${fonts}${css}</style><style>${themeCss}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body>${markup}</body></html>`
          await p.setRequestInterception(true)
          p.on("request", (r) => (r.url().startsWith(ORIGIN) ? r.respond({ status: 200, contentType: "text/html", body: html }) : r.url().startsWith("data:") ? r.continue() : r.respond({ status: 204, body: "" })))
          await p.goto(`${ORIGIN}/mara/glaze-notes?layout=discover&recommended=1`, { waitUntil: "load" })
          await sleep(400)
          const state = await p.evaluate(() => ({ dark: document.documentElement.hasAttribute("data-sl-dark"), ground: getComputedStyle(document.querySelector("[data-product-look], [data-own-look]") || document.body).backgroundColor }))
          const label = `product ${which} ${look} ${vp.width}`
          if (which === "custom") {
            /* Changed on purpose (round 31): <html> is in the person's look; the creator's page keeps its own ground in it. */
            expect(state.dark === (look === "dark") && state.ground === "rgb(238, 241, 234)", `${label}: <html> is in the person's look, the creator's page keeps its own ground`, state)
          } else {
            expect(state.dark === (look === "dark"), `${label}: <html> is in the person's ${look} look`, state)
            if (look === "dark") {
              const patches = await lightPatchesOf(p)
              expect(patches.length === 0, `${label}: nothing left light, and no dark ink or icon on the dark ground`, patches)
              expect(lum((/\d+,\s*\d+,\s*\d+/.exec(state.ground)?.[0] || "255,255,255").split(",").map(Number)) < 0.12, `${label}: the page's ground is the dark one`, state.ground)
            }
          }
          if (shots) await p.screenshot({ path: join(shots, `product-${which}-${look}-${vp.width}.png`), fullPage: true })
          await p.close()
        }
      }
    }
  }

  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
