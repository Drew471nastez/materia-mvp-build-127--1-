/**
 * ===========================================================================
 *  A SECTION'S SETTING DRAGGED ON AN IMPORTED THEME, AND THE PAGE FOLLOWING IT
 * ===========================================================================
 * The owner, round 35: "I adjust the header height and it's very laggy and
 * bad ... everything should feel native, very smooth, clean, no lags at
 * all." Filmed on their imported theme: the header's height slider dragged
 * from 54px to 132px, and the header in the canvas moving in about three
 * steps a second.
 *
 * The real editor (scripts/render-editor-probe.tsx through
 * scripts/editor-probe-harness.mjs) on Dawn, imported through the real
 * converter, with three settings added the way custom themes write them: a
 * "Header height" range in the header's own <style>, and a "Bar height"
 * range and a "Bar colour" in an inline style on the announcement bar.
 * Driven with real pointer input over the devtools protocol, 1440x900, at
 * full speed and with the CPU slowed 4x (the canvas's frame too). For each
 * gesture:
 *
 *   UPDATES     how many times a second the page in the frame showed a new
 *               value while the finger moved (read in the frame, every
 *               frame, from the property the setting drives)
 *   LATENCY     from a value under the finger to the first frame of the
 *               page showing it or a newer one: p50 and p95
 *   SHOWN       of the values the finger passed, how many the page showed
 *   LONGEST     the editor's longest main thread task while it ran
 *   RENDERS     React components rendered in the editor, and how many of
 *               them were the editor component itself
 *   SWAPS       sections the frame was sent to draw again whole
 *   AFTER       the value the page shows once the finger is up and the
 *               commit is in, and whether any frame after release showed
 *               another (a jump back)
 *
 * Round 35, the bundle before the round and after it, interleaved, two
 * rounds each, on a shared machine (load 5 on 4 cores): latency from a
 * value under the finger to the page showing it, p50/p95 in ms, each round.
 * The frame is in the editor's process here, so its work is the editor's;
 * "shown" is bounded by the pointer, which moves every 8ms and passes 30 to
 * 90 values.
 *
 *                         1x before           1x after          4x before             4x after
 *   header height         525/671, 477/1085   66/144, 33/96     1906/3802, 1919/3847  147/310, 181/390
 *     longest task        475, 653ms          118, 102ms        2210, 2076ms          402, 297ms
 *     renders, moving     1051, 1347          52, 64            1593, 1540            64, 58
 *   header top padding    324/510, 330/648    125/561, 72/374   1671/2212, 1624/3315  89/642, 121/622
 *   announcement height   79/177, 87/201      37/80, 28/51      289/471, 284/504      98/182, 107/193
 *     renders, moving     5347, 4462          138, 150          6030, 5900            132, 127
 *   section padding       100/181, 88/191     65/135, 39/137    249/424, 227/330      157/310, 151/393
 *   type heading          40/130, 43/108      33/113, 29/111    2049/2905, 1848/2910  340/531, 1190/1666
 *   announcement colour   26/219, 15/98       14/51, 8/29       72/194, 63/212        46/142, 43/144
 *   theme spacing         283/587, 401/825    199/739, 163/498  1198/1941, 1546/1891  822/1738, 760/1976
 *   theme button radius   313/562, 264/524    200/353, 161/322  1069/1881, 1459/2654  857/1263, 677/1050
 *
 *   npx tsx scripts/check-compat-live-edit.ts <dawn.zip>
 *   CPU=4                 only the slowed run
 *   EDITOR_BUNDLE=<file>  reuse a bundle (one from another commit, to compare)
 *   ONLY=<regexp>         only the gestures whose name matches
 *   FILM=<dir>            the editor filmed (devtools screencast) per gesture, frames as JPEG
 *   PROFILE=<regexp>      a CPU profile of the editor for the gestures whose name matches
 *   JSON=<file>           the numbers as JSON
 *   BUDGET=0              report without failing
 */
import { createServer } from "node:http"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import JSZip from "jszip"
import puppeteer, { type CDPSession, type Frame, type Page } from "puppeteer-core"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const BUDGET = process.env.BUDGET !== "0"
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, "i") : null
let broken = 0
const expect = (ok: boolean, what: string, got?: unknown) => {
  console.log(`  ${ok ? "ok  " : BUDGET ? "FAIL" : "note"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 300)})`}`)
  if (!ok && BUDGET) broken++
}

/* ── The theme, with the settings a custom theme writes ─────────────────── */

function withSchema(liquid: string, add: (schema: { settings?: unknown[] }) => void): string {
  return liquid.replace(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/, (_m, body: string) => {
    const schema = JSON.parse(body)
    add(schema)
    return `{% schema %}\n${JSON.stringify(schema, null, 2)}\n{% endschema %}`
  })
}

async function theme(zipPath: string) {
  const zip = await JSZip.loadAsync(readFileSync(zipPath))
  const find = (name: string) => Object.keys(zip.files).find((p) => p.endsWith(`sections/${name}`))!
  /* The header's height, in the section's own <style>, as a minimum height. */
  const headerPath = find("header.liquid")
  let header = await zip.file(headerPath)!.async("string")
  header = header.replace("<style>", "<style>\n  .header { min-height: {{ section.settings.header_height }}px; }\n")
  header = withSchema(header, (s) => { s.settings = [{ type: "range", id: "header_height", min: 40, max: 160, step: 2, unit: "px", label: "Header height", default: 76 }, ...(s.settings ?? [])] })
  zip.file(headerPath, header)
  /* The announcement bar's height and colour, in an inline style. */
  const barPath = find("announcement-bar.liquid")
  let bar = await zip.file(barPath)!.async("string")
  bar = bar.replace('<div\n  class="utility-bar', '<div\n  style="min-height: {{ section.settings.bar_height }}px; background-color: {{ section.settings.bar_color }};"\n  class="utility-bar')
  bar = withSchema(bar, (s) => { s.settings = [{ type: "range", id: "bar_height", min: 20, max: 120, step: 1, unit: "px", label: "Bar height", default: 36 }, { type: "color", id: "bar_color", label: "Bar colour", default: "#f3f3f3" }, ...(s.settings ?? [])] })
  zip.file(barPath, bar)
  const r = await convertShopifyTheme(zip)
  if (!r.ok) throw new Error(r.error)
  if (!bar.includes("bar_height }}px")) throw new Error("the announcement bar was not patched")
  return r.theme
}

/* ── In the editor: renders, long tasks ─────────────────────────────────── */

const INIT = String.raw`
(function () {
  if (window.top !== window) return
  var P = window.__le = { commits: 0, lastCommit: 0, counting: false, renders: {}, longs: [] }
  var COMP = { 0: 1, 1: 1, 11: 1, 15: 1 }
  function nameOf(f) { var t = f.type; if (!t) return "?"; if (f.tag === 11) return t.displayName || (t.render && (t.render.displayName || t.render.name)) || "ForwardRef"; return t.displayName || t.name || "Anonymous" }
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
    onCommitFiberRoot: function (id, root) { P.commits++; P.lastCommit = performance.now(); if (P.counting) { try { walk(root.current) } catch (e) {} } },
    onCommitFiberUnmount: function () {}, onPostCommitFiberRoot: function () {}, checkDCE: function () {},
    on: function () {}, off: function () {}, emit: function () {}, sub: function () { return function () {} },
  }
  try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { P.longs.push([e.startTime, e.duration]) }) }).observe({ type: "longtask", buffered: true }) } catch (e) {}
})()
`

/* ── In the frame: what the page shows, every frame ─────────────────────── */

/** Installed in the canvas's frame: `read()` is sampled every frame with the absolute time; section swaps and morphs are counted. */
const FRAME_TOOLS = String.raw`
window.__fl = (function () {
  var w = null
  var counts = { section: 0, patch: 0 }
  addEventListener("message", function (e) { var m = e.data; if (m && m.storelib === 1 && counts[m.type] !== undefined) counts[m.type]++ })
  var now = function () { return performance.timeOrigin + performance.now() }
  return {
    start: function (src) {
      var read = new Function("return (" + src + ")()")
      w = { read: read, samples: [], frames: [], on: true, c0: { section: counts.section, patch: counts.patch }, longs: [] }
      try { w.po = new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { w.longs.push(e.duration) }) }); w.po.observe({ type: "longtask" }) } catch (e) {}
      var prev = null, last
      var tick = function (ts) {
        if (!w || !w.on) return
        if (prev !== null) w.frames.push(ts - prev)
        prev = ts
        var v
        try { v = String(w.read()) } catch (e) { v = "?" }
        if (v !== last) { w.samples.push([now(), v]); last = v }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      return true
    },
    stop: function () {
      w.on = false
      if (w.po) w.po.disconnect()
      return { samples: w.samples, frames: w.frames.length, framesOver33: w.frames.filter(function (f) { return f > 33.4 }).length, worstFrame: Math.round(Math.max.apply(null, w.frames.concat([0]))), sections: counts.section - w.c0.section, patches: counts.patch - w.c0.patch, longest: Math.round(Math.max.apply(null, w.longs.concat([0]))) }
    },
    read: function (src) { try { return String(new Function("return (" + src + ")()")()) } catch (e) { return "?" } },
  }
})()
true
`

const pct = (a: number[], p: number) => {
  if (!a.length) return null
  const s = [...a].sort((x, y) => x - y)
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))])
}

type Gesture = {
  name: string
  /** Picks the section in the frame (a point to press, read in the frame), or null to keep what is selected. */
  select: string | null
  /** The setting's label in the sidebar. */
  label: RegExp
  /** In the frame: what the setting drives, as a string. */
  read: string
  /** That string for a value. */
  expected: (v: string) => string
  /** Values that cannot be read back (a colour from a picker): any change on the page after a value counts as it. */
  byChange?: boolean
}

async function run(cpu: number, files: { bundle: string; css: string }, compat: unknown) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${files.css}</style></head><body><div id="app"></div><script>window.PROBE_SHORT=false;window.PROBE_COMPAT=${JSON.stringify(compat).replace(/</g, "\\u003c")}</script><script src="/editor-probe.js"></script></body></html>`)
      return
    }
    if (url.pathname === "/editor-probe.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" })
      res.end(readFileSync(files.bundle))
      return
    }
    const asset = url.pathname.match(/^\/api\/site-theme\/assets\/[^/]+\/[^/]+\/(.+)$/)
    const all = (compat as { all: Record<string, string> }).all
    if (asset) {
      const name = decodeURIComponent(asset[1])
      const text = all[`shopify/assets/${name}`]
      if (text === undefined) { res.writeHead(404, { "Access-Control-Allow-Origin": "*" }); res.end(); return }
      const type = name.endsWith(".css") ? "text/css" : name.endsWith(".js") ? "text/javascript" : name.endsWith(".svg") ? "image/svg+xml" : "text/plain"
      res.writeHead(200, { "Content-Type": type, "Access-Control-Allow-Origin": "*" })
      res.end(text)
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1"],
  })
  const report: Record<string, unknown> = {}
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
    await page.evaluateOnNewDocument("window.__name = (f) => f")
    await page.evaluateOnNewDocument(INIT)
    const errors: string[] = []
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    await page.goto(base, { waitUntil: "domcontentloaded" })
    const front = async (): Promise<Frame | null> => (await (await page.$("[data-compat-frame='front']"))?.contentFrame()) ?? null
    let frame: Frame | null = null
    for (let i = 0; i < 160 && !frame; i++) {
      await sleep(250)
      frame = await front()
      if (frame && !(await frame.evaluate(() => document.querySelectorAll(".shopify-section").length).catch(() => 0))) frame = null
    }
    if (!frame) throw new Error("the canvas never drew the theme")
    /* Quiet: the editor reads the store's languages, markets and cards after it opens. */
    for (let i = 0, n = -1; i < 40; i++) {
      await sleep(500)
      const now = await page.evaluate(() => (window as unknown as { probeCalls: string[] }).probeCalls.length)
      if (now === n && i > 6) break
      n = now
    }
    const cdp = await page.createCDPSession()
    /* The frame is its own process where the browser isolates sandboxed frames: slowed through its own session. */
    const throttle = async (rate: number) => {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate })
      const f = await front()
      const client = (f as unknown as { client?: CDPSession })?.client
      if (client && client !== (cdp as unknown)) await client.send("Emulation.setCPUThrottlingRate", { rate }).catch(() => {})
    }
    const isolated = await (async () => { const f = await front(); const t = (f as unknown as { client?: { target?: () => unknown } })?.client; return !!t && t !== (page as unknown as { _client?: () => unknown })._client?.() })()
    if (process.env.SIZES) console.log("section sizes", await frame.evaluate(() => [...document.querySelectorAll(".shopify-section")].map((e) => `${e.id}:${e.outerHTML.length}`).join(" ")))
    if (process.env.DEBUG_RECALC) console.log("recalc", JSON.stringify(await frame.evaluate(() => {
      const bar = document.querySelector<HTMLElement>(".utility-bar")!
      const read = () => getComputedStyle(bar).minHeight
      const time = (f: (i: number) => void) => { const out: number[] = []; for (let i = 0; i < 15; i++) { read(); f(i); const t0 = performance.now(); read(); out.push(performance.now() - t0) } out.sort((a, b) => a - b); return +out[7].toFixed(2) }
      const box = document.querySelector<HTMLElement>("[data-sl-box]")
      const style = [...document.querySelectorAll<HTMLStyleElement>(".shopify-section style")].find((x) => /min-height/.test(x.textContent ?? ""))
      const rule = style?.sheet ? [...style.sheet.cssRules].find((r) => /min-height/.test(r.cssText)) as CSSStyleRule | undefined : undefined
      const all = document.querySelectorAll("*").length
      const sheets = document.styleSheets.length
      let rules = 0
      for (const sh of document.styleSheets) { try { rules += sh.cssRules.length } catch { /* */ } }
      const has = [...document.styleSheets].flatMap((sh) => { try { return [...sh.cssRules].map((r) => r.cssText) } catch { return [] } }).filter((t) => t.includes(":has(")).length
      return {
        elements: all, sheets, rules, hasRules: has,
        nothing: time(() => {}),
        barInline: time((i) => { bar.style.minHeight = `${30 + i}px` }),
        box: box ? time((i) => { box.style.width = `${100 + i}px` }) : null,
        ruleProp: rule ? time((i) => { rule.style.setProperty("min-height", `${60 + i}px`) }) : null,
        styleText: style ? time((i) => { style.textContent = (style.textContent ?? "").replace(/min-height: \d+px/, `min-height: ${60 + i}px`) }) : null,
        bodyAttr: time((i) => { document.body.setAttribute("data-x", String(i)) }),
      }
    })))
    if (process.env.DEBUG_VAR) console.log("var", await frame.evaluate(() => {
      const out: string[] = []
      document.querySelectorAll("style").forEach((x) => { const t = x.textContent ?? ""; if (t.includes("spacing-sections-desktop")) out.push(`STYLE attrs=${[...x.attributes].map((a) => a.name).join(",")} parent=${x.parentElement?.tagName} len=${t.length}`) })
      const html = document.documentElement.outerHTML
      out.push(`in html: ${html.split("spacing-sections-desktop").length - 1}`)
      return out.join(" | ")
    }))
    if (process.env.SRCLINE) console.log("srcdoc line", process.env.SRCLINE, await page.evaluate((n) => (document.querySelector("[data-compat-frame='front']")?.getAttribute("srcdoc") ?? "").split("\n").slice(n - 1, n + 40).map((l) => l.slice(0, 300)).join("\n---\n"), Number(process.env.SRCLINE)))
    console.log(`\nCPU ${cpu}x   ${await frame.evaluate(() => document.querySelectorAll(".shopify-section").length)} sections in the frame`)

    const frameBox = async () => (await (await page.$("[data-compat-frame='front']"))!.boundingBox())!
    const pressInFrame = async (src: string) => {
      const f = (await front())!
      const at = await f.evaluate(`(${src})()`) as { x: number; y: number } | null
      if (!at) return false
      await sleep(250)
      const box = await frameBox()
      await page.mouse.click(box.x + at.x, box.y + at.y)
      await sleep(900)
      return true
    }
    const sliderAt = (label: RegExp) => page.evaluate(async (src) => {
      const re = new RegExp(src, "i")
      const text = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim()
      const seen: string[] = []
      for (const s of document.querySelectorAll<HTMLElement>("[data-slot='slider']")) {
        if (!s.getClientRects().length) continue
        let label = ""
        for (let p = s.parentElement; p && p !== document.body && !label; p = p.parentElement) {
          const l = p.querySelector("label, p, span")
          if (l && !s.contains(l) && text(l)) label = text(l)
        }
        seen.push(label)
        if (!re.test(label)) continue
        s.scrollIntoView({ block: "center" })
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
        const t = s.querySelector("[data-slot='slider-thumb']")!.getBoundingClientRect()
        const r = s.getBoundingClientRect()
        return { label, tx: t.left + t.width / 2, ty: t.top + t.height / 2, left: r.left, right: r.right }
      }
      return { none: seen }
    }, label.source)

    let film: { dir: string; n: number; stop: () => Promise<void> } | null = null
    const startFilm = async (name: string) => {
      if (!process.env.FILM) return
      const dir = join(process.env.FILM, `${cpu}x-${name.replace(/\W+/g, "-")}`)
      mkdirSync(dir, { recursive: true })
      const f = { dir, n: 0, stop: async () => {} }
      const onFrame = (e: { data: string; sessionId: number; metadata: { timestamp?: number } }) => {
        writeFileSync(join(dir, `${String(f.n++).padStart(4, "0")}-${Math.round((e.metadata.timestamp ?? 0) * 1000)}.jpg`), Buffer.from(e.data, "base64"))
        cdp.send("Page.screencastFrameAck", { sessionId: e.sessionId }).catch(() => {})
      }
      cdp.on("Page.screencastFrame", onFrame)
      await cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, everyNthFrame: 1 })
      f.stop = async () => { await cdp.send("Page.stopScreencast"); cdp.off("Page.screencastFrame", onFrame) }
      film = f
    }

    const gesture = async (g: Gesture, drive: () => Promise<{ t: number; v: string }[]>) => {
      if (ONLY && !ONLY.test(g.name)) return
      const f = (await front())!
      await f.evaluate(FRAME_TOOLS).catch(() => {})
      await page.evaluate(() => {
        const P = (window as unknown as { __le: { counting: boolean; renders: Record<string, number>; longs: unknown[]; l0?: number; atUp?: Record<string, number> | null } }).__le
        P.counting = true; P.renders = {}; P.l0 = P.longs.length; P.atUp = null
        /* What rendered while the finger moved: read as it lifts, before the commit. */
        addEventListener("pointerup", () => { if (!P.atUp) P.atUp = { ...P.renders } }, { capture: true, once: true })
      })
      const calls0 = await page.evaluate(() => (window as unknown as { probeCalls: string[] }).probeCalls.length)
      await throttle(cpu)
      const profiling = process.env.PROFILE && new RegExp(process.env.PROFILE, "i").test(g.name)
      if (profiling) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 200 }); await cdp.send("Profiler.start") }
      const tracing = process.env.TRACE && new RegExp(process.env.TRACE, "i").test(g.name)
      if (tracing) await page.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.stack"] })
      await startFilm(g.name)
      if (process.env.DEBUG_MSG) await f.evaluate(() => { const w = window as unknown as { __msgT: number[] }; w.__msgT = []; addEventListener("message", (e) => { const t0 = performance.now(); const d = e.data as { type?: string; html?: string }; void d; if (d && d.type === "section") w.__msgT.push(performance.now() - t0) }, true) })
      await f.evaluate((src) => (window as unknown as { __fl: { start: (s: string) => boolean } }).__fl.start(src), g.read)
      const values = await drive()
      if (process.env.CALLS) console.log("    calls: " + JSON.stringify(await page.evaluate((c0) => (window as unknown as { probeCalls: string[] }).probeCalls.slice(c0), calls0)))
      const released = Date.now()
      /* The commit is a transition after release: waited for, then a moment more for anything that would jump. */
      await sleep(1500 * Math.max(1, cpu / 2))
      const m = await f.evaluate(() => (window as unknown as { __fl: { stop: () => { samples: [number, string][]; frames: number; framesOver33: number; worstFrame: number; sections: number; patches: number; longest: number } } }).__fl.stop())
      if (process.env.DEBUG_CSS) console.log("    styles: " + JSON.stringify(await f.evaluate(() => [...document.querySelectorAll(".shopify-section style")].filter((x) => (x as unknown as { __slText?: string }).__slText !== undefined || /min-height/.test(x.textContent ?? "")).map((x) => {
        const sh = (x as HTMLStyleElement).sheet
        const rules = sh ? [...sh.cssRules].filter((r) => /min-height/.test(r.cssText)).map((r) => r.cssText.slice(0, 120)) : []
        return { slText: ((x as unknown as { __slText?: string }).__slText ?? "").match(/min-height:[^;]*/)?.[0] ?? null, text: (x.textContent ?? "").match(/min-height:[^;]*/)?.[0], rules, header: getComputedStyle(document.querySelector(".header")!).minHeight }
      }))))
      if (process.env.DEBUG_MSG) console.log("    reading a section message: " + JSON.stringify(await f.evaluate(() => { const a = (window as unknown as { __msgT: number[] }).__msgT; return { n: a.length, avg: a.reduce((x, y) => x + y, 0) / (a.length || 1), max: Math.max(0, ...a) } })))
      if (film) { await (film as { stop: () => Promise<void> }).stop(); film = null }
      if (profiling) printProfile((await cdp.send("Profiler.stop")).profile as unknown as Parameters<typeof printProfile>[0])
      if (tracing) printTrace(JSON.parse(Buffer.from((await page.tracing.stop()) ?? new Uint8Array()).toString("utf8")).traceEvents)
      await throttle(1)
      const editor = await page.evaluate((c0) => {
        const P = (window as unknown as { __le: { counting: boolean; renders: Record<string, number>; longs: [number, number][]; l0: number } }).__le
        P.counting = false
        const r = P.renders
        const total = Object.values(r).reduce((a, b) => a + b, 0)
        const longs = P.longs.slice(P.l0).map((l) => l[1])
        const calls = (window as unknown as { probeCalls: string[] }).probeCalls.slice(c0)
        const top = Object.keys(r).sort((a, b) => r[b] - r[a]).slice(0, 8).map((k) => `${k}:${r[k]}`)
        const up = (P as unknown as { atUp?: Record<string, number> | null }).atUp ?? null
        const moving = up ? Object.values(up).reduce((a, b) => a + b, 0) : null
        const movingTop = up ? Object.keys(up).sort((a, b) => up[b] - up[a]).slice(0, 8).map((k) => `${k}:${up[k]}`) : []
        return { moving, movingTop, renders: total, editor: Object.keys(r).filter((k) => /^StoreEditorPage\d*$/.test(k)).reduce((a, k) => a + r[k], 0), canvas: r.CompatCanvas ?? 0, longest: longs.length ? Math.round(Math.max(...longs)) : 0, longTasks: longs.length, fetches: calls.filter((c) => !/^(PUT|POST|PATCH) /.test(c)).length, saves: calls.filter((c) => /^(PUT|POST|PATCH) /.test(c)).length, top }
      }, calls0)
      /* Which value each frame showed: the newest value under the finger by then that reads the same. */
      const exp = values.map((x) => g.expected(x.v))
      const shownIndex = m.samples.map(([t, v], k) => {
        let j = -1
        for (let i = 0; i < values.length && values[i].t <= t + 1; i++) if (g.byChange ? k > 0 : exp[i] === v) j = i
        return { t, j, v }
      })
      const lat: number[] = []
      for (let i = 0; i < values.length; i++) {
        const hit = shownIndex.find((s) => s.j >= i && s.t >= values[i].t - 1)
        if (hit) lat.push(hit.t - values[i].t)
      }
      const t0 = values[0]?.t ?? 0
      const tEnd = values[values.length - 1]?.t ?? 0
      const during = shownIndex.filter((s) => s.t >= t0 && s.t <= tEnd + 50 && s.j >= 0)
      const shown = new Set(shownIndex.filter((s) => s.j >= 0).map((s) => s.j)).size
      const final = g.byChange ? m.samples[m.samples.length - 1]?.[1] : exp[exp.length - 1]
      const afterRelease = shownIndex.filter((s) => s.t > released)
      const last = m.samples[m.samples.length - 1]?.[1]
      /* A frame after the release showing something other than the last value, once the last value had been shown. */
      const firstFinal = shownIndex.findIndex((s) => s.v === final && s.t >= tEnd - 1)
      const jumped = firstFinal >= 0 ? shownIndex.slice(firstFinal).filter((s) => s.v !== final).map((s) => s.v) : []
      const out = {
        values: values.length, seconds: +((tEnd - t0) / 1000).toFixed(2),
        updatesPerSecond: tEnd > t0 ? +((during.length / (tEnd - t0)) * 1000).toFixed(1) : 0,
        shown, latencyP50: pct(lat, 50), latencyP95: pct(lat, 95),
        editorLongest: editor.longest, editorLongTasks: editor.longTasks, frameLongest: m.longest,
        frameFramesOver33: m.framesOver33, frameFrames: m.frames, frameWorst: m.worstFrame,
        renders: editor.renders, editorRenders: editor.editor, canvasRenders: editor.canvas, rendersWhileMoving: editor.moving, movingTop: editor.movingTop,
        sectionMessages: m.sections, patchMessages: m.patches,
        fetches: editor.fetches, saves: editor.saves,
        final, last, afterRelease: afterRelease.length, jumped, top: editor.top,
      }
      report[g.name] = out
      console.log(`  ${g.name.padEnd(22)} ${String(out.updatesPerSecond).padStart(5)}/s shown ${out.shown}/${out.values}  latency p50 ${out.latencyP50}ms p95 ${out.latencyP95}ms  editor longest ${out.editorLongest}ms (${out.editorLongTasks} long)  frame longest ${out.frameLongest}ms  renders ${out.renders} (editor ${out.editorRenders}, canvas ${out.canvasRenders})  section msgs ${out.sectionMessages}  fetches ${out.fetches}  final ${out.last === out.final ? "ok" : `${out.last} != ${out.final}`}${out.jumped.length ? `  JUMPED ${JSON.stringify(out.jumped.slice(0, 4))}` : ""}`)
      if (process.env.TOP) console.log(`      all: ${out.top.join("  ")}\n      while moving (${out.rendersWhileMoving}): ${out.movingTop.join("  ")}`)
    }

    /* A slider dragged with real input: across and back, a move every 8ms (a 120Hz pointer), the value each move gave read from the thumb. */
    const drag = async (label: RegExp, span = 0.6): Promise<{ t: number; v: string }[]> => {
      const s = await sliderAt(label)
      if (!s || "none" in s) { expect(false, `the sidebar has a slider labelled ${label}`, s && "none" in s ? s.none : null); return [] }
      await page.evaluate(() => {
        const w = window as unknown as { __vals: { t: number; v: string }[]; __obs: MutationObserver }
        w.__vals = []
        w.__obs = new MutationObserver((list) => { for (const r of list) w.__vals.push({ t: performance.timeOrigin + performance.now(), v: (r.target as Element).getAttribute("aria-valuenow") ?? "" }) })
        for (const t of document.querySelectorAll("[data-slot='slider-thumb']")) w.__obs.observe(t, { attributes: true, attributeFilter: ["aria-valuenow"] })
      })
      const a = s.left + 2, b = s.left + (s.right - s.left) * span
      await page.mouse.move(s.tx, s.ty)
      await page.mouse.down()
      const N = 100
      for (let k = 0; k <= N; k++) {
        const f = k / N
        /* From the thumb to the far point and back to the near end, as somebody trying values does. */
        const x = f < 0.5 ? s.tx + (b - s.tx) * (f * 2) : b + (a + (b - a) * 0.3 - b) * ((f - 0.5) * 2)
        await page.mouse.move(x, s.ty)
        await sleep(8)
      }
      await page.mouse.up()
      return page.evaluate(() => { const w = window as unknown as { __vals: { t: number; v: string }[]; __obs: MutationObserver }; w.__obs.disconnect(); return w.__vals })
    }

    const sectionPoint = (selector: string) => `function () { var el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({ block: "start" }); scrollBy(0, -40); var r = el.getBoundingClientRect(); return { x: Math.max(4, r.left + 6), y: r.top + Math.min(r.height / 2, 30) } }`
    const header = "#shopify-section-header, .section-header"
    const pressHeader = sectionPoint(".header-wrapper")

    /* ── The header's height ── */
    if (await pressInFrame(pressHeader)) {
      await gesture({ name: "header height", select: null, label: /^Header height/, read: `function () { return getComputedStyle(document.querySelector(".header")).minHeight }`, expected: (v) => `${v}px` }, () => drag(/^Header height/))
      await gesture({ name: "header top padding", select: null, label: /^Top$/, read: `function () { return getComputedStyle(document.querySelector(".header")).paddingTop }`, expected: (v) => `${v}px` }, () => drag(/^Top$/, 0.9))
    } else expect(false, "the header can be pressed in the frame")
    void header

    /* ── The announcement bar ── */
    if (await pressInFrame(sectionPoint(".utility-bar"))) {
      await gesture({ name: "announcement height", select: null, label: /^Bar height/, read: `function () { return getComputedStyle(document.querySelector(".utility-bar")).minHeight }`, expected: (v) => `${v}px` }, () => drag(/^Bar height/))
    } else expect(false, "the announcement bar can be pressed in the frame")

    /* ── A section of the page: the featured collection's top padding, and the banner's heading typed ── */
    const collection = `.collection[class*="-padding"]`
    if (await pressInFrame(sectionPoint(collection))) {
      await gesture({
        name: "section padding", select: null, label: /^Top$/,
        read: `function () { return getComputedStyle(document.querySelector('${collection}')).paddingTop }`,
        expected: (v) => `${v}px`,
      }, () => drag(/^Top$/, 0.9))
    } else expect(false, "the featured collection can be pressed in the frame")

    const heading = `function () { var h = document.querySelector('.banner__heading'); if (!h) return null; h.scrollIntoView({ block: "center" }); var r = h.getBoundingClientRect(); return { x: r.left + Math.min(20, r.width / 2), y: r.top + r.height / 2 } }`
    if (await pressInFrame(heading)) {
      const field = await page.evaluateHandle(() => {
        const h = [...document.querySelectorAll<HTMLElement>("input[type='text'], textarea, [contenteditable='true']")].find((i) => i.getClientRects().length && /Browse our latest/.test(i instanceof HTMLInputElement || i instanceof HTMLTextAreaElement ? i.value : i.textContent ?? ""))
        return h ?? null
      })
      const el = field.asElement() as import("puppeteer-core").ElementHandle<HTMLInputElement> | null
      if (el) {
        await el.click()
        await page.keyboard.press("End")
        await gesture({ name: "type heading", select: null, label: /x/, read: `function () { var h = document.querySelector('.banner__heading'); return h ? h.textContent.trim() : "" }`, expected: (v) => v }, async () => {
          await page.evaluate(() => { const w = window as unknown as { __vals: { t: number; v: string }[]; __kh: (e: Event) => void }; w.__vals = []; w.__kh = (e) => { const t = e.target as HTMLElement; w.__vals.push({ t: performance.timeOrigin + performance.now(), v: ("value" in t ? (t as HTMLInputElement).value : t.textContent ?? "").trim() }) }; document.addEventListener("input", w.__kh, true) })
          await page.keyboard.type(" and twenty more!!ab", { delay: 60 })
          return page.evaluate(() => { const w = window as unknown as { __vals: { t: number; v: string }[]; __kh: (e: Event) => void }; document.removeEventListener("input", w.__kh, true); return w.__vals })
        })
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
      } else expect(false, "the heading's field is in the sidebar")
    } else expect(false, "the banner's heading can be pressed in the frame")

    /* ── The announcement bar's colour, dragged in the picker ── */
    if (!ONLY || ONLY.test("announcement colour")) {
      await pressInFrame(sectionPoint(".utility-bar"))
      const chip = await page.evaluate(() => {
        for (const b of document.querySelectorAll<HTMLElement>("[data-wb-sidebar-scroll] button[aria-expanded], [data-wb-sidebar-scroll] button[aria-label='Pick color']")) {
          const row = b.closest("div")?.parentElement
          if (!/Bar colour/i.test(row?.textContent ?? "")) continue
          b.scrollIntoView({ block: "center" })
          const r = b.getBoundingClientRect()
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        }
        return null
      })
      if (chip) {
        await page.mouse.click(chip.x, chip.y)
        await sleep(500)
        const box = await page.evaluate(() => { const b = document.querySelector(".cursor-crosshair[data-sheet-no-drag]"); if (!b) return null; const r = b.getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height } })
        if (box) {
          await gesture({ name: "announcement colour", select: null, label: /x/, read: `function () { return getComputedStyle(document.querySelector(".utility-bar")).backgroundColor }`, expected: (v) => v, byChange: true }, async () => {
            /* Each move's colour is read from the frame afterwards; here, only when the finger moved. */
            await page.evaluate(() => { const w = window as unknown as { __vals: { t: number; v: string }[]; __mv: (e: PointerEvent) => void }; w.__vals = []; w.__mv = (e) => { if (e.buttons === 1) w.__vals.push({ t: performance.timeOrigin + performance.now(), v: "" }) }; document.addEventListener("pointermove", w.__mv, true) })
            await page.mouse.move(box.left + box.w * 0.2, box.top + box.h * 0.2)
            await page.mouse.down()
            for (let k = 0; k <= 60; k++) {
              const f = k / 60
              await page.mouse.move(box.left + box.w * (0.2 + 0.6 * f), box.top + box.h * (0.2 + 0.5 * Math.sin(f * Math.PI)))
              await sleep(8)
            }
            await page.mouse.up()
            return page.evaluate(() => { const w = window as unknown as { __vals: { t: number; v: string }[]; __mv: (e: PointerEvent) => void }; document.removeEventListener("pointermove", w.__mv, true); return w.__vals })
          })
          /* Colours are not read per move: the canvas's own changes, counted. */
          const r = report["announcement colour"] as { values: number } | undefined
          if (r) console.log("      (a colour's latency is not matched by value; read updates per second)")
        } else expect(false, "the colour picker opened")
        await page.keyboard.press("Escape")
      } else expect(false, "the announcement bar has its colour chip in the sidebar")
    }
    /* ── A theme setting: Theme › Layout › Space between template sections, a variable on the page's root ── */
    if (!ONLY || ONLY.test("theme spacing")) {
      await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("button, [role='tab']")].find((b) => (b.textContent ?? "").trim() === "Theme")?.click())
      await sleep(800)
      await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("button")].find((b) => (b.textContent ?? "").trim() === "Layout")?.click())
      await sleep(800)
      await gesture({
        name: "theme spacing", select: null, label: /^Space between template sections/,
        read: `function () { return getComputedStyle(document.documentElement).getPropertyValue("--spacing-sections-desktop").trim() }`,
        expected: (v) => `${v}px`,
      }, () => drag(/^Space between template sections/, 0.9))
    }
    /* ── Theme › Buttons › Corner radius: a variable printed as it is ── */
    if (!ONLY || ONLY.test("theme button radius")) {
      await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-compat-theme-group] [data-panel-back] button")][0]?.click())
      await sleep(600)
      await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("button, [role='tab']")].find((b) => (b.textContent ?? "").trim() === "Theme")?.click())
      await sleep(600)
      await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("button")].find((b) => (b.textContent ?? "").trim() === "Buttons")?.click())
      await sleep(800)
      await gesture({
        name: "theme button radius", select: null, label: /^Corner radius/,
        read: `function () { return getComputedStyle(document.documentElement).getPropertyValue("--buttons-radius").trim() }`,
        expected: (v) => `${v}px`,
      }, () => drag(/^Corner radius/, 0.9))
    }
    if (errors.length) console.log(`  page errors: ${errors.slice(0, 3).join(" | ")}`)
    report.errors = errors
    report.isolatedFrame = isolated
  } finally {
    await browser.close()
    server.close()
  }
  return report
}

/* TRACE=<gesture>: the main thread by event, and the largest style and layout passes with what forced each. */
function printTrace(ev: { name: string; ph: string; pid: number; tid: number; dur?: number; ts: number; args?: { name?: string; elementCount?: number; beginData?: { dirtyObjects?: number; stackTrace?: { functionName: string; lineNumber: number }[] } } }[]) {
  const on = (e: (typeof ev)[number]) => e.ph === "X" && !!e.dur
  const sum = new Map<string, number>(), count = new Map<string, number>()
  for (const e of ev) if (on(e)) { sum.set(e.name, (sum.get(e.name) ?? 0) + e.dur!); count.set(e.name, (count.get(e.name) ?? 0) + 1) }
  console.log([...sum].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `      ${(v / 1000).toFixed(0).padStart(6)}ms  x${count.get(k)}  ${k}`).join("\n"))
  const big = ev.filter((e) => on(e) && (e.name === "UpdateLayoutTree" || e.name === "Layout")).sort((a, b) => b.dur! - a.dur!).slice(0, 10)
  for (const e of big) {
    const st = (e.args?.beginData?.stackTrace ?? []).slice(0, 4).map((f) => `${f.functionName || "(anon)"}:${f.lineNumber}`).join(" < ")
    console.log(`      ${e.name === "Layout" ? "layout" : "style "} ${(e.dur! / 1000).toFixed(1)}ms/${e.args?.elementCount ?? e.args?.beginData?.dirtyObjects ?? "?"}  ${st || "(in a frame)"}`)
  }
}

function printProfile(profile: { nodes: { id: number; callFrame: { functionName: string; lineNumber: number; url: string }; children?: number[] }[]; samples: number[]; timeDeltas: number[] }) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]))
  const parent = new Map<number, number>()
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
  const dt = new Map<number, number>()
  profile.samples.forEach((id, k) => dt.set(id, (dt.get(id) ?? 0) + (profile.timeDeltas[k] ?? 0)))
  const self = new Map<string, number>(), total = new Map<string, number>()
  const name = (n: { callFrame: { functionName: string; lineNumber: number; url?: string } }) => `${n.callFrame.functionName || "(anon)"}:${n.callFrame.lineNumber}${n.callFrame.url ? ` ${n.callFrame.url.split("/").pop()!.slice(0, 24)}` : ""}`
  for (const [id, us] of dt) {
    const n = byId.get(id)!
    if (/^\((idle|program|garbage collector)\)/.test(n.callFrame.functionName)) continue
    self.set(name(n), (self.get(name(n)) ?? 0) + us)
    const seen = new Set<string>()
    for (let cur: number | undefined = id; cur !== undefined; cur = parent.get(cur)) {
      const nm = name(byId.get(cur)!)
      if (seen.has(nm)) continue
      seen.add(nm)
      total.set(nm, (total.get(nm) ?? 0) + us)
    }
  }
  const top = (m: Map<string, number>, n: number) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `      ${(v / 1000).toFixed(1).padStart(7)}ms  ${k}`).join("\n")
  console.log("    SELF\n" + top(self, 25) + "\n    TOTAL\n" + top(total, Number(process.env.PROFILE_N ?? 45)))
}

async function main() {
  const zipPath = process.argv[2]
  if (!zipPath) { console.log("usage: npx tsx scripts/check-compat-live-edit.ts <dawn.zip>"); process.exit(2) }
  const { bundle, css } = (await import("./editor-probe-harness.mjs")) as { bundle: string; css: string }
  const t = await theme(zipPath)
  const sources = Object.fromEntries(Object.entries(t.files).filter(([p]) => p.endsWith(".storelib")))
  const files = Object.fromEntries(Object.entries(t.files).filter(([p, x]) => p.startsWith("shopify/") && !x.startsWith("base64:") && !/^shopify\/locales\/(?!.*\.default(\.schema)?\.json$)/.test(p)))
  const pages = Object.fromEntries(t.pages.map((p) => [p.page_key, p.sections]))
  const compat = { settings: t.settings, pages, sources, files, all: t.files }
  const all: Record<string, unknown> = {}
  for (const cpu of process.env.CPU ? [Number(process.env.CPU)] : [1, 4]) all[cpu] = await run(cpu, { bundle, css }, compat)
  if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(all, null, 2))

  console.log("\nBUDGETS")
  type G = { updatesPerSecond: number; latencyP95: number | null; editorRenders: number; last: string; final: string; jumped: string[]; fetches: number }
  for (const [cpu, r] of Object.entries(all) as [string, Record<string, G>][]) {
    const slow = cpu !== "1"
    for (const name of ["header height", "header top padding", "announcement height", "section padding", "theme spacing", "theme button radius"]) {
      const d = r[name]
      if (!d) continue
      expect(d.updatesPerSecond >= (slow ? 20 : 45), `${cpu}x ${name}: the page follows the thumb every frame or near it (updates a second)`, d.updatesPerSecond)
      expect(d.latencyP95 !== null && d.latencyP95 <= (slow ? 80 : 40), `${cpu}x ${name}: a value is on the page soon after the finger (p95)`, d.latencyP95)
      expect(d.editorRenders >= 1 && d.editorRenders <= 3, `${cpu}x ${name}: the editor renders for the commit, not per move`, d.editorRenders)
      expect(d.last === d.final && d.jumped.length === 0, `${cpu}x ${name}: once released the page shows the last value, with no jump`, { last: d.last, final: d.final, jumped: d.jumped.slice(0, 4) })
      expect(d.fetches === 0, `${cpu}x ${name}: nothing fetched while dragging`, d.fetches)
    }
    const typed = r["type heading"]
    if (typed) expect(typed.latencyP95 !== null && typed.latencyP95 <= (slow ? 120 : 50), `${cpu}x typing: each key on the page soon after (p95)`, typed.latencyP95)
    const colour = r["announcement colour"]
    if (colour) expect(colour.updatesPerSecond >= (slow ? 15 : 30), `${cpu}x announcement colour: the page follows the picker`, colour.updatesPerSecond)
  }
  console.log(`\n${broken ? `${broken} over budget` : "all within budget"}`)
  process.exit(broken ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
