/**
 * ===========================================================================
 *  THE SCROLLBAR DOES NOT MOVE WHEN AN /app PAGE SWAPS, AT 1440 AND 1920
 * ===========================================================================
 * "Each time I switch between pages in /app on desktop large screens, the
 * scrollbar on the right side of the screen is bumping." And: "when I go back
 * to a page, the scrollbar is pumping on the right, glitching, flashing, and
 * then disappears."
 *
 * A classic scrollbar (a Mac with a mouse, Windows, Linux) takes a column of
 * layout, so every frame in which one appears or goes moves the page beside
 * it. This runs with REAL scrollbars: no `--hide-scrollbars`, which puppeteer
 * adds by default and which makes every number here zero.
 *
 * The real AppStage and top bar over a shell shaped like app/app/layout.tsx
 * (scripts/render-scrollbar-stable.tsx), with pages that scroll the way the
 * real ones do: some in the shell's scroller, some in a box of their own, one
 * that fits with 2px to spare, and the product editor. Between them, both
 * ways, and Back, reading every animation frame:
 *
 *   THE COLUMN STAYS PUT    [data-content]'s left edge and width are the
 *                           same in every frame, on every page
 *   THE GUTTER STAYS PUT    the width taken by scrollbars (the shell's
 *                           scroller plus the page's own) is the same in every
 *                           frame, on every page, and so is where it starts
 *   NO FLASH                within one navigation the set of scrollbars
 *                           showing changes at most once (old page to new),
 *                           never there and gone again
 *   NOTHING ELSE SCROLLS    <html> never takes a scrollbar, nothing is wider
 *                           than the window, the document never scrolls
 *   BACK                    the page is where it was on its first frame
 *
 *   node scripts/check-scrollbar-stable.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".scrollbar-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `import { useSyncExternalStore } from "react"
const subs = new Set()
let href = location.pathname + location.search
globalThis.__commit = (next) => { href = next; for (const f of [...subs]) f() }
const sub = (f) => { subs.add(f); return () => subs.delete(f) }
const read = () => href
export const usePathname = () => useSyncExternalStore(sub, () => read().split("?")[0], () => "/app")
export const useSearchParams = () => new URLSearchParams(useSyncExternalStore(sub, () => read().split("?")[1] || "", () => ""))
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() { history.back() } })
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(dir, "link.js"), `import { createElement } from "react"
export default function Link({ href, prefetch, replace, scroll, ...rest }) { return createElement("a", { href, ...rest }) }
`)
try {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-scrollbar-stable.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"', `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.js")}`,
    `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

const server = createServer((_, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(html) })
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

/* Real, classic scrollbars: puppeteer hides them unless told not to. */
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] })
const problems = []
const report = {}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

for (const [label, viewport] of [
  ["1440", { width: 1440, height: 900, deviceScaleFactor: 1 }],
  ["1920", { width: 1920, height: 1080, deviceScaleFactor: 1 }],
]) {
  const page = await browser.newPage()
  await page.setViewport(viewport)
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.goto(`${base}/app/sites`)
  await page.waitForSelector("[data-page]")
  await wait(400)
  await page.evaluate(() => {
    window.__rec = []
    const tick = (t) => {
      const outer = document.querySelector(".app-content-scroll")
      const pageEl = document.querySelector("[data-page]")
      const column = document.querySelector("[data-content], [data-editor-column]")
      /* Every scroll container from the column up to and including the shell's. */
      const chain = []
      for (let el = column?.parentElement; el; el = el.parentElement) {
        const cs = getComputedStyle(el)
        if (/(auto|scroll|hidden)/.test(cs.overflowY)) {
          const bl = parseFloat(cs.borderLeftWidth) || 0, br = parseFloat(cs.borderRightWidth) || 0
          chain.push({
            who: el === outer ? "shell" : "page",
            gutter: el.offsetWidth - el.clientWidth - bl - br,
            /* A scrollbar is painted when the box scrolls and has somewhere to go. */
            bar: /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight && el.offsetWidth - el.clientWidth - bl - br > 0,
            end: Math.round((el.getBoundingClientRect().left + el.clientLeft + el.clientWidth) * 10) / 10,
          })
        }
        if (el === outer) break
      }
      const cr = column?.getBoundingClientRect()
      const de = document.documentElement
      window.__rec.push({
        t,
        page: pageEl?.getAttribute("data-page") ?? null,
        editor: !!column?.hasAttribute("data-editor-column"),
        left: cr ? Math.round(cr.left * 10) / 10 : null,
        width: cr ? Math.round(cr.width * 10) / 10 : null,
        gutter: chain.reduce((s, c) => s + c.gutter, 0),
        gutterStart: chain.length ? Math.min(...chain.map((c) => c.end)) : null,
        bars: chain.filter((c) => c.bar).map((c) => c.who).sort().join("+") || "none",
        htmlGutter: innerWidth - de.clientWidth,
        wide: Math.max(de.scrollWidth, document.body.scrollWidth) > innerWidth,
        docScroll: window.scrollY + de.scrollTop + document.body.scrollTop,
        shellTop: outer ? outer.scrollTop : null,
        pageTop: pageEl && pageEl.scrollHeight > pageEl.clientHeight ? pageEl.scrollTop : (document.querySelector(".orders-stage > .orders-pane")?.scrollTop ?? null),
      })
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const now = () => page.evaluate(() => performance.now())
  const since = (t0) => page.evaluate((t0) => window.__rec.filter((r) => r.t >= t0), t0)

  const navs = []
  async function step(name, act, delay = 80, settle = 480) {
    await page.evaluate((d) => { window.__delay = d }, delay)
    const t0 = await now()
    await page.evaluate(act)
    await wait(delay + settle)
    const rec = await since(t0)
    navs.push({ name: `${String(navs.length + 1).padStart(2, "0")} ${name}`, rec })
    return rec
  }
  const go = (to, delay) => step(`to ${to}`, `document.querySelector('a[data-to="${to}"]').click()`, delay)
  const back = (name) => step(name, "history.back()")

  await go("/app/settings")
  await page.evaluate(() => { document.querySelector(".app-content-scroll").scrollTop = 600 })
  await wait(100)
  await go("/app/sites")
  const backToSettings = await back("back to /app/settings")
  await back("back to /app/sites")
  await go("/app/fits")
  await go("/app/products")
  await page.evaluate(() => { document.querySelector("[data-page]").scrollTop = 500 })
  await wait(100)
  await go("/app/coupons")
  const backToProducts = await back("back to /app/products")
  await go("/app")
  await go("/app/orders")
  await go("/app/settings")
  await go("/app/products")
  await go("/app/fits")
  await go("/app/sites")
  /* Slow: the bar at 300ms, the spinner's surface at 1000ms. */
  await go("/app/settings", 1300)
  await go("/app/products/x")
  await back("back from the editor")
  await go("/app/coupons")
  await go("/app/products/x")
  await go("/app/sites")

  const all = navs.flatMap((n) => n.rec)
  /* The reference: the first frame of the probe, a short page the shell scrolls. */
  const columns = all.filter((r) => r.left != null && !r.editor)
  const ref = columns[0]
  const gutterRef = all[0].gutter
  const startRef = all[0].gutterStart
  const summary = {}
  for (const n of navs) {
    const states = []
    for (const r of n.rec) if (states[states.length - 1] !== r.bars) states.push(r.bars)
    const cols = n.rec.filter((r) => r.left != null && !r.editor)
    const editorCols = n.rec.filter((r) => r.editor)
    const moved = cols.filter((r) => r.left !== ref.left || r.width !== ref.width)
    const gutterOff = n.rec.filter((r) => r.gutter !== gutterRef || r.gutterStart !== startRef)
    summary[n.name] = {
      frames: n.rec.length,
      columnMovedFrames: moved.length,
      ...(moved.length ? { columnSeen: [...new Set(moved.map((r) => `${r.page}:${r.left}/${r.width}`))].slice(0, 4) } : {}),
      gutterChangedFrames: gutterOff.length,
      gutters: [...new Set(n.rec.map((r) => r.gutter))],
      scrollbars: states.join(" > "),
      ...(editorCols.length ? { editorColumn: [...new Set(editorCols.map((r) => `${r.left}/${r.width}`))] } : {}),
    }
    const at = `${label} ${n.name}:`
    if (moved.length) problems.push(`${at} the column moved in ${moved.length} of ${n.rec.length} frames (${summary[n.name].columnSeen.join(", ")}; it is ${ref.left}/${ref.width})`)
    if (gutterOff.length) problems.push(`${at} the scrollbar gutter changed in ${gutterOff.length} of ${n.rec.length} frames (${[...new Set(gutterOff.map((r) => `${r.page}:${r.gutter}px@${r.gutterStart}`))].slice(0, 4).join(", ")}; it is ${gutterRef}px from ${startRef})`)
    if (states.length > 2) problems.push(`${at} the scrollbars flashed: ${states.join(" > ")}`)
    if (editorCols.length && new Set(editorCols.map((r) => `${r.left}/${r.width}`)).size > 1) problems.push(`${at} the editor's column moved: ${summary[n.name].editorColumn.join(", ")}`)
  }
  const htmlBars = all.filter((r) => r.htmlGutter !== 0).length
  const wide = all.filter((r) => r.wide).length
  const docScrolled = all.filter((r) => r.docScroll !== 0).length
  if (htmlBars) problems.push(`${label}: <html> took a scrollbar in ${htmlBars} frames`)
  if (wide) problems.push(`${label}: something was wider than the window in ${wide} frames`)
  if (docScrolled) problems.push(`${label}: the document scrolled in ${docScrolled} frames`)
  const firstOf = (rec, id) => rec.find((r) => r.page === id)
  const settingsBack = firstOf(backToSettings, "settings")
  const productsBack = firstOf(backToProducts, "products")
  if (settingsBack?.shellTop !== 600) problems.push(`${label}: Back to Settings showed its first frame at ${settingsBack?.shellTop}, not 600`)
  if (productsBack?.pageTop !== 500) problems.push(`${label}: Back to Products showed its first frame at ${productsBack?.pageTop}, not 500`)
  if (errors.length) problems.push(`${label}: the page threw: ${errors[0]}`)
  report[label] = {
    column: `${ref.left}/${ref.width}`,
    gutter: `${gutterRef}px from x=${startRef}`,
    frames: all.length,
    columnMovedFrames: Object.values(summary).reduce((s, n) => s + n.columnMovedFrames, 0),
    gutterChangedFrames: Object.values(summary).reduce((s, n) => s + n.gutterChangedFrames, 0),
    flashes: Object.values(summary).filter((n) => n.scrollbars.split(" > ").length > 2).length,
    htmlScrollbarFrames: htmlBars,
    widerThanWindowFrames: wide,
    backFirstFrame: { settings: settingsBack?.shellTop, products: productsBack?.pageTop },
    navigations: summary,
  }
  await page.close()
}

await browser.close()
server.close()
console.log(JSON.stringify(report, null, 1))
if (problems.length) fail(problems.join("\n"))
console.log("ok: at 1440 and 1920 with classic scrollbars, the column and the scrollbar gutter never move while pages swap, both ways and on Back, and no scrollbar flashes")
