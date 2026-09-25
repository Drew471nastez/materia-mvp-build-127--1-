/**
 * ===========================================================================
 *  THE WHOLE LIBRARY, LOOKED AT
 * ===========================================================================
 * Thirty sections that compile is not thirty sections worth adding. This
 * renders every one at the preset Add Section uses, measures each, and
 * writes a PNG of the lot — because the rules say to look at the result, and
 * a screenshot is how you look at it.
 *
 * What it refuses:
 *   • a section that renders as an empty strip
 *   • one that runs off the side at phone width
 *   • text that cannot be read against what is behind it (below 4.5:1)
 *   • a tap target under 44px on a phone
 *
 *   pnpm build && node scripts/check-library.mjs        (add KEEP_SHOT=1)
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
writeFileSync(join(stubs, "link.jsx"), `import React from "react"\nexport default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }\nexport const useLinkStatus = () => ({ pending: false })\n`)
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/"\nexport const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {} })\nexport const useSearchParams = () => new URLSearchParams()\n`)

const MEASURE = `
<script>
(function () {
  const rgb = (s) => s.replace(/\\s+/g, "")
  function lum(c) {
    const m = c.match(/\\d+(\\.\\d+)?/g) || []
    const [r, g, b] = m.slice(0, 3).map((n) => {
      const v = Number(n) / 255
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  /**
   * The alpha has to be read as the fourth channel, not sniffed off the end
   * of the string: "rgb(0, 0, 0)" ends in ", 0)" too, so a black button read
   * as transparent and the measurement went looking for the white page
   * behind it — reporting every primary button in the library as white on
   * white, which none of them were.
   */
  function opaque(bg) {
    const m = /^rgba?\(([^)]+)\)/.exec(bg || "")
    if (!m) return false
    const parts = m[1].split(",").map((x) => x.trim())
    const alpha = parts.length > 3 ? Number(parts[3]) : 1
    return Number.isFinite(alpha) && alpha > 0.05
  }
  function behind(el) {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor
      if (opaque(bg)) return bg
    }
    return "rgb(255, 255, 255)"
  }
  const out = []
  for (const p of document.querySelectorAll(".probe")) {
    const box = p.querySelector(".probe__body")
    const r = box.getBoundingClientRect()
    const text = box.textContent.replace(/\\s+/g, " ").trim()
    const low = []
    for (const el of box.querySelectorAll("h1,h2,h3,p,a,li,span,button,summary,code,dt,dd,blockquote")) {
      const t = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join("").trim()
      if (t.length < 2) continue
      const cs = getComputedStyle(el)
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.15) continue
      const rect = el.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) continue
      const a = lum(rgb(cs.color)), b = lum(behind(el))
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      if (ratio < 4.5) low.push(t.slice(0, 24) + " " + ratio.toFixed(1) + ":1 [" + el.className + " color:" + rgb(cs.color) + " on:" + rgb(behind(el)) + "]")
    }
    const small = []
    for (const el of box.querySelectorAll("a,button,summary,input")) {
      const cs = getComputedStyle(el)
      const bordered = parseFloat(cs.borderTopWidth) > 0 || opaque(cs.backgroundColor)
      if (!bordered) continue
      const rect = el.getBoundingClientRect()
      if (rect.height > 0 && rect.height < 44) small.push(el.tagName + " " + Math.round(rect.height))
    }
    out.push({
      type: p.dataset.type, cat: p.dataset.cat,
      chars: text.length, height: Math.round(r.height),
      overflow: Math.round(box.scrollWidth - box.clientWidth),
      low, small,
      media: box.querySelectorAll("img,video,iframe,svg").length,
    })
  }
  const pre = document.createElement("pre"); pre.id = "result"; pre.textContent = JSON.stringify(out); document.body.append(pre)
})()
</script>`

function run(width) {
  const out = mkdtempSync(join(tmpdir(), "storelib-lib-"))
  const bundle = join(out, "probe.js")
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-library-probe.tsx"),
    "--bundle", "--platform=node", "--format=cjs", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
    `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@=${root}`],
    { stdio: ["ignore", "ignore", "inherit"] })
  execFileSync("node", [bundle], { env: { ...process.env, OUT_DIR: out }, stdio: ["ignore", "ignore", "inherit"] })
  const body = readFileSync(join(out, "page.html"), "utf8")
  const page = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>
    body{margin:0;font-family:Inter,system-ui,sans-serif;background:#e9eaee}
    .probe{margin:0 auto 20px;width:${width}px;background:#fff;overflow:hidden;border-radius:10px}
    .probe__bar{display:flex;gap:10px;align-items:baseline;padding:7px 12px;background:#1a1a2e;color:#fff;font-size:12px}
    .probe__bar span{opacity:.6}.probe__bar code{margin-left:auto;opacity:.5;font-size:11px}
  </style></head><body>${body}${MEASURE}</body></html>`
  const file = join(out, "index.html")
  writeFileSync(file, page)
  const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    `--window-size=${Math.max(width + 80, 520)},1400`, "--virtual-time-budget=3000", "--run-all-compositor-stages-before-draw",
    "--dump-dom", `file://${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 128 * 1024 * 1024 })
  const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
  if (!m) fail("The page did not report.")
  const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  if (process.env.KEEP_SHOT) {
    execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
      `--window-size=${Math.max(width + 80, 520)},1400`, "--virtual-time-budget=3000",
      `--screenshot=${join(root, `.wb-probe/library-${width}.png`)}`, "--screenshot-full-page", `file://${file}`],
      { stdio: ["ignore", "ignore", "ignore"] })
    console.log(`  shot: .wb-probe/library-${width}.png`)
  }
  return JSON.parse(decode(m[1]))
}

const problems = []
for (const width of [1100, 390]) {
  const records = run(width)
  console.log(`${records.length} sections measured at ${width}px`)
  for (const r of records) {
    const where = `${r.type} @ ${width}px`
    /**
     * A thin band is a design, not a fault: the announcement bar is meant to
     * be one line high. What is a fault is a section with nothing in it, so
     * the height only counts against it when there is nothing to read either.
     */
    if (r.height < 24) problems.push(`${where}: renders ${r.height}px tall, which is not a section`)
    if (r.height < 60 && r.chars < 12) problems.push(`${where}: ${r.height}px tall with ${r.chars} characters — it arrives empty`)
    if (r.chars < 12 && r.media === 0) problems.push(`${where}: ${r.chars} characters and no picture — it arrives empty`)
    if (r.overflow > 1) problems.push(`${where}: runs ${r.overflow}px off the side`)
    if (r.low.length) problems.push(`${where}: ${r.low.length} unreadable against the background — ${r.low.slice(0, 3).join("; ")}`)
    if (width <= 640 && r.small.length) problems.push(`${where}: ${r.small.length} control(s) under 44px — ${r.small.slice(0, 3).join("; ")}`)
  }
}
if (problems.length) { console.error(`\n${problems.length} problem(s):\n  ${problems.join("\n  ")}`); process.exit(1) }
console.log("every section in the library arrives with something in it, fits, reads and can be tapped")
