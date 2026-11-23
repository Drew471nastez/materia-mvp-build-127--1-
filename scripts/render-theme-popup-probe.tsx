/**
 * The Website page mounted in a browser for scripts/check-theme-popup.mjs:
 * the real WebsiteBuilderClient with fixture websites and listings, so the
 * script can open the theme marketplace popup, close it, add from it and go
 * Back, and measure each.
 *
 *   ?create=1   the page as /app/website-builder/ai draws it
 *   ?full=1     a library with no room, for the full library sheet
 *   ?empty=1    no website at all
 *   ?listed=1   a draft added from the Clothing template on an earlier visit,
 *               with no photograph yet (settings.compat.listing)
 *   ?land=1     an Add's new website arrives in the library 300ms after the
 *               answer, as the page's refresh would bring it
 *   ?covers=each  every listing on a cover of its own (/cover.svg?l=slug),
 *               so the script can count each picture's requests
 *   ?covers=real  every listing on its real cover (public/themes/materia),
 *               the four extra ones on another template's, for
 *               scripts/check-builder-modals-r58.mjs
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
import { THEME_INSTALL_LIMIT } from "@/lib/website-builder/theme-registry"

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
    ? [site("s1", "Candle shop", "published"), ...["Autumn sale", "Gift guide", "Wholesale", "Old look", "Spring", "Studio", "Market", "Atelier"].slice(0, THEME_INSTALL_LIMIT - 1).map((n, i) => site(`s${i + 2}`, n, "draft"))]
    : [site("s1", "Candle shop", "published"), site("s2", "Autumn sale", "draft"), ...(q.has("listed") ? [{ ...site("s3", "Clothing", "draft"), settings: { compat: { listing: "clothing" } } as unknown as WebsiteSummary["settings"] }] : [])]

const EXTRA: [string, string, ThemeListing["tier"]][] = [
  ["Fern", "photography", "free"],
  ["Bright Coach", "coaching", "free"],
  ["Studio Noir", "design", "pro"],
  ["Paper Shelf", "ebooks", "paid"],
]

const real = q.get("covers") === "real"
const realCovers = builtinListings().map((l) => l.cover)
const listings: ThemeListing[] = [
  ...builtinListings().map((l) => ({ ...l, cover: real ? l.cover : q.has("covers") ? `${cover}?l=${l.slug}` : cover })),
  ...EXTRA.map(([name, category, tier], i) => ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    author: "Storelib",
    authorAvatar: null,
    category,
    tier,
    priceCents: tier === "paid" ? 4900 : 0,
    cover: real ? realCovers[(i * 3 + 1) % realCovers.length] : q.has("covers") ? `${cover}?l=${name.toLowerCase().replace(/\s+/g, "-")}` : cover,
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

const root = createRoot(document.getElementById("root")!)
let library = installs
const draw = () => root.render(createElement(TooltipProvider, null, createElement(WebsiteBuilderClient, { installs: library, username: "candleshop", listings, create: q.has("create") })))
draw()

/* ?land=1: the refreshed library has the website an Add made, with no photograph and no settings yet. */
if (q.has("land")) {
  const real = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await real(input, init)
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    if (/\/marketplace\/add$/.test(url)) {
      const slug = (JSON.parse(String(init?.body ?? "{}")) as { slug?: string }).slug
      const name = listings.find((l) => l.slug === slug)?.name ?? "New"
      setTimeout(() => {
        library = [...library, site("new-1", name, "draft")]
        draw()
      }, 300)
    }
    return res
  }
}
