/**
 * The account, sign in, wishlist, contact and shop pages of two themes, drawn
 * on the server the way the live site draws them: the generated sections
 * (lib/website-builder/account-pages), rendered by the engine with the
 * globals a page hands them, then the whole ThemePage to a string. Bundled
 * and run by scripts/check-site-accounts.mjs, which hydrates each one in
 * Chromium and measures it.
 *
 * The account page's customer is shaped by the live site's own function
 * (lib/site-accounts/account-data customerOrders), over order rows shaped
 * like the orders table's. The builder's version of the account and
 * wishlist pages is drawn with the canvas's own globals (editorGlobals) and
 * `page.in_editor`, so what is measured there is what a creator sees.
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
import { toCard, type ProductCard } from "@/lib/website-builder/shop-products"
import { customerOrders } from "@/lib/site-accounts/account-data"
import { editorGlobals } from "@/components/website-builder/sections/storelib-live"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const OUT = process.env.OUT_DIR!
mkdirSync(OUT, { recursive: true })
const CREATOR = "11111111-1111-4111-8111-111111111111"

/** A picture that needs no network: a flat tone with a darker band, as a product photo stands in. */
function picture(a: string, b: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="${a}"/><rect y="520" width="800" height="280" fill="${b}"/></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
}

/* Cards made by the same function the live site makes them with, from rows shaped like the products table's. */
const PRODUCTS: ProductCard[] = [
  { id: "10000000-0000-4000-8000-000000000001", title: "Linen apron", cents: 6400, a: "#d6cfc4", b: "#b8ad9e" },
  { id: "10000000-0000-4000-8000-000000000002", title: "Card wallet", cents: 2900, a: "#c9d3d0", b: "#a9b6b2" },
  { id: "10000000-0000-4000-8000-000000000003", title: "Everyday tote", cents: 4800, a: "#e0d6c8", b: "#c2b39d" },
  { id: "10000000-0000-4000-8000-000000000004", title: "Wash bag", cents: 3800, a: "#d3d0dc", b: "#b3aec2" },
].map((p) =>
  toCard({
    id: p.id,
    title: p.title,
    slug: p.title.toLowerCase().replace(/\s+/g, "-"),
    price_cents: p.cents,
    compare_at_cents: null,
    thumbnail_url: picture(p.a, p.b),
    status: "published",
    type: "digital",
  }),
)

const SAVED = PRODUCTS.slice(0, 3)

/**
 * The orders table as the account page reads it, for one customer: a
 * basket of two, a free course, a refund, and a long product name, shaped
 * into orders by the live site's own function.
 */
async function ordersFor(email: string) {
  const creator = CREATOR
  const rows = [
    { id: "3f2a9c1b-0000-4000-8000-000000000001", product_id: PRODUCTS[0].id, stripe_session_id: "cs_test_basket", amount_cents: 6400, created_at: "2026-09-21T10:00:00Z", receipt_token: "probe-basket-aaaaaaaaaaaa" },
    { id: "3f2a9c1b-0000-4000-8000-000000000002", product_id: PRODUCTS[3].id, stripe_session_id: "cs_test_basket", amount_cents: 3800, created_at: "2026-09-21T10:00:01Z", receipt_token: "probe-basket-bbbbbbbbbbbb", variant_name: "Sand" },
    { id: "7c11d0e2-0000-4000-8000-000000000003", product_id: "10000000-0000-4000-8000-00000000c0de", amount_cents: 0, created_at: "2026-09-24T09:00:00Z", receipt_token: "probe-course-aaaaaaaaaaaa" },
    { id: "a0b1c2d3-0000-4000-8000-000000000004", product_id: PRODUCTS[1].id, amount_cents: 2900, created_at: "2026-08-30T09:00:00Z", receipt_token: "probe-refund-aaaaaaaaaaaa", status: "refunded" },
  ].map((r) => ({ creator_id: creator, buyer_email: email, status: "completed", currency: "usd", tip_cents: 0, paypal_order_id: null, refund_amount_cents: null, shipped_at: null, delivered_at: null, variant_name: null, stripe_session_id: null, ...r }))
  const products = [
    ...PRODUCTS.map((p) => ({ id: p.id, title: String(p.settings.title), slug: String(p.settings.slug), thumbnail_url: String(p.settings.image), type: "digital", status: "published", creator_id: creator })),
    { id: "10000000-0000-4000-8000-00000000c0de", title: "Hand stitching for beginners, the complete six week course with printable patterns", slug: "stitching", thumbnail_url: null, type: "course", status: "published", creator_id: creator },
  ]
  /* A two-table stand-in that answers the chains customerOrders makes. */
  const db = {
    from(table: string) {
      const all = table === "orders" ? rows : products
      let out = [...all] as Record<string, unknown>[]
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => ((out = out.filter((r) => r[c] === v)), q),
        in: (c: string, v: unknown[]) => ((out = out.filter((r) => v.includes(r[c]))), q),
        ilike: (c: string, v: string) => ((out = out.filter((r) => String(r[c]).toLowerCase() === v.replace(/\\(.)/g, "$1").toLowerCase())), q),
        order: () => q,
        limit: () => q,
        then: (ok: (v: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: out, error: null }).then(ok),
      }
      return q
    },
  }
  return customerOrders(db, { creatorId: creator, email }, "https://storelib.com")
}

async function main() {
for (const slug of ["storelib-default", "studio-noir"]) {
  const def = getThemeBySlug(slug)!
  const preset = buildThemePreset(def)
  const theme = preset.settings as ThemeSettingsValues
  const home = preset.pages.home as SectionInstance[]
  const email = "ana.pop@mail.test"
  const orders = await ordersFor(email)
  const customer = { name: "Ana Pop", first_name: "Ana", email, orders, orders_count: orders.length, sample: false }
  const newcomer = { name: "", first_name: "", email: "first.visit@mail.test", orders: [], orders_count: 0, sample: false }
  const editor = editorGlobals("page.account", PRODUCTS, Date.parse("2026-09-25T12:00:00Z"))!
  const editorWishlist = editorGlobals("page.wishlist", PRODUCTS)!
  const pages: { key: string; sections: SectionInstance[]; template: string; globals?: StorefrontGlobals; page?: Record<string, unknown>; seed: string[] }[] = [
    { key: "login", sections: loginSections(home), template: templateForPage("login"), page: { step: "email", return_to: "/account" }, seed: [] },
    { key: "login-code", sections: loginSections(home), template: templateForPage("login"), page: { step: "code", email: "first.visit@mail.test", return_to: "/account" }, seed: [] },
    { key: "login-wrong", sections: loginSections(home), template: templateForPage("login"), page: { step: "code", email: "first.visit@mail.test", return_to: "/account", notice: "That code is not right. Check it and try again." }, seed: [] },
    { key: "account", sections: accountSections(home), template: templateForPage("account"), globals: { customer, wishlist: wishlistObject(SAVED.slice(0, 2), true) }, seed: [] },
    { key: "account-new", sections: accountSections(home), template: templateForPage("account"), globals: { customer: newcomer, wishlist: wishlistObject([], true) }, seed: [] },
    { key: "account-edit", sections: accountSections(home), template: templateForPage("account"), page: { edit: "name" }, globals: { customer, wishlist: wishlistObject(SAVED.slice(0, 2), true) }, seed: [] },
    { key: "wishlist", sections: wishlistSections(home), template: templateForPage("wishlist"), globals: { wishlist: wishlistObject(SAVED, false) }, seed: SAVED.map((p) => p.id) },
    /* The builder's canvas: its globals and in_editor, as storelib-live.tsx hands them. */
    { key: "editor-account", sections: accountSections(home), template: templateForPage("account"), page: { in_editor: true }, globals: editor, seed: [] },
    { key: "editor-login", sections: loginSections(home), template: templateForPage("login"), page: { in_editor: true }, seed: [] },
    { key: "editor-wishlist", sections: wishlistSections(home), template: templateForPage("wishlist"), page: { in_editor: true }, globals: editorWishlist, seed: [] },
    { key: "contact", sections: contactSections(home), template: templateForPage("contact"), globals: { shop: { name: def.sample.brand, email: "hello@store.test" } }, seed: [] },
    { key: "shop", sections: shopSections(home, theme), template: "page.products", seed: [] },
    /* The control: the theme's own home page, which none of this touches. */
    { key: "home", sections: home, template: "index", seed: [] },
  ]
  for (const p of pages) {
    const prerendered = renderWithSources({}, p.sections, theme, p.template, PRODUCTS, p.page, undefined, { shop: { name: def.sample.brand }, ...(p.globals ?? {}) })
    const props = { theme, sections: p.sections, storefront: { creatorId: CREATOR, installId: "probe-install" } }
    const ssr = renderToString(
      createElement(StorelibSourcesProvider, { prerendered, page: { template: p.template } } as never, createElement(ThemePage, props as never)),
    )
    writeFileSync(join(OUT, `${slug}-${p.key}.json`), JSON.stringify({ theme: slug, key: p.key, template: p.template, prerendered, props, ssr, seed: p.seed, creatorId: CREATOR }))
  }
}
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
