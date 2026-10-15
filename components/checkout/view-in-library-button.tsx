"use client"

import { useSitePaint } from "@/lib/appearance/site-paint-context"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import { getCanonicalSiteUrl } from "@/lib/url-helpers"

interface ViewInLibraryButtonProps {
  backgroundColor?: string
  textColor?: string
  borderColor?: string
  className?: string
}

/**
 * ViewInLibraryButton - Client component for View in Library navigation
 * Uses window.location.href for reliable navigation (no double-click issues)
 */
export function ViewInLibraryButton({
  backgroundColor,
  textColor,
  borderColor,
  className = "w-full min-h-[44px]",
}: ViewInLibraryButtonProps) {
  /* Round 31: on Storelib's own product page these follow the person's look (lib/appearance/site-paint). */
  const paint = useSitePaint()
  const handleClick = () => {
    const canonical = getCanonicalSiteUrl()
    window.location.assign(new URL("/account/library", canonical).toString())
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={`cursor-pointer relative z-10 ${className}`}
      onClick={handleClick}
      style={{
        backgroundColor: paint(backgroundColor, "bg") || "transparent",
        color: paint(textColor, "ink") || "inherit",
        borderColor: paint(borderColor, "line") || "var(--border)",
      }}
    >
      <ArrowRight className="mr-2 h-4 w-4" />
      View in Library
    </Button>
  )
}
