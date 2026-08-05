"use client"

import { useEffect } from "react"
import { RotateCw } from "lucide-react"

/**
 * What your profile does when it cannot render.
 *
 * The other half of the round trip. A listing now has a boundary; the screen you
 * come BACK to did not, and it is the one with more ways to fail — /profile is
 * `force-dynamic`, so every arrival is a live read of your row, your listings
 * and your review counts, and it degrades column-by-column against migrations
 * that may not have run (see lib/profile/read.ts). Any of that throwing put the
 * app on the root error page with no tab bar and, in the shell, nothing to press.
 *
 * No back control here on purpose, unlike the listing's: this IS a tab. The bar
 * is still on screen underneath, so there is already a way to everywhere else,
 * and a second one would only be a control that disagrees about where "back" is.
 */
export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[profile] render failed:", error?.digest ?? error?.message ?? error)
  }, [error])

  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-[19px] font-semibold tracking-tight text-neutral-900">
        Profilul nu s-a putut încărca
      </h1>
      <p className="max-w-[300px] text-[14.5px] leading-relaxed text-neutral-500">
        A fost o problemă de moment. Datele tale sunt în siguranță.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-1 inline-flex h-12 items-center gap-2 rounded-full bg-[#7c3aed] px-6 text-[15px] font-semibold text-white transition-transform active:scale-[0.98]"
      >
        <RotateCw className="h-[17px] w-[17px]" strokeWidth={2.4} />
        Încearcă din nou
      </button>
    </div>
  )
}
