/**
 * ===========================================================================
 *  A LINK PICKER ON A PHONE, AND WHETHER A ROW CAN BE TAPPED
 * ===========================================================================
 * The report, three times: "I cannot select anything". The panel opens
 * correctly and the KEYBOARD covers it — both pickers autofocus their search
 * box, and in a bottom sheet the keyboard comes up over the list that has
 * just opened below the field.
 *
 * So two things are measured. Nothing takes focus when the panel opens at
 * phone width, which is what keeps the keyboard down. And the rows are on
 * screen and topmost at their own centres, which is the measurable form of
 * being able to tap one.
 *
 *   pnpm build && node scripts/check-field-panel.mjs
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

const out = mkdtempSync(join(tmpdir(), "storelib-fieldpanel-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-field-panel.tsx"),
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
window.addEventListener("error", function (e) {
  var pre = document.createElement("pre"); pre.id = "probe-error"
  pre.textContent = String(e.message) + " @ " + String(e.filename) + ":" + String(e.lineno)
  document.body.append(pre)
})
function boxOf(el) { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) } }
function topmostAt(el) {
  const r = el.getBoundingClientRect()
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  if (!hit) return "nothing"
  if (hit === el || el.contains(hit)) return "itself"
  return hit.tagName.toLowerCase() + "." + String(hit.className || "").slice(0, 30)
}
setTimeout(function () {
  const surface = document.querySelector("[data-mobile-bottom-sheet]")
  const scroller = document.getElementById("panel")
  const trigger = scroller.querySelector("button[aria-expanded]")
  /* Down at the field, the way somebody scrolling a section's settings
     arrives at it. */
  trigger.scrollIntoView({ block: "center" })
  const before = { sheet: boxOf(surface), scrollTop: Math.round(scroller.scrollTop), fields: scroller.querySelectorAll("button[aria-expanded]").length }
  trigger.click()
  setTimeout(function () {
    const kill = document.createElement("style")
    kill.textContent = "* { transition: none !important; animation: none !important; scroll-behavior: auto !important }"
    document.head.append(kill)
    void document.body.offsetHeight
    const panel = document.querySelector(".wb-field-panel")
    const rows = panel ? [...panel.querySelectorAll("[data-sheet-scroll] button")] : []
    const field = panel ? panel.querySelector("input") : null
    const result = {
      before,
      sheet: boxOf(surface),
      panel: panel ? boxOf(panel) : null,
      viewport: { h: window.innerHeight, w: window.innerWidth },
      /* THE ONE THAT MATTERS: nothing grabbed the keyboard. */
      focused: document.activeElement ? document.activeElement.tagName.toLowerCase() + (document.activeElement.getAttribute("placeholder") ? ":" + document.activeElement.getAttribute("placeholder").slice(0, 16) : "") : "none",
      searchAutofocused: !!field && document.activeElement === field,
      rowCount: rows.length,
      rows: rows.slice(0, 4).map((b) => ({ text: b.textContent.trim().slice(0, 14), ...boxOf(b), topmost: topmostAt(b) })),
      scrolledInto: Math.round(scroller.scrollTop) !== before.scrollTop,
    }
    const pre = document.createElement("pre"); pre.id = "result"; pre.textContent = JSON.stringify(result)
    document.body.append(pre)
  }, 500)
}, 700)
</script></body></html>`)

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=390,844", "--virtual-time-budget=14000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 })
const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) {
  const err = dom.match(/<pre id="probe-error">([\s\S]*?)<\/pre>/)
  if (err) fail(`The probe threw: ${err[1]}`)
  fail(`The panel never reported. Body held ${dom.length} characters.`)
}
const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))

const problems = []
if (r.before.fields < 1) problems.push("the panel under test has no link field in it")
if (!r.panel) problems.push("the picker did not open")
if (r.searchAutofocused) {
  problems.push("the search box took the keyboard, which covers the list that just opened")
}
if (r.rowCount < 3) problems.push(`the list has ${r.rowCount} rows`)
for (const row of r.rows) {
  if (row.top < 0 || row.bottom > r.viewport.h) problems.push(`"${row.text}" is off screen (${row.top}..${row.bottom} of ${r.viewport.h})`)
  else if (row.topmost !== "itself") problems.push(`"${row.text}" is covered by ${row.topmost}`)
}

console.log(`sheet            ${r.sheet.top}..${r.sheet.bottom} of ${r.viewport.h}px`)
console.log(`panel            ${r.panel ? `${r.panel.top}..${r.panel.bottom}, ${r.panel.h}px` : "none"}`)
console.log(`focused          ${r.focused}`)
console.log(`scrolled to it   ${r.scrolledInto}`)
for (const row of r.rows) console.log(`row              ${row.text.padEnd(14)} ${row.top}..${row.bottom}  topmost ${row.topmost}`)
if (problems.length) fail(problems.map((p) => `  - ${p}`).join("\n"))
console.log("\nNothing took the keyboard, and every row on the list can be tapped.")
