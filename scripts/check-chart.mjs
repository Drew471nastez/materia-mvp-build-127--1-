#!/usr/bin/env node
/**
 * ===========================================================================
 *  WHAT A HOVER ON THE ANALYTICS CHART ACTUALLY COSTS
 * ===========================================================================
 * "The chart is not smooth" is a claim about frames, and frames are the one
 * thing you cannot reason about from source. So the real component is
 * bundled, mounted in real Chromium, driven with real pointer events, and
 * asked four questions:
 *
 *   nodes      how much SVG recharts holds at rest
 *   mutations  how much of that DOM it rewrites for ONE mouse move
 *   idle       how much it rewrites when nothing is happening at all
 *   glide      whether the crosshair, the active dot and the tooltip box are
 *              MOVED BY A TRANSFORM with a transition on it, or teleported
 *
 * The counts are deterministic in headless Chromium — same bundle, same
 * numbers — which is what makes them assertable rather than merely
 * interesting. Wall-clock timing is not: --virtual-time-budget freezes the
 * clock, and every duration this probe tried to take came back as 0.00ms.
 */
import { execFileSync } from "node:child_process"
import { writeFileSync, rmSync, existsSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"

const fail = (m) => { console.error(m); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)

/*
  THE BUDGETS.

  Set from what the chart costs once it is fixed, not from a round number:
  they exist to stop it drifting back, so each sits just above its
  measurement — 125 nodes, 8.8 mutations a move.
*/
const NODE_BUDGET = 160
const MUTATION_BUDGET = 12

/*
  BUNDLED INSIDE THE REPO, not in /tmp.

  esbuild resolves bare specifiers from the importer's directory, and /tmp has
  no node_modules — "Could not resolve react". Everything here is removed in
  the `finally`.
*/
const work = join(root, ".chart-probe")
mkdirSync(work, { recursive: true })

// The native bridge reaches for Capacitor, which does not exist in a page.
writeFileSync(join(work, "native-bridge.js"), `export const hapticTap = () => {}
export const triggerHaptic = () => {}
`)

try {
  execFileSync("npx", [
    "esbuild", join(root, "scripts/render-chart-probe.tsx"),
    "--bundle", "--platform=browser", "--format=iife",
    `--outfile=${join(work, "probe.js")}`,
    `--alias:@/lib/native-bridge=${join(work, "native-bridge.js")}`,
    `--alias:@=${root}`,
    "--jsx=automatic", "--log-level=error",
    '--define:process.env.NODE_ENV="production"',
  ], { cwd: root, stdio: "inherit" })

  const page = join(work, "chart.html")
  writeFileSync(page, `<!doctype html><meta charset="utf-8">
<style>body{margin:0}</style>
<div id="root"></div>
<pre id="out">pending</pre>
<script src="./probe.js"></script>
<script>
const tick = () => new Promise((r) => setTimeout(r, 16))

async function measure() {
  const svg = document.querySelector("#chart .recharts-wrapper")
  if (!svg) { document.getElementById("out").textContent = JSON.stringify({ error: "no chart mounted" }); return }
  const box = svg.getBoundingClientRect()
  const y = box.top + box.height / 2
  /*
    Recharts listens for mousemove on its own wrapper and recomputes the
    active point from the event position. A synthetic MouseEvent with a real
    clientX goes through exactly the same path a mouse does.
  */
  const send = (type, x) => svg.dispatchEvent(new MouseEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y, view: window,
  }))

  /*
    COUNTED IN THE CALLBACK, not with takeRecords().

    takeRecords() returns only what has NOT yet been delivered — and across an
    awaited frame the callback has already run and drained the queue. Reading
    it there reported zero mutations for everything, including a parent render
    the callback form had just measured at nine.
  */
  const watch = async (act, frames) => {
    let n = 0
    const o = new MutationObserver((records) => { n += records.length })
    o.observe(document.getElementById("chart"), { subtree: true, childList: true, attributes: true, characterData: true })
    await act()
    for (let i = 0; i < (frames || 2); i++) await tick()
    n += o.takeRecords().length
    o.disconnect()
    return n
  }

  // Before anything is touched: is the chart repainting itself unprompted?
  const mutationsBeforeAnyHover = await watch(() => {})

  send("mouseenter", box.left + 10)
  send("mousemove", box.left + 10)
  await tick()
  const nodes = document.querySelectorAll("#chart svg *").length

  /*
    ONE MOVE PER FRAME, NOT SIXTY IN A ROW.

    React 18 gives mousemove ContinuousEventPriority, which is SCHEDULED
    rather than flushed synchronously. Sixty dispatches in a tight loop
    collapse into a single commit, and the first version of this probe duly
    reported "0 mutations per move" for a scrub that visibly moved the
    tooltip. Each move now gets its own frame.
  */
  const STEPS = 24
  const mutations = await watch(async () => {
    for (let i = 0; i < STEPS; i++) {
      send("mousemove", box.left + 12 + ((box.width - 24) * i) / (STEPS - 1))
      await tick()
    }
  }, 2)

  // Let anything the scrub scheduled land before asking what is still moving.
  for (let i = 0; i < 8; i++) await tick()
  const mutationsWhenLeftAlone = await watch(() => {})

  /*
    THE PARENT-RENDER TEST, WITH A CONTROL.

    "N mutations after clicking bump" only means something next to how many
    arrive over the same two frames when nothing is clicked — recharts keeps
    its own work in flight, and a number without a baseline would blame the
    parent for it.
  */
  const mutationsOnParentRender = await watch(() => document.getElementById("bump").click())

  /*
    THE GLIDE ITSELF.

    Node counts say the chart is cheap; they say nothing about whether it
    MOVES smoothly. Nearest-point snapping is not optional — the tooltip has
    to name a real day — so what has to be true is that each piece is
    positioned by a transform and has a transition on it, which is the whole
    difference between arriving at the next point and teleporting to it.
  */
  send("mousemove", box.left + box.width * 0.4)
  await tick()
  const glide = (sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const c = getComputedStyle(el)
    return { transform: c.transform === "none" ? "none" : "set", property: c.transitionProperty, duration: c.transitionDuration }
  }

  document.getElementById("out").textContent = JSON.stringify({
    box: Math.round(box.width) + "x" + Math.round(box.height),
    tooltipShown: !!document.querySelector(".recharts-tooltip-wrapper *"),
    cursorIsLine: !!document.querySelector("line.recharts-tooltip-cursor"),
    cursor: glide("#chart .recharts-tooltip-cursor"),
    activeDot: glide("#chart .recharts-active-dot circle"),
    tooltipBox: glide("#chart .recharts-tooltip-wrapper"),
    nodes,
    mutationsPerMove: Math.round((mutations / STEPS) * 10) / 10,
    mutationsBeforeAnyHover,
    mutationsWhenLeftAlone,
    mutationsOnParentRender,
  })
}
addEventListener("load", () => setTimeout(measure, 1800))
</script>`)

  const dom = execFileSync(CHROMIUM, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--window-size=900,700",
    "--virtual-time-budget=15000", "--dump-dom", `file://${page}`,
  ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] })

  const match = dom.match(/<pre id="out">([^<]*)</)
  if (!match || match[1] === "pending") fail("The chart never reported a measurement.")
  const m = JSON.parse(match[1])
  if (m.error) fail(m.error)

  let broken = 0
  const expect = (ok, what, got) => {
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
    if (!ok) broken++
  }

  console.log("\n30 days, four series, a mouse dragged across the plot")
  console.log(`  measured: ${JSON.stringify(m)}\n`)

  expect(m.tooltipShown, "the pointer reaches the chart at all", m.tooltipShown)
  expect(m.nodes <= NODE_BUDGET, `the plot holds at most ${NODE_BUDGET} svg nodes`, m.nodes)
  expect(m.mutationsPerMove <= MUTATION_BUDGET, `one mouse move rewrites at most ${MUTATION_BUDGET} of them`, m.mutationsPerMove)

  const glides = (g, what) =>
    expect(!!g && g.transform === "set" && /transform/.test(g.property) && !/^0s/.test(g.duration), what, JSON.stringify(g))
  expect(m.cursorIsLine, "the crosshair is the custom one, not recharts' path", m.cursorIsLine)
  glides(m.cursor, "and it is moved by a transform, with a transition on it")
  glides(m.activeDot, "the active dot glides to the next point")
  glides(m.tooltipBox, "and the tooltip box follows rather than teleports")

  expect(m.mutationsBeforeAnyHover === 0, "an untouched chart repaints nothing", m.mutationsBeforeAnyHover)
  expect(m.mutationsWhenLeftAlone === 0, "and a settled one repaints nothing either", m.mutationsWhenLeftAlone)
  expect(
    m.mutationsOnParentRender <= m.mutationsWhenLeftAlone,
    "a parent render with identical props costs no more than sitting still",
    `${m.mutationsOnParentRender} vs ${m.mutationsWhenLeftAlone} idle`,
  )

  console.log(`\n${broken === 0 ? "the chart holds its frame" : `${broken} failed`}`)
  process.exit(broken === 0 ? 0 : 1)
} finally {
  rmSync(work, { recursive: true, force: true })
}
