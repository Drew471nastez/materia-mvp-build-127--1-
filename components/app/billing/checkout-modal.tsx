"use client"

import { useCallback } from "react"
import { loadStripe } from "@stripe/stripe-js"
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js"
import { X, ArrowLeft } from "lucide-react"

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""
)

const STORELIB_LOGO_URL =
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/5135%20(1).svg"

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
  const fetchClientSecret = useCallback(async () => {
    if (mode === "setup") {
      const response = await fetch("/api/billing/checkout/setup", {
        method: "POST",
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || "Failed to create setup session")
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
      throw new Error(err.error || "Failed to create checkout session")
    }
    const data = await response.json()
    return data.clientSecret
  }, [mode, planId])

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-[680px] max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-slide-up mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb] bg-white shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 text-[13px] font-medium text-[#7c3aed] hover:text-[#6d28d9] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to plans
            </button>
          </div>
          {/* Storelib Logo */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
            <img
              src={STORELIB_LOGO_URL}
              alt="Storelib"
              className="h-7"
            />
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#f3f4f6] transition-colors"
          >
            <X className="h-4 w-4 text-[#6b7280]" />
          </button>
        </div>

        {/* Title */}
        <div className="px-6 pt-5 pb-3 shrink-0">
          <h2 className="text-[22px] font-bold text-[#1a1a2e]">
            {mode === "setup" ? "Add Payment Method" : "Complete your upgrade"}
          </h2>
          {planName && mode === "subscription" && (
            <p className="text-[14px] text-[#6b7280] mt-1">
              Subscribe to {planName} plan
            </p>
          )}
        </div>

        {/* Stripe Embedded Checkout */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <EmbeddedCheckoutProvider
            stripe={stripePromise}
            options={{ fetchClientSecret }}
          >
            <EmbeddedCheckout className="stripe-checkout-embed" />
          </EmbeddedCheckoutProvider>
        </div>
      </div>

      {/* Animations */}
      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(24px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}
