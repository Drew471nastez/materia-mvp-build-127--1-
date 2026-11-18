/**
 * Landing round 14: measures the business section ("Sell what you make and
 * what you know") against a running server.
 *
 *   node scripts/check-business-r14.mjs [base url, default http://localhost:3000] [phones|computers] [widths, e.g. 390,1440]
 *
 * Phones (360, 390, 430):
 *  - each card at rest: its left and right edge on the screen, and how much
 *    of a neighbour shows (none must), whether anything inside a scene
 *    reaches past its card or its frame, whether the page scrolls sideways;
 *  - a touch swipe through the row (touch events into Chrome's own input, so
 *    its scroller moves the row as under a finger): frames drawn, the
 *    longest gap, where it rests, where the marker under the row stands;
 *  - at 390 with the CPU slowed four times: the same swipe, a finger drag
 *    across the line of store designs (where it comes to rest), and the
 *    line turning by itself for five seconds.
 * Computers (1440, 1920):
 *  - the line of store designs turning by itself and under a mouse drag:
 *    frames drawn, the longest gap, how many cards are drawn at once, and
 *    whether any will-change is left on them;
 *  - the shelf: hover a product, its pane shows; press its button, the
 *    product is marked as bought;
 *  - with the section scrolled away: running animations (none must be).
 * It prints numbers; nothing passes or fails here, the suite pins the code.
 */
import { createRequire } from "node:module"

const { chromium } = createRequire(import.meta.url)("playwright")

const BASE = process.argv[2] || "http://localhost:3000"
const ONLY = process.argv[3]
const WIDTHS = process.argv[4] ? process.argv[4].split(",").map(Number) : null
const pick = (list) => (WIDTHS ? list.filter(([w]) => WIDTHS.includes(w)) : list)
const PHONES = ONLY === "computers" ? [] : pick([[360, 780], [390, 844], [430, 932]])
const COMPUTERS = ONLY === "phones" ? [] : pick([[1440, 900], [1920, 1080]])

async function open(browser, w, h, phone) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone })
  const page = await ctx.newPage()
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 240000 })
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

/** Every element of a scene that reaches past its card or past the frame, as "scene class: px". */
const OVERFLOW = () => {
  const out = []
  for (const frame of document.querySelectorAll("[data-business] .bz-frame")) {
    const f = frame.getBoundingClientRect()
    if (!f.width) continue
    const scene = frame.querySelector(".bs")
    const name = scene?.className.split(" ")[1] ?? "?"
    for (const card of frame.querySelectorAll(".bs-card,.bs-ccard,.bs-com,.bd-view,.bd-pane[data-on],.bs-feed")) {
      const c = card.getBoundingClientRect()
      for (const el of card.querySelectorAll("*")) {
        const cs = getComputedStyle(el)
        if (cs.display === "none" || cs.visibility === "hidden" || cs.position === "absolute") continue
        const r = el.getBoundingClientRect()
        if (!r.width || !r.height) continue
        const below = r.bottom - c.bottom
        if (below > 0.5 && !card.classList.contains("bs-feed")) out.push(`${name} ${el.className || el.tagName}: ${below.toFixed(1)}px below its card`)
      }
      const past = Math.max(c.bottom - f.bottom, f.top - c.top, c.right - f.right, f.left - c.left)
      if (past > 0.5) out.push(`${name} ${card.className}: ${past.toFixed(1)}px past the frame`)
    }
  }
  return out
}

/** Records frame times until stopped; returns { frames, longestGapMs, over20ms, p95 }. */
const START_FRAMES = () => {
  window.__f = []
  window.__go = true
  const tick = (t) => {
    window.__f.push(t)
    if (window.__go) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
const STOP_FRAMES = () => {
  window.__go = false
  const f = window.__f
  const gaps = f.slice(1).map((t, i) => t - f[i]).sort((a, b) => a - b)
  const r1 = (v) => Math.round(v * 10) / 10
  return { frames: f.length, longestGapMs: r1(gaps[gaps.length - 1] ?? 0), p95Ms: r1(gaps[Math.floor(gaps.length * 0.95)] ?? 0), over20ms: gaps.filter((g) => g > 20).length, over34ms: gaps.filter((g) => g > 34).length }
}
const LINE = () => {
  const stage = document.querySelector(".biz [data-pane='active'] .bt-stage, .biz-card .bt-stage")
  const cards = [...document.querySelectorAll(".bt-card")].filter((c) => c.closest(".bz-frame")?.getBoundingClientRect().width)
  const front = cards.find((c) => getComputedStyle(c).transform !== "none" && Math.abs(new DOMMatrix(getComputedStyle(c).transform).m41) < 2)
  return {
    drawn: cards.filter((c) => getComputedStyle(c).visibility !== "hidden").length,
    willChange: cards.filter((c) => getComputedStyle(c).willChange !== "auto").length,
    front: front ? front.querySelector("img").currentSrc.split("/").pop() : null,
    img: cards[0] ? cards[0].querySelector("img").currentSrc.split("/").pop() : null,
    stage: !!stage,
  }
}

async function touchSwipe(cdp, page, x0, y, dx, steps = 12) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y }] })
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + (dx * i) / steps, y }] })
    await page.waitForTimeout(16)
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
}

const goCard = async (page, k) => {
  await page.evaluate((k) => {
    const rail = document.querySelector(".biz-rail")
    rail.style.scrollSnapType = "none"
    rail.scrollLeft = rail.children[k].offsetLeft - rail.children[0].offsetLeft
    rail.style.scrollSnapType = ""
  }, k)
}

const browser = await chromium.launch({ args: ["--disable-dev-shm-usage"] })
try {
  for (const [w, h] of PHONES) {
    const { ctx, page } = await open(browser, w, h, true)
    const cdp = await ctx.newCDPSession(page)
    const each = []
    const rest = []
    for (let k = 0; k < 5; k++) {
      await goCard(page, k)
      await page.waitForTimeout(k === 1 ? 1500 : 5200)
      each.push(...(await page.evaluate(OVERFLOW)))
      rest.push(
        await page.evaluate((k) => {
          const cards = [...document.querySelectorAll(".biz-card")]
          const r = cards[k].getBoundingClientRect()
          const shows = cards.filter((c, i) => i !== k).map((c) => c.getBoundingClientRect()).map((o) => Math.max(0, Math.min(o.right, innerWidth) - Math.max(o.left, 0))).reduce((a, b) => a + b, 0)
          const s = document.querySelector("[data-business]").getBoundingClientRect()
          return { k, left: Math.round(r.left), right: Math.round(innerWidth - r.right), w: Math.round(r.width), h: Math.round(r.height), neighbourShowsPx: Math.round(shows), sectionH: Math.round(s.height) }
        }, k),
      )
    }
    const m = await page.evaluate(() => ({ pageScrollsSideways: document.documentElement.scrollWidth > innerWidth, screen: innerHeight }))
    console.log(`\n${w} x ${h}`, JSON.stringify(m))
    console.log("  cards at rest:", JSON.stringify(rest))
    console.log("  overflow:", each.length ? each.join("; ") : "none")
    const runs = w === 390 ? [1, 4] : [1]
    for (const rate of runs) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate })
      const tag = rate === 1 ? "" : ` (CPU x${rate})`
      await goCard(page, 0)
      await page.waitForTimeout(800)
      const box = await page.locator(".biz-rail").boundingBox()
      await page.evaluate(START_FRAMES)
      await touchSwipe(cdp, page, Math.round(w * 0.82), Math.round(box.y + 40), -Math.round(w * 0.6))
      await page.waitForTimeout(1200)
      const swipe = await page.evaluate(STOP_FRAMES)
      const after = await page.evaluate(() => {
        const rail = document.querySelector(".biz-rail")
        const pitch = rail.children[1].offsetLeft - rail.children[0].offsetLeft
        const thumb = document.querySelector(".biz-dot-thumb")
        return { restsAt: Math.round((rail.scrollLeft / pitch) * 100) / 100, marker: thumb ? getComputedStyle(thumb).transform : null, current: [...document.querySelectorAll(".biz-dot")].findIndex((b) => b.getAttribute("aria-current")) }
      })
      console.log(`  row swipe on a card's name${tag}:`, JSON.stringify({ ...swipe, ...after }))
      /* The physical card: a finger drag across its line of designs. */
      await goCard(page, 1)
      await page.waitForTimeout(1500)
      const before = await page.evaluate(LINE)
      const sb = await page.locator(".biz-card .bt-stage").boundingBox()
      await page.evaluate(START_FRAMES)
      await touchSwipe(cdp, page, Math.round(sb.x + sb.width * 0.8), Math.round(sb.y + sb.height / 2), -Math.round(sb.width * 0.55), 14)
      await page.waitForTimeout(1100)
      const drag = await page.evaluate(STOP_FRAMES)
      const line = await page.evaluate(LINE)
      const railLeft = await page.evaluate(() => {
        const rail = document.querySelector(".biz-rail")
        return Math.round((rail.scrollLeft / (rail.children[1].offsetLeft - rail.children[0].offsetLeft)) * 100) / 100
      })
      console.log(`  drag on the store designs${tag}:`, JSON.stringify({ ...drag, frontBefore: before.front, frontAfter: line.front, drawn: line.drawn, willChange: line.willChange, img: line.img, rowStaysAt: railLeft }))
      await page.waitForTimeout(3500)
      await page.evaluate(START_FRAMES)
      await page.waitForTimeout(5000)
      const auto = await page.evaluate(STOP_FRAMES)
      console.log(`  designs turning by themselves, 5 s${tag}:`, JSON.stringify({ ...auto, front: (await page.evaluate(LINE)).front }))
    }
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    await ctx.close()
  }
  for (const [w, h] of COMPUTERS) {
    const { ctx, page } = await open(browser, w, h, false)
    const cdp = await ctx.newCDPSession(page)
    /* The shelf. */
    const shelf = await page.evaluate(() => {
      const s = document.querySelector("[data-business] [data-pane='active'] .bs-digital")
      return { shelf: !!s, products: s ? s.querySelectorAll(".bd-item").length : 0 }
    })
    await page.mouse.move(5, 5)
    await page.waitForTimeout(5000)
    const demo = await page.evaluate(() => ({ owned: [...document.querySelectorAll("[data-pane='active'] .bd-item[data-owned]")].map((b) => b.getAttribute("aria-label")) }))
    await page.locator("[data-pane='active'] .bd-item").nth(3).hover()
    await page.waitForTimeout(500)
    const hovered = await page.evaluate(() => document.querySelector("[data-pane='active'] .bd-pane[data-on] b")?.textContent)
    await page.locator("[data-pane='active'] .bd-item").nth(3).click()
    await page.locator("[data-pane='active'] .bd-pane[data-on] .bd-buy").click()
    await page.waitForTimeout(2400)
    const bought = await page.evaluate(() => ({
      owned: [...document.querySelectorAll("[data-pane='active'] .bd-item[data-owned]")].map((b) => b.getAttribute("aria-label")),
      button: document.querySelector("[data-pane='active'] .bd-pane[data-on] .bd-buy .c")?.textContent,
      buttonOpacity: getComputedStyle(document.querySelector("[data-pane='active'] .bd-pane[data-on] .bd-buy .c")).opacity,
    }))
    const each = await page.evaluate(OVERFLOW)
    console.log(`\n${w} x ${h} shelf:`, JSON.stringify({ ...shelf, demoBought: demo.owned, hoverShows: hovered, ...bought, overflow: each }))
    /* The line of store designs. */
    await page.locator(".biz-tab").nth(1).click()
    await page.mouse.move(5, 5)
    await page.waitForTimeout(1200)
    for (const rate of [1, 4]) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate })
      const tag = rate === 1 ? "" : ` (CPU x${rate})`
      await page.evaluate(START_FRAMES)
      await page.waitForTimeout(5000)
      const auto = await page.evaluate(STOP_FRAMES)
      const line = await page.evaluate(LINE)
      console.log(`  designs turning by themselves, 5 s${tag}:`, JSON.stringify({ ...auto, ...line }))
      const sb = await page.locator("[data-pane='active'] .bt-stage").boundingBox()
      await page.evaluate(START_FRAMES)
      const before = (await page.evaluate(LINE)).front
      await page.mouse.move(sb.x + sb.width * 0.8, sb.y + sb.height / 2)
      await page.mouse.down()
      for (let i = 1; i <= 20; i++) {
        await page.mouse.move(sb.x + sb.width * 0.8 - i * 14, sb.y + sb.height / 2)
        await page.waitForTimeout(16)
      }
      await page.mouse.up()
      await page.waitForTimeout(1000)
      const drag = await page.evaluate(STOP_FRAMES)
      console.log(`  mouse drag on the designs${tag}:`, JSON.stringify({ ...drag, frontBefore: before, frontAfter: (await page.evaluate(LINE)).front }))
      await page.mouse.move(5, 5)
    }
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    await page.waitForTimeout(3000)
    /* Away: nothing of the section runs. */
    await page.evaluate(() => window.scrollTo(0, document.querySelector("[data-business]").getBoundingClientRect().bottom + scrollY + 2 * innerHeight))
    await page.waitForTimeout(2500)
    const away = await page.evaluate(() => ({
      running: document.getAnimations().filter((a) => a.playState === "running" && a.effect?.target?.closest?.("[data-business]")).map((a) => a.animationName || a.effect.target.className),
    }))
    console.log("  scrolled away:", JSON.stringify(away))
    await ctx.close()
  }
} finally {
  await browser.close()
}
