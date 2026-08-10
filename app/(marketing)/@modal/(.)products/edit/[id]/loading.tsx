/**
 * The edit sheet's OWN loading shell.
 *
 * Identical to the one beside (.)products/new, and it has to exist separately:
 * a Suspense fallback resolves to the nearest loading.tsx UP THE TREE, and
 * without this one that is the full-page shell written for the non-intercepted
 * route — a centred column of grey blocks with no sheet and nothing pinned to
 * the bottom. Tapping Editează would then produce two arrivals: a page-shaped
 * skeleton appearing in place, then the real sheet sliding up over it.
 *
 * The original note, which explains the whole failure, follows.
 *
 * ---------------------------------------------------------------------------
 * The sheet's OWN loading shell — and the fix for the flash on opening.
 *
 * ---------------------------------------------------------------------------
 * What was happening
 * ---------------------------------------------------------------------------
 * This slot had no loading boundary of its own, so a Suspense fallback for
 * /products/new resolved to app/(marketing)/products/new/loading.tsx — which is
 * the FULL-PAGE shell, written for the non-intercepted route. It is a centred
 * column of grey blocks on the page background, with no sheet, no header, and
 * nothing pinned to the bottom.
 *
 * So tapping + produced two arrivals: a page-shaped grey skeleton appearing in
 * place, and then the real sheet mounting and sliding up from the bottom over
 * the top of it. A shape change followed by a slide is exactly the "flash" —
 * and because the skeleton was a PAGE, the screen you were on vanished for a
 * frame before the sheet had anything to slide over, which is the thing the
 * intercepting route exists to prevent.
 *
 * ---------------------------------------------------------------------------
 * What this is instead
 * ---------------------------------------------------------------------------
 * The same box the sheet occupies, in the same colour, entering the same way.
 * `sell-sheet fixed inset-0` and `sell-sheet-enter` are the real classes from
 * components/sell/new-listing-form.tsx and app/globals.css — so if this is ever
 * shown, it slides up as the sheet, and the form replaces its contents without
 * anything moving. One arrival instead of two.
 *
 * In practice it should almost never be visible: NewListingForm is a client
 * component with no server data to wait for, so the route commits in a frame or
 * two. This exists for the frame where it does not, on a cold bundle or a slow
 * device — which is precisely when a flash is most likely and least excusable.
 *
 * Deliberately NOT a detailed skeleton. Grey rectangles standing in for fields
 * that arrive a frame later are more movement, not less. The header and the
 * footer are the parts that must not move, so they are drawn for real; the
 * middle is left empty.
 */
export default function InterceptedEditListingLoading() {
  return (
    <div className="sell-sheet sell-sheet-enter fixed inset-0 z-[95] flex flex-col bg-[#f6f6f7] md:static md:z-auto md:block">
      {/* The header, at its real height, with the X where the X will be. */}
      <div
        className="shrink-0 border-b border-neutral-200/80 bg-white/95 backdrop-blur-md md:hidden"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="flex items-center gap-2 px-2 py-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-800">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="h-4 w-32 animate-pulse rounded bg-neutral-100" />
        </div>
      </div>

      {/* Empty. See the note above — a skeleton here would be one more thing
          that has to be swapped out a frame later. */}
      <div className="min-h-0 flex-1" />

      {/* The publish bar, at its real height, so the bottom edge does not jump
          when the form arrives. */}
      <div className="shrink-0 border-t border-neutral-200 bg-white px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3 md:hidden">
        <div className="mx-auto w-full max-w-2xl space-y-2.5">
          <div className="h-12 w-full animate-pulse rounded-full bg-neutral-100" />
        </div>
      </div>
    </div>
  )
}
