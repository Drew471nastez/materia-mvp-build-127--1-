/**
 * ===========================================================================
 *  THE CATEGORY PILL IS GONE FROM THE PROFILE, AND THE BIO IS NOT
 * ===========================================================================
 * Deleting a render branch is easy to claim and easy to get wrong: the same
 * niche reaches the header from two directions, and the switches that used to
 * gate it are still sitting in every config saved before today. So the header
 * is mounted with all of that set, and the DOM is read.
 *
 * Two things are checked, because deleting too much looks identical to
 * deleting the right amount if you only check for absence:
 *   1. the niche word appears nowhere in the header
 *   2. the bio and the handle are still there
 *
 *   pnpm build && node scripts/check-profile-pills.mjs
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

const out = mkdtempSync(join(tmpdir(), "storelib-pills-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-profile-pills.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

/**
 * The reading is scoped to #app and the driver never writes the niche word
 * into the page, because an earlier probe in this repo matched its own source
 * through document.body.textContent and reported a pass it had written itself.
 */
writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>body{margin:0}</style></head><body><div id="app"></div><script src="probe.js"></script>
<script>
setTimeout(function () {
  var word = ["Photo", "graphy"].join("")
  var rows = []
  document.querySelectorAll("#app [data-case]").forEach(function (el) {
    var text = el.textContent || ""
    var pills = []
    el.querySelectorAll("div,span").forEach(function (n) {
      if (n.children.length === 0 && (n.textContent || "").trim() === word) pills.push(n.className)
    })
    rows.push({
      where: el.getAttribute("data-case"),
      hasNiche: text.indexOf(word) !== -1,
      pillNodes: pills,
      hasBio: text.indexOf("skate videos") !== -1,
      hasHandle: text.indexOf("andrewrullz") !== -1,
      chars: text.length,
    })
  })
  var pre = document.createElement("pre"); pre.id = "result"; pre.textContent = JSON.stringify(rows); document.body.append(pre)
}, 600)
</script></body></html>`)

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=430,900", "--virtual-time-budget=9000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 })
const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("The header never reported. It probably threw while mounting.")
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))
if (rows.length !== 2) fail(`Expected the desktop and mobile headers, got ${rows.length}.`)

const problems = []
for (const r of rows) {
  if (r.chars < 40) problems.push(`${r.where}: the header rendered almost nothing (${r.chars} chars), so the rest of this proves nothing.`)
  if (r.hasNiche) problems.push(`${r.where}: the niche is still printed on the profile${r.pillNodes.length ? ` (pill node: ${r.pillNodes[0]})` : ""}.`)
  if (!r.hasBio) problems.push(`${r.where}: the bio is gone. The pill was meant to go, not the bio under it.`)
  if (!r.hasHandle) problems.push(`${r.where}: the handle is gone.`)
}

console.log(JSON.stringify(rows, null, 2))
if (problems.length) fail(problems.map((p) => `  - ${p}`).join("\n"))
console.log("\nNo category pill on either header. Handle and bio intact.\n")
