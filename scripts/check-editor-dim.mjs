/**
 * ===========================================================================
 *  THE DIM REACHES THE BOTTOM EDGE OF THE BAR
 * ===========================================================================
 * `absolute inset-0` resolves against the PADDING box. A border is outside
 * that, so a bar with `border-b` keeps a lit 1px line under a dim that covers
 * everything else — which is what the hairline in the report was.
 *
 * So the measurement is the two rectangles. getBoundingClientRect includes an
 * element's border, so if the bar has one the dim's bottom lands above the
 * bar's and the difference IS the line. They have to be the same edge.
 *
 *   pnpm build && node scripts/check-editor-dim.mjs
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

const out = mkdtempSync(join(tmpdir(), "storelib-dim-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-editor-dim.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>html,body{margin:0;overflow:hidden}#app{width:390px}</style></head><body><script>window.__err=[];addEventListener("error",function(e){window.__err.push(String(e.message))})</script><div id="app"></div><script src="probe.js"></script>
<script>
setTimeout(function () {
  var rows = []
  document.querySelectorAll("#app [data-case]").forEach(function (el) {
    var dim = el.querySelector("[data-dim]")
    var b = el.getBoundingClientRect()
    var d = dim ? dim.getBoundingClientRect() : null
    var cs = getComputedStyle(el)
    rows.push({
      where: el.getAttribute("data-case"),
      barBottom: Math.round(b.bottom * 100) / 100,
      dimBottom: d ? Math.round(d.bottom * 100) / 100 : null,
      uncovered: d ? Math.round((b.bottom - d.bottom) * 100) / 100 : null,
      barTop: Math.round(b.top * 100) / 100,
      dimTop: d ? Math.round(d.top * 100) / 100 : null,
      borderBottomWidth: cs.borderBottomWidth,
      boxShadow: cs.boxShadow,
      dimOpacity: d ? Number(getComputedStyle(dim).opacity) : null,
    })
  })
  var pre = document.createElement("pre"); pre.id = "result"
  pre.textContent = JSON.stringify({ rows: rows, errors: window.__err })
  document.body.append(pre)
}, 700)
</script></body></html>`)

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=390,844", "--force-device-scale-factor=1", "--virtual-time-budget=10000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 })
const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("Nothing reported. The probe threw before it could answer.")
const payload = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))
if (payload.errors?.length) fail(`it threw: ${payload.errors.join(" | ")}`)
console.log(JSON.stringify(payload.rows, null, 2))

const open = payload.rows.find((r) => r.where === "sheet open")
const problems = []
if (!open) problems.push("the dimmed bar did not render.")
else {
  if (open.dimOpacity !== 1) problems.push(`the dim is at ${open.dimOpacity}, so this is not measuring a dimmed bar.`)
  /* THE LINE. Any strip of bar below the dim is a lit hairline. */
  if (open.uncovered > 0.01) {
    problems.push(`${open.uncovered}px of the bar sits below the dim — that strip is the lit hairline.`)
  }
  if (open.dimTop - open.barTop > 0.01) problems.push(`${(open.dimTop - open.barTop).toFixed(2)}px of the bar sits above the dim.`)
  /* And the reason it is covered: the hairline is painted inside, not as a
     border that no `inset-0` child can reach. */
  if (open.borderBottomWidth !== "0px") {
    problems.push(`the bar still has a ${open.borderBottomWidth} bottom border, which an inset-0 overlay cannot cover.`)
  }
  if (!/inset/.test(open.boxShadow)) problems.push(`the hairline is not an inset shadow (box-shadow: ${open.boxShadow}), so it is not under the dim.`)
}

if (problems.length) fail(problems.map((p) => `  - ${p}`).join("\n"))
console.log("\nThe dim covers the bar to its last pixel. No lit hairline under it.\n")
