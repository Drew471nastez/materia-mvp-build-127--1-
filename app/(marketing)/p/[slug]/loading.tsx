/**
 * ===========================================================================
 *  WHAT IS ON SCREEN WHILE A PRODUCT PAGE IS ON ITS WAY
 * ===========================================================================
 * It used to be a replica: the gallery box, four thumbnails, a title line, a
 * creator row with a round avatar, a price, a button, and a list of three
 * "what's included" rows. Forty-two pulsing shapes, which is a second,
 * counterfeit version of the page.
 *
 * TWO THINGS ARE WRONG WITH THAT, and neither is about taste.
 *
 * IT IS NEVER RIGHT. The real page's title is one line or three, the creator
 * may have a badge, the card is taller when there are variants. Every one of
 * those differences is a jump at the moment the content lands, so the more
 * detail a skeleton has, the more it moves when it is replaced. A shape that
 * matches nothing in particular cannot be wrong.
 *
 * IT IS ON SCREEN FOR A FEW HUNDRED MILLISECONDS. Measured against production:
 * the product page answers in about 0.65s at the median, against 0.42s for the
 * creator page and 0.18s for a static one, and `skeleton-deferred` holds this
 * back for the first 200ms of that. So a visitor sees it for roughly a third
 * of a second — long enough to register something grey appearing, nowhere near
 * long enough to read a fake price. Anything drawn here that a person cannot
 * finish looking at is noise.
 *
 * WHAT IS LEFT IS THE SHAPE OF THE PAGE. The picture's box, at the aspect the
 * real one uses, in the column it uses; and on a desktop, where the buy card
 * sits. They hold the layout still so nothing jumps when the page arrives, and
 * they say "a picture is coming" rather than "here is a grey product".
 *
 * The colours come from the route layout, which sets them per creator, so a
 * dark shop does not flash a light grey page before its own.
 */
export default function ProductLoading() {
  return (
    <div
      className="min-h-screen skeleton-deferred"
      style={{ backgroundColor: "var(--skeleton-bg, #f2f2f2)" }}
    >
      {/* The same container the page itself uses, so nothing moves. */}
      <div className="mx-auto max-w-[1200px] px-3 sm:px-4 lg:px-6 py-6 sm:py-12">
        <div className="grid gap-8 lg:grid-cols-5 lg:gap-12 lg:items-start">
          <div className="lg:col-span-3">
            <div
              className="aspect-video w-full rounded-xl animate-pulse"
              style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
            />
          </div>
          {/*
            Desktop only. On a phone the card is below the fold at the moment
            this is on screen, so drawing it is drawing something nobody is
            looking at.
          */}
          <div className="hidden lg:block lg:col-span-2">
            <div
              className="h-[260px] w-full rounded-xl animate-pulse"
              style={{ backgroundColor: "var(--skeleton-color, #e5e7eb)" }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
