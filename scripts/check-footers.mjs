/**
 * ===========================================================================
 *  "COOKIE PREFERENCES" SITS IN THE ROW, NOT UNDER IT
 * ===========================================================================
 * The report was a screenshot of a creator page's footer on a desktop: the
 * bar with "Powered by Storelib" on the left and "Privacy Policy   Terms &
 * Conditions" on the right, and "Cookie preferences" on a line of its own
 * underneath, centred on nothing in particular.
 *
 * This mounts every footer that carries the link, in the real stylesheet, at
 * a phone, a laptop and a wide desktop, and measures the link against the
 * links it sits with:
 *
 *   same font size, weight, line height and colour
 *   same baseline as the link before it (on a desktop, the same line)
 *   the same gap as between the other links
 *   on a phone, every wrapped line of the group centred under "Powered by"
 *   nothing wider than the window
 *
 *   node scripts/check-footers.mjs
 *
 * Runs without a build: the stylesheet comes from scripts/probe-css.mjs.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
const dir = join(root, ".footers-probe")
mkdirSync(dir, { recursive: true })

writeFileSync(join(dir, "next-navigation.js"), `const r = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }
export const useRouter = () => r
export const usePathname = () => "/"
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(dir, "next-link.js"), `import * as React from "react"
export default function Link({ href, children, prefetch, replace, scroll, ...rest }) { return React.createElement("a", { href: String(href), ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(dir, "next-image.js"), `import * as React from "react"
export default function Image({ src, alt, fill, priority, quality, sizes, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : "", alt, ...rest }) }
`)

const css = await appCss(root)
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-footers.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:next/navigation=${join(dir, "next-navigation.js")}`,
  `--alias:next/link=${join(dir, "next-link.js")}`,
  `--alias:next/image=${join(dir, "next-image.js")}`,
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { cwd: root, stdio: "inherit" })

const IDS = ["seller-live", "seller-desktop-preview", "seller-phone-preview", "seller-dark", "site", "site-long", "marketing"]
writeFileSync(join(dir, "index.html"), `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}.probe{margin-bottom:40px}</style></head><body>
${IDS.map((id) => `<div class="probe" id="${id}"></div>`).join("\n")}
<script src="probe.js"></script></body></html>`)

/**
 * Everything is measured in the page. For each footer: the cookie link, the
 * links it is grouped with, and the numbers above.
 */
const MEASURE = `(() => {
  const r2 = (n) => Math.round(n * 10) / 10
  const style = (el) => { const s = getComputedStyle(el); return { size: s.fontSize, weight: s.fontWeight, line: s.lineHeight, color: s.color, family: s.fontFamily.split(",")[0] } }
  /* The baseline, from a zero-height inline-block dropped into the element:
     it sits on the baseline, which the element's box does not say. */
  const baseline = (el) => {
    const m = document.createElement("span")
    m.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline"
    el.appendChild(m)
    const y = m.getBoundingClientRect().top
    m.remove()
    return y
  }
  const out = {}
  for (const id of ${JSON.stringify(IDS)}) {
    const host = document.getElementById(id)
    /* The editor's desktop preview draws two copies and hides one with CSS. */
    const visible = (el) => !!el && el.getClientRects().length > 0
    const cookie = [...host.querySelectorAll("[data-cookie-preferences]")].find(visible)
    if (!cookie) { out[id] = { cookie: false }; continue }
    let peers
    if (id === "marketing") peers = [...cookie.parentElement.children].filter((e) => e !== cookie && visible(e))
    else if (id.startsWith("site")) peers = [host.querySelector("[data-footer-bottom] > span")]
    else peers = [...cookie.closest("[data-footer-links]").children].filter((e) => e !== cookie && visible(e))
    const prev = cookie.previousElementSibling
    const c = cookie.getBoundingClientRect()
    const p = prev.getBoundingClientRect()
    const res = {
      cookie: true,
      text: cookie.textContent.trim(),
      styleSame: peers.every((e) => JSON.stringify(style(e)) === JSON.stringify(style(cookie))),
      style: style(cookie),
      peerStyle: style(peers[0]),
      baselineDelta: r2(baseline(cookie) - baseline(prev)),
      sameLine: Math.abs(c.top - p.top) < 1,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
    if (id === "marketing") {
      /* A column: every link the same distance below the last, on one left edge. */
      const items = [...cookie.parentElement.children].filter(visible).map((e) => e.getBoundingClientRect())
      res.pitch = [...new Set(items.slice(1).map((b, i) => r2(b.top - items[i].top)))]
      res.lefts = [...new Set(items.map((b) => r2(b.left)))]
    }
    if (!id.startsWith("site") && id !== "marketing") {
      const group = cookie.closest("[data-footer-links]")
      const g = group.getBoundingClientRect()
      const items = [...group.children].filter(visible).map((e) => e.getBoundingClientRect())
      /* Gaps between neighbours on the same line. */
      const gaps = []
      for (let i = 1; i < items.length; i++) if (Math.abs(items[i].top - items[i - 1].top) < 1) gaps.push(r2(items[i].left - items[i - 1].right))
      res.gaps = gaps
      /* Lines of the group, and how far each is from centred within it. */
      const lines = {}
      for (const b of items) { const k = Math.round(b.top); (lines[k] ||= []).push(b) }
      res.lines = Object.keys(lines).length
      res.lineOffCentre = Object.values(lines).map((row) => r2((Math.min(...row.map((b) => b.left)) - g.left) - (g.right - Math.max(...row.map((b) => b.right)))))
      const powered = [...host.querySelectorAll("footer span")].find((s) => visible(s) && s.textContent.trim() === "Powered by")
      const pb = powered.parentElement.getBoundingClientRect()
      res.poweredAbove = r2(g.top - pb.bottom)
      res.poweredLeftOf = r2(g.left - pb.right)
      res.groupRightGap = r2(host.querySelector("footer").getBoundingClientRect().right - g.right)
    }
    out[id] = res
  }
  return out
})()`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox"] })
let broken = 0
const fail = (m) => { broken++; console.log(`  FAIL  ${m}`) }
const ok = (m) => console.log(`  ok    ${m}`)
try {
  for (const width of [390, 1280, 1920]) {
    const page = await browser.newPage()
    await page.setViewport({ width, height: 900 })
    await page.goto(`file://${join(dir, "index.html")}`)
    await page.waitForFunction(() => document.querySelectorAll("[data-cookie-preferences]").length >= 6, { timeout: 10000 })
    await page.evaluate(() => document.fonts.ready)
    const m = await page.evaluate(MEASURE)
    console.log(`\n${width}px`)
    for (const [id, r] of Object.entries(m)) {
      if (!r.cookie) { fail(`${id}: no Cookie preferences link`); continue }
      const phone = width < 640 || id === "seller-phone-preview"
      console.log(`  ${id}: ${JSON.stringify(r)}`)
      if (!r.styleSame) fail(`${id}: the link's type or colour differs from its neighbours`)
      if (Math.abs(r.baselineDelta) > 0.5 && r.sameLine) fail(`${id}: baseline off by ${r.baselineDelta}px`)
      if (r.overflowX > 0) fail(`${id}: page wider than the window by ${r.overflowX}px`)
      if (id.startsWith("seller")) {
        if (!phone) {
          if (!r.sameLine) fail(`${id}: Cookie preferences is not on the row`)
          if (r.lines !== 1) fail(`${id}: the links take ${r.lines} lines`)
          if (!(r.poweredLeftOf > 0)) fail(`${id}: the links are not to the right of Powered by`)
        } else {
          if (!(r.poweredAbove >= 0)) fail(`${id}: Powered by is not above the links`)
          if (r.lineOffCentre.some((d) => Math.abs(d) > 1)) fail(`${id}: a line of links is off centre by ${r.lineOffCentre}`)
        }
        if (new Set(r.gaps).size > 1) fail(`${id}: uneven gaps ${r.gaps}`)
      }
      if (id === "site" && width >= 640 && !r.sameLine) fail(`site: the link is not on the copyright's line`)
      if (id === "marketing" && (r.pitch.length !== 1 || r.lefts.length !== 1)) fail(`marketing: the Support column is uneven, pitch ${r.pitch}, left edges ${r.lefts}`)
    }
    await page.close()
  }
} finally {
  await browser.close()
  rmSync(dir, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} failed` : "\nall held")
process.exit(broken ? 1 : 0)
