/**
 * ===========================================================================
 *  THE MARKETPLACE'S PREVIEW, ON THE TEMPLATE'S REAL WEBSITE, MEASURED
 * ===========================================================================
 * The real Website page (scripts/render-theme-popup-probe.tsx, as
 * scripts/check-theme-popup.mjs mounts it) in Chromium, with the files in
 * public/theme-previews served as next.config.mjs serves them (the CORS
 * header, the sandbox and frame-ancestors). Run
 * scripts/build-template-previews.ts first.
 *
 *   AT 1440 x 900
 *   • a template's cover opens the preview on its pictures at once, with a
 *     line moving along the top while the website loads
 *   • the frame is sandboxed with scripts only, the template's home page,
 *     the stage's whole width, the theme's desktop layout; it fades in over
 *     the pictures, which are then inert
 *   • a product link inside it opens the product's page in the frame
 *   • Add to cart there adds nothing: no request leaves the frame
 *   • Phone reflows the same page in a 390px frame: the theme's own phone
 *     layout (its width is 390 inside, nothing runs off the side), not a
 *     picture made smaller
 *   AT 390 x 844, a phone
 *   • the preview opens on the phone layout, the whole screen wide
 *   EVERYWHERE
 *   • no script error and no console error in the page or the frame; every
 *     file the website asks for is a 200 from /theme-previews/
 *
 *   node scripts/check-theme-preview-live.mjs [template-slug]      SHOTS=dir saves pictures
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { extname, join, normalize } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const SLUG = process.argv[2] ?? "clothing"
const out = mkdtempSync(join(tmpdir(), "storelib-preview-live-"))
const SHOTS = process.env.SHOTS || ""
const fail = (m) => {
  console.error(m)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)
if (!existsSync(join(root, "public/theme-previews", SLUG, "index.html"))) fail(`No public/theme-previews/${SLUG}/index.html. Run npx tsx scripts/build-template-previews.ts first.`)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === "" ? "" : `   ${got}`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const css = (await appCss(root, join(root, "app/globals.css"))) + "\n" + interFaces(root)
const stubs = join(root, ".theme-preview-live-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, replace, scroll, ...rest }) {
  return React.createElement("a", { href: String(href), ...rest }, children)
}
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => window.location.pathname
export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {} })
export const useSearchParams = () => new URLSearchParams(window.location.search)
`)
writeFileSync(join(stubs, "toast.js"), `export const useToast = () => ({ toast(t) { (window.__toasts = window.__toasts || []).push(t.title) } })
`)
writeFileSync(join(stubs, "navbar.js"), `export const startNavigationLoading = () => {}
export const NavigationLoadingBar = () => null
`)

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".gif": "image/gif" }
/* What the frame asked the network for: every one should be a file under /theme-previews/. */
const asked = []

let browser
try {
  const liveJs = join(out, "live.js")
  try {
    execFileSync(
      "npx",
      ["--no-install", "esbuild", join(root, "scripts/render-theme-popup-probe.tsx"), "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${liveJs}`,
        '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
        '--define:process.env.NODE_ENV="production"', "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl",
        `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@/hooks/use-toast=${join(stubs, "toast.js")}`, `--alias:@/components/app/navigation-loading-bar=${join(stubs, "navbar.js")}`, `--alias:@=${root}`],
      { stdio: ["ignore", "ignore", "inherit"] },
    )
  } catch {
    fail("The probe did not bundle. The error above is esbuild's.")
  }
  const js = readFileSync(liveJs)
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style><style>*{box-sizing:border-box}html,body{height:100%;margin:0;overflow:hidden}body{background:#f8f9fa;font-family:Inter,system-ui,sans-serif}#root{height:100dvh}</style>`
  const pub = join(root, "public")
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://x")
    if (url.pathname.startsWith("/theme-previews/")) {
      asked.push(url.pathname)
      const file = normalize(join(pub, decodeURIComponent(url.pathname)))
      if (!file.startsWith(pub) || !existsSync(file) || statSync(file).isDirectory()) {
        res.writeHead(404, { "access-control-allow-origin": "*" })
        return res.end()
      }
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "access-control-allow-origin": "*", "content-security-policy": "sandbox allow-scripts; frame-ancestors 'self'" })
      return res.end(readFileSync(file))
    }
    if (url.pathname.startsWith("/themes/") && /^[\w/.-]+$/.test(url.pathname) && existsSync(join(pub, url.pathname))) {
      res.writeHead(200, { "content-type": "image/webp" })
      return res.end(readFileSync(join(pub, url.pathname)))
    }
    if (url.pathname === "/cover.svg" || url.pathname === "/_next/image") {
      res.writeHead(200, { "content-type": "image/svg+xml" })
      return res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="2400"><rect width="1280" height="2400" fill="#e9e3d9"/></svg>`)
    }
    if (url.pathname === "/live.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js) }
    if (url.pathname.startsWith("/api/")) { res.writeHead(404, { "content-type": "application/json" }); return res.end("{}") }
    if (url.pathname !== "/app/website-builder") { res.writeHead(404); return res.end() }
    res.writeHead(200, { "content-type": "text/html" })
    res.end(`<!doctype html><html><head>${head}</head><body><div id="root"></div><script src="/live.js"></script></body></html>`)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const origin = `http://127.0.0.1:${server.address().port}`

  browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
  const problems = []
  const open = async (W, H) => {
    const p = await browser.newPage()
    const phone = W < 768
    await p.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: phone, hasTouch: phone })
    p.on("pageerror", (e) => problems.push(`${W} script error: ${String(e).slice(0, 200)}`))
    p.on("console", (m) => { if (m.type() === "error") problems.push(`${W} console: ${m.text().slice(0, 200)} ${m.location()?.url?.slice(0, 100) ?? ""}`) })
    /* A page left while its scripts were still arriving cancels them: that is a navigation, not a failure. */
    p.on("requestfailed", (r) => r.failure()?.errorText !== "net::ERR_ABORTED" && problems.push(`${W} failed: ${r.url().slice(0, 140)} ${r.failure()?.errorText}`))
    p.on("response", (r) => { if (r.status() >= 400) problems.push(`${W} ${r.status()}: ${r.url().slice(0, 140)}`) })
    await p.goto(`${origin}/app/website-builder`, { waitUntil: "networkidle0", timeout: 60_000 })
    await p.waitForSelector("[data-wb-page]")
    await sleep(150)
    return p
  }
  const shot = async (p, name) => {
    if (SHOTS) await p.screenshot({ path: join(SHOTS, `${name}.png`) })
  }
  const frameOf = (p) => p.frames().find((f) => f.url().includes("/theme-previews/"))
  const stage = (p) =>
    p.evaluate(() => {
      const live = document.querySelector("[data-preview-live]")
      const iframe = live?.querySelector("iframe")
      const box = live?.querySelector("[data-preview-live-frame]")?.getBoundingClientRect()
      const stageBox = document.querySelector("[data-preview-stage]")?.getBoundingClientRect()
      return live
        ? {
            state: live.getAttribute("data-preview-live"),
            opacity: +getComputedStyle(live).opacity,
            sandbox: iframe.getAttribute("sandbox"),
            referrer: iframe.getAttribute("referrerpolicy"),
            src: iframe.getAttribute("src"),
            frame: box ? [box.width, box.height].map(Math.round) : null,
            stage: stageBox ? Math.round(stageBox.width) : null,
            loader: +getComputedStyle(document.querySelector("[data-preview-live-loading]")).opacity,
            shotsInert: [...document.querySelectorAll("[data-preview-layer]")].every((l) => l.inert),
          }
        : null
    })
  const inside = (f) =>
    f.evaluate(() => ({
      path: location.pathname,
      width: innerWidth,
      sideways: document.documentElement.scrollWidth - innerWidth,
      title: document.title,
      h1: document.querySelector("h1")?.textContent.trim().slice(0, 60) ?? null,
      sections: document.querySelectorAll("[id^='shopify-section-']").length,
      broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc).map((i) => i.currentSrc.slice(-60)),
      phoneMenu: [...document.querySelectorAll("header button, header [aria-controls], header summary")].some((b) => b.getBoundingClientRect().width > 0 && /menu|drawer|nav/i.test(`${b.getAttribute("aria-label") ?? ""} ${b.className ?? ""} ${b.getAttribute("aria-controls") ?? ""}`)),
    }))
  /* The template's cover on the page, or in the marketplace when the page shows only the first few. */
  const coverOf = async (p, phone) => {
    const own = `[data-theme-grid] [data-template-card='${SLUG}'] [data-template-preview]`
    if (await p.$(own)) return own
    await p.$eval("[data-theme-marketplace-open='heading']", (b) => b.scrollIntoView({ block: "center" }))
    if (phone) await p.tap("[data-theme-marketplace-open='heading']")
    else await p.click("[data-theme-marketplace-open='heading']")
    await sleep(500)
    return `[data-themes-grid] [data-template-card='${SLUG}'] [data-template-preview]`
  }

  /* ══ 1440 ════════════════════════════════════════════════════════════════ */
  {
    console.log(`\nThe live preview of ${SLUG}, 1440 x 900\n`)
    const p = await open(1440, 900)
    const cover = await coverOf(p, false)
    await p.$eval(cover, (b) => b.scrollIntoView({ block: "center" }))
    await sleep(80)
    const t0 = Date.now()
    await p.click(cover)
    await sleep(120)
    const early = await stage(p)
    const shotsEarly = await p.evaluate(() => [...document.querySelectorAll("[data-preview-layer] img")].map((i) => i.getAttribute("src")))
    await shot(p, "live-1440-opening")
    expect(!!early && early.sandbox === "allow-scripts" && early.referrer === "no-referrer" && early.src === `/theme-previews/${SLUG}/index.html`, "the preview frames the template's own website, sandboxed with scripts only", JSON.stringify(early && { sandbox: early.sandbox, src: early.src }))
    expect(shotsEarly.length === 2 && early.loader > 0.9, "its pictures are there at once, with the loading line over them", `${shotsEarly.join(", ")}, line ${early?.loader}`)
    await p.waitForFunction(() => document.querySelector("[data-preview-live]")?.getAttribute("data-preview-live") === "ready", { timeout: 20_000 }).catch(() => null)
    const readyMs = Date.now() - t0
    await sleep(400)
    const ready = await stage(p)
    expect(ready?.state === "ready" && ready.opacity === 1 && ready.loader === 0 && ready.shotsInert, "the website fades in over them once it has drawn; the pictures under it are inert", `${readyMs}ms to ready, ${JSON.stringify(ready)}`)
    let f = frameOf(p)
    const home = f ? await inside(f) : null
    expect(!!home && home.path === `/theme-previews/${SLUG}/index.html` && home.sections >= 3 && home.broken.length === 0, "it is the home page, every section drawn, every picture loaded", JSON.stringify(home))
    expect(!!home && Math.abs(home.width - ready.stage) <= 1 && ready.frame[0] === ready.stage && home.sideways <= 0, "at the stage's whole width: the theme's desktop layout", `${home?.width}px inside, stage ${ready?.stage}px`)
    await shot(p, "live-1440-home")

    /* A product, inside the frame. */
    /* A product on the home page, or, for a home page with none (a creator's), through a collection. */
    const linkTo = (frame, part) => frame.evaluate((q) => [...document.querySelectorAll(`a[href*='${q}']`)].find((a) => a.getBoundingClientRect().width > 0)?.getAttribute("href") ?? [...document.querySelectorAll(`a[href*='${q}']`)][0]?.getAttribute("href") ?? null, part)
    const follow = async (href) => {
      await f.evaluate((h) => [...document.querySelectorAll("a")].find((a) => a.getAttribute("href") === h).click(), href)
      await sleep(2500)
      f = frameOf(p)
    }
    if (!(await linkTo(f, "/products/"))) await follow(await linkTo(f, "/collections/"))
    await follow(await linkTo(f, "/products/"))
    const product = f ? await inside(f) : null
    expect(!!product && product.path.includes("/products/") && !!product.h1 && product.broken.length === 0, "a product link opens the product's page inside the frame", JSON.stringify(product))
    await shot(p, "live-1440-product")

    /* Add to cart: nothing leaves the frame, nothing is bought. */
    const before = asked.length
    const add = await f.evaluate(() => {
      const b = [...document.querySelectorAll("button[name='add'], button[type='submit']")].find((x) => x.getBoundingClientRect().width > 0 && x.closest("[data-preview-form]"))
      b?.click()
      return !!b
    })
    await sleep(900)
    const after = await inside(f)
    expect(add && after.path === product.path && asked.slice(before).every((a) => a.startsWith("/theme-previews/")), "Add to cart stays on the page and asks the network for nothing but the preview's own files", `${asked.length - before} requests`)

    /* Phone: the same page, reflowed in a 390px frame. */
    await p.click("[data-preview-device='phone']")
    await sleep(500)
    const ph = await stage(p)
    const phone = await inside(f)
    await shot(p, "live-1440-phone")
    expect(ph.frame[0] === 390 && phone.width === 390 && phone.sideways <= 0 && phone.path === product.path, "Phone reflows the same page in a 390px frame, nothing off the side", `${ph.frame.join("x")} frame, ${phone.width}px inside, on ${phone.path}`)
    await p.click("[data-preview-device='desktop']")
    await sleep(500)
    const back = await inside(f)
    expect(back.width === ready.stage, "Desktop again: the whole width", `${back.width}px`)
    await p.keyboard.press("Escape")
    await sleep(450)
    expect((await p.$("[data-theme-preview]")) === null, "Escape closes it")
    await p.close()
  }

  /* ══ 390, a phone ══════════════════════════════════════════════════════ */
  {
    console.log(`\nThe live preview of ${SLUG}, 390 x 844 at 2x\n`)
    const p = await open(390, 844)
    const cover = await coverOf(p, true)
    await p.$eval(cover, (b) => b.scrollIntoView({ block: "center" }))
    await sleep(80)
    await p.tap(cover)
    await p.waitForFunction(() => document.querySelector("[data-preview-live]")?.getAttribute("data-preview-live") === "ready", { timeout: 20_000 }).catch(() => null)
    await sleep(500)
    const s = await stage(p)
    const f = frameOf(p)
    const home = f ? await inside(f) : null
    await shot(p, "live-390-home")
    expect(s?.state === "ready" && s.frame[0] === 390 && home?.width === 390 && home.sideways <= 0 && home.broken.length === 0, "on a phone it opens on the website's phone layout, the whole screen wide", JSON.stringify({ frame: s?.frame, home }))
    await p.close()
  }

  const foreign = asked.filter((a) => !a.startsWith("/theme-previews/"))
  /* The Website page's own calls (its stats, its covers) are answered by nothing here; they are not the preview's. */
  const ours = problems.filter((x) => !/\/api\/|favicon\.ico/.test(x))
  expect(ours.length === 0, "no script error, no console error, no failed request, page or frame", [...new Set(ours)].slice(0, 10).join(" | "))
  expect(foreign.length === 0 && asked.length > 20, "every file the website asked for came from /theme-previews/", `${asked.length} files`)
  server.close()
} finally {
  if (browser) await browser.close()
  rmSync(stubs, { recursive: true, force: true })
  rmSync(out, { recursive: true, force: true })
}

console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
process.exit(broken ? 1 : 0)
