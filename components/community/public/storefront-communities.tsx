/**
 * ===========================================================================
 *  A CREATOR'S COMMUNITIES TAB
 * ===========================================================================
 * The panel behind "Communities" on a creator's page, in the three places
 * that draw the page: the configured storefront, the unconfigured one, and
 * the builder's canvas. Real cards (components/community/public/
 * community-card.tsx) in the creator's own scheme; the page only adds the tab
 * when there is at least one and communities are switched on, so there is no
 * empty state to draw here.
 *
 * `phone` is for the builder's phone frame, which is narrow while the window
 * is not: CSS sees the window, so the frame says it.
 */
import type { CommunityCard } from "@/lib/communities/types"
import { cn } from "@/lib/utils"
import { CommunityCardTile } from "./community-card"

/*
  THE PAGE'S OWN COLUMN, as the Products tab draws it (components/storefront/
  all-products-grid.tsx): the tab panels come without a container, so a bare
  grid ran from the window's left edge to its right, wider than the tabs above
  it (found end to end on a real storefront at 1440px).
*/
const COLUMN = "mx-auto w-full max-w-[1180px] px-3 py-8 sm:px-4 sm:py-10 lg:px-6"

export function StorefrontCommunities({ cards, phone = false }: { cards: CommunityCard[]; phone?: boolean }) {
  return (
    <div className={COLUMN}>
      <ul data-storefront-communities="" className={cn("grid grid-cols-1 gap-4", !phone && "sm:grid-cols-2 sm:gap-5 lg:grid-cols-3")}>
        {cards.map((c, i) => (
          <li key={c.id} className="min-w-0">
            <CommunityCardTile card={c} surface="storefront" priority={i < 2} />
          </li>
        ))}
      </ul>
    </div>
  )
}
