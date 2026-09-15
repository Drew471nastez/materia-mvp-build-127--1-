/**
 * ===========================================================================
 *  THE ACCESSIBILITY BASELINE, MEASURED IN A BROWSER
 * ===========================================================================
 * Not a linter reading the source. Every section the library can add is
 * rendered as it would be added, laid out by real Chromium at a desktop
 * width and again at a phone width, and then four questions are asked of
 * what is actually on the screen:
 *
 *   1. Does every picture say what it is, or say that it is decoration?
 *   2. Can every link and button be named out loud?
 *   3. Is the text readable against what is behind it? (WCAG AA: 4.5:1,
 *      or 3:1 once the type is large.)
 *   4. Would a thumb hit the buttons? (44px, the size Apple and the WCAG
 *      target-size rule both settle on.)
 *
 * Where the answer cannot be known — text over a photograph, a gradient —
 * it says so rather than guessing, and those are counted separately.
 *
 *   pnpm build && node scripts/check-a11y.mjs
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

const out = mkdtempSync(join(tmpdir(), "storelib-a11y-"))
const bundle = join(out, "probe.js")
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-a11y-probe.tsx"),
  "--bundle", "--platform=node", "--format=cjs", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@=${root}`],
  { stdio: ["ignore", "ignore", "inherit"] })
execFileSync("node", [bundle], { env: { ...process.env, OUT_DIR: out }, stdio: ["ignore", "ignore", "inherit"] })
const body = readFileSync(join(out, "page.html"), "utf8")

/** A real picture of a known shape, inline, so nothing leaves the machine. */
const PIC = "data:image/svg+xml;base64," +
  Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#8b5cf6"/></svg>').toString("base64")

const MEASURE = `
<script>
(function () {
  // ── colour ──────────────────────────────────────────────────────────────
  function parse(c) {
    var m = /^rgba?\\(([^)]+)\\)/.exec(c)
    if (!m) return null
    var p = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number)
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }

export const useLinkStatus = () => ({ pending: false })
  }
  function lum(c) {
    function ch(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b)
  }
  function ratio(a, b) {
    var la = lum(a), lb = lum(b)
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
  }
  function over(fg, bg) {
    // Semi-transparent text is composited onto what is behind it.
    if (fg.a >= 1) return fg
    return { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 }
  }
  /** What is behind this element, or null when a picture or a gradient is. */
  function behind(el) {
    var n = el
    while (n && n !== document.documentElement) {
      var s = getComputedStyle(n)
      if (s.backgroundImage && s.backgroundImage !== "none") return null
      var c = parse(s.backgroundColor)
      if (c && c.a > 0) {
        if (c.a >= 1) return c
        var under = behind(n.parentElement)
        if (!under) return null
        return over({ r: c.r, g: c.g, b: c.b, a: c.a }, under)
      }
      n = n.parentElement
    }
    return { r: 255, g: 255, b: 255, a: 1 }
  }

  // ── accessible name, near enough ────────────────────────────────────────
  function named(el) {
    if ((el.getAttribute("aria-label") || "").trim()) return true
    var by = el.getAttribute("aria-labelledby")
    if (by) { var t = document.getElementById(by.split(/\\s+/)[0]); if (t && (t.textContent || "").trim()) return true }
    if ((el.getAttribute("title") || "").trim()) return true
    if ((el.textContent || "").trim()) return true
    var img = el.querySelector("img[alt]")
    if (img && (img.getAttribute("alt") || "").trim()) return true
    var svg = el.querySelector("svg > title")
    if (svg && (svg.textContent || "").trim()) return true
    return false
  }

  function ownText(el) {
    var t = ""
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i]
      if (n.nodeType === 3) t += n.nodeValue
    }
    return t.trim()
  }

  var report = {}
  document.querySelectorAll(".probe").forEach(function (probe) {
    var type = probe.getAttribute("data-type")
    var r = { images: [], unnamed: [], contrast: [], unknownContrast: 0, small: [], headings: [] }

    probe.querySelectorAll("img").forEach(function (img) {
      if (!img.hasAttribute("alt")) r.images.push(img.getAttribute("data-alt-of") || img.className || "img")
    })

    probe.querySelectorAll("a, button, [role=button], [role=link]").forEach(function (el) {
      if (el.hasAttribute("aria-hidden")) return
      if (!named(el)) r.unnamed.push(el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(/\\s+/)[0] : ""))
    })

    probe.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach(function (h) {
      if ((h.textContent || "").trim()) r.headings.push(Number(h.tagName[1]))
    })

    probe.querySelectorAll("*").forEach(function (el) {
      var text = ownText(el)
      if (!text) return
      var s = getComputedStyle(el)
      if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return
      var rect = el.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return
      var fg = parse(s.color)
      var bg = behind(el)
      if (!fg) return
      if (!bg) { r.unknownContrast++; return }
      var size = parseFloat(s.fontSize)
      var weight = Number(s.fontWeight) || 400
      var large = size >= 24 || (size >= 18.66 && weight >= 700)
      var need = large ? 3 : 4.5
      var got = ratio(over(fg, bg), bg)
      if (got < need - 0.01) {
        r.contrast.push({ text: text.slice(0, 40), got: Math.round(got * 100) / 100, need: need, size: Math.round(size), color: s.color })
      }
    })

    probe.querySelectorAll("a, button, [role=button]").forEach(function (el) {
      var s = getComputedStyle(el)
      // Inline links inside a sentence are exempt: the rule is about
      // controls, and a word in a paragraph cannot be 44px tall.
      if (s.display === "inline") return
      var rect = el.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      if (rect.height < 44 || rect.width < 24) {
        r.small.push({ label: (el.textContent || "").trim().slice(0, 24) || el.tagName.toLowerCase(), w: Math.round(rect.width), h: Math.round(rect.height) })
      }
    })

    report[type] = r
  })

  var pre = document.createElement("pre"); pre.id = "result"
  pre.textContent = JSON.stringify(report)
  document.body.append(pre)
})()
</script>`

/**
 * A probe that reports nothing has either found nothing or measured nothing,
 * and from the outside those look identical. `--selftest` appends a section
 * built to fail all five checks: if any of them stays quiet, the check is
 * broken rather than the sections being clean.
 */
const BROKEN = `
<div class="probe" data-type="__selftest__" style="background:#fff">
  <img src="${PIC}" width="40" height="40">
  <a href="#"><span></span></a>
  <button type="button"></button>
  <p style="color:#bbbbbb;background:#ffffff;font-size:14px">grey on white, 1.7 to 1</p>
  <h2>a heading</h2>
  <h4>and one two levels down</h4>
  <button type="button" style="display:block;height:20px;width:80px">tiny</button>
  <div style="background-image:linear-gradient(#000,#fff);color:#888">over a gradient</div>
</div>`

function run(width) {
  const file = join(out, `index-${width}.html`)
  writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>
  body{margin:0;background:#fff;font-family:Inter,system-ui,sans-serif}
  .probe{width:${width}px;margin:0 auto;background:#fff;overflow:hidden}
</style></head><body>${(process.argv.includes("--selftest") ? body + BROKEN : body).replace(/src="https:\/\/example\.invalid\/[^"]*"/g, `src="${PIC}"`)}${MEASURE}</body></html>`)
  const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    `--window-size=${width + 40},1400`, "--virtual-time-budget=8000", "--run-all-compositor-stages-before-draw",
    "--dump-dom", `file://${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 })
  const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
  if (!m) fail(`The page did not report at ${width}px.`)
  const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  return JSON.parse(decode(m[1]))
}

const wide = run(1100)
const phone = run(390)
const types = Object.keys(wide)

const tally = { images: [], unnamed: [], contrast: [], small: [], skipped: [] }
let unknown = 0

for (const t of types) {
  const w = wide[t]
  const p = phone[t]
  unknown += w.unknownContrast
  if (w.images.length) tally.images.push(`${t}: ${w.images.length}`)
  if (w.unnamed.length) tally.unnamed.push(`${t}: ${w.unnamed.join(", ")}`)
  for (const c of w.contrast) tally.contrast.push(`${t}: "${c.text}" ${c.got}:1 needs ${c.need}:1 (${c.size}px ${c.color})`)
  // Tap targets are a phone question.
  for (const s of p.small) tally.small.push(`${t}: "${s.label}" ${s.w}×${s.h}`)
  // A section that starts at h3, or jumps h2 → h4, reads as a gap to a
  // screen reader moving by heading.
  const hs = w.headings
  for (let i = 1; i < hs.length; i++) if (hs[i] > hs[i - 1] + 1) tally.skipped.push(`${t}: h${hs[i - 1]} → h${hs[i]}`)
}

const line = (name, rows) => {
  console.log(`\n${name}: ${rows.length === 0 ? "none" : rows.length}`)
  for (const r of rows.slice(0, 40)) console.log(`  ${r}`)
  if (rows.length > 40) console.log(`  … and ${rows.length - 40} more`)
}

console.log(`${types.length} sections, laid out at 1100px and 390px.`)
line("Pictures with no alt attribute", tally.images)
line("Links and buttons that cannot be named", tally.unnamed)
line("Text under the AA contrast ratio", tally.contrast)
line("Tap targets under 44px tall on a phone", tally.small)
line("Headings that skip a level", tally.skipped)
console.log(`\n${unknown} text elements sit on a picture or a gradient, where contrast cannot be computed.`)

const broken = tally.images.length + tally.unnamed.length + tally.contrast.length + tally.skipped.length + tally.small.length

if (process.argv.includes("--selftest")) {
  const hit = (rows) => rows.some((r) => r.startsWith("__selftest__"))
  const missed = [
    ["a picture with no alt", hit(tally.images)],
    ["a button with no name", hit(tally.unnamed)],
    ["grey text on white", hit(tally.contrast)],
    ["a 20px tap target", hit(tally.small)],
    ["h2 followed by h4", hit(tally.skipped)],
    ["text over a gradient counted as unknown", unknown > 0],
  ].filter(([, ok]) => !ok)
  console.log(missed.length === 0
    ? "\nSelf-test: all five checks fire on markup built to fail them, and a gradient reads as unknown."
    : `\nSelf-test FAILED, these checks did not fire:\n${missed.map(([n]) => `  ${n}`).join("\n")}`)
  if (missed.length) process.exit(1)
  process.exit(0)
}

console.log(broken === 0 ? "\nThe baseline holds." : `\n${broken} findings.`)
