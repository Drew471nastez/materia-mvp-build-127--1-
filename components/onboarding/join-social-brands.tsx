import type { IconType } from "react-icons"
import { FaBluesky, FaInstagram, FaLinkedin, FaTiktok, FaXTwitter, FaYoutube } from "react-icons/fa6"

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
  const Icon = JOIN_SOCIAL_BRANDS[id]
  return <Icon className={className} aria-hidden />
}
