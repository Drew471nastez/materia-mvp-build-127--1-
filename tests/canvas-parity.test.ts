/**
 * ===========================================================================
 *  THE CANVAS AND THE LIVE PAGE ARE DRAWN THE SAME WAY
 * ===========================================================================
 * A header with nothing under it in the builder had a band of background
 * under it on the live site. The causes found, each held here; the layout is
 * measured by scripts/check-canvas-parity.mjs, which fails on the old code.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { themeStylesheet } from "@/lib/website-builder/theme-css"
import type { ThemeSettingsValues } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const css = themeStylesheet({ animations_enabled: true } as ThemeSettingsValues)
check("the section under the header does not fade in on load; the ones after it do",
  /\[data-section-box\]:not\(\[data-chrome\]\) ~ \[data-section-box\]:not\(\[data-chrome\]\) \[data-section\]\{animation:storelibSectionIn/.test(css) && !/\] \[data-section\]:not\(\[data-chrome\]\)\{animation:/.test(css))

const editor = read("app/website-builder/editor/[installId]/page.tsx")
check("the canvas puts no box of its own around a section, so the section gap applies as it does live",
  /wrapperId=\{`wb-section-\$\{section\.id\}`\}\s*boxClassName=/.test(editor) && !/<div\s*key=\{section\.id\}\s*id=\{`wb-section-\$\{section\.id\}`\}\s*className=\{section\.id === arrivedId/.test(editor))
check("and names the page's template the way the live site does", /pageTemplate=\{templateForPage\(currentPage\)\}/.test(editor))

const themePage = read("components/website-builder/theme/ThemePage.tsx")
check("the page is a width container on both, so the header's phone and tablet sizes answer to the page", /containerType: "inline-size"/.test(themePage))
check("and on the live site the document is the page's colour, not white round it", /html,body\{background-color:\$\{pageColor\};\}/.test(themePage) && /storefront\?\.inEditor !== true/.test(themePage))

const header = read("components/website-builder/sections/renderers/HeaderSection.tsx")
check("the header knows the home page from the page it is drawing, not from the address bar while it renders",
  /* A link handler may read the address when it is clicked; the render may not. */
  !/window\.location\.pathname/.test(header.replace(/const handleLinkClick = [\s\S]*?\n  \}\n/, "")) && /headerBorderHere\(borderEnabled, borderVisibility, pageTemplate\)/.test(header))

const dir = "components/website-builder/sections/renderers"
const vh = ["HeroSection", "LookbookSection", "VideoHeroSection", "GallerySection", "ProductSection", "HeaderSection"].filter((f) => /[^-(]\b\d+vh\b|"\d+vh"|\[\d+vh\]/.test(read(`${dir}/${f}.tsx`).replace(/var\(--sl-vh[^)]*\)/g, "")))
check("no section measures the editor's window where the live site measures the screen: heights go through --sl-vh", vh.length === 0, vh.join(", "))
check("nor a template's inline style", !/--hero-min: 78vh/.test(read("themes/default/sections/hero_centered.storelib")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
