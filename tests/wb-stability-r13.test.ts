/**
 * ===========================================================================
 *  ROUND 13: THE EDITOR STAYS AS IT WAS LOADED AFTER PUSHES AND LARGE CHANGES
 * ===========================================================================
 * The owner: after a GitHub push, or a large theme settings change, the
 * builder's canvas got laggy, glitchy and scattered until the whole editor
 * was refreshed. Measured with scripts/check-wb-stability-r13.mjs (ten
 * pushes and ten large theme changes, against a fresh load):
 *
 *   a push's stylesheet and script never reached the canvas (same address)
 *   every section swapped in place started the theme's code again, and its
 *   last start was never taken down (103 observers, 11 timers, 10 frame
 *   loops, a hero drawn out of place)
 *   a theme object held the render it was made in (its frames' pages)
 *
 * Run with:  npx tsx tests/wb-stability-r13.test.ts
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { assetVersionIn, planPatch, scriptFileChanged, type DocShape } from "@/components/website-builder/compat/compat-canvas"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const canvas = code("components/website-builder/compat/compat-canvas.tsx")
const bridge = code("lib/storelib-theme/compat/canvas-bridge.ts")

const shape = (over: Partial<DocShape> = {}): DocShape => ({
  head: "", headNodes: [], styles: [], bodyStyles: [], fonts: [], htmlAttrs: {}, bodyAttrs: {}, skeleton: "<main></main>",
  sections: new Map([["a", '<div id="shopify-section-a" class="shopify-section">A</div>']]), order: [{ id: "a", group: "" }],
  headLayout: [], bodyLayout: "<main></main>", scripts: [], srcs: ["/api/site-theme/assets/i/edit/theme.js?v=a1"], ...over,
})

console.log("\nTheme code that changed (a push)\n")
{
  const files = { "shopify/assets/theme.css": "a{}", "shopify/assets/theme.js": "1" }
  const v1 = assetVersionIn(files, "theme.css")
  check("a file's address carries what it holds", v1 === assetVersionIn(files, "theme.css") && v1 !== assetVersionIn({ ...files, "shopify/assets/theme.css": "a{color:red}" }, "theme.css"))
  check("  a .liquid asset is read by its source", assetVersionIn({ "shopify/assets/x.css.liquid": "b{}" }, "x.css") !== assetVersionIn({}, "x.css"))
  check("  the canvas names the theme's files by it", /assetUrl: \(name\) => media\[name\] \?\? `\/api\/site-theme\/assets\/\$\{installId\}\/edit\/\$\{encodeURIComponent\(name\)\}\?v=\$\{assetVersionIn\(files, name\)\}`/.test(canvas))
  check("the same script at another version is theme code that changed", scriptFileChanged(["/x/theme.js?v=a"], ["/x/theme.js?v=b"]))
  check("  a script added or kept is not", !scriptFileChanged(["/x/theme.js?v=a"], ["/x/theme.js?v=a", "/x/search.js?v=c"]) && !scriptFileChanged([], ["/x/a.js?v=1"]))
  check("  such a page is loaded again (never the new script run over the old one)", planPatch(shape(), shape({ srcs: ["/api/site-theme/assets/i/edit/theme.js?v=b2"] })) === null)
  check("  the same scripts: changed in place as before", !!planPatch(shape(), shape({ styles: [] })))
  check("a section's own stylesheet at a new version takes the old one's place once loaded", /var old = keptLink\[fileOf\(href\)\];/.test(bridge) && /if \(old\) kept\[href\]\.then\(function \(\) \{ if \(old\.href && kept\[old\.href\]\) delete kept\[old\.href\]; old\.remove\(\); \}\);/.test(bridge))
}

console.log("\nA change to every section, and a page worn by edits\n")
{
  check("a change that swaps most of the page draws it again behind the one on screen", /const massive = plan\.swaps\.length >= MASSIVE_SWAP_MIN && plan\.swaps\.length \* 2 >= next\.order\.length\s*if \(massive && !isLive\(\)\) \{\s*loadBehind\(html, docKey, list\)\s*return\s*\}/.test(canvas))
  check("  under a finger it is changed in place, and drawn fresh after the finger lifts", /if \(isLive\(\) \|\| slotsRef\.current\[1\]\) \{ freshTimer\.current = window\.setTimeout\(fresh, FRESH_SETTLE_MS\); return \}/.test(canvas))
  check("sections swapped into a page are counted, and a worn page is drawn fresh once edits stop", /now\.swapped = \(now\.swapped \?\? 0\) \+ plan\.swaps\.length\s*if \(massive \|\| now\.swapped >= WORN_SWAPS\)/.test(canvas) && /if \(opts\?\.fresh && now\.key === docKey\) \{ loadBehind\(html, docKey, list\); return \}/.test(canvas))
  check("  the wait is let go with the canvas", /useEffect\(\(\) => \(\) => window\.clearTimeout\(freshTimer\.current\), \[\]\)/.test(canvas))
}

console.log("\nA theme holds no page\n")
{
  check("the theme is made outside the component (its address functions hold no render)", /^function themeOfFiles\(installId: string, files: Record<string, string>, values: Record<string, unknown>\) \{/m.test(canvas) && /const themeWith = \(files: Record<string, string>, values: Record<string, unknown>\) => themeOfFiles\(installId, files, values\)/.test(canvas))
}

console.log("\nThe probe\n")
{
  check("scripts/check-wb-stability-r13.mjs plays pushes through the editor's own poll", existsSync("scripts/check-wb-stability-r13.mjs") && /PROBE_ACTIVITY/.test(code("scripts/check-wb-stability-r13.mjs")) && /PROBE_ACTIVITY/.test(code("scripts/render-editor-probe.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
