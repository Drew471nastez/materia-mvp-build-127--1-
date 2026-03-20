"use client"

import { useState, useEffect } from "react"
import { isIOS } from "@/lib/native-bridge"
import { Info, X } from "lucide-react"

/**
 * IOSReviewNotice
 *
 * Shown only on iOS Capacitor builds. Displays a one-time dismissible banner
 * explaining that "View Live" opens product pages in Safari (external browser)
 * — not inside the app — so no payment flow ever runs within the app.
 *
 * This banner is intentionally informative for Apple App Store reviewers:
 * it confirms that purchases occur entirely outside the app in Safari,
 * in compliance with App Store Guideline 3.1.1.
 */
export function IOSReviewNotice() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!isIOS()) return
    try {
      if (sessionStorage.getItem("ios-review-notice-dismissed") === "1") return
    } catch { /* ignore */ }
    setVisible(true)
  }, [])

  if (!visible) return null

  const dismiss = () => {
    setVisible(false)
    try { sessionStorage.setItem("ios-review-notice-dismissed", "1") } catch { /* ignore */ }
  }

  return (
    <div className="flex items-start gap-2.5 px-4 py-2.5 bg-blue-50 border-b border-blue-100 text-blue-800 text-xs">
      <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500" />
      <span className="flex-1 leading-relaxed">
        <strong>Opens in Safari.</strong> Tapping &ldquo;View Live&rdquo; opens your product page in
        the Safari browser app — outside this app. All checkout and payment flows
        happen externally, not inside the app.
      </span>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 p-0.5 rounded hover:bg-blue-100 transition-colors"
      >
        <X className="h-3.5 w-3.5 text-blue-400" />
      </button>
    </div>
  )
}
