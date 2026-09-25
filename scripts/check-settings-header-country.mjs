/**
 * ===========================================================================
 *  SETTINGS: THE HEADER ON A PHONE, AND THE COUNTRY FIELD, MEASURED
 * ===========================================================================
 * The real Settings page (scripts/render-settings-probe.tsx), this
 * checkout's and, for the pictures, the one at BEFORE (default origin/main's
 * parent of this work, override with BEFORE=<commit>).
 *
 * THE HEADER. "Settings" with "Manage your account and preferences" wrapped
 * into three short lines because the share pill took the right half. At
 * 360, 390 and 430:
 *   the subtitle is one line, and has the whole width under the title row
 *   the title and the pill share the first row, centred on each other
 *   the pill does not touch the title, nothing scrolls sideways
 * At 1280 and 1440 it is as it was: the subtitle under the title on the
 * left, the pill at the top right.
 *
 * THE COUNTRY FIELD (components/app/settings/country-picker). At 1280 a
 * popover under the field, at 390 the shared sheet:
 *   the field shows the flag and the name; nothing moves when it opens
 *   the list opens on the chosen country, in the middle of its scroller,
 *     from the first frame (the sheet)
 *   flags are drawn, and only the ones near the screen are fetched
 *   search: "swe", "usa", "holland"; arrows, Home and End move the focus;
 *     Enter on a row picks it, the field then shows it, and the save bar
 *     comes up
 *   long tasks while it opens, and frames through the sheet's rise
 *
 *   node scripts/check-settings-header-country.mjs     (SHOTS_DIR=... keeps the pictures)
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
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-settings-header-")), "shots")
mkdirSync(shots, { recursive: true })
const BEFORE = process.env.BEFORE || "96949910"

const dir = join(root, ".settings-header-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/app/settings"
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(dir, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) }, from: () => q, rpc: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)
let oldForm = null
try {
  oldForm = execFileSync("git", ["show", `${BEFORE}:components/app/settings-form-new.tsx`], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 })
  writeFileSync(join(dir, "old-form.tsx"), oldForm)
} catch {
  console.log(`  (no form at ${BEFORE}: the before pictures are skipped)`)
}
writeFileSync(join(dir, "entry-new.tsx"), `import { mount } from "@/scripts/render-settings-probe"\nimport { SettingsFormNew } from "@/components/app/settings-form-new"\nmount(SettingsFormNew as never)\n`)
if (oldForm) writeFileSync(join(dir, "entry-old.tsx"), `import { mount } from "@/scripts/render-settings-probe"\nimport { SettingsFormNew } from "./old-form"\nmount(SettingsFormNew as never)\n`)

const bundle = (entry, out) =>
  execFileSync("npx", ["--no-install", "esbuild", join(dir, entry),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, out)}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
try {
  bundle("entry-new.tsx", "new.js")
  if (oldForm) bundle("entry-old.tsx", "old.js")
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const css = `${await appCss(root)}\n${interFaces(root).replace(/url\(file:\/\//g, "url(/__font?p=")}`
const page = (script, fixture) => `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};window.__fixture=${JSON.stringify(fixture)};window.__err=[];window.addEventListener("error",function(e){window.__err.push(String(e.message))})</script><script>${script}</script></body></html>`
const scripts = { new: readFileSync(join(dir, "new.js"), "utf8"), old: oldForm ? readFileSync(join(dir, "old.js"), "utf8") : null }
rmSync(dir, { recursive: true, force: true })

const flagHits = []
const server = createServer((req, res) => {
  if (req.url.startsWith("/__font?p=")) {
    const file = decodeURIComponent(req.url.slice("/__font?p=".length))
    if (!/\/\.next\/static\/media\/[\w.-]+\.woff2$/.test(file) || !existsSync(file)) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { "content-type": "font/woff2" })
    res.end(readFileSync(file))
    return
  }
  if (req.url.startsWith("/flags/")) {
    const code = req.url.slice("/flags/".length)
    const file = join(root, "public/flags", code)
    flagHits.push(code)
    if (!/^[A-Z]{2}\.svg$/.test(code) || !existsSync(file)) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { "content-type": "image/svg+xml" })
    res.end(readFileSync(file))
    return
  }
  if (req.url.startsWith("/api/")) {
    let body = {}
    if (req.url.startsWith("/api/billing/subscription")) body = { currentPlan: { id: "pro" } }
    else if (req.url.startsWith("/api/domains")) body = { domains: [], schema: "current" }
    else if (req.url.startsWith("/api/stripe/connect/status")) body = { connected: true, status: "connected" }
    setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)) }, 40)
    return
  }
  const u = new URL(req.url, "http://x")
  const which = u.searchParams.get("v") === "old" ? "old" : "new"
  const fixture = JSON.parse(u.searchParams.get("f") || "{}")
  res.writeHead(200, { "content-type": "text/html" })
  res.end(page(scripts[which], fixture))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"], headless: true })
const open = async (viewport, which = "new", fixture = {}) => {
  const p = await browser.newPage()
  await p.setViewport(viewport)
  await p.goto(`${base}/?v=${which}&f=${encodeURIComponent(JSON.stringify(fixture))}`, { waitUntil: "load" })
  await p.waitForFunction("window.__ran === true", { timeout: 15000 })
  await p.evaluate(() => document.fonts.ready)
  await wait(500)
  const errors = await p.evaluate(() => window.__err)
  if (errors.length) expect(false, "the page threw", errors.join("; "))
  return p
}

/* ── The header ─────────────────────────────────────────────────────────── */
const headerOf = (p) => p.evaluate(() => {
  const h1 = [...document.querySelectorAll("h1")].find((x) => /Settings/.test(x.textContent))
  /* The header row, in this version and the one before it. */
  const head = h1.closest(".mb-6") ?? h1.parentElement
  const sub = [...head.querySelectorAll("p")].find((x) => /Manage your account/.test(x.textContent))
  const pill = [...document.querySelectorAll("[data-share-pill]")].find((x) => x.getClientRects().length > 0)
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.left * 10) / 10, y: Math.round(b.top * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10, right: Math.round(b.right * 10) / 10, cy: Math.round((b.top + b.height / 2) * 10) / 10 } }
  const range = document.createRange()
  range.selectNodeContents(sub)
  const lines = new Set([...range.getClientRects()].map((x) => Math.round(x.top))).size
  const lh = parseFloat(getComputedStyle(sub).lineHeight) || 21
  return { head: r(head), h1: r(h1), sub: r(sub), pill: pill ? r(pill) : null, lines, lh, scrollW: document.documentElement.scrollWidth, vw: innerWidth }
})

console.log("\nThe header")
const phones = [360, 390, 430]
for (const w of phones) {
  const p = await open({ width: w, height: 800, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const m = await headerOf(p)
  console.log(`  ${w}: title ${m.h1.w}x${m.h1.h} at ${m.h1.x},${m.h1.y}; pill ${m.pill?.w}x${m.pill?.h} at ${m.pill?.x}; subtitle ${m.sub.w}px wide, ${m.lines} line(s)`)
  expect(m.lines === 1, `${w}: the subtitle is one line`, m.lines)
  expect(Math.abs(m.sub.w - m.head.w) <= 1, `${w}: and has the whole width under the title row`, { sub: m.sub.w, row: m.head.w })
  expect(!!m.pill && Math.abs(m.pill.cy - m.h1.cy) <= 1.5, `${w}: title and pill on one row, centred on each other`, m.pill && { title: m.h1.cy, pill: m.pill.cy })
  expect(!!m.pill && m.pill.x >= m.h1.right + 8, `${w}: the pill does not touch the title`, m.pill && { titleRight: m.h1.right, pillLeft: m.pill.x })
  expect(!!m.pill && m.pill.right <= m.vw - 15.5, `${w}: the pill keeps the page's 16px edge`, m.pill && m.vw - m.pill.right)
  expect(m.scrollW <= m.vw, `${w}: nothing scrolls sideways`, m.scrollW)
  await p.screenshot({ path: join(shots, `header-after-${w}.png`), clip: { x: 0, y: 60, width: w, height: 150 } })
  await p.close()
  if (scripts.old) {
    const o = await open({ width: w, height: 800, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, "old")
    const before = await headerOf(o)
    console.log(`       before: subtitle ${before.sub.w}px wide, ${before.lines} line(s)`)
    await o.screenshot({ path: join(shots, `header-before-${w}.png`), clip: { x: 0, y: 60, width: w, height: 150 } })
    await o.close()
  }
}
for (const w of [1280, 1440]) {
  const p = await open({ width: w, height: 900, deviceScaleFactor: 1 })
  const m = await headerOf(p)
  expect(m.lines === 1 && m.sub.y > m.h1.y + m.h1.h - 2 && Math.abs(m.sub.x - m.h1.x) < 1, `${w}: the subtitle under the title, on the left`, { title: m.h1, sub: m.sub })
  expect(!!m.pill && Math.abs(m.pill.y - (m.h1.y + 4)) <= 2 && m.pill.right >= m.head.right - 1, `${w}: the pill at the top right`, m.pill)
  await p.screenshot({ path: join(shots, `header-after-${w}.png`), clip: { x: 240, y: 58, width: w - 240, height: 130 } })
  await p.close()
  if (scripts.old) {
    const o = await open({ width: w, height: 900, deviceScaleFactor: 1 }, "old")
    const before = await headerOf(o)
    expect(Math.abs(before.h1.y - m.h1.y) <= 1 && Math.abs(before.sub.y - m.sub.y) <= 1 && Math.abs((before.pill?.y ?? 0) - (m.pill?.y ?? 0)) <= 1, `${w}: exactly where it was before`, { before: [before.h1.y, before.sub.y, before.pill?.y], after: [m.h1.y, m.sub.y, m.pill?.y] })
    await o.close()
  }
}

/* ── The country field ──────────────────────────────────────────────────── */
const fieldOf = (p) => p.evaluate(() => {
  const f = document.querySelector('[data-choice-field="country"]')
  const b = f.getBoundingClientRect()
  const img = f.querySelector("[data-flag] img")
  return { text: f.textContent.trim(), flag: f.querySelector("[data-flag]")?.getAttribute("data-flag") ?? null, drawn: !!img && img.complete && img.naturalWidth > 0, h: b.height, top: b.top, scroll: document.querySelector(".app-content-scroll").scrollTop }
})
const scrollToField = (p) => p.evaluate(() => {
  const f = document.querySelector('[data-choice-field="country"]')
  const s = document.querySelector(".app-content-scroll")
  s.scrollTop += f.getBoundingClientRect().top - innerHeight * 0.45
})

console.log("\nThe country field, 1280: a popover")
{
  const p = await open({ width: 1280, height: 900, deviceScaleFactor: 1 })
  await scrollToField(p)
  await wait(150)
  const before = await fieldOf(p)
  expect(before.flag === "SE" && /Sweden/.test(before.text) && before.drawn && before.h === 44, "the field: Sweden's flag, drawn, and its name, 44px tall", before)
  flagHits.length = 0
  await p.evaluate(() => {
    window.__lt = []
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)) }).observe({ type: "longtask", buffered: false })
  })
  /* Every state the list is in as it arrives, from the first one the page commits. */
  await p.evaluate(() => {
    window.__states = []
    const seen = () => {
      const pop = document.querySelector('[data-choice-popover="country"]')
      if (!pop) return
      const row = pop.querySelector("[data-choice][data-checked]")
      const scroller = pop.querySelector("[data-choice-scroll]")
      const n = pop.querySelectorAll("[data-choice]").length
      if (window.__states.length && window.__states[window.__states.length - 1].rows === n) return
      /* Layout offsets, not boxes: the popover is scaling in while this is read, and a box would be scaled with it. */
      window.__states.push({ rows: n, whole: !!pop.querySelector("[data-choice-whole]"), at: row && scroller ? row.offsetTop - scroller.offsetTop : null })
    }
    new MutationObserver(seen).observe(document.body, { childList: true, subtree: true })
  })
  await p.click('[data-choice-field="country"]')
  await p.waitForSelector('[data-choice-popover="country"]', { visible: true })
  await wait(400)
  const states = await p.evaluate(() => window.__states)
  const early = states[0] ?? { rows: 0, whole: false, at: null }
  const late = states[states.length - 1] ?? early
  expect(!early.whole && early.rows <= 25 && late.whole && late.rows > 240, "it opens with the rows around Sweden, and the rest arrive a moment later", states.map((s) => s.rows))
  expect(early.at !== null && Math.abs(late.at - early.at) < 0.5, "Sweden's row keeps its place in the list when they do", { early: early.at, late: late.at })
  const opened = await p.evaluate(() => {
    const pop = document.querySelector('[data-choice-popover="country"]')
    const list = pop.querySelector("[data-choice-scroll]")
    const row = pop.querySelector("[data-choice][data-checked]")
    const lr = list.getBoundingClientRect()
    const rr = row.getBoundingClientRect()
    const rows = pop.querySelectorAll("[data-choice]")
    const shown = [...rows].filter((x) => { const b = x.getBoundingClientRect(); return b.bottom > lr.top && b.top < lr.bottom })
    const drawn = shown.filter((x) => { const i = x.querySelector("[data-flag] img"); return i && i.complete && i.naturalWidth > 0 }).length
    return {
      rows: rows.length, checked: row.getAttribute("data-choice"), focus: document.activeElement?.hasAttribute("data-choice-search"),
      offCentre: Math.round((rr.top + rr.height / 2) - (lr.top + lr.height / 2)), shown: shown.length, drawn,
      popTop: pop.getBoundingClientRect().top,
    }
  })
  const after = await fieldOf(p)
  const lt = await p.evaluate(() => window.__lt)
  console.log(`  ${opened.rows} countries, ${opened.shown} rows in view, ${flagHits.length} flags fetched on open, long tasks: ${lt.length ? lt.join(", ") + "ms" : "none"}`)
  expect(opened.rows > 240, "every country is listed", opened.rows)
  expect(opened.checked === "SE" && Math.abs(opened.offCentre) <= 24, "it opens on Sweden, in the middle of the list", opened)
  expect(opened.focus, "the search has the focus")
  expect(opened.drawn === opened.shown, "every row in view has its flag drawn", `${opened.drawn} of ${opened.shown}`)
  expect(flagHits.length <= 30, "and only the flags on screen and just past it are fetched, not all of them", flagHits.length)
  expect(after.scroll === before.scroll && Math.abs(after.top - before.top) < 0.5, "nothing on the page moved when it opened", { before: [before.scroll, before.top], after: [after.scroll, after.top] })
  expect(lt.every((d) => d < 120), "no long task over 120ms while it opens", lt)
  await p.screenshot({ path: join(shots, "country-popover-1280.png") })

  /* Search */
  const results = async (q) => {
    await p.evaluate(() => { const i = document.querySelector('[data-choice-popover="country"] [data-choice-search]'); i.select() })
    await p.keyboard.type(q)
    await wait(80)
    return p.evaluate(() => [...document.querySelectorAll('[data-choice-popover="country"] [data-choice]')].map((x) => x.textContent.trim()))
  }
  const swe = await results("swe")
  expect(swe.includes("Sweden"), '"swe" finds Sweden', swe.slice(0, 4))
  const usa = await results("usa")
  expect(usa.includes("United States"), '"usa" finds the United States', usa)
  const holland = await results("holland")
  expect(holland.length === 1 && holland[0] === "Netherlands", '"holland" finds the Netherlands', holland)
  await results("nor")
  /* Keys */
  await p.keyboard.press("ArrowDown")
  const first = await p.evaluate(() => document.activeElement?.getAttribute("data-choice"))
  await p.keyboard.press("End")
  const last = await p.evaluate(() => document.activeElement?.getAttribute("data-choice"))
  await p.keyboard.press("Home")
  const home = await p.evaluate(() => document.activeElement?.getAttribute("data-choice"))
  const all = await p.evaluate(() => [...document.querySelectorAll('[data-choice-popover="country"] [data-choice]')].map((x) => x.getAttribute("data-choice")))
  expect(first === all[0] && last === all[all.length - 1] && home === all[0], "ArrowDown from the search, then End and Home, move through the rows", { first, last, home, all })
  const target = all.find((c) => c === "NO") ? "NO" : all[0]
  while ((await p.evaluate(() => document.activeElement?.getAttribute("data-choice"))) !== target) await p.keyboard.press("ArrowDown")
  await p.keyboard.press("Enter")
  await wait(350)
  const picked = await fieldOf(p)
  const bar = await p.evaluate(() => document.querySelector('[data-app-bottom-bar]')?.getAttribute("data-app-bottom-bar"))
  expect(picked.flag === "NO" && /Norway/.test(picked.text), "Enter picks Norway: the field shows its flag and name", picked)
  expect(!(await p.$('[data-choice-popover="country"]')), "and the popover closes")
  expect(bar === "visible", "and the save bar comes up", bar)
  await p.close()
}

console.log("\nThe country field, 390: the sheet")
{
  const p = await open({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  await scrollToField(p)
  await wait(150)
  const before = await fieldOf(p)
  expect(before.flag === "SE" && before.h === 44, "the field: Sweden's flag, 44px tall", before)
  await p.evaluate(() => {
    window.__lt = []
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)) }).observe({ type: "longtask", buffered: false })
    /* Every frame from the tap: where the list is scrolled, and where the sheet is. */
    window.__frames = []
    const t0 = performance.now()
    /* A frame over 50ms, with what filled it: script, style and layout, or nothing of this page's (a busy machine). */
    window.__loaf = []
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          const end = e.startTime + e.duration
          window.__loaf.push({
            at: Math.round(e.startTime - t0), ms: Math.round(e.duration),
            script: Math.round(e.scripts.reduce((a, x) => a + x.duration, 0)),
            styleLayout: e.styleAndLayoutStart ? Math.round(end - e.styleAndLayoutStart) : 0,
            render: e.renderStart ? Math.round(end - e.renderStart) : 0,
          })
        }
      }).observe({ type: "long-animation-frame", buffered: false })
    } catch {
      /* An older browser: the frames alone say it. */
    }
    const tick = () => {
      const s = document.querySelector("[data-choice-sheet]")?.closest("[data-sheet-scroll]")
      const panel = document.querySelector("[data-sheet-panel]") || s?.closest("[role=dialog]")
      const row = s?.querySelector("[data-choice][data-checked]")
      window.__frames.push({
        t: Math.round(performance.now() - t0), scroll: s ? Math.round(s.scrollTop) : null, y: panel ? Math.round(panel.getBoundingClientRect().top) : null,
        rows: s ? s.querySelectorAll("[data-choice]").length : 0,
        /* The chosen row against the list's own top: it must not move as the rest of the rows arrive. */
        at: row && s ? Math.round((row.getBoundingClientRect().top - s.getBoundingClientRect().top) * 10) / 10 : null,
      })
      if (performance.now() - t0 < 900) requestAnimationFrame(tick)
    }
    document.querySelector('[data-choice-field="country"]').addEventListener("click", () => requestAnimationFrame(tick), { once: true })
  })
  await p.tap('[data-choice-field="country"]')
  await wait(1000)
  const frames = await p.evaluate(() => window.__frames)
  const lt = await p.evaluate(() => window.__lt)
  const loaf = await p.evaluate(() => window.__loaf.filter((f) => f.at > -50 && f.at < 1000))
  const seen = frames.filter((f) => f.scroll !== null)
  const settled = seen[seen.length - 1]?.scroll
  const gaps = frames.slice(1).map((f, i) => f.t - frames[i].t)
  console.log(`  ${frames.length} frames in 900ms, longest gap ${Math.max(...gaps)}ms (gaps: ${gaps.join(" ")}); list scrolled to ${settled} on the first frame it was there: ${seen[0]?.scroll}; long tasks: ${lt.length ? lt.join(", ") + "ms" : "none"}`)
  console.log(`  frames over 50ms: ${loaf.length ? loaf.map((f) => `at ${f.at}ms ${f.ms}ms (script ${f.script}, style and layout ${f.styleLayout}, render ${f.render})`).join("; ") : "none"}`)
  expect(seen.length > 0 && seen[0].scroll === settled && settled > 0, "the list is on Sweden from the first frame the sheet is drawn, and never jumps", { first: seen[0], settled })
  const ats = [...new Set(seen.map((f) => f.at))]
  const counts = [...new Set(seen.map((f) => f.rows))]
  expect(counts[0] <= 25 && counts[counts.length - 1] > 240, "it opens with the rows around Sweden, and the rest arrive while it rises", counts)
  expect(ats.length === 1, "and Sweden's row stays put in the sheet on every frame", ats)
  const sheet = await p.evaluate(() => {
    const s = document.querySelector("[data-choice-sheet]").closest("[data-sheet-scroll]")
    const row = s.querySelector("[data-choice][data-checked]")
    const sr = s.getBoundingClientRect()
    const rr = row.getBoundingClientRect()
    const search = document.querySelector("[data-choice-sheet-header] [data-choice-search]")
    return { checked: row.getAttribute("data-choice"), offCentre: Math.round((rr.top + rr.height / 2) - (sr.top + sr.height / 2)), rowH: Math.round(rr.height), searchFont: getComputedStyle(search).fontSize, focused: document.activeElement === search, scrollW: document.documentElement.scrollWidth }
  })
  expect(sheet.checked === "SE" && Math.abs(sheet.offCentre) <= 30, "the sheet opens on Sweden, in the middle", sheet)
  expect(sheet.rowH >= 48, "48px rows", sheet.rowH)
  expect(sheet.searchFont === "16px" && !sheet.focused, "the search is 16px (no iOS zoom) and does not pull the keyboard up on open", sheet)
  expect(Math.max(...gaps) <= 50, "the rise has no dropped run of frames (longest gap under 50ms, headless)", Math.max(...gaps))
  expect(lt.every((d) => d < 120), "no long task over 120ms while it opens", lt)
  await p.screenshot({ path: join(shots, "country-sheet-390.png") })
  await p.tap('[data-choice-sheet] [data-choice="NO"]')
  await wait(600)
  const picked = await fieldOf(p)
  expect(picked.flag === "NO" && /Norway/.test(picked.text), "a tap on Norway picks it", picked)
  await p.screenshot({ path: join(shots, "country-field-390.png"), clip: { x: 0, y: Math.max(0, picked.top - 120), width: 390, height: 240 } })
  await p.close()
}

console.log("\nA country held as a code, or an older name, or none")
for (const [held, want] of [["SE", "Sweden"], ["Czech Republic", "Czech Republic"], ["", "Select country"]]) {
  const p = await open({ width: 1280, height: 900, deviceScaleFactor: 1 }, "new", { profile: { country: held } })
  const f = await fieldOf(p)
  expect(f.text === want && (held ? !!f.flag : !f.flag), `"${held}" shows "${want}"${held ? " with its flag" : ", in the placeholder grey"}`, f)
  await p.close()
}

await browser.close()
server.close()
console.log(`\nScreenshots: ${shots}`)
console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
