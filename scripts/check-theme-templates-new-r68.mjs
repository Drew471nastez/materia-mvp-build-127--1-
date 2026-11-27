// Round 68: the two new templates (LUT shop and Challenge funnel) measured in Chromium on their prerendered previews
// (public/theme-previews/<slug>/, scripts/build-template-previews.ts), every page at a phone's 390 and at 1440:
//
//   overflow   the page is no wider than the screen
//   pictures   no picture failed to load (each one scrolled into view first)
//   buttons    every visible filled button's text against its own background, as drawn, at 4.5:1 or more
//   errors     no script error on the page
//
//   node scripts/check-theme-templates-new-r68.mjs [--shots DIR]
//
// --shots DIR also writes each page whole at deviceScaleFactor 2, viewport by viewport as a person scrolls it, stitched
// (a full page capture drops pictures that are their own layer), for people to look at.
import { createRequire } from "node:module"
import { createServer } from "node:http"
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync } from "node:fs"
import { extname, join, normalize, relative } from "node:path"

const require = createRequire(import.meta.url)
const { chromium } = require("playwright")
const sharp = require("sharp")

const PUBLIC = join(process.cwd(), "public")
const SLUGS = ["lut-shop", "challenge-funnel"]
const shotsAt = process.argv.indexOf("--shots")
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".mp4": "video/mp4" }

const server = createServer((req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "")
  let f = join(PUBLIC, p)
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html")
  if (!f.startsWith(PUBLIC) || !existsSync(f)) { res.writeHead(404); return res.end() }
  res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream" })
  res.end(readFileSync(f))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

const pagesOf = (slug) => {
  const root = join(PUBLIC, "theme-previews", slug)
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "a" ? [] : walk(join(d, e.name))) : e.name.endsWith(".html") ? [join(d, e.name)] : []))
  return walk(root).map((f) => `/theme-previews/${slug}/${relative(root, f)}`).filter((p) => !/\/(account|policies)\//.test(p)).sort()
}

const lum = ([r, g, b]) => { const c = [r, g, b].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] }
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }

const browser = await chromium.launch()
let failures = 0
const say = (ok, line) => { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"}  ${line}`) }
for (const slug of SLUGS) {
  console.log(`\n${slug}`)
  for (const path of pagesOf(slug)) {
    for (const width of [390, 1440]) {
      const vh = width > 900 ? 900 : 844
      const page = await browser.newPage({ viewport: { width, height: vh }, deviceScaleFactor: SHOTS ? 2 : 1, reducedMotion: "reduce" })
      const errors = []
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 140)))
      await page.goto(base + path, { waitUntil: "networkidle", timeout: 60000 }).catch((e) => errors.push(String(e).slice(0, 100)))
      const total = await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 70)) } scrollTo(0, 0); await new Promise((r) => setTimeout(r, 300)); return document.documentElement.scrollHeight })
      const m = await page.evaluate(() => {
        const rgb = (c) => (c.match(/[\d.]+/g) ?? []).map(Number)
        const broken = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute("src") && !i.closest("[hidden],template")).map((i) => i.getAttribute("src").slice(0, 80))
        const buttons = [...document.querySelectorAll("a.button, button.button, .btn, a.btn, button.btn, [class*='btn--primary'], .vfh__btn")].filter((b) => {
          const r = b.getBoundingClientRect(); const cs = getComputedStyle(b)
          return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && b.textContent.trim() && rgb(cs.backgroundColor)[3] !== 0 && !cs.backgroundColor.startsWith("rgba(0, 0, 0, 0)")
        }).map((b) => { const cs = getComputedStyle(b); return { text: b.textContent.trim().slice(0, 40), bg: rgb(cs.backgroundColor).slice(0, 3), fg: rgb(cs.color).slice(0, 3) } })
        return { sw: document.documentElement.scrollWidth, broken, buttons }
      })
      const low = m.buttons.map((b) => ({ ...b, r: ratio(b.bg, b.fg) })).filter((b) => b.r < 4.5)
      const ok = m.sw <= width && m.broken.length === 0 && low.length === 0 && errors.length === 0
      say(ok, `${path.replace(`/theme-previews/${slug}/`, "")} at ${width}: width ${m.sw}, ${m.buttons.length} filled buttons${low.length ? `, low contrast ${JSON.stringify(low.slice(0, 3))}` : ""}${m.broken.length ? `, broken ${JSON.stringify(m.broken.slice(0, 3))}` : ""}${errors.length ? `, errors ${errors.join(" | ")}` : ""}`)
      if (SHOTS) {
        mkdirSync(join(SHOTS, slug), { recursive: true })
        await page.addStyleTag({ content: ".sticky, [class*='sticky'] { position: static !important; } .fixed.bottom-0, [data-back-to-top] { visibility: hidden !important; }" }).catch(() => {})
        const tiles = []
        for (let y = 0; y < total; y += vh) {
          const top = Math.min(y, total - vh)
          await page.evaluate((t) => scrollTo(0, t), top)
          await page.waitForTimeout(350)
          tiles.push({ buf: await page.screenshot({ type: "png" }), top, cut: y - top })
        }
        const comps = []
        for (const t of tiles) comps.push({ input: t.cut > 0 ? await sharp(t.buf).extract({ left: 0, top: t.cut * 2, width: width * 2, height: (vh - t.cut) * 2 }).toBuffer() : t.buf, left: 0, top: (t.top + t.cut) * 2 })
        const name = path.replace(`/theme-previews/${slug}/`, "").replace(/\.html$/, "").replace(/\//g, "-")
        await sharp({ create: { width: width * 2, height: total * 2, channels: 3, background: "#ffffff" } }).composite(comps).webp({ quality: 82 }).toFile(join(SHOTS, slug, `${name}-${width}.webp`))
      }
      await page.close()
    }
  }
}
await browser.close()
server.close()
console.log(failures ? `\n${failures} failed` : "\nall pages passed")
if (failures) process.exit(1)
