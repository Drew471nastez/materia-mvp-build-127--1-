// The native theme's product grid (themes/default/sections/product_grid.storelib) with the shop's filters, drawn by the real engine, with test pictures of varied shapes.
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { catalogPage } from "@/lib/products/catalog-filters"
import { toCard } from "@/lib/website-builder/shop-products"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const BASE = process.env.IMG_BASE || "https://img.test"
const names = ["tall45", "wide169", "square", "small600", "portrait23", "landscape32"]
const rows = names.map((n, i) => ({
  id: `${String(i + 1).padStart(8, "0")}-3333-4333-8333-333333333333`,
  title: `Programme ${n}`, slug: `p${i + 1}`, price_cents: 899 * (i + 1), compare_at_cents: null,
  thumbnail_url: `${BASE}/${n}.jpg`, status: "published", type: "digital", inventory_count: null,
}))
const cards = rows.map((r) => toCard(r as never, [], []))
const shape = process.env.SHAPE || "4/3"
const section = { id: "shop-all-products", type: "product_grid", name: "Product Grid", settings: { source: "shop", show_filters: true, show_wishlist: true, heading: "Gym Programmes", shape, columns: { desktop: 3, tablet: 2, mobile: 2 } }, blocks: [] } as unknown as SectionInstance
const { listed, filters } = catalogPage(cards, new URLSearchParams(""), "/products")
const r = renderStorelibSection(section, {} as ThemeSettingsValues, { template: "page.products", filters }, {}, listed as never)
if (r.ok === false) throw new Error(JSON.stringify(r.errors))
process.stdout.write(JSON.stringify({ html: r.html, css: r.css }))
