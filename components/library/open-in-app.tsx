"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { X } from "lucide-react"
import { isNativeApp } from "@/lib/platform-utils"
import { StorelibGlyph } from "@/components/app/share/storelib-share-marks"
import { appLink, phoneOf, type Phone } from "@/lib/platform/open-in-app"
import { SECONDARY, SMALL } from "./library-ui"

/**
 * ===========================================================================
 *  "OPEN IN APP", FOR A PHONE IN A BROWSER
 * ===========================================================================
 * A calm line above the library on a phone's browser, and nothing anywhere
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

  return (
    <div
      data-open-in-app={phone}
      className={`flex items-center gap-3 rounded-2xl border border-[#e4e7ec]/80 bg-white py-2.5 pl-2.5 pr-1.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`}
    >
      <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-[#7c3aed]">
        <StorelibGlyph size={20} className="text-white" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold leading-5 text-[#1a1a2e]">Storelib app</p>
        <p className="truncate text-[12.5px] leading-4 text-[#6b7280]">Your library and downloads on this phone</p>
      </div>
      <a href={appLink(phone, pathname)} onClick={open} className={`${SECONDARY} ${SMALL}`}>
        Open
      </a>
      <button
        type="button"
        onClick={close}
        aria-label="Hide for now"
        className="inline-flex h-9 w-8 shrink-0 items-center justify-center rounded-lg text-[#9ca3af] transition-colors hover:text-[#4b5563]"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
