"use client"

import { ProductCard } from "@/components/explore/product-card"
import { SmartLink } from "@/components/smart-link"
import { cn } from "@/lib/utils"

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
  className,
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
  /**
   * Overrides the section's own top margin. `mt-10 sm:mt-14` is the gap BETWEEN
   * sections, and the first row on a page has nothing above it to be separated
   * from — so the caller that puts one there passes `mt-0`, which tailwind-merge
   * replaces rather than stacks with.
   */
  className?: string
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
    <section className={cn("mt-10 sm:mt-14", className)}>
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-[19px] font-bold tracking-[-0.02em] text-neutral-900 sm:text-[22px]">{title}</h2>
        {href && (
          <SmartLink
            href={href}
            // NOT the brand purple. Purple is what this interface uses for the thing
            // it wants you to press — the compose button, Publish — and four
            // section headings each carrying a purple link turns a page of
            // listings into a page of calls to action. A "see more" beside a
            // heading is a way out, not an instruction.
            className="shrink-0 text-[14px] font-semibold text-neutral-700 underline decoration-neutral-300 underline-offset-4 transition-colors duration-200 hover:text-neutral-900 hover:decoration-neutral-500"
          >
            {seeMoreLabel}
          </SmartLink>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          A RAIL ON A PHONE, A GRID FROM sm UP
          ═══════════════════════════════════════════════════════════════════

          `grid-cols-3` is three cards across 375px minus the gutters: about
          105px each, for an object whose entire job is a photograph of a
          jumper. And a row of fifteen at three across is five rows deep — a
          "row" that is a third of the screen's height and pushes everything
          under it out of reach.

          Sideways is what a phone already does with a shelf, and it is the
          correct shape for this section specifically: these are rows BY
          definition — one idea, as many examples as you care to look at — so
          the horizontal axis is the one that should be long. `basis-[43%]`
          puts two and a bit on screen, and the bit is what says there is more.

          `-mx-4 px-4 scroll-px-4` bleeds the rail past the shell's gutters and
          moves them inside the scroller, so the first card lines up with the
          heading and the last one can still reach the middle of the screen
          instead of stopping a gutter short.

          Everything from sm up is exactly what it was. */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 scrollbar-hide sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-x-4 sm:gap-y-8 sm:overflow-visible sm:px-0 lg:grid-cols-4 xl:grid-cols-5">
        {shown.map((product, i) => (
          <div key={product.id} className="w-[43%] shrink-0 snap-start sm:w-auto sm:shrink">
            <ProductCard
              product={product}
              origin={origin}
              // Only the first row of the first section is above the fold; asking
              // for priority on eighteen images is asking for none.
              priority={rows === 1 && i < 3}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
