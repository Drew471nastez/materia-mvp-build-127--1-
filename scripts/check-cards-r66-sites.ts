/**
 * The stores scripts/check-cards-r66.mjs measures: a Materia template drawn by
 * the compat engine's answer(), as a live store is, on a local port
 * (scripts/theme-templates/site.ts serve), with the shop and the home page
 * the check asks for.
 */
import { importTemplate, siteFor, serve, type SampleProduct } from "./theme-templates/site"

export interface SiteSpec {
  /** A Materia template: "creator" (liam-bailey.storelib.com's), "notionpage" (Northpaper) ... */
  template: string
  /** How many products the shop has. */
  products: number
  /** Product pictures, in productsDir, used in turn. */
  images: string[]
  /** Where the product pictures are. */
  productsDir: string
  /** The home page as an admin-built creator site has it (lib/admin/creator-site/tailor.ts): the header, a Products listing of this many per row, the footer. */
  perRow?: number
  /** The header's wishlist icon on or off; absent, as the template has it. */
  wishlistIcon?: boolean
  /** The footer's logo as a picture Storelib cannot read the size of (an uploaded logo's address), as on a live store. */
  footerLogo?: string
}

type Section = { id: string; type: string; settings: Record<string, unknown>; blocks?: unknown; block_order?: string[]; group?: string }

export async function startSite(spec: SiteSpec): Promise<{ base: string; close: () => void; missing: string[] }> {
  const imported = await importTemplate(`materia/${spec.template}`)
  const products: SampleProduct[] = Array.from({ length: spec.products }, (_, i) => ({
    title: `Programme ${i + 1}`,
    price: "$19.00",
    image: spec.images[i % spec.images.length],
    images: [spec.images[(i + 1) % spec.images.length]],
    kind: "digital",
    description: "A twelve week plan with every session written out.",
  }))
  const built = siteFor(imported, { name: "Shop", products })
  const pages = built.site.pages as unknown as Record<string, Section[]>
  for (const list of Object.values(pages)) {
    for (const s of list) {
      if (spec.wishlistIcon !== undefined && /header/.test(s.type) && s.settings && "show_wishlist_icon" in s.settings) s.settings.show_wishlist_icon = spec.wishlistIcon
      if (spec.footerLogo && /footer/.test(s.type) && s.blocks && typeof s.blocks === "object") {
        for (const b of Object.values(s.blocks as Record<string, { type: string; settings: Record<string, unknown> }>)) if (b.type === "store_info") b.settings = { ...b.settings, image: spec.footerLogo, show_logo: true }
      }
    }
  }
  if (spec.perRow) {
    const home = pages.home
    const chrome = home.filter((s) => s.group === "header" || s.group === "footer" || s.group === "overlay" || /header|footer/.test(s.type))
    const header = chrome.filter((s) => /header/.test(s.type) || s.group === "header")
    const rest = chrome.filter((s) => !header.includes(s))
    const listing: Section = {
      id: "products",
      type: "products-listing",
      settings: {
        color_scheme: "default",
        section_width: "container",
        items_to_show: Math.min(Math.max(spec.products, 1), 12),
        items_per_row: spec.perRow,
        items_per_row_mobile: spec.products === 1 ? 1 : 2,
        column_gap: 24,
        row_gap: 40,
        header_alignment: "left",
        heading: "Programmes",
        show_price: true,
        show_add_to_cart: false,
        show_action: true,
        padding_top: 88,
        padding_bottom: 96,
      },
      blocks: {},
      block_order: [],
    }
    pages.home = [...header, listing, ...rest]
  }
  const { base, server, missing } = await serve(built, spec.productsDir, { eager: true })
  return { base, close: () => server.close(), missing }
}
