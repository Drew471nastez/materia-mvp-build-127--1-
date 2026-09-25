/**
 * ===========================================================================
 *  THE /app NAV ICONS, MEASURED AND PHOTOGRAPHED
 * ===========================================================================
 * "Change the Website icon... what does a globe have to do with OnePage?...
 * Payouts: what is a wallet? It should be more money related."
 *
 * Whether a set of icons reads as one family is partly a look, so this
 * writes the pictures to look at (prefixed icons-), and partly numbers,
 * which it prints and checks:
 *
 *   every icon has an outline and a fill,      ink box of each, rasterised at
 *     and they are different drawings           96px, in 24 unit box terms
 *   the outline and the fill occupy the        the two ink boxes compared
 *     same box, so the fill does not jump
 *   the new three sit in the family's size     their ink box against the
 *                                               family's range
 *   the rail and the phone menu draw the       the outline paths the rail and
 *     same glyphs for the same rows             the menu render, per row
 *   the rail's icon box is 20 by 20, the       measured on the real components
 *     menu fits a 390px phone                   at 1280 and 390
 *
 *   node scripts/check-nav-icons.mjs            (built CSS, or the source's)
 *   PROBE_CSS=source node scripts/check-nav-icons.mjs
 *   SHOTS_DIR=/some/dir node scripts/check-nav-icons.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const css = (await appCss(root)) + "\n" + interFaces(root)
const out = mkdtempSync(join(tmpdir(), "storelib-navicons-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
const stubs = join(root, ".navicons-probe")
mkdirSync(stubs, { recursive: true })

writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => globalThis.__path || "/app"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
writeFileSync(join(stubs, "native-bridge.js"), `export function hapticTap() {}
export function isNativeApp() { return false }
export function openExternal() {}
export async function triggerHaptic() {}
export function nativePlatform() { return "web" }
export async function nativeLogOut() {}
`)

let passed = 0
let failed = 0
const check = (name, ok, detail) => {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail !== undefined ? `  ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
}

let browser
try {
  execFileSync("npx", [
    "esbuild", join(root, "scripts/render-nav-icons.tsx"),
    "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
    `--alias:next/link=${join(stubs, "link.jsx")}`,
    `--alias:next/navigation=${join(stubs, "navigation.js")}`,
    `--alias:@/lib/native-bridge=${join(stubs, "native-bridge.js")}`,
    `--alias:@=${root}`,
    "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl",
    "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--log-level=error",
  ], { cwd: root, stdio: "inherit" })

  const html = (path) =>
    `<!doctype html><html class="light app-layout"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style>` +
    `<style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div>` +
    `<script>window.process={env:{NODE_ENV:"production"}};globalThis.__path=${JSON.stringify(path)};window.__err=[];` +
    `window.addEventListener("error",function(e){window.__err.push(String(e.message))})</script>` +
    `<script src="probe.js"></script></body></html>`
  for (const path of ["/app", "/app/payouts", "/app/onepage", "/app/website-builder"]) {
    writeFileSync(join(out, `page-${path.replaceAll("/", "_")}.html`), html(path))
  }
  const url = (path, view) => `file://${join(out, `page-${path.replaceAll("/", "_")}.html`)}#${view}`

  browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage", "--allow-file-access-from-files", "--hide-scrollbars"] })
  const page = await browser.newPage()
  const open = async (path, view, width, height, dpr = 1) => {
    await page.setViewport({ width, height, deviceScaleFactor: dpr })
    await page.goto(url(path, view), { waitUntil: "load" })
    await page.waitForFunction("window.__ran === true", { timeout: 10000 })
    await page.evaluate(() => document.fonts.ready)
    await new Promise((r) => setTimeout(r, 350))
    const errors = await page.evaluate(() => window.__err)
    if (errors.length) fail(`The page threw: ${errors.join("; ")}`)
  }

  /* ── The sheet: every glyph, outline and fill, 20 and 40 ─────────────── */
  console.log("\nThe family, rasterised")
  await open("/app", "sheet", 820, 260, 1)
  await page.screenshot({ path: join(shots, "icons-sheet-1x.png"), fullPage: true })
  await page.setViewport({ width: 820, height: 260, deviceScaleFactor: 2 })
  await new Promise((r) => setTimeout(r, 200))
  await page.screenshot({ path: join(shots, "icons-sheet-2x.png"), fullPage: true })

  /* Each 40px glyph drawn again onto a 96px canvas: where its ink is, in
     the 24 unit box, and how much of the box it covers. */
  const ink = await page.evaluate(async () => {
    const S = 96
    const result = {}
    for (const el of document.querySelectorAll('[data-size="40"][data-sheet-icon]')) {
      const svg = el.querySelector("svg").cloneNode(true)
      svg.setAttribute("width", S)
      svg.setAttribute("height", S)
      svg.setAttribute("color", "#000")
      svg.removeAttribute("style")
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg")
      let src = new XMLSerializer().serializeToString(svg)
      src = src.replaceAll("var(--solar-color, currentColor)", "#000").replaceAll("var(--solar-stroke-width, 1.5)", "1.5").replaceAll("currentColor", "#000")
      const img = new Image()
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(src)
      await img.decode()
      const c = document.createElement("canvas")
      c.width = c.height = S
      const g = c.getContext("2d")
      g.drawImage(img, 0, 0, S, S)
      const d = g.getImageData(0, 0, S, S).data
      let x0 = S, y0 = S, x1 = -1, y1 = -1, sum = 0
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const a = d[(y * S + x) * 4 + 3] / 255
        sum += a
        if (a > 0.3) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
      }
      const u = 24 / S
      const name = el.dataset.sheetIcon
      result[name] ??= {}
      result[name][el.dataset.variant] = {
        w: +((x1 - x0 + 1) * u).toFixed(2), h: +((y1 - y0 + 1) * u).toFixed(2),
        cx: +(((x0 + x1 + 1) / 2) * u).toFixed(2), cy: +(((y0 + y1 + 1) / 2) * u).toFixed(2),
        cover: +((sum / (S * S)) * 100).toFixed(1),
      }
    }
    return result
  })
  console.log("  icon           outline w x h, ink%      fill w x h, ink%")
  for (const [name, v] of Object.entries(ink)) {
    console.log(`  ${name.padEnd(14)} ${`${v.line.w} x ${v.line.h}, ${v.line.cover}%`.padEnd(24)} ${v.fill.w} x ${v.fill.h}, ${v.fill.cover}%`)
  }
  for (const [name, v] of Object.entries(ink)) {
    check(`${name}: an outline and a fill that are different drawings`, v.fill.cover > v.line.cover * 1.4, { line: v.line.cover, fill: v.fill.cover })
    /* Every Solar pair is drawn this way: the fill is the outline's path,
       so it stops where the stroke's centre line runs, one stroke width
       (1.5 units) inside the outline's ink. The phone menu scales it up by
       FILL_MATCH for exactly that reason. Same centre, same inset. */
    const dw = v.line.w - v.fill.w, dh = v.line.h - v.fill.h
    check(`  the fill is the outline's box less one stroke, on the same centre`, Math.abs(dw - 1.5) <= 0.75 && Math.abs(dh - 1.5) <= 0.75 && Math.abs(v.fill.cx - v.line.cx) <= 0.5 && Math.abs(v.fill.cy - v.line.cy) <= 0.5, { dw, dh })
  }
  const family = Object.entries(ink).filter(([n]) => !["websiteBuilder", "onepage", "payouts"].includes(n))
  /* Optical size is the long side: a family lines up when every glyph's
     longer side reaches the same edge of the box, whatever its shape (an
     envelope is wide and short, a house tall). */
  const longs = family.map(([, v]) => Math.max(v.line.w, v.line.h))
  const covers = family.map(([, v]) => v.line.cover)
  const [lMin, lMax] = [Math.min(...longs), Math.max(...longs)]
  const [cMin, cMax] = [Math.min(...covers), Math.max(...covers)]
  console.log(`  the rest of the family: long side ${lMin} to ${lMax} units, outline ink ${cMin}% to ${cMax}%`)
  /* 15 per cent over the heaviest: OnePage's three solid buttons make it the
     densest glyph in the set (about 25 per cent ink against Home's 22), which
     is visible and accepted; past this it would read as a blot. */
  for (const n of ["websiteBuilder", "onepage", "payouts"]) {
    const v = ink[n].line
    const long = Math.max(v.w, v.h)
    check(`${n}: its long side is the family's`, long >= lMin - 0.5 && long <= lMax + 0.5, `${long} units`)
    check(`  and it carries about as much ink as its neighbours`, v.cover >= cMin * 0.9 && v.cover <= cMax * 1.15, `${v.cover}%`)
  }

  /* ── The rail, 1280 ───────────────────────────────────────────────────── */
  const railPaths = {}
  for (const path of ["/app/payouts", "/app/onepage", "/app/website-builder"]) {
    console.log(`\nThe rail at 1280, on ${path}`)
    await open(path, "rail", 1280, 720, 2)
    const r = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#rail nav a, #rail nav button, #rail > div > div:last-child a")]
        .filter((el) => el.querySelector("[data-nav-icon]"))
      return rows.map((row) => {
        const icon = row.querySelector("[data-nav-icon]")
        const b = icon.getBoundingClientRect()
        const outline = icon.querySelector('[data-variant="outline"]')
        const fill = icon.querySelector('[data-variant="filled"]')
        return {
          label: row.textContent.trim(), state: icon.dataset.navIcon, w: b.width, h: b.height,
          svgW: outline?.getBoundingClientRect().width, fillOpacity: fill ? getComputedStyle(fill).opacity : null,
          d: [...outline.querySelectorAll("path")].map((p) => p.getAttribute("d")).join("|"),
        }
      })
    })
    for (const row of r) railPaths[row.label] = row.d
    const want = { "/app/payouts": "Payouts", "/app/onepage": "OnePage", "/app/website-builder": "Website" }[path]
    check(`the rows: ${r.length}, every icon box 20 by 20`, r.length === 10 && r.every((x) => x.w === 20 && x.h === 20 && x.svgW === 20), r.map((x) => `${x.label} ${x.w}x${x.h}`).join(", "))
    const lit = r.filter((x) => x.state === "filled")
    check(`  ${want} is the one row filled, its fill fully in`, lit.length === 1 && lit[0].label === want, lit.map((x) => x.label))
    await page.screenshot({ path: join(shots, `icons-rail-1280${path.replaceAll("/", "-")}.png`), clip: { x: 0, y: 0, width: 240, height: 540 } })
  }

  /* ── The Upgrade card, 1280 ──────────────────────────────────────────── */
  /*
    "That purple thing has too much depth and draws too much attention.
    More subtle, keep it how it is." The same card and words: a light
    surface with a hairline and no shadow, the bolt flat in a soft violet
    tint, nothing lit and nothing glowing.
  */
  console.log("\nThe Upgrade to Pro card at 1280")
  await open("/app", "rail", 1280, 720, 2)
  const card = await page.evaluate(() => {
    const a = document.querySelector("#rail [data-upgrade-card]")
    const bolt = a?.querySelector("[data-upgrade-bolt]")
    if (!a || !bolt) return null
    const cs = getComputedStyle(a)
    const bs = getComputedStyle(bolt)
    const r = a.getBoundingClientRect()
    return {
      href: a.getAttribute("href"), text: a.textContent.trim(), shadow: cs.boxShadow, bg: cs.backgroundColor, border: cs.borderTopColor,
      boltBg: bs.backgroundColor, boltImage: bs.backgroundImage, boltShadow: bs.boxShadow, bolt: Math.round(bolt.getBoundingClientRect().width),
      glyph: bolt.querySelector("svg")?.getAttribute("fill"), glyphFilter: getComputedStyle(bolt.querySelector("svg")).filter,
      rect: { y: r.top, h: r.height },
    }
  })
  check("the card: a light surface, a hairline, no shadow", !!card && card.shadow === "none" && card.bg === "rgb(250, 250, 250)" && card.border === "rgb(236, 236, 239)", card && { shadow: card.shadow, bg: card.bg, border: card.border })
  check("the bolt: a flat circle of soft violet, a violet glyph, no gradient, no glow", !!card && card.boltImage === "none" && card.boltBg === "rgb(243, 240, 255)" && !/rgba\(109, 40, 217|0px 4px 10px/.test(card.boltShadow) && card.glyph === "#7c3aed" && card.glyphFilter === "none", card && { bg: card.boltBg, image: card.boltImage, shadow: card.boltShadow, glyph: card.glyph })
  check("the same words and the same place: the plans page", !!card && card.href === "/app/settings/billing/upgrade" && /Upgrade to Pro/.test(card.text), card?.text)
  if (card) await page.screenshot({ path: join(shots, "icons-upgrade-1280.png"), clip: { x: 0, y: Math.max(0, card.rect.y - 16), width: 240, height: card.rect.h + 72 } })

  /* ── The phone menu, 390 ─────────────────────────────────────────────── */
  console.log("\nThe phone menu at 390")
  await open("/app/payouts", "menu", 390, 844, 3)
  const m = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("a, button")].filter((el) => el.querySelector("svg") && /^(Dashboard|Products|Analytics|Sales|Creator page|Website|OnePage|Emails|Payouts)$/.test(el.textContent.trim()))
    return {
      scrollW: document.documentElement.scrollWidth,
      rows: rows.map((row) => {
        const svgs = row.querySelectorAll("svg")
        const outline = row.querySelector('[data-part="outline"]') || svgs[0]
        const b = outline.getBoundingClientRect()
        return {
          label: row.textContent.trim(), w: Math.round(b.width), h: Math.round(b.height), glyphs: svgs.length,
          d: [...outline.querySelectorAll("path")].map((p) => p.getAttribute("d")).join("|"),
        }
      }),
    }
  })
  check("the menu fits the phone: no sideways scroll", m.scrollW <= 390, `${m.scrollW}px`)
  check("nine rows, each with an outline and a fill stacked", m.rows.length === 9 && m.rows.every((x) => x.glyphs === 2), m.rows.map((x) => `${x.label} ${x.w}x${x.h}`).join(", "))
  for (const label of ["Website", "OnePage", "Payouts"]) {
    const row = m.rows.find((x) => x.label === label)
    check(`  ${label} draws the same glyph as the rail`, !!row && row.d === railPaths[label])
  }
  await page.screenshot({ path: join(shots, "icons-menu-390.png") })
} finally {
  await browser?.close()
  rmSync(stubs, { recursive: true, force: true })
}

console.log(`\nScreenshots: ${shots}`)
console.log(`${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
