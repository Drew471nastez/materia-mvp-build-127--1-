/**
 * ===========================================================================
 *  THE BAR SURVIVES BEING HYDRATED
 * ===========================================================================
 * A component that bails out early on its first render and declares a hook
 * after that bail renders a different number of hooks the second time, and
 * React throws #310. That is not visible in a diff, it does not fail a type
 * check, and it does not fail a build: the file compiles perfectly and the
 * page dies in the browser. It took the creator page down in production.
 *
 * So the check is to actually mount it and look, which is the only thing
 * that runs the two renders in order.
 *
 *   pnpm build && node scripts/check-bar-hydrate.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const out = mkdtempSync(join(tmpdir(), "storelib-hydrate-"))
const stubs = join(root, ".hydrate-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/u/andrew-rullz"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)

const PROBE = `<script>
async function run() {
  await new Promise(function (r) { setTimeout(r, 600) })
  var app = document.getElementById("app")
  var result = {
    errors: (window.__errors || []).slice(0, 6),
    boundaryTripped: !!app.querySelector('[data-failed="1"]'),
    /* Rendered something real, rather than having quietly rendered nothing. */
    rendered: app.querySelectorAll("input,button").length,
  }
  var pre = document.createElement("pre"); pre.id = "out"; pre.textContent = JSON.stringify(result); document.body.append(pre)
}
if (document.readyState === "complete") run(); else addEventListener("load", run)
</script>`

execFileSync("npx", [
  "esbuild", join(root, "scripts/render-bar-hydrate.tsx"),
  "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`,
  `--alias:next/navigation=${join(stubs, "navigation.js")}`,
  `--alias:@=${root}`,
  "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl",
  "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--log-level=error",
], { cwd: root, stdio: "inherit" })

const file = join(out, "index.html")
writeFileSync(file,
  `<!doctype html><html class="light"><head><meta charset="utf-8"><style>${css}</style>` +
  `<style>body{margin:0}</style></head><body><div id="app"></div>` +
  `<script>${readFileSync(join(out, "probe.js"), "utf8")}</script>${PROBE}</body></html>`)

const dom = execFileSync(CHROMIUM,
  ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
   "--window-size=390,844", "--virtual-time-budget=10000", "--dump-dom", `file://${file}`],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] })
const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)
if (!m) fail("Nothing reported. The probe did not run.")
const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got ?? ""}`}`)
  if (!ok) broken++
}

console.log("\nthe subscribe bar hydrates without taking the page with it")
expect(r.boundaryTripped === false, "nothing was caught by an error boundary", r.errors.join(" | "))
expect(!r.errors.some((e) => /Rendered more hooks|Minified React error #310|#310/.test(e)),
  "no hook-order error", r.errors.join(" | "))
expect(r.errors.length === 0, "and no error at all", r.errors.join(" | "))
expect(r.rendered > 0, "the bar really drew itself, it did not render nothing", r.rendered)

console.log(broken === 0
  ? "\nIt mounts, it hydrates, it stays up.\n"
  : `\n${broken} measured wrong.\n`)
process.exit(broken === 0 ? 0 : 1)
