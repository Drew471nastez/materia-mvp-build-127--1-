/**
 * ===========================================================================
 *  THE PREVIEW'S NEXT PAGE: HOW LONG A PRESS WAITS, AND WHAT IT ASKS FOR
 * ===========================================================================
 * The real Website page (scripts/render-theme-popup-probe.tsx) with the
 * marketplace's Preview open on a template's prerendered website
 * (public/theme-previews, served with next.config.mjs's headers, every file
 * RTT_MS late, as a CDN a continent away would be), in headless Chromium.
 *
 *   FILES KEPT              on storelib.com the website is framed from www
 *                           (templatePreviewFrame): an origin of its own, so
 *                           the second page asks for almost none of the
 *                           stylesheets, scripts and fonts the first had.
 *                           OPAQUE=1 frames it as before round 28, with no
 *                           origin, where Chromium keeps no file at all
 *                           (96 of 104 asked for again on Clothing)
 *   A PRESS, COLD           a product link pressed with no pointer over it
 *                           first: ms from the press to the page on show
 *   A PRESS AFTER A HOVER   the pointer rests on the link (HOVER_MS), then
 *                           presses it: the page was drawn ahead (parked),
 *                           so it is on show in a fraction of the cold time
 *   A REST ON THE CARD      a second visitor (an empty cache) rests the
 *                           pointer on the template's card, then opens it:
 *                           the website's files were fetched from the hover
 *                           (lib/themes/warm-template-preview.ts)
 *   NOTHING LEAVES          every request the frames make is under
 *                           /theme-previews/: no page outside the website is
 *                           ever opened in the frame ("refused to connect")
 *
 *   node scripts/check-template-preview-speed.mjs [slug]     (clothing)
 */
import puppeteer from "puppeteer-core"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { extname, join, normalize } from "node:path"
import { appCss, interFaces } from "./probe-css.mjs"
const root = process.cwd()
/* The host the parent page is on in production (lib/themes/marketplace-shared.ts TEMPLATE_PREVIEW_MAIN_HOST). */
const MAIN = "storelib.com"
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
    /* Anything a frame asks for outside the website is written down too (NOTHING LEAVES). */
    if (!url.pathname.startsWith("/theme-previews/") && !/^\/(live\.js|app\/website-builder|themes\/|cover\.svg|_next\/image|api\/|favicon)/.test(url.pathname)) asked.push(url.pathname)
    if (url.pathname.startsWith("/theme-previews/")) {
      asked.push(url.pathname)
      const file = normalize(join(pub, decodeURIComponent(url.pathname)))
      if (!file.startsWith(pub) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404, { "access-control-allow-origin": "*" }); return res.end() }
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
      const body = readFileSync(file)
      const etag = `"${createHash("sha1").update(body).digest("hex").slice(0, 16)}"`
      const headers = { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "access-control-allow-origin": "*", "content-security-policy": /^www\./.test(req.headers.host ?? "") ? `sandbox allow-scripts allow-same-origin; frame-ancestors http://${MAIN}:${server.address().port} http://www.${MAIN}:${server.address().port}` : "sandbox allow-scripts; frame-ancestors 'self'", etag, "cache-control": /\/a\/[^/]+$/.test(url.pathname) ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate" }
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
  /* As production: storelib.com (the parent) and www.storelib.com (the website's frames, templatePreviewFrame), both this server. OPAQUE=1: the parent on 127.0.0.1, so the frame is the old one, with no origin. */
  return { origin: OPAQUE ? `http://127.0.0.1:${server.address().port}` : `http://${MAIN}:${server.address().port}`, server, asked, cleanup: () => rmSync(B1, { recursive: true, force: true }) }
}


const SLUG = process.argv[2] ?? "clothing"
const OPAQUE = process.env.OPAQUE === "1"
const RTT_MS = Number(process.env.RTT_MS ?? 60)
const HOVER_MS = 600
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got = "") => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === "" ? "" : `   ${got}`}`); if (!ok) broken++ }

const host = await startHost({ delayMs: RTT_MS })
const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", `--host-resolver-rules=MAP ${MAIN} 127.0.0.1, MAP www.${MAIN} 127.0.0.1`] })
try {
  const p = await browser.newPage()
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
  const errs = []
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)))
  await p.goto(`${host.origin}/app/website-builder`, { waitUntil: "networkidle0", timeout: 60_000 })
  await p.waitForSelector("[data-wb-page]")
  if (process.env.DEBUG) await p.evaluate(() => window.addEventListener("message", (e) => (window.__msgs = window.__msgs || []).push(e.data && e.data.type ? e.data.type.replace("storelib:template-preview", "") || "tell" : "?")))
  let cover = `[data-theme-grid] [data-template-card='${SLUG}'] [data-template-preview]`
  if (!(await p.$(cover))) { await p.$eval("[data-theme-marketplace-open='heading']", (b) => b.click()); await sleep(600); cover = cover.replace("data-theme-grid", "data-themes-grid") }
  const opened = Date.now()
  await p.$eval(cover, (b) => b.click())
  await p.waitForFunction(() => document.querySelector("[data-preview-live]")?.getAttribute("data-preview-live") === "ready", { timeout: 30_000 })
  const firstMs = Date.now() - opened
  await sleep(1200)
  const front = () => p.frames().find((f) => !f.detached && f.url().includes("/theme-previews/") && f.parentFrame() === p.mainFrame() && f.url().includes(".html")) && p.$eval("[data-preview-page='front']", (e) => e.getAttribute("src"))
  const frontFrame = async () => { const src = await front(); return p.frames().find((f) => !f.detached && f.url().endsWith(src) ) ?? p.frames().filter((f) => f.url().includes("/theme-previews/")).pop() }
  console.log(`\nThe preview of ${SLUG}, every file ${RTT_MS}ms late\n`)
  console.log(`  the first page on show ${firstMs}ms after the press on the cover`)

  const links = await (await frontFrame()).evaluate(() => [...new Set([...document.querySelectorAll("a[href*='/products/']")].filter((a) => a.getBoundingClientRect().width > 0).map((a) => a.getAttribute("href")))].slice(0, 3))
  expect(links.length >= 1, "a product link on the home page", links.length)

  /* What the second page asks for again. */
  const firstAssets = new Set(host.asked.filter((a) => /\/a\/[^/]+\.(css|js|woff2)$/.test(a)))
  async function press(href, hover) {
    /* A cold press has no pointer over the website first (a pointer left over a link would have the page drawn ahead). */
    if (!hover) await p.mouse.move(2, 2)
    const f = await frontFrame()
    const at = host.asked.length
    const handle = await f.evaluateHandle((h) => [...document.querySelectorAll("a")].find((a) => a.getAttribute("href") === h && a.getBoundingClientRect().width > 0), href)
    await handle.evaluate((a) => a.scrollIntoView({ block: "center" }))
    await sleep(300)
    const box = await handle.boundingBox()
    if (hover) { await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 }); await sleep(HOVER_MS) }
    if (process.env.DEBUG) console.log("    before the press:", await p.$$eval("[data-preview-live-site]", (fs) => fs.map((f) => `${f.getAttribute("data-preview-page")} ${f.getAttribute("src").split("/").pop()}`).join(" | ")), await p.evaluate(() => (window.__msgs || []).slice(-12).join(",")))
    const t0 = Date.now()
    if (hover) await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    else await handle.evaluate((a) => a.click())
    await p.waitForFunction((h) => (document.querySelector("[data-preview-page='front']")?.getAttribute("src") ?? "").endsWith(h), { timeout: 30_000 }, href)
    const ms = Date.now() - t0
    await sleep(1500)
    return { ms, asked: host.asked.slice(at) }
  }
  const cold = await press(links[0], false)
  const again = cold.asked.filter((a) => firstAssets.has(a)).length
  if (OPAQUE) console.log(`  the second page asked again for ${again} of the ${firstAssets.size} stylesheets, scripts and fonts the first had (${cold.asked.length} requests in all)`)
  else expect(again <= Math.ceil(firstAssets.size * 0.1), `the second page asked again for ${again} of the ${firstAssets.size} stylesheets, scripts and fonts the first had (kept: the frame has www's origin)`, `${cold.asked.length} requests in all`)
  /* The frame's storage is the shim's own, never the host's (nothing is written for www.storelib.com). */
  const storage = await (await frontFrame()).evaluate(() => ({ local: typeof Storage !== "undefined" && localStorage instanceof Storage, cookie: Object.getOwnPropertyDescriptor(document, "cookie") !== undefined, origin: location.origin }))
  expect(!storage.local && storage.cookie, "the website keeps its storage and cookies to itself", JSON.stringify(storage))
  /* Then presses one after another, each on a product link of the page on show: cold and after a hover in turn. The median of each, since a shared machine's load moves any single one. */
  const sizeOf = (paths) => paths.reduce((n, a) => { try { return n + statSync(join(root, "public", decodeURIComponent(a))).size } catch { return n } }, 0)
  const times = { cold: [cold.ms], warm: [] }
  const bytes = { cold: [sizeOf(cold.asked)], warm: [] }
  for (let i = 0; i < 5; i++) {
    const hover = i % 2 === 0
    const here = await (await frontFrame()).evaluate(() => location.pathname)
    const next = await (await frontFrame()).evaluate((h) => [...new Set([...document.querySelectorAll("a[href*='/products/']")].filter((a) => a.getBoundingClientRect().width > 0).map((a) => a.getAttribute("href")))].find((x) => !x.startsWith(h)), here)
    if (!next) break
    const r = await press(next, hover)
    times[hover ? "warm" : "cold"].push(r.ms)
    bytes[hover ? "warm" : "cold"].push(sizeOf(r.asked))
  }
  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
  const kb = (n) => `${Math.round(n / 1024)} KB`
  console.log(`  a press, cold: ${times.cold.join(", ")}ms (median ${median(times.cold)}), ${kb(median(bytes.cold))} asked for (uncompressed)`)
  console.log(`  a press after a ${HOVER_MS}ms hover: ${times.warm.join(", ")}ms (median ${median(times.warm)})`)
  expect(times.warm.length >= 2 && median(times.warm) < median(times.cold) / 2, "after a hover the page is on show in under half the cold time", `${median(times.warm)}ms vs ${median(times.cold)}ms`)
  /* Opening the preview, a second visitor (an empty cache) whose pointer rested on the card first: the website's files were fetched from the hover (lib/themes/warm-template-preview.ts). */
  if (!OPAQUE) {
    const ctx = await browser.createBrowserContext()
    const q = await ctx.newPage()
    await q.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
    await q.goto(`${host.origin}/app/website-builder`, { waitUntil: "networkidle0", timeout: 60_000 })
    await q.waitForSelector("[data-wb-page]")
    let card = `[data-theme-grid] [data-template-card='${SLUG}'] [data-template-preview]`
    if (!(await q.$(card))) { await q.$eval("[data-theme-marketplace-open='heading']", (b) => b.click()); await sleep(600); card = card.replace("data-theme-grid", "data-themes-grid") }
    await q.$eval(card, (el) => el.scrollIntoView({ block: "center" }))
    await sleep(400)
    const cb = await (await q.$(card)).boundingBox()
    const warmAsked = host.asked.length
    await q.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2, { steps: 3 })
    await sleep(1500)
    const beforePress = host.asked.slice(warmAsked).filter((x) => /\/a\/.+\.(css|js)$/.test(x)).length
    const t0 = Date.now()
    await q.mouse.click(cb.x + cb.width / 2, cb.y + cb.height / 2)
    await q.waitForFunction(() => document.querySelector("[data-preview-live]")?.getAttribute("data-preview-live") === "ready", { timeout: 30_000 })
    const warmOpen = Date.now() - t0
    console.log(`  (the rest on the card fetched ${beforePress} stylesheets and scripts before the press)`)
    expect(warmOpen < firstMs, `the preview opened after a 1500ms rest on the card: the first page on show after ${warmOpen}ms (cold: ${firstMs}ms)`)
    await ctx.close()
  }
  const outside = host.asked.filter((a) => !a.startsWith("/theme-previews/"))
  expect(outside.length === 0, "no frame asked for anything outside /theme-previews/", outside.slice(0, 4).join(", "))
  expect(errs.length === 0, "no script error", errs.slice(0, 3).join(" | "))
} finally {
  await browser.close()
  host.server.close()
  host.cleanup()
}
console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
process.exit(broken ? 1 : 0)
