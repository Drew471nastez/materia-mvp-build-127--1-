/**
 * ===========================================================================
 *  HOW TALL THE CREATOR PAGE EDITOR'S BAR IS
 * ===========================================================================
 * "Make the top bar of the creator page editor a little bit reduced, just a
 *  little bit, not so much."
 *
 * A little bit is a number, so this measures it rather than judging it. The
 * bar's class string and its inline padding are read out of
 * components/app/creator-page-workspace, laid out with the real built
 * stylesheet, and the height reported.
 *
 * It also measures what MUST NOT shrink with it. The bar's height is padding
 * around a 36px control, and the cheap way to find pixels is to shrink the
 * control — on a surface used with a thumb, where 36px is already under the
 * 44px a finger wants. So the buttons are measured too, and the probe fails
 * if they lost anything.
 *
 *   pnpm build && node scripts/check-workspace-bar.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => {
  console.error(`\n  ${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(join(cssDir, f), "utf8"))
  .join("\n")

const src = readFileSync(join(root, "components/app/creator-page-workspace.tsx"), "utf8")
const pick = (re, what) => {
  const hit = src.match(re)?.[1]
  if (!hit) fail(`Could not find ${what} in creator-page-workspace.`)
  return hit
}

/* The bar, its top padding, and the two controls that set the floor. */
const barClass = pick(/className="(relative flex shrink-0 items-center gap-1\.5 bg-white[^"]+)"/, "the bar's classes")
const padTop = pick(/paddingTop: "calc\(env\(safe-area-inset-top, 0px\) \+ (\d+)px\)"/, "the bar's top padding")
const backClass = pick(/className="(inline-flex h-\d+ w-\d+ shrink-0 items-center justify-center rounded-lg text-\[#6b7280\][^"]+)"/, "the back button")
const shareClass = pick(/className="(inline-flex h-\d+ items-center gap-2 rounded-lg bg-\[#1a1a2e\][^"]+)"/, "the Share button")

console.log(`\n  top padding: ${padTop}px (plus the safe-area inset, which is 0 here)`)

const out = mkdtempSync(join(tmpdir(), "storelib-wsbar-"))
writeFileSync(
  join(out, "index.html"),
  `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
<style>html,body{margin:0;background:#f8f9fa;font-family:system-ui}</style></head>
<body><div id="r"></div><script>
var bar = document.createElement("div")
bar.className = ${JSON.stringify(barClass)}
bar.style.paddingTop = "calc(env(safe-area-inset-top, 0px) + ${padTop}px)"

var back = document.createElement("button")
back.className = ${JSON.stringify(backClass)}
back.textContent = "<"

var middle = document.createElement("div")
middle.className = "min-w-0 flex-1"
middle.innerHTML = '<p class="truncate text-[13px] font-semibold leading-tight text-[#1a1a2e]">AndrewRullz</p>' +
  '<p class="truncate text-[11px] leading-tight text-[#9ca3af]">storelib.com/andrewrullz</p>'

var share = document.createElement("button")
share.className = ${JSON.stringify(shareClass)}
share.textContent = "Share"

bar.appendChild(back)
bar.appendChild(middle)
bar.appendChild(share)
document.body.appendChild(bar)

var r = {
  bar: Math.round(bar.getBoundingClientRect().height),
  back: Math.round(back.getBoundingClientRect().height),
  share: Math.round(share.getBoundingClientRect().height),
  label: Math.round(middle.getBoundingClientRect().height),
}
document.getElementById("r").setAttribute("data-m", JSON.stringify(r))
</script></body></html>`,
)

const raw = execFileSync(
  CHROMIUM,
  ["--headless", "--disable-gpu", "--no-sandbox", "--window-size=1280,400",
   "--virtual-time-budget=4000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
)
const m = raw.match(/data-m="([^"]+)"/)
if (!m) fail("The probe page did not lay out, so nothing was measured.")
const r = JSON.parse(m[1].replace(/&quot;/g, '"'))

console.log(`  bar             ${r.bar}px`)
console.log(`  back button     ${r.back}px`)
console.log(`  Share button    ${r.share}px`)
console.log(`  the two lines   ${r.label}px\n`)

const problems = []

/**
 * WAS 52 (8 + 36 + 8). "A little bit" is a trim, not a redesign, so there is
 * a floor as well as a ceiling: below about 42 the controls would have to
 * shrink, and above 50 nothing was given back.
 */
if (r.bar > 50) problems.push(`the bar is ${r.bar}px; it was 52px and nothing was given back.`)
if (r.bar < 42) problems.push(`the bar is ${r.bar}px, which is past a trim — the controls must be shrinking.`)

/** The thing that must not have paid for it. */
if (r.back < 36) problems.push(`the back button is ${r.back}px, down from 36px. A thumb wants more, not less.`)
if (r.share < 36) problems.push(`the Share button is ${r.share}px, down from 36px.`)

/** And the bar still has to hold what it holds. */
if (r.bar < r.label + 2) problems.push(`the bar is ${r.bar}px and its two lines are ${r.label}px — the label does not fit.`)

if (problems.length) {
  console.error("")
  for (const p of problems) console.error(`  ${p}`)
  console.error("")
  process.exit(1)
}
console.log(`  ${52 - r.bar}px shorter, with both controls still 36px.\n`)
