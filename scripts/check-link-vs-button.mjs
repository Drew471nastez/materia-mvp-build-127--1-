/**
 * ===========================================================================
 *  A LINK IS NOT A BUTTON
 * ===========================================================================
 * Five rules styled buttons, across lib/website-builder/theme-css.ts and
 * lib/storelib-theme/typography.ts, and every one of them was written
 * `[data-section] a[href]`. So every link in every section was a button: the
 * nav, the footer's links, a product card whose title is a link, and the
 * site's own wordmark, which is an anchor to the home page. They took the
 * button's face, its letter-spacing, its text-transform, its radius, its
 * weight, its shadow, its hover motion, and — with the Outline button style
 * — a one pixel border drawn round each of them.
 *
 * WHY IT SURVIVED. With the shipped defaults the Button style is the body
 * face at weight 600 with no tracking and no transform, and the default
 * button style is Filled, so a link styled as a button looks exactly like a
 * link. Everything here is therefore rendered against a LOUD button style —
 * the accent face, uppercase, 2px of tracking, a 22px radius, Outline — all
 * of them settings a creator really has. Against those, a link that is being
 * treated as a button cannot hide.
 *
 * What is asserted is the pair, not either half: the real buttons must take
 * every one of those properties, and the four things that are not buttons
 * must take none of them. A rule that styles nothing passes the second half
 * and fails the first.
 *
 *   pnpm build && node scripts/check-link-vs-button.mjs
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

const stubs = join(root, ".lvb-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/"
export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)

const out = mkdtempSync(join(tmpdir(), "storelib-lvb-"))
const bundle = join(out, "probe.js")
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-link-vs-button.tsx"),
  "--bundle", "--platform=node", "--format=cjs", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@=${root}`],
  { stdio: ["ignore", "ignore", "inherit"] })
execFileSync("node", [bundle], { env: { ...process.env, OUT_DIR: out }, stdio: ["ignore", "ignore", "inherit"] })
const PIC = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#8b5cf6"/></svg>').toString("base64")
const body = readFileSync(join(out, "page.html"), "utf8").replace(/src="https:\/\/example\.invalid\/[^"]*"/g, `src="${PIC}"`)

/*
  Read back the four properties the loud style sets, for the six hand-written
  cases and for every link and button in every shipped section.
*/
const MEASURE = `
<script>
(function () {
  function readOne(el) {
    var s = getComputedStyle(el)
    return {
      family: s.fontFamily,
      transform: s.textTransform,
      tracking: s.letterSpacing,
      radius: s.borderTopLeftRadius,
      borderWidth: s.borderTopWidth,
      borderStyle: s.borderTopStyle,
      label: (el.textContent || "").trim().slice(0, 24),
      tag: el.tagName.toLowerCase(),
    }
  }
  var hand = {}
  document.querySelectorAll("[data-role]").forEach(function (el) { hand[el.getAttribute("data-role")] = readOne(el) })

  /* And every anchor in every shipped section that is NOT marked as a
     button, so the claim covers the theme rather than six hand-written
     lines. */
  var strays = []
  var examined = 0
  document.querySelectorAll('.probe[data-type]:not([data-type="__hand__"])').forEach(function (probe) {
    probe.querySelectorAll("a[href]").forEach(function (el) {
      if (el.closest('button, [role="button"], .s__btn, [data-button]')) return
      var r = el.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) return
      examined++
      var v = readOne(el)
      if (v.transform === "uppercase" || v.tracking === "2px" || (parseFloat(v.radius) >= 20)) {
        strays.push({ type: probe.getAttribute("data-type"), label: v.label, transform: v.transform, tracking: v.tracking, radius: v.radius })
      }
    })
  })

  var pre = document.createElement("pre"); pre.id = "result"
  pre.textContent = JSON.stringify({ hand: hand, strays: strays.slice(0, 12), strayCount: strays.length, examined: examined, probes: document.querySelectorAll(".probe[data-type]").length, anchors: document.querySelectorAll('.probe[data-type]:not([data-type="__hand__"]) a[href]').length })
  document.body.append(pre)
})()
</script>`

const file = join(out, "i.html")
writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>
  body{margin:0;background:#fff;font-family:Inter,system-ui,sans-serif}
  .probe{width:1100px;margin:0 auto}
</style></head><body>${body}${MEASURE}</body></html>`)
const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=1140,1400", "--virtual-time-budget=8000", "--run-all-compositor-stages-before-draw",
  "--dump-dom", `file://${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 })
const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("The page did not report.")
const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))

let bad = 0
const expect = (ok, what, got) => {
  console.log(`${ok ? "  ok" : "FAIL"}  ${what}${got === undefined ? "" : `  →  ${got}`}`)
  if (!ok) bad++
}

const BUTTONS = ["button-class", "button-element", "button-marked"]
const NOT_BUTTONS = ["link-in-a-sentence", "link-in-a-nav", "wordmark"]

console.log("\nAgainst a loud button style: the accent face, uppercase, 2px tracking, a 22px radius, outline\n")

for (const role of [...BUTTONS, ...NOT_BUTTONS]) {
  const v = r.hand[role]
  if (!v) { expect(false, `${role}: rendered`); continue }
  console.log(`  ${role.padEnd(20)} ${v.transform}, ${v.tracking}, radius ${v.radius}, ${v.borderWidth} ${v.borderStyle}`)
}
console.log("")

for (const role of BUTTONS) {
  const v = r.hand[role]
  if (!v) continue
  expect(v.transform === "uppercase" && v.tracking === "2px" && parseFloat(v.radius) >= 20,
    `${role}: takes the button style, so this is measuring something`,
    `${v.transform}, ${v.tracking}, radius ${v.radius}`)
}
for (const role of NOT_BUTTONS) {
  const v = r.hand[role]
  if (!v) continue
  expect(v.transform !== "uppercase" && v.tracking !== "2px" && parseFloat(v.radius) < 20 && parseFloat(v.borderWidth) === 0,
    `${role}: is left alone`,
    `${v.transform}, ${v.tracking}, radius ${v.radius}, border ${v.borderWidth}`)
}

/*
  AND A SWEEP OVER THE SHIPPED SECTIONS, reported honestly rather than
  counted as a pass. Almost every anchor in them is a CTA, and a CTA carries
  `.s__btn`, so it is a button and is skipped — which leaves this with
  nothing to examine and nothing to say. A check like that reports "none of
  them" whether or not anything is wrong, which is worth nobody's
  confidence, so it is only an assertion when it has something to assert.
  The hand-written cases above are what carries the claim, and the break test
  in this file's header is what says they carry it.
*/
console.log(`\n  swept ${r.anchors} anchor(s) across ${r.probes} shipped section(s); ${r.examined} of them are not buttons\n`)
if (r.examined > 0) {
  expect(r.strayCount === 0,
    "and none of the links among them took the button style",
    r.strayCount === 0 ? "none of them" : `${r.strayCount}: ${JSON.stringify(r.strays)}`)
} else {
  console.log("  note  every anchor in the shipped sections is a button, so this sweep asserts nothing")
}

console.log("")
if (bad) fail(`${bad} measurement${bad === 1 ? "" : "s"} failed.`)
console.log("Buttons take the button style. Links do not.\n")
