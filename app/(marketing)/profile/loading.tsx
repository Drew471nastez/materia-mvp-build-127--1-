import { SurfaceClaim } from "@/components/surface-claim"

/**
 * The skeleton the account tab paints the instant it is tapped.
 *
 * This file is why the tab feels immediate, and the reason is structural rather
 * than cosmetic: a `force-dynamic` route with no loading boundary cannot be
 * usefully prefetched — there is no static shell to cache, so `prefetch` on the
 * nav link fetched nothing and every tap waited out a cold render with several
 * database round trips behind it before a single pixel changed. With a boundary
 * here, Next caches this shell on prefetch and shows it the moment you tap,
 * while the real page streams in behind it.
 *
 * Which means its only real job is to be the same shape as what replaces it.
 * It was not: /profile always renders the settings gear on its own row above
 * the header, and this shell drew nothing there, so every arrival on the
 * account tab pushed the whole page down by the height of a 44px tap target
 * the instant the real screen landed. That drop is what the handover read as.
 * Everything below is now measured against components/member/member-profile.tsx
 * — the gear row, the purple wash, the ringed avatar, the 70px stat cells, the
 * 22px heading row — so the swap moves nothing at all.
 *
 * The constants are drawn rather than skeletonised. The gear, the edit pill and
 * the section heading say the same thing on every profile, so a grey bar in
 * their place would only be one more thing to swap.
 */
export default function ProfileLoading() {
  return (
    <div className="profile-surface relative isolate mx-auto flex min-h-full w-full max-w-[1100px] flex-col px-4 md:px-8 md:pt-8 lg:pt-10">
      {/* The strip behind the clock, in the neutral the shell uses when it
          cannot know what colour is coming. The real screen claims the cover's
          own top colour a beat later; a grey that darkens into the right one is
          a far smaller handover than white flashing to a photograph. */}
      <SurfaceClaim colour="#3f3f46" />

      {/* `.profile-cover` carries the geometry, including the pull up into the
          status bar — the same class the real screen uses, so the band does not
          change height or position by an inset at the swap. */}
      <div aria-hidden className="profile-cover relative -mx-4 animate-pulse overflow-hidden bg-neutral-200 md:-mx-8 md:rounded-3xl" />

      {/* The avatar straddles the cover's bottom edge, so its negative margin
          has to match the real one exactly or everything under it steps. */}
      <div className="relative flex items-start gap-4 md:gap-6">
        <div className="-mt-11 h-[88px] w-[88px] shrink-0 animate-pulse rounded-full bg-neutral-100 shadow-[0_6px_18px_-8px_rgba(15,15,15,0.35)] ring-4 ring-white md:-mt-14 md:h-28 md:w-28 lg:h-32 lg:w-32" />
        <div className="min-w-0 flex-1 pt-3">
          <span className="inline-flex h-8 items-center justify-center rounded-full border border-neutral-200 bg-white px-3.5 text-[12.5px] font-semibold text-neutral-800">
            Editează profilul
          </span>
        </div>
      </div>

      {/* Name and handle, on the full measure below the header row. */}
      <div className="mt-3 h-[27px] w-44 animate-pulse rounded bg-neutral-100 md:h-[34px]" />
      <div className="mt-1.5 h-3.5 w-28 animate-pulse rounded bg-neutral-100" />

      {/* "Membru din …", on its own full-width row exactly as the real screen
          places it — the header above has no room to hold it at 375px. The
          fixed height is the real line box, so the stats card below it starts
          at the same y in both. */}
      <div className="mt-3.5 flex h-[18px] items-center">
        <div className="h-3 w-44 animate-pulse rounded bg-neutral-100" />
      </div>

      {/* Articole / Urmăritori / Urmărește */}
      <div className="mt-5 grid grid-cols-3 divide-x divide-neutral-200/70 rounded-2xl border border-neutral-200/70 bg-white">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex h-[70px] flex-col items-center justify-center gap-1.5 px-2">
            <div className="h-4 w-9 animate-pulse rounded bg-neutral-100" />
            <div className="h-3 w-16 animate-pulse rounded bg-neutral-100" />
          </div>
        ))}
      </div>

      <div className="mt-6 flex min-h-0 flex-1 flex-col md:mt-8">
        <div className="flex h-[22px] items-baseline justify-between gap-3">
          <h2 className="truncate text-[15px] font-semibold leading-[22px] tracking-[-0.01em] text-neutral-900">
            Articolele mele
          </h2>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-6 pb-10 md:grid-cols-3 md:gap-x-4 md:pb-12 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-[3/4] w-full animate-pulse rounded-xl bg-neutral-100" />
              <div className="h-3 w-20 animate-pulse rounded bg-neutral-100" />
              <div className="h-3.5 w-14 animate-pulse rounded bg-neutral-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
