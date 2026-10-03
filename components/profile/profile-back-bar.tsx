"use client"

/**
 * ===========================================================================
 *  THE WAY BACK TO THE COMMUNITY, OR TO EXPLORE
 * ===========================================================================
 * A profile opened from a community (an author, a member, "By <creator>")
 * or from Explore opens in the same tab, so the page offers the way back
 * at its top: a round chevron and the word Back. It goes back in history,
 * which returns to the feed where it was scrolled, and when there turns
 * out to be nothing behind (a reload, a link opened in a new tab) it lands
 * on Explore instead (lib/navigation/go-back backThen).
 *
 * WHEN IT SHOWS. The server says so when the request came from one of those
 * pages (the Referer, or ?from=community|explore on the link); the browser
 * also checks the page it actually came from (the app's own trail, else
 * document.referrer), because a client side move does not always carry a
 * Referer the server can trust. Anywhere else, no bar: a profile opened
 * from the header or typed in has the header's own navigation.
 *
 * Not sticky. The site header above it already is, and two bars stuck to
 * the top of a phone is what the owner asked us to stop doing.
 */
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { secondaryDepth } from "@/components/ui/depth-button"
import { backThen } from "@/lib/navigation/go-back"
import { previousPath } from "@/lib/navigation/in-app-history"
import { cameFromBrowsing } from "@/lib/profile/back"
import { cn } from "@/lib/utils"

export function ProfileBackBar({ initiallyShown, fallback = "/explore", className }: { initiallyShown: boolean; fallback?: string; className?: string }) {
  const router = useRouter()
  const [shown, setShown] = useState(initiallyShown)

  useEffect(() => {
    if (initiallyShown) return
    let from = previousPath()
    if (!from) {
      try {
        const ref = new URL(document.referrer)
        if (ref.origin === window.location.origin) from = ref.pathname
      } catch {
        from = null
      }
    }
    if (cameFromBrowsing(from)) setShown(true)
  }, [initiallyShown])

  if (!shown) return null
  return (
    <div className={cn("mb-3 flex items-center sm:mb-4", className)} data-profile-back="">
      <button
        type="button"
        onClick={() => backThen(() => router.push(fallback))}
        className={cn(secondaryDepth, "h-10 rounded-full pl-2 pr-4 text-[14px]")}
        data-profile-back-button=""
      >
        <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
        Back
      </button>
    </div>
  )
}
