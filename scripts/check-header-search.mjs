/**
 * ===========================================================================
 *  THE HEADER'S SEARCH, MEASURED IN A HEADER THAT IS NOT 60 PIXELS TALL
 * ===========================================================================
 * Reported from a published site, with a picture: the field at the top of a
 * tall black band, the magnifier floating below its bottom edge, and the
 * close button below that again. Nothing lined up with anything.
 *
 * It is one CSS rule, and it is invisible in the case everybody tests. The
 * field was `align-self: stretch` with `max-height: 44px`, inside a row that
 * is the header's full height. Stretch lays the box out at the row's height
 * and the cap then trims it — from the BOTTOM, because a stretched item
 * whose height is clamped keeps its start edge. So in a 60px header the
 * field fills it and everything agrees; in a 100px header the field is a
 * 44px box stuck to the top, while the magnifier (`top: 50%` of the form,
 * which did stretch) and the close button (`self-center` of the row) sit on
 * the row's middle, 28px below it.
 *
 * Every header with generous padding had it. So this measures three of them,
 * and what it measures is not "does it look right" but whether the three
 * things share a centre line.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const out = mkdtempSync(join(tmpdir(), "storelib-hdrsearch-"))
const stubs = join(root, ".hdrsearch-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)

execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-header-search.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`,
  `--alias:next/navigation=${join(stubs, "navigation.js")}`,
  `--alias:@=${root}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { cwd: root, stdio: ["ignore", "ignore", "inherit"] })

/* Tight, ordinary and generous. The reported one was a generous header. */
const PADS = [0, 16, 40]
const page = readFileSync(join(root, "scripts/header-search-page.js"), "utf8")

writeFileSync(join(out, "index.html"), `<!doctype html><html class="light"><head><meta charset="utf-8">
<style>${css}</style><style>body { margin: 0; background: #f1f5f9 }</style>
</head><body>
${PADS.map((p) => `<div id="h${p}" data-mount data-pad="${p}" style="margin-bottom:60px"></div>`).join("\n")}
<div id="elsewhere" style="height:300px">The page under the headers.</div>
<script src="probe.js"></script>
<script>
${page}
</script></body></html>`)

/*
  TWO WIDTHS, because the header renders two shells and each carries its own
  padding: a phone's header is a different height from a desktop's, and the
  panel is laid over both. A fix measured on one of them is a fix for one of
  them.
*/
/*
  The narrow one is asked for at 390 and this browser will not go below 500,
  so what it reports is what it measured rather than what it was asked for.
  Five hundred is still the other side of the `md` breakpoint, which is what
  this is here to cross: the header swaps to its mobile shell, with the
  phone's padding on it.
*/
const WIDTHS = [
  { w: 1280, h: 900, what: "a wide window" },
  { w: 390, h: 844, what: "a narrow one" },
]

const problems = []
/* A pixel of rounding is a pixel of rounding. Anything more is a miss. */
const SLACK = 1

for (const view of WIDTHS) {
  const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    `--window-size=${view.w},${view.h}`, "--virtual-time-budget=12000", "--dump-dom", `file://${join(out, "index.html")}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 })
  const all = [...dom.matchAll(/<pre id="result">([\s\S]*?)<\/pre>/g)]
  if (!all.length) fail(`The headers never reported at ${view.w}px.`)
  const r = JSON.parse(all[all.length - 1][1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"))
  if (process.env.DEBUG) console.log(JSON.stringify(r, null, 1))

  console.log(`\nOn ${view.what}, ${r.viewport}px wide`)

  for (const h of r.headers) {
    const where = `${view.what} (${r.viewport}px), header with ${h.pad}px of padding`
    if (!h.open || !h.field || !h.submit || !h.close || !h.header) {
      problems.push(`${where} never opened its search`)
      continue
    }
    console.log(`  ${h.header.h}px tall — field ${h.field.w}x${h.field.h}, middles: header ${h.header.midY}, field ${h.field.midY}, magnifier ${h.submit.midY}, close ${h.close.midY}`)

    if (Math.abs(h.field.midY - h.header.midY) > SLACK) {
      problems.push(`${where}: the field's middle is ${h.field.midY} and the header's is ${h.header.midY} — it is not centred`)
    }
    if (Math.abs(h.submit.midY - h.field.midY) > SLACK) {
      problems.push(`${where}: the magnifier sits at ${h.submit.midY} and the field's middle is ${h.field.midY} — ${Math.abs(h.submit.midY - h.field.midY)}px apart`)
    }
    if (Math.abs(h.close.midY - h.field.midY) > SLACK) {
      problems.push(`${where}: the close button sits at ${h.close.midY} and the field's middle is ${h.field.midY} — ${Math.abs(h.close.midY - h.field.midY)}px apart`)
    }
    if (!h.submitInsideField) {
      problems.push(`${where}: the magnifier is drawn outside the field`)
    }
    if (h.field.top < h.header.top - SLACK || h.field.bottom > h.header.bottom + SLACK) {
      problems.push(`${where}: the field is outside the header, ${h.field.top}..${h.field.bottom} against ${h.header.top}..${h.header.bottom}`)
    }
    if (h.field.h > 44 + SLACK) {
      problems.push(`${where}: the field is ${h.field.h}px tall, which is a field that grew with the header`)
    }
    if (h.field.h < 26) {
      problems.push(`${where}: the field is only ${h.field.h}px tall`)
    }
    if (h.field.w < 120) {
      problems.push(`${where}: the field is only ${h.field.w}px wide`)
    }
  }

  const state = (list, i) => (list || [])[i] || null
  const say = (label, list) =>
    console.log(`  ${label}: ${(list || []).map((a) => (a ? `${a.pad}px → ${a.opacity}` : "missing")).join(", ")}`)

  say("pressing the field", r.afterPressingTheField)
  say("pressing the empty header", r.afterPressingTheHeader)
  say("pressing just under the header", r.afterPressingAway)
  console.log(`  what is under the header: ${(r.underTheHeader || []).join(", ")}`)

  for (let i = 0; i < r.headers.length; i++) {
    const pad = r.headers[i].pad
    const where = `${view.what} (${r.viewport}px), header with ${pad}px of padding`
    const onField = state(r.afterPressingTheField, i)
    const onHeader = state(r.afterPressingTheHeader, i)
    const onPage = state(r.afterPressingAway, i)

    if (!onField || !onHeader || !onPage) {
      problems.push(`${where}: a panel vanished from the page instead of closing`)
      continue
    }
    if (onField.opacity < 0.95) {
      problems.push(`${where}: pressing the field itself closed the search (opacity ${onField.opacity})`)
    }
    if (onHeader.opacity > 0.05) {
      problems.push(`${where}: pressing the empty header beside the field left the search open at opacity ${onHeader.opacity} — that band is the most obvious place to press to dismiss it`)
    }
    if (onPage.opacity > 0.05) {
      problems.push(`${where}: pressing the strip of page just under the header left the search open at opacity ${onPage.opacity} — that is the first place anybody presses after the header itself`)
    }
    if (onPage.pointerEvents !== "none") {
      problems.push(`${where}: the closed panel still takes the pointer (${onPage.pointerEvents})`)
    }
    const ms = Math.max(...[...String(onPage.transition).matchAll(/([\d.]+)ms/g)].map((m) => Number(m[1])), 0)
    if (!(ms >= 180)) {
      problems.push(`${where}: it closes in ${ms}ms, which reads as a cut rather than as a close`)
    }
  }
}

console.log("")
if (problems.length) fail(problems.map((p) => `  - ${p}`).join("\n"))
console.log("The field, the magnifier and the close button share a centre line at every header height, on both.\n")
