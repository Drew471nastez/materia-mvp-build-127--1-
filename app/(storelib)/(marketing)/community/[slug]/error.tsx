"use client"

/**
 * A PLACE THAT FAILS STAYS INSIDE THE COMMUNITY (round 15). Without this, a throw in any page of a community went to the
 * app's root boundary (app/error.tsx), which replaces the whole screen, the community's own bar and the tab bar included,
 * and for code a deploy removed shows an empty page while it decides to reload: one of the owner's "white screens". Here
 * the community's frame (its layout, above this) stays where it is and the middle says what happened, with Try again.
 * Code that failed to load is fetched again by loading the same address once in full (never in a loop:
 * lib/communities/client/resume.ts hardNavigationAllowed).
 */
import { useEffect } from "react"
import { buildReport } from "@/lib/client-errors"
import { hardNavigationAllowed, loadingFailure } from "@/lib/communities/client/resume"
import { BTN_SECONDARY } from "@/components/community/member/ui"

export default function CommunityPlaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = loadingFailure(error)
  useEffect(() => {
    try {
      void fetch("/api/client-errors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildReport(error, window.location.href)), keepalive: true }).catch(() => {})
    } catch {
      /* A report is never worth breaking the screen over. */
    }
    if (!stale) return
    let store: Storage | null = null
    try {
      store = window.sessionStorage
    } catch {
      store = null
    }
    if (hardNavigationAllowed(store)) window.location.assign(window.location.href)
  }, [error, stale])
  return (
    <div className="py-16 text-center" data-place-error="">
      <p className="text-[15px] font-semibold text-[#1a1a2e]">{stale ? "Storelib was updated" : "This could not be shown"}</p>
      <p className="mt-1 text-[14px] text-[#6b7280]">{stale ? "Loading the new version." : "Something went wrong here. The rest of the community still works."}</p>
      {stale ? null : (
        <button type="button" onClick={reset} className={`${BTN_SECONDARY} mt-4`}>
          Try again
        </button>
      )}
    </div>
  )
}
