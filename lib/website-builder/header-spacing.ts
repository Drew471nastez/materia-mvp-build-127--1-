/**
 * ===========================================================================
 *  THE HEADER'S SPACING, IN PIXELS, WITH THE OLD VIEWPORT UNITS TRANSLATED
 * ===========================================================================
 * The header's vertical padding and the gap between its menu links were set
 * in `vw`. A viewport unit is one number that means a different thing on
 * every screen, and in the editor it is measured against the browser rather
 * than the canvas, so a phone preview inside a desktop browser got a
 * laptop's padding. The settings are pixels now, the padding one number per
 * device.
 *
 * VALUES, NOT KEY NAMES. The settings audit reads a renderer for a property
 * access ending in each id a panel offers; a helper that took the id as a
 * string would hide the read from it. `headerPad(s.vertical_padding,
 * s.vertical_padding_vw, "mobile")` is a read of both, the old one in the
 * fallback position the audit checks for.
 *
 * THE TRANSLATION. A `vw` somebody set is turned into what it came to on a
 * common screen: 1280px wide for the desktop, 390px for a phone. A header
 * keeps the padding it had rather than snapping to the default the moment
 * this shipped.
 */

export type Device = "desktop" | "tablet" | "mobile"

const DESKTOP_WIDTH = 1280
const PHONE_WIDTH = 390

export const PAD_DEFAULT: Record<Device, number> = { desktop: 16, tablet: 14, mobile: 12 }
export const GAP_DEFAULT = 18

function finite(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

/** A responsive value is `{desktop, tablet, mobile}`; a plain number is every device. */
function forDevice(value: unknown, device: Device): number | null {
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>
    const own = finite(o[device])
    if (own !== null) return own
    /* Tablet falls back to desktop, a phone to tablet, so a creator who set
       two numbers is not asked for a third. */
    if (device === "tablet") return finite(o.desktop)
    if (device === "mobile") return finite(o.tablet) ?? finite(o.desktop)
    return null
  }
  return finite(value)
}

export function headerPad(current: unknown, legacyVw: unknown, device: Device): number {
  const px = forDevice(current, device)
  if (px !== null) return Math.max(0, Math.round(px))
  const vw = finite(legacyVw)
  if (vw !== null) {
    const width = device === "mobile" ? PHONE_WIDTH : DESKTOP_WIDTH
    return Math.max(0, Math.round((vw * width) / 100))
  }
  return PAD_DEFAULT[device]
}

export function headerGap(current: unknown, legacyVw: unknown): number {
  const px = finite(current)
  if (px !== null) return Math.max(0, Math.round(px))
  const vw = finite(legacyVw)
  if (vw !== null) return Math.max(0, Math.round((vw * DESKTOP_WIDTH) / 100))
  return GAP_DEFAULT
}
