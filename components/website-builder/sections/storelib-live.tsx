"use client"

/**
 * THE COMPILER, WHERE IT IS ACTUALLY NEEDED.
 *
 * The editor re-renders a section whenever a setting moves, so it compiles
 * in the browser. This file is the only place in the component tree that
 * imports the engine, which is what keeps it out of every published site's
 * bundle — see storelib-sources.tsx.
 */
import { useCallback, useMemo, type ReactNode } from "react"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { themeWithHeaderLogo, type HeaderLogo } from "@/lib/website-builder/chrome-logo"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import type { RenderContext, StorefrontData } from "@/lib/storelib-theme/types"
import { StorelibRenderProvider, type SectionRenderFn } from "./storelib-sources"
import { layoutStylesheet } from "@/lib/storelib-theme/theme-stylesheet"
import { wishlistObject, type StorefrontGlobals } from "@/lib/storelib-theme/globals"
import { catalogPage } from "@/lib/products/catalog-filters"
import { breadcrumbTrail } from "@/lib/products/breadcrumbs"
import type { CustomerObject, CustomerOrder } from "@/lib/site-accounts/account-data"

type Card = NonNullable<RenderContext["products"]>[number]

/** Two made up products, for a store that has none published yet. */
const PLACEHOLDER_CARDS: Card[] = [
  { id: "00000000-0000-4000-8000-000000000001", type: "product", settings: { title: "Your product", price: "$24.00", compare_price: "", image: "", url: "", tag: "" } },
  { id: "00000000-0000-4000-8000-000000000002", type: "product", settings: { title: "Another product", price: "$12.00", compare_price: "", image: "", url: "", tag: "" } },
]

const DAY = 24 * 60 * 60_000

function sampleDate(at: number): string {
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
}

/**
 * THE ACCOUNT PAGE WITH NOBODY ON IT. A creator designing their account page
 * is nobody's customer, so there is no person to draw, and the canvas does
 * not invent one: the name and email are the words "Customer name" and
 * "Customer email", marked `sample` so the section draws them the colour a
 * field's placeholder is, and the orders are two of the creator's own
 * products, laid out the way a real order is (lib/site-accounts/
 * account-data.ts), with buttons that go nowhere.
 */
export function sampleCustomer(cards: Card[], now: number): CustomerObject {
  const orders: CustomerOrder[] = cards.slice(0, 2).map((c, i) => {
    const s = c.settings as Record<string, unknown>
    const kind = typeof s.kind === "string" ? s.kind : ""
    const total = (typeof s.price === "string" && s.price) || "Free"
    const item = { title: String(s.title ?? ""), image: String(s.image ?? ""), url: String(s.url ?? ""), variant: "" }
    return {
      id: c.id,
      number: String(1002 - i),
      date: sampleDate(now - (i === 0 ? 3 : 24) * DAY),
      status: kind === "physical" ? "Confirmed" : "Complete",
      state: "open",
      total,
      items: [item],
      item_count: 1,
      action_label: kind === "physical" ? "View order" : kind === "course" || kind === "community" ? "Access" : "Download",
      action_url: "#",
      title: item.title,
      image: item.image,
      url: item.url,
      price: total,
    }
  })
  /* One address, in words that say what goes there, so the Addresses block can be styled before anybody has shipped anything. */
  const addresses = [{ lines: ["Customer name", "Street address", "City, Region, Postal code", "Country"] }]
  return { name: "Customer name", first_name: "Customer", email: "Customer email", orders, orders_count: orders.length, addresses, sample: true }
}

/** What the canvas draws the account and wishlist templates with. Nothing on any other page. */
export function editorGlobals(template: string, products: Card[], now = Date.now()): StorefrontGlobals | undefined {
  if (template !== "page.account" && template !== "page.wishlist") return undefined
  const cards = products.length > 0 ? products.slice(0, 4) : PLACEHOLDER_CARDS
  const wishlist = wishlistObject(cards, template === "page.account")
  if (template === "page.wishlist") return { wishlist }
  return { customer: sampleCustomer(cards, now) as unknown as Record<string, unknown>, wishlist }
}

/** `page.filters` and `page.breadcrumbs` for the canvas, as the live routes give them. */
export function editorPageExtras(template: string, products: Card[], data?: StorefrontData): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (template === "page.products" || template === "page.search") {
    out.filters = catalogPage(products as never, {}, template === "page.search" ? "/search" : "/products").filters
  }
  out.breadcrumbs = breadcrumbTrail({ template, product: data?.product ?? null, title: template.startsWith("page") ? "This page" : null })
  return out
}

export function StorelibLiveProvider({
  sources,
  page,
  inEditor,
  products,
  data,
  headerLogo,
  children,
}: {
  /** Saved `.storelib` files, path to source. The bundled theme is the fallback. */
  sources: Record<string, string>
  page?: { template: string }
  /**
   * Whether this is the builder drawing. A section with no blocks yet has to
   * say so to the person adding them and nothing at all to a visitor, and
   * `page.in_editor` is the only way a template can tell the two apart. It is
   * false unless something sets it, so a surface that forgets shows a visitor
   * the visitor's version, which is the safe way round.
   */
  inEditor?: boolean
  /**
   * The creator's published products, block-shaped, for the sections that
   * draw the catalogue. The canvas has to be given the same list the
   * published page is given, or the two surfaces disagree about what the
   * site says — which is the one thing tests/storelib-parity.test.ts is for.
   * Absent means none, and a section that asks for products draws none,
   * which is what the section library's thumbnails want.
   */
  products?: RenderContext["products"]
  /**
   * The shop's own facts: the catalogue a picker names, the menus, the shop,
   * the creator and on the product page the product. The same object the
   * live site draws with (lib/website-builder/storefront-data.ts).
   */
  data?: StorefrontData
  /**
   * The built-in header's logo on the page being drawn (lib/website-builder/chrome-logo.ts), so a coded header shows the
   * logo the creator uploaded in the header's panel, as the live page does.
   */
  headerLogo?: HeaderLogo | null
  children: ReactNode
}) {
  const template = page?.template ?? "index"
  /*
    THE ACCOUNT PAGES, DRAWN SIGNED IN. A creator designing the account page
    or the wishlist is nobody's customer, and an account page with no
    customer is a page that only ever shows its signed out line. So the
    canvas draws the signed in layout with placeholders where the customer
    would be and the creator's own products as the orders and saved items
    (sampleCustomer above), on those two pages only, which is where the live
    site has a customer to draw them for. Never a made up person.
  */
  const globals = useMemo(() => (inEditor === true ? editorGlobals(template, products ?? []) : undefined), [inEditor, template, products])
  /* What a live page adds to `page` for its sections: the shop's filters on
     the shop and search pages, and the trail for Breadcrumbs. Drawn here from
     the canvas's own products, unfiltered, the way the page opens. */
  const extras = useMemo(() => editorPageExtras(template, products ?? [], data), [template, products, data])
  const render = useCallback<SectionRenderFn>(
    (section: SectionInstance, theme: ThemeSettingsValues) =>
      renderStorelibSection(section, themeWithHeaderLogo(theme, headerLogo ?? null), { ...extras, template, in_editor: inEditor === true }, sources, products, data, globals),
    [sources, template, inEditor, products, data, globals, extras, headerLogo],
  )
  /* The same object while the template is the same. Inline, it was a new
     context value on every render of the canvas, and every section that reads
     the context rendered again with it, past SectionRenderer's memo. */
  const pageValue = useMemo(() => ({ template }), [template])
  /* The theme's whole page stylesheet, compiled once per change to its file: the same function the live site calls. */
  const layoutCss = useMemo(() => layoutStylesheet(sources), [sources])
  return (
    <StorelibRenderProvider render={render} page={pageValue} layoutCss={layoutCss}>
      {children}
    </StorelibRenderProvider>
  )
}
