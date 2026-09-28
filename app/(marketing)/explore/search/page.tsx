import type { Metadata } from "next"
import { SearchScreen } from "@/components/explore/search-screen"

/**
 * The phone's search screen: the buyer tab bar's Search (components/nav/
 * buyer-tab-bar.tsx). A static route, so it beats /explore/[category] for
 * this one word and needs nothing from the server. Its results are
 * Explore's own (`/explore?q=`), which is the page search engines index.
 */
export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: true },
}

export default function ExploreSearchPage() {
  return <SearchScreen />
}
