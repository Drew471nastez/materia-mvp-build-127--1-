/**
 * ===========================================================================
 *  ANALYTICS, ROUND 41: THE FILTER ROW, THE GRID, A REPORT OPENED, A SWITCH
 * ===========================================================================
 * Mounts the real AnalyticsClient (scripts/render-analytics-tabs.tsx: every
 * read answered from fixtures after `window.__delay` ms) at 390 and 1440 and
 * measures:
 *
 *   row       the period, place, product, kind and Export controls: one row,
 *             every one 36px tall, the gaps between the filters, Export's
 *             label whole inside its button (icon only on a phone)
 *   grid      the sales reports and the report cards, cut into 8px bands:
 *             the share of the width each band's cards cover (a band in a
 *             row gap covers nothing and is skipped). An empty right half
 *             is a band at ~50%
 *   drill     the expand button on a card and on the chart: the window's box
 *             as it rises and at rest (centred, round 43), its rows against the card's, and gone
 *             after Escape (or the sheet's own close on a phone)
 *   switch    the kind switched with a 700ms server: how long until the
 *             figures change, that the old ones stay on screen meanwhile,
 *             a switch back (kept) answered at once with no dim, a read
 *             ahead on hover answering the tap from memory, and a late
 *             answer to an older question never replacing a newer one
 *
 *   PROBE_CSS=source node scripts/check-analytics-drill.mjs
 *   SHOTS=<dir> ...   keeps screenshots of the row and the opened panel
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
const dir = join(root, ".page-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "native-bridge.js"), `export function hapticTap() {}
export function isNativeApp() { return false }
export async function triggerHaptic() {}
export function openExternal() {}
export function nativePlatform() { return "web" }
export function shareNative() { return Promise.resolve(false) }
`)
writeFileSync(join(dir, "next-navigation.js"), `
const router = { replace() {}, push() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }
export function useRouter() { return router }
export function useSearchParams() { return new URLSearchParams(location.search) }
export function usePathname() { return location.pathname }
export function redirect() {}
export function notFound() {}
`)
writeFileSync(join(dir, "next-link.js"), `import * as React from "react"
export default function Link({ href, children, prefetch, replace, scroll, ...rest }) { return React.createElement("a", { href: String(href), ...rest }, children) }
`)

let server
let browser
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
try {
  const css = await appCss(root)
  const bundle = join(dir, "drill-probe.js")
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-analytics-tabs.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"',
    `--alias:@/lib/native-bridge=${join(dir, "native-bridge.js")}`,
    `--alias:next/navigation=${join(dir, "next-navigation.js")}`,
    `--alias:next/link=${join(dir, "next-link.js")}`,
    `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
  const js = readFileSync(bundle)
  const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script src="/probe.js"></script></body></html>`
  server = createServer((req, res) => {
    if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js) }
    res.writeHead(200, { "content-type": "text/html" }); res.end(html)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })

  for (const width of [390, 1440]) {
    const phone = width < 640
    console.log(`\n${width}px`)
    /* Each width in its own context: nothing kept by the one before (lib/analytics/report-cache keeps answers in storage). */
    const ctx = await browser.createBrowserContext()
    const p = await ctx.newPage()
    await p.setViewport(phone ? { width, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width, height: 900 })
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e.message || e)))
    await p.goto(`${origin}/?delay=150&physical=1`, { waitUntil: "load" })
    await p.waitForSelector("[role=tablist][aria-label=Metric] [data-tab]", { timeout: 15000 })
    await sleep(1800)

    /* ── the row ─────────────────────────────────────────────────────── */
    const row = await p.evaluate(() => {
      const ctl = document.querySelector("[data-analytics-controls]")
      const strip = ctl.querySelector("[data-analytics-pickers]")
      const items = [...strip.children].map((el) => (el.matches("button") ? el : el.querySelector("button[aria-haspopup], [role=tablist]") || el))
      const exp = ctl.querySelector("[data-analytics-export]")
      const r = (el) => el.getBoundingClientRect()
      const boxes = items.map((el) => ({ label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40), top: Math.round(r(el).top), h: Math.round(r(el).height), left: Math.round(r(el).left), right: Math.round(r(el).right), cut: el.scrollWidth > el.clientWidth + 1 }))
      const gaps = boxes.slice(1).map((b, i) => b.left - boxes[i].right)
      const label = exp.querySelector("span")
      const lr = label ? label.getBoundingClientRect() : null
      const er = r(exp)
      const kinds = strip.querySelector("[data-segmented-pills='filter']")
      return {
        boxes, gaps,
        exportBox: { top: Math.round(er.top), h: Math.round(er.height), w: Math.round(er.width), right: Math.round(er.right), scroll: exp.scrollWidth, client: exp.clientWidth, labelShown: !!lr && lr.width > 0, labelInside: !lr || lr.width === 0 || (lr.left >= er.left - 0.5 && lr.right <= er.right + 0.5) },
        kinds: kinds ? { inRow: true, h: Math.round(r(kinds).height), bg: getComputedStyle(kinds).backgroundColor, ring: getComputedStyle(kinds).boxShadow !== "none", chosen: getComputedStyle(kinds.querySelector("span[aria-hidden]")).backgroundColor } : null,
        pageScrollX: document.documentElement.scrollWidth - innerWidth,
      }
    })
    console.log("  row:", JSON.stringify(row))
    const tops = new Set([...row.boxes.map((b) => b.top), row.exportBox.top])
    expect(tops.size === 1, "period, place, product, kind and Export are one row", [...tops])
    expect([...row.boxes.map((b) => b.h), row.exportBox.h].every((h) => h === 36), "every control is 36px tall", [...row.boxes.map((b) => b.h), row.exportBox.h])
    expect(row.gaps.every((g) => g === 8), "8px between every two filters", row.gaps)
    expect(row.kinds && row.kinds.bg === "rgb(255, 255, 255)" && row.kinds.ring && row.kinds.chosen === "rgb(26, 26, 46)", "the kind switch is a white ringed chip, the chosen one dark", row.kinds)
    expect(row.exportBox.scroll <= row.exportBox.client && row.exportBox.labelInside, "Export's content is whole inside it", row.exportBox)
    expect(phone ? !row.exportBox.labelShown && row.exportBox.w === 36 : row.exportBox.labelShown && row.exportBox.w > 70, phone ? "Export on a phone: the icon in a 36px circle" : "Export on a computer: icon and label", row.exportBox)
    expect(row.exportBox.right <= width && row.pageScrollX <= 0, "Export on screen, nothing scrolls the page sideways", { right: row.exportBox.right, pageScrollX: row.pageScrollX })
    if (!phone) {
      const last = row.boxes[row.boxes.length - 1]
      expect(row.exportBox.right - last.right > 0 && row.boxes[0].left < 200, "the filters sit together from the left, Export at the end", { firstLeft: row.boxes[0].left, lastFilterRight: last.right, exportRight: row.exportBox.right })
    }

    /* ── the grid ───────────────────────────────────────────────────── */
    if (!phone) {
      const cover = await p.evaluate(() => {
        const out = {}
        for (const sel of ["[data-commerce-reports]", "[data-analytics-cards]"]) {
          const g = document.querySelector(sel)
          const gr = g.getBoundingClientRect()
          const cards = [...g.children].filter((c) => c.matches("section[data-card]")).map((c) => c.getBoundingClientRect())
          let min = 1
          let bands = 0
          for (let y = gr.top + 4; y < gr.bottom - 4; y += 8) {
            /* A card counts down to the next one under it: the 16px gap between two stacked cards is not an empty area. */
            const hit = cards.filter((c) => c.top <= y && c.bottom + 16 >= y)
            if (!hit.length) continue
            bands++
            const covered = hit.reduce((a, c) => a + c.width, 0) + (hit.length - 1) * 16
            min = Math.min(min, covered / gr.width)
          }
          out[sel] = { bands, minCover: +min.toFixed(3), cards: cards.length }
        }
        return out
      })
      console.log("  grid:", JSON.stringify(cover))
      for (const [sel, c] of Object.entries(cover)) expect(c.minCover > 0.98, `${sel}: every band of cards covers the whole width`, c)
      /* And with the reports the seller added taken off, the last row still fills (10 cards: one alone across three columns). */
      /* Measured on a copy of the grid with 10 and with 11 cards, so the page React draws is left alone. */
      const fills = await p.evaluate(() => {
        const g = document.querySelector("[data-analytics-cards]")
        const out = []
        for (const n of [10, 11]) {
          const copy = g.cloneNode(true)
          copy.removeAttribute("data-soft")
          g.after(copy)
          const cards = [...copy.children].filter((c) => c.matches("section[data-card]"))
          cards.slice(n).forEach((c) => c.remove())
          const kept = cards.slice(0, n)
          const gw = copy.getBoundingClientRect().width
          const last = kept[kept.length - 1].getBoundingClientRect()
          out.push({ cards: n, lastShare: +(last.width / gw).toFixed(3), lastRight: Math.round(last.right - copy.getBoundingClientRect().right) })
          copy.remove()
        }
        return out
      })
      console.log("  last row:", JSON.stringify(fills))
      expect(fills[0].lastShare === 1 && fills[1].lastShare > 0.66 && fills[1].lastRight === 0, "a short last row is filled: one card across all three columns, the second of two across two", fills)
    }

    /* ── a report, opened ───────────────────────────────────────────── */
    const cardRows = await p.evaluate(() => document.querySelectorAll('[data-card="traffic"] [data-row-key]').length)
    await p.evaluate(() => document.querySelector('[data-view-report="traffic"]').scrollIntoView({ block: "center" }))
    await sleep(300)
    await p.evaluate(() => document.querySelector('[data-view-report="traffic"]').click())
    await sleep(120)
    const mid = await p.evaluate(() => { const el = document.querySelector("[data-report-detail]"); if (!el) return null; const box = (el.closest("[data-sheet]") || el).getBoundingClientRect(); const panel = el.matches("[data-detail-panel]") ? el : null; return { left: Math.round(panel ? panel.getBoundingClientRect().left : box.left), top: Math.round(box.top) } })
    await sleep(650)
    const shot = await p.evaluate(() => {
      const el = document.querySelector("[data-report-detail]")
      if (!el) return null
      const panel = el.matches("[data-detail-panel]")
      const r = (panel ? el : el.closest("[role=dialog]") || el.parentElement).getBoundingClientRect()
      return { panel, left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height), title: document.querySelector("[data-detail-head]")?.textContent?.trim().slice(0, 60), rows: el.querySelectorAll("[data-detail-row]").length, figure: !!el.querySelector("[data-detail-figure]"), chart: !!el.querySelector("[data-detail-chart] svg"), previous: [...el.querySelectorAll("[data-detail-table] th")].map((t) => t.textContent.trim()) }
    })
    console.log("  opened:", JSON.stringify({ mid, shot }))
    expect(!!shot, "View report opens the traffic report")
    if (shot) {
      if (phone) expect(shot.bottom >= 840 && shot.h > 600, "on a phone: the tall sheet from the bottom", shot)
      else {
        /* Changed on purpose (round 43): a centred window, not a panel at the right edge. */
        expect(shot.panel && Math.abs(shot.left - (width - shot.right)) <= 1 && shot.w >= 640 && shot.w <= 720 && shot.top > 40 && shot.h <= 900 * 0.86 + 1, "on a computer: a window in the middle, at most 720px wide and 86% tall", shot)
        expect(mid && mid.top >= shot.top, "it rises in (caught at or below its rest 120ms in)", { mid: mid && mid.top, rest: shot.top })
      }
      expect(shot.figure && shot.chart, "the figure and its chart over time", shot)
      expect(shot.rows >= cardRows && shot.rows > 0, "every row, at least as many as the card", { card: cardRows, panel: shot.rows })
      expect(phone ? shot.previous.includes("Change") : shot.previous.includes("Previous") && shot.previous.includes("Change"), "this period, the period before and the change", shot.previous)
    }
    if (process.env.SHOTS) { mkdirSync(process.env.SHOTS, { recursive: true }); await p.screenshot({ path: join(process.env.SHOTS, `drill-${width}.png`) }) }
    if (phone) await p.evaluate(() => { const s = document.querySelector("[data-report-detail]"); const scrim = [...document.querySelectorAll("body > *")].find((n) => n.querySelector?.("[data-report-detail]")); (scrim?.querySelector("[aria-label=Close], [data-scrim], [data-sheet-scrim]") || null)?.click() })
    await p.keyboard.press("Escape")
    await sleep(700)
    const gone = await p.evaluate(() => { const el = document.querySelector("[data-report-detail]"); if (!el) return true; const r = el.getBoundingClientRect(); return r.top >= innerHeight - 1 || r.left >= innerWidth - 1 })
    expect(gone, "and it closes")

    /* The chart's figure, opened: every day of the week. */
    await p.evaluate(() => { document.querySelector(".page-scroll").scrollTop = 0; document.querySelector('[data-view-report^="metric:"]').click() })
    await sleep(800)
    const metric = await p.evaluate(() => { const el = document.querySelector("[data-report-detail]"); return el ? { id: el.querySelector("[data-detail-id]")?.getAttribute("data-detail-id"), days: el.querySelectorAll('[data-detail-section="Over time"] [data-detail-row]').length, sections: [...el.querySelectorAll("[data-detail-section]")].map((s) => s.getAttribute("data-detail-section")) } : null })
    console.log("  metric opened:", JSON.stringify(metric))
    expect(metric && metric.id === "metric:views" && metric.days === 7 && metric.sections.includes("By source"), "the Visitors figure opens: 7 days and the sources", metric)
    await p.keyboard.press("Escape")
    await sleep(700)

    /* A sales card opens its own. */
    await p.evaluate(() => document.querySelector('[data-view-report="sales-breakdown"]').click())
    await sleep(800)
    const sales = await p.evaluate(() => { const el = document.querySelector("[data-report-detail] [data-detail-id='sales-breakdown']"); return el ? el.querySelectorAll("[data-detail-row]").length : 0 })
    expect(sales >= 4, "Sales breakdown opens with its lines", sales)
    await p.keyboard.press("Escape")
    await sleep(700)

    /* ── a switch ───────────────────────────────────────────────────── */
    const revenue = () => p.evaluate(() => document.querySelector("[role=tablist][aria-label=Metric] [data-tab=revenue]").textContent)
    const kind = (label) => p.evaluate((label) => [...document.querySelectorAll("[data-segmented-pills='filter'] [role=tab]")].find((b) => b.textContent.trim() === label).click(), label)
    /* Watch the revenue tab and the chart's opacity every frame from the tap. */
    const watch = (ms) => p.evaluate((ms) => new Promise((res) => {
      const t0 = performance.now()
      const tab = document.querySelector("[role=tablist][aria-label=Metric] [data-tab=revenue]")
      const chart = document.querySelector("[data-chart-soft]")
      const first = tab.textContent
      const seen = { changedAt: null, minOpacity: 1, blankFrames: 0, texts: [first] }
      const tick = () => {
        const now = performance.now() - t0
        const text = tab.textContent
        if (!/\d/.test(text)) seen.blankFrames++
        if (text !== seen.texts[seen.texts.length - 1]) seen.texts.push(text)
        if (seen.changedAt === null && text !== first) seen.changedAt = Math.round(now)
        if (chart) seen.minOpacity = Math.min(seen.minOpacity, +getComputedStyle(chart).opacity)
        if (now < ms) requestAnimationFrame(tick)
        else res(seen)
      }
      tick()
    }), ms)
    const all = await revenue()
    await p.evaluate(() => { window.__delay = 700 })
    const w1 = watch(2500)
    await kind("Digital")
    const slow = await w1
    console.log("  Digital, 700ms server:", JSON.stringify(slow))
    expect(slow.changedAt !== null && slow.changedAt >= 650 && slow.changedAt < 2000, "a new question: figures in once the answer is (700ms server, plus the fixture counting it on this thread)", slow.changedAt)
    expect(slow.blankFrames === 0 && slow.texts[0] === all, "the old figures stay on screen until then, never blank", slow)
    expect(slow.minOpacity >= 0.55 && slow.minOpacity < 0.99, "and are dimmed slightly while it waits", slow.minOpacity)
    /* The sales reports' answer lands 200ms after the figures, and the fixture counts it on this same thread: let it. */
    await sleep(1500)
    const w2 = watch(500)
    await kind("All")
    const back = await w2
    console.log("  back to All (kept):", JSON.stringify(back))
    expect(back.changedAt !== null && back.changedAt < 350 && back.changedAt * 2.5 < slow.changedAt && back.texts[back.texts.length - 1] === all, "switching back is answered from memory: no request, the time is the page drawing it", back.changedAt)
    expect(back.minOpacity > 0.99, "with no dim and no flash", back.minOpacity)

    /* A late answer never wins: Physical asked on a 1200ms server (never asked before), then Digital from memory at once. */
    const digital = await (async () => { await kind("Digital"); await sleep(300); return revenue() })()
    await p.evaluate(() => { window.__delay = 1200 })
    await kind("Physical")
    await sleep(80)
    await p.evaluate(() => { window.__delay = 100 })
    await kind("Digital")
    await sleep(1600)
    const after = await revenue()
    console.log("  stale:", JSON.stringify({ digital, after }))
    expect(after === digital, "the older question's late answer does not replace the newer one", { digital, after })
    await kind("All")
    await sleep(400)

    if (!phone) {
      /* Read ahead: a pointer resting on Physical (its late answer above was dropped, not kept), then the tap. */
      await p.evaluate(() => { window.__delay = 400 })
      const box = await p.evaluate(() => { const b = [...document.querySelectorAll("[data-segmented-pills='filter'] [role=tab]")].find((b) => b.textContent.trim() === "Physical").getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } })
      await p.mouse.move(box.x, box.y)
      await sleep(700)
      const before = await p.evaluate(() => window.__fetches.length)
      const w3 = watch(1200)
      await p.mouse.click(box.x, box.y)
      const ahead = await w3
      ahead.asked = await p.evaluate((n) => window.__fetches.slice(n).some((f) => f.url.includes("/api/analytics/reports")), before)
      console.log("  Physical after a hover:", JSON.stringify(ahead))
      expect(ahead.changedAt !== null && ahead.changedAt < 350 && !ahead.asked, "read ahead on hover: the tap is answered from memory", ahead.changedAt)
      await kind("All")
      await sleep(400)
    }

    expect(errors.length === 0, "no errors", errors.slice(0, 3))
    await ctx.close()
  }
} finally {
  await browser?.close()
  server?.close()
}
if (broken) { console.log(`\n${broken} expectation(s) not met`); process.exit(1) }
