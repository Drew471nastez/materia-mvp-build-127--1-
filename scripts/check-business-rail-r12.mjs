/**
 * Landing round 12: measures the "One store, every kind of product" section
 * on phones (its row of cards) and on computers, against a running server.
 *
 *   node scripts/check-business-rail-r12.mjs [base url, default http://localhost:3000] [phones]
 *   ("phones" skips the computers)
 *
 * For each phone width (360, 390, 430) it reports:
 *  - the section's height against the screen, and whether the heading, the
 *    first card's name and the whole first card stand on one screen;
 *  - each card's width and height and how much of the next one shows;
 *  - whether anything inside a scene reaches past its card or its frame
 *    (cut text, a picker under a toast), card by card;
 *  - whether the page itself scrolls sideways (it must not);
 *  - a touch swipe through the row (Chrome's own synthesized scroll gesture,
 *    so the browser scrolls it as a finger would): the frames drawn while it
 *    moves, the longest gap between two, and where the row came to rest.
 * On computers it reports the stage and the cards inside each scene.
 * It prints numbers; nothing passes or fails here, the suite pins the code.
 */
import { createRequire } from "node:module"

const { chromium } = createRequire(import.meta.url)("playwright")

const BASE = process.argv[2] || "http://localhost:3000"
const PHONES = [
  [360, 780],
  [390, 844],
  [430, 932],
]
const COMPUTERS =
  process.argv[3] === "phones"
    ? []
    : [
        [1440, 900],
        [1920, 1080],
      ]

async function open(browser, w, h, phone) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone })
  const page = await ctx.newPage()
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 180000 })
  for (let i = 0; i < 60; i++) {
    const found = await page.evaluate(() => {
      const s = document.querySelector("[data-business]")
      if (s) {
        s.scrollIntoView({ block: "start" })
        return true
      }
      window.scrollBy(0, 900)
      return false
    })
    if (found) break
    await page.waitForTimeout(250)
  }
  await page.waitForTimeout(2500)
  return { ctx, page }
}

/** Every element of a scene that reaches past its card or past the frame, as "class: px". */
const OVERFLOW = () => {
  const out = []
  for (const frame of document.querySelectorAll("[data-business] .bz-frame")) {
    const f = frame.getBoundingClientRect()
    const scene = frame.querySelector(".bs")
    const name = scene?.className.split(" ")[1] ?? "?"
    for (const card of frame.querySelectorAll(".bs-card,.bs-ccard,.bs-com")) {
      const c = card.getBoundingClientRect()
      for (const el of card.querySelectorAll("*")) {
        const cs = getComputedStyle(el)
        if (cs.display === "none" || cs.visibility === "hidden" || cs.position === "absolute") continue
        const r = el.getBoundingClientRect()
        if (!r.width || !r.height) continue
        const below = r.bottom - c.bottom
        if (below > 0.5) out.push(`${name} ${el.className || el.tagName}: ${below.toFixed(1)}px below its card`)
      }
      const past = c.bottom - f.bottom
      if (past > 0.5) out.push(`${name} ${card.className}: ${past.toFixed(1)}px below the frame`)
    }
  }
  return out
}

const browser = await chromium.launch()
try {
  for (const [w, h] of PHONES) {
    const { ctx, page } = await open(browser, w, h, true)
    const m = await page.evaluate(() => {
      const s = document.querySelector("[data-business]")
      const rail = s.querySelector(".biz-rail")
      const cards = [...s.querySelectorAll(".biz-card")]
      const r = (el) => el.getBoundingClientRect()
      const head = r(s.querySelector(".biz-head"))
      const first = r(cards[0])
      const frame = r(cards[0].querySelector(".bz-frame"))
      const second = r(cards[1])
      return {
        rail: !!rail,
        section: Math.round(r(s).height),
        screen: innerHeight,
        headTop: Math.round(head.top),
        firstCardBottomFromSectionTop: Math.round(first.bottom - r(s).top),
        card: [Math.round(first.width), Math.round(first.height)],
        frame: [Math.round(frame.width), Math.round(frame.height)],
        nextShows: Math.round(innerWidth - second.left),
        pageScrollsSideways: document.documentElement.scrollWidth > innerWidth,
        snap: rail && getComputedStyle(rail).scrollSnapType,
      }
    })
    const each = []
    for (let k = 0; k < 5; k++) {
      await page.evaluate((k) => {
        const rail = document.querySelector(".biz-rail")
        rail.style.scrollSnapType = "none"
        rail.scrollLeft = rail.children[k].offsetLeft - rail.children[0].offsetLeft
        rail.style.scrollSnapType = ""
      }, k)
      await page.waitForTimeout(5200)
      each.push(...(await page.evaluate(OVERFLOW)))
    }
    await page.evaluate(() => (document.querySelector(".biz-rail").scrollLeft = 0))
    await page.waitForTimeout(600)
    /* A finger's swipe right to left across the row, as Chrome draws it. */
    const box = await page.locator(".biz-rail").boundingBox()
    await page.evaluate(() => {
      window.__f = []
      const tick = (t) => {
        window.__f.push(t)
        if (window.__f.length < 400) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    /* Touch events straight into the browser's input (CDP), so its own scroller handles them, as under a finger: down, twelve moves of 22px a frame, up. */
    const cdp = await ctx.newCDPSession(page)
    const y = Math.round(box.y + box.height * 0.6)
    const x0 = Math.round(w * 0.82)
    const t0 = Date.now()
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y }] })
    for (let i = 1; i <= 12; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 - i * 22, y }] })
      await page.waitForTimeout(16)
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    const gestureMs = Date.now() - t0
    await page.waitForTimeout(1200)
    const swipe = await page.evaluate(() => {
      const f = window.__f
      const gaps = f.slice(1).map((t, i) => t - f[i])
      const rail = document.querySelector(".biz-rail")
      const pitch = rail.children[1].offsetLeft - rail.children[0].offsetLeft
      const playing = [...rail.querySelectorAll(".biz-slide")].map((s) => (s.classList.contains("bz-on") ? "1" : "0")).join("")
      return { frames: f.length, longestGapMs: Math.round(Math.max(...gaps) * 10) / 10, over20ms: gaps.filter((g) => g > 20).length, restsAt: Math.round((rail.scrollLeft / pitch) * 100) / 100, playing }
    })
    console.log(`\n${w} x ${h}`, JSON.stringify(m))
    console.log("  overflow:", each.length ? each.join("; ") : "none")
    console.log("  swipe:", JSON.stringify({ gestureMs, ...swipe }))
    await ctx.close()
  }
  for (const [w, h] of COMPUTERS) {
    const { ctx, page } = await open(browser, w, h, false)
    const each = []
    for (let k = 0; k < 5; k++) {
      await page.locator(".biz-tab").nth(k).click()
      await page.waitForTimeout(5200)
      each.push(...(await page.evaluate(OVERFLOW)))
    }
    const m = await page.evaluate(() => {
      const s = document.querySelector("[data-business]").getBoundingClientRect()
      const st = document.querySelector(".biz-stage").getBoundingClientRect()
      return { section: Math.round(s.height), stage: [Math.round(st.width), Math.round(st.height)], pageScrollsSideways: document.documentElement.scrollWidth > innerWidth }
    })
    console.log(`\n${w} x ${h}`, JSON.stringify(m))
    console.log("  overflow:", each.length ? each.join("; ") : "none")
    await ctx.close()
  }
} finally {
  await browser.close()
}
