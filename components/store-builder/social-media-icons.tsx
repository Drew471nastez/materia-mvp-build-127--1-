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

// SVG Icons for social platforms
const InstagramIcon = ({ color = "#ffffff", size = 24 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 2C14.717 2 15.056 2.01 16.122 2.06C17.187 2.11 17.912 2.277 18.55 2.525C19.21 2.779 19.766 3.123 20.322 3.678C20.8305 4.1779 21.224 4.78259 21.475 5.45C21.722 6.087 21.89 6.813 21.94 7.878C21.987 8.944 22 9.283 22 12C22 14.717 21.99 15.056 21.94 16.122C21.89 17.187 21.722 17.912 21.475 18.55C21.2247 19.2178 20.8311 19.8226 20.322 20.322C19.822 20.8303 19.2173 21.2238 18.55 21.475C17.913 21.722 17.187 21.89 16.122 21.94C15.056 21.987 14.717 22 12 22C9.283 22 8.944 21.99 7.878 21.94C6.813 21.89 6.088 21.722 5.45 21.475C4.78233 21.2245 4.17753 20.8309 3.678 20.322C3.16941 19.8222 2.77593 19.2175 2.525 18.55C2.277 17.913 2.11 17.187 2.06 16.122C2.013 15.056 2 14.717 2 12C2 9.283 2.01 8.944 2.06 7.878C2.11 6.812 2.277 6.088 2.525 5.45C2.77524 4.78218 3.1688 4.17732 3.678 3.678C4.17767 3.16923 4.78243 2.77573 5.45 2.525C6.088 2.277 6.812 2.11 7.878 2.06C8.944 2.013 9.283 2 12 2ZM12 7C10.6739 7 9.40215 7.52678 8.46447 8.46447C7.52678 9.40215 7 10.6739 7 12C7 13.3261 7.52678 14.5979 8.46447 15.5355C9.40215 16.4732 10.6739 17 12 17C13.3261 17 14.5979 16.4732 15.5355 15.5355C16.4732 14.5979 17 13.3261 17 12C17 10.6739 16.4732 9.40215 15.5355 8.46447C14.5979 7.52678 13.3261 7 12 7ZM18.5 6.75C18.5 6.41848 18.3683 6.10054 18.1339 5.86612C17.8995 5.6317 17.5815 5.5 17.25 5.5C16.9185 5.5 16.6005 5.6317 16.3661 5.86612C16.1317 6.10054 16 6.41848 16 6.75C16 7.08152 16.1317 7.39946 16.3661 7.63388C16.6005 7.8683 16.9185 8 17.25 8C17.5815 8 17.8995 7.8683 18.1339 7.63388C18.3683 7.39946 18.5 7.08152 18.5 6.75ZM12 9C12.7956 9 13.5587 9.31607 14.1213 9.87868C14.6839 10.4413 15 11.2044 15 12C15 12.7956 14.6839 13.5587 14.1213 14.1213C13.5587 14.6839 12.7956 15 12 15C11.2044 15 10.4413 14.6839 9.87868 14.1213C9.31607 13.5587 9 12.7956 9 12C9 11.2044 9.31607 10.4413 9.87868 9.87868C10.4413 9.31607 11.2044 9 12 9Z"
      fill={color}
    />
  </svg>
)

const TikTokIcon = ({ color = "#ffffff", size = 24 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M19.59 6.69C18.5609 6.29965 17.6475 5.66004 16.93 4.83C16.3106 4.05174 15.9201 3.12112 15.8 2.14V2H12.45V15.38C12.4506 15.9162 12.2912 16.4403 11.9929 16.8847C11.6945 17.3291 11.2709 17.6729 10.7756 17.8721C10.2803 18.0713 9.73581 18.1169 9.21415 18.003C8.69248 17.889 8.21802 17.621 7.85198 17.2347C7.48594 16.8483 7.24503 16.3614 7.16019 15.8361C7.07534 15.3108 7.15026 14.7722 7.37559 14.291C7.60093 13.8098 7.96679 13.4081 8.42443 13.1368C8.88207 12.8655 9.4104 12.7368 9.94 12.7668V9.37C8.78561 9.26287 7.62698 9.46984 6.58455 9.96792C5.54212 10.466 4.65367 11.2371 4.01005 12.2009C3.36644 13.1647 2.9914 14.2861 2.92327 15.4458C2.85515 16.6056 3.09651 17.7613 3.62255 18.7907C4.14858 19.82 4.94008 20.6857 5.91716 21.3033C6.89423 21.9209 8.02239 22.2677 9.18393 22.3082C10.3455 22.3487 11.4971 22.0815 12.5185 21.5339C13.5399 20.9863 14.3943 20.1775 15 19.19C15.7044 18.0516 16.0702 16.7376 16.0545 15.4001L16.05 8.79C17.3914 9.87316 19.023 10.5231 20.74 10.66V7.35C20.3384 7.20024 19.9555 7.00374 19.6 6.76L19.59 6.69Z"
      fill={color}
    />
  </svg>
)

const YouTubeIcon = ({ color = "#ffffff", size = 24 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M23.498 6.186C23.3625 5.69357 23.0997 5.24611 22.7357 4.88863C22.3717 4.53116 21.9192 4.27583 21.424 4.148C19.505 3.6 12 3.6 12 3.6C12 3.6 4.495 3.6 2.576 4.148C2.08076 4.27583 1.62825 4.53116 1.26425 4.88863C0.900253 5.24611 0.637466 5.69357 0.502 6.186C0 8.07 0 12 0 12C0 12 0 15.93 0.502 17.814C0.637466 18.3064 0.900253 18.7539 1.26425 19.1114C1.62825 19.4688 2.08076 19.7242 2.576 19.852C4.495 20.4 12 20.4 12 20.4C12 20.4 19.505 20.4 21.424 19.852C21.9192 19.7242 22.3717 19.4688 22.7357 19.1114C23.0997 18.7539 23.3625 18.3064 23.498 17.814C24 15.93 24 12 24 12C24 12 24 8.07 23.498 6.186ZM9.6 15.6V8.4L15.837 12L9.6 15.6Z"
      fill={color}
    />
  </svg>
)

const TwitterXIcon = ({ color = "#ffffff", size = 24 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M18.244 2.25H21.552L14.325 10.51L22.827 21.75H16.17L10.956 14.933L4.99 21.75H1.68L9.41 12.915L1.254 2.25H8.08L12.793 8.481L18.244 2.25ZM17.083 19.77H18.916L7.084 4.126H5.117L17.083 19.77Z"
      fill={color}
    />
  </svg>
)

const SpotifyIcon = ({ color = "#ffffff", size = 24 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 0C5.4 0 0 5.4 0 12C0 18.6 5.4 24 12 24C18.6 24 24 18.6 24 12C24 5.4 18.66 0 12 0ZM17.521 17.34C17.281 17.699 16.801 17.82 16.44 17.58C13.62 15.84 10.081 15.48 5.921 16.44C5.52 16.56 5.16 16.26 5.04 15.9C4.92 15.5 5.22 15.14 5.58 15.02C10.14 13.98 14.1 14.4 17.22 16.38C17.58 16.56 17.7 17.1 17.52 17.34H17.521ZM18.961 14.04C18.66 14.46 18.12 14.64 17.7 14.34C14.46 12.36 9.54 11.76 5.76 12.9C5.28 13.02 4.74 12.78 4.62 12.3C4.5 11.82 4.74 11.28 5.22 11.16C9.6 9.9 15.06 10.56 18.78 12.84C19.14 13.08 19.32 13.68 18.96 14.04H18.961ZM19.081 10.68C15.24 8.4 8.88 8.16 5.16 9.3C4.56 9.48 3.96 9.12 3.78 8.58C3.6 7.98 3.96 7.38 4.5 7.2C8.88 5.88 15.9 6.18 20.34 8.82C20.88 9.12 21.06 9.84 20.76 10.38C20.46 10.8 19.74 10.98 19.2 10.68H19.081Z"
      fill={color}
    />
  </svg>
)

export function SocialMediaIcons({
  socialLinks,
  iconColor = "#ffffff",
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

  const enabledPlatforms = platforms.filter(({ key }) => socialLinks[key]?.enabled && socialLinks[key]?.url)

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
