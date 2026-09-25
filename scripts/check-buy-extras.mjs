#!/usr/bin/env node
/**
 * ===========================================================================
 *  THE REFUND NOTE AND THE SHARE BUTTON ON A PRODUCT PAGE
 * ===========================================================================
 * The real controls (scripts/render-buy-extras.tsx), at 390 and 1280.
 *
 *   REFUND, COMPUTER   pressing the line opens a white popover under it,
 *                      on screen, saying the policy and the fine print;
 *                      Escape closes it
 *   REFUND, PHONE      a tap opens the shared bottom sheet with the same
 *                      words and a Got it button that closes it
 *   SHARE, PHONE       with a system share sheet, the button hands it the
 *                      canonical address; without one, the Storelib sheet
 *                      opens with X, Facebook and Copy link
 *   SHARE, COMPUTER    a small menu with the same three; Copy link puts the
 *                      address on the clipboard and says so with the dark pill
 *
 *   node scripts/check-buy-extras.mjs
 *   SHOTS=<dir> node scripts/check-buy-extras.mjs
 */
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const WANT_URL = "https://storelib.com/lucadragoste/seo-geo-aeo-content-guide"

const dir = join(root, ".buy-extras-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "native-bridge.js"), `export function hapticTap() {}
export function isNativeApp() { return false }
export function openExternal() {}
export async function triggerHaptic() {}
export function nativePlatform() { return "web" }
export async function nativeLogOut() {}
`)
try {
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-buy-extras.tsx")],
    bundle: true, format: "iife", platform: "browser", jsx: "automatic", logLevel: "error",
    outfile: join(dir, "probe.js"),
    banner: { js: 'var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;' },
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@/lib/native-bridge": join(dir, "native-bridge.js"), "@": root },
    loader: { ".jsx": "jsx", ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    absWorkingDir: root, nodePaths: [join(root, "node_modules")],
  })
} catch (e) { rmSync(dir, { recursive: true, force: true }); fail(`the probe did not bundle: ${e.message}`) }
const js = readFileSync(join(dir, "probe.js"), "utf8").replace(/<\/script/gi, "<\\/script")
rmSync(dir, { recursive: true, force: true })
const css = await appCss(root)
const faces = interFaces(root) || (process.env.INTER_WOFF2
  ? `@font-face{font-family:Inter;font-weight:100 900;src:url(data:font/woff2;base64,${readFileSync(process.env.INTER_WOFF2).toString("base64")}) format("woff2")}`
  : "")
const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
  `<style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="root"></div><script>window.addEventListener("error",function(e){window.__err=String(e.message)})</script><script>${js}</script></body></html>`
const server = createServer((_, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(html) })
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const problems = []
const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const DESK = { width: 1280, height: 800, deviceScaleFactor: 2 }

async function open(viewport, query = "") {
  const context = await browser.createBrowserContext()
  const p = await context.newPage()
  await context.overridePermissions(base, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"])
  await p.setViewport(viewport)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.goto(`${base}/${query}`, { waitUntil: "load" })
  await p.waitForSelector("[data-refund-trigger]", { timeout: 8000 }).catch(async () => fail(`did not render: ${await p.evaluate(() => window.__err || "")}`))
  await p.evaluate(() => document.fonts.ready)
  await wait(150)
  return { p, context, errors }
}
const pill = (p) => p.evaluate(() => {
  const el = document.querySelector("[data-pill-toast]")
  return el ? { text: el.textContent, bg: getComputedStyle(el).backgroundColor } : null
})

/* ── REFUND, COMPUTER ───────────────────────────────────────────────── */
{
  const { p, context, errors } = await open(DESK)
  await p.click("[data-refund-trigger]")
  await wait(300)
  const pop = await p.evaluate(() => {
    const el = document.querySelector("[data-refund-popover]")
    const t = document.querySelector("[data-refund-trigger]").getBoundingClientRect()
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { text: el.textContent, below: Math.round(r.top - t.bottom), centred: Math.round((r.left + r.width / 2) - (t.left + t.width / 2)), inView: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, bg: getComputedStyle(el).backgroundColor, w: Math.round(r.width) }
  })
  console.log(`\nrefund, 1280: ${pop ? `popover ${pop.w}px wide, ${pop.below}px under the line, ${pop.centred}px off centre, ${pop.bg}, on screen ${pop.inView}` : "nothing opened"}`)
  if (!pop) problems.push("refund 1280: pressing the line opened nothing")
  else {
    if (!/No refunds allowed/.test(pop.text) || !/Every sale is final/.test(pop.text) || !/Updated September 3, 2026/.test(pop.text)) problems.push(`refund 1280: the popover says "${pop.text}"`)
    if (!pop.inView) problems.push("refund 1280: the popover is off screen")
    if (pop.below < 4 || pop.below > 14) problems.push(`refund 1280: the popover is ${pop.below}px from the line`)
  }
  if (shots) await p.screenshot({ path: join(shots, "refund-1280.png"), clip: { x: 390, y: 0, width: 500, height: 520 }, captureBeyondViewport: false })
  await p.keyboard.press("Escape")
  await wait(300)
  if (await p.$("[data-refund-popover]")) problems.push("refund 1280: Escape did not close the popover")
  if (errors.length) problems.push(`refund 1280: ${errors[0]}`)
  await context.close()
}

/* ── REFUND, PHONE ──────────────────────────────────────────────────── */
{
  const { p, context, errors } = await open(PHONE)
  await (await p.$("[data-refund-trigger]")).tap()
  await wait(700)
  const sheet = await p.evaluate(() => {
    const el = document.querySelector("[data-refund-sheet]")
    if (!el) return null
    const panel = el.closest("[data-sheet-panel]")
    const r = (panel || el).getBoundingClientRect()
    return { text: el.textContent, bottom: Math.round(innerHeight - r.bottom), top: Math.round(r.top) }
  })
  console.log(`refund, 390: ${sheet ? `sheet from ${sheet.top}px down to ${sheet.bottom}px above the bottom` : "no sheet"}`)
  if (!sheet) problems.push("refund 390: a tap opened no sheet")
  else if (!/Every sale is final/.test(sheet.text)) problems.push(`refund 390: the sheet says "${sheet.text}"`)
  if (shots) await p.screenshot({ path: join(shots, "refund-390.png") })
  const gotIt = await p.evaluateHandle(() => [...document.querySelectorAll("[data-refund-sheet] button")].find((b) => b.textContent === "Got it"))
  await gotIt.tap()
  await wait(700)
  if (await p.$("[data-refund-sheet]")) problems.push("refund 390: Got it did not close the sheet")
  if (errors.length) problems.push(`refund 390: ${errors[0]}`)
  await context.close()
}

/* ── SHARE, PHONE, WITH A SYSTEM SHEET ──────────────────────────────── */
{
  const { p, context, errors } = await open(PHONE)
  await (await p.$('[aria-label="Share"]')).tap()
  await wait(300)
  const shared = await p.evaluate(() => window.__shared)
  console.log(`share, 390 with a system sheet: ${shared?.length ? `handed it ${shared[0].url}` : "did not use it"}`)
  if (!shared?.length) problems.push("share 390: the system share sheet was not used")
  else if (shared[0].url !== WANT_URL) problems.push(`share 390: shared ${shared[0].url}`)
  if (await p.$("[data-action-sheet]")) problems.push("share 390: the Storelib sheet opened as well as the system one")
  if (errors.length) problems.push(`share 390: ${errors[0]}`)
  await context.close()
}

/* ── SHARE, PHONE, WITHOUT ONE ──────────────────────────────────────── */
{
  const { p, context, errors } = await open(PHONE, "?share=none")
  await (await p.$('[aria-label="Share"]')).tap()
  await wait(700)
  const rows = await p.evaluate(() => [...document.querySelectorAll("[data-action-sheet] a, [data-action-sheet] button")].map((r) => r.textContent.trim()))
  console.log(`share, 390 without one: ${rows.length ? rows.join(" / ") : "nothing"}`)
  if (rows.join("|") !== "Share on X|Share on Facebook|Copy link") problems.push(`share 390 fallback: rows were ${rows.join(", ") || "none"}`)
  if (shots) await p.screenshot({ path: join(shots, "share-390-sheet.png") })
  if (errors.length) problems.push(`share 390 fallback: ${errors[0]}`)
  await context.close()
}

/* ── SHARE, COMPUTER ────────────────────────────────────────────────── */
{
  const { p, context, errors } = await open(DESK, "?share=none")
  await p.click('[aria-label="Share"]')
  await wait(300)
  const menu = await p.evaluate(() => {
    const el = document.querySelector("[data-action-list]")
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { rows: [...el.querySelectorAll('[role="menuitem"]')].map((r) => r.textContent.trim()), x: el.querySelector("a")?.getAttribute("href"), w: Math.round(r.width), inView: r.right <= innerWidth }
  })
  console.log(`share, 1280: ${menu ? `${menu.w}px menu: ${menu.rows.join(" / ")}` : "no menu"}`)
  if (!menu || menu.rows.join("|") !== "Share on X|Share on Facebook|Copy link") problems.push(`share 1280: menu rows ${menu?.rows.join(", ")}`)
  else if (!menu.x?.includes(encodeURIComponent(WANT_URL))) problems.push(`share 1280: the X link carries ${menu.x}`)
  if (shots) await p.screenshot({ path: join(shots, "share-1280-menu.png"), clip: { x: 700, y: 0, width: 400, height: 260 }, captureBeyondViewport: false })
  /* A screenshot can close the menu; open it again if it did. */
  if (!(await p.$("[data-action-list]"))) { await p.click('[aria-label="Share"]'); await wait(300) }
  const box = await p.evaluate(() => {
    const r = [...document.querySelectorAll('[data-action-list] [role="menuitem"]')].find((x) => x.textContent.trim() === "Copy link")?.getBoundingClientRect()
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
  })
  if (box) await p.mouse.click(box.x, box.y)
  await wait(350)
  const toast = await pill(p)
  const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => null))
  console.log(`share, 1280, Copy link: clipboard ${clip}, ${toast ? `pill "${toast.text}" on ${toast.bg}` : "no pill"}`)
  if (clip !== WANT_URL) problems.push(`share 1280: the clipboard holds ${clip}`)
  if (!toast || toast.text !== "Link copied" || toast.bg !== "rgb(17, 17, 19)") problems.push(`share 1280: the confirmation was ${JSON.stringify(toast)}`)
  if (shots) await p.screenshot({ path: join(shots, "share-1280-copied.png") })
  if (errors.length) problems.push(`share 1280: ${errors[0]}`)
  await context.close()
}

await browser.close()
server.close()
console.log("")
if (problems.length) fail(problems.map((p) => `  - ${p}`).join("\n"))
console.log("Refund: popover on a computer, sheet on a phone. Share: the system sheet where there is one, the Storelib menu where not, and the pill on copy.\n")
