"use client"

import { useEffect } from "react"
import { ActivitySpinner, SPINNER_WAIT_MS } from "@/components/ui/activity-spinner"
import { FROM_SIGN_IN_KEY } from "@/lib/appearance/site-appearance"

/** The sign in screens themselves: where this screen is the hand off into Storelib. */
const SIGN_IN_PAGE = /^\/(login|signup|auth)(\/|$)/

/**
 * ===========================================================================
 *  THE WHITE SCREEN BETWEEN SIGNING IN AND STORELIB
 * ===========================================================================
 * Shown while a session check or a sign in is finishing, on login, signup,
 * protected layouts and the native auth gate.
 *
 * The owner: from log in or sign up into Storelib was "a direct flash or
 * glitch". This screen was a black ring popping in at the very middle of the
 * white, then the dashboard's dark header and its own grey spinner 40% of the
 * way down, a cut at each step. Now:
 *
 *   QUIET WHEN IT IS QUICK. The white is at once; the spinner (the same iOS
 *   one /app shows, in the same place, PageSpinner's 40%) fades in only
 *   after SPINNER_WAIT_MS, so a hand off that is quick is white and then
 *   the page, with nothing popping in between.
 *   ONE SCREEN INTO /app. On a sign in page it marks the tab
 *   (FROM_SIGN_IN_KEY), and the dashboard document that opens next starts
 *   under a veil of this same white that fades off once its shell is up
 *   (lib/appearance/site-appearance.ts, app/globals.css app-from-sign-in).
 */
export function AuthResolvingScreen({ message }: { message?: string }) {
  useEffect(() => {
    try {
      if (SIGN_IN_PAGE.test(window.location.pathname)) window.sessionStorage.setItem(FROM_SIGN_IN_KEY, String(Date.now()))
    } catch {
      /* No session storage: the dashboard opens on its own canvas, as it did. */
    }
  }, [])

  return (
    <div data-auth-resolving="" className="grid min-h-svh w-full grid-rows-[2fr_auto_3fr] justify-items-center bg-white">
      {/* The wait and the fade are CSS, so a server render needs no effect to start them. Reduced motion keeps the wait, not the fade. */}
      <div
        className="row-start-2 flex flex-col items-center [animation-duration:200ms] [animation-fill-mode:both] [animation-name:fadeIn] [animation-timing-function:ease-out] motion-reduce:[animation-duration:1ms]"
        style={{ animationDelay: `${SPINNER_WAIT_MS}ms` }}
      >
        <ActivitySpinner />
        {message && <p className="mt-4 text-[14px] text-[#6b7280]">{message}</p>}
      </div>
    </div>
  )
}
