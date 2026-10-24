/**
 * ===========================================================================
 *  ROUND BC: THE CANVAS FOLLOWS EVERY SETTING, AS THE WEBSITE SHOWS IT
 * ===========================================================================
 * The owner: Theme settings, Variant Swatches, Display style switched to
 * Variant images or Color swatches, and the canvas showed it only after a
 * reload. The theme printed the setting in a script of its layout
 * (window.theme = { settings: ... }) that its JavaScript reads once, at
 * start; the canvas wrote the page in place and compared that script by its
 * address only, so nothing changed. Such a change now draws the page again
 * behind the one on screen, where it was scrolled to. A section's script
 * drawn with a new setting runs when the section is swapped in, as
 * Shopify's editor runs it.
 *
 * Measured with scripts/check-settings-reach-canvas.mjs (every setting of
 * a theme's settings_schema.json, the canvas against the page drawn again
 * from nothing), on the Materia store and on Dawn.
 *
 * Run with:  npx tsx tests/round-bc-canvas.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { planPatch, type DocShape } from "@/components/website-builder/compat/compat-canvas"

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
  head: "", headNodes: [], styles: [":root{--a:1}"], bodyStyles: [], fonts: [], htmlAttrs: {}, bodyAttrs: {}, skeleton: "<main></main>",
  sections: new Map([["a", '<div id="shopify-section-a" class="shopify-section">A</div>']]), order: [{ id: "a", group: "" }],
  headLayout: [], bodyLayout: "<main></main>", scripts: ['|window.theme = { settings: { swatchStyle: "buttons" } };'], ...over,
})

console.log("\nA setting the theme's script reads at start\n")
{
  const was = shape()
  const swatches = planPatch(was, shape({ scripts: ['|window.theme = { settings: { swatchStyle: "variant_images" } };'] }))
  check("the theme's start-up script drawn with another value: said, and not an empty change", !!swatches && swatches.scripts === true && swatches.empty === false, swatches)
  const same = planPatch(was, shape({ styles: [":root{--a:2}"] }))
  check("  the same script: nothing said about it, the style changed in place", !!same && !same.scripts && Array.isArray(same.message.styles))
  check("  a page drawn before the scripts were read (no list) is compared as before", !!planPatch({ ...was, scripts: undefined }, shape({ scripts: ["|other"] })) && !planPatch({ ...was, scripts: undefined }, shape({ scripts: ["|other"] }))!.scripts)
  check("the page's inline scripts outside every section are read, by type and text", /querySelectorAll\("script:not\(\[src\]\)"\)\)\s*\.filter\(\(el\) => !el\.closest\("\.shopify-section\[data-section-id\]"\) && !ownScript\(el\)\)/.test(canvas))
  check("  the canvas's own scripts (marked, or reading its globals) are not", /const ownScript = \(el: Element\) => Array\.from\(el\.attributes\)\.some\(\(a\) => a\.name\.startsWith\("data-sl"\) \|\| a\.name\.startsWith\("data-storelib"\)\) \|\| \/__sl\[A-Z\]/.test(canvas))
  check("  the script that puts the page back where it was scrolled to is marked as the canvas's", /const restore = `<script data-sl-own>\(function\(\)\{var y=/.test(canvas))
  check("such a change draws the page again behind, once the finger is up", /if \(plan\.scripts && !isLive\(\)\) \{\s*loadBehind\(html, docKey, list\)\s*return\s*\}/.test(canvas))
  check("  while a finger is down the rest is written in place, and the frame's scripts are kept as what it holds", /if \(plan\.scripts\) next\.scripts = now\.shape\.scripts/.test(canvas))
  check("a section swapped in runs a script whose text is new", /el\.replaceWith\(next\);\s*runScripts\(next\);/.test(bridge))
  check("  a script that already ran is not run again", /var key = old\.src \|\| old\.textContent;\s*if \(ran\.has\(key\)\) return;/.test(bridge))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
