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
import { revealPlan } from "@/lib/website-builder/section-anchors"
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
/* Sections arrive as they scroll in (lib/website-builder/section-motion.ts), the
   same runtime on both surfaces; the stylesheet only says what pending looks like. */
check("the section under the header does not fade in on load; the ones after it do",
  !/\{animation:storelibSectionIn/.test(css) && /\[data-reveal="pending"\]\{opacity:0;\}/.test(css) &&
    revealPlan([{ type: "header", chrome: true }, { type: "hero", chrome: false }, { type: "text", chrome: false }], { animations_enabled: true }).join(",") === ",,fade_up")

const editor = read("app/website-builder/editor/[installId]/page.tsx")
check("the canvas puts no box of its own around a section, so the section gap applies as it does live",
  /wrapperId=\{`wb-section-\$\{section\.id\}`\}\s*boxClassName=/.test(editor) && !/<div\s*key=\{section\.id\}\s*id=\{`wb-section-\$\{section\.id\}`\}\s*className=\{section\.id === arrivedId/.test(editor))
check("and names the page's template the way the live site does", /pageTemplate=\{templateForPage\(currentPage\)\}/.test(editor))

const themePage = read("components/website-builder/theme/ThemePage.tsx")
check("the page is a width container on both, so the header's phone and tablet sizes answer to the page", /containerType: "inline-size"/.test(themePage))
check("and on the live site the document is the page's colour, not white round it", /html,body\{background-color:\$\{pageColor\};\}/.test(themePage) && /storefront\?\.inEditor !== true/.test(themePage))

const header = read("components/website-builder/sections/renderers/HeaderSection.tsx")
check("the header knows the home page from the page it is drawing, not from the address bar while it renders",
  !/window\.location\.pathname/.test(header) && /const isHomePage = renderingInsideEditor \? true : pageTemplate === "index"/.test(header))

const dir = "components/website-builder/sections/renderers"
const vh = ["HeroSection", "LookbookSection", "VideoHeroSection", "GallerySection", "ProductSection", "HeaderSection"].filter((f) => /[^-(]\b\d+vh\b|"\d+vh"|\[\d+vh\]/.test(read(`${dir}/${f}.tsx`).replace(/var\(--sl-vh[^)]*\)/g, "")))
check("no section measures the editor's window where the live site measures the screen: heights go through --sl-vh", vh.length === 0, vh.join(", "))
check("nor a template's inline style", !/--hero-min: 78vh/.test(read("themes/default/sections/hero_centered.storelib")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
