/**
 * ===========================================================================
 *  ROUND 27 (E27, I5), FILMED IN THE REAL APP: THE COMMUNITY'S HEADER BETWEEN THE FEED AND LEARN
 * ===========================================================================
 * The owner: "switching between the community and Learn, the header glitches, flashes and bumps". The round 31
 * harness (scripts/check-transitions-round31.mjs: the stand in database, next start or `next dev`, the same open and
 * film) drives /community/club-1, presses Learn and Community on the row of places (the feed at its top and scrolled
 * down), and on every animation frame reads the bar: its box, its colour, the element painted at points across it
 * (anything of the place drawn over the bar is a glitch), the copy of the place going out, the window's scroll. Every
 * painted frame is filmed; a sheet of the bar's strip is written per hop.
 *
 *   DEV=1 PORT=3967 STUB_PORT=54467 node scripts/check-community-header27.mjs tabs
 *   VIEWS=desk,phone LOOKS=light,dark SHOTS_DIR=dir FFMPEG=path
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
/* A 1440 window at 150% zoom: 960 of CSS, a mouse, no touch. */
const ZOOM = { name: "zoom150", vp: { width: 960, height: 600, deviceScaleFactor: 1 } }
const VIEWS = (process.env.VIEWS || "phone,desk,app").split(",").map((n) => ({ phone: PHONE, desk: DESK, app: APPV, zoom150: ZOOM })[n]).filter(Boolean)

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
    const args = DEV ? ["dev", process.env.WEBPACK ? "--webpack" : "--turbopack", "-p", String(PORT), "-H", "127.0.0.1"] : ["start", "-p", String(PORT), "-H", "127.0.0.1"]
    next = spawn(process.execPath, ["node_modules/next/dist/bin/next", ...args], { cwd: ROOT, env: { ...env, ...(DEV ? { PROBE_LINKED_BUILD: "1" } : {}) }, stdio: ["ignore", "pipe", "pipe"] })
    let out = ""
    next.stdout.on("data", (d) => { out += d })
    next.stderr.on("data", (d) => { out += d })
    let up = false
    for (let i = 0; i < 120 && !up; i++) {
      await sleep(500)
      up = await fetch(`${BASE}/robots.txt`).then((r) => r.status > 0).catch(() => false)
    }
    if (!up) { console.error(`next start did not come up\n${out.slice(-2000)}`); process.exit(1) }
  }
  /* Every page each hop goes to, asked for once, so a development server has compiled it before anything is filmed. */
  const cookie = `${session.name}=${session.value}; storelib_consent=2.p1.a0.m0.${Math.floor(Date.now() / 1000)}`
  const warm = ["/explore", "/explore?type=communities", "/account", "/community/club-1", ...(want("tabs") ? ["/community/club-1/learn", "/community/club-1/about"] : []), ...(want("speed") ? ["/account/library"] : []), ...(want("app") ? ["/app"] : [])]
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


const FFMPEG = process.env.FFMPEG || ""
/*
  SCROLLBARS=1: the classic scrollbars of a computer with a mouse (Puppeteer hides them by default), so a page that gains
  or loses its scrollbar between two places shows as the bar's contents moving sideways.
*/
const SCROLLBARS = process.env.SCROLLBARS === "1"
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", ...(SCROLLBARS ? [] : ["--hide-scrollbars"])], ...(SCROLLBARS ? { ignoreDefaultArgs: ["--hide-scrollbars"] } : {}), protocolTimeout: LONG })
try {
  if (want("tabs")) {
    for (const look of LOOKS) {
      for (const view of VIEWS) {
        for (const start of ["top", "scrolled"]) {
          const label = `${look} ${view.name} ${start}`
          console.log(`\nHEADER: the feed and Learn, ${label}`)
          const p = await open(browser, view, "/community/club-1", { look, waitFor: "[data-community-shell]" })
          await sleep(2500)
          /* A feed with posts is taller than the window (the stand in community has none): the feed's place made long. */
          if (process.env.LONG_FEED === "1") await p.evaluate(() => { const f = document.querySelector("[data-community-feed]"); const d = document.createElement("div"); d.style.height = "2400px"; d.setAttribute("data-probe-long", ""); f?.append(d) })
          if (start === "scrolled") {
            await p.evaluate(() => window.scrollTo(0, Math.min(700, document.documentElement.scrollHeight - innerHeight)))
            await sleep(600)
          }
          for (const to of ["learn", "home"]) {
            const href = to === "learn" ? "/community/club-1/learn" : "/community/club-1"
            const at = await centerNow(p, `[data-community-tabs] a[href="${href}"]`)
            if (!at) { expect(false, `${label}: the ${to} tab is on screen`); continue }
            /* What is stuck in the window before the tap (the feed's chips under the bar, when it is scrolled): where it stands. */
            const stuck0 = await p.evaluate(() => [...document.querySelectorAll("[data-community-main] [class*='sticky']")].filter((e) => getComputedStyle(e).position === "sticky" && e.getClientRects().length && e.getBoundingClientRect().bottom > 0).map((e) => Math.round(e.getBoundingClientRect().top)))
            await watchFrames(p, `
              const bar = document.querySelector("[data-community-shell] header")
              const r = bar.getBoundingClientRect()
              const cs = getComputedStyle(bar)
              const xs = [0.08, 0.3, 0.5, 0.7, 0.92].map((f) => Math.round(innerWidth * f))
              const ys = [r.top + 6, r.top + r.height / 2, r.bottom - 4]
              const over = []
              for (const y of ys) for (const x of xs) { const e = document.elementFromPoint(x, y); if (e && !bar.contains(e)) over.push((e.getAttribute("data-place-still") !== null ? "still" : e.tagName) + "@" + Math.round(y)) }
              const still = document.querySelector("div[data-place-still]")
              const sr = still ? still.getBoundingClientRect() : null
              const tabs = document.querySelector("[data-community-tabs]")
              const on = tabs ? [...tabs.querySelectorAll("a[aria-current='page'], a[data-on]")].map((a) => a.getAttribute("href")).join() : ""
              const pins = still ? [...still.querySelectorAll("[data-still-pin]")].map((e) => Math.round(e.getBoundingClientRect().top)) : []
              const btns = [...bar.querySelectorAll("a, button")].filter((b) => b.getClientRects().length)
              const right = btns.length ? Math.round(Math.max(...btns.map((b) => b.getBoundingClientRect().right))) : null
              return { pins, vw: Math.round(document.body.getBoundingClientRect().width), right, top: Math.round(r.top * 10) / 10, h: Math.round(r.height * 10) / 10, bg: cs.backgroundColor, shadow: cs.boxShadow, op: +cs.opacity, tr: cs.transform, over: [...new Set(over)], still: sr ? { top: Math.round(sr.top), h: Math.round(sr.height), o: +(+getComputedStyle(still).opacity).toFixed(2) } : null, sy: Math.round(scrollY), tabsLeft: tabs ? Math.round(tabs.scrollLeft) : null, on }
            `, 1600)
            const frames = await film(p, () => press(p, view, at), { until: `location.pathname === "${href}"`, settle: 1000 }).catch(() => [])
            const log = await p.evaluate(() => window.__log || [])
            const tops = [...new Set(log.map((f) => f.x?.top))]
            const hs = [...new Set(log.map((f) => f.x?.h))]
            const bgs = [...new Set(log.map((f) => f.x?.bg))]
            const shadows = [...new Set(log.map((f) => f.x?.shadow))]
            const overs = log.filter((f) => f.x?.over?.length).map((f) => `${f.t}ms ${f.x.over.join(" ")}`)
            const stills = log.filter((f) => f.x?.still).map((f) => `${f.t}:${f.x.still.top}/${f.x.still.o}`)
            const sy = [...new Set(log.map((f) => f.x?.sy))]
            const tl = [...new Set(log.map((f) => f.x?.tabsLeft))]
            console.log(`    to ${to}: bar top ${tops.join(",")} height ${hs.join(",")}; ground ${bgs.join(" ")}; shadow ${shadows.length}; scroll ${sy.slice(0, 6).join(",")}; row scroll ${tl.join(",")}; the copy going out ${stills.slice(0, 6).join(" ")}`)
            if (overs.length) console.log(`    drawn over the bar: ${overs.slice(0, 8).join(" | ")}`)
            expect(tops.length === 1 && hs.length === 1, `${label} to ${to}: the bar never moves or changes height`, { tops, hs })
            expect(bgs.length === 1 && shadows.length === 1, `${label} to ${to}: the bar's ground and edge never change`, { bgs, shadows: shadows.length })
            expect(overs.length === 0, `${label} to ${to}: nothing of a place is ever drawn over the bar`, overs.slice(0, 4))
            const vws = [...new Set(log.map((f) => f.x?.vw))]
            const rights = [...new Set(log.map((f) => f.x?.right))]
            console.log(`    the page's width ${vws.join(",")}; the bar's last control ends at ${rights.join(",")}`)
            expect(vws.length === 1 && rights.length === 1, `${label} to ${to}: the page keeps its width and the bar's controls never move sideways`, { vws, rights })
            const pinTops = [...new Set(log.flatMap((f) => f.x?.pins ?? []))]
            console.log(`    stuck before the tap at ${stuck0.join(",") || "-"}; in the copy going out at ${pinTops.join(",") || "-"}`)
            expect(pinTops.every((t) => stuck0.some((s) => Math.abs(s - t) <= 1)) && (stuck0.length === 0 || to === "home" || pinTops.length > 0 || stills.length === 0), `${label} to ${to}: what was stuck under the bar stays exactly there while the place goes out`, { stuck0, pinTops })
            if (shots) {
              const dir = join(shots, `header-${look}-${view.name}-${start}-${to}`)
              mkdirSync(dir, { recursive: true })
              frames.forEach((f, i) => writeFileSync(join(dir, `f${String(i).padStart(3, "0")}.png`), Buffer.from(f.data, "base64")))
              if (FFMPEG && frames.length) {
                const n = frames.length
                const pick = Math.min(16, n)
                const step = Math.max(1, Math.floor(n / pick))
                const { execFileSync } = await import("node:child_process")
                const sel = frames.map((_, i) => i).filter((i) => i % step === 0).slice(0, pick)
                sel.forEach((i, k) => writeFileSync(join(dir, `s${String(k).padStart(3, "0")}.png`), Buffer.from(frames[i].data, "base64")))
                const strip = view.name === "phone" ? "crop=390:330:0:0" : "crop=iw:300:0:0,scale=960:-1"
                execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-framerate", "1", "-i", join(dir, "s%03d.png"), "-vf", `${strip},tile=${view.name === "phone" ? "4x4" : "2x8"}:padding=4:color=red`, "-frames:v", "1", join(shots, `sheet-header-${look}-${view.name}-${start}-${to}.png`)])
              }
            }
            await sleep(600)
          }
          expect(p.__errors.length === 0, `${label}: no page errors`, p.__errors)
          await p.__ctx.close()
        }
      }
    }
  }
} finally {
  await browser.close()
  stopAll()
}
console.log(broken ? `\n${broken} FAILED` : "\nall ok")
process.exit(broken ? 1 : 0)
