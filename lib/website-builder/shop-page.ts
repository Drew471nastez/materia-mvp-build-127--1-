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

/** The id is fixed, not generated: the same page must render the same twice. */
const SEARCH_ID = "storelib-search"
const GRID_ID = "shop-all-products"

export function shopSections(
  homeSections: SectionInstance[],
  theme: ThemeSettingsValues,
): SectionInstance[] {
  const header = homeSections.find((s) => s.type === "header")
  const footer = homeSections.find((s) => s.type === "footer")

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
      // No "See everything" button: this is everything.
      button_text: "",
      button_url: "",
      max_width: "wide",
      color_scheme: "white",
      padding_top: 72,
      padding_bottom: 72,
    },
    blocks: [],
    hidden: false,
  }

  return [...(header ? [header] : []), grid, ...(footer ? [footer] : [])]
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
  const header = homeSections.find((s) => s.type === "header")
  const footer = homeSections.find((s) => s.type === "footer")

  const search: SectionInstance = {
    id: SEARCH_ID,
    type: "search",
    name: "Search results",
    settings: {
      heading: "Search",
      intro: "Everything in the shop.",
      placeholder: "Search products",
      button_text: "Search",
      empty_text: "Nothing matched. Try a shorter word.",
      show_price: true,
      columns: { desktop: 3, tablet: 2, mobile: 1 },
      shape: "1 / 1",
      max_width: "wide",
      color_scheme: "white",
      padding_top: 60,
      padding_bottom: 60,
    },
    blocks: [],
    hidden: false,
  }

  return [...(header ? [header] : []), search, ...(footer ? [footer] : [])]
}

/**
 * Does this product answer the query? Title, description and category, the
 * same three the platform's own search reads, so a word that finds something
 * on Explore finds it here too.
 */
export function productMatchesQuery(product: any, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const fields = [product?.title, product?.description, product?.category, product?.categoryName]
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
  const header = homeSections.find((s) => s.type === "header")
  const footer = homeSections.find((s) => s.type === "footer")
  return [...(header ? [header] : []), ...(footer ? [footer] : [])]
}
