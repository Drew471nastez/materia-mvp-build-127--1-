/**
 * ===========================================================================
 *  CAN YOU READ THE LABEL ON THE BUTTON
 * ===========================================================================
 * Every section's buttons, laid out by real Chromium with the theme's own
 * stylesheet, and the contrast between each label and the background it is
 * actually painted on. Plus three hand-written controls: a section that sets
 * a button's background and forgets its label (the mistake), one that paints
 * both (which must be left alone), and a link inside a sentence (which must
 * not be turned into a button).
 *
 *   pnpm build && node scripts/check-buttons.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(m); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const stubs = join(root, ".wb-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "link.jsx"), `import React from "react"\nexport default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }\n`)
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/"\nexport const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {} })\nexport const useSearchParams = () => new URLSearchParams()\n`)

const out = mkdtempSync(join(tmpdir(), "storelib-btn-"))
const bundle = join(out, "probe.js")
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-button-probe.tsx"),
  "--bundle", "--platform=node", "--format=cjs", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@=${root}`],
  { stdio: ["ignore", "ignore", "inherit"] })
execFileSync("node", [bundle], { env: { ...process.env, OUT_DIR: out }, stdio: ["ignore", "ignore", "inherit"] })
const PIC = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#8b5cf6"/></svg>').toString("base64")
const body = readFileSync(join(out, "page.html"), "utf8").replace(/src="https:\/\/example\.invalid\/[^"]*"/g, `src="${PIC}"`)

const MEASURE = `
<script>
(function () {
  function parse(c) {
    var m = /^rgba?\\(([^)]+)\\)/.exec(c); if (!m) return null
    var p = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number)
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }

export const useLinkStatus = () => ({ pending: false })
  }
  function lum(c) { function ch(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)} return 0.2126*ch(c.r)+0.7152*ch(c.g)+0.0722*ch(c.b) }
  function over(fg,bg){ if(fg.a>=1) return fg; return {r:fg.r*fg.a+bg.r*(1-fg.a),g:fg.g*fg.a+bg.g*(1-fg.a),b:fg.b*fg.a+bg.b*(1-fg.a),a:1} }
  function ratio(a,b){ var la=lum(a),lb=lum(b); return (Math.max(la,lb)+0.05)/(Math.min(la,lb)+0.05) }
  function behind(el){
    var n = el
    while (n && n !== document.documentElement) {
      var s = getComputedStyle(n)
      if (s.backgroundImage && s.backgroundImage !== "none") return null
      var c = parse(s.backgroundColor)
      if (c && c.a > 0) {
        if (c.a >= 1) return c
        var u = behind(n.parentElement); if (!u) return null
        return over({ r:c.r, g:c.g, b:c.b, a:c.a }, u)
      }
      n = n.parentElement
    }
    return { r: 255, g: 255, b: 255, a: 1 }
  }
  var report = {}
  document.querySelectorAll(".probe").forEach(function (probe) {
    var rows = []
    probe.querySelectorAll("button, a[href]").forEach(function (el) {
      var label = (el.textContent || "").trim()
      if (!label) return
      var r = el.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) return
      var s = getComputedStyle(el)
      var fg = parse(s.color), bg = behind(el)
      if (!fg || !bg) return
      var own = parse(s.backgroundColor)
      rows.push({
        label: label.slice(0, 24),
        cls: (el.className || "").toString().slice(0, 40),
        tag: el.tagName.toLowerCase(),
        filled: !!(own && own.a > 0.05),
        color: s.color,
        bg: s.backgroundColor,
        ratio: Math.round(ratio(over(fg, bg), bg) * 100) / 100,
      })
    })
    if (rows.length) report[probe.getAttribute("data-type")] = rows
  })
  var pre = document.createElement("pre"); pre.id = "result"
  pre.textContent = JSON.stringify(report)
  document.body.append(pre)
})()
</script>`

const file = join(out, "i.html")
writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>
  body{margin:0;background:#fff;font-family:Inter,system-ui,sans-serif}
  .probe{width:1100px;margin:0 auto}
</style></head><body>${body}${MEASURE}</body></html>`)
const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=1140,1400", "--virtual-time-budget=8000", "--run-all-compositor-stages-before-draw",
  "--dump-dom", `file://${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 })
const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("The page did not report.")
const report = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))

const AA = 4.5
/**
 * THE PROBE'S OWN BREAK-TEST. `__forgot_the_label__` is a hand-written
 * section that fills a button and never says what colour the label is, and
 * it is here to FAIL: a run in which it passes is a run that has stopped
 * measuring. It is not a finding, because no shipped section is it.
 */
const CONTROL_MUST_FAIL = "__forgot_the_label__"
const unreadable = []
let buttons = 0
let controlFailed = false
for (const [type, rows] of Object.entries(report)) {
  for (const r of rows) {
    buttons++
    if (r.ratio >= AA - 0.01) continue
    if (type === CONTROL_MUST_FAIL) { controlFailed = true; continue }
    unreadable.push({ type, ...r })
  }
}

console.log(`${buttons} buttons and links across ${Object.keys(report).length} sections.\n`)
for (const name of ["__forgot_the_label__", "__painted_both__", "__a_link_in_a_sentence__"]) {
  const rows = report[name]
  if (!rows) { console.log(`  ${name}: NOT RENDERED`); continue }
  for (const r of rows) console.log(`  ${name.padEnd(26)} "${r.label}" ${r.color} on ${r.bg} — ${r.ratio}:1${r.filled ? " (filled)" : ""}`)
}

console.log(
  unreadable.length === 0
    ? `\nEvery label in every section clears ${AA}:1 against what it is painted on.`
    : `\n${unreadable.length} unreadable:\n${unreadable.map((u) => `  ${u.type}: "${u.label}" ${u.ratio}:1 (${u.color} on ${u.bg})`).join("\n")}`,
)
console.log(
  controlFailed
    ? "The control that fills a button and forgets its label still reads as unreadable, so this is measuring."
    : "SELF-TEST FAILED: the control that should be unreadable was not caught.",
)
if (unreadable.length || !controlFailed) process.exit(1)
