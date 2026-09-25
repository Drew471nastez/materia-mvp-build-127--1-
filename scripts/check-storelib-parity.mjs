/**
 * ===========================================================================
 *  ONE SECTION, BEFORE AND AFTER
 * ===========================================================================
 * A section that has moved from a React renderer to a .storelib file has to
 * look the same. "It looks the same" is a claim about pixels, so it is
 * measured: each fixture (the shipped defaults, every preset, a scheme-only
 * instance) is rendered both ways at 1100px and 380px, and the browser
 * reports, for each pair:
 *   • the text, in order
 *   • the section's height
 *   • the heading's font size, colour and family
 *   • the subheading's colour
 *   • every button's background, colour, border and radius
 *   • the surface's background
 * A pair that differs is a difference in the conversion, and the script says
 * which fixture, which width and which number.
 *
 * CONTROL: with PROBE_BREAK=1 the engine's copy gets one size 10px larger.
 * The script runs that too and requires it to fail, so a green run means the
 * measurement can see a difference, not that it saw nothing.
 *
 *   pnpm build && node scripts/check-storelib-parity.mjs <type>
 *
 * The type must be in BEFORE in render-storelib-parity-probe.tsx, which is
 * where a section names the renderer it is migrating from.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const TYPE = process.argv[2]
if (!TYPE) {
  console.error("Which section? e.g. node scripts/check-storelib-parity.mjs hero")
  process.exit(1)
}
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
      /**
       * THE BOXES SOMEBODY CAN SEE, whatever wraps them.
       *
       * Text, heights and buttons say nothing about a grid of cards: a
       * section could render three cards as one column and still match. So
       * every element that paints — a background, or a border — is recorded
       * as its rectangle, its colour and its radius, relative to the pane.
       * Wrappers that paint nothing are invisible to this, which is the
       * point: the two implementations nest differently and are allowed to.
       */
      const paneBox = pane.getBoundingClientRect()
      const boxes = []
      for (const el of pane.querySelectorAll("*")) {
        const cs = getComputedStyle(el)
        const painted = cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent"
        const bordered = parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0
        if (!painted && !bordered) continue
        const r = el.getBoundingClientRect()
        if (r.width < 4 || r.height < 4) continue
        boxes.push([
          Math.round(r.left - paneBox.left), Math.round(r.top - paneBox.top),
          Math.round(r.width), Math.round(r.height),
          rgb(cs.backgroundColor), cs.borderTopLeftRadius,
          rgb(cs.borderTopWidth + cs.borderTopColor),
        ].join(","))
      }
      boxes.sort()
      const images = [...pane.querySelectorAll("img,svg,video")].map((el) => {
        const r = el.getBoundingClientRect()
        return el.tagName + ":" + Math.round(r.width) + "x" + Math.round(r.height)
      }).sort()
      rec[side] = {
        boxes,
        images,
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
  const out = mkdtempSync(join(tmpdir(), "storelib-parity-"))
  const bundle = join(out, "probe.js")
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-storelib-parity-probe.tsx"),
    "--bundle", "--platform=node", "--format=cjs", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
    `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@=${root}`],
    { stdio: ["ignore", "ignore", "inherit"] })
  execFileSync("node", [bundle], { env: { ...process.env, OUT_DIR: out, PROBE_TYPE: TYPE, PROBE_BREAK: breakIt ? "1" : "0" }, stdio: ["ignore", "ignore", "inherit"] })
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
    if (o.boxes.length !== n.boxes.length) diffs.push(`${where}: ${o.boxes.length} painted boxes before, ${n.boxes.length} after`)
    else {
      const bad = o.boxes.filter((b, i) => b !== n.boxes[i])
      if (bad.length) diffs.push(`${where}: ${bad.length} box(es) differ\n    old: ${bad.slice(0, 3).join(" | ")}\n    new: ${bad.map((b) => n.boxes[o.boxes.indexOf(b)]).slice(0, 3).join(" | ")}`)
    }
    if (o.images.join(";") !== n.images.join(";")) diffs.push(`${where}: media\n    old: ${o.images.join(" ")}\n    new: ${n.images.join(" ")}`)
    if (o.surface !== n.surface) diffs.push(`${where}: surface old ${o.surface} new ${n.surface}`)
  }
  return diffs
}

const real = run(false)
const diffs = compare(real.records)
const control = compare(run(true).records)
console.log(`${TYPE}: ${real.records.length} pairs measured (${real.file})`)
if (control.length === 0) fail(`CONTROL FAILED: a 10px difference in the engine's ${TYPE} was not detected; the measurement is blind.`)
console.log(`control: a 10px heading difference was detected in ${control.length} pair(s)`)
if (diffs.length) { console.error(`${diffs.length} difference(s) between the React ${TYPE} and the .storelib ${TYPE}:\n  ${diffs.join("\n  ")}`); process.exit(1) }
console.log(`the .storelib ${TYPE} measures the same as the React ${TYPE} in every pair`)
