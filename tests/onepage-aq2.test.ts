/**
 * Round AQ, the OnePage editor and its preview:
 *
 *   - the onboarding's template step draws the Design tab's theme preview,
 *     at one scale for its grid, with the creator's photo and no webfonts
 *   - a block's Layout pictures draw the block's own content (a link's icon
 *     and description, a shelf's picked products with names and prices, a
 *     group's titles, a signup's headline, a booking's button words); a
 *     grey stand-in only where there is nothing to show
 *   - a form's row is named and drawn as Add block names it, never its type
 *   - Subscribe's two buttons keep their labels on one line
 *   - the sheet feel kit's "slow" pull is slower than a flick, and a sheet
 *     that closed fails instead of passing as one at rest
 *   - a check of the preview in a real Next server exists
 *
 * scripts/check-onepage-onboarding.mjs, scripts/check-onepage-sheets.mjs and
 * scripts/check-onepage-real-preview.mjs measure them in a browser.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const onboarding = read("components/onepage/onboarding-modal.tsx")
const scale = read("components/onepage/themes/preview-scale.ts")
const preview = read("components/onepage/themes/theme-preview.tsx")
check("the onboarding's cards are the theme preview, in the Design tab's 4:5 frame", /<ThemePreview c=\{look\} who=\{who\} thumb=\{themeThumbSrc\} \/>/ /* Changed on purpose (round AT): the person's own page so far. */ /* Changed on purpose (round AS): the card names its theme, whose creator it draws around the person's own name and photo. */.test(onboarding) && /data-template-frame="" className="op-demo relative block aspect-\[4\/5\]/.test(onboarding))
check("one scale for the grid, measured by a ref callback (the grid arrives in the dialog's portal)", /useCallback\(\(grid: HTMLDivElement \| null\) => \(grid \? scaleThemePreviews\(grid, "\[data-template-frame\]"\) : undefined\), \[\]\)/.test(onboarding) && /ref=\{templateGridRef\}/.test(onboarding))
check("the scale helper lives beside the preview, which keeps no hooks", /export function scaleThemePreviews/.test(scale) && /export function useThemePreviewScale/.test(scale) && !/use(State|Effect|LayoutEffect|Ref)\(/.test(preview))
/* Changed on purpose (round AS): the person's photo, or the theme's creator's portrait, in the avatar and the Hero (data-tp-photo now marks every drawn picture). */
check("the creator's photo is drawn in the preview's avatar and Hero", (preview.match(/\{face \? <img src=\{onePageImageSrc\(face, /g) ?? []).length === 2 && /const face = who\.avatar/.test(preview) /* Changed on purpose (round AT): the account's photo, at the optimizer's size. */)
check("a pick redraws the marks, not the picture (memoised)", /const TemplatePicture = memo\(/.test(onboarding))
check("no webfonts and no hand made card in the onboarding", !/themeNameFontsHref|TEMPLATE_THUMBS|<WallpaperPattern/.test(onboarding))
check("the templates' pictures are the Design tab's own preloaded copies", /release = preloadThemeThumbs\(\)/.test(onboarding))

const pickers = read("components/onepage/layout-pickers.tsx")
const settings = read("components/onepage/block-settings.tsx")
check("Arrange draws the block's own names and lines, a bar only without them", /export type ArrangeItem = \{ image\?: string \| null; title\?: string \| null; meta\?: string \| null \}/.test(pickers) && /words\(item\(i\)\.title, "70%"\)/.test(pickers))
check("a list draws as many rows as the block has, up to three", /\.slice\(0, items\.length \? Math\.min\(3, items\.length\) : 3\)/.test(pickers))
check("a shelf's pictures are its picks in order, with custom thumbnails and prices", /function shelfPreviewItems\(/.test(read("components/onepage/storelib-blocks.tsx")) && /custom_thumbnail \|\| p\.thumbnail_url/.test(read("components/onepage/storelib-blocks.tsx")))
check("a group's pictures carry its blocks' titles", /items=\{\(groupData\.children \|\| \[\]\)\.filter\(\(c\) => c\.enabled !== false\)/.test(read("components/onepage/tabs/links-tab.tsx")))
check("a link's layouts draw its icon and description; Classic and Compact draw no picture without one", /const icon = resolveLinkIcon\(data\.icon, data\.url\)/.test(settings) && /\) : small \? null : \(/.test(settings) && /\{sub\("70%"\)\}/.test(settings))
check("over a picture the icon keeps to the top corner, clear of the words", /cls\.includes\("inset-0"\) \? "items-start justify-start p-1"/.test(settings))
check("Featured draws the block's own button words", /cta\?\.trim\(\) \?/.test(settings) && (read("components/onepage/tabs/links-tab.tsx").match(/cta=\{data\.button_text\}/g) ?? []).length === 3)
check("a signup's layouts draw its headline", /headline=\{data\.headline\}/.test(read("components/onepage/tabs/links-tab.tsx")) && /const head = \(w: string, color = ink\) =>/.test(read("components/onepage/email-signup.tsx")))

const links = read("components/onepage/tabs/links-tab.tsx")
check("a form's row is named Form with its glyph, never its type", /function formRow\(block: OnePageBlock\)/.test(links) && (links.match(/case "form_quiz":\n\s+return formRow\(block\)/g) ?? []).length === 2 && /icon: GlyphForm, incomplete: !data\.form_id/.test(links))
check("the Links tab's picture opens by keyboard and has a stable hook", /data-profile-avatar=""\s+role="button"\s+tabIndex=\{0\}/.test(links))
check("Subscribe's buttons keep their labels on one line and stack when narrow", /<div className="flex flex-wrap gap-2">\s+<a href="\/app\/emails\?tab=subscribers" className="inline-flex h-9 flex-\[1_1_auto\] items-center justify-center whitespace-nowrap/.test(read("components/onepage/creator-blocks.tsx")))

const kit = read("scripts/sheet-feel-kit.mjs")
check("the kit's slow pull is under the flick speed (15px a 100ms)", /drag\(s, g, 120, \{ steps: 8, pauseMs: 100, measure: true \}\)/.test(kit))
check("a sheet that closed fails the spring back check", /settled !== null && Math\.abs\(settled\) < 0\.5/.test(kit))
check("the real server check frames the preview from a plain same-origin host", /__aq2_host/.test(read("scripts/check-onepage-real-preview.mjs")) && /KnownDevices\["iPhone 13"\]/.test(read("scripts/check-onepage-real-preview.mjs")))
check("the probe is registered", read("scripts/run-push-tests.mjs").includes("tests/onepage-aq2.test.ts"))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
