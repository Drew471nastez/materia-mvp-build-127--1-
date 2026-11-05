/**
 * ===========================================================================
 *  OPENING THE ONEPAGE EDITOR, EVERY WAY IN
 * ===========================================================================
 * "Opening the OnePage editor from the app sometimes blocks and doesn't take
 * me there."
 *
 * The same real Next app scripts/check-onepage-leave.mjs builds (the real
 * /app shell, the real rail, pill and menu, the real editor; the other pages
 * are stubs, and Home carries its real quick actions), driven every way a
 * creator opens the editor:
 *
 *   RAIL       the rail's OnePage row, from Home, Products and Website, five
 *              times in and out
 *   HOME       Home's OnePage card
 *   PHONE      the menu's OnePage row at 390, in the browser and as the
 *              native app (router), in and out through the editor's arrow
 *   FAST       a double press, and a press on OnePage then on Products at once
 *   HISTORY    Back out of the editor and Forward into it again
 *   DEPLOY     a new build lands while Home is open, then the rail's row
 *   SLOW       the editor's server takes 3s
 *   HUNG       the editor's server never answers the first request for it
 *              (the prefetch under the pointer, or the press): the shell's
 *              cap loads the editor as a document, never the page before
 *
 * Every way must land on the first press: the editor drawn, no bar, no
 * spinner, no loader left. And what the eye sees on the way in is recorded
 * frame by frame (FILM): the page you were on, the shell's spinner, the
 * cold start's black frame, the editor's loader, the editor.
 *
 *   node scripts/check-onepage-open.mjs
 *   SHOTS=/some/dir node scripts/check-onepage-open.mjs
 *   KEEP=1 keeps the built app (its folder is printed)
 */
import { spawn } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
if (!existsSync(join(root, "node_modules/next/package.json"))) fail("No node_modules here (pnpm install, or link the main checkout's).")
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got !== "" ? `   ${typeof got === "string" ? got : JSON.stringify(got)}` : ""}`)
  if (!ok) broken++
}
const numbers = {}

/* ------------------------------------------------------------------------ */
/*  The app                                                                 */
/* ------------------------------------------------------------------------ */

const app = mkdtempSync(join(tmpdir(), "onepage-open-"))
const put = (path, text) => {
  mkdirSync(dirname(join(app, path)), { recursive: true })
  writeFileSync(join(app, path), text)
}
symlinkSync(realpathSync(join(root, "node_modules")), join(app, "node_modules"))

put("package.json", `{ "name": "onepage-open-probe", "private": true }\n`)
put("next.config.mjs", `import { fileURLToPath } from "node:url"
const here = (p) => fileURLToPath(new URL(p, import.meta.url))
export default {
  reactStrictMode: false,
  generateBuildId: async () => "build-a",
  typescript: { ignoreBuildErrors: true },
  experimental: { externalDir: true },
  webpack: (config) => {
    config.resolve.alias = { ...(config.resolve.alias || {}), "@/lib/supabase/client$": here("./stubs/supabase-client.ts"), "@": ${JSON.stringify(root)} }
    return config
  },
}
`)
put("tsconfig.json", JSON.stringify({
  compilerOptions: { lib: ["dom", "dom.iterable", "esnext"], allowJs: true, target: "ES2017", skipLibCheck: true, strict: false, noEmit: true, esModuleInterop: true, module: "esnext", moduleResolution: "bundler", resolveJsonModule: true, isolatedModules: true, jsx: "react-jsx", baseUrl: ".", paths: { "@/*": [`${root}/*`] }, plugins: [{ name: "next" }] },
  include: ["**/*.ts", "**/*.tsx"],
  exclude: ["node_modules"],
}, null, 2))
/* The repo's own instrumentation file, the router's start and the Back hold included. */
put("instrumentation-client.ts", `export { onRouterTransitionStart } from "@/instrumentation-client"\n`)

/* The app's stylesheet, and Inter when a build of the repo has it. */
let fonts = interFaces(root)
mkdirSync(join(app, "public/fonts"), { recursive: true })
fonts = fonts.replace(/url\(file:\/\/([^)]*)\/([^/)]+)\)/g, (_, dir, file) => {
  try { copyFileSync(join(dir, file), join(app, "public/fonts", file)) } catch { /* the fallback font, then */ }
  return `url(/fonts/${file})`
})
put("public/app.css", `${fonts}\n${await appCss(root)}\nhtml,body{font-family:Inter,system-ui,sans-serif}`)

put("app/(storelib)/layout.tsx", `import type React from "react"
import { StuckLayerGuard } from "@/components/platform/stuck-layer-guard"
import { BodyScrollRestorer } from "@/components/body-scroll-restorer"
import { AppHistoryTracker } from "@/components/platform/app-history-tracker"
import { PrefetchLinks } from "@/components/shared/prefetch-links"
import { ViewportVars } from "@/components/viewport-vars"
import { CapacitorBounceGuard } from "@/components/platform/capacitor-bounce-guard"
import { KeyboardGuard } from "@/components/platform/keyboard-guard"
import { RotationGuard } from "@/components/platform/rotation-guard"
import { LocaleProvider } from "@/components/locale-provider"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light" style={{ colorScheme: "light" }} suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="stylesheet" href="/app.css" />
      </head>
      <body className="font-sans antialiased bg-background text-foreground">
        <LocaleProvider>{children}</LocaleProvider>
        <PrefetchLinks />
        <BodyScrollRestorer />
        <ViewportVars />
        <CapacitorBounceGuard />
        <StuckLayerGuard />
        <KeyboardGuard />
        <RotationGuard />
        <AppHistoryTracker />
      </body>
    </html>
  )
}
`)
put("app/(storelib)/app/layout.tsx", `import type React from "react"
import { Shell } from "./shell"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>
}
`)
/* app/(storelib)/app/layout.tsx as it ships, the server's reads left out: the real wrapper and the real sidebar around the page. */
put("app/(storelib)/app/shell.tsx", `"use client"
import type React from "react"
import { AppLayoutWrapper } from "@/components/app/app-layout-wrapper"
import { AppSidebar } from "@/components/app/sidebar"

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AppLayoutWrapper>
      <div className="h-svh overflow-hidden bg-[#111111] md:bg-[#131316] app-no-scrollbar">
        <AppSidebar
          creatorSlug="probe"
          username="probe"
          storePublished
          displayName="Probe"
          stripeConnected={false}
          stripeStatus="not_connected"
          onePagePublished
          setupProgress={{ completed: 3, total: 7 }}
          businesses={[]}
        />
        <main className="h-svh pt-[calc(68px_+_env(safe-area-inset-top,_0px))] md:pt-[calc(58px+env(safe-area-inset-top,_0px))] md:pl-[240px] bg-[#f8f9fa] md:bg-white rounded-t-[20px] md:rounded-none overflow-hidden app-main-content">
          <div className="h-[calc(100svh_-_68px_-_env(safe-area-inset-top,_0px))] md:h-[calc(100svh-58px-env(safe-area-inset-top,_0px))] overflow-y-auto app-content-scroll">
            {children}
          </div>
        </main>
      </div>
    </AppLayoutWrapper>
  )
}
`)
/* A server that takes a moment, as the real one does. */
const stub = (name) => `export const dynamic = "force-dynamic"

export default async function Page() {
  await new Promise((r) => setTimeout(r, Number(process.env.PAGE_DELAY_MS ?? 250)))
  return <div data-page="${name}" className="p-8 text-[24px] font-bold text-[#1a1a2e]">${name}</div>
}
`
/* Home, with its real quick actions: one of them is the OnePage card. */
put("app/(storelib)/app/page.tsx", `import { QuickActions } from "@/components/app/home/quick-actions"

export const dynamic = "force-dynamic"

export default async function Page() {
  await new Promise((r) => setTimeout(r, Number(process.env.PAGE_DELAY_MS ?? 250)))
  return <div data-page="dashboard" className="p-8"><div className="text-[24px] font-bold text-[#1a1a2e]">dashboard</div><QuickActions /></div>
}
`)
put("app/(storelib)/app/products/page.tsx", stub("products"))
put("app/(storelib)/app/website-builder/page.tsx", stub("website"))
put("app/(storelib)/app/[...rest]/page.tsx", stub("other"))
put("app/(storelib)/creator-page/page.tsx", stub("creator-page"))
put("app/(storelib)/app/onepage/page.tsx", `import { existsSync, unlinkSync } from "node:fs"
import { OnePageEditor } from "@/components/onepage/onepage-editor"

export const dynamic = "force-dynamic"

const theme = {
  template_id: "default", background_type: "solid", background_color: "#ffffff", background_gradient: null, background_image_url: null,
  text_color: "#000000", secondary_text_color: "#000000", button_style: "filled", button_color: "#000000", button_text_color: "#ffffff",
  button_border_radius: 8, button_border_width: 0, button_border_color: "#000000", button_hover_color: "#333333",
  font_family: "'Inter', sans-serif", title_font: "'Inter', sans-serif", title_color: "#000000", card_width: "standard", spacing: "normal",
  gradient_direction: 135, gradient_animated: false, gradient_noise: false, image_brightness: 100, image_blur: 0, image_noise: false,
  header_layout: "classic", social_icon_color: "#000000",
}
const blocks = [
  { id: "b_header", type: "header", enabled: true, data: { show_avatar: true, show_name: true, show_bio: true }, sort_order: 0 },
  { id: "b_link1", type: "link_button", enabled: true, data: { label: "My Link", url: "https://example.com", icon: null, thumbnail_url: null }, sort_order: 1 },
]
const FIXTURE = {
  id: "op_probe", owner_id: "user_probe", creator_id: "creator_probe", slug: "probe", title: "Probe Page", bio: "",
  avatar_url: null, avatar_video_url: null, theme,
  settings: {
    show_branding: true, seo_title: null, seo_description: null, social_image_url: null, custom_domain: null, analytics_enabled: true,
    subscribe_enabled: true, subscribe_style: "white", share_enabled: true, share_style: "white", verified_badge_enabled: false, verified_badge_type: "verified_creator",
  },
  social_links: {}, draft_blocks: blocks, published_blocks: blocks, published_theme: theme,
  published_profile: { title: "Probe Page", bio: "", avatar_url: null, avatar_video_url: null, avatar_video_crop: null },
  published_social_links: {}, status: "published", published_at: "2026-09-01T00:00:00.000Z",
  created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z", onboarding_completed: true,
}

export default async function Page() {
  /* HUNG: the first request after the probe drops this file never gets an answer, as a lost request never does. */
  const hang = process.env.ONEPAGE_HANG_FILE
  if (hang && existsSync(hang)) {
    unlinkSync(hang)
    await new Promise(() => {})
  }
  /* The editor's own server time, apart from the other pages': a slow one is what a creator with a big page waits for. */
  await new Promise((r) => setTimeout(r, Number(process.env.ONEPAGE_DELAY_MS ?? process.env.PAGE_DELAY_MS ?? 250)))
  return <OnePageEditor initialOnePage={FIXTURE as never} />
}
`)
/* The editor preview's frame, the repo's own route (components/onepage/live-preview). */
put("app/(storelib)/onepage-preview/page.tsx", `export { default, metadata } from "@/app/(storelib)/onepage-preview/page"\n`)
/* What the editor and the shell ask the server, answered. The saves are counted. */
put("app/api/onepage/route.ts", `export async function PUT() {
  await new Promise((r) => setTimeout(r, 120))
  return Response.json({ ok: true })
}
export async function GET() {
  return Response.json({})
}
`)
put("app/api/onepage/publish/route.ts", `export async function POST() {
  await new Promise((r) => setTimeout(r, 120))
  return Response.json({ published_at: new Date().toISOString() })
}
`)
put("app/api/purchases/claim/route.ts", `export async function POST() {\n  return Response.json({ claimed: 0 })\n}\n`)
put("app/api/domains/route.ts", `export async function GET() {\n  return Response.json({ domains: [] })\n}\n`)
put("app/api/billing/subscription/route.ts", `export async function GET() {\n  return Response.json({ currentPlan: { id: "free" } })\n}\n`)
/* The browser's Supabase client, as far as the editor asks it anything: the onboarding is done. */
put("stubs/supabase-client.ts", `type Q = Record<string, unknown>
function query(): Q {
  const q: Q = {}
  for (const k of ["select", "eq", "in", "order", "limit", "update", "upsert", "insert", "delete", "match", "neq", "is"]) q[k] = () => q
  q.single = async () => ({ data: { onboarding_completed: true }, error: null })
  q.maybeSingle = async () => ({ data: { onboarding_completed: true }, error: null })
  q.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r)
  return q
}
const client = {
  from: () => query(),
  rpc: () => query(),
  auth: {
    getUser: async () => ({ data: { user: { id: "user_probe" } }, error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
  channel: () => ({ on() { return this }, subscribe() { return this } }),
  removeChannel: () => {},
}
export function createClient() {
  return client as never
}
export function isNativePlatform() {
  /* The native app, when the probe says so (the bridge it puts on the window, as Capacitor does). */
  return typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.()
}
`)

const run = (args, env = {}) => new Promise((resolve) => {
  const child = spawn(process.execPath, [join(app, "node_modules/next/dist/bin/next"), ...args], { cwd: app, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...env }, stdio: ["ignore", "pipe", "pipe"] })
  let out = ""
  child.stdout.on("data", (d) => { out += d })
  child.stderr.on("data", (d) => { out += d })
  child.on("exit", (code) => resolve({ code, out }))
})
const cleanup = () => { if (process.env.KEEP !== "1") rmSync(app, { recursive: true, force: true }) }

console.log(`building the app in ${app} (webpack, a few minutes)`)
const t0 = Date.now()
const built = await run(["build", "--webpack"], { NODE_OPTIONS: "--max-old-space-size=3072" })
if (built.code !== 0) {
  console.error(built.out.split("\n").slice(-40).join("\n"))
  cleanup()
  fail("the app did not build")
}
console.log(`built in ${((Date.now() - t0) / 1000).toFixed(0)}s`)

const freePort = () => new Promise((resolve) => {
  const s = createServer()
  s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)) })
})
const PORT = await freePort()
const base = `http://127.0.0.1:${PORT}`
let server = null
let serverLog = ""
let onepageDelay = "250"
async function start() {
  server = spawn(process.execPath, [join(app, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: app, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", PAGE_DELAY_MS: "250", ONEPAGE_DELAY_MS: onepageDelay, ONEPAGE_HANG_FILE: join(app, "hang-once") }, stdio: ["ignore", "pipe", "pipe"] })
  server.stdout.on("data", (d) => { serverLog += d })
  server.stderr.on("data", (d) => { serverLog += d })
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(`${base}/api/domains`)).ok) return } catch { /* not up yet */ }
    await wait(200)
  }
  throw new Error(`the server did not start\n${serverLog.slice(-2000)}`)
}
async function stop() {
  if (!server) return
  const s = server
  server = null
  s.kill()
  if (s.exitCode === null) await new Promise((r) => s.once("exit", r))
  await wait(200)
}
/* A deploy: the same files served under another build id, which is all the router compares. */
async function deploy(id) {
  await stop()
  writeFileSync(join(app, ".next/BUILD_ID"), id)
  await start()
}

/* ------------------------------------------------------------------------ */
/*  Driving it                                                              */
/* ------------------------------------------------------------------------ */

const DESKTOP = { width: 1280, height: 860, deviceScaleFactor: 1 }
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
let browser = null

/* What is on screen, sampled every frame from the first one of every document (FILM). */
const FILM = () => {
  const w = window
  /* The top document only: the editor's preview is a frame of this origin, and shares this storage. */
  if (w.__filming || w.top !== w) return
  w.__filming = true
  const seen = (el) => {
    if (!el) return false
    let o = 1
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n)
      if (cs.display === "none" || cs.visibility === "hidden") return false
      o *= Number(cs.opacity)
    }
    return o > 0.05 && el.getClientRects().length > 0
  }
  const label = () => {
    const editor = document.querySelector("[data-onepage-editor]")
    /* The loader is up until it is told to leave (its own fade is 320ms after that). */
    if (editor) {
      const loader = document.querySelector("[data-onepage-loader]")
      return loader && loader.getAttribute("data-leaving") !== "true" ? "editor-loader" : "editor"
    }
    if (seen(document.querySelector("[data-app-slow-page]"))) return "spinner"
    if (document.querySelector("[data-app-cold-start]")) return "cold-start"
    const page = document.querySelector("[data-page]")
    if (page) return `page:${page.getAttribute("data-page")}`
    return "blank"
  }
  const film = JSON.parse(sessionStorage.getItem("__film") || "[]")
  const tick = () => {
    const l = label()
    const last = film[film.length - 1]
    if (!last || last.l !== l) film.push({ l, t: Math.round(performance.timeOrigin + performance.now()) })
    try { sessionStorage.setItem("__film", JSON.stringify(film.slice(-80))) } catch {}
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

async function open(viewport = DESKTOP, { native = false } = {}) {
  const page = await browser.newPage()
  await page.setViewport(viewport)
  page.errors = []
  page.warnings = []
  page.on("pageerror", (e) => page.errors.push(String(e).slice(0, 200)))
  page.restarting = false
  page.on("console", (m) => {
    if (m.type() === "warn" || m.type() === "warning") page.warnings.push(m.text().slice(0, 200))
    if (m.type() === "error" && !/Failed to load resource|DialogTitle|Description|OnePageEditor\]|Missing `Description`/.test(m.text()) && !(page.restarting && /Failed to fetch/.test(m.text()))) page.errors.push(m.text().slice(0, 200))
  })
  page.on("dialog", (d) => d.accept())
  if (native) {
    /* The native app, as far as the web layer can tell: the bridge says so, and <html> carries the class. */
    await page.evaluateOnNewDocument(() => {
      window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios", isPluginAvailable: () => false, Plugins: {} }
      const mark = () => document.documentElement?.classList.add("capacitor")
      if (document.documentElement) mark()
      else document.addEventListener("readystatechange", mark, { once: true })
    })
  }
  await page.evaluateOnNewDocument(FILM)
  return page
}

const state = (page) => page.evaluate(() => {
  const loader = document.querySelector("[data-onepage-loader]")
  return {
    path: location.pathname,
    page: document.querySelector("[data-page]")?.getAttribute("data-page") ?? (document.querySelector("[data-onepage-editor]") ? "onepage" : null),
    header: !!document.querySelector("[data-onepage-editor] header"),
    loader: !!loader,
    bar: !!document.querySelector("[data-app-nav-progress]"),
    spinner: !!document.querySelector("[data-app-slow-page]") && Number(getComputedStyle(document.querySelector("[data-app-slow-page]")).opacity) > 0.05,
    leaving: !!document.querySelector("[data-onepage-leaving]"),
  }
})

async function film(page, since) {
  const f = await page.evaluate(() => JSON.parse(sessionStorage.getItem("__film") || "[]")).catch(() => [])
  return f.filter((x) => x.t >= since - 30).map((x) => `${x.l}@${Math.max(0, x.t - since)}`).join(" > ")
}
const clearFilm = (page) => page.evaluate(() => sessionStorage.setItem("__film", "[]")).catch(() => {})

/** How long until the editor is on screen and settled: drawn, its loader gone, no bar, no spinner. */
async function inEditor(page, ms = 9000) {
  const t = Date.now()
  let s = null
  while (Date.now() - t < ms) {
    try {
      s = await state(page)
      if (s.path === "/app/onepage" && s.header && !s.loader && !s.bar && !s.spinner) return { ms: Date.now() - t, ...s }
    } catch {
      /* between documents */
    }
    await wait(30)
  }
  return { ms: null, ...s }
}

async function landed(page, path, ms = 9000) {
  const t = Date.now()
  let s = null
  while (Date.now() - t < ms) {
    try {
      s = await state(page)
      if (s.path === path && s.page && s.page !== "onepage" && !s.bar && !s.spinner) return { ms: Date.now() - t, ...s }
    } catch {
      /* between documents */
    }
    await wait(30)
  }
  return { ms: null, ...s }
}

async function railBox(page, what) {
  return page.evaluate((what) => {
    const a = [...document.querySelectorAll("aside a, aside button")].find((x) => x.getClientRects().length && x.textContent.trim() === what)
    if (!a) return null
    a.scrollIntoView({ block: "nearest" })
    const r = a.getBoundingClientRect()
    return { x: r.x + Math.min(r.width / 2, 60), y: r.y + r.height / 2 }
  }, what)
}

async function press(page, what, { hover = 120, clicks = 1 } = {}) {
  const box = await railBox(page, what)
  if (!box) throw new Error(`no rail row "${what}"`)
  await page.mouse.move(box.x, box.y)
  if (hover) await wait(hover)
  await page.mouse.click(box.x, box.y, { clickCount: clicks })
}

async function goHome(page, path = "/app") {
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" })
  await page.waitForSelector("[data-page]", { timeout: 20000 })
  await wait(600)
}

/** The phone's menu, from the pill, and a row in it. */
async function menuRow(page, label) {
  await page.waitForSelector("button[aria-label='Menu']", { visible: true, timeout: 8000 })
  await page.tap("button[aria-label='Menu']")
  await page.waitForSelector("[data-mobile-menu='open']", { timeout: 3000 })
  await wait(350)
  const box = await page.evaluate((label) => {
    const row = [...document.querySelectorAll("#app-mobile-menu a, #app-mobile-menu button")].find((x) => x.textContent.trim() === label)
    if (!row) return null
    const r = row.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, label)
  if (!box) throw new Error(`no menu row "${label}"`)
  await page.touchscreen.tap(box.x, box.y)
}

const scenario = async (name, fn) => {
  console.log(`\n${name}`)
  let page = null
  try {
    page = await fn()
  } catch (e) {
    expect(false, "it ran", String(e).slice(0, 300))
  }
  if (page) {
    expect(page.errors.length === 0, "no errors", page.errors.slice(0, 3).join(" | "))
    await page.close().catch(() => {})
  }
}

const films = {}
try {
  await start()
  browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })

  await scenario("RAIL: the OnePage row, from three pages, five times in and out", async () => {
    const page = await open()
    await goHome(page)
    const times = []
    for (const [i, from] of [["/app", "Dashboard"], ["/app/products", "Products"], ["/app/website-builder", "Website"], ["/app", "Dashboard"], ["/app/products", "Products"]].map((x, i) => [i, x])) {
      if (i > 0) {
        await press(page, from[1])
        const back = await landed(page, from[0])
        expect(back.ms !== null, `  out again to ${from[1]} (${back.ms}ms)`, back.ms === null ? back : "")
        await wait(500)
      }
      await clearFilm(page)
      const t = Date.now()
      await press(page, "OnePage")
      const l = await inEditor(page)
      times.push(l.ms)
      expect(l.ms !== null, `in from ${from[1]}, first press (${l.ms}ms)`, l.ms === null ? l : "")
      if (i === 0) films.rail = await film(page, t)
    }
    numbers.railMs = times
    return page
  })

  await scenario("HOME: the OnePage card", async () => {
    const page = await open()
    await goHome(page)
    await clearFilm(page)
    const card = await page.$("a[data-quick-action][href='/app/onepage']")
    const r = await card.boundingBox()
    await page.mouse.move(r.x + 40, r.y + r.height / 2)
    await wait(150)
    const t = Date.now()
    await page.mouse.click(r.x + 40, r.y + r.height / 2)
    const l = await inEditor(page)
    expect(l.ms !== null, `the card opens the editor, first press (${l.ms}ms)`, l.ms === null ? l : "")
    films.home = await film(page, t)
    numbers.homeMs = l.ms
    return page
  })

  for (const native of [false, true]) {
    await scenario(`PHONE 390${native ? ", as the native app" : ""}: the menu's OnePage row, in and out three times`, async () => {
      const page = await open(PHONE, { native })
      await goHome(page)
      const times = []
      for (let i = 0; i < 3; i++) {
        await clearFilm(page)
        const t = Date.now()
        await menuRow(page, "OnePage")
        const l = await inEditor(page)
        times.push(l.ms)
        expect(l.ms !== null, `in, first tap (${l.ms}ms)`, l.ms === null ? l : "")
        if (i === 0) films[native ? "phoneNative" : "phone"] = await film(page, t)
        if (SHOTS && i === 0) await page.screenshot({ path: join(SHOTS, `open-phone${native ? "-native" : ""}-390.png`) })
        await page.tap("[data-onepage-exit]")
        const out = await landed(page, "/app", 9000)
        expect(out.ms !== null, `  out by the arrow (${out.ms}ms)`, out.ms === null ? out : "")
        await wait(400)
      }
      numbers[native ? "phoneNativeMs" : "phoneMs"] = times
      return page
    })
  }

  await scenario("FAST: a double press on the row", async () => {
    const page = await open()
    await goHome(page, "/app/products")
    await press(page, "OnePage", { hover: 0, clicks: 2 })
    const l = await inEditor(page)
    expect(l.ms !== null, `it lands (${l.ms}ms)`, l.ms === null ? l : "")
    return page
  })

  await scenario("FAST: OnePage, then Products at once: Products wins, nothing is left running", async () => {
    const page = await open()
    await goHome(page)
    await press(page, "OnePage", { hover: 0 })
    await wait(60)
    await press(page, "Products", { hover: 0 })
    const l = await landed(page, "/app/products", 9000)
    expect(l.ms !== null, `Products lands (${l.ms}ms)`, l.ms === null ? l : "")
    await wait(1500)
    const s = await state(page)
    expect(s.path === "/app/products" && !s.bar && !s.spinner, "  and stays: the editor does not arrive late over it", s)
    return page
  })

  await scenario("HISTORY: Back out of the editor, Forward into it", async () => {
    const page = await open()
    await goHome(page)
    await press(page, "OnePage")
    const l = await inEditor(page)
    expect(l.ms !== null, `in (${l.ms}ms)`, l.ms === null ? l : "")
    await wait(500)
    await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {})
    const b = await landed(page, "/app", 9000)
    expect(b.ms !== null, `Back lands on Home (${b.ms}ms)`, b.ms === null ? b : "")
    await wait(500)
    await page.goForward({ waitUntil: "domcontentloaded" }).catch(() => {})
    const f = await inEditor(page)
    expect(f.ms !== null, `Forward opens the editor again (${f.ms}ms)`, f.ms === null ? f : "")
    await wait(500)
    await press(page, "Dashboard")
    await landed(page, "/app")
    await wait(400)
    await press(page, "OnePage")
    const again = await inEditor(page)
    expect(again.ms !== null, `and the row opens it again after that (${again.ms}ms)`, again.ms === null ? again : "")
    return page
  })

  await scenario("DEPLOY: a new build while Home is open, then the row", async () => {
    const page = await open()
    await goHome(page)
    page.restarting = true
    await deploy("build-b")
    await press(page, "OnePage")
    const l = await inEditor(page, 14000)
    expect(l.ms !== null, `it lands (${l.ms}ms)`, l.ms === null ? l : "")
    numbers.deployMs = l.ms
    return page
  })

  await scenario("HUNG: the first request for the editor never answers; the press still ends in the editor", async () => {
    const page = await open()
    await goHome(page)
    await clearFilm(page)
    writeFileSync(join(app, "hang-once"), "1")
    const t = Date.now()
    await press(page, "OnePage")
    const l = await inEditor(page, 16000)
    expect(l.ms !== null, `it lands (${l.ms}ms)`, l.ms === null ? l : "")
    films.hung = await film(page, t)
    const back = / > page:dashboard@/.test(films.hung)
    expect(!back, "the page before is never handed back on the way", films.hung)
    numbers.hungMs = l.ms
    page.warnings = []
    return page
  })

  await scenario("SLOW: the editor's server takes 3s", async () => {
    onepageDelay = "3000"
    await deploy("build-c")
    const page = await open()
    await goHome(page)
    await clearFilm(page)
    const t = Date.now()
    await press(page, "OnePage")
    const l = await inEditor(page, 14000)
    expect(l.ms !== null, `it lands (${l.ms}ms)`, l.ms === null ? l : "")
    films.slow = await film(page, t)
    numbers.slowMs = l.ms
    onepageDelay = "250"
    return page
  })
} finally {
  await browser?.close().catch(() => {})
  await stop()
  cleanup()
}

console.log("\nFILM (what was on screen, from the press, in ms)")
for (const [k, v] of Object.entries(films)) console.log(`  ${k.padEnd(12)} ${v}`)
console.log(`\n${JSON.stringify(numbers)}`)
if (SHOTS) writeFileSync(join(SHOTS, "onepage-open.json"), JSON.stringify({ numbers, films }, null, 2))
if (process.env.KEEP === "1") console.log(`kept: ${app} (${basename(app)})`)
console.log(broken ? `\n${broken} failed\n` : "\nall good\n")
process.exit(broken ? 1 : 0)
