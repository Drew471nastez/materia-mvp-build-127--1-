"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { X } from "lucide-react"
import { isNativeApp } from "@/lib/platform-utils"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { APP_BANNER_COOKIE, APP_BANNER_QUIET_DAYS, appLink, type Phone } from "@/lib/platform/open-in-app"

/**
 * ===========================================================================
 *  "OPEN IN THE STORELIB APP", A BANNER ON A PHONE'S BROWSER
 * ===========================================================================
 * "It should actually be a banner, cool and clean, with the actual Storelib
 * icon." It was a line of small grey type at the foot of the library. It is
 * now the strip a phone's browser draws for an app it knows about: the
 * Storelib icon at its 7px corner (components/brand/storelib-logo), the
 * name and one short line, Open, and a close at the start. 60px, at the
 * top of the library, above the heading.
 *
 * NOTHING MOVES WHEN IT ARRIVES. Whether to draw it is known on the server
 * (app/library/layout.tsx reads the phone from the request and the closed
 * mark from a cookie), so its room is in the first paint and it only fades
 * in inside that room. Never inside the app (the server reads the app's
 * user agent, and html.capacitor hides it before paint if that ever misses),
 * never on a computer, and not again for APP_BANNER_QUIET_DAYS once closed.
 * Closing folds it away over FOLD_MS, the only time it changes the page's
 * height, and only because the reader asked.
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

/** The App Store page, when it is configured; otherwise the App Store's own search for Storelib. */
const APP_STORE_URL =
  process.env.NEXT_PUBLIC_IOS_APP_STORE_URL || "itms-apps://search.itunes.apple.com/WebObjects/MZSearch.woa/wa/search?media=software&term=Storelib"

export const FOLD_MS = 220

export function OpenInApp({ phone }: { phone: Phone | null }) {
  const pathname = usePathname() || "/library"
  const [state, setState] = useState<"shown" | "folding" | "gone">(phone ? "shown" : "gone")

  /* Inside the app after all (a user agent the server did not know): gone before anyone sees it. */
  useEffect(() => {
    if (phone && isNativeApp()) setState("gone")
  }, [phone])

  if (!phone || state === "gone") return null

  const close = () => {
    try {
      document.cookie = `${APP_BANNER_COOKIE}=closed; path=/; max-age=${APP_BANNER_QUIET_DAYS * 24 * 60 * 60}; samesite=lax`
    } catch {
      /* hidden for this visit only */
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return setState("gone")
    setState("folding")
    window.setTimeout(() => setState("gone"), FOLD_MS + 40)
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

  const folding = state === "folding"

  return (
    <div
      data-open-in-app={phone}
      data-state={state}
      style={{ transitionDuration: `${FOLD_MS}ms`, transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      className={`grid transition-[grid-template-rows,opacity,margin-bottom] motion-reduce:transition-none [html.capacitor_&]:hidden ${
        folding ? "mb-0 grid-rows-[0fr] opacity-0" : "mb-4 grid-rows-[1fr] opacity-100"
      }`}
    >
      <div className="min-h-0 overflow-hidden">
        <aside
          aria-label="Storelib app"
          data-open-in-app-banner=""
          className="flex h-[60px] items-center gap-2.5 rounded-2xl border border-[#e4e7ec]/80 bg-white pl-1 pr-2.5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_3px_8px_-2px_rgba(16,24,40,0.05)] duration-300 animate-in fade-in-0 slide-in-from-top-1 motion-reduce:animate-none"
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            data-open-in-app-close=""
            className="-mr-1 inline-flex h-11 w-9 shrink-0 items-center justify-center rounded-xl text-[#9ca3af] transition-colors duration-100 active:bg-[#f3f4f6] active:text-[#4b5563] [-webkit-tap-highlight-color:transparent]"
          >
            <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </button>
          <StorelibLogo size={40} alt="" data-open-in-app-icon="" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold leading-[18px] text-[#1a1a2e]">Storelib</p>
            <p className="truncate text-[12.5px] leading-[17px] text-[#6b7280]">Your library in the app</p>
          </div>
          <a
            href={appLink(phone, pathname)}
            onClick={open}
            data-open-in-app-open=""
            className="inline-flex h-8 shrink-0 items-center rounded-full bg-[#1a1a2e] px-4 text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(16,24,40,0.24)] transition-[scale,background-color] duration-100 active:scale-[0.96] active:bg-[#12121f] [-webkit-tap-highlight-color:transparent]"
          >
            Open
          </a>
        </aside>
      </div>
    </div>
  )
}
