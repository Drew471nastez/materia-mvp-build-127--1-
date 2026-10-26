/**
 * ===========================================================================
 *  ASK STORELIB ON A PHONE: NOTHING PAST THE SHEET'S EDGE, AND A CLEAN CLOSE
 *  (round 18)
 * ===========================================================================
 * The owner, with a picture of the thread cut off at the right: "on mobile
 * the Ask Storelib AI bugs and glitches ... it's shifted layout", and "when I
 * try to close it, it flashes".
 *
 * The real editor (scripts/editor-probe-harness.mjs) at 390x844 with touch.
 * The Ask sheet is opened from the bar, and an answer is streamed
 * (render-editor-probe.tsx PROBE_AGENT_STREAM) with what does not wrap by
 * itself: a long address, a long name in code, a block of code, a long
 * prompt with no spaces. Then:
 *
 *   WIDTH     no element in the sheet ends past the sheet's right edge, and
 *             no scroller in it scrolls sideways (except a code block's own)
 *   STEADY    the thread's left edge stays where it was from the first line
 *             of the answer to the last
 *   CLOSE     the close button pressed, every frame until the sheet is gone:
 *             its top only moves down, its opacity only falls, what it shows
 *             is never emptied while it is still on screen, and the dim
 *             behind it only fades out
 *   SMOOTH    frames dropped and the longest task during the close
 *
 *   npx tsx scripts/check-ask-sheet-r18.mjs
 *   CPU=4   EDITOR_BUNDLE=<file>   BUDGET=0   SHOTS=<dir>
 */
import { mkdirSync } from "node:fs"
import { join } from "node:path"

process.env.PROBE_CSS = process.env.PROBE_CSS ?? "source"
const { bundle, css } = await import("./editor-probe-harness.mjs")
const { openEditor, sleep, STORELIB_GLOBALS } = await import("./canvas-probe-kit.mjs")

const CPU = Number(process.env.CPU ?? 1)
const W = Number(process.env.WIDTH ?? 390)
const BUDGET = process.env.BUDGET !== "0"
const SHOTS = process.env.SHOTS ?? ""
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : BUDGET ? "FAIL" : "note"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 400)})`}`)
  if (!ok && BUDGET) broken++
}

const LONG_URL = "https://storelib.com/store/andrewrullz/themes/afef93fd-5d1c-4b4e-9a54-0c2f6a1d7e11/editor?section=featured_collection_with_a_very_long_identifier"
const ANSWER = [
  "Here is what I changed.",
  "",
  `The link now points to ${LONG_URL} and the section reads \`featured_collection_settings_heading_text_color_override_value\` from its settings.`,
  "",
  "```css",
  ".featured-collection__heading--with-a-very-long-modifier-name { color: var(--color-foreground-heading-very-long-variable-name); letter-spacing: 0.02em; }",
  "```",
  "",
  "Supercalifragilisticexpialidocious_and_more_words_joined_with_underscores_so_nothing_breaks_them",
].join("\n")
const LINES = [
  { type: "subject", text: "Updating featured_collection_with_a_very_long_identifier" },
  { type: "step", label: `Reading ${LONG_URL}` },
  { type: "step", label: "Changing the heading" },
  { type: "message", text: ANSWER },
]

const WATCH = String.raw`
(function () {
  var W = window.__as = { on: false, rows: [], longs: [], t: [] }
  try { new PerformanceObserver(function (l) { if (!W.on) return; l.getEntries().forEach(function (e) { W.longs.push(Math.round(e.duration)) }) }).observe({ type: "longtask" }) } catch (e) {}
  /* Found once a close starts and kept: a probe that searched the page every frame was much of the cost it measured. */
  var view = null, sheet = null, scrim = null
  var tick = function (t) {
    if (W.on) {
      W.t.push(t)
      if (!view || !view.isConnected) {
        view = document.querySelector("[data-ask-view]")
        sheet = view ? view.closest("[data-mobile-bottom-sheet]") : null
        scrim = document.querySelector("[data-mobile-sheet-backdrop], [data-sheet-backdrop]")
      }
      var r = sheet && sheet.isConnected ? sheet.getBoundingClientRect() : null
      var cs = sheet && sheet.isConnected ? getComputedStyle(sheet) : null
      W.rows.push({
        t: Math.round(t),
        top: r ? Math.round(r.top) : null,
        h: r ? Math.round(r.height) : null,
        opacity: cs ? Math.round(parseFloat(cs.opacity) * 100) / 100 : null,
        visibility: cs ? cs.visibility : null,
        content: view && view.isConnected ? view.childElementCount : 0,
        text: view && view.isConnected ? (view.textContent || "").length : 0,
        scrim: scrim ? Math.round(parseFloat(getComputedStyle(scrim).opacity) * 100) / 100 : null,
        bg: cs ? cs.backgroundColor : null,
      })
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})()
`

/* Every element in the sheet that ends past its right edge, and every sideways scroller in it. */
const OVERFLOW = () => {
  const view = document.querySelector("[data-ask-view]")
  const sheet = view?.closest("[data-mobile-bottom-sheet]")
  if (!view || !sheet) return { found: false }
  const s = sheet.getBoundingClientRect()
  const past = []
  const inCode = (el) => !!el.closest("pre")
  for (const el of sheet.querySelectorAll("*")) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    /* Inside a code block that scrolls by itself: its own business, cut by it. */
    if (inCode(el) && el.tagName !== "PRE") continue
    /* The suggestions are a row that scrolls sideways by design, cut by its own edge. */
    if (el.closest("[data-ask-suggestions]")) continue
    if (r.right > s.right + 0.5 || r.left < s.left - 0.5) past.push(`${el.tagName.toLowerCase()}${el.getAttribute("data-ask-view") !== null ? "[data-ask-view]" : ""}.${String(el.className).slice(0, 50)} ${Math.round(r.left)}..${Math.round(r.right)}`)
  }
  const sideways = []
  for (const el of sheet.querySelectorAll("*")) {
    if (el.tagName === "PRE" || el.closest("pre") || el.matches("[data-ask-suggestions]")) continue
    if (el.scrollWidth > el.clientWidth + 1) {
      const ox = getComputedStyle(el).overflowX
      if (ox === "auto" || ox === "scroll") sideways.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)} ${el.scrollWidth}>${el.clientWidth}`)
    }
  }
  return { found: true, sheet: [Math.round(s.left), Math.round(s.right)], past: past.slice(0, 12), pastCount: past.length, sideways: sideways.slice(0, 6), docSideways: document.documentElement.scrollWidth > window.innerWidth }
}

const ed = await openEditor({ kind: "native", bundle, css, globals: `window.PROBE_FILES={};${STORELIB_GLOBALS}`, init: WATCH, cpu: CPU, width: W, height: 844, touch: true, settle: 4000 })
const page = ed.page
/* What the sheet's guard told the server (lib/website-builder/ask-sheet-guard.ts). */
const reports = []
page.on("request", (r) => { if (r.url().includes("/api/client-errors")) reports.push(r.postData() ?? "") })
if (process.env.VERBOSE) page.on("pageerror", (e) => console.log("  thrown:", e.stack ?? String(e)))
try {
  console.log(`\nphone ${W}x844 (CPU ${CPU}x)`)
  /* The page's own fetch is the probe's (render-editor-probe.tsx): what the sheet's guard sends is read there. */
  await ed.js(() => { window.__reports = []; const f = window.fetch; window.fetch = (u, i) => { if (String(u).includes("/api/client-errors")) window.__reports.push(String(i?.body ?? "")); return f(u, i) } })
  await ed.js((l) => { window.PROBE_AGENT_STREAM = { lines: l, gapMs: 300 } }, LINES)
  await ed.js(() => [...document.querySelectorAll("button[aria-label='Ask Storelib']")].find((b) => b.getClientRects().length)?.click())
  await sleep(900)
  const found = await ed.js(() => { const t = [...document.querySelectorAll("[data-ask-view] textarea, [role=dialog] textarea")].filter((x) => x.getClientRects().length).pop(); if (!t) return false; t.focus(); return true })
  if (!found) throw new Error("no Ask box in the sheet")
  await page.keyboard.type(`Make_the_link_${"x".repeat(60)}_point_somewhere_else`)
  if (process.env.VERBOSE) console.log("  box:", await ed.js(() => { const a = document.activeElement; return { tag: a?.tagName, value: a?.value?.slice(0, 40), areas: [...document.querySelectorAll("textarea")].map((x) => `${x.getAttribute("aria-label")}:${x.getClientRects().length}`) } }))
  await page.keyboard.press("Enter")
  /* The thread's left edge, line by line, while the answer comes in. */
  const lefts = []
  for (let i = 0; i < 16; i++) {
    await sleep(150)
    lefts.push(await ed.js(() => { const v = document.querySelector("[data-ask-view] ul > li"); return v ? Math.round(v.getBoundingClientRect().left * 10) / 10 : null }))
  }
  await sleep(1500)
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `ask-sheet-answer-${W}.png`) })
  const o = await ed.js(OVERFLOW)
  expect(o.found, "the Ask sheet is open with its thread", o.found)
  expect(o.pastCount === 0, "nothing in the sheet ends past its edges", { sheet: o.sheet, count: o.pastCount, past: o.past })
  expect(o.sideways.length === 0 && !o.docSideways, "nothing in the sheet scrolls sideways (a code block aside)", { sideways: o.sideways, page: o.docSideways })
  const seen = lefts.filter((x) => x !== null)
  expect(seen.length > 0 && new Set(seen).size === 1, "the thread's left edge never moves while the answer comes in", seen)

  /* The close: every frame until the sheet is gone. */
  await ed.js(() => { window.__as.rows = []; window.__as.t = []; window.__as.longs = []; window.__as.on = true })
  const cdp = process.env.PROFILE ? await page.createCDPSession() : null
  if (cdp) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 200 }); await cdp.send("Profiler.start") }
  /* A finger's tap, as a phone sends it (touch, pointer and click), not a click from a script. */
  const at = await ed.js(() => { const b = [...document.querySelectorAll("[data-ask-header] button")].filter((x) => /close/i.test(x.getAttribute("aria-label") ?? "") && x.getClientRects().length).pop(); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  if (at) await page.touchscreen.tap(at.x, at.y)
  const closed = !!at
  expect(closed, "the sheet's close button was pressed", closed)
  await sleep(1200)
  const m = await ed.js(() => { window.__as.on = false; return window.__as })
  if (cdp) {
    const { profile } = await cdp.send("Profiler.stop")
    const nodes = new Map(profile.nodes.map((n) => [n.id, n]))
    const parent = new Map()
    for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
    const self = new Map(), total = new Map()
    for (let i = 0; i < profile.samples.length; i++) {
      const n = nodes.get(profile.samples[i])
      const f = n.callFrame
      if (/^\((idle|program|root)\)$/.test(f.functionName)) continue
      const ms = (profile.timeDeltas[i] ?? 0) / 1000
      const k = `${f.functionName || "(anon)"}:${f.lineNumber + 1}`
      self.set(k, (self.get(k) ?? 0) + ms)
      const seen = new Set()
      for (let up = n; up; up = parent.has(up.id) ? nodes.get(parent.get(up.id)) : null) {
        const kk = `${up.callFrame.functionName || "(anon)"}:${up.callFrame.lineNumber + 1}`
        if (seen.has(kk)) continue
        seen.add(kk)
        total.set(kk, (total.get(kk) ?? 0) + ms)
      }
    }
    console.log("  self ms:"); for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`    ${v.toFixed(0).padStart(6)}  ${k}`)
    console.log("  total ms:"); for (const [k, v] of [...total].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`    ${v.toFixed(0).padStart(6)}  ${k}`)
  }
  const rows = m.rows
  const onScreen = rows.filter((r) => r.top !== null && r.top < 844 && r.visibility !== "hidden" && (r.opacity ?? 1) > 0.02)
  let upAgain = 0, brighter = 0, emptied = 0, scrimUp = 0
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i]
    if (a.top !== null && b.top !== null && b.top < a.top - 1) upAgain++
    if (a.opacity !== null && b.opacity !== null && b.opacity > a.opacity + 0.02) brighter++
    if (a.scrim !== null && b.scrim !== null && b.scrim > a.scrim + 0.02) scrimUp++
  }
  for (const r of onScreen) if (r.content === 0 || r.text < 20) emptied++
  const d = []
  for (let i = 1; i < m.t.length; i++) d.push(m.t[i] - m.t[i - 1])
  const F = 1000 / 60
  const dropped = d.reduce((a, x) => a + Math.max(0, Math.round(x / F) - 1), 0)
  const gone = rows.findIndex((r) => r.top === null || r.top >= 844 || r.visibility === "hidden" || (r.opacity ?? 1) <= 0.02)
  if (process.env.VERBOSE) console.log(rows.map((r) => JSON.stringify(r)).join("\n"))
  expect(gone > 0, "the sheet goes, over more than one frame", { framesToGone: gone, ms: gone > 0 ? rows[gone].t - rows[0].t : null })
  expect(upAgain === 0, "its top only moves down while it closes", upAgain)
  expect(brighter === 0, "its opacity never comes back up while it closes", brighter)
  expect(emptied === 0, "it never shows an empty sheet while it is on screen", { emptied, of: onScreen.length })
  expect(scrimUp === 0, "the dim behind it only fades out", scrimUp)
  const pct = d.length ? Math.round((dropped / (d.length + dropped)) * 1000) / 10 : 0
  expect(pct < 10, "under 10% of frames dropped during the close", { droppedPct: pct, longestFrame: Math.round(Math.max(0, ...d)) })
  expect(Math.max(0, ...m.longs) < 100, "no long task over 100ms during the close", m.longs)
  reports.push(...(await ed.js(() => window.__reports.splice(0))))
  expect(reports.length === 0, "the sheet's guard found nothing out of place through the whole run (nothing reported)", reports)

  /* GUARD (round 21): the sheet opened again, its content scrolled by hand as iOS left it, and the guard puts it back and says so. */
  await ed.js(() => [...document.querySelectorAll("button[aria-label='Ask Storelib']")].find((b) => b.getClientRects().length)?.click())
  await sleep(1200)
  const shifted = await ed.js(() => {
    const sheet = document.querySelector("[data-ask-sheet]")?.closest("[data-mobile-bottom-sheet]")
    if (!sheet) return null
    sheet.style.overflow = "hidden"
    const tail = document.createElement("div")
    tail.style.cssText = "height:400px;flex-shrink:0"
    tail.setAttribute("data-probe-tail", "")
    sheet.appendChild(tail)
    document.querySelector("[data-ask-sheet]").style.minHeight = `${sheet.clientHeight}px`
    sheet.scrollTop = 40
    const top = Math.round(document.querySelector("[data-ask-header]").getBoundingClientRect().top - sheet.getBoundingClientRect().top)
    window.visualViewport?.dispatchEvent(new Event("resize"))
    return { scrolled: sheet.scrollTop, headerTop: top }
  })
  await sleep(900)
  const back = await ed.js(() => {
    const sheet = document.querySelector("[data-ask-sheet]")?.closest("[data-mobile-bottom-sheet]")
    return sheet ? { scrolled: sheet.scrollTop, headerTop: Math.round(document.querySelector("[data-ask-header]").getBoundingClientRect().top - sheet.getBoundingClientRect().top) } : null
  })
  expect(!!shifted && shifted.scrolled > 0, "the sheet's content was knocked out of place", shifted)
  expect(!!back && back.scrolled === 0 && back.headerTop === 20, "the guard put it back, the header under the grab bar again", back)
  reports.push(...(await ed.js(() => window.__reports)))
  expect(reports.length === 1 && /Ask sheet off by 0,-40 \(settled\)/.test(reports[0]) && /sheet scrolled 0,40/.test(reports[0]), "and told the server once, with what it found", reports.map((r) => r.slice(0, 220)))
  expect(ed.errors.length === 0, "nothing thrown", ed.errors)
} finally {
  await ed.close()
}
console.log(broken ? `\n${broken} over budget` : "\nall within budget")
process.exit(broken && BUDGET ? 1 : 0)
