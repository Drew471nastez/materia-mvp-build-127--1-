/**
 * ===========================================================================
 *  THE CODE EDITOR FILLS ITS FRAME, MEASURED
 * ===========================================================================
 * Reported with a screenshot: the code editor filled about half of its card,
 * with the file list cut off under home.json and the Explorer heading faded.
 * The frame was the full height. The page inside it was 306px, because the
 * Ask AI writing lane had given itself the class `.wb-code` with a fixed
 * 14-line height and a fading mask, and `.wb-code` is the code editor's root.
 *
 * This draws the pane the builder draws, with the built stylesheet, and in it
 * a page with the code editor's own layout and root classes, read out of the
 * source so a change there is measured here. Then it checks that the page is
 * as tall as the frame, at a desktop and a phone size, and that nothing on it
 * is masked.
 *
 *   pnpm build && node scripts/check-code-editor-height.mjs
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const dir = join(root, ".next/static/chunks")
if (!existsSync(dir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(dir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(dir, f), "utf8")).join("\n")

const layout = readFileSync(join(root, "app/(storelib)/website-builder/layout.tsx"), "utf8")
const page = readFileSync(join(root, "app/(storelib)/website-builder/code/[installId]/page.tsx"), "utf8")
const pane = readFileSync(join(root, "components/website-builder/preview-mode-switch.tsx"), "utf8")
const layoutClass = layout.match(/<div className="(fixed inset-0[^"]*)"/)?.[1]
const rootClass = page.match(/className="(wb-code h-full flex flex-col[^"]*)"/)?.[1]
const rowClass = page.match(/<div className="(relative flex flex-1 overflow-hidden)">/)?.[1]
const paneClass = pane.match(/"(absolute inset-0 z-\[80\] flex flex-col rounded-t-\[20px\])"/)?.[1]
if (!layoutClass || !rootClass || !rowClass || !paneClass) fail(`Could not read the classes out of the source: ${JSON.stringify({ layoutClass, rootClass, rowClass, paneClass })}`)

const framed = `<!doctype html><html><head><style>${css}</style></head><body style="margin:0">
<div class="${layoutClass}"><div id="root" class="${rootClass}" data-code-theme="light">
  <div class="h-11 shrink-0">bar</div>
  <div class="${rowClass}"><aside id="aside" class="w-56 shrink-0 flex flex-col"><div class="flex-1">theme.json</div><div id="legend">Customized</div></aside><div class="flex-1"></div></div>
</div></div></body></html>`

const host = (w) => `<!doctype html><html><head><style>${css}</style></head><body style="margin:0">
<div style="height:100vh;display:flex;flex-direction:column"><div style="height:56px;flex:none"></div>
<div style="flex:1;min-height:0;display:flex"><div style="width:${w > 800 ? 300 : 0}px;flex:none"></div>
<main class="relative flex-1 min-w-0 overflow-hidden flex justify-center">
  <div id="pane" class="overflow-hidden bg-white ${paneClass}"><div class="relative min-h-0 flex-1"><iframe id="f" class="h-full w-full border-0 bg-white"></iframe></div></div>
</main></div></div></body></html>`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
for (const [label, w, h] of [["desktop", 1440, 900], ["laptop", 1280, 720], ["tall", 1512, 1100]]) {
  console.log(`\n${label}, ${w} × ${h}`)
  const p = await browser.newPage()
  await p.setViewport({ width: w, height: h })
  await p.setContent(host(w))
  await p.$eval("#f", (f, html) => new Promise((res) => { f.onload = res; f.srcdoc = html }), framed)
  const m = await p.evaluate(() => {
    const f = document.getElementById("f")
    const d = f.contentDocument
    const r = d.getElementById("root")
    const cs = d.defaultView.getComputedStyle(r)
    return {
      frame: Math.round(f.getBoundingClientRect().height),
      page: Math.round(r.getBoundingClientRect().height),
      files: Math.round(d.getElementById("aside").getBoundingClientRect().height),
      legendBottom: Math.round(d.getElementById("legend").getBoundingClientRect().bottom),
      mask: cs.maskImage || cs.webkitMaskImage,
      justify: cs.justifyContent,
    }
  })
  expect(m.page === m.frame, "the code editor is as tall as its frame", { page: m.page, frame: m.frame })
  expect(m.files === m.frame - 44, "the file list runs the full height under the bar", { files: m.files })
  expect(m.legendBottom === m.frame, "and its footer sits at the bottom of the frame", { legendBottom: m.legendBottom, frame: m.frame })
  expect(!m.mask || m.mask === "none", "nothing on it is masked or faded", m.mask)
  await p.close()
}
await browser.close()
if (broken) { console.error(`\n${broken} check(s) failed\n`); process.exit(1) }
console.log("\nall checks passed\n")
