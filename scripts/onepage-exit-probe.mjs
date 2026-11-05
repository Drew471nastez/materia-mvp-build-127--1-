/**
 * ===========================================================================
 *  LEAVING THE ONEPAGE EDITOR, EVERY WAY, AND WHAT IT LEAVES BEHIND
 * ===========================================================================
 * Round 11, the owner: "Sometimes when I'm exiting the OnePage editor and I go
 * back to the app, on mobile and I think desktop, there's a gray container
 * showing and cutting things off in the entire app."
 *
 * A real Next app around the real /app shell (AppLayoutWrapper, AppSidebar,
 * the stage) and the real editor, built as scripts/check-onepage-leave.mjs
 * builds one. The dashboard is a tall page of cards with a link into the
 * editor. Before the editor is opened the dashboard is read: <html> and
 * <body>'s classes, attributes and inline styles, and every layer drawn over
 * the window (fixed, or absolute over it, a tenth of the screen or more).
 * Then the editor is opened from the dashboard's own link and left:
 *
 *   computer (1280x860, a mouse)   by its back arrow; by the rail (Products);
 *                                  by the browser's Back; by Back with the
 *                                  Share dialog open; after scrolling the
 *                                  column to its end, by the arrow
 *   phone (390x844, a finger)      by its back arrow; by the browser's Back;
 *                                  by Back with the share sheet open; by the
 *                                  arrow with the sheet open; after
 *                                  scrolling, by the arrow
 *
 * and once the dashboard is back (and 1.2s later) it must be exactly what it
 * was: no editor, no leaving glass, no sheet or its copy, no page copy, no
 * spinner, the shell's chrome painted, <html> and <body> as they were, and no
 * layer over the window that was not there before.
 *
 *   const { checks, numbers } = await runExitProbe({ shots })
 *   (scripts/check-onepage-motion-r11.mjs ONLY=exit runs it)
 */
import { spawn } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

export async function runExitProbe({ root = process.cwd(), shots = null, chromium = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" } = {}) {
  const checks = []
  const numbers = {}
  const expect = (ok, what, got) => {
    checks.push({ ok, what, got })
  }

  const app = mkdtempSync(join(tmpdir(), "onepage-exit-"))
  const put = (path, text) => {
    mkdirSync(dirname(join(app, path)), { recursive: true })
    writeFileSync(join(app, path), text)
  }
  symlinkSync(realpathSync(join(root, "node_modules")), join(app, "node_modules"))
  put("package.json", `{ "name": "onepage-exit-probe", "private": true }\n`)
  put("next.config.mjs", `import { fileURLToPath } from "node:url"
const here = (p) => fileURLToPath(new URL(p, import.meta.url))
export default {
  reactStrictMode: false,
  typescript: { ignoreBuildErrors: true },
  experimental: { externalDir: true },
  webpack: (config) => {
    config.resolve.alias = { ...(config.resolve.alias || {}), "@/lib/supabase/client$": here("./stubs/supabase-client.ts"), "@supabase/ssr$": here("./stubs/supabase-ssr.ts"), "@": ${JSON.stringify(root)} }
    return config
  },
}
`)
  put("tsconfig.json", JSON.stringify({
    compilerOptions: { lib: ["dom", "dom.iterable", "esnext"], allowJs: true, target: "ES2017", skipLibCheck: true, strict: false, noEmit: true, esModuleInterop: true, module: "esnext", moduleResolution: "bundler", resolveJsonModule: true, isolatedModules: true, jsx: "react-jsx", baseUrl: ".", paths: { "@/*": [`${root}/*`] }, plugins: [{ name: "next" }] },
    include: ["**/*.ts", "**/*.tsx"],
    exclude: ["node_modules"],
  }, null, 2))
  put("instrumentation-client.ts", `export { onRouterTransitionStart } from "@/instrumentation-client"\n`)
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
  put("app/(storelib)/app/shell.tsx", `"use client"
import type React from "react"
import { AppLayoutWrapper } from "@/components/app/app-layout-wrapper"
import { AppSidebar } from "@/components/app/sidebar"

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AppLayoutWrapper>
      <div className="h-svh overflow-hidden bg-[#111111] md:bg-[#131316] app-no-scrollbar">
        <AppSidebar creatorSlug="probe" username="probe" storePublished displayName="Probe" stripeConnected={false} stripeStatus="not_connected" onePagePublished setupProgress={{ completed: 3, total: 7 }} businesses={[]} />
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
  /* The dashboard: a tall page of cards, with its own link into the editor (a client move, as the app's are). */
  put("app/(storelib)/app/page.tsx", `import Link from "next/link"
export const dynamic = "force-dynamic"
export default async function Page() {
  await new Promise((r) => setTimeout(r, 200))
  return (
    <div data-page="dashboard" className="mx-auto max-w-[1200px] px-4 py-6">
      <h1 className="text-[24px] font-bold text-[#1a1a2e]">Dashboard</h1>
      <Link href="/app/onepage" data-open-editor="" className="mt-3 inline-flex h-10 items-center rounded-xl bg-[#1a1a2e] px-4 text-[14px] font-medium text-white">Edit OnePage</Link>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} data-dash-card={i} className="h-[140px] rounded-2xl border border-[#e5e7eb]/60 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">Card {i + 1}</div>
        ))}
      </div>
    </div>
  )
}
`)
  const stub = (name) => `export const dynamic = "force-dynamic"
export default async function Page() {
  await new Promise((r) => setTimeout(r, 200))
  return <div data-page="${name}" className="p-8 text-[24px] font-bold text-[#1a1a2e]">${name}</div>
}
`
  put("app/(storelib)/app/products/page.tsx", stub("products"))
  put("app/(storelib)/app/[...rest]/page.tsx", stub("other"))
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
  ...Array.from({ length: 14 }, (_, i) => ({ id: "b_link" + i, type: "link_button", enabled: true, data: { label: "My Link " + (i + 1), url: "https://example.com/" + i, icon: null, thumbnail_url: null }, sort_order: i + 1 })),
]
const FIXTURE = {
  id: "op_probe", owner_id: "user_probe", creator_id: "creator_probe", slug: "probe", title: "Probe Page", bio: "",
  avatar_url: null, avatar_video_url: null, theme,
  settings: { show_branding: true, seo_title: null, seo_description: null, social_image_url: null, custom_domain: null, analytics_enabled: true, subscribe_enabled: true, subscribe_style: "white", share_enabled: true, share_style: "white", verified_badge_enabled: false, verified_badge_type: "verified_creator" },
  social_links: {}, draft_blocks: blocks, published_blocks: blocks, published_theme: theme,
  published_profile: { title: "Probe Page", bio: "", avatar_url: null, avatar_video_url: null, avatar_video_crop: null },
  published_social_links: {}, status: "published", published_at: "2026-09-01T00:00:00.000Z",
  created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z", onboarding_completed: true,
}
export default async function Page() {
  await new Promise((r) => setTimeout(r, 200))
  return <OnePageEditor initialOnePage={FIXTURE as never} />
}
`)
  put("app/(storelib)/onepage-preview/page.tsx", `export { default, metadata } from "@/app/(storelib)/onepage-preview/page"\n`)
  put("app/api/onepage/route.ts", `export async function PUT() { return Response.json({ ok: true }) }\nexport async function GET() { return Response.json({}) }\n`)
  put("app/api/onepage/publish/route.ts", `export async function POST() { return Response.json({ published_at: new Date().toISOString() }) }\n`)
  put("app/api/purchases/claim/route.ts", `export async function POST() { return Response.json({ claimed: 0 }) }\n`)
  put("app/api/domains/route.ts", `export async function GET() { return Response.json({ domains: [] }) }\n`)
  put("app/api/billing/subscription/route.ts", `export async function GET() { return Response.json({ currentPlan: { id: "free" } }) }\n`)
  /* The cookie helpers the shell's business switcher imports (lib/supabase/session-jar), never called here: supabase-js's ESM wrapper does not build in this probe's webpack. */
  put("stubs/supabase-ssr.ts", `export const combineChunks = async () => null
export const createChunks = (key: string, value: string) => [{ name: key, value }]
export const isChunkLike = () => false
export const stringFromBase64URL = (s: string) => s
export const stringToBase64URL = (s: string) => s
export const createBrowserClient = () => { throw new Error("no Supabase in the probe") }
export const createServerClient = () => { throw new Error("no Supabase in the probe") }
`)
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
  from: () => query(), rpc: () => query(),
  auth: { getUser: async () => ({ data: { user: { id: "user_probe" } }, error: null }), getSession: async () => ({ data: { session: null }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
  channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel: () => {},
}
export function createClient() { return client as never }
export function isNativePlatform() { return false }
`)

  const run = (args, env = {}) => new Promise((resolve) => {
    const child = spawn(process.execPath, [join(app, "node_modules/next/dist/bin/next"), ...args], { cwd: app, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...env }, stdio: ["ignore", "pipe", "pipe"] })
    let out = ""
    child.stdout.on("data", (d) => { out += d })
    child.stderr.on("data", (d) => { out += d })
    child.on("exit", (code) => resolve({ code, out }))
  })
  const cleanup = () => { if (process.env.KEEP !== "1") rmSync(app, { recursive: true, force: true }) }
  console.log(`\nLeaving the editor: building the app in ${app} (webpack, a few minutes)`)
  const built = await run(["build", "--webpack"], { NODE_OPTIONS: "--max-old-space-size=3072" })
  if (built.code !== 0) {
    console.error(built.out.split("\n").slice(-40).join("\n"))
    cleanup()
    expect(false, "the exit probe's app built", "build failed")
    return { checks, numbers }
  }
  const port = await new Promise((resolve) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)) }) })
  const base = `http://127.0.0.1:${port}`
  const server = spawn(process.execPath, [join(app, "node_modules/next/dist/bin/next"), "start", "-p", String(port), "-H", "127.0.0.1"], { cwd: app, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] })
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(`${base}/api/domains`)).ok) break } catch { /* not up yet */ }
    await wait(200)
  }
  const browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox"], headless: true, protocolTimeout: 240000 })

  /* What the window shows besides the page: <html>, <body>, and every layer over the window. */
  const snapshot = (page) => page.evaluate(() => {
    const html = document.documentElement
    const body = document.body
    const attrs = (el) => Object.fromEntries([...el.attributes].filter((a) => !["class", "style", "lang"].includes(a.name)).map((a) => [a.name, a.value]))
    const W = innerWidth
    const H = innerHeight
    const layers = []
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el)
      if (cs.position !== "fixed" && cs.position !== "absolute") continue
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.02) continue
      if (el.closest("[data-shell-chrome], aside, nav")) continue
      const r = el.getBoundingClientRect()
      const w = Math.max(0, Math.min(W, r.right) - Math.max(0, r.left))
      const h = Math.max(0, Math.min(H, r.bottom) - Math.max(0, r.top))
      if ((w * h) / (W * H) < 0.1) continue
      if (cs.position === "absolute" && el.closest(".app-content-scroll")) continue
      const bg = cs.backgroundColor
      layers.push({ sig: `${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/).slice(0, 4).join(".")}`, bg, box: [Math.round(r.left), Math.round(r.top), Math.round(w), Math.round(h)], z: cs.zIndex, data: [...el.attributes].filter((a) => a.name.startsWith("data-")).map((a) => a.name).join(" ") })
    }
    const chrome = [...document.querySelectorAll("[data-shell-chrome]")].filter((e) => e.getClientRects().length).map((e) => getComputedStyle(e).visibility)
    const leftovers = {
      editor: !!document.querySelector("[data-onepage-editor]"),
      leaving: !!document.querySelector(".wb-leaving, [data-onepage-leaving]"),
      sheetGhost: !!document.querySelector("[data-sheet-ghost]"),
      sheet: [...document.querySelectorAll("[data-app-sheet]")].length,
      pageCopy: !!document.querySelector("[data-into-app-still], [data-leaving-still], [data-page-still]"),
      spinner: !!document.querySelector("[data-app-slow-page]"),
      loader: !!document.querySelector("[data-onepage-loader]"),
    }
    /* What is at the middle of the dashboard's cards: a card, or something over it. */
    const cards = [...document.querySelectorAll("[data-dash-card]")].slice(0, 6).map((c) => {
      const r = c.getBoundingClientRect()
      if (r.bottom < 0 || r.top > H) return "off"
      const y = Math.min(H - 2, Math.max(1, r.top + r.height / 2))
      const hit = document.elementFromPoint(r.left + r.width / 2, y)
      return hit && (c === hit || c.contains(hit)) ? "card" : hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).slice(0, 60)}` : "none"
    })
    return {
      path: location.pathname,
      page: document.querySelector("[data-page]")?.getAttribute("data-page") ?? null,
      htmlClass: [...html.classList].sort().join(" "),
      htmlAttrs: attrs(html),
      htmlStyle: html.getAttribute("style") || "",
      bodyClass: [...body.classList].sort().join(" "),
      bodyAttrs: attrs(body),
      bodyStyle: body.getAttribute("style") || "",
      bodyInert: body.inert === true,
      bodyOverflow: getComputedStyle(body).overflow,
      htmlOverflow: getComputedStyle(html).overflow,
      layers,
      chrome,
      leftovers,
      cards,
    }
  })
  /* The classes and attributes that come and go on their own (the landing, the scroll), and are not the editor's. */
  const VOLATILE = /^(nav-landing|app-landing|landing-|is-scrolling|scrolled)/
  const clean = (s) => ({ ...s, htmlClass: s.htmlClass.split(" ").filter((c) => !VOLATILE.test(c)).join(" ") })

  async function landed(page, path = "/app", ms = 10000) {
    const t = Date.now()
    while (Date.now() - t < ms) {
      try {
        const s = await page.evaluate(() => ({ path: location.pathname, page: document.querySelector("[data-page]")?.getAttribute("data-page") ?? null, editor: !!document.querySelector("[data-onepage-editor]") }))
        if (s.path === path && s.page && !s.editor) return Date.now() - t
      } catch { /* between documents */ }
      await wait(40)
    }
    return null
  }

  async function openFromDashboard(page, vp) {
    await page.setViewport(vp)
    await page.goto(`${base}/app`, { waitUntil: "domcontentloaded" })
    await page.waitForSelector("[data-page='dashboard']", { timeout: 20000 })
    await wait(1500)
    const before = await snapshot(page)
    const link = await page.$("[data-open-editor]")
    const b = await link.boundingBox()
    if (vp.hasTouch) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2)
    else await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
    await page.waitForSelector("[data-onepage-editor] header", { timeout: 20000 })
    await page.waitForFunction(() => !document.querySelector("[data-onepage-loader]"), { timeout: 10000 }).catch(() => {})
    await wait(900)
    return before
  }

  const press = async (page, vp, sel) => {
    const el = await page.waitForSelector(sel, { visible: true, timeout: 8000 })
    const b = await el.boundingBox()
    if (vp.hasTouch) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2)
    else { await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await wait(80); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2) }
  }
  const scrollColumn = (page) => page.evaluate(async () => {
    const col = document.querySelector("[data-scroll-container]")
    if (!col) return 0
    for (let i = 0; i < 8; i++) { col.scrollTop += 400; await new Promise((r) => requestAnimationFrame(r)) }
    return col.scrollTop
  })

  const DESK = { width: 1280, height: 860, deviceScaleFactor: 1 }
  const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  const ways = [
    ["1280", DESK, "the rail's Home", async (p) => press(p, DESK, "aside a[href='/app']")],
    ["1280", DESK, "the rail (Products), then the rail (Home)", async (p) => {
      await press(p, DESK, "aside a[href='/app/products']")
      await landed(p, "/app/products")
      await wait(400)
      await press(p, DESK, "aside a[href='/app']")
    }],
    ["1280", DESK, "the browser's Back", async (p) => { await p.goBack({ waitUntil: "domcontentloaded" }).catch(() => {}) }],
    ["1280", DESK, "the browser's Back with the Share dialog open", async (p) => {
      await p.evaluate(() => [...document.querySelectorAll("[data-onepage-editor] header button")].find((b) => b.getClientRects().length && /Share your OnePage/.test(b.textContent))?.click())
      await wait(700)
      await p.goBack({ waitUntil: "domcontentloaded" }).catch(() => {})
    }],
    ["1280", DESK, "the rail's Home after scrolling the column to its end", async (p) => { numbers.scrolled1280 = await scrollColumn(p); await wait(300); await press(p, DESK, "aside a[href='/app']") }],
    ["390", PHONE, "the back arrow", async (p) => press(p, PHONE, "[aria-label='Back to Storelib']")],
    ["390", PHONE, "the browser's Back", async (p) => { await p.goBack({ waitUntil: "domcontentloaded" }).catch(() => {}) }],
    ["390", PHONE, "the browser's Back with the share sheet open", async (p) => {
      await press(p, PHONE, "[data-onepage-share]")
      await wait(800)
      await p.goBack({ waitUntil: "domcontentloaded" }).catch(() => {})
    }],
    ["390", PHONE, "the back arrow with the share sheet open, half way up", async (p) => {
      await press(p, PHONE, "[data-onepage-share]")
      await wait(120)
      await p.evaluate(() => document.querySelector("[aria-label='Back to Storelib']")?.click())
    }],
    ["390", PHONE, "the back arrow after scrolling", async (p) => { numbers.scrolled390 = await scrollColumn(p); await wait(300); await press(p, PHONE, "[aria-label='Back to Storelib']") }],
  ]

  try {
    for (const [label, vp, how, leave] of ways) {
      const page = await browser.newPage()
      const errors = []
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
      page.on("dialog", (d) => d.accept().catch(() => {}))
      try {
        const before = clean(await openFromDashboard(page, vp))
        /* A filmstrip of the way out: what the window shows while the app comes back (FILM=1). */
        const film = []
        let filming = !!process.env.FILM && !!shots
        const filmer = (async () => {
          const t0 = Date.now()
          while (filming && Date.now() - t0 < 2000) {
            const at = Date.now() - t0
            const f = join(shots, `r11-exitfilm-${label}-${how.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${String(at).padStart(4, "0")}.png`)
            await page.screenshot({ path: f, captureBeyondViewport: false }).catch(() => {})
            film.push(f)
          }
        })()
        await leave(page)
        const ms = await landed(page)
        await wait(400)
        filming = false
        await filmer
        await wait(1200)
        const after = clean(await snapshot(page))
        const newLayers = after.layers.filter((l) => !before.layers.some((b) => b.sig === l.sig))
        const left = Object.entries(after.leftovers).filter(([, v]) => v).map(([k, v]) => `${k}:${v}`)
        const diffs = ["htmlClass", "htmlStyle", "bodyClass", "bodyStyle", "bodyInert", "bodyOverflow", "htmlOverflow"].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
        const attrDiff = JSON.stringify(before.htmlAttrs) !== JSON.stringify(after.htmlAttrs) || JSON.stringify(before.bodyAttrs) !== JSON.stringify(after.bodyAttrs)
        const covered = after.cards.filter((c) => c !== "card" && c !== "off")
        numbers[`${label} ${how}`] = { ms, newLayers, left, diffs: diffs.map((k) => ({ k, before: before[k], after: after[k] })), attrs: attrDiff ? { before: [before.htmlAttrs, before.bodyAttrs], after: [after.htmlAttrs, after.bodyAttrs] } : null, covered, chrome: after.chrome }
        const ok = ms !== null && after.page === "dashboard" && newLayers.length === 0 && left.length === 0 && diffs.length === 0 && !attrDiff && covered.length === 0 && after.chrome.every((v) => v === "visible")
        expect(ok, `${label}: out by ${how}, the dashboard is back whole: no layer left over it, <html> and <body> as they were`, ok ? { ms } : numbers[`${label} ${how}`])
        expect(errors.length === 0, `${label}: ${how}: no page errors`, errors.slice(0, 2))
        if (shots) await page.screenshot({ path: join(shots, `r11-exit-${label}-${how.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`) })
      } catch (e) {
        expect(false, `${label}: out by ${how}`, String(e).slice(0, 300))
      }
      await page.close().catch(() => {})
    }
    /*
      THE EDITOR'S CLASS LEFT ON <html> WITH NO EDITOR (a way out before the editor hydrated, which nothing above can
      drive): under 768px it hides the shell's header and pill on every page after. Put there by hand on the dashboard,
      as the server's one line script puts it, it must be taken off (components/platform/stuck-layer-guard).
    */
    {
      const page = await browser.newPage()
      await page.setViewport(PHONE)
      await page.goto(`${base}/app`, { waitUntil: "domcontentloaded" })
      await page.waitForSelector("[data-page='dashboard']", { timeout: 20000 })
      await wait(1500)
      const chrome = () => page.evaluate(() => [...document.querySelectorAll("[data-shell-chrome]")].filter((e) => e.getClientRects().length).map((e) => getComputedStyle(e).visibility))
      const before = await chrome()
      await page.evaluate(() => document.documentElement.classList.add("with-op-editor"))
      await wait(60)
      const stuck = await chrome()
      if (shots) await page.screenshot({ path: join(shots, "r11-exit-390-stuck-class-before-guard.png"), captureBeyondViewport: false }).catch(() => {})
      await wait(400)
      const after = await page.evaluate(() => document.documentElement.classList.contains("with-op-editor"))
      const back = await chrome()
      numbers.staleClass = { before, stuck, classAfter: after, after: back }
      expect(!after && back.every((v) => v === "visible"), "390: the editor's class left on <html> with no editor is taken off, and the header and pill are painted again", numbers.staleClass)
      await page.close().catch(() => {})
    }
  } finally {
    await browser.close().catch(() => {})
    server.kill()
    await wait(300)
    cleanup()
  }
  return { checks, numbers }
}
