/**
 * ===========================================================================
 *  LANDING ROUND 9, PURPLE: THE ANALYTICS ENTRANCE AND THE WORLD MAP, MEASURED
 * ===========================================================================
 * The owner: analytics "should appear smoothly, clean, animated as I scroll
 * down"; the map on a white sheet with a black card, "the autoplay is every
 * 3 seconds", Buy now clear of "Their money, their language".
 *
 * Against a running page (BASE, default http://localhost:3000/), on a phone
 * (iPhone 13, touch) and at 1440x900, walking down the page 90px at a time:
 *
 *   ENTRANCE  a block is never still waiting once it is well on screen, never
 *             "in" while wholly below it, all are in at the end, and the
 *             page's layout shift over the whole walk.
 *   MAP       the section's ground, the card's ground and shadow, the room
 *             under the card (the shadow must end inside it), the gap from
 *             Buy now to the copy, the time between turns, and that exactly
 *             one country is lit after a press on a flag.
 *
 *   node scripts/check-home-r9-purple.mjs            (exit 1 when a number is off)
 */
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
let playwright
try {
  playwright = require("playwright")
} catch {
  playwright = require("/opt/node-tools/node_modules/playwright")
}
const { chromium, devices } = playwright
const BASE = process.env.BASE || "http://localhost:3000/"
const HIDE = "nextjs-portal,[data-cookie-banner]{display:none!important}"

async function one(browser, kind) {
  const ctx = await browser.newContext(kind === "phone" ? { ...devices["iPhone 13"] } : { viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.addInitScript(() => {
    window.__cls = 0
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value
      }).observe({ type: "layout-shift", buffered: true })
    } catch {}
  })
  /* Once to the foot and back, so a development server has every section's code ready; then the walk that counts, from a fresh load. */
  await page.goto(BASE, { waitUntil: "load", timeout: 180_000 })
  for (let y = 0, total = 1; y <= total; y += 600) {
    total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
    await page.evaluate((yy) => scrollTo(0, yy), y)
    await page.waitForTimeout(120)
  }
  await page.waitForSelector(".cmm-card", { timeout: 120_000 })
  await page.goto(BASE, { waitUntil: "load", timeout: 180_000 })
  await page.evaluate(() => scrollTo(0, 0))
  await page.addStyleTag({ content: HIDE })
  await page.waitForTimeout(600)
  const out = { kind }

  let bad = 0
  let y = 0
  for (;;) {
    const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
    if (y > total) break
    await page.evaluate((yy) => scrollTo(0, yy), y)
    await page.waitForTimeout(90)
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll("#analytics-showcase [data-rise]")].map((n) => ({ s: n.dataset.rise, top: n.getBoundingClientRect().top, vh: innerHeight })),
    )
    for (const r of rows) {
      if (r.s === "wait" && r.top < r.vh * 0.92 - 100) bad++
      if (r.s === "in" && r.top > r.vh) bad++
    }
    y += 90
  }
  out.badStates = bad
  out.atEnd = await page.evaluate(() => [...document.querySelectorAll("#analytics-showcase [data-rise]")].map((n) => n.dataset.rise))
  out.cls = await page.evaluate(() => +window.__cls.toFixed(4))

  await page.evaluate(() => document.querySelector(".cmm-card").scrollIntoView({ block: "center" }))
  await page.waitForTimeout(600)
  out.map = await page.evaluate(() => {
    const q = (s) => document.querySelector(s)
    const r = (s) => q(s).getBoundingClientRect()
    const cs = (s) => getComputedStyle(q(s))
    const reach = (shadow) => {
      /* The one shadow that is not inset: how far below the card it can reach (y + blur + spread). */
      const drop = shadow.split(/,(?![^(]*\))/).filter((p) => !/inset/.test(p))[0]
      const n = drop?.match(/(-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px/)
      return n ? Number(n[2]) + Number(n[3]) + Number(n[4]) : 0
    }
    return {
      sectionBg: cs(".cmm").backgroundColor,
      cardBg: cs(".cmm-card").backgroundColor,
      shadowReach: reach(cs(".cmm-card").boxShadow),
      roomUnderCard: Math.round(r(".cmm").bottom - r(".cmm-card").bottom),
      buyToCopy: Math.round(r(".cmm-copy h3").top - r(".cmm-buy").bottom),
      overflowX: document.documentElement.scrollWidth - innerWidth,
    }
  })
  const times = await page.evaluate(
    () =>
      new Promise((res) => {
        const t = []
        const card = document.querySelector(".cmm-flag-lit")
        let last = card.style.getPropertyValue("--cmm-a")
        const mo = new MutationObserver(() => {
          const a = card.style.getPropertyValue("--cmm-a")
          if (a !== last) {
            last = a
            t.push(Math.round(performance.now()))
          }
        })
        mo.observe(card, { attributes: true, attributeFilter: ["style"] })
        setTimeout(() => {
          mo.disconnect()
          res(t)
        }, 10500)
      }),
  )
  out.turnGaps = times.slice(1).map((t, i) => t - times[i])
  const flag = page.locator(".cmm-flag").nth(4)
  if (kind === "phone") await flag.tap()
  else await flag.click()
  await page.waitForTimeout(900)
  out.lit = await page.evaluate(() => ({
    photos: document.querySelectorAll(".cmm-photos img[data-on]").length,
    pressed: [...document.querySelectorAll('.cmm-flag[aria-pressed="true"]')].map((b) => b.getAttribute("aria-label")),
    buy: document.querySelector(".cmm-buy [data-on]")?.textContent,
  }))
  await ctx.close()

  const m = out.map
  out.ok =
    bad === 0 &&
    out.atEnd.length === 5 &&
    out.atEnd.every((s) => s === "in") &&
    out.cls < 0.01 &&
    m.sectionBg === "rgb(255, 255, 255)" &&
    m.cardBg === "rgb(15, 15, 18)" &&
    m.shadowReach < m.roomUnderCard &&
    m.buyToCopy >= 32 &&
    m.overflowX === 0 &&
    out.turnGaps.length >= 2 &&
    out.turnGaps.every((g) => g > 2900 && g < 3300) &&
    out.lit.photos === 1 &&
    out.lit.pressed.join() === "France" &&
    out.lit.buy === "Acheter"
  return out
}

const browser = await chromium.launch()
let ok = true
for (const kind of ["phone", "desk"]) {
  const out = await one(browser, kind)
  console.log(JSON.stringify(out))
  ok &&= out.ok
}
await browser.close()
console.log(ok ? "\nall as it should be" : "\nNOT as it should be")
process.exit(ok ? 0 : 1)
