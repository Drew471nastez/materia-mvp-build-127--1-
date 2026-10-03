import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { communitiesEnabled } from "@/lib/communities/flag"
import { cleanQuery, exploreCommunities, exploreSort } from "@/lib/communities/server/explore"
import { ExploreCommunities } from "@/components/community/public/explore-communities"

/**
 * storelib.com/explore/communities: every community that may be found
 * (lib/communities/server/explore.ts), on Explore's own ground. A static
 * route, so it beats /explore/[category] for this one word. A 404 while
 * communities are switched off; the switch is read per request.
 */
export const metadata: Metadata = {
  title: "Communities",
  description: "Find a community run by a creator you follow, and join it on Storelib.",
  alternates: { canonical: "https://storelib.com/explore/communities" },
  openGraph: { title: "Communities | Storelib", url: "/explore/communities", siteName: "Storelib", type: "website" },
}

export default async function ExploreCommunitiesPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string }> }) {
  await connection()
  if (!(await communitiesEnabled())) notFound()
  const params = await searchParams
  const sort = exploreSort(params.sort)
  const q = cleanQuery(params.q)
  const page = await exploreCommunities({ q, sort })
  return (
    <main className="explore-ground min-h-screen bg-[#f8f9fa]" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-5 sm:px-6 sm:pb-14 sm:pt-7 lg:px-8">
        <ExploreCommunities initial={page.items} next={page.next} q={q} sort={sort} />
      </div>
    </main>
  )
}
