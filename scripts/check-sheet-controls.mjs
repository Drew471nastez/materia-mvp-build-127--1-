/**
 * ===========================================================================
 *  EVERY CONTROL IN THE SHEET, MEASURED AT A THUMB
 * ===========================================================================
 * The sheet's controls were drawn for the desktop sidebar: 9px labels in
 * capitals, 36px fields, a 21px slider thumb, and an empty image box with
 * the aspect of a video — about 200px of dashed nothing in a sheet that
 * shows 500.
 *
 * Apple's own guidance is 44pt for anything a finger has to hit, and iOS
 * zooms the whole page for a focused field under 16px and does not zoom
 * back. Both are numbers, so both are measured here rather than eyeballed.
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

const out = mkdtempSync(join(tmpdir(), "storelib-sheetctl-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-sheet-controls.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8">
<style>${css}</style>
<style>body { margin: 0; background: #e5e7eb; }</style>
</head><body>
<div id="root"></div>
<script src="probe.js"></script>
<script>
setTimeout(function () {
  function m(el) {
    if (!el) return null
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return { h: Math.round(r.height), w: Math.round(r.width), font: Math.round(parseFloat(cs.fontSize)) }
  }
  const slider = document.querySelector("[data-slot='slider']")
  const result = {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    text: m(document.getElementById("text-field")),
    number: m(document.getElementById("number-field")),
    label: m(document.querySelector("label")),
    sliderRow: m(slider),
    thumb: m(document.querySelector("[data-slot='slider-thumb']")),
    track: m(document.querySelector("[data-slot='slider-track']")),
    dropzone: m(document.getElementById("dropzone")),
    dropzoneHint: (function () {
      const ps = document.querySelectorAll("#dropzone p")
      const hint = ps[ps.length - 1]
      return hint ? getComputedStyle(hint).display : "missing"
    })(),
  }
  const pre = document.createElement("pre"); pre.id = "result"; pre.textContent = JSON.stringify(result)
  document.body.append(pre)
}, 900)
</script></body></html>`)

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=390,844", "--virtual-time-budget=10000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 })
const m2 = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m2) fail("The controls never reported.")
const r = JSON.parse(m2[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"))

const problems = []
const need = (what, got, min, why) => { if (!(got >= min)) problems.push(`${what} is ${got}, wanted ${min} or more — ${why}`) }

need("a text field", r.text.h, 44, "44pt is the smallest thing a finger hits reliably")
need("its type", r.text.font, 16, "iOS zooms the page for a focused field under 16px and does not zoom back")
need("the number box beside a slider", r.number.h, 40, "it is a target, not a caption")
need("its type", r.number.font, 15, "12px in a sheet is a caption you squint at")
need("a field's label", r.label.font, 13, "9px capitals are for a sidebar, not a phone")
need("the slider's own row", r.sliderRow.h, 44, "the area that answers a finger, not the line that is drawn")
need("the slider thumb", r.thumb.h, 26, "21px is a cursor's target")
if (r.dropzone.h > 80) problems.push(`the empty image box is ${r.dropzone.h}px of a ${r.viewport.h}px window — it was a third of the sheet`)
if (r.dropzone.h < 44) problems.push(`the empty image box is only ${r.dropzone.h}px, which is too small to hit`)
if (r.dropzoneHint !== "none") problems.push(`"drag and drop" is still shown (${r.dropzoneHint}); it is not advice for a touchscreen`)

console.log(`text field    ${r.text.h}px tall, ${r.text.font}px type`)
console.log(`number box    ${r.number.h}px tall, ${r.number.w}px wide, ${r.number.font}px type`)
console.log(`label         ${r.label.font}px`)
console.log(`slider        row ${r.sliderRow.h}px, track ${r.track.h}px, thumb ${r.thumb.h}px`)
console.log(`image box     ${r.dropzone.h}px, hint display ${r.dropzoneHint}`)
if (problems.length) fail(problems.map((p) => `  - ${p}`).join("\n"))
console.log("\nEverything in the sheet is sized for a thumb, and the empty image box is a row.")
