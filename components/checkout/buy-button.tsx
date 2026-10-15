"use client"

import { useSitePaint } from "@/lib/appearance/site-paint-context"
import { useEffect } from "react"
import { usePageMoney } from "@/components/platform/price-currency"

import { useEditorFrame } from "@/components/storefront/use-editor-frame"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { trackFunnelStep } from "@/lib/analytics-utils"
import { usePressPending } from "@/lib/navigation/press-pending"
import { carryTouches } from "@/lib/attribution/browser"

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
  /* In the page's store currency (components/platform/price-currency). */
  const pageMoney = usePageMoney()
  const router = useRouter()
  /* Round 31: on Storelib's own product page these follow the person's look (lib/appearance/site-paint). */
  const paint = useSitePaint()
  /* Pressed until the page is shown again: a product page restored from history never keeps a spent Buy button (lib/navigation/press-pending). */
  const [loading, startLoading] = usePressPending()
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
    return pageMoney(cents, { grouping: true })
  }

  const checkoutUrl = (() => {
    let url = `/checkout?productId=${productId}`
    if (variantId) url += `&variantId=${variantId}`
    // Add custom price for PWYW
    if (customPriceCents !== null && customPriceCents !== undefined) url += `&customPrice=${customPriceCents}`
    return url
  })()

  /* The checkout warmed while the buyer reads, so the press lands quickly. */
  useEffect(() => {
    if (!inEditorFrame) router.prefetch(checkoutUrl)
  }, [checkoutUrl, inEditorFrame, router])

  const handleClick = () => {
    if (inEditorFrame || loading) return
    startLoading()

    /* Counted on the way, never waited for: the press used to sit on this request before going anywhere. */
    if (creatorId) void trackFunnelStep("buy_click", creatorId, productId).catch(() => {})

    /*
      A CLIENT NAVIGATION. `window.location.href` threw the document away to
      reach a route in this same app, and the in-app history count went with
      it — it is a module variable, so a hard load resets it to zero and the
      product page's back arrow then cannot prove it has anywhere to return
      to. See lib/navigation/in-app-history and the note in
      components/store-builder/sticky-add-to-cart.
    */
    router.push(carryTouches(checkoutUrl))
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
        backgroundColor: paint(backgroundColor || "#2563eb", "bg"),
        color: textColor || "#ffffff",
      }}
      disabled={disabled || inEditorFrame}
      aria-busy={loading || undefined}
      onClick={handleClick}
      title={inEditorFrame ? "This is your page as visitors see it. Open it at its own address to buy." : undefined}
    >
      {loading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Opening checkout
        </>
      ) : displayPrice === 0 ? (
        callToAction || "Get for Free"
      ) : (
        callToAction || "I want this!"
      )}
    </Button>
  )
}
