/**
 * ===========================================================================
 *  THE ONEPAGE EDITOR'S SHELL: SETTINGS PILLS, TOASTS, SHEETS, THE TOP BAR
 * ===========================================================================
 * Round 10 asked four things of the shell (components/onepage/onepage-editor.tsx),
 * and this reads each one in the real editor (scripts/render-onepage-editor.tsx,
 * served by scripts/onepage-probe-server.mjs):
 *
 *   SETTINGS    one row of pills across the top at 390 and 1440, no list
 *               down the side; the row scrolls sideways on a phone with no
 *               bar drawn, the chosen pill is always inside the row, a
 *               switch moves nothing on the page (no layout shift, the
 *               box under the pills never changes height mid-switch) and
 *               each section keeps what was typed in it; #settings still
 *               opens the tab
 *   TOASTS      "New block added", "Undone" and "Changes saved" never
 *               cover the top bar, the phone's tab bar, or the preview on a
 *               computer
 *   SHEETS      every editor sheet at 390x844, touch, CPU slowed 4x: frame
 *               times (requestAnimationFrame) while it opens, is dragged,
 *               springs back and is pulled shut; React commits during the
 *               drag; layout shift behind it
 *   TOP BAR     Links, Design, Products, Settings and back: the bar's
 *               controls never move and nothing shifts
 *
 *   PROBE_CSS=source node scripts/check-onepage-shell.mjs
 *   SHOTS=/some/dir ...           pictures at 390 and 1440
 *   ONLY=sheets|settings|toasts|bar   one part
 *   OUT=/some/file.json           the sheet numbers, for a before and after
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const shots = process.env.SHOTS || null
if (shots) mkdirSync(shots, { recursive: true })
const only = process.env.ONLY || ""
const wants = (part) => !only || only.split(",").includes(part)

const { base, server } = await serveEditorProbe({ fail })
/*
  BEFORE_ROOT=/a/checkout of the commit before: the sheets are measured in
  both, run for run, one after the other, so a machine that is busier for a
  while is busier for both and the comparison stays fair.
*/
const beforeRoot = process.env.BEFORE_ROOT || null
const before = beforeRoot ? await serveEditorProbe({ root: beforeRoot, fail }) : null
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/* A long protocol timeout: on a machine shared with builds a call can wait well past puppeteer's default. */
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"], protocolTimeout: 240000 })
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const DESK = { width: 1440, height: 900 }

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

async function open(vp, hash, { cpu = 1, at = base } = {}) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  /* Leaving with unsaved work asks first (beforeunload); the probe says yes. */
  p.on("dialog", (d) => d.accept().catch(() => {}))
  await p.evaluateOnNewDocument(() => {
    window.__shifts = []
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__shifts.push({ value: e.value, recentInput: e.hadRecentInput, nodes: (e.sources || []).map((s) => (s.node && s.node.nodeType === 1 ? s.node.outerHTML.slice(0, 80) : String(s.node && s.node.nodeName))) }))).observe({ type: "layout-shift", buffered: true })
    } catch { /* no layout-shift entries here */ }
  })
  await p.goto(`${at}/app/onepage#${hash}`)
  await p.waitForSelector("[data-scroll-container]", { timeout: 10000 }).catch(() => { throw new Error(`the editor did not draw: ${errors.slice(0, 2).join(" | ")}`) })
  /* Arrived, and the kept tabs and kept sheets built in the idle time. */
  await sleep(2600)
  const cdp = await p.target().createCDPSession()
  if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
  return { p, errors, cdp }
}

/* ── Frame times ─────────────────────────────────────────────────────── */
const startFrames = (p) => p.evaluate(() => {
  window.__ft = []
  /* One loop at a time: a loop from the part before stops on its next frame, not this one. */
  const gen = (window.__ftGen = (window.__ftGen || 0) + 1)
  window.__ftOn = true
  window.__commits0 = window.__commits || 0
  window.__shifts = []
  const tick = (t) => { if (!window.__ftOn || window.__ftGen !== gen) return; window.__ft.push(t); requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
})
const stopFrames = (p) => p.evaluate(() => {
  window.__ftOn = false
  const t = window.__ft
  const gaps = t.slice(1).map((v, i) => v - t[i])
  return { gaps, commits: (window.__commits || 0) - window.__commits0, shift: window.__shifts.reduce((a, s) => a + s.value, 0) }
})
const FRAME = 1000 / 60
function summarize(gaps) {
  if (!gaps.length) return { frames: 0, p50: 0, p95: 0, max: 0, dropped: 0 }
  const s = [...gaps].sort((a, b) => a - b)
  const q = (f) => s[Math.min(s.length - 1, Math.floor(f * (s.length - 1)))]
  const dropped = gaps.reduce((a, g) => a + Math.max(0, Math.round(g / FRAME) - 1), 0)
  const r = (n) => Math.round(n * 10) / 10
  return { frames: gaps.length, p50: r(q(0.5)), p95: r(q(0.95)), max: r(s[s.length - 1]), dropped }
}

/**
 * What the renderer's main thread did in a trace: its longest task, and the
 * style it worked out (time and elements), in milliseconds of thread time.
 */
function mainThreadWork(buf) {
  const ev = JSON.parse(Buffer.from(buf).toString("utf8")).traceEvents
  const mainTid = ev.find((e) => e.name === "thread_name" && e.args?.name === "CrRendererMain" && ev.some((x) => x.tid === e.tid && x.name === "UpdateLayoutTree"))?.tid
  const mine = ev.filter((e) => e.ph === "X" && e.tid === mainTid)
  const ms = (us) => Math.round((us || 0) / 100) / 10
  const tasks = mine.filter((e) => e.name === "RunTask")
  const styles = mine.filter((e) => e.name === "UpdateLayoutTree")
  return {
    longest: ms(Math.max(0, ...tasks.map((e) => e.dur))),
    busy: ms(tasks.reduce((a, e) => a + e.dur, 0)),
    style: ms(styles.reduce((a, e) => a + e.dur, 0)),
    styled: styles.reduce((a, e) => a + (e.args?.elementCount || 0), 0),
  }
}

const touch = (s, type, x, y) => s.cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] })
const grabber = (p) => p.evaluate(() => {
  const h = document.querySelector('[data-app-sheet="open"] [data-sheet-handle]')
  if (!h) return null
  const r = h.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + 6 }
})
const sheetGone = (p) => p.evaluate(() => !document.querySelector('[data-app-sheet="open"]'))

/**
 * One sheet: opened, dragged down 160px slowly and let go (springs back),
 * then pulled shut, with every frame from the tap to the end of the close.
 */
async function measureSheet(name, hash, opener, prepare, at = base) {
  const s = await open(PHONE, hash, { cpu: 4, at })
  if (prepare) { await s.p.evaluate(prepare); await sleep(1200) }
  await startFrames(s.p)
  await s.p.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline"] })
  const found = await s.p.evaluate(opener)
  await sleep(900)
  const openPart = await stopFrames(s.p)
  const openWork = mainThreadWork(await s.p.tracing.stop())
  const g = found ? await grabber(s.p) : null
  if (!g) {
    expect(false, `${name}: opens`, { found, errors: s.errors.slice(0, 2) })
    await s.p.close()
    return null
  }
  /* A pull of a fifth of the sheet, at most 160px: short enough that a slow let go springs back. */
  const pull = await s.p.evaluate(() => Math.min(160, Math.round(document.querySelector('[data-app-sheet="open"] [data-sheet-panel]').offsetHeight * 0.2)))
  await startFrames(s.p)
  await touch(s, "touchStart", g.x, g.y)
  for (let k = 1; k <= 12; k++) { await touch(s, "touchMove", g.x, g.y + (pull * k) / 12); await sleep(16) }
  await sleep(120)
  await touch(s, "touchEnd")
  await sleep(700)
  const dragPart = await stopFrames(s.p)
  await startFrames(s.p)
  const g2 = await grabber(s.p)
  if (!g2) {
    expect(false, `${name}: springs back after a short pull`)
    await s.p.close()
    return null
  }
  await touch(s, "touchStart", g2.x, g2.y)
  /*
    A pull down past the line, let go moving: closes whatever speed the
    machine gives the events. (A flick is read by scripts/check-onepage-
    sheets.mjs; here, on a machine shared with builds, CDP can space five
    quick moves 100ms apart, and a flick that slow is rightly not a flick.)
  */
  const h = await s.p.evaluate(() => document.querySelector('[data-app-sheet="open"] [data-sheet-panel]').offsetHeight)
  for (let k = 1; k <= 8; k++) { await touch(s, "touchMove", g2.x, g2.y + (h * 0.7 * k) / 8); await sleep(12) }
  await touch(s, "touchEnd")
  await sleep(900)
  const closePart = await stopFrames(s.p)
  const closed = await sheetGone(s.p)
  const all = summarize([...openPart.gaps, ...dragPart.gaps, ...closePart.gaps])
  const row = {
    name,
    /* The main thread on the tap, from Chromium's own trace: busy time, not frame time, so it reads the same on a loaded machine. */
    work: openWork,
    open: summarize(openPart.gaps),
    drag: summarize(dragPart.gaps),
    close: summarize(closePart.gaps),
    all,
    dragCommits: dragPart.commits,
    shift: Math.round((openPart.shift + dragPart.shift + closePart.shift) * 10000) / 10000,
    closed,
    gaps: { open: openPart.gaps, drag: dragPart.gaps, close: closePart.gaps },
  }
  console.log(`  ${name.padEnd(16)} tap: longest task ${row.work.longest}ms, style ${row.work.style}ms over ${row.work.styled} elements |  open p50 ${row.open.p50} p95 ${row.open.p95} drop ${row.open.dropped} | drag p50 ${row.drag.p50} p95 ${row.drag.p95} drop ${row.drag.dropped} | close p50 ${row.close.p50} p95 ${row.close.p95} drop ${row.close.dropped} | commits in drag ${row.dragCommits} | CLS ${row.shift}`)
  expect(closed, `${name}: a pull down past the line closes it`)
  expect(row.shift === 0, `${name}: nothing behind it shifts`, row.shift)
  expect(row.dragCommits === 0, `${name}: a drag renders nothing in React`, row.dragCommits)
  expect(s.errors.length === 0, `${name}: no errors`, s.errors.slice(0, 2))
  await s.p.close()
  return row
}

const clickText = (text) => `(() => { const b = [...document.querySelectorAll("button")].find((e) => e.textContent.trim() === ${JSON.stringify(text)} && e.getClientRects().length); if (b) b.click(); return !!b })()`
const clickTitle = (title) => `(() => { const b = [...document.querySelectorAll('button[title="${title}"]')].find((e) => e.getClientRects().length); if (b) b.click(); return !!b })()`
const clickSel = (sel) => `(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.getClientRects().length); if (b) b.click(); return !!b })()`

if (wants("sheets")) {
  console.log("\nSheets at 390x844, touch, CPU 4x (frame gaps in ms; 16.7 is 60fps)")
  const runs = before ? [["before", before.base], ["after", base]] : [["", base]]
  const rowsOf = Object.fromEntries(runs.map(([label]) => [label, []]))
  const SHEETS = [
    ["Share", "links", clickSel("[data-onepage-share]")],
    ["Add block", "links", clickText("Add")],
    ["Thumbnail", "links", `(() => { const b = [...document.querySelectorAll("[data-scroll-container] button.w-10.h-10.rounded-lg")].find((e) => e.getClientRects().length); if (b) b.click(); return !!b })()`],
    ["Animation", "links", clickTitle("Animation")],
    ["Stats", "links", clickTitle("View Stats")],
    ["Edit profile", "links", `(() => { const b = [...document.querySelectorAll("button")].find((e) => e.querySelector("h2") && e.getClientRects().length); if (b) b.click(); return !!b })()`],
    ["Profile image", "links", clickSel("[data-scroll-container] .relative.group.cursor-pointer")],
    ["Add product", "products", `(() => { const b = [...document.querySelectorAll("button")].find((e) => /^add product$/i.test(e.textContent.trim()) && e.getClientRects().length); if (b) b.click(); return !!b })()`],
    ["Unsaved changes", "settings", clickSel("[data-onepage-exit]"), `(() => { const i = document.querySelector("[data-settings-name]"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, i.value + "!"); i.dispatchEvent(new Event("input", { bubbles: true })) })()`],
  ]
  /* Each sheet REPEAT times (default 2), each on a fresh page: one run is too noisy to compare. */
  const repeat = Math.max(1, Number(process.env.REPEAT) || 2)
  /* SHEET=<name> measures one sheet only. */
  for (const [name, hash, opener, prepare] of SHEETS.filter(([n]) => !process.env.SHEET || n === process.env.SHEET)) {
    for (let k = 0; k < repeat; k++) {
      for (const [label, at] of runs) {
        if (label) console.log(`  [${label}]`)
        /* One retry for a run the machine itself broke (a protocol call that timed out), never for a failed check. */
        let row = null
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            row = await measureSheet(name, hash, opener, prepare, at)
            break
          } catch (e) {
            console.log(`  (${name}: run ${k + 1} broke, ${String(e).slice(0, 80)}${attempt ? "" : "; once more"})`)
          }
        }
        if (row) rowsOf[label].push(row)
      }
    }
  }
  const report = {}
  for (const [label] of runs) {
  const rows = rowsOf[label]
  console.log(`\n  ${label ? `${label.toUpperCase()}: ` : ""}per sheet, and every frame pooled`)
  /* Every frame of every run, pooled: the numbers to compare before and after. */
  const pooled = (k) => summarize(rows.flatMap((r) => r.gaps[k]))
  const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)] }
  for (const name of [...new Set(rows.map((r) => r.name))]) {
    const rs = rows.filter((r) => r.name === name)
    console.log(`  ${name.padEnd(16)} median of ${rs.length}: longest task on the tap ${med(rs.map((r) => r.work.longest))}ms, style ${med(rs.map((r) => r.work.style))}ms over ${med(rs.map((r) => r.work.styled))} elements, frames dropped ${med(rs.map((r) => r.all.dropped))}`)
  }
  const totals = { open: pooled("open"), drag: pooled("drag"), close: pooled("close"), all: summarize(rows.flatMap((r) => [...r.gaps.open, ...r.gaps.drag, ...r.gaps.close])) }
  for (const k of ["open", "drag", "close", "all"]) console.log(`  all sheets, ${k.padEnd(5)}: p50 ${totals[k].p50}ms, p95 ${totals[k].p95}ms, max ${totals[k].max}ms, ${totals[k].dropped} dropped of ${totals[k].frames} frames`)
  report[label || "now"] = { rows: rows.map(({ gaps, ...r }) => r), totals }
  }
  if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(report, null, 2))
}

/* ── Settings ─────────────────────────────────────────────────────────── */
if (wants("settings")) {
  for (const [label, vp] of [["390", PHONE], ["1440", DESK]]) {
    console.log(`\nSettings at ${label}`)
    const s = await open(vp, "settings", { cpu: vp === PHONE ? 4 : 1 })
    await s.p.waitForSelector('[data-tab-panel="settings"] [data-settings-basic]')
    await sleep(600)
    const shape = await s.p.evaluate(() => {
      const row = document.querySelector('[data-tab-panel="settings"] [data-pill-row="settings-pills"]')
      if (!row) return { row: false }
      const tabs = [...row.querySelectorAll("[data-tab]")].map((b) => b.getBoundingClientRect())
      const cs = getComputedStyle(row)
      return {
        row: true,
        count: tabs.length,
        oneLine: tabs.every((r) => Math.abs(r.top - tabs[0].top) < 1),
        sideList: !!document.querySelector('[data-tab-panel="settings"] [data-pill-row="settings-list"]'),
        scrolls: row.scrollWidth > row.clientWidth,
        bar: row.offsetHeight - row.clientHeight,
        scrollbarWidth: cs.scrollbarWidth,
        rounded: [...row.querySelectorAll("[data-tab]")].every((b) => parseFloat(getComputedStyle(b).borderTopLeftRadius) >= 14),
      }
    })
    expect(shape.row && shape.count === 6 && shape.oneLine && !shape.sideList, "one row of six pills across the top, no list down the side", shape)
    expect(shape.rounded, "each is a pill")
    expect(shape.bar === 0 && shape.scrollbarWidth === "none", "no scroll bar is drawn under the row", { bar: shape.bar, sw: shape.scrollbarWidth })
    if (vp === PHONE) expect(shape.scrolls, "on a phone the row scrolls sideways", shape.scrolls)

    if (shots) await s.p.screenshot({ path: join(shots, `shell-settings-${label}.png`) })

    /* Each pill: chosen, its section shown, the pill in view, nothing shifted, the box under it steady. */
    const ids = ["seo", "subscribe", "share", "verified", "billing", "basic"]
    for (const id of ids) {
      await s.p.evaluate(() => {
        window.__shifts = []
        const box = document.querySelector('[data-tab-panel="settings"] [data-pill-panels="settings"]')
        const pills = document.querySelector('[data-tab-panel="settings"] [data-pill-row="settings-pills"]')
        window.__hs = []
        window.__rowTop = []
        const t0 = performance.now()
        const tick = () => { window.__hs.push(box.getBoundingClientRect().height); window.__rowTop.push(pills.getBoundingClientRect().top); if (performance.now() - t0 < 700) requestAnimationFrame(tick) }
        requestAnimationFrame(tick)
      })
      const at = await s.p.evaluate((id) => {
        const b = document.querySelector(`[data-tab-panel="settings"] [data-pill-row="settings-pills"] [data-tab="${id}"]`)
        b.scrollIntoView({ block: "nearest", inline: "nearest" })
        const r = b.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      }, id)
      if (vp === PHONE) await s.p.touchscreen.tap(at.x, at.y)
      else await s.p.mouse.click(at.x, at.y)
      await sleep(800)
      const after = await s.p.evaluate((id) => {
        const row = document.querySelector('[data-tab-panel="settings"] [data-pill-row="settings-pills"]')
        const tab = row.querySelector(`[data-tab="${id}"]`)
        const rr = row.getBoundingClientRect()
        const tr = tab.getBoundingClientRect()
        const panel = document.querySelector(`[data-tab-panel="settings"] [data-pill-panel="${id}"]`)
        const hs = window.__hs
        return {
          selected: tab.getAttribute("aria-selected") === "true",
          shown: !!panel && panel.getAttribute("aria-hidden") === null && getComputedStyle(panel).opacity === "1",
          inView: tr.left >= rr.left - 1 && tr.right <= rr.right + 1,
          heightSteps: new Set(hs.map((h) => Math.round(h))).size,
          rowMoved: Math.max(...window.__rowTop) - Math.min(...window.__rowTop),
          shift: window.__shifts.reduce((a, s) => a + s.value, 0),
        }
      }, id)
      expect(after.selected && after.shown && after.inView && after.rowMoved < 0.5 && after.shift === 0 && after.heightSteps <= 2,
        `${id}: chosen, shown, its pill in view, nothing shifted, the box steady`, after)
    }

    /* What was typed in a section is still there after a trip through the others. */
    await s.p.evaluate(() => document.querySelector('[data-tab-panel="settings"] [data-pill-row="settings-pills"] [data-tab="seo"]').click())
    await sleep(500)
    const typed = await s.p.evaluate(() => {
      const field = document.querySelector('[data-tab-panel="settings"] [data-pill-panel="seo"] input:not([type=file]):not([type=hidden]):not([type=checkbox]), [data-tab-panel="settings"] [data-pill-panel="seo"] textarea')
      if (!field) return null
      const proto = field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, "value").set.call(field, "Kept across switches")
      field.dispatchEvent(new Event("input", { bubbles: true }))
      return true
    })
    await s.p.evaluate(() => document.querySelector('[data-tab-panel="settings"] [data-pill-row="settings-pills"] [data-tab="billing"]').click())
    await sleep(500)
    await s.p.evaluate(() => document.querySelector('[data-tab-panel="settings"] [data-pill-row="settings-pills"] [data-tab="seo"]').click())
    await sleep(500)
    const kept = await s.p.evaluate(() => {
      const field = document.querySelector('[data-tab-panel="settings"] [data-pill-panel="seo"] input:not([type=file]):not([type=hidden]):not([type=checkbox]), [data-tab-panel="settings"] [data-pill-panel="seo"] textarea')
      return field?.value
    })
    expect(typed && kept === "Kept across switches", "a section keeps what was typed in it", kept)

    /* A section asked for in the address opens on it: in the editor already open (Back, a typed address), and on a fresh load. */
    await s.p.evaluate(() => { location.hash = "settings-share" })
    await sleep(900)
    const jumped = await s.p.evaluate(() => document.querySelector('[data-tab-panel="settings"] [data-pill-row="settings-pills"] [data-tab="share"]')?.getAttribute("aria-selected") === "true")
    expect(jumped, "#settings-share in the address switches the open Settings to Share", jumped)
    await s.p.goto("about:blank")
    await s.p.goto(`${base}/app/onepage#settings-billing`)
    await s.p.waitForSelector('[data-tab-panel="settings"] [data-settings-billing]', { timeout: 8000 }).catch(() => null)
    await sleep(900)
    const deep = await s.p.evaluate(() => {
      const tab = document.querySelector('[data-tab-panel="settings"] [data-pill-row="settings-pills"] [data-tab="billing"]')
      const row = tab?.parentElement
      const rr = row?.getBoundingClientRect()
      const tr = tab?.getBoundingClientRect()
      return { selected: tab?.getAttribute("aria-selected") === "true", inView: !!tr && tr.left >= rr.left - 1 && tr.right <= rr.right + 1 }
    })
    expect(deep.selected && deep.inView, "#settings-billing opens Settings on Billing, its pill in view", deep)
    if (shots) await s.p.screenshot({ path: join(shots, `shell-settings-billing-${label}.png`) })
    expect(s.errors.length === 0, "no errors", s.errors.slice(0, 2))
    await s.p.close()
  }
}

/* ── Toasts ───────────────────────────────────────────────────────────── */
const toastRects = (p) => p.evaluate(() => {
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width && r.height ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null }
  const toasts = [...document.querySelectorAll("[data-save-toast]")].map(box).filter(Boolean)
  const header = box(document.querySelector("[data-onepage-editor] > header"))
  const tabbar = box(document.querySelector("[data-onepage-tabbar]"))
  const preview = box(document.querySelector("[data-onepage-editor] .md\\:block.border-l"))
  return { toasts, header, tabbar, preview }
})
const overlaps = (a, b) => !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

if (wants("toasts")) {
  for (const [label, vp] of [["390", PHONE], ["1440", DESK]]) {
    console.log(`\nToasts at ${label}`)
    const s = await open(vp, "links")
    /* Add a block: the Add block sheet or dialog, its first block. */
    await s.p.evaluate(clickText("Add"))
    await sleep(900)
    const added = await s.p.evaluate(() => {
      const scope = document.querySelector('[data-app-sheet="open"]') || document.querySelector("[data-slot=dialog-content]")
      const b = scope && [...scope.querySelectorAll("button")].find((e) => /Email Signup/.test(e.textContent) && e.getClientRects().length)
      if (b) b.click()
      return !!b
    })
    await sleep(500)
    const r1 = await toastRects(s.p)
    if (shots) await s.p.screenshot({ path: join(shots, `shell-toast-added-${label}.png`) })
    await sleep(4600)
    /* Undo. */
    await s.p.evaluate(clickTitle("Undo"))
    await sleep(500)
    const r2 = await toastRects(s.p)
    if (shots) await s.p.screenshot({ path: join(shots, `shell-toast-undo-${label}.png`) })
    for (const [what, r] of [["New block added", r1], ["Undone", r2]]) {
      const t = r.toasts[0]
      expect(!!t, `"${what}" is on screen`, { added, n: r.toasts.length })
      if (!t) continue
      expect(!overlaps(t, r.header), `"${what}" is clear of the top bar`, { toast: t, header: r.header })
      if (vp === PHONE) expect(!overlaps(t, r.tabbar), `"${what}" is clear of the tab bar`, { toast: t, tabbar: r.tabbar })
      else expect(!overlaps(t, r.preview), `"${what}" is clear of the preview`, { toast: t, preview: r.preview })
    }
    /* One at a time: a second toast straight after the first sends the first out. */
    await sleep(2600)
    await s.p.evaluate(clickText("Add"))
    await sleep(900)
    await s.p.evaluate(() => {
      const scope = document.querySelector('[data-app-sheet="open"]') || document.querySelector("[data-slot=dialog-content]")
      const b = scope && [...scope.querySelectorAll("button")].find((e) => /Email Signup/.test(e.textContent) && e.getClientRects().length)
      if (b) b.click()
    })
    await sleep(300)
    await s.p.evaluate(clickTitle("Undo"))
    await sleep(600)
    const both = await toastRects(s.p)
    expect(both.toasts.length === 1, "a new toast sends the one before it out, never one on another", both.toasts.length)
    /* Its motion names what it moves, never `all`. */
    const tr = await s.p.evaluate(() => { const el = document.querySelector("[data-save-toast] > div"); return el ? getComputedStyle(el).transitionProperty : null })
    expect(!!tr && !/\ball\b/.test(tr), "the toast moves on named properties", tr)
    expect(s.errors.length === 0, "no errors", s.errors.slice(0, 2))
    await s.p.close()
  }
}

/* ── The top bar ──────────────────────────────────────────────────────── */
if (wants("bar")) {
  for (const [label, vp] of [["390", PHONE], ["1440", DESK]]) {
    console.log(`\nThe top bar at ${label}`)
    const s = await open(vp, "links", { cpu: vp === PHONE ? 4 : 1 })
    const sel = vp === PHONE ? '[data-tab-row="phone"] [data-tab="%"]' : '[data-tab-row="desktop"] [data-tab="%"]'
    const order = ["design", "products", "settings", "links", "settings", "design"]
    await s.p.evaluate(() => {
      window.__shifts = []
      window.__bar = []
      const header = document.querySelector("[data-onepage-editor] > header")
      const ctrls = [...header.querySelectorAll("button")]
      const t0 = performance.now()
      const tick = () => {
        window.__bar.push(ctrls.map((b) => { const r = b.getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)}` }).join("|") + `#${Math.round(header.getBoundingClientRect().height)}`)
        if (performance.now() - t0 < 9000) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    for (const t of order) {
      const q = t === "settings" && vp === DESK ? 'button[title="Settings"]' : sel.replace("%", t)
      const at = await s.p.evaluate((q) => { const b = [...document.querySelectorAll(q)].find((e) => e.getClientRects().length); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, q)
      if (vp === PHONE) await s.p.touchscreen.tap(at.x, at.y)
      else await s.p.mouse.click(at.x, at.y)
      await sleep(900)
    }
    if (vp === PHONE) {
      /* The bar's middle word reads whole, whatever it says. */
      const words = await s.p.evaluate(() => {
        const el = document.querySelector("[data-onepage-state]")
        const was = el.textContent
        const out = ["Saved", "Unsaved", "Saving…", "Failed"].map((t) => { el.textContent = t; return { t, fits: el.scrollWidth <= el.clientWidth, w: el.clientWidth } })
        el.textContent = was
        return out
      })
      expect(words.every((w) => w.fits), "the save state is a whole word, never cut", words)
    }
    const res = await s.p.evaluate(() => ({ layouts: new Set(window.__bar).size, shift: window.__shifts.reduce((a, s) => a + s.value, 0) }))
    expect(res.layouts === 1, "the bar's controls never moved", res.layouts)
    expect(res.shift === 0, "nothing shifted while switching", res.shift)
    if (shots) await s.p.screenshot({ path: join(shots, `shell-bar-${label}.png`) })
    expect(s.errors.length === 0, "no errors", s.errors.slice(0, 2))
    await s.p.close()
  }
}

await browser.close()
server.close()
before?.server.close()
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
