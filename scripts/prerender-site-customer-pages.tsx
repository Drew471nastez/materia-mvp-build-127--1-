/**
 * The sign in, account, contact, wishlist and password pages of two themes,
 * drawn on the server the way a website draws them: the generated sections
 * (lib/website-builder/account-pages), rendered by the engine with the
 * globals a page hands them, then the whole ThemePage to a string. Bundled
 * and run by scripts/check-site-account-pages.mjs, which hydrates each one in
 * Chromium (scripts/render-site-accounts.tsx) and measures its fields.
 */
import { renderToString } from "react-dom/server"
import { createElement } from "react"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
import { renderWithSources } from "@/lib/website-builder/storefront-render"
import { accountSections, contactSections, loginSections, passwordSections, wishlistSections } from "@/lib/website-builder/account-pages"
import { applyUniversalChrome } from "@/lib/website-builder/universal-chrome"
import { buildThemePreset, getThemeBySlug } from "@/lib/website-builder/theme-registry"
import { templateForPage } from "@/lib/website-builder/site-pages"
import { wishlistObject, type StorefrontGlobals } from "@/lib/storelib-theme/globals"
import { toCard, type ProductCard } from "@/lib/website-builder/shop-products"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const OUT = process.env.OUT_DIR!
mkdirSync(OUT, { recursive: true })
const CREATOR = "11111111-1111-4111-8111-111111111111"

function picture(a: string, b: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="${a}"/><rect y="520" width="800" height="280" fill="${b}"/></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
}

const PRODUCTS: ProductCard[] = [
  { id: "10000000-0000-4000-8000-000000000001", title: "Linen apron with a long name that wraps on a phone", cents: 6400, a: "#d6cfc4", b: "#b8ad9e" },
  { id: "10000000-0000-4000-8000-000000000002", title: "Card wallet", cents: 2900, a: "#c9d3d0", b: "#a9b6b2" },
  { id: "10000000-0000-4000-8000-000000000003", title: "Everyday tote", cents: 4800, a: "#e0d6c8", b: "#c2b39d" },
].map((p) =>
  toCard({ id: p.id, title: p.title, slug: p.title.toLowerCase().replace(/\s+/g, "-"), price_cents: p.cents, compare_at_cents: null, thumbnail_url: picture(p.a, p.b), status: "published", type: "digital" }),
)

const customer = {
  name: "Ana Pop",
  first_name: "Ana",
  email: "ana.pop.with.a.long.address@mail.test",
  orders: [
    {
      id: "o1", number: "3F2A9C1B", date: "Sep 21, 2026", status: "Complete", state: "open", total: "$102.00",
      items: [{ title: String(PRODUCTS[0].settings.title), image: String(PRODUCTS[0].settings.image), url: "/products/x", variant: "Sand" }, { title: "Card wallet", image: String(PRODUCTS[1].settings.image), url: "", variant: "" }],
      item_count: 2, action_label: "Download", action_url: "https://storelib.com/receipt/probe", title: "Linen apron and 1 more", image: "", url: "", price: "$102.00",
    },
    /* Something that ships, with two parcels: one a carrier we link, one we don't (its number alone), a long name to wrap on a phone. */
    {
      id: "o2", number: "7C1D0E2F", date: "Sep 24, 2026", status: "Partly shipped", state: "open", total: "$64.00",
      items: [{ title: "Card wallet", image: String(PRODUCTS[1].settings.image), url: "", variant: "Black" }],
      item_count: 1, action_label: "Track order", action_url: "/checkout/physical/order/probe-token-aaaaaaaa", title: "Card wallet", image: "", url: "", price: "$64.00",
      fulfillment_status: "partially_fulfilled", order_url: "/checkout/physical/order/probe-token-aaaaaaaa",
      tracking: [
        { company: "La Poste / Colissimo", number: "6A12345678901", url: "https://www.laposte.fr/outils/suivre-vos-envois?code=6A12345678901", status: "In transit" },
        { company: "Courier Express Nationwide", number: "CEN-0000123456789012345", url: "", status: "Shipped" },
      ],
    },
  ],
  orders_count: 2,
  addresses: [{ lines: ["Ana Pop", "9 Elm Row, Flat 4", "Cluj-Napoca, CJ 400000", "Romania"] }],
  sample: false,
}

async function main() {
  for (const slug of ["storelib-default", "studio-noir"]) {
    const def = getThemeBySlug(slug)!
    const preset = buildThemePreset(def)
    const theme = preset.settings as ThemeSettingsValues
    const home = preset.pages.home as SectionInstance[]
    const shop = { name: def.sample.brand }
    const pages: { key: string; sections: SectionInstance[]; template: string; globals?: StorefrontGlobals; page?: Record<string, unknown> }[] = [
      { key: "login", sections: loginSections(home), template: templateForPage("login"), page: { step: "email", return_to: "/account" } },
      { key: "login-code", sections: loginSections(home), template: templateForPage("login"), page: { step: "code", email: customer.email, return_to: "/account" } },
      { key: "account", sections: accountSections(home), template: templateForPage("account"), globals: { customer, wishlist: wishlistObject(PRODUCTS.slice(0, 2), true) } },
      { key: "account-edit", sections: accountSections(home), template: templateForPage("account"), page: { edit: "name" }, globals: { customer, wishlist: wishlistObject([], true) } },
      { key: "contact", sections: contactSections(home), template: templateForPage("contact"), globals: { shop: { ...shop, email: "hello@store.test" } } },
      { key: "wishlist", sections: wishlistSections(home), template: templateForPage("wishlist"), globals: { wishlist: wishlistObject(PRODUCTS, false) } },
      /* The live site's password page: its own section, no header or footer (applyUniversalChrome takes them off). */
      {
        key: "password",
        sections: applyUniversalChrome({ home, password: passwordSections(home) }).password,
        template: templateForPage("password"),
        page: { return_to: "/", owner_url: "https://storelib.com/api/site-password/owner?host=probe.storelib.com" },
      },
      { key: "password-wrong", sections: passwordSections(home), template: templateForPage("password"), page: { return_to: "/about", notice: "That password is not right. Try again.", owner_url: "https://storelib.com/api/site-password/owner?host=probe.storelib.com" } },
    ]
    for (const p of pages) {
      const prerendered = renderWithSources({}, p.sections, theme, p.template, PRODUCTS, p.page, undefined, { shop, ...(p.globals ?? {}) })
      const props = { theme, sections: p.sections, storefront: { creatorId: CREATOR, installId: "probe-install" } }
      const ssr = renderToString(
        createElement(StorelibSourcesProvider, { prerendered, page: { template: p.template } } as never, createElement(ThemePage, props as never)),
      )
      writeFileSync(join(OUT, `${slug}-${p.key}.json`), JSON.stringify({ theme: slug, key: p.key, template: p.template, prerendered, props, ssr }))
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
