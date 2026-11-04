/**
 * The Add a section library for an imported Shopify theme.
 *
 * Its cards are drawn by the theme's own engine, not Storelib's native
 * renderer (which has none of the theme's sections and drew blank boxes).
 * A section added with nothing set shows the words of its schema's
 * defaults, which Shopify themes write as `t:` keys into
 * locales/en.default.schema.json: those keys must come out as words, on the
 * live site, in the canvas and in the library. And the card's frame runs no
 * script, so what a theme only reveals with a script must be shown anyway.
 */
import JSZip from "jszip"
import { readFileSync } from "node:fs"

import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { drawPage, themeOfInstall } from "../lib/storelib-theme/compat/page"
import { freezeViewportInMarkup, freezeViewportUnits, inlineStylesheets } from "../lib/storelib-theme/compat/preview-styles"
import { previewSectionFor, sectionMarkup, sheetDocument } from "../components/website-builder/compat/compat-section-preview"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}

const HELLO = `<div class="hello scroll-trigger animate--slide-in"><h2>{{ section.settings.title }}</h2>{% for block in section.blocks %}<p {{ block.shopify_attributes }}>{{ block.settings.text }}</p>{% endfor %}</div>
{% schema %}
{
  "name": "t:sections.hello.name",
  "settings": [{ "type": "text", "id": "title", "label": "t:sections.hello.title.label", "default": "t:sections.hello.title.default" }],
  "blocks": [{ "type": "line", "name": "Line", "settings": [{ "type": "text", "id": "text", "label": "Text", "default": "t:sections.hello.blocks.line.text" }] }],
  "presets": [{ "name": "t:sections.hello.name", "blocks": [{ "type": "line" }] }]
}
{% endschema %}`

;(async () => {
  const zip = new JSZip()
  zip.file("layout/theme.liquid", "<html><head>{{ content_for_header }}</head><body>{{ content_for_layout }}</body></html>")
  zip.file("config/settings_schema.json", JSON.stringify([{ name: "theme_info", theme_name: "Preview Theme", theme_version: "1.0.0" }]))
  zip.file("config/settings_data.json", JSON.stringify({ current: {} }))
  zip.file("locales/en.default.json", JSON.stringify({ general: { hi: "Hi" } }))
  zip.file("locales/en.default.schema.json", JSON.stringify({ sections: { hello: { name: "Hello", title: { label: "Title", default: "Welcome to our store" }, blocks: { line: { text: "Share something about your brand" } } } } }))
  zip.file("sections/hello.liquid", HELLO)
  zip.file("templates/index.json", JSON.stringify({ sections: {}, order: [] }))
  const r = await convertShopifyTheme(zip)
  if (!r.ok) { console.log(`  FAIL  converts: ${(r as { error: string }).error}`); process.exit(1) }
  const files = r.theme.files as Record<string, string>

  console.log("\nA schema's t: defaults are words\n")
  const theme = themeOfInstall(files, r.theme.settings, { assetUrl: (n) => `/a/${n}`, assetText: () => null })
  const page = { template: "index", path: "/", designMode: true, products: [], collections: [], menus: {}, shop: { name: "Shop", currency: "USD", moneyFormat: "${{amount}}" } }
  const placed = [{ id: "s1", type: "hello", settings: {}, blocks: [{ id: "b1", type: "line", settings: {} }] }]
  const { html } = drawPage(theme, page as never, placed as never, { scripts: false })
  check("a section's default heading is the locale's words", html.includes("<h2>Welcome to our store</h2>"), html.match(/<h2>[^<]*<\/h2>/)?.[0])
  check("a block's default is the locale's words", html.includes("Share something about your brand"))
  check("no t: key is printed", !/t:sections\./.test(html))

  console.log("\nThe styles a section is pictured with (lib/storelib-theme/compat/preview-styles.ts)\n")
  check("a viewport height is the pixels of an ordinary window", freezeViewportUnits(".h{min-height:100vh;height:calc(50svh - 10px);top:-10dvh}", 1200, 800) === ".h{min-height:800px;height:calc(400px - 10px);top:-80px}")
  check("  vmin and vmax are the window's", freezeViewportUnits(".a{width:10vmin;height:10vmax}", 1200, 800) === ".a{width:80px;height:120px}")
  check("  widths and other units are left alone", freezeViewportUnits(".a{width:100vw;margin:2rem;line-height:1.5}", 1200, 800) === ".a{width:100vw;margin:2rem;line-height:1.5}")
  check("  a selector that has vh in its name is not a length", freezeViewportUnits(".min-h-100vh{min-height:100vh}", 1200, 800) === ".min-h-100vh{min-height:800px}")
  const markup = `<div style="height:100vh" data-x="100vh"><style>.a{min-height:50vh}</style><p>About 100vh of words</p></div>`
  const frozen = freezeViewportInMarkup(markup, 1200, 800)
  check("  in markup, styles and style attributes change and words do not", frozen.includes(`style="height:800px"`) && frozen.includes(".a{min-height:400px}") && frozen.includes("About 100vh of words") && frozen.includes(`data-x="100vh"`), frozen)
  const rows = { "shopify/assets/theme.css": ".hero{min-height:100vh;background:url(hero.png)}@font-face{src:url('fonts/a.woff2')}", "shopify/assets/logo.png": "base64:AAAA" }
  const linked = `<head><link rel="stylesheet" href="/api/site-theme/assets/i/edit/theme.css" media="all"><link rel="stylesheet" href="/x/other.css"><link rel="stylesheet" href="https://cdn.example.com/a.css"><link rel="stylesheet" href="/api/site-theme/assets/i/edit/theme.css"></head>`
  const inlined = inlineStylesheets(linked, rows, 1200, 800)
  check("a stylesheet among the install's files is carried in the document, its vh frozen", /<style data-sheet-from="theme\.css">\.hero\{min-height:800px;/.test(inlined), inlined)
  check("  its own relative addresses still point beside it", inlined.includes("url(http://localhost/api/site-theme/assets/i/edit/hero.png)") && inlined.includes("url('http://localhost/api/site-theme/assets/i/edit/fonts/a.woff2')"), inlined)
  check("  one that is not among the files, or is on another host, stays a link", inlined.includes(`<link rel="stylesheet" href="/x/other.css">`) && inlined.includes("https://cdn.example.com/a.css"))
  check("  the same stylesheet twice is kept once, the last time", (inlined.match(/data-sheet-from="theme\.css"/g) ?? []).length === 1 && inlined.indexOf("theme.css") > inlined.indexOf("other.css"), inlined)
  check("  a stylesheet cannot close its own element", !inlineStylesheets(`<link rel="stylesheet" href="/a/t.css">`, { "shopify/assets/t.css": "a{content:'</style><script>'}" }, 1200, 800).includes("</style><script>"))

  console.log("\nThe cards' document\n")
  {
    const sheet = sheetDocument(theme, page as never, files, 1200, 800)
    check("its body is empty: nothing of the layout is drawn over the cards", /<body\b[^>]*><\/body>/.test(sheet.html), sheet.html.slice(sheet.html.indexOf("<body"), sheet.html.indexOf("<body") + 200))
    check("  it is see-through, and each section is cut and kept to its card", sheet.html.includes("background:transparent!important") && /* Changed on purpose (round 45: the card's box is <sl-card>, the library's own, in the first cascade layer) */ /body>sl-card\[data-sl-card\]\{display:block!important;position:absolute!important/.test(sheet.html) && /overflow:clip!important;contain:strict!important;isolation:isolate!important/.test(sheet.html) && sheet.html.indexOf("@layer storelib-card;") < sheet.html.search(/<link|<style(?! data-storelib-layer)/))
    check("  it has no script", !/<script\b/i.test(sheet.html))
    const one = sectionMarkup(theme, page as never, previewSectionFor("hello", 0, { type: "hello", name: "Hello", fields: [], presets: [{ name: "Hello", settings: {}, blocks: [{ type: "line", settings: {} } as never] }] } as never), files, 1200, 800)
    check("  a section's own markup is the theme's, with its words", one.includes("Welcome to our store") && one.includes("Share something about your brand") && !/<script\b/i.test(one), one.slice(0, 200))
  }

  console.log("\nThe library card\n")
  const preview = readFileSync("components/website-builder/compat/compat-section-preview.tsx", "utf8")
  const previewCode = preview.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  const library = readFileSync("components/website-builder/editor/section-library.tsx", "utf8")
  check("the library draws an imported theme's cards with its own engine", /compat=\{!!compatInstallId\}/.test(library) && /<CompatGridWrap/.test(library))
  /* Changed on purpose (push lag): a closed library warmed again asks only for the first REWARM_FIRST cards still to be drawn. */
  check("the native preview queue is not asked for an imported theme's sections", /if \(!compatInstallId\) requestPreviews\(jobs, true\)/.test(library) && /if \(!compatInstallId\) requestPreviews\(again \? jobs\.filter\(\(j\) => !MARKUP\.has\(j\.key\)\)\.slice\(0, REWARM_FIRST\) : jobs\)/.test(library))
  check("the cards' frame runs no script", /sandbox="allow-same-origin"/.test(preview) && !/allow-scripts/.test(previewCode) && /scripts: false/.test(preview))
  check("what a theme reveals on scroll is shown in the card", /\.scroll-trigger/.test(preview) && /opacity:1!important/.test(preview))
  check("the frame's scale survives the touch rule that flattens transforms", /data-keep-transform/.test(preview))
  check("a section is measured by its own content, not by a window or a floor", /* Changed on purpose (round AJ: its own box, not what spills out of it, so a header is not as tall as its hidden drawer) */ /const own = Math\.max\(w\.offsetHeight, root\.offsetHeight\)/.test(preview) && /const h = Math\.ceil\(own > 8 \? own : w\.scrollHeight\)/.test(preview) && /w\.style\.minHeight = "0px"/.test(preview))
  check("a section with nothing to show is named, not blank", /state: shows \? .+ : "named" \}\)/.test(preview))

  console.log("\nOne document for every card, not a frame per card\n")
  check("there is no frame per card: one frame lies over the list", (previewCode.match(/<iframe\b/g) ?? []).length === 1 && /export function CompatPreviewSheet/.test(preview) && /<CompatPreviewSheet renderWidth=/.test(library))
  check("  it takes no presses and is not in the tab order or the accessibility tree", /pointer-events-none/.test(preview) && /tabIndex=\{-1\}/.test(preview) && /aria-hidden/.test(preview))
  check("  the list it lies over is its positioning parent", /data-library-grid="" className="relative /.test(library))
  check("  each section is put over its card's box, read in the same frame the cards are laid out in", /* Changed on purpose (merge): the sheet's own observer (round 45) is the one observer, and calls its sync */ /queueMicrotask\(/.test(preview) && /sheet\?\.requestSync\(\)/.test(preview) && /new ResizeObserver\(\(\) => this\.sync\(\)\)/.test(preview))
  check("  a frame's blank first page is never mistaken for its document", /doc\.URL !== "about:srcdoc"/.test(preview))
  check("  a section away from the screen costs nothing to put the next one in", /* Changed on purpose (round 45: its box is its card's size whatever it holds, contain: strict, so no intrinsic size is needed) */ /content-visibility:auto/.test(preview) && /box\.setAttribute\("data-measured", ""\)/.test(preview))
  check("  sections are drawn ahead only while nobody is using the editor, and an open list nearest the screen first", /INPUT_QUIET_MS - \(performance\.now\(\) - lastInput\)/.test(preview) && /\(view\.top - r\.bottom\) \* 3/.test(preview) && /FRAME_BUDGET_MS = 8/.test(preview))
  check("  a picture fades in once, after its images are decoded and its stylesheets are in", /i\.decode\(\)/.test(preview) && /links\.map\(loaded\)/.test(preview) && /data-instant/.test(preview) && /prefers-reduced-motion:reduce/.test(preview))
  check("  the card does not rise from under its picture on hover", /!phone && !compat && "group-hover:-translate-y-px"/.test(library))

  /*
    "Sometimes the cover previews of the preview cards get bugged": pictures
    off their cards, a strip of another section between two cards, one cut
    short. Measured in a browser by scripts/check-library-preview-placement.mjs
    (before, on Materia: 52 placement errors on a computer, 118 and 24351px
    painted between cards on a phone; after: none); these hold the pieces
    in place.
  */
  console.log("\nEvery picture stays over its own card\n")
  /* Changed on purpose (merge): main's watcher and this branch's observer of the list are one ResizeObserver on the sheet (watch, watchGrid); the sheet's other one (sizes) reads the sections' own heights in the frame, a different job. */
  check("every card in the list is watched for a size change, not only the list", (previewCode.match(/new ResizeObserver\(\(\) => (?:this|sheet)\.sync\(\)\)/g) ?? []).length === 1 && /new ResizeObserver\(\(\) => this\.sync\(\)\)/.test(previewCode) && /this\.watch\(grid, true\)/.test(previewCode) && /for \(const el of Array\.from\(grid\.children\)\) if \(el\.tagName !== "IFRAME"\) this\.watch\(el, true\)/.test(previewCode) && /this\.watch\(entry\.box, true\)/.test(previewCode) && /this\.watch\(card, true\)/.test(previewCode))
  /* Changed on purpose (merge): the MutationObserver is the sheet's (gridWatch), and also sees a card shown or hidden by its group (main's `hidden` observer). */
  check("  cards that come and go are watched as they come, and let go as they go", /this\.gridWatch = new MutationObserver\(/.test(previewCode) && /this\.gridWatch\.observe\(grid, \{ childList: true, subtree: true, attributes: true, attributeFilter: \["hidden"\] \}\)/.test(previewCode) && /this\.watch\(n as Element, false\)/.test(previewCode) && (previewCode.match(/new MutationObserver\(/g) ?? []).length === 1)
  check("  the editor's fonts landing puts them over their cards again", /fonts\?\.addEventListener\?\.\("loadingdone", settled\)/.test(previewCode) && /fonts\?\.ready\?\.then\(settled/.test(previewCode))
  /* Changed on purpose (merge): the observers are let go in release(), the fonts listener in the effect. */
  check("  every observer is let go with the sheet", /release\(\): void \{[\s\S]{0,400}?this\.watcher\?\.disconnect\(\)[\s\S]{0,120}?this\.gridWatch\?\.disconnect\(\)/.test(previewCode) && /removeEventListener\?\.\("loadingdone", settled\)/.test(previewCode))
  /* Changed on purpose (merge): main looks for a frame document whose load never comes a few times a second, and stops once the sheet has it; nothing else polls. */
  check("  no polling loop: nothing runs while nothing moves", (previewCode.match(/setInterval\(/g) ?? []).length === 1 && /if \(sheet\.attached\) return window\.clearInterval\(t\)/.test(previewCode) && !/requestAnimationFrame\(function loop|const loop = \(\) => \{[^}]*requestAnimationFrame\(loop\)/.test(previewCode))
  /* Changed on purpose (merge): main reads the card's width as laid out (getComputedStyle) and every place against the frame's own painted surface, which carries any transform over the library; unrounded either way. */
  check("positions are the layout's own, unrounded, under any transform", /Number\.parseFloat\(getComputedStyle\(first\.box\)\.width\)/.test(previewCode) && /const paintedScale = surface\.width \/ this\.renderWidth/.test(previewCode) && /const cardH = r\.height \/ paintedScale/.test(previewCode) && !/box\.clientWidth \/ this\.renderWidth/.test(previewCode))
  /* Changed on purpose (merge): the place is read against the frame's surface (main), still to a hundredth, and the frame's scale and height still written only when they change. */
  check("  written only when a place changed, to a hundredth of a pixel", /if \(placedAt\.get\(w\) !== pos\)/.test(previewCode) && /hundredths\(\(r\.top - surface\.top\) \/ paintedScale\)/.test(previewCode) && /if \(this\.frameAt !== at/.test(previewCode))
  /* Changed on purpose (merge): main's height, the list's laid out height over the card's painted width. */
  check("  the frame is as tall as the list, unrounded, so no card is cut at its foot", /Math\.ceil\(grid\.getBoundingClientRect\(\)\.height \/ first\.rect!\.width \* this\.renderWidth\)/.test(previewCode) && !/grid\.offsetHeight \/ scale/.test(previewCode))
  /* Changed on purpose (merge): the place and height are the <sl-card> box's variables, read by the first cascade layer (round 45). */
  check("  each section is cut at its card's foot: its height is the card's, its overflow hidden", /w\.style\.setProperty\("--sl-h", `\$\{height\}px`\)/.test(previewCode) && /w\.style\.setProperty\("--sl-top", `\$\{top\}px`\)/.test(previewCode) && /w\.style\.setProperty\("--sl-pad", `\$\{padding\}px`\)/.test(previewCode) && /height:var\(--sl-h,auto\)!important[^"]*overflow:clip!important;contain:strict!important/.test(preview))
  check("  the frame's own page never scrolls away from the list's top", /page\.scrollTo\(0, 0\)/.test(previewCode))
  /* Changed on purpose (merge): what is hidden is the section's <sl-card> box. */
  check("a card that goes takes its section with it at once", /this\.cards\.delete\(key\)\s*const w = this\.wrappers\.get\(key\)\s*if \(w\) frameOf\(w\)\.hidden = true/.test(previewCode))
  /* Changed on purpose (merge): what is taken out is every <sl-card> box and shared style in the page (main), and the old sheet is let go of as the new one takes the document. */
  check("one sheet paints in a document: a new sheet takes the frame's document over and takes the old one's sections out", /docOwner\.set\(doc, this\)/.test(previewCode) && /before\.release\(\)/.test(previewCode) && /querySelectorAll\(`body>\$\{CARD_TAG\}, style\[data-sl-shared\]`\)\)\) el\.remove\(\)/.test(previewCode))
  /* Changed on purpose (merge): main tells the sheet's own document by the tag written in its head (isMine), which replaces this branch's remembered srcdoc. */
  check("  an old document about to be replaced by this sheet's own is not filled", /if \(!this\.isMine\(doc\)\) return/.test(previewCode))
  check("  a sheet whose document was taken over does nothing more in it", /private owns\(\): boolean/.test(previewCode) && (previewCode.match(/this\.owns\(\)/g) ?? []).length >= 4)
  /* Changed on purpose (merge): main's font listener is fontsLoaded. */
  check("  and keeps no listener on it (push lag: an old sheet held alive by the document)", /release\(\): void \{[\s\S]*?this\.doc\?\.fonts\?\.removeEventListener\?\.\("loadingdone", this\.fontsLoaded\)/.test(previewCode))
  check("the push lag work is kept: release, CLOSED_ADOPT_MS, idle scheduling", /release\(\): void/.test(previewCode) && /CLOSED_ADOPT_MS = 10_000/.test(previewCode) && /requestIdleCallback/.test(previewCode) && /return \(\) => sheet\.release\(\)/.test(previewCode))

  const route = readFileSync("app/api/website-builder/themes/[installId]/files/route.ts", "utf8")
  check("the editor is sent the schema words as well as the words", route.includes(String.raw`\.default(\.schema)?\.json$`))

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
})()
