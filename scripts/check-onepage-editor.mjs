/**
 * ===========================================================================
 *  THE ONEPAGE EDITOR, IN A BROWSER, AT 1440 AND ON A 390 PHONE
 * ===========================================================================
 * scripts/render-onepage-editor.tsx: the real editor with a filled page, the
 * network and Supabase stubbed. Screenshots go to SHOTS (or a temp folder);
 * the checks below are the ones that make "works on a phone" a measurement.
 *
 *   node scripts/check-onepage-editor.mjs
 *   SHOTS=/some/dir node scripts/check-onepage-editor.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-onepage-editor-"))
mkdirSync(shots, { recursive: true })

const dir = join(root, ".onepage-editor-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/app/onepage"
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(dir, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, priority, unoptimized, sizes, quality, placeholder, blurDataURL, loader, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src && src.src, alt, ...rest }) }
`)
writeFileSync(join(dir, "supabase.js"), `const result = { data: { onboarding_completed: true }, error: null }
const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r(result) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: { id: "probe-user" } } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
`)
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-onepage-editor.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_APP_URL="https://storelib.com"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:next/image=${join(dir, "image.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const css = await appCss(root)
const page = (theme = {}) => `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${interFaces(root)}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};window.PROBE_THEME=${JSON.stringify(theme)}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
const html = page()
rmSync(dir, { recursive: true, force: true })
/* Served over http, so the editor's relative fetches reach the stub API below rather than file:///api. */
const server = createServer((req, res) => {
  if (req.url === "/" || req.url.startsWith("/app")) { res.writeHead(200, { "content-type": "text/html" }); return res.end(html) }
  res.writeHead(200, { "content-type": "application/json" })
  if (req.url.startsWith("/api/billing/subscription")) return res.end(JSON.stringify({ currentPlan: { id: "pro" } }))
  if (req.url.startsWith("/api/onepage/stats")) return res.end(JSON.stringify({ clicks: 0, daily: [] }))
  res.end("{}")
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })

async function open(vp, hash = "links", zone = null) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  if (zone) await p.emulateTimezone(zone)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::/.test(m.text())) errors.push(m.text()) })
  await p.goto(`${base}/app/onepage#${hash}`)
  await p.waitForSelector("[data-scroll-container]")
  await sleep(900)
  return { p, errors }
}
const click = (p, text, scope = "body") => p.evaluate((text, scope) => {
  const el = [...document.querySelector(scope).querySelectorAll("button, [role=button], a")].find((b) => b.textContent.trim().startsWith(text) && b.getClientRects().length)
  if (el) el.click()
  return !!el
}, text, scope)
const noSideScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)

const rects = (p, sel) => p.$$eval(sel, (els) => els.filter((e) => e.getClientRects().length).map((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), text: (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 30) } }))

for (const [label, vp] of [
  ["desktop-1440", { width: 1440, height: 900 }],
  ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
]) {
  const phone = vp.width < 640
  console.log(`\n${label}`)

  /* ── LINKS: a link's schedule ── */
  /* A creator in Bucharest: the schedule is shown and written on their clock, and says so. */
  const { p, errors } = await open(vp, "links", "Europe/Bucharest")
  await p.screenshot({ path: join(shots, `${label}-links.png`) })
  expect(await noSideScroll(p), "links: nothing scrolls sideways")
  await p.evaluate(() => [...document.querySelectorAll("[data-scroll-container] *")].find((e) => e.children.length === 0 && e.textContent.trim() === "Late night mix")?.click())
  await sleep(500)
  await p.evaluate(() => document.querySelector("[data-block-extras]")?.scrollIntoView({ block: "center" }))
  await sleep(300)
  await p.screenshot({ path: join(shots, `${label}-link-extras.png`) })
  const panel = await p.$("[data-schedule-panel]")
  expect(!!panel, "a scheduled link opens with its schedule showing")
  const fields = await rects(p, "[data-datetime-field]")
  expect(fields.length === 2 && fields.every((f) => f.h >= 44), "Show from and Hide after, each a 44px field", fields)
  /* 18:00 UTC on Jan 2 is 8 PM in Bucharest (GMT+2 in winter). */
  const startText = await p.$eval('[data-datetime-field="Show from"]', (b) => b.textContent.trim())
  expect(startText === "Jan 2, 2030, 8:00 PM" && fields[1]?.text.includes("Never"), "they say the stored start on the creator's clock, and an open end", [startText, fields[1]?.text])
  const zone = await p.$eval("[data-schedule-zone]", (e) => e.textContent)
  expect(zone === "Times are in Europe/Bucharest, GMT+3", "the time zone is named", zone)
  const sw = await rects(p, "[data-sensitive-switch]")
  expect(sw.length === 1 && sw[0].w >= 44 && sw[0].h >= 44, "the sensitive switch is a 44px target", sw)

  /* Open Hide after, pick a day and a time. */
  await p.click('[data-datetime-field="Hide after"]')
  await sleep(700)
  await p.screenshot({ path: join(shots, `${label}-calendar.png`) })
  const days = await rects(p, "[data-datetime-panel] [data-day]")
  expect(days.length >= 28 && days.every((d) => d.h >= (phone ? 44 : 36)), `days are ${phone ? 44 : 36}px or more`, days[0])
  const grid = await p.$eval("[data-datetime-panel] [role=grid]", (g) => { const b = g.querySelector("[data-day$='-01']"); return b ? [...g.children].indexOf(b) : -1 })
  const firstWeekday = await p.$eval("[data-datetime-panel] [data-day$='-01']", (b) => new Date(b.getAttribute("data-day") + "T12:00:00Z").getUTCDay())
  expect(grid === firstWeekday, "the 1st sits under its own weekday", { index: grid, weekday: firstWeekday })
  await p.click("[data-datetime-panel] [data-month-next]")
  await sleep(150)
  const target = await p.$eval("[data-datetime-panel] [data-day$='-15']", (b) => b.getAttribute("data-day"))
  await p.click(`[data-datetime-panel] [data-day="${target}"]`)
  await sleep(150)
  await p.click("[data-datetime-panel] [data-time-hour]", { clickCount: 3 })
  await p.keyboard.type("7")
  await p.keyboard.type("30")
  await p.click('[data-datetime-panel] [data-time-ampm="PM"]')
  await sleep(150)
  await p.click("[data-datetime-panel] [data-datetime-done]")
  await sleep(700)
  const endText = await p.$eval('[data-datetime-field="Hide after"]', (b) => b.textContent.trim())
  expect(new RegExp(`15, .*7:30 PM`).test(endText), "a day and 7:30 PM, typed, are written to the block", endText)
  const badge = await p.$eval("[data-block-extras]", (e) => e.closest("[class]") && document.querySelector("[data-block-schedule]")?.textContent)
  expect(!!badge, "the row still says it is scheduled", badge)
  await p.screenshot({ path: join(shots, `${label}-link-scheduled.png`) })

  /* ── DESIGN ── */
  await p.evaluate(() => { try { sessionStorage.clear() } catch {} })
  const d = await open(vp, "design")
  await d.p.evaluate(() => [...document.querySelectorAll("[data-tab='design'], button")].find((b) => b.textContent.trim() === "Design")?.click())
  await sleep(400)
  await d.p.screenshot({ path: join(shots, `${label}-design.png`) })
  const rows = await rects(d.p, "[data-nav-row]")
  expect(rows.length === 7 && rows.every((r) => r.h >= 56), "Design opens on seven rows, each 56px or taller", rows.map((r) => r.h))
  for (const key of ["wallpaper", "text", "header", "buttons", "theme", "socials", "footer"]) {
    await d.p.click(`[data-nav-row="${key}"]`)
    await sleep(350)
    const back = await rects(d.p, "[data-panel-back]")
    expect(back.length === 1 && back[0].h >= (phone ? 44 : 40), `${key}: a way back, ${phone ? 44 : 40}px`, back)
    expect(await noSideScroll(d.p), `${key}: nothing scrolls sideways`)
    await d.p.screenshot({ path: join(shots, `${label}-design-${key}.png`) })
    if (key === "wallpaper") {
      await d.p.screenshot({ path: join(shots, `${label}-design-wallpaper-full.png`), fullPage: true })
      /* On a phone every button; on a computer the 40px way back is the app's size there. */
      const small = (await rects(d.p, "[data-scroll-container] button")).filter((b) => b.h < 44 && b.w < 44 && (phone || b.text !== "Back to Design"))
      expect(small.length === 0, "wallpaper: every button is at least 44px one way", small.slice(0, 4))
      /* The colour picker: open it, drag in the square, and the page's colour follows. */
      await d.p.click('[data-color-field][aria-label^="Background colour"]')
      await sleep(700)
      await d.p.screenshot({ path: join(shots, `${label}-color-picker.png`) })
      const sq = await d.p.$eval("[data-color-square]", (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } })
      if (phone) {
        const cdp = await d.p.target().createCDPSession()
        const pt = (x, y) => [{ x, y }]
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(sq.x + sq.w * 0.2, sq.y + sq.h * 0.2) })
        for (let k = 1; k <= 8; k++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(sq.x + sq.w * (0.2 + k * 0.08), sq.y + sq.h * (0.2 + k * 0.05)) })
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      } else {
        await d.p.mouse.move(sq.x + sq.w * 0.2, sq.y + sq.h * 0.2)
        await d.p.mouse.down()
        for (let k = 1; k <= 8; k++) await d.p.mouse.move(sq.x + sq.w * (0.2 + k * 0.08), sq.y + sq.h * (0.2 + k * 0.05))
        await d.p.mouse.up()
      }
      await sleep(300)
      const hex = await d.p.$eval("[data-color-hex]", (e) => e.value)
      const field = await d.p.$eval('[data-color-field][aria-label^="Background colour"]', (e) => e.getAttribute("aria-label"))
      expect(/^#[0-9A-F]{6}$/.test(hex) && hex !== "#FFFFFF" && field.includes(hex), "a drag in the square changes the page's colour", { hex, field })
      const sheetMoved = phone ? await d.p.evaluate(() => { const s = document.querySelector("[data-sheet-panel]"); return s ? getComputedStyle(s).transform : "none" }) : null
      if (phone) expect(sheetMoved === "none" || /matrix\(1, 0, 0, 1, 0, 0\)/.test(sheetMoved), "and the sheet did not move with the finger", sheetMoved)
      await d.p.screenshot({ path: join(shots, `${label}-color-picker-dragged.png`) })
      await d.p.keyboard.press("Escape")
      await sleep(600)
    }
    await d.p.click("[data-panel-back]")
    await sleep(300)
  }
  expect(errors.length === 0 && d.errors.length === 0, "no errors on the page", [...errors, ...d.errors].slice(0, 3))
  await p.close(); await d.p.close()
}
/* ── THE LIVE PAGE: the wallpaper, its texture and grain, and the fonts ── */
for (const [label, vp] of [
  ["live-1440", { width: 1440, height: 900 }],
  ["live-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
]) {
  console.log(`\n${label}`)
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.goto(`${base}/app/onepage?live`)
  await p.waitForSelector(".onepage-live")
  await sleep(1200)
  await p.screenshot({ path: join(shots, `${label}.png`) })
  const seen = await p.evaluate(() => {
    const shown = [...document.querySelectorAll(".onepage-live")].find((e) => e.getClientRects().length)
    const pattern = shown?.querySelector("[data-wallpaper-pattern]")
    const noise = shown?.querySelector("[data-wallpaper-noise]")
    const fonts = [...document.querySelectorAll("link[data-onepage-font]")].map((l) => decodeURIComponent(l.href))
    const h1 = [...(shown?.querySelectorAll("h1, h2, p, div") ?? [])].reverse().find((h) => h.textContent.trim() === "Satori Studio")
    return {
      pattern: pattern ? { id: pattern.getAttribute("data-wallpaper-pattern"), image: getComputedStyle(pattern).backgroundImage.slice(0, 30), shown: pattern.getBoundingClientRect().height > 0 } : null,
      noise: noise ? { blend: getComputedStyle(noise).mixBlendMode, opacity: getComputedStyle(noise).opacity } : null,
      ids: document.querySelectorAll("filter#noise, pattern[id^='desktop'], pattern[id^='mobile']").length,
      body: shown ? getComputedStyle(shown).fontFamily : null,
      fonts,
      title: h1 ? { font: getComputedStyle(h1).fontFamily, color: getComputedStyle(h1).color } : null,
    }
  })
  expect(seen.pattern?.id === "dots" && seen.pattern.image.startsWith('url("data:image/svg+xml') && seen.pattern.shown, "the dots texture is drawn, from a data URI", seen.pattern)
  expect(seen.noise?.blend === "overlay" && Math.abs(Number(seen.noise.opacity) - 0.4) < 0.01, "the grain is laid over, at the strength chosen", seen.noise)
  expect(seen.ids === 0, "no SVG ids left for two layouts to fight over", seen.ids)
  expect(/Playfair Display/.test(seen.body) && /serif/.test(seen.body), "the body font is the one chosen, with a serif fallback", seen.body)
  expect(seen.fonts.some((f) => f.includes("family=Playfair+Display")), "and its stylesheet is loaded", seen.fonts)
  expect(seen.title && /Playfair Display/.test(seen.title.font) && seen.title.color === "rgb(244, 239, 233)", "a title with no font or colour of its own takes the body font and the text colour", seen.title)
  expect(await noSideScroll(p), "nothing scrolls sideways")
  expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
  await p.close()
}

await browser.close()
server.close()
console.log(`\nshots in ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
