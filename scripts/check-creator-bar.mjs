/**
 * ===========================================================================
 *  THE PRODUCT PAGE'S BAR ACTUALLY RENDERS
 * ===========================================================================
 * It shipped throwing before it could paint, and every product page showed
 * the error screen. TypeScript says exactly what was wrong — "Block-scoped
 * variable used before its declaration" — and `ignoreBuildErrors` means a
 * green build proves nothing about whether a component can run.
 *
 * So this mounts it behind an error boundary and reads what came out: the
 * crash if there is one, and otherwise the bar's contents — a back control, a
 * name, and none of the newsletter form it used to be.
 *
 *   pnpm build && node scripts/check-creator-bar.mjs
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

const stubs = join(root, ".wb-probe")
writeFileSync(join(stubs, "navigation-bar.js"), `export const usePathname = () => "/andrewrullz/a-product"
export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)

const out = mkdtempSync(join(tmpdir(), "storelib-bar-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-creator-bar.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:next/navigation=${join(stubs, "navigation-bar.js")}`,
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>body{margin:0}</style></head><body><div id="app"></div><script src="probe.js"></script>
<script>
setTimeout(function () {
  var crash = document.querySelector("[data-crash]")
  var bar = document.querySelector("[data-bar]")
  var backs = bar ? bar.querySelectorAll('a[aria-label="Back"]') : []
  var links = bar ? bar.querySelectorAll('a[href*="/u/"]') : []
  var pre = document.createElement("pre"); pre.id = "result"
  pre.textContent = JSON.stringify({
    crashed: crash ? crash.textContent : null,
    rendered: !!bar && bar.textContent.trim().length > 0,
    backControls: backs.length,
    creatorLinks: links.length,
    creatorHref: links.length ? links[0].getAttribute("href") : null,
    emailInputs: bar ? bar.querySelectorAll('input[type="email"]').length : -1,
    text: bar ? bar.textContent.trim().slice(0, 60) : null,
  })
  document.body.append(pre)
}, 700)
</script></body></html>`)

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=1280,300", "--virtual-time-budget=12000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 })
const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("The bar never reported — it did not even get as far as the probe.")
const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"))

const problems = []
if (r.crashed) {
  console.error(`\n  the bar threw: ${r.crashed}\n`)
  problems.push(`The bar throws instead of rendering. Every product page would show the error screen.`)
} else {
  console.log(`\n  it rendered: "${r.text}"`)
  console.log(`  back controls: ${r.backControls}   creator links: ${r.creatorLinks} → ${r.creatorHref}`)
  console.log(`  email inputs: ${r.emailInputs}\n`)
  if (!r.rendered) problems.push(`The bar rendered nothing at all.`)
  if (r.backControls < 1) problems.push(`There is no way back in the bar.`)
  if (r.creatorLinks < 1) problems.push(`Nothing in the bar leads to the creator's page.`)
  else if (r.creatorHref !== "/u/andrewrullz") problems.push(`The creator link is ${r.creatorHref}. It has to be /u/andrewrullz — the creator's PAGE. A <handle>.storelib.com address is the website they build, which is a different thing and may not even be published.`)
  if (r.emailInputs > 0) problems.push(`The bar still asks for an email address (${r.emailInputs} field(s)).`)
}

if (problems.length) {
  console.error(`${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  console.error("")
  process.exit(1)
}
console.log("The bar renders: a way back, the creator's name and page, and no newsletter form.\n")
