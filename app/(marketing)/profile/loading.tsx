import { Settings } from "lucide-react"

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
    <div className="tab-enter relative isolate mx-auto flex min-h-full w-full max-w-[1400px] flex-col px-4 pt-6 md:px-6 md:pt-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[260px] bg-gradient-to-b from-[#7c3aed]/[0.09] via-[#7c3aed]/[0.03] to-transparent md:h-[320px]"
      />

      {/* The gear's own row, at its real height — the 44px this shell used to
          leave out. */}
      <div className="-mt-1 mb-1 flex justify-end">
        <span className="-mr-2.5 flex h-11 w-11 items-center justify-center rounded-full text-neutral-700">
          <Settings className="h-[22px] w-[22px]" />
        </span>
      </div>

      <div className="flex items-start gap-4 md:items-center md:gap-6">
        <div className="h-20 w-20 shrink-0 animate-pulse rounded-full bg-neutral-100 shadow-[0_6px_18px_-8px_rgba(15,15,15,0.35)] ring-4 ring-white md:h-24 md:w-24" />
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="h-5 w-40 animate-pulse rounded bg-neutral-100" />
          <div className="h-3.5 w-28 animate-pulse rounded bg-neutral-100" />
        </div>
        <span className="mt-1 inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white px-3.5 text-[12.5px] font-semibold text-neutral-800 md:mt-0">
          Editează profilul
        </span>
      </div>

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
