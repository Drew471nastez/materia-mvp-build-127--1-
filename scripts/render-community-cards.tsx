/**
 * The places a community is listed, as their routes draw them, for
 * scripts/check-community-cards.mjs. Every one is the real component:
 *
 *   #explore     /explore?type=communities: the real ExplorePageClient in
 *                communities mode with a first page of cards
 *   #search      /explore?q=clay: the communities that match, above the
 *                products
 *   #storefront  a creator's Communities tab (StorefrontCommunities) on a
 *                page with the creator's own scheme bound to the tokens
 *   #library     /account/communities (LibraryCommunitiesList), the compact
 *                row of the same card, with where the viewer stands
 *
 * Nothing is reimplemented: what is measured is what those pages draw.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { ExplorePageClient } from "@/components/explore/explore-page-client"
import { StorefrontCommunities } from "@/components/community/public/storefront-communities"
import { LibraryCommunitiesList } from "@/components/community/public/library-list"
import type { LibraryCommunityRow } from "@/components/community/public/types"
import type { CommunityCard } from "@/lib/communities/types"

const HUES = [18, 42, 160, 200, 220, 260, 330, 90, 5, 280]
const picture = (i: number, w = 640, h = 360) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="hsl(${HUES[i % HUES.length]} 35% 82%)"/><circle cx="${w * 0.72}" cy="${h * 0.42}" r="${h * 0.22}" fill="hsl(${HUES[i % HUES.length]} 32% 64%)"/><rect x="${w * 0.08}" y="${h * 0.62}" width="${w * 0.42}" height="${h * 0.07}" rx="6" fill="hsl(${HUES[i % HUES.length]} 30% 58%)"/></svg>`,
  )
const logo = (i: number) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="hsl(${HUES[(i + 4) % HUES.length]} 40% 46%)"/><text x="48" y="60" font-family="Inter,Arial" font-size="40" font-weight="700" fill="white" text-anchor="middle">${"CNFWDMP"[i % 7]}</text></svg>`)

const NOW = Date.now()
const DAY = 86_400_000

const NAMES = ["Clubul Calinistilor", "Night Runners: a running club for people who start after dark and finish before midnight", "Film Photo Club", "Founders Weekly", "Design Systems Guild", "Midjourney Makers"]
const communities: CommunityCard[] = NAMES.map((name, i) => ({
  id: `00000000-0000-4000-8000-00000000000${i}`,
  slug: name.toLowerCase().split(":")[0].replace(/[^a-z0-9]+/g, "-"),
  name,
  /* Round 6's sneak peek: a tagline, a long tagline that must stop at two lines, and cards with none that show the description's start. */
  tagline: [
    "A calm place to share work and get honest feedback.",
    null,
    "Film photographers sharing scans, swapping lab tips and running a monthly theme with a roll of the month, plus a long tail of gear talk that never ends, a darkroom night every other Thursday, a swap shelf for expired stock and a guide to the labs that still develop slide film by hand.",
    "Weekly calls for founders.",
    null,
    "",
  ][i],
  excerpt: [null, "We meet after dark for easy runs.", null, null, "Tokens, components and the people who maintain them: a working group for design system teams of every size, from one person to a hundred, with office hours.", null][i],
  /* Card 1's mark and card 0's creator face are uploads on the storage host, so the probe sees the optimizer's address on them (the probe answers it with a picture). */
  logoUrl: i === 3 ? null : i === 1 ? "https://probe.supabase.co/storage/v1/object/public/logos/night.png" : logo(i),
  coverUrl: i === 4 ? null : picture(i + 2),
  category: "design",
  access: (i % 3 === 0 ? "free" : "paid") as CommunityCard["access"],
  visibility: "public",
  memberCount: [3, 12, 284, 9800, 1, 43_500][i],
  priceLine: i % 3 === 0 ? "Free" : ["$9/month", "$19/month", "$49", "$5/month"][i % 4],
  creator: { id: `cr${i}`, name: ["AndrewRullz", "Leo Park", "Ines Duarte", "Sam Reyes", "Noor Ali", "Ava Stone"][i], username: `maker${i}`, avatarUrl: i === 0 ? "https://probe.supabase.co/storage/v1/object/public/avatars/andrew.png" : i % 2 ? null : logo(i + 3) },
  url: `/community/c${i}`,
  viewCount: [57, 40, 5_210, 128_000, 0, 1_200_000][i],
  rating: i === 3 ? { average: 4.6, count: 12 } : i === 2 ? { average: 4.9, count: 37 } : null,
  launchedAt: new Date(NOW - [0.2, 3, 20, 70, 800, 1][i] * DAY).toISOString(),
}))

const products = Array.from({ length: 6 }, (_, i) => ({
  id: `p${i}`,
  title: ["Clay glaze recipes", "Notion Life OS", "Brand Kit Pro", "SaaS Landing Page", "Colouring Pages", "Alfabet Poetic Lp"][i],
  slug: `product-${i}`,
  description: "A short description of a product that is long enough to count as complete for the ranking. ".repeat(2),
  price_cents: [9200, 0, 1849, 4900, 7900, 2500][i],
  compare_at_cents: null,
  thumbnail_url: picture(i),
  type: "digital",
  category: "design",
  categoryName: "Design",
  creator_id: `c${i % 3}`,
  created_at: new Date(NOW - i * DAY * 3).toISOString(),
  sales_count: i,
  reviews_count: 0,
  reviews_average: 0,
  categories: [],
  creator: { id: `c${i % 3}`, slug: `maker${i % 3}`, niche_tags: [], profile: { display_name: ["Andrew Rullz", "Negru W", "Colour Galore"][i % 3], avatar_url: null, username: `maker${i % 3}` } },
}))

const library: LibraryCommunityRow[] = [
  { status: "active", role: "owner", tierName: null, card: communities[0] },
  { status: "active", role: "member", tierName: "Studio members", card: communities[2] },
  { status: "active", role: "moderator", tierName: "Members", card: communities[1] },
  { status: "pending", role: "member", tierName: null, card: communities[3] },
].map(({ status, role, tierName, card }) => ({
  id: card.id,
  slug: card.slug,
  name: card.name,
  logoUrl: card.logoUrl,
  coverUrl: card.coverUrl,
  creatorName: card.creator?.name ?? null,
  status: status as LibraryCommunityRow["status"],
  role: role as LibraryCommunityRow["role"],
  tierName,
  memberCount: card.memberCount,
  url: card.url,
  card,
}))

;(window as any).__fetches = []
window.fetch = (async () => new Response(JSON.stringify({ items: communities, next: null }), { status: 200, headers: { "content-type": "application/json" } })) as typeof window.fetch

const mode = location.hash.replace("#", "") || "explore"
;(window as any).__search = mode === "explore" ? "type=communities" : mode === "search" ? "q=clay" : ""

/* A creator's scheme, as a configured storefront binds it: warm paper, deep ink. */
const CREATOR_SCHEME = {
  "--background": "#fbf7f1",
  "--card": "#fffdf9",
  "--foreground": "#2b2118",
  "--muted": "#f1e9de",
  "--muted-foreground": "#7a6a58",
  "--border": "#e6dccd",
} as React.CSSProperties

function Page() {
  if (mode === "storefront") {
    return (
      <div style={{ ...CREATOR_SCHEME, background: "var(--background)", minHeight: "100svh" }}>
        <div className="border-b border-border px-6 py-4 text-[15px] font-semibold text-foreground">AndrewRullz · Home · Products · Communities</div>
        <StorefrontCommunities cards={communities.slice(0, 5)} />
      </div>
    )
  }
  if (mode === "library") {
    return (
      <div className="min-h-screen bg-[#f8f9fa]">
        <div className="mx-auto w-full max-w-[960px] px-4 pb-10 pt-4 sm:pt-6">
          <div data-page-communities="" className="space-y-3 pb-4">
            <p className="text-[14px] text-[#6b7280]">3 communities</p>
            <LibraryCommunitiesList rows={library} />
          </div>
        </div>
      </div>
    )
  }
  return (
    <main className="explore-ground min-h-screen bg-[#f8f9fa]">
      <div className="mx-auto max-w-[1400px] px-4 pb-6 pt-4 sm:px-6 sm:pb-8 sm:pt-5 lg:px-8">
        <ExplorePageClient
          initialProducts={products}
          initialCategory="all"
          searchQuery={mode === "search" ? "clay" : ""}
          communitiesEnabled
          discoverHeadlineSegmentEnabled={false}
          initialDiscoverMode={mode === "explore" ? "communities" : "products"}
          initialCommunities={mode === "explore" ? { query: "", items: communities, next: null } : null}
          communityResults={mode === "search" ? communities.slice(0, 3) : []}
        />
      </div>
    </main>
  )
}

createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <Page />
  </LocaleProvider>,
)
