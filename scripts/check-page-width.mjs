/**
 * ===========================================================================
 *  ONE COLUMN, OR THE PAGE DOES NOT FLOW
 * ===========================================================================
 * Reported with a picture and two lines drawn on it: the tab strip and the
 * products under it start further in than "About <creator>" does, so the
 * page has two left edges and the eye finds both.
 *
 * The same complaint was made about the product page once, and the note left
 * behind then says it best: three pieces of code, three ideas of how wide the
 * page is, and "nothing flowed together". Here it was 1100 for the tabs and
 * the grid against 1180 for About and the reviews.
 *
 * So this measures the left and right edge of each landmark on one document
 * at a wide window, where the caps actually bite, and at a narrow one, where
 * they do not and only the padding shows.
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

const out = mkdtempSync(join(tmpdir(), "storelib-width-"))
/* The grid links with next/link and asks next/navigation for a router, and
   neither exists outside an app. Stubbed rather than avoided: the point is to
   measure the real component. */
const stubs = join(root, ".width-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-page-width.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:next/link=${join(stubs, "link.jsx")}`,
  `--alias:next/navigation=${join(stubs, "navigation.js")}`,
  `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

writeFileSync(join(out, "index.html"), `<!doctype html><html class="light"><head><meta charset="utf-8">
<style>${css}</style><style>body{margin:0;background:#f8f9fa}</style>
</head><body><div id="root"></div>
<script>window.addEventListener("error", function (e) { window.__err = String(e.message) })</script>
<script>${readFileSync(join(out, "probe.js"), "utf8")}</script>
<script>
setTimeout(function () {
  function edges(el) {
    if (!el) return null
    var r = el.getBoundingClientRect()
    return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) }
  }
  function byText(sel, re) {
    var all = document.querySelectorAll(sel)
    for (var i = 0; i < all.length; i++) if (re.test(all[i].textContent || "")) return all[i]
    return null
  }
  var result = {
    viewport: window.innerWidth,
    rootChildren: document.getElementById("root").children.length,
    sample: (document.getElementById("root").textContent || "").slice(0, 120),
    error: window.__err || null,
    /*
      THE WORDS, NOT THE BOXES.

      The report drew a line from the "Home" tab down to "About <creator>",
      which is a comparison of where the TEXT starts. Measuring the columns
      instead compares a border box against a text run and calls a padding
      difference an alignment, which is how the first version of this passed
      a page that was visibly out by eight pixels.
    */
    tabStrip: edges(byText("button, a", /^Home$/)),
    /* The "Products" heading of the grid, and the pill at the other end. */
    gridHeading: edges(byText("h2, h1, h3", /^Products$/)),
    /* The About heading, which is the column the report used as the ruler. */
    aboutHeading: edges(byText("h2, h3", /^About /)),
    paymentHeading: edges(byText("h4", /^Accepted payment methods$/)),
  }
  var pre = document.createElement("pre"); pre.id = "result"
  pre.textContent = JSON.stringify(result); document.body.append(pre)
}, 900)
</script></body></html>`)

const WIDTHS = [1440, 900]
const problems = []
for (const w of WIDTHS) {
  const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    `--window-size=${w},1000`, "--virtual-time-budget=10000", "--dump-dom", `file://${join(out, "index.html")}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 })
  const found = [...dom.matchAll(/<pre id="result">([\s\S]*?)<\/pre>/g)]
  if (!found.length) fail(`Nothing reported at ${w}px.`)
  const r = JSON.parse(found[found.length - 1][1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"))

  console.log(`\nAt ${r.viewport}px (root has ${r.rootChildren} children${r.error ? ", error: " + r.error : ""})`)
  if (process.env.DEBUG) console.log("  sample:", JSON.stringify(r.sample))
  const rows = [
    ["the tab strip", r.tabStrip],
    ["the products heading", r.gridHeading],
    ["the About heading", r.aboutHeading],
    ["the payment heading", r.paymentHeading],
  ]
  for (const [label, box] of rows) {
    if (!box) { problems.push(`${label} was not on the page at ${r.viewport}px`); continue }
    console.log(`  ${label.padEnd(22)} ${String(box.left).padStart(4)} .. ${String(box.right).padStart(4)}`)
  }

  /* Every landmark starts on the same line. The right edge is not compared:
     a heading is as wide as its words. */
  const lefts = rows.filter(([, b]) => b).map(([label, b]) => [label, b.left])
  const base = lefts.length ? lefts[0][1] : 0
  for (const [label, left] of lefts) {
    if (Math.abs(left - base) > 1) {
      problems.push(`at ${r.viewport}px ${label} starts at ${left} and ${lefts[0][0]} starts at ${base} — ${Math.abs(left - base)}px apart`)
    }
  }
}

console.log("")
if (problems.length) fail(problems.map((p) => `  - ${p}`).join("\n"))
console.log("Every landmark on the creator page starts on the same line.\n")
