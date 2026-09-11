/**
 * The design tokens, measured.
 *
 * Renders the real theme stylesheet (lib/website-builder/theme-css.ts, via
 * tsx) around sections at desktop and phone width in headless Chromium and
 * reads back what the browser computed: a section heading's size at each
 * width, a section that chose Heading 1, a section that chose Body large,
 * a template heading written against `--section-heading-size`, a header's
 * cart title that must be left alone, and a colour that came through
 * `--scheme-heading` with a section override on top.
 *
 *   node scripts/check-design-tokens.mjs
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(m); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)

// The compiled theme, from the real compile step.
const dump = execFileSync("npx", ["tsx", "-e", `
  import { themeVars, themeStylesheet } from "./lib/website-builder/theme-css"
  import { resolveSectionColors, styleAttr } from "./lib/storelib-theme/color-schemes"
  const theme = { typography_styles: { h1: { size: { desktop: 64, tablet: 48, mobile: 40 } } } }
  const colors = resolveSectionColors(theme, { color_scheme: "dark", color_overrides: { heading: "#ff0000" } })
  process.stdout.write(JSON.stringify({
    vars: styleAttr(themeVars(theme)),
    css: themeStylesheet(theme),
    section: styleAttr(colors.vars),
    darkHeading: colors.base.heading,
  }))
`], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] })
const compiled = JSON.parse(dump)

const DESKTOP = 1200, PHONE = 390

const sectionAt = (name, w, attrs = "") => `
  <div class="wrap" style="width:${w}px" ${attrs}>
    <div data-section>
      <h2 id="h2-${name}">Heading</h2>
      <h1 id="h1-${name}">Heading one</h1>
      <p id="p-${name}">Body</p>
      <h2 class="tpl" id="tpl-${name}">Template heading</h2>
    </div>
  </div>`

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
.wrap{container-type:inline-size}
.tpl{font-size:var(--section-heading-size,32px)}
.scheme{color:var(--scheme-heading)}
.chrome h2{font-size:15px}
</style>
<style>${compiled.css}</style>
</head><body>
<div data-storelib-theme style="${compiled.vars}">
  ${sectionAt("desktop", DESKTOP)}
  ${sectionAt("phone", PHONE)}
  ${sectionAt("h1-desktop", DESKTOP, 'data-heading-style="h1"')}
  ${sectionAt("h1-phone", PHONE, 'data-heading-style="h1"')}
  ${sectionAt("body", DESKTOP, 'data-body-style="body_large"')}
  <div class="wrap chrome" style="width:${DESKTOP}px"><div data-section data-chrome><h2 id="cart">Your cart</h2></div></div>
  <div class="wrap" style="width:${DESKTOP}px;${compiled.section}"><div data-section><span class="scheme" id="scheme">Scheme colour</span></div></div>
</div>
<script>
  const px = (id) => parseFloat(getComputedStyle(document.getElementById(id)).fontSize)
  const out = {
    h2Desktop: px("h2-desktop"), h2Phone: px("h2-phone"),
    h1Desktop: px("h1-desktop"), h1Phone: px("h1-phone"),
    styledH1Desktop: px("h1-h1-desktop"), styledH2Desktop: px("h2-h1-desktop"), styledH2Phone: px("h2-h1-phone"),
    tplDesktop: px("tpl-desktop"), tplPhone: px("tpl-phone"),
    bodyLarge: parseFloat(getComputedStyle(document.querySelector('[data-body-style] [data-section]')).fontSize),
    cart: px("cart"),
    schemeColor: getComputedStyle(document.getElementById("scheme")).color,
  }
  document.title = JSON.stringify(out)
</script>
</body></html>`

const dir = mkdtempSync(join(tmpdir(), "design-tokens-"))
const file = join(dir, "page.html")
writeFileSync(file, html)
let title = ""
try {
  const raw = execFileSync(CHROMIUM, [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    "--window-size=1400,900", "--virtual-time-budget=2000", "--dump-dom", `file://${file}`,
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
  title = /<title>([^<]*)<\/title>/.exec(raw)?.[1] ?? ""
} finally {
  rmSync(dir, { recursive: true, force: true })
}
if (!title) fail("the page never reported")
const m = JSON.parse(title.replace(/&quot;/g, '"').replace(/&amp;/g, "&"))

const results = [
  ["a section heading is Heading 2 at desktop width", m.h2Desktop, 36],
  ["and the phone size inside a 390px container", m.h2Phone, 30],
  ["an h1 is Heading 1, which the theme set to 64", m.h1Desktop, 64],
  ["and 40 on a phone", m.h1Phone, 40],
  ["a section that chose Heading 1 draws its h2 at 64", m.styledH2Desktop, 64],
  ["and at 40 on a phone", m.styledH2Phone, 40],
  ["a template heading written against --section-heading-size gets 36", m.tplDesktop, 36],
  ["and 30 on a phone", m.tplPhone, 30],
  ["a section that chose Body large has an 18px root", m.bodyLarge, 18],
  ["the header's cart title keeps its 15px", m.cart, 15],
]
let bad = 0
for (const [name, got, want] of results) {
  const ok = Math.abs(got - want) < 0.5
  if (!ok) bad++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}: ${got}px (want ${want})`)
}
const colourOk = m.schemeColor === "rgb(255, 0, 0)"
if (!colourOk) bad++
console.log(`  ${colourOk ? "ok  " : "FAIL"}  the section's heading override reaches --scheme-heading: ${m.schemeColor} (scheme's own is ${compiled.darkHeading})`)
if (bad) fail(`${bad} measurement(s) off`)
console.log("design tokens measured: all as specified")
