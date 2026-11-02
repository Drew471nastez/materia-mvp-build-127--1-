/**
 * The brand marks, from Simple Icons.
 *
 * These were hand-drawn: `<path d="M14.2 3v11.6a4.4 4.4 0 1 1-4.4-4.4…" />`,
 * my approximation of a TikTok note and a Twitch screen, in a codebase that
 * already depends on react-icons — which ships Simple Icons, the reference set
 * every brand takes its own mark from. Approximating a logo by eye is wrong in
 * the way a misspelt company name is wrong: nobody can say which curve is off,
 * everybody can see it is not the real one.
 *
 * `react-icons/si` is Simple Icons, so each mark here is the official
 * silhouette, kept up to date by that package rather than by whoever last
 * edited this file. The X mark in particular is a logo that changed in 2023;
 * the drawn-by-hand version was three strokes hoping to look like it.
 *
 * COLOUR STILL COMES FROM THE PAGE. Simple Icons are solid glyphs with no
 * stroke, and every one of them uses `currentColor` — so they take the colour
 * of the row they sit in: muted grey beside muted text, a creator's own text
 * colour on a themed storefront, legible on black and on white without anyone
 * passing a value. What was rejected before was brand-COLOURED marks, a row of
 * red and pink and blue blobs stamped across a header; a grey official
 * silhouette is not that.
 */

import { GenIcon, type IconType } from "react-icons"
import { FaLinkedin } from "react-icons/fa6"
/* The marks' trees, not `react-icons/si`: see components/social/simple-icon-marks.ts (round 48). */
import * as marks from "@/components/social/simple-icon-marks"

import type { SocialPlatformKey } from "@/lib/social/platforms"

export type PlatformIcon = ({
  size,
  color,
  className,
}: {
  size?: number
  color?: string
  className?: string
}) => React.JSX.Element

/**
 * Same call signature the hand-drawn set had — `size` and an optional `color`
 * — so every caller keeps working. `color` defaults to `currentColor`, which
 * is what the storefront's default icon style passes anyway; the `filled` and
 * `outlined` styles pass a contrast colour and still get it.
 */
/**
 * The cast is a react-icons v5 / React 19 typing mismatch, not a shrug.
 *
 * `IconType` is declared as returning `JSX.Element` from React 18's global JSX
 * namespace; React 19 moved that namespace onto `React.JSX`, so TypeScript
 * reports "'Icon' cannot be used as a JSX component" for a component that
 * renders perfectly. It is contained to this one line rather than sprinkled
 * over every call site, and it is the only reason `wrap` exists.
 */
type IconProps = { size?: number; color?: string; className?: string }

function wrap(Icon: IconType): PlatformIcon {
  const Mark = Icon as unknown as React.ComponentType<
    IconProps & { "aria-hidden"?: boolean; focusable?: boolean }
  >
  return function PlatformMark({ size = 24, color = "currentColor", className }) {
    return <Mark size={size} color={color} className={className} aria-hidden focusable={false} />
  }
}

export const SOCIAL_ICONS: Record<SocialPlatformKey, PlatformIcon> = {
  tiktok: wrap(GenIcon(marks.SiTiktok)),
  instagram: wrap(GenIcon(marks.SiInstagram)),
  facebook: wrap(GenIcon(marks.SiFacebook)),
  youtube: wrap(GenIcon(marks.SiYoutube)),
  linkedin: wrap(FaLinkedin),
  twitter: wrap(GenIcon(marks.SiX)),
  twitch: wrap(GenIcon(marks.SiTwitch)),
  spotify: wrap(GenIcon(marks.SiSpotify)),
}
