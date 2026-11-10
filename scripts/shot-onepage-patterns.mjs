/**
 * Wallpaper patterns and name styles, photographed (round W10).
 * scripts/render-onepage-patterns.tsx draws them with the live page's own
 * components.
 *
 *   SHOTS=/some/dir node scripts/shot-onepage-patterns.mjs
 *   CASES=atlas,aero-grain node scripts/shot-onepage-patterns.mjs
 *
 * Also counts what a page must never do: throw, scroll sideways at 390.
 */
import { existsSync, mkdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-patterns-"))
mkdirSync(shots, { recursive: true })

/** name: [query, widths] */
const ALL = {
  atlas: ["atlas", [1280]],
  "atlas-strong": ["atlas&level=hard", [1280]],
  "light-dots": ["bg=%23f4efe9&pattern=dots", [390, 1280]],
  "dark-grid": ["bg=%2314161c&text=%23ffffff&pattern=grid", [390, 1280]],
  "gradient-grain": ["bg=gradient&pattern=grain", [390, 1280]],
  "gradient-topographic": ["bg=gradient&pattern=topographic", [390]],
  "aero-grain": ["theme=aero&pattern=grain", [390, 1280]],
  "aqua-dots": ["theme=aqua&pattern=dots", [390]],
  "grunge-grid": ["theme=grunge&pattern=grid", [390, 1280]],
  "playful-checker": ["theme=playful&pattern=checker", [390]],
  "y2k-stars": ["theme=y2k&pattern=stars", [390]],
  "messenger-waves": ["theme=messenger&pattern=waves", [390]],
  "night-terrazzo": ["theme=night&pattern=terrazzo", [390]],
  cream: ["theme=cream", [390]],
  "sunset-gingham": ["theme=sunset&pattern=gingham", [390]],
  "space-sparkles": ["theme=space&pattern=sparkles", [390, 1280]],
  "default-honeycomb": ["theme=default&pattern=honeycomb", [390]],
  "olive-scales": ["theme=olive&pattern=scales", [390]],
  "paper-plus": ["theme=paper&pattern=plus", [390]],
  "legacy-zigzag": ["bg=%23f4efe9&pattern=zigzag", [390]],
  "hero-name": ["theme=nature&name=gradient", [390, 1280]],
}
/* Every name style in a light, a dark, and four skinned themes: the header only. */
const NAME_STYLES = ["theme", "outline", "retro", "gradient", "marker", "chrome", "neon", "sticker", "swash", "spaced", "label"]
for (const t of ["default", "night", "aero", "y2k", "playful", "grunge", "sunset"]) for (const n of NAME_STYLES) ALL[`names-${t}-${n}`] = [`theme=${t}${n === "theme" ? "" : `&name=${n}`}`, [390]]
const pick = (process.env.CASES || Object.keys(ALL).filter((k) => !k.startsWith("names-")).join(",")).split(",").flatMap((c) => (c.endsWith("*") ? Object.keys(ALL).filter((k) => k.startsWith(c.slice(0, -1))) : [c]))
const extra = process.env.EXTRA ? Object.fromEntries(process.env.EXTRA.split(";").map((s) => { const [n, qs, w] = s.split("|"); return [n, [qs, (w || "390").split(",").map(Number)]] })) : {}
const CASES = { ...ALL, ...extra }

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

const { base, server } = await serveEditorProbe({ entry: "scripts/render-onepage-patterns.tsx", fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
const problems = []
try {
  for (const name of [...pick, ...Object.keys(extra)]) {
    const c = CASES[name]
    if (!c) continue
    for (const width of c[1]) {
      const page = await browser.newPage()
      await page.setViewport({ width, height: width < 500 ? 844 : 900, deviceScaleFactor: width < 500 ? 2 : 1, isMobile: width < 500, hasTouch: width < 500 })
      await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
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
      page.on("pageerror", (e) => problems.push(`${name} ${width}: ${e}`))
      await page.goto(`${base}/app?${c[0]}`, { waitUntil: "networkidle0" })
      await page.evaluate(async () => {
        await document.fonts.ready
        await new Promise((r) => setTimeout(r, 700))
      })
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      if (width < 500 && sideways > 0) problems.push(`${name} ${width}: scrolls ${sideways}px sideways`)
      const file = join(shots, `${name}-${width}.png`)
      if (name.startsWith("names-")) await page.screenshot({ path: file, clip: { x: 0, y: 0, width, height: 330 } })
      else await page.screenshot({ path: file, fullPage: name.startsWith("atlas") })
      console.log(`  ${file}`)
      await page.close()
    }
  }
} finally {
  await browser.close()
  server.close()
}
if (problems.length) { console.log(problems.map((p) => `  - ${p}`).join("\n")); process.exit(1) }
console.log(`\nShots in ${shots}`)
