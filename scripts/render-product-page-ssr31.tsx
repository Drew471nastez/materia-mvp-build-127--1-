/**
 * THE PRODUCT PAGE AS EXPLORE OPENS IT, for scripts/check-product-dark-round31.mjs.
 *
 * The real app/(marketing)/p/[slug]/page.tsx and its layout, called the way the app router calls them for
 * /<handle>/<slug>?layout=discover&recommended=1, with the data they read answered from fixtures (the probe swaps the
 * loaders, the Supabase clients and next/headers for stubs that read globalThis.__productFixture).
 *
 *   renderProduct(which)          the page rendered to HTML on the server: its first paint
 *   mountProduct(which, el)       the same element tree mounted in a browser, so the client parts run: the buy card
 *                                 settles, the option rows and the physical options appear, the wishlist button can be
 *                                 hovered and pressed, the sticky buy bar comes up on scroll
 *
 * The cases, each the store config a creator really has:
 *   default     no store config at all (a creator who never opened the builder)
 *   template    the template the builder stores the first time it opens (lib/store-builder/defaults
 *               defaultProductPageConfig: Reviews and More from, colours of "transparent")
 *   published   that template after the creator page was published with the default scheme: every colour of
 *               themePresets.default written into it (components/store-builder/store-builder-context)
 *   variants    published, on a download with three options
 *   physical    published, on a product that ships, with sizes and colours
 *   variantsplain, physicalplain   the same two with no store config: a near black accent instead of the blue
 *   custom      a look of the creator's own: the Sage scheme
 *   owncolour   the default scheme with a buy button colour of the creator's own
 */
import React from "react"
import { renderToReadableStream } from "react-dom/server"
import ProductPage from "@/app/(marketing)/p/[slug]/page"
import ProductLayout from "@/app/(marketing)/p/[slug]/layout"
import { defaultProductPageConfig, themePresets } from "@/lib/store-builder/defaults"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"

/* What publishing the creator page with the default scheme writes into the product template (the shop publish in store-builder-context). */
function publishedTemplate() {
  const t = themePresets.default
  const base = JSON.parse(JSON.stringify(defaultProductPageConfig))
  return {
    ...base,
    globalSettings: { themePreset: "default" },
    globalColors: { backgroundColor: t.sections.pageBackgroundColor },
    headerSettings: {
      ...base.headerSettings,
      colors: { backgroundColor: t.sections.pageBackgroundColor, textColor: t.colors.foreground },
      creatorBar: { visible: true, backgroundColor: t.creatorBar.backgroundColor, textColor: t.creatorBar.textColor, buttonColor: t.creatorBar.buttonColor, buttonTextColor: t.creatorBar.buttonTextColor, buttonBorderRadius: t.creatorBar.buttonBorderRadius, buttonStyle: "style4" },
      stickyAddToCart: { visible: true, backgroundColor: t.stickyAddToCart.backgroundColor, buttonColor: t.stickyAddToCart.buttonColor, buttonTextColor: t.stickyAddToCart.buttonTextColor, borderRadius: t.stickyAddToCart.borderRadius, borderColor: t.colors.border, textColor: t.stickyAddToCart.textColor, buttonStyle: "add_to_cart" },
      buyButtonColor: t.productHeader.buyButtonColor,
      buyButtonTextColor: t.productHeader.buyButtonTextColor,
      buttonsBorderRadius: t.productHeader.buttonsBorderRadius,
      faqColors: { ...t.faqSection },
      reviewsColors: { ...t.reviewsSection, backgroundColor: undefined },
      productCardColors: { textColor: t.productCard.textColor, priceColor: t.productCard.priceColor, backgroundColor: t.productCard.backgroundColor, borderColor: t.productCard.borderColor },
      priceContainerColors: { ...t.priceContainer },
      wishlistButtonColors: { ...t.wishlistButton },
      viewInLibraryButtonColors: { ...t.viewInLibraryButton },
    },
  }
}

const VARIANTS = [
  { id: "v-1", name: "Recipes only", description: "Forty recipes as a PDF.", price_cents: 1900, max_purchases: null, position: 0, product_variant_files: [] },
  { id: "v-2", name: "Recipes and firing log", description: "The PDF and a printable kiln log.", price_cents: 2400, max_purchases: null, position: 1, product_variant_files: [] },
  { id: "v-3", name: "Studio licence", description: "For a teaching studio of up to twelve.", price_cents: 6900, max_purchases: null, position: 2, product_variant_files: [] },
]

export const CASES: Record<string, { config: unknown; type?: string; variants?: unknown[] }> = {
  default: { config: null },
  template: { config: defaultProductPageConfig },
  published: { config: publishedTemplate() },
  variants: { config: publishedTemplate(), variants: VARIANTS },
  physical: { config: publishedTemplate(), type: "physical" },
  variantsplain: { config: null, variants: VARIANTS },
  physicalplain: { config: null, type: "physical" },
  custom: { config: { ...publishedTemplate(), globalSettings: { themePreset: "sage" } } },
  owncolour: { config: { ...publishedTemplate(), headerSettings: { ...publishedTemplate().headerSettings, buyButtonColor: "#111111" } } },
}

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const dec = new TextDecoder()
  let out = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out += dec.decode(value, { stream: true })
  }
  return out + dec.decode()
}

/* An async component in the tree (the page, the layout) is resolved here before React renders it: no RSC renderer in a probe. */
async function resolve(node: unknown): Promise<unknown> {
  if (Array.isArray(node)) return Promise.all(node.map(resolve))
  if (!node || typeof node !== "object" || !("type" in (node as object))) return node
  const el = node as React.ReactElement<{ children?: unknown }>
  if (typeof el.type === "function" && el.type.constructor?.name === "AsyncFunction") {
    return resolve(await (el.type as unknown as (p: unknown) => Promise<unknown>)(el.props))
  }
  const kids = el.props?.children
  if (kids === undefined) return el
  return (React.cloneElement as unknown as (e: unknown, p: undefined, ...c: unknown[]) => unknown)(el, undefined, ...([] as unknown[]).concat(await resolve(kids)))
}

async function productTree(which: string): Promise<React.ReactElement> {
  const c = CASES[which]
  if (!c) throw new Error(`no case ${which}`)
  ;(globalThis as { __productFixture?: unknown }).__productFixture = c
  const slug = "glaze-notes"
  const params = Promise.resolve({ slug })
  const searchParams = Promise.resolve({ layout: "discover", recommended: "1" })
  const page = await ProductPage({ params, searchParams } as never)
  const tree = await ProductLayout({ children: (await resolve(page)) as React.ReactNode, params } as never)
  /* The marketing layout's settings, as production has them: the light buyer header, physical commerce on. */
  return (
    <PlatformSettingsProvider exploreMarketplace buyerHeaderLight physicalCommerce>
      {(await resolve(tree)) as React.ReactElement}
    </PlatformSettingsProvider>
  )
}

export async function renderProduct(which: string): Promise<string> {
  const stream = await renderToReadableStream(await productTree(which))
  await (stream as unknown as { allReady: Promise<void> }).allReady
  return streamToString(stream)
}

export async function mountProduct(which: string, el: HTMLElement, wrap: (page: React.ReactElement) => React.ReactNode = (p) => p): Promise<void> {
  const { createRoot } = await import("react-dom/client")
  const tree = await productTree(which)
  createRoot(el).render(wrap(tree))
}
