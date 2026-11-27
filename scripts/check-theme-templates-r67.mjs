/**
 * ===========================================================================
 *  ROUND 67: OCTAVO, THE EBOOK, THE VSL FUNNEL AND DIGITAL STUDIO, MEASURED
 * ===========================================================================
 * Measures the prerendered websites (public/theme-previews, run
 * scripts/build-template-previews.ts first) in headless Chromium:
 *
 *   BUTTONS   every visible button and button-like link on Octavo's home, a
 *             product page and its FAQ page has text at 4.5:1 or more against
 *             its own background (the owner saw orange buttons with black text)
 *   TYPE      the heading font each template draws with, read from the page:
 *             Octavo Schibsted Grotesk, Ebook Manrope at 800, VSL funnel Plus
 *             Jakarta Sans, and none of them Libre Baskerville
 *   ALIGN     on Octavo's home and a product page at 390, 768, 1280 and 1440, every section's first heading
 *             (the picture, for how it works) starts on the same left edge as the shelves (2px)
 *   COUNTS    a count's label does not move while its number counts up
 *   NAMES     no page of Digital studio says Wren or Ren Studio, no page of the
 *             VSL funnel says Fullbook or referrals
 *
 *   node scripts/check-theme-templates-r67.mjs
 *
 * tests/theme-templates-r67.test.ts checks the same rules in the files.
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
const browser = await chromium.launch()
const failures = []
let checks = 0
const expect = (label, ok, detail) => { checks++; if (!ok) failures.push(`${label} ${JSON.stringify(detail ?? "").slice(0, 400)}`) }

async function open(path, width = 1280, reduced = true) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: reduced ? "reduce" : "no-preference" })
  await page.goto(`${BASE}/${path}`, { waitUntil: "networkidle" })
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)) } scrollTo(0, 0) })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)
  return page
}

/* Contrast of a button's text on the first opaque background behind it (WCAG relative luminance). */
const CONTRAST = `() => {
  const rgb = (s) => { const m = s.match(/[\\d.]+/g); return m ? m.map(Number) : [0, 0, 0, 0] }
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if ((c[3] ?? 1) > 0.9) return c } return [255, 255, 255, 1] }
  const out = []
  for (const el of document.querySelectorAll('button, a.button, .button, [class*="btn"]:is(a, button), input[type=submit]')) {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el)
    if (r.width < 24 || r.height < 18 || cs.visibility === 'hidden' || cs.display === 'none' || !el.textContent.trim()) continue
    if (el.closest('[hidden], dialog:not([open]), .drawer:not(.active), [aria-hidden=true]')) continue
    const label = el.querySelector('span, .button__label') ?? el
    const fg = rgb(getComputedStyle(label).color), bg = bgOf(el)
    const a = lum(fg), b = lum(bg)
    out.push({ text: el.textContent.trim().slice(0, 30), ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100, fg: fg.slice(0, 3).join(','), bg: bg.slice(0, 3).join(',') })
  }
  return out
}`

/* BUTTONS */
for (const path of ["notion-template-shop/index.html", "notion-template-shop/products/recall-cards.html", "notion-template-shop/products/home-admin.html", "notion-template-shop/pages/faqs.html"]) {
  if (!existsSync(join(PUBLIC, "theme-previews", path))) { expect(`BUTTONS ${path} exists`, false); continue }
  for (const width of [1280, 390]) {
    const page = await open(path, width)
    const buttons = await page.evaluate(`(${CONTRAST})()`)
    const low = buttons.filter((b) => b.ratio < 4.5)
    expect(`BUTTONS ${path} ${width} every button 4.5:1`, low.length === 0, low)
    expect(`BUTTONS ${path} ${width} has buttons`, buttons.length > 0)
    console.log(`BUTTONS ${path} ${width}: ${buttons.length} buttons, lowest ${Math.min(...buttons.map((b) => b.ratio))}`)
    await page.close()
  }
}

/* TYPE */
for (const [slug, family, weight] of [["notion-template-shop", "Schibsted Grotesk", 600], ["author-book", "Manrope", 800], ["vsl-funnel", "Plus Jakarta Sans", 800]]) {
  const page = await open(`${slug}/index.html`)
  const h = await page.evaluate(() => { const el = document.querySelector("main h1, main h2"); const cs = getComputedStyle(el); return { family: cs.fontFamily, weight: Number(cs.fontWeight), loaded: document.fonts.check(`${cs.fontWeight} 40px ${cs.fontFamily.split(",")[0]}`) } })
  expect(`TYPE ${slug} heading in ${family}`, h.family.startsWith(`"${family}"`) || h.family.startsWith(family), h)
  expect(`TYPE ${slug} heading weight ${weight}`, h.weight === weight, h)
  expect(`TYPE ${slug} heading font loaded`, h.loaded, h)
  expect(`TYPE ${slug} no Libre Baskerville`, !/Baskerville/.test(h.family), h)
  console.log(`TYPE ${slug}: ${h.family.split(",")[0]} ${h.weight} loaded=${h.loaded}`)
  await page.close()
}

/* ALIGN */
for (const [path, anchor] of [["notion-template-shop/index.html", "study"], ["notion-template-shop/products/recall-cards.html", "more"]]) for (const width of [390, 768, 1280, 1440]) {
  const page = await open(path, width)
  const lefts = await page.evaluate(() => [...document.querySelectorAll("main .shopify-section")].map((s) => { const el = s.querySelector(".iws__media") ?? s.querySelector("h1, h2"); return el ? [s.id.replace("shopify-section-", ""), Math.round(el.getBoundingClientRect().left)] : null }).filter(Boolean))
  const shelf = lefts.find(([id]) => id === anchor)?.[1]
  const off = lefts.filter(([id, l]) => id !== "newsletter" && Math.abs(l - shelf) > 2)
  expect(`ALIGN ${path} ${width} headings on the shelves' edge`, off.length === 0, { shelf, off })
  console.log(`ALIGN ${path} ${width}: shelf ${shelf}, ${JSON.stringify(lefts)}`)
  await page.close()
}

/* COUNTS: the label beside a count keeps its place from 0 to the final number. */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(`${BASE}/notion-template-shop/index.html`, { waitUntil: "networkidle" })
  const samples = await page.evaluate(async () => {
    /* Measured from its own item, so the section's reveal moving the whole row is not counted. */ const label = document.querySelector(".stat-counter__label"); const xs = new Set()
    const t0 = performance.now()
    while (performance.now() - t0 < 2400) { xs.add(Math.round((label.getBoundingClientRect().left - label.parentElement.getBoundingClientRect().left) * 10) / 10); await new Promise((r) => requestAnimationFrame(r)) }
    return { xs: [...xs], text: document.querySelector(".stat-counter__number").textContent }
  })
  expect("COUNTS octavo label still while counting", samples.xs.length === 1, samples)
  console.log(`COUNTS octavo: label lefts ${JSON.stringify(samples.xs)}, ends at ${samples.text}`)
  await page.close()
}

/* NAMES */
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : d.name.endsWith(".html") ? [join(dir, d.name)] : []))
for (const [slug, banned] of [["digital-studio", /\bW?ren Studio\b|wrenstudio/i], ["vsl-funnel", /Fullbook|referral|freelancer/i]]) {
  const hits = walk(join(PUBLIC, "theme-previews", slug)).filter((f) => banned.test(readFileSync(f, "utf8").replace(/<script[\s\S]*?<\/script>/g, (s) => (banned.test(s) ? s : ""))))
  expect(`NAMES ${slug}`, hits.length === 0, hits.map((f) => f.slice(PUBLIC.length)))
  console.log(`NAMES ${slug}: ${hits.length} pages with the old name`)
}

await browser.close()
server.close()
console.log(failures.length ? `\n${failures.length} of ${checks} failed:\n${failures.join("\n")}` : `\nall ${checks} checks passed`)
process.exit(failures.length ? 1 : 0)
