import type { Metadata } from "next"
import { Suspense } from "react"
import { SearchPage } from "@/components/search/search-page"

/**
 * The search screen at its own address (components/search/search-page.tsx).
 * On a phone the tab bar's Search opens the same screen over the page
 * instead (components/search/search-overlay.tsx); this is where a link or a
 * reload lands. A static route, so it beats /explore/[category] for this one
 * word and needs nothing from the server. Its results are Explore's own
 * (`/explore?q=`), which is the page search engines index.
 */
export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: true },
}

export default function ExploreSearchPage() {
  /* useSearchParams, for words to start from, is read under a Suspense. */
  return (
    <Suspense fallback={null}>
      <SearchPage />
    </Suspense>
  )
}
