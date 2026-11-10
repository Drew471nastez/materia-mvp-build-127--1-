/**
 * ===========================================================================
 *  THE ROUND W9 THEMES ON A REAL PAGE, PHOTOGRAPHED (round W9)
 * ===========================================================================
 * Each theme drawn by the live page's own component
 * (scripts/render-onepage-skins.tsx) at 390 and 1280 wide, in its own block
 * layout and in each of the five (List, Grid, Cards, Compact, Mixed tiles),
 * full page. Fonts come from Google as a visitor's browser would get them.
 *
 *   SHOTS=/some/dir node scripts/shot-onepage-skins.mjs
 *   THEMES=aero,aqua LAYOUTS=own,grid WIDTHS=390 node scripts/shot-onepage-skins.mjs
 *
 * Also counts what a page must never do: scroll sideways at 390, throw.
 */
import { existsSync, mkdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-skins-"))
mkdirSync(shots, { recursive: true })
const THEMES = (process.env.THEMES || "aero,aqua,messenger,y2k,playful,grunge").split(",")
const LAYOUTS = (process.env.LAYOUTS || "own,list,grid,cards,compact,masonry").split(",")
const WIDTHS = (process.env.WIDTHS || "390,1280").split(",").map(Number)
const FULL = process.env.FULL !== "0"

const CHROME_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
const fetched = new Map()
function remote(url) {
  if (!fetched.has(url)) {
    fetched.set(url, fetch(url, { headers: { "user-agent": CHROME_UA }, signal: AbortSignal.timeout(15000) })
      .then(async (r) => (r.ok ? { type: r.headers.get("content-type") || "application/octet-stream", body: Buffer.from(await r.arrayBuffer()) } : null))
      .catch(() => { fetched.delete(url); return null }))
  }
  return fetched.get(url)
}
const OUTSIDE = /^(fonts\.googleapis\.com|fonts\.gstatic\.com)$/

const { base, server } = await serveEditorProbe({ entry: "scripts/render-onepage-skins.tsx", fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
const problems = []
try {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      for (const layout of LAYOUTS) {
        if (width > 400 && layout !== "own" && process.env.ALL_DESKTOP !== "1") continue
        const page = await browser.newPage()
        await page.setViewport({ width, height: width < 500 ? 844 : 900, deviceScaleFactor: width < 500 ? 2 : 1, isMobile: width < 500, hasTouch: width < 500 })
        await page.setRequestInterception(true)
        page.on("request", async (req) => {
          let u
          try { u = new URL(req.url()) } catch { return req.continue() }
          if (u.protocol === "data:" || u.protocol === "blob:" || u.origin === base) return req.continue()
          if (!OUTSIDE.test(u.hostname)) return req.abort()
          const got = await remote(req.url())
          if (!got) return req.abort()
          return req.respond({ status: 200, contentType: got.type, body: got.body, headers: { "access-control-allow-origin": "*" } })
        })
        page.on("pageerror", (e) => problems.push(`${theme} ${width} ${layout}: ${e}`))
        if (process.env.REDUCED === "1") await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
        await page.goto(`${base}/app?theme=${theme}${layout === "own" ? "" : `&layout=${layout}`}`, { waitUntil: "networkidle0" })
        await page.evaluate(async () => {
          await document.fonts.ready
          await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 4000) }))))
          window.scrollTo(0, document.body.scrollHeight)
          await new Promise((r) => setTimeout(r, 400))
          window.scrollTo(0, 0)
          await new Promise((r) => setTimeout(r, 900))
        })
        const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        if (width < 500 && sideways > 0) problems.push(`${theme} ${width} ${layout}: scrolls ${sideways}px sideways`)
        const file = join(shots, `${theme}-${width}-${layout}.png`)
        await page.screenshot({ path: file, fullPage: FULL })
        console.log(`  ${file}`)
        await page.close()
      }
    }
  }
} finally {
  await browser.close()
  server.close()
}
if (problems.length) { console.log(problems.map((p) => `  - ${p}`).join("\n")); process.exit(1) }
console.log(`\nShots in ${shots}`)
