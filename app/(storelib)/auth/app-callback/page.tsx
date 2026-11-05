"use client"

/**
 * app/auth/app-callback/page.tsx
 *
 * Client-side bridge page for the StorelibApp Capacitor OAuth flow.
 *
 * Chrome Custom Tabs silently block both `storelib://` custom scheme URLs AND
 * `intent://` URLs fired via window.location.  This page uses a multi-strategy
 * approach to maximise the chance of reaching the native app:
 *
 *  Strategy 1 — Hidden <iframe> with storelib:// URL (immediate).
 *               iframes can sometimes bypass Chrome's custom-scheme blocking.
 *  Strategy 2 — window.location.href with intent:// URL (200 ms).
 *               The official Android mechanism; works on some Chrome versions.
 *  Strategy 3 — window.location.href with storelib:// URL (800 ms).
 *               Direct custom-scheme attempt as a last resort.
 *  Fallback  — Large "Open Storelib" button shown after 1.5 s.
 *               User taps are ALWAYS honoured by Chrome for intent:// URLs.
 *
 * On iOS, the plain storelib:// scheme is used (strategies 1 + 3).
 *
 * If none of the automatic strategies work, the user taps the button.
 * A real user tap on an <a href="intent://..."> is the ONE thing Chrome
 * Custom Tabs will ALWAYS process — so the button is the ultimate fallback.
 */

import { useEffect, useState, useRef, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { sameOriginPath } from "@/lib/auth/continue"

function AppCallbackContent() {
  const searchParams = useSearchParams()
  const [showFallback, setShowFallback] = useState(false)
  const [status, setStatus] = useState<"redirecting" | "fallback" | "error">("redirecting")
  const [deepLink, setDeepLink] = useState<string | null>(null)
  const [intentDeepLink, setIntentDeepLink] = useState<string | null>(null)
  const [isAndroidDevice, setIsAndroidDevice] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []

    try {
      const token        = searchParams.get("token")
      const refreshToken = searchParams.get("refresh_token")
      /* A path on this site only: it is followed with location.replace below, where "javascript:" would run (lib/auth/continue.ts). */
      const next         = sameOriginPath(searchParams.get("next"), "/app")
      const isNativeParam = searchParams.get("native") === "true"

      console.log("[app-callback] Bridge page mounted")
      console.log("[app-callback]   token:", token ? "present" : "MISSING")
      console.log("[app-callback]   refresh_token:", refreshToken ? "present" : "MISSING")
      console.log("[app-callback]   native:", isNativeParam)
      console.log("[app-callback]   next:", next)
      console.log("[app-callback]   userAgent:", typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : "N/A")

      // ── Safety: missing tokens ─────────────────────────────────────────
      if (!token || !refreshToken) {
        console.error("[app-callback] Missing token or refresh_token in URL")
        setStatus("error")
        setErrorMsg("Session data missing. Please try signing in again.")
        return
      }

      // ── Build the deep links ───────────────────────────────────────────
      const storelibLink =
        `storelib://auth/callback` +
        `?token=${encodeURIComponent(token)}` +
        `&refresh_token=${encodeURIComponent(refreshToken)}` +
        `&next=${encodeURIComponent(next)}`

      // Android Intent URL — the official Android mechanism.
      // S.browser_fallback_url points to the LOGIN page, NOT the dashboard.
      // If Chrome can't resolve the intent it should show login, not the
      // dashboard (which would make the user think they're stuck).
      const loginFallback = `${window.location.origin}/login?error=${encodeURIComponent("Could not open the app automatically. Please try again.")}`
      const intentLink =
        `intent://auth/callback` +
        `?token=${encodeURIComponent(token)}` +
        `&refresh_token=${encodeURIComponent(refreshToken)}` +
        `&next=${encodeURIComponent(next)}` +
        `#Intent;scheme=storelib;package=com.storelib.app` +
        `;S.browser_fallback_url=${encodeURIComponent(loginFallback)};end`

      setDeepLink(storelibLink)
      setIntentDeepLink(intentLink)

      // ── Detect native Capacitor app ────────────────────────────────────
      const isNativeApp =
        isNativeParam ||
        (typeof navigator !== "undefined" &&
          navigator.userAgent.includes("StorelibApp"))

      console.log("[app-callback] isNativeApp:", isNativeApp)

      if (!isNativeApp) {
        console.log("[app-callback] Not native — redirecting to web destination:", next)
        window.location.replace(next)
        return
      }

      // ── Native app: multi-strategy redirect ────────────────────────────
      const isAndroid = /android/i.test(navigator.userAgent)
      setIsAndroidDevice(isAndroid)
      console.log("[app-callback] Platform:", isAndroid ? "Android" : "iOS/other")

      // ── STRATEGY 1: Hidden iframe with storelib:// (immediate) ─────────
      // Chrome Custom Tabs sometimes allow custom-scheme navigation from
      // an iframe even when they block it from window.location.
      console.log("[app-callback] Strategy 1: iframe with storelib://")
      try {
        const iframe = document.createElement("iframe")
        iframe.style.display = "none"
        iframe.src = storelibLink
        document.body.appendChild(iframe)
        iframeRef.current = iframe
        // Clean up iframe after 2 s (it's just a trigger, not visible)
        timers.push(setTimeout(() => {
          try { iframe.remove() } catch {}
        }, 2000))
      } catch (e) {
        console.warn("[app-callback] iframe strategy failed:", e)
      }

      if (isAndroid) {
        // ── STRATEGY 2: intent:// via window.location.href (200 ms) ──────
        // Give strategy 1 a moment to fire, then try the intent:// URL.
        // Use .href instead of .replace() — some Custom Tab implementations
        // handle them differently.
        timers.push(setTimeout(() => {
          console.log("[app-callback] Strategy 2: intent:// via location.href")
          window.location.href = intentLink
        }, 200))

        // ── STRATEGY 3: storelib:// via window.location.href (800 ms) ────
        // Last-ditch JS-based attempt with the plain custom scheme.
        timers.push(setTimeout(() => {
          console.log("[app-callback] Strategy 3: storelib:// via location.href")
          window.location.href = storelibLink
        }, 800))
      } else {
        // iOS: just use storelib:// directly
        timers.push(setTimeout(() => {
          console.log("[app-callback] iOS: storelib:// via location.href")
          window.location.href = storelibLink
        }, 200))
      }

      // ── FALLBACK: Show button after 1.5 s ──────────────────────────────
      // If we're still on this page, the automatic redirect didn't work.
      // Show a big prominent button — a real user tap on <a href="intent://…">
      // is the ONE thing Chrome Custom Tabs will ALWAYS honour.
      timers.push(setTimeout(() => {
        console.log("[app-callback] Showing fallback button")
        setShowFallback(true)
        setStatus("fallback")
      }, 1500))

    } catch (err) {
      console.error("[app-callback] Unexpected error in bridge page:", err)
      setStatus("error")
      setErrorMsg(err instanceof Error ? err.message : "An unexpected error occurred.")
    }

    return () => {
      timers.forEach(clearTimeout)
      if (iframeRef.current) {
        try { iframeRef.current.remove() } catch {}
      }
    }
  }, [searchParams])

  // ── Error state ──────────────────────────────────────────────────────────
  if (status === "error") {
    return (
      <div className="flex min-h-svh w-full items-center justify-center bg-white px-6">
        <div className="text-center max-w-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-neutral-900">Sign-in failed</h1>
          <p className="mt-2 text-sm text-neutral-500">{errorMsg}</p>
          <a
            href="/login"
            className="mt-6 inline-block rounded-full bg-neutral-900 px-6 py-3 text-sm font-semibold text-white hover:bg-neutral-800"
          >
            Back to login
          </a>
        </div>
      </div>
    )
  }

  // ── Redirect link for button (intent:// on Android, storelib:// on iOS) ──
  const buttonHref = isAndroidDevice && intentDeepLink ? intentDeepLink : deepLink

  // ── Redirecting / fallback state ─────────────────────────────────────────
  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-white px-6">
      <div className="text-center max-w-sm">
        {/* Spinner */}
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100">
          {showFallback ? (
            <svg className="h-7 w-7 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          ) : (
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-800" />
          )}
        </div>

        <h1 className="text-lg font-semibold text-neutral-900">
          {showFallback ? "Tap to open Storelib" : "Opening Storelib…"}
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          {showFallback
            ? "You're signed in! Tap the button below to return to the app."
            : "You're being redirected back to the Storelib app."}
        </p>

        {/* Primary button — shown after 1.5 s or immediately if visible */}
        {showFallback && buttonHref && (
          <a
            href={buttonHref}
            className="mt-6 inline-block w-full rounded-full bg-neutral-900 px-8 py-4 text-base font-semibold text-white hover:bg-neutral-800 active:scale-95 transition-transform"
          >
            Open Storelib
          </a>
        )}

        {/* Secondary: back to login */}
        {showFallback && (
          <p className="mt-4 text-xs text-neutral-400">
            Having trouble?{" "}
            <a href="/login" className="underline hover:text-neutral-600">
              Sign in again
            </a>
          </p>
        )}
      </div>
    </div>
  )
}

function AppCallbackFallback() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-white">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-800" />
    </div>
  )
}

export default function AppCallbackPage() {
  return (
    <Suspense fallback={<AppCallbackFallback />}>
      <AppCallbackContent />
    </Suspense>
  )
}
