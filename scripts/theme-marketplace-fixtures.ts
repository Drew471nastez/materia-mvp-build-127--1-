/** Listings for scripts/check-theme-marketplace.mjs: Storelib's own, then nine more in every tier. */
import { builtinListings, type ThemeListing } from "@/lib/themes/marketplace-shared"

const NAMES = ["Fern", "Studio Noir", "Bright Coach", "Beat Drop", "Soft Launch", "Paper Shelf", "Atelier", "Northwind", "Dune"]
const TIERS: ThemeListing["tier"][] = ["free", "pro", "free", "paid", "free", "free", "pro", "free", "paid"]

export function probeListings(cover: string): ThemeListing[] {
  const own = builtinListings().map((l) => ({ ...l, cover: cover || l.cover }))
  return [
    ...own,
    ...NAMES.map((name, i) => ({
      id: `00000000-0000-4000-8000-00000000000${i}`,
      slug: name.toLowerCase().replace(/\s+/g, "-"),
      name,
      author: ["Ana Ruiz", "Kai Studio", "Storelib"][i % 3],
      authorAvatar: null,
      category: ["general", "music", "coaching", "design"][i % 4],
      tier: TIERS[i],
      priceCents: TIERS[i] === "paid" ? 4900 : 0,
      cover: cover || null,
      screenshots: [],
      builtinThemeId: null,
      hasPackage: true,
      packageKind: "storelib" as const,
      demoUrl: null,
      published: true,
      sortOrder: i + 1,
      createdAt: new Date(Date.UTC(2026, 8, 1 + i)).toISOString(),
    })),
  ]
}
