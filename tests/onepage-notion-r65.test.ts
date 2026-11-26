/**
 * ===========================================================================
 *  NORTHPAPER: A NOTION TEMPLATE SELLER'S ONE PAGE (round 65)
 * ===========================================================================
 * The owner: a one-page theme after the Northpaper website template and the
 * Notion creator template, "that kind of outline thing", so people can have
 * "their own Notion template link in bio", "with the preset blocks added as
 * default" (components/onepage/themes/northpaper-theme, lib/onepage/theme-blocks).
 *
 * This holds: its place in the picker, its colours read off the website
 * template's own settings and every pair at 4.5:1, a structure no other theme
 * has, the blocks it comes with (only block types the editor already has, in
 * the creator's language, ready to show), when they are laid on (a new page,
 * never over the creator's own blocks unasked), the onboarding and the Design
 * tab wired to it, its words in six languages and the browser probe
 * (scripts/check-onepage-northpaper.mjs).
 *
 * Run with:  node scripts/run-push-tests.mjs (registered there)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { NORTHPAPER_THEMES, northpaperBlocks, themeStarterBlocks } from "@/components/onepage/themes/northpaper-theme"
import { THEME_GROUPS, themeGroupOf } from "@/components/onepage/themes/theme-order"
import { themeLabel } from "@/components/onepage/themes/theme-names"
import { LARGE_MIN, TEXT_MIN, buttonGrounds, pageGrounds, parseColor, readableTheme, worstContrast } from "@/lib/onepage/contrast"
import { buttonHoverVars } from "@/lib/onepage/button-style"
import { ONEPAGE_FONTS, familyOf } from "@/lib/onepage/fonts"
import { lookFromTemplate } from "@/lib/onepage/theme-apply"
import { appendThemeBlocks, blocksAfterPick, hasThemeBlocks, isStarterBlock, onlyStarterBlocks } from "@/lib/onepage/theme-blocks"
import { createDefaultBlock, type OnePageBlock } from "@/lib/onepage/types"

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
const theme = THEME_TEMPLATES.find((t) => t.id === "northpaper") as T | undefined
const c = (theme?.theme_config ?? {}) as T

console.log("\nIn the picker")
check("Northpaper is in the picker once, a light theme", THEME_TEMPLATES.filter((t) => t.id === "northpaper").length === 1 && theme?.category === "light")
check("the module holds it alone", NORTHPAPER_THEMES.map((t) => t.id).join() === "northpaper")
const clean = THEME_GROUPS.find((g) => g.id === "clean")!.ids as readonly string[]
check("it sits in Clean between Cream and Notebook, and Velvet and Basalt still close the group", themeGroupOf("northpaper") === "clean" && clean.indexOf("northpaper") === clean.indexOf("cream") + 1 && clean.slice(-3).join() === "notebook,velvet,basalt", clean.join())
const ids = THEME_TEMPLATES.map((t) => t.id)
check("and the picker lists it there", ids.indexOf("northpaper") === ids.indexOf("cream") + 1 && ids.indexOf("notebook") === ids.indexOf("northpaper") + 1)
check("its name is plain: Northpaper", themeLabel({ id: "northpaper", name: "x" }) === "Northpaper" && theme?.name === "Northpaper")

console.log("\nThe Northpaper website template's look")
const site = JSON.parse(read("theme-packages/materia/templates/notionpage/config/settings_data.json")) as T
const scheme = site.current.color_schemes.default.settings as T
check("the ink is the website's heading colour, the small print its text colour", c.text_color === scheme.heading_color && c.title_color === scheme.heading_color && c.secondary_text_color === scheme.text_color, `${scheme.heading_color} ${scheme.text_color}`)
check("buttons are its secondary button: white, a one pixel rule in its border colour, an 8px corner", c.button_style === "filled" && c.button_color === scheme.btn_secondary_background && c.button_border_color === scheme.btn_secondary_border && c.button_border_width === 1 && c.button_border_radius === site.current.btn_radius)
check("under the pointer it fills with the ink and the words turn white, as the website's does", c.button_hover_animation === "fill" && c.button_hover_fill === scheme.btn_secondary_hover_background && c.button_hover_text === scheme.btn_secondary_hover_color)
check("the page is the footer's warm off white, flat, no pattern, no shadow, no glass", c.background_type === "solid" && c.background_color === "#f7f7f5" && c.background_pattern === "none" && c.button_shadow === "none" && !c.theme_skin)
check("Inter for both, the name bold and tight, flush left like a Notion page", familyOf(c.font_family) === "Inter" && familyOf(c.title_font) === "Inter" && c.title_weight === 700 && c.title_tracking === "tight" && c.header_align === "left")
check("the faces are ones the page loads, at a weight Inter has", familyOf(c.font_family)! in ONEPAGE_FONTS && (ONEPAGE_FONTS.Inter || "").split(";").includes(String(c.title_weight)))
check("the outline: a rounded square picture with an ink rule, outlined socials in ink", c.avatar_shape === "rounded" && c.avatar_border_width === 1 && c.avatar_border_color === c.text_color && c.social_icon_style === "outline" && c.social_icon_color === c.text_color)
check("links as a list, products as rows (a Notion database's list view)", c.block_layout === "list" && c.product_layout === "rows")
check("Share and Subscribe are light", theme?.share_style === "white" && theme?.subscribe_style === "white")

console.log("\nEvery word reads")
const under: string[] = []
for (const style of [undefined, "filled", "soft", "outline", "glass"]) {
  const t = readableTheme({ ...c, ...(style ? { button_style: style } : {}) }) as T
  const g = pageGrounds(t)
  const list: [string, string, typeof g, number][] = [["text", t.text_color, g, TEXT_MIN], ["small print", t.secondary_text_color, g, TEXT_MIN], ["name", t.title_color, g, TEXT_MIN], ["button words", t.button_text_color, buttonGrounds(t, g), TEXT_MIN], ["social", t.social_icon_color, g, LARGE_MIN]]
  for (const [what, ink, on, min] of list) { const r = worstContrast(parseColor(ink)!, on); if (r < min) under.push(`${style ?? "theme"} ${what} ${r.toFixed(2)}`) }
}
check("text, small print, name, button words and icons read at AA in every button style", under.length === 0, under.join(", "))
check("readableTheme changes none of its colours (they already read)", ["text_color", "secondary_text_color", "title_color", "button_text_color", "button_color"].every((k) => (readableTheme(c) as T)[k] === c[k]))
const hover = buttonHoverVars(c) as Record<string, string>
check("its hover is drawn as set, and white on ink reads", hover["--op-fill"] === c.button_hover_fill && hover["--op-fill-text"] === c.button_hover_text && worstContrast(parseColor(c.button_hover_text)!, [parseColor(c.button_hover_fill)!]) >= 7)
check("the small print has room (7:1 or more on the page)", worstContrast(parseColor(c.secondary_text_color)!, pageGrounds(c)) >= 7)

console.log("\nA structure of its own")
const sig = (t: T) => {
  const r = Number(t.button_border_radius ?? 8)
  const shape = r <= 0 ? "square" : r >= 100 ? "pill" : r <= 8 ? "soft" : "round"
  return [t.header_layout || "classic", t.cover_image_url ? "cover" : "-", t.block_layout || "list", t.product_layout || "own", t.header_align || "center", t.button_style, shape, t.theme_skin || "-", t.avatar_shape || "circle", t.button_text_align || "center"].join("|")
}
check("no other theme has its layout, button, picture frame and text alignment together", THEME_TEMPLATES.filter((t) => t.id !== "northpaper" && sig(t.theme_config as T) === sig(c)).length === 0, sig(c))

console.log("\nThe blocks it comes with")
const blocks = northpaperBlocks()
const types = blocks.map((b) => b.type)
check("socials, the templates, a free template signup, two links and questions, in that order", types.join() === "social_row,storelib_shelf,email_capture,link_button,link_button,faq", types.join())
const editorTypes = read("lib/onepage/types.ts")
check("only block types the editor already has", types.every((t) => editorTypes.includes(`| "${t}"`)))
const byType = (t: string) => blocks.find((b) => b.type === t)!.data as T
check("the templates are the creator's own digital products, read live, titled Templates", byType("storelib_shelf").source === "digital" && byType("storelib_shelf").title === "Templates" && byType("storelib_shelf").layout === "list" && !("items" in byType("storelib_shelf")))
check("the signup offers a free Notion template, flush left over an outlined field (Minimal)", byType("email_capture").headline === "Free Notion template" && byType("email_capture").layout_type === "minimal" && byType("email_capture").button_preset === "custom" && byType("email_capture").custom_button_text === "Send it")
const links = blocks.filter((b) => b.type === "link_button").map((b) => b.data as T)
check("both links go somewhere real, with their marks", links.length === 2 && links.every((l) => /^https:\/\/[a-z]/.test(l.url)) && links.map((l) => l.icon).join() === "notion,youtube")
const faq = byType("faq")
check("three questions a Notion buyer asks, each answered", faq.title === "Questions" && faq.items.length === 3 && faq.items.every((q: T) => q.question && q.answer && q.id))
check("every block has its own id, on", new Set(blocks.map((b) => b.id)).size === blocks.length && blocks.every((b) => b.enabled))
check("two picks make blocks with different ids", northpaperBlocks().every((b, i) => b.id !== blocks[i].id))
const words = JSON.stringify(blocks.map((b) => b.data)) + JSON.stringify(c)
check("no AI words and no em dash in what it ships", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform|—/i.test(words))
check("only Northpaper comes with blocks", themeStarterBlocks("northpaper")?.length === blocks.length && themeStarterBlocks("velvet") === null && themeStarterBlocks(null) === null)

console.log("\nWhen they are laid on")
const fresh = [createDefaultBlock("header"), createDefaultBlock("social_row"), createDefaultBlock("link_button"), createDefaultBlock("link_button"), { ...createDefaultBlock("divider"), data: { style: "line", height: 24 } } as OnePageBlock, createDefaultBlock("email_capture")]
check("a new page holds only starter blocks", onlyStarterBlocks(fresh))
const after = blocksAfterPick(fresh, blocks)
check("picking it on a new page puts its blocks under the header in place of the starters", !!after && after[0] === fresh[0] && after.slice(1).map((b) => b.type).join() === types.join() && after.every((b, i) => b.sort_order === i))
const own = [...fresh.slice(0, 2), { ...fresh[2], data: { ...(fresh[2].data as T), label: "My shop", url: "https://example.com" } } as OnePageBlock]
check("a link the creator filled in is their own", !isStarterBlock(own[2]) && !onlyStarterBlocks(own))
check("a page with the creator's own blocks keeps them: nothing is laid on unasked", blocksAfterPick(own, blocks) === null)
check("the onboarding sets a page up from scratch, so it replaces even then", blocksAfterPick(own, blocks, true)!.map((b) => b.type).join() === ["header", ...types].join())
const added = appendThemeBlocks(own, blocks)
check("adding them (the Design tab's offer) keeps every block of the creator's first, with one socials row", added.slice(0, 3).every((b, i) => b.id === own[i].id && b.data === own[i].data) && added.filter((b) => b.type === "social_row").length === 1 && hasThemeBlocks(added, blocks))
check("the offer goes once they are there", !hasThemeBlocks(own, blocks) && hasThemeBlocks(added, blocks))
check("a theme without blocks changes no block", blocksAfterPick(fresh, null) === null && blocksAfterPick(fresh, []) === null)
const page = { theme: { template_id: "default", background_color: "#ffffff", block_layout: "masonry", button_size: "large" }, settings: {}, draft_blocks: after } as T
const picked = lookFromTemplate(page as never, theme as never, "classic", null) as T
check("the look goes on over its blocks in one page (one undo step in the editor)", picked.theme.template_id === "northpaper" && picked.theme.background_color === "#f7f7f5" && picked.theme.button_size == null && picked.draft_blocks.length === after!.length)

console.log("\nWired in")
const ctx = read("lib/onepage/context.tsx")
check("the editor lays the look and the blocks in one commit", /applyThemeLook = useCallback\(\(template: ThemeTemplateLike, headerLayout\?: "classic" \| "hero", previous\?: ThemeTemplateLike \| null, blocks\?: OnePageBlock\[\] \| null\)/.test(ctx) && /lookFromTemplate\(blocks \? \{ \.\.\.prev, draft_blocks: renumber\(blocks\) \} : prev/.test(ctx))
const design = read("components/onepage/tabs/design-tab.tsx")
check("the Design tab passes the blocks on a pick and offers them to a page with its own", /blocksAfterPick\(draft_blocks, starter\)/.test(design) && /<ThemeBlocksOffer/.test(design) && /appendThemeBlocks\(draft_blocks, blocks\)/.test(design) && /NORTHPAPER_THEMES as unknown/.test(design))
check("the offer's buttons are 44px tall", /h-11 rounded-xl px-4 text-\[13px\] font-medium/.test(design) && /h-11 rounded-xl bg-\[#1a1a2e\]/.test(design))
const onboarding = read("components/onepage/onboarding-modal.tsx")
check("the onboarding: picking it as the template makes the page, and no goal blocks go under it", /blocksAfterPick\(onepage\?\.draft_blocks, starter, true\)/.test(onboarding) && /if \(!starter\) await createBlocksForGoal/.test(onboarding))

console.log("\nIn six languages")
const keys = ["theme::Northpaper", "Free Notion template", "A weekly planner for Notion. Leave your email and the link comes to you.", "Send it", "Sent. The link is in your inbox.", "My Notion Marketplace profile", "Video walkthroughs", "How do I get the template?", "Does it work on Notion's free plan?", "Can I change it once it is mine?", "Add blocks", "{name} comes with blocks for selling Notion templates: your templates, a free template for an email, links and questions. Add them under your blocks?"]
const missing: string[] = []
for (const l of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
  /* The catalog's lines are `"key": "words",` (JSON strings), read as they are written. */
  const w: Record<string, string> = {}
  for (const m of read(`lib/i18n/catalog/${l}.ts`).matchAll(/^ ("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),?$/gm)) w[JSON.parse(m[1])] = JSON.parse(m[2])
  for (const k of keys) if (!w[k] || /—/.test(w[k]) || (k.includes("{name}") && !w[k].includes("{name}"))) missing.push(`${l}: ${k.slice(0, 30)}`)
}
check("every word it shows is in all six catalogs, {name} kept, no em dash", missing.length === 0, missing.slice(0, 5).join("; "))

console.log("\nThe probe")
const probe = read("scripts/check-onepage-northpaper.mjs")
const harness = read("scripts/render-onepage-northpaper.tsx")
check("a new page and a filled one, at 360, 390, 768 and 1280, deviceScaleFactor 2", /"360,390,768,1280"/.test(probe) && /deviceScaleFactor: 2/.test(probe) && /"default,creator"/.test(probe) && /<PublicOnePage/.test(harness) && /blocksAfterPick/.test(harness) && /lookFromTemplate/.test(harness))
check("it measures sideways scroll, AA contrast and 44px tap targets, and shoots the website beside it", /no sideways scroll/.test(probe) && /read at AA/.test(probe) && /44px or more/.test(probe) && /notion-sales-page/.test(probe))
check("these tests are registered", read("scripts/run-push-tests.mjs").includes("tests/onepage-notion-r65.test.ts"))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
