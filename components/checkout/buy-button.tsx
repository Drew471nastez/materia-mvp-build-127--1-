"use client"

import { useState, useEffect } from "react"

import { useEditorFrame } from "@/components/storefront/use-editor-frame"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

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
  /**
   * INSIDE THE EDITOR'S CANVAS THIS DOES NOT BUY ANYTHING.
   *
   * The workspace frames the real product page, so this really is the real
   * buy button — and pressing it started a real checkout for the creator's
   * own product, in a frame that cannot show the checkout page. See
   * use-editor-frame for why browsing stays and buying goes.
   */
  const inEditorFrame = useEditorFrame()
  const formatPrice = (cents: number) => {
    if (cents === 0) return "Free"
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  const handleClick = async () => {
    if (inEditorFrame) return
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

    window.location.href = checkoutUrl
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
      disabled={disabled || loading || inEditorFrame}
      onClick={handleClick}
      title={inEditorFrame ? "This is your page as visitors see it. Open it at its own address to buy." : undefined}
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
