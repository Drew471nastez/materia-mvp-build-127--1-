/**
 * ===========================================================================
 *  ROUND 11: THE ONEPAGE EDITOR'S PILLS, ITS DESIGN PAGES, ITS TAB BAR, ITS EXIT
 * ===========================================================================
 * The owner, round 11:
 *
 *   PILLS     "When I click on something, it makes the text black and the
 *             pill shape black so there's nothing visible." And "the switching
 *             between the pill shapes should inherit how Storelib feels when I
 *             click pill shapes: the settings of the app."
 *   DESIGN    "Theme, Header, Wallpaper, Text, Button, Social icons, Footer:
 *             more smooth and clean. I don't like the fade."
 *   TABBAR    "When I switch, it bumps the icons, bumps the links, glitches,
 *             shifted layout when I click [...] especially on hover with the
 *             touch it bumps the buttons."
 *   EXIT      "When I'm exiting the OnePage editor and I go back to the app
 *             there's a gray container showing and cutting things off."
 *
 * The real editor (scripts/onepage-probe-server.mjs), at 390x844 as a phone
 * (touch, the CPU slowed four times) and at 1440x900 with a mouse:
 *
 *   contrast  every Settings pill chosen in turn, in the app's light look and
 *             with <html data-sl-dark> (app/theme-dark.css): the chosen pill's
 *             words against its fill, worked out from the computed colours
 *             AND read off the screenshot's pixels, >= 4.5:1, and the words
 *             there at all (the empty `content: attr()` copy was the bug)
 *   layout    Settings is one row of pills at 1440 (no list down the side)
 *   switch    each pill of Settings and of the Theme kinds, frame by frame:
 *             p50, p95, the longest frame, any frame with no section drawn,
 *             any frame with two drawn, the box under the pills never
 *             changing height, nothing shifted
 *   push      every row of the Design list in and back: frame times, any
 *             frame with neither page drawn over the middle of the column,
 *             the column's scroll, the motion on transform/opacity only
 *   tabbar    each of the phone's four tabs tapped: the boxes of every
 *             button, icon and word before, during the press and after, the
 *             layout shift, no scale or transform on a press, no style that
 *             only a hover gives, and a haptic per tap (navigator.vibrate)
 *   hover     a finger on a pill and on a tab changes no colour, border or
 *             size that a mouse's hover would
 *
 * The exit is measured in a real Next app around the real /app shell
 * (EXIT=1, it builds one, a few minutes; see the end of this file).
 *
 *   PROBE_CSS=source node scripts/check-onepage-motion-r11.mjs
 *   SHOTS=/dir ...   pictures
 *   ONLY=contrast,switch,push,tabbar,exit
 *   REPORT=1         numbers only, nothing fails
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const SHOTS = process.env.SHOTS || null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const REPORT = !!process.env.REPORT
const only = (process.env.ONLY || "contrast,switch,push,tabbar").split(",").filter(Boolean)
const wants = (k) => only.includes(k)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let broken = 0
const numbers = {}
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok && !REPORT) broken++
}

const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const DESK = { width: 1440, height: 900 }
const FRAME = 1000 / 60

function summarize(gaps) {
  if (!gaps.length) return { frames: 0, p50: 0, p95: 0, max: 0, dropped: 0 }
  const s = [...gaps].sort((a, b) => a - b)
  const q = (f) => s[Math.min(s.length - 1, Math.floor(f * (s.length - 1)))]
  const r = (n) => Math.round(n * 10) / 10
  return { frames: gaps.length, p50: r(q(0.5)), p95: r(q(0.95)), max: r(s[s.length - 1]), dropped: gaps.reduce((a, g) => a + Math.max(0, Math.round(g / FRAME) - 1), 0) }
}

/* ── Colour ───────────────────────────────────────────────────────────── */
function parseColor(c) {
  const m = c.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number)
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  return null
}
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const lum = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 })

/* ── The editor ───────────────────────────────────────────────────────── */
const { base, server } = await serveEditorProbe({ fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"], protocolTimeout: 240000 })

async function open(vp, hash, { cpu = 1, dark = false } = {}) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  p.on("dialog", (d) => d.accept().catch(() => {}))
  await p.evaluateOnNewDocument(() => {
    window.__shifts = []
    window.__vibes = 0
    try { Object.defineProperty(navigator, "vibrate", { value: () => { window.__vibes++; return true }, configurable: true }) } catch { /* none */ }
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__shifts.push({ value: e.value, at: e.startTime, nodes: (e.sources || []).map((s) => (s.node && s.node.nodeType === 1 ? s.node.outerHTML.slice(0, 90) : String(s.node && s.node.nodeName))) }))).observe({ type: "layout-shift", buffered: true })
    } catch { /* no layout-shift entries here */ }
  })
  await p.goto(`${base}/app/onepage#${hash}`)
  await p.waitForSelector("[data-scroll-container]", { timeout: 15000 })
  if (dark) await p.evaluate(() => document.documentElement.setAttribute("data-sl-dark", ""))
  await sleep(2600)
  const cdp = await p.target().createCDPSession()
  if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
  return { p, errors, cdp }
}

/* Frame sampling in the page: each rAF records the gap and what `probe` says about the frame. */
const startFrames = (p, probe) => p.evaluate((src) => {
  const look = src ? new Function(`return (${src})`)() : null
  window.__ft = []
  window.__fl = []
  const gen = (window.__ftGen = (window.__ftGen || 0) + 1)
  window.__ftOn = true
  window.__shifts = []
  const tick = (t) => {
    if (!window.__ftOn || window.__ftGen !== gen) return
    window.__ft.push(t)
    if (look) try { window.__fl.push(look()) } catch (e) { window.__fl.push({ err: String(e) }) }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}, probe ? probe.toString() : null)
const stopFrames = (p) => p.evaluate(() => {
  window.__ftOn = false
  const t = window.__ft
  return { gaps: t.slice(1).map((v, i) => v - t[i]), looks: window.__fl, shift: window.__shifts.reduce((a, s) => a + s.value, 0), shifts: window.__shifts }
})

async function tapOrClick(p, sel, touch) {
  const box = await p.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    /* A pill past the edge of a row that scrolls sideways: the row is scrolled to it first, as a thumb would. */
    const row = el.closest("[data-pill-row]")
    if (row) {
      const rr = row.getBoundingClientRect()
      const er = el.getBoundingClientRect()
      if (er.left < rr.left || er.right > rr.right) row.scrollLeft += er.left < rr.left ? er.left - rr.left - 24 : er.right - rr.right + 24
    }
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, sel)
  if (!box) throw new Error(`nothing at ${sel}`)
  if (touch) await p.touchscreen.tap(box.x, box.y)
  else { await p.mouse.move(box.x, box.y); await sleep(60); await p.mouse.click(box.x, box.y) }
}

async function shot(p, name) {
  if (!SHOTS) return
  await p.screenshot({ path: join(SHOTS, `${name}.png`), captureBeyondViewport: false })
}

/* ── CONTRAST: the chosen pill's words on its fill ───────────────────── */
if (wants("contrast")) {
  console.log("\nThe chosen Settings pill can be read, light and dark, phone and computer")
  const SECTIONS = ["basic", "seo", "subscribe", "share", "verified", "billing"]
  for (const [label, vp, touch] of [["390", PHONE, true], ["1440", DESK, false]]) {
    for (const dark of [false, true]) {
      const { p, errors } = await open(vp, "settings", { dark })
      let worst = { computed: 99, pixels: 99 }
      const rows = []
      for (const id of SECTIONS) {
        await tapOrClick(p, `[data-pill-row="settings-pills"] [data-tab="${id}"]`, touch)
        await sleep(450)
        const got = await p.evaluate((id) => {
          const b = document.querySelector(`[data-pill-row="settings-pills"] [data-tab="${id}"]`)
          const word = b.querySelector("[data-pill-word]")
          const fill = b.querySelector("[data-pill-fill]")
          const cs = (e) => getComputedStyle(e)
          const r = b.getBoundingClientRect()
          const wr = word.getBoundingClientRect()
          return {
            selected: b.getAttribute("aria-selected"),
            text: word.textContent.trim(),
            textW: Math.round(wr.width),
            color: cs(word).color,
            wordOpacity: cs(word).opacity,
            fill: cs(fill).backgroundColor,
            fillOpacity: cs(fill).opacity,
            ground: cs(b).backgroundColor,
            page: getComputedStyle(document.querySelector("[data-settings-pills]")).backgroundColor,
            box: { x: r.x, y: r.y, w: r.width, h: r.height },
            pseudo: getComputedStyle(word, "::after").content,
          }
        }, id)
        const page = parseColor(got.page) ?? { r: 255, g: 255, b: 255, a: 1 }
        const ground = over(parseColor(got.ground), page)
        const f = parseColor(got.fill)
        const fill = over({ ...f, a: f.a * Number(got.fillOpacity) }, ground)
        const text = over({ ...parseColor(got.color), a: parseColor(got.color).a * Number(got.wordOpacity) }, fill)
        const computed = Math.round(ratio(text, fill) * 100) / 100
        /* The pixels: the pill's middle band, its darkest and its commonest colour. */
        const clip = { x: Math.round(Math.max(0, got.box.x + 6)), y: Math.round(Math.max(0, got.box.y + got.box.h * 0.25)), width: Math.round(Math.max(1, got.box.w - 12)), height: Math.round(Math.max(1, got.box.h * 0.5)) }
        const png = await p.screenshot({ clip, type: "png", captureBeyondViewport: false })
        const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
        const counts = new Map()
        let darkest = null
        let lightest = null
        for (let i = 0; i < data.length; i += info.channels) {
          const c = { r: data[i], g: data[i + 1], b: data[i + 2], a: 1 }
          const k = `${c.r},${c.g},${c.b}`
          counts.set(k, (counts.get(k) || 0) + 1)
          const l = lum(c)
          if (!darkest || l < lum(darkest)) darkest = c
          if (!lightest || l > lum(lightest)) lightest = c
        }
        const commonKey = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0].split(",").map(Number)
        const common = { r: commonKey[0], g: commonKey[1], b: commonKey[2], a: 1 }
        const ink = lum(common) > 0.5 ? darkest : lightest
        const pixels = Math.round(ratio(ink, common) * 100) / 100
        worst = { computed: Math.min(worst.computed, computed), pixels: Math.min(worst.pixels, pixels) }
        rows.push({ id, computed, pixels, text: got.text, color: got.color, fill: got.fill })
        expect(got.selected === "true" && got.text.length > 0 && got.textW > 4 && Number(got.wordOpacity) === 1, `${label} ${dark ? "dark" : "light"} ${id}: chosen, its words there and drawn as text`, { text: got.text, w: got.textW, after: got.pseudo })
        if (SHOTS && id === "seo") await shot(p, `r11-contrast-${label}-${dark ? "dark" : "light"}-seo`)
      }
      numbers[`contrast-${label}-${dark ? "dark" : "light"}`] = { worst, rows }
      expect(worst.computed >= 4.5 && worst.pixels >= 4.5, `${label} ${dark ? "dark" : "light"}: the chosen pill's words against its fill >= 4.5:1, computed and on screen`, worst)
      if (label === "1440" && !dark) {
        const shape = await p.evaluate(() => {
          const tabs = [...document.querySelectorAll('[data-pill-row="settings-pills"] [data-tab]')]
          const tops = new Set(tabs.map((t) => Math.round(t.getBoundingClientRect().top)))
          const row = document.querySelector('[data-pill-row="settings-pills"]').getBoundingClientRect()
          const card = document.querySelector('[data-settings-section="seo"]')?.getBoundingClientRect()
          return { rows: tops.size, tabs: tabs.length, rowTop: Math.round(row.top), cardTop: card ? Math.round(card.top) : null, listDownTheSide: !!document.querySelector('[data-pill-row="settings-list"]') }
        })
        expect(shape.rows === 1 && shape.tabs === 6 && !shape.listDownTheSide && shape.cardTop > shape.rowTop, "1440: Settings is one row of six pills over the section, no list down the side", shape)
      }
      expect(errors.length === 0, `${label} ${dark ? "dark" : "light"}: no page errors`, errors.slice(0, 2))
      await p.close()
    }
  }
}

/* ── SWITCH: the pills switch what is under them ─────────────────────── */
const panelLook = () => {
  const box = document.querySelector('[data-pill-panels="settings"]')
  const shown = [...document.querySelectorAll('[data-pill-panels="settings"] > [data-pill-panel]')].map((el) => Number(getComputedStyle(el).opacity) * (getComputedStyle(el).visibility === "hidden" ? 0 : 1))
  return { h: box ? Math.round(box.getBoundingClientRect().height) : -1, drawn: shown.filter((o) => o > 0.05).length, top: Math.max(0, ...shown) }
}
const themeLook = () => {
  const row = document.querySelector('[data-pill-row="theme-kinds"]')
  const grid = document.querySelector("[data-theme-grid]")
  const pills = row ? [...row.querySelectorAll("[data-tab]")].map((t) => { const r = t.getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}` }).join("|") : ""
  return { h: grid ? Math.round(grid.getBoundingClientRect().height) : -1, drawn: 1, top: 1, rowTop: row ? Math.round(row.getBoundingClientRect().top) : -1, pills: `${row ? row.scrollLeft : 0}:${pills}` }
}
if (wants("switch")) {
  console.log("\nA pill switch, frame by frame")
  for (const [label, vp, touch, cpu] of [["390", PHONE, true, 4], ["1440", DESK, false, 1]]) {
    /* Settings' sections */
    {
      const { p, errors } = await open(vp, "settings", { cpu })
      const all = []
      let blank = 0
      let double = 0
      let heights = new Set()
      let shift = 0
      let haptics0 = await p.evaluate(() => window.__vibes)
      for (const id of ["seo", "subscribe", "share", "verified", "billing", "basic"]) {
        await startFrames(p, panelLook)
        await tapOrClick(p, `[data-pill-row="settings-pills"] [data-tab="${id}"]`, touch)
        await sleep(cpu > 1 ? 700 : 400)
        const r = await stopFrames(p)
        all.push(...r.gaps)
        blank += r.looks.filter((l) => l.drawn === 0 || l.top < 0.5).length
        double += r.looks.filter((l) => l.drawn > 1).length
        for (const l of r.looks) heights.add(l.h)
        shift += r.shift
        if (SHOTS && id === "subscribe") await shot(p, `r11-settings-${label}`)
      }
      const haptics = (await p.evaluate(() => window.__vibes)) - haptics0
      const s = summarize(all)
      numbers[`settings-switch-${label}`] = { ...s, blank, double, heights: [...heights], shift, haptics }
      console.log(`  ${label} Settings: p50 ${s.p50}ms p95 ${s.p95}ms longest ${s.max}ms, dropped ${s.dropped}, blank frames ${blank}, two drawn ${double}, heights ${[...heights].join("/")}, shift ${shift.toFixed(4)}, haptics ${haptics}`)
      expect(blank === 0, `${label}: no frame without a section`, blank)
      expect(double === 0, `${label}: never two sections drawn at once`, double)
      expect(heights.size === 1, `${label}: the box under the pills never changes height`, [...heights])
      expect(shift < 0.001, `${label}: nothing shifts`, shift)
      expect(s.p95 <= 34, `${label}: p95 frame within two frames`, s)
      if (touch) expect(haptics === 6, `${label}: a light haptic tick for each finger's choice`, haptics)
      else expect(haptics === 0, `${label}: no haptics for a mouse`, haptics)
      expect(errors.length === 0, `${label}: no page errors`, errors.slice(0, 2))
      await p.close()
    }
    /* The Theme kinds' pill bar (the grid under it is the Theme panel's own) */
    {
      const { p, errors } = await open(vp, "design", { cpu })
      await tapOrClick(p, '[data-nav-row="theme"]', touch)
      await sleep(1200)
      const all = []
      let shift = 0
      const rowTops = new Set()
      let pillMoves = 0
      for (const id of ["light", "dark", "gradient", "image", "all"]) {
        const exists = await p.$(`[data-pill-row="theme-kinds"] [data-tab="${id}"]`)
        if (!exists) continue
        await startFrames(p, themeLook)
        await tapOrClick(p, `[data-pill-row="theme-kinds"] [data-tab="${id}"]`, touch)
        await sleep(cpu > 1 ? 700 : 400)
        const r = await stopFrames(p)
        all.push(...r.gaps)
        shift += r.shift
        for (const l of r.looks) rowTops.add(l.rowTop)
        /* The pills themselves hold still through the pick (the row may glide sideways to keep the pick in view: scrollLeft is part of the key, so only a pill that moves inside the row counts). */
        const shapes = new Set(r.looks.map((l) => l.pills.split(":")[1]))
        const scrolls = new Set(r.looks.map((l) => l.pills.split(":")[0]))
        if (shapes.size > scrolls.size) pillMoves++
      }
      const s = summarize(all)
      numbers[`theme-kinds-${label}`] = { ...s, shift, rowTops: [...rowTops] }
      console.log(`  ${label} Theme kinds: p50 ${s.p50}ms p95 ${s.p95}ms longest ${s.max}ms, dropped ${s.dropped}, shift ${shift.toFixed(4)}`)
      expect(rowTops.size === 1, `${label}: the Theme kinds' row never moves`, [...rowTops])
      expect(pillMoves === 0, `${label}: no pill in the Theme kinds' row moves or changes size on a pick`, pillMoves)
      /* The grid under the row is the Theme panel's own (its cards come and go on a pick): reported, not judged here. */
      console.log(`  ${label} layout shift in the theme grid under the row (THEMES' lane): ${shift.toFixed(4)}`)
      const look = await p.evaluate(() => {
        const b = document.querySelector('[data-pill-row="theme-kinds"] [aria-selected="true"]')
        return { word: getComputedStyle(b.querySelector("[data-pill-word]")).color, fill: getComputedStyle(b.querySelector("[data-pill-fill]")).backgroundColor }
      })
      expect(look.word === "rgb(26, 26, 46)" && look.fill === "rgb(226, 228, 232)", `${label}: the Theme kinds are Storelib's pills, ink on the light fill`, look)
      if (SHOTS) await shot(p, `r11-theme-kinds-${label}`)
      expect(errors.length === 0, `${label}: no page errors`, errors.slice(0, 2))
      await p.close()
    }
  }
}

/* ── PUSH: the Design list and its pages ─────────────────────────────── */
const pushLook = () => {
  const col = document.querySelector('[data-tab-panel="design"]') || document.querySelector("[data-design-stack]")?.closest("[data-scroll-container]")
  const r = col.getBoundingClientRect()
  const panel = document.querySelector("[data-design-stack] > [data-design-panel]:not([data-design-panel='home'])")
  const list = document.querySelector('[data-design-panel="home"]')
  const cs = (e) => (e ? getComputedStyle(e) : null)
  const m = (e) => { const t = cs(e)?.transform; return t && t !== "none" ? new DOMMatrixReadOnly(t).m42 : 0 }
  const vis = (e) => !!e && cs(e).display !== "none" && cs(e).visibility !== "hidden"
  /* Which page is drawn at a quarter and at two fifths down the column (geometry, transforms included: a page on its way is inert, and a hit test skips it). */
  const covers = (e, x, y) => { if (!vis(e) || Number(cs(e).opacity) < 0.05) return false; const b = e.getBoundingClientRect(); return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom }
  const at = [0.25, 0.4].map((f) => {
    const x = r.left + r.width / 2
    const y = r.top + r.height * f
    const top = Number(cs(panel)?.zIndex) > Number(cs(list)?.zIndex) ? [panel, list] : [list, panel]
    const hit = top.find((e) => e && covers(e, x, y))
    return hit ? hit.getAttribute("data-design-panel") : "none"
  })
  return { panelY: Math.round(m(panel)), panelOp: vis(panel) ? Number(cs(panel).opacity) : 0, listOp: vis(list) ? Number(cs(list).opacity) : 0, listX: list ? Math.round(list.getBoundingClientRect().left) : 0, at, scroll: document.querySelector("[data-design-stack]")?.closest("[data-scroll-container]")?.scrollTop ?? -1 }
}
if (wants("push")) {
  console.log("\nThe Design list and its pages, in and back")
  const ROWS = ["theme", "header", "wallpaper", "text", "buttons", "socials", "footer"]
  for (const [label, vp, touch, cpu] of [["390", PHONE, true, 4], ["1440", DESK, false, 1]]) {
    const { p, errors } = await open(vp, "design", { cpu })
    const gapsIn = []
    const gapsBack = []
    let blank = 0
    let ghost = 0
    let sideways = 0
    let shift = 0
    const listScrolls = []
    for (const row of ROWS) {
      await startFrames(p, pushLook)
      await tapOrClick(p, `[data-nav-row="${row}"]`, touch)
      await sleep(cpu > 1 ? 900 : 500)
      let r = await stopFrames(p)
      gapsIn.push(...r.gaps)
      if (process.env.DEBUG) console.log(row, JSON.stringify(r.looks.filter((l) => l.at.some((a) => a === "none" || a === "other")).slice(0, 3)))
      blank += r.looks.filter((l) => l.at.every((a) => a === "none" || a === "other")).length
      /* Two pages' words on the glass at once: both drawn part way (the old crossfade). */
      ghost += r.looks.filter((l) => l.panelOp > 0.05 && l.panelOp < 0.95 && l.listOp > 0.05 && l.listOp < 0.95).length
      const x0 = r.looks.find((l) => l.listOp > 0)?.listX
      sideways += r.looks.filter((l) => l.listOp > 0 && Math.abs(l.listX - x0) > 1).length
      shift += r.shift
      if (SHOTS && row === "theme") {
        await startFrames(p)
        await tapOrClick(p, "[data-panel-header-back], [aria-label='Back to Design']", touch).catch(async () => { await p.click("[aria-label='Back to Design']") })
        await sleep(cpu > 1 ? 120 : 60)
        await shot(p, `r11-design-pop-mid-${label}`)
        await sleep(900)
        await stopFrames(p)
        await tapOrClick(p, `[data-nav-row="${row}"]`, touch)
        await sleep(cpu > 1 ? 140 : 40)
        await shot(p, `r11-design-push-mid-${label}`)
        await sleep(900)
        await shot(p, `r11-design-theme-${label}`)
      }
      await startFrames(p, pushLook)
      const back = await p.$("[aria-label='Back to Design']")
      if (touch && back) {
        const bb = await back.boundingBox()
        await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2)
      } else await back?.click()
      await sleep(cpu > 1 ? 900 : 500)
      r = await stopFrames(p)
      gapsBack.push(...r.gaps)
      if (process.env.DEBUG) console.log("back", JSON.stringify(r.looks.filter((l) => l.at.some((a) => a === "none" || a === "other")).slice(0, 3)))
      blank += r.looks.filter((l) => l.at.every((a) => a === "none" || a === "other")).length
      ghost += r.looks.filter((l) => l.panelOp > 0.05 && l.panelOp < 0.95 && l.listOp > 0.05 && l.listOp < 0.95).length
      shift += r.shift
      listScrolls.push(r.looks.at(-1)?.scroll)
    }
    const sIn = summarize(gapsIn)
    const sBack = summarize(gapsBack)
    numbers[`design-push-${label}`] = { in: sIn, back: sBack, blank, ghost, sideways, shift }
    console.log(`  ${label} in:   p50 ${sIn.p50}ms p95 ${sIn.p95}ms longest ${sIn.max}ms dropped ${sIn.dropped}`)
    console.log(`  ${label} back: p50 ${sBack.p50}ms p95 ${sBack.p95}ms longest ${sBack.max}ms dropped ${sBack.dropped}`)
    expect(blank === 0, `${label}: every frame has a whole page over the column`, blank)
    expect(ghost === 0, `${label}: never two pages half drawn over each other (no crossfade)`, ghost)
    expect(sideways === 0, `${label}: the list never moves sideways`, sideways)
    expect(shift < 0.001, `${label}: nothing shifts`, shift)
    expect(sIn.p95 <= 34 && sBack.p95 <= 34, `${label}: p95 within two frames, in and back`, { in: sIn.p95, back: sBack.p95 })
    expect(errors.length === 0, `${label}: no page errors`, errors.slice(0, 2))
    if (SHOTS) await shot(p, `r11-design-list-${label}`)
    await p.close()
  }
}

/* ── TABBAR: the phone's four tabs under a finger ────────────────────── */
if (wants("tabbar")) {
  console.log("\nThe phone's tab bar under a finger (390, CPU 4x)")
  const { p, errors, cdp } = await open(PHONE, "links", { cpu: 4 })
  const boxes = () => p.evaluate(() => [...document.querySelectorAll('[data-onepage-tabbar] [data-tab], [data-onepage-tabbar] [data-tab] svg, [data-onepage-tabbar] [data-tab-word]')].map((el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return { x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, scale: cs.scale, transform: cs.transform }
  }))
  const styleOf = () => p.evaluate(() => [...document.querySelectorAll('[data-onepage-tabbar] [data-tab]')].map((b) => ({ id: b.getAttribute("data-tab"), on: b.getAttribute("aria-pressed"), bg: getComputedStyle(b).backgroundColor, border: getComputedStyle(b).borderColor, scale: getComputedStyle(b).scale, transform: getComputedStyle(b).transform, hover: b.matches(":hover") })))
  const start = await boxes()
  let moved = 0
  let scaled = 0
  let hoverOnly = 0
  let shift = 0
  const gaps = []
  const v0 = await p.evaluate(() => window.__vibes)
  for (const id of ["design", "products", "settings", "links"]) {
    const bb = await p.evaluate((id) => { const r = document.querySelector(`[data-onepage-tabbar] [data-tab="${id}"]`).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }, id)
    const before = await styleOf()
    await startFrames(p)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: bb.x, y: bb.y }] })
    await sleep(120)
    const during = await boxes()
    const pressed = await styleOf()
    /* A finger sliding a little across the button, as a thumb does. */
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: bb.x + 3, y: bb.y + 1 }] })
    await sleep(40)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await sleep(700)
    const r = await stopFrames(p)
    gaps.push(...r.gaps)
    shift += r.shift
    const after = await boxes()
    const settled = await styleOf()
    for (const set of [during, after]) for (let i = 0; i < start.length; i++) {
      const a = start[i]
      const b = set[i]
      if (!b || Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) > 0.5 || Math.abs(a.w - b.w) > 0.5 || Math.abs(a.h - b.h) > 0.5) moved++
    }
    scaled += [...during, ...after].filter((b) => (b.scale !== "none" && b.scale !== "1") || (b.transform !== "none" && !/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(b.transform))).length
    /* A style on a button whose state did not change, after the finger is gone: what a hover left behind. */
    for (let i = 0; i < settled.length; i++) {
      const a = before[i]
      const b = settled[i]
      if (a.on === b.on && (a.bg !== b.bg || a.border !== b.border)) hoverOnly++
    }
    numbers[`tabbar-press-${id}`] = { pressedBg: pressed.find((x) => x.id === id)?.bg, hoverAfter: settled.find((x) => x.id === id)?.hover }
  }
  /*
    A touch through the protocol is not always pressed (:active) the way a real finger is, so the pressed and hovered
    states are also forced on each button in turn (CSS.forcePseudoState), and its boxes read under them.
  */
  await cdp.send("DOM.enable")
  await cdp.send("CSS.enable")
  const { root } = await cdp.send("DOM.getDocument", { depth: -1 })
  const { nodeIds } = await cdp.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: "[data-onepage-tabbar] [data-tab]" })
  const rest = await boxes()
  let forcedMoved = 0
  let forcedScaled = 0
  for (const nodeId of nodeIds) {
    await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["active", "hover"] })
    await sleep(300)
    const f = await boxes()
    for (let i = 0; i < rest.length; i++) {
      const a = rest[i]
      const b = f[i]
      if (Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) > 0.5 || Math.abs(a.w - b.w) > 0.5 || Math.abs(a.h - b.h) > 0.5) forcedMoved++
      if ((b.scale !== "none" && b.scale !== "1") || (b.transform !== "none" && !/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(b.transform))) forcedScaled++
    }
    await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] })
  }
  numbers.tabbarForced = { forcedMoved, forcedScaled }
  expect(forcedMoved === 0 && forcedScaled === 0, "pressed and hovered (forced), no button, icon or word moves, grows or shrinks", { forcedMoved, forcedScaled })
  const vibes = (await p.evaluate(() => window.__vibes)) - v0
  const s = summarize(gaps)
  numbers.tabbar = { ...s, moved, scaled, hoverOnly, shift, vibes }
  console.log(`  frames: p50 ${s.p50}ms p95 ${s.p95}ms longest ${s.max}ms dropped ${s.dropped}`)
  expect(moved === 0, "no button, icon or word moves or changes size during or after a tap", moved)
  expect(scaled === 0, "nothing in the bar is scaled or transformed by a press", scaled)
  expect(hoverOnly === 0, "a finger leaves no hover style behind on a button it did not choose", hoverOnly)
  expect(shift < 0.001, "zero layout shift around the taps", shift)
  expect(vibes === 4, "a light haptic tick for each tab tapped", vibes)
  /* The pills too: a finger on a pill that it does not choose (it slides off) leaves nothing behind. */
  await p.evaluate(() => { location.hash = "settings" })
  await sleep(1500)
  const pill = await p.evaluate(() => { const b = document.querySelector('[data-pill-row="settings-pills"] [data-tab="share"]'); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, color: getComputedStyle(b.querySelector("[data-pill-word]")).color, border: getComputedStyle(b).borderColor } })
  if (pill.x) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: pill.x, y: pill.y }] })
    await sleep(80)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: pill.x, y: pill.y + 60 }] })
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await sleep(500)
    const afterPill = await p.evaluate(() => { const b = document.querySelector('[data-pill-row="settings-pills"] [data-tab="share"]'); return { color: getComputedStyle(b.querySelector("[data-pill-word]")).color, border: getComputedStyle(b).borderColor, scale: getComputedStyle(b).scale, sel: b.getAttribute("aria-selected"), hoverMedia: matchMedia("(hover: hover)").matches } })
    numbers.pillHover = { before: pill, after: afterPill }
    expect(afterPill.color === pill.color && afterPill.border === pill.border && afterPill.scale === "none", "a finger that lands on a pill and slides off leaves its colour, border and size alone", afterPill)
  }
  if (SHOTS) await shot(p, "r11-tabbar-390")
  expect(errors.length === 0, "no page errors", errors.slice(0, 2))
  await p.close()
}

await browser.close()
server.close()

/* ── EXIT: leaving the editor, every way, in the real /app shell ─────── */
if (wants("exit")) {
  const { runExitProbe } = await import("./onepage-exit-probe.mjs")
  const r = await runExitProbe({ shots: SHOTS })
  numbers.exit = r.numbers
  for (const c of r.checks) expect(c.ok, c.what, c.got)
}

if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(numbers, null, 2))
console.log(`\n${broken ? `${broken} FAILED` : "all passed"}`)
process.exit(broken ? 1 : 0)
