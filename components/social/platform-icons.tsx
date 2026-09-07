/**
 * One mark per platform, drawn once.
 *
 * These used to live inside components/store-builder/social-media-icons.tsx,
 * where only the storefront could reach them — so the edit-profile dialog
 * labelled its fields with the words "Instagram", "TikTok" instead. A creator
 * picked their links from a list of words and then saw a row of marks on their
 * page, with nothing tying the two together.
 *
 * Same marks in both places now: what you choose in the dialog is the thing
 * that appears on the page.
 *
 * OUTLINES IN `currentColor`, not solid brand glyphs. Instagram and YouTube in
 * particular render as a filled rounded square, which beside a line of small
 * grey text reads as two black blobs stamped on the page. Stroked outlines sit
 * at the same visual weight as the text they share a row with — and inheriting
 * the colour means they are grey on white, grey on black, and they follow a
 * creator's own text colour without anyone passing one.
 */

import type { SocialPlatformKey } from "@/lib/social/platforms"

const strokeProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
}

export type PlatformIcon = ({ size }: { color?: string; size?: number }) => React.JSX.Element

const InstagramIcon: PlatformIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps} xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
  </svg>
)

const TikTokIcon: PlatformIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps} xmlns="http://www.w3.org/2000/svg">
    {/* stem + hook, and the note head as an open circle */}
    <path d="M14.2 3v11.6a4.4 4.4 0 1 1-4.4-4.4c.3 0 .6 0 .9.1" />
    <path d="M14.2 3.2c.4 2.5 2.4 4.4 4.9 4.6" />
  </svg>
)

const YouTubeIcon: PlatformIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps} xmlns="http://www.w3.org/2000/svg">
    <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
    <path d="M10.4 9.6 15.2 12l-4.8 2.4z" />
  </svg>
)

const TwitterXIcon: PlatformIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps} xmlns="http://www.w3.org/2000/svg">
    <path d="M4 4l7.6 9.1L4.6 20" />
    <path d="M9.2 4h-5l10.9 16h5L9.2 4z" />
    <path d="M14.1 11.2 19.6 4" />
  </svg>
)

const FacebookIcon: PlatformIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps} xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9.2" />
    {/* the f: descender, crossbar, and the shoulder that turns into the hook */}
    <path d="M13.3 21V12.4h2.2" />
    <path d="M10.5 12.4h2.8" />
    <path d="M13.3 12.4V9.6c0-1 .5-1.6 1.6-1.6h1" />
  </svg>
)

const LinkedInIcon: PlatformIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps} xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="18" height="18" rx="4.5" />
    <path d="M7.6 10.9v5.6" />
    <circle cx="7.6" cy="7.8" r="0.95" fill="currentColor" stroke="none" />
    <path d="M11.4 16.5v-5.6" />
    <path d="M11.4 13.2a2.2 2.2 0 0 1 4.4 0v3.3" />
  </svg>
)

const TwitchIcon: PlatformIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps} xmlns="http://www.w3.org/2000/svg">
    <path d="M4.6 3h14.8v10.2l-3.9 3.9h-3.1L9.3 20H7.2v-2.9H4.6z" />
    <path d="M11.6 7.4v4.1" />
    <path d="M15.4 7.4v4.1" />
  </svg>
)

const SpotifyIcon: PlatformIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps} xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9.2" />
    <path d="M7.3 9.4c3-.8 6.4-.5 9.1 1" />
    <path d="M7.9 12.4c2.5-.6 5.2-.4 7.4.9" />
    <path d="M8.6 15.3c2-.5 4.1-.3 5.9.7" />
  </svg>
)

export const SOCIAL_ICONS: Record<SocialPlatformKey, PlatformIcon> = {
  tiktok: TikTokIcon,
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  youtube: YouTubeIcon,
  linkedin: LinkedInIcon,
  twitter: TwitterXIcon,
  twitch: TwitchIcon,
  spotify: SpotifyIcon,
}
