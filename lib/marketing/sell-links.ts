/**
 * The /sell/<use case> pages by name only, for places that draw a link to
 * each and nothing more (the marketing footer, a client component on every
 * page). lib/marketing/use-cases holds the pages themselves and reads its
 * slugs, names and switches from here, so the two cannot disagree; this file
 * imports nothing, so the footer's bundle does not carry the fee tables.
 */
export const SELL_BASE = "/sell"

export const SELL_PAGES = [
  { slug: "digital-products", nav: "Sell digital products" },
  { slug: "online-courses", nav: "Sell online courses" },
  /* Waits behind the communities switch (lib/communities/flag): a 404 and out of the sitemap while it is off. */
  { slug: "communities", nav: "Run a paid community", flag: "communities" },
  { slug: "creator-website", nav: "Build a creator website" },
] as const

export type UseCaseSlug = (typeof SELL_PAGES)[number]["slug"]

export function useCasePath(slug: string): string {
  return `${SELL_BASE}/${slug}`
}
