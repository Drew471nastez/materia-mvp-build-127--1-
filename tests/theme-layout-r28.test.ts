/**
 * Materia layout, every template (round 28). Each check guards a class of
 * problem the owner reported on one template, fixed in the base so it does
 * not happen on any:
 *
 *   GALLERY    one picture in "Grid, two columns" fills the gallery column
 *              (Redline drew it in the left half with an empty half beside
 *              it), and a sticky column never starts lower than the details
 *              beside it when its gap is larger than the space above it.
 *   PRICE      the price is never much smaller than the title (a floor of
 *              55% of the title, at least 18px on phones and 20px on
 *              computers, in the theme's text scale); the rating reads at
 *              least 14px. The live editor prints the same rules.
 *   ROWS       product rows under a product draw the theme's product-item
 *              card with the section's widths; a gap under 4px takes the
 *              theme's card gap; a Full width row keeps the page's side
 *              padding (the cards and their buttons ran edge to edge).
 *   STICKY     the sticky add to cart bar's row keeps the side padding at
 *              every width and section width, and its parts may shrink.
 *   FAQ        a bordered FAQ list has room inside its border.
 *   BLOG       a picture fills its ratio frame (a 16:9 cover sat at the top
 *              of a 4:3 card with an empty band under it).
 *   FLAGS      Storelib's emoji flag pictures fill their circle, centred.
 *   MENUS      dropdowns and mega menus open and close in about 220ms with
 *              their contents as one piece, on the header scheme's own
 *              background; the phone menu drawer slides in 300ms.
 *
 * Measured in Chromium on every template's preview by
 * scripts/check-theme-layout-r28.mjs (gallery fill and alignment, sizes,
 * rows, the sticky bar, FAQ insets, blog frames, flags, the menus' frames).
 *
 *   npx tsx tests/theme-layout-r28.test.ts
 */
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 600)}` : ""}`) }
}

const BASE = join(process.cwd(), "theme-packages", "materia", "base")
const TEMPLATES = join(process.cwd(), "theme-packages", "materia", "templates")
const read = (p: string) => readFileSync(join(BASE, p), "utf8")
const json = (p: string) => JSON.parse(readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")) as { sections?: Record<string, { type: string; settings?: Record<string, unknown>; blocks?: Record<string, { type: string; settings?: Record<string, unknown> }> }> }
const folders = readdirSync(TEMPLATES).filter((d) => existsSync(join(TEMPLATES, d, "templates")))

console.log("\nGALLERY")
const gallery = read("snippets/media-gallery.liquid")
check("Grid, two columns with one picture draws one column", /desktop_layout == 'grid_1_column' or images\.size == 1 -%\}--col-number: \{\{ mg_per_view \}\};--col-desktop: 1;--col-tablet: 1;/.test(gallery))
const mainProduct = read("sections/main-product.liquid")
check("a sticky column's top is capped at where it starts on the page", /var home = starts\.get\(el\);\s*if \(home != null && top > home\) top = home;/.test(mainProduct))
check("where a column starts is read once per refresh, not per frame", /function refresh\(\) \{\s*if \(!stickyOn\) return;\s*tag\(\);\s*measureStarts\(\);/.test(mainProduct) && !/function loop\(\)[^}]*measureStarts/.test(mainProduct))

console.log("\nPRICE AND RATING")
const blocks = read("snippets/product-info-blocks.liquid")
const priceBlock = blocks.slice(blocks.indexOf("{%- when 'price' -%}"), blocks.indexOf("{%- when 'buy_buttons' -%}"))
check("the price has a floor of 55% of the title (18px phones, 20px computers)", /pf_title_m \| times: 0\.55 \| round \| at_least: 18/.test(priceBlock) && /pf_title_d \| times: 0\.55 \| round \| at_least: 20/.test(priceBlock))
check("the floor is in the theme's text scale", /--mp-price-floor-m: calc\(\{\{ pf_floor_m \}\}px \* var\(--sl-text-scale, 1\)\)/.test(priceBlock) && /--mp-price-floor-d: calc\(\{\{ pf_floor_d \}\}px \* var\(--sl-text-scale, 1\)\)/.test(priceBlock))
check("phone and computer price rules both use the floor", /max\(\{\{ block_st\.price_font_size_mobile \| default: 18 \}\}px, var\(--mp-price-floor-m, 0px\)\) !important/.test(priceBlock) && /max\(\{\{ block_st\.price_font_size_desktop \| default: 20 \}\}px, var\(--mp-price-floor-d, 0px\)\) !important/.test(priceBlock))
const liveMain = read("assets/live-main-product.js")
check("the live editor prints the same price rules", liveMain.includes("max(${num(s.price_font_size_mobile, 18)}px, var(--mp-price-floor-m, 0px))") && liveMain.includes("max(${num(s.price_font_size_desktop, 20)}px, var(--mp-price-floor-d, 0px))"))
check("the rating is at least 14px in the text scale", read("snippets/review-sold-block.liquid").includes("--rs-size-m:max(calc(14px * var(--sl-text-scale, 1)), calc(var(--body-font-size,16px) * .94))"))
// What every template's product page draws, by the same rule.
const tooSmall: string[] = []
for (const f of folders) {
  const p = join(TEMPLATES, f, "templates", "product.json")
  if (!existsSync(p)) continue
  const main = Object.values(json(p).sections ?? {}).find((s) => s.type === "main-product")
  const bl = Object.values(main?.blocks ?? {})
  const title = bl.find((b) => b.type === "title")?.settings ?? {}
  const price = bl.find((b) => b.type === "price")?.settings
  if (!price) continue
  const tm = Number(title.title_font_size_mobile ?? 20), td = Number(title.title_font_size_desktop ?? 24)
  const pm = Math.max(Number(price.price_font_size_mobile ?? 18), Math.max(18, Math.round(tm * 0.55)))
  const pd = Math.max(Number(price.price_font_size_desktop ?? 20), Math.max(20, Math.round(td * 0.55)))
  if (pm / tm < 0.5 || pd / td < 0.5) tooSmall.push(`${f}: ${pm}/${tm}, ${pd}/${td}`)
}
check("every template's price is at least half its title on phones and computers", tooSmall.length === 0, tooSmall)

console.log("\nPRODUCT ROWS")
const related = read("sections/related-products.liquid")
const renders = [...related.matchAll(/\{% render 'product-item',([\s\S]*?)%\}/g)].map((m) => m[1])
check("related products draw the theme's product-item card (three ways)", renders.length === 3)
check("each with the section's width, columns and gap (the card's own sizes)", renders.every((r) => /container: section_width/.test(r) && /colunm: items_per_row,/.test(r) && /colunm_mobile: items_per_row_mobile/.test(r) && /padding: column_gap/.test(r)))
check("a gap under 4px takes the theme's card gap", /\{% if column_gap < 4 %\}--col-gap: var\(--grid-gap, 12px\);--col-gap-desktop: var\(--grid-gap, 20px\);/.test(related))
check("the heading is not inset on its own (the row and heading share the padding)", !/full_width' %\} px-20/.test(related))
const liveExtras = read("assets/live-product-extras.js")
check("the live editor draws the same gap and heading", liveExtras.includes("g < 4 ? 'var(--grid-gap, 12px)'") && liveExtras.includes("[header, 'cls:px-20', false]"))
check("recently viewed: a gap under 4px takes the theme's card gap", /\{% if rv_gap < 4 %\}--rv-gap: var\(--grid-gap, 20px\);--rv-gap-m: var\(--grid-gap, 12px\);/.test(read("sections/recently-viewed.liquid")))
const fullRow = /\[data-rp-width\]\.full_width,\s*\.r7k-inner\.full_width \{\s*padding-inline: var\(--container-gutter, 20px\);/
check("Full width rows keep the page's side padding (source and bundle)", fullRow.test(read("assets/product-card.css")) && /\[data-rp-width\]\.full_width,\.r7k-inner\.full_width\{padding-inline:var\(--container-gutter, ?20px\);?\}|\[data-rp-width\]\.full_width,\s*\.r7k-inner\.full_width \{/.test(read("assets/base.css")))
const zeroGap: string[] = []
for (const f of folders) {
  for (const file of readdirSync(join(TEMPLATES, f, "templates")).filter((x) => x.endsWith(".json"))) {
    for (const [id, s] of Object.entries(json(join(TEMPLATES, f, "templates", file)).sections ?? {})) {
      if (!["related-products", "recently-viewed"].includes(s.type)) continue
      const g = Number(s.settings?.column_gap ?? (s.type === "recently-viewed" ? 0 : 30))
      if (g < 4) zeroGap.push(`${f}/${file} ${id} gap ${g} (drawn with the theme gap)`)
    }
  }
}
console.log(`        rows drawn with the theme's gap: ${zeroGap.length ? zeroGap.join("; ") : "none"}`)

console.log("\nSTICKY ADD TO CART")
const mpCss = read("assets/main-product.css")
check("the bar's row keeps 16 to 40px side padding at every section width", /sticky-add-cart > div \{[^}]*padding-inline: clamp\(16px, var\(--container-gutter, 20px\), 40px\) !important;/.test(mpCss))
check("a Full width bar is not capped by a container width", /sticky-add-cart > :is\(\.full_width, \.stretch_width\) \{ max-width: none; \}/.test(mpCss))
check("its parts shrink instead of pushing the button off screen", /sticky-add-cart \.sticky__item-info,\s*sticky-add-cart \.sticky__item-info > \* \{ min-width: 0; \}/.test(mpCss) && /sticky-add-cart \.product-form__submit \{ max-width: 100%; overflow: hidden; \}/.test(mpCss))

console.log("\nFAQ")
check("FAQ 6 (side image): at least 16px inside its bordered list", read("sections/faq-side-image.liquid").includes("--fsi-px:max({{ st.item_padding_x | default: 24 }}px, 16px);"))
check("and the live editor prints the same", read("assets/live-faq.js").includes("put(root, '--fsi-px', 'max(' + px(s.item_padding_x, 24) + ', 16px)');"))

console.log("\nBLOG")
const guard = read("assets/layout-guard.css")
check("a picture laid over a ratio frame fills it (after the height: auto guard)", guard.indexOf(":where([style*='--aspect-ratio'] > img:is(:first-child, .secondary-image)) { height: 100%; }") > guard.indexOf(":where(img[width][height]) { height: auto; }"))
check("the bundle has it too", read("assets/base.css").includes(":where([style*='--aspect-ratio'] > img:is(:first-child, .secondary-image)) { height: 100%; }") || read("assets/base.css").includes(":where([style*='--aspect-ratio'] > img:is(:first-child, .secondary-image)){height:100%}"))

console.log("\nFLAGS")
const loc = read("assets/localization-controls.css")
const flagRule = /\.localization-flags img\[src\^="data:image\/svg\+xml"\] \{([^}]*)\}/.exec(loc)?.[1] ?? ""
const pct = (k: string) => Number(new RegExp(`${k}: (-?[\\d.]+)%`).exec(flagRule)?.[1])
// The engine's flag: the emoji at x 16, baseline 19, 20 units, in a 32 by 24 picture
// (lib/storelib-theme/compat/objects.ts flagImage); its glyph measured 4.4..27.6 by 3.5..20.8.
const W = pct("width"), H = pct("height"), L = pct("left"), T = pct("top")
const cx = L + (16 / 32) * W, cy = T + (12.15 / 24) * H
check("the flag picture keeps its 4:3 shape", Math.abs(W / H - 32 / 24) < 0.01, { W, H })
check("the glyph's centre is the circle's centre (within 1%)", Math.abs(cx - 50) <= 1 && Math.abs(cy - 50) <= 1, { cx, cy })
const unit = W / 32 // % of the circle per flag unit
check("the flag's own area, without its wavy edge, covers the circle", (27.6 - 4.4 - 4) * unit >= 100 && (20.8 - 3.5 - 4) * unit >= 100, { unit })
const objects = readFileSync(join(process.cwd(), "lib", "storelib-theme", "compat", "objects.ts"), "utf8")
check("the engine's flag picture is still the one measured", objects.includes('x="16" y="19" font-size="20" text-anchor="middle"'))

console.log("\nMENUS")
const nav = read("assets/navigation.css")
check("no staggered fade of the links and pictures inside a dropdown", !/menu-parent\.visible > \.submenu :is\(\.subchildmenu > li[^{]*\{[^}]*transition-delay/.test(nav))
const header = read("sections/header.liquid")
const speed = /"id": "dropdowns_speed",[\s\S]*?"default": (\d+)/.exec(header)?.[1]
check("dropdowns open and close in 220ms by default (schema and Liquid)", speed === "220" && header.includes("assign dd_speed = section_st.dropdowns_speed | default: 220"))
const noSpeed = folders.filter((f) => existsSync(join(TEMPLATES, f, "sections", "header-group.json")) && Object.values(json(join(TEMPLATES, f, "sections", "header-group.json")).sections ?? {}).some((s) => s.type === "header" && Number(s.settings?.dropdowns_speed ?? 220) > 300))
check("no template slows its dropdowns past 300ms", noSpeed.length === 0, noSpeed)
check("panels paint the header scheme's real background, not the transparent header's", /\.header:not\(\.glass-enabled\) \.navigation\.horizontal :is\(\.menu-parent > \.submenu, \.dropdown-menu \.sub-children-menu\):not\(\[class\*="color-"\]\) \{\s*--color-background: var\(--hs-mnav-bg, #ffffff\);\s*--gradient-background: var\(--hs-mnav-bg, #ffffff\);\s*background: var\(--hs-mnav-bg, #ffffff\);/.test(read("assets/header-section.css")))
const theme = read("assets/theme.js")
check("the slide-down mega menu moves in 240ms both ways", (theme.match(/ease: \[0\.7, 0, 0\.2, 1\],\s*duration: 0\.24,/g) ?? []).length >= 3 && !/ease: \[0\.7, 0, 0\.2, 1\],\s*duration: 0\.(35|4),/.test(theme))
check("the phone menu drawer slides in 300ms and lets go after 340ms", /transform: translateX\(-105%\);[\s\S]{0,120}transition: transform 0\.3s/.test(nav) && /\.nav-open \.navigation\.mobile \{\s*transition: transform 0\.3s/.test(nav) && theme.includes("settleTimer = setTimeout(settle, 340);"))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
