/**
 * ===========================================================================
 *  THE PROFILE PICTURE IS A ROUNDED SQUARE
 * ===========================================================================
 * components/ui/avatar bakes `rounded-full` into its root, so the only reason
 * the new shape appears at all is that an inline style outranks a class. That
 * is worth one measurement rather than one assumption — and so is whether the
 * photo inside is clipped to the new corner or still to the old circle.
 *
 *   pnpm build && node scripts/check-avatar-shape.mjs
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

const out = mkdtempSync(join(tmpdir(), "storelib-avatar-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-avatar-shape.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>body{margin:0}</style></head><body><div id="app"></div><script src="probe.js"></script>
<script>
setTimeout(function () {
  var rows = []
  document.querySelectorAll("[data-size]").forEach(function (el) {
    var cs = getComputedStyle(el)
    var img = el.querySelector("img")
    rows.push({
      size: Number(el.getAttribute("data-size")),
      radius: cs.borderTopLeftRadius,
      width: Math.round(el.getBoundingClientRect().width),
      shadow: cs.boxShadow,
      overflow: cs.overflow,
      hasImage: !!img,
    })
  })
  var pre = document.createElement("pre"); pre.id = "result"; pre.textContent = JSON.stringify(rows); document.body.append(pre)
}, 500)
</script></body></html>`)

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=600,400", "--virtual-time-budget=8000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 })
const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("The avatars never reported.")
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))

const problems = []
console.log("")
for (const r of rows) {
  const want = Math.round(r.size * 0.24)
  console.log(`  ${r.size}px avatar: radius ${r.radius} (wanted ${want}px), ${r.width}px wide, overflow ${r.overflow}`)
  const got = Number.parseFloat(r.radius)
  if (r.radius.includes("%")) problems.push(`The ${r.size}px avatar's radius came back as ${r.radius}. That is still the circle from ui/avatar's rounded-full.`)
  else if (Math.abs(got - want) > 1) problems.push(`The ${r.size}px avatar's radius is ${r.radius}, not ${want}px.`)
  if (got >= r.size / 2 - 1) problems.push(`A radius of ${r.radius} on a ${r.size}px box is a circle, not a rounded square.`)
  if (r.overflow !== "hidden") problems.push(`The ${r.size}px avatar does not clip its photo (overflow: ${r.overflow}), so the corners are the photo's, not the shape's.`)
  if (!r.hasImage) problems.push(`The ${r.size}px avatar never rendered its photo, so nothing was clipped.`)
  /* Two layers, and neither of them heavy. */
  const layers = r.shadow.split(/,(?![^(]*\))/).length
  if (layers < 2) problems.push(`The ${r.size}px avatar has ${layers} shadow layer. One wide blur reads as a halo rather than as something resting on the page.`)
}
console.log(`\n  shadow: ${rows[0].shadow}\n`)

if (problems.length) {
  console.error(`${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  console.error("")
  process.exit(1)
}
console.log("A rounded square at both sizes, clipping its photo, with two soft shadow layers under it.\n")
