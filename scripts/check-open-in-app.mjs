/**
 * ===========================================================================
 *  THE HAND OFF CARD INSIDE INSTAGRAM'S AND WHATSAPP'S BROWSER (round 14)
 * ===========================================================================
 * components/platform/open-in-app-card, drawn and pressed:
 *
 *   ios-390        Instagram's web view on an iPhone, 390x844: the card
 *                  rises in at the foot, the page's own heading and first
 *                  card are untouched above it, Open follows the app's
 *                  scheme and the App Store follows 1.4s later
 *   android-390    WhatsApp's web view on Android, named by the
 *                  x-requested-with header the probe's server sends back
 *   unnamed-390    an app with no name here: "This page is open in this
 *                  app's browser."
 *   no-store-390   an iPhone with no App Store id: it says what to do
 *                  instead of following a broken address
 *   auto-390       the app has been here before (the cookie): the hand off
 *                  is attempted with no tap, and the card still shows
 *   cancel-390     the page hides right after Open, which is the app taking
 *                  over: the store timer is cancelled and never fires
 *   quiet-390      Keep reading here is remembered, and the next visit has
 *                  no card
 *   wide-1440      1440x900: the card stays a card, 460px at most, centred,
 *                  not a bar across the screen
 *
 *   PROBE_CSS=source SHOTS=/dir node scripts/check-open-in-app.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const SHOTS = process.env.SHOTS || null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const dir = join(root, ".open-in-app-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(
  join(dir, "navigation.js"),
  `export const usePathname = () => "/community/clay-studio"
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
`,
)
writeFileSync(
  join(dir, "image.jsx"),
  `import React from "react"
export default function Image({ src, alt, width, height, fill, sizes, preload, priority, unoptimized, loading, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src.src, alt, width, height, ...rest }) }
`,
)
const bundle = join(dir, "card.js")
execFileSync(
  "npx",
  [
    "--no-install",
    "esbuild",
    join(root, "scripts/render-open-in-app.tsx"),
    "--bundle",
    "--format=iife",
    "--platform=browser",
    "--jsx=automatic",
    "--log-level=error",
    `--outfile=${bundle}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`,
    `--alias:next/image=${join(dir, "image.jsx")}`,
    `--alias:@=${root}`,
    "--loader:.jsx=jsx",
    "--loader:.css=empty",
    "--loader:.svg=dataurl",
    "--loader:.png=dataurl",
  ],
  { stdio: ["ignore", "ignore", "inherit"] },
)
const js = readFileSync(bundle)
rmSync(dir, { recursive: true, force: true })
const css = await appCss(root)

/* The card's fixture, per case, as the real route would answer it. */
const CARDS = {
  ios: { phone: "ios", browser: "Instagram", line: "Instagram is showing it in its own browser.", store: "/store", auto: false },
  android: { phone: "android", browser: "WhatsApp", line: "WhatsApp is showing it in its own browser.", store: "/store", auto: false },
  unnamed: { phone: "ios", browser: "this app's browser", line: "This app is showing it in its own browser.", store: "/store", auto: false },
  "no-store": { phone: "ios", browser: "Instagram", line: "Instagram is showing it in its own browser.", store: null, auto: false },
  auto: { phone: "ios", browser: "Instagram", line: "Instagram is showing it in its own browser.", store: "/store", auto: true },
  cancel: { phone: "ios", browser: "Instagram", line: "Instagram is showing it in its own browser.", store: "/store", auto: false },
  quiet: { phone: "ios", browser: "Instagram", line: "Instagram is showing it in its own browser.", store: "/store", auto: false },
  wide: { phone: "ios", browser: "Instagram", line: "Instagram is showing it in its own browser.", store: "/store", auto: false },
}

const seen = []
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  seen.push(url.pathname)
  if (url.pathname === "/card.js") {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(js)
  }
  if (url.pathname === "/api/app-links/in-app-browser") {
    const path = url.searchParams.get("path") || ""
    const which = /case=([a-z-]+)/.exec(path)?.[1] || "ios"
    const fixture = CARDS[which] || CARDS.ios
    const page = (path.split("?")[0] || "/community/clay-studio")
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" })
    return res.end(JSON.stringify({ card: { ...fixture, path: page, scheme: "/scheme" } }))
  }
  /* The hand off and the store fallback: real requests, answered with nothing so the page stays put and can be measured. */
  if (url.pathname === "/scheme" || url.pathname === "/store") {
    res.writeHead(204)
    return res.end()
  }
  if (url.pathname.startsWith("/images/")) {
    const file = join(root, "public", decodeURIComponent(url.pathname))
    if (existsSync(file)) {
      res.writeHead(200, { "content-type": "image/png" })
      return res.end(readFileSync(file))
    }
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style></head><body><div id="app"></div><script src="/card.js"></script></body></html>`,
  )
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)"
const UA = {
  instagram: `${IOS} Mobile/15E148 Instagram 338.0.3.24.90 (iPhone15,2; iOS 17_5_1; en_US; en; scale=3.00; 1179x2556)`,
  whatsapp:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A.240505.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36",
  safari: `${IOS} Version/17.5 Mobile/15E148 Safari/604.1`,
}
const phone = (w = 390, h = 844) => ({ width: w, height: h, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
const CASES = [
  { name: "ios-390", case: "ios", ua: UA.instagram, viewport: phone(), line: "Instagram is showing it in its own browser." },
  { name: "android-390", case: "android", ua: UA.whatsapp, viewport: phone(), line: "WhatsApp is showing it in its own browser." },
  { name: "unnamed-390", case: "unnamed", ua: UA.instagram, viewport: phone(), line: "This app is showing it in its own browser." },
  { name: "no-store-390", case: "no-store", ua: UA.instagram, viewport: phone() },
  { name: "ios-320", case: "ios", ua: UA.instagram, viewport: phone(320, 568) },
  { name: "auto-390", case: "auto", ua: UA.instagram, viewport: phone() },
  { name: "cancel-390", case: "cancel", ua: UA.instagram, viewport: phone() },
  { name: "quiet-390", case: "quiet", ua: UA.instagram, viewport: phone() },
  { name: "wide-1440", case: "wide", ua: UA.instagram, viewport: { width: 1440, height: 900, deviceScaleFactor: 1 } },
  { name: "real-safari-390", case: "ios", ua: UA.safari, viewport: phone(), none: true },
]

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--hide-scrollbars"] })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const measure = () =>
  (() => {
    const el = document.querySelector("[data-open-app-card]")
    const out = { overflow: document.documentElement.scrollWidth - window.innerWidth, vh: window.innerHeight, vw: window.innerWidth }
    const head = document.getElementById("heading")?.getBoundingClientRect()
    const first = document.getElementById("first-card")?.getBoundingClientRect()
    if (!el) return { ...out, card: null }
    const box = el.firstElementChild.getBoundingClientRect()
    const open = el.querySelector("[data-open-app-card-open]").getBoundingClientRect()
    const quiet = el.querySelector("[data-open-app-card-quiet]").getBoundingClientRect()
    return {
      ...out,
      card: el.getAttribute("data-open-app-card"),
      browser: el.getAttribute("data-open-app-card-browser"),
      state: el.getAttribute("data-state"),
      opacity: +getComputedStyle(el.firstElementChild).opacity,
      left: Math.round(box.left),
      right: Math.round(box.right),
      top: Math.round(box.top),
      bottom: Math.round(box.bottom),
      w: Math.round(box.width),
      h: Math.round(box.height),
      gapBelow: Math.round(window.innerHeight - box.bottom),
      line: el.querySelector("[data-open-app-card-line]").textContent.trim(),
      openBox: [Math.round(open.width), Math.round(open.height)],
      quietBox: [Math.round(quiet.width), Math.round(quiet.height)],
      openText: el.querySelector("[data-open-app-card-open]").textContent.trim(),
      quietText: el.querySelector("[data-open-app-card-quiet]").textContent.trim(),
      headingBottom: head ? Math.round(head.bottom) : null,
      firstCardBottom: first ? Math.round(first.bottom) : null,
      coversFromFraction: +(box.top / window.innerHeight).toFixed(3),
    }
  })()

try {
  for (const c of CASES) {
    console.log(`\n${c.name}`)
    const ctx = await browser.createBrowserContext()
    const p = await ctx.newPage()
    const errors = []
    const asked = []
    p.on("pageerror", (e) => errors.push(e.message))
    p.on("request", (r) => asked.push(new URL(r.url()).pathname))
    await p.setUserAgent(c.ua)
    await p.setViewport(c.viewport)
    if (c.case === "android") await p.setExtraHTTPHeaders({ "x-requested-with": "com.whatsapp" })
    await p.goto(`${origin}/?case=${c.case}`)
    await p.waitForFunction(() => window.__ran)
    const early = await p.evaluate(() => {
      const el = document.querySelector("[data-open-app-card]")
      return el ? el.getAttribute("data-state") : null
    })
    await sleep(1100)
    const r = await p.evaluate(measure)
    console.log(`  ${JSON.stringify(r)}`)

    if (c.none) {
      expect(r.card === null, "a real Safari gets no card: the Smart App Banner and the pill do that job there", r.card)
      expect(!asked.includes("/api/app-links/in-app-browser"), "and the server is never even asked", asked.filter((a) => a.startsWith("/api")))
      expect(errors.length === 0, "nothing threw", errors.slice(0, 1))
      await ctx.close()
      continue
    }

    expect(r.card !== null, "the card is drawn", r.card)
    if (r.card === null) {
      expect(errors.length === 0, "nothing threw", errors.slice(0, 1))
      await ctx.close()
      continue
    }
    if (SHOTS) await p.screenshot({ path: join(SHOTS, `card-${c.name}.png`), fullPage: false })
    expect(early !== "shown", "it is not there in the first paint, so nothing moves under a reading eye", early)
    expect(r.state === "shown" && r.opacity === 1, "it rises in once the page has settled", { state: r.state, opacity: r.opacity })
    expect(r.overflow <= 0, "nothing sideways", r.overflow)
    expect(r.left >= 16 && r.right <= r.vw - 16, "16px clear of each edge", { left: r.left, right: r.right, vw: r.vw })
    expect(r.gapBelow >= 12, "clear of the foot of the screen", r.gapBelow)
    expect(r.openBox[1] >= 40 && r.quietBox[1] >= 40 && r.openBox[0] >= 40 && r.quietBox[0] >= 40, "both presses are 40px or more", { open: r.openBox, quiet: r.quietBox })
    expect(r.openText === "Open" && r.quietText === "Keep reading here", "it says what each press does", { open: r.openText, quiet: r.quietText })
    if (c.line) expect(r.line === c.line, "the line names the app that is showing the page", r.line)
    expect(r.h <= 130, "it is a short card, not a sheet", r.h)
    /* THE PAGE'S OWN FIRST SCREEN IS NOT COVERED: the heading and the first card are above it, and it starts in the last third. */
    expect(r.headingBottom !== null && r.headingBottom < r.top && r.firstCardBottom < r.top, "the page's heading and first card are above it, untouched", { heading: r.headingBottom, firstCard: r.firstCardBottom, cardTop: r.top })
    expect(r.coversFromFraction >= 0.7, "it starts in the last third of the screen", r.coversFromFraction)
    if (c.name === "wide-1440") {
      expect(r.w <= 400, "on a wide screen it stays a card, not a bar across it", r.w)
      expect(Math.abs((r.left + r.right) / 2 - r.vw / 2) <= 1, "and centred", { mid: (r.left + r.right) / 2, vw: r.vw })
    }

    if (c.case === "auto") {
      expect(asked.includes("/scheme"), "the app has been here before: the hand off is attempted with no tap", asked.filter((a) => a === "/scheme").length)
      expect(r.card !== null, "and the card still shows, so a hand off that did nothing leaves something to press")
      await sleep(900)
      const after = await p.evaluate(() => document.querySelector("[data-open-app-card-line]").textContent.trim())
      expect(asked.filter((a) => a === "/store").length === 1, "the store follows once, and only once, when nothing answered", asked.filter((a) => a === "/store").length)
      expect(after === "Install Storelib, then tap the link again.", "and it says to tap the link again, which is the honest answer on an iPhone", after)
    }

    if (c.case === "cancel") {
      await p.evaluate(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" })
      })
      await p.click("[data-open-app-card-open]")
      await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")))
      await sleep(2200)
      expect(asked.includes("/scheme"), "Open follows the app's scheme first", asked.filter((a) => a === "/scheme").length)
      expect(!asked.includes("/store"), "the page hid, which is the app taking over: the store timer is cancelled and never fires", asked.filter((a) => a === "/store"))
      const still = await p.evaluate(() => document.querySelector("[data-open-app-card-line]").textContent.trim())
      expect(still === "Instagram is showing it in its own browser.", "and nothing was said about installing", still)
    }

    if (c.case === "ios" && c.name === "ios-390") {
      await p.click("[data-open-app-card-open]")
      await sleep(250)
      expect(asked.filter((a) => a === "/scheme").length === 1, "Open follows the app's scheme, once", asked.filter((a) => a === "/scheme").length)
      expect(!asked.includes("/store"), "and nothing of the store yet", asked.filter((a) => a === "/store"))
      await sleep(1500)
      expect(asked.filter((a) => a === "/store").length === 1, "1.4s later, with the page still showing, the store", asked.filter((a) => a === "/store").length)
      await sleep(600)
      expect(asked.filter((a) => a === "/store").length === 1, "and it never loops", asked.filter((a) => a === "/store").length)
    }

    if (c.case === "no-store") {
      await p.click("[data-open-app-card-open]")
      await sleep(1900)
      const said = await p.evaluate(() => document.querySelector("[data-open-app-card-line]").textContent.trim())
      expect(said === "Not installed. Find Storelib in the App Store.", "with no App Store id it says what to do rather than following a broken address", said)
      expect(!asked.includes("/store"), "and follows nothing", asked.filter((a) => a === "/store"))
      if (SHOTS) await p.screenshot({ path: join(SHOTS, "card-no-store-said.png"), fullPage: false })
    }

    if (c.case === "quiet") {
      await p.click("[data-open-app-card-quiet]")
      await sleep(400)
      const put = await p.evaluate(() => ({
        gone: !document.querySelector("[data-open-app-card]"),
        stored: !!localStorage.getItem("storelib:open-in-app-card-closed"),
        cookie: /storelib_open_card=closed/.test(document.cookie),
      }))
      expect(put.gone && put.stored && put.cookie, "Keep reading here puts it away and remembers, in storage and in a cookie", put)
      await p.reload()
      await p.waitForFunction(() => window.__ran)
      await sleep(1200)
      const again = await p.evaluate(() => ({ card: !!document.querySelector("[data-open-app-card]") }))
      expect(!again.card, "and the next visit has no card", again)
    }

    expect(errors.length === 0, "nothing threw", errors.slice(0, 1))
    await ctx.close()
  }
} finally {
  await browser.close()
  server.close()
}
if (broken) {
  console.error(`\n${broken} wrong.`)
  process.exit(1)
}
console.log("\n  all good.")
