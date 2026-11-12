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
 *
 * Round W10: the fifteen skins, and AUDIT=1 measures every word on the
 * page against the pixels really under it (the page drawn once more with
 * every word transparent): a word under 4.5:1 (3:1 when large) is a problem.
 *
 *   AUDIT=1 LAYOUTS=own node scripts/shot-onepage-skins.mjs
 */
import { existsSync, mkdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-skins-"))
mkdirSync(shots, { recursive: true })
const THEMES = (process.env.THEMES || "aero,aqua,messenger,y2k,playful,grunge,aero2,aqua2,messenger2,y2k2,playful2,grunge2,classic98,vaporwave,arcade,renaissance").split(",")
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

/** Every word on the page against the pixels under it, the page drawn again with the words transparent. */
async function audit(page) {
  const texts = await page.evaluate(() => {
    const out = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement
      if (!n.textContent.trim() || !el || el.closest("[aria-hidden=true], [data-skin-scene]")) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === "hidden" || /rgba\(0, 0, 0, 0\)/.test(cs.webkitTextFillColor)) continue
      let alpha = 1
      for (let e = el; e; e = e.parentElement) alpha *= +getComputedStyle(e).opacity
      if (alpha < 0.1) continue
      const r = document.createRange()
      r.selectNodeContents(n)
      for (const b of r.getClientRects()) if (b.width > 2 && b.height > 2) out.push({ text: n.textContent.trim().slice(0, 30), color: cs.color, alpha, large: parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.6 && +cs.fontWeight >= 700), x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height })
    }
    return out
  })
  const dpr = await page.evaluate(() => devicePixelRatio)
  const style = await page.addStyleTag({ content: "*, *::before, *::after { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; } ::placeholder { color: transparent !important; }" })
  const { data, info } = await sharp(await page.screenshot({ fullPage: true })).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  await style.evaluate((s) => s.remove())
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]) }
  const px = (x, y) => { const i = (Math.min(info.height - 1, Math.max(0, Math.round(y * dpr))) * info.width + Math.min(info.width - 1, Math.max(0, Math.round(x * dpr)))) * 3; return [data[i], data[i + 1], data[i + 2]] }
  const found = []
  for (const t of texts) {
    const m = /rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/.exec(t.color)
    if (!m) continue
    const a = (m[4] === undefined ? 1 : +m[4]) * t.alpha
    const ratios = []
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
      const bg = px(t.x + (t.w * (i + 0.5)) / 6, t.y + (t.h * (j + 0.5)) / 3)
      const fg = [1, 2, 3].map((k, q) => +m[k] * a + bg[q] * (1 - a))
      const [x, y] = [lum(fg), lum(bg)]
      ratios.push((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05))
    }
    const low = ratios.sort((p, q) => p - q)[2]
    if (low < (t.large ? 3 : 4.5)) found.push(`"${t.text}" reads at ${low.toFixed(2)}:1`)
  }
  return found
}

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
        if (process.env.AUDIT === "1") problems.push(...(await audit(page)).map((p) => `${theme} ${width} ${layout}: ${p}`))
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
