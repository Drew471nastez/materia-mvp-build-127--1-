/**
 * ===========================================================================
 *  ROUND AP: TWO MORE THEMES, AND EVERY THEME CARD DRAWN AS ITS PAGE
 * ===========================================================================
 * Cobalt and Notebook: new kinds of page, their words readable on what is
 * behind them (WCAG 4.5:1, measured against every colour of a gradient and
 * through a Soft button's tint), set only what the next theme resets, and
 * named in all six languages. The picker's cards: the page itself from the
 * live page's own helpers (components/onepage/themes/theme-preview), scaled
 * from one measure. scripts/check-onepage-theme-previews.mjs draws each
 * theme's live page beside its card in headless Chromium and compares them.
 *
 * Run with:  npx tsx tests/onepage-themes-ap.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { AP_THEMES, R40_THEMES, R42_THEMES, withR40Themes } from "@/components/onepage/themes/r40-themes"
import { LOOK_RESET, contrastRatio, lookFromTemplate } from "@/lib/onepage/theme-apply"
import { buttonFill, buttonHover } from "@/lib/onepage/button-style"
import { ONEPAGE_FONTS, familyOf } from "@/lib/onepage/fonts"
import { blockLayoutOf, headerAlignOf } from "@/lib/onepage/theme-layout"
import { readCatalog } from "../scripts/i18n/catalog-file.mjs"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` (${detail})` : "")); console.log(`  FAIL  ${label}${detail ? ` (${detail})` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const ratio = (a: string, b: string) => contrastRatio(a, b) ?? 0

/* A colour laid over another at a share (what color-mix with transparent paints over the page). */
function over(top: string, share: number, under: string): string {
  const rgb = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16))
  const a = rgb(top), b = rgb(under)
  return "#" + a.map((v, i) => Math.round(v * share + b[i] * (1 - share)).toString(16).padStart(2, "0")).join("")
}
/* Every colour a page shows behind its words: the flat colour, or each stop of the gradient and the middle. */
function behind(c: Record<string, any>): string[] {
  const stops = c.background_type === "gradient" ? [...String(c.background_gradient).matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0]) : []
  return stops.length >= 2 ? [...stops, over(stops[0], 0.5, stops[stops.length - 1])] : [c.background_color]
}

console.log("\nTwo more themes, each a page no other theme makes")
const all = [...R40_THEMES, ...R42_THEMES]
const design = read("components/onepage/tabs/design-tab.tsx")
check("two themes, new ids", AP_THEMES.length === 2 && AP_THEMES.every((t) => !all.some((o) => o.id === t.id) && !design.includes(`\n    id: "${t.id}",`)))
const [cobalt, notebook] = AP_THEMES.map((t) => t.theme_config as Record<string, any>)
check("Cobalt is the only bright Hero: a photo over a saturated gradient, with Soft buttons no other theme uses",
  AP_THEMES[0].profile_layout === "hero" && cobalt.background_type === "gradient" && buttonFill(cobalt as never) === "soft" && !/button_style: "soft"/.test(design) && !all.some((t) => (t.theme_config as any).button_style === "soft"))
check("Notebook is ruled paper with a handwritten name, flush left, its links two to a row (Mixed, which no theme used)",
  notebook.background_pattern === "lines" && familyOf(notebook.title_font) === "Caveat" && headerAlignOf(notebook) === "left" && blockLayoutOf(notebook) === "masonry" && !/block_layout: "masonry"/.test(design) && !all.some((t) => (t.theme_config as any).block_layout === "masonry"))
check("neither shares a title face with another theme", AP_THEMES.every((t) => ![...all.map((o) => (o.theme_config as any).title_font), ...[...design.matchAll(/title_font: "([^"]+)"/g)].map((m) => m[1])].includes(t.theme_config.title_font)))

for (const t of AP_THEMES) {
  const c = t.theme_config as Record<string, any>
  const under = behind(c)
  const low = (fg: string) => Math.min(...under.map((b) => ratio(b, fg)))
  check(`${t.name}: the name, the words and the bio read at 4.5:1 on every colour behind them`, low(c.title_color) >= 4.5 && low(c.text_color) >= 4.5 && low(c.secondary_text_color) >= 4.5, `${low(c.title_color).toFixed(2)} ${low(c.text_color).toFixed(2)} ${low(c.secondary_text_color).toFixed(2)}`)
  check(`${t.name}: the social icons read at 3:1`, low(c.social_icon_color) >= 3, low(c.social_icon_color).toFixed(2))
  /* What a button's words sit on: its colour (Solid), the page (Outline), or the page through 14% of its colour (Soft). */
  const fill = buttonFill(c as never)
  const surfaces = fill === "filled" ? [c.button_color] : fill === "soft" ? under.map((b) => over(c.button_color, 0.14, b)) : under
  const button = Math.min(...surfaces.map((s) => ratio(s, c.button_text_color)))
  check(`${t.name}: button words read at 4.5:1 at rest`, button >= 4.5, button.toFixed(2))
  check(`${t.name}: and on hover, in its own colours`, ["fill", "pop"].includes(buttonHover(c as never)) && ratio(c.button_hover_fill, c.button_hover_text) >= 4.5, ratio(c.button_hover_fill, c.button_hover_text).toFixed(2))
  check(`${t.name}: fonts the page loads`, [c.font_family, c.title_font].every((f) => Object.prototype.hasOwnProperty.call(ONEPAGE_FONTS, familyOf(f) || "")))
  check(`${t.name}: no violet`, !/#(8b5cf6|7c3aed|a855f7|9333ea|6d28d9)/i.test(JSON.stringify(c)))
  const beyond = Object.keys(c).filter((k) => !["background_type", "background_color", "text_color", "button_color", "button_text_color", "button_style", "button_border_radius", "button_border_color", "font_family", "spacing", "card_width", "header_layout"].includes(k))
  check(`${t.name}: everything else it sets is reset by the next theme`, beyond.every((k) => k in LOOK_RESET), beyond.filter((k) => !(k in LOOK_RESET)).join())
  const page = { id: "p", theme: { template_id: t.id, ...c }, settings: {}, draft_blocks: [] } as never
  const next = lookFromTemplate(page, { id: "air", category: "light", theme_config: { background_color: "#eef0f3" } }).theme as unknown as Record<string, unknown>
  check(`${t.name}: picking another theme leaves none of it behind`, next.block_layout === null && next.background_pattern === "none" && next.title_font === null && next.button_hover_fill === null)
}
const merged = withR40Themes([{ id: "a", category: "light" }, { id: "b", category: "gradient" }])
/* Changed on purpose (round W8): Gazette (light) and Halo (gradient) now follow Notebook and Cobalt at the end of their kinds. */
check("Notebook joins the light themes and Cobalt the gradients", merged.map((t) => t.id).join(",").includes("folio,notebook,gazette,linen,harbor,portrait,aqua,messenger,playful,grunge,aqua2,messenger2,grunge2,b,lagoon,cobalt,halo,aero,y2k2,vaporwave") /* Changed on purpose (round W10): the W10 themes follow the W9 ones. */ /* Changed on purpose (round W9): Aqua, Messenger, Playful and Grunge join the light themes, Aero the gradients. */, merged.map((t) => t.id).join(",") /* Changed on purpose (wave 11): Linen, Harbor and Portrait come right after the first six in All (with this test's short catalogue, after its sixth), whatever their kind. */)

console.log("\nEvery theme's name in six languages")
const names = read("components/onepage/themes/theme-names.ts")
const ids = [...design.matchAll(/\n  \{\n    id: "([a-z0-9-]+)",/g)].map((m) => m[1]).concat([...all, ...AP_THEMES].map((t) => t.id))
check("every theme has a line", ids.length >= 35 && ids.every((id) => new RegExp(`\\n  ${id}: \\(\\) => ttx\\("theme", "`).test(names)), ids.filter((id) => !new RegExp(`\\n  ${id}: \\(\\)`).test(names)).join())
const words = [...names.matchAll(/ttx\("theme", "([^"]+)"\)/g)].map((m) => `theme::${m[1]}`)
for (const lang of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
  const cat = readCatalog(join(process.cwd(), "lib/i18n/catalog", `${lang}.ts`)) as Record<string, string>
  const missing = words.filter((w) => !cat[w])
  check(`${lang}: every name`, missing.length === 0, missing.join())
}
check("the card and its label show the name in the reader's language", /const name = themeLabel\(template\)/.test(design) && /aria-label=\{tt\("\{name\} theme", \{ name \}\)\}/.test(design))
/* Changed on purpose (round W8): the cut carries the names in capitals too, for the themes that set their name in capitals. */
check("the names' faces are cut to the letters of the names as the language spells them", /const names = THEME_TEMPLATES\.map\(\(t\) => themeLabel\(t\)\)\.join\(""\); return onePageFontSampleHref\(THEME_NAME_FAMILIES, names \+ names\.toUpperCase\(\)\)/.test(design))

console.log("\nA theme card is the page, at a card's scale")
const preview = read("components/onepage/themes/theme-preview.tsx")
check("drawn from the live page's own helpers", ["avatarLook", "titleSizeClass", "titleTypeStyle", "themeButtonStyle", "BUTTON_SIZE_CLASS", "blockGapClass", "blockLayoutOf", "coverImageOf", "coverAspect", "themeProductLayoutOf", "cardButtonTheme", "WallpaperPattern", "SocialIcon"].every((h) => preview.includes(h)))
check("laid out at the phone's 390px and scaled by one number", /export const PREVIEW_WIDTH = 390/.test(preview) && /transform: "scale\(var\(--tp-scale, 0\.42\)\)"/.test(preview))
check("the phone's classes, never a computer's sm: steps", /const phone = \(cls: string\) => cls\.split/.test(preview) && /phone\(BUTTON_SIZE_CLASS\[size\]\)/.test(preview) && /phone\(titleSizeClass\(/.test(preview))
check("the name never shrinks: one line, its own height", /data-tp-title=""[\s\S]{0,80}whitespace-nowrap font-bold leading-\[1\.5\]/.test(preview) && !/truncate/.test(preview))
/* Changed on purpose (round AQ): the measuring is one helper beside the preview (themes/preview-scale), shared by the Design tab and the onboarding. */
const scaleFile = readFileSync(join(process.cwd(), "components/onepage/themes/preview-scale.ts"), "utf8")
check("the Design tab measures one card for the whole grid", /grid\.style\.setProperty\("--tp-scale", String\(w \/ PREVIEW_WIDTH\)\)/.test(scaleFile) && /new ResizeObserver\(measure\)/.test(scaleFile) && /useThemePreviewScale\(gridRef, "\[data-theme-kind-shown\] \[data-theme-frame\]"\)/.test(design))
{
  /* Round AQ: the onboarding's template step draws the same preview, at one scale for its grid, with no webfonts. */
  const onboarding = readFileSync(join(process.cwd(), "components/onepage/onboarding-modal.tsx"), "utf8")
  check("the onboarding's template cards are the Design tab's preview", /<ThemePreview c=\{look\} name=\{name\} thumb=\{themeThumbSrc\} photo=\{photo\} \/>/.test(onboarding) && /scaleThemePreviews\(grid, "\[data-template-frame\]"\)/.test(onboarding) && /aspect-\[4\/5\]/.test(onboarding))
  check("the onboarding draws no hand made template card and loads no name faces", !/TEMPLATE_THUMBS/.test(onboarding) && !/themeNameFontsHref/.test(onboarding) && !/<WallpaperPattern/.test(onboarding))
}
check("no state and no effects inside a card", !/use(State|Effect|LayoutEffect|Ref)\(/.test(preview))
check("a Hero theme's card draws its Hero", /profile_layout === "hero" \? \{ \.\.\.c, header_layout: "hero" \} : c/.test(design))
check("a theme's cover picture is fetched with the photos, before the page opens", /coverImageOf\(c\)\]\.filter/.test(design))
const css = read("app/globals.css")
check("on the page, a half-width link is a tile, its words never broken a letter at a time", /\[data-mixed-blocks\] > \[data-block-size="half"\] \.op-btn \{ height:100%; flex-direction:column;/.test(css) && /\[data-mixed-blocks\] > \[data-block-size="half"\] \.op-btn > div \{ padding-inline:0;/.test(css))
check("the probe is registered", read("scripts/run-push-tests.mjs").includes("tests/onepage-themes-ap.test.ts"))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
