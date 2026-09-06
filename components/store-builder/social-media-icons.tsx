"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import type { SocialLinksConfig } from "@/lib/store-builder/types"

interface SocialMediaIconsProps {
  socialLinks?: SocialLinksConfig
  iconColor?: string
  iconStyle?: "default" | "filled" | "outlined"
  className?: string
  isPreviewMode?: boolean
  isMobile?: boolean
}

/**
 * OUTLINE MARKS, DRAWN IN `currentColor`.
 *
 * These were solid brand glyphs — Instagram and YouTube in particular render
 * as a filled rounded square, which beside a line of small grey text reads as
 * two black blobs stamped on the page. Stroked outlines sit at the same visual
 * weight as the text they share a row with.
 *
 * `currentColor` rather than a hex is the other half: the icons inherit the
 * colour of whatever they are inside, so they are grey on white, grey on
 * black, and they follow a creator's own text colour without anyone passing
 * one. A hardcoded `#111827` was invisible on a dark storefront.
 */
const strokeProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
}

const InstagramIcon = ({ size = 24 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps} xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
  </svg>
)

const TikTokIcon = ({ size = 24 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps} xmlns="http://www.w3.org/2000/svg">
    {/* stem + hook, and the note head as an open circle */}
    <path d="M14.2 3v11.6a4.4 4.4 0 1 1-4.4-4.4c.3 0 .6 0 .9.1" />
    <path d="M14.2 3.2c.4 2.5 2.4 4.4 4.9 4.6" />
  </svg>
)

const YouTubeIcon = ({ size = 24 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps} xmlns="http://www.w3.org/2000/svg">
    <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
    <path d="M10.4 9.6 15.2 12l-4.8 2.4z" />
  </svg>
)

const TwitterXIcon = ({ size = 24 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps} xmlns="http://www.w3.org/2000/svg">
    <path d="M4 4l7.6 9.1L4.6 20" />
    <path d="M9.2 4h-5l10.9 16h5L9.2 4z" />
    <path d="M14.1 11.2 19.6 4" />
  </svg>
)

const SpotifyIcon = ({ size = 24 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps} xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9.2" />
    <path d="M7.3 9.4c3-.8 6.4-.5 9.1 1" />
    <path d="M7.9 12.4c2.5-.6 5.2-.4 7.4.9" />
    <path d="M8.6 15.3c2-.5 4.1-.3 5.9.7" />
  </svg>
)

export function SocialMediaIcons({
  socialLinks,
  iconColor = "currentColor",
  iconStyle = "default",
  className,
  isPreviewMode = false,
  isMobile = false,
}: SocialMediaIconsProps) {
  if (!socialLinks) return null

  // ✅ +2px bigger on desktop (total +4px from original):
  // original: mobile 18 / desktop 20
  // previous: mobile 20 / desktop 22
  // now:      mobile 20 / desktop 24
  const iconSize = isMobile ? 20 : 24

  const platforms = [
    { key: "instagram" as const, Icon: InstagramIcon },
    { key: "tiktok" as const, Icon: TikTokIcon },
    { key: "youtube" as const, Icon: YouTubeIcon },
    { key: "twitter" as const, Icon: TwitterXIcon },
    { key: "spotify" as const, Icon: SpotifyIcon },
  ]

  /**
   * A URL IS THE WHOLE CONDITION. It used to also require `enabled`, a second
   * per-platform switch on top of the master one — so a creator could type
   * their Instagram in, save, and see nothing, with two different toggles able
   * to be the reason and neither of them visible from the page.
   *
   * Filling the field in is the creator saying "show this"; clearing it is
   * them saying "don't". There is nothing else to get wrong.
   */
  const enabledPlatforms = platforms.filter(({ key }) => !!socialLinks[key]?.url?.trim())

  if (enabledPlatforms.length === 0) return null

  // Get container styles based on icon style
  const getContainerStyle = () => {
    switch (iconStyle) {
      case "filled":
        return {
          className: cn(
            "p-2 rounded-full transition-all",
            "hover:opacity-80 hover:scale-110",
            "flex items-center justify-center",
          ),
          style: { backgroundColor: iconColor, backdropFilter: "blur(4px)" as const },
          iconColor: iconColor === "#ffffff" ? "#000000" : "#ffffff", // Contrast color for icon
        }
      case "outlined":
        return {
          className: cn(
            "p-2 rounded-full transition-all",
            "hover:bg-white/20 hover:scale-110",
            "flex items-center justify-center",
            "border-2",
          ),
          style: { borderColor: iconColor, backdropFilter: "blur(4px)" as const },
          iconColor: iconColor,
        }
      default:
        return {
          className: cn(
            "p-2 rounded-full transition-all",
            "hover:bg-white/20 hover:scale-110",
            "flex items-center justify-center",
          ),
          style: { backdropFilter: "blur(4px)" as const },
          iconColor: iconColor,
        }
    }
  }

  const containerConfig = getContainerStyle()

  return (
    <div className={cn("flex items-center gap-0.5 flex-wrap", className)}>
      {enabledPlatforms.map(({ key, Icon }) => {
        const link = socialLinks[key]
        if (!link?.url) return null

        const content = (
          <div
            className={containerConfig.className}
            style={containerConfig.style}
          >
            <Icon color={containerConfig.iconColor} size={iconSize} />
          </div>
        )

        if (isPreviewMode) {
          return (
            <div key={key} className="cursor-pointer">
              {content}
            </div>
          )
        }

        return (
          <Link key={key} href={link.url} target="_blank" rel="noopener noreferrer" aria-label={`Visit ${key}`}>
            {content}
          </Link>
        )
      })}
    </div>
  )
}
