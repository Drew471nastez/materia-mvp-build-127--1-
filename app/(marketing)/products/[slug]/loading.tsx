import { ArrowLeft } from "lucide-react"

/**
 * The shell a listing paints the instant it is tapped.
 *
 * Without one, opening an item from the profile or the feed sat on the page you
 * were leaving until the server answered, and then hard-cut into the finished
 * listing. That gap is what "the transition is buggy" usually is: not the
 * animation, but that there is nothing to animate TO, so the old screen holds
 * and the new one arrives all at once.
 *
 * Its only job is to be the same shape as what replaces it, so the swap moves
 * nothing. Every measurement here is taken from components/product/product-detail.tsx:
 * the 3:4 photograph, the overlaid back and share controls with the same
 * safe-area inset, the title and price block, and the fixed buy bar that the
 * page reserves `pb-28` for. Get any of those wrong and the handover is a step
 * rather than a fill-in.
 *
 * The constants are drawn rather than skeletonised — the back arrow is in the
 * same place on every listing, so a grey circle in its place would only be one
 * more thing to swap.
 */
export default function ListingLoading() {
  return (
    <div className="min-h-screen bg-white pb-28 md:pb-0">
      <div className="md:mx-auto md:grid md:max-w-6xl md:grid-cols-2 md:gap-10 md:px-6 md:py-8">
        {/* The photograph. Neutral-200 rather than a pulse: this is the biggest
            area on the screen, and a full-width band flashing under your thumb
            for the length of a fetch is more distracting than a still one. */}
        <div className="relative md:sticky md:top-24 md:self-start">
          <div className="relative aspect-[3/4] w-full bg-neutral-200 md:rounded-2xl" />

          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between px-3 md:hidden"
            style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm">
              <ArrowLeft className="h-[22px] w-[22px]" strokeWidth={2.4} />
            </span>
          </div>
        </div>

        <div className="px-4 pt-4 md:px-0 md:pt-0">
          <div className="h-6 w-24 animate-pulse rounded bg-neutral-100" />
          <div className="mt-3 h-5 w-3/4 animate-pulse rounded bg-neutral-100" />
          <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-neutral-100" />

          <div className="mt-6 space-y-2">
            <div className="h-3.5 w-full animate-pulse rounded bg-neutral-100" />
            <div className="h-3.5 w-11/12 animate-pulse rounded bg-neutral-100" />
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-neutral-100" />
          </div>

          {/* The seller card, at its real height. */}
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-neutral-200/70 p-3">
            <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-neutral-100" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 w-28 animate-pulse rounded bg-neutral-100" />
              <div className="h-3 w-20 animate-pulse rounded bg-neutral-100" />
            </div>
          </div>
        </div>
      </div>

      {/* The buy bar the page pins across the bottom. Drawn rather than left
          out, because the 112px of padding above it is reserved either way and
          an empty strip there reads as the page having failed to finish. */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 flex gap-2.5 border-t border-neutral-200/80 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3 backdrop-blur-md md:hidden"
      >
        <div className="h-12 flex-1 animate-pulse rounded-full bg-neutral-100" />
        <div className="h-12 flex-[1.4] animate-pulse rounded-full bg-neutral-200" />
      </div>
    </div>
  )
}
