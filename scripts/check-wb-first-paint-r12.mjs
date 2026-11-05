/**
 * ===========================================================================
 *  THE WEBSITE BUILDER EDITOR'S FIRST SECONDS: NEVER A WHITE SCREEN, NEVER A
 *  WHITE CANVAS (round 12)
 * ===========================================================================
 * The owner: "the website builder editor must never blank or flash white".
 *
 * A production build (`next start`) of this checkout, signed in through the
 * Supabase stub (scripts/supabase-stub-server.mjs), opened at
 * /website-builder/editor/<id> in headless Chromium, and EVERY frame the
 * browser paints from the navigation's start (a screencast started on
 * about:blank) for SECONDS, read two ways:
 *
 *   WHITE SCREEN   99.5% of the whole viewport white (all channels 246+),
 *                  from the moment the navigation commits
 *   WHITE CANVAS   99.5% of the canvas area white, from the first frame the
 *                  editor's shell is on screen
 *
 * Build it pointed at the stub first:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54392 NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder \
 *     SUPABASE_SERVICE_ROLE_KEY=placeholder STRIPE_SECRET_KEY=sk_test_placeholder \
 *     RESEND_API_KEY=re_placeholder pnpm build
 *   node scripts/check-wb-first-paint-r12.mjs
 *
 *   NEXT_DIR=<dir>   a build kept elsewhere (moved to .next for the run, and back)
 *   VIEW=desktop|phone   SHOTS=<dir>   BUDGET=0   RUNS=3
 *
 * Round 12, the build before and after, 3 loads each, 1440x900 and 390x844:
 *
 *                        white screen frames   white canvas frames
 *   desktop 1440x900 before   0, 0, 1            45, 44, 40
 *                     after    0, 0, 0            0, 0, 0
 *   phone 390x844, 4x before   1, 1, 1            0, 0, 0
 *                     after    0, 0, 0            0, 0, 0
 *
 * Before, the frame after the commit was the document's default white (the
 * browser paints before the stylesheet is in), and the canvas was a blank
 * white card for the loader's first half second. After, the document's
 * ground is the editor's surround and the first paint waits for its frame
 * (app/(storelib)/layout.tsx, components/website-builder/editor-frame.tsx), and the
 * loader draws the outline of a page from its first frame. Round 16: no
 * outline (the owner: no skeleton behind the loading animation); the loader
 * itself is there from the first frame, on the editor's light grey card.
 */
import { spawn } from "node:child_process"
import http from "node:http"
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { inflateSync } from "node:zlib"
import puppeteer from "puppeteer-core"
import { serveSupabaseStub } from "./supabase-stub-server.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const PORT = Number(process.env.PORT || 3993)
const SUPA_PORT = 54392
const SECONDS = Number(process.env.SECONDS ?? 6)
const RUNS = Number(process.env.RUNS ?? 3)
const BUDGET = process.env.BUDGET !== "0"
const SHOTS = process.env.SHOTS ?? ""
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : BUDGET ? "FAIL" : "note"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok && BUDGET) broken++
}

/* A build kept elsewhere is moved in for the run and back after it. */
let moved = false
if (process.env.NEXT_DIR) {
  if (existsSync(join(root, ".next"))) throw new Error("move .next aside first")
  renameSync(process.env.NEXT_DIR, join(root, ".next"))
  moved = true
}
const putBack = () => { if (moved) { moved = false; renameSync(join(root, ".next"), process.env.NEXT_DIR) } }

const U = "11111111-1111-4111-8111-1111111111bb"
const C = "22222222-2222-4222-8222-2222222222bb"
const I = "44444444-4444-4444-8444-4444444444bb"
const at = "2026-08-01T10:00:00.000Z"
const user = { id: U, aud: "authenticated", role: "authenticated", email: "lena@example.com", email_confirmed_at: at, app_metadata: { provider: "email" }, user_metadata: { full_name: "Lena" }, created_at: at, updated_at: at }
const sections = ["header", "hero_centered", "features_grid", "text_image", "faq_accordion", "footer"].map((type, i) => ({ id: `${type}-${i}`, type, name: type, settings: {}, blocks: [] }))
const stub = await serveSupabaseStub({
  port: SUPA_PORT,
  user,
  tables: {
    profiles: [{ id: U, username: "lena", display_name: "Lena", email_verified: true, is_creator: true, welcome_completed: true, onboarding_completed: true, created_at: at }],
    creators: [{ id: C, user_id: U, slug: "lena", username: "lena", name: "Lena", display_name: "Lena", onboarding_completed: true, store_published: true, banned_at: null, subscription_plan_id: "free", created_at: at }],
    store_theme_installs: [{ id: I, creator_id: C, theme_id: "default", name: "Lena's site", status: "draft", is_custom: false, sort_order: 0, created_at: at, updated_at: at, settings: { id: "s1", install_id: I, settings: {}, draft_settings: null }, pages: [{ id: "p1", install_id: I, page_key: "home", sections, draft_sections: null }] }],
    store_theme_settings: [{ id: "s1", install_id: I, settings: {}, draft_settings: null, created_at: at, updated_at: at }],
    store_theme_pages: [{ id: "p1", install_id: I, page_key: "home", sections, draft_sections: null, created_at: at, updated_at: at }],
  },
})

const env = {
  ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPA_PORT}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder", SUPABASE_SERVICE_ROLE_KEY: "placeholder",
  STRIPE_SECRET_KEY: "sk_test_placeholder", RESEND_API_KEY: "re_placeholder",
}
delete env.HTTPS_PROXY
delete env.https_proxy
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] })
let serverLog = ""
next.stdout.on("data", (d) => { serverLog += d })
next.stderr.on("data", (d) => { serverLog += d })
const stop = () => { try { next.kill() } catch {} ; stub.server.close(); putBack() }
process.on("exit", stop)
process.on("SIGINT", () => process.exit(130))
let up = false
for (let i = 0; i < 240 && !up; i++) {
  try { up = (await fetch(`http://127.0.0.1:${PORT}/robots.txt`)).status < 500 } catch { await sleep(250) }
}
if (!up) { console.error(`next start did not come up\n${serverLog.slice(-3000)}`); process.exit(1) }

/* Every request for storelib.com, answered by the build with that Host and the signed in cookie. */
const cookie = stub.sessionCookie()
const jar = new Map([[cookie.name, cookie.value], ["sl_cookie_consent", "1"]])
function ask(u, method, headers, body) {
  return new Promise((resolve, reject) => {
    const h = { ...headers, host: u.host, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") }
    delete h["accept-encoding"]
    const req = http.request({ hostname: "127.0.0.1", port: PORT, path: `${u.pathname}${u.search}`, method, headers: h }, (res) => {
      const chunks = []
      res.on("data", (c) => chunks.push(c))
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.on("error", reject)
    if (body) req.write(body)
    req.end()
  })
}
async function route(r) {
  let u
  try { u = new URL(r.url()) } catch { return r.abort() }
  if (u.protocol === "data:" || u.protocol === "blob:" || u.protocol === "about:") return r.continue()
  if (u.host === `127.0.0.1:${SUPA_PORT}`) return r.continue()
  if (u.host !== "storelib.com") return r.abort()
  try {
    const res = await ask(u, r.method(), r.headers(), r.postData())
    const headers = {}
    for (const [k, v] of Object.entries(res.headers)) {
      if (["content-length", "transfer-encoding", "connection", "content-encoding"].includes(k)) continue
      headers[k] = Array.isArray(v) ? v : String(v)
    }
    return await r.respond({ status: res.status, headers, body: res.body })
  } catch (e) { if (process.env.DEBUG) console.log("   route failed", u.pathname, String(e).slice(0, 200)); return r.abort().catch(() => {}) }
}

function decodePng(buf) {
  let o = 8, w = 0, h = 0, type = 0
  const idat = []
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), kind = buf.toString("ascii", o + 4, o + 8)
    if (kind === "IHDR") { w = buf.readUInt32BE(o + 8); h = buf.readUInt32BE(o + 12); type = buf[o + 17] }
    else if (kind === "IDAT") idat.push(buf.subarray(o + 8, o + 8 + len))
    o += 12 + len
  }
  const bpp = type === 6 ? 4 : 3, raw = inflateSync(Buffer.concat(idat)), out = Buffer.alloc(w * h * 4), stride = w * bpp
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)))
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0
      if (f === 1) line[x] = (line[x] + a) & 255
      else if (f === 2) line[x] = (line[x] + b) & 255
      else if (f === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255 }
    }
    for (let x = 0; x < w; x++) { out[(y * w + x) * 4] = line[x * bpp]; out[(y * w + x) * 4 + 1] = line[x * bpp + 1]; out[(y * w + x) * 4 + 2] = line[x * bpp + 2] }
    prev = line
  }
  return { w, h, data: out }
}
const whiteShare = (png, x0, y0, x1, y1) => {
  let white = 0, all = 0
  for (let y = Math.max(0, y0); y < Math.min(png.h, y1); y++) for (let x = Math.max(0, x0); x < Math.min(png.w, x1); x++) {
    const i = (y * png.w + x) * 4
    all++
    if (png.data[i] >= 246 && png.data[i + 1] >= 246 && png.data[i + 2] >= 246) white++
  }
  return all ? white / all : 0
}

const browser = await puppeteer.launch({ protocolTimeout: 60000, executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
const VIEWS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}
const report = {}
try {
  for (const view of (process.env.VIEW ? [process.env.VIEW] : ["desktop", "phone"])) {
    report[view] = []
    console.log(`\n${view}`)
    for (let run = 0; run < RUNS; run++) {
      const p = await browser.newPage()
      await p.setViewport(VIEWS[view])
      await p.setRequestInterception(true)
      p.on("request", (r) => { route(r).catch(() => {}) })
      const cdp = await p.createCDPSession()
      if (view === "phone") await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      await p.goto("about:blank")
      const frames = []
      const t0 = Date.now()
      cdp.on("Page.screencastFrame", (f) => { frames.push({ data: f.data, at: Date.now() - t0 }); cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}) })
      /* The page committed: frames before it are about:blank's, not the editor's. */
      let committed = null
      p.on("framenavigated", (fr) => { if (fr === p.mainFrame() && fr.url().includes("storelib.com") && committed === null) committed = Date.now() - t0 })
      await cdp.send("Page.startScreencast", { format: "png", maxWidth: 480, maxHeight: 480, everyNthFrame: 1 })
      await p.goto(`https://storelib.com/website-builder/editor/${I}`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => console.log("   goto:", String(e).slice(0, 120)))
      await sleep(SECONDS * 1000)
      await cdp.send("Page.stopScreencast").catch(() => {})
      const canvas = await p.evaluate(() => { const el = document.getElementById("wb-preview-root"); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } })
      const shell = await p.evaluate(() => ({ frame: !!document.querySelector("[data-wb-frame]"), sections: document.querySelectorAll("#wb-preview-root [data-section-box]").length, url: location.pathname }))
      let whiteScreen = 0, whiteCanvas = 0, firstShell = null
      const vw = VIEWS[view].width, vh = VIEWS[view].height
      for (const [k, f] of frames.entries()) {
        if (committed === null || f.at < committed) continue
        /* ALL_SHOTS=1: every frame after the commit, by its time, to read the opening frame by frame. */
        if (SHOTS && process.env.ALL_SHOTS) writeFileSync(join(SHOTS, `${view}-${run}-at-${String(f.at).padStart(5, "0")}.png`), Buffer.from(f.data, "base64"))
        const png = decodePng(Buffer.from(f.data, "base64"))
        const sx = png.w / vw, sy = png.h / vh
        /* The shell is on screen once the bar's dark is at the top. */
        const top = png.data[(Math.floor(10 * sy) * png.w + Math.floor(png.w / 2)) * 4]
        const isShell = top < 60
        if (isShell && firstShell === null) { firstShell = k; if (SHOTS) writeFileSync(join(SHOTS, `${view}-${run}-first-shell.png`), Buffer.from(f.data, "base64")) }
        if (SHOTS && k === frames.findIndex((x) => x.at >= committed)) writeFileSync(join(SHOTS, `${view}-${run}-first-after-commit.png`), Buffer.from(f.data, "base64"))
        if (whiteShare(png, 0, 0, png.w, png.h) >= 0.995) { whiteScreen++; if (SHOTS) writeFileSync(join(SHOTS, `${view}-${run}-white-screen-${k}.png`), Buffer.from(f.data, "base64")) }
        else if (canvas && isShell && whiteShare(png, Math.floor((canvas.x + 2) * sx), Math.floor((canvas.y + 2) * sy), Math.floor((canvas.x + canvas.w - 2) * sx), Math.floor((Math.min(vh, canvas.y + canvas.h) - 2) * sy)) >= 0.995) {
          whiteCanvas++
          if (SHOTS) writeFileSync(join(SHOTS, `${view}-${run}-white-canvas-${k}.png`), Buffer.from(f.data, "base64"))
        }
      }
      const r = { frames: frames.length, whiteScreen, whiteCanvas, firstShellAt: firstShell === null ? null : frames[firstShell].at, shell }
      report[view].push(r)
      console.log(`  load ${run + 1}: ${frames.length} frames; white screen ${whiteScreen}, white canvas ${whiteCanvas}; the shell from ${r.firstShellAt}ms; ${JSON.stringify(shell)}`)
      if (SHOTS) await p.screenshot({ path: join(SHOTS, `${view}-${run}-end.png`) })
      await p.close()
    }
    const ws = report[view].reduce((a, r) => a + r.whiteScreen, 0), wc = report[view].reduce((a, r) => a + r.whiteCanvas, 0)
    expect(report[view].every((r) => r.shell.frame && r.shell.url.startsWith("/website-builder/editor/")), `${view}: the editor opened (not sent to sign in)`)
    expect(ws === 0, `${view}: no white screen frame from the navigation's start`, ws)
    expect(wc === 0, `${view}: no white canvas frame once the editor's shell is up`, wc)
  }
} finally {
  await browser.close()
}
if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(report, null, 2))
console.log(broken ? `\n${broken} failed\n` : "\nall good\n")
stop()
process.exit(broken ? 1 : 0)
