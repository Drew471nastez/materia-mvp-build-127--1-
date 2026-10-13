"use client"

import "@/lib/stripe-nav-guard"
import { useCallback, useState } from "react"
import { loadStripe } from "@stripe/stripe-js/pure"
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js"
import { X, ArrowLeft } from "lucide-react"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { tt } from "@/lib/i18n/text"

// Disable Stripe's fraud-signals controller iframe in Capacitor WKWebView.
// The controller iframe triggers window.location.href navigation which in WebKit
// is [LegacyUnforgeable] and can't be intercepted by JS — preventing the controller
// from being created is the only reliable solution.
const _isNative = typeof window !== "undefined" && (() => {
  const cap = (window as any).Capacitor
  if (cap?.isNativePlatform?.()) return true
  const ua = navigator.userAgent || ""
  return /StorelibApp|Capacitor/.test(ua) || (/wv/.test(ua) && /Android/.test(ua))
})()
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
  // @ts-ignore — advancedFraudSignals is valid but not yet in the TS types
  _isNative ? { advancedFraudSignals: false } : undefined,
)

interface CheckoutModalProps {
  mode: "subscription" | "setup"
  planId?: string
  planName?: string
  visible: boolean
  onClose: () => void
}

export function CheckoutModal({
  mode,
  planId,
  planName,
  visible,
  onClose,
}: CheckoutModalProps) {
  const [error, setError] = useState<string | null>(null)

  const fetchClientSecret = useCallback(async () => {
    setError(null)
    try {
      if (mode === "setup") {
        const response = await fetch("/api/billing/checkout/setup", {
          method: "POST",
        })
        if (!response.ok) {
          const err = await response.json()
          throw new Error(err.error || tt("Failed to create setup session"))
        }
        const data = await response.json()
        return data.clientSecret
      }

      // Subscription mode
      const response = await fetch("/api/billing/subscription/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, embedded: true }),
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || tt("Failed to create checkout session"))
      }
      const data = await response.json()
      return data.clientSecret
    } catch (err: any) {
      setError(err.message || tt("Something went wrong"))
      throw err
    }
  }, [mode, planId])

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[60] bg-white overflow-y-auto animate-slide-in">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-[#e5e7eb]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14 sm:h-16">
          {/* Back button */}
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-[13px] sm:text-[14px] font-medium text-[#7c3aed] hover:text-[#6d28d9] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{tt("Back to plans")}</span>
            <span className="sm:hidden">{tt("Back")}</span>
          </button>

          {/* Storelib Logo */}
          <StorelibLogo
            size={28}
            fluid
            className="absolute left-1/2 h-6 w-6 -translate-x-1/2 sm:h-7 sm:w-7"
          />

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#f3f4f6] transition-colors"
          >
            <X className="h-4.5 w-4.5 text-[#6b7280]" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Title */}
        <div className="mb-8">
          <h1 className="text-[24px] sm:text-[32px] font-bold text-[#1a1a2e]">
            {mode === "setup" ? tt("Add Payment Method") : tt("Complete your upgrade")}
          </h1>
          {planName && mode === "subscription" && (
            <p className="text-[14px] sm:text-[15px] text-[#6b7280] mt-2">
              {tt("Subscribe to the {planName} plan", { planName })}
            </p>
          )}
          {mode === "setup" && (
            <p className="text-[14px] sm:text-[15px] text-[#6b7280] mt-2">
              {tt("Securely add your card details. You won't be charged now.")}
            </p>
          )}
        </div>

        {/* Error display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-900">
            {error}
          </div>
        )}

        {/* Stripe Embedded Checkout */}
        <div className="min-h-[400px]">
          <EmbeddedCheckoutProvider
            stripe={stripePromise}
            options={{ fetchClientSecret }}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      </div>

      <style jsx>{`
        @keyframes slide-in {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-in {
          animation: slide-in 0.25s ease-out;
        }
      `}</style>
    </div>
  )
}
