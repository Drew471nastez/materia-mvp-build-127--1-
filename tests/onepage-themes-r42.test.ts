/**
 * ===========================================================================
 *  ROUND 42: THE ONEPAGE EDITOR'S THEMES, PILL ROWS, + ADD, TAB BAR, PHOTO
 * ===========================================================================
 * Pure logic (lib/onepage/theme-layout's product layout and cover, the two
 * new themes' contrast, lib/onepage/photo-save's words) and pins on the
 * editor's source. scripts/check-onepage-editor-r42.mjs measures the same
 * things in headless Chromium.
 *
 * Run with:  npx tsx --conditions=react-server tests/onepage-themes-r42.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { R40_THEMES, R42_THEMES, withR40Themes } from "@/components/onepage/themes/r40-themes"
import { LOOK_RESET, contrastRatio, lookFromTemplate } from "@/lib/onepage/theme-apply"
import { buttonHover } from "@/lib/onepage/button-style"
import { ONEPAGE_FONTS, familyOf } from "@/lib/onepage/fonts"
import { coverImageOf, themeProductLayoutOf, themedProductStyle } from "@/lib/onepage/theme-layout"
import { pairProductTiles, productLayoutOf } from "@/lib/onepage/product-block"
import { SaveError, photoSaveMessage, saveAccountPhoto } from "@/lib/onepage/photo-save"
import { stripComments } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const ratio = (a: string, b: string) => contrastRatio(a, b) ?? 0

async function main() {
  console.log("\nTwo more themes, each its own kind of page")
  check("two themes, new ids", R42_THEMES.length === 2 && R42_THEMES.every((t) => !R40_THEMES.some((o) => o.id === t.id)))
  const design = read("components/onepage/tabs/design-tab.tsx")
  check("no id an older theme has", R42_THEMES.every((t) => !design.includes(`\n    id: "${t.id}",`)))
  const kinds = R42_THEMES.map((t) => `${coverImageOf(t.theme_config) ? "cover" : "plain"}/${themeProductLayoutOf(t.theme_config)}`)
  check("one has a cover picture and products as tiles, the other products as rows", kinds.join() === "cover/grid,plain/rows", kinds.join())
  for (const t of R42_THEMES) {
    const c = t.theme_config as Record<string, any>
    check(`${t.name}: text and bio read at 4.5:1`, ratio(c.background_color, c.text_color) >= 4.5 && ratio(c.background_color, c.secondary_text_color) >= 4.5)
    check(`${t.name}: button words read at 4.5:1, at rest and on hover`, ratio(c.button_color, c.button_text_color) >= 4.5 && ratio(c.button_hover_fill, c.button_hover_text) >= 4.5)
    check(`${t.name}: its own hover colours`, ["fill", "pop"].includes(buttonHover(c as never)))
    check(`${t.name}: fonts the page loads`, [c.font_family, c.title_font].every((f) => Object.prototype.hasOwnProperty.call(ONEPAGE_FONTS, familyOf(f) || "")))
    check(`${t.name}: no violet`, !/#(8b5cf6|7c3aed|a855f7|9333ea|6d28d9)/i.test(JSON.stringify(c)))
    check(`${t.name}: everything it sets beyond the basics is reset by the next theme`, ["product_layout", "cover_image_url", "block_layout", "header_align", "button_hover_fill", "button_hover_text"].filter((k) => k in c).every((k) => k in LOOK_RESET))
  }
  const cover = coverImageOf(R42_THEMES[0].theme_config)!
  check("Folio's cover is the editor's own library photo", /photo-1507400492013-162706c8c05e/.test(cover) && read("lib/onepage/wallpaper-library.ts").includes("photo-1507400492013-162706c8c05e"))
  const merged = withR40Themes([{ id: "a", category: "light" }, { id: "c", category: "dark" }])
  /* Changed on purpose (round AP): Notebook and Cobalt join after them, in their own kinds. */
  check("Folio joins the light themes and Ledger the dark", merged.map((t) => t.id).join(",") === "a,gallery,swiss,folio,notebook,gazette,lagoon,cobalt,halo,c,ember,ledger,acid,atlas" /* Changed on purpose (round W8): Gazette, Halo and Acid. */, merged.map((t) => t.id).join(","))
  const page = { id: "p", theme: { template_id: "folio", ...R42_THEMES[0].theme_config }, settings: {}, draft_blocks: [] } as never
  const after = lookFromTemplate(page, { id: "air", category: "light", theme_config: { background_color: "#eef0f3" } }).theme as unknown as Record<string, unknown>
  check("from Folio to a theme that names neither, no cover and products as each block has them", after.cover_image_url === null && after.product_layout === null)

  console.log("\nA theme shows products its own way, and what a person picked stays")
  check("missing, or anything unknown, is each block's own", themeProductLayoutOf({}) === "own" && themeProductLayoutOf(null) === "own" && themeProductLayoutOf({ product_layout: "x" }) === "own")
  check("an existing page is drawn exactly as before", productLayoutOf({ style: "callout" }, {}) === "callout" && productLayoutOf({ style: "side" } as never, { block_layout: "grid" } as never) === "side")
  check("Grid draws a block left as the Callout as a tile, Rows as a row", productLayoutOf({ style: "callout" }, { product_layout: "grid" }) === "tile" && productLayoutOf({ style: "callout" }, { product_layout: "rows" }) === "row")
  check("a block with no layout saved follows the theme too", themedProductStyle({ product_layout: "rows" }, {}) === "row")
  check("a layout the block chose stays", productLayoutOf({ style: "overlay" } as never, { product_layout: "grid" }) === "overlay")
  check("the Callout picked by hand stays the Callout", productLayoutOf({ style: "callout", style_chosen: true } as never, { product_layout: "grid" }) === "callout")
  const P = (id: string, style = "callout") => ({ id, type: "product", data: { style } })
  const shape = (xs: unknown[]) => xs.map((x) => ("tiles" in (x as object) ? `[${(x as { tiles: { id: string }[] }).tiles.map((t) => t.id).join("")}]` : (x as { id: string }).id)).join(" ")
  const blocks = [P("a"), P("b"), P("c"), { id: "t", type: "text", data: {} }, P("d", "side")]
  check("on Grid, callouts pair two to a row", shape(pairProductTiles(blocks, { product_layout: "grid" })) === "[ab] [c] t d", shape(pairProductTiles(blocks, { product_layout: "grid" })))
  check("without a theme's say, nothing pairs", shape(pairProductTiles(blocks)) === "a b c t d" && shape(pairProductTiles(blocks, {})) === "a b c t d")

  console.log("\nThe cover picture")
  check("an https address is a cover", coverImageOf({ cover_image_url: "https://images.unsplash.com/photo-1?w=1" }) === "https://images.unsplash.com/photo-1?w=1")
  check("nothing, or anything else, is no cover", coverImageOf({}) === null && coverImageOf({ cover_image_url: "javascript:alert(1)" }) === null && coverImageOf({ cover_image_url: "http://x.com/a.jpg" }) === null && coverImageOf({ cover_image_url: "https://x.com/a.jpg\" onerror=" }) === null)
  check("a Hero header is already a picture: no cover over it", coverImageOf({ cover_image_url: "https://x.com/a.jpg", header_layout: "hero" }) === null)
  const live = stripComments(read("components/onepage/public-onepage.tsx"))
  check("the classic header draws it, the round photo pulled over its edge", /const cover = coverImageOf\(theme\)/.test(live) && /data-cover-image=""/.test(live) && /mb-\[calc\(-1\*var\(--cover-pull\)-0\.75rem\)\] sm:mb-\[calc\(-1\*var\(--cover-pull\)-1rem\)\]/.test(live))
  check("the page starts at the very top under a cover, as under a Hero", /heroHeaderShown\(safeTheme, \{ avatar_url, avatar_video_url \}\) \|\| coverImageOf\(safeTheme\) \? "0" : "50px"/.test(live))
  check("the page pairs products with its theme", /pairProductTiles\(safeBlocks[\s\S]{0,300}, safeTheme\), blockLayoutOf\(safeTheme\)\)/.test(live) && /productLayoutOf\(data, theme\)/.test(read("components/onepage/product-block.tsx")))
  const links = read("components/onepage/tabs/links-tab.tsx")
  check("a layout picked on the block is marked as picked, and the picker shows what the page draws", /updateData\(\{ style: styleId, style_chosen: true, button_style: "filled" \}\)/.test(links) && /<ProductLayoutPicker data=\{data\} theme=\{onepage\?\.theme\}/.test(links))
  const layout = read("components/onepage/themes/layout-section.tsx")
  check("Design › Layout sets how products show and takes a cover off", /value=\{themeProductLayoutOf\(t\)\}/.test(layout) && /updateTheme\(\{ cover_image_url: null \} as never\)/.test(layout))

  console.log("\nThe pill rows are one row each, with arrows")
  const pills = read("components/onepage/pill-tabs.tsx")
  check("PillTabs scrolls through the toolbars' ScrollRow (fades and arrows)", /import \{ ScrollRow \} from "@\/components\/app\/rich-text\/scroll-row"/.test(pills) && /<ScrollRow ref=\{rowRef\} role="tablist"/.test(pills))
  check("a pressed pill is scrolled clear of the arrow, smoothly", /const room = hasArrows \? 44 : 24/.test(pills) && /behavior: instant \|\| reducedMotion\(\) \? "auto" : "smooth"/.test(pills))
  const rows = [["components/onepage/tabs/settings-tab.tsx", 1], ["components/onepage/tabs/design-tab.tsx", 2], ["components/onepage/icon-library.tsx", 1], ["components/onepage/add-block-picker.tsx", 1]] as const
  check("Settings, the theme kinds, the font kinds, the icon and the block categories all scroll so", rows.every(([f, n]) => (read(f).match(/scroll=\{\{ wrapClassName: /g) ?? []).length === n))
  check("Settings never wraps to a second row", !/md:flex-wrap/.test(read("components/onepage/tabs/settings-tab.tsx")))

  console.log("\n+ Add and the phone's tab bar")
  const plus = read("components/onepage/add-block-picker.tsx")
  check("the + turns 45 degrees while its sheet is up, for every pointer", /open \? "rotate-45" : "rotate-0"/.test(plus) && /transition-\[rotate\] duration-\[280ms\]/.test(plus))
  check("a haptic tick in the apps only", /if \(isNativeApp\(\)\) hapticTap\("light"\)/.test(plus))
  const editor = read("components/onepage/onepage-editor.tsx")
  const bar = editor.slice(editor.indexOf('data-onepage-tabbar=""'), editor.indexOf("<ShareOnePage"))
  check("each tab has one icon and one word, whose colour turns", /data-tab-ink=""/.test(bar) && !/<TabFace/.test(bar) && /transition-\[color\]/.test(bar))
  check("the dark fill keeps its layer, so nothing is lifted on and off during a switch", /transition-opacity ease-out will-change-\[opacity\]/.test(bar))
  check("the word sits on a whole pixel line", /h-\[15px\] max-w-full truncate text-center leading-\[15px\]/.test(bar))
  check("the press paints the same colour the render does", /ink\.style\.color = on \? PHONE_TAB_INK_ON : PHONE_TAB_INK_OFF/.test(editor))

  console.log("\nThe profile photo says why it did not save")
  check("the route's own words", photoSaveMessage(409, { error: "The photo did not save. Reload the page and try again." }).includes("Reload the page"))
  check("a status with no words", photoSaveMessage(401, null).includes("session ended") && photoSaveMessage(503, {}).includes("(503)"))
  let caught: unknown = null
  try { await saveAccountPhoto("https://x/a.jpg", async () => { throw new TypeError("Failed to fetch") }) } catch (e) { caught = e }
  check("no answer at all is a SaveError about the connection", caught instanceof SaveError && /connection/.test((caught as Error).message))
  caught = null
  try { await saveAccountPhoto("https://x/a.jpg", async () => ({ ok: false, status: 400, json: async () => ({ error: "That photo is not in your folder." }) })) } catch (e) { caught = e }
  check("a refusal is a SaveError with the route's words and status", caught instanceof SaveError && (caught as SaveError).status === 400 && /not in your folder/.test((caught as Error).message))
  let ok = true
  try { await saveAccountPhoto("https://x/a.jpg", async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) })) } catch { ok = false }
  check("a save returns quietly", ok)
  const crop = read("components/onepage/crop-upload.tsx")
  check("the crop sheet shows a SaveError's words", /err instanceof SaveError \? err\.message :/.test(crop))
  check("both photo sheets save through it", /await saveAccountPhoto\(result\.url\)/.test(links) && /await saveAccountPhoto\(url\)/.test(design))
  check("a database refusal carries its code", /const code = error\.code \? ` \(\$\{error\.code\}\)` : ""/.test(read("lib/account/avatar-save.ts")))
  check("Settings › Integrations reads only an answer of the right shape", /Array\.isArray\(raw\.integrations\)/.test(read("components/onepage/page-integrations.tsx")))
  const sql = read("supabase/sql/onepage-last-14-days.sql")
  const included = [...sql.matchAll(/\/\* ── Part ([0-9a-z_]+)\.sql/g)].map((m) => m[1])
  check("one SQL file with every OnePage part, 90 and 91 last", included.length >= 15 && included.includes("282_onepage_media_uploads") && included.includes("324_onepage_integration_sends") && included.slice(-2).join() === "90_storage_policies_needs_owner,91_storage_policies_to_remove", included.join(" "))
  check("each part is the run-now file as it is", included.every((p) => sql.includes(read(`supabase/sql/run-now/${p}.sql`))))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
