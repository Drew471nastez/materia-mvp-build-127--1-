export const STORELIB_CATEGORIES = [
  "Getting Started",
  "Creator Tips",
  "Growth",
  "Strategy",
  "Product Updates",
  "Case Studies",
  "Tutorials",
  "Announcements",
] as const

export type StorelibCategory = typeof STORELIB_CATEGORIES[number]

export const CATEGORY_SUBTITLES: Record<string, string> = {
  "Getting Started": "Everything you need to launch your first digital product store, from choosing what to sell to getting your first sale.",
  "Creator Tips": "Practical advice to help you create, market, and sell digital products more effectively.",
  "Growth": "Strategies to grow your audience, reach new customers, and scale your creator business.",
  "Strategy": "Business frameworks and pricing tactics for building a sustainable creator income.",
  "Product Updates": "The latest features, improvements, and news straight from the Storelib team.",
  "Case Studies": "Real stories from creators who've built successful businesses on Storelib.",
  "Tutorials": "Step-by-step guides to get the most out of every Storelib feature.",
  "Announcements": "Important news and milestones from the Storelib team.",
}

export function categoryToSlug(cat: string): string {
  return cat.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
}

export function slugToCategory(slug: string): string | null {
  return STORELIB_CATEGORIES.find(c => categoryToSlug(c) === slug) || null
}
