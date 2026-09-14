/**
 * ===========================================================================
 *  THE CREATOR'S PICTURE, IN A TAB
 * ===========================================================================
 * The favicon is drawn on a canvas from the creator's own avatar. It used to
 * be drawn with `drawImage(img, 0, 0, size, size)`, which scales the source
 * to fit a square exactly — so a portrait photo came out squeezed along one
 * axis, which at sixteen pixels reads as a small, wrong picture.
 *
 * This is measurable rather than arguable: draw a source with KNOWN stripes
 * through the real component, then read the pixels back. If the aspect ratio
 * was kept, a stripe that is square in the source is square in the icon.
 *
 *   pnpm build && node scripts/check-favicon.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const out = mkdtempSync(join(tmpdir(), "storelib-favicon-"))
const bundle = join(out, "probe.js")
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-favicon.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"}};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, "--loader:.css=empty"],
  { stdio: ["ignore", "ignore", "inherit"] })

const DRIVE = `
<script>
setTimeout(function () {
  var link = document.querySelector("link[rel='icon']")
  if (!link || link.href.slice(0, 15) !== "data:image/png;") {
    var pre0 = document.createElement("pre"); pre0.id = "result"
    pre0.textContent = JSON.stringify({ error: "no png favicon was set: " + (link ? link.href.slice(0, 40) : "none") })
    document.body.append(pre0); return
  }
  var img = new Image()
  img.onload = function () {
    var c = document.createElement("canvas")
    c.width = img.width; c.height = img.height
    var g = c.getContext("2d")
    g.drawImage(img, 0, 0)
    var px = function (x, y) { var d = g.getImageData(Math.round(x), Math.round(y), 1, 1).data; return [d[0], d[1], d[2], d[3]] }
    var s = img.width
    /*
     * THE SOURCE is 100 wide by 300 tall: a red square on top, then white,
     * then a blue square, each exactly 100 tall — so each band is a SQUARE in
     * the source. Covering a square icon crops the top and bottom bands away
     * entirely and leaves the middle. Stretching, which is what it used to
     * do, squashes all three in so the red and blue are still visible.
     */
    var pre = document.createElement("pre"); pre.id = "result"
    pre.textContent = JSON.stringify({
      iconSize: s,
      sizesAttr: link.getAttribute("sizes"),
      centre: px(s / 2, s / 2),
      nearTop: px(s / 2, s * 0.12),
      nearBottom: px(s / 2, s * 0.88),
      corner: px(1, 1),
    })
    document.body.append(pre)
  }
  img.src = link.href
}, 900)
</script>`

writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><script src="probe.js"></script>${DRIVE}</body></html>`)

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--allow-file-access-from-files",
  "--window-size=500,400", "--virtual-time-budget=12000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 })
const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("The favicon never reported.")
const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"))
if (r.error) fail(r.error)

const near = (c, want) => Math.abs(c[0] - want[0]) < 40 && Math.abs(c[1] - want[1]) < 40 && Math.abs(c[2] - want[2]) < 40
const RED = [220, 38, 38], BLUE = [37, 99, 235], WHITE = [255, 255, 255]

console.log(`\n  icon: ${r.iconSize}x${r.iconSize}, sizes="${r.sizesAttr}"`)
console.log(`  source was 100x300 — red square, white square, blue square`)
console.log(`  centre ${r.centre.slice(0, 3)}  near the top ${r.nearTop.slice(0, 3)}  near the bottom ${r.nearBottom.slice(0, 3)}`)
console.log(`  a corner pixel: alpha ${r.corner[3]}`)

const problems = []
if (r.iconSize < 128) problems.push(`The icon is ${r.iconSize}px. A tab asks for 32 CSS pixels at 2x or 3x, so anything under 128 is upscaled and soft.`)
if (!near(r.centre, WHITE)) problems.push(`The middle of the icon is ${r.centre.slice(0, 3)} and the middle of the source is white. The crop is not centred.`)
if (near(r.nearTop, RED) || near(r.nearBottom, BLUE)) {
  problems.push(`The red top and blue bottom of a 1:3 source are still inside the icon, so all three bands were squeezed in rather than the picture being cropped to fill. That is the squashed favicon.`)
}
if (r.corner[3] > 40) problems.push(`A corner pixel has alpha ${r.corner[3]}; the rounded clip should leave it transparent.`)
if (!r.sizesAttr) problems.push(`The icon link carries no sizes attribute, so a browser has to guess which one to use.`)

if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  console.error("")
  process.exit(1)
}
console.log(`\nThe picture fills the icon at its own aspect ratio, cropped and centred, with rounded corners.\n`)
