/**
 * THE WEBSITE AND SOCIAL PAGES AS ICONS (round 33). Each network's own mark
 * (the join onboarding's brand set, components/onboarding/join-social-brands.tsx,
 * with the networks it does not have), in ink on a quiet grey disc, a 40px
 * target each; a website is a globe. No hooks, so the server's sheet and the
 * Page editor's picker both draw them.
 */
import type { ComponentType } from "react"
import type { IconType } from "react-icons"
import { FaDiscord, FaFacebook, FaSpotify, FaTelegram, FaThreads, FaTwitch, FaWhatsapp } from "react-icons/fa6"
import { Globe } from "lucide-react"
import { JOIN_SOCIAL_BRANDS } from "@/components/onboarding/join-social-brands"
import { cn } from "@/lib/utils"
import type { SocialLinkView, SocialNetwork } from "@/lib/communities/social-links"

const BRANDS: Record<Exclude<SocialNetwork, "website">, IconType> = {
  instagram: JOIN_SOCIAL_BRANDS.instagram,
  tiktok: JOIN_SOCIAL_BRANDS.tiktok,
  youtube: JOIN_SOCIAL_BRANDS.youtube,
  x: JOIN_SOCIAL_BRANDS.twitter,
  linkedin: JOIN_SOCIAL_BRANDS.linkedin,
  facebook: FaFacebook,
  discord: FaDiscord,
  telegram: FaTelegram,
  whatsapp: FaWhatsapp,
  spotify: FaSpotify,
  twitch: FaTwitch,
  threads: FaThreads,
}

export function SocialIcon({ network, className }: { network: SocialNetwork; className?: string }) {
  if (network === "website") return <Globe aria-hidden className={className} strokeWidth={1.8} />
  /* react-icons' type answers ReactNode; it always draws an <svg>. */
  const Icon = BRANDS[network] as unknown as ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  return <Icon aria-hidden className={className} />
}

/** Round 26: `sm` is the info card's size, a 32px disc on a computer (still a 40px target under a thumb). */
export function SocialLinks({ links, className, size = "md" }: { links: SocialLinkView[]; className?: string; size?: "md" | "sm" }) {
  if (!links.length) return null
  const sm = size === "sm"
  return (
    <ul className={cn("flex flex-wrap items-center", sm ? "gap-1" : "gap-1.5", className)} data-community-links="">
      {links.map((l) => (
        <li key={l.url}>
          <a
            href={l.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            aria-label={l.label}
            title={l.label}
            data-community-link={l.network}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full bg-[#f1f2f4] text-[#1a1a2e] outline-none transition-colors duration-150 hover:bg-[#e6e8eb] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 [-webkit-tap-highlight-color:transparent]",
              sm ? "[@media(pointer:fine)]:h-8 [@media(pointer:fine)]:w-8" : "sm:h-9 sm:w-9",
            )}
          >
            <SocialIcon network={l.network} className={sm ? "h-4 w-4" : "h-[18px] w-[18px]"} />
          </a>
        </li>
      ))}
    </ul>
  )
}
