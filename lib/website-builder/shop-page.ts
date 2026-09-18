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
 *  THE SAME PAGE, WITH A QUESTION AT THE TOP OF IT
 * ===========================================================================
 * A search result is the shop page with a smaller list on it, so it is built
 * from the same pieces rather than from a second layout that would drift away
 * from the first one. What differs is the heading, which says what was asked
 * and what came back, and that is the whole of the difference.
 */
export function searchSections(
  homeSections: SectionInstance[],
  theme: ThemeSettingsValues,
  query: string,
  resultCount: number,
): SectionInstance[] {
  const sections = shopSections(homeSections, theme)
  const trimmed = query.trim()

  return sections.map((section) => {
    if (section.id !== GRID_ID) return section
    return {
      ...section,
      settings: {
        ...section.settings,
        /* Their words back to them, and the count, so a page with nothing on
           it still says why. Not "No results found for your query". */
        heading: trimmed ? `${resultCount} for "${trimmed}"` : "Search",
        subheading: trimmed
          ? resultCount === 0
            ? "Nothing here matched. Try a shorter word."
            : ""
          : "Type what you are looking for.",
      },
    }
  })
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
