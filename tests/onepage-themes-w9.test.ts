/**
 * ===========================================================================
 *  ROUND W9: SIX THEMES WITH A SKIN (AERO, AQUA, MESSENGER, Y2K, PLAYFUL,
 *  GRUNGE), THE MATERIAL OF EVERY BLOCK AND THE SCENE BEHIND THEM
 * ===========================================================================
 * The owner: "create a Frutiger Aero template, very well done, very complex
 * and good, clean, adapted for all things. Also Mac OS X Aqua-like themes,
 * MSN Messenger / XP internet-like templates, Cyber Y2K too", "one more Bold
 * & Playful, apply styles to all blocks and buttons and everything", "one
 * more Grunge".
 *
 *   PRESETS   every setting a value the editor offers, fonts the page loads,
 *             words readable on every colour behind them (4.5:1), on every
 *             button at rest and on hover, and on every colour the skin
 *             itself paints (its gel, chrome and sticker fills).
 *   SKIN      lib/onepage/theme-skin reads only the six names; the page's
 *             roots and the theme card carry it; the scene draws only over
 *             the theme's own colour or gradient.
 *   STYLE     components/onepage/themes/theme-skins.css is what
 *             scripts/build-onepage-skins.mjs writes, styles every kind of
 *             block for every skin, moves only by transform and opacity,
 *             and stands still for reduced motion and in a theme card.
 *   APPLY     picking one lays its skin on; picking another takes it off.
 *
 * The look itself is photographed by scripts/shot-onepage-skins.mjs (390 and
 * 1280, every block layout).
 *
 * Run with:  npx tsx tests/onepage-themes-w9.test.ts
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { AP_THEMES, R40_THEMES, R42_THEMES, W8_THEMES, W9_THEMES, withR40Themes } from "@/components/onepage/themes/r40-themes"
import { LOOK_RESET, THEME_TYPE_KEYS, contrastRatio, lookFromTemplate, type ThemeTemplateLike } from "@/lib/onepage/theme-apply"
import { buttonFill, buttonHover } from "@/lib/onepage/button-style"
import { ONEPAGE_FONTS, familyOf } from "@/lib/onepage/fonts"
import { WALLPAPER_PATTERNS } from "@/lib/onepage/wallpaper"
import { THEME_SKINS, skinRootProps, skinSceneOf, skinVars, themeSkinOf } from "@/lib/onepage/theme-skin"
import { readCatalog } from "../scripts/i18n/catalog-file.mjs"

/* Round 17: Grunge is retired (lib/onepage/retired-themes moves its pages to Grunge Zine) and scripts/build-onepage-skins.mjs no longer writes its skin, so the sheet is read for the skins it writes. */
const WRITTEN_SKINS = THEME_SKINS.filter((s) => s !== "grunge")
let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` (${detail})` : "")); console.log(`  FAIL  ${label}${detail ? ` (${detail})` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const ratio = (a: string, b: string) => contrastRatio(a, b) ?? 0
function over(top: string, share: number, under: string): string {
  const rgb = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16))
  const a = rgb(top), b = rgb(under)
  return "#" + a.map((v, i) => Math.round(v * share + b[i] * (1 - share)).toString(16).padStart(2, "0")).join("")
}
function behind(c: Record<string, any>): string[] {
  const stops = c.background_type === "gradient" ? [...String(c.background_gradient).matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0]) : []
  return stops.length >= 2 ? [...stops, ...stops.slice(1).map((s, i) => over(stops[i], 0.5, s))] : [c.background_color]
}

const design = read("components/onepage/tabs/design-tab.tsx")
const older = [
  ...[...design.matchAll(/\n  \{\n    id: "([a-z0-9-]+)",/g)].map((m) => m[1]),
  ...[...R40_THEMES, ...R42_THEMES, ...AP_THEMES, ...W8_THEMES].map((t) => t.id),
]

console.log("\nSix themes, valid and each its own")
/* Changed on purpose (round 17): Folio and Midnight retired. */ check(`the older catalogue was read (${older.length} themes)`, older.length >= 35) /* Editorial retired */
/* Changed on purpose (round W10): THEME_SKINS also holds the second versions and three new skins (tests/onepage-themes-w10.test.ts); the six are its first six. */
/* Changed on purpose (round 17): Grunge is retired, its skin no longer written; five remain. */ check("six themes, new ids, one for each skin", W9_THEMES.length === 5 && W9_THEMES.every((t) => !older.includes(t.id)) && W9_THEMES.map((t) => t.id).join() === THEME_SKINS.slice(0, 6).filter((s) => s !== "grunge").join())
check("each theme names its own skin", W9_THEMES.every((t) => (t.theme_config as Record<string, unknown>).theme_skin === t.id))
check("in the kinds the picker lists", W9_THEMES.every((t) => ["light", "gradient", "dark"].includes(t.category)) && new Set(W9_THEMES.map((t) => t.category)).size === 3)

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
for (const t of W9_THEMES) {
  const c = t.theme_config as Record<string, any>
  const missing = REQUIRED.filter((k) => c[k] === undefined || c[k] === null)
  check(`${t.name}: sets every setting a theme should`, missing.length === 0, missing.join())
  const bad = Object.entries(ENUMS).filter(([k, allowed]) => k in c && !allowed.includes(c[k])).map(([k]) => `${k}=${c[k]}`)
  check(`${t.name}: every choice is one the editor offers`, bad.length === 0, bad.join())
  const colours = Object.entries(c).filter(([k]) => /_color$|_fill$|_text$/.test(k)).filter(([, v]) => !HEX.test(String(v)))
  check(`${t.name}: every colour is a hex colour`, colours.length === 0, colours.map(([k]) => k).join())
  /* The skin finds the theme's surfaces by the border every bordered button has (scripts/build-onepage-skins.mjs SURF). */
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
const faces = W9_THEMES.map((t) => familyOf(t.theme_config.title_font))
/* Changed on purpose (round 17): five, with Grunge retired. */ check("six title faces, none shared between them", new Set(faces).size === 5, faces.join())
const merged = withR40Themes([{ id: "a", category: "light" }, { id: "b", category: "gradient" }, { id: "c", category: "dark" }]).map((t) => t.id).join(",")
/* Changed on purpose (round W10): the W10 themes follow the six in each kind. */
/* Changed on purpose (round 17): Folio and Grunge are retired (lib/onepage/retired-themes), so they leave the catalogue's order. */ check("each joins the end of its kind", merged.includes("gazette,aqua,messenger,playful,") && merged.includes("halo,aero,") && merged.includes("acid,y2k,"), merged)

console.log("\nWhat the skins paint, read on what they paint it")
const css = read("components/onepage/themes/theme-skins.css")
/* Each pair is words and a colour the skin itself paints under them (not the theme's), and that colour is in the stylesheet. */
const PAINTED: Array<[string, string, string[]]> = [
  ["Aero's green gel button", "#08325a", ["#a3ec74", "#6fcf45", "#58bd33", "#8ee05e"]],
  ["Aqua's blue gel button", "#06162e", ["#4a94ec", "#3d89e8", "#5aa9f5"]],
  /* Changed on purpose (round W10): a deeper green, whose white words read on every band (they measured 3.5:1 on the old highlight). */
  ["Messenger's green start button", "#ffffff", ["#1d7019", "#1a6c17", "#145d12"]],
  ["Messenger's selection blue (hover)", "#ffffff", ["#316ac5"]],
  /* Changed on purpose (round W10): the chrome's horizon is lighter, no longer a dark line through every label. */
  ["Y2K's chrome at its darkest band", "#14112b", ["#b9c0cf", "#d3d8e3"]],
  ["Y2K's holographic button", "#14112b", ["#ffc2ef", "#bfefff", "#d9cbff", "#c4ffe2", "#ffd9b8"]],
  ["Playful's run of colours", "#161412", ["#ffe066", "#8ee86b", "#ff9fd0", "#c5a8ff", "#8fd3ff", "#ffb36b"]],
  ["Playful's black button", "#ffffff", ["#161412"]],
  /* Changed on purpose (round 17): Grunge is retired and its skin no longer written; Grunge Zine is measured with the W10 skins. */
]
for (const [what, ink, under] of PAINTED) {
  const worst = Math.min(...under.map((u) => ratio(u, ink)))
  check(`${what}: words at 4.5:1`, worst >= 4.5, worst.toFixed(2))
  check(`  and those colours are the stylesheet's`, under.every((u) => css.toLowerCase().includes(u)) && css.toLowerCase().includes(ink), under.filter((u) => !css.toLowerCase().includes(u)).join())
}

console.log("\nThe skin, read and carried")
check("only the six names are a skin", THEME_SKINS.every((s) => themeSkinOf({ theme_skin: s }) === s) && themeSkinOf({ theme_skin: "nope" }) === null && themeSkinOf({}) === null && themeSkinOf(null) === null)
check("the scene is drawn over a colour or a gradient, never over the creator's photo or video", skinSceneOf({ theme_skin: "aero", background_type: "gradient" }) === "aero" && skinSceneOf({ theme_skin: "aero", background_type: "solid" }) === "aero" && skinSceneOf({ theme_skin: "aero", background_type: "image" }) === null && skinSceneOf({ theme_skin: "aero", background_type: "video" }) === null)
const vars = skinVars({ theme_skin: "aqua", button_color: "#123456", button_text_color: "#fefefe", text_color: "#111111" })
check("the material wears the theme's own colours (a changed button colour shows in the gel)", vars["--sk-surface"] === "#123456" && vars["--sk-ink"] === "#fefefe" && vars["--sk-page-ink"] === "#111111")
check("a hand edited colour cannot write CSS", skinVars({ theme_skin: "aqua", button_color: "red; background: url(x)" })["--sk-surface"] === "#ffffff")
check("no skin, no variables and no attribute: a page as it always was", Object.keys(skinVars({})).length === 0 && Object.keys(skinRootProps({ theme_skin: null })).length === 0 && skinRootProps({ theme_skin: "grunge" })["data-op-skin"] === "grunge")
const page = read("components/onepage/public-onepage.tsx")
check("both of the live page's roots carry the skin and its colours", (page.match(/\{\.\.\.skinRootProps\(safeTheme\)\}/g) ?? []).length === 2 && (page.match(/\.\.\.skinVars\(safeTheme\),/g) ?? []).length === 2)
check("the scene sits where the pattern sits: around the desktop card, in it, and on the phone", (page.match(/<ThemeSkinScene theme=\{safeTheme\} label=\{sellerName\}/g) ?? []).length === 3)
const card = read("components/onepage/themes/theme-swatch.tsx")
check("a theme card carries the skin and draws its scene, still and without words that would leave the card", /\{\.\.\.skinRootProps\(c\)\}/.test(card) && /\.\.\.skinVars\(c\),/.test(card) && /<ThemeSkinScene theme=\{c\} \/>/.test(card) && !/useState|useEffect/.test(read("components/onepage/themes/theme-skin-scene.tsx")))

console.log("\nThe stylesheet")
let current = true
try { execFileSync(process.execPath, ["scripts/build-onepage-skins.mjs", "--check"], { stdio: "pipe" }) } catch { current = false }
check("it is what scripts/build-onepage-skins.mjs writes", current)
check("loaded with the scene, so only a OnePage loads it, and by the probes too", /import "\.\/theme-skins\.css"/.test(read("components/onepage/themes/theme-skin-scene.tsx")) && read("scripts/onepage-probe-server.mjs").includes("components/onepage/themes/theme-skins.css") && !read("app/globals.css").includes("theme-skins"))
/* Every skin styles every kind of thing a page draws. */
const KINDS: Record<string, string> = {
  "links": ":is(a.op-btn, [data-tp-link])",
  "product and form buttons": ":is([data-product-cta], [data-email-form] button[type=submit]",
  "cards (products, featured links, codes, testimonials)": ":is([data-product-block], [data-tp-product], a.op-card",
  "questions": "[data-onepage-faq] .op-card",
  "the subscribe and contact forms": ":is([data-email-layout], [data-onepage-contact])",
  "fields": ":is([data-email-form], [data-onepage-contact] form) :is(input",
  "the name": ":is([data-op-header] h1, [data-tp-title])",
  "the picture": ":is([data-page-avatar] [data-slot=avatar], [data-tp-avatar])",
  "social icons": ":is([data-op-social-icon], [data-tp-socials] > span)",
  "dividers": "[data-op-block] > .flex.items-center > .h-px:only-child",
  "pictures": "[data-op-block] div[class*='aspect-']:has(> img)",
  "any other block in the button's look": ':where([style*="background-clip: padding-box"]',
}
for (const skin of WRITTEN_SKINS) {
/* Changed on purpose (wave 16): Renaissance boxes only the row and stacked forms' fields; Connect's pill and Personal note's line keep their own shape (the owner: the layout pictures must be accurate). */
const KIND_ALT: Record<string, string> = { fields: ":is([data-email-form=row],[data-email-form=stacked], [data-onepage-contact] form) :is(input" }
  const missing = Object.entries(KINDS).filter(([k, sel]) => !(KIND_ALT[k] && css.includes(`[data-op-skin="${skin}"] ${KIND_ALT[k]}`)) && !css.includes(`[data-op-skin="${skin}"] ${sel}`) && !new RegExp(`\\[data-op-skin="${skin}"\\] :is\\([^{]*${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(css)).map(([k]) => k)
  check(`${skin}: styles ${Object.keys(KINDS).length} kinds of block`, missing.length === 0, missing.join(", "))
}
const scene = read("components/onepage/themes/theme-skin-scene.tsx")
for (const skin of WRITTEN_SKINS) {
  const pieces = [...(scene.match(new RegExp(`\\n  ${skin}: \\[(.*)\\],`))?.[1] ?? "").matchAll(/\["([a-z-]+)", (\d+)\]/g)].map((m) => m[1])
  const drawn = pieces.every((p) => css.includes(`[data-skin-scene="${skin}"] [data-sk="${p}"]`))
  /* Changed on purpose (wave 15): Renaissance's scene is the painting alone, whole and still; its frame, sky band and full scrim are gone at the owner's word. */
  check(`${skin}: a scene of ${pieces.length} kinds of piece, each drawn`, pieces.length >= (skin === "renaissance" ? 1 : 3) && drawn, pieces.join())
}
const keyframes = [...css.matchAll(/@keyframes [\w-]+ \{([^@]*?)\}\n/g)].map((m) => m[1]).join(" ")
const props = [...keyframes.matchAll(/([a-z-]+):/g)].map((m) => m[1])
check("whatever moves moves by transform, opacity or a filter, never by layout or a repaint of a picture", props.length > 10 && props.every((p) => ["translate", "scale", "rotate", "opacity", "filter"].includes(p)), [...new Set(props)].join())
check("still for a visitor who asked for less motion", /@media \(prefers-reduced-motion: reduce\) \{\n\s+\[data-skin-scene\] \*[^}]*animation: none !important;/.test(css))
check("still in a theme card", /\[data-tp-page\] \[data-skin-scene\] \*[^{]*\{\s*animation: none !important;/.test(css))
check("no backdrop blur anywhere: the glass is a gloss over a tint, so a bubble drifting behind it costs nothing", !/backdrop-filter/.test(css))
check("no picture fetched: every image is drawn in the stylesheet", !/url\("?https?:/.test(css))
check("a filled button keeps the hover's own words", /\[data-op-skin\] :is\(\.op-btn:hover, \.op-host:hover \.op-btn\):is\(\[data-hover="fill"\], \[data-hover="pop"\]\) \{ color: var\(--op-fill-text, inherit\) !important;/.test(css))
check("Playful's colours run on in the Grid's pairs", /\[data-link-pair\][^{]*:nth-child\(6n\+1\) > :nth-child\(2\)/.test(css))
check("a pill skin's tiles are rounded tiles, not ovals (Aqua, Y2K)", /\[data-op-skin="aqua"\] :is\(\[data-link-tile\][^{]*\{\s*border-radius: 22px !important;/.test(css) && /\[data-op-skin="y2k"\] :is\(\[data-link-tile\][^{]*\{\s*border-radius: 26px !important;/.test(css))

console.log("\nPicking a skinned theme, and the next")
const byId = (id: string) => W9_THEMES.find((t) => t.id === id) as unknown as ThemeTemplateLike
const plain: ThemeTemplateLike = { id: "air", category: "light", theme_config: { background_type: "solid", background_color: "#eef0f3", text_color: "#111827", button_style: "filled", button_color: "#ffffff", button_text_color: "#111827" } }
const start = { id: "p", theme: { template_id: "air", ...plain.theme_config, logo_url: "https://x/logo.png" }, settings: {}, draft_blocks: [] } as never
const toAero = lookFromTemplate(start, byId("aero"), "classic", plain)
const ta = toAero.theme as unknown as Record<string, unknown>
check("every setting of the theme is laid on, its skin with it", Object.entries(byId("aero").theme_config).every(([k, v]) => k === "header_layout" || ta[k] === v) && ta.theme_skin === "aero")
check("the creator's own logo stays", ta.logo_url === "https://x/logo.png")
/* Changed on purpose (round 17): Grunge is retired; from Aero to Playful instead. */
const toGrunge = lookFromTemplate(toAero, byId("playful"), "classic", byId("aero")).theme as unknown as Record<string, unknown>
const playfulCfg = (byId("playful") as unknown as { theme_config: Record<string, unknown> }).theme_config
check("from one skin to another, the other's skin", toGrunge.theme_skin === "playful" && toGrunge.avatar_shape === (playfulCfg.avatar_shape ?? null) && toGrunge.avatar_border_color === (playfulCfg.avatar_border_color ?? null))
const back = lookFromTemplate(toAero, plain, "classic", byId("aero")).theme as unknown as Record<string, unknown>
check("picking a theme without one takes the skin away, its type and frame too", back.theme_skin === null && back.avatar_border_color === null && back.title_weight === null)
check("the Messenger rows' text side and icon side come and go with it", (lookFromTemplate(start, byId("messenger"), "classic", plain).theme as any).button_text_align === "left" && (lookFromTemplate(lookFromTemplate(start, byId("messenger"), "classic", plain), plain, "classic", byId("messenger")).theme as any).button_text_align === null)
/* Changed on purpose (round W10): the type names the W10 skins after the six. */
check("the type knows the skin", /theme_skin\?: "aero" \| "aqua" \| "messenger" \| "y2k" \| "playful" \| "grunge" \| /.test(read("lib/onepage/types.ts")))

console.log("\nEvery name in six languages")
const names = read("components/onepage/themes/theme-names.ts")
for (const t of W9_THEMES) check(`${t.name} has a line`, new RegExp(`\\n  ${t.id}: \\(\\) => ttx\\("theme", "${t.name}"\\)`).test(names))
for (const lang of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
  const cat = readCatalog(join(process.cwd(), "lib/i18n/catalog", `${lang}.ts`)) as Record<string, string>
  const missing = W9_THEMES.filter((t) => !cat[`theme::${t.name}`]).map((t) => t.name)
  check(`${lang}: the six names`, missing.length === 0, missing.join())
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
