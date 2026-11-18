"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Check } from "lucide-react"
import { ARRIVAL_COOKIE, ARRIVAL_MOVE_MS, arrivalBottom, arrivalFromCookieString, arrivalWaitsOn, type Arrival, type ArrivalSurface } from "@/lib/auth/arrival"
import { tt } from "@/lib/i18n/text"
import { recordSignupTouches } from "@/lib/attribution/signup-browser"

/** On screen this long, then it fades. */
const SHOWN_MS = 3000

/**
 * What the cookie said, taken once per page load. Held here, outside the
 * component, because the cookie is cleared the moment it is read: a note
 * whose component is mounted again while the page settles (a provider above
 * it changing shape) would otherwise find nothing and never be seen.
 */
let taken: { arrival: Arrival; at: number } | null = null

function take(): { arrival: Arrival; at: number } | null {
  if (taken) return taken
  try {
    const arrival = arrivalFromCookieString(document.cookie)
    if (!arrival) return null
    document.cookie = `${ARRIVAL_COOKIE}=; path=/; max-age=0; samesite=lax`
    taken = { arrival, at: Date.now() }
  } catch {
    return null
  }
  return taken
}

/**
 * "Account created" or "Welcome back", once, on the page a sign in lands on
 * (lib/auth/arrival.ts decides which, from the account). Mounted in the root
 * layout, so it is there whatever the page is. It waits past the sign in
 * screens and the welcome step, and clears its cookie the moment it is read,
 * so the next page does not say it again.
 *
 * A dark note at the foot of the screen, the way Shopify says a thing is
 * done, standing over whichever bar the phone shows: /app's pill or the
 * buyer's tab bar (lib/auth/arrival.ts arrivalBottom), never on it.
 *
 * IT COMES AND GOES, IT DOES NOT BLINK. It rises 8px as it fades in and
 * sinks as it fades out, over ARRIVAL_MOVE_MS. The first frame is painted
 * hidden and the next one shown (two frames: one could land in the same
 * paint and the note would appear at once). Under reduced motion it simply
 * appears and goes.
 */
/** Is /app's phone pill on screen? Its own element, so a page without it (OnePage's editor) or a computer says no. */
function surfaceNow(): ArrivalSurface {
  try {
    const pill = document.querySelector("[data-app-nav-pill]")
    if (pill && pill.getBoundingClientRect().height > 0 && getComputedStyle(pill).display !== "none") return "app"
  } catch {
    /* no layout yet */
  }
  return "other"
}

export function ArrivalNote() {
  const pathname = usePathname() || "/"
  const [said, setSaid] = useState<Arrival | null>(null)
  const [shown, setShown] = useState(false)
  const [surface, setSurface] = useState<ArrivalSurface>("other")

  useEffect(() => {
    if (arrivalWaitsOn(pathname)) return
    const note = take()
    if (!note) return
    /* A new account: where its visit came from, written once by the server (app/api/auth/signup-attribution). */
    if (note.arrival === "new") recordSignupTouches()
    const left = note.at + SHOWN_MS - Date.now()
    if (left <= 0) return
    setSurface(surfaceNow())
    setSaid(note.arrival)
    let raf = requestAnimationFrame(() => {
      /* The pill may mount a moment after the page: asked again just before the note shows. */
      setSurface(surfaceNow())
      raf = requestAnimationFrame(() => setShown(true))
    })
    const out = window.setTimeout(() => setShown(false), left)
    const gone = window.setTimeout(() => setSaid(null), left + ARRIVAL_MOVE_MS)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(out)
      window.clearTimeout(gone)
    }
  }, [pathname])

  if (!said) return null
  return (
    <div
      role="status"
      data-auth-arrival={said}
      className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4 print:hidden"
      data-arrival-surface={surface}
      style={{ bottom: arrivalBottom(surface) }}
    >
      <div
        className="flex items-center gap-2 rounded-xl bg-[#1a1a2e] px-4 py-2.5 text-[14px] font-medium text-white shadow-[0_4px_16px_rgba(0,0,0,0.16)] transition-[opacity,translate] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        style={{ opacity: shown ? 1 : 0, translate: shown ? "0 0" : "0 8px", transitionDuration: `${ARRIVAL_MOVE_MS}ms` }}
      >
        <Check aria-hidden className="h-4 w-4 text-[#86efac]" strokeWidth={2.5} />
        {said === "new" ? tt("Account created") : tt("Welcome back")}
      </div>
    </div>
  )
}
