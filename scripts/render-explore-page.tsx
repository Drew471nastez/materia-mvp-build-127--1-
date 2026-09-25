/**
 * The real Explore page client, its loading screen, and the pieces its
 * panels are made of, inside the same <main> and container the route draws
 * (app/(marketing)/explore/page.tsx and loading.tsx).
 *
 *   #page      ExplorePageClient over thirty made-up products
 *   #loading   ExploreSkeleton, as loading.tsx draws it (grid not deferred,
 *              so it can be measured straight away)
 *
 * Nothing is reimplemented: scripts/check-explore-loading.mjs and
 * scripts/check-explore-panels.mjs measure what these draw.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { ExplorePageClient } from "@/components/explore/explore-page-client"
import { ExploreSkeleton } from "@/components/explore/explore-skeleton"

const CATS = ["design", "development", "business", "marketing", "ai", "education", "productivity", "video", "photography", "audio-music"]
const HUES = [18, 42, 160, 200, 220, 260, 330, 90, 5, 280]
const picture = (i: number) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="hsl(${HUES[i % HUES.length]} 35% 82%)"/><rect x="60" y="60" width="300" height="24" rx="6" fill="hsl(${HUES[i % HUES.length]} 30% 60%)"/></svg>`,
  )

const now = Date.UTC(2026, 8, 20)
const products = Array.from({ length: 30 }, (_, i) => ({
  id: `p${i}`,
  title: ["Notion Life OS", "Brand Kit Pro", "SaaS Landing Page", "Lightroom Presets Vol. 2", "Prompt Pack", "Budget Planner"][i % 6] + ` ${i + 1}`,
  slug: `product-${i}`,
  description: "A short description of a product that is long enough to count as complete for the ranking. ".repeat(2),
  price_cents: [0, 900, 1900, 4900, 7900, 2500][i % 6],
  compare_at_cents: null,
  thumbnail_url: picture(i),
  type: "digital",
  category: CATS[i % CATS.length],
  categoryName: CATS[i % CATS.length],
  creator_id: `c${i % 5}`,
  created_at: new Date(now - i * 86400000 * 3).toISOString(),
  sales_count: (i * 7) % 23,
  reviews_count: i % 4,
  reviews_average: 4 + (i % 10) / 10,
  categories: [],
  creator: {
    id: `c${i % 5}`,
    slug: `maker${i % 5}`,
    niche_tags: [],
    profile: { display_name: ["Ava Stone", "Leo Park", "Mia Chen", "Sam Reyes", "Noor Ali"][i % 5], avatar_url: null, username: `maker${i % 5}` },
  },
}))

const mode = location.hash.replace("#", "") || "page"

function Page() {
  return (
    <main className="explore-ground min-h-screen bg-[#f8f9fa]">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 pt-4 pb-6 sm:pt-5 sm:pb-8">
        {mode === "loading" ? (
          <ExploreSkeleton />
        ) : (
          <ExplorePageClient initialProducts={products} initialCategory="all" searchQuery="" />
        )}
      </div>
    </main>
  )
}

createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <Page />
  </LocaleProvider>,
)
