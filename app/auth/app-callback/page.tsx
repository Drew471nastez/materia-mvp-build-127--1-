"use client"

/**
 * app/auth/app-callback/page.tsx
 *
 * Client-side bridge page for the StorelibApp Capacitor OAuth flow.
 *
 * The server-side /auth/callback route detects the "StorelibApp" User-Agent,
 * exchanges the OAuth code, and redirects here with the session tokens in
 * query params instead of redirecting straight to storelib:// — because
 * Chrome Custom Tab does not reliably follow server-side HTTP 302 redirects
 * to custom schemes.
 *
 * This page renders immediately and:
 *  1. Reads token / refresh_token / next / native from the URL search params.
 *  2. Detects a native Capacitor request via ?native=true query param
 *     (preferred) or StorelibApp User-Agent (fallback).  Chrome Custom Tabs
 *     do NOT forward the custom WebView UA, so the query param is critical.
 *  3. Calls window.location.replace("storelib://auth/callback?token=…")
 *     which Chrome Custom Tab DOES follow because it originates from JS.
 *  4. Shows a "Continue to App" button after 2.5 s as a fallback in case
 *     the automatic redirect fails (e.g. app not installed, OS quirk).
 *  5. If neither ?native=true nor StorelibApp UA is present (web browser
 *     hit the page directly), falls through to the normal web destination.
 */

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"

function AppCallbackContent() {
  const searchParams = useSearchParams()
  const [showFallback, setShowFallback] = useState(false)
  const [status, setStatus] = useState<"redirecting" | "fallback" | "error">("redirecting")
  const [deepLink, setDeepLink] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    const token        = searchParams.get("token")
    const refreshToken = searchParams.get("refresh_token")
    const next         = searchParams.get("next") || "/app"

    // ── Safety: missing tokens ───────────────────────────────────────────
    if (!token || !refreshToken) {
      console.error("[app-callback] Missing token or refresh_token in URL")
      setStatus("error")
      setErrorMsg("Session data missing. Please try signing in again.")
      return
    }

    // ── Build the deep link ──────────────────────────────────────────────
    const link =
      `storelib://auth/callback` +
      `?token=${encodeURIComponent(token)}` +
      `&refresh_token=${encodeURIComponent(refreshToken)}` +
      `&next=${encodeURIComponent(next)}`
    setDeepLink(link)

    // ── Detect native Capacitor app ──────────────────────────────────────
    // Dual detection: prefer the explicit ?native=true query param because
    // Chrome Custom Tabs do NOT use the custom WebView User-Agent
    // ("StorelibApp") — they use the standard Chrome UA.  The server route
    // forwards native=true when it detects a native request, so this param
    // is always available in the bridge URL.  The UA check is kept as a
    // belt-and-suspenders fallback.
    const isNativeApp =
      searchParams.get("native") === "true" ||
      (typeof navigator !== "undefined" &&
        navigator.userAgent.includes("StorelibApp"))

    if (!isNativeApp) {
      // Opened in a regular browser — the session is already set server-side
      // in the cookie jar (the server route called exchangeCodeForSession).
      // Just navigate to the destination page.
      console.log("[app-callback] Not native app (no ?native=true, no StorelibApp UA) — redirecting to web destination:", next)
      window.location.replace(next)
      return
    }

    // ── Native app: fire the custom-scheme deep link ─────────────────────
    console.log("[app-callback] Native app detected (native=true or StorelibApp UA) — firing deep link")
    console.log("[app-callback] deep link:", link.slice(0, 80) + "…")

    // Use replace so pressing Back doesn't loop back here.
    window.location.replace(link)

    // Show the fallback button after 2.5 s — if the app opened successfully
    // this page will have been hidden; if the user is still here, they need
    // the manual button.
    const fallbackTimer = window.setTimeout(() => {
      setShowFallback(true)
      setStatus("fallback")
    }, 2500)

    return () => window.clearTimeout(fallbackTimer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
          {showFallback ? "Tap below to open the app" : "Opening Storelib…"}
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          {showFallback
            ? "If the app didn't open automatically, use the button below."
            : "You're being redirected back to the Storelib app."}
        </p>

        {/* Fallback button — only shown after 2.5 s */}
        {showFallback && deepLink && (
          <a
            href={deepLink}
            className="mt-6 inline-block rounded-full bg-neutral-900 px-8 py-3 text-sm font-semibold text-white hover:bg-neutral-800 active:scale-95 transition-transform"
          >
            Continue to App
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
