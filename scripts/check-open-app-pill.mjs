/**
 * ===========================================================================
 *  "OPEN IN THE STORELIB APP" ON A COMMUNITY, IN A PHONE'S BROWSER (round 13)
 * ===========================================================================
 * The pill (components/community/open-in-app-pill) over a community page,
 * at 390 and 320 wide and at 1440, for each browser it meets:
 *
 *   android      Chrome on Android: the pill rises in, 44px, inside the
 *                screen, above the safe area; Open is an intent for this
 *                page in the app with the Play Store as the fallback; Close
 *                puts it away and it stays away on the next visit
 *   ios-safari   with an App Store id: the system's Smart App Banner (the
 *                meta tag in the server's HTML, carrying the page) and no
 *                pill; without one: the pill, opening the app's scheme
 *   ios-chrome   Chrome on an iPhone has no Smart App Banner: the pill
 *   app          inside the app: nothing
 *   desktop      a computer: nothing
 *
 *   PROBE_CSS=source SHOTS=/dir node scripts/check-open-app-pill.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
const SHOTS = process.env.SHOTS || null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const dir = join(root, ".open-app-pill-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/community/clay-studio"
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
`)
writeFileSync(join(dir, "image.jsx"), `import React from "react"
export default function Image({ src, alt, width, height, fill, sizes, preload, priority, unoptimized, loading, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src.src, alt, width, height, ...rest }) }
`)
const bundles = {}
for (const [name, id] of [["with-id", "1234567890"], ["no-id", ""]]) {
  const out = join(dir, `${name}.js`)
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-open-app-pill.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${out}`,
    '--define:process.env.NODE_ENV="production"',
    `--define:process.env.NEXT_PUBLIC_IOS_APP_STORE_ID="${id}"`,
    '--define:process.env.NEXT_PUBLIC_IOS_APP_STORE_URL=""',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/image=${join(dir, "image.jsx")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
  bundles[name] = readFileSync(out)
}
rmSync(dir, { recursive: true, force: true })
const css = await appCss(root)
const server = createServer((req, res) => {
  const name = req.url.includes("no-id") ? "no-id" : "with-id"
  if (req.url.endsWith(".js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundles[name]) }
  if (req.url.startsWith("/images/")) {
    const file = join(root, "public", decodeURIComponent(req.url.split("?")[0]))
    if (existsSync(file)) { res.writeHead(200, { "content-type": "image/png" }); return res.end(readFileSync(file)) }
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style></head><body><div id="app"></div><script src="/${name}.js"></script></body></html>`)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

const UA = {
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36",
  safari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  chromeIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1",
  app: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Capacitor",
  desktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
}
const phone = (w) => ({ width: w, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
const CASES = [
  { name: "android-390", ua: UA.android, viewport: phone(390), bundle: "with-id", pill: "android", href: /^intent:\/\/127\.0\.0\.1:\d+\/community\/clay-studio#Intent;scheme=https;package=com\.storelib\.app;S\.browser_fallback_url=https%3A%2F%2Fplay\.google\.com/ },
  { name: "android-320", ua: UA.android, viewport: { ...phone(320), height: 568 }, bundle: "with-id", pill: "android" },
  { name: "ios-safari-with-id", ua: UA.safari, viewport: phone(390), bundle: "with-id", pill: null, meta: "app-id=1234567890, app-argument=https://storelib.com/community/clay-studio" },
  { name: "ios-safari-no-id", ua: UA.safari, viewport: phone(390), bundle: "no-id", pill: "ios", href: /^com\.storelib\.app:\/\/open\?path=%2Fcommunity%2Fclay-studio$/, meta: null },
  { name: "ios-chrome", ua: UA.chromeIos, viewport: phone(390), bundle: "with-id", pill: "ios" },
  { name: "app", ua: UA.app, viewport: phone(390), bundle: "with-id", pill: null },
  { name: "desktop-1440", ua: UA.desktop, viewport: { width: 1440, height: 900, deviceScaleFactor: 1 }, bundle: "with-id", pill: null },
]

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--hide-scrollbars"] })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
try {
  for (const c of CASES) {
    console.log(`\n${c.name}`)
    /* A fresh profile each time: a pill closed in one case is remembered (localStorage), which is the point, but not across cases. */
    const ctx = await browser.createBrowserContext()
    const p = await ctx.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setUserAgent(c.ua)
    await p.setViewport(c.viewport)
    await p.goto(`${origin}/${c.bundle}`)
    await p.waitForFunction(() => window.__ran)
    const early = await p.$eval("body", () => { const el = document.querySelector("[data-open-app-pill]"); return el ? el.getAttribute("data-state") : null })
    await sleep(1400)
    const r = await p.evaluate(() => {
      const el = document.querySelector("[data-open-app-pill]")
      const ssrMeta = /<meta name="apple-itunes-app" content="([^"]*)"/.exec(window.__ssr || "")
      const out = { ssrMeta: ssrMeta ? ssrMeta[1].replace(/&amp;/g, "&") : null, overflow: document.documentElement.scrollWidth - window.innerWidth }
      if (!el) return { ...out, pill: null }
      const box = el.firstElementChild.getBoundingClientRect()
      const open = el.querySelector("[data-open-app-pill-open]")
      const close = el.querySelector("[data-open-app-pill-close]").getBoundingClientRect()
      return { ...out, pill: el.getAttribute("data-open-app-pill"), state: el.getAttribute("data-state"), left: Math.round(box.left), right: Math.round(box.right), top: Math.round(box.top), bottom: Math.round(box.bottom), h: Math.round(box.height), gapBelow: Math.round(window.innerHeight - box.bottom), opacity: +getComputedStyle(el.firstElementChild).opacity, href: open.getAttribute("href"), text: open.textContent.trim(), closeH: Math.round(close.height), closeW: Math.round(close.width) }
    })
    console.log(`  ${JSON.stringify(r)}`)
    if (SHOTS && c.viewport.width < 800) await p.screenshot({ path: join(SHOTS, `pill-${c.name}.png`), clip: { x: 0, y: c.viewport.height - 160, width: c.viewport.width, height: 160 } })
    expect(r.pill === c.pill, c.pill ? `the pill is drawn for ${c.pill}` : "no pill", r.pill)
    if ("meta" in c) expect(r.ssrMeta === c.meta, c.meta ? "the Smart App Banner's meta tag is in the server's HTML, with this page" : "no Smart App Banner tag without an App Store id", r.ssrMeta)
    if (c.pill) {
      expect(early !== "shown", "it is not there in the first paint (nothing shifts)", early)
      expect(r.state === "shown" && r.opacity === 1, "it rises in once the page has settled", { state: r.state, opacity: r.opacity })
      expect(r.h >= 44 && r.closeH >= 40 && r.closeW >= 40, "44px tall, its close a 40px press", { h: r.h, close: [r.closeW, r.closeH] })
      expect(r.left >= 16 && r.right <= c.viewport.width - 16 && r.overflow <= 0, "inside the screen, 16px clear of each edge, nothing sideways", { left: r.left, right: r.right, overflow: r.overflow })
      expect(r.gapBelow >= 16, "clear of the foot of the screen", r.gapBelow)
      expect(r.text === "Open in the Storelib app", "says what it does", r.text)
      if (c.href) expect(c.href.test(r.href), "opens this page in the app, the store when it is not there", r.href)
      await p.click("[data-open-app-pill-close]")
      await sleep(400)
      const gone = await p.evaluate(() => ({ el: !!document.querySelector("[data-open-app-pill]"), stored: !!localStorage.getItem("storelib:app-pill-closed") }))
      expect(!gone.el && gone.stored, "Close puts it away and remembers", gone)
      await p.reload()
      await p.waitForFunction(() => window.__ran)
      await sleep(1400)
      expect(!(await p.$("[data-open-app-pill]")), "and the next visit has no pill")
    }
    expect(errors.length === 0, "nothing threw", errors.slice(0, 1))
    await ctx.close()
  }
} finally {
  await browser.close()
  server.close()
}
if (broken) { console.error(`\n${broken} wrong.`); process.exit(1) }
console.log("\n  all good.")
