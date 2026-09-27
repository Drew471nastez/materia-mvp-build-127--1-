/**
 * ===========================================================================
 *  HOME'S BANNER: WHAT IT SAYS, WHERE IT SITS, HOW IT MOVES
 * ===========================================================================
 * The real Home (scripts/render-home-banner.tsx) in eight account states,
 * measured in Chromium:
 *
 *   SAYS      each state shows the announcements its rules call for, in
 *             order (lib/home/announcements.ts): payouts first when Stripe
 *             is not connected, the first sale this week, what Pro would
 *             have saved, and so on.
 *   FITS      at 360, 390, 430, 768, 1024, 1280, 1440 and 1920, every slide
 *             of every state: no text, button or segment inside the globe's
 *             circle (its atmosphere included), no title or line cut short,
 *             nothing outside the banner, one height for every slide, and no
 *             sideways scroll.
 *   PLAYS     by itself, about six seconds a slide (animations run 10x
 *             here); holds while a mouse is over it, while focus is inside
 *             it, while a finger is on it, while it is off screen and while
 *             the tab is hidden; the segments pick a slide, arrow keys move
 *             between them, a sideways swipe on a phone changes it; aria-live
 *             is off while it plays and polite after a change asked for.
 *   GOES      a button is a Link that goes where its announcement says, is
 *             fetched ahead on hover (prefetchAppPage) and tells the shell a
 *             navigation began (startNavigationLoading); the share one opens
 *             the share sheet instead.
 *   GLOBE     drawn (WebGL here, with the 2D fallback forced once); on a
 *             phone a finger dragged over the ball, any way, turns it and the page
 *             does not scroll, while the same drag on the text, or on the
 *             globe's box outside the ball, scrolls the page; a mouse gets a
 *             hand and a closed hand; with reduced motion it does not turn
 *             by itself and a change of slide is a jump, not a glide.
 *   FADES     a change of slide, by the clock, a segment or a swipe, is
 *             Swiper's fade (effect: "fade", crossFade): the two slides
 *             cross by opacity alone, nothing moves sideways, some text is
 *             on screen in every frame and the button stays on the same
 *             line. Sampled every frame, and drawn to a screenshot mid fade.
 *   COSTS     what one change costs the browser: how many elements have
 *             their style recalculated and for how long, against an idle
 *             window and against one node inserted inside the banner, which
 *             is what Swiper's loop would do on every step and what the
 *             :has() rules on <html> answer page wide.
 *   WAITS     how long a touchmove waits on the page's thread for a flick
 *             that starts on the banner, against one that starts below it,
 *             and against the same page with a blocking touchmove listener
 *             on the document, which is what Swiper attaches by default.
 *   COUNTS    1, 2, 3 and 5 announcements: one slide has no controls and
 *             never plays; two, three and five each fade on by themselves,
 *             come back round to the first, and answer a swipe.
 *             scripts/check-home-banner-motion.mjs measures the same change
 *             frame by frame, before and after.
 *
 *   node scripts/check-home-banner.mjs
 *   SHOTS=/some/dir node scripts/check-home-banner.mjs
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { homeProbePage } from "./home-probe-page.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const EXPECT = {
  new: ["welcome", "payouts", "first-product", "builder-intro"],
  product: ["payouts", "website"],
  payouts: ["website", "share"],
  firstsale: ["first-sale", "domain-pro", "automations", "newsletter"],
  selling: ["upgrade-saving", "automations", "newsletter"],
  milestone: ["milestone", "domain", "automations", "newsletter"],
  quiet: ["pro-offer"],
  pro: ["all-set"],
  five: ["first-sale", "milestone", "upgrade-saving", "automations", "newsletter"],
}
const HREF = {
  payouts: "/app/payouts",
  "first-product": "/app/products/new",
  "builder-intro": "/app/website-builder",
  "upgrade-saving": "/app/settings/billing/upgrade",
  website: "/app/website-builder",
  automations: "/app/emails/flow/new",
  newsletter: "/app/website-builder",
  domain: "/app/settings?tab=domains",
  "domain-pro": "/app/settings/billing/upgrade",
  "pro-offer": "/app/settings/billing/upgrade",
  "all-set": "/app/analytics",
  milestone: "/app/analytics",
}
const ALL_WIDTHS = [360, 390, 430, 768, 1024, 1280, 1440, 1920]

const { base, close } = await homeProbePage()
const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--no-proxy-server", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"],
})

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${typeof got === "string" ? got : JSON.stringify(got)}`}`)
  if (!ok) broken++
}

/** A page at a width: a phone below 768 (touch, 3x), a computer above (mouse, 2x). */
async function open(width, query, { reduce = false, force2d = false, height = null } = {}) {
  const page = await browser.newPage()
  const phone = width < 768
  await page.setViewport({ width, height: height ?? (phone ? 844 : 1000), deviceScaleFactor: phone ? 3 : 2, isMobile: phone, hasTouch: phone })
  if (reduce) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  await page.evaluateOnNewDocument((twoD) => {
    /* The globe's own frames, timed: its frame callback is called tick. */
    window.__globeFrames = []
    const raf = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (cb) => raf((t) => {
      if (cb.name !== "tick") return cb(t)
      const start = performance.now()
      cb(t)
      window.__globeFrames.push(performance.now() - start)
    })
    const get = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      if (twoD && /webgl/.test(type)) return null
      /* This browser's WebGL is software; say plainly that the globe may use it here. */
      return get.call(this, type, type === "webgl" && attrs ? { ...attrs, failIfMajorPerformanceCaveat: false } : attrs)
    }
  }, force2d)
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|probe\.invalid/.test(m.text())) errors.push(m.text()) })
  await page.goto(`${base}/app?${query}`, { waitUntil: "domcontentloaded", timeout: 120000 })
  await page.waitForSelector("[data-home-banner] [data-home-globe]", { timeout: 60000 })
  await page.evaluate(() => document.fonts.ready)
  await sleep(700)
  return { page, phone, errors }
}

const ids = (page) => page.evaluate(() => [...document.querySelectorAll("[data-home-banner] [data-announcement]")].map((s) => s.dataset.announcement))
const active = (page) => page.evaluate(() => document.querySelector('[data-home-banner] .home-banner-slide[data-slide="active"]')?.dataset.announcement ?? null)
const held = (page) => page.evaluate(() => document.querySelector("[data-home-banner] [role=tablist]")?.hasAttribute("data-held") ?? null)
const toBanner = (page) => page.evaluate(() => {
  const s = document.querySelector(".dashboard-scroll-container")
  const b = document.querySelector("[data-home-banner]")
  s.scrollTop += b.getBoundingClientRect().top - 220
  return s.scrollTop
})
/**
 * The ball's pixels, from a screenshot of the square around it: whichever
 * renderer drew them. Only the ball: the box's edge touches the text column,
 * and a slide changing beside it is not the globe turning.
 */
const globeHash = async (page) => {
  const clip = await page.evaluate(() => {
    const b = document.querySelector("[data-home-globe-box]").getBoundingClientRect()
    const r = b.width * 0.4
    return { x: b.left + b.width / 2 - r * 0.7, y: b.top + b.height / 2 - r * 0.7, width: r * 1.4, height: r * 1.4 }
  })
  return createHash("sha1").update(await page.screenshot({ clip, captureBeyondViewport: false })).digest("hex")
}
/** Whether the ball's pixels change within `ms`: a stalled frame on a busy machine is not a still globe. */
const turns = async (page, ms = 1500) => {
  const first = await globeHash(page)
  const end = Date.now() + ms
  while (Date.now() < end) {
    await sleep(250)
    if ((await globeHash(page)) !== first) return true
  }
  return false
}
/**
 * Whether the fade has landed: the slide showing is whole and every other one
 * is gone. With effect: "fade" every slide sits in the same place (Swiper
 * gives each one a transform of its own offset and leaves the wrapper still,
 * virtualTranslate), so where a slide is says nothing about whether it is
 * showing; its opacity says everything.
 */
const settled = (page) => page.evaluate(() => {
  const slides = [...document.querySelectorAll("[data-home-banner] .home-banner-slide")]
  return slides.every((s) => {
    const op = parseFloat(getComputedStyle(s).opacity)
    return s.dataset.slide === "active" ? op > 0.99 : op < 0.01
  })
})
/**
 * A real press on an element: a finger's tap on a phone, a mouse click on a
 * computer. A synthetic click() is not one, and the carousel (rightly) eats
 * the first click after a drag unless a press came between.
 */
const press = async (page, cdp, phone, selector, n = 0) => {
  const p = await page.evaluate((sel, k) => { const r = document.querySelectorAll(sel)[k].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, selector, n)
  if (phone) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y, radiusX: 4, radiusY: 4, force: 1 }] })
    await sleep(30)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  } else {
    await page.mouse.click(p.x, p.y)
  }
}
/** Waits until `fn` returns something truthy, or the time runs out; returns the last value. */
const until = async (fn, ms = 4000) => {
  const end = Date.now() + ms
  let v = await fn()
  while (!v && Date.now() < end) {
    await sleep(40)
    v = await fn()
  }
  return v
}

/** The viewport's height at a width: a phone's screen, or a laptop's. */
const viewH = (width) => (width < 768 ? 844 : 900)

/**
 * The page's own instruments for a fade: every frame's opacities and where the
 * titles and the buttons are, the clock brought to its last moments, and how
 * long each touchmove waited before the page ran it (a passive listener, which
 * changes nothing about how the page scrolls).
 */
function instrumentFade() {
  const banner = document.querySelector("[data-home-banner]")
  window.__frames = []
  window.__delays = []
  window.__follow = []
  /* Passive, so nothing about how the page scrolls changes: it only writes down when the page
     saw each move and how far the page had scrolled by then. __block is the other kind, for
     the comparison: the kind Swiper attaches to the document itself. */
  const scroller = document.querySelector(".dashboard-scroll-container")
  document.addEventListener("touchmove", (e) => {
    window.__delays.push(+(performance.now() - e.timeStamp).toFixed(1))
    window.__follow.push(scroller.scrollTop)
  }, { passive: true, capture: true })
  window.__block = () => {}
  window.__sample = () => {
    const b = banner.getBoundingClientRect()
    const s = [...banner.querySelectorAll(".home-banner-slide")].map((sl) => {
      const t = sl.querySelector(".home-banner-title").getBoundingClientRect()
      const c = sl.querySelector(".home-banner-cta").getBoundingClientRect()
      const cs = getComputedStyle(sl)
      return {
        id: sl.dataset.announcement,
        op: +parseFloat(cs.opacity).toFixed(3),
        dur: cs.transitionDuration,
        x: Math.round((t.left - b.left) * 10) / 10,
        y: Math.round((c.top - b.top) * 10) / 10,
      }
    })
    return { t: performance.now(), h: Math.round(b.height * 10) / 10, s }
  }
  window.__watch = (ms) => new Promise((done) => {
    window.__frames = []
    const end = performance.now() + ms
    const f = () => {
      window.__frames.push(window.__sample())
      if (performance.now() < end) requestAnimationFrame(f)
      else done(window.__frames)
    }
    requestAnimationFrame(f)
  })
  /** The showing segment's fill, brought to `lead` ms before its end: the clock's own change, now. */
  window.__ripen = (lead) => {
    const a = document.getAnimations().find((x) => /^home-banner-fill/.test(x.animationName) && x.effect?.target?.closest("[data-on]"))
    if (!a) return false
    a.currentTime = Math.max(0, a.effect.getTiming().duration - lead)
    return true
  }
}

/**
 * THE MIDDLE OF A CHANGE, STOOD STILL. A swipe does not draw the fade here
 * (followFinger is off: it asks for the change and Swiper draws the one fade
 * when the finger lifts), so the only way to stand in the middle of one is to
 * slow the browser's animation clock right down, let the banner's own clock
 * start a change, and watch for the moment the two announcements are level.
 */
async function midFade(page, cdp) {
  await page.evaluate(() => { const t = document.querySelectorAll("[data-home-banner] [role=tab]")[0]; t.focus(); t.click() })
  await sleep(500)
  await page.evaluate(() => document.activeElement?.blur())
  await sleep(300)
  const box = await page.evaluate(() => {
    const b = document.querySelector("[data-home-banner]").getBoundingClientRect()
    const c = document.querySelector('[data-home-banner] .home-banner-slide[data-slide="active"] .home-banner-cta').getBoundingClientRect()
    return { b: { x: b.left, y: b.top, width: b.width, height: b.height }, c: { left: c.left, top: c.top, width: c.width, height: c.height } }
  })
  const rest = await inkOf(page, box.c)
  await cdp.send("Animation.enable")
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.04 })
  const ops = () => page.evaluate(() => [...document.querySelectorAll("[data-home-banner] .home-banner-slide")].map((s) => +parseFloat(getComputedStyle(s).opacity).toFixed(3)))
  await page.evaluate(() => window.__ripen(40))
  let at = await ops()
  const end = Date.now() + 12000
  while (Date.now() < end && Math.max(...at) > 0.62) at = await ops()
  return { ops: at, cta: box.c, clip: box.b, rest: rest.rgb }
}
/** The animation clock back to its own speed. */
const fullSpeed = (cdp) => cdp.send("Animation.setPlaybackRate", { playbackRate: 1 })

/**
 * What a rectangle of the page actually comes to, in pixels: a screenshot of
 * it, handed back to the browser to decode, averaged. The button is sampled
 * inside its left padding, clear of the white letters on it.
 */
async function inkOf(page, cta) {
  const clip = { x: cta.left + 3, y: cta.top + cta.height / 2 - 3, width: 6, height: 6 }
  const shot = await page.screenshot({ clip, captureBeyondViewport: false, encoding: "base64" })
  return page.evaluate(async (data) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob())
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext("2d")
    ctx.drawImage(bitmap, 0, 0)
    const { data: px } = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
    let r = 0, g = 0, b = 0
    for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i + 1]; b += px[i + 2] }
    const n = px.length / 4
    const [R, G, B] = [r / n, g / n, b / n].map(Math.round)
    return { rgb: `rgb(${R}, ${G}, ${B})`, lum: Math.round(0.2126 * R + 0.7152 * G + 0.0722 * B) }
  }, shot)
}

/**
 * What the browser did while `fn` ran: how many elements had their style
 * recalculated, and how long style and layout took. From the browser's own
 * trace, which is the only place the element count is written down.
 */
async function traced(page, fn) {
  const dir = mkdtempSync(join(tmpdir(), "home-banner-trace-"))
  const file = join(dir, "trace.json")
  await page.tracing.start({ path: file, categories: ["devtools.timeline", "disabled-by-default-devtools.timeline"] })
  await fn()
  await page.tracing.stop()
  const events = JSON.parse(readFileSync(file, "utf8")).traceEvents ?? []
  rmSync(dir, { recursive: true, force: true })
  const of = (name) => events.filter((e) => e.name === name && e.ph === "X")
  const recalcs = of("UpdateLayoutTree")
  const layouts = of("Layout")
  const ms = (list) => +(list.reduce((n, e) => n + (e.dur ?? 0), 0) / 1000).toFixed(1)
  return {
    recalcs: recalcs.length,
    elements: recalcs.reduce((n, e) => n + (e.args?.elementCount ?? 0), 0),
    styleMs: ms(recalcs),
    layouts: layouts.length,
    layoutMs: ms(layouts),
  }
}

/** Every slide of the banner at this width: where things are. */
async function measureSlides(page) {
  const list = await ids(page)
  const out = []
  for (let i = 0; i < list.length; i++) {
    if (list.length > 1) {
      /* Focus inside the banner holds the clock, so the slide measured is the one picked, at rest. */
      await page.evaluate((n) => { const tab = document.querySelectorAll("[data-home-banner] [role=tab]")[n]; tab.focus(); tab.click() }, i)
      /* And the carousel has come to rest: measured mid-way the slide is still on its way in. */
      await until(() => settled(page), 3000)
    }
    out.push(await page.evaluate(() => {
      const b = document.querySelector("[data-home-banner]")
      const br = b.getBoundingClientRect()
      const box = b.querySelector("[data-home-globe-box]").getBoundingClientRect()
      const cx = box.left + box.width / 2
      const cy = box.top + box.height / 2
      /* The ball is 0.4 of the box and its atmosphere reaches 0.452 (components/app/home/globe-scene). */
      const r = box.width * 0.452
      const slide = b.querySelector('.home-banner-slide[data-slide="active"]')
      const parts = [".home-banner-eyebrow", ".home-banner-title", ".home-banner-line", ".home-banner-cta"].map((c) => slide.querySelector(c))
      const tabs = b.querySelector("[role=tablist]")
      const rects = [...parts, tabs].filter(Boolean).map((el) => ({ what: el.getAttribute("role") === "tablist" ? "segments" : el.className.split(" ")[0], r: el.getBoundingClientRect() }))
      const inCircle = (rc) => {
        const nx = Math.max(rc.left, Math.min(cx, rc.right))
        const ny = Math.max(rc.top, Math.min(cy, rc.bottom))
        return Math.hypot(nx - cx, ny - cy) < r
      }
      const cut = [slide.querySelector(".home-banner-title"), slide.querySelector(".home-banner-line")].filter((el) => el.scrollHeight > el.clientHeight + 1).map((el) => el.className)
      const scroller = document.querySelector(".dashboard-scroll-container")
      const cta = slide.querySelector(".home-banner-cta").getBoundingClientRect()
      return {
        id: slide.dataset.announcement,
        height: Math.round(br.height),
        /* The button's line, against the banner's own top, so every slide can be held to one: the
           fade crosses the two buttons over each other and a pixel out reads as a jump. */
        ctaY: Math.round((cta.top - br.top) * 10) / 10,
        ctaH: Math.round(cta.height * 10) / 10,
        overlap: rects.filter((x) => inCircle(x.r)).map((x) => x.what),
        outside: rects.filter((x) => x.r.bottom > br.bottom - 1 || x.r.right > br.right - 1 || x.r.left < br.left + 1 || x.r.top < br.top + 1).map((x) => x.what),
        cut,
        textRight: Math.round(Math.max(...rects.map((x) => x.r.right))),
        globeLeft: Math.round(cx - r),
        sideways: Math.max(document.documentElement.scrollWidth, scroller.scrollWidth) - window.innerWidth,
      }
    }))
  }
  return out
}

try {
  /* ── SAYS and FITS ─────────────────────────────────────────────────── */
  for (const [state, want] of Object.entries(EXPECT)) {
    const widths = state === "selling" || state === "firstsale" ? ALL_WIDTHS : [360, 1440]
    for (const width of widths) {
      const { page, errors } = await open(width, `state=${state}`)
      await sleep(400)
      const got = await ids(page)
      console.log(`\n${state} at ${width}`)
      expect(JSON.stringify(got) === JSON.stringify(want), `says ${want.join(", ")}`, got)
      if (SHOTS) {
        await toBanner(page)
        await sleep(300)
        await (await page.$("[data-home-banner]")).screenshot({ path: join(SHOTS, `banner-${state}-${width}.png`) })
      }
      const slides = await measureSlides(page)
      const heights = [...new Set(slides.map((s) => s.height))]
      expect(heights.length === 1, `one height for all ${slides.length} slides (${heights[0]}px)`, heights)
      const lines = [...new Set(slides.map((x) => `${x.ctaY}+${x.ctaH}`))]
      expect(lines.length === 1, `the button on one line on every slide (${lines[0]}px down, tall)`, lines)
      for (const s of slides) {
        expect(s.overlap.length === 0, `${s.id}: nothing inside the globe's circle`, s.overlap)
        expect(s.cut.length === 0, `${s.id}: no title or line cut short`, s.cut)
        expect(s.outside.length === 0, `${s.id}: all of it inside the banner`, s.outside)
      }
      expect(slides.every((s) => s.sideways <= 0), "no sideways scroll", slides.map((s) => s.sideways))
      expect(errors.length === 0, "no errors", errors.slice(0, 3))
      await page.close()
    }
  }

  /* ── PLAYS, GOES and GLOBE, on a phone and on a computer ───────────── */
  for (const width of [390, 1440]) {
    const { page, phone, errors } = await open(width, "state=selling")
    console.log(`\nbehaviour at ${width}`)
    const cdp = await page.createCDPSession()
    await cdp.send("Animation.enable")
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 10 })
    await toBanner(page)
    /* A mouse starts away from the banner. */
    if (!phone) await page.mouse.move(5, 995)
    await sleep(300)
    const list = await ids(page)

    const a0 = await active(page)
    expect((await page.evaluate(() => document.querySelector("[data-home-banner] .home-banner-track").getAttribute("aria-live"))) === "off", "aria-live off while it plays")
    const a1 = await until(async () => { const a = await active(page); return a !== a0 ? a : null })
    expect(!!a1, "it moves on by itself", [a0, a1])
    expect(list.indexOf(a1) === (list.indexOf(a0) + 1) % list.length, "to the next one", [a0, a1])

    /* Held: off screen (a short window, so the banner can be scrolled clear of it), then a hidden tab, then focus inside. */
    const view = page.viewport()
    await page.setViewport({ ...view, height: 360 })
    await page.evaluate(() => { const s = document.querySelector(".dashboard-scroll-container"); const b = document.querySelector("[data-home-banner]"); s.scrollTop = b.offsetTop > 700 ? 0 : 99999 })
    await sleep(250)
    const offA = await active(page)
    await sleep(1100)
    const offScreen = await page.evaluate(() => { const r = document.querySelector("[data-home-banner]").getBoundingClientRect(); return r.bottom < 0 || r.top > innerHeight })
    expect(offScreen && (await held(page)) && (await active(page)) === offA, "off screen it waits", { offScreen })
    await page.setViewport(view)
    await toBanner(page)
    await sleep(250)
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true })
      document.dispatchEvent(new Event("visibilitychange"))
    })
    const hidA = await active(page)
    await sleep(1100)
    expect((await held(page)) && (await active(page)) === hidA, "on a hidden tab it waits")
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true })
      document.dispatchEvent(new Event("visibilitychange"))
    })
    await page.focus('[data-home-banner] .home-banner-slide[data-slide="active"] .home-banner-cta')
    const focA = await active(page)
    await sleep(1100)
    expect((await held(page)) && (await active(page)) === focA, "with focus inside it waits")
    await page.evaluate(() => document.activeElement?.blur())
    await sleep(900)
    expect((await active(page)) !== focA, "and goes on when focus leaves")

    if (phone) {
      /* A finger resting on it holds it. */
      const t = await page.evaluate(() => { const r = document.querySelector("[data-home-banner] .home-banner-title:not(:empty)").closest("[data-home-banner]").getBoundingClientRect(); return { x: r.left + 40, y: r.top + 60 } })
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: t.x, y: t.y }] })
      /* At ten times the speed a slide lasts 0.6s: one may have been ending as the finger landed. */
      await sleep(200)
      const touchA = await active(page)
      await sleep(1100)
      expect((await held(page)) && (await active(page)) === touchA, "a finger on it holds it")
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      await sleep(1100)
      expect(!(await held(page)), "and lets go after")

      /*
        A sideways swipe on the text: left for the next, right for the one before. The clock back at its own
        speed, nine seconds a slide, so only the swipe moves it here. Not stopped: a playback rate of 0 stops
        the page's frame clock too, and Swiper's fade runs on the page's frames.
      */
      await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 })
      const swipe = async (dx) => {
        const x0 = t.x + (dx < 0 ? 160 : 0)
        /* Where every slide is, and how opaque, before the finger lands. */
        const look = () => page.evaluate(() => [...document.querySelectorAll("[data-home-banner] .home-banner-slide")]
          .map((c) => ({ id: c.dataset.announcement, op: +parseFloat(getComputedStyle(c).opacity).toFixed(3), x: Math.round(c.getBoundingClientRect().left) })))
        const from = await look()
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: t.y }] })
        for (let i = 1; i <= 10; i++) {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + (dx * i) / 10, y: t.y + i * 0.5 }] })
          await sleep(16)
        }
        /* Mid swipe nothing has happened yet: a swipe asks for the change (followFinger is off) and
           Swiper draws the one fade when the finger lifts. Nothing fades under the thumb, nothing moves. */
        const mid = await look()
        const was = from.find((f) => f.op > 0.99)
        followed.push({
          dx,
          faded: +(was.op - mid.find((m) => m.id === was.id).op).toFixed(3),
          gained: +Math.max(...mid.map((m) => m.op - (from.find((f) => f.id === m.id)?.op ?? 0))).toFixed(3),
          moved: Math.max(...mid.map((m) => Math.abs(m.x - from.find((f) => f.id === m.id).x))),
        })
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
        await until(() => settled(page), 3000)
      }
      const followed = []
      const s0 = await active(page)
      await swipe(-150)
      const s1 = await active(page)
      expect(list.indexOf(s1) === (list.indexOf(s0) + 1) % list.length, "a swipe to the left shows the next", [s0, s1])
      await swipe(150)
      expect((await active(page)) === s0, "and to the right the one before", [s1, await active(page)])
      expect((await page.evaluate(() => document.querySelector("[data-home-banner] .home-banner-track").getAttribute("aria-live"))) === "polite", "a change asked for is read out")
      expect(followed.length === 2 && followed.every((m) => m.faded === 0 && m.gained === 0 && m.moved === 0),
        "a swipe asks for the change and nothing is drawn under the finger: the fade is the one that follows it", followed)
      const still = await page.evaluate(() => [...document.querySelectorAll("[data-home-banner] .home-banner-slide")].map((sl) => { const cs = getComputedStyle(sl); return `${cs.animationName}|${cs.transitionProperty}` }))
      expect(still.every((x) => x === "none|opacity"), "and a change is a transition on opacity and nothing else, never an animation", still)
      await cdp.send("Animation.setPlaybackRate", { playbackRate: 10 })
    } else {
      /* A mouse over it holds it. */
      const r = await page.evaluate(() => { const b = document.querySelector("[data-home-banner]").getBoundingClientRect(); return { x: b.left + 60, y: b.top + 40 } })
      await page.mouse.move(r.x, r.y)
      const hovA = await active(page)
      await sleep(1100)
      expect((await held(page)) && (await active(page)) === hovA, "a mouse over it holds it")
      await page.mouse.move(5, 995)
      await sleep(900)
      expect((await active(page)) !== hovA, "and it goes on when the mouse leaves")
    }

    /* The segments, as tabs: a click picks a slide, the arrow keys move between them. The clock at its own speed, as above. */
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 })
    await press(page, cdp, phone, "[data-home-banner] [role=tab]", 2)
    await sleep(80)
    expect((await active(page)) === list[2], "a segment picks its slide", await active(page))
    await page.focus('[data-home-banner] [role=tab][aria-selected="true"]')
    await page.keyboard.press("ArrowRight")
    await sleep(60)
    const k = await page.evaluate(() => ({ active: document.querySelector('[data-home-banner] .home-banner-slide[data-slide="active"]').dataset.announcement, focused: document.activeElement?.getAttribute("aria-selected"), live: document.querySelector("[data-home-banner] .home-banner-track").getAttribute("aria-live") }))
    expect(k.active === list[0] && k.focused === "true", "the right arrow moves to the next and focus follows", k)
    expect(k.live === "polite", "and it is read out")

    /* GOES: the button, as the sidebar's rows go. */
    await page.evaluate(() => {
      window.__navStarts = []
      window.addEventListener("nav-loading-start", (e) => window.__navStarts.push(e.detail?.href ?? null))
      window.__linked = null
      window.__prefetched = []
    })
    const cta = '[data-home-banner] .home-banner-slide[data-slide="active"] .home-banner-cta'
    const id = await active(page)
    await until(() => settled(page), 3000)
    if (!phone) await page.hover(cta)
    /* A finger's tap (its pointerdown fetches ahead), or a mouse's click after the hover. */
    await press(page, cdp, phone, cta)
    const went = await page.evaluate(() => ({ linked: window.__linked, starts: window.__navStarts, prefetched: window.__prefetched }))
    expect(went.linked === HREF[id], `${id}'s button goes to ${HREF[id]}`, went.linked)
    expect(went.starts.includes(HREF[id]), "and tells the shell a navigation began", went.starts)
    expect(went.prefetched.includes(HREF[id]), `and ${phone ? "a finger down" : "hovering"} fetched it ahead`, went.prefetched)
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 })

    /* GLOBE */
    await toBanner(page)
    await sleep(300)
    const renderer = await page.evaluate(() => document.querySelector("[data-home-globe-box]").dataset.renderer)
    expect(renderer === "webgl", "the globe is drawn with WebGL", renderer)
    expect(await turns(page), "the globe turns by itself")
    const grip = await page.evaluate(() => {
      const g = document.querySelector("[data-home-globe-grip]")
      const r = g.getBoundingClientRect()
      const box = document.querySelector("[data-home-globe-box]").getBoundingClientRect()
      const banner = document.querySelector("[data-home-banner]").getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, touch: getComputedStyle(g).touchAction, text: getComputedStyle(document.querySelector(".home-banner-text")).touchAction, box: { left: box.left, top: box.top, right: Math.min(box.right, banner.right), bottom: Math.min(box.bottom, banner.bottom) } }
    })
    expect(grip.touch === "none" && grip.text === "pan-y pinch-zoom", "a finger on the ball is the globe's (touch-action none), the text beside it scrolls the page (pan-y)", grip)
    /* The carousel stops where the grip starts: no point is both the globe's and the carousel's. */
    const apart = await page.evaluate(() => {
      const v = document.querySelector("[data-home-banner] .home-banner-text").getBoundingClientRect()
      const g = document.querySelector("[data-home-globe-grip]").getBoundingClientRect()
      return { carouselRight: Math.round(v.right * 10) / 10, gripLeft: Math.round(g.left * 10) / 10 }
    })
    expect(apart.carouselRight <= apart.gripLeft + 0.5, "the carousel ends where the globe's grip begins, and never under it", apart)
    if (phone) {
      const scrollTop = () => page.evaluate(() => document.querySelector(".dashboard-scroll-container").scrollTop)
      const drag = async (x, y, dy, dx = 2) => {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, radiusX: 8, radiusY: 8, force: 1 }] })
        for (let i = 1; i <= 16; i++) {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + i * dx, y: y + (dy * i) / 16, radiusX: 8, radiusY: 8, force: 1 }] })
          await sleep(16)
        }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
        await sleep(600)
      }
      const before = await scrollTop()
      await page.evaluate(() => {
        window.__gripped = false
        new MutationObserver(() => { if (document.querySelector("[data-home-globe-box]").hasAttribute("data-dragging")) window.__gripped = true })
          .observe(document.querySelector("[data-home-globe-box]"), { attributes: true })
      })
      /* Up over the ball: the globe tips under the finger and the page stays where it is. */
      const hUp = await globeHash(page)
      await drag(grip.x, grip.y, -120)
      const afterGlobe = await scrollTop()
      expect(Math.abs(afterGlobe - before) <= 1, "a finger dragged up over the ball does not scroll the page", `${before} -> ${afterGlobe}`)
      expect((await page.evaluate(() => window.__gripped)) && (await globeHash(page)) !== hUp, "it tips and turns the globe instead")
      await toBanner(page)
      await sleep(300)
      const grip2 = await page.evaluate(() => { const r = document.querySelector("[data-home-globe-grip]").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
      const h0 = await globeHash(page)
      const beforeSide = await scrollTop()
      /* Sideways over the ball: the globe turns, the page stays. */
      await drag(grip2.x - 40, grip2.y, 0, 6)
      expect(await page.evaluate(() => window.__gripped), "a sideways drag on the ball takes it")
      expect((await globeHash(page)) !== h0, "and turns the globe")
      expect(Math.abs((await scrollTop()) - beforeSide) <= 1, "without scrolling the page", `${beforeSide} -> ${await scrollTop()}`)
      const afterGlobe2 = await scrollTop()
      await drag(40, grip2.y, -120)
      const afterText = await scrollTop()
      expect(afterText - afterGlobe2 > 40, "the same drag on the text scrolls the page", `${afterGlobe2} -> ${afterText}`)
      await toBanner(page)
      await sleep(300)
      const corner = await page.evaluate(() => {
        const g = document.querySelector("[data-home-globe-grip]").getBoundingClientRect()
        const b = document.querySelector("[data-home-globe-box]").getBoundingClientRect()
        /* Inside the globe's box, outside the ball: the box's top left corner. */
        return { x: Math.max(b.left + 6, 1), y: b.top + 6, inGrip: Math.hypot(b.left + 6 - (g.left + g.width / 2), b.top + 6 - (g.top + g.height / 2)) < g.width / 2 }
      })
      const before2 = await scrollTop()
      if (!corner.inGrip) {
        await drag(corner.x, corner.y + 40, -120)
        expect((await scrollTop()) - before2 > 40, "and so does a drag on the globe's box outside the ball", `${before2} -> ${await scrollTop()}`)
      }
    } else {
      await page.mouse.move(grip.x, grip.y - grip.w * 0.2)
      await sleep(50)
      const cursor = await page.evaluate(() => getComputedStyle(document.querySelector("[data-home-globe-grip]")).cursor)
      expect(cursor === "grab", "over the ball a mouse is a hand", cursor)
      await page.mouse.down()
      const closed = await page.evaluate(() => getComputedStyle(document.querySelector("[data-home-globe-grip]")).cursor)
      expect(closed === "grabbing", "and a closed hand while dragging", closed)
      const h0 = await globeHash(page)
      for (let i = 1; i <= 10; i++) {
        await page.mouse.move(grip.x + i * 14, grip.y - grip.w * 0.2 + i * 3)
        await sleep(16)
      }
      await page.mouse.up()
      expect((await globeHash(page)) !== h0, "dragging turns it")
    }
    /*
      Smooth while it turns: what the globe costs a frame, from its own frame
      callbacks. The gap between frames is printed too, but not judged: here it
      is the software compositor drawing a 3x screen on a shared machine, which
      no phone does (scripts/check-home-globe.mjs profiles the globe alone).
    */
    await page.evaluate(() => { window.__globeFrames = [] })
    const gaps = await page.evaluate(() => new Promise((res) => {
      const out = []
      let last = 0
      const f = (t) => { if (last) out.push(t - last); last = t; if (out.length < 120) requestAnimationFrame(f); else res(out) }
      requestAnimationFrame(f)
    }))
    const own = await page.evaluate(() => window.__globeFrames)
    const q = (a, p) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0
    console.log(`        the globe's frames: ${own.length}, ${q(own, 0.5).toFixed(2)}ms median, ${q(own, 0.95).toFixed(2)}ms 95th percentile; gaps between the page's frames ${q(gaps, 0.5).toFixed(1)}ms median, ${q(gaps, 0.95).toFixed(1)}ms 95th`)
    expect(own.length > 30 && q(own, 0.95) < 4, "a globe frame costs the page under 4ms (95th percentile)", q(own, 0.95).toFixed(2))
    if (SHOTS) {
      await toBanner(page)
      await (await page.$("[data-home-banner]")).screenshot({ path: join(SHOTS, `banner-behaviour-${width}.png`) })
    }
    expect(errors.length === 0, "no errors", errors.slice(0, 3))
    await page.close()
  }

  /* The share announcement opens the share sheet, not a page. */
  {
    const { page, errors } = await open(390, "state=payouts")
    console.log("\nthe share announcement at 390")
    await page.evaluate(() => { window.__linked = null })
    /* Getting started names the website next, so that leads; sharing the page is the one after. */
    const order = await ids(page)
    expect(order[0] === "website" && order[1] === "share", "follows the website when the store can sell and has not", order)
    await page.evaluate((n) => { const tab = document.querySelectorAll("[data-home-banner] [role=tab]")[n]; tab.focus(); tab.click() }, order.indexOf("share"))
    await until(async () => (await active(page)) === "share")
    await page.evaluate(() => document.querySelector('[data-home-banner] .home-banner-slide[data-slide="active"] .home-banner-cta').click())
    await sleep(600)
    const opened = await page.evaluate(() => ({ linked: window.__linked, dialog: !!document.querySelector("[data-share-sheet]") }))
    expect(opened.linked === null && opened.dialog, "its button opens the share sheet in place", opened)
    expect(errors.length === 0, "no errors", errors.slice(0, 3))
    await page.close()
  }

  /* Reduced motion: no turning by itself, and a change of slide is a jump, not a glide. */
  {
    const { page, errors } = await open(390, "state=selling", { reduce: true })
    console.log("\nreduced motion at 390")
    await toBanner(page)
    await sleep(300)
    const g0 = await globeHash(page)
    await sleep(700)
    expect((await globeHash(page)) === g0, "the globe does not turn by itself")
    await page.evaluate(() => document.querySelectorAll("[data-home-banner] [role=tab]")[1].click())
    await sleep(30)
    const jumped = await page.evaluate(() => document.querySelector('[data-home-banner] .home-banner-slide[data-slide="active"]').dataset.announcement)
    expect(jumped === (await ids(page))[1] && (await settled(page)), "a segment's slide is simply there, no glide", jumped)
    expect(errors.length === 0, "no errors", errors.slice(0, 3))
    await page.close()
  }

  /* Without WebGL, the 2D fallback draws the same globe. */
  {
    const { page, errors } = await open(390, "state=selling", { force2d: true })
    console.log("\nwithout WebGL at 390")
    await toBanner(page)
    await sleep(300)
    const renderer = await page.evaluate(() => document.querySelector("[data-home-globe-box]").dataset.renderer)
    expect(renderer === "2d", "the 2D renderer takes over", renderer)
    expect(await turns(page), "and the globe turns")
    if (SHOTS) await (await page.$("[data-home-banner]")).screenshot({ path: join(SHOTS, "banner-2d-390.png") })
    expect(errors.length === 0, "no errors", errors.slice(0, 3))
    await page.close()
  }

  /* ── FADES, COSTS and WAITS ────────────────────────────────────────────
     One change of slide, sampled every frame; what it costs the browser;
     and, on a phone, what a scroll that starts on the banner waits for. */
  for (const width of [390, 1440]) {
    const { page, phone, errors } = await open(width, "state=five", { height: viewH(width) })
    console.log(`\nthe fade at ${width}`)
    const cdp = await page.createCDPSession()
    await toBanner(page)
    if (!phone) await page.mouse.move(5, 895)
    await sleep(400)
    await page.evaluate(instrumentFade)
    const list = await ids(page)
    expect(list.length === 5, "five announcements to fade between", list)

    /*
      THE CLOCK'S OWN CHANGE, sampled frame by frame with the browser's
      animation clock at a tenth of its speed. The curve is the same one
      either way; what the tenth buys is samples, because this machine draws
      the banner and a software WebGL globe at anything from four to twenty
      frames a second, and a 260ms fade can fall between two of them. How many
      frames a change is drawn in on a real screen is not this probe's claim
      (its duration is, below, from the CSS); what is on screen through the
      whole of the curve is.
    */
    await cdp.send("Animation.enable")
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.1 })
    expect(await page.evaluate(() => window.__ripen(200)), "the clock is running")
    const frames = await page.evaluate(() => window.__watch(4200))
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 })
    const read = (fs) => {
      let empty = 0, two = 0, moved = 0, changing = 0, dimmest = 1
      const lines = new Set()
      const heights = new Set()
      for (let i = 0; i < fs.length; i++) {
        const f = fs[i]
        heights.add(f.h)
        for (const sl of f.s) lines.add(`${sl.y}`)
        const most = Math.max(...f.s.map((x) => x.op))
        dimmest = Math.min(dimmest, most)
        if (most < 0.2) empty++
        if (f.s.filter((x) => x.op > 0.9).length >= 2) two++
        if (i > 0) {
          const prev = fs[i - 1]
          moved = Math.max(moved, ...f.s.map((x, k) => Math.abs(x.x - prev.s[k].x)))
          if (f.s.some((x, k) => Math.abs(x.op - prev.s[k].op) > 0.005)) changing++
        }
      }
      return { frames: fs.length, empty, two, moved, changing, dimmest: +dimmest.toFixed(3), lines: [...lines], heights: [...heights] }
    }
    const fade = read(frames)
    console.log(`        ${fade.frames} frames (the page drew ${Math.round((fade.frames * 1000) / 4200)} a second while it was watched): ${fade.changing} of them fading, the dimmest frame's clearest slide at ${fade.dimmest}, ${fade.empty} with nothing on them, ${fade.two} with two readable, slides moved ${fade.moved}px, button lines ${JSON.stringify(fade.lines)}, banner heights ${JSON.stringify(fade.heights)}`)
    expect(fade.empty === 0 && fade.dimmest > 0.45, "some text on screen in every frame of a change", fade.dimmest)
    expect(fade.two === 0, "and never two announcements readable at once", fade.two)
    /* More than one frame, which is all this machine's frame rate can prove: it draws the
       banner and a software WebGL globe at around 10 frames a second under three probes at
       once, so the number of frames a 260ms fade is drawn in is the machine's, not the fade's.
       What the fade is written to be is pinned beside it, from the CSS: 260ms on opacity. */
    expect(fade.changing >= 4, "a fade over several frames, not a cut", fade.changing)
    const curve = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('[data-home-banner] .home-banner-slide'))
      const seen = [...new Set(window.__frames.flatMap((f) => f.s.map((x) => x.dur)))]
      return { property: cs.transitionProperty, easing: cs.transitionTimingFunction, durations: seen }
    })
    expect(curve.property === "opacity" && curve.durations.includes("0.26s"),
      `the change is 0.26s on ${curve.property}, ${curve.easing}`, curve)
    expect(fade.moved === 0, "and nothing moves sideways: opacity only", fade.moved)
    expect(fade.lines.length === 1, "the button stays on its line through the change", fade.lines)
    expect(fade.heights.length === 1, "and the banner keeps one height", fade.heights)

    /*
      THE MIDDLE OF A CHANGE, AND THE BUTTON'S PIXELS IN IT. Both
      announcements are part there for those few frames, which is what a
      crossfade is; the button is two buttons then, one over the other, and
      this is what the pair come to against the #16161a it rests at.
    */
    const half = await midFade(page, cdp)
    const ink = await inkOf(page, half.cta)
    console.log(`        half way through a change: opacities ${JSON.stringify(half.ops)}; the button's pixels ${ink.rgb} (at rest ${half.rest})`)
    expect(half.ops.filter((o) => o > 0.2).length === 2, "half way through, both announcements are part there", half.ops)
    expect(ink.lum < 110, "and the button is still a dark pill, not a grey one", ink.rgb)
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `banner-mid-fade-${width}.png`), clip: half.clip, captureBeyondViewport: false })
    await fullSpeed(cdp)
    await until(() => settled(page), 3000)
    if (!phone) await page.mouse.move(5, 895)
    await sleep(400)

    /*
      WHAT A CHANGE COSTS, against an idle window of the same length and
      against one node inserted inside the banner. The insertion is what
      Swiper's loop does on every step, and what the :has() rules on <html>
      in globals.css answer over the whole document.
    */
    const WINDOW = 400
    const idle = await traced(page, () => sleep(WINDOW))
    const changed = await traced(page, async () => {
      await page.evaluate(() => window.__ripen(30))
      await sleep(WINDOW)
    })
    const inserted = await traced(page, async () => {
      await page.evaluate(() => new Promise((done) => {
        const span = document.createElement("span")
        document.querySelector("[data-home-banner] .home-banner-inner").appendChild(span)
        requestAnimationFrame(() => requestAnimationFrame(() => {
          span.remove()
          requestAnimationFrame(() => requestAnimationFrame(done))
        }))
      }))
      await sleep(WINDOW - 120)
    })
    const line = (x) => `${x.recalcs} recalcs of ${x.elements} elements in ${x.styleMs}ms, ${x.layouts} layouts in ${x.layoutMs}ms`
    console.log(`        ${WINDOW}ms idle:  ${line(idle)}`)
    console.log(`        a change:     ${line(changed)}   (${changed.elements - idle.elements} elements over idle)`)
    console.log(`        a node in and out of the banner: ${line(inserted)}   (${inserted.elements - idle.elements} elements over idle)`)
    /*
      The document is 900 odd elements here. Neither number is anywhere near it: on today's
      globals.css (three `html:has()` rules left, none of them watching for a plain element)
      Chromium answers an insertion inside the banner locally, so the page wide restyle that
      sent this file away from Swiper's loop no longer happens. Rewind moves no node either
      way, and what is pinned is the size of a change: a change of slide restyles a handful of
      elements, not the page.
    */
    expect(changed.elements - idle.elements < 250, "a change of slide restyles a handful of elements, not the page", changed.elements - idle.elements)
    expect(changed.layouts === 0 && changed.layoutMs <= idle.layoutMs + 1, "and lays nothing out at all", { change: changed.layoutMs, idle: idle.layoutMs })

    /*
      WAITS. First the thing that does not depend on this machine's mood: what
      listeners the document is left with. Swiper attaches touchstart and
      touchmove to the document with { passive: false }, and a blocking
      touchmove listener there is a promise that the page may cancel any
      scroll, so every scroll waits for the page's thread. The banner takes
      those off again (QUIET in components/app/home/home-banner).
    */
    const listeners = await (async () => {
      const { result } = await cdp.send("Runtime.evaluate", { expression: "document" })
      const { listeners: all } = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId })
      return all.filter((l) => /^touch/.test(l.type)).map((l) => `${l.type}${l.passive ? " passive" : " BLOCKING"}`)
    })()
    console.log(`        the document's touch listeners: ${listeners.length ? listeners.join(", ") : "none"}`)
    expect(!listeners.some((l) => /BLOCKING/.test(l)), "no blocking touch listener on the document", listeners)

    /*
      Then what a scroll actually does. How long a touchmove waited before the
      page ran it is the same either way: this probe's own listener has the
      event dispatched to the page whatever else is attached. What a blocking
      listener changes is whether the scroll may begin before that dispatch,
      so what is measured beside the wait is HOW FAR THE PAGE HAD ALREADY
      FOLLOWED THE FINGER by the time the last move of the flick reached it.
      Three flicks, each of the same 240px: one starting on the banner, one
      starting on the page below it, and one on the banner with the listener
      Swiper attaches by default put back on the document. They are taken in
      turn, five rounds of the three, because this machine's load drifts and
      three runs one after the other would measure the drift.
    */
    if (phone) {
      const flick = async (onBanner, blocked) => {
        await toBanner(page)
        await sleep(280)
        if (blocked) await page.evaluate(() => document.addEventListener("touchmove", window.__block, { passive: false }))
        const at = await page.evaluate((top) => {
          window.__delays = []
          window.__follow = []
          const b = document.querySelector("[data-home-banner]").getBoundingClientRect()
          return { x: 60, y: top ? b.top + b.height / 2 : b.bottom + 90 }
        }, onBanner)
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: at.x, y: at.y, radiusX: 11, radiusY: 11, force: 1 }] })
        const t0 = Date.now()
        for (let i = 1; i <= 16; i++) {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: at.x + 2, y: Math.round(at.y - (240 * i) / 16), radiusX: 11, radiusY: 11, force: 1 }] })
          const wait = t0 + i * 16 - Date.now()
          if (wait > 0) await sleep(wait)
        }
        const got = await page.evaluate(() => ({ delays: window.__delays, follow: window.__follow }))
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
        await sleep(650)
        if (blocked) await page.evaluate(() => document.removeEventListener("touchmove", window.__block))
        /* How far the page had come by the last move the page saw, against the 240px the finger went. */
        const followed = got.follow.length ? Math.round(got.follow[got.follow.length - 1] - got.follow[0]) : 0
        return { delays: got.delays, followed }
      }
      const runs = { banner: { delays: [], followed: [] }, below: { delays: [], followed: [] }, blocked: { delays: [], followed: [] } }
      for (let k = 0; k < 5; k++) {
        const order = ["banner", "below", "blocked"]
        order.push(...order.splice(0, k % 3))
        for (const which of order) {
          const r = await flick(which !== "below", which === "blocked")
          runs[which].delays.push(...r.delays)
          runs[which].followed.push(r.followed)
        }
      }
      const q = (a2, pc) => { const so = [...a2].sort((x, y) => x - y); return so.length ? +so[Math.min(so.length - 1, Math.floor(so.length * pc))].toFixed(1) : 0 }
      const of = (r) => ({ n: r.delays.length, p50: q(r.delays, 0.5), p95: q(r.delays, 0.95), max: +Math.max(0, ...r.delays).toFixed(1), followed: q(r.followed, 0.5) })
      const onBanner = of(runs.banner)
      const below = of(runs.below)
      const blocked = of(runs.blocked)
      const say = (x) => `waited p50 ${x.p50}ms, p95 ${x.p95}ms, longest ${x.max}ms over ${x.n} touchmoves; the page had followed the finger by ${x.followed}px of 240 when the last move arrived`
      console.log(`        a flick that starts on the banner: ${say(onBanner)}`)
      console.log(`        one that starts below it:          ${say(below)}`)
      console.log(`        on the banner, with Swiper's own blocking touchmove listener on the document: ${say(blocked)}`)
      expect(onBanner.p50 <= below.p50 * 1.6 + 12, "a scroll that starts on the banner waits no longer than one that starts under it", { banner: onBanner.p50, below: below.p50 })
      expect(onBanner.followed >= below.followed * 0.8, "and follows the finger as closely", { banner: onBanner.followed, below: below.followed })
      /* The blocked run is printed, not held to: what it costs shows in the tail (the longest
         wait, and the 95th) and the tail here is this machine's load as much as the listener's.
         What is pinned instead is the listener itself, above: there is none of that kind. */
    }
    expect(errors.length === 0, "no errors", errors.slice(0, 3))
    await page.close()
  }

  /* ── COUNTS: one, two, three and five announcements ────────────────────
     One slide is not a carousel: no segments, no Swiper, no clock. Two, the
     count Swiper's loop cannot do at all, fade on by themselves like the
     rest, and every count comes back round to the first. */
  for (const [state, want] of [["quiet", 1], ["product", 2], ["selling", 3], ["five", 5]]) {
    const { page, errors } = await open(390, `state=${state}`)
    console.log(`\n${want} announcement${want > 1 ? "s" : ""} (${state}) at 390`)
    const cdp = await page.createCDPSession()
    await toBanner(page)
    await sleep(300)
    await page.evaluate(instrumentFade)
    const list = await ids(page)
    expect(list.length === want, `${want} of them`, list)
    const controls = await page.evaluate(() => ({
      tabs: document.querySelectorAll("[data-home-banner] [role=tab]").length,
      swiper: document.querySelector("[data-home-banner] .home-banner-text").classList.contains("swiper-initialized"),
      clock: document.getAnimations().filter((a) => /^home-banner-fill/.test(a.animationName)).length,
    }))
    if (want === 1) {
      expect(controls.tabs === 0 && !controls.swiper && controls.clock === 0, "no segments, no Swiper, no clock", controls)
      const only = await active(page)
      await sleep(1200)
      expect((await active(page)) === only, "and it never changes by itself", only)
    } else {
      expect(controls.tabs === want && controls.swiper, `${want} segments and a Swiper`, controls)
      /* Round the whole way by the clock, and on past the last one to the first. */
      const seen = [await active(page)]
      for (let k = 0; k < want; k++) {
        expect(await page.evaluate(() => window.__ripen(60)), "the clock is running")
        await until(async () => (await active(page)) !== seen[seen.length - 1], 3000)
        seen.push(await active(page))
      }
      expect(JSON.stringify(seen) === JSON.stringify([...list, list[0]]), "the clock fades through all of them and round to the first", seen)
      /* And a finger: left for the next, from the last round to the first. */
      const from = await active(page)
      /* Two thirds of the way across the viewport, which is the width Swiper measures a swipe against. */
      const at = await page.evaluate(() => {
        const b = document.querySelector("[data-home-banner]").getBoundingClientRect()
        const v = document.querySelector("[data-home-banner] .home-banner-text").getBoundingClientRect()
        return { x: v.right - 14, y: b.top + 70, dx: -v.width * 0.66 }
      })
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: at.x, y: at.y, radiusX: 8, radiusY: 8, force: 1 }] })
      for (let i = 1; i <= 12; i++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: at.x + (at.dx * i) / 12, y: at.y + i * 0.4, radiusX: 8, radiusY: 8, force: 1 }] })
        await sleep(16)
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      await until(() => settled(page), 3000)
      const to = await active(page)
      expect(list.indexOf(to) === (list.indexOf(from) + 1) % want, "a swipe shows the next, and the last shows the first", [from, to])
    }
    expect(errors.length === 0, "no errors", errors.slice(0, 3))
    await page.close()
  }
} finally {
  await browser.close()
  close()
}
console.log(broken ? `\n${broken} failed\n` : "\nall good\n")
process.exit(broken ? 1 : 0)
