/**
 * ===========================================================================
 *  WHY WORDS AND BUTTONS GLOW WHITE, THEME BY THEME (round AS)
 * ===========================================================================
 * The owner: "I don't understand why certain buttons, texts are glowing
 * white, like why they have glow ... for some there is glowing".
 *
 * Every theme's live page (scripts/render-onepage-editor.tsx ?live&template=
 * <id>&creator: its card's creator, a link with a picture, a product, a
 * newsletter, a plain link), after the legibility guard has run. Every
 * element is read for a light glow: a text-shadow, a box-shadow or a
 * drop-shadow that is pale (luminance over 0.6), at least 30% opaque, barely
 * offset (2px or less) and blurred 6px or more. Each is put down to where
 * it comes from:
 *
 *   guard     lib/onepage/legible's outline, written on the element
 *             (data-op-legible carries "h")
 *   ring      the avatar's Glowing ring (laser_glow_enabled), its blurred
 *             conic layers
 *   skin      a skin's stylesheet (theme-skins.css, [data-op-skin])
 *   glow      the Glow animation (.animate-onepage-glow), at its widest
 *   page      anything else
 *
 * And the Glow the creator picks on a block, measured at its widest
 * (blur and opacity of the keyframe at 50%).
 *
 *   node scripts/check-onepage-glow-as1.mjs                 every theme, a table
 *   THEMES=aero,air OUT=/some/file.json node scripts/check-onepage-glow-as1.mjs
 */
import { existsSync, writeFileSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const ONLY = process.env.THEMES ? process.env.THEMES.split(",") : null

const { base, server } = await serveEditorProbe({ root, fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const p = await browser.newPage()
await p.setViewport({ width: 390, height: 1400, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
await p.setRequestInterception(true)
p.on("request", (req) => {
  const u = new URL(req.url())
  if (u.protocol === "data:" || u.origin === base) return req.continue()
  return req.abort()
})

/* The theme ids, from the editor's own catalogue. */
await p.goto(`${base}/app/onepage#design`)
await p.waitForSelector('[data-nav-row="theme"]', { timeout: 60000 })
await sleep(500)
await p.tap('[data-nav-row="theme"]')
await p.waitForSelector("[data-theme-card]")
const ids = ONLY ?? (await p.evaluate(() => [...document.querySelectorAll("[data-theme-card]")].map((c) => c.getAttribute("data-theme-card"))))

function scan() {
  const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  /* Each shadow of a list: its colour, offsets and blur. */
  const shadows = (v) => {
    if (!v || v === "none") return []
    const out = []
    for (const part of v.split(/,(?![^(]*\))/)) {
      const c = part.match(/rgba?\(([^)]+)\)/)
      if (!c) continue
      const [r, g, b, a = 1] = c[1].split(/[ ,/]+/).filter(Boolean).map(Number)
      const nums = part.replace(c[0], "").match(/-?[\d.]+px/g)?.map(parseFloat) ?? []
      const [x = 0, y = 0, blur = 0] = nums
      out.push({ r, g, b, a, x, y, blur })
    }
    return out
  }
  const glowing = (s) => s.a >= 0.3 && lum(s.r, s.g, s.b) > 0.6 && Math.abs(s.x) <= 2 && Math.abs(s.y) <= 2 && s.blur >= 6
  const found = []
  for (const el of document.querySelectorAll(".onepage-live *, [data-op-skin] *")) {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    const cs = getComputedStyle(el)
    const what = el.closest("[data-page-avatar]") ? "avatar" : el.closest("[data-op-header], [data-hero-header]") ? (el.tagName === "H1" ? "name" : "header") : el.closest(".op-btn, [data-product-cta], button") ? "button" : el.closest("[data-email-layout]") ? "newsletter" : el.closest("[data-product-block]") ? "product" : "page"
    const add = (prop, s, source) => found.push({ what, prop, source, blur: s.blur, alpha: Math.round(s.a * 100) / 100, words: (el.textContent || "").trim().slice(0, 24) })
    for (const s of shadows(cs.textShadow).filter(glowing)) add("text-shadow", s, (el.getAttribute("data-op-legible") || "").includes("h") ? "guard" : "skin")
    for (const s of shadows(cs.boxShadow).filter(glowing)) add("box-shadow", s, el.classList.contains("animate-onepage-glow") ? "glow" : el.closest("[data-op-skin]") ? "skin" : "page")
    const drops = [...(cs.filter || "").matchAll(/drop-shadow\(([^)]*\))[^)]*\)/g)].map((m) => m[0].replace(/^drop-shadow\(|\)$/g, ""))
    for (const d of drops) for (const s of shadows(d).filter(glowing)) add("drop-shadow", s, "skin")
    /* The Glowing ring: blurred conic layers turning round the avatar. */
    if (/conic-gradient/.test(cs.backgroundImage) && /blur\(/.test(cs.filter) && el.closest("[data-page-avatar]")) {
      const c = cs.backgroundImage.match(/rgba?\(([^)]+)\)/g)?.pop()
      const [rr, gg, bb] = (c?.match(/[\d.]+/g) ?? [0, 0, 0]).map(Number)
      found.push({ what: "avatar", prop: "ring", source: "ring", blur: parseFloat(cs.filter.match(/blur\(([\d.]+)/)?.[1] ?? "0"), alpha: Number(cs.opacity), light: lum(rr, gg, bb) > 0.6, words: "" })
    }
  }
  return found
}

const rows = []
for (const id of ids) {
  await p.goto(`${base}/app/onepage?live&template=${id}&creator`)
  await p.waitForSelector("[data-op-header], [data-hero-header]", { timeout: 30000 })
  /* The guard runs after the page is drawn and again as it settles. */
  await sleep(1600)
  const found = await p.evaluate(scan)
  const by = {}
  for (const f of found) {
    const k = `${f.source}:${f.what}:${f.prop}`
    by[k] = by[k] ? { ...by[k], n: by[k].n + 1, blur: Math.max(by[k].blur, f.blur) } : { ...f, n: 1 }
  }
  const list = Object.values(by)
  rows.push({ id, glows: list })
  console.log(`  ${list.length ? "GLOW" : "none"}  ${id.padEnd(12)} ${list.map((g) => `${g.source} ${g.prop} on ${g.what} x${g.n} (blur ${g.blur}px, ${g.alpha})`).join("; ")}`)
}

/* The Glow animation a creator picks for a block, at its widest. */
const animation = await p.evaluate(() => {
  for (const sheet of document.styleSheets) {
    let rules
    try { rules = sheet.cssRules } catch { continue }
    for (const r of rules) if (r.type === CSSRule.KEYFRAMES_RULE && r.name === "onepage-glow") return [...r.cssRules].map((k) => `${k.keyText}: ${k.style.boxShadow}`).join(" | ")
  }
  return null
})
console.log(`\nThe Glow animation's keyframes: ${animation}`)

const totals = {}
for (const r of rows) for (const g of r.glows) totals[g.source] = (totals[g.source] ?? 0) + 1
console.log(`\n${rows.filter((r) => r.glows.length).length} of ${rows.length} themes draw a light glow; by source: ${JSON.stringify(totals)}`)
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ rows, animation }, null, 1))
await browser.close()
server.close()
