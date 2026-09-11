/**
 * ===========================================================================
 *  THE HERO, BEFORE AND AFTER
 * ===========================================================================
 * The hero now renders from themes/default/sections/hero.storelib through
 * the theme engine instead of from a React component. "It looks the same" is
 * a claim about pixels, so it is measured: each fixture (the shipped
 * defaults, every preset, a scheme-only instance) is rendered both ways at
 * 1100px and 380px, and the browser reports, for each pair:
 *   • the text, in order
 *   • the section's height
 *   • the heading's font size, colour and family
 *   • the subheading's colour
 *   • every button's background, colour, border and radius
 *   • the surface's background
 * A pair that differs is a difference in the conversion, and the script says
 * which fixture, which width and which number.
 *
 * CONTROL: with PROBE_BREAK=1 the engine's hero gets a heading 10px larger.
 * The script runs that too and requires it to fail, so a green run means the
 * measurement can see a difference, not that it saw nothing.
 *   pnpm build && node scripts/check-storelib-hero.mjs
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

const MEASURE = `
<script>
(function () {
  const rgb = (s) => s.replace(/\\s+/g, "")
  // Text nodes only, and none inside <style>: the engine's pane carries its
  // scoped stylesheet inline, and a stylesheet is not what the person reads.
  const text = (el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement && n.parentElement.closest("style") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) })
    const parts = []
    for (let n = walker.nextNode(); n; n = walker.nextNode()) parts.push(n.nodeValue)
    return parts.join(" ").replace(/\\s+/g, " ").trim()
  }
  const out = []
  for (const fx of document.querySelectorAll(".fixture")) {
    const rec = { name: fx.dataset.name, width: fx.dataset.width }
    for (const side of ["old", "new"]) {
      const pane = fx.querySelector('[data-side="' + side + '"]')
      const wrap = pane.querySelector("[data-section]")
      const h1 = pane.querySelector("h1")
      const p = pane.querySelector("p")
      const surface = side === "old" ? wrap : pane.querySelector("section")
      const buttons = [...pane.querySelectorAll("a")].map((a) => {
        const c = getComputedStyle(a)
        return [rgb(c.backgroundColor), rgb(c.color), rgb(c.borderTopWidth + c.borderTopColor), c.borderTopLeftRadius, Math.round(a.getBoundingClientRect().height)].join("|")
      })
      const sc = getComputedStyle(surface)
      rec[side] = {
        text: text(pane),
        height: Math.round(wrap.getBoundingClientRect().height),
        heading: h1 ? [getComputedStyle(h1).fontSize, rgb(getComputedStyle(h1).color), getComputedStyle(h1).fontFamily, Math.round(h1.getBoundingClientRect().height)].join("|") : "",
        sub: p ? rgb(getComputedStyle(p).color) + "|" + getComputedStyle(p).fontSize : "",
        buttons,
        surface: rgb(sc.backgroundColor) + "|" + (sc.backgroundImage === "none" ? "none" : sc.backgroundImage.replace(/\\s+/g, "")),
      }
    }
    out.push(rec)
  }
  document.title = "done"
  const pre = document.createElement("pre"); pre.id = "result"; pre.textContent = JSON.stringify(out); document.body.append(pre)
})()
</script>`

function run(breakIt) {
  const out = mkdtempSync(join(tmpdir(), "storelib-hero-"))
  const bundle = join(out, "probe.js")
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-storelib-hero-probe.tsx"),
    "--bundle", "--platform=node", "--format=cjs", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
    `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@=${root}`],
    { stdio: ["ignore", "ignore", "inherit"] })
  execFileSync("node", [bundle], { env: { ...process.env, OUT_DIR: out, PROBE_BREAK: breakIt ? "1" : "0" }, stdio: ["ignore", "ignore", "inherit"] })
  const body = readFileSync(join(out, "page.html"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}.fixture{display:flex;gap:24px;align-items:flex-start;margin:0 0 24px}.pane{flex:none}</style></head><body>${body}${MEASURE}</body></html>`
  const file = join(out, "index.html")
  writeFileSync(file, html)
  const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--window-size=2400,1600", "--virtual-time-budget=2000", "--run-all-compositor-stages-before-draw", "--dump-dom", `file://${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 })
  const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
  if (!m) fail("The page did not report. Chromium's DOM had no #result.")
  const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  return { records: JSON.parse(decode(m[1])), file }
}

function compare(records) {
  const diffs = []
  for (const r of records) {
    const o = r.old, n = r.new
    const where = `${r.name} @ ${r.width}px`
    if (o.text !== n.text) diffs.push(`${where}: text\n    old: ${o.text}\n    new: ${n.text}`)
    if (Math.abs(o.height - n.height) > 2) diffs.push(`${where}: height old ${o.height} new ${n.height}`)
    if (o.heading !== n.heading) diffs.push(`${where}: heading old ${o.heading} new ${n.heading}`)
    if (o.sub !== n.sub) diffs.push(`${where}: subheading old ${o.sub} new ${n.sub}`)
    if (o.buttons.join(";") !== n.buttons.join(";")) diffs.push(`${where}: buttons\n    old: ${o.buttons.join(" ; ")}\n    new: ${n.buttons.join(" ; ")}`)
    if (o.surface !== n.surface) diffs.push(`${where}: surface old ${o.surface} new ${n.surface}`)
  }
  return diffs
}

const real = run(false)
const diffs = compare(real.records)
const control = compare(run(true).records)
console.log(`${real.records.length} pairs measured (${real.file})`)
if (control.length === 0) fail("CONTROL FAILED: a 10px larger heading in the engine's hero was not detected; the measurement is blind.")
console.log(`control: a 10px heading difference was detected in ${control.length} pair(s)`)
if (diffs.length) { console.error(`${diffs.length} difference(s) between the React hero and the .storelib hero:\n  ${diffs.join("\n  ")}`); process.exit(1) }
console.log("the .storelib hero measures the same as the React hero in every pair")
