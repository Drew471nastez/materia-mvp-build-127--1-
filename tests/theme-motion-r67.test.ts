/**
 * ===========================================================================
 *  ROUND 67: THEME MOTION AND EDITING IN THE CANVAS
 * ===========================================================================
 * The owner: editing replays animations; popups flash black or white; the
 * header's links vanish and pop back on a page load; Hero Image 1's rating
 * and customer blocks show nothing when added, and its verified badge is a
 * white check on white.
 *
 *   EDIT          a section drawn again after an edit, seen before, carries
 *                 data-mt-redrawn before it connects, and any finite entrance
 *                 starting in it is put at its end (canvas-bridge keepStill);
 *                 Materia's reveals, motion elements and picture fades read
 *                 the mark and show at once; round 66's scripts run again
 *   POPUPS        each part fades to the opacity its section gives it, never
 *                 past it (a 0.5 shade went to 1 and jumped back)
 *   HEADER        the desktop menu is never held unseen for its font
 *   HERO IMAGE 1  rating blocks and Happy customers have words and stars by
 *                 default, faces are placeholders until pictures are chosen,
 *                 the verified badge's check picks black or white by its fill
 *
 * Browser halves, measured in Chromium:
 *   scripts/check-canvas-edit-motion-r67.ts   the real editor: select and type in every section
 *   scripts/check-popup-flash-r67.ts          every overlay popup, open and close, compositor frames
 *   scripts/check-header-text-r67.ts          first visit, reload and page change, compositor frames
 *   scripts/check-reveal-types-r67.ts         every scroll_animation option of the schema
 *   scripts/check-hero-image1-blocks-r67.ts   every Hero Image 1 block with its defaults
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`) }
}
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const M = "theme-packages/materia/base/"
const bridge = code("lib/storelib-theme/compat/canvas-bridge.ts")
const animation = code(M + "assets/animation.js")
const global = code(M + "assets/global.js")
const media = code(M + "snippets/smooth-media-load.liquid")
const popups = code(M + "assets/materia-popups.js")
const fit = code(M + "snippets/header-menu-fit.liquid")
const menu = code(M + "snippets/horizontal-menu.liquid")
const layout = code(M + "layout/theme.liquid")
const icon = code(M + "snippets/guarantee-icon.liquid")
const block = code(M + "snippets/hero-image-one-block.liquid")
const heroJs = code(M + "assets/hero-image-one.js")
const heroCss = code(M + "assets/hero-image-one.css")
const hero = code(M + "sections/hero-image1.liquid")

console.log("\nAn edit never plays an entrance again\n")
{
  check("a swapped section seen before is marked before it connects", /var seen = seenBefore\(el\);\s*if \(seen\) next\.setAttribute\("data-mt-redrawn", ""\);\s*el\.replaceWith\(next\);/.test(bridge))
  check("round 66 kept: its inline scripts run again right after", /el\.replaceWith\(next\);\s*runScripts\(next, true\);\s*if \(seen\) keepStill\(next\);/.test(bridge))
  check("a custom element put back fresh is held still too", /if \(seen\) keepStill\(fresh\);/.test(bridge) && /runScripts\(fresh, true\)/.test(bridge))
  check("seen: on screen or above, marked, or already revealed", /el\.getBoundingClientRect\(\)\.top < innerHeight/.test(bridge) && /\[data-animation-done\], \[animation-end\]/.test(bridge))
  check("only finite entrances up to 4s that just started are finished", /!isFinite\(t\.endTime\) \|\| t\.endTime > 4000/.test(bridge) && /x\.currentTime \|\| 0\) > 300/.test(bridge) && /x\.finish\(\)/.test(bridge))
  check("the theme's own scroll reveals are left to it (a settings replay still plays)", /\/\^reveal\/i\.test\(x\.animationName/.test(bridge) && /closest\("\.scroll-trigger--armed"\)/.test(bridge))
  check("its names collide with none of the bridge's (a second var stillUntil broke the swap once)", (bridge.match(/var entranceUntil\b/g) ?? []).length === 1 && (bridge.match(/var stillUntil\b/g) ?? []).length === 1 && (bridge.match(/var keepStill\b/g) ?? []).length === 1 && (bridge.match(/var seenBefore\b/g) ?? []).length === 1)
  check("animation.js shows a redrawn section's reveals at once", /const redrawn = !!el\.closest\('\[data-mt-redrawn\]'\)/.test(animation) && /editor \|\| redrawn \|\|/.test(animation))
  check("a motion element in it shows at once", /!!this\.closest\('\[data-mt-redrawn\]'\) \|\|/.test(global))
  check("its pictures show with no fade", /el\.closest\('\[data-mt-redrawn\]'\)/.test(media))
}

console.log("\nPopups open and close with no flash\n")
{
  check("open: each part fades to its own resting opacity", /\{ opacity: 0 \}, \{ opacity: cardTo \}/.test(popups) && /\{ opacity: 0 \}, \{ opacity: shadeTo \}/.test(popups))
  check("close: from its resting opacity", /\{ opacity: cardFrom \}, \{ opacity: 0 \}/.test(popups) && /\{ opacity: shadeFrom \}, \{ opacity: 0 \}/.test(popups))
  check("never to 1 past it", !/\{ opacity: 0 \}, \{ opacity: 1 \}/.test(popups) && !/\{ opacity: 1 \}, \{ opacity: 0 \}/.test(popups))
  check("resting opacity read from the section's own style", /function restOpacity\(el\)/.test(popups))
}

console.log("\nThe header's words from the first frame\n")
{
  check("the menu list is drawn with no wait", !/data-hs-wait/.test(menu.replace(/\{%-? comment[\s\S]*?endcomment -?%\}/g, "")))
  check("the fit never sets the wait, and clears an old one", !/setAttribute\('data-hs-wait'/.test(fit) && /removeAttribute\('data-hs-wait'\)/.test(fit))
  check("the fit runs again when the font arrives", /loadingdone/.test(fit))
  check("the header's sheets are asked for from the head", /rel="preload" as="style" href="\{\{ 'header-section\.css'/.test(layout) && /rel="preload" as="style" href="\{\{ 'header-layout\.css'/.test(layout))
}

console.log("\nHero Image 1\n")
{
  const schema = JSON.parse(hero.slice(hero.indexOf("{% schema %}") + 12, hero.indexOf("{% endschema %}"))) as { blocks: { type: string; settings: { id?: string; default?: unknown }[] }[] }
  const def = (t: string, id: string) => schema.blocks.find((b) => b.type === t)!.settings.find((s) => s.id === id)?.default
  check("Happy customers: a heading and five stars by default", typeof def("happy_customers", "heading") === "string" && def("happy_customers", "filled_stars") === 5)
  check("Simple rating: words and five stars", typeof def("simple_rating", "text") === "string" && def("simple_rating", "filled_stars") === 5)
  check("Rating badge: words and five stars", typeof def("lod_rating_badge", "label_text") === "string" && def("lod_rating_badge", "rating") === 5)
  check("the script's own defaults say the same", heroJs.includes('"heading":"Loved by our customers"') && heroJs.includes('"text":"Rated 5 stars by our customers"') && heroJs.includes('"label_text":"Excellent","rating":5'))
  check("no picture chosen: placeholder faces, in markup and script", /hi1__avatar-placeholder/.test(block) && /any=\[\.\.\.avatars\.children\]\.some/.test(heroJs) && /\.hi1__avatar:has\(img\) \.hi1__avatar-placeholder\{display:none\}/.test(heroCss))
  check("a picture taken away leaves no old picture behind", /if\(!src&&img\)\{img\.remove\(\);img=null;\}/.test(heroJs))
  check("the verified badge's check is black or white by its fill, white without relative colours", /stroke="#ffffff" style="stroke:oklch\(from currentColor clamp\(0, \(0\.7 - l\) \* 1000, 1\) 0 0\)"/.test(icon))
  const copy = [def("happy_customers", "heading"), def("simple_rating", "text"), def("lod_rating_badge", "label_text")].join(" ")
  check("no AI words or dashes in the new copy", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform|—/i.test(copy), copy)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
