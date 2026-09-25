/**
 * ===========================================================================
 *  THE ADDRESS PILL IN SETTINGS, ON A PHONE: 10% NARROWER
 * ===========================================================================
 * "The width of the share pill on the right side on mobile is too big:
 * reduce it by 10% there, like on the homepage, so it doesn't squeeze the
 * 'Settings / Manage your account and preferences' text."
 *
 * The real Settings page (scripts/render-settings-pill.tsx) with the owner's
 * length of handle, at 360, 390 and 430 as phones. The pill's width now, and
 * the width it had (the same page with the pill's new cap taken off, which
 * is the 58% of the row its box allowed), and how many lines the subtitle
 * needs beside each. From 768 the pill is the computer's, untouched.
 *
 *   node scripts/check-share-pill-settings.mjs
 *   SHOTS=/some/dir node scripts/check-share-pill-settings.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS || join(mkdtempSync(join(tmpdir(), "settings-pill-")), "shots")
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
mkdirSync(SHOTS, { recursive: true })

const dir = join(root, ".settings-pill-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/app/settings"
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(dir, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) }, from: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-settings-pill.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
let fontDir = null
const fonts = interFaces(root).replace(/url\(file:\/\/([^)]*\/static\/media)\/([^)]+)\)/g, (_, d, f) => { fontDir = d; return `url(/__font/${f})` })
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${fonts}</style><style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })
const server = createServer((req, res) => {
  if (req.url.startsWith("/__font/") && fontDir) {
    try { res.writeHead(200, { "content-type": "font/woff2" }); res.end(readFileSync(join(fontDir, req.url.slice(8)))) } catch { res.writeHead(404); res.end() }
    return
  }
  if (req.url.startsWith("/api/")) {
    res.writeHead(200, { "content-type": "application/json" })
    res.end(req.url.startsWith("/api/domains") ? JSON.stringify({ domains: [] }) : "{}")
    return
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const report = {}

const measure = (page) => page.evaluate(() => {
  const pill = [...document.querySelectorAll("[data-share-pill]")].find((p) => p.getClientRects().length)
  const sub = document.querySelector("[data-settings-page] h1 + p")
  const lineH = parseFloat(getComputedStyle(sub).lineHeight) || 20
  const b = pill.getBoundingClientRect()
  return { pill: +b.width.toFixed(1), lines: Math.round(sub.getBoundingClientRect().height / lineH), text: sub.textContent.trim() }
})

try {
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
  for (const width of [360, 390, 430]) {
    console.log(`\nphone ${width}`)
    const page = await browser.newPage()
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e)))
    await page.setViewport({ width, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
    await page.goto(`${base}/app/settings`)
    await page.waitForSelector("[data-share-pill]", { timeout: 20000 })
    await page.evaluate(() => document.fonts.ready)
    await wait(500)
    const now = await measure(page)
    await page.screenshot({ path: join(SHOTS, `settings-${width}-now.png`), clip: { x: 0, y: 60, width, height: 170 } })
    /* The width it had: the same pill with its new cap taken off, inside the same 58% box. */
    await page.evaluate(() => {
      const pill = [...document.querySelectorAll("[data-share-pill]")].find((p) => p.getClientRects().length)
      pill.parentElement.style.maxWidth = "100%"
    })
    await wait(200)
    const before = await measure(page)
    await page.screenshot({ path: join(SHOTS, `settings-${width}-before.png`), clip: { x: 0, y: 60, width, height: 170 } })
    const ratio = now.pill / before.pill
    expect(Math.abs(ratio - 0.9) <= 0.012, `the pill is 10% narrower: ${before.pill}px to ${now.pill}px`, ratio.toFixed(3))
    expect(now.lines <= before.lines, `the subtitle needs ${now.lines} line(s) beside it, ${before.lines} before`, now.text)
    report[width] = { before: before.pill, now: now.pill, linesBefore: before.lines, linesNow: now.lines }
    expect(errors.length === 0, "no errors", errors.slice(0, 2).join(" | "))
    await page.close()
  }
  await browser.close()
} finally {
  server.close()
}
console.log(`\n${JSON.stringify(report)}`)
console.log(`\nshots: ${SHOTS}`)
console.log(broken ? `\n${broken} failed\n` : "\nall good\n")
process.exit(broken ? 1 : 0)
