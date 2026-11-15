/**
 * ===========================================================================
 *  ROUND AS (track 1): THEME CARDS THAT ARE REAL PAGES, PLASTER, NO GLOW
 *  NOBODY ASKED FOR
 * ===========================================================================
 *   CARDS     every theme has a creator of its own (components/onepage/
 *             themes/preview-content): a name, a line, a portrait, three
 *             socials the icon set draws, two products with prices, a
 *             booking link, a newsletter, a plain link; the card draws them
 *             with the page's own helpers and no grey bars; the content is
 *             its own chunk, loaded with the theme page.
 *   PLASTER   the new theme: listed, named in six languages, its own
 *             structure, every colour pair readable, its cover our own SVG.
 *   GLOW      the legibility guard's outline is a hairline, no theme turns
 *             the avatar ring on by itself, the Glow animation and hover and
 *             Aero's light are faint.
 *
 * The browser half: scripts/check-onepage-theme-swatches.mjs (card beside
 * the live page for every theme, the grid's cost at 390 and 1440) and
 * scripts/check-onepage-glow-as1.mjs (every theme's light glows, by source).
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` (${detail})` : "")); console.log(`  FAIL  ${label}${detail ? ` (${detail})` : ""}`) }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
type T = Record<string, any>

/*
  Changed on purpose (round AT): the made-up creators (components/onepage/themes/preview-content), their drawn
  portraits and Plaster are gone. Every card draws the account's own page (components/onepage/themes/preview-account)
  and Plaster is Stoicism; tests/onepage-at1.test.ts holds both. What stays from round AS is pinned here.
*/
console.log("\nThe card")
const preview = read("components/onepage/themes/theme-swatch.tsx")
check("no grey bars: the Words placeholder is gone", !/function Words|<Words /.test(preview))
/* Changed on purpose (the theme swatch round): the checks here described the page-sized theme card (the creator's page at a card's scale, components/onepage/themes/theme-preview). The owner asked for that card to go; a card is a swatch now (components/onepage/themes/theme-swatch) and tests/onepage-swatch-themes.test.ts checks it. Removed: "the card reads the page's own helpers..."; "a product as the page's callout..."; "the blocks keep the page's width..."; "the cards' fonts cover the body...". */
const design = read("components/onepage/tabs/design-tab.tsx")
check("no made-up creators are left", !existsSync(join(root, "components/onepage/themes/preview-content.ts")) && !/preview-content/.test(preview + design))

console.log("\nNo glow nobody chose")
const legible = read("lib/onepage/legible.ts")
const outline = legible.slice(legible.indexOf("function outline("), legible.indexOf("export function guardLegibility"))
check("the guard's outline is a hairline, never blurred past 2px", outline.length > 0 && !/\b([3-9]|\d\d)px/.test(outline.replace(/0 0 1px|0 1px 2px/g, "")))
check("no theme turns the avatar's glowing ring on by itself", THEME_TEMPLATES.every((t) => (t.theme_config as T).laser_glow_enabled !== true))
const pub = read("components/onepage/public-onepage.tsx")
check("the ring a creator picks is tighter and has no second halo", /const glowSpread = laserGlowIntensity === "low" \? 3 : laserGlowIntensity === "hard" \? 6 : 4/.test(pub) && !/boxShadow: `0 0 \$\{glowSpread \* 2\}px/.test(pub))
const css = read("app/globals.css")
const keyframes = css.slice(css.indexOf("@keyframes onepage-glow"), css.indexOf("@keyframes onepage-swipe"))
check("the Glow animation is faint: no blur past 10px and nothing over 26%", !/\b(1[1-9]|[2-9]\d)px/.test(keyframes) && !/\) (2[7-9]|[3-9]\d)%/.test(keyframes))
check("the Glow hover is faint", /\.op-btn\[data-hover="glow"\]::before \{\s*box-shadow:\s*0 0 0 2px [^;]*14%[^;]*0 6px 16px -6px [^;]*30%/.test(css))
const skins = read("components/onepage/themes/theme-skins.css")
check("Aero's name and words keep their emboss, not a white cloud", !/0 0 22px rgba\(255,255,255,\.85\)/.test(skins) && !/0 0 14px rgba\(255,255,255,\.8\)/.test(skins) && !/0 0 34px rgba\(255,255,255/.test(skins))
check("the probes and these tests are registered", read("scripts/run-push-tests.mjs").includes("tests/onepage-as1.test.ts"))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
