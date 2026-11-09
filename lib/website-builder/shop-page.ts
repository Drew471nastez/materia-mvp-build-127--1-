/**
 * ===========================================================================
 *  THE SHOP PAGE, BUILT FROM THE SITE'S OWN PIECES
 * ===========================================================================
 * `/products` is the address every theme's "Shop" link points at, and the
 * product grid's "See everything" button too. It has no content of its own to
 * edit: it is the creator's header, every product they sell, and the
 * creator's footer. So rather than inventing a page in the database that a
 * creator would then have to maintain, it is composed from the home page's
 * chrome and one product grid reading the shop.
 *
 * The grid is the SAME section the editor offers, with `source: "shop"`, so
 * the cards here are the cards on the home page: same markup, same theme, same
 * card link. Nothing new to keep in step.
 */
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import { chromeOf, withUniversalChrome } from "@/lib/website-builder/universal-chrome"

/** The id is fixed, not generated: the same page must render the same twice. */
const SEARCH_ID = "storelib-search"
const GRID_ID = "shop-all-products"
const NOT_FOUND_ID = "storelib-not-found"

/**
 * THE COLOUR SCHEME OF THE PAGE BETWEEN THE CHROME. A generated page used to
 * be white whatever the site was, so on a dark theme the shop, the search
 * results and the 404 page were a white band between a black header and a
 * black footer. They take the header's scheme, then the footer's, and are
 * white only when neither says.
 */
export function chromeScheme(homeSections: SectionInstance[]): string {
  for (const type of ["header", "footer"]) {
    /*
      A header or footer of the site's own (round N, N3: an AI component placed in the header or footer group) counts
      too: on a free site the shop, search and 404 pages before the agent designs them are drawn in that frame's
      scheme, the site's own tokens, not in the default white.
    */
    const scheme = homeSections.find((s) => !s.hidden && (s.type === type || s.group === type))?.settings?.color_scheme
    if (typeof scheme === "string" && scheme.trim() !== "") return scheme
  }
  return "white"
}

export function shopSections(
  homeSections: SectionInstance[],
  theme: ThemeSettingsValues,
): SectionInstance[] {

  /**
   * The heading is the shop's own name, not a sentence about shopping. The
   * brand name is what the creator already typed; "Shop" is the fallback
   * because it is what the link that brought them here said.
   */
  const brand = typeof theme.brand_name === "string" ? theme.brand_name.trim() : ""

  const grid: SectionInstance = {
    id: GRID_ID,
    type: "product_grid",
    name: "Product Grid",
    settings: {
      source: "shop",
      heading: brand ? `${brand} shop` : "Shop",
      subheading: "",
      eyebrow: "",
      align: "left",
      columns: { desktop: 3, tablet: 2, mobile: 1 },
      shape: "1 / 1",
      show_price: true,
      /* The shop is where a visitor narrows the list: price, stock, type,
         options and an order, from the address (lib/products/catalog-filters.ts). */
      show_filters: true,
      // No "See everything" button: this is everything.
      button_text: "",
      button_url: "",
      max_width: "wide",
      color_scheme: chromeScheme(homeSections),
      padding_top: 72,
      padding_bottom: 72,
    },
    blocks: [],
    hidden: false,
  }

  /* The header group and the footer group, announcement bars included: lib/website-builder/universal-chrome.ts. */
  return withUniversalChrome([grid], chromeOf(homeSections))
}

/**
 * ===========================================================================
 *  A SEARCH PAGE IS A SECTION, LIKE EVERY OTHER PAGE
 * ===========================================================================
 * This used to be the shop page with its heading rewritten: a product grid
 * pretending to be a search result. It read correctly and it could not be
 * edited, because a creator opening the page in the builder found a Product
 * Grid whose heading changed by itself, and there was nowhere to set the
 * field's placeholder, its button, or what the page says when nothing
 * matched.
 *
 * It is a `search` section now, with its own schema, so the builder shows it
 * in the sidebar like any other and the editor and the published page are
 * the same thing. The field is part of it, above the results, because a
 * visitor who searched and got the wrong thing changes one word rather than
 * going back to the header to start again.
 *
 * WITH NO QUERY IT IS THE WHOLE SHOP, which is what a search page shows
 * before anybody has searched, and what the builder shows a creator who is
 * designing it.
 */
export function searchSections(homeSections: SectionInstance[]): SectionInstance[] {

  const search: SectionInstance = {
    id: SEARCH_ID,
    type: "search",
    name: "Search results",
    settings: {
      heading: "Search",
      intro: "Everything in the shop.",
      placeholder: "Search products",
      button_text: "Search",
      empty_text: "Check the spelling, or try a shorter word.",
      all_label: "See all products",
      all_url: "/products",
      show_price: true,
      columns: { desktop: 4, tablet: 3, mobile: 2 },
      shape: "1 / 1",
      max_width: "wide",
      color_scheme: chromeScheme(homeSections),
      padding_top: 60,
      padding_bottom: 60,
    },
    blocks: [],
    hidden: false,
  }

  /* The header group and the footer group, announcement bars included: lib/website-builder/universal-chrome.ts. */
  return withUniversalChrome([search], chromeOf(homeSections))
}

/**
 * ===========================================================================
 *  THE 404 PAGE, LIKE THE SEARCH PAGE: CHROME AND ONE SECTION
 * ===========================================================================
 * An address the site does not have still belongs to the site. The visitor
 * gets the creator's header and footer, one line saying the page is not
 * here, the way home, a search box and a few things from the shop: the
 * `not_found` section, which the builder shows in the sidebar like any
 * other once the creator opens the 404 page from the page switcher.
 */
export function notFoundSections(homeSections: SectionInstance[]): SectionInstance[] {

  const notFound: SectionInstance = {
    id: NOT_FOUND_ID,
    type: "not_found",
    name: "Page not found",
    settings: {
      heading: "This page is not here",
      text: "The link may be old, or the page may have moved.",
      button_text: "Back to the home page",
      button_url: "/",
      show_search: true,
      search_placeholder: "Search the shop",
      search_button: "Search",
      show_products: true,
      products_heading: "From the shop",
      product_count: 4,
      color_scheme: chromeScheme(homeSections),
      padding_top: 96,
      padding_bottom: 96,
    },
    blocks: [],
    hidden: false,
  }

  /* The header group and the footer group, announcement bars included: lib/website-builder/universal-chrome.ts. */
  return withUniversalChrome([notFound], chromeOf(homeSections))
}

/**
 * ===========================================================================
 *  THE COLLECTIONS PAGE: EVERY COLLECTION, IN THE SITE'S CHROME
 * ===========================================================================
 * Shopify's list-collections template, at /collections: the creator's
 * header and footer around one Collection list showing every published
 * collection. Like the shop and the 404 page it is generated until the
 * creator opens it in the builder, and stored from their first save.
 */
const COLLECTIONS_ID = "storelib-collections"

export function collectionsPageSections(homeSections: SectionInstance[]): SectionInstance[] {
  const header = homeSections.find((s) => s.type === "header")
  const footer = homeSections.find((s) => s.type === "footer")
  const list: SectionInstance = {
    id: COLLECTIONS_ID,
    type: "collections_grid",
    name: "Collection list",
    settings: {
      source: "all",
      chosen: [],
      heading: "Collections",
      subheading: "",
      align: "left",
      columns: { desktop: 3, tablet: 2, mobile: 1 },
      shape: "4 / 5",
      show_count: true,
      count_one: "product",
      count_many: "products",
      show_description: false,
      button_text: "",
      button_url: "/collections",
      color_scheme: chromeScheme(homeSections),
      padding_top: 72,
      padding_bottom: 96,
    },
    blocks: [],
    hidden: false,
  }
  return [...(header ? [header] : []), list, ...(footer ? [footer] : [])]
}

/**
 * ===========================================================================
 *  A PAGE THE CREATOR ADDS: SHOPIFY'S DEFAULT PAGE TEMPLATE
 * ===========================================================================
 * The site's header, a Page content section holding the title they typed
 * and a place to write, and the footer. It used to be the header and the
 * footer with nothing between them, so a new page opened as an empty gap
 * and the first thing to do was find a section that could hold words.
 *
 * `id` is passed in: two pages made in one session must not share one.
 */
export function customPageSections(header: SectionInstance | undefined, footer: SectionInstance | undefined, title: string, id: string): SectionInstance[] {
  const body: SectionInstance = {
    id,
    type: "page_content",
    name: "Page content",
    settings: {
      heading: title.trim().slice(0, 200),
      content: "",
      width: "narrow",
      align: "left",
      color_scheme: "white",
      padding_top: 72,
      padding_bottom: 72,
    },
    blocks: [],
    hidden: false,
  }
  return [...(header ? [header] : []), body, ...(footer ? [footer] : [])]
}

/**
 * Does this product answer the query? Title, description and category, the
 * same three the platform's own search reads, so a word that finds something
 * on Explore finds it here too.
 */
export function productMatchesQuery(product: any, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  /* A row from the database (the header's search) or a shop card (the search
     page), whose fields are under `settings`. The page used to read a card
     as a row, found no title on it, and matched nothing for any word. */
  const s = product?.settings ?? {}
  const fields = [product?.title, product?.description, product?.category, product?.categoryName, s.title, s.description, s.category]
  return fields.some((value) => typeof value === "string" && value.toLowerCase().includes(q))
}


/**
 * ===========================================================================
 *  THE SITE'S CHROME, WITH NOTHING BETWEEN IT
 * ===========================================================================
 * The cart is not a section. It is a list of what a particular visitor has
 * picked, which no template can render and no creator arranges. So the page
 * takes the creator's header and footer and puts the cart between them, the
 * same way the shop and the search page take them and put a grid there.
 *
 * Header and footer rather than a bare page on purpose: a shopper reviewing
 * their basket needs the way back to the shop, the menu, the brand and the
 * policies, and those are exactly what this creator already designed.
 */
export function chromeSections(homeSections: SectionInstance[]): SectionInstance[] {
  return withUniversalChrome([], chromeOf(homeSections))
}

/**
 * A search section lists the shop, always. An older copy of the section file
 * (saved in the code editor or brought in with a theme) could be set to
 * "The ones I pick" with product blocks of its own; those are set aside here
 * when a page is drawn, so every search page answers with what the shop sells.
 */
export function searchListsTheShop<T extends { type: string; settings: Record<string, unknown>; blocks?: unknown[] }>(sections: T[]): T[] {
  let changed = false
  const out = sections.map((s) => {
    if (s.type !== "search" || (s.settings?.source !== "picked" && !(s.blocks?.length))) return s
    changed = true
    return { ...s, settings: { ...s.settings, source: "shop" }, blocks: [] }
  })
  return changed ? out : sections
}

/**
 * ===========================================================================
 *  ONE COLLECTION: SHOPIFY'S COLLECTION PAGE
 * ===========================================================================
 * /collections/<handle>. The shop page with the collection's own name and
 * words above its products, and the same filters and sort: the route hands
 * the grid only the collection's products, in the collection's order, as
 * `products` (app/(site)/w/[username]/collections/[handle]/page.tsx).
 */
export function collectionSections(
  homeSections: SectionInstance[],
  theme: ThemeSettingsValues,
  collection: { title: string; description?: string | null },
  /**
   * The Collection page template as the creator (or Storelib AI) arranged
   * it in the builder, page key "collection". Every collection is drawn
   * with it, Shopify's collection template: a section of its own reads
   * `collection` and `products`, and the shop's own grid, if it is still
   * there, is titled for the collection being shown. Absent or empty, the
   * shop page is the template, as before.
   */
  stored?: SectionInstance[] | null,
): SectionInstance[] {
  const base = stored && stored.length > 0 ? stored : shopSections(homeSections, theme)
  return base.map((s) =>
    s.id === GRID_ID
      ? { ...s, settings: { ...s.settings, heading: collection.title, subheading: (collection.description ?? "").slice(0, 400) } }
      : s,
  )
}
