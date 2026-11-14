/**
 * Round W10: the wallpaper's patterns (fewer odd ones, five loved ones, a
 * colour that follows the wallpaper, drawn over a skin's scene) and how the
 * name is written (lib/onepage/name-style), with the fonts for it.
 *
 *   node scripts/run-push-tests.mjs tests/onepage-patterns-w10.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  LEGACY_PATTERNS,
  WALLPAPER_PATTERNS,
  autoPatternInk,
  canonicalPatternId,
  isAutoInk,
  isPatternId,
  patternOpacityValue,
  patternStyle,
  resolvedPatternInk,
  wallpaperIsDark,
} from "@/lib/onepage/wallpaper"
import { NAME_STYLES, NAME_STYLE_IDS, contrastOf, nameColours, nameStyleCss, nameStyleOf, nameStyleReset } from "@/lib/onepage/name-style"
import { ONEPAGE_FONTS, fontStack, onePageFontHref, onePageFontHrefs } from "@/lib/onepage/fonts"
import { AP_THEMES, R40_THEMES, R42_THEMES, W8_THEMES, W9_THEMES } from "@/components/onepage/themes/r40-themes"
import { LOOK_RESET } from "@/lib/onepage/theme-apply"
import { readCatalog } from "../scripts/i18n/catalog-file.mjs"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` (${detail})` : "")); console.log(`  FAIL  ${label}${detail ? ` (${detail})` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const ids = WALLPAPER_PATTERNS.map((p) => p.id)
/* The themes the Design tab offers: the base ones read from its source (importing it pulls the whole tab in), the rest from r40-themes. */
const designSrc = read("components/onepage/tabs/design-tab.tsx")
const savedPatterns = [...designSrc.matchAll(/background_pattern: "([a-z_]+)"/g), ...read("components/onepage/themes/r40-themes.ts").matchAll(/background_pattern: "([a-z_]+)"/g)].map((m) => m[1])
const LISTED = [...R40_THEMES, ...R42_THEMES, ...AP_THEMES, ...W8_THEMES, ...W9_THEMES] as unknown as { name: string; theme_config: Record<string, unknown> }[]
const svgOf = (s: { backgroundImage: string } | null) => (s ? decodeURIComponent(s.backgroundImage) : "")

console.log("\nThe odd ones are gone, five loved ones are in")
{
  for (const gone of ["zigzag", "morph", "organic", "flowmaze", "crosshatch"]) check(`${gone} is not offered`, !ids.includes(gone))
  for (const added of ["gingham", "scales", "honeycomb", "plus", "sparkles"]) check(`${added} is offered`, ids.includes(added))
  check("the rest stay", ["none", "grain", "paper", "linen", "dots", "grid", "lines", "diagonal", "checker", "waves", "topographic", "stars", "terrazzo", "blueprint", "halftone"].every((id) => ids.includes(id)))
  check("no id twice", new Set(ids).size === ids.length)
  check("Contours is a contour map now, not ellipses", !svgOf(patternStyle("topographic", "#000000", "medium")).includes("<ellipse") && svgOf(patternStyle("topographic", "#000000", "medium")).includes("Z"))
}

console.log("\nA page that saved a removed one keeps a pattern like it")
{
  check("zigzag draws waves", canonicalPatternId("zigzag") === "waves" && patternStyle("zigzag", "#000000")?.backgroundImage === patternStyle("waves", "#000000")?.backgroundImage)
  check("morph and flow draw contours", canonicalPatternId("morph") === "topographic" && canonicalPatternId("flowmaze") === "topographic")
  check("organic draws terrazzo", canonicalPatternId("organic") === "terrazzo")
  check("crosshatch draws diagonal", canonicalPatternId("crosshatch") === "diagonal")
  check("sixteen patterns and three textures: four even rows and one", ids.filter((id) => WALLPAPER_PATTERNS.find((p) => p.id === id)?.kind === "pattern").length === 16 && WALLPAPER_PATTERNS.filter((p) => p.kind === "texture").length === 3)
  check("every stand-in is offered", Object.values(LEGACY_PATTERNS).every((id) => ids.includes(id)))
  check("every removed one still counts as a pattern", Object.keys(LEGACY_PATTERNS).every(isPatternId))
  check("none, nothing and unknown names draw nothing", canonicalPatternId("none") === null && canonicalPatternId(undefined) === null && canonicalPatternId("plaid") === null && patternStyle("plaid", "#000") === null)
  check("no theme names a removed pattern", savedPatterns.length > 20 && savedPatterns.every((p) => !(p in LEGACY_PATTERNS)))
  check("Cream is gingham now", /id: "cream",[\s\S]*?background_pattern: "gingham"/.test(designSrc.slice(designSrc.indexOf('id: "cream"'), designSrc.indexOf('id: "riso"'))))
  check("every theme's pattern is offered", savedPatterns.every((p) => ids.includes(p)))
}

console.log("\nEvery pattern draws, on every strength, as a small fixed tile")
{
  for (const p of WALLPAPER_PATTERNS) {
    if (p.id === "none") continue
    const ok = (["low", "medium", "hard", "very_hard"] as const).every((lv) => {
      const s = patternStyle(p.id, "#00000090", lv, { background_type: "solid", background_color: "#ffffff" })
      return !!s && s.backgroundImage.startsWith('url("data:image/svg+xml,') && /^\d+(\.\d+)?px \d+(\.\d+)?px/.test(s.backgroundSize) && s.opacity > 0
    })
    const big = Number(/^(\d+)/.exec(patternStyle(p.id, "#000", "medium")!.backgroundSize)?.[1])
    check(`${p.name}: draws at every strength, a tile of ${big}px`, ok && big >= 6 && big <= 300)
  }
  check("the old \"high\" strength is Strong, not Medium", patternOpacityValue("high") === 1)
  check("new tiles carry no ids (nothing to collide on a page that draws two layouts)", ["gingham", "scales", "honeycomb", "plus", "sparkles", "topographic"].every((id) => !/ id=/.test(svgOf(patternStyle(id, "#000")))))
  const evil = patternStyle("gingham", "red'/><script>", "medium", { background_type: "solid", background_color: "#000" })
  check("only a hex colour is written into the image", !svgOf(evil).includes("script"))
}

console.log("\nThe colour follows the wallpaper")
{
  check("a dark flat colour is dark", wallpaperIsDark({ background_type: "solid", background_color: "#14161c" }))
  check("a light flat colour is light", !wallpaperIsDark({ background_type: "solid", background_color: "#f4efe9" }))
  check("a dark gradient is dark", wallpaperIsDark({ background_type: "gradient", background_gradient: "linear-gradient(165deg, #04110f 0%, #1d7a63 100%)" }))
  check("a light gradient is light", !wallpaperIsDark({ background_type: "gradient", background_gradient: "linear-gradient(160deg, #f7c59f 0%, #c4553b 100%)" }))
  check("rgb() stops are read too", wallpaperIsDark({ background_type: "gradient", background_gradient: "linear-gradient(180deg, rgb(10, 10, 20) 0%, rgb(30, 20, 60) 100%)" }))
  check("nothing saved is automatic, and so are the two the picker used to write", isAutoInk(null) && isAutoInk(undefined) && isAutoInk("") && isAutoInk("#00000090") && isAutoInk("#FFFFFF90"))
  check("any other colour is the creator's", !isAutoInk("#e2dc9c90") && !isAutoInk("#000000") && !isAutoInk("#0000008f"))
  check("automatic is white on dark, black on light", autoPatternInk({ background_type: "solid", background_color: "#000" }).startsWith("#ffffff") && autoPatternInk({ background_type: "solid", background_color: "#fff" }).startsWith("#000000"))
  const dark = { background_type: "solid", background_color: "#101014" }
  check("black saved on a page made dark later draws white", resolvedPatternInk("#00000090", dark).startsWith("#ffffff") && svgOf(patternStyle("dots", "#00000090", "medium", dark)).includes("#ffffff"))
  check("no colour on a dark page draws white (it was black, unseen)", svgOf(patternStyle("grid", null, "medium", dark)).includes("#ffffff"))
  check("a creator's own colour is kept on any wallpaper", svgOf(patternStyle("dots", "#e2dc9c90", "medium", dark)).includes("#e2dc9c"))
  check("an old caller with no wallpaper draws the colour as saved", svgOf(patternStyle("dots", "#ffffff90", "medium")).includes("#ffffff"))
  for (const t of LISTED) {
    const c = t.theme_config as Record<string, unknown>
    if (!isPatternId(c.background_pattern) || (c.background_type !== "solid" && c.background_type !== "gradient")) continue
    const ink = resolvedPatternInk(c.pattern_color, c as never)
    const auto = isAutoInk(c.pattern_color)
    check(`${t.name}: its ${c.background_pattern} shows (${auto ? "automatic" : "its own colour"})`, !auto || ink.startsWith(wallpaperIsDark(c as never) ? "#ffffff" : "#000000"))
  }
}

console.log("\nDrawn over a skin's scene, everywhere the page draws it")
{
  const live = read("components/onepage/public-onepage.tsx")
  const scene = [...live.matchAll(/<ThemeSkinScene[^\n]*\n\s*(?:\{\/\*[^\n]*\*\/\}\n\s*)?<WallpaperPattern/g)].length
  check("the page draws the pattern after the scene in all three places", scene === 3, String(scene))
  check("no pattern is drawn before a scene any more", !/<WallpaperPattern[^\n]*\n\s*<ThemeSkinScene/.test(live))
  check("the theme cards do the same", /<ThemeSkinScene theme=\{c\} \/>\n\s*<WallpaperPattern theme=\{c\}/.test(read("components/onepage/themes/theme-swatch.tsx")))
  const layers = read("components/onepage/wallpaper-layers.tsx")
  check("the page's pattern reads its own wallpaper for the colour", /patternStyle\(theme\.background_pattern, theme\.pattern_color, theme\.pattern_opacity \?\? "medium", theme\)/.test(layers))
  const design = designSrc
  check("the picker no longer writes a colour with the pick", /const pickPattern = \(id: string\) => updateTheme\(\{ background_pattern: id \} as any\)/.test(design))
  check("its squares are drawn on the page's wallpaper with the same colour", /ground=\{ground\} level=/.test(design) && /resolvedPatternInk\(\(theme as any\)\.pattern_color, ground\)/.test(design))
  check("the colour can go back to automatic", /emptyLabel=\{tt\("Automatic"\)\}/.test(design) && /onClear=\{\(\) => updateTheme\(\{ pattern_color: null \} as any\)\}/.test(design))
  check("a removed pattern shows its stand-in picked", /\(canonicalPatternId\(currentPattern\) \?\? "none"\) === pattern\.id/.test(design))
  check("a theme still clears the pattern and its colour", LOOK_RESET.background_pattern === "none" && LOOK_RESET.pattern_color === null)
}

console.log("\nHow the name is written")
{
  check("ten styles, each offered once", NAME_STYLES.length === 10 && new Set(NAME_STYLES.map((n) => n.id)).size === 10 && NAME_STYLES.every((n) => (NAME_STYLE_IDS as readonly string[]).includes(n.id)))
  check("nothing saved, or a name nobody knows, is the theme's own", nameStyleOf({}) === null && nameStyleOf({ name_style: "wobbly" }) === null && nameStyleOf({ name_style: "outline" }) === "outline")
  check("a theme does not take the creator's style away", !("name_style" in LOOK_RESET))
  const light = { title_color: "#111111", text_color: "#111111", button_color: "#111111" }
  const darkT = { title_color: "#ffffff", text_color: "#ffffff", button_color: "#2a2a2e" }
  const brand = { title_color: "#1a1a2e", button_color: "#e8687a" }
  check("a light name is read as a dark page", nameColours(darkT).dark && !nameColours(light).dark)
  check("an accent the page would hide is moved toward the ink", contrastOf(nameColours({ title_color: "#111111", button_color: "#fafafa" }).accent, "#ffffff") >= 3)
  check("a grey accent is not used for colour", !nameColours(darkT).accentDistinct && nameColours(brand).accentDistinct)
  for (const theme of [light, darkT, brand, { title_color: "#22d3ee", button_color: "#ff4fd8" }, {}]) {
    for (const id of NAME_STYLE_IDS) {
      const css = nameStyleCss(id, theme)
      const txt = JSON.stringify(css)
      const ok = Object.keys(css).length > 0 && !/undefined|NaN/.test(txt)
      if (!ok) check(`${id} on ${JSON.stringify(theme)}`, false, txt)
    }
  }
  check("every style makes a style for every kind of theme", true)
  check("outline keeps the letters (a stroke in the ink)", String(nameStyleCss("outline", light).WebkitTextStroke).includes("#111111"))
  check("gradient and chrome fill the letters through the text", ["gradient", "chrome"].every((id) => nameStyleCss(id as never, light).backgroundClip === "text" && nameStyleCss(id as never, light).WebkitTextFillColor === "transparent"))
  check("chrome is light on a dark page and dark on a light one", String(nameStyleCss("chrome", darkT).backgroundImage).includes("#ffffff 0%") && String(nameStyleCss("chrome", light).backgroundImage).includes("#5d6675"))
  check("gradient uses the theme's colours when they are colours", String(nameStyleCss("gradient", brand).backgroundImage).includes("#e8687a"))
  check("gradient on an all-black theme still has two colours", /#6d28d9.*#db2777/.test(String(nameStyleCss("gradient", light).backgroundImage)))
  const label = nameStyleCss("label", brand)
  check("the label's words read on the label (4.5:1)", contrastOf(String(label.color), String(label.background)) >= 4.5)
  const labelDark = nameStyleCss("label", darkT)
  check("and on a dark page too", contrastOf(String(labelDark.color), String(labelDark.background)) >= 4.5)
  check("sticker's paper is the opposite of the ink", String(nameStyleCss("sticker", light).textShadow).includes("#ffffff") && String(nameStyleCss("sticker", darkT).textShadow).includes("#111111"))
  check("spaced caps stay centred (the last letter's space is taken back)", nameStyleCss("spaced", light).letterSpacing === "0.2em" && nameStyleCss("spaced", light).marginRight === "-0.2em")
  const reset = nameStyleReset(false)
  check("a chosen style clears what a skin draws on the title", ["background", "WebkitMaskImage", "maskImage", "filter", "transform", "rotate", "textShadow"].every((k) => k in reset) && reset.WebkitTextFillColor === "currentcolor")
  check("on the Hero the words keep a shadow that works with a clipped fill", String(nameStyleReset(true).filter).startsWith("drop-shadow"))
  const live = read("components/onepage/public-onepage.tsx")
  check("both headers draw the name through NameWords", (live.match(/<NameWords theme=\{theme\} title=\{profile\.title\} \/>/g) || []).length === 2)
  check("and clear a skin's treatment only when a style is chosen", (live.match(/\.\.\.\(nameStyleOf\(theme as never\) \? nameStyleReset\((true|false)\) : null\)/g) || []).length === 2)
  const design = designSrc
  check("the Header section offers the name's font and style", /function NameStyleRows\(\)/.test(design) && /title_style === "logo" \? null : <NameStyleRows \/>/.test(design) && /label=\{tt\("Name font"\)\}/.test(design))
  check("a square for the theme's own and each style", /\{tile\(null, tt\("Theme"\)\)\}/.test(design) && /NAME_STYLES\.map\(\(n\) => tile\(n\.id, nameStyleLabel\(n\.id\)\)\)/.test(design))
  check("a pick is saved in the theme, as the other header settings are", /updateTheme\(\{ name_style: id \} as never\)/.test(design))
}

console.log("\nCreative display fonts, loaded only when used")
{
  const NEW = ["Syne", "Unbounded", "DM Serif Display", "Instrument Serif", "Shrikhand", "Great Vibes", "Yellowtail", "Rubik Mono One"]
  check("each is on the allow-list", NEW.every((f) => Object.prototype.hasOwnProperty.call(ONEPAGE_FONTS, f)))
  check("each has a Google Fonts stylesheet", NEW.every((f) => (onePageFontHref(f) ?? "").startsWith(`https://fonts.googleapis.com/css2?family=${f.replace(/ /g, "+")}`)))
  check("each is offered as a title font", NEW.every((f) => read("components/onepage/tabs/design-tab.tsx").includes(`{ name: "${f}", value: "'${f}',`)))
  check("a page loads one only when its title uses it", onePageFontHrefs({ font_family: "Inter" }).every((h) => !NEW.some((f) => h.includes(f.replace(/ /g, "+")))) && onePageFontHrefs({ font_family: "Inter", title_font: "'Syne', sans-serif" }).some((h) => h.includes("family=Syne")))
  check("the scripts fall back to cursive and the serifs to a serif", fontStack("Great Vibes").endsWith("cursive") && fontStack("Instrument Serif").includes("serif") && !fontStack("Instrument Serif").includes("sans-serif"))
}

console.log("\nIn six languages")
{
  const words = ["Name font", "Name style", "Retro shadow", "Highlighter", "Chrome", "Neon", "Sticker", "Swash", "Spaced caps", "Automatic: follows the wallpaper", "Outline", "Gradient", "Label", "Automatic", "Theme"]
  for (const lang of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
    const cat = readCatalog(join(process.cwd(), "lib/i18n/catalog", `${lang}.ts`)) as Record<string, string>
    const missing = words.filter((w) => !cat[w])
    check(`${lang}: every new word`, missing.length === 0, missing.join())
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
