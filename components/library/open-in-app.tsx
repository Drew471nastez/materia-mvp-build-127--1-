"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { X } from "lucide-react"
import { isNativeApp } from "@/lib/platform-utils"
import { StorelibGlyph } from "@/components/app/share/storelib-share-marks"
import { appLink, phoneOf, type Phone } from "@/lib/platform/open-in-app"

/**
 * ===========================================================================
 *  "OPEN IN APP", FOR A PHONE IN A BROWSER
 * ===========================================================================
 * A quiet line at the foot of the library on a phone's browser, and nothing anywhere
 * else: not inside the app (it already is the app), not on a computer (there
 * is no desktop app), and not again for a month once closed.
 *
 * HOW IT OPENS THE APP, from what the apps register today:
 *
 *   iPhone    the app's own scheme, com.storelib.app:// (ios/App/App/
 *             Info.plist CFBundleURLSchemes). The address carries the page,
 *             and the app goes there (components/native-auth-handler.tsx,
 *             `open`). Universal links would be nicer, but iOS never opens
 *             a universal link for a tap on the same site, and the site's
 *             apple-app-site-association only names the sign-in pages. If
 *             the page is still showing a moment later, the app is not
 *             installed, and the App Store is opened instead.
 *   Android   an intent for the app's launcher (android.intent.action.MAIN
 *             in com.storelib.app), with the Play Store as Chrome's own
 *             fallback. The installed app registers no scheme that carries
 *             a page, so it opens where it opens for this buyer, which is
 *             their library.
 */

const DISMISS_KEY = "storelib.openInApp.closedAt"
const QUIET_FOR_MS = 30 * 24 * 60 * 60 * 1000
/** The App Store page, when it is configured; otherwise the App Store's own search for Storelib. */
const APP_STORE_URL =
  process.env.NEXT_PUBLIC_IOS_APP_STORE_URL || "itms-apps://search.itunes.apple.com/WebObjects/MZSearch.woa/wa/search?media=software&term=Storelib"

export function OpenInApp({ className = "" }: { className?: string }) {
  const pathname = usePathname() || "/library"
  const [phone, setPhone] = useState<Phone | null>(null)

  useEffect(() => {
    if (isNativeApp()) return
    const found = phoneOf(navigator.userAgent || "")
    if (!found) return
    try {
      const closed = Number(window.localStorage.getItem(DISMISS_KEY))
      if (closed && Date.now() - closed < QUIET_FOR_MS) return
    } catch {
      /* no storage: show it, closing still hides it for this visit */
    }
    setPhone(found)
  }, [])

  if (!phone) return null

  const close = () => {
    setPhone(null)
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      /* hidden for this visit only */
    }
  }

  const open = () => {
    if (phone !== "ios") return
    /* Still here after the app had its chance: it is not installed. */
    const started = Date.now()
    const timer = window.setTimeout(() => {
      if (document.visibilityState === "visible" && Date.now() - started < 4000) window.location.href = APP_STORE_URL
    }, 1600)
    const gone = () => {
      if (document.visibilityState === "hidden") window.clearTimeout(timer)
    }
    document.addEventListener("visibilitychange", gone, { once: true })
  }

  /*
    ONE QUIET LINE AT THE FOOT OF THE PAGE. It was a card above the list,
    the app's mark, a title, a sentence and an Open button, and the owner
    said it took too much room on the screen that is for their purchases. It
    is now a line of small grey type under everything, the way a site says
    it has an app, with the same Open and the same Hide.
  */
  return (
    <div data-open-in-app={phone} className={`flex items-center justify-center gap-1 text-[13px] text-[#8a919c] ${className}`}>
      <a
        href={appLink(phone, pathname)}
        onClick={open}
        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2 font-medium text-[#6b7280] transition-colors hover:text-[#1a1a2e]"
      >
        <StorelibGlyph size={14} className="text-[#7c3aed]" />
        Open in the Storelib app
      </a>
      <button
        type="button"
        onClick={close}
        aria-label="Hide for now"
        className="inline-flex h-9 w-8 shrink-0 items-center justify-center rounded-lg text-[#b0b5bd] transition-colors hover:text-[#4b5563]"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  )
}
