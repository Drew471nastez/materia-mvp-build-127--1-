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
 *             by itself and the text does not slide.
 *   SLIDES    a change of slide, by the clock, a segment or a swipe, is one
 *             move: the slide showing goes out and the next comes in beside
 *             it, both on screen, on transform only. A finger drags the text
 *             one to one; let go far enough and it carries on, or it settles
 *             back. Sampled every frame at 390x844 by touch: never a frame
 *             without text, never a slide or its button faded, frames under
 *             20ms at the 95th percentile, and every slide's button at the
 *             same height. With SHOTS, frames from the middle of a move.
 *
 *   node scripts/check-home-banner.mjs
 *   SHOTS=/some/dir node scripts/check-home-banner.mjs
 */
import { existsSync, mkdirSync } from "node:fs"
import { createHash } from "node:crypto"
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
async function open(width, query, { reduce = false, force2d = false } = {}) {
  const page = await browser.newPage()
  const phone = width < 768
  await page.setViewport({ width, height: phone ? 844 : 1000, deviceScaleFactor: phone ? 3 : 2, isMobile: phone, hasTouch: phone })
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

/** Until every move of the banner's slides has landed (their animations carry the id home-banner-move). */
const settled = (page) => page.evaluate(async () => {
  for (let i = 0; i < 50; i++) {
    const moving = document.getAnimations().filter((a) => a.id === "home-banner-move" && a.playState === "running")
    if (!moving.length) break
    await Promise.all(moving.map((a) => a.finished.catch(() => {})))
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
})

/**
 * EVERY FRAME OF A MOVE. Started in the page, it records for each frame the
 * time since the last one, how much of the slides' text can be seen in the
 * window they pass through (a title's visible width over its own, summed
 * over the slides drawn: 1 at rest, about 1 all through a move, 0 for a
 * blank banner), how many slides are drawn, and the least opacity on any of
 * them, their buttons and the window, so a faded button is caught.
 */
const startFrames = (page) => page.evaluate(() => {
  window.__bannerFrames = []
  window.__bannerFramesOn = true
  /* Long tasks on the page's own thread while it runs: a slow frame with none is the machine's, not the page's. */
  window.__bannerLong = []
  window.__bannerLongObs?.disconnect()
  window.__bannerLongObs = new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__bannerLong.push(Math.round(e.duration)) })
  window.__bannerLongObs.observe({ type: "longtask" })
  let last = 0
  const stack = document.querySelector("[data-home-banner] .home-banner-stack")
  const opacityUp = (el) => {
    let o = 1
    for (let n = el; n && n !== document.body; n = n.parentElement) o *= Number(getComputedStyle(n).opacity)
    return o
  }
  const f = (t) => {
    if (!window.__bannerFramesOn) return
    const w = stack.getBoundingClientRect()
    /* The window's right edge fades over 20px: count only what is left of the fade. */
    const left = w.left
    const right = w.right - 20
    let seen = 0
    let drawn = 0
    let faded = 1
    const xs = []
    for (const slide of stack.children) {
      if (getComputedStyle(slide).visibility !== "visible") continue
      const title = slide.querySelector(".home-banner-title").getBoundingClientRect()
      const cut = Math.max(0, Math.min(right, title.right) - Math.max(left, title.left))
      if (cut > 0) drawn++
      seen += title.width ? cut / title.width : 0
      faded = Math.min(faded, opacityUp(slide), opacityUp(slide.querySelector(".home-banner-cta")))
      xs.push(Math.round(title.left - left))
    }
    window.__bannerFrames.push({ gap: last ? t - last : 0, seen, drawn, faded, xs })
    last = t
    requestAnimationFrame(f)
  }
  requestAnimationFrame(f)
})
const stopFrames = (page) => page.evaluate(() => {
  window.__bannerFramesOn = false
  const frames = window.__bannerFrames
  return { frames, long: window.__bannerLong.slice() }
}).then(({ frames, long }) => Object.assign(frames, { long }))
const pct = (a, p) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0
/** What a run of frames says. */
const readFrames = (frames) => {
  const gaps = frames.map((f) => f.gap).filter((g) => g > 0)
  return {
    frames: frames.length,
    both: frames.filter((f) => f.drawn >= 2).length,
    least: Math.min(...frames.map((f) => f.seen)),
    faded: Math.min(...frames.map((f) => f.faded)),
    p50: pct(gaps, 0.5),
    p95: pct(gaps, 0.95),
    worst: Math.max(0, ...gaps),
    long: frames.long ?? [],
  }
}
/** The page's frames with nothing moving but the globe: what this machine gives any page right now. */
const idleFrames = (page, ms = 600) => page.evaluate((ms) => new Promise((res) => {
  const out = []
  let last = 0
  const end = performance.now() + ms
  const f = (t) => { if (last) out.push(t - last); last = t; if (performance.now() < end) requestAnimationFrame(f); else res(out) }
  requestAnimationFrame(f)
}), ms)
/**
 * A MOVE HELD STILL AT A FEW POINTS ON ITS WAY. Right after `start` makes a
 * move, its animations are paused and set to 5, 10, 20, 35 and 50% of its
 * time. The curve starts quick, so by a fifth of its time a short title
 * has already left: at the first two points both slides must be drawn, and
 * at every one the text seen. It does not depend on how many frames a busy
 * machine manages to draw.
 */
const heldMid = async (page, start) => {
  await start()
  return page.evaluate(() => {
    const moving = document.getAnimations().filter((a) => a.id === "home-banner-move")
    if (!moving.length) return null
    const total = Number(moving[0].effect.getTiming().duration)
    const stack = document.querySelector("[data-home-banner] .home-banner-stack")
    const out = []
    for (const k of [0.05, 0.1, 0.2, 0.35, 0.5]) {
      for (const a of moving) { a.pause(); a.currentTime = total * k }
      const w = stack.getBoundingClientRect()
      let seen = 0
      let drawn = 0
      for (const slide of stack.children) {
        if (getComputedStyle(slide).visibility !== "visible") continue
        const r = slide.querySelector(".home-banner-title").getBoundingClientRect()
        const cut = Math.max(0, Math.min(w.right - 20, r.right) - Math.max(w.left, r.left))
        if (cut > 0) drawn++
        seen += r.width ? cut / r.width : 0
      }
      out.push({ at: k, drawn, seen: Math.round(seen * 100) / 100 })
    }
    for (const a of moving) a.play()
    return out
  })
}
/**
 * A MOVE, MEASURED, AND THE CHECKS EVERY MOVE MUST PASS. `run` makes one
 * move and returns its frames, and `start` one more to be held still at a
 * few points (heldMid). No frame may go blank or fade a slide or a button,
 * and at every held point both slides are drawn.
 *
 * The timing is the page's own only on a quiet machine. This one is shared
 * (other checks run beside this one), and a software compositor drawing a
 * 3x screen stalls when other work lands on it: the move is made again, up
 * to three times, and the best run is judged, under 20ms at the 95th
 * percentile. When the machine is so busy that a page with nothing moving
 * but the globe cannot keep 20ms either (measured just before), the move is
 * held to that instead, no more than a quarter over it, and the line says so.
 */
const judgeMoves = async (page, what, run, start) => {
  const rest = await idleFrames(page)
  const idle = pct(rest, 0.95)
  const runs = []
  for (let i = 0; i < 3; i++) {
    runs.push(readFrames(await run(i)))
    if (runs.at(-1).p95 < 20) break
  }
  const best = runs.reduce((a, b) => (b.p95 < a.p95 ? b : a))
  for (const r of runs) console.log(`        ${what}: ${r.frames} frames, ${r.both} with two slides on screen, least text seen ${r.least.toFixed(2)}, gaps ${r.p50.toFixed(1)}ms median, ${r.p95.toFixed(1)}ms 95th, ${r.worst.toFixed(1)}ms worst, long tasks [${r.long.join(", ")}] (the page at rest: ${idle.toFixed(1)}ms 95th of ${rest.length})`)
  const least = Math.min(...runs.map((r) => r.least))
  const faded = Math.min(...runs.map((r) => r.faded))
  expect(least >= 0.6, `${what}: never a frame without the slides' text (least ${least.toFixed(2)} of a title seen)`, runs)
  expect(faded >= 0.999, `${what}: no slide and no button faded on the way (least opacity ${faded})`, faded)
  /* What the page itself costs, whatever the machine: no task of its own over 50ms while a move runs. */
  expect(runs.every((r) => r.long.length === 0), `${what}: no long task on the page's thread during a move`, runs.map((r) => r.long))
  if (start) {
    const held = await heldMid(page, start)
    expect(!!held && held.slice(0, 2).every((h) => h.drawn === 2) && held.every((h) => h.seen >= 0.6), `${what}: held at 5% and 10% of its time the one going out and the one coming in are both on screen, and at 20, 35 and 50% the text is there`, held)
    await settled(page)
  }
  const quiet = idle < 20
  expect(quiet ? best.p95 < 20 : best.p95 <= idle * 1.25 + 4,
    quiet ? `${what}: frames under 20ms at the 95th percentile (${best.p95.toFixed(1)}ms, best of ${runs.length})`
      : `${what}: the machine is busy (${idle.toFixed(1)}ms a frame at rest): frames no slower than at rest (${best.p95.toFixed(1)}ms, best of ${runs.length})`,
    runs.map((r) => r.p95.toFixed(1)))
}

/** Every slide of the banner at this width: where things are. */
async function measureSlides(page) {
  const list = await ids(page)
  const out = []
  for (let i = 0; i < list.length; i++) {
    if (list.length > 1) {
      /* Focus inside the banner holds the clock, so the slide measured is the one picked, at rest. */
      await page.evaluate((n) => { const tab = document.querySelectorAll("[data-home-banner] [role=tab]")[n]; tab.focus(); tab.click() }, i)
      await sleep(650)
      /* And the move has landed: measured mid-way the slide is still on its way across. */
      await settled(page)
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
      return {
        id: slide.dataset.announcement,
        height: Math.round(br.height),
        ctaTop: Math.round((slide.querySelector(".home-banner-cta").getBoundingClientRect().top - br.top) * 10) / 10,
        copyTop: Math.round((slide.querySelector(".home-banner-eyebrow").getBoundingClientRect().top - br.top) * 10) / 10,
        gap: Math.round(slide.querySelector(".home-banner-cta").getBoundingClientRect().top - slide.querySelector(".home-banner-line").getBoundingClientRect().bottom),
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
  /* FITS=0 skips the widths, for a quicker run of the rest while working on it. */
  for (const [state, want] of process.env.FITS === "0" ? [] : Object.entries(EXPECT)) {
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
      if (slides.length > 1) {
        /* "No layout jump": the text starts at one top and the button sits at one height on every slide. */
        const ctaTops = [...new Set(slides.map((s) => s.ctaTop))]
        const copyTops = [...new Set(slides.map((s) => s.copyTop))]
        expect(ctaTops.length === 1 && copyTops.length === 1, `every slide's text at one top (${copyTops[0]}px) and its button at one height (${ctaTops[0]}px)`, { ctaTops, copyTops })
        /* The tallest copy sits 10px over its button (12 from 620): the room between text and button is no more than the copy needs. */
        const tightest = Math.min(...slides.map((s) => s.gap))
        expect(tightest >= 8 && tightest <= 13, `the tallest copy ${tightest}px over the button`, slides.map((s) => s.gap))
      }
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
    expect((await page.evaluate(() => document.querySelector("[data-home-banner] .home-banner-stack").getAttribute("aria-live"))) === "off", "aria-live off while it plays")
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

      /* A sideways swipe on the text: left for the next, right for the one before, at the real speed. */
      await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 })
      await settled(page)
      /* The finger in 11px steps a frame apart; `follow` is how far the slide sits from where the finger says it should. */
      const swipe = async (dx, { measure = false, hold = false } = {}) => {
        const x0 = t.x + (dx < 0 ? 120 : 0)
        const steps = Math.round(Math.abs(dx) / 11)
        const step = Math.sign(dx) * 11
        let engaged = null
        const follow = []
        const pairs = []
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: t.y }] })
        for (let i = 1; i <= steps; i++) {
          const x = x0 + step * i
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: t.y + i * 0.3 }] })
          if (engaged === null && Math.abs(x - x0) > 8) engaged = x
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
          if (measure && engaged !== null) {
            const at = await page.evaluate(() => {
              const cur = document.querySelector('[data-home-banner] .home-banner-slide[data-slide="active"]')
              const w = document.querySelector("[data-home-banner] .home-banner-stack").getBoundingClientRect()
              const shown = [...document.querySelectorAll("[data-home-banner] .home-banner-slide")].filter((el) => {
                const r = el.querySelector(".home-banner-title").getBoundingClientRect()
                return getComputedStyle(el).visibility === "visible" && r.right > w.left && r.left < w.right - 20
              })
              const tr = getComputedStyle(cur).transform
              return { x: tr === "none" ? 0 : new DOMMatrixReadOnly(tr).m41, shown: shown.length }
            })
            follow.push(Math.abs(at.x - (x - engaged)))
            /* Past the 20px the text fades over at the right edge, the next one must be in. */
            if (Math.abs(x - engaged) > 26) pairs.push(at.shown)
          }
        }
        if (measure && SHOTS) await (await page.$("[data-home-banner]")).screenshot({ path: join(SHOTS, "banner-drag-390.png") })
        if (measure) await startFrames(page)
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
        if (hold) return null
        await settled(page)
        return { follow, pairs, frames: measure ? await stopFrames(page) : null }
      }
      const s0 = await active(page)
      const first = await swipe(-121, { measure: true })
      const s1 = await active(page)
      expect(list.indexOf(s1) === (list.indexOf(s0) + 1) % list.length, "a swipe to the left shows the next", [s0, s1])
      expect(first.follow.length > 5 && Math.max(...first.follow) <= 1.5, `the text follows the finger one to one (off by ${Math.max(...first.follow).toFixed(2)}px at most)`, first.follow)
      /* The next stands a small gap beyond the edge where the text fades: a few pixels of drag and it is in. */
      expect(first.pairs.length > 3 && first.pairs.every((n) => n === 2), "and the next one comes in beside it from the first moves of the finger", first.pairs)
      /* Let go and the two carry on: measured on this swipe, and on more, back and forth, if the machine was busy. */
      await judgeMoves(page, "a swipe let go", async (i) => (i === 0 ? first : await swipe(i % 2 ? 121 : -121, { measure: true })).frames,
        () => swipe(-121, { hold: true }))
      await settled(page)
      if ((await active(page)) !== s1) {
        await page.evaluate((n) => document.querySelectorAll("[data-home-banner] [role=tab]")[n].click(), list.indexOf(s1))
        await settled(page)
      }
      await swipe(121)
      expect((await active(page)) === s0, "and to the right the one before", [s1, await active(page)])
      expect((await page.evaluate(() => document.querySelector("[data-home-banner] .home-banner-stack").getAttribute("aria-live"))) === "polite", "a change asked for is read out")
      /* A short drag, slowly, is not a change: it settles back. */
      {
        const x0 = t.x + 60
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: t.y }] })
        for (let i = 1; i <= 8; i++) {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 - i * 5, y: t.y }] })
          await sleep(40)
        }
        await sleep(160)
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
        await settled(page)
        const back = await page.evaluate(() => {
          const w = document.querySelector("[data-home-banner] .home-banner-stack").getBoundingClientRect()
          return {
            x: getComputedStyle(document.querySelector('[data-home-banner] .home-banner-slide[data-slide="active"]')).transform,
            /* The neighbours wait just out of sight: only what is in the window counts. */
            shown: [...document.querySelectorAll("[data-home-banner] .home-banner-slide")].filter((el) => {
              const r = el.querySelector(".home-banner-title").getBoundingClientRect()
              return getComputedStyle(el).visibility === "visible" && r.right > w.left && r.left < w.right - 20
            }).length,
          }
        })
        expect((await active(page)) === s0 && (back.x === "none" || /^matrix\(1, 0, 0, 1, 0, 0\)$/.test(back.x)) && back.shown === 1, "a short slow drag settles back where it was", back)
      }

      /* THE CLOCK'S MOVE, every frame: the clock is wound on to 250ms before its end, and the move is the clock's own. */
      await sleep(400)
      let autoOk = true
      const windClock = (left) => page.evaluate((left) => {
        const clock = document.getAnimations().find((a) => a.effect?.target?.classList?.contains("home-banner-tab-fill") && a.id !== "home-banner-move")
        if (clock) clock.currentTime = 9000 - left
      }, left)
      await judgeMoves(page, "the clock's move", async () => {
        const auto0 = await active(page)
        await startFrames(page)
        await page.evaluate(() => {
          const clock = document.getAnimations().find((a) => a.effect?.target?.classList?.contains("home-banner-tab-fill") && a.id !== "home-banner-move")
          if (clock) clock.currentTime = 9000 - 250
        })
        await until(async () => (await active(page)) !== auto0, 3000)
        await settled(page)
        const frames = await stopFrames(page)
        autoOk &&= list.indexOf(await active(page)) === (list.indexOf(auto0) + 1) % list.length
        /* From a few frames before it starts: the quarter second of waiting is not the move. */
        return Object.assign(frames.slice(Math.max(0, frames.findIndex((f) => f.drawn >= 2) - 3)), { long: frames.long })
      }, async () => {
        await windClock(1)
        await page.waitForFunction(() => document.getAnimations().some((a) => a.id === "home-banner-move"), { timeout: 3000 })
      })
      expect(autoOk, "the clock moves on to the next")
      if (SHOTS) {
        /* The middle of a move, held there: the clock's move started, its animations paused at 60, 140 and 260ms of 480. */
        await page.evaluate(() => {
          const clock = document.getAnimations().find((a) => a.effect?.target?.classList?.contains("home-banner-tab-fill") && a.id !== "home-banner-move")
          if (clock) clock.currentTime = 9000 - 1
        })
        await page.waitForFunction(() => document.getAnimations().some((a) => a.id === "home-banner-move"), { timeout: 3000 })
        for (const [n, ms] of [[1, 60], [2, 140], [3, 260]]) {
          await page.evaluate((ms) => { for (const a of document.getAnimations()) if (a.id === "home-banner-move") { a.pause(); a.currentTime = ms } }, ms)
          await (await page.$("[data-home-banner]")).screenshot({ path: join(SHOTS, `banner-move-${n}-390.png`) })
        }
        await page.evaluate(() => { for (const a of document.getAnimations()) if (a.id === "home-banner-move") a.play() })
        await settled(page)
      }
      await cdp.send("Animation.setPlaybackRate", { playbackRate: 10 })
    } else {
      /* A mouse over it holds it. */
      const r = await page.evaluate(() => { const b = document.querySelector("[data-home-banner]").getBoundingClientRect(); return { x: b.left + 60, y: b.top + 40 } })
      await page.mouse.move(r.x, r.y)
      const hovA = await active(page)
      await sleep(1100)
      expect((await held(page)) && (await active(page)) === hovA, "a mouse over it holds it")
      await page.mouse.move(5, 995)
      expect(!!(await until(async () => (await active(page)) !== hovA, 2500)), "and it goes on when the mouse leaves")
    }

    /* The segments, as tabs: a click picks a slide, the arrow keys move between them. */
    /* At the real speed: the clock has nine seconds a slide, far more than these take. */
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 })
    await settled(page)
    if ((await active(page)) === list[2]) {
      await page.evaluate(() => document.querySelectorAll("[data-home-banner] [role=tab]")[0].click())
      await settled(page)
    }
    const toFirst = async () => {
      if ((await active(page)) === list[2]) {
        await page.evaluate(() => document.querySelectorAll("[data-home-banner] [role=tab]")[0].click())
        await settled(page)
      }
    }
    await judgeMoves(page, "a segment's move", async () => {
      await toFirst()
      await startFrames(page)
      await page.evaluate(() => document.querySelectorAll("[data-home-banner] [role=tab]")[2].click())
      await settled(page)
      return stopFrames(page)
    }, async () => {
      await toFirst()
      await page.evaluate(() => document.querySelectorAll("[data-home-banner] [role=tab]")[2].click())
    })
    expect((await active(page)) === list[2], "a segment picks its slide", await active(page))
    await page.focus('[data-home-banner] [role=tab][aria-selected="true"]')
    await page.keyboard.press("ArrowRight")
    await settled(page)
    const k = await page.evaluate(() => ({ active: document.querySelector('[data-home-banner] .home-banner-slide[data-slide="active"]').dataset.announcement, focused: document.activeElement?.getAttribute("aria-selected"), live: document.querySelector("[data-home-banner] .home-banner-stack").getAttribute("aria-live") }))
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
    if (!phone) await page.hover(cta)
    else await page.evaluate((sel) => document.querySelector(sel).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" })), cta)
    await page.evaluate((sel) => document.querySelector(sel).click(), cta)
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
    expect(grip.touch === "none" && grip.text === "pan-y", "a finger on the ball is the globe's (touch-action none), the text beside it scrolls the page (pan-y)", grip)
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

  /* Reduced motion: no turning by itself, and the text changes in place. */
  {
    const { page, errors } = await open(390, "state=selling", { reduce: true })
    console.log("\nreduced motion at 390")
    await toBanner(page)
    await sleep(300)
    const g0 = await globeHash(page)
    await sleep(700)
    expect((await globeHash(page)) === g0, "the globe does not turn by itself")
    /* Changed on purpose: with reduced motion nothing moves by itself, the clock included ("pause ... when reduced motion is on"). */
    const r0 = await active(page)
    await sleep(1200)
    expect((await active(page)) === r0 && (await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.classList?.contains("home-banner-tab-fill")).length)) === 0, "no clock: the slide stays until asked", r0)
    await page.evaluate(() => document.querySelectorAll("[data-home-banner] [role=tab]")[1].click())
    await sleep(30)
    const t = await page.evaluate(() => ({ active: document.querySelector('[data-home-banner] .home-banner-slide[data-slide="active"]').dataset.announcement, moving: document.getAnimations().filter((a) => a.id === "home-banner-move").length, shown: [...document.querySelectorAll("[data-home-banner] .home-banner-slide")].filter((el) => getComputedStyle(el).visibility === "visible").length }))
    expect(t.active !== r0 && t.moving === 0 && t.shown === 1, "a segment shows its slide at once: the text does not slide", t)
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
} finally {
  await browser.close()
  close()
}
console.log(broken ? `\n${broken} failed\n` : "\nall good\n")
process.exit(broken ? 1 : 0)
