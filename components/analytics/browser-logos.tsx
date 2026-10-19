/**
 * FULL-COLOUR BROWSER LOGOS for Analytics' Browsers list. A one-colour
 * silhouette of Chrome or Safari does not read as Chrome or Safari at 14px;
 * these are drawn in each browser's own colours: Chrome's three segments
 * round a blue hub, Safari's blue compass with its red and white needle,
 * Firefox's orange-to-violet flame, Edge's blue-to-green wave and Samsung
 * Internet's violet planet. Each fits a 24 by 24 box.
 */
import * as React from "react"
import { BRAND_MARKS } from "./brand-marks"

export const COLOUR_BROWSERS = new Set(["chrome", "safari", "firefox", "edge", "samsung"])

export function BrowserLogo({ name, size = 14 }: { name: string; size?: number }) {
  const id = React.useId().replace(/[:]/g, "")
  if (name === "chrome") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
        <circle cx="12" cy="12" r="11" fill="#fff" />
        <path fill="#DB4437" d="M2.47 6.50A11 11 0 0 1 21.53 6.50L12.00 6.80A5.2 5.2 0 0 0 7.50 14.60Z" />
        <path fill="#F4B400" d="M21.53 6.50A11 11 0 0 1 12.00 23.00L16.50 14.60A5.2 5.2 0 0 0 12.00 6.80Z" />
        <path fill="#0F9D58" d="M12.00 23.00A11 11 0 0 1 2.47 6.50L7.50 14.60A5.2 5.2 0 0 0 16.50 14.60Z" />
        <circle cx="12" cy="12" r="5.2" fill="#fff" />
        <circle cx="12" cy="12" r="4.1" fill="#4285F4" />
      </svg>
    )
  }
  if (name === "safari") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
        <defs>
          <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#19D7FF" />
            <stop offset="1" stopColor="#1E64F0" />
          </linearGradient>
        </defs>
        <circle cx="12" cy="12" r="11" fill={`url(#${id}s)`} />
        <circle cx="12" cy="12" r="9.2" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth=".6" strokeDasharray=".5 1.4" />
        <path d="M12 12 17.6 6.4 13.4 13.4Z" fill="#FF3B30" />
        <path d="M12 12 6.4 17.6 10.6 10.6Z" fill="#fff" />
        <path d="M17.6 6.4 13.4 13.4 6.4 17.6 10.6 10.6Z" fill="none" stroke="#000" strokeOpacity=".08" strokeWidth=".3" />
      </svg>
    )
  }
  if (name === "samsung") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
        <circle cx="12" cy="12" r="11" fill="#7C65FF" />
        <circle cx="12" cy="12" r="4.6" fill="#fff" />
        <ellipse cx="12" cy="12" rx="8.6" ry="3" fill="none" stroke="#fff" strokeWidth="1.3" transform="rotate(-28 12 12)" />
      </svg>
    )
  }
  /* Firefox and Edge: their own shape (./brand-marks), filled with the logo's gradient. */
  const mark = BRAND_MARKS[name]
  if (!mark) return null
  const stops = name === "firefox" ? ["#FFBD4F", "#FF7139", "#E31587", "#9059FF"] : ["#35C1F1", "#1A86D4", "#36B37E", "#4ACF6E"]
  return (
    <svg viewBox={mark.vb} width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          {stops.map((c, i) => (
            <stop key={i} offset={i / (stops.length - 1)} stopColor={c} />
          ))}
        </linearGradient>
      </defs>
      <path d={mark.d} fill={`url(#${id}g)`} />
    </svg>
  )
}
