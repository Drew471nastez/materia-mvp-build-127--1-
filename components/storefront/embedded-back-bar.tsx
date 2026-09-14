"use client"

/**
 * ===========================================================================
 *  THE WAY BACK, INSIDE A FRAME THAT HAS NO BROWSER AROUND IT
 * ===========================================================================
 * A product page reached by clicking a card in the workspace's canvas is a
 * page with no address bar, no back button and no tab — the frame has none of
 * that, and the workspace's own bar is about the creator page, not about
 * this. So without this a creator is stuck looking at one product until they
 * navigate the whole app again.
 *
 * `history.back()` rather than a link to the creator page, because the frame
 * has a real history and going back is what the control claims to do. The
 * fallback matters though: a creator can reach a product page as the FIRST
 * thing in a frame (a reload lands on whatever the frame was showing), and
 * there `history.back()` either does nothing or leaves the app entirely.
 * `referrer` on this origin means there is somewhere to go back to.
 */

import { useEffect, useState } from "react"
import { ArrowLeft } from "lucide-react"

export function EmbeddedBackBar() {
  const [canGoBack, setCanGoBack] = useState(false)

  useEffect(() => {
    try {
      setCanGoBack(window.history.length > 1 && document.referrer.startsWith(window.location.origin))
    } catch {
      setCanGoBack(false)
    }
  }, [])

  return (
    <div className="sticky top-0 z-40 flex items-center gap-2 border-b border-black/10 bg-white/85 px-3 py-2 backdrop-blur">
      <button
        type="button"
        onClick={() => {
          if (canGoBack) window.history.back()
          else window.location.assign("/app/creator-page")
        }}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-gray-700 transition-colors hover:bg-black/5 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Back to your page
      </button>
    </div>
  )
}
