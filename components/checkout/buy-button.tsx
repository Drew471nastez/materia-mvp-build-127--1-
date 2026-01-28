"use client"

import { useState } from "react"
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
}

export function BuyButton({ productId, price, disabled, creatorId, backgroundColor, textColor, variantId }: BuyButtonProps) {
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

    // Use window.location.href for reliable navigation (works across subdomains)
    const checkoutUrl = variantId
      ? `/checkout?productId=${productId}&variantId=${variantId}`
      : `/checkout?productId=${productId}`
    window.location.href = checkoutUrl
  }

  return (
    <Button
      type="button"
      size="lg"
      className="w-full font-medium"
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
      ) : price === 0 ? (
        "Get for Free"
      ) : (
        "Add to cart"
      )}
    </Button>
  )
}
