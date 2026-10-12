/**
 * ===========================================================================
 *  ROUND 25 IN THE BUILDER: PAGE SWITCH SPEED, THE PICTURE FIELD, THE SCHEMES
 * ===========================================================================
 *   npx tsx scripts/check-builder25.ts [speed] [picker] [schemes] [desktop] [phone]
 *
 * speed    the real editor (scripts/render-editor-probe.tsx) with every
 *          signed-in route answering after API_MS (a round trip to the
 *          server), on a Storelib theme and on an imported theme (the
 *          Posturex fixture, tests/fixtures/shopify-posture, with DAWN_CSS
 *          more stylesheets and DAWN_JS more deferred scripts in its layout,
 *          the count Dawn's pages load, each answered after ASSET_MS as the
 *          asset route does). Measured:
 *            first load   from the navigation to the canvas showing the page
 *                         (the outline gone on an imported theme)
 *            a switch     from the press on a page's row (after HOVER_MS of
 *                         the pointer on it, as a hand does) to the new page
 *                         settled in the canvas: its sections drawn and the
 *                         copy of the page left (or its frame) gone
 *          home, about, contact, home again, about again; each with the
 *          theme's files asked for during it (an imported theme's frame has
 *          no origin, so nothing it loads is cached for the next one).
 * picker   the picture field in its three states (a picture, one that cannot
 *          be loaded, a picture an imported theme names by its old store's
 *          address) at the sidebar's width, and the line's size and colour.
 * schemes  the colour scheme field on an imported theme: one row, a list.
 *
 * desktop is 1440x900; phone is 390x844 with touch and the CPU slowed 4x.
 * Screenshots go to $OUT (default /tmp/builder25). Exits 1 on any failure.
 */
import { createServer, type Server } from "node:http"
import { mkdirSync, readFileSync } from "node:fs"
import puppeteer, { type Browser, type Page } from "puppeteer-core"
import { converted, shop } from "./check-builder-nav19"

const OUT = process.env.OUT ?? "/tmp/builder25"
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium"
const API_MS = Number(process.env.API_MS ?? 300)
const ASSET_MS = Number(process.env.ASSET_MS ?? 150)
const HOVER_MS = Number(process.env.HOVER_MS ?? 150)
const DAWN_CSS = Number(process.env.DAWN_CSS ?? 14)
const DAWN_JS = Number(process.env.DAWN_JS ?? 8)
const IMG_MS = Number(process.env.IMG_MS ?? 200)
/* A small photograph's worth of PNG, one colour: what the sections' pictures are answered with. */
const PICTURE = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64")
mkdirSync(OUT, { recursive: true })
const parts = new Set(process.argv.slice(2))
const want = (p: string) => parts.size === 0 || parts.has(p) || (![...parts].some((x) => ["speed", "picker", "schemes"].includes(x)) && ["speed", "picker", "schemes"].includes(p))
const sizes = (["desktop", "phone"] as const).filter((s) => !parts.has("desktop") && !parts.has("phone") ? true : parts.has(s))
let failed = 0
const check = (label: string, ok: boolean, detail: unknown = "") => {
  if (!ok) failed++
  const d = typeof detail === "string" ? detail : JSON.stringify(detail)
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${d ? `  (${d})` : ""}`)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* ── the editor, served ───────────────────────────────────────────────────── */

type Kind = "storelib" | "compat"
/** A Storelib theme's pages, by the sections each draws (render-editor-probe.tsx PROBE_PAGES). */
const STORELIB_PAGES: Record<string, string[]> = {
  home: ["header", "hero_centered", "features_grid", "text_rich", "proof_testimonials", "faq_accordion", "cta_simple", "footer"],
  about: ["header", "about_image", "about_timeline", "text_image", "footer"],
  contact: ["header", "text_rich", "faq_accordion", "promo_newsletter", "footer"],
  faq: ["header", "faq_accordion", "cta_simple", "footer"],
}

interface Served {
  base: string
  server: Server
  /** Every theme file asked for, in order. */
  assets: string[]
  close: () => void
}

async function serve(kind: Kind, extraGlobals = ""): Promise<Served> {
  const { bundle, css } = (await import("./editor-probe-harness.mjs")) as { bundle: string; css: string }
  let globals = `window.PROBE_SHORT=false;window.PROBE_API_DELAY_MS=${API_MS};`
  const assetText: Record<string, string> = {}
  if (kind === "compat") {
    const t = await converted()
    /* Dawn's count of stylesheets and deferred scripts, in the layout, each a file of its own. */
    const extraCss = Array.from({ length: DAWN_CSS }, (_, i) => `component-${i + 1}.css`)
    const extraJs = Array.from({ length: DAWN_JS }, (_, i) => `module-${i + 1}.js`)
    for (const n of extraCss) t.files[`shopify/assets/${n}`] = `.c-${n.replace(/\W/g, "")}{color:inherit}\n`.repeat(200)
    for (const n of extraJs) t.files[`shopify/assets/${n}`] = `window.__mods=(window.__mods||0)+1;\n`
    t.files["layout/theme.storelib"] = t.files["layout/theme.storelib"]
      .replace("{{ 'base.css' | asset_url | stylesheet_tag }}", `{{ 'base.css' | asset_url | stylesheet_tag }}\n${extraCss.map((n) => `{{ '${n}' | asset_url | stylesheet_tag }}`).join("\n")}`)
      .replace(`<script src="{{ 'theme.js' | asset_url }}" defer></script>`, `<script src="{{ 'theme.js' | asset_url }}" defer></script>\n${extraJs.map((n) => `<script src="{{ '${n}' | asset_url }}" defer></script>`).join("\n")}`)
    const sources = Object.fromEntries(Object.entries(t.files).filter(([p]) => p.endsWith(".storelib")))
    const files = Object.fromEntries(Object.entries(t.files).filter(([p, v]) => p.startsWith("shopify/") && !v.startsWith("base64:")))
    const pages = Object.fromEntries(t.pages.map((p) => [p.page_key, p.sections]))
    for (const [p, v] of Object.entries(t.files)) if (p.startsWith("shopify/assets/")) assetText[p.slice("shopify/assets/".length)] = v
    const { products, menus } = shop()
    const probeProducts = products.map((p) => ({ id: p.id, title: p.settings.title, slug: p.settings.slug, status: "published", price: 39, type: "physical" }))
    globals += `window.PROBE_COMPAT=${JSON.stringify({ settings: t.settings, pages, sources, files }).replace(/</g, "\\u003c")};window.PROBE_PRODUCTS=${JSON.stringify(probeProducts)};window.PROBE_STORE_MENUS=${JSON.stringify({ available: true, stored: true, menus })};`
  } else {
    globals += `window.PROBE_PAGES=${JSON.stringify(STORELIB_PAGES)};window.PROBE_PAGE_DELAY_MS=0;`
  }
  globals += extraGlobals
  const assets: string[] = []
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>${css}</style></head><body><div id="app"></div><script>${globals}</script><script src="/editor-probe.js"></script></body></html>`)
      return
    }
    if (url.pathname === "/editor-probe.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" })
      res.end(readFileSync(bundle))
      return
    }
    const asset = url.pathname.match(/^\/api\/site-theme\/assets\/[^/]+\/[^/]+\/(.+)$/)
    if (asset) {
      const name = decodeURIComponent(asset[1])
      assets.push(name)
      await sleep(ASSET_MS)
      const text = assetText[name]
      if (text === undefined) { res.writeHead(404, { "Access-Control-Allow-Origin": "*" }); res.end(); return }
      /* As the route answers the builder's own copy (version "edit"). */
      res.writeHead(200, { "Content-Type": name.endsWith(".css") ? "text/css" : "text/javascript", "Access-Control-Allow-Origin": "*", "Cache-Control": "private, max-age=0, must-revalidate" })
      res.end(text)
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  return { base, server, assets, close: () => server.close() }
}

async function open(browser: Browser, s: Served, size: "desktop" | "phone"): Promise<Page> {
  const page = await browser.newPage()
  const phone = size === "phone"
  await page.setViewport(phone ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1440, height: 900 })
  if (phone) {
    const cdp = await page.createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  }
  await page.evaluateOnNewDocument("window.__name = (f) => f")
  /* PROFILE: every request of the first load, from the navigation, for the waterfall. */
  if (process.env.PROFILE) await page.evaluateOnNewDocument(`window.__loads=[];(function(){var f=window.fetch;window.fetch=function(){var a=arguments,t=performance.now();return f.apply(this,a).then(function(r){window.__loads.push(String(a[0]).replace(/^https?:..[^/]+/,"").slice(0,70)+" "+Math.round(t)+".."+Math.round(performance.now()));return r})};new PerformanceObserver(function(l){l.getEntries().forEach(function(e){if(e.duration>=50)window.__loads.push("long "+Math.round(e.startTime)+"+"+Math.round(e.duration))})}).observe({type:"longtask"})})()`)
  page.on("pageerror", (e) => console.log("    editor error:", String(e).slice(0, 200)))
  if (process.env.DEBUG) page.on("console", (m) => { if (m.type() === "error" || m.type() === "warn") console.log("    console:", m.text().slice(0, 1500)) })
  /* The sections' pictures (render-editor-probe.tsx's placeholder address): a picture, after IMG_MS, as a network brings one. */
  await page.setRequestInterception(true)
  page.on("request", (req) => {
    if (!req.url().startsWith("https://example.invalid/")) { void req.continue(); return }
    setTimeout(() => void req.respond({ status: 200, contentType: "image/png", headers: { "Access-Control-Allow-Origin": "*" }, body: PICTURE }).catch(() => {}), IMG_MS)
  })
  await page.goto(s.base, { waitUntil: "domcontentloaded" })
  return page
}

/* ── what the canvas shows ────────────────────────────────────────────────── */

/** In the page: the canvas settled on `want` (a Storelib page's section types, or an imported page's path). */
const SETTLED = `window.__settledOn = function (kind, want, drawnOnly) {
  if (kind === "storelib") {
    var root = document.getElementById("wb-preview-root")
    if (!root || (!drawnOnly && document.querySelector("[data-canvas-still]"))) return false
    var types = Array.prototype.map.call(root.querySelectorAll("[data-section-box][id^='wb-section-']"), function (b) { return b.getAttribute("data-section-type") }).filter(function (t) { return t !== "header" && t !== "footer" && t !== "breadcrumbs" })
    return types.join(",") === want
  }
  var front = document.querySelector("[data-compat-frame='front']")
  if (!front || (!drawnOnly && document.querySelector("[data-compat-frame='leaving']"))) return false
  var ph = document.querySelector("[data-canvas-placeholder]")
  if (ph && ph.getAttribute("data-canvas-placeholder") !== "gone") return false
  return (front.getAttribute("srcdoc") || "").indexOf("window.__slPath=" + JSON.stringify(want) + ";") >= 0
}`

const wantOf = (kind: Kind, key: string) => (kind === "storelib" ? STORELIB_PAGES[key].filter((t) => t !== "header" && t !== "footer").join(",") : key === "home" ? "/" : `/pages/${key}`)

async function firstLoad(page: Page, kind: Kind): Promise<number> {
  await page.evaluate(SETTLED)
  if (process.env.DEBUG) {
    await sleep(8000)
    await page.screenshot({ path: `${OUT}/debug-${kind}.png` })
    console.log(await page.evaluate(() => ({ boxes: [...document.querySelectorAll("[data-section-box][id^='wb-section-']")].map((b) => b.getAttribute("data-section-type")).join(","), still: !!document.querySelector("[data-canvas-still]"), root: !!document.getElementById("wb-preview-root"), front: !!document.querySelector("[data-compat-frame='front']"), ph: document.querySelector("[data-canvas-placeholder]")?.getAttribute("data-canvas-placeholder"), path: (document.querySelector("[data-compat-frame='front']")?.getAttribute("srcdoc") ?? "").match(/__slPath=[^;]*/)?.[0] })))
  }
  await page.waitForFunction((k, w) => (window as unknown as { __settledOn: (k: string, w: string) => boolean }).__settledOn(k, w), { timeout: 30000, polling: "raf" }, kind, wantOf(kind, "home"))
  return page.evaluate(() => Math.round(performance.now()))
}

/** The last switch: when the new page was first in the canvas (under the copy of the page left, or in front of it while it fades), and when it was settled. */
let lastDrawn = 0
async function switchTo(page: Page, kind: Kind, key: string, size: "desktop" | "phone"): Promise<number> {
  /* The list of pages: the top bar's switcher at a computer, the sheet's page button on a phone. */
  if (size === "desktop") {
    await page.waitForSelector("[data-page-switcher]:not([disabled])", { timeout: 15000 })
    await page.click("[data-page-switcher]")
  } else {
    /* The sheet's Pages tab, which is the phone's page list. */
    const tab = await page.evaluateHandle(() => [...document.querySelectorAll<HTMLButtonElement>("button")].find((x) => (x.textContent ?? "").trim() === "Pages" && x.getBoundingClientRect().height > 0) ?? null)
    const box = await (tab.asElement() as import("puppeteer-core").ElementHandle<Element> | null)?.boundingBox()
    if (!box) throw new Error("no Pages tab on the phone")
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
    await sleep(700)
  }
  const row = `[data-page-row='${key}']`
  await page.waitForSelector(row, { timeout: 10000 })
  /* A row in a group that is shut: the group opened first, as a hand would. */
  await page.evaluate((sel) => {
    const r = document.querySelector(sel)
    const toggle = r?.closest("[data-page-group]")?.querySelector<HTMLElement>("[data-page-group-toggle][aria-expanded='false']")
    toggle?.click()
  }, row)
  await page.waitForSelector(row, { visible: true, timeout: 10000 })
  await sleep(250)
  await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: "nearest" }), row)
  /* The pointer on the row for a moment before the press, as a hand does (a finger has none). */
  if (size === "desktop") {
    await page.hover(row)
    await sleep(HOVER_MS)
  }
  await page.evaluate((k, want) => {
    const w = window as unknown as { __pressAt?: number; __drawnAt?: number; __settledOn: (k: string, w: string, d?: boolean) => boolean }
    w.__pressAt = 0
    w.__drawnAt = 0
    document.addEventListener("pointerdown", () => { w.__pressAt = performance.now() }, { capture: true, once: true })
    document.addEventListener("click", () => { if (!w.__pressAt) w.__pressAt = performance.now() }, { capture: true, once: true })
    /* Where the time goes, for PROFILE=1: the main thread's long tasks and the routes asked for, from the press. */
    ;(window as unknown as { __long: string[] }).__long = []
    if (!(window as unknown as { __obs?: boolean }).__obs) {
      ;(window as unknown as { __obs?: boolean }).__obs = true
      new PerformanceObserver((l) => { for (const e of l.getEntries()) { const t0 = (window as unknown as { __pressAt: number }).__pressAt; if (t0 && e.startTime >= t0 - 5) (window as unknown as { __long: string[] }).__long.push(`${Math.round(e.startTime - t0)}+${Math.round(e.duration)}`) } }).observe({ type: "longtask", buffered: false })
      const f = window.fetch
      window.fetch = (async (...args: Parameters<typeof fetch>) => {
        const t0 = (window as unknown as { __pressAt: number }).__pressAt
        const at = performance.now()
        const r = await f(...args)
        if (t0) (window as unknown as { __long: string[] }).__long.push(`fetch ${String(args[0]).slice(0, 60)} ${Math.round(at - t0)}..${Math.round(performance.now() - t0)}`)
        return r
      }) as typeof fetch
    }
    const tick = () => {
      if (w.__pressAt && w.__settledOn(k, want, true)) { w.__drawnAt = performance.now() - w.__pressAt; return }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, kind, wantOf(kind, key))
  if (size === "phone") {
    await page.$eval(row, (el) => el.scrollIntoView({ block: "center" }))
    await sleep(300)
    const box = await (await page.$(row))!.boundingBox()
    if (!box) throw new Error(`no box for ${row}`)
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
  } else await page.click(row)
  const at = await page.waitForFunction((k, w) => {
    const win = window as unknown as { __settledOn: (k: string, w: string) => boolean; __pressAt: number }
    return win.__settledOn(k, w) ? performance.now() - win.__pressAt : 0
  }, { timeout: 30000, polling: "raf" }, kind, wantOf(kind, key))
  lastDrawn = Math.round(await page.evaluate(() => (window as unknown as { __drawnAt: number }).__drawnAt))
  if (process.env.PROFILE) console.log(`      ${key}: ${(await page.evaluate(() => (window as unknown as { __long: string[] }).__long)).join(" | ")}`)
  if (process.env.PROFILE && kind === "compat") console.log(`      frames: ${await page.evaluate(() => [...document.querySelectorAll("[data-compat-frame]")].map((f) => `${f.getAttribute("data-compat-frame")}:${(f.getAttribute("srcdoc") ?? "").match(/__slPath=([^;]*)/)?.[1]}`).join(" "))}`)
  return Math.round(Number(await at.jsonValue()))
}

async function speed(browser: Browser) {
  console.log(`\nspeed: every route ${API_MS}ms, an imported theme's files ${ASSET_MS}ms each, ${HOVER_MS}ms on a row before the press`)
  const routes: Record<Kind, string[]> = { storelib: ["about", "contact", "home", "about", "contact"], compat: ["contact", "page", "home", "contact", "page"] }
  const report: Record<string, unknown> = {}
  for (const kind of (process.env.KIND ? [process.env.KIND as Kind] : ["storelib", "compat"] as const)) {
    for (const size of sizes) {
      const s = await serve(kind)
      try {
        const page = await open(browser, s, size)
        let step = "first load"
        const shot = async () => {
          await page.screenshot({ path: `${OUT}/stuck-${kind}-${size}.png` }).catch(() => {})
          return page.evaluate(() => ({ boxes: [...document.querySelectorAll("[data-section-box][id^='wb-section-']")].map((b) => b.getAttribute("data-section-type")).join(","), still: !!document.querySelector("[data-canvas-still]"), front: (document.querySelector("[data-compat-frame='front']")?.getAttribute("srcdoc") ?? "").match(/__slPath=[^;]*/)?.[0] ?? null, leaving: !!document.querySelector("[data-compat-frame='leaving']"), ph: document.querySelector("[data-canvas-placeholder]")?.getAttribute("data-canvas-placeholder") ?? null, rows: [...document.querySelectorAll("[data-page-row]")].map((r) => r.getAttribute("data-page-row")).join(",") })).catch(() => null)
        }
        try {
        const first = await firstLoad(page, kind)
        if (process.env.PROFILE) console.log(`      first load: ${(await page.evaluate(() => (window as unknown as { __loads: string[] }).__loads)).join(" | ")}`)
        const loadAssets = s.assets.length
        await sleep(1500)
        const times: number[] = []
        const drawn: number[] = []
        const files: number[] = []
        const route = routes[kind]
        for (const key of route) {
          const before = s.assets.length
          step = `switch to ${key}`
          times.push(await switchTo(page, kind, key, size))
          drawn.push(lastDrawn)
          await sleep(1200)
          files.push(s.assets.length - before)
        }
        await page.screenshot({ path: `${OUT}/speed-${kind}-${size}.png` })
        const revisits = times.slice(2)
        report[`${kind}-${size}`] = { first, drawn, settled: times, files }
        console.log(`  ${kind.padEnd(8)} ${size.padEnd(7)} first load ${first}ms${kind === "compat" ? ` (${loadAssets} theme files)` : ""}; switches (drawn/settled) ${route.map((k, i) => `${k} ${drawn[i]}/${times[i]}ms${kind === "compat" ? ` ${files[i]} files` : ""}`).join(", ")}`)
        /* Settled: the new page whole, the page left gone from over it (an imported theme's fade, a Storelib theme's copy). */
        const budget = size === "phone" ? 1000 : 600
        check(`${kind} ${size}: a page visited before is settled within ${budget}ms of the press`, Math.max(...revisits) <= budget, `${revisits.join(", ")} ms`)
        if (kind === "compat") check(`${kind} ${size}: a page visited before asks the server for none of the theme's files`, files.slice(2).every((n) => n === 0), files)
        } catch (e) {
          check(`${kind} ${size}: ${step}`, false, { error: String(e).slice(0, 120), state: await shot() })
        }
        await page.close()
      } finally {
        s.close()
      }
    }
  }
  console.log(`  ${JSON.stringify(report)}`)
}

/* ── the picture field and the colour scheme field ─────────────────────────── */

/** The two controls in a sidebar-wide column (scripts/render-builder25.tsx), served with the app's stylesheet. */
async function serveFields(): Promise<{ base: string; close: () => void; asked: string[] }> {
  const { css } = (await import("./editor-probe-harness.mjs")) as { css: string }
  const { interFaces } = (await import("./probe-css.mjs")) as { interFaces: () => string }
  const { execFileSync } = await import("node:child_process")
  const { join } = await import("node:path")
  const root = process.cwd()
  const out = join(OUT, "fields.js")
  const stubs = join(root, ".wb-probe")
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-builder25.tsx"), "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${out}`,
    '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
    `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/image=${join(stubs, "image.jsx")}`,
    `--alias:@/lib/supabase/client=${join(stubs, "supabase-client.js")}`, `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"], { stdio: ["ignore", "ignore", "inherit"] })
  const sharp = (await import("sharp")).default
  const picture = await sharp({ create: { width: 96, height: 96, channels: 3, background: { r: 200, g: 120, b: 60 } } }).png().toBuffer()
  const asked: string[] = []
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    asked.push(url.pathname)
    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html" })
      /* Inter from the build, served here: a page on http may not load a file:// font. */
      const faces = interFaces().replace(/url\(file:\/\/([^)]+)\)/g, (_m, f) => `url(/font?f=${encodeURIComponent(f)})`)
      res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${faces}\n${css}</style><style>body{margin:0;background:#f4f4f5;font-family:Inter,ui-sans-serif,system-ui,sans-serif}</style></head><body><div id="root"></div><script>window.PROBE_PICTURES=location.origin;window.PROBE_COLUMN=window.PROBE_COLUMN_OVERRIDE||262</script><script src="/fields.js"></script></body></html>`)
      return
    }
    if (url.pathname === "/font") {
      const f = url.searchParams.get("f") ?? ""
      if (!/\/\.next\/static\/media\/[\w.-]+\.woff2$/.test(f)) { res.writeHead(404); res.end(); return }
      res.writeHead(200, { "Content-Type": "font/woff2" })
      res.end(readFileSync(f))
      return
    }
    if (url.pathname === "/fields.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(readFileSync(out)); return }
    if (url.pathname === "/ok.png" || url.pathname === "/logo.png") { res.writeHead(200, { "Content-Type": "image/png" }); res.end(picture); return }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok))
  return { base: `http://127.0.0.1:${(server.address() as { port: number }).port}`, close: () => server.close(), asked }
}

/** The sidebar's width at a computer, and a phone's sheet. */
const COLUMN = { desktop: 262, phone: 390 } as const

async function fieldsPage(browser: Browser, size: "desktop" | "phone"): Promise<{ page: Page; asked: string[]; close: () => void }> {
  const served = await serveFields()
  const page = await browser.newPage()
  const phone = size === "phone"
  await page.setViewport(phone ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1440, height: 900 })
  if (phone) await (await page.createCDPSession()).send("Emulation.setCPUThrottlingRate", { rate: 4 })
  page.on("pageerror", (e) => console.log("    page error:", String(e).slice(0, 200)))
  await page.evaluateOnNewDocument(`window.PROBE_COLUMN_OVERRIDE=${COLUMN[size]}`)
  await page.goto(served.base, { waitUntil: "domcontentloaded" })
  return { page, asked: served.asked, close: served.close }
}

type Problem = { text: string; size: string; color: string; weight: string; height: number; mark: boolean } | null
async function picker(browser: Browser) {
  console.log("\npicture field")
  for (const size of sizes) {
    const { page, asked, close } = await fieldsPage(browser, size)
    try {
      await page.waitForSelector("[data-probe-field='ok'] [data-wb-image-layer='stored']", { timeout: 15000 })
      const read = (id: string) => page.evaluate((id) => {
        const f = document.querySelector(`[data-probe-field='${id}']`)!
        const p = f.querySelector<HTMLElement>("[data-wb-image-problem]")
        const cs = p ? getComputedStyle(p) : null
        const img = f.querySelector<HTMLImageElement>("[data-wb-image-layer='stored']")
        return {
          problem: p && cs ? { text: (p.textContent ?? "").trim(), size: cs.fontSize, color: cs.color, weight: cs.fontWeight, height: Math.round(p.getBoundingClientRect().height), mark: !!f.querySelector("[data-wb-image-layer='missing'] svg.lucide-image-off, [data-wb-image-layer='missing'] svg") } : null,
          loaded: !!img && img.complete && img.naturalWidth > 0,
          src: img?.getAttribute("src") ?? null,
        }
      }, id) as Promise<{ problem: Problem; loaded: boolean; src: string | null }>
      /* The sidebar's muted grey (below), and at once, with no request: an old store's picture the theme did not bring. */
      const muted = (c: string | undefined) => { const o = /oklch\(([\d.]+)/.exec(c ?? ""); if (o) return Number(o[1]) > 0.35 && Number(o[1]) < 0.65; const m = /rgba?\((\d+), (\d+), (\d+)/.exec(c ?? ""); return !!m && Number(m[1]) > 80 && Number(m[1]) < 160 }
      const oldStore = await read("favicon-old-store")
      check(`${size}: a favicon the theme did not bring says so at once, small and muted`, oldStore.problem?.text === "Upload it again" && oldStore.problem.size === "13px" && oldStore.problem.height <= 20 && oldStore.problem.weight === "400" && oldStore.problem.mark && muted(oldStore.problem.color), oldStore.problem ?? "no line")
      check(`${size}:   and no request is made for an address no picture can be loaded from`, !asked.some((a) => /shop_images|shopify/.test(a)), asked.filter((a) => a !== "/" && a !== "/fields.js"))
      /* One the theme did bring: its own copy, shown. */
      await page.waitForFunction(() => { const i = document.querySelector<HTMLImageElement>("[data-probe-field='logo-old-store'] [data-wb-image-layer='stored']"); return !!i && i.complete && i.naturalWidth > 0 }, { timeout: 10000 }).catch(() => {})
      const brought = await read("logo-old-store")
      check(`${size}: a picture the theme brought is shown from its own copy`, brought.loaded && /\/logo\.png$/.test(brought.src ?? "") && !brought.problem, brought)
      const ok = await read("ok")
      check(`${size}: a picture that loads shows, with no line`, ok.loaded && !ok.problem, ok)
      /* A picture that will not load: asked twice, then the line. */
      await page.waitForSelector("[data-probe-field='missing'] [data-wb-image-problem]", { timeout: 10000 }).catch(() => {})
      const missing = await read("missing")
      check(`${size}: a picture that cannot be loaded: one muted 13px line beside the broken picture mark`, missing.problem?.text === "Couldn't load it" && missing.problem.size === "13px" && missing.problem.height <= 20 && muted(missing.problem.color) && missing.problem.mark, missing.problem ?? "no line")
      await page.waitForSelector("[data-probe-field='settings-favicon'] [data-wb-image-problem]", { timeout: 10000 }).catch(() => {})
      const box = await read("settings-favicon")
      check(`${size}: Website settings' favicon box says the same in the same size`, box.problem?.text === "Couldn't load this picture" && box.problem.size === "13px" && box.problem.height <= 20 && muted(box.problem.color), box.problem ?? "no line")
      const col = await page.$("[data-probe-column]")
      await col!.screenshot({ path: `${OUT}/picker-${size}.png` })
    } finally {
      await page.close()
      close()
    }
  }
}

async function schemes(browser: Browser) {
  console.log("\ncolour scheme field")
  for (const size of sizes) {
    const { page, close } = await fieldsPage(browser, size)
    try {
      await page.waitForSelector("[data-scheme-field]", { timeout: 15000 })
      await page.$eval("[data-probe-field='schemes']", (el) => el.scrollIntoView({ block: "start" }))
      const closed = await page.evaluate(() => {
        const f = document.querySelector<HTMLElement>("[data-scheme-field]")!
        const r = f.getBoundingClientRect()
        const sw = f.querySelector<HTMLElement>("[data-scheme-swatch]")!
        return { h: Math.round(r.height), w: Math.round(r.width), text: (f.textContent ?? "").replace("Aa", "").trim(), swatch: getComputedStyle(sw).backgroundColor, cards: document.querySelectorAll("[data-theme-schemes] [role='radio']").length, size: getComputedStyle(f.querySelector("span.truncate")!).fontSize }
      })
      check(`${size}: one row the height of the sidebar's selects, the chosen scheme's swatch and name`, closed.cards === 0 && closed.h <= (size === "phone" ? 44 : 36) && closed.text === "Scheme 4" && closed.swatch === "rgb(18, 18, 18)", closed)
      await page.screenshot({ path: `${OUT}/schemes-closed-${size}.png`, clip: await page.$eval("[data-probe-field='schemes']", (el) => { const r = el.getBoundingClientRect(); return { x: 0, y: Math.max(0, r.top - 8), width: Math.min(innerWidth, r.right + 12), height: r.height + 16 } }) })
      if (size === "phone") {
        const b = await (await page.$("[data-scheme-field]"))!.boundingBox()
        await page.touchscreen.tap(b!.x + b!.width / 2, b!.y + b!.height / 2)
      } else await page.click("[data-scheme-field]")
      await page.waitForSelector("[role='listbox'] [data-scheme-row]", { visible: true, timeout: 5000 })
      await sleep(600)
      const list = await page.evaluate(() => {
        const rows = [...document.querySelectorAll<HTMLElement>("[role='listbox'] [data-scheme-row]")]
        const boxes = rows.map((r) => r.getBoundingClientRect())
        return { n: rows.length, xs: [...new Set(boxes.map((b) => Math.round(b.left)))], hs: [...new Set(boxes.map((b) => Math.round(b.height)))], oneEach: boxes.every((b, i) => i === 0 || b.top >= boxes[i - 1].bottom - 1), chosen: rows.find((r) => r.getAttribute("aria-selected") === "true")?.textContent?.replace("Aa", "").trim() }
      })
      check(`${size}: it opens a list, one scheme a line, the chosen one marked`, list.n === 12 && list.xs.length === 1 && list.oneEach && list.chosen === "Scheme 4", list)
      await page.screenshot({ path: `${OUT}/schemes-open-${size}.png` })
      const row = "[role='listbox'] [data-scheme='scheme-7']"
      await page.$eval(row, (el) => el.scrollIntoView({ block: "center" }))
      await sleep(200)
      if (size === "phone") {
        const b = await (await page.$(row))!.boundingBox()
        await page.touchscreen.tap(b!.x + b!.width / 2, b!.y + b!.height / 2)
      } else await page.click(row)
      await sleep(700)
      const after = await page.evaluate(() => ({ text: (document.querySelector("[data-scheme-field]")?.textContent ?? "").replace("Aa", "").trim(), open: !!document.querySelector("[role='listbox'] [data-scheme-row]") && [...document.querySelectorAll("[role='listbox']")].some((l) => (l as HTMLElement).getBoundingClientRect().height > 0) }))
      check(`${size}: a scheme picked is the field's, and the list closes`, after.text === "Scheme 7" && !after.open, after)
    } finally {
      await page.close()
      close()
    }
  }
}

/* ── main ─────────────────────────────────────────────────────────────────── */

void (async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 120_000, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
  try {
    if (want("picker")) await picker(browser)
    if (want("schemes")) await schemes(browser)
    if (want("speed")) await speed(browser)
  } catch (e) {
    failed++
    console.log("  FAIL ", String(e).slice(0, 400))
  } finally {
    await browser.close()
  }
  console.log(failed ? `\n${failed} failed` : "\nall passed")
  process.exit(failed ? 1 : 0)
})()
