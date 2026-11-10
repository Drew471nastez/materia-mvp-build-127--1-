/**
 * ===========================================================================
 *  ROUND W10: THE SKINS FIXED AT THE SOURCE, A SECOND VERSION OF EACH, AND
 *  CLASSIC 98, VAPORWAVE AND ARCADE
 * ===========================================================================
 * The owner: "make all the current themes better ... apply more good, clean,
 * correctly" (Messenger's subscribe block was white on white, Grunge's "Join
 * my newsletter" invisible on its paper), "create a second version of each",
 * "a new one Windows 98, and 2 more that are missing, 100% very popular".
 *
 *   PRESETS   the nine new themes: every setting a value the editor offers,
 *             fonts the page loads, the page's words at 4.5:1 on every colour
 *             behind them, buttons at rest and on hover.
 *   WORDS     every pair of words and paint a skin draws (scripts/build-
 *             onepage-skins.mjs `pairs`) reads at 4.5:1 even at 70% (the
 *             blocks draw their small lines at .7 to .85), and every skin
 *             sets the words on its forms, its cards and its legal links
 *             itself, whatever colour the creator's text is.
 *   SKIN      fifteen skins, each styling every kind of block, each with a
 *             scene whose pieces are all drawn; a second version is its
 *             first's rules with another palette, not a copy.
 *   APPLY     picking one lays its skin on; picking another takes it off.
 *
 * The look is photographed by scripts/shot-onepage-skins.mjs (390 and 1280,
 * every block layout).
 *
 * Run with:  npx tsx tests/onepage-themes-w10.test.ts
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { AP_THEMES, R40_THEMES, R42_THEMES, W8_THEMES, W9_THEMES, W10_THEMES, withR40Themes } from "@/components/onepage/themes/r40-themes"
import { LOOK_RESET, THEME_TYPE_KEYS, contrastRatio, lookFromTemplate, type ThemeTemplateLike } from "@/lib/onepage/theme-apply"
import { buttonFill, buttonHover } from "@/lib/onepage/button-style"
import { ONEPAGE_FONTS, familyOf, fontStack } from "@/lib/onepage/fonts"
import { WALLPAPER_PATTERNS } from "@/lib/onepage/wallpaper"
import { THEME_SKINS, skinRootProps, skinSceneOf, themeSkinOf } from "@/lib/onepage/theme-skin"
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
const rgb = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16))
function over(top: string, share: number, under: string): string {
  const a = rgb(top), b = rgb(under)
  return "#" + a.map((v, i) => Math.round(v * share + b[i] * (1 - share)).toString(16).padStart(2, "0")).join("")
}
function behind(c: Record<string, any>): string[] {
  const stops = c.background_type === "gradient" ? [...String(c.background_gradient).matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0]) : []
  return stops.length >= 2 ? [...stops, ...stops.slice(1).map((s, i) => over(stops[i], 0.5, s))] : [c.background_color]
}
const css = read("components/onepage/themes/theme-skins.css")

const design = read("components/onepage/tabs/design-tab.tsx")
const older = [
  ...[...design.matchAll(/\n  \{\n    id: "([a-z0-9-]+)",/g)].map((m) => m[1]),
  ...[...R40_THEMES, ...R42_THEMES, ...AP_THEMES, ...W8_THEMES, ...W9_THEMES].map((t) => t.id),
]
const olderNames = [...design.matchAll(/\n    name: "([^"]+)",/g)].map((m) => m[1]).concat([...R40_THEMES, ...R42_THEMES, ...AP_THEMES, ...W8_THEMES, ...W9_THEMES].map((t) => t.name))

console.log("\nNine themes, valid and each its own")
const NEW = ["aero2", "aqua2", "messenger2", "y2k2", "playful2", "grunge2", "classic98", "vaporwave", "arcade"]
check(`the older catalogue was read (${older.length} themes)`, older.length >= 44)
check("nine themes, new ids and names, one for each new skin", W10_THEMES.length === 9 && W10_THEMES.map((t) => t.id).join() === NEW.join() && W10_THEMES.every((t) => !older.includes(t.id) && !olderNames.includes(t.name)) && THEME_SKINS.slice(6).join() === NEW.join())
check("each theme names its own skin", W10_THEMES.every((t) => (t.theme_config as Record<string, unknown>).theme_skin === t.id))
check("the two popular looks the catalogue lacked are new, not a renamed Neon or Swiss", ["Vaporwave", "Arcade"].every((n) => W10_THEMES.some((t) => t.name === n)) && !olderNames.some((n) => /vapor|synth|arcade|pixel|8.?bit/i.test(n)))
check("no maker's name or mark: Classic 98 is not called Windows", W10_THEMES.every((t) => !/windows|microsoft|msn|apple|mac ?os/i.test(t.name)) && !/Windows|Microsoft/.test(css))
check("in the kinds the picker lists", W10_THEMES.every((t) => ["light", "gradient", "dark"].includes(t.category)))

const REQUIRED = ["background_type", "background_color", "text_color", "secondary_text_color", "button_style", "button_color", "button_text_color", "button_border_radius", "button_border_width", "button_border_color", "button_shadow", "button_hover_animation", "button_hover_fill", "button_hover_text", "font_family", "title_font", "title_color", "social_icon_color", "social_icon_style", "spacing", "card_width", "header_layout", "background_pattern", "block_layout", "header_align", "theme_skin"]
const ENUMS: Record<string, readonly unknown[]> = {
  background_type: ["solid", "gradient"],
  button_style: ["filled", "outline", "glass", "soft"],
  button_shadow: ["none", "subtle", "strong", "hard"],
  button_hover_animation: ["default", "none", "lift", "fade", "zoom", "glow", "fill", "pop", "underline"],
  button_size: ["compact", "regular", "large"],
  button_text_align: ["center", "left"],
  button_icon_position: ["left", "right"],
  block_layout: ["list", "grid", "cards", "compact", "masonry"],
  header_align: ["center", "left"],
  spacing: ["compact", "normal", "comfortable"],
  card_width: ["narrow", "standard", "wide"],
  header_layout: ["classic", "hero"],
  social_icon_style: ["filled", "outline", "minimal"],
  title_size: ["small", "default", "large"],
  title_weight: [400, 500, 600, 700, 800],
  title_tracking: ["tight", "normal", "wide"],
  title_case: ["none", "upper"],
  avatar_shape: ["circle", "rounded", "square"],
  background_pattern: WALLPAPER_PATTERNS.map((p) => p.id),
  theme_skin: THEME_SKINS,
}
const HEX = /^#[0-9a-f]{6}$/i
for (const t of W10_THEMES) {
  const c = t.theme_config as Record<string, any>
  const missing = REQUIRED.filter((k) => c[k] === undefined || c[k] === null)
  check(`${t.name}: sets every setting a theme should`, missing.length === 0, missing.join())
  const bad = Object.entries(ENUMS).filter(([k, allowed]) => k in c && !allowed.includes(c[k])).map(([k]) => `${k}=${c[k]}`)
  check(`${t.name}: every choice is one the editor offers`, bad.length === 0, bad.join())
  const colours = Object.entries(c).filter(([k]) => /_color$|_fill$|_text$/.test(k)).filter(([, v]) => !HEX.test(String(v)))
  check(`${t.name}: every colour is a hex colour`, colours.length === 0, colours.map(([k]) => k).join())
  check(`${t.name}: a border, so the skin finds every surface drawn in the button's look`, c.button_border_width >= 1 && c.button_border_width <= 4 && buttonFill(c as never) === "filled")
  check(`${t.name}: fonts the page loads`, [c.font_family, c.title_font].every((f) => Object.prototype.hasOwnProperty.call(ONEPAGE_FONTS, familyOf(f) || "")))
  const known = new Set([...REQUIRED, ...Object.keys(LOOK_RESET), ...THEME_TYPE_KEYS])
  const stray = Object.keys(c).filter((k) => !known.has(k))
  check(`${t.name}: sets only what the next theme takes back`, stray.length === 0, stray.join())
  const under = behind(c)
  const low = (fg: string) => Math.min(...under.map((b) => ratio(b, fg)))
  check(`${t.name}: the name, the words and the bio read at 4.5:1 on every colour behind them`, low(c.title_color) >= 4.5 && low(c.text_color) >= 4.5 && low(c.secondary_text_color) >= 4.5, `${low(c.title_color).toFixed(2)} ${low(c.text_color).toFixed(2)} ${low(c.secondary_text_color).toFixed(2)}`)
  check(`${t.name}: the social icons read at 3:1`, low(c.social_icon_color) >= 3, low(c.social_icon_color).toFixed(2))
  check(`${t.name}: button words read at 4.5:1 at rest`, ratio(c.button_color, c.button_text_color) >= 4.5, ratio(c.button_color, c.button_text_color).toFixed(2))
  check(`${t.name}: and on hover, in its own colours`, ["fill", "pop", "lift"].includes(buttonHover(c as never)) && ratio(c.button_hover_fill, c.button_hover_text) >= 4.5, ratio(c.button_hover_fill, c.button_hover_text).toFixed(2))
}
check("the two pixel faces are loaded, each with a fallback of its kind", ONEPAGE_FONTS["Pixelify Sans"] === "400;500;600;700" && ONEPAGE_FONTS["Press Start 2P"] === null && /monospace$/.test(fontStack("Press Start 2P")) && /sans-serif$/.test(fontStack("Pixelify Sans")))
const merged = withR40Themes([{ id: "a", category: "light" }, { id: "b", category: "gradient" }, { id: "c", category: "dark" }]).map((t) => t.id).join(",")
check("each joins the end of its kind, after round W9's", merged.includes("grunge,aqua2,messenger2,grunge2,b") && merged.includes("aero,y2k2,vaporwave,c") && merged.endsWith("y2k,aero2,playful2,classic98,arcade,atlas"), merged)

console.log("\nEvery word a skin paints under, read on it (at 4.5:1, and still at 70%)")
const pairs = JSON.parse(execFileSync(process.execPath, ["scripts/build-onepage-skins.mjs", "--pairs"], { encoding: "utf8", maxBuffer: 1 << 24 })) as Array<{ skin: string; what: string; ink: string; under: string[]; faded?: boolean }>
let current = true
try { execFileSync(process.execPath, ["scripts/build-onepage-skins.mjs", "--check"], { stdio: "pipe" }) } catch { current = false }
check("the stylesheet is what scripts/build-onepage-skins.mjs writes", current)
check(`the skins promise ${pairs.length} pairs`, pairs.length >= 80)
for (const p of pairs) {
  const full = Math.min(...p.under.map((u) => ratio(u, p.ink)))
  /* Words on a surface (onSurface) include the blocks' faded small lines; a button's words are drawn whole. */
  const faded = p.faded ? Math.min(...p.under.map((u) => ratio(u, over(p.ink, 0.7, u)))) : full
  check(`${p.skin}, ${p.what}: ${full.toFixed(2)}${p.faded ? `, at 70% ${faded.toFixed(2)}` : ""}`, full >= 4.5 && faded >= 4.5 && css.toLowerCase().includes(p.ink.toLowerCase()))
}
console.log("\nThe owner's two: words on a form are the skin's, whatever the theme's text colour")
const INLINE = ':is([style^="color:"], [style*=" color:"])'
for (const skin of THEME_SKINS) {
  const rules = [...css.matchAll(new RegExp(`\\[data-op-skin="${skin}"\\] ([^{]*)\\{\\n\\s*color: (#[0-9a-f]{6}) !important;`, "gi"))].map((m) => m[1])
  const inked = (part: string) => rules.some((sel) => sel.includes(part) && sel.includes(INLINE))
  check(`${skin}: the subscribe and contact forms (a Bold form's white words included)`, inked("[data-email-layout]") && inked("[data-onepage-contact]"))
  check(`${skin}: the cards it paints its own colour (products, testimonials, codes, questions)`, inked("[data-product-block]") || pairs.some((p) => p.skin === skin && /card|window|panel|glass/.test(p.what)) )
  check(`${skin}: the legal links, on whatever the scene draws at the bottom`, css.includes(`[data-op-skin="${skin}"] [data-onepage-legal] {`) && pairs.some((p) => p.skin === skin && p.what === "the legal links"))
  check(`${skin}: never a button's words`, rules.filter((sel) => sel.includes(INLINE)).every((sel) => sel.includes(":not(input, textarea, :is(:is([data-product-cta]")))
}

console.log("\nFifteen skins, each styling every kind of block, each with its scene")
check("the skins are the six and the nine", THEME_SKINS.length === 15 && THEME_SKINS.every((s) => themeSkinOf({ theme_skin: s }) === s) && themeSkinOf({ theme_skin: "windows98" }) === null)
check("a new skin is carried by the page and its scene drawn over a colour or gradient only", skinRootProps({ theme_skin: "classic98" })["data-op-skin"] === "classic98" && skinSceneOf({ theme_skin: "vaporwave", background_type: "gradient" }) === "vaporwave" && skinSceneOf({ theme_skin: "arcade", background_type: "image" }) === null)
const KINDS: Record<string, string> = {
  "links": ":is(a.op-btn, [data-tp-link])",
  "product and form buttons": ":is([data-product-cta], [data-email-form] button[type=submit]",
  "cards": ":is([data-product-block], [data-tp-product], a.op-card",
  "questions": "[data-onepage-faq] .op-card",
  "the forms": ":is([data-email-layout], [data-onepage-contact])",
  "fields": ":is([data-email-form], [data-onepage-contact] form) :is(input",
  "the name": ":is([data-op-header] h1, [data-tp-title])",
  "the picture": ":is([data-page-avatar] [data-slot=avatar], [data-tp-avatar])",
  "social icons": ":is([data-op-social-icon], [data-tp-socials] > span)",
  "dividers": "[data-op-block] > .flex.items-center > .h-px:only-child",
  "pictures": "[data-op-block] div[class*='aspect-']:has(> img)",
  "countdown numbers": "[data-onepage-countdown] .grid > div",
  "headings": "[data-onepage-heading]",
  "any other block in the button's look": ':where([style*="background-clip: padding-box"]',
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
for (const skin of THEME_SKINS) {
  const missing = Object.entries(KINDS).filter(([, sel]) => !css.includes(`[data-op-skin="${skin}"] ${sel}`) && !new RegExp(`\\[data-op-skin="${skin}"\\] :is\\([^{]*${esc(sel)}`).test(css)).map(([k]) => k)
  check(`${skin}: styles ${Object.keys(KINDS).length} kinds of block`, missing.length === 0, missing.join(", "))
}
const scene = read("components/onepage/themes/theme-skin-scene.tsx")
for (const skin of THEME_SKINS) {
  const pieces = [...(scene.match(new RegExp(`\\n  ${skin}: \\[(.*)\\],`))?.[1] ?? "").matchAll(/\["([a-z-]+)", (\d+)\]/g)].map((m) => m[1])
  check(`${skin}: a scene of ${pieces.length} kinds of piece, each drawn`, pieces.length >= 3 && pieces.every((p) => css.includes(`[data-skin-scene="${skin}"] [data-sk="${p}"]`)), pieces.join())
}
const FAMILY: Record<string, string> = { aero2: "aero", aqua2: "aqua", messenger2: "messenger", y2k2: "y2k", playful2: "playful", grunge2: "grunge" }
for (const [second, first] of Object.entries(FAMILY)) {
  const src = read(`scripts/onepage-skins/${first}.mjs`)
  const shared = /material\("/.test(src) ? src.includes(`material("${first}"`) && src.includes(`material("${second}"`) : src.includes(`"${second}"`)
  check(`${second} is drawn in ${first}'s source (${first === "y2k" ? "its own palette" : "the same rules, another palette"})`, shared)
}
check("still for a visitor who asked for less motion, the scenes' ::before layers too", /@media \(prefers-reduced-motion: reduce\) \{\n\s+\[data-skin-scene\] \*, \[data-skin-scene\] \*::before, \[data-skin-scene\] \*::after/.test(css))
check("still in a theme card", /\[data-tp-page\] \[data-skin-scene\] \*, \[data-tp-page\] \[data-skin-scene\] \*::before/.test(css))
const keyframes = [...css.matchAll(/@keyframes [\w-]+ \{([^@]*?)\}\n/g)].map((m) => m[1]).join(" ")
const props = [...keyframes.matchAll(/([a-z-]+):/g)].map((m) => m[1])
check("whatever moves moves by transform, opacity or a filter", props.every((p) => ["translate", "scale", "rotate", "opacity", "filter"].includes(p)), [...new Set(props)].join())
check("nothing fetched: no picture from elsewhere, no backdrop blur", !/url\("?https?:/.test(css) && !/backdrop-filter/.test(css))
check("the score and the desktop's icons only where there is room (container queries)", /@container \(min-width: 700px\) \{\n\s+\[data-skin-scene="arcade"\] \[data-sk="hud"\] \{ display: none; \}/.test(css) && /@container \(min-width: 1000px\) \{\n\s+\[data-skin-scene="classic98"\] \[data-sk="icon"\] \{ display: block; \}/.test(css))
check("the generated sheet stays small enough for a link page (under 260 KB before compression)", css.length < 260 * 1024, `${(css.length / 1024).toFixed(1)} KB`)

console.log("\nPicking one, and the next")
const byId = (id: string) => W10_THEMES.find((t) => t.id === id) as unknown as ThemeTemplateLike
const plain: ThemeTemplateLike = { id: "air", category: "light", theme_config: { background_type: "solid", background_color: "#eef0f3", text_color: "#111827", button_style: "filled", button_color: "#ffffff", button_text_color: "#111827" } }
const start = { id: "p", theme: { template_id: "air", ...plain.theme_config }, settings: {}, draft_blocks: [] } as never
const to98 = lookFromTemplate(start, byId("classic98"), "classic", plain)
const t98 = to98.theme as unknown as Record<string, unknown>
check("every setting of Classic 98 is laid on, its skin with it", Object.entries(byId("classic98").theme_config).every(([k, v]) => k === "header_layout" || t98[k] === v) && t98.theme_skin === "classic98")
const toArcade = lookFromTemplate(to98, byId("arcade"), "classic", byId("classic98")).theme as unknown as Record<string, unknown>
check("from one new skin to another", toArcade.theme_skin === "arcade" && toArcade.avatar_border_color === "#ffffff")
const back = lookFromTemplate(to98, plain, "classic", byId("classic98")).theme as unknown as Record<string, unknown>
check("picking a theme without one takes the skin away", back.theme_skin === null)
check("the type knows every new skin", NEW.every((s) => read("lib/onepage/types.ts").includes(`"${s}"`)))

console.log("\nEvery name in six languages")
const names = read("components/onepage/themes/theme-names.ts")
for (const t of W10_THEMES) check(`${t.name} has a line`, new RegExp(`\\n  ${t.id}: \\(\\) => ttx\\("theme", "${t.name}"\\)`).test(names))
for (const lang of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
  const cat = readCatalog(join(process.cwd(), "lib/i18n/catalog", `${lang}.ts`)) as Record<string, string>
  const missing = W10_THEMES.filter((t) => !cat[`theme::${t.name}`]).map((t) => t.name)
  check(`${lang}: the nine names`, missing.length === 0, missing.join())
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
