/**
 * The account, sign in, wishlist, contact and shop pages of two themes, drawn
 * on the server the way the live site draws them: the generated sections
 * (lib/website-builder/account-pages), rendered by the engine with the
 * globals a page hands them, then the whole ThemePage to a string. Bundled
 * and run by scripts/check-site-accounts.mjs, which hydrates each one in
 * Chromium and measures it.
 */
import { renderToString } from "react-dom/server"
import { createElement } from "react"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
import { renderWithSources } from "@/lib/website-builder/storefront-render"
import { accountSections, contactSections, loginSections, wishlistSections } from "@/lib/website-builder/account-pages"
import { shopSections } from "@/lib/website-builder/shop-page"
import { buildThemePreset, getThemeBySlug } from "@/lib/website-builder/theme-registry"
import { templateForPage } from "@/lib/website-builder/site-pages"
import { wishlistObject, type StorefrontGlobals } from "@/lib/storelib-theme/globals"
import type { ProductCard } from "@/lib/website-builder/shop-products"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const OUT = process.env.OUT_DIR!
mkdirSync(OUT, { recursive: true })
const CREATOR = "11111111-1111-4111-8111-111111111111"

/** A picture that needs no network: a flat tone with a darker band, as a product photo stands in. */
function picture(a: string, b: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="${a}"/><rect y="520" width="800" height="280" fill="${b}"/></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
}

const PRODUCTS: ProductCard[] = [
  ["10000000-0000-4000-8000-000000000001", "Linen apron", "$64.00", "#d6cfc4", "#b8ad9e"],
  ["10000000-0000-4000-8000-000000000002", "Card wallet", "$29.00", "#c9d3d0", "#a9b6b2"],
  ["10000000-0000-4000-8000-000000000003", "Everyday tote", "$48.00", "#e0d6c8", "#c2b39d"],
  ["10000000-0000-4000-8000-000000000004", "Wash bag", "$38.00", "#d3d0dc", "#b3aec2"],
].map(([id, title, price, a, b]) => ({
  id,
  type: "product" as const,
  settings: { title, price, compare_price: "", image: picture(a, b), url: `/products/${title.toLowerCase().replace(/\s+/g, "-")}`, tag: "" },
}))

const SAVED = PRODUCTS.slice(0, 3)

for (const slug of ["storelib-default", "studio-noir"]) {
  const def = getThemeBySlug(slug)!
  const preset = buildThemePreset(def)
  const theme = preset.settings as ThemeSettingsValues
  const home = preset.pages.home as SectionInstance[]
  const customer = {
    name: "Alex Morgan",
    first_name: "Alex",
    email: "alex.morgan@example.com",
    orders_count: 2,
    orders: [
      { id: PRODUCTS[0].id, title: "Linen apron", image: PRODUCTS[0].settings.image, url: "/products/linen-apron", date: "Sep 21, 2026", price: "$64.00", action_label: "Download", action_url: "https://storelib.com/library/products/p1" },
      { id: PRODUCTS[3].id, title: "Wash bag", image: PRODUCTS[3].settings.image, url: "/products/wash-bag", date: "Aug 30, 2026", price: "$38.00", action_label: "Receipt", action_url: "https://storelib.com/receipt/r1" },
    ],
  }
  const pages: { key: string; sections: SectionInstance[]; template: string; globals?: StorefrontGlobals; page?: Record<string, unknown>; seed: string[] }[] = [
    { key: "login", sections: loginSections(home), template: templateForPage("login"), seed: [] },
    { key: "account", sections: accountSections(home), template: templateForPage("account"), globals: { customer, wishlist: wishlistObject(SAVED.slice(0, 2), true) }, seed: [] },
    { key: "wishlist", sections: wishlistSections(home), template: templateForPage("wishlist"), globals: { wishlist: wishlistObject(SAVED, false) }, seed: SAVED.map((p) => p.id) },
    { key: "contact", sections: contactSections(home), template: templateForPage("contact"), globals: { shop: { name: def.sample.brand, email: "hello@example.com" } }, seed: [] },
    { key: "shop", sections: shopSections(home, theme), template: "page.products", seed: [] },
    /* The control: the theme's own home page, which none of this touches. */
    { key: "home", sections: home, template: "index", seed: [] },
  ]
  for (const p of pages) {
    const prerendered = renderWithSources({}, p.sections, theme, p.template, PRODUCTS, p.page, { shop: { name: def.sample.brand }, ...(p.globals ?? {}) })
    const props = { theme, sections: p.sections, storefront: { creatorId: CREATOR, installId: "probe-install" } }
    const ssr = renderToString(
      createElement(StorelibSourcesProvider, { prerendered, page: { template: p.template } } as never, createElement(ThemePage, props as never)),
    )
    writeFileSync(join(OUT, `${slug}-${p.key}.json`), JSON.stringify({ theme: slug, key: p.key, template: p.template, prerendered, props, ssr, seed: p.seed, creatorId: CREATOR }))
  }
}
