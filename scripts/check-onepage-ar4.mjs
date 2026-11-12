/**
 * ===========================================================================
 *  ROUND AR, TRACK 4 IN A BROWSER: THE DATA AND MONEY BLOCKS ON THE LIVE
 *  PAGE, AT 390 (TOUCH) AND 1440
 * ===========================================================================
 * The published page (scripts/render-onepage-editor.tsx ?live through
 * ./onepage-probe-server.mjs) with a stub API that records what each block
 * sent. Chromium paints at 60 Hz; frame numbers are what it measured.
 *
 *   SIGNUP     every one of the eight layouts with a first name and a phone:
 *              each extra field the height, corners and look of that
 *              layout's email box; a bad phone refused on the page with no
 *              request; a good one sent with the signup
 *   STATS      count up: every frame a number on the way, never past it, the
 *              last one exact, the tile's width the same on every frame;
 *              roll: each digit lands on its own; reduced motion: the final
 *              number on the first frame
 *   POLL       one tap is one request; the totals' bars grow to their share
 *   TIPS       an amount sends that amount; Stripe's page (stubbed) comes
 *              back to the page, which confirms it once and says thank you
 *   OTHERS     the event card, Paid access, the reviews carousel and an
 *              RSS feed's posts, drawn with nothing wider than the screen
 *
 *   SHOTS=/some/dir to keep the screenshots somewhere
 */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-onepage-ar4-"))
mkdirSync(shots, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const numbers = {}
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)?.slice(0, 300)})`}`)
  if (!ok) broken++
}

const LAYOUTS = ["default", "pro", "cover", "bold", "minimal", "connect", "letter", "bar"]
const signup = (layout, i) => ({ id: `sig_${layout}`, type: "email_capture", enabled: true, sort_order: 10 + i, data: { headline: `Join (${layout})`, description: "One short email a week", button_preset: "subscribe", layout_type: layout, ask_name: true, ask_phone: true } })
const app = (id, data, order) => ({ id, type: "app", enabled: true, sort_order: order, data })
const inAWeek = new Date(Date.now() + 7 * 86400_000 + 3 * 3600_000).toISOString()
const blocks = [
  app("stats_count", { provider: "stats", title: "In numbers", layout: "grid", stats_animation: "count", items: [{ id: "a", title: "Students", value: "12,480+" }, { id: "b", title: "Rating", value: "4.9" }, { id: "c", title: "Courses", value: "38" }, { id: "d", title: "Countries", value: "64%" }] }, 40),
  app("stats_roll", { provider: "stats", layout: "card", stats_animation: "roll", items: [{ id: "a", title: "Sold", value: "1,204" }, { id: "b", title: "Reviews", value: "318" }, { id: "c", title: "Years", value: "7" }] }, 41),
  app("poll1", { provider: "poll", poll_question: "What should I make next?", poll_options: [{ id: "a", label: "A video course" }, { id: "b", label: "A printed guide" }, { id: "c", label: "Live workshop" }] }, 3),
  app("tips1", { provider: "tips", tip_mode: "storelib", tip_amounts: [300, 500, 1000], tip_custom: true, tip_message: true, tip_ready: true, tip_currency: "usd", title: "Buy me a coffee" }, 4),
  app("event1", { provider: "event", title: "Launch night", event_start: inAWeek, venue: "Paradiso, Amsterdam", url: "https://tickets.example.com/launch", rsvp: true, text: "Drinks, a first look at the new course and a short Q&A.", layout: "card" }, 5),
  app("paid1", { provider: "paid", title: "The full recipe book", text: "Every recipe from the series, with the shopping lists.", paid_product_id: "99999999-8888-4777-8666-555555555555", paid_ready: true, paid_price: "$9", paid_checkout: "/checkout?productId=99999999-8888-4777-8666-555555555555", locked_has_text: true }, 6),
  app("reviews1", { provider: "reviews", review_source: "storelib", layout: "carousel", title: "What buyers say", review_summary: { average: 4.8, count: 126, average_label: "4.8", count_label: "126 reviews" }, review_items: [
    { id: "r1", rating: 5, title: "Worth every cent", body: "Clear, practical and short. I used the first lesson the same evening.", author: "Jane D.", date: "Nov 1, 2026", verified: true },
    { id: "r2", rating: 4.5, title: "Great templates", body: "The planner alone paid for it.", author: "Marco R.", date: "Oct 22, 2026", verified: true },
    { id: "r3", rating: 5, title: "", body: "Good value and quick answers to questions.", author: "Customer", date: "Oct 2, 2026", verified: false },
  ] }, 7),
  app("rss1", { provider: "rss", url: "https://blog.example.com/feed.xml", title: "My blog", layout: "card", feed_count: 3, feed_items: [{ title: "How I plan a week of content", url: "https://blog.example.com/1", date: "2026-11-03" }, { title: "Five tools I use every day", url: "https://blog.example.com/2", date: "2026-10-27" }, { title: "What 1,000 students taught me", url: "https://blog.example.com/3", date: null }] }, 8),
  ...LAYOUTS.map(signup),
]

const sent = { leads: [], polls: [], tips: [], confirms: [] }
const api = (req, body) => {
  const path = req.url.split("?")[0]
  const json = () => JSON.parse(body || "{}")
  if (req.method === "POST" && path === "/api/onepage/leads") {
    sent.leads.push(json())
    return { body: { success: true, lead_id: "lead_1" } }
  }
  if (path === "/api/onepage/poll") {
    if (req.method === "GET") return { body: { voted: null, tally: null, open: true } }
    sent.polls.push(json())
    return { body: { voted: json().option_id, already: false, tally: { total: 7, options: [{ id: "a", label: "A video course", count: 4, percent: 57 }, { id: "b", label: "A printed guide", count: 2, percent: 29 }, { id: "c", label: "Live workshop", count: 1, percent: 14 }] } } }
  }
  if (req.method === "POST" && path === "/api/onepage/tip") {
    const b = json()
    if (b.confirm) {
      sent.confirms.push(b)
      return { body: { amount_cents: 500, currency: "usd" } }
    }
    sent.tips.push(b)
    return { body: { url: `${globalThis.PROBE_BASE}/app/onepage?live&tip=thanks&tip_session=cs_test_probe12345` } }
  }
  if (path === "/api/onepage/track") return { body: { success: true } }
  return null
}

const { base, server } = await serveEditorProbe({ root, blocks, api, fail: (m) => { console.error(m); process.exit(1) } })
globalThis.PROBE_BASE = base
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
const VIEWPORTS = [
  ["390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ["1440", { width: 1440, height: 900 }],
]

try {
  for (const [name, viewport] of VIEWPORTS) {
    console.log(`\n── ${name} ──`)
    /* Each width on a fresh profile: a signup made at 390 is remembered by the browser and would hide the 1440 form. */
    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    await page.setViewport(viewport)
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e.message || e)))
    await page.goto(`${base}/app/onepage?live`, { waitUntil: "networkidle0" })
    await page.waitForSelector('[data-onepage-app="stats"]', { timeout: 15000 })

    /* ── SIGNUP: the extra fields in each layout's shape ── */
    for (const layout of LAYOUTS) {
      const m = await page.evaluate((layout) => {
        const host = document.querySelector(`[data-email-layout="${layout}"]`)
        if (!host) return null
        if (layout === "bar") host.querySelector("[data-email-bar-open]")?.click()
        const email = host.querySelector('input[type="email"]')
        const nameEl = host.querySelector("[data-email-name]")
        const phone = host.querySelector("[data-email-phone]")
        if (!email || !nameEl || !phone) return { missing: [!!email, !!nameEl, !!phone] }
        const box = (el) => {
          const r = el.getBoundingClientRect()
          const s = getComputedStyle(el)
          return { h: Math.round(r.height), w: Math.round(r.width), radius: s.borderTopLeftRadius, bottom: s.borderBottomWidth, bg: s.backgroundColor, font: s.fontSize, shape: el.getAttribute("data-email-field") }
        }
        const line = host.querySelector('[data-email-form="line"]')
        return { email: box(email), name: box(nameEl), phone: box(phone), hostW: Math.round(host.getBoundingClientRect().width), lineBottom: line ? getComputedStyle(line).borderBottomWidth : null }
      }, layout)
      if (!m || m.missing) {
        expect(false, `${layout}: the name, phone and email fields are drawn`, m)
        continue
      }
      numbers[`${name}.signup.${layout}`] = m
      if (layout === "connect") {
        expect(m.name.shape === "pill" && m.phone.shape === "pill" && m.name.h === 52 && m.phone.h === 52 && parseFloat(m.name.radius) >= 26, `${layout}: name and phone are 52px white pills, like the email pill`, { name: m.name, phone: m.phone })
      } else if (layout === "letter") {
        expect(m.name.shape === "line" && m.phone.shape === "line" && m.name.bottom === m.lineBottom && m.phone.bottom === m.lineBottom && m.name.bg === "rgba(0, 0, 0, 0)" && m.name.h === 48, `${layout}: name and phone are lines in the text colour, 48px, the email line's own width (${m.lineBottom})`, { name: m.name, line: m.lineBottom })
      } else {
        const same = m.name.radius === m.email.radius && m.phone.radius === m.email.radius && Math.abs(m.name.h - m.email.h) <= 1 && Math.abs(m.phone.h - m.email.h) <= 1
        expect(same, `${layout}: name and phone match the email box (height ${m.email.h}px, corners ${m.email.radius})`, { name: m.name, phone: m.phone, email: m.email })
      }
      expect(m.name.font === "16px" && m.phone.font === "16px" || name === "1440", `${layout}: 16px type on a phone (no zoom)`, [m.name.font, m.phone.font])
      expect(m.name.w <= m.hostW && m.phone.w <= m.hostW, `${layout}: the fields fit their card`, [m.name.w, m.phone.w, m.hostW])
    }
    if (name === "390") {
      /* A bad phone is refused on the page; a good one goes with the signup. */
      const host = '[data-email-layout="default"]'
      await page.type(`${host} [data-email-name]`, "Sam")
      await page.type(`${host} [data-email-phone]`, "abc")
      await page.type(`${host} input[type="email"]`, "sam@example.com")
      await sleep(3200) /* past the form's "faster than a person" check */
      const before = sent.leads.length
      await page.click(`${host} button[type="submit"]`)
      await sleep(300)
      const err = await page.$eval(`${host} [data-email-error]`, (e) => e.textContent).catch(() => null)
      expect(!!err && sent.leads.length === before, "a bad phone is refused on the page, nothing sent", { err, sent: sent.leads.length - before })
      await page.evaluate((h) => { const i = document.querySelector(`${h} [data-email-phone]`); i.focus(); i.select() }, host)
      await page.keyboard.type("+1 (555) 123-4567")
      await page.click(`${host} button[type="submit"]`)
      await sleep(400)
      const last = sent.leads[sent.leads.length - 1]
      expect(sent.leads.length === before + 1 && last?.phone === "+1 (555) 123-4567" && last?.name === "Sam", "a good phone goes with the signup (the server keeps it as +15551234567)", last)
    }

    /* ── STATS: count up into view, smooth, no jump ── */
    const samples = await page.evaluate(async () => {
      const block = document.querySelector('[data-onepage-app="stats"][data-stat-animation="count"]')
      const tile = block.querySelector("[data-app-stat]")
      const value = tile.querySelector('[data-stat-mode="count"] span[aria-label] > span')
      window.scrollTo(0, 0)
      const out = []
      let last = performance.now()
      const gaps = []
      block.scrollIntoView({ block: "center" })
      await new Promise((resolve) => {
        const t0 = performance.now()
        const tick = (now) => {
          gaps.push(now - last)
          last = now
          out.push({ t: Math.round(now - t0), text: value.textContent, w: Math.round(tile.getBoundingClientRect().width * 10) / 10 })
          if (now - t0 < 2200) requestAnimationFrame(tick)
          else resolve()
        }
        requestAnimationFrame(tick)
      })
      return { out, gaps: gaps.slice(1) }
    })
    const vals = samples.out.map((s) => Number(String(s.text).replace(/[^\d.]/g, "")))
    const mono = vals.every((v, i) => i === 0 || v >= vals[i - 1])
    const widths = new Set(samples.out.map((s) => s.w))
    const distinct = new Set(samples.out.map((s) => s.text)).size
    const sortedGaps = [...samples.gaps].sort((a, b) => a - b)
    const p50 = sortedGaps[Math.floor(sortedGaps.length / 2)]
    const p95 = sortedGaps[Math.floor(sortedGaps.length * 0.95)]
    numbers[`${name}.stats.count`] = { frames: samples.out.length, distinct, first: samples.out[0]?.text, last: samples.out.at(-1)?.text, widths: [...widths], frameMsP50: Math.round(p50 * 10) / 10, frameMsP95: Math.round(p95 * 10) / 10 }
    expect(mono && samples.out.at(-1)?.text === "12,480+", "count up: never backwards, never past, ends exactly on 12,480+", numbers[`${name}.stats.count`])
    expect(distinct > 20, `count up: ${distinct} different numbers on the way (smooth, not a jump)`)
    expect(widths.size === 1, "count up: the tile is the same width on every frame (no layout jump)", [...widths])
    expect(p95 < 20, `frames while counting: median ${numbers[`${name}.stats.count`].frameMsP50} ms, p95 ${numbers[`${name}.stats.count`].frameMsP95} ms (60 Hz)`)
    const roll = await page.evaluate(async () => {
      const block = document.querySelector('[data-stat-animation="roll"]')
      block.scrollIntoView({ block: "center" })
      await new Promise((r) => setTimeout(r, 1800))
      return [...block.querySelectorAll('[data-stat-mode="roll"]')].map((el) => ({ label: el.getAttribute("aria-label"), shown: [...el.children].map((c) => { const col = c.firstElementChild; if (!col) return c.textContent; const m = getComputedStyle(col).transform.match(/matrix\(.*,\s*(-?[\d.]+)\)$/); const fs = parseFloat(getComputedStyle(c).fontSize); return m ? String(Math.round(-parseFloat(m[1]) / (fs * 1.05))) : "?" }).join("") }))
    })
    numbers[`${name}.stats.roll`] = roll
    expect(roll.length === 3 && roll.every((r) => r.shown === r.label), "roll: every digit lands on its own number", roll)

    /* ── POLL ── */
    const pollBefore = sent.polls.length
    await page.evaluate(() => document.querySelector('[data-onepage-app="poll"]').scrollIntoView({ block: "center" }))
    await page.click('[data-onepage-app="poll"] [data-poll-option="a"]')
    await page.click('[data-onepage-app="poll"] [data-poll-option="b"]').catch(() => {})
    await sleep(1000)
    const poll = await page.evaluate(() => [...document.querySelectorAll('[data-onepage-app="poll"] [data-poll-bar]')].map((b) => ({ want: Number(b.getAttribute("data-poll-bar")), got: Math.round((b.getBoundingClientRect().width / b.parentElement.getBoundingClientRect().width) * 100) })))
    numbers[`${name}.poll`] = poll
    expect(sent.polls.length === pollBefore + 1 && sent.polls.at(-1)?.option_id === "a", "one tap is one vote; a second tap sends nothing", sent.polls.length - pollBefore)
    expect(poll.length === 3 && poll.every((p) => Math.abs(p.got - p.want) <= 1), "the bars grow to each answer's share", poll)

    /* ── EVERY BLOCK FITS ── */
    const fit = await page.evaluate(() => {
      const over = []
      for (const el of document.querySelectorAll("[data-onepage-app], [data-email-layout]")) {
        const r = el.getBoundingClientRect()
        if (r.right > window.innerWidth + 0.5 || r.left < -0.5) over.push(el.getAttribute("data-onepage-app") || el.getAttribute("data-email-layout"))
      }
      return { over, scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, countdown: document.querySelector("[data-event-countdown]")?.textContent ?? null, feed: document.querySelectorAll("[data-feed-items] li").length, reviews: document.querySelectorAll("[data-review]").length, unlockWords: document.body.innerText.includes("shopping lists") && !document.body.innerText.includes("secret") }
    })
    numbers[`${name}.fit`] = fit
    expect(fit.over.length === 0 && fit.scrollW <= fit.innerW, "no block is wider than the screen, no sideways scroll", fit)
    expect(!!fit.countdown && /Starts in/.test(fit.countdown) && fit.feed === 3 && fit.reviews === 3, "the event counts down, the feed lists 3 posts, 3 reviews slide", fit)

    for (const [id, sel] of [["stats", '[data-stat-animation="count"]'], ["poll", '[data-onepage-app="poll"]'], ["tips", '[data-onepage-app="tips"]'], ["event", '[data-onepage-app="event"]'], ["paid", '[data-onepage-app="paid"]'], ["reviews", '[data-onepage-app="reviews"]'], ["rss", "[data-feed-items]"], ["signup-connect", '[data-email-layout="connect"]'], ["signup-letter", '[data-email-layout="letter"]'], ["signup-bold", '[data-email-layout="bold"]']]) {
      await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: "center" }), sel)
      await sleep(250)
      await page.screenshot({ path: join(shots, `ar4-${name}-${id}.png`) })
    }

    /* ── TIPS: an amount, Stripe's page, back, thanked once ── */
    if (name === "390") {
      await page.evaluate(() => document.querySelector('[data-onepage-app="tips"]').scrollIntoView({ block: "center" }))
      await page.click('[data-tip-amount="500"]')
      const label = await page.$eval("[data-tip-send]", (b) => b.textContent)
      expect(label === "Tip $5", "the button says the amount", label)
      /* Round AS: a block that asks for a note opens the amount sheet on Tip; Continue there pays. */
      await page.click("[data-tip-send]")
      await page.waitForSelector("[data-tip-continue]", { timeout: 4000 }).catch(() => {})
      await new Promise((r) => setTimeout(r, 450))
      await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => {}), page.click("[data-tip-continue]")])
      expect(sent.tips.length === 1 && sent.tips[0].amount_cents === 500 && sent.tips[0].block_id === "tips1" && sent.tips[0].return_path === "/app/onepage", "Tip sends the chosen amount, the block and the page's own path", sent.tips[0])
      await page.waitForSelector("[data-tip-thanks]", { timeout: 8000 }).catch(() => {})
      const thanks = await page.$eval("[data-tip-thanks]", (e) => e.textContent).catch(() => null)
      const url = await page.evaluate(() => location.search)
      expect(thanks === "Thank you for the $5 tip." && sent.confirms.length === 1 && !/tip_session/.test(url), "back from Stripe: confirmed once, thanked, the address tidied", { thanks, confirms: sent.confirms.length, url })
      await page.evaluate(() => document.querySelector('[data-onepage-app="tips"]').scrollIntoView({ block: "center" }))
      await sleep(250)
      await page.screenshot({ path: join(shots, `ar4-${name}-tips-thanks.png`) })
    }

    /* ── REDUCED MOTION: the final numbers at once ── */
    const quiet = await browser.newPage()
    await quiet.setViewport(viewport)
    await quiet.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    await quiet.goto(`${base}/app/onepage?live`, { waitUntil: "networkidle0" })
    await quiet.waitForSelector('[data-onepage-app="stats"]')
    const still = await quiet.evaluate(async () => {
      const block = document.querySelector('[data-onepage-app="stats"]')
      block.scrollIntoView({ block: "center" })
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      return { mode: block.getAttribute("data-stat-animation"), text: block.querySelector("[data-app-stat]").innerText.split("\n")[0] }
    })
    expect(still.mode === "none" && still.text === "12,480+", "reduced motion: no count, the final number on the first frame", still)
    await quiet.close()

    expect(errors.length === 0, "no script errors", errors.slice(0, 3))
    await page.close()
    await context.close()
  }
} finally {
  await browser.close()
  server.close()
  writeFileSync(join(shots, "ar4-numbers.json"), JSON.stringify(numbers, null, 2))
  console.log(`\nScreenshots and numbers: ${shots}`)
}
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
