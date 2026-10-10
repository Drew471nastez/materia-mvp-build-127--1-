/**
 * HOW IT WORKS, OPENED AND CLOSED.
 *
 *   PROBE_CSS=source node scripts/check-how-it-works.mjs
 *
 * Every explainer in lib/settings/explainers.ts, on a computer (a centred
 * dialog) and on a phone (the shared bottom sheet): it opens, its picture is
 * drawn at the panel's width and is not empty, every line is there and none
 * is cut, and Got it closes it.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
if (!existsSync(CHROMIUM)) { console.error("No browser"); process.exit(1) }
const css = await appCss(root)
const out = mkdtempSync(join(tmpdir(), "storelib-how-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-how-it-works.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"', `--alias:@=${root}`, "--loader:.css=empty"],
  { stdio: ["ignore", "ignore", "inherit"] })
writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><style>body{margin:0;background:#fafafa}</style></head><body><div id="app"></div><script src="probe.js"></script></body></html>`)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--force-device-scale-factor=1"] })
const page = await browser.newPage()
let bad = 0
const say = (ok, line) => { if (!ok) bad++; console.log(`  ${ok ? "ok   " : "FAIL "} ${line}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

for (const [name, vp] of [["a computer", { width: 1280, height: 860 }], ["a phone", { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
  console.log(`\nOn ${name}`)
  await page.setViewport(vp)
  await page.goto(`file://${join(out, "index.html")}`)
  await wait(200)
  const ids = await page.$$eval("[data-how-it-works]", (els) => els.map((e) => e.getAttribute("data-how-it-works")))
  for (const id of ids) {
    await page.click(`[data-how-it-works="${id}"]`)
    await wait(520)
    const r = await page.evaluate((id) => {
      const panel = document.querySelector(`[data-how-it-works-panel="${id}"]`)
      if (!panel) return null
      const svg = panel.querySelector("svg[role=img]")
      const sr = svg?.getBoundingClientRect()
      const pr = panel.getBoundingClientRect()
      const lines = [...panel.querySelectorAll("p")]
      const cut = lines.filter((p) => p.scrollWidth > p.clientWidth + 1 || p.getBoundingClientRect().right > pr.right + 1)
      return { w: Math.round(pr.width), svgW: Math.round(sr?.width ?? 0), svgH: Math.round(sr?.height ?? 0), shapes: svg?.querySelectorAll("path,rect,circle").length ?? 0, lines: lines.length, cut: cut.length, inView: pr.bottom <= innerHeight + 1 && pr.top >= -1 }
    }, id)
    const ok = !!r && r.svgW >= r.w - 60 && r.svgH > 60 && r.shapes >= 4 && r.lines >= 2 && r.cut === 0 && r.inView
    say(ok, `${id}: ${r ? `panel ${r.w}px, picture ${r.svgW}x${r.svgH} with ${r.shapes} shapes, ${r.lines} lines, ${r.cut} cut, ${r.inView ? "in view" : "OFF SCREEN"}` : "did not open"}`)
    const got = await page.$$(`[data-how-it-works-panel="${id}"] button`)
    await got[got.length - 1]?.click()
    await wait(520)
    const gone = await page.evaluate((id) => !document.querySelector(`[data-how-it-works-panel="${id}"]`), id)
    if (!gone) say(false, `${id}: Got it did not close it`)
  }
}
await browser.close()
console.log(bad ? `\n${bad} failed\n` : "\nEvery explanation opens with its picture, reads in full, and closes.\n")
process.exit(bad ? 1 : 0)
