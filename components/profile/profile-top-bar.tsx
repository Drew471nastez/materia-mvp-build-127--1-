"use client"

/**
 * ===========================================================================
 *  THE WAY BACK, IN THE TOP BAR, NEXT TO THE PERSON
 * ===========================================================================
 * A profile or a creator's page opened from a community, Explore or search
 * opens in the same tab, so it offers the way back. The owner, with a
 * screenshot of a creator page whose newsletter bar had a big "Back" pill
 * under it: the control belongs IN the top bar, next to the person's
 * avatar. So it is a chevron at the start of that bar:
 *
 *   CREATOR PAGE WITH A NEWSLETTER BAR   the chevron is the bar's first
 *                                        thing, before the creator's photo
 *                                        (TopBarBack, handed to SubscribeBar
 *                                        as `leading`).
 *   ANY OTHER PROFILE OR CREATOR PAGE    a slim bar of the same shape:
 *                                        chevron, photo, name (ProfileTopBar),
 *                                        in the page's own bar colours.
 *
 * It goes back in history, which returns to the feed where it was
 * scrolled, and when there is nothing behind (a reload, a link opened in a
 * new tab) it lands on Explore instead (lib/navigation/go-back backThen).
 *
 * WHEN IT SHOWS. The server says so when the request came from one of those
 * pages (the Referer, or ?from=community|explore on the link); the browser
 * also checks the page it actually came from (the app's own trail, else
 * document.referrer), because a client side move does not always carry a
 * Referer the server can trust. Arrived any other way: no chevron, and no
 * bar of its own.
 */
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { backThen } from "@/lib/navigation/go-back"
import { previousPath } from "@/lib/navigation/in-app-history"
import { cameFromBrowsing } from "@/lib/profile/back"
import { cn } from "@/lib/utils"

/** Whether this page was reached from a community, Explore or search. */
export function useCameFromBrowsing(initiallyShown: boolean): boolean {
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
  return shown
}

/** The chevron itself: 40px to a thumb, drawn in the bar's own text colour. */
export function BackChevron({ fallback = "/explore", className }: { fallback?: string; className?: string }) {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => backThen(() => router.push(fallback))}
      aria-label="Back"
      data-profile-back-button=""
      className={cn(
        "-ml-1.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-current outline-none transition-[background-color,scale] duration-150",
        "hover:bg-current/[0.08] active:scale-[0.94] focus-visible:ring-2 focus-visible:ring-current/30 motion-reduce:active:scale-100 [-webkit-tap-highlight-color:transparent]",
        className,
      )}
    >
      <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden />
    </button>
  )
}

/** For a bar that already exists (the creator's newsletter bar): the chevron, or nothing. */
export function TopBarBack({ initiallyShown, fallback }: { initiallyShown: boolean; fallback?: string }) {
  const shown = useCameFromBrowsing(initiallyShown)
  if (!shown) return null
  return (
    <span data-profile-back="" className="inline-flex">
      <BackChevron fallback={fallback} />
    </span>
  )
}

/**
 * The slim bar for a page that has none: the chevron, the person's photo and
 * name. In the page's bar colours on a creator's page, Storelib's white with
 * a hairline on a profile.
 */
export function ProfileTopBar({
  initiallyShown,
  name,
  avatarUrl,
  colors,
  fallback,
  width = "max-w-[960px]",
}: {
  initiallyShown: boolean
  name: string
  avatarUrl: string | null
  colors?: { background: string; text: string } | null
  fallback?: string
  /** The row's width: the page's own column, so the chevron lines up with what is under it. */
  width?: string
}) {
  const shown = useCameFromBrowsing(initiallyShown)
  if (!shown) return null
  return (
    <div
      data-profile-top-bar=""
      data-profile-back=""
      className="w-full border-b border-black/[0.06] shadow-[0_1px_2px_rgba(16,24,40,0.03)]"
      style={{ backgroundColor: colors?.background || "#ffffff", color: colors?.text || "#1a1a2e" }}
    >
      <div className={cn("mx-auto flex h-14 w-full items-center gap-2.5 px-3 sm:px-4", width)}>
        <BackChevron fallback={fallback} />
        <AppAvatar src={avatarUrl} name={name} size={32} className="h-8 w-8 shrink-0" />
        <p className="min-w-0 truncate text-[15px] font-semibold" data-profile-top-bar-name="">
          {name}
        </p>
      </div>
    </div>
  )
}
