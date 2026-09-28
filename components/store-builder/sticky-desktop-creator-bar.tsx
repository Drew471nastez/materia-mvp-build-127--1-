"use client"

import { useState, useEffect } from "react"
import { AppAvatar } from "@/components/app/app-avatar"
import { cn } from "@/lib/utils"

interface StickyDesktopCreatorBarProps {
  creatorName: string
  creatorAvatarUrl: string | null
  creatorStoreUrl: string
  productTitle: string
  textColor?: string
  backgroundColor?: string
}

export function StickyDesktopCreatorBar({
  creatorName,
  creatorAvatarUrl,
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
          {/*
            THE BAR IS THE CREATOR'S OWN COLOUR, so the circle is a tenth of
            the text it sits beside rather than the shared light grey, which
            on a dark bar was a bright disc. The photo, else the initials,
            else a plain person: never a "?", and never an empty ring while
            the photo is on its way.
          */}
          <AppAvatar
            src={creatorAvatarUrl}
            name={(creatorName || "").trim()}
            alt=""
            size={32}
            markWhileLoading
            style={textColor ? { backgroundColor: `${textColor}1f`, color: textColor } : undefined}
          />
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
