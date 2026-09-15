/**
 * ===========================================================================
 *  THE OWNER'S ROW LINES UP WITH THE TAB IT IS ON
 * ===========================================================================
 * "Look how misaligned these are."
 *
 * Right-aligned, the Arrange button was a filled dark chip alone on a row: its
 * right edge on the grid's, the heading hard left three inches away, nothing
 * else on the line. Everything on a catalogue tab hangs off one left edge —
 * the heading, every card, the empty state — and this was the one thing that
 * did not.
 *
 * Alignment is geometry, so it is measured rather than eyeballed. The class
 * strings come out of the components themselves; a probe holding its own copy
 * of them would line up its copy and say nothing about the page.
 *
 *   pnpm build && node scripts/check-arrange-row.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(join(cssDir, f), "utf8"))
  .join("\n")

const read = (p) => readFileSync(join(root, p), "utf8")

/* ---------------------------------------------------------------------------
   The real class strings, read from the real files.
   --------------------------------------------------------------------------- */
const grid = read("components/storefront/all-products-grid.tsx")
const header = read("components/storefront/catalog-controls.tsx")
const arrange = read("components/storefront/arrange-products-button.tsx")

const container = grid.match(/<div className="(mx-auto w-full max-w-\[1100px\][^"]*)"/)?.[1]
if (!container) fail("Could not find the Products tab's container classes.")

const headerRow = header.match(/<div className="(mb-5 flex min-h-9[^"]*)"/)?.[1]
if (!headerRow) fail("Could not find CatalogHeader's row classes.")

const rowWrap = arrange.match(/<div className="(mb-\d+ flex[^"]*)"/)?.[1]
if (!rowWrap) fail("Could not find ArrangeProductsRow's wrapper classes.")

const button = arrange.match(/"(inline-flex shrink-0 items-center[^"]+)"/)?.[1]
if (!button) fail("Could not find the Arrange button's classes.")

const gridWrap = grid.match(/<div className="(grid grid-cols-1[^"]*)"/)?.[1]
if (!gridWrap) fail("Could not find the product grid's classes.")

console.log(`\n  row wrapper:  ${rowWrap}`)

const VIEWPORTS = [
  { name: "phone", w: 390, h: 844 },
  { name: "tablet", w: 768, h: 1024 },
  { name: "laptop", w: 1440, h: 900 },
]

const out = mkdtempSync(join(tmpdir(), "storelib-arrange-"))
const body =
  `<div class="${container}">` +
  `<div class="${headerRow}"><h2 id="heading" class="min-w-0 truncate font-semibold text-foreground text-lg sm:text-xl lg:text-2xl">Featured</h2></div>` +
  `<div class="${rowWrap}"><button id="arrange" class="${button}">Arrange</button></div>` +
  `<div class="${gridWrap}"><div id="card" style="height:220px;background:#ddd;border-radius:12px"></div>` +
  `<div style="height:220px;background:#ddd;border-radius:12px"></div>` +
  `<div style="height:220px;background:#ddd;border-radius:12px"></div></div>` +
  `</div>`

writeFileSync(
  join(out, "index.html"),
  `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
<style>html,body{margin:0;background:#222}iframe{border:0;display:block}</style></head>
<body><div id="r"></div><script>
var VIEWPORTS = ${JSON.stringify(VIEWPORTS)}
var page = '<!doctype html><html><head><meta charset="utf-8"><style>' + ${JSON.stringify(css)} +
  'html,body{margin:0;background:#fff}</style></head><body>' + ${JSON.stringify(body)} + '</body></html>'

var rows = []
VIEWPORTS.forEach(function (vp) {
  var f = document.createElement("iframe")
  f.style.cssText = "width:" + vp.w + "px;height:" + vp.h + "px"
  document.body.appendChild(f)
  var d = f.contentDocument
  d.open(); d.write(page); d.close()
  var box = function (id) {
    var r = d.getElementById(id).getBoundingClientRect()
    return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) }
  }
  rows.push({ name: vp.name, vw: vp.w, heading: box("heading"), arrange: box("arrange"), card: box("card") })
})
document.getElementById("r").setAttribute("data-m", JSON.stringify(rows))
</script></body></html>`,
)

const raw = execFileSync(
  CHROMIUM,
  ["--headless", "--disable-gpu", "--no-sandbox", "--window-size=1800,1400",
   "--virtual-time-budget=5000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
)
const m = raw.match(/data-m="([^"]+)"/)
if (!m) fail("The probe page did not lay out, so nothing was measured.")
const rows = JSON.parse(m[1].replace(/&quot;/g, '"'))
if (rows.length !== VIEWPORTS.length) fail(`Measured ${rows.length} of ${VIEWPORTS.length} widths.`)

const problems = []
console.log("")

for (const r of rows) {
  const above = r.arrange.t - r.heading.b
  const below = r.card.t - r.arrange.b
  console.log(
    `  ${r.name} (${r.vw}px): heading left ${r.heading.l}, Arrange left ${r.arrange.l}, card left ${r.card.l} — ` +
      `${above}px under the heading, ${below}px above the grid`,
  )

  if (r.arrange.l !== r.heading.l) {
    problems.push(`${r.name}: Arrange starts at ${r.arrange.l} and the heading at ${r.heading.l}.`)
  }
  if (r.arrange.l !== r.card.l) {
    problems.push(`${r.name}: Arrange starts at ${r.arrange.l} and the first card at ${r.card.l}.`)
  }
  /* It is a control FOR the grid, so it belongs to the grid: closer to what it
     acts on than to the heading above it. */
  if (below >= above) {
    problems.push(
      `${r.name}: ${above}px above and ${below}px below, so it reads as hanging off the heading rather than as belonging to the grid.`,
    )
  }
  /* And it must not be wider than the column it sits in. */
  if (r.arrange.r > r.card.r + 1) {
    problems.push(`${r.name}: Arrange ends at ${r.arrange.r}, past the grid's ${r.card.r}.`)
  }
}

if (problems.length > 0) {
  console.error("")
  for (const p of problems) console.error(`  ${p}`)
  console.error("")
  process.exit(1)
}
console.log("\n  One left edge: the heading, the button, the first card.\n")
