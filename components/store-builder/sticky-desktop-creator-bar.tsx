"use client"

import { useState, useEffect } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

interface StickyDesktopCreatorBarProps {
  creatorName: string
  creatorAvatarUrl: string | null
  creatorInitials: string
  creatorStoreUrl: string
  productTitle: string
  textColor?: string
  backgroundColor?: string
}

export function StickyDesktopCreatorBar({
  creatorName,
  creatorAvatarUrl,
  creatorInitials,
  creatorStoreUrl,
  productTitle,
  textColor,
  backgroundColor,
}: StickyDesktopCreatorBarProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      const creatorHeader = document.querySelector("[data-creator-header]")
      if (!creatorHeader) return

      const rect = creatorHeader.getBoundingClientRect()
      // Show sticky bar when the inline creator header scrolls out of view
      setIsVisible(rect.bottom < 0)
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-40 hidden lg:block transition-all duration-300",
        isVisible
          ? "opacity-100 translate-y-0"
          : "opacity-0 -translate-y-full pointer-events-none",
      )}
      style={{
        backgroundColor: backgroundColor || "rgba(255,255,255,0.95)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
      }}
    >
      <div className="mx-auto w-full max-w-[1200px] px-6 py-2.5 flex items-center justify-between">
        <a
          href={creatorStoreUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity min-w-0"
        >
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={creatorAvatarUrl || undefined} />
            <AvatarFallback className="text-xs font-medium">{creatorInitials || "?"}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p
              className="text-[13px] font-semibold truncate"
              style={{ color: textColor || "var(--foreground)" }}
            >
              {creatorName}
            </p>
          </div>
        </a>
        <p
          className="text-[13px] text-right truncate max-w-[300px]"
          style={{ color: textColor ? `${textColor}99` : "rgb(107,114,128)" }}
        >
          {productTitle}
        </p>
      </div>
    </div>
  )
}
