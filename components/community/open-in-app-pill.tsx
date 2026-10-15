"use client"

/**
 * ===========================================================================
 *  "OPEN IN THE STORELIB APP", A SMALL PILL ON A COMMUNITY IN A PHONE'S
 *  BROWSER
 * ===========================================================================
 * Round 13: "in mobile browsers a subtle Smart App Banner / 'Open in the
 * Storelib app' pill on community pages". Two parts, one component:
 *
 *   THE SYSTEM'S BANNER. Safari on an iPhone draws Apple's own Smart App
 *   Banner (the app's icon, its rating, Open or Get) for a page carrying
 *   <meta name="apple-itunes-app">. It is rendered here with the page's own
 *   address as the argument, when NEXT_PUBLIC_IOS_APP_STORE_ID is set (the
 *   numeric id in the App Store link); React puts it in the head.
 *
 *   THE PILL. Everywhere else on a phone (Android's Chrome, Chrome or
 *   Firefox on an iPhone, Safari while no App Store id is set): a quiet
 *   white pill at the foot of the screen, the Storelib mark and "Open in
 *   the Storelib app", and a close. It opens this page in the app
 *   (lib/platform/open-in-app pageAppLink), or the store when the app is
 *   not there. Closed, it stays away for APP_PILL_QUIET_DAYS.
 *
 * Never in the app, never on a computer. Nothing is drawn on the server, so
 * a page never shifts for it: the pill is fixed, above everything but the
 * community's sheets and toasts, and rises in after the page has settled.
 *
 * Mounted once by the community frame (worker F2's file):
 *   <OpenInAppPill />
 */

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { X } from "lucide-react"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { isNativeApp } from "@/lib/platform-utils"
import { keyboardInsetOrFloor } from "@/lib/ui/keyboard-safe-sheet"
import { COMMUNITY_FLOAT_BOTTOM, startCommunityFixedFootWatch } from "@/components/community/fixed-foot-chrome"
import { APP_PILL_KEY, APP_PILL_QUIET_DAYS, pageAppLink, pillPhone, storeLink, type Phone } from "@/lib/platform/open-in-app"

const APP_STORE_ID = (process.env.NEXT_PUBLIC_IOS_APP_STORE_ID || "").trim()
const APP_STORE_URL = /^\d+$/.test(APP_STORE_ID)
  ? `https://apps.apple.com/app/id${APP_STORE_ID}`
  : process.env.NEXT_PUBLIC_IOS_APP_STORE_URL || "itms-apps://search.itunes.apple.com/WebObjects/MZSearch.woa/wa/search?media=software&term=Storelib"

/** How long after the page settles the pill rises in. */
export const PILL_DELAY_MS = 900

function closedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(APP_PILL_KEY) || 0)
    return at > 0 && Date.now() - at < APP_PILL_QUIET_DAYS * 24 * 60 * 60 * 1000
  } catch {
    return false
  }
}

export function OpenInAppPill() {
  const pathname = usePathname() || "/"
  const onPostPage = /\/post\//.test(pathname.split(/[?#]/)[0])
  const [phone, setPhone] = useState<Phone | null>(null)
  const [shown, setShown] = useState(false)
  const [keyboard, setKeyboard] = useState(false)
  const [postOpen, setPostOpen] = useState(false)
  useEffect(() => {
    const read = () => {
      const root = document.querySelector<HTMLElement>("[data-post-overlay-root]")
      setPostOpen(!!root && root.style.pointerEvents !== "none")
    }
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "data-post-overlay-phase"] })
    return () => mo.disconnect()
  }, [])
  useEffect(() => {
    const read = () => {
      const vv = window.visualViewport
      /* Its own reading when the platform gave one, the published floor when it did not (lib/ui/keyboard-safe-sheet.ts). */
      const inset = vv ? keyboardInsetOrFloor(Math.max(0, window.innerHeight - vv.offsetTop - vv.height)) : 0
      setKeyboard(inset > 80)
    }
    read()
    const vv = window.visualViewport
    vv?.addEventListener("resize", read)
    vv?.addEventListener("scroll", read)
    return () => {
      vv?.removeEventListener("resize", read)
      vv?.removeEventListener("scroll", read)
    }
  }, [])

  useEffect(() => {
    if (isNativeApp() || closedRecently()) return
    const which = pillPhone(navigator.userAgent || "", /^\d+$/.test(APP_STORE_ID))
    if (!which) return
    setPhone(which)
    const stopFoot = startCommunityFixedFootWatch()
    const t = window.setTimeout(() => setShown(true), PILL_DELAY_MS)
    return () => {
      window.clearTimeout(t)
      stopFoot()
    }
  }, [])

  const close = () => {
    try {
      localStorage.setItem(APP_PILL_KEY, String(Date.now()))
    } catch {
      /* hidden for this visit only */
    }
    setShown(false)
    window.setTimeout(() => setPhone(null), 260)
  }

  const open = () => {
    /* The account remembers this page, so signing in on the phone opens it (lib/account/app-open). */
    try {
      void fetch("/api/account/app-open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pathname }),
      })
    } catch {
      /* Signed out, or offline: the store link still carries the page where it can. */
    }
    if (phone !== "ios") return
    /*
      The scheme opens the app when it is installed. Still here a moment
      later: it is not, so the App Store. Android's intent already falls
      back to Play with this page as the referrer.
    */
    const store = storeLink("ios", pathname, APP_STORE_ID) || APP_STORE_URL
    const started = Date.now()
    const timer = window.setTimeout(() => {
      if (document.visibilityState === "visible" && Date.now() - started < 4000) window.location.href = store
    }, 1400)
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") window.clearTimeout(timer)
    }, { once: true })
  }

  const site = typeof window !== "undefined" ? window.location.host.replace(/^www\./, "") : "storelib.com"
  return (
    <>
      {/^\d+$/.test(APP_STORE_ID) ? <meta name="apple-itunes-app" content={`app-id=${APP_STORE_ID}, app-argument=https://storelib.com${pathname}`} /> : null}
      {phone && !keyboard && !onPostPage && !postOpen ? (
        <div
          data-open-app-pill={phone}
          data-state={shown ? "shown" : "hidden"}
          className="pointer-events-none fixed inset-x-0 z-[70] flex justify-center px-4 [html.capacitor_&]:hidden"
          style={{ bottom: COMMUNITY_FLOAT_BOTTOM }}
        >
          <div
            className="pointer-events-auto flex h-11 max-w-[calc(100vw-32px)] items-center rounded-[10px] bg-white pl-1.5 pr-1 shadow-[0_0_0_1px_rgba(17,24,39,0.07),0_2px_4px_rgba(17,24,39,0.05),0_8px_24px_-8px_rgba(17,24,39,0.18)] transition-[opacity,translate] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
            style={{ opacity: shown ? 1 : 0, translate: shown ? "0 0" : "0 12px" }}
            aria-hidden={!shown}
          >
            <a
              href={pageAppLink(phone, pathname, site || "storelib.com")}
              onClick={open}
              data-open-app-pill-open=""
              tabIndex={shown ? 0 : -1}
              className="flex h-11 min-w-0 items-center gap-2 rounded-[10px] pr-2 text-[13px] font-semibold leading-tight text-[#1a1a2e] transition-[scale] duration-100 active:scale-[0.97] [-webkit-tap-highlight-color:transparent] sm:text-[13.5px]"
            >
              <StorelibLogo size={28} alt="" className="block h-7 w-7" />
              Open in the Storelib app
            </a>
            <span aria-hidden className="mx-0.5 h-5 w-px bg-[#e5e7eb]" />
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              data-open-app-pill-close=""
              tabIndex={shown ? 0 : -1}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-[#9ca3af] transition-colors duration-100 active:bg-[#f3f4f6] active:text-[#4b5563] [-webkit-tap-highlight-color:transparent]"
            >
              <X className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
