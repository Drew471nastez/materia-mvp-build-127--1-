/**
 * ===========================================================================
 *  ROUND 68: EVERY FILLED BUTTON'S LABEL READS ON ITS FILL, IN EVERY TEMPLATE
 * ===========================================================================
 * Opens the prerendered websites (public/theme-previews, built by
 * scripts/build-template-previews.ts) in headless Chromium and, on each
 * template's home, a product page and the cart at 1280 and 390, reads every
 * visible button and button-like link: the label's colour against the first
 * opaque background behind it (WCAG contrast), at rest and while the pointer
 * is on it.
 *
 *   LOW      a filled button's label under 4.5:1 (3:1 for large text) (a gradient fill is
 *            measured at its middle, where the label sits)
 *   ORANGE   a dark label on a saturated orange or red fill (hue under 45 or
 *            over 340, chroma 110 or more), the look the owner asked to be
 *            rid of ("button text black on that orange button")
 *
 *   node scripts/check-button-labels-r68.mjs [slug ...]
 *
 * tests/theme-templates-r68.test.ts checks the template data and
 * lib/storelib-theme/compat/button-label.ts by the same rules.
 */
import { createRequire } from "node:module"
import { createServer } from "node:http"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { extname, join, normalize } from "node:path"

const { chromium } = createRequire(import.meta.url)("playwright")
const PUBLIC = join(process.cwd(), "public")
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg" }
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "")
  const file = join(PUBLIC, path)
  if (!file.startsWith(PUBLIC) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end() }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const BASE = `http://127.0.0.1:${server.address().port}/theme-previews`
const ROOT = join(PUBLIC, "theme-previews")
const slugs = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(ROOT).filter((d) => !d.startsWith("_") && existsSync(join(ROOT, d, "index.html")))
const browser = await chromium.launch()
const failures = []
/* Text buttons with no fill of their own (a link over a section, a quantity +): reported, not counted, since the colour behind them is the section's. */
const unfilled = []
let measured = 0

const READ = `(hover) => {
  /* rgb(), rgba() and color(srgb r g b / a), the last in 0 to 1 */
  /* Any other colour (lch(), oklch() from a relative colour) is read back through a canvas pixel. */
  const cx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  const viaCanvas = (s) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = s; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255] }
  const rgb = (s) => { if (/^(ok)?l(ch|ab)\\(/.test(s)) return viaCanvas(s); const m = s.match(/[\\d.]+/g); if (!m) return [0, 0, 0, 0]; const n = m.map(Number); return /^color\\(srgb/.test(s) ? [n[0] * 255, n[1] * 255, n[2] * 255, n[3] ?? 1] : n }
  /* A vertical gradient behind a centred label: its colour at the middle, between the two stops around 50% (Windows XP style buttons have a light band only at the top edge). */
  const stops = (img) => {
    const st = [...img.matchAll(/(rgba?\\([^)]*\\))\\s*([\\d.]+%)?/g)].map((m, i, all) => ({ c: rgb(m[1]), at: m[2] ? parseFloat(m[2]) : (i / Math.max(1, all.length - 1)) * 100 })).filter((x) => (x.c[3] ?? 1) > 0.9)
    if (st.length < 2) return st.map((x) => x.c)
    const hi = st.findIndex((x) => x.at >= 50); const a = st[Math.max(0, hi - 1)], b = st[Math.max(0, hi)]
    const t = b.at === a.at ? 0 : (50 - a.at) / (b.at - a.at)
    return [[0, 1, 2].map((k) => a.c[k] + (b.c[k] - a.c[k]) * t)]
  }
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
  const hue = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; return h < 0 ? h + 360 : h }
  /* The fill behind the label: the button's own colour, or its own gradient's stops (each is measured), else the first opaque ancestor. Over a picture it is not known, and the button is left out. */
  const bgsOf = (el) => { for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage !== 'none') { const g = /gradient/.test(cs.backgroundImage) ? stops(cs.backgroundImage) : []; if (g.length) return { cs: g, own: e === el }; return null } const c = rgb(cs.backgroundColor); if ((c[3] ?? 1) > 0.9) return { cs: [c], own: e === el } } return { cs: [[255, 255, 255, 1]], own: false } }
  const out = []
  for (const el of document.querySelectorAll('button, a.button, .button, .btn, [class*="btn"]:is(a, button), input[type=submit]')) {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el)
    if (r.width < 24 || r.height < 18 || cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.5 || !el.textContent.trim()) continue
    if (r.bottom < 0 || r.top > document.documentElement.scrollHeight) continue
    if (el.closest('[hidden], dialog:not([open]), .drawer:not(.active), [aria-hidden=true], .visually-hidden, template')) continue
    const label = [...el.querySelectorAll('span, .button__label')].find((s) => s.textContent.trim() && getComputedStyle(s).display !== 'none') ?? el
    const bgs = bgsOf(el); if (!bgs) continue
    const fg = rgb(getComputedStyle(label).color)
    if ((fg[3] ?? 1) < 0.5) continue
    const bg = { c: bgs.cs.reduce((w, c) => (ratio(fg, c) < ratio(fg, w) ? c : w)), own: bgs.own }
    const b = bg.c, chroma = Math.max(b[0], b[1], b[2]) - Math.min(b[0], b[1], b[2]), h = hue(b)
    /* WCAG large text (24px, or 18.66px bold) needs 3:1 */
    const lcs = getComputedStyle(label), px = parseFloat(lcs.fontSize), large = px >= 24 || (px >= 18.66 && Number(lcs.fontWeight) >= 700)
    out.push({ text: el.textContent.trim().replace(/\\s+/g, ' ').slice(0, 30), large, ratio: Math.round(ratio(fg, b) * 100) / 100, filled: bg.own, orange: bg.own && chroma >= 110 && (h < 45 || h >= 340) && lum(fg) < lum(b), fg: fg.slice(0, 3).join(','), bg: b.slice(0, 3).join(','), hover })
  }
  return out
}`

for (const slug of slugs) {
  const dir = join(ROOT, slug)
  const product = existsSync(join(dir, "products")) ? readdirSync(join(dir, "products")).find((f) => f.endsWith(".html")) : null
  const paths = ["index.html", product ? `products/${product}` : null, existsSync(join(dir, "cart.html")) ? "cart.html" : null].filter(Boolean)
  let lowest = Infinity, count = 0
  for (const path of paths) for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" })
    await page.goto(`${BASE}/${slug}/${path}`, { waitUntil: "networkidle" })
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)) } scrollTo(0, 0) })
    await page.waitForTimeout(250)
    const rest = await page.evaluate(`(${READ})(false)`)
    for (const b of rest) {
      count++; measured++; if (b.filled) lowest = Math.min(lowest, b.ratio)
      if (b.ratio < (b.large ? 3 : 4.5) && b.filled) failures.push(`LOW ${slug}/${path} ${width} ${JSON.stringify(b)}`)
      else if (b.ratio < 4.5) unfilled.push(`${slug}/${path} ${width} ${JSON.stringify(b)}`)
      if (b.orange) failures.push(`ORANGE ${slug}/${path} ${width} ${JSON.stringify(b)}`)
    }
    await page.close()
  }
  console.log(`${slug}: ${count} buttons, lowest filled ${lowest === Infinity ? "-" : lowest}`)
}
await browser.close()
server.close()
console.log(`\n${measured} buttons measured, ${failures.length} problems on filled buttons; ${unfilled.length} text buttons without a fill of their own under 4.5:1 (not counted)`)
for (const u of unfilled) console.log(`  text ${u}`)
for (const f of failures) console.log(f)
process.exit(failures.length ? 1 : 0)
