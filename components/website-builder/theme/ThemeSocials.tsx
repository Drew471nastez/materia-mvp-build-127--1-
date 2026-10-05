"use client"

/**
 * ===========================================================================
 *  THE STORE'S SOCIAL LINKS
 * ===========================================================================
 * The theme has one address per platform and two toggles saying where they
 * appear. Which platforms there are, and which addresses count, is decided
 * in lib/website-builder/social-links.ts; this file only draws them.
 *
 * Every icon is the platform's own filled mark (lib/website-builder/
 * social-icons.ts) in `currentColor` on a 24 box, so a row of them is one
 * colour, the colour of the text around it, on any scheme. Only the
 * platforms with an address are drawn, each a link named for its platform.
 */

import type { ComponentType } from "react"

import { SOCIAL_ICON_PATHS } from "@/lib/website-builder/social-icons"
import { SOCIAL_PLATFORMS, socialLinks, type SocialKey, type SocialLink } from "@/lib/website-builder/social-links"
import type { ThemeSettingsValues } from "@/lib/website-builder/types"

type IconProps = { className?: string; style?: React.CSSProperties }

function glyph(d: string) {
  return function Glyph({ className, style }: IconProps) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden="true" focusable="false">
        <path d={d} />
      </svg>
    )
  }
}

export const SOCIAL_ICONS = Object.fromEntries(
  SOCIAL_PLATFORMS.map((p) => [p.key, glyph(SOCIAL_ICON_PATHS[p.key])]),
) as Record<SocialKey, ComponentType<IconProps>>

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
      {withIcons(links).map(({ key, label, Icon, url }) => {
        /* An email link opens the mail app; a new tab for it is an empty tab. */
        const mail = url.startsWith("mailto:")
        return (
          <li key={key} className="flex">
            <a
              href={url}
              aria-label={label}
              title={label}
              data-social={key.replace(/^social_/, "")}
              target={mail ? undefined : "_blank"}
              rel={mail ? undefined : "noreferrer noopener"}
              className={linkClassName ?? "transition-opacity hover:opacity-70"}
              style={linkStyle}
            >
              <Icon className="shrink-0" style={{ width: size, height: size }} />
            </a>
          </li>
        )
      })}
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
