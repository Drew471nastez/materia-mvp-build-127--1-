/**
 * ===========================================================================
 *  A SLIDER DRAGGED IN THE SIDEBAR, AND HOW SOON THE PAGE SHOWS IT
 * ===========================================================================
 * "If I drag a heading's font size, the change on the canvas is very laggy
 * and not smooth, and the same with padding top or bottom." Measured on the
 * real editor (scripts/render-editor-probe.tsx through
 * scripts/editor-probe-harness.mjs), dragged with a real mouse over the
 * devtools protocol, at 1280x900, the CPU at full speed and slowed 4x.
 *
 * For each drag:
 *
 *   STEPS        how many values the slider went through
 *   SHOWN        how many of those the canvas drew (a canvas that skips most
 *                of a drag looks like it jumps, however fast each draw is)
 *   LATENCY      from the slider taking a value to the canvas drawing it,
 *                read as the next frame after the canvas changed; p50, p95
 *   FRAMES       frames longer than 33ms while the finger was down
 *   LONG TASKS   the longest main thread task during the drag
 *   KEPT, UNDO   once the finger lifts, the editor keeps what was drawn,
 *                one Undo takes the whole drag back and Redo returns it
 *
 * Measured before and after round 25's live layer
 * (lib/website-builder/live-settings.ts), Top padding on the hero:
 *
 *                  values drawn   wait p50   wait p95   long tasks
 *   1x  before     22 of 57       61ms       183ms      111ms
 *   1x  after      47 of 57        0ms        50ms       52ms
 *   4x  before     11 of 57      302ms      1242ms    10253ms
 *   4x  after      34 of 57       36ms        85ms      942ms
 *
 * A theme slider (Layout › Side padding) at 4x drew 12 of 33 before and
 * 23 of 33 after, at about the same wait: every element under the theme's
 * root restyles for a theme variable, and that is most of its frame.
 *
 *   node scripts/check-slider-latency.mjs
 *   CPU=4 node scripts/check-slider-latency.mjs      only the slowed run
 *   EDITOR_BUNDLE=<file> reuse a bundle
 *   BUDGET=0 report without failing
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAF0lEQVR4nGP8z8Dwn4GBgYGJAQ0AAB5vAQVVB2CvAAAAAElFTkSuQmCC", "base64")
let broken = 0
const BUDGET = process.env.BUDGET !== "0"
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : (BUDGET ? "FAIL" : "note")}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 400)})`}`)
  if (!ok && BUDGET) broken++
}

const IN_PAGE = String.raw`
window.__sl = (function () {
  var frame = function () { return new Promise(function (r) { requestAnimationFrame(function (ts) { r(ts) }) }) }
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms) }) }
  function text(el) { return (el.textContent || "").replace(/\s+/g, " ").trim() }
  function click(el) {
    var r = el.getBoundingClientRect()
    var o = { bubbles: true, cancelable: true, clientX: r.left + Math.min(10, r.width / 2), clientY: r.top + Math.min(10, r.height / 2), pointerId: 1, isPrimary: true }
    el.dispatchEvent(new PointerEvent("pointerdown", o)); el.dispatchEvent(new MouseEvent("mousedown", o))
    el.dispatchEvent(new PointerEvent("pointerup", o)); el.dispatchEvent(new MouseEvent("mouseup", o))
    el.dispatchEvent(new MouseEvent("click", o))
  }
  function side() { return document.querySelector("[data-wb-sidebar-scroll]") }
  function tab(name) {
    var all = document.querySelectorAll("[role=tablist][aria-label=Sidebar] [role=tab]")
    for (var i = 0; i < all.length; i++) if (text(all[i]) === name) return all[i]
    return null
  }
  function sectionRow(re) {
    var rows = side().querySelectorAll("div.group.cursor-pointer")
    for (var i = 0; i < rows.length; i++) if (re.test(text(rows[i]))) return rows[i]
    return null
  }
  /* Every slider in the sidebar, with the label over it. */
  function sliders() {
    var out = []
    document.querySelectorAll("[data-slot='slider']").forEach(function (s) {
      if (s.closest("#wb-preview-root") || !s.getClientRects().length) return
      var label = ""
      for (var p = s.parentElement; p && p !== document.body && !label; p = p.parentElement) {
        var l = p.querySelector("label, p, span")
        if (l && !s.contains(l) && text(l)) label = text(l)
      }
      out.push({ el: s, label: label })
    })
    return out
  }
  /* What the canvas shows, cheaply: the hero's box and its first heading's size. */
  function sig() {
    var sec = document.querySelector("#wb-preview-root [id^='wb-section-hero']")
    if (!sec) return ""
    var h = sec.querySelector("h1, h2")
    var r = sec.getBoundingClientRect()
    /* Where the heading sits in it too: a hero with a min-height moves its content for a padding change, not its own box. */
    var hr = h ? h.getBoundingClientRect() : null
    var themeRoot = document.querySelector("#wb-preview-root [data-storelib-theme]")
    var px = themeRoot ? getComputedStyle(themeRoot).getPropertyValue("--theme-padding-x") : ""
    return px + "|" + r.height.toFixed(1) + "|" + (h ? getComputedStyle(h).fontSize : "") + "|" + (hr ? hr.height.toFixed(1) + "|" + (hr.top - r.top).toFixed(1) + "|" + (hr.left - r.left).toFixed(1) + "|" + hr.width.toFixed(1) : "")
  }
  /* Record, from now until stop(): every value the slider took, every canvas change, every frame. */
  function record(sliderEl) {
    var thumb = sliderEl.querySelector("[data-slot='slider-thumb']")
    var rec = { values: [], canvas: [], frames: [], longs: [] }
    var t0 = performance.now()
    var vObs = new MutationObserver(function () { rec.values.push({ t: performance.now() - t0, v: thumb.getAttribute("aria-valuenow") }) })
    vObs.observe(thumb, { attributes: true, attributeFilter: ["aria-valuenow"] })
    var dirty = false
    var cObs = new MutationObserver(function () { dirty = true })
    var rootEl = document.getElementById("wb-preview-root")
    cObs.observe(rootEl, { attributes: true, childList: true, subtree: true, characterData: true })
    /* A section's own stylesheet can sit outside the canvas's root. */
    cObs.observe(document.head, { childList: true, subtree: true, characterData: true })
    var last = sig()
    var on = true
    var po = null
    try {
      po = new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { rec.longs.push(e.duration); rec.longAt = (rec.longAt || []).concat([Math.round(e.startTime - t0) + "+" + Math.round(e.duration)]) }) })
      po.observe({ type: "longtask", buffered: false })
    } catch (e) {}
    var prev = null
    function tick(ts) {
      if (!on) return
      var now = performance.now() - t0
      if (prev !== null) rec.frames.push(ts - prev)
      prev = ts
      var s = sig()
      if (s !== last) { rec.canvas.push({ t: now, s: s }); last = s }
      dirty = false
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    return function stop() {
      on = false; vObs.disconnect(); cObs.disconnect(); if (po) po.disconnect()
      return rec
    }
  }
  return { frame: frame, sleep: sleep, text: text, click: click, side: side, tab: tab, sectionRow: sectionRow, sliders: sliders, record: record, sig: sig }
})()
true
`

function pct(a, p) {
  if (!a.length) return null
  const s = [...a].sort((x, y) => x - y)
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))])
}

/*
  Latency of a value: from the moment the slider took it to the first canvas
  change at or after it. A value the slider passed through and left before
  the canvas changed was never drawn; it is counted as skipped, not as late.
*/
function analyse(rec) {
  const lat = []
  let shown = 0
  for (let i = 0; i < rec.values.length; i++) {
    const v = rec.values[i]
    const next = rec.values[i + 1]
    const c = rec.canvas.find((x) => x.t >= v.t)
    if (!c) continue
    if (next && c.t > next.t) continue
    shown++
    lat.push(c.t - v.t)
  }
  /* Values left before the canvas caught up still waited: from each to the first draw after it. */
  const wait = rec.values.map((v) => { const c = rec.canvas.find((x) => x.t >= v.t); return c ? c.t - v.t : null }).filter((x) => x !== null)
  return {
    steps: rec.values.length,
    canvasDraws: rec.canvas.length,
    shownOwnFrame: shown,
    p50: pct(wait, 50),
    p95: pct(wait, 95),
    max: wait.length ? Math.round(Math.max(...wait)) : null,
    framesOver33: rec.frames.filter((f) => f > 33.4).length,
    frames: rec.frames.length,
    worstFrame: rec.frames.length ? Math.round(Math.max(...rec.frames)) : null,
    longest: rec.longs.length ? Math.round(Math.max(...rec.longs)) : 0,
    longTotal: Math.round(rec.longs.reduce((a, b) => a + b, 0)),
  }
}

async function main() {
  const { bundle, css } = await import("./editor-probe-harness.mjs")
  const { interFaces } = await import("./probe-css.mjs")
  const out = mkdtempSync(join(tmpdir(), "slider-latency-"))
  writeFileSync(join(out, "editor-probe.js"), readFileSync(bundle))
  writeFileSync(join(out, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${interFaces(root)}</style><style>${css}</style></head><body><div id="app"></div><script>window.PROBE_SHORT=false</script><script src="editor-probe.js"></script></body></html>`)

  const browser = await puppeteer.launch({
    executablePath: CHROMIUM, headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files", "--force-device-scale-factor=1",
      "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"],
  })
  const report = {}
  try {
    for (const cpu of (process.env.CPU ? [Number(process.env.CPU)] : [1, 4])) {
      const page = await browser.newPage()
      const errors = []
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
      await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 })
      await page.setRequestInterception(true)
      page.on("request", (r) => {
        const u = r.url()
        if (u.startsWith("file:") || u.startsWith("data:") || u.startsWith("blob:")) return r.continue()
        if (/\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(u) || /example\.invalid/.test(u)) return r.respond({ status: 200, contentType: "image/png", body: PNG })
        return r.respond({ status: 200, contentType: "text/plain", body: "" })
      })
      await page.goto(`file://${join(out, "index.html")}`)
      await page.waitForFunction(() => {
        const sc = document.getElementById("wb-preview-root")
        return !!sc && sc.querySelectorAll("[id^=wb-section-]").length >= 3
      }, { timeout: 90_000 })
      await sleep(1500)
      await page.evaluate(IN_PAGE)
      /* The editor warms the section library's pictures in idle time after it opens; a drag is measured once that is done, and separately while it runs (QUIET=0). */
      if (process.env.QUIET !== "0") {
        const quietMs = await page.evaluate(async () => {
          let last = performance.now()
          const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) last = Math.max(last, e.startTime + e.duration) })
          po.observe({ type: "longtask" })
          const t0 = performance.now()
          while (performance.now() - last < 2000 && performance.now() - t0 < 40000) await new Promise((r) => setTimeout(r, 200))
          po.disconnect()
          return Math.round(performance.now() - t0)
        })
        console.log(`  (quiet after ${quietMs}ms)`)
      }
      const cdp = await page.createCDPSession()
      const js = (fn, ...a) => page.evaluate(fn, ...a)

      console.log(`\nCPU ${cpu}x`)
      const drags = []
      /* The hero's own sliders, then Theme's. */
      /* Selected the way a person does it: a click on the hero in the canvas. */
      const hero = await js(() => {
        const sec = document.querySelector("#wb-preview-root [id^='wb-section-hero']")
        if (!sec) return null
        sec.scrollIntoView({ block: "center" })
        const r = sec.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + Math.min(40, r.height / 2) }
      })
      if (hero) { await page.mouse.click(hero.x, hero.y); await sleep(1200) }
      const opened = hero && (await js(() => window.__sl.sliders().length > 0))
      if (!opened) {
        console.log(await js(() => ({ text: (window.__sl.side()?.textContent || "").slice(0, 300) })))
        expect(false, "the hero's settings open"); continue
      }
      const labels = await js(() => window.__sl.sliders().map((s) => s.label))
      console.log(`  hero sliders: ${labels.join(", ")}`)
      const WANT = (process.env.SLIDERS ?? "padding|size|spacing|gap|width|height").split("|")
      const picked = []
      for (const w of WANT) {
        const i = labels.findIndex((l, k) => new RegExp(w, "i").test(l) && !picked.some((p) => p.i === k))
        if (i >= 0) picked.push({ i, label: labels[i], where: "hero", undo: picked.length === 0 })
        if (picked.length >= 3) break
      }

      const drag = async (p) => {
        const before = await js(() => window.__sl.sig())
        const box = await js(async (i) => {
          const s = window.__sl.sliders()[i].el
          s.scrollIntoView({ block: "center" })
          await window.__sl.frame(); await window.__sl.frame()
          const t = s.querySelector("[data-slot='slider-thumb']").getBoundingClientRect()
          const r = s.getBoundingClientRect()
          window.__slStop = window.__sl.record(s)
          return { tx: t.left + t.width / 2, ty: t.top + t.height / 2, left: r.left, right: r.right }
        }, p.i)
        if (process.env.DIAG_MOVE) {
          const time = async (label, fn) => {
            await page.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.invalidationTracking"] })
            await fn()
            await sleep(300)
            const ev = JSON.parse(Buffer.from(await page.tracing.stop()).toString("utf8")).traceEvents
            const big = ev.filter((e) => e.name === "UpdateLayoutTree" && (e.args?.elementCount ?? 0) > 100)
            const inv = new Map()
            for (const e of ev) if (/StyleRecalcInvalidationTracking|StyleInvalidatorInvalidationTracking/.test(e.name)) { const d = e.args?.data ?? {}; const k = `${d.reason ?? ""} ${(d.nodeName ?? "").slice(0, 90)} ${JSON.stringify(d.invalidationList ?? d.extraData ?? "").slice(0, 200)}`; inv.set(k, (inv.get(k) ?? 0) + 1) }
            console.log(`    ${label}: ${big.map((b) => `${(b.dur / 1000).toFixed(1)}ms/${b.args.elementCount}`).join(" ") || "none over 100 elements"}`)
            if (big.length) console.log([...inv].slice(0, 15).map(([k, n]) => `      ${n}x ${k}`).join("\n"))
          }
          await time("hover onto the thumb", () => page.mouse.move(box.tx, box.ty))
          await time("press", () => page.mouse.down())
          await time("first move", () => page.mouse.move(box.tx + 10, box.ty))
          await time("release", () => page.mouse.up())
        }
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
        if (process.env.PROFILE) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 200 }); await cdp.send("Profiler.start") }
        if (process.env.TRACE) await page.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "blink.user_timing", ...(process.env.TRACE === "inv" ? ["disabled-by-default-devtools.timeline.invalidationTracking", "disabled-by-default-devtools.timeline.stack"] : [])] })
        await page.mouse.move(box.tx, box.ty)
        await page.mouse.down()
        /* Across the track and back over about 1.6s, a move every 8ms, as a 120Hz pointer reports. */
        const N = 100
        const a = box.left + 2, b = box.right - 2
        for (let k = 0; k <= N; k++) {
          const f = k / N
          const x = f < 0.5 ? box.tx + (b - box.tx) * (f * 2) : b + (a - b) * ((f - 0.5) * 2)
          await page.mouse.move(x, box.ty)
          await sleep(8)
        }
        await page.mouse.up()
        await sleep(600)
        if (process.env.PROFILE) {
          const { profile } = await cdp.send("Profiler.stop")
          writeFileSync(join(out, `profile-${cpu}-${p.where}-${p.i}.cpuprofile`), JSON.stringify(profile))
          /* Self time by function, and total time by function (a node's self plus everything under it). */
          const byId = new Map(profile.nodes.map((n) => [n.id, n]))
          const parent = new Map()
          for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
          const dt = new Map()
          profile.samples.forEach((id, k) => dt.set(id, (dt.get(id) ?? 0) + (profile.timeDeltas[k] ?? 0)))
          const self = new Map(), total = new Map()
          const name = (n) => `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber}`
          for (const [id, us] of dt) {
            const n = byId.get(id)
            self.set(name(n), (self.get(name(n)) ?? 0) + us)
            const seen = new Set()
            for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
              const nm = name(byId.get(cur))
              if (seen.has(nm)) continue
              seen.add(nm)
              total.set(nm, (total.get(nm) ?? 0) + us)
            }
          }
          const top = (m) => [...m].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.PROFILE) > 1 ? Number(process.env.PROFILE) : 25).map(([k, v]) => `    ${(v / 1000).toFixed(0).padStart(6)}ms  ${k}`).join("\n")
          console.log("  SELF\n" + top(self) + "\n  TOTAL\n" + top(total))
        }
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
        if (process.env.TRACE) {
          const buf = await page.tracing.stop()
          const ev = JSON.parse(Buffer.from(buf).toString("utf8")).traceEvents
          const mains = ev.filter((e) => e.name === "thread_name" && e.args?.name === "CrRendererMain")
          const busy = (m) => ev.reduce((a, e) => a + (e.ph === "X" && e.pid === m.pid && e.tid === m.tid ? e.dur ?? 0 : 0), 0)
          const main = mains.sort((a, b) => busy(b) - busy(a))[0]
          const sum = new Map(), count = new Map()
          for (const e of ev) if (e.ph === "X" && e.dur && (!main || (e.pid === main.pid && e.tid === main.tid))) { sum.set(e.name, (sum.get(e.name) ?? 0) + e.dur); count.set(e.name, (count.get(e.name) ?? 0) + 1) }
          console.log([...sum].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `    ${(v / 1000).toFixed(0).padStart(6)}ms  x${count.get(k)}  ${k}`).join("\n"))
          /* The style recalcs, by how many elements each touched. */
          const ult = ev.filter((e) => e.name === "UpdateLayoutTree" && e.ph === "X" && (!main || e.tid === main.tid))
          if (process.env.TRACE === "inv") {
            const big = ult.filter((e) => (e.args?.elementCount ?? 0) > 300)
            for (const b of big.slice(0, 3)) {
              const near = ev.filter((e) => /Invalidation/.test(e.name) && e.ts <= b.ts && e.ts > b.ts - 200000)
              const kinds = new Map()
              for (const e of near) { const d = e.args?.data ?? {}; const k = `${e.name} ${d.reason ?? ""} ${d.nodeName ?? ""} ${JSON.stringify(d.invalidatedSelectorId ?? d.selectors ?? d.changedAttribute ?? d.changedClass ?? d.changedPseudo ?? "").slice(0, 160)}`; kinds.set(k, (kinds.get(k) ?? 0) + 1) }
              console.log(`    BIG recalc ${(b.dur / 1000).toFixed(1)}ms/${b.args?.elementCount} at ${((b.ts - ev[0].ts) / 1000).toFixed(0)}:\n` + [...kinds].sort((a, c) => c[1] - a[1]).slice(0, 12).map(([k, n]) => `      ${n}x ${k}`).join("\n"))
            }
          }
          console.log("    style recalcs: " + ult.slice(0, 12).map((e) => `${(e.dur / 1000).toFixed(1)}ms/${e.args?.elementCount ?? "?"}`).join(" "))
        }
        const rec = await js(() => window.__slStop())
        const a2 = analyse(rec)
        /* What was drawn while the finger moved is what the editor keeps, and Undo takes the whole drag back in one step. */
        if (p.undo) {
          await sleep(400)
          const after = await js(() => window.__sl.sig())
          const lastDrawn = rec.canvas.at(-1)?.s
          await js(() => { const a = document.activeElement; if (a && a.blur) a.blur() })
          const mod = process.platform === "darwin" ? "Meta" : "Control"
          await page.keyboard.down(mod); await page.keyboard.press("z"); await page.keyboard.up(mod)
          await sleep(500)
          const undone = await js(() => window.__sl.sig())
          await page.keyboard.down(mod); await page.keyboard.down("Shift"); await page.keyboard.press("z"); await page.keyboard.up("Shift"); await page.keyboard.up(mod)
          await sleep(500)
          const redone = await js(() => window.__sl.sig())
          a2.kept = after === lastDrawn
          a2.undoOneStep = undone === before
          a2.redo = redone === after
          console.log(`    after release: ${after === lastDrawn ? "kept as drawn" : `changed (${lastDrawn} -> ${after})`}; Undo: ${undone === before ? "back to before the drag" : `not the start (${before} vs ${undone})`}; Redo: ${redone === after ? "the drag's end" : `wrong (${redone})`}`)
        }
        if (process.env.TIMELINE) console.log("    values: " + rec.values.map((v) => `${Math.round(v.t)}:${v.v}`).join(" ") + "\n    canvas: " + rec.canvas.map((c) => `${Math.round(c.t)}:${c.s}`).join(" "))
        if (process.env.TRACE) console.log(`    long tasks at: ${(rec.longAt || []).join(" ")}; first value at ${Math.round(rec.values[0]?.t ?? -1)}, last at ${Math.round(rec.values.at(-1)?.t ?? -1)}`)
        drags.push({ ...p, ...a2 })
        console.log(`  ${p.where} "${p.label}": ${a2.steps} steps, canvas drew ${a2.canvasDraws}, wait p50 ${a2.p50}ms p95 ${a2.p95}ms max ${a2.max}ms, frames over 33ms ${a2.framesOver33}/${a2.frames} (worst ${a2.worstFrame}ms), longest task ${a2.longest}ms, long total ${a2.longTotal}ms`)
      }
      for (const p of picked) await drag(p)

      /* Theme: the first group that holds sliders. */
      const themeSliders = await js(async () => {
        const t = window.__sl.tab("Theme")
        if (!t) return []
        window.__sl.click(t)
        await window.__sl.sleep(700)
        /* Layout: the page's side padding, which every section reads. */
        const groups = [...window.__sl.side().querySelectorAll("button")].filter((b) => /^Layout/.test(window.__sl.text(b)))
        for (const g of groups) { window.__sl.click(g); await window.__sl.sleep(600) }
        if (!window.__sl.sliders().length) return { none: [...window.__sl.side().querySelectorAll("button")].map((b) => window.__sl.text(b).slice(0, 30)).slice(0, 30) }
        return window.__sl.sliders().map((s) => s.label)
      })
      if (!Array.isArray(themeSliders)) { console.log(themeSliders); report[cpu] = drags; await page.close(); continue }
      console.log(`  theme sliders: ${themeSliders.join(", ")}`)
      const ti = themeSliders.findIndex((l) => /side padding/i.test(l)) >= 0 ? themeSliders.findIndex((l) => /side padding/i.test(l)) : themeSliders.findIndex((l) => /padding|radius|spacing/i.test(l))
      if (ti >= 0) await drag({ i: ti, label: themeSliders[ti], where: "theme" })

      report[cpu] = drags
      if (errors.length) console.log(`  page errors: ${errors.slice(0, 3).join(" | ")}`)
      await page.close()
    }
  } finally {
    await browser.close()
  }

  console.log("\nBUDGETS")
  for (const [cpu, drags] of Object.entries(report)) {
    for (const d of drags) {
      /* A theme value restyles everything under the theme's root (its CSS variables are inherited), which no render can avoid: a looser budget, measured. */
      const p95 = d.where === "theme" ? (cpu === "1" ? 130 : 320) : cpu === "1" ? 80 : 120
      expect(d.p95 !== null && d.p95 <= p95, `${cpu}x ${d.where} "${d.label}": the canvas shows a value within ${p95}ms (p95)`, { p50: d.p50, p95: d.p95 })
      if (d.undo) {
        expect(d.kept, `${cpu}x ${d.where} "${d.label}": what the canvas drew last is what the editor keeps`)
        expect(d.undoOneStep, `${cpu}x ${d.where} "${d.label}": one Undo takes the whole drag back`)
        expect(d.redo, `${cpu}x ${d.where} "${d.label}": Redo brings it back`)
      }
      expect(d.canvasDraws >= d.steps * 0.6, `${cpu}x ${d.where} "${d.label}": the canvas draws most of the drag, not a few jumps`, { steps: d.steps, draws: d.canvasDraws })
    }
  }
  writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2))
  console.log(`\n${broken ? `${broken} over budget` : "all within budget"}   (${join(out, "report.json")})`)
  process.exit(broken ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
