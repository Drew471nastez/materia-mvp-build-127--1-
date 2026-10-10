/**
 * ===========================================================================
 *  ROUND 15 (R): A PROFILE FROM A COMMUNITY AND BACK, FRAME BY FRAME
 * ===========================================================================
 * The real components (scripts/render-profiles15.tsx) at 390x844 and
 * 1440x900, the CPU slowed four times, the cover served 450ms late as a real
 * PNG, so its arrival can be watched:
 *
 *   JOURNEY    a name in the community's feed opens the profile place
 *              (pushState, no page load) and Back returns to the feed:
 *              every frame from the tap is sampled (requestAnimationFrame)
 *              and the screen is filmed (the DevTools screencast, kept as
 *              PNGs to look at). Measured: the cover band's height never
 *              changes once drawn; no frame shows the picture before it is
 *              decoded (an <img> in the band is only there once decode()
 *              resolved); no Storelib header on any frame; the feed comes
 *              back at the scroll it was left at.
 *   PLACE      the place for somebody else and for me, photographed; taps
 *              at least 40px on a phone; nothing sideways.
 *   FULL PAGE  a person's full page arriving from a community: the cover
 *              is never drawn half loaded (opacity 0 until decoded, then a
 *              fade); the top bar stays at the top after a scroll, and the
 *              arrow is what a finger at its centre hits; the arrow answers
 *              the first tap (history back when a page of ours is behind,
 *              straight to the community when opened cold).
 *   FOLLOW     unfollow at 4x CPU: the dark face rises over several frames
 *              (no step bigger than a third of the way in one frame) and the
 *              box never changes size.
 *
 *   PROBE_CSS=source node scripts/check-profiles15.mjs
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
const css = await appCss(root)
const fontFiles = new Map()
const faces = interFaces(root).replace(/url\(file:\/\/([^)]+)\)/g, (_, path) => {
  const name = path.split("/").pop()
  fontFiles.set(name, path)
  return `url(https://storelib.com/__font/${name})`
})
const stubs = join(root, ".profiles15-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-profiles15-")), "shots")
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
    entryPoints: [join(root, "scripts/render-profiles15.tsx")],
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

/* Every animation frame for `ms`: the band, the picture in it, the header, the scroll. */
async function sampleFrames(p, ms) {
  return p.evaluate(
    (ms) =>
      new Promise((done) => {
        const out = []
        const t0 = performance.now()
        const tick = () => {
          const band = document.querySelector("[data-member-profile-cover], [data-profile-cover-band], [data-cover-band]")
          const img = band?.querySelector("img") ?? null
          const b = band?.getBoundingClientRect()
          out.push({
            t: Math.round(performance.now() - t0),
            band: b ? Math.round(b.height) : null,
            img: img ? { op: Number(getComputedStyle(img).opacity), complete: img.complete, w: img.naturalWidth, state: img.dataset.decodedCover ?? null } : null,
            storelibHeader: !!document.getElementById("platform-header-root"),
            feed: !!document.querySelector("[data-probe-feed]") && !document.querySelector("[data-probe-feed]")?.closest("[hidden]"),
            place: !!document.querySelector("[data-member-profile-place]"),
            y: Math.round(scrollY),
          })
          if (performance.now() - t0 < ms) requestAnimationFrame(tick)
          else done(out)
        }
        requestAnimationFrame(tick)
      }),
    ms,
  )
}

/* The screen, filmed: DevTools' screencast frames as PNGs. */
async function film(p, name, ms, act) {
  const cdp = await p.createCDPSession()
  const frames = []
  cdp.on("Page.screencastFrame", async (f) => {
    frames.push(f.data)
    try {
      await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId })
    } catch {}
  })
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 })
  const sampled = sampleFrames(p, ms)
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

try {
  /* ── JOURNEY: feed -> profile -> back ── */
  for (const [label, vp] of VPS) for (const who of ["sam", "me"]) {
    const name = `journey-${who}-${label}`
    console.log(`\n${name}`)
    const { p, errors } = await open(vp, `/community/clay?case=journey&who=${who}`, { throttle: 4 })
    await sleep(400)
    await p.evaluate(() => window.scrollTo(0, 900))
    await sleep(200)
    const leftAt = await p.evaluate(() => scrollY)
    const target = await p.evaluate(() => {
      const a = [...document.querySelectorAll("[data-probe-person]")].find((x) => { const r = x.getBoundingClientRect(); return r.top > 120 && r.bottom < innerHeight - 40 })
      const r = a.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })
    const open1 = await film(p, `${name}-open`, 1400, async () => {
      if (vp.hasTouch) await p.touchscreen.tap(target.x, target.y)
      else await p.mouse.click(target.x, target.y)
    })
    const s = open1.samples.filter((f) => f.place)
    const bands = [...new Set(s.map((f) => f.band))]
    expect(s.length > 0 && bands.length === 1 && bands[0] > 0, "the cover band is one height on every frame of the place", bands)
    const early = s.filter((f) => f.img && (!f.img.complete || f.img.w === 0))
    expect(early.length === 0, "no frame shows the cover before it has loaded", early.slice(0, 3))
    const firstImg = s.findIndex((f) => f.img)
    expect(firstImg > 0 && s[firstImg].img.state === "fade", "the first time, the picture goes in only once decoded, and fades in", { firstImg, at: s[firstImg]?.t, state: s[firstImg]?.img?.state })
    expect(open1.samples.every((f) => !f.storelibHeader), "no Storelib header on any frame")
    expect(s.every((f) => !f.feed), "the feed is not on screen under the profile (kept, hidden)")
    expect(errors.length === 0, "no errors", errors)
    await p.screenshot({ path: join(shots, `${name}-profile.png`) })
    const back = await film(p, `${name}-back`, 700, async () => {
      await p.evaluate(() => history.back())
    })
    const landed = back.samples.filter((f) => f.feed)
    expect(landed.length > 0 && landed.every((f) => Math.abs(f.y - leftAt) <= 2), "Back: the feed is there at the scroll it was left at, on its first frame", { leftAt, first: landed[0]?.y })
    /* Again: the cover was decoded once, so it is there on the first frame with no fade. */
    const again = await film(p, `${name}-again`, 600, async () => {
      const t = await p.evaluate(() => {
        const a = [...document.querySelectorAll("[data-probe-person]")].find((x) => { const r = x.getBoundingClientRect(); return r.top > 120 && r.bottom < innerHeight - 40 })
        const r = a.getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      })
      if (vp.hasTouch) await p.touchscreen.tap(t.x, t.y)
      else await p.mouse.click(t.x, t.y)
    })
    const s2 = again.samples.filter((f) => f.place)
    expect(s2.length > 0 && s2[0].img && s2[0].img.state === "now" && s2[0].img.op === 1, "opened again: the cover is whole on the place's first frame, no fade replayed", s2[0])
    console.log(`  frames filmed: open ${open1.frames}, back ${back.frames}, again ${again.frames}`)
    await p.close()
  }

  /* ── THE PLACE, photographed and measured ── */
  for (const [label, vp] of VPS) for (const who of ["sam", "me"]) {
    const name = `place-${who}-${label}`
    console.log(`\n${name}`)
    const { p, errors } = await open(vp, `/community/clay?case=place&who=${who}`, { coverDelay: 50 })
    await sleep(900)
    await p.screenshot({ path: join(shots, `${name}.png`) })
    await p.screenshot({ path: join(shots, `${name}-full.png`), fullPage: true })
    const m = await p.evaluate(() => {
      const small = []
      for (const el of document.querySelectorAll("[data-member-profile-place] a, [data-member-profile-place] button")) {
        const r = el.getBoundingClientRect()
        if (!r.width || el.closest("[hidden]")) continue
        if (r.height < 40) small.push(`${el.tagName} ${Math.round(r.width)}x${Math.round(r.height)} ${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 20)}`)
      }
      const f = document.querySelector("[data-member-profile-follow], [data-member-profile-edit]")?.getBoundingClientRect()
      const page = document.querySelector("[data-member-profile-page]")?.getBoundingClientRect()
      return { sideways: document.documentElement.scrollWidth - innerWidth, small, follow: f ? [Math.round(f.width), Math.round(f.height)] : null, page: page ? [Math.round(page.width), Math.round(page.height)] : null, rows: document.querySelectorAll("[data-profile-post]").length, more: document.querySelectorAll("[data-profile-post-more]").length, communities: document.querySelectorAll("[data-profile-post-where] img, [data-profile-post-where] span[aria-hidden]").length }
    })
    expect(m.sideways <= 0 && errors.length === 0, "nothing sideways, no errors", { sideways: m.sideways, errors })
    expect(vp.hasTouch ? m.small.length === 0 : true, "every tap at least 40px tall on a phone", m.small)
    expect(m.follow && m.page && m.follow[1] === m.page[1] && m.follow[1] === 40, "Follow (or Edit profile) and the full page door: one pair at one height", { follow: m.follow, page: m.page })
    expect(m.rows === 8, "the first page of posts", m.rows)
    expect(who === "me" ? m.more === 8 : m.more === 0, who === "me" ? "each of my posts has its dots (Edit, Delete)" : "nobody else's post has them", m.more)
    if (who === "me") {
      await p.evaluate(() => document.querySelector('[data-profile-self-tab="activity"]').click())
      await sleep(400)
      await p.screenshot({ path: join(shots, `${name}-activity.png`) })
      const acts = await p.evaluate(() => document.querySelectorAll("[data-profile-activity] li").length)
      expect(acts === 4, "Activity: the lines are there, switched with no read", acts)
    }
    await p.close()
  }

  /* ── THE FULL PAGE, arriving from a community ── */
  for (const [label, vp] of VPS) {
    const name = `full-${label}`
    console.log(`\n${name}`)
    const { p, errors } = await open(vp, `/@sam.kerr?case=full&from=community`, { throttle: 4 })
    const arrive = await film(p, `${name}-arrive`, 1200, async () => {})
    const s = arrive.samples
    const shownBefore = s.filter((f) => f.img && f.img.op > 0 && (!f.img.complete || f.img.w === 0))
    expect(shownBefore.length === 0, "the cover is never drawn before it has loaded (held clear on its band)", shownBefore.slice(0, 2))
    const bands = [...new Set(s.map((f) => f.band).filter((b) => b !== null))]
    expect(bands.length === 1, "the band is one height throughout", bands)
    expect(s.every((f) => !f.storelibHeader), "no Storelib header on any frame")
    const anim = await p.evaluate(() => document.getAnimations().map((a) => a.effect?.target?.tagName).filter(Boolean))
    void anim
    await sleep(600)
    await p.screenshot({ path: join(shots, `${name}.png`) })
    await p.evaluate(() => window.scrollTo(0, 700))
    await sleep(300)
    await p.screenshot({ path: join(shots, `${name}-scrolled.png`) })
    const bar = await p.evaluate(() => {
      const b = document.querySelector("[data-profile-top-bar]").getBoundingClientRect()
      const btn = document.querySelector("[data-profile-back-button]")
      const r = btn.getBoundingClientRect()
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return { top: Math.round(b.top), h: Math.round(b.height), hits: hit === btn || btn.contains(hit), size: [Math.round(r.width), Math.round(r.height)] }
    })
    expect(bar.top === 0 && bar.hits, "scrolled down, the top bar is still at the top and a finger on the arrow hits the arrow", bar)
    expect(bar.size[0] >= 40 && bar.size[1] >= 40, "the arrow is 40px to a thumb", bar.size)
    /* A page of ours behind: the first tap goes back. */
    await p.evaluate(() => { history.replaceState({}, "", "/community/clay?profile=sam.kerr"); history.pushState({}, "", "/@sam.kerr?case=full") ; window.__popped = null; addEventListener("popstate", () => { window.__popped = performance.now() }, { once: true }) })
    const btn = await p.evaluate(() => { const r = document.querySelector("[data-profile-back-button]").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
    const t0 = await p.evaluate(() => performance.now())
    if (vp.hasTouch) await p.touchscreen.tap(btn.x, btn.y)
    else await p.mouse.click(btn.x, btn.y)
    await sleep(500)
    const popped = await p.evaluate(() => ({ at: window.__popped, path: location.pathname + location.search }))
    expect(popped.at && popped.at - t0 < 300 && popped.path === "/community/clay?profile=sam.kerr", "the first tap goes back to the community place", { ms: popped.at ? Math.round(popped.at - t0) : null, path: popped.path })
    expect(errors.length === 0, "no errors", errors)
    await p.close()

    /* Opened cold: nothing of ours behind, so straight to the community it came from. */
    const cold = await open(vp, `/@sam.kerr?case=full&cold=1`)
    await sleep(500)
    const b2 = await cold.p.evaluate(() => { const r = document.querySelector("[data-profile-back-button]").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
    const c0 = await cold.p.evaluate(() => performance.now())
    if (vp.hasTouch) await cold.p.touchscreen.tap(b2.x, b2.y)
    else await cold.p.mouse.click(b2.x, b2.y)
    await sleep(200)
    const pushed = await cold.p.evaluate(() => window.__router || [])
    const push = pushed.find((r) => r[0] === "push")
    expect(!!push && push[1] === "/community/clay?profile=sam.kerr" && push[2] - c0 < 120, "opened cold: the first tap goes straight to the community place, no wait", push ? { href: push[1], ms: Math.round(push[2] - c0) } : pushed)
    await cold.p.close()
  }

  /* ── FOLLOW: unfollow, at 4x CPU ── */
  for (const [label, vp] of VPS) {
    console.log(`\nfollow-${label}`)
    const { p } = await open(vp, `/community/clay?case=place&who=sam`, { throttle: 4 })
    await sleep(700)
    const sample = (ms) =>
      p.evaluate(
        (ms) =>
          new Promise((done) => {
            const btn = document.querySelector("[data-member-profile-follow]")
            const face = btn.querySelector('[data-follow-fill="follow"]')
            const out = []
            const t0 = performance.now()
            const tick = () => {
              const r = btn.getBoundingClientRect()
              out.push({ t: Math.round(performance.now() - t0), op: Number(getComputedStyle(face).opacity), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 })
              if (performance.now() - t0 < ms) requestAnimationFrame(tick)
              else done(out)
            }
            requestAnimationFrame(tick)
          }),
        ms,
      )
    const btn = await p.evaluate(() => { const r = document.querySelector("[data-member-profile-follow]").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
    const watching = sample(700)
    if (vp.hasTouch) await p.touchscreen.tap(btn.x, btn.y)
    else await p.mouse.click(btn.x, btn.y)
    const s = await watching
    const steps = s.slice(1).map((f, i) => Math.round((f.op - s[i].op) * 100) / 100)
    const moving = s.filter((f) => f.op > 0.02 && f.op < 0.98)
    const sizes = new Set(s.map((f) => `${f.w}x${f.h}`))
    expect(s[s.length - 1].op === 1, "unfollow ends on Follow", s[s.length - 1])
    expect(Math.max(...steps) <= 0.34, "the dark face rises calmly: no step bigger than a third in one frame", { biggest: Math.max(...steps), frames: moving.length })
    expect(sizes.size === 1, "the box is one size on every frame", [...sizes])
    console.log(`  opacity by frame: ${s.slice(0, 24).map((f) => f.op.toFixed(2)).join(" ")}`)
    await p.close()
  }
} finally {
  await browser.close()
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
