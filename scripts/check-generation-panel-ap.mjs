/**
 * ===========================================================================
 *  ROUND AP (track 3): THE START WITH AI PROGRESS CARD, MEASURED
 * ===========================================================================
 * The editor's progress card now has five steps (Design, Code, Pages, Photos,
 * Check) and, while the site's own sections are coded, the files being
 * written. This draws the real component (components/website-builder/
 * ai-generation/generation-panel.tsx) with the app's own stylesheet in
 * headless Chromium at a phone's width and a laptop's, and measures:
 *
 *   • the card never wider than the screen less its 16px gutters, and no
 *     horizontal scroll on the page;
 *   • the five step labels on one row, each inside its own cell;
 *   • the coding lines inside the card, one line each (truncated, not wrapped);
 *   • the step and the line read with the card's own colours (no violet).
 *
 * Screenshots go to $SHOTS (default: the scratchpad's ap/ap3 folder).
 *
 *   node scripts/check-generation-panel-ap.mjs
 */
import assert from "node:assert/strict"
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import puppeteer from "puppeteer-core"
import { build } from "esbuild"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS ?? join(tmpdir(), "generation-panel-ap")
mkdirSync(SHOTS, { recursive: true })
const root = process.cwd()

/* The component, rendered to markup in Node from its own source. */
const entry = join(tmpdir(), `gen-panel-entry-${process.pid}.tsx`)
writeFileSync(
  entry,
  `import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { GenerationPanel } from "${join(root, "components/website-builder/ai-generation/generation-panel.tsx")}"
const noop = () => {}
export const coding = renderToStaticMarkup(createElement(GenerationPanel, { mode: "job", onContinue: noop, onAskFix: noop, onClose: noop, view: { status: "running", step: "code", progress: 34, error: null, notes: [], findings: [], activity: [
  { kind: "code", name: "Northside header" }, { kind: "code", name: "Programs and prices for people who train before work" }, { kind: "coded", name: "Coach intro" } ] } }))
export const done = renderToStaticMarkup(createElement(GenerationPanel, { mode: "job", onContinue: noop, onAskFix: noop, onClose: noop, view: { status: "partial", step: "done", progress: 100, error: null, notes: ["The site's own footer could not be coded, so the theme's footer is used."], findings: [], activity: [] } }))
`,
)
/* Next to the checkout, so the bundle finds react in its node_modules; removed after. */
const out = join(root, `.gen-panel-probe-${process.pid}.mjs`)
await build({ entryPoints: [entry], bundle: true, platform: "node", format: "esm", outfile: out, jsx: "automatic", tsconfig: join(root, "tsconfig.json"), external: ["react", "react-dom", "lucide-react"], logLevel: "error", absWorkingDir: root, nodePaths: [join(root, "node_modules")] })
const { coding, done } = await import(out).finally(() => { unlinkSync(out); unlinkSync(entry) })

const css = await appCss(root)
const fonts = interFaces(root)
const page = (body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fonts}${css}</style></head>
<body style="margin:0;background:#f8f9fa;font-family:Inter,system-ui,sans-serif"><div style="display:flex;justify-content:center;padding:64px 16px">${body}</div></body></html>`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
const results = []
try {
  for (const [label, width] of [["phone", 390], ["laptop", 1280]]) {
    for (const [state, html] of [["coding", coding], ["done", done]]) {
      const tab = await browser.newPage()
      await tab.setViewport({ width, height: 700, deviceScaleFactor: 2 })
      await tab.setContent(page(html), { waitUntil: "load" })
      const m = await tab.evaluate(() => {
        const card = document.querySelector("[data-generation]")
        const r = card.getBoundingClientRect()
        const steps = [...card.querySelectorAll("ol li")].map((li) => {
          const b = li.getBoundingClientRect()
          const text = li.querySelector("span:last-child")
          return { label: li.textContent.trim(), top: Math.round(b.top), right: Math.round(b.right), inside: b.right <= r.right + 0.5 && b.left >= r.left - 0.5, clipped: text ? text.scrollWidth > text.clientWidth + 1 : false }
        })
        const lines = [...card.querySelectorAll("[data-generation-activity] li")].map((li) => {
          const b = li.getBoundingClientRect()
          const span = li.querySelector("span")
          return { text: li.textContent.trim(), height: Math.round(b.height), inside: b.right <= r.right + 0.5, color: getComputedStyle(li).color }
        })
        const bar = card.querySelector("[role=progressbar] > div")
        return {
          card: { width: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right) },
          viewport: window.innerWidth,
          scroll: document.documentElement.scrollWidth > window.innerWidth,
          steps,
          lines,
          bar: bar ? getComputedStyle(bar).backgroundColor : null,
          title: card.querySelector("h2").textContent,
        }
      })
      const shot = join(SHOTS, `generation-panel-${state}-${label}.png`)
      await tab.screenshot({ path: shot, clip: { x: 0, y: 32, width, height: 420 } })
      results.push({ label, state, ...m, shot })
      await tab.close()
    }
  }
} finally {
  await browser.close()
}

for (const r of results) {
  console.log(`\n${r.state} at ${r.viewport}px: card ${r.card.width}px (${r.card.left}..${r.card.right}), page scrolls sideways: ${r.scroll}`)
  console.log(`  title: ${r.title}`)
  if (r.steps.length) console.log(`  steps: ${r.steps.map((s) => `${s.label}${s.clipped ? " (truncated)" : ""}`).join(" | ")} on rows ${[...new Set(r.steps.map((s) => s.top))].join(",")}`)
  for (const l of r.lines) console.log(`  line: "${l.text}" ${l.height}px tall, inside: ${l.inside}, colour ${l.color}`)
  if (r.bar) console.log(`  progress bar: ${r.bar}`)
  console.log(`  shot: ${r.shot}`)
  assert.ok(!r.scroll, "no sideways scroll")
  assert.ok(r.card.left >= 16 && r.viewport - r.card.right >= 16, "16px gutters")
  if (r.state === "coding") {
    assert.equal(r.steps.length, 5, "five steps")
    assert.equal(new Set(r.steps.map((s) => s.top)).size, 1, "on one row")
    assert.ok(r.steps.every((s) => s.inside), "each step inside the card")
    assert.equal(r.lines.length, 3, "three coding lines")
    assert.ok(r.lines.every((l) => l.inside && l.height <= 20), "each line one line, inside the card")
    assert.ok(!/139, 92, 246/.test(r.bar ?? ""), "no violet")
  }
}
console.log("\nall measured")
