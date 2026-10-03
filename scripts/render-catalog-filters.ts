/**
 * The shop's Product grid with its filters (themes/default/sections/
 * product_grid.storelib, lib/products/catalog-filters.ts), drawn by the real
 * theme engine with fixture products and a filtered address, printed as JSON
 * { html, css, empty } for scripts/check-product-page.mjs:
 *
 *   npx tsx scripts/render-catalog-filters.ts
 */
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { catalogFilters, catalogPage, parseCatalogQuery } from "@/lib/products/catalog-filters"
import { toCard } from "@/lib/website-builder/shop-products"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const id = (n: number) => `${String(n).padStart(8, "0")}-3333-4333-8333-333333333333`
const kinds = ["physical", "digital", "course"]
const rows = Array.from({ length: 9 }, (_, i) => ({
  id: id(i + 1),
  title: ["Field overshirt", "Preset pack", "Night course", "Canvas tote", "Film LUTs", "Writing course", "Wool cap", "Brush set", "Edit course"][i],
  slug: `p${i + 1}`,
  price_cents: [8900, 1900, 12000, 3500, 2400, 9900, 2800, 1500, 7500][i],
  compare_at_cents: null,
  thumbnail_url: `https://img.test/card${i + 1}.svg`,
  status: "published",
  type: kinds[i % 3],
  inventory_count: i === 6 ? 0 : null,
}))
const options = rows
  .filter((r) => r.type === "physical")
  .flatMap((r, i) => [
    { product_id: r.id, name: "Colour", values: i % 2 ? ["Sand", "Navy"] : ["Black", "Sand"], position: 1 },
    { product_id: r.id, name: "Size", values: ["S", "M", "L"], position: 2 },
  ])
const cards = rows.map((r) => toCard(r as never, [], options))

const section = (over: Record<string, unknown> = {}) =>
  ({ id: "shop-all-products", type: "product_grid", name: "Product Grid", settings: { source: "shop", show_filters: true, heading: "Northwind shop", columns: { desktop: 3, tablet: 2, mobile: 2 }, ...over }, blocks: [] }) as unknown as SectionInstance

const draw = (address: string) => {
  const { listed, filters } = catalogPage(cards, new URLSearchParams(address), "/products")
  const r = renderStorelibSection(section(), {} as ThemeSettingsValues, { template: "page.products", filters }, {}, listed as never)
  if (r.ok === false) throw new Error(JSON.stringify(r.errors))
  return r
}
const full = draw("sort=price-asc")
const filtered = draw("type=physical&opt.colour=Sand")
const none = renderStorelibSection(section(), {} as ThemeSettingsValues, { template: "page.products", filters: catalogFilters(cards, parseCatalogQuery({ price_min: "500" }), "/products") }, {}, [] as never)
if (none.ok === false) throw new Error(JSON.stringify(none.errors))
process.stdout.write(JSON.stringify({ html: full.html, css: full.css, filtered: filtered.html, empty: none.html, total: cards.length }))
