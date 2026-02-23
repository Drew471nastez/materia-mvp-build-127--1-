"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Analytics } from "@vercel/analytics/next"

const CONSENT_KEY = "storelib_cookie_consent"

type ConsentState = "accepted" | "declined" | "pending" | null

/**
 * CookieConsentBanner
 *
 * - Renders nothing on the server (consent = null) to avoid hydration mismatch.
 * - After client hydration, reads localStorage:
 *     "accepted"  → renders <Analytics />, no banner
 *     "declined"  → no analytics, no banner
 *     unset       → shows banner ("pending"), no analytics yet
 * - Accept saves "accepted" to localStorage and loads Analytics.
 * - Decline saves "declined" to localStorage and hides banner.
 * - Essential/functional cookies (auth sessions, cart) are always set regardless
 *   of consent because they are strictly necessary for the service to work.
 */
export function CookieConsentBanner() {
  const [consent, setConsent] = useState<ConsentState>(null)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONSENT_KEY) as "accepted" | "declined" | null
      setConsent(stored ?? "pending")
    } catch {
      setConsent("pending")
    }
  }, [])

  const dismiss = (value: "accepted" | "declined") => {
    setLeaving(true)
    setTimeout(() => {
      try {
        localStorage.setItem(CONSENT_KEY, value)
      } catch { /* ignore */ }
      setConsent(value)
      setLeaving(false)
    }, 300)
  }

  return (
    <>
      {/* Load Vercel Analytics only after explicit acceptance */}
      {consent === "accepted" && <Analytics />}

      {/* Consent banner — only shown while pending */}
      {consent === "pending" && (
        <div
          aria-live="polite"
          aria-label="Cookie consent"
          className="fixed bottom-0 left-0 right-0 z-[9999] px-4 pb-4 sm:px-6"
          style={{
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
            opacity: leaving ? 0 : 1,
            transform: leaving ? "translateY(8px)" : "translateY(0)",
            transition: "opacity 280ms ease, transform 280ms ease",
          }}
        >
          <div className="mx-auto max-w-2xl bg-white rounded-2xl border border-neutral-200 shadow-2xl shadow-black/[0.08] p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <p className="flex-1 text-sm text-neutral-600 leading-relaxed">
                We use cookies to improve your experience.{" "}
                <Link
                  href="/privacy"
                  className="font-medium text-neutral-900 underline underline-offset-2 hover:text-neutral-700 transition-colors"
                >
                  Privacy Policy
                </Link>
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => dismiss("declined")}
                  className="h-9 px-4 rounded-lg text-sm font-medium text-neutral-600 border border-neutral-200 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                >
                  Decline
                </button>
                <button
                  onClick={() => dismiss("accepted")}
                  className="h-9 px-4 rounded-lg text-sm font-medium bg-neutral-900 text-white hover:bg-neutral-800 active:bg-neutral-950 transition-colors"
                >
                  Accept all
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
