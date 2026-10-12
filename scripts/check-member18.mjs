/**
 * ===========================================================================
 *  ROUND 18 (C18): A MEMBER'S PROFILE, MADE PROPER, FRAME BY FRAME
 * ===========================================================================
 * The real components (scripts/render-member18.tsx) at 390x844 and 1440x900:
 *
 *   PLACE      the profile place with its activity board: the taller band
 *              (160px with a picture and 96px without on a phone, 208 and 112
 *              wider), the bigger photo (96px, 112px), the board's grid
 *              starting at today on a phone and the whole year fitting on a
 *              computer, squares the size the rule says, a tap on a square
 *              saying what it holds in the line under the grid, nothing
 *              sideways, taps at least 40px. Also a new member's empty year,
 *              the board before SQL part 125 (no grid, no comment count), no
 *              board at all, and a dark community. Photographed.
 *   PHOTO      a press on the photo opens the creator page's own viewer.
 *   PUSH       Visit page at 4x CPU: the full page comes in from the right
 *              edge over the community, which drifts left under it; on
 *              every frame the copy's cut edge is the page's left edge (no
 *              gap, no overlap), never a frame with nothing on screen.
 *   POP        the full page's back arrow at 4x CPU: the page slides off to
 *              the right over the community, which comes from a third of the
 *              way left; the page's left edge always over the community.
 *   COMPUTER   round J: nothing moves at all. The community stays drawn
 *              (its copy, fully opaque) until the full page is painted under
 *              it, then the copy goes in a 100ms fade; the same way back.
 *              Also with the route's loading screen first (LOADING_MS): the
 *              plain loading colour is never what is on screen, and the
 *              page never slides in from the side.
 *
 *   PROBE_CSS=source node scripts/check-member18.mjs
 * Screenshots and frames go to SHOTS_DIR (printed at the end): look at them.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
/* The community's dark appearance comes from its own stylesheet (imported by the real frame, not by this stand in). */
const css = (await appCss(root)) + "\n" + readFileSync(join(root, "components/community/community-theme.css"), "utf8")
const fontFiles = new Map()
const faces = interFaces(root).replace(/url\(file:\/\/([^)]+)\)/g, (_, path) => {
  const name = path.split("/").pop()
  fontFiles.set(name, path)
  return `url(https://storelib.com/__font/${name})`
})
const stubs = join(root, ".member18-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-member18-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"
const COVER_DELAY = 450

/* A real picture, so decoding takes real time. */
const coverPng = await sharp({ create: { width: 1600, height: 600, channels: 3, background: "#cfdbd5" } })
  .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="600"><path d="M0 420 C 400 300, 800 520, 1600 360 L1600 600 L0 600 Z" fill="#6f8f7f"/><circle cx="1260" cy="160" r="80" fill="#f2efe6"/><circle cx="300" cy="200" r="120" fill="#a9bfb4"/></svg>`), top: 0, left: 0 }])
  .png()
  .toBuffer()
const facePng = await sharp({ create: { width: 256, height: 256, channels: 3, background: "#9fb3a8" } })
  .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><circle cx="128" cy="104" r="48" fill="#eef2ee"/><rect x="56" y="172" width="144" height="88" rx="44" fill="#eef2ee"/></svg>`), top: 0, left: 0 }])
  .png()
  .toBuffer()

const STUBS = {
  "next-navigation.js": `import { useSyncExternalStore } from "react"
const subs = new Set()
const subscribe = (f) => { subs.add(f); window.addEventListener("popstate", f); return () => { subs.delete(f); window.removeEventListener("popstate", f) } }
const log = (k, a) => (window.__router ||= []).push([k, a, performance.now()])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: (h) => log("prefetch", h), back: () => log("back"), refresh: () => log("refresh") }
export const usePathname = () => useSyncExternalStore(subscribe, () => location.pathname, () => location.pathname)
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`,
  "next-link.jsx": `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", typeof href === "string" ? href : "", performance.now()]) } } }, children) })
export const useLinkStatus = () => ({ pending: false })
`,
  "next-image.jsx": `import React from "react"
export default function Image({ src, alt, fill, priority, preload, sizes, unoptimized, quality, className, style, ...rest }) {
  return React.createElement("img", { src: typeof src === "string" ? src : "", alt, className, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style, ...rest })
}
`,
  "supabase-client.jsx": `export function isNativePlatform() { return false }
export const capacitorStorage = {}
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => ({ select() { return this }, eq() { return this }, maybeSingle: async () => ({ data: null }) }), channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
`,
}
for (const [k, v] of Object.entries(STUBS)) writeFileSync(join(stubs, k), v)

let html
try {
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-member18.tsx")],
    bundle: true, format: "iife", jsx: "automatic", logLevel: "error",
    outfile: join(stubs, "app.js"),
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;" },
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    plugins: [{
      name: "stubs",
      setup(b) {
        b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: join(stubs, "next-navigation.js") }))
        b.onResolve({ filter: /^next\/link$/ }, () => ({ path: join(stubs, "next-link.jsx") }))
        b.onResolve({ filter: /^next\/image$/ }, () => ({ path: join(stubs, "next-image.jsx") }))
        b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.jsx") }))
        b.onResolve({ filter: /^@\// }, async (a) => b.resolve("./" + a.path.slice(2), { resolveDir: root, kind: a.kind }))
      },
    }],
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
} catch (e) {
  rmSync(stubs, { recursive: true, force: true })
  console.error(`The probe did not bundle: ${e.message}`)
  process.exit(1)
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const VPS = [["phone", PHONE], ["desktop", DESK]]

async function open(vp, address, { coverDelay = COVER_DELAY, throttle = 1 } = {}) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e?.stack || e).split("\n").slice(0, 3).join(" | ").slice(0, 300)))
  await p.setRequestInterception(true)
  p.on("request", async (r) => {
    const u = r.url()
    if (u.startsWith(ORIGIN) && r.resourceType() === "document") return r.respond({ status: 200, contentType: "text/html", body: html })
    if (u.startsWith(ORIGIN + "/__font/")) {
      const file = fontFiles.get(u.split("/").pop())
      if (file && existsSync(file)) return r.respond({ status: 200, contentType: "font/woff2", headers: { "access-control-allow-origin": "*" }, body: readFileSync(file) })
    }
    if (/__cover(%2F|\/)cover/.test(u)) {
      await sleep(coverDelay)
      return r.respond({ status: 200, contentType: "image/png", body: coverPng })
    }
    if (/__cover(%2F|\/)face/.test(u)) return r.respond({ status: 200, contentType: "image/png", body: facePng })
    if (u.endsWith("/api/follow")) {
      const body = JSON.parse(r.postData() || "{}")
      return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ following: !!body.follow, followers: body.follow ? 1284 : 1283 }) })
    }
    if (u.includes("/member-profile?")) {
      await sleep(200)
      return r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ posts: [], next: null }) })
    }
    if (u.startsWith("data:") || u.startsWith("blob:")) return r.continue()
    return r.respond({ status: 404, body: "" })
  })
  await p.goto(ORIGIN + address, { waitUntil: "domcontentloaded" })
  await p.evaluate(() => Promise.all([document.fonts.load("400 16px Inter"), document.fonts.load("600 16px Inter")]).catch(() => {}).then(() => document.fonts.ready))
  if (throttle > 1) {
    const cdp = await p.createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle })
  }
  return { p, errors }
}

/* The screen, filmed: DevTools' screencast frames as PNGs. */
async function film(p, name, ms, act, sample) {
  const cdp = await p.createCDPSession()
  const frames = []
  cdp.on("Page.screencastFrame", async (f) => {
    frames.push(f.data)
    try {
      await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId })
    } catch {}
  })
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 })
  const sampled = sample(p, ms)
  await act()
  const samples = await sampled
  await cdp.send("Page.stopScreencast")
  const dir = join(shots, name)
  mkdirSync(dir, { recursive: true })
  frames.forEach((d, i) => writeFileSync(join(dir, `${String(i).padStart(3, "0")}.png`), Buffer.from(d, "base64")))
  /* A contact sheet of every frame, small, to look at in one go. */
  if (frames.length) {
    const cols = 6
    const meta = await sharp(Buffer.from(frames[0], "base64")).metadata()
    const tw = 200
    const th = Math.round((meta.height / meta.width) * tw)
    const pick = frames.filter((_, i) => frames.length <= 36 || i % Math.ceil(frames.length / 36) === 0).slice(0, 36)
    const rows = Math.ceil(pick.length / cols)
    const tiles = await Promise.all(pick.map((d) => sharp(Buffer.from(d, "base64")).resize(tw, th).png().toBuffer()))
    await sharp({ create: { width: cols * (tw + 4), height: rows * (th + 4), channels: 3, background: "#333" } })
      .composite(tiles.map((input, i) => ({ input, left: (i % cols) * (tw + 4), top: Math.floor(i / cols) * (th + 4) })))
      .png()
      .toFile(join(shots, `${name}-sheet.png`))
  }
  return { samples, frames: frames.length }
}


/* Every animation frame for `ms`: the copy laid over the window, the page arriving, the frame under it. */
function sampleMotion(p, ms) {
  return p.evaluate(
    (ms) =>
      new Promise((done) => {
        const out = []
        const t0 = performance.now()
        const tick = () => {
          const still = document.querySelector("[data-leaving-still]")
          const inner = still?.firstElementChild
          const live = (sel) => [...document.querySelectorAll(sel)].find((e) => !e.closest("[data-leaving-still]")) ?? null
          const page = live("[data-profile-arrival]")?.parentElement ?? null
          const shell = live("[data-community-shell]")
          const r = (el) => {
            if (!el) return null
            const b = el.getBoundingClientRect()
            const t = getComputedStyle(el).translate
            return { l: Math.round(b.left * 10) / 10, r: Math.round(b.right * 10) / 10, op: Number(getComputedStyle(el).opacity), tx: t && t !== "none" ? parseFloat(t.split(" ")[0]) || 0 : 0 }
          }
          out.push({ t: Math.round(performance.now() - t0), vw: document.documentElement.clientWidth, motion: document.documentElement.getAttribute("data-page-motion"), still: r(still), inner: r(inner), page: r(page), shell: r(shell), loading: !!live("[data-probe-loading]") })
          if (performance.now() - t0 < ms) requestAnimationFrame(tick)
          else done(out)
        }
        requestAnimationFrame(tick)
      }),
    ms,
  )
}

const W = { phone: 390, desktop: 1440 }

try {
  /* ── PLACE ── */
  for (const [label, vp] of process.env.ONLY ? [] : VPS) {
    for (const cover of ["1", "0"]) {
      const { p, errors } = await open(vp, `/community/clay?profile=sam.kerr&case=place&board=full&cover=${cover}`, { coverDelay: 0 })
      await p.waitForSelector("[data-activity-board]")
      await sleep(500)
      const m = await p.evaluate(() => {
        const box = (s) => {
          const el = document.querySelector(s)
          if (!el) return null
          const b = el.getBoundingClientRect()
          return { w: Math.round(b.width), h: Math.round(b.height), l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom) }
        }
        const days = document.querySelector("[data-activity-days]")
        const cells = [...document.querySelectorAll("[data-activity-days] [data-activity-cell]")]
        const today = document.querySelector('[data-day="2026-10-10"]')
        const dr = days?.getBoundingClientRect()
        const tr = today?.getBoundingClientRect()
        const visible = cells.filter((c) => {
          const b = c.getBoundingClientRect()
          return dr && b.left >= dr.left - 0.5 && b.right <= dr.right + 0.5
        }).length
        return {
          overflow: document.documentElement.scrollWidth - innerWidth,
          band: box("[data-member-profile-cover]"),
          avatar: box("[data-member-profile-avatar]"),
          visit: box("[data-member-profile-page]"),
          follow: box("[data-member-profile-follow]"),
          cell: cells[0] ? box("[data-activity-days] [data-activity-cell]") : null,
          cells: cells.length,
          visible,
          todayInView: !!(tr && dr && tr.left >= dr.left - 0.5 && tr.right <= dr.right + 0.5),
          line: document.querySelector("[data-activity-line]")?.textContent ?? null,
          level: document.querySelector("[data-activity-level]")?.textContent ?? null,
          next: document.querySelector("[data-activity-next]")?.textContent ?? null,
          facts: [...document.querySelectorAll("[data-activity-fact]")].map((f) => f.getAttribute("data-activity-fact")),
          meta: document.querySelector("[data-member-profile-meta]")?.textContent ?? null,
          order: [...document.querySelectorAll("[data-member-profile-head], [data-activity-board], [data-profile-panel]")].map((e) => e.getAttribute("data-profile-panel") ? "posts" : e.hasAttribute("data-activity-board") ? "board" : "head"),
        }
      })
      const tag = `${label} cover=${cover}`
      expect(m.overflow <= 0, `${tag}: nothing sideways`, m.overflow)
      const bandWant = cover === "1" ? (label === "phone" ? 160 : 208) : label === "phone" ? 96 : 112
      expect(m.band?.h === bandWant, `${tag}: the band is ${bandWant}px tall`, m.band?.h)
      const faceWant = (label === "phone" ? 96 : 112) + 6
      expect(m.avatar?.w === faceWant && m.avatar?.h === faceWant, `${tag}: the photo is ${faceWant - 6}px in its 3px ring`, m.avatar)
      expect(m.avatar && m.band && m.avatar.t < m.band.b && m.avatar.b > m.band.b, `${tag}: the photo straddles the band's foot`, { avatar: m.avatar, band: m.band })
      expect(m.visit && m.visit.h >= 40, `${tag}: Visit page is at least 40px tall`, m.visit?.h)
      expect(m.order.join(",") === "head,board,posts", `${tag}: the head, then the board, then the posts`, m.order)
      expect(m.cells >= 358 && m.cells <= 364, `${tag}: a square for every day of the last year up to today`, m.cells)
      expect(m.todayInView, `${tag}: today's square is in view without scrolling`)
      if (label === "phone") expect(m.cell?.w === 12 && m.cell?.h === 12, `${tag}: 12px squares on a phone`, m.cell)
      else {
        expect(m.cell && m.cell.w >= 9 && m.cell.w <= 13, `${tag}: squares between 9 and 13px on a computer`, m.cell)
        expect(m.visible === m.cells, `${tag}: the whole year fits on a computer`, { visible: m.visible, cells: m.cells })
      }
      expect(/Level 3/.test(m.level || "") && /Contributor/.test(m.level || ""), `${tag}: their level and its name`, m.level)
      expect(/46 points to level 4/.test(m.next || ""), `${tag}: the points to the next level`, m.next)
      expect(m.facts.join(",") === "posts,comments,joined", `${tag}: posts, comments, joined`, m.facts)
      expect(!/Joined|Level/.test(m.meta || ""), `${tag}: the line under the name does not repeat them`, m.meta)
      expect(/posts?, .*comments? and .*likes?$/.test(m.line || ""), `${tag}: the line under the grid sums the year`, m.line)
      await p.screenshot({ path: join(shots, `place-${label}-cover${cover}.png`), fullPage: true })
      if (cover === "1") {
        /* A square, pressed: the line says what it holds; pressed again, back to the year. */
        const day = await p.evaluate(() => {
          const c = [...document.querySelectorAll("[data-activity-days] [data-activity-cell]")].reverse().find((e) => Number(e.getAttribute("data-activity-cell")) >= 2)
          c?.scrollIntoView({ block: "center", inline: "nearest" })
          return c?.getAttribute("data-day") ?? null
        })
        await sleep(150)
        const at = await p.evaluate((d) => {
          const b = document.querySelector(`[data-day="${d}"]`).getBoundingClientRect()
          return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
        }, day)
        if (label === "phone") await p.touchscreen.tap(at.x, at.y)
        else await p.mouse.move(at.x, at.y)
        await sleep(150)
        const picked = await p.evaluate((d) => ({ line: document.querySelector("[data-activity-line]")?.textContent ?? "", ring: document.querySelector(`[data-day="${d}"]`)?.hasAttribute("data-picked") }), day)
        expect(picked.ring && /: \d/.test(picked.line) && !/likes$/.test(picked.line) || /: /.test(picked.line), `${tag}: a square ${label === "phone" ? "tapped" : "hovered"} says what it holds`, picked)
        await p.screenshot({ path: join(shots, `place-${label}-picked.png`), clip: await p.evaluate(() => { const b = document.querySelector("[data-activity-board]").getBoundingClientRect(); return { x: 0, y: b.top + scrollY - 8, width: innerWidth, height: b.height + 16 } }) })
        if (label === "phone") {
          const again = await p.evaluate((d) => {
            const b = document.querySelector(`[data-day="${d}"]`).getBoundingClientRect()
            return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
          }, day)
          await p.touchscreen.tap(again.x, again.y)
          await sleep(120)
          const back = await p.evaluate(() => document.querySelector("[data-activity-line]")?.textContent ?? "")
          expect(/likes$/.test(back), `${tag}: tapped again, the line is the year again`, back)
        }
      }
      expect(!errors.length, `${tag}: no page errors`, errors)
      await p.close()
    }
    /* The other boards. */
    for (const kind of ["empty", "nogrid", "none"]) {
      const { p, errors } = await open(vp, `/community/clay?profile=sam.kerr&case=place&board=${kind}&cover=0`, { coverDelay: 0 })
      await p.waitForSelector("[data-member-profile-head]")
      await sleep(300)
      const m = await p.evaluate(() => ({
        board: !!document.querySelector("[data-activity-board]"),
        grid: !!document.querySelector("[data-activity-grid]"),
        facts: [...document.querySelectorAll("[data-activity-fact]")].map((f) => f.getAttribute("data-activity-fact")),
        shaded: document.querySelectorAll('[data-activity-days] [data-activity-cell]:not([data-activity-cell="0"])').length,
        line: document.querySelector("[data-activity-line]")?.textContent ?? null,
        meta: document.querySelector("[data-member-profile-meta]")?.textContent ?? null,
        overflow: document.documentElement.scrollWidth - innerWidth,
      }))
      const tag = `${label} board=${kind}`
      expect(m.overflow <= 0, `${tag}: nothing sideways`, m.overflow)
      if (kind === "empty") {
        expect(m.grid && m.shaded === 0, `${tag}: a new member's year is empty squares`, m.shaded)
        expect(m.line === "Nothing here yet", `${tag}: and says so`, m.line)
      }
      if (kind === "nogrid") {
        expect(m.board && !m.grid, `${tag}: before part 125 the board has no grid`, m)
        expect(m.facts.join(",") === "posts,joined", `${tag}: and no comment count it could not make`, m.facts)
      }
      if (kind === "none") {
        expect(!m.board, `${tag}: an answer from before round 18 draws no board`)
        expect(/Joined/.test(m.meta || ""), `${tag}: and the line under the name still says when they joined`, m.meta)
      }
      expect(!errors.length, `${tag}: no page errors`, errors)
      await p.screenshot({ path: join(shots, `board-${kind}-${label}.png`), fullPage: true })
      await p.close()
    }
    {
      const { p } = await open(vp, `/community/clay?profile=sam.kerr&case=place&board=full&cover=1&dark=1`, { coverDelay: 0 })
      await p.waitForSelector("[data-activity-board]")
      await sleep(400)
      await p.screenshot({ path: join(shots, `place-${label}-dark.png`), fullPage: true })
      await p.close()
    }
  }

  /* ── PHOTO: the creator page's viewer ── */
  for (const [label, vp] of process.env.ONLY ? [] : VPS) {
    const { p, errors } = await open(vp, `/community/clay?profile=sam.kerr&case=place&board=full&cover=1`, { coverDelay: 0, throttle: 4 })
    await p.waitForSelector("[data-member-profile-avatar]")
    await sleep(300)
    const sampler = (p, ms) =>
      p.evaluate(
        (ms) =>
          new Promise((done) => {
            const out = []
            const t0 = performance.now()
            const tick = () => {
              const ph = document.querySelector("[data-avatar-lightbox-photo]")
              const b = ph?.getBoundingClientRect()
              out.push({ t: Math.round(performance.now() - t0), w: b ? Math.round(b.width) : null, op: ph ? Number(getComputedStyle(ph).opacity) : null })
              if (performance.now() - t0 < ms) requestAnimationFrame(tick)
              else done(out)
            }
            requestAnimationFrame(tick)
          }),
        ms,
      )
    const shot = await film(p, `photo-${label}`, 900, () => p.click("[data-member-profile-avatar]"), sampler)
    const open1 = await p.evaluate(() => !!document.querySelector("[data-avatar-lightbox-photo]") && !!document.querySelector('[role="dialog"]'))
    expect(open1, `${label}: a press on the photo opens the viewer`)
    const widths = shot.samples.map((s) => s.w).filter((w) => w)
    expect(widths.length > 3 && widths[0] < widths[widths.length - 1], `${label}: the photo grows out of the circle over several frames`, { first: widths[0], last: widths[widths.length - 1], frames: widths.length })
    await p.screenshot({ path: join(shots, `photo-${label}-open.png`) })
    await p.keyboard.press("Escape")
    await sleep(500)
    expect(!(await p.$("[data-avatar-lightbox-photo]")), `${label}: Escape closes it`)
    expect(!errors.length, `${label} photo: no page errors`, errors)
    await p.close()
  }

  /* ── PUSH and POP ── */
  for (const [label, vp] of VPS) {
    const { p, errors } = await open(vp, `/community/clay?profile=sam.kerr&case=journey&board=full&cover=1`, { coverDelay: 0 })
    await p.waitForSelector("[data-member-profile-page]")
    await p.evaluate(() => window.scrollTo(0, 120))
    await sleep(1200)
    const ahead = await p.evaluate(() => (window.__router || []).filter((e) => e[0] === "prefetch").map((e) => e[1]))
    expect(ahead.some((h) => /^\/@sam\.kerr\?from=community/.test(h)), `${label}: the full page is read ahead while the profile is on screen`, ahead)
    const cdp = await p.createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    if (label === "phone") await p.tap("[data-member-profile-page]")
    else await p.click("[data-member-profile-page]")
    const link = await p.evaluate(() => (window.__router || []).filter((e) => e[0] === "link").map((e) => e[1]))
    expect(link.some((h) => /^\/@sam\.kerr\?from=community&back=/.test(h)), `${label}: Visit page goes to the full page, with the way back`, link)
    /* The router's commit: the community out, the full page in, in one render. */
    const push = await film(p, `push-${label}`, 1800, () => p.evaluate(() => { history.pushState({ probe: 1 }, "", "/@sam.kerr?from=community"); window.__go("full") }), sampleMotion)
    const moving = push.samples.filter((s) => s.still && s.page)
    if (process.env.DEBUG) console.log(JSON.stringify(push.samples))
    if (label === "phone") {
      expect(moving.length >= 4, `${label}: the push is drawn over several frames`, moving.length)
      const gaps = moving.map((s) => Math.round((s.page.l - s.still.r) * 10) / 10)
      expect(gaps.every((g) => Math.abs(g) <= 1.5), `${label}: on every frame the community's cut edge is the page's left edge`, { worst: Math.max(...gaps.map(Math.abs)), gaps: gaps.slice(0, 8) })
      const under = moving.map((s) => s.inner.l)
      expect(under.every((x, i) => i === 0 || x <= under[i - 1] + 0.5) && Math.min(...under) < -W.phone * 0.2, `${label}: the community drifts about a third left under it`, { last: under[under.length - 1] })
      const lefts = moving.map((s) => s.page.l)
      expect(lefts[0] > W.phone * 0.5 && lefts.every((x, i) => i === 0 || x <= lefts[i - 1] + 0.5), `${label}: the page comes in from the right edge, never backwards`, { first: lefts[0], last: lefts[lefts.length - 1] })
    } else {
      expect(moving.length >= 1, `${label}: the community's copy is over the page as it arrives`, moving.length)
      expect(push.samples.every((s) => (!s.still || Math.abs(s.still.l) < 0.5) && (!s.page || Math.abs(s.page.l) < 0.5)), `${label}: on a computer nothing moves sideways, the copy or the page`, push.samples.map((s) => [s.still?.l, s.page?.l]).slice(0, 6))
      expect(push.samples.every((s) => !s.page || s.page.op > 0.999), `${label}: the page is simply there under the copy, no fade of its own`, push.samples.map((s) => s.page?.op).slice(0, 6))
    }
    const blank = push.samples.filter((s) => !s.page && !s.shell)
    expect(blank.length === 0, `${label}: never a frame with no page`, blank.length)
    const end = push.samples[push.samples.length - 1]
    expect(!end.still && end.page && Math.abs(end.page.l) < 0.5 && !end.motion, `${label}: the push ends with the page in place and the copy gone`, end)
    await sleep(300)
    await p.screenshot({ path: join(shots, `push-${label}-landed.png`) })

    /* Back with the page's own arrow: armed, then the router's commit back to the community. */
    await p.evaluate(() => document.querySelector("[data-profile-back-button]")?.click())
    const pop = await film(p, `pop-${label}`, 1800, () => p.evaluate(() => window.__go("community")), sampleMotion)
    const popping = pop.samples.filter((s) => s.still && s.shell)
    if (label === "phone") {
      expect(popping.length >= 4, `${label}: the pop is drawn over several frames`, popping.length)
      const lefts = popping.map((s) => s.inner.l)
      expect(lefts.every((x, i) => i === 0 || x >= lefts[i - 1] - 0.5) && lefts[lefts.length - 1] > W.phone * 0.6, `${label}: the page slides off to the right`, { first: lefts[0], last: lefts[lefts.length - 1] })
      const shellL = popping.map((s) => s.shell.l)
      expect(shellL[0] < -W.phone * 0.15 && shellL.every((x, i) => i === 0 || x >= shellL[i - 1] - 0.5), `${label}: the community comes from a third of the way left`, { first: shellL[0], last: shellL[shellL.length - 1] })
      const gapped = popping.filter((s) => s.inner.l < W.phone && s.shell.r < s.inner.l - 0.5)
      expect(!gapped.length, `${label}: never a gap between the two`, gapped.slice(0, 2))
    } else {
      expect(popping.length >= 1, `${label}: the full page's copy is over the community as it comes back`, popping.length)
      expect(pop.samples.every((s) => (!s.still || Math.abs(s.still.l) < 0.5) && (!s.shell || Math.abs(s.shell.l) < 0.5)), `${label}: on a computer nothing moves sideways on the way back`, pop.samples.map((s) => [s.still?.l, s.shell?.l]).slice(0, 6))
    }
    const endPop = pop.samples[pop.samples.length - 1]
    expect(!endPop.still && endPop.shell && Math.abs(endPop.shell.l) < 0.5, `${label}: the pop ends with the community in place and the copy gone`, endPop)
    expect(await p.evaluate(() => !!window.__shellPopped), `${label}: the community arrived with the pop, not with its own push`)
    expect(!errors.length, `${label} journey: no page errors`, errors)
    await p.close()
  }

  /* ── COMPUTER, A PAGE NOT READ AHEAD: its loading screen commits first, the page 400ms later (round J). ── */
  {
    const { p, errors } = await open(DESK, `/community/clay?profile=sam.kerr&case=journey&board=full&cover=1`, { coverDelay: 0 })
    await p.waitForSelector("[data-member-profile-page]")
    await sleep(600)
    await p.click("[data-member-profile-page]")
    const push = await film(p, `push-desktop-loading`, 1600, () => p.evaluate(() => { history.pushState({ probe: 1 }, "", "/@sam.kerr?from=community"); window.__go("full", 400) }), sampleMotion)
    const bare = push.samples.filter((s) => s.loading && (!s.still || s.still.op < 0.5))
    expect(bare.length === 0, "desktop, page after its loading screen: the loading colour is never what is on screen (the community stays until the page is there)", bare.length)
    expect(push.samples.every((s) => (!s.still || Math.abs(s.still.l) < 0.5) && (!s.page || (Math.abs(s.page.l) < 0.5 && Math.abs(s.page.tx) < 0.5))), "desktop, page after its loading screen: it never slides in", push.samples.filter((s) => s.page).map((s) => [s.page.l, s.page.tx]).slice(0, 6))
    const end = push.samples[push.samples.length - 1]
    expect(!end.still && end.page && end.page.op > 0.999, "desktop, page after its loading screen: ends with the page and no copy", end)
    expect(!errors.length, "desktop loading journey: no page errors", errors)
    await p.close()
  }

  /* Reduced motion: nothing moves, nothing is copied. */
  {
    const { p } = await open(PHONE, `/community/clay?profile=sam.kerr&case=journey&board=full&cover=1`, { coverDelay: 0 })
    await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    await p.waitForSelector("[data-member-profile-page]")
    await p.evaluate(() => document.querySelector("[data-member-profile-page]").click())
    const s = await sampleMotion(p, 10).then(() => p.evaluate(() => { window.__go("full"); return null }))
    void s
    const still = await p.evaluate(() => !!document.querySelector("[data-leaving-still]"))
    expect(!still, "reduced motion: no copy, the page is simply there")
    await p.close()
  }
} finally {
  await browser.close()
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
