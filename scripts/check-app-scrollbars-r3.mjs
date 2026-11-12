/**
 * ===========================================================================
 *  NO BLACK SCROLLBARS INSIDE /app (round 3)
 * ===========================================================================
 * The owner: the Share your OnePage dialog showed a thick black scrollbar
 * track, the cheap default look, and so did the rest of /app's modals,
 * sheets, panels and dropdowns. The cause was one inherited property: the
 * site's charcoal `scrollbar-color` on <html> reached every scroller under
 * it (app/globals.css, EVERY SCROLLER INSIDE THE PAGE).
 *
 * Each case of scripts/render-app-scrollbars-r3.tsx is mounted on the built
 * CSS with real scrollbars (no --hide-scrollbars, the measurement IS the
 * scrollbar), and for its scroller this reads:
 *
 *   bar      the width the bar takes (thin is 10px or less in Chromium)
 *   track    how far the bar's column, away from the thumb, is from the
 *            surface behind it: a transparent track is the surface itself
 *   thumb    how far the thumb is from the surface: visible, but quiet
 *
 * and saves a photo of each (OUT=dir). A row that hides its bar on purpose
 * must still take none.
 *
 *   pnpm build && node scripts/check-app-scrollbars-r3.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.env.ROOT ?? process.cwd()
const OUT = process.env.OUT ?? null
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const built = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")
/* A desktop with a mouse. Headless Chromium matches neither (hover: hover) nor (pointer: fine), whatever it is told (see check-ads-label-r52.mjs), so the stylesheet is read as such a screen would read it. */
const css = built
  .replace(/\(hover: ?hover\) and \(pointer: ?fine\)/g, "all")
  .replace(/\(hover: ?hover\)/g, "all")
  .replace(/\(hover: ?none\)/g, "not all")
  .replace(/\(pointer: ?coarse\)/g, "not all")

const work = mkdtempSync(join(tmpdir(), "storelib-scrollbars-"))
const stubs = join(work, "stubs")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/app"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
execFileSync("npx", [
  "esbuild", join(process.cwd(), "scripts/render-app-scrollbars-r3.tsx"),
  "--bundle", "--format=iife", `--outfile=${join(work, "probe.js")}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`,
  `--alias:next/navigation=${join(stubs, "navigation.js")}`,
  `--alias:@=${process.cwd()}`,
  "--loader:.css=empty", "--loader:.svg=dataurl",
  "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--log-level=error",
], { cwd: process.cwd(), stdio: "inherit" })
const file = join(work, "index.html")
writeFileSync(file,
  `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><style>${css}</style></head>` +
  `<body class="font-sans antialiased bg-background text-foreground" style="background:#f8f9fa"><div id="app"></div>` +
  `<script>${readFileSync(join(work, "probe.js"), "utf8")}</script></body></html>`)

const CASES = ["share", "sheet", "dropdown", "dark", "hidden"]
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"], ignoreDefaultArgs: ["--hide-scrollbars"] })
const results = []
try {
  for (const which of CASES) {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })
    await page.goto(`file://${file}#${which}`, { waitUntil: "load" })
    await new Promise((r) => setTimeout(r, 500))
    await page.evaluate(() => document.getAnimations().forEach((a) => { try { a.finish() } catch {} }))
    await new Promise((r) => setTimeout(r, 150))
    const info = await page.evaluate(() => {
      const el = document.querySelector("[data-probe-scroller]")
      if (!el) return null
      const cs = getComputedStyle(el)
      const bl = parseFloat(cs.borderLeftWidth), br = parseFloat(cs.borderRightWidth), bt = parseFloat(cs.borderTopWidth), bb = parseFloat(cs.borderBottomWidth)
      const r = el.getBoundingClientRect()
      let n = el, surface = "rgba(0, 0, 0, 0)"
      while (n && n.nodeType === 1) {
        const bg = getComputedStyle(n).backgroundColor
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") { surface = bg; break }
        n = n.parentElement
      }
      return {
        hidden: el.hasAttribute("data-expect-hidden"),
        vbar: Math.round(el.offsetWidth - el.clientWidth - bl - br),
        hbar: Math.round(el.offsetHeight - el.clientHeight - bt - bb),
        width: cs.scrollbarWidth,
        color: cs.scrollbarColor,
        surface,
        box: { x: r.right - br, y: r.top + bt, h: el.clientHeight },
      }
    })
    if (!info) { results.push({ which, missing: true }); await page.close(); continue }
    if (OUT) { mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: join(OUT, `scrollbar-${which}.png`) }) }
    let track = null, thumb = null
    if (!info.hidden && info.vbar > 0) {
      const clip = { x: Math.floor(info.box.x - info.vbar) - 4, y: Math.floor(info.box.y), width: info.vbar + 4, height: Math.floor(info.box.h) }
      const shot = await page.screenshot({ encoding: "base64" })
      const px = await page.evaluate(async (b64, clip) => {
        const img = new Image()
        img.src = `data:image/png;base64,${b64}`
        await img.decode()
        const c = document.createElement("canvas")
        c.width = clip.width; c.height = clip.height
        const g = c.getContext("2d")
        g.drawImage(img, clip.x, clip.y, clip.width, clip.height, 0, 0, clip.width, clip.height)
        const d = g.getImageData(0, 0, c.width, c.height).data
        const lum = (r, gg, b) => (0.2126 * r + 0.7152 * gg + 0.0722 * b) / 255
        /* The surface is read from the pixels 3px left of the bar (the scroller's padding), never parsed from CSS. */
        const at = (x, y) => { const i = (y * c.width + x) * 4; return lum(d[i], d[i + 1], d[i + 2]) }
        const side = []
        for (let y = 0; y < c.height; y++) side.push(at(1, y))
        side.sort((a, b) => a - b)
        const s = side[Math.floor(side.length / 2)]
        /* The middle of the bar's column, row by row. */
        const x = 4 + Math.floor((c.width - 4) / 2)
        const diffs = []
        /* Not the 14px at either end, where a classic bar draws its arrows. */
        for (let y = 14; y < c.height - 14; y++) diffs.push(Math.abs(at(x, y) - s))
        diffs.sort((a, b) => a - b)
        /* A tenth of the column is always track, however long the thumb. */
        return { track: diffs[Math.floor(diffs.length * 0.1)], thumb: diffs[diffs.length - 1] }
      }, shot, clip)
      track = Math.round(px.track * 1000) / 1000
      thumb = Math.round(px.thumb * 1000) / 1000
    }
    results.push({ which, ...info, track, thumb })
    await page.close()
  }
} finally {
  await browser.close()
}

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got != null ? `   (${got})` : ""}`)
  if (!ok) broken++
}
for (const r of results) {
  console.log(`\n${r.which}`)
  if (r.missing) { expect(false, "the scroller is on the page"); continue }
  if (r.hidden) {
    expect(r.hbar === 0 && r.vbar === 0, "a row that hides its bar still takes none", `${r.hbar}px`)
    continue
  }
  expect(r.vbar > 0 && r.vbar <= 10, "a thin bar, not the platform's full width", `${r.vbar}px, scrollbar-width ${r.width}`)
  expect(r.track != null && r.track <= 0.03, "no track: the column away from the thumb is the surface itself", `luminance off by ${r.track} on ${r.surface}`)
  expect(r.thumb != null && r.thumb >= 0.06 && r.thumb <= 0.45, "a thumb that is seen and stays quiet", `luminance off by ${r.thumb}; scrollbar-color ${r.color}`)
}
console.log(broken === 0 ? "\nEvery /app scroller draws one slim, quiet bar on no track.\n" : `\n${broken} measured wrong.\n`)
process.exit(broken === 0 ? 0 : 1)
