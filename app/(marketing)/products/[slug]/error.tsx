"use client"

import { useEffect } from "react"
import { ArrowLeft, RotateCw } from "lucide-react"
import { useRouter } from "next/navigation"

/**
 * What a listing does when it cannot render.
 *
 * There was no boundary anywhere on this route, or on the marketing group above
 * it. So anything that threw while opening a listing — the database refusing a
 * connection, an image host timing out inside a server component, a field the
 * page reads that a migration has not added yet — went all the way up to Next's
 * root error page. In a browser that is an ugly screen you can navigate away
 * from. Inside the Capacitor shell there is no address bar and no back button
 * of the browser's own, so it is a dead end: the app is on a page with nothing
 * on it and no way off, and the only way out is to kill it.
 *
 * A boundary is the difference between a failure and a dead end, which is the
 * whole of "make it safe and never fail" — not that nothing goes wrong, but that
 * when it does you are still somewhere you can leave.
 *
 * Two ways out, deliberately:
 *
 *   `reset()` re-renders the segment without a document load, so a transient
 *   failure — and a timeout is nearly always transient — costs one tap and
 *   keeps the history stack, the router cache and the scroll position of
 *   everything behind it.
 *
 *   Back returns to whatever you came from. `history.length` is checked because
 *   a listing is the most-shared URL in the marketplace: arriving from a link
 *   there is no entry to pop, and `router.back()` on an empty stack does
 *   nothing at all, which would leave the only visible control dead.
 *
 * It reserves the same status-bar inset the listing does, so the controls do not
 * land under the clock in the app.
 */
export default function ListingError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  // The digest is the only handle on what actually happened — the message is
  // deliberately scrubbed in production — so it goes somewhere it can be read
  // off a device rather than being swallowed silently.
  useEffect(() => {
    console.error("[listing] render failed:", error?.digest ?? error?.message ?? error)
  }, [error])

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back()
    else router.push("/")
  }

  return (
    <div
      className="flex min-h-[70svh] flex-col bg-white px-6"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
    >
      <button
        type="button"
        onClick={goBack}
        aria-label="Înapoi"
        className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-neutral-900 transition-transform active:scale-[0.97]"
      >
        <ArrowLeft className="h-[22px] w-[22px]" strokeWidth={2.4} />
      </button>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 pb-16 text-center">
        <h1 className="text-[19px] font-semibold tracking-tight text-neutral-900">
          Anunțul nu s-a putut încărca
        </h1>
        <p className="max-w-[300px] text-[14.5px] leading-relaxed text-neutral-500">
          A fost o problemă de moment. Încearcă din nou — anunțul este în regulă.
        </p>

        <button
          type="button"
          onClick={reset}
          className="mt-1 inline-flex h-12 items-center gap-2 rounded-full bg-[#7c3aed] px-6 text-[15px] font-semibold text-white transition-transform active:scale-[0.98]"
        >
          <RotateCw className="h-[17px] w-[17px]" strokeWidth={2.4} />
          Încearcă din nou
        </button>

        <button
          type="button"
          onClick={goBack}
          className="text-[14.5px] font-medium text-neutral-500 underline-offset-4 active:underline"
        >
          Înapoi
        </button>
      </div>
    </div>
  )
}
