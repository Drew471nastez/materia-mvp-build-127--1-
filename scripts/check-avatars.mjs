/**
 * ===========================================================================
 *  NO AVATAR IS A "?", AND NONE IS EMPTY
 * ===========================================================================
 * scripts/render-avatars.tsx at 390x844 and 1440x900, on three themes: a
 * white page, a dark creator theme, and a creator's own colours.
 *
 * The owner's instruction was that a person with no account picture still has
 * to show something. Every public surface that draws a face is measured here
 * with the six authors one can have: a photo, no photo, a one word name, no
 * name at all, a photo whose address 404s, and a photo whose host never
 * answers.
 *
 *   NOTHING IS A "?"     not in an avatar, not anywhere on the page
 *   NOTHING IS EMPTY     every circle holds letters, a person, or a picture
 *   THE LETTERS CARRY    measured against what is actually behind them,
 *                        composited through every painted ancestor
 *
 *   PROBE_CSS=source SHOTS=/some/dir node scripts/check-avatars.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".avatars-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => location.pathname
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-avatars.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const sheet = await appCss(root)
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${interFaces(root)}</style><style>${sheet}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

const CREATOR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" fill="#e8d5c4"/><circle cx="48" cy="38" r="18" fill="#6b4a3a"/><rect x="18" y="62" width="60" height="40" rx="20" fill="#35506b"/></svg>'
/** Requests deliberately left unanswered, cut loose at the end so the server can close. */
const hanging = []
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  if (url.pathname === "/creator.png") { res.writeHead(200, { "content-type": "image/svg+xml" }); res.end(CREATOR_SVG); return }
  if (url.pathname === "/gone.png") { res.writeHead(404); res.end("gone"); return }
  if (url.pathname === "/slow.png") { hanging.push(res); return }
  if (url.pathname.startsWith("/api/")) { res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); return }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
  if (!ok) broken++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

/**
 * EVERY CIRCLE ON THE PAGE, whichever component drew it: the shared avatar
 * (`[data-app-avatar]`), Radix's (`[data-slot="avatar"]`), and the bars' own
 * marks. `empty` is the failure the whole sweep is about: a circle with a
 * size and nothing inside it.
 */
const SCAN = `(() => {
  const luminance = (r, g, b) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  /*
    ANY COLOUR THE PAGE ACTUALLY USES, not just the ones written rgb().

    The first version of this read rgba() with a regex and returned null
    for anything else. The design tokens are oklch(), so every bg-muted
    in the tree parsed as null, was skipped as nothing painted here, and
    the measurement quietly read the colour BEHIND a solid disc. It passed a
    bar whose initials were white on a near-white circle. So the browser
    resolves the string, through a canvas, which speaks every colour syntax
    it can render; anything that still will not resolve is reported rather
    than skipped.
  */
  const unresolved = []
  const pad = document.createElement("canvas")
  pad.width = 1
  pad.height = 1
  const ctx = pad.getContext("2d", { willReadFrequently: true })
  const parse = (c) => {
    if (!c) return null
    const direct = c.match(/rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?/)
    if (direct) return { r: +direct[1], g: +direct[2], b: +direct[3], a: direct[4] === undefined ? 1 : +direct[4] }
    if (c === "transparent" || c === "none") return { r: 0, g: 0, b: 0, a: 0 }
    /* Painted and read back: the only thing that speaks every colour syntax. */
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = "#010101"
    ctx.fillStyle = c
    if (ctx.fillStyle === "#010101") { unresolved.push(c); return null }
    ctx.fillRect(0, 0, 1, 1)
    const d = ctx.getImageData(0, 0, 1, 1).data
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }
  }
  const over = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  })
  const behind = (el) => {
    let out = { r: 255, g: 255, b: 255, a: 1 }
    const chain = []
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) chain.push(n)
    for (const n of chain.reverse()) {
      const c = parse(getComputedStyle(n).backgroundColor)
      if (c && c.a > 0) out = over(c, out)
    }
    return out
  }
  const ratio = (fg, bg) => {
    const a = luminance(fg.r, fg.g, fg.b) + 0.05
    const b = luminance(bg.r, bg.g, bg.b) + 0.05
    return Math.round((Math.max(a, b) / Math.min(a, b)) * 100) / 100
  }
  const sel = "[data-app-avatar], [data-slot='avatar'], [data-bar-avatar]"
  const avatars = [...document.querySelectorAll(sel)].map((el) => {
    const box = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    const surface = el.closest("[data-surface]")
    const text = (el.textContent || "").trim()
    const svg = el.querySelector("svg")
    const img = el.querySelector("img")
    const shown = !!img && getComputedStyle(img).opacity !== "0" && img.naturalWidth > 0
    /* The ink of the mark itself, and the ground the mark sits on, which
       includes the fallback's own disc where Radix paints one. */
    const inked = svg || el.querySelector("[data-slot='avatar-fallback'], span[aria-hidden]") || el
    const ink = parse(getComputedStyle(inked).color) || { r: 0, g: 0, b: 0, a: 1 }
    const ground = behind(inked)
    return {
      surface: surface ? surface.getAttribute("data-surface") : "bar",
      w: Math.round(box.width),
      h: Math.round(box.height),
      hidden: style.display === "none" || style.visibility === "hidden" || box.width === 0,
      text,
      glyph: !!svg,
      photo: shown,
      empty: box.width > 0 && !text && !svg && !shown,
      contrast: text || svg ? ratio(over(ink, ground), ground) : null,
      ground: "rgb(" + [ground.r, ground.g, ground.b].map(Math.round).join(", ") + ")",
      ink: getComputedStyle(inked).color,
    }
  })
  return { avatars, unresolved: [...new Set(unresolved)] }
})()`

const VIOLET_SCAN = `(() => {
  const out = []
  const violet = (c) => {
    const m = c && c.match(/rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?/)
    if (!m) return false
    const [r, g, b] = [m[1], m[2], m[3]].map(Number)
    const a = m[4] === undefined ? 1 : Number(m[4])
    if (a < 0.05) return false
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    if (max - min < 40) return false
    let h
    if (max === r) h = ((g - b) / (max - min)) % 6
    else if (max === g) h = (b - r) / (max - min) + 2
    else h = (r - g) / (max - min) + 4
    h = (h * 60 + 360) % 360
    return h >= 250 && h <= 295
  }
  for (const el of document.querySelectorAll("body *")) {
    const s = getComputedStyle(el)
    if (s.display === "none" || s.visibility === "hidden") continue
    for (const p of ["color", "backgroundColor", "borderTopColor"]) {
      if (p === "color" && !el.childNodes.length) continue
      if (p.startsWith("border") && parseFloat(s.borderTopWidth) === 0) continue
      if (violet(s[p])) out.push(el.tagName.toLowerCase() + " " + p + " " + s[p])
    }
  }
  return out
})()`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const VIEWPORTS = [["390x844", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ["1440x900", { width: 1440, height: 900, deviceScaleFactor: 1 }]]
const THEMES = ["light", "dark", "custom"]

try {
  for (const [size, vp] of VIEWPORTS) {
    for (const theme of THEMES) {
      console.log(`\nEvery face on the ${theme} theme at ${size}`)
      const page = await browser.newPage()
      await page.setViewport(vp)
      /* One picture is left hanging on purpose, so the network never falls idle. */
      await page.goto(`${base}/?theme=${theme}`, { waitUntil: "domcontentloaded" })
      await wait(1400)

      const text = await page.evaluate(() => document.getElementById("app")?.textContent || "")
      expect(!text.includes("?"), `${theme} ${size}: not one question mark on the page`, text.match(/.{0,24}\?.{0,24}/)?.[0] || "")

      const scan = await page.evaluate(SCAN)
      expect(scan.unresolved.length === 0, "every colour on the page could be read", scan.unresolved.join(" | "))
      const drawn = scan.avatars.filter((a) => !a.hidden)
      expect(drawn.length >= 30, "every surface drew its six people", `${drawn.length} circles`)

      const empties = drawn.filter((a) => a.empty)
      expect(empties.length === 0, "no circle is empty", JSON.stringify(empties.slice(0, 4)))

      const round = drawn.every((a) => a.w === a.h)
      expect(round, "every circle keeps its box", JSON.stringify(drawn.filter((a) => a.w !== a.h).slice(0, 3)))

      /* The person with no name gets the glyph on every surface that draws them. */
      const glyphs = drawn.filter((a) => a.glyph && !a.text)
      expect(glyphs.length >= 5, "a person with no name is a plain person, on every surface", `${glyphs.length}`)

      /* A photo that 404s and one that never answers both still say who it is. */
      const letters = drawn.filter((a) => a.text)
      expect(letters.every((a) => /^[A-Z]{1,2}$/.test(a.text)), "what is written is initials and nothing else", JSON.stringify([...new Set(letters.map((a) => a.text))]))

      const marks = drawn.filter((a) => a.contrast !== null)
      const worst = marks.reduce((lo, a) => (a.contrast < lo ? a.contrast : lo), 99)
      const low = marks.filter((a) => a.contrast < 4.5)
      expect(low.length === 0, `the marks carry on the ${theme} theme (worst ${worst}:1)`, JSON.stringify(low.slice(0, 4)))

      const violet = await page.evaluate(VIOLET_SCAN)
      expect(violet.length === 0, "nothing violet", violet.slice(0, 3).join(" | "))
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow <= 0, "nothing scrolls sideways", `${overflow}px`)

      if (SHOTS) await page.screenshot({ path: join(SHOTS, `avatars-${theme}-${size}.png`), fullPage: true })
      await page.close()
    }
  }
} finally {
  await browser.close()
  for (const res of hanging) res.destroy()
  server.close()
}

console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
