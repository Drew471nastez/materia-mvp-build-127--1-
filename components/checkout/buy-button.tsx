"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { isNativeApp } from "@/lib/platform-utils"

interface BuyButtonProps {
  productId: string
  price: number
  disabled?: boolean
  creatorId?: string
  backgroundColor?: string
  textColor?: string
  variantId?: string
  callToAction?: string | null
  // Pay What You Want support
  customPriceCents?: number | null // Custom price entered by buyer (for PWYW)
}

export function BuyButton({
  productId,
  price,
  disabled,
  creatorId,
  backgroundColor,
  textColor,
  variantId,
  callToAction,
  customPriceCents,
}: BuyButtonProps) {
  const [loading, setLoading] = useState(false)

  const formatPrice = (cents: number) => {
    if (cents === 0) return "Free"
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  const handleClick = async () => {
    setLoading(true)

    if (creatorId) {
      try {
        await fetch("/api/track-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventType: "buy_click",
            creatorId,
            productId,
          }),
        })
      } catch (e) {
        // Don't block checkout on tracking failure
      }
    }

    let checkoutUrl = `/checkout?productId=${productId}`
    if (variantId) {
      checkoutUrl += `&variantId=${variantId}`
    }
    // Add custom price for PWYW
    if (customPriceCents !== null && customPriceCents !== undefined) {
      checkoutUrl += `&customPrice=${customPriceCents}`
    }

    if (isNativeApp()) {
      // On native (Capacitor WKWebView), Stripe Elements creates cross-origin iframes
      // to js.stripe.com which Capacitor intercepts and opens in Safari.
      // Fix: open checkout in SFSafariViewController (in-app browser) which handles
      // all cross-origin content natively. The permanent fix is allowNavigation in
      // capacitor.config.ts (already configured) — takes effect after native rebuild.
      const { Browser } = await import("@capacitor/browser")

      // Listen for the in-app browser closing. When the user closes it (or checkout
      // redirects out), check whether a purchase was completed. If yes, navigate to
      // the library so the new item appears immediately.
      const listener = await Browser.addListener("browserFinished", async () => {
        listener.remove()
        setLoading(false)
        try {
          const res = await fetch(`/api/native/checkout-status?productId=${productId}`)
          const data = await res.json()
          if (data.purchased) {
            // Purchase confirmed — take user to library to see their new item
            window.location.href = "/library/products"
          }
        } catch {
          // Network error or not logged in — stay on current page
        }
      })

      await Browser.open({
        url: `${window.location.origin}${checkoutUrl}`,
        presentationStyle: "fullscreen",
        toolbarColor: "#000000",
      })
      setLoading(false)
    } else {
      window.location.href = checkoutUrl
    }
  }

  // Display price - use custom price if provided, otherwise regular price
  const displayPrice = customPriceCents !== null && customPriceCents !== undefined
    ? customPriceCents
    : price

  return (
    <Button
      type="button"
      size="lg"
      className="w-full font-medium min-h-[48px] cursor-pointer relative z-10"
      style={{
        backgroundColor: backgroundColor || "#2563eb",
        color: textColor || "#ffffff",
      }}
      disabled={disabled || loading}
      onClick={handleClick}
    >
      {loading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading...
        </>
      ) : displayPrice === 0 ? (
        callToAction || "Get for Free"
      ) : (
        callToAction || "I want this!"
      )}
    </Button>
  )
}
