/**
 * ===========================================================================
 *  ROUND W9 (opblocks): THE ROW'S OWN BIN, THEMES THAT REACH EVERY SHEET AND
 *  BLOCK, AND BLOCK LAYOUTS THAT EACH LOOK LIKE THEMSELVES
 * ===========================================================================
 * The owner:
 *   A  "The delete icon should be as well as an icon in the block there (next to
 *      animations/icon controls), not only from the menu."
 *   B  "Ensure the themes, all the themes, apply very well ... actually apply the
 *      theme to things in the OnePage."
 *   C  "Ensure the Blocks layout options List, Grid, Cards, Compact, Mixed tiles
 *      work 100%, because some of them don't control."
 *
 * In a browser (every theme, every layout, the sheets, the delete's frames):
 * scripts/check-onepage-blocks-w9.mjs over scripts/render-onepage-blocks-w9.tsx.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { AP_THEMES, R40_THEMES, R42_THEMES, W8_THEMES } from "@/components/onepage/themes/r40-themes"
import { sheetTokens } from "@/components/onepage/onepage-dialog"
import { contrastRatio, lookFromTemplate, PRESENTATION_COLOUR_FIELDS, withoutOwnColours, type ThemeTemplateLike } from "@/lib/onepage/theme-apply"
import { cssFontStack, sheetPalette, sheetRootCss } from "@/lib/onepage/sheet-theme"
import { mixedTileSizes, pairLinkTiles } from "@/lib/onepage/theme-layout"
import { ROW_COLLAPSE_MS, rowCollapseFrames } from "@/lib/onepage/row-collapse"

let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  ok   ${name}`)
  else {
    failed++
    console.log(`  FAIL ${name}${detail !== undefined ? ` (${typeof detail === "string" ? detail : JSON.stringify(detail)})` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/* ─── C. Block layouts ───────────────────────────────────────────────── */
console.log("\nC. Mixed tiles: pairs and full rows taking turns, never a half alone, never a featured card halved")
{
  const link = (id: string, extra: Record<string, unknown> = {}) => ({ id, type: "link_button", data: { label: id, url: `https://example.com/${id}`, ...extra } })
  const run = (n: number) => Array.from({ length: n }, (_, i) => link(`l${i + 1}`))
  const shape = (n: number) => { const m = mixedTileSizes(run(n), "masonry"); return run(n).map((b) => (m.get(b.id) === "half" ? "h" : "F")).join("") }
  const want: Record<number, string> = { 1: "F", 2: "hh", 3: "hhF", 4: "FhhF", 5: "hhFhh", 6: "FhhFhh", 7: "FhhFhhF", 8: "hhFhhFhh", 9: "hhFhhFhhF" }
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) check(`${n} plain links: ${want[n]}`, shape(n) === want[n], shape(n))
  for (let n = 1; n <= 12; n++) {
    const s = shape(n)
    check(`${n} links: halves always come in pairs, never two full rows together`, s.split("F").every((part) => part.length % 2 === 0) && !s.includes("FF"), s)
  }
  check("an even run of four or more is not the Grid's pairs only", [4, 6, 8, 10].every((n) => shape(n).includes("F")))
  const page = [link("a"), link("b"), link("pro", { layout_type: "pro", thumbnail_url: "https://x/p.png" }), link("c"), { id: "t", type: "text", data: {} }, link("d"), link("e"), { ...link("sized"), style: { presentation: { size: "tall" } } }]
  const m = mixedTileSizes(page, "masonry")
  check("a featured card is never laid out by Mixed tiles (it keeps its full row)", !m.has("pro"))
  check("a size picked on the block always wins", !m.has("sized"))
  check("a lone plain link between other blocks is a full row", m.get("c") === "full")
  check("a run is broken by any other block", m.get("a") === "half" && m.get("b") === "half" && m.get("d") === "half" && m.get("e") === "half")
  check("other layouts lay nothing out", mixedTileSizes(page, "list").size === 0 && mixedTileSizes(page, "grid").size === 0)
  check("the Grid's pairs are unchanged", pairLinkTiles(run(3), "grid").length === 2)
  const live = code("components/onepage/public-onepage.tsx")
  check("the page reads Mixed tiles from mixedTileSizes, not every link a half", /mixedTileSizes\(laid, blockLayoutOf\(safeTheme\)\)/.test(live) && /mixedSizes\.get\(block\.id\) \|\| "full"/.test(live) && !/=== "masonry" && block\.type === "link_button" \? "half"/.test(live))
  const css = read("app/globals.css")
  check("Cards draws every plain link as a card, taller and heavier", /\[data-block-layout="cards"\] > \[data-op-block\] \.op-btn\[data-size\] \{ min-height: 80px;/.test(css) && /\[data-block-layout="cards"\] > \[data-op-block\] \.op-btn\[data-size\] \.op-label \{ font-size: 1\.07em; font-weight: 600; \}/.test(css))
  check("Cards follows Size too", /\[data-block-layout="cards"\] > \[data-op-block\] \.op-btn\[data-size="compact"\]/.test(css) && /\[data-block-layout="cards"\] > \[data-op-block\] \.op-btn\[data-size="large"\]/.test(css))
  check("Mixed tiles is translated in Design › Layout", /masonry: \(\) => tt\("Mixed tiles"\)/.test(read("components/onepage/themes/layout-section.tsx")))
  const cards = read("components/onepage/themes/theme-card-blocks.tsx")
  check("the layout samples draw Mixed tiles as the page does (row, pair, row), not tall tiles", /data-theme-card-layout="masonry"/.test(cards) && !/row-span-2/.test(cards))
}

/* ─── B. Themes reach every sheet and every block ─────────────────────── */
console.log("\nB. The block sheets wear the page's sheet palette and typeface")
{
  const plain = sheetTokens(false) as Record<string, string>
  const themed = sheetTokens(false, true) as Record<string, string>
  const dark = sheetTokens(true, true) as Record<string, string>
  check("without a page, a sheet is as it was", plain["--sheet-bg"] === "#ffffff" && !("fontFamily" in plain))
  check("on a page, every colour is the page's palette, falling back to the plain one", themed["--sheet-bg"] === "var(--opk-surface, #ffffff)" && themed["--sheet-ink"] === "var(--opk-ink, #1a1a2e)" && themed["--sheet-muted"].startsWith("var(--opk-muted,") && themed["--sheet-field"].startsWith("var(--opk-raised,") && themed["--sheet-rule"].startsWith("var(--opk-line,") && dark["--sheet-bg"] === "var(--opk-surface, #18181c)")
  check("the button's words read on the ink: the surface", themed["--sheet-on-ink"] === "var(--opk-surface, #ffffff)")
  check("and the legal text follows", themed["--legal-ink"] === themed["--sheet-ink"] && themed["--legal-panel"] === themed["--sheet-field"])
  check("in the page's typeface", themed.fontFamily === "var(--opk-font, inherit)" && /color-scheme|opk-scheme/.test(String(themed.colorScheme)))
  check("the block sheet and every OnePage dialog (Subscribe, Share, Privacy) ask for it", /sheetTokens\(dark, true\)/.test(read("components/onepage/block-sheet.tsx")) && /const style = sheetTokens\(dark, true\)/.test(read("components/onepage/onepage-dialog.tsx")))
  check("the product sheet and checkout window take the typeface too", /:where\(\.op-sheet\) \{ font-family: var\(--opk-font, inherit\); \}/.test(read("app/globals.css")))

  const css = sheetRootCss({ background_color: "#f2eee3", text_color: "#15130f", font_family: "'Merriweather', serif", title_font: "'Alfa Slab One', serif" })
  check("the variables carry the typefaces", css.includes("--opk-font:'Merriweather', serif;") && css.includes("--opk-title-font:'Alfa Slab One', serif;"))
  check("still one :root rule ending on the scrollbar", /^:root\{--opk-surface:#[0-9a-f]{6};.*--op-scroll-thumb:#[0-9a-f]{6}\}$/.test(css))
  check("a font that could break out of the rule is no font", cssFontStack("x}body{display:none") === null && cssFontStack("'Inter', sans-serif") === "'Inter', sans-serif" && !sheetRootCss({ font_family: "a;}<x>" }).includes("--opk-font"))

  const all = [...R40_THEMES, ...R42_THEMES, ...AP_THEMES, ...W8_THEMES].map((t) => t.theme_config as Record<string, unknown>)
  for (const t of all) {
    const p = sheetPalette(t as never)
    const body = /--opk-body:(#[0-9a-f]{6})/.exec(sheetRootCss(t as never))?.[1] ?? ""
    check(`${t.background_color}: words, body, small print and button read at 4.5:1`, (contrastRatio(p.surface, p.ink) ?? 0) >= 4.5 && (contrastRatio(p.surface, body) ?? 0) >= 4.5 && (contrastRatio(p.surface, p.muted) ?? 0) >= 4.5 && (contrastRatio(p.raised, p.ink) ?? 0) >= 4.5 && (contrastRatio(p.accent, p.accentInk) ?? 0) >= 4.5)
  }
  const gazette = sheetPalette({ background_color: "#f2eee3", text_color: "#15130f" })
  check("a light page's window keeps its own tint (Gazette's cream, not white)", gazette.surface !== "#ffffff" && (contrastRatio(gazette.surface, "#ffffff") ?? 1) > 1.04, gazette.surface)
}

console.log("\nB. Picking a theme takes every colour a block holds of its own, a group's blocks too")
{
  const presentation = { size: "half", radius: 18, background: "#111111", gradient_from: "#000", gradient_to: "#333", title_color: "#ffffff", subtitle_color: "#eeeeee", icon_color: "#ff0000" }
  const link = { id: "l", type: "link_button", enabled: true, sort_order: 0, data: { label: "x", url: "https://x" }, style: { presentation } }
  const out = withoutOwnColours(link as never) as unknown as { style: { presentation: Record<string, unknown> } }
  check("every colour of the block's own Layout is taken off", PRESENTATION_COLOUR_FIELDS.every((f) => !(f in out.style.presentation)))
  check("its size and shape stay", out.style.presentation.size === "half" && out.style.presentation.radius === 18)
  const plainLink = { ...link, style: { presentation: { size: "half" } } }
  check("a block with no colours of its own is the same block", withoutOwnColours(plainLink as never) === (plainLink as never))
  const product = { id: "p", type: "product", enabled: true, sort_order: 1, data: { product_id: "x", block_background_color: "#111111", text_color: "#ffffff" } }
  const group = { id: "g", type: "group", enabled: true, sort_order: 2, data: { title: "G", children: [link, product] } }
  const g = withoutOwnColours(group as never) as unknown as { data: { children: { data: Record<string, unknown>; style?: { presentation: Record<string, unknown> } }[] } }
  check("a group's blocks lose theirs too", g.data.children[1].data.block_background_color === null && !("background" in (g.data.children[0].style?.presentation ?? {})))
  const template: ThemeTemplateLike = { id: "gazette", category: "light", theme_config: W8_THEMES[0].theme_config as Record<string, unknown> }
  const page = lookFromTemplate({ id: "p", theme: {}, settings: {}, draft_blocks: [link, product, group] } as never, template)
  const blocks = page.draft_blocks as unknown as { style?: { presentation?: Record<string, unknown> }; data: Record<string, unknown> }[]
  check("lookFromTemplate clears them across the page", !("background" in (blocks[0].style?.presentation ?? {})) && blocks[1].data.text_color === null)
  const onboarding = code("components/onepage/onboarding-modal.tsx")
  check("the onboarding picks a theme the way Design › Themes does (lookFromTemplate)", /applyThemeLook\(template as never,/.test(onboarding) && !/updateTheme\(\{\s*\.\.\.template\.theme_config/.test(onboarding))
}

console.log("\nB. Words in the page's typeface, fields that show on any ground")
{
  const promo = code("components/onepage/storelib-blocks.tsx")
  check("the promo code's Copy is in the page's typeface (no font-sans), the code in a fixed width one", /<span className="truncate font-mono tracking-\[0\.06em\]">\{code\}<\/span>/.test(promo) && !/font-sans font-medium tracking-normal/.test(promo))
  const contact = code("components/onepage/creator-blocks.tsx")
  check("a Contact field has a hairline, so it shows on a light sheet", /boxShadow: "inset 0 0 0 1px rgba\(0,0,0,0\.14\)"/.test(contact))
}

/* ─── A. The row's own bin ───────────────────────────────────────────── */
console.log("\nA. A bin on every block's row, Delete still in the more menu, the row folding away")
{
  const remove = code("components/onepage/block-remove.tsx")
  const tab = code("components/onepage/tabs/links-tab.tsx")
  /* Changed on purpose (wave 10, legible): the owner found the gaps between the row's tools too wide and uneven. Every key is 28px at both widths (the bin too), the numbers end on their icon, the switch carries the same room each side; tests/onepage-legible-w10.test.ts pins the equal gaps. */
  check("the bin: always drawn, a 28px key whose press reaches 44px tall", /export const BlockRowDelete = /.test(remove) && /data-block-row-delete=""/.test(remove) && /before:-inset-y-1\.5/.test(remove) && /compact \? "h-7 w-7" : "h-8 w-7"/.test(remove) && !/opacity-0[^"]*group-hover/.test(remove.slice(remove.indexOf("BlockRowDelete"), remove.indexOf("BlockRowDeleteSlot"))))
  check("named for the block it removes", /aria-label=\{tt\("Remove \{name\}", \{ name \}\)\}/.test(remove))
  check("on every page row, in the tools beside the sparkle and the numbers, before the switch", /<BlockRowDelete\s+ref=\{binRef\}[\s\S]{0,400}<BlockRowDeleteSlot \/>[\s\S]{0,260}<BlockToggle checked=\{block\.enabled\}/.test(tab))
  check("the header keeps the bin's room, so its switch lines up", /export function BlockRowDeleteSlot\(\)[\s\S]{0,200}h-8 w-7 shrink-0" data-row-slot="delete"/.test(remove))
  check("on a group's rows too", /<BlockRowDelete compact name=\{preview\.title\}/.test(tab))
  check("it asks the same question as the menu's Remove", /askedFrom\.current = "bin"\s+setAskingRemove\(\(v\) => !v\)/.test(tab) && /askedFrom\.current = "menu"\s+setAskingRemove\(true\)/.test(tab) && /<BlockRemoveQuestion\s+open=\{askingRemove\}/.test(tab))
  check("focus goes back to whichever asked", /returnFocus=\{askedFrom\.current === "bin" \? binRef : menuRef\}/.test(tab))
  check("the more menu still holds Remove", /id: "block-remove", label: tt\("Remove"\)/.test(remove))
  /* Changed on purpose (round AR): a top-level row folds through foldThen (components/onepage/leaving-block foldAway), the same fold round AR measured, with the preview folding the block too; a group's child still uses collapseRow. */
  check("Delete and Archive fold the row first, then take the block off", /onRemove=\{\(\) => foldThen\(block\.id, \(\) => \{ removeBlock\(block\.id\)/.test(tab) && /onArchive=\{\(\) => foldThen\(block\.id, \(\) => \{ archiveBlock\(block\.id\)/.test(tab) && /onRemove=\{\(\) => collapseRow\(document\.querySelector\(`\[data-group-child-item=/.test(tab))
  check("in 200ms or less", ROW_COLLAPSE_MS > 0 && ROW_COLLAPSE_MS <= 200)
  const f = rowCollapseFrames(72.4, 16)
  check("height to nothing, a fade, and the space after it eaten", f[0].height === "72.4px" && f[1].height === "0px" && f[1].opacity === 0 && f[1].marginBottom === "-16px")
  const last = rowCollapseFrames(60, 16, "before")
  check("the last row eats the space before it", last[1].marginTop === "-16px" && !("marginBottom" in last[1]))
  const collapse = code("lib/onepage/row-collapse.ts")
  check("reduced motion takes it off at once, and done is called exactly once", /prefers-reduced-motion: reduce/.test(collapse) && /if \(called\) return/.test(collapse) && /window\.setTimeout\(finish, ROW_COLLAPSE_MS \+ 150\)/.test(collapse))
  check("on a phone the row is a step tighter, so the bin costs a title nothing", /"group\/row flex items-center gap-2 p-3 sm:gap-3/.test(tab) && /flex h-8 w-7 shrink-0 flex-row-reverse items-center[^"]*sm:w-14/.test(tab))
}

console.log("\nRegistered")
check("this suite runs with the push tests", read("scripts/run-push-tests.mjs").includes("tests/onepage-blocks-w9.test.ts"))

if (failed) {
  console.log(`\n${failed} failed`)
  process.exit(1)
}
console.log("\nall passed")
