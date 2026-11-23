/**
 * ===========================================================================
 *  THE PREVIEW'S PAGES: NO BLANK BETWEEN TWO, AND A NOTE ON ADD TO CART
 * ===========================================================================
 * The real Website page (scripts/render-theme-popup-probe.tsx) with the
 * marketplace's Preview open on a template's prerendered website
 * (public/theme-previews, run scripts/build-template-previews.ts first), in
 * headless Chromium, the CPU at a quarter and every page 120ms late.
 *
 *   BETWEEN PAGES   five links followed inside the frame (a product, a
 *                   collection, about, contact, home), every frame painted
 *                   recorded: none may show the frame with no page in it
 *                   (the lower 70% of it one flat colour). Before round 21
 *                   Night shop showed 102 such frames in five clicks.
 *   ADD TO CART     Add to cart and Buy now on a product page: a note near
 *   AND BUY NOW     the button ("Preview only: ..."), inside the screen,
 *                   no request beyond the preview's own files, nothing on
 *                   the page moved, no cart drawer, no error message, and
 *                   gone again after four seconds.
 *
 *   node scripts/check-template-preview-pages.mjs [slug] [width]     (space-clothing 1440)
 */
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { extname, join, normalize } from "node:path"
import { appCss, interFaces } from "./probe-css.mjs"
const root = process.cwd()
const B1 = mkdtempSync(join(tmpdir(), "storelib-preview-pages-"))
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".gif": "image/gif" }
async function startHost({ delayMs = 0 } = {}) {
  const css = (await appCss(root, join(root, "app/globals.css"))) + "\n" + interFaces(root)
  const stubs = join(B1, "stubs"); mkdirSync(stubs, { recursive: true })
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"\nexport default function Link({ href, children, prefetch, replace, scroll, ...rest }) { return React.createElement("a", { href: String(href), ...rest }, children) }\nexport const useLinkStatus = () => ({ pending: false })\n`)
  writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => window.location.pathname\nexport const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {} })\nexport const useSearchParams = () => new URLSearchParams(window.location.search)\n`)
  writeFileSync(join(stubs, "toast.js"), `export const useToast = () => ({ toast(t) { (window.__toasts = window.__toasts || []).push(t.title) } })\n`)
  writeFileSync(join(stubs, "navbar.js"), `export const startNavigationLoading = () => {}\nexport const NavigationLoadingBar = () => null\n`)
  const liveJs = join(B1, "live.js")
  execFileSync(join(root, "node_modules/.bin/esbuild"), [join(root, "scripts/render-theme-popup-probe.tsx"), "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${liveJs}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"', "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl",
    `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@/hooks/use-toast=${join(stubs, "toast.js")}`, `--alias:@/components/app/navigation-loading-bar=${join(stubs, "navbar.js")}`, `--alias:@=${root}`], { stdio: ["ignore", "ignore", "inherit"], cwd: root, env: { ...process.env, NODE_PATH: join(root, "node_modules") } })
  const js = readFileSync(liveJs)
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style><style>*{box-sizing:border-box}html,body{height:100%;margin:0;overflow:hidden}body{background:#f8f9fa;font-family:Inter,system-ui,sans-serif}#root{height:100dvh}</style>`
  const pub = join(root, "public")
  const asked = []
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://x")
    if (url.pathname.startsWith("/theme-previews/")) {
      asked.push(url.pathname)
      const file = normalize(join(pub, decodeURIComponent(url.pathname)))
      if (!file.startsWith(pub) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404, { "access-control-allow-origin": "*" }); return res.end() }
      if (delayMs && url.pathname.endsWith(".html")) await new Promise((r) => setTimeout(r, delayMs))
      const body = readFileSync(file)
      const etag = `"${createHash("sha1").update(body).digest("hex").slice(0, 16)}"`
      const headers = { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "access-control-allow-origin": "*", "content-security-policy": "sandbox allow-scripts; frame-ancestors 'self'", etag, "cache-control": /\/a\/[^/]+$/.test(url.pathname) ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate" }
      if (req.headers["if-none-match"] === etag) { res.writeHead(304, headers); return res.end() }
      res.writeHead(200, headers); return res.end(body)
    }
    if (url.pathname.startsWith("/themes/") && existsSync(join(pub, url.pathname))) { res.writeHead(200, { "content-type": "image/webp" }); return res.end(readFileSync(join(pub, url.pathname))) }
    if (url.pathname === "/cover.svg" || url.pathname === "/_next/image") { res.writeHead(200, { "content-type": "image/svg+xml" }); return res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="2400"><rect width="1280" height="2400" fill="#e9e3d9"/></svg>`) }
    if (url.pathname === "/live.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js) }
    if (url.pathname.startsWith("/api/")) { res.writeHead(404, { "content-type": "application/json" }); return res.end("{}") }
    if (url.pathname !== "/app/website-builder") { res.writeHead(404); return res.end() }
    res.writeHead(200, { "content-type": "text/html" })
    res.end(`<!doctype html><html><head>${head}</head><body><div id="root"></div><script src="/live.js"></script></body></html>`)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  return { origin: `http://127.0.0.1:${server.address().port}`, server, asked, cleanup: () => rmSync(B1, { recursive: true, force: true }) }
}

const SLUG = process.argv[2] ?? "space-clothing"
const W = +(process.argv[3] ?? 1440)
const H = W < 768 ? 844 : 900
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got = "") => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === "" ? "" : `   ${got}`}`); if (!ok) broken++ }

const host = await startHost({ delayMs: 120 })
const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
try {
  const p = await browser.newPage()
  await p.setViewport({ width: W, height: H, deviceScaleFactor: 1, isMobile: W < 768, hasTouch: W < 768 })
  const errs = []
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)))
  await p.goto(`${host.origin}/app/website-builder`, { waitUntil: "networkidle0", timeout: 60_000 })
  await p.waitForSelector("[data-wb-page]")
  let cover = `[data-theme-grid] [data-template-card='${SLUG}'] [data-template-preview]`
  if (!(await p.$(cover))) { await p.$eval("[data-theme-marketplace-open='heading']", (b) => b.click()); await sleep(600); cover = cover.replace("data-theme-grid", "data-themes-grid") }
  await p.$eval(cover, (b) => b.click())
  await p.waitForFunction(() => document.querySelector("[data-preview-live]")?.getAttribute("data-preview-live") === "ready", { timeout: 30_000 })
  await sleep(1500)
  const frameOf = () => p.frames().filter((f) => f.url().includes("/theme-previews/") && !f.detached).pop()
  const box = await p.$eval("[data-preview-live-frame]", (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  const cdp = await p.createCDPSession()
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  console.log(`\nThe preview of ${SLUG} at ${W}, CPU at 1/4: between pages\n`)
  for (const part of ["/products/", "/collections/", "/pages/about", "/pages/contact", "index.html"]) {
    const href = await frameOf().evaluate((q) => [...document.querySelectorAll(`a[href*='${q}']`)].find((a) => a.getAttribute("href") !== location.pathname)?.getAttribute("href") ?? null, part)
    if (!href) continue
    const frames = []
    const on = (ev) => { frames.push(ev.data); cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }).catch(() => {}) }
    cdp.on("Page.screencastFrame", on)
    await cdp.send("Page.startScreencast", { format: "png" })
    await sleep(200)
    await frameOf().evaluate((h) => [...document.querySelectorAll("a")].find((a) => a.getAttribute("href") === h).click(), href)
    await p.waitForFunction((h) => { const fs = document.querySelectorAll("[data-preview-live-site]"); return fs.length === 1 && fs[0].getAttribute("src") === h }, { timeout: 20_000 }, href).catch(() => null)
    await sleep(600)
    await cdp.send("Page.stopScreencast")
    cdp.off("Page.screencastFrame", on)
    let blank = 0
    for (const d of frames) {
      const png = Buffer.from(d, "base64")
      const sx = (await sharp(png).metadata()).width / W
      const cut = await sharp(png).extract({ left: Math.round(box.x * sx), top: Math.round((box.y + box.h * 0.3) * sx), width: Math.round(box.w * sx) - 1, height: Math.round(box.h * 0.7 * sx) - 1 }).png().toBuffer()
      const st = await sharp(cut).stats()
      if (Math.max(...st.channels.slice(0, 3).map((c) => c.stdev)) < 6) blank++
    }
    const now = await frameOf().evaluate(() => location.pathname)
    expect(blank === 0 && now === href.split(/[?#]/)[0], `to ${href.split("/").slice(3).join("/")}: never a frame without a page`, `${frames.length} frames, ${blank} blank`)
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })

  console.log(`\nAdd to cart and Buy now\n`)
  const prod = await frameOf().evaluate(() => document.querySelector("a[href*='/products/']")?.getAttribute("href"))
  if (prod) {
    await frameOf().evaluate((h) => [...document.querySelectorAll("a")].find((a) => a.getAttribute("href") === h).click(), prod)
    await p.waitForFunction((h) => { const fs = document.querySelectorAll("[data-preview-live-site]"); return fs.length === 1 && fs[0].getAttribute("src") === h }, { timeout: 20_000 }, prod).catch(() => null)
    await sleep(1000)
    for (const which of ["add", "checkout"]) {
      const before = host.asked.length
      const r = await frameOf().evaluate(async (which) => {
        const b = [...document.querySelectorAll(`button[name='${which}']`)].find((b) => b.getBoundingClientRect().width > 0)
        if (!b) return null
        b.scrollIntoView({ block: "center" })
        await new Promise((r) => setTimeout(r, 300))
        const tops = () => [...document.querySelectorAll("main *")].slice(0, 4000).reduce((a, e) => a + Math.round(e.getBoundingClientRect().top), 0)
        const h0 = document.documentElement.scrollHeight, t0 = tops()
        const shownErrors = () => [...document.querySelectorAll(".product-form__error-message-wrapper, .form__message")].filter((e) => e.getBoundingClientRect().height > 0).length
        const e0 = shownErrors()
        b.click()
        await new Promise((r) => setTimeout(r, 400))
        const n = document.querySelector("[data-preview-note]")
        const nb = n?.getBoundingClientRect(), bb = b.getBoundingClientRect()
        const out = { text: n?.textContent ?? null, role: n?.getAttribute("role") ?? null, gap: nb ? Math.round(Math.min(Math.abs(bb.top - nb.bottom), Math.abs(nb.top - bb.bottom))) : null, inside: !!nb && nb.left >= 0 && nb.right <= innerWidth && nb.top >= 0 && nb.bottom <= innerHeight, moved: document.documentElement.scrollHeight - h0 + tops() - t0, errors: shownErrors() - e0, drawer: !!document.querySelector("cart-drawer.active, .cart-drawer.active, .minicart.active") }
        await new Promise((r) => setTimeout(r, 3600))
        out.gone = !document.querySelector("[data-preview-note]")
        return out
      }, which)
      const out = host.asked.slice(before).filter((a) => !a.startsWith("/theme-previews/"))
      expect(!!r && /^Preview only: /.test(r.text ?? "") && r.role === "status" && r.inside && r.gap !== null && r.gap <= 16, `${which === "add" ? "Add to cart" : "Buy now"}: a note by the button, inside the screen`, JSON.stringify(r && { text: r.text, gap: r.gap }))
      expect(!!r && r.moved === 0 && r.errors <= 0 && !r.drawer && out.length === 0, "  nothing sent, nothing on the page moved, no drawer, no error", JSON.stringify(r && { moved: r.moved, errors: r.errors, drawer: r.drawer, requests: out.length }))
      expect(!!r && r.gone, "  and it goes by itself")
    }
  } else console.log("  (no product link on the home page)")
  expect(errs.length === 0, "no script error", errs.slice(0, 3).join(" | "))
} finally {
  await browser.close()
  host.server.close()
  host.cleanup()
}
console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
process.exit(broken ? 1 : 0)
