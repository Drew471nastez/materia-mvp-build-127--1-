/**
 * ===========================================================================
 *  LEAVING THE ONEPAGE EDITOR
 * ===========================================================================
 * "Sometimes when I'm in /app/onepage#settings and I click in the sidebar to
 * leave the OnePage editor, on Dashboard or Products or Website, it starts
 * the loading bar at the top of the screen but never takes me to what I
 * clicked."
 *
 * A real Next app, built here with webpack in a folder of its own, around the
 * real /app shell (AppLayoutWrapper, AppSidebar, the bar, the stage) and the
 * real OnePage editor, so the router, its history patches and its action
 * queue are the ones that ship. The other /app pages are stubs. Measured at
 * 1280 with a mouse and at 390 as a phone:
 *
 *   TABS       a tab changes the address without a history entry of its own,
 *              keeps the router's marker on the entry, starts no navigation
 *   SETTINGS   opening Settings, by its tab or by #settings, marks nothing
 *              unsaved
 *   CLEAN      from every tab, Dashboard, Products and Website land first
 *              time; from #settings every row of the rail does; no bar or
 *              spinner is left, and the editor's #tab does not follow
 *   UNSAVED    a rail press asks first: the question is on top of the shell
 *              (the rail under it cannot be pressed), and nothing starts, no
 *              bar, no spinner, OnePage still lit, the address the same; Keep
 *              editing stays; Save saves and lands; Discard lands; the
 *              browser's own question never follows
 *   BACK       one press leaves, however many tabs were visited; with work
 *              unsaved Back is held and asked about (same document), or the
 *              browser asks (a Back to another document)
 *   DEPLOY     the server restarts on a new build while the editor is open,
 *              the case that hung: Next 16.0.10 drops its own answer to the
 *              press (listenForDynamicRequest in ppr-navigations returns on
 *              an MPA string, and the navigation never settles), and
 *              lib/ui/app-navigation loads the address as a document 2s
 *              after that answer came
 *   PHONE      at 390 the way out (the arrow) lands on Home from #settings,
 *              clean, and with work unsaved after the sheet asks
 *
 *   node scripts/check-onepage-leave.mjs
 *   SHOTS=/some/dir node scripts/check-onepage-leave.mjs
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

const app = mkdtempSync(join(tmpdir(), "onepage-leave-"))
const put = (path, text) => {
  mkdirSync(dirname(join(app, path)), { recursive: true })
  writeFileSync(join(app, path), text)
}
symlinkSync(realpathSync(join(root, "node_modules")), join(app, "node_modules"))

put("package.json", `{ "name": "onepage-leave-probe", "private": true }\n`)
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
put("app/(storelib)/app/page.tsx", stub("dashboard"))
put("app/(storelib)/app/products/page.tsx", stub("products"))
put("app/(storelib)/app/website-builder/page.tsx", stub("website"))
put("app/(storelib)/app/[...rest]/page.tsx", stub("other"))
put("app/(storelib)/creator-page/page.tsx", stub("creator-page"))
put("app/(storelib)/app/onepage/page.tsx", `import { OnePageEditor } from "@/components/onepage/onepage-editor"

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
  await new Promise((r) => setTimeout(r, Number(process.env.PAGE_DELAY_MS ?? 250)))
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
  return false
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
async function start() {
  server = spawn(process.execPath, [join(app, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: app, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", PAGE_DELAY_MS: "250" }, stdio: ["ignore", "pipe", "pipe"] })
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

async function open(viewport = DESKTOP) {
  const page = await browser.newPage()
  await page.setViewport(viewport)
  page.errors = []
  page.prompts = []
  page.saves = 0
  page.warnings = []
  page.on("pageerror", (e) => page.errors.push(String(e).slice(0, 200)))
  /* Set while the server restarts for a deploy: a request cut off then is the restart's, not the page's. */
  page.restarting = false
  page.on("console", (m) => {
    if (m.type() === "warn" || m.type() === "warning") page.warnings.push(m.text().slice(0, 200))
    if (m.type() === "error" && !/Failed to load resource|DialogTitle|Description|OnePageEditor\]|Missing `Description`/.test(m.text()) && !(page.restarting && /Failed to fetch/.test(m.text()))) page.errors.push(m.text().slice(0, 200))
  })
  /* The browser's own "leave site?" question, answered as the page says (accepted unless told). */
  page.answer = "accept"
  page.on("dialog", async (d) => {
    page.prompts.push(d.type())
    if (page.answer === "accept") await d.accept()
    else await d.dismiss()
  })
  page.on("request", (r) => { if (r.method() === "PUT" && r.url().endsWith("/api/onepage")) page.saves++ })
  return page
}

const state = (page) => page.evaluate(() => {
  const discard = document.querySelector("[data-unsaved-discard]")
  /* A row is a link (OnePage too now: it goes by the router), or a button. */
  const lit = [...document.querySelectorAll("aside a, aside button")].find((a) => a.querySelector("[data-nav-icon='filled']"))
  return {
    path: location.pathname + location.search,
    hash: location.hash,
    len: history.length,
    marker: !!history.state?.__NA,
    page: document.querySelector("[data-page]")?.getAttribute("data-page") ?? (document.querySelector("[data-onepage-editor]") ? "onepage" : null),
    bar: !!document.querySelector("[data-app-nav-progress]"),
    spinner: !!document.querySelector("[data-app-slow-page]"),
    lit: lit ? lit.textContent.trim() : null,
    asking: !!discard && discard.getClientRects().length > 0,
    unsaved: [...document.querySelectorAll("[data-onepage-editor] header span")].some((s) => s.textContent.trim() === "Unsaved"),
  }
})

async function openEditor(page, hash = "") {
  await page.goto(`${base}/app/onepage${hash}`, { waitUntil: "domcontentloaded" })
  await page.waitForSelector("[data-onepage-editor] header", { timeout: 20000 })
  /* The light loader fades off, and the shell's own start settles. */
  await page.waitForFunction(() => !document.querySelector("[data-onepage-loader]") && !document.querySelector("[data-app-nav-progress]"), { timeout: 10000 }).catch(() => {})
  await wait(400)
}

/** The rail's row (or the Upgrade card) under the pointer, pressed with the mouse. */
async function press(page, what) {
  const box = await page.evaluate((what) => {
    const a = [...document.querySelectorAll(what.startsWith("/") ? `aside a[href='${what}']` : "aside a, aside button")]
      .find((x) => x.getClientRects().length && (what.startsWith("/") || x.textContent.trim() === what))
    if (!a) return null
    a.scrollIntoView({ block: "nearest" })
    const r = a.getBoundingClientRect()
    return { x: r.x + Math.min(r.width / 2, 60), y: r.y + r.height / 2 }
  }, what)
  if (!box) throw new Error(`no rail row "${what}"`)
  await page.mouse.move(box.x, box.y)
  await wait(120)
  await page.mouse.click(box.x, box.y)
}

async function tab(page, id) {
  if (id === "settings") await page.click("[data-onepage-editor] header button[title='Settings']")
  else await page.click(`[data-onepage-editor] header [data-tab='${id}']`)
  await wait(250)
}

/** How long until `path` is on screen, drawn and settled: the editor gone, no bar, no spinner. */
async function landed(page, path, ms = 8000) {
  const t = Date.now()
  let s = null
  while (Date.now() - t < ms) {
    try {
      s = await state(page)
      if (s.path === path && s.page && s.page !== "onepage" && !s.bar && !s.spinner) return { ms: Date.now() - t, ...s }
    } catch {
      /* between documents */
    }
    await wait(40)
  }
  return { ms: null, ...s }
}

/** Something typed in Settings: the page's name. */
async function edit(page) {
  const input = await page.waitForSelector("input[placeholder='My OnePage']", { visible: true, timeout: 5000 })
  await input.click()
  await page.keyboard.type(" x")
  await wait(300)
}

async function clickAnswer(page, which) {
  const sel = which === "save" ? "[data-unsaved-save]" : which === "discard" ? "[data-unsaved-discard]" : null
  if (sel) {
    await page.click(sel)
    return
  }
  const ok = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Keep editing" && x.getClientRects().length)
    if (!b) return false
    b.click()
    return true
  })
  if (!ok) throw new Error("no Keep editing")
}

/** The question is the top layer: the point under its middle is the question, and the rail under the scrim cannot be reached. */
const onTop = (page) => page.evaluate(() => {
  const discard = document.querySelector("[data-unsaved-discard]")
  if (!discard) return { top: false }
  const b = discard.getBoundingClientRect()
  const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)
  const rail = document.querySelector("aside a")
  const r = rail && rail.getClientRects().length ? rail.getBoundingClientRect() : null
  const railHit = r ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null
  return { top: !!hit && discard.contains(hit), railCovered: r ? !rail.contains(railHit) : true, box: { x: b.x, y: b.y, width: b.width, height: b.height } }
})

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

try {
  await start()
  browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })

  /* -------------------------------------------------------------------- */
  await scenario("TABS: one history entry, the router's marker kept, nothing started", async () => {
    const page = await open()
    await page.goto(`${base}/app`, { waitUntil: "domcontentloaded" })
    await page.waitForSelector("[data-page='dashboard']")
    await wait(500)
    await press(page, "OnePage")
    await page.waitForSelector("[data-onepage-editor] header", { timeout: 20000 })
    await wait(900)
    const at = await state(page)
    const seen = []
    for (const id of ["design", "products", "settings", "links", "settings"]) {
      await tab(page, id)
      seen.push({ id, ...(await state(page)) })
    }
    expect(seen.every((s) => s.hash === `#${s.id}`), "each tab is in the address", seen.map((s) => s.hash).join(" "))
    expect(seen.every((s) => s.len === at.len), `and in no history entry of its own (${at.len} entries throughout)`, seen.map((s) => s.len).join(" "))
    expect(seen.every((s) => s.marker), "the entry keeps the router's marker (__NA)", seen.map((s) => s.marker).join(" "))
    expect(seen.every((s) => !s.bar && !s.spinner && s.path === "/app/onepage"), "no navigation starts: no bar, no spinner, the same page", seen.map((s) => `${s.bar}/${s.spinner}`).join(" "))
    expect(seen.every((s) => !s.unsaved), "passing through the tabs, Settings twice, marks nothing unsaved", seen.map((s) => s.unsaved).join(" "))
    /* Back, once, from the fifth tab. */
    await page.evaluate(() => history.back())
    const back = await landed(page, "/app")
    expect(back.ms !== null && back.page === "dashboard", `one Back leaves the editor, from its fifth tab (${back.ms}ms)`, back)
    numbers.backAfterTabs = back.ms
    return page
  })

  /* -------------------------------------------------------------------- */
  await scenario("SETTINGS: opened, it marks nothing unsaved", async () => {
    const page = await open()
    await openEditor(page, "#settings")
    await wait(1200)
    const direct = await state(page)
    expect(direct.hash === "#settings" && !direct.unsaved, "opened by #settings: nothing unsaved after 1.2s", direct)
    await tab(page, "links")
    await tab(page, "settings")
    await wait(800)
    const again = await state(page)
    expect(!again.unsaved, "and none after leaving it for Links and coming back", again)
    const disabled = await page.evaluate(() => {
      const b = [...document.querySelectorAll("[data-onepage-editor] header button")].find((x) => /^Save/.test(x.textContent.trim()))
      return b ? b.disabled : null
    })
    expect(disabled === true, "Save stays off", disabled)
    return page
  })

  /* -------------------------------------------------------------------- */
  await scenario("CLEAN: from every tab, Dashboard, Products and Website land first time", async () => {
    const times = []
    const page = await open()
    for (const t of ["links", "design", "products", "settings"]) {
      for (const [row, path] of [["Dashboard", "/app"], ["Products", "/app/products"], ["Website", "/app/website-builder"]]) {
        await openEditor(page, `#${t}`)
        await press(page, row)
        const l = await landed(page, path)
        times.push(l.ms)
        expect(l.ms !== null && l.hash === "" && page.prompts.length === 0, `#${t} → ${row}: ${l.ms}ms`, l.ms === null ? l : "")
      }
    }
    const ok = times.filter((x) => x !== null).sort((a, b) => a - b)
    numbers.cleanLeaves = { n: times.length, median: ok[Math.floor(ok.length / 2)], max: ok[ok.length - 1] }
    return page
  })

  await scenario("CLEAN: from #settings, every row of the rail", async () => {
    const page = await open()
    await openEditor(page, "#settings")
    const rows = await page.evaluate(() => {
      const seen = new Set()
      /* Rows a pointer can reach: a closed group's rows (Coupons) are drawn but clipped. */
      const reachable = (a) => {
        const r = a.getBoundingClientRect()
        const hit = r.width && r.height ? document.elementFromPoint(r.x + Math.min(r.width / 2, 60), r.y + r.height / 2) : null
        return !!hit && a.contains(hit)
      }
      return [...document.querySelectorAll("aside a[href^='/']")]
        .filter((a) => reachable(a) && !a.target && a.textContent.trim())
        .map((a) => ({ href: a.getAttribute("href"), label: a.textContent.trim().replace(/\s+/g, " ") }))
        .filter((r) => r.href !== "/app/onepage" && !seen.has(r.href) && seen.add(r.href))
    })
    expect(rows.length >= 8, `the rail's rows: ${rows.map((r) => r.label.split(" ")[0]).join(", ")}`, rows.length)
    const times = []
    for (const r of rows) {
      await openEditor(page, "#settings")
      await press(page, r.href)
      const l = await landed(page, r.href)
      times.push(l.ms)
      expect(l.ms !== null && l.hash === "", `#settings → ${r.label.split(" ")[0]} (${r.href}): ${l.ms}ms`, l.ms === null ? l : "")
    }
    const ok = times.filter((x) => x !== null).sort((a, b) => a - b)
    numbers.everyRow = { n: times.length, median: ok[Math.floor(ok.length / 2)], max: ok[ok.length - 1] }
    return page
  })

  /* -------------------------------------------------------------------- */
  await scenario("UNSAVED: the rail asks first, and nothing starts until it is answered", async () => {
    const page = await open()
    await openEditor(page, "#settings")
    await edit(page)
    const before = await state(page)
    expect(before.unsaved, "typing the page's name marks it unsaved")
    await press(page, "Dashboard")
    const t = Date.now()
    await page.waitForSelector("[data-unsaved-discard]", { visible: true, timeout: 3000 })
    numbers.askMs = Date.now() - t
    await wait(450)
    const asked = await state(page)
    const top = await onTop(page)
    expect(asked.asking && top.top, `the question is up (${numbers.askMs}ms) and on top: the point under Discard is Discard`, top)
    expect(top.railCovered, "  the rail is under its scrim")
    expect(!asked.bar && !asked.spinner, "  no bar, no spinner", asked)
    expect(asked.path === "/app/onepage" && asked.hash === "#settings" && asked.page === "onepage", "  the address and the editor are as they were", asked)
    expect(asked.lit === "OnePage", "  the rail still lights OnePage", asked.lit)
    if (SHOTS) await page.screenshot({ path: join(SHOTS, "appfix-onepage-ask-1280.png") })
    await clickAnswer(page, "keep")
    await wait(500)
    const kept = await state(page)
    expect(!kept.asking && kept.page === "onepage" && kept.unsaved && !kept.bar && kept.hash === "#settings", "Keep editing: back in the editor, the work still unsaved, nothing started", kept)
    await press(page, "Products")
    await page.waitForSelector("[data-unsaved-discard]", { visible: true, timeout: 3000 })
    expect(true, "pressed again (Products), it asks again")
    await clickAnswer(page, "discard")
    const l = await landed(page, "/app/products")
    expect(l.ms !== null && l.page === "products", `Discard lands on Products (${l.ms}ms)`, l.ms === null ? l : "")
    expect(page.prompts.length === 0, "  and the browser does not ask again", page.prompts)
    numbers.discardMs = l.ms
    return page
  })

  await scenario("UNSAVED: Save saves, then lands", async () => {
    const page = await open()
    await openEditor(page, "#settings")
    await edit(page)
    await press(page, "Website")
    await page.waitForSelector("[data-unsaved-save]", { visible: true, timeout: 3000 })
    await wait(300)
    await clickAnswer(page, "save")
    const l = await landed(page, "/app/website-builder")
    expect(l.ms !== null && l.page === "website", `Save lands on Website (${l.ms}ms)`, l.ms === null ? l : "")
    expect(page.saves >= 1, `  after the save went out (${page.saves} PUT /api/onepage)`, page.saves)
    expect(page.prompts.length === 0, "  and the browser does not ask", page.prompts)
    numbers.saveMs = l.ms
    return page
  })

  /* -------------------------------------------------------------------- */
  await scenario("BACK: entered by the router, one press leaves; with work unsaved it is held and asked", async () => {
    const page = await open()
    await page.goto(`${base}/app`, { waitUntil: "domcontentloaded" })
    await page.waitForSelector("[data-page='dashboard']")
    await wait(500)
    await page.evaluate(() => window.next.router.push("/app/onepage"))
    await page.waitForSelector("[data-onepage-editor] header", { timeout: 20000 })
    await wait(700)
    const entered = await state(page)
    await tab(page, "settings")
    await tab(page, "design")
    await tab(page, "settings")
    const tabbed = await state(page)
    expect(tabbed.len === entered.len, `three tabs later, still ${entered.len} entries`, [entered.len, tabbed.len])
    await edit(page)
    await page.evaluate(() => history.back())
    await page.waitForSelector("[data-unsaved-discard]", { visible: true, timeout: 3000 })
    await wait(300)
    const held = await state(page)
    expect(held.path === "/app/onepage" && held.hash === "#settings" && held.page === "onepage" && !held.bar && !held.spinner, "Back with work unsaved is held: the editor and its address stay, nothing starts", held)
    expect(held.len === tabbed.len, "  and the hold adds no entry", [tabbed.len, held.len])
    await clickAnswer(page, "keep")
    await wait(500)
    const kept = await state(page)
    expect(kept.page === "onepage" && kept.unsaved && !kept.asking, "Keep editing stays", kept)
    await page.evaluate(() => history.back())
    await page.waitForSelector("[data-unsaved-discard]", { visible: true, timeout: 3000 })
    expect(true, "Back again is held again")
    await wait(300)
    await clickAnswer(page, "discard")
    const l = await landed(page, "/app")
    expect(l.ms !== null && l.page === "dashboard", `Discard goes back to Home (${l.ms}ms)`, l.ms === null ? l : "")
    expect(page.prompts.length === 0, "  without the browser asking", page.prompts)
    return page
  })

  /*
    A BACK THAT GOES NOWHERE. The hold puts the editor's own entry back and
    Discard then pops from it, which is fine as long as there is an entry to
    pop to. There is not always: an entry the browser replaced, the editor
    opened straight from a link or the app's start screen, a web view that
    reports a length it cannot go back through. `history.back()` says nothing
    when it does nothing, so Discard left the editor sitting there with the
    question gone and nothing else happening for LEAVE_REVIVE_MS (12s), and
    then simply held Back again. Now it lands on Home.
  */
  await scenario("BACK: a back that does nothing still lands, rather than sitting in the editor", async () => {
    const page = await open()
    await page.goto(`${base}/app`, { waitUntil: "domcontentloaded" })
    await page.waitForSelector("[data-page='dashboard']")
    await wait(500)
    await page.evaluate(() => window.next.router.push("/app/onepage"))
    await page.waitForSelector("[data-onepage-editor] header", { timeout: 20000 })
    await wait(700)
    await tab(page, "settings")
    await edit(page)
    await page.evaluate(() => history.back())
    await page.waitForSelector("[data-unsaved-discard]", { visible: true, timeout: 3000 })
    await wait(300)
    /* From here the entry behind is dead: back() reports nothing, because it does nothing. */
    await page.evaluate(() => { history.back = () => {} })
    await clickAnswer(page, "discard")
    const l = await landed(page, "/app", 6000)
    expect(l.ms !== null && l.page === "dashboard", `Discard with a dead entry still lands on Home (${l.ms}ms)`, l.ms === null ? l : "")
    expect(l.ms === null || l.ms < 2500, "  inside a second and a half of watching, not twelve seconds of nothing", l.ms)
    numbers.deadBackMs = l.ms
    return page
  })

  await scenario("BACK: to another document with work unsaved, the browser asks, and staying keeps it", async () => {
    const page = await open()
    await page.goto(`${base}/app`, { waitUntil: "domcontentloaded" })
    await page.waitForSelector("[data-page='dashboard']")
    await wait(500)
    /*
      THE EDITOR AS A DOCUMENT OF ITS OWN, behind Home's. The rail's row went
      by a whole document load when this was written (forceNavigation); it
      goes by the router now (scripts/check-onepage-open.mjs), and Back from
      there is the held Back above. A Back to another document is still what
      a bookmark or a typed address gives, so it is opened that way here.
    */
    await openEditor(page)
    await tab(page, "settings")
    await edit(page)
    page.answer = "dismiss"
    await page.evaluate(() => history.back())
    await wait(1200)
    const stayed = await state(page)
    expect(page.prompts.includes("beforeunload"), "the browser's own question", page.prompts)
    expect(stayed.page === "onepage" && stayed.unsaved && stayed.path === "/app/onepage", "  Stay keeps the editor and the work", stayed)
    return page
  })

  /* -------------------------------------------------------------------- */
  await scenario("PHONE 390: the way out from #settings", async () => {
    const page = await open(PHONE)
    await openEditor(page, "#settings")
    await page.tap("[data-onepage-exit]")
    const l = await landed(page, "/app", 9000)
    expect(l.ms !== null && l.page === "dashboard" && l.hash === "", `the arrow goes to Home (${l.ms}ms, the glass included)`, l.ms === null ? l : "")
    numbers.phoneExitMs = l.ms
    await openEditor(page, "#settings")
    await edit(page)
    await page.tap("[data-onepage-exit]")
    await page.waitForSelector("[data-unsaved-discard]", { visible: true, timeout: 3000 })
    await wait(500)
    const top = await onTop(page)
    const asked = await state(page)
    expect(top.top && !asked.bar && asked.page === "onepage", "with work unsaved it asks first, on top, nothing started", { top, asked })
    if (SHOTS) await page.screenshot({ path: join(SHOTS, "appfix-onepage-ask-390.png") })
    await page.tap("[data-unsaved-discard]")
    const l2 = await landed(page, "/app", 9000)
    expect(l2.ms !== null && l2.page === "dashboard", `Discard goes to Home (${l2.ms}ms)`, l2.ms === null ? l2 : "")
    expect(page.prompts.length === 0, "  without the browser asking", page.prompts)
    return page
  })

  /* -------------------------------------------------------------------- */
  await scenario("DEPLOY: a new build while the editor is open, then Dashboard", async () => {
    const page = await open()
    await openEditor(page, "#settings")
    page.restarting = true
    await deploy("build-b")
    await press(page, "Dashboard")
    const l = await landed(page, "/app", 12000)
    expect(l.ms !== null && l.page === "dashboard" && l.hash === "", `it lands (${l.ms}ms: the router's answer, 2s, then the document)`, l.ms === null ? l : "")
    const said = page.warnings.find((w) => /app-navigation|document/i.test(w))
    expect(!!said, "  the console says why", said ?? page.warnings.slice(0, 2))
    numbers.deployMs = l.ms
    return page
  })

  await scenario("DEPLOY: with work unsaved, Discard", async () => {
    const page = await open()
    await openEditor(page, "#settings")
    await edit(page)
    page.restarting = true
    await deploy("build-c")
    await press(page, "Products")
    await page.waitForSelector("[data-unsaved-discard]", { visible: true, timeout: 3000 })
    await wait(300)
    await clickAnswer(page, "discard")
    const l = await landed(page, "/app/products", 12000)
    expect(l.ms !== null && l.page === "products", `it lands (${l.ms}ms)`, l.ms === null ? l : "")
    expect(page.prompts.length === 0, "  without the browser asking", page.prompts)
    numbers.deployDirtyMs = l.ms
    return page
  })
} finally {
  await browser?.close().catch(() => {})
  await stop()
  cleanup()
}

console.log(`\n${JSON.stringify(numbers)}`)
if (SHOTS) writeFileSync(join(SHOTS, "appfix-onepage-leave.json"), JSON.stringify(numbers, null, 2))
if (process.env.KEEP === "1") console.log(`kept: ${app} (${basename(app)})`)
console.log(broken ? `\n${broken} failed\n` : "\nall good\n")
process.exit(broken ? 1 : 0)
