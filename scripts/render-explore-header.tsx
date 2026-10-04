/**
 * The real platform header over the real Explore page, for
 * scripts/check-explore-desktop.mjs. Supabase and the router are stubbed by
 * the probe; nobody is signed in.
 *
 * The router stub keeps the pathname in a small store, so the header sees a
 * route change the way it does in the app: `window.__go(view, { scroll })`
 * swaps what is under the header, moves the pathname, and puts the window
 * where Next.js would (the top on a push, the given offset on a back).
 *
 *   explore     ExplorePageClient on /explore
 *   loading     ExploreSkeleton on /explore (loading.tsx), before the page
 *   category    CategoryPageClient on /explore/design
 *   product     a plain page on /maker0/product-1, which has no hero
 *
 * `?live=1` wraps both in the platform settings storelib.com runs with
 * (Explore on, so the header hands its search to the hero; the light bar),
 * and `&dark=1` the dark bar instead. Without it the settings are the
 * context's defaults, as before.
 */
import React, { useSyncExternalStore } from "react"
import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import { LocaleProvider } from "@/components/locale-provider"
import { PlatformHeaderClient } from "@/components/platform/platform-header-client"
import { ExplorePageClient } from "@/components/explore/explore-page-client"
import { ExploreSkeleton } from "@/components/explore/explore-skeleton"
import { CategoryPageClient } from "@/components/explore/category-page-client"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"

const CATS = ["design", "development", "business", "marketing", "ai", "education", "productivity", "video", "photography", "audio-music"]
const picture = (i: number) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="hsl(${(i * 37) % 360} 30% 84%)"/></svg>`)
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

type View = "explore" | "loading" | "category" | "product"
const PATH: Record<View, string> = { explore: "/explore", loading: "/explore", category: "/explore/design", product: "/maker0/product-1" }
const w = window as any
const first = ((location.hash.replace("#", "") || "explore") as View)
w.__nav = { view: first, path: PATH[first], subs: new Set<() => void>() }
w.__category = "design"
w.__search = ""
const subscribe = (f: () => void) => { w.__nav.subs.add(f); return () => w.__nav.subs.delete(f) }
function useView() {
  return useSyncExternalStore(subscribe, () => w.__nav.view as View)
}
w.__go = (view: View, opts: { scroll?: number } = {}) => {
  flushSync(() => {
    w.__nav.view = view
    w.__nav.path = PATH[view]
    for (const f of w.__nav.subs) f()
  })
  window.scrollTo(0, opts.scroll ?? 0)
}

function Page() {
  const view = useView()
  return (
    <main className="explore-ground min-h-screen bg-[#f8f9fa]">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 pt-4 pb-6 sm:pt-5 sm:pb-8">
        {view === "loading" ? (
          <ExploreSkeleton />
        ) : view === "category" ? (
          <CategoryPageClient initialProducts={products} category="design" categoryLabel="Design" />
        ) : view === "product" ? (
          <div style={{ height: 3000 }} className="pt-10 text-[15px] text-neutral-500">A product page, with no search of its own.</div>
        ) : (
          <ExplorePageClient initialProducts={products} initialCategory="all" searchQuery="" />
        )}
      </div>
    </main>
  )
}

const live = new URLSearchParams(location.search)
const tree = (
  <LocaleProvider>
    <PlatformHeaderClient />
    <Page />
  </LocaleProvider>
)
createRoot(document.getElementById("app")!).render(
  live.get("live") ? (
    <PlatformSettingsProvider exploreMarketplace buyerHeaderLight={!live.get("dark")}>
      {tree}
    </PlatformSettingsProvider>
  ) : (
    tree
  ),
)
