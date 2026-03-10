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
      // to js.stripe.com. Capacitor intercepts these iframe navigations and opens
      // Safari instead of loading them in the WebView. To work around this, open
      // checkout in an SFSafariViewController (in-app browser) which natively handles
      // all cross-origin content without any navigation interception.
      // The permanent fix is allowNavigation: ['*.stripe.com'] in capacitor.config.ts
      // (already configured) which takes effect after the next native rebuild.
      const { Browser } = await import("@capacitor/browser")
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
