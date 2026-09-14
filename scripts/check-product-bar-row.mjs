/**
 * ===========================================================================
 *  THE PRODUCT BAR IS ONE ROW ON A PHONE
 * ===========================================================================
 * Every control's box is read and grouped by its vertical centre. One row
 * means one group. A long creator name must not change that, and must not
 * squeeze the email field down to something nobody can type in.
 *
 *   pnpm build && node scripts/check-product-bar-row.mjs
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

const out = mkdtempSync(join(tmpdir(), "storelib-bar-"))
const stub = join(out, "nav.js")
writeFileSync(stub, "export const useRouter=()=>({refresh(){},push(){},replace(){},back(){},forward(){},prefetch(){}});export const usePathname=()=>'/p/x';export const useSearchParams=()=>new URLSearchParams();export const useParams=()=>({})\n")
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-product-bar-row.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, `--alias:next/navigation=${stub}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>html,body{margin:0;overflow:hidden}#app{width:390px}</style></head><body><div id="app"></div><script src="probe.js"></script>
<script>
setTimeout(function () {
  var rows = []
  document.querySelectorAll("#app [data-case]").forEach(function (el) {
    var bar = el.querySelector("form")
    var back = el.querySelector('button[aria-label="Back"]')
    var link = el.querySelector("a")
    var input = el.querySelector("input")
    var submit = el.querySelector('button[type="submit"]')
    var parts = []
    ;[["back", back], ["creator", link], ["email", input], ["button", submit]].forEach(function (p) {
      if (!p[1]) return
      var r = p[1].getBoundingClientRect()
      parts.push({ name: p[0], top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), centre: Math.round(r.top + r.height / 2) })
    })
    var centres = parts.map(function (p) { return p.centre }).sort(function (a, b) { return a - b })
    var spread = centres.length ? centres[centres.length - 1] - centres[0] : 0
    var host = el.firstElementChild
    rows.push({
      where: el.getAttribute("data-case"),
      barHeight: bar ? Math.round(bar.getBoundingClientRect().height) : 0,
      hostHeight: host ? Math.round(host.getBoundingClientRect().height) : 0,
      parts: parts,
      centreSpread: spread,
      nameOverflows: (function () { var p = link && link.querySelector("p"); return p ? p.scrollWidth > p.clientWidth + 1 : null })(),
    })
  })
  var pre = document.createElement("pre"); pre.id = "result"; pre.textContent = JSON.stringify(rows); document.body.append(pre)
}, 700)
</script></body></html>`)

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=390,844", "--force-device-scale-factor=1", "--virtual-time-budget=12000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 })
const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("The bar never reported. It threw while mounting.")
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))
console.log(JSON.stringify(rows, null, 2))

const problems = []
if (rows.length !== 2) problems.push(`expected the short and long name, got ${rows.length}.`)
for (const r of rows) {
  if (r.parts.length !== 4) problems.push(`${r.where}: only ${r.parts.length} of the four controls rendered.`)
  /* One row means every control shares a vertical centre. */
  if (r.centreSpread > 4) problems.push(`${r.where}: the controls sit on more than one line (${r.centreSpread}px between the highest and lowest centre).`)
  const email = r.parts.find((p) => p.name === "email")
  if (email && email.width < 100) problems.push(`${r.where}: the email field is ${email.width}px wide, too narrow to type in.`)
  /* Nothing may run past the 390px screen. */
  for (const p of r.parts) {
    if (p.right > 390) problems.push(`${r.where}: ${p.name} runs ${p.right - 390}px past the right edge.`)
    if (p.left < 0) problems.push(`${r.where}: ${p.name} starts ${-p.left}px off the left edge.`)
  }
}
/* The long name is the case that used to break it, so it has to be the one
   that yields — truncated, not pushing the field off the row. */
const long = rows.find((r) => r.where === "long")
if (long && long.nameOverflows === false) problems.push("the long name did not truncate, so the probe is not testing the case it claims to.")

if (problems.length) fail(problems.map((p) => `  - ${p}`).join("\n"))
console.log("\nOne row, both names. The email field keeps a usable width and the name truncates.\n")
