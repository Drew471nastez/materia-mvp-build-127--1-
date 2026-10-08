/**
 * ===========================================================================
 *  THE HEADER GOES WITH THE SCROLL (round 22)
 * ===========================================================================
 * The owner: "as I start scrolling it feels too direct and bumpy, instead of
 * going smoothly through the scroll." components/website-builder/sections/
 * renderers/HeaderSection.tsx, Show on scroll up, on the live page in
 * headless Chromium (scripts/render-header-motion.tsx, the header film's own
 * page), with the CPU slowed four times as a phone's is:
 *
 *   STILL     scrolled less than the clearance line, the header carries no
 *             transform at all (the browser is still placing it)
 *   FOLLOWS   past it, a slow scroll down moves the header by the distance
 *             scrolled, a little each step: never a jump, never a slide on
 *             its own clock
 *   CAPPED    never further than its own height
 *   BACK      a scroll up brings it back by the distance scrolled
 *   SETTLES   stopped halfway, it goes to an end on its own within half a
 *             second: shown after scrolling up, hidden after scrolling down
 *             past half
 *
 *   node scripts/check-header-follow.mjs
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const out = mkdtempSync(join(tmpdir(), "storelib-hdrfollow-"))
const stubs = join(root, ".header-follow-probe")
mkdirSync(stubs, { recursive: true })
try {
  writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
  execFileSync("npx", [
    "esbuild", join(root, "scripts/render-header-motion.tsx"),
    "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
    `--alias:next/link=${join(stubs, "link.jsx")}`,
    `--alias:next/navigation=${join(stubs, "navigation.js")}`,
    `--alias:@=${root}`,
    "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl",
    "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--log-level=error",
  ], { cwd: root, stdio: "inherit" })
  const bundle = readFileSync(join(out, "probe.js"), "utf8")
  const css = await appCss(root)
  const filler = Array.from({ length: 40 }, (_, i) => `<div style="height:120px;background:hsl(${(i * 37) % 360} 24% 80%)">${i}</div>`).join("")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0}</style></head><body><div style="height:44px;background:#7c3aed">announcement</div><div id="mount" style="display:contents"></div>${filler}<script>window.__MODE="live"</script><script>${bundle.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })
  const p = await browser.newPage()
  await p.setViewport({ width: 390, height: 700 })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e.message || e)))
  await p.setRequestInterception(true)
  p.on("request", (r) => (r.url() === "https://site.example/" ? r.respond({ status: 200, contentType: "text/html", body: html }) : r.respond({ status: 204, body: "" })))
  await p.goto("https://site.example/", { waitUntil: "load" })
  await sleep(600)
  const cdp = await p.target().createCDPSession()
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.CPU ?? 4) })

  const read = () =>
    p.evaluate(() => {
      const el = document.querySelector("[data-sticky]")
      const t = el?.style.transform || ""
      const m = /translate3d\(0px?, (-?[\d.]+)px/.exec(t) || /translateY\((-?[\d.]+)px\)/.exec(t)
      return { y: Math.round(window.scrollY), off: m ? -Number(m[1]) : 0, t, h: el ? el.getBoundingClientRect().height : 0, transition: el?.style.transition || "" }
    })
  const scrollTo = async (y) => {
    await p.evaluate((v) => window.scrollTo(0, v), y)
    await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  }

  const first = await read()
  const H = first.h
  expect(H > 30, "the header is drawn", first)
  await scrollTo(20)
  const early = await read()
  expect(early.off === 0, "STILL: just past the top, the header is not moved", early)

  /* Well past the clearance line (announcement + header), then a slow scroll down, 6px a step. */
  const start = 44 + H * 2 + 40
  /* Arrive there from below, so the header is showing when the slow scroll starts. */
  await scrollTo(start + 200)
  await scrollTo(start)
  await sleep(400)
  const base = await read()
  expect(base.off === 0, "revealed after scrolling up to the start", base)
  const steps = []
  for (let y = start + 6; y <= start + 6 * 12; y += 6) {
    await scrollTo(y)
    steps.push(await read())
  }
  const offs = steps.map((s) => s.off)
  const jumps = offs.slice(1).map((o, i) => o - offs[i])
  expect(offs.every((o, i) => i === 0 || o >= offs[i - 1]) && offs[0] > base.off, "FOLLOWS: scrolling down moves it away a little each step", offs)
  expect(jumps.every((j) => j <= 7), "never more than the step scrolled: no jump", jumps)
  expect(steps.every((s) => s.transition === "none" || s.transition === ""), "and no slide on its own clock while the finger moves", [...new Set(steps.map((s) => s.transition))])
  expect(Math.max(...offs) <= H + 0.5, "CAPPED: never further than its own height", { max: Math.max(...offs), H })

  /* Scroll on until it is fully away, then back up a little at a time. */
  await scrollTo(start + H * 3)
  await sleep(500)
  const away = await read()
  expect(Math.abs(away.off - H) <= 0.5, "fully away once scrolled past its height", away)
  const back = []
  for (let k = 1; k <= 5; k++) {
    await scrollTo(start + H * 3 - k * 6)
    back.push((await read()).off)
  }
  expect(back.every((o, i) => o < (i === 0 ? away.off : back[i - 1])) && away.off - back[4] <= 31 && away.off - back[4] >= 29, "BACK: scrolling up brings it back by the distance scrolled", back)

  await sleep(500)
  const settledUp = await read()
  expect(settledUp.off === 0, "SETTLES: stopped after scrolling up, it comes all the way back", settledUp)

  /* Down past half its height, then stop. */
  const now = settledUp.y
  for (let k = 1; k <= Math.ceil((H * 0.7) / 6); k++) await scrollTo(now + k * 6)
  await sleep(600)
  const settledDown = await read()
  expect(Math.abs(settledDown.off - H) <= 0.5, "and stopped past half after scrolling down, it goes all the way", settledDown)
  expect(errors.length === 0, "no page errors", errors)
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
  rmSync(out, { recursive: true, force: true })
}
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nall checks passed")
