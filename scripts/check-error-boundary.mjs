/**
 * ===========================================================================
 *  ONE BROKEN SECTION DOES NOT TAKE THE PAGE
 * ===========================================================================
 * React unmounts the whole tree when a render throws and nothing catches it.
 * On a published page that is the site replaced by nothing; in the editor it
 * is the canvas and every unsaved change with it.
 *
 * Boundaries only run in a browser — server rendering does not use them — so
 * this renders a three-section page with react-dom/client in real Chromium,
 * with the middle section throwing, and looks at what survives.
 *
 *   pnpm build && node scripts/check-error-boundary.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(m); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const stubs = join(root, ".wb-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "link.jsx"), `import React from "react"\nexport default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }\n`)
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/"\nexport const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {} })\nexport const useSearchParams = () => new URLSearchParams()\n`)

const out = mkdtempSync(join(tmpdir(), "storelib-boundary-"))
const bundle = join(out, "probe.js")
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-boundary-probe.tsx"),
  "--bundle", "--format=iife", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
  "--define:process.env.NODE_ENV=\"production\"",
  `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@=${root}`],
  { stdio: ["ignore", "ignore", "inherit"] })

const page = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div id="editor"></div>
<div id="visitor"></div>
<script>${readFileSync(bundle, "utf8")}</script>
<script>
(function () {
  var threw = null
  try { window.mountProbe() } catch (e) { threw = String(e && e.message || e) }

export const useLinkStatus = () => ({ pending: false })
  setTimeout(function () {
    var ed = document.getElementById("editor")
    var vi = document.getElementById("visitor")
    var out = {
      mountThrew: threw,
      editor: {
        survivors: ed.querySelectorAll("[data-fine]").length,
        errorCards: ed.querySelectorAll("[data-section-error]").length,
        names: Array.prototype.map.call(ed.querySelectorAll("[data-section-error]"), function (n) { return n.textContent.slice(0, 60) }),
        hasRetry: !!ed.querySelector("[data-section-error] button"),
      },
      visitor: {
        survivors: vi.querySelectorAll("[data-fine]").length,
        errorCards: vi.querySelectorAll("[data-section-error]").length,
        text: vi.textContent.trim(),
      },
    }
    var pre = document.createElement("pre"); pre.id = "result"; pre.textContent = JSON.stringify(out); document.body.append(pre)
  }, 300)
})()
</script>
</body></html>`
const file = join(out, "index.html")
writeFileSync(file, page)

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=900,900", "--virtual-time-budget=4000", "--run-all-compositor-stages-before-draw",
  "--dump-dom", `file://${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 })
const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("The page did not report.")
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
const r = JSON.parse(decode(m[1]))

console.log(`  mount threw:            ${r.mountThrew ?? "no"}`)
console.log(`  editor:  ${r.editor.survivors} sections survived, ${r.editor.errorCards} error card(s), retry button: ${r.editor.hasRetry}`)
if (r.editor.names[0]) console.log(`           "${r.editor.names[0]}"`)
console.log(`  visitor: ${r.visitor.survivors} sections survived, ${r.visitor.errorCards} error card(s)`)
console.log(`           page text: "${r.visitor.text}"`)

const problems = []
if (r.mountThrew) problems.push(`the throw escaped the boundary: ${r.mountThrew}`)
if (r.editor.survivors !== 2) problems.push(`the editor kept ${r.editor.survivors} of the 2 working sections`)
if (r.editor.errorCards !== 1) problems.push(`the editor drew ${r.editor.errorCards} error cards, not 1`)
if (!/Accordion FAQ could not be drawn/.test(r.editor.names[0] ?? "")) problems.push("the editor's card does not name the section")
if (!/rows\.map/.test(r.editor.names[0] ?? "")) problems.push("the editor's card does not say what went wrong")
if (!r.editor.hasRetry) problems.push("no way to try the section again after fixing it")
if (r.visitor.survivors !== 2) problems.push(`a visitor kept ${r.visitor.survivors} of the 2 working sections`)
if (r.visitor.errorCards !== 0) problems.push("a visitor was shown an error card")
if (/could not be drawn|rows\.map/.test(r.visitor.text)) problems.push("a visitor was shown the error text")

if (problems.length) { console.error("\n" + problems.map((p) => `  ${p}`).join("\n")); process.exit(1) }
console.log("\na section that throws is one missing band for a visitor and one named card for the creator; the rest of the page is untouched")
