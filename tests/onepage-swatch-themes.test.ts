/**
 * ===========================================================================
 *  THE THEME CARDS ARE SWATCHES, AND NINETEEN PAINTED WALLPAPERS
 * ===========================================================================
 * The owner: "make sure that the theme previews cards are more accurate and
 * smooth", "when I hover over a theme, make sure it doesn't bump", "get rid
 * of our current ones that fetch buttons randomly or actual profile avatar",
 * "create all of those themes ... add for them different names".
 *
 *   SWATCH    a card draws the theme's wallpaper, "Aa" in its title face and
 *             one button from the page's own button style, close up. It asks
 *             for no account, draws no photo of the creator's, and nothing
 *             on it answers the pointer.
 *   CARD      the Design tab and the onboarding draw that swatch, with no
 *             hover that moves or resizes anything.
 *   FACES     one small request for the cards' faces, each at the weight its
 *             theme sets its name in.
 *   THEMES    nineteen: valid settings, fonts the page loads, no picture
 *             fetched, every colour pair readable on every stop of the
 *             wallpaper, a structure no other theme has, a name in every
 *             language and a place in the picker.
 *
 * The cards in a browser, measured: scripts/check-onepage-theme-swatches.mjs.
 *
 * Run with:  npx tsx tests/onepage-swatch-themes.test.ts
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { MOOD_THEMES } from "@/components/onepage/themes/mood-themes"
import { SWATCH_HEIGHT, SWATCH_LETTERS, SWATCH_WIDTH, SWATCH_ZOOM, ThemeSwatch, swatchButtonStyle } from "@/components/onepage/themes/theme-swatch"
import { THEME_GROUPS, themeGroupOf } from "@/components/onepage/themes/theme-order"
import { themeLabel } from "@/components/onepage/themes/theme-names"
import { THEME_TEMPLATES, themeSwatchFontsHref } from "@/components/onepage/tabs/design-tab"
import { ONEPAGE_FONTS, familyOf, onePageFontCutHref } from "@/lib/onepage/fonts"
import { TEXT_MIN, LARGE_MIN, buttonGrounds, pageGrounds, parseColor, readableTheme, worstContrast } from "@/lib/onepage/contrast"
import { WALLPAPER_PATTERNS } from "@/lib/onepage/wallpaper"
import { lookFromTemplate } from "@/lib/onepage/theme-apply"
import { readCatalog } from "../scripts/i18n/catalog-file.mjs"

let failed = 0
function check(label: string, ok: boolean, detail?: string) {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${ok || !detail ? "" : `\n        ${detail}`}`)
  if (!ok) failed++
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
type T = Record<string, any>

console.log("\nThe swatch")
const thumb = (u: string) => `thumb:${u}`
const draw = (c: T) => renderToStaticMarkup(createElement(ThemeSwatch, { c, thumb }))
const all = THEME_TEMPLATES as unknown as { id: string; name: string; category: string; theme_config: T }[]
const drawn = all.map((t) => ({ id: t.id, c: t.theme_config, html: draw(t.theme_config) }))
const count = (html: string, what: string) => html.split(what).length - 1
check(`every one of the ${all.length} themes draws: one page, one wallpaper, the letters, one button`, drawn.every((d) => count(d.html, 'data-ts-page=""') === 1 && count(d.html, 'data-ts-wall=""') === 1 && count(d.html, 'data-ts-name=""') === 1 && count(d.html, 'data-ts-button=""') === 1 && d.html.includes(`>${SWATCH_LETTERS}</span>`)), drawn.filter((d) => count(d.html, 'data-ts-button=""') !== 1).map((d) => d.id).join())
check("the button is the page's own .op-btn, so a skin's material is on it", drawn.every((d) => /class="op-btn [^"]*"[^>]*|data-ts-button=""[^>]*class="op-btn /.test(d.html)))
check("nothing on a swatch answers the pointer, so no hover of the theme's can play", drawn.every((d) => /data-ts-page=""[^>]*class="pointer-events-none /.test(d.html)) && drawn.every((d) => !d.html.includes("op-demo") && !d.html.includes("data-hover")))
check("a swatch draws nothing of a creator's: no photo, link, product, newsletter or socials", drawn.every((d) => !/data-tp-|data-theme-avatar|data-tp-monogram/.test(d.html)))
const pictures = (d: { c: T }) => (d.c.background_type === "image" && d.c.background_image_url ? 1 : 0) + (d.c.header_layout !== "hero" && d.c.cover_image_url ? 1 : 0)
check("the only pictures are a theme's own wallpaper photo and cover, through the card's small copy", drawn.every((d) => count(d.html, "<img") === pictures(d) && (pictures(d) === 0 || d.html.includes('src="thumb:'))), drawn.filter((d) => count(d.html, "<img") !== pictures(d)).map((d) => d.id).join())
check("a card is 4:5 of a phone's width", SWATCH_WIDTH === 390 && Math.abs(SWATCH_WIDTH / SWATCH_HEIGHT - 0.8) < 0.002)
const pill = swatchButtonStyle({ button_style: "filled", button_color: "#000000", button_text_color: "#ffffff", button_border_radius: 999, button_border_width: 0, button_shadow: "none" } as never)
const soft = swatchButtonStyle({ button_style: "outline", button_color: "#000000", button_text_color: "#000000", button_border_radius: 8, button_border_width: 1, button_border_color: "#000000", button_shadow: "hard", button_shadow_color: "#112233" } as never)
check("a pill stays a pill; any other corner is the page's, at the swatch's zoom", pill.borderRadius === 9999 && soft.borderRadius === 8 * SWATCH_ZOOM)
check("an outline is the page's (2px at least), at the zoom", soft.borderWidth === 2 * SWATCH_ZOOM && pill.borderWidth === 0)
check("a hard shadow is the page's 4px offset at the zoom, in the theme's shadow colour", String(soft.boxShadow).startsWith(`${4 * SWATCH_ZOOM}px ${4 * SWATCH_ZOOM}px 0 `) && String(soft.boxShadow).includes("#112233") && pill.boxShadow === "none")

console.log("\nThe card")
const design = read("components/onepage/tabs/design-tab.tsx")
const onboarding = read("components/onepage/onboarding-modal.tsx")
const card = design.slice(design.indexOf("const ThemeCard = memo("), design.indexOf("type ThemeFilter = "))
const tcard = onboarding.slice(onboarding.indexOf("const TemplatePicture = memo("), onboarding.indexOf('<span data-template-name=""'))
check("the Design tab's card is the swatch", /<ThemeSwatch c=\{c\} thumb=\{themeThumbSrc\} \/>/.test(card))
check("the onboarding's card is the same swatch", /<ThemeSwatch c=\{template\.theme_config as Record<string, any>\} thumb=\{themeThumbSrc\} \/>/.test(tcard))
for (const [name, src] of [["Design tab", card], ["onboarding", tcard]] as const) {
  check(`${name}: no account is handed to a card`, !/\bwho\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")))
  check(`${name}: the card plays no hover of the theme's and has no hover that moves, sizes or shadows it`, !src.includes("op-demo") && !/hover:(?:scale|translate|-translate|shadow|border|p[xy]?-|m[xy]?-|w-|h-)/.test(src) && !/group-hover\/theme:(?!opacity-100)/.test(src))
  check(`${name}: the pointer only fades in a darker hairline`, /opacity-0 shadow-\[inset_0_0_0_1px_rgba\(0,0,0,0\.22\)\] transition-opacity duration-150 group-hover\/theme:opacity-100/.test(src))
  check(`${name}: picked is the ring outside the swatch`, /<SwatchMark on=\{selected\} className="rounded-\[21\.5px\]" \/>/.test(src))
}
check("the old card and its account are gone", !existsSync(join(process.cwd(), "components/onepage/themes/theme-preview.tsx")) && !existsSync(join(process.cwd(), "components/onepage/themes/preview-account.ts")) && !/theme-preview"|preview-account"/.test(design + onboarding))
check("one scale for the grid, from the swatch's width", /String\(w \/ SWATCH_WIDTH\)/.test(read("components/onepage/themes/preview-scale.ts")))

console.log("\nThe faces")
const href = themeSwatchFontsHref() || ""
check("one request, cut to the letters a card sets, both cases", href.startsWith("https://fonts.googleapis.com/css2?") && href.endsWith("&text=Aa&display=swap"), href.slice(-40))
check("a face is asked for at the weight its theme sets its name in", onePageFontCutHref([{ family: "Fraunces", weight: 700 }, { family: "Fraunces", weight: 400 }], "Aa") === "https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&text=Aa&display=swap")
check("a face with one weight is asked for as it is, and one not on the list is left out", onePageFontCutHref([{ family: "Instrument Serif", weight: 400 }, { family: "Not A Font", weight: 400 }], "Aa") === "https://fonts.googleapis.com/css2?family=Instrument+Serif&text=Aa&display=swap" && onePageFontCutHref([{ family: null, weight: 400 }], "Aa") === null)
check("every theme's title face is in the request", all.every((t) => { const f = familyOf(t.theme_config.title_font || t.theme_config.font_family); return !f || !(f in ONEPAGE_FONTS) || href.includes(`family=${encodeURIComponent(f).replace(/%20/g, "+")}`) }))
check("the Design tab and the onboarding both link it", /const nameFontsHref = themeSwatchFontsHref\(\)/.test(design) && /const swatchFontsHref = themeSwatchFontsHref\(\)/.test(onboarding) && /<link rel="stylesheet" href=\{swatchFontsHref\} \/>/.test(onboarding))

console.log("\nThe nineteen themes")
const mood = MOOD_THEMES as unknown as { id: string; name: string; category: string; theme_config: T; share_style?: string }[]
check("nineteen, each id once, none an older theme's", mood.length === 19 && new Set(mood.map((t) => t.id)).size === 19 && mood.every((t) => all.filter((a) => a.id === t.id).length === 1))
check("every one is in the picker", mood.every((t) => all.some((a) => a.id === t.id)))
const PATTERNS = new Set(WALLPAPER_PATTERNS.map((p) => p.id))
const sig = (t: T) => {
  const r = Number(t.button_border_radius ?? 8)
  const shape = r <= 0 ? "square" : r >= 100 ? "pill" : r <= 8 ? "soft" : "round"
  return [t.header_layout || "classic", t.cover_image_url ? "cover" : "-", t.block_layout || "list", t.product_layout || "own", t.header_align || "center", t.button_style, shape, t.theme_skin || "-"].join("|")
}
const langs = ["es", "fr", "de", "pt-BR", "it", "pl"]
const catalogs = Object.fromEntries(langs.map((l) => [l, readCatalog(join(process.cwd(), "lib/i18n/catalog", `${l}.ts`)) as Record<string, string>]))
const placed = THEME_GROUPS.flatMap((g) => g.ids as readonly string[])
for (const t of mood) {
  const c = t.theme_config
  const problems: string[] = []
  if (!["light", "dark", "gradient"].includes(t.category)) problems.push("kind")
  if (!["solid", "gradient"].includes(c.background_type) || c.background_image_url !== "") problems.push("fetches a picture")
  if (c.background_type === "gradient" && (!c.background_gradient || /url\(|transparent/i.test(c.background_gradient))) problems.push("gradient")
  if (c.background_type === "solid" && c.background_gradient !== "") problems.push("a gradient left on a solid")
  if (!/^#[0-9a-f]{6}$/i.test(c.background_color)) problems.push("base colour")
  for (const f of [c.font_family, c.title_font]) if (!(String(familyOf(f)) in ONEPAGE_FONTS)) problems.push(`font ${f}`)
  if (!PATTERNS.has(c.background_pattern)) problems.push("pattern")
  if (!["filled", "outline", "glass"].includes(c.button_style)) problems.push("button style")
  if (!["none", "subtle", "strong", "hard"].includes(c.button_shadow)) problems.push("shadow")
  if (!["list", "grid", "cards", "masonry", "compact"].includes(c.block_layout)) problems.push("layout")
  if (!["left", "center"].includes(c.header_align)) problems.push("align")
  if (!["white", "black", "glassmorphism"].includes(String(t.share_style))) problems.push("share style")
  check(`${t.name}: valid settings, its faces on the list, no picture fetched`, problems.length === 0, problems.join(", "))
  const g = pageGrounds(c)
  const bg = buttonGrounds(c, g)
  const at = (ink: unknown, on: typeof g) => worstContrast(parseColor(ink)!, on)
  const pairs: [string, number, number][] = [
    ["text", at(c.text_color, g), TEXT_MIN],
    ["small print", at(c.secondary_text_color, g), TEXT_MIN],
    ["name", at(c.title_color, g), TEXT_MIN],
    ["button words", at(c.button_text_color, bg), TEXT_MIN],
    ["social marks", at(c.social_icon_color, g), LARGE_MIN],
  ]
  if (c.button_hover_fill && c.button_hover_text) pairs.push(["hover words", at(c.button_hover_text, [parseColor(c.button_hover_fill)!]), TEXT_MIN])
  const low = pairs.filter(([, r, min]) => r < min)
  check(`${t.name}: every pair reads on every stop of its wallpaper`, low.length === 0, low.map(([n, r]) => `${n} ${r.toFixed(2)}`).join(", "))
  check(`${t.name}: the page draws its colours as written (nothing has to be corrected)`, readableTheme(c) === c)
  check(`${t.name}: a structure no other theme has`, all.filter((a) => a.id !== t.id && sig(a.theme_config) === sig(c)).length === 0, sig(c))
  check(`${t.name}: a name in every language, and a place in the picker`, themeLabel(t) === t.name && langs.every((l) => !!catalogs[l][`theme::${t.name}`]) && placed.includes(t.id) && ["clean", "dark", "colour"].includes(themeGroupOf(t.id)))
  /* From a page on Default, which a new page is. */
  const from = { theme: { ...(all.find((a) => a.id === "default")!.theme_config), template_id: "default" }, settings: {}, draft_blocks: [] }
  const look = (lookFromTemplate(from as never, t as never, undefined, all.find((a) => a.id === "default") as never) as unknown as { theme: T }).theme
  check(`${t.name}: picking it lays on its wallpaper, button and name's face`, look.template_id === t.id && look.background_type === c.background_type && look.background_color === c.background_color && (look.background_gradient || "") === (c.background_gradient || "") && look.button_style === c.button_style && look.button_border_radius === c.button_border_radius && look.title_font === c.title_font, JSON.stringify({ id: look.template_id, type: look.background_type, style: look.button_style }))
}

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log("\nall passed")
