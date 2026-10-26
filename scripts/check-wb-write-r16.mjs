/**
 * ===========================================================================
 *  ASK STORELIB WRITES A SECTION: THE CHAT GETS OUT OF THE WAY, THE CANVAS
 *  TAKES YOU TO IT, AND TO THE SECTION WHEN IT IS DONE (round 16)
 * ===========================================================================
 * The owner: "when the AI coding agent [writes a section] it smoothly closes
 * the window sheet, and takes me smoothly to the place where it's creating
 * the section with a beautiful animation, and after it finishes, auto smooth
 * scrolls me to that."
 *
 * The real editor (scripts/editor-probe-harness.mjs), a Storelib theme's home
 * page scrolled to its top, and an ask the router sends to the writer
 * (scripts/render-editor-probe.tsx PROBE_WRITER: its steps streamed over a few
 * seconds, then the file). On a phone (390x844, the Ask sheet open) and a
 * computer (1440x900, the Ask card open), every frame from Enter to a second
 * after the section lands:
 *
 *   OUT OF THE WAY  the phone's sheet is down before the canvas moves; the
 *                   computer's card is folded
 *   TAKEN THERE     the spot being written ([data-writing-section]) comes into
 *                   view, by a glide (the canvas moves over many frames, no
 *                   step more than a third of the way) that starts once the
 *                   sheet is down
 *   AND TO IT       the finished section is in view, glided to the same way,
 *                   and arrives with its entrance (.wb-section-arrive), with
 *                   no jump the frame it takes the spot's place
 *   SMOOTH          frames dropped and the longest task while the spot is
 *                   being written (its code typed every frame)
 *
 *   npx tsx scripts/check-wb-write-r16.mjs
 *   ONLY=phone|desktop   CPU=4   EDITOR_BUNDLE=<file>   BUDGET=0   SHOTS=<dir>
 */
import { mkdirSync } from "node:fs"
import { join } from "node:path"

process.env.PROBE_CSS = process.env.PROBE_CSS ?? "source"
const { bundle, css } = await import("./editor-probe-harness.mjs")
const { openEditor, sleep, STORELIB_GLOBALS } = await import("./canvas-probe-kit.mjs")

const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, "i") : null
const CPU = Number(process.env.CPU ?? 1)
const BUDGET = process.env.BUDGET !== "0"
const SHOTS = process.env.SHOTS ?? ""
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : BUDGET ? "FAIL" : "note"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 300)})`}`)
  if (!ok && BUDGET) broken++
}

const SOURCE = `<template><section class="pw"><h2>{{ settings.heading }}</h2><p>Written for the probe.</p></section></template>
<style scoped>.pw { padding: 96px 24px; background: #ecfdf5; text-align: center; font-family: system-ui; }</style>
<schema>{"schema_version":1,"type":"probe_written","name":"Probe written","category":"content","settings":[{"type":"text","id":"heading","label":"Heading","default":"Written by Storelib AI"}],"presets":[{"name":"Probe written","settings":{"heading":"Written by Storelib AI"}}]}</schema>`
/* DECIDE_MS: how long the router takes to answer (round 18: the chat no longer waits for it to get out of the way). */
const DECIDE_MS = Number(process.env.DECIDE_MS ?? 1500)
const WRITER = { gapMs: 450, steps: 8, path: "sections/probe_written.storelib", type: "probe_written", name: "Probe written", source: SOURCE, decideMs: DECIDE_MS }

/* Every frame: the canvas's scroll, where the spot and the written section are, whether the phone's sheet is up. */
const WATCH = String.raw`
(function () {
  var W = window.__wr = { on: false, rows: [], longs: [], longAt: [] }
  try { new PerformanceObserver(function (l) { if (!W.on) return; l.getEntries().forEach(function (e) { W.longs.push(Math.round(e.duration)); W.longAt.push(Math.round(e.startTime)) }) }).observe({ type: "longtask" }) } catch (e) {}
  /* The elements are found again every 10th frame, not every frame: a probe that searched the page each frame was most of the cost it measured. */
  var n = 0, sc = null, spot = null, made = null, sheet = null
  var tick = function (t) {
    if (W.on) {
      if (n++ % 10 === 0 || (spot && !spot.isConnected)) {
        sc = document.getElementById("wb-preview-root")
        spot = document.querySelector("[data-writing-section]")
        made = document.querySelector("[id^='wb-section-probe_written']")
        sheet = document.querySelector("[data-ask-view='thread']")
      }
      /* LIGHT=1: boxes read every 10th frame only, the frames counted every frame (what the probe's own reads cost, told apart). */
      if (window.__wrLight && n % 10 !== 1) { W.rows.push({ t: Math.round(t), y: sc ? Math.round(sc.scrollTop) : 0, spot: null, made: null, arrive: false, sheetTop: null, light: true }); requestAnimationFrame(tick); return }
      var box = sc ? sc.getBoundingClientRect() : null
      var at = function (el) { if (!el || !el.isConnected || !box) return null; var r = el.getBoundingClientRect(); return { top: Math.round(r.top - box.top), bottom: Math.round(r.bottom - box.top), h: Math.round(box.height) } }
      var sr = sheet && sheet.isConnected ? sheet.getBoundingClientRect() : null
      W.rows.push({ t: Math.round(t), y: sc ? Math.round(sc.scrollTop) : 0, spot: at(spot), made: at(made), arrive: !!(made && made.isConnected && (made.classList.contains("wb-section-arrive") || made.querySelector(".wb-section-arrive") || made.closest(".wb-section-arrive"))), sheetTop: sr && sr.height > 0 ? Math.round(sr.top) : null })
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})()
`

const inView = (p) => !!p && p.top < p.h - 40 && p.bottom > 40
/* The scroll moved over many frames, never most of the way in one. */
function glide(rows, from, to) {
  const part = rows.filter((r) => r.t >= from && r.t <= to)
  if (part.length < 2) return { frames: 0, distance: 0, biggestStep: 0 }
  let moved = 0, biggest = 0
  for (let i = 1; i < part.length; i++) { const d = Math.abs(part[i].y - part[i - 1].y); if (d > 0) moved++; biggest = Math.max(biggest, d) }
  const distance = Math.abs(part[part.length - 1].y - part[0].y)
  return { frames: moved, distance, biggestStep: biggest, share: distance ? Math.round((biggest / distance) * 100) / 100 : 0 }
}

async function run(device) {
  const phone = device === "phone"
  const globals = `window.PROBE_WRITER=${JSON.stringify(WRITER)};window.PROBE_FILES={};${STORELIB_GLOBALS}`
  const ed = await openEditor({ kind: "native", bundle, css, globals, init: WATCH, cpu: CPU, width: phone ? 390 : 1440, height: phone ? 844 : 900, touch: phone, settle: 4000 })
  const page = ed.page
  try {
    console.log(`\n${device} (CPU ${CPU}x)`)
    /* The Ask box: the sheet on a phone (the bar's button), the card on a computer. */
    if (phone) {
      await ed.js(() => [...document.querySelectorAll("button[aria-label='Ask Storelib']")].find((b) => b.getClientRects().length)?.click())
      await sleep(900)
    }
    const found = await ed.js(() => { const t = document.querySelector("[data-ask-pill] textarea") ?? [...document.querySelectorAll("[data-ask-view] textarea, [role=dialog] textarea")].filter((x) => x.getClientRects().length).pop(); if (!t) return false; t.focus(); return true })
    if (!found) throw new Error("no Ask box")
    await page.keyboard.type("A section that says it was written by the probe")
    /* Where the person is reading: the foot of the page, far from where the section will be written. */
    await ed.js(() => { const n = document.getElementById("wb-preview-root"); n.scrollTop = n.scrollHeight })
    await sleep(400)
    if (process.env.LIGHT) await ed.js(() => { window.__wrLight = true })
    /* CSS_OFF=<css>: a rule laid over the page for the run, to tell which animation costs what. */
    if (process.env.CSS_OFF) await ed.js((c) => { const st = document.createElement("style"); st.textContent = c; document.head.appendChild(st) }, process.env.CSS_OFF)
    const t0 = await ed.js(() => { window.__wr.rows = []; window.__wr.longs = []; window.__wr.longAt = []; window.__wr.on = true; return performance.now() })
    const cdp = process.env.PROFILE ? await page.createCDPSession() : null
    if (cdp) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 250 }); await cdp.send("Profiler.start") }
    await page.keyboard.press("Enter")
    /* TRACE=1: two seconds of the main thread mid-writing, by what it did (style, layout, paint, script). */
    if (process.env.TRACE) {
      await sleep(1500)
      await page.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline"] })
      await sleep(2000)
      const events = JSON.parse(Buffer.from(await page.tracing.stop()).toString("utf8")).traceEvents
      const mains = events.filter((e) => e.name === "thread_name" && e.args?.name === "CrRendererMain")
      const busy = (m) => events.reduce((a, e) => a + (e.ph === "X" && e.pid === m.pid && e.tid === m.tid ? e.dur ?? 0 : 0), 0)
      const main = mains.sort((a, b) => busy(b) - busy(a))[0]
      const sum = {}
      for (const e of events) if (e.ph === "X" && e.dur && main && e.pid === main.pid && e.tid === main.tid && /^(UpdateLayoutTree|Layout|Paint|PrePaint|Layerize|Commit|FunctionCall|FireAnimationFrame|RunTask|ParseHTML|HitTest|ScrollLayer|IntersectionObserverController::computeIntersections|UpdateLayer|Animation)$/.test(e.name)) sum[e.name] = (sum[e.name] ?? 0) + e.dur / 1000
      console.log(`  main thread over 2s mid-writing (ms): ${Object.entries(sum).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v)}`).join(", ")}`)
      const paints = events.filter((e) => e.name === "Paint" && main && e.pid === main.pid && e.tid === main.tid && e.args?.data)
      const byLayer = {}
      for (const e of paints) { const k = `${e.args.data.nodeId ?? "?"}`; byLayer[k] = (byLayer[k] ?? 0) + 1 }
      console.log(`  paints: ${paints.length}; by node: ${JSON.stringify(Object.entries(byLayer).sort((a, b) => b[1] - a[1]).slice(0, 6))}`)
    }
    /* Until the section is on the canvas and has had a second to settle. */
    let landed = null
    for (let i = 0; i < 120 && !landed; i++) {
      await sleep(200)
      landed = await ed.js(() => (document.querySelector("[id^='wb-section-probe_written']") ? performance.now() : null))
    }
    if (cdp) {
      const { profile } = await cdp.send("Profiler.stop")
      const nodes = new Map(profile.nodes.map((n) => [n.id, n]))
      const parent = new Map()
      for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
      const self = new Map()
      for (let i = 0; i < profile.samples.length; i++) {
        const n = nodes.get(profile.samples[i])
        const f = n.callFrame
        if (/^\((idle|program|root)\)$/.test(f.functionName)) continue
        let up = !f.url && parent.has(n.id) ? nodes.get(parent.get(n.id)) : null
        while (up && !up.callFrame.url && parent.has(up.id)) up = nodes.get(parent.get(up.id))
        const k = `${f.functionName || "(anon)"}:${f.lineNumber + 1}${f.url ? "" : ` [native] < ${up ? `${up.callFrame.functionName || "(anon)"}:${up.callFrame.lineNumber + 1}` : "?"}`}`
        self.set(k, (self.get(k) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000)
      }
      console.log("  busiest (self ms):")
      for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`    ${v.toFixed(0).padStart(6)}  ${k}`)
    }
    await sleep(1600)
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `write-${device}.png`) })
    const { rows, longs, longAt } = await ed.js(() => { window.__wr.on = false; return { rows: window.__wr.rows, longs: window.__wr.longs, longAt: window.__wr.longAt } })
    if (process.env.TIMELINE) console.log(`    long tasks (ms after Enter: duration): ${longAt.map((a, i) => `${Math.round(a - t0)}:${longs[i]}`).join("  ")}; landed at ${landed ? Math.round(landed - t0) : "-"}`)

    if (process.env.TIMELINE) for (const [i, r] of rows.entries()) if (i % 4 === 0 || (i && rows[i - 1].y !== r.y && i % 2 === 0)) console.log(`    ${String(Math.round(r.t - t0)).padStart(5)}ms  y ${String(r.y).padStart(5)}  spot ${r.spot ? `${r.spot.top}..${r.spot.bottom}` : "-"}  made ${r.made ? `${r.made.top}..${r.made.bottom}` : "-"}  sheet ${r.sheetTop ?? "-"}`)
    const firstSpot = rows.find((r) => r.spot)
    const spotSeen = rows.find((r) => inView(r.spot))
    /* The sheet stays in the page once down, below the foot of the screen. */
    const screenH = await ed.js(() => innerHeight)
    const sheetDown = phone ? rows.find((r) => r.t > t0 + 50 && (r.sheetTop === null || r.sheetTop >= screenH)) : null
    /* The glide's first step up the page (the sheet going down first resizes the canvas, a step of its own, at the foot). */
    const firstMove = rows.find((r, i) => i > 0 && rows[i - 1].y - r.y > 10 && r.t < (landed ?? Infinity))
    /* The frames from the spot's first appearance to the section's landing, light ones included. */
    const spotFrom = rows.findIndex((r) => r.spot), madeFrom = rows.findIndex((r) => r.made)
    const writingRows = spotFrom < 0 ? [] : rows.slice(spotFrom, madeFrom > spotFrom ? madeFrom : undefined)
    const madeSeen = rows.find((r) => inView(r.made))
    const last = rows[rows.length - 1]
    const toSpot = firstMove && spotSeen ? glide(rows, firstMove.t - 20, spotSeen.t + 600) : null
    const toMade = landed ? glide(rows, landed - 20, landed + 1400) : null
    const frameGaps = writingRows.slice(1).map((r, i) => r.t - writingRows[i].t)
    const dropped = frameGaps.reduce((a, g) => a + Math.max(0, Math.round(g / (1000 / 60)) - 1), 0)
    const droppedPct = frameGaps.length ? Math.round((dropped / (frameGaps.length + dropped)) * 1000) / 10 : 0

    expect(!!firstSpot, "the spot being written is drawn on the canvas")
    /* Round 18: at Enter, not when the router answers (DECIDE_MS later). */
    expect(!!firstSpot && firstSpot.t - t0 < Math.min(400, DECIDE_MS), `the spot is there within 400ms of Enter, with the router taking ${DECIDE_MS}ms`, firstSpot ? Math.round(firstSpot.t - t0) : null)
    if (phone) {
      const sheetGoing = rows.find((r) => r.t > t0 && r.sheetTop !== null && rows[0].sheetTop !== null && r.sheetTop > rows[0].sheetTop + 4)
      expect(!!sheetGoing && sheetGoing.t - t0 < Math.min(400, DECIDE_MS), "the sheet starts down within 400ms of Enter", sheetGoing ? Math.round(sheetGoing.t - t0) : null)
    }
    if (phone) {
      expect(!!sheetDown, "the Ask sheet goes down when the writing starts", sheetDown ? Math.round(sheetDown.t - t0) : null)
      expect(!!sheetDown && !!firstMove && firstMove.t >= sheetDown.t - 34, "the canvas moves only once the sheet is down", { sheetDownAt: sheetDown && Math.round(sheetDown.t - t0), firstMoveAt: firstMove && Math.round(firstMove.t - t0) })
    } else {
      const folded = await ed.js(() => document.querySelector("[data-ask-dock]")?.getAttribute("data-state") ?? null)
      expect(folded !== "expanded" && folded !== "open", "the Ask card folds out of the way", folded)
    }
    expect(!!spotSeen, "the canvas takes you to the spot while it is written", spotSeen ? { at: Math.round(spotSeen.t - t0), spot: spotSeen.spot } : rows.filter((r) => r.spot).slice(-1)[0]?.spot)
    expect(!!toSpot && toSpot.frames >= 6 && toSpot.share <= 0.34, "by a glide, not a jump", toSpot)
    expect(!!landed, "the section is written onto the page")
    expect(!!madeSeen && inView(last.made), "and the canvas takes you to it when it is done", last.made)
    expect(!toMade || toMade.distance < 8 || (toMade.frames >= 6 && toMade.share <= 0.34), "by a glide too", toMade)
    expect(rows.some((r) => r.arrive), "the section arrives with its entrance (.wb-section-arrive)")
    /* The frame the spot becomes the section: the canvas does not move by itself (scroll anchoring moved it to the top of the page). */
    const swap = rows.findIndex((r) => r.made)
    const swapStep = swap > 0 ? Math.abs(rows[swap].y - rows[swap - 1].y) : 0
    expect(swap > 0 && swapStep < 8, "no jump the frame the section takes the spot's place", { swapStep })
    expect(droppedPct < 10, "smooth while the spot types its code: under 10% of frames dropped", { droppedPct, frames: frameGaps.length })
    expect(Math.max(0, ...longs) < 150, "no long task over 150ms from Enter to landing", { longest: Math.max(0, ...longs), count: longs.length })
    expect(ed.errors.length === 0, "nothing thrown", ed.errors)
  } finally {
    await ed.close()
  }
}

for (const device of ["phone", "desktop"]) {
  if (ONLY && !ONLY.test(device)) continue
  try {
    await run(device)
  } catch (e) {
    console.log(`  FAIL  ${device} did not run: ${String(e).slice(0, 300)}`)
    broken++
  }
}
console.log(broken ? `\n${broken} over budget` : "\nall within budget")
process.exit(broken && BUDGET ? 1 : 0)
