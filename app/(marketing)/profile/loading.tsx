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
      {/* THE SAME CLAIM THE REAL SCREEN MAKES. If this shell declares one
          colour and what replaces it declares another, the strip at the very
          top changes colour at the swap — which is a flash in the one place on
          a phone where a flash is impossible to miss. It briefly said #3f3f46
          here and the cover's own colour there, and landing on the profile
          stepped through both. See member-profile.tsx. */}
      <SurfaceClaim colour="#ffffff" />

      {/* `.profile-cover` carries the geometry — the same class the real screen
          uses, so the band cannot change height or position at the swap.
          
          Still, and pale. A pulsing grey band that then snaps to a saturated
          gradient is two jarring things where there should be none: the pulse
          draws the eye to the top of the screen, and the snap happens there
          while it is looking. A calm neutral that the real cover dissolves into
          is the whole handover — see the fade on `.profile-cover-live`. */}
      <div aria-hidden className="profile-cover relative -mx-4 overflow-hidden bg-neutral-200 md:-mx-8 md:rounded-3xl" />

      {/* The avatar straddles the cover's bottom edge, so its negative margin
          has to match the real one exactly or everything under it steps. */}
      <div className="relative flex items-start gap-4 md:gap-6">
        <div className="-mt-11 h-[88px] w-[88px] shrink-0 animate-pulse rounded-full bg-neutral-100 shadow-[0_6px_18px_-8px_rgba(15,15,15,0.35)] ring-4 ring-white md:-mt-14 md:h-28 md:w-28 lg:h-32 lg:w-32" />
        <div className="flex min-w-0 flex-1 justify-end pt-3">
          {/* The same pill, at the same size at every breakpoint — it grows
              from md up on the real screen, and a shell that keeps it at the
              phone size is a control that changes height at the swap. */}
          <span className="inline-flex h-8 items-center justify-center rounded-full border border-neutral-200 bg-white px-3.5 text-[12.5px] font-semibold text-neutral-800 md:h-10 md:px-5 md:text-[14px]">
            Editează profilul
          </span>
        </div>
      </div>

      {/* Name and handle, on the full measure below the header row. Every box
          here is the line height its counterpart in member-profile.tsx states
          explicitly, so nothing steps when the real screen replaces this one. */}
      <div className="mt-3 flex h-[28px] items-center md:h-[34px] lg:h-[38px]">
        <div className="h-5 w-44 animate-pulse rounded bg-neutral-100 md:h-6" />
      </div>
      <div className="flex h-[18px] items-center md:h-[20px]">
        <div className="h-3 w-28 animate-pulse rounded bg-neutral-100" />
      </div>

      {/* "Membru din …" — the same margin the real line carries. Bio and
          reviews are deliberately not reserved: both are conditional, most
          profiles have neither, and holding room for something that usually is
          not there is a gap on every arrival instead of a step on some. */}
      <div className="mt-3 flex h-[18px] items-center">
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
        {/* THE TAB STRIP, NOT A HEADING.

            This drew a 22px row containing the words "Articolele mele" — which
            the shelf stopped being some time ago. What replaces it is a strip of
            three tabs about ten pixels taller with a hairline under it, so every
            arrival on the account tab moved the whole grid down by the
            difference the instant the real screen landed.

            Drawn rather than skeletonised, and drawn at the real geometry:
            equal columns on a phone, labels at the start of the line from md up,
            the underline already under the first because the shelf always opens
            on Anunțuri. Every class here has a counterpart in ShelfTab — see
            components/member/member-profile.tsx.

            The COUNT beside Anunțuri is deliberately absent: it is not knowable
            until the page it is standing in for has loaded, and a digit that
            appears at the swap is a smaller change than a digit that appears and
            is wrong. The underline is measured from the tab on the real screen,
            so it simply lands correct. */}
        <div className="relative flex items-stretch gap-0 border-b border-neutral-200/80 md:gap-9">
          {["Anunțuri", "Salvate", "Evaluări"].map((label, i) => (
            <span
              key={label}
              className={`relative flex flex-1 items-baseline justify-center gap-1.5 pb-2.5 pt-1 text-[15px] md:flex-none md:justify-start md:pb-3 md:text-[16px] ${
                i === 0 ? "font-semibold text-neutral-900" : "font-medium text-neutral-400"
              }`}
            >
              {label}
            </span>
          ))}
        </div>

        {/* The grid's own spacing, at every breakpoint. It matched on a phone
            and drifted on a desktop — md:gap-x-4 against the real md:gap-x-5,
            gap-y-6 against gap-y-8, pb-12 against pb-16 and no md:mt-6 at all —
            so the wider the screen, the more the cards moved at the swap. */}
        <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-6 pb-10 md:mt-6 md:grid-cols-3 md:gap-x-5 md:gap-y-8 md:pb-16 lg:grid-cols-4">
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
