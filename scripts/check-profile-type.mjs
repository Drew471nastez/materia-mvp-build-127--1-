/**
 * ===========================================================================
 *  450 IS A REAL WEIGHT HERE, AND THE THREE LINES ARE A PIXEL BIGGER
 * ===========================================================================
 * Half a weight step only exists if the face has a weight axis. Inter arrives
 * through next/font with no weight list, which is the variable face — but
 * "should be" is not a measurement, and if it ever stops being one the class
 * silently rounds to 400 and the change is a pixel and nothing else.
 *
 * So the same string is set at 400, 450 and 500 and measured. A real axis
 * gives three widths that increase. A snapped one gives a tie.
 *
 *   pnpm build && node scripts/check-profile-type.mjs
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
/*
  THE FONT FILES HAVE TO RESOLVE, OR THIS MEASURES THE HARNESS.

  next/font writes `src: url(../media/<hash>.woff2)`, relative to the built
  stylesheet's own directory. Inlined into a page in a temp dir that path
  resolves to nothing, the face never loads, and every weight renders in
  whatever one face the container has — which is exactly the tie this probe
  reported the first time: 400, 450 and 500 all 375.64px wide, from a font
  with no axis because it was not Inter at all.

  The files are copied next to the page below; this points the CSS at them.
*/
const rawCss = [
  ...readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => join(cssDir, f)),
  ...(existsSync(join(root, ".next/static/css"))
    ? readdirSync(join(root, ".next/static/css")).filter((f) => f.endsWith(".css")).map((f) => join(root, ".next/static/css", f))
    : []),
].map((f) => readFileSync(f, "utf8")).join("\n")
const css = rawCss.replace(/url\(\.\.\/media\//g, "url(./")

/* The built font files, served next to the page so the variable face is the
   one actually being measured rather than a system fallback. */
const fontDir = join(root, ".next/static/media")
const fonts = existsSync(fontDir) ? readdirSync(fontDir).filter((f) => /\.(woff2?|ttf)$/.test(f)) : []

const out = mkdtempSync(join(tmpdir(), "storelib-type-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-profile-type.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><script>window.__err=[];addEventListener("error",function(e){window.__err.push(String(e.message))})</script><div id="app"></div><script src="probe.js"></script>
<script>
async function run() {
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready } catch (e) {} }
  await new Promise(function (r) { setTimeout(r, 400) })
  var ladder = []
  document.querySelectorAll("[data-weight]").forEach(function (el) {
    ladder.push({ weight: Number(el.getAttribute("data-weight")), width: Math.round(el.getBoundingClientRect().width * 100) / 100, computed: getComputedStyle(el).fontWeight })
  })
  var tabs = []
  document.querySelectorAll("[data-tab]").forEach(function (el) {
    tabs.push({ tab: el.getAttribute("data-tab"), weight: getComputedStyle(el).fontWeight, width: Math.round(el.getBoundingClientRect().width * 100) / 100 })
  })
  var lines = []
  document.querySelectorAll("[data-line]").forEach(function (el) {
    var cs = getComputedStyle(el)
    lines.push({ line: el.getAttribute("data-line"), size: cs.fontSize, weight: cs.fontWeight })
  })
  var pre = document.createElement("pre"); pre.id = "result"
  pre.textContent = JSON.stringify({ ladder: ladder, lines: lines, tabs: tabs, errors: window.__err })
  document.body.append(pre)
}
run()
</script></body></html>`)

/* next/font names its files with a content hash; copying them next to the page
   is what lets the page use the real face instead of a system stand-in. */
for (const f of fonts) writeFileSync(join(out, f), readFileSync(join(fontDir, f)))

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=900,700", "--force-device-scale-factor=1", "--virtual-time-budget=12000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 })
const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("Nothing reported. The probe threw before it could answer.")
const p = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))
if (p.errors?.length) fail(`it threw: ${p.errors.join(" | ")}`)
console.log(JSON.stringify(p, null, 2))

const problems = []
const w = (n) => p.ladder.find((x) => x.weight === n)
const [a, b, c, d] = [w(400), w(450), w(500), w(530)]
if (!a || !b || !c || !d) problems.push("the weight ladder did not render.")
else {
  /* Every weight the product uses has to be a real one, not a round. */
  if (!(c.width < d.width)) problems.push(`530 is no heavier than 500 (${d.width} vs ${c.width}) — the selected tab's half step does nothing.`)
  if (b.computed !== "450") problems.push(`450 computes as ${b.computed}, so the declaration is not reaching the text.`)
  /* THE QUESTION. A real axis makes 450 strictly between 400 and 500. */
  if (!(b.width > a.width)) problems.push(`450 is no wider than 400 (${b.width} vs ${a.width}) — the face has no weight axis here and the half step does nothing.`)
  if (!(b.width < c.width)) problems.push(`450 is not lighter than 500 (${b.width} vs ${c.width}) — it has snapped to the heavier end.`)
}

const rest = (p.tabs ?? []).find((t) => t.tab === "rest")
const sel = (p.tabs ?? []).find((t) => t.tab === "selected")
if (!rest || !sel) problems.push("the tab row did not render.")
else {
  if (rest.weight !== "450") problems.push(`an unselected tab is weight ${rest.weight}, not 450.`)
  if (sel.weight !== "530") problems.push(`the selected tab is weight ${sel.weight}, not 530.`)
  /* And the selected one still reads as the selected one. */
  if (!(sel.width > rest.width * 0.2)) problems.push("the tabs did not render text.")
}

for (const l of p.lines) {
  if (l.size !== "13px") problems.push(`the ${l.line} is ${l.size}, not the 13px it was set to.`)
  if (l.weight !== "450") problems.push(`the ${l.line} is weight ${l.weight}, not 450.`)
}

if (problems.length) fail(problems.map((x) => `  - ${x}`).join("\n"))
console.log("\n450 and 530 are real weights here. The three lines carry 450 at 13px, and the tabs carry both.\n")
