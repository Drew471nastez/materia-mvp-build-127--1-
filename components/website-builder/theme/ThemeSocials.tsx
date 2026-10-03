"use client"

/**
 * ===========================================================================
 *  THE STORE'S SOCIAL LINKS
 * ===========================================================================
 * The theme has one address per platform and two toggles saying where they
 * appear. Which platforms there are, and which addresses count, is decided
 * in lib/website-builder/social-links.ts; this file only draws them.
 *
 * Every icon is a glyph in `currentColor` on a 24 box, so they sit on any
 * scheme and line up with each other. lucide has the older brands; the rest
 * are drawn here rather than left out.
 */

import type { ComponentType } from "react"
import { Facebook, Github, Instagram, Linkedin, Twitch, Youtube } from "lucide-react"

import { socialLinks, type SocialKey, type SocialLink } from "@/lib/website-builder/social-links"
import type { ThemeSettingsValues } from "@/lib/website-builder/types"

type IconProps = { className?: string; style?: React.CSSProperties }

function glyph(d: string) {
  return function Glyph({ className, style }: IconProps) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden="true">
        <path d={d} />
      </svg>
    )
  }
}

const TikTok = glyph("M16.5 3a5.6 5.6 0 0 0 4.2 4.1v2.8a8.3 8.3 0 0 1-4.2-1.3v5.9a5.7 5.7 0 1 1-5.7-5.7c.3 0 .5 0 .8.1v2.9a2.8 2.8 0 1 0 2 2.7V3h2.9Z")
const XLogo = glyph("M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.3L5.3 21H2.2l7.2-8.3L1.8 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z")
const Pinterest = glyph("M12 2a10 10 0 0 0-3.6 19.3c-.1-.8-.2-2 0-2.8l1.2-5.1s-.3-.6-.3-1.5c0-1.4.8-2.5 1.9-2.5.9 0 1.3.7 1.3 1.5 0 .9-.6 2.2-.9 3.5-.2 1 .5 1.9 1.6 1.9 1.9 0 3.3-2 3.3-4.9 0-2.6-1.8-4.4-4.4-4.4-3 0-4.8 2.2-4.8 4.6 0 .9.3 1.8.8 2.4l-.3 1.3c-.1.2-.2.3-.4.2C6 15 5.3 13.2 5.3 11.8c0-3 2.2-5.8 6.4-5.8 3.3 0 5.9 2.4 5.9 5.6 0 3.4-2.1 6-5.1 6-1 0-2-.5-2.3-1.2l-.6 2.4c-.2.9-.8 2-1.2 2.6A10 10 0 1 0 12 2Z")
const Threads = glyph("M12.2 22C6.6 22 3 18.4 3 12S6.6 2 12.2 2c4.3 0 7.4 2.1 8.6 5.9l-2.3.7c-.9-2.8-3.1-4.3-6.3-4.3-4.3 0-6.7 2.8-6.7 7.7s2.4 7.7 6.7 7.7c3.1 0 5.4-1.5 5.4-4 0-1.4-.7-2.4-1.9-2.9-.3 2.6-1.9 4.1-4.4 4.1-2.2 0-3.8-1.3-3.8-3.2 0-2.1 1.8-3.4 4.6-3.4.6 0 1.1 0 1.6.1-.2-1.4-1-2-2.4-2-1 0-1.8.4-2.3 1.1L7.1 7.8C8 6.6 9.4 5.9 11.2 5.9c2.8 0 4.4 1.6 4.7 4.4 2.2.8 3.6 2.6 3.6 5 0 3.8-3.3 6.7-7.3 6.7Zm-.6-9.4c-1.6 0-2.4.5-2.4 1.3 0 .7.7 1.2 1.6 1.2 1.4 0 2.2-.9 2.3-2.4-.5-.1-1-.1-1.5-.1Z")
const Snapchat = glyph("M12 2.5c3 0 5.3 2.3 5.3 5.4v2.6l1.6-.5c.6-.2 1.2.4.8 1-.4.5-1.4.9-2.3 1.2.4 1.6 1.8 3.2 3.6 3.8.6.2.5 1-.1 1.2-.8.3-1.8.4-2.4.6-.2.6-.2 1.3-.9 1.3-.8 0-1.6-.4-2.7-.1-1 .3-1.8 1.5-3.9 1.5s-2.9-1.2-3.9-1.5c-1.1-.3-1.9.1-2.7.1-.7 0-.7-.7-.9-1.3-.6-.2-1.6-.3-2.4-.6-.6-.2-.7-1-.1-1.2 1.8-.6 3.2-2.2 3.6-3.8-.9-.3-1.9-.7-2.3-1.2-.4-.6.2-1.2.8-1l1.6.5V7.9c0-3.1 2.3-5.4 5.3-5.4Z")
const Bluesky = glyph("M6.3 3.8C8.6 5.5 11.1 9 12 10.9c.9-1.9 3.4-5.4 5.7-7.1 1.7-1.2 4.3-2.2 4.3.8 0 .6-.3 5-.5 5.7-.7 2.5-3.3 3.2-5.6 2.8 4 .7 5.1 3 2.9 5.3-4.2 4.3-6-1.1-6.5-2.5l-.3-.8-.3.8c-.5 1.4-2.3 6.8-6.5 2.5-2.2-2.3-1.2-4.6 2.9-5.3-2.3.4-4.9-.3-5.6-2.8C2.3 9.6 2 5.2 2 4.6c0-3 2.6-2 4.3-.8Z")
const WhatsApp = glyph("M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z")
const Discord = glyph("M19.3 5.4A16 16 0 0 0 15.4 4l-.2.4a13 13 0 0 1 3.5 1.7 12.6 12.6 0 0 0-10.4 0A13 13 0 0 1 11.8 4.4L11.6 4a16 16 0 0 0-3.9 1.4C5.2 9 4.5 12.5 4.8 16a16 16 0 0 0 4.8 2.4l.8-1.3a10 10 0 0 1-1.6-.8l.4-.3a11.4 11.4 0 0 0 9.7 0l.4.3a10 10 0 0 1-1.6.8l.8 1.3a16 16 0 0 0 4.8-2.4c.4-4-.7-7.5-2.9-10.6ZM9.7 14c-1 0-1.7-.9-1.7-1.9s.8-1.9 1.7-1.9 1.8.9 1.7 1.9c0 1-.7 1.9-1.7 1.9Zm4.6 0c-1 0-1.7-.9-1.7-1.9s.8-1.9 1.7-1.9 1.8.9 1.7 1.9c0 1-.7 1.9-1.7 1.9Z")

export const SOCIAL_ICONS: Record<SocialKey, ComponentType<IconProps>> = {
  social_instagram: Instagram,
  social_tiktok: TikTok,
  social_youtube: Youtube,
  social_twitter: XLogo,
  social_facebook: Facebook,
  social_linkedin: Linkedin,
  social_pinterest: Pinterest,
  social_threads: Threads,
  social_snapchat: Snapchat,
  social_bluesky: Bluesky,
  social_whatsapp: WhatsApp,
  social_discord: Discord,
  social_twitch: Twitch,
  social_github: Github,
}

/** The theme's links that have an address, each with its icon. */
export function themeSocials(theme: ThemeSettingsValues) {
  return withIcons(socialLinks(theme as Record<string, unknown>))
}

export function withIcons(links: SocialLink[]) {
  return links.map((l) => ({ ...l, Icon: SOCIAL_ICONS[l.key] }))
}

/** A row of icon links. Used by the header and the footer. */
export function SocialIconRow({
  links,
  className,
  size = 18,
  linkClassName,
  linkStyle,
}: {
  links: SocialLink[]
  className?: string
  size?: number
  linkClassName?: string
  linkStyle?: React.CSSProperties
}) {
  if (links.length === 0) return null
  return (
    <ul className={className} data-social-icons="">
      {withIcons(links).map(({ key, label, Icon, url }) => (
        <li key={key} className="flex">
          <a
            href={url}
            aria-label={label}
            target="_blank"
            rel="noreferrer noopener"
            className={linkClassName ?? "transition-opacity hover:opacity-70"}
            style={linkStyle}
          >
            <Icon className="shrink-0" style={{ width: size, height: size }} />
          </a>
        </li>
      ))}
    </ul>
  )
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
  if (!enabled) return null
  return (
    <SocialIconRow
      links={socialLinks(t)}
      className={["m-0 list-none p-0", className].filter(Boolean).join(" ")}
      size={size}
    />
  )
}

export default ThemeSocials
