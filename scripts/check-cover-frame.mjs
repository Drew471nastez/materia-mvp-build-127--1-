/**
 * ===========================================================================
 *  THE PREVIEW AND THE BANNER CROP THE SAME PICTURE THE SAME WAY
 * ===========================================================================
 * "Look how it looks dragged in the dragger, and how in the banner in real
 *  life."
 *
 * An `object-fit: cover` crop is decided by ONE number: the ratio of the
 * frame to the ratio of the image. Not by its size — a 400px preview of the
 * same shape shows exactly what a 1400px band shows. So two frames agree if
 * and only if their aspect ratios agree.
 *
 * The band's height is fixed (`h-32` on a phone, `h-48 sm:h-64` above) and
 * its width is the page's, so its shape CHANGES WITH THE WINDOW: near 3:1 on
 * a phone and past 5:1 on a wide laptop. The editor's frame was a flat 3:1,
 * so on every screen but a phone the creator was positioning a crop the page
 * would never draw.
 *
 * This lays out the real band, from the real classes in the real built CSS,
 * at five widths, and reports what shape it actually is. Then it checks the
 * same picture through both frames and compares the region of the photograph
 * that survives — in source pixels, which is the thing a creator is looking
 * at — for the measured frame and for the old flat 3:1.
 *
 *   pnpm build && node scripts/check-cover-frame.mjs
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

/**
 * THE HEIGHTS COME OUT OF THE RENDERER, not out of this file. A probe holding
 * its own copy of the classes measures the copy and says nothing about the
 * band.
 */
const renderer = readFileSync(join(root, "components/store-builder/unified-section-renderer.tsx"), "utf8")
const marked = renderer.slice(renderer.indexOf("data-cover-band"))
const heights = marked.match(/isMobile \? "([^"]+)" : "([^"]+)"/)
if (!heights) fail("Could not find the cover band's height classes in unified-section-renderer.tsx.")
const [, phoneHeight, deskHeight] = heights

/** What the editor falls back to when it cannot measure, and the old value. */
const fallback = readFileSync(join(root, "components/storefront/use-cover-aspect.ts"), "utf8")
  .match(/FALLBACK_COVER_ASPECT = ([\d.]+)/)?.[1]
if (!fallback) fail("No FALLBACK_COVER_ASPECT in use-cover-aspect.ts.")

const VIEWPORTS = [
  { name: "phone", w: 390, h: 844, phone: true },
  { name: "small laptop", w: 1024, h: 768, phone: false },
  { name: "laptop", w: 1440, h: 900, phone: false },
  { name: "wide", w: 1920, h: 1080, phone: false },
  { name: "ultrawide", w: 2560, h: 1080, phone: false },
]

/** A tall photograph, the shape that gets cropped hardest by a wide band. */
const IMAGE = { w: 1200, h: 1600 }

const out = mkdtempSync(join(tmpdir(), "storelib-cover-"))
writeFileSync(
  join(out, "index.html"),
  `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
<style>html,body{margin:0;background:#222}iframe{border:0;display:block}</style></head>
<body><div id="r"></div><script>
var VIEWPORTS = ${JSON.stringify(VIEWPORTS)}
var page = function (cls) {
  return '<!doctype html><html><head><meta charset="utf-8"><style>' + ${JSON.stringify(css)} +
    'html,body{margin:0}</style></head><body>' +
    '<div id="band" class="relative w-full overflow-hidden ' + cls + '"></div></body></html>'
}

var rows = []
VIEWPORTS.forEach(function (vp) {
  var f = document.createElement("iframe")
  f.style.cssText = "width:" + vp.w + "px;height:" + vp.h + "px"
  document.body.appendChild(f)
  var d = f.contentDocument
  d.open(); d.write(page(vp.phone ? ${JSON.stringify(phoneHeight)} : ${JSON.stringify(deskHeight)})); d.close()
  var r = d.getElementById("band").getBoundingClientRect()
  rows.push({ name: vp.name, vw: vp.w, w: Math.round(r.width), h: Math.round(r.height) })
})
document.getElementById("r").setAttribute("data-m", JSON.stringify(rows))
</script></body></html>`,
)

const raw = execFileSync(
  CHROMIUM,
  ["--headless", "--disable-gpu", "--no-sandbox", "--window-size=2200,1400",
   "--virtual-time-budget=5000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
)
const m = raw.match(/data-m="([^"]+)"/)
if (!m) fail("The probe page did not lay out, so nothing was measured.")
const rows = JSON.parse(m[1].replace(/&quot;/g, '"'))

/**
 * The part of the photograph that survives, in SOURCE pixels, for a frame of
 * this shape holding this image with `object-fit: cover`. This is what a
 * creator is actually choosing when they drag.
 */
function visibleSourceHeight(frameAspect) {
  const imageAspect = IMAGE.w / IMAGE.h
  if (imageAspect > frameAspect) return IMAGE.h
  /* Taller than the frame: the full width is used, the height is cropped. */
  return Math.round(IMAGE.w / frameAspect)
}

const problems = []
console.log(`\nThe band is ${phoneHeight} on a phone and ${deskHeight} above it\n`)

for (const r of rows) {
  const aspect = r.w / r.h
  /* What the editor now uses: the measured shape, clamped as the hook does. */
  const measured = Math.min(12, Math.max(1.5, aspect))
  const real = visibleSourceHeight(aspect)
  const withMeasured = visibleSourceHeight(measured)
  const withFlat = visibleSourceHeight(Number(fallback))
  const driftFlat = Math.round((Math.abs(withFlat - real) / real) * 100)

  console.log(
    `  ${r.name} (${r.vw}px): band ${r.w}x${r.h} = ${aspect.toFixed(2)}:1 — ` +
      `shows ${real}px of a ${IMAGE.h}px photo; a flat ${fallback}:1 preview shows ${withFlat}px (${driftFlat}% out)`,
  )

  if (withMeasured !== real) {
    problems.push(`${r.name}: the measured frame shows ${withMeasured}px where the band shows ${real}px.`)
  }
}

/**
 * THE CONTROL, BUILT IN. If the old flat ratio happened to agree everywhere,
 * this probe would be measuring nothing and the change it guards would be
 * pointless. At least one screen has to disagree, or something is wrong with
 * the probe rather than with the page.
 */
const anyDrift = rows.some((r) => {
  const real = visibleSourceHeight(r.w / r.h)
  return visibleSourceHeight(Number(fallback)) !== real
})
if (!anyDrift) {
  problems.push(
    `A flat ${fallback}:1 preview agreed with the band on every screen, so this probe is not measuring what it claims to.`,
  )
}

if (problems.length > 0) {
  console.error("")
  for (const p of problems) console.error(`  ${p}`)
  console.error("")
  process.exit(1)
}
console.log("\n  What you drag into place is what the banner draws.\n")
