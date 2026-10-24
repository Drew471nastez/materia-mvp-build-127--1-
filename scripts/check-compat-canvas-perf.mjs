/**
 * ===========================================================================
 *  THE IMPORTED THEME'S CANVAS, SCROLLED, SELECTED AND HOVERED (round BC)
 * ===========================================================================
 * The owner: "sometimes the editor freezes, scroll stutters, bad
 * performance; optimize for slow devices and slow internet." The real
 * editor (scripts/editor-probe-harness.mjs's bundle) with an imported theme
 * (the Dawn zip, or the Materia store), the CPU slowed (CPU, default 4).
 * For each gesture, read over the devtools protocol and in the frame:
 *
 *   MAIN       the main thread's busy time while it ran (script, style,
 *              layout), the frame's work and the editor's together (they
 *              share a process)
 *   FRAMES     the frame's own frame intervals while it ran: p50, p95,
 *              the longest, and how many took more than 50ms
 *   LONGEST    the longest task
 *
 *   scroll     a section selected, the pointer over the page, 40 wheel
 *              steps of 120px every 30ms down and back
 *   hover      the pointer moved over the page, 60 moves
 *   select     three sections clicked in turn, each left 900ms
 *
 *   npx tsx scripts/check-compat-canvas-perf.mjs [dawn.zip]
 *   CPU=<n>                the slowdown (4 by default)
 *   EDITOR_BUNDLE=<file>   a bundle to reuse (one from another commit, to compare)
 *   RUNS=<n>               each gesture this many times (2 by default)
 *   PROFILE=<regexp>       a CPU profile of the gestures whose name matches: self time by function
 */
import { readFileSync } from "node:fs"
import JSZip from "jszip"
import { importedTheme, openEditor, sleep } from "./canvas-probe-kit.mjs"

const CPU = Number(process.env.CPU ?? 4)
const RUNS = Number(process.env.RUNS ?? 2)
const PROFILE = process.env.PROFILE ? new RegExp(process.env.PROFILE) : null

async function dawn(zipPath) {
  const zip = await JSZip.loadAsync(readFileSync(zipPath))
  const { convertShopifyTheme } = await import("../lib/storelib-theme/shopify/convert.ts")
  const r = await convertShopifyTheme(zip)
  if (!r.ok) throw new Error(r.error)
  const t = r.theme
  const sources = Object.fromEntries(Object.entries(t.files).filter(([p]) => p.endsWith(".storelib")))
  const files = Object.fromEntries(Object.entries(t.files).filter(([p, x]) => p.startsWith("shopify/") && !x.startsWith("base64:") && !/^shopify\/locales\/(?!.*\.default(\.schema)?\.json$)/.test(p)))
  const pages = Object.fromEntries(t.pages.map((p) => [p.page_key, p.sections]))
  return { settings: t.settings, pages, sources, files, all: t.files }
}

const pct = (xs, p) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))]) }

async function main() {
  const { bundle, css } = await import("./editor-probe-harness.mjs")
  const zipPath = process.argv[2]
  const compat = zipPath ? await dawn(zipPath) : await importedTheme({ store: true })
  const { page, front, js, close } = await openEditor({ kind: "imported", bundle, css, compat, cpu: CPU, settle: 4000 })
  const cdp = await page.createCDPSession()
  await cdp.send("Performance.enable")
  const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]))
  /* Long tasks of the process, read from the editor's document (the frame shares its thread). */
  await js(() => { window.__lt = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(e.duration) }).observe({ type: "longtask", buffered: false }) } catch (e) {} })
  const frameBox = async () => (await (await page.$("iframe[data-compat-frame='front']")).boundingBox())
  const results = {}
  const measure = async (name, gesture) => {
    const f = await front()
    await f.evaluate(() => { window.__fi = []; let last = performance.now(); window.__fiOn = true; const tick = (t) => { if (!window.__fiOn) return; window.__fi.push(t - last); last = t; requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
    await js(() => { window.__lt = [] })
    const m0 = await metrics()
    const profiling = PROFILE && PROFILE.test(name)
    if (profiling) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 200 }); await cdp.send("Profiler.start") }
    const t0 = Date.now()
    await gesture(f)
    const wall = Date.now() - t0
    const m1 = await metrics()
    if (profiling) {
      const { profile } = await cdp.send("Profiler.stop")
      /* Self time by function, where it is: the heaviest first. */
      const byId = new Map(profile.nodes.map((n) => [n.id, n]))
      const self = new Map()
      const dt = profile.timeDeltas || []
      ;(profile.samples || []).forEach((id, i) => { const n = byId.get(id); const cf = n.callFrame; const k = `${cf.functionName || "(anonymous)"} ${cf.url.split("/").pop()}:${cf.lineNumber}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0) / 1000) })
      const total = [...self.values()].reduce((a, b) => a + b, 0)
      console.log(`    profile of ${name}: ${Math.round(total)}ms sampled`)
      for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22)) console.log(`      ${String(Math.round(v)).padStart(6)}ms  ${k}`)
    }
    const fi = await f.evaluate(() => { window.__fiOn = false; return window.__fi.slice(1) }).catch(() => [])
    const lt = await js(() => window.__lt.slice())
    const d = (k) => Math.round(((m1[k] ?? 0) - (m0[k] ?? 0)) * 1000)
    const r = { wall, task: d("TaskDuration"), script: d("ScriptDuration"), style: d("RecalcStyleDuration"), layout: d("LayoutDuration"), frames: fi.length, p50: pct(fi, 0.5), p95: pct(fi, 0.95), worst: Math.round(Math.max(0, ...fi)), over50: fi.filter((x) => x > 50).length, longest: Math.round(Math.max(0, ...lt)), longs: lt.length }
    ;(results[name] = results[name] || []).push(r)
    console.log(`  ${name.padEnd(8)} main ${String(r.task).padStart(5)}ms (script ${r.script}, style ${r.style}, layout ${r.layout})  frames p50 ${r.p50} p95 ${r.p95} worst ${r.worst} >50ms ${r.over50}/${r.frames}  longest task ${r.longest}ms (${r.longs})  wall ${wall}ms`)
  }
  const box = await frameBox()
  const clickAt = async (fx, fy) => { await page.mouse.click(box.x + fx, box.y + fy); }
  /* A section to select: the second one on the page, clicked in its middle. */
  const sectionPoint = async (n) => {
    const f = await front()
    return f.evaluate((n) => {
      const secs = [...document.querySelectorAll(".shopify-section")].filter((s) => s.getBoundingClientRect().height > 80)
      const s = secs[Math.min(n, secs.length - 1)]
      s.scrollIntoView({ block: "center" })
      const r = s.getBoundingClientRect()
      return { x: Math.min(r.left + r.width / 2, innerWidth - 20), y: Math.max(20, Math.min(r.top + r.height / 2, innerHeight - 20)) }
    }, n)
  }
  console.log(`\n${zipPath ? "DAWN" : "MATERIA STORE"}, CPU ${CPU}x`)
  for (let run = 0; run < RUNS; run++) {
    await measure("select", async () => {
      for (const n of [1, 2, 3]) { const p = await sectionPoint(n); await sleep(300); await clickAt(p.x, p.y); await sleep(900) }
    })
    const p = await sectionPoint(1)
    await clickAt(p.x, p.y)
    await sleep(1200)
    await (await front()).evaluate(() => scrollTo(0, 0))
    await sleep(500)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await measure("scroll", async () => {
      for (let i = 0; i < 40; i++) { await page.mouse.wheel({ deltaY: 120 }); await sleep(30) }
      for (let i = 0; i < 40; i++) { await page.mouse.wheel({ deltaY: -120 }); await sleep(30) }
      await sleep(400)
    })
    await measure("hover", async () => {
      for (let i = 0; i < 60; i++) { await page.mouse.move(box.x + 100 + (i % 20) * 50, box.y + 100 + Math.floor(i / 20) * 200); await sleep(20) }
      await sleep(300)
    })
  }
  console.log("\nMEDIANS")
  for (const [name, rs] of Object.entries(results)) {
    const med = (k) => pct(rs.map((r) => r[k]), 0.5)
    console.log(`  ${name.padEnd(8)} main ${med("task")}ms (script ${med("script")}, style ${med("style")}, layout ${med("layout")})  frames p95 ${med("p95")} worst ${med("worst")} >50ms ${med("over50")}  longest ${med("longest")}ms`)
  }
  await close()
}
main().catch((e) => { console.error(e); process.exit(1) })
