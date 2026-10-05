/**
 * ===========================================================================
 *  /APP HOME AND /APP ANALYTICS: iOS'S SPINNER AND A LIGHT TICK (round 13)
 * ===========================================================================
 * Ask 53: "Pull to refresh with the iOS spinner AND a light haptic
 * (Capacitor Haptics in the app, navigator.vibrate on Android web, nothing
 * on iOS web) on the /app home dashboard and /app analytics (under the
 * purple bar)."
 *
 * The real DashboardClient (scripts/render-dashboard-scroll.tsx) and the
 * real AnalyticsClient (scripts/render-analytics-page.tsx) at 390 by 844,
 * each in three phones:
 *
 *   app          a stubbed Capacitor bridge with the Haptics plugin on it
 *   android-web  Chrome on Android (navigator.vibrate stubbed to record)
 *   ios-web      Safari on an iPhone (a vibrate stub that must never be hit)
 *
 * A finger is put down and pulled 170px a step at a time, held, and let go:
 *
 *   THE SPINNER   the eight spokes (the community's), all drawn by the
 *                 time the line is crossed, in the room under the purple
 *                 bar, never over it; turning while the page refreshes
 *   THE TICK      exactly one light tick on crossing the line: the
 *                 plugin's impact LIGHT in the app, a 10ms vibration on
 *                 Android's browser, nothing at all on an iPhone's
 *   HOME          the page comes back where it was
 *
 *   PROBE_CSS=source SHOTS=/dir node scripts/check-app-pull.mjs
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
const dir = join(root, ".app-pull-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "next-navigation.js"), `
const nav = () => (globalThis.__nav = globalThis.__nav || [])
const router = { replace: (u) => { nav().push(["replace", String(u)]) }, push: (u) => { nav().push(["push", String(u)]) }, refresh: () => { nav().push(["refresh"]) }, back() {}, forward() {}, prefetch() {} }
export function useRouter() { return router }
export function useSearchParams() { return new URLSearchParams(location.search) }
export function usePathname() { return "/app" }
export function useParams() { return {} }
export function redirect() {}
export function notFound() {}
`)
writeFileSync(join(dir, "next-link.js"), `import * as React from "react"
export default function Link({ href, children, prefetch, replace, scroll, ...rest }) { return React.createElement("a", { href: String(href), ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(dir, "next-image.js"), `import * as React from "react"
export default function Image({ src, alt, width, height, priority, fill, sizes, quality, placeholder, blurDataURL, loader, unoptimized, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : "", alt: alt || "", width, height, ...rest }) }
`)
const bundles = {}
for (const [name, entry] of [["home", "scripts/render-dashboard-scroll.tsx"], ["analytics", "scripts/render-analytics-page.tsx"]]) {
  const out = join(dir, `${name}.js`)
  execFileSync("npx", ["--no-install", "esbuild", join(root, entry),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${out}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://probe.invalid"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="probe-anon-key"',
    `--alias:next/navigation=${join(dir, "next-navigation.js")}`,
    `--alias:next/link=${join(dir, "next-link.js")}`,
    `--alias:next/image=${join(dir, "next-image.js")}`,
    `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl", "--loader:.jsx=jsx"],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
  bundles[name] = readFileSync(out)
}
rmSync(dir, { recursive: true, force: true })
const css = await appCss(root)
const html = (name) => `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}html,body,#app{height:100%}</style></head><body><div id="app" style="height:100dvh"></div><script src="/${name}.js"></script></body></html>`
const server = createServer((req, res) => {
  const name = req.url.slice(1).split(/[.?]/)[0]
  if (req.url.endsWith(".js") && bundles[name]) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundles[name]) }
  if (req.url.startsWith("/api/")) { res.writeHead(200, { "content-type": "application/json" }); return res.end("{}") }
  res.writeHead(200, { "content-type": "text/html" }); res.end(html(name === "analytics" ? "analytics" : "home"))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

const PHONES = {
  app: {
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Capacitor",
    setup: () => {
      window.__haptics = []
      /* What @capacitor/core reads to know it is in the iOS app, for a page that loads it (the /app home does) and rebuilds window.Capacitor. */
      window.webkit = { messageHandlers: { bridge: { postMessage() {} } } }
      window.Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => "ios",
        Plugins: { Haptics: { impact: async (o) => { window.__haptics.push(`impact:${o.style}`) }, selectionChanged: async () => { window.__haptics.push("selection") } } },
      }
    },
    want: ["impact:LIGHT"],
  },
  "android-web": {
    ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36",
    setup: () => {
      window.__haptics = []
      Object.defineProperty(navigator, "vibrate", { configurable: true, value: (ms) => { window.__haptics.push(`vibrate:${ms}`); return true } })
    },
    want: ["vibrate:10"],
  },
  "ios-web": {
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    setup: () => {
      window.__haptics = []
      Object.defineProperty(navigator, "vibrate", { configurable: true, value: (ms) => { window.__haptics.push(`vibrate:${ms}`); return true } })
    },
    want: [],
  },
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--hide-scrollbars"] })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const frame = (p) => p.evaluate(() => new Promise((r) => requestAnimationFrame(r)))

try {
  for (const pageName of ["home", "analytics"]) {
    for (const [phoneName, phone] of Object.entries(PHONES)) {
      console.log(`\n${pageName}, ${phoneName}`)
      const p = await browser.newPage()
      const errors = []
      p.on("pageerror", (e) => errors.push(e.message))
      await p.setUserAgent(phone.ua)
      await p.evaluateOnNewDocument(phone.setup)
      await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
      await p.goto(`${origin}/${pageName}`)
      await p.waitForSelector("[data-page-strip]")
      await p.waitForSelector("[data-ptr-indicator]")
      await sleep(1500)
      const cdp = await p.createCDPSession()
      const read = () => p.evaluate(() => {
        const strip = [...document.querySelectorAll("[data-page-strip]")].map((s) => s.getBoundingClientRect()).find((r) => r.height > 0)
        const ind = document.querySelector("[data-ptr-indicator]")
        const ir = ind.getBoundingClientRect()
        const spokes = [...ind.querySelectorAll("[data-ptr-spoke]")]
        const h1 = document.querySelector("h1").getBoundingClientRect()
        return {
          stripBottom: strip ? Math.round(strip.bottom) : null,
          spinTop: Math.round(ir.top), spinBottom: Math.round(ir.bottom), spinSize: Math.round(ir.width),
          spinOpacity: +Number(getComputedStyle(ind).opacity).toFixed(2),
          spokes: spokes.length, spokesShown: spokes.filter((s) => Number(getComputedStyle(s).opacity) > 0.05).length,
          ring: !!ind.querySelector("[data-ptr-arc]"),
          spinning: getComputedStyle(ind.querySelector("[data-ptr-spin]")).animationName,
          headingTop: Math.round(h1.top),
          haptics: window.__haptics.slice(),
        }
      })
      const rest = await read()
      const x = 195
      let y = 130
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] })
      for (let i = 0; i < 34; i++) {
        y += 5
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] })
        await frame(p)
      }
      await sleep(120)
      const held = await read()
      if (SHOTS) await p.screenshot({ path: join(SHOTS, `pull-${pageName}-${phoneName}-held.png`), clip: { x: 0, y: 0, width: 390, height: 320 } })
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      await sleep(140)
      const refreshing = await read()
      if (SHOTS) await p.screenshot({ path: join(SHOTS, `pull-${pageName}-${phoneName}-refreshing.png`), clip: { x: 0, y: 0, width: 390, height: 320 } })
      await sleep(2600)
      const after = await read()
      console.log(`  rest ${JSON.stringify(rest)}\n  held ${JSON.stringify(held)}\n  refreshing ${JSON.stringify(refreshing)}`)
      expect(held.spokes === 8 && !held.ring, "the spinner is the community's eight spokes, not the old ring", { spokes: held.spokes, ring: held.ring })
      expect(held.spokesShown === 8 && held.spinOpacity > 0.5, "past the line every spoke is drawn", { shown: held.spokesShown, opacity: held.spinOpacity })
      expect(held.stripBottom === null || held.spinTop >= held.stripBottom, "in the room under the purple bar, never over it", { spinTop: held.spinTop, barBottom: held.stripBottom })
      expect(held.spinBottom <= held.headingTop, "and above the page it moved down", { spinBottom: held.spinBottom, heading: held.headingTop })
      expect(/ptr-spokes-spin/.test(refreshing.spinning), "turning while the page refreshes", refreshing.spinning)
      expect(JSON.stringify(held.haptics) === JSON.stringify(phone.want), `the tick on crossing the line: ${phone.want.join(", ") || "none"}`, held.haptics)
      expect(Math.abs(after.headingTop - rest.headingTop) <= 1, "the page came home", { rest: rest.headingTop, after: after.headingTop })
      expect(errors.length === 0, "nothing threw", errors.slice(0, 1))
      await p.close()
    }
  }
} finally {
  await browser.close()
  server.close()
}
if (broken) { console.error(`\n${broken} wrong.`); process.exit(1) }
console.log("\n  all good.")
