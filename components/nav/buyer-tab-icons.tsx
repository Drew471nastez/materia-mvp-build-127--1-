/**
 * ===========================================================================
 *  SEARCH AND PROFILE, FOR THE BUYER'S TAB BAR
 * ===========================================================================
 * The bar shows the page you are on as a FILLED icon (components/nav/tab-
 * lens.tsx NavIcon cross fades an outline into a solid). That works for a
 * house, a stack of books and a person, which have an inside to fill. It
 * does not work for a magnifying glass.
 *
 * SEARCH. Solar's bold magnifier is a solid disc with a handle: at 24px on a
 * phone it read as a black blob, "the fill of the search icon is messed up,
 * full black". A filled lens is not what a phone's own tab bar draws either;
 * the lens stays glass. So the active Search is the same glass drawn heavier
 * (2.25 against the outline's 1.5, the handle with it) with the faintest
 * tint of ink inside the rim: the weight says "you are here" the way the
 * other tabs' fill does, and the lens still reads as a lens. The outline is
 * Solar's own magnifier, on the same 24 unit box, so the pair cross fades
 * without the glass moving.
 *
 * PROFILE is a person, not the photo: "the photo is in the header bar up
 * there". Solar's `user`, a head and shoulders, outline at rest and solid
 * when you are on it, the same family and weight as Library.
 *
 * Checked at 1x, 2x and 3x beside the rest of the bar by scripts/check-
 * buyer-tab-bar.mjs (shots named icons-*).
 */

import type React from "react"

import { UserIcon as PersonLinear } from "@solar-icons/react/linear/user"
import { UserIcon as PersonBold } from "@solar-icons/react/bold/user"

import type { NavIconPair } from "@/components/app/sidebar-desktop-nav"

type IconProps = {
  size?: number
  strokeWidth?: number
  style?: React.CSSProperties
  className?: string
  "data-variant"?: string
}

/** Solar's magnifier: the lens and the handle, centred where Solar centres them. */
const LENS = { cx: 11.5, cy: 11.5, r: 9.5 }
const HANDLE_D = "M18.5 18.5L22 22"

function SearchLineIcon({ size = 24, strokeWidth = 1.5, style, className, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} className={className} {...rest}>
      <circle {...LENS} stroke="currentColor" strokeWidth={strokeWidth} />
      <path d={HANDLE_D} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  )
}

/**
 * The lens a little smaller, so the heavier rim stays inside the same box as
 * the outline's (9.5 + 0.75 there, 9.1 + 1.125 here), and the handle drawn
 * from the rim's new edge.
 */
const HEAVY = 2.25
const TINT = 0.12
function SearchActiveIcon({ size = 24, style, className, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} className={className} {...rest}>
      <circle cx={LENS.cx} cy={LENS.cy} r={9.1} fill="currentColor" fillOpacity={TINT} stroke="currentColor" strokeWidth={HEAVY} />
      <path d="M18.3 18.3L21.6 21.6" stroke="currentColor" strokeWidth={HEAVY + 0.25} strokeLinecap="round" />
    </svg>
  )
}

export const SEARCH_ICONS: NavIconPair = { line: SearchLineIcon, fill: SearchActiveIcon }
export const PERSON_ICONS: NavIconPair = { line: PersonLinear, fill: PersonBold }
