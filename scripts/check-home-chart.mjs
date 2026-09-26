/**
 * ===========================================================================
 *  HOME'S CHART: HOW LONG A TAB, A PERIOD AND THE FIRST LOAD TAKE
 * ===========================================================================
 * "Sometimes in the chart of the dashboard home, in the tabs views revenue,
 * orders, it takes too much to load the data; blur it while it loads but
 * keep it intact, smooth, clean."
 *
 * The real Home (scripts/render-home-banner.tsx with `&reports=1`) on a
 * 390x844 phone, the network answered from fixtures after the delays a
 * phone on a fair connection sees: the Analytics answer's figures line
 * after REPORTS_MS, the rest LISTS_MS later, and every database read the
 * browser makes (the link taps, a page at a time) after READ_MS. Every
 * frame the chart's line is read, and for each step the time from the tap
 * to:
 *
 *   moved     the first frame the line is different
 *   settled   the frame from which it stays as it ends
 *
 * and what the chart looked like while it waited: never empty, and blurred
 * (filter blur, dimmed) for as long as the numbers it shows are not the
 * period's, and never for a tab, which only picks another line the page
 * already has.
 *
 *   node scripts/check-home-chart.mjs
 *   READ_MS=300 REPORTS_MS=450 LISTS_MS=600 SHOTS=/some/dir node scripts/check-home-chart.mjs
 *   EXPECT=none node scripts/check-home-chart.mjs     (prints, judges nothing: for a before)
 */
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { homeProbePage } from "./home-probe-page.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS
const READ_MS = Number(process.env.READ_MS ?? 300)
const REPORTS_MS = Number(process.env.REPORTS_MS ?? 450)
const LISTS_MS = Number(process.env.LISTS_MS ?? 600)
const JUDGE = process.env.EXPECT !== "none"
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let broken = 0
const expect = (ok, what, got = "") => {
  if (!JUDGE) return
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${typeof got === "string" ? got : JSON.stringify(got)}`}`)
  if (!ok) broken++
}

/* Every frame: the line's path, its colour, and the look of the box it is drawn in. */
const SAMPLER = `
window.__chart = []
window.__chartOn = true
window.__long = []
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ t: e.startTime, d: Math.round(e.duration) }) }).observe({ type: "longtask", buffered: true }) } catch {}
/* When the period really changes: the picker's button says the new one. On a phone the sheet closes first, then the pick is handed over. */
window.__labelAt = []
new MutationObserver(() => {
  const b = [...document.querySelectorAll('button[aria-haspopup="dialog"]')].find((el) => el.getClientRects().length && /day|month|year|week|today/i.test(el.textContent))
  const text = b ? b.textContent : ""
  if (text && text !== window.__label) { window.__label = text; window.__labelAt.push({ t: performance.now(), text }) }
}).observe(document, { subtree: true, childList: true, characterData: true })
const f = () => {
  if (!window.__chartOn) return
  const line = document.querySelector("[data-trend-line]")
  const box = line && line.closest("[aria-busy], .transition-\\\\[opacity\\\\2c filter\\\\]") || (line && line.parentElement.parentElement.parentElement.parentElement)
  let blur = 0
  let opacity = 1
  for (let n = line; n && n !== document.body; n = n.parentElement) {
    const cs = getComputedStyle(n)
    const m = /blur\\(([\\d.]+)px\\)/.exec(cs.filter)
    if (m) blur = Math.max(blur, Number(m[1]))
    opacity *= Number(cs.opacity)
  }
  window.__chart.push({ t: performance.now(), d: line ? line.getAttribute("d") || "" : null, stroke: line ? line.getAttribute("stroke") : null, blur, opacity: Math.round(opacity * 100) / 100 })
  requestAnimationFrame(f)
}
requestAnimationFrame(f)
`

const { base, close } = await homeProbePage()
const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--no-proxy-server", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"],
})

/** From a frame log: when the line first differs from what it was at `t0`, and when it reaches what it ends as. */
function timing(frames, t0) {
  const after = frames.filter((f) => f.t >= t0)
  const before = frames.filter((f) => f.t < t0).at(-1) ?? after[0]
  const final = after.at(-1)
  const moved = after.find((f) => f.d !== before?.d)
  let settled = null
  for (let i = after.length - 1; i >= 0; i--) {
    if (after[i].d !== final.d || after[i].stroke !== final.stroke) break
    settled = after[i]
  }
  const waiting = after.filter((f) => settled && f.t < settled.t)
  return {
    moved: moved ? Math.round(moved.t - t0) : null,
    settled: settled ? Math.round(settled.t - t0) : null,
    empty: after.filter((f) => !f.d).length,
    blurredFrames: waiting.filter((f) => f.blur >= 3).length,
    waitingFrames: waiting.length,
    maxBlur: Math.max(0, ...after.map((f) => f.blur)),
    minOpacity: Math.min(1, ...after.map((f) => f.opacity)),
  }
}

const results = {}

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  await page.evaluateOnNewDocument((r, l, d, sampler) => {
    window.__reportsMs = r
    window.__listsMs = l
    window.__readMs = d
    try { localStorage.setItem("dashboard_period", JSON.stringify({ preset: "last_7_days" })) } catch {}
    window.__startedAt = performance.now()

    new Function(sampler)()
  }, REPORTS_MS, LISTS_MS, READ_MS, SAMPLER)
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.goto(`${base}/app?state=selling&reports=1`, { waitUntil: "domcontentloaded", timeout: 120000 })
  await page.waitForSelector("[data-trend-line]", { timeout: 60000 })

  /* ── THE FIRST LOAD ── */
  await page.waitForFunction(() => {
    const l = document.querySelector("[data-trend-line]")
    return l && l.getAttribute("stroke") === "#8b5cf6" && !document.querySelector("[aria-busy='true'] [data-trend-line]")
  }, { timeout: 30000 })
  /*
    Then a moment's rest before the first tap. Here, in the first second or
    two after the line lands, this machine's software GPU is still busy with
    the page's first pictures (the globe among them; traced: its GPU thread
    at 680ms of every 700), and a tap then waited 400 to 700ms for a frame,
    with no work of the page's own on the main thread. A phone's GPU does
    not; waiting keeps that out of the tab's number.
  */
  await sleep(Number(process.env.SETTLE_MS ?? 2500))
  const first = await page.evaluate(() => {
    const frames = window.__chart
    const real = frames.find((f) => f.stroke === "#8b5cf6")
    const asked = window.__reportFetches[0]?.at
    return { real: real ? Math.round(real.t - window.__startedAt) : null, afterAsking: real && asked ? Math.round(real.t - asked) : null, reads: window.__reads ?? 0, fetches: window.__reportFetches.length }
  })
  results.load = first
  console.log(`\nfirst load (answer ${REPORTS_MS}ms, reads ${READ_MS}ms each): the period's line drawn ${first.afterAsking}ms after it was asked for (${first.real}ms after the page started); ${first.fetches} report request(s), ${first.reads} database read(s)`)

  /* ── A TAB ── */
  const tap = async (tab) => {
    await page.evaluate(() => { window.__chart.length = 0 })
    await sleep(120)
    const t0 = await page.evaluate((tab) => {
      const t = performance.now()
      document.querySelector(`[role=tab][data-tab="${tab}"]`).click()
      return t
    }, tab)
    await sleep(1400)
    const frames = await page.evaluate(() => window.__chart.slice())
    const long = await page.evaluate((t0) => window.__long.filter((e) => e.t >= t0 - 50).map((e) => `${Math.round(e.t - t0)}:${e.d}`), t0)
    return { ...timing(frames, t0), long, fetches: await page.evaluate(() => window.__reportFetches.length) }
  }
  console.log("\ntabs (the answer is in)")
  results.tabs = {}
  for (const tab of ["revenue", "orders", "views", "conversion", "revenue"]) {
    const before = await page.evaluate(() => window.__reportFetches.length)
    const r = await tap(tab)
    results.tabs[tab] = r
    console.log(`  ${tab.padEnd(10)} moved after ${r.moved}ms, settled after ${r.settled}ms, ${r.fetches - before} request(s), blurred ${r.blurredFrames} frame(s), never empty: ${r.empty === 0}${r.long.length ? `, long tasks ${r.long.join(" ")}` : ""}`)
    expect(r.fetches === before, `${tab}: no request for a tab`)
    expect(r.moved !== null && r.moved <= 100, `${tab}: the line starts moving within a few frames of the tap, with nothing to wait for (${r.moved}ms)`, r)
    expect(r.maxBlur < 1, `${tab}: a tab never blurs the chart`, r)
    expect(r.empty === 0, `${tab}: never an empty chart`, r)
  }

  /* ── A PERIOD ── */
  const pickPeriod = async (preset) => {
    await page.evaluate(() => { window.__chart.length = 0 })
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button[aria-haspopup="dialog"]')].find((el) => el.getClientRects().length && /day|month|year|week|today/i.test(el.textContent))
      b.click()
    })
    await page.waitForFunction((p) => { const r = document.querySelector(`[data-row="${p}"]`); return r && r.getClientRects().length }, { timeout: 5000 }, preset)
    await sleep(500)
    const t0 = await page.evaluate((p) => {
      const t = performance.now()
      document.querySelector(`[data-row="${p}"]`).click()
      return t
    }, preset)
    await sleep(REPORTS_MS + READ_MS * 3 + 1500)
    const frames = await page.evaluate(() => window.__chart.slice())
    const committed = await page.evaluate((t0) => window.__labelAt.find((e) => e.t >= t0)?.t ?? null, t0)
    const fromCommit = committed ? timing(frames, committed) : null
    return { ...timing(frames, t0), handedOver: committed ? Math.round(committed - t0) : null, movedAfterHandover: fromCommit?.moved ?? null, settledAfterHandover: fromCommit?.settled ?? null }
  }
  console.log("\nperiods (each asked for the first time, then again)")
  results.periods = {}
  for (const preset of ["last_30_days", "last_7_days", "last_30_days"]) {
    const r = await pickPeriod(preset)
    results.periods[`${preset}${results.periods[preset] ? " again" : ""}`] = r
    console.log(`  ${preset.padEnd(13)} the sheet hands the pick over after ${r.handedOver}ms; from then the line moved after ${r.movedAfterHandover}ms and settled after ${r.settledAfterHandover}ms (from the tap: ${r.moved}, ${r.settled}); blurred ${r.blurredFrames} of ${r.waitingFrames} waiting frames (most ${r.maxBlur}px, opacity down to ${r.minOpacity}), empty frames ${r.empty}`)
    expect(r.empty === 0, `${preset}: the chart is never empty while the new period comes`, r)
  }
  const p30 = results.periods.last_30_days
  expect(p30.movedAfterHandover !== null && p30.movedAfterHandover <= REPORTS_MS + 250, `a new period moves to its line once its answer is in, not after the link taps are read (${p30.movedAfterHandover}ms with the answer at ${REPORTS_MS}ms and the taps at ${READ_MS}ms a read)`, p30)
  expect(p30.blurredFrames > 0 && p30.maxBlur >= 3.5 && p30.maxBlur <= 5 && p30.minOpacity < 1, "while a new period's answer is on its way the old chart stays, blurred about 4px and dimmed", p30)
  const again = results.periods["last_30_days again"]
  expect(again.movedAfterHandover !== null && again.movedAfterHandover <= 100 && again.blurredFrames === 0, `a period asked for before is drawn from what was kept, at once and sharp (moved ${again.movedAfterHandover}ms after the pick)`, again)
  if (SHOTS) {
    /* Pictures, apart from the timed picks (a screenshot stalls the frames it lands in): a period on its way, held there, then landed. */
    const shot = (name) => page.evaluate(() => document.querySelector("[data-trend-line]").closest(".rounded-2xl").scrollIntoView({ block: "center" }))
      .then(async () => (await (await page.$("[data-trend-line]")).evaluateHandle((el) => el.closest(".rounded-2xl"))).asElement().screenshot({ path: join(SHOTS, name) }))
    await shot("chart-before-pick.png")
    await page.evaluate(() => { window.__reportsMs = 6000 })
    await page.evaluate(() => [...document.querySelectorAll('button[aria-haspopup="dialog"]')].find((el) => el.getClientRects().length && /day|month|year|week|today/i.test(el.textContent)).click())
    await page.waitForFunction(() => { const r = document.querySelector('[data-row="last_90_days"]'); return r && r.getClientRects().length }, { timeout: 5000 })
    await sleep(500)
    await page.evaluate(() => document.querySelector('[data-row="last_90_days"]').click())
    await page.waitForFunction(() => document.querySelector("[data-chart-stale]"), { timeout: 5000 })
    await sleep(700)
    await shot("chart-waiting.png")
    await page.waitForFunction(() => !document.querySelector("[data-chart-stale]"), { timeout: 15000 })
    await sleep(900)
    await shot("chart-landed.png")
  }
  expect(errors.length === 0, "no errors", errors.slice(0, 3))
  await page.close()
} finally {
  await browser.close()
  close()
}
console.log(`\n${JSON.stringify(results)}`)
console.log(!JUDGE ? "\n(measured only)\n" : broken ? `\n${broken} failed\n` : "\nall good\n")
process.exit(broken ? 1 : 0)
