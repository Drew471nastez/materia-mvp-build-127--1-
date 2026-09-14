/**
 * ===========================================================================
 *  DOES THE COLOUR SCHEME ACTUALLY REACH THE PAGE
 * ===========================================================================
 * The report was a screenshot: a creator on the dark scheme, with their own
 * name rendered black on black, the tab labels dark grey on near-black, a
 * white "Digital" pill on a dark card, and a white footer band under it all.
 * Every one of those parts was painted by a design-system token or a stored
 * "#000000" the builder had written out unasked, neither of which has ever
 * heard of a colour scheme.
 *
 * "It applies well now" is not something to assert from a diff. This renders
 * the REAL profile header, the REAL tab strip, a REAL product card and the
 * REAL footer, inside the REAL compiled stylesheet, once per scheme, and asks
 * the browser what colour each thing came out. Two questions:
 *
 *   1. IS IT READABLE. Every piece of type measured against what is actually
 *      behind it, held to WCAG AA — 4.5 to 1, or 3 to 1 where the type is
 *      large. A dark scheme that paints light-grey-on-white text light grey
 *      on near-black passes a "did it change" test and fails a person.
 *
 *   2. DID IT CHANGE AT ALL. The same element, on the light scheme and on the
 *      dark one, has to be a different colour. This is the check that would
 *      have caught the original bug: black-on-black is perfectly "themed" as
 *      far as any code inspection goes, and it is invisible.
 *
 *   pnpm build && node scripts/check-creator-chrome.mjs
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
const css = readdirSync(cssDir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(join(cssDir, f), "utf8"))
  .join("\n")
if (!css.includes("--muted-foreground")) fail("The built CSS has no design tokens in it. Run `pnpm build` again.")

const out = mkdtempSync(join(tmpdir(), "storelib-chrome-"))

/**
 * next/link, next/image and next/navigation resolve through export conditions
 * only a framework bundler sets. Inside the project, not in the temp
 * directory: esbuild resolves `react` by walking up from the importing file,
 * and from /tmp there is no node_modules to find.
 */
const stubs = join(root, ".chrome-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) {
  return React.createElement("a", { href, ...rest }, children)
}
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, priority, quality, sizes, ...rest }) {
  return React.createElement("img", { src: typeof src === "string" ? src : "", alt, ...rest })
}
`)
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/u/andrewrullz"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {} })
export const useSearchParams = () => new URLSearchParams()
`)

/**
 * WHAT IS BEHIND A PIECE OF TYPE. `background-color` is `rgba(0,0,0,0)` on
 * almost every element on a page, so the colour a reader actually sees behind
 * a word is the nearest ancestor that paints one. Walking up for it is the
 * difference between measuring the page and measuring a wrapper div.
 */
const PROBE = `<script>
function parse(c) {
  var m = /rgba?\\(([^)]+)\\)/.exec(c || "")
  if (!m) return null
  var p = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number)
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
}
function behind(el) {
  var node = el
  while (node) {
    var bg = parse(getComputedStyle(node).backgroundColor)
    if (bg && bg.a > 0.95) return bg
    node = node.parentElement
  }
  return { r: 255, g: 255, b: 255, a: 1 }
}
function lum(c) {
  function ch(v) { var x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b)
}
function ratio(fg, bg) {
  if (fg.a < 1) fg = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 }
  var a = lum(fg), b = lum(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
function read(scope, selector, label, large) {
  var el = scope.querySelector(selector)
  if (!el) return { label: label, missing: true }
  var cs = getComputedStyle(el)
  var fg = parse(cs.color), bg = behind(el)
  return {
    label: label,
    large: !!large,
    color: cs.color,
    bg: "rgb(" + Math.round(bg.r) + "," + Math.round(bg.g) + "," + Math.round(bg.b) + ")",
    ratio: fg ? Math.round(ratio(fg, bg) * 100) / 100 : null,
  }
}
function run() {
  var rows = []
  document.querySelectorAll("[data-scheme]").forEach(function (scope) {
    var scheme = scope.getAttribute("data-scheme")
    var tabs = scope.querySelectorAll('[role="tab"]')
    var items = [
      read(scope, "h1", "the creator's name", true),
      read(scope, "h1 ~ p", "the handle"),
      read(scope, '[data-region="tabs"] [role="tab"][aria-selected="true"]', "the selected tab"),
      tabs[1] ? (function () { var r = read(scope, '[data-region="tabs"] [role="tab"]:not([aria-selected="true"])', "an unselected tab"); return r })() : { label: "an unselected tab", missing: true },
      read(scope, '[data-region="empty"] p', "an empty tab's heading"),
      read(scope, '[data-region="empty"] p ~ p', "its line underneath"),
      read(scope, '[data-region="card"] h3', "a product title"),
      read(scope, '[data-region="card"] h3 ~ *', "the category badge"),
      read(scope, '[data-region="card"] .font-semibold', "the price"),
      read(scope, '[data-region="footer"] a[href="/privacy"]', "a footer link"),
    ]
    var page = getComputedStyle(scope).backgroundColor
    var rule = scope.querySelector('[data-region="tabs"] [role="tablist"]')
    rows.push({
      scheme: scheme,
      page: page,
      rule: rule ? getComputedStyle(rule).borderBottomColor : null,
      footerBand: (function () { var f = scope.querySelector("footer[data-seller-footer]"); return f ? getComputedStyle(f).backgroundColor : null })(),
      items: items,
    })
  })
  var pre = document.createElement("pre"); pre.id = "out"; pre.textContent = JSON.stringify(rows); document.body.append(pre)
}
if (document.readyState === "complete") run(); else addEventListener("load", run)
</script>`

try {
  execFileSync(
    "npx",
    [
      "esbuild",
      join(root, "scripts/render-creator-chrome.tsx"),
      "--bundle",
      "--platform=node",
      "--format=cjs",
      `--outfile=${join(out, "probe.cjs")}`,
      `--alias:next/link=${join(stubs, "link.jsx")}`,
      `--alias:next/image=${join(stubs, "image.jsx")}`,
      `--alias:next/navigation=${join(stubs, "navigation.js")}`,
      `--alias:@=${root}`,
      "--loader:.jsx=jsx",
      "--loader:.css=empty",
      "--loader:.svg=dataurl",
      "--jsx=automatic",
      "--log-level=error",
    ],
    { cwd: root, stdio: "inherit" },
  )
  execFileSync("node", [join(out, "probe.cjs")], { cwd: root, stdio: "inherit", env: { ...process.env, OUT_DIR: out } })

  const body = readFileSync(join(out, "body.html"), "utf8")
  const file = join(out, "index.html")
  writeFileSync(
    file,
    `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>body{margin:0}</style></head><body>${body}${PROBE}</body></html>`,
  )

  const dom = execFileSync(
    CHROMIUM,
    ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--window-size=1200,900",
     "--virtual-time-budget=8000", "--dump-dom", `file://${file}`],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
  )
  const match = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)
  if (!match) fail("Nothing reported. The probe did not run.")
  const rows = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))

  let broken = 0
  const expect = (ok, what, got) => {
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got ?? ""}`}`)
    if (!ok) broken++
  }

  if (rows.length !== 5) fail(`Expected five schemes, measured ${rows.length}.`)

  for (const row of rows) {
    console.log(`\n${row.scheme}  page ${row.page}`)
    for (const item of row.items) {
      if (item.missing) { expect(false, `${item.label} rendered`, "not found"); continue }
      const need = item.large ? 3 : 4.5
      expect(
        item.ratio !== null && item.ratio >= need - 0.005,
        `${item.label} is readable on what is behind it`,
        item.ratio === null
          ? `its colour came back as ${item.color}, which is not a resolvable colour — a token it depends on is unset`
          : `${item.ratio} to 1, needs ${need} — ${item.color} on ${item.bg}`,
      )
    }
  }

  /**
   * THE CHECK THAT WOULD HAVE CAUGHT THE ORIGINAL BUG. Black on black is
   * readable-by-inspection and invisible in fact; what it is not is
   * DIFFERENT. Every measured part has to come out a different colour on the
   * dark scheme than on the light one, or the scheme did not reach it.
   */
  console.log("\nthe scheme reaches every part")
  const light = rows.find((r) => r.scheme === "default")
  const dark = rows.find((r) => r.scheme === "astrid")
  expect(light.page !== dark.page, "the page itself is repainted", `${light.page} vs ${dark.page}`)
  expect(light.footerBand !== dark.footerBand, "the footer band is repainted", `${light.footerBand} vs ${dark.footerBand}`)
  expect(light.rule !== dark.rule, "the rule under the tabs is repainted", `${light.rule} vs ${dark.rule}`)
  for (let i = 0; i < light.items.length; i++) {
    const a = light.items[i]
    const b = dark.items[i]
    if (a.missing || b.missing) continue
    expect(a.color !== b.color, `${a.label} is repainted`, `${a.color} on both`)
  }

  console.log(broken === 0 ? "\nEvery part of the chrome follows the scheme, and every word on it is readable.\n" : `\n${broken} measured wrong.\n`)
  process.exit(broken === 0 ? 0 : 1)
} finally {
  /* The temp directory is the browser's; leaving it is what lets a failure be looked at. */
}
