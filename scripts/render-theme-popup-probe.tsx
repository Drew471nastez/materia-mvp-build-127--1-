/**
 * The Website page mounted in a browser for scripts/check-theme-popup.mjs:
 * the real WebsiteBuilderClient with fixture websites and listings, so the
 * script can open the theme marketplace popup, close it, add from it and go
 * Back, and measure each.
 *
 *   ?create=1   the page as /app/website-builder/ai draws it
 *   ?full=1     a library with no room, for the full library sheet
 *   ?empty=1    no website at all
 *
 * The listings are whatever builtinListings() returns today, on the cover
 * the script serves (their desktop and phone screenshots stay the real
 * files in public/themes, which the preview draws), then four more from
 * packages (two free, one with a plan, one with a price) with no pictures of
 * their own, so every state of a card and of the preview has something to show.
 */
import { createElement } from "react"
import { createRoot } from "react-dom/client"

import { TooltipProvider } from "@/components/ui/tooltip"
import { WebsiteBuilderClient, type WebsiteSummary } from "@/app/(storelib)/app/website-builder/website-builder-client"
import { builtinListings, type ThemeListing } from "@/lib/themes/marketplace-shared"

const q = new URLSearchParams(window.location.search)
const cover = "/cover.svg"
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

const site = (id: string, name: string, status: WebsiteSummary["status"]): WebsiteSummary => ({
  id,
  name,
  status,
  theme_id: `theme-${id}`,
  created_at: ago(60 * 24),
  updated_at: ago(4),
  published_at: status === "published" ? ago(4) : null,
  snapshot_url: null,
  snapshot_mobile_url: null,
  snapshot_updated_at: null,
  saved_at: ago(4),
  theme: { name, version: "1.0.0", slug: "probe" },
  settings: null,
})

const installs: WebsiteSummary[] = q.has("empty")
  ? []
  : q.has("full")
    ? [site("s1", "Candle shop", "published"), site("s2", "Autumn sale", "draft"), site("s3", "Gift guide", "draft"), site("s4", "Wholesale", "draft"), site("s5", "Old look", "draft")]
    : [site("s1", "Candle shop", "published"), site("s2", "Autumn sale", "draft")]

const EXTRA: [string, string, ThemeListing["tier"]][] = [
  ["Fern", "photography", "free"],
  ["Bright Coach", "coaching", "free"],
  ["Studio Noir", "design", "pro"],
  ["Paper Shelf", "ebooks", "paid"],
]

const listings: ThemeListing[] = [
  ...builtinListings().map((l) => ({ ...l, cover })),
  ...EXTRA.map(([name, category, tier], i) => ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    author: "Storelib",
    authorAvatar: null,
    category,
    tier,
    priceCents: tier === "paid" ? 4900 : 0,
    cover,
    screenshots: [],
    builtinThemeId: null,
    codePackage: null,
    hasPackage: true,
    packageKind: "storelib" as const,
    demoUrl: null,
    published: true,
    sortOrder: i + 1,
    createdAt: new Date(Date.UTC(2026, 8, 1 + i)).toISOString(),
  })),
]

/* What the page was given, so the script can check the popup lists every one of them. */
;(window as unknown as { __probeListings: string[] }).__probeListings = listings.map((l) => l.slug)

createRoot(document.getElementById("root")!).render(
  createElement(TooltipProvider, null, createElement(WebsiteBuilderClient, { installs, username: "candleshop", listings, create: q.has("create") })),
)
