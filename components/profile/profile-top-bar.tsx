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
 * WHEN IT SHOWS: only when the visitor arrived from somewhere, any other
 * page of ours (lib/profile/back cameFromElsewhere). The server says so
 * from the Referer (or ?from=community|explore on the link); the browser
 * also checks the page it actually came from (the app's own trail, else
 * document.referrer), because a client side move does not always carry a
 * Referer the server can trust. Opened cold (a shared link, a reload): no
 * chevron, and no bar of its own.
 *
 * IT ANSWERS THE FINGER AT ONCE, AND ONCE. The press shows on pointerdown,
 * before the click and before any navigation, as a soft tint of the bar's
 * own ink, set on the element itself (no React render in between, no
 * shrink: the owner asked for no bumps), and fades out when released. The
 * first press goes back; a second press while that back is under way (a
 * double tap, an impatient thumb) is ignored, so a double tap never goes
 * back two pages. The guard lifts when this page is shown again (a back
 * that did nothing ends in the fallback, and bfcache can bring the page
 * back), so the chevron is never dead.
 */
import type React from "react"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { backThen } from "@/lib/navigation/go-back"
import { previousPath } from "@/lib/navigation/in-app-history"
import { cameFromElsewhere } from "@/lib/profile/back"
import { cn } from "@/lib/utils"

/** Whether this page was reached from another page of ours. */
export function useCameFromSomewhere(initiallyShown: boolean): boolean {
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
    if (cameFromElsewhere(from, window.location.pathname)) setShown(true)
  }, [initiallyShown])
  return shown
}

/** How long a press keeps the chevron from going back again: longer than any real back takes to show itself (go-back BACK_WATCH_MS). */
const LEAVING_MS = 1500

/** The chevron itself: 40px to a thumb, drawn in the bar's own text colour, nothing but the icon. */
export function BackChevron({ fallback = "/explore", className }: { fallback?: string; className?: string }) {
  const router = useRouter()
  /* A back is under way: the next press does nothing (IT ANSWERS THE FINGER AT ONCE, AND ONCE). */
  const leaving = useRef(false)
  useEffect(() => {
    const again = () => {
      leaving.current = false
    }
    window.addEventListener("pageshow", again)
    return () => window.removeEventListener("pageshow", again)
  }, [])
  const release = (e: React.PointerEvent<HTMLButtonElement>) => {
    delete e.currentTarget.dataset.pressed
  }
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        if (e.button === 0) e.currentTarget.dataset.pressed = ""
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onClick={(e) => {
        delete e.currentTarget.dataset.pressed
        if (leaving.current) return
        leaving.current = true
        window.setTimeout(() => {
          leaving.current = false
        }, LEAVING_MS)
        backThen(() => router.push(fallback))
      }}
      aria-label="Back"
      data-profile-back-button=""
      className={cn(
        "-ml-1.5 inline-flex h-10 w-10 shrink-0 cursor-pointer touch-manipulation select-none items-center justify-center rounded-full text-current outline-none",
        "transition-[background-color] duration-200 ease-out data-[pressed]:bg-current/[0.12] data-[pressed]:duration-0",
        "pointer-fine:hover:bg-current/[0.08] focus-visible:ring-2 focus-visible:ring-current/30 [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none]",
        className,
      )}
    >
      <ChevronLeft className="pointer-events-none h-[22px] w-[22px]" strokeWidth={2} aria-hidden />
    </button>
  )
}

/** For a bar that already exists (the creator's newsletter bar): the chevron, or nothing. */
export function TopBarBack({ initiallyShown, fallback }: { initiallyShown: boolean; fallback?: string }) {
  const shown = useCameFromSomewhere(initiallyShown)
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
  const shown = useCameFromSomewhere(initiallyShown)
  if (!shown) return null
  return (
    <div
      data-profile-top-bar=""
      data-profile-back=""
      /* The page's top surface: in the app, when no Storelib header is above it, it pads itself under the clock (app/globals.css .native-top-surface); a hairline at its foot and no shadow, one surface with the white band. */
      className="native-top-surface w-full border-b border-black/[0.06]"
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
