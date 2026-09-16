/**
 * ===========================================================================
 *  HOW MUCH OF THE PAGE THE SHARE SHEET PAINTS OUT
 * ===========================================================================
 * "When I open the share modal it hides the top bar of the product page
 *  badly. I don't want it to hide it that drastically."
 *
 * The shared dialog scrim is `bg-black/50`: half the page painted flat grey,
 * the top bar with it. That weight belongs to a confirmation, where nothing
 * else should matter until you answer. A share sheet is a choice of where to
 * send a link, and the page it is about should still be legible behind it.
 *
 * This measures rather than asserts. It composites the REAL scrim colour over
 * a strip standing in for the bar — white, with the near-black label the bar
 * uses — and reports the contrast ratio that survives, for the default scrim
 * and for the share sheet's own.
 *
 * Both classes are read out of the source: the base from components/ui/dialog
 * and the override from components/product/share-button. So this measures
 * what ships, and moving either one moves the numbers.
 *
 *   pnpm build && node scripts/check-share-scrim.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(join(cssDir, f), "utf8"))
  .join("\n")

const read = (p) => readFileSync(join(root, p), "utf8")
const pick = (src, re, what) => {
  const hit = src.match(re)?.[1]
  if (!hit) fail(`Could not find ${what}.`)
  return hit
}

const dialog = read("components/ui/dialog.tsx")
const share = read("components/product/share-button.tsx")

/** The scrim every dialog gets, and the one this sheet asks for instead. */
const baseScrim = pick(dialog, /(bg-black\/\d+)/, "the dialog overlay's scrim class")
const shareScrim = pick(share, /overlayClassName="([^"]+)"/, "the share sheet's overlay class")

console.log(`\n  every dialog:  ${baseScrim}`)
console.log(`  share sheet:   ${shareScrim}\n`)

const out = mkdtempSync(join(tmpdir(), "storelib-scrim-"))
writeFileSync(
  join(out, "index.html"),
  `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
<style>html,body{margin:0;background:#fff;font-family:system-ui}
 .bar{position:relative;height:53px;background:#fff;color:#171717}
 .scrim{position:absolute;inset:0}</style></head>
<body><div id="r"></div><script>
var CASES = ${JSON.stringify([
    { name: "no sheet open", cls: "" },
    { name: "every dialog", cls: baseScrim },
    { name: "share sheet", cls: shareScrim },
  ])}
var rows = []
CASES.forEach(function (c) {
  var bar = document.createElement("div")
  bar.className = "bar"
  document.body.appendChild(bar)
  var scrim = document.createElement("div")
  if (c.cls) scrim.className = "scrim " + c.cls
  else scrim.className = "scrim"
  bar.appendChild(scrim)
  var cs = getComputedStyle(scrim)
  rows.push({ name: c.name, scrim: cs.backgroundColor })
})
document.getElementById("r").setAttribute("data-m", JSON.stringify(rows))
</script></body></html>`,
)

const raw = execFileSync(
  CHROMIUM,
  ["--headless", "--disable-gpu", "--no-sandbox", "--window-size=900,700",
   "--virtual-time-budget=4000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
)
const m = raw.match(/data-m="([^"]+)"/)
if (!m) fail("The probe page did not lay out, so nothing was measured.")
const rows = JSON.parse(m[1].replace(/&quot;/g, '"'))

/** sRGB relative luminance, and the WCAG contrast ratio between two colours. */
const lum = ([r, g, b]) => {
  const f = (v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const ratio = (a, b) => {
  const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)]
  return (hi + 0.05) / (lo + 0.05)
}
/** Paint `over` (rgba) onto `under` (opaque) and return the result. */
const composite = (under, over) => {
  const n = over.match(/[\d.]+/g)?.map(Number) ?? []
  if (n.length < 4) return under
  const a = n[3]
  return under.map((c, i) => Math.round(c * (1 - a) + n[i] * a))
}

const BAR_BG = [255, 255, 255]
const BAR_TEXT = [23, 23, 23]

const problems = []
const measured = {}
for (const r of rows) {
  const bg = composite(BAR_BG, r.scrim)
  const fg = composite(BAR_TEXT, r.scrim)
  const c = ratio(bg, fg)
  measured[r.name] = c
  console.log(
    `  ${r.name.padEnd(16)} scrim ${String(r.scrim).padEnd(22)} bar reads rgb(${bg.join(",")}) on rgb(${fg.join(",")})  contrast ${c.toFixed(2)}:1`,
  )
}

/**
 * 4.5:1 is the WCAG AA floor for body text. The bar behind a share sheet is
 * not something you are meant to read closely, but it should not have been
 * switched off either.
 */
const shareContrast = measured["share sheet"]
const baseContrast = measured["every dialog"]
if (!(shareContrast > 4.5)) {
  problems.push(`the bar behind the share sheet reads at ${shareContrast.toFixed(2)}:1, under the 4.5:1 floor.`)
}
/**
 * THE CONTROL, BUILT IN. A lighter scrim is only a claim if this probe can
 * see the heavier one. If the two come back the same, nothing was measured.
 */
if (!(shareContrast > baseContrast * 1.2)) {
  problems.push(
    `the share sheet's scrim (${shareContrast.toFixed(2)}:1) is not meaningfully lighter than every other dialog's (${baseContrast.toFixed(2)}:1).`,
  )
}

if (problems.length > 0) {
  console.error("")
  for (const p of problems) console.error(`  ${p}`)
  console.error("")
  process.exit(1)
}
console.log("\n  The page is still readable behind the share sheet.\n")
