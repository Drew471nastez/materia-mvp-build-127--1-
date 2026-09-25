/**
 * ===========================================================================
 *  EVERY PRODUCT PAGE SHOWS THE PRODUCT
 * ===========================================================================
 * The product template is drawn once per product, and the one section that
 * knows which product it is drawing is `product`: the pictures, the price,
 * the Buy button. Everything else on the template is the same for every
 * product.
 *
 * Every theme used to ship its product template WITHOUT that section. What
 * it had instead was a Split Content section reading "Product name" and
 * "Describe your product here", with a Buy button linking to `#`. The
 * builder added the real section the first time a creator opened the
 * product page and saved it; a creator who never did had every product on
 * their live site drawn as "Product name". The new-theme presets now start
 * with the real section, and this puts it on templates saved before that,
 * as the page is drawn, the same way the builder does.
 *
 * THE PLACEHOLDER IS REPLACED ONLY WHILE IT IS STILL THE PLACEHOLDER: the
 * section the preset made (id `product-hero`), still a Split Content, still
 * saying "Product name". A creator who rewrote it made it theirs, and it is
 * kept; the product section then goes under the header instead.
 *
 * Pure: the route passes the page and gets the page back, the same array
 * when it already had a product section.
 */
import type { SectionInstance } from "./types"

/** The ids and the words the shipped presets gave their placeholder. */
const PLACEHOLDER_ID = "product-hero"
const PLACEHOLDER_HEADINGS = new Set(["product name", "product title"])

/** The main product section, as the builder's own "Default product" preset makes it. */
export function mainProductSection(id = "main-product"): SectionInstance {
  return {
    id,
    type: "product",
    name: "Product",
    hidden: false,
    settings: {
      show_reviews_summary: false,
      reviews_position: "above_title",
      format: "standard",
      color_scheme: "white",
      image_width: "55%",
      multiple_images_layout: "stacked",
      image_click_action: "none",
      image_hover_action: "none",
      product_layout: "two_column",
      show_wishlist: true,
      show_social_icons: false,
      show_whats_included: true,
      show_share_button: true,
      padding_top: 48,
      padding_bottom: 48,
    },
    blocks: [],
  }
}

export function isUntouchedPlaceholder(section: SectionInstance): boolean {
  if (section.id !== PLACEHOLDER_ID || section.type !== "split_content") return false
  const heading = typeof section.settings?.heading === "string" ? section.settings.heading.trim().toLowerCase() : ""
  return PLACEHOLDER_HEADINGS.has(heading)
}

/** The page with a product section on it, where the placeholder was or under the header. */
export function withMainProduct(sections: SectionInstance[]): SectionInstance[] {
  if (sections.some((s) => s.type === "product" && !s.hidden)) return sections
  /* A hidden product section was hidden on purpose. */
  if (sections.some((s) => s.type === "product")) return sections
  const at = sections.findIndex(isUntouchedPlaceholder)
  if (at >= 0) return sections.map((s, i) => (i === at ? mainProductSection() : s))
  const header = sections.findIndex((s) => s.type === "header")
  const out = [...sections]
  out.splice(header + 1, 0, mainProductSection())
  return out
}
