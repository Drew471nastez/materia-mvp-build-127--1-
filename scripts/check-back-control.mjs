/**
 * ===========================================================================
 *  THE BACK ARROW SAYS IT IS GOING
 * ===========================================================================
 * "When I click the back icon it should transition into a loading icon that
 * indicates the icon was clicked and it is loading to take me back."
 *
 * Two things have to be true at once and they pull against each other:
 *
 *   A SLOW BACK MUST SHOW ONE. Otherwise the control answers the touch and
 *   then goes silent until the next page arrives, which is the gap that reads
 *   as jumpy.
 *
 *   A FAST BACK MUST NOT. Most backs are a client transition and land in well
 *   under a tenth of a second. A spinner shown and hidden inside 60ms is a
 *   flicker nobody can read, and it is worse than showing nothing.
 *
 * So the claim is about TIMING, and timing is the thing an opinion is worst
 * at. This presses the real control in a real browser and watches the two
 * icons' opacity either side of the delay.
 *
 *   pnpm build && node scripts/check-back-control.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

/** The delay is read out of the component, so the probe cannot hold a stale copy. */
const barSource = readFileSync(join(root, "components/store-builder/product-creator-bar.tsx"), "utf8")
const delay = Number(barSource.match(/const SPINNER_DELAY_MS = (\d+)/)?.[1])
if (!Number.isFinite(delay)) fail("No SPINNER_DELAY_MS in components/store-builder/product-creator-bar.tsx.")

const out = mkdtempSync(join(tmpdir(), "storelib-back-control-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-back-control.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>body{margin:0}
/*
  NO TRANSITIONS, ANIMATIONS KEPT.

  Under --virtual-time-budget there is no compositor advancing the transition
  clock, so a computed opacity stays at the value it had when the transition
  started, however long you wait. This probe spent a round reporting a
  correct crossfade as broken: the classes read opacity-0 and opacity-100
  exactly as intended while getComputedStyle went on returning 1 and 0.

  Turning transitions off makes the computed value the TARGET value, which is
  what is being asserted — whether the right icon is the visible one. The
  curve between them is not this probe's claim. Animations stay on because
  whether the spinner turns at all IS a claim here.
*/
*,*::before,*::after{transition:none!important}</style></head><body><div id="app"></div><script src="probe.js"></script>
<script>
var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms) }) }
function show(o) {
  var pre = document.getElementById("result")
  if (!pre) { pre = document.createElement("pre"); pre.id = "result"; document.body.append(pre) }
  pre.textContent = JSON.stringify(o)
}
async function run() {
  var report = {}
  var btn = document.querySelector('button[aria-label="Back"]')
  report.foundButton = !!btn
  if (!btn) { show(report); return }

  var arrow = btn.querySelector("svg")
  var spin = btn.querySelector(".bar-control-spinner")
  report.foundArrow = !!arrow
  report.foundSpinner = !!spin
  if (!spin || !arrow) { show(report); return }

  /*
    RE-QUERIED EVERY TIME, never cached. React can replace a node rather than
    mutate it, and a detached element keeps the computed style it had when it
    left the document — so a cached reference reports the state BEFORE the
    change for ever. This probe did exactly that: aria-busy read true on the
    live button while the opacities read their pre-click values off two nodes
    that were no longer in the page.
  */
  var live = function () { return document.querySelector('button[aria-label="Back"]') }
  var opArrow = function () { var b = live(); var el = b && b.querySelector("svg"); return el ? Math.round(parseFloat(getComputedStyle(el).opacity) * 100) / 100 : null }
  var opSpin = function () { var b = live(); var el = b && b.querySelector(".bar-control-spinner"); return el ? Math.round(parseFloat(getComputedStyle(el).opacity) * 100) / 100 : null }
  var op = function (el) { return Math.round(parseFloat(getComputedStyle(el).opacity) * 100) / 100 }
  report.atRest = { arrow: opArrow(), spinner: opSpin(), busy: live().getAttribute("aria-busy") }
  report.spinnerAnimation = getComputedStyle(spin).animationName
  /* Same centre, or the arrow jumps sideways as the spinner takes over. */
  var a = arrow.getBoundingClientRect(), s = spin.getBoundingClientRect()
  report.centreDrift = {
    x: Math.round((a.left + a.width / 2) - (s.left + s.width / 2)),
    y: Math.round((a.top + a.height / 2) - (s.top + s.height / 2)),
  }

  /* The press. There is no router here, so the fallback path runs and the
     pending state is whatever the component sets for itself. */
  btn.click()

  await wait(${Math.max(20, delay - 60)})
  report.beforeDelay = { arrow: opArrow(), spinner: opSpin() }
  await wait(${delay + 420})
  report.afterDelay = { arrow: opArrow(), spinner: opSpin(), busy: live().getAttribute("aria-busy") }
  var lb = live()
  report.arrowClassAfter = lb.querySelector("svg").getAttribute("class")
  report.spinClassAfter = lb.querySelector(".bar-control-spinner").getAttribute("class")
  report.buttonCount = document.querySelectorAll('button[aria-label="Back"]').length
  show(report)
}
window.addEventListener("error", function (e) { show({ pageError: String(e.message) }) })
setTimeout(function () { run().catch(function (e) { show({ threw: String((e && e.stack) || e) }) }) }, 900)
</script></body></html>`)

/*
  A SLOW NAVIGATION IS THE CASE THE SPINNER EXISTS FOR, so the harness gives
  it one: the stub router's push suspends instead of resolving, which is what
  a route that has to be fetched does. React keeps the transition pending, the
  control sees pending, and the delay can be measured either side.

  The earlier version of this used a stub that returned at once. That is the
  FAST case, it correctly showed no spinner, and it proved nothing about the
  slow one — the probe passed its own no-flash check while never testing the
  thing it was written for.
*/
const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=390,844", "--virtual-time-budget=20000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 })
const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("The bar never reported.")
const r = JSON.parse(m[1].replace(/&quot;/g, '"'))
if (r.pageError) fail(`The probe page threw: ${r.pageError}`)
if (r.threw) fail(`The probe threw: ${r.threw}`)

const problems = []
console.log(`\n  the spinner waits ${delay}ms before it appears\n`)
if (!r.foundButton) fail("No Back control in the bar.")
if (!r.foundArrow) fail("The Back control has no arrow in it.")
if (!r.foundSpinner) fail("The Back control has no spinner in it, so it can never say it is loading.")

console.log(`  at rest       arrow ${r.atRest.arrow}, spinner ${r.atRest.spinner}, aria-busy ${r.atRest.busy}`)
console.log(`  ${String(Math.max(20, delay - 60)).padStart(4)}ms after   arrow ${r.beforeDelay.arrow}, spinner ${r.beforeDelay.spinner}`)
console.log(`  ${String(delay + 420).padStart(4)}ms after   arrow ${r.afterDelay.arrow}, spinner ${r.afterDelay.spinner}, aria-busy ${r.afterDelay.busy}`)
console.log(`  spinner animation: ${r.spinnerAnimation}`)
if (process.env.DEBUG_BACK) {
  console.log(`  [debug] buttons: ${r.buttonCount}`)
  console.log(`  [debug] arrow class after: ${r.arrowClassAfter}`)
  console.log(`  [debug] spin class after:  ${r.spinClassAfter}`)
}
console.log(`  arrow and spinner centres differ by ${r.centreDrift.x},${r.centreDrift.y}px\n`)

if (r.atRest.spinner !== 0) problems.push(`The spinner is at ${r.atRest.spinner} before anything is pressed. It should be invisible until there is something to wait for.`)
if (r.atRest.arrow !== 1) problems.push(`The arrow is at ${r.atRest.arrow} at rest.`)
if (r.beforeDelay.spinner > 0.1) problems.push(`The spinner was already at ${r.beforeDelay.spinner} before the ${delay}ms delay had passed. A back that lands quickly would flash it.`)
if (r.afterDelay.spinner < 0.9) problems.push(`After ${delay + 420}ms the spinner is only at ${r.afterDelay.spinner}. A slow back shows nothing.`)
if (r.afterDelay.arrow > 0.1) problems.push(`The arrow is still at ${r.afterDelay.arrow} while the spinner is up. The two should cross, not stack.`)
if (r.afterDelay.busy !== "true") problems.push(`aria-busy is ${r.afterDelay.busy} while it is loading, so a screen reader is told nothing.`)
if (!/spin/i.test(r.spinnerAnimation || "")) problems.push(`The spinner's animation is "${r.spinnerAnimation}". It is not turning, which is a broken ring rather than a loading one.`)
if (Math.abs(r.centreDrift.x) > 1 || Math.abs(r.centreDrift.y) > 1) {
  problems.push(`The arrow and the spinner are ${r.centreDrift.x},${r.centreDrift.y}px apart, so the icon jumps as one replaces the other.`)
}

if (problems.length) {
  console.error(`${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  console.error("")
  process.exit(1)
}
console.log("  Nothing for a fast back, a spinner for a slow one, on the same centre.\n")
