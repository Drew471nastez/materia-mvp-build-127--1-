/**
 * ANALYTICS ROUND Z6, MEASURED
 *
 * Mounts the real Physical sales card and report cards (scripts/
 * render-analytics-z6.tsx) in Chromium with the app's CSS at 390 and 1280
 * wide and measures: no sideways scroll, every card inside the content
 * column, the funnel's height and width (one column, five steps, every bar
 * inside its card), the official marks in Referrers (an inline SVG with a
 * path for each company), the systems card, the flags loaded, and the
 * contrast of the funnel's words against white.
 *
 *   node scripts/check-analytics-z6.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const out = mkdtempSync(join(tmpdir(), "storelib-z6-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
execFileSync("npx", ["esbuild", join(root, "scripts/render-analytics-z6.tsx"), "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
  `--alias:@=${root}`, "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--loader:.css=empty", "--log-level=error"], { cwd: root, stdio: "inherit" })
const bundle = readFileSync(join(out, "probe.js"))
const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;background:#fafafa}</style></head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};localStorage.setItem("storelib_timezone","Europe/Bucharest")</script><script src="/probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  const flag = /^\/flags\/([A-Z]{2})\.svg$/.exec(req.url)
  if (flag && existsSync(join(root, "public/flags", `${flag[1]}.svg`))) { res.writeHead(200, { "content-type": "image/svg+xml" }); return res.end(readFileSync(join(root, "public/flags", `${flag[1]}.svg`))) }
  res.writeHead(200, { "content-type": "text/html" }); res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`
let broken = 0
const expect = (ok, what, got) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`); if (!ok) broken++ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })

/* WCAG contrast of two rgb() strings. */
const contrastFn = `(a, b) => { const p = (s) => s.match(/[\\d.]+/g).slice(0, 3).map(Number).map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }); const L = (s) => { const [r, g, b] = p(s); return 0.2126 * r + 0.7152 * g + 0.0722 * b }; const [x, y] = [L(a), L(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }`

const BRANDS = ["google", "instagram", "facebook", "x", "github", "apple", "stripe", "bing", "duckduckgo", "tiktok", "youtube", "pinterest", "reddit", "linkedin", "gmail", "whatsapp", "telegram", "discord", "snapchat"]

for (const [name, vp] of [["phone, 390 wide", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ["desktop, 1280 wide", { width: 1280, height: 900 }]]) {
  console.log(`\n${name}`)
  const p = await browser.newPage()
  await p.emulateTimezone("Europe/Bucharest")
  await p.setViewport(vp)
  await p.goto(origin, { waitUntil: "load" })
  await p.waitForSelector("[data-funnel]", { timeout: 15000 })
  await p.waitForSelector("[data-physical-figures]")
  await sleep(900)

  const scroll = await p.evaluate(() => document.documentElement.scrollWidth)
  const wide = await p.evaluate((w) => [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > w + 0.5 && !el.closest("[data-scroll-x], .orders-strip, [role=dialog]")).slice(0, 4).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} ${Math.round(el.getBoundingClientRect().right)}`), vp.width)
  expect(scroll <= vp.width, "no sideways scroll", `${scroll} of ${vp.width}${wide.length ? `: ${wide.join(" | ")}` : ""}`)
  const column = await p.evaluate(() => { const r = document.querySelector("#app > div > div").getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)] })
  const outside = await p.evaluate(([l, r]) => [...document.querySelectorAll("section")].filter((s) => { const b = s.getBoundingClientRect(); return b.left < l - 1 || b.right > r + 1 }).map((s) => s.dataset.card), column)
  expect(outside.length === 0, "every card inside the content column", outside)
  const cards = await p.$$eval("section[data-card]", (ss) => ss.map((s) => s.dataset.card))
  expect(["physical", "traffic", "referrers", "pages", "products", "funnel", "subscribers", "countries", "os", "devices"].every((c) => cards.includes(c)), "the cards: physical, sources, referrers, pages, products, funnel, sign-ups, countries, systems, devices", cards)

  /* The funnel: one column, five steps, compact. */
  const funnel = await p.evaluate(() => {
    const card = document.querySelector("section[data-card=funnel]")
    const grid = document.querySelector("[data-analytics-cards]")
    const c = card.getBoundingClientRect()
    const list = card.querySelector("[data-funnel] ol").getBoundingClientRect()
    const steps = [...card.querySelectorAll("[data-step]")].map((s) => s.dataset.step)
    const bars = [...card.querySelectorAll("[data-funnel-bar]")].map((b) => { const r = b.getBoundingClientRect(); return { w: r.width, right: r.right, h: r.height } })
    const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").length
    const others = [...document.querySelectorAll("section[data-card=traffic]")].map((s) => s.getBoundingClientRect().width)[0]
    return { cardW: Math.round(c.width), cardH: Math.round(c.height), listH: Math.round(list.height), steps, bars, inside: bars.every((b) => b.right <= c.right + 0.5), columns, otherW: Math.round(others), drop: card.querySelector("[data-drop]")?.dataset.step ?? null, note: card.querySelector("[data-funnel-note]")?.textContent }
  })
  expect(funnel.steps.join() === "visitors,product,cart,checkout,orders", "the funnel's five steps, Added to cart among them", funnel.steps)
  expect(funnel.cardW === funnel.otherW, "the funnel takes one column, the width of any other card", `${funnel.cardW} vs ${funnel.otherW}, ${funnel.columns} columns`)
  expect(funnel.listH <= 215, "the five steps fit in 215px", `${funnel.listH}px, card ${funnel.cardH}px`)
  expect(funnel.inside && funnel.bars.every((b) => b.h <= 6.5), "every bar thin and inside the card", funnel.bars.map((b) => Math.round(b.w)))
  expect(!!funnel.drop && /^Biggest drop: .+, \d+% lost$/.test(funnel.note || ""), "the biggest drop is marked and said under the list", `${funnel.drop}: ${funnel.note}`)
  const contrast = await p.evaluate(`(() => { const c = ${contrastFn}; const card = document.querySelector("section[data-card=funnel]"); const bg = "rgb(255, 255, 255)"; const of = (sel) => { const el = card.querySelector(sel); return el ? Number(c(getComputedStyle(el).color, bg).toFixed(2)) : null }; return { label: of("[data-step] span"), count: of("[data-step] span.font-medium"), drop: of("[data-drop] span:last-child"), note: of("[data-funnel-note]") } })()`)
  expect(contrast.label >= 4.5 && contrast.count >= 4.5 && contrast.drop >= 4.5 && contrast.note >= 4.5, "the funnel's words read at 4.5:1 or more on white", contrast)

  /* Referrers: every company by its official mark, drawn inline. */
  await p.evaluate(() => [...document.querySelectorAll("section[data-card=referrers] button")].find((b) => /^View all/.test(b.textContent))?.click())
  await sleep(400)
  const marks = await p.evaluate(() => {
    const rows = [...document.querySelectorAll("[role=dialog] [data-row-key]")]
    return rows.map((r) => { const b = r.querySelector("[data-brand]"); return { key: r.dataset.rowKey, brand: b?.dataset.brand ?? null, drawn: !!b?.querySelector("svg path") } })
  })
  const byKey = Object.fromEntries(marks.map((m) => [m.key, m]))
  const missing = BRANDS.filter((b) => !(byKey[b] && byKey[b].brand === b && byKey[b].drawn))
  expect(missing.length === 0, `${BRANDS.length} companies each with its own mark (Google's four colours, X for t.co, Stripe, GitHub, Apple)`, missing.length ? missing : `${marks.length} referrers listed`)
  const google = await p.evaluate(() => [...document.querySelectorAll("[role=dialog] [data-row-key=google] [data-brand=google] path")].map((x) => x.getAttribute("fill")).join(","))
  expect(google.split(",").length === 4, "Google's G in its four colours", google)
  const labels = await p.evaluate(() => [...document.querySelectorAll("[role=dialog] [data-row-key] span[title]")].map((s) => s.textContent))
  expect(labels.includes("Google") && labels.includes("X") && labels.includes("Instagram") && !labels.some((l) => /google\.|t\.co|instagram\.com/.test(l)), "named by company, not by host", labels.slice(0, 8))
  if (name.startsWith("desktop")) await p.screenshot({ path: join(shots, "desktop-referrers.png") })
  await p.keyboard.press("Escape")
  await sleep(300)

  /* Systems: share and visitors. */
  const os = await p.evaluate(() => [...document.querySelectorAll("section[data-card=os] [data-row-key]")].map((r) => ({ key: r.dataset.rowKey, note: r.querySelector("span.truncate.pr-2")?.textContent, mark: !!r.querySelector("[data-brand], [data-glyph]") })))
  expect(os.length === 5 && os.every((o) => /%$/.test(o.note || "") && o.mark), "operating systems with their share and a mark", os)

  /* Flags. */
  await p.evaluate(() => document.querySelector("section[data-card=countries]").scrollIntoView())
  await sleep(500)
  const flags = await p.evaluate(() => [...document.querySelectorAll("section[data-card=countries] [data-flag] img")].map((i) => i.naturalWidth > 0))
  expect(flags.length > 0 && flags.every(Boolean), "country flags load", flags)

  /* Physical figures: one row of plain numbers on a desktop, two columns on a phone, nothing cut. */
  const figs = await p.evaluate(() => [...document.querySelectorAll("[data-physical-figures] [data-figure]")].map((f) => { const r = f.getBoundingClientRect(); return { k: f.dataset.figure, top: Math.round(r.top), w: Math.round(r.width) } }))
  expect(figs.length === 8, "the physical card's eight figures", figs.map((f) => f.k))
  await p.evaluate(() => window.scrollTo(0, 0))
  await p.screenshot({ path: join(shots, `${name.split(",")[0]}.png`), fullPage: true })
  await p.close()
}
await browser.close(); server.close()
console.log(`\nscreenshots: ${shots}`)
console.log(broken === 0 ? "\nAnalytics Z6 measured as asked.\n" : `\n${broken} measured wrong.\n`)
process.exit(broken === 0 ? 0 : 1)
