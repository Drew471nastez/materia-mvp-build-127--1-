/**
 * ===========================================================================
 *  THE PLANS PAGE IS A PAGE: MEASURED AT 390, 1440 AND 1920
 * ===========================================================================
 * "Make sure the upgrade page behaves like a real full page, its own page
 * rather than awkwardly inserted into Settings. The Back button must work
 * properly."
 *
 *   ITS OWN PAGE   the layer covers the whole window: the shell's header and
 *                  the nav pill are not painted or reachable anywhere on it
 *   ONE BAR        a Back at the top left, at least 44px tall, and no second
 *                  control that does the same thing
 *   BACK           with an /app page behind it, Back is router.back() and
 *                  nothing is pushed; without one, it is a link to the
 *                  Billing tab
 *   THE MARK       the Storelib logo in the bar is 28 by 28 at every width,
 *                  square, and cannot be squeezed (it was drawn 28 by 24)
 *   A PULL         what an iOS pull past the top shows above the bar is the
 *                  bar's own white, and past the bottom the page's grey. The
 *                  pull is reproduced the way WebKit draws it: the page moves
 *                  and the scroller's own background shows in the gap. The
 *                  pixel there is read from a real screenshot, and the same
 *                  pull with the old one colour background is read beside it
 *   THE CARDS      one column on a phone, each the width of the page less
 *                  its gutters; three in a row from 1440, top aligned and the
 *                  same height; never wider than 1080px, centred; nothing
 *                  wider than the window
 *
 * Writes a picture at each width to $UPGRADE_SHOTS when it is set.
 *
 *   node scripts/check-upgrade-page.mjs
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

const dir = join(root, ".upgrade-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/app/settings/billing/upgrade"
export const useSearchParams = () => new URLSearchParams()
export const useRouter = () => ({ push(h) { (window.__pushed = window.__pushed || []).push(h) }, replace() {}, prefetch() {}, refresh() {}, back() { window.__back = (window.__back || 0) + 1 } })
export const redirect = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, onClick, prefetch, ...rest }) {
  return React.createElement("a", { href, ...rest, onClick: (e) => { onClick && onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__pushed = window.__pushed || []).push(href) } } }, children)
}
`)
try {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-upgrade-page.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })
const server = createServer((_, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(html) })
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const problems = []
const report = {}
for (const [label, viewport] of [
  ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["1440", { width: 1440, height: 900, deviceScaleFactor: 1 }],
  ["1920", { width: 1920, height: 1080, deviceScaleFactor: 1 }],
]) {
  const page = await browser.newPage()
  await page.setViewport(viewport)
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  const read = () => page.evaluate(() => {
    const layer = document.querySelector("[data-page-layer]").getBoundingClientRect()
    const back = document.querySelector("[data-upgrade-back]").getBoundingClientRect()
    const grid = document.querySelector("[data-plan-cards]").getBoundingClientRect()
    const cards = [...document.querySelectorAll("[data-plan-card]")].map((c) => { const r = c.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } })
    const W = innerWidth, H = innerHeight
    const hit = (x, y) => document.elementFromPoint(x, y)
    const pill = document.querySelector("[data-pill-tab]")
    const pr = pill.getBoundingClientRect()
    const pillHit = pr.width ? hit(pr.x + pr.width / 2, pr.y + pr.height / 2) : null
    return {
      layer: { x: layer.x, y: layer.y, w: layer.width, h: layer.height, W, H },
      headerCovered: !hit(W / 2, 20)?.closest("[data-shell-header]"),
      pillVisible: getComputedStyle(pill).visibility === "visible",
      pillReachable: !!pillHit?.closest("[data-pill-tab]"),
      back: { x: Math.round(back.x), y: Math.round(back.y), h: Math.round(back.height) },
      controlsInBar: document.querySelectorAll("[data-upgrade-page] > div:first-child a, [data-upgrade-page] > div:first-child button").length,
      grid: { x: Math.round(grid.x), w: Math.round(grid.width) },
      cards,
      overflow: document.querySelector("[data-page-layer]").scrollWidth - document.querySelector("[data-page-layer]").clientWidth,
    }
  })
  /* Without history: Back is a link. */
  await page.goto(`${base}/`)
  await page.waitForSelector("[data-plan-card]")
  const m = await read()

  /* The mark: its box, whatever the image file does. */
  const logo = await page.evaluate(() => {
    const el = document.querySelector("[data-upgrade-logo]")
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return { w: r.width, h: r.height, shrink: cs.flexShrink, fit: cs.objectFit }
  })

  /* A pull, drawn as WebKit draws one, and the pixel it reveals. */
  const pixel = async (x, y) => {
    const shot = await page.screenshot({ encoding: "base64", clip: { x, y, width: 1, height: 1 } })
    return page.evaluate(async (src) => {
      const img = new Image()
      img.src = `data:image/png;base64,${src}`
      await img.decode()
      const c = document.createElement("canvas")
      c.width = c.height = 1
      const g = c.getContext("2d")
      g.drawImage(img, 0, 0)
      const [r, gr, b] = g.getImageData(0, 0, 1, 1).data
      return `rgb(${r}, ${gr}, ${b})`
    }, shot)
  }
  const pull = async (dy, oldBackground) => {
    await page.evaluate(({ dy, oldBackground }) => {
      const scroller = document.querySelector("[data-page-layer-scroll]")
      scroller.style.backgroundImage = oldBackground ? "none" : ""
      if (dy < 0) scroller.scrollTop = scroller.scrollHeight
      document.querySelector("[data-upgrade-page]").style.transform = `translateY(${dy}px)`
    }, { dy, oldBackground })
    const at = dy > 0 ? 40 : viewport.height - 40
    const colour = await pixel(Math.round(viewport.width / 2), at)
    await page.evaluate(() => {
      const scroller = document.querySelector("[data-page-layer-scroll]")
      scroller.style.backgroundImage = ""
      scroller.scrollTop = 0
      document.querySelector("[data-upgrade-page]").style.transform = ""
    })
    return colour
  }
  const bar = await page.evaluate(() => getComputedStyle(document.querySelector("[data-upgrade-bar]")).backgroundColor)
  const pulled = { top: await pull(120, false), bottom: await pull(-120, false), topBefore: await pull(120, true), bar }
  if (process.env.UPGRADE_SHOTS) await page.screenshot({ path: join(process.env.UPGRADE_SHOTS, `upgrade-${label}.png`), fullPage: false })
  await page.click("[data-upgrade-back]")
  const cold = await page.evaluate(() => ({ back: window.__back || 0, pushed: window.__pushed || [], answered: !!document.querySelector("[data-upgrade-back][data-leaving] .animate-spin") }))
  /* With an /app page behind it: Back is the browser's back. */
  await page.goto(`${base}/?history=1`)
  await page.waitForSelector("[data-plan-card]")
  await page.click("[data-upgrade-back]")
  const warm = await page.evaluate(() => ({ back: window.__back || 0, pushed: window.__pushed || [] }))
  await page.close()

  report[label] = { ...m, logo, pulled, backCold: cold, backWarm: warm, errors }
  const at = `at ${label}:`
  const W = viewport.width
  if (errors.length) problems.push(`${at} the page threw: ${errors[0]}`)
  if (m.layer.x !== 0 || m.layer.y !== 0 || m.layer.w !== m.layer.W || m.layer.h !== m.layer.H) problems.push(`${at} the page does not cover the window: ${JSON.stringify(m.layer)}`)
  if (!m.headerCovered) problems.push(`${at} the shell's header is showing over the page`)
  if (label === "390" && (m.pillVisible || m.pillReachable)) problems.push(`${at} the nav pill is showing or reachable over the plans page`)
  if (m.back.h < 44 || m.back.y > 16 || m.back.x > 24) problems.push(`${at} Back is not a full size control at the top left: ${JSON.stringify(m.back)}`)
  if (m.controlsInBar !== 1) problems.push(`${at} the bar has ${m.controlsInBar} controls, it should have only Back`)
  if (cold.back !== 0 || cold.pushed[0] !== "/app/settings?tab=billing") problems.push(`${at} with nothing behind it Back should link to the Billing tab: ${JSON.stringify(cold)}`)
  if (!cold.answered) problems.push(`${at} Back should answer the press at once, with a spinner in place of its arrow: ${JSON.stringify(cold)}`)
  if (warm.back !== 1 || warm.pushed.length) problems.push(`${at} with an /app page behind it Back should be router.back(): ${JSON.stringify(warm)}`)
  if (m.overflow > 0) problems.push(`${at} the page is ${m.overflow}px wider than the window`)
  if (logo.w !== 28 || logo.h !== 28 || logo.shrink !== "0" || !["contain", "cover"].includes(logo.fit)) problems.push(`${at} the mark is not a fixed 28px square: ${JSON.stringify(logo)}`)
  if (pulled.bar !== "rgb(255, 255, 255)") problems.push(`${at} the bar is not solid white: ${pulled.bar}`)
  if (pulled.top !== "rgb(255, 255, 255)") problems.push(`${at} a pull past the top shows ${pulled.top} above the white bar`)
  if (pulled.bottom !== "rgb(248, 249, 250)") problems.push(`${at} a pull past the bottom shows ${pulled.bottom} under the grey page`)
  if (label === "390") {
    if (new Set(m.cards.map((c) => c.x)).size !== 1) problems.push(`${at} the cards are not one column`)
    /* 10px each side, not 16: the /app phone gutter is --app-gutter (app/globals.css), and this page reads it from there too. */
    if (m.cards.some((c) => c.w !== W - 20)) problems.push(`${at} a card is not the page width less the 10px phone gutters: ${m.cards.map((c) => c.w).join(", ")}`)
  } else {
    if (new Set(m.cards.map((c) => c.y)).size !== 1) problems.push(`${at} the plan cards are not in one row`)
    if (new Set(m.cards.map((c) => c.h)).size !== 1) problems.push(`${at} the cards are different heights: ${m.cards.map((c) => c.h).join(", ")}`)
    if (m.grid.w > 1080) problems.push(`${at} the row is ${m.grid.w}px wide`)
    if (Math.abs(m.grid.x + m.grid.w / 2 - W / 2) > 1) problems.push(`${at} the row is not centred`)
  }
}
await browser.close()
server.close()
console.log(JSON.stringify(report))
if (problems.length) fail(problems.join("\n"))
console.log("ok: the plans page covers the shell, has one Back that goes back, and lays out at 390, 1440 and 1920")
