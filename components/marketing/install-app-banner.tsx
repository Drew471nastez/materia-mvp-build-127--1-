"use client"

import Image from "next/image"
import { useEffect, useState } from "react"
import { X } from "lucide-react"

/**
 * ===========================================================================
 *  THE STRIP THAT OFFERS THE APP, ONCE
 * ===========================================================================
 *
 * A mobile browser is where somebody meets this marketplace, and the app is
 * the version of it with a tab bar, push notifications and no address bar
 * eating a row of the screen. There was no way to get from one to the other:
 * a visitor on a phone had to know the app existed and go and look for it.
 *
 * The shape is the one every marketplace uses because it is the one people
 * already know how to dismiss — icon, name, rating, a button, and an × on the
 * left that closes it for good.
 *
 * ---------------------------------------------------------------------------
 * WHY IT RENDERS INSIDE THE HEADER
 * ---------------------------------------------------------------------------
 * The feed is `position: fixed` under `--web-header-h`, which the header
 * measures off its own root. A banner rendered ABOVE the header is a band the
 * feed knows nothing about, so it would sit behind the header's box and the
 * top of the marketplace would be underneath it. Rendered as the header's
 * first child, it is inside the element the ResizeObserver is already watching
 * — so it appears, the height republishes, and everything under it moves down
 * without a single line of coordination.
 *
 * ---------------------------------------------------------------------------
 * WHY iOS ONLY, AND HOW THAT CHANGES
 * ---------------------------------------------------------------------------
 * The only store link this app has is the App Store one. Showing this to an
 * Android user is a button that lands them on a page they cannot install from,
 * which is worse than not offering the app at all. `STORE_URL` is a map rather
 * than a string precisely so the Play Store URL is one line when there is one.
 *
 * ---------------------------------------------------------------------------
 * THREE THINGS IT MUST NOT DO
 * ---------------------------------------------------------------------------
 *   NOT INSIDE THE APP. The shell renders no web header at all, so this never
 *   mounts there — but it is also guarded, because "install the app" inside the
 *   app is the single most embarrassing thing this could do.
 *
 *   NOT ON THE FIRST FRAME. Whether to draw it depends on a user-agent test and
 *   on localStorage, neither of which exists during a server render. Drawing it
 *   optimistically and removing it is a band that appears and vanishes on every
 *   load for everybody who ever dismissed it; `ready` is what makes the first
 *   painted frame the true one.
 *
 *   NOT TWICE. Dismissal is written to localStorage under a versioned key, so
 *   it survives a reload and a new tab, and a future campaign can re-offer it
 *   by bumping the version rather than by re-showing it to people who said no.
 */

const STORE_URL: Record<"ios", string> = {
  ios: "https://apps.apple.com/us/app/storelib/id6760252232",
}

/** Bump to re-offer the app to everybody who dismissed the previous one. */
const DISMISS_KEY = "storelib_install_banner_v1"

const APP_ICON =
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20(512%20x%20512%20px).svg"

/**
 * iOS on the WEB. `MSStream` excludes the old IE-on-Windows-Phone spoof, and
 * the Macintosh + touch test is iPadOS 13 and later, which reports itself as a
 * Mac and is the one device most likely to be missed here.
 */
function isIosBrowser(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent || ""
  if (/StorelibApp|Capacitor/.test(ua)) return false
  if ((window as any).Capacitor?.isNativePlatform?.()) return false
  if (/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream) return true
  return /Macintosh/.test(ua) && typeof document !== "undefined" && navigator.maxTouchPoints > 1
}

export function InstallAppBanner() {
  const [show, setShow] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setReady(true)
    if (!isIosBrowser()) return
    // A standalone install IS the app for this purpose — offering the App Store
    // to somebody who has already added this to their home screen is the same
    // mistake as offering it inside the shell.
    if (window.matchMedia?.("(display-mode: standalone)")?.matches) return
    if ((navigator as any).standalone === true) return
    try {
      if (window.localStorage.getItem(DISMISS_KEY)) return
    } catch {
      /* Safari private mode throws on localStorage — show it rather than
         break the header over a preference we cannot read. */
    }
    setShow(true)
  }, [])

  if (!ready || !show) return null

  return (
    <div className="flex items-center gap-3 border-b border-neutral-200 bg-white px-3 py-2">
      <button
        type="button"
        aria-label="Închide"
        onClick={() => {
          setShow(false)
          try {
            window.localStorage.setItem(DISMISS_KEY, "1")
          } catch {
            /* Nothing to do — it closes for this page either way. */
          }
        }}
        className="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-400 active:bg-neutral-100"
      >
        <X className="h-[18px] w-[18px]" strokeWidth={2.2} />
      </button>

      <Image
        src={APP_ICON}
        alt=""
        width={40}
        height={40}
        className="h-10 w-10 shrink-0 rounded-[9px]"
        draggable={false}
      />

      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[14px] font-semibold text-neutral-900">Storelib</p>
        <p className="truncate text-[12px] text-neutral-500">Cumpără și vinde din aplicație</p>
      </div>

      {/* `rel` because this leaves the site: `noopener` is the one that matters
          — a target it does not have today is one refactor away, and a page
          opened without it can navigate this one. */}
      <a
        href={STORE_URL.ios}
        rel="noopener noreferrer"
        className="shrink-0 rounded-full bg-neutral-900 px-4 py-2 text-[13.5px] font-semibold text-white transition-opacity active:opacity-80"
      >
        Instalează
      </a>
    </div>
  )
}
