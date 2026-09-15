/**
 * ===========================================================================
 *  HOW BIG THE PROFILE PICTURE OPENS
 * ===========================================================================
 * "When the avatar is clicked it opens that big, it feels like it's too big."
 *
 * The size is one `min()` expression, and an opinion about a `min()` is worth
 * very little: what matters is the number it resolves to on a phone, on a
 * short laptop and on a desktop, and whether the circle is still a circle at
 * each one.
 *
 * THE EXPRESSION IS READ OUT OF THE COMPONENT rather than copied into here.
 * A probe holding its own copy measures the copy, passes, and says nothing at
 * all about the file it is supposed to be checking.
 *
 * What it asserts, at each viewport:
 *   - the circle fits, with real ground around it on every side
 *   - it is not taking the screen over (at most 62% of the height)
 *   - it is still clearly bigger than the 150px circle in the header, or
 *     opening it was not worth a dialog
 *   - width and height are equal, so `aspect-square` is doing its job
 *
 *   node scripts/check-avatar-lightbox.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const source = readFileSync(join(root, "components/storefront/avatar-lightbox.tsx"), "utf8")

/** The one that sizes the open picture, taken from the file itself. */
const width = source.match(/style=\{\{\s*width:\s*"([^"]+)"\s*\}\}/)?.[1]
if (!width) fail("No width expression found in components/storefront/avatar-lightbox.tsx.")

const img = source.match(/<img[\s\S]*?\/>/)?.[0] ?? ""
const classes = img.match(/className="([^"]+)"/)?.[1] ?? ""
for (const wanted of ["aspect-square", "rounded-full", "object-cover"]) {
  if (!classes.includes(wanted)) {
    fail(`The open picture has lost \`${wanted}\`. Without all three it is not the header's crop, just bigger.`)
  }
}

/** The header's own circle, which is what this has to beat to be worth opening. */
const HEADER_AVATAR = 150

/**
 * MEASURED IN A SIZED IFRAME, not in the browser window. Headless Chromium
 * refuses to make its window narrower than 500px, so `--window-size=390` gives
 * a 500px viewport and every `vw` in the result is wrong — which would have
 * passed a phone number that no phone ever sees. `vw` and `vh` inside a frame
 * resolve to the frame, so the frame is the viewport.
 */
const VIEWPORTS = [
  { name: "small phone", w: 360, h: 780 },
  { name: "phone", w: 390, h: 844 },
  { name: "phone, landscape", w: 844, h: 390 },
  { name: "short laptop", w: 1280, h: 720 },
  { name: "desktop", w: 1440, h: 900 },
]

const out = mkdtempSync(join(tmpdir(), "storelib-lightbox-"))
writeFileSync(
  join(out, "index.html"),
  `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#222}</style></head>
<body><div id="r"></div><script>
var VIEWPORTS = ${JSON.stringify(VIEWPORTS)}
/* aspect-square + rounded-full + object-cover, as Tailwind emits them, and
   the width expression exactly as it appears in the component. */
var page = '<!doctype html><html><head><meta charset="utf-8"><style>' +
  'html,body{margin:0;height:100%}' +
  'body{display:flex;align-items:center;justify-content:center;background:#000}' +
  'img{aspect-ratio:1/1;height:auto;border-radius:9999px;object-fit:cover;width:${width}}' +
  '</style></head><body><img id="shot" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"></body></html>'

var rows = []
VIEWPORTS.forEach(function (vp) {
  var f = document.createElement("iframe")
  f.style.cssText = "border:0;display:block;width:" + vp.w + "px;height:" + vp.h + "px"
  document.body.appendChild(f)
  /* document.write, not srcdoc: a srcdoc frame loads asynchronously and its
     contentDocument is still about:blank on the next line. */
  var d = f.contentDocument
  d.open(); d.write(page); d.close()
  var shot = d.getElementById("shot")
  var r = shot.getBoundingClientRect()
  rows.push({
    name: vp.name,
    w: Math.round(r.width), h: Math.round(r.height),
    left: Math.round(r.left), top: Math.round(r.top),
    vw: f.contentWindow.innerWidth, vh: f.contentWindow.innerHeight,
  })
})
document.getElementById("r").setAttribute("data-m", JSON.stringify(rows))
</script></body></html>`,
)

const problems = []
console.log(`\nThe open picture is sized \`${width}\`\n`)

const raw = execFileSync(
  CHROMIUM,
  ["--headless", "--disable-gpu", "--no-sandbox", "--window-size=1600,1200",
   "--virtual-time-budget=4000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
)
const m = raw.match(/data-m="([^"]+)"/)
if (!m) fail("The probe page did not lay out, so nothing was measured.")
const rows = JSON.parse(m[1].replace(/&quot;/g, '"'))
if (rows.length !== VIEWPORTS.length) fail(`Measured ${rows.length} of ${VIEWPORTS.length} viewports.`)

for (const r of rows) {
  const pctH = Math.round((r.h / r.vh) * 100)
  const pctW = Math.round((r.w / r.vw) * 100)
  console.log(`  ${r.name} (${r.vw}x${r.vh}): ${r.w}x${r.h}px, ${pctW}% of the width and ${pctH}% of the height`)

  if (r.w !== r.h) problems.push(`${r.name}: ${r.w}x${r.h}. That is not a circle.`)
  if (pctH > 62) problems.push(`${r.name}: ${pctH}% of the screen's height. That is a picture taking the page over.`)
  if (pctW > 82) problems.push(`${r.name}: ${pctW}% of the screen's width, so there is no ground left to press to close.`)
  if (r.w <= HEADER_AVATAR * 1.4) {
    problems.push(`${r.name}: ${r.w}px against a ${HEADER_AVATAR}px circle in the header. Not worth opening.`)
  }
}

if (problems.length > 0) {
  console.error("")
  for (const p of problems) console.error(`  ${p}`)
  console.error("")
  process.exit(1)
}
console.log("\n  Big enough to look at, small enough to be a picture on a page.\n")
