/**
 * ===========================================================================
 *  /APP ANALYTICS: THE PULL TO REFRESH, UNDER THE PURPLE BAR
 * ===========================================================================
 * Round 12, ask 37: "the pull to refresh indicator sits BELOW the purple
 * announcement bar, like the /app home dashboard." The real AnalyticsClient
 * (scripts/render-analytics-page.tsx) at 390 by 844, a finger put down on the
 * page and pulled 170px a step at a time, then held: where the purple bar
 * is, where the spinner is, where the page under it went. Then let go: the
 * refresh asked the server again and the page came home.
 *
 *   node scripts/check-analytics-pull.mjs          (SHOTS=/dir for pictures)
 *   OUTER=1 node scripts/check-analytics-pull.mjs  (the pull round the whole page, as it was)
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
const dir = join(root, ".pull-probe")
mkdirSync(dir, { recursive: true })
const out = process.env.SHOTS || dir
mkdirSync(out, { recursive: true })
writeFileSync(join(dir, "native-bridge.js"), `export function hapticTap() {}
export function isNativeApp() { return false }
export async function triggerHaptic() {}
export function hapticImpact() {}
export function openExternal() {}
export function nativePlatform() { return "web" }
export function shareNative() { return Promise.resolve(false) }
`)
writeFileSync(join(dir, "next-navigation.js"), `
const nav = () => (globalThis.__nav = globalThis.__nav || [])
const router = { replace: (u) => { nav().push(["replace", String(u)]) }, push: (u) => { nav().push(["push", String(u)]) }, refresh: () => { nav().push(["refresh"]) }, back() {}, forward() {}, prefetch() {} }
export function useRouter() { return router }
export function useSearchParams() { return new URLSearchParams(location.search) }
export function usePathname() { return location.pathname }
export function redirect() {}
export function notFound() {}
`)
writeFileSync(join(dir, "next-link.js"), `import * as React from "react"
export default function Link({ href, children, prefetch, replace, scroll, ...rest }) { return React.createElement("a", { href: String(href), ...rest }, children) }
`)
const bundle = join(dir, "probe.js")
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-analytics-page.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@/lib/native-bridge=${join(dir, "native-bridge.js")}`,
  `--alias:next/navigation=${join(dir, "next-navigation.js")}`,
  `--alias:next/link=${join(dir, "next-link.js")}`,
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
const js = readFileSync(bundle)
const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${await appCss(root)}</style><style>body{margin:0}</style></head><body><div id="app"></div><script src="/probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js) }
  res.writeHead(200, { "content-type": "text/html" }); res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--hide-scrollbars"] })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
try {
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  await p.goto(`${origin}/${process.env.OUTER ? "?outer=1" : ""}`)
  await p.waitForSelector("[data-page-strip]")
  await sleep(1500)
  const cdp = await p.createCDPSession()
  const read = () => p.evaluate(() => {
    const strip = document.querySelector("[data-page-strip]").getBoundingClientRect()
    const ind = document.querySelector("[data-ptr-indicator]")
    const ir = ind.getBoundingClientRect()
    const content = document.querySelector("[data-pull-content]")
    const h1 = document.querySelector("h1").getBoundingClientRect()
    return { stripTop: Math.round(strip.top), stripBottom: Math.round(strip.bottom), spinTop: Math.round(ir.top), spinBottom: Math.round(ir.bottom), spinOpacity: +Number(getComputedStyle(ind).opacity).toFixed(2), contentMoved: content ? (getComputedStyle(content).transform || "none") : "none", headingTop: Math.round(h1.top) }
  })
  const rest = await read()
  const x = 195
  let y = 300
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] })
  for (let i = 0; i < 34; i++) {
    y += 5
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] })
    await p.evaluate(() => new Promise((r) => requestAnimationFrame(r)))
  }
  await sleep(120)
  const held = await read()
  await p.screenshot({ path: join(out, `analytics-pull-390${process.env.OUTER ? "-before" : ""}.png`), clip: { x: 0, y: 0, width: 390, height: 300 } })
  console.log(`  at rest: ${JSON.stringify(rest)}\n  pulled 170px: ${JSON.stringify(held)}`)
  expect(held.stripTop === rest.stripTop && held.stripBottom === rest.stripBottom, "the purple bar stays where it is while the page is pulled", { rest: [rest.stripTop, rest.stripBottom], held: [held.stripTop, held.stripBottom] })
  expect(held.spinOpacity > 0.5, "the spinner shows in the room the pull opened", held.spinOpacity)
  expect(held.spinTop >= held.stripBottom, "below the purple bar, never over or above it", { spinTop: held.spinTop, barBottom: held.stripBottom })
  expect(held.headingTop > rest.headingTop + 30 && held.spinBottom <= held.headingTop, "the page under it moved down, and the spinner is between the bar and the page", { rest: rest.headingTop, held: held.headingTop, spinBottom: held.spinBottom })
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await sleep(2500)
  const after = await read()
  const nav = await p.evaluate(() => (globalThis.__nav || []).map((n) => n[0]))
  expect(nav.includes("refresh"), "letting go asked the server again", nav)
  expect(Math.abs(after.headingTop - rest.headingTop) <= 1, "and the page came home", { rest: rest.headingTop, after: after.headingTop })
  expect(errors.length === 0, "nothing threw", errors.slice(0, 1))
  await p.close()
} finally {
  await browser.close()
  server.close()
}
if (broken) { console.error(`\n${broken} wrong.`); process.exit(1) }
console.log("\n  all good.")
