/**
 * ===========================================================================
 *  DOES THE PAGE JUMP WHEN THE PICTURES ARRIVE
 * ===========================================================================
 * A section that reserves space for its images is the same height whether
 * they have loaded or not. One that does not grows when each arrives, and on
 * a slow connection that is the page moving under somebody's thumb.
 *
 * Measured rather than reasoned about: every section with an image is
 * rendered with its images broken, measured, then given a real image of a
 * known shape, and measured again.
 *
 *   pnpm build && node scripts/check-layout-shift.mjs
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
writeFileSync(join(stubs, "link.jsx"), `import React from "react"\nexport default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }\nexport const useLinkStatus = () => ({ pending: false })\n`)
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/"\nexport const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {} })\nexport const useSearchParams = () => new URLSearchParams()\n`)

const out = mkdtempSync(join(tmpdir(), "storelib-shift-"))
const bundle = join(out, "probe.js")
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-shift-probe.tsx"),
  "--bundle", "--platform=node", "--format=cjs", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@=${root}`],
  { stdio: ["ignore", "ignore", "inherit"] })
execFileSync("node", [bundle], { env: { ...process.env, OUT_DIR: out }, stdio: ["ignore", "ignore", "inherit"] })
const body = readFileSync(join(out, "page.html"), "utf8")

/** A real 4:3 image, inline, so nothing leaves the machine. */
const PIC =
  "data:image/svg+xml;base64," +
  Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#8b5cf6"/></svg>').toString("base64")

const MEASURE = `
<script>
(function () {
  function heights() {
    var out = {}
    document.querySelectorAll("[data-type]").forEach(function (n) {
      out[n.getAttribute("data-type")] = Math.round(n.getBoundingClientRect().height)
    })
    return out
  }
  // Every image is broken to begin with: the src points nowhere.
  var before = heights()
  var imgs = Array.prototype.slice.call(document.querySelectorAll("img"))
  var left = imgs.length
  if (left === 0) { report(before, before) ; return }
  imgs.forEach(function (img) {
    img.addEventListener("load", done)
    img.addEventListener("error", done)
    img.src = ${JSON.stringify(PIC)}
  })
  function done() { if (--left <= 0) setTimeout(function () { report(before, heights()) }, 120) }
  function report(a, b) {
    var pre = document.createElement("pre"); pre.id = "result"
    pre.textContent = JSON.stringify({ before: a, after: b })
    document.body.append(pre)
  }
  setTimeout(function () { if (!document.getElementById("result")) report(before, heights()) }, 2500)
})()
</script>`

const WIDTH = Number(process.env.WIDTH ?? 1100)
const file = join(out, "index.html")
writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>
  body{margin:0;background:#e9eaee;font-family:Inter,system-ui,sans-serif}
  .probe{width:${WIDTH}px;margin:0 auto 18px;background:#fff;overflow:hidden}
  /* The src points nowhere to start with, which is a broken image. */
  img{}
</style></head><body>${body.replace(/src="[^"]*"/g, 'src="about:blank#broken"')}${MEASURE}</body></html>`)

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  `--window-size=${WIDTH + 80},1400`, "--virtual-time-budget=6000", "--run-all-compositor-stages-before-draw",
  "--dump-dom", `file://${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 128 * 1024 * 1024 })
const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("The page did not report.")
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
const { before, after } = JSON.parse(decode(m[1]))

const rows = Object.keys(before).map((type) => ({
  type,
  before: before[type],
  after: after[type],
  jump: after[type] - before[type],
}))
rows.sort((a, b) => Math.abs(b.jump) - Math.abs(a.jump))

console.log(`${rows.length} sections with images, at ${WIDTH}px:\n`)
for (const r of rows) {
  const mark = Math.abs(r.jump) === 0 ? "steady" : `${r.jump > 0 ? "+" : ""}${r.jump}px`
  console.log(`  ${r.type.padEnd(22)} ${String(r.before).padStart(5)} → ${String(r.after).padStart(5)}  ${mark}`)
}

const moved = rows.filter((r) => Math.abs(r.jump) > 0)
console.log(`\n${rows.length - moved.length} of ${rows.length} hold their height when the pictures arrive.`)
if (moved.length) {
  console.log(`These move:\n${moved.map((r) => `  ${r.type}: ${r.jump > 0 ? "+" : ""}${r.jump}px`).join("\n")}`)
}
