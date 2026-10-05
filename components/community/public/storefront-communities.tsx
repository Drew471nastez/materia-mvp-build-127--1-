/**
 * ===========================================================================
 *  A CREATOR'S COMMUNITIES TAB
 * ===========================================================================
 * The panel behind "Communities" on a creator's page, in the three places
 * that draw the page: the configured storefront, the unconfigured one, and
 * the builder's canvas. The one community card (components/explore/
 * community-card.tsx, with its stats row) in the creator's own scheme, so a
 * storefront shows the same card Explore does; the page only adds the tab
 * when there is at least one and communities are switched on, so there is no
 * empty state to draw here.
 *
 * `phone` is for the builder's phone frame, which is narrow while the window
 * is not: CSS sees the window, so the frame says it.
 */
import type { CommunityCard } from "@/lib/communities/types"
import { ExploreCommunityGrid } from "@/components/explore/community-card"

/*
  THE PAGE'S OWN COLUMN, as the Products tab draws it (components/storefront/
  all-products-grid.tsx): the tab panels come without a container, so a bare
  grid ran from the window's left edge to its right, wider than the tabs above
  it (found end to end on a real storefront at 1440px).
*/
const COLUMN = "mx-auto w-full max-w-[1180px] px-3 py-8 sm:px-4 sm:py-10 lg:px-6"

export function StorefrontCommunities({ cards, phone = false, children = null }: { cards: CommunityCard[]; phone?: boolean; /** Under the cards: the creator's contributions (round 13, components/profile/community-contributions.tsx). */ children?: React.ReactNode }) {
  return (
    <div className={COLUMN}>
      <div data-storefront-communities="">
        <ExploreCommunityGrid cards={cards} surface="storefront" phone={phone} priorityCount={2} />
      </div>
      {children ? <div className="mx-auto mt-10 max-w-[760px] empty:hidden">{children}</div> : null}
    </div>
  )
}
