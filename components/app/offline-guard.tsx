"use client"

import { useState, useEffect, useCallback, type ReactNode } from "react"
import { Wifi, RefreshCw } from "lucide-react"
import { isNativeApp } from "@/lib/native-bridge"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { tt } from "@/lib/i18n/text"

/**
 * OfflineGuard
 *
 * Listens for browser online/offline events and shows a branded "No internet"
 * overlay when the device goes offline. When the connection is restored,
 * the overlay is automatically removed — no user action needed.
 *
 * For native (Capacitor) users a "Retry" button also triggers a hard reload
 * to re-hydrate server data that may have been missed while offline.
 *
 * Important: this is purely additive — it never blocks the initial render.
 * On slow / intermittent connections the page loads normally; this overlay
 * only appears AFTER the JS bundle is running.
 */
export function OfflineGuard({ children }: { children: ReactNode }) {
  const [isOffline, setIsOffline] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)

  const handleOnline = useCallback(() => {
    setIsOffline(false)
    setIsRetrying(false)
  }, [])

  const handleOffline = useCallback(() => {
    setIsOffline(true)
  }, [])

  useEffect(() => {
    // Sync with current state on mount (in case we loaded while offline)
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setIsOffline(true)
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [handleOnline, handleOffline])

  const handleRetry = async () => {
    setIsRetrying(true)
    // Short pause to let the UI update, then check connectivity
    await new Promise(r => setTimeout(r, 600))
    if (navigator.onLine) {
      // Actually online — reload to re-fetch server data
      window.location.reload()
    } else {
      setIsRetrying(false)
    }
  }

  return (
    <>
      {children}
      {isOffline && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white px-6"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          {/* Icon */}
          <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-6">
            <Wifi className="w-9 h-9 text-gray-400" style={{ strokeDasharray: 2, opacity: 0.7 }} />
          </div>

          {/* Logo wordmark / brand */}
          <div className="mb-2">
            <StorelibLogo size={32} unoptimized className="mx-auto mb-3 block" />
          </div>

          <h2 className="text-[20px] font-bold text-gray-900 mb-2 text-center">{tt("No internet connection")}</h2>
          <p className="text-sm text-gray-500 text-center max-w-xs mb-8 leading-relaxed">
            {tt("Check your Wi‑Fi or mobile data and try again. Your data is safe.")}
          </p>

          <button
            type="button"
            onClick={handleRetry}
            disabled={isRetrying}
            className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-full text-sm font-medium active:scale-95 transition-transform disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${isRetrying ? "animate-spin" : ""}`} />
            {isRetrying ? tt("Checking…") : tt("Retry")}
          </button>

          {/* Subtle hint that it will auto-reconnect */}
          <p className="text-xs text-gray-400 mt-5 text-center">
            {tt("Will reconnect automatically when you’re back online.")}
          </p>
        </div>
      )}
    </>
  )
}
