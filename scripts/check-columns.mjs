/**
 * ===========================================================================
 *  HOW MANY COLUMNS DOES A PHONE ACTUALLY GET
 * ===========================================================================
 * "Responsive by default" is a claim about the shipped defaults, so it is
 * measured on the shipped defaults: every section rendered exactly as
 * `addSection` stores it, laid out at 390px and at 1100px, and every CSS
 * grid asked how many tracks it resolved to and how wide each one came out.
 *
 * A card narrower than about 150px is a card nothing fits in.
 *
 * IT ALSO READS THE VARIABLES, NOT ONLY THE LAYOUT. A section that writes a
 * setting into a custom property gets `--cols-d: {"desktop":3,…}` if that
 * setting arrives as an object rather than a number. `repeat(var(--cols-d),
 * …)` then resolves to ONE track, not to `none`, so the grid lays out in a
 * single column and looks exactly like a section that collapses nicely on a
 * phone. A broken per-breakpoint default was measured as a fix here once
 * because of that, so the variables are checked directly.
 *
 *   pnpm build && node scripts/check-columns.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(m); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const stubs = join(root, ".wb-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "link.jsx"), `import React from "react"\nexport default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }\n`)
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/"\nexport const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {} })\nexport const useSearchParams = () => new URLSearchParams()\n`)

const out = mkdtempSync(join(tmpdir(), "storelib-cols-"))
const bundle = join(out, "probe.js")
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-cols-probe.tsx"),
  "--bundle", "--platform=node", "--format=cjs", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@=${root}`],
  { stdio: ["ignore", "ignore", "inherit"] })
execFileSync("node", [bundle], { env: { ...process.env, OUT_DIR: out }, stdio: ["ignore", "ignore", "inherit"] })
const PIC = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#8b5cf6"/></svg>').toString("base64")
const body = readFileSync(join(out, "page.html"), "utf8").replace(/src="https:\/\/example\.invalid\/[^"]*"/g, `src="${PIC}"`)

const MEASURE = `
<script>
(function () {
  var report = {}
  document.querySelectorAll(".probe").forEach(function (probe) {
    var type = probe.getAttribute("data-type")
    var worst = null
    var broken = []

    // The variables, read as written rather than as laid out.
    probe.querySelectorAll("[style]").forEach(function (el) {
      var decls = (el.getAttribute("style") || "").split(";")
      for (var i = 0; i < decls.length; i++) {
        var c = decls[i].indexOf(":")
        if (c < 0) continue
        var name = decls[i].slice(0, c).trim()
        if (name.slice(0, 2) !== "--") continue
        var v = decls[i].slice(c + 1).trim()
        if (v.charAt(0) === "{" || v.indexOf("[object Object]") >= 0 || v === "undefined" || v === "NaN") {
          broken.push(name + ": " + v.slice(0, 44))
        }
      }
    })

    probe.querySelectorAll("*").forEach(function (el) {
      var s = getComputedStyle(el)
      if (s.display !== "grid" && s.display !== "inline-grid") return
      var tracks = s.gridTemplateColumns.split(" ").filter(Boolean).map(parseFloat).filter(function (n) { return !isNaN(n) })
      if (tracks.length < 2) return
      var narrowest = Math.min.apply(null, tracks)
      if (!worst || narrowest < worst.width) worst = { cols: tracks.length, width: Math.round(narrowest) }
    })

    if (worst || broken.length) {
      report[type] = worst || { cols: 1, width: 390 }
      if (broken.length) report[type].broken = broken
    }
  })
  var pre = document.createElement("pre"); pre.id = "result"
  pre.textContent = JSON.stringify(report)
  document.body.append(pre)
})()
</script>`

function run(width) {
  const file = join(out, `i-${width}.html`)
  writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>
  body{margin:0;background:#fff;font-family:Inter,system-ui,sans-serif}
  .probe{width:${width}px;margin:0 auto;background:#fff;overflow:hidden}
</style></head><body>${body}${MEASURE}</body></html>`)
  const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    `--window-size=${width + 40},1400`, "--virtual-time-budget=8000", "--run-all-compositor-stages-before-draw",
    "--dump-dom", `file://${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 })
  const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
  if (!m) fail(`No report at ${width}px.`)
  return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))
}

const phone = run(390)
const desk = run(1100)
const TOO_NARROW = 150

/**
 * Keyed off every section either run saw. Reading the phone run alone would
 * quietly drop exactly the sections that were fixed, because a section that
 * collapses to one column has no multi-track grid left to find at 390px.
 */
const types = Array.from(new Set([...Object.keys(desk), ...Object.keys(phone)]))
const rows = types.map((t) => ({
  type: t,
  deskCols: desk[t]?.cols ?? 1,
  cols: phone[t]?.cols ?? 1,
  width: phone[t]?.width ?? 390,
  broken: [...(desk[t]?.broken ?? []), ...(phone[t]?.broken ?? [])],
}))
rows.sort((a, b) => a.width - b.width)

console.log(`Grids on a 390px phone, shipped defaults:\n`)
for (const r of rows) {
  const mark = r.broken.length ? `  ← ${r.broken[0]}` : r.width < TOO_NARROW ? `  ← ${r.width}px per card` : ""
  console.log(`  ${r.type.padEnd(22)} ${r.deskCols} across on a desktop, ${r.cols} on a phone${mark}`)
}

const broke = rows.filter((r) => r.broken.length)
const bad = rows.filter((r) => !r.broken.length && r.width < TOO_NARROW)

if (broke.length) {
  console.log(`\n${broke.length} section${broke.length > 1 ? "s write" : " writes"} something that is not a CSS value into a custom property:`)
  // One line each: the same variable shows up once per run and once per
  // element, and six copies of it says nothing the first one did not.
  for (const r of broke) console.log(`  ${r.type.padEnd(22)} ${Array.from(new Set(r.broken)).join("  ")}`)
}
if (bad.length) {
  console.log(`\n${bad.length} of ${rows.length} squeeze a phone under ${TOO_NARROW}px:`)
  for (const r of bad) console.log(`  ${r.type}: ${r.cols} columns at ${r.width}px each`)
}
if (!broke.length && !bad.length) {
  console.log(`\nEvery grid parses, and gives a phone at least ${TOO_NARROW}px per card.`)
}
if (broke.length || bad.length) process.exit(1)
