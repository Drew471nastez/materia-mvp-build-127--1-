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
const carouselPosition = el => {
  const slides = [...el.querySelectorAll('[data-showcase-slide]')]
  const period = slides.reduce((sum,e)=>sum+e.getBoundingClientRect().width,0) + (parseFloat(getComputedStyle(el).getPropertyValue('--showcase-gap'))||0)*slides.length
  const position = el.getBoundingClientRect().left - slides[0].getBoundingClientRect().left
  return ((position % period) + period) % period
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms))
const shots = process.env.HERO_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const alias = {
  name: "root-alias",
  setup(b) {
    b.onResolve({ filter: /^next\/navigation$/ }, () => ({
      path: "navigation",
      namespace: "hero-navigation",
    }))
    b.onLoad({ filter: /.*/, namespace: "hero-navigation" }, () => ({
      contents: 'export const usePathname = () => "/"',
      loader: "js",
    }))
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
      'import React from "react"; import {renderToString} from "react-dom/server"; import {BodyScrollRestorer} from "./components/body-scroll-restorer"; import {Hero} from "./components/marketing/hero"; import {BuildShowcase} from "./components/marketing/build-showcase"; import {LandingStory} from "./components/marketing/landing-story"; process.stdout.write(renderToString(React.createElement(React.Fragment,null,React.createElement(BodyScrollRestorer),React.createElement("div",{"data-homepage-surface":"",className:"bg-white"},React.createElement(Hero),React.createElement(LandingStory,null,React.createElement(BuildShowcase))))));',
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
    if (r.url().includes("1794426925775466.mp4")) {
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
    if (
      process.env.HERO_FAST &&
      width !== Number(process.env.HERO_FAST_WIDTH || 768)
    )
      continue
    const page = await pageFor()
    await page.setViewport({ width, height })
    await page.goto(origin, { waitUntil: "networkidle0" })
    await page.waitForSelector('video[data-ready="true"]')
    const before = await page.evaluate(metrics)
    await page.evaluate(() => {
      const line = document.querySelector(".cinematic-phrases")
      window.__phraseChanges = [
        document.querySelector('[data-active="true"]').textContent,
      ]
      new MutationObserver(() => {
        const phrase = document.querySelector(
          '[data-active="true"]',
        ).textContent
        if (window.__phraseChanges.at(-1) !== phrase)
          window.__phraseChanges.push(phrase)
      }).observe(line, {
        subtree: true,
        attributes: true,
        attributeFilter: ["data-active"],
      })
    })

    assert.equal(before.doc, width, "no horizontal overflow")
    assert.equal(before.hero.x, 0)
    assert.equal(before.hero.w, width)
    assert.equal(
      await page.$eval("video", (v) => getComputedStyle(v).objectFit),
      "cover",
    )
    assert.equal(await page.$$eval("video", (v) => v.length), 1)
    if (width < 640) {
      const d = await page.$eval(".cinematic-description", (e) => ({
        h: e.getBoundingClientRect().height,
        line: parseFloat(getComputedStyle(e).lineHeight),
        overflow: e.scrollWidth > e.clientWidth + 1,
        align: getComputedStyle(e).textAlign,
      }))
      assert.ok(
        Math.abs(d.h - d.line * 2) < 1 && !d.overflow,
        `${width}: centered two-line subheading without clipping`,
      )
      assert.equal(d.align, "center")
      assert.ok(
        await page.$eval(
          ".cinematic-heading",
          (e) => parseFloat(getComputedStyle(e).fontSize) >= 44,
        ),
      )
    }

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
    if (cycles === 7) {
      await page.waitForFunction(
        () => new Set(window.__phraseChanges).size === 7,
        { timeout: 20000 },
      )
      const observed = await page.evaluate(() => window.__phraseChanges)
      const phrases = [
        "website.",
        "online store.",
        "link in bio.",
        "community.",
        "landing page.",
        "brand.",
        "business.",
      ]
      for (let i = 1; i < observed.length; i++)
        assert.equal(
          observed[i],
          phrases[(phrases.indexOf(observed[i - 1]) + 1) % 7],
          "phrases preserve their full ordered cycle",
        )
    }
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
    const copy = await page.$eval(".cinematic-description", (e) => ({
      text: e.textContent.replace(/\s+/g, " ").trim(),
      height: e.getBoundingClientRect().height,
      line: parseFloat(getComputedStyle(e).lineHeight),
      overflow: e.scrollWidth > e.clientWidth + 1,
      gap:
        e.getBoundingClientRect().top -
        document.querySelector(".cinematic-heading").getBoundingClientRect()
          .bottom,
      align: getComputedStyle(e).textAlign,
    }))
    assert.equal(
      copy.text,
      "Everything you need to create, sell, and grow your business. All in one place",
    )
    assert.ok(
      Math.abs(copy.height - copy.line * 2) < 1 && !copy.overflow,
      "mobile subheading is exactly two unclipped lines",
    )
    assert.equal(copy.align, "center")
    assert.ok(copy.gap >= 36 && copy.gap <= 48)
    assert.equal(
      await page.$eval(
        "[data-homepage-surface]",
        (e) => getComputedStyle(e).overflowY,
      ),
      "visible",
    )
    assert.ok(
      await page.$eval(
        ".cinematic-media",
        (e) => Number(getComputedStyle(e).zIndex) >= 0,
      ),
    )

    await page.evaluate(() => {
      const fixture = document.createElement("div")
      fixture.id = "search-tail-audit"
      fixture.innerHTML =
        '<div data-header-tone="dark"><div data-header-search-tail><div><span aria-hidden="true" class="h-5 w-px bg-neutral-200"></span><button class="search-categories-trigger bg-neutral-100 hover:bg-neutral-100/80">Categories</button></div></div></div>'
      document.body.append(fixture)
    })
    const darkTrigger = "#search-tail-audit .search-categories-trigger"
    await page.hover(darkTrigger)
    assert.equal(
      await page.$eval(darkTrigger, (e) => getComputedStyle(e).backgroundColor),
      "rgba(255, 255, 255, 0.09)",
    )
    assert.equal(
      await page.$eval(
        "#search-tail-audit span",
        (e) => getComputedStyle(e).backgroundColor,
      ),
      "rgba(255, 255, 255, 0.15)",
    )
    await page.$eval("#search-tail-audit", (e) => e.remove())
    await page.evaluate(() => scrollTo(0, 0))

    assert.equal(
      await page.$$eval(".build-showcase button", (e) => e.length),
      0,
    )
    assert.equal(
      await page.$eval(".build-showcase-card", (e) =>
        Math.round(e.getBoundingClientRect().width),
      ),
      388,
    )
    const showcaseStyle = await page.$eval('[data-build-showcase]', e => ({bg:getComputedStyle(e).backgroundColor, radius:getComputedStyle(e).borderRadius, margin:getComputedStyle(e).marginTop}))
    assert.deepEqual(showcaseStyle, {bg:'rgb(9, 9, 9)',radius:'28px',margin:'-12px'}, 'rounded showcase overlaps the square hero')
    assert.ok(await page.$eval('[data-landing-story]', e => getComputedStyle(e).backgroundImage.includes('rgb(9, 9, 9)')), 'rounded top corners have a matching black backing')
    assert.ok(await page.$eval('.build-showcase-viewport', e => e.getBoundingClientRect().left >= 0 && e.getBoundingClientRect().left <= 2), 'the mobile carousel spans the section width')
    assert.equal(await page.$eval('.cinematic-period', e => getComputedStyle(e).color), await page.$eval('.cinematic-phrases', e => getComputedStyle(e).color), 'headline dot inherits the headline color')
    await page.focus("input[type=email]")
    assert.equal(
      await page.$eval(
        "input[type=email]",
        (e) => getComputedStyle(e).outlineStyle,
      ),
      "none",
    )
    assert.equal(
      await page.$eval(
        ".cinematic-signup button",
        (e) => getComputedStyle(e).borderRadius,
      ),
      await page.$eval(
        "input[type=email]",
        (e) => getComputedStyle(e).borderRadius,
      ),
    )
    for (const height of [650, 900, 568, 844]) {
      await page.setViewport({ width: 390, height })
      await pause(120)
      assert.equal(
        (await page.evaluate(metrics)).hero.h,
        initial,
        "stable height while mobile toolbar changes",
      )
    }
    const stableGalleryHeight=await page.$eval('[data-build-showcase]',e=>e.getBoundingClientRect().height)
    await page.evaluate(()=>{document.body.style.setProperty('--home-env-bottom','34px');document.body.style.setProperty('--home-env-top','44px');dispatchEvent(new Event('resize'))})
    await pause(150)
    assert.equal((await page.evaluate(metrics)).hero.h,initial,'toolbar safe-area changes do not resize the hero')
    assert.equal(await page.$eval('[data-build-showcase]',e=>e.getBoundingClientRect().height),stableGalleryHeight,'toolbar safe-area changes do not resize the showcase')
    await page.evaluate(()=>{document.body.style.removeProperty('--home-env-bottom');document.body.style.removeProperty('--home-env-top')})
    assert.equal(
      await page.$eval(
        "#platform-header-root",
        (e) => getComputedStyle(e).backgroundColor,
      ),
      "rgba(0, 0, 0, 0)",
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
    await page.$eval("[data-build-showcase]", (e) =>
      e.scrollIntoView({ block: "start", behavior: "instant" }),
    )
    await pause(150)
    assert.equal(await page.$eval('[data-story-heading]', e => e.style.getPropertyValue('--story-progress')), '1.000', 'headline fills completely when scrolled into view')
    assert.ok(await page.$$eval('[data-story-accent]', els => els.length === 0), 'showcase uses neutral scroll-filled text')
    const formats=await page.$$eval('[data-showcase-group]',es=>es.map(e=>[...e.querySelectorAll('[data-showcase-slide]')].map(c=>c.dataset.format)))
    assert.deepEqual(formats,Array.from({length:3},()=>['wide','portrait','wide']),'each desktop page contains one complete composition')
    const track='.build-showcase-track'
    const index=()=>page.$eval(track,e=>Number(e.dataset.showcaseIndex))
    const box=await(await page.$(track)).boundingBox()
    const start=await index();await pause(1100)
    assert.equal(await index(),start,'gallery rests initially')
    await pause(5300)
    assert.equal(await index(),(start+1)%9,'autoplay advances one mobile page')
    const settled=await index();await pause(900);assert.equal(await index(),settled,'autoplay rests between pages')
    await page.mouse.move(box.x+260,box.y+90);await page.mouse.down();await page.mouse.move(box.x+240,box.y+90,{steps:5});await page.mouse.up();await pause(1100)
    assert.ok([settled,(settled+1)%9].includes(await index()),'a small flick settles without racing through slides')
    const beforeDrag=await index()
    await page.mouse.move(box.x+280,box.y+90);await page.mouse.down();await page.mouse.move(box.x+60,box.y+90,{steps:12});assert.ok(await page.$eval('[data-build-showcase]',e=>e.hasAttribute('data-showcase-browsing')),'heading softens while dragging');await page.mouse.up();await pause(1100)
    assert.equal(await index(),(beforeDrag+1)%9,'a drag advances exactly one complete mobile slide')
    const resumeStart=await index();await page.focus(track);await pause(10000)
    assert.equal(await index(),(resumeStart+1)%9,'autoplay resumes with one settled page after interaction')
    await page.keyboard.press('Space');assert.equal(await page.$eval(track,e=>e.dataset.autoplayPaused),'true')
    await page.$eval(track,e=>e.blur());const held=await index();await pause(5300);assert.equal(await index(),held,'Space pauses autoplay')
    await page.mouse.move(box.x+100,box.y+90);await page.mouse.wheel({deltaX:120,deltaY:0});await pause(1100)
    assert.equal(await index(),(held+1)%9,'horizontal wheel advances one complete slide')
    const verticalBefore=await page.evaluate(()=>scrollY);await page.mouse.wheel({deltaX:0,deltaY:120});await pause(350)
    assert.ok(await page.evaluate(y=>scrollY>y+40,verticalBefore),'vertical wheel scrolling stays native')
    // Leaving during a transition must not leave a half-page frozen on return.
    await page.focus(track)
    await page.keyboard.press("ArrowRight")
    await pause(250)
    await page.evaluate(() => scrollTo(0, 0))
    await pause(180)
    await page.$eval('[data-build-showcase]', e => e.scrollIntoView({block: 'start', behavior: 'instant'}))
    await pause(1200)
    assert.ok(await page.$eval(track, e => {
      const active = e.querySelectorAll('[data-showcase-slide]')[Number(e.dataset.showcaseIndex)]
      return Math.abs(active.getBoundingClientRect().left - e.getBoundingClientRect().left) < 2
    }), 'returning to an interrupted gallery settles to a complete page')
    if (shots)
      await page.screenshot({ path: join(shots, "showcase-mobile.png") })
    await page.setViewport({ width: 1440, height: 900 })
    await page.evaluate(() => scrollTo(0, 0))
    await pause(200)
    await page.$eval('[data-build-showcase]',e=>e.scrollIntoView({block:'start',behavior:'instant'}))
    await page.focus('.build-showcase-track');await page.keyboard.press('Home');await pause(1200)
    const desktop=await page.$$eval('[data-showcase-group]',es=>es[0].querySelectorAll('[data-showcase-slide]').length)
    assert.equal(desktop,3)
    const desktopStart=await page.$eval('.build-showcase-track',e=>Number(e.dataset.showcaseIndex))
    const desktopBox=await(await page.$('.build-showcase-track')).boundingBox()
    await page.mouse.move(desktopBox.x+400,desktopBox.y+100);await page.mouse.down();await page.mouse.move(desktopBox.x+180,desktopBox.y+100,{steps:15});await page.mouse.up();await pause(1200)
    assert.equal(await page.$eval('.build-showcase-track',e=>Number(e.dataset.showcaseIndex)),(desktopStart+1)%3,'desktop dragging snaps to the next entire group')
    await page.evaluate(()=>scrollTo(0,0))
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
  {
    const page = await pageFor()
    await page.setViewport({
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
    })
    await page.goto(origin, { waitUntil: "networkidle0" })
    // A closed, kept portal must not keep an orphaned body lock alive.
    await page.evaluate(() => {
      const wrap = document.createElement("div")
      wrap.id = "lock-test"
      wrap.setAttribute("data-radix-popper-content-wrapper", "")
      wrap.innerHTML =
        '<div data-slot="select-content" data-state="open" style="visibility:hidden">Positioning</div>'
      document.body.append(wrap)
      const platform = document.createElement("style")
      platform.id = "platform-style-test"
      platform.textContent = "body[data-scroll-locked] .brand {color:red}"
      const lock = document.createElement("style")
      lock.id = "injected-lock-style-test"
      lock.textContent =
        "body[data-scroll-locked]{overflow:hidden!important}.with-scroll-bars-hidden{overflow:hidden!important}"
      document.head.append(platform, lock)

      document.body.style.overflow = "hidden"
    })
    await pause(180)
    assert.equal(
      await page.evaluate(() => document.body.style.overflow),
      "hidden",
      "an open Select retains its lock while positioning",
    )
    await page.evaluate(() => {
      const content = document.querySelector("#lock-test > div")
      content.style.visibility = "visible"
      const style = document.createElement("style")
      style.id = "infinite-spinner-probe"
      style.textContent =
        "@keyframes spinnerProbe{to{transform:rotate(360deg)}}"
      document.head.append(style)
      content.innerHTML =
        '<span style="display:block;animation:spinnerProbe 1s linear infinite">Loading</span>'
      content.setAttribute("data-state", "closed")
    })
    await page.waitForFunction(() => document.body.style.overflow !== "hidden")
    assert.ok(
      await page.$("#platform-style-test"),
      "shared styles mentioning locks must survive recovery",
    )
    assert.equal(
      await page.$("#injected-lock-style-test"),
      null,
      "injected lock-only styles are removed",
    )
    await page.$eval("#platform-style-test", (e) => e.remove())
    await page.$eval("#infinite-spinner-probe", (e) => e.remove())
    await page.evaluate(() => {
      const style = document.createElement("style")
      style.id = "class-lock-style-test"
      style.textContent =
        ".block-interactivity-probe{pointer-events:none}.allow-interactivity-probe{pointer-events:all}"
      document.head.append(style)
      document.body.classList.add("block-interactivity-probe")
    })
    await page.waitForFunction(
      () => !document.body.classList.contains("block-interactivity-probe"),
    )
    assert.equal(
      await page.$("#class-lock-style-test"),
      null,
      "orphaned class-only interaction locks are cleared",
    )

    await page.evaluate(() => {
      const content = document.querySelector("#lock-test > div")
      content.style.visibility = "visible"
      content.setAttribute("data-state", "open")
      document.body.style.overflow = "hidden"
      const style = document.createElement("style")
      style.id = "scroll-exit-test"
      style.textContent =
        "@keyframes scrollExitProbe{from{opacity:1}to{opacity:0}}"
      document.head.append(style)
    })
    await pause(80)
    await page.evaluate(() => {
      const content = document.querySelector("#lock-test > div")
      content.style.animation = "scrollExitProbe 300ms linear both"
      content.setAttribute("data-state", "closed")
    })
    await pause(100)
    assert.equal(
      await page.evaluate(() => document.body.style.overflow),
      "hidden",
      "closing overlay keeps its lock during the exit animation",
    )
    await page.waitForFunction(() => document.body.style.overflow !== "hidden")
    await page.evaluate(() =>
      document.querySelector("#scroll-exit-test").remove(),
    )

    await page.evaluate(() => {
      document.querySelector("#lock-test").remove()
      scrollTo(0, 260)
      const sheet = document.createElement("div")
      sheet.id = "fixed-lock-test"
      sheet.setAttribute("role", "dialog")
      sheet.setAttribute("data-state", "open")
      sheet.textContent = "Open menu"
      document.body.append(sheet)
      document.body.style.position = "fixed"
      document.body.style.top = "-260px"
      document.body.style.overflow = "hidden"
    })
    await pause(150)
    assert.equal(
      await page.evaluate(() => document.body.style.position),
      "fixed",
      "genuine open menu stays locked",
    )
    await page.evaluate(() =>
      document
        .querySelector("#fixed-lock-test")
        .setAttribute("aria-hidden", "true"),
    )
    await page.waitForFunction(() => document.body.style.position !== "fixed")
    assert.ok(
      Math.abs((await page.evaluate(() => scrollY)) - 260) < 2,
      "orphaned fixed-body lock restores scroll position",
    )
    await page.evaluate(() => {
      document.querySelector("#fixed-lock-test").remove()
      scrollTo(0, 500)
    })
    const cdp = await page.createCDPSession()
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 180, y: 300 }],
    })
    for (let i = 1; i <= 12; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: 180, y: 300 + i * 20 }],
      })
      await pause(16)
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    })
    await pause(250)
    assert.ok(
      await page.evaluate(() => scrollY < 490),
      "scrolling back up works after orphan cleanup",
    )
    await page.evaluate(() => scrollTo(0, 0))
    await page.waitForSelector('video[data-ready="true"]')
    const source = await page.$eval("video", (v) => v.currentSrc)
    await page.$eval("video", (v) => v.pause())
    await page.waitForFunction(() => !document.querySelector("video").paused)
    assert.equal(
      await page.$eval("video", (v) => v.currentSrc),
      source,
      "unexpected pause resumes the same decoder/source",
    )
    assert.deepEqual(page.errors, [])
    await page.close()
    console.log(
      "ok mobile recovery: positioned/open overlays remain protected; kept closed overlays release stale locks, preserve offset and allow upward touch scrolling; unsolicited media pause resumes",
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
      before = await page.$eval(track, carouselPosition),
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
    const touchAfter = await page.$eval(track, carouselPosition)
    assert.ok(
      Math.abs(touchAfter - before) > 60,
      "native finger swipe moves the carousel",
    )
    const verticalStart=await page.evaluate(()=>scrollY)
    await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:200,y:box.y+100}]})
    for(let i=1;i<=10;i++){await client.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:200,y:box.y+100-i*14}]});await pause(16)}
    await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await pause(300)
    assert.ok(await page.evaluate(y=>scrollY>y+40,verticalStart),'vertical finger swipes remain native over Keen Free Mode')
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
      mode === "autoplay-denied"
        ? await page.$eval("video", v => v.readyState >= 2 && !v.error ? "true" : "false")
        : mode === "no-intersection-observer" || mode === "no-hydration" || mode === "recover" ? "true" : "false",
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
  {
    const page = await pageFor()
    await page.evaluateOnNewDocument(() => {
      const play = HTMLMediaElement.prototype.play
      let blocked = true
      HTMLMediaElement.prototype.play = function () {
        if (blocked) {
          this.autoplay = false
          this.pause()
          return Promise.reject(
            new DOMException("Temporarily backgrounded", "NotAllowedError"),
          )
        }
        return play.call(this)
      }
      window.__allowResume = () => {
        blocked = false
      }
    })
    await page.goto(origin, { waitUntil: "networkidle0" })
    assert.equal(await page.$eval("video", (v) => v.paused), true)
    await page.evaluate(() => {
      window.__allowResume()
      dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))
      dispatchEvent(new Event("focus"))
    })
    await page.waitForSelector('video[data-ready="true"]')
    assert.equal(await page.$eval("video", (v) => v.paused), false)
    await page.click(".cinematic-motion")
    await page.evaluate(() => dispatchEvent(new Event("focus")))
    await pause(250)
    assert.ok(
      await page.$eval("video", (v) => v.paused),
      "manual pause survives tab restoration",
    )
    assert.deepEqual(page.errors, [])
    await page.close()
    console.log(
      "ok tab return: transient autoplay rejection recovers on BFCache/focus and manual pause is respected",
    )
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
