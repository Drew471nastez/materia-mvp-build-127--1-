/**
 * ===========================================================================
 *  SELECTING A SECTION: HOW SOON THE PERSON SEES IT (round 36)
 * ===========================================================================
 * check-editor-sections.mjs counts what a selection renders and how long the
 * last commit took. This one times what the person sees: from the press, the
 * first frame on screen with
 *
 *   ring    the canvas's selection ring on the section pressed
 *   row     the sidebar showing that section (its settings panel, or its
 *           row marked in the list)
 *   fields  the panel's settings drawn (its first field)
 *
 * and, from the press until the page is quiet, the long tasks, the longest,
 * React's commits and the components rendered, the editor itself and the
 * page's sections among them. Hovering is checked too: pointer moves over
 * the canvas must render nothing.
 *
 * The real editor (scripts/editor-probe-harness.mjs), a 44 section home page
 * at 1280 x 900, real input over the devtools protocol, 1x and 4x CPU:
 *
 *   canvas      a press on one section, then on another, then on a block
 *   sidebar     a press on a row of the list, Back, another row
 *   tabs        Sections, Theme, Pages and back, each timed to its panel
 *
 * Round 36, the bundle before and after, one run each (times move by tens
 * of ms between runs on this shared machine; counts repeat):
 *
 *                          before (1x / 4x)              after (1x / 4x)
 *   hover, 30 moves        30 commits / 31               0 / 0
 *   canvas press: ring     63-112ms / 165-430ms          13-35ms / 77-102ms
 *   canvas press: panel    63-112ms / 165-430ms          44-209ms / 349-921ms
 *   sidebar row: panel     41-62ms / 258-286ms           45-52ms / 210-316ms
 *   sidebar row: commits   69-93, 1,595-6,260 renders    6-17, 1,011-1,715 renders
 *   Back to the list       56-75ms / 265-334ms           52-69ms / 273-519ms
 *   tabs: lit / panel      11-23 / 36-83ms, 4x 38-55 / 119-458ms   about the same
 *   the list's scroll      lost on Back and on the tabs  kept (400 -> 400)
 *
 * The panel after a canvas press now lands after the ring, in a transition:
 * later than before at 4x, which is the price of the ring in the next frame.
 *
 *   node scripts/check-editor-select.mjs           CPUS=1,4 by default
 *   EDITOR_BUNDLE=<file>                           a bundle from another commit
 *   ROUNDS=3                                       presses of each kind
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const CPUS = (process.env.CPUS ?? "1,4").split(",").map(Number)
const ROUNDS = Number(process.env.ROUNDS ?? 3)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAF0lEQVR4nGP8z8Dwn4GBgYGJAQ0AAB5vAQVVB2CvAAAAAElFTkSuQmCC", "base64")
const BODY = ["hero_centered", "features_grid", "text_image", "text_rich", "proof_testimonials", "faq_accordion", "cta_simple", "promo_newsletter"]
const PAGE = ["header", ...Array.from({ length: 42 }, (_, i) => BODY[i % BODY.length]), "footer"]

const INIT = String.raw`
(function () {
  var P = window.__perf = { commits: 0, lastCommit: 0, counting: false, renders: {}, longs: [] }
  var COMP = { 0: 1, 1: 1, 11: 1, 14: 1, 15: 1 }
  function nameOf(f) { var t = f.type; if (!t) return "?"; if (f.tag === 11) return t.displayName || (t.render && (t.render.displayName || t.render.name)) || "ForwardRef"; if (f.tag === 14) return (t.type && (t.type.displayName || t.type.name)) || "Memo"; return t.displayName || t.name || "Anonymous" }
  function walk(top) {
    var stack = [top, top.alternate]
    while (stack.length) {
      var p = stack.pop(), n = stack.pop()
      if (COMP[n.tag] && (!p || (n.flags & 1) === 1)) { var nm = nameOf(n); P.renders[nm] = (P.renders[nm] || 0) + 1 }
      if (p && n.child === p.child) continue
      for (var c = n.child; c; c = c.sibling) stack.push(c, c.alternate)
    }
  }
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, isDisabled: false, renderers: new Map(),
    inject: function (r) { this.renderers.set(1, r); return 1 },
    onCommitFiberRoot: function (id, root) { P.commits++; P.lastCommit = performance.now(); (P.times = P.times || []).push(Math.round(P.lastCommit - (P.pressAt || 0))); if (P.counting) { try { walk(root.current) } catch (e) {} } },
    onCommitFiberUnmount: function () {}, onPostCommitFiberRoot: function () {}, checkDCE: function () {},
    on: function () {}, off: function () {}, emit: function () {}, sub: function () { return function () {} },
  }
  try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { P.longs.push([e.startTime, e.duration]) }) }).observe({ type: "longtask", buffered: true }) } catch (e) {}
  /* The press, as the page received it: its click, which is what selects. */
  addEventListener("click", function (e) { P.pressAt = e.timeStamp }, true)
})()
`

/*
  Watches from the press: each animation frame, after it is done (a message
  posted from it runs once the frame is drawn), whether each thing asked for
  is on screen yet.
*/
const WATCH = String.raw`
window.__watch = function (checks, capMs) {
  var P = window.__perf
  P.counting = true; P.renders = {}
  var c0 = P.commits, l0 = P.longs.length, t0 = performance.now(); P.pressAt = 0
  var got = {}
  return new Promise(function (done) {
    var afterFrame = function (fn) { var ch = new MessageChannel(); ch.port1.onmessage = fn; ch.port2.postMessage(0) }
    var tick = function () {
      afterFrame(function () {
        var now = performance.now()
        for (var k in checks) if (got[k] === undefined) { try { if (new Function("return (" + checks[k] + ")")()) got[k] = now } catch (e) {} }
        var all = Object.keys(checks).every(function (k) { return got[k] !== undefined })
        var quiet = now - Math.max(P.lastCommit, t0) > 400 && (!P.longs.length || now - (P.longs[P.longs.length - 1][0] + P.longs[P.longs.length - 1][1]) > 400)
        if ((all && quiet) || now - t0 > capMs) {
          P.counting = false
          var press = P.pressAt || t0
          var longs = P.longs.slice(l0).filter(function (l) { return l[0] >= press - 5 })
          var total = 0, r = P.renders
          for (var n in r) total += r[n]
          var out = { commits: P.commits - c0, renders: total, editor: r.StoreEditorPage || 0, sections: r.SectionRendererInner || 0, longs: longs.length, longest: Math.round(Math.max.apply(null, [0].concat(longs.map(function (l) { return l[1] })))) }
          for (var k2 in checks) out[k2] = got[k2] === undefined ? null : Math.round(got[k2] - press)
          out.times = (P.times || []).slice(-out.commits).join(","); out.top = Object.keys(r).sort(function (a, b) { return r[b] - r[a] }).slice(0, 6).map(function (k) { return k + ":" + r[k] }).join(" ")
          done(out)
          return
        }
        requestAnimationFrame(tick)
      })
    }
    requestAnimationFrame(tick)
  })
}
true
`

async function main() {
  const harness = await import("./editor-probe-harness.mjs")
  const out = mkdtempSync(join(tmpdir(), "editor-select-"))
  writeFileSync(join(out, "editor-probe.js"), readFileSync(harness.bundle))
  writeFileSync(join(out, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${harness.css}</style></head><body><div id="app"></div><script>window.PROBE_PAGES={home:${JSON.stringify(PAGE)}};window.PROBE_SHORT=false</script><script src="editor-probe.js"></script></body></html>`)
  const browser = await puppeteer.launch({
    executablePath: harness.CHROMIUM, headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files", "--force-device-scale-factor=1",
      "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"],
  })
  const table = []
  try {
    for (const cpu of CPUS) {
      const page = await browser.newPage()
      const errors = []
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
      await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 })
      const cdp = await page.createCDPSession()
      await page.evaluateOnNewDocument(INIT)
      await page.setRequestInterception(true)
      page.on("request", (r) => {
        const u = r.url()
        if (u.startsWith("file:") || u.startsWith("data:") || u.startsWith("blob:")) return r.continue()
        if (/\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(u) || /example\.invalid/.test(u)) return r.respond({ status: 200, contentType: "image/png", body: PNG })
        return r.respond({ status: 200, contentType: "text/plain", body: "" })
      })
      await page.goto(`file://${join(out, "index.html")}`)
      await page.waitForFunction((n) => document.querySelectorAll("#wb-preview-root [data-section-box]").length >= n, { timeout: 120_000, polling: 200 }, PAGE.length - 2)
      await page.evaluate(WATCH)
      await sleep(2500)
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
      console.log(`\nCPU ${cpu}x`)
      const js = (fn, ...a) => page.evaluate(fn, ...a)
      const press = async (p) => { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up() }
      const run = async (name, act, checks) => {
        await sleep(600)
        const watching = js((c) => window.__watch(c, 6000), checks)
        await act()
        const m = await watching
        table.push({ cpu, name, ...m })
        console.log(`  ${name.padEnd(26)} ${Object.keys(checks).map((k) => `${k} ${m[k] ?? "never"}ms`).join("  ").padEnd(40)} long ${m.longs} (max ${m.longest}ms)  ${m.commits} commits ${m.renders} renders (editor ${m.editor}, sections ${m.sections})`)
        if (process.env.TOP) console.log(`      ${m.top}   commits at ${m.times}`)
        return m
      }
      const boxAt = (nth) => js((nth) => {
        const b = Array.from(document.querySelectorAll("#wb-preview-root [data-section-box]"))[nth]
        const sc = document.getElementById("wb-preview-root")
        sc.scrollTop += b.getBoundingClientRect().top - sc.getBoundingClientRect().top - 120
        const r = b.getBoundingClientRect()
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(40, r.height / 2)), key: b.getAttribute("data-section-key") }
      }, nth)
      const ring = (key) => `!!document.querySelector('[data-section-key="${key}"] .wb-ring.z-\\\\[9998\\\\]')`
      const panelOf = (key) => `!!document.querySelector('[data-wb-section-panel="${key}"]')`
      const fieldsOf = (key) => `!!document.querySelector('[data-wb-section-panel="${key}"] [data-setting-field]')`

      /* Hover: moving over the canvas renders nothing. */
      {
        const a = await boxAt(6)
        await js(() => { window.__perf.counting = true; window.__perf.renders = {}; window.__hc = window.__perf.commits })
        for (let i = 0; i < 30; i++) await page.mouse.move(200 + a.x / 2 + i * 7, a.y + (i % 5) * 30)
        await sleep(300)
        const h = await js(() => { const P = window.__perf; P.counting = false; let t = 0; for (const k in P.renders) t += P.renders[k]; return { commits: P.commits - window.__hc, renders: t, top: Object.keys(P.renders).sort((a, b) => P.renders[b] - P.renders[a]).slice(0, 6).map((k) => k + ":" + P.renders[k]).join(" ") } })
        table.push({ cpu, name: "hover 30 moves", ...h })
        console.log(`  ${"hover 30 moves".padEnd(26)} ${h.commits} commits ${h.renders} renders  ${h.top}`)
      }
      for (let k = 0; k < ROUNDS; k++) {
        const a = await boxAt([10, 13, 21, 25, 29][k % 5])
        await run(`canvas: section ${k + 1}`, () => press(a), { ring: ring(a.key), panel: panelOf(a.key), fields: fieldsOf(a.key) })
      }
      /* Back to the list, then rows. */
      for (let k = 0; k < ROUNDS; k++) {
        await js(() => { for (let i = 0; i < 3 && !document.querySelector("[data-section-row]"); i++) { document.querySelector("[data-wb-sidebar-panel] button[aria-label='Back']")?.click() } })
        await sleep(500)
        const row = await js((n) => { const r = document.querySelectorAll("[data-section-group='template'] [data-section-row]")[n]; if (!r) return null; r.scrollIntoView({ block: "center" }); const q = r.getBoundingClientRect(); return { x: Math.round(q.left + 70), y: Math.round(q.top + q.height / 2), key: r.getAttribute("data-section-row") || r.closest("[data-section-key]")?.getAttribute("data-section-key") } }, 6 + k * 5)
        if (!row) { console.log("  no sidebar rows"); break }
        await run(`sidebar: row ${k + 1}`, () => press(row), { panel: `!!document.querySelector('[data-wb-section-panel]')`, fields: `!!document.querySelector('[data-wb-section-panel] [data-setting-field]')` })
        await run(`sidebar: back ${k + 1}`, () => js(() => { document.querySelector("[data-wb-sidebar-panel] button[aria-label='Back']")?.click() }), { list: `!!document.querySelector("[data-section-row]")` })
      }
      /*
        THE TABS, AND WHAT THE LIST KEEPS. The list scrolled part way and a
        section's tree opened, then into a section and Back, then Theme and
        Sections again: each press timed to its tab lit and its panel drawn,
        and the list's scroll and open rows read after each return.
      */
      const listState = () => js(() => {
        const sc = document.querySelector(".wb-desk-panel [data-sheet-scroll]")
        return { scroll: sc ? Math.round(sc.scrollTop) : null, open: document.querySelectorAll("[data-section-row][aria-expanded='true']").length }
      })
      await js(() => { const sc = document.querySelector(".wb-desk-panel [data-sheet-scroll]"); if (sc) sc.scrollTop = 400 })
      await sleep(300)
      const kept0 = await listState()
      const tabAt = (n) => js((n) => { const t = document.querySelectorAll("[data-wb-sidebar-tabs] [role=tab]")[n]; const q = t.getBoundingClientRect(); return { x: Math.round(q.left + q.width / 2), y: Math.round(q.top + q.height / 2) } }, n)
      const panelSwap = `(function(){ var p = document.querySelector(".wb-desk-panel"); if (!window.__panel0) window.__panel0 = p; return p && p !== window.__panel0 && p.childElementCount > 0 })()`
      for (const [label, n] of [["tab: Theme", 2], ["tab: Pages", 1], ["tab: Sections", 0]]) {
        const at = await tabAt(n)
        await js(() => { window.__panel0 = document.querySelector(".wb-desk-panel") })
        await run(label, () => press(at), { lit: `document.querySelectorAll("[data-wb-sidebar-tabs] [role=tab]")[${n}].getAttribute("aria-selected") === "true"`, panel: panelSwap })
      }
      const kept1 = await listState()
      const row2 = await js(() => { const r = [...document.querySelectorAll("[data-section-group='template'] [data-section-row]")].find((x) => { const q = x.getBoundingClientRect(); return q.top > 200 && q.bottom < innerHeight - 50 }); if (!r) return null; const q = r.getBoundingClientRect(); return { x: Math.round(q.left + 70), y: Math.round(q.top + q.height / 2) } })
      if (row2) {
        await press(row2)
        await sleep(800)
        const back = await js(() => { const b = document.querySelector("[data-wb-sidebar-panel] button[aria-label='Back']"); if (!b) return null; const q = b.getBoundingClientRect(); return { x: Math.round(q.left + q.width / 2), y: Math.round(q.top + q.height / 2) } })
        if (back) await run("section, then Back", () => press(back), { list: `!!document.querySelector("[data-section-row]")` })
      }
      const kept2 = await listState()
      console.log(`  the list's scroll and open rows: before ${JSON.stringify(kept0)}, after the tabs ${JSON.stringify(kept1)}, after a section and Back ${JSON.stringify(kept2)}`)
      table.push({ cpu, name: "list kept", kept0, kept1, kept2 })
      if (errors.length) console.log("  page errors:", errors.slice(0, 3))
      await page.close()
    }
  } finally {
    await browser.close()
  }
  if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(table, null, 1))
}
main().catch((e) => { console.error(e); process.exit(1) })
