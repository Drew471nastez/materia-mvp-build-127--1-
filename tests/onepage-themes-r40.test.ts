/**
 * ===========================================================================
 *  ROUND 40: FIVE MORE THEMES, BLOCK LAYOUTS, HOVER COLOURS, THEMED SHEETS
 * ===========================================================================
 * Pure logic (lib/onepage/theme-layout, lib/onepage/sheet-theme, the hover
 * colours in lib/onepage/button-style), the five themes' contrast, and pins
 * on the page, the Design tab and the CSS that draw them.
 *
 * Run with:  npx tsx --conditions=react-server tests/onepage-themes-r40.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { R40_THEMES, withR40Themes } from "@/components/onepage/themes/r40-themes"
import { LOOK_RESET, contrastRatio, lookFromTemplate } from "@/lib/onepage/theme-apply"
import { buttonHover, buttonHoverVars } from "@/lib/onepage/button-style"
import { ONEPAGE_FONTS, familyOf } from "@/lib/onepage/fonts"
import {
  BLOCK_LAYOUTS,
  FONT_PAIRS,
  GRADIENT_DIRECTIONS,
  blockGapClass,
  blockLayoutOf,
  fontPairOf,
  headerAlignOf,
  isLinkTilePair,
  layoutUpdates,
  linearGradientValue,
  linkDrawnAsCard,
  normalAngle,
  pairLinkTiles,
} from "@/lib/onepage/theme-layout"
import { hex6, mixHex, sheetPalette, sheetRootCss } from "@/lib/onepage/sheet-theme"

import { WALLPAPER_LIBRARY, librarySrcSet } from "@/lib/onepage/wallpaper-library"
import { stripComments } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const ratio = (a: string, b: string) => contrastRatio(a, b) ?? 0

/* ─── The five themes ─────────────────────────────────────────────────── */
console.log("\nFive more themes, each a different kind of page")
check("five themes", R40_THEMES.length === 5)
check("each id is new and unique", new Set(R40_THEMES.map((t) => t.id)).size === 5)
const ids = new Set(R40_THEMES.map((t) => t.id))
const design = read("components/onepage/tabs/design-tab.tsx")
const oldIds = [...design.matchAll(/\n  \{\n    id: "([a-z0-9-]+)",/g)].map((m) => m[1])
check("none reuses an old theme's id", oldIds.length >= 20 && oldIds.every((id) => !ids.has(id)), oldIds.filter((id) => ids.has(id)).join(","))
check("they use at least three layouts between them", new Set(R40_THEMES.map((t) => blockLayoutOf(t.theme_config))).size >= 3)
check("each turns to its own hover colours (Fill, or Fill and lift)", R40_THEMES.every((t) => ["fill", "pop"].includes(buttonHover(t.theme_config as never))))
check("they come in four kinds", new Set(R40_THEMES.map((t) => t.category)).size === 4)
for (const t of R40_THEMES) {
  const c = t.theme_config as Record<string, any>
  const grounds = c.background_type === "gradient" ? (String(c.background_gradient).match(/#[0-9a-f]{6}/gi) ?? []) : [c.background_color]
  check(`${t.name}: text and bio read at 4.5:1 on every part of its ground`, grounds.length > 0 && grounds.every((g: string) => ratio(g, c.text_color) >= 4.5 && ratio(g, c.secondary_text_color) >= 4.5), grounds.map((g: string) => `${g} ${ratio(g, c.text_color).toFixed(1)}/${ratio(g, c.secondary_text_color).toFixed(1)}`).join(" "))
  const btnGround = c.button_style === "outline" ? grounds[0] : c.button_color
  check(`${t.name}: its button's words read at 4.5:1`, ratio(btnGround, c.button_text_color) >= 4.5, `${ratio(btnGround, c.button_text_color).toFixed(2)}`)
  check(`${t.name}: its hover colours read at 4.5:1`, ratio(c.button_hover_fill, c.button_hover_text) >= 4.5, `${ratio(c.button_hover_fill, c.button_hover_text).toFixed(2)}`)
  check(`${t.name}: its fonts are ones the page loads`, [c.font_family, c.title_font].every((f) => Object.prototype.hasOwnProperty.call(ONEPAGE_FONTS, familyOf(f) || "")))
  check(`${t.name}: no violet anywhere`, !/#(8b5cf6|7c3aed|a855f7|9333ea|6d28d9)/i.test(JSON.stringify(c)))
  const shared = Object.keys(R40_THEMES[0].theme_config)
  const own = Object.keys(c).filter((k) => !shared.includes(k) || !R40_THEMES.every((x) => k in x.theme_config))
  check(`${t.name}: every setting only some themes name is reset by the next theme`, own.every((k) => k in LOOK_RESET || k === "header_layout"), own.filter((k) => !(k in LOOK_RESET)).join(","))
}
check("the new fields themes set are all reset by the next theme", ["block_layout", "header_align", "button_size", "button_hover_fill", "button_hover_text"].every((k) => k in LOOK_RESET))
const page = { id: "p", theme: { template_id: "swiss", block_layout: "grid", header_align: "left", button_hover_fill: "#d42d17", button_size: "compact" }, settings: {}, draft_blocks: [] } as never
const after = lookFromTemplate(page, { id: "air", category: "light", theme_config: { background_color: "#eef0f3" } }).theme as unknown as Record<string, unknown>
check("from Swiss to a theme that names none, the page is a list, centred, regular, the old Fill", after.block_layout === null && after.header_align === null && after.button_size === null && after.button_hover_fill === null)
const merged = withR40Themes([{ id: "a", category: "light" }, { id: "b", category: "gradient" }, { id: "c", category: "dark" }, { id: "d", category: "image" }])
/* Changed on purpose (round 42): Folio (light) and Ledger (dark) join after round 40's, each in its kind. */
/* Changed on purpose (round AP): Notebook (light) and Cobalt (gradient) join at the end of their kinds. */
/* Changed on purpose (round W8): Gazette (light), Halo (gradient) and Acid (dark) join at the end of their kinds. */
check("each lands in its own kind, after that kind's old ones", merged.map((t) => t.id).join(",") === "a,gallery,swiss,folio,notebook,gazette,b,lagoon,cobalt,halo,c,ember,ledger,acid,d,atlas")

/* ─── Block layouts ───────────────────────────────────────────────────── */
console.log("\nBlocks can be laid out four ways")
check("five layouts, including mixed tiles", BLOCK_LAYOUTS.join() === "list,grid,cards,compact,masonry")
check("a saved page with no layout is a list", blockLayoutOf({}) === "list" && blockLayoutOf({ block_layout: "nonsense" }) === "list" && blockLayoutOf(null) === "list")
check("the old spacing gaps are exactly the old strings", blockGapClass({ spacing: "compact" }) === "gap-3 sm:gap-4" && blockGapClass({}) === "gap-4 sm:gap-5" && blockGapClass({ spacing: "comfortable" }) === "gap-5 sm:gap-6")
check("Compact is tighter than any spacing", blockGapClass({ block_layout: "compact", spacing: "comfortable" }) === "gap-2 sm:gap-2.5")
check("Cards draws a link with a picture as a card, and only on Cards", linkDrawnAsCard({ block_layout: "cards" }, { thumbnail_url: "x.jpg" }) && !linkDrawnAsCard({ block_layout: "cards" }, { thumbnail_url: "" }) && !linkDrawnAsCard({}, { thumbnail_url: "x.jpg" }))
const L = (id: string, extra: Record<string, unknown> = {}) => ({ id, type: "link_button", data: { url: "https://x", ...extra } })
const blocks = [{ id: "h", type: "header", data: {} }, L("a"), L("b"), L("c"), { id: "t", type: "text", data: {} }, L("d"), L("e", { layout_type: "pro" }), L("f"), L("g")]
const grid = pairLinkTiles(blocks, "grid")
const shape = grid.map((x) => (isLinkTilePair(x) ? `[${x.links.map((l) => l.id).join("")}]` : x.id)).join(" ")
check("Grid pairs plain links that follow one another, a leftover stays a full row, a featured link is never paired", shape === "h [ab] c t d e [fg]", shape)
check("every other layout leaves the order alone", pairLinkTiles(blocks, "list").map((x) => (x as { id: string }).id).join("") === "habctdefg")
const products = [{ tiles: [{ id: "p" }], key: "tiles:p" }, L("x"), L("y")]
const mixed = pairLinkTiles(products as never[], "grid")
check("a product pair already made passes through untouched", mixed.length === 2 && (mixed[0] as unknown) === products[0])
check("header alignment: missing is centred", headerAlignOf({}) === "center" && headerAlignOf({ header_align: "left" }) === "left")
check("picking Compact makes the buttons Small, leaving it puts them back", JSON.stringify(layoutUpdates({}, "compact")) === '{"block_layout":"compact","button_size":"compact"}' && JSON.stringify(layoutUpdates({ block_layout: "compact", button_size: "compact" }, "grid")) === '{"block_layout":"grid","button_size":"regular"}')
check("  and a size chosen by hand (Large) is kept", JSON.stringify(layoutUpdates({ button_size: "large" }, "compact")) === '{"block_layout":"compact"}' && layoutUpdates({ block_layout: "grid" }, "grid") === null)

/* ─── Hover colours ───────────────────────────────────────────────────── */
console.log("\nButtons turn to the hover colours a theme or page chose")
const base = { button_style: "filled", button_color: "#0b0b0b", button_text_color: "#f2f1ec" }
const v = (t: Record<string, unknown>) => buttonHoverVars(t as never) as Record<string, string>
check("with none chosen, Fill is what it always was", v(base)["--op-fill"] === "#f2f1ec" && v(base)["--op-fill-text"] === "#0b0b0b")
check("a chosen fill and text win", v({ ...base, button_hover_fill: "#d42d17", button_hover_text: "#ffffff" })["--op-fill"] === "#d42d17" && v({ ...base, button_hover_fill: "#d42d17", button_hover_text: "#ffffff" })["--op-fill-text"] === "#ffffff")
check("a chosen fill alone gets words that read on it", v({ ...base, button_hover_fill: "#ffffff" })["--op-fill-text"] === "#111113" && v({ ...base, button_hover_fill: "#101a2b" })["--op-fill-text"] === "#ffffff")
check("a hand edited value cannot break the page", v({ ...base, button_hover_fill: "url(x)" })["--op-fill"] === "#f2f1ec")
check("Fill and lift (pop) is read", buttonHover({ button_hover_animation: "pop" }) === "pop")
const css = read("app/globals.css")
const opBlock = css.slice(css.indexOf("OnePage hover: buttons, cards and media"), css.indexOf("/* Button shine animation")).replace(/\/\*[\s\S]*?\*\//g, "")
check("pop rises with translate and fills with opacity, pointer devices only", /\[data-hover="pop"\] \{ translate: 0 -2px; color: var\(--op-fill-text/.test(opBlock) && /\[data-hover="pop"\]:not\(\.animate-onepage-swipe\)::after \{ opacity: 1; \}/.test(opBlock))
check("no hover rule transitions or sets transform", !/transform: (translate|scale)/.test(opBlock) && !/transition-property:[^;]*transform/.test(opBlock))
check("pop's fill layer is Fill's", /\.op-btn:is\(\[data-hover="fill"\], \[data-hover="pop"\]\):not\(\.animate-onepage-swipe\)::after \{\s*background: var\(--op-fill, currentColor\);/.test(opBlock))

/* ─── The sheets and the scrollbar ────────────────────────────────────── */
console.log("\nThe product sheet and checkout window wear the page's colours")
check("hex helpers", hex6("#ABC") === "#aabbcc" && hex6("rgba(0,0,0,1)") === null && mixHex("#000000", "#ffffff", 0.5) === "#808080")
const all = [...R40_THEMES.map((t) => t.theme_config), { background_color: "#ffffff", text_color: "#000000", button_style: "filled", button_color: "#000000", button_text_color: "#ffffff" }, { background_color: "#2e3526", text_color: "#efe9d8", button_style: "filled", button_color: "#efe9d8", button_text_color: "#2e3526" }, { background_color: "#ffd23f", text_color: "#111111", button_style: "filled", button_color: "#ffffff", button_text_color: "#111111" }, { background_color: "rgba(1,2,3,0.5)" }]
for (const t of all) {
  const p = sheetPalette(t as never)
  const name = String((t as Record<string, unknown>).background_color)
  check(`${name}: words, small print and the main button read at 4.5:1`, ratio(p.surface, p.ink) >= 4.5 && ratio(p.raised, p.ink) >= 4.5 && ratio(p.surface, p.muted) >= 4.5 && ratio(p.accent, p.accentInk) >= 4.5, JSON.stringify(p))
  check(`${name}: the main button is seen on the window`, ratio(p.surface, p.accent) >= 1.6)
}
check("a dark page draws a dark window, a light one a light window", sheetPalette({ background_color: "#1b1612" }).dark && !sheetPalette({ background_color: "#f7f6f2" }).dark)
check("the variables go on :root, scrollbar included", /^:root\{--opk-surface:#[0-9a-f]{6};.*--op-scroll-thumb:#[0-9a-f]{6}\}$/.test(sheetRootCss({ background_color: "#123b66", text_color: "#f3f8fd" })))
check("the sheet rules map surfaces, words, hairlines and the main button", [".bg-white", ".text-\\[\\#1a1a2e\\]", ".border-\\[\\#e5e7eb\\]", ".bg-\\[\\#1a1a2e\\]"].every((c) => css.includes(c)) && /var\(--opk-accent-ink/.test(css))
/* Changed on purpose (round 40 merge): the rule moved from globals.css (html:has(.onepage-live), forbidden by tests/editor-css-v) to the public route's own style (components/onepage/page-arrival.tsx). */
check("the live page's scrollbar is slim, in its own ink, pointer screens only", /@media \(hover:hover\) and \(pointer:fine\)\{html\{scrollbar-width:thin;scrollbar-color:var\(--op-scroll-thumb/.test(readFileSync(join(process.cwd(), "components/onepage/page-arrival.tsx"), "utf8")) && !/html:has\(\.onepage-live\)/.test(css))

/* ─── The wallpaper ───────────────────────────────────────────────────── */
console.log("\nThe wallpaper library and the photo")
check("more pictures than the ten there were", WALLPAPER_LIBRARY.length >= 20)
check("no picture twice", new Set(WALLPAPER_LIBRARY.map((w) => w.url)).size === WALLPAPER_LIBRARY.length)
check("only Storelib's own host and Unsplash, which the product already uses", WALLPAPER_LIBRARY.every((w) => /^https:\/\/(storelib\.com\/media\/|images\.unsplash\.com\/)/.test(w.url)))
const links = read("components/onepage/tabs/links-tab.tsx")
check("every Unsplash picture is one the editor already offers somewhere", WALLPAPER_LIBRARY.filter((w) => w.url.includes("unsplash")).every((w) => { const id = w.url.match(/photo-[0-9a-f-]+/)![0]; return links.includes(id) || design.includes(id) || read("components/onepage/themes/r40-themes.ts").includes(id) }))
const set = librarySrcSet(WALLPAPER_LIBRARY[0].url)
check("a square asks for a copy its own size", !!set.srcSet && /w=256&q=75 256w/.test(set.srcSet) && /640w$/.test(set.srcSet))
const photo = stripComments(read("components/onepage/themes/wallpaper-photo.tsx"))
check("the photo is preloaded, decoded before it is shown, faded with opacity", /preload\(src, \{ as: "image", fetchPriority: "high" \}\)/.test(photo) && /img\.decode\(\)/.test(photo) && /transitionProperty: "opacity"/.test(photo) && /backgroundAttachment: undefined/.test(photo))
const live = stripComments(read("components/onepage/public-onepage.tsx"))
/* Changed on purpose (round 42, poster video stills): a video wallpaper's blurred surround is its saved first frame, drawn through WallpaperPhoto too, so there are four: the three photo wallpapers and the video's still. */
check("the live page draws every photo wallpaper through it", (live.match(/<WallpaperPhoto\b/g) ?? []).length === 4 && (live.match(/<WallpaperPhoto\s+url=\{safeTheme\.background_image_url\}/g) ?? []).length === 3 && /<WallpaperPhoto\s+url=\{videoPoster\(/.test(live) && !/backgroundAttachment: "fixed"/.test(live))

/* ─── The gradient's direction ────────────────────────────────────────── */
console.log("\nThe gradient's direction")
check("eight directions, saved as the same numbers", GRADIENT_DIRECTIONS.length === 8 && new Set(GRADIENT_DIRECTIONS).size === 8)
check("the stored gradient is the shape it always was", linearGradientValue(180, "#ffffff", "#000000") === "linear-gradient(180deg, #ffffff 0%, #000000 100%)" && normalAngle(-45) === 315 && normalAngle(360) === 0)
check("the dial is gone, the swatches and slider are there", !/DirectionDial/.test(design) && /<GradientDirection\b/.test(design))

/* ─── Font pairs ──────────────────────────────────────────────────────── */
console.log("\nFont pairs")
check("every pair's faces are loaded and listed in the pickers", FONT_PAIRS.every((p) => [p.title, p.body].every((f) => Object.prototype.hasOwnProperty.call(ONEPAGE_FONTS, familyOf(f) || "") && design.includes(`value: "${f}"`))))
check("a page set in a pair reads as that pair", fontPairOf({ font_family: "'Inter', sans-serif", title_font: "'Fraunces', serif" }) === "fraunces-inter" && fontPairOf({ font_family: "Inter" }) === null)

/* ─── The page, the Design tab and Settings use it ────────────────────── */
console.log("\nThe page, the preview, the Design tab and Settings")
/* Changed on purpose (round W9, opblocks): the paired list is kept in one place (laid) so Mixed tiles can read the same list (mixedTileSizes). */
check("the blocks' gap and layout come from the theme", /className=\{cn\("flex flex-col items-center", blockGapClass\(safeTheme\)\)\}/.test(live) && /const laid = pairProductTiles\(/.test(live) && /pairLinkTiles\(laid, blockLayoutOf\(safeTheme\)\)/.test(live))
check("a link on Cards is drawn as the featured card", /if \(data\.layout_type === 'pro' \|\| linkDrawnAsCard\(theme, data\)\)/.test(live))
check("the classic header and socials carry their marks for left alignment", /data-op-header=""/.test(live) && /data-op-socials=\{isHeroLayout \? undefined : ""\}/.test(live))
check("the theme's sheet colours are written once", (live.match(/sheetRootCss\(safeTheme\)/g) ?? []).length === 1)
check("the preview is the live page's own component", /PublicOnePage/.test(read("components/onepage/preview-document.tsx")))
check("the product sheet and the checkout window are themed", /className=\{cn\(\s*"op-sheet /.test(read("components/onepage/product-sheet.tsx")) /* round 43: two columns on a computer, so the classes are joined */ && /themed && "op-sheet"/.test(read("components/checkout/checkout-window.tsx")) && /themed\b/.test(read("components/onepage/product-block.tsx")))
check("the Design tab has a Layout panel and the themes", /<NavRow dataKey="layout"/.test(design) && /<LayoutSection \/>/.test(design) && /withR40Themes\(BASE_THEME_TEMPLATES\)/.test(design))
/* Changed on purpose (round AP): a card is the page itself at a card's scale (components/onepage/themes/theme-preview), which lays the blocks out as the page does. */
check("the theme cards draw each theme's layout", /<ThemePreview c=\{look\} name=\{name\} thumb=\{themeThumbSrc\} \/>/.test(design) && /blockLayoutOf\(c\)/.test(read("components/onepage/themes/theme-preview.tsx")))
const layoutSrc = read("components/onepage/themes/layout-section.tsx")
check("Share and Subscribe styles are set in Design, the same fields", /updateSettings\(\{ share_style: id \}\)/.test(layoutSrc) && /updateSettings\(\{ subscribe_style: id \}\)/.test(layoutSrc))
const settingsSrc = read("components/onepage/tabs/settings-tab.tsx")
check("Settings keeps the switches and no longer sets the style", /subscribe_enabled/.test(settingsSrc) && !/\[styleKey\]: id/.test(settingsSrc) && !/STYLE_OPTIONS/.test(settingsSrc))
const buttons = stripComments(design).slice(stripComments(design).indexOf("function ButtonsSection()"), stripComments(design).indexOf("function SocialsSection()"))
check("the hover colours are offered for Fill and Fill and lift", /hover === "fill" \|\| hover === "pop"/.test(buttons) && /button_hover_fill: color/.test(buttons) && /button_hover_text: color/.test(buttons))
const copy = [layoutSrc, read("components/onepage/themes/gradient-direction.tsx"), read("components/onepage/themes/font-pairs.tsx"), read("components/onepage/themes/wallpaper-library.tsx"), read("components/onepage/themes/r40-themes.ts")].join("\n")
check("no AI words and no em dashes in the new copy", !/\b(unlock|elevate|seamless|powerful|effortless|supercharge|transform your)\b/i.test(copy) && !copy.includes("—"))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  for (const f of failures) console.log("  - " + f)
  process.exit(1)
}
