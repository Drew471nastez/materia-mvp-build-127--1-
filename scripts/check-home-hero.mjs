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
      'import React from "react"; import {renderToString} from "react-dom/server"; import {Hero} from "./components/marketing/hero"; import {BuildShowcase} from "./components/marketing/build-showcase"; process.stdout.write(renderToString(React.createElement(React.Fragment,null,React.createElement(Hero),React.createElement(BuildShowcase))));',
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
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Arial,system-ui,sans-serif}header{height:72px;display:flex;align-items:center;padding:0 24px;background:#16161a;color:#fff}header a{margin-left:auto}</style><script>window.__cls=0;window.__shifts=[];new PerformanceObserver(l=>l.getEntries().forEach(e=>{if(!e.hadRecentInput){window.__cls+=e.value;window.__shifts.push({value:e.value,time:e.startTime,sources:e.sources.map(s=>({node:s.node?.outerHTML?.slice(0,150),before:s.previousRect.toJSON(),after:s.currentRect.toJSON()}))})}})).observe({type:'layout-shift',buffered:true});</script></head><body><div id="platform-header-root" data-header-tone="dark" class="platform-header-depth"><header>Storelib <a href="/explore">Marketplace</a></header></div><main id="app">${ssr}</main><section style="height:1400px;background:#fff">Unrelated content</section><script src="/client.js"></script></body></html>`
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
    if (r.url().startsWith(origin)) {
      if (mode === "no-hydration" && r.url().includes("client.js"))
        return r.abort()
      return r.continue()
    }
    if (r.url().includes("1794404095596918.mp4")) {
      page.videoRequests++
      if (
        mode === "failure" ||
        (mode === "recover" && page.videoRequests === 1)
      )
        return r.abort("failed")
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
    if (process.env.HERO_FAST && width !== 768) continue
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
      const email = document.querySelector("input[type=email]"),
        signup = document.querySelector("[data-hero-signup]"),
        search = document.querySelector(".cinematic-search")
      const input = email.getBoundingClientRect(),
        btn = signup.querySelector("button").getBoundingClientRect()
      return {
        inputY: input.y,
        buttonY: btn.y,
        gap: btn.y - input.bottom,
        emailVisible: !!email.getClientRects().length,
        searchVisible: !!search.getClientRects().length,
      }
    })
    if (width < 768) {
      assert.ok(layout.emailVisible)
      assert.ok(layout.gap >= 10)
      assert.equal(layout.searchVisible, false)
    } else {
      assert.equal(layout.emailVisible, false)
      assert.ok(layout.searchVisible)
      assert.ok(
        await page.$eval(
          ".cinematic-desktop-signup",
          (e) => !!e.getClientRects().length,
        ),
      )
    }
    // All phrases fit the same reserved line, including narrow landscape and 320px.
    assert.ok(
      await page.$$eval(".cinematic-phrase", (els) =>
        els.every((e) => e.scrollWidth <= e.clientWidth + 1),
      ),
    )
    if (shots)
      await page.screenshot({ path: join(shots, `${width}x${height}.png`) })
    await page.click(".cinematic-motion")
    await page.waitForSelector('.cinematic-motion[aria-pressed="true"]')
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
  // Browser toolbar resizing must not stretch the content-driven mobile hero.
  {
    const page = await pageFor()
    await page.setViewport({ width: 390, height: 844 })
    await page.goto(origin, { waitUntil: "networkidle0" })
    const initial = (await page.evaluate(metrics)).hero.h
    for (const height of [650, 900, 568, 844]) {
      await page.setViewport({ width: 390, height })
      await pause(120)
      assert.equal(
        (await page.evaluate(metrics)).hero.h,
        initial,
        "stable height while mobile toolbar changes",
      )
    }
    assert.equal(
      await page.$eval(
        "#platform-header-root",
        (e) => getComputedStyle(e).backgroundColor,
      ),
      "rgb(18, 18, 20)",
    )
    assert.equal(
      await page.$$eval(".cinematic-reassurance", (e) => e.length),
      0,
    )
    assert.ok(
      await page.$eval("input[type=email]", (e) =>
        getComputedStyle(e).backdropFilter.includes("blur(16px)"),
      ),
    )
    const setViewer = async (audience) => {
      await page.evaluate((a) => {
        localStorage.setItem(
          "_sl_auth_v1",
          JSON.stringify({
            signedIn: a !== "guest",
            isSeller: a === "creator",
            userId: a === "guest" ? null : "test-user",
          }),
        )
        dispatchEvent(new Event("storelib:auth-snapshot"))
      }, audience)
      await page.waitForFunction(
        (a) =>
          document.querySelector(".cinematic-actions").dataset.audience === a,
        {},
        audience,
      )
    }
    for (const audience of ["buyer", "creator", "guest"]) {
      await setViewer(audience)
      assert.equal(
        (await page.evaluate(metrics)).hero.h,
        initial,
        "auth changes preserve hero height",
      )
      if (audience !== "guest") {
        assert.equal(
          await page.$eval(
            "input[type=email]",
            (e) => !!e.getClientRects().length,
          ),
          false,
        )
        assert.equal(
          await page.$eval(".cinematic-account", (e) => e.getAttribute("href")),
          audience === "creator" ? "/app" : "/account",
        )
        assert.ok(
          await page.$eval(
            ".cinematic-search",
            (e) => !!e.getClientRects().length,
          ),
        )
      }
    }
    await page.$eval("video", (v) => {
      v.pause()
      Object.defineProperty(v, "paused", { configurable: true, value: false })
      Object.defineProperty(v, "readyState", { configurable: true, value: 2 })
      v.dispatchEvent(new Event("waiting"))
    })
    await pause(4200)
    assert.equal(
      await page.$eval("video", (v) => v.dataset.ready),
      "false",
      "long stalls return to poster without blocking controls",
    )
    await page.$eval("video", (v) => {
      delete v.paused
      delete v.readyState
      return v.play()
    })
    await page.waitForSelector('video[data-ready="true"]')
    const before = await page.$$eval("[data-showcase-word]", (els) =>
      els.map((e) => getComputedStyle(e).color),
    )
    await page.$eval("[data-build-showcase]", (e) =>
      e.scrollIntoView({ block: "start", behavior: "instant" }),
    )
    await pause(150)
    const after = await page.$$eval("[data-showcase-word]", (els) =>
      els.map((e) => getComputedStyle(e).color),
    )
    assert.notDeepEqual(before, after, "words fill with scroll")
    assert.ok(after.every((c) => c === "rgb(248, 248, 248)"))
    const track = ".build-showcase-track"
    const start = await page.$eval(track, (e) => e.scrollLeft)
    await page.mouse.move(0, 0)
    await pause(4400)
    assert.ok(
      await page.$eval(track, (e, start) => e.scrollLeft > start + 20, start),
      "showcase advances automatically",
    )
    const box = await (await page.$(track)).boundingBox()
    const prior = await page.$eval(track, (e) => e.scrollLeft)
    await page.mouse.move(box.x + 280, box.y + 80)
    await page.mouse.down()
    await page.mouse.move(box.x + 70, box.y + 80, { steps: 12 })
    assert.ok(
      await page.$eval(track, (e, prior) => e.scrollLeft > prior + 150, prior),
      "mouse drag follows the pointer",
    )
    await page.mouse.up()
    await pause(500)
    await page.click('[aria-label="Pause showcase"]')
    const held = await page.$eval(track, (e) => e.scrollLeft)
    await pause(4200)
    assert.equal(await page.$eval(track, (e) => e.scrollLeft), held)
    if (shots)
      await page.screenshot({ path: join(shots, "showcase-mobile.png") })
    await page.setViewport({ width: 1440, height: 900 })
    await page.evaluate(() => scrollTo(0, 0))
    await pause(200)
    await setViewer("creator")
    assert.equal(
      await page.$eval(".cinematic-account", (e) => e.textContent),
      "Dashboard",
    )
    await setViewer("buyer")
    assert.equal(
      await page.$eval(".cinematic-account", (e) => e.textContent),
      "Account",
    )
    await setViewer("guest")
    assert.equal(
      await page.$eval(
        ".cinematic-desktop-signup",
        (e) => getComputedStyle(e).backgroundColor,
      ),
      "rgb(124, 58, 237)",
    )
    await page.type(".cinematic-search input", "templates & courses")
    await Promise.all([
      page.waitForNavigation(),
      page.click(".cinematic-search button"),
    ])
    assert.equal(
      new URL(page.url()).searchParams.get("q"),
      "templates & courses",
    )
    await page.close()
    console.log(
      "ok refinements: stable mobile toolbar/auth height, dark header, glass input, live buyer/creator controls, marketplace search, scroll-filled showcase, autoplay and mouse dragging",
    )
  }
  // Touch input and landscape toolbar changes, with actual coarse-pointer media queries.
  {
    const page = await pageFor()
    await page.setViewport({
      width: 844,
      height: 390,
      isMobile: true,
      hasTouch: true,
    })
    await page.goto(origin, { waitUntil: "networkidle0" })
    const height = (await page.evaluate(metrics)).hero.h
    for (const h of [500, 560, 390]) {
      await page.setViewport({
        width: 844,
        height: h,
        isMobile: true,
        hasTouch: true,
      })
      await pause(160)
      assert.equal(
        (await page.evaluate(metrics)).hero.h,
        height,
        "landscape toolbar does not change height/typography",
      )
    }
    await page.setViewport({
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
    })
    await page.$eval("[data-build-showcase]", (e) =>
      e.scrollIntoView({ block: "start", behavior: "instant" }),
    )
    await pause(200)
    const track = ".build-showcase-track",
      box = await (await page.$(track)).boundingBox(),
      before = await page.$eval(track, (e) => e.scrollLeft),
      client = await page.createCDPSession()
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 300, y: box.y + 85 }],
    })
    for (let i = 1; i <= 12; i++) {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: 300 - i * 20, y: box.y + 85 }],
      })
      await pause(16)
    }
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    })
    await pause(400)
    assert.ok(
      await page.$eval(
        track,
        (e, before) => e.scrollLeft > before + 60,
        before,
      ),
      "native finger swipe moves the carousel",
    )
    assert.deepEqual(page.errors, [])
    await page.close()
    console.log(
      "ok touch: coarse-pointer landscape toolbar stability and native carousel swiping",
    )
  }
  for (const mode of [
    "reduced-motion",
    "reduced-data",
    "failure",
    "slow",
    "autoplay-denied",
    "no-intersection-observer",
    "no-hydration",
    "recover",
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
    await pause(mode === "slow" ? 400 : mode === "failure" ? 6400 : 2400)
    assert.equal(
      await page.$eval("video", (v) => v.dataset.ready),
      mode === "no-intersection-observer" ||
        mode === "no-hydration" ||
        mode === "recover"
        ? "true"
        : "false",
      `${mode} poster`,
    )
    assert.ok(
      await page.$eval(
        ".cinematic-poster",
        (i) => i.complete && i.naturalWidth > 0,
      ),
    )
    assert.ok(await page.$eval("button[type=submit]", (b) => !b.disabled))
    if (mode === "failure")
      assert.ok(page.videoRequests <= 3, "network retries are bounded")
    assert.deepEqual(page.errors, [])
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
  await page.setViewport({ width: 390, height: 844 })
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
  await nojs.setViewport({ width: 390, height: 844 })
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
