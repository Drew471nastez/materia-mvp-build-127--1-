/**
 * ===========================================================================
 *  OPENING THE EDITOR ON A MATERIA WEBSITE JUST ADDED (round 68)
 * ===========================================================================
 * The owner: "I click edit website, and it takes me to the website builder
 * editor. It truly takes so much to load, and sometimes it tells me that
 * Storelib takes too much to respond."
 *
 * The real editor (scripts/render-editor-probe.tsx through
 * scripts/editor-probe-harness.mjs) opened on the real Materia clothing
 * template, converted by the marketplace's own convertTemplateFiles. The
 * theme's files and section sources are answered by this server as JSON text
 * over the network (PROBE_COMPAT_FETCH), so the editor parses exactly what it
 * would in production, each after a wait that stands for the server's read
 * (FILES_MS, SOURCES_MS, or by size at MBPS). The CPU is slowed CPU times
 * (default 4, a mid phone).
 *
 * Measured from the navigation:
 *   shell        the editor's bar is drawn (its Publish button)
 *   frame        the canvas's card is on screen ([data-compat-canvas])
 *   paint        the canvas's frame holds the theme's sections
 *   shown        the editor's loader is off the canvas: the page is seen
 *   longest      the longest main thread task, and every task over 200 ms
 *   asked        the theme's file reads the editor made, and their sizes
 *
 *   node scripts/check-editor-open-r68.mjs            (CPU=4 MBPS=3 by default)
 *   CPU=1 MBPS=25 OUT=<dir> node scripts/check-editor-open-r68.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { mkdirSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CPU = Number(process.env.CPU ?? 4)
const MBPS = Number(process.env.MBPS ?? 3)
const TEMPLATE = process.env.TEMPLATE ?? "materia/clothing"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* The template as the marketplace converts it (scripts/r68-template-compat.ts), bundled for Node once. */
const dumper = join(root, "scripts/.r68-template-compat.mjs")
execFileSync(process.execPath, [join(root, "node_modules/esbuild/bin/esbuild"), join(root, "scripts/r68-template-compat.ts"), "--bundle", "--platform=node", "--format=esm", `--outfile=${dumper}`, `--alias:@=${root}`, "--log-level=error", "--packages=external"], { stdio: "inherit" })
let theme
try { theme = await (await import(dumper)).load(TEMPLATE) } finally { rmSync(dumper, { force: true }) }
const { bundle, css } = await import("./editor-probe-harness.mjs")
const { filesAnswer } = theme

/* What each read answers, as text, and how long the server takes with it: a round trip, then its database bytes at MBPS. */
const answers = new Map()
const answerFor = (query) => {
  if (!answers.has(query)) answers.set(query, JSON.stringify(filesAnswer(query)))
  return answers.get(query)
}
const asked = []
const t0 = { at: 0 }
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1")
  if (url.pathname === "/") {
    const slim = { settings: theme.settings, pages: theme.pages, sources: {}, files: {} }
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="app"></div><script>window.PROBE_SHORT=false;window.PROBE_COMPAT=${JSON.stringify(slim).replace(/</g, "\\u003c")};window.PROBE_COMPAT_FETCH="/r68-files";window.PROBE_API_DELAY_MS=${Number(process.env.API_MS ?? 150)}</script><script src="/editor-probe.js"></script></body></html>`)
    return
  }
  if (url.pathname === "/editor-probe.js") {
    res.writeHead(200, { "Content-Type": "text/javascript" })
    res.end(readFileSync(bundle))
    return
  }
  if (url.pathname === "/r68-files") {
    const body = answerFor(url.search)
    const start = Date.now() - t0.at
    const wait = 120 + (body.length / (MBPS * 1e6)) * 1000
    await sleep(wait)
    asked.push({ query: url.search.slice(0, 80), kb: Math.round(body.length / 1024), at: start, ms: Math.round(wait) })
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(body)
    return
  }
  const asset = url.pathname.match(/^\/api\/site-theme\/assets\/[^/]+\/[^/]+\/(.+)$/)
  if (asset) {
    const text = theme.assets[`shopify/assets/${decodeURIComponent(asset[1])}`]
    if (text === undefined) { res.writeHead(404, { "Access-Control-Allow-Origin": "*" }); res.end(); return }
    const name = asset[1]
    res.writeHead(200, { "Content-Type": name.endsWith(".css") ? "text/css" : name.endsWith(".js") ? "text/javascript" : "text/plain", "Access-Control-Allow-Origin": "*" })
    res.end(text)
    return
  }
  res.writeHead(404)
  res.end()
})
await new Promise((ok) => server.listen(0, "127.0.0.1", ok))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
let broken = 0
try {
  const page = await browser.newPage()
  const width = Number(process.env.WIDTH ?? 1280)
  await page.setViewport({ width, height: width < 700 ? 800 : 860, deviceScaleFactor: 1 })
  const cdp = await page.createCDPSession()
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU })
  /* As after an Add from the templates in this browser (lib/website-builder/compat-hint.ts); HINT=0 for another device. */
  if (process.env.HINT !== "0") await page.evaluateOnNewDocument(() => { try { localStorage.setItem("wb-compat:probe-install", "1") } catch { /* none */ } })
  await page.evaluateOnNewDocument(() => {
    const w = window
    w.__r68 = { tasks: [], marks: {} }
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__r68.tasks.push({ at: Math.round(e.startTime), ms: Math.round(e.duration) }) }).observe({ type: "longtask", buffered: true })
    } catch { /* no long tasks here */ }
    const mark = (k) => { if (w.__r68.marks[k] === undefined) w.__r68.marks[k] = Math.round(performance.now()) }
    const look = () => {
      if ([...document.querySelectorAll("button")].some((b) => /^Publish/.test((b.textContent ?? "").trim()) && b.getBoundingClientRect().width > 0)) mark("shell")
      if (document.querySelector("[data-compat-canvas]")) mark("frame")
      if (w.__r68.marks.frame === undefined || w.__r68.marks.shell === undefined) requestAnimationFrame(look)
    }
    requestAnimationFrame(look)
    /* "Still opening" looked for twice a second, not every frame: the probe's own looking is not the editor's time. */
    const slow = setInterval(() => { if (/Still opening your website/.test(document.body?.innerText ?? "")) mark("stillOpening"); if (w.__r68.done) clearInterval(slow) }, 500)
  })
  page.on("pageerror", (e) => console.log("    page error:", String(e.message ?? e).slice(0, 200)))
  t0.at = Date.now()
  await page.goto(base, { waitUntil: "domcontentloaded" })
  /* SHOTS_AT=3000,6000,...: the editor as it opens, at these times from the navigation (OUT is where they go). */
  const timedShots = process.env.OUT && process.env.SHOTS_AT
    ? (async () => {
      for (const at of process.env.SHOTS_AT.split(",").map(Number)) {
        await sleep(Math.max(0, at - (Date.now() - t0.at)))
        mkdirSync(process.env.OUT, { recursive: true })
        await page.screenshot({ path: join(process.env.OUT, `opening-${width}-${String(at).padStart(5, "0")}ms.png`) }).catch(() => {})
      }
    })()
    : Promise.resolve()
  /* PROFILE=1: where the main thread's time goes, by function, in the longest task. */
  if (process.env.PROFILE) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 1000 }); await cdp.send("Profiler.start") }
  /* The canvas's frame is sandboxed (another origin to the page), so its sections are looked for from here. */
  let paintAt
  for (let i = 0; i < 600 && paintAt === undefined; i++) {
    await sleep(100)
    for (const f of page.frames()) {
      if (f === page.mainFrame()) continue
      const has = await f.evaluate(() => !!document.querySelector(".shopify-section")).catch(() => false)
      if (has) { paintAt = await page.evaluate(() => Math.round(performance.now())).catch(() => undefined); break }
    }
  }
  /* And SHOWN: the editor's loader is off the canvas, so the person sees the page (it fades in over its own frame). */
  let shownAt
  for (let i = 0; i < 600 && shownAt === undefined && paintAt !== undefined; i++) {
    const gone = await page.evaluate(() => !document.querySelector(".wb-loading-line") && !!document.querySelector("[data-compat-frame='front']")).catch(() => false)
    if (gone) shownAt = await page.evaluate(() => Math.round(performance.now())).catch(() => undefined)
    else await sleep(100)
  }
  await page.evaluate(([at, seen]) => { window.__r68.marks.paint = at; window.__r68.marks.shown = seen; window.__r68.done = true }, [paintAt ?? null, shownAt ?? null]).catch(() => {})
  await timedShots
  /* What runs once the page is up (the library, the rest of the theme) belongs to the open too. */
  await sleep(Number(process.env.SETTLE_MS ?? 8000))
  const r = await page.evaluate(() => ({ ...window.__r68, calls: window.probeCalls.filter((c) => /files|sections|themes\/probe-install(\?|$)/.test(c)) }))
  const tasks = r.tasks
  const longest = tasks.reduce((m, t) => Math.max(m, t.ms), 0)
  const over = tasks.filter((t) => t.ms > 200)
  const blocking = tasks.reduce((s, t) => s + Math.max(0, t.ms - 50), 0)
  console.log(`\nMateria ${TEMPLATE} at ${width}px, CPU slowed ${CPU}x, the server's reads at ${MBPS} MB/s`)
  console.log(`  shell ${r.marks.shell ?? "never"} ms | canvas card ${r.marks.frame ?? "never"} ms | first canvas paint ${r.marks.paint ?? "never"} ms | the page shown ${r.marks.shown ?? "never"} ms | "Still opening" ${r.marks.stillOpening ?? "never shown"}`)
  console.log(`  longest task ${longest} ms, ${over.length} over 200 ms (${over.map((t) => `${t.ms}@${t.at}`).join(", ")}), blocking ${blocking} ms in all`)
  console.log(`  theme reads: ${asked.map((a) => `${a.query} ${a.kb} KB at ${a.at} ms (${a.ms} ms)`).join(" | ")}`)
  const expect = (ok, what) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}`); if (!ok) broken++ }
  if (process.env.EXPECT) {
    const e = JSON.parse(process.env.EXPECT)
    if (e.paint) expect((r.marks.shown ?? Infinity) <= e.paint, `the page is shown within ${e.paint} ms`)
    if (e.longest) expect(longest <= e.longest, `no main thread task over ${e.longest} ms`)
    if (e.read) expect(asked.reduce((s, a) => s + a.kb, 0) <= e.read, `the open reads at most ${e.read} KB of theme files`)
  }
  if (process.env.PROFILE) {
    const { profile } = await cdp.send("Profiler.stop")
    const top = tasks.slice().sort((a, b) => b.ms - a.ms)[0]
    const byId = new Map(profile.nodes.map((n) => [n.id, n]))
    const self = new Map()
    let t = profile.startTime
    const navStart = await page.evaluate(() => performance.timeOrigin * 1000).catch(() => 0)
    for (let i = 0; i < profile.samples.length; i++) {
      t += profile.timeDeltas[i]
      const ms = (t - (profile.startTime - (profile.startTime - navStart))) / 1000
      void ms
      const n = byId.get(profile.samples[i])
      const cf = n.callFrame
      const key = `${cf.functionName || "(anon)"} ${cf.url.split("/").pop()}:${cf.lineNumber}`
      self.set(key, (self.get(key) ?? 0) + profile.timeDeltas[i] / 1000)
    }
    console.log(`  the longest task: ${top?.ms} ms at ${top?.at} ms; where the whole open's time went (self time):`)
    for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`    ${Math.round(v)} ms  ${k}`)
    /* And by caller chain: the top inclusive frames under the editor's own code. */
    const parent = new Map()
    for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
    const incl = new Map()
    for (let i = 0; i < profile.samples.length; i++) {
      const seen = new Set()
      let id = profile.samples[i]
      while (id !== undefined) {
        const cf = byId.get(id).callFrame
        const key = `${cf.functionName || "(anon)"} :${cf.lineNumber}`
        if (!seen.has(key)) { seen.add(key); incl.set(key, (incl.get(key) ?? 0) + profile.timeDeltas[i] / 1000) }
        id = parent.get(id)
      }
    }
    console.log("  inclusive:")
    for (const [k, v] of [...incl].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`    ${Math.round(v)} ms  ${k}`)
    /* The longest stretch with no idle sample in it: the longest task, as the profile saw it. */
    let best = [0, 0, 0]
    let start = 0
    let run = 0
    for (let i = 0; i < profile.samples.length; i++) {
      const idle = byId.get(profile.samples[i]).callFrame.functionName === "(idle)"
      if (idle) { run = 0; start = i + 1; continue }
      run += profile.timeDeltas[i]
      if (run > best[0]) best = [run, start, i]
    }
    const inTask = new Map()
    for (let i = best[1]; i <= best[2]; i++) {
      const seen = new Set()
      let id = profile.samples[i]
      while (id !== undefined) {
        const cf = byId.get(id).callFrame
        const key = `${cf.functionName || "(anon)"} :${cf.lineNumber}`
        if (!seen.has(key)) { seen.add(key); inTask.set(key, (inTask.get(key) ?? 0) + profile.timeDeltas[i] / 1000) }
        id = parent.get(id)
      }
    }
    console.log(`  inside the longest stretch (${Math.round(best[0] / 1000)} ms):`)
    for (const [k, v] of [...inTask].sort((a, b) => b[1] - a[1]).slice(0, 60)) console.log(`    ${Math.round(v)} ms  ${k}`)
  }
  if (process.env.OUT) {
    mkdirSync(process.env.OUT, { recursive: true })
    await page.screenshot({ path: join(process.env.OUT, `editor-open-${width}.png`) })
  }
} finally {
  await browser.close()
  server.close()
}
process.exit(broken ? 1 : 0)
