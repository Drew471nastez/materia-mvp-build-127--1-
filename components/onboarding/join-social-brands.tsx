import type { ComponentType } from "react"
import type { IconType } from "react-icons"
import { FaBluesky } from "@/components/icons/brand/FaBluesky"
import { FaInstagram } from "@/components/icons/brand/FaInstagram"
import { FaLinkedin } from "@/components/icons/brand/FaLinkedin"
import { FaTiktok } from "@/components/icons/brand/FaTiktok"
import { FaXTwitter } from "@/components/icons/brand/FaXTwitter"
import { FaYoutube } from "@/components/icons/brand/FaYoutube"

/** Filled monochrome brand marks for join onboarding (Font Awesome Brands style). */
export const JOIN_SOCIAL_BRANDS: Record<"tiktok" | "instagram" | "youtube" | "bluesky" | "twitter" | "linkedin", IconType> = {
  tiktok: FaTiktok,
  instagram: FaInstagram,
  youtube: FaYoutube,
  bluesky: FaBluesky,
  twitter: FaXTwitter,
  linkedin: FaLinkedin,
}

export function JoinSocialBrandIcon({ id, className }: { id: keyof typeof JOIN_SOCIAL_BRANDS; className?: string }) {
  /* react-icons' type answers ReactNode, which the tests' loose compile refuses as a component; it always draws an <svg>. */
  const Icon = JOIN_SOCIAL_BRANDS[id] as unknown as ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  return <Icon className={className} aria-hidden />
}
