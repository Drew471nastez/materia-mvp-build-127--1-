/**
 * ===========================================================================
 *  THE CATEGORY IN EXPLORE'S ADDRESS, READ THE SAME ON BOTH SIDES
 * ===========================================================================
 * The page writes `?c=design` (and still reads the older `?category=`) and
 * the server draws the category it names. A pill tap now only rewrites the
 * address in place (history.replaceState: no request, see
 * components/explore/explore-page-client), so the page reads the category
 * back out of the address itself rather than out of the prop the server
 * drew it with, and both must agree on what a valid one is. Pure and
 * browser safe.
 */

/** Every category the address may name: the pills, the header's menu, and All. */
export const EXPLORE_CATEGORY_IDS = [
  "all", "productivity", "design", "social-media", "ai",
  "development", "marketing", "business", "music", "photography",
  "video", "ecommerce", "education", "audio-music", "other", "freebies",
] as const

/** `c` wins over the older `category`; anything unknown is All. */
export function exploreCategoryFrom(params: { get(name: string): string | null } | { c?: string | null; category?: string | null }): string {
  const read = (k: "c" | "category") => ("get" in params && typeof params.get === "function" ? (params as { get(n: string): string | null }).get(k) : (params as Record<string, string | null | undefined>)[k]) ?? ""
  const raw = (read("c") || read("category") || "all").toLowerCase()
  return (EXPLORE_CATEGORY_IDS as readonly string[]).includes(raw) ? raw : "all"
}
