/**
 * ===========================================================================
 *  VELVET AND BASALT: THE TWO DARK THEMES IN CLEAN
 * ===========================================================================
 * components/onepage/themes/dark-clean-themes. The owner: two more themes in
 * the picker's Clean group, both dark, clean and smooth, each with its own
 * button, type and surface, not two recolours, no purple gradient, no glass,
 * no neon.
 *
 * This holds what the themes promise: their place at the end of Clean, every
 * colour pair at 4.5:1 in every button style (and the hover's), a structure
 * no other theme has, faces the page loads, what each does differently from
 * the other, their names in all six languages, and the probe that measures a
 * whole page of each (scripts/check-onepage-dark-themes.mjs).
 *
 * Run with:  node scripts/run-push-tests.mjs (registered there)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { DARK_CLEAN_THEMES } from "@/components/onepage/themes/dark-clean-themes"
import { THEME_GROUPS, themeGroupOf } from "@/components/onepage/themes/theme-order"
import { themeLabel } from "@/components/onepage/themes/theme-names"
import { LARGE_MIN, TEXT_MIN, buttonGrounds, pageGrounds, parseColor, readableTheme, worstContrast } from "@/lib/onepage/contrast"
import { buttonHoverVars } from "@/lib/onepage/button-style"
import { ONEPAGE_FONTS, familyOf } from "@/lib/onepage/fonts"
import { lookFromTemplate } from "@/lib/onepage/theme-apply"
import { readCatalog } from "../scripts/i18n/catalog-file.mjs"

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
const IDS = ["velvet", "basalt"] as const
const themeOf = (id: string) => THEME_TEMPLATES.find((t) => t.id === id) as T | undefined
const v = (themeOf("velvet")?.theme_config ?? {}) as T
const b = (themeOf("basalt")?.theme_config ?? {}) as T

console.log("\nIn the picker")
check("both are in the picker, once each, dark", IDS.every((id) => THEME_TEMPLATES.filter((t) => t.id === id).length === 1 && themeOf(id)!.category === "dark"))
check("they are the module's two, nothing else", DARK_CLEAN_THEMES.map((t) => t.id).join() === "velvet,basalt")
const clean = THEME_GROUPS.find((g) => g.id === "clean")!.ids as readonly string[]
check("they close the Clean group, after Notebook", themeGroupOf("velvet") === "clean" && themeGroupOf("basalt") === "clean" && clean.slice(-3).join() === "notebook,velvet,basalt", clean.join())
const ids = THEME_TEMPLATES.map((t) => t.id)
check("and the picker lists them there", ids.indexOf("velvet") === ids.indexOf("notebook") + 1 && ids.indexOf("basalt") === ids.indexOf("velvet") + 1)

console.log("\nEvery word reads, in every button style")
for (const id of IDS) {
  const c = themeOf(id)!.theme_config as T
  const under: string[] = []
  for (const style of [undefined, "filled", "soft", "outline", "glass"]) {
    const t = readableTheme({ ...c, ...(style ? { button_style: style } : {}) }) as T
    const g = pageGrounds(t)
    const list: [string, string, typeof g, number][] = [["text", t.text_color, g, TEXT_MIN], ["small print", t.secondary_text_color, g, TEXT_MIN], ["name", t.title_color, g, TEXT_MIN], ["button words", t.button_text_color, buttonGrounds(t, g), TEXT_MIN], ["social", t.social_icon_color, g, LARGE_MIN]]
    for (const [what, ink, on, min] of list) { const r = worstContrast(parseColor(ink)!, on); if (r < min) under.push(`${style ?? "theme"} ${what} ${r.toFixed(2)}`) }
  }
  check(`${id}: text, small print, name, button words and icons read on every stop, in every style`, under.length === 0, under.join(", "))
  check(`${id}: readableTheme changes none of its colours (they already read)`, ["text_color", "secondary_text_color", "title_color", "button_text_color", "button_color"].every((k) => (readableTheme(c) as T)[k] === c[k]))
  const hover = buttonHoverVars(c) as Record<string, string>
  check(`${id}: its own Fill hover is drawn as set, and its words read on it`, hover["--op-fill"] === c.button_hover_fill && hover["--op-fill-text"] === c.button_hover_text && worstContrast(parseColor(c.button_hover_text)!, [parseColor(c.button_hover_fill)!]) >= TEXT_MIN)
}
check("Velvet's small print has room to spare (7:1 or more)", worstContrast(parseColor(v.secondary_text_color)!, pageGrounds(v)) >= 7)
check("Basalt's small print reads on the lightest stop of its gradient (the top)", worstContrast(parseColor(b.secondary_text_color)!, pageGrounds(b)) >= 6)
check("Basalt's button edge is seen against the page (it is a tint, not a slab)", worstContrast(parseColor(b.button_border_color)!, pageGrounds(b)) >= 1.8)

console.log("\nTwo themes, not two recolours")
const sig = (t: T) => {
  const r = Number(t.button_border_radius ?? 8)
  const shape = r <= 0 ? "square" : r >= 100 ? "pill" : r <= 8 ? "soft" : "round"
  return [t.header_layout || "classic", t.cover_image_url ? "cover" : "-", t.block_layout || "list", t.product_layout || "own", t.header_align || "center", t.button_style, shape, t.theme_skin || "-"].join("|")
}
for (const id of IDS) {
  const c = themeOf(id)!.theme_config as T
  check(`${id}'s structure is its own (tests/onepage-ar5)`, THEME_TEMPLATES.filter((t) => t.id !== id && sig(t.theme_config as T) === sig(c)).length === 0, sig(c))
}
check("the surface: Velvet a flat warm black, Basalt a cool graphite gradient with grain", v.background_type === "solid" && b.background_type === "gradient" && b.gradient_noise === true && (() => { const w = parseColor(v.background_color)!, k = parseColor(b.background_color)!; return w.r > w.b && k.b > k.r })())
check("the type: a serif name centred against a grotesque name flush left", familyOf(v.title_font) === "Newsreader" && familyOf(b.title_font) === "Geist" && v.header_align === "center" && b.header_align === "left" && familyOf(v.font_family) !== familyOf(b.font_family))
check("the button: a solid ivory slab against a tonal tint with an edge, two corners", v.button_style === "filled" && b.button_style === "soft" && v.button_border_width === 0 && b.button_border_width === 1 && v.button_border_radius !== b.button_border_radius)
check("the hover: camel against steel", v.button_hover_fill !== b.button_hover_fill && v.button_hover_animation === "fill" && b.button_hover_animation === "fill")
check("the products and links: rows and picture cards against tiles and a plain list", v.product_layout === "rows" && b.product_layout === "grid" && v.block_layout === "cards" && b.block_layout === "list")
check("the social icons: outlined against bare", v.social_icon_style === "outline" && b.social_icon_style === "minimal")
check("Share and Subscribe: light on Velvet, dark on Basalt, neither glass", themeOf("velvet")!.share_style === "white" && themeOf("basalt")!.share_style === "black" && IDS.every((id) => !/glass/.test(String(themeOf(id)!.subscribe_style)) && themeOf(id)!.theme_config.button_style !== "glass"))
const hue = (hex: string) => { const c = parseColor(hex)!; const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b); if (mx === mn) return -1; const d = mx - mn; const h = mx === c.r ? ((c.g - c.b) / d) % 6 : mx === c.g ? (c.b - c.r) / d + 2 : (c.r - c.g) / d + 4; return (h * 60 + 360) % 360 }
const colours = IDS.flatMap((id) => Object.values(themeOf(id)!.theme_config as T).filter((x): x is string => typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x)))
check("no violet, no neon: every colour is quiet (no hue from 255 to 320, nothing saturated past 45%)", colours.every((c) => { const h = hue(c); const p = parseColor(c)!; const mx = Math.max(p.r, p.g, p.b), mn = Math.min(p.r, p.g, p.b); return (h < 255 || h > 320 || mx - mn < 20) && (mx === 0 || (mx - mn) / mx <= 0.45) }), colours.join(","))
check("no gradient in a button, and the only gradient is Basalt's three greys", !IDS.some((id) => /gradient/.test(String(themeOf(id)!.theme_config.button_color))) && (b.background_gradient.match(/#[0-9a-f]{6}/gi) || []).every((c: string) => Math.abs(parseColor(c)!.r - parseColor(c)!.b) < 12))

console.log("\nFaces, picking and names")
check("every face is one the page loads (lib/onepage/fonts)", IDS.every((id) => { const c = themeOf(id)!.theme_config as T; return [c.font_family, c.title_font].every((f) => familyOf(f)! in ONEPAGE_FONTS) }))
check("the name's weight is one its face has", (ONEPAGE_FONTS.Newsreader || "").split(";").includes(String(v.title_weight)) && (ONEPAGE_FONTS.Geist || "").split(";").includes(String(b.title_weight)))
const page = { theme: { template_id: "default", background_color: "#ffffff", block_layout: "masonry", button_size: "large" }, settings: {}, draft_blocks: [] } as T
for (const id of IDS) {
  const picked = lookFromTemplate(page as never, themeOf(id) as never, "classic", null) as T
  check(`picking ${id} lays all of it on and takes the last theme's off`, picked.theme.template_id === id && picked.theme.background_color === (themeOf(id)!.theme_config as T).background_color && picked.theme.block_layout === (themeOf(id)!.theme_config as T).block_layout && picked.theme.button_size == null && picked.settings.share_style === themeOf(id)!.share_style)
}
const names = read("components/onepage/themes/theme-names.ts")
const langs = ["es", "fr", "de", "pt-BR", "it", "pl"]
const missing = langs.filter((l) => { const w = readCatalog(join(root, "lib/i18n/catalog", `${l}.ts`)) as Record<string, string>; return !w["theme::Velvet"] || !w["theme::Basalt"] })
check("both are named in all six languages", missing.length === 0 && /velvet: \(\) => ttx\("theme", "Velvet"\)/.test(names) && /basalt: \(\) => ttx\("theme", "Basalt"\)/.test(names), missing.join(","))
check("in English the picker says Velvet and Basalt", themeLabel({ id: "velvet", name: "x" }) === "Velvet" && themeLabel({ id: "basalt", name: "x" }) === "Basalt")

console.log("\nThe probe")
const probe = read("scripts/check-onepage-dark-themes.mjs")
const harness = read("scripts/render-onepage-dark-themes.tsx")
check("a whole page of each, at 390 and 1280, measured on pixels", /"velvet,basalt"/.test(probe) && /"390,1280"/.test(probe) && /HIDE_WORDS/.test(probe) && /<PublicOnePage/.test(harness) && /lookFromTemplate/.test(harness))
check("every part a creator puts on a page is on it", ["link_button", "group", "product", "storelib_shelf", "email_capture", "contact_form", "calendly", "embed", "form_quiz", "faq", "testimonials", "promo_code", "countdown", "social_links"].every((k) => harness.includes(k)))
check("fields, focus rings, the product sheet, the share sheet and the picker are measured or shot", /field can be seen/.test(probe) && /focused field shows a ring/.test(probe) && /focused link button shows a ring/.test(probe) && /product-sheet/.test(probe) && /share sheet/.test(probe) && /picker-clean\.png/.test(probe))
check("these tests are registered", read("scripts/run-push-tests.mjs").includes("tests/onepage-dark-themes.test.ts"))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
