/**
 * ===========================================================================
 *  THE LOADER GETS OUT OF THE WAY, IT DOES NOT VANISH
 * ===========================================================================
 * Two claims, and only the second is new:
 *
 *   while loading   the loader is there and opaque
 *   after loading   the loader is STILL MOUNTED, and transparent, with a
 *                   transition on its opacity — so it fades across the page
 *                   rather than being deleted in one frame
 *
 * The second is the whole fix. A loader that is simply removed leaves a frame
 * with neither it nor the page on screen, and that frame is the cut.
 *
 *   pnpm build && node scripts/check-loader-handoff.mjs
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

const out = mkdtempSync(join(tmpdir(), "storelib-handoff-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-loader-handoff.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>html,body{margin:0;overflow:hidden}#app{width:390px}</style></head><body><script>window.__err=[];addEventListener("error",function(e){window.__err.push(String(e.message))})</script><div id="app"></div><script src="probe.js"></script>
<script>
/*
  Read at three moments across one real hand-off, because what is being
  checked is a sequence: covering, then still there and going, then gone.
  Reading two components in two states cannot see the middle one, which is
  the only one the fix is about.
*/
function snap(label) {
  var el = document.querySelector("[data-canvas]")
  var loader = el && el.querySelector("[data-loader]")
  var cs = loader ? getComputedStyle(loader) : null
  return {
    at: label,
    mounted: !!loader,
    opacity: cs ? Number(cs.opacity) : null,
    transition: cs ? cs.transitionProperty + " " + cs.transitionDuration : null,
    covers: loader ? Math.round(loader.getBoundingClientRect().height) : 0,
    leaving: loader ? loader.getAttribute("data-leaving") : null,
    pageUnder: !!(el && el.querySelector("[data-page]")),
  }
}
var rows = []
setTimeout(function () { rows.push(snap("loading")) }, 120)
setTimeout(function () { rows.push(snap("handing over")) }, 300)
setTimeout(function () {
  rows.push(snap("done"))
  var pre = document.createElement("pre"); pre.id = "result"
  pre.textContent = JSON.stringify({ rows: rows, errors: window.__err })
  document.body.append(pre)
}, 1200)
</script></body></html>`)

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=390,844", "--force-device-scale-factor=1", "--virtual-time-budget=12000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 })
const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("Nothing reported. The probe threw before it could answer.")
const payload = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))
if (payload.errors?.length) fail(`it threw: ${payload.errors.join(" | ")}`)
console.log(JSON.stringify(payload.rows, null, 2))

const loading = payload.rows.find((r) => r.at === "loading")
const handing = payload.rows.find((r) => r.at === "handing over")
const done = payload.rows.find((r) => r.at === "done")
const problems = []
if (!loading || !handing || !done) problems.push("one of the three readings is missing.")
else {
  if (!loading.mounted) problems.push("while loading there is no loader at all.")
  if (loading.opacity !== 1) problems.push(`while loading the loader is at ${loading.opacity}, not opaque.`)
  if (loading.covers < 100) problems.push(`the loader covers only ${loading.covers}px, so it is not covering the canvas.`)

  /* THE FIX. Deleted in one frame is what was wrong. */
  if (!handing.mounted) problems.push("the loader is already gone from the tree the moment loading ends, which is the cut.")
  /*
    NOT a mid-transition opacity. Under --virtual-time-budget a CSS
    transition never advances, so the computed opacity here is always its
    start value and a check on it would be a check on the harness. What IS
    observable is that the element is flagged as leaving and that the
    stylesheet turns that flag into a fade — both of which are below.
  */
  if (handing.leaving !== "true") problems.push(`the loader is not flagged as leaving (data-leaving=${handing.leaving}), so nothing triggers the fade.`)
  if (handing.mounted && !/opacity/.test(handing.transition ?? "")) {
    problems.push(`the loader has no opacity transition (${handing.transition}), so going to 0 is one frame.`)
  }
  if (handing.mounted && /(^| )0s$/.test(handing.transition ?? "")) {
    problems.push("the transition duration is 0s, which is a fade nobody can see.")
  }
  if (!handing.pageUnder) problems.push("there is no page under the loader to hand over to.")

  /* And it does leave: a loader that lingers for ever is a different bug. */
  if (done.mounted) problems.push("the loader never leaves; it is still mounted well after the fade.")
}

/*
  And the stylesheet is what turns that flag into a fade. The attribute value
  is matched WITH OR WITHOUT QUOTES: the minifier drops them, so a regex
  written against the source spelling fails on the built file for a reason
  that has nothing to do with the rule being there.
*/
{
  const compact = css.replace(/\s+/g, "")
  if (!/wb-canvas-loader\[data-leaving="?true"?\]\{opacity:0/.test(compact)) {
    problems.push("no rule takes a leaving loader to opacity 0, so the flag means nothing.")
  }
  if (!/wb-canvas-loader\{transition:opacity/.test(compact)) {
    problems.push("the loader has no opacity transition in the stylesheet, so reaching 0 is one frame.")
  }
}

if (problems.length) fail(problems.map((p) => `  - ${p}`).join("\n"))
console.log("\nThe loader stays mounted and fades out across the page. No frame with neither on it.\n")
