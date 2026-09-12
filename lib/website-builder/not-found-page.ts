/**
 * ===========================================================================
 *  A PAGE THAT IS NOT THERE, ON THE SITE IT IS NOT THERE ON
 * ===========================================================================
 * A creator's header ships with links to /about and /products. Follow one to
 * a page they have not published and the answer was Storelib's own 404: a
 * grey "Page not found" and a button labelled "Explore Storelib". On
 * somebody's own shop that reads as the shop being broken, and it sends the
 * visitor to a different website.
 *
 * A site says this in its own voice instead: its header, its footer, its
 * colours and type, and a way back into it rather than out of it. Composed
 * from sections the theme already has, so there is no second design to keep
 * in step, and drawn through the same renderer as every other page.
 */
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

/** Fixed, not generated: the same page must render the same twice. */
const HERO_ID = "not-found-hero"

export function notFoundSections(
  homeSections: SectionInstance[],
  theme: ThemeSettingsValues,
): SectionInstance[] {
  const header = homeSections.find((s) => s.type === "header")
  const footer = homeSections.find((s) => s.type === "footer")

  const brand = typeof theme.brand_name === "string" ? theme.brand_name.trim() : ""

  const hero: SectionInstance = {
    id: HERO_ID,
    type: "hero_centered",
    name: "Page not found",
    settings: {
      eyebrow: "",
      heading: "That page is not here",
      subheading: brand
        ? `The link may be old, or the page may have moved. Everything else on ${brand} is still where it was.`
        : "The link may be old, or the page may have moved.",
      button_text: "Back to the home page",
      button_url: "/",
      button2_text: "",
      button2_url: "",
      note: "",
      background: "colour",
      max_width: "medium",
      full_height: false,
      color_scheme: "white",
      padding_top: 120,
      padding_bottom: 120,
    },
    blocks: [],
    hidden: false,
  }

  return [...(header ? [header] : []), hero, ...(footer ? [footer] : [])]
}
