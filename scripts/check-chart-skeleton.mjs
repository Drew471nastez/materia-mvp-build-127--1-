#!/usr/bin/env node
/**
 * ===========================================================================
 *  THE ANALYTICS CHART IS A CHART BEFORE ITS NUMBERS ARRIVE
 * ===========================================================================
 * Reported with a picture: the analytics card is a tall white box. Nothing in
 * it, no grid, no dates, no line, for as long as the fetch takes.
 *
 * The cause is one line. `trendData` starts as `[]`, and Recharts given an
 * empty series draws NOTHING — not an axis, not a grid line, not a baseline.
 * The fetch seeds a bucket per date, so the moment it returns the whole plot
 * appears at once: frame, ticks and line together.
 *
 * So the same date list the fetch seeds from is built up front and drawn as a
 * placeholder, and that is what this measures. Three questions a screenshot
 * cannot answer:
 *
 *   is there anything there   svg elements, grid lines and axis ticks, with
 *                             an empty series beside it for comparison
 *   does it read as waiting   the placeholder line is grey, has no fill and
 *                             no dots, and nothing in it can be pressed
 *   does the line grow        when the numbers land the x categories are the
 *                             same, the curve keeps its identity rather than
 *                             being replaced, and its stroke fades to colour
 *
 *   node scripts/check-chart-skeleton.mjs
 */
import { execFileSync } from "node:child_process"
import puppeteer from "puppeteer-core"
import { writeFileSync, rmSync, existsSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"

const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)

/* The grey the placeholder line is drawn in, from components/app/morph-lines.tsx. */
const SKELETON_STROKE = "rgb(229, 231, 235)"

const work = join(root, ".chart-skeleton-probe")
mkdirSync(work, { recursive: true })

writeFileSync(join(work, "native-bridge.js"), `export const hapticTap = () => {}
export const triggerHaptic = () => {}
`)

try {
  execFileSync("npx", [
    "esbuild", join(root, "scripts/render-chart-skeleton.tsx"),
    "--bundle", "--platform=browser", "--format=iife",
    `--outfile=${join(work, "probe.js")}`,
    `--alias:@/lib/native-bridge=${join(work, "native-bridge.js")}`,
    `--alias:@=${root}`,
    "--jsx=automatic", "--log-level=error",
    '--define:process.env.NODE_ENV="production"',
  ], { cwd: root, stdio: "inherit" })

  const page = join(work, "chart.html")
  writeFileSync(page, `<!doctype html><meta charset="utf-8">
<style>
  body { margin: 0; background: #fff; }
  /* The two rules the product ships for this, copied from app/globals.css.
     tests/analytics-chart-skeleton.test.ts asserts they are still there. */
  @keyframes chart-skeleton-breath { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
  [data-chart-loading] .trend-line { transition: stroke 420ms cubic-bezier(0.32, 0.72, 0, 1); }
  [data-chart-loading="true"] .trend-line,
  [data-chart-loading="true"] .recharts-cartesian-grid line,
  [data-chart-loading="true"] .recharts-cartesian-axis-tick text {
    animation: chart-skeleton-breath 1.7s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
</style>
<div id="root"></div>
<pre id="out">pending</pre>
<script src="./probe.js"></script>
<script>
const tick = () => new Promise((r) => setTimeout(r, 16))

/* The line is components/app/morph-lines now: a path that is drawn when it has a "d". */
const drawn = (el) => !!(el && (el.getAttribute("d") || "").length > 0)
const look = (id) => {
  const scope = document.getElementById(id)
  const curve = [...scope.querySelectorAll("[data-trend-line]")].find(drawn) || null
  const style = curve ? getComputedStyle(curve) : null
  const area = [...scope.querySelectorAll(".trend-area")].find(drawn)
  return {
    svgNodes: scope.querySelectorAll("svg *").length,
    gridLines: scope.querySelectorAll(".recharts-cartesian-grid line").length,
    axisTicks: scope.querySelectorAll(".recharts-cartesian-axis-tick text").length,
    curves: [...scope.querySelectorAll("[data-trend-line]")].filter(drawn).length,
    /* The only point drawn on a resting line is the dot at its end. */
    dots: [...scope.querySelectorAll("[data-chart-end-dot]")].filter((d) => d.getAttribute("visibility") !== "hidden").length,
    /* The fill under the line: "none" while it is a placeholder. */
    areaFill: area ? area.getAttribute("fill") : "none",
    stroke: style ? style.stroke : null,
    strokeTransition: style ? style.transitionProperty + " " + style.transitionDuration : null,
    breathes: style ? style.animationName : null,
    /* Whether a finger or pointer can reach it at all: the layer a touch lands on. */
    hittable: getComputedStyle(scope.querySelector("[data-chart-touch-shield]")).pointerEvents !== "none",
  }
}

async function measure() {
  if (!document.querySelector("#live .recharts-wrapper")) {
    document.getElementById("out").textContent = JSON.stringify({ error: "no chart mounted" })
    return
  }

  const empty = look("empty")
  const loading = look("live")

  /*
    WHAT THIS CAN AND CANNOT SEE.

    It used to see only the two ends. It ran under --virtual-time-budget,
    which fast-forwards the clock and starves requestAnimationFrame, so the
    growth between the ends was never sampled and never really played.

    It runs in Puppeteer's headless Chromium now, on a real clock, and the
    line is moved by requestAnimationFrame (components/app/morph-lines), so
    the shapes it passes through on the way up are counted: a growth is many
    of them, a cut is one. What it still cannot see is how smooth each frame
    is; scripts/check-analytics-page.mjs measures that on the whole page.
  */
  const pathNow = () => document.querySelector("#live [data-trend-line]")?.getAttribute("d") ?? null
  const flat = pathNow()
  window.__arrive()
  const shapes = []
  for (let i = 0; i < 24; i++) {
    const d = pathNow()
    if (d && d !== shapes[shapes.length - 1]) shapes.push(d)
    await tick(); await tick()
  }
  const loaded = look("live")

  document.getElementById("out").textContent = JSON.stringify({
    empty, loading, loaded,
    /* How many distinct shapes the line passed through on its way up. */
    steps: shapes.length,
    startedFlat: shapes.length > 0 && shapes[0] === flat,
    endedElsewhere: shapes.length > 0 && shapes[shapes.length - 1] !== flat,
  })
}
addEventListener("load", () => setTimeout(measure, 1200))
</script>`)

  /*
    A REAL CLOCK. This ran under --virtual-time-budget, which starves
    requestAnimationFrame, and the line is moved by requestAnimationFrame now
    (components/app/morph-lines): under a starved clock it would never leave
    the floor. Puppeteer's headless Chromium runs frames as a browser does.
  */
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--window-size=900,700"] })
  let raw = "pending"
  try {
    const tab = await browser.newPage()
    await tab.setViewport({ width: 900, height: 700 })
    await tab.goto(`file://${page}`, { waitUntil: "load" })
    await tab.waitForFunction(() => document.getElementById("out")?.textContent !== "pending", { timeout: 20000 })
    raw = await tab.evaluate(() => document.getElementById("out").textContent)
  } finally {
    await browser.close()
  }
  if (raw === "pending") fail("The chart never reported a measurement.")
  const m = JSON.parse(raw)
  if (m.error) fail(m.error)

  let broken = 0
  const expect = (ok, what, got) => {
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
    if (!ok) broken++
  }

  const row = (label, s) =>
    console.log(`  ${label.padEnd(12)} ${String(s.svgNodes).padStart(3)} nodes   ${String(s.gridLines).padStart(2)} grid   ${String(s.axisTicks).padStart(2)} ticks   ${s.curves} line   ${s.dots} dots   ${s.stroke ?? "-"}`)

  console.log("\nSeven days, the views series, before and after the numbers land\n")
  row("empty", m.empty)
  row("placeholder", m.loading)
  row("loaded", m.loaded)
  console.log("")

  /* ── IS THERE ANYTHING THERE ─────────────────────────────────────────── */
  /* Not literally nothing: recharts still lays out an empty plot area and two
     grid lines for a domain of nothing. What it draws none of is the thing
     that makes a chart legible — no dates and no line — which is the blank
     white card in the screenshot. */
  expect(
    m.empty.axisTicks === 0 && m.empty.curves === 0,
    "an empty series draws no dates and no line, which is the blank card reported",
    `${m.empty.axisTicks} ticks and ${m.empty.curves} lines with no data`,
  )
  expect(m.loading.gridLines > 0, "the placeholder draws the grid", m.loading.gridLines)
  expect(m.loading.axisTicks >= 7, "and the dates, so the frame is the one the data will land in", m.loading.axisTicks)
  expect(m.loading.curves === 1, "and one line, resting on the axis", m.loading.curves)

  /* ── DOES IT READ AS WAITING ─────────────────────────────────────────── */
  expect(m.loading.stroke === SKELETON_STROKE, "the placeholder line is grey, not a metric's colour", m.loading.stroke)
  expect(m.loading.areaFill === "none", "with nothing filled in under it", m.loading.areaFill)
  expect(m.loading.dots === 0, "and no points on it, because there are no numbers to point at", m.loading.dots)
  expect(!m.loading.hittable, "nothing in it can be pressed", "a finger can still raise a tooltip reading zero")
  expect(/chart-skeleton-breath/.test(m.loading.breathes ?? ""), "and it breathes, so the frame reads as waiting", m.loading.breathes)

  /* ── DOES THE LINE GROW ──────────────────────────────────────────────── */
  console.log(`  the curve took ${m.steps} distinct shapes on its way up\n`)
  expect(m.startedFlat, "the line starts on the flat placeholder it was already resting on", "it jumped somewhere else first")
  expect(m.steps >= 8, "and grows through the shapes between, rather than being cut to the numbers", m.steps)
  expect(m.endedElsewhere, "and ends on the numbers", "it never left the baseline")
  expect(m.loaded.stroke !== SKELETON_STROKE, "the stroke takes the metric's colour", m.loaded.stroke)
  expect(
    /stroke/.test(m.loaded.strokeTransition ?? "") && !/\b0s\b/.test(m.loaded.strokeTransition ?? ""),
    "over a transition, so the colour fades rather than switching in a frame",
    m.loaded.strokeTransition,
  )
  expect(m.loaded.dots > 0, "the points come back with the data", m.loaded.dots)
  expect(m.loaded.hittable, "and the chart answers a finger again", "it is still inert after loading")
  expect(!/chart-skeleton-breath/.test(m.loaded.breathes ?? ""), "and it stops breathing", m.loaded.breathes)

  console.log(`\n${broken === 0 ? "The card is a chart from the first frame, and the line grows into it." : `${broken} failed`}`)
  process.exit(broken === 0 ? 0 : 1)
} finally {
  rmSync(work, { recursive: true, force: true })
}
