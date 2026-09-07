"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import type { SocialLinksConfig } from "@/lib/store-builder/types"
import { SOCIAL_ICONS } from "@/components/social/platform-icons"
import { OFFERED_SOCIAL_PLATFORM_KEYS, LEGACY_SOCIAL_PLATFORM_KEYS } from "@/lib/social/platforms"

interface SocialMediaIconsProps {
  socialLinks?: SocialLinksConfig
  iconColor?: string
  iconStyle?: "default" | "filled" | "outlined"
  className?: string
  isPreviewMode?: boolean
  isMobile?: boolean
}

export function SocialMediaIcons({
  socialLinks,
  iconColor = "currentColor",
  iconStyle = "default",
  className,
  isPreviewMode = false,
  isMobile = false,
}: SocialMediaIconsProps) {
  if (!socialLinks) return null

  /**
   * SMALLER THAN IT WAS, because the marks changed shape.
   *
   * 20/24 was tuned for hand-drawn OUTLINES, which carry about as much ink as
   * the text beside them. These are Simple Icons — solid glyphs — and a solid
   * 24px mark next to 14px text reads as roughly twice its weight: on a
   * desktop storefront the Instagram square sat beside "1.2K Followers" like a
   * button rather than a mark.
   *
   * 18 desktop / 16 mobile puts the glyph at about the cap height of the row
   * it belongs to, which is where an inline mark sits.
   */
  const iconSize = isMobile ? 16 : 18

  /**
   * The order comes from lib/social/platforms, which is also the order the
   * editor lists them in — so the row on the page matches the form that filled
   * it. The legacy platforms come last: a creator who saved a Spotify link
   * before it stopped being offered keeps it until they clear it.
   */
  const platforms = [...OFFERED_SOCIAL_PLATFORM_KEYS, ...LEGACY_SOCIAL_PLATFORM_KEYS].map((key) => ({
    key,
    Icon: SOCIAL_ICONS[key],
  }))

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
            "p-2 rounded-full transition-opacity duration-150 ease-out",
            "hover:opacity-80",
            "flex items-center justify-center",
          ),
          style: { backgroundColor: iconColor, backdropFilter: "blur(4px)" as const },
          iconColor: iconColor === "#ffffff" ? "#000000" : "#ffffff", // Contrast color for icon
        }
      case "outlined":
        return {
          className: cn(
            "p-2 rounded-full transition-opacity duration-150 ease-out",
            "opacity-70 hover:opacity-100",
            "flex items-center justify-center",
            "border-2",
          ),
          style: { borderColor: iconColor, backdropFilter: "blur(4px)" as const },
          iconColor: iconColor,
        }
      default:
        return {
          /**
           * NO PADDING, NO SCALE, NO BACKGROUND ON HOVER.
           *
           * `p-2` put 8px of dead space around every mark, which is why the
           * gap after the dot divider in the meta row looked bigger than the
           * gap before it — the icon's own box was pushing it along. With the
           * padding gone the row's `gap-x-3` is the only spacing, so both
           * sides of the dot measure the same.
           *
           * Hover just darkens. The mark grew by 10% and grabbed a translucent
           * background, which is a lot of movement for something the size of a
           * word, and next to static text it read as a glitch. Opacity is the
           * whole effect, eased over 150ms.
           */
          className: cn(
            "flex items-center justify-center opacity-70 transition-opacity duration-150 ease-out",
            "hover:opacity-100",
          ),
          style: undefined,
          iconColor: iconColor,
        }
    }
  }

  const containerConfig = getContainerStyle()

  return (
    <div className={cn("flex items-center gap-3 flex-wrap", className)}>
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
