"use client"

/**
 * Cookie Consent System — Storelib
 *
 * Matches the approach used by Gumroad, Payhip, and Shopify:
 *  - Slide-up bottom banner on first visit
 *  - Expandable "Manage" panel with per-category toggles
 *  - "Accept all" | "Decline" | "Manage" top-level actions
 *  - "Save preferences" inside the panel
 *  - Consent stored in localStorage (object, not plain string)
 *  - Also sets a non-httpOnly document cookie for cross-tab/SSR awareness
 *  - Re-openable from footer "Cookie Preferences" link via custom DOM event
 *  - Fully accessible (role=dialog, aria-checked on toggles)
 *  - Renders nothing during SSR to avoid hydration mismatch
 *
 * Cookie categories:
 *  1. Essential   — always on, locked. Session, auth, checkout, CSRF.
 *  2. Analytics   — Vercel Analytics. Anonymised, no personal data.
 */

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Analytics } from "@vercel/analytics/next"

// ─── Constants ──────────────────────────────────────────────────────────────

const LS_KEY = "storelib_cookie_consent"
const COOKIE_NAME = "storelib_analytics_consent"
/** Custom DOM event dispatched by the footer "Cookie Preferences" link */
export const COOKIE_PREFS_EVENT = "storelib:open-cookie-preferences"

// ─── Types ───────────────────────────────────────────────────────────────────

interface ConsentPrefs {
  essential: true   // always true
  analytics: boolean
  version: number
  timestamp: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Read consent from localStorage first, fall back to cookie (incognito / Safari) */
function readConsent(): ConsentPrefs | null {
  // 1. Try localStorage (primary store)
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (typeof parsed?.analytics === "boolean") return parsed as ConsentPrefs
    }
  } catch { /* localStorage blocked — e.g. Safari incognito */ }

  // 2. Fallback: read the document cookie so consent persists when LS is wiped
  try {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([01])`))
    if (match) {
      const analytics = match[1] === "1"
      return { essential: true, analytics, version: 1, timestamp: 0 }
    }
  } catch { /* cookie access blocked */ }

  return null
}

function writeConsent(analytics: boolean): ConsentPrefs {
  const prefs: ConsentPrefs = {
    essential: true,
    analytics,
    version: 1,
    timestamp: Date.now(),
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(prefs))
    // Also set a document cookie (non-httpOnly) so server/edge can read consent
    // if ever needed, and so consent persists if localStorage is cleared.
    const maxAge = 60 * 60 * 24 * 365 // 1 year
    const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : ""
    document.cookie = `${COOKIE_NAME}=${analytics ? "1" : "0"}; max-age=${maxAge}; path=/; SameSite=Lax${secure}`
  } catch { /* ignore */ }
  return prefs
}

// ─── Toggle component ────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange?: () => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      role="switch"
      type="button"
      aria-checked={checked}
      aria-label={label}
      onClick={disabled ? undefined : onChange}
      disabled={disabled}
      className={[
        "relative shrink-0 mt-0.5 h-[22px] w-[40px] rounded-full transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2",
        checked ? "bg-neutral-900" : "bg-neutral-300",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-transform duration-200",
          checked ? "translate-x-[19px]" : "translate-x-[3px]",
        ].join(" ")}
      />
    </button>
  )
}

// ─── Banner ──────────────────────────────────────────────────────────────────

export function CookieConsentBanner() {
  // null = not hydrated yet (renders nothing — no SSR flash)
  const [initialized, setInitialized] = useState(false)
  const [consent, setConsent] = useState<ConsentPrefs | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [showPrefs, setShowPrefs] = useState(false)
  const [analyticsToggle, setAnalyticsToggle] = useState(true)
  const [leaving, setLeaving] = useState(false)

  // Hydrate from localStorage on client mount
  useEffect(() => {
    const stored = readConsent()
    setConsent(stored)
    setIsOpen(stored === null) // show banner only if no consent set yet
    if (stored) setAnalyticsToggle(stored.analytics)
    setInitialized(true)
  }, [])

  // Re-open from footer "Cookie Preferences" link
  useEffect(() => {
    const handler = () => {
      const stored = readConsent()
      if (stored) setAnalyticsToggle(stored.analytics)
      else setAnalyticsToggle(true)
      setShowPrefs(true)
      setLeaving(false)
      setIsOpen(true)
    }
    window.addEventListener(COOKIE_PREFS_EVENT, handler)
    return () => window.removeEventListener(COOKIE_PREFS_EVENT, handler)
  }, [])

  // Cross-tab sync: if user accepts in another tab, dismiss banner here too
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== LS_KEY || !e.newValue) return
      try {
        const updated = JSON.parse(e.newValue) as ConsentPrefs
        if (typeof updated?.analytics === "boolean") {
          setConsent(updated)
          setAnalyticsToggle(updated.analytics)
          setIsOpen(false)
          setShowPrefs(false)
        }
      } catch { /* ignore malformed */ }
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const applyConsent = useCallback((analytics: boolean) => {
    const prefs = writeConsent(analytics)
    setConsent(prefs)
    setAnalyticsToggle(analytics)
    setLeaving(true)
    setTimeout(() => {
      setIsOpen(false)
      setShowPrefs(false)
      setLeaving(false)
    }, 280)
  }, [])

  if (!initialized) return null

  return (
    <>
      {/* Load Vercel Analytics only when analytics consent is given */}
      {consent?.analytics === true && <Analytics />}

      {isOpen && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Cookie consent"
          className="fixed bottom-0 left-0 right-0 z-[9999] px-4 sm:px-5"
          style={{
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
            opacity: leaving ? 0 : 1,
            transform: leaving ? "translateY(14px)" : "translateY(0)",
            transition: "opacity 280ms ease, transform 280ms ease",
            pointerEvents: leaving ? "none" : "auto",
          }}
        >
          <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl shadow-black/[0.08]">

            {/* ── Top bar ────────────────────────────────────────────────── */}
            <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
              <p className="flex-1 text-[13.5px] leading-relaxed text-neutral-600">
                We use cookies to improve your experience.{" "}
                <Link
                  href="/legal/privacy"
                  className="font-medium text-neutral-900 underline underline-offset-2 transition-colors hover:text-neutral-700"
                >
                  Learn more
                </Link>
              </p>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPrefs(v => !v)}
                  className="h-9 rounded-lg border border-neutral-200 px-3.5 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-neutral-50 active:bg-neutral-100"
                >
                  {showPrefs ? "Hide" : "Manage"}
                </button>
                <button
                  type="button"
                  onClick={() => applyConsent(false)}
                  className="h-9 rounded-lg border border-neutral-200 px-3.5 text-[13px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50 active:bg-neutral-100"
                >
                  Decline
                </button>
                <button
                  type="button"
                  onClick={() => applyConsent(true)}
                  className="h-9 rounded-lg bg-neutral-900 px-4 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800 active:bg-neutral-950"
                >
                  Accept all
                </button>
              </div>
            </div>

            {/* ── Preferences panel ──────────────────────────────────────── */}
            {showPrefs && (
              <div className="space-y-0 border-t border-neutral-100 px-5 pb-5 pt-4">
                <p className="mb-3 text-[13px] font-semibold tracking-tight text-neutral-800">
                  Cookie preferences
                </p>

                {/* Essential */}
                <div className="flex items-start gap-4 border-b border-neutral-100 py-3.5">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-neutral-900">Essential</span>
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                        Always on
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-neutral-500">
                      Required for login, checkout, and site security. Cannot be disabled.
                    </p>
                  </div>
                  <Toggle checked={true} disabled label="Essential cookies — always on" />
                </div>

                {/* Analytics */}
                <div className="flex items-start gap-4 py-3.5">
                  <div className="flex-1">
                    <span className="text-[13px] font-medium text-neutral-900">Analytics</span>
                    <p className="mt-1 text-[12px] leading-relaxed text-neutral-500">
                      Helps us understand how visitors use Storelib so we can improve it.
                      No personal data is collected or shared with third parties.
                    </p>
                  </div>
                  <Toggle
                    checked={analyticsToggle}
                    onChange={() => setAnalyticsToggle(v => !v)}
                    label="Toggle analytics cookies"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => applyConsent(analyticsToggle)}
                  className="mt-1 h-9 w-full rounded-xl bg-neutral-900 text-[13px] font-semibold text-white transition-colors hover:bg-neutral-800"
                >
                  Save preferences
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
