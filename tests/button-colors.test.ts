/**
 * ===========================================================================
 *  A BUTTON'S COLOURS REACH THE BUTTON, AND IT HAS A HOVER
 * ===========================================================================
 * The header's call to action could not be recoloured: its panel said the
 * colours were inherited from the theme, the header ignored its own Advanced
 * colors, and setting the button colour there blanked the old field so the
 * button fell back to an unrelated theme colour. No button anywhere had a
 * hover colour. Held here: the scheme's four hover values and how they stay
 * automatic, both renderer families painting them, and the panels saying
 * what each colour is. Measured in a browser by scripts/check-button-colors.mjs.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  DEFAULT_COLOR_SCHEMES,
  HOVER_KEYS,
  SCHEME_CSS_VARS,
  SECTION_OVERRIDE_KEYS,
  automaticHover,
  hoverFill,
  mixColor,
  normalizeScheme,
  resolveSectionColors,
  stripSchemeDefaults,
} from "@/lib/storelib-theme/color-schemes"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nA scheme's hover colours")
{
  check("mixing moves one hex colour towards another", mixColor("#000000", "#ffffff", 0.5) === "#808080" && mixColor("transparent", "#fff", 0.5) === "transparent")
  check("a filled hover is a step darker, or lighter for a button near black", hoverFill("#e11d48") === mixColor("#e11d48", "#000000", 0.12) && hoverFill("#000000") === mixColor("#000000", "#ffffff", 0.14))
  const white = DEFAULT_COLOR_SCHEMES.white
  check("every built-in scheme has all four, worked out from its own buttons", Object.values(DEFAULT_COLOR_SCHEMES).every((sc) => HOVER_KEYS.every((k) => typeof sc[k] === "string" && sc[k] !== "")) && white.primary_button_hover_background === hoverFill(white.primary_button_background))
  check("each is published as a custom property", SCHEME_CSS_VARS.primary_button_hover_background === "--scheme-button-primary-hover" && SCHEME_CSS_VARS.secondary_button_hover_text === "--scheme-button-secondary-hover-text")
  const blue = normalizeScheme({ primary_button_background: "#2563eb", primary_button_text: "#ffffff" }, white)
  check("a saved scheme that recolours its button gets that button's hover, not the base scheme's", blue.primary_button_hover_background === hoverFill("#2563eb"))
  check("and an automatic hover is not stored, so it follows the next change too", !("primary_button_hover_background" in stripSchemeDefaults(blue, white)))
  const chosen = normalizeScheme({ primary_button_background: "#2563eb", primary_button_hover_background: "#111111" }, white)
  check("one somebody chose is kept, and stored", chosen.primary_button_hover_background === "#111111" && stripSchemeDefaults(chosen, white).primary_button_hover_background === "#111111")
  const pink = resolveSectionColors({}, { color_overrides: { primary_button_background: "#e11d48" } })
  check("a section that recolours its button gets a hover worked out from it", pink.scheme.primary_button_hover_background === hoverFill("#e11d48") && pink.vars["--scheme-button-primary-hover"] === hoverFill("#e11d48") && pink.legacy.primary_btn_hover_bg === hoverFill("#e11d48"))
  const own = resolveSectionColors({}, { color_overrides: { primary_button_background: "#e11d48", primary_button_hover_background: "#222222" } })
  check("and a section's own hover wins", own.scheme.primary_button_hover_background === "#222222")
  check("a section may override all four", HOVER_KEYS.every((k) => SECTION_OVERRIDE_KEYS.includes(k)))
  const auto = automaticHover(white)
  check("a secondary button's hover is a tint, and its text stays its own", auto.secondary_button_hover_text === white.secondary_button_text && auto.secondary_button_hover_background !== white.secondary_button_text)
}

console.log("\nSections written in the theme language")
{
  const dir = "themes/default/sections"
  const files = readdirSync(join(process.cwd(), dir)).filter((f) => f.endsWith(".storelib")).map((f) => [f, read(`${dir}/${f}`)] as const)
  const withButtons = files.filter(([, s]) => /\.s__btn--primary \{/.test(s))
  check("no section's button fades to 88% for a hover any more", files.every(([, s]) => !/\.s__btn:hover \{ opacity: 0\.88; \}/.test(s)))
  check(`all ${withButtons.length} with buttons paint hover from the scheme`, withButtons.length >= 29 && withButtons.every(([, s]) => /--s-btn-hover: \{\{ scheme\.primary_btn_hover_bg \}\}/.test(s) && /\.s__btn--primary:hover \{ background: var\(--s-btn-hover\)/.test(s) && /\.s__btn--secondary:hover \{ background: var\(--s-btn2-hover\)/.test(s)),
    withButtons.filter(([, s]) => !/\.s__btn--primary:hover/.test(s)).map(([f]) => f).join(", "))
  const hero = read(`${dir}/hero.storelib`)
  check("the hero's button follows its scheme unless a colour is chosen, and has a hover", /"id": "button_color", "label": "Button colour", "default": ""/.test(hero) && /\.hero__button--filled:hover \{ background: var\(--btn-hover/.test(hero) && /--btn-hover: \{\{ scheme\.primary_btn_hover_bg \}\}/.test(hero))
  const json = readdirSync(join(process.cwd(), dir)).filter((f) => f.endsWith(".json")).map((f) => read(`${dir}/${f}`))
  check("no section's schema bakes in the old indigo as a default", json.every((s) => !/"default":\s*"#6366f1"/.test(s)))
}

console.log("\nSections drawn in React")
{
  const shared = read("components/website-builder/sections/_shared.tsx")
  const css = read("app/globals.css")
  check("one helper hands a button's colours over as custom properties", /export function schemeButton\(/.test(shared) && /"--sl-btn-hover-bg": hoverBg/.test(shared))
  check("and one rule paints them, hover included", /\[data-sl-button\] \{\s*background: var\(--sl-btn-bg\);/.test(css) && /\[data-sl-button\]:hover \{\s*background: var\(--sl-btn-hover-bg/.test(css))
  const dir = "components/website-builder/sections/renderers"
  for (const f of ["HeaderSection", "RichTextSection", "SplitContentSection", "ImageBannerSection", "CtaSection", "SlideshowSection", "ProductListSection", "PromotionBannerSection", "ImageComparisonSection", "VideoHeroSection", "LookbookSection", "ContactFormSection"]) {
    const src = read(`${dir}/${f}.tsx`)
    check(`${f} paints its button through it`, /schemeButton\(/.test(src) && /data-sl-button/.test(src))
  }
  for (const f of ["HeaderSection", "FooterSection", "CountdownTimerSection", "ProductSection"]) {
    check(`${f} reads its own Advanced colors`, !/resolveScheme\(/.test(read(`${dir}/${f}.tsx`)) && /sectionColors\(/.test(read(`${dir}/${f}.tsx`)))
  }
}

console.log("\nThe panels say what each colour is")
{
  const panels = read("components/website-builder/editor/design-panels.tsx")
  check("a button's colours are named Fill, Text, Hover fill and Hover text", /\{ key: "primary_button_background", label: "Fill" \}/.test(panels) && /\{ key: "primary_button_hover_background", label: "Hover fill" \}/.test(panels) && /\{ key: "primary_button_hover_text", label: "Hover text" \}/.test(panels))
  check("and an automatic hover says Auto", /hint=\{auto \? "Auto" : "Scheme"\}/.test(panels) && /hint=\{own \? undefined : hint\}/.test(panels))
  check("each colour is a row, name on the left and swatch and hex on the right, not four swatches side by side", /function ColorRow\(/.test(panels) && /variant="field"/.test(panels) && !/grid grid-cols-4/.test(panels))
  check("the hover colours wait behind a disclosure, shut", /const \[hoverOpen, setHoverOpen\] = useState\(false\)/.test(panels) && />Hover colors</.test(panels))
  check("a colour the section chose goes back to the scheme from its own row", /aria-label=\{`Put \$\{name\.toLowerCase\(\)\} back to the scheme`\}/.test(panels))
  const page = read("app/website-builder/editor/[installId]/page.tsx")
  check("the header's button panel has them, where the button is", /<ButtonColorGroup\s*group=\{BUTTON_COLOR_GROUPS\[0\]\}/.test(page))
  check("and no longer says the colours are inherited from the theme", !/Button style, radius and colors are inherited/.test(page))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
