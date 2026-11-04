/**
 * ===========================================================================
 *  THE CATEGORIES THAT HAVE A PAGE
 * ===========================================================================
 * `/explore/<something>` is a real route with a real list, and it calls
 * `notFound()` for anything it does not recognise. The list of what it
 * recognises lived inside that route file, so nothing that BUILT a link to it
 * could check.
 *
 * And something did. The explore page's "Show All … Products" button links to
 * `/explore/<the selected pill>`, and one of the pills is "For you" — which is
 * a feed, not a category, and has no page. Pressing it landed on a 404 with
 * the products still sitting on the page behind it.
 *
 * So the list is here, the route imports it, and anything drawing a link to a
 * category page asks it first. A pill that has no page does not get a link to
 * one.
 */
export const CATEGORY_PAGES = [
  "design",
  "development",
  "marketing",
  "business",
  "ai",
  "social-media",
  "productivity",
  "photography",
  "video",
  "audio-music",
  "education",
  "ecommerce",
  "freebies",
  "other",
] as const

export type CategoryPage = (typeof CATEGORY_PAGES)[number]

/** Whether `/explore/<id>` is a page rather than a 404. */
export function hasCategoryPage(id: string | null | undefined): id is CategoryPage {
  return !!id && (CATEGORY_PAGES as readonly string[]).includes(id)
}

/**
 * "Show All Design Products", or just "Show All Products".
 *
 * The section's title falls back to the word "Products" for anything it
 * cannot name, and the button appended "Products" to whatever it said — so
 * the one case that fell through read "Show All Products Products". Here
 * rather than inline so it can be driven with the awkward inputs rather than
 * read back as a regex.
 */
export function showAllLabel(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim()
  return !trimmed || trimmed.toLowerCase() === "products" ? "Show All Products" : `Show All ${trimmed} Products`
}

/** The other pages under /explore, which are not categories. */
const EXPLORE_OWN_PAGES = ["communities", "search"]

/**
 * `/explore/<x>` for an x that is no page: proxy.ts answers it 404 before the
 * page runs. /explore's own loading.tsx wraps every child, so the category
 * page's notFound() came after a 200 had been sent: a soft 404, measured live
 * (round 45).
 */
export function unknownExploreCategory(pathname: string): boolean {
  const m = /^\/explore\/([^/]+)\/?$/.exec(pathname)
  if (!m) return false
  let seg = m[1]
  try {
    seg = decodeURIComponent(seg)
  } catch {
    return true
  }
  return !hasCategoryPage(seg) && !EXPLORE_OWN_PAGES.includes(seg)
}
