/**
 * ===========================================================================
 *  SECTIONS ON A LONG PAGE: ADD, REMOVE, DUPLICATE, MOVE, SELECT, UNDO, SAVE
 * ===========================================================================
 * The owner: "adding, removing, duplicating, rearranging, selecting and
 * editing sections happen immediately; never rebuild the whole website when
 * one section changes ... autosave without blocking ... prevent outdated
 * saves replacing newer values ... reliable undo/redo".
 *
 * The real editor (scripts/editor-probe-harness.mjs, production React, the
 * network answered in the page) on a home page of 44 sections with pictures,
 * at 1280 x 900, driven with real input over the devtools protocol:
 *
 *   select (canvas), select (sidebar row), duplicate, delete, move down by
 *   the row's menu, hide and show, drag a row across twelve others, an undo
 *   burst of eight and a redo burst of eight
 *
 * and for each: React commits, components rendered (the editor, sections,
 * sidebar rows), sections MOUNTED (a section drawn again from nothing is a
 * remount: its pictures load again), canvas section nodes replaced, long
 * tasks and blocking time, wall time from the input to the last commit.
 *
 * Then the save pipeline, with every route answering after SAVE_MS:
 *
 *   type 40 keys        PUT requests sent, bytes per save, the most section
 *                       saves in flight at once (must be 1), and whether the
 *                       last save written is the text on screen
 *   a newer edit while a save is in flight: the button must not say Saved
 *                       until that edit is written too
 *   offline             saves refused with 503: the edit stays unsaved, and
 *                       is written on its own once the route answers again
 *   undo grouping       40 keys in one field is one step; a second field
 *                       right after is a step of its own
 *
 * and memory over MINUTES of synthetic editing (heap after a forced
 * collection, DOM nodes, listeners).
 *
 *   node scripts/check-editor-sections.mjs
 *   CPU=4 node scripts/check-editor-sections.mjs
 *   EDITOR_BUNDLE=<file>   a bundle built from another commit, to compare
 *   MINUTES=10             synthetic editing for the memory run (default 2)
 *   REPORT_ONLY=1          print, never fail
 *   JSON=<file>            the numbers as JSON
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const CPU = Number(process.env.CPU ?? 1)
const MINUTES = Number(process.env.MINUTES ?? 2)
const SAVE_MS = Number(process.env.SAVE_MS ?? 700)
const STRICT = process.env.REPORT_ONLY !== "1"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAF0lEQVR4nGP8z8Dwn4GBgYGJAQ0AAB5vAQVVB2CvAAAAAElFTkSuQmCC", "base64")

/* 44 sections: the header, 42 of the page's own (pictures in most), the footer. */
const BODY = ["hero_centered", "features_grid", "text_image", "text_rich", "proof_testimonials", "faq_accordion", "cta_simple", "promo_newsletter"]
const PAGE = ["header", ...Array.from({ length: 42 }, (_, i) => BODY[i % BODY.length]), "footer"]

/**
 * Before the bundle: a devtools hook React injects itself into, walking each
 * commit's fibers the way React DevTools does (scripts/check-editor-perf.mjs),
 * counting renders and, separately, MOUNTS (a fiber with no alternate).
 */
const INIT = String.raw`
(function () {
  var P = window.__perf = { commits: 0, lastCommit: 0, counting: false, renders: {}, mounts: {}, longs: [] }
  var COMP = { 0: 1, 1: 1, 11: 1, 14: 1, 15: 1 }
  function nameOf(f) {
    var t = f.type
    if (!t) return "?"
    if (f.tag === 11) return t.displayName || (t.render && (t.render.displayName || t.render.name)) || "ForwardRef"
    if (f.tag === 14) return (t.type && (t.type.displayName || t.type.name)) || "Memo"
    return t.displayName || t.name || "Anonymous"
  }
  function walk(top) {
    var stack = [top, top.alternate]
    while (stack.length) {
      var p = stack.pop(), n = stack.pop()
      if (COMP[n.tag] && (!p || (n.flags & 1) === 1)) {
        var nm = nameOf(n)
        P.renders[nm] = (P.renders[nm] || 0) + 1
        if (!p) P.mounts[nm] = (P.mounts[nm] || 0) + 1
        /* WHY_CTX=<component>: which of its contexts changed, by place in its reading order, when it drew again. */
        if (p && window.__whyCtx === nm && n.dependencies && p.dependencies) {
          var a = n.dependencies.firstContext, b = p.dependencies.firstContext, k = 0
          var props = n.memoizedProps !== p.memoizedProps
          P.why = P.why || {}
          if (props) P.why.props = (P.why.props || 0) + 1
          while (a && b) { if (a.memoizedValue !== b.memoizedValue) { var key = "ctx" + k + ":" + Object.keys(a.memoizedValue || {}).slice(0, 4).join("|"); P.why[key] = (P.why[key] || 0) + 1 } a = a.next; b = b.next; k++ }
        }
      }
      if (p && n.child === p.child) continue
      for (var c = n.child; c; c = c.sibling) stack.push(c, c.alternate)
    }
  }
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, isDisabled: false, renderers: new Map(),
    inject: function (r) { this.renderers.set(1, r); return 1 },
    onCommitFiberRoot: function (id, root) {
      P.commits++
      P.lastCommit = performance.now()
      if (P.counting) { try { walk(root.current) } catch (e) { P.walkError = String(e) } }
    },
    onCommitFiberUnmount: function () {}, onPostCommitFiberRoot: function () {}, checkDCE: function () {},
    on: function () {}, off: function () {}, emit: function () {}, sub: function () { return function () {} },
  }
  try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { P.longs.push([e.startTime, e.duration]) }) }).observe({ type: "longtask", buffered: true }) } catch (e) {}
  /* Every PUT, with when it started and ended, so overlap can be read. */
  window.__puts = []
  var f = window.fetch
  window.__wrapFetch = function () {
    var inner = window.fetch
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : input.url
      if (!init || init.method !== "PUT") return inner(input, init)
      var rec = { url: url, bytes: String(init.body || "").length, body: String(init.body || ""), t0: performance.now(), t1: null, status: 0 }
      window.__puts.push(rec)
      return inner(input, init).then(function (r) { rec.t1 = performance.now(); rec.status = r.status; return r }, function (e) { rec.t1 = performance.now(); rec.status = -1; throw e })
    }
  }
})()
`

const TOOLS = String.raw`
window.__pt = (function () {
  var P = window.__perf
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms) }) }
  var frame = function () { return new Promise(function (r) { requestAnimationFrame(function () { r() }) }) }
  var w = null
  function boxes() { return Array.prototype.slice.call(document.querySelectorAll("#wb-preview-root [data-section-box]")) }
  function start() {
    P.counting = true; P.renders = {}; P.mounts = {}
    boxes().forEach(function (b) { b.__seen = 1 })
    document.querySelectorAll("#wb-preview-root img").forEach(function (i) { i.__seen = 1 })
    w = { c0: P.commits, l0: P.longs.length, t0: performance.now(), keys: boxes().map(function (b) { return b.getAttribute("data-section-key") }) }
  }
  async function quiet(quietMs, capMs) {
    quietMs = quietMs || 500; capMs = capMs || 10000
    var t0 = performance.now()
    while (performance.now() - t0 < capMs) {
      await sleep(100)
      var last = P.longs.length ? P.longs[P.longs.length - 1][0] + P.longs[P.longs.length - 1][1] : 0
      if (performance.now() - Math.max(P.lastCommit, last, w ? w.t0 : 0) >= quietMs) break
    }
  }
  function stop() {
    P.counting = false
    var longs = P.longs.slice(w.l0).filter(function (l) { return l[0] >= w.t0 - 5 })
    var r = P.renders, m = P.mounts, total = 0
    for (var k in r) total += r[k]
    var before = new Set(w.keys)
    var replaced = boxes().filter(function (b) { return !b.__seen && before.has(b.getAttribute("data-section-key")) }).length
    var imgs = Array.prototype.filter.call(document.querySelectorAll("#wb-preview-root img"), function (i) { return !i.__seen }).length
    return {
      commits: P.commits - w.c0, renders: total,
      editor: r.StoreEditorPage || 0, sections: r.SectionRendererInner || 0, sectionMounts: m.SectionRendererInner || 0,
      rows: r.SectionRow || 0, replaced: replaced, newImages: imgs,
      longTasks: longs.length, longest: longs.length ? Math.round(Math.max.apply(null, longs.map(function (l) { return l[1] }))) : 0,
      tbt: Math.round(longs.reduce(function (a, l) { return a + Math.max(0, l[1] - 50) }, 0)),
      wall: Math.round(Math.max(P.lastCommit - w.t0, 0)),
      top: Object.keys(r).sort(function (a, b) { return r[b] - r[a] }).slice(0, window.__TOPN || 8).map(function (k) { return k + ":" + r[k] }),
    }
  }
  function visible(el) { return el && el.getClientRects().length > 0 }
  function button(label) {
    var all = document.querySelectorAll("button[aria-label]")
    for (var i = 0; i < all.length; i++) if (all[i].getAttribute("aria-label") === label && visible(all[i]) && !all[i].disabled) return all[i]
    return null
  }
  function saveText() {
    var all = document.querySelectorAll("button")
    for (var i = 0; i < all.length; i++) { var t = (all[i].textContent || "").trim(); if (/^(Save|Saved|Saving)$/.test(t) && visible(all[i])) return t }
    return null
  }
  function keys() { return boxes().map(function (b) { return b.getAttribute("data-section-key") }) }
  return { start: start, stop: stop, quiet: quiet, sleep: sleep, frame: frame, boxes: boxes, button: button, saveText: saveText, keys: keys, visible: visible }
})()
true
`

async function main() {
  const harness = await import("./editor-probe-harness.mjs")
  const out = mkdtempSync(join(tmpdir(), "editor-sections-"))
  writeFileSync(join(out, "editor-probe.js"), readFileSync(harness.bundle))
  writeFileSync(join(out, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${harness.css}</style></head><body><div id="app"></div><script>window.PROBE_PAGES={home:${JSON.stringify(PAGE)}};window.PROBE_SHORT=false</script><script src="editor-probe.js"></script><script>window.__wrapFetch();window.__TOPN=${Number(process.env.TOP) || 8};window.__whyCtx=${JSON.stringify(process.env.WHY_CTX ?? "")}</script></body></html>`)

  const browser = await puppeteer.launch({
    executablePath: harness.CHROMIUM, headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files", "--force-device-scale-factor=1", "--enable-precise-memory-info",
      "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"],
  })
  const report = { cpu: CPU, sections: PAGE.length }
  let broken = 0
  const expect = (ok, what, got) => {
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
    if (!ok) broken++
  }
  try {
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
    await page.evaluate(TOOLS)
    await page.evaluate(() => window.__pt.quiet(1500, 30000))
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU })
    console.log(`\nCPU ${CPU}x, ${PAGE.length} sections, ${await page.evaluate(() => document.querySelectorAll("#wb-preview-root img").length)} pictures on the canvas`)

    const js = (fn, ...a) => page.evaluate(fn, ...a)
    const measure = async (name, act, opts = {}) => {
      await js(() => window.__pt.quiet(400, 8000))
      await js(() => window.__pt.start())
      const note = await act()
      await js((q) => window.__pt.quiet(q, 10000), opts.quiet ?? 500)
      const m = await js(() => window.__pt.stop())
      if (note !== undefined && note !== true) m.note = note
      report[name] = m
      console.log(`  ${name.padEnd(20)} ${String(m.commits).padStart(3)} commits ${String(m.renders).padStart(6)} renders (editor ${m.editor}, sections ${m.sections}, mounted ${m.sectionMounts}, rows ${m.rows})  replaced ${m.replaced}, new pictures ${m.newImages}  long ${m.longTasks} (max ${m.longest}ms) blocking ${m.tbt}ms  wall ${m.wall}ms${m.note ? `  [${m.note}]` : ""}`)
      if (process.env.TOP) console.log(`      ${m.top.join("  ")}`)
      if (process.env.WHY_CTX) console.log(`      why ${process.env.WHY_CTX}: ${JSON.stringify(await js(() => { const w = window.__perf.why; window.__perf.why = {}; return w }))}`)
      return m
    }
    const clickAt = async (p) => { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up() }
    const centreOfBox = (nth) => js((nth) => {
      const b = window.__pt.boxes()[nth]
      const sc = document.getElementById("wb-preview-root")
      sc.scrollTop += b.getBoundingClientRect().top - sc.getBoundingClientRect().top - 120
      const r = b.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(40, r.height / 2)), key: b.getAttribute("data-section-key") }
    }, nth)
    const backToList = async () => {
      for (let i = 0; i < 3; i++) {
        const has = await js(() => document.querySelectorAll("[data-section-row]").length > 0)
        if (has) return true
        await js(() => { const b = window.__pt.button("Back"); const all = [...document.querySelectorAll("button[aria-label='Back']")].filter((x) => window.__pt.visible(x)); (all[1] ?? b)?.click() })
        await sleep(500)
      }
      return js(() => document.querySelectorAll("[data-section-row]").length > 0)
    }

    /* ── Select ── */
    const a = await centreOfBox(20)
    await measure("select (canvas)", async () => { await clickAt(a) })
    const b2 = await centreOfBox(24)
    await measure("select another", async () => { await clickAt(b2) })

    /* ── Duplicate and delete, from the selected section's own toolbar ── */
    const n0 = await js(() => window.__pt.boxes().length)
    await measure("duplicate", async () => js(() => { const b = window.__pt.button("Duplicate"); if (!b) return "no Duplicate"; b.click(); return true }), { quiet: 700 })
    const n1 = await js(() => window.__pt.boxes().length)
    await measure("delete", async () => js(() => { const b = window.__pt.button("Delete"); if (!b) return "no Delete"; b.click(); return true }), { quiet: 700 })
    const n2 = await js(() => window.__pt.boxes().length)
    expect(n1 === n0 + 1 && n2 === n0, "duplicate adds one section and delete takes it away", `${n0} -> ${n1} -> ${n2}`)

    /* ── The sidebar's list ── */
    expect(await backToList(), "the sidebar shows the page's sections")
    await measure("select (sidebar row)", async () => js(() => { const r = document.querySelectorAll("[data-section-group='template'] [data-section-row]")[18]; r.scrollIntoView({ block: "center" }); r.click(); return true }))
    await backToList()
    const order0 = await js(() => window.__pt.keys())
    await measure("move down (menu)", async () => {
      const more = await js(() => { const r = document.querySelectorAll("[data-section-group='template'] [data-section-row]")[10]; r.scrollIntoView({ block: "center" }); const m = r.querySelector("[data-section-more]"); m.style.display = "flex"; const q = m.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 } })
      await clickAt(more)
      await sleep(250)
      const item = await js(() => { const i = document.querySelector("[data-action-item='move-down']"); if (!i) return null; const q = i.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 } })
      if (!item) return "no Move down"
      await clickAt(item)
      return true
    })
    const order1 = await js(() => window.__pt.keys())
    const moved = order0.map((k, i) => (order1[i] !== k ? i : -1)).filter((i) => i >= 0)
    expect(moved.length === 2 && moved[1] === moved[0] + 1 && order1[moved[0]] === order0[moved[1]], "Move down swaps the row with the one under it", `places changed: ${moved.join(",")}`)

    await measure("hide", async () => js(() => { const r = document.querySelectorAll("[data-section-group='template'] [data-section-row]")[14]; r.scrollIntoView({ block: "center" }); const e = [...r.querySelectorAll("button[aria-label^='Hide']")][0]; if (!e) return "no eye"; e.click(); return true }))
    await measure("show", async () => js(() => { const r = document.querySelectorAll("[data-section-group='template'] [data-section-row]")[14]; const e = [...r.querySelectorAll("button[aria-label^='Show']")][0]; if (!e) return "no eye"; e.click(); return true }))

    /* ── Drag a row across twelve others, a frame at a time ── */
    const grip = await js(() => {
      const rows = document.querySelectorAll("[data-section-group='template'] [data-section-row]")
      rows[4].scrollIntoView({ block: "start" })
      const g = rows[4].querySelector("[aria-label^='Drag']").getBoundingClientRect()
      const step = rows[5].getBoundingClientRect().top - rows[4].getBoundingClientRect().top
      return { x: g.left + g.width / 2, y: g.top + g.height / 2, step }
    })
    const keysBeforeDrag = await js(() => window.__pt.keys())
    const drag = await measure("drag 12 rows", async () => {
      await js(() => { window.__frames = []; let last = performance.now(); const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__filming) requestAnimationFrame(tick) }; window.__filming = true; requestAnimationFrame(tick) })
      await page.mouse.move(grip.x, grip.y)
      await page.mouse.down()
      const dist = grip.step * 12.4
      for (let k = 1; k <= 40; k++) { await page.mouse.move(grip.x, grip.y + (dist * k) / 40); await sleep(16) }
      await page.mouse.up()
      await sleep(400)
      return js(() => { window.__filming = false; const f = window.__frames.slice(2); const over = f.filter((d) => d > 34).length; return `frames ${f.length}, over 34ms ${over}, longest ${Math.round(Math.max(...f))}ms` })
    }, { quiet: 700 })
    const keysAfterDrag = await js(() => window.__pt.keys())
    expect(keysAfterDrag.join() !== keysBeforeDrag.join(), "the drag moved the section", drag.note)

    /* ── Undo and redo, eight each, as fast as keys go ── */
    await js(() => document.activeElement && document.activeElement.blur && document.activeElement.blur())
    await measure("undo x8", async () => { for (let i = 0; i < 8; i++) { await page.keyboard.down("Control"); await page.keyboard.press("z"); await page.keyboard.up("Control") } }, { quiet: 700 })
    await measure("redo x8", async () => { for (let i = 0; i < 8; i++) { await page.keyboard.down("Control"); await page.keyboard.down("Shift"); await page.keyboard.press("z"); await page.keyboard.up("Shift"); await page.keyboard.up("Control") } }, { quiet: 700 })

    /* ── The save pipeline ── */
    console.log(`\n  saves (every route answers after ${SAVE_MS}ms)`)
    await js((ms) => { window.PROBE_API_DELAY_MS = ms }, SAVE_MS)
    /* Settle whatever is unsaved from above first. */
    for (let i = 0; i < 40 && (await js(() => window.__pt.saveText())) !== "Saved"; i++) await sleep(250)
    const hero = await centreOfBox(1)
    await clickAt(hero)
    await sleep(700)
    const field = await js(() => {
      const all = [...document.querySelectorAll("[data-wb-sidebar-scroll] input[type=text], [data-wb-sidebar-scroll] input:not([type]), [data-wb-sidebar-scroll] textarea")].filter((i) => window.__pt.visible(i))
      const i = all.find((x) => /^Section \d+:/.test(x.value || "")) ?? all[0]
      if (!i) return null
      i.scrollIntoView({ block: "center" })
      const r = i.getBoundingClientRect()
      return { x: r.left + r.width - 8, y: r.top + r.height / 2 }
    })
    expect(!!field, "the hero's settings have a text field")
    await js(() => { window.__puts.length = 0 })
    await clickAt(field)
    await page.keyboard.press("End")
    /* 40 keys at a typist's pace, with pauses long enough for autosave to start in the middle. */
    const typed = " and forty more letters typed here!!"
    for (let i = 0; i < typed.length; i++) {
      await page.keyboard.type(typed[i])
      await sleep(i % 12 === 11 ? 1700 : 60)
    }
    const final = await js(() => document.activeElement && document.activeElement.value)
    for (let i = 0; i < 60 && (await js(() => window.__pt.saveText())) !== "Saved"; i++) await sleep(250)
    await sleep(SAVE_MS + 300)
    const puts = await js(() => window.__puts.map((p) => ({ url: p.url.replace(/^.*\/themes\/[^/]+\//, ""), bytes: p.bytes, t0: p.t0, t1: p.t1, status: p.status, body: p.body })))
    const secPuts = puts.filter((p) => /^sections(\?|$)/.test(p.url))
    let overlap = 0
    for (const p of secPuts) overlap = Math.max(overlap, secPuts.filter((q) => q.t0 < (p.t1 ?? Infinity) && (q.t1 ?? Infinity) > p.t0).length)
    const lastBody = secPuts.length ? secPuts[secPuts.length - 1].body : ""
    report.saves = { keys: typed.length, puts: puts.length, sectionPuts: secPuts.length, bytesPerSave: secPuts.length ? Math.round(secPuts.reduce((a, p) => a + p.bytes, 0) / secPuts.length) : 0, overlap, saveText: await js(() => window.__pt.saveText()) }
    console.log(`      ${typed.length} keys: ${puts.length} PUTs (${secPuts.length} of the page), ${report.saves.bytesPerSave} bytes per page save, at most ${overlap} page saves in flight at once`)
    expect(overlap <= 1, "one page save in flight at a time", overlap)
    expect(!!final && lastBody.includes(JSON.stringify(final).slice(1, -1)), "the last page save written holds the text on screen")
    expect(report.saves.saveText === "Saved", "and the button says Saved", report.saves.saveText)

    /* A newer edit while a save is in flight. */
    await js(() => { window.PROBE_API_DELAY_MS = 2500; window.__puts.length = 0 })
    await clickAt(field)
    await page.keyboard.press("End")
    await page.keyboard.type("X")
    await js(() => window.__pt.sleep(1700))
    let inFlight = false
    for (let i = 0; i < 20 && !inFlight; i++) { inFlight = await js(() => window.__puts.some((p) => p.t1 === null)); if (!inFlight) await sleep(100) }
    await page.keyboard.type("Y")
    const textXY = await js(() => document.activeElement && document.activeElement.value)
    /* The first save lands; the Y is not in it. */
    for (let i = 0; i < 40 && (await js(() => window.__puts.some((p) => p.t1 === null))); i++) await sleep(100)
    const afterFirst = await js(() => window.__pt.saveText())
    for (let i = 0; i < 80 && (await js(() => window.__pt.saveText())) !== "Saved"; i++) await sleep(150)
    await sleep(600)
    const racePuts = await js(() => window.__puts.filter((p) => /\/sections(\?|$)/.test(p.url)).map((p) => p.body))
    report.race = { afterFirst, puts: racePuts.length }
    expect(afterFirst !== "Saved", "with a newer edit unsaved, the first save landing does not say Saved", afterFirst)
    expect(racePuts.length >= 2 && racePuts[racePuts.length - 1].includes(JSON.stringify(textXY).slice(1, -1)), "the newer edit is written after it", `${racePuts.length} page saves`)

    /* Offline: the route refuses, then answers again. */
    await js(() => { window.PROBE_API_DELAY_MS = 100; window.PROBE_SAVE_FAIL = 503; window.__puts.length = 0 })
    await clickAt(field)
    await page.keyboard.press("End")
    await page.keyboard.type("Z")
    const textZ = await js(() => document.activeElement && document.activeElement.value)
    await sleep(6000)
    const whileDown = await js(() => ({ text: window.__pt.saveText(), problem: !!document.querySelector("[data-save-problem]") }))
    await js(() => { window.PROBE_SAVE_FAIL = 0 })
    let recovered = false
    for (let i = 0; i < 120 && !recovered; i++) { await sleep(250); recovered = (await js(() => window.__pt.saveText())) === "Saved" }
    const offPuts = await js(() => window.__puts.filter((p) => /\/sections(\?|$)/.test(p.url)).map((p) => ({ status: p.status, body: p.body })))
    report.offline = { whileDown, recovered, puts: offPuts.length }
    expect(whileDown.text === "Save" && whileDown.problem, "while saves fail the edit is shown unsaved, with the reason", whileDown)
    expect(recovered && offPuts.at(-1)?.status === 200 && offPuts.at(-1).body.includes(JSON.stringify(textZ).slice(1, -1)), "once the route answers it is written without another edit", `${offPuts.length} tries`)

    /* Undo grouping: forty keys in one field is one step. */
    await js(() => { window.PROBE_API_DELAY_MS = 0 })
    await clickAt(field)
    await page.keyboard.press("End")
    const beforeRun = await js(() => document.activeElement.value)
    await page.keyboard.type("0123456789012345678901234567890123456789", { delay: 30 })
    await sleep(800)
    await js(() => document.activeElement.blur())
    await page.keyboard.down("Control"); await page.keyboard.press("z"); await page.keyboard.up("Control")
    await sleep(500)
    const afterUndo = await js(() => { const all = [...document.querySelectorAll("[data-wb-sidebar-scroll] input, [data-wb-sidebar-scroll] textarea")].filter((i) => window.__pt.visible(i)); return all.map((i) => i.value) })
    report.undo = { grouped: afterUndo.includes(beforeRun) }
    expect(afterUndo.includes(beforeRun), "one Undo takes back forty keys typed in one field")

    /* ── Memory over MINUTES of editing ── */
    const heap = async () => {
      await cdp.send("HeapProfiler.enable")
      await cdp.send("HeapProfiler.collectGarbage"); await sleep(200); await cdp.send("HeapProfiler.collectGarbage")
      const h = await cdp.send("Runtime.getHeapUsage")
      const d = await cdp.send("Memory.getDOMCounters")
      const timers = await js(() => window.__timersLive ?? null)
      return { heapMB: +(h.usedSize / 1048576).toFixed(1), nodes: d.nodes, listeners: d.jsEventListeners, timers }
    }
    if (MINUTES > 0) {
      await js(() => { window.PROBE_API_DELAY_MS = 150 })
      const m0 = await heap()
      const until = Date.now() + MINUTES * 60_000
      let loops = 0
      while (Date.now() < until) {
        loops++
        const p = await centreOfBox(3 + (loops % 20))
        await clickAt(p)
        await sleep(150)
        await js(() => window.__pt.button("Duplicate")?.click())
        await sleep(250)
        await js(() => window.__pt.button("Delete")?.click())
        await sleep(250)
        const f = await js(() => {
          const i = [...document.querySelectorAll("[data-wb-sidebar-scroll] input[type=text], [data-wb-sidebar-scroll] textarea")].find((x) => window.__pt.visible(x))
          if (!i) return null
          const r = i.getBoundingClientRect()
          return { x: r.left + 10, y: r.top + r.height / 2 }
        })
        if (f) { await clickAt(f); await page.keyboard.type("ab"); await page.keyboard.press("Backspace"); await page.keyboard.press("Backspace") }
        await page.keyboard.down("Control"); await page.keyboard.press("z"); await page.keyboard.up("Control")
        await page.keyboard.down("Control"); await page.keyboard.down("Shift"); await page.keyboard.press("z"); await page.keyboard.up("Shift"); await page.keyboard.up("Control")
        await sleep(200)
      }
      await js(() => window.__pt.quiet(1500, 20000))
      const m1 = await heap()
      report.memory = { minutes: MINUTES, loops, before: m0, after: m1, growthMB: +(m1.heapMB - m0.heapMB).toFixed(1) }
      console.log(`\n  memory: ${MINUTES} min, ${loops} rounds of select, duplicate, delete, type, undo, redo; heap ${m0.heapMB}MB -> ${m1.heapMB}MB, DOM nodes ${m0.nodes} -> ${m1.nodes}, listeners ${m0.listeners} -> ${m1.listeners}`)
      expect(m1.listeners - m0.listeners < 200, "listeners do not grow with editing", `${m0.listeners} -> ${m1.listeners}`)
    }
    if (errors.length) console.log(`  page errors: ${errors.slice(0, 5).join(" | ")}`)
    report.errors = errors
  } finally {
    await browser.close()
  }
  if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(report, null, 2))
  if (broken) {
    console.log(`\n${broken} check(s) failed`)
    if (STRICT) process.exit(1)
  } else console.log("\nall checks passed")
}

await main()
