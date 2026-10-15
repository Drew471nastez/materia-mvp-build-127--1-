"use client"

import type React from "react"
import { usePageMoney } from "@/components/platform/price-currency"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { Package } from "lucide-react"

export interface StickyProductBarSettings {
  visible: boolean
  showThumbnail?: boolean
  addToCartText?: string
  buyNowText?: string
  backgroundColor?: string
  buttonColor?: string
  borderRadius?: string
  spacing?: string
  hideOnScroll?: boolean
  revealOnScroll?: boolean
}

interface StickyProductBarProps {
  settings: StickyProductBarSettings
  product: {
    id: string
    title: string
    thumbnail_url?: string | null
    price_cents: number
  }
  onAddToCart?: () => void
  onBuyNow?: () => void
  children?: React.ReactNode
}

export function StickyProductBar({ settings, product, onAddToCart, onBuyNow, children }: StickyProductBarProps) {
  /* In the page's store currency (components/platform/price-currency). */
  const pageMoney = usePageMoney()
  const [isVisible, setIsVisible] = useState(true)
  const [lastScrollY, setLastScrollY] = useState(0)

  useEffect(() => {
    if (!settings.hideOnScroll && !settings.revealOnScroll) return

    const handleScroll = () => {
      const currentScrollY = window.scrollY

      if (settings.hideOnScroll) {
        // Hide when scrolling down, show when scrolling up
        setIsVisible(currentScrollY < lastScrollY || currentScrollY < 100)
      } else if (settings.revealOnScroll) {
        // Show only when scrolling up
        setIsVisible(currentScrollY < lastScrollY && currentScrollY > 300)
      }

      setLastScrollY(currentScrollY)
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [lastScrollY, settings.hideOnScroll, settings.revealOnScroll])

  if (!settings.visible) return null

  const formatPrice = (cents: number) => {
    return pageMoney(cents, { grouping: true })
  }

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-sm transition-transform duration-300 lg:hidden",
        isVisible ? "translate-y-0" : "translate-y-full",
      )}
      style={{
        backgroundColor: settings.backgroundColor || "hsl(var(--background) / 0.95)",
        padding: settings.spacing || "0.75rem",
        paddingBottom: `calc(${settings.spacing || "0.75rem"} + env(safe-area-inset-bottom))`,
        paddingLeft: `max(${settings.spacing || "0.75rem"}, env(safe-area-inset-left))`,
        paddingRight: `max(${settings.spacing || "0.75rem"}, env(safe-area-inset-right))`,
      }}
    >
      <div className="mx-auto max-w-6xl flex items-center gap-3">
        {settings.showThumbnail && (
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
            {product.thumbnail_url ? (
              <Image
                src={product.thumbnail_url || "/placeholder.svg"}
                alt={product.title}
                fill
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Package className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{product.title}</p>
          <p className="text-sm font-semibold">
            {product.price_cents === 0 ? "Free" : formatPrice(product.price_cents)}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {children || (
            <>
              {onAddToCart && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onAddToCart}
                  style={{
                    borderRadius: settings.borderRadius || undefined,
                  }}
                >
                  {settings.addToCartText || "Add to cart"}
                </Button>
              )}
              {onBuyNow && (
                <Button
                  size="sm"
                  onClick={onBuyNow}
                  style={{
                    borderRadius: settings.borderRadius || undefined,
                    backgroundColor: settings.buttonColor || undefined,
                  }}
                >
                  {settings.buyNowText || "Buy now"}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
