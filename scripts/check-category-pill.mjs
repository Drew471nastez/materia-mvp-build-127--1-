/**
 * ===========================================================================
 *  THE PILL YOU ARE ON: A SHADE DARKER, AND PRESSED IN
 * ===========================================================================
 * "A tiny bit darker so the selected state is immediately obvious without
 * becoming a big visual block" is two numbers, not an opinion: how far the
 * selected fill sits from the unselected one, and how far it sits from black.
 * The depth is a third — an inset shadow, and a subtle one.
 *
 * So this renders both pills against the real production stylesheet and
 * measures them.
 *
 *   pnpm build && node scripts/check-category-pill.mjs
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
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

/* The classes come out of the source, so the probe cannot drift from the page. */
const src = readFileSync(join(root, "components/explore/explore-page-client.tsx"), "utf8")
const rowAt = src.indexOf("shrink-0 px-3.5 py-2 rounded-full")
if (rowAt < 0) fail("Could not find the category pill row in explore-page-client.tsx.")
const block = src.slice(rowAt - 200, rowAt + 900)
const base = block.match(/className=\{`([^`]*?)\$\{/)?.[1]?.trim()
const branches = [...block.matchAll(/[?:]\s*"([^"]*(?:bg-|text-)[^"]*)"/g)].map((m) => m[1])
if (!base || branches.length < 2) fail("Could not read the pill class strings.")
const [selected, unselected] = branches

const out = mkdtempSync(join(tmpdir(), "storelib-pill-"))
writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8">
<style>${css}</style><style>body{margin:0;padding:24px;background:#f8f9fa;font-family:Inter,sans-serif}</style>
</head><body>
<button id="on" class="${base} ${selected}">Design</button>
<button id="off" class="${base} ${unselected}">Photography</button>
<script>
function read(id) {
  var cs = getComputedStyle(document.getElementById(id))
  return { bg: cs.backgroundColor, fg: cs.color, border: cs.borderTopColor, shadow: cs.boxShadow, transition: cs.transitionProperty }
}
setTimeout(function () {
  var pre = document.createElement("pre"); pre.id = "result"
  pre.textContent = JSON.stringify({ on: read("on"), off: read("off") })
  document.body.append(pre)
}, 300)
</script></body></html>`)

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=800,300", "--virtual-time-budget=6000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 })
const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("The pills never reported.")
const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"))

const rgb = (s) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
const lum = (s) => { const [a, b, c] = rgb(s); return 0.2126 * lin(a) + 0.7152 * lin(b) + 0.0722 * lin(c) }
const contrast = (x, y) => { const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05) }

const onL = lum(r.on.bg)
const offL = lum(r.off.bg)
const drop = offL - onL                     /* how much darker than an unselected pill */
const textContrast = contrast(r.on.fg, r.on.bg)
/* Tailwind stacks four transparent placeholder layers ahead of the real ones,
   so the first rgba() in the string is always alpha 0. Take the darkest inset
   layer instead. */
const insetLayers = r.on.shadow.split(/,(?![^(]*\))/).map((s) => s.trim()).filter((s) => /inset/.test(s))
const shadowAlpha = Math.max(0, ...insetLayers
  .filter((l) => /rgba\(\s*(?:15|0)\b/.test(l))
  .map((l) => Number(l.match(/rgba?\([^)]*?,\s*([\d.]+)\)/)?.[1] ?? 0)))

const problems = []
if (!(drop > 0.02)) problems.push(`the selected pill is not visibly darker than an unselected one (luminance drop ${drop.toFixed(3)}, wanted > 0.02)`)
if (!(drop < 0.35)) problems.push(`the selected pill is a block, not a shade (luminance drop ${drop.toFixed(3)}, wanted < 0.35)`)
if (!(onL > 0.45)) problems.push(`the selected fill is too dark to read as grey (luminance ${onL.toFixed(3)}, wanted > 0.45)`)
if (!(textContrast >= 4.5)) problems.push(`the label is not legible on the selected fill (contrast ${textContrast.toFixed(2)}:1, wanted >= 4.5)`)
if (!/inset/.test(r.on.shadow)) problems.push(`the selected pill has no inset depth (box-shadow: ${r.on.shadow})`)
if (!(shadowAlpha > 0 && shadowAlpha <= 0.2)) problems.push(`the depth is not subtle (shadow alpha ${shadowAlpha}, wanted 0 < a <= 0.2)`)
if (r.off.shadow !== "none") problems.push(`an unselected pill should stay flat (box-shadow: ${r.off.shadow})`)
if (!/box-shadow/.test(r.on.transition)) problems.push(`box-shadow is not in the transition, so the depth snaps (${r.on.transition})`)

console.log(`selected   bg ${r.on.bg}  luminance ${onL.toFixed(3)}  text ${textContrast.toFixed(2)}:1`)
console.log(`unselected bg ${r.off.bg}  luminance ${offL.toFixed(3)}`)
console.log(`darker by  ${drop.toFixed(3)}   shadow ${r.on.shadow}`)
if (problems.length) fail(problems.map((p) => `  - ${p}`).join("\n"))
console.log("\nThe pill you are on is a shade darker, pressed in, and still readable.")
