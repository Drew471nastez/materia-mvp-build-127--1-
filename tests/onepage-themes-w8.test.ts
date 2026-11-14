/**
 * ===========================================================================
 *  ROUND W8: THREE MORE THEMES, CARDS THAT END ON A WHOLE BLOCK, AND A SWITCH
 *  THAT LEAVES NOTHING OF THE LAST THEME BUT WHAT THE CREATOR CHOSE
 * ===========================================================================
 * The owner: "make sure the theme previews of the OnePage themes are more
 * good, clean, smooth; showing much better, not overlapping or hiding
 * things; ensure they apply very well; and create 3 more very different,
 * unique, creative themes."
 *
 *   PRESETS   Gazette, Halo and Acid: every setting a valid value the editor
 *             offers, fonts the page loads, words readable on what is behind
 *             them (WCAG 4.5:1 on every colour of a gradient, through a glass
 *             button), and each unlike every other theme.
 *   APPLY     picking a theme lays on all of it; picking the next takes back
 *             what the last set (its type and frame too, THEME_TYPE_KEYS),
 *             and keeps what the creator chose themselves.
 *   CARDS     a card is 5:7 and its blocks wrap out of sight rather than be
 *             cut by its edge. The bounding-box check in the real picker:
 *             scripts/check-onepage-theme-swatches.mjs.
 *
 * Run with:  npx tsx tests/onepage-themes-w8.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { AP_THEMES, R40_THEMES, R42_THEMES, W8_THEMES, withR40Themes } from "@/components/onepage/themes/r40-themes"
import { LOOK_RESET, THEME_TYPE_KEYS, contrastRatio, lookFromTemplate, type ThemeTemplateLike } from "@/lib/onepage/theme-apply"
import { buttonFill, buttonHover, buttonShadow } from "@/lib/onepage/button-style"
import { ONEPAGE_FONTS, familyOf } from "@/lib/onepage/fonts"
import { WALLPAPER_PATTERNS } from "@/lib/onepage/wallpaper"
import { avatarShapeOf, avatarBorderWidth, caseOf, trackingOf } from "@/lib/onepage/header-style"
import { blockLayoutOf, headerAlignOf, themeProductLayoutOf } from "@/lib/onepage/theme-layout"
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
/* Every older theme's settings, read from the Design tab's catalogue and the newer themes' file. */
const baseConfigs = [...design.matchAll(/\n  \{\n    id: "([a-z0-9-]+)",[\s\S]*?theme_config: \{([\s\S]*?)\n    \},/g)].map((m) => ({ id: m[1], body: m[2] }))
const get = (body: string, k: string) => body.match(new RegExp(`\\n\\s+${k}: "?([^",\\n]+)"?`))?.[1] ?? null
const older = [
  ...baseConfigs.map((b) => ({ id: b.id, c: Object.fromEntries(["title_font", "background_type", "background_color", "button_style", "block_layout", "background_pattern", "header_align"].map((k) => [k, get(b.body, k)?.replace(/ as const$/, "")])) as Record<string, any> })),
  ...[...R40_THEMES, ...R42_THEMES, ...AP_THEMES].map((t) => ({ id: t.id, c: t.theme_config as Record<string, any> })),
]

console.log("\nThree more themes, valid and each its own")
check(`the older catalogue was read (${older.length} themes)`, older.length >= 34) /* Editorial retired */
check("three themes, new ids", W8_THEMES.length === 3 && W8_THEMES.every((t) => !older.some((o) => o.id === t.id)))
check("in three kinds: light, gradient, dark", W8_THEMES.map((t) => t.category).sort().join() === "dark,gradient,light")

const REQUIRED = ["background_type", "background_color", "text_color", "secondary_text_color", "button_style", "button_color", "button_text_color", "button_border_radius", "button_border_width", "button_border_color", "button_shadow", "button_hover_animation", "button_hover_fill", "button_hover_text", "font_family", "title_font", "title_color", "social_icon_color", "social_icon_style", "spacing", "card_width", "header_layout", "background_pattern", "block_layout", "header_align"]
const ENUMS: Record<string, readonly unknown[]> = {
  background_type: ["solid", "gradient", "image", "video"],
  button_style: ["filled", "outline", "glass", "soft"],
  button_shadow: ["none", "subtle", "strong", "hard"],
  button_hover_animation: ["default", "none", "lift", "fade", "zoom", "glow", "fill", "pop", "underline"],
  button_size: ["compact", "regular", "large"],
  button_text_align: ["center", "left"],
  button_icon_position: ["left", "right"],
  block_layout: ["list", "grid", "cards", "compact", "masonry"],
  header_align: ["center", "left"],
  product_layout: ["own", "grid", "rows"],
  spacing: ["compact", "normal", "comfortable"],
  card_width: ["narrow", "standard", "wide"],
  header_layout: ["classic", "hero"],
  social_icon_style: ["filled", "outline", "minimal"],
  title_size: ["small", "default", "large"],
  title_weight: [400, 500, 600, 700, 800],
  title_tracking: ["tight", "normal", "wide"],
  title_case: ["none", "upper"],
  avatar_shape: ["circle", "rounded", "square"],
  pattern_opacity: ["low", "medium", "hard", "very_hard"],
  background_pattern: WALLPAPER_PATTERNS.map((p) => p.id),
}
const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i
for (const t of W8_THEMES) {
  const c = t.theme_config as Record<string, any>
  const missing = REQUIRED.filter((k) => c[k] === undefined || c[k] === null)
  check(`${t.name}: sets every setting a theme should`, missing.length === 0, missing.join())
  const bad = Object.entries(ENUMS).filter(([k, allowed]) => k in c && !allowed.includes(c[k])).map(([k]) => `${k}=${c[k]}`)
  check(`${t.name}: every choice is one the editor offers`, bad.length === 0, bad.join())
  const colours = Object.entries(c).filter(([k]) => /_color$|_fill$|_text$/.test(k)).filter(([, v]) => !HEX.test(String(v)))
  check(`${t.name}: every colour is a hex colour`, colours.length === 0, colours.map(([k]) => k).join())
  check(`${t.name}: numbers in range`, c.button_border_radius >= 0 && c.button_border_width >= 0 && c.button_border_width <= 4 && (c.avatar_border_width ?? 0) <= 6)
  check(`${t.name}: fonts the page loads`, [c.font_family, c.title_font].every((f) => Object.prototype.hasOwnProperty.call(ONEPAGE_FONTS, familyOf(f) || "")))
  const known = new Set([...REQUIRED, ...Object.keys(LOOK_RESET), ...THEME_TYPE_KEYS])
  const stray = Object.keys(c).filter((k) => !known.has(k))
  check(`${t.name}: sets only what the next theme takes back`, stray.length === 0, stray.join())
  check(`${t.name}: a title face no other theme has`, !older.some((o) => familyOf(o.c.title_font) === familyOf(c.title_font)) && W8_THEMES.filter((x) => familyOf(x.theme_config.title_font) === familyOf(c.title_font)).length === 1)
  /* Unlike every other theme in what the eye sees first: background, buttons, layout, header. */
  const sig = (x: Record<string, any>) => [x.background_type, String(x.background_color).toLowerCase(), x.button_style, x.block_layout ?? "list", x.header_align ?? "center", x.background_pattern ?? "none"].join("|")
  check(`${t.name}: a look no other theme has`, !older.some((o) => sig(o.c) === sig(c)))

  const under = behind(c)
  const low = (fg: string) => Math.min(...under.map((b) => ratio(b, fg)))
  check(`${t.name}: the name, the words and the bio read at 4.5:1 on every colour behind them`, low(c.title_color) >= 4.5 && low(c.text_color) >= 4.5 && low(c.secondary_text_color) >= 4.5, `${low(c.title_color).toFixed(2)} ${low(c.text_color).toFixed(2)} ${low(c.secondary_text_color).toFixed(2)}`)
  check(`${t.name}: the social icons read at 3:1`, low(c.social_icon_color) >= 3, low(c.social_icon_color).toFixed(2))
  const fill = buttonFill(c as never)
  const surfaces = fill === "filled" ? [c.button_color] : fill === "glass" ? under.map((b) => over("#ffffff", 0.15, b)) : fill === "soft" ? under.map((b) => over(c.button_color, 0.14, b)) : under
  const button = Math.min(...surfaces.map((s) => ratio(s, c.button_text_color)))
  check(`${t.name}: button words read at 4.5:1 at rest`, button >= 4.5, button.toFixed(2))
  check(`${t.name}: and on hover, in its own colours`, ["fill", "pop"].includes(buttonHover(c as never)) && ratio(c.button_hover_fill, c.button_hover_text) >= 4.5, ratio(c.button_hover_fill, c.button_hover_text).toFixed(2))
  check(`${t.name}: the picture's ring shows on the page (3:1)`, !c.avatar_border_color || under.some((b) => ratio(b, c.avatar_border_color) >= 3) || c.avatar_border_color === "#ffffff")
}
const [gazette, halo, acid] = W8_THEMES.map((t) => t.theme_config as Record<string, any>)
check("Gazette: a slab serif in capitals, flush left over a square picture, index buttons (words left, picture right), products as rows",
  familyOf(gazette.title_font) === "Alfa Slab One" && caseOf(gazette.title_case) === "upper" && headerAlignOf(gazette) === "left" && avatarShapeOf(gazette) === "square" && gazette.button_text_align === "left" && gazette.button_icon_position === "right" && themeProductLayoutOf(gazette) === "rows")
check("Halo: a three colour wash with grain, wide light capitals, a white ring, tall glass buttons",
  behind(halo).length >= 4 && halo.gradient_noise === true && trackingOf(halo.title_tracking) === "wide" && avatarBorderWidth(halo) === 4 && buttonFill(halo as never) === "glass" && halo.button_size === "large")
check("Acid: acid lime square buttons two to a row with a hard magenta shadow, a square framed picture, products as tiles",
  buttonShadow(acid as never) === "hard" && acid.button_border_radius === 0 && blockLayoutOf(acid) === "grid" && avatarShapeOf(acid) === "square" && themeProductLayoutOf(acid) === "grid" && acid.background_pattern === "grid")
const merged = withR40Themes([{ id: "a", category: "light" }, { id: "b", category: "gradient" }, { id: "c", category: "dark" }])
const order = merged.map((t) => t.id).join(",")
check("each joins the end of its kind", order.includes("notebook,gazette,aqua,messenger,playful,grunge,aqua2,messenger2,grunge2,b") && order.includes("cobalt,halo,aero,y2k2,vaporwave,dune,c") && order.endsWith("ledger,acid,y2k,aero2,playful2,classic98,arcade,stoicism,atlas") /* Changed on purpose (round AT): Plaster is Stoicism, and Dune ends the gradients. */ /* Changed on purpose (round AS): Plaster. */ /* Changed on purpose (round W10): the W10 themes after the W9 ones. */ /* Changed on purpose (round W9): the six W9 themes join the end of their kinds after these. */, order)

console.log("\nPicking a theme, and the next")
const byId = (id: string) => W8_THEMES.find((t) => t.id === id) as unknown as ThemeTemplateLike
const plain: ThemeTemplateLike = { id: "air", category: "light", theme_config: { background_type: "solid", background_color: "#eef0f3", text_color: "#111827", button_style: "filled", button_color: "#ffffff", button_text_color: "#111827" } }
const start = { id: "p", theme: { template_id: "air", ...plain.theme_config, logo_url: "https://x/logo.png" }, settings: {}, draft_blocks: [] } as never
const toAcid = lookFromTemplate(start, byId("acid"), "classic", plain)
const ta = toAcid.theme as unknown as Record<string, unknown>
check("every setting of the theme is laid on", Object.entries(acid).every(([k, v]) => k === "header_layout" || ta[k] === v), Object.entries(acid).filter(([k, v]) => k !== "header_layout" && ta[k] !== v).map(([k]) => k).join())
check("the creator's own logo stays", ta.logo_url === "https://x/logo.png")
const back = lookFromTemplate(toAcid, plain, "classic", byId("acid")).theme as unknown as Record<string, unknown>
const left = [...Object.keys(acid)].filter((k) => !(k in plain.theme_config) && !["header_layout", "spacing", "card_width", "button_border_radius", "button_border_width", "button_border_color", "font_family"].includes(k) && back[k] != null && back[k] !== false && back[k] !== "none" && back[k] !== 0)
check("picking another theme leaves nothing of it behind, its type and frame included", left.length === 0 && back.avatar_shape === null && back.title_case === null && back.avatar_border_color === null, left.join())
/* Back and forth: Gazette, Halo, Acid, Gazette, then a plain theme. */
let page = start as never as ReturnType<typeof lookFromTemplate>
let prev: ThemeTemplateLike = plain
for (const id of ["gazette", "halo", "acid", "gazette"]) { page = lookFromTemplate(page, byId(id), "classic", prev); prev = byId(id) }
const gz = page.theme as unknown as Record<string, unknown>
check("back and forth: Gazette again is Gazette exactly, nothing of Halo or Acid", Object.entries(gazette).every(([k, v]) => k === "header_layout" || gz[k] === v) && gz.title_tracking === null && gz.title_weight === null && gz.title_size === null && gz.button_size === null && gz.gradient_noise === false)
page = lookFromTemplate(page, plain, "classic", prev)
const pl = page.theme as unknown as Record<string, unknown>
check("  and then a plain theme has none of the four", THEME_TYPE_KEYS.every((k) => pl[k] == null) && pl.background_pattern === "none" && pl.product_layout === null && pl.button_hover_fill === null)
/* What the creator chose stays. */
const mine = { ...(toAcid as any), theme: { ...(toAcid as any).theme, avatar_shape: "rounded", title_weight: 800 } } as never
const toHalo = lookFromTemplate(mine, byId("halo"), "classic", byId("acid")).theme as unknown as Record<string, unknown>
check("a frame the creator changed after the theme stays (rounded, not Acid's square)", toHalo.avatar_shape === "rounded")
check("  a weight the creator chose is not overridden by the new theme's", toHalo.title_weight === 800)
check("  while what Acid set and the creator left is Halo's now", toHalo.title_case === "upper" && toHalo.title_tracking === "wide" && toHalo.avatar_border_color === "#ffffff" && toHalo.title_size === null)
const custom = { id: "p", theme: { template_id: "default", title_case: "upper" }, settings: {}, draft_blocks: [] } as never
check("a choice made under a theme that never set it stays", (lookFromTemplate(custom, plain, undefined, { id: "default", theme_config: {} }).theme as any).title_case === "upper")
check("without the last theme known, anything there is kept as the creator's", (lookFromTemplate({ id: "p", theme: { template_id: "?", avatar_shape: "square" }, settings: {}, draft_blocks: [] } as never, plain).theme as any).avatar_shape === "square")
check("the picker hands the theme the page wore", /applyThemeLook\(template as never, [^\n]*THEME_TEMPLATES\.find\(\(t\) => t\.id === theme\.template_id\)/.test(design))
const context = read("lib/onepage/context.tsx")
check("  and the editor passes it on", /commit\(lookFromTemplate\(prev, template, headerLayout, previous\), null\)/.test(context))

console.log("\nEvery name in six languages")
const names = read("components/onepage/themes/theme-names.ts")
for (const t of W8_THEMES) check(`${t.name} has a line`, new RegExp(`\\n  ${t.id}: \\(\\) => ttx\\("theme", "${t.name}"\\)`).test(names))
for (const lang of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
  const cat = readCatalog(join(process.cwd(), "lib/i18n/catalog", `${lang}.ts`)) as Record<string, string>
  const missing = W8_THEMES.filter((t) => !cat[`theme::${t.name}`]).map((t) => t.name)
  check(`${lang}: the three names`, missing.length === 0, missing.join())
}

console.log("\nA card ends on a whole block")
const preview = read("components/onepage/themes/theme-swatch.tsx")
/* Changed on purpose (the theme swatch round): the checks here described the page-sized theme card (the creator's page at a card's scale, components/onepage/themes/theme-preview). The owner asked for that card to go; a card is a swatch now (components/onepage/themes/theme-swatch) and tests/onepage-swatch-themes.test.ts checks it. Removed: "a card is 5:7..."; "the blocks are one column that wraps..."; "the page is the card's height..."; "a card keeps 18px..."; "product tiles after the links..."; "pictures are the creator's own..."; "the picker check measures every block...". */
/* Changed on purpose (round AS): 24px wider than the column, so the blocks keep the page's 350px. */
/* Changed on purpose (round AS): the blocks come in the creator's order (slotsFor); on Grid and Mixed the links' pair first, the product tiles after it. */
/* Changed on purpose (round AS): every picture is a drawing of the creator's (a portrait, a product, a link's), not a wash. */
check("still no state and no effects inside a card", !/use(State|Effect|LayoutEffect|Ref)\(/.test(preview))
const script = read("scripts/check-onepage-theme-swatches.mjs")

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
