/**
 * ===========================================================================
 *  DRAGGING A SLIDER, WITH THE CPU AT A QUARTER SPEED
 * ===========================================================================
 * "It should feel smoother when I'm dragging the slider left and right for
 * the padding and all these things."
 *
 * The slider in the editor's sidebar, dragged across its track by a mouse
 * that reports at 120Hz while the page beside it costs 40ms to redraw (a
 * page of sections on a phone), with Chrome's CPU throttled four times, the
 * rate its own mobile profile uses. The same drag is made twice in one run:
 *
 *   new   components/website-builder/editor/slider-number-control.tsx
 *   old   the Radix slider it replaced, taken from git (28f9a055), so the
 *         comparison is on the same page, the same machine, the same minute
 *
 * and for each it reports what the drag asked of the main thread:
 *
 *   commits     React renders inside the slider during the drag. The new one
 *               draws the thumb, the fill and the number without React.
 *   writes      settings sent up to the editor (what the canvas redraws for)
 *   long tasks  tasks over 50ms while the finger was down
 *   frames      rAF gaps over the drag, median, p95 and the worst
 *
 * Asserted: the new slider commits at most twice for a whole drag (the
 * press and the release) where the old one commits once per move; the value
 * lands where the pointer let go, on a step; writes stay within one a frame;
 * keyboard steps move it by the step and Home/End reach the ends.
 *
 *   node scripts/check-slider-drag.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const OLD_COMMIT = "28f9a055"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* The old slider, from git, next to the harness that imports it. */
const oldDir = join(root, "scripts/.slider-old")
mkdirSync(oldDir, { recursive: true })
const oldSource = execFileSync("git", ["show", `${OLD_COMMIT}:components/website-builder/editor/slider-number-control.tsx`], { cwd: root, encoding: "utf8" })
  .replace('from "./use-frame-commit"', 'from "@/components/website-builder/editor/use-frame-commit"')
writeFileSync(join(oldDir, "slider-number-control.tsx"), oldSource)
/* The old slider's own rules: every block that names .wb-black-slider. */
const oldCss = execFileSync("git", ["show", `${OLD_COMMIT}:app/globals.css`], { cwd: root, encoding: "utf8" })
const oldRules = (oldCss.match(/\.wb-black-slider[^{]*\{[^}]*\}/g) ?? []).join("\n")

const out = mkdtempSync(join(tmpdir(), "storelib-slider-"))
execFileSync("npx", [
  "--no-install", "esbuild", join(root, "scripts/render-slider-drag.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`,
  `--alias:@=${root}`,
  "--alias:react-dom/client=react-dom/profiling",
  '--define:process.env.NODE_ENV="production"',
  "--loader:.css=empty",
], { cwd: root, stdio: "inherit" })
rmSync(oldDir, { recursive: true, force: true })

const css = await appCss(root)
const js = readFileSync(join(out, "probe.js"))
const page = (variant) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css}</style><style>${oldRules}</style><style>body{margin:0}</style></head>
<body><div id="app"></div><script>window.__variant=${JSON.stringify(variant)}</script><script src="/probe.js"></script></body></html>`

const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(js)
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(page(req.url.includes("old") ? "old" : "new"))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"] })

async function drag(variant) {
  const p = await browser.newPage()
  await p.setViewport({ width: 1280, height: 800 })
  await p.goto(`${origin}/${variant}`, { waitUntil: "load" })
  await p.waitForSelector("[data-slot='slider-thumb']")
  await sleep(600)
  const cdp = await p.createCDPSession()
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  await sleep(400)
  const box = await p.evaluate(() => {
    const track = document.querySelector("[data-slot='slider']")
    const r = track.getBoundingClientRect()
    return { left: r.left, right: r.right, y: r.top + r.height / 2 }
  })
  await p.evaluate(() => {
    window.__writes = 0
    window.__canvasRenders = 0
    window.__sliderCommits = 0
    window.__long = []
    window.__frames = []
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)) }).observe({ type: "longtask", buffered: false })
    let last = performance.now()
    window.__watch = true
    const tick = (t) => { if (!window.__watch) return; window.__frames.push(t - last); last = t; requestAnimationFrame(tick) }
    requestAnimationFrame((t) => { last = t; requestAnimationFrame(tick) })
  })
  const MOVES = 96
  const x0 = box.left + 12
  /* Past the far end: a captured pointer keeps the drag, and the value stops at the maximum. */
  const x1 = box.right + 30
  await p.mouse.move(x0, box.y)
  await p.mouse.down()
  const started = Date.now()
  for (let i = 1; i <= MOVES; i++) {
    await p.mouse.move(x0 + ((x1 - x0) * i) / MOVES, box.y)
    /* 120Hz: two reports a frame. */
    if (i % 2 === 0) await sleep(16)
  }
  await p.mouse.up()
  const ms = Date.now() - started
  await sleep(900)
  const r = await p.evaluate(() => {
    window.__watch = false
    const f = window.__frames.slice(2)
    const s = [...f].sort((a, b) => a - b)
    const at = (q) => (s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * q))] * 10) / 10 : 0)
    return {
      commits: window.__sliderCommits,
      writes: window.__writes,
      canvas: window.__canvasRenders,
      long: window.__long,
      frames: f.length,
      median: at(0.5),
      p95: at(0.95),
      worst: s.length ? Math.round(s[s.length - 1]) : 0,
      value: Number(document.querySelector("[data-slot='slider-thumb']").getAttribute("aria-valuenow")),
    }
  })
  /* Keyboard, on the new one only: it is the one with a role="slider" of its own. */
  let keys = null
  if (variant === "new") {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    keys = await p.evaluate(async () => {
      const thumb = document.querySelector("[data-slot='slider-thumb']")
      thumb.focus()
      const press = (key, shiftKey = false) => thumb.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true }))
      const now = () => Number(thumb.getAttribute("aria-valuenow"))
      press("Home")
      await new Promise((r) => setTimeout(r, 50))
      const home = now()
      press("ArrowRight")
      await new Promise((r) => setTimeout(r, 50))
      const one = now()
      press("ArrowRight", true)
      await new Promise((r) => setTimeout(r, 50))
      const eleven = now()
      press("End")
      await new Promise((r) => setTimeout(r, 50))
      return { home, one, eleven, end: now(), role: thumb.getAttribute("role"), label: thumb.getAttribute("aria-label") }
    })
  }
  await p.close()
  return { ...r, ms, moves: MOVES, keys }
}

const now = await drag("new")
const before = await drag("old")
await browser.close()
server.close()

let bad = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) bad++
}
const show = (label, r) => {
  console.log(`\n${label}`)
  console.log(`  ${r.moves} pointer moves over ${r.ms}ms, ended at ${r.value}`)
  console.log(`  ${r.commits} React commits in the slider, ${r.writes} settings writes, ${r.canvas} canvas redraws`)
  console.log(`  ${r.long.length} long tasks${r.long.length ? ` (${r.long.join(", ")}ms)` : ""}`)
  console.log(`  ${r.frames} frames, median ${r.median}ms, p95 ${r.p95}ms, worst ${r.worst}ms`)
}
show("The slider as it ships", now)
show(`The Radix slider it replaced (${OLD_COMMIT})`, before)
console.log("")

expect(now.value === 200, "the drag ends where the pointer let go", now.value)
expect(now.commits <= 3, "the slider renders at most at the press and the release, not per move", `${now.commits} against ${before.commits} before`)
expect(before.commits > now.commits * 5, "the old one rendered on every move, which is what this removed", `${before.commits}`)
expect(now.writes <= now.frames + 2, "the editor hears at most once a frame", `${now.writes} writes over ${now.frames} frames`)
expect(now.writes > 0, "and it does hear", now.writes)
const sumLong = (r) => r.long.reduce((a, b) => a + b, 0)
console.log(`  --    long tasks ${now.long.length} (${sumLong(now)}ms) against ${before.long.length} (${sumLong(before)}ms) before; the canvas costs 40ms a redraw at 4x, so some are its own`)
if (now.keys) {
  expect(now.keys.role === "slider" && !!now.keys.label, "the thumb is a named slider", now.keys)
  expect(now.keys.home === 0 && now.keys.one === 1 && now.keys.eleven === 11 && now.keys.end === 200, "Home, an arrow, a Shift arrow and End", now.keys)
}
console.log("")
if (bad) {
  console.error(`${bad} check${bad === 1 ? "" : "s"} failed.`)
  process.exit(1)
}
console.log("The slider moves without React, and the canvas follows at its own pace.\n")
