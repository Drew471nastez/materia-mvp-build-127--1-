/**
 * ===========================================================================
 *  DESIGN TOKENS: ONE RESOLVER, GLOBAL SCHEMES, LOCAL OVERRIDES
 * ===========================================================================
 * A theme has named colour schemes and text styles; a section picks a scheme
 * and a style and may override a few colours of its own. The rules this
 * suite holds the code to:
 *
 *   • the React renderers and the .storelib renderer resolve a section's
 *     colours through the same function, so the editor canvas and the
 *     published page cannot disagree;
 *   • a scheme saved in the old eighty-slot shape still reads;
 *   • changing a global scheme reaches every section on it, and a section's
 *     own overrides survive that change;
 *   • deleting a scheme moves its sections somewhere sensible, on pages
 *     that were open and pages that were not;
 *   • the text styles compile to custom properties, narrow widths included,
 *     and every rule stays under the page root.
 *
 * Run with:  npm run test:push
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import {
  DEFAULT_COLOR_SCHEMES,
  SCHEME_COLOR_KEYS,
  SECTION_OVERRIDE_KEYS,
  legacySchemeValues,
  normalizeScheme,
  remapScheme,
  resolveSectionColors,
  themeColorSchemes,
} from "@/lib/storelib-theme/color-schemes"
import { sectionTypography, themeTypography, typographyStylesheet } from "@/lib/storelib-theme/typography"
import { themeStylesheet, themeVars, THEME_ROOT_ATTRIBUTE } from "@/lib/website-builder/theme-css"
import { designSupport } from "@/lib/website-builder/design-support"
import { effectiveOverride, resetOverrides, setOverride } from "@/lib/website-builder/section-overrides"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { STORELIB_SCHEMAS } from "@/lib/website-builder/storelib-schemas"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { sectionColors } from "@/components/website-builder/sections/_shared"
import { DEFAULT_COLOR_SCHEMES as LEGACY_DEFAULTS, type SectionInstance, type ThemeSettingsValues } from "@/lib/website-builder/types"

const root = process.cwd()
let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
function section(title: string) {
  console.log(`\n${title}`)
}
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1")
}
const read = (f: string) => readFileSync(join(root, f), "utf8")

// ===========================================================================
section("Both renderer families resolve colours through one function")
// ===========================================================================

{
  const shared = stripComments(read("components/website-builder/sections/_shared.tsx"))
  const render = stripComments(read("lib/storelib-theme/render.ts"))
  const resolve = stripComments(read("lib/storelib-theme/resolve.ts"))
  check("the React helpers call the engine's resolver", /resolveSectionColors\(/.test(shared))
  check("and so does the .storelib renderer", /resolveSectionColors\(/.test(render))
  const sharedColours = shared.slice(shared.indexOf("Color-scheme resolution"), shared.indexOf("Value coercion helpers"))
  const typesColours = read("lib/website-builder/types.ts")
  check(
    "and neither side keeps a default palette of its own",
    !/#[0-9a-f]{6}/i.test(sharedColours) && !/DEFAULT_SCHEMES\s*[:=]/.test(resolve) && !/#[0-9a-f]{6}/i.test(typesColours.slice(typesColours.indexOf("export const DEFAULT_COLOR_SCHEMES"), typesColours.indexOf("export interface ThemeSettingsValues"))),
  )

  const theme = {
    color_schemes: { dark: { background: "#101010", heading: "#fafafa" } },
  } as ThemeSettingsValues
  const sec: SectionInstance = {
    id: "hero-1",
    type: "hero",
    name: "Hero",
    settings: { color_scheme: "dark", color_overrides: { heading: "#ff0000" }, heading: "Hello" },
  }
  const react = sectionColors(sec, theme)
  const out = renderStorelibSection(sec, theme, { template: "index" })
  const html = out.ok ? out.html : ""
  check("the React side sees the theme's scheme with the section's override on top", react.bg === "#101010" && react.heading === "#ff0000", `${react.bg} ${react.heading}`)
  check(
    "the .storelib side draws the same values",
    html.includes("--scheme-background:#101010") && html.includes("--scheme-heading:#ff0000") && html.includes('data-color-scheme="dark"'),
    html.slice(0, 300),
  )
  check("and a template's legacy names still read", html.includes("--hero-text: #ff0000"), html.slice(0, 400))
}

// ===========================================================================
section("A scheme is twenty-one values, and the old eighty still read")
// ===========================================================================

{
  check("twenty-one semantic values", SCHEME_COLOR_KEYS.length === 21)
  const legacy = normalizeScheme({ bg: "#123456", paragraph: "#222222", text: "#333333", primary_btn_bg: "#ABCDEF" }, DEFAULT_COLOR_SCHEMES.white)
  check(
    "a scheme saved in the old shape fills the semantic values",
    legacy.background === "#123456" && legacy.text === "#333333" && legacy.primary_button_background === "#abcdef",
    JSON.stringify(legacy),
  )
  check("and an old scheme with only a paragraph colour keeps it as its text", normalizeScheme({ paragraph: "#222222" }, DEFAULT_COLOR_SCHEMES.white).text === "#222222")
  const semantic = normalizeScheme({ background: "#000000", bg: "#ffffff" }, DEFAULT_COLOR_SCHEMES.white)
  check("and the semantic key wins when both are present", semantic.background === "#000000")

  const types = read("lib/website-builder/types.ts")
  const iface = types.slice(types.indexOf("export interface ColorSchemeValues"), types.indexOf("export type ColorSchemeKey"))
  const slots = Array.from(iface.matchAll(/^\s+([a-z_]+)\??: string/gm)).map((m) => m[1]).filter((k) => k !== "gradient" && k !== "name")
  const produced = legacySchemeValues(DEFAULT_COLOR_SCHEMES.white)
  const missing = slots.filter((k) => typeof produced[k] !== "string" || !produced[k])
  check(`every one of the ${slots.length} legacy slots a renderer might read is produced`, slots.length >= 70 && missing.length === 0, missing.join(", "))
  check(
    "and the legacy defaults the tests and renderers import are the engine's",
    LEGACY_DEFAULTS.white.bg === DEFAULT_COLOR_SCHEMES.white.background && LEGACY_DEFAULTS.dark.heading === DEFAULT_COLOR_SCHEMES.dark.heading,
  )
}

// ===========================================================================
section("Global changes reach every section; local overrides survive them")
// ===========================================================================

{
  const settings = { color_scheme: "white", color_overrides: { heading: "#ff0000" } }
  const before = resolveSectionColors({}, settings)
  const after = resolveSectionColors({ color_schemes: { white: { background: "#000000" } } }, settings)
  check("a global scheme change reaches a section on it", before.scheme.background === "#ffffff" && after.scheme.background === "#000000")
  check("and the section's own override is still there afterwards", after.scheme.heading === "#ff0000" && after.overrides.heading === "#ff0000")
  check("overrides are stored apart from the scheme", after.base.heading === DEFAULT_COLOR_SCHEMES.white.heading)
  check("only the slots a section may override are read", SECTION_OVERRIDE_KEYS.length === 13 && !resolveSectionColors({}, { color_overrides: { input_border: "#ff0000" } }).overrides.input_border)

  const grad = resolveSectionColors({ color_schemes: { dark: { gradient: "linear-gradient(135deg, #000 0%, #333 100%)" } } }, { color_scheme: "dark" })
  check("a gradient is published as --scheme-gradient and as the legacy bg", grad.vars["--scheme-gradient"].startsWith("linear-gradient") && grad.legacy.bg.startsWith("linear-gradient"))
  check("and a section that overrides its background drops the scheme's gradient", resolveSectionColors({ color_schemes: { dark: { gradient: "linear-gradient(#000, #333)" } } }, { color_scheme: "dark", color_overrides: { background: "#111111" } }).scheme.gradient === "")
}

// ===========================================================================
section("Deleting or renaming a scheme cannot strand a section")
// ===========================================================================

{
  const theme = { color_schemes: { custom_a: { name: "Mint", background: "#e0fff4" } } }
  check("a scheme the creator added is listed after the built-ins, by name", Object.keys(themeColorSchemes(theme)).slice(-1)[0] === "custom_a" && themeColorSchemes(theme).custom_a.name === "Mint")
  check("renaming changes the name and never the key", themeColorSchemes({ color_schemes: { white: { name: "Paper" } } }).white.name === "Paper")

  const sections = [{ id: "a", settings: { color_scheme: "custom_a" } }, { id: "b", settings: { color_scheme: "dark" } }]
  const moved = remapScheme(sections, "custom_a", "light")
  check("sections on the open page move to the replacement", moved[0].settings.color_scheme === "light" && moved[1].settings.color_scheme === "dark")
  check(
    "a page that was not open follows the remap the deletion recorded",
    resolveSectionColors({ color_scheme_remaps: { custom_a: "dark" } }, { color_scheme: "custom_a" }).key === "dark",
  )
  check("a scheme nobody remapped falls back to the theme's default", resolveSectionColors({ default_color_scheme: "light" }, { color_scheme: "gone" }).key === "light")
  check("and a remap loop ends at the default rather than never", resolveSectionColors({ color_scheme_remaps: { a: "b", b: "a" } }, { color_scheme: "a" }).key === "white")
}

// ===========================================================================
section("The section panel's overrides and the fields that came before them")
// ===========================================================================

{
  const preset = { bg_color: "#0f172a", text_color: "#ffffff", heading: "Hi" }
  check("a preset's baked colour shows as the override it is", effectiveOverride(preset, "background") === "#0f172a")
  const next = setOverride(preset, "background", "#ff00ff")
  check("writing a slot sets the override and blanks the old field", (next.color_overrides as Record<string, string>).background === "#ff00ff" && next.bg_color === "")
  const cleared = setOverride(next, "background", "")
  check("clearing a slot leaves the scheme in charge", cleared.color_overrides === undefined && effectiveOverride(cleared, "background") === "")
  const reset = resetOverrides(preset)
  check("reset to scheme clears every slot", SECTION_OVERRIDE_KEYS.every((k) => effectiveOverride(reset, k) === "") && reset.heading === "Hi")
}

// ===========================================================================
section("A schema says what the panel may change")
// ===========================================================================

{
  const withScheme = { fields: [{ id: "color_scheme", type: "color_scheme" }] }
  const s1 = designSupport(withScheme)
  check("a section with a colour scheme gets the picker, the overrides and the text styles", s1.colorScheme && s1.colorOverrides.length === 13 && s1.typography)
  const s2 = designSupport({ ...withScheme, supports_color_overrides: ["background"] })
  check("a section may allow only some overrides", s2.colorOverrides.length === 1 && s2.colorOverrides[0] === "background")
  const s3 = designSupport({ ...withScheme, supportsColorOverrides: false, supportsTypographyOverrides: false })
  check("and switch either off, in either spelling", s3.colorOverrides.length === 0 && !s3.typography)
  check("a section with no scheme setting gets neither picker nor overrides", !designSupport({ fields: [] }).colorScheme && designSupport({ fields: [] }).colorOverrides.length === 0)
  const hero = STORELIB_SCHEMAS.hero as unknown as Record<string, unknown>
  check("the hero keeps its own heading size control instead of a heading style", hero.supports_typography_overrides === false && !designSupport(STORELIB_SCHEMAS.hero).typography)
}

// ===========================================================================
section("Typography compiles to tokens at three widths")
// ===========================================================================

{
  const vars = themeVars({} as ThemeSettingsValues)
  check("the nine styles compile to custom properties", vars["--type-h1-size"] === "56px" && vars["--type-body-size"] === "16px" && vars["--type-caption-weight"] === "500")
  check("the three fonts too, the accent falling back to the heading font", themeVars({ font_heading: "Lora" } as ThemeSettingsValues)["--theme-font-accent"] === "Lora")
  const seeded = themeTypography({ heading_weight: "800", font_size_base: 18 })
  check("the older flat controls still seed the styles", seeded.styles.h1.weight === "800" && seeded.styles.h3.weight === "800" && seeded.styles.body.size.desktop === 18)
  const own = themeVars({ typography_styles: { h1: { size: { desktop: 72, mobile: 40 }, transform: "uppercase" } } } as ThemeSettingsValues)
  check("a style the theme set wins", own["--type-h1-size"] === "72px" && own["--type-h1-transform"] === "uppercase")

  const css = themeStylesheet({ typography_styles: { h1: { size: { desktop: 72, tablet: 60, mobile: 40 } } } } as ThemeSettingsValues)
  check("tablet and phone sizes take over inside a container query", /@container \(max-width:1023px\)\{[^}]*--type-h1-size:60px/.test(css) && /@container \(max-width:767px\)\{[^}]*--type-h1-size:40px/.test(css))
  const unscoped = css
    .split("\n")
    .filter((line) => line.trim() && !line.trim().startsWith("@"))
    .map((line) => line.split("{")[0].trim())
    // `:where(…)` strips a rule's specificity and puts the root inside the
    // brackets. Unwrapped, because what this asks is whether a rule can
    // escape the page root, and `:where([data-storelib-theme] a)` cannot.
    .map((sel) => (sel.startsWith(":where(") && sel.endsWith(")") ? sel.slice(7, -1) : sel))
    .filter((sel) => !sel.split(",").every((part) => part.trim().startsWith(`[${THEME_ROOT_ATTRIBUTE}]`)))
  check("every typography rule is under the page root", unscoped.length === 0, unscoped.join(" | "))
  check("the header's and footer's headings are left alone", /\[data-section\]:not\(\[data-chrome\]\) h1\)/.test(css))

  /*
    ── A LINK IS NOT A BUTTON ──────────────────────────────────────────────
    Five rules styled buttons — the radius, the weight, the shadow, the hover
    motion and the typography — and every one of them was written
    `[data-section] a[href]`. So the nav, the footer's links, a product card
    whose title is a link and the site's own wordmark were all buttons. With
    the shipped defaults that is invisible, which is why it lasted; set
    Buttons to uppercase and the nav goes uppercase, and choose the Outline
    style and every link on the site gets a border drawn round it.

    Measured in scripts/check-link-vs-button.mjs against a loud button style.
    Its break test, with the old selector put back:

      link-in-a-nav   uppercase, 2px, radius 22px, 1px solid
      wordmark        uppercase, 2px, radius 22px, 1px solid
  */
  const typo = readFileSync(join(process.cwd(), "lib/storelib-theme/typography.ts"), "utf8")
  const themeCss = readFileSync(join(process.cwd(), "lib/website-builder/theme-css.ts"), "utf8")
  check("there is one definition of what a button is",
    /const BUTTON_PARTS = \["button", '\[role="button"\]', "\.s__btn", "\[data-button\]"\]/.test(typo)
      && /export function buttonSelector\(/.test(typo))
  check("the typography rule uses it",
    /\$\{buttonSelector\(root, \(sel\) => `:where\(\$\{sel\}\)`\)\}\{font-family:var\(--type-button-font\)/.test(typo))
  check("and so do the radius, the hover and the outline",
    /const buttons = buttonSelector\(root\)/.test(themeCss)
      && /const buttonsHover = buttonSelector\(root, \(sel\) => `\$\{sel\}:hover`\)/.test(themeCss)
      && /const unpainted = buttonSelector\(root, \(sel\) => `\$\{sel\}:not\(\[style\*="background"\]\)`\)/.test(themeCss))
  check("no button rule reaches every link any more",
    !/\[data-section\] a\[href\],\$\{root\} \[data-section\] button/.test(themeCss)
      && !/\[data-section\] a\[href\]:not\(\[style\*="background"\]\)/.test(themeCss)
      && !/\[data-section\] a\[href\]:hover/.test(themeCss))
  check("measured against a loud button style rather than the defaults",
    existsSync("scripts/check-link-vs-button.mjs") && existsSync("scripts/render-link-vs-button.tsx"))
  check("h3 and h4 keep the size a section gave them", !/h3\)\{[^}]*font-size/.test(css) && /h3\)\{[^}]*font-weight/.test(css))

  const t = sectionTypography({ heading_style: "h3", body_style: "body_large" })
  check("a section picks a heading style and a body style", t.heading === "h3" && t.body === "body_large" && Object.keys(t.vars).length === 0)
  const c = sectionTypography({ heading_style: "custom", custom_heading: { size: 48, weight: "900", family: "Georgia" } })
  check("and only Custom carries its own values", c.vars["--custom-heading-size"] === "48px" && c.vars["--custom-heading-weight"] === "900" && c.vars["--custom-heading-font"].startsWith("Georgia"))
  check("a style the theme does not have is ignored", sectionTypography({ heading_style: "h9" }).heading === undefined)
  check("the stylesheet maps the choice onto the section's variables", typographyStylesheet("[x]", themeTypography({})).includes('[x] [data-heading-style="h3"] [data-section]{--section-heading-font:var(--type-h3-font)'))

  const dir = join(root, "themes/default/sections")
  const storelib = readdirSync(dir).filter((f: string) => f.endsWith(".storelib"))
  /* A section of theme blocks has no heading of its own: its headings are Heading blocks, and the block reads the style. */
  const ofBlocks = (src: string) => /"blocks":\s*\[\s*\{\s*"type":\s*"(@theme|heading|image)"\s*\}/.test(src)
  const notReading = storelib.filter((f: string) => {
    const src = readFileSync(join(dir, f), "utf8")
    return !/--section-heading-size/.test(src) && !ofBlocks(src)
  })
  check("a section of theme blocks takes the heading style through the Heading block", /--section-heading-size/.test(readFileSync(join(root, "themes/default/blocks/heading.storelib"), "utf8")))
  check(
    "every one of the theme's own sections reads the section heading style",
    // The hero is the exception and says so in its schema: it has a heading
    // size slider of its own, so it declares supports_typography_overrides
    // false rather than offering two controls for one size.
    notReading.length === 1 && notReading[0] === "hero.storelib",
    notReading.join(", "),
  )
}

// ===========================================================================
section("Every section has a colour scheme, and it is the one that paints it")
// ===========================================================================

{
  const dir = join(root, "themes/default/sections")
  const files = readdirSync(dir)
  const types: { type: string; hasScheme: boolean }[] = []
  for (const f of files) {
    if (f.endsWith(".json")) {
      const d = JSON.parse(readFileSync(join(dir, f), "utf8")) as { fields?: { id: string }[] }
      types.push({ type: f.slice(0, -5), hasScheme: (d.fields ?? []).some((x) => x.id === "color_scheme") })
    } else if (f.endsWith(".storelib")) {
      const src = readFileSync(join(dir, f), "utf8")
      types.push({ type: f.slice(0, -9), hasScheme: src.slice(src.indexOf("<schema>")).includes('"color_scheme"') })
    }
  }
  const without = types.filter((t) => !t.hasScheme).map((t) => t.type)
  check(
    `every one of the ${types.length} sections offers a colour scheme`,
    /**
     * Twenty-two did not. They had their own bg_color and text_color with a
     * literal default, so the scheme picker was absent and the colours were
     * whatever the section was born with. A theme whose schemes reach
     * fifty-eight sections out of eighty is not a theme.
     */
    without.length === 0,
    without.join(", "),
  )

  const renderers = join(root, "components/website-builder/sections/renderers")
  const rendererFiles = readdirSync(renderers).filter((f) => f.endsWith(".tsx"))
  const blind = rendererFiles.filter((f) => {
    const src = stripComments(readFileSync(join(renderers, f), "utf8"))
    if (!/\bs\.(bg_color|text_color)\b/.test(src)) return false
    return !/sectionColors\(|resolveScheme\(/.test(src)
  })
  check("and no renderer reads a background or text colour without a scheme behind it", blind.length === 0, blind.join(", "))

  /**
   * Text drawn ON TOP of an image or a video is the one exemption. Its
   * legibility comes from the scrim under it, not from the scheme, and a
   * dark scheme's dark heading over a photograph is unreadable. Four
   * sections put text over media, and they say so here rather than being
   * quietly skipped.
   */
  const OVER_MEDIA = new Set(["CollectionBannerSection.tsx", "LookbookSection.tsx", "VideoHeroSection.tsx", "ImageBannerSection.tsx"])
  const literal = rendererFiles.filter((f) => {
    const src = stripComments(readFileSync(join(renderers, f), "utf8"))
    const fields = OVER_MEDIA.has(f) ? "bg_color|border_color|accent_color|button_color" : "bg_color|text_color|border_color|accent_color|button_color"
    return new RegExp(`str\\(s\\.(${fields})\\s*,\\s*"#`).test(src)
  })
  check("and none falls back to a hard-coded hex instead of the scheme", literal.length === 0, literal.join(", "))

  /**
   * A preset that bakes a colour makes the scheme picker do nothing on a
   * section somebody just added, which is the moment they are most likely to
   * try it. Colours a scheme does not own (an overlay scrim, a rating star,
   * a tick and a cross) are allowed to stay literal.
   */
  const SCHEME_FREE = new Set(["overlay_color", "star_color", "check_color", "cross_color", "highlight_color", "gradient_from", "gradient_to", "bg_overlay_color"])
  const baked: string[] = []
  const onScheme: string[] = []
  for (const f of files.filter((x) => x.endsWith(".json"))) {
    const d = JSON.parse(readFileSync(join(dir, f), "utf8")) as { presets?: { name: string; settings?: Record<string, unknown> }[] }
    for (const p of d.presets ?? []) {
      const settings = p.settings ?? {}
      // The same exemption as above: a preset that puts its own image, video
      // or gradient behind the words may name the colour of the words.
      const overMedia = ["image_url", "video_url", "image", "bg_image", "poster", "video_poster"].some((k) => settings[k]) ||
        settings.bg_type === "gradient" || settings.background === "gradient" || settings.overlay_color !== undefined
      for (const [k, v] of Object.entries(settings)) {
        if (typeof v !== "string" || !v.startsWith("#") || !k.includes("color") || SCHEME_FREE.has(k)) continue
        if (overMedia && (k === "text_color" || k === "heading_color")) continue
        baked.push(`${f.slice(0, -5)}.${p.name}.${k}`)
      }
      if (typeof settings.color_scheme === "string") onScheme.push(f)
    }
  }
  check("and a preset that wants a darker look says which scheme, rather than a hex", onScheme.length >= 30, `${onScheme.length} presets name a scheme`)
  check("a section somebody just added is on its scheme, not on a baked colour", baked.length === 0, baked.slice(0, 8).join(", "))
}

// ===========================================================================
section("The panel is simple, and the settings match the model")
// ===========================================================================

{
  const page = stripComments(read("app/website-builder/editor/[installId]/page.tsx"))
  check("the eighty-picker scheme editor is gone from the editor", !/COLOR_SCHEME_GROUPS|ColorSchemesEditor|SchemePillList/.test(page))
  check("the section panel, the Colors panel and the Typography panel are the design panels", /<SectionDesignPanel/.test(page) && /<ColorsPanel/.test(page) && /<TypographyPanel/.test(page))
  const colors = THEME_SETTINGS_GROUPS.find((g) => g.id === "color_schemes")
  const typography = THEME_SETTINGS_GROUPS.find((g) => g.id === "typography")
  check("Theme settings has Colors and Typography", colors?.label === "Colors" && typography?.label === "Typography")
  check("Typography's fields are the three fonts; the styles are the panel's", (typography?.fields ?? []).map((f) => f.id).join(",") === "font_heading,font_body,font_accent")
  const panels = read("components/website-builder/editor/design-panels.tsx")
  check("Customize is a disclosure, not fifteen pickers", /Advanced colors/.test(panels) && /Reset all to scheme/.test(panels))
  check("grouped as a list, General then each button, with no per-row scheme column", />General</.test(panels) && /BUTTON_COLOR_GROUPS\.filter/.test(panels) && !/Use scheme|Reset to scheme|A global scheme change/.test(panels))
  check("no em dashes in the panels' copy", !/—/.test(panels))
  const doc = read("docs/theme/16-design-tokens.md")
  check("the tokens are documented for theme developers", /--scheme-background/.test(doc) && /heading_style/.test(doc) && /supports_color_overrides/.test(doc))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
