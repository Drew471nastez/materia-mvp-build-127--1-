import { ExploreSkeleton } from "@/components/explore/explore-skeleton"

/**
 * The page itself, with the products still to come.
 *
 * Same ground, same container and the same parts as page.tsx, so nothing
 * moves when the products arrive (components/explore/explore-skeleton). The
 * hero and the category row paint at once; only the cards are placeholders,
 * and they are `skeleton-deferred`: invisible for the first 200ms, so a page
 * that is quick never shows a grey card at all.
 */
export default function ExploreLoading() {
  return (
    <div className="explore-ground min-h-screen bg-[#f8f9fa]" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 pt-4 pb-6 sm:pt-5 sm:pb-8">
        <ExploreSkeleton gridClassName="skeleton-deferred" />
      </div>
    </div>
  )
}
