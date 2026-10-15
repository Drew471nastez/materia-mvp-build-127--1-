/**
 * ===========================================================================
 *  ROUND 29, COURSES AND THE PLAYER, LOOKED AT AND MEASURED
 * ===========================================================================
 * The real components in Chromium, light and dark (html[data-sl-dark] with
 * app/theme-dark.css), at 1440 and 390:
 *
 *   the library's courses tab   scripts/render-course-player.tsx, "index"
 *   the course player           scripts/render-course-player.tsx, "player"
 *   a lesson in a community     scripts/render-learn18.tsx (the embedded player)
 *
 *   NO ORANGE   no element's computed colour, background, border, fill,
 *               stroke, outline or shadow is orange (r > 200, g 80 to 140,
 *               b < 60)
 *   RINGS       every percentage ring's number, or its check, sits inside the
 *               ring's inner edge with at least 2px to spare
 *   SWITCH      the filter's indicator moves by transform only: on every
 *               frame its width holds and its left edge only travels one
 *               way, it ends on the chosen tab, and the arrow keys move it
 *   BACK        the arrow at the top left stays where it is on hover and on
 *               press (no horizontal move)
 *   MEDIA       the video's box is there before the video, at 16:9; the
 *               video shows only once it has a frame (opacity), and a change
 *               of lesson never changes the box's height or shows a frame of
 *               nothing in its place
 *   DARK        no light surface or hairline left in the dark look
 *   PHONE       nothing scrolls sideways at 390
 *
 * Pictures go to SHOTS_DIR (.round29-shots by default) to look at.
 *
 *   PROBE_CSS=source [ONLY=screens,switch,back,media,phone,controls] node scripts/check-courses-round29.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { spawn } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const FFMPEG = process.env.FFMPEG_PATH || "/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux"
const css = await appCss(root)
const fonts = interFaces(root)
const themeCss = readFileSync(join(root, "app/theme-dark.css"), "utf8")
const work = mkdtempSync(join(tmpdir(), "storelib-round29-"))
const shots = process.env.SHOTS_DIR || join(root, ".round29-shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

writeFileSync(join(work, "navigation.js"), `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: () => {}, back: () => log("back"), refresh: () => {} }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(work, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__links ||= []).push(href) } } }, children) })
`)
writeFileSync(join(work, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, quality, ...rest }) { return React.createElement("img", { src, alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" } : undefined, ...rest }) }
`)

const { build } = await import("esbuild")
async function bundle(entry, out) {
  await build({
    entryPoints: [join(root, entry)],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": join(work, "navigation.js"), "next/link": join(work, "link.jsx"), "next/image": join(work, "image.jsx") },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(work, out),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  return readFileSync(join(work, out), "utf8")
}
const BUNDLES = {
  library: await bundle("scripts/render-course-player.tsx", "library.js"),
  learn: await bundle("scripts/render-learn18.tsx", "learn.js"),
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--hide-scrollbars"], protocolTimeout: 240_000 })
/*
  A MOUSE FOR THE COMPUTER (as scripts/check-account-film.mjs does). Headless Chromium answers no to (hover: hover)
  whatever its flags say, so the computer's page gets the stylesheets with that query answered yes and a matchMedia
  that says it has a fine pointer that hovers; the phone's page keeps both as they are, as a phone answers.
*/
const withMouse = (sheet) => sheet.replace(/@media\s*\(\s*hover\s*:\s*hover\s*\)(\s*and\s*\(\s*pointer\s*:\s*fine\s*\))?/g, "@media all")
const MOUSE_JS = `{ const mm = window.matchMedia.bind(window); window.matchMedia = (q) => mm(/hover:\\s*none|pointer:\\s*coarse/.test(q) && !/hover:\\s*hover|pointer:\\s*fine/.test(q) ? "not all" : /hover:\\s*hover|pointer:\\s*fine/.test(q) ? "all" : q) }`

/* A real video: 20 seconds of numbered frames, VP8 in WebM, 16:9. */
async function makeVideo() {
  const page = await browser.newPage()
  await page.setViewport({ width: 640, height: 360 })
  const ff = spawn(FFMPEG, ["-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", "2", "-i", "pipe:0", "-c:v", "vp8", "-b:v", "300k", "-f", "webm", join(work, "video.webm")], { stdio: ["pipe", "ignore", "inherit"] })
  const done = new Promise((r) => ff.on("close", r))
  for (let i = 0; i < 40; i++) {
    await page.setContent(`<body style="margin:0;width:640px;height:360px;display:flex;align-items:center;justify-content:center;background:hsl(${(i * 9) % 360},35%,30%);color:#fff;font:600 54px system-ui">0:${String(Math.floor(i / 2)).padStart(2, "0")}</body>`)
    ff.stdin.write(await page.screenshot({ type: "jpeg", quality: 70 }))
  }
  ff.stdin.end()
  await done
  await page.close()
  return readFileSync(join(work, "video.webm"))
}
const video = await makeVideo()
const thumb = (hue) => `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="hsl(${hue},28%,72%)"/><circle cx="470" cy="120" r="50" fill="hsl(${hue},30%,45%)" opacity="0.6"/><path d="M0 300 L220 180 L380 270 L520 210 L640 270 L640 360 L0 360Z" fill="hsl(${hue},30%,38%)"/></svg>`
const COVER = thumb(150)
const EMBED = `<!doctype html><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#202020;color:#fff;font:600 28px system-ui">YouTube embed</body>`

/* The routes the player calls. Lesson 3 of the community's program is a YouTube embed and lesson 4 is text; every other lesson is a video. */
const fetchStub = (kinds, delay) => `
window.__calls = []
const realFetch = window.fetch
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url
  window.__calls.push(url)
  const json = (x, status = 200) => new Response(JSON.stringify(x), { status, headers: { "Content-Type": "application/json" } })
  const m = /\\/api\\/courses\\/lessons\\/([^/]+)\\/play/.exec(url)
  if (m) {
    await new Promise((r) => setTimeout(r, ${delay}))
    const n = Number(m[1].slice(-2))
    const kind = (${JSON.stringify(kinds)})[n] || "video"
    if (kind === "video") return json({ kind, url: "/__video.webm?l=" + n, expiresAt: Date.now() + 3600000, mime: "video/webm", captions: null, access: "owner" })
    if (kind === "external") return json({ kind, provider: "youtube", embedUrl: "/__embed?l=" + n, access: "owner" })
    return json({ kind: "text", access: "owner" })
  }
  if (url.includes("/api/courses/progress")) return json({ kept: true })
  if (url.includes("/api/courses/reminders")) return json({ ok: true })
  return realFetch(input, init)
}
navigator.sendBeacon = () => true
`

const SCREENS = {
  index: { bundle: "library", mode: "index", path: "/account/library/courses", kinds: {} },
  player: { bundle: "library", mode: "player", path: "/account/library/courses/p1", kinds: {} },
  learn: { bundle: "learn", mode: "player", path: "/community/salajanywood/learn/prog-1?lesson=lesson-1", kinds: { 3: "external", 4: "text" } },
}

const SAMPLER = `window.__frames = []
requestAnimationFrame(function tick() {
  const stage = document.querySelector("[data-lesson-stage]")
  const v = document.querySelector("[data-lesson-video] video")
  const r = stage && stage.getBoundingClientRect()
  window.__frames.push({ h: r ? Math.round(r.height) : 0, w: r ? Math.round(r.width) : 0, ready: v ? v.readyState : -1, o: v ? +getComputedStyle(v).opacity : -1 })
  requestAnimationFrame(tick)
})`

async function open(screen, vp, dark, delay = 250, sample = false) {
  const s = SCREENS[screen]
  const page = await browser.newPage()
  const mouse = !vp.hasTouch
  await page.setViewport(vp)
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.clear()
    } catch {}
  })
  /* The dark look as lib/appearance's boot puts it on: the attribute and the colour scheme on <html> before the first paint. */
  const html = `<!doctype html><html${dark ? ' data-sl-dark="" style="color-scheme:dark"' : ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${mouse ? withMouse(css) : css}</style><style>${mouse ? withMouse(themeCss) : themeCss}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style><script>${mouse ? MOUSE_JS : ""};window.__MODE=${JSON.stringify(s.mode)};${fetchStub(s.kinds, delay)}${sample ? SAMPLER : ""}</script></head><body><div id="app"></div><script>${BUNDLES[s.bundle].replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const u = new URL(r.url())
    if (u.pathname === s.path.split("?")[0]) return r.respond({ status: 200, contentType: "text/html", body: html })
    /* A course's picture comes through the image route (components/ui/soft-img.tsx). */
    if (u.pathname === "/_next/image") {
      const inner = u.searchParams.get("url") || ""
      return r.respond({ status: 200, contentType: "image/svg+xml", body: inner.includes("cover") ? COVER : thumb(inner.includes("b") ? 210 : 28) })
    }
    if (u.pathname.startsWith("/__img/")) return r.respond({ status: 200, contentType: "image/svg+xml", body: u.pathname.includes("cover") ? COVER : thumb(u.pathname.includes("b") ? 210 : 28) })
    if (u.pathname === "/__embed") return r.respond({ status: 200, contentType: "text/html", body: EMBED })
    if (u.pathname === "/__video.webm") {
      const range = /bytes=(\d+)-(\d*)/.exec(r.headers().range || "")
      if (!range) return r.respond({ status: 200, headers: { "Accept-Ranges": "bytes", "Content-Type": "video/webm", "Content-Length": String(video.length) }, body: video })
      const start = Number(range[1])
      const end = range[2] ? Math.min(Number(range[2]), video.length - 1) : video.length - 1
      return r.respond({ status: 206, headers: { "Content-Range": `bytes ${start}-${end}/${video.length}`, "Accept-Ranges": "bytes", "Content-Type": "video/webm", "Content-Length": String(end - start + 1) }, body: video.subarray(start, end + 1) })
    }
    if (u.protocol === "data:") return r.continue()
    return r.respond({ status: 204, body: "" })
  })
  await page.goto(`https://storelib.com${s.path}`, { waitUntil: "load" })
  await page.evaluate(() => document.fonts.ready)
  return { page, errors }
}

/* ── Measures run in the page ─────────────────────────────────────────── */

const ORANGE = () => {
  const out = []
  const orange = (s) => {
    for (const m of String(s).matchAll(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/g)) {
      const [r, g, b, a] = [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]]
      if (a > 0.05 && r > 200 && g >= 80 && g <= 140 && b < 60) return m[0]
    }
    return null
  }
  const PROPS = ["color", "backgroundColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor", "outlineColor", "fill", "stroke", "boxShadow", "textDecorationColor", "accentColor", "caretColor", "backgroundImage"]
  for (const el of document.querySelectorAll("body *")) {
    if (el.closest("video, img, iframe")) continue
    const cs = getComputedStyle(el)
    for (const p of PROPS) {
      const hit = orange(cs[p])
      if (hit) out.push(`${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).slice(0, 60)} ${p}=${hit}`)
    }
    for (const pseudo of ["::before", "::after"]) {
      const ps = getComputedStyle(el, pseudo)
      if (ps.content === "none") continue
      for (const p of ["backgroundColor", "boxShadow", "borderTopColor"]) {
        const hit = orange(ps[p])
        if (hit) out.push(`${el.tagName.toLowerCase()}${pseudo} ${p}=${hit}`)
      }
    }
  }
  return out
}

/* Every ring: its number's or check's box against the ring's inner edge. */
const RINGS = () =>
  [...document.querySelectorAll("[data-course-ring], [data-progress-ring]")]
    .filter((el) => el.getBoundingClientRect().width > 0)
    .map((el) => {
      const svg = el.querySelector("svg")
      const s = svg.getBoundingClientRect()
      const vb = svg.viewBox.baseVal
      const scale = s.width / (vb?.width || s.width)
      const track = svg.querySelector("circle")
      const r = Number(track.getAttribute("r"))
      const sw = Number(track.getAttribute("stroke-width") || getComputedStyle(track).strokeWidth.replace("px", ""))
      const inner = (r - sw / 2) * scale
      const cx = s.left + s.width / 2
      const cy = s.top + s.height / 2
      const label = el.querySelector("[data-ring-label]") || el.querySelector("span")
      let box = null
      let what = ""
      const icon = label?.querySelector("svg")
      if (icon) {
        box = icon.getBoundingClientRect()
        what = "check"
      } else if (label) {
        const range = document.createRange()
        range.selectNodeContents(label)
        box = range.getBoundingClientRect()
        what = label.textContent
      }
      if (!box) return { what: "none", fits: true }
      const far = Math.max(...[[box.left, box.top], [box.right, box.top], [box.left, box.bottom], [box.right, box.bottom]].map(([x, y]) => Math.hypot(x - cx, y - cy)))
      return { what, ring: Math.round(s.width), inner: +inner.toFixed(1), far: +far.toFixed(1), spare: +(inner - far).toFixed(1), fits: far <= inner - 2 }
    })

const LIGHT = () => {
  const out = []
  const parse = (rgb) => {
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(rgb || "")
    if (!m) return null
    return { l: (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255, a: m[4] === undefined ? 1 : Number(m[4]) }
  }
  for (const el of document.querySelectorAll("body *")) {
    /* The player's own surface is black in both looks, and its white buttons on black are meant. A progress fill ([data-ink]) is light ink in the dark look on purpose. */
    if (el.closest("img, video, iframe, [data-lesson-video], [data-stage-still], [data-keep-bright], [data-ink]")) continue
    const b = el.getBoundingClientRect()
    if (b.width < 6 || b.height < 6 || b.bottom < 0 || b.top > innerHeight) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === "hidden" || +cs.opacity === 0) continue
    const bg = parse(cs.backgroundColor)
    if (bg && bg.a > 0.3 && bg.l > 0.55) out.push(`bg ${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).slice(0, 70)} ${cs.backgroundColor}`)
    const bc = parse(cs.borderTopColor)
    if (bc && parseFloat(cs.borderTopWidth) > 0 && bc.a > 0.3 && bc.l > 0.55) out.push(`border ${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).slice(0, 70)} ${cs.borderTopColor}`)
  }
  return out.slice(0, 12)
}

const sideScroll = (page) => page.evaluate(() => ({ scroll: document.scrollingElement.scrollWidth, width: innerWidth }))

const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
const VIEWS = [
  ["1440", DESK],
  ["390", PHONE],
]

/* ONLY=screens,switch,back,media,phone,controls runs those sections alone. */
const want = (s) => !process.env.ONLY || process.env.ONLY.split(",").includes(s)

try {
  /* ── Every screen, both looks, both widths: colour, rings, light patches, pictures ── */
  if (want("screens")) for (const [w, vp] of VIEWS) {
    for (const dark of [false, true]) {
      const look = dark ? "dark" : "light"
      for (const screen of ["index", "player", "learn"]) {
        const tag = `${screen}-${w}-${look}`
        console.log(`\n${tag}`)
        const { page, errors } = await open(screen, vp, dark)
        if (screen !== "index") {
          await page.waitForSelector("[data-lesson-video] video", { timeout: 15000 })
          await page.waitForFunction(() => document.querySelector("video").readyState >= 2, { timeout: 15000 })
        }
        await sleep(900)
        await page.mouse.move(1, 1)
        const orange = await page.evaluate(ORANGE)
        expect(orange.length === 0, `${tag}: no orange anywhere`, orange.slice(0, 6))
        const rings = await page.evaluate(RINGS)
        if (rings.length) expect(rings.every((r) => r.fits), `${tag}: every ring's number fits inside it, 2px to spare`, rings)
        if (dark) {
          const light = await page.evaluate(LIGHT)
          expect(light.length === 0, `${tag}: no light patch in the dark look`, light)
        }
        const sc = await sideScroll(page)
        expect(sc.scroll <= sc.width, `${tag}: nothing scrolls sideways`, sc)
        expect(errors.length === 0, `${tag}: no page errors`, errors)
        await page.screenshot({ path: join(shots, `${tag}.png`), fullPage: screen === "index" || w === "390" })
        if (screen === "player" && w === "390") {
          await page.evaluate(() => window.scrollTo(0, 0))
          await page.tap("[data-open-lessons]")
          await sleep(500)
          await page.screenshot({ path: join(shots, `${tag}-sheet.png`) })
        }
        await page.close()
      }
    }
  }

  /* ── The filter switch ── */
  if (want("switch")) for (const [w, vp] of VIEWS) {
    for (const dark of [false, true]) {
      const tag = `switch-${w}-${dark ? "dark" : "light"}`
      console.log(`\n${tag}`)
      const { page } = await open("index", vp, dark)
      await sleep(400)
      const style = await page.evaluate(() => {
        const ind = document.querySelector("[data-seg-indicator]")
        if (!ind) return null
        const cs = getComputedStyle(ind)
        return { transition: cs.transitionProperty, bg: cs.backgroundColor, track: getComputedStyle(ind.parentElement).backgroundColor }
      })
      expect(!!style && /transform|translate/.test(style.transition) && !/width|left|all/.test(style.transition), `${tag}: the indicator animates its transform only`, style)
      const film = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const ind = document.querySelector("[data-seg-indicator]")
            if (!ind) return resolve({ out: null })
            const tabs = [...document.querySelectorAll("[role=tab]")]
            const target = tabs[tabs.length - 1]
            const out = []
            const t0 = performance.now()
            target.click()
            const tick = () => {
              const b = ind.getBoundingClientRect()
              out.push({ x: +b.left.toFixed(1), w: +b.width.toFixed(1) })
              if (performance.now() - t0 < 600) requestAnimationFrame(tick)
              else {
                const t = target.getBoundingClientRect()
                resolve({ out, tab: { x: +t.left.toFixed(1), w: +t.width.toFixed(1) }, selected: target.getAttribute("aria-selected") })
              }
            }
            requestAnimationFrame(tick)
          }),
      )
      if (film.out) {
        const xs = film.out.map((f) => f.x)
        const ws = new Set(film.out.map((f) => f.w))
        const oneWay = xs.every((x, i) => i === 0 || x >= xs[i - 1] - 0.5)
        const last = film.out[film.out.length - 1]
        expect(oneWay && ws.size === 1 && new Set(xs).size > 3, `${tag}: it slides one way over several frames, its width held`, { frames: xs.length, steps: new Set(xs).size, widths: [...ws] })
        expect(Math.abs(last.x - film.tab.x) <= 1 && Math.abs(last.w - film.tab.w) <= 1 && film.selected === "true", `${tag}: it ends on the chosen tab`, { last, tab: film.tab })
      } else expect(false, `${tag}: there is an indicator`)
      /* From Completed (the last), the left arrow goes to Not started, Home to All, and the right arrow from the last wraps to the first. */
      const state = () =>
        page.evaluate(() => {
          const tabs = [...document.querySelectorAll("[role=tab]")]
          return { selected: tabs.findIndex((t) => t.getAttribute("aria-selected") === "true"), focused: tabs.indexOf(document.activeElement), tabbable: tabs.filter((t) => t.tabIndex === 0).length }
        })
      await page.focus("[role=tab][aria-selected=true]")
      await page.keyboard.press("ArrowLeft")
      const left = await state()
      await page.keyboard.press("Home")
      const home = await state()
      await page.keyboard.press("End")
      await page.keyboard.press("ArrowRight")
      const wrap = await state()
      expect(left.selected === 2 && left.focused === 2 && home.selected === 0 && home.focused === 0 && wrap.selected === 0 && left.tabbable === 1, `${tag}: the arrow keys, Home and End move the choice and the focus, one tab stop`, { left, home, wrap })
      await page.screenshot({ path: join(shots, `${tag}.png`), clip: { x: 0, y: 0, width: vp.width, height: 160 } })
      await page.close()
    }
  }

  /* ── The arrow back ── */
  if (want("back")) for (const screen of ["player", "learn"]) {
    const tag = `back-${screen}`
    console.log(`\n${tag}`)
    const { page } = await open(screen, DESK, false)
    await sleep(500)
    const sel = "[data-lesson-back]"
    const at = () => page.evaluate((sel) => {
      const el = document.querySelector(sel)
      const b = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return { x: +b.left.toFixed(2), cx: +(b.left + b.width / 2).toFixed(2), translate: cs.translate, transform: cs.transform, scale: cs.scale, transition: cs.transitionProperty, bg: cs.backgroundColor }
    }, sel)
    const rest = await at()
    const b = await page.$(sel)
    const box = await b.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    const xs = []
    for (let i = 0; i < 12; i++) {
      xs.push((await at()).cx)
      await sleep(25)
    }
    const hovered = await at()
    await page.mouse.down()
    await sleep(200)
    const pressed = await at()
    await page.mouse.up()
    expect(!/translate/.test(rest.transition) && rest.translate === "none", `${tag}: no horizontal move in its transition`, rest)
    expect(xs.every((x) => Math.abs(x - rest.cx) < 0.01) && Math.abs(pressed.cx - rest.cx) < 0.01, `${tag}: its centre holds on hover and on press`, { rest: rest.cx, hover: [...new Set(xs)], pressed: pressed.cx })
    expect(hovered.bg !== rest.bg, `${tag}: the hover is a change of background`, { rest: rest.bg, hover: hovered.bg })
    expect(Number(pressed.scale) < 1 && pressed.translate === "none", `${tag}: a press gives a little, in place (scale)`, pressed)
    await page.close()
  }

  /* ── Media: the box first, the video once it has a frame, a lesson change without a flash ── */
  if (want("media")) for (const [w, vp] of VIEWS) {
    for (const screen of ["player", "learn"]) {
      const tag = `media-${screen}-${w}`
      console.log(`\n${tag}`)
      /* Sampled from the page's first frame on (the sampler is in its <head>): the stage box, and the video's opacity and readiness. */
      const { page: p } = await open(screen, vp, false, 700, true)
      await p.waitForFunction(() => document.querySelector("[data-lesson-video] video")?.readyState >= 2, { timeout: 15000 })
      await sleep(700)
      const load = await p.evaluate(() => window.__frames.splice(0))
      /* From the first frame the player is drawn on (before it the page's script has not run): the box, at one height. */
      const drawn = load.slice(Math.max(0, load.findIndex((f) => f.h > 0)))
      const hs = new Set(drawn.map((f) => f.h))
      expect(drawn.length > 5 && hs.size === 1 && !hs.has(0), `${tag} load: the box is there from the player's first frame, one height throughout`, { frames: drawn.length, before: load.length - drawn.length, heights: [...hs] })
      const ratio = load[load.length - 1].w / load[load.length - 1].h
      expect(Math.abs(ratio - 16 / 9) < 0.02, `${tag} load: 16:9`, +ratio.toFixed(3))
      const early = load.filter((f) => f.ready >= 0 && f.ready < 2 && f.o > 0.01)
      expect(early.length === 0, `${tag} load: the video never shows before it has a frame`, early.slice(0, 3))
      expect(load[load.length - 1].o === 1, `${tag} load: and then it is fully shown`, load[load.length - 1])
      const preload = await p.evaluate(() => document.querySelector("[data-lesson-video] video").getAttribute("preload"))
      expect(preload === "metadata", `${tag}: preload="metadata"`, preload)

      /* A change of lesson: Next. */
      await p.evaluate(() => {
        const next = document.querySelector("[data-pager=next]") || document.querySelector("button[aria-label='Next lesson']")
        next.click()
      })
      await sleep(1600)
      const change = await p.evaluate(() => window.__frames.splice(0))
      const ch = new Set(change.map((f) => f.h))
      expect(change.length > 5 && change.every((f) => f.h > 0) && ch.size === 1, `${tag} next: the box keeps its height on every frame`, { frames: change.length, heights: [...ch] })
      const shown = change.filter((f) => f.ready >= 0 && f.ready < 2 && f.o > 0.01)
      expect(shown.length === 0, `${tag} next: no frame shows an empty video`, shown.slice(0, 3))
      await p.close()
    }
  }

  /* ── A phone: a tap on the big Play plays, from where it resumed ── */
  if (want("phone")) {
    console.log("\nphone play")
    const { page } = await open("player", PHONE, false)
    await page.waitForFunction(() => document.querySelector("[data-lesson-video] video")?.readyState >= 1, { timeout: 15000 })
    await sleep(500)
    const before = await page.evaluate(() => {
      const b = document.querySelector("[data-centre-play]")
      const cs = getComputedStyle(b)
      return { shown: b.getAttribute("aria-hidden") !== "true", opacity: cs.opacity, events: cs.pointerEvents, t: document.querySelector("video").currentTime }
    })
    await page.tap("[data-centre-play]")
    await sleep(1500)
    const after = await page.evaluate(() => ({ paused: document.querySelector("video").paused, t: +document.querySelector("video").currentTime.toFixed(2) }))
    expect(before.shown && !after.paused && after.t > 12.5, "a tap on Play plays, from the second it resumed at", { before, after })
    await page.close()
  }

  /* ── The controls: the bars move by transform; the volume is a slider of our own ── */
  if (want("controls")) {
    console.log("\ncontrols")
    const { page } = await open("player", DESK, false)
    await page.waitForFunction(() => document.querySelector("[data-lesson-video] video")?.readyState >= 2, { timeout: 15000 })
    const c = await page.evaluate(() => {
      const played = document.querySelector("[data-played]")
      const buffered = document.querySelector("[data-buffered]")
      const vol = document.querySelector("[data-volume]")
      return {
        played: played && { width: played.style.width, transform: played.style.transform },
        buffered: buffered && { width: buffered.style.width, transform: buffered.style.transform },
        volume: vol && { role: vol.getAttribute("role"), now: vol.getAttribute("aria-valuenow") },
        native: !!document.querySelector("[data-lesson-video] input[type=range]"),
      }
    })
    expect(!!c.played && !c.played.width && /scaleX/.test(c.played.transform), "the played bar is a scaled layer, not a width", c.played)
    expect(!!c.buffered && !c.buffered.width && /scaleX/.test(c.buffered.transform), "the buffered bar too", c.buffered)
    expect(!!c.volume && c.volume.role === "slider" && !c.native, "the volume is a slider of our own", c.volume)
    await page.click("[data-lesson-video] button[aria-label=Play]")
    await sleep(300)
    const xs = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const el = document.querySelector("[data-played]")
          const out = []
          const t0 = performance.now()
          const tick = () => {
            out.push(+new DOMMatrix(getComputedStyle(el).transform).a.toFixed(4))
            if (performance.now() - t0 < 1000) requestAnimationFrame(tick)
            else resolve(out)
          }
          requestAnimationFrame(tick)
        }),
    )
    const steps = new Set(xs).size
    expect(steps > 20 && xs.every((x, i) => i === 0 || x >= xs[i - 1]), "while it plays the bar moves on most frames, never back", { frames: xs.length, steps })
    await page.evaluate(() => document.querySelector("[data-lesson-video] button[aria-haspopup=menu]").click())
    await sleep(300)
    await page.screenshot({ path: join(shots, "controls-1440-speed.png") })
    await page.close()
  }
} finally {
  await browser.close()
  rmSync(work, { recursive: true, force: true })
}

console.log(`\nscreenshots: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
