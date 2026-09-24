/**
 * ===========================================================================
 *  THE WEBSITE PAGE'S PERFORMANCE BAR AND ITS MORE MENU, MEASURED
 * ===========================================================================
 * Renders the real Website page client in Chromium with the app's own CSS,
 * hands the bar its numbers as a promise (the way the server streams them),
 * and checks with numbers what the owner asked for:
 *
 *   at 1280 and at 390 the page never scrolls sideways
 *   on a phone the bar scrolls inside itself, and keeps its 16px gutters
 *   every cell is the same height, and the loading state is the same shape
 *   the More menu is a popover anchored to its button on a computer, in
 *     groups with hairlines, destructive last, opening in 150ms
 *   on a phone it is the shared sheet, with rows a thumb can hit
 *   a speed cell opens its definition and the phone/computer split
 *
 * and writes screenshots of each state to look at.
 *
 * CSS: the production build's, if there is one; otherwise a running dev
 * server's (DEV_URL, default http://localhost:3104).
 *
 *   node scripts/check-website-strip.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const DEV_URL = process.env.DEV_URL || "http://localhost:3104"
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

async function appCss() {
  const dir = join(root, ".next/static/chunks")
  if (!process.env.DEV_URL && existsSync(dir)) {
    const files = readdirSync(dir).filter((f) => f.endsWith(".css"))
    if (files.length) return files.map((f) => readFileSync(join(dir, f), "utf8")).join("\n")
  }
  const html = await (await fetch(`${DEV_URL}/login`)).text()
  const hrefs = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1])
  if (!hrefs.length) fail(`No stylesheet found at ${DEV_URL}/login. Start the dev server or run a build.`)
  const parts = await Promise.all(hrefs.map(async (h) => (await fetch(new URL(h, DEV_URL))).text()))
  return parts.join("\n")
}
const css = await appCss()

const out = mkdtempSync(join(tmpdir(), "storelib-strip-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
const stubs = join(root, ".strip-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/app/website-builder"
export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {}, back() {} })
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
writeFileSync(join(stubs, "toast.js"), `export const useToast = () => ({ toast() {} })
`)
writeFileSync(join(stubs, "navbar.js"), `export const startNavigationLoading = () => {}
export const NavigationLoadingBar = () => null
`)
writeFileSync(join(stubs, "browser.tsx"), `import React from "react"
import { createRoot } from "react-dom/client"
import { App } from "${join(root, "scripts/render-website-strip-probe.tsx")}"
window.__errors = []
const origError = console.error
console.error = (...a) => { window.__errors.push(a.map(String).join(" ")); origError(...a) }
createRoot(document.getElementById("app")).render(React.createElement(App))
`)
try {
  execFileSync(
    "npx",
    [
      "esbuild", join(stubs, "browser.tsx"), "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
      `--alias:next/link=${join(stubs, "link.jsx")}`,
      `--alias:next/navigation=${join(stubs, "navigation.js")}`,
      `--alias:@/hooks/use-toast=${join(stubs, "toast.js")}`,
      `--alias:@/components/app/navigation-loading-bar=${join(stubs, "navbar.js")}`,
      `--alias:@=${root}`,
      "--loader:.css=empty", "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--log-level=error",
    ],
    { cwd: root, stdio: "inherit" },
  )
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
const bundle = readFileSync(join(out, "probe.js"))
const html =
  `<!doctype html><html class="light app-layout"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${css}</style><style>html,body{margin:0;height:100%}#app{height:100%}</style></head><body>` +
  `<div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script src="/probe.js"></script></body></html>`

const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(bundle)
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })

async function open(viewport, query = "", touch = false) {
  const p = await browser.newPage()
  await p.setViewport({ ...viewport, hasTouch: touch, isMobile: touch })
  await p.goto(`${origin}/app/website-builder${query}`, { waitUntil: "load" })
  await sleep(700)
  return p
}

const measureBar = (p) =>
  p.evaluate(() => {
    const bar = document.querySelector("[data-website-strip]") ?? document.querySelector(".space-y-3 > div")
    const row = bar?.firstElementChild
    const r = bar?.getBoundingClientRect()
    const cells = row ? [...row.children].map((c) => Math.round(c.getBoundingClientRect().height)) : []
    return {
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      innerOverflow: document.querySelector(".page-scroll") ? document.querySelector(".page-scroll").scrollWidth - document.querySelector(".page-scroll").clientWidth : 0,
      left: Math.round(r?.left ?? -1),
      right: Math.round(window.innerWidth - (r?.right ?? 0)),
      height: Math.round(r?.height ?? 0),
      rowScroll: row ? row.scrollWidth - row.clientWidth : -1,
      cells,
      errors: window.__errors ?? [],
    }
  })

for (const vp of [
  { name: "laptop", width: 1280, height: 900, touch: false },
  { name: "phone", width: 390, height: 844, touch: true },
]) {
  console.log(`\n  ${vp.name} ${vp.width}px`)
  const p = await open(vp, "", vp.touch)
  const m = await measureBar(p)
  expect(m.pageOverflow <= 0 && m.innerOverflow <= 0, "the page does not scroll sideways", { page: m.pageOverflow, scroller: m.innerOverflow })
  expect(m.left >= 16 && m.right >= 16 && Math.abs(m.left - m.right) <= 1, "the bar sits on the page's gutters", { left: m.left, right: m.right })
  expect(m.cells.length === 7, "seven cells: the period, three traffic, three speed", m.cells.length)
  expect(new Set(m.cells).size === 1, "every cell is the same height", m.cells)
  if (vp.name === "phone") expect(m.rowScroll > 0, "the cells scroll sideways inside the bar", `${m.rowScroll}px more than it shows`)
  else expect(m.rowScroll <= 0, "on a laptop every cell fits without scrolling", m.rowScroll)
  const texts = await p.evaluate(() => [...document.querySelectorAll("[data-cell]")].map((c) => c.innerText.replace(/\s+/g, " ").trim()))
  console.log("        cells:", JSON.stringify(texts))
  expect(texts.some((t) => /2,932/.test(t)) && texts.some((t) => /Needs improvement/.test(t)) && texts.some((t) => /Good/.test(t)) && texts.some((t) => /Poor/.test(t)),
    "the numbers and all three verdicts are drawn")
  expect(m.errors.length === 0, "no errors in the console", m.errors.slice(0, 2))
  await p.screenshot({ path: join(shots, `${vp.name}-page.png`), clip: { x: 0, y: 0, width: vp.width, height: Math.min(900, vp.height) } })

  // The loading state is the bar's shape.
  const l = await open(vp, "?loading=1", vp.touch)
  await l.evaluate(() => document.querySelectorAll(".skeleton-deferred").forEach((e) => (e.style.animation = "none", e.style.opacity = "1")))
  const lm = await l.evaluate(() => {
    const bar = document.querySelector(".space-y-3 > div")
    const row = bar
    return { height: Math.round(bar.getBoundingClientRect().height), cells: row.children.length, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }
  })
  expect(lm.cells === 7 && Math.abs(lm.height - m.height) <= 2, "the loading state draws the same bar: same cells, same height", { loading: lm, page: m.height })
  await l.close()

  // The More menu.
  const more = await p.evaluateHandle(() => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "More"))
  await p.evaluate((b) => b.scrollIntoView({ block: "center" }), more)
  await sleep(200)
  if (vp.touch) await more.tap()
  else await more.click()
  await sleep(vp.touch ? 600 : 60)
  if (!vp.touch) {
    const mid = await p.evaluate(() => {
      const list = document.querySelector("[data-action-list]")
      return list ? { opacity: Number(getComputedStyle(list).opacity), anim: getComputedStyle(list).animationName, duration: getComputedStyle(list).animationDuration } : null
    })
    expect(!!mid && mid.anim === "action-list-in" && mid.duration === "0.15s", "the menu opens with a 150ms animation", mid)
    await sleep(300)
    const menu = await p.evaluate(() => {
      const list = document.querySelector("[data-action-list]")
      const btn = [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "More")
      const lr = list.getBoundingClientRect()
      const br = btn.getBoundingClientRect()
      const rows = [...list.querySelectorAll("[role=menuitem]")]
      return {
        gap: Math.round(lr.top - br.bottom),
        rightAligned: Math.round(lr.right - br.right),
        groups: list.querySelectorAll("[role=group]").length,
        separators: list.querySelectorAll("[role=separator]").length,
        title: list.querySelector("[role=group] > div:not([role])")?.textContent ?? list.querySelector("[role=group]")?.firstElementChild?.textContent,
        rows: rows.map((r) => r.textContent.trim()),
        rowHeight: Math.round(rows[0].getBoundingClientRect().height),
        last: rows.at(-1).textContent.trim(),
        lastColor: getComputedStyle(rows.at(-1)).color,
      }
    })
    console.log("        menu:", JSON.stringify(menu.rows))
    expect(menu.gap >= 4 && menu.gap <= 8 && Math.abs(menu.rightAligned) <= 1, "a popover anchored under the button, aligned to its end", { gap: menu.gap, end: menu.rightAligned })
    expect(menu.groups === 3 && menu.separators === 2, "three groups with a hairline between each", { groups: menu.groups, separators: menu.separators })
    expect(["Pages", "Domain", "SEO", "Publishing", "Settings"].every((r) => menu.rows.includes(r)), "the old tab destinations are in it")
    expect(menu.last === "Take offline", "the action that takes the site down is last", menu.last)
    await p.screenshot({ path: join(shots, `${vp.name}-more.png`) })
    await p.keyboard.press("Escape")
    await sleep(60)
    const closing = await p.evaluate(() => {
      const list = document.querySelector("[data-action-list]")
      return list ? getComputedStyle(list).animationName + " " + getComputedStyle(list).animationDuration : "gone"
    })
    expect(closing === "action-list-out 0.15s", "it closes with a 150ms animation, not a cut", closing)
    await sleep(300)
    expect(await p.evaluate(() => !document.querySelector("[data-action-list]")), "and is gone after it")
  } else {
    const sheet = await p.evaluate(() => {
      const s = document.querySelector("[data-app-sheet] [data-action-sheet]")
      if (!s) return null
      const rows = [...s.querySelectorAll("button, a")]
      const panel = document.querySelector("[data-sheet-panel]").getBoundingClientRect()
      return {
        rows: rows.map((r) => r.textContent.trim()),
        minHeight: Math.min(...rows.map((r) => r.getBoundingClientRect().height)),
        bottom: Math.round(window.innerHeight - panel.bottom),
        fits: panel.height < window.innerHeight,
        rules: s.querySelectorAll('[aria-hidden].h-px').length,
      }
    })
    expect(!!sheet, "on a phone it is the shared sheet")
    if (sheet) {
      console.log("        sheet:", JSON.stringify(sheet.rows))
      expect(sheet.minHeight >= 52, "every row is at least 52px tall", sheet.minHeight)
      expect(sheet.rules === 2, "the same three groups", sheet.rules)
      expect(sheet.bottom === 0 && sheet.fits, "resting on the bottom edge, as tall as its rows", sheet)
    }
    await p.screenshot({ path: join(shots, `${vp.name}-more.png`) })
    await p.evaluate(() => document.querySelector("[data-app-sheet] > div")?.click())
    await sleep(500)
  }

  // A speed cell opens its detail.
  const lcp = await p.evaluateHandle(() => document.querySelector('[data-cell="lcp"] button'))
  await p.evaluate((b) => b.scrollIntoView({ block: "center", inline: "center" }), lcp)
  await sleep(150)
  if (vp.touch) await lcp.tap()
  else await lcp.click()
  await sleep(600)
  const detail = await p.evaluate(() => {
    const d = document.querySelector("[data-vital-detail]")
    return d ? { text: d.innerText.replace(/\s+/g, " "), active: document.querySelector('[data-cell="lcp"]').hasAttribute("data-active"), sheet: !!d.closest("[data-app-sheet]") } : null
  })
  expect(!!detail && /Phones/.test(detail.text) && /Computers/.test(detail.text) && /Good at 2.5 s or less/.test(detail.text), "the LCP cell opens its definition and the phone and computer split", detail?.text.slice(0, 90))
  expect(!!detail && detail.active, "the open cell carries the violet rule")
  expect(!!detail && detail.sheet === vp.touch, vp.touch ? "in the shared sheet on a phone" : "in a popover on a laptop")
  await p.screenshot({ path: join(shots, `${vp.name}-lcp.png`) })
  await p.close()
}

for (const state of ["few", "collecting"]) {
  const p = await open({ width: 1280, height: 900 }, `?state=${state}`)
  const texts = await p.evaluate(() => [...document.querySelectorAll("[data-cell]")].map((c) => c.innerText.replace(/\s+/g, " ").trim()))
  console.log(`\n  ${state}:`, JSON.stringify(texts))
  if (state === "few") expect(texts.filter((t) => /Too few visits/.test(t)).length === 3 && texts.some((t) => /12 of 20/.test(t)), "too few page loads says so, with how many")
  else expect(texts.filter((t) => /Collecting data/.test(t)).length === 3 && texts.filter((t) => /Not available/.test(t)).length === 2, "no table yet: collecting data, and a read that failed is not a zero")
  await p.screenshot({ path: join(shots, `laptop-${state}.png`), clip: { x: 0, y: 0, width: 1280, height: 420 } })
  await p.close()
}

await browser.close()
server.close()
console.log(`\n  screenshots: ${shots}`)
console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
process.exit(broken ? 1 : 0)
