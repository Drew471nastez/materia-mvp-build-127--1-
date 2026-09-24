/**
 * ===========================================================================
 *  WHAT THE AI BUTTON'S RING COSTS WHILE NOTHING IS HAPPENING
 * ===========================================================================
 * The ring runs for as long as the editor is open, so its cost is paid every
 * second of every session. It was a conic gradient starting at a registered
 * custom property, animated 0 to 360 degrees: the compositor cannot animate
 * a custom property, so every frame was a style recalculation and a repaint
 * on the main thread.
 *
 * This measures that, rather than reasoning about it. The button is drawn
 * twice on the editor's dark bar with the real stylesheet: once as it
 * shipped before (the old rules, kept below as the control) and once as it
 * ships now. For each, the CPU is slowed four times, the page sits idle for
 * three seconds under a trace, and the main thread's style, layout and paint
 * time is added up per second. The control must come out expensive, or this
 * is measuring nothing.
 *
 * It also checks the look did not change: both are screenshotted at the same
 * moment of their turn (the animation is paused and seeked) and compared
 * pixel for pixel over the ring.
 *
 *   node scripts/check-ai-ring-cost.mjs
 */
import { createServer } from "node:http"
import puppeteer from "puppeteer-core"
import { probeCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const css = await probeCss()

/** The rules as they were before this change: the control. */
const BEFORE_CSS = `
.wb-ai-button::before {
  content: ""; position: absolute; inset: -1px; border-radius: inherit; padding: 1px;
  background: conic-gradient(from var(--wb-ai-angle, 0deg), rgba(255,255,255,0) 0deg, rgba(167,139,250,0.55) 60deg, rgba(255,255,255,0) 120deg, rgba(255,255,255,0) 360deg);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  opacity: 0.7; pointer-events: none; z-index: -1;
  animation: wb-ai-shimmer 4s linear infinite;
}
`

const BUTTON = "wb-ai-button h-8 w-8 flex items-center justify-center rounded-lg"
const page = (variant) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
${variant === "before" ? `<style>${BEFORE_CSS}</style>` : ""}
<style>body{margin:0;background:#171717}</style></head><body>
<div class="wb-editor" style="position:fixed;inset:0">
  <header style="height:48px;display:flex;align-items:center;justify-content:flex-end;padding:0 16px;gap:8px;background:var(--wb-chrome-bg)">
    <button id="ai" class="${BUTTON}">
      ${variant === "after" ? '<span aria-hidden class="wb-ai-ring"><span class="wb-ai-ring-spin"></span></span>' : ""}
      <span style="width:18px;height:18px;border-radius:5px;background:#fff;opacity:.8"></span>
    </button>
  </header>
</div></body></html>`

/**
 * And the whole editor, idle, the same two ways: the real page with its real
 * bar, and the old rules put back (with the new ring hidden) as the control.
 * This is the number a creator's laptop pays while they read the page.
 */
const { bundle } = await import("./editor-probe-harness.mjs")
const { readFileSync } = await import("node:fs")
const editorJs = readFileSync(bundle)
const editorPage = (variant) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
${variant === "before" ? `<style>${BEFORE_CSS} .wb-ai-ring { display: none }</style>` : ""}
</head><body><div id="app"></div><script>window.PROBE_SHORT=false</script><script src="/editor-probe.js"></script></body></html>`

const server = createServer((req, res) => {
  if (req.url.startsWith("/editor-probe.js")) {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(editorJs)
  }
  res.writeHead(200, { "content-type": "text/html" })
  const variant = req.url.includes("before") ? "before" : "after"
  res.end(req.url.startsWith("/editor") ? editorPage(variant) : page(variant))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const WATCHED = ["UpdateLayoutTree", "RecalculateStyles", "Layout", "PrePaint", "Paint", "PaintImage", "Layerize", "UpdateLayer", "CompositeLayers", "Commit"]

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
async function measure(variant, whole = false) {
  const p = await browser.newPage()
  await p.setViewport(whole ? { width: 1440, height: 900 } : { width: 480, height: 120 })
  await p.goto(`${origin}/${whole ? "editor-" : ""}${variant}`, { waitUntil: "load" })
  if (whole) {
    await p.waitForFunction(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length >= 8, { timeout: 60_000 })
    /* The entrance and the fonts settle, and the pointer is nowhere. */
    await sleep(3000)
  }
  await sleep(800)
  const cdp = await p.createCDPSession()
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  await sleep(500)
  const seconds = 3
  await p.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline"] })
  await sleep(seconds * 1000)
  const buf = await p.tracing.stop()
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  const trace = JSON.parse(Buffer.from(buf).toString("utf8"))
  const events = trace.traceEvents ?? trace
  const threads = new Map()
  for (const e of events) if (e.ph === "M" && e.name === "thread_name") threads.set(`${e.pid}:${e.tid}`, e.args?.name)
  const main = new Set([...threads].filter(([, n]) => n === "CrRendererMain").map(([k]) => k))
  const by = {}
  let total = 0
  for (const e of events) {
    if (e.ph !== "X" || !main.has(`${e.pid}:${e.tid}`) || !WATCHED.includes(e.name)) continue
    by[e.name] = (by[e.name] ?? 0) + (e.dur ?? 0) / 1000
    total += (e.dur ?? 0) / 1000
  }
  /* Still turning? The ring's angle at two moments. */
  const turning = await p.evaluate(async () => {
    const el = document.querySelector(".wb-ai-ring-spin:not([style*=none])") && getComputedStyle(document.querySelector(".wb-ai-ring")).display !== "none"
      ? document.querySelector(".wb-ai-ring-spin")
      : document.querySelector(".wb-ai-button")
    const read = () => getComputedStyle(el).transform + "|" + getComputedStyle(el, "::before").getPropertyValue("--wb-ai-angle")
    const a = read()
    await new Promise((r) => setTimeout(r, 300))
    return a !== read()
  })
  await p.close()
  return {
    perSecond: Math.round((total / seconds) * 10) / 10,
    by: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, Math.round((v / seconds) * 10) / 10])),
    turning,
  }
}

/** Both rings frozen at the same angle, screenshotted, and compared over the button. */
async function frame(variant, deg) {
  const p = await browser.newPage()
  await p.setViewport({ width: 480, height: 120, deviceScaleFactor: 2 })
  await p.goto(`${origin}/${variant}`, { waitUntil: "load" })
  await p.evaluate((d) => {
    const s = document.createElement("style")
    s.textContent =
      `.wb-ai-button::before{animation:none !important;--wb-ai-angle:${d}deg !important}` +
      `.wb-ai-ring-spin{animation:none !important;transform:rotate(${d}deg) !important}`
    document.head.append(s)
  }, deg)
  await sleep(200)
  const box = await p.evaluate(() => {
    const r = document.getElementById("ai").getBoundingClientRect()
    return { x: r.left - 4, y: r.top - 4, width: r.width + 8, height: r.height + 8 }
  })
  const png = await p.screenshot({ clip: box, encoding: "base64" })
  const pixels = await p.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement("canvas")
    c.width = img.width
    c.height = img.height
    const g = c.getContext("2d")
    g.drawImage(img, 0, 0)
    return Array.from(g.getImageData(0, 0, c.width, c.height).data)
  }, png)
  await p.close()
  return pixels
}

try {
  console.log("\nthe AI button's ring, idle, CPU slowed 4x (main thread ms per second)")
  const before = await measure("before")
  const after = await measure("after")
  console.log(`  before  ${before.perSecond} ms/s  ${JSON.stringify(before.by)}`)
  console.log(`  after   ${after.perSecond} ms/s  ${JSON.stringify(after.by)}`)
  expect(before.turning && after.turning, "both rings are turning while measured", { before: before.turning, after: after.turning })
  expect(before.perSecond > 10, "the control costs what was reported (it must, or this measures nothing)", before.perSecond)
  expect(after.perSecond < 2, "the ring now costs the main thread next to nothing", after.perSecond)

  console.log("\nthe whole editor, idle, CPU slowed 4x (main thread ms per second)")
  const editorBefore = await measure("before", true)
  const editorAfter = await measure("after", true)
  console.log(`  before  ${editorBefore.perSecond} ms/s  ${JSON.stringify(editorBefore.by)}`)
  console.log(`  after   ${editorAfter.perSecond} ms/s  ${JSON.stringify(editorAfter.by)}`)
  expect(editorBefore.turning && editorAfter.turning, "the ring is turning in both", { before: editorBefore.turning, after: editorAfter.turning })
  expect(editorAfter.perSecond < editorBefore.perSecond / 4, "an idle editor spends a quarter of what it did, or less", { before: editorBefore.perSecond, after: editorAfter.perSecond })

  console.log("\nthe look")
  for (const deg of [0, 97, 211]) {
    const a = await frame("before", deg)
    const b = await frame("after", deg)
    let worst = 0
    let differing = 0
    for (let i = 0; i < Math.min(a.length, b.length); i += 4) {
      const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]))
      if (d > worst) worst = d
      if (d > 8) differing++
    }
    expect(a.length === b.length && differing <= 6, `at ${deg} degrees the two rings draw the same pixels`, { worst, differing })
  }
} finally {
  await browser.close()
  server.close()
}

console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
process.exit(broken ? 1 : 0)
