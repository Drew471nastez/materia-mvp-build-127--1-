/**
 * PRODUCT CARDS AND PRODUCT PAGES, UNIVERSAL (round 66).
 *
 * The owner, on live stores: two cards each 850 by 1000 on a 1920 screen
 * (liam-bailey.storelib.com, items_per_row 2), the product page's picture a
 * screen tall, the card picture zooming and swapping under the pointer,
 * hearts on every card of a store with no wishlist, and the Northpaper logo
 * squashed in the footer.
 *
 *   every page an installed theme draws carries lib/storelib-theme/compat/
 *   shop-calm.ts in its head: the card cap, the product picture fitted to
 *   the window at its frame's shape, nothing moving under the pointer, a
 *   logo at its own shape
 *   Materia (a real template through answer()): the header's wishlist icon
 *   decides the cards' hearts; on, they are drawn as before
 *   a theme whose header has no wishlist setting is left as it was
 *   the native theme: hearts follow the built-in header's icon, product
 *   grids cap their columns, no picture moves on hover, the product page's
 *   picture fits the window; Storelib's older store cards do not zoom
 *
 * scripts/check-cards-r66.mjs measures the same in Chromium.
 *
 *   npx tsx tests/cards-universal-r66.test.ts
 */
import { readFileSync } from "node:fs"
import { importTemplate, siteFor, type SampleProduct } from "../scripts/theme-templates/site"
import { answer, type SiteData } from "../lib/storelib-theme/compat/site"
import { SHOP_CALM_CSS, SHOP_CALM_HEAD, SHOP_CARD_MAX_PX, SHOP_GALLERY_MAX_H, headerWishlistOn } from "../lib/storelib-theme/compat/shop-calm"
import { headerLogoOf, themeWithHeaderLogo } from "../lib/website-builder/chrome-logo"
import { renderStorelibSection } from "../lib/website-builder/storelib-runtime"
import { toCard } from "../lib/website-builder/shop-products"
import type { SectionInstance, ThemeSettingsValues } from "../lib/website-builder/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 500)}`}`)
}

const THREE: SampleProduct[] = [
  { title: "Alpha plan", price: "$10.00", image: "creator-workbook.webp" },
  { title: "Bravo plan", price: "$12.00", image: "creator-prompts.webp" },
  { title: "Charlie plan", price: "$14.00", image: "creator-dark-paper.webp" },
]

type Section = { id: string; type: string; settings: Record<string, unknown> }

async function materia(headerIcon: boolean | null): Promise<{ home: string; product: string; list: string }> {
  const imported = await importTemplate("materia/creator")
  /* liam-bailey.storelib.com's saved setting: the cards' heart on. */
  imported.theme.settings.shopify = { ...imported.theme.settings.shopify, show_wishlist: true }
  const { site } = siteFor(imported, { name: "Shop", products: THREE })
  for (const list of Object.values(site.pages as unknown as Record<string, Section[]>))
    for (const s of list)
      if (/header/.test(s.type) && s.settings && "show_wishlist_icon" in s.settings) {
        if (headerIcon === null) delete s.settings.show_wishlist_icon
        else s.settings.show_wishlist_icon = headerIcon
      }
  const get = async (s: SiteData, path: string) => String((await answer(s, { method: "GET", path, query: new URLSearchParams(), body: null, cart: [] })).body)
  return { home: await get(site, "/"), product: await get(site, "/products/alpha-plan"), list: await get(site, "/collections/all") }
}

const hearts = (html: string) => (html.match(/<button-wishlist\b/g) ?? []).length

async function main() {
  console.log("\nThe head every installed theme's page gets\n")
  check("cards at most 400px", SHOP_CARD_MAX_PX === 400 && SHOP_CALM_CSS.includes(`--sl-card-max:${SHOP_CARD_MAX_PX}px`))
  check("  Materia's Products listing caps its columns (liam-bailey.storelib.com's section), not the cards in them", SHOP_CALM_CSS.includes(".pl-grid:has(>.product-item){grid-template-columns:repeat(var(--pl-cols,4),minmax(0,var(--sl-card-max)))!important}"))
  check("  the collection page and .grid-cols too; a flex row caps the card", /\.facets-grid:has[^{]*\{grid-template-columns:repeat\(var\(--cols-desktop,4\),minmax\(0,var\(--sl-card-max\)\)\)/.test(SHOP_CALM_CSS) && /\.grid-cols:has\(>\.product-item\)/.test(SHOP_CALM_CSS) && /\.flex-cols,[^{]*\)>\.product-item,\.r7rv__item\{max-width:var\(--sl-card-max\)\}/.test(SHOP_CALM_CSS))
  check("the product picture: never taller than the window below the header", SHOP_GALLERY_MAX_H === "min(calc(100svh - 240px), 960px)" && SHOP_CALM_CSS.includes(`--sl-gallery-h:${SHOP_GALLERY_MAX_H}`))
  check("  the gallery as wide as that at its first slide's shape (Liam's: --aspect-ratio: 3/4, no semicolon)", SHOP_CALM_CSS.includes('[style$="--aspect-ratio: 3/4"]') && SHOP_CALM_CSS.includes("{--sl-mg-r:3/4}") && SHOP_CALM_CSS.includes("max-width:calc(var(--sl-gallery-h) * (var(--sl-mg-r,1)))"))
  check("  a picture's own shape (Adapt) by its first digits", SHOP_CALM_CSS.includes('[style*="--aspect-ratio: 0.7"]){--sl-mg-r:0.7}'))
  check("  the magnifier is not shown", SHOP_CALM_CSS.includes(".drift-zoom-pane,.drift-bounding-box{display:none!important}"))
  check("nothing on a card moves: no transform, no second picture", /\.product-item \.hover-effect:is\(:hover,\[data-pc-press\]\)[^{]*\{transform:none!important;translate:none!important;scale:none!important;rotate:none!important\}/.test(SHOP_CALM_CSS) && SHOP_CALM_CSS.includes(".product-item .product__media.show_secondary>.secondary-image") && /\.card-wrapper \.media\.media--hover-effect>img\{transform:none/.test(SHOP_CALM_CSS))
  check("no wishlist on the store: every heart hidden", /html\[data-sl-wishlist=off\] :is\(button-wishlist,[^)]*\)\{display:none!important\}/.test(SHOP_CALM_CSS))
  check("a logo keeps its shape, and any rule of the theme's still wins (:where weighs nothing)", SHOP_CALM_CSS.includes(":where(header img,footer img,.footer img,.header img,.store-info-content img,[class*=logo] img,img[class*=logo]){height:auto}") && SHOP_CALM_CSS.includes("{object-fit:contain}"))
  let depth = 0
  let balanced = true
  for (const ch of SHOP_CALM_CSS) { if (ch === "{") depth++; if (ch === "}") depth--; if (depth < 0) balanced = false }
  check("  the stylesheet's braces balance, and it cannot close its <style>", balanced && depth === 0 && !SHOP_CALM_CSS.includes("<"))
  check("a lazy logo (sizes=auto, laid out by its attributes) is given its file's shape once loaded", SHOP_CALM_HEAD.includes("<script data-sl-logo-shape>") && /aspectRatio/.test(SHOP_CALM_HEAD) && !/\bimport\b|require\(/.test(SHOP_CALM_HEAD))

  console.log("\nheaderWishlistOn\n")
  const schema = { settings: [{ id: "show_wishlist_icon", type: "checkbox", default: true }] }
  check("off when the header's icon is off", headerWishlistOn([{ settings: { show_wishlist_icon: false }, schema }]) === false)
  check("on when it is on, or never set (its default)", headerWishlistOn([{ settings: { show_wishlist_icon: true }, schema }]) === true && headerWishlistOn([{ settings: {}, schema }]) === true)
  check("a hidden header says nothing", headerWishlistOn([{ settings: { show_wishlist_icon: true }, schema, hidden: true }]) === null)
  check("a header with no wishlist setting: unknown, nothing changes", headerWishlistOn([{ settings: { show_search: true }, schema: { settings: [{ id: "show_search", type: "checkbox" }] } }]) === null)

  console.log("\nMateria, drawn as a live store is (materia/creator, the cards' heart on)\n")
  const off = await materia(false)
  check("the head carries the stylesheet", off.home.includes(SHOP_CALM_HEAD) && off.product.includes(SHOP_CALM_HEAD))
  check("header icon off: no heart on the collection page's cards", hearts(off.list) === 0 && (off.list.match(/class="product-item /g) ?? []).length === 3, hearts(off.list))
  check("  nor on the product page's (its related products)", hearts(off.product) === 0 && /class="product-item /.test(off.product), hearts(off.product))
  check("  and the page is marked, for a heart a section draws on its own", /<html[^>]*data-sl-wishlist="off"/.test(off.home) && /<html[^>]*data-sl-wishlist="off"/.test(off.product))
  const on = await materia(true)
  check("header icon on: the hearts are drawn as before, one a card", hearts(on.list) === 3, hearts(on.list))
  check("  and the page is not marked", !/data-sl-wishlist="off"/.test(on.home))
  const unset = await materia(null)
  check("header icon never set (Materia's default is on): hearts drawn", hearts(unset.list) === 3 && !/data-sl-wishlist="off"/.test(unset.list), hearts(unset.list))

  console.log("\nThe native theme\n")
  const header = { id: "header", type: "header", settings: { show_wishlist_icon: false } } as unknown as SectionInstance
  const logo = headerLogoOf([header])
  check("the built-in header's wishlist icon off is carried to the theme", logo?.wishlist_icon === false && (themeWithHeaderLogo({} as ThemeSettingsValues, logo) as unknown as { wishlist_off?: boolean }).wishlist_off === true)
  check("  on (or never set), nothing changes", headerLogoOf([{ ...header, settings: {} } as unknown as SectionInstance]) === null)
  const rows = ["a", "b"].map((n, i) => ({ id: `${String(i + 1).padStart(8, "0")}-3333-4333-8333-333333333333`, title: `Plan ${n}`, slug: `p${i}`, price_cents: 900, compare_at_cents: null, thumbnail_url: `https://img.test/${n}.jpg`, status: "published", type: "digital", inventory_count: null }))
  const cards = rows.map((r) => toCard(r as never, [], []))
  const grid = { id: "grid", type: "product_grid", name: "Product Grid", settings: { source: "shop", show_wishlist: true, columns: { desktop: 2, tablet: 2, mobile: 2 } }, blocks: [] } as unknown as SectionInstance
  const draw = (theme: ThemeSettingsValues) => {
    const r = renderStorelibSection(grid, theme, { template: "index" }, {}, cards as never)
    return r.ok ? r : null
  }
  const withHearts = draw({} as ThemeSettingsValues)
  const without = draw(themeWithHeaderLogo({} as ThemeSettingsValues, logo))
  check("Product grid: hearts with the header's icon on", !!withHearts && (withHearts.html.match(/class="heart"/g) ?? []).length === 2, withHearts?.html.slice(0, 200))
  check("  none with it off", !!without && !/class="heart"/.test(without.html))
  check("  its columns stop at 400px (a grid packs fixed columns at its start)", !!withHearts && /minmax\(0, 400px\)/.test(withHearts.css))
  for (const f of ["product_grid", "collection_featured", "search", "product_featured", "main_wishlist"]) {
    const src = readFileSync(`themes/default/sections/${f}.storelib`, "utf8")
    check(`  ${f}: no column wider than 400px`, (src.match(/minmax\(0, 400px\)/g) ?? []).length === 2 && !/@container \(min-width: 900px\) \{ \.grid \{[^}]*1fr/.test(src))
  }
  check("search: a card's picture no longer zooms on hover", !/\.card__wrap:hover \.card__media img \{ transform/.test(readFileSync("themes/default/sections/search.storelib", "utf8")))
  const media = readFileSync("components/website-builder/sections/renderers/product/product-media.tsx", "utf8")
  check("product page pictures: no hover zoom", !/group-hover\/media:scale/.test(media) && !/group\/media/.test(media))
  check("  never taller than the window, from the same number", media.includes("SHOP_GALLERY_MAX_H") && media.includes('"@[768px]:max-h-[var(--pm-h)]'))
  check("Storelib's older store cards: the picture does not zoom", !/group-hover:scale-105 opacity-0/.test(readFileSync("components/store-builder/unified-section-renderer.tsx", "utf8")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
