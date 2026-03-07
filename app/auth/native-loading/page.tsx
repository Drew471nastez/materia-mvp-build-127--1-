"use client"

/**
 * app/auth/native-loading/page.tsx
 *
 * Dedicated full-screen loading page for native (Capacitor / Android) OAuth.
 *
 * WHY THIS PAGE EXISTS — eliminating the login/signup flash:
 *
 *   After the user taps "Continue with Google", we open the Chrome Custom Tab
 *   via Browser.open() and IMMEDIATELY navigate the WebView here with
 *   window.location.replace('/auth/native-loading').  The login/signup page
 *   is replaced in history — it is never the active WebView page during the
 *   post-auth return.
 *
 *   Without this page the following race caused a brief login form flash:
 *     1. Chrome Custom Tab closes → browserFinished fires
 *     2. 500 ms grace period elapses (waiting for appUrlOpen)
 *     3. If appUrlOpen > 500 ms: setIsGoogleLoading(false) → form renders
 *     4. appUrlOpen fires → handleOAuthCallback → navigates away
 *   Step 3 is the flash.  With this page there is no login/signup form to
 *   flash back to — the WebView only ever shows this loading screen.
 *
 * FLOW:
 *   login/signup (Browser.open) → WebView to /auth/native-loading
 *   Chrome Custom Tab: OAuth → /auth/callback → /auth/app-callback → storelib://
 *   appUrlOpen fires → handleOAuthCallback (NativeOAuthBridge global listener)
 *   → window.location.assign('/auth/sync-session')
 *   → /app  ✅ (user never sees login/signup during this return)
 *
 * CANCEL:
 *   browserFinished fires + 1.5 s grace → no nativeAuthInProgress →
 *   navigate back to ?from page (default /login)
 *
 * nativeAuthInProgress:
 *   Set synchronously in useState initializer so NativeOAuthBridge's per-route
 *   nativeAppReady() call (which fires on every pathname change) finds the flag
 *   set and does NOT dismiss the native overlay prematurely.
 */

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { nativeAuthStart } from "@/lib/native-bridge"

// ── Polished loading animation component ─────────────────────────────────────
function SpinnerDots() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-2 w-2 rounded-full bg-neutral-400"
          style={{
            animation: "bounce 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

function NativeLoadingContent() {
  const searchParams = useSearchParams()
  const fromPath = searchParams.get("from") || "/login"

  // Set nativeAuthInProgress SYNCHRONOUSLY in useState initializer.
  // This runs during the render phase, BEFORE NativeOAuthBridge's
  // useEffect([pathname]) fires, so nativeAppReady() finds the flag set
  // and does not dismiss the native overlay.
  useState(() => {
    try { sessionStorage.setItem("nativeAuthInProgress", "1") } catch {}
  })

  const [timedOut, setTimedOut] = useState(false)
  const [cancelledByUser, setCancelledByUser] = useState(false)

  useEffect(() => {
    // Ensure native overlay stays visible during this loading phase.
    nativeAuthStart()

    // ── Cancel detection via browserFinished ───────────────────────────────
    // When the user dismisses the Chrome Custom Tab without completing OAuth,
    // @capacitor/browser fires "browserFinished". We wait 1500 ms to let
    // appUrlOpen arrive (which sets nativeAuthInProgress). If after 1500 ms
    // there's still no auth in progress, the user cancelled → go back.
    let cancelTimer: ReturnType<typeof setTimeout> | null = null
    let browserFinishedHandle: { remove: () => void } | undefined

    async function registerBrowserFinished() {
      try {
        const { Browser } = await import("@capacitor/browser")
        browserFinishedHandle = await Browser.addListener("browserFinished", () => {
          browserFinishedHandle?.remove()
          cancelTimer = setTimeout(() => {
            try {
              // If handleOAuthCallback set nativeAuthInProgress, auth is in
              // progress — do NOT navigate back (it will navigate us forward).
              if (sessionStorage.getItem("nativeAuthInProgress") === "1") return
            } catch {}
            // No auth in progress → genuine cancel → go back to from-page
            setCancelledByUser(true)
            window.location.replace(fromPath)
          }, 1500)
        })
      } catch {
        // @capacitor/browser not available — ignore (non-Capacitor environment)
      }
    }

    registerBrowserFinished()

    // ── Safety timeout: 5 minutes ──────────────────────────────────────────
    // If nothing happens for 5 minutes, give up and send user back to login.
    const safetyTimer = setTimeout(() => {
      setTimedOut(true)
      try { sessionStorage.removeItem("nativeAuthInProgress") } catch {}
      setTimeout(() => { window.location.replace(fromPath) }, 2000)
    }, 5 * 60 * 1000)

    return () => {
      if (cancelTimer) clearTimeout(cancelTimer)
      if (safetyTimer) clearTimeout(safetyTimer)
      browserFinishedHandle?.remove()
      // Clear the flag when this page unmounts (navigation happened or cleanup).
      try { sessionStorage.removeItem("nativeAuthInProgress") } catch {}
    }
  }, [fromPath])

  // ── Timed-out state ───────────────────────────────────────────────────────
  if (timedOut) {
    return (
      <div className="flex min-h-svh w-full flex-col items-center justify-center bg-white px-6">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-neutral-900">Sign-in timed out</h1>
        <p className="mt-2 text-center text-sm text-neutral-500">
          The authentication took too long. Redirecting you back…
        </p>
      </div>
    )
  }

  // ── Primary loading state ─────────────────────────────────────────────────
  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center bg-white px-6">
      {/* Logo mark */}
      <div className="mb-10 flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-900 shadow-lg">
        <svg className="h-8 w-8 text-white" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </div>

      {/* Spinner ring */}
      <div className="mb-8 relative flex h-14 w-14 items-center justify-center">
        <div className="absolute inset-0 rounded-full border-4 border-neutral-100" />
        <div
          className="absolute inset-0 rounded-full border-4 border-transparent border-t-neutral-800"
          style={{ animation: "spin 0.9s linear infinite" }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>

      <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">
        Signing you in…
      </h1>
      <p className="mt-2 text-sm text-neutral-400">
        Just a moment while we set up your account
      </p>

      <div className="mt-6">
        <SpinnerDots />
      </div>

      {cancelledByUser && (
        <p className="mt-8 text-sm text-neutral-400">Returning to sign-in…</p>
      )}
    </div>
  )
}

function NativeLoadingFallback() {
  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center bg-white">
      <div
        className="h-10 w-10 rounded-full border-4 border-neutral-100 border-t-neutral-800"
        style={{ animation: "spin 0.9s linear infinite" }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default function NativeLoadingPage() {
  return (
    <Suspense fallback={<NativeLoadingFallback />}>
      <NativeLoadingContent />
    </Suspense>
  )
}
