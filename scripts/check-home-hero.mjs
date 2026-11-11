/** Real SSR -> hydration, native playback using a local H.264 fixture, never live auth writes.
 * CHROMIUM_PATH=/tmp/chromium PROBE_CSS=source node scripts/check-home-hero.mjs
 * The supplied CDN video is tested separately: this probe cannot certify remote footage.
 */
import assert from "node:assert/strict"
import { build } from "esbuild"
import puppeteer from "puppeteer-core"
import { createServer } from "node:http"
import { execFileSync } from "node:child_process"
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
} from "node:fs"
import { join, extname, resolve } from "node:path"
import { tmpdir } from "node:os"
import { appCss } from "./probe-css.mjs"
const root = process.cwd(),
  out = mkdtempSync(join(tmpdir(), "storelib-cinematic-"))
const pause = (ms) => new Promise((r) => setTimeout(r, ms))
const shots = process.env.HERO_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const alias = {
  name: "root-alias",
  setup(b) {
    b.onResolve({ filter: /^@\// }, (a) =>
      b.resolve("./" + a.path.slice(2), { resolveDir: root, kind: a.kind }),
    )
  },
}
await build({
  entryPoints: ["scripts/render-home-hero.tsx"],
  bundle: true,
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  outfile: join(out, "client.js"),
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [alias],
})
await build({
  stdin: {
    contents:
      'import React from "react"; import {renderToString} from "react-dom/server"; import {Hero} from "./components/marketing/hero"; process.stdout.write(renderToString(React.createElement(Hero)));',
    resolveDir: root,
    loader: "tsx",
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  jsx: "automatic",
  outfile: join(out, "server.cjs"),
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [alias],
})
const ssr = execFileSync(process.execPath, [join(out, "server.cjs")], {
  encoding: "utf8",
})
const css = await appCss(root)
// The fixture uses the real H.264 decoder, looping and first-frame callback.
execFileSync("ffmpeg", [
  "-hide_banner",
  "-loglevel",
  "error",
  "-f",
  "lavfi",
  "-i",
  "testsrc2=size=320x180:rate=12",
  "-t",
  "2",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
  "-y",
  join(out, "test.mp4"),
])
const video = readFileSync(join(out, "test.mp4"))
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Arial,system-ui,sans-serif}header{height:72px;display:flex;align-items:center;padding:0 24px;background:#fff;color:#161616}header a{margin-left:auto}</style><script>window.__cls=0;window.__shifts=[];new PerformanceObserver(l=>l.getEntries().forEach(e=>{if(!e.hadRecentInput){window.__cls+=e.value;window.__shifts.push({value:e.value,time:e.startTime,sources:e.sources.map(s=>({node:s.node?.outerHTML?.slice(0,150),before:s.previousRect.toJSON(),after:s.currentRect.toJSON()}))})}})).observe({type:'layout-shift',buffered:true});</script></head><body><header>Storelib <a href="/explore">Marketplace</a></header><main id="app">${ssr}</main><section style="height:1400px;background:#fff">Unrelated content</section><script src="/client.js"></script></body></html>`
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://local")
  if (url.pathname === "/") {
    res.setHeader("content-type", "text/html; charset=utf-8")
    return res.end(html)
  }
  if (url.pathname === "/signup" || url.pathname === "/explore") {
    res.setHeader("content-type", "text/html; charset=utf-8")
    return res.end("<h1>Existing route boundary</h1>")
  }
  const p =
    url.pathname === "/client.js"
      ? join(out, "client.js")
      : resolve(root, "public", "." + url.pathname)
  if (!p.startsWith(root + "/public/") && p !== join(out, "client.js")) {
    res.writeHead(403)
    return res.end()
  }
  if (!existsSync(p)) {
    res.writeHead(404)
    return res.end()
  }
  const types = {
    ".js": "text/javascript",
    ".svg": "image/svg+xml",
    ".png": "image/png",
  }
  res.setHeader("content-type", types[extname(p)] || "application/octet-stream")
  res.end(readFileSync(p))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({
  executablePath:
    process.env.CHROMIUM_PATH ||
    process.env.CHROMIUM ||
    (existsSync("/tmp/chromium") ? "/tmp/chromium" : "/usr/bin/chromium"),
  headless: true,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
})
async function pageFor(mode = "video") {
  const page = await browser.newPage()
  page.errors = []
  page.videoRequests = 0
  page.on("pageerror", (e) => page.errors.push(e.message))
  await page.setRequestInterception(true)
  page.on("request", async (r) => {
    if (r.url().startsWith(origin)) return r.continue()
    if (r.url().includes("1794399738580785.mp4")) {
      page.videoRequests++
      if (mode === "failure") return r.abort("failed")
      if (mode === "slow") {
        await pause(1800)
        if (r.isInterceptResolutionHandled()) return
      }
      const range = r.headers().range?.match(/bytes=(\d+)-(\d*)/)
      const start = range ? Number(range[1]) : 0,
        end =
          range && range[2]
            ? Math.min(Number(range[2]), video.length - 1)
            : video.length - 1
      return r.respond({
        status: range ? 206 : 200,
        contentType: "video/mp4",
        headers: {
          "accept-ranges": "bytes",
          ...(range
            ? { "content-range": `bytes ${start}-${end}/${video.length}` }
            : {}),
        },
        body: video.subarray(start, end + 1),
      })
    }
    return r.abort()
  })
  return page
}
const metrics = () => {
  const box = (s) => {
    const r = document.querySelector(s).getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  }
  return {
    heading: box(".cinematic-heading-fixed"),
    line: box(".cinematic-phrases"),
    description: box(".cinematic-description"),
    form: box(".cinematic-signup"),
    hero: box("[data-home-hero]"),
    width: innerWidth,
    doc: document.documentElement.scrollWidth,
    active: document.querySelector('[data-active="true"]').textContent,
    cls: window.__cls,
  }
}
try {
  for (const [width, height] of [
    [320, 640],
    [375, 812],
    [390, 844],
    [430, 932],
    [768, 1024],
    [1024, 768],
    [1440, 900],
    [1920, 1080],
    [375, 568],
    [844, 390],
  ]) {
    const page = await pageFor()
    await page.setViewport({ width, height })
    await page.goto(origin, { waitUntil: "networkidle0" })
    await page.waitForSelector('video[data-ready="true"]')
    const before = await page.evaluate(metrics)
    assert.equal(before.doc, width, "no horizontal overflow")
    assert.equal(before.hero.x, 0)
    assert.equal(before.hero.w, width)
    assert.equal(
      await page.$eval("video", (v) => getComputedStyle(v).objectFit),
      "cover",
    )
    assert.equal(await page.$$eval("video", (v) => v.length), 1)
    const seen = new Set([before.active])
    const cycles = width === 1440 || width === 390 ? 7 : 2
    for (let i = 0; i < cycles; i++) {
      await pause(2010)
      const m = await page.evaluate(metrics)
      seen.add(m.active)
      for (const k of ["heading", "line", "description", "form"])
        assert.deepEqual(m[k], before[k], `${width} stable ${k}`)
      assert.ok(
        m.cls < 0.001,
        `CLS ${m.cls}: ${JSON.stringify(await page.evaluate(() => window.__shifts))}`,
      )
    }
    if (cycles === 7)
      assert.equal(seen.size, 7, "all seven phrases and wraparound")
    const layout = await page.evaluate(() => {
      const f = document.querySelector("form"),
        input = f.querySelector("input[type=email]").getBoundingClientRect(),
        btn = f.querySelector("button").getBoundingClientRect()
      return { inputY: input.y, buttonY: btn.y, gap: btn.y - input.bottom }
    })
    if (width < 640) assert.ok(layout.gap >= 10, "mobile form stacked")
    else assert.equal(layout.inputY, layout.buttonY, "desktop form inline")
    // All phrases fit the same reserved line, including narrow landscape and 320px.
    assert.ok(
      await page.$$eval(".cinematic-phrase", (els) =>
        els.every((e) => e.scrollWidth <= e.clientWidth + 1),
      ),
    )
    if (shots)
      await page.screenshot({ path: join(shots, `${width}x${height}.png`) })
    await page.click(".cinematic-motion")
    const held = await page.evaluate(metrics)
    await pause(2200)
    assert.equal((await page.evaluate(metrics)).active, held.active)
    assert.ok(await page.$eval("video", (v) => v.paused))
    await page.click(".cinematic-motion")
    await pause(300)
    assert.equal(await page.$eval("video", (v) => v.paused), false)
    if (width === 1440) {
      await page.evaluate(() => scrollTo(0, document.body.scrollHeight))
      await pause(300)
      const off = await page.evaluate(metrics)
      await pause(2200)
      assert.equal((await page.evaluate(metrics)).active, off.active)
      assert.ok(await page.$eval("video", (v) => v.paused))
      await page.evaluate(() => scrollTo(0, 0))
      await pause(300)
      assert.equal(await page.$eval("video", (v) => v.paused), false)
    }
    assert.deepEqual(page.errors, [])
    await page.close()
    console.log(
      `ok ${width}x${height}: playback, full bleed, reserved headline, signup layout, no CLS/overflow, pause/resume`,
    )
  }
  for (const mode of [
    "reduced-motion",
    "reduced-data",
    "failure",
    "slow",
    "autoplay-denied",
    "no-intersection-observer",
  ]) {
    const page = await pageFor(mode)
    await page.setViewport({ width: 390, height: 844 })
    if (mode === "no-intersection-observer")
      await page.evaluateOnNewDocument(() => {
        delete window.IntersectionObserver
      })
    if (mode === "reduced-motion")
      await page.emulateMediaFeatures([
        { name: "prefers-reduced-motion", value: "reduce" },
      ])
    if (mode === "reduced-data")
      await page.evaluateOnNewDocument(() =>
        Object.defineProperty(navigator, "connection", {
          value: Object.assign(new EventTarget(), {
            saveData: true,
            effectiveType: "4g",
          }),
        }),
      )
    if (mode === "autoplay-denied")
      await page.evaluateOnNewDocument(
        () =>
          (HTMLMediaElement.prototype.play = function () {
            this.autoplay = false
            this.pause()
            return Promise.reject(
              new DOMException("Autoplay blocked", "NotAllowedError"),
            )
          }),
      )
    await page.goto(origin, { waitUntil: "domcontentloaded" })
    await pause(mode === "slow" ? 400 : 2400)
    assert.equal(
      await page.$eval("video", (v) => v.dataset.ready),
      mode === "no-intersection-observer" ? "true" : "false",
      `${mode} poster`,
    )
    assert.ok(
      await page.$eval(
        ".cinematic-poster",
        (i) => i.complete && i.naturalWidth > 0,
      ),
    )
    assert.ok(await page.$eval("button[type=submit]", (b) => !b.disabled))
    if (mode === "reduced-motion" || mode === "reduced-data")
      assert.equal(page.videoRequests, 0)
    if (mode === "reduced-motion")
      assert.equal((await page.evaluate(metrics)).active, "website.")
    if (mode === "slow") await page.waitForSelector('video[data-ready="true"]')
    await page.close()
    console.log(`ok ${mode}: media preferences/fallback and usable signup`)
  }
  // Native validation + Enter, safe prefill and unchanged signup intent, no auth API called.
  const page = await pageFor("failure")
  await page.goto(origin)
  await page.type("input[type=email]", "invalid")
  await page.click("button[type=submit]")
  assert.equal(new URL(page.url()).pathname, "/")
  assert.ok(await page.$("[role=alert]"))
  await page.$eval("input[type=email]", (e) => (e.value = ""))
  await page.type("input[type=email]", "creator+hello@example.com")
  await Promise.all([page.waitForNavigation(), page.keyboard.press("Enter")])
  const signup = new URL(page.url())
  assert.equal(signup.pathname, "/signup")
  assert.equal(signup.searchParams.get("email"), "creator+hello@example.com")
  assert.equal(signup.searchParams.get("intent"), "sell")
  await page.goto(origin)
  await Promise.all([
    page.waitForNavigation(),
    page.click("button[type=submit]"),
  ])
  assert.equal(new URL(page.url()).pathname, "/signup")
  assert.equal(new URL(page.url()).searchParams.get("email"), "")
  await page.close()
  const nojs = await pageFor()
  await nojs.setJavaScriptEnabled(false)
  await nojs.goto(origin)
  assert.equal(
    await nojs.$eval('[data-active="true"]', (e) => e.textContent),
    "website.",
  )
  await nojs.type("input[type=email]", "nojs@example.com")
  await Promise.all([
    nojs.waitForNavigation(),
    nojs.click("button[type=submit]"),
  ])
  assert.equal(
    new URL(nojs.url()).searchParams.get("email"),
    "nojs@example.com",
  )
  assert.equal(nojs.videoRequests, 0)
  await nojs.close()
  console.log(
    "ok signup: invalid/blank/encoded email, Enter, native no-JS GET, seller intent; no live accounts created",
  )
} finally {
  await browser.close()
  await new Promise((r) => server.close(r))
  rmSync(out, { recursive: true, force: true })
}
