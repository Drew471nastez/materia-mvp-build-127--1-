/**
 * ===========================================================================
 *  ROUND 25 (C25B): A MEMBER'S PROFILE INSIDE A COMMUNITY, MEASURED
 * ===========================================================================
 * The real place (scripts/render-surfaces25.tsx) at 390x844 and 1440x900:
 *   the band's height (184px with a picture on a phone, 236px wider up; 112 and 128 without), the level badge on the
 *   photo (inside its bottom right), the bio, the activity card as one standing line and three facts (no sentence to the
 *   next level, no progress bar, no sentence under the grid), the squares in the accent's steps, and the order: a
 *   member's board under the head, a creator's under their posts with Show more instead of a list that keeps growing.
 *
 *   node scripts/check-surfaces25.mjs            (from a checkout: its components are the ones drawn)
 * Screenshots go to SHOTS_DIR (printed at the end): look at them.
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
const stubs = mkdtempSync(join(tmpdir(), "storelib-surfaces25-stubs-"))
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-surfaces25-")), "shots")
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
    entryPoints: [new URL("./render-surfaces25.tsx", import.meta.url).pathname],
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



const W = { phone: 390, desktop: 1440 }
const want = process.env.EXPECT !== "0"
try {
  for (const [label, vp] of VPS) {
    for (const [store, cover] of [["0", "1"], ["1", "1"], ["0", "0"]]) {
      const { p, errors } = await open(vp, `/community/clay?profile=sam.kerr&case=place&board=full&cover=${cover}&store=${store}&posts=12`, { coverDelay: 0 })
      await p.waitForSelector("[data-activity-board]")
      await sleep(600)
      const m = await p.evaluate(() => {
        const box = (s) => {
          const el = typeof s === "string" ? document.querySelector(s) : s
          if (!el) return null
          const b = el.getBoundingClientRect()
          return { w: Math.round(b.width), h: Math.round(b.height), l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom) }
        }
        const four = document.querySelector('[data-activity-days] [data-activity-cell="4"]')
        return {
          overflow: document.documentElement.scrollWidth - innerWidth,
          band: box("[data-member-profile-cover]"),
          avatar: box("[data-member-profile-avatar]"),
          badge: box("[data-member-profile-level]"),
          badgeText: document.querySelector("[data-member-profile-level]")?.textContent ?? null,
          bio: document.querySelector("[data-member-profile-bio]")?.textContent ?? null,
          level: document.querySelector("[data-activity-level]")?.textContent ?? null,
          points: document.querySelector("[data-activity-points]")?.textContent ?? null,
          next: !!document.querySelector("[data-activity-next], [data-activity-progress]"),
          line: document.querySelector("[data-activity-line]")?.textContent ?? null,
          facts: [...document.querySelectorAll("[data-activity-fact]")].map((f) => f.getAttribute("data-activity-fact")),
          cardH: box("[data-activity-card]")?.h ?? 0,
          shade4: four ? getComputedStyle(four).backgroundColor : null,
          order: [...document.querySelectorAll("[data-member-profile-head], [data-activity-board], [data-profile-panel]")].map((e) => (e.getAttribute("data-profile-panel") ? "posts" : e.hasAttribute("data-activity-board") ? "board" : "head")),
          more: !!document.querySelector("[data-profile-posts-more]"),
          words: (document.querySelector("[data-activity-card]")?.textContent || "").replace(/\s+/g, " ").length,
        }
      })
      const tag = `${label} store=${store} cover=${cover}`
      console.log(`  ${tag}: ${JSON.stringify({ band: m.band?.h, badge: m.badge, level: m.level, points: m.points, facts: m.facts, cardH: m.cardH, words: m.words, order: m.order, shade4: m.shade4 })}`)
      if (want) {
        expect(m.overflow <= 0, `${tag}: nothing sideways`, m.overflow)
        const bandWant = cover === "1" ? (label === "phone" ? 184 : 236) : label === "phone" ? 112 : 128
        expect(m.band?.h === bandWant, `${tag}: the band is ${bandWant}px tall`, m.band?.h)
        expect(m.badge && m.avatar && m.badge.r <= m.avatar.r && m.badge.b <= m.avatar.b && m.badge.l > m.avatar.l + m.avatar.w / 2 && m.badge.t > m.avatar.t + m.avatar.h / 2 && m.badgeText === "3", `${tag}: their level on the photo, at its bottom right`, { badge: m.badge, avatar: m.avatar, text: m.badgeText })
        expect(/Potter in Lisbon/.test(m.bio || ""), `${tag}: the bio is shown`, m.bio)
        expect(/Contributor/.test(m.level || "") && /Level 3/.test(m.level || "") && /104 points/.test(m.points || ""), `${tag}: the level's name, its number and the points, on one line`, { level: m.level, points: m.points })
        expect(!m.next && !m.line, `${tag}: no sentence to the next level, no progress bar, no sentence under the grid`, { next: m.next, line: m.line })
        expect(m.facts.join(",") === "posts,comments,joined", `${tag}: posts, comments, joined`, m.facts)
        expect(m.shade4 === "rgb(124, 58, 237)", `${tag}: the busiest days in the accent`, m.shade4)
        const order = store === "1" ? "head,posts,board" : "head,board,posts"
        expect(m.order.join(",") === order, `${tag}: ${order}`, m.order)
        if (store === "1") expect(m.more, `${tag}: Show more under a creator's posts, so the board is reached`)
      }
      await p.screenshot({ path: join(shots, `profile-${label}-store${store}-cover${cover}.png`), fullPage: true })
      if (store === "0" && cover === "1") await p.screenshot({ path: join(shots, `profile-${label}-board.png`), clip: await p.evaluate(() => { const b = document.querySelector("[data-activity-board]").getBoundingClientRect(); return { x: 0, y: b.top + scrollY - 8, width: innerWidth, height: b.height + 16 } }) })
      expect(!errors.length, `${tag}: no page errors`, errors)
      await p.close()
    }
  }
} finally {
  await browser.close()
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\n${broken ? `${broken} FAILED` : "all ok"}. Screenshots: ${shots}`)
process.exit(broken ? 1 : 0)
