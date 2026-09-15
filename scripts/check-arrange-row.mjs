/**
 * ===========================================================================
 *  THE OWNER'S CONTROL COSTS NO VERTICAL SPACE
 * ===========================================================================
 * "Let the Arrange be positioned on the right side, but do not create an
 *  unnecessary vertical gap between Featured and the product cards."
 *
 * Both halves are geometry, and the second one is the kind of claim that is
 * easy to believe and wrong: a control in its own row obviously costs a row,
 * but a control dropped into an existing row costs nothing ONLY IF that row
 * is already at least as tall as the control. The catalogue header is
 * `min-h-9` — 36px — and the button is about 30px, so it should cost zero.
 * Should is not a measurement.
 *
 * So the page is laid out TWICE, once with the button and once without, and
 * the distance from the top of the header row to the top of the first card is
 * compared. Equal means the button is free. Anything else is the gap that was
 * complained about.
 *
 * The rest: it sits in the header row rather than under it, it ends on the
 * same right edge as the grid, and on a phone — where the Products tab also
 * carries a category pill and a sort control — nothing overflows and the
 * heading is still legible.
 *
 * Every class string is read out of the components. A probe holding its own
 * copy lines up its copy and says nothing about the page.
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

const grid = read("components/storefront/all-products-grid.tsx")
const header = read("components/storefront/catalog-controls.tsx")
const arrange = read("components/storefront/arrange-products-button.tsx")

const pick = (src, re, what) => {
  const hit = src.match(re)?.[1]
  if (!hit) fail(`Could not find ${what}.`)
  return hit
}

const container = pick(grid, /<div className="(mx-auto w-full max-w-\[1100px\][^"]*)"/, "the tab's container classes")
const headerRow = pick(header, /<div className="(mb-5 flex min-h-9[^"]*)"/, "CatalogHeader's row classes")
const cluster = pick(header, /<div className="(ml-auto flex [^"]*items-center gap-2)"/, "CatalogHeader's control cluster")
const categoryPill = pick(header, /"(inline-flex h-9 [^"]*items-center gap-2 rounded-full[^"]*)"/, "the category pill")
/**
 * THE SORT CONTROL HAS TWO SHAPES AND THE PHONE GETS THE SMALL ONE. Modelling
 * it as the wide "Sort: Most Recent" pill everywhere overstates how crowded a
 * 390px row is by about 100px, which would make this probe fail on a layout
 * that is fine. The grid renders both and lets CSS choose, so this does too.
 */
const sortBase = pick(header, /"(inline-flex shrink-0 items-center gap-2 text-sm text-muted-foreground[^"]*)"/, "the sort trigger")
const sortCompact = pick(header, /compact \? "([^"]+)" : /, "the sort control's phone shape")
const sortFull = pick(header, /compact \? "[^"]+" : "([^"]+)"/, "the sort control's desktop shape")
const button = pick(arrange, /"(inline-flex shrink-0 items-center gap-1\.5[^"]+)"/, "the Arrange button")
const gridWrap = pick(grid, /<div className="(grid grid-cols-1[^"]*)"/, "the product grid")

console.log(`\n  Arrange: ${button.slice(0, 64)}…`)

const VIEWPORTS = [
  { name: "phone", w: 390, h: 844 },
  { name: "tablet", w: 768, h: 1024 },
  { name: "laptop", w: 1440, h: 900 },
]

/**
 * Two tabs, because they put different things in the row. Home's right-hand
 * side is otherwise empty; the Products tab already has a category pill and a
 * sort control, and the phone is where those three have to share 390px.
 */
const TABS = [
  { key: "home", title: "Featured", filters: false, category: "" },
  { key: "products", title: "Products", filters: true, category: "Limited edition prints (12)" },
]

const card = `<div class="card" style="height:220px;background:#ddd;border-radius:12px"></div>`

const out = mkdtempSync(join(tmpdir(), "storelib-arrange-"))
writeFileSync(
  join(out, "index.html"),
  `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
<style>html,body{margin:0;background:#222}iframe{border:0;display:block}</style></head>
<body><div id="r"></div><script>
var VIEWPORTS = ${JSON.stringify(VIEWPORTS)}
var TABS = ${JSON.stringify(TABS)}

function body(tab, mode) {
  /* mode: "off" no button, "row" the button in the header row, "own" the
     button in a row of its own below the header, which is where it was. */
  var controls = ""
  if (tab.filters) {
    /*
      THE WORST CASE THE PILL ALLOWS, not the friendliest. Its label is
      max-w-[45vw] truncate, so on a 390px phone it can be 175px wide, and a
      creator with a real category name will be. Modelling it as "All (12)"
      measures a row nobody with categories ever sees.
    */
    controls += '<span class="${categoryPill}"><span class="max-w-[45vw] truncate sm:max-w-none">' + tab.category + '</span></span>'
    /*
      The base display class is stripped from each variant, because the
      component merges these through cn(), which is tailwind-merge: it DROPS a
      base class that a later one conflicts with, so "hidden sm:inline-flex"
      wins over a base "inline-flex". Pasting both into a class attribute does
      not do that. The stylesheet's own order decides, the base wins, and BOTH
      sort variants render at phone width. That cost this probe a false
      failure: it reported the heading squeezed to 6px by a control that is
      not on the screen.

      No backticks in here. This block is inside a template literal.
    */
    controls += '<span class="${sortBase.replace(/^inline-flex /, "")} ${sortCompact} inline-flex sm:hidden">S</span>'
    controls += '<span class="${sortBase.replace(/^inline-flex /, "")} ${sortFull} hidden sm:inline-flex">Sort: Most Recent</span>'
  }
  var arrangeHtml = '<button id="arrange" class="${button}">Arrange</button>'
  if (mode === "row") controls += arrangeHtml
  var clusterHtml = controls ? '<div class="${cluster}">' + controls + '</div>' : ''
  var ownRowHtml = mode === "own" ? '<div class="mb-4 flex">' + arrangeHtml + '</div>' : ''
  return '<div class="${container}">' +
    '<div id="row" class="${headerRow}">' +
      '<h2 id="heading" class="min-w-0 truncate font-semibold text-foreground text-lg sm:text-xl lg:text-2xl">' + tab.title + '</h2>' +
      clusterHtml +
    '</div>' +
    ownRowHtml +
    '<div id="grid" class="${gridWrap}">' + ${JSON.stringify(card + card + card)} + '</div>' +
  '</div>'
}

function page(tab, mode) {
  return '<!doctype html><html><head><meta charset="utf-8"><style>' + ${JSON.stringify(css)} +
    'html,body{margin:0;background:#fff}</style></head><body>' + body(tab, mode) + '</body></html>'
}

var rows = []
VIEWPORTS.forEach(function (vp) {
  TABS.forEach(function (tab) {
    var measure = function (mode) {
      var f = document.createElement("iframe")
      f.style.cssText = "width:" + vp.w + "px;height:" + vp.h + "px"
      document.body.appendChild(f)
      var d = f.contentDocument
      d.open(); d.write(page(tab, mode)); d.close()
      var box = function (el) {
        if (!el) return null
        var r = el.getBoundingClientRect()
        return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }
      }
      var cards = d.querySelectorAll(".card")
      return {
        row: box(d.getElementById("row")),
        heading: box(d.getElementById("heading")),
        arrange: box(d.getElementById("arrange")),
        grid: box(d.getElementById("grid")),
        firstCard: box(cards[0]),
        lastCard: box(cards[cards.length - 1]),
        scrollW: d.documentElement.scrollWidth,
        clientW: d.documentElement.clientWidth,
      }
    }
    rows.push({ name: vp.name, vw: vp.w, tab: tab.key, on: measure("row"), off: measure("off"), own: measure("own") })
  })
})
document.getElementById("r").setAttribute("data-m", JSON.stringify(rows))
</script></body></html>`,
)

const raw = execFileSync(
  CHROMIUM,
  ["--headless", "--disable-gpu", "--no-sandbox", "--window-size=1800,1400",
   "--virtual-time-budget=6000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
)
const m = raw.match(/data-m="([^"]+)"/)
if (!m) fail("The probe page did not lay out, so nothing was measured.")
const rows = JSON.parse(m[1].replace(/&quot;/g, '"'))
if (rows.length !== VIEWPORTS.length * TABS.length) {
  fail(`Measured ${rows.length} of ${VIEWPORTS.length * TABS.length} cases.`)
}

const problems = []
console.log("")

for (const r of rows) {
  const { on, off, own } = r
  if (!on.arrange) {
    problems.push(`${r.tab} at ${r.name}: the button did not render at all.`)
    continue
  }

  /* The number the complaint was about. */
  const withButton = on.firstCard.t - on.row.t
  const without = off.firstCard.t - off.row.t
  const cost = withButton - without
  /* The layout this replaced, measured alongside: the same button in a row of
     its own under the header. */
  const ownRowCost = own.firstCard.t - own.row.t - without

  console.log(
    `  ${r.tab} / ${r.name} (${r.vw}px): heading to first card ${withButton}px, ` +
      `${without}px without the button — costs ${cost}px. ` +
      `Arrange right ${on.arrange.r}, grid right ${on.grid.r}, ` +
      `heading ${on.heading.w}px wide (${off.heading.w}px without the button). ` +
      `In a row of its own it would cost ${ownRowCost}px`,
  )

  if (cost !== 0) {
    problems.push(
      `${r.tab} at ${r.name}: the button adds ${cost}px between the heading and the cards. That is the gap.`,
    )
  }
  /**
   * THE CONTROL, BUILT IN. "It costs nothing" is only worth reading if this
   * probe can tell a layout that costs something. The row it replaced is laid
   * out alongside on every pass; if that one also came out free, the
   * measurement is not measuring vertical space at all.
   */
  if (ownRowCost <= 0) {
    problems.push(
      `${r.tab} at ${r.name}: a button in its own row measured as costing ${ownRowCost}px, so this probe cannot see a gap and its verdict means nothing.`,
    )
  }

  /* In the row, not under it. */
  const sameRow = on.arrange.t >= on.row.t && on.arrange.b <= on.row.b
  if (!sameRow) {
    problems.push(`${r.tab} at ${r.name}: the button is outside the header row (${on.arrange.t}..${on.arrange.b} against ${on.row.t}..${on.row.b}).`)
  }

  /* On the right, flush with the grid's own right edge. */
  if (Math.abs(on.arrange.r - on.grid.r) > 1) {
    problems.push(`${r.tab} at ${r.name}: the button ends at ${on.arrange.r} and the grid at ${on.grid.r}.`)
  }
  if (on.arrange.l <= on.heading.l) {
    problems.push(`${r.tab} at ${r.name}: the button is not to the right of the heading.`)
  }

  /* Nothing pushed off the edge, and a heading you can still read. */
  if (on.scrollW > on.clientW) {
    problems.push(`${r.tab} at ${r.name}: the row overflows (${on.scrollW} > ${on.clientW}).`)
  }
  if (on.heading.w < 40) {
    problems.push(`${r.tab} at ${r.name}: the heading is squeezed to ${on.heading.w}px.`)
  }
}

if (problems.length > 0) {
  console.error("")
  for (const p of problems) console.error(`  ${p}`)
  console.error("")
  process.exit(1)
}
console.log("\n  On the right, in the row that was already there, for nothing.\n")
