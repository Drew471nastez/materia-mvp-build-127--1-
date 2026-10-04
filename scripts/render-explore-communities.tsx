/**
 * Explore as the route draws it, for scripts/check-explore-communities.mjs:
 * the real ExplorePageClient inside the route's <main> and container, and
 * the real ConditionalFooter under it (the marketing layout's), so the
 * footer a computer gets on /explore is measured where it really sits.
 *
 *   #products      the products, communities switched on (the hero's
 *                  switcher), one product with a title far too long for its card
 *   #communities   /explore?type=communities: seven real looking community
 *                  cards drawn from a first page, with a next cursor; the
 *                  route's answers come from window.fetch below, filtered
 *                  by the same query the page sends
 *   #off           the products with communities switched off
 *
 * Nothing is reimplemented: what is measured is what Explore draws.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { ExplorePageClient } from "@/components/explore/explore-page-client"
import { ConditionalFooter } from "@/components/marketing/conditional-footer"
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
const CATS = ["design", "development", "business", "marketing", "ai", "education", "productivity", "video", "photography", "audio-music"]

const TITLES = [
  "CineTone Lightroom Presets Pack 1000 Cinematic Film Looks for Portraits, Weddings and Street Photography",
  "Alfabet Poetic Lp",
  "Colouring Pages",
  "Notion Life OS",
  "Brand Kit Pro",
  "SaaS Landing Page",
]
const products = Array.from({ length: 18 }, (_, i) => ({
  id: `p${i}`,
  title: `${TITLES[i % TITLES.length]}${i >= TITLES.length ? ` ${i + 1}` : ""}`,
  slug: `product-${i}`,
  description: "A short description of a product that is long enough to count as complete for the ranking. ".repeat(2),
  price_cents: [9200, 0, 1849, 4900, 7900, 2500][i % 6],
  compare_at_cents: i === 0 ? 23000 : null,
  thumbnail_url: picture(i),
  type: "digital",
  category: CATS[i % CATS.length],
  categoryName: ["Lightroom Presets", "Productivity", "Coloring Pages", "Notion", "Design", "Development"][i % 6],
  creator_id: `c${i % 5}`,
  /* The long title first in the ranking, so it sits in the first row. */
  created_at: new Date(NOW - i * DAY * 3).toISOString(),
  sales_count: i === 0 ? 99 : (i * 7) % 23,
  reviews_count: i % 4,
  reviews_average: 4 + (i % 10) / 10,
  categories: [],
  creator: { id: `c${i % 5}`, slug: `maker${i % 5}`, niche_tags: [], profile: { display_name: ["Andrew Rullz", "Negru W", "Colour Galore", "Sam Reyes", "Noor Ali"][i % 5], avatar_url: null, username: `maker${i % 5}` } },
}))

const NAMES = ["Clay Studio", "Night Runners: a running club for people who start after dark and finish before midnight", "Film Photo Club", "Founders Weekly", "Design Systems Guild", "Midjourney Makers", "Prompt Lab"]
const communities: CommunityCard[] = NAMES.map((name, i) => ({
  id: `00000000-0000-4000-8000-00000000000${i}`,
  slug: name.toLowerCase().split(":")[0].replace(/[^a-z0-9]+/g, "-"),
  name,
  /* Design Systems Guild mentions UI/UX, so the Design > UI/UX Templates pick has one community to narrow to. */
  tagline: i === 4 ? "UI/UX systems, tokens and the people who keep them." : "A calm place to share work and get honest feedback.",
  logoUrl: i === 3 ? null : logo(i),
  coverUrl: i === 4 ? null : picture(i + 2),
  category: ["design", "productivity", "photography", "business", "design", "ai", "ai"][i],
  access: (i % 3 === 1 ? "free" : "paid") as CommunityCard["access"],
  visibility: "public",
  memberCount: [1700, 12, 284, 9800, 1, 43_500, 0][i],
  priceLine: i % 3 === 1 ? "Free" : ["$9/month", "$19/month", "$49", "$5/month"][i % 4],
  creator: { id: `cr${i}`, name: ["Mara Lindqvist", "Leo Park", "Ines Duarte", "Sam Reyes", "Noor Ali", "Ava Stone", "Kenji Mori"][i], username: `maker${i}`, avatarUrl: i % 2 ? null : logo(i + 3) },
  url: `/community/c${i}`,
  viewCount: [31_700, 40, 5_210, 128_000, 0, 1_200_000, 3][i],
  rating: i === 0 ? { average: 4.9, count: 37 } : i === 3 ? { average: 4.6, count: 12 } : null,
  launchedAt: new Date(NOW - [400, 3, 20, 70, 800, 1, 150][i] * DAY).toISOString(),
}))

/* The route, answered from the fixture by the query the page sends (lib/explore/communities-mode communitiesQuery). */
;(window as any).__fetches = []
const realFetch = window.fetch.bind(window)
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  if (!href.startsWith("/api/explore/communities")) return realFetch(input as RequestInfo, init)
  ;(window as any).__fetches.push(href)
  const q = new URL(href, "https://storelib.test").searchParams
  let items = communities
  if (q.get("c")) items = items.filter((c) => c.category === q.get("c"))
  /* The server's subcategory rule, in small: the category narrowed by the subcategory's words, else the whole category, broadened. */
  let broadened = false
  const sub = q.get("sub")
  if (sub) {
    const words = (t: string) => ` ${t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `
    const narrowed = items.filter((c) => words(`${c.name} ${c.tagline ?? ""}`).includes(words(sub.replace(/-/g, " "))))
    if (narrowed.length) items = narrowed
    else broadened = true
  }
  if (q.get("price") === "free") items = items.filter((c) => c.access === "free")
  if (q.get("price") === "paid") items = items.filter((c) => c.access !== "free")
  if (q.get("q")) items = items.filter((c) => c.name.toLowerCase().includes(q.get("q")!.toLowerCase()))
  if (q.get("sort") === "popular") items = [...items].sort((a, b) => b.memberCount - a.memberCount)
  if (q.get("cursor")) items = items.slice(0, 2).map((c, i) => ({ ...c, id: `${c.id}-more-${i}`, slug: `${c.slug}-more` }))
  await new Promise((r) => setTimeout(r, 60))
  return new Response(JSON.stringify({ items, next: null, ...(broadened ? { broadened } : {}) }), { status: 200, headers: { "content-type": "application/json" } })
}) as typeof window.fetch

const mode = location.hash.replace("#", "") || "products"
;(window as any).__search = mode === "communities" ? "type=communities" : ""

function Page() {
  return (
    <div style={{ display: "flex", minHeight: "100svh", flexDirection: "column" }}>
      <main className="flex-1">
        <div className="explore-ground min-h-screen bg-[#f8f9fa]">
          <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 pt-4 pb-6 sm:pt-5 sm:pb-8">
            <ExplorePageClient
              initialProducts={products}
              initialCategory="all"
              searchQuery=""
              communitiesEnabled={mode !== "off"}
              discoverHeadlineSegmentEnabled={false}
              initialDiscoverMode={mode === "communities" ? "communities" : "products"}
              initialCommunities={mode === "communities" ? { query: "", items: communities, next: "cursor-1" } : null}
            />
          </div>
        </div>
      </main>
      <ConditionalFooter />
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <Page />
  </LocaleProvider>,
)
