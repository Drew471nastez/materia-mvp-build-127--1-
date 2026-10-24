"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Check } from "lucide-react"
import { ARRIVAL_COOKIE, arrivalFromCookieString, arrivalWaitsOn, type Arrival } from "@/lib/auth/arrival"
import { tt } from "@/lib/i18n/text"

/** On screen this long, then it fades. */
const SHOWN_MS = 3000
const FADE_MS = 300

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
 * A dark note at the foot of the screen, over the phone's tab bar when there
 * is one (--buyer-tabs-h), the way Shopify says a thing is done.
 */
export function ArrivalNote() {
  const pathname = usePathname() || "/"
  const [said, setSaid] = useState<Arrival | null>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (arrivalWaitsOn(pathname)) return
    const note = take()
    if (!note) return
    const left = note.at + SHOWN_MS - Date.now()
    if (left <= 0) return
    setSaid(note.arrival)
    const raf = requestAnimationFrame(() => setShown(true))
    const out = window.setTimeout(() => setShown(false), left)
    const gone = window.setTimeout(() => setSaid(null), left + FADE_MS)
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
      style={{ bottom: "calc(var(--buyer-tabs-h, env(safe-area-inset-bottom, 0px)) + 16px)" }}
    >
      <div
        className="flex items-center gap-2 rounded-xl bg-[#1a1a2e] px-4 py-2.5 text-[14px] font-medium text-white shadow-[0_4px_16px_rgba(0,0,0,0.16)] transition-[opacity,translate] duration-300 ease-out motion-reduce:transition-none"
        style={{ opacity: shown ? 1 : 0, translate: shown ? "0 0" : "0 8px" }}
      >
        <Check aria-hidden className="h-4 w-4 text-[#86efac]" strokeWidth={2.5} />
        {said === "new" ? tt("Account created") : tt("Welcome back")}
      </div>
    </div>
  )
}
