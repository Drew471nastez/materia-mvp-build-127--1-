/**
 * ===========================================================================
 *  ROUND 31, FILMED IN THE REAL APP: THE HOPS BETWEEN THE BUYER'S PAGES
 * ===========================================================================
 * Round 30 filmed stand ins (the community frame mounted by hand, an /app
 * document served by a probe server). The owner tested production after it
 * and still saw:
 *
 *   HOME       from /account, Home on the tab bar (a phone) or Discover in
 *              the header (a computer): a white blink on the way to
 *              /explore, worst in the dark look.
 *   COMMUNITY  a community opened from Explore: too abrupt, and the iOS
 *              spinner shown while it comes sits on a white screen in the
 *              dark look.
 *   TABS       Community, Learn, Calendar, Members, About inside one: too
 *              direct, wants a short calm crossfade, the bar still.
 *   APP        a community to the dashboard: a blink, light or dark, as a
 *              client move and as a document.
 *   SPEED      the tab bar between Explore, Library and Account: laggy.
 *
 * GROUND needs no server: the app's stylesheets in the order app/(storelib)/layout.tsx
 * loads them, in the browser and in the app (html.capacitor), light and dark,
 * and what the body and the canvas are painted.
 *
 * The rest drives a production build of this checkout (`next build` with
 * NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399, the stand in database
 * below; in a worktree whose node_modules is a link, Turbopack needs
 * `turbopack: { root: "/" }` in the config for that build), through
 * the real Next router, with every RSC answer held back LATENCY_MS (450 by
 * default: a production server render, so loading screens and Suspense
 * fallbacks are on screen as they are for the owner). Every painted frame of
 * each hop is filmed (CDP screencast) and read: its average colour, its
 * brightest 16px block, and its share of near white pixels that are dark on
 * the frames before and after the hop (a flash). On every animation frame
 * the page says its address, the look on <html>, and the opacity and
 * transform of the parts that move. SPEED times a tap on the tab bar to the
 * first frame of the next page at 4x CPU, with the long tasks on the way.
 *
 *   node scripts/check-transitions-round31.mjs [ground home community tabs app speed]
 *   node scripts/check-transitions-round31.mjs stub   the stand in database alone, for a server started by hand
 *   VIEWS=phone,desk,app LOOKS=light,dark            which of each (app: the phone with the app's user agent)
 *   NO_STUB=1                                        use the `stub` one already running
 *   ROOT=<dir>                   another checkout's build and sources (a snapshot of the commit before)
 *   BASE=http://127.0.0.1:3931   a server already running (else `next start` on the build in .next)
 *   SHOTS_DIR=...                keeps every filmed frame to look at
 *   LATENCY_MS=450               how long each RSC answer is held
 *   REPORT_ONLY=1                print the numbers, judge nothing (for a "before" run)
 *   DEV=1                        `next dev --turbopack` instead of `next start` (no build needed; prefetch is off in
 *                                development, so SPEED is only meaningful against a production build)
 */
import { spawn } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { serveSupabaseStub } from "./supabase-stub-server.mjs"
import { appCss } from "./probe-css.mjs"
import { explore25Tables, EXPLORE25_ME } from "./explore25-stub.mjs"

const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const STUB_PORT = Number(process.env.STUB_PORT || 54399)
const PORT = Number(process.env.PORT || 3931)
const BASE = (process.env.BASE || `http://127.0.0.1:${PORT}`).replace(/\/$/, "")
const LATENCY_MS = Number(process.env.LATENCY_MS ?? 450)
const REPORT_ONLY = process.env.REPORT_ONLY === "1"
const DEV = process.env.DEV === "1"
/* The checkout whose build and sources are measured (a snapshot of the commit before, for the "before" numbers). */
const ROOT = process.env.ROOT || process.cwd()
const only = new Set(process.argv.slice(2).map((s) => s.toLowerCase()))
const want = (s) => only.size === 0 || only.has(s)
const shots = process.env.SHOTS_DIR || null
if (shots) mkdirSync(shots, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const LONG = 120_000
const SESSION_FILE = process.env.SESSION_FILE || "/tmp/storelib-round31-session.json"
let broken = 0
const expect = (ok, what, got) => {
  const mark = REPORT_ONLY ? "    " : ok ? "ok  " : "FAIL"
  console.log(`  ${mark}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok && !REPORT_ONLY) broken++
}
const PHONE = { name: "phone", vp: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } }
const DESK = { name: "desk", vp: { width: 1440, height: 900, deviceScaleFactor: 1 } }
/* The phone app: the same phone, with the app's user agent, so the head script marks <html> as the app's (html.capacitor) as the Capacitor shell does. */
const APPV = { name: "app", vp: PHONE.vp, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 StorelibApp Capacitor" }
const LOOKS = (process.env.LOOKS || "light,dark").split(",")
const VIEWS = (process.env.VIEWS || "phone,desk,app").split(",").map((n) => ({ phone: PHONE, desk: DESK, app: APPV })[n]).filter(Boolean)

/* ── The stand in database: Explore's, and the person signed in is a seller too, so /app draws ── */
const tables = explore25Tables()
const meProfile = tables.profiles.find((p) => p.id === EXPLORE25_ME.id)
Object.assign(meProfile, { email_verified: true, is_creator: true })
tables.creators.push({ id: "22222222-2222-4222-8222-000000000099", user_id: EXPLORE25_ME.id, slug: "ivy", username: "ivy", display_name: "Ivy Lane", avatar_url: null, bio: "", onboarding_completed: true, store_published: true, banned_at: null, stripe_account_id: null, stripe_onboarding_status: "not_connected", payouts_enabled: false, charges_enabled: false, subscription_plan_id: "free", created_at: "2026-08-01T10:00:00.000Z", niche_tags: [] })
let stub = null
let session = null
let next = null
const SERVER_PARTS = ["home", "community", "tabs", "app", "speed"]
/* `stub` alone: the stand in database, served until stopped, for a server started by hand (BASE=..., NO_STUB=1). */
if (only.has("stub")) {
  const own = await serveSupabaseStub({ port: STUB_PORT, tables, users: [EXPLORE25_ME] })
  writeFileSync(SESSION_FILE, JSON.stringify(own.sessionCookie(EXPLORE25_ME.id)))
  console.log(`stand in database on ${STUB_PORT}, session in ${SESSION_FILE}`)
  await new Promise(() => {})
}
if (SERVER_PARTS.some(want)) {
  if (process.env.NO_STUB !== "1") stub = await serveSupabaseStub({ port: STUB_PORT, tables, users: [EXPLORE25_ME] })
  session = stub ? stub.sessionCookie(EXPLORE25_ME.id) : JSON.parse(readFileSync(SESSION_FILE, "utf8"))
  if (!process.env.BASE) {
    const env = { ...process.env, PORT: String(PORT), NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${STUB_PORT}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "x", SUPABASE_SERVICE_ROLE_KEY: "x", STRIPE_SECRET_KEY: "sk_test_placeholder", RESEND_API_KEY: "re_placeholder", EXPLORE_MARKETPLACE_ENABLED: "1", NEXT_TELEMETRY_DISABLED: "1" }
    /* DEV=1: `next dev` (Turbopack) of the checkout instead of a production build, where a build does not fit in memory. */
    const args = DEV ? ["dev", "--turbopack", "-p", String(PORT), "-H", "127.0.0.1"] : ["start", "-p", String(PORT), "-H", "127.0.0.1"]
    next = spawn(process.execPath, ["node_modules/next/dist/bin/next", ...args], { cwd: ROOT, env: { ...env, ...(DEV ? { PROBE_LINKED_BUILD: "1" } : {}) }, stdio: ["ignore", "pipe", "pipe"] })
    let out = ""
    next.stdout.on("data", (d) => { out += d })
    next.stderr.on("data", (d) => { out += d })
    let up = false
    for (let i = 0; i < 120 && !up; i++) {
      await sleep(500)
      up = await fetch(`${BASE}/robots.txt`).then((r) => r.ok).catch(() => false)
    }
    if (!up) { console.error(`next start did not come up\n${out.slice(-2000)}`); process.exit(1) }
  }
  /* Every page each hop goes to, asked for once, so a development server has compiled it before anything is filmed. */
  const cookie = `${session.name}=${session.value}; storelib_consent=2.p1.a0.m0.${Math.floor(Date.now() / 1000)}`
  const warm = ["/explore", "/explore?type=communities", "/account", "/community/club-1", ...(want("tabs") ? ["/community/club-1/about", "/community/club-1/members"] : []), ...(want("speed") ? ["/account/library"] : []), ...(want("app") ? ["/app"] : [])]
  for (const path of warm) {
    await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" }).then((r) => r.text()).catch(() => {})
  }
}
const stopAll = () => { next?.kill(); stub?.server.close() }
process.on("exit", stopAll)

/* ── Frames ── */
const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
async function readFrame(b64) {
  const { data, info } = await sharp(Buffer.from(b64, "base64")).resize({ width: 195, fit: "inside" }).raw().toBuffer({ resolveWithObject: true })
  const n = info.width * info.height
  const ch = info.channels
  let r = 0, g = 0, b = 0
  const bright = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const R = data[i * ch], G = data[i * ch + 1], B = data[i * ch + 2]
    r += R; g += G; b += B
    bright[i] = lum(R, G, B) > 0.8 ? 1 : 0
  }
  /* The brightest 8x8 block (about 16px of a phone, 60px of a computer): a white patch shows here even when the average hides it. */
  let top = { l: 0, rgb: [0, 0, 0] }
  for (let y = 0; y + 8 <= info.height; y += 4) {
    for (let x = 0; x + 8 <= info.width; x += 4) {
      let R = 0, G = 0, B = 0
      for (let yy = y; yy < y + 8; yy++) for (let xx = x; xx < x + 8; xx++) { const i = (yy * info.width + xx) * ch; R += data[i]; G += data[i + 1]; B += data[i + 2] }
      const l = lum(R / 64, G / 64, B / 64)
      if (l > top.l) top = { l, rgb: [Math.round(R / 64), Math.round(G / 64), Math.round(B / 64)] }
    }
  }
  const avg = [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
  return { avg, l: lum(...avg), top, bright, share: bright.reduce((a, v) => a + v, 0) / n }
}
function flashShare(frame, first, last) {
  if (frame.bright.length !== first.bright.length || frame.bright.length !== last.bright.length) return 0
  let k = 0
  for (let i = 0; i < frame.bright.length; i++) if (frame.bright[i] && !first.bright[i] && !last.bright[i]) k++
  return k / frame.bright.length
}

async function open(browser, view, path, { look = "light", cpu = 1, waitFor } = {}) {
  const ctx = await browser.createBrowserContext()
  const p = await ctx.newPage()
  p.__ctx = ctx
  await p.setViewport(view.vp)
  if (view.ua) await p.setUserAgent(view.ua)
  p.__errors = []
  p.on("pageerror", (e) => p.__errors.push(String(e.message || e).slice(0, 200)))
  await p.setCookie({ ...session, url: BASE }, { name: "storelib_consent", value: `2.p1.a0.m0.${Math.floor(Date.now() / 1000)}`, url: BASE })
  /* The look as this browser keeps it, before the first document reads it. */
  await p.evaluateOnNewDocument((look) => {
    try {
      localStorage.setItem("storelib:appearance", look)
      sessionStorage.setItem("storelib:appearance-synced", "1")
    } catch {}
  }, look)
  /* A production server's render time on every RSC answer (navigations and prefetches alike). */
  if (LATENCY_MS > 0) {
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const h = r.headers()
      const rsc = h.rsc === "1" || /[?&]_rsc=/.test(r.url())
      if (rsc && process.env.DEBUG_RSC) console.log("RSC", Math.round(performance.now()), r.method(), r.url().replace(BASE, "").replace(/_rsc=[^&]*/, ""), JSON.stringify(Object.fromEntries(Object.entries(h).filter(([k]) => k.startsWith("next-router") || k === "next-url"))).slice(0, 160))
      if (rsc) setTimeout(() => r.continue().catch(() => {}), LATENCY_MS)
      else r.continue().catch(() => {})
    })
  }
  await p.goto(BASE + path, { waitUntil: "load", timeout: LONG })
  if (waitFor) await p.waitForSelector(waitFor, { timeout: LONG })
  await p.evaluate(() => document.fonts.ready)
  await sleep(2500)
  if (cpu > 1) {
    p.__cdpCpu = await p.createCDPSession()
    await p.__cdpCpu.send("Emulation.setCPUThrottlingRate", { rate: cpu })
  }
  return p
}

/* Films `act` from just before it until `until` holds and `settle` ms more. */
async function film(p, act, { until, settle = 900, max = DEV ? 40000 : 6000 } = {}) {
  const cdp = await p.createCDPSession()
  const frames = []
  let t0 = Date.now()
  cdp.on("Page.screencastFrame", (f) => {
    frames.push({ t: Date.now() - t0, data: f.data })
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 })
  await sleep(300)
  const before = frames.length
  t0 = Date.now()
  await act()
  if (until) await p.waitForFunction(until, { timeout: max, polling: 16 }).catch(() => {})
  await sleep(settle)
  await cdp.send("Page.stopScreencast")
  await cdp.detach().catch(() => {})
  const from = frames.slice(Math.max(0, before - 1))
  return from.map((f, i) => ({ ...f, t: i === 0 && before > 0 ? 0 : Math.max(0, f.t) }))
}

/* On every animation frame from now: the address, the look, and whatever `probe` (a function body) returns. */
const watchFrames = (p, probe = "return null", ms = 4000) =>
  p.evaluate(
    (probe, ms) => {
      const read = new Function(probe)
      const log = (window.__log = [])
      const t0 = performance.now()
      const tick = () => {
        const h = document.documentElement
        log.push({ t: Math.round(performance.now() - t0), path: location.pathname, dark: h.hasAttribute("data-sl-dark"), cls: h.className, body: getComputedStyle(document.body).backgroundColor, x: read() })
        if (performance.now() - t0 < ms) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    },
    probe,
    ms,
  )

async function judgeFrames(frames, label, look, extra = {}) {
  const read = []
  for (const f of frames) read.push({ t: f.t, ...(await readFrame(f.data)) })
  const first = read[0]
  const last = read[read.length - 1]
  let worst = { share: 0, t: null }
  for (const f of read) {
    const s = flashShare(f, first, last)
    if (s > worst.share) worst = { share: +s.toFixed(4), t: f.t }
  }
  const lightest = read.reduce((a, f) => (f.l > a.l ? f : a), read[0])
  const brightestBlock = read.reduce((a, f) => (f.top.l > a.top.l ? f : a), read[0])
  /* Only the frames that differ from the one before, so the line is the hop and not the wait. */
  const changed = read.filter((f, i) => i === 0 || i === read.length - 1 || f.avg.some((v, k) => Math.abs(v - read[i - 1].avg[k]) > 1) || f.top.rgb.some((v, k) => Math.abs(v - read[i - 1].top.rgb[k]) > 3))
  console.log(`    ${read.length} frames; those that changed (average colour [brightest block]): ${changed.slice(0, 40).map((f) => `${f.t}ms ${f.avg.join(",")} [${f.top.rgb.join(",")}]`).join(" | ")}`)
  const ends = Math.max(first.l, last.l)
  if (shots && extra.dir) {
    const dir = join(shots, extra.dir)
    mkdirSync(dir, { recursive: true })
    for (const f of frames) writeFileSync(join(dir, `${String(f.t).padStart(5, "0")}ms.png`), Buffer.from(f.data, "base64"))
  }
  /* A BLINK: the screen's brightness turning back on itself by a large step (light, dark, light), frame to frame. */
  let blinks = 0
  let dir = 0
  let from = read[0].l
  for (const f of read.slice(1)) {
    const d = f.l - from
    if (Math.abs(d) < 0.2) continue
    const now = Math.sign(d)
    if (dir && now !== dir) blinks++
    dir = now
    from = f.l
  }
  expect(blinks === 0, `${label}: no blink (the screen's brightness never turns back on itself by 0.2 or more)`, blinks)
  if (extra.across) {
    console.log(`    (light to dark or dark to light: judged by the blink count, not by the brightest frame)`)
    return { read, worst, lightest, blinks }
  }
  expect(worst.share < 0.01, `${label}: no light field on any frame that is dark before and after (worst share)`, worst)
  expect(lightest.l <= ends + 0.03, `${label}: no frame brighter on average than the pages either side`, { lightest: +lightest.l.toFixed(3), at: lightest.t, from: +first.l.toFixed(3), to: +last.l.toFixed(3) })
  if (look === "dark") {
    const endTop = Math.max(first.top.l, last.top.l)
    expect(brightestBlock.top.l <= Math.max(endTop, 0.35) + 0.05, `${label}: no white patch on any frame in the dark (brightest 16px block)`, { brightest: brightestBlock.top.rgb, at: brightestBlock.t, ends: [first.top.rgb, last.top.rgb] })
  }
  return { read, worst, lightest }
}

const center = async (p, sel) => {
  /* Brought into the window first when it is below the fold (Explore's community cards on a computer). */
  const moved = await p.evaluate((sel) => {
    const all = [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0)
    if (!all.length || all.some((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })) return false
    all[0].scrollIntoView({ block: "center" })
    return true
  }, sel)
  if (moved) await sleep(800)
  return centerNow(p, sel)
}
const centerNow = (p, sel) =>
  p.evaluate((sel) => {
    const el = [...document.querySelectorAll(sel)].find((e) => {
      const r = e.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight
    })
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 40), href: el.getAttribute("href") }
  }, sel)
const press = async (p, view, at) => (view.vp.hasTouch ? p.touchscreen.tap(at.x, at.y) : p.mouse.click(at.x, at.y))

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"], protocolTimeout: LONG })
try {
  /* ── GROUND: what shows wherever a page does not cover the window, in the app and in a browser ── */
  if (want("ground")) {
    console.log(`\nGROUND: the body and the canvas in the dark look (${ROOT === process.cwd() ? "this checkout" : ROOT})`)
    process.env.PROBE_CSS = "source"
    const css = await appCss(ROOT)
    const theme = readFileSync(join(ROOT, "app/theme-dark.css"), "utf8")
    for (const look of LOOKS) {
      for (const shell of ["browser", "app"]) {
        for (const page of ["explore", "account"]) {
          const p = await browser.newPage()
          await p.setViewport(PHONE.vp)
          /* The order app/(storelib)/layout.tsx imports them in: the dark sheet, then globals.css. */
          await p.setContent(`<!doctype html><html class="${shell === "app" ? "capacitor elastic-scroll" : "elastic-scroll"}" ${look === "dark" ? 'data-sl-dark="" style="color-scheme:dark"' : ""}><head><style>${theme}</style><style>${css}</style></head><body class="bg-background"><div style="height:200px"></div></body></html>`)
          /* The account's layout writes its canvas inline (components/library/library-bg-fix.tsx). */
          if (page === "account") await p.evaluate(() => { document.documentElement.style.backgroundColor = "#fafafa"; document.documentElement.classList.add("library-layout") })
          const got = await p.evaluate(() => ({ body: getComputedStyle(document.body).backgroundColor, canvas: getComputedStyle(document.documentElement).backgroundColor }))
          const light = (c) => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(c); return !!m && lum(+m[1], +m[2], +m[3]) > 0.5 }
          const label = `${look} ${shell} ${page}`
          console.log(`    ${label}: body ${got.body}, canvas ${got.canvas}`)
          if (look === "dark") {
            expect(!light(got.body), `${label}: the body under a page that lands is the dark ground`, got.body)
            expect(!light(got.canvas), `${label}: the canvas past the page is the dark ground`, got.canvas)
          }
          await p.close()
        }
      }
    }
  }

  /* ── HOME: /account to /explore ─────────────────────────────────────── */
  if (want("home")) {
    /* One hop first, not filmed: a development server compiles what a client move asks for on its first ask. */
    if (DEV) {
      const p = await open(browser, PHONE, "/account", { waitFor: '[data-page="account"]' })
      const at = await center(p, '[data-buyer-tab="home"]')
      if (at) await press(p, PHONE, at)
      await p.waitForFunction(() => location.pathname === "/explore", { timeout: 90000 }).catch(() => {})
      await sleep(3000)
      await p.__ctx.close()
    }
    for (const look of LOOKS) {
      for (const view of VIEWS) {
        const label = `home ${look} ${view.name}`
        console.log(`\nHOME: /account to Explore, ${label}`)
        const p = await open(browser, view, "/account", { look, waitFor: '[data-page="account"]' })
        const sel = view.vp.hasTouch ? '[data-buyer-tab="home"]' : 'header a[href="/explore"]'
        const at = await center(p, sel)
        expect(!!at, `${label}: ${sel} on screen`)
        if (!at) { await p.__ctx.close(); continue }
        await watchFrames(p, `const g = document.querySelector(".explore-ground"); const s = document.querySelector("[data-route-slow-page]"); return { ground: g ? +getComputedStyle(g).opacity : null, groundBg: g ? getComputedStyle(g).backgroundColor : null, cards: document.querySelectorAll("[data-product-card], [data-explore-community]").length, slow: s ? s.style.background : null }`)
        const frames = await film(p, () => press(p, view, at), { until: () => location.pathname === "/explore" && document.querySelectorAll("[data-product-card], [data-explore-community]").length > 0, settle: 700 })
        const log = await p.evaluate(() => window.__log || [{ t: 0, path: location.pathname, dark: document.documentElement.hasAttribute("data-sl-dark"), cls: "", body: "", x: { documentLoad: true } }])
        const atExplore = log.filter((f) => f.path === "/explore")
        console.log(`    by frame: ${log.filter((_, i) => i % 3 === 0).slice(0, 30).map((f) => `${f.t}ms ${f.path === "/explore" ? "E" : "A"}${f.dark ? "d" : "l"} g${f.x?.ground ?? "-"} ${f.x?.cards ?? 0}c${f.x?.slow ? ` slow:${f.x.slow}` : ""}`).join(" | ")}`)
        expect(log.every((f) => f.dark === (look === "dark")), `${label}: the look on <html> never changes on the way`, [...new Set(log.map((f) => f.dark))])
        expect(atExplore.every((f) => f.x.groundBg === null || f.x.groundBg !== "rgb(255, 255, 255)"), `${label}: Explore's ground is never white`, [...new Set(atExplore.map((f) => f.x.groundBg))])
        await judgeFrames(frames, label, look, { dir: `home-${look}-${view.name}` })
        expect(p.__errors.length === 0, `${label}: no page errors`, p.__errors)
        await p.__ctx.close()
      }
    }
  }

  /* ── COMMUNITY: Explore to a community ──────────────────────────────── */
  if (want("community")) {
    if (DEV) {
      const p = await open(browser, PHONE, "/explore?type=communities", { waitFor: "[data-explore-community]" })
      const at = await center(p, "a[data-explore-community]")
      if (at) await press(p, PHONE, at)
      await p.waitForFunction(() => location.pathname.startsWith("/community/"), { timeout: 90000 }).catch(() => {})
      await sleep(4000)
      await p.__ctx.close()
    }
    for (const look of LOOKS) {
      for (const view of VIEWS) {
        const label = `community ${look} ${view.name}`
        console.log(`\nCOMMUNITY: Explore to a community, ${label}`)
        const p = await open(browser, view, "/explore?type=communities", { look, waitFor: "[data-explore-community]" })
        const at = await center(p, "a[data-explore-community]")
        expect(!!at, `${label}: a community card on screen`)
        if (!at) { await p.__ctx.close(); continue }
        /* Read ahead as a finger on the card does (explore-communities-results.tsx warm), so the hop is the motion and not the server. */
        await p.evaluate((h) => { try { window.next.router.prefetch(h, { kind: "full" }) } catch {} }, at.href)
        await sleep(DEV ? 12000 : 3000)
        await watchFrames(p, `const still = document.querySelector("[data-arrival-still]"); const s = document.querySelector("[data-community-shell], [data-community-public]"); const sp = document.querySelector("[data-route-slow-page]"); const ps = document.querySelector("[data-place-spinner]"); const bar = s && s.querySelector("header, [data-community-top-bar]"); return { shell: s ? { o: +getComputedStyle(s).opacity, theme: s.getAttribute("data-community-theme"), bg: getComputedStyle(s).backgroundColor, tr: getComputedStyle(s).translate + " " + getComputedStyle(s).transform } : null, slow: sp ? { bg: sp.style.background, o: +getComputedStyle(sp).opacity } : null, placeSpinner: ps ? +getComputedStyle(ps).opacity : null, barTop: bar ? Math.round(bar.getBoundingClientRect().top) : null, still: still ? +getComputedStyle(still).opacity : null }`)
        const frames = await film(p, () => press(p, view, at), { until: () => !!document.querySelector("[data-community-shell] [data-place-seed], [data-community-public] main, [data-community-shell] [data-place-screen]"), settle: 900 })
        const log = await p.evaluate(() => window.__log || [{ t: 0, path: location.pathname, dark: document.documentElement.hasAttribute("data-sl-dark"), cls: "", body: "", x: { documentLoad: true } }])
        const fromCommit = Math.max(0, log.findIndex((f) => f.path.startsWith("/community/")) - 2)
        console.log(`    by frame from the commit: ${log.slice(fromCommit, fromCommit + 16).map((f) => `${f.t}ms ${f.path.slice(0, 18)} ${f.dark ? "d" : "l"} ${f.x.shell ? `shell o${f.x.shell.o.toFixed(2)} ${f.x.shell.theme} bar@${f.x.barTop}` : "-"}${f.x.still !== null && f.x.still !== undefined ? ` explore-going o${f.x.still.toFixed(2)}` : ""}${f.x.slow ? ` slow ${f.x.slow.bg} o${f.x.slow.o.toFixed(2)}` : ""}`).join(" | ")}`)
        const bars = [...new Set(log.filter((f) => f.x.shell && f.x.barTop !== null).map((f) => f.x.barTop))]
        expect(bars.length <= 1, `${label}: the community's bar stands still from its first frame`, bars)
        const slows = log.filter((f) => f.x.slow)
        if (look === "dark") expect(slows.every((f) => !/255, 255, 255|rgb\(2[0-5]\d, 2[0-5]\d/.test(f.x.slow.bg)), `${label}: the spinner's surface, when there is one, is the dark ground`, [...new Set(slows.map((f) => f.x.slow.bg))])
        const shells = log.filter((f) => f.x.shell)
        expect(shells.every((f) => f.x.shell.theme === look), `${label}: the frame is in the ${look} look on every frame it is there`, [...new Set(shells.map((f) => f.x.shell.theme))])
        expect(shells.every((f) => /none/.test(f.x.shell.tr) || f.x.shell.tr === "none none"), `${label}: the frame never moves sideways`, [...new Set(shells.map((f) => f.x.shell.tr))])
        await judgeFrames(frames, label, look, { dir: `community-${look}-${view.name}` })
        expect(p.__errors.length === 0, `${label}: no page errors`, p.__errors)
        await p.__ctx.close()
      }
    }
  }

  /* ── TABS: Community, Learn, Calendar, Members, About inside one ────── */
  if (want("tabs")) {
    for (const look of LOOKS) {
      for (const view of VIEWS) {
        const label = `tabs ${look} ${view.name}`
        console.log(`\nTABS: inside a community, ${label}`)
        const p = await open(browser, view, "/community/club-1", { look, waitFor: "[data-community-shell]" })
        /* Every place read ahead, so the motion is filmed and not a fetch. */
        await sleep(2500)
        const tabs = await p.evaluate(() => [...document.querySelectorAll("[data-community-tabs] a[href]")].filter((a) => a.getBoundingClientRect().width > 0).map((a) => a.getAttribute("href")))
        console.log(`    tabs: ${tabs.join(" ")}`)
        expect(tabs.length >= 3, `${label}: the place row is on screen`, tabs.length)
        for (const href of tabs.slice(1, 4).concat(tabs.slice(0, 1))) {
          const at = await p.evaluate((href) => {
            const a = [...document.querySelectorAll(`[data-community-tabs] a[href="${href}"]`)].find((a) => a.getBoundingClientRect().width > 0)
            if (!a) return null
            const r = a.getBoundingClientRect()
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
          }, href)
          if (!at) continue
          await watchFrames(p, `const hosts = [...document.querySelectorAll("[data-place-screen], [data-place-routed]")].filter((e) => e.getClientRects().length); const bar = document.querySelector("[data-community-shell] header") || document.querySelector("[data-community-tabs]"); const leaving = document.querySelector("div[data-place-still]"); return { leaving: leaving ? +getComputedStyle(leaving).opacity : null, screens: hosts.map((e) => { const cs = getComputedStyle(e); return { k: e.getAttribute("data-place-screen") || "routed", o: +cs.opacity, tr: cs.translate } }), bar: bar ? Math.round(bar.getBoundingClientRect().top * 10) / 10 : null, anims: hosts.flatMap((e) => e.getAnimations().map((a) => ({ ms: a.effect.getTiming().duration, props: [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k).filter((x) => !["offset", "easing", "composite", "computedOffset"].includes(x))))] }))) }`, 1200)
          await press(p, view, at)
          await sleep(1300)
          const log = await p.evaluate(() => window.__log || [{ t: 0, path: location.pathname, dark: document.documentElement.hasAttribute("data-sl-dark"), cls: "", body: "", x: { documentLoad: true } }])
          const faded = log.filter((f) => f.x.screens.some((s) => s.o < 0.999))
          const anims = log.flatMap((f) => f.x.anims)
          const bars = [...new Set(log.map((f) => f.x.bar))]
          const firstO = log.find((f) => f.x.screens.some((s) => s.o < 0.999))?.x.screens.map((s) => s.o.toFixed(2)).join("/")
          console.log(`    ${href}: frames below full opacity ${faded.length}, first ${firstO ?? "-"}, animations ${JSON.stringify(anims.slice(0, 1))}, bar at ${bars.join(",")}`)
          expect(faded.length >= 2, `${label} ${href}: the place arrives on a fade (frames below full opacity)`, faded.length)
          const out = log.filter((f) => f.x.leaving !== null).map((f) => +f.x.leaving.toFixed(2))
          expect(out.length >= 2 && out[out.length - 1] < out[0], `${label} ${href}: the place left goes out over it (its copy's opacity by frame)`, out.slice(0, 10))
          expect(anims.every((a) => a.ms >= 150 && a.ms <= 220 && a.props.every((x) => x === "opacity" || x === "translate" || x === "transform")), `${label} ${href}: one short fade, 150 to 220ms, opacity and a rise only`, anims.slice(0, 2))
          expect(bars.length === 1, `${label} ${href}: the bar never moves`, bars)
        }
        expect(p.__errors.length === 0, `${label}: no page errors`, p.__errors)
        await p.__ctx.close()
      }
    }
  }

  /* ── APP: a community to the dashboard ──────────────────────────────── */
  if (want("app")) {
    for (const look of LOOKS) {
      for (const view of VIEWS) {
        for (const how of ["client", "document"]) {
          const label = `app ${how} ${look} ${view.name}`
          console.log(`\nAPP: a community to /app, ${label}`)
          const p = await open(browser, view, "/community/club-1", { look, waitFor: "[data-community-shell]" })
          await watchFrames(p, `const a = document.documentElement; const v = getComputedStyle(a, "::after"); const st = document.querySelector("[data-into-app-still]"); return { veil: v.content !== "none" && v.content !== "normal" ? +v.opacity : null, still: st ? +getComputedStyle(st).opacity : null, stills: document.querySelectorAll("[data-into-app-still]").length, shell: !!document.querySelector(".app-content-scroll, [data-app-shell]"), community: !!document.querySelector("[data-community-shell]") }`, DEV ? 20000 : 5000)
          /* Recorded in every document from its first line too, for the document load. */
          /* A press on a Dashboard link, as next/link answers it (a click on an <a href="/app"> the router carries), or a document load. */
          const act = how === "client" ? () => p.evaluate(() => { const a = document.createElement("a"); a.href = "/app"; a.addEventListener("click", (e) => { e.preventDefault(); window.next.router.push("/app") }); document.body.append(a); a.click(); a.remove() }) : () => p.evaluate(() => location.assign("/app"))
          const frames = await film(p, act, { until: () => location.pathname === "/app" && !!document.querySelector(".app-content-scroll") && !document.documentElement.classList.contains("app-from-dark"), settle: 1200, max: 15000 })
          const log = await p.evaluate(() => window.__log || [])
          const at = Math.max(0, log.findIndex((f) => f.path === "/app") - 2)
          if (log.length) console.log(`    by frame from the commit: ${log.slice(at, at + 18).map((f) => `${f.t}ms ${f.path.slice(0, 16)} ${f.dark ? "d" : "l"}${f.x.veil !== null && f.x.veil !== undefined ? ` veil${f.x.veil.toFixed(2)}` : ""}${f.x.still !== null && f.x.still !== undefined ? ` page-left${f.x.still.toFixed(2)}x${f.x.stills}` : ""}${f.x.shell ? " shell" : ""}${f.x.community ? " comm" : ""}`).join(" | ")}`)
          if (how === "client") {
            const outs = log.filter((f) => f.x.still !== null && f.x.still !== undefined).map((f) => f.x.still)
            expect(outs.length >= 2 && outs.every((o, i) => i === 0 || o <= outs[i - 1] + 0.01), `${label}: the page left goes out over the dashboard and never comes back`, outs.slice(0, 12).map((o) => +o.toFixed(2)))
          }
          const atApp = await p.evaluate(() => ({ path: location.pathname, dark: document.documentElement.hasAttribute("data-sl-dark") }))
          expect(atApp.path === "/app" && !atApp.dark, `${label}: on /app, never in the dark look`, atApp)
          await judgeFrames(frames, label, look, { dir: `app-${how}-${look}-${view.name}`, across: look === "dark" })
          expect(p.__errors.length === 0, `${label}: no page errors`, p.__errors)
          await p.__ctx.close()
        }
      }
    }
  }

  /* ── SPEED: the tab bar, tap to the next page's first frame, 4x CPU ── */
  if (want("speed")) {
    const route = [
      ["/explore", "library", "/account/library", "[data-library-panel], [data-page='account']"],
      ["/account/library", "profile", "/account", "[data-page='account'] [data-account-hub], [data-page='account']"],
      ["/account", "home", "/explore", ".explore-ground"],
      ["/explore", "profile", "/account", "[data-page='account']"],
    ]
    for (const look of LOOKS) {
      console.log(`\nSPEED: the tab bar at 4x CPU, ${look}`)
      for (const [from, tab, to, marker] of route) {
        const p = await open(browser, PHONE, from, { look, cpu: 4, waitFor: "[data-buyer-tab-bar]" })
        /* Let the bar's reads ahead go out, as a person looking at the page for a moment would. */
        await sleep(3000)
        const at = await center(p, `[data-buyer-tab="${tab}"]`)
        if (!at) { expect(false, `${look} ${from} -> ${to}: the ${tab} tab`); await p.__ctx.close(); continue }
        await p.evaluate((to, marker, tab) => {
          window.__speed = { tap: null, pressed: null, commit: null, shown: null, long: [] }
          const s = window.__speed
          try {
            new PerformanceObserver((l) => { for (const e of l.getEntries()) s.long.push(Math.round(e.duration)) }).observe({ type: "longtask", buffered: false })
          } catch {}
          document.addEventListener("touchstart", () => { if (s.tap === null) s.tap = performance.now() }, { capture: true, once: true })
          const el = document.querySelector(`[data-buyer-tab="${tab}"]`)
          const colour0 = el ? getComputedStyle(el).color : null
          const lens = document.querySelector("[data-buyer-tabs-lens]")
          const tick = () => {
            const now = performance.now()
            if (s.tap !== null) {
              if (s.pressed === null && ((el && getComputedStyle(el).color !== colour0) || (lens && lens.getAttribute("data-buyer-tabs-lens") === "lit"))) s.pressed = now
              if (s.commit === null && location.pathname === to) s.commit = now
              if (s.shown === null && location.pathname === to && document.querySelector(marker)) s.shown = now
            }
            if (s.shown === null || now - s.tap < 400) requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }, to, marker, tab)
        /* What the tap itself asks the server for: nothing, when the tab's page was read ahead. */
        const asked = []
        const onReq = (r) => { if (r.headers().rsc === "1" || /[?&]_rsc=/.test(r.url())) asked.push(`${r.method()} ${r.headers()["next-action"] ? "action " : ""}${r.headers()["next-router-prefetch"] ? "prefetch " : ""}${new URL(r.url()).pathname}${new URL(r.url()).search.replace(/_rsc=[^&]*/, "").slice(0, 40)}`) }
        p.on("request", onReq)
        await p.touchscreen.tap(at.x, at.y)
        await p.waitForFunction(() => window.__speed.shown !== null, { timeout: 15000, polling: 50 }).catch(() => {})
        await sleep(600)
        const s = await p.evaluate(() => window.__speed)
        const d = (x) => (x === null || s.tap === null ? null : Math.round(x - s.tap))
        p.off("request", onReq)
        const r = { pressed: d(s.pressed), commit: d(s.commit), firstFrame: d(s.shown), longTasks: s.long, askedOnTap: asked }
        console.log(`    ${look} ${from} -> ${to}: ${JSON.stringify(r)}`)
        expect(r.firstFrame !== null && r.firstFrame <= 350, `${look} ${from} -> ${to}: the next page's first frame within 350ms of the tap at 4x CPU`, r.firstFrame)
        expect(r.pressed !== null && r.pressed <= 120, `${look} ${from} -> ${to}: the tab answers the finger within 120ms`, r.pressed)
        await p.__ctx.close()
      }
    }
  }
} finally {
  await browser.close()
  stopAll()
}
console.log(broken ? `\n${broken} check(s) failed` : REPORT_ONLY ? "\nreported" : "\nall checks passed")
process.exit(broken ? 1 : 0)
