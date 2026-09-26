/**
 * ===========================================================================
 *  THE ONEPAGE EDITOR'S CONTROLS, MEASURED
 * ===========================================================================
 * The real editor (scripts/onepage-probe-server.mjs), at 1440 with a mouse and
 * at 390 with a finger through Chromium's own input pipeline.
 *
 *   sliders   a drag moves the number with the thumb, live; a finger feels
 *             stops (navigator.vibrate, which hapticTap uses in a browser);
 *             the sheet or page under it does not move.
 *
 *   node scripts/check-onepage-design.mjs
 *   SHOTS=/some/dir node scripts/check-onepage-design.mjs
 */
import { existsSync, mkdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-onepage-design-"))
mkdirSync(shots, { recursive: true })

const { base, server } = await serveEditorProbe({ root, fail })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const frames = (p, n = 2) => p.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f) }), n)
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })

const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const DESKTOP = { width: 1440, height: 900 }

async function open(vp, hash = "design") {
  const p = await browser.newPage()
  await p.setViewport(vp)
  /* hapticTap falls back to navigator.vibrate in a browser: count the calls. */
  await p.evaluateOnNewDocument(() => {
    window.__vibrations = 0
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: () => { window.__vibrations++; return true } })
    try { sessionStorage.clear() } catch {}
  })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::/.test(m.text())) errors.push(m.text()) })
  await p.goto(`${base}/app/onepage#${hash}`)
  await p.waitForSelector("[data-scroll-container]")
  await sleep(900)
  return { p, errors }
}
const touchOf = async (p) => {
  const cdp = await p.target().createCDPSession()
  return (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] })
}

/* ── SLIDERS ── */
for (const [label, vp] of [["desktop-1440", DESKTOP], ["phone-390", PHONE]]) {
  console.log(`\n${label}: sliders`)
  const phone = vp.width < 640
  const { p, errors } = await open(vp)
  await p.click('[data-nav-row="buttons"]')
  await sleep(500)
  const row = await p.$$("[data-range-row]")
  expect(row.length === 2, "Buttons has its two sliders, Corners and Border", row.length)
  const thumb = await p.$eval("[data-range-row] [data-slot=slider-thumb]", (t) => { t.scrollIntoView({ block: "center" }); const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await sleep(200)
  const t0 = await p.$eval("[data-range-row] [data-slot=slider-thumb]", (t) => { const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  const track = await p.$eval("[data-range-row] [data-slot=slider-track]", (t) => { const r = t.getBoundingClientRect(); return { left: r.left, width: r.width } })
  const read = () => p.$eval("[data-range-row] input", (i) => i.value)
  const scroll0 = await p.$eval("[data-scroll-container]", (e) => e.scrollTop)
  const values = []
  const touch = phone ? await touchOf(p) : null
  if (phone) await touch("touchStart", t0.x, t0.y)
  else { await p.mouse.move(t0.x, t0.y); await p.mouse.down() }
  const commits0 = await p.evaluate(() => window.__commits)
  for (let k = 1; k <= 10; k++) {
    const x = Math.min(track.left + track.width - 2, t0.x + (k * track.width) / 14)
    if (phone) await touch("touchMove", x, t0.y + (k % 2))
    else await p.mouse.move(x, t0.y)
    await frames(p, 2)
    values.push(await read())
  }
  if (phone) await touch("touchEnd")
  else await p.mouse.up()
  await sleep(300)
  const commits = (await p.evaluate(() => window.__commits)) - commits0
  const nums = values.map((v) => parseFloat(v))
  const changes = nums.filter((v, i) => i && v !== nums[i - 1]).length
  expect(changes >= 6, "the number follows the thumb while it is dragged", values)
  const thumbAfter = await p.$eval("[data-range-row] [data-slot=slider-thumb]", (t) => t.getBoundingClientRect().left + t.getBoundingClientRect().width / 2)
  expect(thumbAfter > t0.x + track.width * 0.4, "and the thumb went with the pointer", { from: Math.round(t0.x), to: Math.round(thumbAfter) })
  expect(commits <= 40, "React is told at most about once a frame", { commits })
  const scroll1 = await p.$eval("[data-scroll-container]", (e) => e.scrollTop)
  expect(scroll1 === scroll0, "the page under it did not move", { before: scroll0, after: scroll1 })
  const vib = await p.evaluate(() => window.__vibrations)
  if (phone) expect(vib >= 3 && vib <= 14, "a finger feels its stops, not every event", { taps: vib })
  else expect(vib === 0, "a mouse gets no taps", { taps: vib })
  const preview = await p.evaluate(() => window.__commits)
  await p.screenshot({ path: join(shots, `${label}-slider.png`) })
  expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
  void preview
  await p.close()
}

/* ── A LINK'S STATS: the OnePage chart from Analytics ── */
for (const [label, vp] of [["desktop-1440", DESKTOP], ["phone-390", PHONE]]) {
  console.log(`\n${label}: a link's stats`)
  const { p, errors } = await open(vp, "links")
  await p.click('[data-block-id="b1"] button[title="View Stats"]')
  await p.waitForSelector("[data-link-stats]")
  await sleep(1200)
  const chart = await p.$eval("[data-link-stats]", (root) => {
    const line = root.querySelector("[data-trend-line]")
    const area = root.querySelector(".trend-area")
    const stop = root.querySelector("linearGradient stop")
    const tabs = [...root.querySelectorAll("[role=tab]")].map((t) => t.textContent.trim().slice(0, 20))
    return {
      stroke: line?.getAttribute("stroke"),
      drawn: (line?.getAttribute("d") || "").length > 20,
      fill: area?.getAttribute("fill"),
      filled: (area?.getAttribute("d") || "").length > 20,
      gradient: stop ? [stop.getAttribute("stop-color"), stop.getAttribute("stop-opacity")] : null,
      tabs,
      dates: root.querySelectorAll(".recharts-cartesian-axis-tick").length,
    }
  })
  expect(chart.drawn && chart.filled && /^url\(#trend-fill/.test(chart.fill), "the line and the gradient under it are drawn", chart)
  expect(chart.stroke === "#1a1a2e" && chart.gradient?.[0] === "#1a1a2e", "in the editor's ink, not violet", { stroke: chart.stroke, gradient: chart.gradient })
  expect(chart.tabs.length === 2 && /Views/.test(chart.tabs[0]) && /Clicks/.test(chart.tabs[1]), "two figures above it, Views and Clicks", chart.tabs)
  const before = await p.$eval("[data-link-stats] [data-trend-line]", (l) => l.getAttribute("d"))
  await p.click('[data-link-stats] [data-tab="views"]')
  await sleep(800)
  const after = await p.$eval("[data-link-stats] [data-trend-line]", (l) => l.getAttribute("d"))
  expect(before !== after, "a figure moves the line to its numbers", { changed: before !== after })
  await p.screenshot({ path: join(shots, `${label}-link-stats.png`) })
  expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
  await p.close()
}

/* ── FONTS: the app's sheet on a phone, a dropdown on a computer, faces drawn as rows come into view ── */
for (const [label, vp] of [["desktop-1440", DESKTOP], ["phone-390", PHONE]]) {
  console.log(`\n${label}: fonts`)
  const phone = vp.width < 640
  const { p, errors } = await open(vp)
  await p.click('[data-nav-row="text"]')
  await sleep(600)
  /* Every frame's length while the list opens: a stutter is a long one. */
  await p.evaluate(() => { window.__gaps = []; let last = performance.now(); const f = (t) => { window.__gaps.push(t - last); last = t; if (window.__gaps.length < 45) requestAnimationFrame(f) }; requestAnimationFrame(f) })
  await p.click('[data-font-picker="Page font"]')
  await sleep(900)
  const gaps = await p.evaluate(() => window.__gaps.slice(1))
  const seen = await p.evaluate(() => {
    const list = document.querySelector("[data-font-sheet], [data-font-popover]")
    const sheet = list?.closest("[data-sheet-panel]")
    const t = sheet ? getComputedStyle(sheet).transform : null
    const trigger = document.querySelector('[data-font-picker="Page font"]').getBoundingClientRect()
    const box = list?.getBoundingClientRect()
    const samples = [...(list?.querySelectorAll("[data-font-sample]") ?? [])]
    return {
      kind: list?.hasAttribute("data-font-sheet") ? "sheet" : list?.hasAttribute("data-font-popover") ? "popover" : null,
      settledAt: t === null ? null : t === "none" ? 0 : new DOMMatrixReadOnly(t).m42,
      under: box ? Math.round(box.top - trigger.bottom) : null,
      rows: list?.querySelectorAll("[data-font-option]").length ?? 0,
      ready: samples.filter((s) => s.getAttribute("data-font-sample") === "ready").length,
      waiting: samples.filter((s) => s.getAttribute("data-font-sample") === "waiting").length,
    }
  })
  if (phone) expect(seen.kind === "sheet" && Math.abs(seen.settledAt) < 1, "on a phone the list is the app's sheet, risen all the way", seen)
  else expect(seen.kind === "popover" && seen.under >= 4 && seen.under <= 12, "on a computer it drops down under the field", seen)
  expect(seen.rows >= 20, "every font is offered", seen.rows)
  expect(seen.waiting > 0, "rows out of view have not asked for their face yet", { ready: seen.ready, waiting: seen.waiting })
  console.log(`        longest frame while it opened: ${Math.round(Math.max(...gaps))}ms`)
  await p.screenshot({ path: join(shots, `${label}-fonts.png`) })
  await p.click('[data-font-option="Playfair Display"]')
  await sleep(700)
  const picked = await p.$eval('[data-font-picker="Page font"]', (b) => b.textContent)
  expect(/Playfair Display/.test(picked), "a pick is the page's font, and the list goes away", picked)
  const left = await p.evaluate(() => { const l = document.querySelector("[data-font-popover]"); return !!l && l.getBoundingClientRect().height > 0 })
  expect(!left, "nothing of the list is left on screen")
  expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
  await p.close()
}

/* Purple is a hue between 250 and 300 degrees with some colour in it, in any colour a subtree paints, gradients included. */
const purpleIn = (p, sel) => p.$$eval(sel, (roots) => {
  const found = []
  const hue = (r, g, b) => {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
    if (mx - mn < 30) return null
    let h = mx === r ? (g - b) / (mx - mn) : mx === g ? 2 + (b - r) / (mx - mn) : 4 + (r - g) / (mx - mn)
    h *= 60
    return h < 0 ? h + 360 : h
  }
  for (const root of roots) for (const el of [root, ...root.querySelectorAll("*")]) {
    const cs = getComputedStyle(el)
    for (const prop of ["borderTopColor", "backgroundColor", "backgroundImage", "boxShadow", "color"]) {
      for (const m of String(cs[prop]).matchAll(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/g)) {
        if (m[4] !== undefined && Number(m[4]) < 0.05) continue
        const h = hue(+m[1], +m[2], +m[3])
        if (h !== null && h >= 250 && h <= 300) found.push(`${root.getAttribute("data-theme-card") || root.getAttribute("data-pattern-choice") || ""} ${prop} ${m[0]}`)
      }
    }
  }
  return found
})

/* ── THEMES: every one a small page, none of them violet, two new ── */
for (const [label, vp] of [["desktop-1440", DESKTOP], ["phone-390", PHONE]]) {
  console.log(`\n${label}: themes`)
  const { p, errors } = await open(vp)
  await p.click('[data-nav-row="theme"]')
  await sleep(900)
  const cards = await p.$$eval("[data-theme-card]", (els) => els.map((e) => e.getAttribute("data-theme-card")))
  expect(cards.length === 18 && cards.includes("riso") && cards.includes("olive"), "eighteen themes, Riso and Olive among them", cards)
  const purple = await purpleIn(p, "[data-theme-card]")
  expect(purple.length === 0, "no violet in any of them", purple.slice(0, 4))
  const faces = await p.$$eval("[data-theme-card]", (els) => new Set(els.map((e) => getComputedStyle(e.querySelector("span span.font-bold")).fontFamily.split(",")[0])).size)
  expect(faces >= 8, "the names are drawn in their themes' own title faces", { faces })
  await p.screenshot({ path: join(shots, `${label}-themes.png`) })
  await p.evaluate(() => document.querySelector("[data-theme-card=olive]")?.scrollIntoView({ block: "center" }))
  await sleep(300)
  await p.screenshot({ path: join(shots, `${label}-themes-more.png`) })
  await p.click("[data-theme-card=riso]")
  await sleep(600)
  /* The check is always there now, faded in on the pick (editor-kit CheckMark): read that it is shown here and not on another card. */
  const picked = await p.$eval("[data-theme-card=riso]", (b) => {
    const shown = (card) => Number(getComputedStyle(card.querySelector("[data-check-mark]")).opacity) > 0.95
    const other = document.querySelector("[data-theme-card]:not([data-theme-card=riso])")
    return { pressed: b.getAttribute("aria-pressed"), check: shown(b) && !!other && !shown(other) }
  })
  expect(picked.pressed === "true" && picked.check, "a pick is marked with the dark border and a check", picked)
  if (vp.width >= 768) {
    /* The phone beside the editor is a frame of the live page now (components/onepage/live-preview): its pattern is read in the frame's document. */
    const handle = await p.$(".hidden.md\\:block [data-onepage-preview-frame][data-drawn]")
    const frame = handle && (await handle.contentFrame())
    const preview = frame ? await frame.evaluate(() => document.querySelector("[data-wallpaper-pattern]")?.getAttribute("data-wallpaper-pattern") ?? null) : null
    expect(preview === "dots", "and the preview beside it takes the theme, texture and all", preview)
  }
  expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
  await p.close()
}

/* ── PATTERNS: squares of the page's own wallpaper, textures and patterns apart ── */
for (const [label, vp] of [["desktop-1440", DESKTOP], ["phone-390", PHONE]]) {
  console.log(`\n${label}: patterns`)
  const { p, errors } = await open(vp)
  await p.click('[data-nav-row="wallpaper"]')
  await sleep(600)
  const groups = await p.evaluate(() => ({
    textures: [...document.querySelectorAll('[data-pattern-group="textures"] [data-pattern-choice]')].map((b) => b.getAttribute("data-pattern-choice")),
    patterns: document.querySelectorAll('[data-pattern-group="patterns"] [data-pattern-choice]').length,
    drawn: [...document.querySelectorAll("[data-pattern-choice] [data-wallpaper-pattern]")].filter((e) => getComputedStyle(e).backgroundImage.startsWith('url("data:image/svg')).length,
  }))
  expect(groups.textures.join() === "none,grain,paper,linen" && groups.patterns === 13, "None and the three textures, then thirteen patterns", groups)
  expect(groups.drawn === 16, "every square draws its pattern with the page's own function", groups.drawn)
  await p.click('[data-pattern-choice="dots"]')
  await sleep(400)
  const on = await p.$eval('[data-pattern-choice="dots"]', (b) => {
    const shown = (tile) => Number(getComputedStyle(tile.querySelector("[data-check-mark]")).opacity) > 0.95
    const other = document.querySelector('[data-pattern-choice="none"]')
    return { pressed: b.getAttribute("aria-pressed"), check: shown(b) && !!other && !shown(other) }
  })
  expect(on.pressed === "true" && on.check, "a pick is marked with the dark border and a check", on)
  const purple = await purpleIn(p, "[data-pattern-choice]")
  expect(purple.length === 0, "no violet", purple.slice(0, 3))
  await p.evaluate(() => document.querySelector('[data-pattern-group="textures"]')?.scrollIntoView({ block: "start" }))
  await sleep(300)
  await p.screenshot({ path: join(shots, `${label}-patterns.png`) })
  expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
  await p.close()
}

/* ── THE LIVE PAGE IN EVERY THEME ── */
{
  console.log("\nlive-390: every theme")
  const ids = ["default", "air", "studio", "cream", "riso", "blocks", "sunset", "peach", "ocean", "aurora", "olive", "astrid", "night", "midnight", "space", "neon", "nature", "fusion"]
  const p = await browser.newPage()
  await p.setViewport(PHONE)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  const seen = []
  for (const id of ids) {
    await p.goto(`${base}/app/onepage?live&template=${id}`)
    await p.waitForSelector(".onepage-live")
    await sleep(350)
    const r = await p.evaluate(() => {
      const shown = [...document.querySelectorAll(".onepage-live")].find((e) => e.getClientRects().length)
      const pattern = shown?.querySelector("[data-wallpaper-pattern]")
      const btn = [...(shown?.querySelectorAll("a, button") ?? [])].find((b) => b.textContent.trim() === "Shop the prints")
      return { pattern: pattern ? pattern.getAttribute("data-wallpaper-pattern") : null, button: !!btn, font: shown ? getComputedStyle(shown).fontFamily.split(",")[0] : null }
    })
    seen.push({ id, ...r })
    if (["riso", "olive", "blocks", "sunset", "aurora", "night", "fusion", "air"].includes(id)) await p.screenshot({ path: join(shots, `live-390-${id}.png`) })
  }
  expect(seen.every((x) => x.button), "every theme draws the page and its buttons", seen.filter((x) => !x.button).map((x) => x.id))
  const want = { riso: "dots", olive: "linen", blocks: "grid", sunset: "grain", aurora: null, night: null }
  const wrong = Object.entries(want).filter(([id, pat]) => seen.find((x) => x.id === id)?.pattern !== pat)
  expect(wrong.length === 0, "the new and redrawn themes draw their textures on the live page", seen.filter((x) => x.id in want).map((x) => `${x.id}:${x.pattern}:${x.font}`))
  expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
  await p.close()
}

/* ── SHARE YOUR ONEPAGE: the app's sheet on a phone, a dialog from 768px ── */
for (const [label, vp] of [["desktop-1440", DESKTOP], ["phone-390", PHONE]]) {
  console.log(`\n${label}: share`)
  const phone = vp.width < 640
  const { p, errors } = await open(vp, "links")
  if (phone) await p.click("[data-onepage-share]")
  else await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Share your OnePage" && b.getClientRects().length)?.click())
  await sleep(700)
  const seen = await p.evaluate(() => {
    const body = document.querySelector("[data-share-onepage]")
    const sheet = body?.closest("[data-sheet-panel]")
    const dialog = body?.closest("[role=dialog]")
    const t = sheet ? getComputedStyle(sheet).transform : null
    return {
      shown: !!body && body.getBoundingClientRect().height > 100,
      inSheet: !!sheet,
      settledAt: t === null ? null : t === "none" ? 0 : new DOMMatrixReadOnly(t).m42,
      inDialog: !!dialog && !sheet,
      copy: !!body?.querySelector("[data-share-copy]"),
    }
  })
  if (phone) expect(seen.shown && seen.inSheet && Math.abs(seen.settledAt) < 1, "on a phone it is the app's bottom sheet, risen all the way", seen)
  else expect(seen.shown && seen.inDialog && !seen.inSheet, "from 768px it is a dialog", seen)
  expect(seen.copy, "with the address to copy")
  await p.screenshot({ path: join(shots, `${label}-share.png`) })
  await p.keyboard.press("Escape")
  await sleep(700)
  const gone = await p.evaluate(() => { const b = document.querySelector("[data-share-onepage]"); return !b || b.getBoundingClientRect().height === 0 || !b.closest("[data-app-sheet=open], [role=dialog][data-state=open]") })
  expect(gone, "Escape puts it away")
  expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
  await p.close()
}

await browser.close()
server.close()
console.log(`\nshots in ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
