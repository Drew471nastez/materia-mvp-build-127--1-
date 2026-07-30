// Translations for the "catpage" surface: the category page chrome
// (components/explore/category-page-client.tsx) and the explore feed sections
// (most-popular-section, recommended-section, featured-categories-section).
//
// Every human-visible string on these surfaces already had a matching key in
// lib/i18n/dict/marketplace.ts (filter/sort labels, empty states, section
// titles, subcategory chrome) or in the base "feed.*" keys defined in
// lib/i18n/dictionaries.ts (e.g. "feed.recommended", "feed.most_popular").
// Those keys are REUSED directly via t(...), so this surface introduces no new
// keys. This module is kept as the area's dedicated dict slot; add any future
// catpage-only strings here (identical key sets in ro + en).
export const catpageDict: Record<"ro" | "en", Record<string, string>> = {
  ro: {},
  en: {},
}
