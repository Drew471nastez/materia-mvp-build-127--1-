// Marketplace FEED + category-page chrome translations (explore feed).
// The bulk of the feed's filter/sort/subcategory/section/empty-state strings
// already live in lib/i18n/dict/marketplace.ts and the base dictionaries.ts
// (e.g. "feed.recommended", "marketplace.filters", "marketplace.sort_by",
// "search.clear", "product.free") and are REUSED directly rather than
// duplicated here. This module only owns the small "All <category>" prefix
// used when composing dynamic category labels in the feed (e.g. "All Sneakers").
export const feedDict: Record<"ro" | "en", Record<string, string>> = {
  ro: {
    "feed.all": "Toate",
  },
  en: {
    "feed.all": "All",
  },
}
