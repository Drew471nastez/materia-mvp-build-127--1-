"use client"

import { ProductCard } from "@/components/explore/product-card"
import { SmartLink } from "@/components/smart-link"

/**
 * ===========================================================================
 *  ONE ROW OF LISTINGS, WITH A WAY TO SEE THE REST
 * ===========================================================================
 *
 * Every personalised section on the home page is this: a heading, a row that
 * fits the measure, and a link out. Written once so they cannot drift — the
 * three of them sit within a screen of each other, and three rows with slightly
 * different card counts and slightly different gaps is the thing that makes a
 * page look assembled rather than designed.
 *
 * `rows` is how many lines of cards to draw, and it is the ONLY difference
 * between "Based on your recent views" (one) and "Suggested for you" (three).
 * Six across at 1400px, so a row is six cards and three rows is eighteen — the
 * grid is fixed rather than derived from the item count, because a section that
 * silently draws five cards on a slow day reads as broken rather than as quiet.
 */
export function ListingRow({
  title,
  items,
  rows = 1,
  href,
  seeMoreLabel = "Vezi mai multe",
  origin = "feed",
  minItems = 3,
}: {
  title: string
  items: any[]
  rows?: number
  /** Omitted when there is nowhere more to go — the link is then not drawn at
   *  all rather than drawn pointing at the page you are on. */
  href?: string
  seeMoreLabel?: string
  origin?: "feed" | "member" | "search"
  /**
   * HOW MANY IT TAKES BEFORE THIS SECTION IS WORTH DRAWING.
   *
   * Three is enough for a general shelf; the two PERSONAL rows ask for five,
   * which is a full row. The difference is what the heading claims. "Sugestii
   * pentru tine" with three cards is a quiet day. "Bazat pe vizualizările tale
   * recente" with three cards is the marketplace announcing it has been
   * watching you and then producing almost nothing — worse than not mentioning
   * it, and it leaves a half-empty row under a personal heading, which is the
   * single most obviously unfinished thing a home page can show.
   */
  minItems?: number
}) {
  // FIVE. Six cards across 1400px leaves each one about 215px wide, and a
  // second-hand listing is sold by its photograph — at that width a jumper on a
  // hanger is a thumbnail rather than a picture. Five is 265px, which is the
  // width the card was drawn for.
  const PER_ROW = 5
  const shown = items.slice(0, PER_ROW * rows)
  /**
   * NOTHING TO SHOW MEANS NOTHING IS DRAWN. NOT A HEADING, NOT A NOTE.
   *
   * There was a dashed box here saying "open a few listings and we'll show you
   * things like them", so a first visit got two explanations of sections it did
   * not have. That is a page apologising for itself: it takes the space of the
   * content, promises something the visitor did not ask for, and pushes the
   * things that ARE worth seeing below the fold to do it.
   *
   * A section with no content is not a section. It comes back, with its
   * heading, the moment there is something in it — which is the second visit,
   * and by then it is a row of listings rather than a paragraph.
   */
  if (shown.length < minItems) return null

  return (
    <section className="mt-14">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-[22px] font-bold tracking-[-0.02em] text-neutral-900">{title}</h2>
        {href && (
          <SmartLink
            href={href}
            className="shrink-0 text-[14px] font-semibold text-[#7c3aed] transition-colors duration-200 hover:text-[#6d28d9]"
          >
            {seeMoreLabel}
          </SmartLink>
        )}
      </div>

      <div className="grid grid-cols-3 gap-x-4 gap-y-8 lg:grid-cols-4 xl:grid-cols-5">
        {shown.map((product, i) => (
          <ProductCard
            key={product.id}
            product={product}
            origin={origin}
            // Only the first row of the first section is above the fold; asking
            // for priority on eighteen images is asking for none.
            priority={rows === 1 && i < 3}
          />
        ))}
      </div>
    </section>
  )
}
