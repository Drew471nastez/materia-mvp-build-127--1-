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
 *   AT 1440 x 900 AND AT 390 x 844 (a phone, touch, 2x), the CPU at a
 *   quarter (THROTTLE=1 for full speed)
 *   • a cover opens the preview straight onto the website: the frame is
 *     asked for on the press, and no picture of the template is drawn at
 *     any moment, so nothing is swapped
 *   • the wait is quiet: the frame's own white, the loading line still clear
 *     in the first moment
 *   • the website fades in once: its opacity only ever rises, from 0 to 1,
 *     one transition, and nothing else fades with it
 *   • the window's arrival, the switch and the leaving are measured frame by
 *     frame on the page's clock (the longest frame and how many went over
 *     50ms), and the window moves on transform and opacity only
 *   • the frame is sandboxed with scripts only, the template's home page,
 *     the stage's whole width, the theme's desktop layout
 *   • a product link inside it opens the product's page in the frame
 *   • Add to cart there adds nothing: no request leaves the frame
 *   • Phone reflows the same page in a 390px frame: the theme's own phone
 *     layout (its width is 390 inside, nothing runs off the side), not a
 *     picture made smaller; the website dips while it reflows and comes back
 *     once, and Desktop again is the whole width
 *   • a second look: how many of the website's files the browser asks the
 *     network for again (said, not failed: Chromium keeps no files for a
 *     frame with no origin, which the sandbox is)
 *   EVERYWHERE
 *   • no script error and no console error in the page or the frame; every
 *     file the website asks for is a 200 from /theme-previews/
 *
 *   node scripts/check-theme-preview-live.mjs [template-slug]      SHOTS=dir saves pictures
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { extname, join, normalize } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const SLUG = process.argv[2] ?? "clothing"
const THROTTLE = Number(process.env.THROTTLE ?? 4)
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
      /* As next.config.mjs and the CDN serve them: a/ kept a year, the pages checked each time by their tag. */
      const body = readFileSync(file)
      const etag = `"${createHash("sha1").update(body).digest("hex").slice(0, 16)}"`
      const headers = { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "access-control-allow-origin": "*", "content-security-policy": "sandbox allow-scripts; frame-ancestors 'self'", etag, "cache-control": /\/a\/[^/]+$/.test(url.pathname) ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate" }
      if (req.headers["if-none-match"] === etag) {
        res.writeHead(304, headers)
        return res.end()
      }
      res.writeHead(200, headers)
      return res.end(body)
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
  const throttle = async (p, rate) => {
    const c = await p.createCDPSession()
    await c.send("Emulation.setCPUThrottlingRate", { rate })
  }
  const frameOf = (p) => p.frames().find((f) => f.url().includes("/theme-previews/"))
  const stage = (p) =>
    p.evaluate(() => {
      const live = document.querySelector("[data-preview-live]")
      const iframe = live?.querySelector("iframe")
      const box = document.querySelector("[data-preview-live-frame]")?.getBoundingClientRect()
      const stageBox = document.querySelector("[data-preview-stage]")?.getBoundingClientRect()
      const loading = document.querySelector("[data-preview-live-loading]")
      return live
        ? {
            state: live.getAttribute("data-preview-live"),
            opacity: +getComputedStyle(live).opacity,
            sandbox: iframe?.getAttribute("sandbox") ?? null,
            referrer: iframe?.getAttribute("referrerpolicy") ?? null,
            src: live.getAttribute("data-preview-src"),
            asked: iframe?.getAttribute("src") ?? null,
            frame: box ? [box.width, box.height].map(Math.round) : null,
            frameBg: document.querySelector("[data-preview-live-frame]") ? getComputedStyle(document.querySelector("[data-preview-live-frame]")).backgroundColor : null,
            stage: stageBox ? Math.round(stageBox.width) : null,
            loader: loading ? +getComputedStyle(loading).opacity : 0,
            pictures: document.querySelectorAll("[data-theme-preview] [data-preview-layer], [data-theme-preview] img").length,
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
  /*
    EVERY FRAME, ON THE PAGE'S CLOCK, until stopped: when it was drawn, the
    window's opacity and transform, the website's opacity, the iframe's own
    opacity (the switch's dip), and whether any picture is in the preview.
  */
  const record = (p) =>
    p.evaluate(() => {
      window.__rec = []
      window.__recOn = true
      const t0 = performance.now()
      const tick = (t) => {
        const panel = document.querySelector("[data-theme-preview]")
        const live = document.querySelector("[data-preview-live]")
        const iframe = live?.querySelector("iframe")
        const ps = panel ? getComputedStyle(panel) : null
        window.__rec.push({
          t: Math.round(t - t0),
          panel: ps ? +ps.opacity : null,
          scale: ps && ps.transform !== "none" ? +new DOMMatrixReadOnly(ps.transform).a.toFixed(4) : ps ? 1 : null,
          tx: ps && ps.transform !== "none" ? Math.round(new DOMMatrixReadOnly(ps.transform).m41) : 0,
          live: live ? +getComputedStyle(live).opacity : null,
          site: iframe ? +getComputedStyle(iframe).opacity : null,
          pictures: panel ? panel.querySelectorAll("[data-preview-layer], img").length : 0,
          asked: !!iframe?.getAttribute("src"),
        })
        if (window.__recOn) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  const stop = (p) => p.evaluate(() => { window.__recOn = false; return window.__rec })
  /* The frames from `from` to `to`, and the first one after `to`: a frame that never came within the span is the longest of all. */
  const frameTimes = (rec, from = 0, to = Infinity) => {
    const all = rec.map((r) => r.t).filter((t) => t >= from)
    const end = all.findIndex((t) => t > to)
    const ts = end < 0 ? all : all.slice(0, end + 1)
    const gaps = ts.slice(1).map((t, i) => t - ts[i])
    return { frames: ts.length, longest: gaps.length ? Math.max(...gaps) : 0, over50: gaps.filter((g) => g > 50).length }
  }
  const rising = (xs) => xs.every((x, i) => i === 0 || x >= xs[i - 1] - 0.001)

  /* PROFILE=arrival|switch|leave: the page's main thread through that moment, task by task (for finding what a long frame is). */
  const traceStart = async (p) => {
    await p.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "blink", "v8.execute"] })
    return true
  }
  const traceEnd = async (p, ms) => {
    await sleep(ms)
    const ev = JSON.parse(Buffer.from(await p.tracing.stop()).toString()).traceEvents
    const mains = ev.filter((e) => e.name === "thread_name" && e.args?.name === "CrRendererMain")
    const of = (m) => ev.filter((e) => e.ph === "X" && e.pid === m.pid && e.tid === m.tid && e.dur)
    const mine = mains.map(of).sort((a, b) => b.length - a.length)[0]
    const t0 = Math.min(...mine.map((e) => e.ts))
    for (const lt of mine.filter((e) => e.name === "RunTask" && e.dur > 40000)) {
      console.log(`        long task at ${Math.round((lt.ts - t0) / 1000)}ms, ${Math.round(lt.dur / 1000)}ms:`)
      for (const e of mine.filter((e) => e.ts >= lt.ts && e.ts + e.dur <= lt.ts + lt.dur && e.dur > 4000 && e !== lt && !/^(Blink\.|Document::|LocalFrameView::)/.test(e.name)).sort((a, b) => a.ts - b.ts)) console.log(`          ${Math.round((e.ts - lt.ts) / 1000)}+${Math.round(e.dur / 1000)} ${e.name} ${JSON.stringify(e.args?.data ?? e.args?.beginData ?? "").slice(0, 140)}`)
    }
  }

  for (const [W, H] of [[1440, 900], [390, 844]]) {
    const phone = W < 768
    console.log(`\nThe live preview of ${SLUG}, ${W} x ${H}${phone ? " at 2x" : ""}, CPU at 1/${THROTTLE}\n`)
    const p = await open(W, H)
    const cover = await coverOf(p, phone)
    await p.$eval(cover, (b) => b.scrollIntoView({ block: "center" }))
    await sleep(120)
    await throttle(p, THROTTLE)
    const before = asked.length
    const entry0 = await p.evaluate(() => ({ index: navigation.currentEntry.index, search: location.search }))
    await record(p)
    const traced = process.env.PROFILE === "arrival" ? await traceStart(p) : null
    if (phone) await p.tap(cover)
    else await p.click(cover)
    await sleep(120)
    if (traced) await traceEnd(p, 300)
    const early = await stage(p)
    await shot(p, `live-${W}-opening`)
    expect(!!early && early.src === `/theme-previews/${SLUG}/index.html`, "the preview is the template's own website from its first frame", JSON.stringify(early && { src: early.src }))
    expect(!!early && early.pictures === 0 && early.loader < 0.05 && early.frameBg === "rgb(255, 255, 255)", "no picture first: the frame's own white, the loading line still clear", JSON.stringify(early && { pictures: early.pictures, loader: early.loader, frame: early.frameBg }))
    await p.waitForFunction(() => document.querySelector("[data-preview-live]")?.getAttribute("data-preview-live") === "ready", { timeout: 30_000 }).catch(() => null)
    await sleep(600)
    const rec = await stop(p)
    const readyAt = rec.find((r) => r.live > 0)?.t ?? null
    const askedAt = rec.find((r) => r.asked)?.t ?? null
    expect(askedAt !== null && askedAt >= 150 && askedAt <= 500, "the website is asked for as the window lands (on the page's clock, whose frames are few while it is busy)", `${askedAt}ms after the press`)
    const ready = await stage(p)
    const lives = rec.map((r) => r.live).filter((x) => x !== null)
    const arrival = frameTimes(rec, 0, 300)
    const panelO = rec.filter((r) => r.panel !== null).map((r) => r.panel)
    expect(ready?.sandbox === "allow-scripts" && ready.referrer === "no-referrer" && ready.asked === `/theme-previews/${SLUG}/index.html`, "framed sandboxed with scripts only, no referrer", JSON.stringify(ready && { sandbox: ready.sandbox, referrer: ready.referrer }))
    expect(ready?.state === "ready" && ready.opacity === 1, "the website is up", `${readyAt}ms after the press on the page's clock, ${asked.length - before} files`)
    expect(rec.every((r) => r.pictures === 0), "no picture of the template at any frame, so nothing is swapped", `${rec.length} frames`)
    expect(rising(lives) && lives[lives.length - 1] === 1 && (await p.evaluate(() => document.querySelector("[data-preview-live]").getAnimations().length)) === 0, "it fades in once: its opacity only rises, to 1", `${lives.filter((x, i) => i === 0 || x !== lives[i - 1]).map((x) => x.toFixed(2)).join(" ")}`)
    expect(rising(panelO) && panelO[panelO.length - 1] === 1, "the window arrives in one motion", `opacity ${panelO.slice(0, 8).map((x) => x.toFixed(2)).join(" ")}…`)
    console.log(`        arrival, first 300ms: ${arrival.frames} frames, longest ${arrival.longest}ms, ${arrival.over50} over 50ms`)
    const f0 = frameOf(p)
    const home = f0 ? await inside(f0) : null
    expect(!!home && home.path === `/theme-previews/${SLUG}/index.html` && home.sections >= 3 && home.broken.length === 0, "it is the home page, every section drawn, every picture loaded", JSON.stringify(home && { ...home, broken: home.broken.length }))
    const wantW = phone ? 390 : ready.stage
    expect(!!home && home.width === wantW && home.sideways <= 0, phone ? "on a phone it opens on the website's phone layout, the whole screen wide" : "at the stage's whole width: the theme's desktop layout", `${home?.width}px inside, stage ${ready?.stage}px`)
    await shot(p, `live-${W}-home`)

    if (!phone) {
      await throttle(p, 1)
      let f = f0
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
      expect(!!product && product.path.includes("/products/") && !!product.h1 && product.broken.length === 0, "a product link opens the product's page inside the frame", JSON.stringify(product && { path: product.path, h1: product.h1 }))
      const was = asked.length
      const add = await f.evaluate(() => {
        const b = [...document.querySelectorAll("button[name='add'], button[type='submit']")].find((x) => x.getBoundingClientRect().width > 0 && x.closest("[data-preview-form]"))
        b?.click()
        return !!b
      })
      await sleep(900)
      const after = await inside(f)
      expect(add && after.path === product.path && asked.slice(was).every((a) => a.startsWith("/theme-previews/")), "Add to cart stays on the page and asks the network for nothing but the preview's own files", `${asked.length - was} requests`)
      await throttle(p, THROTTLE)

      /* Phone: the same page, reflowed in a 390px frame; the website dips while it reflows and comes back once. */
      await record(p)
      const tracedSwitch = process.env.PROFILE === "switch" ? await traceStart(p) : null
      await p.click("[data-preview-device='phone']")
      await sleep(900)
      if (tracedSwitch) await traceEnd(p, 0)
      const sw = await stop(p)
      const ph = await stage(p)
      const phoneIn = await inside(f)
      await shot(p, "live-1440-phone")
      const sites = sw.map((r) => r.site)
      const dip = sites.findIndex((x) => x < 1)
      const swt = frameTimes(sw, 0, 500)
      expect(ph.frame[0] === 390 && phoneIn.width === 390 && phoneIn.sideways <= 0 && phoneIn.path === product.path, "Phone reflows the same page in a 390px frame, nothing off the side", `${ph.frame.join("x")} frame, ${phoneIn.width}px inside, on ${phoneIn.path}`)
      expect(dip > 0 && sites[dip] <= 0.05 && rising(sites.slice(dip)) && sites[sites.length - 1] === 1, "the switch: the website is clear from the press's frame, then comes back once", `${sites.filter((x, i) => i === 0 || x !== sites[i - 1]).map((x) => x.toFixed(2)).join(" ")}`)
      console.log(`        switch, first 500ms: ${swt.frames} frames, longest ${swt.longest}ms, ${swt.over50} over 50ms`)
      await p.click("[data-preview-device='desktop']")
      await sleep(900)
      const back = await inside(f)
      expect(back.width === ready.stage, "Desktop again: the whole width", `${back.width}px`)
    }

    /* Leaving: Escape on a computer, the system's back on a phone. */
    await record(p)
    const tracedOut = process.env.PROFILE === "leave" ? await traceStart(p) : null
    if (phone) await p.goBack({ waitUntil: "domcontentloaded" }).catch(() => null)
    else await p.keyboard.press("Escape")
    await sleep(500)
    if (tracedOut) await traceEnd(p, 0)
    const out = await stop(p)
    const leave = frameTimes(out, 0, 300)
    const outO = out.filter((r) => r.panel !== null).map((r) => r.panel)
    expect((await p.$("[data-theme-preview]")) === null && outO.every((x, i) => i === 0 || x <= outO[i - 1] + 0.001), "it leaves in one motion, and is gone", `opacity ${outO.slice(0, 8).map((x) => x.toFixed(2)).join(" ")}…`)
    const entry1 = await p.evaluate(() => ({ index: navigation.currentEntry.index, search: location.search }))
    expect(entry1.index === entry0.index && entry1.search === entry0.search, phone ? "the system's back lands on the entry the preview was opened from" : "Escape after browsing the website's pages lands on the entry the preview was opened from, back over those pages in one go", `${JSON.stringify(entry0)} -> ${JSON.stringify(entry1)}`)
    console.log(`        leaving, first 300ms: ${leave.frames} frames, longest ${leave.longest}ms, ${leave.over50} over 50ms`)

    /* A second look at the same website: what the browser asks the network for again. */
    await throttle(p, 1)
    await sleep(300)
    const second = asked.length
    if (phone) await p.tap(cover)
    else await p.click(cover)
    await p.waitForFunction(() => document.querySelector("[data-preview-live]")?.getAttribute("data-preview-live") === "ready", { timeout: 30_000 }).catch(() => null)
    await sleep(500)
    const again = asked.slice(second)
    console.log(`        a second look asked the network for ${again.length} files again (${again.filter((a) => a.endsWith(".css")).length} stylesheets, ${again.filter((a) => a.endsWith(".js")).length} scripts)`)
    expect((await stage(p))?.state === "ready", "a second look comes up too")
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
