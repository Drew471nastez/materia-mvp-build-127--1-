/**
 * ===========================================================================
 *  ANALYTICS' FILTERS AS THE EMAILS TOOLBAR'S CHIPS, AT 390 AND 1440
 * ===========================================================================
 * Round 42, the owner: All / Digital / Physical / Communities as ONE filter
 * chip like Emails' "Status ▾" and "Source ▾", in one row with the period,
 * the place and the product. Mounts the real AnalyticsClient
 * (scripts/render-analytics-tabs.tsx, physical commerce on, so the type
 * chip has all four) and measures:
 *
 *   row     every chip's top (one row), the page's sideways scroll, Export
 *           whole on screen
 *   chips   each chip's height, corners, border style, words' size, fill:
 *           dashed and clear at a default, solid and filled once set (the
 *           period always), against Emails' own chip (28px, 8px, 12px)
 *   type    "All types", opened: a popover on a computer, the sheet on a
 *           phone, four rows, All checked; Digital picked: the chip says
 *           Digital, filled, and the list is gone
 *
 *   SHOTS=<dir> node scripts/check-analytics-filter-chips.mjs
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
  const bundle = join(dir, "filter-chips-probe.js")
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
  const shots = process.env.SHOTS || ""
  if (shots) mkdirSync(shots, { recursive: true })

  for (const width of [390, 1440]) {
    const phone = width < 640
    console.log(`\n${width}px`)
    const p = await browser.newPage()
    await p.setViewport(phone ? { width, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width, height: 900 })
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e.message || e)))
    await p.goto(`${origin}/?delay=150&physical=1`, { waitUntil: "load" })
    await p.waitForSelector("[data-analytics-controls] [data-kind-picker]", { timeout: 15000 }).catch(async (e) => { console.log("errors:", errors, await p.evaluate(() => (document.querySelector("[data-analytics-controls]")?.outerHTML ?? document.body.innerHTML).slice(0, 1500))); throw e })
    await sleep(1200)

    const measure = () => p.evaluate(() => {
      const row = document.querySelector("[data-analytics-controls]")
      const chips = [...row.querySelectorAll("button[aria-haspopup=dialog]")]
      return {
        filterChips: row.hasAttribute("data-filter-chips"),
        pageScrollX: document.documentElement.scrollWidth - innerWidth,
        chips: chips.map((c) => {
          const r = c.getBoundingClientRect()
          const s = getComputedStyle(c)
          return { words: (c.textContent || "").trim() || c.getAttribute("aria-label"), export: c.hasAttribute("data-analytics-export"), set: c.hasAttribute("data-filter-set"), top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), h: +r.height.toFixed(1), radius: s.borderTopLeftRadius, border: `${s.borderTopStyle} ${s.borderTopColor}`, font: s.fontSize, weight: s.fontWeight, bg: s.backgroundColor, color: s.color, chevron: !!c.querySelector("svg") }
        }),
      }
    })
    const m = await measure()
    for (const c of m.chips) console.log("  chip:", JSON.stringify(c))
    const filters = m.chips.filter((c) => !c.export)
    const exp = m.chips.find((c) => c.export)
    expect(m.filterChips, "the analytics row is drawn as filter chips")
    expect(new Set(m.chips.map((c) => c.top)).size === 1, "the period, place, product, type and Export are one row", m.chips.map((c) => c.top))
    expect(m.pageScrollX <= 0, "the page never scrolls sideways", m.pageScrollX)
    expect(!!exp && exp.right <= width && exp.h === 28, "Export is whole on screen, the chips' height", exp)
    expect(filters.length === 4 && filters.every((c) => c.h === 28 && c.radius === "8px" && c.font === "12px" && c.chevron), "every filter is Emails' chip: 28px tall, 8px corners, 12px words, a chevron", filters.map((c) => [c.words, c.h, c.radius, c.font]))
    const unset = filters.filter((c) => !c.set)
    const set = filters.filter((c) => c.set)
    expect(unset.length === 3 && unset.every((c) => c.border.startsWith("dashed rgb(201, 204, 211)") && c.bg === "rgba(0, 0, 0, 0)"), "All pages, All products and All types: dashed, clear", unset.map((c) => [c.words, c.border, c.bg]))
    expect(set.length === 1 && /days|month|week|year|Today|time/i.test(set[0].words) && set[0].border.startsWith("solid") && set[0].bg === "rgb(236, 238, 241)", "the period is set: solid and filled", set.map((c) => [c.words, c.border, c.bg]))
    const type = filters.find((c) => c.words === "All types")
    expect(!!type, "the type is one chip that says All types", filters.map((c) => c.words))
    if (shots) await p.screenshot({ path: join(shots, `filters-${width}.png`), clip: { x: 0, y: 0, width, height: phone ? 220 : 200 } })

    /* Opened: a popover on a computer, the shared sheet on a phone. */
    await p.evaluate(() => { const b = document.querySelector("[data-kind-picker]"); b.scrollIntoView({ inline: "nearest", block: "nearest" }); b.click() })
    await sleep(700)
    const list = await p.evaluate(() => {
      const el = [...document.querySelectorAll("[data-kind-list]")].pop()
      if (!el) return null
      const holder = el.closest("[data-radix-popper-content-wrapper], [role=dialog]") || el
      const r = holder.getBoundingClientRect()
      return { rows: [...el.querySelectorAll("[data-row]")].map((b) => (b.textContent || "").trim()), checked: [...el.querySelectorAll("[data-row][data-checked]")].map((b) => (b.textContent || "").trim()), popover: !!el.closest("[data-radix-popper-content-wrapper]") || el.hasAttribute("data-radix-popper-content-wrapper") || !!el.closest("[data-side]"), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), inScroller: !!el.closest("[data-analytics-pickers]") }
    })
    console.log("  list:", JSON.stringify(list))
    expect(!!list && list.rows.join("|") === "All types|Digital|Physical|Communities" && list.checked.join() === "All types", "four rows, All types checked", list)
    expect(!!list && !list.inScroller && list.left >= -1 && list.right <= width + 1, "outside the scroller, whole on screen", list)
    expect(!!list && (phone ? !list.popover && list.bottom >= 800 : list.popover && list.top > 0 && list.top < 220), phone ? "a sheet from the bottom on a phone" : "a popover under the chip on a computer", list)
    if (shots) await p.screenshot({ path: join(shots, `type-open-${width}.png`) })
    await p.evaluate(() => [...document.querySelectorAll("[data-kind-list] [data-row]")].pop().closest("[data-kind-list]").querySelector('[data-row="digital"]').click())
    await sleep(900)
    const after = await measure()
    const picked = after.chips.find((c) => c.words === "Digital")
    const gone = await p.evaluate(() => [...document.querySelectorAll("[data-kind-list]")].filter((el) => el.getBoundingClientRect().height > 0).length)
    expect(!!picked && picked.set && picked.border.startsWith("solid") && picked.bg === "rgb(236, 238, 241)", "Digital picked: the chip says Digital, solid and filled", picked)
    expect(gone === 0, "and the list closed", gone)
    expect(new Set(after.chips.map((c) => c.top)).size === 1 && after.pageScrollX <= 0, "still one row, nothing sideways", after.chips.map((c) => c.top))
    expect(/kind=digital/.test(await p.evaluate(() => location.search)), "?kind=digital in the address")
    if (shots) await p.screenshot({ path: join(shots, `type-digital-${width}.png`), clip: { x: 0, y: 0, width, height: phone ? 220 : 200 } })

    /* An opened report: each row's own line, asked when it opens (app/api/analytics/rows), drawn beside the row's number. */
    await p.evaluate(() => { const b = document.querySelector('[data-view-report="pages"]'); b.scrollIntoView({ block: "center" }); b.click() })
    await sleep(1500)
    const d = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-report-detail] [data-detail-row]')]
      const asked = (window.__fetches || []).filter((f) => f.url.includes("/api/analytics/rows")).map((f) => new URL(f.url, location.href).searchParams.get("dim"))
      return {
        asked,
        rows: rows.length,
        drawn: rows.filter((r) => r.querySelector('[data-row-line=""] polyline')).length,
        cell: (() => { const c = rows[0]?.querySelector("[data-detail-line]"); const svg = c?.querySelector("svg"); const name = rows[0]?.querySelector("td"); return c && svg ? { state: c.getAttribute("data-detail-line"), w: Math.round(svg.getBoundingClientRect().width), h: Math.round(svg.getBoundingClientRect().height), nameW: Math.round(name.getBoundingClientRect().width) } : null })(),
        pageScrollX: document.documentElement.scrollWidth - innerWidth,
      }
    })
    console.log("  drill-down:", JSON.stringify(d))
    expect(d.asked.length === 1 && d.asked[0] === "page", "opening Top pages asks for the pages' lines once, and the page asked for none before", d.asked)
    expect(d.rows > 3 && d.drawn === d.rows && d.cell?.state === "ready", "every page row draws its own line", { rows: d.rows, drawn: d.drawn })
    expect(!!d.cell && d.cell.w === (phone ? 48 : 64) && d.cell.h === 20 && d.cell.nameW >= (phone ? 120 : 250), "the line is 64 by 20 (48 on a phone), the name keeps its room", d.cell)
    if (shots) await p.screenshot({ path: join(shots, `drill-pages-${width}.png`) })
    await p.keyboard.press("Escape")
    await sleep(500)
    expect(errors.length === 0, "no errors", errors.slice(0, 3))
    await p.close()
  }
} finally {
  await browser?.close()
  server?.close()
}
if (broken) { console.log(`\n${broken} expectation(s) not met`); process.exit(1) }
console.log("\nall met")
