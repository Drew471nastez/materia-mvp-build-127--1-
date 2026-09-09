"use client"

/**
 * ===========================================================================
 *  THE STORE'S SOCIAL LINKS
 * ===========================================================================
 * The theme has ten of them and two toggles saying where they appear. Four of
 * the links — Discord, Pinterest, Twitch, GitHub — and BOTH toggles were read
 * by nothing, so "Show icons in header" was a switch with no wire behind it
 * and half the platforms a creator could enter had nowhere to appear.
 */

import { Facebook, Github, Instagram, Linkedin, Twitch, Twitter, Youtube } from "lucide-react"

import type { ThemeSettingsValues } from "@/lib/website-builder/types"

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback
}

/** Neither is in lucide, so both are drawn rather than left out. */
function TikTok({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.5 3a5.6 5.6 0 0 0 4.2 4.1v2.8a8.3 8.3 0 0 1-4.2-1.3v5.9a5.7 5.7 0 1 1-5.7-5.7c.3 0 .5 0 .8.1v2.9a2.8 2.8 0 1 0 2 2.7V3h2.9Z" />
    </svg>
  )
}
function Discord({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M19.3 5.4A16 16 0 0 0 15.4 4l-.2.4a13 13 0 0 1 3.5 1.7 12.6 12.6 0 0 0-10.4 0A13 13 0 0 1 11.8 4.4L11.6 4a16 16 0 0 0-3.9 1.4C5.2 9 4.5 12.5 4.8 16a16 16 0 0 0 4.8 2.4l.8-1.3a10 10 0 0 1-1.6-.8l.4-.3a11.4 11.4 0 0 0 9.7 0l.4.3a10 10 0 0 1-1.6.8l.8 1.3a16 16 0 0 0 4.8-2.4c.4-4-.7-7.5-2.9-10.6ZM9.7 14c-1 0-1.7-.9-1.7-1.9s.8-1.9 1.7-1.9 1.8.9 1.7 1.9c0 1-.7 1.9-1.7 1.9Zm4.6 0c-1 0-1.7-.9-1.7-1.9s.8-1.9 1.7-1.9 1.8.9 1.7 1.9c0 1-.7 1.9-1.7 1.9Z" />
    </svg>
  )
}
function Pinterest({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-3.6 19.3c-.1-.8-.2-2 0-2.8l1.2-5.1s-.3-.6-.3-1.5c0-1.4.8-2.5 1.9-2.5.9 0 1.3.7 1.3 1.5 0 .9-.6 2.2-.9 3.5-.2 1 .5 1.9 1.6 1.9 1.9 0 3.3-2 3.3-4.9 0-2.6-1.8-4.4-4.4-4.4-3 0-4.8 2.2-4.8 4.6 0 .9.3 1.8.8 2.4l-.3 1.3c-.1.2-.2.3-.4.2C6 15 5.3 13.2 5.3 11.8c0-3 2.2-5.8 6.4-5.8 3.3 0 5.9 2.4 5.9 5.6 0 3.4-2.1 6-5.1 6-1 0-2-.5-2.3-1.2l-.6 2.4c-.2.9-.8 2-1.2 2.6A10 10 0 1 0 12 2Z" />
    </svg>
  )
}

const PLATFORMS = [
  { key: "social_instagram", label: "Instagram", Icon: Instagram },
  { key: "social_twitter", label: "X", Icon: Twitter },
  { key: "social_facebook", label: "Facebook", Icon: Facebook },
  { key: "social_tiktok", label: "TikTok", Icon: TikTok },
  { key: "social_youtube", label: "YouTube", Icon: Youtube },
  { key: "social_linkedin", label: "LinkedIn", Icon: Linkedin },
  { key: "social_discord", label: "Discord", Icon: Discord },
  { key: "social_pinterest", label: "Pinterest", Icon: Pinterest },
  { key: "social_twitch", label: "Twitch", Icon: Twitch },
  { key: "social_github", label: "GitHub", Icon: Github },
] as const

export function themeSocials(theme: ThemeSettingsValues) {
  const t = theme as Record<string, unknown>
  return PLATFORMS.map((p) => ({ ...p, url: str(t[p.key]) })).filter((p) => !!p.url)
}

export function ThemeSocials({
  theme,
  where,
  className,
  size = 18,
}: {
  theme: ThemeSettingsValues
  /** Which toggle decides whether these show at all. */
  where: "header" | "footer"
  className?: string
  size?: number
}) {
  const t = theme as Record<string, unknown>
  const enabled = where === "header" ? t.social_show_in_header === true : t.social_show_in_footer !== false
  const links = themeSocials(theme)
  if (!enabled || links.length === 0) return null

  return (
    <div className={className}>
      {links.map(({ key, label, Icon, url }) => (
        <a
          key={key}
          href={url}
          aria-label={label}
          target="_blank"
          rel="noreferrer noopener"
          className="transition-opacity hover:opacity-70"
        >
          <Icon className="shrink-0" {...{ style: { width: size, height: size } }} />
        </a>
      ))}
    </div>
  )
}

export default ThemeSocials
